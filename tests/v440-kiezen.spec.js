/* v440 mockup sectie 4: KIEZEN — HET ADVIES. "Zo verdeel je je salaris" staat in Kiezen met drie knoppen, niets
   voorgeselecteerd: Advies volgen (akkoord met het voorstel per rekening), Andere verdeling (zelf de bedragen zetten) en
   Niet nu. Bij Andere verdeling rekent opzij automatisch mee (de som blijft het salaris) en staat het gevolg (laagste saldo
   per rekening) er live onder; de knoppen worden dan Deze kiezen / Terug naar advies. De keuze wordt het doel voor opzij
   (opzijPeriode) en de basis voor moment 1/2 (SET.salVerdeling). De verdeling per rekening en de huur-rekening komen in v441. */
const { test, expect } = require('@playwright/test');
const S = require('./v432-stand');
const { LEEF } = S;
const txt = (page, sel) => page.locator('#salVerdeling ' + sel).innerText();

test('a. advies-modus: Advies volgen / Andere verdeling / Niet nu, drie knoppen, niets voorgeselecteerd', async ({ page }) => {
  await S.boot(page);
  await page.evaluate(() => openSalVerdeling('pat:spaargeld'));
  const b = await page.locator('#salVerdeling [data-voet] button').evaluateAll(es => es.map(e => ({ t: e.innerText.trim(), c: e.className })));
  expect(b.map(x => x.t)).toEqual(['Advies volgen', 'Andere verdeling', 'Niet nu']);
  expect(b.every(x => x.c === 'btn sec')).toBe(true);   // geen voorgeselecteerde (primaire) knop
  await expect(page.locator('#salVerdeling [data-salvakkoord]')).toHaveText('Advies volgen');
});

test('b. Andere verdeling: aanpasvelden, opzij rekent mee (som = salaris), gevolg live, knoppen Deze kiezen / Terug naar advies', async ({ page }) => {
  await S.boot(page);
  await page.evaluate(() => openSalVerdeling('pat:spaargeld'));
  const op0 = await txt(page, '[data-salvopzij]');
  await page.locator('#salVerdeling [data-salvaanpassen]').click();   // Andere verdeling
  const b = await page.locator('#salVerdeling [data-voet] button').evaluateAll(es => es.map(e => e.innerText.trim()));
  expect(b).toEqual(['Deze kiezen', 'Terug naar advies']);           // geen Niet nu meer in de aanpas-modus
  await expect(page.locator('#salVerdeling [data-salvakkoord]')).toHaveText('Deze kiezen');
  // opzij rekent mee: 500 meer op Leefgeld is 500 minder opzij (de som blijft het salaris)
  const laten = await page.evaluate((a) => rekVoorstel().rek.find(r => r.acc === a).laten, LEEF);
  await page.locator(`#salVerdeling [data-salvveld="${LEEF}"]`).fill(String(laten + 500));
  const num = t => +t.match(/Opzij €([\d.]+)/)[1].replace(/\./g, '');
  expect(num(op0) - num(await txt(page, '[data-salvopzij]'))).toBe(500);
  await expect(page.locator('#salVerdeling [data-salvgevolg]')).toContainText('laagste saldo');
});

test('c. Terug naar advies zet de modus terug (de aanpasvelden en de twee knoppen verdwijnen)', async ({ page }) => {
  await S.boot(page);
  await page.evaluate(() => openSalVerdeling('pat:spaargeld'));
  await page.locator('#salVerdeling [data-salvaanpassen]').click();
  await expect(page.locator(`#salVerdeling [data-salvveld="${LEEF}"]`)).toHaveCount(1);
  await page.locator('#salVerdeling [data-salvterug]').click();
  await expect(page.locator(`#salVerdeling [data-salvveld="${LEEF}"]`)).toHaveCount(0);   // terug in advies-modus
  await expect(page.locator('#salVerdeling [data-salvakkoord]')).toHaveText('Advies volgen');
  expect(await page.evaluate(() => SET.salVerdeling || null)).toBeNull();   // Terug schrijft niets
});

test('d. de keuze wordt het doel voor opzij (opzijPeriode) en de basis voor moment 1/2', async ({ page }) => {
  await S.boot(page);
  await page.evaluate(() => { go('maand'); oorzaakKies('pat:spaargeld', 'opgedeeld'); oorzaakBevestig('pat:spaargeld'); openSalVerdeling('pat:spaargeld'); });
  await page.locator('#salVerdeling [data-salvakkoord]').click();   // Advies volgen
  const r = await page.evaluate(() => ({ svOpzij: SET.salVerdeling.opzij, svYM: SET.salVerdeling.salYM, O: opzijPeriode() }));
  expect(r.svOpzij).toBeGreaterThan(0);
  expect(r.O.doel).toBe(r.svOpzij);        // opzijPeriode leest het doel uit de keuze
  expect(r.svYM).toBeTruthy();             // de periode-sleutel die moment 1/2 (salAfspraakPeriode) leest
});
