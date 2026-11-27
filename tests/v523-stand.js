/* v523: DE STAND VAN 25 NOV, GECONSTRUEERD naar de melding (de boekingen van het toestel staan alleen daar). Op tests/periode-stand.js
   (Salarisrekening MAIN, Betaalrekening BET met Hiltermann EUR 537 op de 12e, Leefgeld LEEF, de woning via Tikkie) komen:
   - het salaris van november op 25 nov (niet op 24 nov): de periode loopt van 25 nov tot en met 23 dec;
   - de oude afspraak SET.salVerdeling (Salarisrekening EUR 150, Betaalrekening EUR 1.600, Leefgeld EUR 1.700, opzij EUR 1.766) voor DEZE
     periode (salYM 2026-11), zodat de krap-melding aan staat; de N26-regels van de gebruiker zijn EUR 1.700 / 1.695 / 36;
   - de overboeking naar de Betaalrekening is op 25 nov nog niet gezien; met { overboekGezien: true } staat hij er op 26 nov;
   - inleg Saxo, Kayani en Jelani, elk EUR 100 per maand van de Betaalrekening (gekoppelde boekingen op de 26e, 27e en 28e);
   - een reserveringsrekening RES met EUR 50, en de reserveringen Dela EUR 160 per kwartaal (de incasso van de Betaalrekening op 30 jun en
     30 sep, dus eind december), Laserbehandeling EUR 159 april 2027 (eenmalig) en ANWB EUR 123 november 2027 (jaarlijks);
   - saldi van vandaag: Salarisrekening EUR 6.000, Betaalrekening EUR 237, Leefgeld EUR 120. */
const PS = require('./periode-stand');
const { MAIN, LEEF, BET, SPAAR } = PS;
const RES = 'NL01RESV0000007777';
const DAG = '2026-11-25';
async function boot(page, o) {
  o = o || {};
  await PS.boot(page, o.dag || DAG);
  await page.evaluate(({ MAIN, LEEF, BET, SPAAR, RES, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v523' + acc.slice(-4) + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    // het salaris van november op 25 nov
    for (let i = TX.length - 1; i >= 0; i--) if (TX[i].acc === MAIN && TX[i].amount === 5216 && String(TX[i].date).slice(0, 10) === '2026-11-24') TX.splice(i, 1);
    add(MAIN, o.salDag || '2026-11-25', 5216, 'Werkgever', 'SALARIS LOON');
    if (o.salDec) add(MAIN, o.salDec, 5216, 'Werkgever', 'SALARIS LOON');
    if (o.overboekDag) SET.overboekDag = Object.assign({}, SET.overboekDag, o.overboekDag);
    // inleg drie bezittingen, EUR 100 elk, van de Betaalrekening
    SET.assets = [
      { id: 'saxo', naam: 'Saxo', waarde: 1000, waardeOp: '2026-07-01', grow: true, rend: 5, per: 100 },
      { id: 'kayani', naam: 'Peaks (Kayani)', waarde: 620, waardeOp: '2026-07-01', grow: true, rend: 5, per: 100 },
      { id: 'jelani', naam: 'Peaks (Jelani)', waarde: 620, waardeOp: '2026-07-01', grow: true, rend: 5, per: 100 },
    ];
    SET.bezitKoppel = Object.assign({}, SET.bezitKoppel);
    for (const m of ['2026-08', '2026-09', '2026-10']) {
      SET.bezitKoppel[add(BET, m + '-26', -100, 'Saxo Bank', 'SEPA Overboeking Saxo Bank inleg ' + m, 'sparen').id] = 'saxo';
      SET.bezitKoppel[add(BET, m + '-27', -100, 'Stichting Peaks', 'SEPA Overboeking Stichting Peaks Kayani ' + m, 'sparen').id] = 'kayani';
      SET.bezitKoppel[add(BET, m + '-28', -100, 'Stichting Peaks', 'SEPA Overboeking Stichting Peaks Jelani ' + m, 'sparen').id] = 'jelani';
    }
    // Dela per kwartaal van de Betaalrekening, eind van het kwartaal
    let dela = null; for (const d of ['2026-06-30', '2026-09-30']) dela = add(BET, d, -160, 'DELA Uitvaartverzekering', 'SEPA Incasso DELA Natura polis ' + d, 'verzekering');
    if (!OWN.includes(RES)) OWN.push(RES);
    SET.resAcc = RES;
    SET.acctName = Object.assign({}, SET.acctName, { [RES]: 'Reserveringen' });
    SET.savingsAcc = Object.assign({}, SET.savingsAcc, { [RES]: false });
    SET.reserveringen = [
      { id: 'rdela', naam: 'Dela', bedrag: 160, vervalmaand: '2026-12', intervalM: 3, cat: 'verzekering', bron: recurKey(dela) },
      { id: 'rlaser', naam: 'Laserbehandeling', bedrag: 159, vervalmaand: '2027-04', intervalM: 0 },
      { id: 'ranwb', naam: 'ANWB', bedrag: 123, vervalmaand: '2027-11', intervalM: 12 },
    ];
    if (o.resDag) SET.reserveringen.push({ id: 'rdag', naam: 'Post 20 dec', bedrag: 200, vervalmaand: '2026-12', intervalM: 0, dag: 20 }, { id: 'rdag2', naam: 'Post 30 dec', bedrag: 200, vervalmaand: '2026-12', intervalM: 0, dag: 30 });
    SET.manualBal = Object.assign({}, SET.manualBal, { [MAIN]: 6000, [BET]: 237, [LEEF]: 120, [RES]: 50 });
    SET.manualBalDatum = Object.assign({}, SET.manualBalDatum, { [MAIN]: o.dag || '2026-11-25', [BET]: o.dag || '2026-11-25', [LEEF]: o.dag || '2026-11-25', [RES]: o.dag || '2026-11-25' });
    if (o.overboekGezien) { add(MAIN, '2026-11-26', -1700, 'Eigen overboeking', 'OVERBOEKING NAAR BETAALREKENING', 'intern'); add(BET, '2026-11-26', 1700, 'Eigen overboeking', 'OVERBOEKING VAN SALARISREKENING', 'intern'); }
    SET.salVerdeling = { op: '2026-11-25', ym: '2026-11', salYM: '2026-11', rek: { [MAIN]: 150, [BET]: 1600, [LEEF]: 1700 }, opzij: 1766, reserveringen: 0, resAcc: RES, salaris: 5216, salAcc: MAIN, start: '2026-11-25', eind: '2026-12-23', dagen: 29 };
    TX.sort((a, b) => a.date.localeCompare(b.date));
    delete SET.periodeBudgetVast;
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; window._salTek = null; try { runMemoVergeten(); } catch (_) {} window._gripCyc = null;
    render();
  }, { MAIN, LEEF, BET, SPAAR, RES, o });
}
/* de bedragen per scherm buiten de salarisverdeling, de krap-melding en de reserveringen: Home, Inzichten, de vier tabs van Grip zonder de
   kaarten van de salarisverdeling (#salVoorstelKaart, moment 1 [data-salmoment1], de melding [data-salvmelding]), Plan en Vermogen; weg (v525b) is
   een extra selector die niet meetelt */
async function bedragen(page, weg) {
  return page.evaluate((weg) => {
    const re = /-?€\s?[\d.]+(?:,\d{2})?/g, uit = {};
    const tekst = (el) => { if (!el) return ''; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let s = '', n; while ((n = w.nextNode())) s += n.nodeValue + ' '; return s; };
    const leesT = (id) => { const el = document.getElementById(id); if (!el) return []; const c = el.cloneNode(true); for (const x of c.querySelectorAll('#salVoorstelKaart,[data-salmoment1],[data-salvmelding],[data-salvvolgend],#salTekort' + (weg ? ',' + weg : ''))) x.remove(); return tekst(c).match(re) || []; };
    go('dash'); renderDash(); uit.home = leesT('s-dash');
    go('ins'); renderIns(); uit.ins = leesT('s-ins');
    go('maand'); for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) { try { gripKiesTab(t); } catch (_) {} uit['grip-' + t] = leesT('s-maand'); }
    go('vooruit'); renderVooruit(); uit.plan = leesT('s-vooruit');
    go('vermogen'); renderVermogen(); uit.vermogen = leesT('s-vermogen');
    return uit;
  }, weg || '');
}
module.exports = { boot, bedragen, DAG, MAIN, LEEF, BET, SPAAR, RES };
