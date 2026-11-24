/* v521a: DE STAND VAN 24 NOV, dag 1 van de periode 24 nov – 23 dec. Op tests/periode-stand.js (Salarisrekening MAIN met het salaris van
   24 nov, Betaalrekening BET met Hiltermann EUR 537 op de 12e, Leefgeld LEEF, de woning via Tikkie) komen, GECONSTRUEERD naar de melding
   (de boekingen van het toestel staan alleen daar):
   - Saxo en Peaks Kayani, elk EUR 100 per maand, met gekoppelde boekingen (v332) vanaf de Betaalrekening: Saxo op 25 aug/sep/okt, Peaks op
     28 aug/sep/okt. De volgende termijnen (25 en 28 nov) vallen in de periode. Met { peaksAcc: 'LEEF' } komt Peaks van Leefgeld (test c).
   - Pensioen EUR 200 per maand zonder gekoppelde boeking, met een startmaand januari 2027 (a.perVanaf).
   - een potje Abonnementen van EUR 9 met een incasso van EUR 9 op de 24e (aug t/m nov), dus op de startdag van de periode al geboekt.
   - twee reserveringen op een bijna lege reserveringsrekening (EUR 37): Verzekering jaar EUR 600 in december (jaarlijks) en een boete
     EUR 299 in februari (eenmalig). */
const PS = require('./periode-stand');
const { MAIN, LEEF, BET } = PS;
const DAG = '2026-11-24';
async function boot(page, o) {
  o = o || {};
  await PS.boot(page, o.dag || DAG);
  await page.evaluate(({ MAIN, LEEF, BET, o }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v521a' + acc.slice(-4) + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    if (o.abonnement !== false) {
      for (const m of ['2026-08', '2026-09', '2026-10', '2026-11']) add(BET, m + '-24', -9, 'Spotify', 'SEPA Incasso Spotify ' + m, 'abonnement');
      SET.budgets = Object.assign({}, SET.budgets, { abonnement: 9 });
    }
    if (o.beleg !== false) {
      const peaksAcc = o.peaksAcc === 'LEEF' ? LEEF : BET;
      SET.assets = [
        { id: 'saxo', naam: 'Saxo', waarde: 1000, waardeOp: '2026-07-01', grow: true, rend: 5, per: 100 },
        { id: 'peaks', naam: 'Peaks Kayani', waarde: 620, waardeOp: '2026-07-01', grow: true, rend: 5, per: 100 },
        { id: 'pens', naam: 'Pensioen', waarde: 0, waardeOp: '2026-07-01', grow: true, rend: 5, per: 200, perVanaf: '2027-01' },
      ];
      SET.bezitKoppel = Object.assign({}, SET.bezitKoppel);
      for (const m of ['2026-08', '2026-09', '2026-10']) {
        SET.bezitKoppel[add(BET, m + '-25', -100, 'Saxo Bank', 'SEPA Overboeking Saxo Bank inleg ' + m, 'sparen').id] = 'saxo';
        SET.bezitKoppel[add(peaksAcc, m + '-28', -100, 'Stichting Peaks', 'SEPA Overboeking Stichting Peaks Kayani ' + m, 'sparen').id] = 'peaks';
      }
    }
    if (o.res !== false) {
      SET.reserveringen = [
        { id: 'r521a1', naam: 'Verzekering jaar', bedrag: 600, vervalmaand: '2026-12', intervalM: 12 },
        { id: 'r521a2', naam: 'Boete', bedrag: 299, vervalmaand: '2027-02', intervalM: 0 },
      ];
    }
    TX.sort((a, b) => a.date.localeCompare(b.date));
    delete SET.periodeBudgetVast;
    save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {} window._gripCyc = null;
    render();
  }, { MAIN, LEEF, BET, o });
}
/* de bedragen per scherm (Home, Inzichten, de vier tabs van Grip, Plan, Vermogen) en de salarisverdeling met elk Hoe berekend open; de
   kaart "Je salarisverdeling" en de periodekop (vast/potjes) staan apart, want daar verandert v521a iets */
async function bedragen(page) {
  return page.evaluate(() => {
    const re = /-?€\s?[\d.]+(?:,\d{2})?/g, uit = {};
    const lees = (id) => { const el = document.getElementById(id); if (!el) return []; const c = el.cloneNode(true); for (const x of c.querySelectorAll('#salVoorstelKaart')) x.remove(); return (c.innerText || c.textContent || '').match(re) || []; };
    const tekst = (el) => { if (!el) return ''; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let s = '', n; while ((n = w.nextNode())) s += n.nodeValue + ' '; return s; };
    const leesT = (id) => { const el = document.getElementById(id); if (!el) return []; const c = el.cloneNode(true); for (const x of c.querySelectorAll('#salVoorstelKaart')) x.remove(); return tekst(c).match(re) || []; };
    go('dash'); renderDash(); uit.home = leesT('s-dash');
    go('ins'); renderIns(); uit.ins = leesT('s-ins'); const im = document.getElementById('insMaand'); uit.insSplit = im ? { vast: im.dataset.insvast, pot: im.dataset.insbudget } : null;
    go('maand'); for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) { try { gripKiesTab(t); } catch (_) {} uit['grip-' + t] = leesT('s-maand');
      if (t === 'zien') { const g = document.getElementById('gripZienStand'); uit.gripSplit = g ? { vast: g.dataset.zienvast, pot: g.dataset.zienbudget } : null; const k = document.getElementById('salVoorstelKaart'); uit.salKaart = k ? tekst(k).match(re) || [] : null; } }
    go('vooruit'); renderVooruit(); uit.plan = leesT('s-vooruit');
    go('vermogen'); renderVermogen(); uit.vermogen = leesT('s-vermogen');
    go('maand'); openSalVerdeling('x'); for (const r of rekVoorstel().rek) window._salv.hoe[r.acc] = true; renderSalVerdeling();
    uit.salv = tekst(document.getElementById('sheet')).match(re) || [];
    closeSheet();
    const P = rekVoorstel(); uit.P = { opzij: Math.round(P.opzij), som: Math.round(P.som), res: Math.round(P.reserveringen), rek: P.rek.map(r => ({ acc: r.acc, laten: Math.round(r.laten) })) };
    return uit;
  });
}
module.exports = { boot, bedragen, DAG, MAIN, LEEF, BET };
