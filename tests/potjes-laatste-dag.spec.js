/* v308: de tempo-projectie volgt het aantal resterende dagen.
 *
 * GEMELD op 30 september, dag 30 van 30: onder "Nog uit je potjes" stond
 *   "De resterende 1 dag heb je €319. Bij je tempo nog €710 nodig · €391 tekort".
 * GEMETEN welke formule dat geeft: varPlanRemaining() telt potjeRest() per potje op, en die had
 * TWEE takken die niet dezelfde vraag beantwoordden. Voor een OVERSCHREDEN potje gaf hij het
 * geplande dagtempo maal de resterende dagen, dus nul op de laatste dag. Voor een potje MET ruimte
 * gaf hij het hele onbestede deel, zonder naar de resterende dagen te kijken. Op de laatste dag was
 * de som daarmee precies de optelling van de onbestede delen (710), en het gat precies de
 * overschrijding van het andere potje (391) - een bedrag dat in één dag niet past.
 *
 * DE FIXTURE DRAAGT DIE DRIE GETALLEN, en de test rekent de oude uitkomst na zodat vastligt dat
 * het gemelde geval werkelijk gereproduceerd is. De potjes zelf zijn geconstrueerd: welke potjes
 * op het toestel staan weet ik niet, alleen de drie bedragen uit de regel.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
/* DE LAATSTE DAG IS `dim - 0`, en die is uit een genoemde datum niet te halen zonder ook de maand
   vast te zetten: de fixture bouwt zijn maandsleutels in Node (v299). Dezelfde bron als de acht
   specs die al een vaste dag lezen. */
const { pinDag } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));

// boodschappen 800 met 90 besteed (ver achter op zijn tempo), vervoer 300 met 691 (eroverheen)
const POTJES = { boodschappen: 800, vervoer: 300, huur: 1200 };
const BOEK = [['b1', '03', -90, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['v1', '04', -691, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION']];
const GEMELD = { inPotjes: 319, oudePlan: 710, oudeGat: 391 };

function seed() {
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  }
  for (const b of BOEK) add(b[0], CUR, b[1], b[2], b[3], b[4]);
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ bufferNorm: 3, limit: 70, hideInternal: true, mode: 'begeleid',
      autoIncome: false, income: 6000, manualBal: { [MAIN]: 4000 }, savingMode: 'amount',
      savingAmount: 0, budgets: POTJES, budgetMonth: CUR }),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, dagenOver) {
  await pinDag(page, dagenOver);           // voor de goto, anders leest de boot de echte klok
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof varPlanRemaining === 'function');
  await page.evaluate(() => go('ins'));
}

const meet = (page) => page.evaluate(() => {
  const m = curMonth || months()[months().length - 1];
  const VP = varPotjeStand(m), d = daysElapsed(m);
  const daysLeft = Math.max(d.dim - d.elapsed, 0);
  const B = SET.budgets || {}, rc = recurringCats(), sp = catSpendMap(m);
  let onbesteed = 0, tempoSom = 0;
  for (const k in B) { const bud = +B[k] || 0; if (bud <= 0 || rc.has(k)) continue;
    onbesteed += Math.max(bud - (sp[k] || 0), 0);
    tempoSom += Math.round(bud / Math.max(d.dim, 1) * daysLeft); }
  /* v309: de post is naar het hoofdgetal van de stand-kaart verhuisd, dus de stand en zijn
     achtervoegsel worden daar gelezen. De lijst wordt ook gelezen, maar om te toetsen dat de post
     daar NIET meer staat (verplaatsen is nooit kopieren). */
  const rij = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
    .find((x) => /uit je potjes|te veel uitgegeven/i.test(x.innerText));
  // v359: de stand-kaart is de tegel "Nog in potjes"; zijn waarde en de regel eronder
  go('ins');
  const kaart = document.querySelector('#insTegels [data-instegel="potjes"]');
  const sp2 = kaart ? [kaart.querySelector('.vl'), kaart.querySelector('.ms')] : [];
  return { dim: d.dim, elapsed: d.elapsed, daysLeft,
    budget: VP.budget, gebruikt: VP.gebruikt, inPotjes: VP.budget - VP.gebruikt,
    plan: varPlanRemaining(m), reserve: varPotjesReserve(m),
    onbesteed: Math.round(onbesteed), bovengrens: Math.round(tempoSom),
    postInLijst: !!rij,
    val: sp2.length ? sp2[0].innerText.trim() : null,
    achtervoegsel: sp2.length > 1 ? sp2[1].innerText.replace(/\s+/g, ' ').trim() : null,
    kaartTekst: kaart ? kaart.innerText.split(String.fromCharCode(10)).join(' | ') : '' };
});

test.describe('a · de gemelde regel op de laatste dag van de maand', () => {
  test('de fixture reproduceert de drie gemelde bedragen met de oude formule', async ({ page }) => {
    await boot(page, 0);
    const r = await meet(page);
    // de invoer: het is werkelijk de laatste dag, dus er is geen dag meer om iets in uit te geven
    expect(r.elapsed).toBe(r.dim);
    expect(r.daysLeft).toBe(0);
    // en de drie bedragen uit de melding staan er
    expect(r.inPotjes).toBe(GEMELD.inPotjes);
    expect(r.onbesteed).toBe(GEMELD.oudePlan);                    // wat de oude tak optelde
    expect(r.onbesteed - r.inPotjes).toBe(GEMELD.oudeGat);        // en het gat dat eruit volgde
  });

  test('de projectie is nul, en de tekortregel staat er niet meer', async ({ page }) => {
    await boot(page, 0);
    const r = await meet(page);
    expect(r.plan).toBe(0);
    expect(r.plan).not.toBe(GEMELD.oudePlan);
    /* v309: de tekortregel is het achtervoegsel van het hoofdgetal geworden. Met een projectie van
       nul is het gat negatief, dus hij vuurt niet en draagt het achtervoegsel het dagbedrag. */
    expect(r.achtervoegsel).not.toMatch(/tekort/);
    expect(r.kaartTekst).not.toMatch(/tekort/);
  });

  test('de stand blijft staan met zijn dagbedrag, want die klopten', async ({ page }) => {
    await boot(page, 0);
    const r = await meet(page);
    /* v309: dezelfde twee feiten, op hun nieuwe plek. Op de laatste dag klemt maandDagenOver() op
       1 (v257), dus het dagbedrag is het hele restant; dat is onveranderd gedrag. */
    expect(r.val).toBe('\u20ac319');
    expect(r.achtervoegsel).toBe('\u20ac319 per dag');
    expect(r.postInLijst).toBe(false);          // en de post staat niet meer in de lijst
    expect(r.reserve).toBe(GEMELD.oudePlan);    // de reservering is onaangeroerd (v254)
  });
});

test.describe('b · de projectie volgt de resterende dagen', () => {
  /* DE BOVENGRENS IS HET GEPLANDE DAGTEMPO MAAL DE RESTERENDE DAGEN, en die wordt hier uit de
     potjes en de kalender gerekend en niet uit potjeRest(): wat vastligt is dat de som er niet
     boven komt, op geen enkele dag van de maand. */
  for (const dg of [0, 1, 7, 15]) {
    test(`met ${dg} dagen over komt de som niet boven het tempo van die dagen`, async ({ page }) => {
      await boot(page, dg);
      const r = await meet(page);
      expect(r.daysLeft).toBe(dg);
      expect(r.plan).toBeLessThanOrEqual(r.bovengrens);
      // en zonder de klem zou hij op het onbestede deel staan, dat hier veel hoger ligt
      expect(r.onbesteed).toBeGreaterThan(r.bovengrens);
      expect(r.plan).toBeLessThan(r.onbesteed);
    });
  }

  test('meer dagen over is meer projectie, en nul dagen is nul', async ({ page }) => {
    const rij = [];
    for (const dg of [0, 1, 7, 15]) { await boot(page, dg); rij.push((await meet(page)).plan); }
    expect(rij[0]).toBe(0);
    for (let i = 1; i < rij.length; i++) expect(rij[i]).toBeGreaterThan(rij[i - 1]);
  });
});

test.describe('c · de rekenregel zelf', () => {
  test('achter op je tempo bindt het tempo, voor op je tempo het restant', async ({ page }) => {
    await boot(page, 7);
    const r = await page.evaluate(() => ({
      achter: potjeRest(300, 0, 30, 10),        // restant 300, tempo 300/30 x 10 = 100
      voor: potjeRest(300, 280, 30, 10),        // restant 20, tempo 100
      opTempo: potjeRest(300, 200, 30, 10),     // 20 van de 30 dagen om, dus precies op tempo
      over: potjeRest(300, 400, 30, 10),        // eroverheen: het tempo, zoals sinds v111
      eind: potjeRest(300, 0, 30, 0),
    }));
    expect(r.achter).toBe(100);
    expect(r.voor).toBe(20);
    expect(r.over).toBe(100);
    expect(r.eind).toBe(0);
    /* DE TEGENPROEF: op tempo is de uitkomst dezelfde als voor v308, want restant en tempo zijn
       daar hetzelfde getal. Zonder dit geval is "de klem raakt alleen het potje dat achterloopt"
       niet te onderscheiden van "de klem raakt elk potje". */
    expect(r.opTempo).toBe(100);
    expect(r.opTempo).toBe(300 - 200);
  });

  test('de twee takken lezen dezelfde resterende dagen, uit een uitdrukking', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const i = src.indexOf('function potjeRest(');
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, src.indexOf('\n}', i));
    // het tempo staat er een keer, en beide takken komen erop uit
    expect((body.match(/Math\.max\(daysLeft,\s*0\)/g) || []).length).toBe(1);
    expect(body).toContain('return Math.min(bud-uitgegeven, tempo);');
    expect(body).toContain('return tempo;');
    // en geen tak geeft het onbestede deel ongeklemd terug
    expect(body).not.toMatch(/return\s+bud-uitgegeven;/);
  });
});
