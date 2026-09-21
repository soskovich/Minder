// v71: verdeelmodus per spaardoel (auto/vast/percentage) in de waterfall,
// plus "Nog deze maand" als bovenste kaart op Vooruitblik.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const CAP = 300;   // savingMode 'amount', savingAmount 300 -> monthlySavingTarget()

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  /* v242: de grendel. Zolang het noodfonds niet vol is gaat de hele spaarinleg daarheen en valt er
     niets te verdelen. Deze spec gaat over de verdeling zelf, dus de buffer staat hier vol en de
     grendel open. Dat is de voorwaarde die er altijd al impliciet was; nu staat hij er. */
  set.nfToegewezen = 9e7; set.nfToegewezenMigrated = true;   // planMap klemt op het doel
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
const alloc = (page) => page.evaluate(() => allocatePlan().map((x) => ({ id: x.id, mode: x.mode, alloc: x.alloc, base: x.base, extra: x.extra, eta: x.eta, status: x.status })));

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
    // v242: met een open grendel is de buffer per definitie vol, dus dit item is 'bereikt'
    expect(P[2].status).toBe('bereikt');
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
    // v193: de waarschuwing en de wachthint zijn een regel geworden (#planWacht). De waarschuwing
    // is de overlevende plek; de hint had als enige unieke inhoud welk doel het opslokt.
    expect(await page.locator('#planWacht').count()).toBe(1);
    expect(await page.locator('#planWacht').innerText()).toContain('€370');
    expect(await page.locator('#planWarn').count()).toBe(0);
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
    expect(await page.locator('#planWarn, #planWacht').count()).toBe(0);
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
    await page.locator('#gDatum').fill('2030-01');               // v242: de streefdatum is verplicht
    await page.locator('#sheet >> text=Opslaan').click();
    await page.waitForSelector('#sheetBg.show', { state: 'detached' });

    const g = await page.evaluate(() => SET.goals.find((x) => x.id === 'gA'));
    expect(g.allocMode).toBe('pct');
    expect(g.pct).toBe(25);
    expect(g.perMaand).toBe(120);                                // niet gewist bij de moduswissel
    const P = await alloc(page);
    /* v242: met een open grendel is dit het enige lopende doel, dus het restant van ronde 1 zakt er
       in ronde 2 alsnog heen. Wat de modus bepaalt is ronde 1, en dat is base; alloc is de som. */
    expect(P[0].base).toBe(Math.round(CAP * 0.25));
    expect(P[0].alloc).toBe(P[0].base + P[0].extra);
  });

  /* v242 DRAAIT DEZE BEDOELING OM. Tot v241 kreeg het noodfonds dezelfde drie verdeelmodi als een
     spaardoel, want het was 'gewoon plan-item #1'. Dat was precies het lek: een vast bedrag op een
     lege buffer laat de rest van je inleg langs die buffer lopen. Zolang de grendel dicht zit
     staan de chips er niet, en zegt de sheet waarom en wanneer hij opengaat. */
  test('het noodfonds krijgt geen keuze zolang de buffer niet vol is', async ({ page }) => {
    // v243: budget-fixture zet de grendel standaard open; deze test gaat juist over de dichte
    await openV(page, tweak((s) => { s.nfToegewezen = 0; }));
    expect(await page.evaluate(() => !!planGrendel())).toBe(true);
    await page.evaluate(() => openNoodfondsPanel());
    await page.waitForSelector('#nfMaandChips');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Hoeveel gaat hier maandelijks heen?');
    expect(sheet).toContain('Je hele spaarinleg');
    expect(await page.locator('#sheet .chip', { hasText: 'Vast bedrag' }).count()).toBe(0);
    // ook programmatisch blijft de modus staan
    await page.evaluate(() => setNfAllocMode('fixed'));
    expect(await page.evaluate(() => planAllocOf(planAllocCfg('noodfonds')).mode)).not.toBe('fixed');
    const nf = await page.evaluate(() => allocatePlan().find((x) => x.id === 'noodfonds'));
    expect(nf.alloc).toBe(CAP);                                  // de hele spaarruimte, zoals de grendel eist
    expect(await page.evaluate(() => planVrij())).toBe(0);
  });

  test('met een volle buffer staan de drie modi er wel', async ({ page }) => {
    await openV(page, tweak((s) => { s.goals = []; }));
    expect(await page.evaluate(() => planGrendel())).toBe(null);
    await page.evaluate(() => openNoodfondsPanel());
    await page.waitForSelector('#nfMaandChips');
    expect(await page.locator('#sheet .chip', { hasText: 'Vast bedrag' }).count()).toBe(1);
  });

  test('de plan-lijst benoemt de modus en het bedrag', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Vakantie', doel: 5000, gespaard: 0, allocMode: 'pct', pct: 30 },
      { id: 'gB', naam: 'Laptop', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 50 },
    ]));
    await openPlanZone(page);
    /* v242: met een open grendel blijft er ruimte over die doorzakt, dus het bedrag op de rij is
       alloc en niet alleen het aandeel. Wat deze test vasthoudt is dat de rij zijn modus benoemt
       naast zijn bedrag; het bedrag toetsen we tegen de bron in plaats van tegen een vast getal. */
    const A = await page.evaluate(() => allocatePlan().find((x) => x.id === 'gA'));
    expect(await page.locator('.plan-item[data-id="gA"]').innerText()).toContain(`30% · €${A.alloc}/mnd`);
    expect(await page.locator('.plan-item[data-id="gB"]').innerText()).toContain('vast · €50/mnd');
  });
});

// v144: "Nog deze maand" stond hier én in de Inzichten-hero. Vooruitblik opent nu met de plan-zone.
test.describe('d · Vooruitblik opent met het plan', () => {
  test('de plan-zone is de eerste kaart, zonder "Nog deze maand"', async ({ page }) => {
    await openV(page, seed());
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).not.toMatch(/nog deze maand/i);
    // v80: geen spaardoel-hero meer; de plan-zone staat vooraan
    const idx = await page.evaluate(() => {
      const kids = [...document.getElementById('s-vooruit').children];
      return { plan: kids.findIndex((k) => k.getAttribute('data-zone') === 'vooruitDoelOpen'),
               hero: kids.filter((k) => k.classList.contains('vooruit')).length };
    });
    expect(idx.plan).toBe(0);
    expect(idx.hero).toBe(0);
  });
});
