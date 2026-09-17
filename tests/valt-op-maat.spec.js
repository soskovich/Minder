// v230: signaal 2 van insSignals() ('bovengemiddeld aandeel') vuurt op een AANDEEL: het deel van je
// uitgaven dat naar een categorie gaat, tegen het gemiddelde aandeel over de drie maanden ervoor.
// De kaart toonde bedragen ('€906, jouw gemiddelde €1.136') en de zin beweerde een bedrag ('veel
// meer kwijt'). Die twee maten lopen uiteen zodra het maandtotaal beweegt: een lager totaal maakt
// elk aandeel groter terwijl het bedrag gelijk blijft of daalt. Zuiverste vorm: hetzelfde bedrag
// als het gemiddelde, en toch 'veel meer'. Tekst en getal dragen nu de maat van de conditie.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MAIN = 'NL01MAIN0000001111';

/* Drie hele maanden met huur 2000 op een totaal van 8000 (aandeel 25%), en een lopende maand waarin
   pas 4406 is uitgegeven: huur is nog steeds 2000, maar het aandeel is 45%. Vervoer ligt met 906
   onder zijn gemiddelde van 1136 en heeft een potje van 1200 waar het onder blijft. */
function seed() {
  const tx = [];
  const add = (id, m, day, amount, name, desc) => tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (let i = 3; i >= 1; i--) {
    const m = ym(new Date(now.getFullYear(), now.getMonth() - i, 1));
    add('i' + m, m, '01', 5000, 'Werkgever', 'SALARIS LOON');
    add('v' + m, m, '03', -1136, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
    add('h' + m, m, '02', -2000, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '10', -2500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('e' + m, m, '20', -2364, 'Restaurant', 'BEA, BETAALPAS RESTAURANT');
  }
  add('icur', CUR, '01', 5000, 'Werkgever', 'SALARIS LOON');
  add('vcur', CUR, '01', -906, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
  add('hcur', CUR, '01', -2000, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  add('acur', CUR, '01', -1500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  const set = { limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 5000, insPeriod: 'month',
    manualBal: { [MAIN]: 4000 }, budgets: { vervoer: 1200, huur: 2000, boodschappen: 2500, uiteten: 2400 }, budgetMonth: CUR };
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insSignals === 'function');
}
const top = (page) => page.evaluate((m) => {
  const mv = monthVsPrevInner(m); const ex = new Set([...mv.drivers, ...budgetFlaggedCats(m)]);
  const s = insSignals(m, ex).sort((a, b) => b.pri - a.pri)[0] || null;
  const d = document.createElement('div'); d.innerHTML = whatStandsOutLine(m, true);
  return { s, kaart: d.innerText.replace(/\s+/g, ' ').trim(), huur: catSpendMap(m).huur, flagged: [...budgetFlaggedCats(m)] };
}, CUR);

test.describe('a - het signaal noemt de maat waarop het vuurt', () => {
  test('de fixture is het zuiverste geval: hetzelfde bedrag, groter aandeel', async ({ page }) => {
    await boot(page);
    const r = await top(page);
    expect(r.s).toBeTruthy();
    expect(r.s.pri).toBe(7);
    expect(r.s.kpiLabel).toBe('Huur');
    expect(r.huur).toBe(2000);            // precies het gemiddelde bedrag
  });

  test('getal en vergelijking zijn een aandeel, geen bedrag', async ({ page }) => {
    await boot(page);
    const r = await top(page);
    expect(r.s.kpiVal).toBe('45% van je uitgaven');       // 2000 / 4406
    expect(r.s.kpiSub).toBe('was gemiddeld 25%');         // 2000 / 8000
    expect(r.s.kpiVal).not.toContain('€');
    expect(r.s.kpiSub).not.toContain('€');
    expect(r.s.kpiSub).not.toContain('jouw gemiddelde');
  });

  test('de zin beweert wat de conditie meet', async ({ page }) => {
    await boot(page);
    const r = await top(page);
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

test.describe('b - de uitsluiting is smaller dan hij leek, en werkt zoals de comment zegt', () => {
  test('een categorie met een potje waar je onder blijft wordt niet uitgesloten', async ({ page }) => {
    await boot(page);
    const r = await top(page);
    expect(r.flagged).toEqual([]);   // vervoer heeft een potje van 1200 en staat op 906: niet geflagd
    const bron = await page.evaluate(() => budgetFlaggedCats.toString());
    expect(bron).toContain('if(a>+EB[k])');   // alleen een overschrijding telt
  });
});
