// v228: twee signalen die iets vaststelden zonder dat er iets uit volgde zijn vervallen.
// 1. 'Boven je inkomen-limiet', de rij onder de streep in de maandkaart: je potjes lagen boven de
//    N% van je inkomen die je als grens nam, en de rij zei er zelf bij dat dat mocht. Wie zijn
//    potjes te hoog zet merkt dat aan zijn budget, niet aan dit percentage.
// 2. 'Meer binnen, meer uitgegeven' (key 'inflatie'): vuurde op spWA > spNA * 1.12, een verhouding
//    zonder norm. Meer inkomen met meer uitgaven kan volstrekt gezond zijn.
// Wat blijft: de grens zelf (SET.limit, monthBudget, totals().limit) als meting, de andere
// structurele signalen met hun status, en STRUCT_STATUS met alle drie zijn takken. De info-tak
// houdt een gebruiker: 'rente'. Deze spec meet met echte data waarop beide signalen zouden hebben
// gevuurd, niet met een gepatchte functie.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, LIMIET, POTJES } = require('./budget-fixture');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

/* Zes afgeronde maanden waarvan twee met een meevaller (inkomen 9000 tegen 5000) waarin ook meer
   werd uitgegeven (6100 tegen 4200: ruim boven 4200 * 1.12). Op deze data vuurde 'inflatie'. De
   gewone maanden sparen 800 op een doel van 1500 (onder 70% ervan) en er loopt geen automatische
   inleg, dus 'meevaller' vuurt; en elke maand ligt boven de potjes-som van 3300, dus 'overstreak'
   vuurt. Zo staat vast dat de twee die blijven nog werken op dezelfde data waarop de derde weg is. */
function patroonSeed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (let i = 6; i >= 0; i--) {
    const m = ym(new Date(now.getFullYear(), now.getMonth() - i, 1));
    const windfall = (i === 2 || i === 5);
    add('i' + m, MAIN, m, '05', windfall ? 9000 : 5000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1500, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '06', windfall ? -3200 : -1800, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('v' + m, MAIN, m, '08', windfall ? -1400 : -900, 'Diversen', 'BEA, BETAALPAS DIVERSEN');
  }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: true,   // totals() leest dan het inkomen per maand; met een vast inkomen is er geen meevaller
    manualBal: { [MAIN]: 3000, [SPAAR]: 1400 },
    budgets: { boodschappen: 1800, huur: 1500 },
    savingMode: 'amount', savingAmount: 1500,
    savingsAcc: { [SPAAR]: true },
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function bootPatroon(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, patroonSeed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof scoreNotifs === 'function' && typeof maandStructureel === 'function');
}
const schermTekst = (page, s) => page.evaluate((x) => { go(x); return $('#s-' + x).innerText.replace(/\s+/g, ' '); }, s);
const planTekst = (page) => page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = maandPlanRegels(); return d.innerText.replace(/\s+/g, ' '); });
const bron = (page) => page.evaluate(() => [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n'));

test.describe('1 - Boven je inkomen-limiet is weg', () => {
  test('de fixture ligt nog altijd boven de grens, en de grens is nog een meting', async ({ page }) => {
    await open(page, seed());
    const t = await page.evaluate((m) => totals(m), CUR);
    expect(t.budget).toBe(POTJES);
    expect(t.limit).toBe(LIMIET);
    expect(t.budget).toBeGreaterThan(t.limit);
    expect(await page.evaluate(() => monthBudget(3000))).toBe(LIMIET);
  });

  test('maandPlanRegels rendert de rij niet, ook niet boven de grens', async ({ page }) => {
    await open(page, seed());
    const h = await page.evaluate(() => maandPlanRegels());
    expect(h).not.toContain('inkomen-limiet');
    expect(h).not.toContain('spiegel, geen plafond');
  });

  test('en geen van de schermen draagt hem', async ({ page }) => {
    await open(page, seed());
    for (const s of ['maand', 'ins', 'dash', 'vooruit']) {
      expect(await schermTekst(page, s), s).not.toMatch(/inkomen-limiet/i);
    }
  });

  test('maandPlanRegels houdt één rij over, en die is voorwaardelijk', async ({ page }) => {
    await open(page, seed());                       // budgetsNext wijkt af: de rij staat er
    const met = await planTekst(page);
    expect(met).toContain('Je potjes vanaf volgende maand');
    expect(met).toContain('€2.450');
    const rijen = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = maandPlanRegels(); return d.children.length; });
    expect(rijen).toBe(1);
    // zonder wijziging aan je potjes is de functie leeg
    const zonder = await page.evaluate(() => { SET.budgetsNext = {}; return maandPlanRegels(); });
    expect(zonder).toBe('');
  });

  test('zonder die rij is de voet leeg en valt de streep weg', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set); delete set.budgetsNext; p.minder_set = JSON.stringify(set);
    await open(page, p);
    const r = await page.evaluate((m) => ({ voet: maandVoet(m), blok: maandVoetBlok(m, true) }), CUR);
    expect(r.voet).toBe('');
    expect(r.blok).toBe('');
    await page.evaluate(() => go('maand'));
    const strepen = await page.evaluate(() => (document.querySelector('#s-maand').innerHTML.match(/border-top:1px solid var\(--line\)/g) || []).length);
    expect(strepen).toBe(0);
  });

  test('met die rij staat de streep er precies één keer', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => go('maand'));
    const strepen = await page.evaluate(() => (document.querySelector('#s-maand').innerHTML.match(/border-top:1px solid var\(--line\)/g) || []).length);
    expect(strepen).toBe(1);
  });
});

test.describe('2 - Meer binnen, meer uitgegeven is weg', () => {
  test('op data waarop het signaal vuurde, vuurt het niet meer', async ({ page }) => {
    await bootPatroon(page);
    const r = await page.evaluate(() => {
      const alle = scoreNotifs({ negeerSnooze: true }) || [];
      const rows = months().filter((m) => m < thisYM()).slice(-6).map((m) => totals(m));
      const base = baseIncome();
      const wind = rows.filter((t) => t.income > base * MEEVALLER_FACTOR), norm = rows.filter((t) => t.income <= base * MEEVALLER_FACTOR);
      const avg = (a) => a.reduce((s, t) => s + t.spend, 0) / a.length;
      return { keys: alle.map((n) => n.key), zouVuren: wind.length >= 1 && norm.length >= 1 && avg(wind) > avg(norm) * 1.12,
        struct: maandStructureel().map((r) => ({ key: r.key, status: r.status, naam: r.naam })) };
    });
    expect(r.zouVuren).toBe(true);                       // de oude conditie is op deze data waar
    expect(r.keys).not.toContain('inflatie');
    expect(r.struct.map((x) => x.key)).not.toContain('inflatie');
    // en de twee structurele signalen die blijven werken op dezelfde data, met hun eigen status
    const s = Object.fromEntries(r.struct.map((x) => [x.key, x]));
    expect(s.meevaller.status).toBe('tekort');
    expect(s.meevaller.naam).toBe('Sparen leunt op meevallers');
    expect(s.overstreak.status).toBe('tekort');
    expect(s.overstreak.naam).toBe('Maanden boven je grens');
  });

  test('de tekst staat nergens meer', async ({ page }) => {
    await bootPatroon(page);
    for (const s of ['maand', 'ins', 'dash']) {
      expect(await schermTekst(page, s), s).not.toMatch(/Meer binnen, meer uitgegeven/i);
    }
    // in de bron: geen push met die key en geen berekening meer. Een comment die het signaal
    // noemt telt niet als verwijzing, dus de zinnen zelf worden op het scherm gemeten, hierboven.
    const src = await bron(page);
    expect(src).not.toContain("key:'inflatie'");
    expect(src).not.toMatch(/\bspWA\b|\bspNA\b/);
  });

  test('de schakelaar noemt nog drie patronen, uit dezelfde tabel', async ({ page }) => {
    await bootPatroon(page);
    const keys = await page.evaluate(() => Object.keys(PATROONSIGNALEN).sort());
    expect(keys).toEqual(['meevaller', 'overstreak', 'savrules']);
    const t = await page.evaluate(() => { go('set'); toggleSet('coach'); return $('#s-set').innerText; });
    expect(t).not.toContain('meestijgen');
    expect(t).toContain('spaarstortingen die als uitgave staan, een meevaller in je inkomen en maanden op rij boven je budget');
  });

  test('coachOff zet de drie die over zijn nog steeds uit', async ({ page }) => {
    await bootPatroon(page, { set: { coachOff: true } });
    const keys = await page.evaluate(() => scoreNotifs({ negeerSnooze: true }).map((n) => n.key));
    for (const k of ['savrules', 'meevaller', 'overstreak']) expect(keys).not.toContain(k);
  });
});

test.describe('3 - STRUCT_STATUS is niet aangeraakt en de info-tak heeft een gebruiker', () => {
  test('de mapping is ongewijzigd', async ({ page }) => {
    await bootPatroon(page);
    expect(await page.evaluate(() => STRUCT_STATUS)).toEqual({ bad: 'tekort', warn: 'tekort', info: 'let op' });
  });

  test("'rente' is structureel en info, dus de tak is niet leeg", async ({ page }) => {
    await bootPatroon(page);
    const src = await bron(page);
    const m = src.match(/push\(\{key:'rente-'[^}]*?\}/);
    expect(m).toBeTruthy();
    expect(m[0]).toContain("h:'structureel'");
    expect(m[0]).toContain("t:'info'");
    // en het is de enige: elk ander structureel signaal draagt bad of warn
    const structureel = [...src.matchAll(/push\(\{key:'([a-z-]+)'[^}]*?h:'structureel'[^}]*?t:'(\w+)'/g)].map((x) => [x[1], x[2]]);
    expect(structureel.sort()).toEqual([['meevaller', 'bad'], ['overstreak', 'warn'], ['rente-', 'info']]);
  });
});
