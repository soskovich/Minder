// v93: amber is voor échte aandacht (over budget, tekort, waarschuwing). Informatieve statussen
// — "sneller dan de maand", "boven je inkomen-limiet" — leunen op het label, niet op de kleur.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const AMBER = /var\(--amber\)|#fbbf24|#f5b544/;

function metBudget(bedrag) {
  const p = seed(); const set = JSON.parse(p.minder_set);
  set.budgets = { boodschappen: bedrag }; set.budgetsNext = {};
  p.minder_set = JSON.stringify(set); return p;
}
async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
}
// v166: de ring-tak van monthStatusCard() werd berekend en weggegooid - de enige aanroeper is de
// terugval in renderIns(), en die vuurt alleen zonder budget. De budgetstand woont in de hero.
const kaartHtml = (page) => page.evaluate((m) => insBudgetBlok(m), CUR);

test.describe('a · de budget-kaart', () => {
  test('binnen budget kleurt nooit amber, ook niet als je sneller gaat dan de maand', async ({ page }) => {
    // kies een budget dat een "sneller dan de maand"-stand oplevert, als de kalender dat toelaat:
    // laat in de maand kan usedPct niet meer boven dayPct+8 komen zonder óók over budget te gaan.
    await boot(page);
    const info = await page.evaluate((m) => {
      const t = totals(m), now = new Date();
      const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      const dayPct = Math.round(Math.min(now.getDate(), dim) / dim * 100);
      return { spend: Math.round(t.spend), dayPct, kanAhead: dayPct + 20 <= 98 };
    }, CUR);

    const doel = info.kanAhead ? Math.round(info.spend / ((info.dayPct + 20) / 100)) : Math.round(info.spend * 3);
    await boot(page, metBudget(doel));
    const html = await kaartHtml(page);

    expect(html).not.toMatch(AMBER);                                   // geen amber binnen budget
    expect(html).toContain('var(--accent)');                           // de balk blijft rustig
    expect(html).not.toContain('var(--red)');
    // het tempo staat er als feit, zonder oordeel: geen kleur, geen woord als "te snel"
    expect(html).toMatch(/de maand is \d+% voorbij/);
  });

  test('over budget blijft rood — dat is wél aandacht', async ({ page }) => {
    await boot(page, metBudget(200));                                  // 445 uitgegeven van 200
    const html = await kaartHtml(page);
    expect(html).toContain('var(--red)');                              // over budget is rood
    expect(html).not.toMatch(AMBER);                                   // rood, niet amber ernaast
  });

  test('"boven inkomen-limiet" is een spiegel, geen waarschuwing', async ({ page }) => {
    await boot(page);                                                  // fixture: potjes 2400 vs limiet 2100
    const html = await kaartHtml(page);
    expect(html).toContain('boven inkomen-limiet');
    expect(html).toContain('var(--mut2)');
    expect(html).not.toMatch(AMBER);
    // het bedrag blijft gewoon staan
    expect(html).toContain('€300');
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
