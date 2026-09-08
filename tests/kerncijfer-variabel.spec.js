// v89: het kerncijfer "Uitgaven-niveau" is vervangen door "Variabele-lasten-druk", zodat de derde
// band van je referentie-verdeling (vast/variabel/sparen) ook in de Kerncijfers zit.
// v208: die tegel is vervallen. Hij stuurde niets: je wilt minder euro's variabel uitgeven, en het
// instrument daarvoor zijn je potjes, die al je norm voor variabele lasten zijn. Het percentage
// daalde bovendien zodra je vaste lasten stegen, zonder dat je gedrag veranderde.
// Wat deze spec nog bewaakt: het cijfer wordt nog berekend (insKpis rekent alle vier), er is nog
// steeds geen norm-laag, en de maandgrafiek houdt het absolute uitgaven-niveau.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1 } = require('./budget-fixture');

const INK = 3000;
// M1 (afgerond): vast = huur 900 + gift 20 (herkende herhaling), variabel = sport 25 + AH 400 + eten 150
const VARI_M1 = 575;

async function openIns(page, payload) {
  await open(page, payload || seed({ maanden: 8 }));
  await page.evaluate(() => go('maand'));
  await page.waitForSelector('#maandKpiBlok');
}
function tweak(fn) {
  const p = seed({ maanden: 8 }); const set = JSON.parse(p.minder_set); fn(set);
  p.minder_set = JSON.stringify(set); return p;
}
const tegel = (page, key) => page.locator(`.wvo-tile[data-kpi="${key}"]`);   // waar dan ook op het scherm

test.describe('a · de tegel is vervallen, het cijfer niet', () => {
  test('geen enkele tegel toont de variabele-lastendruk', async ({ page }) => {
    await openIns(page);
    await expect(tegel(page, 'vari')).toHaveCount(0);
    await expect(tegel(page, 'niveau')).toHaveCount(0);
    const ins = await page.evaluate(() => { go('ins'); return $('#s-ins').innerText; });
    expect(ins.toLowerCase()).not.toContain('variabele-lasten-druk');
    const maand = await page.evaluate(() => { go('maand'); return $('#s-maand').innerText; });
    expect(maand.toLowerCase()).not.toContain('variabele-lasten-druk');
  });

  test('het cijfer wordt nog berekend, uit splitFixedVar en zonder band', async ({ page }) => {
    await openIns(page);
    const r = await page.evaluate((m) => ({
      raw: insKpis(m).vari.raw,
      eigen: splitFixedVar(m).vari / totals(m).income * 100,
      band: kpiBand('vari'),
    }), M1);
    expect(r.raw).toBeCloseTo(r.eigen, 6);
    expect(r.raw).toBeCloseTo(VARI_M1 / INK * 100, 6);
    expect(r.band).toBe(null);                       // v161: de norm stuurt dit cijfer niet
  });
});

// v165: de referentie-verdeling zelf bestaat niet meer. Hij stuurde sinds v161 geen enkel cijfer
// meer aan en zijn laatste lezer (ruleOfThumbCard) was onbereikbaar, dus de hele laag is weg.
test.describe('b · er is geen norm-laag meer', () => {
  test('de norm-functies bestaan niet meer', async ({ page }) => {
    await openIns(page);
    const r = await page.evaluate(() => ['splitTarget', 'splitMode', 'splitNorm', 'setSplitNorm',
      'ruleOfThumbCard', 'healthSplit'].map((n) => typeof window[n]));
    expect(new Set(r)).toEqual(new Set(['undefined']));
  });

  test('er is geen doellijn, want er is geen band', async ({ page }) => {
    await openIns(page);
    expect(await page.evaluate(() => kpiBand('vari'))).toBe(null);
    // v208: en er is ook geen sparkline meer, want er is geen tegel
    expect(await page.evaluate((m) => maandKpiBlok(m), CUR)).not.toContain('data-kpi="vari"');
  });

  // een achtergebleven waarde in SET mag niets meer doen
  test('een oude norm-instelling in SET verschuift niets', async ({ page }) => {
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
  /* v208: de sheet zelf is ongemoeid, maar hij heeft geen ingang meer: er is geen vari-tegel om op
     te tikken. Dat is het verlies dat met deze ronde is aanvaard; de uitleg en de historie bestaan
     nog als functie. */
  test('de sheet bestaat nog, maar heeft geen ingang meer', async ({ page }) => {
    await openIns(page);
    expect(await page.locator('.wvo-tile[data-kpi="vari"]').count()).toBe(0);
    await page.evaluate(() => openKpiDetail('vari'));
    await page.waitForSelector('#kpiDetailHead');
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('Variabele-lasten-druk');
    expect(t).not.toMatch(/50\/30\/20|gemeten tegen/i);
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
        strip: maandKpiBlok(m),
      };
    }, CUR);
    expect(r.meta.sort()).toEqual(['budget', 'inleg', 'vari', 'vast']);       // v161: restsaldo-quote vervallen
    expect(r.reeksen.sort()).toEqual(['budget', 'inleg', 'vari', 'vast']);
    expect(r.niveau).toBe(true);
    expect(r.ref).toBe(true);
    expect(r.state).toBe('n');                                        // geen aparte niveau-tak meer
    expect(r.strip).not.toContain('Uitgaven-niveau');
    expect(r.strip).not.toContain('gem. €');
    expect(await page.locator('#s-ins').innerText()).not.toContain('Uitgaven-niveau');
  });

  test('budget en vast worden onveranderd berekend', async ({ page }) => {
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
  await page.evaluate(() => renderMaand());
  await page.waitForTimeout(100);
  const r = await page.evaluate(() => {
    const strip = document.getElementById('maandKpiBlok'), sb = strip.getBoundingClientRect();
    const tiles = [...strip.querySelectorAll('.wvo-tile')];
    return {
      pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      buiten: tiles.filter((t) => t.getBoundingClientRect().right > sb.right + 1).length,
      n: tiles.length, sparks: strip.querySelectorAll('svg.spk').length,
    };
  });
  expect(r.pagina).toBe(0);
  expect(r.buiten).toBe(0);
  expect(r.n).toBe(2);        // v208: het maandscherm draagt er twee
  // in de lopende maand heeft de vaste-lastendruk grondtal EUR 20, dus geen percentage en geen
  // sparkline (v161/v193); de tegel zelf staat er wel
  expect(r.sparks).toBe(1);
});
