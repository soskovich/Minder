/* v517: de regels van de betaalmelding in de service worker, op sw.js zelf in een Node-vm, met de tijd als argument (zoals v516).
   Geen echte push: meldBetaalbericht() krijgt de ontsleutelde payload direct. */
const { test, expect } = require('./klok');
const fs = require('fs'); const path = require('path'); const vm = require('vm');

function laadSw() {
  const shown = [], store = {};
  const ctx = { console, Date, URL, Promise, setTimeout, String, Math, Object, JSON, Map, Array,
    self: { addEventListener() {}, registration: { showNotification: async (t, o) => { shown.push({ titel: t, body: o.body, tag: o.tag, data: o.data }); } }, location: { origin: 'x' } } };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), ctx);
  ctx.swKvGet = async (k) => store[k]; ctx.swKvSet = async (k, v) => { store[k] = v; };
  return { ctx, shown, store };
}
// snapshot met één aangezet potje (Boodschappen) met zijn tegenpartij-sleutels; Uit eten staat NIET in de snapshot (potje uit)
function snap(nog, opMs) {
  return { v: 1, op: '2026-11-20T12:00', opMs: opMs, weekVan: '2026-11-16', weekTot: '2026-11-22', weekbedrag: 361, weekNog: 200, vorige: null,
    potjes: [{ naam: 'Boodschappen', nog: nog, keys: ['ALBERT HEIJN 456', 'JUMBO'] }] };
}
const boeking = (naam, bedrag, id) => ({ id: id || naam, datum: '2026-11-20', bedrag, naam });
const nu = (d, h, m) => new Date(2026, 10, d || 20, h == null ? 12 : h, m || 0).getTime();
const push = (boekingen) => ({ t: 'betaal', boekingen });

test('v517 sw a: een bekende tegenpartij bij een aangezet potje geeft de melding met de rest', async () => {
  const W = laadSw(); W.store.meldSnap = snap(230, nu(20, 12));
  const B = await W.ctx.meldBetaalbericht(push([boeking('BEA, Albert Heijn 456', 45)]), nu(20, 13));
  expect(B.toon).toBe(true);
  expect(W.shown).toEqual([{ titel: 'Boodschappen · €45', body: 'Deze week nog €185 in dit potje.', tag: 'minder-betaal', data: { scherm: 'ins' } }]);
  expect(W.store.meldLaatst).toMatchObject({ dag: '2026-11-20', soort: 'betaal' });
});

test('v517 sw a2: een rest onder nul zegt "boven je weekbedrag", zonder oordeel', async () => {
  const W = laadSw(); W.store.meldSnap = snap(30, nu(20, 12));
  await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 45)]), nu(20, 13));
  expect(W.shown[0]).toMatchObject({ titel: 'Boodschappen · €45', body: '€15 boven je weekbedrag.' });
});

test('v517 sw a3: meer boekingen voor hetzelfde potje tellen samen', async () => {
  const W = laadSw(); W.store.meldSnap = snap(230, nu(20, 12));
  await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 20, 'x1'), boeking('JUMBO', 15, 'x2')]), nu(20, 13));
  expect(W.shown[0].titel).toBe('Boodschappen · 2 betalingen · €35');
  expect(W.shown[0].body).toBe('Deze week nog €195 in dit potje.');
});

test('v517 sw b: een onbekende tegenpartij geeft geen melding', async () => {
  const W = laadSw(); W.store.meldSnap = snap(230, nu(20, 12));
  const B = await W.ctx.meldBetaalbericht(push([boeking('ONBEKENDE WINKEL', 45)]), nu(20, 13));
  expect(B.toon).toBe(false); expect(B.reden).toBe('geen bekende boeking'); expect(W.shown.length).toBe(0);
});

test('v517 sw c: een potje dat uit staat (niet in de snapshot) geeft geen melding', async () => {
  const W = laadSw();
  // Uit eten staat niet in de snapshot; een boeking bij Restaurant X hoort bij Uit eten
  W.store.meldSnap = snap(230, nu(20, 12));
  const B = await W.ctx.meldBetaalbericht(push([boeking('RESTAURANT LONA', 30)]), nu(20, 13));
  expect(B.toon).toBe(false); expect(W.shown.length).toBe(0);
});

test('v517 sw d: niet twee keer op dezelfde dag (gedeeld met het weekbericht)', async () => {
  const W = laadSw(); W.store.meldSnap = snap(230, nu(20, 12));
  await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 10)]), nu(20, 13));
  const B = await W.ctx.meldBetaalbericht(push([boeking('JUMBO', 10)]), nu(20, 16));
  expect(B.reden).toBe('vandaag al een melding'); expect(W.shown.length).toBe(1);
});

test('v517 sw e: niet in de stille uren (23:00), en niet alsnog om 07:00', async () => {
  const W = laadSw(); W.store.meldSnap = snap(230, nu(20, 23));
  const B = await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 10)]), nu(20, 23));
  expect(B.reden).toBe('stille uren'); expect(W.shown.length).toBe(0);
  expect(W.store.meldLaatst).toBe(undefined); // niets bewaard, dus komt niet alsnog om 07:00
});

test('v517 sw f: niet bij een snapshot van 4 dagen oud (wel bij 3 dagen min een minuut)', async () => {
  const W = laadSw(); W.store.meldSnap = snap(230, nu(16, 13));
  expect((await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 10)]), nu(20, 13))).reden).toBe('stand ouder dan 3 dagen');
  W.store.meldSnap = snap(230, nu(17, 13, 1));
  expect((await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 10)]), nu(20, 13))).toon).toBe(true);
});

/* ===== v517b: de rest klopt ===== */
function snapB(nog, opMs, verwerkt) { const s = snap(nog, opMs); s.potjes[0].verwerkt = verwerkt || []; return s; }

test('v517b sw g: een boeking die de snapshot al verwerkt heeft wordt niet nog eens afgetrokken', async () => {
  const W = laadSw(); W.store.meldSnap = snapB(100, nu(20, 11, 30), ['X']);
  await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 30, 'X')]), nu(20, 12));
  expect(W.shown[0]).toMatchObject({ titel: 'Boodschappen · €30', body: 'Deze week nog €100 in dit potje.' });
});

test('v517b sw h: twee pushes zonder nieuwe snapshot tellen allebei', async () => {
  const W = laadSw(); W.store.meldSnap = snapB(100, nu(20, 8));
  await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 10, 'p1')]), nu(20, 12));
  W.store.meldLaatst = { dag: '2026-11-19' };              // de dag-grens loslaten, zodat de tweede getoond wordt
  await W.ctx.meldBetaalbericht(push([boeking('JUMBO', 15, 'p2')]), nu(20, 17));
  expect(W.shown.map((x) => x.body)).toEqual(['Deze week nog €90 in dit potje.', 'Deze week nog €75 in dit potje.']);
});

test('v517b sw i: een push in de stille uren telt mee in de volgende', async () => {
  const W = laadSw(); W.store.meldSnap = snapB(100, nu(19, 20));
  const B1 = await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 25, 's1')]), nu(19, 23));
  expect(B1.reden).toBe('stille uren'); expect(W.shown.length).toBe(0);
  await W.ctx.meldBetaalbericht(push([boeking('JUMBO', 15, 's2')]), nu(20, 12));
  expect(W.shown).toHaveLength(1);
  expect(W.shown[0]).toMatchObject({ titel: 'Boodschappen · €15', body: 'Deze week nog €60 in dit potje.' });
});

test('v517b sw j: een nieuwe snapshot maakt de lijst leeg van wat hij al verwerkt heeft', async () => {
  const W = laadSw(); W.store.meldSnap = snapB(100, nu(20, 8));
  await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 25, 'j1')]), nu(20, 12));
  expect(W.store.meldBetaald.items.map((i) => i.id)).toEqual(['j1']);
  // de app opent: de nieuwe snapshot heeft j1 al in nog (75) en in zijn sleutellijst
  W.store.meldSnap = snapB(75, nu(20, 14), ['j1']);
  W.store.meldLaatst = { dag: '2026-11-19' };
  await W.ctx.meldBetaalbericht(push([boeking('JUMBO', 15, 'j2')]), nu(20, 17));
  expect(W.store.meldBetaald.opMs).toBe(nu(20, 14));
  expect(W.store.meldBetaald.items.map((i) => i.id)).toEqual(['j2']);
  expect(W.shown[1].body).toBe('Deze week nog €60 in dit potje.');
});

test('v517b sw j2: wat de nieuwe snapshot nog niet heeft (de app synchroniseerde nog niet) blijft staan', async () => {
  const W = laadSw(); W.store.meldSnap = snapB(100, nu(20, 8));
  await W.ctx.meldBetaalbericht(push([boeking('ALBERT HEIJN 456', 25, 'q1')]), nu(20, 12));
  W.store.meldSnap = snapB(100, nu(20, 14), []);                // nieuwe snapshot zonder q1: de app heeft hem nog niet
  W.store.meldLaatst = { dag: '2026-11-19' };
  await W.ctx.meldBetaalbericht(push([boeking('JUMBO', 15, 'q2')]), nu(20, 17));
  expect(W.store.meldBetaald.items.map((i) => i.id)).toEqual(['q1', 'q2']);
  expect(W.shown[1].body).toBe('Deze week nog €60 in dit potje.');
});

test('v517b sw k: een boeking buiten de week van de snapshot krijgt geen rest', async () => {
  const W = laadSw(); W.store.meldSnap = snapB(100, nu(22, 20));  // zondag, week 16 t/m 22 nov
  const B = await W.ctx.meldBetaalbericht(push([{ id: 'k1', datum: '2026-11-23', bedrag: 40, naam: 'ALBERT HEIJN 456' }]), nu(23, 12));
  expect(B.toon).toBe(true);
  expect(W.shown[0]).toEqual({ titel: 'Boodschappen · €40', body: 'Open Minder voor de stand van deze week.', tag: 'minder-betaal', data: { scherm: 'ins' } });
});
