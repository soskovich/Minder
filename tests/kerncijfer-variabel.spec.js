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
  test('staat er, met waarde uit splitFixedVar en de variabel-norm als band', async ({ page }) => {
    await openIns(page);
    await expect(tegel(page, 'vari')).toHaveCount(1);
    await expect(tegel(page, 'niveau')).toHaveCount(0);

    const t = await tegel(page, 'vari').innerText();
    expect(t.toLowerCase()).toContain('variabele-lasten-druk');
    expect(t).toContain('doel onder 30%');
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
    expect(r.band).toBe(30);
    expect(r.band).toBe(r.norm);
    expect(r.bandTxt).toBe('doel onder 30%');
    expect(r.volgorde).toEqual(['spaar', 'budget', 'vari', 'vast']);  // vari en vast naast elkaar
  });

  test('oordeelt als drukmetriek: lager is gezonder', async ({ page }) => {
    await openIns(page);
    const r = await page.evaluate((m) => ({
      onder: kpiState('vari', 29), grens: kpiState('vari', 30), mid: kpiState('vari', 38), boven: kpiState('vari', 45),
      leeg: kpiState('vari', null), m1: insKpis(m).vari.oordeel, m1state: insKpis(m).vari.trendState,
    }), M1);
    expect(r.onder).toBe('good');                                     // onder de norm van 30
    expect(r.grens).toBe('mid');                                      // op de norm: krap
    expect(r.mid).toBe('mid');                                        // t/m 1,3 x de norm
    expect(r.boven).toBe('bad');
    expect(r.leeg).toBe('n');
    expect(r.m1).toBe('goed');                                        // 19,2% in de fixture
    expect(r.m1state).toBe('good');
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
  test('een andere norm verschuift de band en het oordeel', async ({ page }) => {
    await openIns(page);
    expect(await page.evaluate(() => kpiBand('vari'))).toBe(30);

    await page.evaluate(() => { setSplitMode('60'); });               // 60/25/15
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => kpiBand('vari'))).toBe(25);
    expect(await tegel(page, 'vari').innerText()).toContain('doel onder 25%');
    // en het oordeel schuift mee: 27% is krap bij 25, goed bij 30
    expect(await page.evaluate(() => kpiState('vari', 27))).toBe('mid');
    await page.evaluate(() => { setSplitMode('503020'); });
    expect(await page.evaluate(() => kpiState('vari', 27))).toBe('good');
  });

  test('de sparkline-referentielijn van vari zit op de norm en schuift mee', async ({ page }) => {
    // de fixture zit rond 14-19% variabel; een norm ver daarbuiten laat miniSparkLine de lijn weg
    // (v78, anders drukt hij de eigen beweging plat), dus we toetsen met normen binnen dat bereik
    const lijnY = () => page.locator('#insKpiStrip .wvo-tile[data-kpi="vari"] svg.spk line').getAttribute('y1');
    await openIns(page, tweak((s) => { s.splitMode = 'custom'; s.splitTarget = { fixed: 62, vari: 18, save: 20 }; }));
    const y18 = await lijnY();
    expect(await page.evaluate(() => kpiBand('vari'))).toBe(18);

    await page.evaluate(() => { SET.splitTarget = { fixed: 60, vari: 20, save: 20 }; save(); renderIns(); });
    await page.waitForTimeout(120);
    const y20 = await lijnY();
    expect(await page.evaluate(() => kpiBand('vari'))).toBe(20);
    expect(y18).not.toBe(y20);                                        // de gestreepte norm-lijn schuift mee
  });

  test('een eigen norm werkt net zo', async ({ page }) => {
    await openIns(page, tweak((s) => { s.splitMode = 'custom'; s.splitTarget = { fixed: 40, vari: 40, save: 20 }; }));
    expect(await page.evaluate(() => kpiBand('vari'))).toBe(40);
    expect(await tegel(page, 'vari').innerText()).toContain('doel onder 40%');
  });
});

test.describe('c · het detail', () => {
  test('toont de percentage-historie met norm-lijn en de actieve norm', async ({ page }) => {
    await openIns(page);
    await tegel(page, 'vari').click();
    await page.waitForSelector('#kpiHist');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Variabele-lasten-druk');
    expect(sheet).toContain('variabele uitgaven ÷ inkomen');
    expect(sheet).toContain('doel onder 30%');
    expect(sheet).toContain('Gemeten tegen: 50/30/20');               // splitNormLine staat eronder
    expect(sheet).toContain('een ijkpunt, geen wet');

    const svg = await page.locator('#kpiHist').innerHTML();
    expect(svg).toContain('doel onder 30%');                          // gelabelde bandlijn
    expect(await page.locator('#kpiHist line[stroke-dasharray]').count()).toBe(1);
    expect(svg).not.toMatch(/€/);                                     // percentage-as, geen euro's
    expect(svg).not.toContain('gemiddeld');                           // geen "eigen gemiddelde" meer

    await page.evaluate(() => closeSheet());
    await tegel(page, 'budget').click();                              // budget houdt zijn eigen band
    await page.waitForSelector('#kpiDetailHead');
    expect(await page.locator('#sheet').innerText()).not.toContain('Gemeten tegen:');
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
    expect(r.meta.sort()).toEqual(['budget', 'spaar', 'vari', 'vast']);
    expect(r.reeksen.sort()).toEqual(['budget', 'spaar', 'vari', 'vast']);
    expect(r.niveau).toBe(true);
    expect(r.ref).toBe(true);
    expect(r.state).toBe('n');                                        // geen aparte niveau-tak meer
    expect(r.strip).not.toContain('Uitgaven-niveau');
    expect(r.strip).not.toContain('gem. €');
    expect(await page.locator('#s-ins').innerText()).not.toContain('Uitgaven-niveau');
  });

  test('spaar, budget en vast zijn onveranderd', async ({ page }) => {
    await openIns(page);
    const r = await page.evaluate((ms) => {
      const K = insKpis(ms.M1), t = totals(ms.M1);
      return {
        spaar: K.spaar.raw, spaarEigen: (t.income - t.spend) / t.income * 100, spaarBand: kpiBandTxt('spaar'),
        budget: K.budget.raw, budgetEigen: t.spend / t.budget * 100, budgetBand: kpiBandTxt('budget'), src: K.budget.src,
        vast: K.vast.raw, vastEigen: splitFixedVar(ms.M1).fixed / t.income * 100, vastBand: kpiBandTxt('vast'),
      };
    }, { M1 });
    expect(r.spaar).toBeCloseTo(r.spaarEigen, 6);
    expect(r.spaarBand).toBe('doel 20% of meer');
    expect(r.budget).toBeCloseTo(r.budgetEigen, 6);
    expect(r.budgetBand).toBe('doel 100% of minder');
    expect(r.src).toBe('potjes');
    expect(r.vast).toBeCloseTo(r.vastEigen, 6);
    expect(r.vastBand).toBe('doel onder 50%');
  });

  test('het absolute uitgaven-niveau blijft zichtbaar in de maandgrafiek', async ({ page }) => {
    await openIns(page);
    const chart = await page.evaluate(() => spendVsBudgetChart());
    expect(chart).toContain('Uitgaven vs budget');
    expect(chart).toMatch(/€/);                                       // de euro's staan daar nog
  });
});

test('e · vier tegels passen nog steeds op 360px', async ({ page }) => {
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
  expect(r.n).toBe(4);
  expect(r.sparks).toBe(4);
});
