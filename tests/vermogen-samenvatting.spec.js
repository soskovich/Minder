// v95: Vermogen opent met één regel gewone taal — dezelfde getallen als de kaart eronder,
// geen nieuw model. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

function tweak(fn) {
  const p = seed(); const set = JSON.parse(p.minder_set); const own = JSON.parse(p.minder_own);
  fn(set, own); p.minder_set = JSON.stringify(set); p.minder_own = JSON.stringify(own); return p;
}
async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('vermogen'));
  await page.waitForSelector('#s-vermogen .card');
}
const regel = (page) => page.locator('#vermSam').innerText();
/* v350: de zin boven de kaart ("Je netto vermogen is ...", v95) is weg: hij noemde het getal dat de kaart
   eronder groot toont nog een keer. In de kaart staat onder het getal EEN regel context, je grootste schuld en
   wat er is opgebouwd (data-vermctx), uit dezelfde som als de kop van de grafiek. Alleen de regel die om je
   saldo vraagt staat er nog boven, want dan is er geen getal. */
const ctx = (page) => page.locator('[data-vermctx]').innerText();

test.describe('a · de contextregel', () => {
  test('de kaart staat bovenaan, en er staat geen tweede zin met hetzelfde getal boven', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#vermSam')).toHaveCount(0);
    const t = await page.locator('#s-vermogen').innerText();
    expect(t).not.toContain('Je netto vermogen is');
    expect(t).not.toContain('Wat je minder uitgeeft');
  });

  test('de opbouw komt uit dezelfde som als de kop van de grafiek', async ({ page }) => {
    await boot(page);
    const t = await ctx(page);
    const r = await page.evaluate(() => {
      const win = months().slice(-12); let acc = 0;
      for (const mm of win) { const x = totals(mm); acc += ((x.incomeAlles || 0) - (x.spend || 0)); }
      return { mnd: win.length, som: Math.round(acc), kop: document.querySelector('[data-opbouwkop]').textContent };
    });
    expect(r.kop.replace(/^[+-]/, '')).toBe(await page.evaluate((n) => euro0(Math.abs(n)), r.som));
    expect(t).toContain(`in ${r.mnd} maanden`);
    expect(t).toContain(await page.evaluate((n) => euro0(Math.abs(n)), r.som));
  });

  test('een dalend vermogen heet afgenomen, zonder oordeel', async ({ page }) => {
    const p = seed(); const tx = JSON.parse(p.minder_tx);
    const cur = new Date(); const ym = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0');
    tx.push({ id: 'groot', date: `${ym}-11`, amount: -90000, acc: 'NL01MAIN0000001111', name: 'Verbouwing', desc: 'BEA, BETAALPAS VERBOUWING', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    p.minder_tx = JSON.stringify(tx);
    await boot(page, p);
    const t = await ctx(page);
    expect(t).toMatch(/€[\d.]+ afgenomen in \d+ maanden/);
    expect(t).not.toContain('opgebouwd');
  });
});

test.describe('b · randgevallen', () => {
  test('zonder bekend saldo zegt hij dat eerlijk, met een ingang', async ({ page }) => {
    await boot(page, tweak((set) => { set.manualBal = {}; }));
    const t = await regel(page);
    expect(t).toContain('kennen we nog niet');
    expect(t).toContain('Saldo invullen');
    expect(t).not.toMatch(/€0/);                                      // geen stellige nul
    await page.locator('#vermSam span[onclick]').click();
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window._setSub)).toBe('bank');   // v374: de saldo's staan in Bank & rekeningen
  });

  test('met te weinig historie noemt hij geen opbouw', async ({ page }) => {
    const p = seed(); const tx = JSON.parse(p.minder_tx);
    const cur = new Date(); const ym = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0');
    p.minder_tx = JSON.stringify(tx.filter((t) => t.date.startsWith(ym)));
    await boot(page, p);
    const t = await ctx(page);
    expect(t).not.toMatch(/opgebouwd|afgenomen/);
  });

  test('Rustig toont dezelfde regel: hij toont minder, maar rekent niet anders', async ({ page }) => {
    await boot(page);
    const b = await ctx(page);
    await page.evaluate(() => { SET.mode = 'rustig'; save(); renderVermogen(); });
    expect(await ctx(page)).toBe(b);
  });
});

test('c · de modellen zijn niet aangeraakt', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const w = netWorth();
    return { netto: w.netto, bez: w.bez, sch: w.sch, kaart: document.querySelector('#s-vermogen .card').innerText };
  });
  expect(r.kaart).toContain('Netto vermogen');
  expect(r.kaart).toContain(await page.evaluate((n) => euro0(n), r.netto));
  expect(r.netto).toBe(r.bez - r.sch);                                // invariant onveranderd
});
