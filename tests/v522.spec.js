/* v522: VERGOEDINGEN BIJ JE SALARIS. Vervoer is bruto, reiskosten en thuiswerk zijn vast inkomen (een eigen post "vergoedingen"), een
   storting binnen vast +/- marge is salaris zonder vraag, en een deel van de vergoedingen kan aan een eerdere maand worden toegewezen.
   FIXTURE NAAR DE LOONSTROKEN VAN DE GEBRUIKER (SKF, netto), de rest GECONSTRUEERD:
     sep  24 sep  5.216,28 (salaris; reiskosten 120,00 en thuiswerk 2,45 niet uitbetaald)
     okt  26 okt  7.692,98 = 5.206,33 + bonus 2.199,50 + reiskosten 270,00 + thuiswerk 17,15
     nov  25 nov  5.727,10 = 5.215,05 + reiskosten 270,00 + thuiswerk 19,60 + eenmalige vergoeding 100,00 + correctie sep 122,45
   Tankboekingen in sep, okt en nov (Vervoer, potje 400). Vast salaris 5.216, marge 25, vergoedingen verwacht met bovengrens 400. */
const { test, expect } = require('./klok');
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
const TANK = { '2026-09': [180, 95.5], '2026-10': [210, 60.25], '2026-11': [150] };
async function boot(page) {
  const tx = []; const add = (id, date, amount, name, desc, acc) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of ['2026-06', '2026-07', '2026-08']) add('sal-' + m, m + '-24', 5216.28, 'SKF B.V.', 'SALARIS LOON SKF');
  add('sal-2026-09', '2026-09-24', 5216.28, 'SKF B.V.', 'SALARIS LOON SKF');
  add('sal-2026-10', '2026-10-26', 7692.98, 'SKF B.V.', 'SALARIS LOON SKF');
  add('sal-2026-11', '2026-11-25', 5727.10, 'SKF B.V.', 'SALARIS LOON SKF');
  for (const m in TANK) TANK[m].forEach((b, i) => add('tank-' + m + '-' + i, m + '-' + String(10 + i * 5), -b, 'Shell', 'SHELL TANKSTATION'));
  add('sp-1', '2026-10-27', 300, 'Spaarpot', 'NAAR SPAREN', SAV);
  const set = { budgetMonth: '2026-11', income: 5216, autoIncome: true, limit: 70, limitMode: 'pct', budgets: { vervoer: 400, boodschappen: 400 }, savingsEnds: ['4323'],
    manualBal: { [MAIN]: 6000, [SAV]: 5000 }, irregularIncome: [] };
  const d = { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]), minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-11-26');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof salSplitsing === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  await page.evaluate(() => { window._sal = (ym) => TX.find((t) => t.amount > 0 && String(t.date).startsWith(ym) && /SALARIS/.test(t.desc)); window._sid = (ym) => (window._sal(ym) || {}).id; });
}
/* de stand van de gebruiker van voor v522 (SET.salSplit met reisPot, het antwoord reis 287 voor oktober), door de echte migratie in load() */
async function oudeStand(page, o) {
  o = o || {};
  await page.evaluate((o) => { const id = _sid('2026-10');
    SET.salSplit = { vast: 5216, key: recurKey(_sal('2026-10')), naam: 'SKF B.V.', reisAan: true, reisPot: 'vervoer', reisMax: 400, marge: o.marge == null ? 25 : o.marge };
    SET.salSplitAntw = o.geenAntw ? {} : { [id]: { reis: 287, regel: 'b', door: 'jij', op: '2026-10-27' } }; delete SET.salSplit522;
    save(); localStorage.setItem('minder_set', JSON.stringify(SET)); load(); _dataGen++; }, o);
}
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
      toew: [...s.querySelectorAll('[data-salsplittoewym] option')].map((o) => o.value), gekozen: s.querySelector('[data-salsplittoewym]').value }; });
  expect(sh.t).toContain('Hoeveel hiervan zijn vergoedingen (reiskosten, thuiswerk)? Wat geen vergoeding is, telt als eenmalig.');
  expect(sh.sec).toBe(true);
  expect(sh.vorig).toBe(287);
  expect(sh.toew).toEqual(['', '2026-10', '2026-09', '2026-08']);
  expect(sh.gekozen).toBe('');
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

test('c. september: na de toewijzing telt EUR 122,45 als vergoedingen in september en niet in november', async ({ page }) => {
  await boot(page); await oudeStand(page);
  await page.evaluate(() => salSplitAntwoord(_sid('2026-11'), 412.05, { eenmalig: 100, toewYm: '2026-09', toewBedrag: 122.45 }));
  const r = await page.evaluate(() => ({ sep: maandInkomen('2026-09'), nov: maandInkomen('2026-11'), S: salSplitsing(_sal('2026-11')) }));
  expect(r.S.toew).toEqual({ ym: '2026-09', bedrag: 122.45 });
  expect(r2(r.sep.verg)).toBe(122.45);
  expect(r2(r.sep.alles)).toBe(r2(5216.28 + 122.45));
  expect(r2(r.nov.verg)).toBe(r2(412.05 - 122.45));
  expect(r2(r.nov.alles)).toBe(r2(5727.10 - 122.45));
  expect(r2(r.sep.alles + r.nov.alles)).toBe(r2(5216.28 + 5727.10));   // er verdwijnt niets, het verschuift
  /* het banksaldo en de boeking veranderen niet; de boeking zegt bij welke maand het deel hoort */
  const b = await page.evaluate(() => { const t = _sal('2026-11'); openSheet(t.id); const e = document.querySelector('[data-salsplittoew]'); return { amount: t.amount, t: e ? e.innerText : '', ym: e ? e.dataset.salsplittoew : '' }; });
  expect(b.amount).toBe(5727.10);
  expect(b.ym).toBe('2026-09');
  expect(b.t).toBe('€ 122,45 hoort bij september'.replace('€ ', '€'));
  /* meer toewijzen dan de vergoedingen kan niet */
  await page.evaluate(() => salSplitAntwoord(_sid('2026-11'), 100, { toewYm: '2026-09', toewBedrag: 122.45 }));
  expect((await split(page, '2026-11')).verg).toBe(412.05);
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

test('e. vergoedingen zijn inkomen in de salarisverdeling en in inkomenVerdeling, niet eenmalig in Kiezen', async ({ page }) => {
  await boot(page); await oudeStand(page);
  await page.evaluate(() => salSplitAntwoord(_sid('2026-11'), 412.05, { eenmalig: 100 }));
  const r = await page.evaluate(() => { const P = rekVoorstel(); return { ok: P.ok, salaris: P.salaris, opzij: P.opzij, deel: salarisDeel(_sal('2026-11')) }; });
  expect(r.deel).toBe(5627.10);
  expect(r.ok).toBe(true);
  expect(r2(r.salaris)).toBe(5627.10);
  /* zonder de vergoedingen als inkomen zou opzij 412,05 lager zijn: dezelfde berekening met het salarisdeel zonder vergoedingen */
  const zonder = await page.evaluate(() => { const o = window.salarisDeel; window.salarisDeel = (t) => Math.round((o(t) - vergDeel(t)) * 100) / 100; window._rekV = null;
    const P = rekVoorstel(); window.salarisDeel = o; window._rekV = null; return { salaris: P.salaris, opzij: P.opzij }; });
  expect(r2(r.salaris - zonder.salaris)).toBe(412.05);
  expect(r.opzij).toBeGreaterThan(zonder.opzij);
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

test('g. Instellingen: marge en vergoedingen verwacht, geen potje meer', async ({ page }) => {
  await boot(page); await oudeStand(page);
  const r = await page.evaluate(() => { go('set'); openSetSub('inkomen'); const b = document.getElementById('salSplitInstel');
    return { t: b.innerText, marge: b.querySelector('[data-salsplitmarge]').value, pot: !!b.querySelector('[data-salsplitpot]'), aan: b.querySelector('[data-salsplitvergaan]').checked, max: b.querySelector('[data-salsplitmax]').value }; });
  expect(r.t).toContain('Vergoedingen verwacht');
  expect(r.marge).toBe('25');
  expect(r.pot).toBe(false);
  expect(r.aan).toBe(true);
  expect(r.max).toBe('400');
  await page.evaluate(() => salSplitZet('marge', '0'));
  expect((await split(page, '2026-09')).regel).toBe('a');   // 5.216,28 boven vast zonder marge: 0,28 binnen de bovengrens is vergoedingen
});
