/* v500: ÉÉN SALARISVOORSTEL, GEEN OORDEEL ZONDER DEKKING, ÉÉN OPZIJ PER MAAND, EN DE DAGWISSEL. Twee standen op 26 nov 2026:
   - gedekt (standaard): v499-stand (boekingen in nov 1–23 en in de lopende periode, dus de boekingen dekken de periode 24 okt t/m
     23 nov), met de afspraak over DIE periode (salYM 2026-10) zodat de Terugblik "Heeft je salarisverdeling gewerkt?" over 24 okt t/m
     23 nov gaat en Zien het voorstel voor 24 nov toont (het salaris van 24 nov is nog niet binnen).
   - ongedekt (gedekt:false): v489-stand zonder boekingen na 24 okt (gegevens t/m 24 okt), dezelfde afspraak.
   Oktober draagt een bonus (andere inkomsten) en een storting naar de spaarrekening die groter is dan wat het salaris na vast, potjes
   en buiten overlaat, zodat de rest zonder andere inkomsten negatief zou zijn (punt 3). GECONSTRUEERD, niet gemeten. */
const V499 = require('./v499-stand');
const V489 = require('./v489-stand');
const { MAIN, SPAAR, LEEF, CATH } = V499;
async function boot(page, o) {
  o = o || {};
  if (o.gedekt === false) await V489.boot(page, Object.assign({ dag: '2026-11-26', novSalaris: false }, o));
  else await V499.boot(page, o);
  await page.evaluate(({ MAIN, SPAAR, LEEF, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v500' + acc.slice(-4) + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    if (o.bonus !== false) {
      const bon = add(MAIN, '2026-10-15', 2190, 'Werkgever', 'BONUS EENMALIG', 'inkomen'); SET.onregelmatig = Object.assign({}, SET.onregelmatig, { [bon.id]: 2190 });   // de bonus is onregelmatig inkomen (v259): geen salaris, wel geld
      /* storting 6.000: netto opzij (6.000 − 1.519 − de 450 eruit van de v489-stand = 4.031) is meer dan wat het salaris na vast, potjes en
         buiten overlaat (5.216 − 1.200 − 175 = 3.841), dus zonder de andere inkomsten zou de rest −€190 zijn en met de bonus +€2.000 */
      add(MAIN, '2026-10-16', -6000, 'Eigen overboeking', 'OVERBOEKING NAAR SPAREN', 'intern'); add(SPAAR, '2026-10-16', 6000, 'Eigen overboeking', 'OVERBOEKING VAN SALARISREKENING', 'intern');
      add(SPAAR, '2026-10-20', -1519, 'Eigen overboeking', 'OVERBOEKING NAAR LEEFGELD', 'intern'); add(LEEF, '2026-10-20', 1519, 'Eigen overboeking', 'OVERBOEKING VAN SPAREN', 'intern');
    }
    /* de afspraak hoort bij de periode 24 okt t/m 23 nov (moment 2 op 26 nov) */
    if (SET.salVerdeling) { SET.salVerdeling.salYM = '2026-10'; SET.salVerdeling.start = '2026-10-24'; SET.salVerdeling.eind = '2026-11-23'; SET.salVerdeling.ym = '2026-10'; }
    Object.assign(SET, o.set3 || {});
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; window._salTek = null; try { runMemoVergeten(); } catch (_) {}
    render();
  }, { MAIN, SPAAR, LEEF, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, CATH };
