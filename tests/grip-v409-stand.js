/* v409: DE STAND VAN HET TOESTEL VOOR CADANS, HISTORISCH BUDGET EN PERIODIEKE POSTEN, nagebouwd op grip-v408-stand
   (10 oktober 2026) met wat de gebruiker meldde:
   - Shurgard 4-wekelijks in Huur (laatste EUR 71): in de komende twaalf maanden een maand met twee termijnen.
   - Abonnementen (potje EUR 5): juli EUR 31, en dat is Huurwoningen, een kwartaalpost (oktober, januari, april, juli);
     augustus EUR 20 aan Spotify. Juli is dus geen boven-budget-maand, en het potje is te krap voor die post.
   GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. */
const K8 = require('./grip-v408-stand');
async function boot(page, o) {
  o = o || {};
  await K8.boot(page, o);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds, cat) => { const t = { id: 'v9' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
    for (const d of ['2025-10-20', '2026-01-20', '2026-04-20', '2026-07-20']) add(d, -31, 'Huurwoningen Premium', 'SEPA INCASSO HUURWONINGEN PREMIUM', 'abonnement');
    add('2026-08-11', -20, 'Spotify', 'BEA, BETAALPAS SPOTIFY', 'abonnement');
    save(); render();
  }, { MAIN: K8.MAIN });
}
module.exports = { boot, MAIN: K8.MAIN };
