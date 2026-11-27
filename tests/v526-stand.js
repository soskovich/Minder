/* v526: DE STAND VOOR DE TEGELS LAGEN EN FUNDAMENT. Op periode-stand (salaris EUR 5.216 op 24 nov, de periode 24 nov - 23 dec) komen
   de vormen van het toestel van de gebruiker (25-27 nov), GECONSTRUEERD en niet gemeten (de getallen van de back-up staan alleen daar):
   - een reserveringsrekening RESV met EUR 0, twee posten (Laser EUR 159 in april 2027, ANWB EUR 123 in november 2027) en in je
     verdeling EUR 36 per periode voor je reserveringen, die deze periode NIET gestort is;
   - je ondergrens 2 maanden, een noodfonds-toewijzing onder die norm;
   - doelen Inrichting (vol of op besteden, per test) en Kosten Koper;
   - beleggingen: Saxo (voorwaarden gelden), Peaks Kayani (gelden niet, jouw keuze), Peaks Jelani (nog niet gekozen) en Peaks pensioen
     vanaf januari (gelden niet). */
const P = require('./periode-stand');
const RESV = 'NL00RESV0000000526';
async function boot(page, dag, opts) {
  opts = opts || {};
  await P.boot(page, dag || '2026-11-27');
  return page.evaluate(([RESV, SPAAR, opts]) => {
    SET.resAcc = RESV; SET.manualBal = Object.assign({}, SET.manualBal || {}, { [RESV]: opts.resPot != null ? opts.resPot : 0 });
    SET.manualBalDatum = Object.assign({}, SET.manualBalDatum || {}, { [RESV]: vandaagYMD() });
    SET.reserveringen = [
      { id: 'r_laser', naam: 'Laser', bedrag: 159, intervalM: 6, vervalmaand: '2027-04', cat: 'zorg' },
      { id: 'r_anwb', naam: 'ANWB', bedrag: 123, intervalM: 12, vervalmaand: '2027-11', cat: 'vervoer' },
    ];
    SET.salVerdeling = Object.assign({}, SET.salVerdeling || {}, { reserveringen: opts.res != null ? opts.res : 36 });
    if (opts.resGestort) { const t = { id: 'v526res', date: '2026-11-25', amount: opts.resGestort, acc: RESV, name: 'Van salarisrekening', desc: 'Overboeking reserveringen', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'intern'; }
    if (!OWN.includes(RESV)) OWN.push(RESV);
    /* de vorm van het toestel: Inrichting wordt in drie delen teruggezet (EUR 725 deze periode, de laag Doelen), en op 25 nov ging je
       opzij (EUR 1.766) plus dat deel naar je spaarrekening. Met opts.geenStorting staat er niets op je spaarrekening. */
    if (opts.terug !== false) SET.terugzetGat = [{ id: 'tg526', M: '2026-11', keuze: 'drie', delen: [725, 725, 725], bron: [{ type: 'goal', id: 'iw', naam: 'Inrichting woning', af: 2175 }], exact: 2175, bedrag: 2175, op: '2026-11-20' }];
    if (!opts.geenStorting) { const t = { id: 'v526opzij', date: '2026-11-25', amount: (+SET.salVerdeling.opzij || 1766) + (opts.terug !== false ? 725 : 0), acc: SPAAR, name: 'Van salarisrekening', desc: 'Overboeking spaarrekening', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'intern'; }
    SET.bufferNorm = 2;
    SET.goals = [
      { id: 'iw', naam: 'Inrichting woning', doel: 3000, gespaard: opts.iwGespaard != null ? opts.iwGespaard : 3000, streefdatum: '2026-12', allocMode: 'auto', besteden: !!opts.besteden },
      { id: 'kk', naam: 'Kosten Koper', doel: 10000, gespaard: 0, streefdatum: '2027-07', allocMode: 'auto' },
    ];
    SET.assets = [
      { id: 'saxo', naam: 'Saxo', grow: true, per: 100, waarde: 500, waardeOp: '2026-01-01', voorwaarden: true },
      { id: 'kayani', naam: 'Peaks Kayani', grow: true, per: 100, waarde: 500, waardeOp: '2026-01-01', voorwaarden: false },
      { id: 'jelani', naam: 'Peaks Jelani', grow: true, per: 100, waarde: 500, waardeOp: '2026-01-01' },
      { id: 'pensioen', naam: 'Peaks pensioen', grow: true, per: 200, perVanaf: '2027-01', waarde: 1000, waardeOp: '2026-01-01', voorwaarden: false },
    ];
    if (opts.nf != null) SET.nfToegewezen = opts.nf;
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {}
    render();
    return { resAcc: resAccId(), resSaldo: resSaldo() };
  }, [RESV, P.SPAAR, opts]);
}
module.exports = { boot, RESV, P };
