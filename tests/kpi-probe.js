/* v518: de kaart Spaarquote staat niet meer op Vermogen, maar de tegel (maandKpiBlok) en zijn sheet bestaan nog. De specs die de
   tegel bewaken (sparkline, band, oordeel, kleur, rustige modus, breedte) lezen hem sinds v518 via deze PROBE: na elke renderVermogen()
   staat in #s-vermogen dezelfde kaart op dezelfde plek als op 3faf02b (voor de kaart Vermogensreis), met data-kpiprobe erop. Het is geen scherm meer maar een testplek; dat
   de kaart op het scherm NIET staat, toetst v518.spec.js a. */
async function kpiProbe(page) {
  await page.addInitScript(() => {
    window.addEventListener('DOMContentLoaded', () => {
      if (typeof renderVermogen !== 'function' || window.__kpiProbe) return; window.__kpiProbe = true;
      const oud = renderVermogen;
      window.renderVermogen = function () { const r = oud.apply(this, arguments);
        try { const s = document.getElementById('s-vermogen'), mA = vermogenSpaarquoteMaand(); if (s && mA) { const sq = maandKpiBlok(mA, { maandInLabel: true }); if (sq) { const h = `<div class="card" data-kpiprobe>${sq}</div>`, reis = s.querySelector('.card[onclick="go(\'fire\')"]'); if (reis) reis.insertAdjacentHTML('beforebegin', h); else s.insertAdjacentHTML('beforeend', h); } } } catch (_) {}
        return r; };
    });
  });
}
module.exports = { kpiProbe };
