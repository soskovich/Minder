/* onderhoud1, DEEL 0 EN DE REPETITIE OP JOUW EXPORT (b.json staat niet in de repo, dus dit draait alleen bij jou):
     MINDER_EXPORT=<pad naar b.json> WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/onderhoud1-export.spec.js
   Test 1 (deel 0) legt bc2bafd en de huidige index.html naast elkaar op je gegevens en schrijft naar ONDERHOUD1_OUT
   (standaard /tmp/onderhoud1.txt): per tegenpartij die door de splitsing anders uitkomt de reeksen en de status oud tegen nieuw,
   de signalen "gestopt?" oud tegen nieuw, en elk bedrag (Vaste lasten, nog te betalen, de vooruitblik, veilig te besteden) oud
   tegen nieuw. Hij faalt als een bedrag afwijkt (dat hoort gemeld voordat er verder gebouwd wordt).
   Test 1 faalt ook op een "gestopt?" die op bc2bafd niet bestond.
   Test 2 (de repetitie): opzij op 23 nov, 24 nov, 26 nov en 1 dec moet gelijk zijn aan bc2bafd op dezelfde export (geen vaste getallen).
   SABOTAGE: CONTANT=0 zet het potje Contant (alleen aan de huidige kant) op 0; de repetitie moet dan rood worden. CONTANT=631 is
   GEEN sabotage: gemeten door de gebruiker op zijn exports van 25 nov (dag 26 nov) en 11 nov valt 631 samen met wat Minder al
   rekent en blijft de repetitie groen. CONTANT=0 en CONTANT=2000 worden daar rood. */
const fs = require('fs');
const { execSync } = require('child_process');
const { test, expect } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const R = require('../repetitie-meten');
const OUD_HTML = () => execSync('git show bc2bafd:index.html', { cwd: __dirname + '/../..', maxBuffer: 64 * 1024 * 1024 }).toString();
async function laad(page, html, data, dag, contant) {
  await page.route('**/sw.js', r => r.abort());
  if (html) await page.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const ls = { minder_tx: JSON.stringify(data.tx || []), minder_ovr: JSON.stringify(data.ovr || {}), minder_own: JSON.stringify(data.own || []),
    minder_accmeta: JSON.stringify(data.accmeta || {}), minder_plan: JSON.stringify(data.plan || {}), minder_set: JSON.stringify(data.set || {}) };
  await page.addInitScript(d => { if (!sessionStorage.getItem('rep')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('rep', '1'); } }, ls);
  await pinDatum(page, dag);
  await page.goto('/index.html');
  if (contant != null) await page.evaluate(c => { SET.budgets = Object.assign({}, SET.budgets, { contant: c }); save(); try { runMemoVergeten(); } catch (_) {} }, contant);
}
const MEET = () => { const V = maandVooruit(), L = monthLiquidity();
  const lo = gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), []).filter(x => x.soort === 'verlopen').map(x => x.naam);
  const st = {}; for (const [k, P] of Object.entries(postStatusMap())) st[k] = [P.status, P.laatste, P.bedrag];
  const rk = typeof postReeksenAlle === 'function' ? Object.fromEntries(Object.entries(postReeksenAlle()).map(([k, R]) => [k, R.map(r => `${r.key}: ${r.amount} ${r.cadans || r.intervalM} laatst ${r.lastDate} (${r.n}x)`)])) : {};
  return { bedragen: { vasteLasten: vasteLastenStand(), fixDue: L.fixDue, fixDueItems: (L.fixDueItems || []).map(x => [x.key, x.amount, !!x.excl]), vaste: V.vaste, projectie: V.projectie, safe: safeToSpend().safe }, lo, st, rk }; };
test('deel 0: bc2bafd tegen nu op je export', async ({ browser }) => {
  test.setTimeout(180000);
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8')), dag = process.env.REPETITIE_DAG || new Date().toISOString().slice(0, 10);
  const oudHtml = OUD_HTML();
  const p1 = await browser.newPage(), p2 = await browser.newPage();
  await laad(p1, oudHtml, data, dag); await laad(p2, null, data, dag);
  const oud = await p1.evaluate(MEET), nu = await p2.evaluate(MEET), f = x => JSON.stringify(x);
  const L = ['TEGENPARTIJEN MET MEER REEKSEN (nu):'];
  for (const k in nu.rk) { L.push(`  ${k}: oud ${f(oud.st[k] || null)}`); for (const r of nu.rk[k]) L.push(`    ${r} -> ${f(nu.st[r.split(':')[0]] || null)}`); }
  L.push('', 'GESTOPT? OUD:', ...oud.lo.map(x => '  ' + x), 'GESTOPT? NU:', ...nu.lo.map(x => '  ' + x), '', 'BEDRAGEN:');
  const af = []; for (const k in oud.bedragen) { const a = f(oud.bedragen[k]), b = f(nu.bedragen[k]); L.push(`  ${k}: ${a === b ? 'gelijk' : 'OUD ' + a + '\n      NU  ' + b}`); if (a !== b) af.push(k); }
  fs.writeFileSync(process.env.ONDERHOUD1_OUT || '/tmp/onderhoud1.txt', L.join('\n'));
  expect(af).toEqual([]);
  expect(nu.lo.filter(x => !oud.lo.includes(x))).toEqual([]);   // onderhoud1b: geen "gestopt?" die op bc2bafd niet bestond
});
test('repetitie: opzij op 23 nov, 24 nov, 26 nov en 1 dec is gelijk aan bc2bafd op dezelfde export', async ({ browser }) => {
  test.setTimeout(360000);
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8')), dag = process.env.REPETITIE_DAG || new Date().toISOString().slice(0, 10);
  const p1 = await browser.newPage(), p2 = await browser.newPage();
  await laad(p1, OUD_HTML(), data, dag);
  await laad(p2, null, data, dag, process.env.CONTANT ? +process.env.CONTANT : null);
  const opzij = async (p) => { const M = await R.meetAlle(p), uit = {}; for (const d of R.DAGEN) uit[d] = M[d].opzij.advies; return uit; };
  const oud = await opzij(p1), nu = await opzij(p2);
  expect(Object.values(oud).every(v => typeof v === 'number')).toBe(true);   // invoermeting: bc2bafd gaf vier bedragen
  expect(nu).toEqual(oud);
});
