// v153: het dagbedrag als stuurgetal. dagTarget(m) is één bron voor het target, renderDailyVar staat
// weer in beeld onder Verdieping, en daaronder één regel die laat zien wat een euro per dag doet -
// in beide richtingen, en uitsluitend via bestaande functies (safeToSpend, doelTempo).
// De drie oude afleidingen zijn NIET vervangen: de meting liet zien dat ze afwijken (zie de
// controle in blok e). De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';

const OVER = ym(new Date(now.getFullYear() + 1, now.getMonth(), 1));   // streefdatum een jaar vooruit

function seed(set = {}, opt = {}) {
  const huur = opt.huur != null ? opt.huur : 900;
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -huur, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '05', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('e' + m, m, '09', -120, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      manualBal: { [MAIN]: 4000 }, budgets: { boodschappen: 500, eten: 200, huur: 900 },
      savingMode: 'amount', savingAmount: 200,
    }, set)),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
const metDoel = (set = {}) => seed(Object.assign({
  goals: [{ id: 'g1', naam: 'Vakantie', doel: 2400, gespaard: 0, perMaand: 100, streefdatum: OVER }],
}, set));

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof dagTarget === 'function');
}
const dt = (page, m) => page.evaluate((x) => dagTarget(x), m);

test.describe('a · dagTarget is puur en kent zijn bron', () => {
  test('een ingesteld dagbudget wint, en heet zo', async ({ page }) => {
    await boot(page, seed({ dailyVarBudget: 45 }));
    const D = await dt(page, CUR);
    expect(D.target).toBe(45);
    expect(D.bron).toBe('ingesteld');
  });

  test('zonder instelling: maandbudget min vaste lasten, over de dagen van de maand', async ({ page }) => {
    await boot(page);
    const D = await dt(page, CUR);
    const ref = await page.evaluate((m) => {
      const de = daysElapsed(m), sv = splitFixedVar(m);
      return Math.max(totals(m).budget - sv.fixed, 0) / de.dim;
    }, CUR);
    expect(D.bron).toBe('afgeleid');
    expect(D.target).toBeCloseTo(ref, 6);
  });

  test('avgDay, dim, elapsed en over horen bij elkaar', async ({ page }) => {
    await boot(page);
    const D = await dt(page, CUR);
    const ref = await page.evaluate((m) => {
      const de = daysElapsed(m), s = dailyVarSeries(m);
      return { som: s.reduce((a, b) => a + b, 0), dim: de.dim, elapsed: de.elapsed };
    }, CUR);
    expect(D.dim).toBe(ref.dim);
    expect(D.elapsed).toBe(ref.elapsed);
    expect(D.avgDay).toBeCloseTo(ref.som / (ref.elapsed || 1), 6);
    expect(D.over).toBeGreaterThanOrEqual(0);
  });

  test('hij rekent niets weg: kijken verandert niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate((m) => { dagTarget(m); dagGevoeligheid(m); dagVarBlok(m); }, CUR);
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });
});

test.describe('b · de kaart staat onder Verdieping', () => {
  test('ingeklapt, met dagbedrag en target in de kop', async ({ page }) => {
    await boot(page, seed({ openDagVar: false }));
    await page.evaluate(() => go('ins'));
    const t = await page.locator('#s-ins').innerText();
    expect(t).toContain('PER DAG');
    const sam = await page.evaluate((m) => dagVarSamenvatting(m), CUR);
    expect(sam).toMatch(/per dag/);
    expect(sam).toMatch(/richtlijn|target/);
    expect(t).toContain(sam);
  });

  test('uitgeklapt toont de grafiek van renderDailyVar', async ({ page }) => {
    await boot(page, seed({ openDagVar: true }));
    await page.evaluate(() => go('ins'));
    const t = await page.locator('#s-ins').innerText();
    expect(t).toMatch(/variabele uitgave per dag/i);   // .hlabel rendert in hoofdletters
    expect(await page.locator('#s-ins .daily').count()).toBeGreaterThan(0);
  });

  test('renderDailyVar zelf is niet gewijzigd, hij wordt alleen aangeroepen', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => renderDailyVar.toString());
    expect(src).toContain('const autoDay=Math.max(budget - sv.fixed,0)/de.dim');
    expect(src).not.toContain('dagTarget');
    expect(await page.evaluate((m) => dagVarBlok(m).startsWith(renderDailyVar(m, totals(m).budget)), CUR)).toBe(true);
  });
});

test.describe('c · de gevoeligheidsregel', () => {
  test('spiegel, bedrag per jaar en beide richtingen', async ({ page }) => {
    await boot(page, metDoel());
    const h = await page.evaluate((m) => dagGevoeligheid(m), CUR);
    expect(h).toMatch(/Je zit op .* per dag, tegen (een target|een richtlijn) van/);
    expect(h).toContain('Eén euro per dag is €365 per jaar');
    expect(h).toMatch(/erbij/);
    expect(h).toMatch(/eraf/);
    // geen aanmoediging, geen advies, geen uitroepteken
    expect(h).not.toMatch(/!|bespaar|goed bezig|gefeliciteerd|probeer/i);
  });

  test('deze maand rekent via safeToSpend, niet zelf', async ({ page }) => {
    await boot(page, metDoel());
    const r = await page.evaluate((m) => {
      const D = dagTarget(m), S = safeToSpend();
      return { rest: D.dim - D.elapsed, safe: S.safe, h: dagGevoeligheid(m) };
    }, CUR);
    if (r.rest > 0) {
      expect(r.h).toContain(`over de ${r.rest} dagen die nog komen`);
      expect(r.h).toContain(`op €${r.safe.toLocaleString('nl-NL')} die je nu vrij hebt`);
    }
  });

  test('het doel loopt door doelTempo, met het gat in beide richtingen', async ({ page }) => {
    await boot(page, metDoel());
    const r = await page.evaluate((m) => {
      const G = maandDoel();
      const alloc = Math.max(Math.round(+G.p.alloc || 0), 0);
      return { nu: G.T, alloc, meer: doelTempo(G.p, alloc + 30), minder: doelTempo(G.p, alloc - 30),
        h: dagGevoeligheid(m) };
    }, CUR);
    // doelTempo klemt alloc op 0, dus 'eraf' beweegt alleen zover er inleg is
    expect(r.meer.gat).toBe(r.nu.benodigd - (r.alloc + 30));
    expect(r.minder.gat).toBe(r.nu.benodigd - Math.max(r.alloc - 30, 0));
    expect(r.h).toContain('Vakantie');
    expect(r.h).toContain(`${r.nu.benodigd.toLocaleString('nl-NL')} per maand`);
  });

  test('geen doel met streefdatum: die regel valt weg, de rest blijft', async ({ page }) => {
    await boot(page, seed({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 2400, gespaard: 0, perMaand: 100 }] }));
    const h = await page.evaluate((m) => dagGevoeligheid(m), CUR);
    expect(h).not.toContain('Vakantie');
    expect(await page.evaluate(() => maandDoel())).toBe(null);
    const D = await dt(page, CUR);
    if (D.dim - D.elapsed > 0) expect(h).toContain('Deze maand');
  });

  test('geen enkele horizon: geen regel, geen lege kaart', async ({ page }) => {
    // afgeronde maand (geen resterende dagen) en geen doel met streefdatum
    await boot(page, seed({ goals: [] }));
    expect(await page.evaluate((m) => dagGevoeligheid(m), M1)).toBe('');
  });

  test('onbekend saldo geeft geen bedrag voor deze maand', async ({ page }) => {
    await boot(page, metDoel({ manualBal: {} }));
    const r = await page.evaluate((m) => ({ known: totalBalance().known, h: dagGevoeligheid(m) }), CUR);
    expect(r.known).toBe(0);
    expect(r.h).not.toContain('die je nu vrij hebt');
  });
});

test.describe('d · randgevallen van de kaart', () => {
  test('geen budget en geen dagbudget: geen kaart', async ({ page }) => {
    await boot(page, seed({ budgets: {}, income: 0, autoIncome: false }));
    const D = await dt(page, CUR);
    expect(D.target).toBe(0);
    expect(await page.evaluate((m) => dagVarBlok(m), CUR)).toBe('');
    expect(await page.evaluate((m) => dagVarSamenvatting(m), CUR)).toBe('');
  });

  test('zonder FIRE-instelling blijft de rest gewoon staan', async ({ page }) => {
    await boot(page, metDoel({ assets: [], fireSpend: 0 }));
    const h = await page.evaluate((m) => dagGevoeligheid(m), CUR);
    expect(h).toContain('Vakantie');            // de horizonnen die wél kunnen, blijven
    expect(h).not.toMatch(/bereikjaar|FIRE/i);  // en er wordt niets over je horizon beweerd
  });
});

test.describe('e · de drie oude afleidingen zijn bewust ongemoeid', () => {
  // De meting liet zien dat alle drie afwijken zodra je vaste lasten niet precies gelijk zijn aan
  // je vaste potjes. Consolideren zou safeToSpend en de coachtekst stil verschuiven, dus dat is
  // niet gedaan. Deze test bewaakt dat het ook niet ongemerkt alsnog gebeurt.
  test('renderDailyRolling houdt zijn eigen rollende gemiddelde', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => renderDailyRolling.toString());
    expect(src).toContain('target=userDay>0?userDay:avg');
    expect(src).not.toContain('dagTarget');
  });

  test('renderWeekVarKPI houdt varRoom als terugval', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => renderWeekVarKPI.toString());
    expect(src).toContain('eb.varRoom');
    expect(src).not.toContain('dagTarget');
  });

  test('dayBudgetNow houdt zijn eigen afleiding', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => dayBudgetNow.toString());
    expect(src).toContain('typFixed');
    expect(src).not.toContain('dagTarget');
  });

  test('en ze wijken aantoonbaar af zodra vast en potje uiteenlopen', async ({ page }) => {
    await boot(page, seed({}, { huur: 1000 }));      // vaste last 1000, vast potje 900
    const r = await page.evaluate((m) => {
      const de = daysElapsed(m), sv = splitFixedVar(m), eb = effectiveBudgets(m);
      const varPool = totalBudget() > 0 ? eb.varRoom : Math.max(totals(m).limit - sv.fixed, 0);
      return { dag: dagTarget(m).target, week: varPool / de.dim, dagBudget: dayBudgetNow().dagdoel };
    }, CUR);
    expect(Math.round(r.dag)).not.toBe(Math.round(r.week));
    expect(Math.round(r.dag)).not.toBe(r.dagBudget);
  });

  test('safeToSpend geeft nog exact zijn eigen uitkomst', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => safeToSpend.toString());
    expect(src).not.toContain('dagTarget');
    const S = await page.evaluate(() => safeToSpend());
    expect(S.safe).toBe(Math.round(S.spendSaldo + S.incDue - S.fixDue - S.reserved - S.saveReserved));
  });
});
