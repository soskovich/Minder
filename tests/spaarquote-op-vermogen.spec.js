// v232: de spaarquote is van Maand naar Vermogen verhuisd. Hij meet welk deel van je inkomen naar
// vermogensopbouw ging (vermogensInleg), en dat is de instroom van de vermogenslaag, geen oordeel
// over of je systeem standhoudt. Alles ging mee: label, percentage, sparkline, band en de tik naar
// openKpiDetail(). Eigen kaart, direct onder de netto-vermogen-kaart en vóór de Vermogensreis; niet
// in die kaart, want Opbouw leest inkomen min uitgaven en de spaarquote vermogensInleg(). De tegel
// toont de laatste AFGERONDE maand, met de maand in het label: een halve maand is geen tempo. Het
// detail opent op diezelfde maand. Verplaatsen is nooit kopiëren: een test leest beide schermen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1 } = require('./budget-fixture');

const MFULL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const naam = (m) => MFULL[+m.slice(5, 7) - 1];

function tweak(o, fn) {
  const p = seed(o); const set = JSON.parse(p.minder_set); const tx = JSON.parse(p.minder_tx);
  fn(set, tx); p.minder_set = JSON.stringify(set); p.minder_tx = JSON.stringify(tx); return p;
}
async function vermogen(page, p) {
  await open(page, p || seed({ maanden: 8 }));
  await page.evaluate(() => go('vermogen'));
  await page.waitForSelector('#s-vermogen .card');
}
const tekst = (page, s) => page.evaluate((x) => { go(x); return document.querySelector('#s-' + x).innerText.replace(/\s+/g, ' '); }, s);
const tegel = (page) => page.locator('#s-vermogen #maandKpiBlok .wvo-tile[data-kpi="inleg"]');

test.describe('a - op Vermogen, niet op Maand', () => {
  test('beide schermen gelezen: Vermogen draagt hem, Maand niet', async ({ page }) => {
    await vermogen(page);
    await expect(tegel(page)).toHaveCount(1);
    expect(await tekst(page, 'vermogen')).toMatch(/spaarquote/i);
    expect(await tekst(page, 'maand')).not.toMatch(/spaarquote/i);
    expect(await page.evaluate(() => document.querySelectorAll('#s-maand [data-kpi]').length)).toBe(0);
    expect(await page.evaluate(() => /maandKpiBlok/.test(renderMaand.toString().replace(/\/\*[\s\S]*?\*\//g, '')))).toBe(false);
  });

  test('ook bij een afgesloten maand op de kiezer staat hij niet op Maand', async ({ page }) => {
    await vermogen(page);
    const t = await page.evaluate((m) => { zetKijkMaand(m); return document.querySelector('#s-maand').innerText.replace(/\s+/g, ' '); }, M1);
    expect(t).not.toMatch(/spaarquote/i);
  });

  test('eigen kaart, onder de netto-vermogen-kaart en vóór de Vermogensreis', async ({ page }) => {
    await vermogen(page);
    const r = await page.evaluate(() => {
      const kaarten = [...document.querySelectorAll('#s-vermogen .card')];
      const i = kaarten.findIndex((c) => c.querySelector('#maandKpiBlok'));
      return { i, vorige: kaarten[i - 1].innerText, volgende: kaarten[i + 1].innerText,
        eigen: !/Netto vermogen|Opbouw/.test(kaarten[i].innerText), hlabels: kaarten[i].querySelectorAll('.hlabel').length };
    });
    expect(r.i).toBeGreaterThan(0);
    expect(r.vorige).toContain('Netto vermogen');
    expect(r.volgende).toContain('Vermogensreis');
    expect(r.eigen).toBe(true);
    expect(r.hlabels).toBe(0);
  });
});

test.describe('b - er sneuvelt niets', () => {
  test('label met maand, percentage, band, sparkline en de tik', async ({ page }) => {
    await vermogen(page);
    const t = tegel(page);
    const txt = (await t.innerText()).replace(/\s+/g, ' ');
    expect(txt.toLowerCase()).toContain('spaarquote · ' + naam(M1));   // het label staat in kapitalen via CSS
    expect(txt).toMatch(/\d+%/);
    expect(txt).toContain('wat je opzij zette en belegde');
    expect(await t.locator('svg.spk').count()).toBe(1);
    expect(await t.getAttribute('onclick')).toBe(`openKpiDetail('inleg','${M1}')`);
  });

  test('dezelfde waarde en dezelfde band als de bron voor die maand', async ({ page }) => {
    await vermogen(page);
    const K = await page.evaluate((m) => { const k = insKpis(m).inleg; return { val: k.val, band: k.band, oordeel: k.oordeel, partial: k.partial }; }, M1);
    const txt = (await tegel(page).innerText()).replace(/\s+/g, ' ');
    expect(K.partial).toBe(false);
    expect(txt).toContain(K.val);
    expect(txt).toContain(K.band);
    if (K.oordeel) expect(txt).toContain(K.oordeel);
  });

  test('de tik opent het detail op de maand van de tegel, niet op de kiezer', async ({ page }) => {
    await vermogen(page);
    await page.evaluate(() => { curMonth = thisYM(); });
    await tegel(page).click();
    await page.waitForSelector('#kpiDetailHead');
    const sheet = (await page.locator('#sheet').innerText()).replace(/\s+/g, ' ');
    expect(sheet).toContain('Spaarquote');
    expect(sheet).toContain(await page.evaluate((m) => monthLabel(m), M1));
    expect(sheet).not.toContain('tot nu toe');
  });

  test('zonder maand-argument gedraagt openKpiDetail zich als voorheen', async ({ page }) => {
    await vermogen(page);
    await page.evaluate(() => { curMonth = thisYM(); openKpiDetail('inleg'); });
    await page.waitForSelector('#kpiDetailHead');
    const sheet = (await page.locator('#sheet').innerText()).replace(/\s+/g, ' ');
    expect(sheet).toContain(await page.evaluate((m) => monthLabel(m), CUR));
    expect(sheet).toContain('tot nu toe');
  });
});

test.describe('c - de laatste afgeronde maand, geen halve', () => {
  test('geen loopt nog, een gesloten eindpunt, en een oordeel of niets', async ({ page }) => {
    await vermogen(page);
    const txt = await tegel(page).innerText();
    expect(txt).not.toContain('loopt nog');
    expect(await tegel(page).locator('.spk-nu').count()).toBe(0);
    expect(await tegel(page).locator('.spk-eind').count()).toBe(1);
  });

  test('vermogenSpaarquoteMaand is de laatste maand vóór de lopende', async ({ page }) => {
    await vermogen(page);
    expect(await page.evaluate(() => vermogenSpaarquoteMaand())).toBe(M1);
  });

  test('zonder afgeronde maand staat er niets', async ({ page }) => {
    await vermogen(page, tweak({}, (set, tx) => { for (let i = tx.length - 1; i >= 0; i--) if (!tx[i].date.startsWith(CUR)) tx.splice(i, 1); }));
    expect(await page.evaluate(() => months().length)).toBe(1);
    expect(await page.evaluate(() => vermogenSpaarquoteMaand())).toBeNull();
    await expect(tegel(page)).toHaveCount(0);
    expect(await tekst(page, 'vermogen')).not.toMatch(/spaarquote/i);
  });

  test('met drie maanden: waarde zonder sparkline, met de verloop-regel', async ({ page }) => {
    await vermogen(page, seed({ maanden: 3 }));
    const txt = (await tegel(page).innerText()).replace(/\s+/g, ' ');
    expect(txt).toMatch(/\d+%/);
    expect(await tegel(page).locator('svg.spk').count()).toBe(0);
    expect(txt).toMatch(/verloop vanaf \d+/);
  });

  test('spaarquote onbekend: geen spaarrekening geeft een streep en de reden', async ({ page }) => {
    await vermogen(page, tweak({ maanden: 8 }, (set) => { set.savingsEnds = []; set.savingsAcc = {}; }));
    const r = await page.evaluate((m) => { const k = insKpis(m).inleg; return { raw: k.raw, val: k.val, band: k.band }; }, M1);
    test.skip(r.raw != null, 'deze fixture kent de spaarquote toch');
    const txt = (await tegel(page).innerText()).replace(/\s+/g, ' ');
    expect(txt).toContain('—');
    expect(txt).toContain(r.band);
    expect(txt).not.toMatch(/NaN|Infinity/);
  });
});

test.describe('d - layout', () => {
  for (const w of [360, 390]) {
    test(`Vermogen met de spaarquote past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await vermogen(page);
      await expect(tegel(page)).toHaveCount(1);
      const r = await page.evaluate(() => ({
        pagina: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        buiten: [...document.querySelectorAll('#s-vermogen .card')].filter((c) => c.scrollWidth > c.clientWidth + 1).length,
      }));
      expect(r.pagina).toBeLessThanOrEqual(1);
      expect(r.buiten).toBe(0);
    });
  }
});
