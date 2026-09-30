/* v309: het potjebedrag per categorie per maand, bewaard bij de maandwissel en niet gelezen.
 *
 * WAAROM HET NIET AF TE LEIDEN IS. `SET.budgets` is EEN map voor de LOPENDE maand, en
 * `effectiveBudgets(m)` negeert zijn maandargument voor de bedragen en leest diezelfde map. Er is
 * dus nergens vastgelegd wat een potje in een afgesloten maand WAS, en `rolloverBudgets()`
 * overschrijft de map uit `budgetsNext`. Een latere spiegel die zegt "twee maanden op rij onder je
 * potje" kan daarom alleen tegen het potje van VANDAAG meten, en dan zou het potje VERHOGEN met
 * terugwerkende kracht twee maanden "onder je potje" maken. Dat is de vorm die v235 aan de
 * overschrijdingskant juist dichtzette.
 *
 * `SET.valtOpLog` KAN HET NIET AANVULLEN, en dat is hier apart gemeten: daar staat
 * `if(over<DREMPEL_EUR) continue` VOOR het record wordt aangemaakt, dus een potje dat onder zijn
 * bedrag bleef krijgt per constructie nooit een record. Juist die potjes zijn wat een spiegel nodig
 * heeft.
 *
 * GEEN LEZER IN DE APP, en dat is de afbakening van deze ronde: er is geen weergave. De uitlezing
 * in blok 6 van DIAG_BLOKKEN is er wel, en om een reden die dit veld bijzonder maakt: of de opslag
 * werkt is pas te zien NA een maandwissel, en die wissel is de enige kans om die maand vast te
 * leggen. Zonder uitlezing gaat een stille fout voor altijd verloren (v296/v298).
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { open, seed, CUR, M1, M2 } = require('./budget-fixture.js');
const { sectieVan } = require('./bron-sectie.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

/* De potjes van de gedeelde fixture, en de een die in de 'volgende maand'-laag afwijkt. Dat
   verschil is wat de test over "voor de doorschuif" meetbaar maakt (meetles a). */
const BOOD_NU = 800;
const BOOD_NEXT = 850;
const POTJES = { huur: 900, goededoel: 20, sport: 25, boodschappen: BOOD_NU, uiteten: 400, shopping: 255 };

/* De maandwissel zoals de app hem loopt: SET.budgetMonth staat op een eerdere maand en de boot
   heeft rolloverBudgets() al gedaan. Hier zetten we hem terug en lopen hem opnieuw, zodat het het
   ECHTE pad is en geen nagebootste schrijver (meetles c/g). */
const WISSEL = (vanMaand) => `(() => {
  SET.budgetHist = undefined;
  SET.budgetMonth = ${JSON.stringify(vanMaand)};
  rolloverBudgets();
  return { hist: JSON.parse(JSON.stringify(SET.budgetHist||{})),
    budgets: JSON.parse(JSON.stringify(SET.budgets||{})),
    next: JSON.parse(JSON.stringify(SET.budgetsNext||{})),
    budgetMonth: SET.budgetMonth }; })()`;

test.describe('a - de fixture draagt het verschil dat deze spec nodig heeft', () => {
  test('de volgende-maand-laag wijkt af van de lopende, anders meet "voor de doorschuif" niets', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({
      budgets: JSON.parse(JSON.stringify(SET.budgets || {})),
      next: JSON.parse(JSON.stringify(SET.budgetsNext || {})),
      maand: SET.budgetMonth }));
    expect(r.budgets).toEqual(POTJES);
    expect(r.next.boodschappen).toBe(BOOD_NEXT);
    expect(r.next.boodschappen).not.toBe(r.budgets.boodschappen);
    expect(r.maand).toBe(CUR);
    console.log(`### budgets ${JSON.stringify(r.budgets)}`);
    console.log(`### next    ${JSON.stringify(r.next)}`);
  });

  test('valtOpLog kan de historie niet leveren: hij slaat een potje dat eronder bleef over', () => {
    /* De poort staat VOOR het aanmaken van het record, dus er is geen entry voor een potje dat
       binnen zijn bedrag bleef. Dat is de reden dat deze opslag bestaat en niet een lezer van
       valtOpLog. */
    const f = sectieVan(SRC, 'function valtOpSignals(');
    const i = f.indexOf('if(over<DREMPEL_EUR) continue');
    const j = f.indexOf('if(!L[id])');
    expect(i).toBeGreaterThan(-1);
    expect(j).toBeGreaterThan(i);
  });
});

test.describe('b - de maandwissel legt de maand vast die net afsloot', () => {
  test('de bedragen van de afgesloten maand staan erin, en de lopende niet', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(WISSEL(M1));
    expect(Object.keys(r.hist)).toEqual([M1]);
    expect(r.hist[M1]).toEqual(POTJES);
    expect(r.hist[CUR]).toBeUndefined();
    expect(r.budgetMonth).toBe(CUR);
    console.log(`### hist[${M1}] = ${JSON.stringify(r.hist[M1])}`);
  });

  test('hij schrijft VOOR de doorschuif, dus de oude waarde en niet die van de volgende maand', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(WISSEL(M1));
    /* HET GEVAL DAT DE TWEE VORMEN ONDERSCHEIDT. Staat de schrijver NA de doorschuif, dan draagt
       de historie 850 in plaats van 800 en is hij de stand van de NIEUWE maand. `valtOpAfsluiten()`
       draait bij de boot na `rolloverBudgets()` en leest om precies deze reden zijn meetlat uit
       het eigen record en niet uit SET.budgets (v235). */
    expect(r.hist[M1].boodschappen).toBe(BOOD_NU);
    expect(r.budgets.boodschappen).toBe(BOOD_NEXT);     // de doorschuif is wel gebeurd
    expect(r.next).toEqual({});                          // en de laag is leeggemaakt
  });

  test('een bijstelling van deze maand (v235) landt als het bijgestelde bedrag', async ({ page }) => {
    await open(page);
    /* v235 schrijft bij een bijstelling SET.budgets[k] voor de LOPENDE maand en zet
       SET.budgetsNext[k] terug op de oude waarde, zodat rolloverBudgets() hem ongedaan maakt. Dat
       is exact de vorm hieronder. Wat de maand DROEG is dus het bijgestelde bedrag. */
    const r = await page.evaluate(`(() => {
      SET.budgets.uiteten = 500; SET.budgetsNext.uiteten = 400;
      ${WISSEL(M1).slice(9)}`);
    expect(r.hist[M1].uiteten).toBe(500);
    expect(r.budgets.uiteten).toBe(400);
  });
});

test.describe('c - een afgesloten maand wordt nooit herschreven', () => {
  test('een bestaande maand blijft staan, ook met andere bedragen in SET.budgets', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(`(() => {
      SET.budgetHist = { ${JSON.stringify(M1)}: { boodschappen: 111 } };
      SET.budgetMonth = ${JSON.stringify(M1)};
      rolloverBudgets();
      return { hist: JSON.parse(JSON.stringify(SET.budgetHist||{})) }; })()`);
    /* v277: historie die stil wordt herschreven is geen meting. Zonder deze guard zou een tweede
       boot in dezelfde maand de entry overschrijven met de bedragen van de NIEUWE maand. */
    expect(r.hist[M1]).toEqual({ boodschappen: 111 });
  });

  test('twee wissels op een rij leveren twee maanden en raken de eerste niet', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(`(() => {
      SET.budgetHist = undefined;
      SET.budgetMonth = ${JSON.stringify(M2)}; rolloverBudgets();
      const na1 = JSON.parse(JSON.stringify(SET.budgetHist||{}));
      SET.budgets.sport = 99;
      SET.budgetMonth = ${JSON.stringify(M1)}; rolloverBudgets();
      return { na1, na2: JSON.parse(JSON.stringify(SET.budgetHist||{})) }; })()`);
    expect(Object.keys(r.na1)).toEqual([M2]);
    expect(Object.keys(r.na2).sort()).toEqual([M2, M1].sort());
    expect(r.na2[M2].sport).toBe(25);      // de eerste maand is niet meegeschoven
    expect(r.na2[M1].sport).toBe(99);
  });
});

test.describe('d - wat er niet in gaat', () => {
  test('een bedrag van nul krijgt geen sleutel', async ({ page }) => {
    await open(page);
    /* v59/v73/v173: een potje dat er niet was krijgt geen sleutel met een nul, anders leest die
       nul later als "je had een potje van niks". */
    const r = await page.evaluate(`(() => {
      SET.budgets.sport = 0; SET.budgets.goededoel = 0;
      ${WISSEL(M1).slice(9)}`);
    expect(r.hist[M1].sport).toBeUndefined();
    expect(r.hist[M1].goededoel).toBeUndefined();
    expect(r.hist[M1].boodschappen).toBe(BOOD_NU);
  });

  test('een maand zonder enig potje krijgt geen entry', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(`(() => {
      SET.budgets = {};
      ${WISSEL(M1).slice(9)}`);
    // een lege maand is iets anders dan een maand met nul potjes: er valt niets vast te leggen
    expect(r.hist[M1]).toBeUndefined();
    expect(Object.keys(r.hist)).toEqual([]);
  });

  test('de eerste boot op een verse installatie legt niets vast', async ({ page }) => {
    await open(page);
    /* Zonder budgetMonth keert rolloverBudgets() vroeg terug: er is geen maand die afsloot, dus er
       is niets om vast te leggen, en een entry zou de lopende maand als afgesloten bestempelen. */
    const r = await page.evaluate(`(() => {
      SET.budgetHist = undefined; SET.budgetMonth = '';
      rolloverBudgets();
      return { hist: JSON.parse(JSON.stringify(SET.budgetHist||{})), maand: SET.budgetMonth }; })()`);
    expect(Object.keys(r.hist)).toEqual([]);
    expect(r.maand).toBe(CUR);
  });

  test('een boot in dezelfde maand legt niets vast', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(`(() => {
      SET.budgetHist = undefined; SET.budgetMonth = thisYM();
      rolloverBudgets();
      return { hist: JSON.parse(JSON.stringify(SET.budgetHist||{})) }; })()`);
    expect(Object.keys(r.hist)).toEqual([]);
  });
});

test.describe('e - geen lezer in de app', () => {
  test('het veld staat alleen bij zijn schrijver, zijn aanroeper en zijn uitlezing', () => {
    /* Dezelfde vorm als v276 bij t.valutaDatum: het veld wordt opgevangen en verder niets, en deze
       assertie valt zodra er een lezer buiten die drie bijkomt. */
    const totaal = (SRC.match(/budgetHist/g) || []).length;
    const perSectie = [
      sectieVan(SRC, 'function budgetHistLeg('),
      sectieVan(SRC, 'function rolloverBudgets(){'),
      sectieVan(SRC, 'function diagPotjes('),
    ].reduce((n, sec) => n + (sec.match(/budgetHist/g) || []).length, 0);
    console.log(`### budgetHist-treffers: ${totaal} in de bron, ${perSectie} in de drie toegestane secties`);
    expect(totaal).toBeGreaterThan(0);
    expect(perSectie).toBe(totaal);
  });

  test('de schrijver staat op een plek en wordt alleen door de maandwissel aangeroepen', () => {
    const n = (SRC.match(/budgetHistLeg\(/g) || []).length;
    expect(n).toBe(2);                         // de definitie en de ene aanroep
    expect(sectieVan(SRC, 'function rolloverBudgets(){')).toContain('budgetHistLeg(SET.budgetMonth, SET.budgets)');
  });

  test('de aanroep staat voor de doorschuif', () => {
    const f = sectieVan(SRC, 'function rolloverBudgets(){');
    expect(f.indexOf('budgetHistLeg(')).toBeLessThan(f.indexOf('const N=SET.budgetsNext'));
  });
});

test.describe('f - de uitlezing in blok 6 scheidt "niet gewisseld" van "gewisseld en leeg"', () => {
  const blok6 = async (page) => page.evaluate(`(() => {
    const b = DIAG_BLOKKEN.find(x => x.lees === diagPotjes);
    return (b.lees()||[]).join(String.fromCharCode(10)); })()`);

  test('zonder historie en met een budgetMonth zegt hij dat er niet is gewisseld', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { SET.budgetHist = undefined; SET.budgetMonth = thisYM(); });
    const t = await blok6(page);
    expect(t).toMatch(/POTJEBEDRAGEN PER MAAND/);
    expect(t).toMatch(/ONTBREKENDE meting: er is niet gewisseld/);
    console.log('### ' + t.split('\n').filter((l) => /POTJEBEDRAGEN|budgetMonth|LEEG|hoort hier niet/.test(l)).join(' | '));
  });

  test('na een wissel schrijft hij de maand met zijn potjes uit', async ({ page }) => {
    await open(page);
    await page.evaluate(WISSEL(M1));
    const t = await blok6(page);
    expect(t).toMatch(new RegExp(M1 + ': 6 potje\\(s\\), samen ' + (900 + 20 + 25 + 800 + 400 + 255)));
    expect(t).toMatch(/maanden vastgelegd: 1/);
    expect(t).not.toMatch(/ONTBREKENDE meting/);
    expect(t).toMatch(/hoort hier niet in: klopt/);
    console.log('### ' + t.split('\n').filter((l) => /POTJEBEDRAGEN|potje\(s\)|vastgelegd|hoort hier niet/.test(l)).join(' | '));
  });

  test('een lopende maand in de historie wordt aangewezen en niet stil geslikt', async ({ page }) => {
    await open(page);
    /* Dit is de stand die NIET mag bestaan: een maand die nog loopt, vastgelegd als afgesloten
       (v194). Zonder deze regel leest zo'n entry als een gewone maand en telt hij mee in een
       latere spiegel. */
    await page.evaluate(() => { SET.budgetHist = { [thisYM()]: { boodschappen: 1 } }; });
    const t = await blok6(page);
    expect(t).toMatch(/LET OP: dit is de LOPENDE maand/);
    expect(t).toMatch(/hoort hier niet in: STAAT ER WEL/);
  });

  test('het blok schrijft niets', async ({ page }) => {
    await open(page);
    await page.evaluate(WISSEL(M1));
    const r = await page.evaluate(`(() => {
      const voor = JSON.stringify(SET.budgetHist);
      let n = 0; const o = localStorage.setItem.bind(localStorage);
      localStorage.setItem = function(...a){ n++; return o(...a); };
      const b = DIAG_BLOKKEN.find(x => x.lees === diagPotjes); b.lees();
      localStorage.setItem = o;
      return { schrijvers: n, gelijk: JSON.stringify(SET.budgetHist) === voor }; })()`);
    expect(r.schrijvers).toBe(0);
    expect(r.gelijk).toBe(true);
  });
});
