// v184: 'Klaar' in Instellingen deed hardgecodeerd go('dash'). Kwam je binnen via de budgetlink op
// Inzichten of via een tik op Maand, dan zette Klaar je op Home en was er geen terug.
// De herkomst komt uit de bestaande view-state: minder_view wordt pas aan het eind van go()
// geschreven, dus aan het begin staat er nog het scherm waar je vandaan komt. Eén waarde in
// module-state, geen tweede navigatiegeschiedenis: na een herstart is er geen herkomst.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const actief = (page) => page.evaluate(() =>
  (document.querySelector('.screen.active') || {}).id || '');

async function boot(page) {
  await open(page, seed());
  await page.evaluate(() => go('dash'));
}
const klaar = async (page) => { await page.evaluate(() => setKlaar()); await page.waitForTimeout(50); };

test.describe('a · Klaar keert terug naar waar je vandaan kwam', () => {
  for (const van of ['dash', 'ins', 'maand', 'vooruit', 'act']) {
    test(`vanaf ${van}`, async ({ page }) => {
      await boot(page);
      await page.evaluate((x) => go(x), van);
      await page.evaluate(() => go('set'));
      expect(await actief(page)).toBe('s-set');
      await klaar(page);
      expect(await actief(page)).toBe('s-' + van);
    });
  }

  test('via de budgetlink op Inzichten', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    // dezelfde route als de knop 'Budget bijstellen' in de drill-down
    await page.evaluate(() => { closeSheet(); go('set'); });
    await klaar(page);
    expect(await actief(page)).toBe('s-ins');
  });

  test('via openSaldoInvoer vanaf Home', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSaldoInvoer());
    expect(await actief(page)).toBe('s-set');
    await page.evaluate(() => closeSheet());
    await klaar(page);
    expect(await actief(page)).toBe('s-dash');
  });
});

test.describe('b · het randgeval valt terug op het oude gedrag', () => {
  test('na een herstart op Instellingen is er geen herkomst', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('set'));
    await page.reload();
    await page.waitForFunction(() => typeof setKlaar === 'function' && TX.length > 0);
    await page.waitForTimeout(120);
    expect(await actief(page)).toBe('s-set');            // de view-state herstelt Instellingen
    expect(await page.evaluate(() => setHerkomst)).toBeNull();
    await klaar(page);
    expect(await actief(page)).toBe('s-dash');           // terugval, zoals voorheen
  });

  test('twee keer Klaar valt de tweede keer terug', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    await page.evaluate(() => go('set'));
    await klaar(page);
    expect(await actief(page)).toBe('s-maand');
    // de herkomst is verbruikt en wordt niet hergebruikt
    expect(await page.evaluate(() => setHerkomst)).toBeNull();
  });

  test('Instellingen opnieuw openen vanaf Instellingen overschrijft de herkomst niet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    await page.evaluate(() => go('set'));
    await page.evaluate(() => go('set'));               // bv. via openSpaarrekening terwijl je er al bent
    await klaar(page);
    expect(await actief(page)).toBe('s-ins');
  });
});

test.describe('c · er is geen tweede navigatiegeschiedenis', () => {
  test('de herkomst is één waarde en overleeft geen herstart', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    await page.evaluate(() => go('set'));
    expect(await page.evaluate(() => setHerkomst)).toBe('ins');
    expect(await page.evaluate(() => typeof setHerkomst)).toBe('string');
    // niets van dit alles wordt opgeslagen
    expect(await page.evaluate(() => JSON.stringify(SET))).not.toContain('setHerkomst');
    expect(await page.evaluate(() => Object.keys(localStorage).some((k) => /herkomst/i.test(k)))).toBe(false);
  });

  test('naar een ander scherm gaan wist de herkomst', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    await page.evaluate(() => go('set'));
    await page.evaluate(() => go('maand'));
    expect(await page.evaluate(() => setHerkomst)).toBeNull();
  });
});
