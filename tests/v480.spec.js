/* v480: EEN OPZIJ-BEDRAG EN HUUR NIET DUBBEL.
   a. rekVoorstel().salaris rekent op het salarisdeel van v473 (storting − eenmalig − reiskosten), dezelfde bron als salarisData.
   b. "Al gekozen · Zo verdeel je je salaris" toont de BEVROREN afspraak (SET.salVerdeling: per rekening + opzij, met datum), niet een
      live herberekening; wijkt de live opzij op het salarisdeel meer dan SALV_AFWIJK af, dan staat eronder "Op je huidige salaris zou
      opzij EUR X zijn · verdeling aanpassen ›".
   c. De woning via Tikkie/iDEAL (geen SEPA-schema) plus een potje Huur op vast telt EEN keer in vast verwacht (de woning folt via
      woningForecast.betaald/nog in het potje). GECONSTRUEERD, niet gemeten. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const W = require('./v480-woning-stand');

/* --- a: een eigen boot met een gesplitste storting (zoals v473), één betaalrekening --- */
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
async function bootSplit(page, o) {
  o = o || {};
  const tx = []; const add = (id, date, amount, name, desc, acc) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) add('sal-' + m, m + '-24', 5216 + 277, 'Werkgever', 'SALARIS LOON WERKGEVER');
  add('sal-2026-10', '2026-10-26', o.okt != null ? o.okt : 7692.98, 'Werkgever', 'SALARIS LOON WERKGEVER');
  add('sp-1', '2026-10-27', 300, 'Spaarpot', 'NAAR SPAREN', SAV);
  const set = { budgetMonth: '2026-10', income: 5216, autoIncome: true, limit: 70, limitMode: 'pct', budgets: { vervoer: 600, boodschappen: 400 }, savingsEnds: ['4323'],
    manualBal: { [MAIN]: 3000, [SAV]: 5000 }, irregularIncome: [{ id: 'bonus-okt', ym: '2026-10', amount: 2500, naam: 'Bonus' }] };
  const d = { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]), minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-27');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof salSplitsing === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  await page.evaluate(() => { window._sid = (ym) => (TX.find((t) => t.amount > 0 && String(t.date).startsWith(ym) && /SALARIS/.test(t.desc)) || {}).id; });
  await page.evaluate(() => { const t = TX.find((x) => /SALARIS/.test(x.desc));
    SET.salSplit = { vast: 5216, key: recurKey(t), naam: 'Werkgever', reisAan: true, reisMax: 300, reisPot: 'vervoer' }; save(); });
}

test('a. rekVoorstel().salaris is het salarisdeel (storting − eenmalig − reiskosten) = 5216', async ({ page }) => {
  await bootSplit(page);
  /* oktober 7692,98 = 5216 vast + 287 reiskosten + 2189,98 eenmalig (de bonus beantwoord als 287 reiskosten) */
  await page.evaluate(() => salSplitAntwoord(_sid('2026-10'), 287));
  const sp = await page.evaluate(() => { const t = TX.find((x) => String(x.date).startsWith('2026-10') && /SALARIS/.test(x.desc)); return salSplitsing(t); });
  expect(sp.salaris).toBe(5216); expect(sp.reis).toBe(287); expect(Math.round(sp.eenmalig * 100) / 100).toBe(2189.98);
  const P = await page.evaluate(() => { const Pv = rekVoorstel(); return { ok: Pv.ok, salaris: Math.round(Pv.salaris) }; });
  expect(P.ok).toBe(true);
  expect(P.salaris).toBe(5216);   // sabotage (reiskosten niet aftrekken) → 5493/5503
  /* salarisData leest dezelfde bron: het salarisdeel per maand is 5216 */
  const sd = await page.evaluate(() => { const S = salarisData(); const r = S.R.find((x) => x.ym === '2026-09'); return r ? r.salaris : null; });
  expect(sd).toBe(5216);
});

/* --- b: "Al gekozen" toont de bevroren afspraak, niet de live herberekening --- */
const V432 = require('./v432-stand');
test('b. "Al gekozen" toont de bevroren opzij (1766), met een afwijk-regel op de live opzij', async ({ page }) => {
  await V432.boot(page);
  const r = await page.evaluate(({ MAIN, LEEF }) => {
    SET.salVerdeling = { op: '2026-09-24', ym: '2026-09', salYM: '2026-09', rek: { [MAIN]: 1200, [LEEF]: 850 }, opzij: 1766, plan: 280, salaris: 5216, salAcc: MAIN, start: '2026-09-24', eind: '2026-10-25', dagen: 32 }; save();
    const C = { kies: [], mee: [], TC: [], gekozen: [], uitg: [], kiesWacht: [], wachtSym: [],
      gekozenO: [{ id: 'oorz:spaargeld:salverdeling', sym: 'pat:spaargeld', soort: 'salverdeling', bron: 'oorzaak', naam: 'Zo verdeel je je salaris', act: "openSalVerdeling('oorz:spaargeld')", reden: 'LIVE opzij 9999' }] };
    document.body.insertAdjacentHTML('beforeend', '<div id="tst">' + gripKiezenNieuw(C) + '</div>');
    const row = document.querySelector('#tst [data-salvgekozen]'), afw = document.querySelector('#tst [data-salvafwijk]');
    let live = null; try { const Pv = rekVoorstel(); if (Pv.ok) live = Math.round(Pv.opzij); } catch (e) {}
    return { rowTxt: row ? row.innerText : null, afwTxt: afw ? afw.innerText : null, link: !!document.querySelector('#tst [data-salvafwijklink]'), live };
  }, { MAIN: V432.MAIN, LEEF: V432.LEEF });
  expect(r.rowTxt).toContain('1.766');              // de bevroren opzij
  expect(r.rowTxt).toContain('Salarisrekening');    // de bevroren verdeling per rekening
  expect(r.rowTxt).not.toContain('9999');           // niet de live reden
  expect(r.live).toBeGreaterThan(1766 + 25);        // de live opzij wijkt af
  expect(r.afwTxt).toContain('Op je huidige salaris');
  expect(r.afwTxt).toContain(String(r.live).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  expect(r.link).toBe(true);
});

/* --- c: de woning telt EEN keer in vast verwacht --- */
test('c. de woning via Tikkie/iDEAL telt één keer in vast verwacht (folt in het potje Huur)', async ({ page }) => {
  await W.boot(page);
  const r = await page.evaluate(() => {
    const V = maandVooruit(), BG = budgetPerGroep(V);
    const huur = (V.vastePotjes || []).find((x) => x.k === 'huur');
    return { vastV: BG.vast.v, vastB: BG.vast.b, huurEind: huur ? huur.eind : null, huurBud: huur ? huur.bud : null,
      woningPosten: rekVoorstel().vast.filter((x) => x.woning).length, wf: woningForecast() };
  });
  expect(r.huurBud).toBe(420);                 // het potje-budget in vast (potjes)
  expect(r.huurEind).toBe(371);                // Cathalina 300 + Shurgard 71, EEN keer (sabotage: 671)
  expect(r.vastV).toBe(1188);
  expect(r.woningPosten).toBe(1);              // de woning staat één keer in "nodig"
  expect(r.wf.betaald).toBe(300);              // de niet-SEPA Tikkie is als betaald herkend (de dedup)
});
