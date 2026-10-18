// v225: Plan legde de waterval uit in drie zinnen boven een lijst losse kaarten, en toonde hem
// nergens. Deze spec bewaakt de vorm die daarvoor in de plaats komt: één kaart met bovenaan het te
// verdelen bedrag, daaronder de bestemmingen genummerd in de volgorde waarin ze bediend worden, en
// onderaan wat er overblijft - ook als dat nul is.
// Wat hier NIET wordt getoetst is de verdeling zelf: allocatePlan() en planCapacity() zijn deze
// ronde niet aangeraakt, en hun eigen specs (plan-doorzakken, verdeelmodus) blijven de bron.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, SPAAR_SALDO } = require('./budget-fixture');

const CAP = 500;   // savingMode 'amount' -> monthlySavingTarget()

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.savingAmount = CAP;
  set.vooruitDoelOpen = true;
  /* v242: de grendel. Zolang het noodfonds niet vol is gaat de hele spaarinleg daarheen en valt er
     niets te verdelen. Deze spec gaat over de verdeling zelf, dus de buffer staat hier vol en de
     grendel open. Dat is de voorwaarde die er altijd al impliciet was; nu staat hij er. */
  set.nfToegewezen = 9e7; set.nfToegewezenMigrated = true;   // planMap klemt op het doel
  /* v380: toegewezen zonder geld telt niet als vol (spaarOver().zonder>0 zonder keuze): vanaf volgende maand vult de
     inleg het aan, en dan sluit de grendel in de projectie. Met de klem op het doel van 4.880 tegen een saldo van 2.500
     was deze buffer dus niet meer vol, en met het noodfonds gepauzeerd kreeg daarna niets meer iets (planVooruit()
     gaf geen enkele vol-datum en planTerugval() geen overdracht). Deze spec bedoelt een volle buffer met geld erachter,
     dus het doel ligt op het saldo van de spaarrekening. */
  set.nfDoelVast = SPAAR_SALDO;
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

// Het noodfonds staat standaard op 'auto' en zou als enige lopende item alles opslokken. In de
// scenario's hieronder zetten we het stil, tenzij het juist de blokkeerder moet zijn.
const metDoelen = (goals, extra) => tweak((s) => {
  s.goals = goals;
  s.planOrder = goals.map((g) => g.id).concat(['noodfonds']);
  s.planPaused = { noodfonds: true };
  if (extra) extra(s);
});

async function openV(page, payload) {
  await open(page, payload);
  await page.evaluate(() => go('vooruit'));
  await page.waitForSelector('#s-vooruit .card');
}
/* v380: PLAN IS EEN DASHBOARD. Een bestemming is een rij `.plan-item.plan-rij2[data-id]` in #planLijst, met het
   nummer in [data-rijnr] en ALLEEN de naam in [data-rijnaam] (`.wf-naam`). De kop "Te verdelen", de inlegbalk, het
   maandbedrag "/mnd" op de rij en de open rij met knoppen ([data-acties]) zijn vervallen; het datumpaar van
   vatRegels() en de handelingen staan in de detailsheet (openPlanDoel(id), #planDoelSheet). */
const rijen = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#s-vooruit .plan-item[data-id]')]
    .map((x) => ({ id: x.dataset.id, tekst: x.innerText.replace(/\s+/g, ' '),
      nr: ((x.querySelector('[data-rijnr]') || {}).innerText || '').trim(),
      naam: ((x.querySelector('.wf-naam') || {}).innerText || '').replace(/\s+/g, ' ').trim() })));
/* het datumpaar (vatRegels(p,false)) staat in de detailsheet van een doel */
const detail = (page, id) => page.evaluate((i) => {
  openPlanDoel(i);
  const sh = document.getElementById('planDoelSheet');
  const d = sh && sh.querySelector('[data-plandetail]');
  const inleg = sh && sh.querySelector('[data-op="inleg"]');
  return { doel: sh ? sh.dataset.doel : null, dat: d ? d.innerText.replace(/\s+/g, ' ').trim() : '',
    inleg: inleg ? +inleg.dataset.bedrag : null, tekst: sh ? sh.innerText.replace(/\s+/g, ' ') : '' };
}, id);
const scherm = (page) => page.locator('#s-vooruit').innerText();

/* ---------------------------------------------------------------------------------------- */

test.describe('a · de kaart toont het mechanisme', () => {
  test('de kop bovenaan, bestemmingen genummerd in de volgorde van de waterval', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 200 },
      { id: 'gB', naam: 'Vakantie', doel: 3000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
    ]));
    const R = await rijen(page);
    expect(R.map((x) => x.id)).toEqual(['gA', 'gB', 'noodfonds']);
    // de nummers volgen de volgorde van de waterval, niet de naam of het bedrag
    /* v380: het nummer staat in een eigen element, de naam draagt het niet meer */
    for (let i = 0; i < R.length; i++) { expect(R[i].nr).toBe(String(i + 1)); expect(R[i].naam).not.toMatch(/^\d/); }
    expect(R[0].naam).toBe('Kosten koper');
    /* v380: de kop "Te verdelen" is vervallen; bovenaan staat de kop #planKpi, en die staat voor de lijst */
    const r = await page.evaluate(() => {
      const k = document.getElementById('planKpi'), l = document.getElementById('planLijst');
      return { kop: !!k, lijst: !!l, voor: !!(k && l && (k.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)),
        teVerdelen: /Te verdelen/.test(document.getElementById('s-vooruit').innerText) };
    });
    expect(r).toEqual({ kop: true, lijst: true, voor: true, teVerdelen: false });
  });

  /* v380: de inlegbalk met een segment per bestemming is vervallen (planSegmenten() bestaat niet meer). De eigenschap
     dat de hele inleg verdeeld wordt en niets eruit valt staat nu in de kop: "Deze maand opzij" is de inleg plus wat
     er terug gaat, hier zonder terugzetten dus planCapacity(), en planToeMaand() telt dezelfde verdeling op. */
  test('wat deze maand verdeeld wordt is planCapacity, en er staat geen inlegbalk meer', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 200 }]));
    const r = await page.evaluate(() => ({ cap: planCapacity(), toe: planToeMaand(),
      kop: (document.querySelector('[data-kpiopzijperiode]') || {}).innerText || '',   // v440: de kop toont "Opzij deze periode" (opzijPeriode), geen inlegbalk
      balk: document.querySelectorAll('#s-vooruit .inleg-balk, #s-vooruit [data-seg]').length }));
    expect(r.cap).toBe(CAP);
    expect(r.toe).toEqual({ toegewezen: CAP, teVerdelen: CAP });   // planToeMaand verdeelt de hele capaciteit
    expect(r.kop.replace(/\s+/g, ' ')).toContain('Opzij deze periode');
    expect(r.balk).toBe(0);
  });

  /* v380: geen maandbedrag "/mnd" en geen "toegewezen" meer op de rij. Wat de bestemming deze maand krijgt staat in
     de grijze regel ("+EUR X deze maand", de inleg uit planStandEind()), en waar hij staat links als "EUR geld / EUR doel". */
  test('elke rij noemt wat er deze maand bijkomt en waar hij staat', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 1500, allocMode: 'fixed', perMaand: 200 }]));
    const r = await page.evaluate(() => {
      const e = document.querySelector('#s-vooruit .plan-item[data-id="gA"]');
      const x = planStandEind().per.gA, p = allocatePlan().find((y) => y.id === 'gA');
      return { naam: e.querySelector('[data-rijnaam]').innerText.trim(), sub: e.querySelector('[data-rijsub]').innerText.trim(),
        geld: e.querySelector('[data-rijgeld]').innerText.replace(/\s+/g, ' ').trim(), heel: e.innerText,
        alloc: p.alloc, inleg: x.inleg, tb: x.tb, verwachtGeld: euro0(x.geld) + ' / ' + euro0(9000), bij: euro0(x.inleg + x.tb) };
    });
    expect(r.naam).toBe('Kosten koper');
    // wat deze bestemming per maand krijgt: het bedrag uit de waterval, niet het ingestelde
    expect(r.inleg).toBe(r.alloc);
    expect(r.alloc).toBeGreaterThan(0);
    expect(r.sub).toBe(`+${r.bij} deze maand`);
    expect(r.geld).toBe(r.verwachtGeld);
    expect(r.heel).not.toMatch(/\/mnd|toegewezen/);
  });
});

test.describe('b · de sluitpost staat er alleen als er iets overblijft', () => {
  test('met vrije ruimte: het bedrag en een keuze', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Bijna klaar', doel: 300, gespaard: 200, allocMode: 'auto' }]));
    const t = await page.locator('#planVrij').innerText();
    expect(t).toMatch(/Blijft over/);
    expect(t).toContain(await page.evaluate(() => euro0(planVrij())));
    expect(await page.evaluate(() => planVrij())).toBeGreaterThan(0);
    expect(t).toMatch(/voeg een doel toe/i);
  });

  /* v380: "Blijft over EUR 0" is bewust vervallen; de regel staat er alleen nog als er iets overblijft. Dat de regel
     bij vrije ruimte wel staat toetst de test hierboven, dus de tegenproef houdt hier de poort vast. */
  test('zonder vrije ruimte: geen regel, ook niet met EUR 0', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Slokop', doel: 90000, gespaard: 0, allocMode: 'auto' }]));
    expect(await page.evaluate(() => planVrij())).toBe(0);
    expect(await page.locator('#planVrij').count()).toBe(0);
    expect(await scherm(page)).not.toMatch(/Blijft over/);
  });
});

test.describe('c · een wachtende bestemming noemt waarop, en nooit wanneer', () => {
  const metBlokkeerder = () => metDoelen([
    { id: 'gA', naam: 'Vakantie', doel: 90000, gespaard: 0, allocMode: 'auto' },
    /* v373: geen eigen modus meer; op volgorde pakt Vakantie de hele inleg en wacht de fiets daarop */
    { id: 'gB', naam: 'Nieuwe fiets', doel: 900, gespaard: 0 },
  ]);

  test('de detailsheet noemt de bestemming die het geld pakt', async ({ page }) => {
    await openV(page, metBlokkeerder());
    expect(await page.evaluate(() => allocatePlan().find((x) => x.id === 'gB').status)).toBe('wacht op capaciteit');
    /* v380: het datumpaar staat in de detailsheet ([data-plandetail]) en niet meer onder de open rij */
    const d = await detail(page, 'gB');
    expect(d.doel).toBe('gB');
    expect(d.dat).toMatch(/Wacht op .Vakantie./);
    /* v380: het maandbedrag "/mnd" is van de rij; de NUL staat als inleg deze maand in de rekensom, en dat is een
       meting en geen leegte (v59/v73/v173) */
    expect(d.inleg).toBe(0);
    expect(await page.locator('#planDoelSheet [data-op="inleg"]').innerText()).toMatch(/€0/);
  });

  /* Wanneer een wachtende bestemming ZELF vol is hangt af van keuzes die nog niet gemaakt zijn, dus
     daar komt in het datumpaar geen datum (v59/v73/v173).
     v317: EEN GEMETEN OVERDRACHT IS EEN ANDERE BEWERING, en die mag wel een maand noemen; zie de test
     hieronder. De assertie leest daarom het datumpaar en niet de hele rij of sheet. */
  test('en nooit zijn eigen vol-datum of tempo', async ({ page }) => {
    await openV(page, metBlokkeerder());
    const d = await detail(page, 'gB');
    expect(d.dat).not.toBe('');
    expect(d.dat).not.toMatch(/20\d\d/);
    expect(d.dat).not.toMatch(/rond |over \d+ maanden|op dit tempo|vol in/);
  });

  /* v317: en de terugval-regel staat er wel, met de maand en de naam van de blokkeerder. */
  test('maar wel vanaf wanneer de ruimte van zijn blokkeerder hierheen gaat', async ({ page }) => {
    await openV(page, metBlokkeerder());
    // de invoer draagt het geval: de projectie kent een vol-datum voor de blokkeerder
    expect(await page.evaluate(() => planVooruit(allocatePlan(), planCapacity()).gA)).toBeGreaterThan(0);
    await page.evaluate(() => openPlanTijdlijn());   // v367: de terugval staat in de tijdlijn
    const erf = page.locator('#planTijdlijn [data-erfregel][data-erfnaar="gB"]');
    expect(await erf.count()).toBe(1);
    expect(await erf.innerText()).toMatch(/^vanaf \w+ \d{4} gaat de ruimte van /);
    // en de maand komt uit de projectie en niet uit een eigen telling
    const e = await page.evaluate(() => planTerugval().find((x) => x.naar === 'gB'));
    expect(await erf.innerText()).toContain(await page.evaluate((m) => etaDatum(m), e.vanaf));
  });

  test('zonder blokkeerder blijft het bij de status', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Slokop', doel: 90000, gespaard: 0, allocMode: 'fixed', perMaand: 500 },
      { id: 'gB', naam: 'Nieuwe fiets', doel: 900, gespaard: 0, allocMode: 'pct' },   // pct zonder waarde
    ]));
    expect(await page.evaluate(() => allocatePlan().find((x) => x.id === 'gB').blokkeerder)).toBeFalsy();
    const d = await detail(page, 'gB');
    expect(d.dat).toMatch(/Wacht op capaciteit/i);
  });
});

test.describe('d · de uitleg staat achter het uitlegteken, de melding niet', () => {
  test('de drie zinnen staan niet meer als tekst op het scherm', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 200 }]));
    const t = await scherm(page);
    expect(t).not.toMatch(/gaat van boven naar beneden/);
    expect(t).not.toMatch(/Zet met/);
    expect(t).not.toMatch(/Dit is een verdeling per maand/);
    expect(t).not.toMatch(/pakt nu alles wat er overblijft/);
  });

  /* v380: NIET AANGEPAST. renderPlan() zet NOTES.planUitleg (met de zin "gaat van boven naar beneden") maar rendert
     nergens een noteIcon('planUitleg'), dus de uitleg is niet meer te openen. Gemeld als vermoedelijke app-bug. */
  test('een tik op het uitlegteken toont ze alsnog', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 200 }]));
    await page.locator('#s-vooruit [onclick*="planUitleg"]').first().click();
    await page.waitForSelector('#tipPop.show');
    expect(await page.locator('#tipPop').innerText()).toMatch(/gaat van boven naar beneden/);
  });

  /* Een amber-melding achter een uitlegteken is geen melding meer: die blijft staan waar hij stond
     (v78/v93). De neutrale uitleg eromheen is wél vervallen. */
  test('de overtoewijzing blijft zichtbaar, zonder tik', async ({ page }) => {
    /* v373: een overtoewijzing ontstaat nu als een zelf verdeelde verdeling meer claimt dan de inleg */
    await openV(page, metDoelen([
      { id: 'gA', naam: 'A', doel: 9000, gespaard: 0 },
      { id: 'gB', naam: 'B', doel: 9000, gespaard: 0 },
    ], (s) => { s.planVerdeling = { modus: 'zelf', bedragen: { gA: 400, gB: 400 }, bijVol: 'volgende' }; s.planVerdelingV373 = 1; }));
    expect(await page.evaluate(() => !!planAllocWarning())).toBe(true);
    const w = page.locator('#planWacht');
    await expect(w).toHaveCount(1);
    expect(await w.innerText()).toMatch(/terwijl er/);
    expect(await page.evaluate(() => /amber|251,191,36/.test(document.getElementById('planWacht').outerHTML))).toBe(true);
  });
});

test.describe('e · de volgorde blijft de hoofdhandeling', () => {
  const twee = () => metDoelen([
    { id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 200 },
    { id: 'gB', naam: 'Vakantie', doel: 3000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
  ]);

  /* v317: hier stond dat de twee pijltjes er zonder tik staan. Die zijn van het scherm; wat de
     eigenschap nog steeds moet vasthouden is dat een rij ZONDER tik geen keuzes toont. */
  test('een rij zonder tik toont geen knoppen, en de pijlen zijn er niet meer', async ({ page }) => {
    await openV(page, twee());
    expect(await page.locator('#s-vooruit .plan-mv').count()).toBe(0);
    expect(await page.locator('#s-vooruit [data-acties]').count()).toBe(0);
    expect(await page.locator('#s-vooruit [data-doelpauze], #s-vooruit [data-doelaanpassen]').count()).toBe(0);
  });

  /* v380: de open rij met knoppen ([data-acties], window._planRij) is vervallen; een tik op de rij opent de
     detailsheet van precies dat doel, en daar staan aanpassen en pauzeren. */
  test('een tik op de rij haalt pauzeren en aanpassen tevoorschijn', async ({ page }) => {
    await openV(page, twee());
    await page.locator('#s-vooruit .plan-item[data-id="gB"] >> text=Vakantie').click();
    await page.waitForSelector('#planDoelSheet[data-doel="gB"]');
    expect(await page.locator('#planDoelSheet [data-doelaanpassen]').innerText()).toMatch(/aanpassen/);
    expect(await page.locator('#planDoelSheet [data-doelpauze]').innerText()).toMatch(/Pauzeren/);
    expect(await page.locator('#planDoelSheet').count()).toBe(1);
    expect(await page.locator('#s-vooruit [data-acties]').count()).toBe(0);
  });

  test('het volgorde-veld verschuift de rij en laat de nummers meelopen', async ({ page }) => {
    await openV(page, twee());
    await page.evaluate(() => openGoal('gB'));
    await page.locator('#planOrdeChips .chip[data-plek="0"]').click();
    await page.waitForFunction(() =>
      (document.querySelector('#s-vooruit .plan-item[data-id]') || {})
        .dataset.id === 'gB');
    const R = await rijen(page);
    expect(R[0].id).toBe('gB');
    expect(R[0].nr).toBe('1');
    expect(R[1].nr).toBe('2');
  });
});

test.describe('f · de controlelijst', () => {
  test('één bestemming', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'auto' }]));
    const R = await rijen(page);
    expect(R.length).toBe(2);                        // het doel plus het gepauzeerde noodfonds
    /* v380: "Blijft over EUR 0" is vervallen; dit doel neemt de hele inleg, dus er staat geen sluitpost */
    expect(await page.evaluate(() => planVrij())).toBe(0);
    expect(await page.locator('#planVrij').count()).toBe(0);
  });

  test('een gepauzeerd doel: grijs, geen inleg, en het zegt het', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 1200, allocMode: 'fixed', perMaand: 200 },
    ], (s) => { s.planPaused = { noodfonds: true, gA: true }; }));
    /* v380: geen "/mnd" meer op de rij; de status zegt gepauzeerd, de grijze regel "krijgt nu niets", en de balk
       heeft geen gearceerd deel voor deze maand. In de detailsheet staat de inleg op nul. */
    const r = await page.evaluate(() => {
      const rij = document.querySelector('#s-vooruit .plan-item[data-id="gA"]');
      return { status: rij.dataset.status, st: rij.querySelector('[data-planstatus]').innerText.trim(),
        sub: rij.querySelector('[data-rijsub]').innerText.trim(), seg: document.querySelectorAll('[data-seg]').length,
        bij: rij.querySelectorAll('[data-bijvat]').length,
        fills: [...rij.querySelectorAll('.plan-rijbalk > .bar-fill')].map((x) => x.getAttribute('style') || '') };
    });
    expect(r.status).toBe('gepauzeerd');
    expect(r.st).toBe('gepauzeerd');
    expect(r.sub).toBe('krijgt nu niets');
    expect(r.seg).toBe(0);
    expect(r.bij, 'geen groei-segment, want er gaat niets heen').toBe(0);
    expect(r.fills.length).toBe(1);
    expect(r.fills[0]).toMatch(/--mut/);
    const d = await detail(page, 'gA');
    expect(d.inleg).toBe(0);
    expect(d.dat).toMatch(/Gepauzeerd . krijgt nu niets/);
  });

  test('een bereikt doel: het zegt het, en rekent geen tempo meer', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Al binnen', doel: 500, gespaard: 500, allocMode: 'fixed', perMaand: 50 }]));
    /* v380: de rij zegt "vol" met "geen inleg meer nodig"; het woord "Bereikt" staat in het datumpaar van de sheet */
    const r = await page.evaluate(() => {
      const rij = document.querySelector('#s-vooruit .plan-item[data-id="gA"]');
      return { status: rij.dataset.status, st: rij.querySelector('[data-planstatus]').innerText.trim(),
        sub: rij.querySelector('[data-rijsub]').innerText.trim(), vol: rij.querySelector('[data-rijvol]').innerText.trim(),
        geld: rij.querySelector('[data-rijgeld]').innerText.replace(/\s+/g, ' ').trim(),
        verwachtGeld: euro0(planStandEind().per.gA.geld) + ' / ' + euro0(500), tekst: rij.innerText };
    });
    expect(r.status).toBe('vol');
    expect(r.st).toBe('vol');
    expect(r.sub).toBe('geen inleg meer nodig');
    expect(r.vol).toBe('vol ›');
    expect(r.geld).toBe(r.verwachtGeld);
    expect(r.tekst).not.toMatch(/op dit tempo|rond /);
    const d = await detail(page, 'gA');
    expect(d.dat).toMatch(/Bereikt/);
    expect(d.dat).not.toMatch(/op dit tempo|rond /);
  });

  /* v380: hier stond een if om twee uitkomsten heen (geen rij, of alleen het noodfonds). Gemeten: planItems() zet het
     noodfonds er altijd bij, ook met nfUit, dus de tak zonder rij was met deze invoer onbereikbaar en de if verborg
     dat. De invoer wordt nu eerst gemeten (alleen het noodfonds), en dan staat er een gewone lijst met een rij, de kop
     erboven, geen "Te verdelen", en omdat de buffer vol is de hele inleg onder "Blijft over". */
  test('geen eigen doelen: alleen het noodfonds, als gewone rij onder de kop', async ({ page }) => {
    await openV(page, tweak((s) => { s.goals = []; s.planOrder = []; s.planPaused = {}; s.nfUit = true; }));
    expect(await page.evaluate(() => allocatePlan().map((p) => p.id))).toEqual(['noodfonds']);
    const r = await page.evaluate(() => {
      const v = document.getElementById('s-vooruit');
      return { ids: [...v.querySelectorAll('#planLijst .plan-item[data-id]')].map((e) => e.dataset.id),
        naam: (v.querySelector('[data-rijnaam]') || {}).innerText, kop: !!document.getElementById('planKpi'),
        leeg: /Nog geen bestemmingen/.test(v.innerText), t: v.innerText };
    });
    expect(r.ids).toEqual(['noodfonds']);
    expect(r.naam).toBe('Noodfonds');
    expect(r.kop).toBe(true);
    expect(r.leeg).toBe(false);
    expect(r.t).not.toMatch(/Te verdelen/);
    expect(await page.evaluate(() => planVrij())).toBe(CAP);
    expect(await page.locator('#planVrij').innerText()).toContain(await page.evaluate((c) => euro0(c), CAP));
  });

  for (const w of [360, 390]) {
    test(`de kaart past op ${w}px, ook met de detailsheet open`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await openV(page, metDoelen([
        { id: 'gA', naam: 'Kosten koper voor het huis', doel: 90000, gespaard: 12345, allocMode: 'pct', pct: 40 },
        { id: 'gB', naam: 'Nieuwe fiets', doel: 900, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
      ]));
      const meet = () => page.evaluate(() => {
        const v = document.querySelector('#s-vooruit'), sh = document.querySelector('#sheet');
        return { v: v.scrollWidth - v.clientWidth, body: document.body.scrollWidth - document.body.clientWidth,
          sheet: sh ? sh.scrollWidth - sh.clientWidth : 0 };
      });
      let o = await meet();
      expect(o.v).toBeLessThanOrEqual(1);
      expect(o.body).toBeLessThanOrEqual(1);

      /* v380: de knoppen staan in de detailsheet en niet meer onder de open rij */
      await page.locator('#s-vooruit .plan-item[data-id="gA"] >> text=Kosten koper').click();
      await page.waitForSelector('#planDoelSheet[data-doel="gA"]');
      o = await meet();
      expect(o.v).toBeLessThanOrEqual(1);
      expect(o.body).toBeLessThanOrEqual(1);
      expect(o.sheet).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('g · de verdeling zelf is niet aangeraakt', () => {
  test('allocatePlan en planCapacity dragen geen weergave-beslissing', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'auto' }]));
    const src = await page.evaluate(() => ({ a: allocatePlan.toString(), c: planCapacity.toString() }));
    for (const s of [src.a, src.c]) {
      expect(s).not.toMatch(/planRij|planBedragDeel|NOTES|noteIcon|plan-rij/);
    }
  });
});
