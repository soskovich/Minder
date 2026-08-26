// Inzichten & Vooruitblik opschonen (v66): noodfonds-widget weg, eigen buffer-maanden,
// maand-drill-down met Categorieën/Top-uitgaven-toggle, dubbele widgets weg, KPI-detail per KPI.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1 } = require('./budget-fixture');

async function boot(page, scherm) {
  await open(page, seed());
  await page.evaluate((s) => go(s), scherm);
  await page.waitForSelector(`#s-${scherm} .card`);
}
async function openPlanZone(page) {
  if (await page.locator('#s-vooruit .plan-item').count() === 0) {
    await page.locator('#s-vooruit [data-zone="vooruitDoelOpen"]').click();
  }
  await page.waitForSelector('#s-vooruit .plan-item');
}

test.describe('a · noodfonds-widget weg, verfijnen blijft bereikbaar', () => {
  test('de kaart staat niet meer op Vooruitblik', async ({ page }) => {
    await boot(page, 'vooruit');
    expect(await page.locator('#nfCard').count()).toBe(0);
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).not.toMatch(/essentiële crisis-last/i);
    expect(v).not.toMatch(/bezuinigingsruimte/i);
    // v103: de functie bleef eerst staan omdat ze alleen niet meer werd samengesteld. Ze is nu
    // opgeruimd; de sheet (openNoodfondsPanel) is de enige plek waar het noodfonds nog rendert.
    expect(await page.evaluate(() => typeof noodfondsCard)).toBe('undefined');
    // de samenstelling zelf: sinds v71 opent Vooruitblik met "Nog deze maand", sinds v80 zonder hero
    expect(await page.evaluate(() => /innerHTML\s*=\s*nogDezeMaandCard\(\)\s*\+\s*doelZone/.test(renderVooruit.toString()))).toBe(true);
  });

  test('het noodfonds-plan-item is de ingang naar verfijnen', async ({ page }) => {
    await boot(page, 'vooruit');
    await openPlanZone(page);
    const nf = page.locator('#s-vooruit .plan-item[data-id="noodfonds"]');
    await expect(nf).toHaveCount(1);
    expect(await nf.innerText()).toContain('verfijnen');

    await nf.locator('text=verfijnen').click();
    await page.waitForSelector('#sheetBg.show');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Noodfonds verfijnen');
    expect(sheet).toContain('Minimaal nodig in crisis');
  });

  test('ook de kaart-body van het plan-item opent de sheet', async ({ page }) => {
    await boot(page, 'vooruit');
    await openPlanZone(page);
    expect(await page.evaluate(() => planItems().find((x) => x.id === 'noodfonds') && planOpen(planItems()[0]) !== null)).toBeTruthy();
    await page.locator('#s-vooruit .plan-item[data-id="noodfonds"] >> text=Noodfonds').click();
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toContain('Noodfonds verfijnen');
  });
});

test.describe('b · eigen aantal buffer-maanden', () => {
  const openNf = async (page) => {
    await boot(page, 'vooruit');
    await page.evaluate(() => openNoodfondsPanel());
    await page.waitForSelector('#nfEigen');
  };

  test('een eigen waarde zet SET.nfMaanden en herberekent het doel', async ({ page }) => {
    await openNf(page);
    expect(await page.evaluate(() => nfMaanden())).toBe(4);
    const ess = await page.evaluate(() => Math.round(noodfondsModel().essCrisis));

    await page.locator('#nfEigen').fill('9');
    await page.locator('#nfEigen').press('Tab');
    await page.waitForFunction(() => nfMaanden() === 9);

    expect(await page.evaluate(() => SET.nfMaanden)).toBe(9);
    expect(await page.evaluate(() => Math.round(noodfondsModel().doel))).toBe(ess * 9);
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toMatch(/doel · 9 mnd/i);          // de kop staat op uppercase
    // geen chip actief bij een eigen waarde
    expect(await page.locator('#nfMaandChips .chip.on:not(:has(#nfEigen))').count()).toBe(0);
    expect(await page.locator('#nfMaandChips .chip.on:has(#nfEigen)').count()).toBe(1);
  });

  test('de chips blijven werken en zetten het veld mee', async ({ page }) => {
    await openNf(page);
    await page.evaluate(() => { SET.nfMaanden = 9; save(); renderNfSheet(); });
    await page.locator('#sheet .chip', { hasText: '6 mnd' }).click();
    await page.waitForFunction(() => nfMaanden() === 6);
    expect(await page.locator('#nfEigen').inputValue()).toBe('6');
    expect(await page.locator('#sheet .chip.on').first().innerText()).toContain('6 mnd');
  });

  test('ongeldige invoer valt terug op de laatste geldige waarde', async ({ page }) => {
    await openNf(page);
    await page.evaluate(() => { SET.nfMaanden = 5; save(); renderNfSheet(); });
    for (const bad of ['0', '99', '']) {
      await page.locator('#nfEigen').fill(bad);
      await page.locator('#nfEigen').press('Tab');
      expect(await page.evaluate(() => SET.nfMaanden), bad).toBe(5);
      await page.waitForSelector('#nfEigen');
      expect(await page.locator('#nfEigen').inputValue(), bad).toBe('5');   // veld springt terug
    }
  });
});

test.describe('c · maand-drill-down met segment-toggle', () => {
  test('opent op Categorieën en onthoudt de keuze', async ({ page }) => {
    await boot(page, 'ins');
    await page.locator('#s-ins >> text=Uitgegeven').first().click();
    await page.waitForSelector('#msBody');

    let sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Uitgegeven deze maand');
    expect(sheet).toContain('Categorieën');
    expect(sheet).toContain('Top uitgaven');
    expect(await page.locator('#msBody').innerText()).toContain('Boodschappen');   // categorie-inhoud

    await page.locator('#sheet .chip', { hasText: 'Top uitgaven' }).click();
    await page.waitForFunction(() => SET.msDrill === 'top');
    expect(await page.locator('#msBody').innerText()).toContain('Albert Heijn');   // winkel-inhoud
    expect(await page.locator('#msBody').innerText()).not.toContain('Boodschappen');

    // keuze blijft na opnieuw openen
    await page.evaluate(() => { closeSheet(); openMonthSpend(); });
    await page.waitForSelector('#msBody');
    expect(await page.evaluate(() => msDrill())).toBe('top');
    expect(await page.locator('#msBody').innerText()).toContain('Albert Heijn');
  });

  test('de inklap-vlaggen van de renderers blijven ongemoeid', async ({ page }) => {
    await boot(page, 'ins');
    const voor = await page.evaluate(() => ({ cat: SET.openCatBreak, merch: SET.openMerch }));
    await page.evaluate(() => openMonthSpend());
    await page.waitForSelector('#msBody');
    expect(await page.evaluate(() => ({ cat: SET.openCatBreak, merch: SET.openMerch }))).toEqual(voor);
  });

  test('lege maand geeft een nette lege staat', async ({ page }) => {
    await boot(page, 'ins');
    await page.evaluate(() => { window._msMonth = null; openMonthSpend('2019-01'); });
    await page.waitForSelector('#msBody');
    expect(await page.locator('#msBody').innerText()).toMatch(/geen uitgaven deze maand/i);
  });
});

test.describe('d · dubbele widgets zijn weg uit Inzichten', () => {
  test('geen verdeling-blok en geen standalone "Waar gaat je geld heen"', async ({ page }) => {
    await boot(page, 'ins');
    const ins = await page.locator('#s-ins').innerText();
    expect(ins).not.toMatch(/hoe gezond is jouw verdeling/i);
    expect(ins).not.toMatch(/waar gaat je geld heen/i);
    expect(ins).not.toMatch(/tik een balkdeel/i);          // het verdeling-blok zelf, niet de norm-naam
    expect(ins).not.toMatch(/wat betekent 50\/30\/20/i);
    expect(ins).not.toMatch(/bekijk meer/i);
    // v84: "50/30/20" mag hier wél staan als naam van de actieve referentie-verdeling
    expect(ins).toMatch(/gemeten tegen: 50\/30\/20/i);
    // wat blijft
    expect(ins).toMatch(/kerncijfers/i);
    expect(ins).toMatch(/uitgaven vs budget/i);
    expect(ins).toMatch(/abonnementen|meer/i);
  });

  test('de renderers zelf blijven bestaan voor de drill-down', async ({ page }) => {
    await boot(page, 'ins');
    const r = await page.evaluate(() => ({
      cat: typeof renderCatBreak, merch: typeof renderMerchants, thumb: typeof ruleOfThumbCard,
      catOut: renderCatBreak(txOfMonth(curMonth)).length > 0,
    }));
    expect(r.cat).toBe('function');
    expect(r.merch).toBe('function');
    expect(r.thumb).toBe('function');       // blijft gedefinieerd, alleen niet meer aangeroepen
    expect(r.catOut).toBe(true);
  });
});

test.describe('e · KPI-detail is per KPI verschillend', () => {
  test('elke tegel opent zijn eigen uitleg en eigen reeks', async ({ page }) => {
    await boot(page, 'ins');
    const gezien = {};
    for (const key of ['spaar', 'budget', 'vari', 'vast']) {
      await page.locator(`#insKpiStrip .wvo-tile[data-kpi="${key}"]`).click();
      await page.waitForSelector('#kpiDetailHead');
      gezien[key] = await page.locator('#sheet').innerText();
      await page.evaluate(() => closeSheet());
    }
    expect(gezien.spaar).toContain('Bespaarquote');
    expect(gezien.spaar).toContain('(inkomen − uitgaven) ÷ inkomen');
    expect(gezien.budget).toContain('Budgetnaleving');
    expect(gezien.budget).toContain('uitgaven ÷ budget');
    expect(gezien.vari).toContain('Variabele-lasten-druk');
    expect(gezien.vari).toContain('variabele uitgaven ÷ inkomen');
    expect(gezien.vast).toContain('Vaste-lasten-druk');
    expect(gezien.vast).toContain('vaste lasten ÷ inkomen');

    // vier verschillende teksten, geen gedeelde generieke output
    const uniek = new Set(Object.values(gezien));
    expect(uniek.size).toBe(4);
  });

  test('de getoonde reeks hoort bij díe KPI', async ({ page }) => {
    await boot(page, 'ins');
    const r = await page.evaluate((m) => {
      const K = insKpis(m, 0);
      return { spaar: K.spaar.series, vari: K.vari.series, vast: K.vast.series, budget: K.budget.series };
    }, CUR);
    expect(r.spaar).not.toEqual(r.vari);
    expect(r.vari).not.toEqual(r.vast);
    expect(r.budget).not.toEqual(r.vast);
    expect(r.spaar.every((v) => v <= 100)).toBe(true);       // percentages
    expect(r.vari.every((v) => v >= 0 && v <= 100)).toBe(true);
  });
});
