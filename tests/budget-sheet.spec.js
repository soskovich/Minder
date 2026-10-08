// Budget invullen als bottomsheet (v61): de editor opent in-context vanuit Inzichten,
// niet meer via een sprong naar het Instellingen-tabblad. Eén editor (setBudget), twee ingangen.
// v114: de rij "Maandbudget" opent eerst de read-only verdeling; de editor zit daar achter de
// voetlink "Potjes en limiet instellen". De weg blijft dus in-context, hij is één tik langer.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const SHEET = '#sheetBg.show';
const sheetTxt = (page) => page.locator('#sheet').innerText();

// Fixture: potjes 2400 boven de inkomen-limiet 2100 (70% van 3000). De limiet-slider in de sheet
// werkt de sheet zelf live bij; de rij 'boven inkomen-limiet' die er vroeger aan hing is in v228
// vervallen.
async function openIns(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#insTegels');
}

/* v359: Inzichten draagt geen handeling meer, dus ook geen ingang naar de editor (de regel "Maandbudget" is met de
   stand-kaart vervallen). De verdeling opent hier rechtstreeks; zij is nog bereikbaar via de maandafsluiting en de
   tijdlijn op Grip. De tests a, a2 en f liepen langs Inzichten en zijn daarom vervallen. */
async function openVerdeling(page) {
  await page.evaluate(() => openPotjesVerdeling(curMonth));
}
async function openEditor(page, payload) {
  await openIns(page, payload);
  await openVerdeling(page);
  await page.waitForSelector(SHEET);
  await page.locator('#sheet >> text=Potjes en limiet instellen').click();
  await page.waitForSelector('#budgetSheetHead');
}

test('b · de limiet-slider werkt de sheet live bij', async ({ page }) => {
  await openEditor(page);

  expect(await sheetTxt(page)).toContain('Bestedingslimiet: 70%');

  // de echte oninput-handler van de slider afvuren (SET.limit=..;save();render();)
  await page.evaluate(() => {
    const el = document.querySelector('#sheet input[type="range"].slider');
    el.value = '50';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // self-refresh via de hook in render(): de sheet blijft staan en toont de nieuwe waarden
  const s = await sheetTxt(page);
  expect(s).toContain('Bestedingslimiet: 50%');
  expect(s).toContain('€1.500');                                               // Nu: 50% van 3000 besteden
  expect(await page.evaluate(() => SET.limit)).toBe(50);
  expect(await page.evaluate(() => document.querySelector('#sheetBg').classList.contains('show'))).toBe(true);
  // de limiet blijft een meting: totals() leest hem nog
  expect(await page.evaluate(() => totals(kijkMaand()).limit)).toBe(1500);
});

test('c · een categorie-potje behoudt focus tijdens typen', async ({ page }) => {
  await openEditor(page);

  const inp = page.locator('#sheet .row', { hasText: 'Online shopping' }).locator('input[type="number"]').first();
  await inp.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('300');                                             // drie losse oninput-events

  expect(await inp.evaluate((el) => el === document.activeElement)).toBe(true);
  expect(await inp.inputValue()).toBe('300');
  // wijziging aan een BESTAAND potje geldt vanaf volgende maand: de rekenregel blijft ongemoeid
  expect(await page.evaluate(() => SET.budgetsNext.shopping)).toBe(300);
  expect(await page.evaluate(() => SET.budgets.shopping)).toBe(255);
});

test('d · Instellingen ▸ Budget & doelen opent dezelfde sheet, niet de accordeon', async ({ page }) => {
  await open(page, seed());
  await page.evaluate(() => go('set'));
  await page.locator('#s-set >> text=Budget & doelen').first().click();
  await page.waitForSelector(SHEET);

  const s = await sheetTxt(page);
  expect(s).toContain('Budget deze maand');
  expect(s).toContain('Bestedingslimiet');
  expect(await page.evaluate(() => window._budgetSheet)).toBeTruthy();
  // de subtekst blijft op de rij staan, maar de editor klapt niet meer inline uit
  expect(await page.locator('#s-set').innerText()).toContain('Je spaart');
  expect(await page.locator('#s-set').innerText()).not.toContain('Bestedingslimiet');
});

test('e · Klaar en de achtergrond sluiten de sheet en ruimen de vlag op', async ({ page }) => {
  await openEditor(page);

  await page.locator('#sheet >> text=Klaar').first().click();
  await page.waitForSelector('#sheetBg.show', { state: 'detached' });
  expect(await page.evaluate(() => window._budgetSheet)).toBeNull();

  // opnieuw openen en via de achtergrond sluiten
  await openVerdeling(page);
  await page.waitForSelector(SHEET);
  await page.locator('#sheet >> text=Potjes en limiet instellen').click();
  await page.waitForSelector('#budgetSheetHead');
  await page.locator('#sheetBg').click({ position: { x: 5, y: 5 } });
  await page.waitForSelector('#sheetBg.show', { state: 'detached' });
  expect(await page.evaluate(() => window._budgetSheet)).toBeNull();

  // en na sluiten mag render() de sheet niet opnieuw vullen
  await page.evaluate(() => render());
  expect(await page.evaluate(() => document.querySelector('#sheetBg').classList.contains('show'))).toBe(false);
});

// De render-hook mag alleen de eigen sheet verversen; een andere sheet die daarna opent
// (bv. de noodfonds-sheet) mag niet overschreven worden door een blijven-hangen vlag.
test('g · de hook overschrijft geen andere sheet', async ({ page }) => {
  await openIns(page);
  await openVerdeling(page);
  await page.waitForSelector(SHEET);

  await page.evaluate(() => { openInkomenSheet(); });               // andere sheet, zonder tussentijds sluiten
  await page.evaluate(() => render());
  const s = await sheetTxt(page);
  expect(s).toContain('Inkomen');
  expect(s).not.toContain('Bestedingslimiet');
});
