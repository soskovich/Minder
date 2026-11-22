/* v520: schermafdrukken van de zes antwoorden op 390px, op de fixture (VOORBEELD, geconstrueerd). WIP=1; schrijft naar SCHERM_DIR. */
const { test } = require('../klok');
const S = require('../v520-stand');
const L = S.LEEG;
const DIR = process.env.SCHERM_DIR || '/tmp';
const SOORTEN = [['weekdag', {}], ['tegenpartij', { zoektermen: ['thuisbezorgd', 'uber eats'] }], ['drempel', { bedrag: 30 }], ['eenmalig', {}], ['naOverschrijding', {}], ['contantRitme', {}]];
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
test('schermen', async ({ page }) => {
  await S.boot(page);
  for (const [soort, x] of SOORTEN) {
    await S.stubVraag(page, Object.assign({}, L, { soort }, x));
    await S.vraag(page, { weekdag: 'Op welke dag geef ik het meest uit?', tegenpartij: 'Hoeveel geef ik uit aan bezorging?', drempel: 'Hoeveel betalingen onder 30 euro deze maand?', eenmalig: 'Wat was er eenmalig?', naOverschrijding: 'Zit ik na een overschrijding weer boven?', contantRitme: 'Hoe vaak neem ik contant op?' }[soort]);
    await page.evaluate(() => { const a = document.getElementById('vraagAntwoord'); const d = document.createElement('div'); d.className = 'small muted'; d.style.cssText = 'margin-top:8px;font-weight:700'; d.textContent = 'VOORBEELD · geconstrueerde fixture (v520-stand), geen echte gegevens'; a.prepend(d); });
    await page.waitForTimeout(400);
    await page.locator('#sheet').screenshot({ path: `${DIR}/v520-${soort}.png` });
  }
});
