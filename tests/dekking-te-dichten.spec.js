/* v323: EEN DEKKINGSGAT DAT NIET DEZE MAAND VALT, VRAAGT AANDACHT EN GEEN BESLISSING.
   HET GEMELDE GEVAL: EUR 37 op de reserveringsrekening en een boete van EUR 299 eenmalig in november
   stond rood onder 'Vraagt een beslissing' met EUR 262 tekort. v322 maakte dat afhankelijk van een
   gemeten stortingstempo, en op het toestel ging er niets naar die rekening, dus het bleef rood.
   DE KEUZE VAN DE GEBRUIKER: alleen een post in de LOPENDE maand is een beslissing; elke latere post
   met een gat is aandacht, met het bedrag per maand erbij. En de lopende maand telt mee: op
   3 oktober zijn er voor november twee maanden, dus EUR 131 per maand.
   DE KLOK STAAT OP 3 OKTOBER 2026, de dag van de melding. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', RES = 'NL01RESV0000007586';
const DAG = '2026-10-03';
const NOV = '2026-11';

function seed(o) {
  o = o || {};
  const tx = [];
  ['2026-07', '2026-08', '2026-09', '2026-10'].forEach((m, i) => {
    tx.push({ id: 'i' + i, date: m + '-01', amount: 4200, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  });
  // EEN boeking op de reserveringsrekening, ver terug: anders staat hij niet in allAccounts(). Er
  // gaat dus GEEN maandelijks bedrag naartoe, en dat is precies de stand van het toestel.
  tx.push({ id: 'r0', date: '2026-07-08', amount: 37, acc: RES, name: 'Reservering', desc: 'NAAR RESERVERING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4200, bufferNorm: 2, budgetMonth: '2026-10',
    manualBal: { [MAIN]: 3000, [RES]: 37 },
    resAcc: RES, resCheck: '2026-10',
    reserveringen: [{ id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: o.maand || NOV, intervalM: 0 }],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await pinDatum(page, (o && o.dag) || DAG);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof dekkingDichten === 'function');
}
const lees = (page) => page.evaluate(() => {
  const D = dekking(12);
  const r = maandRegels().find((x) => x.key === 'dekking');
  go('maand'); renderMaand();
  /* v340: de kaarten 'Vraagt een beslissing' en 'Vraagt aandacht' zijn weg; het oordeel is de kleur
     van de tegel (rood = beslissing, amber = aandacht), en naam en bedrag staan in de sheet erachter. */
  const t = document.querySelector('#s-maand [data-tegel="dekking"]');
  let sheet = '';
  if (t) { openMaandBeslis('dekking'); sheet = document.querySelector('#sheet').innerText; closeSheet(); }
  return { gat: D.gat, status: r.status, eenheid: r.eenheid, gevolg: r.gevolg, perMaandTot: r.perMaandTot,
    dmt: doelMaandenTot(D.gat ? D.gat.maand : ''), DD: D.gat ? dekkingDichten(D) : null,
    kleur: t ? t.dataset.kleur : null, sheet };
});

/* ===== a) het gemelde geval ===== */
test.describe('a · EUR 37 en EUR 299 in november, op 3 oktober', () => {
  test('de invoer: gat EUR 262, en er gaat geen maandbedrag naar de rekening', async ({ page }) => {
    await boot(page);
    const r = await lees(page);
    expect(r.gat.tekort).toBe(262);
    expect(r.gat.maand).toBe(NOV);
    expect(r.dmt).toBe(1);                 // de bestaande telling zegt een maand
  });
  test('de lopende maand telt mee: twee maanden, EUR 131 per maand', async ({ page }) => {
    await boot(page);
    const r = await lees(page);
    expect(r.DD.maanden).toBe(2);
    expect(r.DD.perMaand).toBe(131);
    expect(r.status).toBe('let op');
    expect(r.eenheid).toContain('€131 per maand tot november');
    expect(r.perMaandTot).toEqual({ bedrag: 131, maand: NOV });
    expect(r.gevolg).toContain('Dat is €131 per maand tot november, deze maand meegeteld.');
  });
  test('op het scherm: een amber tegel (aandacht) en geen rode (beslissing)', async ({ page }) => {
    await boot(page);
    const r = await lees(page);
    expect(r.kleur).toBe('amber');
    expect(r.sheet).toContain('Dekking reserveringen');
    // v324: het bedrag en zijn eenheid op twee regels, nu in de sheet achter de tegel
    expect(r.sheet).toMatch(/€131\s+per maand tot november/);
  });
});

/* ===== b) de post valt in de lopende maand ===== */
test('b · dezelfde post in de lopende maand is een beslissing', async ({ page }) => {
  await boot(page, { maand: '2026-10' });
  const r = await lees(page);
  expect(r.dmt).toBe(0);
  expect(r.status).toBe('tekort');
  expect(r.gevolg).toContain('Die post valt deze maand');
  expect(r.kleur).toBe('rood');
  expect(r.sheet).toContain('Dekking reserveringen');
});

/* ===== c) de grootte van het gat beslist niet meer ===== */
test.describe('c · elke latere post is aandacht, hoe groot het gat ook is', () => {
  test('EUR 29.963 tekort volgende maand is aandacht, met het bedrag per maand', async ({ page }) => {
    await boot(page, { set: { reserveringen: [{ id: 'p1', naam: 'Dak', bedrag: 30000, vervalmaand: NOV, intervalM: 0 }] } });
    const r = await lees(page);
    expect(r.gat.tekort).toBe(29963);
    expect(r.status).toBe('let op');
    expect(r.eenheid).toContain('€14.982 per maand tot november');
  });
  test('een post ver weg deelt over alle maanden tot dan, deze meegeteld', async ({ page }) => {
    await boot(page, { maand: '2027-01' });
    const r = await lees(page);
    expect(r.dmt).toBe(3);
    expect(r.DD.maanden).toBe(4);
    expect(r.DD.perMaand).toBe(66);   // ceil(262/4)
    expect(r.status).toBe('let op');
  });
});

/* ===== d) wat niet verandert ===== */
test.describe('d · ok blijft ok, en de oude tempo-toets is weg', () => {
  test('een pot die de post dekt staat goed', async ({ page }) => {
    await boot(page, { set: { manualBal: { [MAIN]: 3000, [RES]: 400 } } });
    const r = await lees(page);
    expect(r.gat).toBeNull();
    expect(r.status).toBe('ok');
    expect(r.perMaandTot).toBeNull();
  });
  test('resStortTempo bestaat niet meer, en de status leest geen stortingen', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof window.resStortTempo)).toBe('undefined');
  });
});
