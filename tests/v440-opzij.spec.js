/* v440 mockup sectie 5: OPZIJ OP INZICHTEN. Een kaart "Opzij · netto naar je spaarrekening" op de lopende maand, met de netto
   beweging naar je spaarrekening deze salarisperiode uit opzijPeriode() (de ENE bron; geen tweede telling). Zonder gekoppelde
   spaarrekening onbekend. Het doel-tegen-gedaan blijft op Zien (sectie 3); deze kaart toont alleen het gemeten netto. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';

function seed(opts = {}) {
  const tx = [];
  const add = (id, date, amount, name, desc, acc) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: acc === SAV ? 'Instant Savings' : 'Main', refNums: [] });
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
    add('inc-' + m, m + '-05', 3000, 'Werkgever', 'SALARIS LOON');
    add('ah-' + m, m + '-04', -200, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  // netto naar de spaarrekening (SAV) deze periode: inleg min onttrekking
  if (opts.spaarIn) { add('sp-uit', '2026-10-08', -opts.spaarIn, 'Spaarpot', 'NAAR SPAREN'); add('sp-in', '2026-10-08', opts.spaarIn, 'Spaarpot', 'NAAR SPAREN', SAV); }
  if (opts.spaarUit) { add('op-in', '2026-10-09', opts.spaarUit, 'Leefgeld', 'TERUG VAN SPAREN'); add('op-uit', '2026-10-09', -opts.spaarUit, 'Leefgeld', 'TERUG VAN SPAREN', SAV); }
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct',
    budgets: { boodschappen: 600 }, manualBal: { [MAIN]: 4000, [SAV]: 2500 } };
  if (opts.spaarrekening !== false) set.savingsEnds = ['4323'];
  if (opts.verdeling != null) set.salVerdeling = { rek: SAV, opzij: opts.verdeling };
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]),
    minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, opts) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-10');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opts));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof opzijPeriode === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  await page.evaluate(() => go('ins'));
}
const kaart = (page) => page.evaluate(() => { const e = document.querySelector('#insOpzij'); return e ? { v: e.dataset.insopzij, txt: e.innerText.replace(/\s+/g, ' ') } : null; });

test('a. de netto inleg naar je spaarrekening deze periode, uit opzijPeriode()', async ({ page }) => {
  await boot(page, { spaarIn: 400, verdeling: 500 });
  const O = await page.evaluate(() => opzijPeriode().netto);
  expect(O).toBe(400);                                  // de bron: netto +400 op de spaarrekening deze periode
  const k = await kaart(page);
  expect(+k.v).toBe(400);                                // de kaart leest datzelfde getal
  expect(k.txt).toContain('deze periode');                                 // v442 sectie 1: de salarisperiode, geen kalendermaand
  expect(k.txt.toLowerCase()).not.toMatch(/\b(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\b/);
  expect(k.txt.toLowerCase()).toContain('netto naar je spaarrekening');
});

test('b. netto onder nul: geld dat je deze periode uit je spaarrekening haalde', async ({ page }) => {
  await boot(page, { spaarUit: 500, verdeling: 500 });
  const O = await page.evaluate(() => opzijPeriode().netto);
  expect(O).toBe(-500);
  const k = await kaart(page);
  expect(+k.v).toBe(-500);
  expect(k.txt).toMatch(/-\s*€\s?500/);                  // minteken vóór het euroteken
});

test('c. zonder gekoppelde spaarrekening is opzij onbekend, geen verzonnen nul', async ({ page }) => {
  await boot(page, { spaarrekening: false, verdeling: 500 });
  const k = await kaart(page);
  expect(k.v).toBe('onbekend');
  expect(k.txt).toContain('Geen spaarrekening');
});

test('d. de kaart leest opzijPeriode() en telt zelf niet (geen savedNetRange, geen savedNet)', async ({ page }) => {
  await boot(page, { spaarIn: 400, verdeling: 500 });
  const src = await kaalUit(page, 'insOpzijKaart');
  expect(src).toContain('opzijPeriode(');
  expect(src).not.toContain('savedNetRange(');
  expect(src).not.toContain('savedTxRange(');
});
