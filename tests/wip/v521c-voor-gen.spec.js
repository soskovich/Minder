/* v521c: GENERATOR van tests/v521c-voor.json: de bedragen van 82e517c (v521b) per scherm in de stand van tests/v521c-stand.js.
   Draai met WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v521c-voor-gen.spec.js. Leest index.html van 82e517c uit git. */
const { test } = require('../klok');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const B = require('../v521c-stand');
const { bedragen } = require('../v521a-stand');
const OUD = execSync('git show 82e517c:index.html', { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64e6 }).toString();
test('genereer', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OUD }));
  const uit = {};
  for (const [n, o] of [['inleg', {}], ['zonder', { inleg: 0 }]]) { await B.boot(page, o); uit[n] = await bedragen(page); }
  fs.writeFileSync(path.join(__dirname, '..', 'v521c-voor.json'), JSON.stringify(uit, null, 1));
});
