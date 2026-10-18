/* v440 item 6 punt 2: "via <betaaldienst>" achter een naam eraf, in de weergave en in een bestaande regel.
   Een bank hangt bij een betaalverzoek de dienst achter de aanvrager ("Nathaniel Cathalina via SEPA iDEAL/Wero")
   en kapt hem soms af tot een losse "via". Een Tikkie-boeking en een gewone overboeking van dezelfde naam horen
   dezelfde categorie te krijgen, zodat een regel die je op de Tikkie zette ook de overboeking vangt. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111';

function seed(rules) {
  const tx = [];
  const add = (id, date, amount, name, desc, refNums) => tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: refNums || [] });
  // de huur-Tikkie: de naam draagt de afgekapte betaaldienst-staart, de omschrijving draagt de staart ook en de aanvrager-IBAN;
  // de Tikkie-rekening staat als tegenpartij in refNums
  add('tk', '2026-10-19', -300, 'Nathaniel Cathalina via SEPA iDEAL/Wero', 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO NL77ABNA0599037806 OKTOBER', ['506417344']);
  // de gewone overboeking van volgende maand: de naam in de omschrijving zonder staart
  add('ov', '2026-11-01', -300, 'Nathaniel Cathalina', 'SEPA OVERBOEKING NATHANIEL CATHALINA NL77ABNA0599037806', ['599037806']);
  // een afgekapte losse "via" (de bank liet de dienst weg)
  add('af', '2026-10-05', -45, 'Jansen Klusbedrijf via', 'SEPA IDEAL JANSEN KLUSBEDRIJF', []);
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, rules: rules || [] };
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, rules) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-19');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(rules));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof cleanMerch === 'function' && typeof TX !== 'undefined');
}

test('a. de weergave van een Tikkie-naam verliest de betaaldienst-staart', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const tk = TX.find((x) => x.name.includes('via SEPA')), af = TX.find((x) => x.name.includes('Klusbedrijf'));
    return { tk: txNaam(tk), af: txNaam(af), partij: benoemPartij(tk) };
  });
  expect(r.tk).toBe('Nathaniel Cathalina');
  expect(r.partij).toBe('Nathaniel Cathalina');
  expect(r.af).toBe('Jansen Klusbedrijf');
});

test('b. een regel op de Tikkie-naam vangt na de migratie ook de gewone overboeking', async ({ page }) => {
  // de regel zoals hij bij het maken ontstond: cleanMerch van de naam, afgekapt op 28 tekens (dus "... VIA SEPA")
  await boot(page, [{ kw: 'NATHANIEL CATHALINA VIA SEPA', cat: 'huur' }]);
  const r = await page.evaluate(() => {
    const tk = TX.find((x) => x.name.includes('via SEPA')), ov = TX.find((x) => x.name === 'Nathaniel Cathalina');
    return { kw: SET.rules.find((x) => /CATHALINA/.test(x.kw)).kw, tk: catOf(tk), ov: catOf(ov), geraakt: (SET.mbViaRegel || {}).geraakt };
  });
  expect(r.kw).toBe('NATHANIEL CATHALINA');          // de staart is uit de regel
  expect(r.tk).toBe('huur'); expect(r.ov).toBe('huur');   // beide landen in dezelfde categorie
  expect(r.geraakt).toContainEqual({ voor: 'NATHANIEL CATHALINA VIA SEPA', na: 'NATHANIEL CATHALINA' });
});

test('d. de aanvrager-IBAN komt uit de omschrijving, nooit de Tikkie-rekening', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const tk = TX.find((x) => x.name.includes('via SEPA')), ov = TX.find((x) => x.name === 'Nathaniel Cathalina');
    return { iban: tikkieIban(tk), tegen: [...tegenIbanNums(tk)], ovTegen: [...tegenIbanNums(ov)], ovTikkie: tikkieIban(ov) };
  });
  expect(r.iban).toBe('NL77ABNA0599037806');        // de aanvrager
  expect(r.tegen).toEqual(['599037806']);            // het rekeningdeel, en niet de Tikkie-rekening 506417344
  expect(r.tegen).not.toContain('506417344');
  expect(r.ovTikkie).toBe('');                        // een gewone overboeking is geen Tikkie
  expect(r.ovTegen).toEqual(['599037806']);          // daar komt het rekeningdeel uit refNums
});

test('c. de migratie draait een keer en raakt een schone regel niet', async ({ page }) => {
  await boot(page, [{ kw: 'ALBERT HEIJN', cat: 'boodschappen' }]);
  const r = await page.evaluate(() => {
    const voor = JSON.stringify(SET.rules);
    const draaide = viaRegelMigreer();   // de vlag staat al, dus geen tweede keer
    return { draaide, kw: SET.rules[0].kw, gelijk: JSON.stringify(SET.rules) === voor };
  });
  expect(r.draaide).toBe(false);
  expect(r.kw).toBe('ALBERT HEIJN');
  expect(r.gelijk).toBe(true);
});
