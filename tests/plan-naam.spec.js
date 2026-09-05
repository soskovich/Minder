// v179: het scherm heette Vooruitblik maar bevat de plan-editor. De vraag die je er beantwoordt is
// niet "hoe ziet mijn toekomst eruit" maar "waar gaat mijn spaarinleg als eerste heen", en dat is
// een beslissing. Het heet daarom Plan, in de nav en in elke tekst die je leest.
// De interne sleutel blijft 'vooruit': dat is opslag (minder_view) en navigatie-state, geen tekst.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

test.describe('a · de naam in de nav', () => {
  test('de tab heet Plan en nergens meer Vooruitblik', async ({ page }) => {
    await open(page, seed());
    const nav = await page.locator('nav a[data-go="vooruit"]').innerText();
    expect(nav.trim()).toBe('Plan');
    expect(await page.locator('nav').innerText()).not.toMatch(/vooruitblik/i);
  });

  test('de tab werkt nog en opent hetzelfde scherm', async ({ page }) => {
    await open(page, seed());
    await page.locator('nav a[data-go="vooruit"]').click();
    await page.waitForTimeout(120);
    expect(await page.locator('#s-vooruit').isVisible()).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('minder_view'))).toBe('vooruit');
  });
});

test.describe('b · geen zichtbare tekst noemt de oude naam meer', () => {
  test('geen enkel scherm zegt Vooruitblik', async ({ page }) => {
    await open(page, seed());
    for (const s of ['dash', 'ins', 'act', 'maand', 'vooruit', 'vermogen', 'set']) {
      await page.evaluate((x) => go(x), s);
      await page.waitForTimeout(60);
      const t = await page.evaluate((x) => $('#s-' + x).innerText, s);
      expect(t, s).not.toMatch(/vooruitblik/i);
    }
  });

  test('de coach en de instellingen verwijzen naar Plan', async ({ page }) => {
    await open(page, seed());
    const r = await page.evaluate(() => ({
      lek: coTopicLek.toString(), hor: coTopicHorizon.toString(),
      nf: openNoodfondsPanel.toString(), set: renderInkomenSheet.toString(),
    }));
    for (const [k, v] of Object.entries(r)) expect(v, k).not.toMatch(/je vooruitblik/i);
    expect(r.lek + r.hor).toContain('terug in je plan');
  });

  test('het spaardoel-signaal verwijst naar Plan', async ({ page }) => {
    await open(page, seed());
    const src = await page.evaluate(() => scoreNotifs.toString());
    expect(src).toContain("Bekijk je plan");
    expect(src).not.toContain('Bekijk je vooruitblik');
  });
});

test.describe('c · de interne sleutel verandert niet mee', () => {
  test("go('vooruit') en de opslagsleutel blijven bestaan", async ({ page }) => {
    await open(page, seed());
    // een hernoemde sleutel zou een migratie vragen zonder dat er iets aan verandert
    await page.evaluate(() => { localStorage.setItem('minder_view', 'vooruit'); });
    await page.reload();
    await page.waitForFunction(() => typeof renderVooruit === 'function');
    await page.waitForTimeout(150);
    expect(await page.locator('#s-vooruit').isVisible()).toBe(true);
  });
});
