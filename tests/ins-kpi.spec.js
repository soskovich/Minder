// Inzichten (v63): KPI-strip + uitgaven-vs-budget-grafiek, "Wat valt op" als compacte regel.
// Alles leunt op bestaande helpers; deze spec bewaakt de cijfers, de randgevallen en de tik-doelen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

// Fixture, met de hand doorgerekend:
//   CUR (lopende maand): inkomen 3000, uitgaven 445, potjes 2400
//   M1 (afgerond)      : uitgaven 25 + 20 + 900 + 400 + 150 = 1495
const SPEND_CUR = 445, SPEND_M1 = 1495, INK = 3000, POTJES = 2400;

async function openIns(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
}

// seed() aanpassen zonder de fixture te dupliceren
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

test.describe('a · de vier KPI\'s', () => {
  test('rekenen correct en benoemen de budget-herkomst', async ({ page }) => {
    await openIns(page);
    const K = await page.evaluate((m) => insKpis(m), CUR);

    expect(Math.round(K.spaar.raw)).toBe(Math.round((INK - SPEND_CUR) / INK * 100));   // 85%
    expect(Math.round(K.budget.raw)).toBe(Math.round(SPEND_CUR / POTJES * 100));       // 19%
    expect(K.vsPrev.raw).toBe(SPEND_CUR - SPEND_M1);                                   // -1050
    expect(K.budget.src).toBe('potjes');
    expect(K.partial).toBe(true);

    // let op: .wvo-tl en .hlabel staan op text-transform:uppercase, dus innerText is hoofdletters
    const s = await strip(page);
    expect(s).toMatch(/bespaarquote/i);
    expect(s).toContain('85%');
    expect(s).toMatch(/budgetnaleving/i);
    expect(s).toContain('van je potjes (€2.400)');            // herkomst expliciet
    expect(s).toMatch(/uitgaven vs vorige maand/i);
    expect(s).toContain('−€1.050');
    expect(s).toMatch(/vaste-lasten-druk/i);
    expect(s).toContain('Deze maand loopt nog');              // partiële maand wordt benoemd
    expect(await page.locator('#insKpiStrip .wvo-tile').count()).toBe(4);
  });

  test('de vaste-lasten-druk volgt splitFixedVar, niet een eigen som', async ({ page }) => {
    await openIns(page);
    const r = await page.evaluate((m) => ({
      kpi: insKpis(m).vast.raw,
      eigen: splitFixedVar(m).fixed / totals(m).income * 100,
    }), CUR);
    expect(r.kpi).toBeCloseTo(r.eigen, 6);
  });

  test('inkomen 0 geeft — in plaats van een verzonnen getal', async ({ page }) => {
    await openIns(page, tweak((set) => { set.income = 0; }));
    const K = await page.evaluate((m) => insKpis(m), CUR);
    expect(K.spaar.val).toBe('—');
    expect(K.vast.val).toBe('—');
    expect(K.spaar.raw).toBeNull();

    const s = await strip(page);
    expect(s).toContain('—');
    expect(s).toContain('inkomen onbekend');
    expect(s).not.toMatch(/Infinity|NaN/);
  });

  test('zonder potjes valt het budget terug op de inkomen-limiet, zichtbaar gelabeld', async ({ page }) => {
    await openIns(page, tweak((set) => { set.budgets = {}; set.budgetsNext = {}; }));
    const K = await page.evaluate((m) => insKpis(m), CUR);
    expect(K.budget.src).toBe('limiet');
    const s = await strip(page);
    expect(s).toContain('van je inkomen-limiet (€2.100)');    // 70% van 3000
    expect(s).not.toContain('van je potjes');
  });

  test('één maand historie: lege staat i.p.v. een misleidende grafiek', async ({ page }) => {
    await openIns(page, tweak((set, tx) => {
      for (let i = tx.length - 1; i >= 0; i--) if (!tx[i].date.startsWith(CUR)) tx.splice(i, 1);
    }));
    expect(await page.evaluate(() => months().length)).toBe(1);
    const html = await page.evaluate(() => spendVsBudgetChart());
    expect(html).toContain('Na twee maanden zie je hier je verloop.');
    expect(html).not.toContain('insSpendChart');              // geen grafiek (de <svg> in de kop is het icoon)
    expect(html).not.toContain('openBudgetCompare');
    expect(await page.locator('#insSpendChart').count()).toBe(0);
  });
});

test.describe('b/c · de grafiek', () => {
  test('rendert elke maand met budgetlijn en markeert de lopende maand', async ({ page }) => {
    await openIns(page);
    const n = await page.evaluate(() => months().length);
    expect(n).toBe(3);

    const html = await page.evaluate(() => spendVsBudgetChart());
    const kolommen = (html.match(/<rect [^>]*rx="3"/g) || []).length;
    const budgetlijnen = (html.match(/stroke-dasharray="4 3"/g) || []).length;
    expect(kolommen).toBe(n);
    expect(budgetlijnen).toBe(n);                              // per maand een referentie
    expect((html.match(/fill-opacity=".42"/g) || []).length).toBe(1);   // alleen de lopende maand
    expect(html).toContain('De gestreepte kolom is deze maand tot nu toe.');
    expect(html).toContain('maandbudget');

    // labels van alle drie de maanden staan er
    const svg = await page.locator('#insSpendChart').innerHTML();
    for (const ym of [M2, M1, CUR]) {
      const mn = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'][+ym.slice(5, 7) - 1];
      expect(svg).toContain('>' + mn + '<');
    }
  });

  test('een tik op een kolom opent openBudgetCompare voor díe maand', async ({ page }) => {
    await openIns(page);
    const label = await page.evaluate((m) => monthLabel(m), M1);
    await page.locator(`#insSpendChart rect[onclick="openBudgetCompare('${M1}')"]`).click();
    await page.waitForSelector('#sheetBg.show');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toMatch(/hoe doe je het deze maand\?/i);     // de kop staat op uppercase
    expect(sheet.toLowerCase()).toContain(label.toLowerCase()); // de aangetikte maand, niet de lopende
  });
});

test.describe('d · rustige modus', () => {
  test('vervangt alarmrood door amber, in de tegels en in de grafiek', async ({ page }) => {
    // potjes fors omlaag zodat afgeronde maanden écht over budget zijn -> 'bad'-kleur in beeld
    const payload = tweak((set) => { set.budgets = { boodschappen: 300 }; set.budgetsNext = {}; });
    await openIns(page, payload);

    const begeleid = await page.evaluate(() => ({ bad: kpiCol('bad'), mid: kpiCol('mid'), chart: spendVsBudgetChart() }));
    expect(begeleid.bad).toBe('var(--red)');
    expect(begeleid.chart).toContain('var(--red)');

    const rustig = await page.evaluate(() => { SET.mode = 'rustig'; save(); render(); return { bad: kpiCol('bad'), mid: kpiCol('mid'), chart: spendVsBudgetChart(), strip: insKpiStrip(curMonth) }; });
    expect(rustig.bad).toBe('var(--amber)');
    expect(rustig.mid).toBe('var(--mut)');
    expect(rustig.chart).not.toContain('var(--red)');
    expect(rustig.strip).not.toContain('var(--red)');
  });
});

test.describe('e · "Wat valt op" als compacte regel', () => {
  // Zorg stijgt drie maanden op rij -> signaal 1 (hoogste prioriteit, mét tik-actie).
  // Bewust 'zorg': isFixedCat() sluit die uit van steerSpendUpTo, dus het is nooit een
  // maand-over-maand-driver, en zonder potje wordt het ook niet budget-flagged. Anders zou
  // insSignals de categorie via `exclude` overslaan en viel er niets te tonen.
  const stijgend = () => tweak((set, tx) => {
    const add = (m, day, amount) => tx.push({ id: 'zorg-' + m, date: `${m}-${day}`, amount, acc: MAIN, name: 'Apotheek Centrum', desc: 'BEA, BETAALPAS APOTHEEK CENTRUM', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    add(M2, '18', -60); add(M1, '18', -120); add(CUR, '18', -200);
  });

  test('toont het topsignaal in één regel en is tikbaar', async ({ page }) => {
    await openIns(page, stijgend());
    const line = page.locator('#wvoLine');
    await expect(line).toHaveCount(1);
    const txt = await line.innerText();
    expect(txt).toContain('Valt op:');
    expect(txt).toContain('Zorg & apotheek');
    expect(txt).toContain('€200');

    // hetzelfde signaal, dezelfde actie als in het oude tegelblok
    const top = await page.evaluate((m) => {
      const mv = monthVsPrevInner(m);
      const s = insSignals(m, new Set([...mv.drivers, ...budgetFlaggedCats(m)])).sort((a, b) => b.pri - a.pri)[0];
      return { label: s.kpiLabel, act: s.act };
    }, CUR);
    expect(txt).toContain(top.label);
    expect(await line.getAttribute('onclick')).toBe(top.act);

    await line.click();
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toContain('Zorg & apotheek');
  });

  test('het grote tegelblok is van Inzichten verdwenen', async ({ page }) => {
    await openIns(page, stijgend());
    expect(await page.locator('#s-ins .wvo-tiles').count()).toBe(1);      // alleen de KPI-strip
    expect(await page.locator('#s-ins').innerText()).not.toContain('Wat dit betekent');
    expect(await page.evaluate(() => typeof whatStandsOutCard)).toBe('function');   // functie blijft bestaan
  });
});
