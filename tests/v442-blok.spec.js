/* v442 sectie 6: blok 20 en 23. Nieuwe regels en controles: de INHALEN/terug-te-zetten-regel (sectie 2e), de opbouw van het
   budget vanaf 1 nov (sectie 3), de controle budget-per-groep (sectie 5), de controle opzij-label-geen-kalendermaand (sectie 1),
   en in blok 23 de controle dat elke vaste last met een termijn erin staat (de woning en Sport City). GECONSTRUEERDE fixture. */
const { test, expect } = require('@playwright/test');
const S = require('./v432-stand');
const { MAIN, LEEF } = S;
const CATH_IBAN = 'NL77ABNA0599037806';

async function bootBlok(page) {
  await S.boot(page);
  return await page.evaluate(({ MAIN, LEEF, CATH_IBAN }) => {
    const add = (acc, id, d, a, n, ds, cat) => { const t = { id, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (cat) OVR[t.id] = cat; TX.push(t); };
    for (const m of ['2026-08', '2026-09', '2026-10']) add(LEEF, 'ca' + m, m + '-01', -300, 'Nathaniel Cathalina via SEPA iDEAL/Wero', 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO ' + CATH_IBAN + ' ' + m, null);
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add(MAIN, 'sc' + m, m + '-12', -45, 'Sport City', 'BEA, BETAALPAS SPORT CITY', 'sport');
    kennisZaai(); save(); try { buildAccMeta(); } catch (_) {}
    return { b20: diagMaandBudget(maandVooruit(), true, null).join('\n'), b23: diagRekVerdeling().join('\n') };
  }, { MAIN, LEEF, CATH_IBAN });
}
const regel = (txt, naald) => txt.split('\n').find((l) => l.includes(naald)) || '';

test('a. blok 20 draagt de INHALEN / terug-te-zetten-regel (sectie 2e), niet de oude A/B', async ({ page }) => {
  const r = await bootBlok(page);
  expect(r.b20).toMatch(/INHALEN \/ TERUG TE ZETTEN \(v442 sectie 2\)/);
  expect(r.b20).not.toContain('INHALEN (v440 item 3)');
});

test('b. blok 20 toont de opbouw van het budget vanaf 1 nov, met de woning erbij', async ({ page }) => {
  const r = await bootBlok(page);
  const op = regel(r.b20, 'OPBOUW budget vanaf 1');
  expect(op).toBeTruthy();
  expect(op).toMatch(/vastgelegd .* \+ wijzigingen .* =/);
  expect(r.b20).toMatch(/de woning \(Nathaniel Cathalina/);   // de huur staat in de opbouw (zonder eigen potje: niet in het budget)
});

test('c. blok 20 controleert budget-per-groep en dat Inzichten geen opzij-kaart draagt (v443: de label-controle van v442 is mee verhuisd)', async ({ page }) => {
  const r = await bootBlok(page);
  expect(regel(r.b20, 'CONTROLE budget per groep')).toContain('klopt');
  const lab = regel(r.b20, 'CONTROLE Inzichten draagt geen opzij-kaart');
  expect(lab).toContain('klopt');
  expect(lab).not.toContain('VERSCHILT');
});

test('d. blok 23 controleert dat elke vaste last met een termijn erin staat (woning + Sport City)', async ({ page }) => {
  const r = await bootBlok(page);
  const c = regel(r.b23, 'elke vaste last met een termijn staat in blok 23');
  expect(c).toContain('sluit');
  expect(c).not.toContain('VERSCHIL');
  expect(c).toMatch(/woning .* erbij/);
  expect(c).toMatch(/Sport City erbij/);
});
