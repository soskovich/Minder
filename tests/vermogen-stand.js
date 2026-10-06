/* v350: DE STAND VAN DE RONDE HOME, VERMOGEN EN VERMOGENSREIS, op 6 oktober 2026.
   GECONSTRUEERD EN NIET GEMETEN: de gegevens van het toestel staan alleen daar. De fixture draagt de vormen
   die de gebruiker meldde:
   - DUO met een looptijd van 109 maanden vanaf oktober 2026 (EUR 10.900 tegen EUR 100 per maand, zonder rente,
     zodat de maanden exact zijn): de rij zei "nov 2035" en de mijlpaal "2036".
   - Drie bezittingen, de auto van een financial lease als vierde rij en je rekeningen als vijfde, plus twee
     uitgeleende bedragen: Home zei "3 bezittingen".
   - Een lease met een slottermijn, voor de sheet Restschuld.
   - Verzekeringen met een maandelijkse incasso (EUR 150) en DELA per kwartaal (EUR 160, maart, juni, september,
     dus de volgende in december), voor de ondergrens per maand bij Potje bijstellen. */
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111', SPAAR = 'NL01SAVE0000004323';
const DAG = '2026-10-06';
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, date, amount, name, desc) =>
    tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) {
    add('sal' + m, m + '-25', 5000, 'Werkgever', 'SALARIS LOON');
    add('huur' + m, m + '-01', -1450, 'Wooncorporatie', 'SEPA INCASSO WOONCORPORATIE HUURBETALING');
    add('verz' + m, m + '-20', -150, 'Centraal Beheer', 'SEPA INCASSO CENTRAAL BEHEER POLIS');
    add('ah' + m, m + '-12', -420, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('duo' + m, m + '-24', -100, 'DUO', 'SEPA INCASSO DUO HOOFDDIRECTIE STUDIESCHULD');
  }
  for (const d of ['2026-03-05', '2026-06-05', '2026-09-05']) add('dela' + d, d, -160, 'DELA', 'SEPA INCASSO DELA COOPERATIE UITVAARTVERZEKERING');
  add('ah10', '2026-10-03', -210, 'BEA, BETAALPAS ALBERT HEIJN 1234 AMSTERDAM NR:7788', 'BEA, BETAALPAS ALBERT HEIJN 1234 AMSTERDAM NR:7788, 03.10.26/14:02');
  (o.extraTx || []).forEach((t) => add(t.id, t.date, t.amount, t.name, t.desc));
  const set = Object.assign({
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 5000, budgetMonth: '2026-10',
    manualBal: { [MAIN]: 2000, [SPAAR]: 9000 }, savingsAcc: { [SPAAR]: true },
    budgets: { huur: 1450, verzekering: 675, boodschappen: 400, vices: 50 }, savingMode: 'amount', savingAmount: 400, nfToegewezen: 9000,
    maandGelezen: '2026-10-01', afsluitPopup: { dag: '2026-10-06' },
    assets: [
      { id: 'a1', naam: 'Peaks (pensioen)', waarde: 620, waardeOp: '2026-10-01' },
      { id: 'a2', naam: 'Peaks (Kayani)', waarde: 1800, waardeOp: '2026-10-01' },
      { id: 'a3', naam: 'Fiets', waarde: 400, waardeOp: '2026-10-01' },
    ],
    debts: [
      { id: 'duo', naam: 'DUO', type: 'studie', start: 15000, rest: 10900, restOp: '2026-10-01', perMaand: 100, rente: 0 },
      { id: 'lease', naam: 'Auto Lease', type: 'financiallease', start: 20000, rest: 12756, restOp: '2026-10-01', perMaand: 426, rente: 0, slot: 3000, autoBezit: true, dagwaarde: 16000 },
    ],
    loans: [
      { id: 'l1', naam: 'Ma', richting: 'uit', bedrag: 400, open: 400, datum: '2026-09-02' },
      { id: 'l2', naam: 'Broer', richting: 'uit', bedrag: 150, open: 150, datum: '2026-09-10' },
    ],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, (o && o.dag) || DAG);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof schuldVrij === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}
module.exports = { boot, seed, DAG, MAIN };
