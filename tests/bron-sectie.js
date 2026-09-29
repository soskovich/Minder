/* v295: DE BRON VAN PRECIES EEN FUNCTIE, OP EEN PLEK.
 *
 * DRIE BRONZOEKENDE TESTS SNEDEN TOT `const DIAG_BLOKKEN=[`, en dat is niet het einde van hun blok maar
 * het einde van het REGISTER. Elk blok dat er later tussen wordt gezet viel daardoor binnen hun slice, en
 * dan toetst een assertie die "in de bron van dit blok" zegt de bron van vier blokken. Dat is meetles (t)
 * uit CLAUDE.md, nu op een slice in plaats van op een indentatie: bij `v291` telde een assertie over blok
 * 12 er per ongeluk sectie 2b bij, en de reparatie was toen dezelfde, namelijk eerst afbakenen en dan
 * tellen. Bij `v295` kwam blok 13 erbij en viel de v266-assertie van blok 12 er ook overheen.
 *
 * DE AFBAKENING IS DE EERSTVOLGENDE DEFINITIE OP KOLOM NUL en niet de naam van de buur: op de naam binden
 * zou dezelfde koppeling terugbrengen die deze helper juist weghaalt. Binnen een functie in dit bestand
 * staat niets op kolom nul, dus de eerstvolgende `function `, `const ` of `/* ` op kolom nul is het einde.
 *
 * `sectieVan()` FAALT LUID bij een naam die er niet staat, want een lege string laat elke `not.toContain`
 * per constructie slagen en dat is een test die niet kan vallen.
 */
function sectieVan(src, start) {
  const i = src.indexOf(start);
  if (i < 0) throw new Error('sectieVan: niet gevonden in de bron: ' + start);
  const rest = src.slice(i + 1);
  const m = rest.search(/\n(?:function |const |\/\* )/);
  const sec = rest.slice(0, m < 0 ? undefined : m);
  /* De eigenschap die deze helper belooft: er staat precies EEN functie in. Groeit het bestand met een
     buur, dan blijft dit waar; verandert de opmaak zo dat de slice doorloopt, dan valt dit. */
  if (/\nfunction /.test(sec)) throw new Error('sectieVan: de slice draagt meer dan een functie: ' + start);
  return start.charAt(0) + sec;
}

module.exports = { sectieVan };
