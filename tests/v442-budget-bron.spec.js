/* v442 sectie 5: EEN BRON VOOR HET BUDGET PER GROEP (gevraagd door de gebruiker). budgetPerGroep(V) is de ENE functie voor
   vast / potjes / zonder potje; de som is altijd het vastgelegde maandbudget. Inzichten (insMaandStand), Zien (gripZienTabel),
   blok 20 punt 7 en MAANDBUDGET lezen die splitsing, en blok 20 heeft een controle "CONTROLE budget per groep ... klopt".
   Gemeld: potjes liep uiteen (Inzichten €1.816 · Zien €1.921 · blok 20 €1.903) omdat Inzichten het potjesdeel uit de forecast
   rekende (Bp − forecast-vast) in plaats van uit het budget. GETALLEN VAN DE FIXTURE. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';

function seed() {
  const tx = [];
  const add = (id, date, amount, name, desc, acc, refNums) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: acc === SAV ? 'Instant Savings' : 'Main', refNums: refNums || [] });
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
    add('inc-' + m, m + '-05', 3000, 'Werkgever', 'SALARIS LOON');
    add('vz-' + m, m + '-02', -140, 'Verzekeraar XYZ', 'SEPA INCASSO VERZEKERAAR XYZ');   // verzekering: mengd potje (budget 150, incasso 140)
    add('ah-' + m, m + '-04', -200, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');        // boodschappen: variabel potje
  }
  add('ah-okt2', '2026-10-06', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('vice-okt', '2026-10-07', -40, 'Coffeeshop', 'BEA, BETAALPAS COFFEESHOP');          // vices: zonder potje (variabel)
  add('tk', '2026-10-01', -300, 'Nathaniel Cathalina via SEPA iDEAL/Wero', 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO NL77ABNA0599037806 OKTOBER', MAIN, ['506417344']);   // woning: vaste last zonder potje
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct',
    rules: [{ kw: 'NATHANIEL CATHALINA', cat: 'huur' }], budgets: { boodschappen: 600, verzekering: 150 },
    savingsEnds: ['4323'], manualBal: { [MAIN]: 4000, [SAV]: 2500 }, salVerdeling: { rek: SAV, opzij: 500 } };
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]),
    minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-10');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof budgetPerGroep === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}
const state = (page) => page.evaluate(() => {
  const V = maandVooruit(), BG = budgetPerGroep(V), S = insMaandStand();
  go('maand');
  const rij = (k) => { const e = document.querySelector(`#gripZienStand [data-zienrij="${k}"]`); return e ? { b: +e.dataset.budget, v: +e.dataset.verwacht, d: +e.dataset.verschil } : null; };
  const diag = diagMaandBudget(V, true, null).join('\n');
  return { BG, budget: Math.round(V.budget), proj: Math.round(V.projectie),
    zienVast: rij('vast'), zienPot: rij('potjes'), zienBud: rij('budget'),
    insVastSom: S.vastSom, insPotDeel: S.potDeel, diag };
});

test('a. budgetPerGroep is de ene bron en zijn som is altijd het vastgelegde maandbudget', async ({ page }) => {
  await boot(page);
  const r = await state(page);
  expect(r.BG.som).toBe(r.budget);                                   // vast + potjes + zonder = het vastgelegde budget
  expect(r.BG.vast.b + r.BG.potjes.b + r.BG.zonder.b).toBe(r.budget);
  expect(r.BG.zonder.b).toBe(0);                                     // zonder potje heeft per constructie budget 0
});

test('b. Zien leest budgetPerGroep: vast en potjes tellen op tot de som, de woning duwt vast boven budget', async ({ page }) => {
  await boot(page);
  const r = await state(page);
  expect(r.zienVast.b).toBe(r.BG.vast.b);
  expect(r.zienPot.b).toBe(r.BG.potjes.b + r.BG.zonder.b);
  expect(r.zienVast.b + r.zienPot.b).toBe(r.zienBud.b);              // de twee rijen tellen op tot de som (budget)
  expect(r.zienVast.v + r.zienPot.v).toBe(r.zienBud.v);             // en op tot de som (verwacht)
  expect(r.zienBud.b).toBe(r.budget); expect(r.zienBud.v).toBe(r.proj);
  expect(r.zienVast.d).toBeGreaterThan(0);                          // de woning (budget 0, verwacht 300) duwt vast boven budget
});

test('c. Inzichten leest hetzelfde potjesdeel (uit het budget, niet uit de forecast)', async ({ page }) => {
  await boot(page);
  const r = await state(page);
  expect(r.insVastSom).toBe(r.BG.vast.b);                            // het vast-budget, gelijk aan Zien en blok 20
  expect(r.insPotDeel).toBe(r.BG.potjes.b + r.BG.zonder.b);          // het potjesdeel = budget, niet Bp − forecast-vast
});

test('d. blok 20 controleert dat vast en potjes op elk scherm gelijk zijn', async ({ page }) => {
  await boot(page);
  const r = await state(page);
  const regel = r.diag.split('\n').find((l) => l.includes('CONTROLE budget per groep'));
  expect(regel).toBeTruthy();
  expect(regel).toContain('klopt');
  expect(regel).not.toContain('VERSCHILT');
});

test('e. Zien en Inzichten lezen de ene bron (geen eigen vast-definitie)', async ({ page }) => {
  await boot(page);
  const zien = await kaalUit(page, 'gripZienTabel'), ins = await kaalUit(page, 'insMaandStand');
  expect(zien).toContain('budgetPerGroep(');
  expect(ins).toContain('budgetPerGroep(');
});
