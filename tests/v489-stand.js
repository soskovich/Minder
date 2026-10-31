/* v489: meldingen opruimen + "tot je salaris" altijd bereikbaar. MAIN is de betaalrekening onder de loep (laag saldo EUR 1.003), met
   twee SEPA-incasso's die het vóór het volgende salaris onder nul trekken (Hiltermann EUR 900 op de 12e, Belastingdienst EUR 160 op de
   20e), zodat accountShortfalls() een tekort ziet (het oude signaal zou vuren). De woning Nathaniel Cathalina EUR 300 gaat via
   Tikkie/iDEAL (geen SEPA-schema) met "Na mijn salaris", dus de huur staat op 25 nov, buiten de lopende periode. Salaris de 24e (nov op
   de 24e → lopende periode 24 okt t/m 23 nov). Vandaag 2026-10-28. GECONSTRUEERD, niet gemeten. */
const V432 = require('./v432-stand');
const { MAIN, SPAAR, LEEF } = V432;
const CATH = 'NL77CATH0000009999';
async function boot(page, o) {
  o = o || {};
  await V432.boot(page, { dag: o.dag || '2026-10-28' });
  await page.evaluate(({ MAIN, LEEF, CATH, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v489' + acc.slice(-4) + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    for (const d of ['2026-07-24', '2026-08-24', '2026-09-24', '2026-10-24']) add(MAIN, d, 5216, 'Werkgever', 'SALARIS LOON');
    if (o.novSalaris !== false) add(MAIN, '2026-11-24', 5216, 'Werkgever', 'SALARIS LOON');
    /* één eigen SEPA-incasso met een UNIEKE partij (geen botsing met de v432-posten), maandelijks → isFixed, volgende termijn
       18 nov (verwachtInMaand true) vóór het volgende inkomen; trekt MAIN (1003) onder nul zodat accountShortfalls() een tekort ziet */
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) add(MAIN, m + '-18', -1200, 'Vastgoedbeheer Noord BV', 'SEPA Incasso Vastgoedbeheer Noord BV termijn ' + m);
    /* de woning via Tikkie (geen SEPA-schema), gewone dag 1, booked jul/aug/sep → okt/nov verwacht */
    for (const m of ['2026-07', '2026-08', '2026-09']) add(MAIN, m + '-01', -300, 'Nathaniel Cathalina', 'iDEAL Tikkie Nathaniel Cathalina ' + CATH + ' ' + m, 'huur');
    if (o.oktNa) add(MAIN, '2026-10-25', -300, 'Nathaniel Cathalina', 'iDEAL Tikkie Nathaniel Cathalina ' + CATH + ' 2026-10');   // v503: de oktoberhuur na het salaris (24 okt + 1)
    SET.kennis = Object.assign({}, SET.kennis, { ['woning|' + CATH]: { soort: 'woning', ja: true, iban: CATH, partij: 'Nathaniel Cathalina', bedrag: 300, dag: 1, vanaf: '2026-07', op: '2026-07-01' } });
    const wk = (() => { try { return woningForecast().key; } catch (_) { return 'woning|' + CATH; } })();
    SET.vastDatum = Object.assign({}, SET.vastDatum, { [wk]: { keuze: 'nasal' } });
    SET.manualBal = Object.assign({}, SET.manualBal, { [MAIN]: (o.main != null ? o.main : 1003), [LEEF]: (o.leef != null ? o.leef : 2000) });
    Object.assign(SET, o.set || {});
    save(); try { buildAccMeta(); } catch (_) {}
    try { const SP = salPeriode(); if (SP) SET.salVerdeling = { op: SP.cur.werkelijk || '2026-10-24', ym: SP.cur.ym, salYM: SP.cur.ym, rek: { [MAIN]: 1200, [LEEF]: 850 }, opzij: 3000, plan: 280, salaris: 5216, salAcc: MAIN, start: SP.cur.start, eind: SP.cur.eind, dagen: SP.cur.dagen }; save(); } catch (_) {}
    render();
  }, { MAIN, LEEF, CATH, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, CATH };
