/* v520b: DE STAND VOOR DE DRIE ANTWOORDEN. 22 nov 2026 (zondag), GECONSTRUEERD (geen boekingen van het toestel), zonder salaris, dus
   kalendermaanden; augustus t/m oktober afgerond. Elk getal in v520b.spec.js is met de hand uit deze lijst uitgerekend.
   - potjes: Huur 1200 (op vast gezet, SET.potAard), Boodschappen 400, Uit eten 150, Vervoer 100, Overig 30 (het kleinste).
   - Huur op MAANDAG 3 aug, 7 sep, 5 okt (1200): een vaste last op zijn afschrijfdag.
   - variabel aug–okt: zaterdag Uit eten 80 (8 aug) + 70 (22 aug) + 90 (12 sep) + 60 (10 okt) = 300 en Boodschappen 50 (15 aug), dus
     za 350 met Uit eten als grootste; vrijdag Boodschappen 120 + 110 + 100 = 330; maandag Boodschappen 20 (10 aug).
   - tegenpartijen dit jaar: BOL.COM 25 (10 feb), BOLCOM 30 (5 jun), BOLT SUPPORT SERVICES 15 (12 mrt), TEAM FEBO LINNAEUSSTRA 5,20 (4 apr):
     "bol" hoort alleen de eerste twee te vinden (Febo draagt "bol" midden in "febolinnaeusstra" als je de spaties weghaalt).
   - november, kleine betalingen: Jumbo 4, 6, 8 (Boodschappen), Starbucks 5,50 en 5,50 (Uit eten), Bolt 7 (Vervoer), Kiosk 2 (Overig);
     Albert Heijn 45 (Boodschappen) is geen kleine betaling. Onder 10 samen 38, meer dan het kleinste potje (Overig 30). */
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000002222';
const DAG = '2026-11-22';
const BACKEND = { psd2Url: 'https://w.test', psd2Token: 'tok' };
const TXS = [
  ['2026-02-10', -25, 'BOL.COM', 'overig'],
  ['2026-03-12', -15, 'BOLT SUPPORT SERVICES', 'vervoer'],
  ['2026-04-04', -5.2, 'TEAM FEBO LINNAEUSSTRA', 'uiteten'],
  ['2026-06-05', -30, 'BOLCOM', 'overig'],
  ['2026-08-03', -1200, 'Woonstichting Oost', 'huur'],
  ['2026-08-08', -80, 'Restaurant Lona', 'uiteten'],
  ['2026-08-10', -20, 'Jumbo', 'boodschappen'],
  ['2026-08-14', -120, 'Albert Heijn', 'boodschappen'],
  ['2026-08-15', -50, 'Albert Heijn', 'boodschappen'],
  ['2026-08-22', -70, 'Restaurant Lona', 'uiteten'],
  ['2026-09-07', -1200, 'Woonstichting Oost', 'huur'],
  ['2026-09-12', -90, 'Restaurant Lona', 'uiteten'],
  ['2026-09-18', -110, 'Albert Heijn', 'boodschappen'],
  ['2026-10-05', -1200, 'Woonstichting Oost', 'huur'],
  ['2026-10-10', -60, 'Restaurant Lona', 'uiteten'],
  ['2026-10-16', -100, 'Albert Heijn', 'boodschappen'],
  ['2026-11-02', -4, 'Jumbo', 'boodschappen'],
  ['2026-11-04', -5.5, 'Starbucks', 'uiteten'],
  ['2026-11-06', -45, 'Albert Heijn', 'boodschappen'],
  ['2026-11-09', -6, 'Jumbo', 'boodschappen'],
  ['2026-11-11', -7, 'Bolt', 'vervoer'],
  ['2026-11-13', -5.5, 'Starbucks', 'uiteten'],
  ['2026-11-16', -8, 'Jumbo', 'boodschappen'],
  ['2026-11-18', -2, 'Kiosk', 'overig'],
];
const BUD = { huur: 1200, boodschappen: 400, uiteten: 150, vervoer: 100, overig: 30 };
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
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v520bboot')) { sessionStorage.setItem('v520bboot', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, {
    minder_tx: '[]', minder_ovr: '{}', minder_set: JSON.stringify(seed(extra)), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderIns === 'function' && typeof TX !== 'undefined');
  await page.evaluate(({ TXS, MAIN }) => {
    if (TX.some((t) => t.name === 'Woonstichting Oost')) return;
    for (const [d, a, n, cat] of TXS) {
      const t = { id: 'v520b' + d + n.replace(/\W/g, ''), date: d, amount: a, acc: MAIN, name: n, desc: 'BEA, BETAALPAS ' + n.toUpperCase(),
        typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = cat;
    }
    TX.sort((a, b) => a.date.localeCompare(b.date)); save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._gripCyc = null; render();
  }, { TXS, MAIN });
}
module.exports = { boot, seed, DAG, MAIN, TXS, BUD };
