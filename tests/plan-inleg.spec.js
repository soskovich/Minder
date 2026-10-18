/* v399 (gevraagd door de gebruiker, vervolg op v398).
   1. Reservering, Beleggen en Plan · sparen als bestemming zijn een maandelijkse INLEG IN PLAN (SET.planInleg), geen vaste
      regel in het budget. Het maandbudget op Grip blijft gelijk (de inleg telt erin) en verwacht stijgt met de inleg; hij
      staat niet in de vaste lasten en niet op Inzichten. Zichtbaar in Plan, aan te passen en weg te halen. De v398-regels
      (SET.overboek) worden bij het laden een inleg per soort. Elke inleg wordt gemeten tegen de echte overboeking naar zijn
      rekening; Terugblik ✓ vanaf 100%, ½ vanaf 80%, anders ✗.
   2. Een bestemming die groter is dan nodig (een potje dat boven eindigt, met meer vrij dan zijn overschrijding) wordt een
      splitsing; de tweede bestemming kies je zelf, de som is het vrije bedrag.
   3. Na Plan, Reservering of Beleggen een actieregel in Kiezen tot de overboeking met het nieuwe totaal is gezien.
   Fixture grip-kring-stand (10 okt 2026): budget 3325, verwacht 1711; Huur 700 (71 nodig), Uit eten +67 boven.
   GETALLEN VAN DE FIXTURE, NIET VAN HET TOESTEL. */
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');
const RES = 'NL01RESV0000003333';

const grip = async (page, set) => { await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page, set ? { set } : undefined); await page.evaluate(() => go('maand')); };
const huurNaar = async (page, bestem, bedrag = 400) => {
  await page.evaluate(() => openTeRuim('huur'));
  await page.click('[data-teruimoptie="b"]'); await page.fill('[data-teruimbedrag]', String(bedrag));
  await page.click(`[data-teruimbestem="${bestem}"]`);
};
const stand = page => page.evaluate(() => { const V = maandVooruit(), SP = maandSplitsing(thisYM());
  return { bud: Math.round(V.budget), nu: Math.round(V.budgetNu), proj: Math.round(V.projectie), vast: SP.vastePotjes.map(x => x.k), ins: insMaandStand().B,
    inleg: JSON.parse(JSON.stringify(SET.planInleg || {})), oud: SET.overboek, safe: safeToSpend().safe }; });
const boek = (page, acc, d, a) => page.evaluate(({ acc, d, a }) => { const t = { id: 'b' + d + a, date: d, amount: a, acc, name: 'Eigen overboeking', desc: 'OVERBOEKING ' + d, typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
  categorize(t); TX.push(t); OVR[t.id] = 'intern'; save(); }, { acc, d, a });

test.describe('1 · migratie van de v398-regels', () => {
  test('SET.overboek wordt een inleg per soort, en de som blijft gelijk', async ({ page }) => {
    await grip(page);
    const v = await stand(page);
    await page.evaluate(() => { delete SET.planInleg; SET.overboek = [{ id: 'o1', soort: 'res', bedrag: 300, vanaf: '2026-10', van: 'huur', op: '2026-10-09' },
      { id: 'o2', soort: 'plan', bedrag: 100, vanaf: '2026-10', van: 'vervoer', op: '2026-10-09' }, { id: 'o3', soort: 'res', bedrag: 50, vanaf: '2026-09', van: 'vervoer', op: '2026-09-20' }];
      save(); load(); render(); });
    const n = await stand(page);
    expect(n.oud).toBeUndefined();
    expect(n.inleg.res).toEqual(expect.objectContaining({ bedrag: 350, vanaf: '2026-09', van: ['huur', 'vervoer'], migratie: 'v398' }));
    expect(n.inleg.plan).toEqual(expect.objectContaining({ bedrag: 100 }));
    expect(n.bud).toBe(v.bud); expect(n.proj).toBe(v.proj);   // v440: de inleg telt niet meer in het budget of de forecast
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).overboek)).toBeUndefined();   // de migratie is opgeslagen
  });
});

test.describe('1 · meting en Terugblik', () => {
  const met = async (page, bedrag) => {
    await grip(page, { planInleg: { res: { bedrag: 300, vanaf: '2026-09', op: '2026-09-01', basis: 100, van: ['huur'] } } });
    if (bedrag) await boek(page, RES, '2026-09-25', bedrag);
    return page.evaluate(() => { const T = gripTerugblik('2026-09'), x = T.items.find(i => i.id === 'inleg-res'); return { s: x && x.s, sub: x && x.sub, n: T.n, U: inlegUitkomst('res', '2026-09') }; });
  };
  for (const [b, s] of [[400, 'ok'], [320, 'half'], [319, 'nee'], [0, 'nee']]) test(`${b} van 400 naar de reserveringsrekening: ${s}`, async ({ page }) => {
    const r = await met(page, b);
    expect(r.U.doel).toBe(400); expect(r.U.gemeten).toBe(b);
    expect(r.s).toBe(s);
    expect(r.sub).toContain(`€${b} van €400 naar`);
  });
  test('de lopende maand loopt nog, en telt niet', async ({ page }) => {
    await grip(page, { planInleg: { res: { bedrag: 300, vanaf: '2026-10', op: '2026-10-01', basis: 0, van: ['huur'] } } });
    const r = await page.evaluate(() => (gripTerugblik(thisYM()).items.find(i => i.id === 'inleg-res') || {}).s);
    expect(r).toBe('loopt');
  });
  test('Beleggen wordt gemeten aan je beleggingsinleg', async ({ page }) => {
    await grip(page, { planInleg: { beleg: { bedrag: 100, vanaf: '2026-09', op: '2026-09-01', basis: 0, van: ['huur'] } } });
    await page.evaluate(() => { const t = { id: 'pk1', date: '2026-09-12', amount: -100, acc: 'NL01MAIN0000001111', name: 'Stichting Peaks', desc: 'PEAKS INLEG', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'sparen'; save(); });
    expect(await page.evaluate(() => inlegUitkomst('beleg', '2026-09').s)).toBe('ok');
  });
  test('zonder reserveringsrekening: niet gemeten en geen oordeel', async ({ page }) => {
    await grip(page, { resAcc: '', planInleg: { res: { bedrag: 300, vanaf: '2026-09', op: '2026-09-01', basis: 0 } } });
    expect(await page.evaluate(() => inlegUitkomst('res', '2026-09').s)).toBe('onbekend');
  });
});
