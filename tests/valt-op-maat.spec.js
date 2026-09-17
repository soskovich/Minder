// v230: signaal 2 van insSignals() ('bovengemiddeld aandeel') vuurt op een AANDEEL: het deel van je
// uitgaven dat naar een categorie gaat, tegen het gemiddelde aandeel over de drie maanden ervoor.
// b: de kaart toonde bedragen ('€906, jouw gemiddelde €1.136') en de zin beweerde een bedrag ('veel
// meer kwijt'). Die twee maten lopen uiteen zodra het maandtotaal beweegt. Zuiverste vorm:
// hetzelfde bedrag als het gemiddelde, en toch 'veel meer'. Tekst en getal dragen nu de maat van de
// conditie.
// a1: alleen op een afgeronde maand. Het aandeel van een halve maand tegen drie hele is geen
// vergelijking; wat de kaart dan toont verdwijnt zodra de maand vol loopt. De kaart mag in de
// lopende maand leeg zijn.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const mnd = (i) => ym(new Date(now.getFullYear(), now.getMonth() - i, 1));
const CUR = mnd(0), M1 = mnd(1);
const MAIN = 'NL01MAIN0000001111';

/* Drie hele maanden (i=4..2) met huur 2000 op een totaal van 8000 (aandeel 25%). Daarna vorige
   maand (M1), afgerond, met maar 4406 uitgegeven: huur nog steeds 2000, aandeel 45%. Vervoer ligt
   daar met 906 onder zijn gemiddelde van 1136 en heeft een potje van 1200 waar het onder blijft.
   De lopende maand heeft tot nu toe precies hetzelfde patroon als M1: dezelfde conditie is waar,
   maar het is een halve maand. */
function seed() {
  const tx = [];
  const add = (id, m, day, amount, name, desc) => tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (let i = 4; i >= 2; i--) {
    const m = mnd(i);
    add('i' + m, m, '01', 5000, 'Werkgever', 'SALARIS LOON');
    add('v' + m, m, '03', -1136, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
    add('h' + m, m, '02', -2000, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '10', -2500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('e' + m, m, '20', -2364, 'Restaurant', 'BEA, BETAALPAS RESTAURANT');
  }
  for (const m of [M1, CUR]) {
    add('i' + m, m, '01', 5000, 'Werkgever', 'SALARIS LOON');
    add('v' + m, m, '01', -906, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
    add('h' + m, m, '01', -2000, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '01', -1500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  const set = { limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 5000, insPeriod: 'month',
    manualBal: { [MAIN]: 4000 }, budgets: { vervoer: 1200, huur: 2000, boodschappen: 2500, uiteten: 2400 }, budgetMonth: CUR };
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insSignals === 'function');
}
const meet = (page, m) => page.evaluate(([m, nu]) => {
  const mv = monthVsPrevInner(m); const ex = new Set([...mv.drivers, ...budgetFlaggedCats(m)]);
  const alle = insSignals(m, ex).sort((a, b) => b.pri - a.pri);
  const d = document.createElement('div'); d.innerHTML = whatStandsOutLine(m, nu);
  const cur = catSpendMap(m); const tot = Object.values(cur).reduce((a, b) => a + b, 0);
  return { s: alle[0] || null, pris: alle.map((s) => s.pri), kaart: d.innerText.replace(/\s+/g, ' ').trim(),
    huur: cur.huur, aandeel: Math.round(cur.huur / tot * 100), flagged: [...budgetFlaggedCats(m)] };
}, [m, m === CUR]);

test.describe('a - het signaal noemt de maat waarop het vuurt (op een afgeronde maand)', () => {
  test('de fixture is het zuiverste geval: hetzelfde bedrag, groter aandeel', async ({ page }) => {
    await boot(page);
    const r = await meet(page, M1);
    expect(r.s).toBeTruthy();
    expect(r.s.pri).toBe(7);
    expect(r.s.kpiLabel).toBe('Huur');
    expect(r.huur).toBe(2000);            // precies het gemiddelde bedrag
    expect(r.aandeel).toBe(45);
  });

  test('getal en vergelijking zijn een aandeel, geen bedrag', async ({ page }) => {
    await boot(page);
    const r = await meet(page, M1);
    expect(r.s.kpiVal).toBe('45% van je uitgaven');       // 2000 / 4406
    expect(r.s.kpiSub).toBe('was gemiddeld 25%');         // 2000 / 8000
    expect(r.s.kpiVal).not.toContain('€');
    expect(r.s.kpiSub).not.toContain('€');
    expect(r.s.kpiSub).not.toContain('jouw gemiddelde');
  });

  test('de zin beweert wat de conditie meet', async ({ page }) => {
    await boot(page);
    const r = await meet(page, M1);
    expect(r.s.hyp).toBe('Aan huur gaat dit keer een groter deel van je uitgaven dan je gewend bent.');
    expect(r.s.hyp).not.toContain('meer kwijt');
    expect(r.kaart).toContain('Huur · 45% van je uitgaven (was gemiddeld 25%)');
    expect(r.kaart).toContain('een groter deel van je uitgaven');
    expect(r.kaart).not.toContain('veel meer kwijt');
  });

  test('de conditie zelf is niet aangeraakt: aandeel 12%, verschil 5 procentpunt, hoogste aandeel wint', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => insSignals.toString());
    expect(src).toContain('share>=0.12 && (share-avg)>=0.05 && (!best||share>best.share)');
  });
});

test.describe('b - in de lopende maand vuurt het niet, ook al is de conditie waar', () => {
  test('dezelfde cijfers als vorige maand, maar een halve maand: geen signaal 2', async ({ page }) => {
    await boot(page);
    const r = await meet(page, CUR);
    expect(r.aandeel).toBe(45);            // de conditie zou waar zijn
    expect(r.pris).not.toContain(7);
  });

  test('en de kaart is dan leeg, in plaats van onwaar', async ({ page }) => {
    await boot(page);
    const r = await meet(page, CUR);
    expect(r.s).toBeNull();
    expect(r.kaart).toBe('');
    // op Inzichten zelf: geen Valt-op-regel met een aandeel
    const ins = await page.evaluate(() => { go('ins'); return document.querySelector('#s-ins').innerText.replace(/\s+/g, ' '); });
    expect(ins).not.toContain('van je uitgaven (was gemiddeld');
  });

  test('op een afgeronde maand blijft de kaart hem tonen', async ({ page }) => {
    await boot(page);
    const r = await meet(page, M1);
    expect(r.kaart).toContain('45% van je uitgaven');
  });

  test('de poort is isLopendeMaand, dezelfde afbakening als de grafiek (v194)', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => insSignals.toString());
    expect(src).toContain('!isLopendeMaand(m)');
  });
});

test.describe('c - de uitsluiting is smaller dan zijn naam, en werkt zoals de comment zegt', () => {
  test('een categorie met een potje waar je onder blijft wordt niet uitgesloten', async ({ page }) => {
    await boot(page);
    const r = await meet(page, M1);
    expect(r.flagged).toEqual([]);   // vervoer heeft een potje van 1200 en staat op 906: niet geflagd
    const bron = await page.evaluate(() => budgetFlaggedCats.toString());
    expect(bron).toContain('if(a>+EB[k])');   // alleen een overschrijding telt
  });
});
