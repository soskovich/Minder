// v225: Plan legde de waterval uit in drie zinnen boven een lijst losse kaarten, en toonde hem
// nergens. Deze spec bewaakt de vorm die daarvoor in de plaats komt: één kaart met bovenaan het te
// verdelen bedrag, daaronder de bestemmingen genummerd in de volgorde waarin ze bediend worden, en
// onderaan wat er overblijft - ook als dat nul is.
// Wat hier NIET wordt getoetst is de verdeling zelf: allocatePlan() en planCapacity() zijn deze
// ronde niet aangeraakt, en hun eigen specs (plan-doorzakken, verdeelmodus) blijven de bron.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

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
/* v318: EEN BESTEMMING IS TWEE ELEMENTEN. De vaten staan naast elkaar in een raster, dus het beeld
   (`.wf-kol`, met de tak en het vat) en de tekst (`.wf-tekst`, met de naam, het bedrag, de stand en
   het datumpaar) staan in twee RASTERRIJEN en kunnen per constructie geen gedeelde omhulling hebben.
   Een bestemming is daarom te vinden op `.plan-item[data-id="<id>"]`; een VOL noodfonds draagt geen vat en
   blijft zijn eigen regel met `data-id`.
   Het nummer staat in de naamregel (`.wf-naam`, of `.vat-naam` bij die ene regel) en niet in de hele
   rijtekst: die draagt ook de stand en het datumpaar. */
const rijen = (page) => page.evaluate(() =>
  [...document.querySelectorAll('#s-vooruit .plan-rij[data-id], #s-vooruit .wf-tekst')]
    .map((x) => ({ id: x.dataset.id, tekst: x.innerText.replace(/\s+/g, ' '),
      naam: ((x.querySelector('.wf-naam') || x.querySelector('.vat-naam') || {}).innerText || '')
        .replace(/\s+/g, ' ').trim() })));
const scherm = (page) => page.locator('#s-vooruit').innerText();

/* ---------------------------------------------------------------------------------------- */

test.describe('a · de kaart toont het mechanisme', () => {
  test('te verdelen bovenaan, bestemmingen genummerd, rest onderaan', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 200 },
      { id: 'gB', naam: 'Vakantie', doel: 3000, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
    ]));
    const t = await scherm(page);
    const R = await rijen(page);
    expect(R.map((x) => x.id)).toEqual(['gA', 'gB', 'noodfonds']);
    // de nummers volgen de volgorde van de waterval, niet de naam of het bedrag
    for (let i = 0; i < R.length; i++) expect(R[i].naam).toMatch(new RegExp('^' + (i + 1) + '\\s'));
    // en de drie horen bij elkaar in één kaart, in deze volgorde
    expect(t.indexOf('Te verdelen')).toBeGreaterThanOrEqual(0);
    expect(t.indexOf('Te verdelen')).toBeLessThan(t.indexOf('Kosten koper'));
    expect(t.indexOf('Kosten koper')).toBeLessThan(t.indexOf('Blijft over'));
  });

  test('het te verdelen bedrag is planCapacity, met een volle balk erbij', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 200 }]));
    /* v246: de balk was één volle vulling; hij is verdeeld in een segment per bestemming plus een
       eigen leeg segment voor wat onverdeeld blijft. De eigenschap blijft dezelfde en wordt
       scherper: de balk telt op tot het hele te verdelen bedrag, niets valt eruit. */
    const r = await page.evaluate(() => {
      const kaart = [...document.querySelectorAll('#s-vooruit .card')].find((c) => /Te verdelen/.test(c.textContent));
      const balk = kaart.querySelector(':scope > .inleg-balk');
      const segs = balk ? [...balk.children].map((x) => ({ id: x.dataset.seg, w: parseFloat(x.style.width) })) : [];
      return { cap: planCapacity(), tekst: kaart.innerText.replace(/\s+/g, ' '), segs };
    });
    expect(r.tekst).toContain(await page.evaluate((c) => euro0(c) + '/mnd', r.cap));
    expect(r.segs.length).toBeGreaterThan(0);
    expect(r.segs.reduce((a, x) => a + x.w, 0)).toBeCloseTo(100, 1);
    expect(r.segs.some((x) => x.id === 'gA')).toBe(true);
  });

  test('elke rij noemt zijn maandbedrag rechts en zijn stand eronder', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 1500, allocMode: 'fixed', perMaand: 200 }]));
    const r = await page.evaluate(() => ({
      naam: document.querySelector('#s-vooruit .wf-naam').innerText.replace(/\s+/g, ' '),
      heel: document.querySelector('#s-vooruit .plan-item[data-id="gA"]').innerText.replace(/\s+/g, ' '),
      label: (document.querySelector('#s-vooruit .wf-kol[data-id="gA"] .wf-taklabel') || {}).innerText }));
    expect(r.naam).toMatch(/Kosten koper/);
    // wat deze bestemming per maand krijgt: het bedrag uit de waterval, niet het ingestelde
    const alloc = await page.evaluate(() => euro0(allocatePlan().find((x) => x.id === 'gA').alloc));
    /* v318: het bedrag staat NAAST de tak zodra er ruimte is, want de tak IS dat bedrag. Met één
       vat is de kolom breed, dus hier staat het bij de tak en niet in het tekstblok. */
    expect(r.label.replace(/\s+/g, ' ')).toContain(alloc + '/mnd');
    expect(r.heel).toMatch(/€1\.500 toegewezen \/ €9\.000/);   // en waar hij staat
    expect(r.heel).not.toContain(alloc + '/mnd');
    // de dikte van de tak komt uit het maandbedrag en niet uit het segment van de balk
    const tak = await page.evaluate(() => {
      const i = document.querySelector('#s-vooruit .wf-kol[data-id="gA"] .wf-tak i[data-takkleur]');
      return { w: parseFloat(i.style.width),
        dik: planTakDikte(allocatePlan().find((x) => x.id === 'gA').alloc) };
    });
    expect(tak.w).toBe(tak.dik);
  });
});

test.describe('b · de sluitpost staat er ook op nul', () => {
  test('met vrije ruimte: het bedrag en een keuze', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Bijna klaar', doel: 300, gespaard: 200, allocMode: 'auto' }]));
    const t = await page.locator('#planVrij').innerText();
    expect(t).toMatch(/Blijft over/);
    expect(t).toContain(await page.evaluate(() => euro0(planVrij())));
    expect(await page.evaluate(() => planVrij())).toBeGreaterThan(0);
    expect(t).toMatch(/voeg een doel toe/i);
  });

  test('zonder vrije ruimte: dezelfde regel, met €0 en zonder keuze', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Slokop', doel: 90000, gespaard: 0, allocMode: 'auto' }]));
    expect(await page.evaluate(() => planVrij())).toBe(0);
    /* Een sluitpost die alleen bij een positief bedrag verschijnt laat je raden of hij er niet was
       of dat hij nul was. De keuze staat er wel alleen als er iets te kiezen valt. */
    const t = await page.locator('#planVrij').innerText();
    expect(t).toMatch(/Blijft over\s*€0/);
    expect(t).not.toMatch(/voeg een doel toe/i);
  });
});

test.describe('c · een wachtende bestemming noemt waarop, en nooit wanneer', () => {
  const metBlokkeerder = () => metDoelen([
    { id: 'gA', naam: 'Vakantie', doel: 90000, gespaard: 0, allocMode: 'auto' },
    { id: 'gB', naam: 'Nieuwe fiets', doel: 900, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
  ]);

  test('de rij noemt de bestemming die het geld pakt', async ({ page }) => {
    await openV(page, metBlokkeerder());
    expect(await page.evaluate(() => allocatePlan().find((x) => x.id === 'gB').status)).toBe('wacht op capaciteit');
    const rij = await page.locator('#s-vooruit .plan-item[data-id="gB"]').innerText();
    expect(rij).toMatch(/Wacht op .Vakantie./);
    /* v318: met twee vaten zakt het bedrag naar het tekstblok, want naast de tak zou het over de
       buurkolom lopen. De NUL staat er, en dat is een meting en geen leegte (v59/v73/v173). */
    expect(rij).toMatch(/€0\s*\/mnd/);
  });

  /* Wanneer een wachtende bestemming ZELF vol is hangt af van keuzes die nog niet gemaakt zijn, dus
     daar komt geen datum (v59/v73/v173).
     v317: EEN GEMETEN OVERDRACHT IS EEN ANDERE BEWERING, en die mag wel een maand noemen. De
     terugval-regel zegt vanaf wanneer de RUIMTE van de blokkeerder hierheen gaat, en dat komt uit
     dezelfde projectie die elk vat sinds v307 al leest. Wat verboden blijft is de eigen vol-datum,
     het eigen tempo en een achterstand van deze bestemming: die drie zouden tegen de verkeerde
     alloc gerekend zijn. De assertie leest daarom de regels van het VAT en niet de hele rij. */
  test('en nooit zijn eigen vol-datum of tempo', async ({ page }) => {
    await openV(page, metBlokkeerder());
    const dat = await page.evaluate(() =>
      document.querySelector('#s-vooruit .plan-item[data-id="gB"] .vat-dat').innerText);
    expect(dat).not.toMatch(/20\d\d/);
    expect(dat).not.toMatch(/rond |over \d+ maanden|op dit tempo|vol in/);
  });

  /* v317: en de terugval-regel staat er wel, met de maand en de naam van de blokkeerder. Hij is
     een EIGEN element naast het datumpaar, dus hij kan de regel hierboven niet vervuilen. */
  test('maar wel vanaf wanneer de ruimte van zijn blokkeerder hierheen gaat', async ({ page }) => {
    await openV(page, metBlokkeerder());
    /* v318: de terugval-regel staat niet IN het tekstblok maar als eigen rasterregel over de volle
       breedte, want een overdracht verbindt twee kolommen. Hij draagt de ONTVANGER, dus hij is per
       bestemming te vinden zonder dat hij in haar element zit. */
    const erf = page.locator('#s-vooruit [data-erfregel][data-erfnaar="gB"]');
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
    expect(await page.locator('#s-vooruit .plan-item[data-id="gB"]').innerText())
      .toMatch(/Wacht op capaciteit/i);
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

  test('een tik op het uitlegteken toont ze alsnog', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 200 }]));
    await page.locator('#s-vooruit [onclick*="planUitleg"]').first().click();
    await page.waitForSelector('#tipPop.show');
    expect(await page.locator('#tipPop').innerText()).toMatch(/gaat van boven naar beneden/);
  });

  /* Een amber-melding achter een uitlegteken is geen melding meer: die blijft staan waar hij stond
     (v78/v93). De neutrale uitleg eromheen is wél vervallen. */
  test('de overtoewijzing blijft zichtbaar, zonder tik', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'A', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 400 },
      { id: 'gB', naam: 'B', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 400 },
    ]));
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
  });

  test('een tik op de rij haalt pauzeren en openen tevoorschijn', async ({ page }) => {
    await openV(page, twee());
    await page.locator('#s-vooruit .plan-item[data-id="gB"] >> text=Vakantie').click();
    /* v318: de knoppen staan als eigen rasterregel onder de bestemming die je aantikte, want ze
       lopen over de volle breedte. Ze dragen hun eigen id, dus "alleen bij die ene" is nog te
       meten zonder dat ze in haar element zitten. */
    await page.waitForSelector('#s-vooruit [data-acties="gB"]');
    const t = await page.locator('#s-vooruit [data-acties="gB"]').innerText();
    expect(t).toMatch(/openen/);
    expect(t).toMatch(/pauzeren/);
    expect(await page.locator('#s-vooruit [data-acties]').count()).toBe(1);
  });

  test('het volgorde-veld verschuift de rij en laat de nummers meelopen', async ({ page }) => {
    await openV(page, twee());
    await page.evaluate(() => openGoal('gB'));
    await page.locator('#planOrdeChips .chip[data-plek="0"]').click();
    await page.waitForFunction(() =>
      (document.querySelector('#s-vooruit .plan-rij[data-id], #s-vooruit .wf-tekst') || {})
        .dataset.id === 'gB');
    const R = await rijen(page);
    expect(R[0].id).toBe('gB');
    expect(R[0].naam).toMatch(/^1\s/);
    expect(R[1].naam).toMatch(/^2\s/);
  });
});

test.describe('f · de controlelijst', () => {
  test('één bestemming', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 0, allocMode: 'auto' }]));
    const R = await rijen(page);
    expect(R.length).toBe(2);                        // het doel plus het gepauzeerde noodfonds
    expect(await scherm(page)).toMatch(/Blijft over/);
  });

  test('een gepauzeerd doel: grijs, €0, en het zegt het', async ({ page }) => {
    await openV(page, metDoelen([
      { id: 'gA', naam: 'Kosten koper', doel: 9000, gespaard: 1200, allocMode: 'fixed', perMaand: 200 },
    ], (s) => { s.planPaused = { noodfonds: true, gA: true }; }));
    /* v318: de vulling zit in het VAT en het bedrag bij de TAK, dus de rij is twee elementen. Het
       label leest €0/mnd, en die nul is een meting (v59/v73/v173). */
    const r = await page.evaluate(() => {
      const kol = document.querySelector('#s-vooruit .wf-kol[data-id="gA"]');
      return { tekst: document.querySelector('#s-vooruit .plan-item[data-id="gA"]').innerText.replace(/\s+/g, ' '),
        label: ((kol.querySelector('.wf-taklabel') || {}).innerText || '').replace(/\s+/g, ' '),
        tak: !!kol.querySelector('.wf-tak i[data-takkleur]'),
        fills: [...kol.querySelectorAll('.wf-vat i')].map((x) => x.getAttribute('style') || '') };
    });
    expect(r.label).toMatch(/€0\s*\/mnd/);
    expect(r.tak, 'geen tak, want er gaat niets heen').toBe(false);
    expect(r.tekst).toMatch(/Gepauzeerd . krijgt nu niets/);
    expect(r.fills.length).toBe(1);                  // geen groei-segment
    expect(r.fills[0]).toMatch(/--mut/);
  });

  test('een bereikt doel: het zegt het, en rekent geen tempo meer', async ({ page }) => {
    await openV(page, metDoelen([{ id: 'gA', naam: 'Al binnen', doel: 500, gespaard: 500, allocMode: 'fixed', perMaand: 50 }]));
    const t = await page.locator('#s-vooruit .plan-item[data-id="gA"]').innerText();
    expect(t).toMatch(/Bereikt/);
    expect(t).toMatch(/€500 toegewezen \/ €500/);
    expect(t).not.toMatch(/op dit tempo|rond /);
  });

  test('geen bestemmingen: de kaart zegt dat, en blijft een kaart', async ({ page }) => {
    await openV(page, tweak((s) => { s.goals = []; s.planOrder = []; s.planPaused = {}; s.nfUit = true; }));
    const n = await page.evaluate(() => document.querySelectorAll('#s-vooruit .plan-item').length);
    const t = await scherm(page);
    if (n === 0) {
      expect(t).toMatch(/Nog geen bestemmingen/);
    } else {
      // het noodfonds blijft een bestemming zolang het bestaat; dan is de lijst niet leeg
      expect(t).toMatch(/Noodfonds/);
    }
    expect(t).toMatch(/Te verdelen/);
    expect(t).toMatch(/Blijft over/);
  });

  for (const w of [360, 390]) {
    test(`de kaart past op ${w}px, ook met de knoppen open`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await openV(page, metDoelen([
        { id: 'gA', naam: 'Kosten koper voor het huis', doel: 90000, gespaard: 12345, allocMode: 'pct', pct: 40 },
        { id: 'gB', naam: 'Nieuwe fiets', doel: 900, gespaard: 0, allocMode: 'fixed', perMaand: 100 },
      ]));
      const meet = () => page.evaluate(() => {
        const v = document.querySelector('#s-vooruit');
        return { v: v.scrollWidth - v.clientWidth, body: document.body.scrollWidth - document.body.clientWidth };
      });
      let o = await meet();
      expect(o.v).toBeLessThanOrEqual(1);
      expect(o.body).toBeLessThanOrEqual(1);

      await page.locator('#s-vooruit .plan-item[data-id="gA"] >> text=Kosten koper').click();
      await page.waitForSelector('#s-vooruit [data-acties="gA"]');
      o = await meet();
      expect(o.v).toBeLessThanOrEqual(1);
      expect(o.body).toBeLessThanOrEqual(1);
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
