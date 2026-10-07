/* v354: de stand van het toestel zoals gemeld bij de mockup "vast en variabel": een potje Huur van EUR 750
   waar deze maand geen betaling tegenover staat en ook geen incasso meer verwacht wordt, naast vaste lasten
   die wel komen (een lease-incasso van EUR 537 op de 14e, een verzekering van EUR 164 op de 20e) en
   variabele potjes (boodschappen, vices, uit eten). De boekingen van juni tot en met september geven de
   vooruitblik zijn drie afgeronde maanden. GECONSTRUEERD in de vorm van het toestel, niet de getallen zelf:
   alleen het potje Huur van EUR 750 zonder betaling, de lease van EUR 537 en Zilveren Kruis van EUR 164 komen
   uit de melding.
   v355: VERVOER IS GEMENGD, zoals op het toestel: de lease is een herkende incasso (het vaste deel) en tanken
   (Shell, EUR 45 op de 9e en de 23e, en EUR 55 op 2 oktober) is het variabele deel. HUUR heeft geen herkende
   betaling en is dus variabel tot je hem bewust op vast zet (o.set.potAard). */
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', SPAAR = 'NL01SAVE0000004323';
const DAG = '2026-10-06';
const BUDGETS = { huur: 750, vervoer: 600, verzekering: 175, boodschappen: 500, vices: 50, uiteten: 70 };

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, date, amount, name, desc) =>
    tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    add('sal' + m, m + '-25', 5000, 'Werkgever', 'SALARIS LOON');
    add('lea' + m, m + '-14', -537, 'Auto Lease', 'SEPA INCASSO AUTO LEASE CONTRACT');
    add('zk' + m, m + '-20', -164, 'Zilveren Kruis', 'SEPA INCASSO ZILVEREN KRUIS ZORGVERZEKERING');
    add('vic' + m, m + '-15', -133, 'Coffeeshop', 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING');
    add('ah1' + m, m + '-03', -79, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('ah2' + m, m + '-20', -480, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('lon' + m, m + '-22', -140, 'Restaurant Lona', 'BEA, BETAALPAS RESTAURANT LONA');
    add('sh1' + m, m + '-09', -45, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');   // v355: tanken in hetzelfde potje als de lease
    add('sh2' + m, m + '-23', -45, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
  }
  add('ah10', '2026-10-03', -49, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('sh10', '2026-10-02', -55, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
  add('lon10', '2026-10-04', -75, 'Restaurant Lona', 'BEA, BETAALPAS RESTAURANT LONA');
  (o.extraTx || []).forEach((t) => add(t.id, t.date, t.amount, t.name, t.desc));
  const set = Object.assign({
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 5000, budgetMonth: '2026-10',
    manualBal: { [MAIN]: 3000, [SPAAR]: 9000 }, savingsAcc: { [SPAAR]: true },
    budgets: Object.assign({}, BUDGETS), savingMode: 'amount', savingAmount: 400, nfToegewezen: 9000,
    maandGelezen: '2026-10-01', afsluitPopup: { dag: DAG },   // de pop-up van de maandafsluiting is vandaag al getoond
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
