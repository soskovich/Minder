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
  return { bud: Math.round(V.budget), proj: Math.round(V.projectie), vast: SP.vastePotjes.map(x => x.k), ins: insMaandStand().B,
    inleg: JSON.parse(JSON.stringify(SET.planInleg || {})), oud: SET.overboek, safe: safeToSpend().safe }; });
const boek = (page, acc, d, a) => page.evaluate(({ acc, d, a }) => { const t = { id: 'b' + d + a, date: d, amount: a, acc, name: 'Eigen overboeking', desc: 'OVERBOEKING ' + d, typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
  categorize(t); TX.push(t); OVR[t.id] = 'intern'; save(); }, { acc, d, a });

test.describe('1 · een inleg in Plan, geen regel in het budget', () => {
  test('Reservering: budget gelijk, verwacht +300, niet in de vaste lasten en niet op Inzichten', async ({ page }) => {
    await grip(page);
    const v = await stand(page);
    expect([v.bud, v.proj]).toEqual([3325, 1711]);   // invoermeting
    await huurNaar(page, 'res'); await page.click('[data-teruimbevestig]');
    const n = await stand(page);
    expect(n.bud).toBe(3325); expect(n.proj).toBe(2011);
    expect(n.inleg.res).toEqual(expect.objectContaining({ bedrag: 300, vanaf: '2026-10', van: ['huur'] }));
    expect(n.oud).toBeUndefined();
    expect(n.vast.some(k => String(k).startsWith('~'))).toBe(false);   // geen vaste regel
    expect(n.ins).toBe(v.ins - 300);   // Inzichten: het potje is 300 lager en de inleg is geen uitgave
    const vs = await page.evaluate(() => { openGripVast(); return document.getElementById('sheet').innerText; });
    expect(vs).not.toContain('Reservering');
  });
  test('Plan toont de inleg, met de rekening en het totaal', async ({ page }) => {
    await grip(page);
    await huurNaar(page, 'res'); await page.click('[data-teruimbevestig]');
    await page.evaluate(() => go('vooruit'));
    const r = page.locator('[data-planinleg="res"]');
    expect(await r.getAttribute('data-planinlegbedrag')).toBe('300');
    const t = await r.innerText();
    expect(t).toContain('Reservering €300/mnd'); expect(t).toContain('totaal €300/mnd'); expect(t).toContain('uit Huur');
    expect(await page.locator('[data-planinleg]').count()).toBe(1);
  });
  test('aanpassen en weghalen in Plan: het gevolg vooraf, en het maandbudget gaat mee', async ({ page }) => {
    await grip(page);
    await huurNaar(page, 'beleg'); await page.click('[data-teruimbevestig]');
    await page.evaluate(() => { go('vooruit'); });
    await page.click('[data-planinleg="beleg"]');
    expect(await page.locator('[data-planinlegopslaan]').isDisabled()).toBe(true);
    await page.fill('[data-planinlegveld]', '200');
    const g = await page.locator('[data-planinleggevolg]').innerText();
    expect(g).toContain('Beleggen €300 → €200/mnd'); expect(g).toContain('Maandbudget op Grip €3.325 → €3.225');
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    expect(voor).toContain('"beleg":{"bedrag":300');   // openen en typen schrijven niets
    await page.click('[data-planinlegopslaan]');
    expect((await stand(page)).bud).toBe(3225);
    await page.click('[data-planinleg="beleg"]'); await page.click('[data-planinlegweg]');
    const n = await stand(page);
    expect(n.inleg.beleg).toBeUndefined(); expect(n.bud).toBe(3025); expect(n.proj).toBe(1711);
    expect(await page.locator('[data-planinlegblok]').count()).toBe(0);
    expect(await page.evaluate(() => (SET.overboekActie || {}).beleg)).toBeUndefined();
  });
  test('Plan · sparen: de spaarinleg gaat mee bij aanpassen', async ({ page }) => {
    await grip(page);
    const i0 = await page.evaluate(() => Math.round(monthlySavingTarget()));
    await huurNaar(page, 'plan'); await page.click('[data-teruimbevestig]');
    expect(await page.evaluate(() => Math.round(monthlySavingTarget()))).toBe(i0 + 300);
    await page.evaluate(() => { planInlegZet('plan', 100); });
    expect(await page.evaluate(() => Math.round(monthlySavingTarget()))).toBe(i0 + 100);
    expect((await stand(page)).proj).toBe(1811);
  });
  test('veilig te besteden blijft gelijk (het budget blijft gelijk); de inleg is een claim tot hij is overgemaakt', async ({ page }) => {
    await grip(page);
    const s0 = (await stand(page)).safe;
    await huurNaar(page, 'res'); await page.click('[data-teruimbevestig]');
    expect((await stand(page)).safe).toBe(s0);   // het potje gaat 300 omlaag en de claim 300 omhoog
    expect(await page.evaluate(() => inlegNogDezeMaand())).toBe(300);
    await boek(page, RES, '2026-10-10', 300);
    expect(await page.evaluate(() => inlegNogDezeMaand())).toBe(0);
  });
});

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
    expect(n.bud).toBe(v.bud + 450); expect(n.proj).toBe(v.proj + 450);
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

test.describe('2 · splitsing bij een te grote bestemming', () => {
  const open = async page => { await grip(page); await huurNaar(page, 'pot:uiteten'); };
  test('het voorstel: de overschrijding naar Uit eten, de rest naar een bestemming die je zelf kiest', async ({ page }) => {
    await open(page);
    expect(await page.locator('[data-splitvoorstel]').innerText()).toBe('€67 naar Uit eten & café · €233 naar …');
    expect(await page.locator('[data-splitbedrag="1"]').inputValue()).toBe('67');
    expect(await page.locator('[data-splitbedrag="2"]').inputValue()).toBe('233');
    expect(await page.locator('[data-splitbestem].on').count()).toBe(0);   // geen voorselectie
    expect(await page.locator('[data-splitbestem="pot:uiteten"]').count()).toBe(0);
    expect(await page.locator('[data-teruimbevestig]').isDisabled()).toBe(true);
    expect(await page.locator('[data-voetreden]').innerText()).toBe('Kies waar €233 naartoe gaat');
  });
  test('de bedragen zijn aan te passen, en bevestigen kan pas als de som klopt', async ({ page }) => {
    await open(page);
    await page.click('[data-splitbestem="plan"]');
    expect(await page.locator('[data-teruimbevestig]').isDisabled()).toBe(false);
    await page.fill('[data-splitbedrag="2"]', '300');
    expect(await page.locator('[data-voetreden]').innerText()).toBe('Samen €367, dat moet €300 zijn');
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.evaluate(() => teRuimBevestig());   // de schrijver eist het zelf ook
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
    await page.fill('[data-splitbedrag="1"]', '0');
    expect(await page.locator('[data-teruimbevestig]').isDisabled()).toBe(false);
  });
  test('na bevestigen: Uit eten +67, Plan +233, en geen nieuwe "niet gebruikt"-stap', async ({ page }) => {
    await open(page);
    const u0 = await page.evaluate(() => SET.budgets.uiteten);
    await page.click('[data-splitbestem="plan"]');
    expect(await page.locator('[data-gevolgverwacht]').getAttribute('data-gevolgverwacht')).toBe(String(1711 + 233));
    await page.click('[data-teruimbevestig]');
    const r = await page.evaluate(() => { const V = maandVooruit(), B = gripZienBrug(V);
      return { uit: SET.budgets.uiteten, plan: SET.planInleg.plan.bedrag, proj: Math.round(V.projectie), bud: Math.round(V.budget),
        tr: B.stappen.filter(s => s.soort === 'teruim').map(s => s.k), teRuim: teRuim(V).map(x => x.k), uitStap: B.stappen.filter(s => s.k === 'uiteten').map(s => s.soort) }; });
    expect(r.uit).toBe(u0 + 67); expect(r.plan).toBe(233);
    expect(r.bud).toBe(3325); expect(r.proj).toBe(1711 + 233);
    expect(r.tr).not.toContain('uiteten'); expect(r.teRuim).not.toContain('uiteten');
    expect(r.uitStap).toEqual([]);   // geen uitschieter meer en geen niet-gebruikt-stap
  });
});

test.describe('3 · de actieregel voor je automatische overboeking', () => {
  test('Reservering: in Kiezen tot de overboeking met het nieuwe totaal is gezien, en Terugblik meet hem', async ({ page }) => {
    await grip(page);
    await huurNaar(page, 'res'); await page.click('[data-teruimbevestig]');
    const A = await page.evaluate(() => SET.overboekActie.res);
    expect(A).toEqual(expect.objectContaining({ totaal: 300, op: '2026-10-10' }));
    const kies = async () => page.evaluate(() => { gripKiesTab('kiezen'); const e = document.querySelector('[data-kiesactie="res"]'); return e ? e.innerText : null; });
    expect(await kies()).toContain(`Verhoog je automatische overboeking naar ${A.rekening} naar €300`);
    expect(await page.evaluate(() => gripTerugblik(thisYM()).items.find(i => i.id === 'actie-res').s)).toBe('loopt');
    await boek(page, RES, '2026-10-10', 250);   // te weinig: telt niet
    expect(await kies()).not.toBeNull();
    await boek(page, RES, '2026-10-11', 300);
    expect(await kies()).toBeNull();
    expect(await page.evaluate(() => gripTerugblik(thisYM()).items.find(i => i.id === 'actie-res').s)).toBe('ok');
  });
  test('Plan: naar je spaarrekening, met je nieuwe spaarinleg als totaal; een potje geeft geen actieregel', async ({ page }) => {
    await grip(page);
    await huurNaar(page, 'plan'); await page.click('[data-teruimbevestig]');
    const r = await page.evaluate(() => ({ A: SET.overboekActie.plan, inleg: Math.round(monthlySavingTarget()), open: overboekActiesOpen().map(a => a.soort) }));
    expect(r.A.totaal).toBe(r.inleg); expect(r.open).toEqual(['plan']);
    await page.evaluate(() => { SET.overboekActie = {}; save(); });
    await page.evaluate(() => openTeRuim('vervoer'));
    await page.click('[data-teruimoptie="a"]'); await page.click('[data-teruimbestem="pot:vices"]');
    await page.fill('[data-splitbedrag="1"]', '390'); await page.fill('[data-splitbedrag="2"]', '0');   // alles naar Vices: geen tweede bestemming nodig
    await page.click('[data-teruimbevestig]');
    expect(await page.evaluate(() => overboekActiesOpen().length)).toBe(0);
  });
});
