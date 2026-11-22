/* v520: DE WORKER. o/p: de Psu-headers gaan mee op de app-routes en NIET in de cron (fetchTx). q: wrangler.toml past binnen de 5
   cron-triggers van Workers Free, en per Amsterdamse dag draait runCron hooguit 3 keer (rond 12:00, 17:00 en 20:30), gesimuleerd over
   een jaar met zomer- en wintertijd. i: de zes nieuwe soorten en zoektermen in /vraag. In Node, met een nep-Enable-Banking en nep-KV. */
const { test, expect } = require('./klok');
const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
let _W; async function W() { if (!_W) _W = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'worker.js')).href); return _W; }
function fakeKV() { const m = new Map(); return { store: m, async get(k) { return m.has(k) ? m.get(k) : null; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } }; }
let EB_PEM;
test.beforeAll(async () => {
  const subtle = globalThis.crypto.subtle;
  const rsa = await subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  EB_PEM = '-----BEGIN PRIVATE KEY-----\n' + Buffer.from(await subtle.exportKey('pkcs8', rsa.privateKey)).toString('base64').replace(/(.{64})/g, '$1\n') + '\n-----END PRIVATE KEY-----';
});
const env = (kv, x) => Object.assign({ MINDER_KV: kv, EB_APP_ID: 'app-1', EB_PRIVATE_KEY: EB_PEM, EB_BASE: 'https://eb.test', APP_TOKEN: 't' }, x || {});
function stubEB() { const echt = globalThis.fetch, gezien = [];
  globalThis.fetch = async (u, opt) => { gezien.push({ url: String(u), headers: Object.assign({}, (opt || {}).headers || {}) });
    return { ok: true, status: 200, async json() { return { transactions: [], aspsps: [] }; } }; };
  return { gezien, terug() { globalThis.fetch = echt; } }; }

test('o. een app-route stuurt Psu-Ip-Address en Psu-User-Agent mee als de request ze heeft', async () => {
  const w = await W(), s = stubEB();
  try {
    for (const p of ['/aspsps?country=NL', '/accounts/U1/transactions?date_from=2026-11-01', '/accounts/U1/balances']) {
      await w.handleFetch(new Request('https://w.test' + p, { headers: { Authorization: 'Bearer t', 'CF-Connecting-IP': '203.0.113.7', 'User-Agent': 'Mozilla/5.0 Minder' } }), env(fakeKV()));
    }
    expect(s.gezien.length).toBe(3);
    for (const g of s.gezien) { expect(g.headers['Psu-Ip-Address'], g.url).toBe('203.0.113.7'); expect(g.headers['Psu-User-Agent'], g.url).toBe('Mozilla/5.0 Minder'); }
    /* zonder die headers in de request: ook geen Psu-headers naar de bank (niets verzonnen) */
    s.gezien.length = 0;
    await w.handleFetch(new Request('https://w.test/aspsps', { headers: { Authorization: 'Bearer t' } }), env(fakeKV()));
    expect('Psu-Ip-Address' in s.gezien[0].headers).toBe(false);
  } finally { s.terug(); }
});

test('p. de cron-ronde (runCron/fetchTx) stuurt GEEN Psu-headers', async () => {
  const w = await W(), s = stubEB(), kv = fakeKV();
  await kv.put('devices', JSON.stringify(['d1']));
  await kv.put('device:d1', JSON.stringify({ accounts: ['A', 'B'], subscription: { endpoint: 'https://push.test/x', keys: { p256dh: 'x', auth: 'y' } } }));
  try {
    const r = await w.runCron(env(kv), Date.parse('2026-11-20T11:00:00Z'));   // 12:00 Amsterdam (wintertijd)
    expect(r.ran).toBe(true);
    const eb = s.gezien.filter((g) => g.url.startsWith('https://eb.test/'));
    expect(eb.length).toBe(2);   // een aanroep per rekening
    for (const g of eb) { expect(Object.keys(g.headers).filter((h) => /^psu-/i.test(h))).toEqual([]); }
  } finally { s.terug(); }
});

/* de crons uit wrangler.toml: "M H * * *" met komma-lijsten */
function crons(toml) { const m = /^crons\s*=\s*\[([^\]]*)\]/m.exec(toml); return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : []; }
function vuurt(expr, d) { const [mi, uu] = expr.split(/\s+/); const lijst = (f) => f === '*' ? null : f.split(',').map(Number);
  const M = lijst(mi), H = lijst(uu); return (!M || M.includes(d.getUTCMinutes())) && (!H || H.includes(d.getUTCHours())); }
async function simuleer(lijst) { const w = await W(), kv = fakeKV(), perDag = {}, slotsPerDag = {};
  const start = Date.parse('2026-01-01T00:00:00Z'), eind = Date.parse('2027-01-01T00:00:00Z');
  for (let t = start; t < eind; t += 30 * 60000) { const d = new Date(t); if (!lijst.some((e) => vuurt(e, d))) continue;
    const r = await w.runCron({ MINDER_KV: kv }, t); if (!r.ran) continue;
    perDag[r.ymd] = (perDag[r.ymd] || 0) + 1; (slotsPerDag[r.ymd] = slotsPerDag[r.ymd] || []).push(r.idx); }
  return { perDag, slotsPerDag }; }
test('q. wrangler.toml: hooguit 5 cron-expressies, en per Amsterdamse dag hooguit 3 rondes rond 12:00, 17:00 en 20:30, ook over DST', async () => {
  const toml = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wrangler.toml'), 'utf8'), L = crons(toml);
  expect(L.length).toBeGreaterThan(0); expect(L.length).toBeLessThanOrEqual(5);
  const { perDag, slotsPerDag } = await simuleer(L);
  const dagen = Object.keys(perDag);
  expect(dagen.length).toBeGreaterThanOrEqual(364);
  for (const d of dagen) { expect(perDag[d], d).toBeLessThanOrEqual(3); }
  /* elke dag de drie slots, in zomer- en wintertijd (29 mrt en 25 okt 2026 zijn de wisseldagen) */
  for (const d of ['2026-01-15', '2026-03-28', '2026-03-30', '2026-07-15', '2026-10-24', '2026-10-26', '2026-12-15']) expect(slotsPerDag[d], d).toEqual([0, 1, 2]);
  /* GEEN DODE EXPRESSIE: elk uur van elke expressie valt in zomer- OF wintertijd op een slot (anders is het een trigger die nooit iets doet) */
  const w = await W();
  for (const e of L) { const [mi, uu] = e.split(/\s+/); for (const h of uu.split(',').map(Number)) for (const m of mi.split(',').map(Number)) {
    const z = w.amsterdamSlot(new Date(Date.UTC(2026, 6, 15, h, m))).idx, wi = w.amsterdamSlot(new Date(Date.UTC(2026, 0, 15, h, m))).idx;
    expect(z >= 0 || wi >= 0, `${e} om ${h}:${m} UTC`).toBe(true); } }
  /* en wat live staat: VAPID, KV en het model */
  expect(/^VAPID_PUBLIC\s*=\s*"BDzhkxNKmx[^"]+"/m.test(toml)).toBe(true);
  expect(/^id\s*=\s*"f0732ce091364259bca23ab5ff9dd443"/m.test(toml)).toBe(true);
  expect(/^LLM_MODEL\s*=\s*"claude-haiku-5-5"/m.test(toml)).toBe(true);
});

/* ---- /vraag ---- */
const POTJES = [{ k: 'uiteten', naam: 'Uit eten' }, { k: 'boodschappen', naam: 'Boodschappen' }];
const N = { potje: null, venster: null, dag: null, bedrag: null, wat: null };
function stubLLM(opdracht) { const echt = globalThis.fetch, gezien = [];
  globalThis.fetch = async (u, opt) => { gezien.push({ url: String(u), body: JSON.parse(opt.body) });
    return { ok: true, status: 200, async json() { return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(opdracht) }] }; } }; };
  return { gezien, terug() { globalThis.fetch = echt; } }; }
async function vraag(o) { const w = await W(), s = stubLLM(o);
  try { const r = await w.handleFetch(new Request('https://w.test/vraag', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: JSON.stringify({ vraag: 'x', potjes: POTJES, vandaag: '2026-11-20' }) }), { APP_TOKEN: 't', LLM_API_KEY: 'k', LLM_MODEL: 'claude-haiku-5-5' });
    return { json: await r.json(), gezien: s.gezien }; } finally { s.terug(); } }
test('i. de zes nieuwe soorten en zoektermen worden gevalideerd; >5 of >40 tekens ingekort; onbekende soort is onbekend', async () => {
  for (const soort of ['weekdag', 'eenmalig', 'naOverschrijding', 'contantRitme']) expect((await vraag(Object.assign({}, N, { soort, zoektermen: null }))).json, soort).toEqual(Object.assign({}, N, { soort }));
  expect((await vraag(Object.assign({}, N, { soort: 'weekdag', potje: 'uiteten', zoektermen: null }))).json.potje).toBe('uiteten');
  const t = (await vraag(Object.assign({}, N, { soort: 'tegenpartij', zoektermen: ['  thuisbezorgd ', 'u'.repeat(60), 'a', 'b', 'c', 'd', 42, ''] }))).json;
  expect(t.zoektermen).toEqual(['thuisbezorgd', 'u'.repeat(40), 'a', 'b', 'c']);
  expect((await vraag(Object.assign({}, N, { soort: 'drempel', bedrag: 10, zoektermen: ['x'] }))).json).toEqual(Object.assign({}, N, { soort: 'drempel', bedrag: 10 }));   // zoektermen alleen bij tegenpartij
  for (const [naam, o] of [['tegenpartij zonder termen', Object.assign({}, N, { soort: 'tegenpartij', zoektermen: [] })], ['tegenpartij zonder lijst', Object.assign({}, N, { soort: 'tegenpartij', zoektermen: 'bezorging' })],
    ['drempel zonder bedrag', Object.assign({}, N, { soort: 'drempel', zoektermen: null })], ['onbekende soort', Object.assign({}, N, { soort: 'patroon' })], ['weekdag met vreemd potje', Object.assign({}, N, { soort: 'weekdag', potje: 'huur' })]])
    expect((await vraag(o)).json, naam).toEqual({ soort: 'onbekend' });
  /* het schema dat naar het model gaat kent de nieuwe soorten en het veld zoektermen */
  const g = (await vraag(Object.assign({}, N, { soort: 'eenmalig' }))).gezien[0].body;
  const sch = g.output_config.format.schema;
  expect(sch.properties.soort.enum).toEqual(expect.arrayContaining(['weekdag', 'tegenpartij', 'drempel', 'eenmalig', 'naOverschrijding', 'contantRitme']));
  expect(sch.required).toContain('zoektermen');
  expect(g.model).toBe('claude-haiku-5-5');
});
