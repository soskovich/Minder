/* v403: EEN PERSOONLIJKE OVERBOEKING ZONDER POTJE TELT NIET ALS UITGAVE, OP GRIP EN OP INZICHTEN, uit een definitie
   (buitenUitgave). Stand: die van zonder-potje-zuiver (grip-kring-stand, 10 oktober 2026) met EUR 150 aan Tikkie Dirk op
   Persoonlijke overboeking in oktober. GECONSTRUEERD EN NIET GEMETEN. */
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

async function boot(page) {
  await K.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, cat) => { const t = { id: 'p' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: 'BEA, BETAALPAS ' + n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
    delete SET.budgets.persoonlijk;
    add('2026-09-24', -175, 'Tikkie Cas', 'persoonlijk'); add('2026-10-04', -150, 'Tikkie Dirk', 'persoonlijk'); add('2026-10-06', -30, 'Bakker Jan', 'boodschappen');
    save(); render();
  }, { MAIN: K.MAIN });
}
const stand = page => page.evaluate(() => { const T = totals(thisYM()), V = maandVooruit(), S = insMaandStand();
  return { spend: T.spend, norm: T.spendNorm, pers: T.persoonlijk, grip: V.uit, gripP: V.projectie, gripSom: V.uit + V.vast + V.rest + V.inleg, ins: S.uit, insPers: S.pers }; });
async function naarIns(page) { await page.evaluate(() => { curMonth = null; go('ins'); }); }

test('a: invoermeting, de persoonlijke overboeking zit in spend en niet in spendNorm', async ({ page }) => {
  await boot(page); const S = await stand(page);
  expect(Math.round(S.pers)).toBe(150);
  expect(Math.round(S.spend - S.norm)).toBeGreaterThanOrEqual(150);
  expect(await page.evaluate(() => buitenUitgave('persoonlijk'))).toBe(true);
});

test('b: Inzichten en Grip tonen hetzelfde uitgaventotaal, zonder de persoonlijke overboeking', async ({ page }) => {
  await boot(page); const S = await stand(page);
  expect(S.ins).toBe(S.grip); expect(S.grip).toBe(Math.round(S.norm));
  expect(S.gripP).toBe(S.gripSom);   // de uitkomst op Grip trekt hem niet nog eens af
  await naarIns(page);
  await expect(page.locator('#insMaand')).toHaveAttribute('data-insuit', String(S.grip));
  // de boeking staat niet in "zonder potje"
  const z = await page.evaluate(() => insMaandStand().zTx.map(t => t.name));
  expect(z).not.toContain('Tikkie Dirk');
});

test('c: de grijze regel en de sheet tellen op tot hetzelfde bedrag', async ({ page }) => {
  await boot(page); await naarIns(page);
  const r = page.locator('#insMaand [data-inspers]');
  await expect(r).toHaveAttribute('data-inspers', '150');
  await expect(r).toContainText('€150 persoonlijke overboekingen · niet in je budget ›');
  await r.click();
  await expect(page.locator('#insPersSheet')).toContainText('Tikkie Dirk');
  const som = await page.$$eval('#insPersSheet [data-persrij]', e => e.reduce((a, x) => a + (+x.dataset.persrij), 0));
  expect(Math.round(som)).toBe(150);
  await expect(page.locator('#insPersSheet [data-perscat]')).toHaveCount(1);
});

test('d: een categorie geven laat hem meetellen, op beide schermen', async ({ page }) => {
  await boot(page); const S0 = await stand(page); await naarIns(page);
  await page.locator('#insMaand [data-inspers]').click();
  await page.locator('#insPersSheet [data-perscat]').first().click();
  await page.locator('.catpick', { hasText: 'Uit eten' }).first().click();
  const S1 = await stand(page);
  expect(S1.grip - S0.grip).toBe(150); expect(S1.ins - S0.ins).toBe(150); expect(S1.ins).toBe(S1.grip);
  expect(Math.round(S1.pers)).toBe(0);
  await naarIns(page);
  await expect(page.locator('#insMaand [data-inspers]')).toHaveCount(0);
});

test('e: met een potje is het geen persoonlijke overboeking buiten de uitgaven', async ({ page }) => {
  await boot(page); const S0 = await stand(page);
  const S1 = await page.evaluate(() => { SET.budgets.persoonlijk = 200; save(); const T = totals(thisYM()); return { b: buitenUitgave('persoonlijk'), pers: T.persoonlijk, grip: maandVooruit().uit, ins: insMaandStand().uit }; });
  expect(S1.b).toBe(false); expect(S1.pers).toBe(0);
  expect(S1.grip - S0.grip).toBe(150); expect(S1.ins).toBe(S1.grip);
});

test('f: weekbedrag, trap-tempo en vast lezen dezelfde regel', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const t = TX.find(x => x.name === 'Tikkie Dirk');
    const L = { fixDue: 200, fixDueItems: [{ cat: 'persoonlijk', amount: 200, name: 'Tikkie Maandelijks', day: 28 }] };
    const SP = maandSplitsing(thisYM(), L);
    return { soort: insTxSoort(t), week: weekTelt(t, {}), uitOpen: SP.uitOpen, vast: SP.vastePotjes.some(x => x.k === 'persoonlijk') }; });
  expect(r.soort).toBe(null); expect(r.week).toBe(false);
  expect(r.uitOpen).toBe(200); expect(r.vast).toBe(false);
});

test('g: met de grijze regel past Inzichten nog op 390x844 boven de menubalk', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page); await naarIns(page);
  await expect(page.locator('#insMaand [data-inspers]')).toHaveCount(1);
  const r = await page.evaluate(() => {
    const nav = document.querySelector('.nav').getBoundingClientRect(), scr = document.getElementById('s-ins');
    let onder = 0; for (const el of scr.querySelectorAll('*')) { const b = el.getBoundingClientRect(); if (b.height > 0 && b.width > 0) onder = Math.max(onder, b.bottom + scrollY); }
    const regel = document.querySelector('#insMaand [data-inspers]').getBoundingClientRect();
    return { onder, navH: nav.height, h: innerHeight, regelH: regel.height, sw: document.documentElement.scrollWidth };
  });
  console.log('fit', JSON.stringify(r));
  expect(r.regelH).toBeLessThan(25);   // een regel
  expect(r.onder).toBeLessThanOrEqual(r.h - r.navH);
  expect(r.sw).toBeLessThanOrEqual(390);
});
