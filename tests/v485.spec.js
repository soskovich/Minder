/* v485: REPARATIE OP v482 - POTJES PER KALENDERDEEL VAN DE PERIODE, CONTANT OP ÉÉN MANIER, EN HET TYPISCHE NIVEAU ZICHTBAAR.
   Op v485-stand (salaris 24 okt, vandaag 28 okt, dus de periodestart ligt in de lopende kalendermaand NA de 1e):
   a. De lopende maand trekt alles af wat er die KALENDERMAAND al uitging (niet pas vanaf de periodestart), zodat er geen dag is met
      meer dan de normale dagdaling plus een termijn. Sabotage: alleen vanaf de periodestart aftrekken (dan vallen de boodschappen van
      begin oktober in de laatste dagen van oktober, ~EUR 187/dag).
   b. De maanden NA de lopende maand rekenen op het TYPISCHE niveau x aandeel x dagen-in-de-periode / dagen-van-de-maand, niet op de
      uitschieter van de lopende maand. Sabotage: de verwachting van de lopende maand (p.maand) gebruiken voor de volgende maanden.
   c. Contant: de krap-berekening (de som van de dagelijkse daling tot je salaris) en het voorstel (kS) lezen dezelfde portemonnee-stand
      (kasP), dus ze zijn gelijk. Sabotage: de oude regel die de maanden NA de lopende maand het hele budget (kM) liet dalen, zonder de
      portemonnee eraf (dan telt de krap meer dan het voorstel).
   d. Een betaaldatum-keuze op een SEPA-sleutel (van vóór v483, toen de keuze op keys[0] landde) wordt bij het laden verwijderd; een
      woning-sleutel blijft. Sabotage: laten staan. GECONSTRUEERD, niet gemeten. */
const { test, expect } = require('@playwright/test');
const S = require('./v485-stand');
const { LEEF } = S;
const B = require('./bron-kaal');

test('a. de lopende maand trekt alles af wat er die kalendermaand al uitging; geen dag met meer dan de normale daling + een termijn', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate((LEEF) => {
    const SP = salPeriode(), rr = rekVoorstel().rekAlle.find(x => x.acc === LEEF);
    const bo = (rr.potDelen || []).find(p => p.k === 'boodschappen');
    const nov = rr.uitDagDelen('2026-11-15').pot;                 // het normale (typische) dagtempo van boodschappen
    const oct = ['2026-10-29', '2026-10-30', '2026-10-31'].map(d => rr.uitDagDelen(d).pot);
    /* soms-termijnen zijn de losse dagen (een potje met een gebruikelijke dag); die tellen als "termijn". De lopende-maand-dagen
       29/30/31 okt dragen geen soms-termijn (overig valt op de 21e), dus hun daling is puur het vaak-tempo. */
    return { al: bo.alPeriode, maand: Math.round(bo.maand), nov: Math.round(nov * 100) / 100, oct: oct.map(v => Math.round(v * 100) / 100) };
  }, LEEF);
  expect(r.al).toBeGreaterThan(600);                             // de boodschappen van begin oktober (660) zijn afgetrokken (sabotage: 0)
  for (const v of r.oct) expect(v).toBeLessThanOrEqual(r.nov + 0.5);  // geen oktober-dag boven het normale tempo (sabotage: ~187 >> 11,7)
});

test('b. de maanden na de lopende maand rekenen op het typische niveau, niet op de uitschieter van de lopende maand', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate((LEEF) => {
    const rr = rekVoorstel().rekAlle.find(x => x.acc === LEEF);
    const bo = (rr.potDelen || []).find(p => p.k === 'boodschappen');
    const dim = 30;                                              // november heeft 30 dagen
    return { nov: rr.uitDagDelen('2026-11-15').pot, typisch: bo.typisch, maand: bo.maand, aandeel: bo.aandeel, dim };
  }, LEEF);
  const typRate = r.typisch * r.aandeel / r.dim, maandRate = r.maand * r.aandeel / r.dim;
  expect(Math.abs(r.nov - typRate)).toBeLessThan(0.5);           // november = typisch x aandeel / dim (sabotage: p.maand gebruiken)
  expect(Math.abs(r.nov - maandRate)).toBeGreaterThan(5);        // en duidelijk NIET de uitschieter van oktober (660/30 ~ 22)
});

test('c. contant is in krap en voorstel gelijk, uit dezelfde portemonnee-stand (kasP)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate((LEEF) => {
    const SP = salPeriode(), rr = rekVoorstel().rekAlle.find(x => x.acc === LEEF);
    let kasSom = 0; for (let d = rekDag(vandaagYMD(), 1); d <= SP.cur.eind; d = rekDag(d, 1)) kasSom += rr.uitDagDelen(d).kas;
    return { kasSom: Math.round(kasSom * 100) / 100, kasS: Math.round(rr.kasS * 100) / 100 };
  }, LEEF);
  expect(r.kasS).toBeGreaterThan(0);                             // er is contant in het voorstel
  expect(Math.abs(r.kasSom - r.kasS)).toBeLessThan(0.5);         // de krap-som is gelijk aan het voorstel (sabotage oude TUSSENDOOR-regel: krap > voorstel)
});

test('d. een betaaldatum-keuze op een SEPA-sleutel wordt bij het laden verwijderd; de woning-sleutel blijft', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    SET.vastDatum = { 'ALLIANZ NEDERLAND SC': { keuze: 'nasal' }, 'woning|NL77CATH0000009999': { keuze: 'nasal' } };
    delete SET.vastDatum485;
    const ran = vastDatumOpruim485();
    return { ran, keys: Object.keys(SET.vastDatum || {}), weg: (SET.vastDatum485 || {}).weg };
  });
  expect(r.ran).toBe(true);
  expect(r.keys).toEqual(['woning|NL77CATH0000009999']);         // de SEPA-sleutel is weg, de woning blijft (sabotage: laten staan)
  expect(r.weg).toContain('ALLIANZ NEDERLAND SC');
  /* en de opruiming draait bij het laden: load() roept vastDatumOpruim485() aan */
  const src = await B.kaalUit(page, 'load');
  expect(src).toContain('vastDatumOpruim485()');
});
