// v227: de meermaands-grafiek "Uitgaven vs budget" staat op Inzichten, onder het blok over deze
// maand. Dat is een OMKERING van v178, dat hem juist naar Maand haalde omdat hij maanden naast
// elkaar zet en dat een structurele vraag is. Dat argument staat nog; BESLISSINGEN.md draagt beide
// kanten. Wat deze spec vastlegt is de plek en wat er niet met hem mee verhuist.
//
// Drie dingen die aan die plek hangen:
//  - hij staat op PRECIES EEN scherm (v178): op Inzichten wel, op Maand niet.
//  - hij staat ONDER het blok over deze maand, dus onder de hero en onder de valt-op-regel. Die
//    twee horen bij elkaar sinds v135; de grafiek komt er niet tussen.
//  - ALLEEN OP DE LOPENDE MAAND. Op Maand viel hij bij een afgesloten maand vanzelf weg, want
//    renderMaand() keert daar eerder terug (v176). renderIns() rendert wel door, en onder de kop
//    'Terugblik' zou deze grafiek maanden NA de gelezen maand tonen.
//
// Niet verhuisd, en met opzet: wat de grafiek meet. De lopende maand blijft er bewust uit (v194),
// dus hij staat onder een kop die 'Deze maand' zegt zonder deze maand te tonen. Dat is de prijs van
// deze plek en hij is bij de keuze gemeld.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

/* GRAFIEK_MIN is 6 afgeronde maanden; 8 maanden fixture geeft er 7.
   go() rendert alleen 'maand' opnieuw; de andere schermen leunen op de render bij het opstarten.
   Een SET-wijziging na het opstarten vraagt dus een eigen renderIns(), anders meet je het scherm
   van vóór die wijziging. */
async function boot(page, scherm) {
  await open(page, seed({ maanden: 8 }));
  await page.evaluate(() => { SET.openSpendChart = true; save(); renderIns(); });
  await page.evaluate((s) => go(s), scherm || 'ins');
  await page.waitForSelector('#s-' + (scherm || 'ins') + ' .card');
}
const tekst = (page, s) => page.evaluate((x) => $('#s-' + x).innerText.replace(/\s+/g, ' '), s);

test.describe('a - hij staat op Inzichten en niet meer op Maand', () => {
  test('beide schermen gelezen: op het ene wel, op het andere niet', async ({ page }) => {
    await boot(page);
    expect(await tekst(page, 'ins')).toMatch(/uitgaven vs budget/i);
    await page.evaluate(() => go('maand'));
    expect(await tekst(page, 'maand')).not.toMatch(/uitgaven vs budget/i);
  });

  test('de grafiek zelf staat er, niet alleen de kop', async ({ page }) => {
    await boot(page);
    expect(await page.locator('#s-ins #insSpendChart').count()).toBe(1);
    expect(await page.locator('#s-maand #insSpendChart').count()).toBe(0);
  });
});

test.describe('b - onder het blok over deze maand', () => {
  test('hij is de laatste kaart, en de valt-op-regel staat boven hem', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const el = document.querySelector('#s-ins');
      const kaarten = [...el.querySelectorAll('.card')];
      const chart = el.querySelector('#insSpendChart');
      const wvo = el.querySelector('#wvoLine');
      const idx = (n) => n ? kaarten.findIndex((c) => c.contains(n)) : -1;
      return { aantal: kaarten.length, chart: idx(chart), wvo: idx(wvo) };
    });
    expect(uit.chart).toBe(uit.aantal - 1);          // laatste kaart van het scherm
    if (uit.wvo >= 0) expect(uit.wvo).toBeLessThan(uit.chart);
  });

  test('de sectiekop Deze maand staat erboven, en er is er maar een', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const h = document.querySelector('#s-ins').innerHTML;
      return { secties: [...document.querySelectorAll('#s-ins .inssec')].map((e) => e.textContent.trim()),
        kop: h.indexOf('inssec'), chart: h.indexOf('insSpendChart') };
    });
    expect(uit.secties).toEqual(['Deze maand']);
    expect(uit.kop).toBeGreaterThan(-1);
    expect(uit.kop).toBeLessThan(uit.chart);
  });
});

test.describe('c - alleen op de lopende maand', () => {
  test('bij een afgesloten maand staat hij er niet', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const eerder = months().filter((m) => m < thisYM()).slice(-1)[0];
      curMonth = eerder; renderIns();
      const el = document.querySelector('#s-ins');
      return { maand: eerder, lopend: isLopendeMaand(eerder), chart: !!el.querySelector('#insSpendChart'),
        tekst: el.innerText.replace(/\s+/g, ' ') };
    });
    expect(uit.lopend).toBe(false);
    expect(uit.chart).toBe(false);
    expect(uit.tekst).not.toMatch(/uitgaven vs budget/i);
    expect(uit.tekst).toMatch(/terugblik/i);          // en de kop zegt dat je terugkijkt
  });

  test('terug naar de lopende maand en hij staat er weer', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { curMonth = thisYM(); renderIns(); });
    expect(await page.locator('#s-ins #insSpendChart').count()).toBe(1);
  });
});

test.describe('d - wat niet met hem mee verhuisde', () => {
  /* De drietraps inklap uit v90 hangt aan SET.openSpendChart en niet aan het scherm. Dat blijft dus
     werken vanaf hier, inclusief de tik op de kop, en toggleCollap() doet render() zodat het niet
     uitmaakt welk scherm de grafiek draagt (v178). */
  test('de inklap werkt vanaf Inzichten, met de tik op de kop', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    await page.evaluate(() => { delete SET.openSpendChart; SET.mode = 'rustig'; save(); go('ins'); renderIns(); });
    await page.waitForSelector('#s-ins .card');
    const kaart = page.locator('#s-ins #insSpendCard');
    await expect(kaart).toHaveCount(1);                       // Rustig start dicht
    expect(await page.locator('#s-ins #insSpendChart').count()).toBe(0);
    await kaart.locator('.row').click();
    await page.waitForSelector('#s-ins #insSpendChart');
    expect(await page.evaluate(() => SET.openSpendChart)).toBe(true);
  });

  /* v231: de abonnementenkaart is van Maand af (Instellingen, Vaste lasten). Wat deze test
     bewaakte, dat hij niet met de grafiek mee naar Inzichten ging, blijft staan. */
  test('de abonnementenkaart is niet mee naar Inzichten gegaan', async ({ page }) => {
    await boot(page);
    expect(await tekst(page, 'ins')).not.toMatch(/abonnementen/i);
    expect(await page.evaluate(() => /subsCard/.test(renderIns.toString().replace(/\/\*[\s\S]*?\*\//g, '')))).toBe(false);
  });

  /* Wat de grafiek meet is niet aangeraakt: de lopende maand blijft eruit (v194). Dit staat hier
     zodat de spanning met de kop 'Deze maand' zichtbaar blijft in plaats van stil te verdwijnen. */
  test('hij toont nog uitsluitend afgeronde maanden', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = spendVsBudgetChart();
      const nu = thisYM();
      const label = MNAMES[+nu.slice(5, 7) - 1];
      return { min: GRAFIEK_MIN, afgerond: months().filter((m) => m < nu).length,
        tekst: d.textContent.replace(/\s+/g, ' '), nuLabel: label };
    });
    expect(uit.afgerond).toBeGreaterThanOrEqual(uit.min);
    if (uit.nuLabel) expect(uit.tekst).not.toContain(uit.nuLabel);
  });
});

test.describe('e - layout', () => {
  for (const w of [360, 390]) {
    test(`Inzichten met de grafiek past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      const over = await page.evaluate(() => {
        const el = document.getElementById('s-ins');
        return Math.max(el.scrollWidth - el.clientWidth, document.documentElement.scrollWidth - document.documentElement.clientWidth);
      });
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
