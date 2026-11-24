/* v521: DE STAND VOOR INKOMENVERDELING. 22 nov 2026 (zondag), GECONSTRUEERD (geen boekingen van het toestel), zonder salarisregel, dus
   kalendermaanden; augustus t/m oktober afgerond, november loopt. Elk getal in v521.spec.js is met de hand uit deze lijst uitgerekend.
   - elke maand aug, sep, okt: salaris Werkgever BV +3000 (inkomen), huur -1000, Albert Heijn -400, storting naar je spaarrekening -500 (sparen).
   - september: bonus +1000 (inkomen, door jou gevlagd onregelmatig, dus eenmalig), en een opname van je spaarrekening +200 (intern).
   - oktober: terugbetaling van uitgeleend geld +300 (Uitgeleend, geen inkomen), en Centraal Beheer -240 (verzekering), helemaal uit een
     reservering betaald.
   - november (de lopende maand): salaris +3000 en Albert Heijn -100; telt NIET mee.
   - december 2025: salaris +3000 en Albert Heijn -300; valt buiten de laatste 6 maanden, alleen in een venster dat terug gaat.
   Dus aug–okt: binnen 3000 + 4000 + 3000 = 10000 (waarvan eenmalig 1000), uitgegeven 1400 + 1400 + 1640 = 4440, over 5560;
   per euro 0,44 uit en 0,56 over; zonder eenmalig 4440 / 9000 = 0,49 uit. Wat naar de spaarrekening ging (3 x 500 - 200) is iets anders. */
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000002222';
const DAG = '2026-11-22';
const BACKEND = { psd2Url: 'https://w.test', psd2Token: 'tok' };
/* [datum, bedrag, naam, categorie, vlag]: vlag 'een' = onregelmatig (het hele bedrag), 'res' = helemaal uit een reservering */
const TXS = [
  ['2025-12-24', 3000, 'Werkgever BV', 'inkomen'],
  ['2025-12-10', -300, 'Albert Heijn', 'boodschappen'],
];
for (const m of ['2026-08', '2026-09', '2026-10']) TXS.push(
  [m + '-24', 3000, 'Werkgever BV', 'inkomen'],
  [m + '-01', -1000, 'Woonstichting Oost', 'huur'],
  [m + '-12', -400, 'Albert Heijn', 'boodschappen'],
  [m + '-25', -500, 'Naar spaarrekening', 'sparen']);
TXS.push(
  ['2026-09-28', 1000, 'Werkgever BV bonus', 'inkomen', 'een'],
  ['2026-09-15', 200, 'Van spaarrekening', 'intern'],
  ['2026-10-20', 300, 'J. Jansen terugbetaling', 'uitgeleend'],
  ['2026-10-05', -240, 'Centraal Beheer', 'verzekering', 'res'],
  ['2026-11-02', 3000, 'Werkgever BV', 'inkomen'],
  ['2026-11-06', -100, 'Albert Heijn', 'boodschappen']);
const BUD = { huur: 1000, boodschappen: 400, verzekering: 240 };
function seed(extra) {
  return Object.assign({
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 3000, budgetMonth: '2026-11', vraagAan: true,
    manualBal: { [MAIN]: 3000 }, budgets: BUD, potAard: { huur: 'vast' }, savingMode: 'amount', savingAmount: 0,
    budgetHist: { '2026-08': BUD, '2026-09': BUD, '2026-10': BUD },
    maandGelezen: '2026-11-01', afsluitPopup: { dag: DAG }, wekGekozen: true, opnameVanaf: '',
  }, BACKEND, extra || {});
}
async function boot(page, extra) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, DAG);
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v521boot')) { sessionStorage.setItem('v521boot', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, {
    minder_tx: '[]', minder_ovr: '{}', minder_set: JSON.stringify(seed(extra)), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderIns === 'function' && typeof TX !== 'undefined');
  await page.evaluate(({ TXS, MAIN }) => {
    if (TX.some((t) => t.name === 'Woonstichting Oost')) return;
    SET.onregelmatig = SET.onregelmatig || {}; SET.uitReservering = SET.uitReservering || {};
    for (const [d, a, n, cat, vlag] of TXS) {
      const t = { id: 'v521' + d + n.replace(/\W/g, ''), date: d, amount: a, acc: MAIN, name: n, desc: (a < 0 ? 'BEA, BETAALPAS ' : 'SEPA OVERBOEKING ') + n.toUpperCase(),
        typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = cat;
      if (vlag === 'een') SET.onregelmatig[t.id] = a;
      if (vlag === 'res') SET.uitReservering[t.id] = -a;
    }
    TX.sort((a, b) => a.date.localeCompare(b.date)); save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._gripCyc = null; render();
  }, { TXS, MAIN });
}
module.exports = { boot, seed, DAG, MAIN, TXS, BUD };
