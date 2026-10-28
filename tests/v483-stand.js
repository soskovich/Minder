/* v483: TWEE VASTE LASTEN OP DEZELFDE DAG OP DE BETAALREKENING, één SEPA en één woning via Tikkie met IBAN.
   Op v432-stand (Leefgeld = betaalrekening) komt de woning Nathaniel Cathalina EUR 300 via een Tikkie/iDEAL binnen MET de
   IBAN in de omschrijving (dus woningKeyVan matcht hem, hij folt op Leefgeld), op de 1e; daarnaast een SEPA-incasso van
   Allianz Nederland Schade EUR 99 op de 1e. Een salaris op 24 okt, zodat de lopende periode 24 okt - 23 nov loopt en 1 nov
   erin valt. Leefgeld staat krap. GECONSTRUEERD, niet gemeten: de boekingen van het toestel staan alleen daar; dit is de
   vorm die de gebruiker beschreef (1 nov: "Allianz Nederland Schade, Nathaniel Cathalina", -EUR 399). */
const V432 = require('./v432-stand');
const { MAIN, SPAAR, LEEF } = V432;
const CATH = 'NL77CATH0000009999';
async function boot(page, o) {
  o = o || {};
  await V432.boot(page, { dag: o.dag || '2026-10-30' });
  await page.evaluate(({ MAIN, LEEF, CATH, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v483' + acc.slice(-4) + d + n + Math.round(Math.abs(a)), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    /* het salaris van 24 okt, zodat de periode 24 okt - 23 nov loopt (zelfde naam/desc als het maand-salaris, voor recurKey) */
    add(MAIN, '2026-10-24', 5216, 'Werkgever', 'SALARIS LOON');
    /* de woning via Tikkie MET de IBAN in de omschrijving, op de 1e; booked:false laat oktober weg (nov nog verwacht) */
    const maanden = o.booked === false ? ['2026-07', '2026-08', '2026-09'] : ['2026-07', '2026-08', '2026-09', '2026-10'];
    let i = 0; for (const m of maanden) add(LEEF, m + '-01', -300, 'Nathaniel Cathalina', 'iDEAL Tikkie Nathaniel Cathalina ' + CATH + ' ' + m + ' ref' + (i++), 'huur');
    /* de SEPA-incasso van Allianz op de 1e, herkend als vaste last (schema), op dezelfde dag als de woning. EUR 99,40 (centen),
       zodat de som van de afgeronde per-post-regels afwijkt van het exacte totaal: dan bijt test c's sabotage ("lees de vaste
       lasten uit de gegroepeerde/afgeronde regel"). De woning blijft op precies EUR 300 voor test a (stand stijgt met 300). */
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) add(LEEF, m + '-01', -99.40, 'Allianz Nederland Schade', 'SEPA INCASSO ALLIANZ NEDERLAND SCHADE', 'verzekering');
    SET.kennis = Object.assign({}, SET.kennis, { ['woning|' + CATH]: { soort: 'woning', ja: true, iban: CATH, partij: 'Nathaniel Cathalina', bedrag: 300, dag: 1, vanaf: '2026-10', op: '2026-10-01' } });
    SET.manualBal = Object.assign({}, SET.manualBal, { [LEEF]: (o.leef != null ? o.leef : 350) });
    Object.assign(SET, o.set || {});
    save(); try { buildAccMeta(); } catch (_) {}
    /* een Akkoord dat de LOPENDE periode dekt (zodat salTekortActief geldt): lees salPeriode en zet salVerdeling erop */
    try { const SP = salPeriode(); SET.salVerdeling = { op: SP.cur.werkelijk || '2026-10-24', ym: SP.cur.ym, salYM: SP.cur.ym, rek: { [MAIN]: 1200, [LEEF]: 850 }, opzij: 3000, plan: 280, salaris: 5216, salAcc: MAIN, start: SP.cur.start, eind: SP.cur.eind, dagen: SP.cur.dagen }; save(); } catch (_) {}
    render();
  }, { MAIN, LEEF, CATH, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, CATH };
