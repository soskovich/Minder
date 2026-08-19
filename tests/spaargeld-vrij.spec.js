// v99: spaargeld boven je noodfonds-doel wordt zichtbaar en is in één tik toe te wijzen
// aan het bovenste lopende spaardoel. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

// nfMaanden 1 maakt het noodfonds-doel klein genoeg (1 x crisislast) dat het spaarsaldo
// van de fixture (SAV 2500) eroverheen gaat — precies het gemelde geval.
function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.nfMaanden = 1;
  set.planOrder = ['noodfonds'];
  if (fn) fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}
const metDoelen = (goals, extra) => tweak((s) => {
  s.goals = goals;
  s.planOrder = ['noodfonds'].concat(goals.map((g) => g.id));
  if (extra) extra(s);
});

async function openV(page, payload) {
  await open(page, payload);
  await page.evaluate(() => go('vooruit'));
  await page.waitForSelector('#s-vooruit .card');
  if (await page.locator('#s-vooruit .plan-item').count() === 0) {
    await page.locator('#s-vooruit [data-zone="vooruitDoelOpen"]').click();
  }
  await page.waitForSelector('#s-vooruit .plan-item');
}
const meet = (page) => page.evaluate(() => ({
  vrij: spaarVrij(), saved: Math.round(spaarSaldo().cur), doel: Math.round(noodfondsModel().doel),
  nf: allocatePlan().find((x) => x.id === 'noodfonds'),
}));
const regel = (page) => page.locator('#s-vooruit .plan-item[data-id="noodfonds"] .spaar-vrij');

test.describe('a · het bedrag klopt en is zichtbaar', () => {
  test('spaargeld boven het bereikte doel staat als regel bij het noodfonds', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 0, allocMode: 'auto' }]));
    const r = await meet(page);
    expect(r.nf.status).toBe('bereikt');                       // doel gehaald
    expect(r.nf.gespaard).toBe(r.doel);                        // en geklemd op het doel: hier zit het gat
    expect(r.vrij.vrij).toBe(r.saved - r.doel);                // niets toegewezen, dus alles erboven is vrij
    expect(r.vrij.vrij).toBeGreaterThan(0);

    const t = await regel(page).innerText();
    expect(t).toContain(await page.evaluate((v) => euro0(v), r.vrij.vrij));
    expect(t).toMatch(/boven je noodfonds-doel/i);
    expect(t).toContain('toewijzen aan Kosten koper');
  });

  test('wat al bij een doel staat telt niet nog een keer als vrij', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 400, allocMode: 'auto' }]));
    const r = await meet(page);
    expect(r.vrij.toegewezen).toBe(400);
    expect(r.vrij.vrij).toBe(r.saved - r.doel - 400);
    expect(await regel(page).innerText()).toContain(await page.evaluate((v) => euro0(v), r.saved - r.doel - 400));
  });

  test('zonder overschot geen regel', async ({ page }) => {
    // nfMaanden 12: het doel ligt ver boven je spaargeld
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 0 }], (s) => { s.nfMaanden = 12; }));
    const r = await meet(page);
    expect(r.saved).toBeLessThan(r.doel);
    expect(r.vrij.vrij).toBe(0);
    expect(await regel(page).count()).toBe(0);
  });

  test('zonder bekend spaarsaldo zwijgt hij', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 0 }], (s) => { s.manualBal = {}; }));
    expect(await page.evaluate(() => spaarSaldo().missing)).toBeTruthy();
    expect((await meet(page)).vrij.vrij).toBe(0);
    expect(await regel(page).count()).toBe(0);
  });
});

test.describe('b · toewijzen', () => {
  test('één tik telt het op bij "Al gespaard" en de regel verdwijnt', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 0, allocMode: 'auto' }]));
    const v = (await meet(page)).vrij.vrij;

    await regel(page).locator('text=toewijzen aan').click();
    await page.waitForFunction((n) => (SET.goals.find((g) => g.id === 'gA') || {}).gespaard === n, v);

    const na = await meet(page);
    expect(na.vrij.vrij).toBe(0);                              // niet nog eens aan te bieden
    expect(await regel(page).count()).toBe(0);
    // de voortgang van het doel beweegt mee
    const rij = await page.locator('#s-vooruit .plan-item[data-id="gA"]').innerText();
    expect(rij).toContain(await page.evaluate((n) => euro0(n), v));
    // en het blijft handmatig te corrigeren
    await page.evaluate(() => openGoal('gA'));
    await page.waitForSelector('#gNu');
    expect(await page.locator('#gNu').inputValue()).toBe(String(v));
  });

  test('nooit meer dan het doel nog nodig heeft; de rest blijft staan', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Klein doel', doel: 50, gespaard: 0, allocMode: 'auto' },
      { id: 'gB', naam: 'Kosten koper', doel: 20000, gespaard: 0, allocMode: 'auto' },
    ]));
    const v = (await meet(page)).vrij.vrij;
    expect(v).toBeGreaterThan(50);

    await page.evaluate(() => spaarVrijToe('gA'));
    expect(await page.evaluate(() => SET.goals.find((g) => g.id === 'gA').gespaard)).toBe(50);
    const na = await meet(page);
    expect(na.vrij.vrij).toBe(v - 50);                         // de rest blijft vrij
    // gA is nu bereikt, dus de regel wijst door naar het volgende lopende doel
    expect(await regel(page).innerText()).toContain('toewijzen aan Kosten koper');
  });

  test('een aflos-item is nooit de bestemming', async ({ page }) => {
    await openV(page, tweak((s) => {
      s.goals = [];
      s.debts = [{ id: 'd1', naam: 'Creditcard', type: 'lening', rest: 2000, start: 2000, perMaand: 50, rente: 14 }];
      s.planOrder = ['noodfonds', 'af:d1'];
    }));
    expect((await meet(page)).vrij.vrij).toBeGreaterThan(0);
    expect(await page.evaluate(() => spaarVrijDoel())).toBeNull();
    const t = await regel(page).innerText();
    expect(t).toMatch(/voeg een doel toe/i);                   // geen aflos-item als bestemming
    expect(t).not.toContain('toewijzen aan');
    // en programmatisch raakt hij de schuld niet aan
    await page.evaluate(() => spaarVrijToe('af:d1'));
    expect(await page.evaluate(() => SET.debts[0].rest)).toBe(2000);
  });

  test('een gepauzeerd of bereikt doel wordt overgeslagen', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Al binnen', doel: 500, gespaard: 500, allocMode: 'auto' },
      { id: 'gB', naam: 'Even niet', doel: 20000, gespaard: 0, allocMode: 'auto' },
      { id: 'gC', naam: 'Kosten koper', doel: 20000, gespaard: 0, allocMode: 'auto' },
    ], (s) => { s.planPaused = { gB: true }; }));
    expect(await page.evaluate(() => spaarVrijDoel().id)).toBe('gC');
    expect(await regel(page).innerText()).toContain('toewijzen aan Kosten koper');
  });
});

test.describe('c · gedrag en toon', () => {
  test('een tik op de regel opent de noodfonds-sheet niet', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 0, allocMode: 'auto' }]));
    await regel(page).locator('text=toewijzen aan').click();
    await expect(page.locator('#sheetBg.show')).toHaveCount(0);
  });

  test('Rustig is korter maar noemt hetzelfde bedrag', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 0, allocMode: 'auto' }], (s) => { s.mode = 'rustig'; }));
    const v = (await meet(page)).vrij.vrij;
    const t = await regel(page).innerText();
    expect(t).toContain(await page.evaluate((n) => euro0(n), v));
    expect(t).not.toMatch(/hoort nog bij geen enkel doel/);
    expect(t).toContain('toewijzen aan Kosten koper');
  });

  test('de maandinleg-laag is niet geraakt', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 0, allocMode: 'auto' }]));
    const voor = await page.evaluate(() => allocatePlan().map((x) => ({ id: x.id, alloc: x.alloc, status: x.status })));
    await page.evaluate(() => spaarVrijToe('gA'));
    const na = await page.evaluate(() => allocatePlan().map((x) => ({ id: x.id, alloc: x.alloc, status: x.status })));
    expect(na).toEqual(voor);                                  // toewijzen verschuift geen euro van je maandinleg
    expect(await page.evaluate(() => planCapacity())).toBe(300);
  });
});
