// Inzichten · Kerncijfers (v65): elke KPI met band, oordeel en historische trend,
// een detail-sheet met uitleg + volledige historie, en de uitgaven-vs-budget-grafiek.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

// Fixture, met de hand doorgerekend:
//   CUR (lopende maand): inkomen 3000, uitgaven 445, potjes 2400
//   M1 en M2 (afgerond) : 25 + 20 + 900 + 400 + 150 = 1495 uitgaven
const SPEND_CUR = 445, SPEND_M1 = 1495, INK = 3000, POTJES = 2400;

async function openIns(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#insKpiStrip');
}

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  const tx = JSON.parse(p.minder_tx);
  fn(set, tx);
  p.minder_set = JSON.stringify(set);
  p.minder_tx = JSON.stringify(tx);
  return p;
}

const strip = (page) => page.locator('#insKpiStrip').innerText();
const tegel = (page, key) => page.locator(`#insKpiStrip .wvo-tile[data-kpi="${key}"]`);

test.describe('a · doel en zelf-verklarende KPI\'s', () => {
  test('de widget benoemt waar hij voor is', async ({ page }) => {
    await openIns(page);
    const s = await strip(page);
    expect(s).toMatch(/kerncijfers/i);
    expect(s).toContain('Hoe gezond je financiën ervoor staan');
    expect(s).toContain('Tik een cijfer voor de uitleg en je volledige historie.');
    expect(await page.locator('#insKpiStrip .wvo-tile').count()).toBe(4);
  });

  test('elke tegel toont waarde, band, oordeel én een sparkline', async ({ page }) => {
    await openIns(page);
    for (const key of ['spaar', 'budget', 'niveau', 'vast']) {
      const t = tegel(page, key);
      await expect(t).toHaveCount(1);
      const txt = await t.innerText();
      expect(txt, key).toMatch(/[\d—]/);                                  // een waarde (of het eerlijke —)
      expect(txt.split('\n').length, key).toBeGreaterThanOrEqual(3);      // label + cijfer + bandregel
      expect(await t.locator('.spark .b').count(), key).toBe(3);          // 3 maanden historie
    }
    const s = await strip(page);
    expect(s).toContain('doel 20% of meer');
    expect(s).toContain('doel 100% of minder');
    expect(s).toContain('doel onder 50%');
    expect(s).toContain('gem. €1.495/mnd');                               // eigen gemiddelde als referentie
    expect(s).toContain('je potjes');                                     // budget-herkomst expliciet
  });

  test('de cijfers kloppen en de lopende maand krijgt geen oordeel', async ({ page }) => {
    await openIns(page);
    const K = await page.evaluate((m) => insKpis(m), CUR);

    expect(Math.round(K.spaar.raw)).toBe(Math.round((INK - SPEND_CUR) / INK * 100));   // 85%
    expect(Math.round(K.budget.raw)).toBe(Math.round(SPEND_CUR / POTJES * 100));       // 19%
    expect(K.niveau.raw).toBe(SPEND_CUR);
    expect(K.niveau.ref).toBe(SPEND_M1);                                               // gemiddelde van de afgeronde maanden
    expect(K.budget.src).toBe('potjes');
    expect(K.items.map((x) => x.key)).toEqual(['spaar', 'budget', 'niveau', 'vast']);

    expect(K.partial).toBe(true);
    for (const k of K.items) {
      expect(k.state, k.key).toBe('n');                                   // geen kleur-oordeel op een halve maand
      expect(k.oordeel, k.key).toBe('loopt nog');
    }
    expect(await strip(page)).toContain('nog zonder oordeel');
  });

  test('een afgeronde maand krijgt wél een oordeel', async ({ page }) => {
    await openIns(page);
    const K = await page.evaluate((m) => insKpis(m), M1);
    expect(K.partial).toBe(false);
    expect(K.spaar.raw).toBeCloseTo((INK - SPEND_M1) / INK * 100, 6);     // 50%
    expect(K.spaar.oordeel).toBe('goed');                                 // >= 20%
    expect(K.budget.oordeel).toBe('goed');                                // 1495 van 2400
    expect(['goed', 'krap', 'let op']).toContain(K.vast.oordeel);
  });

  test('de vaste-lasten-druk volgt splitFixedVar, niet een eigen som', async ({ page }) => {
    await openIns(page);
    const r = await page.evaluate((m) => ({
      kpi: insKpis(m).vast.raw,
      eigen: splitFixedVar(m).fixed / totals(m).income * 100,
    }), CUR);
    expect(r.kpi).toBeCloseTo(r.eigen, 6);
  });
});

test.describe('b · historische reeksen', () => {
  test('komen uit months() en lopen t/m de getoonde maand', async ({ page }) => {
    await openIns(page);
    const r = await page.evaluate((ms) => {
      const S = insKpiSeries();
      return {
        reeks: S.ms,
        alle: insKpiSeries(0).ms.length,
        maanden: months().length,
        spaarCur: insKpis(ms.CUR).spaar.series,
        spaarM1: insKpis(ms.M1).spaar.series,
        handmatig: S.ms.map((m) => totals(m).income > 0 ? (totals(m).income - totals(m).spend) / totals(m).income * 100 : null),
      };
    }, { CUR, M1 });

    expect(r.reeks).toEqual([M2, M1, CUR]);
    expect(r.alle).toBe(r.maanden);                                       // n=0 = volledige historie
    expect(r.spaarCur).toEqual(r.handmatig);                              // exact months().map(...)
    expect(r.spaarM1.length).toBe(2);                                     // t/m de getoonde maand
  });

  test('bij één maand historie: waarde zonder trend, met nette regel', async ({ page }) => {
    await openIns(page, tweak((set, tx) => {
      for (let i = tx.length - 1; i >= 0; i--) if (!tx[i].date.startsWith(CUR)) tx.splice(i, 1);
    }));
    expect(await page.evaluate(() => months().length)).toBe(1);
    const s = await strip(page);
    expect(s).toContain('na 2 maanden zie je hier je verloop');
    expect(await page.locator('#insKpiStrip .spark').count()).toBe(0);
    expect(s).toMatch(/\d+%/);                                            // de waarde staat er wél
  });

  test('inkomen 0 geeft — zonder NaN', async ({ page }) => {
    await openIns(page, tweak((set) => { set.income = 0; }));
    const K = await page.evaluate((m) => insKpis(m), CUR);
    expect(K.spaar.val).toBe('—');
    expect(K.vast.val).toBe('—');
    expect(K.spaar.band).toBe('inkomen onbekend');
    expect(await strip(page)).not.toMatch(/NaN|Infinity/);
  });

  test('zonder potjes valt het budget terug op de inkomen-limiet, zichtbaar gelabeld', async ({ page }) => {
    await openIns(page, tweak((set) => { set.budgets = {}; set.budgetsNext = {}; }));
    expect(await page.evaluate((m) => insKpis(m).budget.src, CUR)).toBe('limiet');
    const s = await strip(page);
    expect(s).toContain('je inkomen-limiet');
    expect(s).not.toContain('je potjes');
  });
});

test.describe('c · tik op een tegel', () => {
  test('opent uitleg plus de volledige historie', async ({ page }) => {
    await openIns(page);
    await tegel(page, 'spaar').click();
    await page.waitForSelector('#kpiDetailHead');
    const sheet = await page.locator('#sheet').innerText();

    expect(sheet).toContain('Bespaarquote');
    expect(sheet).toContain('(inkomen − uitgaven) ÷ inkomen');            // hoe hij berekend is
    expect(sheet).toContain('50/30/20');
    expect(sheet).toContain('doel 20% of meer');
    expect(sheet).toContain('volledige historie van deze metriek');
    expect(await page.locator('#kpiHist').count()).toBe(1);
    expect(await page.locator('#kpiHist rect.cbar').count()).toBe(3);     // één staaf per maand
    expect(await page.locator('#kpiHist line[stroke-dasharray]').count()).toBe(1);   // je band als lijn
  });

  test('de budget-tegel noemt het bedrag achter het percentage', async ({ page }) => {
    await openIns(page);
    await tegel(page, 'budget').click();
    await page.waitForSelector('#kpiDetailHead');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Budgetnaleving');
    expect(sheet).toContain('€2.400');
    expect(sheet).toContain('uitgaven ÷ budget');
  });

  // v69: de historie in het KPI-detail is niet meer aantikbaar. Twaalf onzichtbare hitvlakken
  // over de hele grafiek sprongen naar "Hoe doe je het deze maand?" — een ándere metriek, die
  // de KPI-uitleg wegdrukte. De maandsheet blijft bereikbaar via de "Uitgaven vs budget"-grafiek.
  test('een tik in de historie leest de waarde uit en verlaat het detail niet', async ({ page }) => {
    await openIns(page);
    await tegel(page, 'niveau').click();
    await page.waitForSelector('#kpiHist');
    // wel aantikbaar, maar nooit naar de maand-sheet
    expect(await page.locator('#kpiHist rect[onclick]').count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.getElementById('kpiHist').innerHTML.includes('openBudgetCompare'))).toBe(false);
    expect(await page.locator('#kpiHist title').count()).toBeGreaterThan(0);

    await page.locator('#kpiHist rect[onclick]').first().click();
    await page.waitForTimeout(150);
    const read = await page.locator('#kpiRead').innerText();
    expect(read).toMatch(/€/);
    expect(read).toMatch(/\d{4}/);                                            // maand + jaar
    expect(await page.locator('#sheet').innerText()).toContain('Uitgaven-niveau');
  });

  test('de historie heeft een y-as, waardelabels en een gelabelde band', async ({ page }) => {
    await openIns(page);
    await tegel(page, 'spaar').click();
    await page.waitForSelector('#kpiHist');
    const svg = await page.locator('#kpiHist').innerHTML();
    expect(svg).toContain('>0<');                                             // nullijn-label
    expect((svg.match(/text-anchor="end"/g) || []).length).toBeGreaterThanOrEqual(3);   // y-labels + bandlabel
    expect(svg).toContain('doel 20% of meer');                                // gelabelde bandlijn
    expect((svg.match(/font-weight="700"/g) || []).length).toBeGreaterThan(0); // waardelabels boven de staven
    expect(svg).toMatch(/>(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\*?</);     // maandlabels
  });

  test('geen enkele KPI-tegel opent nog de maand-sheet', async ({ page }) => {
    await openIns(page);
    const titels = [];
    for (const key of ['spaar', 'budget', 'niveau', 'vast']) {
      await tegel(page, key).click();
      await page.waitForSelector('#kpiDetailHead');
      const sheet = await page.locator('#sheet').innerText();
      expect(sheet, key).not.toMatch(/hoe doe je het deze maand\?/i);
      titels.push(sheet.split('\n')[0]);
      await page.evaluate(() => closeSheet());
    }
    expect(new Set(titels).size).toBe(4);                                      // vier verschillende koppen
    expect(titels).toEqual(['Bespaarquote', 'Budgetnaleving', 'Uitgaven-niveau', 'Vaste-lasten-druk']);
  });
});

test.describe('d · uitgaven-vs-budget-grafiek', () => {
  test('rendert elke maand met budgetlijn en markeert de lopende maand', async ({ page }) => {
    await openIns(page);
    const n = await page.evaluate(() => months().length);
    const html = await page.evaluate(() => spendVsBudgetChart());
    expect((html.match(/<rect class="cbar"/g) || []).length).toBe(n);
    expect((html.match(/stroke-dasharray="4 3"/g) || []).length).toBe(n);      // budgetlijn per maand
    expect((html.match(/fill-opacity=".42"/g) || []).length).toBe(1);          // alleen de lopende maand
    expect(html).toContain('De maand met * loopt nog.');
    expect(html).toMatch(/>aug\*</);                                          // lopende maand gemarkeerd op de x-as
    expect(html).toContain('budget €');                                        // gelabelde budgetlijn
    expect(html).toContain('>0<');                                             // y-as met nullijn
    expect((html.match(/font-weight="700"/g) || []).length).toBeGreaterThan(0); // waardelabels
  });

  test('een tik op een kolom leest hem uit; de uitlezing opent die maand', async ({ page }) => {
    await openIns(page);
    const label = await page.evaluate((m) => monthLabel(m), M1);
    await page.locator(`#insSpendChart rect[onclick*="${M1}"]`).click();
    await page.waitForTimeout(150);
    const read = await page.locator('#spendRead').innerText();
    expect(read.toLowerCase()).toContain(label.toLowerCase());                 // exacte maand
    expect(read).toContain('€1.495');                                          // exact bedrag
    expect(read).toContain('bekijk maand');

    await page.locator('#spendRead').click();                                  // en van daaruit de maand-sheet
    await page.waitForSelector('#sheetBg.show');
    expect((await page.locator('#sheet').innerText()).toLowerCase()).toContain(label.toLowerCase());
  });

  test('onder 2 maanden: lege staat i.p.v. een misleidende grafiek', async ({ page }) => {
    await openIns(page, tweak((set, tx) => {
      for (let i = tx.length - 1; i >= 0; i--) if (!tx[i].date.startsWith(CUR)) tx.splice(i, 1);
    }));
    const html = await page.evaluate(() => spendVsBudgetChart());
    expect(html).toContain('Na twee maanden zie je hier je verloop.');
    expect(html).not.toContain('openBudgetCompare');
    expect(await page.locator('#insSpendChart').count()).toBe(0);
  });
});

test.describe('e · rustige modus en "Wat valt op"', () => {
  test('Rustig vervangt alarmrood door amber, ook in de sparklines', async ({ page }) => {
    await openIns(page, tweak((set) => { set.budgets = { boodschappen: 300 }; set.budgetsNext = {}; }));
    const begeleid = await page.evaluate((m) => ({ bad: kpiCol('bad'), strip: insKpiStrip(m), chart: spendVsBudgetChart() }), CUR);
    expect(begeleid.bad).toBe('var(--red)');
    expect(begeleid.strip).toContain('var(--red)');                       // een maand buiten de band

    const rustig = await page.evaluate((m) => { SET.mode = 'rustig'; save(); return { bad: kpiCol('bad'), strip: insKpiStrip(m), chart: spendVsBudgetChart() }; }, CUR);
    expect(rustig.bad).toBe('var(--amber)');
    expect(rustig.strip).not.toContain('var(--red)');
    expect(rustig.chart).not.toContain('var(--red)');
  });

  test('"Wat valt op" staat als compacte regel onder de kerncijfers', async ({ page }) => {
    // zorg stijgt drie maanden op rij -> signaal 1 (isFixedCat sluit zorg uit van de drivers,
    // en zonder potje wordt het niet budget-flagged, dus insSignals slaat het niet over)
    await openIns(page, tweak((set, tx) => {
      const add = (m, day, amount) => tx.push({ id: 'zorg-' + m, date: `${m}-${day}`, amount, acc: MAIN, name: 'Apotheek Centrum', desc: 'BEA, BETAALPAS APOTHEEK CENTRUM', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
      add(M2, '18', -60); add(M1, '18', -120); add(CUR, '18', -200);
    }));
    const line = page.locator('#wvoLine');
    await expect(line).toHaveCount(1);
    expect(await line.innerText()).toContain('Valt op:');
    expect(await line.innerText()).toContain('Zorg & apotheek');

    // en het oude tegelblok is weg
    expect(await page.locator('#s-ins').innerText()).not.toContain('Wat dit betekent');
    expect(await page.evaluate(() => typeof whatStandsOutCard)).toBe('function');
  });
});

test('f · catSparkline blijft werken via de gedeelde miniSpark', async ({ page }) => {
  await openIns(page);
  const r = await page.evaluate(() => ({
    spark: catSparkline('boodschappen'),
    leeg: miniSpark([5]),
    drie: miniSpark([1, 2, 3]),
  }));
  expect(r.spark).toContain('Verloop laatste 3 maanden');
  expect((r.spark.match(/class="b"/g) || []).length).toBe(3);
  expect(r.spark).toContain('class="lab"');
  expect(r.leeg).toBe('');                                                // < 2 waarden: geen sparkline
  expect((r.drie.match(/class="b"/g) || []).length).toBe(3);
});
