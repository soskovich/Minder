/* v527 OP JOUW EXPORT (de back-up staat niet in de repo, dus dit draait alleen bij jou):
     MINDER_EXPORT=<pad naar je back-up van 27 nov> WIP=1 TZ=Europe/Amsterdam npx playwright test tests/wip/v527-export.spec.js
   Test a (Grip, 27 nov; v527c, v527d: de naamvarianten van Spotify en Nikki): HARD vaste lasten nog EUR 866 in 8 posten (geen Spotify; CJIB EUR 50 nog niet gezien) en bridge-stap
     vast -EUR 286. De patroon-aftrek per potje met de boekingen: vervoer ~EUR 21 (parkeergelden), kinderen ~EUR 36 (Nikki), belasting alleen
     de CJIB Regeling (meer dan EUR 0, minder dan EUR 60,19, geen Verkeersboete). Potjes op patroon, verwacht (= saldo - 866 - potjes -
     zonder potje), ondergrens en de Budget-tegel worden exact afgedrukt en sluiten op elkaar.
   Test b (Inzichten, 27 nov): Potjes EUR 173 van EUR 2.255, Deze week nog EUR 84 van EUR 202 (hele euro's), Vaste lasten EUR 244 + EUR 866, binnen
     EUR 5.727. Zonder antwoord op de opnamevraag is de tegel gelijk aan het uitgegeven-blok (uitgegevenStand); na "Ja, dezelfde":
     EUR 35 onder tempo. Drukt alles af, zodat een afwijking te plaatsen is.
   Test c (sheets): per potje Boodschappen EUR 63/488 tempo 65, Overig 42/371 tempo 49, Contant 35/400 tempo 53, Vices 13/94 tempo 13,
     Uit eten 0/54 tempo 7; de tabel ruimte/verwacht: ruimte samen EUR 2.082 (hard), verwacht gelijk aan potjes op patroon (v527c).
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

test('a: vast nog EUR 866 in 8 posten (geen Spotify, CJIB nog niet gezien), bridge vast -EUR 286; de aftrek alleen uit de CJIB Regeling, en de stand exact', async ({ page }) => {
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, DAG);
  const r = await page.evaluate(() => { const S = periodeStandEind(), V = maandVooruit(), MB = gripMeterBudget(), B = brugIndeling(V);
    const vv = vvLijst().map((x) => ({ naam: x.naam, koppel: x.koppel || null, reeks: vvReeksKey(x), betalingen: telbareTx().filter((t) => postBetaling(t, { key: 'vverw|' + x.id, reeks: vvReeksKey(x) })).map((t) => `${String(t.date).slice(0, 10)} ${t.name} ${-t.amount}`) }));
    const cjib = telbareTx().filter((t) => /cjib/i.test((t.name || '') + ' ' + (t.desc || ''))).map((t) => `${String(t.date).slice(0, 10)} ${t.name} ${-t.amount} ${catOf(t)} ${recurKey(t)}`);
    const perPot = {}; for (const x of V.patroonAftrekTx || []) (perPot[x.cat] = perPot[x.cat] || []).push(`${x.datum} ${x.naam} ${x.bedrag} (${x.post})`);
    const fam = {}; for (const it of (rekVoorstel().vastAlle || [])) { if (!/spotify|nikki/i.test(it.naam || it.key)) continue; fam[it.key] = telbareTx().filter((t) => postBetaling(t, it)).map((t) => `${String(t.date).slice(0, 10)} ${t.name} ${-t.amount} ${recurKey(t)}`); }
    const spot = (rekVoorstel().vastAlle || []).filter((it) => /spotify/i.test(it.naam || it.key)).map((it) => ({ key: it.key, cadans: it.s && it.s.cadans, maand: vastMaandSchema(it).cadans, volgende: periodeTermijnen(vastMaandSchema(it), '2026-11-24', '2026-11-24', '2027-01-31') }));
    return { fam, spot, eind: S.eind, onder: S.onder, start: S.start, vast: S.vastR, pot: S.potR, zonder: S.zonderR, posten: (V.vastNogLijst || []).map((x) => `${x.naam} ${x.datum} ${x.bedrag}${x.achter ? ' (nog niet gezien)' : ''}`),
      MB: { budget: MB.budget, verwacht: MB.verwacht, verschil: MB.verschil, netto: MB.netto }, vastStap: B ? (B.groepen.find((x) => x.k === 'vast') || {}).d : null,
      aftrek: V.patroonAftrek, perPot, vv, cjib, tR: S.rijen.reduce((a, x) => a + x.ruimte, 0), tV: S.rijen.reduce((a, x) => a + x.verwacht, 0) };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log(`STAND: saldo ${r.start} - vast ${r.vast} - potjes op patroon ${r.pot} - zonder potje ${r.zonder} = verwacht ${r.eind}; ondergrens ${r.onder}; Budget-tegel budget ${r.MB.budget} verwacht ${r.MB.verwacht} verschil ${r.MB.verschil}; tabel ruimte ${r.tR} verwacht ${r.tV}`);
  expect(r.vast).toBe(866); expect(r.posten.length).toBe(8);
  expect(r.posten.some((x) => /spotify/i.test(x))).toBe(false);
  expect(r.posten.filter((x) => /cjib/i.test(x) && /nog niet gezien/.test(x)).length).toBe(1);
  expect(r.vastStap).toBe(-286);
  expect(r.tR).toBe(2082);
  expect(r.tV).toBe(r.pot);
  expect(r.eind).toBe(r.start - r.vast - r.pot - r.zonder);
  expect(Math.round(r.aftrek.vervoer || 0)).toBe(21);
  expect(Math.round(r.aftrek.e_kinderen || 0)).toBe(36);
  expect(r.aftrek.belasting || 0).toBeGreaterThan(0); expect(r.aftrek.belasting || 0).toBeLessThan(60.19);
  expect((r.perPot.belasting || []).some((x) => /verkeersboete/i.test(x))).toBe(false);
  /* v527d: de naamvarianten. Spotify (Spotify AB + 2x Spotify) is een maandpost met de volgende termijn op 24 dec; Nikki okt en nov
     (via Stichting Moll) staan in de aftrek van Kinderen. Potjes op patroon ~EUR 1.841, verwacht ~EUR 7.244: afgedrukt in STAND. */
  expect(r.spot.every((x) => x.maand === 'maand' && x.volgende[0] === '2026-12-24')).toBe(true);
  expect((r.perPot.e_kinderen || []).filter((x) => /nikki/i.test(x)).length).toBeGreaterThanOrEqual(2);
  console.log(`v527d: potjes op patroon ${r.pot} (verwacht ~1841), verwacht ${r.eind} (verwacht ~7244)`);
});

test('b: Inzichten EUR 173 van 2.255, week EUR 84 van 202, vast EUR 244 + 866, binnen EUR 5.727; na "ja": EUR 35 onder tempo', async ({ page }) => {
  const d = data(); if (!d) test.skip();
  await laad(page, null, d, DAG);
  const r = await page.evaluate(() => { const T = periodeTegelData(), P = periodeVan(vandaagYMD()), U = uitgegevenStand({ start: P.start, eind: vandaagYMD() }), W = weekTegelBron(false), K = opnDubbelKandidaten();
    go('ins'); renderIns(); const t = document.getElementById('s-ins').innerText;
    return { potUit: T.potUit, potBud: T.potBud, tempoD: T.tempoD, tempo: T.tempo, tempoUit: T.tempoUit, U: U.r.potjes, week: W && W.N ? [W.N.nog, W.N.bedrag] : null, vast: [T.vastBet, T.vastNog], ink: T.ink, kand: K.map((x) => [x.sleutel, x.a.name, x.b.name, x.keuze]), saldo: /Verwacht saldo/i.test(t), t }; });
  console.log(JSON.stringify(r, null, 1));
  expect([r.potUit, r.potBud]).toEqual([173, 2255]); expect(r.potUit).toBe(r.U);
  expect(r.week.map((v) => Math.round(v))).toEqual([84, 202]); expect(r.vast).toEqual([244, 866]);   // v527b (punt 4): hele euro's, zoals het scherm
  expect(r.ink.totaal).toBe(5727); expect([r.ink.salaris, r.ink.verg, r.ink.eenmalig]).toEqual([5216, 412, 99]);
  expect(r.saldo).toBe(false);
  expect(r.t).toMatch(/€\s?244\s+betaald · nog €\s?866 op hun datum/); expect(r.t).toMatch(/1 post nog niet gezien/);   // v527b
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
      rijen: S.rijen.map((x) => [x.naam, x.ruimte, x.verwacht]), pot: S.potR, tR: S.rijen.reduce((a, x) => a + x.ruimte, 0), tV: S.rijen.reduce((a, x) => a + x.verwacht, 0) }; });
  console.log(JSON.stringify(r, null, 1));
  const m = Object.fromEntries(r.dag.map((x) => [x[0], x.slice(1)]));
  expect(m['Boodschappen']).toEqual([63, 488, 65]); expect(m['Overig']).toEqual([42, 371, 49]); expect(m['Contant']).toEqual([35, 400, 53]);
  expect(m['Vices']).toEqual([13, 94, 13]); expect(m['Uit eten & café']).toEqual([0, 54, 7]);
  expect(r.tR).toBe(2082); expect(r.tV).toBe(r.pot);
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
