// Transacties (v79): historische periode-keuze + de nieuwe filter-sheet.
// Alleen weergave/selectie — de categorisering en de bedragen blijven van de app zelf.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

async function openTx(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('tx'));
  await page.waitForSelector('#txlist');
}

const rijen = (page) => page.locator('#txlist .tx');
const chips = (page) => page.locator('#txBar .fchip');
// de app zelf vertelt hoeveel transacties een maand heeft — geen hardgecodeerde telling
const inMaand = (page, m) => page.evaluate((mm) => TX.filter((t) => t.date.startsWith(mm)).length, m);

test.describe('a · periode ontsluit de historie', () => {
  test('default is deze maand, zonder maandcontext in de koppen', async ({ page }) => {
    await openTx(page);
    expect(await page.evaluate(() => txPeriod)).toBe('month');
    expect(await rijen(page).count()).toBe(await inMaand(page, CUR));
    await expect(page.locator('#txBar .fchip').first()).toContainText('Deze maand');
    expect(await page.locator('#txlist .tx-mhead').count()).toBe(0);   // één maand: geen maandband
    expect(await chips(page).count()).toBe(1);                          // alleen de periode-chip
  });

  test('3 mnd, dit jaar en alles tonen transacties uit eerdere maanden', async ({ page }) => {
    await openTx(page);
    const n = { cur: await inMaand(page, CUR), m1: await inMaand(page, M1), m2: await inMaand(page, M2) };

    await page.evaluate(() => setTxPeriod('3m'));
    expect(await rijen(page).count()).toBe(n.cur + n.m1 + n.m2);
    expect(await page.locator('#txlist').innerText()).toContain('300');  // ah-cur staat er nog

    await page.evaluate(() => setTxPeriod('ytd'));
    const ytd = await page.evaluate(() => txMonthsForPeriod());
    expect(ytd.every((m) => m.slice(0, 4) === CUR.slice(0, 4))).toBe(true);

    await page.evaluate(() => setTxPeriod('all'));
    expect(await rijen(page).count()).toBe(await page.evaluate(() => TX.length));
  });

  test('een specifieke maand kiezen toont alleen die maand', async ({ page }) => {
    await openTx(page);
    await page.evaluate((m) => setTxPeriod(m), M1);
    expect(await rijen(page).count()).toBe(await inMaand(page, M1));
    const uit = await page.locator('#txlist').innerText();
    expect(uit).toContain('Woningcorporatie');                          // huur staat alleen in M2/M1
    await expect(page.locator('#txBar .fchip').first()).toContainText(
      await page.evaluate((m) => monthLabel(m), M1));
  });

  test('bij meer maanden krijgen de groepen maand en jaar mee', async ({ page }) => {
    await openTx(page);
    await page.evaluate(() => setTxPeriod('3m'));
    const banden = page.locator('#txlist .tx-mhead');
    expect(await banden.count()).toBe(3);                               // één band per maand
    expect(await banden.first().innerText()).toMatch(new RegExp(CUR.slice(0, 4)));   // maand + jaar
    const maand = await page.evaluate((m) => MFULL[+m.slice(5, 7) - 1], CUR);
    expect(await banden.first().innerText().then((t) => t.toLowerCase())).toContain(maand.toLowerCase());
    // de dagkoppen dragen de maand mee, ook als je ver in een maand scrollt
    const kop = await page.locator('#txlist .tx-day').first().innerText();
    expect(kop.toLowerCase()).toContain(maand.toLowerCase());
    expect(kop).not.toMatch(/\d{4}/);                                   // het jaar staat in de band

    await page.evaluate(() => setTxPeriod('month'));
    expect(await page.locator('#txlist .tx-mhead').count()).toBe(0);     // één maand: geen band
  });

  test('met één maand data degraderen de periode-opties netjes', async ({ page }) => {
    const p = seed();
    const tx = JSON.parse(p.minder_tx).filter((t) => t.date.startsWith(CUR));
    p.minder_tx = JSON.stringify(tx);
    await openTx(page, p);
    await page.evaluate(() => openTxFilter());
    await page.waitForSelector('#txFilterHead');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Deze maand');
    expect(sheet).not.toContain('3 mnd');
    expect(sheet).not.toContain('Kies maand');
  });
});

test.describe('b · filters en hoe ze combineren', () => {
  test('categorie is multi-select en telt op', async ({ page }) => {
    await openTx(page);
    await page.evaluate(() => setTxPeriod('all'));
    const alles = await rijen(page).count();

    const cats = await page.evaluate(() => [...new Set(TX.map(catOf))]);
    const [c1, c2] = cats.slice(0, 2);
    const per = async (k) => page.evaluate((kk) => TX.filter((t) => catOf(t) === kk).length, k);

    await page.evaluate((k) => toggleTxCat(k), c1);
    expect(await rijen(page).count()).toBe(await per(c1));
    await page.evaluate((k) => toggleTxCat(k), c2);
    expect(await rijen(page).count()).toBe((await per(c1)) + (await per(c2)));
    expect(await rijen(page).count()).toBeLessThan(alles);
    expect(await page.evaluate(() => txCats.size)).toBe(2);
  });

  test('type filtert op uitgaven of inkomsten', async ({ page }) => {
    await openTx(page);
    await page.evaluate(() => setTxPeriod('all'));
    await page.evaluate(() => setTxType('inc'));
    expect(await rijen(page).count()).toBe(await page.evaluate(() => TX.filter((t) => t.amount > 0).length));
    const bedragen = await page.locator('#txlist .amt').allTextContents();
    expect(bedragen.every((b) => b.trim().startsWith('+'))).toBe(true);

    await page.evaluate(() => setTxType('exp'));
    expect(await rijen(page).count()).toBe(await page.evaluate(() => TX.filter((t) => t.amount < 0).length));
  });

  test('bedrag-bereik en zoek combineren met de rest', async ({ page }) => {
    await openTx(page);
    await page.evaluate(() => { setTxPeriod('all'); setTxAmount('min', '250'); });
    expect(await rijen(page).count()).toBe(await page.evaluate(() => TX.filter((t) => Math.abs(t.amount) >= 250).length));

    await page.evaluate(() => setTxAmount('max', '1000'));
    expect(await rijen(page).count()).toBe(await page.evaluate(
      () => TX.filter((t) => Math.abs(t.amount) >= 250 && Math.abs(t.amount) <= 1000).length));

    await page.evaluate(() => { txSearch = 'albert'; renderTxList(); txPatchBar(); });
    const namen = await page.locator('#txlist .nm').allTextContents();
    expect(namen.length).toBeGreaterThan(0);
    expect(namen.every((n) => /albert/i.test(n))).toBe(true);
  });

  test('een lege selectie zegt het eerlijk', async ({ page }) => {
    await openTx(page);
    await page.evaluate(() => { setTxAmount('min', '999999'); });
    expect(await rijen(page).count()).toBe(0);
    expect(await page.locator('#txlist').innerText()).toContain('Niets gevonden');
  });
});

test.describe('c · actieve filters staan boven de lijst', () => {
  test('elke actieve filter is een chip met een eigen ×, plus wis alles', async ({ page }) => {
    await openTx(page);
    await page.evaluate(() => { setTxPeriod('3m'); setTxType('exp'); });
    const cats = await page.evaluate(() => [...new Set(txForPeriod().map(catOf))]);
    await page.evaluate((k) => toggleTxCat(k), cats[0]);

    const labels = await chips(page).allInnerTexts();
    expect(labels.length).toBe(3);                                     // periode-pill + type + categorie
    expect(labels.join(' ')).toContain('3 maanden');
    expect(labels.join(' ')).toContain('Uitgaven');
    expect(await page.locator('#txBar .fchip .x').count()).toBe(3);     // elk actief filter heeft een eigen x

    // de x van de periode-pill zet terug op deze maand; de pill zelf opent de sheet
    await page.locator('#txBar .fchip').first().locator('.x').click();
    expect(await page.evaluate(() => txPeriod)).toBe('month');
    expect(await page.locator('#sheet').innerText()).not.toContain('in je selectie');
    await page.evaluate(() => setTxPeriod('3m'));
    await expect(page.locator('.tx-clear')).toHaveCount(1);

    // één chip wegtikken laat de rest staan
    await page.evaluate(() => removeTxFilter('type'));
    expect(await page.evaluate(() => txType)).toBe('all');
    expect(await page.evaluate(() => txPeriod)).toBe('3m');
    expect(await page.evaluate(() => txCats.size)).toBe(1);

    await page.locator('.tx-clear').click();
    const na = await page.evaluate(() => ({ p: txPeriod, c: txCats.size, t: txType, mn: txMin, mx: txMax, z: txSearch }));
    expect(na).toEqual({ p: 'month', c: 0, t: 'all', mn: null, mx: null, z: '' });
    expect(await chips(page).count()).toBe(1);
  });

  test('de samenvatting telt de selectie en het netto bedrag', async ({ page }) => {
    await openTx(page);
    await page.evaluate(() => setTxPeriod('all'));
    const verwacht = await page.evaluate(() => {
      const l = txFiltered();
      return { n: l.length, net: euro0(l.reduce((a, t) => a + t.amount, 0)) };
    });
    const sum = await page.locator('#txSum').innerText();
    expect(sum).toContain(String(verwacht.n));
    expect(sum).toContain(verwacht.net);
  });

  test('lange lijsten laden in stukken', async ({ page }) => {
    await openTx(page);
    await page.evaluate(() => { setTxPeriod('all'); txLimit = 2; renderTxList(); });
    expect(await rijen(page).count()).toBe(2);
    const knop = page.locator('#txlist button');
    await expect(knop).toContainText('laden');
    await knop.click();
    expect(await rijen(page).count()).toBeGreaterThan(2);
  });
});

test.describe('d · de filter-sheet zelf', () => {
  test('toont periode, type, categorie, rekening, bedrag en zoek', async ({ page }) => {
    await openTx(page);
    await page.evaluate(() => openTxFilter());
    await page.waitForSelector('#txFilterHead');
    const s = await page.locator('#sheet').innerText();
    for (const kop of ['Periode', 'Type', 'Categorie', 'Rekening', 'Bedrag', 'Zoek']) expect(s, kop).toContain(kop);
    expect(s).toContain('in je selectie');
    expect(await page.locator('#sheet input[type="number"]').count()).toBe(2);

    // een keuze in de sheet werkt meteen door in de lijst eronder
    await page.locator('#sheet .chip', { hasText: /^Alles$/ }).first().click();
    await page.waitForFunction(() => txPeriod === 'all');
    expect(await rijen(page).count()).toBe(await page.evaluate(() => TX.length));
  });
});
