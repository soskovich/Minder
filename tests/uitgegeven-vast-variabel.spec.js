// v116: gemeld — de drill-down achter "Uitgegeven" op Inzichten kende alleen Categorieën en Top
// uitgaven; de vast/variabel-splitsing en het omzetten van een post zaten uitsluitend op het losse
// widget "Vaste vs variabele lasten", dat achter Verdieping staat en verborgen kan zijn. Nu is er
// een derde segment "Vast/variabel" dat naar hetzelfde bestaande mechanisme leidt
// (openFixedVarDrill -> fixFlipAsk -> fixFlip), maar begrensd tot de maand van de drill.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const SHEET = '#sheetBg.show';
const sheetTxt = (page) => page.locator('#sheet').innerText();

async function openUitgegeven(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
  await page.locator('#s-ins >> text=Uitgegeven').first().click();
  await page.waitForSelector(SHEET);
}

async function openFV(page, payload) {
  await openUitgegeven(page, payload);
  await page.locator('#sheet >> text=Vast/variabel').click();
  await page.waitForSelector('#sheet .fv-row');
}

// wat de app zelf van deze maand vindt: som en aantal per kant
const meting = (page, m) => page.evaluate((mm) => {
  let fixed = 0, vari = 0, nf = 0, nv = 0;
  for (const t of txOfMonth(mm)) {
    if (!isExpenseTx(t)) continue;
    if (isFixed(t)) { fixed += -t.amount; nf++; } else { vari += -t.amount; nv++; }
  }
  return { fixed: Math.round(fixed), vari: Math.round(vari), nf, nv };
}, m);

test.describe('a · het derde segment', () => {
  test('de Uitgegeven-drill heeft nu drie kanten', async ({ page }) => {
    await openUitgegeven(page);
    const chips = await page.$$eval('#sheet .chips .chip', (els) => els.map((e) => e.textContent.trim()));
    expect(chips).toEqual(['Categorieën', 'Top uitgaven', 'Vast/variabel']);
  });

  test('de splitsing toont beide kanten met bedrag en aantal', async ({ page }) => {
    await openFV(page);
    const s = await sheetTxt(page);
    expect(s).toContain('Vaste lasten');
    expect(s).toContain('Variabele uitgaven');
    const m = await meting(page, CUR);
    expect(s).toContain('' + m.nf + '×');
    expect(s).toContain('' + m.nv + '×');
    // vast is een herkende herhaling, niet de categorie (v55) — dat staat er ook zo
    expect(s).toContain('Vast = een herkende terugkerende betaling, niet de categorie');
  });

  test('de twee kanten tellen samen op tot het uitgegeven-bedrag erboven', async ({ page }) => {
    await openFV(page);
    const m = await meting(page, CUR);
    const kop = await page.evaluate(() => {
      let t = 0;
      for (const x of txOfMonth(window._msMonth)) if (CATS[catOf(x)].type === 'expense') t += -x.amount;
      return Math.round(t);
    });
    expect(m.fixed + m.vari).toBe(kop);           // geen gat, geen overlap (v104)
  });

  test('de gekozen kant wordt onthouden', async ({ page }) => {
    await openFV(page);
    expect(await page.evaluate(() => SET.msDrill)).toBe('fv');
    await page.evaluate(() => closeSheet());
    await page.locator('#s-ins >> text=Uitgegeven').first().click();
    await page.waitForSelector('#sheet .fv-row');   // opent weer op vast/variabel
  });
});

test.describe('b · de transactielijst blijft bij deze maand', () => {
  test('vaste lasten van de maand, niet van de hele periode', async ({ page }) => {
    await openFV(page);
    await page.locator('#sheet >> text=Vaste lasten').click();
    await page.waitForSelector('#sheet >> text=Terug naar uitgegeven');
    const m = await meting(page, CUR);
    const s = await sheetTxt(page);
    expect(s).toContain(m.nf + ' transacties');
    expect(await page.locator('#sheet .tx').count()).toBe(m.nf);
    // de datums vallen allemaal binnen de maand van de drill
    const buiten = await page.evaluate((mm) => txOfMonth(mm).length !== TX.length, CUR);
    expect(buiten).toBe(true);                    // er is echt meer data dan deze maand
  });

  test('de terug-link keert terug naar de Uitgegeven-drill', async ({ page }) => {
    await openFV(page);
    await page.locator('#sheet >> text=Variabele uitgaven').click();
    await page.locator('#sheet >> text=Terug naar uitgegeven').click();
    await page.waitForSelector('#sheet .fv-row');
    expect(await sheetTxt(page)).toContain('Uitgegeven deze maand');
  });

  test('het widget op Inzichten houdt zijn eigen periode-scope', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { go('ins'); openFixedVarDrill('fixed'); });
    await page.waitForSelector(SHEET);
    expect(await page.evaluate(() => window._fvMonth)).toBeNull();
    expect(await sheetTxt(page)).not.toContain('Terug naar uitgegeven');
  });
});

test.describe('c · een post omzetten', () => {
  test('van vast naar variabel, alleen deze transactie', async ({ page }) => {
    await openFV(page);
    await page.locator('#sheet >> text=Vaste lasten').click();
    await page.waitForSelector('#sheet >> text=Terug naar uitgegeven');
    const voor = await meting(page, CUR);
    expect(await sheetTxt(page)).toContain('Greenpeace');

    await page.locator('#sheet .tx', { hasText: 'Greenpeace' }).first().click();
    await page.waitForSelector('#sheet >> text=Alleen deze transactie');
    await page.locator('#sheet >> text=Alleen deze transactie').click();
    await page.waitForSelector('#sheet >> text=Terug naar uitgegeven');

    const na = await meting(page, CUR);
    expect(na.nf).toBe(voor.nf - 1);
    expect(na.nv).toBe(voor.nv + 1);
    expect(na.fixed + na.vari).toBe(voor.fixed + voor.vari);   // alleen verschoven, niets verdwenen
    expect(await page.evaluate(() => Object.values(SET.fixOvr || {}))).toContain('var');
    // en de lijst staat nog op dezelfde maand, ondanks de renderIns() in fixFlip
    expect(await page.evaluate(() => window._fvMonth)).toBe(CUR);
    expect(await sheetTxt(page)).not.toContain('Greenpeace');
  });

  test('van vast naar variabel, alles van die winkel', async ({ page }) => {
    await openFV(page);
    await page.locator('#sheet >> text=Vaste lasten').click();
    await page.locator('#sheet .tx', { hasText: 'Greenpeace' }).first().click();
    await page.locator('#sheet >> text=Alle van').click();
    await page.waitForSelector('#sheet >> text=Terug naar uitgegeven');

    expect(await page.evaluate(() => Object.values(SET.fixOvrM || {}))).toContain('var');
    // ook in de andere maanden is Greenpeace nu variabel
    const anders = await page.evaluate(() => months().every((mm) =>
      txOfMonth(mm).filter((t) => /greenpeace/i.test(t.name)).every((t) => !isFixed(t))));
    expect(anders).toBe(true);
  });

  test('en weer terug: variabel naar vast', async ({ page }) => {
    await openFV(page);
    await page.locator('#sheet >> text=Variabele uitgaven').click();
    await page.waitForSelector('#sheet >> text=Terug naar uitgegeven');
    await page.locator('#sheet .tx', { hasText: 'Albert Heijn' }).first().click();
    await page.locator('#sheet >> text=Alleen deze transactie').click();
    await page.waitForSelector('#sheet >> text=Terug naar uitgegeven');

    expect(await page.evaluate(() => Object.values(SET.fixOvr || {}))).toContain('fixed');
    expect((await meting(page, CUR)).nf).toBeGreaterThan(0);
    expect(await sheetTxt(page)).not.toContain('Albert Heijn');   // hij staat niet meer bij variabel
  });

  test('annuleren laat de classificatie ongemoeid', async ({ page }) => {
    await openFV(page);
    await page.locator('#sheet >> text=Vaste lasten').click();
    const voor = await meting(page, CUR);
    await page.locator('#sheet .tx').first().click();
    await page.locator('#sheet >> text=Annuleren').click();
    await page.waitForSelector('#sheet >> text=Terug naar uitgegeven');
    expect(await meting(page, CUR)).toEqual(voor);
    expect(await page.evaluate(() => SET.fixOvr || {})).toEqual({});
  });
});

test.describe('d · layout', () => {
  for (const w of [360, 390]) {
    test(`drie chips passen op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await openFV(page);
      const over = await page.evaluate(() => {
        const el = document.querySelector('#sheet');
        const chips = document.querySelector('#sheet .chips');
        return {
          sheet: el.scrollWidth - el.clientWidth,
          chips: chips.scrollWidth - chips.clientWidth,
          body: document.body.scrollWidth - document.body.clientWidth,
        };
      });
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.chips).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
