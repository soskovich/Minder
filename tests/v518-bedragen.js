/* v518: de stand en de bedragen per scherm, gedeeld door de generator (tests/wip/v518-voor-gen.spec.js, op 3faf02b) en de spec, zodat
   de twee dezelfde snede lezen (v104). Stand: v432-stand (16 okt 2026, Salarisrekening en Leefgeld), met boodschappen van beide
   rekeningen (zoals v441 d) en drie vaste lasten op de Salarisrekening waarvan naam en datum omgekeerd lopen. GECONSTRUEERD. */
const S = require('./v432-stand');
const { MAIN, LEEF } = S;
async function boot(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page);
  await page.evaluate(({ MAIN, LEEF }) => {
    const add = (acc, d, a, n, ds, cat) => { const t = { id: 'v518' + acc.slice(-4) + d + n + a, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (cat) OVR[t.id] = cat; TX.push(t); };
    for (const m of ['2026-07', '2026-08', '2026-09']) { add(MAIN, m + '-06', -50, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen'); add(LEEF, m + '-08', -50, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen'); }
    /* drie vaste lasten: de naam loopt A-M-Z, de dag 20-10-02, dus alfabetisch is precies omgekeerd op datum */
    for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
      add(MAIN, m + '-20', -31, 'Aalders Verzekering', 'SEPA INCASSO AALDERS VERZEKERING', 'verzekering');
      add(MAIN, m + '-10', -17, 'Meridiaan Abonnement', 'SEPA INCASSO MERIDIAAN ABONNEMENT', 'abonnement');
      add(MAIN, m + '-02', -23, 'Zuidpark Gym', 'SEPA INCASSO ZUIDPARK GYM', 'sport');
    }
    save(); try { buildAccMeta(); } catch (_) {} render();
  }, { MAIN, LEEF });
}
async function bedragen(page) {
  return page.evaluate(() => {
    const re = /-?€\s?[\d.]+(?:,\d{2})?/g, uit = {};
    /* v525: de kaarten van de salarisverdeling (de vorm die v525 verandert) staan buiten de telling */
    const lees = (id) => { const el = document.getElementById(id); if (!el) return []; const c = el.cloneNode(true); for (const x of c.querySelectorAll('#salVoorstelKaart,[data-salvmelding],[data-salvvolgend],[data-salmoment1],[data-meter="lagen"],[data-meter="fundament"],[data-meter="doelen"],[data-meter="beleggen"],[data-nietgebruikt],[data-meternuverwacht],[data-kies="lagen:res"],[data-kies^="fundament:"]')) x.remove(); document.body.appendChild(c); const t = c.innerText || ''; c.remove(); return t.match(re) || []; };
    go('dash'); renderDash(); uit.home = lees('s-dash');
    go('ins'); renderIns();
    /* onderhoud1: de kop van Verschuivingen noemt sinds die ronde ook Vast ("Vast +EUR X", met de oorzaak eronder); op de commits van
       de goldens sloeg hij Vast over. Alleen in dat geval gaat die toevoeging buiten de vergelijking, en ze komt apart terug
       (uit.insVastKop) zodat de spec eist dat het de stap van Vast is en geen ander getal. Elke andere kop blijft gewoon meetellen. */
    uit.insVastKop = null; const kopG = document.querySelector('#s-ins [data-verschkopg]'), oorz = document.querySelector('#s-ins [data-verschoorzaak]');
    const bewaar = []; if (kopG && /· Vast /.test(kopG.innerText)) { const m = kopG.innerText.match(/· Vast [+−-]?€[\d.]+/); uit.insVastKop = m ? m[0] : null;
      bewaar.push([kopG, kopG.innerHTML]); kopG.innerHTML = kopG.innerHTML.replace(/ · Vast <b[^>]*>.*?<\/b>/, ''); if (oorz) { bewaar.push([oorz, oorz.innerHTML]); oorz.innerHTML = ''; } }
    uit.ins = lees('s-ins'); for (const [e, h] of bewaar) e.innerHTML = h;
    go('maand'); for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) { try { gripKiesTab(t); } catch (_) {} uit['grip-' + t] = lees('s-maand'); }
    go('vooruit'); renderVooruit(); uit.plan = lees('s-vooruit');
    /* Vermogen zonder de kaart die v518 weghaalt: op 3faf02b haalt de generator hem uit de DOM voor het lezen */
    go('vermogen'); renderVermogen(); const k = document.querySelector('#s-vermogen #maandKpiBlok'); uit.vermKaart = !!k;
    if (k) k.closest('.card').remove(); uit.vermogen = lees('s-vermogen');
    /* de salarisverdeling met elk Hoe berekend open */
    go('maand'); openSalVerdeling('x'); for (const r of rekVoorstel().rek) window._salv.hoe[r.acc] = true; renderSalVerdeling();
    uit.salv = (document.getElementById('sheet').innerText.match(re) || []);
    uit.gepland = {}; for (const el of document.querySelectorAll('[data-salvhoe]')) uit.gepland[el.dataset.salvhoe] = [...el.querySelectorAll('[data-salvhoevast]')].map(x => x.innerText.split('·')[0].trim());
    closeSheet();
    try { if (uit.insVastKop) { const P = verschuivingParen(), af = P.map((p, i) => i).filter(i => P[i].b < thisYM()), i = af.length ? af[af.length - 1] : P.length - 1, V = verschuiving(P[i].a, P[i].b);
      uit.insVastStap = V.grootste && V.grootste.k === '~vast' ? V.grootste.waarde : null; } } catch (_) {}
    return uit;
  });
}
/* de verdeling per rekening, zoals de rekensom hem geeft: laten staan en per potje het bedrag */
async function verdeling(page) {
  return page.evaluate(() => { const P = rekVoorstel(), o = {}; for (const r of P.rekAlle || P.rek) o[r.acc] = { laten: r.laten, pot: r.potDelen.map(p => [p.k, Math.round(p.bedrag * 100)]) }; return o; });
}
module.exports = { boot, bedragen, verdeling, MAIN, LEEF };
