/* v521a: GENERATOR van tests/v521a-voor.json: de bedragen van 9fbc05f (v520b) per scherm in de stand van tests/v521a-stand.js.
   Draai met WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v521a-voor-gen.spec.js. Leest index.html van 9fbc05f uit git. */
const { test } = require('../klok');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const B = require('../v521a-stand');
const OUD = execSync('git show 9fbc05f:index.html', { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64e6 }).toString();
test('genereer', async ({ page }) => {
  test.setTimeout(90000);
  await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OUD }));
  await B.boot(page);
  const uit = await B.bedragen(page);
  fs.writeFileSync(path.join(__dirname, '..', 'v521a-voor.json'), JSON.stringify(uit, null, 1));
});
