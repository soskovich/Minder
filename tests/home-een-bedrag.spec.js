// v171: Home toonde hetzelfde bedrag drie keer. "totaal saldo €2.700,00" in de hero, "Netto
// vermogen €2.700" vijftien pixels eronder, en in Expert nog een keer "saldo €2.700,00" in de
// voetregel. De eerste en de derde kwamen letterlijk uit dezelfde bron; de tweede is een ander
// getal dat er alleen gelijk aan lijkt zolang bezittingen, schulden en uitgeleend geld leeg zijn.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const CUR = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

function seed(o = {}) {
  const tx = [
    { id: 'i1', date: `${CUR}-01`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON',
      typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
    { id: 'e1', date: `${CUR}-05`, amount: -412.35, acc: MAIN, name: 'Albert Heijn',
      desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
  ];
  const set = Object.assign({ mode: o.mode || 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 2700 }, budgets: { boodschappen: 500 } }, o.set || {});
  if (o.assets) set.assets = o.assets;
  if (o.debts) set.debts = o.debts;
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderDash === 'function');
  await page.evaluate(() => go('dash'));
  await page.waitForTimeout(120);
}
const home = (page) => page.evaluate(() => $('#s-dash').innerText.replace(/\s+/g, ' '));

test.describe('a · één bedrag per vraag', () => {
  test('het saldo staat één keer op Home, ook in Expert', async ({ page }) => {
    for (const mode of ['rustig', 'begeleid', 'expert']) {
      await boot(page, seed({ mode }));
      const t = await home(page);
      const treffers = (t.match(/€2\.700/g) || []).length;
      expect(treffers, mode).toBe(1);
    }
  });

  test('netto vermogen staat niet meer op Home', async ({ page }) => {
    await boot(page);
    const t = await home(page);
    expect(t).not.toMatch(/netto vermogen/i);
    expect(await page.evaluate(() => vermogenCard())).not.toMatch(/netWorth|euro0\(/);
  });

  test('de kaart blijft de ingang, zonder bedrag', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => vermogenCard());
    expect(h).toContain("go('vermogen')");
    expect(h).toContain('Bezittingen &amp; schulden');
    expect(h).not.toMatch(/€/);                       // geen enkel bedrag
    const d = await page.evaluate((x) => { const e = document.createElement('div');
      e.innerHTML = x; return e.innerText.replace(/\s+/g, ' '); }, h);
    expect(d).toContain('nog niets ingevuld');
  });

  test('met bezittingen en schulden zegt de kaart hoeveel er staan', async ({ page }) => {
    await boot(page, seed({ assets: [{ id: 'a1', naam: 'Auto', waarde: 8000 }],
      debts: [{ id: 'd1', naam: 'Lening', rest: 3000 }] }));
    const d = await page.evaluate(() => { const e = document.createElement('div');
      e.innerHTML = vermogenCard(); return e.innerText.replace(/\s+/g, ' '); });
    expect(d).toContain('1 bezitting');
    expect(d).toContain('1 schuld');
    expect(d).not.toMatch(/€/);
    // en het saldo op Home is nog steeds één keer het saldo, niet het vermogen
    const t = await home(page);
    expect((t.match(/€2\.700/g) || []).length).toBe(1);
    expect(t).not.toContain('€7.700');                // netWorth = 2700 + 8000 - 3000
  });

  test('het bedrag zelf staat op het vermogensscherm', async ({ page }) => {
    await boot(page, seed({ assets: [{ id: 'a1', naam: 'Auto', waarde: 8000 }] }));
    await page.evaluate(() => go('vermogen'));
    await page.waitForTimeout(120);
    const t = await page.evaluate(() => $('#s-vermogen').innerText.replace(/\s+/g, ' '));
    expect(t).toMatch(/netto vermogen/i);
    expect(t).toContain('€10.700');
  });
});

test.describe('b · hele euro\'s waar het een samenvatting is', () => {
  test('de hero en de saldo-regel tonen geen centen', async ({ page }) => {
    await boot(page);
    const hero = await page.evaluate(() => $('#s-dash .homehero').innerText.replace(/\s+/g, ' '));
    expect(hero).toContain('totaal saldo €2.700');
    expect(hero).not.toMatch(/€[\d.]+,\d\d/);
  });

  test('de transactielijst houdt zijn centen: exact en waargenomen', async ({ page }) => {
    await boot(page);
    const t = await home(page);
    expect(t).toContain('€412,35');
  });

  test('de saldo-drill-down houdt ook zijn centen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openBalances());
    await page.waitForTimeout(100);
    expect(await page.locator('#sheet').innerText()).toMatch(/€2\.700,00/);
  });
});
