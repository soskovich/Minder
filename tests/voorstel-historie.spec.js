// v112: gemeld — "Voorstel uit mijn historie" veranderde het budget van de lopende maand, terwijl
// Instellingen er vlak boven belooft dat een wijziging aan een bestaand potje pas vanaf de volgende
// maand geldt. Oorzaak: suggestBudgets() schreef rechtstreeks SET.budgets={...} en sloeg daarmee de
// 'volgende maand'-laag over die setCatBudget() wel gebruikt. Het voorstel is nu een wijziging als
// elke andere: bestaand potje -> SET.budgetsNext, alleen een nieuw potje start meteen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { open, seed, CUR, M1, M2, MAIN } = require('./budget-fixture');

// zelfde fixture, maar met een aangepaste potjes-set per test
function seedPot(mut) {
  const s = seed();
  const set = JSON.parse(s.minder_set);
  mut(set);
  return { ...s, minder_set: JSON.stringify(set) };
}

const staat = (page) => page.evaluate(() => ({
  budgets: JSON.parse(JSON.stringify(SET.budgets || {})),
  next: JSON.parse(JSON.stringify(SET.budgetsNext || {})),
  totaal: totalBudget(),
  gepland: plannedTotalBudget(),
}));

test.describe('a · de lopende maand ligt vast', () => {
  test('bestaande potjes blijven deze maand exact staan', async ({ page }) => {
    await open(page);
    const voor = await staat(page);
    await page.evaluate(() => suggestBudgets());
    const na = await staat(page);

    for (const k of Object.keys(voor.budgets)) {
      expect(na.budgets[k], `potje ${k} mag deze maand niet wijzigen`).toBe(voor.budgets[k]);
    }
    expect(na.totaal).toBe(voor.totaal);
  });

  test('het voorstel staat klaar voor volgende maand', async ({ page }) => {
    await open(page);
    const voor = await staat(page);
    await page.evaluate(() => suggestBudgets());
    const na = await staat(page);

    // er is iets gepland (de fixture-potjes staan bewust boven de historie)
    expect(Object.keys(na.next).length).toBeGreaterThan(0);
    expect(na.gepland).not.toBe(voor.totaal);
    // en elk gepland bedrag hoort bij een potje dat nu al bestaat
    for (const k of Object.keys(na.next)) expect(na.budgets[k]).toBeGreaterThan(0);
  });

  test('een potje zonder historie vervalt pas volgende maand, niet nu', async ({ page }) => {
    // shopping heeft geen transacties in de fixture -> het voorstel zet het op nul
    await open(page);
    await page.evaluate(() => suggestBudgets());
    const na = await staat(page);
    expect(na.budgets.shopping).toBe(255);   // deze maand nog gewoon je potje
    expect(na.next.shopping).toBe(0);        // volgende maand weg
  });
});

test.describe('b · een nieuw potje mag wel meteen', () => {
  test('categorie zonder potje krijgt er direct een, zoals bij setCatBudget', async ({ page }) => {
    await open(page, seedPot((set) => { delete set.budgets.uiteten; delete set.budgetsNext.uiteten; }));
    const voor = await staat(page);
    expect(voor.budgets.uiteten).toBeUndefined();

    await page.evaluate(() => suggestBudgets());
    const na = await staat(page);
    expect(na.budgets.uiteten).toBeGreaterThan(0);   // nieuw potje = meteen actief
    expect(na.next.uiteten).toBeUndefined();          // en dus niets in de wachtlaag
    expect(na.budgets.boodschappen).toBe(voor.budgets.boodschappen);   // de rest blijft staan
  });
});

test.describe('c · de knop belooft wat hij doet', () => {
  test('de bevestiging noemt de volgende maand, niet "wordt overschreven"', async ({ page }) => {
    await open(page);
    const html = await page.evaluate(() => { openSet('budget'); return document.getElementById('sheet').innerHTML; });
    expect(html).toContain('Voorstel uit mijn historie');
    const conf = (html.match(/confirm\(&quot;?'?([^'&]*voorstellen[^'&]*)/) || [])[1] || html;
    expect(conf).toMatch(/volgende maand/);
    expect(conf).toMatch(/lopende maand/);
  });
});

test.describe('d · de mediaan telt alleen afgeronde maanden (v113, zoals v107)', () => {
  // boodschappen: 400 in beide afgeronde maanden, deze maand pas 300 (halve maand).
  // Mediaan over [400,400] = 400; zou de lopende maand meetellen, dan [300,400,400] -> ook 400,
  // dus we maken het verschil zichtbaar met een categorie die deze maand ver achterloopt.
  // M2 200, M1 400, lopende maand tot nu toe 100. Mediaan over de afgeronde maanden [200,400]
  // = 400 (med() pakt de bovenste bij een even reeks). Telde de lopende maand mee, dan is het
  // [100,200,400] -> 200. Ruimte is bewust ruim (limiet 100%, geen vaste lasten), zodat scaleV 1
  // is en het voorstel exact de mediaan is: het verschil 400 vs 200 is dus direct af te lezen.
  function seedHalve() {
    const tx = [];
    const add = (id, m, day, amount, name, desc) =>
      tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    for (const [m, bedrag] of [[M2, 200], [M1, 400], [CUR, 100]]) {
      add('inc-' + m, m, '01', 3000, 'Werkgever', 'SALARIS LOON');
      add('ah-' + m, m, '08', -bedrag, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    }
    return {
      minder_tx: JSON.stringify(tx), minder_ovr: '{}',
      minder_set: JSON.stringify({ limit: 100, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000, budgets: {}, budgetMonth: CUR, budgetAdv: true }),
      minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
    };
  }

  test('een half uitgegeven lopende maand drukt het voorstel niet omlaag', async ({ page }) => {
    await open(page, seedHalve());
    const meting = await page.evaluate(() => {
      const som = (m) => { let s = 0; for (const t of txOfMonth(m)) if (catOf(t) === 'boodschappen' && !isFixed(t)) s += -t.amount; return s; };
      const nu = nowYMstr();
      const af = months().filter((m) => m < nu);
      suggestBudgets();
      return { af: af.map(som), lop: som(nu), voorstel: (SET.budgets || {}).boodschappen };
    });
    expect(meting.af).toEqual([200, 400]);   // de twee afgeronde maanden
    expect(meting.lop).toBe(100);            // de lopende, nog niet af
    expect(meting.voorstel).toBe(400);       // mediaan van [200,400]; met de lopende erbij was het 200
  });

  test('zonder afgeronde maand blijft de lopende de enige bron, met een waarschuwing', async ({ page }) => {
    // alleen transacties in de lopende maand
    const tx = [
      { id: 'i1', date: `${CUR}-01`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
      { id: 'a1', date: `${CUR}-05`, amount: -220, acc: MAIN, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    ];
    const payload = {
      minder_tx: JSON.stringify(tx), minder_ovr: '{}',
      minder_set: JSON.stringify({ limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000, budgets: {}, budgetMonth: CUR, budgetAdv: true }),
      minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
    };
    await open(page, payload);

    const melding = [];
    page.on('dialog', (d) => { melding.push(d.message()); d.dismiss(); });
    const na = await page.evaluate(() => { suggestBudgets(); return JSON.parse(JSON.stringify(SET.budgets || {})); });

    expect(na.boodschappen).toBeGreaterThan(0);          // een verse import levert wel degelijk een voorstel op
    expect(melding.join(' ')).toMatch(/geen afgeronde maand/);
  });
});
