/* v442 sectie 2: TERUG TE ZETTEN — een grootboek over de salarisperiodes. Elke afgesloten periode met netto opzij < 0 opent een
   tekort; het telt op over de periodes en gaat omlaag door (b) netto boven het doel in een latere periode en (c) een
   "terugzetten"-bestemming (watOver/onregBestemming inhalen). Nooit dubbel aflossen. GECONSTRUEERDE fixture (de echte periodes
   staan op het toestel): doel €300, augustus −€500 (tekort), september +€500 (€200 boven het doel). */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';

function seed(opts = {}) {
  const tx = [];
  const add = (id, date, amount, name, desc, acc) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: acc === SAV ? 'Instant Savings' : 'Main', refNums: [] });
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add('inc-' + m, m + '-05', 3000, 'Werkgever', 'SALARIS LOON');
  add('ont-aug', '2026-08-10', -500, 'Spaarpot', 'VAN SPAREN', SAV);   // augustus-periode (afgerond): netto −500 → tekort 500
  add('in-sep', '2026-09-10', 500, 'Spaarpot', 'NAAR SPAREN', SAV);    // september-periode (afgerond): netto +500 → €200 boven doel 300
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct',
    budgets: { boodschappen: 600 }, savingsEnds: ['4323'], manualBal: { [MAIN]: 4000, [SAV]: 2500 },
    salVerdeling: { rek: SAV, opzij: 300 } };
  if (opts.watOverInhalen != null) set.watOver = { '2026-09': { delen: { inhalen: opts.watOverInhalen }, resWelke: '', anderLabel: '', over: 0, op: '2026-10-01' } };
  Object.assign(set, opts.set || {});
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]),
    minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, opts) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-10');   // lopende periode = 5 okt .. 4 nov; aug en sep zijn afgerond
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opts));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof opzijInhalen === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}
const led = (page) => page.evaluate(() => opzijInhalen());

test('a. een tekort-periode en een latere overschot-periode: €500 − €200 = €300 open', async ({ page }) => {
  await boot(page);
  const I = await led(page);
  expect(I.meetbaar).toBe(true);
  expect(I.onttrokkenTot).toBe(500);                 // augustus −500
  expect(I.overschotTot).toBe(200);                  // september €200 boven het doel
  expect(I.open).toBe(300);                          // 500 − 200
  expect(I.afgelost).toBe(200);
  const aug = I.periodes.find((r) => r.ym === '2026-08');
  expect(aug.tekort).toBe(500); expect(aug.teruggezet).toBe(200); expect(aug.open).toBe(300);
});

test('b. een terugzetten-bestemming van €300 maakt het open bedrag nul', async ({ page }) => {
  await boot(page, { watOverInhalen: 300 });
  const I = await led(page);
  expect(I.terug).toBe(300);
  expect(I.open).toBe(0);                             // 500 − 200 (overschot) − 300 (terugzetten) = 0
  expect(I.afgelost).toBe(500);
});

test('c. nooit dubbel aflossen: een te grote terugzetting klemt op wat open staat', async ({ page }) => {
  await boot(page, { watOverInhalen: 1000 });
  const I = await led(page);
  expect(I.open).toBe(0);                             // niet negatief
  expect(I.afgelost).toBe(500);                       // hoogstens wat er onttrokken is
  expect(I.afgelost).toBeLessThanOrEqual(I.onttrokkenTot);
});

test('d. de lopende periode telt niet mee in het grootboek (opzij deze periode staat los)', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const I = opzijInhalen(); return { ymsInLedger: I.periodes.map((p) => p.ym), cur: salPeriode().cur.ym }; });
  expect(r.ymsInLedger).not.toContain(r.cur);        // de lopende periode (oktober) staat niet in het grootboek
  expect(r.ymsInLedger).toContain('2026-08');
});

test('e. het grootboek is sinds v470 geen bron voor Plan: geen regel, wel de historie in blok 20', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { go('vooruit'); const reg = document.getElementById('spaarOverRegel');
    return { regel: !!reg, open: opzijInhalen().open, bron: planTerug().totaal, diag: diagMaandBudget(maandVooruit(), true, null).join('\n') }; });
  expect(r.open).toBe(300);
  expect(r.bron).toBe(0);
  expect(r.regel).toBe(false);
  expect(r.diag).toContain('sinds v470 historie, geen bron meer');
  expect(r.diag).toMatch(/TOTAAL OPEN \(terug te zetten\): €300/);
});
