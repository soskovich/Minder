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

test.describe('a · de driehoek vouwt, de chevron gaat ergens heen', () => {
  test('een regel die inline uitklapt draagt een driehoek', async ({ page }) => {
    await boot(page);
    const tekens = (page) => page.evaluate(() => [...document.querySelectorAll('#s-set div[style*="min-width:0"]')]
      .map((e) => ({ naam: e.querySelector('div').textContent.trim(),
        teken: (e.nextElementSibling || {}).textContent || '' })));
    const voor = await tekens(page);
    for (const r of voor) {
      if (r.naam === 'Budget & doelen') expect(r.teken.trim(), r.naam).toBe('›');   // eigen sheet
      else expect(r.teken.trim(), r.naam).toBe('▼');                                 // klapt uit
    }
    // open een regel: de driehoek draait om, hij wordt geen chevron
    await page.evaluate(() => toggleSet('coach'));
    const na = await tekens(page);
    expect(na.find((r) => r.naam === 'Coach').teken.trim()).toBe('▲');
    expect(na.find((r) => r.naam === 'Budget & doelen').teken.trim()).toBe('›');
  });

  test('het gedrag zelf is onveranderd: sheet blijft sheet, inline blijft inline', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.setOpen = 'budget'; save(); renderSet(); });
    expect(await page.evaluate(() => $('#s-set').innerText)).not.toMatch(/limiet-model/i);
    await page.evaluate(() => toggleSet('look'));
    expect(await page.evaluate(() => $('#s-set').innerText)).toContain('Uiterlijk');
    expect(await page.evaluate(() => $('#sheetBg').classList.contains('show'))).toBe(false);
  });
});

test.describe('b · SET_SHEETS is opgeheven', () => {
  test('er is geen tabel en geen tweede labelbron meer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof window.SET_SHEETS)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.openSet)).toBe('undefined');
    expect(await page.evaluate(() => typeof window.renderSetSheet)).toBe('undefined');
    // de sheet heette 'Bankkoppeling & import' naast een regel 'Bank & koppelingen'
    expect(await page.evaluate(() => $('#s-set').innerText)).not.toContain('Bankkoppeling & import');
  });

  test('de enige sheet-ingang opent dezelfde sectie, met dezelfde naam als de regel', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openInkomenSheet());
    await page.waitForSelector('#sheetBg.show');
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('Inkomen & rekeningen');       // exact de regelnaam
    expect(t).toContain('Klaar');
    expect(t).toContain('spaar');                       // de rekeningenlijst uit v183
  });

  test('beide oude aanroepers werken nog', async ({ page }) => {
    for (const fn of ['openSaldoInvoer', 'openSpaarrekening']) {
      await boot(page);
      await page.evaluate((f) => window[f](), fn);
      await page.waitForSelector('#sheetBg.show');
      expect(await page.locator('#sheet').innerText(), fn).toContain('Inkomen & rekeningen');
    }
  });

  test('de sheet ververst mee en laat zich overnemen door een andere sheet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openInkomenSheet());
    await page.waitForSelector('#sheetBg.show');
    await page.evaluate(() => { SET.income = 4321; save(); render(); });
    expect(await page.locator('#sheet').innerHTML()).toContain('4321');
    await page.evaluate(() => openCoachAvatar());
    expect(await page.evaluate(() => window._setSheet)).toBeNull();
    expect(await page.locator('#sheet').innerText()).toContain('Kies je coach');
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
