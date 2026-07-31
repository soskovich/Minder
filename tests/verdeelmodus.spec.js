// v71: verdeelmodus per spaardoel (auto/vast/percentage) in de waterfall,
// plus "Nog deze maand" als bovenste kaart op Vooruitblik.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const CAP = 300;   // savingMode 'amount', savingAmount 300 -> monthlySavingTarget()

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

// noodfonds onderaan zetten zodat de doelen de capaciteit krijgen; het noodfonds is groot
// genoeg om als 'auto' de rest op te slokken, wat precies is wat we willen meten.
const metDoelen = (goals, extra) => tweak((s) => {
  s.goals = goals;
  s.planOrder = goals.map((g) => g.id).concat(['noodfonds']);
  if (extra) extra(s);
});

async function openV(page, payload) {
  await open(page, payload);
  await page.evaluate(() => go('vooruit'));
  await page.waitForSelector('#s-vooruit .card');
}
// de zone kan al openstaan (expert-modus); alleen openen als dat nodig is
async function openPlanZone(page) {
  if (await page.locator('#s-vooruit .plan-item').count() === 0) {
    await page.locator('#s-vooruit [data-zone="vooruitDoelOpen"]').click();
  }
  await page.waitForSelector('#s-vooruit .plan-item');
}
const alloc = (page) => page.evaluate(() => allocatePlan().map((x) => ({ id: x.id, mode: x.mode, alloc: x.alloc, eta: x.eta, status: x.status })));

test.describe('a · de drie modi', () => {
  test('vast bedrag krijgt exact dat bedrag, auto de rest', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Vakantie', doel: 2000, gespaard: 0, allocMode: 'fixed', perMaand: 120 },
      { id: 'gB', naam: 'Laptop', doel: 2000, gespaard: 0, allocMode: 'auto' },
    ]));
    const P = await alloc(page);
    expect(P.map((x) => x.id)).toEqual(['gA', 'gB', 'noodfonds']);
    expect(P[0].alloc).toBe(120);                       // exact het vaste bedrag
    expect(P[1].alloc).toBe(CAP - 120);                 // auto pakt wat er nog is
    expect(P[2].alloc).toBe(0);
    expect(P[2].status).toBe('wacht op capaciteit');
    expect(P[0].eta).toBe(Math.ceil(2000 / 120));       // ETA volgt de toewijzing
    expect(P[1].eta).toBe(Math.ceil(2000 / 180));
  });

  test('percentage rekent over de héle capaciteit, niet over de rest', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Vakantie', doel: 2000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
      { id: 'gB', naam: 'Laptop', doel: 2000, gespaard: 0, allocMode: 'pct', pct: 30 },
      { id: 'gC', naam: 'Fiets', doel: 2000, gespaard: 0, allocMode: 'auto' },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(100);
    expect(P[1].alloc).toBe(Math.round(CAP * 0.30));    // 90, van 300 en niet van de resterende 200
    expect(P[2].alloc).toBe(CAP - 100 - 90);            // 110
    expect(P[0].alloc + P[1].alloc + P[2].alloc).toBe(CAP);
  });

  test('een vast bedrag boven de capaciteit wordt afgekapt, niet geblokkeerd', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Vakantie', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 900 },
      { id: 'gB', naam: 'Laptop', doel: 2000, gespaard: 0, allocMode: 'auto' },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(CAP);                       // tot de capaciteit
    expect(P[1].status).toBe('wacht op capaciteit');
    expect(P[0].eta).toBe(Math.ceil(9000 / CAP));       // ETA op wat er écht heen gaat
  });

  test('nooit meer dan het doel nog nodig heeft', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Bijna klaar', doel: 1000, gespaard: 950, allocMode: 'fixed', perMaand: 200 },
      { id: 'gB', naam: 'Laptop', doel: 2000, gespaard: 0, allocMode: 'auto' },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(50);                        // alleen het restant
    expect(P[1].alloc).toBe(CAP - 50);                  // de rest zakt door
  });

  test('pct zonder waarde gedraagt zich als 0 en houdt niets vast', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Vakantie', doel: 2000, gespaard: 0, allocMode: 'pct' },
      { id: 'gB', naam: 'Laptop', doel: 2000, gespaard: 0, allocMode: 'auto' },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(0);
    expect(P[0].status).toBe('wacht op capaciteit');
    expect(P[1].alloc).toBe(CAP);
  });

  test('bestaande doelen zonder modus blijven zich gedragen als vóór deze wijziging', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Oud doel', doel: 2000, gespaard: 0, perMaand: 100 },   // geen allocMode
      { id: 'gB', naam: 'Zonder bedrag', doel: 2000, gespaard: 0 },
    ]));
    const P = await alloc(page);
    expect(P[0].mode).toBe('fixed');                    // perMaand > 0 -> vast, niet ineens auto
    expect(P[0].alloc).toBe(100);
    expect(P[1].mode).toBe('auto');
    expect(P[1].alloc).toBe(CAP - 100);
  });

  // geen spaardoel ingesteld -> planCapacity valt terug op je bezuinigingsruimte; de modi
  // rekenen dan over díé capaciteit. (Capaciteit exact 0 is gedekt in plan-prioriteit.spec.js.)
  test('zonder spaardoel rekenen de modi over de terugval-capaciteit', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Vast', doel: 2000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
      { id: 'gB', naam: 'Pct', doel: 2000, gespaard: 0, allocMode: 'pct', pct: 50 },
    ], (s) => { s.savingAmount = 0; s.limit = 100; }));
    const r = await page.evaluate(() => ({ cap: planCapacity(), comfort: Math.round(noodfondsModel().comfortTot), target: monthlySavingTarget() }));
    expect(r.target).toBe(0);
    expect(r.cap).toBe(r.comfort);
    const P = await alloc(page);
    expect(P[0].alloc).toBe(Math.min(100, r.cap));
    expect(P[1].alloc).toBe(Math.min(Math.round(r.cap * 0.5), Math.max(r.cap - 100, 0)));
  });
});

test.describe('b · zachte hint bij over-verdeling', () => {
  test('vast + percentage boven de capaciteit geeft een hint, geen blokkade', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Vakantie', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 250 },
      { id: 'gB', naam: 'Laptop', doel: 5000, gespaard: 0, allocMode: 'pct', pct: 40 },
    ]));
    const W = await page.evaluate(() => planAllocWarning());
    expect(W).not.toBeNull();
    expect(W.geclaimd).toBe(250 + Math.round(CAP * 0.40));      // 370 van 300
    expect(W.txt).toContain('wachten dan op capaciteit');

    // de toewijzing gaat gewoon door: geen blokkade
    const P = await alloc(page);
    expect(P[0].alloc).toBe(250);
    expect(P[1].alloc).toBe(CAP - 250);
    expect(P[1].status).toBe('');

    await openPlanZone(page);
    expect(await page.locator('#planWarn').count()).toBe(1);
    expect(await page.locator('#planWarn').innerText()).toContain('€370');
  });

  test('percentages boven 100% worden benoemd', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'A', doel: 5000, gespaard: 0, allocMode: 'pct', pct: 70 },
      { id: 'gB', naam: 'B', doel: 5000, gespaard: 0, allocMode: 'pct', pct: 60 },
    ]));
    const W = await page.evaluate(() => planAllocWarning());
    expect(W.pct).toBe(130);
    expect(W.txt).toContain('130%');
  });

  test('binnen de capaciteit: geen hint', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'A', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
      { id: 'gB', naam: 'B', doel: 5000, gespaard: 0, allocMode: 'pct', pct: 20 },
    ]));
    expect(await page.evaluate(() => planAllocWarning())).toBeNull();
    await openPlanZone(page);
    expect(await page.locator('#planWarn').count()).toBe(0);
  });
});

test.describe('c · de editors', () => {
  test('de doel-editor toont de modus-chips en het bijpassende veld', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Vakantie', doel: 2000, gespaard: 0, allocMode: 'fixed', perMaand: 120 }]));
    await page.evaluate(() => openGoal('gA'));
    await page.waitForSelector('#gModes');
    expect(await page.locator('#gModes .chip').count()).toBe(3);
    expect(await page.locator('#gModes .chip.on').innerText()).toBe('Vast bedrag');
    expect(await page.locator('#gMnd').inputValue()).toBe('120');

    await page.locator('#gModes .chip', { hasText: 'Percentage' }).click();
    await page.waitForSelector('#gPct');
    expect(await page.locator('#gMnd').count()).toBe(0);         // €-veld maakt plaats voor %
    await page.locator('#gPct').fill('25');
    await page.locator('#sheet >> text=Opslaan').click();
    await page.waitForSelector('#sheetBg.show', { state: 'detached' });

    const g = await page.evaluate(() => SET.goals.find((x) => x.id === 'gA'));
    expect(g.allocMode).toBe('pct');
    expect(g.pct).toBe(25);
    expect(g.perMaand).toBe(120);                                // niet gewist bij de moduswissel
    const P = await alloc(page);
    expect(P[0].alloc).toBe(Math.round(CAP * 0.25));
  });

  test('het noodfonds krijgt dezelfde keuze in zijn eigen sheet', async ({ page }) => {
    await openV(page, seed());
    await page.evaluate(() => openNoodfondsPanel());
    await page.waitForSelector('#nfMaandChips');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Hoeveel gaat hier maandelijks heen?');

    await page.locator('#sheet .chip', { hasText: 'Vast bedrag' }).click();
    await page.waitForSelector('#nfPer');
    await page.locator('#nfPer').fill('80');
    await page.locator('#nfPer').press('Tab');
    await page.waitForFunction(() => (SET.planAlloc || {}).noodfonds && SET.planAlloc.noodfonds.perMaand === 80);

    const P = await alloc(page);
    const nf = P.find((x) => x.id === 'noodfonds');
    expect(nf.mode).toBe('fixed');
    expect(nf.alloc).toBe(80);                                   // niet meer de hele spaarruimte
  });

  test('de plan-lijst benoemt de modus en het bedrag', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Vakantie', doel: 5000, gespaard: 0, allocMode: 'pct', pct: 30 },
      { id: 'gB', naam: 'Laptop', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 50 },
    ]));
    await openPlanZone(page);
    expect(await page.locator('.plan-item[data-id="gA"]').innerText()).toContain('30% · €90/mnd');
    expect(await page.locator('.plan-item[data-id="gB"]').innerText()).toContain('vast · €50/mnd');
  });
});

test.describe('d · "Nog deze maand" bovenaan', () => {
  test('is de eerste kaart op Vooruitblik', async ({ page }) => {
    await openV(page, seed());
    const eerste = await page.locator('#s-vooruit > *').first().innerText();
    expect(eerste).toMatch(/nog deze maand/i);
    // de hero staat er nog, maar eronder
    const idx = await page.evaluate(() => {
      const kids = [...document.getElementById('s-vooruit').children];
      return { nog: kids.findIndex((k) => /nog deze maand/i.test(k.innerText)), hero: kids.findIndex((k) => k.classList.contains('vooruit')) };
    });
    expect(idx.nog).toBe(0);
    expect(idx.hero).toBeGreaterThan(idx.nog);
  });
});
