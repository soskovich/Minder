/* v520b: GENERATOR van tests/v520b-voor.json: de bedragen van ff9467c (v520) per scherm in de stand van tests/v519-bedragen.js (vragen aan).
   Draai met WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v520b-voor-gen.spec.js. Leest index.html van ff9467c uit git. */
const { test } = require('../klok');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const B = require('../v519-bedragen');
const OUD = execSync('git show ff9467c:index.html', { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64e6 }).toString();
test('genereer', async ({ page }) => {
  await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OUD }));
  await B.boot(page);
  const uit = await B.bedragen(page);
  uit.v520bLezer = await page.evaluate(() => typeof vraagWoorden === 'function');
  fs.writeFileSync(path.join(__dirname, '..', 'v520b-voor.json'), JSON.stringify(uit, null, 1));
});
