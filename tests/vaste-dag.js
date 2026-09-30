/* v299: DE KLOK OP EEN VASTE DAG, GETELD VANAF HET EINDE VAN DE MAAND.
 *
 * HET GEVAL: zeven tests in vier bestanden eisten het MEERVOUD van het dagwoord en vielen op de
 * op-een-na-laatste dag van een maand, want `maandDagenOver()` rekent `dim - elapsed` en sluit
 * vandaag uit (v257), dus dan staat er "1 dag". Ze stonden dagenlang rood en maakten daarmee het
 * ding kapot waarvoor een suite bestaat: een nieuwe rode test viel niet meer op tussen tien bekende.
 *
 * WAAROM VANAF HET EINDE EN NIET EEN VAST DAGNUMMER. Een vast dagnummer (de specs noemden "dag 23
 * van 30") haalt de dag eruit maar niet de MAANDLENGTE: dan is het restant 5 dagen in februari en
 * 8 in maart, en elke assertie die met dat restant rekent beweegt nog steeds mee met de kalender.
 * Wat deze tests werkelijk vasthouden is het RESTANT, dus dat is wat vast moet staan. `dim - 7`
 * geeft exact zeven dagen over in elke maand.
 * DE ZEVEN KWAM UIT `POTJE_VENSTER_DAGEN`, het venster van de weekregel van v263, en die constante
 * is bij v309 vervallen toen die regel een dagbedrag werd. Het getal blijft 7 om de reden waarvoor
 * deze pin bestaat en niet om die oude: het is het kleinste restant waarbij elk van deze tests het
 * MEERVOUD van het dagwoord krijgt en geen enkele deling op een klem uitkomt. Een tweede getal
 * ernaast zou een tweede waarheid zijn over welke dag deze tests bekijken (v104).
 *
 * HIJ ZET ALLEEN DE TIJD EN RAAKT GEEN TIMER. `page.clock.setFixedTime()` vervangt `Date`, en niet
 * `setTimeout`: een toast die na twee seconden verdwijnt blijft dus gewoon werken. `clock.install()`
 * zou de timers ook overnemen en een test die op zo'n toast wacht laten hangen.
 *
 * DE MAAND BLIJFT DE ECHTE MAAND, en dat is een bewuste grens. De fixtures bouwen hun maandsleutels
 * uit `new Date()` in Node, en `budget-fixture.js` doet dat voor 73 specs; die meeverhuizen naar een
 * vaste maand is een eigen ronde. Wat hier vastligt is de dag binnen die maand, en dat is precies de
 * as waarop deze zeven vielen.
 *
 * HIJ MOET VOOR `page.goto()` STAAN, anders leest de boot nog de echte klok.
 */
const DAGEN_OVER = 7;

/* De 12:00 is geen detail: op middernacht zou een zomertijdsprong de dag kunnen verschuiven, en dat
   is dezelfde val als `toISOString()` in een test (v199/v280). */
function vasteDatum(dagenOver = DAGEN_OVER, ref = new Date()) {
  const dim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const dag = dim - dagenOver;
  if (dag < 1) throw new Error('vaste-dag: ' + dagenOver + ' dagen over past niet in een maand van ' + dim);
  return new Date(ref.getFullYear(), ref.getMonth(), dag, 12, 0, 0);
}

async function pinDag(page, dagenOver = DAGEN_OVER) {
  const d = vasteDatum(dagenOver);
  await page.clock.setFixedTime(d);
  return d;
}

/* v307: EEN PIN OP EEN GENOEMDE DAG, NAAST DIE OP HET RESTANT. Dat is geen tweede waarheid over
   welke dag een test bekijkt (v104) maar een andere vraag: `pinDag` houdt het RESTANT van de maand
   vast, want dat is wat de zeven dagwoord-tests en de zes potjes-tests meten. Een test over de
   KALENDER zelf (een 31e, een schrikkeldag) heeft juist die genoemde dag nodig, en die is uit een
   restant niet te halen: de 31e van januari is `dim - 0` en de 29e van februari 2024 is `dim - 0`
   van een andere maandlengte.
   HIJ STAAT HIER en niet in de spec die hem gebruikt, zodat `page.clock` op een plek wordt
   aangeroepen en `vaste-testdag.spec.js` zijn lijst zetters volledig kan houden.
   DE MIDDAG OM DEZELFDE REDEN ALS HIERBOVEN: op middernacht kan een zomertijdsprong de dag
   verschuiven. */
async function pinDatum(page, ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) throw new Error('vaste-dag: pinDatum wil jjjj-mm-dd, kreeg ' + ymd);
  const d = new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0);
  if (d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3])
    throw new Error('vaste-dag: ' + ymd + ' bestaat niet');
  await page.clock.setFixedTime(d);
  return d;
}

module.exports = { DAGEN_OVER, vasteDatum, pinDag, pinDatum };
