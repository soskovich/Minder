/* v471 (gevraagd door de gebruiker, antwoord op het rapport over de syncgrens): (1) de telling per dag per bank, (2) de status per regel in
   de gewone transactie-aanroep (alleen meten) en het overslaan van de pending-aanroep na 10 keer 0 regels met een controle per week, de
   volgorde transacties, saldo, pending, en de koppeling zonder pending-aanroep, (3) de PSU-headers uit /aspsps in blok 8.
   GECONSTRUEERDE fixture (die van v466). */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const N26 = 'DE89370400440532013000', ABN = '521200806', SPACE = '7586', OUD = 'psd2_94a07621';
function seed(o) {
  o = o || {};
  const tx = [];
  const P = (d, a, name, acc) => tx.push({ id: 'v' + tx.length, date: d, amount: a, acc: acc || N26, src: 'psd2', name, desc: name + ' PMNT',
    bankRef: '', typ: '', ref: '', accName: '', refNums: [] });
  P('2026-10-21', -150, 'Tango Purmerend'); P('2026-10-21', -97.21, 'Tango Purmerend'); P('2026-10-23', 52.79, 'Tango Purmerend');
  for (const m of ['04', '05', '06', '07', '08', '09', '10']) { P(`2026-${m}-01`, 3000, 'Werkgever Bv'); P(`2026-${m}-02`, -60, 'Albert Heijn'); P(`2026-${m}-03`, -40, 'Jumbo', ABN); }
  P('2026-10-05', -12, 'Bakker Space', SPACE); P('2026-09-05', -8, 'Bakker Oud', OUD);
  (o.tx || []).forEach((x) => P(...x));
  const ps = { [N26]: { uid: 'u1', iban: N26, label: 'Main ··3000', bank: 'N26', exp: '2027-01-03' },
    [ABN]: { uid: 'u2', iban: 'NL00ABNA0' + ABN, label: 'Betaalrekening', bank: 'ABN AMRO', exp: '2027-01-08' },
    [SPACE]: { uid: 'u3', iban: 'DE0000000000000' + SPACE, label: 'Reservering ··' + SPACE, bank: 'N26', exp: o.spaceExp || '2027-01-03' },
    [OUD]: { uid: 'u9', iban: '', label: 'Reservering', bank: 'N26', exp: '2026-12-01' } };
  const nu = Date.parse('2026-10-23T08:00:00Z');
  const diag = { [N26]: { balGeland: true, txFout: '', _op: nu, _veldOp: { balGeland: nu } }, [ABN]: { balGeland: true, txFout: '', _op: nu, _veldOp: { balGeland: nu } },
    [SPACE]: o.spaceDiag || { balGeland: true, txFout: '', _op: nu, _veldOp: { balGeland: nu } },
    [OUD]: { balGeland: false, balFout: 'EXPIRED_SESSION', txFout: 'EXPIRED_SESSION', _op: nu, _veldOp: { balGeland: nu } } };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([N26, ABN, SPACE, OUD]),
    minder_accmeta: JSON.stringify({ [N26]: { balance: 1000, date: '2026-10-23', bank: 'N26' }, [ABN]: { balance: 500, date: '2026-10-23', bank: 'ABN AMRO' },
      [SPACE]: { balance: 40, date: '2026-10-23', bank: 'N26' }, [OUD]: { balance: 300, date: '2026-09-28', bank: 'N26' } }),
    minder_set: JSON.stringify(Object.assign({ psd2Accounts: ps, psd2Diag: diag,
      psd2LastSync: 4102444800000, psd2Url: 'https://x.test', psd2Token: 't', limit: 70, opnameVanaf: '2099-12-31', toonLegeRek: true, manualBal: {},
      budgets: { vervoer: 400, boodschappen: 300, zorg: 80, vices: 50 }, rules: [{ kw: 'TANGO', cat: 'vervoer' }, { kw: 'KAPSALON', cat: 'onvoorzien' }] }, o.set || {})),
    minder_plan: '{}',
  };
}
const NU = Date.parse('2026-10-24T10:00:00Z');   // pinDatum zet 24-10 12:00 Nederlandse tijd
const UUR = 3600000;
async function boot(page, o, net) {
  await pinDatum(page, (o && o.dag) || '2026-10-24');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  const calls = [];
  await page.route('https://x.test/**', (r) => { const u = r.request().url(); calls.push(u);
    const body = /balances/.test(u) ? { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '1000' } }] } : { transactions: [] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) }); });
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v471')) { sessionStorage.setItem('v471', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof runControles === 'function');
  return calls;
}
/* de stub: o.pag[uid] = aantal pagina's, o.stat = status per regel, o.pend[uid] = pending-regels, o.rl = [[uid, soort]] met een rate limit */
const sync = (page, o) => page.evaluate((o) => { window._log = [];
  const soortVan = (p) => /\/balances/.test(p) ? 'saldo' : /PDNG/.test(p) ? 'pending' : 'tx';
  psd2Api = async (pad) => { const u = (/\/accounts\/([^/]+)\//.exec(pad) || [])[1] || '', s = soortVan(pad); window._log.push(u + ':' + s);
    if ((o.rl || []).some(([a, b]) => a === u && b === s)) throw new Error('API 429: {"error":"ASPSP_RATE_LIMIT_EXCEEDED"}');
    if (s === 'saldo') return { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '1000' } }] };
    if (s === 'pending') { const n = ((o.pend || {})[u]) || 0; return { transactions: Array.from({ length: n }, (_, i) => ({ booking_date: '2026-10-24', transaction_amount: { amount: String(5 + i) }, credit_debit_indicator: 'DBIT', creditor: { name: 'Pend ' + i } })) }; }
    const pag = ((o.pag || {})[u]) || 1, k = /continuation_key=(\d+)/.exec(pad), nr = k ? +k[1] : 1;
    const rij = (o.stat || []).map((st, i) => Object.assign({ booking_date: '2026-10-2' + (i % 3), transaction_amount: { amount: String(10 + i + nr * 100) }, credit_debit_indicator: 'DBIT', creditor: { name: 'Winkel ' + u + i } }, st ? { status: st } : {}));
    return { transactions: rij, continuation_key: nr < pag ? String(nr + 1) : null }; };
  return psd2Refresh(true, !!o.auto).then(() => ({ log: window._log, tel: JSON.parse(JSON.stringify(SET.syncTel || {})), skip: JSON.parse(JSON.stringify(SET.pendSkip || {})) })); }, o || {});
const zet = (page, sb) => page.evaluate((sb) => { SET.syncBank = sb; save(); }, sb);
const blok8 = (page) => page.evaluate(() => [].concat(diagRekeningen()).join('\n'));
const DAG = '2026-10-24';

test.describe('v471 · 1 de telling per dag', () => {
  test('a. per bank de route, per soort de aanroepen (elke pagina telt) en de weigeringen, en de eerste weigering', async ({ page }) => {
    await boot(page);
    const r = await sync(page, { pag: { u1: 3 }, rl: [['u1', 'saldo'], ['u2', 'pending']] });
    const n = r.tel[DAG]['N26'], a = r.tel[DAG]['ABN AMRO'];
    expect(n.routes).toEqual({ automatisch: 0, handmatig: 1, koppeling: 0 });   // een sync per bank, niet per rekening
    expect(n.aanroepen).toEqual({ tx: 4, saldo: 2, pending: 2 });                 // u1 drie pagina's + u3 een
    expect(n.weigeringen).toEqual({ tx: 0, saldo: 1, pending: 0 });
    expect(n.eerste).toMatchObject({ soort: 'saldo', rek: 'DE89370400440532013000', route: 'handmatig' });
    expect(a.aanroepen).toEqual({ tx: 1, saldo: 1, pending: 1 });
    expect(a.weigeringen.pending).toBe(1);
    const r2 = await sync(page, { auto: true });   // de grens van v466: automatisch mag nog niet, dus geen telling erbij
    expect(r2.tel[DAG]['N26'].routes.automatisch).toBe(0);
  });
  test('b. de eerste weigering blijft de eerste; een automatische sync telt als automatisch', async ({ page }) => {
    await boot(page);
    await zet(page, { N26: { laatst: NU - 7 * UUR }, 'ABN AMRO': { laatst: NU - 7 * UUR } });
    await sync(page, { auto: true, rl: [['u2', 'tx']] });
    const r = await sync(page, { rl: [['u1', 'tx'], ['u2', 'tx']] });   // ABN weigert opnieuw: de eerste blijft de automatische
    expect(r.tel[DAG]['ABN AMRO'].routes).toEqual({ automatisch: 1, handmatig: 1, koppeling: 0 });
    expect(r.tel[DAG]['ABN AMRO'].weigeringen.tx).toBe(2);
    expect(r.tel[DAG]['ABN AMRO'].eerste).toMatchObject({ soort: 'tx', rek: '521200806', route: 'automatisch' });
    expect(r.tel[DAG]['N26'].eerste).toMatchObject({ soort: 'tx', rek: 'DE89370400440532013000', route: 'handmatig' });
  });
  test('c. hooguit 14 dagen: een dag van 14 dagen terug valt weg, 13 dagen terug blijft', async ({ page }) => {
    await boot(page, { set: { syncTel: { '2026-10-10': { N26: { routes: { handmatig: 1 } } }, '2026-10-11': { N26: { routes: { handmatig: 2 } } } } } });
    const r = await sync(page, {});
    expect(Object.keys(r.tel).sort()).toEqual(['2026-10-11', DAG]);
  });
  test('d. blok 8 toont het per dag, per bank, per soort', async ({ page }) => {
    await boot(page);
    await sync(page, { pag: { u1: 2 }, rl: [['u1', 'saldo']] });
    const t = await blok8(page);
    expect(t).toContain('TELLING PER DAG (v471');
    expect(t).toContain(DAG + '  N26:  syncs automatisch 0 · handmatig 1 · koppeling 0');
    expect(t).toContain('aanroepen transacties 3 · saldo 2 · pending 2');
    expect(t).toContain('weigeringen transacties 0 · saldo 1 · pending 0');
    expect(t).toMatch(/eerste weigering: 24-10 \d\d:\d\d · saldo · rekening DE89370400440532013000 · route handmatig/);
    expect(t).toContain(DAG + '  ABN AMRO:  syncs');
  });
});

test.describe('v471 · 2 pending: eerst meten, dan overslaan', () => {
  test('e. de status per regel wordt gelezen, niet bewaard, en niet in de id; blok 8 telt hem per bank', async ({ page }) => {
    await boot(page);
    const m = await page.evaluate(() => { const raw = { booking_date: '2026-10-20', transaction_amount: { amount: '7' }, credit_debit_indicator: 'DBIT', creditor: { name: 'X' } };
      const a = mapPsd2Tx(raw, 'acc'), b = mapPsd2Tx(Object.assign({ status: 'book' }, raw), 'acc');
      return { st: b.bankStatus, json: JSON.stringify(a) === JSON.stringify(b), id: a.id === b.id, keys: Object.keys(b).includes('bankStatus') }; });
    expect(m).toEqual({ st: 'BOOK', json: true, id: true, keys: false });
    await sync(page, { stat: ['BOOK', 'BOOK', 'PDNG', ''] });
    const r = await page.evaluate(() => ({ d: SET.psd2Diag['521200806'].txStatus, opgeslagen: localStorage.getItem('minder_tx').includes('bankStatus') }));
    expect(r.d).toEqual({ BOOK: 2, PDNG: 1, 'zonder status': 1 });
    expect(r.opgeslagen).toBe(false);
    const t = await blok8(page);
    expect(t).toContain('STATUS PER REGEL (v471) N26: BOOK 4 · PDNG 2 · zonder status 2 (over 2 rekeningen');
    expect(t).toContain('STATUS PER REGEL (v471) ABN AMRO: BOOK 2 · PDNG 1 · zonder status 1 (over 1 rekening,');
  });
  test('f. na 10 pending-aanroepen met 0 regels slaat de sync pending over voor die bank; de andere bank niet', async ({ page }) => {
    await boot(page, { set: { pendSkip: { N26: { reeks: [0, 0, 0, 0, 0, 0, 0, 0], laatst: 0 }, 'ABN AMRO': { reeks: [0, 0, 0, 0, 0, 0, 0, 0, 0, 3], laatst: 0 } } } });
    let r = await sync(page, {});   // N26: twee rekeningen, dus 10 nullen
    expect(r.skip.N26.reeks).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    r = await sync(page, {});
    expect(r.log.filter((x) => /^u[13]:pending/.test(x))).toEqual([]);
    expect(r.log.filter((x) => x === 'u2:pending')).toEqual(['u2:pending']);
    const d = await page.evaluate(() => SET.psd2Diag['DE89370400440532013000']);
    expect(d.pendOvergeslagen).toBe(true);
    const t = await blok8(page);
    expect(t).toMatch(/PENDING \(v471\) N26: overgeslagen · de laatste 10 aanroepen gaven 0 regels · volgende controle \d\d-\d\d/);
    expect(t).toContain('PENDING (v471) ABN AMRO: wordt aangeroepen');
  });
  test('g. een controle per week: na 7 dagen roept de sync pending weer aan, en een regel zet het overslaan uit', async ({ page }) => {
    const oud = Date.parse('2026-10-17T08:00:00Z'), recent = Date.parse('2026-10-18T08:00:00Z');
    await boot(page, { set: { pendSkip: { N26: { reeks: Array(10).fill(0), laatst: oud }, 'ABN AMRO': { reeks: Array(10).fill(0), laatst: recent } } } });
    let r = await sync(page, { pend: { u3: 2 } });
    expect(r.log.filter((x) => /:pending/.test(x)).sort()).toEqual(['u1:pending', 'u3:pending']);   // N26 controle, ABN nog overgeslagen
    expect(r.skip.N26.reeks.slice(-2).sort()).toEqual([0, 2]);
    r = await sync(page, {});
    expect(r.log.filter((x) => /^u[13]:pending/.test(x)).length).toBe(2);   // de 2 in de reeks: geen overslaan meer
  });
  test('h. een mislukte pending-aanroep telt niet in de reeks', async ({ page }) => {
    await boot(page, { set: { pendSkip: { N26: { reeks: Array(9).fill(0), laatst: 0 } } } });
    const r = await sync(page, { rl: [['u1', 'pending'], ['u3', 'pending']] });
    expect(r.skip.N26.reeks.length).toBe(9);
    const r2 = await sync(page, {});
    expect(r2.log.filter((x) => /^u[13]:pending/.test(x)).length).toBe(2);
  });
  test('i. de volgorde per rekening is transacties, saldo, pending', async ({ page }) => {
    await boot(page);
    const r = await sync(page, { pag: { u1: 2 } });
    const u1 = r.log.filter((x) => x.startsWith('u1:')).map((x) => x.slice(3));
    expect(u1).toEqual(['tx', 'tx', 'saldo', 'pending']);
  });
  test('j. de koppeling doet geen pending-aanroep en telt als route koppeling', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => { const log = []; psd2Api = async (pad) => { log.push(pad);
        if (/balances/.test(pad)) return { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '50' } }] };
        return { transactions: [{ booking_date: '2026-10-20', transaction_amount: { amount: '3' }, credit_debit_indicator: 'DBIT', creditor: { name: 'Y' }, status: 'BOOK' }] }; };
      koppelUitlegSheet = () => {};
      await psd2IngestSession({ session_id: 'S9', aspsp: { name: 'N26' }, access: { valid_until: '2027-01-21' }, accounts: [{ uid: 'k1', account_id: { iban: 'DE89370400440532013000' }, name: 'Main' }] });
      const acc = Object.keys(SET.psd2Accounts).find((k) => SET.psd2Accounts[k].sessie === 'S9');
      return { log, tel: SET.syncTel['2026-10-24'].N26, st: SET.psd2Diag[acc].txStatus }; });
    expect(r.log.some((p) => /PDNG/.test(p))).toBe(false);
    expect(r.log.length).toBe(2);
    expect(r.tel.routes.koppeling).toBe(1);
    expect(r.tel.aanroepen).toEqual({ tx: 1, saldo: 1, pending: 0 });
    expect(r.st).toEqual({ BOOK: 1 });
  });
});

test.describe('v471 · 3 PSU-headers', () => {
  test('k. bij het kiezen van een bank legt de app required_psu_headers per bank vast, en blok 8 toont het', async ({ page }) => {
    await boot(page);
    await page.evaluate(async () => { psd2Api = async () => ({ aspsps: [
      { name: 'N26', country: 'DE', required_psu_headers: ['Psu-Ip-Address', 'Psu-User-Agent'] },
      { name: 'ABN AMRO', country: 'NL', required_psu_headers: [] }, { name: 'Bunq', country: 'NL' } ] }); await psd2Connect(); });
    const P = await page.evaluate(() => SET.aspspPsu);
    expect(P.N26.headers).toEqual(['Psu-Ip-Address', 'Psu-User-Agent']);
    expect(P.Bunq.headers).toBe(null);
    const t = await blok8(page);
    expect(t).toContain('N26 (DE): Psu-Ip-Address, Psu-User-Agent');
    expect(t).toContain('ABN AMRO (NL): geen verplichte PSU-headers');
  });
});
