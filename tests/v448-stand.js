/* v448: DE STAND VAN DE GEBRUIKER IN DE VORM VAN ZIJN MELDING, GECONSTRUEERD (de boekingen van het toestel staan alleen daar). Op
   v432-stand (salaris op de 24e, periode 24 sep t/m 25 okt, Leefgeld met een Geldmaat-opname van EUR 100 per maand van april tot
   september): de v420-grens op 07-10 (de eerste telling van toen), dus de opnames tot en met september bleven 'intern'; een extra
   opname van EUR 200 op 23-09 (vorige periode); EUR 400 contant terug van Ma op 05-10; een telling van EUR 720 op 07-10; geen opname
   sinds 24-09; het potje Contant EUR 400; en vanaf november een potje EUR 10 lager (budgetsNext), zoals de EUR 10 in de melding. */
const S432 = require('./v432-stand');
const { LEEF } = S432;
async function boot(page, o) {
  o = o || {};
  await S432.boot(page, { dag: o.dag || '2026-10-21' });
  await page.evaluate(({ LEEF, o }) => {
    const t = { id: 'opn2309', date: '2026-09-23', amount: -200, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    TX.push(t);
    if (o.vorigOpn) TX.push({ id: 'opn1009', date: '2026-09-10', amount: -o.vorigOpn, acc: LEEF, name: 'Geldmaat Station', desc: 'GEA, BETAALPAS GELDMAAT STATION', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });   // v448-nazorg: de vorige periode met meer opnames
    SET.opnameVanaf = '2026-10-07';
    SET.contant = { stand: 720, datum: '2026-10-07', op: Date.parse('2026-10-07T12:00:00') };
    SET.contantHist = [{ datum: '2026-10-07', stand: 720, op: Date.parse('2026-10-07T12:00:00'), bron: 'telling' }];
    if (o.beginTelling != null) SET.contantHist.unshift({ datum: '2026-09-23', stand: o.beginTelling, op: Date.parse('2026-09-23T20:00:00'), bron: 'telling' });   // v448-nazorg: een telling voor de start
    SET.contantIn = [{ id: 'ciMa', datum: '2026-10-05', op: Date.parse('2026-10-05T12:00:00'), bedrag: 400, aflossing: 400, loanId: 'l1', naam: 'Ma' }];
    if (o.potje !== false) { window._bwKeuze = 'door jou'; potPlanZet(CONTANT_CAT, thisYM(), 400); window._bwKeuze = undefined; }
    if (o.lager !== false) { SET.budgetsNext = Object.assign({}, SET.budgetsNext, { vices: Math.max((+(SET.budgets || {}).vices || 0) - 10, 0) }); }
    TX.forEach(categorize); try { applyOwnAccounts(); buildAccMeta(); } catch (_) {}
    save(); render();
  }, { LEEF, o });
}
module.exports = { boot, LEEF };
