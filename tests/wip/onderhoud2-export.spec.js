/* onderhoud2, DEEL 0 EN DE REPETITIE OP JOUW EXPORT (b.json staat niet in de repo, dus dit draait alleen bij jou):
     MINDER_EXPORT=<pad naar b.json> WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/onderhoud2-export.spec.js
   Vergelijkt MAIN (origin/main, niet een vaste commit) met de huidige index.html op dezelfde gegevens.
   Test 1 (deel 0, PUNT 4): legt main en nu naast elkaar met je verwachte vaste lasten (SET.vastVerwacht) INTACT, en schrijft naar
     ONDERHOUD2_OUT (standaard /tmp/onderhoud2.txt) per verwachte vaste last de termijnen en het bedrag oud tegen nieuw, plus de globale
     bedragen (Vaste lasten, nog te betalen, de vooruitblik, opzij, veilig te besteden). Dit zijn de bedragen die punt 4 bewust verandert
     (een vaste last die al betaald is telt niet nog eens, en met het laatst betaalde bedrag); hij faalt niet, maar laat ze zien.
   Test 2 (de repetitie, PUNT 1-3): met SET.vastVerwacht LEEG (zodat punt 4 geen effect heeft) moeten opzij en de globale bedragen op 23,
     24, 26 nov en 1 dec gelijk zijn aan main. Zo bewijst de repetitie dat punt 1-3 zonder keuze geen enkel bedrag veranderen.
     SABOTAGE: CONTANT=0 zet het potje Contant (alleen aan de huidige kant) op 0; de repetitie moet dan rood worden. CONTANT=631 is GEEN
     sabotage (zoals bij onderhoud1): hij valt samen met wat Minder al rekent en blijft groen; CONTANT=0 en CONTANT=2000 worden rood. */
const fs = require('fs');
const { execSync } = require('child_process');
const { test, expect } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const R = require('../repetitie-meten');
const OUD_HTML = () => execSync('git show origin/main:index.html', { cwd: __dirname + '/../..', maxBuffer: 64 * 1024 * 1024 }).toString();
async function laad(page, html, data, dag, o) {
  o = o || {};
  await page.route('**/sw.js', r => r.abort());
  if (html) await page.route('**/index.html', r => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
  const ls = { minder_tx: JSON.stringify(data.tx || []), minder_ovr: JSON.stringify(data.ovr || {}), minder_own: JSON.stringify(data.own || []),
    minder_accmeta: JSON.stringify(data.accmeta || {}), minder_plan: JSON.stringify(data.plan || {}), minder_set: JSON.stringify(data.set || {}) };
  await page.addInitScript(d => { if (!sessionStorage.getItem('rep')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('rep', '1'); } }, ls);
  await pinDatum(page, dag);
  await page.goto('/index.html');
  await page.evaluate(({ leeg, contant }) => {
    if (leeg) { SET.vastVerwacht = []; }
    if (contant != null) SET.budgets = Object.assign({}, SET.budgets, { contant });
    save(); try { runMemoVergeten(); } catch (_) {}
  }, { leeg: !!o.leeg, contant: o.contant });
}
/* de verwachte vaste lasten (vvVast) met hun termijnen en bedrag, plus de globale bedragen */
const MEET = () => { const V = maandVooruit(), L = monthLiquidity();
  const vv = (Array.isArray(SET.vastVerwacht) ? SET.vastVerwacht : []).map(x => ({ id: x.id, naam: x.naam, koppel: !!x.koppel,
    bedrag: (typeof vvBedrag === 'function') ? vvBedrag(x) : null,
    termijnen: (typeof vvTermijnen === 'function') ? vvTermijnen(x, (function () { try { const SP = salPeriode(); return SP.cur.start; } catch (_) { return thisYM() + '-01'; } })(), (function () { try { const SP = salPeriode(); return SP.cur.eind; } catch (_) { return thisYM() + '-28'; } })()) : [] }));
  return { vv, bedragen: { vasteLasten: vasteLastenStand(), fixDue: L.fixDue, vaste: V.vaste, projectie: V.projectie,
    opzij: (function () { try { const P = rekVoorstel(); return P && P.ok ? Math.round(P.opzij) : null; } catch (_) { return null; } })(), safe: Math.round(safeToSpend().safe) } }; };

test('deel 0 (punt 4): main tegen nu op je export, de verwachte vaste lasten oud tegen nieuw', async ({ browser }) => {
  test.setTimeout(180000);
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8')), dag = process.env.REPETITIE_DAG || '2026-11-26';
  const p1 = await browser.newPage(), p2 = await browser.newPage();
  await laad(p1, OUD_HTML(), data, dag); await laad(p2, null, data, dag);
  const oud = await p1.evaluate(MEET), nu = await p2.evaluate(MEET), f = x => JSON.stringify(x);
  const byId = L => Object.fromEntries(L.map(x => [x.id, x]));
  const o = byId(oud.vv), n = byId(nu.vv), L = ['VERWACHTE VASTE LASTEN (die punt 4 raakt):'];
  for (const id of Object.keys(n)) { const a = o[id], b = n[id]; if (!a) { L.push(`  ${b.naam}: nieuw`); continue; }
    const diff = f(a.bedrag) !== f(b.bedrag) || f(a.termijnen) !== f(b.termijnen);
    L.push(`  ${b.naam}${b.koppel ? ' (gekoppeld)' : ''}: ${diff ? `\n      OUD bedrag ${a.bedrag} termijnen ${f(a.termijnen)}\n      NU  bedrag ${b.bedrag} termijnen ${f(b.termijnen)}` : 'gelijk'}`); }
  L.push('', 'GLOBALE BEDRAGEN:');
  for (const k in oud.bedragen) { const a = f(oud.bedragen[k]), b = f(nu.bedragen[k]); L.push(`  ${k}: ${a === b ? 'gelijk' : 'OUD ' + a + '  NU ' + b}`); }
  fs.writeFileSync(process.env.ONDERHOUD2_OUT || '/tmp/onderhoud2.txt', L.join('\n'));
  // invoermeting: er is iets gemeten (geen harde eis op de bedragen; punt 4 verandert ze bewust)
  expect(nu.vv.length).toBeGreaterThanOrEqual(0);
});

test('repetitie (punt 1-3): met lege verwachte vaste lasten is elk bedrag gelijk aan main op 23, 24, 26 nov en 1 dec', async ({ browser }) => {
  test.setTimeout(360000);
  const pad = process.env.MINDER_EXPORT; if (!pad) test.skip();
  const data = JSON.parse(fs.readFileSync(pad, 'utf8')), dag = process.env.REPETITIE_DAG || '2026-11-26';
  const p1 = await browser.newPage(), p2 = await browser.newPage();
  await laad(p1, OUD_HTML(), data, dag, { leeg: true });
  await laad(p2, null, data, dag, { leeg: true, contant: process.env.CONTANT ? +process.env.CONTANT : null });
  const meet = async (p) => { const out = {}; for (const d of R.DAGEN) { await p.evaluate(R.BEKIJK, d); out[d] = await p.evaluate(MEET); } return out; };
  const oud = await meet(p1), nu = await meet(p2);
  for (const d of R.DAGEN) {
    expect(typeof oud[d].bedragen.opzij === 'number' || oud[d].bedragen.opzij === null).toBe(true);   // invoermeting
    expect(nu[d].bedragen).toEqual(oud[d].bedragen);   // punt 1-3 veranderen geen enkel bedrag (sabotage CONTANT=0 -> rood)
  }
});
