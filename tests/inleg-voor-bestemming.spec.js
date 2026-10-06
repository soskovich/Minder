// v216: a.per stond achter het noodfonds en de bestemmingen in de waterval. Wees je op Plan meer
// toe dan je restsaldo groot is, dan bleef er nul over voor je inleg: de pot groeide alleen nog op
// rendement, "Nieuwe inleg" verdween uit de samenstelling en je hele restsaldo landde als vlakke
// cash. Dat geval was nergens getest, want de v212-fixture had een vol noodfonds en bestemmingen
// die ruim binnen het restsaldo pasten.
// De regel: een spaardoel is een voornemen, een periodieke inleg naar een bezitting is een feit.
// Een voornemen hoort een feit niet te verdringen. Tweede reden en die is categorisch: fase A
// haalt reserveringen en doelen eraf omdat dat geld NIET mag compounderen; a.per gaat naar een
// belegging en hoort juist wél te compounderen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum } = require('./vaste-dag');

/* v310: DE FIXTURE LEEST DEZELFDE DAG ALS DE PAGINA. `pinDag()` zet de klok van de pagina, maar
     deze regel bouwt de datums in Node, en met de echte klok lopen de twee dan uiteen: de app denkt
     dag dim-7 en de fixture schrijft dag 1. Dat is een NIEUWE scheiding die de pin zelf maakt, en
     ze is gemeten: met alleen de pin gingen er in deze groep drie tests rood die eerst groen waren. */
const now = vasteDatum();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';
const BINNENKORT = ym(new Date(now.getFullYear(), now.getMonth() + 3, 1));

// De gemelde opstelling: twee potten met rendement en inleg, drie standen zonder rendement.
const OPSTELLING = [
  { id: 'a1', naam: 'Peaks pensioen', waarde: 3219, grow: true, rend: 6, per: 200 },
  { id: 'a2', naam: 'Peaks Kayani', waarde: 420, grow: true, rend: 6, per: 50 },
  { id: 'a3', naam: 'Holding', waarde: 45000, grow: true },
  { id: 'a4', naam: 'Zakelijk spaargeld', waarde: 20000, grow: true },
  { id: 'a5', naam: 'Lease restwaarde', waarde: 12000, grow: true },
];

/* De kern van de fixture: savingAmount 2500 naast een restsaldo van 1900. planCapacity() verdeelt
   dan 2500 over de doelen terwijl er 1900 binnenkomt, dus de bestemmingen vragen meer dan er is.
   Dat is precies de situatie waarin de oude volgorde de inleg op nul zette. */
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '25', 4000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('v' + m, MAIN, m, '08', -400, 'Diversen', 'BEA, BETAALPAS DIVERSEN');
    add('s' + m, SPAAR, m, '26', 500, 'Spaarpot', 'NAAR SPAREN');
    add('r' + m, RES, m, '10', 300, 'Reserveringen', 'NAAR RESERVERINGEN');
  }
  const vol = o.nfVol !== false;
  const set = {
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
    /* v310: HET SPAARSALDO VOLGT DE TOEWIJZING, want `vol` betekent dat het noodfonds vol is en
       `fireInputs()` leest daarvoor het SALDO en niet de toewijzing (v216/v305). Met 2.000 op de
       rekening naast een toewijzing van 8.000 vulde het noodfonds zich in de projectie nog drie
       maanden, en `wens` telt de spaardoelen pas mee vanaf het JAAR waarin het vol is
       (`year < volYear ? 0 : _doel`). GEMETEN met fixture en klok uitgelijnd: op 24 september groen
       (drie maanden is december, hetzelfde jaar) en op 24 oktober rood (januari 2027, een ander
       jaar). De fixture droeg dus iets anders dan zijn eigen `vol` zegt, en de kalender besliste
       welke van de twee je zag. */
    manualBal: { [MAIN]: 1579, [SPAAR]: vol ? 8000 : 2000, [RES]: 0 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: o.savingAmount != null ? o.savingAmount : 2500,
    savingsAcc: { [SPAAR]: true }, resAcc: RES,
    nfDoelVast: vol ? 8000 : 40000,
    nfToegewezen: vol ? 8000 : 2000, nfToegewezenMigrated: true,
    goals: [{ id: 'g1', naam: 'Nieuwe auto', doel: 15000, gespaard: 1000, mode: 'fixed', perMaand: 300 }],
    reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 300, vervalmaand: BINNENKORT, intervalM: 12 }],
    assets: o.assets || OPSTELLING, reis: o.reis || {},
  };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await pinDag(page);                                   // v310: voor de goto, anders leest de boot de echte klok
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof reisModel === 'function');
}
const zet = (page, assets) => page.evaluate((as) => { SET.assets = as; save(); }, assets);
const zonderPer = (as) => as.map((a) => Object.assign({}, a, { per: 0 }));

const model = (page) => page.evaluate(() => {
  const M = reisModel();
  const post = (n, y) => { const p = M.assetParts.find((x) => x.naam === n); return p ? Math.round(p.series[y] || 0) : null; };
  const laag = (k, y) => { const p = M.assetParts.find((x) => x.kind === k); return p ? Math.round(p.series[y] || 0) : null; };
  return {
    HZ: M.HZ, nowY: M.nowY,
    bezit: M.bezit, bestemming: M.bestemming, vrij: M.freed.vrij, volYear: M.freed.volYear,
    pNu: Math.round(M.pmtFor(M.nowY)),
    posten: M.assetParts.map((p) => p.naam),
    peaks5: post('Peaks pensioen', 5), peaksHZ: post('Peaks pensioen', M.HZ),
    kayani5: post('Peaks Kayani', 5),
    cash5: laag('cash', 5), cashHZ: laag('cash', M.HZ), onv0: M.sim.onverdeeld0, opz: M.opzij,
    mid5: Math.round(M.mid[5]), midHZ: Math.round(M.mid[M.HZ]),
    assets5: Math.round(M.assets[5]), assetsHZ: Math.round(M.assets[M.HZ]),
    som5: Math.round(M.assetParts.reduce((s, p) => s + (p.series[5] || 0), 0)),
    somHZ: Math.round(M.assetParts.reduce((s, p) => s + (p.series[M.HZ] || 0), 0)),
  };
});
const waterval = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = reisRestsaldo(reisModel()).inleg;
  return d.textContent.replace(/\s+/g, ' ').trim();
});

test.describe('a - KRITIEK: de inleg komt aan, ook als de bestemmingen het restsaldo opslokken', () => {
  test('a.per wordt volledig toegekend en niet op nul geklemd', async ({ page }) => {
    await boot(page);
    const m = await model(page);
    expect(m.bezit.wens).toBe(250);
    expect(m.bezit.eff).toBe(250);
    expect(m.bezit.geklemd).toBe(false);
  });

  test('de pot groeit met de inleg erin, niet alleen op rendement', async ({ page }) => {
    await boot(page);
    const met = await model(page);
    await zet(page, zonderPer(OPSTELLING));
    const zonder = await model(page);
    // zonder inleg groeit de pot alleen op zijn rendement; met inleg hoort daar vijf jaar bij te komen
    expect(met.peaks5 - zonder.peaks5).toBeGreaterThan(200 * 12 * 5 * 0.9);
    expect(met.kayani5).toBeGreaterThan(zonder.kayani5);
  });

  test('en de vlakke laag houdt alleen wat er blijft staan, niet de inleg', async ({ page }) => {
    await boot(page);
    const met = await model(page);
    await zet(page, zonderPer(OPSTELLING));
    const zonder = await model(page);
    // v347: de vlakke laag houdt alleen wat er blijft staan. Nieuwe auto heeft geen streefdatum, dus
    // hij vult zich tot zijn doel (15.000, met 1.000 al gespaard) en daarna gaat er niets meer heen;
    // de tandarts wordt elk jaar betaald. Met of zonder de inleg eindigt de vlakke laag dus op
    // hetzelfde doel, op hoogstens een jaarbetaling van de tandarts na: de 250 per maand gaat naar
    // de pot en niet, zoals tot v346, vijf jaar lang als vlakke cash erbij.
    expect(Math.abs(zonder.cash5 - met.cash5)).toBeLessThan(300);
    const start = 1579 + 8000 + 0;
    // v348: plus wat Plan in de lopende maand verdeelt. Plan telt die maand niet mee voor een doel (v316),
    // dus in de projectie staat dat bedrag vlak. De rest van de marge is de tandarts in de maanden dat Plan
    // alles opzij gezette opmaakt: die wordt dan uit de vlakke laag betaald. Hier is niets vlak over:
    // je instelling vraagt meer dan je restsaldo, dus alles gaat opzij.
    expect(met.opz.bron).toBe('instelling');
    expect(met.opz.vlak).toBe(0);
    expect(met.onv0).toBeGreaterThan(0);
    expect(Math.abs(met.cash5 - (start + 15000 - 1000 + met.onv0))).toBeLessThan(300);
  });
});

test.describe('b - de volgorde is inhoudelijk en staat op het scherm', () => {
  test('de inleg is stap 1, het noodfonds stap 2', async ({ page }) => {
    await boot(page);
    const t = await waterval(page);
    expect(t).toContain('1Inleg per bezitting');
    expect(t).toContain('2Noodfonds');
    expect(t.indexOf('Inleg per bezitting')).toBeLessThan(t.indexOf('Noodfonds'));
    expect(t.indexOf('Noodfonds')).toBeLessThan(t.indexOf('Reserveringen'));
    expect(t.indexOf('Reserveringen')).toBeLessThan(t.indexOf('Spaardoelen'));
  });

  test('de stap noemt de bezittingen waar het geld heen gaat', async ({ page }) => {
    await boot(page);
    const t = await waterval(page);
    expect(t).toContain('Peaks pensioen en Peaks Kayani');
    expect(t).toContain('€250/mnd');
  });

  test('zonder inleg per bezitting staat de stap er niet, en telt het noodfonds weer als 1', async ({ page }) => {
    await boot(page);
    await zet(page, zonderPer(OPSTELLING));
    const t = await waterval(page);
    expect(t).not.toContain('Inleg per bezitting');
    expect(t).toContain('1Noodfonds');
  });
});

test.describe('c - de klem is omgedraaid en wordt gemeld', () => {
  test('nu komen de bestemmingen tekort, niet de inleg', async ({ page }) => {
    await boot(page);
    const m = await model(page);
    expect(m.bestemming.geklemd).toBe(true);
    expect(m.bestemming.nu).toBeLessThan(m.bestemming.wens);
    expect(m.bezit.geklemd).toBe(false);
  });

  test('het scherm zegt het, met beide bedragen en waar je het aanpast', async ({ page }) => {
    await boot(page);
    const t = await waterval(page);
    expect(t).toContain('Je bestemmingen passen niet in je restsaldo');
    // v346: de tandarts (EUR 300 per jaar) kost de projectie EUR 25 per maand en niet de EUR 100 van de
    // bruto maandlast (300 over drie maanden), dus de bestemmingen vragen 2.500 + 25.
    expect(t).toContain('van €2.525');
    expect(t).toContain('Op Plan is dus meer toegewezen dan er binnenkomt');
  });

  test('passen ze wel, dan staat er geen regel', async ({ page }) => {
    await boot(page, { savingAmount: 500 });
    const m = await model(page);
    expect(m.bestemming.geklemd).toBe(false);
    expect(await waterval(page)).not.toContain('Je bestemmingen passen niet');
  });

  test('is je inleg groter dan je hele restsaldo, dan klemt die alsnog en zegt de app dat ook', async ({ page }) => {
    await boot(page, { assets: [{ id: 'a1', naam: 'Grote pot', waarde: 1000, grow: true, rend: 5, per: 4000 }] });
    const m = await model(page);
    expect(m.bezit.geklemd).toBe(true);
    expect(m.bezit.eff).toBeLessThan(m.bezit.wens);
    expect(await waterval(page)).toContain('Inleg per bezitting past niet');
  });
});

test.describe('d - er ontstaat en verdwijnt niets', () => {
  test('de opbouw telt op tot de bezittingen, op vijf jaar en op het eind', async ({ page }) => {
    await boot(page);
    const m = await model(page);
    expect(m.som5).toBe(m.assets5);
    expect(m.somHZ).toBe(m.assetsHZ);
  });

  test('dat blijft gelden zonder inleg en met een vol noodfonds', async ({ page }) => {
    await boot(page, { nfVol: false });
    let m = await model(page);
    expect(m.somHZ).toBe(m.assetsHZ);
    await zet(page, zonderPer(OPSTELLING));
    m = await model(page);
    expect(m.somHZ).toBe(m.assetsHZ);
  });

  test('bij zelf invullen wordt er nog steeds niets van je eigen bedrag afgehaald', async ({ page }) => {
    await boot(page, { reis: { inlegMode: 'manual', pmt: 700 } });
    const m = await model(page);
    expect(m.bezit.wens).toBe(0);
    expect(m.pNu).toBe(700);
  });
});

test.describe('e - layout', () => {
  for (const w of [360, 390]) {
    test(`de waterval past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page);
      await page.evaluate(() => go('vermogen'));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
