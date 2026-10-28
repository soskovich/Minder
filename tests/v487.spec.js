/* v487: REPARATIE BETAALDATUM "NA MIJN SALARIS". Gemeten op het toestel (28-10, v483): de woning Nathaniel Cathalina heeft een gewone
   betaaldag 1 nov, NA de salarisstorting van de lopende periode (26 okt). "Na mijn salaris" zette de huur op 29 okt (26 okt +
   VAST_NASAL_DAGEN 3), dus BINNEN de lopende periode, en de stand op 23 nov veranderde niet. Reparatie: "Na mijn salaris" is het
   EERSTE verwachte salaris OP OF NA de gewone betaaldag van die termijn, plus 1 dag (VAST_NASAL_DAGEN=1). Voor 1 nov is dat 24 nov
   (nov-salaris), dus 25 nov, buiten de lopende periode (eind 23 nov) en de stand op 23 nov stijgt met EUR 300.
   VOOR (buggy v486): nasal → huur 29 okt, stand 23 nov = 800. NA: nasal → huur 25 nov, stand = 1100 (+300). */
const { test, expect } = require('@playwright/test');
const S = require('./v487-stand');
const { LEEF } = S;

/* meet onder een gegeven SET.vastDatum: de woning-termijnen in termAlle, de stand op 23 nov, de "Nu"-regel uit vastDatumNu, en
   of 25 nov buiten de lopende periode valt. Geen save(), zodat de meting de stand niet verschuift. */
const meet = (page, vd) => page.evaluate(({ LEEF, vd }) => {
  const SP = salPeriode(), wk = woningForecast().key;
  SET.vastDatum = vd; _dataGen++; window._rekV = null;
  const P = rekVoorstel(), rr = P.rekAlle.find(x => x.acc === LEEF);
  const terms = (rr.termAlle || []).filter(t => t.key === wk).map(t => t.date).sort();
  let stand = accBalance(LEEF);
  for (let d = rekDag(vandaagYMD(), 1); d <= '2026-11-23'; d = rekDag(d, 1)) stand -= rr.uitDag(d);
  return { terms, stand23: Math.round(stand), nu: vastDatumNu(wk), eind: SP.cur.eind };
}, { LEEF, vd });

test('a. "Na mijn salaris" pakt het eerste salaris op of na de gewone betaaldag (24 nov), dus 25 nov buiten de periode, stand +300', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const wk = await page.evaluate(() => woningForecast().key);
  const def = await meet(page, {});
  const nasal = await meet(page, { [wk]: { keuze: 'nasal' } });
  expect(def.terms).toContain('2026-11-01');                          // gewone dag 1 nov
  expect(def.eind).toBe('2026-11-23');                                // lopende periode eindigt 23 nov
  expect(nasal.terms).toEqual(['2026-11-25']);                        // 24 nov (salaris) + 1, NIET 29 okt (sabotage: eerste salaris in de periode → 27 okt)
  expect(nasal.terms[0] > nasal.eind).toBe(true);                     // 25 nov valt NA 23 nov, dus buiten de periode
  expect(nasal.stand23).toBe(def.stand23 + 300);                      // de huur telt niet meer mee tot 23 nov → stand +300
  expect(nasal.nu.datum).toBe('2026-11-25');
  expect(nasal.nu.reden).toContain('na je salaris van 24 nov');       // de reden onder de post
});

test('b. "Alleen deze keer later" verlegt alleen de termijn in de lopende periode; de volgende staat weer op de gewone dag', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const wk = await page.evaluate(() => woningForecast().key);
  const SPym = await page.evaluate(() => salPeriode().cur.ym);
  const eenm = await meet(page, { [wk]: { keuze: 'eenmalig', periode: SPym } });
  expect(eenm.terms).toContain('2026-11-25');                         // de termijn van de lopende periode verlegd
  expect(eenm.terms).toContain('2026-12-01');                         // de volgende termijn weer op de gewone dag (sabotage: blijvend → 2026-12-25, geen 01)
  expect(eenm.terms).not.toContain('2026-12-25');
});

test('c. "Op een vaste dag" (15) zet de termijn op de 15e, elke maand', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const wk = await page.evaluate(() => woningForecast().key);
  const op = await meet(page, { [wk]: { keuze: 'op', dag: 15 } });
  expect(op.terms.length).toBeGreaterThan(0);
  expect(op.terms.every(d => d.slice(8, 10) === '15')).toBe(true);    // elke termijn op de 15e (sabotage: de dag negeren → 01)
  expect(op.nu.datum.slice(8, 10)).toBe('15');
  expect(op.nu.reden).toContain('15e');
});
