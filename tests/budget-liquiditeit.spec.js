// In-browser bevestiging van de drie openstaande changelog-punten:
//   v53  potjes leidend, inkomen-limiet als spiegel
//   v54  liquiditeit: potjes-plan naast forecast (labels + spiegel)
//   v55  vast = herkende herhaling (gedeelde fixed/variabel-grens, geen dubbeltelling)
//
// De vm-tests toetsen de formules los; deze spec draait de ECHTE app in Chromium en leest de
// live functies en de gerenderde DOM. De fixture staat in budget-fixture.js en is bewust
// kalender-onafhankelijk. Alleen varDue (tempo x resterende dagen) beweegt met de datum;
// daarvoor toetsen we invarianten in plaats van vaste getallen.
const { test, expect } = require('@playwright/test');
const F = require('./budget-fixture.js');
const { open, seed, CUR, LIMIET, POTJES, SPEND_CUR, FIXDUE, VARPLAN, SALDO, SPAAR_SALDO, SAVE_REMAINING, SAFE } = F;

const text = (page, sel) => page.locator(sel).innerText();

// Opent een sheet en wacht tot hij echt zichtbaar is (innerText van een verborgen sheet is leeg).
async function sheet(page, call) {
  await page.evaluate(call);
  await page.waitForSelector('#sheetBg.show');
  return text(page, '#sheet');
}

test('fixture landt met de bedoelde categorieen (bewaakt de keyword-regels)', async ({ page }) => {
  await open(page);
  const cats = await page.evaluate((cur) => {
    const of = (frag) => { const t = TX.find((x) => x.desc.includes(frag) && x.date.startsWith(cur)); return t ? catOf(t) : null; };
    return { salaris: of('SALARIS'), huur: (() => { const t = TX.find((x) => x.desc.includes('HUURBETALING')); return t && catOf(t); })(),
      gift: of('MAANDELIJKSE GIFT'), sport: of('BASIC FIT'), boodschappen: of('ALBERT HEIJN'), uiteten: of('RESTAURANT'), sparen: of('NAAR SPAREN') };
  }, CUR);
  expect(cats).toEqual({ salaris: 'inkomen', huur: 'huur', gift: 'goededoel', sport: 'sport',
    boodschappen: 'boodschappen', uiteten: 'uiteten', sparen: 'sparen' });
});

/* ============================ v53: potjes leidend ============================ */
test.describe('v53 potjes leidend, inkomen-limiet als spiegel', () => {
  test('maandtotaal is de potjes-som, niet de inkomen-limiet', async ({ page }) => {
    await open(page);
    const t = await page.evaluate((m) => totals(m), CUR);
    expect(t.budget).toBe(POTJES);      // 2400 = som van je potjes
    expect(t.potTotal).toBe(POTJES);
    expect(t.limit).toBe(LIMIET);       // 2100 = referentie, geen plafond meer
    expect(Math.round(t.spend)).toBe(SPEND_CUR);
  });

  test('potjes worden niet meer naar de limiet geschaald', async ({ page }) => {
    await open(page);
    const e = await page.evaluate((m) => effectiveBudgets(m), CUR);
    expect(e.out).toEqual({ huur: 900, goededoel: 20, sport: 25, boodschappen: 800, uiteten: 400, shopping: 255 });
    expect(e.scaleV).toBe(1);
    expect(e.room).toBe(POTJES);
    expect(e.fixedB).toBe(920);         // recurring categorieen (huur + goededoel)
    expect(e.varRoom).toBe(1480);       // de rest = basis voor het dag-/weektempo
  });

  test('budgetkaart toont het potjes-totaal met de limiet-spiegel', async ({ page }) => {
    await open(page);
    await page.evaluate(() => go('ins'));
    const t = await text(page, '#s-ins');
    expect(t).toMatch(/maandbudget/i);   // v135: staat nu in de zin "van €2.400 maandbudget"
    expect(t).toContain('€2.400');
    expect(t).toContain('boven inkomen-limiet');
    expect(t).toContain('€300 (70%)');
    const kaart = await page.evaluate((m) => monthStatusCard(m), CUR);
    expect(kaart).not.toContain('€2.100');   // de limiet staat nergens als maandbudget
  });

  test('Instellingen spiegelt dezelfde overschrijding, met de geplande som als noot', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { go('set'); openSet('budget'); });
    const t = await text(page, '#potGridTotal');
    expect(t).toContain('boven je inkomen-limiet');
    expect(t).toContain('€2.400');                       // nu-actief = hoofdgetal (v56)
    expect(t).toContain('€2.450 vanaf volgende maand');   // geplande laag als gelabelde noot
  });
});

/* ===================== v54: potjes-plan naast forecast ===================== */
test.describe('v54 liquiditeit: plan naast forecast', () => {
  test('varPlan is het onbestede variabele plan; de forecast blijft apart', async ({ page }) => {
    await open(page);
    const L = await page.evaluate(() => monthLiquidity());
    expect(L.varPlan).toBe(VARPLAN);                       // potjes-kant
    expect(L.fixDue).toBe(FIXDUE);
    expect(L.sum).toBe(SALDO);
    // forecast-formule ongewijzigd: saldo + inkomen - vast - variabel-op-tempo
    expect(L.projected).toBe(Math.round(L.sum + L.incDue - L.fixDue - L.varDue));
    expect(L.varDue).not.toBe(L.varPlan);                  // twee modellen, bewust niet gelijkgetrokken
  });

  test('de labels benoemen welk model je ziet', async ({ page }) => {
    await open(page);
    // v164: renderLiquidityKPI(), vooruitOpbouw() en vooruitDeep() waren al onbereikbaar en zijn
    // opgeruimd. Het label leeft nog in nogDezeMaandBody(), dus daar bewaken we het.
    expect(await page.evaluate(() => nogDezeMaandCard())).not.toContain('Verwacht over einde maand');
    await page.evaluate(() => go('ins'));   // v144: de tegels wonen alleen nog in de Inzichten-hero
    /* v169: het variabele deel kwam uit L.varDue, een extrapolatie van je tempo. Dat is nu het
       plan (varPlanRemaining), en het staat als eigen regel onder de tegel in plaats van opgeteld
       bij de waargenomen vaste lasten. Op de laatste dag van de maand is het plan nul en toont de
       kaart die regel terecht niet; de assertie volgt dat. */
    const rest = await page.evaluate(() => { const d = daysElapsed(curMonth); return d.dim - d.elapsed; });
    const t = await text(page, '#s-ins');
    expect(t).not.toMatch(/\(tempo\)/);                  // het tempo is geen grondslag meer
    const plan = await page.evaluate((m) => varPlanRemaining(m), await page.evaluate(() => curMonth));
    if (rest > 0 && plan > 0) expect(t).toMatch(/plus €[\d.]+ variabel uit je potjes/);
    else expect(t).not.toMatch(/variabel uit je potjes/);
  });

  test('spiegel vuurt op drempel max(€50, 20%) en spreekt plan vs tempo aan', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({
      ruim: varTempoMirror(100, 200, 'card'),        // gat 100 >= max(50, 40) -> vuurt
      klein: varTempoMirror(100, 130, 'card'),       // gat 30 < 50 -> stil
      relatief: varTempoMirror(1000, 1200, 'card'),  // gat 200 < 20% van 1200 -> stil
      safe: varTempoMirror(100, 200, 'safe'),
      omgekeerd: varTempoMirror(500, 200, 'card'),   // plan boven tempo -> stil
    }));
    expect(r.ruim).toContain('is je tempo boven je plan');
    expect(r.ruim).toContain('€100');
    expect(r.klein).toBe('');
    expect(r.relatief).toBe('');
    expect(r.omgekeerd).toBe('');
    expect(r.safe).toContain('Je variabele potjes hebben nog');
  });

  test('kaart en opbouw-sheet tonen de spiegel precies wanneer de drempel haalt', async ({ page }) => {
    await open(page);
    await page.evaluate(() => openSafeToSpend());
    await page.waitForSelector('#sheetBg.show');
    const r = await page.evaluate(() => {
      const S = safeToSpend();
      return {
        safeFires: varTempoMirror(S.reserved, S.varForecast, 'safe') !== '',
        safeShows: document.getElementById('sheet').innerHTML.includes('Je variabele potjes hebben nog'),
      };
    });
    // de 'card'-kant had zijn lezer al verloren met renderLiquidityKPI(); alleen 'safe' rendert nog
    expect(r.safeShows).toBe(r.safeFires);
  });
});

/* ================== v55: vast = herkende herhaling ================== */
test.describe('v55 vast = herkende herhaling', () => {
  test('categorie bepaalt niet langer vast/variabel', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((cur) => {
      const of = (frag) => TX.find((x) => x.desc.includes(frag) && x.date.startsWith(cur));
      return {
        sportIsFixedCat: FIXED_CATS.has('sport'),
        sportIsFixed: isFixed(of('BASIC FIT')),           // kaart-abonnement -> variabel
        giftIsFixedCat: FIXED_CATS.has('goededoel'),
        giftIsFixed: isFixed(of('MAANDELIJKSE GIFT')),    // periodieke overboeking -> vast
        boodschappenIsFixed: isFixed(of('ALBERT HEIJN')),
        huurIsFixed: isFixed(TX.find((x) => x.desc.includes('HUURBETALING'))),
        recurringCats: [...recurringCats()].sort(),
        split: splitFixedVar(cur),
      };
    }, CUR);
    expect(r.sportIsFixedCat).toBe(true);
    expect(r.sportIsFixed).toBe(false);     // de flip: een FIXED_CATS-post per kaart telt niet meer als vast
    expect(r.giftIsFixedCat).toBe(false);
    expect(r.giftIsFixed).toBe(true);       // de flip andersom: standing order buiten FIXED_CATS is wel vast
    expect(r.huurIsFixed).toBe(true);
    expect(r.boodschappenIsFixed).toBe(false);
    expect(r.recurringCats).toEqual(['goededoel', 'huur']);
    expect(r.split).toEqual({ fixed: 20, vari: 425 });
  });

  // Greenpeace komt hier binnen via het vangnet-pad in monthLiquidity ("robuust vangnet"), niet via het
  // strikte schema. Deze test bewaakt dat ook die route de betaalvorm meegeeft, niet alleen het bedrag.
  test('fixDue telt incasso en periodieke overboeking', async ({ page }) => {
    await open(page, seed({ giftCharged: false }));
    const r = await page.evaluate(() => {
      const L = monthLiquidity();
      return { fixDue: L.fixDue, items: L.fixDueItems.map((s) => ({ name: s.name, amount: s.amount, incasso: !!s.incasso, periodic: !!s.periodic })) };
    });
    expect(r.fixDue).toBe(FIXDUE + 20);
    expect(r.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'Woningcorporatie', amount: 900, incasso: true }),
      expect.objectContaining({ name: 'Greenpeace', amount: 20, periodic: true }),
    ]));
  });

  test('geen dubbeltelling: recurring potjes lopen via fixDue, niet via de reservering', async ({ page }) => {
    await open(page);
    const S = await page.evaluate(() => safeToSpend());
    expect(S.fixDue).toBe(FIXDUE);
    expect(S.reserved).toBe(VARPLAN);          // huur (900) en goededoel (20) zitten hier NIET in
    expect(S.fixDueBudgetExtra).toBe(0);       // het budget-vangnet + de v54-cap zijn vervallen
    expect(S.saveReserved).toBe(SAVE_REMAINING);
    expect(S.savedBal).toBe(SPAAR_SALDO);
    expect(S.safe).toBe(SAFE);
  });

  test('opbouw-sheet toont dezelfde posten, zonder de vervallen budget-post', async ({ page }) => {
    await open(page);
    const t = await sheet(page, () => openSafeToSpend());
    expect(t).toContain('Veilig te besteden');
    expect(t).toContain('€1.945');
    expect(t).toContain('Vaste lasten die nog komen');
    expect(t).toContain('€900');
    expect(t).toContain('Gereserveerd in je potjes');
    expect(t).toContain('€1.055');
    expect(t).not.toContain('Vaste lasten uit je budget');
  });
});

/* ============ v57 (meegenomen): budgetrijen openen hun eigen detail ============ */
test('budgetrij "Uitgegeven" opent het maand-detail vanaf Inzichten', async ({ page }) => {
  await open(page);
  await page.evaluate(() => go('ins'));
  // v135: de rij draagt twee ingangen (uitgegeven en maandbudget), dus mikken we op het woord
  await page.locator('#s-ins >> text=uitgegeven').first().click();
  await page.waitForSelector('#sheetBg.show');
  const t = await text(page, '#sheet');
  expect(t).toContain('€445');
  expect(t).toContain('Boodschappen');
});
