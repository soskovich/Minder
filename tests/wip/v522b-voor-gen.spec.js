/* v522b: de golden van j. Dezelfde fixture (v522-stand) tegen index.html van v521c (55c5887): opzij en salaris van rekVoorstel() op 23, 24 en
   26 nov en 1 dec. Draaien: V521C_HTML=<pad> WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v522b-voor-gen.spec.js */
const { test } = require('../klok');
const fs = require('fs');
const W = require('../v522-stand');
test('golden v521c', async ({ browser }) => {
  if (!process.env.V521C_HTML) test.skip();
  const html = fs.readFileSync(process.env.V521C_HTML, 'utf8'); const uit = {};
  for (const dag of W.DAGEN) { const ctx = await browser.newContext(); const page = await ctx.newPage();
    await W.boot(page, { dag, html }); await W.oudeStand(page);
    uit[dag] = await page.evaluate(() => { const P = rekVoorstel(); return { ok: P.ok, opzij: P.ok ? Math.round(P.opzij) : null, salaris: P.ok ? Math.round(P.salaris * 100) / 100 : null }; });
    await ctx.close(); }
  fs.writeFileSync(__dirname + '/../v522b-voor.json', JSON.stringify(uit, null, 1) + '\n');
});
