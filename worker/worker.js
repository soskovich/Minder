/* Minder — PSD2-backend (Cloudflare Worker)
 * Tekent de Enable Banking JWT (RS256, server-side want de privésleutel mag NOOIT in de browser)
 * en proxyt alleen de endpoints die de app nodig heeft. Beveiligd met een gedeeld token.
 *
 * Secrets (zie README):
 *   EB_APP_ID        — Application ID uit Enable Banking control panel
 *   EB_PRIVATE_KEY   — de bijbehorende private key (PEM, PKCS#8: "-----BEGIN PRIVATE KEY-----")
 *   APP_TOKEN        — zelfgekozen geheim; ditzelfde token zet je in de app
 *   VAPID_PRIVATE    — v517: privésleutel voor Web Push (base64url van de 32-byte d)
 *   LLM_API_KEY      — optioneel, alleen voor /coach
 * Vars (wrangler.toml):
 *   ALLOWED_ORIGIN   — origin van je app (bv. https://USER.github.io). '*' = alles toestaan.
 *   EB_BASE          — standaard https://api.enablebanking.com
 *   VAPID_PUBLIC     — v517: publieke Web Push-sleutel (base64url van het 65-byte punt)
 *   VAPID_SUBJECT    — v517: mailto:... of https://... voor de VAPID-JWT
 * KV (wrangler.toml):
 *   MINDER_KV        — v517: push-abonnement, sessie/rekening-ID's, gehashte geziene boeking-ID's,
 *                      tijd van de laatste ophaalronde. GEEN bedragen, GEEN namen, GEEN saldi.
 * Cron (wrangler.toml):
 *   3x per dag (12:00, 17:00, 20:30 Europe/Amsterdam): per rekening één ophaalactie, zonder PSU-headers.
 */

const DEFAULT_BASE = 'https://api.enablebanking.com';

/* ===== v517: BETAALMELDING — de constanten ===== */
const PUSH_RS = 4096;                                   // record size (RFC 8188)
const PUSH_MAX = 10;                                    // hooguit 10 boekingen per push
const PUSH_MAX_BYTES = 4096;                            // de versleutelde payload blijft ≤ 4 KB
const SEEN_MAX = 200;                                   // hooguit 200 gehashte boeking-id's per rekening
const SLOT_TTL = 2 * 86400;                             // de slot-grendel leeft 2 dagen
const SLOTS = [{ h: 12, m: 0 }, { h: 17, m: 0 }, { h: 20, m: 30 }]; // Europe/Amsterdam

async function handleFetch(request, env) {
  const origin = env.ALLOWED_ORIGIN || '*';
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type',
    'Access-Control-Max-Age': '86400',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  // --- beveiliging: gedeeld token ---
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!env.APP_TOKEN || token !== env.APP_TOKEN) return json({ error: 'unauthorized' }, 401);

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const base = env.EB_BASE || DEFAULT_BASE;

  // --- v517: push-abonnement aanmelden / afmelden / status (achter het APP_TOKEN, geen EB-keys nodig) ---
  if (request.method === 'POST' && path.endsWith('/push/aanmelden')) {
    let b = {}; try { b = await request.json(); } catch (_) {}
    if (!b.subscription || !b.subscription.endpoint || !(b.subscription.keys && b.subscription.keys.p256dh && b.subscription.keys.auth))
      return json({ error: 'geen geldig abonnement' }, 400);
    if (!env.MINDER_KV) return json({ error: 'geen KV' }, 500);
    const id = await hashId(b.subscription.endpoint);
    const dev = { subscription: b.subscription, accounts: (b.accounts || b.uids || []).map(String),
      sessie: b.sessie || null, geldigTot: b.geldigTot || null, aangemeld: Date.now(), status: 'nieuw' };
    await env.MINDER_KV.put('device:' + id, JSON.stringify(dev));
    const devices = JSON.parse(await env.MINDER_KV.get('devices') || '[]');
    if (!devices.includes(id)) { devices.push(id); await env.MINDER_KV.put('devices', JSON.stringify(devices)); }
    return json({ ok: true, id });
  }
  if (request.method === 'POST' && path.endsWith('/push/afmelden')) {
    let b = {}; try { b = await request.json(); } catch (_) {}
    const id = b.id || (b.subscription && b.subscription.endpoint ? await hashId(b.subscription.endpoint) : null);
    if (!id) return json({ error: 'geen id' }, 400);
    if (!env.MINDER_KV) return json({ error: 'geen KV' }, 500);
    const dev = JSON.parse(await env.MINDER_KV.get('device:' + id) || 'null');
    if (dev) { for (const uid of (dev.accounts || [])) await env.MINDER_KV.delete('seen:' + id + ':' + uid); }
    await env.MINDER_KV.delete('device:' + id);
    const devices = (JSON.parse(await env.MINDER_KV.get('devices') || '[]')).filter((x) => x !== id);
    await env.MINDER_KV.put('devices', JSON.stringify(devices));
    return json({ ok: true });
  }
  if (request.method === 'GET' && path.endsWith('/push/vapid')) {
    return json({ publicKey: env.VAPID_PUBLIC || null }); // publiek; de app abonneert hiermee
  }
  if (request.method === 'GET' && path.endsWith('/push/status')) {
    if (!env.MINDER_KV) return json({ aangemeld: false, reden: 'geen KV' });
    const id = url.searchParams.get('id');
    const dev = id ? JSON.parse(await env.MINDER_KV.get('device:' + id) || 'null') : null;
    if (!dev) return json({ aangemeld: false });
    // GEEN geheimen terug: geen subscription-keys, geen seen-hashes. Alleen aantallen en datums.
    return json({ aangemeld: true, rekeningen: (dev.accounts || []).length, laatsteRonde: dev.laatsteRonde || null,
      geldigTot: dev.geldigTot || null, status: dev.status || 'ok',
      verlopen: dev.geldigTot ? new Date(dev.geldigTot).getTime() < Date.now() : false });
  }

  // --- AI-coach: een taalmodel verwoordt de coach-zin (hybride; de app levert alle cijfers) ---
  // Secret: LLM_API_KEY. Var (optioneel): LLM_MODEL. Geen Enable-Banking-keys nodig voor dit endpoint.
  if (request.method === 'POST' && path.endsWith('/coach')) {
    if (!env.LLM_API_KEY) return json({ error: 'no LLM key' }, 500);
    let cb = {}; try { cb = await request.json(); } catch (_) {}
    const draft = String(cb.draft || '').slice(0, 500);
    if (!draft) return json({ text: '' });
    const facts = JSON.stringify(cb.facts || {}).slice(0, 2000);
    const model = String(cb.model || env.LLM_MODEL || 'claude-3-5-haiku-latest');
    const sys = String(cb.spec || '').slice(0, 2000);
    const userMsg = `Cijfers (alleen ter info, niet verzinnen):\n${facts}\n\nHerschrijf deze draft in de gevraagde toon, behoud alle bedragen exact:\n${draft}`;
    try {
      const lr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.LLM_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 160, temperature: 0.6, system: sys,
          messages: [{ role: 'user', content: userMsg }] }),
      });
      const ld = await lr.json();
      const text = String((((ld || {}).content || [])[0] || {}).text || '').trim();
      return json({ text });
    } catch (e) { return json({ error: 'llm failed' }, 502); }
  }

  try {
    const jwt = await makeJWT(env);
    const ebHeaders = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };

    // 1) lijst van banken (ASPSP's) voor een land
    if (request.method === 'GET' && path.endsWith('/aspsps')) {
      const country = url.searchParams.get('country') || 'NL';
      const r = await fetch(`${base}/aspsps?country=${encodeURIComponent(country)}`, { headers: ebHeaders });
      return json(await r.json(), r.status);
    }

    // 2) start autorisatie → geeft een bank-redirect-URL terug
    if (request.method === 'POST' && path.endsWith('/auth')) {
      const body = await request.json();
      const validDays = Math.min(Math.max(+body.valid_days || 90, 1), 180);
      const validUntil = new Date(Date.now() + validDays * 86400000).toISOString();
      const payload = {
        access: { valid_until: validUntil },
        aspsp: { name: body.aspsp.name, country: body.aspsp.country || 'NL' },
        state: body.state,
        redirect_url: body.redirect_url,
        psu_type: 'personal',
      };
      const r = await fetch(`${base}/auth`, { method: 'POST', headers: ebHeaders, body: JSON.stringify(payload) });
      return json(await r.json(), r.status);
    }

    // 3) sessie aanmaken na consent (code uit de redirect) → accounts
    if (request.method === 'POST' && path.endsWith('/sessions')) {
      const body = await request.json();
      const r = await fetch(`${base}/sessions`, {
        method: 'POST', headers: ebHeaders, body: JSON.stringify({ code: body.code }),
      });
      return json(await r.json(), r.status);
    }

    // 4) transacties van één account (met paginatie via continuation_key)
    let m = path.match(/\/accounts\/([^/]+)\/transactions$/);
    if (request.method === 'GET' && m) {
      const uid = decodeURIComponent(m[1]);
      const qs = new URLSearchParams();
      if (url.searchParams.get('date_from')) qs.set('date_from', url.searchParams.get('date_from'));
      if (url.searchParams.get('continuation_key')) qs.set('continuation_key', url.searchParams.get('continuation_key'));
      if (url.searchParams.get('transaction_status')) qs.set('transaction_status', url.searchParams.get('transaction_status'));
      const r = await fetch(`${base}/accounts/${encodeURIComponent(uid)}/transactions?${qs}`, { headers: ebHeaders });
      return json(await r.json(), r.status);
    }

    // 5) saldo van één account
    m = path.match(/\/accounts\/([^/]+)\/balances$/);
    if (request.method === 'GET' && m) {
      const uid = decodeURIComponent(m[1]);
      const r = await fetch(`${base}/accounts/${encodeURIComponent(uid)}/balances`, { headers: ebHeaders });
      return json(await r.json(), r.status);
    }

    return json({ error: 'not_found', path }, 404);
  } catch (e) {
    return json({ error: 'proxy_error', detail: String(e && e.message || e) }, 502);
  }
}

export default {
  async fetch(request, env) { return handleFetch(request, env); },
  // v517: de cron haalt 3x per dag per rekening op en stuurt een versleutelde Web Push bij een nieuwe uitgaande boeking.
  async scheduled(event, env, ctx) { ctx.waitUntil(runCron(env, Date.now())); },
};

/* ===== JWT (RS256) via Web Crypto — Enable Banking ===== */
let KEY_CACHE = null;
async function importKey(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}
function b64url(bytes) {
  let s = typeof bytes === 'string' ? btoa(bytes) : btoa(String.fromCharCode(...new Uint8Array(bytes)));
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function makeJWT(env) {
  if (!env.EB_APP_ID || !env.EB_PRIVATE_KEY) throw new Error('EB_APP_ID / EB_PRIVATE_KEY ontbreekt');
  if (!KEY_CACHE) KEY_CACHE = await importKey(env.EB_PRIVATE_KEY);
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'RS256', kid: env.EB_APP_ID };
  const payload = { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat: now - 5, exp: now + 3600 };
  const enc = o => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = `${enc(header)}.${enc(payload)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', KEY_CACHE,
    new TextEncoder().encode(signingInput));
  return `${signingInput}.${b64url(sig)}`;
}

/* ===== v517: Web Push (RFC 8291 aes128gcm + VAPID RFC 8292) via Web Crypto — geen npm-dependency =====
   De payload per push: alleen id, datum, bedrag en tegenpartij-naam, hooguit 10 boekingen, en versleuteld met de
   sleutels van het toestel (p256dh + auth uit het abonnement). Niets daarvan staat in KV. */
function b64urlToBytes(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function bytesToB64url(bytes) {
  const u = new Uint8Array(bytes); let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concatBytes(...arrs) {
  let n = 0; for (const a of arrs) n += a.length;
  const out = new Uint8Array(n); let o = 0;
  for (const a of arrs) { out.set(a, o); o += a.length; }
  return out;
}
async function hashId(id) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(id))));
  return bytesToB64url(h).slice(0, 22); // 128 bits, genoeg om botsingen te vermijden
}
async function hmacSha256(keyBytes, dataBytes) {
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, dataBytes));
}
// HKDF met één blok (L ≤ 32): Extract (HMAC met de salt) + Expand (HMAC(prk, info || 0x01))
async function hkdf(salt, ikm, info, len) {
  const prk = await hmacSha256(salt, ikm);
  const t = await hmacSha256(prk, concatBytes(info, new Uint8Array([1])));
  return t.slice(0, len);
}

/* VAPID-JWT (ES256). De publieke sleutel is het 65-byte punt (base64url); de privé is de 32-byte d (base64url). */
async function vapidJwt(audience, env) {
  const pub = b64urlToBytes(env.VAPID_PUBLIC);
  const jwk = { kty: 'EC', crv: 'P-256', ext: true,
    x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), d: env.VAPID_PRIVATE };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = { typ: 'JWT', alg: 'ES256' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { aud: audience, exp: now + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:minder@localhost' };
  const enc = o => bytesToB64url(new TextEncoder().encode(JSON.stringify(o)));
  const signingInput = enc(header) + '.' + enc(payload);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(signingInput));
  return signingInput + '.' + bytesToB64url(new Uint8Array(sig));
}

/* De body van een aes128gcm Web Push: header(salt||rs||idlen||keyid) + AES-128-GCM(record), één record. */
async function webPushEncrypt(p256dhB64, authB64, plaintextBytes) {
  const uaPublic = b64urlToBytes(p256dhB64);   // 65 bytes
  const authSecret = b64urlToBytes(authB64);   // 16 bytes
  const asKeys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', asKeys.publicKey)); // 65 bytes
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asKeys.privateKey, 256)); // 32 bytes
  const te = new TextEncoder();
  const ikm = await hkdf(authSecret, ecdh, concatBytes(te.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, concatBytes(te.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concatBytes(te.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);
  const record = concatBytes(plaintextBytes, new Uint8Array([2])); // één record, delimiter 0x02 (laatste)
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aesKey, record));
  const rs = new Uint8Array([(PUSH_RS >>> 24) & 255, (PUSH_RS >>> 16) & 255, (PUSH_RS >>> 8) & 255, PUSH_RS & 255]);
  const header = concatBytes(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return concatBytes(header, ct);
}

async function sendPush(sub, payloadObj, env) {
  const endpoint = sub.endpoint;
  const audience = new URL(endpoint).origin;
  const jwt = await vapidJwt(audience, env);
  const plaintext = new TextEncoder().encode(JSON.stringify(payloadObj));
  const body = await webPushEncrypt(sub.keys.p256dh, sub.keys.auth, plaintext);
  if (body.length > PUSH_MAX_BYTES) return { status: 0, ok: false, reden: 'te groot' };
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: '86400',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: 'vapid t=' + jwt + ', k=' + env.VAPID_PUBLIC,
    },
    body,
  });
  return { status: r.status, ok: r.ok };
}

/* ===== v517: de ophaalronde ===== */
function mapBoeking(raw) {
  const amtObj = raw.transaction_amount || raw.amount || {};
  const val = parseFloat(amtObj.amount); if (isNaN(val)) return null;
  const cdi = (raw.credit_debit_indicator || '').toUpperCase();
  if (cdi !== 'DBIT') return null; // alleen uitgaande boekingen
  const date = (raw.booking_date || raw.value_date || raw.transaction_date || '').slice(0, 10);
  if (!date) return null;
  const remit = Array.isArray(raw.remittance_information) ? raw.remittance_information.join(' ') : (raw.remittance_information || '');
  const cp = raw.creditor || {};
  const naam = ((cp.name || '').trim() || String(remit).slice(0, 42).trim() || 'Transactie').replace(/\s+/g, ' ').slice(0, 44);
  const id = String(raw.entry_reference || raw.transaction_id || (date + '|' + val + '|' + naam));
  return { id, datum: date, bedrag: Math.round(Math.abs(val) * 100) / 100, naam };
}
function amsterdamParts(d) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = {}; for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
  const hh = p.hour === '24' ? '00' : p.hour;
  return { ymd: p.year + '-' + p.month + '-' + p.day, h: +hh, m: +p.minute };
}
function amsterdamSlot(d) {
  const p = amsterdamParts(d); const mins = p.h * 60 + p.m;
  for (let i = 0; i < SLOTS.length; i++) { const sm = SLOTS[i].h * 60 + SLOTS[i].m; if (Math.abs(mins - sm) <= 30) return { ymd: p.ymd, idx: i }; }
  return { ymd: p.ymd, idx: -1 };
}
async function fetchTx(uid, env, base) {
  const jwt = await makeJWT(env);
  const r = await fetch(base + '/accounts/' + encodeURIComponent(uid) + '/transactions', { headers: { Authorization: 'Bearer ' + jwt } });
  if (!r.ok) return { error: r.status };
  const d = await r.json().catch(() => ({}));
  return { transactions: d.transactions || [] };
}

async function runCron(env, nowMs) {
  if (!env.MINDER_KV) return { ran: false, reden: 'geen KV' };
  const slot = amsterdamSlot(new Date(nowMs));
  if (slot.idx < 0) return { ran: false, reden: 'geen slot' };
  const slotKey = 'slot:' + slot.ymd + ':' + slot.idx;
  if (await env.MINDER_KV.get(slotKey)) return { ran: false, reden: 'slot al gedraaid' };
  await env.MINDER_KV.put(slotKey, '1', { expirationTtl: SLOT_TTL }); // grendel eerst: bij een fout liever te weinig dan te veel aanroepen
  const base = env.EB_BASE || DEFAULT_BASE;
  const devices = JSON.parse(await env.MINDER_KV.get('devices') || '[]');
  const uitkomst = [];
  for (const id of devices) {
    const dev = JSON.parse(await env.MINDER_KV.get('device:' + id) || 'null'); if (!dev) continue;
    if (dev.geldigTot && new Date(dev.geldigTot).getTime() < nowMs) {
      dev.status = 'verlopen'; await env.MINDER_KV.put('device:' + id, JSON.stringify(dev));
      uitkomst.push({ device: id, verlopen: true }); continue; // verlopen sessie: niets sturen, alleen de status
    }
    const nieuw = [];
    for (const uid of (dev.accounts || [])) {
      const res = await fetchTx(uid, env, base);
      if (res.error) continue; // weigering/verlopen op deze rekening: niets sturen
      const boekingen = (res.transactions || []).map(mapBoeking).filter(Boolean);
      const hashes = []; for (const b of boekingen) hashes.push(await hashId(b.id));
      const seenKey = 'seen:' + id + ':' + uid;
      const seenRaw = await env.MINDER_KV.get(seenKey);
      if (seenRaw === null) {
        // eerste ronde na aanmelden: alles als gezien markeren en niets sturen
        await env.MINDER_KV.put(seenKey, JSON.stringify(hashes.slice(-SEEN_MAX)));
        continue;
      }
      const seenArr = JSON.parse(seenRaw); const seen = new Set(seenArr);
      for (let i = 0; i < boekingen.length; i++) if (!seen.has(hashes[i])) nieuw.push(boekingen[i]);
      const nieuweHashes = hashes.filter((h) => !seen.has(h));
      await env.MINDER_KV.put(seenKey, JSON.stringify(seenArr.concat(nieuweHashes).slice(-SEEN_MAX)));
    }
    if (nieuw.length) {
      const payload = { t: 'betaal', boekingen: nieuw.slice(0, PUSH_MAX) };
      try { const pr = await sendPush(dev.subscription, payload, env); uitkomst.push({ device: id, verstuurd: payload.boekingen.length, status: pr.status }); }
      catch (e) { uitkomst.push({ device: id, fout: String(e && e.message || e).slice(0, 80) }); }
    } else { uitkomst.push({ device: id, verstuurd: 0 }); }
    dev.laatsteRonde = nowMs; dev.status = 'ok';
    await env.MINDER_KV.put('device:' + id, JSON.stringify(dev));
  }
  return { ran: true, ymd: slot.ymd, idx: slot.idx, uitkomst };
}

/* Named exports voor de tests (geen secrets; puur de rekenkern). */
export { handleFetch, runCron, sendPush, webPushEncrypt, vapidJwt, mapBoeking, hashId, amsterdamSlot, hkdf, b64urlToBytes, bytesToB64url, concatBytes };
