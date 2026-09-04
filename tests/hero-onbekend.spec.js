// Home-hero in de onbekend-staat: zonder één bekend saldo mag "Veilig te besteden" geen hard bedrag tonen.
// safeToSpend() rekent dan met saldo 0; dat getal groot neerzetten is even onwaar als "totaal saldo €0,00".
// Bewust zelfstandig (eigen seed, geen gedeelde fixture) zodat deze spec los te draaien is.
const { test, expect } = require('@playwright/test');

// De service worker staat globaal uit via playwright.config.js (anders herlaadt controllerchange midden in de test).

const now = new Date();
const YM = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
const MAIN = 'NL01MAIN0000001111';

// bal === null -> geen enkel saldo bekend (de staat na een pure bestand-import).
function seed(bal) {
  const tx = [
    { id: 'inc1', date: YM + '-05', amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    { id: 'ah1', date: YM + '-08', amount: -420, acc: MAIN, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
  ];
  const set = {
    limit: 70, hideInternal: true, autoIncome: false, income: 3000,
    savingMode: 'amount', savingAmount: 300, buffer: 0,
    budgets: { boodschappen: 500 },
  };
  if (bal != null) set.manualBal = { [MAIN]: bal };
  return {
    minder_tx: JSON.stringify(tx),
    minder_ovr: JSON.stringify({}),
    minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]),
    minder_accmeta: JSON.stringify({}),
    minder_plan: JSON.stringify({}),
  };
}

async function open(page, bal) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(bal));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0 && typeof safeToSpend === 'function');
  await page.waitForSelector('#s-dash .hh-big');
}

const heroBig = (page) => page.locator('#s-dash .hh-big').innerText();

test.describe('geen bekend saldo', () => {
  test('hero toont geen hard bedrag maar de onbekend-variant met CTA', async ({ page }) => {
    await open(page, null);
    expect(await page.evaluate(() => safeToSpend().known)).toBe(0);
    // de berekening zelf is niet aangepast: die rekent nog steeds door op saldo 0
    expect(await page.evaluate(() => typeof safeToSpend().safe)).toBe('number');

    expect((await heroBig(page)).trim()).toBe('onbekend');
    expect(await heroBig(page)).not.toMatch(/\d/);              // nergens een cijfer als hoofdgetal

    const hero = await page.locator('#s-dash .homehero').innerText();
    expect(hero).toContain('totaal saldo');
    expect(hero).toContain('onbekend');
    expect(hero).toContain('vul je saldo aan');
    expect(hero).not.toMatch(/€\s?-?\d/);                       // ook geen bedrag in de subregels
  });

  test('de CTA opent de saldo-invoer in plaats van dood te lopen', async ({ page }) => {
    await open(page, null);
    await page.locator('#s-dash .homehero >> text=vul je saldo aan').click();
    await page.waitForSelector('#sheetBg.show');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Je rekeningen & saldo');
    expect(await page.locator('#sheet input[type="number"]').count()).toBeGreaterThan(0);
  });

  test('de opbouw-sheet spreekt de hero niet tegen', async ({ page }) => {
    await open(page, null);
    await page.evaluate(() => openSafeToSpend());
    await page.waitForSelector('#sheetBg.show');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Veilig te besteden');
    expect(sheet).toContain('onbekend');
    expect(sheet).toContain('Vul je saldo aan');
    // het rode "je komt tekort"-blok hoort hier niet: we weten het simpelweg niet
    expect(sheet).not.toContain('is samen groter dan je saldo');
    // en de totaalregel toont geen bedrag
    expect(sheet).not.toMatch(/Veilig te besteden\s*\n?\s*€/);
  });
});

test.describe('wél een bekend saldo', () => {
  test('hero toont het echte bedrag weer', async ({ page }) => {
    await open(page, 2500);
    // v171: hele euro's waar het bedrag een samenvatting is. Centen blijven waar het bedrag exact
    // en waargenomen is: de transactielijst, en de saldo-drill-down per rekening.
    const s = await page.evaluate(() => ({ known: safeToSpend().known, safe: safeToSpend().safe, txt: euro0(safeToSpend().safe) }));
    expect(s.known).toBe(1);
    expect((await heroBig(page)).trim()).toBe(s.txt);
    const hero = await page.locator('#s-dash .homehero').innerText();
    expect(hero).toContain('totaal saldo €2.500');
    expect(hero).not.toContain('€2.500,00');
    expect(hero).not.toContain('onbekend');
  });

  test('opbouw-sheet toont het bedrag en de saldo-post', async ({ page }) => {
    await open(page, 2500);
    await page.evaluate(() => openSafeToSpend());
    await page.waitForSelector('#sheetBg.show');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Totaal saldo');
    expect(sheet).toContain('€2.500');
    expect(sheet).not.toContain('nog geen enkel saldo bekend');
  });
});

// De kern van deze follow-up: nooit het één stellig en het ander onbekend.
// Elke variant in een verse context, anders stapelen de init-scripts en meet je twee keer dezelfde staat.
test('hero-hoofdgetal en saldoregel zitten altijd in dezelfde staat', async ({ browser }) => {
  const seen = [];
  for (const bal of [null, 2500]) {
    // handmatige context: opties uit playwright.config.js gelden hier niet automatisch, dus expliciet meegeven
    const ctx = await browser.newContext({ baseURL: 'http://localhost:5599', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await open(page, bal);
    const r = await page.evaluate(() => {
      const hero = document.querySelector('#s-dash .homehero').innerText;
      return {
        known: safeToSpend().known,
        bigOnbekend: document.querySelector('#s-dash .hh-big').innerText.trim() === 'onbekend',
        saldoOnbekend: /totaal saldo\s*onbekend/i.test(hero),
      };
    });
    expect(r.bigOnbekend, 'bal=' + bal).toBe(r.known === 0);
    expect(r.saldoOnbekend, 'bal=' + bal).toBe(r.known === 0);
    seen.push(r.known);
    await ctx.close();
  }
  expect(seen, 'beide staten moeten echt gemeten zijn').toEqual([0, 1]);
});
