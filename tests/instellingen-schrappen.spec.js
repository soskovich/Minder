// v180: de schrappenlijst uit de Instellingen-audit. Code die niet rendert, state die nergens
// gelezen wordt, en inhoud die niets toevoegt. De regel die deze spec bewaakt: een schakelaar
// belooft alleen iets wat bestaat, een mapping bestaat alleen als er een aanroeper is, en er staat
// nergens een verzonnen cijfer.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

// v182/v183: 'coachlook' ging op in 'coach', en 'trans' kwam erbij als eigen sectie.
const REGELS = ['income', 'bank', 'trans', 'budget', 'fire', 'coach', 'modus', 'look', 'privacy'];

async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('set'));
  await page.waitForSelector('#s-set');
}
const setTekst = (page) => page.evaluate(() => $('#s-set').innerText.replace(/\s+/g, ' '));

test.describe('a · schakelaars beloven alleen wat bestaat', () => {
  test('de streak-schakelaar is weg, en een achtergebleven waarde doet niets', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => toggleSet('coach'));
    const t = await setTekst(page);
    expect(t).not.toMatch(/streak/i);
    expect(t).not.toMatch(/dagen op rij/i);
    // de streak zelf is in v159 verdwenen; SET.hideStreak werd sindsdien geschreven en nooit gelezen
    expect(await page.evaluate(() => /hideStreak/.test(setCoach.toString()))).toBe(false);
    const voor = await page.evaluate(() => $('#s-set').innerHTML);
    await page.evaluate(() => { SET.hideStreak = true; save(); render(); });
    expect(await page.evaluate(() => $('#s-set').innerHTML)).toBe(voor);
  });

  test('de demo-schakelaar is weg, met alles wat er alleen aan hing', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => toggleSet('coach'));
    expect(await setTekst(page)).not.toMatch(/demo/i);
    const r = await page.evaluate(() => ({
      fn: typeof window.demoNotifs,
      sig: scoreNotifs.toString(), park: coParkReturn.toString(), fresh: freshStartDue.toString(),
    }));
    expect(r.fn).toBe('undefined');
    for (const [k, v] of Object.entries(r)) if (k !== 'fn') expect(v, k).not.toMatch(/demoMechanismen|__demo/);
    // en een achtergebleven waarde zet niets meer aan
    await page.evaluate(() => { SET.demoMechanismen = true; save(); render(); });
    const keys = await page.evaluate(() => scoreNotifs().map((n) => n.key));
    expect(keys.filter((k) => /-demo$/.test(k))).toEqual([]);
    expect(await setTekst(page)).not.toMatch(/demo/i);
  });
});

test.describe('b · een mapping bestaat alleen met een aanroeper', () => {
  test('SET_SHEETS kent nog precies de twee die openSet krijgt', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => Object.keys(SET_SHEETS).sort())).toEqual(['bank', 'income']);
    /* v183: beide aanroepers wijzen nu naar 'income', want de rekeningenlijst is samengevoegd en
       woont daar. SET_SHEETS.bank houdt daarmee geen aanroeper meer en blijft bewust staan tot
       oorzaak 4 (SET_SHEETS als tweede oppervlak) aan de beurt is. Haal hem niet weg als dode
       mapping: die uitzondering is vastgelegd, met reden. */
    const src = await page.evaluate(() => openSaldoInvoer.toString() + openSpaarrekening.toString());
    expect(src).toContain("openSet('income')");
    expect(src).not.toContain("openSet('bank')");
  });

  test('de zes onbereikbare panelen werken nog, inline in Instellingen', async ({ page }) => {
    await boot(page);
    for (const [id, woord] of [['look', 'Uiterlijk'], ['fire', 'rendement'], ['modus', 'Rustig'],
      ['coach', 'Coaching'], ['trans', 'Interne overboekingen'], ['privacy', 'Waar staat mijn data']]) {
      await page.evaluate((x) => toggleSet(x), id);
      expect(await setTekst(page), id).toContain(woord);
      await page.evaluate((x) => toggleSet(x), id);
    }
    // budget heeft geen inline paneel maar een eigen sheet, en geeft daarom null door als fn
    await page.evaluate(() => openBudgetEditor());
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toMatch(/budget/i);
  });

  test('de budget-regel klapt niets uit', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.setOpen = 'budget'; save(); renderSet(); });
    // fn is null: stond hij er nog, dan zou deze render op setBudget() klappen
    expect(await setTekst(page)).not.toMatch(/limiet-model/i);
    expect(await page.evaluate(() => $('#s-set').innerText.match(/▲/g))).toBe(null);
  });
});

test.describe('c · geen belofte zonder inhoud, geen verzonnen cijfer', () => {
  test('de coach-regel belooft geen categoriebeheer', async ({ page }) => {
    await boot(page);
    const t = await setTekst(page);
    expect(t).toContain('Coach');
    expect(t).not.toMatch(/coach & categorie/i);
  });

  test('het thema-voorbeeld toont je eigen bedrag, niet een verzonnen bedrag', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => toggleSet('look'));
    const t = await setTekst(page);
    expect(t).not.toContain('1.240');
    const r = await page.evaluate(() => ({ hero: themeHeroTekst(), safe: euro0(safeToSpend().safe) }));
    expect(r.hero).toBe(r.safe);          // hetzelfde getal als de hero op Home, niet een eigen som
    expect(t).toContain(r.hero);
  });

  test('zonder bekend saldo staat er geen bedrag maar het woord van Home', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set); set.manualBal = {}; p.minder_set = JSON.stringify(set);
    await boot(page, p);
    await page.evaluate(() => toggleSet('look'));
    expect(await page.evaluate(() => totalBalance().known)).toBe(0);
    expect(await page.evaluate(() => themeHeroTekst())).toBe('onbekend');
    await page.evaluate(() => go('dash'));
    expect(await page.evaluate(() => $('#s-dash').innerText)).toContain('onbekend');
  });
});

test.describe('d · de negen regels openen en sluiten zonder fout', () => {
  test('elke regel klapt open en weer dicht, geen console-fout', async ({ page }) => {
    const fouten = [];
    page.on('pageerror', (e) => fouten.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
    await boot(page);
    for (const id of REGELS) {
      await page.evaluate((x) => toggleSet(x), id);
      await page.waitForTimeout(30);
      expect(await page.evaluate(() => $('#s-set').innerHTML.length), id).toBeGreaterThan(200);
      await page.evaluate((x) => toggleSet(x), id);
      await page.waitForTimeout(30);
    }
    expect(fouten).toEqual([]);
    // en alle negen staan er nog als regel
    const t = await setTekst(page);
    for (const w of ['Budget & doelen', 'Vermogensreis', 'Uiterlijk', 'Weergave & modus',
      'Inkomen & rekeningen', 'Bank & koppelingen', 'Transacties & categorieën', 'Coach',
      'Privacy & gegevens']) {
      expect(t, w).toContain(w);
    }
  });
});
