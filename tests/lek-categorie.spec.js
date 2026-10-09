/* v362: de lek-regel onder Let op op Grip noemt de CATEGORIE en wat er in die categorie zonder potje
   uitging: "Uit eten & café: €75 zonder potje". Tot v362 stond daar de winkel ("Restaurant Lona: €75
   zonder potje"). De winkel staat nu in de zin eronder en in de sheet. Fixture: deze-maand-stand.js
   (6 oktober, Uit eten zonder potje). */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand');

const regel = (page) => page.evaluate(() => { go('maand'); renderMaand();
  const r = document.querySelector('#gripLetOp [data-letop="lek"]'); return r ? r.innerText : null; });

test.describe('lek-regel · categorie en bedrag', () => {
  test('de regel noemt de categorie, niet de winkel', async ({ page }) => {
    await boot(page);
    const t = await regel(page);
    expect(t, 'er is een lek-regel').toBeTruthy();
    expect(t.split('\n')[0]).toBe('Uit eten & café: €75 zonder potje');
    expect(t).not.toMatch(/^Restaurant Lona:/);
    expect(t).toContain('Restaurant Lona');      // de winkel staat in de zin eronder
  });
  test('met twee winkels in de categorie is het bedrag de categorie, en de sheet zegt hetzelfde', async ({ page }) => {
    await boot(page, { extraTx: [{ id: 'x1', date: '2026-10-03', amount: -30, name: 'Cafe De Zwaan', desc: 'BEA, BETAALPAS CAFE DE ZWAAN' }] });
    const r = await page.evaluate(() => ({ cat: catOf(TX.find((t) => /ZWAAN/.test(t.desc))), som: Math.round(catSpendMap(thisYM()).uiteten) }));
    expect(r.cat, 'de fixture zet de tweede winkel in Uit eten').toBe('uiteten');
    expect(r.som).toBe(105);
    const t = await regel(page);
    expect(t.split('\n')[0]).toBe('Uit eten & café: €105 zonder potje');
    await page.evaluate(() => document.querySelector('#gripLetOp [data-letop="lek"]').click());
    const sh = page.locator('#gripLetOpSheet[data-soort="lek"]');
    await expect(sh).toContainText('Uit eten & café · €105 zonder potje');
    await expect(sh.locator('[data-lekwinkel]')).toHaveText('waarvan Restaurant Lona €75');
  });
});
