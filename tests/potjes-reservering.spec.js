// v254: een potje dat op is reserveert nul.
//
// GEMELD: de sheet "Gereserveerd in je potjes" zegt boven de lijst "budget dat je per categorie
// apart zette · nog niet uitgegeven", terwijl drie van de zes posten potjes waren die op zijn:
// Overig €598 van €500 telde voor €133, Uit eten €249 van €55 voor €15, Vices €56 van €20 voor €5.
// Samen €153 die als opzijgezet budget meetelde terwijl er niets meer in zat, en die ging af van
// veilig te besteden. Dat is het dagtempo maal de resterende dagen (potjeRest, v111): een prognose,
// geen reservering.
//
// TWEE VRAGEN, TWEE FUNCTIES. Inzichten vraagt wat je bij je tempo nog uitgeeft en leest
// varPlanRemaining(); de sheet en veilig te besteden vragen wat er nog IN je potjes zit en lezen
// varPotjesReserve(). potjeRest() zelf is onaangeroerd, want beide lezers hierboven bestaan nog.
//
// DE PROGNOSE VERDWIJNT NIET, maar is geen aftrekking meer: hij staat als eigen regel onder de
// lijst, en alleen als er een leeg potje is.
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

/* De gemelde toestand: zes variabele potjes, drie ervan op. De reserves van die drie waren op dag 22
   van een maand van 30 dagen precies 133, 15 en 5, samen de gemelde 153; het sheet-totaal was 1.063
   en wordt 910. Huur en abonnement staan er als terugkerende potjes naast, want die horen in geen
   van beide sommen thuis en dat toetsen we hieronder.
   DIE DRIE BEDRAGEN STAAN HIER ALS HERKOMST EN NIET ALS ASSERTIE: ze hangen aan de dag van de
   maand, en sinds v306 pint deze spec die dag op zeven dagen over. Wat de tests lezen komt live
   uit de app. */
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '03', -30, 'Netflix', 'SEPA INCASSO NETFLIX ABONNEMENT');
  }
  for (const b of (o.boekingen || [])) add(b[0], CUR, b[1], b[2], b[3], b[4]);
  const set = Object.assign({
    /* v305: de ondergrens is sinds v305 een KEUZE en heeft geen default meer, dus de fixture kiest
       hem hier. Deze spec is geschreven toen drie maanden een vaste grens was; dat getal staat nu
       waar het thuishoort, in de gegevens van de gebruiker. */
    bufferNorm: 3,
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000 }, savingMode: 'amount', savingAmount: 0,
    budgets: o.budgets || { overig: 500, uiteten: 55, vices: 20, boodschappen: 500, vervoer: 300,
      sport: 240, huur: 900, abonnement: 30 },
    budgetMonth: CUR,
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
// drie potjes eroverheen: overig 598/500, uiteten 249/55, vices 56/20
const DRIE_OP = [['o1', '04', -598, 'Blokker', 'BEA, BETAALPAS BLOKKER'],
  ['u1', '06', -249, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT'],
  ['v1', '07', -56, 'Slijterij', 'BEA, BETAALPAS SLIJTERIJ'],
  ['b1', '08', -90, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['c1', '09', -40, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION']];
// dezelfde potjes, niets eroverheen
const GEEN_OP = [['o1', '04', -100, 'Blokker', 'BEA, BETAALPAS BLOKKER'],
  ['u1', '06', -20, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT'],
  ['b1', '08', -90, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['c1', '09', -40, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION']];

async function boot(page, bk) {
  await pinDag(page);                      // v306: vóór de goto, anders leest de boot de echte klok
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed({ boekingen: bk }));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof varPotjesReserve === 'function');
}
const eur = (t) => Math.round(parseFloat(String(t).replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.')) || 0);
// de sheet zoals hij op het scherm staat, plus de bronnen waar hij uit hoort te komen
const meet = (page) => page.evaluate(() => {
  const m = curMonth || months()[months().length - 1];
  const S = safeToSpend(), VP = varPotjeStand(m);
  openReservedPotjes();
  const sh = document.querySelector('#sheet');
  const num = (t) => Math.round(parseFloat(String(t).replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.')) || 0);
  return {
    kop: num(sh.querySelector('.center div:last-child').innerText),
    rijen: [...sh.querySelectorAll('.tx.res-rij')].map((x) => ({
      nm: x.querySelector('.nm').innerText,
      bedrag: num(x.querySelector('.amt').innerText),
      sub: x.querySelector('.cat').innerText.replace(/\s+/g, ' '),
      afgekapt: x.querySelector('.cat').scrollWidth > x.querySelector('.cat').clientWidth + 1 })),
    prognose: [...sh.querySelectorAll('.small')].map((x) => x.innerText).find((t) => /bij je tempo/i.test(t)) || null,
    reserve: varPotjesReserve(m), plan: varPlanRemaining(m),
    reserved: Math.round(S.reserved), safe: S.safe, potOver: S.potOver,
    inPotjes: VP.budget - VP.gebruikt,
    /* v308: de tempo-som van de LEGE potjes apart, uit dezelfde poort en dezelfde potjeRest() als
       de sheet zelf. Tot v308 was dit getal gelijk aan plan min reserve, want een potje MET ruimte
       droeg in beide sommen hetzelfde bedrag; sinds de klem op de resterende dagen is dat niet meer
       zo en is die aftrekking dus niet langer de tempo-som van de lege potjes. */
    tempoOp: (function(){ const B=SET.budgets||{}, rc=recurringCats(), sp=catSpendMap(m);
      const d=daysElapsed(m), left=Math.max(d.dim-d.elapsed,0); let v=0;
      for(const k in B){ const bud=+B[k]||0; if(bud<=0||rc.has(k)) continue;
        if((sp[k]||0)>bud) v+=potjeRest(bud, sp[k]||0, d.dim, left); }
      return Math.round(v); })(),
  };
});

test.describe('a · de gemelde toestand: drie lege potjes', () => {
  /* HET VERSCHIL HANGT AAN DE DAG VAN DE MAAND en staat daarom niet als getal in deze tests.
     potjeRest() is bud/dim maal de RESTERENDE dagen (v111), dus de tempo-som krimpt elke dag: op
     dag 22 van een maand van 30 was het gemelde verschil €153, op dag 23 is het €135. Op de
     LAATSTE dag is hij nul, en dan valt er niets te verschillen; dat is de dag waarop deze twee
     tests tot v306 rood stonden en waarom de pin er sinds v306 staat. Tot v255
     stond die 153 hier drie keer hardgecodeerd terwijl alles eromheen live werd gelezen, en de
     suite viel om zodra de kalender een dag verder stond. Dezelfde vorm als de fixture-regel in
     CLAUDE.md, alleen niet op een bedrag van het toestel maar op een afgeleide van vandaag.
     WAT WEL VASTSTAAT is de identiteit: het verschil tussen de twee sommen is precies het bedrag
     waarmee veilig te besteden ruimer werd, en precies wat de prognoseregel noemt. Die wordt hier
     getoetst, met de eis dat hij boven nul ligt zodat de test niet leegloopt op een dag waarop er
     niets te verschillen valt. */
  /* v308: DIT HEETTE "...wordt met het hele verschil ruimer", en die richting hing aan de oude
     potjeRest(): een potje MET ruimte droeg in beide sommen hetzelfde bedrag, dus plan min reserve
     was precies de tempo-som van de lege potjes en dus positief. Met de klem dragen de volle
     potjes in de tempo-som MINDER, en dan kan die aftrekking ook negatief zijn (in deze fixture is
     hij dat). Wat vastligt is de IDENTITEIT en niet de richting: veilig te besteden verschilt met
     precies het bedrag waarmee de twee sommen verschillen. Dat de drie lege potjes nul dragen en
     dat de kop de reservering is, verandert niet: de klem raakt alleen potjes MET ruimte. */
  test('de drie dragen nul, en veilig te besteden verschilt met precies het verschil', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    const op = r.rijen.filter((x) => /potje op/.test(x.sub));
    expect(op.length).toBe(3);
    for (const x of op) expect(x.bedrag).toBe(0);
    // de tempo-som is wat de sheet vroeger in zijn kop zette; het verschil is wat dat kostte
    const verschil = r.plan - r.reserve;
    expect(verschil, 'de twee sommen meten in deze fixture hetzelfde, dus de test loopt leeg').not.toBe(0);
    expect(r.kop).toBe(r.reserve);
    /* en veilig te besteden is met precies datzelfde bedrag ruimer geworden. safe trekt de
       reservering af, dus safe met de oude bron is safe min het verschil tussen de twee sommen. */
    const oud = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      return safeToSpend().safe - (varPlanRemaining(m) - varPotjesReserve(m));
    });
    expect(r.safe - oud).toBe(verschil);
  });

  test('het totaal in de kop is de som van de posten eronder', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    expect(r.rijen.reduce((a, x) => a + x.bedrag, 0)).toBe(r.kop);
    expect(r.kop).toBe(r.reserved);          // en hetzelfde getal als in de opbouw van veilig te besteden
  });

  test('een leeg potje staat in de lijst, met nul en met zijn besteding', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    const o = r.rijen.find((x) => /Overig/.test(x.nm));
    expect(o.bedrag).toBe(0);
    expect(o.sub).toContain('€598 van €500 gebruikt');
    expect(o.sub).toContain('potje op');
    expect(o.sub).toContain('aanpassen');
  });

  test('de prognoseregel staat onder de lijst en telt nergens in mee', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    /* v308: het getal in de zin is de tempo-som van de potjes die AL OP ZIJN, en dat is wat
       openReservedPotjes() optelt. Tot v308 stond hier plan min reserve, en die aftrekking was
       hetzelfde getal zolang een potje met ruimte in beide sommen gelijk meedeed; dat is met de
       klem niet meer waar, en het anker hoort dus bij de bron van de zin en niet bij een identiteit
       die er per ongeluk mee samenviel. */
    expect(r.tempoOp).toBeGreaterThan(0);
    /* euro0() is app-code en bestaat hier niet, dus de zin wordt op zijn vorm getoetst en het
       bedrag erin op zijn waarde. Dat is ook het juiste anker: wat vaststaat is dat het getal in
       de zin de tempo-som van de lege potjes is, niet hoe het is opgemaakt. */
    expect(r.prognose).toMatch(/^Bij je tempo verwacht je deze maand nog €[\d.]+ uit te geven in potjes die al op zijn\.$/);
    expect(eur(/nog (€[\d.]+) uit te geven/.exec(r.prognose)[1])).toBe(r.tempoOp);
    /* en hij telt nergens in mee: niet in de kop (die is de reservering, niet de reservering plus
       de prognose) en niet als eigen post in de lijst. Tot v255 stond hier r.kop !== r.kop + 153,
       en dat is waar voor elk getal behalve nul, dus die assert kon niet vallen. */
    expect(r.kop).toBe(r.reserve);
    expect(r.kop).not.toBe(r.reserve + r.tempoOp);
    expect(r.rijen.some((x) => x.bedrag === r.tempoOp)).toBe(false);
  });
});

test.describe('b · geen enkel potje leeg', () => {
  test('totaal en veilig te besteden ongewijzigd, en geen prognoseregel', async ({ page }) => {
    await boot(page, GEEN_OP);
    const r = await meet(page);
    /* v308: hier stond "zonder leeg potje meten de twee hetzelfde". Dat gold zolang een potje met
       ruimte zijn hele onbestede deel in de tempo-som droeg; met de klem draagt het er hoogstens
       zijn tempo, dus de tempo-som ligt eronder. Wat zonder leeg potje wel vast blijft: de
       reservering IS de aftrekking, er is niets over de grens, en er is geen prognoseregel. */
    expect(r.reserve).toBe(r.inPotjes);
    expect(r.plan).toBeLessThanOrEqual(r.reserve);
    expect(r.tempoOp).toBe(0);
    expect(r.kop).toBe(r.reserve);
    expect(r.potOver).toBe(0);
    expect(r.prognose).toBeNull();
  });
});

test.describe('c · de twee functies naast elkaar', () => {
  test('dezelfde poort: terugkerende potjes tellen in geen van beide mee', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const B = SET.budgets || {}, rc = recurringCats(), sp = catSpendMap(m);
      let handReserve = 0, handPlan = 0;
      const d = daysElapsed(m), left = Math.max(d.dim - d.elapsed, 0);
      for (const k in B) { const bud = +B[k] || 0; if (bud <= 0 || rc.has(k)) continue;
        handReserve += Math.max(bud - (sp[k] || 0), 0); handPlan += potjeRest(bud, sp[k] || 0, d.dim, left); }
      openReservedPotjes();
      const namen = [...document.querySelectorAll('#sheet .tx.res-rij .nm')].map((x) => x.innerText);
      return { rc: [...rc], namen, reserve: varPotjesReserve(m), plan: varPlanRemaining(m),
        handReserve: Math.round(handReserve), handPlan: Math.round(handPlan) };
    });
    expect(r.rc).toContain('huur');
    expect(r.rc).toContain('abonnement');
    expect(r.namen.join(' ')).not.toMatch(/Huur|Abonnement/);
    expect(r.reserve).toBe(r.handReserve);
    expect(r.plan).toBe(r.handPlan);
  });

  /* De identiteit die de twee verbindt: wat er nog in je potjes zit is de aftrekking van de regel
     op Inzichten plus wat je over je potjes ging. Geen derde som. */
  test('varPotjesReserve is de aftrekking plus potOver', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    expect(r.reserve).toBe(r.inPotjes + r.potOver);
    expect(r.reserved).toBe(r.reserve);
  });

  /* v308: dit heette "potjeRest is onaangeroerd". Hij is wel aangeroerd: zijn tak voor een potje
     MET ruimte klemt sinds v308 op het geplande dagtempo maal de resterende dagen. Wat deze test
     vasthoudt is wat hij altijd moest vasthouden, namelijk WIE hem leest. */
  test('potjeRest klemt op de resterende dagen, en houdt zijn twee lezers', async ({ page }) => {
    await boot(page, DRIE_OP);
    /* De bron zonder commentaar: een naam die alleen in een comment staat is geen lezer, en dit
       bestand legt juist in commentaar uit welke functie waar gebleven is. */
    const r = await page.evaluate(() => {
      const kaal = (f) => f.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      return { rest: kaal(potjeRest).replace(/\s+/g, ' '),
        plan: kaal(varPlanRemaining), reserve: kaal(varPotjesReserve),
        sheet: kaal(openReservedPotjes), safe: kaal(safeToSpend) };
    });
    // beide takken rekenen met dezelfde resterende dagen, en de tak met ruimte klemt erop
    expect(r.rest).toContain('const tempo=Math.round(bud/Math.max(dim,1)*Math.max(daysLeft,0));');
    expect(r.rest).toContain('return Math.min(bud-uitgegeven, tempo);');
    expect(r.plan).toContain('potjeRest(');          // de tempo-som leest hem nog
    expect(r.sheet).toContain('potjeRest(');         // en de prognoseregel onder de sheet ook
    expect(r.reserve).not.toContain('potjeRest(');   // de reservering niet
    expect(r.safe).toContain('varPotjesReserve(');
    expect(r.safe).not.toContain('varPlanRemaining(');
  });
});

test.describe('d · de subregel raakt zijn aanpassen niet meer kwijt', () => {
  test('geen enkele rij kapt af, ook niet de rijen met uitleg', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    for (const x of r.rijen) {
      expect(x.afgekapt, x.sub).toBe(false);
      expect(x.sub).toContain('aanpassen');
    }
  });

  for (const breedte of [360, 390]) {
    test(`op ${breedte}px past aanpassen op elke rij, en de rij blijft laag`, async ({ page }) => {
      await pinDag(page);
      await page.setViewportSize({ width: breedte, height: 800 });
      await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed({ boekingen: DRIE_OP }));
      await page.goto('/index.html');
      await page.waitForFunction(() => typeof openReservedPotjes === 'function');
      const r = await page.evaluate(() => {
        openReservedPotjes();
        return [...document.querySelectorAll('#sheet .tx.res-rij')].map((x) => ({
          h: Math.round(x.getBoundingClientRect().height),
          op: /potje op/.test(x.querySelector('.cat').innerText),
          afgekapt: x.querySelector('.cat').scrollWidth > x.querySelector('.cat').clientWidth + 1 }));
      });
      for (const x of r) expect(x.afgekapt).toBe(false);
      // een rij met uitleg wordt hoger, maar blijft binnen twee regels sub
      for (const x of r) expect(x.h).toBeLessThanOrEqual(x.op ? 90 : 70);
    });
  }
});

test.describe('e · de sheet blijft bereikbaar', () => {
  test('ook als al je potjes op zijn staat de regel op Home er, met nul', async ({ page }) => {
    await boot(page, [['o1', '04', -598, 'Blokker', 'BEA, BETAALPAS BLOKKER'],
      ['u1', '06', -249, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT'],
      ['v1', '07', -56, 'Slijterij', 'BEA, BETAALPAS SLIJTERIJ'],
      ['b1', '08', -900, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
      ['c1', '09', -400, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION'],
      ['s1', '10', -300, 'Fitness', 'BEA, BETAALPAS FITNESS']]);
    const r = await page.evaluate(() => {
      const S = safeToSpend();
      go('dash'); openSafeToSpend();
      const el = [...document.querySelectorAll('#sheet [onclick]')]
        .find((x) => /gereserveerd in je potjes/i.test(x.innerText));
      return { reserved: Math.round(S.reserved), er: !!el,
        tekst: el ? el.innerText.replace(/\s+/g, ' ') : '' };
    });
    expect(r.reserved).toBe(0);
    expect(r.er).toBe(true);                       // de enige route naar de sheet blijft staan
    expect(r.tekst).toMatch(/je potjes zijn op/);
  });
});
