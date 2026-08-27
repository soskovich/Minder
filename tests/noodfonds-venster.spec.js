// v107: noodfondsModel() rekende over months().slice(-12), en months() telt de lopende maand
// altijd mee. Die is nog niet af, dus voor de periodieke posten (NF_PERIODIEK, gemiddelde in
// plaats van mediaan) drukte een halve maand het doel omlaag en liep het binnen de maand vanzelf
// op. Nu tellen alleen afgeronde maanden mee, zoals de rest van de codebase al deed.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { open, CUR, M1, M2, MAIN, SAV } = require('./budget-fixture');

// eigen fixture: een verzekering (NF_PERIODIEK -> gemiddelde) maakt het effect meetbaar
function seedNf({ lopendeMaand = true, maanden = [M2, M1] } = {}) {
  const tx = [];
  const add = (id, m, day, amount, name, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of maanden) {
    add('inc-' + m, m, '01', 3000, 'Werkgever', 'SALARIS LOON');
    add('huur-' + m, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('verz-' + m, m, '04', -120, 'Verzekeraar', 'SEPA INCASSO ZORGVERZEKERING');
    add('ah-' + m, m, '08', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  if (lopendeMaand) {   // de lopende maand: bewust mager, zoals halverwege de maand
    add('inc-' + CUR, CUR, '01', 3000, 'Werkgever', 'SALARIS LOON');
    add('ah-' + CUR, CUR, '02', -50, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000, nfMaanden: 4, manualBal: { [MAIN]: 1000, [SAV]: 2000 }, savingsEnds: ['4323'] }),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
const model = (page) => page.evaluate(() => { const M = noodfondsModel(); return { win: M.win, n: M.n, winLopend: M.winLopend, essCrisis: M.essCrisis, doel: M.doel, doelAuto: M.doelAuto }; });

test.describe('a · alleen afgeronde maanden', () => {
  test('de lopende maand zit niet in het venster', async ({ page }) => {
    await open(page, seedNf());
    const M = await model(page);
    expect(M.win).not.toContain(CUR);
    expect(M.win).toEqual([M2, M1]);
    expect(M.winLopend).toBe(false);
    expect(M.n).toBe(2);
  });

  test('de magere lopende maand drukt het doel niet meer omlaag', async ({ page }) => {
    await open(page, seedNf());
    const nieuw = await model(page);
    // het oude gedrag nagebouwd: mét de lopende maand in het venster
    const oud = await page.evaluate(() => {
      const win = months().slice(-12), maps = win.map((m) => catSpendMap(m)), n = win.length || 1;
      const reeks = maps.map((sm) => sm['verzekering'] || 0);
      return { n, gem: reeks.reduce((a, b) => a + b, 0) / n };
    });
    const nu = await page.evaluate(() => {
      const M = noodfondsModel(), maps = M.win.map((m) => catSpendMap(m));
      const reeks = maps.map((sm) => sm['verzekering'] || 0);
      return { n: M.n, gem: reeks.reduce((a, b) => a + b, 0) / M.n };
    });
    expect(oud.n).toBe(3);                       // de oude telling nam de lopende maand mee
    expect(nu.gem).toBeGreaterThan(oud.gem);     // en verlaagde daarmee het gemiddelde
    expect(nu.gem).toBe(120);                    // nu de echte maandpremie
    expect(nieuw.essCrisis).toBeGreaterThan(0);
  });

  test('nieuwe uitgaven in de lopende maand verschuiven het doel niet meer', async ({ page }) => {
    await open(page, seedNf());
    const voor = await model(page);
    await page.evaluate((m) => {
      const t = { id: 'later', date: `${m}-20`, amount: -450, acc: OWN[0], name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };
      TX.push(t); categorize(t); save();
    }, CUR);
    const na = await model(page);
    expect(na.doelAuto).toBe(voor.doelAuto);     // dít was de klacht: het doel bewoog vanzelf
    expect(na.win).toEqual(voor.win);
  });

  test('een afgeronde maand telt wél mee', async ({ page }) => {
    await open(page, seedNf());
    const voor = await model(page);
    await page.evaluate((m) => {
      const t = { id: 'oud', date: `${m}-20`, amount: -450, acc: OWN[0], name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };
      TX.push(t); categorize(t); save();
    }, M1);
    const na = await model(page);
    expect(na.doelAuto).toBeGreaterThan(voor.doelAuto);
  });
});

test.describe('b · terugval als er nog geen afgeronde maand is', () => {
  test('een verse import valt terug op de lopende maand', async ({ page }) => {
    await open(page, seedNf({ maanden: [] }));   // alleen de lopende maand
    const M = await model(page);
    expect(M.winLopend).toBe(true);
    expect(M.win).toContain(CUR);
    expect(M.doel).toBeGreaterThanOrEqual(0);    // geen doel van niets, wél een doel
  });

  test('en de sheet zegt dat het nog verschuift', async ({ page }) => {
    await open(page, seedNf({ maanden: [] }));
    await page.evaluate(() => openNoodfondsPanel());
    await page.waitForTimeout(60);
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('nog geen afgeronde maand');
    expect(s).toContain('verschuift nog');
  });

  test('zodra er een afgeronde maand is, neemt die het over', async ({ page }) => {
    await open(page, seedNf());
    const M = await model(page);
    expect(M.winLopend).toBe(false);
    expect(M.win).not.toContain(CUR);
  });
});

test.describe('c · het staat er eerlijk bij', () => {
  test('de sheet noemt het aantal afgeronde maanden', async ({ page }) => {
    await open(page, seedNf());
    await page.evaluate(() => openNoodfondsPanel());
    await page.waitForTimeout(60);
    const s = await page.locator('#sheet').innerText();
    expect(s).toMatch(/geschat uit je laatste 2 afgeronde maanden/);
    expect(s).toContain('nog niet af');
  });

  test('bij één afgeronde maand staat er enkelvoud', async ({ page }) => {
    await open(page, seedNf({ maanden: [M1] }));
    await page.evaluate(() => openNoodfondsPanel());
    await page.waitForTimeout(60);
    expect(await page.locator('#sheet').innerText()).toContain('geschat uit je afgeronde maand');
  });

  test('een vastgezet doel trekt zich er niets van aan', async ({ page }) => {
    await open(page, seedNf());
    await page.evaluate(() => setNfDoelVast(9000));
    const M = await model(page);
    expect(M.doel).toBe(9000);                   // v101 blijft leidend
    expect(M.doelAuto).not.toBe(9000);           // de schatting loopt er los naast
  });
});
