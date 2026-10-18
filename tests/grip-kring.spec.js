/* v387: GRIP ALS REGELKRING, deel 1 (structuur, meters en Zien). Op de nagebouwde stand van het toestel
   (grip-kring-stand.js, 10 oktober 2026): Huur EUR 700 op vast met Shurgard EUR 71 vier-wekelijks. */
const { test, expect } = require('@playwright/test');
const G = require('./grip-kring-stand');
const OPN = [['2026-10-06', 300], ['2026-10-09', 200]];
async function grip(page, o) { await G.boot(page, Object.assign({ opnames: OPN }, o || {})); await page.evaluate(() => go('maand')); }

test.describe('v387 structuur', () => {
  test('Grip opent altijd op Zien, ook als je op een andere tab vertrok', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => gripKiesTab('kiezen'));
    expect(await page.getAttribute('#gripInhoud', 'data-griptabinhoud')).toBe('kiezen');
    await page.evaluate(() => { go('dash'); go('maand'); });
    expect(await page.getAttribute('#gripInhoud', 'data-griptabinhoud')).toBe('zien');
    expect(await page.locator('[data-griptab="zien"].on').count()).toBe(1);
  });
  test('vaste bovenkant: drie meters, vier tabs en de knop Ik wil iets kopen; de oude blokken zijn weg', async ({ page }) => {
    await grip(page);
    expect(await page.locator('#gripMeters [data-meter]').evaluateAll(e => e.map(x => x.dataset.meter))).toEqual(['budget', 'doelen', 'beleggen']);
    expect(await page.locator('#gripTabs [data-griptab]').evaluateAll(e => e.map(x => x.textContent.replace('•', '').trim()))).toEqual(['Zien', 'Begrijpen', 'Kiezen', 'Terugblik']);
    expect(await page.locator('#gripKoopcheck').innerText()).toContain('Ik wil iets kopen');
    for (const sel of ['#gripTegels', '[data-tegel]', '#gripDezeMaand']) expect(await page.locator(sel).count()).toBe(0);
    expect(await page.locator('#gripNaarLogboek').count()).toBe(0);   // het logboek staat op Terugblik, een keer
    await page.evaluate(() => gripKiesTab('terugblik'));
    expect(await page.locator('#s-maand >> text=Logboek').count()).toBe(1);
  });
  test('het scherm past op 390x844 boven de menubalk', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await grip(page);
    // v393 (keuze van de gebruiker): de eis geldt MET een potje onder de drempel (Vices +EUR 5 staat als noot bij overig)
    // en met de regel "Eerlijk budget lager" onder de meters; de labels van de bridge staan op een regel.
    // v394: de melding "N potjes te ruim" is weg; de regel onder de meter is de enige ingang.
    /* v428: de brug staat niet meer op Zien maar in Begrijpen ("Waar zit de EUR X?"), dus de noot van v393 staat niet op
       Grip; de regel onder de meters blijft, en de koopknop staat vast minstens 16px boven de menubalk. */
    const r = await page.evaluate(() => ({ brug: document.querySelectorAll('#gripInhoud [data-brugstap]').length,
      eerlijk: document.querySelectorAll('#gripMeters ~ [data-nietgebruikt]').length, melding: document.querySelectorAll('[data-teruimregel]').length,
      knop: document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav: document.querySelector('.nav').getBoundingClientRect().top, sw: document.documentElement.scrollWidth }));
    expect(r.brug).toBe(0);
    expect(r.eerlijk).toBe(1);
    expect(r.melding).toBe(0);
    expect(r.knop).toBeLessThanOrEqual(r.nav - 16);
    expect(r.sw).toBeLessThanOrEqual(390);
  });
  test('een tab die je verliet is afgerond; Terugblik pas na afsluiten van de maand (v390)', async ({ page }) => {
    await grip(page);
    expect(await page.locator('[data-griptab][data-afgerond]').count()).toBe(0);
    await page.evaluate(() => gripKiesTab('begrijpen'));
    expect(await page.locator('[data-griptab="zien"]').innerText()).toBe('Zien ✓');
    await page.evaluate(() => gripKiesTab('terugblik'));
    expect(await page.locator('[data-griptab][data-afgerond]').evaluateAll(e => e.map(x => x.dataset.griptab))).toEqual(['zien']);   // openen is geen afronding
    await page.evaluate(() => { SET.maandAfsluiting = Object.assign({}, SET.maandAfsluiting, { '2026-09': { op: '2026-10-10', punten: [], afspraken: [], open: [] } }); save(); renderMaand(); });
    expect(await page.locator('[data-griptab][data-afgerond]').evaluateAll(e => e.map(x => x.dataset.griptab))).toEqual(['zien']);   // v391: afgesloten zonder meting is geen ✓
    await page.evaluate(() => { SET.gripOpzij = { '2026-09': { opzij: 1000 } }; save(); renderMaand(); });
    expect(await page.locator('[data-griptab][data-afgerond]').evaluateAll(e => e.map(x => x.dataset.griptab))).toEqual(['zien', 'terugblik']);
    expect(await page.locator('[data-stapopen]').count()).toBe(1);   // v388: Uit eten boven is een stap die openstaat
  });
});

test.describe('v387 meters', () => {
  test('Doelen: een overboeking tussen twee spaarrekeningen telt niet', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate((sav) => { const voor = gripMeterDoelen().netto; const ander = 'NL01SPAR0000009999';
      SET.savingsAcc[ander] = true; if (!OWN.includes(ander)) OWN.push(ander);
      for (const [acc, a] of [[sav, -400], [ander, 400]]) { const t = { id: 'ov' + a, date: '2026-10-10', amount: a, acc, name: 'Eigen', desc: 'OVERBOEKING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); }
      save(); return { voor, na: gripMeterDoelen().netto }; }, G.SPAAR);
    expect(r.na).toBe(r.voor);
  });
  test('Budget: verwacht gedeeld door het maandbudget (v398); te ruim staat erbij als niet gebruikt en trekt niet af', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); return { M: gripMeterBudget(V), V: { b: V.budget, p: V.projectie } }; });
    // v392: Huur 629 plus het variabele deel van Vervoer 390 (1.100 naar 710)
    expect(r.M.ruim).toBe(948);
    expect(r.M.pct).toBe(Math.round(r.V.p / r.V.b * 100));
    expect(r.M.verschil).toBe(Math.round(r.V.p) - Math.round(r.V.b));
    /* v436: een tik op de Budget-meter opent de brug in Begrijpen; de meter-sheet opent vanuit de kop van die brug */
    await page.evaluate(() => openGripMeter('budget'));
    expect(await page.locator('[data-meterbudget]').innerText()).toContain(`€${Math.round(r.V.b).toLocaleString('nl-NL')}`);
    expect(await page.locator('[data-meterruim]').evaluateAll(e => e.map(x => x.dataset.meterruim))).toEqual(['huur', 'vervoer']);
  });
  test('Beleggen: de noemer is wat te beoordelen is, met de onbekende erbij en waarom', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const M = gripMeterBeleggen(); return { g: M.gehaald, n: M.n, onb: M.onb.map(v => v.key), alle: M.B.voorwaarden.length }; });
    expect(r.alle).toBe(3); expect(r.onb).toEqual(['dekking']); expect(r.n).toBe(2);
    expect(await page.locator('[data-meter="beleggen"]').innerText()).toContain(`${r.g}/2`);
    expect(await page.locator('[data-meter="beleggen"]').innerText()).toContain('1 onbekend');
    await page.click('[data-meter="beleggen"]');
    expect(await page.locator('[data-meterwv="dekking"]').innerText()).toContain('geen reserveringen');
    await page.click('[data-meterwv="dekking"]');   // de ingang naar je reserveringen hangt hier, nu de tegel weg is
    expect(await page.locator('#sheet').innerText()).toMatch(/Reserveringen|reservering/);
  });
});

test.describe('v387 te ruim begroot', () => {
  test('Huur EUR 700 met EUR 71 nodig is te ruim, Verzekeringen met DELA in december niet', async ({ page }) => {
    await grip(page);
    const L = await page.evaluate(() => Object.fromEntries(teRuimLijst().map(x => [x.k, { ruim: x.ruim, nodig: x.nodig, voorstel: x.voorstel, te: x.teRuim, reden: x.reden, maand: x.maand }])));
    expect(L.huur).toEqual(expect.objectContaining({ ruim: true, nodig: 142, voorstel: 142, te: 558 }));
    expect(L.verzekering.ruim).toBe(false); expect(L.verzekering.nodig).toBe(324); expect(L.verzekering.maand).toBe('2026-12');
    expect(L.verzekering.reden).toContain('in december');
    expect(L.sport.ruim).toBe(false); expect(L.abonnement.ruim).toBe(false);
  });
  test('een 4-wekelijkse post telt per termijn: twee termijnen in een maand', async ({ page }) => {
    await grip(page);
    const n = await page.evaluate(() => [teRuimTermijnen({ cadans: '4w', afstand: 29, nextDate: new Date(2026, 9, 1) }, '2026-10'),
      teRuimTermijnen({ cadans: '4w', afstand: 29, nextDate: new Date(2026, 9, 1) }, '2026-11'),
      teRuimTermijnen({ intervalM: 3, nextDate: new Date(2026, 11, 27) }, '2027-03'), teRuimTermijnen({ intervalM: 3, nextDate: new Date(2026, 11, 27) }, '2027-02')]);
    expect(n).toEqual([2, 1, 1, 0]);
  });
  /* v398: te ruim is een eigen grijze stap in de bridge ("niet gebruikt"), geen uitschieter en geen patroon; de bridge loopt
     van het maandbudget naar verwacht. */
  test('te ruim is geen ruimte: een grijze stap "niet gebruikt", geen uitschieter en geen patroon', async ({ page }) => {
    await grip(page);
    /* v428: de brug op Grip ("Waar zit de EUR X?", Begrijpen) loopt per groep; te ruim staat in de sheet per groep
       (vast en potjes, "niet gebruikt ›"). De oude Zien-brug (gripZienBrug) blijft de rekensom van de keuze-sheet. */
    await page.evaluate(() => { gripKiesTab('begrijpen'); openGripGroepen(); });
    expect(await page.locator('#gripGroepen [data-groepteruim]').count()).toBe(2);   // v392: Huur (vast) en het variabele deel van Vervoer (potjes)
    const r = await page.evaluate(() => { const V = maandVooruit(); const Br = gripZienBrug(V);
      return { som: Br.stappen.slice(1, -1).reduce((a, s) => a + s.waarde, Br.stappen[0].waarde), tr: Br.stappen.filter(s => s.soort === 'teruim').reduce((a, s) => a + s.waarde, 0), eind: Math.round(V.projectie), uit: uitschieters(V).map(x => x.k), pat: (insPatronen() || []).map(p => p.k) }; });
    expect(r.tr).toBe(-948);
    expect(r.som).toBe(r.eind);
    expect(r.uit).not.toContain('huur'); expect(r.pat).not.toContain('huur');
    expect(await page.locator('#gripGroepBrug [data-gearceerd]').count()).toBe(0);
  });
  test('het gevolg staat er voor bevestigen, en kiezen schrijft niets (v398: met een bestemming)', async ({ page }) => {
    await grip(page);
    expect(await page.locator('[data-teruimregel]').count()).toBe(0);   // v394: geen melding meer op Zien
    await page.evaluate(() => openTeRuim('huur'));
    const voor = await page.evaluate(() => JSON.stringify(SET));
    /* v440: Plan/reservering/beleggen zijn geen te-ruim-bestemming meer; de verschuiving gaat naar een potje */
    await page.evaluate(() => { const V = maandVooruit(), D = teRuimBestemmingen(V, teRuim(V).find(t => t.k === 'huur')); window._tr.optie = 'a'; window._tr.bestem = (D.nieuw || D.ander[0] || D.vast[0]).id; renderTeRuim(); });
    const g = await page.locator('[data-teruimgevolg="huur"]').innerText();
    expect(g).toContain('Huur €700 → €142');
    expect(await page.evaluate(() => JSON.stringify(SET))).toBe(voor);   // kiezen schrijft niets tot bevestigen
    await page.click('[data-teruimbevestig]');
    const na = await page.evaluate(() => ({ b: SET.budgets.huur, log: SET.teRuimLog }));
    expect(na.b).toBe(142); expect(na.log[0]).toEqual(expect.objectContaining({ k: 'huur', van: 700, naar: 142 }));
  });
  test('laten staan: het potje blijft, de stap blijft "niet gebruikt" en de regel zegt "zelf gekozen" (v398)', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => openTeRuim('huur')); await page.click('[data-teruimoptie="c"]'); await page.click('[data-teruimbevestig]');
    expect(await page.evaluate(() => ({ b: SET.budgets.huur, zelf: teRuimZelf('huur'), ruim: gripMeterBudget().ruim }))).toEqual({ b: 700, zelf: true, ruim: 948 });
    await page.evaluate(() => { closeSheet(); gripKiesTab('begrijpen'); openGripGroepen(); });
    expect(await page.locator('#gripGroepen [data-groepteruim]').count()).toBe(2);   // v428: in de sheet per groep
  });
  test('een vast potje zonder betaling is nooit te ruim', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { TX = TX.filter(t => t.name !== 'Shurgard NL'); save(); const x = teRuimLijst().find(y => y.k === 'huur'); return { ruim: x.ruim, geen: x.vast && x.vast.geen }; });
    expect(r.geen).toBe(true); expect(r.ruim).toBe(false);
  });
});

test('blok 19 schrijft per potje uit waarom het te ruim is, en leest alleen', async ({ page }) => {
  await grip(page);
  const r = await page.evaluate(() => { const voor = JSON.stringify(SET); const t = diagTeRuim(); return { t: t.join('\n'), zelfde: JSON.stringify(SET) === voor, blok: DIAG_BLOKKEN.some((b) => b.lees === diagTeRuim) }; });
  expect(r.blok).toBe(true); expect(r.zelfde).toBe(true);
  expect(r.t).toContain('Huur (huur): 700 | vast 700/71 | variabel - | nodig 142 in 2027-09 (twee termijnen Shurgard Nl in september) | voorstel 142 | TE RUIM 558');   // v409: Shurgard 4-wekelijks, 13 termijnen per jaar
  expect(r.t).toMatch(/Verzekeringen \(verzekering\): 335 .* nodig 324 in 2026-12 \(Dela Natura- en levensv in december\) .* niet te ruim/);
  expect(r.t).toContain('budget-meter (v398, aan het maandbudget)');
});
