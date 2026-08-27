// v106 (fase 4): wat veranderde er sinds vorige maand, en wat verklaart dat? Elk kerncijfer is
// teken × X/B. De verschuiving splitst exact in een teller-effect ((X1−X0)/B1, wat je anders
// uitgaf) en een noemer-effect (X0·(1/B1−1/B0), wat je inkomen of budget deed). Zonder die
// tweedeling zou een gedaald inkomen lezen als "je gaf meer uit", en dat is niet waar.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate((m) => { curMonth = m; save(); go('ins'); renderIns(); }, M1);
  await page.waitForTimeout(60);
}
const delta = (page, key, m) => page.evaluate(([k, mm]) => kpiDelta(k, mm), [key, m || M1]);

test.describe('a · de decompositie klopt tot op de komma', () => {
  for (const key of ['spaar', 'budget', 'vast', 'vari']) {
    test(`${key}: teller-effect plus noemer-effect is de hele verschuiving`, async ({ page }) => {
      await boot(page);
      const D = await delta(page, key);
      expect(D).not.toBeNull();
      expect(D.tel + D.noem).toBeCloseTo(D.dpt, 6);
      expect(D.nu - D.was).toBeCloseTo(D.dpt, 6);
    });

    test(`${key}: de categorieën samen zijn het teller-effect`, async ({ page }) => {
      await boot(page);
      const D = await delta(page, key);
      const som = D.cats.reduce((s, c) => s + c.pt, 0);
      expect(som).toBeCloseTo(D.tel, 4);        // kleine posten worden op 0,05 pt afgekapt
    });
  }

  test('de standen komen overeen met de kerncijfers zelf', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([m, v]) => {
      const D = kpiDelta('vari', m);
      return { D, nuCijfer: insKpis(m).vari.raw, wasCijfer: insKpis(v).vari.raw };
    }, [M1, M2]);
    expect(r.D.nu).toBeCloseTo(r.nuCijfer, 6);
    expect(r.D.was).toBeCloseTo(r.wasCijfer, 6);
    expect(r.D.vorige).toBe(M2);
  });
});

test.describe('b · een gedaald inkomen leest niet als meer uitgeven', () => {
  // autoIncome aan + verschillende salarissen per maand, zodat de noemer echt beweegt
  const wisselend = () => {
    const p = seed();
    const set = JSON.parse(p.minder_set);
    set.autoIncome = true; delete set.income;
    p.minder_set = JSON.stringify(set);
    const tx = JSON.parse(p.minder_tx).map((t) => (t.id === 'inc-' + M1 ? Object.assign({}, t, { amount: 2400 }) : t));
    p.minder_tx = JSON.stringify(tx);
    return p;
  };

  test('het noemer-effect vangt de inkomensdaling apart op', async ({ page }) => {
    await boot(page, wisselend());
    const r = await page.evaluate(([m, v]) => ({ D: kpiDelta('vari', m), inkNu: totals(m).income, inkWas: totals(v).income }), [M1, M2]);
    expect(r.inkNu).toBeLessThan(r.inkWas);                 // de noemer daalde écht
    expect(r.D.noem).not.toBe(0);
    expect(r.D.tel + r.D.noem).toBeCloseTo(r.D.dpt, 6);     // en de optelling blijft kloppen
    expect(r.D.basisVan).toBe(r.inkWas);
    expect(r.D.basisNaar).toBe(r.inkNu);
  });

  test('bij gelijke uitgaven zit de hele verschuiving in de noemer', async ({ page }) => {
    await boot(page, wisselend());
    const D = await delta(page, 'vari');
    const catSom = D.cats.reduce((s, c) => s + c.pt, 0);
    expect(catSom).toBeCloseTo(0, 4);                       // uitgaven ongewijzigd
    expect(D.tel).toBeCloseTo(0, 4);
    expect(D.noem).toBeCloseTo(D.dpt, 6);
  });

  test('en de sheet benoemt dat met bedragen', async ({ page }) => {
    await boot(page, wisselend());
    await page.evaluate(() => openKpiDetail('vari'));
    await page.waitForTimeout(60);
    const s = await page.locator('#sheet').innerText();
    expect(s).toMatch(/Je inkomen ging van .* naar /);
  });
});

test.describe('c · zwijgen wanneer vergelijken niets zegt', () => {
  test('een lopende maand krijgt geen vergelijking', async ({ page }) => {
    await boot(page);
    await page.evaluate((m) => { curMonth = m; renderIns(); openKpiDetail('vari'); }, CUR);
    await page.waitForTimeout(60);
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('volgt zodra deze maand rond is');
    expect(s).not.toContain('Ten opzichte van');            // halve maand tegen hele = geen vergelijking
  });

  test('zonder voorgaande maand is er niets te vergelijken', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => kpiDelta('vari', months()[0]));
    expect(r).toBeNull();
  });

  test('zonder basis geen vergelijking', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => { SET.income = 0; SET.autoIncome = false; save(); return kpiDelta('vari', m); }, M1);
    expect(r).toBeNull();                                    // v59/v73
  });

  test('een gelijke maand zegt dat gewoon', async ({ page }) => {
    await boot(page);
    const html = await page.evaluate((m) => {
      // maak M1 exact gelijk aan M2 door de afwijkende post gelijk te trekken
      const eet = TX.find((t) => t.id === 'eet-' + m);
      const vorig = TX.find((t) => t.id === 'eet-' + months()[months().indexOf(m) - 1]);
      if (eet && vorig) eet.amount = vorig.amount;
      save();
      return kpiDeltaBlok('vari', m, false);
    }, M1);
    expect(html).toContain('Vrijwel gelijk aan');
  });
});

test.describe('d · de weergave', () => {
  test('de zwaarste verklaring staat boven en de rest wordt samengevat', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      // vijf categorieën laten bewegen, zodat er echt een restgroep ontstaat
      const specs = [['Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', -300], ['Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT', -120],
        ['H&M', 'BEA, BETAALPAS H&M KLEDING', -90], ['Shell', 'BEA, BETAALPAS SHELL TANKEN', -70], ['Pathe', 'BEA, BETAALPAS PATHE BIOSCOOP', -40]];
      specs.forEach(([n, d, a], i) => { const t = { id: 'x' + i, date: `${m}-1${i}`, amount: a, acc: OWN[0], name: n, desc: d, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] }; TX.push(t); categorize(t); });
      save();
      const D = kpiDelta('vari', m);
      return { n: D.cats.length, eerste: Math.abs(D.cats[0].pt), tweede: Math.abs(D.cats[1].pt), html: kpiDeltaBlok('vari', m, false) };
    }, M1);
    expect(r.n).toBeGreaterThan(4);
    expect(r.eerste).toBeGreaterThanOrEqual(r.tweede);       // op gewicht gesorteerd
    expect(r.html).toContain('Overige');                     // de staart wordt samengevat, niet verzwegen
  });

  test('de kop toont de twee standen en het verschil', async ({ page }) => {
    await boot(page);
    await page.evaluate((m) => { const t = { id: 'z', date: `${m}-14`, amount: -260, acc: OWN[0], name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] }; TX.push(t); categorize(t); save(); openKpiDetail('vari'); }, M1);
    await page.waitForTimeout(60);
    const s = await page.locator('#sheet').innerText();
    expect(s).toMatch(/Ten opzichte van \w+ \d{4}/);
    expect(s).toMatch(/\d+% → \d+% · [+−][\d,]+ pt/);
    expect(s).toContain('Wat die verschuiving verklaart');
  });
});

test.describe('e · smalle mobiel', () => {
  for (const w of [360, 390]) {
    test(`het vergelijkingsblok past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 880 });
      await boot(page);
      await page.evaluate(() => openKpiDetail('vari'));
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
