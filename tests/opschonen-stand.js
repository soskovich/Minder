/* v365: DE STAND VAN PLAN OP 9 OKTOBER 2026, met de getallen uit de mockup "opschonen": inleg EUR 2.200, Noodfonds
   EUR 3.638 van EUR 4.000 toegewezen, Kosten Koper EUR 0 van EUR 15.000 (streef mei 2027), Inrichting EUR 0 van
   EUR 3.000 (streef maart 2027), en op 5 oktober EUR 231 van de spaarrekening gehaald (saldo 3.407).
   GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. GEMETEN OP DEZE STAND (v365, punt
   C): Noodfonds is in alle drie de keuzes vol in november 2026; niet terugzetten schuift Kosten Koper van mei naar
   juni 2027. */
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
const DAG = '2026-10-09';
function seed(o) {
  o = o || {};
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  ['2026-06', '2026-07', '2026-08', '2026-09'].forEach((m) => { add(m, '03', 5216, 'Skf .', 'SALARIS'); add(m, '06', 2200, 'Spaarpot', 'NAAR SPAREN', SAV); });
  if (!o.zonderOpname) add('2026-10', '05', -(o.opname || 231), 'Spaarpot', 'VAN SPAREN', SAV);
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 5216, limit: 70, bufferNorm: 2, nfMaanden: 3,
    savingsEnds: ['4323'], manualBal: { [MAIN]: 3000, [SAV]: 3638 - (o.zonderOpname ? 0 : (o.opname || 231)) },
    budgets: { huur: 700 }, budgetsNext: {}, budgetMonth: '2026-10', savingMode: 'amount', savingAmount: 2200,
    nfDoelVast: 4000, nfToegewezen: 3638, nfToegewezenMigrated: 1, planOrder: ['noodfonds', 'kk', 'iw'],
    maandGelezen: '2026-10-01', afsluitPopup: { dag: DAG },
    goals: [{ id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'auto' },
      { id: 'iw', naam: 'Inrichting', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'auto' }] }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, (o && o.dag) || DAG);
  if (o && o.vp) await page.setViewportSize(o.vp);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof allocatePlan === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}
module.exports = { boot, seed, DAG, MAIN, SAV };
