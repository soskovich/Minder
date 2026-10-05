/* v324: DE OORZAAK VAN EEN BUFFER OP 'LET OP' NOEMT DE GRENS DIE HIJ NIET HAALT.
 * Boven zijn norm is een buffer amber om iets anders dan de norm, en de lijstregel zei toch "je norm
 * is 2" bij een buffer van 3 maanden: een grens die hij wel haalt. Twee gevallen, in de volgorde van de
 * gevolgzin:
 *   (b) er is meer toegewezen dan er op de spaarrekening staat (besluit 2 van v305): de oorzaak noemt
 *       dat verschil, en rechts staat dat verschil als bedrag, OOK bij een vol doel (dan heeft
 *       maandTekort() geen gat en stond er rechts niets);
 *   (a) anders, onder het richtbedrag: "nu N maanden, je richtbedrag is M".
 * Onder de norm blijft het de norm, want dan is dat de grens die knelt.
 * v340: de lijstregel onder 'Vraagt aandacht' is een amber TEGEL (`[data-tegel="buffer"]`), en de
 * oorzaak en het bedrag staan in de sheet erachter (`[data-sheetbedrag]`). Die leest deze spec nu.
 * DE GETALLEN ZIJN GEMETEN OP DEZE FIXTURE: essCrisis is EUR 1.140 (huur 900 plus boodschappen,
 * verlaagd met de crisispercentages), en elk blok meet die invoer voordat het de uitkomst toetst.
 */
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum, DAGEN_OVER } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
const NU = vasteDatum(DAGEN_OVER);
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [4, 3, 2, 1, 0].map((k) => ym(new Date(NU.getFullYear(), NU.getMonth() - k, 1)));
const PLUS = (n) => ym(new Date(NU.getFullYear(), NU.getMonth() + n, 1));
const ESS = 1140;

function seed(set) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m, k) => {
    add(m, '03', 4000, 'Werkgever', 'SALARIS LOON');
    add(m, '04', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '05', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    if (k === 0) add(m, '06', 600, 'Spaarpot', 'NAAR SPAREN', SAV);
  });
  const s = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4000, limit: 70, nfToegewezenMigrated: 1,
    savingsEnds: ['4323'], manualBal: { [MAIN]: 3000, [SAV]: 30000 },
    budgets: { huur: 900, boodschappen: 400 }, budgetMonth: MS[MS.length - 1],
    savingMode: 'amount', savingAmount: 2200, reserveringen: [], goals: [],
  }, set);
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(s),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, set, w) {
  if (w) await page.setViewportSize({ width: w, height: w === 360 ? 640 : 844 });
  await pinDag(page);
  await page.addInitScript((s) => { for (const k in s) localStorage.setItem(k, s[k]); }, seed(set));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.renderMaand === 'function');
  await page.evaluate(() => { go('maand'); renderMaand(); });
}
const lees = (page) => page.evaluate(() => {
  const r = maandRegels().find((x) => x.key === 'buffer');
  // v340: de regel is een tegel; amber is 'let op', en oorzaak en bedrag staan in de sheet erachter
  const tegel = document.querySelector('#s-maand [data-tegel="buffer"]');
  let oorzaak = '', bedrag = [];
  if (tegel) {
    openMaandBeslis('buffer');
    const sh = document.querySelector('#sheet');
    const o = sh.querySelector('.small.muted');
    oorzaak = o ? o.innerText : '';
    const b = sh.querySelector('[data-sheetbedrag]');
    bedrag = b ? b.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : [];
    closeSheet();
  }
  return { status: r.status, maanden: r.maanden, norm: r.norm, richt: nfMaanden(), ess: Math.round(noodfondsModel().essCrisis),
    doel: Math.round(noodfondsModel().doel), teller: bufferTeller(), TB: toewijzingBovenSaldo(), gat: maandTekort(r),
    rij: !!tegel && tegel.dataset.kleur === 'amber', oorzaak, bedrag };
});

/* (a) norm 2, richtbedrag 6, toegewezen drie maanden: boven de norm, onder het richtbedrag */
const A = { bufferNorm: 2, nfMaanden: 6, nfToegewezen: 3 * ESS, nfDoelVast: 6 * ESS };
/* (b) een vol doel (toegewezen = doel) terwijl er minder op de spaarrekening staat dan het plan toewijst */
const B = { bufferNorm: 1, nfMaanden: 3, nfToegewezen: 6750, nfDoelVast: 6750,
  manualBal: { [MAIN]: 3000, [SAV]: 5000 },
  goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 15000, gespaard: 1000, streefdatum: PLUS(14), allocMode: 'auto' }] };

test.describe('a · boven de norm en onder het richtbedrag', () => {
  test('de invoer: drie maanden tegen een norm van twee en een richtbedrag van zes, geen toewijzing boven het saldo', async ({ page }) => {
    await boot(page, A);
    const r = await lees(page);
    expect(r.ess).toBe(ESS);
    expect(Math.round(r.maanden * 10) / 10).toBe(3);
    expect(r.norm).toBe(2);
    expect(r.richt).toBe(6);
    expect(r.TB).toBeNull();
    expect(r.status).toBe('let op');
  });
  test('de oorzaak noemt het richtbedrag, en niet de norm die hij haalt', async ({ page }) => {
    await boot(page, A);
    const r = await lees(page);
    expect(r.rij).toBe(true);
    expect(r.oorzaak).toBe('nu 3 maanden, je richtbedrag is 6');
    expect(r.oorzaak).not.toContain('norm');
    // het bedrag blijft het gat naar het richtbedrag, uit maandTekort()
    expect(r.gat).toEqual({ bedrag: 3 * ESS, soort: 'totaal' });
    expect(r.bedrag).toEqual(['€3.420', 'tot je richtbedrag']);
  });
});

test.describe('b · meer toegewezen dan er op de spaarrekening staat', () => {
  test('de invoer: een vol doel, en EUR 2.750 meer toegewezen dan er staat', async ({ page }) => {
    await boot(page, B);
    const r = await lees(page);
    expect(r.teller).toBe(r.doel);              // vol: maandTekort() heeft geen gat
    expect(r.gat).toBeNull();
    expect(r.TB.verschil).toBe(2750);
    expect(r.maanden).toBeGreaterThan(r.norm);  // boven de norm, dus de toewijzing is de reden
    expect(r.status).toBe('let op');
  });
  test('de oorzaak noemt het verschil en rechts staat dat verschil als bedrag', async ({ page }) => {
    await boot(page, B);
    const r = await lees(page);
    expect(r.oorzaak).toBe('€2.750 minder op je spaarrekening dan toegewezen');
    expect(r.bedrag).toEqual(['€2.750', 'meer toegewezen']);
    // in de sheet staat hetzelfde bedrag, uit dezelfde bron
    await page.locator('#s-maand [data-tegel="buffer"]').click();
    const sb = (await page.locator('#sheet [data-sheetbedrag="buffer"]').innerText()).replace(/\s+/g, ' ').trim();
    expect(sb).toBe('€2.750 meer toegewezen');
    expect(await page.locator('#sheet').innerText()).toContain('Tot je die keuze maakt telt je buffer niet als vol.');
  });
  test('de toewijzing wint van het richtbedrag, in dezelfde volgorde als de gevolgzin', async ({ page }) => {
    // onder het richtbedrag EN boven het saldo: de oorzaak noemt de toewijzing
    await boot(page, Object.assign({}, B, { nfMaanden: 9, nfDoelVast: 9 * ESS }));
    const r = await lees(page);
    expect(r.maanden).toBeLessThan(r.richt);
    expect(r.TB).not.toBeNull();
    expect(r.oorzaak).toContain('minder op je spaarrekening dan toegewezen');
  });
});

test('c · onder de norm blijft de oorzaak de norm', async ({ page }) => {
  await boot(page, { bufferNorm: 4, nfMaanden: 6, nfToegewezen: 3 * ESS, nfDoelVast: 6 * ESS });
  const r = await page.evaluate(() => maandRegels().find((x) => x.key === 'buffer'));
  expect(r.status).toBe('tekort');
  expect(r.oorzaak).toBe('nu 3 maanden, je norm is 4');
  expect(r.bovenSaldo).toBeNull();
});
/* De laatste sabotage bleef eerst groen: de fixture van c had geen toewijzing boven het saldo, dus
   een bovenSaldo die ook onder de norm vuurt was niet te zien (meetles a). Dit geval draagt beide. */
test('c · onder de norm met een toewijzing boven het saldo: de norm, en het gat naar het richtbedrag', async ({ page }) => {
  await boot(page, { bufferNorm: 4, nfMaanden: 6, nfToegewezen: 3 * ESS, nfDoelVast: 6 * ESS,
    manualBal: { [MAIN]: 3000, [SAV]: 2000 } });
  const r = await page.evaluate(() => { const x = maandRegels().find((y) => y.key === 'buffer');
    return { status: x.status, oorzaak: x.oorzaak, bovenSaldo: x.bovenSaldo, TB: toewijzingBovenSaldo(), deel: maandBeslisDeel(x) }; });
  expect(r.TB).not.toBeNull();
  expect(r.status).toBe('tekort');
  expect(r.oorzaak).toBe('nu 3 maanden, je norm is 4');
  expect(r.bovenSaldo).toBeNull();
  expect(r.deel.eenheid).toBe('tot je richtbedrag');
});

/* v340: blok d (de hoogte van de kaart 'Vraagt aandacht', 118px) is vervallen, want die kaart bestaat
   niet meer: de buffer is een tegel op Grip. */
