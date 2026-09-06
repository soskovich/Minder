// v197: een pass op dode condities. Guards en takken waarvan één uitkomst onbereikbaar is, los van
// of de omliggende functie leeft. Die categorie vonden de opruimrondes van v164/v165 niet: die keken
// naar functies zonder aanroeper.
// Twee dingen die deze spec bewaakt: de condities die weg zijn komen niet terug, en de gevallen
// waar juist de SCHRIJVER ontbrak houden hun huidige gedrag vast, zodat een latere invoerlaag een
// bewuste keuze is en geen stille verschuiving.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);

function seed(o = {}) {
  const n = o.maanden == null ? 4 : o.maanden;
  const MS = []; for (let k = n - 1; k >= 0; k--) MS.push(ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
  const tx = []; let i = 0;
  const add = (m, d, a, naam, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: MAIN,
    name: naam, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  if (!o.leeg) MS.forEach((m) => {
    add(m, '02', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '05', -420, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '11', -180, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
  });
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 6000 }, savingMode: 'amount', savingAmount: 300,
    budgets: { huur: 900, boodschappen: 500, uiteten: 200 }, goals: [], planOrder: [] }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof savingsModel === 'function');
}
const bron = (page, fn) => page.evaluate((n) => window[n].toString()
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((l) => l.replace(/(^|[\s;})])\/\/(?!\/).*$/, '$1')).join('\n'), fn);

test.describe('a · guards die door een eerdere guard al waren afgevangen', () => {
  test('scoreNotifs toetst TX.length één keer, bovenin', async ({ page }) => {
    await boot(page);
    const src = await bron(page, 'scoreNotifs');
    expect((src.match(/TX\.length/g) || []).length).toBe(1);
    // en die ene staat vóór de structurele groep, die alleen nog op coachOff toetst
    expect(src.indexOf('TX.length')).toBeLessThan(src.indexOf('SET.coachOff'));
    expect(src).toMatch(/if\(!SET\.coachOff\)\{/);
  });

  test('de guard doet nog steeds wat hij moet doen', async ({ page }) => {
    await boot(page, { leeg: true });
    expect(await page.evaluate(() => scoreNotifs())).toEqual([]);
    await boot(page, { set: { coachOff: true } });
    const keys = await page.evaluate(() => scoreNotifs({ negeerSnooze: true }).map((n) => n.key));
    for (const k of ['savrules', 'meevaller', 'inflatie', 'overstreak']) expect(keys).not.toContain(k);
  });
});

test.describe('b · een terugval die de aanroeper al afving', () => {
  test('openFixedVarDrill leest de maand rechtstreeks, zonder _fvTx', async ({ page }) => {
    await boot(page);
    const src = await bron(page, 'openFixedVarDrill');
    expect(src).toContain('txOfMonth(m)');
    expect(src).not.toContain('_fvTx');
    expect(await page.evaluate(() => '_fvTx' in window)).toBe(false);
  });

  test('elke aanroeper geeft een maand mee, dus de drill blijft werken', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      openFixedVarDrill('var', m);
      const t1 = document.querySelector('#sheet').innerText;
      const scope = window._fvMonth;
      closeSheet();
      // de heropening na een omzetting gebruikt _fvMonth: dezelfde inhoud
      openFixedVarDrill(window._fvDrillKind || 'fixed', window._fvMonth || undefined);
      return { t1, scope, t2: document.querySelector('#sheet').innerText };
    }, CUR);
    expect(r.scope).toBe(CUR);
    expect(r.t1.length).toBeGreaterThan(0);
    expect(r.t2.length).toBeGreaterThan(0);
  });
});

test.describe('c · een pending afschrijving is geld dat weg is', () => {
  test('psd2Pending is geen conditie meer', async ({ page }) => {
    await boot(page);
    const bronnen = await page.evaluate(() => {
      const kaal = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map((l) => l.replace(/(^|[\s;})])\/\/(?!\/).*$/, '$1')).join('\n');
      const uit = [];
      for (const n of Object.getOwnPropertyNames(window)) {
        let f; try { f = window[n]; } catch (_) { continue; }
        if (typeof f !== 'function') continue;
        let s; try { s = kaal(f.toString()); } catch (_) { continue; }
        if (/psd2Pending/.test(s)) uit.push(n);
      }
      return uit;
    });
    expect(bronnen).toEqual([]);
  });
});

test.describe('d · het bufferdoel: dode keuze weg, levende terugval intact', () => {
  test('de vier onbereikbare basissen bestaan niet meer', async ({ page }) => {
    await boot(page);
    const src = await bron(page, 'savingsModel');
    for (const v of ['SET.bufferBasis', 'SET.bufferMonths', 'SET.bufferAmount']) {
      expect(src, v).not.toContain(v);
    }
    expect(src).not.toMatch(/basis==='income'|basis==='fixed'|basis==='variable'|basis==='amount'/);
  });

  test('met data volgt het doel het noodfonds, zoals sinds richting A', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ S: savingsModel(), nf: Math.round(noodfondsModel().doel || 0) }));
    expect(r.nf).toBeGreaterThan(0);
    expect(r.S.goal).toBe(r.nf);
    expect(r.S.goalSrc).toBe('nood');
  });

  /* De terugval is de enige reden dat dit blok nog bestaat: bij lege data geeft noodfondsModel()
     geen doel en valt savingsModel() terug op zes maanduitgaven. Dat pad moet blijven werken. */
  test('bij lege data blijft de terugval werken en rekent hij zes maanduitgaven', async ({ page }) => {
    await boot(page, { leeg: true });
    const r = await page.evaluate(() => {
      const S = savingsModel();
      let nf = 0; try { nf = Math.round(noodfondsModel().doel || 0); } catch (_) {}
      return { goal: S.goal, src: S.goalSrc, basis: S.basis, mult: S.mult,
        baseVal: S.baseVal, baseLabel: S.baseLabel, avgSpend: S.avgSpend, nf };
    });
    expect(r.nf).toBe(0);                          // geen data, dus geen noodfondsdoel
    expect(r.src).toBe('formule');                 // en dus de terugval
    expect(r.basis).toBe('spend');
    expect(r.mult).toBe(6);
    expect(r.baseLabel).toBe('maanduitgave');
    expect(r.baseVal).toBe(r.avgSpend);
    expect(r.goal).toBe(r.avgSpend * 6);
  });

  test('het model blijft dezelfde velden teruggeven', async ({ page }) => {
    await boot(page);
    const k = await page.evaluate(() => Object.keys(savingsModel()));
    for (const v of ['basis', 'mult', 'baseVal', 'baseLabel', 'avgSpend', 'avgFixed', 'avgVar']) {
      expect(k, v).toContain(v);
    }
  });
});

test.describe('e · posten zonder invoerkanaal', () => {
  test('coachSetAside is weg; de projectie rekent zonder die post', async ({ page }) => {
    await boot(page);
    const src = await bron(page, 'financeModel');   // comments tellen niet als verwijzing (v165)
    expect(src).not.toContain('coachSetAside');
    expect(await page.evaluate(() => financeModel().projection.setAside)).toBe(0);
  });

  test('stsBuffer staat niet meer in de briefingexport', async ({ page }) => {
    await boot(page);
    const treffers = await page.evaluate(() => {
      const uit = [];
      for (const n of Object.getOwnPropertyNames(window)) {
        let f; try { f = window[n]; } catch (_) { continue; }
        if (typeof f !== 'function') continue;
        let src; try { src = f.toString(); } catch (_) { continue; }
        src = src.replace(/\/\*[\s\S]*?\*\//g, '');
        if (/stsBuffer|safeToSpendBuffer/.test(src)) uit.push(n);
      }
      return uit;
    });
    expect(treffers).toEqual([]);
    // de lezer rekent nu rechtstreeks met nul, met dezelfde uitkomst als altijd
    expect(await bron(page, '_signaalSafeToSpend')).toMatch(/rest>0/);
  });

  /* irregularIncome blijft bewust staan: vakantiegeld en de dertiende maand zijn concrete bedragen
     op bekende maanden, en de verdeelregel voor onregelmatig inkomen (v155) leunt erop. Het
     invoerkanaal is een eigen ronde; tot dan is de lijst leeg en telt hij niets mee. */
  test('irregularIncome blijft gelezen, en een lege lijst verandert niets', async ({ page }) => {
    await boot(page);
    const src = await bron(page, 'financeModel');
    expect(src).toContain('SET.irregularIncome');
    const zonder = await page.evaluate(() => JSON.stringify(financeModel().projection));
    await boot(page, { set: { irregularIncome: [] } });
    const leeg = await page.evaluate(() => JSON.stringify(financeModel().projection));
    expect(leeg).toBe(zonder);
  });
});

test.describe('f · de spec zegt wat de code doet', () => {
  test('mentalAccounting noemt de spaarrente als nul zolang er geen invoer is', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      spec: JSON.stringify(MECHANISM_SPEC.mentalAccounting),
      rente: SET.spaarRente,
      drempel: MECHANISM_SPEC.mentalAccounting.condities.minRenteVerschil,
    }));
    expect(r.rente).toBeUndefined();                 // nog geen invoerveld
    expect(r.drempel).toBe(0.05);
    expect(r.spec).toMatch(/spaarrente/i);
    expect(r.spec).toMatch(/v197/);
  });

  test('de toets zelf is onveranderd: schuldrente min spaarrente', async ({ page }) => {
    await boot(page, { set: { debts: [{ id: 'd1', naam: 'Creditcard', type: 'lening',
      rest: 3000, start: 3000, perMaand: 100, rente: 12 }] } });
    const r = await page.evaluate(() => {
      const laag = coachDureSchuld();
      SET.spaarRente = 9; save();                    // handmatig, alleen om de aftrekking te tonen
      const hoog = coachDureSchuld();
      delete SET.spaarRente; save();
      return { laag: !!laag, hoog: !!hoog };
    });
    expect(r.laag).toBe(true);                       // 12% - 0% haalt de drempel
    expect(r.hoog).toBe(false);                      // 12% - 9% niet
  });
});

test.describe('g · de filtersheet springt niet meer open nadat je hem sloot', () => {
  test('closeSheet wist de vlag, net als bij de andere sheets', async ({ page }) => {
    await boot(page);
    const src = await bron(page, 'closeSheet');
    expect(src).toContain('_txFilterSheet=false');
    const r = await page.evaluate(() => {
      go('tx');
      openTxFilter();
      const naOpen = window._txFilterSheet;
      closeSheet();
      const naSluiten = window._txFilterSheet;
      refreshTxFilter();                             // een filterwijziging langs een andere route
      return { naOpen, naSluiten, weerOpen: !!document.querySelector('#sheetBg.show') };
    });
    expect(r.naOpen).toBe(true);
    expect(r.naSluiten).toBe(false);
    expect(r.weerOpen).toBe(false);                  // hij blijft dicht
  });

  test('met de sheet open ververst een filterwijziging hem nog steeds', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('tx');
      openTxFilter();
      refreshTxFilter();
      return { open: !!document.querySelector('#sheetBg.show'), vlag: window._txFilterSheet };
    });
    expect(r.open).toBe(true);
    expect(r.vlag).toBe(true);
  });
});
