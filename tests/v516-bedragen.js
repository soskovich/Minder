/* v516: de bedragen op Inzichten, Grip (vier tabs) en Plan, als lijst per scherm. Gedeeld door de generator (tests/wip) en de spec,
   zodat de twee dezelfde snede lezen (v104). */
async function bedragen(page) {
  return page.evaluate(() => {
    const re = /-?€\s?[\d.]+(?:,\d{2})?/g, uit = {};
    const lees = (id) => ((document.getElementById(id) || {}).innerText || '').match(re) || [];
    go('ins'); renderIns(); uit.ins = lees('s-ins');
    go('maand'); for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) { try { gripKiesTab(t); } catch (_) {} uit['grip-' + t] = lees('s-maand'); }
    go('vooruit'); renderVooruit(); uit.plan = lees('s-vooruit');
    return uit;
  });
}
module.exports = { bedragen };
