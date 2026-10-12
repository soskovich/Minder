// v394 (gevraagd door de gebruiker). Punt 1: de melding "N potjes te ruim · EUR X ›" op Zien is weg; de regel onder de
// Budget-meter is de enige regel, en een tik op een gearceerde stap in de bridge opent dezelfde te-ruim-sheet op dat
// potje (bovenaan, gemarkeerd, niets voorgekozen). Punt 2: een potje dat je deze maand laat staan telt weer volledig mee
// in het eerlijke budget (meter en bridge); zijn stap in de bridge is grijs gearceerd met het label "laten staan", de
// regel onder de meter telt hem niet meer, en volgende maand toetst de app opnieuw.
// v395: de bridge begint bij het eerlijke budget; te ruim staat gearceerd per potje bovenop de budgetbalk, en een potje
// dat je laat staan is niet meer gearceerd (geen grijze stap meer): zijn afwijking zit in overig.
// Fixture: grip-kring-stand (10 okt 2026): Huur EUR 629 te ruim, Vervoer & auto variabel deel EUR 390, budget 3325.
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const grip = async page => { await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page); await page.evaluate(() => go('maand')); };

test.describe('punt 1 · een ingang, en de bridge opent op het potje', () => {
  test('Zien draagt geen melding meer, wel de regel onder de meter', async ({ page }) => {
    await grip(page);
    expect(await page.locator('[data-teruimregel]').count()).toBe(0);
    expect(await page.locator('#gripZien').innerText()).not.toContain('potjes te ruim');
    expect(await page.locator('[data-eerlijkregel]').count()).toBe(1);
    expect(await page.evaluate(() => typeof window.teRuimRegel)).toBe('undefined');
  });
  for (const k of ['huur', 'vervoer']) test(`een tik op de gearceerde stap van ${k} opent de sheet op dat potje, en schrijft niets`, async ({ page }) => {
    await grip(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    const stuk = page.locator(`#gripBrug [data-brugstap="begin"] [data-gearceerd][data-teruimk="${k}"]`);
    expect(await stuk.count()).toBe(1);
    await page.waitForTimeout(350); await stuk.click();
    expect(await page.locator('#teRuimSheet').count()).toBe(1);
    const r = await page.evaluate(() => { const P = [...document.querySelectorAll('[data-teruimpotje]')];
      return { eerste: P[0].dataset.teruimpotje, focus: [...document.querySelectorAll('[data-teruimfocus]')].map(e => e.dataset.teruimpotje),
        gevolg: document.querySelectorAll('[data-teruimgevolg]').length }; });
    expect(r.eerste).toBe(k); expect(r.focus).toEqual([k]);
    expect(r.gevolg).toBe(0);   // niets voorgekozen
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
  test('de regel onder de meter met een potje opent ook op dat potje', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { teRuimLaten('huur'); closeSheet(); renderMaand(); });
    await page.click('[data-eerlijkregel]');
    expect(await page.locator('[data-teruimfocus]').getAttribute('data-teruimpotje')).toBe('vervoer');
  });
});

test.describe('punt 2 · laten staan telt mee', () => {
  test('Huur laten staan: eerlijk is budget min alleen Vervoer, en de kop rekent daarmee', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { const a = gripMeterBudget(); teRuimLaten('huur'); closeSheet(); renderMaand(); const b = gripMeterBudget();
      return { a: a.eerlijk, b: b.eerlijk, bud: b.budget, ruim: b.ruim, laten: b.laten.map(x => x.k), open: b.open.map(x => x.k), verschil: b.verschil, verw: b.verwacht }; });
    expect(r.a).toBe(r.bud - 1019); expect(r.b).toBe(r.bud - 390); expect(r.ruim).toBe(390);
    expect(r.laten).toEqual(['huur']); expect(r.open).toEqual(['vervoer']);
    expect(r.verschil).toBe(r.verw - r.b);
    const kop = await page.locator('[data-zienkop]').innerText();
    expect(kop).toBe(`€${Math.abs(r.verschil).toLocaleString('nl-NL')} onder eerlijk budget`);
  });
  test('in de bridge (v395): Huur laten staan is niet gearceerd, Vervoer wel, en de som loopt vanaf het eerlijke budget', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { teRuimLaten('huur'); closeSheet(); renderMaand(); });
    const r = await page.evaluate(() => [...document.querySelectorAll('#gripBrug [data-gearceerd]')].map(i => ({ k: i.dataset.teruimk, bg: i.style.background })));
    expect(r.map(x => x.k)).toEqual(['vervoer']);
    expect(r[0].bg).toContain('var(--ref)');
    expect(await page.locator('#gripBrug [data-brugstap="teruim"], #gripBrug [data-laten]').count()).toBe(0);
    const s = await page.evaluate(() => { const V = maandVooruit(); const B = gripZienBrug(V), M = gripMeterBudget(V);
      return { start: B.stappen[0].start, eerlijk: Math.round(M.eerlijk), som: B.stappen.slice(1, -1).reduce((a, x) => a + x.waarde, B.stappen[0].start), eind: Math.round(V.projectie) }; });
    expect(s.start).toBe(s.eerlijk); expect(s.som).toBe(s.eind);
    const as = await page.locator('[data-zienas]').innerText();
    expect(as).not.toContain('grijs'); expect(as).toContain('gearceerd = te ruim');
  });
  test('de Budget-meter-sheet: Vervoer trekt af, Huur staat er als laten staan zonder aftrek', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { teRuimLaten('huur'); closeSheet(); openGripMeter('budget'); });
    expect(await page.locator('[data-meterruim]').evaluateAll(e => e.map(x => x.dataset.meterruim))).toEqual(['vervoer']);
    expect(await page.locator('[data-meterlaten="huur"]').innerText()).toContain('telt deze maand mee');
  });
  test('beide laten staan: geen regel, eerlijk is het hele budget, niets gearceerd', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { teRuimLaten('huur'); teRuimLaten('vervoer'); closeSheet(); renderMaand(); });
    expect(await page.locator('[data-eerlijkregel]').count()).toBe(0);
    expect(await page.locator('#gripBrug [data-gearceerd]').count()).toBe(0);
    const M = await page.evaluate(() => gripMeterBudget());
    expect(M.eerlijk).toBe(M.budget); expect(M.ruim).toBe(0);
    expect(await page.locator('[data-zienas]').innerText()).not.toContain('gearceerd = te ruim');
  });
  test('volgende maand toetst de app opnieuw: laten staan gold alleen deze maand', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { teRuimLaten('huur'); const nu = gripMeterBudget().ruim;
      SET.teRuimLaten = { '2026-09': SET.teRuimLaten['2026-10'] }; save(); return { nu, later: gripMeterBudget().ruim }; });
    expect(r.nu).toBe(390); expect(r.later).toBe(1019);
  });
  test('Kiezen blijft "herzien" tonen vanaf de 2e maand, ook voor een potje dat vorige maand bleef staan', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { SET.teRuimMaand['2026-09'] = ['huur', 'vervoer']; SET.teRuimLaten = { '2026-09': { huur: '2026-09-12' } }; save();
      return gripTeRuimHerzien().map(x => x.k).sort(); });
    expect(r).toEqual(['huur', 'vervoer']);
  });
});
