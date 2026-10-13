/* v408: DE STAND VAN HET TOESTEL VOOR "EEN SIGNAAL PER POTJE", nagebouwd op grip-v406-stand (10 oktober 2026) met wat de
   gebruiker op het toestel zag en meldde:
   - Huur: te ruim (vooruitkijkend) en tegelijk "2 van 3 mnd boven budget" (terugkijkend). In juli en augustus EUR 760
     tegen een budget van EUR 700, in september EUR 137 (Shurgard): een breuk.
   - Online shopping: juli EUR 99 tegen EUR 95 (onder de uitschieter-drempel), augustus EUR 160 (wel erboven).
   - Uit eten: deze maand ruim boven zijn budget, dus een uitschieter (en daarmee een patroon in Begrijpen).
   - Kinderen (een eigen categorie zonder potje): juli EUR 4, augustus EUR 35, september EUR 136, een stijgende trend.
   GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. */
const K6 = require('./grip-v406-stand');
async function boot(page, o) {
  o = o || {};
  await K6.boot(page, o);
  await page.evaluate(({ MAIN, o }) => {
    const add = (d, a, n, cat) => { const t = { id: 'v8' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: 'BEA, BETAALPAS ' + n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
    add('2026-07-01', -760, 'Woningstichting Oud', 'huur'); add('2026-08-01', -674, 'Woningstichting Oud', 'huur');
    add('2026-07-20', -99, 'Bol Com', 'shopping'); add('2026-08-22', -65, 'Bol Com', 'shopping');
    add('2026-10-04', -(o.uiteten == null ? 144 : o.uiteten), 'Restaurant Lona', 'uiteten');
    SET.eigenCats = Object.assign({}, SET.eigenCats, { e_kinderen: { naam: 'Kinderen', aard: 'wisselend', kleur: '#f59e0b', op: '2026-06-01' } });
    eigenCatsLaad();
    add('2026-07-14', -4, 'Kruidvat Kids', 'e_kinderen'); add('2026-08-14', -35, 'Kinderkleding', 'e_kinderen'); add('2026-09-14', -136, 'Zwemles', 'e_kinderen');
    save(); render();
  }, { MAIN: K6.MAIN, o });
}
module.exports = { boot, MAIN: K6.MAIN };
