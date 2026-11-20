/* Minder — PSD2-backend (Cloudflare Worker)
 * Tekent de Enable Banking JWT (RS256, server-side want de privésleutel mag NOOIT in de browser)
 * en proxyt alleen de endpoints die de app nodig heeft. Beveiligd met een gedeeld token.
 *
 * Secrets (zie README):
 *   EB_APP_ID        — Application ID uit Enable Banking control panel
 *   EB_PRIVATE_KEY   — de bijbehorende private key (PEM, PKCS#8: "-----BEGIN PRIVATE KEY-----")
 *   APP_TOKEN        — zelfgekozen geheim; ditzelfde token zet je in de app
 * Vars (wrangler.toml):
 *   ALLOWED_ORIGIN   — origin van je app (bv. https://USER.github.io). '*' = alles toestaan.
 *   EB_BASE          — standaard https://api.enablebanking.com
 */

const DEFAULT_BASE = 'https://api.enablebanking.com';

export default {
  async fetch(request, env) {
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
  },
};

/* ---------- JWT (RS256) via Web Crypto ---------- */
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
