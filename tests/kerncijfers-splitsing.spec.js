// v161: de kerncijfers meten het eigen systeem in plaats van 50/30/20, en staan op twee schermen.
// Structureel (spaarquote, vaste-lastendruk) op het maandscherm, operationeel (budgetnaleving,
// variabele-lastendruk) op Inzichten. De restsaldo-quote is vervallen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('./klok');

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
  await page.waitForFunction(() => typeof vermogensInleg === 'function');
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
    expect(r.src).toContain('return Math.round(net);');   // v420: dezelfde afronding, zonder de klem op nul (besluit van de gebruiker)
    expect(r.src).not.toContain('Math.max(Math.round(net),0)');
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

});

test.describe('b · de splitsing over twee schermen', () => {

  /* v208: Inzichten draagt geen kerncijfers meer. Budgetnaleving stond al in de hero, in dezelfde
     eenheid en uit dezelfde bron, en de variabele-lastendruk stuurde niets: je potjes zijn de norm
     voor variabele lasten, en een percentage met je totale uitgaven als noemer daalt zodra je vaste
     lasten stijgen. Beide cijfers worden nog berekend; ze hebben alleen geen tegel meer. */
  test('Inzichten draagt geen kerncijfers meer', async ({ page }) => {
    await boot(page);
    const ins = await page.evaluate(() => { go('ins'); return $('#s-ins').innerHTML; });
    expect(ins).not.toContain('data-kpi=');
    expect(await page.evaluate(() => typeof insKpiStrip)).toBe('undefined');
  });

  /* v209: de vaste-lastendruk is van het maandscherm af. Hij had geen doel, stond vaak op een te
     klein grondtal, en je stuurt er niet op: vaste lasten verander je door op te zeggen of te
     verhuizen, niet door naar een percentage te kijken. De spaarquote blijft: die telt sinds v161
     je hele vermogensopbouw en verandert wel met wat je doet. */


  /* v194: een sparkline rendert pas vanaf GRAFIEK_MIN volle maanden; deze fixture zit daaronder.
     Wat de test bewaakt is dat beide schermen dezelfde renderer gebruiken en dus dezelfde vorm
     tonen, dus toetsen we dat ze dezelfde keuze maken - lijn of delta-zin - en niet dat er per se
     een lijn staat. */
  /* v208: er is nog één scherm met tegels, dus 'beide schermen dezelfde vorm' valt weg. Wat blijft
     is dat de vorm onder de tegel er staat: een lijn zodra er genoeg maanden zijn, anders de
     delta-zin. */
});

test.describe('c · geen verzonnen norm', () => {


  // v161 haalde 50/30/20 onder de kerncijfers weg en liet de kaart staan; v165 haalde ook die weg,
  // want hij had geen aanroeper meer en daarmee stuurde de hele norm-laag niets.

});

test.describe('d · klein grondtal', () => {


});

test.describe('e · loopt nog, en de rustige modus', () => {


  /* v209: bij één cijfer valt er niets uit te klappen, dus de 'toon beide kerncijfers'-knop is
     vervallen. Hij zou een dode knop zijn. SET.kpiAllMaand blijft ongelezen achter, net als
     SET.kpiAll na v208; een achtergebleven waarde mag niets meer doen. */

});
