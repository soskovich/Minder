/* v526 OP JOUW EXPORT (de back-up staat niet in de repo, dus dit draait alleen bij jou):
     MINDER_EXPORT=<pad naar je back-up> WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v526-export.spec.js
   Test a: je stand op 2 dec (REPETITIE_DAG; 27 nov was te vroeg voor de werkdagen-grens van v523b): de tegel Lagen zegt 2/3, groot EUR 36, "Reserveren niet gestort"; Groeien staat op "nog niet".
   Test c: de tegel Fundament: reserveringen niet gedekt (pot EUR 0, je inleg deze periode niet gestort).
   Test e (blijft op 27 nov tenzij REPETITIE_DAG): na keuze C (dezelfde UI-acties als tests/wip/v524-keuzeC-export.spec.js): het grote getal van Fundament is het buffertekort tegen je norm
   (verwacht EUR 2.470 bij een norm van EUR 5.796), en dat is het grootste niet-gehaalde bedrag.
   Test r (de repetitie): elk bedrag op Home, Inzichten, Plan en Vermogen, het voorstel, lagenGestort, de dekking en safeToSpend zijn op 25, 27 en 30 nov
   gelijk aan de vorige main (4ce6ffa) op dezelfde export. SABOTAGE: CONTANT=0 zet het potje Contant (alleen aan de huidige kant) op 0; dan wordt hij rood. */
const fs = require('fs');
const { execSync } = require('child_process');
const { test, expect } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const MAIN_HTML = () => execSync('git show 4ce6ffa:index.html', { cwd: __dirname + '/../..', maxBuffer: 64 * 1024 * 1024 }).toString();
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

test('a: Lagen 2/3, groot EUR 36, "Reserveren niet gestort"', async ({ page }) => {
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, process.env.REPETITIE_DAG || '2026-12-02');
  const r = await page.evaluate(() => { go('maand'); gripKiesTab('zien'); closeSheet(); const e = document.querySelector('#gripMeters [data-meter="lagen"]');
    const T = lagenTegelData(); return { ring: e.querySelector('.gm-ring').innerText.trim(), v: e.querySelector('.gm-v').innerText.trim(), s: e.querySelector('.gm-s').innerText.trim(), lagen: T.lagen.map((l) => [l.k, l.plan, l.gestort, l.stand]) }; });
  console.log(JSON.stringify(r, null, 1));
  expect([r.ring, r.v, r.s]).toEqual(['2/3', '€36', 'Reserveren niet gestort']);
  expect(r.lagen.find((l) => l[0] === 'groeien')[3]).toBe('nognie');
});

test('c: Fundament: reserveringen niet gedekt (pot EUR 0, inleg niet gestort)', async ({ page }) => {
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, process.env.REPETITIE_DAG || '2026-12-02');
  const r = await page.evaluate(() => { const F = fundamentData(), v = F.vw.find((x) => x.key === 'dekking'), RP = resSheetPeriode();
    return { gehaald: v.gehaald, label: v.label, pot: resSaldo(), RP: [RP.per, RP.gestort, RP.komt, RP.telt], oud: beleggenKlaar(maandRegels()).voorwaarden.map((x) => [x.key, x.gehaald]) }; });
  console.log(JSON.stringify(r, null, 1));
  expect(r.gehaald).toBe(false); expect(r.pot).toBe(0); expect(r.RP[3]).toBe(0); expect(r.label).toContain('niet gestort');
});

test('e: na keuze C is het grote getal van Fundament het buffertekort tegen je norm', async ({ page }) => {
  test.setTimeout(120000);
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, process.env.REPETITIE_DAG || '2026-11-27');
  const r = await page.evaluate(() => {
    const iw = (SET.goals || []).find((g) => /Inrichting/i.test(g.naam)); const sav = new Set(n26SavingsAccounts());
    const find = (amt, dd) => (TX || []).find((t) => Math.abs(t.amount - amt) < 0.01 && t.date === dd && sav.has(t.acc));
    const vs = find(-1000, '2026-11-12'), o500 = find(-500, '2026-11-15'), borg = find(-1620, '2026-11-16'), huur = find(-1554.8, '2026-11-16');
    if (!(vs && o500 && borg && huur && iw)) return { fout: 'niet alle boekingen/doelen gevonden' };
    setVerschuivingKeuze(vs.id, 'nee'); setOpnameBron(o500.id, 'noodfonds'); setOpnameBron(borg.id, 'noodfonds'); setOpnameBron(huur.id, 'noodfonds');
    iw.doel = 3000; save(); const delta = Math.round((3000 - planToeVan(iw.id)) * 100) / 100;
    if (delta > 0) { openPlanVerplaats('noodfonds'); planVerplaatsNaar(iw.id); planVerplaatsBedrag(delta); planVerplaatsZet(); }
    else if (delta < 0) { openPlanVerplaats(iw.id); planVerplaatsNaar('noodfonds'); planVerplaatsBedrag(-delta); planVerplaatsZet(); }
    try { runMemoVergeten(); } catch (_) {}
    const F = fundamentData(), b = F.vw.find((v) => v.key === 'buffer');
    return { groot: F.groot && F.groot.bedrag, sub: F.groot && F.groot.sub, buffer: b.bedrag, nodig: b.nodig, teller: b.teller, mist: F.mist.map((v) => [v.key, v.bedrag]), iwGeen: F.geen.some((g) => g.id === iw.id) };
  });
  console.log(JSON.stringify(r, null, 1));
  expect(r.fout).toBeUndefined();
  expect(r.groot).toBe(Math.max(...r.mist.map((x) => x[1])));
  expect(r.sub).toBe('buffer onder norm');
  expect(r.buffer).toBe(r.nodig - r.teller);
  expect(r.iwGeen).toBe(true);   // Inrichting vol: geen voorwaarde
});

test('r: de repetitie, elk bedrag buiten Grip gelijk aan 4ce6ffa op dezelfde export', async ({ browser }) => {
  test.setTimeout(240000);
  const d = data(); if (!d) test.skip();
  const MEET = () => { const re = /-?€\s?[\d.]+(?:,\d{2})?/g, lees = (id) => (document.getElementById(id).innerText.match(re) || []);
    const u = {}; go('dash'); renderDash(); u.home = lees('s-dash'); go('ins'); renderIns(); u.ins = lees('s-ins');
    go('vooruit'); renderVooruit(); u.plan = lees('s-vooruit'); go('vermogen'); renderVermogen(); u.verm = lees('s-vermogen');
    const P = rekVoorstel(), G = lagenGestort(), D = dekking(12);
    u.f = { safe: safeToSpend().safe, P: P.ok ? [P.opzij, P.reserveringen] : null, G: G ? G.lagen.map((l) => [l.k, l.plan, l.gestort]) : null, D: [D.gedektTot, D.gat && D.gat.tekort], nw: netWorth() };
    return u; };
  for (const dag of ['2026-11-25', '2026-11-27', '2026-11-30']) {
    /* v526b: elke dag in een eigen, schone context (localStorage en sessionStorage per context), zodat de stand van een andere test of dag niet lekt */
    const c1 = await browser.newContext({ serviceWorkers: 'block', baseURL: test.info().project.use.baseURL }), c2 = await browser.newContext({ serviceWorkers: 'block', baseURL: test.info().project.use.baseURL });
    const p1 = await c1.newPage(), p2 = await c2.newPage();
    await laad(p1, MAIN_HTML(), d, dag); await laad(p2, null, d, dag, process.env.CONTANT ? +process.env.CONTANT : null);
    const oud = await p1.evaluate(MEET), nu = await p2.evaluate(MEET);
    for (const k of Object.keys(oud)) expect(JSON.stringify(nu[k]), `${dag} ${k}`).toBe(JSON.stringify(oud[k]));
    await c1.close(); await c2.close();
  }
});
