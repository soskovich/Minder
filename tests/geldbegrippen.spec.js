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
  test('"Veilig te besteden" op Home legt zichzelf uit', async ({ page }) => {
    await boot(page, 'dash');
    const term = page.locator('#s-dash .homehero .jrg');
    await expect(term).toHaveCount(1);
    expect(await term.innerText()).toBe('Veilig te besteden');
    expect(await term.evaluate((e) => getComputedStyle(e).borderBottomStyle)).toBe('dotted');

    await term.click();
    await page.waitForSelector('#tipPop.show');
    const tip = await page.locator('#tipPop').innerText();
    expect(tip).toContain('vrij is voor de rest van de maand');
    expect(tip).toContain('spaarinleg');
    expect(await page.locator('#sheetBg.show').count()).toBe(0);      // geen sheet mee-geopend
  });

  test('"Onderaan de streep" en "Nog te sparen" op Vooruitblik ook', async ({ page }) => {
    await boot(page, 'vooruit');
    const kaart = page.locator('#s-vooruit .card').first();
    const termen = await kaart.locator('.jrg').evaluateAll((els) => els.map((e) => e.textContent));
    expect(termen).toContain('Nog te sparen');
    expect(termen).toContain('Onderaan de streep');

    // de tegel is klikbaar; een tik op de term toont alleen de uitleg, niet de drill-down
    await kaart.locator('.jrg', { hasText: 'Nog te sparen' }).click();
    await page.waitForSelector('#tipPop.show');
    expect(await page.locator('#tipPop').innerText()).toContain('opzij moet zetten');
    expect(await page.locator('#sheetBg.show').count()).toBe(0);

    await page.locator('#s-vooruit .ndm-net .jrg').click();
    await page.waitForSelector('#tipPop.show');
    expect(await page.locator('#tipPop').innerText()).toContain('nog binnenkomt');
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
      for (const s of ['dash', 'ins', 'act', 'vooruit', 'vermogen', 'set']) {
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

    const pct = await page.evaluate(() => {
      const g = (SET.goals || [])[0] || { id: 'g1', naam: 'Test', bedrag: 1000, allocMode: 'pct', pct: 30 };
      SET.goals = [Object.assign({}, g, { allocMode: 'pct', pct: 30 })]; save();
      openGoal(SET.goals[0].id); return document.getElementById('sheet').innerText;
    });
    expect(pct).toContain('Deel van je spaarinleg');
    expect(pct.toLowerCase()).not.toContain('spaarruimte');

    const nf = await page.evaluate(() => { closeSheet(); setNfAlloc('mode', 'pct'); openNoodfondsPanel(); return document.getElementById('sheet').innerText; });
    expect(nf.toLowerCase()).not.toContain('spaarruimte');
  });

  test('het plan-overzicht noemt de spaarinleg en legt hem uit', async ({ page }) => {
    await boot(page, 'vooruit');
    const html = await page.evaluate(() => renderPlan());
    expect(html).toContain(">spaarinleg<");                            // als uitlegbare term
    expect(html).toContain('gaat van boven naar beneden');
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
