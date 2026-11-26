/* v517: de app-kant van de betaalmelding. De stand van 20 nov 2026 (v516-stand): Boodschappen (Albert Heijn) en Vices (Kiosk),
   allebei wekelijks. Push zelf komt in de echte app; hier toetsen we de standaardstand, het afmelden en de snapshot-sleutels. */
const { test, expect } = require('./klok');
const K = require('./v516-stand');
const { bedragen } = require('./v516-bedragen');
const VOOR = require('./v516-voor.json');

test('v517 app a: betaalmelding staat standaard uit', async ({ page }) => {
  await K.boot(page, { set: { meldAan: true, meldPotjes: { boodschappen: true } } });
  const r = await page.evaluate(() => { openSetSub('meldingen'); const el = document.getElementById('setMeld');
    return { meldBetaal: SET.meldBetaal === true, betaalAan: el.getAttribute('data-meldbetaalaan'), checked: document.querySelector('[data-meldbetaalschakel]').checked }; });
  expect(r.meldBetaal).toBe(false);
  expect(r.betaalAan).toBe('0');
  expect(r.checked).toBe(false);
});

test('v517 app b: uitzetten meldt zich af bij de Worker', async ({ page }) => {
  await K.boot(page, { set: { meldAan: true, meldBetaal: true, meldBetaalId: 'dev1', psd2Url: 'https://wk.test', psd2Token: 'tok', meldPotjes: { boodschappen: true } } });
  const r = await page.evaluate(async () => {
    window.__calls = [];
    const echt = window.fetch;
    window.fetch = async (u, opt) => { window.__calls.push({ url: String(u), method: (opt && opt.method) || 'GET' }); return { ok: true, status: 200, async json() { return { ok: true }; } }; };
    await meldBetaalAanZet(false);
    window.fetch = echt;
    return { calls: window.__calls, meldBetaal: SET.meldBetaal, id: SET.meldBetaalId }; });
  expect(r.calls.some((c) => c.url === 'https://wk.test/push/afmelden' && c.method === 'POST')).toBe(true);
  expect(r.meldBetaal).toBe(false);
  expect(r.id).toBe(null);
});

test('v517 app c: de snapshot krijgt alleen de tegenpartij-sleutels van aangezette potjes', async ({ page }) => {
  // Boodschappen staat aan, Vices niet. De tegenpartij van Vices (Kiosk) mag in geen enkele sleutellijst staan.
  await K.boot(page, { set: { meldAan: true, meldBetaal: true, meldPotjes: { boodschappen: true } } });
  const r = await page.evaluate(() => { const S = meldSnapData();
    return { potjes: S.potjes, perCatVices: meldPotKeys().vices, jsonHeeftKiosk: JSON.stringify(S).includes('KIOSK') }; });
  // precies één potje in de snapshot (het aangezette), met zijn eigen tegenpartij als sleutel
  expect(r.potjes.length).toBe(1);
  expect(r.potjes[0].naam).toBe('Boodschappen');
  expect(r.potjes[0].keys).toContain('ALBERT HEIJN 1234');
  // Minder KENT de tegenpartij van Vices wel (Kiosk hoort bij vices), maar die staat niet in de snapshot
  expect(r.perCatVices).toContain('KIOSK CENTRAAL');
  expect(r.jsonHeeftKiosk).toBe(false);
});

test('v517 app d: zonder betaalmelding draagt de snapshot geen sleutels', async ({ page }) => {
  await K.boot(page, { set: { meldAan: true, meldPotjes: { boodschappen: true } } }); // meldBetaal uit
  const r = await page.evaluate(() => { const S = meldSnapData(); return { heeftKeys: 'keys' in (S.potjes[0] || {}) }; });
  expect(r.heeftKeys).toBe(false);
});

test('v517 app e: alle bedragen op Inzichten, Grip en Plan zijn gelijk aan d5e115d (v516), ook met betaalmelding aan', async ({ page }) => {
  // v524: Plan is herzien (lagen-dashboard); de 'plan'-sleutel wordt na de back-upcontrole opnieuw vastgelegd (volgende ronde).
  // Hier sluit Plan via de lagen-invariant; de overige schermen blijven byte-gelijk aan d5e115d.
  const { planLagenInvariant } = require('./plan-lagen-invariant');
  await K.boot(page, { set: { meldAan: true, meldBetaal: true, meldBetaalId: 'dev1', meldPotjes: { boodschappen: true } } });
  const n = await bedragen(page); const g = Object.assign({}, VOOR.v516); delete n.plan; delete g.plan;
  expect(n).toEqual(g);
  expect(await planLagenInvariant(page)).toMatchObject({ ok: true });
});

/* ===== v517b ===== */
const pathB = require('path'); const { pathToFileURL: tfuB } = require('url');

test('v517b app f: zonder betaalmelding is de snapshot van vorm gelijk aan v516 (geen keys, geen verwerkt)', async ({ page }) => {
  await K.boot(page, { set: { meldAan: true, meldPotjes: { boodschappen: true } } });
  const r = await page.evaluate(() => { const S = meldSnapData(); return { top: Object.keys(S), pot: S.potjes.map((p) => Object.keys(p)) }; });
  expect(r.top).toEqual(['v', 'op', 'opMs', 'weekVan', 'weekTot', 'weekbedrag', 'weekNog', 'vorige', 'potjes']);
  expect(r.pot).toEqual([['naam', 'nog']]);
});

test('v517b app g: met betaalmelding draagt elk aangezet potje de sleutels van de boekingen van die week in die categorie', async ({ page }) => {
  await K.boot(page, { set: { meldAan: true, meldBetaal: true, meldPotjes: { boodschappen: true } } });
  const r = await page.evaluate(() => { const S = meldSnapData();
    const verwacht = TX.filter((t) => t.date >= S.weekVan && t.date <= S.weekTot && catOf(t) === 'boodschappen').map((t) => txId(t, ''));
    const buiten = TX.filter((t) => t.date < S.weekVan && catOf(t) === 'boodschappen').map((t) => txId(t, ''));
    return { ver: S.potjes[0].verwerkt, verwacht, buiten }; });
  expect(r.verwacht.length).toBeGreaterThan(0);                 // de stand draagt boodschappen in deze week
  expect(r.buiten.length).toBeGreaterThan(0);                   // en ook ervoor, anders toetst de weekgrens niets
  expect(r.ver).toEqual(r.verwacht);
  for (const k of r.buiten) expect(r.ver).not.toContain(k);
});

test('v517b app h: de app en de Worker maken uit dezelfde bank-regel dezelfde sleutel', async ({ page }) => {
  await K.boot(page, { set: { meldAan: true } });
  const raws = [
    { booking_date: '2026-11-20', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '45.10' }, creditor: { name: 'Albert Heijn 1234' }, remittance_information: ['BEA, Betaalpas Albert Heijn 1234,PAS123'], bank_transaction_code: { description: 'PMNT' } },
    { booking_date: '2026-11-19', credit_debit_indicator: 'DBIT', transaction_amount: { amount: '9.99' }, creditor: {}, remittance_information: 'eCom, Betaalpas PLAYSTATION', entry_reference: 'e1' },
  ];
  const app = await page.evaluate((R) => R.map((raw) => meldTxSleutel(mapPsd2Tx(raw, 'NL00TEST0123456789'))), raws);
  const w = await import(tfuB(pathB.join(__dirname, '..', 'worker', 'worker.js')).href);
  expect(raws.map((r) => w.boekingSleutel(r))).toEqual(app);
  expect(raws.map((r) => w.mapBoeking(r).id)).toEqual(app);
});
