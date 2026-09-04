// v126: de aansluiting tussen je spaarsaldo en je doelen hing volledig aan de aanwezigheid van een
// noodfonds-item. De regels werden binnen de plan-rij gerenderd en begonnen met een type-guard, dus
// zonder noodfondsitem, of zodra het gepauzeerd, bereikt of uit het plan was, verdween de controle
// geruisloos - precies wanneer je buffer op peil is en alles naar je doelen gaat. Nu op planniveau.
// v172: spaarOverLine is met spaarOver() vervallen, want de oorzaak (twee herkomsten in dezelfde
// kolom) bestaat niet meer. Wat overblijft is de vrij-regel, en die is nu het enige mechanisme dat
// je handmatige toewijzingen bijstuurt - dus juist deze invariant telt zwaarder dan eerst.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';

// spaarsaldo 8000 (via de gemarkeerde spaarrekening), doelen en noodfonds instelbaar
function seedSp(set = {}) {
  const tx = [
    { id: 'i1', date: `${CUR}-01`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON',
      typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    { id: 's1', date: `${CUR}-02`, amount: 100, acc: SAV, name: 'Spaarpot', desc: 'NAAR SPAREN',
      typ: '', ref: '', src: 'csv', accName: 'Spaar', refNums: [] },
  ];
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 300, vooruitDoelOpen: true,
      manualBal: { [MAIN]: 1000, [SAV]: 8000 },
      // v172: het noodfonds draagt een toegewezen bedrag; de migratie staat uit in de fixture
      nfToegewezen: 0, nfToegewezenMigrated: 1,
      goals: [{ id: 'g1', naam: 'Aankoop', doel: 9000, gespaard: 3000, allocMode: 'fixed', perMaand: 100 }],
    }, set)),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedSp());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof spaarVrijLine === 'function');
}

const vrijRegel = (page) => page.evaluate(() => spaarVrijLine(allocatePlan())
  .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());

test.describe('a · geen guard op het noodfonds', () => {
  test('de regel neemt het plan aan, geen item', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => spaarVrijLine.toString());
    expect(src).not.toMatch(/type!=='noodfonds'/);
  });

  test('zonder noodfonds-doel rekent spaarVrij gewoon door', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: 0, savingMode: 'amount', savingAmount: 0 }));
    const V = await page.evaluate(() => spaarVrij());
    expect(V.saved).toBe(8000);
    expect(V.vrij).toBeGreaterThan(0);
    expect(await vrijRegel(page)).not.toBe('');
  });

  test('met een noodfonds-doel telt die toewijzing mee', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: 4000, nfToegewezen: 4000 }));
    const V = await page.evaluate(() => spaarVrij());
    expect(V.toegewezen).toBe(7000);         // 4000 noodfonds + 3000 doel
    expect(V.vrij).toBe(1000);
  });
});

test.describe('b · de regel staat op planniveau', () => {
  for (const [naam, set] of [
    ['zonder noodfondsitem in het plan', { planOrder: ['g1'] }],
    ['een gepauzeerd noodfonds', { planPaused: { noodfonds: 1 } }],
    ['een bereikt noodfonds', { nfDoelVast: 500, nfToegewezen: 500 }],
  ]) {
    test(`${naam}: de melding blijft staan`, async ({ page }) => {
      await boot(page, seedSp(set));
      const V = await page.evaluate(() => spaarVrij());
      expect(V.vrij, naam).toBeGreaterThan(0);
      expect(await vrijRegel(page), naam).not.toBe('');
    });
  }

  test('de regel staat boven de rijen, naast de andere plan-brede regels', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => renderPlan(true));
    const iVrij = h.indexOf('spaar-vrij');
    const iRij = h.indexOf('plan-item');
    expect(iVrij).toBeGreaterThan(-1);
    expect(iRij).toBeGreaterThan(-1);
    expect(iVrij).toBeLessThan(iRij);
  });
});

test.describe('c · de tekst', () => {
  test('hij zegt wat er aan de hand is en wat je kunt doen', async ({ page }) => {
    await boot(page);
    const t = await vrijRegel(page);
    expect(t).toMatch(/€[\d.]+/);
    expect(t).toMatch(/aan geen enkel item in je plan is toegewezen/);
    expect(t).toMatch(/toewijzen aan/);
  });

  test('rustig zegt het korter, met dezelfde tik', async ({ page }) => {
    await boot(page, seedSp({ mode: 'rustig' }));
    const t = await vrijRegel(page);
    expect(t).toMatch(/is nog niet toegewezen/);
    expect(t).toMatch(/toewijzen aan/);
  });

  test('geen uitroeptekens of em-dashes', async ({ page }) => {
    await boot(page);
    expect(await vrijRegel(page)).not.toMatch(/[!—]/);
  });
});

test.describe('d · randgevallen', () => {
  test('geen enkel doel: het hele saldo is vrij, met een tik naar een nieuw doel', async ({ page }) => {
    await boot(page, seedSp({ goals: [], planOrder: [], nfDoelVast: 0, savingAmount: 0 }));
    const V = await page.evaluate(() => spaarVrij());
    expect(V.vrij).toBe(8000);
    expect(await vrijRegel(page)).toMatch(/voeg een doel toe/);
  });

  test('onbekend saldo: geen bedrag, wel de reden en een volgende stap', async ({ page }) => {
    await boot(page, seedSp({ savingsEnds: [], manualBal: { [MAIN]: 1000 } }));
    const V = await page.evaluate(() => spaarVrij());
    expect(V.saved).toBe(0);
    expect(V.vrij).toBe(0);
    const t = await vrijRegel(page);
    expect(t).toContain('We weten niet wat er op je spaarrekening staat');
    expect(t).toContain('wijs je spaarrekening aan');
    expect(t).not.toMatch(/€/);
  });
});

test.describe('e · oplossen', () => {
  test('spaarVrijToe werkt ook zonder noodfonds', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: 0, savingAmount: 0, planOrder: ['g1'] }));
    const voor = await page.evaluate(() => spaarVrij().vrij);
    expect(voor).toBeGreaterThan(0);
    await page.evaluate(() => spaarVrijToe('g1'));
    const r = await page.evaluate(() => ({ g: SET.goals[0].gespaard, vrij: spaarVrij().vrij }));
    expect(r.g).toBeGreaterThan(3000);
    expect(r.vrij).toBeLessThan(voor);
  });

  test('nooit meer dan het item nog nodig heeft', async ({ page }) => {
    await boot(page, seedSp({ nfDoelVast: 0, savingAmount: 0, planOrder: ['g1'],
      goals: [{ id: 'g1', naam: 'Aankoop', doel: 4000, gespaard: 3000, allocMode: 'fixed', perMaand: 100 }] }));
    await page.evaluate(() => spaarVrijToe('g1'));
    const r = await page.evaluate(() => ({ g: SET.goals[0].gespaard, vrij: spaarVrij().vrij }));
    expect(r.g).toBe(4000);                  // aangevuld tot het doel
    expect(r.vrij).toBe(4000);               // de rest blijft staan
  });
});
