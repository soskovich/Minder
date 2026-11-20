/* v516: DE ECHTE SERVICE WORKER, in de volle Chromium (de headless-variant weigert meldingen, gemeten). Een eigen bestand, want
   channel en serviceWorkers gelden per worker. De rest van v516 staat in v516.spec.js. */
const { test, expect } = require('./klok');
const fs = require('fs'); const path = require('path');
const K = require('./v516-stand');
test.use({ channel: 'chromium', serviceWorkers: 'allow', permissions: ['notifications'] });
/* ---- de echte service worker (volle Chromium: de headless-variant weigert meldingen) ---- */
  async function opnieuw(page, fn, arg) { for (let i = 0; i < 20; i++) { try { return await page.evaluate(fn, arg); } catch (e) { if (!/destroyed|navigat/i.test(e.message)) throw e; await page.waitForTimeout(250); } } }
  async function klaar(page) { await page.waitForFunction(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller), null, { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('load'); await page.waitForTimeout(300); await opnieuw(page, () => typeof meldTest === 'function'); await K.zaai(page); }

  test('v516 j: de testmelding toont de echte snapshot', async ({ page }) => {
    await K.boot(page, { metSw: true, set: { meldPotjes: { boodschappen: true } } }); await klaar(page);
    await opnieuw(page, () => meldAanZet(true));
    const r = await opnieuw(page, async () => { const ok = await meldTest(); const reg = await navigator.serviceWorker.ready;
      for (let i = 0; i < 40; i++) { const n = await reg.getNotifications({ tag: 'minder-test' }); if (n.length) return { ok, aan: SET.meldAan, titel: n[0].title, body: n[0].body, data: n[0].data }; await new Promise((x) => setTimeout(x, 100)); }
      return { ok, aan: SET.meldAan, geen: true }; });
    expect(r.aan).toBe(true);
    expect(r.titel).toBe('Testmelding · deze week nog €292 van €361');
    expect(r.body).toBe('Boodschappen: nog €230\nStand van vr 20 nov 12:00');
    expect(r.data).toEqual({ scherm: 'ins' });
  });

  test('v516 k: na de nieuwe sw.js staat alleen cache minder-v517b, en de app laadt offline', async ({ page, context }) => {
    const nieuw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    const oud = nieuw.replace(/const CACHE='minder-v\d+[a-z]*';/, "const CACHE='minder-v515';");
    await context.route('**/sw.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: oud }));
    await K.boot(page, { metSw: true }); await klaar(page);
    expect(await opnieuw(page, () => caches.keys())).toEqual(['minder-v515']);
    await context.unroute('**/sw.js');
    await opnieuw(page, async () => { const r = await navigator.serviceWorker.getRegistration(); await r.update(); });
    let keys = [];
    for (let i = 0; i < 60; i++) { keys = await opnieuw(page, () => caches.keys()); if (!keys.includes('minder-v515')) break; await page.waitForTimeout(250); }
    expect(keys).toEqual(['minder-v517b']);   // v517b: de cache is gebumpt
    await page.waitForTimeout(500); await page.waitForLoadState('load');
    await context.setOffline(true);
    await page.reload(); await page.waitForFunction(() => typeof renderIns === 'function', null, { timeout: 10000 });
    expect(await page.evaluate(() => document.getElementById('s-ins') != null)).toBe(true);
    await context.setOffline(false);
  });

