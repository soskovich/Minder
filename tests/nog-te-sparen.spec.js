// "Nog deze maand" (v85): de derde tegel "Nog te sparen" — hoeveel je deze maand nog opzij moet
// zetten voor je maanddoel. Hergebruikt safeToSpend().saveReserved; geen eigen berekening.
// v144: de tegels wonen alleen nog in de Inzichten-herokaart, dus daar meten we ze nu.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

// Fixture: spaardoel €300/mnd, deze maand al €200 naar de spaarrekening -> nog €100 te gaan.
const TARGET = 300, GESPAARD = 200, REST = TARGET - GESPAARD;

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  const tx = JSON.parse(p.minder_tx);
  fn(set, tx);
  p.minder_set = JSON.stringify(set);
  p.minder_tx = JSON.stringify(tx);
  return p;
}

async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
}
const kaart = (page) => page.locator('#s-ins .card').first();
const tegels = (page) => kaart(page).locator('.wvo-tile');
const spaarTegel = (page) => tegels(page).nth(2);

test.describe('a · de tegel toont wat er nog opzij moet', () => {
  test('bedrag, subregel en plek naast de andere twee', async ({ page }) => {
    await boot(page);
    await expect(tegels(page)).toHaveCount(3);
    const t = (await spaarTegel(page).innerText()).toLowerCase();
    expect(t).toContain('nog te sparen');
    expect(t).toContain('€100');
    expect(t).toContain(`van €${TARGET}`);
    expect(t).toContain(`€${GESPAARD} opzij`);
    // drie kolommen zolang er een spaardoel is
    expect(await kaart(page).locator('.wvo-tiles').evaluate((e) => e.style.gridTemplateColumns)).toBe('1fr 1fr 1fr');
    // en de bestaande tegels staan er onveranderd bij
    const kt = (await kaart(page).innerText()).toLowerCase();
    expect(kt).toContain('nog te betalen');
    expect(kt).toContain('nog te ontvangen');
    expect(kt).toContain('onderaan de streep');
  });

  test('het is exact het bedrag dat "veilig te besteden" al reserveert', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const S = safeToSpend();
      return { rest: S.saveReserved, target: S.saveTarget, gespaard: S.savedThisMonth, doel: monthlySavingTarget() };
    });
    expect(r.target).toBe(TARGET);
    expect(r.doel).toBe(TARGET);
    expect(r.gespaard).toBe(GESPAARD);
    expect(r.rest).toBe(REST);                                            // max(target - gespaard, 0)
    expect(await spaarTegel(page).locator('.wvo-tv').innerText()).toBe(`€${REST}`);
  });

  test('een tik opent de veilig-te-besteden-drill (dezelfde bron)', async ({ page }) => {
    await boot(page);
    await spaarTegel(page).click();
    await page.waitForSelector('#sheetBg.show');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet.toLowerCase()).toContain('veilig te besteden');
    expect(sheet).toContain('Nog te sparen deze maand');
  });
});

test.describe('b · randgevallen', () => {
  test('geen spaardoel: geen tegel, en de widget blijft verder gelijk', async ({ page }) => {
    await boot(page, tweak((set) => { set.savingMode = 'amount'; set.savingAmount = 0; }));
    expect(await page.evaluate(() => monthlySavingTarget())).toBe(0);
    await expect(tegels(page)).toHaveCount(2);
    const kt = (await kaart(page).innerText()).toLowerCase();
    expect(kt).not.toContain('nog te sparen');
    expect(kt).not.toContain('vrij ná sparen');
    expect(kt).toContain('nog te betalen');
    expect(kt).toContain('nog te ontvangen');
    expect(kt).toContain('onderaan de streep');
    expect(await kaart(page).locator('.wvo-tiles').evaluate((e) => e.style.gridTemplateColumns)).toBe('1fr 1fr');
  });

  test('doel al gehaald: €0 met "gehaald", in groen', async ({ page }) => {
    await boot(page, tweak((set) => { set.savingAmount = 150; }));      // 150 doel, 200 al opzij
    expect(await page.evaluate(() => safeToSpend().saveReserved)).toBe(0);
    const t = spaarTegel(page);
    expect(await t.locator('.wvo-tv').innerText()).toBe('€0');
    const sub = await t.locator('.wvo-ts').innerText();
    expect(sub).toContain('gehaald');
    expect(sub).toContain(`€${GESPAARD} opzij`);
    expect(await t.locator('.wvo-tv').getAttribute('style')).toContain('var(--green)');
    expect(await kaart(page).innerText()).not.toContain('vrij ná sparen');   // niets meer te reserveren
  });

  test('meer gespaard dan het doel blijft €0, nooit negatief', async ({ page }) => {
    await boot(page, tweak((set) => { set.savingAmount = 50; }));
    expect(await page.evaluate(() => safeToSpend().saveReserved)).toBe(0);
    expect(await spaarTegel(page).locator('.wvo-tv').innerText()).toBe('€0');
  });
});

test.describe('c · "vrij ná sparen" spiegelt zonder te rekenen', () => {
  test('verschijnt alleen als er onderaan de streep iets overblijft', async ({ page }) => {
    // salaris van deze maand weg -> incDue = je basisinkomen, dus een positief netto
    await boot(page, tweak((set, tx) => {
      for (let i = tx.length - 1; i >= 0; i--) if (tx[i].id === 'inc-' + CUR) tx.splice(i, 1);
    }));
    const r = await page.evaluate(() => {
      const L = monthLiquidity();
      // v169: het variabele deel komt uit je potjes, niet uit je tempo
      const netto = Math.round(L.incDue) - Math.round(L.fixDue) - varPlanRemaining(curMonth);
      return { netto, rest: safeToSpend().saveReserved };
    });
    expect(r.netto).toBeGreaterThan(0);
    const kt = (await kaart(page).innerText()).toLowerCase();
    expect(kt).toContain('vrij ná sparen');
    expect(kt).toContain(`€${(r.netto - r.rest).toLocaleString('nl-NL')} vrij ná sparen`);
  });

  test('blijft weg bij een negatief netto (geen belofte die er niet is)', async ({ page }) => {
    await boot(page);                                                    // salaris al binnen -> netto negatief
    const netto = await page.evaluate(() => { const L = monthLiquidity();
      return Math.round(L.incDue) - Math.round(L.fixDue) - varPlanRemaining(curMonth); });
    expect(netto).toBeLessThan(0);
    const kt = (await kaart(page).innerText()).toLowerCase();
    expect(kt).not.toContain('vrij ná sparen');
    expect(kt).toContain('nog te sparen');                                // de tegel zelf blijft wel
  });
});

test('d · drie tegels passen op 360 en 390px', async ({ page }) => {
  await boot(page);
  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(() => renderIns());
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => {
      const card = document.querySelector('#s-ins .card');
      const cb = card.getBoundingClientRect();
      return {
        pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        buiten: [...card.querySelectorAll('.wvo-tile')].filter((t) => t.getBoundingClientRect().right > cb.right + 1).length,
        afgekapt: [...card.querySelectorAll('.wvo-tv')].filter((v) => v.scrollWidth > v.clientWidth + 1).length,
        breedtes: [...card.querySelectorAll('.wvo-tile')].map((t) => Math.round(t.getBoundingClientRect().width)),
      };
    });
    expect(r.pagina, `${w}px`).toBe(0);
    expect(r.buiten, `${w}px`).toBe(0);
    expect(r.afgekapt, `${w}px`).toBe(0);                                // geen afgekapt bedrag
    expect(r.breedtes.length, `${w}px`).toBe(3);
    expect(Math.min(...r.breedtes), `${w}px`).toBeGreaterThan(70);
  }
});
