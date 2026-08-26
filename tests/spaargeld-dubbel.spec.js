// v102: gemeld geval — spaarsaldo €2.000, noodfonds-doel €1.500, de vrije €500 toegewezen aan
// Kosten koper. Zet je het noodfonds-doel daarna op €2.000, dan schuift de voortgang van het
// noodfonds mee omhoog (planMap rekent min(saved, doel)) terwijl "Al gespaard" van het spaardoel
// jouw eigen getal is en blijft staan. Dezelfde €500 telt dan bij twee doelen. spaarVrij() klemt
// op nul en zweeg daarover. Nu wordt het gemeld en is het met een tik recht te zetten.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const KK = { id: 'kk', naam: 'Kosten koper', doel: 8000, gespaard: 0, perMaand: 0 };

// spaarsaldo hard zetten en het noodfonds-doel vastzetten, zodat de fixture-medianen niet storen
async function boot(page, { saldo = 2000, nfDoel = 1500, goals = [KK] } = {}) {
  await open(page, seed());
  await page.evaluate(({ saldo, nfDoel, goals }) => {
    SET.manualBal = { [OWN[0]]: 0, [OWN[1]]: saldo };
    SET.goals = JSON.parse(JSON.stringify(goals));
    setNfDoelVast(nfDoel);
    SET.vooruitDoelOpen = true; save(); go('vooruit'); renderVooruit();
  }, { saldo, nfDoel, goals });
  await page.waitForTimeout(60);
}
const staat = (page) => page.evaluate(() => {
  const P = allocatePlan();
  return { over: spaarOver(), vrij: spaarVrij().vrij, som: P.reduce((a, p) => a + (+p.gespaard || 0), 0), goals: (SET.goals || []).map((g) => ({ naam: g.naam, gespaard: g.gespaard })) };
});
const zetNf = (page, v) => page.evaluate((x) => { setNfDoelVast(x); renderVooruit(); }, v);

test.describe('a · het gemelde geval', () => {
  test('zonder overtoewijzing telt alles precies op tot je saldo', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.goals[0].gespaard = 500; save(); renderVooruit(); });
    const s = await staat(page);
    expect(s.som).toBe(2000);                       // 1500 noodfonds + 500 doel
    expect(s.over.over).toBe(0);
    expect(s.vrij).toBe(0);
  });

  test('na het verhogen van het noodfonds-doel telt €500 dubbel, en dat wordt gemeld', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.goals[0].gespaard = 500; save(); });
    await zetNf(page, 2000);
    const s = await staat(page);
    expect(s.som).toBe(2500);                       // de dubbeltelling zelf
    expect(s.over.over).toBe(500);
    expect(s.over.saved).toBe(2000);
    expect(s.over.nf).toBe(2000);
    expect(await page.locator('#s-vooruit').innerText()).toContain('zit nu bij twee doelen tegelijk');
  });

  test('één tik zet het recht en de som klopt weer', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.goals[0].gespaard = 500; save(); });
    await zetNf(page, 2000);
    await page.evaluate(() => spaarOverAf());
    const s = await staat(page);
    expect(s.goals[0].gespaard).toBe(0);
    expect(s.som).toBe(2000);
    expect(s.over.over).toBe(0);
    expect(await page.locator('#s-vooruit').innerText()).not.toContain('zit nu bij twee doelen tegelijk');
  });
});

test.describe('b · wie levert in', () => {
  const DRIE = [
    { id: 'kk', naam: 'Kosten koper', doel: 8000, gespaard: 300, perMaand: 0 },
    { id: 'va', naam: 'Vakantie', doel: 2000, gespaard: 200, perMaand: 0 },
  ];

  test('de laagste prioriteit levert eerst in', async ({ page }) => {
    await boot(page, { goals: DRIE });                         // 1500 + 300 + 200 = 2000, klopt
    await zetNf(page, 1700);                                   // nu claimt het geheel 2200
    expect((await staat(page)).over.over).toBe(200);
    await page.evaluate(() => spaarOverAf());
    const s = await staat(page);
    expect(s.goals.find((g) => g.naam === 'Vakantie').gespaard).toBe(0);      // onderste eerst
    expect(s.goals.find((g) => g.naam === 'Kosten koper').gespaard).toBe(300); // bovenste ongemoeid
  });

  test('een tekort dat groter is dan één doel loopt door naar het volgende', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await zetNf(page, 2000);                                   // over = 500
    expect((await staat(page)).over.over).toBe(500);
    await page.evaluate(() => spaarOverAf());
    const s = await staat(page);
    expect(s.goals.find((g) => g.naam === 'Vakantie').gespaard).toBe(0);
    expect(s.goals.find((g) => g.naam === 'Kosten koper').gespaard).toBe(0);
    expect(s.som).toBe(2000);
  });

  test('nooit onder nul', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await zetNf(page, 2000);
    await page.evaluate(() => { spaarOverAf(); spaarOverAf(); });
    const s = await staat(page);
    for (const g of s.goals) expect(g.gespaard).toBeGreaterThanOrEqual(0);
    expect(s.som).toBe(2000);
  });
});

test.describe('c · zwijgen als er niets aan de hand is', () => {
  test('geen melding zonder spaardoelen', async ({ page }) => {
    await boot(page, { goals: [] });
    await zetNf(page, 2000);
    expect((await staat(page)).over.over).toBe(0);
    expect(await page.locator('#s-vooruit').innerText()).not.toContain('twee doelen tegelijk');
  });

  test('geen melding bij onbekende saldi', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.manualBal = {}; SET.goals[0].gespaard = 500; save(); renderVooruit(); });
    const s = await staat(page);
    expect(s.over.over).toBe(0);                     // niets weten is geen alarm (v59/v73)
  });

  test('vrij en teveel sluiten elkaar uit', async ({ page }) => {
    await boot(page);                                 // 2000 saldo, doel 1500, niets toegewezen
    let s = await staat(page);
    expect(s.vrij).toBe(500);
    expect(s.over.over).toBe(0);
    await page.evaluate(() => { SET.goals[0].gespaard = 500; save(); });
    await zetNf(page, 2000);
    s = await staat(page);
    expect(s.vrij).toBe(0);
    expect(s.over.over).toBe(500);
  });

  test('het noodfonds zelf wordt nooit verlaagd', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.goals[0].gespaard = 500; save(); });
    await zetNf(page, 2000);
    await page.evaluate(() => spaarOverAf());
    const nf = await page.evaluate(() => allocatePlan().find((p) => p.type === 'noodfonds'));
    expect(nf.gespaard).toBe(2000);
    expect(nf.doel).toBe(2000);
  });
});

test.describe('d · toon', () => {
  test('rustig zegt het korter maar biedt dezelfde tik', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.goals[0].gespaard = 500; SET.mode = 'rustig'; save(); });
    await zetNf(page, 2000);
    const t = await page.locator('#s-vooruit').innerText();
    expect(t).toContain('claimen €500 meer dan er staat');
    expect(t).toContain('haal €500 weg bij');
  });

  test('de regel noemt het doel bij naam als er één is', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.goals[0].gespaard = 500; save(); });
    await zetNf(page, 2000);
    expect(await page.locator('#s-vooruit').innerText()).toContain('weg bij Kosten koper');
  });
});
