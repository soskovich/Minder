/* v440 forecast-dedup (item 6): de woning is een verwachte maandhuur. Een betaling aan de woning (Tikkie of overboeking
   naar dezelfde IBAN) is een vaste last (isFixed), geen variabele uitgave. De huur telt EEN keer per maand: wat betaald is
   plus wat nog verwacht wordt is het kennis-bedrag (EUR 300), nooit allebei (geen dubbeltelling met de verwachte vaste last).
   categorize() herschrijft t.id bij de boot, dus zoek boekingen op naam, niet op de gezaaide id. GETALLEN VAN DE FIXTURE. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111';

function seed() {
  const tx = [];
  const add = (id, date, amount, name, desc, refNums) => tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: refNums || [] });
  for (const m of ['2026-08', '2026-09', '2026-10']) add('inc-' + m, m + '-05', 3000, 'Werkgever', 'SALARIS LOON', []);
  for (const m of ['2026-08', '2026-09']) add('ah-' + m, m + '-08', -250, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', []);
  add('ah-okt', '2026-10-03', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', []);
  // de huur-Tikkie (okt, aanvrager-IBAN uit de omschrijving) en de gewone overboeking (nov, dezelfde IBAN)
  add('tk', '2026-10-19', -300, 'Nathaniel Cathalina via SEPA iDEAL/Wero', 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO NL77ABNA0599037806 OKTOBER', ['506417344']);
  add('ov', '2026-11-01', -300, 'Nathaniel Cathalina', 'SEPA OVERBOEKING NATHANIEL CATHALINA NL77ABNA0599037806', ['599037806']);
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct',
    rules: [{ kw: 'NATHANIEL CATHALINA', cat: 'huur' }], budgets: { boodschappen: 300 }, manualBal: { [MAIN]: 4000 } };
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]),
    minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, dag) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, dag);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof woningForecast === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}

test('a. een huurbetaling is een vaste last (isFixed), geen variabele uitgave', async ({ page }) => {
  await boot(page, '2026-10-20');   // de Tikkie (19 okt) is al betaald
  const r = await page.evaluate(() => {
    const tk = TX.find((x) => x.name.includes('via SEPA')), ah = TX.find((x) => x.name.includes('Albert Heijn') && x.date.startsWith('2026-10'));
    return { wk: kennisWoningKey(), tkFixed: isFixed(tk), tkInScope: piekInScope(tk), ahFixed: isFixed(ah), ahInScope: piekInScope(ah),
      ids: woningPaymentIds().has(tk.id) };
  });
  expect(r.wk).toBe('599037806');        // de kennis-zaai herkent Cathalina als woning
  expect(r.tkFixed).toBe(true);          // de huur telt als vaste last
  expect(r.tkInScope).toBe(false);       // en dus niet als variabele potje-uitgave
  expect(r.ids).toBe(true);
  expect(r.ahFixed).toBe(false); expect(r.ahInScope).toBe(true);   // boodschappen blijft variabel
});

test('b. een maand zonder huurbetaling: nog EUR 300 verwacht, in fixDue, en de nov-overboeking lekt niet dubbel', async ({ page }) => {
  await boot(page, '2026-12-10');   // december: geen huurbetaling, kennis actief (vanaf okt)
  const r = await page.evaluate(() => {
    const WF = woningForecast('2026-12'), L = monthLiquidity();
    const woningItems = (L.fixDueItems || []).filter((s) => s.woning || (s.cat === 'huur' && s.amount === 300));
    const it = (L.fixDueItems || []).find((s) => s.woning);
    const huur = (maandSplitsing('2026-12').vastePotjes || []).find((x) => x.k === 'huur');
    return { bedrag: WF.bedrag, betaald: WF.betaald, nog: WF.nog, n: woningItems.length, itAmount: it && it.amount, itCat: it && it.cat, huurEind: huur && huur.eind };
  });
  expect(r.bedrag).toBe(300); expect(r.betaald).toBe(0); expect(r.nog).toBe(300);
  expect(r.n).toBe(1);                              // precies EEN huur-post, niet ook de terugval op de nov-overboeking
  expect(r.itAmount).toBe(300); expect(r.itCat).toBe('huur');   // de verwachting staat in fixDue
  expect(r.huurEind).toBe(300);                                  // en in de vaste lasten van de maand
});

test('c. na de betaling: betaald EUR 300, nog 0, en de huur telt EEN keer (geen 600)', async ({ page }) => {
  await boot(page, '2026-10-20');
  const r = await page.evaluate(() => {
    const WF = woningForecast('2026-10'), L = monthLiquidity();
    const it = (L.fixDueItems || []).find((s) => s.woning);
    const huur = (maandSplitsing('2026-10').vastePotjes || []).find((x) => x.k === 'huur');
    return { betaald: WF.betaald, nog: WF.nog, heeftItem: !!it, huurEind: huur && huur.eind, huurVast: huur && huur.vast, huurUit: huur && huur.uit };
  });
  expect(r.betaald).toBe(300); expect(r.nog).toBe(0);
  expect(r.heeftItem).toBe(false);       // niets meer verwacht in fixDue
  expect(r.huurEind).toBe(300);          // de huur telt EEN keer: 300, niet 300 betaald + 300 verwacht
  expect(r.huurUit).toBe(300); expect(r.huurVast).toBe(0);
});

/* Een woning die per SEPA INCASSO betaalt (veel huur gaat zo) wordt door recurringSchedule herkend onder zijn recurKey.
   Dan zou er een post van het schema EN de woning-forecast staan: de forecast haalt de schema-post op recurKey weg zodat
   de huur een keer telt. Dit is het bereikbare geval dat de terugval/schema-dedup bewaakt (de Tikkie-variant hierboven is
   iDEAL, dus nooit herkend). */
function seedIncasso() {
  const IB = 'NL77ABNA0599037806', wk = '599037806';
  const tx = [];
  const add = (id, date, amount, name, desc, refNums) => tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: refNums || [] });
  // betaaldag de 20e: op de 10e (de pin) is de oktober-termijn nog niet verlopen, dus het schema houdt hem als verwacht.
  // het rekeningdeel van de woning-IBAN staat in refNums (zoals een SEPA-incasso de tegenrekening meegeeft), zodat
  // woningKeyVan de betaling op IBAN aan de woning koppelt.
  for (const m of ['2026-07', '2026-08', '2026-09']) { add('inc-' + m, m + '-05', 3000, 'Werkgever', 'SALARIS LOON');
    add('huur-' + m, m + '-20', -300, 'Nathaniel Cathalina', 'SEPA INCASSO NATHANIEL CATHALINA ' + IB, ['599037806']); }
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct',
    rules: [{ kw: 'NATHANIEL CATHALINA', cat: 'huur' }], budgets: { boodschappen: 300 }, manualBal: { [MAIN]: 4000 },
    kennis: { ['woning|' + wk]: { soort: 'woning', partij: 'Nathaniel Cathalina', iban: IB, wat: 'Woonhuur', bedrag: 300, dag: 1, vanaf: '2026-10', ja: true, tx: [] } } };
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]),
    minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
test('e. een per incasso herkende woning telt ook EEN keer (schema-post weggehaald)', async ({ page }) => {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-10');   // oktober nog niet betaald; het schema verwacht hem wel
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seedIncasso());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof woningForecast === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  const r = await page.evaluate(() => {
    const L = monthLiquidity();
    const huurItems = (L.fixDueItems || []).filter((s) => s.cat === 'huur' && !s.excl && !s.inPotje);
    const huur = (maandSplitsing('2026-10').vastePotjes || []).find((x) => x.k === 'huur');
    return { wk: kennisWoningKey(), herkend: recurringKeys().has('NATHANIEL CATHALINA'), n: huurItems.length,
      woning: huurItems.filter((s) => s.woning).length, bedrag: huurItems.reduce((a, s) => a + s.amount, 0), huurEind: huur && huur.eind };
  });
  expect(r.wk).toBe('599037806');
  expect(r.herkend).toBe(true);     // het schema ziet de incasso als terugkerende vaste last
  expect(r.n).toBe(1);              // maar in fixDue staat de huur EEN keer...
  expect(r.woning).toBe(1);         // ...namelijk de woning-forecast (de schema-post op recurKey is weg)
  expect(r.bedrag).toBe(300);       // niet 600
  expect(r.huurEind).toBe(300);
});

test('d. zonder woning-kennis gebeurt er niets (geen synthetische vaste last)', async ({ page }) => {
  await boot(page, '2026-10-20');
  const r = await page.evaluate(() => {
    for (const k of Object.keys(SET.kennis || {})) if (/^woning\|/.test(k)) delete SET.kennis[k];
    _dataGen++;
    const tk = TX.find((x) => x.name.includes('via SEPA'));
    const it = (monthLiquidity().fixDueItems || []).find((s) => s.woning);
    return { wk: kennisWoningKey(), tkFixed: isFixed(tk), heeftItem: !!it, ids: woningPaymentIds().size };
  });
  expect(r.wk).toBe(null);
  expect(r.tkFixed).toBe(false);   // zonder kennis is de Tikkie gewoon een variabele uitgave
  expect(r.heeftItem).toBe(false);
  expect(r.ids).toBe(0);
});
