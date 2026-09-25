// v258: een geenNorm-categorie wordt nergens bij naam aangewezen.
//
// AANLEIDING, gemeten. De app had één geenNorm-categorie (onvoorzien, v234) en de meeste code
// leest daarvoor netjes de vlag: geenNorm(k) of c.geenNorm, op zestien plekken. Twee plekken
// noemden de categorie bij naam, en allebei gingen ze stuk zodra er een tweede bij kwam:
//   1) insBudgetBlok() telde ALLE geenNorm-categorieën op tot t.buitenNorm en tikte naar
//      openCategory('onvoorzien'). Gemeten met een tweede categorie erbij: "+ €897 onvoorzien,
//      buiten je potjes", en de tik kwam uit op een categorie met €497 erin.
//   2) openCategory() droeg één vaste uitlegzin achter c.geenNorm: "Kosten die je niet kon
//      voorzien." Gemeten op Contant: diezelfde zin, bij geld dat je juist wél zag aankomen.
//
// WAAROM DIT EEN BRONZOEKENDE TEST IS EN GEEN DOM-TEST. Een DOM-test toetst de twee plekken die
// we nu kennen. De teller van twee is een momentopname: zodra iemand 'onvoorzien' typt waar
// geenNorm(k) had gemoeten komt er stil een derde bij, en geen enkele bestaande test valt daarop.
// Dezelfde vorm als de bronzoekende tests in grendel-schrijvers.spec.js: niet "is het scherm nu
// goed", maar "kan deze fout terugkomen".
//
// DE ENE UITZONDERING, met dezelfde redenering als planForget() daar: contantOpslaan() schrijft de
// boeking die ín die categorie landt. Dat is geen beslissing óver geenNorm-categorieën, dat is de
// bron van de post zelf, en een categorie-loze versie ervan bestaat niet.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BRON = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
/* Comments eruit, maar niet de // in een URL of in een string; blokcomments worden vervangen door
   spaties zodat de regelnummers blijven kloppen. Overgenomen uit grendel-schrijvers.spec.js,
   dezelfde valkuil (een te agressieve strip maakt treffers onzichtbaar). */
function strip(t) {
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
const CODE = strip(BRON);
const HEADERS = [...CODE.matchAll(/\nfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => ({ i: m.index, naam: m[1] }));
function functieRond(index) {
  let h = null;
  for (const x of HEADERS) { if (x.i <= index) h = x; else break; }
  return h ? h.naam : null;
}

/* De sleutels worden UIT DE BRON gelezen en niet hier opgesomd: een derde geenNorm-categorie valt
   dan vanzelf onder deze test, zonder dat iemand eraan hoeft te denken. Dat is dezelfde eis als
   hierboven, één laag hoger. */
function geenNormSleutels() {
  const uit = [];
  const re = /\n\s{2}([a-z_$][\w$]*)\s*:\s*\{[^\n]*geenNorm\s*:\s*true/g;
  let m;
  while ((m = re.exec(CODE)) !== null) uit.push(m[1]);
  return uit;
}
/* De regel waarop de sleutel als string staat, plus de functie eromheen. De declaraties zelf
   schrijven de sleutel ONGEQUOTE (`onvoorzien:{...}`), dus die vallen hier per constructie buiten. */
function treffers(sleutels) {
  const uit = [];
  const regels = CODE.split('\n');
  regels.forEach((ln, i) => {
    for (const k of sleutels) {
      for (const q of ["'", '"', '`']) {
        if (!ln.includes(q + k + q)) continue;
        const index = regels.slice(0, i).join('\n').length + 1;
        uit.push({ regel: i + 1, sleutel: k, fn: functieRond(index), tekst: ln.trim().slice(0, 160) });
      }
    }
  });
  return uit;
}
const TOEGESTAAN = new Set(['contantOpslaan']);

test('er zijn minstens twee geenNorm-categorieen, en ze komen uit de bron', () => {
  const ks = geenNormSleutels();
  expect(ks).toContain('onvoorzien');
  expect(ks).toContain('contant');
  // de test zelf is waardeloos als hij de sleutels niet vindt: dan zoekt hij naar niets
  expect(ks.length).toBeGreaterThanOrEqual(2);
});

test('geen enkele geenNorm-categorie wordt bij naam aangewezen, behalve door zijn eigen schrijver', () => {
  const ks = geenNormSleutels();
  const fout = treffers(ks).filter((t) => !TOEGESTAAN.has(t.fn));
  const uitleg = fout.map((t) => `regel ${t.regel} in ${t.fn}(): ${t.tekst}`).join('\n');
  expect(fout, `Een geenNorm-categorie staat hier bij naam in de code. Lees de vlag (geenNorm(k) of c.geenNorm) in plaats van de sleutel, of zet de functie in TOEGESTAAN met de reden erbij.\n${uitleg}`).toEqual([]);
});

test('de enige toegestane schrijver bestaat ook echt', () => {
  // een uitzondering op een functie die niet meer bestaat is een lek dat groen staat
  for (const naam of TOEGESTAAN) expect(HEADERS.some((h) => h.naam === naam), `${naam}() bestaat niet meer`).toBe(true);
});

test('de twee gerepareerde plekken lezen de vlag en niet de sleutel', () => {
  const body = (naam) => {
    const h = HEADERS.find((x) => x.naam === naam);
    expect(h, `${naam}() niet gevonden`).toBeTruthy();
    const v = HEADERS.find((x) => x.i > h.i);
    return CODE.slice(h.i, v ? v.i : CODE.length);
  };
  // geenNormRegels(): loopt over CATS en leest de vlag, en tikt per categorie
  const gr = body('geenNormRegels');
  expect(gr).toMatch(/Object\.keys\(CATS\)/);
  expect(gr).toMatch(/\.geenNorm/);
  expect(gr).toMatch(/openCategory\('\$\{k\}'/);
  // openCategory(): de uitleg komt uit JARGON per sleutel, niet uit één vaste zin
  const oc = body('openCategory');
  expect(oc).toMatch(/geenNorm\s*&&\s*JARGON\[k\]/);
});
