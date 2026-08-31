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

test.describe('a · Coach zonder potjes-widget', () => {
  test('de "Je potjes"-zone is weg', async ({ page }) => {
    await boot(page, 'act');
    await page.waitForSelector('#s-act .coachhead');
    const act = await page.locator('#s-act').innerText();
    expect(act).not.toContain('Je potjes');
    expect(act).not.toContain('Potje voor een categorie');
    expect(act).not.toContain('Geen potje = geen aankoop');
    expect(await page.locator('#s-act .cz-pot').count()).toBe(0);
    expect(await page.locator('#s-act .cp-add').count()).toBe(0);
    // en geen dode toggle achtergelaten
    expect(await page.evaluate(() => typeof togglePotjes)).toBe('undefined');
    expect(await page.evaluate(() => renderActions.toString().includes('zonePotjes'))).toBe(false);
  });

  test('de rest van Coach blijft staan en werkt', async ({ page }) => {
    await boot(page, 'act');
    await page.waitForSelector('#s-act .coachhead');
    const act = await page.locator('#s-act').innerText();
    expect(act).toMatch(/je coach/i);                            // .nm staat op uppercase
    expect(act).toMatch(/ik wil iets kopen/i);
    expect(act).toMatch(/mijn regel: geen budget, geen aankoop/i);

    // v138: Coach openen start het gesprek in de sheet, die het scherm afdekt. Eerst dicht,
    // dan is s-act weer bereikbaar; de kop, de koopknop en de spiegelkaart staan er onveranderd.
    await page.evaluate(() => closeSheet());
    await page.locator('#buyBtn').click();                       // koopcheck opent nog
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toMatch(/kopen|aankoop/i);
  });

  test('potjes blijven bewerkbaar via de budget-bottomsheet', async ({ page }) => {
    await boot(page, 'ins');
    await page.waitForSelector('#insKpiStrip');
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
    expect(v).toMatch(/mijn plan/i);                             // wat er hoort te blijven (hlabel = uppercase)
  });

  test('de rest van Vooruitblik blijft staan', async ({ page }) => {
    await boot(page, 'vooruit');
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).toMatch(/nog deze maand/i);                        // liquiditeitskaart
    expect(v).toMatch(/mijn plan/i);                             // prioriteitenlijst
  });

  test('"Bekijk je lasten" gaat nu direct naar de vaste-lasten-sheet', async ({ page }) => {
    // krap scenario: weinig saldo, zodat vooruitFocus de tekort-tak pakt
    const p = seed();
    const set = JSON.parse(p.minder_set);
    set.manualBal = { 'NL01MAIN0000001111': 50, 'NL01SAVE0000004323': 0 };
    p.minder_set = JSON.stringify(set);
    await boot(page, 'vooruit', p);

    const html = await page.evaluate(() => vooruitFocus());
    expect(html).not.toContain('vooruitMeer');                   // geen verwijzing naar de dode zone
    if (html.includes('Bekijk je lasten')) {
      expect(html).toContain('openFixedDue()');
      await page.evaluate(() => { $('#sheet').innerHTML = ''; openFixedDue(); });
      await page.waitForSelector('#sheetBg.show');
      expect(await page.locator('#sheet').innerText()).toMatch(/vaste lasten|nog te betalen/i);
    }
  });
});
