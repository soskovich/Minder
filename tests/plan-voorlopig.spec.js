/* v381: TOEGEWEZEN ZONDER GELD ZONDER KEUZE IS VOORLOPIG, EN DAT STAAT ER (gevraagd door de gebruiker). De rekensom blijft die
   van v380 (deze maand telt het niet mee, vanaf volgende maand vult de inleg aan), maar de rij zegt "voorlopig" bij de
   vol-datum en geen "niet haalbaar", en de detailsheet toont "EUR X toegewezen zonder geld · nog niet gekozen" met de twee
   bestaande keuzes en hun gevolg, niets voorgekozen. Na de keuze is "voorlopig" weg. Fixture: plan-toestel-stand 'na150'
   (EUR 149,80 zonder geld op het Noodfonds, nog geen keuze), en een doel met een toewijzing boven het saldo. */
const { test, expect } = require('@playwright/test');
const T = require('./plan-toestel-stand');
const O = require('./opschonen-stand');
const tekst = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);

test.describe('a · het Noodfonds met EUR 149,80 zonder geld', () => {
  test.beforeEach(async ({ page }) => { await T.boot(page, 'na150'); await page.evaluate(() => go('vooruit')); });

  test('de invoer: er is geld zonder keuze, en de vol-datum is november', async ({ page }) => {
    const r = await page.evaluate(() => ({ z: spaarOver().zonder, zg: planStandEind().per.noodfonds.zg, vol: planVooruit().noodfonds }));
    expect(r.z).toBeGreaterThan(0); expect(r.zg).toBeGreaterThan(0); expect(r.vol).toBe(2);
  });

  test('de rij zegt voorlopig bij de vol-datum, in grijs', async ({ page }) => {
    expect(await tekst(page, '[data-id="noodfonds"] [data-rijvol]')).toBe('vol nov 2026 · voorlopig ›');
    const kleur = await page.evaluate(() => getComputedStyle(document.querySelector('[data-id="noodfonds"] [data-voorlopig]')).color);
    expect(kleur).toBe(await page.evaluate(() => { const d = document.createElement('span'); d.style.color = 'var(--mut2)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }));
    expect(await page.locator('[data-id="iw"] [data-voorlopig]').count()).toBe(0);
  });

  test('de sheet: nog niet gekozen, twee keuzes zonder selectie, elk met zijn gevolg, bevestigen uit', async ({ page }) => {
    await page.evaluate(() => openPlanDoel('noodfonds'));
    expect(await tekst(page, '#planDoelSheet [data-op="zg"]')).toBe('€149,80 toegewezen zonder geld · nog niet gekozen');
    const r = await page.evaluate(() => [...document.querySelectorAll('#planDoelSheet [data-pdzgkeuze]')].map((e) => ({ k: e.dataset.pdzgkeuze, g: e.dataset.gekozen, t: e.innerText.replace(/\s+/g, ' ') })));
    expect(r.map((x) => x.k)).toEqual(['alles', 'v:noodfonds']);
    expect(r.every((x) => x.g === '0')).toBe(true);
    expect(r[0].t).toMatch(/^Terugzetten/); expect(r[1].t).toMatch(/^Niet terugzetten/);
    for (const x of r) expect(x.t).toMatch(/vol|vol-datums/);
    expect(await page.locator('[data-pdzgbevestig]').isDisabled()).toBe(true);
  });

  test('kiezen schrijft niets; pas bevestigen, en daarna is voorlopig weg', async ({ page }) => {
    await page.evaluate(() => openPlanDoel('noodfonds'));
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.locator('[data-pdzgkeuze="alles"]').click();
    expect(await page.evaluate(() => document.querySelector('[data-pdzgkeuze="alles"]').dataset.gekozen)).toBe('1');
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
    await page.locator('[data-pdzgbevestig]').click();
    await page.evaluate(() => go('vooruit'));
    expect(await page.evaluate(() => spaarOver().zonder)).toBe(0);
    expect(await page.locator('[data-voorlopig]').count()).toBe(0);
    expect(await tekst(page, '[data-id="noodfonds"] [data-rijvol]')).not.toContain('voorlopig');
  });

  test('niet terugzetten werkt ook, en ook dan is voorlopig weg', async ({ page }) => {
    await page.evaluate(() => openPlanDoel('noodfonds'));
    await page.locator('[data-pdzgkeuze="v:noodfonds"]').click();
    await page.locator('[data-pdzgbevestig]').click();
    await page.evaluate(() => go('vooruit'));
    expect(await page.locator('[data-voorlopig]').count()).toBe(0);
  });
});

test.describe('b · een doel met een toewijzing boven het saldo', () => {
  test('voorlopig in plaats van niet haalbaar, ook in de kop', async ({ page }) => {
    await O.boot(page, { set: { planOrder: ['noodfonds', 'iw', 'kk'], goals: [
      { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'auto' },
      { id: 'iw', naam: 'Inrichting', doel: 3000, gespaard: 2000, streefdatum: '2026-10', allocMode: 'auto' }] } });
    await page.evaluate(() => go('vooruit'));
    const r = await page.evaluate(() => ({ zg: planStandEind().per.iw.zg, laat: document.querySelector('[data-id="iw"]').dataset.laat,
      w: !!document.querySelector('[data-id="iw"][data-planwaarschuwing]'), sub: document.querySelector('[data-id="iw"] [data-rijsub]').innerText, kop: document.querySelector('[data-kpischema]').innerText,
      v: !!document.querySelector('[data-id="iw"] [data-voorlopig]') }));
    expect(r.zg).toBeGreaterThan(0);
    expect(r.v).toBe(true); expect(r.laat).toBe('0'); expect(r.w).toBe(false);
    expect(r.sub).not.toContain('niet haalbaar'); expect(r.kop).not.toContain('Inrichting');
  });
});
