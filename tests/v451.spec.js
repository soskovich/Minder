/* v451 (gevraagd door de gebruiker, antwoord op deel A van de controles): drie metingen en een keuze.
   1. Een diagnoseblok dat alleen leest en de transactie-ids telt die na categorize() door meer dan een boeking
      worden gedeeld (datum, bedrag, rekening laatste 4, aantal).
   2. Saldosoort overal geboekt: pickBalance() kiest CLBD, dan ITBD, daarna de oude volgorde. Blok 8 noemt per
      rekening welke soorten de bank aanbiedt en welke Minder gebruikt.
   5. Heeft een PSD2-transactie een eigen id van de bank (transaction_id of entry_reference)? Alleen meten: blok 8
      telt het per rekening, plus hoe vaak twee regels met DEZELFDE Minder-id een ANDERE bank-id dragen. */
const { test, expect } = require('@playwright/test');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const VANDAAG = ymd(now);
const ACC1 = '888100200';
const ACC2 = '888100300';

function seed(extraTx) {
  const tx = [
    { id: 'a1', date: VANDAAG, amount: 2500, acc: ACC1, src: 'psd2', name: 'Loon', desc: 'SALARIS MAANDELIJKS', typ: '', ref: '', accName: '', refNums: [] },
    { id: 'a2', date: VANDAAG, amount: -12.5, acc: ACC2, src: 'psd2', name: 'Bakker', desc: 'Bakker Brood PMNT', typ: '', ref: '', accName: '', refNums: [] },
  ].concat(extraTx || []);
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 2500, budgets: { boodschappen: 300 },
      psd2Url: 'https://x.test', psd2Token: 't', psd2LastSync: Date.now(),
      psd2Accounts: { [ACC1]: { uid: 'u1', label: 'Main', hash: 'h1' }, [ACC2]: { uid: 'u2', label: 'Zakgeld', hash: 'h2' } } }),
    minder_own: JSON.stringify([ACC1, ACC2]),
    minder_accmeta: JSON.stringify({ [ACC1]: { balance: 1000, date: VANDAAG }, [ACC2]: { balance: 200, date: VANDAAG } }),
    minder_plan: '{}' };
}
async function boot(page, extraTx) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(extraTx));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagGedeeldeIds === 'function' && typeof psd2Refresh === 'function' && typeof diagRekeningen === 'function');
}
/* het deel van blok 8 over een rekening: vanaf de regel die de id noemt tot de volgende rekening */
async function blok8Van(page, acc) {
  const t = await page.evaluate(() => Promise.resolve(diagRekeningen()).then((r) => r.join('\n')));
  const L = t.split('\n'), i = L.findIndex((l) => l.indexOf(acc) > -1 && /^\s{0,2}\S/.test(l));
  expect(i, 'blok 8 noemt de rekening').toBeGreaterThan(-1);
  let j = i + 1; while (j < L.length && !/^\s{0,2}\S/.test(L[j])) j++;
  return L.slice(i, j).join('\n');
}

test.describe('1 · gedeelde ids na categorize()', () => {
  test('a. twee boekingen die na categorize() dezelfde id krijgen staan erin met datum, bedrag, rekening en aantal', async ({ page }) => {
    /* de invoer draagt het geval: opgeslagen met een andere id, dezelfde rekening/dag/bedrag/omschrijving */
    const d = { date: '2026-07-14', amount: -4.5, acc: ACC1, src: 'psd2', name: 'Koffie', desc: 'Koffiebar PMNT', typ: '', ref: '', accName: '', refNums: [] };
    await boot(page, [Object.assign({ id: 'x1' }, d), Object.assign({ id: 'x2_p', pending: true }, d)]);
    const r = await page.evaluate(() => ({ ids: TX.filter((t) => t.name === 'Koffie').map((t) => t.id), L: diagGedeeldeIds() }));
    expect(r.ids[0]).toBe(r.ids[1]);
    expect(r.L[1]).toMatch(/gedeeld: 1 id\(s\), samen 2 boekingen/);
    expect(r.L).toContain('  2026-07-14 · -4.50 · rekening ··0200 · 2x · bron psd2 · waarvan pending 1');
  });
  test('b. zonder gedeelde id: "geen", en het blok schrijft niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { let n = 0; const o = localStorage.setItem.bind(localStorage); localStorage.setItem = (...a) => { n++; return o(...a); };
      const L = diagGedeeldeIds(); localStorage.setItem = o; return { L, n }; });
    expect(r.L).toContain('  geen: elke boeking heeft een eigen id');
    expect(r.n).toBe(0);
    expect(await page.evaluate(() => DIAG_BLOKKEN.some((b) => b.lees === diagGedeeldeIds))).toBe(true);
  });
});

test.describe('2 · saldosoort overal geboekt', () => {
  test('a. pickBalance kiest CLBD, dan ITBD, daarna de oude volgorde', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const k = (types) => { const u = {}; pickBalance({ balances: types.map((t, i) => ({ balance_type: t, balance_amount: { amount: String(100 + i) } })) }, u); return u.gekozen; };
      return [k(['ITAV', 'ITBD']), k(['XPCD', 'ITBD', 'CLBD']), k(['XPCD']), k(['ITAV', 'XPCD']), k(['OPBD', 'ITBD'])]; });
    expect(r).toEqual(['ITBD', 'CLBD', 'XPCD', 'ITAV', 'ITBD']);
  });
  test('b. blok 8 noemt per rekening de aangeboden soorten en of de gebruikte geboekt is', async ({ page }) => {
    await boot(page);
    await page.evaluate(({ A1, A2 }) => {
      psd2Api = async (pad) => {
        if (/transaction_status=PDNG/.test(pad)) return { transactions: [] };
        if (/\/balances/.test(pad)) return /u1/.test(pad)
          ? { balances: [{ balance_type: 'ITAV', balance_amount: { amount: '999.00' } }, { balance_type: 'ITBD', balance_amount: { amount: '1000.00' } }] }
          : { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '200.00' } }] };
        return { transactions: [] };
      };
      return psd2Refresh(true);
    }, { A1: ACC1, A2: ACC2 });
    expect(await page.evaluate((a) => ACCMETA[a].balance, ACC1)).toBe(1000);
    expect(await blok8Van(page, ACC1)).toContain('saldosoorten:       bank biedt [ITAV,ITBD] · gebruikt ITBD (geboekt)');
    expect(await blok8Van(page, ACC2)).toContain('saldosoorten:       bank biedt [XPCD] · gebruikt XPCD (NIET geboekt) · GEEN geboekt saldo aangeboden');
  });
});

test.describe('5 · eigen id van de bank', () => {
  test('a. per rekening: transaction_id en entry_reference geteld, en hoe vaak dezelfde Minder-id een andere bank-id draagt', async ({ page }) => {
    await boot(page);
    await page.evaluate((D) => {
      const r = (tid, er) => Object.assign({ transaction_amount: { amount: '4.50' }, credit_debit_indicator: 'DBIT', booking_date: D, creditor: { name: 'Koffiebar' }, remittance_information: 'Koffie', bank_transaction_code: { description: 'PMNT' } },
        tid ? { transaction_id: tid } : {}, er ? { entry_reference: er } : {});
      psd2Api = async (pad) => {
        if (/transaction_status=PDNG/.test(pad)) return { transactions: [] };
        if (/\/balances/.test(pad)) return { balances: [{ balance_type: 'CLBD', balance_amount: { amount: '100.00' } }] };
        return /u1/.test(pad) ? { transactions: [r('T1', 'E1'), r('T2', 'E2'), r('T3')] } : { transactions: [r(), r()] };
      };
      return psd2Refresh(true);
    }, VANDAAG);
    /* drie gelijke betalingen: Minder houdt er een over (zelfde id), de bank onderscheidt ze */
    expect(await page.evaluate((a) => TX.filter((t) => t.acc === a && t.name === 'Koffiebar').length, ACC1)).toBe(1);
    expect(await blok8Van(page, ACC1)).toContain('eigen id van de bank: transaction_id 3/3 (3 uniek) · entry_reference 2/3 (2 uniek) · zelfde Minder-id met een andere bank-id: 2');
    expect(await blok8Van(page, ACC2)).toContain('eigen id van de bank: transaction_id 0/2 (0 uniek) · entry_reference 0/2 (0 uniek) · zelfde Minder-id met een andere bank-id: 0');
  });
  test('b. de id van een boeking verandert niet door de meting', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const raw = { transaction_amount: { amount: '4.50' }, credit_debit_indicator: 'DBIT', booking_date: '2026-07-14', creditor: { name: 'X' }, remittance_information: 'Y' };
      return [mapPsd2Tx(raw, 'A').id, mapPsd2Tx(Object.assign({ transaction_id: 'T9', entry_reference: 'E9' }, raw), 'A').id]; });
    expect(r[0]).toBe(r[1]);
  });
});
