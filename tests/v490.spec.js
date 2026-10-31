/* v490: snelheid. De dure kernen (rekVoorstel, salTekortData, maandVooruit, recurringSchedule, catSpendMap) draaien per draai
   hooguit één keer, de memo overleeft een boekhoud-save, en elke gemeten wijziging (sync of keuze) ververst wel.
   a. Opstarten roept rekVoorstel hooguit één keer aan.                 Sabotage: de cache bij elke render legen (save bumpt altijd).
   b. Grip roept salTekortData en rekVoorstel hooguit één keer aan.      Sabotage: per kaart opnieuw rekenen (de salTekortData-memo uit).
   c. Een getal ververst na een sync (en de cache levert de ware waarde). Sabotage: de catSpendMap-cache nooit verversen.
   d. Na een keuze (betaaldatum) ververst het getal.                    Sabotage: de rekVoorstel-cache niet legen bij een keuze. */
const { test, expect } = require('@playwright/test');
const S = require('./v489-stand');

/* markeer de vorige maand afgesloten, zodat de afsluit-pop-up niet vóór de krap-pop-up komt (dan toetst de boot-staart de krap-weg) */
const geenAfsluit = () => { try { const M = afsluitMaand(); SET.maandAfsluiting = Object.assign({}, SET.maandAfsluiting, { [M]: { op: vandaagYMD() } }); save(); } catch (_) {} closeSheet(); };

test('a. opstarten roept rekVoorstel hooguit één keer aan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    try { const M = afsluitMaand(); SET.maandAfsluiting = Object.assign({}, SET.maandAfsluiting, { [M]: { op: vandaagYMD() } }); save(); } catch (_) {}
    closeSheet();
    delete SET.salTekort;             // een eerste opening: de krap-melding is nieuw, dus salTekortBewaar schrijft + bewaart
    _dataGen++;                       // koude cache, zoals vlak na het laden
    perfReset(); PERF.on = true;
    renderDash(); afsluitPopupMisschien(); salKrapPopupMisschien();   // de boot-staart (index.html regels 36304-36305)
    PERF.on = false;
    return { rv: PERF.n.rekVoorstelRuw || 0, popup: !!document.querySelector('#sheetBg.show') };
  });
  expect(r.popup).toBe(true);                     // de krap-pop-up staat er, anders toetst de test niets
  expect(r.rv).toBeLessThanOrEqual(1);            // sabotage: de boekhoud-save bumpt dan wel → de pop-up herrekent → 2
});

test('b. het openen van Grip roept salTekortData en rekVoorstel hooguit één keer aan, ook met de pop-up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    try { const M = afsluitMaand(); SET.maandAfsluiting = Object.assign({}, SET.maandAfsluiting, { [M]: { op: vandaagYMD() } }); save(); } catch (_) {}
    closeSheet();
    delete SET.salTekort;             // een eerste opening van Grip: de krap-melding is nieuw
    _dataGen++; perfReset(); PERF.on = true;
    go('maand');
    PERF.on = false;
    return { rv: PERF.n.rekVoorstelRuw || 0, st: PERF.n.salTekortDataKern || 0, popup: !!document.querySelector('#sheetBg.show') };
  });
  expect(r.popup).toBe(true);                     // go('maand') opent de krap-pop-up, dus die zit in de meting
  expect(r.rv).toBeLessThanOrEqual(1);
  expect(r.st).toBeLessThanOrEqual(1);            // sabotage: de memo uit → elke lezer herrekent → >1
});

test('c. de cache levert de ware waarde en ververst na een sync', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(({ MAIN }) => {
    const getallen = () => ({
      saldo: Math.round(totalBalance().sum * 100),
      safe: Math.round(safeToSpend().safe * 100),
      proj: Math.round(maandVooruit().projectie * 100),      // loopt via de runMemo-render-memo
      cat: Math.round((catSpendMap(thisYM()).boodschappen || 0) * 100)
    });
    const warm = getallen();
    _dataGen++;                        // forceer een koude herberekening van dezelfde gegevens
    const koud = getallen();
    // sync: een nieuwe boeking komt binnen (een echte save, die _dataGen bumpt → de memo-laag ververst)
    const t = { id: 'v490c', date: thisYM() + '-15', amount: -99, acc: MAIN, name: 'Albert Heijn', desc: 'BEA Albert Heijn', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); save();
    const na = getallen();
    return { warm, koud, na };
  }, { MAIN: S.MAIN });
  expect(r.koud).toEqual(r.warm);                         // de caches leveren de ware waarde (geen corruptie na een koude herberekening)
  expect(r.na.cat).toBe(r.warm.cat + 9900);               // +€99 boodschappen na de sync → ververst
  expect(r.na.proj).not.toBe(r.warm.proj);                // de gecachte projectie ververst na de sync (sabotage: save bumpt _dataGen niet → stil verouderd)
});

test('d. na een keuze (betaaldatum) ververst het getal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { oktNa: true });   // v503: oktober betaald na het salaris
  const r = await page.evaluate(() => {
    const wk = woningForecast().key;
    const voorDatum = vastDatumNu(wk).datum;
    const tekort = () => { const T = salTekortData(); const x = T.find(y => y.acc === (SET.salVerdeling && Object.keys(SET.salVerdeling.rek || {})[0])) || T[0]; return x ? x.tekort : 0; };
    const voor = tekort();
    vastDatumZet(wk, 'op', 1);          // keuze: de huur op de 1e (binnen de periode) i.p.v. na je salaris
    const naDatum = vastDatumNu(wk).datum;
    const na = tekort();
    return { voorDatum, naDatum, voor, na };
  });
  expect(r.naDatum).not.toBe(r.voorDatum);                // de toegepaste datum veranderde door de keuze
  expect(r.na).not.toBe(r.voor);                          // en het tekort ververst (de cache bleef niet staan)
});
