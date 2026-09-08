// v70: de potjes-widget is uit Coach en de komende-uitgaven-lijsten zijn uit Vooruitblik.
// Deze spec bewaakt dat ze weg zijn én dat wat eromheen stond gewoon blijft werken.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1 } = require('./budget-fixture');

async function boot(page, scherm, payload) {
  await open(page, payload || seed());
  await page.evaluate((s) => go(s), scherm);
  await page.waitForSelector(`#s-${scherm}`);
}

/* v196: hier stond blok a, over wat er op het coachscherm wel en niet stond. Dat scherm is met
   fase 6 opgeheven: de coach is geen bestemming meer maar een gesprek dat je vanaf vier plekken
   oproept. Wat deze tests bewaakten heeft geen scherm meer om op te staan; dat potjes elders
   bewerkbaar blijven staat hieronder, en dat de koopcheck bereikbaar blijft staat in
   coach-zonder-scherm.spec.js. */
test.describe('a · wat de potjes-widget achterliet', () => {
  test('potjes blijven bewerkbaar via de budget-bottomsheet', async ({ page }) => {
    await boot(page, 'ins');
    await page.waitForSelector('#s-ins .card');   // v208: het Kerncijfers-blok staat niet meer op Inzichten
    await page.locator('#s-ins >> text=Maandbudget').first().click();      // v114: eerst de verdeling
    await page.waitForSelector('#sheetBg.show');
    await page.locator('#sheet >> text=Potjes en limiet instellen').click();
    await page.waitForSelector('#budgetSheetHead');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Budget deze maand');
    expect(sheet).toContain('Maandbudget per categorie');
    expect(await page.locator('#sheet input[type="number"]').count()).toBeGreaterThan(0);

    // de potjes-helpers zelf zijn niet gesloopt
    const helpers = await page.evaluate(() => ({
      potje: typeof openPotje, pick: typeof openPotjePick, tot: typeof totalBudget, budget: totalBudget(),
    }));
    expect(helpers).toMatchObject({ potje: 'function', pick: 'function', tot: 'function' });
    expect(helpers.budget).toBeGreaterThan(0);
  });
});

test.describe('b · Vooruitblik zonder komende-uitgaven-lijsten', () => {
  test('geen "Volgende uitgaven" en geen lege detail-toggle', async ({ page }) => {
    await boot(page, 'vooruit');
    await page.waitForSelector('#s-vooruit .card');
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).not.toContain('Volgende uitgaven');
    expect(v).not.toMatch(/deze maand in detail/i);
    expect(await page.evaluate(() => /toggleVooruit\('vooruitMeer'\)/.test(document.getElementById('s-vooruit').innerHTML))).toBe(false);
  });

  test('ook een afgeronde maand toont geen komende-lasten-lijst', async ({ page }) => {
    await boot(page, 'vooruit');
    await page.evaluate((m) => { curMonth = m; renderVooruit(); }, M1);
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).not.toContain('Komende lasten');
    expect(v).not.toContain('Volgende uitgaven');
    // v193: de zonekop heet niet meer 'Mijn plan' maar draagt de samenvatting van de lijst
    expect(v).toMatch(/#1 /);                                    // wat er hoort te blijven
  });

  test('de rest van Vooruitblik blijft staan', async ({ page }) => {
    await boot(page, 'vooruit');
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).not.toMatch(/nog deze maand/i);                    // v144: alleen nog op Inzichten
    expect(v).toMatch(/#1 /);                                    // de prioriteitenlijst, samengevat
  });

  // v164: vooruitFocus() had geen aanroeper meer en is opgeruimd. Wat overeind blijft is de vraag
  // die deze test stelde: de vaste-lasten-sheet moet bereikbaar zijn en zijn eigen inhoud tonen.
  test('de vaste-lasten-sheet opent en toont zijn eigen inhoud', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set);
    set.manualBal = { 'NL01MAIN0000001111': 50, 'NL01SAVE0000004323': 0 };
    p.minder_set = JSON.stringify(set);
    await boot(page, 'vooruit', p);

    await page.evaluate(() => { $('#sheet').innerHTML = ''; openFixedDue(); });
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toMatch(/vaste lasten|nog te betalen/i);
    expect(await page.locator('#sheet').innerHTML()).not.toContain('vooruitMeer');   // geen dode zone
  });
});
