// v209: de vaste-lastendruk is van Maand af, dezelfde redenering waarmee de variabele-lastendruk in
// v208 van Inzichten verdween. Hij had geen doel (kpiBand geeft null sinds v161), stond vaak op een
// te klein grondtal, en je stuurt er niet op: je vaste lasten verander je door een abonnement op te
// zeggen of te verhuizen, niet door naar een percentage te kijken.
//
// De spaarquote blijft, ongewijzigd. Die telt sinds v161 je hele vermogensopbouw - spaarrekening,
// reserveringen en beleggingsinleg - en dat cijfer verandert wel met wat je doet.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1 } = require('./budget-fixture');

const blok = (page, m) => page.evaluate((mm) => {
  if (mm) curMonth = mm;
  go('maand');
  const b = document.getElementById('maandKpiBlok');
  return b ? {
    tekst: b.innerText,
    tegels: [...b.querySelectorAll('[data-kpi]')].map((e) => e.dataset.kpi),
    sparks: b.querySelectorAll('svg.spk').length,
    knoppen: b.querySelectorAll('.snz').length,
    kolommen: getComputedStyle(b.querySelector('.wvo-tiles')).gridTemplateColumns.split(' ').length,
  } : null;
}, m);

test.describe('a - de vaste-lastendruk wordt nergens meer getoond', () => {
  test('niet op Maand, niet op Inzichten, niet op Home', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    for (const [scherm, sel] of [['maand', '#s-maand'], ['ins', '#s-ins'], ['dash', '#s-dash']]) {
      const t = await page.evaluate(([s, q]) => { go(s); return $(q).innerText; }, [scherm, sel]);
      expect(t.toLowerCase(), scherm).not.toContain('vaste-lasten-druk');
      expect(t.toLowerCase(), scherm).not.toContain('vaste lasten ÷');
    }
    expect(await page.evaluate(() => document.querySelectorAll('[data-kpi="vast"]').length)).toBe(0);
  });

  test('ook bij een afgesloten maand en in elke modus niet', async ({ page }) => {
    for (const mode of ['rustig', 'begeleid', 'expert']) {
      const p = seed({ maanden: 8 });
      const s = JSON.parse(p.minder_set); s.mode = mode; p.minder_set = JSON.stringify(s);
      await open(page, p);
      for (const m of [null, M1]) {
        const b = await blok(page, m);
        expect(b.tegels, mode + ' ' + m).toEqual(['inleg']);
      }
    }
  });

  test('de sheet is er nog als functie, maar heeft geen ingang', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    expect(await page.evaluate(() => document.querySelectorAll('.wvo-tile[data-kpi="vast"]').length)).toBe(0);
    // de laag zelf is niet gesloopt; alleen de tegel die hem opende is weg
    await page.evaluate(() => openKpiDetail('vast'));
    await page.waitForSelector('#kpiDetailHead');
    expect(await page.locator('#sheet').innerText()).toContain('Vaste-lasten-druk');
  });
});

test.describe('b - de berekening is ongemoeid', () => {
  test('splitFixedVar en het cijfer zelf blijven bestaan', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const r = await page.evaluate((m) => ({
      split: typeof splitFixedVar,
      fixed: splitFixedVar(m).fixed,
      raw: insKpis(m).vast.raw,
      eigen: splitFixedVar(m).fixed / totals(m).income * 100,
      meta: Object.keys(KPI_META).sort(),
      reeksen: Object.keys(insKpiSeries()).filter((k) => k !== 'ms').sort(),
    }), M1);
    expect(r.split).toBe('function');
    expect(r.fixed).toBeGreaterThan(0);
    expect(r.raw).toBeCloseTo(r.eigen, 6);
    expect(r.meta).toEqual(['budget', 'inleg', 'vari', 'vast']);
    expect(r.reeksen).toEqual(['budget', 'inleg', 'vari', 'vast']);
  });

  test('de lezers van splitFixedVar blijven werken', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const r = await page.evaluate((m) => ({
      agg: monthAgg(m).fixed,
      safe: typeof safeToSpend().safe,
      nf: typeof noodfondsModel().essCrisis,
      fin: financeModel().months.length,
    }), M1);
    expect(r.agg).toBeGreaterThan(0);
    expect(r.safe).toBe('number');
    expect(r.nf).toBe('number');
    expect(r.fin).toBe(12);
  });
});

test.describe('c - de spaarquote is ongewijzigd', () => {
  test('volledig jaar historie: cijfer, sparkline en de tik naar de opbouw', async ({ page }) => {
    await open(page, seed({ maanden: 12 }));
    const b = await blok(page, M1);
    expect(b.tegels).toEqual(['inleg']);
    expect(b.sparks).toBe(1);
    expect(b.tekst.toLowerCase()).toContain('spaarquote');
    await page.locator('#maandKpiBlok .wvo-tile[data-kpi="inleg"]').click();
    await page.waitForSelector('#kpiDetailHead');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Spaarquote');
    expect(sheet).toContain('Waaruit dit cijfer is opgebouwd');   // v163: de drie stromen
  });

  test('minder dan zes maanden: geen sparkline, wel de delta-zin', async ({ page }) => {
    await open(page, seed({ maanden: 3 }));
    const b = await blok(page, M1);
    expect(b.tegels).toEqual(['inleg']);
    expect(b.sparks).toBe(0);                                     // GRAFIEK_MIN niet gehaald
    expect(b.tekst).toMatch(/verloop vanaf \d+ mnd/);
  });

  test('de definitie en de bron zijn niet aangeraakt', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const r = await page.evaluate((m) => {
      const V = vermogensInleg(m), t = totals(m);
      return { raw: insKpis(m).inleg.raw, eigen: (t.income > 0 && V.totaal != null) ? V.totaal / t.income * 100 : null,
        band: kpiBand('inleg') };
    }, M1);
    expect(r.raw).toBeCloseTo(r.eigen, 6);                        // vermogensInleg / inkomen
    expect(r.band).toBe(null);                                    // v161: geen norm
  });

  test('het drempelgedrag bij een klein grondtal blijft', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const r = await page.evaluate((m) => {
      const K = insKpis(m);
      return { drempel: MAAND_DREMPEL.kpiMinBedrag, klein: K.inleg.klein, val: K.inleg.val,
        // forceer een klein grondtal: dan toont de tegel het bedrag in plaats van een percentage
        zinvol: [pctZinvol(0), pctZinvol(5), pctZinvol(MAAND_DREMPEL.kpiMinBedrag)] };
    }, M1);
    expect(r.drempel).toBeGreaterThan(0);
    expect(r.zinvol).toEqual([true, false, true]);                // nul is een meting, 5 te klein
    expect(typeof r.klein).toBe('boolean');
  });

  /* v223: de zin 'nog zonder oordeel' is met de kaartschil vervallen. 'loopt nog' in de tegel zegt
     het al, en dat is wat deze test wil vaststellen. */
  test('de lopende maand krijgt geen oordeel', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const b = await blok(page, null);
    expect(b.tekst).toContain('loopt nog');
  });
});

test.describe('d - één cijfer, één kolom, en de kop zegt wat er staat', () => {
  test('de tegel neemt de volle breedte, geen halve rij', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const b = await blok(page, M1);
    expect(b.kolommen).toBe(1);
    const vol = await page.evaluate(() => {
      const rij = document.querySelector('#maandKpiBlok .wvo-tiles');
      const t = rij.querySelector('.wvo-tile');
      return Math.abs(t.getBoundingClientRect().width - rij.getBoundingClientRect().width) < 2;
    });
    expect(vol).toBe(true);
  });

  test('geen uitklap meer, want er valt niets uit te klappen', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const b = await blok(page, M1);
    expect(b.knoppen).toBe(0);
    expect(b.tekst).not.toMatch(/toon beide/);
  });

  /* v223: de kop 'Vermogensopbouw' is met de kaartschil vervallen, en daarmee ook de vraag of hij
     het onderwerp of de categorie noemt. Wat de test bewaakte blijft gelden op de plek die het nu
     draagt: het label van de tegel noemt één stroom en geen verzamelnaam. */
  test('het label noemt het onderwerp, niet de categorie', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const b = await blok(page, M1);
    expect(b.tekst.toLowerCase()).toContain('spaarquote');
    expect(b.tekst.toLowerCase()).not.toContain('kerncijfers');   // meervoud bij één cijfer
    expect(b.tekst).not.toMatch(/Wat er structureel gebeurt/);    // te ruim voor één stroom
  });

  /* v223: de ondertitel is vervallen; de deltazin in de tegel draagt nu wat er over het verloop te
     zeggen valt, en die telt nog steeds wat er staat. */
  test('het blok belooft geen verloop dat er niet is', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    // bij genoeg historie is het verloop een sparkline en geen zin; de helper telt die al
    expect((await blok(page, M1)).sparks).toBeGreaterThan(0);
    // v193: bij één gemeten maand valt er geen verloop te zien, en dan staat dat er ook niet
    const een = await page.evaluate(() => {
      const ms = months();
      TX = TX.filter((t) => t.date.slice(0, 7) === ms[ms.length - 1]);
      applyOwnAccounts(); curMonth = null; render();
      return maandKpiBlok(months()[months().length - 1]);
    });
    if (een) {
      expect(een).toMatch(/verloop zie je vanaf/);
      expect(een).not.toMatch(/vorige maand/);
    }
  });
});

test.describe('e - layout', () => {
  for (const w of [360, 390]) {
    test(`het blok past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await open(page, seed({ maanden: 12 }));
      await blok(page, M1);
      const r = await page.evaluate(() => {
        const b = document.getElementById('maandKpiBlok');
        const t = b.querySelector('.wvo-tile');
        return { pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          blok: b.scrollWidth - b.clientWidth,
          buiten: t.getBoundingClientRect().right > b.getBoundingClientRect().right + 1 };
      });
      expect(r.pagina).toBe(0);
      expect(r.blok).toBeLessThanOrEqual(0);
      expect(r.buiten).toBe(false);
    });
  }
});
