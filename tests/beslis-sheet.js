/* v320: DE GESPREKSINGANG VAN EEN BESLISSING STAAT IN DE SHEET ACHTER DE REGEL.
 *
 * Tot v320 droeg de kaart 'Vraagt een beslissing' die ingang per regel, en ZES specs telden hem in
 * de HTML van het scherm (`coStart('maand','<m>','<key>')`). Die telling leest nu de sheets, en ze
 * staat hier op EEN plek: zes eigen lussen zouden bij de eerstvolgende wijziging uiteenlopen (v104).
 *
 * v340: GRIP IS EEN DASHBOARD. De lijstregels (`.row[data-beslis]`) onder 'Vraagt een beslissing' en
 * 'Vraagt aandacht' zijn weg; een regel is nu een TEGEL (`[data-tegel]`, met zijn status als kleur:
 * tekort rood, let op amber) of, bij een structureel signaal, een regel onder 'Let op'
 * (`[data-letop="str"]`). Beide openen dezelfde sheet (`openMaandBeslis(key)`). Deze helper loopt die
 * ingangen af in schermvolgorde en houdt alleen de regels die tot v339 in die twee kaarten stonden:
 * status `tekort` of `let op`, gelezen uit dezelfde zoekfunctie als de sheet (`maandBeslisZoek`).
 */

/* v387: DE TEGELS ZIJN WEG (Grip als regelkring). De regels dekking, buffer en doel hebben hun ingang in de sheet van de
 * Beleggen-meter (`[data-meterwv]`, die openMaandBeslis(key) opent); een structureel signaal staat onder 'Let op'. Deze
 * helper tekent die sheet, leest zijn ingangen en sluit hem weer, en daarna Let op. De kleur van een regel is zijn status
 * (tekort rood, let op amber, ok groen); er is geen tegel meer die hem draagt. */
const KLEUR_VAN = { tekort: 'rood', 'let op': 'amber', ok: 'groen' };
// de sleutels van de regels die een beslissing of aandacht vragen, in schermvolgorde
const BESLIS_KEYS_JS = `(() => {
  const uit = [], els = [];
  try { window._gripMeter = 'beleggen'; renderGripMeter(); els.push(...document.querySelectorAll('#gripMeterSheet [data-meterwv]')); } catch (_) {}
  const sheet = [...els].map((e) => e.getAttribute('onclick') || '');
  try { closeSheet(); } catch (_) {}
  els.length = 0; els.push(...document.querySelectorAll('#s-maand [data-letop="str"]'));
  for (const oc of sheet.concat([...els].map((e) => e.getAttribute('onclick') || ''))) {
    const el = { getAttribute: () => oc };
    const m = /openMaandBeslis\\('([^']*)'\\)/.exec(el.getAttribute('onclick') || '');
    if (!m || uit.includes(m[1])) continue;
    const r = maandBeslisZoek(m[1]);
    if (r && (r.status === 'tekort' || r.status === 'let op')) uit.push(m[1]);
  }
  return uit;
})()`;

const beslisKeys = (page) => page.evaluate(BESLIS_KEYS_JS);

// de sleutels die de knop in de sheet opent, per regel en in schermvolgorde
const beslisIngangen = async (page) => {
  const keys = await beslisKeys(page);
  return page.evaluate((keys) => {
    const uit = [];
    for (const k of keys) {
      openMaandBeslis(k);
      const h = document.querySelector('#sheet').innerHTML;
      for (const m of (h.match(/coStart\('maand','[^']*','[^']*'\)/g) || [])) {
        uit.push(/','([^']*)'\)$/.exec(m)[1]);
      }
      closeSheet();
    }
    return uit;
  }, keys);
};

// de tekst van de sheet achter een regel
const beslisTekst = (page, key) => page.evaluate((k) => {
  openMaandBeslis(k);
  const t = document.querySelector('#sheet').innerText;
  closeSheet();
  return t;
}, key);

// de tekst van alle sheets achter elkaar, voor een assertie over de regels samen
const beslisTekstAlles = async (page) => {
  const keys = await beslisKeys(page);
  return page.evaluate((keys) => {
    const uit = [];
    for (const k of keys) {
      openMaandBeslis(k);
      uit.push(document.querySelector('#sheet').innerText);
      closeSheet();
    }
    return uit.join('\n');
  }, keys);
};

/* Per regel wat hij op het scherm en in de sheet draagt: de status, de kleur van zijn tegel (of null
   bij een Let op-regel), de oorzaak en het bedrag uit de sheet (`[data-sheetbedrag]`), en de tekst
   van de sheet. Tot v340 stonden oorzaak en bedrag op de lijstregel zelf. */
const beslisRegels = async (page) => {
  const keys = await beslisKeys(page);
  return page.evaluate((keys) => keys.map((k) => {
    const r = maandBeslisZoek(k);
    const tegel = ['dekking', 'buffer', 'doel'].includes(k) ? { dataset: { kleur: ({ tekort: 'rood', 'let op': 'amber', ok: 'groen' })[r.status] || 'grijs' } } : null;
    openMaandBeslis(k);
    const sh = document.querySelector('#sheet');
    const b = sh.querySelector('[data-sheetbedrag]');
    const uit = { key: k, status: r.status, kleur: tegel ? tegel.dataset.kleur : null,
      bedrag: b ? b.innerText.split('\n').map((s) => s.trim()).filter(Boolean) : [],
      oorzaak: maandBeslisDeel(r).oorzaak,
      tekst: sh.innerText.replace(/\n/g, ' | ') };
    closeSheet();
    return uit;
  }), keys);
};

module.exports = { KLEUR_VAN, beslisKeys, beslisIngangen, beslisTekst, beslisTekstAlles, beslisRegels };

/* v387: de ingang naar de sheet van een regel, zoals de gebruiker hem neemt: een structureel signaal onder 'Let op', en
   dekking, buffer en doel via de sheet van de Beleggen-meter. */
async function openRegelUI(page, k) {
  const str = page.locator(`#s-maand [data-letop="str"][onclick*="'${k}'"]`);
  if (await str.count()) { await str.first().click(); return; }
  await page.click('#s-maand [data-meter="beleggen"]');
  await page.click(`#gripMeterSheet [data-meterwv="${k}"]`);
}
// Grip op een tab: de tabs zijn een stand van het scherm, en Grip opent altijd op Zien
const gripOp = (page, tab) => page.evaluate((t) => { go('maand'); if (t && t !== 'zien') gripKiesTab(t); }, tab);
module.exports.openRegelUI = openRegelUI;
module.exports.gripOp = gripOp;

/* v387: per regel (dekking, buffer, doel) wat de tegel van v340 droeg, nu uit de sheet van de Beleggen-meter: de kleur
   (de status zoals Grip hem leest), de waarde, de maat, de tekst van de rij en de ingang. */
const regelTegels = (page) => page.evaluate(() => {
  const K = { tekort: 'rood', 'let op': 'amber', ok: 'groen' }, per = {};
  window._gripMeter = 'beleggen'; renderGripMeter();
  const RO = maandMetAfspraak(maandMetAccept(maandRegels()));
  for (const e of document.querySelectorAll('#gripMeterSheet [data-meterwv]')) {
    const k = e.dataset.meterwv, r = RO.find((x) => x.key === k);
    const w = e.querySelector('[data-meterwaarde]'), m = e.querySelector('[data-metermaat]');
    per[k] = { kleur: r ? (K[r.status] || 'grijs') : 'grijs', waarde: w ? w.innerText : '', maat: m ? m.innerText : '',
      tekst: e.innerText.replace(/\s+/g, ' '), onclick: e.getAttribute('onclick'),
      oorzaak: r ? ((maandBeslisDeel(r) || {}).oorzaak || '') : '' };
  }
  closeSheet();
  return per;
});
module.exports.regelTegels = regelTegels;
