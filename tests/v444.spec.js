/* v444 (gevraagd door de gebruiker). (1) De huur telt niet dubbel in de forecast: een verwachte woningtermijn in een maand vervalt
   zodra er in die maand een boeking is die bij die woning hoort, op IBAN of naam, of als boeking in Huur (op het potje Huur) vanaf de
   ingangsmaand van de woning die geen andere vaste post in Huur is (woningBetaling). GEMELD: de huur van 19-10 (EUR 300) stond in Huur,
   deel vast, en blok 20 punt 2 verwachtte er nog EUR 300 bovenop. Dezelfde regel per salarisperiode in blok 23: de termijn van 1-11
   blijft, want november heeft nog geen betaling. (2) Uitgaven zonder woning: elke woning in de maanden dat hij je woning was (Ml
   Macnack t/m aug 2026, Nathaniel Cathalina vanaf okt 2026), met een controle per maand in blok 20. GECONSTRUEERDE fixture op de stand
   van v432 (19 okt); de toestelgetallen (vast verwacht EUR 1.324, forecast EUR 2.831, EUR 264 onder budget) verifieert de gebruiker. */
const { test, expect } = require('@playwright/test');
const S432 = require('./v432-stand');
const CATH = 'NL77ABNA0599037806';
const MAC = { '2026-04': 850, '2026-05': 900, '2026-06': 750, '2026-07': 675, '2026-08': 675 };

async function boot(page, o = {}) {
  await S432.boot(page, { dag: o.dag || '2026-10-19' });
  return await page.evaluate(({ CATH, MAC, o, LEEF }) => {
    const add = (t, cat) => { categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; };
    const t0 = { typ: '', ref: '', src: 'csv', accName: '', acc: LEEF };
    for (const [m, b] of Object.entries(MAC)) add(Object.assign({ id: 'mac' + m, date: m + '-01', amount: -b, name: 'Ml Macnack', desc: 'OVERBOEKING ML MACNACK HUUR', refNums: [] }, t0), 'huur');
    add(Object.assign({ id: 'ca09', date: '2026-09-28', amount: -300, name: 'Nathaniel Cathalina via SEPA iDEAL/Wero', desc: 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO ' + CATH + ' HUUR', refNums: ['506417344'] }, t0));
    // de huur van oktober: een overboeking die niet op IBAN of naam matcht, door jou in Huur gezet
    if (o.okt !== false) add(Object.assign({ id: 'okt19', date: o.oktDatum || '2026-10-19', amount: -(o.oktBedrag || 300), name: o.oktNaam || 'Huur woning', desc: o.oktDesc || 'OVERBOEKING HUUR OKTOBER', refNums: [] }, t0), o.oktCat === undefined ? 'huur' : o.oktCat);
    const mk = 'woning|' + recurKey(TX.find((t) => t.name === 'Ml Macnack'));
    SET.kennis = SET.kennis || {}; SET.kennis[mk] = { soort: 'woning', partij: 'Ml Macnack', wat: 'Woonhuur (gestopt)', ja: true, tx: [], bron: 'jij', op: '2026-06-01', zaad: 'macnack' };
    SET.kennis425 = Object.assign(SET.kennis425 || {}, { macnack: '2026-06-01' });
    SET.budgets = Object.assign({}, SET.budgets, { huur: 700 });
    kennisZaai(); if (o.wonDag) SET.kennis['woning|' + ibanNum(CATH)].dag = o.wonDag; save(); try { buildAccMeta(); } catch (_) {}
    const WF = woningForecast('2026-10'), L = monthLiquidity();
    const P = rekVoorstel(), won = [...(P.vast || []), ...(P.vastBuiten || [])].find((x) => x.woning);
    const b20 = diagSalarisVerdeling().join('\n');
    return { WF, wonFix: (L.fixDueItems || []).filter((x) => x.woning).map((x) => x.amount), wonData: won ? won.data : null, b20 };
  }, { CATH, MAC, o, LEEF: S432.LEEF });
}

test('1a. de huur van oktober in Huur telt als betaald: geen tweede verwachte termijn in oktober', async ({ page }) => {
  const r = await boot(page);
  expect(r.WF.actief).toBe(true);
  expect(r.WF.betaald).toBe(300);
  expect(r.WF.nog).toBe(0);
  expect(r.wonFix).toEqual([]);
});

test('1b. zonder betaling in oktober staat de termijn er wel (de tegenproef)', async ({ page }) => {
  const r = await boot(page, { okt: false });
  expect(r.WF.nog).toBe(300);
  expect(r.wonFix).toEqual([300]);
});

test('1c. een andere vaste post in Huur of een klein bedrag laat de termijn staan', async ({ page }) => {
  const r = await boot(page, { oktBedrag: 71, oktNaam: 'Shurgard', oktDesc: 'SEPA INCASSO SHURGARD' });
  expect(r.WF.betaald).toBe(0);
  expect(r.WF.nog).toBe(300);
});

test('1d. op naam: een betaling buiten Huur met de naam van de woning telt ook', async ({ page }) => {
  const r = await boot(page, { oktNaam: 'N Cathalina', oktDesc: 'OVERBOEKING N CATHALINA OKT', oktCat: null });
  expect(r.WF.betaald).toBe(300);
  expect(r.WF.nog).toBe(0);
});

test('1e. blok 23: de termijn van 1-11 blijft staan, een in oktober niet', async ({ page }) => {
  const r = await boot(page);
  expect(r.wonData).toContain('2026-11-01');
  expect((r.wonData || []).some((d) => String(d).startsWith('2026-10'))).toBe(false);
});

test('1f. blok 23 op de stortingsdag: een termijn op de 28e vervalt na een betaling eerder in die periode en maand', async ({ page }) => {
  const met = await boot(page, { dag: '2026-10-26', wonDag: 28, oktDatum: '2026-10-26' });
  expect((met.wonData || []).some((d) => String(d).startsWith('2026-10'))).toBe(false);
  const zonder = await boot(page, { dag: '2026-10-26', wonDag: 28, okt: false });
  expect(zonder.wonData).toContain('2026-10-28');   // de tegenproef: zonder betaling staat de termijn van oktober er wel
  const nov = await boot(page, { dag: '2026-10-26', oktDatum: '2026-10-26' });
  expect(nov.wonData).toContain('2026-11-01');   // een betaling in oktober laat de termijn van november staan, ook in dezelfde periode
});

test('2. uitgaven zonder woning: elke woning in zijn eigen maanden, met de controle per maand', async ({ page }) => {
  const r = await boot(page);
  const regel = r.b20.split('\n').find((l) => /waarvan woning:/.test(l));
  for (const b of Object.values(MAC)) expect(regel).toMatch(new RegExp('\\b' + String(b) + '\\b'));
  const ctl = r.b20.split('\n').find((l) => /CONTROLE woningen per maand/.test(l));
  expect(ctl).toMatch(/apr Ml Macnack 850 = 850/);
  expect(ctl).toMatch(/aug Ml Macnack 675 = 675/);
  expect(ctl).toMatch(/sep geen woning = 0/);
  expect(ctl).toMatch(/okt Nathaniel Cathalina 300 = 300/);
});
