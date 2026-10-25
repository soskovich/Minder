/* v466 (gevraagd door de gebruiker, antwoord op v465): de syncgrens per bank. Hooguit een automatische sync per 6 uur per bank, na een
   weigering (rate limit) die dag geen automatische sync meer bij die bank, zelf vernieuwen kan altijd (met een melding als de bank
   eerder vandaag weigerde), en de boot volgt dezelfde grens. GECONSTRUEERDE fixture (die van v465). */
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
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v466')) { sessionStorage.setItem('v466', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof runControles === 'function');
  return calls;
}
/* een stub per uid die telt welke rekening werd aangeroepen; rl = uids waarvan de transactie-aanroep een rate limit geeft */
const sync = (page, o) => page.evaluate((o) => { window._uids = [];
  psd2Api = async (pad) => { const u = (/\/accounts\/([^/]+)\//.exec(pad) || [])[1] || ''; window._uids.push(u);
    if (/\/balances/.test(pad)) return { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '1000' } }] };
    if (/PDNG/.test(pad)) return { transactions: [] };
    if ((o.rl || []).includes(u)) throw new Error('API 429: {"error":"ASPSP_RATE_LIMIT_EXCEEDED"}');
    return { transactions: [] }; };
  return psd2Refresh(!!o.stil, !!o.auto).then(() => ({ uids: [...new Set(window._uids)], toast: (document.getElementById('toast') || {}).innerHTML || '', bank: SET.syncBank })); }, o || {});
const zet = (page, sb) => page.evaluate((sb) => { SET.syncBank = sb; save(); }, sb);

test.describe('v466 · de syncgrens per bank', () => {
  test('a. de grens is 6 uur: 5u59 geleden mag niet, 6u01 geleden wel, per bank', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((NU) => { SET.syncBank = { N26: { laatst: NU - 5.98 * 3600000 }, 'ABN AMRO': { laatst: NU - 6.02 * 3600000 } };
      return { n26: syncAutoMag('N26'), abn: syncAutoMag('ABN AMRO'), uren: SYNC_AUTO_UREN, nu: Date.now() }; }, NU);
    expect(r.nu).toBe(NU);
    expect(r.uren).toBe(6);
    expect(r.n26).toBe(false);
    expect(r.abn).toBe(true);
  });
  test('b. een automatische sync haalt alleen de banken op die mogen, en zet hun laatste sync', async ({ page }) => {
    await boot(page);
    await zet(page, { N26: { laatst: NU - 2 * UUR }, 'ABN AMRO': { laatst: NU - 7 * UUR } });
    const r = await sync(page, { stil: true, auto: true });
    expect(r.uids).toEqual(['u2']);
    expect(r.bank['ABN AMRO'].laatst).toBe(NU);
    expect(r.bank.N26.laatst).toBe(NU - 2 * UUR);
    const r2 = await sync(page, { stil: true, auto: true });
    expect(r2.uids).toEqual([]);
  });
  test('c. na een weigering geen automatische sync meer die dag bij die bank, de andere bank wel; de volgende dag weer', async ({ page }) => {
    await boot(page);
    await zet(page, { N26: { laatst: NU - 7 * UUR }, 'ABN AMRO': { laatst: NU - 7 * UUR } });
    const r = await sync(page, { stil: true, auto: true, rl: ['u1'] });
    expect(r.uids.sort()).toEqual(['u1', 'u2', 'u3']);
    expect(r.bank.N26.weigerDag).toBe('2026-10-24');
    expect(r.bank['ABN AMRO'].weigerDag || '').toBe('');
    /* zes uur later: ABN mag weer, N26 niet (dezelfde dag) */
    const s = await page.evaluate((NU) => { SET.syncBank.N26.laatst = NU - 7 * 3600000; SET.syncBank['ABN AMRO'].laatst = NU - 7 * 3600000;
      return { n26: syncAutoMag('N26'), abn: syncAutoMag('ABN AMRO') }; }, NU);
    expect(s).toEqual({ n26: false, abn: true });
    const r2 = await sync(page, { stil: true, auto: true });
    expect(r2.uids).toEqual(['u2']);
    /* de weigering van gisteren houdt niets tegen */
    const t = await page.evaluate((NU) => { SET.syncBank.N26 = { laatst: NU - 7 * 3600000, weigerDag: '2026-10-23' }; return syncAutoMag('N26'); }, NU);
    expect(t).toBe(true);
  });
  test('d. zelf vernieuwen kan altijd, ook binnen 6 uur en na een weigering, en meldt de weigering', async ({ page }) => {
    await boot(page);
    await zet(page, { N26: { laatst: NU - 1 * UUR, weigerDag: '2026-10-24' }, 'ABN AMRO': { laatst: NU - 1 * UUR } });
    const r = await sync(page, { stil: false });
    expect(r.uids.sort()).toEqual(['u1', 'u2', 'u3']);
    expect(r.toast).toContain('N26 weigerde eerder vandaag te veel aanvragen');
    expect(r.toast).not.toContain('ABN AMRO weigerde');
    /* zonder weigering vandaag geen melding */
    await zet(page, { N26: { laatst: NU - 1 * UUR, weigerDag: '2026-10-23' }, 'ABN AMRO': { laatst: NU - 1 * UUR } });
    const r2 = await sync(page, { stil: false });
    expect(r2.toast).not.toContain('weigerde eerder vandaag');
  });
  test('e. de boot vernieuwt na meer dan 6 uur, en niet binnen 6 uur', async ({ page }) => {
    const binnen = await boot(page, { set: { psd2LastSync: NU - 5 * UUR } });
    await page.waitForTimeout(600);
    expect(binnen.length).toBe(0);
  });
  test('f. de boot na 7 uur vernieuwt alleen de bank die mag', async ({ page }) => {
    const calls = await boot(page, { set: { psd2LastSync: NU - 7 * UUR, syncBank: { N26: { laatst: NU - 7 * UUR, weigerDag: '2026-10-24' } } } });
    await page.waitForFunction((NU) => ((SET.syncBank || {})['ABN AMRO'] || {}).laatst === NU, NU);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((u) => /accounts\/u2\//.test(u))).toBe(true);
  });
  test('g. Diagnose blok 8 noemt de syncgrens per bank', async ({ page }) => {
    await boot(page);
    await zet(page, { N26: { laatst: NU - 1 * UUR, weigerDag: '2026-10-24' }, 'ABN AMRO': { laatst: NU - 1 * UUR } });
    const t = await page.evaluate(() => [].concat(diagRekeningen()).join('\n'));
    expect(t).toContain('SYNCGRENS (v466) N26: laatste sync 24-10 11:00');
    expect(t).toContain('niet meer vandaag (de bank weigerde)');
    expect(t).toContain('SYNCGRENS (v466) ABN AMRO: laatste sync 24-10 11:00 · automatisch weer na 24-10 17:00');
  });
});
