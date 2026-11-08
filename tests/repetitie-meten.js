/* v512c (punt 4-6): DE METING VAN DE GENERALE REPETITIE, een plek, drie lezers: de vaste toets (tests/v512c-repetitie.spec.js tegen
   tests/v512c-repetitie-v511.json), de generator van dat bestand (tests/wip/v512c-repetitie-golden.spec.js, op de app van d46a6f1) en
   de run op je eigen export (tests/wip/v512c-repetitie-export.spec.js). Leest alleen wat op het scherm staat of wat het scherm leest,
   in een vorm die op v511 en op werk/v512 bestaat, zodat dezelfde functie beide versies meet. Per "Bekijk als" (voorbeeldStart, met
   salaris en verdeling aan):
   pb      periodebudget vast / potjes / contant / totaal (periodeBudget(), de bron van de rijen in Hoe sta je ervoor)
   over    het bedrag over op Grip (Kiezen, "Bestemming voor wat over is", [data-watoverregel])
   opzij   de opzij-keuze: het advies in "Zo verdeel je je salaris" (rekVoorstel().opzij) en het doel van de periode (opzijPeriode().doel)
   terug   de Terugblik op de laatst afgesloten eenheid: status (✓ ½ ✗ ·) en de bedragen in de spaardoelregel (gestort, eruit, netto, van)
   hoe     Hoe sta je ervoor: vast, potjes en het totaal (in de periode de rijen uit periodeBudget op Zien, ervoor de tabel) */
const DAGEN = ['2026-11-23', '2026-11-24', '2026-11-26', '2026-12-01'];
const BEKIJK = d => { if (window._voorbeeld) voorbeeldStop(); window._vbVT = null; voorbeeldStart(d); voorbeeldSalarisZet(true); window._gripCyc = null; };
const METEN = () => {
  const r = x => (x == null || !isFinite(+x)) ? null : Math.round(+x);
  const eur = s => (String(s || '').match(/-?€\s?-?[\d.]+(,\d+)?/g) || []).map(t => t.replace(/\s/g, ''));
  const o = {};
  let pb = null; try { pb = periodeBudget(); } catch (_) {}
  const tot = x => (x && typeof x === 'object') ? x.totaal : x;
  o.pb = pb ? { vast: r(tot(pb.vast)), potjes: r(tot(pb.potjes)), contant: r(pb.contant), totaal: r(pb.totaal) } : null;
  go('maand');
  gripKiesTab('kiezen');
  const w = document.querySelector('[data-watoverregel]');
  o.over = w ? eur(w.innerText)[0] || null : null;
  let rv = null; try { rv = rekVoorstel(); } catch (_) {}
  let op = null; try { op = opzijPeriode(); } catch (_) {}
  o.opzij = { advies: rv && rv.ok !== false ? r(rv.opzij) : null, doel: op ? r(op.doel) : null };
  gripKiesTab('terugblik');
  const lijnen = document.getElementById('gripInhoud').innerText.split('\n').map(s => s.trim()).filter(Boolean);
  const i = lijnen.findIndex(s => /Spaardoel /.test(s));
  if (i >= 0) { const l = lijnen[i], vorige = lijnen[i - 1] || '', sym = (l.match(/^[✓½✗·?]/) || vorige.match(/^[✓½✗·?]$/) || [''])[0];
    const det = /gestort|niet gemeten|geen doel/.test(l) ? l : (lijnen[i + 1] || '');
    o.terug = { status: sym, bedragen: eur(det), nietGemeten: /niet gemeten/.test(det), geenDoel: /geen doel/.test(det) }; }
  else o.terug = null;
  gripKiesTab('zien');
  const st = document.getElementById('gripZienStand');
  if (st && st.dataset.zienstand === 'periode') {
    const v = r(st.dataset.zienvast), p = r(st.dataset.zienbudget), c = r(st.dataset.ziencontant);
    o.hoe = { vorm: 'periode', vast: v, potjes: p, contant: c, totaal: (v || 0) + (p || 0) + (c || 0) };
  } else {
    const rij = k => { const e = document.querySelector(`[data-zienrij="${k}"]`); return e ? { budget: r(e.dataset.budget), verwacht: r(e.dataset.verwacht) } : null; };
    o.hoe = { vorm: 'tabel', vast: rij('vast'), potjes: rij('potjes'), totaal: rij('budget') };
  }
  return o;
};
async function meetAlle(page) { const out = {}; for (const d of DAGEN) { await page.evaluate(BEKIJK, d); out[d] = await page.evaluate(METEN); } return out; }
/* Het toegestane verschil (punt 5): alleen de verdeling tussen vast en potjes in Hoe sta je ervoor, en dus ook in het periodebudget;
   de totalen blijven gelijk. Geeft een lijst afwijkingen, leeg is gelijk. */
function vergelijk(oud, nieuw) {
  const af = [];
  const eq = (pad, a, b) => { if (JSON.stringify(a) !== JSON.stringify(b)) af.push(`${pad}: v511 ${JSON.stringify(a)} · nu ${JSON.stringify(b)}`); };
  for (const d of Object.keys(oud)) { const A = oud[d], B = nieuw[d] || {};
    eq(`${d} pb.contant`, A.pb && A.pb.contant, B.pb && B.pb.contant);
    eq(`${d} pb.totaal`, A.pb && A.pb.totaal, B.pb && B.pb.totaal);
    eq(`${d} pb.vast+potjes`, A.pb && (A.pb.vast + A.pb.potjes), B.pb && (B.pb.vast + B.pb.potjes));
    eq(`${d} over`, A.over, B.over);
    eq(`${d} opzij`, A.opzij, B.opzij);
    eq(`${d} terug`, A.terug, B.terug);
    eq(`${d} hoe.vorm`, A.hoe && A.hoe.vorm, B.hoe && B.hoe.vorm);
    /* het totaal wordt hier uit de delen gerekend en niet uit het opgeslagen veld, zodat een deel dat verschuift zonder tegenhanger valt */
    const som = (h, k) => !h ? null : h.vorm === 'periode' ? (h.vast || 0) + (h.potjes || 0) + (h.contant || 0) : ((h.vast || {})[k] || 0) + ((h.potjes || {})[k] || 0);
    if (A.hoe && A.hoe.vorm === 'periode') { eq(`${d} hoe.contant`, A.hoe.contant, B.hoe && B.hoe.contant); eq(`${d} hoe.totaal`, som(A.hoe), som(B.hoe)); }
    else if (A.hoe) { eq(`${d} hoe.totaal`, A.hoe.totaal, B.hoe && B.hoe.totaal); eq(`${d} hoe.totaal budget`, som(A.hoe, 'budget'), som(B.hoe, 'budget')); eq(`${d} hoe.totaal verwacht`, som(A.hoe, 'verwacht'), som(B.hoe, 'verwacht')); }
  }
  return af;
}
module.exports = { DAGEN, BEKIJK, METEN, meetAlle, vergelijk };
