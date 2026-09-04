// v161: de kerncijfers meten het eigen systeem in plaats van 50/30/20, en staan op twee schermen.
// Structureel (spaarquote, vaste-lastendruk) op het maandscherm, operationeel (budgetnaleving,
// variabele-lastendruk) op Inzichten. De restsaldo-quote is vervallen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MS = [3, 2, 1].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const AF = MS[MS.length - 1];              // een afgeronde maand
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';

function seed(o = {}) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc, typ: '', ref: '',
      src: 'csv', accName: '', refNums: [] });
  for (const m of MS.concat([CUR])) {
    add('i' + m, MAIN, m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('s' + m, SPAAR, m, '26', 200, 'Spaarpot', 'NAAR SPAREN');
    if (!o.geenRes) add('r' + m, RES, m, '27', 150, 'Reserveringen', 'NAAR RESERVERINGEN');
    if (!o.geenBelegging) add('p' + m, MAIN, m, '08', -100, 'Peaks', 'Peaks SEPA iDEAL investeren met Peaks');
  }
  // een terugstorting in een categorie met verder nauwelijks vaste kosten. De huur vervalt dan,
  // anders blijft het grondtal groot en valt er niets te tonen.
  if (o.terugstorting) {
    for (let i = tx.length - 1; i >= 0; i--) if (tx[i].id.startsWith('h')) tx.splice(i, 1);
    for (const m of MS.concat([CUR])) add('z' + m, MAIN, m, '03', -150, 'Zorgverzekeraar', 'SEPA INCASSO ZORGPREMIE');
    add('tb', MAIN, AF, '15', 125, 'Zorgverzekeraar', 'SEPA INCASSO ZORGPREMIE RESTITUTIE');
  }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: o.mode || 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 2000, [SPAAR]: 9000, [RES]: 1200 },
    budgets: { boodschappen: 500, huur: 900 },
    savingMode: 'amount', savingAmount: 200,
    savingsAcc: { [SPAAR]: true, [RES]: false },
    resAcc: o.geenRes ? '' : RES,
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof vermogensInleg === 'function' && typeof maandKpiBlok === 'function');
}
const K = (page, m) => page.evaluate((x) => {
  const k = insKpis(x);
  return { keys: k.items.map((i) => i.key), partial: k.partial,
    inleg: k.inleg && { val: k.inleg.val, raw: k.inleg.raw, band: k.inleg.band, oordeel: k.inleg.oordeel, klein: k.inleg.klein },
    vast: k.vast && { val: k.vast.val, band: k.vast.band, klein: k.vast.klein, grondtal: k.vast.grondtal },
    budget: k.budget && { band: k.budget.band } };
}, m);

test.describe('a · de spaarquote telt de hele vermogensopbouw', () => {
  test('drie stromen, en de som klopt met de teller', async ({ page }) => {
    await boot(page);
    const V = await page.evaluate((m) => vermogensInleg(m), AF);
    const per = Object.fromEntries(V.delen.map((d) => [d.key, d.bedrag]));
    expect(per.spaar).toBe(200);
    expect(per.res).toBe(150);
    expect(per.bel).toBe(100);
    expect(V.totaal).toBe(450);
  });

  test('oud en nieuw naast elkaar: het verschil is precies res plus belegging', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = totals(m), V = vermogensInleg(m);
      return { oud: savedNet(m) / t.income * 100, nieuw: V.totaal / t.income * 100,
        oudEur: savedNet(m), nieuwEur: V.totaal, res: resThisMonth(m), bel: beleggingsInleg(m) };
    }, AF);
    expect(r.nieuwEur - r.oudEur).toBe(r.res + r.bel);
    expect(Math.round(r.oud)).toBe(7);        // 200 van 3000
    expect(Math.round(r.nieuw)).toBe(15);     // 450 van 3000
  });

  test('resThisMonth spiegelt savedThisMonth, alleen op de reserveringenrekening', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({
      res: resThisMonth(m), spaar: savedThisMonth(m),
      resInSpaar: n26SavingsAccounts().includes(SET.resAcc),
      src: resThisMonth.toString(),
    }), AF);
    expect(r.res).toBe(150);
    expect(r.spaar).toBe(200);
    expect(r.resInSpaar).toBe(false);          // v128: geen dubbeltelling, structureel uitgesloten
    expect(r.src).toContain('Math.max(Math.round(net),0)');   // zelfde klem en afronding
  });

  test('zonder reserveringsrekening telt die stroom niet mee en heet dat ook zo', async ({ page }) => {
    await boot(page, seed({ geenRes: true }));
    const V = await page.evaluate((m) => vermogensInleg(m), AF);
    expect(V.delen.find((d) => d.key === 'res').bedrag).toBe(null);
    expect(V.totaal).toBe(300);                // 200 spaar + 100 belegging
    const h = await page.evaluate((m) => kpiInlegOpbouw(m), AF);
    expect(h).toMatch(/geen reserveringsrekening ingesteld/);
    expect(h).toMatch(/niet bekend/);
  });

  test('een overboeking naar je eigen spaarrekening telt niet twee keer', async ({ page }) => {
    const p = seed();
    const tx = JSON.parse(p.minder_tx);
    // uitgaande kant van de eigen spaarstorting, met de eigen rekening als tegenpartij
    for (const m of MS.concat([CUR])) {
      tx.push({ id: 'uit' + m, date: `${m}-26`, amount: -200, acc: MAIN, name: 'Spaarpot',
        desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [SPAAR] });
    }
    p.minder_tx = JSON.stringify(tx);
    await boot(page, p);
    const r = await page.evaluate((m) => ({ own: OWN, bel: beleggingsInleg(m) }), AF);
    expect(r.own).toContain(SPAAR);
    expect(r.bel).toBe(100);                   // alleen Peaks, niet de eigen overboeking
  });

  test('de uitleg-sheet noemt wat er buiten valt, met de reden', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate((m) => kpiInlegOpbouw(m), AF);
    expect(h).toMatch(/aankoopdoel/i);
    expect(h).toMatch(/Aflossing op een lening/i);
    expect(h).toMatch(/welk deel daarvan aflossing is en welk deel rente/i);
  });
});

test.describe('b · de splitsing over twee schermen', () => {
  test('vier cijfers, de restsaldo-quote bestaat niet meer', async ({ page }) => {
    await boot(page);
    const k = await K(page, AF);
    expect(k.keys).toEqual(['inleg', 'budget', 'vari', 'vast']);
    expect(await page.evaluate((m) => insKpis(m).spaar, AF)).toBeUndefined();
  });

  test('Inzichten toont het operationele paar', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate((m) => insKpiStrip(m), AF);
    expect(h).toContain('data-kpi="budget"');
    expect(h).toContain('data-kpi="vari"');
    expect(h).not.toContain('data-kpi="inleg"');
    expect(h).not.toContain('data-kpi="vast"');
  });

  test('het maandscherm toont het structurele paar', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate((m) => maandKpiBlok(m), AF);
    expect(h).toContain('data-kpi="inleg"');
    expect(h).toContain('data-kpi="vast"');
    expect(h).not.toContain('data-kpi="budget"');
    expect(h).not.toContain('data-kpi="vari"');
  });

  test('samen precies vier, geen derde plek', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('ins'); go('maand'); });
    const n = await page.evaluate(() => document.querySelectorAll('[data-kpi]').length);
    expect(n).toBe(4);
  });

  test('sparklines staan op beide schermen', async ({ page }) => {
    await boot(page);
    for (const fn of ['insKpiStrip', 'maandKpiBlok']) {
      const h = await page.evaluate((a) => window[a.f](a.m), { f: fn, m: AF });
      expect(h).toContain('spk-wrap');
    }
  });
});

test.describe('c · geen verzonnen norm', () => {
  test('alleen budgetnaleving houdt een doel', async ({ page }) => {
    await boot(page);
    const b = await page.evaluate(() => ({
      inleg: kpiBand('inleg'), budget: kpiBand('budget'), vari: kpiBand('vari'), vast: kpiBand('vast'),
    }));
    expect(b.budget).toBe(100);
    expect(b.inleg).toBe(null);
    expect(b.vari).toBe(null);
    expect(b.vast).toBe(null);
  });

  test('een andere norm kiezen verandert de kerncijfers niet meer', async ({ page }) => {
    await boot(page);
    const voor = await K(page, AF);
    await page.evaluate(() => { SET.splitMode = '702010'; save(); });
    const na = await K(page, AF);
    expect(na.inleg).toEqual(voor.inleg);
    expect(na.vast).toEqual(voor.vast);
    expect(na.budget).toEqual(voor.budget);
  });

  test('de norm blijft bestaan waar hij wel over gaat', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof splitTarget().save)).toBe('number');
    expect(await page.evaluate(() => typeof setSplitNorm)).toBe('function');
  });

  test('kpiBasis staat los van de band', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = totals(m);
      return { inleg: kpiBasis('inleg', t), budget: kpiBasis('budget', t), income: Math.round(t.income), bud: Math.round(t.budget) };
    }, AF);
    expect(r.inleg).toBe(r.income);            // ook zonder band nog een noemer
    expect(r.budget).toBe(r.bud);
  });
});

test.describe('d · klein grondtal', () => {
  test('een terugstorting in een kleine categorie geeft een bedrag, geen percentage', async ({ page }) => {
    await boot(page, seed({ terugstorting: true }));
    const k = await K(page, AF);
    expect(k.vast.klein).toBe(true);
    expect(k.vast.val).not.toMatch(/%/);
    expect(k.vast.band).toMatch(/te klein voor een percentage/);
    expect(k.vast.oordeel).toBeUndefined();
  });

  test('de drempel staat in MAAND_DREMPEL, niet inline', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => MAAND_DREMPEL.kpiMinBedrag)).toBe(100);
    expect(await page.evaluate(() => insKpis.toString())).toContain('MAAND_DREMPEL.kpiMinBedrag');
  });

  test('een normaal grondtal geeft gewoon een percentage', async ({ page }) => {
    await boot(page);
    const k = await K(page, AF);
    expect(k.vast.klein).toBe(false);
    expect(k.vast.val).toMatch(/%/);
  });
});

test.describe('e · loopt nog, en de rustige modus', () => {
  test('de lopende maand krijgt geen oordeel, op beide schermen', async ({ page }) => {
    await boot(page);
    const k = await K(page, CUR);
    expect(k.partial).toBe(true);
    expect(k.inleg.oordeel).toBe('loopt nog');
    for (const fn of ['insKpiStrip', 'maandKpiBlok']) {
      const h = await page.evaluate((a) => window[a.f](a.m), { f: fn, m: CUR });
      expect(h).toMatch(/loopt nog/);
    }
  });

  test('een afgeronde maand krijgt wel een oordeel', async ({ page }) => {
    await boot(page);
    const k = await K(page, AF);
    expect(k.partial).toBe(false);
    expect(k.inleg.oordeel).not.toBe('loopt nog');
  });

  test('rustig toont er een per scherm, met een tik naar de rest', async ({ page }) => {
    await boot(page, seed({ mode: 'rustig' }));
    const h = await page.evaluate((m) => insKpiStrip(m) + maandKpiBlok(m), AF);
    expect((h.match(/data-kpi=/g) || []).length).toBe(2);
    expect(h).toMatch(/toon beide kerncijfers/);
  });

  test('en uitgeklapt weer allebei', async ({ page }) => {
    await boot(page, seed({ mode: 'rustig', set: { kpiAll: true, kpiAllMaand: true } }));
    const h = await page.evaluate((m) => insKpiStrip(m) + maandKpiBlok(m), AF);
    expect((h.match(/data-kpi=/g) || []).length).toBe(4);
  });
});
