/* v263: de dagregel onder "Nog uit je potjes" wordt een weekregel.
 *
 * WAAROM: "Nog 5 dagen deze maand, dus €54 per dag" is een getal waar je niets mee doet. Elke dag
 * eronder voelt als winst, elke dag erboven als incident. Een week is de eenheid waarin je
 * boodschappen doet en uitgaat, en groot genoeg om één dure dag te dragen.
 *
 * ROLLEND EN BINNEN DE MAAND: wat heb je de komende zeven dagen, met het venster geklemd op wat er
 * nog van de maand over is. Geen kalenderweken, geen restweek van twee dagen, geen tweede tijdas.
 *
 * HET BEDRAG IS HET RESTANT OP HETZELFDE DAGTEMPO (rest/dagen maal venster) en niet rest/venster.
 * De twee voorbeelden uit de opdracht beslissen dat: bij een restant van €270 met nog vijf dagen
 * hoort er €270 te staan, en rest/venster geeft daar €54 - precies het dagbedrag dat deze regel
 * vervangt. De eigenschap die deze spec vasthoudt is dus het tempo en niet het getal.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const ACC = '100110012555096222';
const SPA = 'psd2_spaar01';

/* Een maand van 30 dagen, zodat "dag 26 van 30" en "de laatste dag" te kiezen zijn zonder dat de
   spec van de kalender afhangt. De klok wordt per test gezet; de fixture zelf draagt geen datum
   van vandaag. */
function maand30() {
  const d = new Date(now.getFullYear(), now.getMonth(), 1);
  const dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { jaar: d.getFullYear(), maand: d.getMonth(), dim };
}
const klokOpDag = (dag) => { const m = maand30(); return new Date(m.jaar, m.maand, dag, 10, 0).getTime(); };

function seed(opt) {
  opt = opt || {};
  const tx = [];
  const add = (id, acc, datum, amount, naam, desc) =>
    tx.push({ id, date: datum, amount, acc, name: naam, desc: desc || naam, typ: '', ref: '',
              src: 'psd2', accName: '', refNums: [] });
  for (let i = 9; i >= 0; i--) {
    const m = M(i);
    add('i' + i, ACC, m + '-25', 5216, 'Werkgever');
    add('h' + i, ACC, m + '-02', -1450, 'Huur', 'SEPA INCASSO HUUR WONINGSTICHTING');
    add('s' + i, SPA, m + '-04', 250, 'Naar spaarrekening');
  }
  // de uitgaven van deze maand bepalen het restant; ze staan op dag 1 zodat elke klok ze ziet
  (opt.uit || []).forEach((b, k) => add('u' + k, ACC, M(0) + '-01', -b, 'Albert Heijn'));
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({
      limit: 70, mode: 'begeleid', autoIncome: false, income: 5216,
      manualBal: { [ACC]: 4200, [SPA]: 9000 },
      savingsAcc: { [SPA]: true }, savingsAccMigrated: 1,
      budgets: opt.budgets || { boodschappen: 700 },
      savingMode: 'amount', savingAmount: 0, goals: [],
    }),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, opt) {
  opt = opt || {};
  await page.route('**/sw.js', (r) => r.abort());
  if (opt.dag) await page.clock.install({ time: klokOpDag(opt.dag) });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandDagenOver === 'function');
  await page.evaluate(() => { render(); go('ins'); });
}

const potje = (page) => page.evaluate(() => {
  const m = kijkMaand();
  const p = nogDezeMaandPosten().find((x) => /Nog uit je potjes|Te veel uitgegeven/.test(x.lab)) || null;
  const VP = varPotjeStand(m);
  const el = document.querySelector('#insNogLijst .ins-nog-dag');
  return { regel: p ? p.dagRegel : null, lab: p ? p.lab : null,
           dagen: maandDagenOver(m), rest: VP.budget - VP.gebruikt,
           inDom: el ? el.innerText : null,
           hoogte: el ? Math.round(el.getBoundingClientRect().height) : null,
           breedte: el ? Math.round(el.getBoundingClientRect().width) : null };
});
// het aantal dagen en het bedrag uit de regel zelf, zodat de test leest wat jij leest
const ontleed = (regel) => {
  const m = /^De (komende|resterende) (\d+) (dag|dagen) heb je €([\d.]+)$/.exec(regel);
  if (!m) return null;
  return { soort: m[1], dagen: +m[2], woord: m[3], bedrag: +m[4].replace(/\./g, '') };
};

test.describe('a - het venster', () => {
  test('dag 1 van de maand: de komende 7 dagen, op het dagtempo van de maand', async ({ page }) => {
    await boot(page, { dag: 1, uit: [200] });
    const r = await potje(page);
    const o = ontleed(r.regel);
    expect(o, 'regel: ' + r.regel).toBeTruthy();
    expect(o.soort).toBe('komende');
    expect(o.dagen).toBe(7);
    // het venster is korter dan de maand, dus het bedrag is niet het hele restant
    expect(r.dagen).toBeGreaterThan(7);
    expect(o.bedrag).toBe(Math.round(r.rest / r.dagen * 7));
    expect(o.bedrag).toBeLessThan(r.rest);
  });

  test('dag 26 van 30: het venster is korter en de regel zegt dat', async ({ page }) => {
    const dim = maand30().dim;
    await boot(page, { dag: dim - 4, uit: [200] });
    const r = await potje(page);
    const o = ontleed(r.regel);
    expect(o, 'regel: ' + r.regel).toBeTruthy();
    expect(o.soort).toBe('resterende');
    expect(o.dagen).toBe(4);
    expect(o.dagen).toBe(r.dagen);
    // venster en maand vallen samen, dus het bedrag IS het restant
    expect(o.bedrag).toBe(Math.round(r.rest));
  });

  test('de laatste dag van de maand: een dag, en geen deling door nul', async ({ page }) => {
    await boot(page, { dag: maand30().dim, uit: [200] });
    const r = await potje(page);
    const o = ontleed(r.regel);
    expect(o, 'regel: ' + r.regel).toBeTruthy();
    expect(o.dagen).toBe(1);
    expect(o.woord).toBe('dag');
    expect(Number.isFinite(o.bedrag)).toBe(true);
    expect(o.bedrag).toBe(Math.round(r.rest));
  });

  /* Op precies zeven dagen zijn beide woorden waar, en dan wint 'resterende': dat zegt er iets bij
     wat 'komende' niet zegt, namelijk dat de maand daarna om is. Vanaf acht dagen is alleen
     'komende' waar. */
  test('de overgang valt op zeven dagen: daarboven komende, daaronder resterende', async ({ page }) => {
    const dim = maand30().dim;
    for (const [dag, soort, n] of [[dim - 8, 'komende', 7], [dim - 7, 'resterende', 7], [dim - 6, 'resterende', 6]]) {
      await boot(page, { dag, uit: [200] });
      const o = ontleed((await potje(page)).regel);
      expect(o, 'dag ' + dag).toBeTruthy();
      expect([o.soort, o.dagen], 'dag ' + dag).toEqual([soort, n]);
    }
  });
});

test.describe('b - de regel spreekt zichzelf niet tegen', () => {
  test('het bedrag gedeeld door zijn venster is het dagtempo van het restant', async ({ page }) => {
    const dim = maand30().dim;
    for (const dag of [1, 5, 12, dim - 8, dim - 4, dim - 1, dim]) {
      await boot(page, { dag, uit: [200] });
      const r = await potje(page);
      const o = ontleed(r.regel);
      expect(o, 'dag ' + dag + ' regel: ' + r.regel).toBeTruthy();
      // exact dezelfde som als de bron, dus geen tweede waarheid
      expect(o.bedrag, 'dag ' + dag).toBe(Math.round(r.rest / r.dagen * o.dagen));
      // en het venster gaat nooit buiten de maand
      expect(o.dagen).toBeLessThanOrEqual(r.dagen);
      expect(o.dagen).toBeLessThanOrEqual(7);
    }
  });

  test('het venster komt uit maandDagenOver(), geklemd op de constante', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect(src).toMatch(/const POTJE_VENSTER_DAGEN=7;/);
    // precies één plek klemt het venster, dus een tweede lezer is een regel erbij
    const klemmen = src.split('\n').filter((r) => /Math\.min\([^)]*POTJE_VENSTER_DAGEN/.test(r));
    expect(klemmen).toHaveLength(1);
    expect(klemmen[0]).toMatch(/maandDagenOver|dagen/);
  });
});

test.describe('c - de randgevallen van v257 blijven staan', () => {
  test('restant precies nul geeft geen regel', async ({ page }) => {
    await boot(page, { dag: 12, budgets: { boodschappen: 200 }, uit: [200] });
    const r = await potje(page);
    expect(Math.round(r.rest)).toBe(0);
    expect(r.regel).toBe('');
    expect(r.inDom).toBe(null);
  });

  test('een negatief restant geeft geen regel, en het label zegt het', async ({ page }) => {
    await boot(page, { dag: 12, budgets: { boodschappen: 200 }, uit: [340] });
    const r = await potje(page);
    expect(r.rest).toBeLessThan(0);
    expect(r.lab).toBe('Te veel uitgegeven');
    expect(r.regel).toBe('');
    expect(r.inDom).toBe(null);
  });
});

test.describe('d - layout', () => {
  for (const w of [360, 390]) {
    test(`de regel past op een regel op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page, { dag: 5, uit: [200] });
      const r = await potje(page);
      expect(r.inDom).toBeTruthy();
      expect(r.hoogte, 'regel brak af: ' + r.inDom).toBeLessThanOrEqual(20);
      expect(await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth))
        .toBeLessThanOrEqual(1);
    });
  }

  /* DE VOUW STAAT HIER BEWUST NIET. Deze fixture heeft geen valt-op-signalen, dus een vouw-test
     erop zou groen staan zonder iets te meten, en dat is precies de meetles over een test die zijn
     invariant niet bewijst. De eis van v241 wordt bewaakt door inzichten-indeling.spec.js, die er
     wel een fixture met signalen voor heeft; deze ronde verandert alleen de tekst van een regel die
     onder die signalen staat, en dat is daar gemeten. */
});
