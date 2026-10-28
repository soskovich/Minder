/* v485: DE PERIODE BEGINT IN DE LOPENDE KALENDERMAAND (salaris 24 okt, vandaag 28 okt), zodat de periodestart (24 okt) NA de 1e van de
   maand ligt. Dan trof de v482-bug: "al deze periode" telde alleen vanaf 24 okt, dus wat er van 1 t/m 23 okt al in een potje ging telde
   niet af, en bijna de hele oktoberverwachting ging in de laatste dagen van oktober af. Op v432-stand (Leefgeld = betaalrekening) met
   boodschappen gespreid door oktober VOOR de periodestart, plus een potje Contant met een portemonnee-stand, en een SEPA-keuze in
   SET.vastDatum van vóór v483 (opruimen, punt 4). GECONSTRUEERD, niet gemeten. */
const V432 = require('./v432-stand');
const { MAIN, SPAAR, LEEF } = V432;
const ALLIANZ = 'ALLIANZ NEDERLAND SC';   // de recurKey-vorm van een SEPA-incasso (eerste 20 tekens van de opgeschoonde naam)
async function boot(page, o) {
  o = o || {};
  await V432.boot(page, { dag: o.dag || '2026-10-28' });
  await page.evaluate(({ MAIN, LEEF, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v485' + acc.slice(-4) + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    /* het salaris van 24 okt (zelfde naam/desc als het maandsalaris), zodat de lopende periode 24 okt - 23 nov loopt en de start in
       oktober na de 1e valt */
    add(MAIN, '2026-10-24', 5216, 'Werkgever', 'SALARIS LOON');
    /* BOODSCHAPPEN op Leefgeld als een SCHOON VAAK potje: haal de bestaande Albert Heijn-boekingen (uit grip-kring en v432) weg en
       zet een eigen reeks neer, ~350/mnd over apr t/m sep (7 x 50 = 350), zodat het typische niveau en de maandverwachting allebei
       ~350 zijn. In OKTOBER 6 x 55 = 330 VOOR de periodestart (2,6,10,14,18,22 okt). Op 28 okt is dus bijna de hele maand al besteed;
       de bug negeert die 330 (telt pas vanaf 24 okt, de periodestart) en laat de oktoberverwachting in 29/30/31 okt vallen (spike).
       De fix trekt de 330 af, en 29/30/31 okt lopen op het normale tempo (~typisch/dim, zoals november). */
    TX = TX.filter(t => !(t.acc === LEEF && t.name === 'Albert Heijn'));
    for (const m of ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) for (const dd of ['03', '07', '11', '15', '19', '23', '27']) add(LEEF, m + '-' + dd, -50, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen');
    /* oktober is een UITSCHIETER (6 x 110 = 660 > typisch 350), helemaal VOOR de periodestart (2-22 okt). Zo verschillen de
       maandverwachting (660) en het typische niveau (350) duidelijk: de lopende maand trekt de 660 af (nog 0, geen spike in de
       laatste oktoberdagen) en de maanden daarna lopen op het TYPISCHE niveau (350), niet op de oktober-uitschieter. */
    for (const d of ['2026-10-02', '2026-10-06', '2026-10-10', '2026-10-14', '2026-10-18', '2026-10-22']) add(LEEF, d, -110, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen');
    SET.budgets = Object.assign({}, SET.budgets, { boodschappen: 350, uiteten: 70, contant: 400 });
    /* POTJE CONTANT van 400: de krap-berekening en het voorstel moeten dezelfde portemonnee-stand lezen (punt 3). Een telling van
       07-10 van 300 (via SET.contantHist), zodat de schatting een portemonnee-stand geeft. */
    SET.contantHist = (SET.contantHist || []).concat([{ datum: '2026-10-07', waarde: 300, bron: 'telling' }]);
    /* OPRUIMEN (punt 4): een betaaldatum-keuze op een SEPA-sleutel (Allianz), van vóór v483. Die hoort bij het laden te verdwijnen. */
    SET.vastDatum = Object.assign({}, SET.vastDatum, { 'ALLIANZ NEDERLAND SC': { keuze: 'nasal', periode: null, op: '2026-09-01' }, 'woning|NL77CATH0000009999': { keuze: 'nasal', periode: null, op: '2026-10-20' } });
    SET.manualBal = Object.assign({}, SET.manualBal, { [LEEF]: (o.leef != null ? o.leef : 1608), [MAIN]: (o.main != null ? o.main : 1750) });
    Object.assign(SET, o.set || {});
    save(); try { buildAccMeta(); } catch (_) {}
    /* een Akkoord dat de LOPENDE periode dekt (zodat salTekortActief geldt): lees salPeriode en zet salVerdeling erop */
    try { const SP = salPeriode(); if (SP) SET.salVerdeling = { op: SP.cur.werkelijk || '2026-10-24', ym: SP.cur.ym, salYM: SP.cur.ym, rek: { [MAIN]: 1200, [LEEF]: 850 }, opzij: 3000, plan: 280, salaris: 5216, salAcc: MAIN, start: SP.cur.start, eind: SP.cur.eind, dagen: SP.cur.dagen }; save(); } catch (_) {}
    render();
  }, { MAIN, LEEF, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, ALLIANZ };
