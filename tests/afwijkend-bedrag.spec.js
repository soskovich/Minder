// v94: de "ongewoon"-vlag in de transactielijst heet nu "afwijkend bedrag", staat neutraal
// en legt zichzelf uit. De detectie (txOutlier) is onveranderd.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, MAIN } = require('./budget-fixture');

// De fixture heeft drie keer Albert Heijn (400 · 400 · 300), dus een eigen mediaan van 400.
// Eén boodschappenrun van 900 ligt daar ruim boven -> de vlag hoort te verschijnen.
function seedPiek() {
  const p = seed(); const tx = JSON.parse(p.minder_tx);
  tx.push({ id: 'piek', date: `${CUR}-12`, amount: -900, acc: MAIN, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  p.minder_tx = JSON.stringify(tx); return p;
}
async function boot(page) {
  await open(page, seedPiek());
  await page.evaluate(() => { go('tx'); setTxPeriod('all'); });
  await page.waitForSelector('#txlist .tx');
}
const piekRij = async (page) => {
  const id = await page.evaluate(() => (TX.find((t) => t.name === 'Albert Heijn' && t.amount === -900) || {}).id);
  return page.locator(`#txlist .tx[onclick="openSheet('${id}')"]`);
};

test.describe('a · de vlag', () => {
  test('heet "afwijkend bedrag" en niet meer "ongewoon"', async ({ page }) => {
    await boot(page);
    const rij = await piekRij(page);
    const txt = await rij.innerText();
    expect(txt).toContain('afwijkend bedrag');
    expect(txt.toLowerCase()).not.toContain('ongewoon');
    expect(await page.locator('#txlist').innerText()).not.toMatch(/ongewoon/i);
  });

  test('staat neutraal, niet in amber', async ({ page }) => {
    await boot(page);
    const rij = await piekRij(page);
    const vlag = rij.locator('.cat').first();
    const kleur = await vlag.evaluate((e) => e.style.color);
    expect(kleur).toBe('var(--mut)');
    expect(await rij.innerHTML()).not.toMatch(/var\(--amber\)|#fbbf24|#f5b544/);
  });

  test('legt zichzelf uit zonder de transactie te openen', async ({ page }) => {
    await boot(page);
    const rij = await piekRij(page);
    await rij.locator('.jrg').click();
    await page.waitForSelector('#tipPop.show');
    const tip = await page.locator('#tipPop').innerText();
    expect(tip).toContain('gebruikelijke bedrag bij deze winkel');
    expect(tip).toContain('geen oordeel');
    expect(await page.locator('#sheetBg.show').count()).toBe(0);      // de transactie-sheet blijft dicht
  });

  test('een tik op de rij zelf opent nog gewoon de transactie', async ({ page }) => {
    await boot(page);
    const rij = await piekRij(page);
    await rij.locator('.nm').click();
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toContain('Albert Heijn');
  });
});

test.describe('b · de detectie is onveranderd', () => {
  test('dezelfde transacties worden gevlagd als voorheen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const all = txForPeriod(); const sum = {}, cnt = {};
      for (const x of all) { const k = catOf(x); if (CATS[k] && CATS[k].type === 'expense') { sum[k] = (sum[k] || 0) + (-x.amount); if (x.amount < 0) cnt[k] = (cnt[k] || 0) + 1; } }
      const catAvg = {}; for (const k in sum) if (cnt[k]) catAvg[k] = sum[k] / cnt[k];
      const piek = TX.find((t) => t.name === 'Albert Heijn' && t.amount === -900);
      const vast = all.filter((t) => t.amount < 0 && CATS[catOf(t)].type === 'expense' && isFixed(t));
      return {
        piek: txOutlier(piek, catAvg),
        vastGevlagd: vast.filter((t) => txOutlier(t, catAvg)).length,
        gevlagd: all.filter((t) => txOutlier(t, catAvg)).length,
      };
    }, CUR);
    expect(r.piek).toBe(true);
    expect(r.vastGevlagd).toBe(0);                                     // v86-regel blijft
    expect(r.gevlagd).toBe(1);
  });

  test('de bijbehorende melding klinkt ook neutraler', async ({ page }) => {
    await boot(page);
    const n = await page.evaluate(() => scoreNotifs().filter((x) => x.key.startsWith('big-')));
    if (n.length) {
      expect(n[0].l1.toLowerCase()).not.toContain('ongewoon');
      expect(n[0].l1).toContain('hoger dan je gebruikelijk');
    }
    expect(await page.evaluate(() => scoreNotifs().every((x) => !/ongewoon/i.test(x.l1)))).toBe(true);
  });
});
