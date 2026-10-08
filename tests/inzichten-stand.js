/* v359: DE STAND VAN 7 OKTOBER 2026 voor Inzichten als dashboard. UIT DE MOCKUP (v8, "echt"): uitgegeven
   EUR 406, nog te betalen vast EUR 817, nog te ontvangen EUR 5.216 (salaris, nog niets binnen), nog te sparen
   EUR 2.431 (EUR 2.200 plus EUR 231 dat je eruit haalde), contant EUR 80, en de vier patronen: Vices
   structureel (potje EUR 20, gewoonlijk rond EUR 120, in september EUR 103 erboven), Uit eten herhaalt zich
   (september EUR 194 boven, een uitzondering genoemd, oktober loopt weer voor met verwacht EUR 130 erboven),
   Allianz EUR 98,88 nieuw op 1 oktober onder Vervoer, en Boodschappen herstelt zich (september EUR 84 boven,
   oktober EUR 49 tegen gewoonlijk EUR 79).
   GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. De vaste lasten die nog
   komen zijn de lease (EUR 537 op de 14e), Zilveren Kruis (164, de 20e), Basic Fit (73, de 18e) en Netflix
   (43, de 15e): samen 817, en alle vier NA vandaag, zodat het tempo tot vandaag geen vaste last draagt.
   Het maandbudget is EUR 3.376, zodat nog in potjes EUR 2.153 is (budget = uitgegeven + nog in potjes +
   nog te betalen, v327); vakantie draagt de rest. HET TEMPO VAN DE MOCKUP (EUR 490) WAS EEN VOORBEELD:
   op deze stand is het variabele deel EUR 2.559, en dat naar rato op dag 7 van 31 is EUR 578. */
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', SPAAR = 'NL01SAVE0000004323';
const DAG = '2026-10-07';
const BUDGETS = { boodschappen: 400, vervoer: 917, uiteten: 150, vices: 20, abonnement: 113, verzekering: 164, sport: 73, shopping: 300, vakantie: 1239 };
const MAANDEN = ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];

function seed(o) {
  o = o || {};
  const tx = [], ovr = {};
  const add = (id, date, amount, name, desc, acc) =>
    tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of MAANDEN) {
    if (!o.zonderInkomen) add('sal' + m, m + '-25', 5216, 'Werkgever', 'SALARIS LOON');
    if (!o.zonderVast) {
      add('lea' + m, m + '-14', -537, 'Hiltermann Lease', 'SEPA INCASSO HILTERMANN LEASECONTRACT');
      add('zk' + m, m + '-20', -164, 'Zilveren Kruis', 'SEPA INCASSO ZILVEREN KRUIS ZORGVERZEKERING');
      add('bf' + m, m + '-18', -73, 'Basic Fit', 'SEPA INCASSO BASIC FIT');
      add('nf' + m, m + '-15', -43, 'Netflix', 'SEPA INCASSO NETFLIX INTERNATIONAL');
    }
    add('ah1' + m, m + '-03', -79, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('ah2' + m, m + '-20', m === '2026-09' && !o.sepNormaal ? -405 : -321, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('lo1' + m, m + '-04', -40, 'Restaurant Lona', 'BEA, BETAALPAS RESTAURANT LONA');
    add('lo2' + m, m + '-22', m === '2026-09' ? -304 : -103, 'Restaurant Lona', 'BEA, BETAALPAS RESTAURANT LONA');
    add('vic' + m, m + '-15', m === '2026-09' ? -123 : -120, 'Coffeeshop', 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING');
    add('sh' + m, m + '-05', -68, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
    add('bol' + m, m + '-10', -30, 'Bol.com', 'BEA, BETAALPAS BOL.COM');
  }
  add('alz10', '2026-10-01', -98.88, 'Allianz Nederland', 'SEPA INCASSO ALLIANZ NEDERLAND SCHADE');
  add('ah10', '2026-10-03', -49, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('lo10', '2026-10-04', -110, 'Restaurant Lona', 'BEA, BETAALPAS RESTAURANT LONA');
  add('sh10', '2026-10-05', -68, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
  add('bol10', '2026-10-06', -80.12, 'Bol.com', 'BEA, BETAALPAS BOL.COM');
  if (!o.zonderSparen) { add('spr10', '2026-10-02', -231, 'Eigen rekening', 'OVERBOEKING NAAR EIGEN REKENING', SPAAR); }
  (o.extraTx || []).forEach((t) => add(t.id, t.date, t.amount, t.name, t.desc, t.acc));
  if (o.vanaf) for (let i = tx.length - 1; i >= 0; i--) if (tx[i].date < o.vanaf) tx.splice(i, 1);
  if (o.tot) for (let i = tx.length - 1; i >= 0; i--) if (tx[i].date >= o.tot) tx.splice(i, 1);
  const log = {
    '2026-09|uiteten': { id: '2026-09|uiteten', maand: '2026-09', categorie: 'Uit eten & café', potjeId: 'uiteten', actie: 'geen', over_eind_maand: 194, antwoord: { keuze: 'uitzondering', op: '2026-10-02' } },
    '2026-09|vices': { id: '2026-09|vices', maand: '2026-09', categorie: 'Vices', potjeId: 'vices', actie: 'geen', over_eind_maand: 103 },
    '2026-09|boodschappen': { id: '2026-09|boodschappen', maand: '2026-09', categorie: 'Boodschappen', potjeId: 'boodschappen', actie: 'geen', over_eind_maand: 84 },
  };
  /* sepNormaal: Boodschappen bleef in september binnen zijn potje (geen log-record, gewone maand). Dan is
     "achter op het gewone tempo" in oktober geen herstel, want er was niets om van te herstellen. */
  if (o.sepNormaal) delete log['2026-09|boodschappen'];
  const set = Object.assign({
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 5216, budgetMonth: '2026-10',
    manualBal: { [MAIN]: 3000, [SPAAR]: 9000 }, savingsAcc: { [SPAAR]: true },
    budgets: Object.assign({}, BUDGETS), savingMode: 'amount', savingAmount: o.zonderSparen ? 0 : 2200, nfToegewezen: 9000,
    maandGelezen: '2026-10-01', afsluitPopup: { dag: DAG }, valtOpLog: log,
    maandAfsluiting: { '2026-09': { op: '2026-10-02', punten: [] } },
  }, o.zonderContant ? {} : { contant: { stand: 80, datum: '2026-10-02', op: 1 } }, o.set || {});
  if (o.zonderSparen) delete set.savingsAcc;
  return { minder_tx: JSON.stringify(tx), minder_ovr: JSON.stringify(ovr), minder_set: JSON.stringify(set),
    minder_own: JSON.stringify(o.zonderSparen ? [MAIN] : [MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, (o && o.dag) || DAG);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderIns === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  /* Allianz staat onder Vervoer door een eigen keuze (OVR), zoals in de mockup. De id van een boeking wordt
     bij de boot opnieuw uitgerekend (categorize), dus de keuze wordt na de boot gezet, langs de route van de app. */
  await page.evaluate(() => { const t = TX.find((x) => x.name === 'Allianz Nederland'); if (t) { OVR[t.id] = 'vervoer'; save(); render(); } });
}
module.exports = { boot, seed, DAG, BUDGETS, MAIN, SPAAR };
