/* v519: GENERATOR van tests/v519-voor.json: de bedragen van dd83bac (v518) per scherm in de stand van tests/v519-bedragen.js. Draai met
   WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v519-voor-gen.spec.js. Leest index.html van dd83bac uit git. */
const { test } = require('../klok');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const B = require('../v519-bedragen');
const OUD = execSync('git show dd83bac:index.html', { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64e6 }).toString();
test('genereer', async ({ page }) => {
  await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OUD }));
  await B.boot(page);
  const uit = await B.bedragen(page);
  uit.vraagLezer = await page.evaluate(() => typeof vraagKnopAan === 'function');
  fs.writeFileSync(path.join(__dirname, '..', 'v519-voor.json'), JSON.stringify(uit, null, 1));
});
