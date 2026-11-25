/* v523: de schermafdrukken op 390px van de bevestiging, de krap-melding en de reserveringslijst. WIP=1 SHOT_DIR=<map> npx playwright test tests/wip/v523-shot.spec.js */
const { test } = require('../klok');
const S = require('../v523-stand');
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
test('shots', async ({ page }) => {
  await S.boot(page);
  await page.evaluate(({ BET, LEEF }) => { openPeriodeStart(); salVerdelingVeld(BET, '1700'); salVerdelingVeld(LEEF, '1695'); salVerdelingVeld('__res', '36'); salVerdelingVeld('__opzij', '1500');
    for (const el of document.querySelectorAll('#salVerdeling [data-salvveld]')) { const k = el.dataset.salvveld; el.value = { [BET]: '1.700', [LEEF]: '1.695', __res: '36', __opzij: '1.500' }[k] || el.value; } }, { BET: S.BET, LEEF: S.LEEF });
  await page.waitForTimeout(300);
  await page.locator('#sheet').screenshot({ path: (process.env.SHOT_DIR || 'test-results') + '/v523-bevestiging.png' });
  // krap: op 29 nov is de overboeking naar de Betaalrekening te laat
  await S.boot(page, { dag: '2026-11-29' });
  await page.evaluate(() => { closeSheet(); openKrapPopup(); });
  await page.waitForTimeout(300);
  await page.locator('#sheet').screenshot({ path: (process.env.SHOT_DIR || 'test-results') + '/v523-krap.png' });
  await S.boot(page, { resDag: true });
  await page.evaluate(() => { closeSheet(); openResPeriode(); });
  await page.waitForTimeout(300);
  await page.locator('#sheet').screenshot({ path: (process.env.SHOT_DIR || 'test-results') + '/v523-reserveringen.png' });
});
