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
    const r = await page.evaluate(() => ({ knop: document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav: document.querySelector('.nav').getBoundingClientRect().top, sw: document.documentElement.scrollWidth }));
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
    expect(await page.locator('[data-griptab][data-afgerond]').evaluateAll(e => e.map(x => x.dataset.griptab))).toEqual(['zien', 'terugblik']);
    expect(await page.locator('[data-stapopen]').count()).toBe(1);   // v388: Uit eten boven is een stap die openstaat
  });
});

test.describe('v387 meters', () => {
  test('Doelen: Plan opzij min de onttrekkingen; een onttrekking erbij laat hem dalen', async ({ page }) => {
    await grip(page);
    const a = await page.evaluate(() => ({ M: gripMeterDoelen(), opzij: planKpiData().opzij, uit: spaarStortStand().uit }));
    expect(a.uit).toBe(500);
    expect(a.M.netto).toBe(a.opzij - 500); expect(a.M.pct).toBe(Math.round((a.opzij - 500) / a.opzij * 100));
    expect(await page.locator('[data-meter="doelen"]').innerText()).toContain(`€${(a.opzij - 500).toLocaleString('nl-NL')} van €${a.opzij.toLocaleString('nl-NL')}`);
    const b = await page.evaluate((sav) => { const t = { id: 'x1', date: '2026-10-10', amount: -150, acc: sav, name: 'Spaarpot', desc: 'VAN SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); return gripMeterDoelen(); }, G.SPAAR);
    expect(b.netto).toBe(a.M.netto - 150); expect(b.pct).toBeLessThan(a.M.pct);
  });
  test('Doelen: een overboeking tussen twee spaarrekeningen telt niet', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate((sav) => { const voor = gripMeterDoelen().netto; const ander = 'NL01SPAR0000009999';
      SET.savingsAcc[ander] = true; if (!OWN.includes(ander)) OWN.push(ander);
      for (const [acc, a] of [[sav, -400], [ander, 400]]) { const t = { id: 'ov' + a, date: '2026-10-10', amount: a, acc, name: 'Eigen', desc: 'OVERBOEKING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); }
      save(); return { voor, na: gripMeterDoelen().netto }; }, G.SPAAR);
    expect(r.na).toBe(r.voor);
  });
  test('Doelen: terugzetten laat hem stijgen', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const voor = gripMeterDoelen(); let ok = false; try { terugzetKies('alles'); ok = true; } catch (_) {} return { voor, na: gripMeterDoelen(), ok }; });
    expect(r.ok).toBe(true);
    expect(r.na.opzij).toBeGreaterThan(r.voor.opzij);
    expect(r.na.netto).toBeGreaterThan(r.voor.netto);
  });
  test('Budget: verwacht gedeeld door het eerlijke budget, zonder wat te ruim is', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); return { M: gripMeterBudget(V), V: { b: V.budget, p: V.projectie } }; });
    expect(r.M.ruim).toBe(629);
    expect(r.M.eerlijk).toBe(r.V.b - 629);
    expect(r.M.pct).toBe(Math.round(r.V.p / (r.V.b - 629) * 100));
    expect(r.M.verschil).toBe(r.V.p - (r.V.b - 629));
    await page.click('[data-meter="budget"]');
    expect(await page.locator('[data-metereerlijk]').innerText()).toContain(`€${(r.V.b - 629).toLocaleString('nl-NL')}`);
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
  test('te ruim is geen ruimte: een gearceerde stap in de bridge, geen uitschieter en geen patroon', async ({ page }) => {
    await grip(page);
    const st = await page.locator('#gripBrug [data-brugstap="teruim"]');
    expect(await st.count()).toBe(1);
    expect(await st.getAttribute('data-brugwaarde')).toBe('-629');
    expect(await st.locator('[data-gearceerd]').count()).toBe(1);
    const r = await page.evaluate(() => { const V = maandVooruit(); const Br = gripZienBrug(V);
      return { som: Br.stappen.slice(0, -1).reduce((a, s) => a + s.waarde, 0), eind: V.projectie, uit: uitschieters(V).map(x => x.k), pat: (insPatronen() || []).map(p => p.k) }; });
    expect(r.som).toBe(r.eind);
    expect(r.uit).not.toContain('huur'); expect(r.pat).not.toContain('huur');
    expect(await page.locator('[data-zienas]').innerText()).toContain('gearceerd = te ruim begroot, telt niet als ruimte');
  });
  test('het gevolg staat er voor bevestigen, en kiezen schrijft niets', async ({ page }) => {
    await grip(page);
    expect(await page.locator('[data-teruimregel]').innerText()).toContain('Huur te ruim · €629');
    await page.click('[data-teruimregel]');
    const voor = await page.evaluate(() => JSON.stringify(SET));
    await page.click('[data-teruimkies="huur"]');
    const g = await page.locator('[data-teruimgevolg="huur"]').innerText();
    expect(g).toContain('Potje Huur €700 → €71'); expect(g).toContain('€629 minder ruimte op papier'); expect(g).toContain('Je uitgaven veranderen niet');
    expect(await page.evaluate(() => JSON.stringify(SET))).toBe(voor);
    await page.click('[data-teruimbevestig="huur"]');
    const na = await page.evaluate(() => ({ b: SET.budgets.huur, log: SET.teRuimLog, ruim: teRuim().map(x => x.k) }));
    expect(na.b).toBe(71); expect(na.log[0]).toEqual(expect.objectContaining({ k: 'huur', van: 700, naar: 71 })); expect(na.ruim).toEqual([]);
    expect(await page.locator('[data-teruimregel]').count()).toBe(0);
  });
  test('laten staan haalt de melding weg voor deze maand, en het blijft gearceerd en buiten het eerlijke budget', async ({ page }) => {
    await grip(page);
    await page.click('[data-teruimregel]'); await page.click('[data-teruimlaten="huur"]');
    await page.evaluate(() => closeSheet());
    expect(await page.locator('[data-teruimregel]').count()).toBe(0);
    expect(await page.locator('#gripBrug [data-brugstap="teruim"]').count()).toBe(1);
    expect(await page.evaluate(() => gripMeterBudget().ruim)).toBe(629);
    expect(await page.evaluate(() => SET.budgets.huur)).toBe(700);
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
  expect(r.t).toContain('eerlijk budget:');
});
