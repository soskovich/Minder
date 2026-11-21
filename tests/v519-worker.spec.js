/* v519: DE WORKER, POST /vraag. In Node met een nep-Anthropic-API en een nep-KV die elke schrijfactie telt. De Worker valideert de opdracht
   van het model (onbekende velden weg, k uit de meegestuurde lijst, geldige datums, venster hooguit 13 maanden) en slaat niets op. */
const { test, expect } = require('./klok');
const path = require('path'); const { pathToFileURL } = require('url');
let _W; async function W() { if (!_W) _W = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'worker.js')).href); return _W; }
function telKV() { const k = { puts: 0, deletes: 0, async get() { return null; }, async put() { k.puts++; }, async delete() { k.deletes++; } }; return k; }
const POTJES = [{ k: 'boodschappen', naam: 'Boodschappen' }, { k: 'vices', naam: 'Vices' }];
/* de nep-API: geeft de meegegeven opdracht als tekstblok terug, en onthoudt het verzoek */
function stubLLM(opdracht, extra) { const echt = globalThis.fetch, gezien = [];
  globalThis.fetch = async (u, opt) => { gezien.push({ url: String(u), body: JSON.parse(opt.body), headers: opt.headers });
    return { ok: true, status: 200, async json() { return Object.assign({ stop_reason: 'end_turn', content: [{ type: 'text', text: typeof opdracht === 'string' ? opdracht : JSON.stringify(opdracht) }] }, extra || {}); } }; };
  return { gezien, terug() { globalThis.fetch = echt; } }; }
async function vraag(env, body) { const { handleFetch } = await W();
  const r = await handleFetch(new Request('https://w.test/vraag', { method: 'POST', headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
  return { status: r.status, json: await r.json() }; }
const ENV = (kv) => ({ APP_TOKEN: 't', LLM_API_KEY: 'k', LLM_MODEL: 'claude-opus-5-5', MINDER_KV: kv });
const BODY = { vraag: 'Hoeveel gaf ik deze week uit aan boodschappen?', potjes: POTJES, vandaag: '2026-11-20' };
const N = { potje: null, venster: null, dag: null, bedrag: null, wat: null };

test('i. een geldige opdracht komt terug zonder onbekende velden; ongeldig schema, onbekend potje of datum geeft onbekend; niets in KV', async () => {
  const kv = telKV();
  let s = stubLLM(Object.assign({}, N, { soort: 'som', potje: 'boodschappen', venster: 'deze_week', geheim: 'x' }));
  try { const r = await vraag(ENV(kv), Object.assign({}, BODY, { extra: 'weg', tx: [{ amount: -50 }] }));
    expect(r.json).toEqual(Object.assign({}, N, { soort: 'som', potje: 'boodschappen', venster: 'deze_week' }));
    const v = s.gezien[0]; expect(v.url).toBe('https://api.anthropic.com/v1/messages'); expect(v.body.model).toBe('claude-opus-5-5');
    expect(v.body.output_config.format.type).toBe('json_schema');
    const msg = JSON.stringify(v.body.messages); expect(msg).not.toContain('amount'); expect(msg).not.toContain('extra');   // alleen vraag, potjes en vandaag naar het model
  } finally { s.terug(); }
  const gevallen = [
    ['ongeldige soort', Object.assign({}, N, { soort: 'advies' })],
    ['geen JSON', 'dit is geen json'],
    ['onbekend potje', Object.assign({}, N, { soort: 'som', potje: 'huur', venster: 'deze_maand' })],
    ['ongeldige datum', Object.assign({}, N, { soort: 'dag', dag: '2026-02-30' })],
    ['venster langer dan 13 maanden', Object.assign({}, N, { soort: 'som', potje: 'vices', venster: { van: '2024-01-01', tot: '2026-11-20' } })],
    ['venster omgekeerd', Object.assign({}, N, { soort: 'som', potje: 'vices', venster: { van: '2026-11-20', tot: '2026-11-01' } })],
    ['onbekend venster', Object.assign({}, N, { soort: 'som', potje: 'vices', venster: 'altijd' })],
    ['som zonder venster', Object.assign({}, N, { soort: 'som', potje: 'vices' })],
  ];
  for (const [naam, o] of gevallen) { s = stubLLM(o); try { expect((await vraag(ENV(kv), BODY)).json, naam).toEqual({ soort: 'onbekend' }); } finally { s.terug(); } }
  s = stubLLM('', { stop_reason: 'refusal', content: [] }); try { expect((await vraag(ENV(kv), BODY)).json).toEqual({ soort: 'onbekend' }); } finally { s.terug(); }
  expect(kv.puts + kv.deletes).toBe(0);
  /* een venster van precies 13 maanden mag wel */
  s = stubLLM(Object.assign({}, N, { soort: 'som', potje: 'vices', venster: { van: '2025-10-20', tot: '2026-11-20' } })); try { expect((await vraag(ENV(kv), BODY)).json.soort).toBe('som'); } finally { s.terug(); }
});

test('j. zonder LLM_API_KEY: 503 "vragen staat niet aan", en er gaat niets naar het model', async () => {
  const kv = telKV(), s = stubLLM(Object.assign({}, N, { soort: 'som', potje: 'vices', venster: 'deze_week' }));
  try { const env = ENV(kv); delete env.LLM_API_KEY; const r = await vraag(env, BODY);
    expect(r.status).toBe(503); expect(r.json.error).toBe('vragen staat niet aan'); expect(s.gezien.length).toBe(0);
  } finally { s.terug(); }
  /* zonder het APP_TOKEN komt hij er niet eens langs */
  const { handleFetch } = await W();
  const r = await handleFetch(new Request('https://w.test/vraag', { method: 'POST', body: '{}' }), ENV(kv)); expect(r.status).toBe(401);
});
