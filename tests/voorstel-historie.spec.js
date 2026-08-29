// v112: gemeld — "Voorstel uit mijn historie" veranderde het budget van de lopende maand, terwijl
// Instellingen er vlak boven belooft dat een wijziging aan een bestaand potje pas vanaf de volgende
// maand geldt. Oorzaak: suggestBudgets() schreef rechtstreeks SET.budgets={...} en sloeg daarmee de
// 'volgende maand'-laag over die setCatBudget() wel gebruikt. Het voorstel is nu een wijziging als
// elke andere: bestaand potje -> SET.budgetsNext, alleen een nieuw potje start meteen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { open, seed } = require('./budget-fixture');

// zelfde fixture, maar met een aangepaste potjes-set per test
function seedPot(mut) {
  const s = seed();
  const set = JSON.parse(s.minder_set);
  mut(set);
  return { ...s, minder_set: JSON.stringify(set) };
}

const staat = (page) => page.evaluate(() => ({
  budgets: JSON.parse(JSON.stringify(SET.budgets || {})),
  next: JSON.parse(JSON.stringify(SET.budgetsNext || {})),
  totaal: totalBudget(),
  gepland: plannedTotalBudget(),
}));

test.describe('a · de lopende maand ligt vast', () => {
  test('bestaande potjes blijven deze maand exact staan', async ({ page }) => {
    await open(page);
    const voor = await staat(page);
    await page.evaluate(() => suggestBudgets());
    const na = await staat(page);

    for (const k of Object.keys(voor.budgets)) {
      expect(na.budgets[k], `potje ${k} mag deze maand niet wijzigen`).toBe(voor.budgets[k]);
    }
    expect(na.totaal).toBe(voor.totaal);
  });

  test('het voorstel staat klaar voor volgende maand', async ({ page }) => {
    await open(page);
    const voor = await staat(page);
    await page.evaluate(() => suggestBudgets());
    const na = await staat(page);

    // er is iets gepland (de fixture-potjes staan bewust boven de historie)
    expect(Object.keys(na.next).length).toBeGreaterThan(0);
    expect(na.gepland).not.toBe(voor.totaal);
    // en elk gepland bedrag hoort bij een potje dat nu al bestaat
    for (const k of Object.keys(na.next)) expect(na.budgets[k]).toBeGreaterThan(0);
  });

  test('een potje zonder historie vervalt pas volgende maand, niet nu', async ({ page }) => {
    // shopping heeft geen transacties in de fixture -> het voorstel zet het op nul
    await open(page);
    await page.evaluate(() => suggestBudgets());
    const na = await staat(page);
    expect(na.budgets.shopping).toBe(255);   // deze maand nog gewoon je potje
    expect(na.next.shopping).toBe(0);        // volgende maand weg
  });
});

test.describe('b · een nieuw potje mag wel meteen', () => {
  test('categorie zonder potje krijgt er direct een, zoals bij setCatBudget', async ({ page }) => {
    await open(page, seedPot((set) => { delete set.budgets.uiteten; delete set.budgetsNext.uiteten; }));
    const voor = await staat(page);
    expect(voor.budgets.uiteten).toBeUndefined();

    await page.evaluate(() => suggestBudgets());
    const na = await staat(page);
    expect(na.budgets.uiteten).toBeGreaterThan(0);   // nieuw potje = meteen actief
    expect(na.next.uiteten).toBeUndefined();          // en dus niets in de wachtlaag
    expect(na.budgets.boodschappen).toBe(voor.budgets.boodschappen);   // de rest blijft staan
  });
});

test.describe('c · de knop belooft wat hij doet', () => {
  test('de bevestiging noemt de volgende maand, niet "wordt overschreven"', async ({ page }) => {
    await open(page);
    const html = await page.evaluate(() => { openSet('budget'); return document.getElementById('sheet').innerHTML; });
    expect(html).toContain('Voorstel uit mijn historie');
    const conf = (html.match(/confirm\(&quot;?'?([^'&]*voorstellen[^'&]*)/) || [])[1] || html;
    expect(conf).toMatch(/volgende maand/);
    expect(conf).toMatch(/lopende maand/);
  });
});
