/* v504: de generale repetitie van 24 nov. Op v489-stand (Salarisrekening MAIN met het salaris van €5.216 op de 24e, Leefgeld LEEF, de
   woning Nathaniel Cathalina €300 via Tikkie met "Na mijn salaris") komt een aparte Betaalrekening BET met een SEPA-incasso van €537 op
   de 12e, en de verdeling van het toestel: Salarisrekening €150, Betaalrekening €1.600, Leefgeld €1.700, opzij €1.766. Alle saldi zijn
   van de laatste import, 31 okt (Betaalrekening €799). Echte dag: 31 okt; de voorbeeldweergave staat op 26 nov. GECONSTRUEERD, niet
   gemeten: de bedragen zijn die uit de melding, de boekingen van het toestel staan alleen daar. */
const S = require('./v489-stand');
const { MAIN, SPAAR, LEEF, CATH } = S;
const BET = 'NL01BETA0000005555';
async function boot(page, o) {
  o = o || {};
  await S.boot(page, Object.assign({ dag: o.dag || '2026-10-31', novSalaris: false, oktNa: o.oktNa !== false }, o.v489 || {}));
  await page.evaluate(({ MAIN, SPAAR, LEEF, BET, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v504' + acc.slice(-4) + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) add(BET, m + '-12', -537, 'Hiltermann Lease', 'SEPA Incasso Hiltermann Lease termijn ' + m, 'vervoer');
    if (!OWN.includes(BET)) OWN.push(BET);
    SET.acctName = Object.assign({}, SET.acctName, { [MAIN]: 'Salarisrekening', [BET]: 'Betaalrekening', [LEEF]: 'Leefgeld' });
    SET.savingsAcc = Object.assign({}, SET.savingsAcc, { [BET]: false, [SPAAR]: true });
    SET.manualBal = Object.assign({}, SET.manualBal, { [MAIN]: 400, [BET]: 799, [LEEF]: 250, [SPAAR]: 5000 });
    SET.manualBalDatum = Object.assign({}, SET.manualBalDatum, { [MAIN]: '2026-10-31', [BET]: '2026-10-31', [LEEF]: '2026-10-31', [SPAAR]: '2026-10-31' });
    SET.salVerdeling = Object.assign({}, SET.salVerdeling, { rek: { [MAIN]: 150, [BET]: 1600, [LEEF]: 1700 }, opzij: 1766, reserveringen: 0, salaris: 5216, salAcc: MAIN });
    Object.assign(SET, o.set || {});
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {}
    render();
  }, { MAIN, SPAAR, LEEF, BET, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, BET, CATH };
