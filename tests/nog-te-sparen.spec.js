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
/* v241: de posten staan op Inzichten niet meer in de herokaart maar in de sectie 'Wat er nog komt'.
   Het anker verhuist mee; wat de tests vasthouden (bedrag, subregel, plek, tik) blijft hetzelfde. */
const kaart = (page) => page.locator('#insNogLijst');
const tegels = (page) => kaart(page).locator('.ins-nog-rij');
/* v253: op zijn label en niet op zijn plek. De volgorde van de vier posten is die ronde gewijzigd
   naar de weg van je geld door de maand (ontvangen, sparen, betalen, potjes), en daarmee viel deze
   spec om op een plek terwijl wat hij vasthoudt - bedrag, subregel en tik van de spaarpost - er
   niets mee te maken heeft. */
const spaarTegel = (page) => tegels(page).filter({ hasText: /nog te sparen/i }).first();

test.describe('a · de tegel toont wat er nog opzij moet', () => {
  test('bedrag, subregel en plek naast de andere twee', async ({ page }) => {
    await boot(page);
    /* v204: de rij telt sinds v204 ook 'Nog uit je potjes', dus het aantal ligt niet meer vast.
       v253: en de plek ook niet meer, dus deze test zoekt de spaarpost op zijn label. */
    await expect(spaarTegel(page)).toBeVisible();
    const t = (await spaarTegel(page).innerText()).toLowerCase();
    expect(t).toContain('nog te sparen');
    expect(t).toContain('€100');
    expect(t).toContain(`van €${TARGET}`);
    expect(t).toContain(`€${GESPAARD} opzij`);
    // v241: geen twee kolommen meer maar een lijst. De volgorde zelf staat in
    // nog-deze-maand-volgorde.spec.js; hier telt alleen dat de spaarpost naast de andere staat.
    expect(await tegels(page).count()).toBeGreaterThanOrEqual(3);
    /* En de bestaande posten staan er onveranderd bij. v260: 'nog te ontvangen' hoort daar niet
       meer bij in deze fixture, want het salaris is al binnen en een post van nul zonder uitkomst
       verdwijnt. Dat is geen eigenschap van de spaarpost, dus de test bindt aan de buren die er
       wel horen te staan. */
    const kt = (await kaart(page).innerText()).toLowerCase();
    expect(kt).toContain('nog te betalen');
    expect(kt).toContain('nog uit je potjes');
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
    expect(await spaarTegel(page).locator('.ins-nog-val').innerText()).toBe(`€${REST}`);
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
    // v204: zonder spaardoel valt de spaartegel weg; of er dan twee of drie tegels staan hangt
    // af van je potjes, dus toetsen we de afwezigheid en niet het aantal
    const kt = (await kaart(page).innerText()).toLowerCase();
    expect(kt).not.toContain('nog te sparen');
    expect(kt).toContain('nog te betalen');
    expect(kt).toContain('nog uit je potjes');   // v260: zie de toelichting hierboven
    expect(await tegels(page).count()).toBeGreaterThanOrEqual(2);
  });

  test('doel al gehaald: €0 met "gehaald", in groen', async ({ page }) => {
    await boot(page, tweak((set) => { set.savingAmount = 150; }));      // 150 doel, 200 al opzij
    expect(await page.evaluate(() => safeToSpend().saveReserved)).toBe(0);
    const t = spaarTegel(page);
    expect(await t.locator('.ins-nog-val').innerText()).toBe('€0');
    const sub = await t.locator('.ins-nog-sub').innerText();
    expect(sub).toContain('gehaald');
    expect(sub).toContain(`€${GESPAARD} opzij`);
    expect(await t.locator('.ins-nog-val').getAttribute('style')).toContain('var(--green)');
  });

  test('meer gespaard dan het doel blijft €0, nooit negatief', async ({ page }) => {
    await boot(page, tweak((set) => { set.savingAmount = 50; }));
    expect(await page.evaluate(() => safeToSpend().saveReserved)).toBe(0);
    expect(await spaarTegel(page).locator('.ins-nog-val').innerText()).toBe('€0');
  });
});

/* v192: hier stond blok c, over de spiegel "€X vrij ná sparen". Die hing aan het chipgetal
   "Deze maand op eigen kracht" (netto - nogSparen), en dat getal is vervallen omdat het een
   waarneming bij een planrest optelde en daardoor steeg naarmate je meer uitgaf. Een spiegel op een
   getal dat weg is heeft geen onderwerp meer. Zie tests/geen-verbetering-door-uitgeven.spec.js. */
test('d · de posten passen op 360 en 390px', async ({ page }) => {
  await boot(page);
  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(() => renderIns());
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => {
      const card = document.querySelector('#insNogLijst');
      const cb = card.getBoundingClientRect();
      return {
        pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        buiten: [...card.querySelectorAll('.ins-nog-rij')].filter((t) => t.getBoundingClientRect().right > cb.right + 1).length,
        afgekapt: [...card.querySelectorAll('.ins-nog-val')].filter((v) => v.scrollWidth > v.clientWidth + 1).length,
        breedtes: [...card.querySelectorAll('.ins-nog-rij')].map((t) => Math.round(t.getBoundingClientRect().width)),
      };
    });
    expect(r.pagina, `${w}px`).toBe(0);
    expect(r.buiten, `${w}px`).toBe(0);
    expect(r.afgekapt, `${w}px`).toBe(0);                                // geen afgekapt bedrag
    // v241: het aantal ligt niet vast; elke post neemt de volle breedte, dus geen enkele wordt smal
    expect(r.breedtes.length, `${w}px`).toBeGreaterThanOrEqual(3);
    expect(new Set(r.breedtes).size, `${w}px`).toBe(1);
  }
});
