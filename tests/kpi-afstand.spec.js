// v103 (fase 1): de kerncijfers toonden het cijfer en de band als losse teksten, dus de
// verhouding tot je doel moest je zelf maken. kpiAfstand() zet ze in verhouding — in
// procentpunten en vertaald naar euro's — uit dezelfde totals()/splitFixedVar() waar het
// percentage uit komt, zodat bedrag en percentage niet uit elkaar kunnen lopen.
// v161: alleen budgetnaleving heeft nog een doel. De drie andere kerncijfers meten een verhouding
// zonder norm, dus kpiBand() geeft daar null en er is per definitie geen afstand. Geen band is null,
// niet nul: een verzonnen doel van 0% zou elk cijfer eeuwig 'boven je doel' laten lezen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, INKOMEN, POTJES } = require('./budget-fixture');

async function boot(page, maand) {
  await open(page, seed());
  await page.evaluate((m) => { SET.kpiAll = 1; curMonth = m; save(); go('ins'); renderIns(); }, maand || M1);
  await page.waitForTimeout(80);
}
const kpi = (page, key, m) => page.evaluate(([k, mm]) => {
  const K = insKpis(mm); const x = K[k];
  return { raw: x.raw, val: x.val, partial: x.partial, afst: x.afst, band: kpiBand(k), state: x.state, txt: kpiAfstandTxt(k, x.afst, false), kort: kpiAfstandTxt(k, x.afst, true) };
}, [key, m || M1]);

test.describe('a · de afstand rekent uit één bron', () => {
  test('budgetnaleving is het enige cijfer met een doel', async ({ page }) => {
    await boot(page);
    const k = await kpi(page, 'budget');
    expect(k.band).toBe(100);
    expect(k.afst.pt).toBeCloseTo(k.band - k.raw, 1);            // dir 'down': doel min waarde
    expect(k.afst.goed).toBe(k.raw <= k.band);
  });

  test('zonder band geen afstand, en geen band van nul', async ({ page }) => {
    await boot(page);
    for (const key of ['inleg', 'vast', 'vari']) {
      const k = await kpi(page, key);
      expect(k.band, key).toBe(null);                            // null, niet 0
      expect(k.afst, key).toBe(null);
      expect(k.txt, key).toBe('');
    }
  });

  test('budgetnaleving meet tegen je potjes, niet tegen je inkomen', async ({ page }) => {
    await boot(page);
    const k = await kpi(page, 'budget');
    expect(k.afst.basis).toBe(POTJES);                           // v53: potjes zijn leidend
    expect(k.afst.basis).not.toBe(INKOMEN);
    expect(k.afst.bedrag).toBe(Math.round(Math.abs(k.afst.pt) / 100 * POTJES));
  });

  test('het bedrag komt overeen met de som die het percentage maakt', async ({ page }) => {
    await boot(page);
    // budgetnaleving: het verschil in euro's is wat je onder of boven je potjes zat
    const r = await page.evaluate((m) => {
      const t = totals(m);
      return { ruimte: Math.round(t.budget) - Math.round(t.spend), afst: insKpis(m).budget.afst };
    }, M1);
    expect(Math.abs(r.afst.bedrag - Math.abs(r.ruimte))).toBeLessThanOrEqual(1);
  });
});

test.describe('b · onbekend blijft onbekend', () => {
  test('zonder budget is er geen afstand', async ({ page }) => {
    await open(page, seed());
    const r = await page.evaluate(() => {
      SET.budgets = {}; SET.budgetsNext = {}; SET.income = 0; SET.autoIncome = false;
      save();
      const m = months()[months().length - 1];
      const K = insKpis(m);
      return { budget: totals(m).budget, raw: K.budget.raw, afst: K.budget.afst, val: K.budget.val };
    });
    expect(r.budget).toBe(0);
    expect(r.raw).toBe(null);
    expect(r.afst).toBe(null);                                   // geen verzonnen getal (v59/v73)
    expect(r.val).toBe('—');
  });

  test('geen bedrag zonder basis, ook al is er wel een percentage', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const K = insKpis(m);
      return K.items.filter((k) => k.afst && k.afst.basis <= 0).map((k) => k.afst.bedrag);
    }, M1);
    for (const b of r) expect(b).toBe(null);
  });
});

test.describe('c · de woorden volgen de betekenis, niet het teken', () => {
  test('budgetnaleving spreekt over je budget, niet over een doel', async ({ page }) => {
    await boot(page);
    expect((await kpi(page, 'budget')).txt).toMatch(/(onder|over) je budget/);
  });

  test('onder of over je budget, en op je doel is een eigen geval', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      goed: kpiAfstandTxt('budget', { pt: 5, bedrag: 100, basis: 2000, goed: true }, false),
      slecht: kpiAfstandTxt('budget', { pt: -5, bedrag: 100, basis: 2000, goed: false }, false),
      opDoel: kpiAfstandTxt('budget', { pt: 0, bedrag: 0, basis: 2000, goed: true }, false),
      zonder: kpiAfstandTxt('vast', null, false),
    }));
    expect(r.goed).toContain('onder je budget');
    expect(r.slecht).toContain('over je budget');
    expect(r.opDoel).toContain('op je doel');
    expect(r.zonder).toBe('');
  });
});

test.describe('d · een lopende maand velt geen oordeel', () => {
  test('de tegel laat de afstand weg zolang de maand loopt', async ({ page }) => {
    await boot(page, CUR);
    expect((await kpi(page, 'budget', CUR)).partial).toBe(true);
    const strip = await page.locator('#insKpiStrip').innerText();
    expect(strip).toContain('loopt nog');
    expect(strip).not.toMatch(/onder je budget|over je budget/);        // halve maand = geen prestatie
    expect(await page.locator('#insKpiStrip .kpi-afst').count()).toBe(0);
  });

  test('een afgeronde maand toont de afstand wél op de tegel', async ({ page }) => {
    await boot(page, M1);
    expect((await kpi(page, 'budget', M1)).partial).toBe(false);
    expect(await page.locator('#insKpiStrip .kpi-afst').count()).toBeGreaterThan(0);
    expect(await page.locator('#insKpiStrip').innerText()).toMatch(/je budget/);
  });

  test('de detailsheet toont het wél, met de tussenstand erbij', async ({ page }) => {
    await boot(page, CUR);
    await page.evaluate(() => openKpiDetail('budget'));
    await page.waitForTimeout(60);
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('Tussenstand');
    expect(s).toContain('de maand loopt nog');
    expect(s).toMatch(/nu \d+% · doel \d+%/);
  });

  test('bij een afgeronde maand staat die tussenstand-noot er niet', async ({ page }) => {
    await boot(page, M1);
    await page.evaluate(() => openKpiDetail('budget'));
    await page.waitForTimeout(60);
    const s = await page.locator('#sheet').innerText();
    expect(s).not.toContain('Tussenstand');
    expect(s).toMatch(/nu \d+% · doel \d+%/);
  });
});

test.describe('e · de balk', () => {
  test('staat bij het cijfer met een doel, en alleen daar', async ({ page }) => {
    await boot(page, M1);
    for (const [key, n] of [['budget', 1], ['inleg', 0], ['vast', 0], ['vari', 0]]) {
      await page.evaluate((k) => openKpiDetail(k), key);
      await page.waitForTimeout(40);
      expect(await page.locator('#sheet .kpi-doel').count(), key).toBe(n);
    }
  });

  test('amber alleen als je er echt buiten valt, nooit als default', async ({ page }) => {
    await boot(page, M1);
    const r = await page.evaluate((m) => {
      const K = insKpis(m);
      return K.items.map((k) => ({ key: k.key, state: k.state, amber: /--amber/.test(kpiDoelBalk(k)) }));
    }, M1);
    for (const x of r) expect(x.amber, x.key).toBe(x.state === 'bad');   // v93
  });

  test('zonder afstand geen balk', async ({ page }) => {
    await boot(page, M1);
    const leeg = await page.evaluate(() => kpiDoelBalk({ key: 'budget', raw: null, afst: null, state: 'n' }));
    expect(leeg).toBe('');
  });
});

test.describe('f · de doellijn verdwijnt niet meer uit de sparkline', () => {
  test('ook een doel ver buiten je eigen bereik blijft zichtbaar', async ({ page }) => {
    await boot(page, M1);
    const r = await page.evaluate(() => ({
      dichtbij: miniSparkLine([20, 22, 21], { target: 21 }),
      verweg: miniSparkLine([1, 2, 1.5], { target: 50 }),        // doel ver boven de reeks
      eronder: miniSparkLine([80, 82, 81], { target: 5 }),       // doel ver onder de reeks
    }));
    for (const k of ['dichtbij', 'verweg', 'eronder']) {
      expect(r[k], k).toContain('stroke-dasharray');             // de gestreepte doellijn staat er
    }
  });

  test('de lijn wordt op de rand geklemd, niet buiten de tekening gezet', async ({ page }) => {
    await boot(page, M1);
    const y = await page.evaluate(() => {
      const svg = miniSparkLine([1, 2, 1.5], { target: 900 });
      const m = svg.match(/<line[^>]*y1="([\d.]+)"/);
      return m ? +m[1] : null;
    });
    expect(y).not.toBeNull();
    expect(y).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(26);                           // binnen de viewBox-hoogte
  });
});

test.describe('g · smalle mobiel', () => {
  for (const w of [360, 390]) {
    test(`de strip en de sheet passen op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 880 });
      await boot(page, M1);
      const strip = await page.evaluate(() => { const e = document.getElementById('insKpiStrip'); return e.scrollWidth - e.clientWidth; });
      expect(strip).toBeLessThanOrEqual(0);
      await page.evaluate(() => openKpiDetail('budget'));
      await page.waitForTimeout(60);
      const over = await page.evaluate(() => {
        const s = document.getElementById('sheet');
        return { sheet: s.scrollWidth - s.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect(over.sheet).toBeLessThanOrEqual(0);
      expect(over.doc).toBeLessThanOrEqual(0);
    });
  }
});
