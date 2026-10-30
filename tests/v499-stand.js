/* v499: DE REKENMOTOR PER PERIODE EN DE HISTORIE PER EENHEID. Op v489-stand (salaris de 24e, cutover 24 nov 2026) met boekingen in de
   korte november (1 t/m 23 nov) en in de lopende periode (24 nov en verder), zodat de historie op 26 nov uit sep, okt en "nov 1–23"
   bestaat en de bridge niet "€0 uitgegeven · nog niet te rekenen" hoeft te zeggen. Standaard GEEN novembersalaris (de storting van
   24 nov is nog niet binnen), zodat de kaart "Je salarisverdeling" over 24 nov gaat. Een storting naar de spaarrekening op 25 nov,
   zodat de Terugblik iets te meten heeft. GECONSTRUEERD, niet gemeten: de toestelgetallen staan alleen op het toestel. */
const V489 = require('./v489-stand');
const { MAIN, SPAAR, LEEF, CATH } = V489;
async function boot(page, o) {
  o = o || {};
  await V489.boot(page, Object.assign({ dag: '2026-11-26', novSalaris: false }, o));
  await page.evaluate(({ MAIN, LEEF, SPAAR, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v499' + acc.slice(-4) + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    /* de korte november (1–23): kaartbetalingen op Leefgeld, in de potjes van de fixture */
    add(LEEF, '2026-11-03', -140, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen');
    add(LEEF, '2026-11-10', -95, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen');
    add(LEEF, '2026-11-14', -48, 'Cafe de Kroeg', 'BEA, BETAALPAS CAFE DE KROEG', 'uiteten');
    add(LEEF, '2026-11-20', -36, 'Cafe de Kroeg', 'BEA, BETAALPAS CAFE DE KROEG', 'uiteten');
    /* de lopende periode (24 nov t/m 23 dec), tot vandaag */
    if (o.lopend !== false) {
      add(LEEF, '2026-11-24', -62, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen');
      add(LEEF, '2026-11-25', -22, 'Cafe de Kroeg', 'BEA, BETAALPAS CAFE DE KROEG', 'uiteten');
    }
    /* opzij: een storting op de spaarrekening in de lopende periode (meting voor de Terugblik en de Doelen-meter) */
    if (o.spaar !== false) { add(MAIN, '2026-11-25', -500, 'Eigen overboeking', 'OVERBOEKING NAAR SPAREN', 'intern'); add(SPAAR, '2026-11-25', 500, 'Eigen overboeking', 'OVERBOEKING VAN SALARISREKENING', 'intern'); }
    for (const t of (o.extra || [])) add(t.acc || LEEF, t.date, t.amount, t.name || 'Extra', t.desc || ('BEA, BETAALPAS ' + (t.name || 'EXTRA').toUpperCase()), t.cat);
    Object.assign(SET, o.set2 || {});
    save(); try { buildAccMeta(); } catch (_) {}
    render();
  }, { MAIN, LEEF, SPAAR, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, CATH };
