// Budget invullen als bottomsheet (v61): de editor opent in-context vanuit Inzichten,
// niet meer via een sprong naar het Instellingen-tabblad. Eén editor (setBudget), twee ingangen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const SHEET = '#sheetBg.show';
const sheetTxt = (page) => page.locator('#sheet').innerText();

// Fixture: potjes 2400 boven de inkomen-limiet 2100 (70% van 3000). Het verschil staat als
// "boven inkomen-limiet" in de widget en beweegt dus mee met de limiet-slider in de sheet.
async function openIns(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
}

const actief = (page, id) => page.evaluate((s) => document.querySelector(s).classList.contains('active'), '#s-' + id);

test('a · tik op Maandbudget opent de budget-sheet en navigeert niet naar Instellingen', async ({ page }) => {
  await openIns(page);
  expect(await page.evaluate(() => window._budgetSheet || null)).toBeNull();

  await page.locator('#s-ins >> text=Maandbudget').first().click();
  await page.waitForSelector(SHEET);

  const s = await sheetTxt(page);
  expect(s).toContain('Budget deze maand');
  expect(s).toContain('Stel je maandbudget en potjes in.');
  expect(s).toContain('Bestedingslimiet');                       // dit is echt de editor, niet de vergelijking
  expect(s).not.toContain('Zo staat je budget ervoor');          // openBudgetCompare mag niet meeliften

  expect(await actief(page, 'ins')).toBe(true);
  expect(await actief(page, 'set')).toBe(false);                 // geen sprong naar het Instellingen-tabblad
  expect(await page.evaluate(() => window._budgetSheet)).toBe(CUR);
  expect(await page.evaluate(() => window._setSheet)).toBeFalsy();
});

test('a2 · ring en titel blijven de read-only vergelijking openen', async ({ page }) => {
  await openIns(page);
  await page.locator('#s-ins >> text=Budget deze maand').first().click();
  await page.waitForSelector(SHEET);
  expect(await page.evaluate(() => window._budgetSheet || null)).toBeNull();   // niet de editor
  expect(await sheetTxt(page)).not.toContain('Bestedingslimiet');
});

test('b · de limiet-slider werkt de sheet én de widget live bij', async ({ page }) => {
  await openIns(page);
  await page.locator('#s-ins >> text=Maandbudget').first().click();
  await page.waitForSelector(SHEET);

  expect(await sheetTxt(page)).toContain('Bestedingslimiet: 70%');
  expect(await page.locator('#s-ins').innerText()).toContain('(70%)');         // 2400 - 2100 = 300 boven de limiet
  expect(await page.locator('#s-ins').innerText()).toContain('€300');

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

  const ins = await page.locator('#s-ins').innerText();
  expect(ins).toContain('(50%)');                                              // 2400 - 1500 = 900
  expect(ins).toContain('€900');
});

test('c · een categorie-potje behoudt focus tijdens typen', async ({ page }) => {
  await openIns(page);
  await page.locator('#s-ins >> text=Maandbudget').first().click();
  await page.waitForSelector(SHEET);

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
  await openIns(page);
  await page.locator('#s-ins >> text=Maandbudget').first().click();
  await page.waitForSelector(SHEET);

  await page.locator('#sheet >> text=Klaar').first().click();
  await page.waitForSelector('#sheetBg.show', { state: 'detached' });
  expect(await page.evaluate(() => window._budgetSheet)).toBeNull();

  // opnieuw openen en via de achtergrond sluiten
  await page.locator('#s-ins >> text=Maandbudget').first().click();
  await page.waitForSelector(SHEET);
  await page.locator('#sheetBg').click({ position: { x: 5, y: 5 } });
  await page.waitForSelector('#sheetBg.show', { state: 'detached' });
  expect(await page.evaluate(() => window._budgetSheet)).toBeNull();

  // en na sluiten mag render() de sheet niet opnieuw vullen
  await page.evaluate(() => render());
  expect(await page.evaluate(() => document.querySelector('#sheetBg').classList.contains('show'))).toBe(false);
});

test('f · lege staat (nog geen budget) opent dezelfde editor', async ({ page }) => {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.income = 0; set.budgets = {}; set.budgetsNext = {};
  p.minder_set = JSON.stringify(set);
  await openIns(page, p);

  const ins = await page.locator('#s-ins').innerText();
  expect(ins).toContain('stel in');
  await page.locator('#s-ins >> text=stel in').first().click();
  await page.waitForSelector(SHEET);
  expect(await sheetTxt(page)).toContain('Budget deze maand');
  expect(await sheetTxt(page)).toContain('Bestedingslimiet');
});

// De render-hook mag alleen de eigen sheet verversen; een andere sheet die daarna opent
// (bv. de noodfonds-sheet) mag niet overschreven worden door een blijven-hangen vlag.
test('g · de hook overschrijft geen andere sheet', async ({ page }) => {
  await openIns(page);
  await page.locator('#s-ins >> text=Maandbudget').first().click();
  await page.waitForSelector(SHEET);

  await page.evaluate(() => { openSet('income'); });               // andere sheet, zonder tussentijds sluiten
  await page.evaluate(() => render());
  const s = await sheetTxt(page);
  expect(s).toContain('Inkomen');
  expect(s).not.toContain('Bestedingslimiet');
});
