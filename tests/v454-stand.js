/* v454: DE STAND VOOR HET POTJE CONTANT ZONDER EN MET TELLING. GECONSTRUEERD en niet gemeten: v432-stand (Leefgeld met een
   Geldmaat-opname van EUR 100 per maand van april tot september), in november, met een potje Contant van EUR 400 dat al in het
   vastgelegde budget van 1 november staat (dus geen herindeling, v450). De toestelgetallen verifieert de gebruiker met blok 20.
   negRest: een telling van EUR 100 op 31 oktober (de stand begin), een opname van EUR 200 op 5 november en een telling van EUR 400 op
   10 november: hoger dan begin + opnames (300), dus tot de telling is er -100 uitgegeven, en de rest van het potje (de uitkomst min wat
   er in de categorie al uit is, 200) is negatief. Zonder die stand is de sabotage "rest op nul klemmen" inert (v453). */
const S432 = require('./v432-stand');
const { LEEF } = S432;
async function boot(page, o) {
  o = o || {};
  await S432.boot(page, { dag: o.dag || '2026-11-23' });
  await page.evaluate(({ LEEF, o }) => {
    window._bwKeuze = 'door jou'; potPlanZet(CONTANT_CAT, thisYM(), 400); window._bwKeuze = undefined;
    const M = SET.maandBudget[thisYM()]; if (M && !(+M.potjes[CONTANT_CAT] > 0)) { M.potjes[CONTANT_CAT] = 400; M.totaal += 400; }
    const add = (d, a) => { const t = { id: 'v454' + d + a, date: d, amount: a, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    for (const [d, a] of (o.opn || [])) add(d, a);
    if (o.negRest) { add('2026-11-05', -200); SET.contantHist = [{ datum: '2026-10-31', stand: 100, op: 1, bron: 'telling' }, { datum: '2026-11-10', stand: 400, op: 2, bron: 'telling' }]; }
    if (o.hist) SET.contantHist = o.hist;
    save(); render();
  }, { LEEF, o });
}
module.exports = { boot, LEEF };
