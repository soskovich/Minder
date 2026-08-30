// v114: het maandbudget-getal op Inzichten opende de volledige budget-editor (bestedingslimiet,
// spaarmodus, alle invoervelden), terwijl de buren op dezelfde kaart een read-only drill-down
// openen. Nu opent het openPotjesVerdeling(): je plan, verdeeld over je potjes, met de
// 'volgende maand'-laag (v112) als volwaardige tweede lijst. Bewerken blijft openPotje/setBudget.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const SHEET = '#sheetBg.show';
const sheetTxt = (page) => page.locator('#sheet').innerText();

async function openVerdeling(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
  await page.locator('#s-ins >> text=Maandbudget').first().click();
  await page.waitForSelector(SHEET);
}

// splits de sheet-kinderen op de kop "Vanaf ..." en tel de .tx-bedragen per helft
async function secties(page) {
  return page.evaluate(() => {
    const eur = (el) => Math.round(Number(el.querySelector('.amt').textContent.replace(/[^\d,-]/g, '').replace(',', '.')) || 0);
    const kids = [...document.querySelector('#sheet').children];
    const grens = kids.findIndex((el) => /^vanaf /i.test((el.innerText || '').trim()));
    const tel = (arr) => arr.filter((el) => el.classList.contains('tx'))
      .reduce((a, el) => ({ som: a.som + eur(el), n: a.n + 1 }), { som: 0, n: 0 });
    return { een: tel(kids.slice(0, grens < 0 ? kids.length : grens)), twee: tel(grens < 0 ? [] : kids.slice(grens)) };
  });
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
    await page.locator('#s-ins >> text=Budget deze maand').first().click();
    await page.waitForSelector(SHEET);
    const s = await sheetTxt(page);
    expect(s).toMatch(/hoe doe je het deze maand\?/i);   // de kop rendert uppercase
    expect(s).not.toContain('zo staat je plan verdeeld');   // de twee drill-downs blijven gescheiden
  });

  test('de regel "vanaf volgende maand" opent dezelfde sheet', async ({ page }) => {
    await open(page);
    await page.evaluate(() => go('ins'));
    await page.locator('#s-ins >> text=vanaf volgende maand').first().click();
    await page.waitForSelector(SHEET);
    expect(await sheetTxt(page)).toContain('zo staat je plan verdeeld');
  });
});

test.describe('b · de lijst telt op tot het hoofdgetal', () => {
  test('sectie 1 is exact totalBudget()', async ({ page }) => {
    await openVerdeling(page);
    const verwacht = await page.evaluate(() => totalBudget());
    const { een } = await secties(page);
    expect(een.som).toBe(verwacht);
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
        else if (/^vanaf /i.test(t)) cur = null;
        else if (cur && el.classList.contains('tx')) uit[cur].push(el.querySelector('.nm').textContent);
      }
      return uit;
    });
    expect(groepen.Vast).toContain('Huur');
    expect(groepen.Variabel).toContain('Boodschappen');
  });
});

test.describe('c · de volgende maand als eigen lijst', () => {
  test('sectie 2 toont alle potjes van volgende maand en telt op tot plannedTotalBudget()', async ({ page }) => {
    await openVerdeling(page);
    const verwacht = await page.evaluate(() => plannedTotalBudget());
    const nu = await page.evaluate(() => Object.keys(SET.budgets).filter((k) => +SET.budgets[k] > 0).length);
    const { twee } = await secties(page);
    expect(twee.som).toBe(verwacht);
    expect(twee.n).toBe(nu);            // volledige lijst, niet alleen de wijziging
  });

  test('alleen het gewijzigde potje draagt het verschil', async ({ page }) => {
    await openVerdeling(page);
    const s = await sheetTxt(page);
    expect(s).toMatch(/nu €800 · \+€50/);   // fixture: boodschappen 800 -> 850
    expect(s).toContain('ongewijzigd');
    expect(s).toMatch(/vanaf \w+ €850/);              // en als vooruitblik bij de rij van nu
  });

  test('zonder geplande wijziging: één rustige regel, geen tweede lijst', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set);
    set.budgetsNext = {};
    p.minder_set = JSON.stringify(set);
    await openVerdeling(page, p);
    const s = await sheetTxt(page);
    expect(s).toMatch(/Er staat niets klaar voor \w+; je potjes blijven zoals ze nu staan\./);
    expect(s).not.toContain('ongewijzigd');
    const nu = await page.evaluate(() => Object.keys(SET.budgets).filter((k) => +SET.budgets[k] > 0).length);
    expect(await page.locator('#sheet .tx').count()).toBe(nu);   // precies één lijst
  });

  test('een gestopt potje staat er met "stopt", niet stilzwijgend weg', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set);
    set.budgetsNext = { shopping: 0 };
    p.minder_set = JSON.stringify(set);
    await openVerdeling(page, p);
    const s = await sheetTxt(page);
    expect(s).toContain('stopt');
    expect(s).toMatch(/vanaf \w+ gestopt/);
  });
});

test.describe('d · bewerken blijft waar het was', () => {
  test('een rij opent de bestaande potje-editor', async ({ page }) => {
    await openVerdeling(page);
    await page.locator('#sheet .tx', { hasText: 'Boodschappen' }).first().click();
    await page.waitForSelector('#sheet >> text=Waarop baseer je dit potje?');
    expect(await sheetTxt(page)).toContain('Boodschappen-potje');
  });

  test('de voetlink opent de volledige editor', async ({ page }) => {
    await openVerdeling(page);
    await page.locator('#sheet >> text=Potjes en limiet instellen').click();
    await page.waitForSelector('#budgetSheetHead');
    expect(await sheetTxt(page)).toContain('Bestedingslimiet');
    expect(await page.evaluate(() => window._budgetSheet)).toBe(CUR);
  });
});

test.describe('e · eerlijkheid en layout', () => {
  test('een afgeronde maand krijgt geen volgende-maand-lijst maar een noot', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { go('ins'); openPotjesVerdeling(months()[0]); });
    await page.waitForSelector(SHEET);
    const s = await sheetTxt(page);
    expect(s).toContain('geen momentopname van');
    const { twee } = await secties(page);
    expect(twee.n).toBe(0);
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
