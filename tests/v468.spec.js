/* v468 (gevraagd door de gebruiker). Punt 1, ALLEEN METEN: twee regels van de bank met een eigen entry_reference die dezelfde Minder-id
   krijgen; de tweede valt bij de import weg. Per geval worden beide kanten vastgelegd (SET.bankIdBots, cumulatief over syncs) en blok 8
   noemt datum, bedrag, beide omschrijvingen en bank-ids, wat er verder verschilt en welke kant in je gegevens staat. Er verandert geen id.
   Punt 3: een gesloten rekening telt niet in totalBalance() of veilig te besteden, en blok 8 zegt dat nu ook. Punt 4: de boot roept
   psd2Refresh(true, true) aan zonder eigen voorcheck. GECONSTRUEERDE fixture (de vorm van v467). */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalBron } = require('./bron-kaal');
const fs = require('fs');

const N26 = 'DE89370400440532013000', ZAK = 'DE89370400440532014840';
function seed(o) {
  o = o || {};
  const tx = [];
  const P = (d, a, name, acc) => tx.push({ id: 'w' + tx.length, date: d, amount: a, acc: acc || N26, src: 'psd2', name, desc: name + ' PMNT',
    bankRef: '', typ: '', ref: '', accName: '', refNums: [] });
  for (const m of ['07', '08', '09', '10']) { P(`2026-${m}-01`, 3000, 'Werkgever Bv'); P(`2026-${m}-02`, -60, 'Albert Heijn'); }
  P('2025-03-04', -20, 'Oude Bakker', ZAK);
  const ps = { [N26]: { uid: 'u1', iban: N26, label: 'Main ··3000', bank: 'N26', exp: '2027-01-23', sessie: 'S1', hash: 'HMAIN' } };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([N26, ZAK]),
    minder_accmeta: JSON.stringify(Object.assign({ [N26]: { balance: 1000, date: '2026-10-25', bank: 'N26' }, [ZAK]: { balance: o.zakSaldo == null ? 0 : o.zakSaldo, bank: 'N26' } })),
    minder_set: JSON.stringify(Object.assign({ psd2Accounts: ps, psd2LastSync: 4102444800000, psd2Url: 'https://x.test', psd2Token: 't', limit: 70,
      opnameVanaf: '2099-12-31', toonLegeRek: true, manualBal: {}, budgets: { boodschappen: 300 }, rekGesloten: o.open ? {} : { [ZAK]: { op: '2026-05-01' } } }, o.set || {})),
    minder_plan: '{}',
  };
}
async function boot(page, o) {
  await pinDatum(page, '2026-10-25');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v468')) { sessionStorage.setItem('v468', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof runControles === 'function');
}
const raw = (eref, extra) => Object.assign({ entry_reference: eref, booking_date: '2026-10-20', value_date: '2026-10-20',
  transaction_amount: { amount: '3.50', currency: 'EUR' }, credit_debit_indicator: 'DBIT', creditor: { name: 'Koffiebar' } }, extra || {});
const koppel = (page, rows) => page.evaluate(async (rows) => {
  psd2Api = async (pad) => /balances/.test(pad) ? { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '900' } }] } : { transactions: /PDNG/.test(pad) ? [] : rows };
  try{ koppelUitlegSheet = () => {}; }catch(_){}
  await psd2IngestSession({ session_id: 'S2', aspsp: { name: 'N26' }, access: { valid_until: '2027-01-23' },
    accounts: [{ uid: 'u5', account_id: { iban: 'DE89370400440532013000' }, identification_hash: 'HMAIN', name: 'Main' }] });
  while (window._ctrlTimer) await new Promise((r) => setTimeout(r, 20));
}, rows);
const vernieuw = (page, rows) => page.evaluate(async (rows) => {
  psd2Api = async (pad) => /balances/.test(pad) ? { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '900' } }] } : { transactions: /PDNG/.test(pad) ? [] : rows };
  await psd2Refresh(true);
  while (window._ctrlTimer) await new Promise((r) => setTimeout(r, 20));
}, rows);
const blok8 = (page) => page.evaluate(() => [].concat(diagRekeningen()).join('\n'));
const gevallen = (page) => page.evaluate((a) => Object.values((SET.bankIdBots || {})[a] || {}), N26);

test.describe('v468 · punt 1: botsingen op de Minder-id, alleen meten', () => {
  test('a. twee regels met een eigen entry_reference en een andere valutadatum: beide kanten vastgelegd, "twee betalingen"', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => TX.length);
    await koppel(page, [raw('ER-A'), raw('ER-B', { value_date: '2026-10-21' })]);
    const G = await gevallen(page);
    expect(G.length).toBe(1);
    const c = G[0];
    expect(c.datum).toBe('2026-10-20'); expect(c.bedrag).toBe(-3.5);
    expect([c.a.bankId, c.b.bankId]).toEqual(['ER-A', 'ER-B']);
    expect(c.a.desc).toContain('Koffiebar'); expect(c.b.desc).toContain('Koffiebar');
    expect(c.verschil.map((v) => v.veld)).toEqual(['value_date']);
    expect(c.alInTX).toBe(false); expect(c.route).toContain('koppeling');
    /* alleen meten: de tweede is nog steeds weggelaten, er is een boeking met die id */
    const n = await page.evaluate((id) => TX.filter((t) => t.id === id).length, c.id);
    expect(n).toBe(1);
    expect(await page.evaluate(() => TX.length)).toBe(voor + 1);
    const b = await blok8(page);
    expect(b).toContain('BOTSINGEN OP DE MINDER-ID (v468, alleen meten): 1 geval vastgelegd');
    expect(b).toContain('A: bank-id ER-A'); expect(b).toContain('B: bank-id ER-B');
    expect(b).toContain('in je gegevens: A (op de valutadatum)');
    expect(b).toContain('verder verschilt: value_date "2026-10-20" / "2026-10-21"');
    expect(b).toContain('AANWIJZING: twee betalingen');
  });
  test('b. alleen de bank-id verschilt: "niet te onderscheiden", en de eerste in de volgorde staat in je gegevens', async ({ page }) => {
    await boot(page);
    await koppel(page, [raw('ER-A'), raw('ER-B')]);
    const G = await gevallen(page);
    expect(G.length).toBe(1); expect(G[0].verschil).toEqual([]);
    const b = await blok8(page);
    expect(b).toContain('in je gegevens: A, de eerste in de volgorde van de bank (de id stond er nog niet)');
    expect(b).toContain('AANWIJZING: niet te onderscheiden, alleen de bank-id verschilt');
  });
  test('c. dezelfde bank-id twee keer is geen botsing', async ({ page }) => {
    await boot(page);
    await koppel(page, [raw('ER-A'), raw('ER-A')]);
    expect((await gevallen(page)).length).toBe(0);
    expect(await blok8(page)).toContain('BOTSINGEN OP DE MINDER-ID (v468, alleen meten): 0 gevallen vastgelegd');
  });
  test('d. cumulatief: een vernieuwing zonder botsing wist het geval van de koppeling niet, een herhaling telt op en houdt de herkomst', async ({ page }) => {
    await boot(page);
    await koppel(page, [raw('ER-A'), raw('ER-B')]);
    await vernieuw(page, [raw('ER-X', { booking_date: '2026-10-24', value_date: '2026-10-24' })]);
    let G = await gevallen(page);
    expect(G.length).toBe(1); expect(G[0].keren).toBe(1);
    await vernieuw(page, [raw('ER-A'), raw('ER-B')]);
    G = await gevallen(page);
    expect(G.length).toBe(1); expect(G[0].keren).toBe(2); expect(G[0].route).toContain('vernieuwen');
    expect(G[0].alInTX).toBe(false);
  });
  test('e. stond de id al in je gegevens, dan zegt blok 8 dat niet vast te stellen is welke kant', async ({ page }) => {
    await boot(page);
    await koppel(page, [raw('ER-A')]);
    await vernieuw(page, [raw('ER-A'), raw('ER-B')]);
    expect(await blok8(page)).toContain('in je gegevens: een van de twee, niet vast te stellen');
  });
  test('f. zonder sync sinds v468 zegt blok 8 "niet vastgelegd"', async ({ page }) => {
    await boot(page, { set: { psd2Diag: { [N26]: { txN: 5, balGeland: true, txFout: '', _op: 1, _veldOp: { txN: 1 } } } } });
    expect(await blok8(page)).toContain('BOTSINGEN OP DE MINDER-ID (v468, alleen meten): niet vastgelegd (nog geen sync sinds v468)');
  });
});

test.describe('v468 · punt 3: een gesloten rekening telt niet mee', () => {
  test('g. gesloten met saldo 0 zonder saldodatum: niet bekend in totalBalance(), blok 8 zegt "nee, gesloten"', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => totalBalance());
    expect(r.known).toBe(1); expect(r.missing).toBe(0);
    const b = await blok8(page);
    const zak = b.split('\n  ' + ZAK)[1].split('\n  DE')[0];
    expect(zak).toContain('in totalBalance():  nee, gesloten (rekActief)');
    expect(zak).toContain('in safeToSpend():   nee, gesloten (via totalBalance())');
    expect(zak).not.toContain('ja, in de som');
  });
  test('h. gesloten met een saldo: totaal en veilig te besteden zijn gelijk aan de stand zonder die rekening', async ({ page }) => {
    await boot(page, { zakSaldo: 250 });
    const dicht = await page.evaluate(() => ({ tb: totalBalance().sum, safe: safeToSpend().safe }));
    expect(dicht.tb).toBe(1000);
    const open = await page.evaluate(() => { SET.rekGesloten = {}; save(); return { tb: totalBalance().sum, safe: safeToSpend().safe }; });
    expect(open.tb).toBe(1250);
    expect(Math.round(open.safe - dicht.safe)).toBe(250);
  });
});

test.describe('v468 · punt 4: de boot heeft geen tweede syncgrens', () => {
  test('i. de boot roept psd2Refresh(true, true) aan zonder voorcheck; de grens staat in psd2Refresh()', () => {
    const src = kaalBron(fs.readFileSync(__dirname + '/../index.html', 'utf8'));
    const start = src.slice(src.indexOf('load(); try{applyTheme();}'));
    expect(start).toContain('if(Object.keys(SET.psd2Accounts||{}).length) psd2Refresh(true, true);');
    expect(start).not.toMatch(/some\(k=>syncAutoMag/);
    expect(src).toContain('if(auto){ keys=keys.filter(k=>syncAutoMag(syncBankVan(k)));');
  });
});
