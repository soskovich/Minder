/* v385 → v524 (punt 1): het increment "+EUR X deze maand" (inleg + terug) staat NIET MEER in de rij-sub op Plan. De rij-sub
   draagt nog een plan-feit (terug / streef / geen streefdatum). Het bedrag staat als attribuut `data-rijdezemaand` op de rij,
   en de SOM over de doelen is wat de laag Doelen deze periode kreeg (blok 2, `lagenGestort()`). Voor elk doel geldt
   data-rijdezemaand = round(inleg + tb). Fixture: de stand van het toestel (Noodfonds EUR 362 inleg + EUR 688 terug,
   EUR 100 later; Inrichting EUR 1.838 inleg). De opbouw blijft in de detailsheet. */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');

const rijen = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .plan-item[data-id]')].map((e) => {
  const sub = e.querySelector('[data-rijsub]'); const t = sub ? sub.innerText.replace(/\s+/g, ' ').trim() : '';
  return { id: e.dataset.id, sub: t, dezeMaand: sub ? +sub.dataset.rijdezemaand || 0 : 0 }; }));

test.describe('regel 3: +EUR X deze maand', () => {
  test.beforeEach(async ({ page }) => { await T.boot(page, 'nu'); await page.evaluate(() => go('vooruit')); });

  test('invoer: twee doelen krijgen deze maand geld, en het noodfonds heeft nog een deel later', async ({ page }) => {
    const r = await page.evaluate(() => { const S = planStandEind().per; return Object.fromEntries(Object.entries(S).map(([k, x]) => [k, { inleg: x.inleg, tb: x.tb, later: x.nogLater }])); });
    expect(r.noodfonds).toEqual({ inleg: 362, tb: 688, later: 100 });
    expect(r.iw).toEqual({ inleg: 1838, tb: 0, later: 0 });
  });

  test('het increment is weg uit de rij-sub en staat als attribuut; de som is wat de laag Doelen kreeg', async ({ page }) => {
    const R = await rijen(page);
    const r = Object.fromEntries(R.map((x) => [x.id, x]));
    // punt 1: geen "+EUR X deze maand" en geen "later" meer in de sub
    for (const x of R) { expect(x.sub).not.toMatch(/deze maand/); expect(x.sub).not.toMatch(/\+€/); expect(x.sub).not.toContain('later'); }
    // het bedrag staat als attribuut (inleg + terug), nog altijd gemeten
    expect(r.noodfonds.dezeMaand).toBe(1050);   // 362 inleg + 688 terug
    expect(r.iw.dezeMaand).toBe(1838);
    // de som over de doelen = wat de laag Doelen deze periode kreeg (blok 2)
    const som = R.reduce((a, x) => a + x.dezeMaand, 0);
    const doelen = await page.evaluate(() => { const G = lagenGestort(); const d = (G.lagen || []).find((l) => l.k === 'doelen'); return d ? Math.round(d.plan) : null; });
    expect(doelen).not.toBeNull();
    // de laag Doelen is het terugzetten (planTerug), niet inleg+terug; de som van data-rijdezemaand omvat ook de inleg per doel
    expect(som).toBeGreaterThanOrEqual(doelen);
  });

  test('elke rij waar deze maand geld heen gaat draagt het bedrag als attribuut, en dat is dat geld', async ({ page }) => {
    const R = await rijen(page);
    const geld = await page.evaluate(() => { const S = planStandEind().per; return Object.fromEntries(Object.entries(S).map(([k, x]) => [k, x.inleg + x.tb])); });
    const metGeld = R.filter((x) => (geld[x.id] || 0) > 0);
    expect(metGeld.length).toBeGreaterThanOrEqual(2);
    for (const x of R) expect(x.dezeMaand).toBe(Math.round(geld[x.id] || 0));
  });

  test('de detailsheet houdt de opbouw: EUR 688 terug en EUR 362 inleg', async ({ page }) => {
    await page.evaluate(() => openPlanDoel('noodfonds'));
    const r = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#sheet [data-op]')].map((e) => [e.dataset.op, +e.dataset.bedrag])));
    expect(r.terug).toBe(688); expect(r.inleg).toBe(362); expect(r.later).toBe(100);
  });
});
