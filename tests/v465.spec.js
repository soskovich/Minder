/* v465 (gevraagd door de gebruiker: antwoord op v464 en blok 8 van 24-10 19:49). 1: contant uit een bron (veilig te besteden, netto
   vermogen en de contant-regel op Home lezen dezelfde schatting), met een controle in blok 20. 3: gedragstests voor de ringtekst op Zien en
   een boeking die in twee lijsten staat onder LET OP. 4: een sync met saldo maar zonder transacties (rate limit) is geen vergelijkingspunt
   en geen geslaagde sync; Diagnose zegt "bank weigerde: te veel aanvragen vandaag". 5: voor een nieuwe koppeling de waarschuwing per
   rekening die wegvalt. 6: wintertijd vanaf 25-10 03:00. GECONSTRUEERDE fixture (die van v464). */
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
async function boot(page, o, dag) {
  await pinDatum(page, dag || '2026-10-24');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v465')) { sessionStorage.setItem('v465', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof runControles === 'function');
}
/* een sync met een stub per uid: bal (saldo als tekst), tx (ruwe regels), txFout (de transactie-aanroep gooit), pendFout */
const sync = (page, o) => page.evaluate((o) => {
  psd2Api = async (pad) => { const u = (/\/accounts\/([^/]+)\//.exec(pad) || [])[1] || '';
    if (/\/balances/.test(pad)) return { balances: [{ balance_type: u === 'u2' ? 'ITBD' : 'XPCD', balance_amount: { amount: (o.bal || {})[u] || (u === 'u2' ? '500' : '1000') } }] };
    if (/PDNG/.test(pad)) { if ((o.pendFout || {})[u]) throw new Error((o.pendFout || {})[u]); return { transactions: [] }; }
    if ((o.txFout || {})[u]) throw new Error((o.txFout || {})[u]);
    return { transactions: (o.tx || {})[u] || [] }; };
  return psd2Refresh(true); }, o || {});
const RL = 'API 429: {"error":"ASPSP_RATE_LIMIT_EXCEEDED"}';

test.describe('1 · contant uit een bron', () => {
  const kas = { contant: { stand: 720, datum: '2026-10-07', op: 0 }, contantHist: [{ datum: '2026-10-07', stand: 720, op: 0, bron: 'telling' }],
    budgets: { vervoer: 400, boodschappen: 300, zorg: 80, vices: 50, contant: 400 } };
  test('a. veilig te besteden, het netto vermogen en de contant-regel op Home tellen dezelfde schatting, niet de oude telling', async ({ page }) => {
    await boot(page, { set: kas }, '2026-10-25');
    const r = await page.evaluate(() => { let bank = 0; for (const a of OWN) { if (!rekActief(a)) continue; const b = accBalance(a); if (b != null) bank += b; }
      return { sts: safeToSpend().contant, nw: Math.round((netWorth().liq - bank) * 100) / 100, home: contantRegelData().bedrag, oud: contantVerwacht(), S: contantSchatting() }; });
    expect(r.S.dagen).toBe(18);
    expect(r.home).toBeCloseTo(r.S.stand, 2);
    expect(r.sts).toBeCloseTo(r.home, 2);
    expect(r.nw).toBeCloseTo(r.home, 2);
    expect(r.oud).toBe(720);
    expect(Math.abs(r.sts - r.oud)).toBeGreaterThan(100);   // de schatting wijkt hier echt af van de telling, anders meet de test niets
  });
  test('b. blok 20: "CONTROLE contant (v465): ... → klopt"', async ({ page }) => {
    await boot(page, { set: kas }, '2026-10-25');
    const t = await page.evaluate(() => [].concat(diagSalarisVerdeling()).join('\n'));
    const regel = String(t).split('\n').find((l) => /CONTROLE contant \(v465\)/.test(l)) || '';
    expect(regel).toMatch(/in veilig te besteden .* = in netto vermogen .* = contant-regel op Home .* → klopt/);
  });
});

test.describe('3 · gedragstests in plaats van broncode-tests', () => {
  test('a (v464 punt 4). Zien met een opzij-periode: de ringtekst is "€2.031 opzij · volgens je verdeling €1.766"', async ({ page }) => {
    await boot(page, { set: { salVerdeling: { opzij: 1766, rek: {}, salYM: '2026-10' } } }, '2026-10-25');
    const t = await page.evaluate(() => { opzijPeriode = () => ({ meetbaar: true, netto: 2031, doel: 1766 }); go('maand');
      const e = document.querySelector('[data-meterverwachtdoel]'); return e ? e.innerText : null; });
    expect(t).toBe('€2.031 opzij · volgens je verdeling €1.766');
  });
  test('b (v464 punt 5b). een ontvangst die in buiten EN in "wisselt van groep" staat, staat een keer onder LET OP', async ({ page }) => {
    await boot(page, { tx: [['2026-04-08', 7, 'Revolut Bolcom', ABN]], set: { wissel420: { ids: [], op: '2026-01-01', bevestigd: '2026-01-01' } } }, '2026-10-25');
    const r = await page.evaluate(() => { const T = TX.find((t) => t.name === 'Revolut Bolcom');
      return { cat: catOf(T), wissel: WISSEL420.includes(T.id), tekst: [].concat(diagSalarisVerdeling()).join('\n') }; });
    expect(r.cat).toBe('persoonlijk');
    expect(r.wissel).toBe(true);   // de boeking staat in beide lijsten (bTx en wissel), anders meet de test de ontdubbeling niet
    const L = r.tekst.split('\n'), i = L.findIndex((l) => /LET OP apr/.test(l));
    expect(i).toBeGreaterThan(-1);
    const onder = []; for (let j = i + 1; j < L.length && /^\s{8}\d\d-\d\d /.test(L[j]); j++) onder.push(L[j]);
    expect(onder.filter((l) => /Revolut Bolcom/.test(l)).length).toBe(1);
  });
});

test.describe('4 · een rate limit op de transacties', () => {
  test('a. saldo zonder transacties is geen vergelijkingspunt: de aansluiting wacht niet, het volgende saldo vergelijkt met het laatste volle punt', async ({ page }) => {
    await boot(page, {}, '2026-10-25');
    await sync(page, {});
    const r1 = await page.evaluate((a) => SET.controles.aansluiting[a].laatste.saldo, ABN);
    await sync(page, { bal: { u2: '650' }, txFout: { u2: RL }, pendFout: { u2: RL } });
    const r2 = await page.evaluate((a) => { const R = SET.controles.aansluiting[a]; return { laatste: R.laatste.saldo, og: R.overgeslagen, st: aanslStatus(a, R, Date.now()).status }; }, ABN);
    expect(r2.laatste).toBe(r1);
    expect(r2.og && r2.og.saldo).toBe(65000);
    expect(r2.st).not.toBe('wacht');
    await sync(page, { bal: { u2: '650' }, tx: { u2: [{ booking_date: '2026-10-25', transaction_amount: { amount: '150', currency: 'EUR' }, credit_debit_indicator: 'CRDT', debtor: { name: 'Teruggave Bv' } }] } });
    const r3 = await page.evaluate((a) => { const R = SET.controles.aansluiting[a]; return { st: aanslStatus(a, R, Date.now()).status, d: R.laatste.dSaldo, b: R.laatste.dBoek, erna: !!R.overgeslagen.erna }; }, ABN);
    expect(r3).toEqual({ st: 'klopt', d: 15000, b: 15000, erna: true });
  });
  test('b. versheid: een sync met saldo zonder transacties is geen geslaagde sync', async ({ page }) => {
    await boot(page, {}, '2026-10-25');
    await sync(page, {});
    const g1 = await page.evaluate((a) => SET.syncGelukt[a], N26);
    await page.clock.setFixedTime(new Date(2026, 9, 25, 15, 0, 0));
    await sync(page, { txFout: { u1: RL } });
    const r = await page.evaluate((a) => ({ g: SET.syncGelukt[a], v: rekVersheid().find((x) => x.acc === a) }), N26);
    expect(r.g).toBe(g1);
    expect(r.v.gelukt).toBe(g1);
  });
  test('c. Diagnose: "bank weigerde: te veel aanvragen vandaag" in blok 8 en bij de aansluiting', async ({ page }) => {
    await boot(page, {}, '2026-10-25');
    await sync(page, {});
    await sync(page, { txFout: { u1: RL }, pendFout: { u1: RL } });
    const r = await page.evaluate((a) => ({ b8: [].concat(diagRekeningen()).join('\n'), aansl: controleAanslRegels().find((x) => x.acc === a).tekst }), N26);
    expect(r.b8).toContain('FOUT: bank weigerde: te veel aanvragen vandaag');
    expect(r.aansl).toContain('overgeslagen: bank weigerde: te veel aanvragen vandaag');
  });
});

test.describe('5 · een nieuwe koppeling laat de vorige verlopen', () => {
  test('a. voor het doorsturen: per gekoppelde rekening van die bank "<rekening> valt hierna weg ..."; pas Verder roept /auth aan', async ({ page }) => {
    await boot(page, {}, '2026-10-25');
    const r = await page.evaluate(async () => { window._auth = 0; psd2Api = async (pad) => { if (/\/auth/.test(pad)) window._auth++; return {}; };
      window._psd2Banks = [{ name: 'N26', country: 'DE' }]; await psd2StartAuth(0);
      return { rijen: [...document.querySelectorAll('[data-koppelwaarschuw]')].map((e) => e.innerText), auth: window._auth, knop: !!document.querySelector('[data-koppelverder]') }; });
    expect(r.auth).toBe(0);
    expect(r.knop).toBe(true);
    expect(r.rijen).toContain('Reservering ··7586 valt hierna weg, want een nieuwe koppeling laat de vorige verlopen');
    expect(r.rijen.some((t) => /Betaalrekening/.test(t))).toBe(false);   // ABN is een andere bank
    const auth = await page.evaluate(async () => { location.assign = () => {}; await psd2StartAuth(0, true); return window._auth; });
    expect(auth).toBe(1);
  });
  test('b. na de terugkeer: een rekening van die bank die niet in de sessie zat, staat in koppelNietMee()', async ({ page }) => {
    await boot(page, {}, '2026-10-25');
    const n = await page.evaluate((a) => koppelNietMee('N26', [a]).map((x) => x.acc), N26);
    expect(n).toContain('7586');
    expect(n).not.toContain('DE89370400440532013000');
  });
});

test.describe('6 · wintertijd vanaf 25-10 03:00', () => {
  test('a. een tijd net voor en net na de grens, en 23-10 21:01 blijft staan', async ({ page }) => {
    await boot(page, {}, '2026-10-25');
    const r = await page.evaluate(() => [Date.parse('2026-10-25T00:59:00Z'), Date.parse('2026-10-25T01:00:00Z'), Date.parse('2026-10-23T19:01:00Z'), Date.parse('2026-10-25T18:49:00Z')].map((ms) => controleDagTijd(ms)));
    expect(r).toEqual(['25-10 02:59', '25-10 02:00', '23-10 21:01', '25-10 19:49']);
  });
  test('b. blok 8 toont een opgeslagen sync van na de grens een uur minder verschoven dan een van ervoor', async ({ page }) => {
    await boot(page, {}, '2026-10-25');
    const t = await page.evaluate((a) => { SET.psd2Diag[a]._op = Date.parse('2026-10-25T18:49:00Z'); SET.psd2Diag['7586']._op = Date.parse('2026-10-23T19:01:00Z'); return [].concat(diagRekeningen()).join('\n'); }, N26);
    expect(t).toContain('laatste sync 2026-10-25 19:49');
    expect(t).toContain('laatste sync 2026-10-23 21:01');
  });
});
