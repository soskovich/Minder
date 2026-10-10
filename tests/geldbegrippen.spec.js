// v91: de geld-begrippen zijn overal hetzelfde en de drie kernbegrippen leggen zichzelf uit
// via de bestaande micro-uitleg (jrg/JARGON, v58). Puur copy; geen cijfer verandert.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

async function boot(page, scherm) {
  await open(page, seed());
  await page.evaluate((s) => go(s), scherm);
  await page.waitForSelector(`#s-${scherm} .card, #s-${scherm} .homehero`);
}

test.describe('a · tik-voor-uitleg op de kernbegrippen', () => {
  test('"vrij te besteden" op Home legt zichzelf uit (v367)', async ({ page }) => {
    await boot(page, 'dash');
    const term = page.locator('#s-dash .homehero .jrg');
    await expect(term).toHaveCount(1);
    expect(await term.innerText()).toBe('vrij te besteden');
    expect(await term.evaluate((e) => getComputedStyle(e).borderBottomStyle)).toBe('dotted');

    await term.click();
    await page.waitForSelector('#tipPop.show');
    const tip = await page.locator('#tipPop').innerText();
    /* v378: de uitleg noemt dezelfde posten als de opbouw-sheet, en eindigt op de route ernaartoe */
    expect(tip).toContain('salaris dat nog komt');
    expect(tip).toContain('wat je deze maand nog spaart');
    expect(tip).toContain('Zo kom je op');
    expect(await page.locator('#sheetBg.show').count()).toBe(0);      // geen sheet mee-geopend
  });

  // v144: "Nog deze maand" stond op Vooruitblik en op Inzichten; alleen de Inzichten-hero bleef.
  // v192: "Deze maand op eigen kracht" is vervallen; "Nog te sparen" is de term die er staat.
  // v365: "Nog te sparen" is van Inzichten naar Plan verhuisd (de terugzetkeuze en de kop van deze maand); de tegel
  // met de term staat niet meer op Inzichten, en de uitleg blijft in JARGON voor de opbouw van veilig te besteden.
  test('"Nog te sparen" staat niet meer als tegel op Inzichten', async ({ page }) => {
    await boot(page, 'ins');
    const termen = await page.locator('#s-ins .jrg').evaluateAll((els) => els.map((e) => e.textContent));
    expect(termen).not.toContain('Nog te sparen');
    expect(termen).not.toContain('Deze maand op eigen kracht');
    expect(await page.evaluate(() => 'nogtesparen' in JARGON)).toBe(true);
  });

  test('de uitleg is toetsenbord-bereikbaar en sluit weer', async ({ page }) => {
    await boot(page, 'dash');
    const term = page.locator('#s-dash .homehero .jrg');
    expect(await term.getAttribute('tabindex')).toBe('0');
    expect(await term.getAttribute('role')).toBe('button');
    await term.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('#tipPop.show');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('#tipPop.show'));
  });
});

test.describe('b · één term per begrip', () => {
  test('"spaarruimte" is uit de zichtbare copy verdwenen', async ({ page }) => {
    await boot(page, 'vooruit');
    const gezien = await page.evaluate(() => {
      const uit = [];
      for (const s of ['dash', 'ins', 'vooruit', 'vermogen', 'set']) {   // v196: geen 'act' meer
        go(s); const el = document.getElementById('s-' + s); if (el) uit.push(el.innerText);
      }
      // plus de sheets waar de term stond
      uit.push(renderPlan ? renderPlan() : '');
      uit.push(planAllocWarning() ? planAllocWarning().txt || '' : '');
      return uit.join('\n');
    });
    expect(gezien.toLowerCase()).not.toContain('spaarruimte');
    expect(gezien.toLowerCase()).toContain('spaarinleg');
  });

  test('de doel-editor en het noodfonds gebruiken dezelfde term', async ({ page }) => {
    await boot(page, 'vooruit');
    const goal = await page.evaluate(() => { openGoal(); return document.getElementById('sheet').innerText; });
    expect(goal.toLowerCase()).not.toContain('spaarruimte');

    /* v373: de doel-editor heeft geen verdeelmodus meer; het bedrag per doel staat in de verdeling, en die sheet gebruikt
       dezelfde term. */
    const vd = await page.evaluate(() => { closeSheet(); openVerdeling(); verdelingModus('zelf'); return document.getElementById('sheet').innerText; });
    expect(vd.toLowerCase()).not.toContain('spaarruimte');

    const nf = await page.evaluate(() => { closeSheet(); setNfAlloc('mode', 'pct'); openNoodfondsPanel(); return document.getElementById('sheet').innerText; });
    expect(nf.toLowerCase()).not.toContain('spaarruimte');
  });

  test('het plan-overzicht noemt de spaarinleg en legt hem uit', async ({ page }) => {
    await boot(page, 'vooruit');
    const html = await page.evaluate(() => renderPlan());
    expect(html).toContain(">spaarinleg<");                            // als uitlegbare term
    // v225: de zin over de volgorde staat achter het uitlegteken in de kop, en dus in NOTES.
    // De eis blijft: de term staat zichtbaar op het scherm en er hangt een uitleg aan.
    expect(await page.evaluate(() => NOTES.planUitleg)).toContain('gaat van boven naar beneden');
    expect(await page.evaluate(() => JARGON.spaarinleg)).toContain('per maand opzij');
  });
});

test('c · geen cijfer verandert', async ({ page }) => {
  await boot(page, 'dash');
  const r = await page.evaluate((m) => ({
    safe: safeToSpend().safe, planCap: planCapacity(), target: monthlySavingTarget(),
    tot: totals(m).spend, netto: (() => { const L = monthLiquidity(); return Math.round(L.incDue) - Math.round(L.fixDue + L.varDue); })(),
  }), CUR);
  // de waarden komen uit dezelfde bronnen als voorheen; alleen de labels zijn aangepast
  expect(r.planCap).toBe(r.target);
  expect(Number.isFinite(r.safe)).toBe(true);
  expect(Number.isFinite(r.netto)).toBe(true);
  expect(r.tot).toBeGreaterThan(0);
  expect(await page.locator('#s-dash').innerText()).not.toMatch(/NaN|undefined/);
});
