/* Minder service worker — v3
   Network-first voor de app-pagina (altijd verse versie als je online bent),
   cache-first voor statische assets (iconen). Werkt offline via de cache.
   v3: backend-/cross-origin-aanroepen (PSD2) NOOIT cachen — altijd live van het netwerk. */
const CACHE='minder-v516';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // cross-origin (bv. de PSD2-backend op workers.dev) niet onderscheppen/cachen → altijd live
  let _u; try { _u = new URL(e.request.url); } catch (_) { return; }
  if (_u.origin !== self.location.origin) return;
  const isHTML = e.request.mode === 'navigate' ||
                 (e.request.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    // network-first: altijd de nieuwste app-pagina proberen, val terug op cache offline
    e.respondWith(
      fetch(e.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
        return resp;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
    );
  } else {
    // cache-first voor iconen e.d.
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          return resp;
        }).catch(() => cached)
      )
    );
  }
});

/* ===== v516: MELDINGEN OP JE TELEFOON (deel 1: het weekbericht) =====
   De worker leest ALLEEN de snapshot die Minder schrijft (IndexedDB 'minder', store 'kv', sleutel 'meldSnap') en rekent niets:
   elk bedrag in de melding staat zo in de snapshot. Regels voor het weekbericht (meldBeslis): alleen op maandag, nooit tussen 22:00 en
   07:00, hooguit een melding per dag en een weekbericht per week (meldLaatst), en nooit bij een snapshot ouder dan 3 dagen, want dan
   klopt hij niet meer. Een tik opent Minder op Inzichten. De testmelding (vanuit Instellingen) toont meteen wat de snapshot zegt en
   telt niet mee voor de regels. */
const MELD_STIL_VANAF = 22, MELD_STIL_TOT = 7, MELD_MAX_OUD = 3 * 86400000;
const MELD_MND = ['jan','feb','mrt','apr','mei','jun','jul','aug','sep','okt','nov','dec'];
const MELD_WD = ['zo','ma','di','wo','do','vr','za'];
function meldYmd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function meldMaandag(d) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return meldYmd(x); }
function meldEuro(v) { return '€' + String(Math.round(Math.abs(+v || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function meldDag(ymd) { const [j, m, d] = String(ymd).slice(0, 10).split('-').map(Number); const x = new Date(j, m - 1, d); return MELD_WD[x.getDay()] + ' ' + d + ' ' + MELD_MND[m - 1]; }
function meldVorigeZin(v) {
  if (!v || v.nog == null) return '';
  const stand = (v.op && v.weekTot && String(v.op).slice(0, 10) < v.weekTot) ? ' (stand van ' + meldDag(v.op) + ')' : '';
  return 'Vorige week bleef je ' + meldEuro(v.nog) + ' ' + ((+v.nog) < 0 ? 'boven' : 'onder') + stand + '.';
}
/* Twee vormen. De snapshot is van DEZE week: "Nieuwe week · EUR X" met wat er vorige week over was. De snapshot is van de week ervoor
   (Minder is sinds vorige week niet geopend): het weekbedrag van deze week staat dan nergens, dus alleen vorige week. */
function meldWeekTekst(snap, nuMs) {
  const vd = meldYmd(new Date(nuMs));
  if (snap.weekVan <= vd && vd <= snap.weekTot) {
    const v = meldVorigeZin(snap.vorige);
    return { titel: 'Nieuwe week · ' + meldEuro(snap.weekbedrag), body: v };
  }
  if (snap.weekTot < vd) {
    return { titel: 'Nieuwe week', body: meldVorigeZin({ weekVan: snap.weekVan, weekTot: snap.weekTot, nog: snap.weekNog, op: snap.op }) + ' Open Minder voor je weekbedrag van deze week.' };
  }
  return null;
}
function meldBeslis(snap, laatst, nuMs) {
  const d = new Date(nuMs), h = d.getHours(), vd = meldYmd(d), wk = meldMaandag(d); laatst = laatst || {};
  if (!snap || !snap.opMs) return { toon: false, reden: 'geen stand' };
  if (h >= MELD_STIL_VANAF || h < MELD_STIL_TOT) return { toon: false, reden: 'stille uren' };
  if (d.getDay() !== 1) return { toon: false, reden: 'geen maandag' };
  if (nuMs - snap.opMs > MELD_MAX_OUD) return { toon: false, reden: 'stand ouder dan 3 dagen' };
  if (laatst.dag === vd) return { toon: false, reden: 'vandaag al een melding' };
  if (laatst.week === wk) return { toon: false, reden: 'deze week al een weekbericht' };
  const T = meldWeekTekst(snap, nuMs); if (!T) return { toon: false, reden: 'geen tekst' };
  return { toon: true, titel: T.titel, body: T.body, laatst: { dag: vd, week: wk, opMs: nuMs, soort: 'week' } };
}
function meldTestTekst(snap) {
  const nog = +snap.weekNog || 0;
  const titel = 'Testmelding · deze week ' + (nog < 0 ? meldEuro(nog) + ' erover' : 'nog ' + meldEuro(nog)) + ' van ' + meldEuro(snap.weekbedrag);
  const pot = (snap.potjes || []).map(x => x.naam + ': ' + ((+x.nog) < 0 ? meldEuro(x.nog) + ' erover' : 'nog ' + meldEuro(x.nog))).join(' · ');
  return { titel, body: (pot ? pot + '\n' : '') + 'Stand van ' + meldDag(snap.op) + ' ' + String(snap.op).slice(11, 16) };
}
function swDb() { return new Promise((res, rej) => { const r = indexedDB.open('minder', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function swKvGet(k) { const db = await swDb(); return new Promise((res, rej) => { const q = db.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
async function swKvSet(k, v) { const db = await swDb(); return new Promise((res, rej) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }); }
const MELD_OPT = { icon: './icon-192.png', badge: './icon-192.png', data: { scherm: 'ins' } };
async function meldWeekbericht(nuMs) {
  let snap = null, laatst = null; try { snap = await swKvGet('meldSnap'); laatst = await swKvGet('meldLaatst'); } catch (_) {}
  const B = meldBeslis(snap, laatst, nuMs); if (!B.toon) return B;
  await self.registration.showNotification(B.titel, Object.assign({ body: B.body, tag: 'minder-week' }, MELD_OPT));
  try { await swKvSet('meldLaatst', B.laatst); } catch (_) {}
  return B;
}
async function meldTestbericht() {
  let snap = null; try { snap = await swKvGet('meldSnap'); } catch (_) {}
  if (!snap) return { toon: false, reden: 'geen stand' };
  const T = meldTestTekst(snap);
  await self.registration.showNotification(T.titel, Object.assign({ body: T.body, tag: 'minder-test' }, MELD_OPT));
  return Object.assign({ toon: true }, T);
}
self.addEventListener('periodicsync', e => { if (e.tag === 'minder-week') e.waitUntil(meldWeekbericht(Date.now())); });
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'meld-week') e.waitUntil(meldWeekbericht(Date.now()));
  else if (d.type === 'meld-test') e.waitUntil(meldTestbericht());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    for (const c of cs) { if ('focus' in c) { c.postMessage({ type: 'open', scherm: 'ins' }); return c.focus(); } }
    return self.clients.openWindow('./index.html?scherm=ins');
  }));
});
