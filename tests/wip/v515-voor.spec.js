/* v515: generator van tests/v515-voor.json. Draai op d62e105 (v514, de sheet van voor v515): de bedragen van de sheet
   "Nog verwacht · in potjes" in de fixture v515-stand, per potje, de rest en het totaal. */
const { test } = require('../klok');
const fs = require('fs'), path = require('path');
const K = require('../v515-stand');
test('v515 voor', async ({ page }) => {
  const uit = {};
  for (const [naam, o] of [['toestel', {}], ['drie', { nog: { boodschappen: 199, vervoer: 124, zorg: 62 }, zonderContant: true }]]) {
    await K.boot(page, o);
    uit[naam] = await page.evaluate(() => { go('ins'); openInsTegel('potjes', 1); const e = document.getElementById('insTegelSheet');
      const rijen = {}; for (const r of e.querySelectorAll('[data-inspotrij]')) rijen[r.dataset.inspotrij] = +r.dataset.insrij;
      const rest = e.querySelector('[data-insrest]'); return { totaal: +e.dataset.inswaarde, rijen, rest: rest ? +rest.dataset.insrij : 0 }; });
  }
  fs.writeFileSync(path.join(__dirname, '..', 'v515-voor.json'), JSON.stringify(uit, null, 1) + '\n');
});
