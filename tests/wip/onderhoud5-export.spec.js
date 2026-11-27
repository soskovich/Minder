/* onderhoud5 OP JOUW EXPORT (de back-up staat niet in de repo, dus dit draait alleen bij jou):
     MINDER_EXPORT=<pad naar je back-up van 27 nov> WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/onderhoud5-export.spec.js
   Test a: na laden (de migratie van onderhoud5 draait bij het opstarten): Beschermen EUR 2.927, Inrichting EUR 3.000, nog terug EUR 0,
     spaarrekening EUR 5.927,12, kop EUR 10.113; de overboeking van 16 nov tussen Instant Savings en Buffer Rust staat niet in het
     bron-sheet; de drie aanvullingen dragen hun hele bedrag als af.
   Test r (de repetitie): elk bedrag op Home, Inzichten en Vermogen, het voorstel, lagenGestort, de dekking en safeToSpend zijn op 25, 27
     en 30 nov gelijk aan de vorige main (57e831e) op dezelfde export. Plan, Grip (Fundament en Lagen lezen dezelfde standen) en het
     bron-sheet mogen veranderen; de bedragen van Grip zonder de tegels worden afgedrukt (oud en nieuw) zodat elk verschil te melden is.
     SABOTAGE: CONTANT=0 zet het potje Contant (alleen aan de huidige kant) op 0; dan wordt hij rood. */
const fs = require('fs');
const { execSync } = require('child_process');
const { test, expect } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const MAIN_HTML = () => execSync('git show 57e831e:index.html', { cwd: __dirname + '/../..', maxBuffer: 64 * 1024 * 1024 }).toString();
async function laad(page, html, data, dag, contant) {
  await page.route('**/sw.js', (r) => r.abort());
  if (html) await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const ls = { minder_tx: JSON.stringify(data.tx || []), minder_ovr: JSON.stringify(data.ovr || {}), minder_own: JSON.stringify(data.own || []),
    minder_accmeta: JSON.stringify(data.accmeta || {}), minder_plan: JSON.stringify(data.plan || {}), minder_set: JSON.stringify(data.set || {}) };
  await page.addInitScript((d) => { if (!sessionStorage.getItem('rep')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('rep', '1'); } }, ls);
  await pinDatum(page, dag);
  await page.goto('/index.html');
  if (contant != null) await page.evaluate((c) => { SET.budgets = Object.assign({}, SET.budgets, { contant: c }); save(); try { runMemoVergeten(); } catch (_) {} window._rekV = null; }, contant);
}
const data = () => { const pad = process.env.MINDER_EXPORT; if (!pad) return null; return JSON.parse(fs.readFileSync(pad, 'utf8')); };

test('a: na laden Beschermen EUR 2.927, Inrichting EUR 3.000, nog terug EUR 0, spaarrekening EUR 5.927,12, kop EUR 10.113', async ({ page }) => {
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, process.env.REPETITIE_DAG || '2026-11-27');
  const r = await page.evaluate(() => { const L = lagenData(), PT = planTerug(), iw = (L.P || []).find((p) => p.type === 'goal' && /inrichting/i.test(p.naam || ''));
    openOpnameBron(); const sheet = document.getElementById('opnameBron').innerText; closeSheet();
    return { beschermen: L.beschermen, iw: iw ? Math.round(L.SE.per[iw.id].geld) : null, nogTerug: Math.round(PT.totaal * 100) / 100, saldo: L.saldo, kop: Math.round(L.kop),
      nf: SET.nfToegewezen, afg: SET.nfAfgetrokken, weg: SET.onderhoud5 || null, af: Object.entries(SET.opnameBron || {}).filter(([, e]) => e.bron === 'aanvulling').map(([k, e]) => [k, e.af]),
      tussen: /Buffer Rust/.test(sheet) || /€3\.175/.test(sheet) }; });
  console.log(JSON.stringify(r, null, 1));
  expect(Math.round(r.beschermen)).toBe(2927);
  expect(r.iw).toBe(3000);
  expect(r.nogTerug).toBe(0);
  expect(r.saldo).toBe(5927.12);
  expect(r.kop).toBe(10113);
  expect(r.tussen).toBe(false);
  expect(r.af.map((x) => x[1]).sort((a, b) => a - b)).toEqual([20, 93, 250]);
});

test('r: de repetitie: buiten Plan, Grip en het bron-sheet is elk bedrag gelijk aan 57e831e (25, 27 en 30 nov)', async ({ browser }) => {
  const d = data(); if (!d) test.skip();
  test.setTimeout(300000);
  const contant = process.env.CONTANT != null ? +process.env.CONTANT : null;
  const meet = async (html, c) => { const out = {};
    for (const dag of ['2026-11-25', '2026-11-27', '2026-11-30']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
      await laad(page, html, d, dag, c);
      out[dag] = await page.evaluate(() => { const re = /-?€\s?[\d.]+(?:,\d{2})?/g, lees = (id) => (document.getElementById(id).innerText.match(re) || []), u = {};
        go('dash'); renderDash(); u.home = lees('s-dash'); go('ins'); renderIns(); u.ins = lees('s-ins'); go('vermogen'); renderVermogen(); u.verm = lees('s-vermogen');
        const P = rekVoorstel(), G = lagenGestort(), D = dekking(12);
        u.f = { safe: safeToSpend().safe, P: P.ok ? [P.opzij, P.reserveringen, P.rek.map((r) => [r.acc, Math.round(r.laten)])] : null, G: G ? G.lagen.map((l) => [l.k, l.plan, l.gestort]) : null,
          D: [D.gedektTot, D.gat && D.gat.tekort, D.nodigPerMaand], nw: netWorth() };
        go('maand'); u.grip = {}; for (const t of ['zien', 'begrijpen', 'kiezen', 'terugblik']) { try { gripKiesTab(t); } catch (_) {} const c = document.getElementById('s-maand').cloneNode(true); for (const x of c.querySelectorAll('#gripMeters')) x.remove(); document.body.appendChild(c); u.grip[t] = (c.innerText.match(re) || []); c.remove(); }
        return u; });
      await ctx.close(); }
    return out; };
  const oud = await meet(MAIN_HTML(), null), nu = await meet(null, contant);
  for (const dag of Object.keys(oud)) { if (JSON.stringify(oud[dag].grip) !== JSON.stringify(nu[dag].grip)) console.log('VERSCHIL Grip', dag, JSON.stringify({ oud: oud[dag].grip, nu: nu[dag].grip }));
    for (const k of ['home', 'ins', 'verm', 'f']) expect(JSON.stringify(nu[dag][k]), `${dag} ${k}`).toBe(JSON.stringify(oud[dag][k])); }
});
