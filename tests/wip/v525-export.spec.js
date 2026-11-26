/* v525 OP JOUW EXPORT (de back-up staat niet in de repo, dus dit draait alleen bij jou):
     MINDER_EXPORT=<pad naar b.json> WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v525-export.spec.js
   Test a: je stand op 26 nov (REPETITIE_DAG, standaard 2026-11-26): het oordeel van de kaart (salKaartData, dezelfde bron als de kaart op Zien)
   noemt Betaalrekening en Reserveringen, en Reserveringen staat op −€36. Op 26 nov gaat Zien over het salaris van 25 nov ("Salaris binnen");
   het oordeel over het volgende salaris wordt hier rechtstreeks uit de bron gelezen.
   Test b (de repetitie): elk bedrag buiten de vorm (Home, Inzichten, de vier tabs van Grip zonder de kaarten van de salarisverdeling, Plan,
   Vermogen), het voorstel per rekening, opzij, de verwachte overboekingen en de krap-melding op 23 nov, 24 nov, 26 nov en 1 dec zijn gelijk aan
   de vorige main (d8c90b9) op dezelfde export. SABOTAGE: CONTANT=0 zet het potje Contant (alleen aan de huidige kant) op 0; dan wordt hij rood. */
const fs = require('fs');
const { execSync } = require('child_process');
const { test, expect } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const S = require('../v523-stand');
const MAIN_HTML = () => execSync('git show d8c90b9:index.html', { cwd: __dirname + '/../..', maxBuffer: 64 * 1024 * 1024 }).toString();
async function laad(page, html, data, dag, contant) {
  await page.route('**/sw.js', r => r.abort());
  if (html) await page.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const ls = { minder_tx: JSON.stringify(data.tx || []), minder_ovr: JSON.stringify(data.ovr || {}), minder_own: JSON.stringify(data.own || []),
    minder_accmeta: JSON.stringify(data.accmeta || {}), minder_plan: JSON.stringify(data.plan || {}), minder_set: JSON.stringify(data.set || {}) };
  await page.addInitScript(d => { if (!sessionStorage.getItem('rep')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('rep', '1'); } }, ls);
  await pinDatum(page, dag);
  await page.goto('/index.html');
  if (contant != null) await page.evaluate(c => { SET.budgets = Object.assign({}, SET.budgets, { contant: c }); save(); try { runMemoVergeten(); } catch (_) {} window._rekV = null; window._salTek = null; }, contant);
}
const MEET = () => { const P = rekVoorstel(), N = salVoorstelNu();
  return { P: P.ok ? { start: P.start, eind: P.eind, opzij: Math.round(P.opzij), res: Math.round(P.reserveringen || 0), rek: P.rek.map(r => [r.acc, Math.round(r.laten)]) } : null,
    N: N ? [N.opzij, N.bed] : null, ov: overboekVerwacht().map(o => [o.naar, o.bedrag, Math.round(o.nog)]), krap: salTekortData().map(x => [x.acc, Math.round(x.tekort || 0)]), opzijNetto: opzijPeriode().netto }; };

test('a: je stand op 26 nov: het oordeel noemt Betaalrekening en Reserveringen, Reserveringen −€36', async ({ page }) => {
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8'));
  await laad(page, null, data, process.env.REPETITIE_DAG || '2026-11-26');
  const r = await page.evaluate(() => { const D = salKaartData(rekVoorstel()); return { oordeel: D.oordeel, rijen: D.rijen.map(x => [x.naam, x.verschil, x.st]) }; });
  console.log(JSON.stringify(r, null, 1));
  expect(r.oordeel).toContain('Betaalrekening');
  expect(r.oordeel).toContain('Reserveringen €36');
  expect(r.rijen.find(x => x[0] === 'Reserveringen')[1]).toBe(-36);
});

test('b: repetitie: elk bedrag buiten de vorm is gelijk aan d8c90b9 op dezelfde export', async ({ browser }) => {
  test.setTimeout(600000);
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8')), html = MAIN_HTML(), af = [];
  for (const dag of ['2026-11-23', '2026-11-24', '2026-11-26', '2026-12-01']) {
    const p1 = await browser.newPage(), p2 = await browser.newPage();
    await laad(p1, html, data, dag); await laad(p2, null, data, dag, process.env.CONTANT ? +process.env.CONTANT : null);
    const oud = Object.assign(await p1.evaluate(MEET), { bedragen: await S.bedragen(p1) }), nu = Object.assign(await p2.evaluate(MEET), { bedragen: await S.bedragen(p2) });
    expect(oud.P, 'invoermeting: main gaf een voorstel').not.toBeNull();
    for (const k of Object.keys(oud)) if (JSON.stringify(oud[k]) !== JSON.stringify(nu[k])) af.push(`${dag} ${k}: OUD ${JSON.stringify(oud[k])}\n   NU  ${JSON.stringify(nu[k])}`);
    await p1.close(); await p2.close();
  }
  if (af.length) console.log(af.join('\n'));
  expect(af).toEqual([]);
});
