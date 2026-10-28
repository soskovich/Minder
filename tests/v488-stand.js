/* v488: UITGEGEVEN OPENT DE BOEKINGEN. Vaste lasten op MAIN, maandelijks jul t/m okt zodat ze als terugkerend (isFixed) worden
   herkend: Huur EUR 1.000 (1e) en Verzekering EUR 254 (3e), met okt EUR 294 (EUR 40 meer dan sep, zodat "Betaald · vast" die post als
   verschil noemt). Booked in oktober: 1.000 + 294 = 1.294. Een potje Boodschappen (budget 400) met boekingen in juli en oktober, zodat
   de maandkeuze juli de boekingen van juli toont. Vandaag 2026-10-28; jul/aug/sep zijn afgeronde maanden. GECONSTRUEERD, niet gemeten. */
const V432 = require('./v432-stand');
const { MAIN, SPAAR, LEEF } = V432;
async function boot(page, o) {
  o = o || {};
  await V432.boot(page, { dag: o.dag || '2026-10-28' });
  await page.evaluate(({ MAIN, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v488' + acc.slice(-4) + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    /* salaris: de 24e als anker, zodat de lopende periode rond okt loopt */
    for (const d of ['2026-07-24', '2026-08-24', '2026-09-24', '2026-10-24']) add(MAIN, d, 5216, 'Werkgever', 'SALARIS LOON');
    /* vaste lasten: maandelijks dezelfde partij -> isFixed. Huur 1.000 (1e), Verzekering 254 (3e), okt 294 */
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) add(MAIN, m + '-01', -1000, 'Woningstichting', 'SEPA Woningstichting huur ' + m, 'huur');
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) add(MAIN, m + '-03', -254, 'Verzekeraar NN', 'SEPA Verzekeraar NN polis ' + m, 'verzekering');
    /* potje Boodschappen: boekingen in juli en oktober */
    add(MAIN, '2026-07-10', -70, 'Albert Heijn', 'BEA Albert Heijn', 'boodschappen');
    add(MAIN, '2026-07-20', -50, 'Jumbo', 'BEA Jumbo', 'boodschappen');
    add(MAIN, '2026-10-06', -48, 'Albert Heijn', 'BEA Albert Heijn', 'boodschappen');
    add(MAIN, '2026-10-12', -32, 'Lidl', 'BEA Lidl', 'boodschappen');
    SET.budgets = Object.assign({}, SET.budgets, { boodschappen: 400 });
    SET.potAard = Object.assign({}, SET.potAard, { verzekering: 'vast' });   // als vaste last meetellen naast de huur
    SET.manualBal = Object.assign({}, SET.manualBal, { [MAIN]: (o.main != null ? o.main : 3000) });
    Object.assign(SET, o.set || {});
    save(); try { buildAccMeta(); } catch (_) {}
    render();
  }, { MAIN, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF };
