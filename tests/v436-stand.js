/* v436: DE STAND VAN 17 OKTOBER 2026, op v432-stand (salaris EUR 5.216 op de 24e, Salarisrekening en Leefgeld, Plan-inleg EUR 280).
   Het maandbudget van oktober was op de 1e EUR 3.375 (potjes EUR 3.095 plus de inleg in Plan EUR 280). Deze maand kwamen er twee
   wijzigingen bij, uit de logs van v435: Shurgard geaccepteerd (vaste last +EUR 77 in Huur, uit het maandbudget) en Verzekeringen
   herzien (EUR 335 -> EUR 298, naar het maandbudget). Het budget van nu is daarmee EUR 3.415.
   GECONSTRUEERD EN NIET GEMETEN: de logs van het toestel staan alleen daar; dit is de vorm die de gebruiker beschreef (EUR 3.375 vast
   op 1 okt, EUR 3.415 op Grip, EUR 40 verschil uit keuzes die deze maand werden geaccepteerd). Het tweede bedrag (-37) is een
   voorbeeld, zoals in de mockup. */
const S = require('./v432-stand');
async function boot(page, o) {
  o = o || {};
  await S.boot(page, { dag: o.dag || '2026-10-17', ont: o.ont, set: o.set });
  if (o.kaal) return;
  await page.evaluate(() => {
    SET.budgets = Object.assign({}, SET.budgets, { huur: 777, verzekering: 298, vervoer: 870 });
    SET.vastAccept = Object.assign({}, SET.vastAccept, { SHURGARD: { op: '2026-10-16', bedrag: 77, cat: 'huur', bron: 'budget' } });
    SET.potHerzienLog = (SET.potHerzienLog || []).concat([{ k: 'verzekering', naam: 'Verzekeringen', van: 335, naar: 298, maand: '2026-10', bron: 'naar het maandbudget', op: '2026-10-16' }]);
    delete SET.maandBudget;
    save(); render();
  });
}
module.exports = Object.assign({}, S, { boot });
