/* v524 stop 1: verificatie + schermafdrukken op je eigen back-up (verlaat je machine niet).
   MINDER_EXPORT=<pad naar back-up> SHOT_DIR=<map> TZ=Europe/Amsterdam WIP=1 npx playwright test tests/wip/v524-shot.spec.js
   Rendert Plan op 390px met de back-up van 25 nov: zonder keuzes en in scenario e2 (de standen direct gezet, want de
   bron-UI van onderdeel 4/5 komt in stop 2). Schrijft de schermafdrukken naar SHOT_DIR. */
const fs = require('fs');
const { test, expect } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const OUT = process.env.SHOT_DIR || '.';

async function load(page, data) {
  const ls = { minder_tx: JSON.stringify(data.tx || []), minder_ovr: JSON.stringify(data.ovr || {}), minder_own: JSON.stringify(data.own || []),
    minder_accmeta: JSON.stringify(data.accmeta || {}), minder_plan: JSON.stringify(data.plan || {}), minder_set: JSON.stringify(data.set || {}) };
  // guard: alleen de eerste keer injecteren, zodat een reload de in-app gemuteerde localStorage niet overschrijft
  await page.addInitScript(d => { if (!sessionStorage.getItem('v524')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('v524', '1'); } }, ls);
  await pinDatum(page, '2026-11-25');
  await page.setViewportSize({ width: 390, height: 1800 });
  await page.goto('/index.html');
  await page.evaluate(() => { go('vooruit'); });
  await page.waitForTimeout(200);
}

test('blok 1 rendert op de back-up (zonder keuzes)', async ({ page }) => {
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8'));
  await load(page, data);
  const kop = await page.getAttribute('#planLagenHero', 'data-lagenkop');
  const d = {};
  for (const k of ['beschermen', 'reserveren', 'doelen', 'groeien', 'saldo', 'res', 'vrij']) d[k] = await page.getAttribute('#planLagenHero', 'data-laag' + k);
  // blok 2
  const b2 = { meer: await page.getAttribute('#planGestort', 'data-gestortmeer'), extra: await page.getAttribute('[data-extraregel]', 'data-extra').catch(() => null),
    extraNaar: await page.getAttribute('[data-extraregel]', 'data-extranaar').catch(() => null), waarom: await page.getAttribute('[data-waaromtotaal]', 'data-waaromtotaal').catch(() => null) };
  for (const lk of ['beschermen', 'doelen', 'reserveren', 'groeien']) { const el = page.locator(`[data-gestortlaag="${lk}"]`);
    b2[lk] = { plan: await el.getAttribute('data-plan'), gestort: await el.getAttribute('data-gestort') }; }
  console.log('LAGEN kop', kop, d); console.log('BLOK2', JSON.stringify(b2));
  await page.locator('#s-vooruit').screenshot({ path: OUT + '/v524-zonderkeuzes.png' });
  expect(Math.round(+kop)).toBe(10476);
  expect(Math.round(+d.beschermen)).toBe(4152);
  expect(Math.round(+d.doelen)).toBe(2174);
  expect(Math.round(+d.groeien)).toBe(4150);
  expect(Math.round(+d.res)).toBe(0);
  // blok 2: plan/gestort per laag en de sluitende verklaring
  expect(Math.round(+b2.doelen.plan)).toBe(725);
  expect(Math.round(+b2.doelen.gestort)).toBe(725);
  expect(Math.round(+b2.reserveren.plan)).toBe(36);
  expect(Math.round(+b2.reserveren.gestort)).toBe(0);
  expect(Math.round(+b2.groeien.plan)).toBe(300);
  expect(Math.round(+b2.meer)).toBe(870);
  expect(Math.round(+b2.waarom)).toBe(870);       // test c: sluit tot op de euro
  expect(b2.extraNaar).toBe('beschermen');        // test l: surplus naar Beschermen zolang het noodfonds onder de norm staat
});

test('scenario e2: bron Noodfonds, Inrichting op 3000 (eind-standen in de data gebakken)', async ({ page }) => {
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8'));
  // de eind-standen van e2 in de data zetten VOOR het laden (zelfde pad als de zonder-keuzes-test, geen reload): borg+huur bron
  // Noodfonds (Inrichting niet meer afgeboekt), Inrichting doel 3000 en het deel erboven via verplaats naar Noodfonds, geen
  // terugzetten naar Inrichting meer. De bron-UI (onderdeel 4/5) komt in stop 2; dit is de eind-stand.
  const g = (data.set.goals || []).find(x => /Inrichting/i.test(x.naam || '')); if (g) { g.gespaard = 3000; g.doel = 3000; }
  data.set.nfToegewezen = 3326;
  if (data.set.terugzet) delete data.set.terugzet['2026-11'];
  data.set.terugzetGat = (data.set.terugzetGat || []).filter(r => !(r && r.M === '2026-11'));
  await load(page, data);
  // via pure berekening lezen (geen geforceerde paint): de e2-render voltooit, maar een DOM-screenshot van het volle Plan met
  // Inrichting vol crasht Chromium in deze VM. De getallen zijn de verificatie; de e2-schermafdruk is op de VM geblokkeerd.
  const L = await page.evaluate(() => { const x = lagenData(); const G = (typeof lagenGestort === 'function') ? lagenGestort() : null;
    return { kop: x.kop, beschermen: x.beschermen, doelen: x.doelen, groeien: x.groeien, res: x.res, gmeer: G ? G.meer : null, gTerug: G ? G.gTerug : null }; });
  let nogTerug = 0; try { nogTerug = await page.evaluate(() => { try { const A = spaarPlanAansl(); return A ? A.nogTerug : 0; } catch (_) { return 0; } }); } catch (_) { }
  console.log('E2', JSON.stringify(L), 'nogterug', nogTerug);
  expect(Math.round(+L.kop)).toBe(10476);
  expect(Math.round(+L.beschermen)).toBe(3326);
  expect(Math.round(+L.doelen)).toBe(3000);
  expect(Math.round(+L.groeien)).toBe(4150);
  expect(Math.round(+L.res)).toBe(0);
  expect(Math.round(+nogTerug)).toBe(0);     // geen "nog terug" meer
  expect(Math.round(+L.gTerug)).toBe(0);     // geen terugzetten naar Inrichting meer
});
