/* v501: ONDERHOUDSRONDE, de foutenlijst van 26 nov en het restje van v500. Op v500-stand (gedekt: v499-stand, de afspraak over
   24 okt t/m 23 nov, een bonus van 2.190 in oktober en een storting van 6.000) met per punt een optie:
   - eenmalig: het novembersalaris van 24 nov is 5.216 + 2.190 (een eenmalig deel, SET.salSplit met vast 5.216) en op 25 nov ging er
     5.300 naar de spaarrekening, dus meer dan de afspraak (3.000) + het eenmalige deel: "lijkt al verdeeld" (punt 3).
   - vast: Sportschool Oost (SEPA, €40, mei t/m jul, daarna niets; op het toestel heet hij Health Club, maar de stand van standkaart-sluit
     draagt al een Health Club Purmerend) en SportCity (SEPA, €80, aug t/m nov): gestopt en nieuw (punt 4).
   - res: een reservering met een termijn in de komende periode, zodat rekVoorstel().reserveringen boven nul staat en het voorstel
     daardoor van de afspraak afwijkt (de €14 van 26 nov) (punt 1).
   - saxo: een bezitting Saxo Belegging die groeit, met een gekoppelde inleg van €100 op 20 nov; voorwaarden via o.saxo
     (true / false / null = geen keuze) (punt 6).
   - debt: een schuld met 10,5% rente, zodat "Stilstaand geld naast rente" KAN vuren (punt 5). De spaarrekening staat op 4.000 en het
     noodfonds heeft 4.000 toegewezen, dus netto staat er niets stil; o.spaarSaldo zet het saldo anders.
   GECONSTRUEERD, niet gemeten. */
const V500 = require('./v500-stand');
const { MAIN, SPAAR, LEEF, CATH } = V500;
async function boot(page, o) {
  o = o || {};
  const o5 = Object.assign({}, o); if (o.eenmalig) o5.novSalaris = true;
  await V500.boot(page, o5);
  await page.evaluate(({ MAIN, SPAAR, LEEF, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v501' + acc.slice(-4) + d + n + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    if (o.eenmalig) {
      const sal = TX.find(t => String(t.date).slice(0, 10) === '2026-11-24' && t.amount === 5216 && t.acc === MAIN);
      if (sal) { sal.amount = 5216 + 2190; categorize(sal); }
      SET.salSplit = { vast: 5216, key: recurKey(sal), naam: 'Werkgever', reisAan: false, reisMax: 0, reisPot: 'vervoer' };
      add(MAIN, '2026-11-25', -5300, 'Eigen overboeking', 'OVERBOEKING NAAR SPAREN', 'intern'); add(SPAAR, '2026-11-25', 5300, 'Eigen overboeking', 'OVERBOEKING VAN SALARISREKENING', 'intern');
    }
    if (o.vast) {
      for (const m of ['2026-05', '2026-06', '2026-07']) add(MAIN, m + '-10', -40, 'Sportschool Oost', 'SEPA Incasso Sportschool Oost lidmaatschap ' + m, 'sport');
      for (const m of ['2026-08', '2026-09', '2026-10', '2026-11']) add(MAIN, m + '-10', -80, 'SportCity', 'SEPA Incasso SportCity abonnement ' + m, 'sport');
    }
    if (o.saxo !== undefined) {
      const a = { id: 'saxo', naam: 'Saxo Belegging', waarde: 1000, waardeOp: '2026-11-01', grow: true }; if (o.saxo === true || o.saxo === false) a.voorwaarden = o.saxo;
      SET.assets = (SET.assets || []).filter(x => x.id !== 'saxo').concat([a]);
      const t = add(MAIN, '2026-11-20', -100, 'Saxo Bank', 'OVERBOEKING SAXO BANK BELEGGINGSREKENING', 'sparen');
      SET.bezitKoppel = Object.assign({}, SET.bezitKoppel, { [t.id]: 'saxo' });
    }
    if (o.res) SET.reserveringen = (SET.reserveringen || []).concat([{ id: 'r501', naam: 'Autoverzekering', bedrag: 420, vervalmaand: '2026-12', intervalM: 12 }]);
    if (o.debt) SET.debts = [{ id: 'lease', naam: 'Auto Lease', type: 'financiallease', start: 20000, rest: 12000, restOp: '2026-11-01', perMaand: 537, rente: 10.5 }];
    if (o.spaarSaldo != null) SET.manualBal = Object.assign({}, SET.manualBal, { [SPAAR]: o.spaarSaldo });
    Object.assign(SET, o.set4 || {});
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; window._salTek = null; window._m2open = false; try { runMemoVergeten(); } catch (_) {}
    render();
  }, { MAIN, SPAAR, LEEF, o });
}
module.exports = { boot, MAIN, SPAAR, LEEF, CATH };
