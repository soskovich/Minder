/* v507: EEN VASTE KLOK VOOR DE HELE SUITE, IN NODE EN IN DE PAGINA.
 *
 * DE AANLEIDING, GEMETEN: met de klok vast op 31 okt 2026 12:00 was de suite groen; op de echte klok
 * was ook main rood (47 tests op 1 nov, 44 op 23 nov). De fixtures bouwen hun maanden uit `new Date()`
 * in Node, en vanaf november staan ze in de salarisperiode-vorm (era vanaf 1 nov, eerste periode
 * 24 nov). De suite toetste daardoor alleen de wereld van 31 okt, en dat hing aan de dag waarop je hem
 * draaide.
 *
 * TWEE KANTEN, EN BEIDE MOETEN MEE. (1) NODE: elke spec laadt deze module als eerste (hij vervangt
 * de import van `@playwright/test`), dus `new Date()` en `Date.now()` in een fixture lezen de
 * standaarddag en niet de systeemdatum. De Node-klok LOOPT door vanaf 12:00 (een offset en geen
 * bevroren tijd), zodat een duurmeting in Node blijft werken; binnen een worker is dat hooguit een
 * uur, dus dezelfde dag. (2) DE PAGINA: een automatische fixture installeert de klok op de standaarddag
 * (doorlopend, `install` + `resume`) VOOR de test zijn eerste `page.goto()` doet. Een spec die een andere dag nodig heeft
 * roept daarna `pinDag()` of `pinDatum()` aan (vaste-dag.js), en die wint, want hij zet de klok
 * opnieuw en ook voor de goto.
 *
 * DE DAG STAAT OP EEN PLEK: `STANDAARD_YMD` in vaste-dag.js (v104). Zonder die regel zouden twee
 * specs met een eigen standaard elkaars wereld niet zien.
 *
 * DE UITZONDERING IS ALLEEN VOOR DE SABOTAGE: `ECHTE_KLOK=1` zet beide kanten uit, en dan leest de
 * suite weer de systeemdatum. Zo is te meten welke specs zonder deze module aan de echte klok hangen
 * (test a van v507).
 */
const base = require('@playwright/test');
const { standaardDatum } = require('./vaste-dag');

const UIT = process.env.ECHTE_KLOK === '1';

if (!UIT && !global.__minderKlok) {
  const Echt = Date;
  const off = standaardDatum(Echt).getTime() - Echt.now();
  /* v508: de offset staat op global.__minderKlok.off, zodat tests/periode-wereld.js een fixture op een andere dag kan opbouwen
     (metNodeDag) en daarna terugzet. */
  class KlokDate extends Echt {
    constructor(...a) { if (a.length === 0) super(Echt.now() + global.__minderKlok.off); else super(...a); }
    static now() { return Echt.now() + global.__minderKlok.off; }
  }
  global.__minderKlok = { off, Echt };
  global.Date = KlokDate;
}

/* PLAYWRIGHT ZELF LEEST Date.now() IN NODE om zijn paginaklok over een navigatie heen te dragen. Met de Node-klok verschoven
   klopt die rekensom niet meer en staat de pagina na de eerste goto weer op de echte tijd (GEMETEN: 12:00 op about:blank,
   de echte tijd na page.goto()). Tijdens een klok-aanroep staat daarom de echte Date terug. */
async function echteDatumTijdens(fn) {
  const K = global.__minderKlok; if (!K) return fn();
  const nu = global.Date; global.Date = K.Echt;
  try { return await fn(); } finally { global.Date = nu; }
}

const test = UIT ? base.test : base.test.extend({
  page: async ({ page }, use) => {
    /* install + resume: de tijd LOOPT vanaf 12:00 en de timers lopen echt, zoals op de echte klok. Een bevroren standaard brak
       elke test die op een doorlopende tijdstempel leunt (gemeten: diagnose-scherm "de volgende echte tik wordt daarna weer
       geteld", een onderdrukking op Date.now()). pinDag() en pinDatum() zetten daarna een bevroren dag, zoals sinds v299. */
    await echteDatumTijdens(() => page.clock.install({ time: standaardDatum().getTime() }));
    await use(page);
  },
});

module.exports = { ...base, test, KLOK_UIT: UIT, echteDatumTijdens };
