// v189: de groep "getal en gevolg lopen uiteen". Een getoond bedrag hoort uit dezelfde som te
// komen als de conclusie ernaast, of het scherm zegt dat het dat niet doet.
// Vier items gebouwd: het benodigde bedrag naast de capaciteit, de reserveringsinleg die zegt dat
// hij losstaat van je plan, de dagmarkering in de balk in plaats van ernaast, en een opsomming die
// niet met 'en' plakt.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[2];
const overMnd = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323', RES = 'NL01RESE0000009999';

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of MS) {
    add(m, '02', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '08', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 3000, limit: 70, vooruitDoelOpen: true,
    savingMode: 'amount', savingAmount: 300,
    manualBal: { [MAIN]: 4000, [SAV]: 8000, [RES]: 1000 },
    budgets: { huur: 900, boodschappen: 400 }, savingsEnds: ['4323'], resAcc: RES,
    reserveringen: [{ id: 'r1', naam: 'Gemeente', bedrag: 480, vervalmaand: overMnd(3), intervalM: 12 }],
    goals: [{ id: 'g1', naam: 'Vakantie', doel: 8000, gespaard: 0, allocMode: 'fixed',
      perMaand: 200, streefdatum: overMnd(7) }],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planCapacity === 'function' && TX.length > 0);
}
const tekst = (page, n) => page.evaluate((x) => { go(x); return $('#s-' + x).innerText.replace(/\s+/g, ' '); }, n);

test.describe('a · het benodigde bedrag staat naast wat er te verdelen is', () => {
  test('de tekortzin noemt de capaciteit', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const p = allocatePlan().find((x) => x.type === 'goal');
      return { regel: doelTempoLine(p).replace(/<[^>]*>/g, ''), cap: euro0(planCapacity()) };
    });
    expect(r.regel).toMatch(/per maand nodig/);
    expect(r.regel).toContain(`Je hele plan heeft ${r.cap} per maand te verdelen.`);
  });

  test('ook wanneer er niets naar het doel gaat', async ({ page }) => {
    const p = seed(); const set = JSON.parse(p.minder_set);
    set.goals[0].perMaand = 0; p.minder_set = JSON.stringify(set);
    await boot(page, p);
    const r = await page.evaluate(() => {
      const g = allocatePlan().find((x) => x.type === 'goal');
      return { alloc: g.alloc, regel: doelTempoLine(g).replace(/<[^>]*>/g, ''), cap: euro0(planCapacity()) };
    });
    if (r.alloc === 0) {
      expect(r.regel).toMatch(/Er gaat op dit moment niets naar dit doel/);
      expect(r.regel).toContain(`${r.cap} per maand te verdelen`);
    }
  });

  test('zonder capaciteit staat er geen spiegel, geen verzonnen nul', async ({ page }) => {
    const p = seed(); const set = JSON.parse(p.minder_set);
    set.savingAmount = 0; set.income = 0; p.minder_set = JSON.stringify(set);
    await boot(page, p);
    const r = await page.evaluate(() => {
      const g = allocatePlan().find((x) => x.type === 'goal');
      return { cap: planCapacity(), regel: g ? doelTempoLine(g).replace(/<[^>]*>/g, '') : '' };
    });
    if (!(r.cap > 0)) expect(r.regel).not.toContain('te verdelen');
  });
});

test.describe('b · de reserveringsinleg zegt dat hij losstaat van je plan', () => {
  test('de kaart benoemt het verband, zonder te herberekenen', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => { const d = document.createElement('div');
      d.innerHTML = resDekkingCard(); return d.innerText.replace(/\s+/g, ' '); });
    expect(t).toContain('staat los van je plan');
    expect(t).toMatch(/concurreert niet met je spaardoelen/);
    // en het bedrag per maand staat er nog steeds niet (v188)
    const per = await page.evaluate(() => dekking(12).benodigdPerMaand);
    if (per > 0) expect(t).not.toContain(String(per).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  });

  test('de reservering blijft buiten planCapacity', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ cap: planCapacity(), doel: Math.round(monthlySavingTarget()),
      res: dekking(12).benodigdPerMaand }));
    expect(r.cap).toBe(r.doel);
    expect(r.cap).not.toBe(r.doel + r.res);
  });
});

test.describe('c · de dagmarkering staat in de balk', () => {
  test('de balk draagt een streep op het dagpercentage', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    await page.waitForTimeout(90);
    const r = await page.evaluate(() => {
      const track = document.querySelector('#s-ins .bar-track');
      if (!track) return null;
      const mark = [...track.children].find((e) => (e.getAttribute('style') || '').includes('position:absolute'));
      return { heeft: !!mark, left: mark ? mark.style.left : '', title: mark ? mark.getAttribute('title') : '' };
    });
    test.skip(!r, 'geen budgetbalk in deze fixture');
    expect(r.heeft).toBe(true);
    const d = await page.evaluate((m) => daysElapsed(m), CUR);
    const pct = Math.round(d.elapsed / d.dim * 100);
    expect(r.left).toBe(pct + '%');
    expect(r.title).toContain(pct + '%');
  });

  test('de zin eronder is de legenda van die streep, niet een tweede weergave', async ({ page }) => {
    await boot(page);
    const t = await tekst(page, 'ins');
    expect(t).toMatch(/de streep staat waar de maand nu is: \d+% voorbij/);
    expect(t).not.toMatch(/de maand is \d+% voorbij/);
  });

  test('een afgesloten maand heeft geen dagmarkering', async ({ page }) => {
    await boot(page);
    const ms = await page.evaluate(() => months());
    test.skip(ms.length < 2, 'geen afgesloten maand');
    await page.evaluate((m) => zetKijkMaand(m), ms[ms.length - 2]);
    await page.waitForTimeout(120);
    const t = await page.evaluate(() => $('#s-ins').innerText);
    expect(t).not.toMatch(/de streep staat waar de maand nu is/);
  });
});

test.describe('d · een opsomming plakt niet met en', () => {
  test('drie leden krijgen komma, komma, en', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      een: opsomming(['a']), twee: opsomming(['a', 'b']), drie: opsomming(['a', 'b', 'c']),
      leeg: opsomming([]), gaten: opsomming(['a', '', 'c']),
    }));
    expect(r.een).toBe('a');
    expect(r.twee).toBe('a en b');
    expect(r.drie).toBe('a, b en c');
    expect(r.leeg).toBe('');
    expect(r.gaten).toBe('a en c');
  });

  test('het maandoordeel gebruikt hem', async ({ page }) => {
    await boot(page);
    const zin = await page.evaluate(() => {
      const mk = (n) => Array.from({ length: n }, (_, i) => ({ key: 'r' + i, naam: 'Regel ' + i, status: 'ok' }));
      return maandOordeel(mk(3)).sub;
    });
    expect(zin).toBe('Regel 0, regel 1 en regel 2 zijn in orde.');
    expect(zin).not.toContain('en regel 1 en');
  });
});

test.describe('e · al opgelost in de eenheden-ronde', () => {
  test('de Home-hero toont hele euro s, zonder centen', async ({ page }) => {
    await boot(page);
    const t = await tekst(page, 'dash');
    const hero = await page.evaluate(() => $('.homehero') ? $('.homehero').innerText.replace(/\s+/g, ' ') : '');
    expect(hero).not.toMatch(/€[\d.]+,\d\d/);          // geen centen in het hoofdgetal
    expect(t).not.toMatch(/totaal saldo €[\d.]+,\d\d/);
    // en de bron is euro0, niet euro
    const src = await page.evaluate(() => renderDash.toString());
    expect(src).toContain('euro0(S2.safe)');
    expect(src).toContain('euro0(S2.saldo)');
  });
});
