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

// de sleutels van de regels die een beslissing of aandacht vragen, in schermvolgorde
const BESLIS_KEYS_JS = `(() => {
  const uit = [];
  for (const el of document.querySelectorAll('#s-maand [data-tegel], #s-maand [data-letop="str"]')) {
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
    const tegel = document.querySelector(`#s-maand [data-tegel="${k}"]`);
    const r = maandBeslisZoek(k);
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

module.exports = { beslisKeys, beslisIngangen, beslisTekst, beslisTekstAlles, beslisRegels };
