// v185: oorzaak 4 uit de Instellingen-audit plus de horizongroep.
// Drie dingen: dezelfde chevron stond voor twee gedragingen, SET_SHEETS was een tweede oppervlak
// met eigen labels, en het paneel Vermogensreis toonde doorgerekende uitkomsten in plaats van
// alleen aannames. Dat laatste is het punt van de ronde: een projectie die op een erkend verzonnen
// getal rust, moet dat zeggen waar de projectie staat, niet alleen bij het veld.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

function metReis(reis) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.reis = Object.assign({ incGoal: 2000, birth: 1990, taxPct: 1.2, fireMult: 25 }, reis || {});
  set.assets = [{ naam: 'Index', bedrag: 30000, grow: true }];
  p.minder_set = JSON.stringify(set);
  return p;
}
async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('set'));
  await page.waitForSelector('#s-set');
}
const paneel = (page, fn) => page.evaluate((f) => {
  const d = document.createElement('div'); d.innerHTML = window[f](); return d.innerText.replace(/\s+/g, ' ');
}, fn);
const fireScherm = (page) => page.evaluate(() => { go('fire'); return $('#s-fire').innerText.replace(/\s+/g, ' '); });

/* v374: blok a (de driehoek tegen de chevron) en blok b (SET_SHEETS en de inkomen-sheet) gingen over de
   uitklapblokken. Die bestaan niet meer: elke regel is een subpagina met een chevron, en dat staat in
   instellingen-psd2.spec.js. Wat van b blijft is dat er geen tweede labelbron is en dat de oude ingangen werken. */
test.describe('b · geen tweede labelbron, en de oude ingangen werken', () => {
  test('er is geen tabel en geen tweede labelbron meer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof window.SET_SHEETS)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.openSet)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.renderSetSheet)).toBe('undefined');
    expect(await page.evaluate(() => $('#s-set').innerText)).not.toContain('Bankkoppeling & import');
  });

  test('de oude aanroepers openen de subpagina met dezelfde naam als de regel', async ({ page }) => {
    for (const [fn, sub, naam] of [['openSaldoInvoer', 'bank', 'Bank & rekeningen'], ['openSpaarrekening', 'bank', 'Bank & rekeningen'], ['openInkomenSheet', 'inkomen', 'Inkomen']]) {
      await boot(page);
      await page.evaluate((f) => window[f](), fn);
      expect(await page.evaluate(() => window._setSub), fn).toBe(sub);
      expect(await page.evaluate(() => $('#s-set [data-setsub]').textContent), fn).toContain(naam);
    }
  });
});

test.describe('c · Instellingen toont aannames, geen doorgerekende uitkomsten', () => {
  test('de twee projectie-regels staan er niet meer', async ({ page }) => {
    await boot(page, metReis());
    const t = await paneel(page, 'setFireAannames');
    expect(t).not.toContain('Nodig:');
    expect(t).not.toContain('Benodigd kapitaal');
    expect(t).not.toMatch(/overschot|tekort/);
    expect(t).not.toMatch(/verwacht rond|Op koers rond/);
    // de aannames zelf blijven onaangeroerd
    expect(t).toContain('Rendement');
    expect(t).toContain('Inflatie');
    expect(t).toContain('Belasting op vermogen');
    expect(t).toContain('Gewenst per maand');
    expect(t).toContain('Geboortejaar');
  });

  test('alle drie de disclaimers staan er nog', async ({ page }) => {
    await boot(page, metReis());
    const t = await paneel(page, 'setFireAannames');
    expect(t).toContain('Ruwe plaatshouder, geen berekend feit');
    expect(t).toContain('Rendementen zijn voorbeelden, geen belofte');
    expect(t).toMatch(/geen fiscaal advies|benadering/i);
  });

  test('het FIRE-getal stond al op het vermogensscherm, dus die regel is weggehaald', async ({ page }) => {
    await open(page, metReis());
    const r = await page.evaluate(() => { const M = reisModel(); return { fire: M.FIRE }; });
    const t = await fireScherm(page);
    expect(t).toContain('FIRE-getal');
    expect(t).toContain(String(r.fire).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
    expect(t).toMatch(/kom je rond \d{4} bij je FIRE-getal|haal je je FIRE-getal niet/);
  });

  test('het benodigde kapitaal stond er niet, dus die regel is verhuisd', async ({ page }) => {
    await open(page, metReis());
    const r = await page.evaluate(() => { const M = reisModel();
      return { req: (+M.R.incGoal || 0) * 12 * M.R.fireMult, jaar: M.targetYear }; });
    const t = await fireScherm(page);
    expect(t).toContain(String(r.req).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
    expect(t).toMatch(/overschot|tekort/);
    expect(t).toContain(String(r.jaar));
    // zelfde formule, niet een tweede berekening
    expect(await page.evaluate(() => /incGoal\s*\|\|\s*0\)\s*\*\s*12\s*\*\s*R\.fireMult/.test(reisInkomensdoelRegel.toString()))).toBe(true);
  });

  test('zonder inkomensdoel staat die regel er niet', async ({ page }) => {
    await open(page, metReis({ incGoal: 0 }));
    expect(await page.evaluate(() => reisInkomensdoelRegel(reisModel()))).toBe('');
  });
});

test.describe('d · de plaatshouder-waarschuwing staat waar de projectie staat', () => {
  test('het vermogensscherm zegt waar zijn lijn op rust', async ({ page }) => {
    await open(page, metReis({ taxPct: 1.2 }));
    const t = await fireScherm(page);
    expect(t).toContain('ruwe plaatshouder, geen berekend feit');
    expect(t).toContain('1,2%');
    expect(t).toMatch(/deze hele lijn rust daarop/);
  });

  test('en de disclaimer bij het veld blijft ook staan', async ({ page }) => {
    await boot(page, metReis({ taxPct: 1.2 }));
    expect(await paneel(page, 'setFireAannames')).toContain('Ruwe plaatshouder, geen berekend feit');
  });

  test('zonder belasting is er geen belastingzin, en dus ook geen waarschuwing', async ({ page }) => {
    await open(page, metReis({ taxPct: 0 }));
    const t = await fireScherm(page);
    expect(t).not.toContain('Zonder belasting');
    expect(t).not.toContain('ruwe plaatshouder');
  });
});
