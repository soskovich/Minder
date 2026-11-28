/* v527 OP JOUW EXPORT (de back-up staat niet in de repo, dus dit draait alleen bij jou):
     MINDER_EXPORT=<pad naar je back-up van 27 nov> WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v527-export.spec.js
   Test a (Grip, 27 nov): verwacht EUR 7.189, ondergrens EUR 6.683, vaste lasten nog EUR 816 in 7 posten, Budget-tegel EUR 406 onder
     (budget EUR 3.651, verwacht EUR 3.245), bridge-stap vast -EUR 336.
   Test b (Inzichten, 27 nov): Potjes EUR 173 van EUR 2.255, Deze week nog EUR 84 van EUR 202, Vaste lasten EUR 244 + EUR 816, binnen
     EUR 5.727. Zonder antwoord op de opnamevraag is de tegel gelijk aan het uitgegeven-blok (uitgegevenStand); na "Ja, dezelfde":
     EUR 35 onder tempo. Drukt alles af, zodat een afwijking te plaatsen is.
   Test c (sheets): per potje Boodschappen EUR 63/488 tempo 65, Overig 42/371 tempo 49, Contant 35/400 tempo 53, Vices 13/94 tempo 13,
     Uit eten 0/54 tempo 7; de tabel ruimte/verwacht samen EUR 2.082 / EUR 1.946.
   Test m (deel A, alleen meten): de vaste lasten met datum, waar Nathaniel nog meetelt, de dubbele Geldmaat-opname in de twee tellers en
     in de contant-schatting op Home, en de beleggingsinleg voor 23 dec. Drukt af, toetst niets.
   Test r (de repetitie): Home, Plan, Vermogen, de Lagen, lagenGestort en het voorstel zijn op 25, 27 en 30 nov gelijk aan 8ce254a op
     dezelfde export. Inzichten, Grip (Begrijpen en de Budget-tegel) en safeToSpend mogen veranderen en worden oud en nieuw afgedrukt.
     SABOTAGE: CONTANT=0 zet het potje Contant (alleen aan de huidige kant) op 0; dan wordt hij rood. */
const fs = require('fs');
const { execSync } = require('child_process');
const { test, expect } = require('../klok');
const { pinDatum } = require('../vaste-dag');
const MAIN_HTML = () => execSync('git show 8ce254a:index.html', { cwd: __dirname + '/../..', maxBuffer: 64 * 1024 * 1024 }).toString();
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
const DAG = process.env.REPETITIE_DAG || '2026-11-27';

test('a: Grip verwacht EUR 7.189, ondergrens EUR 6.683, vast nog EUR 816 (7 posten), Budget-tegel EUR 406 onder, bridge-stap vast -EUR 336', async ({ page }) => {
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, DAG);
  const r = await page.evaluate(() => { const S = periodeStandEind(), V = maandVooruit(), MB = gripMeterBudget(), B = brugIndeling(V);
    return { eind: S.eind, onder: S.onder, start: S.start, vast: S.vastR, pot: S.potR, zonder: S.zonderR, posten: (V.vastNogLijst || []).map((x) => `${x.naam} ${x.datum} ${x.bedrag}`),
      MB: { budget: MB.budget, verwacht: MB.verwacht, verschil: MB.verschil, netto: MB.netto }, vastStap: B ? (B.groepen.find((x) => x.k === 'vast') || {}).d : null };
  });
  const vastStap = r.vastStap;
  console.log(JSON.stringify(r, null, 1));
  expect(r.vast).toBe(816); expect(r.posten.length).toBe(7);
  expect(r.eind).toBe(7189); expect(r.onder).toBe(6683);
  expect(r.MB.budget).toBe(3651); expect(r.MB.verwacht).toBe(3245); expect(r.MB.verschil).toBe(-406);
  expect(vastStap).toBe(-336);
});

test('b: Inzichten EUR 173 van 2.255, week EUR 84 van 202, vast EUR 244 + 816, binnen EUR 5.727; na "ja": EUR 35 onder tempo', async ({ page }) => {
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, DAG);
  const r = await page.evaluate(() => { const T = periodeTegelData(), P = periodeVan(vandaagYMD()), U = uitgegevenStand({ start: P.start, eind: vandaagYMD() }), W = weekTegelBron(false), K = opnDubbelKandidaten();
    go('ins'); renderIns(); const t = document.getElementById('s-ins').innerText;
    return { potUit: T.potUit, potBud: T.potBud, tempoD: T.tempoD, tempo: T.tempo, tempoUit: T.tempoUit, U: U.r.potjes, week: W && W.N ? [W.N.nog, W.N.bedrag] : null, vast: [T.vastBet, T.vastNog], ink: T.ink, kand: K.map((x) => [x.sleutel, x.a.name, x.b.name, x.keuze]), saldo: /Verwacht saldo/i.test(t), t }; });
  console.log(JSON.stringify(r, null, 1));
  expect([r.potUit, r.potBud]).toEqual([173, 2255]); expect(r.potUit).toBe(r.U);
  expect(r.week).toEqual([84, 202]); expect(r.vast).toEqual([244, 816]);
  expect(r.ink.totaal).toBe(5727); expect([r.ink.salaris, r.ink.verg, r.ink.eenmalig]).toEqual([5216, 412, 99]);
  expect(r.saldo).toBe(false);
  expect(r.kand.length).toBeGreaterThanOrEqual(1);
  const na = await page.evaluate(() => { const K = opnDubbelKandidaten().find((x) => /Geldmaat/i.test(x.a.name) && !x.keuze); if (K) opnDubbelZet(K.sleutel, true);
    const T = periodeTegelData(), P = periodeVan(vandaagYMD()), U = uitgegevenStand({ start: P.start, eind: vandaagYMD() }); let C = null; try { C = contantRegelData(); } catch (_) {}
    return { potUit: T.potUit, U: U.r.potjes, tempoD: T.tempoD, kas: U.kas ? { uitgegeven: U.kas.uitgegeven, ruw: U.kas.uitgegevenRuw, bron: U.kas.bron } : null, kasCorrectie: U.kasCorrectie, home: C }; });
  console.log('na ja', JSON.stringify(na, null, 1));
  expect(na.potUit).toBe(na.U);
  expect(na.tempoD).toBe(-35);
});

test('c: de sheet Potjes per potje en de tabel ruimte/verwacht EUR 2.082 / EUR 1.946', async ({ page }) => {
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, DAG);
  const r = await page.evaluate(() => { const T = periodeTegelData(), S = periodeStandEind();
    return { dag: T.dagRij.map((x) => [x.contant ? 'Contant' : x.naam, x.uit, x.bud, x.tempo]), keer: T.keerRij.map((x) => [x.naam, x.bud, x.uit]),
      rijen: S.rijen.map((x) => [x.naam, x.ruimte, x.verwacht]), tR: S.rijen.reduce((a, x) => a + x.ruimte, 0), tV: S.rijen.reduce((a, x) => a + x.verwacht, 0) }; });
  console.log(JSON.stringify(r, null, 1));
  const m = Object.fromEntries(r.dag.map((x) => [x[0], x.slice(1)]));
  expect(m['Boodschappen']).toEqual([63, 488, 65]); expect(m['Overig']).toEqual([42, 371, 49]); expect(m['Contant']).toEqual([35, 400, 53]);
  expect(m['Vices']).toEqual([13, 94, 13]); expect(m['Uit eten & café']).toEqual([0, 54, 7]);
  expect([r.tR, r.tV]).toEqual([2082, 1946]);
});

test('m: deel A, meten (drukt af, toetst niets)', async ({ page }) => {
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, DAG);
  const r = await page.evaluate(() => { const V = maandVooruit(), P = periodeVan(vandaagYMD()), vd = vandaagYMD(), Pv = rekVoorstel();
    const betaald = V.vastePotjes.filter((x) => x.uit > 0).map((x) => [x.naam, x.uit]);
    const nath = { kennis: Object.entries(SET.kennis || {}).filter(([k, e]) => /nathaniel|cathalina/i.test(k + ' ' + JSON.stringify(e))).map(([k, e]) => [k, e.soort, e.gestopt || null, e.bedrag || null]),
      vastAlle: (Pv.vastAlle || []).filter((x) => /nathaniel|cathalina|woning/i.test(x.naam + ' ' + x.key)).map((x) => [x.naam, x.termijn, x.data]),
      huurPotje: (V.vastePotjes.find((x) => x.k === 'huur') || null), budgetHuur: (budgetVoorMaand(P.ym) || {}).huur };
    const opn = TX.filter((t) => String(t.date).slice(0, 10) === '2026-11-25' && /geldmaat/i.test(t.name || '')).map((t) => ({ id: t.id, naam: t.name, bedrag: t.amount, acc: t.acc, src: t.src, cat: catOf(t), telbaar: telbareTx().includes(t), opname: isOpnameTx(t) }));
    const PS = periodeStandNu(), U = uitgegevenStand({ start: P.start, eind: vd });
    let C = null; try { C = contantRegelData(); } catch (_) {}
    const bel = (() => { try { return rekBelegInleg(rekDag(vd, 1), P.eind, new Set(rekBetaal()), Pv.salAcc); } catch (e) { return String(e); } })();
    return { vastNog: V.vastNogLijst, betaald, nath, opn, periodeStandNu: PS ? PS.uit : null, uitgegevenStand: { potjes: U.r.potjes, kas: U.kas ? { uitgegeven: U.kas.uitgegeven, bron: U.kas.bron, opn: U.kas.opnTx.map((t) => t.id) } : null }, contantHome: C, beleg: bel }; });
  console.log(JSON.stringify(r, null, 1));
});

test('r: de repetitie: Home, Plan, Vermogen, de Lagen, lagenGestort en het voorstel gelijk aan 8ce254a (25, 27 en 30 nov)', async ({ browser }) => {
  const d = data(); if (!d) test.skip();
  test.setTimeout(400000);
  const contant = process.env.CONTANT != null ? +process.env.CONTANT : null;
  const meet = async (html, c) => { const out = {};
    for (const dag of ['2026-11-25', '2026-11-27', '2026-11-30']) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const page = await ctx.newPage();
      await laad(page, html, d, dag, c);
      out[dag] = await page.evaluate(() => { const re = /-?€\s?[\d.]+(?:,\d{2})?/g, lees = (id) => (document.getElementById(id).innerText.match(re) || []), u = {};
        go('dash'); renderDash(); u.home = lees('s-dash'); go('vooruit'); renderVooruit(); u.plan = lees('s-vooruit'); go('vermogen'); renderVermogen(); u.verm = lees('s-vermogen');
        const P = rekVoorstel(), G = lagenGestort(), L = lagenData();
        u.f = { P: P.ok ? [P.opzij, P.reserveringen, P.rek.map((r) => [r.acc, Math.round(r.laten)])] : null, G: G ? G.lagen.map((l) => [l.k, l.plan, l.gestort]) : null, L: [L.beschermen, L.doelen, L.saldo] };
        u.veranderd = { safe: safeToSpend().safe };
        go('ins'); renderIns(); u.veranderd.ins = lees('s-ins');
        go('maand'); try { gripKiesTab('begrijpen'); } catch (_) {} u.veranderd.begrijpen = lees('s-maand'); const MB = gripMeterBudget(); u.veranderd.budget = MB ? [MB.budget, MB.verwacht, MB.netto] : null;
        return u; });
      await ctx.close(); }
    return out; };
  const oud = await meet(MAIN_HTML(), null), nu = await meet(null, contant);
  for (const dag of Object.keys(oud)) { console.log('VERANDERD', dag, JSON.stringify({ oud: oud[dag].veranderd, nu: nu[dag].veranderd }));
    for (const k of ['home', 'plan', 'verm', 'f']) expect(JSON.stringify(nu[dag][k]), `${dag} ${k}`).toBe(JSON.stringify(oud[dag][k])); }
});
