/* De generale repetitie op JOUW gegevens (punt 4): je back-up uit Instellingen › Gegevens & privacy (minder-backup-<dag>.json), op de app
   van d46a6f1 (v511) en op de huidige index.html, met dezelfde meting (tests/repetitie-meten.js) op 23, 24, 26 nov en 1 dec.
   Alleen met de hand, de export verlaat je machine niet:
     git show d46a6f1:index.html > /tmp/v511.html
     MINDER_EXPORT=<pad naar je back-up> V511_HTML=/tmp/v511.html WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v512c-repetitie-export.spec.js
   Schrijft de tabel naar REPETITIE_OUT (standaard /tmp/repetitie.txt) en faalt als een bedrag buiten de verdeling vast/potjes afwijkt.
   SABOTAGE (punt "contant €631"): CONTANT=631 zet het potje Contant in de nieuwe run op 631; de test moet dan rood worden. */
const fs = require('fs');
const { test, expect } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const R = require('../repetitie-meten');
async function run(page, html, data, contant) {
  if (html) await page.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const ls = { minder_tx: JSON.stringify(data.tx || []), minder_ovr: JSON.stringify(data.ovr || {}), minder_own: JSON.stringify(data.own || []),
    minder_accmeta: JSON.stringify(data.accmeta || {}), minder_plan: JSON.stringify(data.plan || {}), minder_set: JSON.stringify(data.set || {}) };
  await page.addInitScript(d => { if (!sessionStorage.getItem('rep')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('rep', '1'); } }, ls);
  await pinDatum(page, process.env.REPETITIE_DAG || new Date().toISOString().slice(0, 10));
  await page.goto('/index.html');
  if (contant != null) await page.evaluate(c => { SET.budgets = Object.assign({}, SET.budgets, { contant: c }); save(); try { runMemoVergeten(); } catch (_) {} }, contant);
  return R.meetAlle(page);
}
test('repetitie op je export: v511 tegen nu', async ({ browser }) => {
  test.setTimeout(180000);
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8'));
  const p1 = await browser.newPage(), p2 = await browser.newPage();
  const oud = await run(p1, fs.readFileSync(process.env.V511_HTML), data, null);
  const nu = await run(p2, null, data, process.env.CONTANT ? +process.env.CONTANT : null);
  const f = x => JSON.stringify(x);
  const L = []; for (const d of R.DAGEN) { L.push(`== ${d}`); for (const k of ['pb', 'over', 'opzij', 'terug', 'hoe']) L.push(`${k.padEnd(6)} v511 ${f(oud[d][k])}\n       nu   ${f(nu[d][k])}`); }
  const af = R.vergelijk(oud, nu); L.push('', 'AFWIJKINGEN: ' + (af.length ? '\n' + af.join('\n') : 'geen'));
  fs.writeFileSync(process.env.REPETITIE_OUT || '/tmp/repetitie.txt', L.join('\n'));
  expect(af).toEqual([]);
});
