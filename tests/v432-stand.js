/* v432: DE STAND MET TWEE BETAALREKENINGEN. Op grip-kring-stand (salaris EUR 5.216 op de 24e naar de Salarisrekening, vaste lasten
   daar) met een tweede betaalrekening, Leefgeld: de kaartbetalingen (boodschappen, uit eten, vices, overig) gaan daarvan af, elke
   maand komt er EUR 1.000 van de Salarisrekening binnen, en in september en oktober haal je geld van je spaarrekening naar Leefgeld.
   Een Geldmaat-opname van EUR 100 per maand op Leefgeld. GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen
   daar; dit is de vorm die de gebruiker beschreef (Leefgeld heeft de meeste onttrekkingen). */
const K = require('./grip-kring-stand');
const { MAIN, SPAAR } = K;
const LEEF = 'NL01LEEF0000004444';
const ONT = [['2026-09-08', 400], ['2026-09-15', 350], ['2026-09-20', 300], ['2026-10-03', 250], ['2026-10-09', 200]];
async function boot(page, o) {
  o = o || {};
  await K.boot(page, { dag: o.dag || '2026-10-16' });
  await page.evaluate(({ MAIN, SPAAR, LEEF, ONT, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'l' + acc.slice(-4) + d + n + a, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    /* de kaartbetalingen van juli tot en met oktober gaan van Leefgeld af */
    for (const t of TX) if (/BETAALPAS (ALBERT HEIJN|CAFE DE KROEG|COFFEESHOP|HEMA WINKEL)/.test(t.desc || '')) t.acc = LEEF;
    for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) {
      add(MAIN, m + '-25', -1000, 'Eigen overboeking', 'OVERBOEKING NAAR LEEFGELD', 'intern'); add(LEEF, m + '-25', 1000, 'Eigen overboeking', 'OVERBOEKING VAN SALARISREKENING', 'intern');
      add(LEEF, m + '-11', -100, 'Geldmaat Centrum', 'GEA, BETAALPAS GELDMAAT CENTRUM');
    }
    add(LEEF, '2026-04-07', -180, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen'); add(LEEF, '2026-05-07', -260, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen'); add(LEEF, '2026-06-07', -220, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen');
    for (const [d, a] of (o.ont || ONT)) { add(SPAAR, d, -a, 'Eigen overboeking', 'OVERBOEKING NAAR LEEFGELD', 'intern'); add(LEEF, d, a, 'Eigen overboeking', 'OVERBOEKING VAN SPAREN', 'intern'); }
    if (!OWN.includes(LEEF)) OWN.push(LEEF);
    SET.acctName = Object.assign({}, SET.acctName, { [LEEF]: 'Leefgeld', [MAIN]: 'Salarisrekening' });
    SET.manualBal = Object.assign({}, SET.manualBal, { [LEEF]: 180 });
    SET.savingsAcc = Object.assign({}, SET.savingsAcc, { [LEEF]: false });
    Object.assign(SET, o.set || {});
    save(); try { buildAccMeta(); } catch (_) {} render();
  }, { MAIN, SPAAR, LEEF, ONT, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, ONT };
