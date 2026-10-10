// v180: de schrappenlijst uit de Instellingen-audit. Code die niet rendert, state die nergens
// gelezen wordt, en inhoud die niets toevoegt. De regel die deze spec bewaakt: een schakelaar
// belooft alleen iets wat bestaat, een mapping bestaat alleen als er een aanroeper is, en er staat
// nergens een verzonnen cijfer.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

// v374: zes subpagina's in plaats van negen uitklapblokken.
const REGELS = ['inkomen', 'bank', 'spelregels', 'herkenning', 'coach', 'gegevens'];

async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('set'));
  await page.waitForSelector('#s-set');
}
const setTekst = (page) => page.evaluate(() => $('#s-set').innerText.replace(/\s+/g, ' '));

test.describe('a · schakelaars beloven alleen wat bestaat', () => {
  test('de streak-schakelaar is weg, en een achtergebleven waarde doet niets', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSetSub('coach'));
    const t = await setTekst(page);
    expect(t).not.toMatch(/streak/i);
    expect(t).not.toMatch(/dagen op rij/i);
    // de streak zelf is in v159 verdwenen; SET.hideStreak werd sindsdien geschreven en nooit gelezen
    expect(await page.evaluate(() => /hideStreak/.test(setCoachWeergave.toString()))).toBe(false);
    const voor = await page.evaluate(() => $('#s-set').innerHTML);
    await page.evaluate(() => { SET.hideStreak = true; save(); render(); });
    expect(await page.evaluate(() => $('#s-set').innerHTML)).toBe(voor);
  });

  test('de demo-schakelaar is weg, met alles wat er alleen aan hing', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSetSub('coach'));
    expect(await setTekst(page)).not.toMatch(/demo/i);
    const r = await page.evaluate(() => ({
      fn: typeof window.demoNotifs,
      // v195: freshStartDue() is met de verse-startkaart opgeheven; de demo-tak zat erin en is
      // dus per definitie mee verdwenen. verseStart() is wat ervoor in de plaats kwam.
      sig: scoreNotifs.toString(), park: coParkReturn.toString(), fresh: verseStart.toString(),
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
  /* v185: SET_SHEETS is opgeheven. De tabel had nog twee ingangen en één aanroeper, en droeg een
     tweede set labels naast de regelnamen. De uitzondering die v183 vastlegde (bank zonder
     aanroeper, bewaard tot oorzaak 4) is daarmee opgelost in plaats van verlengd. Wat deze test
     bewaakt blijft hetzelfde: er is één oppervlak per editor, en geen tabel zonder aanroeper. */
  test('er is geen tabel meer, alleen de twee ingangen die echt bestaan', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof window.SET_SHEETS)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.openSet)).toBe('undefined');
    // v374: beide ingangen openen de subpagina Bank & rekeningen, waar de saldo's en de spaarrekening staan
    const src = await page.evaluate(() => openSaldoInvoer.toString() + openSpaarrekening.toString());
    expect(src.match(/openSetSub\('bank'\)/g).length).toBe(2);
    expect(await page.evaluate(() => typeof openInkomenSheet)).toBe('function');
  });

  test('de panelen werken nog, als subpagina', async ({ page }) => {
    await boot(page);
    // v374: Uiterlijk, Weergave en Coach zijn een pagina; Vermogensreis staat op zijn eigen scherm
    for (const [id, woord] of [['coach', 'Thema'], ['coach', 'Rustig'],
      ['coach', 'Signalen uit je patronen'], ['herkenning', 'Vaste lasten'], ['gegevens', 'Waar staat je data']]) {
      await page.evaluate((x) => openSetSub(x), id);
      expect(await setTekst(page), id).toContain(woord);
    }
    // budget heeft geen inline paneel maar een eigen sheet, en geeft daarom null door als fn
    await page.evaluate(() => openBudgetEditor());
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toMatch(/budget/i);
  });

  test('het hoofdscherm klapt niets uit', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSetSub(null));
    expect(await setTekst(page)).not.toMatch(/limiet-model/i);
    expect(await page.evaluate(() => $('#s-set').innerText.match(/▲|▼/g))).toBe(null);
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
    await page.evaluate(() => openThema());   // v374: het thema kies je in een sheet vanuit Coach & weergave
    const t = await page.evaluate(() => $('#sheet').innerText.replace(/\s+/g, ' '));
    expect(t).not.toContain('1.240');
    const r = await page.evaluate(() => ({ hero: themeHeroTekst(), safe: euro0(safeToSpend().safe) }));
    expect(r.hero).toBe(r.safe);          // hetzelfde getal als de hero op Home, niet een eigen som
    expect(t).toContain(r.hero);
  });

  test('zonder bekend saldo staat er geen bedrag maar het woord van Home', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set); set.manualBal = {}; p.minder_set = JSON.stringify(set);
    await boot(page, p);
    await page.evaluate(() => openSetSub('coach'));
    expect(await page.evaluate(() => totalBalance().known)).toBe(0);
    expect(await page.evaluate(() => themeHeroTekst())).toBe('onbekend');
    await page.evaluate(() => go('dash'));
    expect(await page.evaluate(() => $('#s-dash').innerText)).toContain('onbekend');
  });
});

test.describe('d · de zes regels openen en sluiten zonder fout', () => {
  test('elke regel opent zijn subpagina en gaat terug, geen console-fout', async ({ page }) => {
    const fouten = [];
    page.on('pageerror', (e) => fouten.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
    await boot(page);
    for (const id of REGELS) {
      await page.evaluate((x) => openSetSub(x), id);
      await page.waitForTimeout(30);
      expect(await page.evaluate(() => $('#s-set').innerHTML.length), id).toBeGreaterThan(200);
      await page.evaluate(() => setTerug());
      await page.waitForTimeout(30);
    }
    expect(fouten).toEqual([]);
    // en alle zes staan er nog als regel
    const t = await setTekst(page);
    for (const w of ['Inkomen', 'Bank & rekeningen', 'Spelregels', 'Herkenning', 'Coach & weergave',
      'Gegevens & privacy']) {
      expect(t, w).toContain(w);
    }
  });
});
