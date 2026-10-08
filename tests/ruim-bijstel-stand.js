/* v358: de stand van de gebruiker bij de mockup "te ruime potjes bijstellen". UIT DE MELDING: Verzekeringen
   EUR 335, gewoonlijk EUR 164 (Zilveren Kruis, elke maand), DELA EUR 160 per kwartaal (maart, juni,
   september, dus de volgende in december), Vices EUR 20 terwijl je er gewoonlijk EUR 120 aan uitgeeft, Huur
   EUR 750 zonder betaling, en een spaarinleg van EUR 2.200 per maand. GECONSTRUEERD: de andere potjes
   (boodschappen, uit eten) en hun boekingen, zodat ze niet ruim zijn en niet onder de hint vallen. */
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', SPAAR = 'NL01SAVE0000004323';
const DAG = '2026-10-06';
const BUDGETS = { huur: 750, verzekering: 335, boodschappen: 1100, vices: 20, uiteten: 150 };

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, date, amount, name, desc) =>
    tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) {
    add('sal' + m, m + '-25', 5000, 'Werkgever', 'SALARIS LOON');
    add('zk' + m, m + '-20', -164, 'Zilveren Kruis', 'SEPA INCASSO ZILVEREN KRUIS ZORGVERZEKERING');
    add('vic' + m, m + '-15', -120, 'Coffeeshop', 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING');
    add('ah1' + m, m + '-03', -79, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('ah2' + m, m + '-20', -480, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('lon' + m, m + '-22', -140, 'Restaurant Lona', 'BEA, BETAALPAS RESTAURANT LONA');
  }
  for (const m of ['2026-03', '2026-06', '2026-09'])
    add('dela' + m, m + '-26', -160, 'DELA Natura- en levensv', 'SEPA INCASSO DELA NATURA- EN LEVENSV');
  add('ah10', '2026-10-03', -49, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('lon10', '2026-10-04', -75, 'Restaurant Lona', 'BEA, BETAALPAS RESTAURANT LONA');
  (o.extraTx || []).forEach((t) => add(t.id, t.date, t.amount, t.name, t.desc));
  const set = Object.assign({
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 5000, budgetMonth: '2026-10',
    manualBal: { [MAIN]: 3000, [SPAAR]: 9000 }, savingsAcc: { [SPAAR]: true },
    budgets: Object.assign({}, BUDGETS), savingMode: 'amount', savingAmount: 2200, nfToegewezen: 9000,
    maandGelezen: '2026-10-01', afsluitPopup: { dag: DAG },
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
module.exports = { boot, seed, BUDGETS, DAG };
