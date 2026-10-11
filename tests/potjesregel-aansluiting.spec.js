// v250: het grote getal op de potjesregel sluit aan op de regel eronder.
//
// GEMELD: "Nog uit je potjes €1.089, van €1.730 · €1.132 gebruikt · 65%". Dat leest als een
// aftrekking en is het niet: €1.089 komt uit varPlanRemaining(), en die geeft voor een overschreden
// potje het geplande dagtempo maal de resterende dagen terug (v111), niet een negatief restant.
// Het grote getal is sinds deze ronde varBudget() min varPotjeStand().gebruikt, en de reservering
// staat als eigen regel eronder met het verschil erbij.
//
// WAT DEZE SPEC VASTHOUDT, en niet de opmaak: dat de twee getallen op de regel uit dezelfde twee
// bronnen komen als de sub eronder, dat de tweede regel varPlanRemaining noemt en er alleen staat
// als er een gat is, en dat een tik altijd uitkomt op het bedrag waarop je tikte.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
/* v306: DE DAG STAAT VAST, want deze spec meet een RESERVERING en die is op de laatste dag van de
   maand per constructie nul. `daysElapsed()` geeft daar `elapsed === dim`, dus `potjeRest()` geeft
   voor een overschreden potje `bud/dim * 0` en het gat is dan exact gelijk aan de overschrijding.
   Dezelfde as als de zeven dagwoord-tests van v299, een dag verderop, en dus dezelfde pin. */
const { pinDag } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  }
  for (const b of (o.boekingen || [])) add(b[0], CUR, b[1], b[2], b[3], b[4]);
  const set = Object.assign({
    /* v305: de ondergrens is sinds v305 een KEUZE en heeft geen default meer, dus de fixture kiest
       hem hier. Deze spec is geschreven toen drie maanden een vaste grens was; dat getal staat nu
       waar het thuishoort, in de gegevens van de gebruiker. */
    bufferNorm: 3,
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000 }, savingMode: 'amount', savingAmount: 0,
    budgets: o.budgets || { boodschappen: 500, vervoer: 300, uiteten: 400, huur: 1200 },
    budgetMonth: CUR,
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

/* DE GEMETEN TOESTAND VAN HET TOESTEL, en niet een verhouding die erop lijkt. Gemeld werd
   "Nog uit je potjes €1.089, van €1.730 · €1.132 gebruikt · 65%", dus €1.730 aan variabele potjes,
   €1.132 gebruikt en een aftrekking van €598. Die drie staan hieronder als potjes en boekingen.
   WAT NIET VAST TE ZETTEN IS: de €1.089 en het gat van €491. potjeRest() geeft voor een
   overschreden potje bud/dim maal de RESTERENDE DAGEN terug, dus die twee hangen aan de dag van
   de maand: op dag 20 was het gat €385, op dag 22 €491. Een fixture die ze als getal vastlegt zou
   morgen rood staan zonder dat er iets mis is, en elke test leest ze daarom live uit
   varPlanRemaining() in plaats van ze te herhalen.
   SINDS v306 STAAT DE DAG VAST op zeven dagen over (`vaste-dag.js`), en dat verandert aan die
   keuze niets: wat vastligt is nog steeds de IDENTITEIT en niet het bedrag. De pin haalt alleen
   de LAATSTE dag van de maand weg, en daar is de reservering nul en valt er geen gat te meten. */
const GEMELD_BUDGETS = { boodschappen: 600, uiteten: 400, vervoer: 330, shopping: 400, huur: 1200 };
const GEMELD = [['b1', '03', -931, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['u1', '06', -120, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT'],
  ['v1', '04', -81, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION']];
const gemeld = () => ({ boekingen: GEMELD, budgets: GEMELD_BUDGETS });
/* v308: EEN TWEEDE FIXTURE, EN HIJ HEET NIET "gemeld". Sinds v308 klemt potjeRest() ook de tak
   voor een potje MET ruimte op het geplande dagtempo maal de resterende dagen, en dan is er op de
   GEMELDE stand geen gat meer: die drie potjes lopen ver achter op hun tempo, dus wat ze bij dat
   tempo nog vragen ligt onder wat er in zit. Dat is de reparatie en geen regressie, maar de vier
   tests over de regel eronder hebben wel een stand nodig waarin er wel een gat is.
   WAT DEZE STAND DRAAGT: een potje dat precies OP tempo ligt (dan valt er aan de klem niets te
   verliezen, dus het gat is wat het potje eroverheen vraagt) en een potje dat er ver overheen is.
   Hij is GECONSTRUEERD en niet gemeten. Het potje op tempo is groot genoeg dat er na de
   overschrijding nog iets in de potjes zit, zodat de regel boven de noot "Nog uit je potjes" zegt
   en niet "Te veel uitgegeven"; dat laatste is sectie c.
   DE STAND GEEFT BIJ ELKE MAANDLENGTE EEN GAT: het potje eroverheen vraagt bij zijn tempo nog
   iets EN draagt zijn overschrijding, en daar staat bij het potje op tempo per constructie geen
   verloren ruimte tegenover. */
const GAT_BUDGETS = { boodschappen: 600, uiteten: 1800, huur: 1200 };
const GAT = [['b1', '03', -931, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['u1', '06', -1380, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT']];
const gat = () => ({ boekingen: GAT, budgets: GAT_BUDGETS });
// alles ruim binnen de potjes: geen gat
const BINNEN = [['b1', '03', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN']];
// meer uitgegeven dan de som van alle variabele potjes
const OVERAL = [['b1', '03', -900, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['v1', '04', -400, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION']];
/* elk potje precies op nul: potjeRest geeft dan overal bud - uitgegeven = 0 terug, dus
   varPlanRemaining is nul terwijl er wel potjes zijn. Op de oude poort (varPlan>0) verdween de
   regel hier; de nieuwe poort leest varBudget en houdt hem staan. */
const PRECIES = [['b1', '03', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['v1', '04', -300, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION'],
  ['u1', '06', -400, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT']];

async function boot(page, o) {
  await pinDag(page);                      // v306: vóór de goto, anders leest de boot de echte klok
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof nogDezeMaandPosten === 'function');
  await page.evaluate(() => go('ins'));
}

/* v382: DE TEGEL "NOG IN POTJES" IS WEG. Het getal staat nu op twee plekken die een getal delen: de rij
   "in potjes" in de legenda van de maandkaart (`[data-insleg="nogpot"]`, onder "Nog te gaan") en de kop van
   de sheet erachter (`openInsTegel('potjes')`). `val`/`valEur` zijn het bedrag van die rij, `lab` het label van
   de sheet (kleine letters, zonder de maand). De noemer van de kaart (totals().spendNorm tegen totals().budget)
   staat in de kop van de maandkaart (`[data-insuit]`, `[data-insbudget]`), en die heet hier `kaart`.
   EEN NULRIJ STAAT NIET IN DE LEGENDA (v382, ontwerp), dus bij precies nul is de sheet de plek die het getal
   draagt. Het achtervoegsel met de tempo-krapte ("bij je tempo EUR X tekort") hoorde bij de tegel en staat niet
   meer op Inzichten; de tests die alleen dat achtervoegsel lazen zijn weg. */
const meet = (page) => page.evaluate(() => {
  const m = curMonth || months()[months().length - 1];
  const VP = varPotjeStand(m);
  go('ins');
  const rij = document.querySelector('#insMaand [data-insleg="nogpot"]');
  const kaart = document.querySelector('#insMaand');
  const t = totals(m);
  openInsTegel('potjes');
  const sh = document.querySelector('#insTegelSheet[data-instegelsheet="potjes"]');
  const kop = sh ? sh.firstElementChild.innerText.replace(/\s+/g, ' ').trim() : '';
  const out = {
    er: !!rij, sheet: !!sh, sheetWaarde: sh ? +sh.dataset.inswaarde : null,
    sheetRijen: sh ? sh.querySelectorAll('[data-inspotrij]').length : 0, sheetOver: sh ? sh.querySelectorAll('[data-insover]').length : 0,
    sheetTekst: sh ? sh.innerText : '',
    lab: kop ? kop.split(' · ')[0].toLowerCase() : null,
    val: rij ? rij.querySelector('b').innerText.trim() : null, valEur: rij ? Math.abs(+rij.dataset.v) : null, rijV: rij ? +rij.dataset.v : null,
    rijLab: rij ? rij.querySelector('span').innerText.trim().toLowerCase() : null,
    rijTik: !!(rij && rij.getAttribute('onclick')),
    kaart: kaart ? { uit: +kaart.dataset.insuit, budget: +kaart.dataset.insbudget } : null,
    budget: VP.budget, gebruikt: VP.gebruikt, nog: VP.nog, rest: varPlanRemaining(m), reserve: varPotjesReserve(m),
    kaartBudget: Math.round(t.budget), kaartSpend: Math.round(t.spendNorm),
    inPotjes: VP.budget - VP.gebruikt, gat: varPlanRemaining(m) - (VP.budget - VP.gebruikt),
  };
  closeSheet();
  return out;
});

/* v383: DE OMKERING, gevraagd door de gebruiker: "in potjes" is per potje budget min uitgegeven, NIET ONDER NUL. Tot
   v383 was het de netto aftrekking varBudget() min gebruikt (v250), en dan verrekende een overschrijding in het ene potje
   met de ruimte in een ander. Per potje niet onder nul is precies de reservering van Home (varPotjesReserve, v254), dus
   die twee zijn nu hetzelfde getal. De aftrekking blijft een eigenschap van de bron (varPotjeStand) en staat hieronder
   naast het getal, zodat te zien is waar ze uiteenlopen. */
test.describe('a · het getal is per potje budget min gebruikt, niet onder nul', () => {
  test('de gemelde verhouding: het getal is de reservering per potje, niet de netto aftrekking', async ({ page }) => {
    await boot(page, gemeld());
    const r = await meet(page);
    expect(r.er).toBe(true);
    expect(r.rijV).toBe(r.reserve);             // per potje niet onder nul
    expect(r.valEur).not.toBe(r.inPotjes);      // en in deze fixture wijkt de netto aftrekking echt af
    expect(r.valEur).toBeGreaterThan(r.inPotjes);
    expect(r.sheetOver).toBeGreaterThan(0);     // het potje dat erboven zit zegt dat in de sheet
    expect(r.sheetWaarde).toBe(r.rijV);         // de sheet draagt hetzelfde getal
    expect(r.lab).toBe('nog in potjes');
    expect(r.rijLab).toBe('in potjes');
    /* v308: op de GEMELDE stand lopen de potjes achter op hun tempo, dus bij dat tempo vragen ze samen minder dan er
       in zit. Dat is een eigenschap van de bron en blijft hier staan. */
    expect(r.gat).toBeLessThan(0);
  });

  test('de kop van de kaart noemt een ANDERE noemer, en dat staat er ook', async ({ page }) => {
    await boot(page, gemeld());
    const r = await meet(page);
    /* v382: de noemer van de kaart (totals().spendNorm tegen totals().budget) staat in de kop van de maandkaart, de
       potjes-noemer (varBudget) in de rij "in potjes". Twee bronnen, twee plekken, en ze lopen uiteen. */
    expect(r.kaart.uit).toBe(r.kaartSpend);
    expect(r.kaart.budget).toBe(r.kaartBudget);
    expect(r.lab).not.toMatch(/maandbudget|uitgegeven/);
    /* DE TWEE NOEMERS LOPEN UITEEN EN DE TWEE RESTANTEN VALLEN OP DEZE FIXTURE SAMEN: de gemelde stand draagt een
       terugkerend potje (huur 1.200) dat volledig is afgeschreven, dus totals().budget is 2.930 en varBudget() 1.730
       terwijl beide restanten op 598 uitkomen. Wat hier vastligt is dat elk van de twee zijn eigen bron leest. */
    const kaartRestant = r.kaartBudget - r.kaartSpend;
    expect(r.valEur).toBe(r.reserve);           // v383: per potje niet onder nul
    expect(r.budget).not.toBe(r.kaartBudget);
    expect(r.budget).toBe(1730);
    expect(r.kaartBudget).toBe(2930);
    expect(kaartRestant).toBe(r.inPotjes);      // toeval van deze fixture, en dat zegt de test
  });

  test('niets gebruikt: het hele potje staat er', async ({ page }) => {
    await boot(page, { boekingen: [] });
    const r = await meet(page);
    expect(r.valEur).toBe(r.budget);
    expect(r.sheetWaarde).toBe(r.budget);
    expect(r.gat).toBeLessThanOrEqual(0);
  });
});

test.describe('b · de reservering is een andere vraag', () => {
  // v382: weg, "het achtervoegsel noemt het gat": het achtervoegsel met de tempo-krapte hoorde bij de tegel
  // "Nog in potjes" en staat niet meer op Inzichten. De identiteit erachter (restant plus gat is de tempo-som)
  // is een eigenschap van de bronnen en blijft hieronder staan.
  test('op de GAT-stand is het restant plus het gat de tempo-som', async ({ page }) => {
    await boot(page, gat());
    const r = await meet(page);
    expect(r.gat).toBeGreaterThan(0);
    expect(r.inPotjes + r.gat).toBe(r.rest);    // de identiteit van de bronnen
    expect(r.valEur).toBe(r.reserve);           // v383: het scherm draagt de reservering per potje
  });

  test('geen enkel potje over zijn grens: de reservering is de aftrekking', async ({ page }) => {
    await boot(page, { boekingen: BINNEN });
    const r = await meet(page);
    expect(r.er).toBe(true);
    expect(r.gat).toBeLessThanOrEqual(0);
    expect(r.reserve).toBe(r.inPotjes);
    expect(r.rest).toBeLessThanOrEqual(r.inPotjes);
  });

  // v382: weg, "het achtervoegsel draagt geen alarmkleur": dat achtervoegsel bestaat niet meer.
});

/* v383: elk potje erboven geeft nul in je potjes, geen negatief getal; elk potje zegt in de sheet hoeveel erboven. */
test.describe('c · meer uitgegeven dan er in je potjes zat', () => {
  /* OVERAL: boodschappen en vervoer gaan samen EUR 500 over hun potjes, uit eten (EUR 400) is onaangeroerd. Netto is dat
     EUR 100 te veel (v250 zei "te veel uitgegeven"); per potje staat de EUR 400 van uit eten er nog (v383). */
  test('netto te veel: de ruimte per potje blijft staan, en de sheet noemt per potje wat erboven ging, zonder minteken', async ({ page }) => {
    await boot(page, { boekingen: OVERAL });
    const r = await meet(page);
    expect(r.inPotjes).toBeLessThan(0);
    expect(r.er).toBe(true);
    expect(r.rijV).toBe(r.reserve);
    expect(r.rijV).toBeGreaterThan(0);
    expect(r.sheetWaarde).toBe(r.rijV);
    expect(r.lab).toBe('nog in potjes');
    expect(r.rijLab).toBe('in potjes');
    expect(r.sheetOver).toBe(2);
    expect(r.sheetTekst).toMatch(/erboven/);
    expect(r.sheetTekst).not.toMatch(/-€/);
  });

  test('de sheet draagt geen percentage', async ({ page }) => {
    await boot(page, { boekingen: OVERAL });
    const r = await meet(page);
    expect(r.sheetTekst).not.toMatch(/%/);
  });
});

test.describe('d · de poort leest je potjes, niet de reservering', () => {
  test('elk potje precies op: reservering nul, en de sheet staat er nog', async ({ page }) => {
    await boot(page, { boekingen: PRECIES });
    const r = await meet(page);
    expect(r.rest).toBe(0);            // de oude poort (varPlan>0) had de regel hier laten vallen
    /* v382: een nulrij staat niet in de legenda van de maandkaart (ontwerp); de sheet is de plek die de nul draagt,
       met een rij per potje. */
    expect(r.er).toBe(false);
    expect(r.sheet).toBe(true);
    expect(r.sheetWaarde).toBe(0);
    expect(r.sheetRijen).toBeGreaterThan(0);
    expect(r.gat).toBe(0);
  });
});

test.describe('e · een tik komt uit op het bedrag waarop je tikte', () => {
  const kopBedrag = (page) => page.evaluate(() => {
    const t = document.querySelector('#sheet').innerText.replace(/\s+/g, ' ');
    const m = t.match(/€([\d.]+)(?:,\d\d)?/);
    return m ? +m[1].replace(/\./g, '') : null;
  });

  test('een tik op de rij "in potjes" opent een sheet met hetzelfde bedrag', async ({ page }) => {
    await boot(page, gemeld());
    const r = await meet(page);
    expect(r.rijTik).toBe(true);
    await page.click('#insMaand [data-insleg="nogpot"]');
    await page.waitForSelector('#sheetBg.show');
    expect(await kopBedrag(page)).toBe(r.valEur);
    expect(await page.locator('#insTegelSheet').getAttribute('data-instegelsheet')).toBe('potjes');
  });

  test('Home houdt de route naar de sheet, ook zonder gat', async ({ page }) => {
    await boot(page, { boekingen: BINNEN });
    const r = await meet(page);
    const home = await page.evaluate(() => {
      go('dash'); openSafeToSpend();
      const el = [...document.querySelectorAll('#sheet [onclick]')]
        .find((x) => /gereserveerd in je potjes/i.test(x.innerText));
      return { er: !!el, bron: Math.round(safeToSpend().reserved) };
    });
    expect(home.er).toBe(true);
    expect(home.bron).toBe(r.reserve);
  });
});

test.describe('f · safeToSpend is niet aangeraakt', () => {
  for (const [naam, o] of [['gemeld', gemeld()], ['binnen', { boekingen: BINNEN }],
    ['overal over', { boekingen: OVERAL }]]) {
    test(`${naam}: reserved blijft varPlanRemaining, en de regel wijkt er bewust van af`, async ({ page }) => {
      await boot(page, o);
      const r = await page.evaluate(() => {
        const m = curMonth || months()[months().length - 1];
        const S = safeToSpend();
        return { reserved: Math.round(S.reserved), plan: varPlanRemaining(m), reserve: varPotjesReserve(m),
          safe: S.safe, opnieuw: safeToSpend().safe };
      });
      /* v254: safeToSpend() leest varPotjesReserve() in plaats van varPlanRemaining(), want
         veilig te besteden vraagt wat er nog IN je potjes zit. Wat deze test vasthoudt blijft: de
         regel op Inzichten en veilig te besteden lopen niet stiekem uiteen, ze stellen bewust een
         andere vraag, en de aftrekking van de regel is geen van beide. */
      // v382: de bron lezen gaat via tests/bron-kaal.js, zonder commentaar
      r.src = await kaalUit(page, 'safeToSpend');
      expect(r.reserved).toBe(r.reserve);
      expect(r.src).toContain('varPotjesReserve(');
      expect(r.src).not.toContain('varPotjeStand');  // en niet het getal van de regel zelf
      expect(r.safe).toBe(r.opnieuw);
    });
  }
});
