// v146: rekeningen zonder bekend saldo staan standaard niet in Instellingen — in de praktijk zijn
// dat rekeningen die je niet meer gebruikt, en ze vulden allebei de lijsten met regels waar niets
// aan te doen valt. Verbergen, niet verwijderen: een rekening bestaat zolang er boekingen met die
// id zijn (v122). Er verandert niets aan enige berekening.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));

const MAIN = 'NL01MAIN0000001111';
const OUD1 = 'NL01OUDA0000002222';
const OUD2 = 'NL01OUDB0000003333';

function seed(set = {}) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc: naam, typ: '', ref: '',
              src: 'psd2', accName: '', refNums: [] });
  for (const m of [M1, CUR]) {
    add('i' + m, MAIN, m, '25', 3000, 'Werkgever');
    add('a' + m, MAIN, m, '05', -300, 'Albert Heijn');
  }
  add('o1', OUD1, M1, '08', -40, 'Oude betaling');       // rekening zonder saldo
  add('o2', OUD2, M1, '09', -25, 'Andere oude post');    // tweede rekening zonder saldo
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      manualBal: { [MAIN]: 2000 },
    }, set)),
    minder_own: JSON.stringify([MAIN, OUD1, OUD2]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof zichtbareRek === 'function');
}
const bankPaneel = async (page) => {
  await page.evaluate(() => { go('set'); toggleSet('income'); });   // v183: één lijst, onder Inkomen
  return page.locator('#s-set').innerText();
};

test.describe('a · standaard verborgen', () => {
  test('alleen rekeningen met een bekend saldo staan in de lijst', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => OWN.length)).toBe(3);
    expect(await page.evaluate(() => zichtbareRek())).toEqual([MAIN]);
    expect(await page.evaluate(() => rekZonderSaldo())).toEqual([OUD1, OUD2]);
  });

  test('de kaart toont ze niet, met één regel die zegt hoeveel er zijn', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => accountsCard());
    expect(h).not.toContain('saldo onbekend');
    expect(h).toContain('2 rekeningen zonder saldo tonen');
  });

  test('en het bankpaneel evenmin', async ({ page }) => {
    await boot(page);
    const t = await bankPaneel(page);
    expect(t).not.toMatch(/Oude betaling|Andere oude post/);
    expect(t).toContain('2 rekeningen zonder saldo tonen');
  });
});

test.describe('b · in één tik terug', () => {
  test('tonen zet ze terug en de regel draait om', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => toggleLegeRek());
    expect(await page.evaluate(() => zichtbareRek().length)).toBe(3);
    const h = await page.evaluate(() => accountsCard());
    expect(h).toContain('saldo onbekend');
    expect(h).toContain('2 rekeningen zonder saldo verbergen');
  });

  test('de keuze wordt bewaard', async ({ page }) => {
    await boot(page, seed({ toonLegeRek: true }));
    expect(await page.evaluate(() => zichtbareRek().length)).toBe(3);
  });

  test('een tik in het paneel schakelt om', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('set'); toggleSet('income'); });   // v183: één lijst, onder Inkomen
    await page.locator('#s-set', { hasText: 'zonder saldo' }).locator('text=2 rekeningen zonder saldo tonen').first().click();
    expect(await page.evaluate(() => SET.toonLegeRek)).toBe(true);
    expect(await page.locator('#s-set').innerText()).toMatch(/zonder saldo verbergen/);
  });
});

test.describe('c · er verandert niets aan de cijfers', () => {
  test('saldo, transacties en onbekend-staten blijven gelijk', async ({ page }) => {
    await boot(page);
    const meten = () => page.evaluate((m) => ({
      sum: totalBalance().sum, known: totalBalance().known, missing: totalBalance().missing,
      tx: TX.length, own: OWN.length, spend: Math.round(totals(m).spend),
    }), M1);
    const verborgen = await meten();
    await page.evaluate(() => toggleLegeRek());
    const getoond = await meten();
    expect(getoond).toEqual(verborgen);
    expect(verborgen.missing).toBe(2);                    // de rekeningen bestaan gewoon nog
    expect(verborgen.own).toBe(3);
  });

  test('de transacties van een verborgen rekening tellen onveranderd mee', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate((m) => Math.round(totals(m).spend), M1)).toBe(300 + 40 + 25);
  });
});

test.describe('d · de guard: nooit een lege lijst', () => {
  test('zonder enig bekend saldo wordt er niets verborgen', async ({ page }) => {
    await boot(page, seed({ manualBal: {} }));
    expect(await page.evaluate(() => rekMetSaldo())).toEqual([]);
    expect(await page.evaluate(() => zichtbareRek().length)).toBe(3);   // anders kun je nergens meer invullen
    expect(await page.evaluate(() => legeRekRegel())).toBe('');         // en dus ook geen toon-regel
  });

  test('geen rekeningen zonder saldo: geen regel', async ({ page }) => {
    await boot(page, seed({ manualBal: { [MAIN]: 2000, [OUD1]: 10, [OUD2]: 5 } }));
    expect(await page.evaluate(() => rekZonderSaldo())).toEqual([]);
    expect(await page.evaluate(() => legeRekRegel())).toBe('');
  });
});
