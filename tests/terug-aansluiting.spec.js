/* v395: PLAN › "EUR X TERUG IN <MAAND>" SLUIT (gevraagd door de gebruiker).
   1. Bovenaan een aansluiting: eruit = terug deze maand + terug later + uit vrij spaargeld (+ niet terug, al
      teruggestort, nog geen keuze als die er zijn), en de som is ALTIJD "eruit".
   2. Elke opname in "Eruit gehaald" draagt zijn bestemming; een gesplitste opname toont beide delen.
   3. De koppeling per opname op de stand van het toestel: 5 okt 131 en 6 okt 100 komen uit vrij spaargeld (aan het begin
      van de maand stond er EUR 231,20 meer dan toegewezen), 9 okt 428 en 9 okt 210 zijn de EUR 231 uit doelen en de
      EUR 407 toegewezen zonder geld (beide alles terug), en 10 okt 150 is de keuze over drie maanden.
   4. De opname-keuze heet "uit doelen", het andere bedrag "uit vrij spaargeld".
   De stand is GECONSTRUEERD naar de getallen van het toestel (opnames, keuzes, saldo 3.869,20 aan het begin van de
   maand, 3.638 toegewezen); de boekingen zelf staan alleen op het toestel. */
const { test, expect } = require('@playwright/test');
const O = require('./opschonen-stand');

const OPN = [['05', 131], ['06', 100], ['09', 428], ['09', 210], ['10', 150]];
async function toestel(page, extra) {
  const bron = [{ id: 'noodfonds', type: 'noodfonds', naam: 'Noodfonds', af: 0 }];
  await O.boot(page, { dag: '2026-10-10', zonderOpname: true, set: Object.assign({ manualBal: { [O.MAIN]: 3000, [O.SAV]: 2850.20 }, planOrder: ['noodfonds', 'iw', 'kk'],
    terugzet: { '2026-10': { keuze: 'alles', bedrag: 231, delen: [231], bron: [Object.assign({}, bron[0], { af: 231 })], op: '2026-10-09' } },
    terugzetGat: [{ id: 'zg1', M: '2026-10', bedrag: 407, keuze: 'alles', delen: [407], bron: [Object.assign({}, bron[0], { af: 407 })], op: '2026-10-09' },
      { id: 'zg2', M: '2026-10', bedrag: 150, keuze: 'drie', delen: [50, 50, 50], bron: [Object.assign({}, bron[0], { af: 150 })], op: '2026-10-10' }] }, extra || {}) });
  await page.evaluate(({ sav, opn }) => {
    opn.forEach(([d, a], i) => { TX.push({ id: 'w' + i, date: '2026-10-' + d, amount: -a, acc: sav, name: 'Spaarpot', desc: 'VAN SPAREN ' + i, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); categorize(TX[TX.length - 1]); });
    save(); render(); }, { sav: O.SAV, opn: OPN });
}
const open = page => page.evaluate(() => { openTerugOpbouw(); });
const lees = page => page.evaluate(() => {
  const w = s => [...document.querySelectorAll(s)];
  return { tot: +document.querySelector('[data-aansluiting]').dataset.aansluiting, som: document.querySelector('[data-aansluitsom]').innerText,
    rij: Object.fromEntries(w('[data-aansluit]').map(e => [e.dataset.aansluit, +e.dataset.aansluitwaarde])),
    tekst: document.querySelector('[data-aansluiting]').innerText.replace(/\s+/g, ' '),
    opn: w('[data-opbouwboeking]').map(e => ({ b: +e.dataset.opname, d: [...e.querySelectorAll('[data-bestemming]')].map(x => [x.dataset.bestemming, +x.dataset.bestemmingbedrag]), t: e.innerText.replace(/\s+/g, ' ') })),
    sheet: document.getElementById('terugOpbouw').innerText.replace(/\s+/g, ' ') }; });

test.describe('de stand van het toestel', () => {
  test.beforeEach(async ({ page }) => { await toestel(page); await open(page); });
  test('invoermeting: EUR 1.019 eruit, EUR 788 met een keuze, EUR 231 uit vrij spaargeld', async ({ page }) => {
    const s = await page.evaluate(() => { const S = spaarStortStand(); return { uit: S.uit, gedekt: S.gedekt, vrij: S.vrijOpname, aan: S.aanvullen, G0: S.G0, bron: S.bron.map(b => [b.soort, b.bedrag]) }; });
    expect(s).toEqual({ uit: 1019, gedekt: 788, vrij: 231, aan: 0, G0: 0, bron: [['op', 231], ['gat', 407], ['gat', 150]] });
  });
  test('1 · de aansluiting: 1.019 = 688 + 100 + 231, en de som is "eruit"', async ({ page }) => {
    const r = await lees(page);
    expect(r.tot).toBe(1019);
    expect(r.rij).toEqual({ deze: 688, later: 100, vrij: 231 });
    expect(r.som).toBe('€1.019');
    expect(r.tekst).toContain('terug later (nov–dec)');
    expect(r.tekst).toContain('uit vrij spaargeld · hoeft niet terug (jouw keuze) ›');
    // de kop van de sheet ("terug in oktober") is terug deze maand
    expect(await page.evaluate(() => +document.getElementById('terugOpbouw').dataset.terugtotaal)).toBe(r.rij.deze);
  });
  test('2 en 3 · per opname de bestemming, en de koppeling van het toestel', async ({ page }) => {
    const r = await lees(page);
    expect(r.opn.map(x => x.b)).toEqual([131, 100, 428, 210, 150]);
    expect(r.opn.map(x => x.d)).toEqual([
      [['vrij', 131]], [['vrij', 100]], [['alles', 428]], [['alles', 210]], [['drie', 150]]]);
    expect(r.opn[0].t).toContain('→ vrij spaargeld, niet terug');
    expect(r.opn[2].t).toContain('→ terug deze maand');
    expect(r.opn[4].t).toContain('→ terug over 3 mnd (€50/mnd)');
    // de som per bestemming is de aansluiting
    const per = {}; for (const o of r.opn) for (const [k, b] of o.d) per[k] = (per[k] || 0) + b;
    expect(per.vrij).toBe(r.rij.vrij); expect(per.alles + 50).toBe(r.rij.deze); expect(per.drie - 50).toBe(r.rij.later);
  });
  test('4 · "uit doelen EUR 231" en "uit vrij spaargeld EUR 231": twee namen voor twee bedragen', async ({ page }) => {
    const r = await lees(page);
    expect(r.sheet).toContain('€231 uit doelen · alles deze maand');
    expect(r.sheet).not.toMatch(/€231 eruit gehaald/);
  });
  test('openen schrijft niets', async ({ page }) => {
    const a = await page.evaluate(() => localStorage.getItem('minder_set'));
    await open(page);
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(a);
  });
});

test.describe('de som sluit ook in andere standen', () => {
  /* De afgeronde rijen tellen per constructie op (brugAfronden), dus wat de aansluiting bewijst is dat de ONAFGERONDE
     delen samen precies "eruit" zijn, en dat geen rij meer dan een euro van zijn deel afwijkt. */
  const sluit = async page => { await open(page); const r = await lees(page);
    const E = await page.evaluate(() => { const A = terugAansluiting(); return { ex: A.exact, uit: A.uitExact, R: A.R }; });
    expect(Math.abs(Object.values(E.ex).reduce((a, x) => a + x, 0) - E.uit)).toBeLessThan(0.005);
    for (const k in E.ex) expect(Math.abs(E.R[k] - E.ex[k])).toBeLessThanOrEqual(1);
    expect(Object.values(r.rij).reduce((a, x) => a + x, 0)).toBe(r.tot);
    expect(r.som).toBe('€' + r.tot.toLocaleString('nl-NL'));
    const p = r.opn.reduce((a, o) => a + o.d.reduce((s, x) => s + x[1], 0), 0);
    expect(Math.round(p * 100) / 100).toBe(Math.round(r.opn.reduce((a, o) => a + o.b, 0) * 100) / 100);
    return r; };
  test('een gesplitste opname toont beide delen (zonder de keuze over toegewezen zonder geld)', async ({ page }) => {
    await toestel(page, { terugzetGat: [] });
    const r = await sluit(page);
    expect(r.rij.open).toBeGreaterThan(0);   // invoermeting: zonder die keuzes is er een deel zonder keuze
    const split = r.opn.find(o => o.d.length > 1);
    expect(split).toBeTruthy();
    expect(split.t).toMatch(/→ .* €[\d.,]+ · → .* €[\d.,]+/);
  });
  test('niet terugzetten: "niet terug" en geen terug deze maand van die keuze', async ({ page }) => {
    await toestel(page, { terugzet: { '2026-10': { keuze: 'niet', bedrag: 231, voor: {}, bron: [], op: '2026-10-09' } } });
    const r = await sluit(page);
    expect(r.rij.niet).toBe(231);
    expect(r.opn.some(o => o.d.some(x => x[0] === 'niet'))).toBe(true);
  });
  test('keuzes die samen meer zijn dan er uit ging, dekken hooguit wat er uit ging', async ({ page }) => {
    await toestel(page, { terugzet: { '2026-10': { keuze: 'alles', bedrag: 900, delen: [900], bron: [], op: '2026-10-09' } } });
    expect(await page.evaluate(() => { const S = spaarStortStand(); return S.bron.reduce((a, b) => a + b.bedrag, 0) - S.gedektExact; })).toBe(0);
    const r = await sluit(page);
    expect(r.rij.vrij || 0).toBe(0);
  });
  test('een oud gat aan het begin van de maand gaat eerst van de keuzes over toegewezen zonder geld af', async ({ page }) => {
    await toestel(page, { manualBal: { [O.MAIN]: 3000, [O.SAV]: 2500 } });
    const g = await page.evaluate(() => { const S = spaarStortStand(); return { G0: S.G0, gat: S.bron.filter(b => b.soort === 'gat').reduce((a, b) => a + b.bedrag, 0) }; });
    expect(g.G0).toBeGreaterThan(100);   // invoermeting
    expect(Math.round((557 - g.G0) * 100) / 100).toBe(Math.round(g.gat * 100) / 100);
    // het oude gat gaat van de eerste keuze af (zg1), niet van de laatste
    const b = await page.evaluate(() => spaarStortStand().bron.map(x => Math.round(x.bedrag * 100) / 100));
    expect(b).toEqual([231, Math.round((407 - g.G0) * 100) / 100, 150]);
    await sluit(page);
  });
  test('met centen en een storting deze maand', async ({ page }) => {
    await toestel(page);
    await page.evaluate((sav) => { TX.push({ id: 'st1', date: '2026-10-08', amount: 99.37, acc: sav, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); categorize(TX[TX.length - 1]);
      TX.find(t => t.desc === 'VAN SPAREN 0').amount = -131.45; save(); render(); }, O.SAV);
    const r = await sluit(page);
    expect(r.tot).toBe(1019);
    expect(r.rij.gestort).toBe(99);   // invoermeting: de storting dekte een deel
  });
});
