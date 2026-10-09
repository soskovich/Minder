/* v362: blok 16 toont een kenmerk (een machtiging, een klantnummer) dat precies een keer voorkomt, met
   "1× gezien", de dag en het bedrag, ONDER de terugkerende kenmerken. Tot v362 kreeg een partij met een
   boeking geen enkel kenmerk ("niets te vergelijken"), en bij meer boekingen stond zo'n kenmerk als
   "(1x)" tussen de terugkerende, zonder dag, en kon de grens van twaalf hem afknippen. Een nieuwe
   incasso was daardoor pas na de tweede afschrijving te zien. Fixture: bezit-koppeling.fixture.js. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./bezit-koppeling.fixture');

const blok = (page) => page.evaluate(() => diagBezitKoppeling());
const partij = (L, naam) => { const i = L.findIndex((r) => r.startsWith(`partij "${naam}"`)); const j = L.indexOf('', i + 1); return L.slice(i, j < 0 ? undefined : j); };

test.describe('blok 16 · een machtiging die een keer voorkomt', () => {
  test('een partij met een boeking toont haar kenmerken met 1× gezien, dag en bedrag', async ({ page }) => {
    const ID = await boot(page, { extraTx: [{ id: 'nieuw1', date: '2026-09-14', amount: -25, name: 'Brand New Fonds', desc: 'SEPA INCASSO BRAND NEW FONDS MACHTIGING MNDT88123 KLANT 4411' }] });
    // de fixture-route zet geen categorie; een eigen keuze op Sparen & beleggen maakt hem een kandidaat
    await page.evaluate((id) => { OVR[id] = 'sparen'; save(); }, ID.nieuw1);
    expect(await page.evaluate((id) => bezitKandidaat(TX.find((x) => x.id === id)), ID.nieuw1)).toBe(true);
    const P = partij(await blok(page), 'brand new fonds');
    expect(P[0]).toContain('1 afschrijving(en)');
    const r = P.find((x) => x.includes('1× gezien'));
    expect(r, P.join('\n')).toBeTruthy();
    expect(r).toContain('1× gezien op 2026-09-14 (€25,00)');
    expect(r).toContain('MNDT88123');
  });
  test('terugkerende kenmerken blijven op hun regel, de eenmalige staan eronder', async ({ page }) => {
    await boot(page, { extraTx: [
      { id: 'k1', date: '2026-08-29', amount: -100 },
      { id: 'p1', date: '2026-09-30', amount: -100, desc: 'STICHTING BEHEER DERDENGELDEN PEAKS KLANT 7712345 PENSIOEN INLEG MNDT5555' },
    ] });
    const P = partij(await blok(page), 'stichting beheer derdengelden');
    const ter = P.findIndex((x) => x.startsWith('  kenmerken die niet in elke omschrijving staan:'));
    const een = P.findIndex((x) => x.includes('1× gezien'));
    expect(ter, P.join('\n')).toBeGreaterThan(0);
    expect(P[ter]).toContain('KAYANI (2x)');
    expect(P[ter]).not.toContain('(1x)');
    expect(P[ter]).not.toContain('MNDT5555');
    expect(een).toBeGreaterThan(ter);
    expect(P[een]).toBe('  1× gezien op 2026-09-30 (€100,00): PENSIOEN, MNDT5555');
  });
  test('een boeking zonder eigen kenmerk geeft geen 1×-regel, en kijken schrijft niets', async ({ page }) => {
    await boot(page, { extraTx: [{ id: 'k1', date: '2026-08-29', amount: -100 }] });
    const P = partij(await blok(page), 'stichting beheer derdengelden');
    expect(P.some((x) => x.includes('1× gezien'))).toBe(false);
    expect(P.join('\n')).toContain('kenmerken: GEEN');
    expect(await page.evaluate(() => { let n = 0; const o = localStorage.setItem; localStorage.setItem = function () { n++; return o.apply(this, arguments); }; diagBezitKoppeling(); localStorage.setItem = o; return n; })).toBe(0);
  });
});
