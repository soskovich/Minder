/* v349: DE STAND VAN 6 OKTOBER 2026, met de getallen van de gebruiker op de kaart "Deze maand":
   maandbudget EUR 3.375, uitkomst EUR 2.672 (EUR 703 onder), Vices EUR 83 boven, Boodschappen EUR 61
   boven, en de rest samen EUR 847 onder.
   GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. De fixture draagt
   dezelfde vijf getallen en dezelfde twee gevallen die de ronde onderscheidt:
   - VICES: nog niets uitgegeven in zes dagen (en in juli tot en met september ook niet in de eerste zes
     dagen), maar gewoonlijk EUR 133 in de rest van de maand tegen een potje van EUR 50. Dat is "past
     niet in je potje" en NIET "loopt voor": het tempo is niet hoger dan normaal.
   - BOODSCHAPPEN: EUR 200 in zes dagen tegen gemiddeld EUR 100 in dezelfde dagen, en een gewoon
     patroon van EUR 461 tegen een potje van EUR 500. Dat is "loopt voor" en niet "past niet".
   DE REST KOMT UIT DE VASTE LASTEN EN UIT EEN CATEGORIE ZONDER POTJE, en dat is een keuze van de
   fixture: met een derde potje dat afwijkt zou dat potje een eigen stap krijgen (hooguit drie los) en
   zou de rest een ander getal zijn. Verzekeringen (potje 675, incasso 150), abonnementen (100 tegen 30)
   en sport (600 tegen 73) staan samen EUR 1.122 onder, uit eten zonder potje komt op EUR 275, en dat
   is samen EUR 847 onder.
   DE OPTELLING: uitgegeven 1.725 (huur 1.450, boodschappen 200, uit eten 75), vast nog 253 (150 + 30 +
   73), variabel verwacht 694 (vices 133, boodschappen 361, uit eten 200): 2.672. */
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', SPAAR = 'NL01SAVE0000004323';
const DAG = '2026-10-06';
const BUDGETS = { huur: 1450, verzekering: 675, abonnement: 100, sport: 600, vices: 50, boodschappen: 500 };

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, date, amount, name, desc) =>
    tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    add('sal' + m, m + '-25', 5000, 'Werkgever', 'SALARIS LOON');
    add('huur' + m, m + '-01', -1450, 'Wooncorporatie', 'SEPA INCASSO WOONCORPORATIE HUURBETALING');
    add('verz' + m, m + '-20', -150, 'Centraal Beheer', 'SEPA INCASSO CENTRAAL BEHEER POLIS');
    add('abo' + m, m + '-15', -30, 'Netflix', 'SEPA INCASSO NETFLIX INTERNATIONAL');
    add('spo' + m, m + '-18', -73, 'Basic Fit', 'SEPA INCASSO BASIC FIT');
    add('vic' + m, m + '-15', -133, 'Coffeeshop', 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING');
    add('ah1' + m, m + '-03', -100, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('ah2' + m, m + '-20', -361, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('lon' + m, m + '-20', -200, 'Restaurant Lona', 'BEA, BETAALPAS RESTAURANT LONA');
  }
  add('huur10', '2026-10-01', -1450, 'Wooncorporatie', 'SEPA INCASSO WOONCORPORATIE HUURBETALING');
  add('ah10', '2026-10-03', -200, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('lon10', '2026-10-04', -75, 'Restaurant Lona', 'BEA, BETAALPAS RESTAURANT LONA');
  (o.extraTx || []).forEach((t) => add(t.id, t.date, t.amount, t.name, t.desc));
  const set = Object.assign({
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 5000, budgetMonth: '2026-10',
    manualBal: { [MAIN]: 2000, [SPAAR]: 9000 }, savingsAcc: { [SPAAR]: true },
    budgets: Object.assign({}, BUDGETS), savingMode: 'amount', savingAmount: 400, nfToegewezen: 9000,
    maandGelezen: '2026-10-01',
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, (o && o.dag) || DAG);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandVooruit === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}
module.exports = { boot, seed, DAG, BUDGETS, MAIN };
