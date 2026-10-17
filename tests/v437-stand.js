/* v437: DE STAND VAN 17 OKTOBER 2026 ZOALS HET TOESTEL HEM TOONDE NA v436, op v436-stand (vastgelegd EUR 3.375: potjes EUR 3.095 plus
   de inleg in Plan EUR 280; deze maand Shurgard +77 en Verzekeringen -37). Daarbovenop de vorm die het toestel liet zien:
   - de inleg in Plan stond twee keer in de logs van oktober: je haalde hem weg in Plan (planInlegZet, gelogd in SET.budgetWijzLog EN in
     SET.planInlegLog) en zette hem terug (een toevoeging, alleen in SET.budgetWijzLog). De herstel-regel van v436 telde de weghaal-log
     twee keer en kwam op inleg EUR 560: vastgelegd EUR 3.655, wijzigingen -EUR 240 (Huur +77, Verzekeringen -37, inleg -280);
   - Boodschappen geeft deze maand meer uit dan zijn potje (een uitschieter, zoals de +EUR 61 van het toestel).
   GECONSTRUEERD EN NIET GEMETEN: de logs van het toestel staan alleen daar; dit is de vorm die de gebruiker zag (EUR 3.655, -EUR 240,
   een rij "inleg in Plan -EUR 280"). Met `opgeslagen: true` staat de foute vastlegging ook in SET.maandBudget, zoals v436 hem
   opsloeg; v437 rekent hem bij het laden een keer opnieuw uit. */
const S = require('./v436-stand');
const BOODSCHAPPEN_EXTRA = 280;
async function boot(page, o) {
  o = o || {};
  await S.boot(page, { dag: o.dag || '2026-10-17', ont: o.ont, set: o.set, kaal: o.kaal });
  await page.evaluate(({ LEEF, extra, o }) => {
    SET.budgetWijzLog = [{ op: '2026-10-16', k: '~inleg', van: 280, naar: 0, keuze: 'budget aangepast' }, { op: '2026-10-16', k: '~inleg', van: 0, naar: 280, keuze: 'budget aangepast' }];
    SET.planInlegLog = [{ soort: 'res', van: 280, naar: 0, op: '2026-10-16' }];
    if (extra) { const t = { id: 'v437bs', date: '2026-10-14', amount: -extra, acc: LEEF, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'boodschappen'; TX.sort((a, b) => a.date.localeCompare(b.date)); }
    if (o.opgeslagen) SET.maandBudget = { '2026-10': { totaal: 3655, potjes: { vervoer: 870, verzekering: 335, huur: 700, shopping: 95, belasting: 40, bankkosten: 25, abonnement: 5, boodschappen: 400, overig: 500, sport: 50, uiteten: 55, vices: 20 }, inleg: 560, op: '2026-10-01', vastgelegd: '2026-10-17', bron: 'herstel' } };
    delete SET.mb437; save(); render();
  }, { LEEF: S.LEEF, extra: o.geenBoodschappen ? 0 : BOODSCHAPPEN_EXTRA, o });
}
module.exports = Object.assign({}, S, { boot, BOODSCHAPPEN_EXTRA });
