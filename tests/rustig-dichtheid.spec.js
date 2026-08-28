// v90: Rustig-modus start rustiger op Inzichten — hooguit 3 kerncijfers (met "toon alle …") en de
// twaalf-maands grafiek ingeklapt. Een expliciete keuze van de gebruiker wint altijd van die default.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

async function openIns(page, mode) {
  const p = seed();
  const set = JSON.parse(p.minder_set); set.mode = mode; p.minder_set = JSON.stringify(set);
  await open(page, p);
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#insKpiStrip');
}
const tegels = (page) => page.locator('#insKpiStrip .wvo-tile');
const grafiek = (page) => page.locator('#insSpendChart');

test.describe('a · kerncijfers: drie tegelijk in Rustig', () => {
  test('Rustig toont er 3 met een uitklap; de keuze blijft staan', async ({ page }) => {
    await openIns(page, 'rustig');
    await expect(tegels(page)).toHaveCount(3);
    const keys = await tegels(page).evaluateAll((els) => els.map((e) => e.dataset.kpi));
    expect(keys).toEqual(['spaar', 'budget', 'vari']);              // volgorde onaangeroerd
    const knop = page.locator('#kpiMeer');
    await expect(knop).toHaveCount(1);
    expect(await knop.innerText()).toContain('toon alle 4 kerncijfers');

    await knop.click();
    await page.waitForFunction(() => document.querySelectorAll('#insKpiStrip .wvo-tile').length === 4);
    expect(await page.evaluate(() => SET.kpiAll)).toBe(true);
    expect(await page.locator('#kpiMeer').innerText()).toContain('minder');

    // en na een re-render blijft het uitgeklapt
    await page.evaluate(() => renderIns());
    await expect(tegels(page)).toHaveCount(4);
  });

  test('Begeleid en Expert tonen alle vier, zonder uitklap', async ({ page }) => {
    for (const mode of ['begeleid', 'expert']) {
      await openIns(page, mode);
      await expect(tegels(page), mode).toHaveCount(4);
      expect(await page.locator('#kpiMeer').count(), mode).toBe(0);
    }
  });
});

test.describe('b · maandgrafiek ingeklapt in Rustig', () => {
  test('Rustig start dicht, met een tikbare kop', async ({ page }) => {
    await openIns(page, 'rustig');
    expect(await grafiek(page).count()).toBe(0);                    // geen 12-maands grafiek in beeld
    const kaart = page.locator('#insSpendCard');
    await expect(kaart).toHaveCount(1);
    expect((await kaart.innerText()).toLowerCase()).toContain('uitgaven vs budget');
    expect(await kaart.innerText()).toContain('tik om te bekijken');

    await kaart.locator('.row').click();
    await page.waitForSelector('#insSpendChart');
    expect(await page.evaluate(() => SET.openSpendChart)).toBe(true);
    expect(await page.evaluate(() => collapOpen('openSpendChart'))).toBe(true);
  });

  test('Begeleid staat gewoon open, en een eigen keuze wint in beide modi', async ({ page }) => {
    await openIns(page, 'begeleid');
    await expect(grafiek(page)).toHaveCount(1);

    // de gebruiker klapt hem zelf dicht: dan blijft hij dicht, ook in Begeleid
    await page.locator('#insSpendCard .row, #s-ins .card .row').first().click().catch(() => {});
    await page.evaluate(() => { toggleCollap('openSpendChart'); });
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => SET.openSpendChart)).toBe(false);
    expect(await grafiek(page).count()).toBe(0);

    // en in Rustig wint een expliciet "open" van de ingeklapte default
    await page.evaluate(() => { SET.mode = 'rustig'; SET.openSpendChart = true; save(); renderIns(); });
    await page.waitForTimeout(120);
    await expect(grafiek(page)).toHaveCount(1);
  });

  test('collapOpen is drietraps en raakt bestaande vlaggen niet', async ({ page }) => {
    await openIns(page, 'begeleid');
    const r = await page.evaluate(() => {
      const uit = {};
      delete SET.openSpendChart;
      SET.mode = 'rustig'; uit.rustigDefault = collapOpen('openSpendChart');
      SET.mode = 'begeleid'; uit.begeleidDefault = collapOpen('openSpendChart');
      SET.openSpendChart = false; uit.expliciteDicht = collapOpen('openSpendChart');
      SET.mode = 'rustig'; SET.openSpendChart = true; uit.expliciteOpen = collapOpen('openSpendChart');
      delete SET.openMerch; uit.merchDefault = collapOpen('openMerch');       // bestaande vlag: dicht
      return uit;
    });
    expect(r.rustigDefault).toBe(false);
    expect(r.begeleidDefault).toBe(true);
    expect(r.expliciteDicht).toBe(false);
    expect(r.expliciteOpen).toBe(true);
    expect(r.merchDefault).toBe(false);
  });
});

test.describe('c · niets anders verandert', () => {
  test('Home toont in Rustig dezelfde blokken als in Begeleid', async ({ page }) => {
    const blokken = async (mode) => {
      await openIns(page, mode);
      return await page.evaluate(() => { go('dash'); const d = document.getElementById('s-dash');
        return { hero: d.querySelectorAll('.homehero').length, verm: /Netto vermogen|bezittingen/i.test(d.innerText), recent: d.querySelectorAll('.txl').length }; });
    };
    const b = await blokken('begeleid'), r = await blokken('rustig');
    expect(r.hero).toBe(b.hero);
    expect(r.verm).toBe(b.verm);
    expect(r.recent).toBe(b.recent);
  });

  test('de cijfers en de norm-regel blijven in Rustig gewoon staan', async ({ page }) => {
    await openIns(page, 'rustig');
    const strip = await page.locator('#insKpiStrip').innerText();
    expect(strip.toLowerCase()).toContain('restsaldo-quote');
    expect(strip).toContain('doel 20% of meer');
    expect(strip).toContain('Gemeten tegen: 50/30/20');
    expect(await page.evaluate((m) => insKpis(m).items.length, null)).toBe(4);   // de KPI's zelf blijven vier
    // de samenstelling van Inzichten is niet veranderd: alleen wát er open staat
    expect(await page.evaluate(() => /insKpiStrip\(m\)\s*\+\s*spendVsBudgetChart\(\)\s*\+\s*whatStandsOutLine\(m\)/.test(renderIns.toString()))).toBe(true);
  });

  test('Rustig past op 360px zonder overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await openIns(page, 'rustig');
    const r = await page.evaluate(() => ({
      pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      buiten: [...document.querySelectorAll('#s-ins .card')].filter((c) => c.scrollWidth > c.clientWidth + 1).length,
    }));
    expect(r.pagina).toBe(0);
    expect(r.buiten).toBe(0);
  });
});
