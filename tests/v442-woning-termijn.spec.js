/* v442 sectie 3: DE HUUR (Cathalina) als vaste last met een termijn op zijn eigen datum, op de rekening van de EXTERNE betaling.
   De huur komt via een Tikkie/iDEAL en vormt geen herkend schema, dus hij stond niet in recurringSchedule → blok 23 toonde geen
   huur-termijn. rekVoorstel leest nu woningForecast (de ene bron) en zet hem als termijn op de rekening waar de externe betaling
   van afging (hier Leefgeld, niet de salarisrekening). GECONSTRUEERDE fixture; de echte getallen komen uit jouw blok 23. */
const { test, expect } = require('@playwright/test');
const S = require('./v432-stand');
const { MAIN, LEEF } = S;
const CATH_IBAN = 'NL77ABNA0599037806';

async function bootWon(page) {
  await S.boot(page);
  return await page.evaluate(({ LEEF, CATH_IBAN }) => {
    const add = (d) => { const t = { id: 'ca' + d, date: d, amount: -300, acc: LEEF, name: 'Nathaniel Cathalina via SEPA iDEAL/Wero', desc: 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO ' + CATH_IBAN + ' ' + d, typ: '', ref: '', src: 'csv', accName: '', refNums: ['r' + d.replace(/-/g, '')] }; categorize(t); TX.push(t); };
    for (const m of ['2026-08', '2026-09', '2026-10']) add(m + '-01');   // elke 1e van de maand, via Leefgeld (externe betaling)
    kennisZaai(); save(); try { buildAccMeta(); } catch (_) {}
    const WF = woningForecast(thisYM());
    const P = rekVoorstel();
    const won = [...(P.vast || []), ...(P.vastBuiten || [])].find((x) => x.woning || /Cathalina|woonhuur/i.test(x.naam));
    const scTx = TX.find((t) => /CATHALINA/.test(t.desc || ''));
    return { WF, wonAcc: won ? won.acc : null, wonN: won ? won.n : null, wonData: won ? won.data : null, wonTermijn: won ? won.termijn : null,
      inVast: !!(won && (P.vast || []).includes(won)), isFixedWon: isFixed(scTx),
      aandeelHuur: (P.rekAlle || []).some((r) => (r.potDelen || []).some((p) => /huur/i.test(p.k))),
      LEEF, diag: diagRekVerdeling().join('\n') };
  }, { MAIN, LEEF, CATH_IBAN });
}

test('a. de woning is een actieve forecast en een vaste last in het voorstel', async ({ page }) => {
  const r = await bootWon(page);
  expect(r.WF.actief).toBe(true);
  expect(r.WF.bedrag).toBe(300);
  expect(r.wonAcc).toBeTruthy();                 // de woning staat in het voorstel (was eerder afwezig)
  expect(r.wonTermijn).toBe(300);
  expect(r.inVast).toBe(true);                   // met een termijn in de periode (niet vastBuiten)
});

test('b. de termijn staat op de rekening van de externe betaling, op zijn eigen datum', async ({ page }) => {
  const r = await bootWon(page);
  expect(r.wonAcc).toBe(r.LEEF);                 // Leefgeld (externe betaling), niet de salarisrekening
  expect(r.wonN).toBeGreaterThan(0);
  expect(r.wonData.every((d) => d.slice(8, 10) === '01')).toBe(true);   // op de 1e
  expect(r.wonData.some((d) => d >= '2026-10-24' && d <= '2026-11-30')).toBe(true);
});

test('c. de woning-betalingen tellen niet dubbel: ze zijn isFixed en vallen uit het potjes-aandeel', async ({ page }) => {
  const r = await bootWon(page);
  expect(r.isFixedWon).toBe(true);               // woningPaymentIds maakt ze isFixed
  expect(r.aandeelHuur).toBe(false);             // dus geen huur-aandeel als potje naar rato
});

test('d. blok 23 toont de huur als vaste last', async ({ page }) => {
  const r = await bootWon(page);
  expect(r.diag).toMatch(/Cathalina|[Ww]oonhuur/);
});
