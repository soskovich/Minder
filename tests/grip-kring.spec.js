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
    const r = await page.evaluate(() => { const lab = [...document.querySelectorAll('#gripBrug [data-brugeen]')];
      return { noot: document.querySelectorAll('#gripBrug [data-brugnoot]').length, eerlijk: document.querySelectorAll('#gripMeters ~ [data-nietgebruikt]').length, melding: document.querySelectorAll('[data-teruimregel]').length,
        lab: Math.max(...lab.map(e => e.getBoundingClientRect().height)), brug: document.querySelector('#gripBrug').getBoundingClientRect().height,
        knop: document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav: document.querySelector('.nav').getBoundingClientRect().top, sw: document.documentElement.scrollWidth }; });
    console.log(`zien: bridge ${Math.round(r.brug)}px, hoogste label ${Math.round(r.lab)}px, knop ${Math.round(r.knop)}px, menubalk ${Math.round(r.nav)}px`);
    expect(r.noot).toBe(1);
    expect(r.eerlijk).toBe(1);
    expect(r.melding).toBe(0);
    expect(r.lab).toBeLessThan(13);   // een regel van 9px
    expect(r.knop).toBeLessThanOrEqual(r.nav);
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
  /* v397: een opname uit vrij spaargeld wordt standaard teruggezet, dus hij verhoogt "opzij" net zoveel als "eruit": de
     meter blijft op hetzelfde netto staan en zijn percentage daalt. */
  test('Doelen: Plan opzij min de onttrekkingen; een onttrekking erbij laat het percentage dalen', async ({ page }) => {
    await grip(page);
    const a = await page.evaluate(() => ({ M: gripMeterDoelen(), opzij: planKpiData().opzij, uit: spaarStortStand().uit }));
    expect(a.uit).toBe(500);
    expect(a.M.netto).toBe(a.opzij - 500); expect(a.M.pct).toBe(Math.round((a.opzij - 500) / a.opzij * 100));
    expect(await page.locator('[data-meter="doelen"]').innerText()).toContain(`€${(a.opzij - 500).toLocaleString('nl-NL')} van €${a.opzij.toLocaleString('nl-NL')}`);
    const b = await page.evaluate((sav) => { const t = { id: 'x1', date: '2026-10-10', amount: -150, acc: sav, name: 'Spaarpot', desc: 'VAN SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); return gripMeterDoelen(); }, G.SPAAR);
    expect(b.opzij).toBe(a.opzij + 150); expect(b.netto).toBe(a.M.netto); expect(b.pct).toBeLessThan(a.M.pct);
  });
  test('Doelen: een overboeking tussen twee spaarrekeningen telt niet', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate((sav) => { const voor = gripMeterDoelen().netto; const ander = 'NL01SPAR0000009999';
      SET.savingsAcc[ander] = true; if (!OWN.includes(ander)) OWN.push(ander);
      for (const [acc, a] of [[sav, -400], [ander, 400]]) { const t = { id: 'ov' + a, date: '2026-10-10', amount: a, acc, name: 'Eigen', desc: 'OVERBOEKING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); }
      save(); return { voor, na: gripMeterDoelen().netto }; }, G.SPAAR);
    expect(r.na).toBe(r.voor);
  });
  /* v397: terugzetten is de standaard; "niet terug" voor het deel uit vrij spaargeld laat de meter dalen. */
  test('Doelen: niet terugzetten laat hem dalen, terugzetten is de standaard', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const voor = gripMeterDoelen(); const vrij = spaarStortStand().vrijTerug; terugzetVrijZet('niet'); const niet = gripMeterDoelen(); terugzetVrijZet('alles'); return { voor, niet, vrij, terug: gripMeterDoelen() }; });
    expect(r.vrij).toBeGreaterThan(0);   // invoermeting: er ging iets uit vrij spaargeld
    expect(r.niet.opzij).toBe(r.voor.opzij - r.vrij);
    expect(r.niet.netto).toBeLessThan(r.voor.netto);
    expect(r.terug).toEqual(r.voor);
  });
  test('Budget: verwacht gedeeld door het maandbudget (v398); te ruim staat erbij als niet gebruikt en trekt niet af', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); return { M: gripMeterBudget(V), V: { b: V.budget, p: V.projectie } }; });
    // v392: Huur 629 plus het variabele deel van Vervoer 390 (1.100 naar 710)
    expect(r.M.ruim).toBe(1019);
    expect(r.M.pct).toBe(Math.round(r.V.p / r.V.b * 100));
    expect(r.M.verschil).toBe(Math.round(r.V.p) - Math.round(r.V.b));
    await page.click('[data-meter="budget"]');
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
    expect(L.huur).toEqual(expect.objectContaining({ ruim: true, nodig: 71, voorstel: 71, te: 629 }));
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
    expect(await page.locator('#gripBrug [data-brugstap="teruim"]').count()).toBe(2);   // v392: Huur en het variabele deel van Vervoer
    const r = await page.evaluate(() => { const V = maandVooruit(); const Br = gripZienBrug(V);
      return { som: Br.stappen.slice(1, -1).reduce((a, s) => a + s.waarde, Br.stappen[0].waarde), tr: Br.stappen.filter(s => s.soort === 'teruim').reduce((a, s) => a + s.waarde, 0), eind: Math.round(V.projectie), uit: uitschieters(V).map(x => x.k), pat: (insPatronen() || []).map(p => p.k) }; });
    expect(r.tr).toBe(-1019);
    expect(r.som).toBe(r.eind);
    expect(r.uit).not.toContain('huur'); expect(r.pat).not.toContain('huur');
    expect(await page.locator('#gripBrug [data-gearceerd]').count()).toBe(0);
  });
  test('het gevolg staat er voor bevestigen, en kiezen schrijft niets (v398: met een bestemming)', async ({ page }) => {
    await grip(page);
    expect(await page.locator('[data-teruimregel]').count()).toBe(0);   // v394: geen melding meer op Zien
    await page.evaluate(() => openTeRuim('huur'));
    const voor = await page.evaluate(() => JSON.stringify(SET));
    await page.click('[data-teruimoptie="a"]'); await page.click('[data-teruimbestem="plan"]');
    const g = await page.locator('[data-teruimgevolg="huur"]').innerText();
    expect(g).toContain('Huur €700 → €71'); expect(g).toContain('Maandbudget €3.325 blijft');
    expect(await page.evaluate(() => JSON.stringify(SET))).toBe(voor);
    await page.click('[data-teruimbevestig]');
    const na = await page.evaluate(() => ({ b: SET.budgets.huur, log: SET.teRuimLog, ruim: teRuim().map(x => x.k) }));
    expect(na.b).toBe(71); expect(na.log[0]).toEqual(expect.objectContaining({ k: 'huur', van: 700, naar: 71, bestemSoort: 'plan' })); expect(na.ruim).toEqual(['vervoer']);
    expect(await page.locator('#gripMeters ~ [data-nietgebruikt]').innerText()).toBe('waarvan €390 Vervoer & auto niet gebruikt ›');   // Huur is weg
  });
  test('laten staan: het potje blijft, de stap blijft "niet gebruikt" en de regel zegt "zelf gekozen" (v398)', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => openTeRuim('huur')); await page.click('[data-teruimoptie="c"]'); await page.click('[data-teruimbevestig]');
    expect(await page.evaluate(() => ({ b: SET.budgets.huur, zelf: teRuimZelf('huur'), ruim: gripMeterBudget().ruim }))).toEqual({ b: 700, zelf: true, ruim: 1019 });
    expect(await page.locator('#gripBrug [data-brugstap="teruim"]').count()).toBe(2);
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
  expect(r.t).toContain('Huur (huur): 700 | vast 700/71 | variabel - | nodig 71 in 2026-10 | voorstel 71 | TE RUIM 629');
  expect(r.t).toMatch(/Verzekeringen \(verzekering\): 335 .* nodig 324 in 2026-12 \(Dela Natura- en levensv in december\) .* niet te ruim/);
  expect(r.t).toContain('budget-meter (v398, aan het maandbudget)');
});
