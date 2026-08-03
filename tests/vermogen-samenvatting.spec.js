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

test.describe('a · de samenvatting', () => {
  test('staat bovenaan en noemt het netto vermogen uit netWorth()', async ({ page }) => {
    await boot(page);
    await expect(page.locator('#vermSam')).toHaveCount(1);
    const r = await page.evaluate(() => {
      const el = document.getElementById('vermSam'), kaart = document.querySelector('#s-vermogen .card');
      return { boven: el.getBoundingClientRect().top < kaart.getBoundingClientRect().top, netto: netWorth().netto };
    });
    expect(r.boven).toBe(true);
    const t = await regel(page);
    expect(t).toContain('Je netto vermogen is');
    expect(t).toContain(await page.evaluate((n) => euro0(n), r.netto));
  });

  test('de opbouw komt uit dezelfde reeks als de grafiek eronder', async ({ page }) => {
    await boot(page);
    const t = await regel(page);
    const kaart = await page.locator('#s-vermogen .card').first().innerText();
    const delta = (kaart.match(/Opbouw · (\d+) mnd\s*\n?\s*([+-]?€[\d.]+)/) || []);
    expect(delta.length).toBeGreaterThan(0);                          // de kaart toont de opbouw
    expect(t).toContain(`De laatste ${delta[1]} maanden`);
    expect(t).toContain(delta[2].replace(/^[+-]/, ''));               // exact hetzelfde bedrag
    expect(t).toMatch(/gemiddeld zo'n €\d/);
    // het maandgemiddelde is die opbouw gedeeld door de maanden, niets nieuws
    const r = await page.evaluate(() => {
      const win = months().slice(-12); let acc = 0;
      const ser = win.map((mm) => { const x = totals(mm); acc += ((x.income || 0) - (x.spend || 0)); return acc; });
      const d = Math.round(ser[ser.length - 1] - ser[0]);
      return { mnd: win.length, perMnd: euro0(Math.round(Math.abs(d) / win.length)) };
    });
    expect(t).toContain(r.perMnd);
  });

  test('een dalend vermogen wordt eerlijk benoemd', async ({ page }) => {
    // veel hogere uitgaven in de laatste maand -> de reeks daalt
    const p = seed(); const tx = JSON.parse(p.minder_tx);
    const cur = new Date(); const ym = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0');
    tx.push({ id: 'groot', date: `${ym}-11`, amount: -9000, acc: 'NL01MAIN0000001111', name: 'Verbouwing', desc: 'BEA, BETAALPAS VERBOUWING', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    p.minder_tx = JSON.stringify(tx);
    await boot(page, p);
    const t = await regel(page);
    expect(t).toMatch(/ging daar €[\d.]+ vanaf/);
    expect(t).not.toContain('kwam daar');
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
    expect(await page.evaluate(() => window._setSheet)).toBe('income');
  });

  test('met te weinig historie belooft hij niets', async ({ page }) => {
    const p = seed(); const tx = JSON.parse(p.minder_tx);
    const cur = new Date(); const ym = cur.getFullYear() + '-' + String(cur.getMonth() + 1).padStart(2, '0');
    p.minder_tx = JSON.stringify(tx.filter((t) => t.date.startsWith(ym)));
    await boot(page, p);
    const t = await regel(page);
    expect(t).toContain('Je netto vermogen is');
    expect(t).toContain('Na een paar maanden');
    expect(t).not.toContain('De laatste');
  });

  test('Rustig houdt het bij één zin', async ({ page }) => {
    await boot(page, tweak((set) => { set.mode = 'rustig'; }));
    const t = await regel(page);
    expect(t).toContain('Je netto vermogen is');
    expect(t).not.toContain('gemiddeld');
    expect(t.trim()).toMatch(/^Je netto vermogen is -?€[\d.]+\.$/);   // precies één zin (de punt in €6.500 telt niet mee)
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
