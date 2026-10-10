// v377: de terugkeer van de bank hoort bij een koppelpoging in DEZE opslag.
// Gemeld: vernieuwen gestart in de geïnstalleerde app, de bank stuurde terug naar Edge, en die kopie (met oude
// gegevens) sloeg de nieuwe toestemming op. Een callback zonder lopende poging wisselt nu niets in en slaat niets
// op, en zegt waar je hem wel opent. Een callback met een lopende poging werkt zoals voorheen.
const { test, expect } = require('@playwright/test');
const { seed, MAIN } = require('./budget-fixture');
const { pinDatum } = require('./vaste-dag');

const DAG = '2026-10-10';
const STATE = 'mind_chrome_abc123xyz';
const BACKEND = 'https://backend.test';

function payload({ poging }) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.psd2Url = BACKEND; set.psd2Token = 'tok';
  set.psd2LastSync = Date.parse(DAG + 'T08:00:00');   // geen stille vernieuwing bij de boot, zodat alleen de callback het netwerk raakt
  set.psd2Accounts = { [MAIN]: { uid: 'u1', iban: MAIN, label: 'Betaalrekening', bank: 'ABN AMRO', exp: '2026-10-13T00:00:00Z' } };
  p.minder_set = JSON.stringify(set);
  if (poging) p.minder_psd2_poging = JSON.stringify({ [STATE]: { bank: 'ABN AMRO', op: Date.parse(DAG + 'T09:00:00') } });
  return p;
}
async function boot(page, data) {
  const calls = [];
  await pinDatum(page, DAG);
  await page.route('**/sw.js', (r) => r.abort());
  await page.route(BACKEND + '/**', (r) => {
    const u = new URL(r.request().url()); calls.push(u.pathname);
    let body = {};
    if (u.pathname === '/sessions') body = { session_id: 'sess-1234567890abcdef', aspsp: { name: 'ABN AMRO' },
      access: { valid_until: '2027-01-08T00:00:00Z' }, accounts: [{ uid: 'u9', account_id: { iban: MAIN }, name: 'Betaalrekening' }] };
    else if (/transactions/.test(u.pathname)) body = { transactions: [] };
    else if (/balances/.test(u.pathname)) body = { balances: [] };
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript((d) => { if (!sessionStorage.getItem('_geseed')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('_geseed', '1'); } }, data);
  await page.goto('/index.html?code=bankcode42&state=' + STATE);
  await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0 && typeof totals === 'function');
  return calls;
}
const stand = (page) => page.evaluate(() => ({
  ps: JSON.stringify(SET.psd2Accounts), tx: TX.length,
  opgeslagen: JSON.parse(localStorage.getItem('minder_set') || '{}').psd2Accounts,
  url: location.search }));

test('een callback zonder lopende poging slaat niets op en toont de melding', async ({ page }) => {
  const calls = await boot(page, payload({ poging: false }));
  await page.waitForSelector('[data-anderekopie]');
  await page.waitForTimeout(300);
  const s = await stand(page);
  expect(calls).toEqual([]);   // geen /sessions: de code wordt niet ingewisseld
  expect(JSON.parse(s.ps)[MAIN].exp).toBe('2026-10-13T00:00:00Z');
  expect(s.opgeslagen[MAIN].exp).toBe('2026-10-13T00:00:00Z');
  expect(s.opgeslagen[MAIN].sessie).toBeUndefined();
  expect(s.url).toBe('');      // de code staat niet meer in de adresbalk
  const t = await page.locator('[data-anderekopie]').innerText();
  expect(t).toContain("Deze koppeling is gestart in een andere kopie van Minder. Open Minder via het app-icoon en kies daar 'vernieuwen'. Lukt dat niet, open deze link dan in Chrome.");
  expect(await page.locator('[data-anderelink]').innerText()).toContain('code=bankcode42');
  // de link staat nergens in de opslag
  const opslag = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)));
  expect(opslag).not.toContain('bankcode42');
});

test('zonder browser in de state noemt de melding de browser van de installatie', async ({ page }) => {
  await boot(page, payload({ poging: false }));
  await page.evaluate(() => psd2AndereKopieSheet('https://x/?code=a&state=oud_zonder', 'oud_zonder'));
  expect(await page.locator('[data-anderebrowser]').innerText()).toBe('de browser waarin je Minder installeerde');
});

test('een callback met een lopende poging werkt zoals voorheen', async ({ page }) => {
  const calls = await boot(page, payload({ poging: true }));
  await page.waitForFunction(() => (SET.psd2Accounts[Object.keys(SET.psd2Accounts)[0]] || {}).sessie === 'sess-1234567890abcdef');
  expect(calls[0]).toBe('/sessions');
  const s = await stand(page);
  const pm = Object.values(JSON.parse(s.ps)).find(x => x.sessie);
  expect(pm.exp).toBe('2027-01-08T00:00:00Z');
  expect(await page.locator('[data-anderekopie]').count()).toBe(0);
  // de poging is opgebruikt
  expect(await page.evaluate(() => Object.keys(psd2Pogingen()))).toEqual([]);
});

test('een poging in de verkeerde vorm (andere state) telt niet', async ({ page }) => {
  const p = payload({ poging: false });
  p.minder_psd2_poging = JSON.stringify({ mind_chrome_anders: { bank: 'ABN AMRO', op: Date.parse(DAG + 'T09:00:00') } });
  const calls = await boot(page, p);
  await page.waitForSelector('[data-anderekopie]');
  expect(calls).toEqual([]);
});

test('de start bewaart de poging met de browser in de state', async ({ page }) => {
  await boot(page, payload({ poging: false }));
  const r = await page.evaluate(() => { psd2PogingZet('mind_' + psd2BrowserCode() + '_x1', 'ING'); return { P: psd2Pogingen(), code: psd2BrowserCode(),
    edge: psd2BrowserCode('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0'),
    safari: psd2BrowserCode('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1') }; });
  expect(r.P['mind_' + r.code + '_x1'].bank).toBe('ING');
  expect(r.edge).toBe('edge'); expect(r.safari).toBe('safari');
});

test('de vernieuwkaart zegt vooraf in welke browser je terugkomt', async ({ page }) => {
  await boot(page, payload({ poging: false }));
  await page.evaluate(() => { closeSheet(); openSetSub('bank'); });
  const t = await page.locator('[data-vernieuwuitleg]').first().innerText();
  expect(t).toBe('Na je akkoord bij de bank kom je terug in je browser. Gebruik dezelfde browser als waarmee je Minder installeerde.');
});

test('blok 8 toont per bank de consent-id en de vervaldatum', async ({ page }) => {
  await boot(page, payload({ poging: false }));
  const t = await page.evaluate(() => { SET.psd2Accounts['NL99N26X0000000001'] = { uid: 'u2', iban: '', label: 'Space', bank: 'N26', exp: '2026-12-01T00:00:00Z', sessie: 'abcdef1234567890wxyz' };
    return diagRekeningen(); });
  const tekst = Array.isArray(t) ? t.join('\n') : String(t);
  expect(tekst).toContain('PER BANK: DE TOESTEMMING VAN DEZE KOPIE');
  expect(tekst).toMatch(/ABN AMRO {3}consent-id niet bewaard \(gekoppeld voor v377\) {3}vervalt 2026-10-13/);
  expect(tekst).toMatch(/N26 {3}consent-id abcdef12…wxyz {3}vervalt 2026-12-01/);
  expect(tekst).not.toContain('abcdef1234567890wxyz');
});
