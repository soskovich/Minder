// v90: Rustig-modus start rustiger op Inzichten — hooguit 3 kerncijfers (met "toon alle …") en de
// twaalf-maands grafiek ingeklapt. Een expliciete keuze van de gebruiker wint altijd van die default.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('./klok');
const { seed, open } = require('./budget-fixture');
const { kaalUit } = require('./bron-kaal');

/* v208: het Kerncijfers-blok is van Inzichten af, dus de drietraps uitklap uit v90 leeft alleen
   nog op Maand, met SET.kpiAllMaand. Wat deze tests bewaken is ongewijzigd: Rustig start met een
   tegel en een uitklap, en je eigen keuze blijft staan. */
async function openIns(page, mode) {
  const p = seed({ maanden: 8 });
  const set = JSON.parse(p.minder_set); set.mode = mode; p.minder_set = JSON.stringify(set);
  await open(page, p);
  await page.evaluate(() => go('ins'));
}
const grafiek = (page) => page.locator('#insSpendChart');
/* v178 zette de maandgrafiek op Maand omdat hij maanden naast elkaar zet; v227 bracht hem terug
   naar Inzichten, onder het blok over deze maand. De drietraps default uit v90 verhuist beide keren
   ongewijzigd mee, en dat is wat blok b hieronder bewaakt: de plek verandert, het gedrag niet. */
async function openGrafiek(page, mode) {
  const p = seed({ maanden: 8 });
  const set = JSON.parse(p.minder_set); set.mode = mode; p.minder_set = JSON.stringify(set);
  await open(page, p);
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
}

/* v209: de drietraps uitklap uit v90 gold voor de kerncijfers. Sinds de vaste-lastendruk van het
   maandscherm af is, staat daar nog één cijfer en valt er niets uit te klappen; de knop is
   vervallen omdat hij een dode knop zou zijn. De drietraps zelf leeft onveranderd voor de
   maandgrafiek, en die staat hieronder in blok b. */
/* onderhoud3 (punt 7): blok a (de spaarquote-tegel in elke modus) is weg met de tegel zelf (maandKpiBlok opgeruimd). */

/* v382: weg, "Over de maanden" (spendVsBudgetChart, #insSpendCard, #insSpendChart) staat niet meer op
   Inzichten, en daarmee is openSpendChart de laatste ingang van COLLAP_DEF kwijt. De twee tests over de
   ingeklapte grafiek gingen uitsluitend over die vorm. Wat van v90 blijft is de drietraps van collapOpen():
   een eigen keuze wint altijd, en een vlag zonder ingang in COLLAP_DEF is dicht, in elke modus. */
test.describe('b · collapOpen blijft drietraps', () => {
  test('een eigen keuze wint, en zonder ingang is een vlag dicht in elke modus', async ({ page }) => {
    await openGrafiek(page, 'begeleid');
    const r = await page.evaluate(() => {
      const uit = {};
      uit.geenSpendChart = Object.prototype.hasOwnProperty.call(COLLAP_DEF, 'openSpendChart');
      delete SET.openSpendChart;
      SET.mode = 'rustig'; uit.rustigDefault = collapOpen('openSpendChart');
      SET.mode = 'begeleid'; uit.begeleidDefault = collapOpen('openSpendChart');
      SET.openSpendChart = false; uit.expliciteDicht = collapOpen('openSpendChart');
      SET.mode = 'rustig'; SET.openSpendChart = true; uit.expliciteOpen = collapOpen('openSpendChart');
      delete SET.openMerch; uit.merchDefault = collapOpen('openMerch');       // bestaande vlag: dicht
      return uit;
    });
    expect(r.geenSpendChart).toBe(false);
    expect(r.rustigDefault).toBe(false);
    expect(r.begeleidDefault).toBe(false);
    expect(r.expliciteDicht).toBe(false);
    expect(r.expliciteOpen).toBe(true);
    expect(r.merchDefault).toBe(false);
  });
});

test.describe('c · niets anders verandert', () => {
  test('Home toont in Rustig dezelfde blokken als in Begeleid', async ({ page }) => {
    const blokken = async (mode) => {
      await openIns(page, mode);
      return await page.evaluate(() => { go('dash'); const d = document.getElementById('s-dash');
        return { hero: d.querySelectorAll('.homehero').length, verm: /Netto vermogen|bezittingen/i.test(d.innerText), recent: d.querySelectorAll('.txl').length }; });
    };
    const b = await blokken('begeleid'), r = await blokken('rustig');
    expect(r.hero).toBe(b.hero);
    expect(r.verm).toBe(b.verm);
    expect(r.recent).toBe(b.recent);
  });


  test('Rustig past op 360px zonder overflow', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 900 });
    await openIns(page, 'rustig');
    const r = await page.evaluate(() => ({
      pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      buiten: [...document.querySelectorAll('#s-ins .card')].filter((c) => c.scrollWidth > c.clientWidth + 1).length,
    }));
    expect(r.pagina).toBe(0);
    expect(r.buiten).toBe(0);
  });
});
