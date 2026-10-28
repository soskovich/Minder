/* v486 (punt 5): EENMALIG MARKEREN BIJ ELKE UITGAVE. In de boekingssheet staat een schakelaar "Eenmalig"; hij schrijft hetzelfde
   label als "Klopt, eenmalig" (SET.eenmaligOk), de ENE bron. Markeer je een boeking eenmalig, dan telt hij niet meer in zijn potje
   (geenNormTx) en niet in het typische niveau (piekInScope valt weg → uit ritAdd), dus het typische niveau daalt; uitzetten brengt
   het terug. Blok 23 toont per maand het bruto, waarvan eenmalig, en wat na aftrek overblijft. De potjessheet op Inzichten draagt
   per boeking een klein "eenmalig ›" naar de boeking.
   Op v485-stand: Boodschappen op Leefgeld, typisch 350 (jul/aug/sep elk 350). Eén augustusboeking (50) eenmalig → aug 300, mediaan
   van [350,300,350] = 333. */
const { test, expect } = require('@playwright/test');
const S = require('./v485-stand');
const { LEEF, MAIN } = S;

const typischVan = (page) => page.evaluate((LEEF) => {
  const rr = rekVoorstel().rekAlle.find(x => x.acc === LEEF), bo = (rr.potDelen || []).find(p => p.k === 'boodschappen');
  return bo ? bo.typisch : null;
}, LEEF);

test('a. een boeking eenmalig markeren laat het typische niveau van dat potje dalen; uitzetten brengt het terug', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const aug = await page.evaluate((LEEF) => TX.filter(t => t.acc === LEEF && catOf(t) === 'boodschappen' && t.date.slice(0, 7) === '2026-08')[0].id, LEEF);
  const voor = await typischVan(page);
  await page.evaluate((id) => eenmaligZet(id), aug);
  const naTyp = await typischVan(page);
  const okSet = await page.evaluate((id) => !!(SET.eenmaligOk || {})[id], aug);
  await page.evaluate((id) => eenmaligZet(id), aug);                 // uitzetten
  const terug = await typischVan(page);
  expect(voor).toBe(350);
  expect(okSet).toBe(true);                                          // de toggle schreef SET.eenmaligOk (sabotage: aan-tak schrijft niet)
  expect(naTyp).toBeLessThan(voor);                                  // typisch daalt (333)
  expect(naTyp).toBe(333);
  expect(terug).toBe(350);                                          // uitzetten brengt het terug
});

test('b. blok 23 toont per maand het bruto, waarvan eenmalig, en na aftrek', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const line = () => page.evaluate(() => (diagRekVerdeling().join('\n').split('\n').find(l => /Boodschappen:/.test(l)) || '').trim());
  const voor = await line();
  const aug = await page.evaluate((LEEF) => TX.filter(t => t.acc === LEEF && catOf(t) === 'boodschappen' && t.date.slice(0, 7) === '2026-08')[0].id, LEEF);
  await page.evaluate((id) => eenmaligZet(id), aug);
  const na = await line();
  expect(voor).toContain('maanden: jul 350');                       // de maandreeks met bruto per maand
  expect(voor).not.toContain('waarvan eenmalig');                   // niets eenmalig: geen aftrek-noot
  expect(na).toContain('aug 350 (waarvan eenmalig 50 → na aftrek 300)'); // sabotage: eenmAf altijd 0 → geen noot
  expect(na).toContain('typisch 333');
});

test('c. de potjessheet op Inzichten draagt per boeking een klein "eenmalig ›" naar de boeking', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  await page.evaluate(() => { go('ins'); openInsPotje('boodschappen'); });
  const n = await page.locator('[data-insem]').count();
  expect(n).toBeGreaterThan(0);                                     // per boeking een eenmalig-link (sabotage: insEenmaligLijst geeft '')
  /* de link opent de boeking (openSheet), waar de schakelaar staat */
  const first = await page.locator('[data-insem]').first().getAttribute('onclick');
  expect(first).toContain('openSheet(');
});

test('d. de schakelaar staat in de sheet van een uitgave (ook met potje), niet bij inkomen, en leest SET.eenmaligOk', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const bood = await page.evaluate((LEEF) => TX.filter(t => t.acc === LEEF && catOf(t) === 'boodschappen')[0].id, LEEF);
  const sal = await page.evaluate((MAIN) => (TX.find(t => t.acc === MAIN && t.amount > 0 && CATS[catOf(t)].type === 'income') || {}).id, MAIN);
  await page.evaluate((id) => openSheet(id), bood);
  expect(await page.locator('[data-eenmaligtoggle]').count()).toBe(1);   // uitgave: de schakelaar staat er (sabotage: expense-gate → altijd)
  expect(await page.locator('[data-eenmaligtoggle]').first().isChecked()).toBe(false);
  /* markeer via SET.eenmaligOk en heropen: de checkbox leest die bron */
  await page.evaluate((id) => { SET.eenmaligOk = SET.eenmaligOk || {}; SET.eenmaligOk[id] = { op: '2026-10-28', cat: 'boodschappen' }; _dataGen++; openSheet(id); }, bood);
  expect(await page.locator('[data-eenmaligtoggle]').first().isChecked()).toBe(true);
  if (sal) { await page.evaluate((id) => openSheet(id), sal); expect(await page.locator('[data-eenmaligtoggle]').count()).toBe(0); } // inkomen: geen schakelaar
});
