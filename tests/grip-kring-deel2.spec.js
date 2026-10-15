// v388: GRIP ALS REGELKRING, DEEL 2. Begrijpen (patronen als oorzaak, klopt/niet met een reden die meeweegt), Kiezen
// (een rij per patroon, voortgang, uitgevoerde meldingen, volgorde, moment, een stap die blijft liggen), de keuze-sheet
// (opties met ≈, bridge vóór en ná, meetlat) en Terugblik (✓ ½ ✗, geschoven apart, spaardoel ½ vanaf 80%, score).
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const OPNAMES = [['2026-10-06', 300], ['2026-10-09', 400]];
const grip = async (page, o) => { await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page, o); await page.evaluate(() => go('maand')); };
const tab = (page, t) => page.evaluate(t => gripKiesTab(t), t);
const tekst = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);

test.describe('v388 begrijpen', () => {
  test('onttrekkingen zijn altijd een patroon en staan eerst, met de potjes erboven als signaal en een bewijsregel', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    const P = await page.evaluate(() => gripPatronen().map(p => ({ id: p.id, naam: p.naam, sig: p.sig.map(s => s.soort + ':' + (s.k || '')), bewijs: p.bewijs })));
    expect(P[0].id).toBe('spaargeld');
    expect(P[0].naam).toBe('Betaalrekening op na ~12 dagen na salaris');
    expect(P[0].sig).toEqual(['onttrekking:', 'potje:uiteten']);
    expect(P[0].bewijs).toBe('2× uit je spaarrekening (6, 9 okt)');
    await page.evaluate(() => gripNaarSymptoom('pat:spaargeld'));   // v428: de patroonboom staat in de drill van het symptoom
    expect(await tekst(page, '[data-patbewijs]')).toBe('Gezien: 2× uit je spaarrekening (6, 9 okt)');
    expect(await page.locator('[data-patsig="onttrekking"]').innerText()).toContain('€700');
  });
  test('zonder onttrekking is een potje boven een eigen patroon, en er is geen spaargeld-patroon', async ({ page }) => {
    await grip(page);
    const ids = await page.evaluate(() => gripPatronen().map(p => p.id));
    expect(ids).toEqual(['pot:uiteten']);
  });
  test('"niet" vraagt een reden zonder voorkeuze, de reden wordt bewaard, en hij weegt mee in de maand erna', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await tab(page, 'kiezen');   // v428: klopt/niet staat bij de keuze in Kiezen
    await page.click('[data-kiesoordeel="spaargeld"] button:has-text("niet")');
    expect(await page.locator('[data-patreden]').count()).toBe(4);
    expect(await page.locator('[data-patreden].on').count()).toBe(0);
    expect(await page.evaluate(() => (SET.gripOordeel || {})['2026-10'])).toBeUndefined();   // openen schrijft niets
    await page.click('[data-patreden="tekort"]');
    expect(await page.evaluate(() => SET.gripOordeel['2026-10'].spaargeld)).toMatchObject({ klopt: false, reden: 'tekort' });
    // een maand later: dezelfde oorzaak draagt jouw reden als naam
    await page.evaluate(() => { SET.gripOordeel = { '2026-09': SET.gripOordeel['2026-10'] }; save(); });
    const p = await page.evaluate(() => gripPatronen()[0]);
    expect(p.naam).toBe('Tekort op betaalrekening');
    expect(p.naamApp).toBe('Betaalrekening op na ~12 dagen na salaris');
  });
  test('zeg je deze maand "klopt", dan gaat de naam terug naar wat de app ziet en blijft het bewijs staan', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await page.evaluate(() => { SET.gripOordeel = { '2026-09': { spaargeld: { klopt: false, reden: 'impuls', op: '2026-09-20' } } }; save(); renderMaand(); });
    expect(await page.evaluate(() => gripPatronen()[0].naam)).toBe('Impulsaankopen');
    await tab(page, 'kiezen'); await page.click('[data-kiesoordeel="spaargeld"] button:has-text("klopt")');
    const p = await page.evaluate(() => gripPatronen()[0]);
    expect(p.naam).toBe('Betaalrekening op na ~12 dagen na salaris');
    expect(p.vorigeReden).toBeUndefined();
    await page.evaluate(() => gripNaarSymptoom('pat:spaargeld'));
    expect(await tekst(page, '[data-patnaam]')).toBe('Betaalrekening op na ~12 dagen na salaris');
    expect(await tekst(page, '[data-patbewijs]')).toBe('Gezien: 2× uit je spaarrekening (6, 9 okt)');
  });
  test('de dagen tellen vanaf de laatste salarisbetaling op of voor de eerste onttrekking, en zonder salaris staat dat er', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });   // eerste onttrekking 6 okt, salaris 24 sep: 12 dagen
    expect(await page.evaluate(() => gripPatronen()[0].salaris)).toBe('2026-09-24');
    // een salarisbetaling NA de eerste onttrekking telt niet: het geld was toen al op
    const na = await page.evaluate(() => { const t = { id: 'salvroeg', date: '2026-10-08', amount: 5216, acc: 'NL01MAIN0000001111', name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); const p = gripPatronen()[0]; return [p.salaris, p.naam]; });
    expect(na).toEqual(['2026-09-24', 'Betaalrekening op na ~12 dagen na salaris']);
    const zonder = await page.evaluate(() => { TX = TX.filter(t => !/SALARIS/.test(t.desc || '')); save(); return gripPatronen()[0].naam; });
    expect(zonder).toBe('Betaalrekening op · salarisdatum onbekend');
  });
  test('klopt rondt Begrijpen af met een ✓ zodra elk patroon een oordeel heeft', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    expect(await page.locator('[data-griptab="begrijpen"][data-afgerond]').count()).toBe(0);
    await tab(page, 'kiezen'); await page.click('[data-kiesoordeel="spaargeld"] button:has-text("klopt")');
    expect(await page.locator('[data-griptab="begrijpen"][data-afgerond]').count()).toBe(1);
  });
});

test.describe('v388 kiezen en de keuze-sheet', () => {
  test('een rij per patroon met nu en voortgang, en de stip op Kiezen zolang er een stap openstaat', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    expect(await page.locator('[data-griptab="kiezen"] [data-stapopen]').count()).toBe(1);
    await tab(page, 'kiezen');
    expect(await page.locator('[data-kiesrij="spaargeld"]').getAttribute('data-kiesstand')).toBe('open');   // v428: Te kiezen telt wat open staat
    expect(await page.locator('[data-kiesvoortgang]').getAttribute('data-tekiezen')).toBe(String(await page.evaluate(() => gripCyc().kies.length)));
  });
  test('de sheet: niets voorgekozen, ≈ per optie, bevestigen pas na een keuze en de meetlat', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await page.evaluate(() => { gripOordeelZet('spaargeld', true); openGripKeuze('spaargeld'); });   // v391: eerst bevestigen
    expect(await page.locator('[data-gripoptie]').count()).toBe(3);
    expect(await page.locator('[data-keuzebevestig]').isDisabled()).toBe(true);
    expect(await page.locator('[data-keuzebrug], [data-meetlat]').count()).toBe(0);   // niets voorgekozen
    expect(await page.evaluate(() => window._gripK.optie)).toBeNull();
    expect(await page.locator('[data-effect="Budget"]').first().innerText()).toContain('≈ −€67');
    expect(await page.locator('[data-gripoptie="terug"] [data-effect="Doelen"]').innerText()).toContain('≈ +€700');
    await page.click('[data-gripoptie="grens"]');
    expect(await page.locator('[data-keuzebevestig]').isDisabled()).toBe(true);   // de meetlat is nog niet bevestigd
    expect(await page.locator('[data-latregel]').allInnerTexts()).toEqual(['• geen geld uit je spaargeld na 10 okt', '• Uit eten & café ≤ €55']);
    // bridge vóór (gestippeld) en ná: Uit eten gaat van +67 naar 0
    expect(await page.locator('[data-keuzebrug] [data-voor]').count()).toBeGreaterThan(0);
    expect(await tekst(page, '[data-keuzeboven]')).toBe('budget €1.614 onder → €1.681 onder');   // v398: tegen het maandbudget (3325 - 1711), niet meer het eerlijke budget
    expect(await page.evaluate(() => (SET.gripKeuze || {})['2026-10'])).toBeUndefined();
    await page.click('[data-latok]');
    await page.click('[data-keuzebevestig]');
    const k = await page.evaluate(() => SET.gripKeuze['2026-10'].spaargeld);
    expect(k).toMatchObject({ optie: 'grens', schuift: false });
    expect(k.lat.map(r => r.soort)).toEqual(['onttrekking', 'potmax']);
    await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); });
    expect(await page.locator('[data-kiesrij="spaargeld"]').getAttribute('data-kiesstand')).toBe('gekozen');   // v428: onder Al gekozen deze maand
    expect(await page.locator('#gripTeKiezen [data-kiesrij="spaargeld"]').count()).toBe(0);
    expect(await page.locator('[data-griptab="kiezen"] [data-stapopen]').count()).toBe(await page.evaluate(() => gripCyc().kies.length > 0 ? 1 : 0));   // v428: de stip is N keuzes open
    expect(await page.locator('[data-griptab="kiezen"][data-afgerond]').count()).toBe(1);
    await page.evaluate(() => go('logboek'));
    expect(await tekst(page, '[data-loggripkeuze]')).toContain('Niets meer uit je spaargeld');
  });
  test('de meetlat is aan te passen voordat je bevestigt', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await page.evaluate(() => { gripOordeelZet('spaargeld', true); openGripKeuze('spaargeld'); });   // v391: eerst bevestigen
    await page.click('[data-gripoptie="grens"]'); await page.click('[data-lataanpas]');
    await page.fill('[data-latmax="1"]', '70'); await page.click('[data-latok]'); await page.click('[data-keuzebevestig]');
    expect(await page.evaluate(() => SET.gripKeuze['2026-10'].spaargeld.lat[1].max)).toBe(70);
  });
  test('een optie die pas volgende maand werkt zegt dat, en telt als schuiven', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await page.evaluate(() => { gripOordeelZet('spaargeld', true); openGripKeuze('spaargeld'); });   // v391: eerst bevestigen
    await page.click('[data-gripoptie="sparen"]');
    expect(await tekst(page, '[data-keuzelater]')).toContain('Werkt vanaf november');
    expect(await page.locator('[data-geenlat]').innerText()).toContain('geschoven');
  });
  test('de 2e maand op rij boven: de eerste optie is herzien', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { const t = { id: 'xsep', date: '2026-09-25', amount: -60, acc: 'NL01MAIN0000001111', name: 'Cafe Extra', desc: 'BEA, BETAALPAS CAFE EXTRA', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'uiteten'; save(); });
    const r = await page.evaluate(() => { const p = gripPatronen().find(x => x.id === 'pot:uiteten'); return { twee: p.twee, eerste: gripOpties(p)[0].id }; });
    expect(r).toEqual({ twee: true, eerste: 'dekken' });
    // en zonder die maand ervoor is de eerste optie binnen het potje blijven
    await grip(page);
    expect(await page.evaluate(() => gripOpties(gripPatronen()[0])[0].id)).toBe('grens');
  });
  test('een uitgevoerde melding uit Zien staat in Kiezen met wat hij deed', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await page.evaluate(() => { openTeRuim('huur'); teRuimKies('a'); window._tr.bestem = 'plan'; teRuimBevestig(); gripKiesTab('kiezen'); });
    expect(await tekst(page, '#gripAlGekozen [data-uitgevoerd="huur"]')).toMatch(/Huur · budget €142[\s\S]*€558 naar Plan · sparen/);   // v428: onder Al gekozen deze maand   // v398: met de bestemming
  });
  test('volgorde: van de app of zelf, en spaargeld blijft eerst', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    const ids = await page.evaluate(() => { SET.gripVolgorde = { modus: 'zelf', ids: ['pot:x', 'spaargeld'] }; return gripVolgordeApp([{ id: 'pot:a', bedrag: 5, naam: 'a' }, { id: 'spaargeld', bedrag: 1, naam: 's' }, { id: 'pot:b', bedrag: 9, naam: 'b' }]).map(p => p.id); });
    expect(ids).toEqual(['spaargeld', 'pot:b', 'pot:a']);
    expect(await page.evaluate(() => gripPatronen()[0].id)).toBe('spaargeld');
    // je eigen volgorde, en spaargeld blijft ook daarin eerst
    const zelf = await page.evaluate(() => gripVolgordeToepassen([{ id: 'spaargeld' }, { id: 'pot:b' }, { id: 'pot:a' }], { modus: 'zelf', ids: ['pot:a', 'spaargeld', 'pot:b'] }).map(p => p.id));
    expect(zelf).toEqual(['spaargeld', 'pot:a', 'pot:b']);
  });
  test('moment: bij salaris (datum) of maandag (datum); een stap die blijft liggen krijgt een neutrale regel', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await tab(page, 'kiezen');
    expect(await tekst(page, '[data-kiesmoment]')).toMatch(/^bij salaris \(\d+ (okt|nov)\) ›$/);   // v391: geen vóór
    await page.evaluate(() => { SET.gripMoment = 'week'; save(); renderMaand(); });
    expect(await tekst(page, '[data-kiesmoment]')).toBe('maandag (12 okt) ›');
    expect(await page.locator('[data-stapligt]').count()).toBe(0);
    await page.evaluate(() => { SET.gripStapSinds['2026-10'].spaargeld = '2026-10-02'; save(); renderMaand(); });
    expect(await tekst(page, '[data-stapligt]')).toBe('Betaalrekening op na ~12 dagen na salaris staat sinds 2 okt open · 8 dagen.');
  });
  test('een signaal opent wat er al was: het potje de signaalkaart met de handelingen, de onttrekkingen de Doelen-meter', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await page.evaluate(() => { const t = { id: 'xue', date: '2026-10-08', amount: -60, acc: 'NL01MAIN0000001111', name: 'Cafe Extra', desc: 'BEA, BETAALPAS CAFE EXTRA', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'uiteten'; save(); });
    expect(await page.evaluate(() => (valtOpSignals(thisYM()) || []).some((s) => s.potjeId === 'uiteten'))).toBe(true);
    /* v428: Begrijpen verandert niets; de handelingen van het potje staan als eigen keuze in Kiezen (sig:<id>) en openen
       de signaalkaart die er al was. De onttrekkingen staan als tak in de drill van het symptoom. */
    await tab(page, 'kiezen');
    await page.click('#gripTeKiezen [data-kies="sig:2026-10|uiteten"]');
    expect(await page.locator('#gripLetOpSheet .valtop-open').count()).toBe(1);
    await page.evaluate(() => { closeSheet(); gripNaarSymptoom('pat:spaargeld'); });
    expect(await page.locator('#gripSymptoom [data-patsig="onttrekking"]').count()).toBe(1);
  });
  test('Let op draagt geen potje meer dat al signaal van een patroon is', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    const r = await page.evaluate(() => { const L = [{ soort: 'sig', key: '2026-10|uiteten' }, { soort: 'sig', key: '2026-10|vices' }, { soort: 'str', key: 'x' }];
      return gripLetOpZonderPatroon(L).map(x => x.key); });
    expect(r).toEqual(['2026-10|vices', 'x']);
  });
});

test.describe('v388 terugblik', () => {
  /* september als afgesloten maand met keuzes: Uit eten EUR 70 uitgegeven op een potje van 55 */
  const SEP = (lat, extra) => Object.assign({ pid: 'pot:uiteten', optie: 'grens', titel: 'Uit eten binnen het potje', schuift: false, lat, op: '2026-09-05', patroon: { id: 'pot:uiteten', naam: 'Uit eten boven je potje' } }, extra || {});
  const zet = (page, K, opzij, stort) => page.evaluate(({ K, opzij, stort }) => {
    SET.gripKeuze = { '2026-09': K }; SET.gripOpzij = { '2026-09': { opzij } };
    if (stort) { const t = { id: 'stsep', date: '2026-09-20', amount: stort, acc: 'NL01SPAR0000002222', name: 'Inleg', desc: 'OVERBOEKING VAN MAIN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); }
    save(); }, { K, opzij, stort });
  test('✓ bij alles gehaald, ½ bij deels, ✗ bij niets, en een score met halven', async ({ page }) => {
    await grip(page);
    await zet(page, {
      a: SEP([{ soort: 'potmax', k: 'uiteten', naam: 'Uit eten', max: 80, potje: 55 }], { pid: 'a' }),
      b: SEP([{ soort: 'potmax', k: 'uiteten', naam: 'Uit eten', max: 80, potje: 55 }, { soort: 'potmax', k: 'vices', naam: 'Vices', max: 10, potje: 20 }], { pid: 'b', patroon: { naam: 'B' } }),
      c: SEP([{ soort: 'potmax', k: 'vices', naam: 'Vices', max: 10, potje: 20 }], { pid: 'c', patroon: { naam: 'C' } }),
    }, 1000, 1000);
    const T = await page.evaluate(() => gripTerugblik('2026-09'));
    expect(T.items.map(x => x.id + ':' + x.s)).toEqual(['a:ok', 'b:half', 'c:nee', 'spaardoel:ok']);
    expect(T.score).toBe(2.5); expect(T.n).toBe(4);
    await tab(page, 'terugblik');
    expect(await tekst(page, '[data-terugvergelijk]')).toMatch(/^September 2,5 van 4 · oktober /);
  });
  test('dekken of schuiven telt niet als gelukt: het staat apart als geschoven, buiten de score', async ({ page }) => {
    await grip(page);
    await zet(page, { d: SEP([], { pid: 'd', optie: 'dekken', schuift: true, titel: 'Uit eten herzien' }) }, 1000, 1000);
    const T = await page.evaluate(() => gripTerugblik('2026-09'));
    expect(T.items[0].s).toBe('geschoven');
    expect(T.score).toBe(1); expect(T.n).toBe(1);   // alleen het spaardoel telt
  });
  test('een regel die alleen binnen een opgehoogd potje blijft, is geschoven en niet gelukt', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { SET.budgetHist = Object.assign({}, SET.budgetHist, { '2026-09': Object.assign({}, SET.budgets, { uiteten: 100 }) }); save(); });
    await zet(page, { e: SEP([{ soort: 'potmax', k: 'uiteten', naam: 'Uit eten', max: 55, potje: 55 }], { pid: 'e' }) }, 1000, 1000);
    const T = await page.evaluate(() => gripTerugblik('2026-09'));
    expect(T.items[0].s).toBe('geschoven');
    expect(T.items[0].regels[0].s).toBe('geschoven');
  });
  test('spaardoel: ✓ vanaf 100%, ½ vanaf 80%, anders ✗, gemeten als gestort min eruit', async ({ page }) => {
    for (const [stort, s] of [[1000, 'ok'], [800, 'half'], [790, 'nee']]) {
      await grip(page); await zet(page, {}, 1000, stort);
      expect(await page.evaluate(() => gripSpaardoel('2026-09').s)).toBe(s);
    }
    // niets gestort is niet gehaald
    await grip(page); await zet(page, {}, 1000, 0);
    expect(await page.evaluate(() => gripSpaardoel('2026-09').s)).toBe('nee');
  });
  test('terugzetkeuze zonder storting telt niet als gehaald', async ({ page }) => {
    await grip(page); await zet(page, {}, 1000, 0);
    const r = await page.evaluate(() => {
      const t = { id: 'uitsep', date: '2026-09-12', amount: -500, acc: 'NL01SPAR0000002222', name: 'Naar Main', desc: 'OVERBOEKING NAAR MAIN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t);
      SET.terugzet = { '2026-09': { bedrag: 500, keuze: 'alles', bron: [], delen: [500], op: '2026-09-13' } };
      save(); return { net: savedNet('2026-09'), s: gripSpaardoel('2026-09').s };
    });
    expect(r.net).toBe(-500);   // gestort min eruit; de keuze om terug te zetten is geen storting
    expect(r.s).toBe('nee');
  });
  test('een onttrekking na de datum van de meetlat is ✗', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    const r = await page.evaluate(() => [gripRegelUitkomst({ soort: 'onttrekking', na: '2026-10-07' }, '2026-10').s, gripRegelUitkomst({ soort: 'onttrekking', na: '2026-10-09' }, '2026-10').s]);
    expect(r).toEqual(['nee', 'ok']);
  });
  test('de instelling uit Zien staat in de terugblik en telt niet mee', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { openTeRuim('huur'); teRuimKies('a'); window._tr.bestem = 'plan'; teRuimBevestig(); gripKiesTab('terugblik'); });
    expect(await page.locator('[data-terugrij="instelling"]').innerText()).toContain('Huur → €142');
    const T = await page.evaluate(() => gripTerugblik('2026-10'));
    expect(T.n).toBe(0);   // het spaardoel van de lopende maand loopt nog
  });
});

test('de vier tabs passen op 390×844 met de menubalk', async ({ page }) => {
  await grip(page, { opnames: OPNAMES });
  for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) {
    await tab(page, t);
    // v393: ook op Zien met het potje onder de drempel (een noot in de bridge, geen eigen regel).
    const m = await page.evaluate(() => { const nav = document.querySelector('.nav'); const k = document.getElementById('gripKoopcheck').getBoundingClientRect();
      return { onder: k.bottom, nav: nav ? nav.getBoundingClientRect().top : innerHeight, ox: document.documentElement.scrollWidth > innerWidth }; });
    console.log(`${t}: knop eindigt op ${Math.round(m.onder)}px, menubalk op ${Math.round(m.nav)}px`);
    expect(m.ox).toBe(false);
    expect(m.onder).toBeLessThanOrEqual(m.nav);
  }
});
