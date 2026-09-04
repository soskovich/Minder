// v89: het kerncijfer "Uitgaven-niveau" is vervangen door "Variabele-lasten-druk", zodat de derde
// band van je referentie-verdeling (vast/variabel/sparen) ook in de Kerncijfers zit.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1 } = require('./budget-fixture');

const INK = 3000;
// M1 (afgerond): vast = huur 900 + gift 20 (herkende herhaling), variabel = sport 25 + AH 400 + eten 150
const VARI_M1 = 575;

async function openIns(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#insKpiStrip');
}
function tweak(fn) {
  const p = seed(); const set = JSON.parse(p.minder_set); fn(set);
  p.minder_set = JSON.stringify(set); return p;
}
const tegel = (page, key) => page.locator(`#insKpiStrip .wvo-tile[data-kpi="${key}"]`);

test.describe('a · de nieuwe tegel', () => {
  test('staat er, met waarde uit splitFixedVar zonder band', async ({ page }) => {
    await openIns(page);
    await expect(tegel(page, 'vari')).toHaveCount(1);
    await expect(tegel(page, 'niveau')).toHaveCount(0);

    const t = await tegel(page, 'vari').innerText();
    expect(t.toLowerCase()).toContain('variabele-lasten-druk');
    expect(t).toContain('geen doel');   // v161: de norm stuurt dit cijfer niet meer
    expect(t).toMatch(/\d+%/);                                       // een percentage, geen euro's
    expect(t).not.toMatch(/€/);

    const r = await page.evaluate((ms) => ({
      cur: insKpis(ms.CUR).vari.raw,
      eigen: splitFixedVar(ms.CUR).vari / totals(ms.CUR).income * 100,
      m1: insKpis(ms.M1).vari.raw,
      band: kpiBand('vari'), bandTxt: kpiBandTxt('vari'), norm: splitTarget().vari,
      volgorde: insKpis(ms.CUR).items.map((x) => x.key),
    }), { CUR, M1 });

    expect(r.cur).toBeCloseTo(r.eigen, 6);                            // exact de bestaande bron
    expect(r.m1).toBeCloseTo(VARI_M1 / INK * 100, 6);                 // 19,2% in de fixture
    expect(r.band).toBe(null);
    expect(r.bandTxt).toContain('geen doel');
    expect(r.volgorde).toEqual(['inleg', 'budget', 'vari', 'vast']);   // v161: restsaldo vervallen
  });

  // v161: zonder norm is er geen oordeel. Het cijfer blijft, de kleur is neutraal.
  test('zonder norm geen oordeel, wel een cijfer', async ({ page }) => {
    await openIns(page);
    const k = await page.evaluate((m) => { const K = insKpis(m); return { raw: K.vari.raw, state: K.vari.state, band: K.vari.band }; }, CUR);
    expect(k.raw).toBeGreaterThan(0);
    expect(k.state).toBe('n');
    expect(k.band).toContain('geen doel');
  });

  test('lopende maand: geen oordeel; inkomen onbekend: —', async ({ page }) => {
    await openIns(page);
    const nu = await page.evaluate((m) => insKpis(m).vari, CUR);
    expect(nu.oordeel).toBe('loopt nog');
    expect(nu.state).toBe('n');

    await openIns(page, tweak((s) => { s.income = 0; }));
    const geen = await page.evaluate((m) => insKpis(m).vari, CUR);
    expect(geen.val).toBe('—');
    expect(geen.band).toBe('inkomen onbekend');
    expect(await page.locator('#insKpiStrip').innerText()).not.toMatch(/NaN|Infinity/);
  });
});

test.describe('b · de band volgt je referentie-verdeling', () => {
  test('een andere norm verschuift het cijfer niet', async ({ page }) => {
    await openIns(page);
    const voor = await page.evaluate((m) => insKpis(m).vari.raw, CUR);
    await page.evaluate(() => { SET.splitMode = '702010'; save(); });
    expect(await page.evaluate((m) => insKpis(m).vari.raw, CUR)).toBe(voor);
  });

  test('de sparkline heeft geen doellijn meer', async ({ page }) => {
    await openIns(page);
    const h = await page.evaluate((m) => insKpiStrip(m), CUR);
    expect(h).toContain('data-kpi="vari"');
    expect(await page.evaluate(() => kpiBand('vari'))).toBe(null);
  });

  // v161: een eigen norm verschuift niets meer aan dit cijfer.
  test('een eigen norm verschuift de band niet meer', async ({ page }) => {
    await openIns(page);
    const voor = await page.evaluate((m) => insKpis(m).vari.raw, CUR);
    await page.evaluate(() => { SET.splitMode = 'custom'; SET.splitTarget = { fixed: 40, vari: 40, save: 20 }; save(); });
    expect(await page.evaluate((m) => insKpis(m).vari.raw, CUR)).toBe(voor);
    expect(await page.evaluate(() => kpiBand('vari'))).toBe(null);
  });
});

test.describe('c · het detail', () => {
  // v161: de norm stuurt dit cijfer niet meer, dus er is geen norm-lijn en geen actieve norm
  // in de sheet. De historie zelf blijft.
  test('toont de percentage-historie, zonder norm-lijn', async ({ page }) => {
    await openIns(page);
    await page.evaluate(() => openKpiDetail('vari'));
    await page.waitForSelector('#kpiDetailHead');
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('Variabele-lasten-druk');
    expect(t).not.toMatch(/50\/30\/20|gemeten tegen/i);
    expect(await page.evaluate(() => kpiBand('vari'))).toBe(null);
  });
});

test.describe('d · opgeruimd en de rest ongewijzigd', () => {
  test('geen enkele niveau-verwijzing blijft over', async ({ page }) => {
    await openIns(page);
    const r = await page.evaluate((m) => {
      const K = insKpis(m), S = insKpiSeries();
      return {
        meta: Object.keys(KPI_META), reeksen: Object.keys(S).filter((k) => k !== 'ms'),
        niveau: K.niveau === undefined, ref: K.niveauRef === undefined,
        state: kpiState('niveau', 500, 400),
        strip: insKpiStrip(m),
      };
    }, CUR);
    expect(r.meta.sort()).toEqual(['budget', 'inleg', 'spaar', 'vari', 'vast']);
    expect(r.reeksen.sort()).toEqual(['budget', 'inleg', 'spaar', 'vari', 'vast']);
    expect(r.niveau).toBe(true);
    expect(r.ref).toBe(true);
    expect(r.state).toBe('n');                                        // geen aparte niveau-tak meer
    expect(r.strip).not.toContain('Uitgaven-niveau');
    expect(r.strip).not.toContain('gem. €');
    expect(await page.locator('#s-ins').innerText()).not.toContain('Uitgaven-niveau');
  });

  test('budget en vast zijn onveranderd', async ({ page }) => {
    await openIns(page);
    const k = await page.evaluate((m) => {
      const K = insKpis(m);
      return { budget: K.budget.raw, vast: K.vast.raw, keys: K.items.map((x) => x.key) };
    }, CUR);
    expect(k.keys).toEqual(['inleg', 'budget', 'vari', 'vast']);   // v161: vier, restsaldo vervallen
    expect(k.budget).not.toBeNull();
    expect(k.vast).not.toBeNull();
  });

  test('het absolute uitgaven-niveau blijft zichtbaar in de maandgrafiek', async ({ page }) => {
    await openIns(page);
    const chart = await page.evaluate(() => spendVsBudgetChart());
    expect(chart).toContain('Uitgaven vs budget');
    expect(chart).toMatch(/€/);                                       // de euro's staan daar nog
  });
});

test('e · de tegels passen nog steeds op 360px', async ({ page }) => {
  await openIns(page);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.evaluate(() => renderIns());
  await page.waitForTimeout(100);
  const r = await page.evaluate(() => {
    const strip = document.getElementById('insKpiStrip'), sb = strip.getBoundingClientRect();
    const tiles = [...strip.querySelectorAll('.wvo-tile')];
    return {
      pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      buiten: tiles.filter((t) => t.getBoundingClientRect().right > sb.right + 1).length,
      n: tiles.length, sparks: strip.querySelectorAll('svg.spk').length,
    };
  });
  expect(r.pagina).toBe(0);
  expect(r.buiten).toBe(0);
  expect(r.n).toBe(2);        // v161: Inzichten draagt er nog twee
  expect(r.sparks).toBe(2);
});
