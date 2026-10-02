/* v320: DE GESPREKSINGANG VAN EEN BESLISSING STAAT IN DE SHEET ACHTER DE LIJSTREGEL.
 *
 * Tot v320 droeg de kaart 'Vraagt een beslissing' die ingang per regel, en ZES specs telden hem in
 * de HTML van het scherm (`coStart('maand','<m>','<key>')`). Die telling leest nu de sheets, en ze
 * staat hier op EEN plek: zes eigen lussen zouden bij de eerstvolgende wijziging uiteenlopen
 * (v104), en dat is precies wat deze ronde op zes plekken tegelijk moest aanraken.
 *
 * HIJ OPENT ELKE SHEET EN SLUIT HEM WEER, in de volgorde waarin de regels op het scherm staan, dus
 * de uitkomst is naast de lijst tekort-regels te leggen.
 */

// de sleutels die de knop in de sheet opent, per lijstregel en in schermvolgorde
const beslisIngangen = (page) => page.evaluate(() => {
  const uit = [];
  for (const rij of document.querySelectorAll('.row[data-beslis]')) {
    openMaandBeslis(rij.dataset.beslis);
    const h = document.querySelector('#sheet').innerHTML;
    for (const m of (h.match(/coStart\('maand','[^']*','[^']*'\)/g) || [])) {
      uit.push(/','([^']*)'\)$/.exec(m)[1]);
    }
    closeSheet();
  }
  return uit;
});

// de tekst van de sheet achter een lijstregel
const beslisTekst = (page, key) => page.evaluate((k) => {
  openMaandBeslis(k);
  const t = document.querySelector('#sheet').innerText;
  closeSheet();
  return t;
}, key);

// de tekst van alle sheets achter elkaar, voor een assertie over de drie regels samen
const beslisTekstAlles = (page) => page.evaluate(() => {
  const uit = [];
  for (const rij of document.querySelectorAll('.row[data-beslis]')) {
    openMaandBeslis(rij.dataset.beslis);
    uit.push(document.querySelector('#sheet').innerText);
    closeSheet();
  }
  return uit.join('\n');
});

module.exports = { beslisIngangen, beslisTekst, beslisTekstAlles };
