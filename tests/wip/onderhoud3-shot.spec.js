/* onderhoud3: schermafdruk van Plan op 390px op je eigen back-up (verlaat je machine niet), plus de sheets van Beschermen en Doelen.
   MINDER_EXPORT=<pad naar back-up> SHOT_DIR=<map> SHOT_NAAM=na TZ=Europe/Amsterdam WIP=1 npx playwright test tests/wip/onderhoud3-shot.spec.js
   Draai hem met SHOT_NAAM=voor op de vorige main (d8c90b9) voor de vergelijking. */
const fs = require('fs');
const { test } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const OUT = process.env.SHOT_DIR || '.', NAAM = process.env.SHOT_NAAM || 'na';

test('Plan op 390px, met de back-up', async ({ page }) => {
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8'));
  const ls = { minder_tx: JSON.stringify(data.tx || []), minder_ovr: JSON.stringify(data.ovr || {}), minder_own: JSON.stringify(data.own || []),
    minder_accmeta: JSON.stringify(data.accmeta || {}), minder_plan: JSON.stringify(data.plan || {}), minder_set: JSON.stringify(data.set || {}) };
  await page.addInitScript((d) => { if (!sessionStorage.getItem('o3')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('o3', '1'); } }, ls);
  await pinDatum(page, process.env.SHOT_DAG || '2026-11-26');
  await page.setViewportSize({ width: 390, height: 1800 });
  await page.goto('/index.html');
  await page.evaluate(() => { go('dash'); go('vooruit'); });
  await page.waitForTimeout(300);
  await page.locator('#s-vooruit').screenshot({ path: `${OUT}/plan-${NAAM}.png` });
  for (const [k, fn] of [['beschermen', 'openLaagBeschermen'], ['doelen', 'openLaagDoelen']]) {
    const ok = await page.evaluate((f) => { if (typeof window[f] !== 'function') return false; window[f](); return true; }, fn);
    if (ok) { await page.waitForTimeout(200); await page.locator('#sheet').screenshot({ path: `${OUT}/sheet-${k}-${NAAM}.png` }); await page.evaluate(() => closeSheet()); }
  }
});
