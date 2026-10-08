// v144: "Nog deze maand" stond op twee schermen — in de Inzichten-hero (v135) en als bovenste
// kaart op Vooruitblik (v71). Dezelfde tegels op twee plekken laten je niet zien welke je leest,
// en de vraag die ze beantwoorden ("hoe sta ik er halverwege de maand voor") hoort bij de
// budgetstand, niet bij een vooruitblik over maanden. Inzichten is nu de enige lezer.
// Een verplaatsing: nogDezeMaandBody() en nogDezeMaandCard() zijn niet aangeraakt.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';

// drie maanden met terugkerende huur en salaris, dus fixDue en incDue lopen door en de tegels
// hebben echt iets te tonen — anders bewijst een afwezige kaart niets.
function seed(set = {}) {
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    if (m !== CUR) add('h' + m, m, '28', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '05', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 300, manualBal: { [MAIN]: 2000 },
      budgets: { boodschappen: 500, huur: 900 },
    }, set)),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, scherm, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof insTegelsNu === 'function');
  await page.evaluate((s) => go(s), scherm);
}

test.describe('a · Vooruitblik toont de kaart niet meer', () => {
  test('geen kop en geen tegels', async ({ page }) => {
    await boot(page, 'vooruit');
    // de tegels hebben wel degelijk inhoud: dit is een keuze, geen lege staat
    // v359: de posten zijn tegels op Inzichten; ze hebben inhoud, dus dit is een keuze en geen lege staat
    expect(await page.evaluate(() => insTegelsNu('alle').map((t) => t.key))).toContain('vast');
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).not.toMatch(/nog deze maand/i);
    expect(await page.locator('#s-vooruit .wvo-tiles').count()).toBe(0);
  });

  test('de plan-zone en de dekkingskaart blijven, in die volgorde', async ({ page }) => {
    await boot(page, 'vooruit');
    const idx = await page.evaluate(() => {
      const kids = [...document.getElementById('s-vooruit').children];
      return { plan: kids.findIndex((k) => k.getAttribute('data-zone') === 'vooruitDoelOpen'),
               foot: kids.findIndex((k) => k.classList.contains('scr-foot')) };
    });
    expect(idx.plan).toBe(0);
    expect(idx.foot).toBeGreaterThan(idx.plan);
  });
});

/* v359: "Nog deze maand" als losse regels is verdwenen; de posten zijn tegels op het dashboard (#insTegels). Wat
   deze spec vasthoudt is onveranderd: ze staan op precies een scherm, en daar precies een keer. */
test.describe('b · Inzichten is de enige lezer', () => {
  test('Inzichten draagt de posten precies één keer, als tegels', async ({ page }) => {
    await boot(page, 'ins');
    const el = page.locator('#s-ins');
    const t = await el.innerText();
    expect((t.match(/Nog te betalen/gi) || []).length).toBe(1);
    expect(await el.locator('#insTegels [data-instegel="vast"]').count()).toBe(1);
    expect(await el.locator('.wvo-tiles').count()).toBe(0);
    expect(await el.locator('#insNogLijst').count()).toBe(0);
  });

  test('de tegel opent de lijst van wat er nog komt', async ({ page }) => {
    await boot(page, 'ins');
    await page.locator('#insTegels [data-instegel="vast"]').click();
    await expect(page.locator('#insTegelSheet[data-instegelsheet="vast"]')).toHaveCount(1);
    expect(await page.locator('#insTegelSheet').innerText()).toContain('Woningcorporatie');
  });
});

test.describe('c · de functies zijn niet aangeraakt', () => {
  test('renderVooruit en renderIns roepen nogDezeMaand niet aan', async ({ page }) => {
    await boot(page, 'vooruit');
    expect(await page.evaluate(() => /nogDezeMaand/.test(renderVooruit.toString()))).toBe(false);
    expect(await page.evaluate(() => /nogDezeMaand/.test(renderIns.toString()))).toBe(false);
  });
});

test.describe('d · zonder budget staan de tegels er ook', () => {
  test('de posten staan er één keer, zonder losse kaart', async ({ page }) => {
    await boot(page, 'ins', seed({ income: 0, budgets: {} }));
    const t = await page.locator('#s-ins').innerText();
    expect((t.match(/Nog te betalen/gi) || []).length).toBe(1);
    expect(await page.locator('#s-ins .wvo-tiles').count()).toBe(0);
    expect(await page.locator('#insTegels').count()).toBe(1);
  });
});
