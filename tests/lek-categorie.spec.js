/* v362: de lek-regel onder Let op op Grip noemt de CATEGORIE en wat er in die categorie zonder potje
   uitging: "Uit eten & café: €75 zonder potje". Tot v362 stond daar de winkel ("Restaurant Lona: €75
   zonder potje"). De winkel staat nu in de zin eronder en in de sheet. Fixture: deze-maand-stand.js
   (6 oktober, Uit eten zonder potje). */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand');

/* v391: EEN SIGNAAL PER REGEL. De categorie staat op een eigen regel (data-letop="lekcat", tik: haar boekingen) en de
   partij op de regel eronder (data-letop="lek", tik: de sheet met het gesprek).
   v395: EEN SIGNAAL PER GELDSTROOM. Restaurant Lona komt vaker terug (kind 'missing-pot') en valt in Uit eten, dus het
   zijn dezelfde boekingen en is het een regel: "<categorie> EUR X zonder potje" met "<partij> komt vaker terug" eronder,
   en een tik (de sheet met potje maken of de categorie wijzigen). */
const regel = (page, soort = 'lek') => page.evaluate((soort) => { go('maand'); renderMaand();
  const r = document.querySelector(`#gripLetOp [data-letop="${soort}"]`); return r ? r.innerText : null; }, soort);

test.describe('lek-regel · categorie en bedrag', () => {
  test('de regel noemt de categorie, niet de winkel', async ({ page }) => {
    await boot(page);
    const t = await regel(page);
    expect(t, 'er is een lek-regel').toBeTruthy();
    expect(await page.evaluate(() => lekSignaal(thisYM(), budgetFlaggedCats(thisYM())).kind)).toBe('missing-pot');   // invoermeting
    expect(t.split('\n')[0]).toBe('Uit eten & café €75 zonder potje');
    expect(t.split('\n')[1]).toBe('Restaurant Lona komt vaker terug');
    expect(await regel(page, 'lekcat')).toBeNull();   // geen tweede regel over dezelfde boekingen
    expect(await page.evaluate(() => [...document.querySelectorAll('#gripLetOp [data-letop^="lek"]')].map(e => e.getAttribute('onclick'))))
      .toEqual(["openGripLetOp('lek')"]);
  });
  test('met twee winkels in de categorie is het bedrag de categorie, en de sheet zegt hetzelfde', async ({ page }) => {
    await boot(page, { extraTx: [{ id: 'x1', date: '2026-10-03', amount: -30, name: 'Cafe De Zwaan', desc: 'BEA, BETAALPAS CAFE DE ZWAAN' }] });
    const r = await page.evaluate(() => ({ cat: catOf(TX.find((t) => /ZWAAN/.test(t.desc))), som: Math.round(catSpendMap(thisYM()).uiteten) }));
    expect(r.cat, 'de fixture zet de tweede winkel in Uit eten').toBe('uiteten');
    expect(r.som).toBe(105);
    const t = await regel(page);
    expect(t.split('\n')[0]).toBe('Uit eten & café €105 zonder potje');
    await page.evaluate(() => document.querySelector('#gripLetOp [data-letop="lek"]').click());
    const sh = page.locator('#gripLetOpSheet[data-soort="lek"]');
    await expect(sh).toContainText('Uit eten & café · €105 zonder potje');
    await expect(sh.locator('[data-lekwinkel]')).toHaveText('waarvan Restaurant Lona €75');
  });
});
