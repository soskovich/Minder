/* v440 item 6 punt 3/4: de woning is Nathaniel Cathalina (NL77ABNA0599037806), gematcht op IBAN met de naam als terugval.
   Zowel de huur-Tikkie (aanvrager-IBAN uit de omschrijving) als de latere gewone overboeking naar diezelfde IBAN valt onder
   de woning. Ml Macnack is de vorige woning (gestopt). Een huurbetaling wordt nooit een lening of uitgeleend. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111';

function seed() {
  const tx = [];
  const add = (id, date, amount, name, desc, refNums) => tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: refNums || [] });
  add('mac', '2026-08-01', -300, 'Ml Macnack', 'SEPA OVERBOEKING ML MACNACK HUURBETALING', []);
  add('tk', '2026-10-19', -300, 'Nathaniel Cathalina via SEPA iDEAL/Wero', 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO NL77ABNA0599037806 OKTOBER', ['506417344']);
  add('ov', '2026-11-01', -300, 'Nathaniel Cathalina', 'SEPA OVERBOEKING NATHANIEL CATHALINA NL77ABNA0599037806', ['599037806']);
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, rules: [{ kw: 'NATHANIEL CATHALINA', cat: 'huur' }] };
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-19');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof woningKeyVan === 'function' && typeof TX !== 'undefined');
}

test('a. de woning is Cathalina (op IBAN), niet de gestopte Macnack', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const E = kennisGet('woning|' + ibanNum('NL77ABNA0599037806'));
    const mac = Object.entries(SET.kennis || {}).find(([k, v]) => v && v.soort === 'woning' && /MACNACK/.test(k));
    return { key: kennisWoningKey(), partij: E && E.partij, iban: E && E.iban, bedrag: E && E.bedrag, vanaf: E && E.vanaf, macGestopt: mac && mac[1].gestopt };
  });
  expect(r.key).toBe('599037806');            // de actieve woning, niet Macnack
  expect(r.partij).toBe('Nathaniel Cathalina');
  expect(r.iban).toBe('NL77ABNA0599037806');
  expect(r.bedrag).toBe(300); expect(r.vanaf).toBe('2026-10');
  expect(r.macGestopt).toBe('2026-08');        // Macnack blijft als vorige woning, gestopt
});

test('b. een Tikkie en een gewone overboeking naar dezelfde IBAN horen bij dezelfde woning', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const tk = TX.find((x) => x.name.includes('via SEPA')), ov = TX.find((x) => x.name === 'Nathaniel Cathalina');
    return { tk: woningKeyVan(tk), ov: woningKeyVan(ov), tkCat: catOf(tk), ovCat: catOf(ov) };
  });
  expect(r.tk).toBe('599037806'); expect(r.ov).toBe('599037806');   // beide onder de woning-sleutel
  expect(r.tkCat).toBe('huur'); expect(r.ovCat).toBe('huur');        // en beide Huur
});

test('c. een huurbetaling wordt nooit een lening of uitgeleend', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const tk = TX.find((x) => x.name.includes('via SEPA'));
    markLoan(tk.id, 'uit');     // de gebruiker probeert hem als uitgeleend te markeren
    return { loan: !!loanFor(tk.id), loans: (SET.loans || []).length, cat: catOf(tk) };
  });
  expect(r.loan).toBe(false); expect(r.loans).toBe(0);   // niet in UITGELEEND
  expect(r.cat).toBe('huur');                             // blijft huur
});
