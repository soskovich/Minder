/* Schermafdrukken v526 op 390px. Met MINDER_EXPORT (je back-up, niet committen) op die stand, anders op tests/v526-stand.js.
   Uit naar SHOT_DIR (standaard test-results/v526-shots). */
const fs = require('fs');
const { test } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const S = require('../v526-stand');
const DIR = process.env.SHOT_DIR || 'test-results/v526-shots';
test('v526 schermafdrukken', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.MINDER_EXPORT) {
    const d = JSON.parse(fs.readFileSync(process.env.MINDER_EXPORT, 'utf8'));
    const ls = { minder_tx: JSON.stringify(d.tx || []), minder_ovr: JSON.stringify(d.ovr || {}), minder_own: JSON.stringify(d.own || []),
      minder_accmeta: JSON.stringify(d.accmeta || {}), minder_plan: JSON.stringify(d.plan || {}), minder_set: JSON.stringify(d.set || {}) };
    await page.route('**/sw.js', (r) => r.abort());
    await page.addInitScript((x) => { if (!sessionStorage.getItem('rep')) { for (const k in x) localStorage.setItem(k, x[k]); sessionStorage.setItem('rep', '1'); } }, ls);
    await pinDatum(page, process.env.REPETITIE_DAG || '2026-11-27'); await page.goto('/index.html');
  } else await S.boot(page, '2026-11-27');
  fs.mkdirSync(DIR, { recursive: true });
  await page.evaluate(() => { go('maand'); gripKiesTab('zien'); closeSheet(); window.scrollTo(0, 0); });
  await page.screenshot({ path: DIR + '/1-grip-tegels.png' });
  await page.evaluate(() => openGripLagen()); await page.waitForTimeout(400);
  await page.screenshot({ path: DIR + '/2-sheet-lagen.png' });
  await page.evaluate(() => { closeSheet(); openGripFundament(); }); await page.waitForTimeout(400);
  await page.screenshot({ path: DIR + '/3-sheet-fundament.png' });
});
