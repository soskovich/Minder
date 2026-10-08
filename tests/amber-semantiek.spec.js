// v93: amber is voor échte aandacht (over budget, tekort, waarschuwing). Informatieve statussen
// — "sneller dan de maand", "boven je inkomen-limiet" — leunen op het label, niet op de kleur.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const AMBER = /var\(--amber\)|#fbbf24|#f5b544/;

function metBudget(bedrag) {
  const p = seed({ maanden: 8 }); const set = JSON.parse(p.minder_set);
  set.budgets = { boodschappen: bedrag }; set.budgetsNext = {};
  p.minder_set = JSON.stringify(set); return p;
}
async function boot(page, payload) {
  await open(page, payload || seed({ maanden: 8 }));
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
}
// v166: de ring-tak van monthStatusCard() werd berekend en weggegooid - de enige aanroeper is de
// terugval in renderIns(), en die vuurt alleen zonder budget. De budgetstand woont in de hero.
/* v178: 'boven inkomen-limiet' is een oordeel over je plan en stond op Maand onder de streep.
   De budgetstand op Inzichten toont alleen nog hoe deze maand loopt. */
// v315: maandPlanRegels() is vervallen; de rij staat in maandVanafRegels()
/* v340: maandVanafRegels() is ook vervallen. Wat 'Vanaf <maand>' droeg staat in de tijdlijn
   'Komende 3 maanden' op Grip (`[data-tlsoort="vanaf"]`), uit maandVanafData(). Beide worden
   gelezen: de data (met label en sub) en wat er van op het scherm staat. */
const planHtml = (page) => page.evaluate(() => { go('maand'); renderMaand();
  return JSON.stringify(maandVanafData()) + [...document.querySelectorAll('#s-maand [data-tlsoort="vanaf"]')].map((x) => x.outerHTML).join(''); });

/* v359: hier stond describe 'a · de budget-kaart'. De stand-kaart van Inzichten is vervallen; zijn plek is de
   tegel Uitgegeven, en die is op keuze van de gebruiker amber BOVEN HET TEMPO (een omkering van v93 voor deze ene
   tegel: "sneller dan de maand" is daar wel een status, want het tempo telt vaste lasten op hun datum).
   inzichten-dashboard.spec.js draagt groen en amber. */
test.describe('a · wat er vanaf volgende maand staat', () => {
  /* v228: de rij 'Boven je inkomen-limiet' is vervallen (tests/vaststellen-zonder-gevolg.spec.js).
     Wat er in de vanaf-kaart overblijft draagt geen status en dus ook geen amber (v315: die rijen
     stonden tot dan onder een streep in de regelkaart). */
  test('wat er vanaf volgende maand op Grip staat draagt geen amber', async ({ page }) => {
    await boot(page);
    const html = await planHtml(page);
    expect(html).not.toContain('inkomen-limiet');
    expect(html).not.toMatch(AMBER);
  });
});

test.describe('b · de potjes-spiegel', () => {
  test('boven de limiet: geen amber en geen waarschuwingsicoon, wel het hele verhaal', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ over: potRoomLineHTML(totalBudget()), onder: potRoomLineHTML(100) }));
    expect(r.over).toContain('boven je inkomen-limiet');
    expect(r.over).not.toMatch(AMBER);
    expect(r.over).not.toContain('<svg');                              // geen ⚠-icoon meer
    expect(r.over).toContain('Dat mag');                               // de spiegel-toon blijft
    expect(r.over).toMatch(/€\d/);
    expect(r.onder).toContain('onder je inkomen-limiet');
  });
});

test.describe('c · échte aandacht houdt zijn kleur', () => {
  test('over-budget-categorieën, tekorten en verstreken data blijven amber of rood', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      // v164: bandColor() is weg, dus we toetsen de band zelf. De kleurvertaling had geen lezer meer.
      const banden = { monitor: budgetBand(100, 105), action: budgetBand(100, 130), ok: budgetBand(100, 40) };
      // een verstreken terugbetaaldatum blijft amber via .cp-sub.warn
      const t = TX.find((x) => x.amount < 0);
      markLoan(t.id, 'uit', 'lening');
      const l = loans()[0]; setLoanField(l.id, 'terug', '2020-01-01');
      const rijen = loanRowsHTML('uit');
      return { banden, rijen, css: [...document.styleSheets].length > 0 };
    }, CUR);
    expect(r.banden.action).toBe('action');                            // ver over budget
    expect(r.banden.monitor).toBe('monitor');                          // over/naar budget = aandacht
    expect(r.banden.ok).toBe('under');                                  // ruim binnen budget
    expect(r.rijen).toContain('verstreken');
    expect(r.rijen).toContain('warn');                                 // amber via de bestaande klasse
  });

  test('de meldingen houden hun waarschuwtypes', async ({ page }) => {
    await boot(page, metBudget(200));
    const types = await page.evaluate(() => scoreNotifs().map((n) => n.t));
    expect(types.some((t) => t === 'bad' || t === 'warn')).toBe(true);
  });
});
