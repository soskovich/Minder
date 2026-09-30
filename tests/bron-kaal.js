/* v309: DE BRON VAN EEN FUNCTIE ZONDER HAAR COMMENTAAR, OP EEN PLEK.
 *
 * HET GEVAL, en het is gemeten en niet bedacht: een bronzoekende test die `fn.toString()` leest,
 * leest de LIVE functie MET haar comments. `een-definitie-variabel.spec.js` eiste
 * `safeToSpend.toString()).toContain('varPlanRemaining(')`, en die aanroep staat daar sinds `v254`
 * NIET meer in de code maar nog wel twee keer in de uitleg. GEMETEN: nul treffers in de code, twee
 * in de comments. Diezelfde test eiste hetzelfde van `nogDezeMaandPosten`, en daar werd het bij
 * `v309` waar op precies dezelfde manier. Twee asserties die groen stonden op een comment.
 *
 * DAT IS MEETLES `v276` OP EEN ANDER OPPERVLAK. Daar viel een bronzoekende TELLER op een comment en
 * was de reparatie de tekst herschrijven; hier gaat het om een assertie die een AANROEP eist, en dan
 * is een vermelding in de uitleg juist geen bewijs. `sectieVan()` snijdt de bron van een functie uit
 * het BESTAND af; deze helper haalt het commentaar uit een functietekst, en de twee zijn los te
 * gebruiken.
 *
 * DE STRIP IS VOORZICHTIG, en dat is de meetles uit CLAUDE.md: een strip die elke `//` weghaalt
 * breekt op `https://` en op een `//` binnen een string, en dan lijkt een schrijver onzichtbaar
 * terwijl hij er staat. Deze vorm komt uit `dagbedrag-potjes.spec.js`, waar hij op de hele bron van
 * `index.html` draait: hij vervangt een blok-comment door spaties (zodat regelnummers kloppen),
 * slaat een `//` over die binnen een oneven aantal quotes staat, en slaat een `//` na `http` over.
 *
 * EEN IMPLEMENTATIE, DRIE INGANGEN. Er waren er DRIE verschillende in deze suite, en geen van de
 * drie was volledig: 21 bestanden streepten alleen blok-comments weg en 7 alleen regel-comments,
 * dus in beide groepen kon een aanroep zich in de andere soort verstoppen. Nu:
 *  - `kaalBron(tekst)` in Node, op een string of een functie;
 *  - `kaalUit(page, ...namen)` haalt de bron van genoemde app-functies uit de pagina en strept hier;
 *  - `KAAL_JS` is de LETTERLIJKE bron van `kaalBron`, om in een `page.evaluate()` te injecteren.
 * Die derde is nodig en geen luxe: een test die over ALLE `window`-functies veegt kan geen namen
 * meegeven, en dan moet het strippen in de pagina gebeuren. Het is dezelfde implementatie die
 * daarheen reist, dus er is geen tweede waarheid (v104).
 */
function kaalBron(t) {
  t = typeof t === 'function' ? t.toString() : String(t == null ? '' : t);
  t = t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return t.split('\n').map((ln) => {
    const m = /(^|[\s;})])\/\/(?!\/)/.exec(ln);
    if (!m) return ln;
    const voor = ln.slice(0, m.index + m[1].length);
    if (/http/.test(ln.slice(Math.max(0, m.index - 8), m.index))) return ln;
    const even = (x, c) => (x.split(c).length - 1) % 2 === 0;
    if (!even(voor, "'") || !even(voor, '"') || !even(voor, '`')) return ln;
    return voor;
  }).join('\n');
}

/* De bron van een app-functie UIT DE PAGINA, zonder commentaar. `String(window[naam])` in plaats
   van `window[naam].toString()`, zodat een naam die niet bestaat een leesbare fout geeft in plaats
   van een crash in de pagina; hij FAALT LUID bij een onbekende naam, want een lege string laat elke
   `not.toContain` per constructie slagen en dat is een test die niet kan vallen (zelfde reden als
   bij `sectieVan()`).
   MEER DAN EEN NAAM MAG, en dan komen de bronnen achter elkaar: dat is de vorm die specs gebruiken
   die een eigenschap over twee renderers tegelijk vasthouden. */
async function kaalUit(page, ...namen) {
  const uit = [];
  for (const n of namen) {
    const src = await page.evaluate((x) => (typeof window[x] === 'undefined' ? null : String(window[x])), n);
    if (src == null) throw new Error('kaalUit: bestaat niet in de pagina: ' + n);
    uit.push(kaalBron(src));
  }
  return uit.join('\n');
}

/* De letterlijke bron van `kaalBron`, om in een pagina te injecteren:
   `await page.evaluate((kj) => { const kaal = eval(kj); ... }, KAAL_JS)`. */
const KAAL_JS = '(' + kaalBron.toString() + ')';

module.exports = { kaalBron, kaalUit, KAAL_JS };
