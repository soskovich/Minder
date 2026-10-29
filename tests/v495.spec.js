/* v495: de salarisperiode als eenheid (deel 1b) · de rest per periode, en een voorbeeldweergave.
   Vanaf de era (24 nov 2026) rekenen de headline-surfaces per salarisperiode via periodeVan()/budgetVoorPeriode()/periodeStandNu,
   zodat er op 24 nov geen twee kalenders naast elkaar staan: Grip "Hoe sta je ervoor", Home "deze periode", de weektegel (weken
   binnen de periode) en het contant-tempo (Contant vast per periode). Vóór de era blijft alles als v494. De voorbeeldweergave
   ("Bekijk als datum") tekent alsof het een andere dag is, zonder iets op te slaan.
   a. Op 26 nov rekenen Grip, Home, de weektegel en het contant-tempo over 24 nov – 23 dec; nergens "november" als budgetperiode.
      Sabotage: Grip "Hoe sta je ervoor" met thisYM() laten rekenen (de era-tak eruit) → Grip zegt weer "november".
   b. Vóór 24 nov (28 okt) is alles gelijk aan v494: geen enkele surface neemt de periode-tak.
      Sabotage: de era een maand vervroegen (PERIODE_CUTOVER naar oktober) → op 28 okt nemen de surfaces de periode-tak.
   c. In de voorbeeldweergave wordt niets weggeschreven (SET en localStorage gelijk voor en na).
      Sabotage: de save()-no-op in de voorbeeldweergave uitschakelen → localStorage verandert tijdens het voorbeeld.
   punt 4 — de lijst "Per dag of per keer" en het vaste deel van een potje:
   d. Een potje per dag met een vaste last erin (Vervoer & auto €1.100, lease €537) splitst: het vaste deel (€537) telt per keer op
      zijn datum en blijft gelijk in een korte (23) en lange (31) periode; alleen de rest (€563) schaalt (×23/30,4 = €426, ×31/30,4 =
      €574). De rij toont "€537 vast + €563 per dag". Sabotage: het hele potje schalen (het vaste deel niet apart houden).
   e. Contant staat in de lijst als vaste rij ("€400 vast per periode"), niet als keuze tussen per dag / per keer.
      Sabotage: Contant als gewone kandidaat met de per dag/per keer-knoppen tonen. */
const { test, expect } = require('@playwright/test');
const S = require('./v489-stand');

const zetPotje = () => { SET.budgets = Object.assign({}, SET.budgets, { boodschappen: 390, contant: 400 }); SET.potWekelijks = Object.assign({}, SET.potWekelijks, { boodschappen: true }); SET.mode = 'expert'; _dataGen++; try { runMemoVergeten(); } catch (_) {} };

test('a. op 26 nov rekenen Grip, Home, de weektegel en het contant-tempo over de periode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const r = await page.evaluate(() => {
    SET.budgets = Object.assign({}, SET.budgets, { boodschappen: 390, contant: 400 }); SET.potWekelijks = Object.assign({}, SET.potWekelijks, { boodschappen: true }); SET.mode = 'expert'; _dataGen++; try { runMemoVergeten(); } catch (_) {}
    const grip = gripZienTabel();
    go('dash'); renderDash(); const homeEl = document.querySelector('[data-homeregel]');
    const week = insWeekTegel();
    const P = periodeVan(vandaagYMD()); let cs = 0; for (let d = P.start; d <= P.eind; d = rekDag(d, 1)) cs += contantDagTempo(d);
    return {
      gripPeriode: /data-zienstand="periode"/.test(grip), gripLabel: ((grip.match(/Hoe sta je ervoor · ([^<]+)</) || [])[1] || '').trim(), gripNov: /Hoe sta je ervoor · november/.test(grip),   // v496: de kop kan nu een "nog niet bevestigd"-stip dragen; het label is het deel vóór de stip
      homePeriode: homeEl ? homeEl.getAttribute('data-homeregel') === 'periode' : false, homeTxt: homeEl ? homeEl.textContent : '',
      weekPeriode: /data-weekperiode/.test(week), weekKort: (week.match(/Deze week · ([^<]+)</) || [])[1],
      contantSom: Math.round(cs), contantBud: budgetVoorPeriode(P).contant, contantMaand: Math.round((+budgetVoorMaand('2026-11')[CONTANT_CAT] || 0)),
    };
  });
  // Grip "Hoe sta je ervoor" over de periode, geen "november"
  expect(r.gripPeriode).toBe(true);
  expect(r.gripLabel).toBe('24 nov – 23 dec');
  expect(r.gripNov).toBe(false);                 // sabotage (thisYM) → "Hoe sta je ervoor · november"
  // Home "deze periode"
  expect(r.homePeriode).toBe(true);
  expect(r.homeTxt).toContain('deze periode');
  // de weektegel: weken binnen de periode, eerste week begint op de 24e
  expect(r.weekPeriode).toBe(true);
  expect(r.weekKort).toMatch(/^24 nov/);
  // contant-tempo: vast per periode (sommeert over de periode op het contant-budget)
  expect(r.contantSom).toBe(r.contantBud);
  expect(r.contantBud).toBe(400);
});

test('b. vóór 24 nov is alles als v494: geen surface neemt de periode-tak', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});                        // 28 okt, pre-era
  const r = await page.evaluate(() => {
    SET.budgets = Object.assign({}, SET.budgets, { boodschappen: 390, contant: 400 }); SET.potWekelijks = Object.assign({}, SET.potWekelijks, { boodschappen: true }); SET.mode = 'expert'; _dataGen++; try { runMemoVergeten(); } catch (_) {}
    const P = periodeVan(vandaagYMD());
    const grip = gripZienTabel();
    go('dash'); renderDash(); const homeEl = document.querySelector('[data-homeregel]');
    const week = insWeekTegel();
    const pv = periodeVanaf();
    const contant = contantDagTempo(vandaagYMD()), maandC = (+budgetVoorMaand(thisYM())[CONTANT_CAT] || 0) / new Date(2026, 10, 0).getDate();
    return {
      soort: P.soort, pv,
      gripPeriode: /data-zienstand="periode"/.test(grip), gripNu: /data-zienstand="nu"/.test(grip),
      homePeriode: homeEl ? homeEl.getAttribute('data-homeregel') === 'periode' : false, homeMaand: homeEl ? homeEl.getAttribute('data-homeregel') === 'maand' : false,
      weekPeriode: /data-weekperiode/.test(week),
      contantGelijkMaand: Math.abs(contant - maandC) < 0.0001,
    };
  });
  expect(r.pv).toBe('2026-11-24');               // de era-grens, afgeleid van de vaste cutover
  expect(r.soort).toBe('maand');                 // 28 okt valt in een kalendermaand, niet in een periode
  expect(r.gripPeriode).toBe(false);             // sabotage (cutover naar okt) → periode-tak op 28 okt
  expect(r.gripNu).toBe(true);
  expect(r.homePeriode).toBe(false);
  expect(r.homeMaand).toBe(true);
  expect(r.weekPeriode).toBe(false);
  expect(r.contantGelijkMaand).toBe(true);       // het contant-tempo is pre-era het maand-tempo
});

test('c. de voorbeeldweergave schrijft niets weg', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    const beforeSet = JSON.stringify(SET), beforeLs = localStorage.getItem('minder_set');
    voorbeeldStart('2026-11-26');
    const inPrev = { dag: vandaagYMD(), ym: thisYM(), voorbeeld: !!window._voorbeeld, balk: !!document.getElementById('voorbeeldBalk') };
    // tijdens het voorbeeld tekenen en een save uitlokken
    try { go('ins'); } catch (_) {}
    SET.weekStand = { start: 'x' }; save();                 // een controle-save tijdens het tekenen
    const lsTijdens = localStorage.getItem('minder_set');
    voorbeeldStop();
    return {
      inPrev, balkTerug: !!(document.getElementById('voorbeeldBalk')), dagTerug: vandaagYMD(),
      lsVeranderdTijdens: lsTijdens !== beforeLs,
      setGelijk: JSON.stringify(SET) === beforeSet, lsGelijk: localStorage.getItem('minder_set') === beforeLs,
    };
  });
  expect(r.inPrev.dag).toBe('2026-11-26');
  expect(r.inPrev.ym).toBe('2026-11');
  expect(r.inPrev.voorbeeld).toBe(true);
  expect(r.inPrev.balk).toBe(true);
  expect(r.lsVeranderdTijdens).toBe(false);      // sabotage (no-op uit) → localStorage verandert tijdens het voorbeeld
  expect(r.setGelijk).toBe(true);
  expect(r.lsGelijk).toBe(true);
  expect(r.balkTerug).toBe(false);
  expect(r.dagTerug).toBe('2026-10-28');
});

test('d. een potje per dag met een vaste last splitst: vast deel vast, alleen de rest schaalt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const r = await page.evaluate(() => {
    const add = (d, a, name, desc) => { const t = { id: 'lz' + d, date: d, amount: a, acc: 'NL01MAIN0000001111', name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] }; categorize(t); TX.push(t); };
    for (const m of ['2026-09', '2026-10', '2026-11']) add(m + '-12', -537, 'Hiltermann Lease', 'SEPA INCASSO AUTOLEASE HILTERMANN');
    save(); try { buildAccMeta(); } catch (_) {}
    SET.budgets = Object.assign({}, SET.budgets, { vervoer: 1100, contant: 400 }); SET.potWekelijks = Object.assign({}, SET.potWekelijks, { vervoer: true }); _dataGen++; try { runMemoVergeten(); } catch (_) {}
    const b23 = budgetVoorPeriode({ ym: '2026-11', dagen: 23 }), b31 = budgetVoorPeriode({ ym: '2026-11', dagen: 31 });
    const rij = potSoortRij('vervoer', potVastDelen('2026-11'));
    return {
      vast: potVastDelen('2026-11').vervoer, soort: potSoort('vervoer'),
      perKeer23: b23.perKeer.vervoer, perKeer31: b31.perKeer.vervoer, perDag23: b23.perDag.vervoer, perDag31: b31.perDag.vervoer,
      rijHeeftSplit: /data-potvastdeel="537"/.test(rij), rijTxt: /€\s?537 vast \+ €\s?563 per dag/.test(rij),
      heelPotje23: Math.round(1100 * 23 / 30.4),
    };
  });
  expect(r.vast).toBe(537);                       // de herkende lease
  expect(r.soort).toBe('dag');
  expect(r.perKeer23).toBe(537);                  // het vaste deel telt per keer; sabotage (heel potje schalen) → perKeer verdwijnt
  expect(r.perKeer31).toBe(537);                  // en blijft gelijk in een lange periode
  expect(r.perDag23).toBe(426);                   // alleen de rest (€563) schaalt: ×23/30,4
  expect(r.perDag31).toBe(574);                   // ×31/30,4
  expect(r.perDag23).not.toBe(r.heelPotje23);     // dus niet het hele potje van €1.100 (het onderscheid dat de sabotage weghaalt)
  expect(r.rijHeeftSplit).toBe(true);
  expect(r.rijTxt).toBe(true);                    // "€537 vast + €563 per dag"
});

test('e. Contant is een vaste rij in de lijst, geen keuze tussen per dag / per keer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    SET.budgets = Object.assign({}, SET.budgets, { boodschappen: 390, contant: 400 }); SET.potWekelijks = Object.assign({}, SET.potWekelijks, { boodschappen: true }); _dataGen++; try { runMemoVergeten(); } catch (_) {}
    const html = potSoortLijst();
    return {
      contantVast: /data-potsoortcontant/.test(html), contantTxt: /€\s?400 vast per periode/.test(html),
      contantToggle: /data-potsoortrij="contant"/.test(html), boodschappenRij: /data-potsoortrij="boodschappen"/.test(html),
    };
  });
  expect(r.contantVast).toBe(true);               // de vaste rij
  expect(r.contantTxt).toBe(true);                // "€400 vast per periode"
  expect(r.boodschappenRij).toBe(true);           // een gewoon potje houdt zijn keuze
  expect(r.contantToggle).toBe(false);            // sabotage (Contant als kandidaat) → data-potsoortrij="contant"
});
