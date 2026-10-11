// v136: gemeld — de Categorieën-kaart stond op de Inzichten-pagina zelf én achter "Uitgegeven".
// Dezelfde verdeling, twee plekken. De kaart op de pagina is weg; de drill-down blijft de enige
// plek waar de vraag "waar ging mijn geld heen" wordt beantwoord (v114/v115).
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');
const { kaalUit } = require('./bron-kaal');

async function boot(page) {
  await open(page, seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
}

test.describe('a · de pagina', () => {
  test('geen Categorieën-kaart meer op Inzichten', async ({ page }) => {
    await boot(page);
    const t = await page.locator('#s-ins').innerText();
    expect(t).not.toMatch(/^categorieën/im);          // .hlabel rendert uppercase
    expect(t).not.toMatch(/grootste:/i);               // de ingeklapte samenvatting van die kaart
    // de samenstelling zelf, zodat een herschikking hem niet stilzwijgend terugzet
    expect(/renderCatBreak/.test(await kaalUit(page, 'renderIns'))).toBe(false);
  });

  /* v208: Verdieping bevatte precies één element, het Kerncijfers-blok, en dat is van Inzichten af.
     De sectiekop viel daarmee vanzelf weg: renderIns() had die guard al. */
  test('Verdieping bestaat niet meer, en de maandgrafiek staat op geen van beide schermen', async ({ page }) => {
    await boot(page);
    const t = await page.locator('#s-ins').innerText();
    expect(t).not.toMatch(/verdieping/i);
    expect(t).not.toMatch(/kerncijfers/i);
    // v178 haalde de meermaands-grafiek naar Maand, v227 zette hem terug, v359 noemde hem "Over de maanden";
    // v382: weg van Inzichten (de afgesloten maanden staan in het logboek), en hij is niet naar Grip gegaan
    expect(t).not.toMatch(/over de maanden/i);
    await page.evaluate(() => go('maand'));
    expect(await page.locator('#s-maand').innerText()).not.toMatch(/over de maanden/i);
  });
});

test.describe('b · de drill-down is de enige plek', () => {
  test('achter Uitgegeven staat de verdeling volledig open', async ({ page }) => {
    await boot(page);
    await page.click('#insMaand [data-insmaandkop]'); await page.locator('#sheet >> text=Per categorie').click();   // v382: de kop van de maandkaart, dan de verdeling
    await page.waitForSelector('#msBody');
    const body = await page.locator('#msBody').innerText();
    expect(body).toMatch(/^categorieën/im);
    expect(body).toContain('Boodschappen');
    expect(body).toMatch(/% = aandeel per categorie/);   // de open vorm, niet de samenvatting
    expect(body).not.toMatch(/grootste:/i);
  });

  test('de kop is geen knop meer: geen dode inklap die wel SET schrijft', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openMonthSpend());
    await page.waitForSelector('#msBody');
    const bron = await kaalUit(page, 'renderCatBreak');
    expect(bron).not.toContain('openCatBreak');
    expect(/openCatBreak/.test(await kaalUit(page, 'openMonthSpend'))).toBe(false);
    // de vlag bestaat nergens meer, dus openen kan hem ook niet zetten
    expect(await page.evaluate(() => SET.openCatBreak)).toBeUndefined();
  });

  test('een rij opent nog steeds de categorie', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openMonthSpend());
    await page.waitForSelector('#msBody');
    await page.locator('#msBody .cat-row', { hasText: 'Boodschappen' }).first().click();
    expect(await page.locator('#sheet').innerText()).toContain('Boodschappen');
  });

  test('de andere twee chips blijven werken', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openMonthSpend());
    await page.waitForSelector('#msBody');
    const chips = await page.locator('#sheet .chip').allInnerTexts();
    expect(chips).toEqual(['Categorieën', 'Top uitgaven', 'Vast/variabel']);
    await page.locator('#sheet .chip', { hasText: 'Vast/variabel' }).click();
    await page.waitForFunction(() => msDrill() === 'fv');
    expect(await page.locator('#msBody').innerText()).toMatch(/vast vs variabel/i);
  });
});

test.describe('c · layout', () => {
  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page);
      await page.evaluate(() => openMonthSpend());
      await page.waitForSelector('#msBody');
      const over = await page.evaluate(() => ({
        sheet: document.querySelector('#sheet').scrollWidth - document.querySelector('#sheet').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
