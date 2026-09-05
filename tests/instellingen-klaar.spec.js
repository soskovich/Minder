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
const klaar = async (page) => { await page.evaluate(() => terug()); await page.waitForTimeout(50); };

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
    await page.waitForFunction(() => typeof terug === 'function' && TX.length > 0);
    await page.waitForTimeout(120);
    expect(await actief(page)).toBe('s-set');            // de view-state herstelt Instellingen
    expect(await page.evaluate(() => vorigeView)).toBeNull();
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
    expect(await page.evaluate(() => vorigeView)).toBeNull();
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
    expect(await page.evaluate(() => vorigeView)).toBe('ins');
    expect(await page.evaluate(() => typeof vorigeView)).toBe('string');
    // niets van dit alles wordt opgeslagen
    expect(await page.evaluate(() => JSON.stringify(SET))).not.toContain('vorigeView');
    expect(await page.evaluate(() => Object.keys(localStorage).some((k) => /herkomst/i.test(k)))).toBe(false);
  });

  /* v185: het mechanisme is algemeen geworden, want Vermogen en Transacties hadden dezelfde
     hardgecodeerde go('dash'). Elk scherm onthoudt dus waar je vandaan kwam, altijd precies één
     stap terug. Een sprong via terug() zet zelf geen nieuwe herkomst, anders stuurt een tweede tik
     je heen en weer in plaats van naar Home. */
  test('elke sprong onthoudt precies één stap, en terug() zet er geen nieuwe', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    await page.evaluate(() => go('set'));
    await page.evaluate(() => go('maand'));
    expect(await page.evaluate(() => vorigeView)).toBe('set');   // één stap, geen stapel
    await klaar(page);
    expect(await actief(page)).toBe('s-set');
    expect(await page.evaluate(() => vorigeView)).toBeNull();
    await klaar(page);
    expect(await actief(page)).toBe('s-dash');                   // en dan de terugval
  });

  test('de twee andere terugknoppen gebruiken hetzelfde mechanisme', async ({ page }) => {
    await boot(page);
    for (const [van, naar] of [['ins', 'vermogen'], ['maand', 'tx']]) {
      await page.evaluate((x) => go(x), van);
      await page.evaluate((x) => go(x), naar);
      expect(await actief(page)).toBe('s-' + naar);
      await klaar(page);
      expect(await actief(page), naar).toBe('s-' + van);
    }
    // en beide knoppen roepen terug() aan, niet go('dash')
    const src = await page.evaluate(() => renderVermogen.toString() + renderTx.toString());
    expect(src).toContain('onclick="terug()"');
    expect(src).not.toContain(`onclick="go('dash')"`);
  });
});
