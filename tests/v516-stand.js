/* v516: DE STAND VAN 20 NOV 2026 voor de melding op je telefoon: de tegel "Deze week" zegt nog EUR 292 van EUR 361.
   GECONSTRUEERD naar die twee getallen van het toestel, niet gemeten: de boekingen van het toestel staan alleen daar.
   Geen salaris in de boekingen, dus geen salarisperiode: de tegel komt uit weekNu() (week ma 16 t/m zo 22 nov, 7 van 30 dagen).
   - Boodschappen EUR 1.200 en Vices EUR 347, allebei wekelijks: basis 1200/30*7 = 280 en 347/30*7 = 80,97 -> 81, samen 361;
   - deze week EUR 50 Boodschappen (17 nov) en EUR 19 Vices (18 nov): nog 230 + 62 = 292;
   - EUR 300 Boodschappen op 5 nov, onder het tempo van de maand, dus er wordt niets ingehaald (weekbedrag = basis).
   De tegenpartijen (Albert Heijn, Kiosk) en de IBAN staan alleen in de boekingen; de snapshot mag ze niet dragen. */
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111';
const DAG = '2026-11-20';
function seed(o) {
  o = o || {};
  const set = Object.assign({
    bufferNorm: 2, mode: 'begeleid', autoIncome: false, income: 5216, budgetMonth: '2026-11',
    manualBal: { [MAIN]: 3000 }, budgets: { boodschappen: 1200, vices: 347 }, savingMode: 'amount', savingAmount: 0,
    maandBudget: { '2026-11': { totaal: 1547, potjes: { boodschappen: 1200, vices: 347 }, inleg: 0, op: '2026-11-01', bron: 'maandwissel' } },
    maandGelezen: '2026-11-01', afsluitPopup: { dag: DAG }, potWekelijks: { boodschappen: true, vices: true }, wekGekozen: true,
  }, o.set || {});
  return set;
}
const TXS = [
  ['2026-11-05', -300, 'Albert Heijn 1234', 'boodschappen'],
  ['2026-11-17', -50, 'Albert Heijn 1234', 'boodschappen'],
  ['2026-11-18', -19, 'Kiosk Centraal', 'vices'],
];
async function boot(page, o) {
  o = o || {};
  const set = seed(o);
  if (!o.metSw) await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, o.dag || DAG);
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v516boot')) { sessionStorage.setItem('v516boot', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, {
    minder_tx: '[]', minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' });
  await page.goto(o.url || '/index.html');
  await page.waitForFunction(() => typeof renderIns === 'function' && typeof TX !== 'undefined');
  await zaai(page);
}
async function zaai(page) {
  await page.evaluate(({ TXS, MAIN }) => {
    if (TX.some((t) => t.name === 'Kiosk Centraal')) return;   // na een herlaad staat alles er al (categorize() herschrijft de id)
    for (const [d, a, n, cat] of TXS) { const t = { id: 'v516' + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc: MAIN, name: n, desc: 'BEA, BETAALPAS ' + n.toUpperCase() + ' ' + MAIN, typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = cat; }
    TX.sort((a, b) => a.date.localeCompare(b.date)); save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._gripCyc = null; render();
  }, { TXS, MAIN });
}
module.exports = { boot, zaai, seed, DAG, MAIN, TXS };
