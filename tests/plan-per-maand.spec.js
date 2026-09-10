// v218: Plan verdeelt planCapacity(), en dat is monthlySavingTarget(): je ingestelde maandbedrag.
// Er zit geen fout in die verdeling - het scherm rekent overal in maandtempo (de kop zegt '/mnd',
// de vrij-regel zegt '/mnd', en de eta is ceil(rest/alloc), een tempo in volle maanden). Wat
// ontbrak was het verband: niets zei dat dit over een hele maand gaat terwijl Home over het restant
// van deze maand gaat, en dan lezen '€166/mnd nog vrij' en 'nog €1.044 te sparen deze maand' als
// hetzelfde getal.
// Deze spec bewaakt drie dingen: dat de verdeling ongevoelig blijft voor waar je in de maand staat
// (dat is de bedoeling, niet de fout), dat de regel het verband legt zonder een nieuw getal te
// verzinnen, en dat hij zwijgt waar hij niets toevoegt.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

// maandbedrag 3000, deze maand al 1956 gespaard, dus nog 1044 te gaan
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '03', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  add('s' + M2, SPAAR, M2, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  add('s' + M1, SPAAR, M1, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  const al = o.alGespaard != null ? o.alGespaard : 1956;
  if (al > 0) add('s' + CUR, SPAAR, CUR, '04', al, 'Spaarpot', 'NAAR SPAREN');
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: o.mode || 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000, [SPAAR]: 9000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 3000,
    savingsAcc: { [SPAAR]: true },
    nfDoelVast: 40000, nfToegewezen: 9000, nfToegewezenMigrated: true,
    goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 30000, gespaard: 0, allocMode: 'fixed', perMaand: 166 }],
    planAlloc: { noodfonds: { allocMode: 'auto' } },
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof planMaandRegel === 'function');
}
const regel = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = planMaandRegel();
  return d.textContent.replace(/\s+/g, ' ').trim();
});
const cijfers = (page) => page.evaluate(() => {
  const S = safeToSpend();
  return { cap: planCapacity(), tgt: S.saveTarget, al: S.savedThisMonth, nog: S.saveReserved,
    alloc: allocatePlan().map((p) => ({ naam: p.naam, alloc: p.alloc, eta: p.eta })) };
});

test.describe('a - de verdeling is een maandtempo, en dat blijft zo', () => {
  test('allocatePlan geeft hetzelfde, of je nu wel of niet al gespaard hebt', async ({ page }) => {
    await boot(page);
    const halverwege = await cijfers(page);
    await boot(page, { alGespaard: 0 });
    const begin = await cijfers(page);
    expect(halverwege.cap).toBe(begin.cap);
    expect(halverwege.alloc).toEqual(begin.alloc);
    // en de twee kanten van de maand zijn wél verschillend, dus de test meet echt iets
    expect(halverwege.al).toBe(1956);
    expect(begin.al).toBe(0);
  });

  test('de kop spreekt in maandtempo', async ({ page }) => {
    await boot(page);
    // op de tekst en niet op de HTML: het bedrag staat in een <b>, dus '/mnd te verdelen' is
    // in de broncode onderbroken terwijl de lezer één zin ziet
    const t = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = renderPlan(true);
      return d.textContent.replace(/\s+/g, ' ');
    });
    expect(t).toContain('€3.000/mnd te verdelen');
  });

  test('de eta is een tempo in volle maanden, niet het restant van deze maand', async ({ page }) => {
    await boot(page);
    const p = await page.evaluate(() => allocatePlan().find((x) => x.type === 'noodfonds'));
    expect(p.eta).toBe(Math.ceil(p.rest / p.alloc));
  });
});

test.describe('b - de regel legt het verband, zonder nieuw getal', () => {
  test('hij noemt wat er al binnen is en wat er nog bij komt', async ({ page }) => {
    await boot(page);
    const t = await regel(page);
    expect(t).toContain('per maand');
    expect(t).toContain('€1.956');
    expect(t).toContain('€1.044');
  });

  test('die twee bedragen komen uit safeToSpend, dezelfde bron als Home', async ({ page }) => {
    await boot(page);
    const c = await cijfers(page);
    const t = await regel(page);
    expect(t).toContain(await page.evaluate((n) => euro0(n), c.al));
    expect(t).toContain(await page.evaluate((n) => euro0(n), c.nog));
    expect(c.al + c.nog).toBe(c.tgt);
  });

  test('en hij staat op het scherm zelf', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('vooruit'));
    const t = await page.locator('#s-vooruit').innerText();
    expect(t).toContain('verdeling per maand');
  });
});

test.describe('c - hij zwijgt waar hij niets toevoegt', () => {
  test('geen regel als er deze maand nog niets is gespaard', async ({ page }) => {
    await boot(page, { alGespaard: 0 });
    expect(await regel(page)).toBe('');
  });

  /* Zonder maandbedrag zwijgt de regel. Dat dekt meteen de terugval van planCapacity() (v190):
     die treedt per definitie op wanneer monthlySavingTarget() nul is, en dan is saveTarget ook
     nul. Een eigen guard daarvoor zou een conditie zijn die nooit als enige beslist. */
  test('geen regel zonder maandbedrag, en dat dekt ook de terugval van planCapacity', async ({ page }) => {
    await boot(page, { set: { savingMode: 'amount', savingAmount: 0 } });
    const c = await page.evaluate(() => ({ mst: Math.round(monthlySavingTarget() || 0), tgt: safeToSpend().saveTarget }));
    expect(c.mst).toBe(0);
    expect(c.tgt).toBe(0);
    expect(await regel(page)).toBe('');
  });

  test('is je maandbedrag deze maand al binnen, dan zegt hij dat in plaats van een restant', async ({ page }) => {
    await boot(page, { alGespaard: 3000 });
    const t = await regel(page);
    expect(t).toContain('al binnengekomen');
    expect(t).not.toContain('er komt nog');
  });

  test('in rustig staat er een korte vorm', async ({ page }) => {
    await boot(page, { mode: 'rustig' });
    const t = await regel(page);
    expect(t).toContain('Per maand');
    expect(t).toContain('€1.044');
    expect(t.length).toBeLessThan(60);
  });
});

test.describe('d - een observatie, geen aandacht en geen verzonnen keuze', () => {
  test('mut en niet amber', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => planMaandRegel());
    expect(h).toContain('mut2');
    expect(h).not.toContain('--amber');
  });

  test('er staat geen keuze in die nergens heen leidt', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => planMaandRegel());
    expect(h).not.toContain('onclick');
    expect(h).not.toContain('›');
  });
});

test.describe('e - layout', () => {
  for (const w of [360, 390]) {
    test(`Plan past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      await page.evaluate(() => go('vooruit'));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
