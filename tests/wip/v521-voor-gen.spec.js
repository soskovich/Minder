/* v521: GENERATOR van tests/v521-voor.json: de bedragen van 9fbc05f (v520b) per scherm in de stand van tests/v519-bedragen.js (vragen aan).
   Draai met WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v521-voor-gen.spec.js. Leest index.html van 9fbc05f uit git. */
const { test } = require('../klok');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const B = require('../v519-bedragen');
const OUD = execSync('git show 9fbc05f:index.html', { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64e6 }).toString();
test('genereer', async ({ page }) => {
  await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OUD }));
  await B.boot(page);
  const uit = await B.bedragen(page);
  uit.v521Lezer = await page.evaluate(() => typeof vraagInkomenVerdeling === "function");
  fs.writeFileSync(path.join(__dirname, '..', 'v521-voor.json'), JSON.stringify(uit, null, 1));
});
