/* v494: de salarisperiode als eenheid (deel 1). periodeVan(datum) en budgetVoorPeriode(periode) zijn de ene bron; de era begint op
   de eerstvolgende salarisdag op/na de cutover (24 nov 2026). Deler voor "per dag" = 30,4 (gemiddelde dagen per maand): een periode
   van 30 dagen krijgt dan 98,7% van het maandbudget en een van 31 dagen 102%, zodat het over een jaar op het maandbudget uitkomt.
   30 zou per dag in een periode van 30 dagen gelijkstellen aan het hele potje — dan is per dag niet van per keer te onderscheiden.
   a. Een potje per dag van €390 in een periode van 30 dagen → €390 × 30 / 30,4 = €385; per keer €85 → €85; Contant → €400.
      Sabotage: per dag als per keer behandelen (de dag-schaling uit) → €390.
   b. November is een korte maand (1–23): per dag × 23/30,4 = €295, per keer en Contant volledig.
      Sabotage: de korte maand als volle maand nemen → 30 dagen, €385.
   c. Op 26 nov rekent het tempo vanaf 24 nov (dag 3 van 30), niet vanaf 1 nov.
      Sabotage: thisYM() (de kalendermaand) gebruiken → dag 26.
   d. De historie toont november als korte maand en 24 nov – 23 dec als eerste periode, met een scheiding ertussen.
      Sabotage: november omrekenen (niet meer als korte maand tonen).
   e. De soort van een potje verandert niet door het tonen van de lijst; alleen bevestigen schrijft.
      Sabotage: het voorstel direct toepassen bij het renderen. */
const { test, expect } = require('@playwright/test');
const S = require('./v489-stand');

const zetBudget = () => { SET.budgets = { boodschappen: 390, kinderen: 85, contant: 400 }; SET.potWekelijks = { boodschappen: true, kinderen: false }; SET.budgetsNext = {}; SET.budgetPlan = {}; _dataGen++; };

test('a. per dag geschaald naar de dagen, per keer en Contant vast', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const r = await page.evaluate(() => {
    SET.budgets = { boodschappen: 390, kinderen: 85, contant: 400 }; SET.potWekelijks = { boodschappen: true, kinderen: false }; SET.budgetsNext = {}; SET.budgetPlan = {}; _dataGen++;
    const bp = budgetVoorPeriode({ ym: '2026-11', dagen: 30 });
    return { perDag: bp.perDag.boodschappen, perKeer: bp.perKeer.kinderen, contant: bp.contant, deler: bp.deler, soortB: potSoort('boodschappen'), soortK: potSoort('kinderen') };
  });
  expect(r.deler).toBe(30.4);
  expect(r.soortB).toBe('dag');            // bevestigd, dus geen voorstel
  expect(r.soortK).toBe('keer');
  expect(r.perDag).toBe(385);              // €390 × 30 / 30,4; sabotage "per dag als per keer" → 390
  expect(r.perKeer).toBe(85);              // per keer: het hele potjebudget
  expect(r.contant).toBe(400);             // vast per periode
  expect(r.perDag).not.toBe(390);          // en dus niet het hele potje (het onderscheid met per keer)
});

test('b. november is een korte maand: per dag × 23/30,4, per keer en Contant volledig', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const r = await page.evaluate(() => {
    SET.budgets = { boodschappen: 390, kinderen: 85, contant: 400 }; SET.potWekelijks = { boodschappen: true, kinderen: false }; SET.budgetsNext = {}; SET.budgetPlan = {}; _dataGen++;
    const P = periodeVan('2026-11-10');
    const bp = budgetVoorPeriode(P);
    return { soort: P.soort, dagen: P.dagen, korte: P.korteMaand, perDag: bp.perDag.boodschappen, perKeer: bp.perKeer.kinderen, contant: bp.contant };
  });
  expect(r.soort).toBe('maand');
  expect(r.korte).toBe(true);
  expect(r.dagen).toBe(23);                // 1–23 nov; sabotage "volle maand" → 30
  expect(r.perDag).toBe(295);              // €390 × 23 / 30,4
  expect(r.perKeer).toBe(85);              // per keer volledig
  expect(r.contant).toBe(400);             // Contant volledig
});

test('c. op 26 nov rekent het tempo vanaf 24 nov, niet vanaf 1 nov', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const r = await page.evaluate(() => {
    SET.budgets = { boodschappen: 390, kinderen: 85, contant: 400 }; SET.potWekelijks = { boodschappen: true, kinderen: false }; SET.budgetsNext = {}; SET.budgetPlan = {}; _dataGen++;
    const PS = periodeStandNu();
    go('ins'); renderIns();
    const k = document.querySelector('#insMaand');
    return { el: PS.el, dagen: PS.dagen, insmaand: k ? k.getAttribute('data-insmaand') : null, insel: k ? +k.getAttribute('data-insel') : null, insdagen: k ? +k.getAttribute('data-insdagen') : null };
  });
  expect(r.el).toBe(3);                     // 24, 25, 26 nov = dag 3; sabotage thisYM() → 26
  expect(r.dagen).toBe(30);                 // 24 nov – 23 dec
  expect(r.insmaand).toBe('periode');       // de kop is de salarisperiode
  expect(r.insel).toBe(3);
  expect(r.insdagen).toBe(30);
});

test('d. historie: november korte maand, dan 24 nov – 23 dec als eerste periode, met een scheiding', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2027-01-12' });
  const r = await page.evaluate(() => {
    const add = (d, a) => { const t = { id: 'h' + d + Math.round(Math.abs(a) * 100), date: d, amount: a, acc: 'NL01MAIN0000001111', name: 'Albert Heijn', desc: 'BEA Albert Heijn', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); };
    add('2026-11-10', -40); add('2026-12-05', -55); add('2026-12-28', -30); save(); try { buildAccMeta(); } catch (_) {}
    const H = historiePerioden('2027-01-12');
    const nov = H.find(u => u.soort === 'maand' && u.ym === '2026-11');
    const schIdx = H.findIndex(u => u.soort === 'scheiding');
    const perioden = H.filter(u => u.soort === 'periode');
    const eerste = perioden[0] || null;
    const laatsteMaandIdx = H.map((u, i) => u.soort === 'maand' ? i : -1).filter(i => i >= 0).pop();
    return { novKorte: nov ? nov.korteMaand : null, novDagen: nov ? nov.dagen : null, schIdx, laatsteMaandIdx, eerste: eerste ? { start: eerste.start, eind: eerste.eind } : null };
  });
  expect(r.novKorte).toBe(true);            // november blijft een korte maand; sabotage "omrekenen" → geen korte maand
  expect(r.novDagen).toBe(23);
  expect(r.schIdx).toBeGreaterThan(r.laatsteMaandIdx);   // de scheiding staat ná de maanden
  expect(r.eerste).not.toBeNull();
  expect(r.eerste.start).toBe('2026-11-24');  // de eerste periode
  expect(r.eerste.eind).toBe('2026-12-23');
});

test('e. de soort verandert niet zonder bevestiging', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    SET.budgets = { boodschappen: 390 }; delete SET.potWekelijks; _dataGen++;
    const html = potSoortLijst();                       // de lijst tonen
    const naRender = (SET.potWekelijks || {}).boodschappen;
    potSoortZet('boodschappen', 'dag');                  // bevestigen
    const naZet = (SET.potWekelijks || {}).boodschappen;
    return { heeftLijst: /Soort per potje/.test(html), heeftRij: /data-potsoortrij="boodschappen"/.test(html), naRender, naZet, soort: potSoort('boodschappen') };
  });
  expect(r.heeftLijst).toBe(true);
  expect(r.heeftRij).toBe(true);
  expect(r.naRender).toBeUndefined();       // renderen schrijft niets (sabotage: voorstel direct toepassen → wel geschreven)
  expect(r.naZet).toBe(true);               // bevestigen schrijft (per dag = true)
  expect(r.soort).toBe('dag');
});
