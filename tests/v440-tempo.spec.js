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

test('b. de vaste lasten staan als context, telt niet mee in het tempo', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const k = document.querySelector('#insMaand'), S = insMaandStand(), WF = woningForecast('2026-10');
    const vast = k.querySelector('[data-insvast]');
    return { heeftVast: !!vast, genB: vast ? +vast.dataset.insvast : null, genN: vast ? +vast.dataset.insvastnog : null,
      niettempo: !!k.querySelector('[data-insniettempo]'), txt: k.innerText.replace(/\s+/g, ' '), S, wB: WF.betaald, wN: WF.nog, nogVast: Math.round(S.nogVast), vast0: Math.round(S.vast) }; });
  expect(r.heeftVast).toBe(true);
  expect(r.niettempo).toBe(true);
  expect(r.txt).toContain('telt niet mee in het tempo');
  // de woning is uit de generieke vaste-lasten afgetrokken (een keer geteld): genB = vast - woning-betaald, genN = nogVast - woning-nog
  expect(r.genB).toBe(Math.max(r.vast0 - r.wB, 0));
  expect(r.genN).toBe(Math.max(r.nogVast - r.wN, 0));
  expect(r.genB).not.toBe(r.vast0);                          // de aftrek doet ertoe (de woning zit in S.vast)
});

test('c. de woning staat als eigen regel, met (nieuw) in zijn eerste maand', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const k = document.querySelector('#insMaand'), WF = woningForecast('2026-10');
    const w = k.querySelector('[data-inswoning]');
    return { heeftWoning: !!w, bedrag: w ? +w.dataset.inswoning : null, txt: w ? w.innerText.replace(/\s+/g, ' ') : '', wBedrag: WF.bedrag, nieuw: WF.nieuw }; });
  expect(r.heeftWoning).toBe(true);
  expect(r.nieuw).toBe(true);                                // vanaf 2026-10 = de lopende maand
  expect(r.txt).toContain('Nathaniel Cathalina');
  expect(r.txt).toContain('(nieuw)');
  expect(r.txt).toContain('€300');                           // het kennis-bedrag
});
