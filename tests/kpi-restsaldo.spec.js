// v108 (fase 1 van 2): het kerncijfer heette "Bespaarquote" maar meet je restsaldo — inkomen min
// uitgaven. Geld dat op je betaalrekening blijft staan telt daar volledig in mee, terwijl de
// referentie-verdeling "sparen" juist leest als instroom op je spaarrekening (healthSplitOver).
// Twee tellers tegen dezelfde norm. Deze fase zet alleen de naam en de uitleg recht; de rekenwijze
// blijft exact gelijk, zodat je historie niet verschuift. Fase 2 voegt de echte spaarquote toe.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, M1, MAIN, SAV } = require('./budget-fixture');

async function boot(page) {
  await open(page, seed());
  await page.evaluate((m) => { curMonth = m; save(); go('ins'); renderIns(); }, M1);
  await page.waitForTimeout(60);
}

test.describe('a · de rekenwijze is onveranderd', () => {
  test('het cijfer is nog steeds (inkomen − uitgaven) ÷ inkomen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = totals(m);
      return { kpi: insKpis(m).spaar.raw, hand: (t.income - t.spend) / t.income * 100 };
    }, M1);
    expect(r.kpi).toBeCloseTo(r.hand, 9);
  });

  test('de band blijft dezelfde drempel uit je referentie-verdeling', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ band: kpiBand('spaar'), norm: splitTarget().save }));
    expect(r.band).toBe(r.norm);
  });

  test('de transactielijst en de bijdragen zijn niet veranderd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = totals(m);
      return { lijst: netSpend(kpiTx('spaar', m)), spend: t.spend };
    }, M1);
    expect(r.lijst).toBe(r.spend);
  });
});

test.describe('b · de naam zegt nu wat het meet', () => {
  test('de tegel heet Restsaldo-quote', async ({ page }) => {
    await boot(page);
    const strip = await page.locator('#insKpiStrip').innerText();
    expect(strip).toMatch(/restsaldo-quote/i);
    expect(strip).not.toMatch(/bespaarquote/i);
  });

  test('de band zegt waar de drempel over gaat', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => kpiBandTxt('spaar'))).toContain('overhouden');
  });

  test('de uitleg waarschuwt expliciet dat dit niet je spaarinleg is', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openKpiDetail('spaar'));
    await page.waitForTimeout(60);
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('niet hetzelfde als wat je opzij zette');
    expect(s).toContain('blijft staan telt hier gewoon mee');
  });

  test('nergens in de app staat de oude term nog', async ({ page }) => {
    await boot(page);
    for (const key of ['spaar', 'budget', 'vast', 'vari']) {
      await page.evaluate((k) => openKpiDetail(k), key);
      await page.waitForTimeout(40);
      expect((await page.locator('#sheet').innerText()).toLowerCase(), key).not.toContain('bespaarquote');
    }
  });
});

test.describe('c · het verschil dat fase 2 gaat tonen', () => {
  // Het gemelde geval: 30% overhouden terwijl er maar 10% naar de spaarrekening ging.
  test('restsaldo en werkelijk gestort lopen uiteen, en dat is nu zichtbaar gemaakt', async ({ page }) => {
    const tx = [];
    const add = (id, m, day, amount, name, desc, acc) =>
      tx.push({ id, date: `${m}-${day}`, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: acc === SAV ? 'Spaar' : 'Main', refNums: [] });
    add('inc', M1, '01', 3000, 'Werkgever', 'SALARIS LOON');
    add('huur', M1, '02', -1400, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('ah', M1, '08', -700, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('sp-uit', M1, '25', -300, 'Eigen spaarrekening', 'OVERBOEKING NAAR SPAARREKENING');
    add('sp-in', M1, '25', 300, 'Eigen spaarrekening', 'OVERBOEKING NAAR SPAARREKENING', SAV);
    await open(page, {
      minder_tx: JSON.stringify(tx), minder_ovr: '{}',
      minder_set: JSON.stringify({ limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000, savingsEnds: ['4323'], manualBal: { [MAIN]: 500, [SAV]: 2000 } }),
      minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}',
    });
    const r = await page.evaluate((m) => ({ quote: insKpis(m).spaar.raw, gestort: savedThisMonth(m), inkomen: totals(m).income }), M1);
    expect(Math.round(r.quote)).toBe(30);                    // wat je overhield
    expect(r.gestort).toBe(300);                             // wat er écht heen ging
    expect(Math.round(r.gestort / r.inkomen * 100)).toBe(10);
    // de spaarboeking hoort niet in dit cijfer: het is een doorstroompost, geen uitgave (v77)
    const inLijst = await page.evaluate((m) => kpiTx('spaar', m).some((t) => catOf(t) === 'sparen'), M1);
    expect(inLijst).toBe(false);
  });
});
