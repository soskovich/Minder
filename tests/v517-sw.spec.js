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
