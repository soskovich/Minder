/* v487: "Na mijn salaris" op de woning. De gewone betaaldag van de huur (1 nov) ligt NA de salarisstorting van de lopende periode
   (26 okt), dus "na mijn salaris" moet het EERSTE salaris OP OF NA 1 nov pakken (24 nov), niet het salaris van de lopende periode.
   Salarissen op de 24e (anker), met okt op de 26e (onregelmatig, zoals het toestel) en nov op de 24e. Woning Nathaniel Cathalina
   EUR 300 via Tikkie/iDEAL met de IBAN in de omschrijving (folt op de betaalrekening LEEF), gewone dag 1, booked:false zodat de
   okt/nov-termijn verwacht is. Vandaag 28 okt → de lopende periode is 26 okt t/m 23 nov (dag voor het volgende verwachte salaris 24
   nov). GECONSTRUEERD, niet gemeten. */
const V432 = require('./v432-stand');
const { MAIN, SPAAR, LEEF } = V432;
const CATH = 'NL77CATH0000009999';
async function boot(page, o) {
  o = o || {};
  await V432.boot(page, { dag: o.dag || '2026-10-28' });
  await page.evaluate(({ MAIN, LEEF, CATH, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v487' + acc.slice(-4) + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    /* salarissen: de 24e als anker (jun t/m sep), okt op de 26e (onregelmatig), nov op de 24e. Zo geeft salarisVerwacht('2026-11')
       de 24e en loopt de lopende periode 26 okt - 23 nov. */
    for (const d of ['2026-06-24', '2026-07-24', '2026-08-24', '2026-09-24']) add(MAIN, d, 5216, 'Werkgever', 'SALARIS LOON');
    add(MAIN, '2026-10-26', 5216, 'Werkgever', 'SALARIS LOON');
    if (o.novSalaris !== false) add(MAIN, '2026-11-24', 5216, 'Werkgever', 'SALARIS LOON');
    /* de woning via Tikkie MET de IBAN in de omschrijving, gewone dag 1; booked:false laat okt/nov weg (verwacht) */
    for (const m of ['2026-07', '2026-08', '2026-09']) add(LEEF, m + '-01', -300, 'Nathaniel Cathalina', 'iDEAL Tikkie Nathaniel Cathalina ' + CATH + ' ' + m, 'huur');
    /* v503: o.oktNa boekt de oktoberhuur na het salaris (27 okt), zoals op het toestel; zonder staat oktober open, en met "Na mijn salaris"
       blijft die termijn (27 okt) dan verwacht tot hij geboekt is */
    if (o.oktNa) add(LEEF, '2026-10-27', -300, 'Nathaniel Cathalina', 'iDEAL Tikkie Nathaniel Cathalina ' + CATH + ' 2026-10');
    SET.kennis = Object.assign({}, SET.kennis, { ['woning|' + CATH]: { soort: 'woning', ja: true, iban: CATH, partij: 'Nathaniel Cathalina', bedrag: 300, dag: 1, vanaf: '2026-07', op: '2026-07-01' } });
    SET.manualBal = Object.assign({}, SET.manualBal, { [LEEF]: (o.leef != null ? o.leef : 2000), [MAIN]: (o.main != null ? o.main : 1750) });
    Object.assign(SET, o.set || {});
    save(); try { buildAccMeta(); } catch (_) {}
    /* een Akkoord dat de LOPENDE periode dekt (zodat salTekortActief geldt) */
    try { const SP = salPeriode(); if (SP) SET.salVerdeling = { op: SP.cur.werkelijk || '2026-10-26', ym: SP.cur.ym, salYM: SP.cur.ym, rek: { [MAIN]: 1200, [LEEF]: 850 }, opzij: 3000, plan: 280, salaris: 5216, salAcc: MAIN, start: SP.cur.start, eind: SP.cur.eind, dagen: SP.cur.dagen }; save(); } catch (_) {}
    render();
  }, { MAIN, LEEF, CATH, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, CATH };
