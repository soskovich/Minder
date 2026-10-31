/* v503: SportCity als nieuwe vaste last, op v501-stand (26 nov, afgeronde maanden mei t/m okt). GECONSTRUEERD, niet gemeten.
   - Health Club: de gestopte post van de stand (Health Club Purmerend, laatst €50 per maand).
   - sport 'reeks': SportCity €40 op 10 aug, sep en okt, GEEN boeking in de lopende maand (november).
   - sport 'mini': de vorm van het toestel. SportCity heeft in de afgeronde maanden alleen een kaartcontrole van €0,01 (3 okt) en de echte
     afschrijving (€40) valt in de lopende maand (10 nov). Tot v503 gaf dat "nieuw +€0" en "nieuw sinds ," (zonder datum).
   - sport 'leeg': alleen de kaartcontrole, geen echte afschrijving: het bedrag is onbekend.
   SportCity staat via SET.fixOvrM op vast (zoals de kennis van v442 op het toestel). */
const V501 = require('./v501-stand');
const { MAIN, SPAAR, LEEF, CATH } = V501;
async function boot(page, o) {
  o = o || {};
  await V501.boot(page, Object.assign({ dag: '2026-11-26' }, o.v501 || {}));
  await page.evaluate(({ MAIN, o }) => {
    const add = (d, a, n, ds) => { const t = { id: 'v503' + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc: MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'sport'; return t; };
    let sc = null;
    if (o.sport === 'reeks') for (const m of ['2026-08', '2026-09', '2026-10']) sc = add(m + '-10', -40, 'SportCity', 'SEPA Incasso SportCity abonnement ' + m);
    if (o.sport === 'mini' || o.sport === 'leeg') sc = add('2026-10-03', -0.01, 'SportCity', 'SEPA Incasso SportCity kaartcontrole');
    if (o.sport === 'mini') add('2026-11-10', -40, 'SportCity', 'SEPA Incasso SportCity abonnement 2026-11');
    if (sc) SET.fixOvrM = Object.assign({}, SET.fixOvrM, { [recurKey(sc)]: 'fixed' });
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {}
    render();
  }, { MAIN, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, CATH };
