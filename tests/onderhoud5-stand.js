/* onderhoud5: de stand van 27 nov van de gebruiker, NAGEBOUWD op periode-stand naar de gemeten SET van zijn back-up (de boekingen
   staan alleen op het toestel; GECONSTRUEERD). Twee spaarrekeningen: Instant Savings (SPAAR) en Buffer Rust (BUF). Opnames van de
   spaarrekening met bron "noodfonds": EUR 500, 1.620 en 1.554,80 naar de salarisrekening, en op 16 nov EUR 3.174,80 van Instant
   Savings naar Buffer Rust (een overboeking TUSSEN de twee spaarrekeningen, die toch in het bron-sheet stond). Aanvullingen ("niet
   terugzetten") van EUR 93, 20 en 250, alle drie met af 0 (het noodfonds was op het moment van kiezen al leeg, punt 2). Een
   verschuiving van EUR 36 naar de reserveringsrekening met keuze "nee" (punt 3). Noodfonds toegewezen 3.326, Inrichting 3.000 van
   3.000, spaarsaldo 5.927,12. Verwacht na onderhoud5: Beschermen 2.927, Inrichting 3.000, nog terug 0.
   o.oud: de stand zoals hij op het toestel opgeslagen staat (af 0, geen nfAfgetrokken); zonder: dezelfde keuzes, maar de migratie is
   al gedraaid. o.verschKeuze overschrijft de keuze van de verschuiving. */
const P = require('./periode-stand');
const { MAIN, SPAAR, LEEF, BET } = P;
const RESV = 'NL00RESV0000000077';
const BUF = 'NL00BUFR0000000088';
async function boot(page, o) {
  o = o || {};
  await P.boot(page, o.dag || '2026-11-27');
  await page.evaluate(({ MAIN, SPAAR, LEEF, BET, RESV, BUF, o }) => {
    const add = (acc, d, a, n, ds) => { const t = { id: 'o5' + acc.slice(-4) + d + Math.round(Math.abs(a) * 100) + (a < 0 ? 'u' : 'i'), date: d, amount: a, acc, name: n, desc: ds || n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    const over = (van, naar, d, b, n1, n2) => [add(van, d, -b, n2, 'From ' + n1 + ' to ' + n2), add(naar, d, b, n1, 'From ' + n1 + ' to ' + n2)];
    if (!OWN.includes(RESV)) OWN.push(RESV);
    if (!OWN.includes(BUF)) OWN.push(BUF);
    SET.resAcc = RESV;
    SET.acctName = Object.assign({}, SET.acctName, { [RESV]: 'Reserveringen', [SPAAR]: 'Instant Savings', [BUF]: 'Buffer Rust' });
    SET.savingsAcc = Object.assign({}, SET.savingsAcc, { [RESV]: false, [SPAAR]: true, [BUF]: true });
    const nf1 = over(SPAAR, MAIN, '2026-10-28', 500, 'Instant Savings', 'Salarisrekening')[0];
    const nf2 = over(SPAAR, MAIN, '2026-11-05', 1620, 'Instant Savings', 'Salarisrekening')[0];
    const nf3 = over(SPAAR, MAIN, '2026-11-10', 1554.80, 'Instant Savings', 'Salarisrekening')[0];
    const tus = over(SPAAR, BUF, '2026-11-16', 3174.80, 'Instant Savings', 'Buffer Rust')[0];
    over(MAIN, SPAAR, '2026-11-24', 2500, 'Salarisrekening', 'Instant Savings');
    const a1 = over(SPAAR, MAIN, '2026-11-26', 93, 'Instant Savings', 'Salarisrekening')[0];
    const a2 = over(SPAAR, MAIN, '2026-11-26', 20, 'Instant Savings', 'Salarisrekening')[0];
    const a3 = over(SPAAR, MAIN, '2026-11-26', 250, 'Instant Savings', 'Salarisrekening')[0];
    const vs = over(SPAAR, RESV, '2026-11-26', 36, 'Instant Savings', 'Reserveringen')[0];
    window.__o5 = { nf1: nf1.id, nf2: nf2.id, nf3: nf3.id, tus: tus.id, a1: a1.id, a2: a2.id, a3: a3.id, vs: vs.id };
    SET.manualBal = Object.assign({}, SET.manualBal, { [SPAAR]: 2752.32, [BUF]: 3174.80, [RESV]: 1036 });
    SET.manualBalDatum = Object.assign({}, SET.manualBalDatum, { [SPAAR]: '2026-11-27', [BUF]: '2026-11-27', [RESV]: '2026-11-27' });
    SET.verschuiving = { [vs.id]: { kant: 'reserveren', keuze: o.verschKeuze || 'nee' } };
    SET.opnameBron = { [nf1.id]: { bron: 'noodfonds' }, [nf2.id]: { bron: 'noodfonds' }, [nf3.id]: { bron: 'noodfonds' }, [tus.id]: { bron: 'noodfonds' },
      [a1.id]: { bron: 'aanvulling', af: 0 }, [a2.id]: { bron: 'aanvulling', af: 0 }, [a3.id]: { bron: 'aanvulling', af: 0 } };
    SET.nfToegewezen = 3326; SET.nfDoelVast = 6000;
    SET.goals = [{ id: 'iw', naam: 'Inrichting', doel: 3000, gespaard: 3000, streefdatum: '2027-06', allocMode: 'auto' }];
    delete SET.terugzet; delete SET.terugzetGat; delete SET.nfAfgetrokken;
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {}
    if (!o.oud && typeof nfAanvulSync === 'function') nfAanvulSync();
    render();
  }, { MAIN, SPAAR, LEEF, BET, RESV, BUF, o });
}
/* de standen die het rapport noemt, uit de bronnen van de schermen */
const stand = (page) => page.evaluate(() => { const L = lagenData(); const PT = planTerug(); const iw = (L.SE && L.SE.per.iw) || {};
  return { beschermen: L.beschermen, doelen: L.doelen, saldo: L.saldo, kop: L.kop, nf: +SET.nfToegewezen, nogTerug: Math.round(PT.totaal * 100) / 100, iwGeld: iw.geld }; });
module.exports = { boot, stand, MAIN, SPAAR, LEEF, BET, RESV, BUF };
