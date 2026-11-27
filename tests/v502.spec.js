/* v502: Plan · toewijzing verplaatsen tussen doelen, "op schema" in maanden, en de opzij-tegel per periode. Op tests/v502-stand.js
   (26 nov 2026, de era; Noodfonds 4.000/4.000, Inrichting woning 0/5.000, Kosten Koper 2.000/15.000 streef jan 2028, spaarsaldo
   6.000, inleg 3.000). */
const { test, expect } = require('./klok');
const V = require('./v502-stand');

/* onderhoud3 (punt 1): de doelrijen met hun ⇄ verplaats staan in de sheet van de laag Doelen */
const naarPlan = async page => { await page.evaluate(() => { closeSheet(); go('vooruit'); }); };
const openVan = async (page, id) => { await naarPlan(page); await page.evaluate(() => openLaagDoelen()); await page.locator(`[data-verplaats="${id}"]`).click(); await expect(page.locator('#planVerplaats')).toBeVisible(); };
const stand = page => page.evaluate(() => ({ kk: planToeVan('kk'), iw: planToeVan('iw'), nf: planToeVan('noodfonds'),
  goals: JSON.stringify(SET.goals), nfRaw: SET.nfToegewezen, saldo: spaarSaldo().cur, allesVol: planKpiData().allesVol, log: (SET.planVerplaatsLog || []).length }));

test.describe('v502', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('a: €2.000 van Kosten Koper naar Inrichting: toewijzingen 0 en 2.000, saldo en Alles vol gelijk, een logregel', async ({ page }) => {
    await V.boot(page);
    const voor = await stand(page);
    expect(voor.kk).toBe(2000); expect(voor.iw).toBe(0); expect(voor.log).toBe(0);
    await openVan(page, 'kk');
    await expect(page.locator('[data-pvuitleg]')).toHaveText('Het geld blijft op je spaarrekening. Minder verplaatst niets; je verdeelt opnieuw wat er staat.');
    await page.locator('[data-pvnaar="iw"]').click();
    await page.locator('#pvBedrag').fill('2000');
    /* het gevolg vooraf: per doel het nieuwe bedrag en de vol-maand, en Alles vol gelijk */
    await expect(page.locator('[data-pvgevolg="kk"]')).toHaveAttribute('data-pvtoe', '0');
    await expect(page.locator('[data-pvgevolg="iw"]')).toHaveAttribute('data-pvtoe', '2000');
    await expect(page.locator('[data-pvgevolg="iw"]')).toContainText('€0 → €2.000');
    await expect(page.locator('[data-pvgevolg="kk"] [data-pvstreef]')).toContainText('streefdatum jan 2028');
    await expect(page.locator('[data-pvallesvol="gelijk"]')).toContainText('verplaatsen verandert het totaal niet');
    await page.locator('[data-pvbevestig]').click();
    await expect(page.locator('#toast')).toContainText('Toewijzing verplaatst: €2.000 van Kosten Koper + aankoopmakelaar naar Inrichting woning');
    await expect(page.locator('#toast [data-ongedaan]')).toBeVisible();
    const na = await stand(page);
    expect(na.kk).toBe(0); expect(na.iw).toBe(2000);
    expect(na.saldo).toBe(voor.saldo);
    expect(na.allesVol).toBe(voor.allesVol);
    expect(na.log).toBe(1);
    const L = await page.evaluate(() => SET.planVerplaatsLog[0]);
    expect(L).toMatchObject({ van: 'kk', naar: 'iw', bedrag: 2000, voor: { van: 2000, naar: 0 }, na: { van: 0, naar: 2000 } });
    /* de log staat in de uitleg achter de ⓘ op Plan */
    await naarPlan(page);
    expect(await page.evaluate(() => NOTES.planUitleg)).toContain('€2.000 van Kosten Koper + aankoopmakelaar naar Inrichting woning');
  });

  test('b: ongedaan maken herstelt beide toewijzingen exact', async ({ page }) => {
    await V.boot(page);
    const voor = await stand(page);
    await openVan(page, 'kk'); await page.locator('[data-pvnaar="iw"]').click(); await page.locator('#pvBedrag').fill('750');
    await page.locator('[data-pvbevestig]').click();
    expect((await stand(page)).kk).toBe(1250);
    await page.locator('#toast [data-ongedaan]').click();
    const na = await stand(page);
    expect(na.kk).toBe(2000); expect(na.iw).toBe(0); expect(na.goals).toBe(voor.goals); expect(na.nfRaw).toBe(voor.nfRaw);
    expect(await page.evaluate(() => SET.planVerplaatsLog[0].ongedaan)).toBeTruthy();
  });

  test('c: hoogstens wat er bij het van-doel staat, en naar het noodfonds hoogstens wat het nog kan hebben', async ({ page }) => {
    await V.boot(page);
    await openVan(page, 'kk'); await page.locator('[data-pvnaar="iw"]').click();
    await page.locator('#pvBedrag').fill('2500');
    await expect(page.locator('[data-pvbevestig]')).toBeDisabled();
    await expect(page.locator('[data-voetreden]')).toContainText('Er staat €2.000 bij');
    await page.evaluate(() => planVerplaatsZet());
    expect((await stand(page)).kk).toBe(2000);
    await page.locator('#pvBedrag').fill('2000');
    await expect(page.locator('[data-pvbevestig]')).toBeEnabled();
    /* naar een noodfonds dat niet vol is: doel min toegewezen */
    await V.boot(page, { nfToe: 3000, spaarSaldo: 5000 });
    await openVan(page, 'kk'); await page.locator('[data-pvnaar="noodfonds"]').click();
    await page.locator('#pvBedrag').fill('1500');
    await expect(page.locator('[data-pvbevestig]')).toBeDisabled();
    await expect(page.locator('[data-voetreden]')).toContainText('Je noodfonds kan nog €1.000 hebben');
    await page.locator('#pvBedrag').fill('1000');
    await expect(page.locator('[data-pvbevestig]')).toBeEnabled();
    await page.locator('[data-pvbevestig]').click();
    const s = await stand(page); expect(s.nf).toBe(4000); expect(s.kk).toBe(1000);
  });

  test('d: uit het noodfonds: de waarschuwing staat voor de knop, en de volgende inleg gaat eerst naar het noodfonds', async ({ page }) => {
    await V.boot(page);
    await openVan(page, 'noodfonds'); await page.locator('[data-pvnaar="iw"]').click(); await page.locator('#pvBedrag').fill('1000');
    const w = page.locator('[data-pvwaarschuwing]');
    await expect(w).toHaveText('Je noodfonds zakt naar €3.000, €1.000 onder je doel van €4.000. Dat is je buffer voor onverwachte kosten. Je plan vult hem daarna eerst weer aan.');
    await expect(page.locator('[data-pvbevestig]')).toHaveText('Toch verplaatsen');
    expect(await page.evaluate(() => !!(document.querySelector('[data-pvwaarschuwing]').compareDocumentPosition(document.querySelector('[data-pvbevestig]')) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expect(page.locator('[data-pvgevolg="noodfonds"] [data-pvnfvol]')).toContainText('je maandinleg gaat eerst weer naar je noodfonds, tot hij vol is in');
    await page.locator('[data-pvbevestig]').click();
    const A = await page.evaluate(() => { const P = allocatePlan(); return { nf: P.find(p => p.id === 'noodfonds').alloc, nfRest: P.find(p => p.id === 'noodfonds').rest, eerste: P[0].id, doel: noodfondsModel().doel }; });
    expect(A.doel).toBe(4000); expect(A.eerste).toBe('noodfonds'); expect(A.nfRest).toBe(1000); expect(A.nf).toBe(1000);
  });

  test('e: een vol noodfonds is grijs in de naar-lijst, met de link naar het doel', async ({ page }) => {
    await V.boot(page);
    await openVan(page, 'kk');
    const nf = page.locator('[data-pvnaar="noodfonds"]');
    await expect(nf).toHaveAttribute('data-pvvol', '');
    await expect(nf).toContainText('vol (€4.000 van €4.000) · verhoog eerst het doel ›');
    await nf.click();
    expect(await page.evaluate(() => window._pv.naar)).toBe(null);
    await page.locator('[data-pvverhoog]').click();
    expect(await page.evaluate(() => !!window._nfSheet)).toBe(true);
  });

  test('f: "op schema" in maanden tegen de laatste streefdatum, amber bij te laat, alleen de maand zonder streefdatum', async ({ page }) => {
    await V.boot(page); await naarPlan(page);
    const c = page.locator('[data-laag="doelen"] [data-kpischema]');   // v524: "op schema" verhuisde van de kop naar de laag Doelen
    await expect(c).toHaveText('9 maanden voor je streefdatum (jan 2028)');
    await expect(c).toHaveAttribute('data-kpischemamnd', '9');
    await V.boot(page, { kkStreef: '2027-02', iwStreef: '2027-01' }); await naarPlan(page);
    await expect(c).toHaveText('2 maanden na je streefdatum (feb 2027)');
    await expect(c).toHaveAttribute('data-kpischemamnd', '-2');
    const kleur = await page.evaluate(() => getComputedStyle(document.querySelector('[data-kpischemalaat]')).color);
    const amber = await page.evaluate(() => { const s = document.createElement('span'); s.style.color = 'var(--amber)'; document.body.appendChild(s); const k = getComputedStyle(s).color; s.remove(); return k; });
    expect(kleur).toBe(amber);
    await V.boot(page, { set5: { goals: [{ id: 'iw', naam: 'Inrichting woning', doel: 5000, gespaard: 0, streefdatum: '' }, { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 2000, streefdatum: '' }] } });
    await naarPlan(page);
    await expect(page.locator('[data-laag="doelen"] [data-kpivol]')).toContainText('apr 2027');
    await expect(c).toHaveCount(0);
  });

  test('g: niets voorgekozen bij openen', async ({ page }) => {
    await V.boot(page);
    await openVan(page, 'kk');
    await expect(page.locator('[data-pvnaar][data-gekozen="1"]')).toHaveCount(0);
    expect(await page.evaluate(() => window._pv.naar)).toBe(null);
    await expect(page.locator('#pvBedrag')).toHaveValue('');
    await expect(page.locator('[data-pvbevestig]')).toBeDisabled();
    await expect(page.locator('[data-pvgevolg]')).toHaveCount(0);
    await expect(page.locator('[data-voetreden]')).toContainText('Kies waar het heen gaat');
  });

  test('h: na verplaatsen leest de stilstaand-som de nieuwe toewijzing', async ({ page }) => {
    await V.boot(page);
    const voor = await page.evaluate(() => stilstaandDelen());
    expect(voor).toMatchObject({ saldo: 6000, nf: 4000, doelen: 2000, stil: 0 });
    await openVan(page, 'noodfonds'); await page.locator('[data-pvnaar="iw"]').click(); await page.locator('#pvBedrag').fill('1000');
    await page.locator('[data-pvbevestig]').click();
    const na = await page.evaluate(() => stilstaandDelen());
    expect(na).toMatchObject({ saldo: 6000, nf: 3000, doelen: 3000, stil: 0 });
  });

  /* v524: de opzij-tegel (met "eenmalig ontvangen" en de era-periode) verliet de kop naar blok 2 (gestort naast plan, mockup v10
     regel 145). De tegel bestaat niet meer op Plan; de era-periode-meting (opzijEenheid over het salarisperiode-venster) blijft de
     bron, en blok 2 is het nieuwe huis. Eenmalig geld blijft buiten de spaarrekening-stortingen (het staat op de salarisrekening). */
  test('i: de opzij-tegel verliet de kop naar blok 2; de era-periode-meting blijft de bron', async ({ page }) => {
    await V.boot(page, { eenmalig: true }); await naarPlan(page);
    await expect(page.locator('#planKpi')).toHaveCount(0);
    await expect(page.locator('[data-kpiopzijperiode], [data-kpiopzijeenheid], [data-kpieenmalig]')).toHaveCount(0);
    await expect(page.locator('#planGestort')).toHaveCount(1);                 // opzij leeft nu in blok 2 (gestort naast plan)
    expect(await page.evaluate(() => eenmaligPeriode())).toBeGreaterThan(0);   // er IS eenmalig geld in deze periode
    const OE = await page.evaluate(() => opzijEenheid({ soort: 'periode', ym: '2026-11', start: '2026-11-24', eind: '2026-12-23' }));
    expect(OE && typeof OE.netto).toBe('number');                             // het era-venster is nog de meetbron
    expect(OE.erin).toBeGreaterThanOrEqual(0);
  });
});
