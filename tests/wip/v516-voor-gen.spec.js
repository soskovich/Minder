/* v516: GENERATOR van tests/v516-voor.json: de bedragen van c9f8a00 (v515) in dezelfde fixtures. Draai met
   WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v516-voor-gen.spec.js. Leest index.html van c9f8a00 uit git. */
const { test } = require('../klok');
const fs = require('fs'); const path = require('path'); const { execSync } = require('child_process');
const K516 = require('../v516-stand'), K515 = require('../v515-stand'); const { bedragen } = require('../v516-bedragen');
const OUD = execSync('git show c9f8a00:index.html', { cwd: path.join(__dirname, '..', '..'), maxBuffer: 64e6 }).toString();
const MELD = { meldAan: true, meldPotjes: { boodschappen: true } };
test('genereer', async ({ page }) => {
  const uit = {};
  await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OUD }));
  await K516.boot(page, { set: MELD }); uit.v516 = await bedragen(page);
  const p2 = await page.context().newPage(); await p2.clock.install({ time: Date.now() });
  await p2.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: OUD }));
  await K515.boot(p2); uit.v515 = await bedragen(p2);
  fs.writeFileSync(path.join(__dirname, '..', 'v516-voor.json'), JSON.stringify(uit, null, 1));
});
