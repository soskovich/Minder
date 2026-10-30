/* v502: PLAN · GELD VERPLAATSEN TUSSEN DOELEN, EN "OP SCHEMA" IN MAANDEN. Op v501-stand (de era, 26 nov 2026, de periode 24 nov t/m
   23 dec; oktober draagt de storting van 6.000 en een opname van 1.519 naar Leefgeld, dus "Opzij deze periode" mag oktober niet tonen)
   met de doelen in de vorm van het toestel (Plan, 27 okt): Noodfonds 4.000 van 4.000 (vol), Inrichting woning 0 van 5.000 (nu
   actief), Kosten Koper + aankoopmakelaar 2.000 van 15.000 (streef jan 2028). Het spaarsaldo staat op 6.000 (precies de toewijzingen),
   zodat er niets stilstaat. o.nfToe zet de toewijzing van het noodfonds anders, o.kkStreef de streefdatum van Kosten Koper.
   GECONSTRUEERD, niet gemeten. */
const V501 = require('./v501-stand');
const { MAIN, SPAAR, LEEF, CATH } = V501;
async function boot(page, o) {
  o = o || {};
  const goals = [
    { id: 'iw', naam: 'Inrichting woning', doel: 5000, gespaard: 0, streefdatum: o.iwStreef || '2027-06', startDatum: '2026-10-01', startStand: 0 },
    { id: 'kk', naam: 'Kosten Koper + aankoopmakelaar', doel: 15000, gespaard: 2000, streefdatum: o.kkStreef || '2028-01', startDatum: '2026-10-01', startStand: 2000 },
  ];
  const set4 = Object.assign({ goals, nfToegewezen: o.nfToe != null ? o.nfToe : 4000, nfToegewezenMigrated: true, nfDoelVast: 4000, bufferNorm: 2,
    planOrder: ['noodfonds', 'iw', 'kk'], planPaused: {}, planVerplaatsLog: [] }, o.set5 || {});
  await V501.boot(page, Object.assign({ spaarSaldo: o.spaarSaldo != null ? o.spaarSaldo : 6000 }, o, { set4 }));
}
module.exports = { boot, MAIN, SPAAR, LEEF, CATH };
