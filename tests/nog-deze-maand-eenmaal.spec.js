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
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof nogDezeMaandBody === 'function');
  await page.evaluate((s) => go(s), scherm);
}

test.describe('a · Vooruitblik toont de kaart niet meer', () => {
  test('geen kop, geen tegels, geen "Deze maand op eigen kracht"', async ({ page }) => {
    await boot(page, 'vooruit');
    // de tegels hebben wel degelijk inhoud: dit is een keuze, geen lege staat
    expect(await page.evaluate(() => nogDezeMaandBody())).not.toBe('');
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).not.toMatch(/nog deze maand/i);
    expect(v).not.toMatch(/deze maand op eigen kracht/i);
    expect(await page.locator('#s-vooruit .wvo-tiles, #s-vooruit .ndm-net').count()).toBe(0);
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

test.describe('b · Inzichten is de enige lezer', () => {
  test('de herokaart draagt de tegels, precies één keer', async ({ page }) => {
    await boot(page, 'ins');
    const el = page.locator('#s-ins');
    const t = await el.innerText();
    expect((t.match(/NOG DEZE MAAND/g) || []).length).toBe(1);
    expect(t).toMatch(/Deze maand op eigen kracht/);
    // de tegels zitten in de herokaart zelf, niet in een losse kaart eronder
    expect(await el.locator('.card').first().locator('.ndm-net').count()).toBe(1);
  });

  test('openFixedDue blijft bereikbaar vanuit die kaart', async ({ page }) => {
    await boot(page, 'ins');
    const tegel = page.locator('#s-ins .wvo-tile[onclick*="openFixedDue"]');
    await expect(tegel).toHaveCount(1);
  });
});

// de vorm van body en omhulsel wordt bewaakt in inzichten-herschikking.spec.js (v135);
// hier gaat het alleen om wie ze nog aanroept.
test.describe('c · de functies zijn niet aangeraakt', () => {
  test('renderVooruit roept nogDezeMaand niet meer aan', async ({ page }) => {
    await boot(page, 'vooruit');
    expect(await page.evaluate(() => /nogDezeMaand/.test(renderVooruit.toString()))).toBe(false);
    // het omhulsel blijft de terugval van renderIns als er geen budget is
    expect(await page.evaluate(() => /nogDezeMaandCard\(\)/.test(renderIns.toString()))).toBe(true);
  });
});

test.describe('d · zonder budget valt Inzichten terug op de losse kaart', () => {
  test('de kaart staat er één keer, onder de budget-prompt', async ({ page }) => {
    await boot(page, 'ins', seed({ income: 0, budgets: {} }));
    const t = await page.locator('#s-ins').innerText();
    expect((t.match(/NOG DEZE MAAND/g) || []).length).toBe(1);
    expect(await page.evaluate(() => insHeroKaart(curMonth || months()[months().length - 1]))).toBe('');
  });
});
