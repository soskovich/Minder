// v158: vrij besteedbaar per dag. Wat overblijft na vaste lasten, potjes, reserveringen en inleg,
// gedeeld door de resterende dagen. De ruimte komt uit safeToSpend(); er wordt niets opnieuw
// afgeleid. Geen instelling, geen norm, dus geen kleur, geen doel en geen melding.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MS = [3, 2, 1].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const MAIN = 'NL01MAIN0000001111';
const TWEEDE = 'NL01TWEE0000002222';

function seed(o = {}) {
  const tx = [];
  const add = (id, m, day, amount, naam, desc, acc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: acc || MAIN, name: naam, desc, typ: '', ref: '',
      src: 'csv', accName: '', refNums: [] });
  for (const m of MS.concat([CUR])) {
    add('i' + m, m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '05', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  if (o.tweedeRekening) add('t2', CUR, '06', -20, 'Kiosk', 'BEA, BETAALPAS KIOSK', TWEEDE);
  const bal = {};
  if (!o.geenSaldo) bal[MAIN] = o.saldo != null ? o.saldo : 4000;
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: bal, budgets: { boodschappen: 500, huur: 900 },
    savingMode: 'amount', savingAmount: 100,
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof vrijPerDag === 'function');
}
const V = (page) => page.evaluate(() => vrijPerDag());
const regel = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = vrijPerDagLine();
  return d.textContent.replace(/\s+/g, ' ').trim();
});

test.describe('a · de berekening', () => {
  test('de ruimte komt uit safeToSpend, niet uit een eigen afleiding', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ v: vrijPerDag(), safe: Math.round(safeToSpend().safe) }));
    expect(r.v.ruimte).toBe(r.safe);
    const src = await page.evaluate(() => vrijPerDag.toString());
    expect(src).toContain('safeToSpend()');
    expect(src).not.toMatch(/fixDue|potjeRest|monthLiquidity|varPlan/);   // geen tweede berekening
  });

  test('perDag is de ruimte gedeeld door de resterende dagen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const de = daysElapsed(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0'));
      return { v: vrijPerDag(), dim: de.dim, elapsed: de.elapsed };
    });
    expect(r.v.dagenResterend).toBe(Math.max(r.dim - r.elapsed, 1));
    expect(r.v.perDag).toBe(Math.round(r.v.ruimte / r.v.dagenResterend));
  });

  test('de laatste dag van de maand geeft geen deling door nul', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const orig = window.daysElapsed;
      window.daysElapsed = () => ({ dim: 30, elapsed: 30, today: 30 });
      const v = vrijPerDag();
      window.daysElapsed = orig;
      return v;
    });
    expect(r.dagenResterend).toBe(1);
    expect(Number.isFinite(r.perDag)).toBe(true);
    expect(r.perDag).toBe(r.ruimte > 0 ? r.ruimte : 0);
  });

  test('kijken verandert niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => { vrijPerDag(); vrijPerDagLine(); });
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });
});

test.describe('b · de regel', () => {
  test('halverwege de maand: dagen en bedrag per dag', async ({ page }) => {
    await boot(page);
    const v = await V(page);
    test.skip(!(v.ruimte > 0), 'deze fixture heeft deze maand geen positieve ruimte');
    const t = await regel(page);
    expect(t).toContain(`Nog ${v.dagenResterend}`);
    expect(t).toMatch(/per dag/);
    expect(t).toContain(String(v.perDag.toLocaleString('nl-NL')));
  });

  test('negatieve ruimte: geen negatief dagbedrag', async ({ page }) => {
    await boot(page, seed({ saldo: 100 }));           // te weinig saldo voor de resterende lasten
    const v = await V(page);
    expect(v.ruimte).toBeLessThan(0);
    expect(v.perDag).toBe(0);
    const t = await regel(page);
    expect(t).toMatch(/ruimte voor deze maand is op/i);
    expect(t).not.toMatch(/per dag/);
    expect(t).not.toMatch(/-€|−€/);
  });

  test('ontbrekend saldo: geen regel, geen schatting', async ({ page }) => {
    await boot(page, seed({ geenSaldo: true }));
    const v = await V(page);
    expect(v.volledig).toBe(false);
    expect(await regel(page)).toBe('');
  });

  test('een van twee saldi onbekend telt ook als onvolledig', async ({ page }) => {
    await boot(page, seed({ tweedeRekening: true }));   // tweede rekening zonder saldo
    const r = await page.evaluate(() => ({ missing: safeToSpend().missing, known: safeToSpend().known, v: vrijPerDag() }));
    expect(r.missing).toBeGreaterThan(0);
    expect(r.v.volledig).toBe(false);
    expect(await regel(page)).toBe('');
  });

  test('geen norm: geen kleur, geen doel, geen streak', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => vrijPerDagLine());
    expect(h).not.toMatch(/--green|--amber|--red/);
    expect(h).not.toMatch(/doel|target|streak|op koers|gehaald/i);
  });

  test('de regel staat bij het bestaande veilig-te-besteden-getal', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('dash'));
    const hero = await page.locator('#s-dash .homehero').first().innerText();
    const t = await regel(page);
    if (t) expect(hero).toContain(t);
    expect(await page.locator('#s-dash .homehero').count()).toBe(1);   // geen eigen kaart erbij
  });
});

test.describe('c · er is geen instelling voor', () => {
  test('vrijPerDag leest geen eigen maandbedrag uit SET', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => vrijPerDag.toString() + vrijPerDagLine.toString());
    expect(src).not.toMatch(/SET\.(vrijPerDag|vrijBudget|dagBudget|dailyVarBudget)/);
  });

  test('het oude dagbedrag-scherm is weg', async ({ page }) => {
    await boot(page);
    for (const fn of ['renderDailyVar', 'dailyVarSeries', 'dagTarget', 'dagGevoeligheid', 'dagVarBlok']) {
      expect(await page.evaluate((f) => typeof window[f], fn)).toBe('undefined');
    }
    await page.evaluate(() => go('ins'));
    expect(await page.locator('#s-ins').innerText()).not.toMatch(/variabele uitgave per dag/i);
  });
});
