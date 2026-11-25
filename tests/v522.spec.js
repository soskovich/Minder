/* v522/v522b: VERGOEDINGEN BIJ JE SALARIS. Vervoer is bruto, reiskosten en thuiswerk zijn inkomen van de maand waarin ze binnenkomen maar
   niet van het verwachte maandinkomen, een storting binnen vast +/- marge is salaris zonder vraag. v522b: geen toewijzing aan een andere
   maand, wel een notitie bij de boeking.
   FIXTURE NAAR DE LOONSTROKEN VAN DE GEBRUIKER (SKF, netto), de rest GECONSTRUEERD:
     sep  24 sep  5.216,28 (salaris; reiskosten 120,00 en thuiswerk 2,45 niet uitbetaald)
     okt  26 okt  7.692,98 = 5.206,33 + bonus 2.199,50 + reiskosten 270,00 + thuiswerk 17,15
     nov  25 nov  5.727,10 = 5.215,05 + reiskosten 270,00 + thuiswerk 19,60 + eenmalige vergoeding 100,00 + correctie sep 122,45
   Tankboekingen in sep, okt en nov (Vervoer, potje 400). Vast salaris 5.216, marge 25, vergoedingen verwacht met bovengrens 400. */
const { test, expect } = require('./klok');
const W = require('./v522-stand');
const { boot, oudeStand, TANK } = W;
const VOOR = require('./v522b-voor.json');   // v521c (55c5887) op dezelfde fixture, gemaakt door tests/wip/v522b-voor-gen.spec.js
const split = (page, ym) => page.evaluate((ym) => salSplitsing(_sal(ym)), ym);
const r2 = (x) => Math.round(x * 100) / 100;
const som = (a) => r2(a.reduce((x, y) => x + y, 0));

test('f. migratie: een oud antwoord reis 287 wordt vergoedingen 287, reisPot vervalt', async ({ page }) => {
  await boot(page); await oudeStand(page);
  const r = await page.evaluate(() => ({ C: SET.salSplit, A: SET.salSplitAntw[_sid('2026-10')], M: SET.salSplit522 }));
  expect(r.C).toMatchObject({ vergAan: true, vergMax: 400, marge: 25 });
  expect(r.C.reisPot).toBeUndefined(); expect(r.C.reisAan).toBeUndefined();
  expect(r.A.verg).toBe(287); expect(r.A.reis).toBeUndefined();
  expect(r.M.voor.antw[await page.evaluate(() => _sid('2026-10'))]).toBe(287);
  const S = await split(page, '2026-10');
  expect(S).toMatchObject({ salaris: 5216, verg: 287, beantwoord: true });
  expect(r2(S.eenmalig)).toBe(2189.98);
  expect(r2(S.salaris + S.verg + S.eenmalig)).toBe(7692.98);
});

test('a. Vervoer per maand is bruto (de som van de tankboekingen), ook in oktober na de migratie', async ({ page }) => {
  await boot(page); await oudeStand(page);
  for (const ym of ['2026-09', '2026-10', '2026-11']) {
    const r = await page.evaluate((ym) => ({ cs: catSpendMap(ym).vervoer, T: totals(ym).byCat.vervoer, U: uitgegevenStand({ m: ym }).per.vervoer, ruw: catSpendMapRuw(ym).vervoer }), ym);
    expect(r2(r.cs)).toBe(som(TANK[ym]));
    expect(r2(r.ruw)).toBe(som(TANK[ym]));
    expect(r2(-r.T)).toBe(som(TANK[ym]));
    expect(r2(r.U)).toBe(som(TANK[ym]));
  }
  /* oktober: tot v522 trok v473 de 287 eraf (270,25 - 287 = onder nul, dus het potje verdween); nu staat het er bruto */
  const sh = await page.evaluate(() => { openInsPotje('vervoer'); return { verg: !!document.querySelector('[data-vergoeding]'), over: !!document.querySelector('[data-vergoedingover]') }; });
  expect(sh).toEqual({ verg: false, over: false });
});

test('b. november: salaris 5.215,05 + vergoedingen 412,05 + eenmalig 100,00 = 5.727,10, en Kiezen toont alleen het eenmalige deel', async ({ page }) => {
  await boot(page); await oudeStand(page);
  const v = await split(page, '2026-11');
  expect(v).toMatchObject({ regel: 'b', vraag: true, nietGesplitst: true });   // 511,10 boven vast, boven de bovengrens van 400: een vraag
  /* de vraag: niets voorgeselecteerd, de tekst noemt vergoedingen */
  const sh = await page.evaluate(() => { salSplitVraagSheet(_sid('2026-11')); const s = document.querySelector('#salSplitSheet');
    return { t: s.innerText, sec: [...s.querySelectorAll('button')].every((b) => b.classList.contains('sec')), vorig: +(s.querySelector('[data-salsplitverg]') || {}).dataset.salsplitverg,
      toew: !!s.querySelector('[data-salsplittoewym]') }; });
  expect(sh.t).toContain('Hoeveel hiervan zijn vergoedingen (reiskosten, thuiswerk)? Wat geen vergoeding is, telt als eenmalig.');
  expect(sh.sec).toBe(true);
  expect(sh.vorig).toBe(287);
  expect(sh.toew).toBe(false);   // v522b: geen toewijzing aan een andere maand
  /* het antwoord via de velden: vergoedingen 412,05, waarvan eenmalig 100 */
  await page.evaluate(() => { document.getElementById('salSplitAnder').value = '412,05'; document.getElementById('salSplitEenmalig').value = '100,00';
    document.querySelector('[data-salsplitanderknop]').click(); });
  const S = await split(page, '2026-11');
  expect(S).toMatchObject({ salaris: 5215.05, verg: 412.05, eenmalig: 100, vraag: false });
  expect(r2(S.salaris + S.verg + S.eenmalig)).toBe(5727.10);
  const k = await page.evaluate(() => { const id = _sid('2026-11'); const x = gripCyclus().kies.find((y) => y.id === 'inkomen:eenmalig:' + id); return x ? x.naam : null; });
  expect(k).toBe('Eenmalig €100 verdelen');
  const m = await page.evaluate(() => maandInkomen('2026-11'));
  expect(r2(m.verg)).toBe(412.05);
  expect(r2(m.onregelmatig)).toBe(100);
  expect(r2(m.alles)).toBe(5727.10);
  expect(r2(m.norm)).toBe(5627.10);   // vergoedingen tellen in de norm, het eenmalige deel niet
});

test('d. marge: een salarisdeel van 5.206,33 valt binnen 5.216 ± 25, geen vraag "lager dan je salaris"', async ({ page }) => {
  await boot(page); await oudeStand(page);
  /* oktober zoals de loonstrook: vergoedingen 287,15, eenmalig (bonus) 2.199,50, dus salaris 5.206,33 */
  await page.evaluate(() => salSplitAntwoord(_sid('2026-10'), 287.15, { eenmalig: 2199.50 }));
  const S = await split(page, '2026-10');
  expect(S).toMatchObject({ salaris: 5206.33, verg: 287.15, eenmalig: 2199.5, vraag: false });
  expect(S.regel).not.toBe('c');
  const home = await page.evaluate(() => { go('dash'); renderDash(); return !!document.querySelector('[data-salsplitvraag="' + _sid('2026-10') + '"]'); });
  expect(home).toBe(false);
  /* een storting binnen de marge is salaris zonder vraag; daaronder de vraag */
  const st = await page.evaluate(() => { const t = _sal('2026-09'); const o = t.amount; const uit = {};
    for (const b of [5191, 5241, 5190.99]) { t.amount = b; const S = salSplitsing(t); uit[b] = { regel: S.regel, vraag: S.vraag, salaris: S.salaris }; } t.amount = o; return uit; });
  expect(st[5191]).toEqual({ regel: 'a', vraag: false, salaris: 5191 });
  expect(st[5241]).toEqual({ regel: 'a', vraag: false, salaris: 5241 });
  expect(st[5190.99]).toMatchObject({ regel: 'c', vraag: true });
});

test('e. vergoedingen zijn inkomen van hun maand (inkomenVerdeling), niet eenmalig in Kiezen, en niet in het salarisdeel', async ({ page }) => {
  await boot(page); await oudeStand(page);
  await page.evaluate(() => salSplitAntwoord(_sid('2026-11'), 412.05, { eenmalig: 100 }));
  const r = await page.evaluate(() => ({ deel: salarisDeel(_sal('2026-11')), okt: salarisDeel(_sal('2026-10')), verg: vergDeel(_sal('2026-11')) }));
  expect(r.deel).toBe(5215.05);   // v522b: het salaris zonder vergoedingen
  expect(r.okt).toBe(5216);
  expect(r.verg).toBe(412.05);
  /* inkomenVerdeling (afgesloten maanden): oktober draagt zijn vergoedingen als inkomen, eenmalig apart */
  const iv = await page.evaluate(() => { const V = vraagInkomenVerdeling({}); const okt = V.rij.find((x) => x.m === '2026-10'); return okt ? { ink: okt.ink, een: okt.een } : null; });
  expect(iv).not.toBeNull();
  expect(r2(iv.ink)).toBe(7692.98);
  expect(r2(iv.een)).toBe(2189.98);
  /* Kiezen: het eenmalige deel van november is 100, niet 512 (de vergoedingen erbij) */
  const k = await page.evaluate(() => gripCyclus().kies.filter((y) => String(y.id).startsWith('inkomen:eenmalig:')).map((y) => y.naam));
  expect(k).toContain('Eenmalig €100 verdelen');
  expect(k.join(' ')).not.toContain('€512');
});

test('h. geen toewijzing meer: een oude toewijzing wordt een notitie met dezelfde tekst en verandert geen bedrag', async ({ page }) => {
  await boot(page);
  await oudeStand(page, { extra: await page.evaluate(() => ({ [_sid('2026-11')]: { verg: 412.05, eenmalig: 100, toew: { ym: '2026-09', bedrag: 122.45 }, regel: 'b', door: 'jij', op: '2026-11-25' } })) });
  const r = await page.evaluate(() => { const id = _sid('2026-11'); return { n: txNotitie(id), A: SET.salSplitAntw[id], M: SET.salSplit522b, sep: maandInkomen('2026-09'), nov: maandInkomen('2026-11'), S: salSplitsing(_sal('2026-11')) }; });
  expect(r.n).toBe('€122,45 hoort bij september');
  expect(r.A.toew).toBeUndefined();
  expect(r.M.voor[await page.evaluate(() => _sid('2026-11'))]).toEqual({ ym: '2026-09', bedrag: 122.45 });
  expect(r2(r.sep.alles)).toBe(5216.28);   // niets verschoven
  expect(r2(r.sep.verg)).toBe(0);
  expect(r2(r.nov.alles)).toBe(5727.10);
  expect(r2(r.nov.verg)).toBe(412.05);
  expect(r.S).toMatchObject({ salaris: 5215.05, verg: 412.05, eenmalig: 100 });
  expect(r.S.toew).toBeUndefined();
  /* een bestaande notitie blijft staan */
  await oudeStand(page, { extra: await page.evaluate(() => { SET.txNotitie = { [_sid('2026-11')]: { tekst: 'mijn eigen tekst', op: '2026-11-25' } }; return { [_sid('2026-11')]: { verg: 412.05, toew: { ym: '2026-09', bedrag: 122.45 } } }; }) });
  expect(await page.evaluate(() => txNotitie(_sid('2026-11')))).toBe('mijn eigen tekst');
});

test('i. notitie: opgeslagen, zichtbaar in de sheet, het salarisblok en de lijst, in de back-up, niet naar de Worker; bedragen ongewijzigd', async ({ page }) => {
  await boot(page); await oudeStand(page);
  await page.evaluate(() => salSplitAntwoord(_sid('2026-11'), 412.05, { eenmalig: 100 }));
  const TEKST = '€122,45 hoort bij september (reiskosten + thuiswerk die toen niet zijn uitbetaald)';
  const voor = await page.evaluate(() => JSON.stringify({ sep: maandInkomen('2026-09'), nov: maandInkomen('2026-11'), cs: catSpendMap('2026-11'), S: salSplitsing(_sal('2026-11')), b: baseIncome() }));
  /* via het veld in de boekingssheet */
  await page.evaluate((T) => { openSheet(_sid('2026-11')); const v = document.querySelector('[data-txnotitie]'); v.value = T; v.dispatchEvent(new Event('change')); }, TEKST);
  const r = await page.evaluate(() => { const id = _sid('2026-11'); openSheet(id);
    const sh = { veld: document.querySelector('[data-txnotitie]').value, blok: (document.querySelector('[data-salsplitnotitie]') || {}).innerText || '' };
    const opgeslagen = JSON.parse(localStorage.getItem('minder_set')).txNotitie[id].tekst;
    closeSheet(); go('tx'); renderTxList(); const ic = document.querySelector('[data-txnotitieicoon]');
    return { sh, opgeslagen, icoon: ic ? ic.getAttribute('title') : null }; });
  expect(r.opgeslagen).toBe(TEKST);
  expect(r.sh.veld).toBe(TEKST);
  expect(r.sh.blok).toContain(TEKST);
  expect(r.icoon).toBe(TEKST);
  const na = await page.evaluate(() => JSON.stringify({ sep: maandInkomen('2026-09'), nov: maandInkomen('2026-11'), cs: catSpendMap('2026-11'), S: salSplitsing(_sal('2026-11')), b: baseIncome() }));
  expect(na).toBe(voor);
  /* de back-up draagt de notitie */
  const bk = await page.evaluate(async () => { let blob = null; const o = URL.createObjectURL; URL.createObjectURL = (b) => { blob = b; return 'blob:x'; };
    const oc = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () {}; try { exportBackup(); } finally { URL.createObjectURL = o; HTMLAnchorElement.prototype.click = oc; }
    return blob ? await blob.text() : ''; });
  expect(JSON.parse(bk).set.txNotitie[await page.evaluate(() => _sid('2026-11'))].tekst).toBe(TEKST);
  /* nooit naar de Worker: de body van /vraag en een echte aanroep dragen hem niet */
  const body = await page.evaluate(() => JSON.stringify(vraagBody('wat gaf ik uit aan tanken?')));
  expect(body).not.toContain('122,45');
  expect(body).not.toContain('hoort bij september');
  const req = [];
  await page.route('https://w.test/vraag', (rt) => { req.push(rt.request().postData() || ''); rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ soort: 'onbekend' }) }); });
  await page.evaluate(() => { SET.psd2Url = 'https://w.test'; SET.psd2Token = 'tok'; SET.vraagAan = true; save(); go('maand'); });
  await page.locator('#gripKoopcheck').click();
  await page.fill('#vraagVeld', 'wat gaf ik uit aan tanken?'); await page.locator('[data-vraagstuur]').click();
  await page.waitForFunction(() => window._vraagStand && !window._vraagStand.bezig);
  expect(req.length).toBe(1);   // invoermeting: de vraag ging echt naar de Worker
  for (const x of req) { expect(x).not.toContain('hoort bij september'); }
});

test('j. verwacht maandinkomen is het salaris zonder vergoedingen: opzij gelijk aan v521c op 23, 24, 26 nov en 1 dec', async ({ browser }) => {
  for (const dag of W.DAGEN) { const ctx = await browser.newContext(); const page = await ctx.newPage();
    await boot(page, { dag }); await oudeStand(page);
    const r = await page.evaluate(() => { const P = rekVoorstel(); return { ok: P.ok, opzij: P.ok ? Math.round(P.opzij) : null, salaris: P.ok ? Math.round(P.salaris * 100) / 100 : null,
      okt: salarisDeel(_sal('2026-10')), inkVast: inkVast() }; });
    expect([dag, r.ok, r.opzij, r.salaris]).toEqual([dag, VOOR[dag].ok, VOOR[dag].opzij, VOOR[dag].salaris]);
    expect(r.okt).toBe(5216);   // de storting van oktober met EUR 287 vergoedingen: het verwachte salaris blijft 5.216
    expect(r.inkVast).toBe(5216);
    await ctx.close(); }
});

test('k. de vergoedingen van november tellen in inkomenVerdeling als inkomen van november', async ({ page }) => {
  await boot(page, { dag: '2026-12-01' }); await oudeStand(page);
  await page.evaluate(() => salSplitAntwoord(_sid('2026-11'), 412.05, { eenmalig: 100 }));
  const r = await page.evaluate(() => { const V = vraagInkomenVerdeling({}); const nov = V.rij.find((x) => x.m === '2026-11'); return { nov, mi: maandInkomen('2026-11') }; });
  expect(r.nov).toBeTruthy();
  expect(r2(r.nov.ink)).toBe(5727.10);   // 5.215,05 salaris + 412,05 vergoedingen + 100 eenmalig
  expect(r2(r.nov.een)).toBe(100);
  expect(r2(r.mi.verg)).toBe(412.05);
});

test('g. Instellingen: marge en vergoedingen verwacht, geen potje meer', async ({ page }) => {
  await boot(page); await oudeStand(page);
  const r = await page.evaluate(() => { go('set'); openSetSub('inkomen'); const b = document.getElementById('salSplitInstel');
    return { t: b.innerText, marge: b.querySelector('[data-salsplitmarge]').value, pot: !!b.querySelector('[data-salsplitpot]'), aan: b.querySelector('[data-salsplitvergaan]').checked, max: b.querySelector('[data-salsplitmax]').value }; });
  expect(r.t).toContain('Vergoedingen');
  expect(r.t).toContain('wisselend, tellen per maand als ze binnenkomen');
  expect(r.marge).toBe('25');
  expect(r.pot).toBe(false);
  expect(r.aan).toBe(true);
  expect(r.max).toBe('400');
  /* een blok "Je inkomen": bovenaan het vaste salaris, dan de regels vergoedingen en overig vast, onderaan de som als uitkomst; past op 360 en 390 */
  for (const w of [360, 390]) { await page.setViewportSize({ width: w, height: 800 });
    const v = await page.evaluate(() => { SET.autoIncome = false; renderSet(); openSetSub('inkomen'); const B = document.querySelector('[data-jeinkomen]'); const y = (q) => B.querySelector(q).getBoundingClientRect().top;
      return { kop: B.innerText.split('\n')[0], vast: y('[data-salsplitvast]'), marge: y('[data-salsplitmarge]'), verg: y('[data-vergregel]'), overig: y('#inkOverigLijst'), som: y('[data-inksom]'),
        somT: B.querySelector('[data-inksom]').innerText, invoer: !!B.querySelector('[data-inksom] input'), over: document.documentElement.scrollWidth > document.documentElement.clientWidth }; });
    expect(v.kop).toBe('Je inkomen');
    expect(v.vast < v.marge && v.marge < v.verg && v.verg < v.overig && v.overig < v.som).toBe(true);
    expect(v.somT).toContain('Inkomen per maand (waar je budget op rust)');
    expect(v.somT).toContain('= €5.216');
    expect(v.somT).toContain('vast salaris €5.216 + overig vast');   // de fixture draagt een overig vast uit de overzetting van v476 (nog niet bevestigd)
    expect(v.invoer).toBe(false);
    expect(v.over).toBe(false); }
  await page.evaluate(() => salSplitZet('marge', '0'));
  expect((await split(page, '2026-09')).regel).toBe('a');   // 5.216,28 boven vast zonder marge: 0,28 binnen de bovengrens is vergoedingen
});
