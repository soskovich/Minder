/* v516: MELDINGEN OP JE TELEFOON (deel 1: het weekbericht en de basis). Fixture v516-stand (20 nov, GECONSTRUEERD): de tegel
   "Deze week" zegt nog EUR 292 van EUR 361. De regels van de service worker worden getoetst op sw.js zelf, geladen in een Node-vm
   met een vaste tijd (de klok van een service worker staat buiten page.clock); de testmelding en de cache via de echte worker. */
const { test, expect } = require('./klok');
const fs = require('fs'); const path = require('path'); const vm = require('vm');
const K = require('./v516-stand');
const { bedragen } = require('./v516-bedragen');
const VOOR = require('./v516-voor.json');
const K515 = require('./v515-stand');
const MELD = { meldAan: true, meldPotjes: { boodschappen: true } };
const idb = (page, k) => page.evaluate((k) => idbGet(k), k);

test('v516 a: standaard staat alles uit, en zonder toestemming wordt er niets geregistreerd of geschreven', async ({ page }) => {
  await K.boot(page);
  await page.waitForTimeout(1000);   // de boot-timer van v516 (800 ms) heeft gelopen
  const r = await page.evaluate(async () => { openSetSub('meldingen');
    const el = document.getElementById('setMeld');
    return { aan: SET.meldAan, potjes: SET.meldPotjes || null, schakel: el.querySelector('[data-meldschakel]').checked,
      pot: [...el.querySelectorAll('[data-meldpot] input')].map((i) => i.checked), test: el.querySelector('[data-meldtest]').disabled,
      ps: window._meldPs || null, snap: await idbGet('meldSnap') }; });
  expect(r.aan).not.toBe(true);
  expect(r.potjes).toBe(null);
  expect(r.schakel).toBe(false);
  expect(r.pot).toEqual([false, false]);   // Boodschappen en Vices, niets voorgeselecteerd
  expect(r.test).toBe(true);
  expect(r.ps).toBe(null);
  expect(r.snap == null).toBe(true);
  // aanzetten zonder toestemming (de headless browser weigert): blijft uit, met de reden, en schrijft niets
  await page.click('[data-meldhoofd] label.sw');
  await page.waitForSelector('[data-meldreden]');
  const n = await page.evaluate(async () => ({ aan: SET.meldAan, reden: document.querySelector('[data-meldreden]').innerText, snap: await idbGet('meldSnap'), ps: window._meldPs || null, perm: Notification.permission }));
  expect(n.perm).not.toBe('granted');
  expect(n.aan).toBe(false);
  expect(n.reden).toMatch(/toestemming/);
  expect(n.snap == null).toBe(true);
  expect(n.ps).toBe(null);
});

test('v516 b: de snapshot draagt alleen de toegestane velden, en 361 / 292 komen van de tegel', async ({ page }) => {
  await K.boot(page, { set: MELD });
  const r = await page.evaluate(async () => { go('ins'); const e = document.getElementById('insWeek'); const S = await meldSnapSchrijf();
    return { tegel: { b: +e.dataset.weekbedrag, n: +e.dataset.weeknog }, S, opgeslagen: await idbGet('meldSnap') }; });
  expect(r.tegel).toEqual({ b: 361, n: 292 });
  expect(Object.keys(r.S).sort()).toEqual(['op', 'opMs', 'potjes', 'v', 'vorige', 'weekNog', 'weekTot', 'weekVan', 'weekbedrag']);
  expect(r.S).toMatchObject({ weekbedrag: 361, weekNog: 292, weekVan: '2026-11-16', weekTot: '2026-11-22', op: '2026-11-20T12:00', vorige: null });
  expect(r.S.potjes).toEqual([{ naam: 'Boodschappen', nog: 230 }]);   // alleen het aangezette potje, Vices niet
  for (const p of r.S.potjes) expect(Object.keys(p).sort()).toEqual(['naam', 'nog']);
  const j = JSON.stringify(r.opgeslagen);
  expect(j).toBe(JSON.stringify(r.S));
  for (const v of ['Albert', 'Kiosk', 'ALBERT', 'NL01', K.MAIN, 'BETAALPAS', 'v516']) expect(j).not.toContain(v);
});

test('v516 c: vorige week is de laatste snapshot van de week ervoor; in de voorbeeldweergave wordt niets geschreven', async ({ page }) => {
  await K.boot(page, { set: MELD });
  const r = await page.evaluate(async () => {
    await idbSet('meldSnap', { v: 1, op: '2026-11-14T18:30', opMs: 1, weekVan: '2026-11-09', weekTot: '2026-11-15', weekbedrag: 340, weekNog: -12, vorige: null, potjes: [{ naam: 'X', nog: 1 }] });
    const S = await meldSnapSchrijf(); const S2 = await meldSnapSchrijf();
    window._voorbeeld = true; await idbSet('meldSnap', null); const vb = await meldSnapSchrijf(); const na = await idbGet('meldSnap'); window._voorbeeld = false;
    return { vorige: S.vorige, blijft: S2.vorige, vb, na }; });
  expect(r.vorige).toEqual({ weekVan: '2026-11-09', weekTot: '2026-11-15', nog: -12, op: '2026-11-14T18:30' });
  expect(r.blijft).toEqual(r.vorige);
  expect(r.vb).toBe(null); expect(r.na).toBe(null);
});

/* ---- de regels van de service worker: sw.js zelf, in een vm, met de tijd als argument ---- */
function laadSw() {
  const shown = [], store = {};
  const ctx = { console, Date, URL, Promise, setTimeout, String, Math, Object, JSON,
    self: { addEventListener() {}, registration: { showNotification: async (t, o) => { shown.push({ titel: t, body: o.body, tag: o.tag, data: o.data }); } }, location: { origin: 'x' } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), ctx);
  ctx.swKvGet = async (k) => store[k]; ctx.swKvSet = async (k, v) => { store[k] = v; };
  return { ctx, shown, store };
}
const SNAP = { v: 1, op: '2026-11-22T20:10', opMs: new Date(2026, 10, 22, 20, 10).getTime(), weekVan: '2026-11-23', weekTot: '2026-11-29', weekbedrag: 361, weekNog: 361,
  vorige: { weekVan: '2026-11-16', weekTot: '2026-11-22', nog: 69, op: '2026-11-22T20:00' }, potjes: [{ naam: 'Boodschappen', nog: 280 }] };
const t = (d, h, m) => new Date(2026, 10, d, h, m || 0).getTime();

test('v516 d: het weekbericht een keer op maandag na 07:00, in de vorm van het ontwerp, met een tik naar Inzichten', async () => {
  const W = laadSw(); W.store.meldSnap = SNAP;
  const B = await W.ctx.meldWeekbericht(t(23, 7, 5));
  expect(B.toon).toBe(true);
  expect(W.shown).toEqual([{ titel: 'Nieuwe week · €361', body: 'Vorige week bleef je €69 onder.', tag: 'minder-week', data: { scherm: 'ins' } }]);
  expect(W.store.meldLaatst).toMatchObject({ dag: '2026-11-23', week: '2026-11-23' });
});
test('v516 e: niet op dinsdag', async () => {
  const W = laadSw(); W.store.meldSnap = Object.assign({}, SNAP, { opMs: t(23, 20) });
  expect((await W.ctx.meldWeekbericht(t(24, 9))).reden).toBe('geen maandag'); expect(W.shown.length).toBe(0); });
test('v516 f: niet twee keer op dezelfde dag (ook geen tweede weekbericht in de week)', async () => {
  const W = laadSw(); W.store.meldSnap = SNAP;
  await W.ctx.meldWeekbericht(t(23, 8)); const B = await W.ctx.meldWeekbericht(t(23, 15));
  expect(B.reden).toBe('vandaag al een melding'); expect(W.shown.length).toBe(1);
  W.store.meldLaatst = { dag: '2026-11-22', week: '2026-11-23' };   // weekbericht deze week al getoond, andere dag
  expect((await W.ctx.meldWeekbericht(t(23, 16))).reden).toBe('deze week al een weekbericht'); expect(W.shown.length).toBe(1); });
test('v516 g: niet om 23:00 en niet om 06:30 (stille uren 22:00-07:00)', async () => {
  const W = laadSw(); W.store.meldSnap = SNAP;
  expect((await W.ctx.meldWeekbericht(t(23, 23))).reden).toBe('stille uren');
  expect((await W.ctx.meldWeekbericht(t(23, 6, 30))).reden).toBe('stille uren');
  expect((await W.ctx.meldWeekbericht(t(23, 22))).reden).toBe('stille uren');
  expect(W.shown.length).toBe(0); });
test('v516 h: niet bij een snapshot van 4 dagen oud (wel bij een van 3 dagen min een minuut)', async () => {
  const W = laadSw(); W.store.meldSnap = Object.assign({}, SNAP, { opMs: t(19, 9) });
  expect((await W.ctx.meldWeekbericht(t(23, 9))).reden).toBe('stand ouder dan 3 dagen'); expect(W.shown.length).toBe(0);
  W.store.meldSnap = Object.assign({}, SNAP, { opMs: t(20, 9, 1) });
  expect((await W.ctx.meldWeekbericht(t(23, 9))).toon).toBe(true); });
test('v516 i: een snapshot van vorige week noemt alleen vorige week, met de dag van de stand en zonder weekbedrag', async () => {
  const W = laadSw(); W.store.meldSnap = { v: 1, op: '2026-11-20T12:00', opMs: t(20, 12), weekVan: '2026-11-16', weekTot: '2026-11-22', weekbedrag: 361, weekNog: 292, vorige: null, potjes: [] };
  await W.ctx.meldWeekbericht(t(23, 8));
  expect(W.shown[0].titel).toBe('Nieuwe week');
  expect(W.shown[0].body).toBe('Vorige week bleef je €292 onder (stand van vr 20 nov). Open Minder voor je weekbedrag van deze week.');
  expect(W.ctx.meldVorigeZin({ nog: -1234, weekTot: '2026-11-22', op: '2026-11-22T21:00' })).toBe('Vorige week bleef je €1.234 boven.');
});

test('v516 l: alle bedragen op Inzichten, Grip en Plan zijn gelijk aan c9f8a00 (twee fixtures, meldingen aan)', async ({ page }) => {
  // v524: Plan is herzien (lagen-dashboard); de 'plan'-sleutel wordt na de back-upcontrole opnieuw vastgelegd (volgende ronde).
  // Hier sluit Plan via de lagen-invariant (plan-lagen-invariant.js); de overige schermen blijven byte-gelijk aan c9f8a00.
  const { planLagenInvariant } = require('./plan-lagen-invariant');
  const zonderPlan = (o) => { const c = Object.assign({}, o); delete c.plan; return c; };
  const goldenZonderPlan = (g) => { const c = Object.assign({}, g); delete c.plan; return c; };
  await K.boot(page, { set: MELD });
  expect(zonderPlan(await bedragen(page))).toEqual(goldenZonderPlan(VOOR.v516));
  expect(await planLagenInvariant(page)).toMatchObject({ ok: true });
  const p2 = await page.context().newPage();
  await p2.addInitScript(() => {}); await K515.boot(p2);
  await p2.evaluate(() => { SET.meldAan = true; SET.meldPotjes = { boodschappen: true }; save(); render(); });
  expect(zonderPlan(await bedragen(p2))).toEqual(goldenZonderPlan(VOOR.v515));
  expect(await planLagenInvariant(p2)).toMatchObject({ ok: true });
});

test('v516 m: blok "meldingen" in het diagnosescherm leest het toestel en schrijft niets', async ({ page }) => {
  await K.boot(page, { set: MELD });
  const r = await page.evaluate(async () => { await meldSnapSchrijf(); const b = DIAG_BLOKKEN.find((x) => x.lees === diagMeldingen);
    let n = 0; const o = localStorage.setItem.bind(localStorage); localStorage.setItem = (...a) => { n++; return o(...a); };
    const L = await b.lees(); localStorage.setItem = o; return { L: L.join('\n'), n }; });
  expect(r.n).toBe(0);
  for (const w of ['Notification:', 'showNotification:', 'PushManager:', 'periodicSync (Periodic Background Sync):', 'display-mode standalone', 'snapshot (meldSnap): op 2026-11-20T12:00', 'laatste melding'])
    expect(r.L).toContain(w);
});
