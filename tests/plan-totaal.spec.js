// v221: per doel zag je toegewezen tegen doelbedrag en wat het per maand krijgt, maar nergens de
// optelling: wat vraagt je plan bij elkaar, wat staat daar tegenover, en wat is het verschil.
// Dit is uitdrukkelijk GEEN maandbedrag: het hoort niet in veilig-te-besteden, want daar gaat de
// maandelijkse inleg af en niet het volledige doelbedrag. safeToSpend() is niet aangeraakt.
// Afbakening: alles behalve type 'aflossen', dus het noodfonds telt MEE. Niet de v211-filter
// (type 'goal' en alloc > 0): die hoort bij maandelijkse bestemmingen en werkt hier averechts,
// want een doel dat 'wacht op capaciteit' heeft alloc 0 en dat is juist het doel waar de vraag
// over gaat. Een gepauzeerd doel telt wel in het totaal en niet in de maanden.
// v317: DE REGEL LEEST DE PROJECTIE EN REKENT NIET ZELF. De alinea deed `ceil(gatLopend/cap)` plus
// de eerstvolgende streefdatum, en dat was de DERDE telling over dezelfde vraag naast het datumpaar
// in elk vat (dat sinds v307 `planVooruit()` leest). Blok b meet nu de projectie, en het geval dat
// de twee onderscheidt staat erbij: met een aflos-item in het plan is de VLAKKE deling te
// optimistisch, want die deelt door de hele plancapaciteit terwijl de schuld er elke maand een deel
// van opeet.
// v380: PLAN IS EEN DASHBOARD. planTotaal(), planKlaarMaand() en de regel onder de waterval zijn vervallen; wat ze droegen
// staat in de kop (planKpi(), planKpiData()): het geld tegen de doelen, en "Alles vol" uit dezelfde projectie als de rijen.
// "Nog te gaan" rekent sinds v380 vanaf de verwachte stand eind deze maand (planStandEind(), keuze D) en staat als
// data-nogtegaan op de kop. Deze spec houdt dezelfde eigenschappen vast op dezelfde fixture.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const STREEF = ym(new Date(now.getFullYear() + 1, now.getMonth() + 10, 1));
const VROEG = ym(new Date(now.getFullYear() + 1, now.getMonth() + 2, 1));

function seed(o) {
  o = o || {};
  const tx = [
    { id: 'i1', date: CUR + '-05', amount: 4000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
    { id: 'h1', date: CUR + '-02', amount: -1200, acc: MAIN, name: 'Woningcorporatie', desc: 'SEPA INCASSO HUURBETALING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
    { id: 's1', date: CUR + '-26', amount: 1039, acc: SPAAR, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
  ];
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: o.mode || 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 3000, [SPAAR]: 2500 },
    budgets: { huur: 1200 },
    savingMode: 'amount', savingAmount: 1039,
    savingsAcc: { [SPAAR]: true },
    nfDoelVast: 5334, nfToegewezen: 2500, nfToegewezenMigrated: true,
    goals: o.goals !== undefined ? o.goals : [
      { id: 'g1', naam: 'Kosten Koper', doel: 16000, gespaard: 0, streefdatum: STREEF, allocMode: 'auto' },
    ],
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planKpiData === 'function');
}
const T = (page) => page.evaluate(() => planKpiData());
const kop = (page) => page.evaluate(() => { go('vooruit'); const e = document.getElementById('planKpi'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : ''; });

test.describe('a - de optelling telt op', () => {
  test('geld tegen de doelen, en nog te gaan vanaf de verwachte stand', async ({ page }) => {
    await boot(page);
    const t = await T(page);
    expect(t.doel).toBe(21334);      // 5.334 noodfonds + 16.000 doel
    expect(t.geld).toBe(2500);
    /* 5.334 - (2.500 + 1.039 inleg deze maand) + 16.000 */
    expect(t.nogTeGaan).toBe(17795);
    expect(t.pct).toBe(Math.round(2500 / 21334 * 100));
  });

  test('de bedragen komen uit planStandEind, niet uit een tweede som', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => { const P = allocatePlan(), S = planStandEind(P);
      const X = P.filter((p) => p.type !== 'aflossen').map((p) => S.per[p.id]);
      return { doel: X.reduce((a, x) => a + x.doel, 0), geld: X.reduce((a, x) => a + x.geld, 0), nog: X.reduce((a, x) => a + Math.max(x.doel - x.S, 0), 0), K: planKpiData() }; });
    expect(uit.K.doel).toBe(uit.doel); expect(uit.K.geld).toBe(uit.geld); expect(uit.K.nogTeGaan).toBe(uit.nog);
  });

  test('het noodfonds telt mee', async ({ page }) => {
    await boot(page);
    expect(await kop(page)).toContain('€2.500 van €21.334');
  });

  test('een aflos-item telt niet mee: schuld is een andere vraag', async ({ page }) => {
    await boot(page, { set: {
      debts: [{ id: 'd1', naam: 'Lening', rest: 8000, start: 12000, perMaand: 200, rente: 4, type: 'lening' }],
      planOrder: ['noodfonds', 'g1', 'af:d1'],
    } });
    expect(await page.evaluate(() => allocatePlan().some((p) => p.type === 'aflossen'))).toBe(true);
    expect((await T(page)).doel).toBe(21334);   // ongewijzigd
  });

  test('een doel dat op de buffer wacht telt mee', async ({ page }) => {
    await boot(page);
    const kk = await page.evaluate(() => allocatePlan().find((p) => p.id === 'g1'));
    expect(kk.alloc).toBe(0); expect(kk.status).toBe('wacht op de buffer');
    expect((await T(page)).doel).toBe(21334);
  });
});

test.describe('b - alles vol komt uit de projectie', () => {
  test('ook een doel dat op de buffer wacht krijgt een maand, want de grendel gaat erin open', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ K: planKpiData(), vol: planVooruit(), lbl: etaDatum(planKpiData().allesVol) }));
    expect(r.K.allesVol).toBe(19);
    expect(r.K.allesVol).toBe(Math.max(...Object.values(r.vol)));   // de LAATSTE en niet de eerste
    expect(r.vol.noodfonds).toBe(3);
    expect(await kop(page)).toContain(`Alles vol ${r.lbl}`);
  });

  test('met een aflos-item loopt de projectie uiteen met de vlakke deling', async ({ page }) => {
    await boot(page, { set: {
      nfToegewezen: 5334,
      debts: [{ id: 'd1', naam: 'Lening', rest: 8000, start: 12000, perMaand: 0, rente: 4, type: 'lening' }],
      planOrder: ['noodfonds', 'af:d1', 'g1'],
      planAlloc: { 'af:d1': { mode: 'fixed', perMaand: 300 } },
    } });
    const r = await page.evaluate(() => ({ alloc: Object.fromEntries(allocatePlan().map((p) => [p.id, p.alloc])), cap: planCapacity(), K: planKpiData() }));
    expect(r.alloc['af:d1']).toBe(300);
    expect(r.K.allesVol).toBeGreaterThan(Math.ceil(r.K.nogTeGaan / r.cap));
  });

  test('zonder capaciteit staat er geen maand in plaats van een verzonnen tempo', async ({ page }) => {
    await boot(page, { set: { savingMode: 'amount', savingAmount: 0 } });
    expect((await T(page)).allesVol).toBe(null);
    expect(await kop(page)).toContain('Alles vol nog niet te zeggen');
  });
});

test.describe('c - een gepauzeerd doel', () => {
  test('telt in het geld en de doelen van de kop, niet in nog te gaan en niet in alles vol', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => planTogglePause('g1'));
    const t = await T(page);
    expect(t.doel).toBe(21334);
    expect(t.nogTeGaan).toBe(5334 - 2500 - 1039);
    expect(t.allesVol).toBe(3);   // alleen het noodfonds doet mee
    expect(await page.evaluate(() => { go('vooruit'); return document.querySelector('[data-id="g1"] [data-planstatus]').innerText; })).toBe('gepauzeerd');
  });
});

test.describe('d - de randen', () => {
  test('zonder doelen staat het noodfonds er alleen', async ({ page }) => {
    await boot(page, { goals: [] });
    await page.evaluate(() => go('vooruit'));
    expect(await page.evaluate(() => allocatePlan().map((p) => p.id))).toEqual(['noodfonds']);
    expect((await T(page)).doel).toBe(5334);
  });

  test('een bereikt doel telt in beide sommen en laat nog te gaan met rust', async ({ page }) => {
    await boot(page, { goals: [
      { id: 'g1', naam: 'Kosten Koper', doel: 16000, gespaard: 0, streefdatum: STREEF, allocMode: 'auto' },
      { id: 'g2', naam: 'Klaar', doel: 1000, gespaard: 1000, allocMode: 'auto' },
    ], set: { manualBal: { [MAIN]: 3000, [SPAAR]: 3500 } } });
    const t = await T(page);
    expect(t.doel).toBe(22334); expect(t.geld).toBe(3500);
    expect(t.nogTeGaan).toBe(17795);
  });

  test('alles bereikt: nog te gaan is nul, alles is vol, en er staat geen felicitatie', async ({ page }) => {
    await boot(page, { goals: [{ id: 'g1', naam: 'Klaar', doel: 1000, gespaard: 1000, allocMode: 'auto' }],
      set: { nfDoelVast: 2000, nfToegewezen: 2000, manualBal: { [MAIN]: 3000, [SPAAR]: 3000 } } });
    const t = await T(page);
    expect(t.nogTeGaan).toBe(0); expect(t.allesVol).toBe(null); expect(t.loopt).toBe(0);
    const r = (await kop(page)).toLowerCase();
    expect(r).toContain('alles is vol');
    for (const w of ['goed bezig', 'gefeliciteerd', 'knap', 'mooi']) expect(r).not.toContain(w);
  });
});

test.describe('e - een constatering, geen oordeel', () => {
  test('geen alarmkleur en geen advies in de kop', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => { go('vooruit'); return document.getElementById('planKpi').outerHTML; });
    expect(h).not.toContain('--amber'); expect(h).not.toContain('--red');
    const r = (await kop(page)).toLowerCase();
    for (const w of ['zet meer', 'verhoog', 'probeer', 'zou je', 'tip', 'advies', 'lukt het']) expect(r, w).not.toContain(w);
  });
});

test.describe('f - plaatsing en veilig-te-besteden', () => {
  test('de kop staat boven de doelenlijst, en Plan draagt geen reserveringen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('vooruit'));
    const t = await page.locator('#s-vooruit').innerText();
    expect(t.indexOf('GESPAARD VOOR JE DOELEN') >= 0 || t.indexOf('Gespaard voor je doelen') >= 0).toBe(true);
    expect(t.indexOf('Kosten Koper')).toBeGreaterThan(Math.max(t.indexOf('Gespaard voor je doelen'), t.indexOf('GESPAARD VOOR JE DOELEN')));
    expect(t).not.toContain('Reserveringen');   // v344
  });

  test('KRITIEK: veilig te besteden is niet geraakt door het doelbedrag', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => safeToSpend().safe);
    await page.evaluate(() => { SET.goals[0].doel = 160000; save(); });
    expect(await page.evaluate(() => safeToSpend().safe)).toBe(voor);
  });
});

test.describe('g - layout', () => {
  for (const w of [360, 390]) {
    test(`Plan past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      await page.evaluate(() => go('vooruit'));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
