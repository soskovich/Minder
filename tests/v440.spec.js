/* v440: OPZIJ STAAT LOS VAN HET BUDGET. De Plan-inleg bestaat niet meer: het vastgelegde maandbudget is de som van de potjes
   (geen aparte inleg, geen spookbedrag). Opzij wordt per salarisperiode gemeten (opzijPeriode): netto naar je spaarrekening,
   tegen het doel uit Kiezen. Plan, de Doelen-meter en Zien lezen die ene functie; Inhalen is dezelfde bron als "toegewezen
   zonder geld" (spaarOver().zonder); planCapacity leest opzij -> advies -> comfortTot (de spaarinleg is uit de terugval); en de
   te-ruim-sheet heeft geen inleg-bestemmingen meer. GETALLEN VAN DE FIXTURE (budget-fixture), NIET VAN HET TOESTEL. */
const { test, expect } = require('@playwright/test');
const { seed, open, MAIN, SAV, CUR, M1 } = require('./budget-fixture');

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
  /* v440 item 2: de migratie bewaart de vóór-stand (inleg, totaal, potjes, verplaatsing), zet een verplaatsing terug in het
     bronpotje, en is in één stap om te draaien. SABOTAGE: snapshot ná de verplaatsing (potjesVoor = r.potjes na de toevoeging) →
     dan herstelt maandBudgetDeInlegHerstel() het verkeerde potje en valt de roundtrip-assertie. */
  test('de migratie bewaart de vóór-stand en maandBudgetDeInlegHerstel() zet hem exact terug', async ({ page }) => {
    const p = seed(); const set = JSON.parse(p.minder_set);
    // een v439-record met een inleg én een verplaatsing (boodschappen gaf 300 aan de inleg)
    set.maandBudget = { '2026-08': { totaal: 2680, potjes: { huur: 900, boodschappen: 500, uiteten: 400, shopping: 280 }, inleg: 600,
      verplaatst: [{ van: 'boodschappen', bedrag: 300, naar: 'plan' }], op: '2026-08-01', bron: 'maandwissel' } };
    delete set.mbDeInleg; p.minder_set = JSON.stringify(set);
    await open(page, p);
    const na = await page.evaluate(() => { const rec = SET.maandBudget['2026-08'], g = SET.mbDeInleg.geraakt.find(x => x.ym === '2026-08');
      return { inleg: Math.round(+rec.inleg || 0), totaal: Math.round(rec.totaal), boodschappen: Math.round(+rec.potjes.boodschappen || 0),
        verplaatst: !!rec.verplaatst, voor: g.voor, naTot: g.na.totaal, teruggekregen: g.teruggekregen,
        diag: diagMaandBudget(null, false, null).join('\n') }; });
    expect(na.inleg).toBe(0);
    expect(na.totaal).toBe(2380);                       // 900 + (500+300) + 400 + 280
    expect(na.boodschappen).toBe(800);                  // het bronpotje kreeg de 300 terug
    expect(na.voor.inleg).toBe(600);                    // de vóór-stand is bewaard
    expect(na.voor.totaal).toBe(2680);
    expect(na.voor.potjes.boodschappen).toBe(500);
    expect(na.teruggekregen).toEqual([{ potje: 'boodschappen', bedrag: 300 }]);
    expect(na.diag).toContain('migratie de-inleg');     // blok 20 noemt de regel
    expect(na.diag).toContain('potje terug');
    // het herstelpad zet de vóór-stand exact terug
    const herstel = await page.evaluate(() => { const ok = maandBudgetDeInlegHerstel(), rec = SET.maandBudget['2026-08'];
      return { ok, inleg: Math.round(+rec.inleg || 0), totaal: Math.round(rec.totaal), boodschappen: Math.round(+rec.potjes.boodschappen || 0),
        verplaatst: Array.isArray(rec.verplaatst) ? rec.verplaatst.length : 0, hersteld: !!SET.mbDeInleg.hersteld }; });
    expect(herstel.ok).toBe(true);
    expect(herstel.inleg).toBe(600);                    // vóór-stand terug
    expect(herstel.totaal).toBe(2680);
    expect(herstel.boodschappen).toBe(500);
    expect(herstel.verplaatst).toBe(1);                 // de verplaatsing staat weer in het record
    expect(herstel.hersteld).toBe(true);                // en de vlag blijft staan, dus de boot migreert niet opnieuw
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
    expect(await page.evaluate(() => { delete SET.salVerdeling; return opzijPeriode().doel; })).toBe(null);
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
  /* v470 (punt 2): de Plan-regel "Terug te zetten" leest planTerug() (toegewezen en niet op je spaarrekening), niet meer het grootboek
     over de periodes (opzijInhalen()). De fixture draagt een grootboek-bedrag dat anders is dan wat er niet op je spaarrekening staat. */
  test('Terug te zetten leest planTerug() en niet het grootboek (v470)', async ({ page }) => {
    const p = seed(); const tx = JSON.parse(p.minder_tx);
    tx.push({ id: 'onttr1', date: `${M1}-12`, amount: -500, acc: SAV, name: 'Spaarpot', desc: 'VAN SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    p.minder_tx = JSON.stringify(tx);
    await open(page, p);
    const r = await page.evaluate(() => { go('vooruit'); const reg = document.getElementById('spaarOverRegel');
      return { inhalen: opzijInhalen().inhalen, bron: planTerug().totaal, attr: reg ? +reg.dataset.planinhalen : 0 }; });
    expect(r.inhalen).toBeGreaterThan(0);    // het grootboek draagt een bedrag
    expect(r.bron).not.toBe(r.inhalen);      // en planTerug() een ander: zonder dat verschil meet de test niets
    expect(r.attr).toBe(r.bron >= 0.5 ? r.bron : 0);   // de regel leest planTerug()
  });
  /* v442 sectie 2: opzijInhalen() is een grootboek over de afgesloten periodes: open = onttrokken − afgelost, per periode. Blok 20
     draagt één INHALEN / TERUG TE ZETTEN-regel met het totaal open (geen A/B meer). */
  test('opzijInhalen is een grootboek over de periodes (open = onttrokken − afgelost), en blok 20 draagt één regel', async ({ page }) => {
    const p = seed(); const tx = JSON.parse(p.minder_tx);
    tx.push({ id: 'onttr1', date: `${M1}-12`, amount: -500, acc: SAV, name: 'Spaarpot', desc: 'VAN SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    p.minder_tx = JSON.stringify(tx);
    await open(page, p);
    const r = await page.evaluate(() => { const I = opzijInhalen(), V = maandVooruit();
      return { meetbaar: I.meetbaar, open: I.open, onttrokkenTot: I.onttrokkenTot, afgelost: I.afgelost, nPer: I.periodes.length,
        diag: diagMaandBudget(V, true, null).join('\n') }; });
    expect(r.meetbaar).toBe(true);
    expect(r.open).toBe(r.onttrokkenTot - r.afgelost);             // open = onttrokken − afgelost
    expect(r.open).toBeGreaterThan(0);
    expect(r.nPer).toBeGreaterThan(0);                             // minstens één periode met een tekort
    expect(r.diag).toMatch(/INHALEN \/ TERUG TE ZETTEN \(v442 sectie 2\)/);
    expect(r.diag).toContain('TOTAAL OPEN');
    expect(r.diag).not.toContain('INHALEN (v440 item 3)');        // de oude A/B-regel is weg
  });
  test('planCapacity leest opzij -> advies -> comfortTot, en nooit de spaarinleg', async ({ page }) => {
    await open(page);
    // v440: de spaarinleg bepaalt planCapacity niet meer; zonder gekozen opzij valt hij op het advies, anders comfortTot
    const r = await page.evaluate(() => { delete SET.salVerdeling; SET.savingMode = 'amount'; SET.savingAmount = 9999; window._rekV = null;
      let advies = null; try { const P = rekVoorstel(); if (P && P.ok) advies = Math.round(P.opzij); } catch (_) {}
      let comfort = null; try { comfort = Math.round(noodfondsModel().comfortTot || 0); } catch (_) {}
      return { cap: planCapacity(), inleg: Math.round(monthlySavingTarget() || 0), advies, comfort }; });
    expect(r.inleg).toBe(9999);                                   // de spaarinleg staat op een afwijkend bedrag
    expect(r.cap).not.toBe(r.inleg);                              // en bepaalt planCapacity niet
    expect(r.cap).toBe(r.advies != null ? r.advies : r.comfort);  // advies, anders comfortTot
    expect(await page.evaluate((acc) => { SET.salVerdeling = { rek: { [acc]: 1 }, opzij: 1200 }; window._rekV = null; return planCapacity(); }, MAIN)).toBe(1200);   // de gekozen opzij gaat voor
  });
  test('de te-ruim-sheet heeft drie remedies: ander potje, verlagen vanaf volgende maand, nieuw potje (geen Plan/res/beleg)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), x = (V.potjes || [])[0] || { k: 'boodschappen' };
      const D = teRuimBestemmingen(V, x);
      return { soorten: [...D.vast, ...D.ander, ...(D.nieuw ? [D.nieuw] : []), ...(D.verlaag ? [D.verlaag] : [])].map(b => b.soort),
        verlaag: D.verlaag ? D.verlaag.soort : null }; });
    expect(r.soorten).not.toContain('plan');
    expect(r.soorten).not.toContain('res');
    expect(r.soorten).not.toContain('beleg');
    expect(r.verlaag).toBe('verlaag');                                   // de derde remedie: verlagen vanaf volgende maand
    expect(r.soorten.every(s => s === 'pot' || s === 'nieuw' || s === 'verlaag')).toBe(true);
  });
  /* v440 (item 5): "verlagen vanaf volgende maand" is een budgetwijziging per v436: het potje daalt vanaf volgende maand
     (SET.budgetsNext), deze maand blijft het staan, en er wordt NIETS herverdeeld, dus het maandbudget van volgende maand daalt
     met het vrijgekomen bedrag. SABOTAGE: het vrije bedrag toch bij een ander potje optellen → dan daalt het maandbudget niet. */
  test('verlagen vanaf volgende maand: deze maand blijft, volgende maand daalt met het vrije bedrag, geen herverdeling', async ({ page }) => {
    const p = seed({ maanden: 6 }); const set = JSON.parse(p.minder_set);   // genoeg historie zodat teRuim() rekent
    set.budgets = Object.assign({}, set.budgets, { vervoer: 600 });     // geen vervoer-uitgaven -> ruimer dan nodig
    p.minder_set = JSON.stringify(set);
    await open(page, p);
    const r = await page.evaluate(() => { const V = maandVooruit(), tr = teRuim(V); const x = tr.find(y => y.k === 'vervoer') || tr[0];
      if (!x) return { geen: true };
      const nxt = nextYM(thisYM()), som = o => Object.values(o || {}).reduce((a, v) => a + Math.round(+v || 0), 0);
      const nuVoor = som(SET.budgets), nextVoor = som(budgetVoorMaand(nxt));
      window._tr = { k: x.k, optie: 'a', bestem: 'verlaag', bedrag: null, reden: '', ander: false };
      teRuimBevestig();
      return { k: x.k, bud: x.bud, voorstel: x.voorstel, vrij: x.bud - x.voorstel, nuVoor, nextVoor,
        nuNa: som(SET.budgets), nextNa: som(budgetVoorMaand(nxt)), nextVervoer: Math.round(+(SET.budgetsNext || {})[x.k] || 0) }; });
    expect(r.geen).toBeFalsy();
    expect(r.nuNa).toBe(r.nuVoor);                 // deze maand ongemoeid (v436: de wijziging geldt vanaf volgende maand)
    expect(r.nextVervoer).toBe(r.voorstel);        // vanaf volgende maand op het (lagere) voorstel
    expect(r.nextNa).toBe(r.nextVoor - r.vrij);    // het maandbudget daalt volgende maand met het vrije bedrag (geen herverdeling)
  });
});
