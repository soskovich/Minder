/* v480: DE WONING VIA TIKKIE/iDEAL (geen SEPA-schema) EN EEN POTJE HUUR OP VAST. Op v432-stand (twee betaalrekeningen) komt de
   woning Nathaniel Cathalina EUR 300 per maand via een Tikkie/iDEAL binnen op Leefgeld (unieke ref per maand, dus geen herkend
   schema, recurKey verschilt), en er staat een potje Huur van EUR 420 dat door jou op vast staat. o.booked===false laat de
   oktober-betaling weg (dan verwacht woningForecast nog EUR 300). GECONSTRUEERD, niet gemeten. */
const V432 = require('./v432-stand');
const { MAIN, SPAAR, LEEF } = V432;
const CATH = 'NL77CATH0000009999';
async function boot(page, o) {
  o = o || {};
  await V432.boot(page, { dag: o.dag || '2026-10-16' });
  await page.evaluate(({ LEEF, CATH, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'w' + acc.slice(-4) + d + n + Math.round(a), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    const maanden = o.booked === false ? ['2026-07', '2026-08', '2026-09'] : ['2026-07', '2026-08', '2026-09', '2026-10'];
    let i = 0; for (const m of maanden) add(LEEF, m + '-19', -300, 'Nathaniel Cathalina', 'iDEAL Tikkie Nathaniel Cathalina ' + m + ' ref' + (i++), 'huur');
    SET.kennis = Object.assign({}, SET.kennis, { ['woning|' + CATH]: { soort: 'woning', ja: true, partij: 'Nathaniel Cathalina', bedrag: 300, dag: 19, vanaf: '2026-10', op: '2026-10-01' } });
    SET.budgets = Object.assign({}, SET.budgets, { huur: 420 });
    SET.potAard = Object.assign({}, SET.potAard, { huur: 'vast' });
    Object.assign(SET, o.set || {});
    save(); try { buildAccMeta(); } catch (_) {} render();
  }, { LEEF, CATH, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, CATH };
