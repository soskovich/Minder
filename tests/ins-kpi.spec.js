// Inzichten · Kerncijfers (v65): elke KPI met band, oordeel en historische trend,
// een detail-sheet met uitleg + volledige historie, en de uitgaven-vs-budget-grafiek.
// v161: de vier cijfers staan verdeeld over twee schermen. Inzichten draagt wat je deze maand kunt
// bijsturen (budgetnaleving, variabele-lasten-druk), het maandscherm wat structureel is (spaarquote,
// vaste-lasten-druk). De restsaldo-quote is vervallen en alleen budgetnaleving heeft nog een band.
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
const INS_KEYS = ['budget', 'vari'];         // Inzichten: wat je deze maand kunt bijsturen
const MAAND_KEYS = ['inleg', 'vast'];        // maandscherm: wat structureel is
// het maandblok is dezelfde renderer; we tekenen hem los zodat we niet op go('maand') hoeven leunen
async function maandBlok(page, m) {
  return page.evaluate((mm) => {
    const d = document.createElement('div'); d.id = 'maandKpiProbe';
    d.innerHTML = maandKpiBlok(mm);
    document.body.appendChild(d); return d.textContent;
  }, m);
}

test.describe('a · doel en zelf-verklarende KPI\'s', () => {
  test('de widget benoemt waar hij voor is', async ({ page }) => {
    await openIns(page);
    const s = await strip(page);
    expect(s).toMatch(/kerncijfers/i);
    expect(s).toContain('Hoe je deze maand tegenover je eigen plan staat');
    expect(s).toContain('Wat structureel is, staat op je maandscherm');     // de verwijzing naar de andere plek
    expect(await page.locator('#insKpiStrip .wvo-tile').count()).toBe(2);
    for (const key of MAAND_KEYS) await expect(tegel(page, key)).toHaveCount(0);
  });

  test('de vier cijfers staan verdeeld, geen enkel cijfer op twee plekken', async ({ page }) => {
    await openIns(page);
    const blok = await maandBlok(page, CUR);
    const K = await page.evaluate((m) => insKpis(m).items.map((x) => x.key), CUR);
    expect(K.sort()).toEqual(['budget', 'inleg', 'vari', 'vast']);
    const ins = await strip(page);
    // de tegel-labels renderen in kapitalen, dus hoofdletterongevoelig vergelijken
    expect(ins).toMatch(/budgetnaleving/i);
    expect(ins).toMatch(/variabele-lasten-druk/i);
    expect(blok).toMatch(/spaarquote/i);
    expect(blok).toMatch(/vaste-lasten-druk/i);
    expect(ins).not.toMatch(/spaarquote/i);
    expect(ins).not.toMatch(/vaste-lasten-druk/i);
    expect(blok).not.toMatch(/budgetnaleving/i);
    expect(blok).not.toMatch(/variabele-lasten-druk/i);
  });

  test('elke tegel toont waarde, band, oordeel én een sparkline', async ({ page }) => {
    await openIns(page);
    for (const key of INS_KEYS) {
      const t = tegel(page, key);
      await expect(t).toHaveCount(1);
      const txt = await t.innerText();
      expect(txt, key).toMatch(/[\d—]/);                                  // een waarde (of het eerlijke —)
      expect(txt.split('\n').length, key).toBeGreaterThanOrEqual(3);      // label + cijfer + bandregel
      expect(await t.locator('svg.spk').count(), key).toBe(1);           // richting A: één lijn-sparkline
      expect(await t.locator('svg.spk path').count(), key).toBe(1);
    }
    const s = await strip(page);
    expect(s).toContain('doel 100% of minder');                           // het enige cijfer met een doel
    expect(s).toContain('geen doel, alleen je verloop');                  // en de bandregel van het andere
    expect(s).not.toMatch(/doel onder \d+%/);                             // geen norm meer als band
    expect(s).toContain('je potjes');                                     // budget-herkomst expliciet
  });

  test('de cijfers kloppen en de lopende maand krijgt geen oordeel', async ({ page }) => {
    await openIns(page);
    const K = await page.evaluate((m) => insKpis(m), CUR);
    const splitVari_CUR = await page.evaluate((m) => splitFixedVar(m).vari, CUR);

    expect(Math.round(K.budget.raw)).toBe(Math.round(SPEND_CUR / POTJES * 100));       // 19%
    expect(K.vari.raw).toBeCloseTo(splitVari_CUR / INK * 100, 6);                      // variabel / inkomen
    expect(K.budget.src).toBe('potjes');
    expect(K.items.map((x) => x.key)).toEqual(['inleg', 'budget', 'vari', 'vast']);

    expect(K.partial).toBe(true);
    expect(K.items.some((k) => k.oordeel === 'loopt nog')).toBe(true);
    for (const k of K.items) {
      expect(k.state, k.key).toBe('n');                                   // geen kleur-oordeel op een halve maand
      // 'loopt nog' vervangt het oordeel; een te klein grondtal geeft er helemaal geen (v161)
      expect(['', 'loopt nog'], k.key).toContain(k.oordeel);
      expect(k.oordeel, k.key).not.toMatch(/goed|krap|let op/);
    }
    expect(await strip(page)).toContain('nog zonder oordeel');
  });

  test('een afgeronde maand krijgt wél een oordeel', async ({ page }) => {
    await openIns(page);
    const K = await page.evaluate((m) => insKpis(m), M1);
    expect(K.partial).toBe(false);
    expect(K.budget.raw).toBeCloseTo(SPEND_M1 / POTJES * 100, 6);         // 1495 van 2400
    expect(K.budget.oordeel).toBe('goed');
    // zonder band is er geen oordeel; dat is geen 'goed' en geen 'let op' maar niets (v161)
    for (const key of ['inleg', 'vari', 'vast']) expect(K[key].oordeel, key).toBe('');
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

test.describe('a2 · richting A: één datataal in de tegels', () => {
  test('elke tegel: één-kleurige lijn, open teal punt op de lopende maand, geen ring', async ({ page }) => {
    await openIns(page);
    for (const key of INS_KEYS) {
      const t = tegel(page, key);
      const lijn = t.locator('svg.spk path');
      await expect(lijn).toHaveCount(1);
      expect(await lijn.getAttribute('stroke'), key).toBe('var(--bar)');   // één rustige datakleur
      expect(await t.locator('svg.spk rect, svg.spk polygon').count(), key).toBe(0);  // geen staafjes meer
      expect(await t.locator('.gr-ring, .goalring').count(), key).toBe(0); // ring blijft voor de hero
      // de lopende maand is een open teal punt, en alleen dat punt is teal
      const punt = t.locator('.spk-in i.spk-nu');
      await expect(punt).toHaveCount(1);
      const stijl = await punt.evaluate((e) => {
        const cs = getComputedStyle(e);
        const teal = getComputedStyle(document.documentElement).getPropertyValue('--teal').trim();
        const naarRgb = (c) => { const d = document.createElement('i'); d.style.color = c; document.body.appendChild(d); const r = getComputedStyle(d).color; d.remove(); return r; };
        return { rand: cs.borderTopColor, vul: cs.backgroundColor, teal: naarRgb(teal) };
      });
      expect(stijl.rand, key).toBe(stijl.teal);                             // teal rand
      expect(stijl.vul, key).not.toBe(stijl.teal);                          // open, niet gevuld
      const box = await punt.boundingBox();
      expect(Math.abs(box.width - box.height), key).toBeLessThan(1.2);     // rond, niet uitgerekt
    }
    // geen teal in de lijnen zelf (de norm-regel eronder heeft wél een teal "aanpassen ›"-link)
    const sparks = await page.locator('#insKpiStrip .spk-wrap').evaluateAll((els) => els.map((e) => e.innerHTML).join(''));
    expect((sparks.match(/var\(--teal\)/g) || []).length).toBe(0);
    const strip = await page.locator('#insKpiStrip').innerHTML();
    expect(await page.locator('#insKpiStrip .spk-nu').count()).toBe(2);    // alleen de eindpunten
    expect(strip).not.toContain('class="spark"');                          // geen bonte staafjes meer
  });

  // v103: dit legde eerst vast dat de doellijn wég moest zodra hij de lijn zou platdrukken.
  // Dat werkte averechts: juist wie ver van zijn doel staat verloor de referentie uit beeld.
  // De schaal blijft nu van je eigen cijfers en de doellijn wordt op de rand geklemd, zodat de
  // trend leesbaar blijft én je ziet aan welke kant je doel ligt. Zie tests/kpi-afstand.spec.js.
  test('de doellijn blijft zichtbaar, ook ver buiten de eigen beweging', async ({ page }) => {
    await openIns(page);
    const r = await page.evaluate(() => ({
      dichtbij: miniSparkLine([18, 22, 19], { target: 20 }),
      verweg: miniSparkLine([18, 22, 19], { target: 500 }),
      kort: miniSparkLine([20], { target: 20 }),
    }));
    expect(r.dichtbij).toContain('stroke-dasharray');
    expect(r.verweg).toContain('stroke-dasharray');                        // geklemd, niet weggelaten
    expect(r.verweg).toContain('2 4');                                     // en zwakker gestreept
    expect(r.kort).toBe('');                                               // <2 maanden = geen sparkline
  });

  test('sparklines staan per rij op dezelfde hoogte, ook als de bandregel wrapt', async ({ page }) => {
    await openIns(page);
    const bodems = await page.evaluate(() => [...document.querySelectorAll('#insKpiStrip svg.spk')]
      .map((e) => Math.round(e.getBoundingClientRect().bottom)));
    expect(bodems.length).toBe(2);
    expect(bodems[0]).toBe(bodems[1]);
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
        variCur: insKpis(ms.CUR).vari.series,
        variM1: insKpis(ms.M1).vari.series,
        handmatig: S.ms.map((m) => totals(m).income > 0 ? splitFixedVar(m).vari / totals(m).income * 100 : null),
      };
    }, { CUR, M1 });

    expect(r.reeks).toEqual([M2, M1, CUR]);
    expect(r.alle).toBe(r.maanden);                                       // n=0 = volledige historie
    expect(r.variCur).toEqual(r.handmatig);                               // exact months().map(...)
    expect(r.variM1.length).toBe(2);                                      // t/m de getoonde maand
  });

  test('bij één maand historie: waarde zonder trend, met nette regel', async ({ page }) => {
    await openIns(page, tweak((set, tx) => {
      for (let i = tx.length - 1; i >= 0; i--) if (!tx[i].date.startsWith(CUR)) tx.splice(i, 1);
    }));
    expect(await page.evaluate(() => months().length)).toBe(1);
    const s = await strip(page);
    // v173: die mededeling stond per tegel en nog eens onder de maandgrafiek, drie keer op één
    // scherm. De grafiek zegt het nu als enige, dus de tegel toont alleen geen sparkline.
    const pagina = await page.evaluate(() => $('#s-ins').innerText);
    expect((pagina.match(/maanden zie je hier je verloop/gi) || []).length).toBe(1);
    expect(s).not.toMatch(/zie je hier je verloop/i);   // niet meer per tegel
    expect(await page.locator('#insKpiStrip .spark').count()).toBe(0);
    expect(s).toMatch(/\d+%/);                                            // de waarde staat er wél
  });

  test('inkomen 0 geeft — zonder NaN', async ({ page }) => {
    await openIns(page, tweak((set) => { set.income = 0; }));
    const K = await page.evaluate((m) => insKpis(m), CUR);
    const splitVari_CUR = await page.evaluate((m) => splitFixedVar(m).vari, CUR);
    expect(K.vari.val).toBe('—');
    expect(K.vast.val).toBe('—');
    expect(K.vari.band).toBe('inkomen onbekend');
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

test.describe('b2 · maandgrafiek', () => {
  test('één datakleur, alleen de uitschieter gelabeld, tooltip op elke maand', async ({ page }) => {
    await openIns(page);
    const c = page.locator('#insSpendChart');
    const kleuren = await c.locator('rect.cbar').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('fill')))]);
    expect(kleuren.sort()).toEqual(['var(--bar)', 'var(--teal)']);          // neutraal + accent lopende maand
    expect(await c.locator('rect.cbar[rx="3"]').count()).toBe(await c.locator('rect.cbar').count());

    const nu = c.locator('rect.cbar[fill="var(--teal)"]');
    expect(await nu.getAttribute('stroke-dasharray')).toBeTruthy();         // voorlopig gemarkeerd
    expect(await page.locator('#insSpendChart').innerHTML()).toContain('*</text>');

    // labels: alleen de uitschieter (plus het budget-tag), tooltip op elke maand
    const vals = await c.locator('text[font-weight="700"]').evaluateAll((els) => els.map((e) => e.textContent));
    expect(vals.filter((t) => !/budget/.test(t)).length).toBeLessThanOrEqual(1);   // alleen de uitschieter
    expect(await c.locator('rect[fill="transparent"] title').count()).toBe(await c.locator('rect.cbar').count());
    expect(await page.locator('#insSpendChart line[stroke-dasharray]').count()).toBeGreaterThan(0);   // referentielijn
    expect(await page.locator('#insSpendChart line:not([stroke-dasharray])').count()).toBe(1);        // alleen de basislijn
  });
});

test.describe('c · tik op een tegel', () => {
  test('opent uitleg plus de volledige historie', async ({ page }) => {
    await openIns(page);
    await tegel(page, 'vari').click();
    await page.waitForSelector('#kpiDetailHead');
    const sheet = await page.locator('#sheet').innerText();

    expect(sheet).toContain('Variabele-lasten-druk');
    expect(sheet).toContain('variabele uitgaven ÷ inkomen');              // hoe hij berekend is
    expect(sheet).toContain('Er hoort geen doel bij');                    // v161: geen norm meer
    expect(sheet).not.toContain('50/30/20');
    expect(sheet).toContain('volledige historie van deze metriek');
    expect(await page.locator('#kpiHist').count()).toBe(1);
    expect(await page.locator('#kpiHist rect.cbar').count()).toBe(3);     // één staaf per maand
    expect(await page.locator('#kpiHist line[stroke-dasharray]').count()).toBe(0);   // geen band, geen lijn
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
    await tegel(page, 'vari').click();
    await page.waitForSelector('#kpiHist');
    // wel aantikbaar, maar nooit naar de maand-sheet
    expect(await page.locator('#kpiHist rect[onclick]').count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.getElementById('kpiHist').innerHTML.includes('openBudgetCompare'))).toBe(false);
    expect(await page.locator('#kpiHist title').count()).toBeGreaterThan(0);

    await page.locator('#kpiHist rect[onclick]').first().click();
    await page.waitForTimeout(150);
    const read = await page.locator('#kpiRead').innerText();
    expect(read).toMatch(/%/);
    expect(read).toMatch(/\d{4}/);                                            // maand + jaar
    expect(await page.locator('#sheet').innerText()).toContain('Variabele-lasten-druk');
  });

  test('de historie heeft een y-as, waardelabels en een gelabelde band', async ({ page }) => {
    await openIns(page);
    await tegel(page, 'budget').click();
    await page.waitForSelector('#kpiHist');
    const svg = await page.locator('#kpiHist').innerHTML();
    expect(svg).toContain('>0<');                                             // nullijn-label
    expect((svg.match(/text-anchor="end"/g) || []).length).toBeGreaterThanOrEqual(3);   // y-labels + bandlabel
    expect(svg).toContain('doel 100% of minder');                             // gelabelde bandlijn
    expect((svg.match(/font-weight="700"/g) || []).length).toBeGreaterThan(0); // waardelabels boven de staven
    expect(svg).toMatch(/>(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec)\*?</);     // maandlabels
  });

  test('geen enkele KPI-tegel opent nog de maand-sheet', async ({ page }) => {
    await openIns(page);
    const titels = [];
    for (const key of INS_KEYS) {
      await tegel(page, key).click();
      await page.waitForSelector('#kpiDetailHead');
      const sheet = await page.locator('#sheet').innerText();
      expect(sheet, key).not.toMatch(/hoe doe je het deze maand\?/i);
      titels.push(sheet.split('\n')[0]);
      await page.evaluate(() => closeSheet());
    }
    expect(new Set(titels).size).toBe(2);                                      // twee verschillende koppen
    expect(titels).toEqual(['Budgetnaleving', 'Variabele-lasten-druk']);
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
    // het label komt uit MNAMES, dus lezen we het daar ook uit: hardcoderen laat deze test
    // elf maanden per jaar slagen om de verkeerde reden en in de twaalfde falen op de kalender.
    const nu = await page.evaluate((m) => MNAMES[+m.slice(5, 7) - 1], CUR);
    expect(html).toContain(`>${nu}*<`);                                        // lopende maand gemarkeerd op de x-as
    expect((html.match(/\*</g) || []).length).toBe(1);                         // en alleen die
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
  // sinds richting A dragen de sparkline en de maandgrafiek geen status-kleur meer: één datakleur,
  // status staat in het label. Rood blijft alleen bestaan als oordeel-kleur (en wordt amber in Rustig).
  test('status zit in het label, niet in de datakleur; Rustig kent geen alarmrood', async ({ page }) => {
    await openIns(page, tweak((set) => { set.budgets = { boodschappen: 300 }; set.budgetsNext = {} }));
    const begeleid = await page.evaluate((m) => ({ bad: kpiCol('bad'), strip: insKpiStrip(m), chart: spendVsBudgetChart() }), CUR);
    expect(begeleid.bad).toBe('var(--red)');
    expect(begeleid.chart).not.toContain('var(--red)');                   // grafiek: één datakleur
    expect((begeleid.strip.match(/var\(--bar\)/g) || []).length).toBeGreaterThanOrEqual(2);   // neutrale lijnen

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
    expect(await page.evaluate(() => typeof whatStandsOutCard)).toBe('undefined');   // v164: opgeruimd
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
