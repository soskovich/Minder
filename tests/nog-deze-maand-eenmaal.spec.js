// v144: "Nog deze maand" stond op twee schermen — in de Inzichten-hero (v135) en als bovenste
// kaart op Vooruitblik (v71). Dezelfde tegels op twee plekken laten je niet zien welke je leest,
// en de vraag die ze beantwoorden ("hoe sta ik er halverwege de maand voor") hoort bij de
// budgetstand, niet bij een vooruitblik over maanden. Inzichten is nu de enige lezer.
// Een verplaatsing: nogDezeMaandBody() en nogDezeMaandCard() zijn niet aangeraakt.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { kaalUit } = require('./bron-kaal');

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
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof renderIns === 'function');
  await page.evaluate((s) => go(s), scherm);
}

test.describe('a · Vooruitblik toont de kaart niet meer', () => {
  test('geen kop en geen tegels', async ({ page }) => {
    await boot(page, 'vooruit');
    // de tegels hebben wel degelijk inhoud: dit is een keuze, geen lege staat
    // v382: de tegels zijn weg; wat er nog vast komt staat in de maandkaart (insMaandStand().nogVast) en heeft inhoud
    expect(await page.evaluate(() => insMaandStand().nogVast)).toBeGreaterThan(0);
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).not.toMatch(/nog deze maand/i);
    expect(await page.locator('#s-vooruit .wvo-tiles').count()).toBe(0);
  });

  test('de plan-zone en de dekkingskaart blijven, in die volgorde', async ({ page }) => {
    await boot(page, 'vooruit');
    const idx = await page.evaluate(() => {
      /* v380: de zonebalk (data-zone="vooruitDoelOpen") is vervallen; Plan opent op de kop van het dashboard
         (#planKpi). De eigenschap blijft: het plan staat bovenaan en de voetregel eronder. */
      const kids = [...document.getElementById('s-vooruit').children];
      const plan = kids.findIndex((k) => k.id === 'planKpi');
      return { voor: kids.slice(0, Math.max(plan, 0)).map((k) => k.className + ' ' + (k.id === 'planWacht' ? 'plan-wacht' : '')), plan, zone: document.querySelectorAll('#s-vooruit [data-zone]').length,
               foot: kids.findIndex((k) => k.classList.contains('scr-foot')) };
    });
    expect(idx.zone).toBe(0);
    // v380: voor de kop staan alleen de regels van het plan zelf (planWachtRegel, spaarVrijLine)
    expect(idx.plan).toBeGreaterThanOrEqual(0);
    expect(idx.voor.every((c) => /spaar-vrij|plan-wacht/.test(c))).toBe(true);
    expect(idx.foot).toBeGreaterThan(idx.plan);
  });
});

/* v359: "Nog deze maand" als losse regels is verdwenen. v382: de tegels ook; wat er nog vast komt is het deel "nog te gaan ·
   vast" van de maandkaart ([data-insleg="nogvast"], segment [data-insseg="nogvast"]). Wat deze spec vasthoudt is
   onveranderd: het staat op precies een scherm, en daar precies een keer. */
test.describe('b · Inzichten is de enige lezer', () => {
  test('Inzichten draagt wat er nog vast komt precies één keer, in de maandkaart', async ({ page }) => {
    await boot(page, 'ins');
    const el = page.locator('#s-ins');
    expect(await el.locator('#insMaand[data-insmaand="nu"]').count()).toBe(1);
    /* v443: wat er nog vast komt staat weer in het overzicht onder Nog te gaan ([data-insleg="nogvast"]), een keer, en is de
       forecast van vast min wat er al uit is (insGroepen); de context-regel van v440 ([data-insvastnog]) is weg. */
    expect(await el.locator('[data-insleg="nogvast"]').count()).toBe(1);
    expect(await el.locator('[data-insvastnog]').count()).toBe(0);
    expect(await el.locator('[data-insseg="nogvast"]').count()).toBe(0);
    const v = await page.evaluate(() => ({ leg: +document.querySelector('#s-ins [data-insleg="nogvast"]').dataset.v, bron: insGroepen().vast.nog }));
    expect(v.leg).toBe(v.bron);
    expect(await el.locator('.wvo-tiles').count()).toBe(0);
    expect(await el.locator('#insNogLijst').count()).toBe(0);
  });

  /* v382: de rij "vast" onder Nog te gaan draagt geen tik; de sheet (openInsTegel('vast')) bestaat nog en toont de lijst. */
  test('de sheet vast toont de lijst van wat er nog komt', async ({ page }) => {
    await boot(page, 'ins');
    await page.evaluate(() => openInsTegel('vast'));
    await expect(page.locator('#insTegelSheet[data-instegelsheet="vast"]')).toHaveCount(1);
    expect(await page.locator('#insTegelSheet').innerText()).toContain('Woningcorporatie');
  });
});

test.describe('c · de functies zijn niet aangeraakt', () => {
  test('renderVooruit en renderIns roepen nogDezeMaand niet aan', async ({ page }) => {
    await boot(page, 'vooruit');
    expect(await kaalUit(page, 'renderVooruit')).not.toMatch(/nogDezeMaand/);
    expect(await kaalUit(page, 'renderIns')).not.toMatch(/nogDezeMaand/);
  });
});

/* v382: de tegels zijn weg; zonder budget staat de maandkaart er, met wat er nog vast komt een keer erin. */
test.describe('d · zonder budget staat de maandkaart er ook', () => {
  test('wat er nog vast komt staat er één keer, zonder losse kaart', async ({ page }) => {
    await boot(page, 'ins', seed({ income: 0, budgets: {} }));
    expect(await page.locator('#s-ins [data-insleg="nogvast"]').count()).toBe(1);   // v443: in het overzicht van de maandkaart
    expect(await page.locator('#s-ins .wvo-tiles').count()).toBe(0);
    expect(await page.locator('#s-ins #insMaand').count()).toBe(1);
  });
});
