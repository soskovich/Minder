/* v488 (punt 5): UITGEGEVEN OPENT DE BOEKINGEN.
   a. "vast" onder Uitgegeven opent "Betaald · vast", niet "Nog te betalen".
   b. "potjes" onder Uitgegeven is aan te tikken en leidt via een potje naar de boekingen.
   c. De maandkeuze in het potjes-scherm toont de boekingen van de gekozen maand (juli).
   d. De som van de rijen in "Betaald · vast" is in centen gelijk aan het getal waarop je tikte (de legenda-waarde). */
const { test, expect } = require('@playwright/test');
const S = require('./v488-stand');

test('a. "vast" onder Uitgegeven opent "Betaald · vast", niet "Nog te betalen"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  await page.evaluate(() => go('ins'));
  const leg = page.locator('#insMaand [data-insleg="vast"]');
  expect(await leg.getAttribute('onclick')).toContain('openInsVastBetaald');   // sabotage: openInsTegel('vast') → het oude scherm
  await leg.click();
  expect(await page.locator('#insVastBetaald').count()).toBe(1);               // het nieuwe scherm "Betaald · vast"
  expect(await page.locator('#insTegelSheet').count()).toBe(0);                // niet het oude "Nog te betalen"
  expect(await page.locator('#insVastBetaald').innerText()).toContain('Betaald · vast');
});

test('b. "potjes" onder Uitgegeven is aan te tikken en leidt via een potje naar de boekingen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  await page.evaluate(() => go('ins'));
  const leg = page.locator('#insMaand [data-insleg="potjes"]');
  expect(await leg.getAttribute('onclick')).toContain('openInsPotjes');        // sabotage: niet klikbaar (geen onclick)
  await leg.click();
  const rijen = page.locator('#insPotjesSheet [data-inspotjerij]');
  expect(await rijen.count()).toBeGreaterThan(0);
  await page.locator('#insPotjesSheet [data-inspotjerij="boodschappen"]').click();
  expect(await page.locator('#insPotjeSheet').count()).toBe(1);
  expect(await page.locator('#insPotjeSheet [data-insemrij]').count()).toBeGreaterThan(0);   // de boekingen
});

test('c. de maandkeuze toont de boekingen van de gekozen maand (juli)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  await page.evaluate(() => { go('ins'); openInsPotje('boodschappen'); });
  /* kies juli via de kiezer */
  await page.locator('#insPotjeSheet [data-inspotjemaand="2026-07"]').click();
  expect(await page.locator('#insPotjeSheet').getAttribute('data-inspotjemnd')).toBe('2026-07');   // past-maand-tak
  /* elke getoonde boeking valt in juli (sabotage: maandkeuze negeren → lopende maand) */
  const dates = await page.evaluate(() => [...document.querySelectorAll('#insPotjeSheet [data-insemrij]')].map(el => (TX.find(t => t.id === el.getAttribute('data-insemrij')) || {}).date));
  expect(dates.length).toBeGreaterThan(0);
  expect(dates.every(d => String(d).slice(0, 7) === '2026-07')).toBe(true);
});

test('d. de som van de rijen in "Betaald · vast" is in centen gelijk aan het getal waarop je tikte', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  await page.evaluate(() => go('ins'));
  const tapC = Math.round(+(await page.locator('#insMaand [data-insleg="vast"]').getAttribute('data-v')) * 100);
  await page.locator('#insMaand [data-insleg="vast"]').click();
  const rijen = page.locator('#insVastBetaald [data-insvbrij]');
  expect(await rijen.count()).toBeGreaterThan(1);                               // meerdere posten, zodat "één overslaan" iets weglaat
  const somC = await page.evaluate(() => [...document.querySelectorAll('#insVastBetaald [data-vbrij], #insVastBetaald [data-insvbrij]')].reduce((a, el) => a + (+el.getAttribute('data-vbsom') || 0), 0));
  expect(somC).toBe(tapC);                                                      // sabotage: één post overslaan → som < tapC
  expect(+(await page.locator('#insVastBetaald').getAttribute('data-insvastbetaald'))).toBe(tapC);
});
