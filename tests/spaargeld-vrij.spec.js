// v99: spaargeld boven je noodfonds-doel wordt zichtbaar en is in één tik toe te wijzen
// v126: de regel is verhuisd van de noodfonds-plan-rij naar planniveau; de selector volgt mee.
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
// v126: de regel staat niet meer binnen de noodfonds-rij maar op planniveau, boven de rijen
const regel = (page) => page.locator('#s-vooruit .spaar-vrij');

test.describe('a · het bedrag klopt en is zichtbaar', () => {
  /* v172: het noodfonds draagt sinds model B een toewijzing in plaats van je saldo. De fixture
     wijst het doel volledig toe, zodat "wat staat er boven mijn toewijzingen" dezelfde vraag blijft
     die deze test stelde. De bestemming is nu het bovenste lopende item, en dat kan het noodfonds
     zelf zijn; hier is dat bereikt, dus valt de tik op het spaardoel. */
  test('spaargeld boven je toewijzingen staat als regel boven je plan', async ({ page }) => {
    // de migratie zet nfToegewezen eenmalig op min(saldo, doel), dus het noodfonds staat vol
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 0, allocMode: 'auto' }]));
    const r = await meet(page);
    expect(r.nf.status).toBe('bereikt');                       // doel gehaald
    expect(r.nf.gespaard).toBe(r.doel);                        // volledig toegewezen
    expect(r.vrij.vrij).toBe(r.saved - r.doel);
    expect(r.vrij.vrij).toBeGreaterThan(0);

    const t = await regel(page).innerText();
    expect(t).toContain(await page.evaluate((v) => euro0(v), r.vrij.vrij));
    expect(t).toMatch(/aan geen enkel item in je plan is toegewezen/i);
    expect(t).toContain('toewijzen aan Kosten koper');
    // v126: buiten de plan-rijen, dus hij overleeft een gepauzeerd of ontbrekend noodfonds
    expect(await page.locator('#s-vooruit .plan-item .spaar-vrij').count()).toBe(0);
  });

  test('wat al bij een doel staat telt niet nog een keer als vrij', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 400, allocMode: 'auto' }]));
    const r = await meet(page);
    // v172: toegewezen telt alle items, dus ook de toewijzing van het noodfonds
    expect(r.vrij.toegewezen).toBe(r.nf.gespaard + 400);
    expect(r.vrij.vrij).toBe(r.saved - r.nf.gespaard - 400);
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

  /* v172: zonder bekend spaarsaldo valt er niets te vergelijken, maar de reden hoort er wel te
     staan - die stond eerder in de plan-rij van het noodfonds (v168) en die rij toont nu een
     toewijzing. Zelfde blok, andere tekst, zelfde volgende stap. */
  test('zonder bekend spaarsaldo noemt hij de reden in plaats van een bedrag', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 20000, gespaard: 0 }], (s) => { s.manualBal = {}; }));
    expect(await page.evaluate(() => spaarSaldo().missing)).toBeTruthy();
    expect((await meet(page)).vrij.vrij).toBe(0);
    const t = await regel(page).innerText();
    expect(t).toContain('We weten niet wat er op je spaarrekening staat');
    expect(t).toContain('wijs je spaarrekening aan');
    expect(t).not.toMatch(/€/);
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
