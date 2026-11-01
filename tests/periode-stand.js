/* v507: DE STAND VAN HET VANGNET VOOR DE SALARISPERIODE. Op v504-stand (Salarisrekening MAIN met het salaris van EUR 5.216 op de
   24e, Betaalrekening BET met Hiltermann EUR 537 op de 12e, Leefgeld LEEF, de woning Nathaniel Cathalina EUR 300 via Tikkie met "Na mijn
   salaris", de verdeling 150/1600/1700 en opzij 1766) komen:
   - het salaris van 24 nov als boeking zodra de dag op of na 24 nov ligt (het salaris van de periode 24 nov - 23 dec);
   - boekingen TOT GISTEREN in november en december, zoals een dagelijkse sync: elke drie dagen boodschappen EUR 40 op Leefgeld, en
     Hiltermann op de 12e en de huur op de 25e als die dag voorbij is; de saldi zijn van vandaag;
   - een potje Contant van EUR 400 dat al in oktober bestond (geen "nieuw potje deze maand").
   De budgetsplitsing (vast, potjes, contant) komt uit de app en wordt in het vangnet GEMETEN, niet vastgezet: de gemelde getallen
   van het toestel (vast 1347 · potjes 1904 · contant 400) staan alleen daar. GECONSTRUEERD, niet gemeten. */
const S = require('./v504-stand');
const { MAIN, SPAAR, LEEF, BET, CATH } = S;
const DAGEN = ['2026-11-01', '2026-11-15', '2026-11-23', '2026-11-24', '2026-11-26', '2026-12-23'];

async function boot(page, dag) {
  await S.boot(page, { dag, v489: { novSalaris: dag >= '2026-11-24' } });
  await page.evaluate(({ dag, MAIN, LEEF, BET, CATH }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v507' + acc.slice(-4) + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    const gisteren = rekDag(dag, -1);
    for (let d = '2026-11-02'; d <= gisteren; d = rekDag(d, 3)) add(LEEF, d, -40, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen');
    for (const d of ['2026-11-12', '2026-12-12']) if (d <= gisteren) add(BET, d, -537, 'Hiltermann Lease', 'SEPA Incasso Hiltermann Lease termijn ' + d.slice(0, 7), 'vervoer');
    if ('2026-11-25' <= gisteren) add(MAIN, '2026-11-25', -300, 'Nathaniel Cathalina', 'iDEAL Tikkie Nathaniel Cathalina ' + CATH + ' 2026-11', 'huur');
    /* een uitgave zonder norm (buiten budget) in elke periode: op 20 nov (de periode van 24 okt) en op 25 nov (die van 24 nov), zodat
       een lezer die de kalendermaand pakt in plaats van de periode een ander buiten budget telt */
    for (const d of ['2026-11-20', '2026-11-25']) if (d <= gisteren) add(LEEF, d, -60, 'Gemeente Leges', 'iDEAL Gemeente leges ' + d, 'onvoorzien');
    SET.budgets = Object.assign({}, SET.budgets, { contant: 400 });
    SET.potWekelijks = Object.assign({}, SET.potWekelijks, { boodschappen: true }); SET.wekGekozen = true;
    SET.budgetHist = Object.assign({}, SET.budgetHist, { '2026-10': Object.assign({}, (SET.budgetHist || {})['2026-10'] || SET.budgets, { contant: 400 }) });
    for (const a of Object.keys(SET.manualBalDatum || {})) SET.manualBalDatum[a] = dag;
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {}
    render();
  }, { dag, MAIN, LEEF, BET, CATH });
}
module.exports = { boot, DAGEN, MAIN, SPAAR, LEEF, BET, CATH };
