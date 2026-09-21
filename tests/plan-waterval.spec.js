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
/* v246: het nummer staat in .vat-naam, de kop van het vat. Bindt aan de naamregel en niet aan de
   hele rijtekst: die draagt sinds de vertakte waterval ook de stand en het datumpaar. */
const rijen = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .plan-item')]
  .map((x) => ({ id: x.dataset.id, tekst: x.innerText.replace(/\s+/g, ' '),
    naam: ((x.querySelector('.vat-naam') || {}).innerText || '').replace(/\s+/g, ' ').trim() })));
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
    const r = await page.evaluate(() => {
      const it = document.querySelector('#s-vooruit .plan-item[data-id="gA"]');
      return { rij: it.querySelector('.row').innerText.replace(/\s+/g, ' '),
        heel: it.innerText.replace(/\s+/g, ' ') };
    });
    expect(r.rij).toMatch(/Kosten koper/);
    // wat deze bestemming per maand krijgt: het bedrag uit de waterval, niet het ingestelde
    const alloc = await page.evaluate(() => euro0(allocatePlan().find((x) => x.id === 'gA').alloc));
    expect(r.rij).toContain(alloc + '/mnd');
    expect(r.heel).toMatch(/€1\.500 toegewezen \/ €9\.000/);   // en waar hij staat
    // v246: en de tak boven het vat draagt hetzelfde bedrag, want beide lezen p.alloc
    const tak = await page.locator('.plan-tak[data-tak="gA"]').innerText();
    expect(tak).toContain(alloc + '/mnd');
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
    expect(rij).toMatch(/€0\/mnd/);                  // want er gaat niets heen
  });

  /* Wanneer een wachtende bestemming aan de beurt komt hangt af van keuzes die nog niet gemaakt
     zijn. Een maand-en-jaar zou daar een precisie aan geven die er niet is - dezelfde fout als een
     streefjaar noemen dat nergens op steunt (v59/v73/v173). */
  test('en nooit wanneer hij aan de beurt is', async ({ page }) => {
    await openV(page, metBlokkeerder());
    const rij = await page.locator('#s-vooruit .plan-item[data-id="gB"]').innerText();
    expect(rij).not.toMatch(/20\d\d/);
    expect(rij).not.toMatch(/rond |over \d+ maanden|op dit tempo/);
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

  test('de pijlen staan er zonder tik, de knoppen niet', async ({ page }) => {
    await openV(page, twee());
    const rij = page.locator('#s-vooruit .plan-item[data-id="gB"]');
    expect(await rij.locator('.plan-mv').count()).toBe(2);
    expect(await rij.innerText()).not.toMatch(/pauzeren|openen|uit plan halen/);
  });

  test('een tik op de rij haalt pauzeren en openen tevoorschijn', async ({ page }) => {
    await openV(page, twee());
    await page.locator('#s-vooruit .plan-item[data-id="gB"] >> text=Vakantie').click();
    await page.waitForSelector('#s-vooruit .plan-item[data-id="gB"] >> text=pauzeren');
    const t = await page.locator('#s-vooruit .plan-item[data-id="gB"]').innerText();
    expect(t).toMatch(/openen/);
    expect(t).toMatch(/pauzeren/);
    // en alleen bij die ene rij
    expect(await page.locator('#s-vooruit .plan-item[data-id="gA"]').innerText()).not.toMatch(/pauzeren/);
  });

  test('de pijl verschuift de rij en laat de nummers meelopen', async ({ page }) => {
    await openV(page, twee());
    await page.locator('#s-vooruit .plan-item[data-id="gB"] .plan-mv').first().click();
    await page.waitForFunction(() => (document.querySelector('#s-vooruit .plan-item') || {}).dataset.id === 'gB');
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
    const r = await page.evaluate(() => {
      const it = document.querySelector('#s-vooruit .plan-item[data-id="gA"]');
      return { tekst: it.innerText.replace(/\s+/g, ' '),
        fills: [...it.querySelectorAll('.bar-fill')].map((x) => x.getAttribute('style') || '') };
    });
    expect(r.tekst).toMatch(/€0\/mnd/);
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
      await page.waitForSelector('#s-vooruit .plan-item[data-id="gA"] >> text=pauzeren');
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
