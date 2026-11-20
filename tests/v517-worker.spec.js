/* v517: DE WORKER (betaalmelding), in Node met een nep-Enable-Banking en een nep-KV. Geen browser nodig: de crypto en de
   ophaalronde zijn pure functies. De worker is een ES-module (worker/worker.js); hij wordt via import() geladen (Node 24 herkent
   de module-syntaxis). De klok is die van de suite (klok.js); de tijden in de ronde geef ik expliciet mee. */
const { test, expect } = require('./klok');
const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');

let _W; async function W() { if (!_W) _W = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'worker.js')).href); return _W; }

/* ---- nep-KV: een Map met get/put/delete, zoals Cloudflare KV (get → null bij ontbreken) ---- */
function fakeKV() { const m = new Map(); return { store: m,
  async get(k) { return m.has(k) ? m.get(k) : null; },
  async put(k, v) { m.set(k, v); },
  async delete(k) { m.delete(k); } }; }

/* ---- sleutels: een echte EB-RSA-sleutel (voor makeJWT) en VAPID + een nep-toestel (voor de push) ---- */
let EB_PEM, VAPID_PUBLIC, VAPID_PRIVATE, UA; // UA = {priv, pubRaw(Uint8), p256dh, auth(Uint8), authB64, endpoint}
test.beforeAll(async () => {
  const subtle = globalThis.crypto.subtle;
  const rsa = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const pkcs8 = Buffer.from(await subtle.exportKey('pkcs8', rsa.privateKey)).toString('base64');
  EB_PEM = '-----BEGIN PRIVATE KEY-----\n' + pkcs8.replace(/(.{64})/g, '$1\n') + '\n-----END PRIVATE KEY-----';
  const vk = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const vpub = new Uint8Array(await subtle.exportKey('raw', vk.publicKey));
  const { bytesToB64url } = await W();
  VAPID_PUBLIC = bytesToB64url(vpub);
  VAPID_PRIVATE = (await subtle.exportKey('jwk', vk.privateKey)).d;
  const ua = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw = new Uint8Array(await subtle.exportKey('raw', ua.publicKey));
  const auth = globalThis.crypto.getRandomValues(new Uint8Array(16));
  UA = { priv: ua.privateKey, pubRaw, p256dh: bytesToB64url(pubRaw), auth, authB64: bytesToB64url(auth), endpoint: 'https://push.test/dev/abc123' };
});

function env(kv, extra) { return Object.assign({ MINDER_KV: kv, EB_APP_ID: 'app-1', EB_PRIVATE_KEY: EB_PEM, EB_BASE: 'https://eb.test',
  APP_TOKEN: 'geheim-token', VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT: 'mailto:a@b.c' }, extra || {}); }

function subscription() { return { endpoint: UA.endpoint, keys: { p256dh: UA.p256dh, auth: UA.authB64 } }; }

/* nep-boeking in EB-vorm; DBIT = uitgaand, CRDT = binnenkomend (die hoort niet mee) */
function ebTx(ref, bedrag, naam, cdi) { return { entry_reference: ref, booking_date: '2026-11-20',
  credit_debit_indicator: cdi || 'DBIT', transaction_amount: { amount: String(bedrag), currency: 'EUR' },
  creditor: { name: naam }, remittance_information: [naam] }; }

/* global fetch stubben: EB-transacties geven de meegegeven lijst terug; de push-endpoint vangt de body op */
function stubFetch(txPerUid) {
  const echt = globalThis.fetch; const sent = [];
  globalThis.fetch = async (u, opt) => {
    const url = String(u);
    if (url.startsWith('https://eb.test/accounts/') && url.includes('/transactions')) {
      const uid = decodeURIComponent(url.slice('https://eb.test/accounts/'.length).split('/')[0]);
      const q = new URL(url).searchParams; sent.calls = (sent.calls || 0) + 1; (sent.urls = sent.urls || []).push(url);
      /* v517b: de nep-bank houdt zich aan date_from, en een lijst van lijsten is een reeks pagina's met continuation_key */
      let lijst = txPerUid[uid] || [];
      const pages = Array.isArray(lijst[0]) ? lijst : [lijst];
      const pi = q.get('continuation_key') ? +q.get('continuation_key') : 0;
      let rij = pages[pi] || [];
      const df = q.get('date_from'); if (df) rij = rij.filter((t) => !t.booking_date || t.booking_date >= df);
      const body = { transactions: rij }; if (pi + 1 < pages.length) body.continuation_key = String(pi + 1);
      return { ok: true, status: 200, async json() { return body; } };
    }
    if (url.startsWith(UA.endpoint)) { sent.push({ headers: opt.headers, body: new Uint8Array(opt.body) }); return { ok: true, status: 201 }; }
    return { ok: false, status: 404, async json() { return {}; } };
  };
  return { sent, herstel() { globalThis.fetch = echt; } };
}

/* het slot: 20 nov 2026 (wintertijd) 12:00 Amsterdam = 11:00 UTC */
const SLOT_MS = new Date('2026-11-20T11:00:00Z').getTime();

async function decryptPush(body, w) {
  const subtle = globalThis.crypto.subtle; const { hkdf, concatBytes } = w;
  const salt = body.slice(0, 16), idlen = body[20], asPublic = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const asKey = await subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: asKey }, UA.priv, 256));
  const te = new TextEncoder();
  const ikm = await hkdf(UA.auth, ecdh, concatBytes(te.encode('WebPush: info'), new Uint8Array([0]), UA.pubRaw, asPublic), 32);
  const cek = await hkdf(salt, ikm, concatBytes(te.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concatBytes(te.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);
  const aesKey = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['decrypt']);
  const rec = new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, ct));
  let end = rec.length; while (end > 0 && rec[end - 1] === 0) end--; end--; // padding + delimiter 0x02
  return JSON.parse(new TextDecoder().decode(rec.slice(0, end)));
}

async function meldAan(kv) { // een aangemeld toestel met één rekening, al 'primed' (seen bestaat)
  await kv.put('devices', JSON.stringify(['dev1']));
  await kv.put('device:dev1', JSON.stringify({ subscription: subscription(), accounts: ['A'], geldigTot: '2027-02-01', status: 'ok' }));
}

test('v517 worker a: na een ronde staat er geen bedrag en geen naam in KV', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv);
  await kv.put('seen:dev1:A', JSON.stringify(['al-gezien-hash'])); // primed, maar deze boeking is nieuw
  const S = stubFetch({ A: [ebTx('r1', '87.65', 'ALBERT HEIJN DISTINCT', 'DBIT')] });
  await w.runCron(env(kv), SLOT_MS); S.herstel();
  const alles = JSON.stringify([...kv.store.values()]);
  expect(alles).not.toContain('ALBERT HEIJN DISTINCT');
  expect(alles).not.toContain('87.65'); expect(alles).not.toContain('87,65'); expect(alles).not.toContain('8765');
});

test('v517 worker b: de eerste ronde na aanmelden stuurt niets en markeert alles als gezien', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv); // GEEN seen:dev1:A → eerste ronde
  const S = stubFetch({ A: [ebTx('r1', '10', 'WINKEL A', 'DBIT'), ebTx('r2', '20', 'WINKEL B', 'DBIT')] });
  const r = await w.runCron(env(kv), SLOT_MS); S.herstel();
  expect(r.ran).toBe(true);
  expect(S.sent.length).toBe(0); // niets verstuurd
  expect(kv.store.has('seen:dev1:A')).toBe(true); // maar wel gezien
  expect(JSON.parse(kv.store.get('seen:dev1:A')).length).toBe(2);
});

test('v517 worker c: een al geziene boeking gaat niet nog eens mee, een nieuwe wel', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv);
  const oud = ebTx('oud', '10', 'OUDE WINKEL', 'DBIT');
  const hOud = await w.hashId(w.boekingSleutel(oud)); // v517b: de sleutel van de app, niet entry_reference
  await kv.put('seen:dev1:A', JSON.stringify([hOud]));
  const S = stubFetch({ A: [oud, ebTx('nieuw', '33', 'NIEUWE WINKEL', 'DBIT')] });
  await w.runCron(env(kv), SLOT_MS);
  expect(S.sent.length).toBe(1);
  const payload = await decryptPush(S.sent[0].body, w); S.herstel();
  expect(payload.boekingen.map((b) => b.naam)).toEqual(['NIEUWE WINKEL']); // alleen de nieuwe
});

test('v517 worker d: een verlopen sessie stuurt niets en zet de status', async () => {
  const w = await W(); const kv = fakeKV();
  await kv.put('devices', JSON.stringify(['dev1']));
  await kv.put('device:dev1', JSON.stringify({ subscription: subscription(), accounts: ['A'], geldigTot: '2026-01-01', status: 'ok' }));
  await kv.put('seen:dev1:A', JSON.stringify([]));
  const S = stubFetch({ A: [ebTx('r1', '10', 'WINKEL', 'DBIT')] });
  await w.runCron(env(kv), SLOT_MS); S.herstel();
  expect(S.sent.length).toBe(0);
  expect(JSON.parse(kv.store.get('device:dev1')).status).toBe('verlopen');
});

test('v517 worker e: ALLOWED_ORIGIN staat op de app-origin en niet op *', async () => {
  const toml = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wrangler.toml'), 'utf8');
  const m = /ALLOWED_ORIGIN\s*=\s*"([^"]*)"/.exec(toml);
  expect(m && m[1]).toBe('https://soskovich.github.io');
  expect(m && m[1]).not.toBe('*');
  // en de worker weerspiegelt de env in CORS
  const w = await W(); const kv = fakeKV();
  const resp = await w.handleFetch(new Request('https://x/push/status', { headers: { Authorization: 'Bearer geheim-token' } }), env(kv, { ALLOWED_ORIGIN: 'https://soskovich.github.io' }));
  expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('https://soskovich.github.io');
});

test('v517 worker f: de payload is versleuteld (de naam staat er niet in) en blijft ≤ 4 KB', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv);
  await kv.put('seen:dev1:A', JSON.stringify(['x']));
  const S = stubFetch({ A: [ebTx('r1', '12.5', 'ALBERT HEIJN DISTINCT', 'DBIT')] });
  await w.runCron(env(kv), SLOT_MS);
  expect(S.sent.length).toBe(1);
  const body = S.sent[0].body;
  expect(body.length).toBeLessThanOrEqual(4096);
  expect(S.sent[0].headers['Content-Encoding']).toBe('aes128gcm');
  expect(String(S.sent[0].headers.Authorization || '').startsWith('vapid t=')).toBe(true);
  const plat = new TextDecoder('latin1').decode(body);
  expect(plat.includes('ALBERT HEIJN DISTINCT')).toBe(false); // niet als platte tekst
  const payload = await decryptPush(body, w); S.herstel();
  const tx = ebTx('r1', '12.5', 'ALBERT HEIJN DISTINCT', 'DBIT');
  expect(payload).toEqual({ t: 'betaal', boekingen: [{ id: w.boekingSleutel(tx), datum: '2026-11-20', bedrag: 12.5, naam: 'ALBERT HEIJN DISTINCT' }] }); // v517b: id = de sleutel van de app
});

test('v517 worker g: afmelden wist het toestel en zijn geziene boekingen uit KV', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv);
  await kv.put('seen:dev1:A', JSON.stringify(['h1', 'h2']));
  const resp = await w.handleFetch(new Request('https://x/push/afmelden', { method: 'POST', headers: { Authorization: 'Bearer geheim-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'dev1' }) }), env(kv));
  expect((await resp.json()).ok).toBe(true);
  expect(kv.store.has('device:dev1')).toBe(false);
  expect(kv.store.has('seen:dev1:A')).toBe(false);
  expect(JSON.parse(kv.store.get('devices'))).toEqual([]);
});

test('v517 worker h: CRDT (binnenkomend) telt niet mee, alleen DBIT', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv);
  await kv.put('seen:dev1:A', JSON.stringify(['x']));
  const S = stubFetch({ A: [ebTx('in', '500', 'SALARIS', 'CRDT'), ebTx('uit', '9', 'KIOSK', 'DBIT')] });
  await w.runCron(env(kv), SLOT_MS);
  const payload = await decryptPush(S.sent[0].body, w); S.herstel();
  expect(payload.boekingen.map((b) => b.naam)).toEqual(['KIOSK']);
});

test('v517 worker i: buiten een slot draait de ronde niet, en een slot draait maar een keer per dag', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv); await kv.put('seen:dev1:A', JSON.stringify([]));
  const S = stubFetch({ A: [] });
  const buiten = await w.runCron(env(kv), new Date('2026-11-20T08:00:00Z').getTime()); // 09:00 Amsterdam, geen slot
  expect(buiten.ran).toBe(false); expect(buiten.reden).toBe('geen slot');
  const eerste = await w.runCron(env(kv), SLOT_MS); expect(eerste.ran).toBe(true);
  const tweede = await w.runCron(env(kv), SLOT_MS + 60000); S.herstel(); // zelfde slot, een minuut later
  expect(tweede.ran).toBe(false); expect(tweede.reden).toBe('slot al gedraaid');
});

/* ===== v517b ===== */
function ebTxOp(ref, bedrag, naam, datum, extra) { return Object.assign(ebTx(ref, bedrag, naam, 'DBIT'), { booking_date: datum }, extra || {}); }

test('v517b worker j: een nieuwe boeking op pagina 2 wordt gezien (continuation_key gevolgd)', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv);
  const p1 = [ebTx('a', '10', 'WINKEL A')]; const p2 = [ebTx('b', '27', 'WINKEL PAGINA TWEE')];
  await kv.put('seen:dev1:A', JSON.stringify([await w.hashId(w.boekingSleutel(p1[0]))]));
  const S = stubFetch({ A: [p1, p2] });
  const r = await w.runCron(env(kv), SLOT_MS);
  expect(S.sent.calls).toBe(2);                                    // twee pagina's, dus twee aanroepen
  expect(S.sent.urls[0]).toContain('date_from=2026-11-15');        // vandaag (20 nov) min 5 dagen
  expect(S.sent.urls[1]).toContain('continuation_key=1');
  expect(r.uitkomst[0].paginas).toBe(2);
  expect(S.sent.length).toBe(1);
  const payload = await decryptPush(S.sent[0].body, w); S.herstel();
  expect(payload.boekingen.map((b) => b.naam)).toEqual(['WINKEL PAGINA TWEE']);
});

test('v517b worker k: 250 boekingen in de eerste ronde, dezelfde 250 in de tweede: geen push', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv);
  // 240 oude boekingen (6 tot 60 dagen terug) eerst, dan 10 van de laatste dagen
  const lijst = [];
  for (let i = 0; i < 240; i++) { const d = new Date(Date.UTC(2026, 10, 20 - 6 - (i % 55))); lijst.push(ebTxOp('o' + i, String(5 + i), 'OUD ' + i, d.toISOString().slice(0, 10))); }
  for (let i = 0; i < 10; i++) lijst.push(ebTxOp('n' + i, String(3 + i), 'NIEUW ' + i, i % 2 ? '2026-11-19' : '2026-11-20'));
  expect(lijst.length).toBe(250);
  const S = stubFetch({ A: lijst });
  const een = await w.runCron(env(kv), SLOT_MS);                                   // eerste ronde: alles gezien, niets
  const twee = await w.runCron(env(kv), new Date('2026-11-20T16:00:00Z').getTime()); // 17:00, dezelfde boekingen
  S.herstel();
  expect(een.ran && twee.ran).toBe(true);
  expect(S.sent.length).toBe(0);
});

test('v517b worker l: PDNG EUR 150 tanken geeft geen push; de geboekte EUR 62,40 daarna wel', async () => {
  const w = await W(); const kv = fakeKV(); await meldAan(kv);
  await kv.put('seen:dev1:A', JSON.stringify(['x']));
  const pend = ebTxOp('', '150', 'TANGO TANKSTATION', '2026-11-20', { status: 'PDNG' });
  const S = stubFetch({ A: [pend] });
  await w.runCron(env(kv), SLOT_MS);
  expect(S.sent.length).toBe(0);
  const pendZonderDatum = Object.assign({}, pend, { status: undefined, booking_date: undefined, value_date: '2026-11-20' });
  const geboekt = ebTxOp('', '62.40', 'TANGO TANKSTATION', '2026-11-20', { status: 'BOOK' });
  S.herstel(); const S2 = stubFetch({ A: [pendZonderDatum, geboekt] });
  await w.runCron(env(kv), new Date('2026-11-20T16:00:00Z').getTime());
  expect(S2.sent.length).toBe(1);
  const payload = await decryptPush(S2.sent[0].body, w); S2.herstel();
  expect(payload.boekingen.map((b) => [b.naam, b.bedrag])).toEqual([['TANGO TANKSTATION', 62.4]]);
});

test('v517b worker m: VAPID_SUBJECT in wrangler.toml draagt geen mailadres', async () => {
  const toml = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wrangler.toml'), 'utf8');
  const m = /^VAPID_SUBJECT\s*=\s*"([^"]*)"/m.exec(toml);
  expect(m && m[1]).toBe('https://soskovich.github.io/Minder');
  expect(m[1]).not.toContain('@');
  expect(m[1].startsWith('mailto:')).toBe(false);
  const readme = fs.readFileSync(path.join(__dirname, '..', 'worker', 'README.md'), 'utf8');
  expect(readme).not.toMatch(/mailto:/);
});

test('v517b worker n: de sleutel is die van de app (txId met een lege rekening), en dezelfde bank-regel geeft dezelfde sleutel', async () => {
  const w = await W();
  const raw = ebTx('', '12.5', 'ALBERT HEIJN 1234', 'DBIT');
  // de app: hash('' + datum + bedrag.toFixed(2) + desc) + '_' + centen, met desc = [naam, remit, btc].join(' ')
  const desc = ['ALBERT HEIJN 1234', 'ALBERT HEIJN 1234'].join(' ');
  expect(w.boekingSleutel(raw)).toBe(w.appHash('' + '2026-11-20' + (-12.5).toFixed(2) + desc) + '_1250');
  expect(w.boekingSleutel(Object.assign({}, raw, { entry_reference: 'iets anders' }))).toBe(w.boekingSleutel(raw)); // entry_reference doet niet mee
});
