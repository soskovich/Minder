/* v387: DE STAND VAN HET TOESTEL VOOR DE REGELKRING OP GRIP, op 10 oktober 2026. Nagebouwd op standkaart-sluit.fixture.js
   (de stand van 3 oktober uit blok 15), met wat er sindsdien veranderde: Huur EUR 700 op vast en Shurgard vier-wekelijks
   (3 aug EUR 85,90, 1 sep EUR 66,26, 30 sep EUR 71, v384). Daarbij een inleg van EUR 2.200 naar twee doelen en
   onttrekkingen van de spaarrekening in oktober, zodat de Doelen-meter iets meet.
   GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. */
const F = require('./standkaart-sluit.fixture');
const SPAAR = 'NL01SPAR0000002222', MAIN = 'NL01MAIN0000001111';
async function boot(page, o) {
  o = o || {};
  await F.bootStand(page, o.dag || '2026-10-10');
  await page.evaluate(({ SPAAR, MAIN, o }) => {
    TX = TX.filter(t => t.name !== 'Shurgard NL');
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'k' + d + n + a, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    add(MAIN, '2026-08-03', -85.90, 'Shurgard NL', 'SEPA INCASSO SHURGARD NL', 'huur');
    add(MAIN, '2026-09-01', -66.26, 'Shurgard NL', 'SEPA INCASSO SHURGARD NL', 'huur');
    add(MAIN, '2026-09-30', -71.00, 'Shurgard NL', 'SEPA INCASSO SHURGARD NL', 'huur');
    for (const [d, a] of (o.opnames || [])) { add(SPAAR, d, -a, 'Eigen overboeking', 'OVERBOEKING NAAR LEEFGELD', 'intern'); add(MAIN, d, a, 'Eigen overboeking', 'OVERBOEKING VAN SPAREN', 'intern'); }
    /* de variabele potjes met een gewone maand in juli tot en met september, zodat "te ruim" iets te meten heeft */
    for (const m of ['2026-07', '2026-08', '2026-09']) {
      add(MAIN, m + '-06', -180, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen'); add(MAIN, m + '-19', -170, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen');
      add(MAIN, m + '-12', -70, 'Cafe De Kroeg', 'BEA, BETAALPAS CAFE DE KROEG', 'uiteten'); add(MAIN, m + '-15', -25, 'Coffeeshop', 'BEA, BETAALPAS COFFEESHOP', 'vices');
      add(MAIN, m + '-21', -380, 'Hema Winkel', 'BEA, BETAALPAS HEMA WINKEL', 'overig'); }
    SET.budgets.huur = 700; SET.potAard = Object.assign({}, SET.potAard, { huur: 'vast' });
    SET.goals = [{ id: 'iw', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'auto' },
      { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-06', allocMode: 'auto' }];
    SET.planOrder = ['noodfonds', 'iw', 'kk']; SET.nfToegewezen = 4000; SET.nfDoelVast = 4000; SET.bufferNorm = 2;
    Object.assign(SET, o.set || {});
    save(); render();
  }, { SPAAR, MAIN, o });
}
module.exports = { boot, SPAAR, MAIN, POTJES: F.POTJES };
