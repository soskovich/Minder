/* v440 mockup sectie 8: HET TEMPO GAAT ALLEEN OVER JE POTJES. De maandkaart op Inzichten leidt met de potjes-uitgave tegen
   het potjesdeel, met de streep op het potjes-tempo (potTempo). De vaste lasten tellen op hun eigen betaaldatum en staan als
   context eronder, "telt niet mee in het tempo", met de woning (woningForecast) als eigen regel, "(nieuw)" in zijn eerste
   maand. De woning wordt een keer geteld: hij staat op zijn eigen regel en is uit de generieke vaste-lasten afgetrokken.
   categorize() herschrijft t.id bij de boot; zoek boekingen op naam. GETALLEN VAN DE FIXTURE. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111';

function seed() {
  const tx = [];
  const add = (id, date, amount, name, desc, refNums) => tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: refNums || [] });
  for (const m of ['2026-08', '2026-09', '2026-10']) {
    add('inc-' + m, m + '-05', 3000, 'Werkgever', 'SALARIS LOON', []);
    add('vz-' + m, m + '-02', -140, 'Verzekeraar XYZ', 'SEPA INCASSO VERZEKERAAR XYZ', []);   // generieke vaste last met potje
    add('ah-' + m, m + '-04', -200, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', []);
  }
  add('ah-okt2', '2026-10-06', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', []);   // potjes-uitgave
  // de huur-Tikkie: de woning (kennis-zaai vanaf okt), aanvrager-IBAN uit de omschrijving
  add('tk', '2026-10-19', -300, 'Nathaniel Cathalina via SEPA iDEAL/Wero', 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO NL77ABNA0599037806 OKTOBER', ['506417344']);
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct',
    rules: [{ kw: 'NATHANIEL CATHALINA', cat: 'huur' }], budgets: { boodschappen: 600, verzekering: 150 }, manualBal: { [MAIN]: 4000 } };
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]),
    minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-10');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insMaandStand === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  await page.evaluate(() => go('ins'));
}

test('a. de kop en de streep gaan over je potjes, niet over het hele budget', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const k = document.querySelector('#insMaand'), S = insMaandStand();
    return { uit: +k.dataset.insuit, bud: +k.dataset.insbudget, tempo: +k.querySelector('[data-instempo]').dataset.instempo,
      kop: k.querySelector('[data-insmaandkop]').innerText.replace(/\s+/g, ' '), S }; });
  expect(r.uit).toBe(Math.round(r.S.potjes + r.S.zonder));   // de kop is de potjes-uitgave
  expect(r.bud).toBe(r.S.potDeel);                           // tegen het potjesdeel, niet het hele budget
  expect(r.tempo).toBe(r.S.potTempo);                        // de streep op het potjes-tempo, niet vast+potjes
  expect(r.tempo).not.toBe(r.S.tempo);                       // en die twee lopen uiteen (er zijn vaste lasten)
  expect(r.kop).toMatch(/van €[\d.]+ potjes/);
});

/* v443: de context-regel ("vaste lasten · op hun eigen datum ... telt niet mee in het tempo") en de eigen woningregel zijn weg;
   vast staat weer in het overzicht (Uitgegeven: vast; Nog te gaan: vast), de woning zit daarin, en er staat een korte regel
   "tempo gaat alleen over je potjes". De oorspronkelijke tests b en c zijn hierheen gemigreerd. */
test('b. de vaste lasten staan in het overzicht, met de woning erin; het tempo gaat alleen over je potjes', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const k = document.querySelector('#insMaand'), S = insMaandStand(), G = insGroepen(S);
    const leg = (x) => { const e = k.querySelector(`[data-insleg="${x}"]`); return e ? +e.dataset.v : null; };
    return { oud: !!k.querySelector('[data-insvast], [data-insniettempo], [data-inswoning]'), vast: leg('vast'), Gv: G.vast.uit,
      regel: (k.querySelector('[data-instempopotjes]') || {}).innerText || '', txt: k.innerText.replace(/\s+/g, ' '), vast0: Math.round(S.vast) }; });
  expect(r.oud).toBe(false);
  expect(r.txt).not.toContain('telt niet mee in het tempo');
  expect(r.vast).toBe(r.Gv);
  expect(r.vast).toBe(r.vast0);                              // de woning-betaling zit in vast, een keer geteld
  expect(r.regel).toBe('tempo gaat alleen over je potjes');
});
