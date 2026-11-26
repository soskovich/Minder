/* v524 blok 3 (volle Groeien-sheet, mockup v10). Stand: v521a-stand (24 nov – 23 dec, dag 1): Saxo + Peaks €100 per maand,
   Pensioen €200 vanaf januari 2027. Per belegging de waarde met de datum en de inleg met startmaand; een "Inleg per periode"-
   totaal (dezelfde bron als de laag-sub); en de voorwaarden voor beleggen, die per belegging gelden (jouw keuze, v332). */
const { test, expect } = require('./klok');
const B = require('./v521a-stand');

test.describe('v524 blok 3: de volle Groeien-sheet', () => {
  test('a: per belegging waarde + inleg, een inleg-per-periode-totaal, en de voorwaarden per belegging', async ({ page }) => {
    await B.boot(page);
    const r = await page.evaluate(() => {
      openGroeien();
      const sh = document.getElementById('groeiSheet');
      const rows = [...sh.querySelectorAll('[data-groeibelegging]')].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
      const tot = sh.querySelector('[data-groeiinleg]'), vw = sh.querySelector('[data-groeivoorwaarden]');
      const I = lagenGroeienInleg(lagenPeriode());
      return {
        groeien: +sh.dataset.groeien, Lgroeien: lagenData().groeien, rows,
        inlegNu: tot ? +tot.dataset.groeiinleg : null, inlegLater: tot ? +tot.dataset.groeiinleglater : null,
        Inu: I.nu, Ilater: I.nu + Object.values(I.later).reduce((a, b) => a + b, 0),
        totText: tot ? tot.textContent.replace(/\s+/g, ' ').trim() : null,
        vwN: vw ? +vw.dataset.groeivoorwaarden : null, vwText: vw ? vw.textContent.replace(/\s+/g, ' ').trim() : null,
        vwOnclick: vw ? (vw.querySelector('[onclick]') || {}).getAttribute('onclick') : null,
        reis: !!sh.querySelector('[onclick*="vermogen"]'),
      };
    });
    expect(r.groeien).toBe(r.Lgroeien);
    expect(r.rows.length).toBe(3);
    expect(r.rows.find((x) => /Saxo/.test(x))).toContain('inleg €100 per maand');
    expect(r.rows.find((x) => /Pensioen/.test(x))).toContain('inleg €200 vanaf jan 2027');
    /* het totaal leest dezelfde bron (lagenGroeienInleg) als de laag-sub */
    expect(r.inlegNu).toBe(r.Inu);       // 200: Saxo + Peaks nu
    expect(r.inlegLater).toBe(r.Ilater); // 400: + pensioen vanaf jan
    expect(r.totText).toContain('Inleg per periode');
    expect(r.totText).toContain('€400 vanaf jan 2027');
    /* voorwaarden per belegging: alle drie nog niet bevestigd → gated, met een tik naar de volle sheet */
    expect(r.vwN).toBe(3);
    expect(r.vwText).toContain('Voorwaarden voor beleggen gelden voor');
    expect(r.vwText).toContain('(jouw keuze per belegging)');
    expect(r.vwOnclick).toContain('openBeleggenVoorwaarden');
    expect(r.reis).toBe(true);
  });

  test('b: een belegging waarvan jij de voorwaarden bevestigde telt niet meer in de regel', async ({ page }) => {
    await B.boot(page);
    const r = await page.evaluate(() => {
      for (const a of SET.assets) if (a.id === 'saxo' || a.id === 'peaks') a.voorwaarden = true;
      save(); openGroeien();
      const vw = document.querySelector('#groeiSheet [data-groeivoorwaarden]');
      return { vwN: vw ? +vw.dataset.groeivoorwaarden : null, text: vw ? vw.textContent : null };
    });
    expect(r.vwN).toBe(1);        // alleen het pensioen nog
    expect(r.text).toContain('Pensioen');
    expect(r.text).not.toContain('Saxo');
  });

  test('c: met alle voorwaarden bevestigd staat er geen voorwaarden-regel meer', async ({ page }) => {
    await B.boot(page);
    const geen = await page.evaluate(() => {
      for (const a of SET.assets) a.voorwaarden = true; save(); openGroeien();
      return !document.querySelector('#groeiSheet [data-groeivoorwaarden]');
    });
    expect(geen).toBe(true);
  });
});
