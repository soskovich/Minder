/* onderhoud4 (tweede en derde aanvulling): de stand van 27 nov van de gebruiker, NAGEBOUWD op periode-stand (de bedragen uit de
   melding, de boekingen van het toestel staan alleen daar; GECONSTRUEERD). Salaris op de 24e met een surplus van EUR 511 (vast 5.216,
   vergoedingen 412, eenmalig 99), de verdeling Salarisrekening 100 · Betaalrekening 1.750 · Leefgeld 1.700 · reserveringen 36 · opzij
   1.630. Uit het salaris: Betaalrekening 1.500, Leefgeld 1.720, spaarrekening 2.500, reserveringen 0. Op 12 nov EUR 1.000 van de
   spaarrekening naar de reserveringsrekening (een verschuiving, keuze "Nee, hoort bij Reserveren"). Op 27 nov EUR 398,88 van de
   spaarrekening naar de salarisrekening, en daarvandaan Betaalrekening +250, Reserveringen +36, Leefgeld +20 (EUR 92,88 blijft).
   Spaarrekening EUR 5.927,12, noodfonds toegewezen 3.326, Inrichting 3.000 van 3.000. o.terugzet zet een oude terugzetkeuze van
   november ("terug over 3 maanden") die de verschuiving van EUR 1.000 meetelde. */
const P = require('./periode-stand');
const { MAIN, SPAAR, LEEF, BET } = P;
const RESV = 'NL00RESV0000000077';
async function boot(page, o) {
  o = o || {};
  await P.boot(page, '2026-11-27');
  await page.evaluate(({ MAIN, SPAAR, LEEF, BET, RESV, o }) => {
    TX = TX.filter((t) => !(t.acc === MAIN && String(t.date).slice(0, 10) === '2026-11-25' && Math.round(t.amount) === -300));   // de huur van 25 nov loopt hier niet via de salarisrekening
    const sal = TX.find((t) => t.acc === MAIN && String(t.date).slice(0, 10) === '2026-11-24' && Math.round(t.amount) === 5216);
    sal.amount = 5727; categorize(sal);
    const add = (acc, d, a, n, ds) => { const t = { id: 'o4' + acc.slice(-4) + d + Math.round(Math.abs(a) * 100) + (a < 0 ? 'u' : 'i'), date: d, amount: a, acc, name: n, desc: ds || n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    const over = (van, naar, d, b, n1, n2) => [add(van, d, -b, n2, 'Overboeking naar ' + n2), add(naar, d, b, n1, 'Overboeking van ' + n1)];
    over(MAIN, BET, '2026-11-24', 1500, 'Salarisrekening', 'Betaalrekening');
    over(MAIN, LEEF, '2026-11-24', 1720, 'Salarisrekening', 'Leefgeld');
    over(MAIN, SPAAR, '2026-11-24', 2500, 'Salarisrekening', 'Spaarrekening');
    const vs = over(SPAAR, RESV, '2026-11-12', 1000, 'Spaarrekening', 'Reserveringen');
    const opn = over(SPAAR, MAIN, '2026-11-27', 398.88, 'Spaarrekening', 'Salarisrekening');
    over(MAIN, BET, '2026-11-27', 250, 'Salarisrekening', 'Betaalrekening');
    over(MAIN, RESV, '2026-11-27', 36, 'Salarisrekening', 'Reserveringen');
    over(MAIN, LEEF, '2026-11-27', 20, 'Salarisrekening', 'Leefgeld');
    window.__o4 = { vs: vs[0].id, opn: opn[0].id, sal: sal.id };
    if (!OWN.includes(RESV)) OWN.push(RESV);
    SET.resAcc = RESV; SET.acctName = Object.assign({}, SET.acctName, { [RESV]: 'Reserveringen' });
    SET.savingsAcc = Object.assign({}, SET.savingsAcc, { [RESV]: false });
    SET.manualBal = Object.assign({}, SET.manualBal, { [SPAAR]: 5927.12, [RESV]: 1036 });
    SET.manualBalDatum = Object.assign({}, SET.manualBalDatum, { [SPAAR]: '2026-11-27', [RESV]: '2026-11-27' });
    SET.verschuiving = { [vs[0].id]: { kant: 'reserveren', keuze: 'nee' } };
    SET.salSplit = { vast: 5216, key: recurKey(sal), naam: 'Werkgever' };
    SET.salSplitAntw = { [sal.id]: { verg: 412 } };
    SET.nfToegewezen = 3326; SET.nfDoelVast = 6000;
    SET.goals = [{ id: 'iw', naam: 'Inrichting', doel: 3000, gespaard: 3000, streefdatum: '2027-06', allocMode: 'auto' }];
    delete SET.opnameBron; delete SET.terugzet; delete SET.terugzetGat;
    if (o.terugzet) SET.terugzet = { '2026-11': { keuze: 'drie', bedrag: 1000, delen: [334, 333, 333], bron: [{ id: 'iw', type: 'goal', naam: 'Inrichting', af: 1000 }], op: '2026-11-13' } };
    const SP = salPeriode();
    SET.salVerdeling = { op: '2026-11-24', ym: SP.cur.ym, salYM: SP.cur.ym, rek: { [MAIN]: 100, [BET]: 1750, [LEEF]: 1700 }, opzij: 1630, reserveringen: 36, salaris: 5216, salAcc: MAIN, start: SP.cur.start, eind: SP.cur.eind, dagen: SP.cur.dagen };
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {}
    render();
  }, { MAIN, SPAAR, LEEF, BET, RESV, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, BET, RESV };
