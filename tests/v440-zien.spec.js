/* v440 mockup sectie 3: ZIEN — HOE STA JE ERVOOR. Alleen de stand: budget/verwacht/verschil per vast en potjes, de som
   (= V.budget tegen V.projectie) en opzij (doel uit Kiezen tegen gedaan deze periode, opzijPeriode). De woning zit in de vaste
   lasten en duwt vast boven budget; de sub noemt hem als die nieuw is. Vervangt de salarisbalk op Zien (v428).
   GETALLEN VAN DE FIXTURE. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';

function seed(opts = {}) {
  const tx = [];
  const add = (id, date, amount, name, desc, acc, refNums) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: acc === SAV ? 'Instant Savings' : 'Main', refNums: refNums || [] });
  // jun t/m sep zijn afgeronde maanden (maandVooruit heeft er drie nodig), okt is de lopende
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
    add('inc-' + m, m + '-05', 3000, 'Werkgever', 'SALARIS LOON');
    add('vz-' + m, m + '-02', -140, 'Verzekeraar XYZ', 'SEPA INCASSO VERZEKERAAR XYZ');
    add('ah-' + m, m + '-04', -200, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  add('ah-okt2', '2026-10-06', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('vice-okt', '2026-10-07', -40, 'Coffeeshop', 'BEA, BETAALPAS COFFEESHOP');   // vices: geen potje -> zonder potje, zodat potjes-verwacht de zonder-potje absorbeert
  add('tk', '2026-10-19', -300, 'Nathaniel Cathalina via SEPA iDEAL/Wero', 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO NL77ABNA0599037806 OKTOBER', MAIN, ['506417344']);
  if (opts.spaarIn) { add('sp-uit', '2026-10-08', -opts.spaarIn, 'Spaarpot', 'NAAR SPAREN'); add('sp-in', '2026-10-08', opts.spaarIn, 'Spaarpot', 'NAAR SPAREN', SAV); }
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct',
    rules: [{ kw: 'NATHANIEL CATHALINA', cat: 'huur' }], budgets: { boodschappen: 600, verzekering: 150 },
    savingsEnds: ['4323'], manualBal: { [MAIN]: 4000, [SAV]: 2500 } };
  if (opts.verdeling != null) set.salVerdeling = { rek: SAV, opzij: opts.verdeling };
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]),
    minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, opts) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-10');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opts));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandVooruit === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  await page.evaluate(() => go('maand'));   // Zien is de default-tab van Grip
}
const rij = (page, k) => page.evaluate((k) => { const e = document.querySelector(`#gripZienStand [data-zienrij="${k}"]`); return e ? { b: +e.dataset.budget, v: +e.dataset.verwacht, d: +e.dataset.verschil } : null; }, k);

test('a. vast en potjes, elk budget/verwacht/verschil, en ze tellen op tot de som (V.budget/V.projectie)', async ({ page }) => {
  await boot(page, { verdeling: 500 });
  const V = await page.evaluate(() => { const V = maandVooruit(); return { vasteB: Math.round(V.vaste.budget), vasteV: Math.round(V.vaste.eind), budget: Math.round(V.budget), proj: Math.round(V.projectie) }; });
  const vast = await rij(page, 'vast'), potjes = await rij(page, 'potjes'), budget = await rij(page, 'budget');
  expect(vast.b).toBe(V.vasteB); expect(vast.v).toBe(V.vasteV);     // vast = V.vaste (de woning zit erin)
  expect(budget.b).toBe(V.budget); expect(budget.v).toBe(V.proj);   // de som is V.budget tegen V.projectie
  expect(vast.b + potjes.b).toBe(budget.b);                         // de twee rijen tellen op tot de som
  expect(vast.v + potjes.v).toBe(budget.v);
  expect(vast.d).toBe(vast.v - vast.b); expect(budget.d).toBe(budget.v - budget.b);
});

test('b. de nieuwe woning staat in de sub en duwt vast boven budget', async ({ page }) => {
  await boot(page, { verdeling: 500 });
  const r = await page.evaluate(() => ({ sub: document.querySelector('#gripZienStand [data-ziensub]').innerText, WF: woningForecast('2026-10'),
    vastD: +document.querySelector('#gripZienStand [data-zienrij="vast"]').dataset.verschil }));
  expect(r.sub).toContain('Nathaniel Cathalina');
  expect(r.sub).toContain('(nieuw, vast)');
  expect(r.sub).toContain('€300');
  expect(r.WF.nieuw).toBe(true);
  expect(r.vastD).toBeGreaterThan(0);   // de huur (EUR 0 budget, EUR 300 verwacht) duwt vast boven budget
});

test('c. opzij: het doel uit Kiezen tegen wat er gedaan is (opzijPeriode), een bron', async ({ page }) => {
  await boot(page, { verdeling: 500, spaarIn: 400 });
  const r = await page.evaluate(() => { const O = opzijPeriode(); const e = document.querySelector('#gripZienStand [data-zienopzij]');
    return { doel: e.dataset.doel === '' ? null : +e.dataset.doel, gedaan: e.dataset.gedaan === '' ? null : +e.dataset.gedaan, txt: e.innerText.replace(/\s+/g, ' '), O }; });
  expect(r.doel).toBe(500);                 // uit SET.salVerdeling.opzij
  expect(r.O.doel).toBe(500);
  expect(r.gedaan).toBe(r.O.netto);         // gedaan leest opzijPeriode().netto (een bron)
  expect(r.txt).toContain('doel €500');
});

test('d. zonder salarisverdeling: nog geen doel', async ({ page }) => {
  await boot(page, {});
  const r = await page.evaluate(() => { const e = document.querySelector('#gripZienStand [data-zienopzij]'); return { doel: e.dataset.doel, txt: e.innerText.replace(/\s+/g, ' ') }; });
  expect(r.doel).toBe('');
  expect(r.txt).toContain('doel nog geen');
});
