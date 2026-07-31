// Vooruitblik (v64): prioriteit-gerangschikte doelen met waterfall-allocatie,
// en het optionele dure-schuld-advies bij een nieuw doel.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

// spaarruimte in de fixture: savingMode 'amount', savingAmount 300 -> monthlySavingTarget() = 300
const CAP = 300;

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

const doelen = () => ([
  { id: 'gA', naam: 'Kosten koper huis', doel: 1000, perMaand: 100, gespaard: 0 },
  { id: 'gB', naam: 'Vakantie', doel: 500, perMaand: 0, gespaard: 0 },
]);

async function openV(page, payload) {
  await open(page, payload || tweak((s) => { s.goals = doelen(); }));
  await page.evaluate(() => go('vooruit'));
  await page.waitForSelector('#s-vooruit .plan-item, #s-vooruit .card');
}

// de planlijst zit achter de zone "Mijn plan"; expert-modus klapt hem standaard open
async function openPlanZone(page) {
  if (await page.locator('#s-vooruit .plan-item').count() === 0) {
    await page.locator('#s-vooruit >> text=Mijn plan').first().click();
  }
  await page.waitForSelector('#s-vooruit .plan-item');
}

test.describe('a · planItems en de waterfall', () => {
  test('noodfonds staat standaard bovenaan en slurpt de spaarruimte op', async ({ page }) => {
    await openV(page);
    const P = await page.evaluate(() => allocatePlan());
    expect(P.map((x) => x.id)).toEqual(['noodfonds', 'gA', 'gB']);
    expect(await page.evaluate(() => planCapacity())).toBe(CAP);

    expect(P[0].type).toBe('noodfonds');
    expect(P[0].alloc).toBe(CAP);                     // geen perMaand -> pakt wat er is
    expect(P[1].alloc).toBe(0);
    expect(P[1].status).toBe('wacht op capaciteit');
    expect(P[2].alloc).toBe(0);
  });

  test('een expliciet maandbedrag wordt gerespecteerd en de rest zakt door', async ({ page }) => {
    await openV(page, tweak((s) => { s.goals = doelen(); s.planOrder = ['gA', 'gB', 'noodfonds']; }));
    const P = await page.evaluate(() => allocatePlan());
    expect(P.map((x) => x.id)).toEqual(['gA', 'gB', 'noodfonds']);

    expect(P[0].alloc).toBe(100);                     // perMaand 100 wordt niet overschreden
    expect(P[0].eta).toBe(10);                        // 1000 / 100
    expect(P[1].alloc).toBe(200);                     // zonder perMaand: wat er overblijft
    expect(P[1].eta).toBe(3);                         // ceil(500 / 200)
    expect(P[2].alloc).toBe(0);                       // niets meer over
    expect(P[2].status).toBe('wacht op capaciteit');
    expect(P[0].alloc + P[1].alloc + P[2].alloc).toBe(CAP);
  });

  test('een pauze slaat het item over zonder capaciteit te verbruiken', async ({ page }) => {
    await openV(page, tweak((s) => { s.goals = doelen(); s.planOrder = ['gA', 'gB', 'noodfonds']; s.planPaused = { gA: true }; }));
    const P = await page.evaluate(() => allocatePlan());
    expect(P[0].status).toBe('gepauzeerd');
    expect(P[0].alloc).toBe(0);
    expect(P[1].alloc).toBe(Math.min(500, CAP));      // gB krijgt de volle ruimte
  });

  test('zonder spaarruimte wacht alles op capaciteit', async ({ page }) => {
    // minimale data: alleen inkomen + huur + boodschappen, dus geen comfort-uitgaven om op terug te vallen
    const now = new Date();
    const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const MAIN = 'NL01MAIN0000001111';
    const tx = [];
    for (const back of [2, 1, 0]) {
      const m = ym(new Date(now.getFullYear(), now.getMonth() - back, 1));
      tx.push({ id: 'i' + m, date: m + '-05', amount: 2000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
      tx.push({ id: 'h' + m, date: m + '-02', amount: -900, acc: MAIN, name: 'Woningcorporatie', desc: 'SEPA INCASSO HUURBETALING', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    }
    await open(page, {
      minder_tx: JSON.stringify(tx), minder_ovr: JSON.stringify({}),
      minder_set: JSON.stringify({ limit: 100, hideInternal: true, autoIncome: false, income: 2000, savingMode: 'amount', savingAmount: 0, goals: doelen() }),
      minder_own: JSON.stringify([MAIN]), minder_accmeta: JSON.stringify({}), minder_plan: JSON.stringify({}),
    });
    expect(await page.evaluate(() => planCapacity())).toBe(0);
    const P = await page.evaluate(() => allocatePlan());
    expect(P.every((x) => x.alloc === 0)).toBe(true);
    expect(P.every((x) => x.status === 'wacht op capaciteit' || x.status === 'bereikt')).toBe(true);
  });
});

test.describe('b · herordenen en de hero', () => {
  test('standaard volgt de hero het noodfonds, precies als voorheen', async ({ page }) => {
    await openV(page);
    const S = await page.evaluate(() => ({ src: savingsModel().goalSrc, goal: savingsModel().goal, nf: Math.round(noodfondsModel().doel) }));
    expect(S.src).toBe('nood');
    expect(S.goal).toBe(S.nf);
    expect(await page.locator('#s-vooruit .vh-lbl').first().innerText()).toMatch(/je spaardoel/i);
  });

  test('▲ verandert SET.planOrder en de hero volgt het nieuwe #1', async ({ page }) => {
    await openV(page);
    await openPlanZone(page);

    // tweede kaart (gA) een plek omhoog
    await page.locator('#s-vooruit .plan-item[data-id="gA"] .plan-mv').first().click();
    expect(await page.evaluate(() => SET.planOrder)).toEqual(['gA', 'noodfonds', 'gB']);

    const S = await page.evaluate(() => savingsModel());
    expect(S.goalSrc).toBe('plan');
    expect(S.goal).toBe(1000);
    expect(S.planNaam).toBe('Kosten koper huis');
    expect(S.planAlloc).toBe(100);                                  // ETA op het eigen maandbedrag
    expect(Math.round(S.monthsLeft)).toBe(10);

    const hero = await page.locator('#s-vooruit .vooruit').first().innerText();
    expect(hero).toContain('Kosten koper huis');
    expect(hero).toContain('#1 in je plan');
    expect(hero).toContain('€1.000');
  });

  test('een bereikt #1 schuift door naar het volgende item', async ({ page }) => {
    await openV(page, tweak((s) => {
      s.goals = [{ id: 'gA', naam: 'Kosten koper huis', doel: 1000, perMaand: 100, gespaard: 1000 }, doelen()[1]];
      s.planOrder = ['gA', 'gB', 'noodfonds'];
    }));
    const P = await page.evaluate(() => allocatePlan());
    expect(P[0].status).toBe('bereikt');
    expect(P[0].alloc).toBe(0);
    expect(P[1].alloc).toBe(CAP > 500 ? 500 : CAP);                 // volle ruimte naar #2

    const S = await page.evaluate(() => savingsModel());
    expect(S.planNaam).toBe('Vakantie');                            // hero schuift door
    expect(S.goal).toBe(500);
  });
});

test.describe('c · het noodfonds', () => {
  test('is herordenbaar maar niet verwijderbaar', async ({ page }) => {
    await openV(page);
    await openPlanZone(page);
    const nf = page.locator('#s-vooruit .plan-item[data-id="noodfonds"]');
    await expect(nf).toHaveCount(1);
    expect(await nf.innerText()).not.toContain('uit plan halen');   // geen verwijder-affordance
    expect(await nf.innerText()).toContain('pauzeren');             // pauzeren mag wel

    // ook programmatisch blijft hij staan
    await page.evaluate(() => planRemove('noodfonds'));
    expect(await page.evaluate(() => planItems().some((x) => x.id === 'noodfonds'))).toBe(true);

    // maar zakken kan wel
    await page.evaluate(() => planMove('noodfonds', 1));
    expect(await page.evaluate(() => planItems()[0].id)).toBe('gA');
  });
});

test.describe('d/e · dure-schuld-advies bij een nieuw doel', () => {
  const metSchuld = (rente) => tweak((s) => {
    s.goals = doelen();
    s.debts = [{ id: 'd1', naam: 'Creditcard', type: 'lening', rest: 2000, perMaand: 50, rente }];
  });

  test('dure schuld: de kaart verschijnt met de juiste framing', async ({ page }) => {
    await openV(page, metSchuld(14));
    await page.evaluate(() => openGoal());
    await page.waitForSelector('#sheetBg.show');
    const card = page.locator('#debtNudge');
    await expect(card).toHaveCount(1);
    const t = await card.innerText();
    expect(t).toContain('Creditcard');
    expect(t).toContain('14%');
    expect(t).toContain('Je noodbuffer blijft staan');
    expect(t).toMatch(/suggestie, geen advies/i);
    expect(t).toContain('Aflossen als doel #1');
    expect(t).toContain('Nee, ik wil sparen');
  });

  test('"Aflossen als doel #1" maakt een aflos-item bovenaan het plan', async ({ page }) => {
    await openV(page, metSchuld(14));
    await page.evaluate(() => openGoal());
    await page.waitForSelector('#debtNudge');
    await page.locator('#debtNudge >> text=Aflossen als doel #1').click();
    await page.waitForSelector('#sheetBg.show', { state: 'detached' });

    expect((await page.evaluate(() => SET.planOrder))[0]).toBe('af:d1');
    const P = await page.evaluate(() => allocatePlan());
    expect(P[0].type).toBe('aflossen');
    expect(P[0].debtId).toBe('d1');
    expect(P[0].naam).toContain('Creditcard');
    expect(P[0].doel).toBe(2000);
    expect(P[0].alloc).toBe(CAP);
    // ETA via payoffMonths over de eigen aflossing + de allocatie
    expect(P[0].eta).toBe(await page.evaluate(() => payoffMonths(2000, 50 + 300, 14)));

    // de onderliggende schuld is niet aangeraakt
    expect(await page.evaluate(() => SET.debts[0])).toMatchObject({ id: 'd1', rest: 2000, perMaand: 50, rente: 14 });
    // en uit het plan halen laat de schuld staan
    await page.evaluate(() => planRemove('af:d1'));
    expect(await page.evaluate(() => (SET.debts || []).length)).toBe(1);
    expect(await page.evaluate(() => planItems().some((x) => x.type === 'aflossen'))).toBe(false);
  });

  test('"Nee, ik wil sparen" verbergt de kaart, onthoudt dat, en laat het formulier staan', async ({ page }) => {
    await openV(page, metSchuld(14));
    await page.evaluate(() => openGoal());
    await page.waitForSelector('#debtNudge');
    await page.locator('#gNaam').fill('Vakantiegeld');

    await page.locator('#debtNudge >> text=Nee, ik wil sparen').click();
    await expect(page.locator('#debtNudge')).toHaveCount(0);
    expect(await page.locator('#gNaam').inputValue()).toBe('Vakantiegeld');   // niet opnieuw opgebouwd
    expect(await page.evaluate(() => SET.debtNudge.debtId)).toBe('d1');
    expect(await page.evaluate(() => SET.debtNudge.rente)).toBe(14);

    // en hij komt niet meteen terug
    await page.evaluate(() => { closeSheet(); openGoal(); });
    expect(await page.locator('#debtNudge').count()).toBe(0);
    // bij een duurdere schuld wél weer
    await page.evaluate(() => { SET.debts.push({ id: 'd2', naam: 'Rood staan', type: 'lening', rest: 800, perMaand: 25, rente: 19 }); closeSheet(); openGoal(); });
    expect(await page.locator('#debtNudge').count()).toBe(1);
    expect(await page.locator('#debtNudge').innerText()).toContain('Rood staan');
  });

  test('goedkope schuld zwijgt, en zonder schuld ook', async ({ page }) => {
    await openV(page, metSchuld(2));                                  // studieschuld-achtig: onder de drempel
    await page.evaluate(() => openGoal());
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#debtNudge').count()).toBe(0);
    expect(await page.evaluate(() => duurSchuldNudge())).toBeNull();

    await page.evaluate(() => { SET.debts = []; closeSheet(); openGoal(); });
    expect(await page.locator('#debtNudge').count()).toBe(0);
  });

  test('bij bewerken van een bestaand doel verschijnt de kaart niet', async ({ page }) => {
    await openV(page, metSchuld(14));
    await page.evaluate(() => openGoal('gA'));
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#debtNudge').count()).toBe(0);
  });
});

// v67: hero en noodfonds-plan-item lazen twee verschillende bronnen voor dezelfde voortgang.
// Sinds spaarSaldo() delen ze er één, inclusief de terugval op je totale saldo.
test.describe('f · noodfonds-voortgang: hero en plan-item zijn het eens', () => {
  const meet = (page) => page.evaluate(() => ({
    hero: Math.round(savingsModel().cur),
    item: planItems().find((x) => x.id === 'noodfonds').gespaard,
    doel: Math.round(noodfondsModel().doel),
    spaar: spaarSaldo(),
    ts: totalSaved(),
    bank: totalBalance().sum,
  }));

  test('met een gemarkeerde spaarrekening', async ({ page }) => {
    await openV(page);
    const r = await meet(page);
    expect(r.ts.n).toBeGreaterThan(0);
    expect(r.spaar.bron).toBe('spaarrekening');
    expect(r.spaar.cur).toBe(r.ts.sum);
    expect(r.item).toBe(Math.min(r.spaar.cur, r.doel));
    expect(r.hero).toBe(r.item);                         // noodfonds is #1 en nog niet vol
  });

  // nfMaanden 12 houdt het noodfonds onvol, zodat het #1 blijft en de hero het écht toont
  // (een bereikt item schuift door naar het volgende doel, zie hierboven).
  test('zonder gemarkeerde spaarrekening valt beide kanten terug op je saldo', async ({ page }) => {
    await openV(page, tweak((s) => { s.savingsEnds = []; s.nfMaanden = 12; s.goals = doelen(); }));
    const r = await meet(page);
    expect(r.ts.n).toBe(0);
    expect(r.spaar.bron).toBe('saldo');
    expect(r.spaar.cur).toBe(r.bank);                    // terugval op het totale saldo
    expect(r.item).toBe(Math.min(r.spaar.cur, r.doel));
    expect(r.item).toBeGreaterThan(0);                   // was 0: dát was de tegenspraak
    expect(r.hero).toBe(r.item);                         // hero en plan-item zeggen hetzelfde
  });

  test('extra spaargeld telt aan beide kanten mee', async ({ page }) => {
    await openV(page, tweak((s) => { s.extraSavings = 500; s.goals = doelen(); }));
    const r = await meet(page);
    expect(r.spaar.cur).toBe(r.ts.sum + 500);
    expect(r.item).toBe(Math.min(r.spaar.cur, r.doel));
    expect(r.hero).toBe(r.item);
  });
});
