/* v359, keuze van de gebruiker: twee dingen die op Inzichten stonden en daar als handeling of als regel vervielen,
   staan nu op Grip. (1) Het jaarbedrag onder een overschrijding staat in de sheet van dat potje (v313: s.over maal
   twaalf, geen tempo). (2) De lek-regel staat onder Let op; die tests staan in valt-op-signalen.spec.js. */
const { test, expect } = require('@playwright/test');
const S = require('./inzichten-stand');

const OVER = [{ id: 'x1', date: '2026-10-06', amount: -800, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }];

test('het jaarbedrag staat in de sheet van het potje op Grip, en is het bedrag van de Let op-regel maal twaalf', async ({ page }) => {
  await S.boot(page, { extraTx: OVER });
  await page.evaluate(() => go('maand'));
  const s = await page.evaluate(() => (valtOpSignals(thisYM()) || []).find((x) => x.potjeId === 'boodschappen'));
  expect(s, 'boodschappen staat werkelijk boven zijn potje').toBeTruthy();
  await expect(page.locator('#gripLetOp [data-letop="sig"]').first()).toContainText(`€${s.over.toLocaleString('nl-NL')} boven je potje`);
  await page.evaluate(() => openGripPotje('boodschappen'));
  const r = page.locator('#gripPotje [data-jaarbedrag]');
  await expect(r).toHaveCount(1);
  await expect(r).toHaveText(`€${s.over.toLocaleString('nl-NL')} boven je potje. Als dit elke maand gebeurt, is dat €${(s.over * 12).toLocaleString('nl-NL')} per jaar.`);
});

test('een potje zonder overschrijding draagt geen jaarbedrag', async ({ page }) => {
  await S.boot(page);
  await page.evaluate(() => go('maand'));
  const has = await page.evaluate(() => (valtOpSignals(thisYM()) || []).some((x) => x.potjeId === 'boodschappen'));
  expect(has).toBe(false);
  await page.evaluate(() => openGripPotje('boodschappen'));
  await expect(page.locator('#gripPotje')).toHaveCount(1);
  await expect(page.locator('#gripPotje [data-jaarbedrag]')).toHaveCount(0);
});

test('Inzichten draagt het jaarbedrag niet meer', async ({ page }) => {
  await S.boot(page, { extraTx: OVER });
  await page.evaluate(() => go('ins'));
  expect(await page.innerText('#s-ins')).not.toContain('per jaar');
});
