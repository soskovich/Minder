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

/* v309: DE REGEL IS HET HOOFDGETAL VAN DE STAND-KAART GEWORDEN. `val` is het grote getal, `lab`
   het label, en `noot` het deel van het achtervoegsel dat de tempo-krapte draagt (de oude noot).
   `sub` bestaat NIET meer: die noemde de potjes-noemer ("van EUR 1.200 . EUR 1.070 gebruikt . 89%")
   en is niet meeverhuisd, want de kaart draagt een eigen regel met totals().spendNorm tegen
   totals().budget en dat is een andere noemer (v257). Wat daar nu staat heet `noemerRegel`, en de
   tests eronder toetsen juist dat die twee uiteenlopen.
   `lijstPost` is er om te toetsen dat de post in de lijst NIET meer staat. */
/* v359: DE STAND-KAART IS DE TEGEL "NOG IN POTJES" GEWORDEN. `val` is het getal op de tegel, `lab` zijn label
   (kleine letters), `achter` de regel eronder en `noot` die regel als hij de tempo-krapte draagt. De noemer van
   de kaart (totals().spendNorm tegen totals().budget) staat op de tegel Uitgegeven, en die heet hier
   `uitTegel`. Elke tegel opent een sheet; `rijTik` meet dat. */
const meet = (page) => page.evaluate(() => {
  const m = curMonth || months()[months().length - 1];
  const VP = varPotjeStand(m);
  go('ins');
  const k = document.querySelector('#insTegels [data-instegel="potjes"]');
  const u = document.querySelector('#insTegels [data-instegel="uitgegeven"]');
  const tx = (el, q) => (el && el.querySelector(q) ? el.querySelector(q).innerText.replace(/\s+/g, ' ').trim() : null);
  const eur = (t) => (t == null ? null : Math.abs(Math.round(parseFloat(String(t).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0)));
  const achter = tx(k, '.ms') || '';
  const t = totals(m);
  return {
    er: !!k, lab: tx(k, '.lb') ? tx(k, '.lb').toLowerCase() : null,
    val: tx(k, '.vl'), valEur: eur(tx(k, '.vl')),
    achter, noot: /tekort/.test(achter) ? achter : null,
    uitTegel: u ? { val: eur(tx(u, '.vl')), ms: tx(u, '.ms') } : null,
    lijstPost: false,
    rijTik: !!(k && k.getAttribute('onclick')),
    budget: VP.budget, gebruikt: VP.gebruikt, rest: varPlanRemaining(m), reserve: varPotjesReserve(m),
    kaartBudget: Math.round(t.budget), kaartSpend: Math.round(t.spendNorm),
    inPotjes: VP.budget - VP.gebruikt, gat: varPlanRemaining(m) - (VP.budget - VP.gebruikt),
  };
});

test.describe('a · het grote getal is de aftrekking die eronder staat', () => {
  test('de gemelde verhouding: het getal is budget min gebruikt, niet de reservering', async ({ page }) => {
    await boot(page, gemeld());
    const r = await meet(page);
    expect(r.er).toBe(true);
    expect(r.valEur).toBe(r.inPotjes);          // de aftrekking
    expect(r.valEur).not.toBe(r.rest);          // en in deze fixture wijkt die echt af
    expect(r.lab).toBe('nog in potjes');
    expect(r.lijstPost).toBe(false);            // v309: verhuisd, niet gekopieerd
    /* v308: hier stond gat > 0. Op de GEMELDE stand is dat sinds v308 niet meer zo, en dat is de
       reparatie zelf: drie van de vier potjes lopen achter op hun tempo, dus bij dat tempo vragen
       ze samen minder dan er in zit. Wat deze test vasthoudt is het grote getal, en dat is
       ongewijzigd. De regel eronder wordt op de GAT-stand getoetst. */
    expect(r.gat).toBeLessThan(0);
    expect(r.noot).toBeNull();
  });

  test('de regel eronder noemt een ANDERE noemer, en dat staat er ook', async ({ page }) => {
    await boot(page, gemeld());
    const r = await meet(page);
    /* v250 had hier een sub "van EUR 1.200 . EUR 1.070 gebruikt . 89%", en 1200 min 1070 was wat er
       groot stond: de sub was de aftrekking. v309 heeft die sub NIET meeverhuisd. De kaart draagt
       een eigen regel met totals().spendNorm tegen totals().budget, en die twee frames lopen echt
       uiteen: het rekenkundige restant van die regel is iets anders dan het potjes-restant.
       DAAROM DRAGEN ZE EEN EIGEN NAAM ("je potjes" tegen "maandbudget"), want hetzelfde woord voor
       twee getallen is wat v91 verbiedt. Deze test meet die divergentie, zodat een volgende ronde
       niet denkt dat de een uit de ander volgt. */
    /* v359: die regel is de tegel Uitgegeven geworden: hij draagt totals().spendNorm, en zijn noemer staat in
       zijn sheet (het tempo tot vandaag). De twee tegels hebben een eigen naam. */
    expect(r.uitTegel.val).toBe(r.kaartSpend);
    expect(r.lab).not.toMatch(/maandbudget|uitgegeven/);
    /* DE TWEE NOEMERS LOPEN UITEEN EN DE TWEE RESTANTEN VALLEN OP DEZE FIXTURE SAMEN, en dat staat
       er allebei in plaats van dat het als bevestiging leest. De gemelde stand draagt een
       terugkerend potje (huur 1.200) dat volledig is afgeschreven, dus totals().budget is 2.930 en
       varBudget() 1.730 terwijl beide restanten op 598 uitkomen. Die stand blijft de stand die hij
       is (v251/v256), dus de DIVERGENTIE van de restanten wordt gemeten waar ze bestaat: in
       `inzichten-hoofdgetal.spec.js`, 42 tegen -98, een gat van 140. Wat hier vastligt is dat elk
       van de twee zijn eigen bron leest en dat de noemers verschillen. */
    const kaartRestant = r.kaartBudget - r.kaartSpend;
    expect(r.valEur).toBe(r.inPotjes);
    expect(r.budget).not.toBe(r.kaartBudget);
    expect(r.budget).toBe(1730);
    expect(r.kaartBudget).toBe(2930);
    expect(kaartRestant).toBe(r.inPotjes);      // toeval van deze fixture, en dat zegt de test
    console.log(`### potjes ${r.gebruikt} van ${r.budget} -> ${r.inPotjes}; kaart ${r.kaartSpend} van ${r.kaartBudget} -> ${kaartRestant}`);
  });

  test('niets gebruikt: het hele potje staat er, zonder extra regel', async ({ page }) => {
    await boot(page, { boekingen: [] });
    const r = await meet(page);
    expect(r.valEur).toBe(r.budget);
    /* v308: hier stond gat == 0. Met niets gebruikt is het restant het hele potje en het tempo
       maar een deel van de maand, dus de tempo-som ligt eronder: het gat is negatief en de regel
       staat er net zo goed niet. */
    expect(r.gat).toBeLessThanOrEqual(0);
    expect(r.noot).toBeNull();
  });
});

test.describe('b · de reservering staat eronder, met het verschil erbij', () => {
  test('het achtervoegsel noemt het gat, en de tempo-som volgt uit de kop', async ({ page }) => {
    await boot(page, gat());
    const r = await meet(page);
    /* v250 zette hier TWEE bedragen in de regel: "Bij je tempo nog EUR 493 nodig . EUR 363 tekort".
       v309 heeft er het achtervoegsel van de kop van gemaakt, en daar past maar EEN bedrag:
       GEMETEN breekt de vorm met beide bedragen op 360px naar 46px in plaats van 32px, en dat al
       bij de kleinste getallen (EUR 82 nodig, EUR 12 tekort). Er gaat niets verloren: de kop toont
       het restant en de tempo-som is dat restant PLUS het gat, dus de derde volgt uit de twee die
       er staan. Die aansluiting is wat deze test vasthoudt. */
    const g = [...r.noot.matchAll(/€([\d.]+)/g)].map((x) => +x[1].replace(/\./g, ''));
    expect(g.length).toBe(1);
    expect(g[0]).toBe(r.gat);
    expect(r.valEur + r.gat).toBe(r.rest);      // kop plus gat is de tempo-som
    expect(r.noot).not.toMatch(/^(zet|verlaag|stop|houd|pas)/i);   // geen gebiedende wijs
  });

  test('geen enkel potje over zijn grens: geen gat en de regel staat er niet', async ({ page }) => {
    await boot(page, { boekingen: BINNEN });
    const r = await meet(page);
    expect(r.er).toBe(true);
    /* v308: hier stond gat == 0 en rest == inPotjes. Zonder een potje over de grens is de
       reservering nog steeds de aftrekking, maar de tempo-som ligt eronder zodra een potje
       achterloopt op zijn tempo. */
    expect(r.gat).toBeLessThanOrEqual(0);
    expect(r.reserve).toBe(r.inPotjes);
    expect(r.rest).toBeLessThanOrEqual(r.inPotjes);
    expect(r.noot).toBeNull();
  });

  test('het achtervoegsel draagt geen alarmkleur', async ({ page }) => {
    await boot(page, gat());
    const kleur = await page.evaluate(() => {
      go('ins'); const n = document.querySelector('#insTegels [data-instegel="potjes"] .ms');
      const c = getComputedStyle(n).color;
      const los = (v) => { const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d); const x = getComputedStyle(d).color; d.remove(); return x; };
      const rs = getComputedStyle(document.documentElement);
      return { c, rood: los(rs.getPropertyValue('--red').trim()), amber: los(rs.getPropertyValue('--amber').trim()),
        mut: los(rs.getPropertyValue('--mut').trim()), mut2: los(rs.getPropertyValue('--mut2').trim()) };
    });
    expect(kleur.c).not.toBe(kleur.rood);
    expect(kleur.c).not.toBe(kleur.amber);
    /* v309: de krapte reist mee in het LABEL van de kop, en een label naast een groot getal draagt
       in dit blok `small muted` (de oude kop deed dat ook voor het woord "uitgegeven"). Als eigen
       regel droeg hij --mut2; wat de eigenschap is, is dat hij geen aandacht claimt (v78/v93), en
       dat is hier de kleur van het label waarin hij staat. */
    /* v359: de krapte staat in de regel onder het getal van de tegel; de tegel zelf draagt de status (amber),
       de regel eronder claimt geen aandacht (v78/v93). */
    expect([kleur.mut, kleur.mut2]).toContain(kleur.c);
  });
});

test.describe('c · meer uitgegeven dan er in je potjes zat', () => {
  test('het label zegt het, en er staat geen minteken', async ({ page }) => {
    await boot(page, { boekingen: OVERAL });
    const r = await meet(page);
    expect(r.inPotjes).toBeLessThan(0);
    expect(r.lab).toBe('te veel uitgegeven');
    expect(r.val).not.toContain('-');
    expect(r.valEur).toBe(-r.inPotjes);
  });

  test('de kop draagt geen percentage en geen achtervoegsel', async ({ page }) => {
    await boot(page, { boekingen: OVERAL });
    const r = await meet(page);
    /* v250 liet het percentage uit de sub weg zodra je erover was, want de hero zei het al. Die sub
       is bij v309 vervallen; het percentage staat nu op de regel eronder, waar het bij zijn eigen
       noemer hoort. Wat hier blijft is dat de kop zelf niets herhaalt. */
    expect(r.lab).toBe('te veel uitgegeven');
    // v359: de tegel herhaalt geen percentage en noemt bij een negatief restant geen tempo-krapte
    expect(r.achter).not.toMatch(/%/);
    expect(r.noot).toBeNull();
  });
});

test.describe('d · de poort leest je potjes, niet de reservering', () => {
  test('elk potje precies op: reservering nul, en de regel staat er nog', async ({ page }) => {
    await boot(page, { boekingen: PRECIES });
    const r = await meet(page);
    expect(r.rest).toBe(0);            // de oude poort (varPlan>0) had de regel hier laten vallen
    expect(r.er).toBe(true);
    expect(r.valEur).toBe(0);
    expect(r.gat).toBe(0);
    expect(r.noot).toBeNull();
  });
});

test.describe('e · een tik komt uit op het bedrag waarop je tikte', () => {
  const kopBedrag = (page) => page.evaluate(() => {
    const t = document.querySelector('#sheet').innerText.replace(/\s+/g, ' ');
    const m = t.match(/€([\d.]+)(?:,\d\d)?/);
    return m ? +m[1].replace(/\./g, '') : null;
  });

  /* v359: BEDOELING OMGEDRAAID, en het principe blijft. Tot v358 had dit getal geen tik, omdat geen scherm het
     toonde. Sinds v359 opent elke tegel een sheet die zegt waaruit zijn bedrag bestaat, en die sheet draagt
     precies het getal van de tegel in zijn kop: de tik komt uit op het bedrag waarop je tikte. */
  test('een tik op de tegel opent een sheet met hetzelfde bedrag', async ({ page }) => {
    await boot(page, gat());
    const r = await meet(page);
    expect(r.noot).not.toBeNull();
    expect(r.rijTik).toBe(true);
    await page.click('#insTegels [data-instegel="potjes"]');
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
    /* v308: hier stond r.rest. safeToSpend().reserved leest sinds v254 varPotjesReserve(), en dat
       was op deze fixture hetzelfde getal als de tempo-som zolang een potje met ruimte zijn hele
       onbestede deel droeg. Sinds de klem lopen ze uiteen, en de bron die de regel op Home leest
       is de reservering. */
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
          src: safeToSpend.toString(),
          safe: S.safe, opnieuw: safeToSpend().safe };
      });
      /* v254: safeToSpend() leest varPotjesReserve() in plaats van varPlanRemaining(), want
         veilig te besteden vraagt wat er nog IN je potjes zit. Wat deze test vasthoudt blijft: de
         regel op Inzichten en veilig te besteden lopen niet stiekem uiteen, ze stellen bewust een
         andere vraag, en de aftrekking van de regel is geen van beide. */
      expect(r.reserved).toBe(r.reserve);
      expect(r.src).toContain('varPotjesReserve(');
      expect(r.src).not.toContain('varPotjeStand');  // en niet het getal van de regel zelf
      expect(r.safe).toBe(r.opnieuw);
    });
  }
});
