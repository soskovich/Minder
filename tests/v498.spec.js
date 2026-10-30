/* v498: salarisperiode · één huidige periode, en een realistische voorbeeldweergave.
   In de era (vanaf 24 nov 2026) is de lopende periode ALTIJD periodeVan(vandaag) — de regel (de 24e, maandag bij het weekend) —
   en nooit "de periode die liep" van het laatst ONTVANGEN salaris. Inzichten (kop, Verwacht saldo eind, weektegel) volgt de
   datum, de Budget-tegel op Grip rekent in de era, Kiezen leest de regel, en een daling heet "gedaald".
   De fixture boot op 26 nov ZONDER novembersalaris (novSalaris:false), zodat november geen boekingen heeft en de app dus
   terug zou vallen op de vorige periode / de laatste maand met data als de era-logica ontbreekt. */
const { test, expect } = require('@playwright/test');
const S = require('./v489-stand');

// a. Eén huidige periode: kop, opzij, tempo en budget volgen 24 nov–23 dec, met de melding "salaris nog niet binnen".
test('v498 a: een huidige periode, salaris nog niet binnen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26', novSalaris: false });
  const r = await page.evaluate(() => {
    const SP = salPeriode(), O = opzijPeriode(), PS = periodeStandNu();
    let V = null; try { V = maandVooruit(); } catch (_) {}
    const M = gripMeterBudget(V);
    return {
      era: !!SP.era, curStart: SP.cur.start, curEind: SP.cur.eind, binnen: SP.cur.binnen, laat: SP.laat,
      nietVerwacht: salNietBinnen().verwacht,
      opzijStart: O.start || O.van, psStart: PS ? PS.P.start : null, budgetPeriode: !!M.periode,
    };
  });
  expect(r.era).toBe(true);
  expect(r.curStart).toBe('2026-11-24');   // de periode van vandaag, niet de vorige (24 okt) van het laatst ontvangen salaris
  expect(r.curEind).toBe('2026-12-23');
  expect(r.binnen).toBe(false);
  expect(r.laat).toBe(true);
  expect(r.nietVerwacht).toBe('2026-11-24');
  expect(r.opzijStart).toBe('2026-11-24');
  expect(r.psStart).toBe('2026-11-24');
  expect(r.budgetPeriode).toBe(true);
});

// b. Inzichten toont op 26 nov de periode, ZONDER boekingen in november.
test('v498 b: Inzichten volgt de periode zonder boekingen in november', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26', novSalaris: false });
  const r = await page.evaluate(() => {
    renderIns();
    const kop = document.querySelector('[data-insmaand]');
    const se = document.querySelector('[data-inssaldoeind]');
    const t = (document.getElementById('s-ins').innerText || '');
    return {
      insmaand: kop ? kop.getAttribute('data-insmaand') : null,
      periode: kop ? kop.getAttribute('data-insperiode') : null,
      saldoEindLabel: se ? se.getAttribute('data-insperiodeeind') : null,
      heeftOkt: /oktober|okt 20|[-–]\s*\d+\s*okt/i.test(t),
    };
  });
  expect(r.insmaand).toBe('periode');
  expect(r.periode).toBe('24 nov – 23 dec');
  expect(r.saldoEindLabel).toBe('24 nov – 23 dec');   // Verwacht saldo eind <periode>
  expect(r.heeftOkt).toBe(false);                     // niet terugvallen op de laatste maand met boekingen
});

// c. De Budget-tegel op Grip toont een percentage in de era (niet "nog niet te rekenen").
test('v498 c: de Budget-tegel rekent in de era', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26', novSalaris: false });
  const r = await page.evaluate(() => {
    let V = null; try { V = maandVooruit(); } catch (_) {}
    const M = gripMeterBudget(V);
    return { periode: !!M.periode, pctNum: (typeof M.pct === 'number' && isFinite(M.pct)), budget: M.budget };
  });
  expect(r.periode).toBe(true);
  expect(r.pctNum).toBe(true);
  expect(r.budget).toBeGreaterThan(0);
});

// d. Een daling van vaste lasten heet "gedaald", een stijging "gestegen".
test('v498 d: een daling heet gedaald', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const r = await page.evaluate(() => ({
    daling: vastGestegenTitel({ stijging: -597 }),
    stijging: vastGestegenTitel({ stijging: 597 }),
  }));
  expect(r.daling).toBe('Vaste lasten gedaald');
  expect(r.stijging).toBe('Vaste lasten gestegen');
});

// e. Met de schakelaar staat het salaris op 24 nov in de boekingen van de voorbeeldweergave; na "terug naar vandaag" bestaat het niet.
test('v498 e: de schakelaar zet het verwachte salaris, terug naar vandaag wist het', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-10-28', novSalaris: false });
  const r = await page.evaluate(() => {
    voorbeeldStart('2026-11-24');
    voorbeeldSalarisZet(true);
    const inVb = TX.filter(t => t.date === '2026-11-24' && t.amount > 0 && String(t.src) === 'voorbeeld');
    const vbCount = TX.filter(t => String(t.src) === 'voorbeeld').length;
    voorbeeldStop();
    const naCount = TX.filter(t => String(t.src) === 'voorbeeld').length;
    return { salN: inVb.length, salBedrag: inVb[0] ? inVb[0].amount : null, vbCount, naCount };
  });
  expect(r.salN).toBe(1);
  expect(r.salBedrag).toBeGreaterThan(0);
  expect(r.vbCount).toBeGreaterThan(0);
  expect(r.naCount).toBe(0);   // de nepboeking wordt niet opgeslagen
});
