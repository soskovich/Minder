/* v522/v522b: FIXTURE NAAR DE LOONSTROKEN VAN DE GEBRUIKER (SKF, netto), de rest GECONSTRUEERD:
     sep  24 sep  5.216,28 (salaris; reiskosten 120,00 en thuiswerk 2,45 niet uitbetaald)
     okt  26 okt  7.692,98 = 5.206,33 + bonus 2.199,50 + reiskosten 270,00 + thuiswerk 17,15
     nov  25 nov  5.727,10 = 5.215,05 + reiskosten 270,00 + thuiswerk 19,60 + eenmalige vergoeding 100,00 + correctie sep 122,45
   Tankboekingen in sep, okt en nov (Vervoer, potje 400). Vast salaris 5.216, marge 25, vergoedingen verwacht met bovengrens 400.
   o.dag pint de klok en laat boekingen na die dag weg; o.html serveert een andere index.html (de golden van v521c). */
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
const TANK = { '2026-09': [180, 95.5], '2026-10': [210, 60.25], '2026-11': [150] };
async function boot(page, o) {
  o = o || {}; const dag = o.dag || '2026-11-26';
  const tx = []; const add = (id, date, amount, name, desc, acc) => { if (date <= dag) tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); };
  for (const m of ['2026-06', '2026-07', '2026-08']) add('sal-' + m, m + '-24', 5216.28, 'SKF B.V.', 'SALARIS LOON SKF');
  add('sal-2026-09', '2026-09-24', 5216.28, 'SKF B.V.', 'SALARIS LOON SKF');
  add('sal-2026-10', '2026-10-26', 7692.98, 'SKF B.V.', 'SALARIS LOON SKF');
  add('sal-2026-11', '2026-11-25', 5727.10, 'SKF B.V.', 'SALARIS LOON SKF');
  for (const m in TANK) TANK[m].forEach((b, i) => add('tank-' + m + '-' + i, m + '-' + String(10 + i * 5), -b, 'Shell', 'SHELL TANKSTATION'));
  add('sp-1', '2026-10-27', 300, 'Spaarpot', 'NAAR SPAREN', SAV);
  const set = { budgetMonth: dag.slice(0, 7), income: 5216, autoIncome: true, limit: 70, limitMode: 'pct', budgets: { vervoer: 400, boodschappen: 400 }, savingsEnds: ['4323'],
    manualBal: { [MAIN]: 6000, [SAV]: 5000 }, irregularIncome: [] };
  const d = { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]), minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
  await page.route('**/sw.js', (r) => r.abort());
  if (o.html) await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: o.html }));
  await pinDatum(page, dag);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof salSplitsing === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  await page.evaluate(() => { window._sal = (ym) => TX.find((t) => t.amount > 0 && String(t.date).startsWith(ym) && /SALARIS/.test(t.desc)); window._sid = (ym) => (window._sal(ym) || {}).id; });
}
/* de stand van de gebruiker van voor v522 (SET.salSplit met reisPot, het antwoord reis 287 voor oktober), door load() (de migratie) */
async function oudeStand(page, o) {
  o = o || {};
  await page.evaluate((o) => { const id = _sid('2026-10');
    SET.salSplit = { vast: 5216, key: recurKey(_sal('2026-10')), naam: 'SKF B.V.', reisAan: true, reisPot: 'vervoer', reisMax: 400, marge: o.marge == null ? 25 : o.marge };
    SET.salSplitAntw = Object.assign(o.geenAntw ? {} : { [id]: { reis: 287, regel: 'b', door: 'jij', op: '2026-10-27' } }, o.extra || {}); delete SET.salSplit522; delete SET.salSplit522b;
    save(); localStorage.setItem('minder_set', JSON.stringify(SET)); load(); _dataGen++; window._rekV = null; }, o);
}
const DAGEN = ['2026-11-23', '2026-11-24', '2026-11-26', '2026-12-01'];
module.exports = { boot, oudeStand, TANK, DAGEN, MAIN, SAV };
