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
  await K.boot(page, { set: { meldAan: true, meldBetaal: true, meldBetaalId: 'dev1', meldPotjes: { boodschappen: true } } });
  expect(await bedragen(page)).toEqual(VOOR.v516);
});
