/* v483: REPARATIE OP v481, DE BETAALDATUMKNOP VAN DE HUUR. Twee vaste lasten op dezelfde dag op de betaalrekening (Leefgeld):
   een SEPA-incasso (Allianz) en de woning via Tikkie/iDEAL met de IBAN in de omschrijving (nonSepa, draagt de betaaldatum-keuze).
   a. "Na mijn salaris" op de WONING (via de DOM, want de sabotage zit in de render) → de woning valt buiten de lopende periode, de
      SEPA-post blijft staan, en het laagste punt stijgt met het huurbedrag (EUR 300). Sabotage: de render schrijft de keuze op
      keys[0] (de SEPA-post die als eerste in termAlle staat) in plaats van op de eigen sleutel van de post.
   b. Na de keuze toont de pop-up (salKrapKaart) het nieuwe tekort, of verdwijnt hij als alles past. Sabotage (punt 4): de
      leeg-gate van salKrapKaart overslaan, zodat de pop-up niet verdwijnt als de rekening na de keuze past. De door de gebruiker
      voorgestelde sabotage "de cache niet legen" (window._rekV=null weghalen uit vastDatumZet) is PER CONSTRUCTIE INERT: de sleutel
      van rekVoorstel draagt _dataGen (bumpt bij elke save) EN SET.vastDatum, dus de pop-up herrekent sowieso; die staat apart als
      inert-controle (verwacht groen).
   c. In de sheet: saldo nu − vaste lasten − potjes − contant = de stand op de dag voor het salaris, in centen gelijk aan TUSSENDOOR
      (hetzelfde model, r.uitDag). Sabotage: de vaste lasten uit de gegroepeerde/AFGERONDE per-post-regels lezen in plaats van exact;
      de SEPA-post draagt daarom EUR 99,40 (centen), zodat de som van de afgeronde regels van het exacte totaal afwijkt.
   GECONSTRUEERD op v483-stand (zie daar). */
const { test, expect } = require('@playwright/test');
const S = require('./v483-stand');
const { LEEF } = S;

/* leef laag: na de keuze nog steeds krap (test a + b-tekort + c). leef hoog: na de keuze past alles (test b-leeg). */
test('a. "Na mijn salaris" op de woning haalt de huur uit de periode; de SEPA-post blijft, de stand stijgt met het huurbedrag', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { booked: false, oktNa: true, leef: 350 });
  const wk = await page.evaluate(() => woningForecast().key);
  const stand = (p) => p.evaluate((LEEF) => {
    const P = rekVoorstel(), rr = P.rekAlle.find((x) => x.acc === LEEF), SP = salPeriode();
    const laagst = Math.round(salProjectie(rr, accBalance(LEEF), SP.cur.eind).laagst);
    const wonIn = (rr.termAlle || []).some((t) => t.key === woningForecast().key && t.date > vandaagYMD() && t.date <= SP.cur.eind);
    const sepaIn = (rr.termAlle || []).some((t) => t.key && t.key.indexOf('woning') < 0 && t.date > vandaagYMD() && t.date <= SP.cur.eind);
    return { laagst, wonIn, sepaIn };
  }, LEEF);
  const pre = await stand(page);
  /* de keuze via de DOM: open de sheet, klik de (enige) klikbare post (de woning), kies "Na mijn salaris". De render bouwt de
     onclick met de sleutel van de post; de sabotage (keys[0]) laat hem op de SEPA-post landen, en dan verschuift de projectie niet. */
  await page.evaluate((LEEF) => openKrapRek(LEEF), LEEF);
  expect(await page.locator('[data-totvastpost]').count()).toBe(1);           // alleen de woning is klikbaar, de SEPA-post niet
  expect(await page.locator('[data-totvastkey="' + wk + '"]').count()).toBe(1); // en hij draagt de WONING-sleutel
  await page.click('[data-totvastpost]');
  await page.click('[data-totdatumkeuze="nasal"]');
  const post = await stand(page);
  expect(pre.wonIn).toBe(true);                 // standaard valt de woning in de lopende periode
  expect(pre.sepaIn).toBe(true);                // en de SEPA-post ook
  expect(post.wonIn).toBe(false);               // na de keuze: de woning eruit
  expect(post.sepaIn).toBe(true);               // de SEPA-post blijft staan
  expect(post.laagst - pre.laagst).toBe(300);   // het laagste punt stijgt met het huurbedrag (sabotage keys[0]: de keuze landt op de SEPA-post → 0)
});

test('b. na de keuze toont de pop-up het nieuwe tekort; past alles, dan verdwijnt de pop-up', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  /* leef 350: blijft krap, het tekort zakt mee */
  await S.boot(page, { booked: false, oktNa: true, leef: 350 });
  const krap = await page.evaluate((LEEF) => {
    const nodig = () => { const h = salKrapKaart(); if (h === '') return 'leeg'; const m = document.createElement('div'); m.innerHTML = h; const row = m.querySelector('[data-saltekortrij="' + LEEF + '"]'); return row ? +row.getAttribute('data-nodig') : null; };
    return { voor: nodig() };
  }, LEEF);
  await page.evaluate((LEEF) => openKrapRek(LEEF), LEEF);
  await page.click('[data-totvastpost]');
  await page.click('[data-totdatumkeuze="nasal"]');
  const krapNa = await page.evaluate((LEEF) => {
    const h = salKrapKaart(); if (h === '') return 'leeg'; const m = document.createElement('div'); m.innerHTML = h; const row = m.querySelector('[data-saltekortrij="' + LEEF + '"]'); return row ? +row.getAttribute('data-nodig') : null;
  }, LEEF);
  expect(krap.voor).toBeGreaterThan(900);       // voor de keuze: tekort > 900 (v485: de potje/contant-projectie is lager, tekort 950 i.p.v. >1026; de 300-sprong blijft)
  expect(krapNa).toBeGreaterThan(0);            // na de keuze: nog krap
  expect(krap.voor - krapNa).toBe(300);         // het tekort in de pop-up zakt met het huurbedrag

  /* leef 1200: na de keuze past alles, dus de pop-up verdwijnt (sabotage: de leeg-gate overslaan → hij blijft) */
  await S.boot(page, { booked: false, oktNa: true, leef: 1200 });
  const voorLeeg = await page.evaluate(() => salKrapKaart() === '');
  await page.evaluate((LEEF) => openKrapRek(LEEF), LEEF);
  await page.click('[data-totvastpost]');
  await page.click('[data-totdatumkeuze="nasal"]');
  const naLeeg = await page.evaluate(() => salKrapKaart() === '');
  const popWeg = await page.evaluate(() => salKrapPopupMisschien() === false && salKrapKaart() === '');
  expect(voorLeeg).toBe(false);                 // voor de keuze: de rekening is krap, de pop-up staat er
  expect(naLeeg).toBe(true);                    // na de keuze: alles past, de pop-up verdwijnt
  expect(popWeg).toBe(true);                    // en komt niet meer vanzelf terug
});

test('b-inert. "de cache niet legen" is per constructie inert (de sleutel draagt _dataGen en SET.vastDatum)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { booked: false, oktNa: true, leef: 1200 });
  /* dezelfde stroom als b, maar deze test bestaat om te tonen dat window._rekV=null weghalen uit vastDatumZet niets verandert:
     de pop-up herrekent via de sleutel. Verwacht GROEN, ook met die sabotage. */
  await page.evaluate((LEEF) => openKrapRek(LEEF), LEEF);
  await page.click('[data-totvastpost]');
  await page.click('[data-totdatumkeuze="nasal"]');
  const naLeeg = await page.evaluate(() => salKrapKaart() === '');
  expect(naLeeg).toBe(true);
});

test('c. saldo − vaste lasten − potjes − contant = de stand dag voor je salaris, in centen gelijk aan TUSSENDOOR', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { booked: false, oktNa: true, leef: 350 });
  const r = await page.evaluate((LEEF) => {
    const D = totSalarisData(LEEF); if (!D) return null;
    /* TUSSENDOOR: dezelfde reeks met r.uitDag over de lopende periode (blok 23) */
    const P = rekVoorstel(), rr = P.rekAlle.find((x) => x.acc === LEEF), SP = salPeriode();
    let x = accBalance(LEEF); for (let d = rekDag(vandaagYMD(), 1); d <= SP.cur.eind; d = rekDag(d, 1)) x -= rr.uitDag(d);
    const vastRijSom = D.vastRij.reduce((a, y) => a + y.bedrag, 0);
    return {
      eind: Math.round(D.eindExact * 100), recon: Math.round((D.saldoExact - D.vastExact - D.potExact - D.kasExact) * 100),
      tuss: Math.round(x * 100), vastExact: D.vastExact, vastRijSom,
      nSepa: D.vastRij.filter((y) => !y.nonSepa).length, nWon: D.vastRij.filter((y) => y.nonSepa).length,
    };
  }, LEEF);
  expect(r).toBeTruthy();
  expect(r.nSepa).toBeGreaterThan(0);                           // er staat een SEPA-post in de reeks
  expect(r.nWon).toBeGreaterThan(0);                            // en een niet-SEPA post (de woning)
  expect(Math.abs(r.vastRijSom - r.vastExact)).toBeGreaterThan(0.005); // invoermeting: de afgeronde per-post-som wijkt af van het exacte totaal, dus de sabotage KAN bijten
  expect(r.recon).toBe(r.eind);                                 // saldo − vast − pot − kas = de stand (sabotage: vastExact uit de afgeronde regels → verschilt)
  expect(r.eind).toBe(r.tuss);                                  // in centen gelijk aan TUSSENDOOR
});
