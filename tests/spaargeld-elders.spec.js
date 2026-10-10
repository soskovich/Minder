// v376: "Spaargeld elders (niet gekoppeld)". Een bron voor het startpunt van de saldo-vooruitrekening: dat is
// "Totaal saldo" op Home, en spaargeld elders telt daar niet bij op. Het telt alleen in de spaarcijfers
// (spaarSaldo()), en daar OPGETELD bij het spaarsaldo uit de koppeling, niet in plaats ervan. Dat laatste legt het
// gedrag vast dat de uitleg bij het veld noemt: staat het geld op een gekoppelde rekening, dan telt het dubbel.
const { test, expect } = require('@playwright/test');
const { seed, MAIN, SAV } = require('./budget-fixture');
const { pinDatum } = require('./vaste-dag');

const DAG = '2026-10-10';
const ELDERS = 2500;

// MAIN en SAV allebei gekoppeld: hun saldo komt uit de koppeling (ACCMETA), niet uit manualBal.
function fixture(extra) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.psd2Accounts = {
    [MAIN]: { uid: 'u1', iban: MAIN, label: 'Betaalrekening', bank: 'ABN AMRO', exp: '2027-03-01T00:00:00Z' },
    [SAV]: { uid: 'u2', iban: SAV, label: 'Spaarrekening', bank: 'ABN AMRO', exp: '2027-03-01T00:00:00Z' },
  };
  set.extraSavings = extra;
  p.minder_set = JSON.stringify(set);
  p.minder_accmeta = JSON.stringify({ [MAIN]: { balance: 3800, date: '2026-10-09' }, [SAV]: { balance: 1700, date: '2026-10-09' } });
  return p;
}
async function boot(page, payload) {
  await pinDatum(page, DAG);
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((data) => { for (const k in data) localStorage.setItem(k, data[k]); }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0 && typeof financeModel === 'function');
}
const startpunt = (page) => page.evaluate(() => {
  go('dash'); renderDash();
  const el = document.querySelector('[data-totaalsaldo]');
  const F = financeModel();
  return { home: el ? +el.dataset.totaalsaldo : null, tb: Math.round(totalBalance().sum), start: F.months[F.meta.curIdx].balance };
});

test.describe('a · het startpunt van de vooruitrekening is Totaal saldo op Home', () => {
  test('zonder spaargeld elders', async ({ page }) => {
    await boot(page, fixture(0));
    const r = await startpunt(page);
    expect(r.home).not.toBeNull();
    expect(r.start).toBe(r.home);
    expect(r.start).toBe(r.tb);
  });
  test('ook met spaargeld elders boven nul', async ({ page }) => {
    await boot(page, fixture(ELDERS));
    const r = await startpunt(page);
    expect(r.home).not.toBeNull();
    expect(r.start).toBe(r.home);
    // en Home zelf telt het niet mee: het verschil met de stand zonder is nul
    await boot(page, fixture(0));
    const r0 = await startpunt(page);
    expect(r.home).toBe(r0.home);
    expect(r.start).toBe(r0.start);
  });
});

test.describe('b · spaargeld elders telt in de spaarcijfers, opgeteld en niet vervangen', () => {
  test('spaarSaldo() is het saldo uit de koppeling plus het bedrag', async ({ page }) => {
    await boot(page, fixture(0));
    const zonder = await page.evaluate(() => ({ sp: spaarSaldo(), ts: totalSaved() }));
    // invoermeting: het spaarsaldo komt uit de koppeling (1700), niet uit manualBal (2500)
    expect(zonder.ts.sum).toBe(1700);
    expect(zonder.sp.cur).toBe(1700);
    expect(zonder.sp.bron).toBe('spaarrekening');
    await boot(page, fixture(ELDERS));
    const met = await page.evaluate(() => spaarSaldo());
    expect(met.cur).toBe(1700 + ELDERS);
    expect(met.bron).toBe('spaarrekening');
  });
});

test.describe('c · het veld zegt wat het is', () => {
  test('label en uitleg in Bank & rekeningen', async ({ page }) => {
    await boot(page, fixture(ELDERS));
    const t = await page.evaluate(() => { openSetSub('bank'); return document.getElementById('s-set').innerText; });
    expect(t).toContain('Spaargeld elders (niet gekoppeld)');
    expect(t).toContain('Alleen geld op rekeningen die Minder niet ziet. Staat het op een gekoppelde rekening, dan telt het al mee en hier dubbel.');
    expect(t).not.toContain('Extra spaargeld');
  });
});
