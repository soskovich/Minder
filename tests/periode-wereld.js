/* v508 (punt 7): DE FIXTURES VAN VOOR DE PERIODE, OPGEBOUWD IN DE PERIODE. v507 noemde 55 tests "· voor de salarisperiode": ze toetsen
   de kalendermaand op 31 okt, en het gedrag in de periode was daarmee niet meer getoetst. Deze helper laadt budget-fixture.js opnieuw
   met de Node-klok op een dag in de periode (26 nov of 1 dec), zodat de maandsleutels van de fixture om die dag heen liggen (CUR is
   november of december, met historie ervoor), en de spec zet de pagina met pinDatum() op dezelfde dag. De salarisregel van de fixture
   (Werkgever op de 5e) geeft vanaf november een salarisperiode van de 5e tot de 4e: de wereld IN de periode. De gewone budget-fixture
   (31 okt) blijft voor de rest van de suite ongemoeid: de module wordt per aanroep vers geladen en daarna uit de cache gehaald. */
const { pinDatum } = require('./vaste-dag');
function metNodeDag(ymd, fn) {
  const K = global.__minderKlok; if (!K) throw new Error('periode-wereld: tests/klok.js is niet geladen');
  const [j, m, d] = ymd.split('-').map(Number), oud = K.off;
  K.off = new K.Echt(j, m - 1, d, 12, 0, 0).getTime() - K.Echt.now();
  try { return fn(); } finally { K.off = oud; }
}
function fixtureOp(ymd) {
  return metNodeDag(ymd, () => { const p = require.resolve('./budget-fixture'); const bewaar = require.cache[p]; delete require.cache[p];
    try { return Object.assign(require('./budget-fixture'), { dag: ymd }); } finally { if (bewaar) require.cache[p] = bewaar; else delete require.cache[p]; } });
}
/* open de app op de dag van de wereld: eerst de pagina-klok, dan de fixture (open() doet de goto) */
async function openOp(page, F, payload) { await pinDatum(page, F.dag); await metNodeDag(F.dag, () => F.open(page, payload)); }
const PERIODE_DAGEN = ['2026-11-26', '2026-12-01'];
module.exports = { metNodeDag, fixtureOp, openOp, PERIODE_DAGEN };
