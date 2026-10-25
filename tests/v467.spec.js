/* v467 (gevraagd door de gebruiker): bij N26 kies je bij het koppelen geen rekeningen, de bank geeft zelf een lijst terug. Per koppeling
   staat in blok 8 wat de bank teruggaf (nummer, naam, soort) en wat de app ervan maakte, en per rekening op een oudere sessie of hij erbij
   zat. Zat hij er niet bij (niet onder zijn nummer, hash of naam), dan zegt de Home-kaart "N26 gaf deze rekening niet mee bij de laatste
   koppeling" in plaats van "Opnieuw koppelen". GECONSTRUEERDE fixture (de vorm van v464). */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const N26 = 'DE89370400440532013000', ABN = '521200806', SPACE = '7586';
function seed(o) {
  o = o || {};
  const tx = [];
  const P = (d, a, name, acc) => tx.push({ id: 'w' + tx.length, date: d, amount: a, acc: acc || N26, src: 'psd2', name, desc: name + ' PMNT',
    bankRef: '', typ: '', ref: '', accName: '', refNums: [] });
  for (const m of ['07', '08', '09', '10']) { P(`2026-${m}-01`, 3000, 'Werkgever Bv'); P(`2026-${m}-02`, -60, 'Albert Heijn'); P(`2026-${m}-03`, -40, 'Jumbo', ABN); }
  P('2026-10-05', -12, 'Bakker Space', SPACE);
  const ps = { [N26]: { uid: 'u1', iban: N26, label: 'Main ··3000', bank: 'N26', exp: '2026-12-15', sessie: 'S1', hash: 'HMAIN' },
    [ABN]: { uid: 'u2', iban: 'NL00ABNA0' + ABN, label: 'Betaalrekening', bank: 'ABN AMRO', exp: '2027-01-08', sessie: 'A1' },
    [SPACE]: { uid: 'u3', iban: 'DE0000000000000' + SPACE, label: 'Reserveringen ··' + SPACE, bank: 'N26', exp: '2026-12-15', sessie: 'S1', hash: 'HSPACE' } };
  const nu = Date.parse('2026-10-23T08:00:00Z');
  const goed = { balGeland: true, txFout: '', _op: nu, _veldOp: { balGeland: nu } };
  const diag = { [N26]: goed, [ABN]: goed, [SPACE]: { balGeland: false, balFout: 'EXPIRED_SESSION', txFout: 'EXPIRED_SESSION', _op: nu, _veldOp: { balGeland: nu } } };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([N26, ABN, SPACE]),
    minder_accmeta: JSON.stringify({ [N26]: { balance: 1000, date: '2026-10-23', bank: 'N26' }, [ABN]: { balance: 500, date: '2026-10-23', bank: 'ABN AMRO' },
      [SPACE]: { balance: 40, date: '2026-10-23', bank: 'N26' } }),
    minder_set: JSON.stringify(Object.assign({ psd2Accounts: ps, psd2Diag: diag, syncGelukt: { [N26]: nu, [ABN]: nu },
      psd2LastSync: 4102444800000, psd2Url: 'https://x.test', psd2Token: 't', limit: 70, opnameVanaf: '2099-12-31', toonLegeRek: true, manualBal: {},
      budgets: { boodschappen: 300 } }, o.set || {})),
    minder_plan: '{}',
  };
}
async function boot(page, o) {
  await pinDatum(page, '2026-10-23');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v467')) { sessionStorage.setItem('v467', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof runControles === 'function');
}
/* een koppeling van N26 met de rekeningen die de bank teruggeeft */
const koppel = (page, accounts) => page.evaluate(async (accounts) => {
  psd2Api = async (pad) => /balances/.test(pad) ? { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '900' } }] } : { transactions: [] };
  try{ koppelUitlegSheet = () => {}; }catch(_){}
  await psd2IngestSession({ session_id: 'S2', aspsp: { name: 'N26' }, access: { valid_until: '2027-01-21' }, accounts });
  while (window._ctrlTimer) await new Promise((r) => setTimeout(r, 20));
}, accounts);
const MAIN = { uid: 'u5', account_id: { iban: N26 }, identification_hash: 'HMAIN', name: 'Main', cash_account_type: 'CACC', product: 'N26 Standard' };
const kaart = (page) => page.evaluate(() => { renderDash(); const k = document.querySelector('[data-homerekkaart]');
  return { t: k ? k.innerText.replace(/\s+/g, ' ') : '', knop: !!document.querySelector('[data-opnieuwkoppelen]'), nietmee: !!document.querySelector('[data-reknietmee]') }; });
const blok8 = (page) => page.evaluate(() => [].concat(diagRekeningen()).join('\n'));

test.describe('v467 · wat de bank per koppeling teruggaf', () => {
  test('a. de koppeling legt per teruggegeven rekening nummer, naam, soort, product, de gekozen id en de grond vast', async ({ page }) => {
    await boot(page);
    await koppel(page, [MAIN, { uid: 'u6', identification_hash: 'HNIEUW', name: 'Spaarpot', cash_account_type: 'SVGS' }]);
    const r = await page.evaluate(() => SET.psd2Koppelingen);
    expect(r.length).toBe(1);
    expect(r[0].bank).toBe('N26'); expect(r[0].sessie).toBe('S2'); expect(r[0].exp).toBe('2027-01-21');
    expect(r[0].rek.map((x) => [x.nr, x.naam, x.soort, x.accId, x.grond])).toEqual([
      ['3000', 'Main', 'CACC', N26, 'bestaande hash'],
      ['', 'Spaarpot', 'SVGS', 'psd2h_HNIEUW', 'nieuwe hash, geen rekeningnummer']]);
    expect(r[0].rek[0].product).toBe('N26 Standard');
  });
  test('b. de lijst houdt de laatste PSD2_KOPPEL_MAX koppelingen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { for (let i = 0; i < PSD2_KOPPEL_MAX + 3; i++) psd2KoppelingZet({ op: i, bank: 'N26', rek: [] });
      return { n: SET.psd2Koppelingen.length, eerste: SET.psd2Koppelingen[0].op, max: PSD2_KOPPEL_MAX }; });
    expect(r.n).toBe(r.max); expect(r.eerste).toBe(3);
  });
  test('c. N26 gaf ··7586 niet mee: blok 8 zegt het, de Home-kaart zegt het en heeft geen knop "Opnieuw koppelen"', async ({ page }) => {
    await boot(page);
    await koppel(page, [MAIN]);
    const M = await page.evaluate(() => psd2KoppelMee('7586'));
    expect(M.bron).toBe('vastgelegd'); expect(M.mee).toBe(false); expect(M.naam).toEqual([]);
    const k = await kaart(page);
    expect(k.t).toContain('N26 gaf deze rekening niet mee bij de laatste koppeling');
    expect(k.t).not.toContain('zat niet in je nieuwste koppeling');
    expect(k.nietmee).toBe(true);
    expect(k.knop).toBe(false);
    const b = await blok8(page);
    expect(b).toContain('KOPPELINGEN PER BANK (v467)');
    expect(b).toMatch(/N26 · gekoppeld .* · 1 rekening\(en\) teruggegeven/);
    expect(b).toContain(`··3000 · Main · soort CACC · product N26 Standard`);
    expect(b).toContain('7586 (Reserveringen ··7586) zat er NIET bij: niet onder zijn nummer, niet onder zijn hash en niet onder zijn naam, dus N26 gaf hem niet mee');
    const a = await page.evaluate(() => (controleAanslRegels().find((x) => x.acc === '7586') || {}).tekst || '');
    expect(a).toContain('N26 gaf hem niet mee bij de laatste koppeling');
  });
  test('d. N26 gaf "Reserveringen" mee zonder nummer en met een andere hash: blok 8 zegt waarom hij niet aan ··7586 hing; Home houdt de knop', async ({ page }) => {
    await boot(page);
    await koppel(page, [MAIN, { uid: 'u7', identification_hash: 'HANDERS', name: 'Reserveringen', cash_account_type: 'CACC' }]);
    const M = await page.evaluate(() => psd2KoppelMee('7586'));
    expect(M.mee).toBe(false); expect(M.naam.map((x) => x.accId)).toEqual(['psd2h_HANDERS']);
    const b = await blok8(page);
    expect(b).toContain('geen rekeningnummer · Reserveringen · soort CACC · hash HANDERS… → psd2h_HANDERS (nieuwe hash, geen rekeningnummer)');
    expect(b).toContain('7586 (Reserveringen ··7586) zat er NIET bij onder zijn nummer of hash; wel kwam psd2h_HANDERS (Reserveringen) mee met dezelfde naam');
    const k = await kaart(page);
    expect(k.t).toContain('zat niet in je nieuwste koppeling');
    expect(k.nietmee).toBe(false);
    expect(k.knop).toBe(true);
  });
  test('e. N26 gaf ··7586 mee met zijn nummer: dezelfde id, de nieuwe sessie, geen regel op Home', async ({ page }) => {
    await boot(page);
    await koppel(page, [MAIN, { uid: 'u8', account_id: { iban: 'DE0000000000000' + SPACE }, identification_hash: 'HSPACE', name: 'Reserveringen' }]);
    const r = await page.evaluate(() => ({ e: SET.psd2Accounts['7586'], M: psd2KoppelMee('7586'), rij: SET.psd2Koppelingen[0].rek[1] }));
    expect(r.e.sessie).toBe('S2'); expect(r.M.mee).toBe(true); expect(r.M.zelfde).toBe(true);
    expect(r.rij.accId).toBe('7586'); expect(r.rij.grond).toBe('bestaand rekeningnummer');
    const k = await kaart(page);
    expect(k.t).not.toContain('Reserveringen');
  });
  test('f. zonder vastgelegde koppeling (van voor v467) is het afgeleid uit de entries van de nieuwste sessie, en blok 8 zegt dat', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.psd2Accounts['DE89370400440532013000'].sessie = 'S2'; SET.psd2Accounts['DE89370400440532013000'].exp = '2027-01-21'; save(); });
    const M = await page.evaluate(() => psd2KoppelMee('7586'));
    expect(M.bron).toBe('afgeleid'); expect(M.mee).toBe(false);
    const b = await blok8(page);
    expect(b).toContain('N26: geen koppeling vastgelegd (dat doet de app sinds v467); AFGELEID');
    expect(b).toContain('zat er NIET bij (afgeleid)');
    const k = await kaart(page);
    expect(k.t).toContain('N26 gaf deze rekening niet mee bij de laatste koppeling');
  });
  test('g. staat er ook een rekening die wel opnieuw gekoppeld moet worden, dan blijft de knop', async ({ page }) => {
    await boot(page);
    await koppel(page, [MAIN]);
    await page.evaluate(() => { SET.psd2Diag['DE89370400440532013000'] = { balGeland: false, balFout: 'EXPIRED_SESSION', txFout: 'EXPIRED_SESSION', _op: Date.now(), _veldOp: { balGeland: Date.now() } };
      SET.syncGelukt['DE89370400440532013000'] = Date.parse('2026-10-20T08:00:00Z'); save(); });
    const k = await kaart(page);
    expect(k.nietmee).toBe(true);
    expect(k.knop).toBe(true);
  });
  test('h. de waarschuwing voor het koppelen vraagt niet meer om aan te vinken wat de bank zelf kiest', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => { koppelWaarschuwSheet(0, { name: 'N26' }, koppelWegvallers('N26')); return document.querySelector('#sheet').innerText; });
    expect(t).not.toContain('Vink bij');
    expect(t).toContain('kiest de bank zelf, dan zie je na de terugkeer welke er niet in zaten');
  });
});
