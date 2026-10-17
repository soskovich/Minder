/* v438: DE STAND VAN 17 OKTOBER 2026 NA v437, op v437-stand (vastgelegd EUR 3.375; deze maand Shurgard geaccepteerd +77 in Huur en
   Verzekeringen herzien -37). Daarbovenop de vorm die het toestel liet zien:
   - drie categorieen zonder potje met uitgaven deze maand: Zorg & apotheek EUR 159 (de Tikkie aan Lausa Eriksson, door jou eenmalig
     genoemd), Vakantie & reizen EUR 220 en Goede doelen EUR 15;
   - een verwachte bonus van EUR 2.500 in oktober (SET.irregularIncome), nog niet binnen. Met `bonusBinnen: true` komt hij op 15 oktober
     binnen van dezelfde werkgever als je salaris, en is de vraag "Is dit je bonus?" nog niet beantwoord; met `bonusJa: true` heb je
     ja gezegd (SET.onregelmatig).
   GECONSTRUEERD EN NIET GEMETEN: de boekingen en logs van het toestel staan alleen daar; de bedragen zijn die van de melding. */
const S = require('./v437-stand');
const MAIN = 'NL01MAIN0000001111';
async function boot(page, o) {
  o = o || {};
  await S.boot(page, { dag: o.dag || '2026-10-17', opgeslagen: o.opgeslagen, geenBoodschappen: o.geenBoodschappen });
  await page.evaluate(({ LEEF, MAIN, o }) => {
    const add = (acc, date, amount, name, desc, cat, id) => { const t = { id: id || undefined, date, amount, acc, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    const z = add(LEEF, '2026-10-09', -159, 'Lausa Eriksson via Tikkie', 'TIKKIE BETAALVERZOEK LAUSA ERIKSSON', 'zorg');
    SET.eenmaligOk = Object.assign({}, SET.eenmaligOk, { [z.id]: { op: '2026-10-10' } });
    add(LEEF, '2026-10-12', -220, 'Transavia', 'BEA, BETAALPAS TRANSAVIA', 'vakantie');
    add(LEEF, '2026-10-05', -15, 'KWF Kankerbestrijding', 'BEA, BETAALPAS KWF KANKERBESTRIJDING', 'goededoel');
    SET.irregularIncome = [{ id: 'irrbonus', ym: '2026-10', amount: 2500, naam: 'Bonus' }];
    if (o.bonusBinnen || o.bonusJa) { const b = add(MAIN, '2026-10-15', 2500, 'Werkgever', 'SALARIS WERKGEVER BONUS', 'inkomen');
      if (o.bonusJa) { SET.onregelmatig = Object.assign({}, SET.onregelmatig, { [b.id]: 2500 }); SET.irrAntw = Object.assign({}, SET.irrAntw, { irrbonus: { keuze: 'ja', tx: b.id, bedrag: 2500, op: '2026-10-16' } }); } }
    TX.sort((a, b) => a.date.localeCompare(b.date)); save(); render();
  }, { LEEF: S.LEEF, MAIN, o });
}
module.exports = Object.assign({}, S, { boot, MAIN });
