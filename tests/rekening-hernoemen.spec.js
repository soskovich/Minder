// v121: `SET.acctNames` stond alleen in de leeskant van acctNaam() — er was geen enkele plek die
// hem schreef, terwijl de rekeningenlijst wél naar het saldo-overzicht verwees om "de naam aan te
// passen". Nu is er een hernoem-sheet, gesleuteld op **account-id** en niet op last4: die laatste
// is bij een rekening zonder IBAN voor elk N26-CSV-potje '26', dus met één naam zou je vier potjes
// tegelijk hernoemen. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);

const MAIN = '1234506222';            // PSD2, id = IBAN-cijfers
const POT1 = 'N26 Buffer Rust';       // CSV — beide potjes hebben last4 '26'
const POT2 = 'N26 Buffer Comfort';

function seedRen(set = {}) {
  const tx = [
    { id: 'a', date: `${CUR}-05`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'psd2', refNums: [] },
    { id: 'b', date: `${CUR}-06`, amount: 150, acc: POT1, accName: 'Buffer Rust', name: 'Buffer Rust', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', refNums: [] },
    { id: 'c', date: `${CUR}-07`, amount: 40, acc: POT2, accName: 'Buffer Comfort', name: 'Buffer Comfort', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', refNums: [] },
  ];
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000, setOpen: 'bank',
      manualBal: { [MAIN]: 1200, [POT1]: 800, [POT2]: 300 },
      psd2Accounts: { [MAIN]: { uid: 'u1', iban: 'NL01N260' + MAIN, label: 'VINCENT ERNST SUMTER ··6222', bank: 'N26' } },
    }, set)),
    minder_own: JSON.stringify([MAIN, POT1, POT2]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedRen());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof acctRenameOpen === 'function');
}

async function hernoem(page, acc, naam) {
  await page.evaluate((a) => acctRenameOpen(a), acc);
  await page.waitForSelector('#renInp');
  await page.locator('#renInp').fill(naam);
  await page.locator('#sheet >> text=Opslaan').click();
  await page.waitForSelector('#sheetBg.show', { state: 'detached' });
}

const naamVan = (page, a) => page.evaluate((x) => acctNaam(x), a);

test.describe('a · hernoemen', () => {
  test('een eigen naam wint en wordt op de rekening zelf bewaard', async ({ page }) => {
    await boot(page);
    expect(await naamVan(page, POT1)).toEqual({ naam: 'Buffer Rust', bron: 'naam uit je bestandsimport' });

    await hernoem(page, POT1, 'Noodfonds');
    expect(await naamVan(page, POT1)).toEqual({ naam: 'Noodfonds', bron: 'eigen naam' });
    expect(await page.evaluate(() => JSON.parse(JSON.stringify(SET.acctName)))).toEqual({ [POT1]: 'Noodfonds' });
  });

  test('het andere potje met dezelfde laatste cijfers blijft ongemoeid', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate((a) => acctLast4(a), POT1)).toBe('26');
    expect(await page.evaluate((a) => acctLast4(a), POT2)).toBe('26');   // dezelfde last4

    await hernoem(page, POT1, 'Noodfonds');
    expect((await naamVan(page, POT1)).naam).toBe('Noodfonds');
    expect((await naamVan(page, POT2)).naam).toBe('Buffer Comfort');     // niet meegesleept
  });

  test('de nieuwe naam staat overal waar je die rekening tegenkomt', async ({ page }) => {
    await boot(page);
    await hernoem(page, POT1, 'Noodfonds');
    const overal = await page.evaluate((a) => ({
      nice: acctNiceName(a), label: accLabel(a), kort: accShort(a),
      lijst: accountsCard(), saldo: (openBalances(), document.querySelector('#sheet').innerText),
    }), POT1);
    expect(overal.nice).toBe('Noodfonds');
    expect(overal.label).toBe('Noodfonds');          // ook de lange variant, bv. in de filter-chips
    expect(overal.lijst).toContain('Noodfonds');
    expect(overal.saldo).toContain('Noodfonds');
    expect(overal.kort).toBe('Buffer Rust');          // accShort blijft de id-variant (v120-stap 3)
  });

  test('een lege naam is geen naam: hij valt terug op automatisch', async ({ page }) => {
    await boot(page);
    await hernoem(page, POT1, 'Noodfonds');
    await hernoem(page, POT1, '   ');
    expect(await naamVan(page, POT1)).toEqual({ naam: 'Buffer Rust', bron: 'naam uit je bestandsimport' });
    expect(await page.evaluate(() => SET.acctName)).toEqual({});
  });

  test('"Terug naar de automatische naam" zet hem in één tik terug', async ({ page }) => {
    await boot(page);
    await hernoem(page, POT1, 'Noodfonds');
    await page.evaluate((a) => acctRenameOpen(a), POT1);
    await page.locator('#sheet >> text=Terug naar de automatische naam').click();
    await page.waitForSelector('#sheetBg.show', { state: 'detached' });
    expect((await naamVan(page, POT1)).naam).toBe('Buffer Rust');
  });
});

test.describe('b · de ingangen', () => {
  test('via de rekeningenlijst in Instellingen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('set'); openSet('bank'); });
    const rij = page.locator('#sheet .row', { has: page.locator(`input[onchange*="${POT1}"]`) });
    await rij.locator('div[onclick^="acctRenameOpen"]').click();
    await page.waitForSelector('#renInp');
    expect(await page.locator('#sheet').innerText()).toContain('Naam van deze rekening');
    expect(await page.locator('#renInp').getAttribute('placeholder')).toBe('Buffer Rust');
  });

  test('via het saldo-overzicht, waar de app al naar verwees', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openBalances());
    expect(await page.locator('#sheet').innerText()).toContain('naam aanpassen');
    await page.locator('#sheet .tx', { hasText: 'Buffer Rust' }).first().click();
    await page.waitForSelector('#renInp');
  });

  test('de sheet toont waar de huidige naam vandaan komt en wat de bank zegt', async ({ page }) => {
    await boot(page);
    await page.evaluate((a) => acctRenameOpen(a), MAIN);
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('vaste tabel in de app');                 // de bron van de huidige naam
    expect(t).toContain('Je bank noemt deze rekening');
    expect(t).toContain('VINCENT ERNST SUMTER ··6222');           // wat de koppeling opsloeg
  });

  test('bij een bestandsimport heet het geen "je bank", en een echo blijft weg', async ({ page }) => {
    await boot(page);
    await page.evaluate((a) => acctRenameOpen(a), POT1);
    const t = await page.locator('#sheet').innerText();
    expect(t).not.toContain('Je bank noemt');
    expect(t).toMatch(/In je import heet deze rekening/);
    // en na hernoemen mag de regel niet de naam herhalen die je net verving
    await page.locator('#renInp').fill('Noodfonds');
    await page.locator('#sheet >> text=Opslaan').click();
    await page.waitForSelector('#sheetBg.show', { state: 'detached' });
    await page.evaluate((a) => acctRenameOpen(a), POT1);
    expect(await page.locator('#sheet').innerText()).toContain('Buffer Rust · N26');
  });
});

test.describe('c · migratie van de oude last4-sleutel', () => {
  test('een naam op last4 verhuist eenmalig naar de rekening', async ({ page }) => {
    await boot(page, seedRen({ acctNames: { 6222: 'Hoofdrekening' } }));
    expect(await page.evaluate(() => JSON.parse(JSON.stringify(SET.acctName)))).toEqual({ [MAIN]: 'Hoofdrekening' });
    expect((await naamVan(page, MAIN)).naam).toBe('Hoofdrekening');
    expect(await page.evaluate(() => SET.acctNameMigrated)).toBeTruthy();
  });

  test('de migratie overschrijft een bestaande eigen naam niet', async ({ page }) => {
    await boot(page, seedRen({ acctNames: { 6222: 'Oud' }, acctName: { [MAIN]: 'Nieuw' } }));
    expect((await naamVan(page, MAIN)).naam).toBe('Nieuw');
  });

  test('zonder oude namen gebeurt er niets', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => SET.acctName || null)).toBeNull();
  });
});

test.describe('d · bron en layout', () => {
  // v146: het diagnose-blokje is uit Instellingen verwijderd. acctNaam().bron blijft bestaan en
  // heeft nog één lezer: de hernoem-sheet zelf, die 'Nu: <naam> · <bron>' toont.
  test('de hernoem-sheet noemt "eigen naam" als bron', async ({ page }) => {
    await boot(page);
    await hernoem(page, POT1, 'Noodfonds');
    const n = await page.evaluate((a) => acctNaam(a), POT1);
    expect(n.naam).toBe('Noodfonds');
    expect(n.bron).toBe('eigen naam');
    await page.evaluate((a) => acctRenameOpen(a), POT1);
    await page.waitForSelector('#renInp');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Noodfonds');
    expect(sheet).toContain('eigen naam');
  });

  test('de naamdiagnose bestaat niet meer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof bankDiagRows)).toBe('undefined');
    expect(await page.evaluate(() => typeof bankDiagHTML)).toBe('undefined');
    await page.evaluate(() => { go('set'); toggleSet('bank'); });
    expect(await page.locator('#s-set').innerText()).not.toMatch(/waarom heet een rekening zo/i);
  });

  for (const w of [360, 390]) {
    test(`de hernoem-sheet past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page);
      await page.evaluate((a) => acctRenameOpen(a), MAIN);
      await page.waitForSelector('#renInp');
      const over = await page.evaluate(() => {
        const el = document.querySelector('#sheet');
        return { sheet: el.scrollWidth - el.clientWidth, body: document.body.scrollWidth - document.body.clientWidth };
      });
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
