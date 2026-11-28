/* v527: DE STAND VAN 27 NOV, NAGEBOUWD NAAR DE VORM VAN DE MELDING (de boekingen van het toestel staan alleen daar; GECONSTRUEERD).
   Op tests/v523-stand.js (het salaris op 25 nov, dus salPeriode().cur begint op 25 nov en periodeVan() op 24 nov: precies de vorm
   waarop deel 0 viel; Hiltermann Lease EUR 537 op de 12e, DELA EUR 160 per kwartaal, eind sep) komen:
   - de vaste lasten met hun datum in de periode 24 nov – 23 dec: Allianz EUR 98,88 en Shurgard EUR 71 op de 2e, SportCity EUR 39,99 op de
     20e (nog te komen); Spotify EUR 10,99 op de 26e (deze periode al betaald, de volgende 26 dec valt erbuiten);
   - een potje Goede doelen van EUR 136 dat jij op vast zette, ZONDER eigen betaling in de periode (deel 0 punt 2: telt niet mee);
   - Uit eten & cafe met een patroon (EUR 200 per maand in sep, okt en nov 1–23) boven zijn potje van EUR 55, zodat de ondergrens per
     potje het hoogste van ruimte en verwachting neemt;
   - met { dubbel: true } twee Geldmaat-opnames van EUR 250 op 25 nov op de Betaalrekening, met een net andere naam (de bank leverde hem
     twee keer; de vorm van het toestel: "Geldmaat Zwanebloem 9" en "Geldmaat GM Zwanebloe");
   - met { salDec: '2026-12-21' } het salaris van december op 21 dec (vroeg, rond de feestdagen).
   DE GETALLEN VAN HET TOESTEL (EUR 7.189, 6.683, 816) STAAN NIET IN DEZE FIXTURE en worden hier niet nagebootst: die toetst
   tests/wip/v527-export.spec.js op de back-up. Deze stand toetst de REGELS. */
const S = require('./v523-stand');
const { MAIN, LEEF, BET } = S;
async function boot(page, o) {
  o = o || {};
  await S.boot(page, { dag: o.dag || '2026-11-27', salDec: o.salDec });
  await page.evaluate(({ MAIN, LEEF, BET, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v527' + acc.slice(-4) + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    const vandaag = vandaagYMD();
    const maand = (ms, dag, bedrag, naam, desc, cat) => { for (const m of ms) { const d = m + '-' + dag; if (d < vandaag) add(BET, d, -bedrag, naam, desc + ' ' + m, cat); } };
    const ms = ['2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
    maand(ms, '02', 98.88, 'Allianz', 'SEPA Incasso Allianz Nederland polis', 'verzekering');
    maand(ms, '02', 71, 'Shurgard', 'SEPA Incasso Shurgard opslag', 'huur');
    maand(ms, '20', 39.99, 'SportCity', 'SEPA Incasso SportCity lidmaatschap', 'sport');
    maand(ms, '26', 10.99, 'Spotify', 'SEPA Incasso Spotify AB', 'abonnement');
    /* Uit eten: EUR 200 per maand in de drie eenheden voor de periode, niets deze periode */
    for (const d of ['2026-09-05', '2026-09-15', '2026-10-05', '2026-10-15', '2026-11-05', '2026-11-15']) add(LEEF, d, -100, 'Restaurant Lona', 'BEA, BETAALPAS Restaurant Lona', 'uiteten');
    /* v527b: { spot: true } een tweede abonnement met de vorm van het toestel: elke maand op de 22e als "Spotify", en in deze periode op
       24 nov als "Spotify AB" (een andere sleutel, dezelfde tegenpartij). Punt 1: geen tweede termijn op 22 dec. */
    if (o.spot) { for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) add(BET, m + '-22', -17.99, 'Spotify Family', 'SEPA Incasso Spotify Family ' + m, 'abonnement');
      add(BET, '2026-11-24', -17.99, 'Spotify Family AB', 'SEPA Incasso Spotify Family 2026-11', 'abonnement'); }
    /* v527b: { week: true } een post per week (de glazenwasser, EUR 15, elke woensdag), laatst betaald op 25 nov: hij krijgt wel termijnen. */
    if (o.week) { let d = new Date('2026-09-02T12:00'); while (ymdVan(d) <= '2026-11-25') { add(BET, ymdVan(d), -15, 'Glazenwasser Jansen', 'SEPA Incasso Glazenwasser Jansen ' + ymdVan(d), 'overig'); d.setDate(d.getDate() + 7); } }
    /* v527b: { cjib: true } de vorm van punt 2: een verwachte post "Boetes cjib" EUR 50 vanaf 26 nov (nog niet gezien) en in oktober een
       CJIB-betaling van EUR 145,98 in Belasting & boetes, met een potje van EUR 64. */
    if (o.cjib) { add(LEEF, '2026-10-12', -145.98, 'CJIB Regeling', 'CJIB Regeling betalingskenmerk', 'belasting');
      SET.budgets = Object.assign({}, SET.budgets, { belasting: 64 });
      SET.vastVerwacht = (SET.vastVerwacht || []).concat([{ id: 'vvcjib527b', naam: 'Boetes cjib', bedrag: 50, ritme: 1, eerste: '2026-11-26', cat: 'belasting', acc: LEEF, schatting: true }]); }
    if (o.dubbel) { add(BET, '2026-11-25', -250, 'Geldmaat Zwanebloem 9', 'GEA, BETAALPAS Geldmaat Zwanebloem 9'); add(BET, '2026-11-25', -250, 'Geldmaat GM Zwanebloe', 'GEA, BETAALPAS Geldmaat GM Zwanebloe'); }
    SET.budgets = Object.assign({}, SET.budgets, { uiteten: 55, goededoel: 136 });
    SET.potAard = Object.assign({}, SET.potAard, { goededoel: 'vast' });
    TX.sort((a, b) => a.date.localeCompare(b.date));
    delete SET.periodeBudgetVast;
    save(); try { buildAccMeta(); } catch (_) {} try { telbaarVergeten(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {} window._gripCyc = null;
    render();
  }, { MAIN, LEEF, BET, o });
}
module.exports = { boot, MAIN, LEEF, BET };
