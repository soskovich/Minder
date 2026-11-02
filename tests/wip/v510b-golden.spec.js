/* Generator van tests/v510b-voor.json: draait de fixture van v510b op de app van ef1baa8 (v510, de stand voor v510b) en schrijft de
   getallen. Alleen met de hand: MAIN_HTML=<pad naar index.html van ef1baa8> WIP=1 npx playwright test tests/wip/v510b-golden.spec.js */
const fs = require('fs'), path = require('path');
const { test } = require('../klok');
const H = require('../v510b-stand');
test('golden', async ({ page }) => {
  const src = process.env.MAIN_HTML; if (!src) test.skip();
  const html = fs.readFileSync(src);
  await page.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  await H.boot(page, '2026-11-02');
  await H.herlaad(page);
  const voor = await page.evaluate(H.METEN);
  const controle = await H.CONTROLE(page);
  const cats = await page.evaluate(() => TX.filter(t => /Holding|EMH/.test(t.name)).map(t => t.date + ' ' + t.amount + ' ' + catOf(t)));
  fs.writeFileSync(path.join(__dirname, '..', 'v510b-voor.json'), JSON.stringify({ bron: 'ef1baa8 (v510)', dag: '2026-11-02', voor, controle, cats }, null, 1));
});
