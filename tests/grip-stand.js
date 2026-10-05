/* v340: de stand van de gebruiker op 4 oktober 2026, gedeeld door de Grip-specs. */
const SEP = '2026-09';
const LOG = {
  '2026-09|boodschappen': { id: '2026-09|boodschappen', maand: SEP, potjeId: 'boodschappen', categorie: 'Boodschappen', potje_bij_detectie: 500, over_bij_detectie: 40, getoond: true, actie: 'geen', over_eind_maand: 84, over_oorspronkelijk: 84, antwoord: { keuze: 'uitzondering', op: '2026-10-02' } },
  '2026-09|uiteten': { id: '2026-09|uiteten', maand: SEP, potjeId: 'uiteten', categorie: 'Uit eten & café', potje_bij_detectie: 150, over_bij_detectie: 40, getoond: true, actie: 'grens_gezet', over_eind_maand: 194, over_oorspronkelijk: 194, antwoord: { keuze: 'uitzondering', op: '2026-10-02' } },
  '2026-09|sport': { id: '2026-09|sport', maand: SEP, potjeId: 'sport', categorie: 'Sport & gezondheid', potje_bij_detectie: 50, over_bij_detectie: 30, getoond: true, actie: 'geen', over_eind_maand: 40, over_oorspronkelijk: 40, antwoord: { keuze: 'uitzondering', op: '2026-10-02' } },
};
module.exports = { LOG, SEP };
