/* v406: DE STAND VAN HET TOESTEL VOOR LET OP EN DE BRUG, nagebouwd op grip-kring-stand (10 oktober 2026) met wat de
   gebruiker op het toestel zag: Vices (potje EUR 20) EUR 171 · 94 · 96 in juli tot september, Boodschappen naar
   verwachting ruim EUR 50 boven, Zorg & apotheek EUR 159 in oktober en eerder niet, Vakantie & reizen alleen in augustus
   en september met een piek. GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. */
const K = require('./grip-kring-stand');
async function boot(page, o) {
  o = o || {};
  await K.boot(page, o);
  await page.evaluate(({ MAIN, o }) => {
    const add = (d, a, n, cat) => { const t = { id: 'v6' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: 'BEA, BETAALPAS ' + n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
    TX = TX.filter(t => !(catOf(t) === 'vices' && t.date >= '2026-07' && t.date < '2026-10'));
    add('2026-07-15', -171, 'Coffeeshop', 'vices'); add('2026-08-15', -94, 'Coffeeshop', 'vices'); add('2026-09-15', -96, 'Coffeeshop', 'vices');
    add('2026-10-05', -(o.bood == null ? 283 : o.bood), 'Albert Heijn', 'boodschappen');
    SET.budgets.uiteten = 140;   // Uit eten past, zodat de uitschieters Vices en Boodschappen zijn
    delete SET.budgets.zorg; delete SET.budgets.vakantie;
    add('2026-10-07', -159, 'Apotheek Centrum', 'zorg');
    add('2026-08-12', -40, 'NS Internationaal', 'vakantie'); add('2026-09-18', -350, 'Transavia', 'vakantie');
    save(); render();
  }, { MAIN: K.MAIN, o });
}
module.exports = { boot, MAIN: K.MAIN };
