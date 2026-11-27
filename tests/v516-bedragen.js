/* v516: de bedragen op Inzichten, Grip (vier tabs) en Plan, als lijst per scherm. Gedeeld door de generator (tests/wip) en de spec,
   zodat de twee dezelfde snede lezen (v104). */
async function bedragen(page) {
  return page.evaluate(() => {
    const re = /-?€\s?[\d.]+(?:,\d{2})?/g, uit = {};
    /* v525: de kaarten van de salarisverdeling (de vorm die v525 verandert) staan buiten de telling */
    const lees = (id) => { const el = document.getElementById(id); if (!el) return []; const c = el.cloneNode(true); for (const x of c.querySelectorAll('#salVoorstelKaart,[data-salvmelding],[data-salvvolgend]')) x.remove(); document.body.appendChild(c); const t = c.innerText || ''; c.remove(); return t.match(re) || []; };
    go('ins'); renderIns(); uit.ins = lees('s-ins');
    go('maand'); for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) { try { gripKiesTab(t); } catch (_) {} uit['grip-' + t] = lees('s-maand'); }
    go('vooruit'); renderVooruit(); uit.plan = lees('s-vooruit');
    return uit;
  });
}
module.exports = { bedragen };
