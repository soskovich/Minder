/* v364: DE BUDGETEDITOR HEEFT EEN INGANG OP GRIP, EN ALLEEN DAAR (keuze a van de gebruiker). "Budget aanpassen ›"
   staat rechts in de kop van Deze maand en opent de editor op de lopende maand, ook als Inzichten op een andere
   maand staat. De tik opent niet ook de sheet van de kop. Plan krijgt geen ingang. Fixture: deze-maand-stand.js. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand');

const naarGrip = async (page) => { await page.evaluate(() => go('maand')); await page.waitForSelector('#gripDezeMaand [data-budgetlink]'); };

for (const w of [360, 390]) {
  test(`${w}px: de link staat zichtbaar in de kop, zonder overloop`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w === 360 ? 640 : 844 });
    await boot(page); await naarGrip(page);
    const r = await page.evaluate(() => {
      const k = document.querySelector('#gripDezeMaand'), l = k.querySelector('[data-budgetlink]'), h = k.querySelector('[data-dmkop]');
      const kb = k.getBoundingClientRect(), lb = l.getBoundingClientRect(), hb = h.getBoundingClientRect();
      return { tekst: l.innerText, zicht: getComputedStyle(l).visibility, lb: [lb.left, lb.right, lb.top, lb.bottom], kb: [kb.left, kb.right],
        hTop: hb.top, hBottom: hb.bottom, docW: document.documentElement.scrollWidth, winW: innerWidth,
        kaartOver: k.scrollWidth - k.clientWidth, kop: h.innerText, kaartH: Math.round(kb.height) };
    });
    console.log(`v364 ${w}px: link ${Math.round(r.lb[1] - r.lb[0])}px breed, kaart ${r.kaartH}px`);
    expect(r.tekst).toBe('Budget aanpassen ›');
    expect(r.zicht).toBe('visible');
    expect(r.lb[1] - r.lb[0]).toBeGreaterThan(40);
    expect(r.lb[0]).toBeGreaterThanOrEqual(r.kb[0]); expect(r.lb[1]).toBeLessThanOrEqual(r.kb[1]);
    expect(r.lb[3]).toBeLessThan(w === 360 ? 640 : 844);   // binnen het scherm
    expect(r.lb[2]).toBeLessThan(r.hBottom); expect(r.lb[3]).toBeGreaterThan(r.hTop);   // op dezelfde regel als de kop
    expect(r.kop).not.toContain('aanpassen');   // de kop zelf is ongewijzigd
    expect(r.docW).toBeLessThanOrEqual(r.winW);
    expect(r.kaartOver).toBeLessThanOrEqual(0);
  });
}

test('de link opent de editor op de lopende maand, ook als Inzichten op een andere maand staat', async ({ page }) => {
  await boot(page); await naarGrip(page);
  const voor = await page.evaluate(() => { curMonth = months().find((x) => x !== thisYM()); return { cur: curMonth, nu: thisYM(), set: JSON.stringify(SET) }; });
  expect(voor.cur).not.toBe(voor.nu);   // de invoer draagt het geval: zonder link zou de editor de maand van Inzichten nemen
  await page.evaluate(() => document.querySelector('#gripDezeMaand [data-budgetlink]').click());
  const r = await page.evaluate(() => ({ m: window._budgetSheet, head: !!document.getElementById('budgetSheetHead'),
    vooruit: !!document.getElementById('gripVooruit'), set: JSON.stringify(SET) }));
  expect(r.m).toBe(voor.nu);
  expect(r.head).toBe(true);
  expect(r.vooruit).toBe(false);   // de tik opent niet ook de sheet van de kop
  expect(r.set).toBe(voor.set);    // openen schrijft niets
});

test('de kop zelf opent nog steeds zijn eigen sheet', async ({ page }) => {
  await boot(page); await naarGrip(page);
  await page.evaluate(() => document.querySelector('#gripDezeMaand [data-dmkop]').click());
  expect(await page.evaluate(() => !!document.getElementById('gripVooruit') && !document.getElementById('budgetSheetHead'))).toBe(true);
});

test('alleen Grip: Plan en Inzichten dragen de link niet', async ({ page }) => {
  await boot(page);
  for (const s of ['vooruit', 'ins', 'dash']) {
    await page.evaluate((x) => go(x), s);
    expect(await page.evaluate(() => ({ l: document.querySelectorAll('[data-budgetlink]:not(#s-maand *)').length,
      t: [...document.querySelectorAll('.screen.active, section.active')].map((e) => e.innerText).join(' ').includes('Budget aanpassen') }))).toEqual({ l: 0, t: false });
  }
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
  expect(src.split('data-budgetlink').length - 1).toBe(1);   // een plek in de bron: de kop van Deze maand op Grip
});
