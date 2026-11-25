/* v523: GENERATOR van tests/v523-voor.json: de bedragen van bc2bafd (v522b) per scherm in de stand van tests/v523-stand.js.
   Draai met WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v523-voor-gen.spec.js. Leest index.html van bc2bafd uit git. */
const { test } = require('../klok');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const B = require('../v523-stand');
const { bedragen } = B;
const OUD = execSync('git show bc2bafd:index.html', { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64e6 }).toString();
test('genereer', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OUD }));
  const uit = {};
  for (const [n, o] of [['nu', {}], ['gezien', { overboekGezien: true, dag: '2026-11-27' }], ['laat', { dag: '2026-11-29' }]]) { await B.boot(page, o); uit[n] = await bedragen(page); }
  fs.writeFileSync(path.join(__dirname, '..', 'v523-voor.json'), JSON.stringify(uit, null, 1));
});
