// v398 (gevraagd door de gebruiker, mockup "Grip eigen budget" v3). Grip meet aan het maandbudget dat je instelde; een te
// ruim potje heet "niet gebruikt" en wordt niet afgetrokken (het "eerlijke budget" van v387-v395 is uit beeld). De te-ruim-
// sheet houdt het maandbudget gelijk: wat je van een potje haalt krijgt een verplichte bestemming. Let op toont het bewijs
// achter "komt vaker terug".
// Fixture: grip-kring-stand (10 okt 2026): budget 3325, verwacht 1711; Huur 700 (nodig 71, 629 niet gebruikt), Vervoer &
// auto variabel deel 390 niet gebruikt; uitschieter Uit eten +67, Vices +5 onder de drempel.
// GETALLEN VAN DE FIXTURE, NIET VAN HET TOESTEL (3375 / 2815 zijn van het toestel en staan hier nergens).
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const grip = async (page, w = 390) => { await page.setViewportSize({ width: w, height: 844 }); await K.boot(page); await page.evaluate(() => go('maand')); };
const brug = page => page.evaluate(() => { const V = maandVooruit(), B = gripZienBrug(V), M = gripMeterBudget(V);
  return { st: B.stappen.map(s => ({ soort: s.soort, k: s.k, label: s.label, label2: s.label2, waarde: s.waarde })), verschil: B.verschil, budget: B.budget,
    proj: Math.round(V.projectie), bud: Math.round(V.budget), M: { verschil: M.verschil, pct: M.pct, verwacht: M.verwacht, budget: M.budget },
    kop: document.querySelector('[data-zienkop]').innerText, kopV: +document.querySelector('[data-zienkop]').dataset.zienverschil }; });
const huurSheet = async (page, optie, bedrag) => {
  await page.evaluate(() => openTeRuim('huur'));
  if (optie) await page.click(`[data-teruimoptie="${optie}"]`);
  if (bedrag != null) await page.fill('[data-teruimbedrag]', String(bedrag));
};
const knop = page => page.evaluate(() => { const b = document.querySelector('[data-teruimbevestig]'), r = document.querySelector('[data-voetreden]');
  return { uit: b.disabled, tekst: b.innerText.trim(), reden: r ? r.innerText.trim() : '' }; });

test.describe('A · meten aan het eigen maandbudget', () => {
  test('de meter is verwacht gedeeld door het maandbudget, en zegt het verschil', async ({ page }) => {
    await grip(page);
    const r = await brug(page);
    expect(r.bud).toBe(3325); expect(r.proj).toBe(1711);   // invoermeting
    expect(r.M.pct).toBe(Math.round(1711 / 3325 * 100));   // 51, niet 1711 / (3325 - 1019)
    expect(r.M.verschil).toBe(1711 - 3325);
    const dial = await page.locator('[data-meter="budget"]').innerText();
    expect(dial).toContain('51%'); expect(dial).toContain('€1.614'); expect(dial).toContain('onder budget');
  });
  test('som-eis: budget plus de stappen is verwacht, en dat is de kop', async ({ page }) => {
    await grip(page);
    const r = await brug(page);
    expect(r.st[0]).toEqual(expect.objectContaining({ soort: 'begin', label: 'budget', waarde: r.bud }));
    expect(r.st[r.st.length - 1]).toEqual(expect.objectContaining({ soort: 'eind', label: 'verwacht', waarde: r.proj }));
    const som = r.st.slice(1, -1).reduce((a, x) => a + x.waarde, r.st[0].waarde);
    expect(som).toBe(r.proj);
    expect(r.verschil).toBe(r.proj - r.bud); expect(r.kopV).toBe(r.verschil); expect(r.M.verschil).toBe(r.verschil);
    expect(r.kop).toBe(`€${Math.abs(r.verschil).toLocaleString('nl-NL')} onder budget`);
  });
  test('boven budget: de kop zegt "boven budget" met hetzelfde getal als de som', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { const t = { id: 'xb1', date: '2026-10-08', amount: -2400, acc: 'NL01MAIN0000001111', name: 'Mediamarkt', desc: 'BEA, BETAALPAS MEDIAMARKT', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'shopping'; save(); renderMaand(); });
    const r = await brug(page);
    expect(r.verschil).toBeGreaterThan(0);   // invoermeting
    expect(r.st.slice(1, -1).reduce((a, x) => a + x.waarde, r.st[0].waarde)).toBe(r.proj);
    expect(r.kop).toBe(`€${r.verschil.toLocaleString('nl-NL')} boven budget`);
  });
  test('te ruim is een grijze stap per potje met "niet gebruikt", zonder arcering, stippellijn of eerlijk budget', async ({ page }) => {
    await grip(page);
    const r = await brug(page);
    const tr = r.st.filter(s => s.soort === 'teruim');
    expect(tr.map(s => [s.k, s.label, s.label2, s.waarde])).toEqual([['huur', 'Huur', 'niet gebruikt', -558], ['vervoer', 'Vervoer', 'niet gebruikt', -390]]);   // v406: korte vaste naam
    const d = await page.evaluate(() => ({ grijs: [...document.querySelectorAll('#gripBrug [data-brugstap="teruim"] [data-brugniet]')].map(i => i.style.background),
      gearceerd: document.querySelectorAll('#gripBrug [data-gearceerd], #gripBrug [data-eerlijklijn], #gripBrug [data-haaktekst]').length,
      as: document.querySelector('[data-zienas]').innerText.trim(), tekst: document.querySelector('#gripInhoud').innerText + document.querySelector('#gripMeters').innerText }));
    expect(d.grijs).toEqual(['var(--bar)', 'var(--bar)']);
    expect(d.gearceerd).toBe(0);
    expect(d.as).toBe('');   // geen "as begint bij"
    expect(d.tekst).not.toMatch(/eerlijk/i);
  });
  test('een tik op de grijze stap opent de sheet op dat potje, en schrijft niets', async ({ page }) => {
    await grip(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.waitForTimeout(350); await page.locator('#gripBrug [data-brugstap="teruim"]').nth(1).click();
    expect(await page.locator('#teRuimSheet').getAttribute('data-teruimpotje')).toBe('vervoer');
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
  test('"eerlijk budget" staat in geen enkele sheet van de meter of de bridge', async ({ page }) => {
    await grip(page);
    for (const open of ["openGripMeter('budget')", "openGripMeter('doelen')", "openGripMeter('beleggen')", 'openGripOverig()', "openTeRuim('huur')"]) {
      await page.evaluate(o => { closeSheet(); eval(o); }, open);
      expect(await page.locator('#sheet').innerText(), open).not.toMatch(/eerlijk/i);
    }
  });
  test('overig zegt hoeveel potjes onder en boven eindigen, en draagt de noot onder de drempel', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const D = gripOverigDelen(maandVooruit()); return { onder: D.onder, boven: D.boven }; });
    /* v408: geen twee keer "overig": de labels zijn "n boven" en "n onder", met n het aantal potjes van die kant */
    const lab = await page.evaluate(() => [...document.querySelectorAll('#gripBrug [data-brugstap="overig"] [data-brugeen]')].map(e => e.innerText.replace(/\s+/g, ' ')));
    const B = await page.evaluate(() => gripZienBrug(maandVooruit()).stappen.filter(s => s.soort === 'overig').map(s => [s.k, s.label, s.zonderIn || 0]));
    for (const [k, l, z] of B) expect(l).toBe(k === 'boven' ? `${r.boven + (z ? 1 : 0)} boven` : `${r.onder} onder`);
    expect(lab.join('|')).not.toContain('overig');
    expect(await page.locator('#gripBrug [data-brugstap="overig"] [data-brugeen2]').count()).toBe(0);
    expect(await page.locator('#gripBrug [data-brugnoot]').innerText()).toBe('+€5');
  });
});

test.describe('A · de feitregel onder de meter', () => {
  test('twee potjes: "waarvan €948 niet gebruikt in 2 potjes ›", geen "Eerlijk budget lager"', async ({ page }) => {
    await grip(page);
    const r = page.locator('#gripMeters ~ [data-nietgebruikt]');
    expect(await r.innerText()).toBe('waarvan €948 niet gebruikt in 2 potjes ›');
    expect(await page.locator('#gripMeters').innerText()).not.toMatch(/eerlijk/i);
    expect(await page.locator('[data-eerlijkregel]').count()).toBe(0);
    await r.click();
    expect(await page.locator('#teRuimSheet[data-teruimlijst]').count()).toBe(1);   // twee potjes: eerst kiezen welk
  });
  test('een potje: "waarvan €558 Huur niet gebruikt ›", en de tik opent dat potje', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { SET.budgets.vervoer = 710; save(); renderMaand(); });
    const r = page.locator('#gripMeters ~ [data-nietgebruikt]');
    expect(await r.innerText()).toBe('waarvan €558 Huur niet gebruikt ›');
    await r.click();
    expect(await page.locator('#teRuimSheet').getAttribute('data-teruimpotje')).toBe('huur');
  });
  test('na een eigen keuze: "· zelf gekozen", en de regel blijft', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { SET.budgets.vervoer = 710; teRuimLaten('huur'); renderMaand(); });
    expect(await page.locator('#gripMeters ~ [data-nietgebruikt]').innerText()).toBe('waarvan €558 Huur niet gebruikt › · zelf gekozen');
    expect(await page.locator('[data-zelfgekozen]').count()).toBe(1);
  });
  test('niets te ruim: geen regel', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { SET.budgets.vervoer = 710; SET.budgets.huur = 80; save(); renderMaand(); });
    expect(await page.locator('[data-nietgebruikt]').count()).toBe(0);
  });
  test('volgende maand toetst de app opnieuw: zelf gekozen gold alleen deze maand', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { teRuimLaten('huur'); const nu = teRuimZelf('huur');
      SET.teRuimLaten = { '2026-09': SET.teRuimLaten['2026-10'] }; save(); return { nu, later: teRuimZelf('huur') }; });
    expect(r).toEqual({ nu: true, later: false });
  });
  test('Kiezen toont "herzien" vanaf de 2e maand, ook voor een potje dat vorige maand bleef staan', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { SET.teRuimMaand['2026-09'] = ['huur', 'vervoer']; SET.teRuimLaten = { '2026-09': { huur: '2026-09-12' } }; save();
      return gripTeRuimHerzien().map(x => x.k).sort(); });
    expect(r).toEqual(['huur', 'vervoer']);
  });
});

test.describe('B · de te-ruim-sheet', () => {
  test('kop en drie feiten, de afgelopen 3 maanden, niets voorgekozen en de knop uit', async ({ page }) => {
    await grip(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await huurSheet(page);
    const sh = page.locator('#teRuimSheet');
    await expect(sh).toContainText('Huur · ruimer dan nodig');
    expect(await page.locator('[data-feitbudget]').innerText()).toContain('€700');
    expect(await page.locator('[data-feitnodig]').innerText()).toMatch(/€142 sep/)   // v409: twee termijnen Shurgard in september 2027;
    expect(await page.locator('[data-feitniet]').innerText()).toContain('€558');
    expect(await page.locator('[data-teruimhist]').evaluateAll(e => e.map(x => x.dataset.teruimhist))).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(await page.locator('[data-teruimoptie][data-gekozen="1"]').count()).toBe(0);
    expect(await page.locator('[data-teruimbestem]').count()).toBe(0);
    expect(await knop(page)).toEqual({ uit: true, tekst: 'Bevestigen', reden: 'Kies een optie' });
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
  test('bestemming verplicht: na a geen voorselectie en de knop uit, na een keuze noemt de knop de handeling', async ({ page }) => {
    await grip(page);
    await huurSheet(page, 'a');
    expect(await page.locator('[data-teruimwaarheen]').innerText()).toContain('Waar gaat €558 naartoe?');
    expect(await page.locator('[data-teruimbestem]').evaluateAll(e => e.map(x => x.dataset.teruimbestem))).toEqual(['plan', 'res', 'beleg', 'pot:uiteten', 'pot:vices']);
    expect(await page.locator('[data-teruimbestem].on').count()).toBe(0);
    expect(await page.locator('[data-teruimgevolg]').count()).toBe(0);
    expect(await knop(page)).toEqual({ uit: true, tekst: 'Bevestigen', reden: 'Kies waar €558 naartoe gaat' });
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.evaluate(() => teRuimBevestig());   // de schrijver eist de keuze zelf ook
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
    await page.click('[data-teruimbestem="plan"]');
    expect(await knop(page)).toEqual({ uit: false, tekst: 'Huur op €142 zetten', reden: '' });
  });
  test('b: een bedrag tussen nodig en het huidige budget, daarbuiten met een reden; a en c klappen in', async ({ page }) => {
    await grip(page);
    await huurSheet(page, 'b', 50);
    expect((await knop(page)).uit).toBe(true);
    expect(await page.locator('[data-teruimbedragreden]').innerText()).toContain('niet genoeg voor de duurste maand');
    await page.fill('[data-teruimbedrag]', '700');
    expect((await knop(page)).uit).toBe(true);
    expect(await page.locator('[data-teruimbedragreden]').innerText()).toContain('niet lager dan je huidige €700');
    await page.fill('[data-teruimbedrag]', '400');
    expect(await page.locator('[data-teruimbedragreden]').count()).toBe(0);
    expect(await knop(page)).toEqual({ uit: true, tekst: 'Bevestigen', reden: 'Kies waar €300 naartoe gaat' });
    const ing = await page.evaluate(() => ['a', 'c'].map(k => { const e = document.querySelector(`[data-teruimoptie="${k}"]`); return { gek: e.dataset.gekozen, h: e.getBoundingClientRect().height }; }));
    for (const o of ing) { expect(o.gek).toBe('0'); expect(o.h).toBeLessThanOrEqual(34); }
  });
  test('het gevolg: Plan, het maandbudget blijft, verwacht stijgt met het bedrag, de meter, en de oker regel als het nog te ruim is', async ({ page }) => {
    await grip(page);
    await huurSheet(page, 'b', 400);
    await page.click('[data-teruimbestem="plan"]');
    const g = await page.evaluate(() => Object.fromEntries(['potje', 'bestem', 'budget', 'verwacht', 'meter', 'nogruim'].map(k => [k, (document.querySelector(`[data-gevolg${k}]`) || {}).innerText || null])));
    expect(g.potje).toBe('Huur €700 → €400');
    expect(g.bestem).toBe('Plan · sparen +€300/mnd · inleg in Plan');   // v399: een inleg in Plan
    expect(g.budget).toBe('Maandbudget €3.325 blijft');
    expect(g.verwacht).toBe('Verwacht oktober €1.711 → €2.011');
    expect(g.meter).toBe(`Budget-meter 51% → ${Math.round(2011 / 3325 * 100)}% · €1.314 onder`);
    expect(g.nogruim).toBe('Nog €258 ruimer dan nodig (€142). Je keuze blijft staan; volgende maand toetst Minder opnieuw.');
    expect(await knop(page)).toEqual({ uit: false, tekst: 'Huur op €400 zetten', reden: '' });
  });
  /* v399: pot:uiteten (boven met €67, en €300 vrij) wordt een splitsing; die staat in plan-inleg.spec.js. */
  for (const [b, stijgt] of [['plan', true], ['res', true], ['beleg', true]]) test(`verwacht ${stijgt ? 'stijgt' : 'blijft gelijk'} bij ${b}, in het gevolg en na bevestigen`, async ({ page }) => {
    await grip(page);
    const uit0 = await page.evaluate(() => SET.budgets.uiteten);
    await huurSheet(page, 'b', 400);
    await page.click(`[data-teruimbestem="${b}"]`);
    expect(await page.locator('[data-gevolgverwacht]').getAttribute('data-gevolgverwacht')).toBe(String(stijgt ? 2011 : 1711));
    await page.click('[data-teruimbevestig]');
    const r = await page.evaluate(() => { const V = maandVooruit(), B = gripZienBrug(V);
      return { bud: Math.round(V.budget), proj: Math.round(V.projectie), huur: SET.budgets.huur, uit: SET.budgets.uiteten,
        som: B.stappen.slice(1, -1).reduce((a, x) => a + x.waarde, B.stappen[0].waarde), stap: (B.stappen.find(s => s.soort === 'teruim' && s.k === 'huur') || {}).waarde,
        uitSoort: (B.stappen.find(s => s.k === 'uiteten') || {}).soort }; });
    expect(r.bud).toBe(3325);   // het maandbudget blijft
    expect(r.huur).toBe(400);
    expect(r.proj).toBe(stijgt ? 2011 : 1711);
    expect(r.som).toBe(r.proj);
    expect(r.stap).toBe(-258);   // Huur 400 met 142 nodig (v409): 258 niet gebruikt
    expect(r.uit).toBe(uit0);
  });
  test('Plan: de inleg gaat met het bedrag omhoog en Plan verdeelt zelf; veilig te besteden blijft gelijk', async ({ page }) => {
    await grip(page);
    const voor = await page.evaluate(() => ({ inleg: Math.round(monthlySavingTarget()), safe: safeToSpend().safe }));
    await huurSheet(page, 'b', 400); await page.click('[data-teruimbestem="plan"]'); await page.click('[data-teruimbevestig]');
    const na = await page.evaluate(() => ({ inleg: Math.round(monthlySavingTarget()), safe: safeToSpend().safe, ob: Object.entries(SET.planInleg || {}).map(([k, x]) => [k, x.bedrag]), oud: SET.overboek }));
    expect(na.inleg).toBe(voor.inleg + 300);
    expect(na.safe).toBe(voor.safe);
    expect(na.ob).toEqual([['plan', 300]]);   // v399: een inleg in Plan, geen regel in het budget
    expect(na.oud).toBeUndefined();
  });
  test('Beleggen: een oker waarschuwing met de voorwaarde die ontbreekt, maar bevestigen kan', async ({ page }) => {
    await grip(page);
    await huurSheet(page, 'a');
    expect(await page.evaluate(() => teRuimBelegMist())).toEqual(['reserveringen open']);   // invoermeting
    await page.click('[data-teruimbestem="beleg"]');
    const w = page.locator('[data-teruimbelegwaarsch]');
    expect(await w.innerText()).toBe('Je beleggingsvoorwaarden zijn nog niet gehaald (reserveringen open).');
    expect(await w.evaluate(e => e.style.color)).toBe('var(--amber)');
    expect((await knop(page)).uit).toBe(false);
    await page.click('[data-teruimbestem="plan"]');
    expect(await page.locator('[data-teruimbelegwaarsch]').count()).toBe(0);
  });
  test('laten staan: geen bestemming nodig, de reden is optioneel en wordt bewaard', async ({ page }) => {
    await grip(page);
    await huurSheet(page, 'c');
    expect(await page.locator('[data-teruimwaarheen]').count()).toBe(0);
    expect(await knop(page)).toEqual({ uit: false, tekst: 'Huur laten staan', reden: '' });
    await page.click('[data-teruimreden="bewust buffer"]');
    await page.click('[data-teruimbevestig]');
    const r = await page.evaluate(() => ({ laten: !!SET.teRuimLaten['2026-10'].huur, reden: SET.teRuimLatenReden['2026-10'].huur, huur: SET.budgets.huur }));
    expect(r).toEqual({ laten: true, reden: 'bewust buffer', huur: 700 });
  });
  test('past op 390x844 met b open en een bestemming gekozen', async ({ page }) => {
    await grip(page);
    await huurSheet(page, 'b', 400); await page.click('[data-teruimbestem="plan"]');
    const r = await page.evaluate(() => { const s = document.getElementById('sheet'), k = document.querySelector('[data-teruimbevestig]').getBoundingClientRect();
      return { h: s.scrollHeight, ch: s.clientHeight, knop: k.bottom, vh: innerHeight, sw: s.scrollWidth - s.clientWidth }; });
    console.log(`sheet 390: ${r.h} van ${r.ch}px`);
    expect(r.h).toBeLessThanOrEqual(r.ch);
    expect(r.knop).toBeLessThanOrEqual(r.vh);
    expect(r.sw).toBeLessThanOrEqual(0);
  });
});

test('Zien past op 390x844 boven de menubalk, labels op een regel en zonder overloop', async ({ page }) => {
  await grip(page);
  const r = await page.evaluate(() => ({ kol: document.querySelectorAll('#gripBrug [data-brugstap]').length,
    breed: [...document.querySelectorAll('#gripBrug [data-brugstap]')].map(e => e.getBoundingClientRect().width),
    knop: document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav: document.querySelector('.nav').getBoundingClientRect().top, sw: document.documentElement.scrollWidth }));
  console.log(`zien 390: ${r.kol} kolommen, knop ${Math.round(r.knop)}px, menubalk ${Math.round(r.nav)}px`);
  expect(r.kol).toBe(6);   // v415: overig boven was +€5, minder dan BRUG_KLEIN, en schoof bij Uit eten aan; budget, Uit eten, Huur, Vervoer, overig onder, verwacht
  for (const b of r.breed) expect(b).toBeGreaterThanOrEqual(40);
  expect(r.knop).toBeLessThanOrEqual(r.nav);
  expect(r.sw).toBeLessThanOrEqual(390);
});

/* C · "komt vaker terug" staat er alleen met bewijs (terugkeerBewijs()): dezelfde opgeschoonde naam in minstens 2 van de
   laatste 4 maanden met boekingen, de lopende maand meegeteld. Fixture deze-maand-stand (6 okt): Restaurant Lona in juni
   tot en met oktober, zonder potje voor Uit eten. */
test.describe('C · signalen met bewijs', () => {
  const DM = require('./deze-maand-stand');
  /* v406: Let op toont er hooguit twee, met eerst wat je kunt doen; de rest staat achter "nog n", en die telt hier mee */
  const letop = page => page.evaluate(() => { go('maand'); renderMaand(); const L = document.querySelector('#gripLetOp');
    let tekst = L ? L.innerText : '', soorten = L ? [...L.querySelectorAll('[data-letop]')].map(e => e.dataset.letop) : [];
    if (L && L.querySelector('[data-letopnog]')) { openGripLetOpLijst(); const S = document.querySelector('#gripLetOpLijst');
      if (S) { tekst += '\n' + S.innerText; soorten = soorten.concat([...S.querySelectorAll('[data-letop]')].map(e => e.dataset.letop)); } closeSheet(); }
    return { tekst, soorten }; });
  test('met bewijs: een regel, en het bewijs staat erin', async ({ page }) => {
    await DM.boot(page);
    const B = await page.evaluate(() => terugkeerBewijs('Restaurant Lona'));
    expect(B).toEqual(expect.objectContaining({ n: 4, venster: 4, ok: true, maanden: ['2026-07', '2026-08', '2026-09', '2026-10'] }));
    const r = await letop(page);
    /* v402: Uit eten heeft in 3 van 3 afgeronde maanden uitgaven, dus de regel is die van een categorie die er vaker is,
       met de partij en het bewijs eronder; een lek-regel over dezelfde boekingen staat er niet naast. */
    expect(r.soorten.filter(s => s.startsWith('lek'))).toEqual([]);
    expect(r.soorten).toContain('zonderpot');
    expect(r.tekst).toContain('Uit eten & café zonder potje · 3 van 3 mnd\npotje maken · Restaurant Lona · 4× in 4 mnd (jul, aug, sep, okt)');
  });
  test('een partij in een maand: geen "komt vaker terug", en categorie en partij zijn twee regels', async ({ page }) => {
    await DM.boot(page);
    await page.evaluate(() => { TX = TX.filter(t => !(t.name === 'Restaurant Lona' && t.date < '2026-10')); save(); });
    const B = await page.evaluate(() => terugkeerBewijs('Restaurant Lona'));
    expect(B.n).toBe(1); expect(B.ok).toBe(false);   // invoermeting
    const r = await letop(page);
    /* v406: de categorie is eenmalig (minder dan 2 van 3 mnd) en heeft haar eigen regel met "categorie klopt?"; de partij houdt de zijne */
    expect(r.soorten.filter(s => s.startsWith('lek') || s === 'eenmalig').sort()).toEqual(['eenmalig', 'lek']);
    expect(r.tekst).not.toContain('komt vaker terug'); expect(r.tekst).not.toMatch(/\d× in \d mnd/);
  });
  test('een vaste categorie zonder herhaling: ook geen "komt vaker terug" (tot v398 zei de zin het toch)', async ({ page }) => {
    await DM.boot(page, { extraTx: [{ id: 'apo1', date: '2026-10-05', amount: -150, name: 'Apotheek Centrum', desc: 'BEA, BETAALPAS APOTHEEK CENTRUM' }] });
    const L = await page.evaluate(() => { const t = TX.find(x => x.name === 'Apotheek Centrum'); return { cat: catOf(t), vast: isFixedCat(catOf(t)), lek: lekSignaal(thisYM(), budgetFlaggedCats(thisYM())) }; });
    expect(L.vast).toBe(true); expect(L.lek.kind).toBe('missing-pot'); expect(L.lek.bewijs).toBeFalsy();   // invoermeting
    expect(L.lek.hyp).not.toContain('komt vaker terug');
    const r = await letop(page);
    expect(r.tekst).not.toContain('komt vaker terug');
    /* v399: een vaste categorie zonder bewijs is EEN regel "<categorie> EUR X zonder potje", zonder bijzin */
    /* v406: eenmalig in de categorie: EEN regel met "eenmalig · categorie klopt?", geen lek-regel ernaast */
    expect(r.soorten.filter(s => s.startsWith('lek') || s === 'eenmalig')).toEqual(['eenmalig']);
    const cat = await page.evaluate(() => CATS[catOf(TX.find(x => x.name === 'Apotheek Centrum'))].name);
    expect(r.tekst).toMatch(new RegExp(`${cat.replace(/[&]/g, '\\&')} €150 zonder potje · \\d van 3 mnd\\neenmalig · categorie klopt\\? ›`));
    expect(r.tekst).not.toContain('hoort bij een vaste categorie');
    expect(L.lek.hyp).toBe(`${cat} €150 zonder potje.`);
    await page.evaluate(() => openGripLetOp('lek'));
    expect(await page.locator('#sheet').innerText()).not.toContain('komt vaker terug');
  });
});
