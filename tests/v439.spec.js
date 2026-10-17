/* v439: INZICHTEN EN HOME OPGESCHOOND (gezien op het toestel, 17 okt). Op Inzichten zijn "Forecast eind oktober" en "wijzigingen deze
   maand" weg uit de maandkaart, en staat op die plek "Verwacht saldo eind oktober" met de verwachte bonus. Op Home zijn "waarvan vrij te
   besteden" en "Verwacht eind oktober" weg. Op v438-stand (GECONSTRUEERD, zie daar). */
const { test, expect } = require('@playwright/test');
const S = require('./v438-stand');
const boot = async (page, o, w) => { await page.setViewportSize({ width: w || 390, height: 844 }); await S.boot(page, o); };

test.describe('v439 · Inzichten', () => {
  test('a. de maandkaart draagt geen Forecast en geen wijzigingen, wel het verwachte saldo eind oktober op hun plek', async ({ page }) => {
    await boot(page);
    /* de invoer draagt het geval: er zijn wijzigingen deze maand, en er is een forecast */
    expect(await page.evaluate(() => [maandVooruit().wijz, maandBudgetWijz(thisYM()).tot])).toEqual([40, 40]);
    await page.evaluate(() => { go('ins'); renderIns(); });
    const k = page.locator('#insMaand');
    await expect(k.locator('[data-insforecast], [data-budgetwijz]')).toHaveCount(0);
    await expect(k).not.toContainText('Forecast eind');
    await expect(k).not.toContainText('wijzigingen deze maand');
    const r = page.locator('#insMaand #insSaldoEind');
    await expect(r).toHaveCount(1);
    const eind = await page.evaluate(() => maandVerloop().eind);
    await expect(r).toHaveAttribute('data-inssaldoeind', String(eind));
    await expect(r).toContainText('Verwacht saldo eind oktober');
    await expect(r.locator('[data-inssaldobonus]')).toHaveAttribute('data-inssaldobonus', String(eind + 2500));
    /* geen eigen kaart meer naast de maandkaart, en het is de laatste regel van de maandkaart */
    expect(await page.evaluate(() => [...document.querySelectorAll('#s-ins > #insSaldoEind')].length)).toBe(0);
    expect(await page.evaluate(() => document.getElementById('insMaand').lastElementChild.id)).toBe('insSaldoEind');
  });
  test('b. een tik opent de sheet van het verwachte eind', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    await page.click('#insSaldoEind');
    await expect(page.locator('#verwachtEindSheet')).toBeVisible();
  });
  test('c. een bonus die al "eenmalig" heet draagt het woord niet twee keer; een gewone naam krijgt het erbij', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.irregularIncome[0].naam = 'eenmalig bonus'; save(); go('ins'); renderIns(); });
    const t = await page.locator('#insSaldoEind [data-insbonus]').innerText();
    expect((t.match(/eenmalig/g) || []).length).toBe(1);
    expect(t).toBe('+ eenmalig bonus €2.500 · telt mee zodra binnen');
    await page.evaluate(() => { SET.irregularIncome[0].naam = 'Bonus'; save(); renderIns(); });
    await expect(page.locator('#insSaldoEind [data-insbonus]')).toHaveText('+ bonus €2.500 · eenmalig · telt mee zodra binnen');
  });
  for (const w of [360, 390]) {
    test(`d. op ${w}x844 past Inzichten boven de menubalk, zonder horizontale overloop`, async ({ page }) => {
      await boot(page, undefined, w);
      await page.evaluate(() => go('ins'));
      const f = await page.evaluate(() => ({ last: Math.max(...[...document.querySelectorAll('#s-ins > *')].map(e => e.getBoundingClientRect().bottom)),
        nav: document.querySelector('nav').getBoundingClientRect().top, over: document.documentElement.scrollWidth - window.innerWidth,
        rij: Math.round(document.getElementById('insSaldoEind').getBoundingClientRect().height) }));
      console.log(`PX ${w} laatste=${Math.round(f.last)} nav=${Math.round(f.nav)} saldoregel=${f.rij}`);
      expect(f.last).toBeLessThan(f.nav);
      expect(f.over).toBeLessThanOrEqual(0);
    });
  }
});

test.describe('v439 · Home', () => {
  test('e. Home draagt geen vrij te besteden en geen verwacht eind; het saldo blijft het hoofdgetal', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('dash'); renderDash(); });
    for (const sel of ['[data-vrij]', '[data-vrijdag]', '[data-verwachteind]', '[data-krap]']) await expect(page.locator('#s-dash ' + sel), sel).toHaveCount(0);
    const t = await page.locator('#s-dash .homehero').innerText();
    expect(t).not.toMatch(/vrij te besteden/i);
    expect(t).not.toMatch(/Verwacht eind/);
    await expect(page.locator('#s-dash [data-totaalsaldo]')).toBeVisible();
  });
  test('f. de functies van de Home-regels zijn weg; de bron van de aankoopcheck en de sheet blijven', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => [typeof vrijRegel, typeof verwachtEindRij, typeof openSafeToSpend, typeof openVerwachtEind, typeof vrijPerDag]))
      .toEqual(['undefined', 'undefined', 'function', 'function', 'function']);
  });
});
