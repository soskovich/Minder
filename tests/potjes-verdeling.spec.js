// v114: het maandbudget-getal op Inzichten opende de volledige budget-editor (bestedingslimiet,
// spaarmodus, alle invoervelden), terwijl de buren op dezelfde kaart een read-only drill-down
// openen. Nu opent het openPotjesVerdeling(): je plan, verdeeld over je potjes.
// v115: de twee getallen krijgen elk hun eigen lijst — "Maandbudget" toont alleen deze maand,
// "vanaf volgende maand" alleen volgende maand. Twee ingangen naar dezelfde sheet was dubbelzinnig:
// je wist niet welk van de twee getallen je aan het lezen was. Bewerken blijft openPotje/setBudget.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const SHEET = '#sheetBg.show';
const sheetTxt = (page) => page.locator('#sheet').innerText();

// de sheet toont per keer precies één lijst: tel alle .tx-bedragen erin op
const rijSom = (page) => page.$$eval('#sheet .tx .amt', (els) =>
  els.reduce((s, e) => s + Math.round(Number(e.textContent.replace(/[^\d,-]/g, '').replace(',', '.')) || 0), 0));

async function openVerdeling(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
  await page.locator('#s-ins >> text=Maandbudget').first().click();
  await page.waitForSelector(SHEET);
}

async function openVolgende(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
  await page.locator('#s-ins >> text=vanaf volgende maand').first().click();
  await page.waitForSelector(SHEET);
}

test.describe('a · de ingang', () => {
  test('tik op Maandbudget opent de verdeling, niet de editor', async ({ page }) => {
    await openVerdeling(page);
    const s = await sheetTxt(page);
    expect(s).toContain('Maandbudget');
    expect(s).toContain('zo staat je plan verdeeld');
    expect(s).not.toContain('Bestedingslimiet');            // dit is niet de editor
    expect(s).not.toContain('Voorstel uit mijn historie');
    expect(await page.evaluate(() => window._budgetSheet || null)).toBeNull();
  });

  test('de ring en de titel blijven de vergelijking openen', async ({ page }) => {
    await open(page);
    await page.evaluate(() => go('ins'));
    /* v135: de ring en de titel zijn op de lopende maand vervangen door de maandnaam als ingang.
       v176: die maandnaam is de maandkiezer geworden, dus de vergelijking hangt nu aan de
       dagteller ernaast. Eén ingang per vraag blijft staan, alleen op een ander element. */
    await page.locator('#s-ins .card .row span.small[onclick*="openBudgetCompare"]').first().click();
    await page.waitForSelector(SHEET);
    const s = await sheetTxt(page);
    expect(s).toMatch(/hoe doe je het deze maand\?/i);      // de kop rendert uppercase
    expect(s).not.toContain('zo staat je plan verdeeld');   // de drill-downs blijven gescheiden
  });

  test('de twee getallen openen elk hun eigen lijst, niet dezelfde', async ({ page }) => {
    await openVerdeling(page);
    const nu = await sheetTxt(page);
    expect(nu).toContain('zo staat je plan verdeeld');
    expect(nu).not.toContain('wat er klaarstaat voor volgende maand');

    await openVolgende(page);
    const vlg = await sheetTxt(page);
    expect(vlg).toMatch(/potjes vanaf \w+/i);
    expect(vlg).toContain('wat er klaarstaat voor volgende maand');
    expect(vlg).not.toContain('zo staat je plan verdeeld');
    expect(nu).not.toBe(vlg);
  });
});

test.describe('b · de lijst telt op tot het hoofdgetal', () => {
  test('de lijst bij Maandbudget is exact totalBudget()', async ({ page }) => {
    await openVerdeling(page);
    const verwacht = await page.evaluate(() => totalBudget());
    expect(await rijSom(page)).toBe(verwacht);
    expect(await sheetTxt(page)).toContain('€' + verwacht.toLocaleString('nl-NL'));
  });

  test('elk potje staat er met zijn aandeel en de vast/variabel-splitsing klopt', async ({ page }) => {
    await openVerdeling(page);
    const s = await sheetTxt(page);
    expect(s).toMatch(/^vast\b/im);      // .hlabel rendert uppercase
    expect(s).toMatch(/^variabel\b/im);
    expect(s).toMatch(/% van je potjes/);
    // huur (900) is een herkende incasso -> vast; boodschappen (800) niet -> variabel
    const groepen = await page.evaluate(() => {
      const uit = { Vast: [], Variabel: [] };
      let cur = null;
      for (const el of document.querySelector('#sheet').children) {
        const t = (el.innerText || '').trim();
        if (/^vast\b/i.test(t)) cur = 'Vast';
        else if (/^variabel\b/i.test(t)) cur = 'Variabel';
        else if (cur && el.classList.contains('tx')) uit[cur].push(el.querySelector('.nm').textContent);
      }
      return uit;
    });
    expect(groepen.Vast).toContain('Huur');
    expect(groepen.Variabel).toContain('Boodschappen');
  });
});

test.describe('c · de volgende maand is een eigen lijst', () => {
  test('telt op tot plannedTotalBudget() en toont alle potjes van die maand', async ({ page }) => {
    await openVolgende(page);
    const verwacht = await page.evaluate(() => plannedTotalBudget());
    const nu = await page.evaluate(() => Object.keys(SET.budgets).filter((k) => +SET.budgets[k] > 0).length);
    expect(await rijSom(page)).toBe(verwacht);
    expect(await page.locator('#sheet .tx').count()).toBe(nu);   // volledige lijst, niet alleen de wijziging
  });

  test('alleen het gewijzigde potje draagt het verschil', async ({ page }) => {
    await openVolgende(page);
    const s = await sheetTxt(page);
    expect(s).toMatch(/nu €800 · \+€50/);   // fixture: boodschappen 800 -> 850
    expect(s).toContain('ongewijzigd');
  });

  test('deze maand kondigt de wijziging per rij aan, zonder tweede lijst', async ({ page }) => {
    await openVerdeling(page);
    const s = await sheetTxt(page);
    expect(s).toMatch(/vanaf \w+ €850/);                   // vooruitblik bij de rij zelf
    expect(s).not.toContain('ongewijzigd');                // maar geen volgende-maand-lijst
    const nu = await page.evaluate(() => Object.keys(SET.budgets).filter((k) => +SET.budgets[k] > 0).length);
    expect(await page.locator('#sheet .tx').count()).toBe(nu);
  });

  test('zonder geplande wijziging: geen doorverwijzing, en de lijst zegt dat het gelijk blijft', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set);
    set.budgetsNext = {};
    p.minder_set = JSON.stringify(set);
    await openVerdeling(page, p);
    expect(await sheetTxt(page)).not.toMatch(/Bekijk je potjes vanaf/);
    expect(await page.locator('#s-ins').innerText()).not.toContain('vanaf volgende maand');

    await page.evaluate(() => openPotjesVerdeling(null, 'next'));
    expect(await sheetTxt(page)).toMatch(/Er staat niets klaar voor \w+: dit is dezelfde verdeling als deze maand\./);
  });

  test('een gestopt potje staat er met "stopt", niet stilzwijgend weg', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set);
    set.budgetsNext = { shopping: 0 };
    p.minder_set = JSON.stringify(set);
    await openVolgende(page, p);
    expect(await sheetTxt(page)).toContain('stopt');
    await openVerdeling(page, p);
    expect(await sheetTxt(page)).toMatch(/vanaf \w+ gestopt/);   // en als vooruitblik bij de rij van nu
  });

  test('de doorverwijzing heen en terug werkt', async ({ page }) => {
    await openVerdeling(page);
    await page.locator('#sheet >> text=Bekijk je potjes vanaf').click();
    expect(await sheetTxt(page)).toContain('wat er klaarstaat voor volgende maand');
    await page.locator('#sheet >> text=Terug naar deze maand').click();
    expect(await sheetTxt(page)).toContain('zo staat je plan verdeeld');
  });
});

test.describe('d · bewerken blijft waar het was', () => {
  test('een rij opent de bestaande potje-editor', async ({ page }) => {
    await openVerdeling(page);
    await page.locator('#sheet .tx', { hasText: 'Boodschappen' }).first().click();
    await page.waitForSelector('#sheet >> text=Waarop baseer je dit potje?');
    expect(await sheetTxt(page)).toContain('Boodschappen-potje');
  });

  test('de voetlink opent de volledige editor, ook vanuit de volgende maand', async ({ page }) => {
    await openVerdeling(page);
    await page.locator('#sheet >> text=Potjes en limiet instellen').click();
    await page.waitForSelector('#budgetSheetHead');
    expect(await sheetTxt(page)).toContain('Bestedingslimiet');
    expect(await page.evaluate(() => window._budgetSheet)).toBe(CUR);

    await openVolgende(page);
    await page.locator('#sheet >> text=Potjes en limiet instellen').click();
    await page.waitForSelector('#budgetSheetHead');
    expect(await sheetTxt(page)).toContain('Bestedingslimiet');
  });
});

test.describe('e · eerlijkheid en layout', () => {
  test('een afgeronde maand krijgt geen volgende-maand-lijst maar een noot', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { go('ins'); openPotjesVerdeling(months()[0]); });
    await page.waitForSelector(SHEET);
    const s = await sheetTxt(page);
    expect(s).toContain('geen momentopname van');
    expect(s).not.toMatch(/Bekijk je potjes vanaf/);
    expect(await rijSom(page)).toBe(await page.evaluate(() => totalBudget()));
  });

  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await openVerdeling(page);
      const over = await page.evaluate(() => {
        const el = document.querySelector('#sheet');
        return { sheet: el.scrollWidth - el.clientWidth, body: document.body.scrollWidth - document.body.clientWidth };
      });
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
