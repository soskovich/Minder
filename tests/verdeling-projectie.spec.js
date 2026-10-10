/* v373: WAT verdeelmodus.spec.js AAN PROJECTIE DEKTE, NU IN DE VERDELING. Een doel heeft geen eigen modus meer (de doel-editor
   toont hem niet en de motor leest hem niet na de overgang); het bedrag per doel staat in SET.planVerdeling. De rekenregels
   die die spec vasthield blijven gelden voor de verdeling: een vast bedrag krijgt exact dat bedrag, nooit meer dan het doel
   nodig heeft, afgekapt op de inleg, en wat overblijft of vrijkomt zakt door op volgorde (zolang er geen vol-keuze is, of
   bij "het volgende doel"). De tests over de modi zelf (chips, percentage, de zachte hint op modi) zijn vervallen. */
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const CAP = 300;
function tweak(fn) {
  const p = seed(); const set = JSON.parse(p.minder_set);
  set.nfToegewezen = 9e7; set.nfToegewezenMigrated = true;   // grendel open: deze spec gaat over de verdeling zelf
  fn(set); p.minder_set = JSON.stringify(set); return p;
}
const zelf = (goals, bedragen, extra) => tweak((s) => {
  s.goals = goals; s.planOrder = goals.map((g) => g.id).concat(['noodfonds']);
  s.planVerdeling = { modus: 'zelf', bedragen, bijVol: null }; s.planVerdelingV373 = 1;
  if (extra) extra(s);
});
const D = (id, naam, doel, gespaard) => ({ id, naam, doel, gespaard: gespaard || 0, streefdatum: '2030-01' });
async function openV(page, payload) { await open(page, payload); await page.evaluate(() => go('vooruit')); await page.waitForSelector('#s-vooruit .card'); }
const alloc = (page) => page.evaluate(() => allocatePlan().map((x) => ({ id: x.id, mode: x.mode, alloc: x.alloc, base: x.base, extra: x.extra, eta: x.eta, status: x.status })));

test.describe('a · een bedrag per doel in de verdeling', () => {
  test('exact het bedrag, en wat vrijkomt zakt door: Vakantie is in maand 14 vol en niet in 17', async ({ page }) => {
    await openV(page, zelf([D('gA', 'Vakantie', 2000), D('gB', 'Laptop', 2000)], { gA: 120, gB: 180 }));
    const P = await alloc(page);
    expect(P.map((x) => x.id)).toEqual(['gA', 'gB', 'noodfonds']);
    expect(P[0].alloc).toBe(120); expect(P[1].alloc).toBe(180);
    expect(P[2].status).toBe('bereikt');
    /* Laptop is na 12 maanden vol (2000 bij 180), en daarna zakt zijn 180 door naar Vakantie: die staat na maand 12
       op 1.440 + 160 doorgezakt in de vulmaand en haalt de 2.000 in maand 14. Zonder doorzakken was het ceil(2000/120). */
    expect(P[0].eta).toBe(14); expect(P[0].eta).toBeLessThan(Math.ceil(2000 / 120));
    expect(P[1].eta).toBe(Math.ceil(2000 / 180));
  });
  test('drie bedragen die samen de inleg zijn', async ({ page }) => {
    await openV(page, zelf([D('gA', 'Vakantie', 2000), D('gB', 'Laptop', 2000), D('gC', 'Fiets', 2000)], { gA: 100, gB: 90, gC: 110 }));
    const P = await alloc(page);
    expect([P[0].alloc, P[1].alloc, P[2].alloc]).toEqual([100, 90, 110]);
    expect(P[0].alloc + P[1].alloc + P[2].alloc).toBe(CAP);
  });
  test('een bedrag boven de inleg wordt afgekapt, niet geblokkeerd', async ({ page }) => {
    await openV(page, zelf([D('gA', 'Vakantie', 9000), D('gB', 'Laptop', 2000)], { gA: 900, gB: 0 }));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(CAP); expect(P[1].status).toBe('wacht op capaciteit');
    expect(P[0].eta).toBe(Math.ceil(9000 / CAP));
  });
  test('nooit meer dan het doel nog nodig heeft; de rest zakt door', async ({ page }) => {
    await openV(page, zelf([D('gA', 'Bijna klaar', 1000, 950), D('gB', 'Laptop', 2000)], { gA: 200, gB: 100 }));
    const P = await alloc(page);
    expect(P[0].alloc).toBe(50); expect(P[1].alloc).toBe(CAP - 50);
  });
  test('zonder spaarinleg rekent de verdeling over de terugval-capaciteit', async ({ page }) => {
    await openV(page, zelf([D('gA', 'Vast', 2000), D('gB', 'Ander', 2000)], { gA: 100, gB: 5000 }, (s) => { s.savingAmount = 0; s.limit = 100; }));
    const r = await page.evaluate(() => ({ cap: planCapacity(), comfort: Math.round(noodfondsModel().comfortTot), target: monthlySavingTarget() }));
    expect(r.target).toBe(0); expect(r.cap).toBe(r.comfort);
    const P = await alloc(page);
    expect(P[0].alloc).toBe(Math.min(100, r.cap)); expect(P[1].alloc).toBe(Math.max(r.cap - 100, 0));
  });
  test('binnen de inleg: geen hint', async ({ page }) => {
    await openV(page, zelf([D('gA', 'A', 5000), D('gB', 'B', 5000)], { gA: 100, gB: 60 }));
    expect(await page.evaluate(() => planAllocWarning())).toBeNull();
    expect(await page.locator('#planWarn, #planWacht').count()).toBe(0);
  });
  test('de rij noemt bij een doel geen modus meer, alleen wat het krijgt', async ({ page }) => {
    await openV(page, zelf([D('gA', 'Vakantie', 5000), D('gB', 'Laptop', 5000)], { gA: 90, gB: 50 }));
    const t = await page.locator('#s-vooruit .plan-item[data-id="gB"]').innerText();
    expect(t).not.toMatch(/vast ·|% ·/); expect(t).toContain('€');
  });
});

test.describe('b · het noodfonds', () => {
  test('het noodfonds krijgt geen keuze zolang de buffer niet vol is', async ({ page }) => {
    await openV(page, tweak((s) => { s.nfToegewezen = 0; }));
    expect(await page.evaluate(() => !!planGrendel())).toBe(true);
    await page.evaluate(() => openNoodfondsPanel());
    await page.waitForSelector('#nfMaandChips');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Hoeveel gaat hier maandelijks heen?');
    expect(sheet).toContain('Je hele spaarinleg');
    expect(await page.locator('#sheet .chip', { hasText: 'Vast bedrag' }).count()).toBe(0);
    await page.evaluate(() => setNfAllocMode('fixed'));
    expect(await page.evaluate(() => planAllocOf(planAllocCfg('noodfonds')).mode)).not.toBe('fixed');
    const nf = await page.evaluate(() => allocatePlan().find((x) => x.id === 'noodfonds'));
    expect(nf.alloc).toBe(CAP);
    expect(await page.evaluate(() => planVrij())).toBe(0);
  });
  test('met een volle buffer staan de drie modi er wel', async ({ page }) => {
    await openV(page, tweak((s) => { s.goals = []; }));
    expect(await page.evaluate(() => planGrendel())).toBe(null);
    await page.evaluate(() => openNoodfondsPanel());
    await page.waitForSelector('#nfMaandChips');
    expect(await page.locator('#sheet .chip', { hasText: 'Vast bedrag' }).count()).toBe(1);
  });
});

test.describe('c · Vooruitblik opent met het plan', () => {
  test('de plan-zone is de eerste kaart, zonder "Nog deze maand"', async ({ page }) => {
    await openV(page, seed());
    expect(await page.locator('#s-vooruit').innerText()).not.toMatch(/nog deze maand/i);
    const idx = await page.evaluate(() => { const kids = [...document.getElementById('s-vooruit').children];
      return { plan: kids.findIndex((k) => k.getAttribute('data-zone') === 'vooruitDoelOpen'), hero: kids.filter((k) => k.classList.contains('vooruit')).length }; });
    expect(idx.plan).toBe(0); expect(idx.hero).toBe(0);
  });
});
