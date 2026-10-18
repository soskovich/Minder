/* v440: OPZIJ STAAT LOS VAN HET BUDGET. De Plan-inleg bestaat niet meer: het vastgelegde maandbudget is de som van de potjes
   (geen aparte inleg, geen spookbedrag). Opzij wordt per salarisperiode gemeten (opzijPeriode): netto naar je spaarrekening,
   tegen het doel uit Kiezen. Plan, de Doelen-meter en Zien lezen die ene functie; Inhalen is dezelfde bron als "toegewezen
   zonder geld" (spaarOver().zonder); planCapacity leest opzij -> spaarinleg -> advies; en de te-ruim-sheet heeft geen inleg-
   bestemmingen meer. GETALLEN VAN DE FIXTURE (budget-fixture), NIET VAN HET TOESTEL. */
const { test, expect } = require('@playwright/test');
const { seed, open, MAIN } = require('./budget-fixture');

test.describe('1 · het vastgelegde budget is de som van de potjes', () => {
  test('geen aparte inleg, geen Plan-inleg op enig scherm, en totaal = som van de potjes', async ({ page }) => {
    await open(page, seed({ maanden: 6 }));   // genoeg historie zodat maandVooruit() en maandGroepen() rekenen
    const r = await page.evaluate(() => {
      const V = maandVooruit(), MB = maandBudgetVast();
      return { budget: V.budget, inleg: V.inleg, mbInleg: Math.round(+MB.inleg || 0), mbTotaal: Math.round(MB.totaal),
        som: Math.round(Object.values(MB.potjes).reduce((a, v) => a + v, 0)), label: budgetVastTekst(V),
        groepInleg: maandGroepen(V).g.some(g => g.n === 'inleg in Plan') };
    });
    expect(r.inleg).toBe(0);                       // geen inleg in de forecast
    expect(r.mbInleg).toBe(0);                     // geen inleg in het vastgelegde record
    expect(r.mbTotaal).toBe(r.som);                // totaal = som van de potjes, geen spookbedrag
    expect(r.budget).toBe(r.som);
    expect(r.label).not.toMatch(/Plan-inleg/);     // de term staat nergens in het budget-label
    expect(r.groepInleg).toBe(false);              // geen groep "inleg in Plan" meer
  });
  /* De sabotage van deze ronde zet een inleg terug in het budget; dan telt het totaal meer dan de potjes en valt deze toets. */
  test('vastgelegd budget = som van de potjes, nooit een inleg erbovenop (geen spookbedrag)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const m = thisYM(); maandBudgetZorg(m);
      const N = maandBudgetNu(m), V = maandBudgetVast(m);
      return { nuInleg: Math.round(+N.inleg || 0), nuTotaal: Math.round(N.totaal), nuSom: Math.round(Object.values(N.potjes).reduce((a, v) => a + v, 0)),
        vTotaal: Math.round(V.totaal), vSom: Math.round(Object.values(V.potjes).reduce((a, v) => a + v, 0)) };
    });
    expect(r.nuInleg).toBe(0);
    expect(r.nuTotaal).toBe(r.nuSom);
    expect(r.vTotaal).toBe(r.vSom);
  });
  test('de migratie haalt een oude inleg uit een vastgelegd record en herleidt het totaal', async ({ page }) => {
    const p = seed(); const set = JSON.parse(p.minder_set);
    // een oud record met een inleg erin (de v439-vorm), en geen mbDeInleg-vlag
    set.maandBudget = { '2026-09': { totaal: 2680, potjes: { huur: 900, boodschappen: 800, uiteten: 400, shopping: 280 }, inleg: 300, op: '2026-09-01', bron: 'maandwissel' } };
    delete set.mbDeInleg; p.minder_set = JSON.stringify(set);
    await open(page, p);
    const r = await page.evaluate(() => { const rec = SET.maandBudget['2026-09'];
      return { inleg: Math.round(+rec.inleg || 0), totaal: Math.round(rec.totaal), som: Math.round(Object.values(rec.potjes).reduce((a, v) => a + v, 0)),
        geraakt: (SET.mbDeInleg && SET.mbDeInleg.geraakt || []).map(x => x.ym) }; });
    expect(r.inleg).toBe(0);
    expect(r.totaal).toBe(r.som);        // 900+800+400+280 = 2380, zonder de 300 inleg
    expect(r.totaal).toBe(2380);
    expect(r.geraakt).toContain('2026-09');
  });
});

test.describe('2 · opzijPeriode is de ene opzij-bron', () => {
  test('netto naar de spaarrekening over de salarisperiode, en savedNetRange is de ene optelling', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => { const O = opzijPeriode();
      return { meetbaar: O.meetbaar, netto: O.netto, start: O.start, eind: O.eind,
        range: (O.start && O.eind) ? savedNetRange(O.start, O.eind) : null }; });
    expect(r.meetbaar).toBe(true);           // er is een spaarrekening in de fixture
    expect(r.netto).toBe(r.range);           // opzijPeriode.netto leest savedNetRange (een bron)
  });
  test('het doel komt uit Kiezen (SET.salVerdeling.opzij); zonder keuze is er geen doel', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => opzijPeriode().doel)).toBe(null);
    const d = await page.evaluate((acc) => { SET.salVerdeling = { rek: { [acc]: 1 }, opzij: 1200 }; return opzijPeriode().doel; }, MAIN);
    expect(d).toBe(1200);
  });
  test('Plan toont "Opzij deze periode" en de Doelen-meter leest opzijPeriode', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => renderPlan())).toContain('Opzij deze periode');
    const m = await page.evaluate((acc) => { SET.salVerdeling = { rek: { [acc]: 1 }, opzij: 1200 }; const O = opzijPeriode(), D = gripMeterDoelen(); return { doel: D.opzij, meterNetto: D.netto, periodeNetto: O.netto }; }, MAIN);
    expect(m.doel).toBe(1200);               // de meter leest het doel uit opzijPeriode
    expect(m.meterNetto).toBe(m.periodeNetto);
  });
});

test.describe('3 · Inhalen, capaciteit en de te-ruim-sheet', () => {
  test('Inhalen is dezelfde bron als "toegewezen zonder geld" (spaarOver().zonder), een regel', async ({ page }) => {
    const p = seed(); const set = JSON.parse(p.minder_set);
    set.goals = [{ id: 'g1', naam: 'Vakantie', doel: 5000, gespaard: 4000 }];   // meer toegewezen dan er op de spaarrekening staat
    p.minder_set = JSON.stringify(set);
    await open(page, p);
    const r = await page.evaluate(() => { go('vooruit'); const reg = document.getElementById('spaarOverRegel');
      return { zonder: Math.round(spaarOver().zonder), tekst: reg ? reg.innerText.replace(/\s+/g, ' ') : '', attr: reg ? +reg.dataset.planinhalen : null,
        n: document.querySelectorAll('#s-vooruit [data-planinhalen]').length }; });
    expect(r.zonder).toBeGreaterThan(0);
    expect(r.tekst).toContain('Inhalen');
    expect(r.attr).toBe(r.zonder);           // de regel leest spaarOver().zonder
    expect(r.n).toBe(1);                      // een regel, geen dubbele kaart
  });
  test('planCapacity leest opzij -> spaarinleg -> advies', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => planCapacity())).toBe(300);   // geen gekozen opzij, wel een spaarinleg van 300
    expect(await page.evaluate((acc) => { SET.salVerdeling = { rek: { [acc]: 1 }, opzij: 1200 }; window._rekV = null; return planCapacity(); }, MAIN)).toBe(1200);   // de gekozen opzij gaat voor
  });
  test('de te-ruim-sheet heeft geen Plan/reservering/beleggen als bestemming meer', async ({ page }) => {
    await open(page);
    const soorten = await page.evaluate(() => { const V = maandVooruit(), x = (V.potjes || [])[0] || { k: 'boodschappen' };
      const D = teRuimBestemmingen(V, x); return [...D.vast, ...D.ander, ...(D.nieuw ? [D.nieuw] : [])].map(b => b.soort); });
    expect(soorten).not.toContain('plan');
    expect(soorten).not.toContain('res');
    expect(soorten).not.toContain('beleg');
    expect(soorten.every(s => s === 'pot' || s === 'nieuw')).toBe(true);
  });
});
