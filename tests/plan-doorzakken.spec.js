// v98: overgebleven spaarruimte blijft niet liggen maar zakt door naar het eerstvolgende
// lopende doel (echte waterval), plus uitleg bij "wacht op capaciteit".
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const CAP = 500;   // savingMode 'amount' -> monthlySavingTarget()

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.savingAmount = CAP;
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

// het noodfonds is standaard 'auto' en zou als enige lopende item alles opslokken; in de
// scenario's hieronder zetten we het stil zodat we de doorzak-werking tussen de doelen meten.
const metDoelen = (goals, extra) => tweak((s) => {
  s.goals = goals;
  s.planOrder = goals.map((g) => g.id).concat(['noodfonds']);
  s.planPaused = { noodfonds: true };
  if (extra) extra(s);
});

async function openV(page, payload) {
  await open(page, payload);
  await page.evaluate(() => go('vooruit'));
  await page.waitForSelector('#s-vooruit .card');
}
async function openPlanZone(page) {
  if (await page.locator('#s-vooruit .plan-item').count() === 0) {
    await page.locator('#s-vooruit [data-zone="vooruitDoelOpen"]').click();
  }
  await page.waitForSelector('#s-vooruit .plan-item');
}
const alloc = (page) => page.evaluate(() => allocatePlan().map((x) => ({
  id: x.id, mode: x.mode, rest: x.rest, base: x.base, extra: x.extra, alloc: x.alloc,
  eta: x.eta, status: x.status, blok: x.blokkeerder ? x.blokkeerder.id : null,
})));
const vrij = (page) => page.evaluate(() => planVrij());

test.describe('a · het restant zakt door', () => {
  test('twee vaste doelen van samen €250: de overige €250 gaat naar het bovenste lopende doel', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Kosten koper', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
      { id: 'gB', naam: 'Vakantie', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 150 },
    ]));
    expect(await page.evaluate(() => planCapacity())).toBe(CAP);
    const P = await alloc(page);
    expect(P[0].base).toBe(100);            // ronde 1: het vaste bedrag
    expect(P[0].extra).toBe(250);           // ronde 2: alles wat overbleef
    expect(P[0].alloc).toBe(350);
    expect(P[1].alloc).toBe(150);           // #2 hield zijn vaste bedrag
    expect(P[1].extra).toBe(0);
    expect(P[0].alloc + P[1].alloc).toBe(CAP);
    expect(await vrij(page)).toBe(0);       // niets blijft liggen

    await openPlanZone(page);
    expect(await page.locator('.plan-item[data-id="gA"]').innerText()).toContain('waarvan €250 doorgezakt');
    expect(await page.locator('#planVrij').count()).toBe(0);
  });

  test('top-doel vast €100 + een lopend auto-doel: het auto-doel krijgt €400', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Kosten koper', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
      { id: 'gB', naam: 'Vakantie', doel: 5000, gespaard: 0, allocMode: 'auto' },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(100);
    expect(P[0].extra).toBe(0);             // het auto-doel eronder pakte de rest al in ronde 1
    expect(P[1].alloc).toBe(400);
    expect(await vrij(page)).toBe(0);
  });

  test('een bereikt en een gepauzeerd doel worden overgeslagen; hun deel zakt door', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gKlaar', naam: 'Al binnen', doel: 500, gespaard: 500, allocMode: 'fixed', perMaand: 100 },
      { id: 'gPauze', naam: 'Even niet', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
      { id: 'gB', naam: 'Vakantie', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 150 },
    ], (s) => { s.planPaused = { noodfonds: true, gPauze: true }; }));
    const P = await alloc(page);
    expect(P[0].status).toBe('bereikt');
    expect(P[0].alloc).toBe(0);
    expect(P[1].status).toBe('gepauzeerd');
    expect(P[1].alloc).toBe(0);
    expect(P[2].base).toBe(150);
    expect(P[2].extra).toBe(CAP - 150);     // alles wat de twee anderen niet gebruiken
    expect(P[2].alloc).toBe(CAP);
    expect(await vrij(page)).toBe(0);
  });

  test('nooit meer dan wat een doel nog nodig heeft; de rest blijft doorzakken', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Bijna klaar', doel: 1000, gespaard: 800, allocMode: 'fixed', perMaand: 50 },
      { id: 'gB', naam: 'Vakantie', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(200);           // exact zijn restant, niet meer
    expect(P[1].alloc).toBe(300);           // 100 vast + 200 doorgezakt
    expect(P[1].extra).toBe(200);
    expect(await vrij(page)).toBe(0);
  });

  test('percentages die samen boven 100% uitkomen blijven gecapt op rest en op wat er is', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'A', doel: 5000, gespaard: 0, allocMode: 'pct', pct: 70 },
      { id: 'gB', naam: 'B', doel: 5000, gespaard: 0, allocMode: 'pct', pct: 60 },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(350);
    expect(P[1].alloc).toBe(150);           // wat er nog was, niet 300
    expect(P[0].alloc + P[1].alloc).toBe(CAP);
    expect(await vrij(page)).toBe(0);
  });
});

test.describe('b · vrije ruimte i.p.v. verdwijnen', () => {
  test('alle lopende doelen zijn vol: de rest staat er als "nog vrij"', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Klein doel', doel: 100, gespaard: 0, allocMode: 'fixed', perMaand: 50 },
      { id: 'gB', naam: 'Ook klein', doel: 100, gespaard: 0, allocMode: 'fixed', perMaand: 50 },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(100);           // tot zijn restant bijgevuld
    expect(P[1].alloc).toBe(100);
    expect(await vrij(page)).toBe(CAP - 200);

    await openPlanZone(page);
    const line = page.locator('#planVrij');
    await expect(line).toHaveCount(1);
    const t = await line.innerText();
    expect(t).toContain('€300');
    expect(t).toMatch(/voeg een doel toe/i);
  });

  test('alles bereikt of gepauzeerd: geen toewijzing, wel de vrije-ruimte-regel', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Al binnen', doel: 500, gespaard: 500, allocMode: 'fixed', perMaand: 50 },
      { id: 'gB', naam: 'Even niet', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 50 },
    ], (s) => { s.planPaused = { noodfonds: true, gB: true }; }));
    const P = await alloc(page);
    expect(P.every((x) => x.alloc === 0)).toBe(true);
    expect(await vrij(page)).toBe(CAP);
    await openPlanZone(page);
    expect(await page.locator('#planVrij').innerText()).toContain('€500');
  });

  test('zonder spaarruimte is er geen tweede ronde en geen vrije-ruimte-regel', async ({ page }) => {
    // minimale data: alleen inkomen + huur, dus geen comfort-uitgaven om op terug te vallen
    const now = new Date();
    const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const MAIN = 'NL01MAIN0000001111';
    const tx = [];
    for (const back of [2, 1, 0]) {
      const m = ym(new Date(now.getFullYear(), now.getMonth() - back, 1));
      tx.push({ id: 'i' + m, date: m + '-05', amount: 2000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
      tx.push({ id: 'h' + m, date: m + '-02', amount: -900, acc: MAIN, name: 'Woningcorporatie', desc: 'SEPA INCASSO HUURBETALING', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    }
    await openV(page, {
      minder_tx: JSON.stringify(tx), minder_ovr: JSON.stringify({}),
      minder_set: JSON.stringify({ limit: 100, hideInternal: true, autoIncome: false, income: 2000, savingMode: 'amount', savingAmount: 0,
        goals: [{ id: 'gA', naam: 'Vakantie', doel: 1000, gespaard: 0, allocMode: 'fixed', perMaand: 100 }], planOrder: ['gA', 'noodfonds'] }),
      minder_own: JSON.stringify([MAIN]), minder_accmeta: JSON.stringify({}), minder_plan: JSON.stringify({}),
    });
    expect(await page.evaluate(() => planCapacity())).toBe(0);
    const P = await alloc(page);
    expect(P.every((x) => x.alloc === 0 && x.extra === 0)).toBe(true);
    expect(P.every((x) => x.status === 'wacht op capaciteit' || x.status === 'bereikt')).toBe(true);
    expect(await vrij(page)).toBe(0);
    await openPlanZone(page);
    expect(await page.locator('#planVrij').count()).toBe(0);
  });
});

test.describe('c · ETA volgt de definitieve toewijzing', () => {
  test('een doel dat wordt bijgevuld rekent zijn looptijd op het totaal', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Kosten koper', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
      { id: 'gB', naam: 'Vakantie', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 150 },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(350);
    expect(P[0].eta).toBe(Math.ceil(5000 / 350));       // niet ceil(5000/100)
    expect(P[1].eta).toBe(Math.ceil(5000 / 150));
    await openPlanZone(page);
    expect(await page.locator('.plan-item[data-id="gA"]').innerText()).toContain(`~${P[0].eta} maanden`);
  });

  test('een aflos-item rekent zijn looptijd via payoffMonths op de bijgevulde inleg', async ({ page }) => {
    await openV(page, tweak((s) => {
      s.goals = [{ id: 'gA', naam: 'Kosten koper', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 100 }];
      s.debts = [{ id: 'd1', naam: 'Creditcard', type: 'lening', rest: 2000, start: 2000, perMaand: 50, rente: 14 }];
      s.planOrder = ['gA', 'af:d1', 'noodfonds'];
      s.planPaused = { noodfonds: true };
    }));
    const P = await alloc(page);
    const af = P.find((x) => x.id === 'af:d1');
    expect(af.alloc).toBe(400);                          // auto: pakt wat er na gA over is
    expect(af.eta).toBe(await page.evaluate(() => payoffMonths(2000, 50 + 400, 14)));
    // de onderliggende schuld blijft onaangeroerd
    expect(await page.evaluate(() => SET.debts[0])).toMatchObject({ id: 'd1', rest: 2000, perMaand: 50 });
  });
});

test.describe('d · uitleg bij "wacht op capaciteit"', () => {
  test('een auto-doel dat alles pakt: het doel eronder ziet waaróm en kan het bijsturen', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Vakantie', doel: 9000, gespaard: 0, allocMode: 'auto' },
      { id: 'gB', naam: 'Nieuwe fiets', doel: 900, gespaard: 0, allocMode: 'auto' },
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(CAP);
    expect(P[1].status).toBe('wacht op capaciteit');
    expect(P[1].blok).toBe('gA');

    await openPlanZone(page);
    const hint = page.locator('.plan-item[data-id="gB"] .plan-hint');
    await expect(hint).toHaveCount(1);
    const t = await hint.innerText();
    expect(t).toContain('Vakantie');
    expect(t).toMatch(/maandbedrag of %/);
    expect(t).toMatch(/maandbedrag instellen/i);
    // het doel dat wél krijgt heeft geen hint
    expect(await page.locator('.plan-item[data-id="gA"] .plan-hint').count()).toBe(0);

    // de tik opent de invoer van het bovenliggende doel, niet die van gB
    await hint.locator('text=maandbedrag instellen').click();
    await page.waitForSelector('#gModes');
    expect(await page.locator('#gNaam').inputValue()).toBe('Vakantie');

    // en een maandbedrag daarop zet de doorzak-werking aan
    await page.locator('#gModes .chip', { hasText: 'Vast bedrag' }).click();
    await page.locator('#gMnd').fill('200');
    await page.locator('#sheet >> text=Opslaan').click();
    await page.waitForSelector('#sheetBg.show', { state: 'detached' });
    const Q = await alloc(page);
    expect(Q[0].alloc).toBe(200);
    expect(Q[1].alloc).toBe(300);                        // de rest zakt nu hierheen door
    expect(Q[1].status).toBe('');
  });

  test('een aflos-item als slokop krijgt zijn eigen verdeelkeuze', async ({ page }) => {
    await openV(page, tweak((s) => {
      s.goals = [{ id: 'gB', naam: 'Nieuwe fiets', doel: 900, gespaard: 0, allocMode: 'auto' }];
      s.debts = [{ id: 'd1', naam: 'Creditcard', type: 'lening', rest: 9000, start: 9000, perMaand: 50, rente: 14 }];
      s.planOrder = ['af:d1', 'gB', 'noodfonds'];
      s.planPaused = { noodfonds: true };
    }));
    let P = await alloc(page);
    expect(P[0].alloc).toBe(CAP);
    expect(P[1].blok).toBe('af:d1');

    await openPlanZone(page);
    await page.locator('.plan-item[data-id="gB"] .plan-hint >> text=maandbedrag instellen').click();
    await page.waitForSelector('#paModes');
    expect(await page.locator('#paModes .chip').count()).toBe(3);
    await page.locator('#paModes .chip', { hasText: 'Vast bedrag' }).click();
    await page.waitForSelector('#paPer');
    await page.locator('#paPer').fill('120');
    await page.locator('#paPer').press('Tab');
    await page.waitForFunction(() => ((SET.planAlloc || {})['af:d1'] || {}).perMaand === 120);

    P = await alloc(page);
    expect(P[0].alloc).toBe(120);
    expect(P[1].alloc).toBe(380);                        // 900 - 0 nodig, dus alles wat overblijft
    expect(P[1].status).toBe('');
  });

  test('zonder auto-doel erboven blijft de oude tekst staan, zonder hint', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Slokop', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 500 },
      { id: 'gB', naam: 'Nieuwe fiets', doel: 900, gespaard: 0, allocMode: 'pct' },   // pct zonder waarde -> 0
    ]));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(CAP);
    expect(P[1].status).toBe('wacht op capaciteit');
    expect(P[1].blok).toBeNull();
    await openPlanZone(page);
    const rij = page.locator('.plan-item[data-id="gB"]');
    expect(await rij.innerText()).toMatch(/wacht op capaciteit/i);
    expect(await rij.locator('.plan-hint').count()).toBe(0);
  });
});

test.describe('e · buffer blijft heilig', () => {
  test('het noodfonds is een gewoon lopend item: het wordt bijgevuld, nooit leeggehaald', async ({ page }) => {
    await openV(page, tweak((s) => {
      s.goals = [{ id: 'gA', naam: 'Vakantie', doel: 5000, gespaard: 0, allocMode: 'fixed', perMaand: 100 }];
      s.planOrder = ['noodfonds', 'gA'];
      s.planAlloc = { noodfonds: { allocMode: 'fixed', perMaand: 80 } };
      s.nfMaanden = 12;                                   // houdt het noodfonds ruim onvol
    }));
    const P = await alloc(page);
    const nf = P[0];
    expect(nf.id).toBe('noodfonds');
    expect(nf.base).toBe(80);                             // zijn eigen vaste bedrag
    expect(nf.extra).toBeGreaterThan(0);                  // en het restant zakt hierheen door
    expect(nf.alloc).toBe(CAP - 100);
    expect(nf.alloc).toBeLessThanOrEqual(nf.rest);        // nooit meer dan het doel nog nodig heeft
    expect(P[1].alloc).toBe(100);
    expect(await vrij(page)).toBe(0);
  });
});
