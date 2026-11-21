/* v519: de stand voor de byte-gelijkheid (test k). Op de stand van v518 (tests/v518-bedragen.js, v432-stand, 16 okt 2026,
   GECONSTRUEERD) met een ingestelde backend en VRAGEN AAN: de generator (tests/wip/v519-voor-gen.spec.js) leest dezelfde stand op
   dd83bac, waar SET.vraagAan geen lezer heeft. Alleen de bedragen per scherm worden vergeleken. */
const B = require('./v518-bedragen');
async function boot(page) {
  await B.boot(page);
  await page.evaluate(() => { SET.psd2Url = 'https://w.test'; SET.psd2Token = 'tok'; SET.vraagAan = true; save(); render(); });
}
module.exports = { boot, bedragen: B.bedragen };
