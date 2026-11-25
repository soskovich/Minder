/* onderhoud1: FIXTURE, GECONSTRUEERD naar de beschrijving van de gebruiker (de export b.json staat niet in de repo).
   Stichting Beheer Derdengelden (Peaks), drie reeksen onder een tegenpartij, alle drie incasso:
     EUR 100 inleg op de laatste werkdag van de maand (mei t/m okt), EUR 2,99 servicekosten rond de 3e (mei t/m nov),
     EUR 10 wekelijkse inleg op maandag (mei t/m 31 aug, daarna gestopt).
   Verschuivingen sep -> okt: Peaks Jelani EUR 100 (incasso) is nieuw in okt (en nov), Online shopping 40 -> 100, Basic Fit 30 elke maand.
   Woning: Nathaniel Cathalina EUR 300 per maand, dag 1, betaald per Tikkie (geen incasso, dus niet in het schema).
   o.dag pint de klok (standaard 25 nov 2026), o.html serveert een andere index.html (bc2bafd), o.servStop laat de servicekosten na die
   maand weg, o.zonderWoning laat de woning weg, o.woningBedrag zet het bedrag in de kennis, o.woningIncasso maakt de huur een incasso
   (dan staat hij ook in het schema), o.diffuus zet in okt drie nieuwe vaste posten van EUR 40 in plaats van Peaks Jelani (geen post
   draagt de helft van de stap), o.melding bouwt de vorm na waarop bc2bafd de gemelde regel gaf ("EUR 3 per maand niet betaald sinds
   5 okt"): de inleg van EUR 100 als gewone overboeking (geen incasso), de servicekosten op de 5e en na oktober niet meer gezien. */
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111';
function data(o) {
  o = o || {}; const dag = o.dag || '2026-11-25';
  const tx = []; const add = (id, date, amount, name, desc) => { if (date <= dag) tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); };
  const M = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
  for (const m of M) add('sal-' + m, m + '-24', 5216.28, 'SKF B.V.', 'SALARIS LOON SKF');
  const eind = { '2026-05': '29', '2026-06': '30', '2026-07': '31', '2026-08': '31', '2026-09': '30', '2026-10': '30' };
  if (o.melding) o.servStop = '2026-10';
  for (const m in eind) add('pk100-' + m, m + '-' + eind[m], -100, 'Stichting Beheer Derdengelden', o.melding ? 'OVERBOEKING STICHTING BEHEER DERDENGELDEN INLEG' : 'SEPA INCASSO STICHTING BEHEER DERDENGELDEN INLEG');
  for (const m of M) if (!o.servStop || m <= o.servStop) add('pk3-' + m, m + (o.melding ? '-05' : '-03'), -2.99, 'Stichting Beheer Derdengelden', 'SEPA INCASSO STICHTING BEHEER DERDENGELDEN SERVICE');
  for (let d = new Date(2026, 4, 4); d <= new Date(2026, 7, 31); d.setDate(d.getDate() + 7)) { const s = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    add('pkw-' + s, s, -10, 'Stichting Beheer Derdengelden', 'SEPA INCASSO STICHTING BEHEER DERDENGELDEN WEEK'); }
  /* onderhoud1b: o.extra zet een extra band van EUR 25 bij dezelfde partij op deze dagen (een deelreeks met te weinig of te oude betalingen) */
  for (const d of (o.extra || [])) add('pk25-' + d, d, -25, 'Stichting Beheer Derdengelden', 'SEPA INCASSO STICHTING BEHEER DERDENGELDEN EXTRA');
  for (const m of M) add('bf-' + m, m + '-05', -30, 'Basic Fit', 'SEPA INCASSO BASIC FIT');
  if (o.diffuus) { for (const n of ['Ziggo', 'Vattenfall', 'Lebara']) for (const d of ['2026-10-14', '2026-11-14']) add('df-' + n + d, d, -40, n, 'SEPA INCASSO ' + n.toUpperCase()); }
  else { add('pj-2026-10', '2026-10-27', -100, 'Peaks Jelani', 'SEPA INCASSO JELANI'); add('pj-2026-11', '2026-11-20', -100, 'Peaks Jelani', 'SEPA INCASSO JELANI'); }
  add('bol-2026-09', '2026-09-12', -40, 'Bol.com', 'BOL.COM BESTELLING');
  add('bol-2026-10', '2026-10-12', -100, 'Bol.com', 'BOL.COM BESTELLING');
  add('ah-2026-09', '2026-09-08', -250, 'Albert Heijn', 'BEA ALBERT HEIJN');
  add('ah-2026-10', '2026-10-08', -250, 'Albert Heijn', 'BEA ALBERT HEIJN');
  add('ah-2026-11', '2026-11-08', -250, 'Albert Heijn', 'BEA ALBERT HEIJN');
  if (!o.zonderWoning) for (const m of ['2026-09', '2026-10', '2026-11']) add('huur-' + m, m + '-01', -300, o.woningIncasso ? 'Nathaniel Cathalina' : 'N. Cathalina via Tikkie', o.woningIncasso ? 'SEPA INCASSO HUUR NATHANIEL CATHALINA' : 'TIKKIE HUUR NATHANIEL CATHALINA');
  const kennis = o.zonderWoning ? {} : { [o.woningIncasso ? 'woning|NATHANIEL CATHALINA' : 'woning|CATHALINA']: { soort: 'woning', partij: 'Nathaniel Cathalina', wat: 'Woonhuur', bedrag: o.woningBedrag || 300, dag: 1, vanaf: '2026-09', ja: true, bron: 'jij', op: '2026-09-02', tx: [] } };
  const set = { budgetMonth: dag.slice(0, 7), income: 5216, autoIncome: true, limit: 70, limitMode: 'pct', budgets: { boodschappen: 400, shopping: 150, huur: 300 },
    manualBal: { [MAIN]: 4000 }, irregularIncome: [], kennis, kennis425: { macnack: 1, cathalina: 1, macnackBron: 1, macnack443: 1, macnack445: 1, sportcity: 1, laser452: 1, laser453: 1, zorg159: 1, zorg427: 1, nikki: 1, gemeente: 1, kasnasal: 1, contant447: 1 } };
  return { tx, set, dag };
}
async function boot(page, o) {
  o = o || {}; const D = data(o);
  const ovr = {};
  const d = { minder_tx: JSON.stringify(D.tx), minder_set: JSON.stringify(D.set), minder_own: JSON.stringify([MAIN]), minder_ovr: JSON.stringify(ovr), minder_accmeta: '{}', minder_plan: '{}' };
  await page.route('**/sw.js', (r) => r.abort());
  if (o.html) await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: o.html }));
  await pinDatum(page, D.dag);
  await page.addInitScript((d) => { if (!sessionStorage.getItem('o1')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('o1', '1'); } }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0);
}
module.exports = { boot, data, MAIN };
