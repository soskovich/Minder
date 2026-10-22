/* v452 (gevraagd door de gebruiker, antwoord op deel A van de controles, punt 3): Lausa Eriksson EUR 159 in oktober is eenmalig met
   de regel van Gemeente EUR 484 (Onvoorzien: buiten vast en potjes, geen norm), en vanaf 1 november staat er een reservering
   Laserbehandeling (EUR 159 per 6 maanden, EUR 27 per maand, partij Lausa Eriksson) die de volgende betaling van die partij herkent
   als uit de reservering betaald. Op v421-stand (10 oktober 2026, GECONSTRUEERD: de boekingen van het toestel staan alleen daar),
   met de Tikkie aan Lausa Eriksson op 09-10 in het potje Zorg zoals op het toestel. */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');

async function boot(page, zaai) {
  await S.boot(page);
  await page.evaluate(({ MAIN, zaai }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v452' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    add('2026-10-09', -159, 'Lausa Eriksson via Tikki', 'LAUSA ERIKSSON VIA TIKKIE BETAALVERZOEK', 'zorg');
    SET.budgets = Object.assign({}, SET.budgets, { zorg: Math.max(+(SET.budgets || {}).zorg || 0, 200) });
    TX.sort((a, c) => a.date.localeCompare(c.date));
    applyOwnAccounts(); buildAccMeta();
    if (zaai) kennisZaai();
    save(); render();
  }, { MAIN: S.MAIN, zaai });
}
const lausa = page => page.evaluate(() => TX.find(t => t.amount === -159 && /ERIKSSON/.test(t.desc)).id);

test.describe('v452 · Lausa eenmalig en de reservering Laserbehandeling', () => {
  test('a. de boeking gaat van het potje Zorg naar Onvoorzien (buiten vast en potjes, geen norm), eenmalig door jou, zonder vraag', async ({ page }) => {
    await boot(page, false);
    const id = await lausa(page);
    const voor = await page.evaluate(id => { delete SET.kennis425.laser452; const t = TX.find(x => x.id === id);
      return { cat: catOf(t), zorg: catSpendMap('2026-10').zorg || 0, groep: diagGroep(t, maandPotjes('2026-10').B) }; }, id);
    expect(voor.cat).toBe('zorg');
    expect(voor.groep).toBe('potjes (variabel)');
    const na = await page.evaluate(id => { const g = kennisZaai(); save(); const t = TX.find(x => x.id === id);
      return { g, cat: catOf(t), geenNorm: geenNorm(catOf(t)), zorg: catSpendMap('2026-10').zorg || 0, groep: diagGroep(t, maandPotjes('2026-10').B),
        B: benoemStand(t), een: eenmaligBevestigd(t), vraag: gegevensVragen().some(q => q.t && q.t.id === id),
        zorg159: Object.values(SET.kennis).filter(E => E.zaad === 'zorg159').length,
        laser: Object.values(SET.kennis).filter(E => E.zaad === 'laser452').map(E => [E.soort, E.label, E.aard, E.partij]),
        nog: kennisZaai() }; }, id);
    expect(na.g).toBe(true);
    expect([na.cat, na.geenNorm, na.groep]).toEqual(['onvoorzien', true, 'buiten vast en potjes']);
    expect(Math.round(voor.zorg - na.zorg)).toBe(159);
    expect([na.B.laag, na.B.aard, na.B.label]).toEqual(['antw', 'eenmalig', 'Laserbehandeling']);
    expect(na.een).toBeTruthy();
    expect(na.vraag).toBe(false);
    expect(na.zorg159).toBe(0);
    expect(na.laser).toEqual([['benoem', 'Laserbehandeling', 'eenmalig', 'Lausa Eriksson']]);
    expect(na.nog).toBe(false);   // een keer
  });

  test('b. de reservering: EUR 159 per 6 maanden = EUR 27 per maand, vanaf november, partij Lausa Eriksson; de volgende betaling telt als uit de reservering', async ({ page }) => {
    await boot(page, true);
    const r = await page.evaluate(({ MAIN }) => {
      const R = resLijst().filter(x => x.bron === 'laser452');
      const add = (d, n, ds) => { const t = { id: 'v452b' + d + n, date: d, amount: -159, acc: MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'zorg'; TX.push(t); return t; };
      const nov = add('2026-11-12', 'Lausa Eriksson via Tikki', 'LAUSA ERIKSSON VIA TIKKIE BETAALVERZOEK');
      const sep = add('2026-09-12', 'Lausa Eriksson via Tikki', 'LAUSA ERIKSSON VIA TIKKIE BETAALVERZOEK');
      const ander = add('2026-11-13', 'Posh Clinic', 'POSH CLINIC AMSTERDAM');
      save();
      const vlag = [uitReserveringBedrag(nov), uitReserveringBedrag(sep), uitReserveringBedrag(ander)];
      zetUitReservering(nov.id, 0, false);   // jouw nee wint van de herkenning
      const nee = [uitReserveringBedrag(nov), SET.uitReservering[nov.id]];
      zetUitReservering(nov.id, 159, false);
      return { R: R.map(x => [x.naam, x.bedrag, x.intervalM, x.partij, x.vanaf, x.cat]), pm: Math.round(R[0].bedrag / R[0].intervalM), vlag, nee, terug: uitReserveringBedrag(nov) };
    }, { MAIN: S.MAIN });
    expect(r.R).toEqual([['Laserbehandeling', 159, 6, 'Lausa Eriksson', '2026-11', 'zorg']]);
    expect(r.pm).toBe(27);
    expect(r.vlag).toEqual([159, 0, 0]);
    expect(r.nee).toEqual([0, 0]);
    expect(r.terug).toBe(159);
  });

  test('c. het zaad draait in load() en bewaart OVR, zodat de boeking na een herstart op Onvoorzien blijft', async ({ page }) => {
    await boot(page, false);
    const id = await lausa(page);
    const ovr = await page.evaluate(id => { delete SET.kennis425.laser452; SET.reserveringen = resLijst().filter(x => x.bron !== 'laser452'); save();
      load(); return JSON.parse(localStorage.getItem('minder_ovr') || '{}')[id]; }, id);
    expect(ovr).toBe('onvoorzien');
  });

  test('d. blok 20 toont Lausa onder geen norm in oktober en de reserveringspost met EUR 27 per maand', async ({ page }) => {
    await boot(page, true);
    const L = await page.evaluate(() => diagSalarisVerdeling());
    const gn = L.find(r => /GEEN NORM IN OKT/i.test(r)) || '';
    expect(gn).toMatch(/09-10 159\.00 Lausa Eriksson via Tikki \[Onvoorzien\]/);
    expect(gn).toMatch(/Laserbehandeling/);
    const i = L.findIndex(r => /RESERVERINGEN MET EEN PARTIJ/.test(r));
    expect(i).toBeGreaterThan(-1);
    expect(L[i + 1]).toMatch(/Laserbehandeling · partij Lausa Eriksson · €159 per 6 maanden = €27 per maand · vanaf 1 november/);
    expect(L[i + 1]).toMatch(/nog geen betaling/);
  });
});
