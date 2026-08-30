// v123: spaardoelen konden alleen van bedrag en tempo naar een datum rekenen (allocatePlan zet
// eta = ceil(rest/alloc)). Dit is de omgekeerde richting: je geeft een streefdatum op en de app
// rekent uit wat je per maand nodig hebt en hoeveel dat scheelt met wat er nu heen gaat.
// doelTempo() is puur; doelTempoLine() zet er de zin omheen, in de spiegel-gevolg-keuze-vorm.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const overMnd = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';

// capaciteit = monthlySavingTarget: vast bedrag van 200 per maand, zodat alloc voorspelbaar is
function seedDoel(goals, extra = {}) {
  const tx = [
    { id: 'i1', date: `${CUR}-01`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    { id: 'e1', date: `${CUR}-05`, amount: -400, acc: MAIN, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
  ];
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 200, savingsEnds: ['4323'],
      manualBal: { [MAIN]: 2000, [SAV]: 0 },
      nfDoelVast: 1,                       // noodfonds vrijwel nul: de capaciteit gaat naar de doelen
      vooruitDoelOpen: true,               // "Mijn plan" staat standaard ingeklapt op Vooruitblik
      goals, planOrder: (goals || []).map((g) => g.id),
    }, extra)),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof doelTempo === 'function');
}

const G = (over) => Object.assign({ id: 'g1', naam: 'Vakantie', doel: 8000, gespaard: 0, allocMode: 'fixed', perMaand: 200 }, over);
const item = (page, id) => page.evaluate((x) => allocatePlan().find((p) => p.id === x), id || 'g1');
const regel = (page, id) => page.evaluate((x) => {
  const p = allocatePlan().find((q) => q.id === x);
  return doelTempoLine(p).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}, id || 'g1');

test.describe('a · de rekenregel', () => {
  test('maandenTot telt hele maanden vanaf deze maand', async ({ page }) => {
    await boot(page, seedDoel([G()]));
    const uit = await page.evaluate((m) => ({
      nul: doelMaandenTot(m.cur), een: doelMaandenTot(m.een), tw: doelMaandenTot(m.twaalf),
      terug: doelMaandenTot(m.terug), rommel: doelMaandenTot('2028-13'), leeg: doelMaandenTot(''),
    }), { cur: CUR, een: overMnd(1), twaalf: overMnd(12), terug: overMnd(-3) });
    expect(uit).toEqual({ nul: 0, een: 1, tw: 12, terug: -3, rommel: null, leeg: null });
  });

  test('benodigd, gat en haalbaar volgen rest en inleg', async ({ page }) => {
    await boot(page, seedDoel([G({ streefdatum: overMnd(28) })]));
    const T = await page.evaluate(() => doelTempo(allocatePlan().find((p) => p.id === 'g1'), 200));
    expect(T.maandenTot).toBe(28);
    expect(T.benodigd).toBe(Math.ceil(8000 / 28));    // 286, naar boven afgerond
    expect(T.gat).toBe(T.benodigd - 200);
    expect(T.haalbaar).toBe(false);
  });

  test('rondt nooit naar iets optimistischers af', async ({ page }) => {
    // 1001 in 10 maanden = 100,1 -> 101, niet 100
    await boot(page, seedDoel([G({ doel: 1001, streefdatum: overMnd(10) })]));
    const T = await page.evaluate(() => doelTempo({ doel: 1001, gespaard: 0, streefdatum: document.title && null }, 0) || null);
    const T2 = await page.evaluate((d) => doelTempo({ doel: 1001, gespaard: 0, streefdatum: d }, 100), overMnd(10));
    expect(T).toBeNull();                              // zonder geldige datum: niets beweren
    expect(T2).toEqual({ maandenTot: 10, benodigd: 101, gat: 1, haalbaar: false });
  });

  test('null zonder datum, bij een bereikt doel en bij een verstreken datum', async ({ page }) => {
    await boot(page, seedDoel([G()]));
    const uit = await page.evaluate((m) => ({
      geen: doelTempo({ doel: 500, gespaard: 0 }, 50),
      bereikt: doelTempo({ doel: 500, gespaard: 500, streefdatum: m.later }, 50),
      verstreken: doelTempo({ doel: 500, gespaard: 0, streefdatum: m.terug }, 50),
      dezeMaand: doelTempo({ doel: 500, gespaard: 0, streefdatum: m.cur }, 50),
    }), { later: overMnd(6), terug: overMnd(-2), cur: CUR });
    expect(uit).toEqual({ geen: null, bereikt: null, verstreken: null, dezeMaand: null });
  });

  test('gebruikt de resterende behoefte, niet het hele doelbedrag', async ({ page }) => {
    await boot(page, seedDoel([G({ gespaard: 6000, streefdatum: overMnd(10) })]));
    const T = await page.evaluate(() => doelTempo(allocatePlan().find((p) => p.id === 'g1'), 200));
    expect(T.benodigd).toBe(200);                      // 2000 rest / 10 maanden
    expect(T.haalbaar).toBe(true);
  });
});

test.describe('b · de zin', () => {
  test('tekort: spiegel, gevolg, verschil', async ({ page }) => {
    await boot(page, seedDoel([G({ streefdatum: overMnd(28) })]));
    const p = await item(page);
    expect(p.alloc).toBe(200);
    const t = await regel(page);
    expect(t).toBe(`Je legt nu €200 per maand in. Voor €8.000 in ${await page.evaluate((d) => doelDatumLabel(d), overMnd(28))} heb je €286 per maand nodig. Je komt €86 per maand tekort.`);
    expect(t).not.toMatch(/[!—]/);                     // geen uitroeptekens, geen em-dashes
  });

  test('haalbaar: de datum wordt gehaald, met de speling erbij', async ({ page }) => {
    await boot(page, seedDoel([G({ doel: 1000, streefdatum: overMnd(6) })]));
    const p = await item(page);
    expect(p.eta).toBe(5);                             // 1000 / 200
    expect(await regel(page)).toBe('Je huidige inleg haalt de datum, met 1 maand speling.');
  });

  test('precies op de datum krijgt geen speling toegedicht', async ({ page }) => {
    await boot(page, seedDoel([G({ doel: 1000, streefdatum: overMnd(5) })]));
    expect(await regel(page)).toBe('Je huidige inleg haalt de datum, precies op de datum.');
  });

  test('bij gespaard geld noemt de zin de resterende behoefte', async ({ page }) => {
    await boot(page, seedDoel([G({ doel: 8000, gespaard: 3000, streefdatum: overMnd(10) })]));
    expect(await regel(page)).toContain('Voor de resterende €5.000');
  });

  test('verstreken datum: melden, niets rekenen', async ({ page }) => {
    await boot(page, seedDoel([G({ streefdatum: overMnd(-2) })]));
    const t = await regel(page);
    expect(t).toMatch(/is verstreken\. Er wordt hier niets meer teruggerekend\./);
    expect(t).not.toMatch(/per maand nodig/);
  });

  test('zonder toewijzing: het benodigde bedrag, en dat er nu niets heen gaat', async ({ page }) => {
    // twee doelen, capaciteit 200 gaat volledig naar het eerste
    await boot(page, seedDoel([
      G({ id: 'g0', naam: 'Eerst', doel: 5000, allocMode: 'fixed', perMaand: 200 }),
      G({ id: 'g1', naam: 'Later', doel: 2400, allocMode: 'fixed', perMaand: 100, streefdatum: overMnd(12) }),
    ]));
    const p = await item(page, 'g1');
    expect(p.alloc).toBe(0);
    expect(p.status).toBe('wacht op capaciteit');
    const t = await regel(page, 'g1');
    expect(t).toContain('Er gaat op dit moment niets naar dit doel');
    expect(t).toContain('€200 per maand nodig');       // 2400 / 12
  });

  test('een bereikt doel krijgt geen tempo-regel', async ({ page }) => {
    await boot(page, seedDoel([G({ doel: 500, gespaard: 500, streefdatum: overMnd(6) })]));
    expect(await regel(page)).toBe('');
  });

  test('een gepauzeerd doel ook niet', async ({ page }) => {
    await boot(page, seedDoel([G({ streefdatum: overMnd(28) })], { planPaused: { g1: true } }));
    expect(await regel(page)).toBe('');
  });
});

test.describe('c · eta en streefdatum spreken elkaar niet tegen', () => {
  test('haalbaar betekent dat eta binnen het aantal maanden past', async ({ page }) => {
    for (const [doel, mnd] of [[1000, 6], [2000, 10], [400, 2]]) {
      await boot(page, seedDoel([G({ doel, streefdatum: overMnd(mnd) })]));
      const p = await item(page);
      const T = await page.evaluate(() => doelTempo(allocatePlan().find((q) => q.id === 'g1'), allocatePlan().find((q) => q.id === 'g1').alloc));
      if (T && T.haalbaar) expect(p.eta).toBeLessThanOrEqual(T.maandenTot);
      if (T && !T.haalbaar) expect(p.eta).toBeGreaterThan(T.maandenTot);
    }
  });
});

test.describe('d · opslaan en tonen', () => {
  test('de editor heeft een lege maand-invoer en bewaart YYYY-MM', async ({ page }) => {
    await boot(page, seedDoel([G()]));
    await page.evaluate(() => openGoal('g1'));
    await page.waitForSelector('#gDatum');
    expect(await page.locator('#gDatum').inputValue()).toBe('');      // nog geen datum
    await page.locator('#gDatum').fill(overMnd(28));
    await page.locator('#sheet >> text=Opslaan').click();
    await page.waitForSelector('#sheetBg.show', { state: 'detached' });
    expect(await page.evaluate(() => SET.goals[0].streefdatum)).toBe(overMnd(28));
  });

  test('leeg opslaan laat de sleutel weg, en het doel gedraagt zich als voorheen', async ({ page }) => {
    await boot(page, seedDoel([G({ streefdatum: overMnd(28) })]));
    await page.evaluate(() => openGoal('g1'));
    await page.waitForSelector('#gDatum');
    await page.locator('#gDatum').fill('');
    await page.locator('#sheet >> text=Opslaan').click();
    await page.waitForSelector('#sheetBg.show', { state: 'detached' });
    const g = await page.evaluate(() => JSON.parse(JSON.stringify(SET.goals[0])));
    expect('streefdatum' in g).toBe(false);
    expect(await regel(page)).toBe('');
    expect((await item(page)).eta).toBe(40);                          // 8000 / 200, ongewijzigd
  });

  test('de regel staat in de planlijst en in de editor', async ({ page }) => {
    await boot(page, seedDoel([G({ streefdatum: overMnd(28) })]));
    await page.evaluate(() => { go('vooruit'); });
    await page.waitForSelector('.plan-item');
    expect(await page.locator('.plan-item[data-id="g1"]').innerText()).toContain('per maand nodig');

    await page.evaluate(() => openGoal('g1'));
    await page.waitForSelector('#gDatum');
    expect(await page.locator('#sheet').innerText()).toContain('per maand nodig');
  });

  test('een doel zonder streefdatum toont niets extra in de planlijst', async ({ page }) => {
    await boot(page, seedDoel([G()]));
    await page.evaluate(() => { go('vooruit'); });
    await page.waitForSelector('.plan-item');
    const t = await page.locator('.plan-item[data-id="g1"]').innerText();
    expect(t).not.toContain('per maand nodig');
    expect(t).toContain('op dit tempo');                              // de bestaande eta-regel blijft
  });
});
