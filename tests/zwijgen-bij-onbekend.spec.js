// v173: zeven plekken toonden een stellig getal of oordeel op data die er niet is. Er is één juist
// model en dat stond al in de app: de onbekend-hero op Home. Geen stellige nul, wel de reden, wel
// één volgende stap. Deze specs leggen per plek vast dat er gezwegen wordt in plaats van gerekend.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[2];
const dagGeleden = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (dt, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: dt, amount: a, acc: acc || MAIN,
    name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  if (o.oudeImport) {
    for (const m of MS.slice(0, 2)) { add(`${m}-02`, 3000, 'Werkgever', 'SALARIS LOON');
      add(`${m}-05`, -800, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'); }
  } else {
    for (const m of (o.eenMaand ? [CUR] : MS)) {
      add(`${m}-02`, 3000, 'Werkgever', 'SALARIS LOON');
      add(`${m}-05`, -800, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
      if (o.spaar) add(`${m}-26`, 200, 'Spaarpot', 'NAAR SPAREN', SAV);
    }
  }
  const bal = o.geenSaldo ? {} : { [MAIN]: 3000 };
  if (o.spaar && !o.geenSaldo) bal[SAV] = 4000;
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: bal, budgets: o.geenBudget ? {} : { boodschappen: 500, huur: 900 },
    goals: [{ id: 'g1', naam: 'Reis', doel: 5000, gespaard: 0, allocMode: 'auto' }],
  }, o.set || {});
  if (o.spaar && !o.geenSaldo) set.savingsEnds = ['4323'];
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify(o.spaar && !o.geenSaldo ? [MAIN, SAV] : [MAIN]),
    minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof safeToSpend === 'function');
}
const scherm = (page, n) => page.evaluate(async (x) => { go(x);
  await new Promise((r) => setTimeout(r, 90));
  return $('#s-' + x).innerText.replace(/\s+/g, ' '); }, n);
const plan = (page) => page.evaluate(() => { const d = document.createElement('div');
  d.innerHTML = renderPlan(true); return d.innerText.replace(/\s+/g, ' '); });

test.describe('1 · Vooruitblik zwijgt bij een onbekende bron', () => {
  test('geen voortgang, geen tempo, geen datum', async ({ page }) => {
    await boot(page, seed({ geenSaldo: true }));
    const t = await plan(page);
    expect(t).toMatch(/Noodfonds\s*onbekend/);
    // een spaardoel op €0 is wel een echte toewijzing (je wees er niets aan toe); het gaat om de
    // noodfonds-rij, waar die 0 nooit is vastgesteld
    const rij = t.slice(t.indexOf('Noodfonds'), t.indexOf('Reis'));
    expect(rij).not.toMatch(/€0 toegewezen/);
    expect(rij).not.toMatch(/op dit tempo/);
    expect(rij).not.toMatch(/rond \w+ \d{4}/);
    // en geen voortgangsbalk in die rij (de rij van het spaardoel houdt de zijne)
    const h = await page.evaluate(() => renderPlan(true));
    const i = h.indexOf('data-id="noodfonds"');
    const nfHtml = h.slice(i, h.indexOf('plan-item', i + 10));
    expect(i).toBeGreaterThan(-1);
    expect(nfHtml).not.toContain('bar-track');
  });

  test('Home en Vooruitblik zeggen op hetzelfde moment hetzelfde', async ({ page }) => {
    await boot(page, seed({ geenSaldo: true }));
    expect(await scherm(page, 'dash')).toMatch(/onbekend/);
    expect(await plan(page)).toMatch(/onbekend/);
  });

  test('met een bekend saldo staat alles er weer', async ({ page }) => {
    await boot(page, seed({ spaar: true }));
    const t = await plan(page);
    expect(t).toMatch(/toegewezen/);
    expect(t).not.toMatch(/Noodfonds\s*onbekend/);
  });
});

test.describe('2 · een afgeleide referentie heet niet mijn plan', () => {
  test('zonder potjes noemt de hero de inkomen-limiet bij naam', async ({ page }) => {
    await boot(page, seed({ geenBudget: true }));
    const t = await scherm(page, 'ins');
    expect(t).toMatch(/je inkomen-limiet/);
    expect(t).not.toMatch(/van €[\d.]+ maandbudget/);
    // en het onderliggende getal blijft ongemoeid: dit is alleen de naam
    expect(await page.evaluate((m) => { const x = totals(m); return [x.budget, x.limit, x.potTotal]; }, CUR))
      .toEqual([2100, 2100, 0]);
  });

  test('met potjes heet het gewoon je maandbudget', async ({ page }) => {
    await boot(page);
    const t = await scherm(page, 'ins');
    expect(t).toMatch(/maandbudget/);
    expect(t).not.toMatch(/je inkomen-limiet/);
  });
});

test.describe('3 · nul uitgaven is niet hetzelfde als geen data', () => {
  test('een import van vóór deze maand geeft onbekend, geen 0%', async ({ page }) => {
    await boot(page, seed({ oudeImport: true }));
    const t = await scherm(page, 'ins');
    expect(t).toMatch(/onbekend uitgegeven/);
    expect(t).not.toMatch(/€0 uitgegeven/);
    expect(t).not.toMatch(/\b0%/);
    expect(t).toMatch(/Nul uitgaven en geen data zijn niet hetzelfde/);
    expect(t).toMatch(/Bestand toevoegen|Synchroniseer map/);   // dezelfde tik als de herinnering
  });

  test('één detectie, geen tweede: beide lezen laatsteImport', async ({ page }) => {
    await boot(page, seed({ oudeImport: true }));
    const r = await page.evaluate(() => ({
      rem: renderReminder.toString(), blok: insBudgetBlok.toString(),
      L: laatsteImport(), cta: importCta() }));
    expect(r.rem).toContain('laatsteImport()');
    expect(r.blok).toContain('laatsteImport()');
    expect(r.blok).toContain('importCta()');
    expect(r.L.dagen).toBeGreaterThan(7);
    expect(r.cta.lab).toBeTruthy();
  });

  test('verse data rekent gewoon door', async ({ page }) => {
    await boot(page);
    const t = await scherm(page, 'ins');
    expect(t).toMatch(/€800 uitgegeven/);
    expect(t).not.toMatch(/onbekend uitgegeven/);
  });
});

test.describe('4 · de drempel voor onvolledigheid', () => {
  test('de drempel staat in MAAND_DREMPEL, als aandeel plus ondergrens', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => ({ deel: MAAND_DREMPEL.onbekendDeel, min: MAAND_DREMPEL.onbekendMin }));
    expect(d.deel).toBe(0.5);
    expect(d.min).toBe(3);
    expect(await page.evaluate(() => maandOordeel.toString())).toContain('MAAND_DREMPEL.onbekendDeel');
  });

  test('één onbekende regel van één is geen "er ontbreekt te veel"', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const mk = (n, st) => Array.from({ length: n }, (_, i) => ({ key: 'r' + i, naam: 'R' + i, status: st }));
      return { een: maandOordeel(mk(1, 'onbekend')), twee: maandOordeel(mk(2, 'onbekend')),
        tweeVanDrie: maandOordeel(mk(2, 'onbekend').concat(mk(1, 'ok'))).zin,
        tweeVanVijf: maandOordeel(mk(2, 'onbekend').concat(mk(3, 'ok'))).zin };
    });
    expect(r.een.zin).toBe('Er is nog niets te beoordelen.');
    expect(r.een.sub).toMatch(/^Onbekend:/);            // wel benoemen wat er ontbreekt
    expect(r.twee.zin).toBe('Er is nog niets te beoordelen.');
    expect(r.tweeVanDrie).toBe('Er ontbreekt te veel om een oordeel te geven.');
    expect(r.tweeVanVijf).not.toMatch(/ontbreekt te veel/);
  });

  test('nooit meer "De 0 regels"', async ({ page }) => {
    await boot(page);
    const zinnen = await page.evaluate(() => {
      const mk = (n, st) => Array.from({ length: n }, (_, i) => ({ key: 'r' + i, naam: 'R' + i, status: st }));
      const uit = [];
      for (let n = 0; n <= 5; n++) for (let o = 0; o <= n; o++)
        uit.push(maandOordeel(mk(o, 'onbekend').concat(mk(n - o, 'ok'))).zin);
      return uit;
    });
    for (const z of zinnen) expect(z).not.toMatch(/\b0 regels/);
  });
});

test.describe('5 · geen beweerde oorzaak meer', () => {
  test('de zin over twee doelen tegelijk bestaat niet meer', async ({ page }) => {
    await boot(page, seed({ spaar: true }));
    const bron = await page.evaluate(() => fetch('/index.html').then((r) => r.text()));
    expect(bron).not.toContain('zit nu bij twee doelen tegelijk');
    expect(bron).not.toContain('Je noodfonds-doel ging omhoog');
  });
});

test.describe('6 · één ingang per gat op Home', () => {
  test('de saldo-CTA en de vermogens-CTA gaan over verschillende gaten', async ({ page }) => {
    await boot(page, seed({ geenSaldo: true }));
    const r = await page.evaluate(() => {
      const html = $('#s-dash').innerHTML;
      return { saldo: (html.match(/openSaldoInvoer\(\)/g) || []).length,
        vermogen: (html.match(/go\('vermogen'\)/g) || []).length,
        kaart: vermogenCard() };
    });
    expect(r.saldo).toBe(1);                            // precies één ingang voor het saldo
    expect(r.vermogen).toBe(1);
    expect(r.kaart).not.toMatch(/€/);                   // die kaart claimt geen bedrag (v171)
    expect(r.kaart).not.toMatch(/saldo/i);              // en gaat dus niet over hetzelfde gat
  });
});

test.describe('7 · één keer melden dat er te weinig historie is', () => {
  test('bij één maand staat de mededeling precies één keer', async ({ page }) => {
    await boot(page, seed({ eenMaand: true }));
    await page.evaluate(() => { SET.kpiAll = 1; save(); });
    // v178: de maandgrafiek die de zin draagt staat op Maand; de tegels staan op Inzichten
    const t = (await scherm(page, 'ins')) + ' ' + (await scherm(page, 'maand'));
    expect((t.match(/maanden zie je hier je verloop/gi) || []).length).toBe(1);
    expect(await page.evaluate(() => $('#insKpiStrip').innerText)).not.toMatch(/zie je hier je verloop/i);
  });
});

test.describe('r · regressie op een volledige dataset', () => {
  test('niets zwijgt wat wel bekend is', async ({ page }) => {
    await boot(page, seed({ spaar: true }));
    const ins = await scherm(page, 'ins');
    expect(ins).toMatch(/€800 uitgegeven/);
    expect(ins).toMatch(/maandbudget/);
    expect(ins).not.toMatch(/onbekend uitgegeven/);
    expect(await plan(page)).toMatch(/toegewezen/);
    const dash = await scherm(page, 'dash');
    expect(dash).not.toMatch(/Veilig te besteden onbekend/);
    const R = await page.evaluate(() => maandRegels().map((x) => x.status));
    expect(R.filter((x) => x === 'onbekend').length).toBeLessThan(R.length);
  });
});
