/* v510b: DE HOLDING BETAALT GEEN INKOMEN MEER. Op periode-stand (Salarisrekening MAIN met het salaris van EUR 5.216 van de werkgever op de
   24e, sinds maart) komt de holding Ernst Management Holding, aangewezen als holding (zoals "Dit is mijn holding" doet, v421/v426):
   - een bijschrijving van EUR 2.500 op de 1e van maart tot en met oktober, en EUR 2.500 op 2 nov (de meting van het toestel), met
     dezelfde dag een eigen overboeking van EUR 2.500 naar de spaarrekening (Vincent zet hem direct door, Eigen rekening);
   - een afschrijving van EUR 400 naar de holding op 15 juni (geld terug naar je bedrijf);
   - een bijschrijving van EUR 300 van "EMH Beheer" op 10 aug die je tot v510b met de hand op de categorie Holding zette (OVR), een andere
     partij dan de aangewezen holding.
   Met `vroeg` ook EUR 2.500 op 1 jan en 1 feb, toen er nog geen werkgever betaalde: dat waren maandbetalingen van de holding (inkomen).
   Met `drieduizend` is de bijschrijving van 2 nov EUR 3.000 (boven de vangrail van v509b, de helft van EUR 5.216).
   GECONSTRUEERD, niet gemeten: de boekingen van het toestel staan alleen daar. Op het toestel betaalde de holding tot augustus het
   maandinkomen; in deze fixture betaalt de werkgever al vanaf maart, dus daar is februari de laatste maandbetaling (test a). */
const S = require('./periode-stand');
const { MAIN, SPAAR } = S;
const HOLD = 'NL55HOLD0000007777';
const NAAM = 'Ernst Management Holding';

async function boot(page, dag, o) {
  o = o || {};
  await S.boot(page, dag || '2026-11-02');
  await page.evaluate(({ MAIN, SPAAR, HOLD, NAAM, o }) => {
    const add = (acc, d, a, n, ds, cat, ref) => { const t = { id: 'v510b' + acc.slice(-4) + d + Math.round(a * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: ref ? [ref] : [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    const hold = (d, a) => add(MAIN, d, a, NAAM, 'SEPA OVERBOEKING ' + NAAM.toUpperCase() + ' ' + HOLD + ' ' + d, null, HOLD);
    const mnd = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'];
    if (o.vroeg) mnd.unshift('2026-01', '2026-02');
    for (const m of mnd) hold(m + '-01', 2500);
    hold('2026-06-15', -400);
    const nov = hold('2026-11-02', o.drieduizend ? 3000 : 2500);
    add(MAIN, '2026-11-02', -(o.drieduizend ? 3000 : 2500), 'Eigen overboeking', 'OVERBOEKING NAAR SPAARREKENING', 'intern', SPAAR);
    add(SPAAR, '2026-11-02', (o.drieduizend ? 3000 : 2500), 'Eigen overboeking', 'OVERBOEKING VAN SALARISREKENING', 'intern', MAIN);
    add(MAIN, '2026-08-10', 300, 'EMH Beheer', 'SEPA OVERBOEKING EMH BEHEER', 'holding');
    TX.sort((x, y) => x.date.localeCompare(y.date));
    const k = recurKey(nov);
    SET.kennis = Object.assign({}, SET.kennis, { ['holding|' + k]: { soort: 'holding', key: k, partij: NAAM, wat: 'Je holding (eigen bedrijf)', bron: 'jij', op: '2026-09-01', ovrVoor: {} } });
    if (o.vanaf) Object.assign(SET.kennis['holding|' + k], { geenInkomenVanaf: o.vanaf });
    save(); try { applyOwnAccounts(); } catch (_) {} save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {}
    render();
  }, { MAIN, SPAAR, HOLD, NAAM, o });
}
/* Een stand zoals na een herstart: load() (daarin de migratie van v510b) en wat de boot onderaan index.html daarna doet (categorize,
   applyOwnAccounts). Geen page.reload(): de fixture zet localStorage in een init-script, en een reload zou de stand terugzetten. */
async function herlaad(page) {
  await page.evaluate(() => { save(); load(); if (TX.length) { TX.forEach(categorize); applyOwnAccounts(); buildAccMeta(); }
    save(); window._rekV = null; try { runMemoVergeten(); } catch (_) {} render(); });
}
/* Getallen die een scherm toont, in centen; per afgeronde maand en de lopende. Elke lezer is een functie die de app zelf gebruikt. */
const METEN = () => {
  const c = x => (typeof x === 'number' && isFinite(x)) ? Math.round(x * 100) : x;
  const kies = (o, d) => { if (o == null) return null; if (typeof o === 'number') return c(o); if (typeof o !== 'object') return o;
    const u = {}; for (const [k, v] of Object.entries(o)) { if (typeof v === 'number') u[k] = c(v); else if (v && typeof v === 'object' && !Array.isArray(v) && d < 1) u[k] = kies(v, d + 1); }
    return u; };
  const som = o => c(Object.values(o || {}).reduce((a, x) => a + (+x || 0), 0));
  const R = { maand: {} };
  for (const ym of ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']) {
    R.maand[ym] = { inkomen: kies(maandInkomen(ym), 0), totals: kies(totals(ym), 0), potjes: som(catSpendMap(ym)), opzij: c(savedNet(ym)),
      uitgegeven: kies(uitgegevenStand({ m: ym }), 0), budget: som(budgetVoorMaand(ym)) };
  }
  const L = monthLiquidity();
  R.home = { incBinnen: c(L.incBinnen), incNorm: c(L.incNorm), incDue: c(L.incDue), fixDue: c(L.fixDue), safe: c(safeToSpend().safe), totaal: c(totalBalance().sum) };
  let V = null; try { V = maandVooruit(); } catch (_) {}
  R.vooruit = V ? { budget: c(V.budget), projectie: c(V.projectie) } : null;
  const O = opzijPeriode(); R.opzijPeriode = O ? { netto: c(O.netto), doel: c(O.doel) } : null;
  const P = salPeriode(); R.periode = P && P.cur ? { start: P.cur.start, eind: P.cur.eind } : null;
  return R;
};
/* De regels van de CONTROLE in blok 20 (afgeronde maanden): "  <mnd>: a + b + c + d + e = X tegen ... = Y: klopt". */
const CONTROLE = async page => page.evaluate(async () => { const L = (await diagTekst()).split('\n');
  const i = L.findIndex(x => x.indexOf('CONTROLE (afgeronde maanden): vast + potjes') === 0);
  const o = []; for (let j = i + 2; j < L.length; j++) { const x = L[j]; if (!x.trim()) break; if (/^  [a-z]{3}: .* tegen .*: (klopt|VERSCHILT)/.test(x)) o.push(x); }
  return o; });
module.exports = { boot, herlaad, METEN, CONTROLE, MAIN, SPAAR, HOLD, NAAM };
