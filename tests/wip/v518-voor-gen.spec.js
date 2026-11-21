/* v518: GENERATOR van tests/v518-voor.json: de bedragen van 3faf02b (v517b) in de stand van tests/v518-bedragen.js, plus de verdeling
   na de oude inline link "gaat niet via deze rekening ›" (boodschappen, Leefgeld). Draai met
   WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v518-voor-gen.spec.js. Leest index.html van 3faf02b uit git. */
const { test } = require('../klok');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const B = require('../v518-bedragen');
const OUD = execSync('git show 3faf02b:index.html', { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64e6 }).toString();
test('genereer', async ({ page }) => {
  await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OUD }));
  await B.boot(page);
  const uit = await B.bedragen(page);
  uit.verdelingVoor = await B.verdeling(page);
  uit.spaarquote = await page.evaluate(() => { const m = vermogenSpaarquoteMaand(), K = insKpis(m); return { m, inleg: K.inleg ? [K.inleg.raw, K.inleg.val] : null, inlegM: JSON.stringify(vermogensInleg(m)), opzij: JSON.stringify(opzijGemiddeld()) }; });
  /* de oude route: de inline link onder de potjesregel van Leefgeld */
  await page.evaluate((L) => { go('maand'); openSalVerdeling('x'); window._salv.hoe[L] = true; renderSalVerdeling(); }, B.LEEF);
  await page.locator(`[data-salvhoe="${B.LEEF}"] [data-salvgeenrek="boodschappen"]`).click();
  uit.verdelingNa = await B.verdeling(page);
  fs.writeFileSync(path.join(__dirname, '..', 'v518-voor.json'), JSON.stringify(uit, null, 1));
});
