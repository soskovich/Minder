/* Generator van tests/v512c-repetitie-v511.json: de fixture van v512 (periode-stand op 4 nov) op de app van d46a6f1 (v511). Alleen met
   de hand:  git show d46a6f1:index.html > /tmp/v511.html
             MAIN_HTML=/tmp/v511.html WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v512c-repetitie-golden.spec.js
   Met OUT=<pad> schrijft hij daarheen (zo meet je ook de huidige app zonder MAIN_HTML). */
const fs = require('fs'), path = require('path');
const { test } = require('../klok');
const S = require('../periode-stand');
const R = require('../repetitie-meten');
test('golden', async ({ page }) => {
  if (process.env.MAIN_HTML) { const html = fs.readFileSync(process.env.MAIN_HTML); await page.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: html })); }
  await S.boot(page, '2026-11-04');
  const meting = await R.meetAlle(page);
  const uit = process.env.OUT || path.join(__dirname, '..', 'v512c-repetitie-v511.json');
  fs.writeFileSync(uit, JSON.stringify({ bron: process.env.MAIN_HTML ? 'd46a6f1 (v511)' : 'huidige index.html', fixture: 'periode-stand op 2026-11-04 (GECONSTRUEERD)', meting }, null, 1));
});
