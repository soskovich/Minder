/* v332: het geval van de gebruiker. EUR 100 op 29 september naar Stichting Beheer Derdengelden, op
   Sparen & beleggen, en die hoort bij de bezitting Peaks (Kayani). De voorwaarden voor beleggen zijn
   niet gehaald door de dekking van de reserveringen: EUR 37 in de pot tegen een boete van EUR 299 in
   november. Buffer en doel staan goed, zodat de dekking de enige voorwaarde is die ontbreekt.
   De klok staat op 30 september 2026, zodat september de lopende maand is. */
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', SPAAR = 'NL01SAVE0000004323', RES = 'NL01RESV0000007586';
const DAG = '2026-09-30';
const STICHTING_DESC = 'STICHTING BEHEER DERDENGELDEN PEAKS KLANT 7712345 KAYANI INLEG';
const PENSIOEN_DESC = 'STICHTING BEHEER DERDENGELDEN PEAKS KLANT 7712345 PENSIOEN INLEG';

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, date, amount, name, desc, extra) =>
    tx.push(Object.assign({ id, date, amount, acc, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }, extra || {}));
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    add('i' + m, MAIN, m + '-25', 3000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m + '-02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m + '-05', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('s' + m, SPAAR, m + '-26', 200, 'Spaarpot', 'NAAR SPAREN');
  }
  add('r0', RES, '2026-07-08', 37, 'Reservering', 'NAAR RESERVERING');
  add('peaks0929', MAIN, '2026-09-29', -100, 'Stichting Beheer Derdengelden', STICHTING_DESC);
  (o.extraTx || []).forEach((t) => add(t.id, t.acc || MAIN, t.date, t.amount, t.name || 'Stichting Beheer Derdengelden', t.desc || STICHTING_DESC));
  const set = Object.assign({
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 3000, budgetMonth: '2026-09',
    manualBal: { [MAIN]: 2000, [SPAAR]: 9000, [RES]: 37 },
    budgets: { boodschappen: 500, huur: 900 },
    savingMode: 'amount', savingAmount: 400,
    savingsAcc: { [SPAAR]: true, [RES]: false },
    nfToegewezen: 9000,
    goals: [{ id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, perMaand: 400, streefdatum: '2027-12' }],
    resAcc: RES, resCheck: '2026-09',
    reserveringen: [{ id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: '2026-11', intervalM: 0 }],
    assets: [
      { id: 'kayani', naam: 'Peaks (Kayani)', waarde: 1450, grow: true, rend: 5, per: 100 },
      { id: 'pensioen', naam: 'Peaks (pensioen)', waarde: 3200, grow: true, rend: 5, per: 0 },
    ],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, (o && o.dag) || DAG);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof bezitVan === 'function' && typeof TX !== 'undefined');
  /* categorize() herschrijft elke id bij de boot (v291), dus de ids uit de seed bestaan niet meer.
     De test krijgt de echte id per seed-sleutel, gevonden op rekening, datum, bedrag en omschrijving. */
  const lijst = JSON.parse(seed(o).minder_tx);
  const ids = await page.evaluate((L) => { const m = {}; for (const s of L) { const t = TX.find((x) => x.acc === s.acc && x.date === s.date && x.amount === s.amount && x.desc === s.desc); m[s.id] = t ? t.id : null; } return m; }, lijst);
  return ids;
}
module.exports = { boot, seed, MAIN, SPAAR, RES, DAG, STICHTING_DESC, PENSIOEN_DESC };
