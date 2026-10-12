// v393 (gevraagd door de gebruiker). Punt 2: onder de Budget-meter een regel zolang een te ruim potje open staat:
// "Eerlijk budget lager: <potje> −€X ›", bij meer potjes "Eerlijk budget lager: €X (n potjes) ›"; de tik opent de
// te-ruim-sheet en de regel verdwijnt na verlagen of laten staan. Punt 3: te ruim (ook het variabele deel van Vervoer)
// staat in de eerste maand niet in Kiezen, en vanaf de 2e maand bovenaan als "herzien".
// Fixture: grip-kring-stand (10 okt 2026): Huur EUR 629 te ruim, Vervoer & auto variabel deel EUR 390 te ruim.
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const grip = async page => { await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page); await page.evaluate(() => go('maand')); };
const regel = page => page.evaluate(() => { const e = document.querySelector('#gripMeters + [data-eerlijkregel], [data-eerlijkregel]'); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; });

test.describe('punt 2 · eerlijk budget lager', () => {
  test('twee open potjes: "Eerlijk budget lager: €1.019 (2 potjes) ›", en dat is wat de meter aftrekt', async ({ page }) => {
    await grip(page);
    expect(await regel(page)).toBe('Eerlijk budget lager: €1.019 (2 potjes) ›');
    const r = await page.evaluate(() => { const M = gripMeterBudget(); return M.budget - M.eerlijk; });
    expect(r).toBe(1019);
    // de regel staat direct onder de meters, voor de regel nu/verwacht
    const volg = await page.evaluate(() => { const m = document.getElementById('gripMeters'); return m.nextElementSibling.hasAttribute('data-eerlijkregel'); });
    expect(volg).toBe(true);
  });
  test('de tik opent de te-ruim-sheet en schrijft niets', async ({ page }) => {
    await grip(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    expect(voor).toContain('teRuimMaand');
    await page.click('[data-eerlijkregel]');
    expect(await page.locator('#teRuimSheet').count()).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
  test('een potje laten staan: "Eerlijk budget lager: Vervoer & auto −€390 ›"; verlagen: de regel is weg', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { teRuimLaten('huur'); closeSheet(); renderMaand(); });
    expect(await regel(page)).toBe('Eerlijk budget lager: Vervoer & auto −€390 ›');
    await page.evaluate(() => { teRuimZet('vervoer'); });
    expect(await page.locator('[data-eerlijkregel]').count()).toBe(0);
  });
  test('beide laten staan: geen regel, terwijl het eerlijke budget gelijk blijft', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const e0 = gripMeterBudget().eerlijk; teRuimLaten('huur'); teRuimLaten('vervoer'); closeSheet(); renderMaand();
      return { e0, e1: gripMeterBudget().eerlijk, n: document.querySelectorAll('[data-eerlijkregel]').length }; });
    expect(r.n).toBe(0); expect(r.e1).toBe(r.e0);
  });
  test('past op 360px op een regel, zonder overloop', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 }); await K.boot(page); await page.evaluate(() => go('maand'));
    const r = await page.evaluate(() => { const e = document.querySelector('[data-eerlijkregel]'); return { h: e.getBoundingClientRect().height, sw: document.documentElement.scrollWidth }; });
    expect(r.h).toBeLessThan(20); expect(r.sw).toBeLessThanOrEqual(360);
  });
});

test.describe('punt 3 · te ruim in Kiezen pas vanaf de 2e maand', () => {
  test('eerste maand: Kiezen noemt Huur en Vervoer niet; tweede maand: beide bovenaan als herzien', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => gripKiesTab('kiezen'));
    const t1 = await page.evaluate(() => document.getElementById('gripInhoud').innerText);
    expect(await page.locator('[data-kiesherzien]').count()).toBe(0);
    for (const w of ['Huur', 'Vervoer', 'te ruim']) expect(t1).not.toContain(w);
    await page.evaluate(() => { SET.teRuimMaand['2026-09'] = ['huur', 'vervoer']; save(); gripKiesTab('kiezen'); });
    const r = await page.evaluate(() => [...document.querySelectorAll('[data-kiezen] [data-kiesherzien], [data-kiezen] [data-kiesrij]')]
      .map(e => e.dataset.kiesherzien || 'patroon'));
    expect(r.slice(0, 2).sort()).toEqual(['huur', 'vervoer']);
    expect(r.indexOf('patroon')).toBeGreaterThan(1);
    expect((await page.locator('[data-kiesherzien="vervoer"]').innerText()).replace(/\s+/g, ' ')).toContain('variabel deel te ruim');
  });
});
