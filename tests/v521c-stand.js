/* v521c: DE STAND VAN 24 NOV (dag 1 van de periode 24 nov – 23 dec), GECONSTRUEERD naar de melding; de boekingen van het toestel staan
   alleen daar. Op tests/periode-stand.js komen:
   - een reserveringsrekening RES (SET.resAcc) met EUR 1.000 erop op 25 okt en de advocaat EUR 1.000 eraf op 20 nov: de pot staat op EUR 0;
   - twee posten: Laserbehandeling EUR 159 in april 2027 (per 6 maanden) en ANWB EUR 123 in november 2027 (per jaar);
   - je inleg EUR 36 per salarisperiode naar je reserveringen (SET.salVerdeling.reserveringen), tenzij { inleg: 0 };
   - de acceptatie uit het gesprek van 6 nov (vorm accepteer, regel dekking) met een ander bedrag (maat 100) dan nu: "het bedrag is
     veranderd". Met { accept: false } staat hij er niet. */
const PS = require('./periode-stand');
const { MAIN, LEEF, BET } = PS;
const RES = 'NL00TEST0521000036';
const DAG = '2026-11-24';
async function boot(page, o) {
  o = o || {};
  await PS.boot(page, o.dag || DAG);
  await page.evaluate(({ MAIN, RES, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v521c' + acc.slice(-4) + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    add(RES, '2026-10-25', 1000, 'Eigen rekening', 'Overboeking naar reserveringen', 'intern');
    add(MAIN, '2026-10-25', -1000, 'Eigen rekening', 'Overboeking naar reserveringen', 'intern');
    add(RES, '2026-11-20', -1000, 'Advocatenkantoor', 'iDEAL Advocatenkantoor declaratie', 'overig');
    for (const x of (o.extra || [])) add(x.acc === 'MAIN' ? MAIN : RES, x.d, x.a, x.n, x.ds || x.n, x.cat || 'intern');
    SET.resAcc = RES;
    SET.manualBal = Object.assign({}, SET.manualBal, { [RES]: o.stand != null ? o.stand : 0 });
    SET.manualBalDatum = Object.assign({}, SET.manualBalDatum, { [RES]: o.dag || '2026-11-24' });
    SET.reserveringen = [
      { id: 'r521c1', naam: 'Laserbehandeling', bedrag: 159, vervalmaand: '2027-04', intervalM: 6 },
      { id: 'r521c2', naam: 'ANWB', bedrag: 123, vervalmaand: '2027-11', intervalM: 12 },
    ];
    SET.salVerdeling = Object.assign({}, SET.salVerdeling, { reserveringen: o.inleg != null ? o.inleg : 36 });
    if (o.accept !== false) {
      const ts = new Date('2026-11-06T10:00:00').getTime();
      SET.coachLog = (SET.coachLog || []).filter((l) => !(l.type === 'afspraak')).concat([{ type: 'afspraak', ts, vorm: 'accepteer', regel: 'dekking', text: 'Ik accepteer dit voorlopig, voor dekking reserveringen' }]);
      SET.maandAccept = Object.assign({}, SET.maandAccept, { dekking: { ts, ym: '2026-11', tot: '2027-04', maat: 100 } });
    }
    TX.sort((a, b) => a.date.localeCompare(b.date));
    try { applyOwnAccounts(); } catch (_) {}
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {} window._gripCyc = null;
    render();
  }, { MAIN, RES, o });
}
module.exports = { boot, DAG, MAIN, LEEF, BET, RES };
