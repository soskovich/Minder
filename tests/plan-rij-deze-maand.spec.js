/* v385: regel 3 van elke doelrij op Plan is "+EUR X deze maand" (inleg + terug), met "· EUR Y later" alleen als er na deze
   maand nog terugzetdelen komen. De rijen tellen op tot "Deze maand opzij" in de kop, want beide lezen dezelfde termen
   uit planStandEind(). Fixture: de stand van het toestel (Noodfonds EUR 362 inleg + EUR 688 terug, EUR 100 later;
   Inrichting EUR 1.838 inleg). De opbouw blijft in de detailsheet. */
const { test, expect } = require('@playwright/test');
const T = require('./plan-toestel-stand');

const rijen = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .plan-item[data-id]')].map((e) => {
  const sub = e.querySelector('[data-rijsub]'); const t = sub ? sub.innerText.replace(/\s+/g, ' ').trim() : '';
  const m = t.match(/^\+€([\d.]+) deze maand/);
  return { id: e.dataset.id, sub: t, getoond: m ? +m[1].replace(/\./g, '') : 0 }; }));

test.describe('regel 3: +EUR X deze maand', () => {
  test.beforeEach(async ({ page }) => { await T.boot(page, 'nu'); await page.evaluate(() => go('vooruit')); });

  test('invoer: twee doelen krijgen deze maand geld, en het noodfonds heeft nog een deel later', async ({ page }) => {
    const r = await page.evaluate(() => { const S = planStandEind().per; return Object.fromEntries(Object.entries(S).map(([k, x]) => [k, { inleg: x.inleg, tb: x.tb, later: x.nogLater }])); });
    expect(r.noodfonds).toEqual({ inleg: 362, tb: 688, later: 100 });
    expect(r.iw).toEqual({ inleg: 1838, tb: 0, later: 0 });
  });

  test('noodfonds en inrichting: de regel noemt inleg plus terug, en later alleen waar het bestaat', async ({ page }) => {
    const r = Object.fromEntries((await rijen(page)).map((x) => [x.id, x.sub]));
    expect(r.noodfonds).toBe('+€1.050 deze maand · €100 later');
    expect(r.iw).toBe('+€1.838 deze maand');
    expect(r.noodfonds).not.toContain('komt nog terug');
  });


  test('elke rij waar deze maand geld heen gaat draagt de regel, en het getoonde bedrag is dat geld', async ({ page }) => {
    const R = await rijen(page);
    const geld = await page.evaluate(() => { const S = planStandEind().per; return Object.fromEntries(Object.entries(S).map(([k, x]) => [k, x.inleg + x.tb])); });
    const metGeld = R.filter((x) => (geld[x.id] || 0) > 0);
    expect(metGeld.length).toBeGreaterThanOrEqual(2);
    for (const x of R) expect(x.getoond).toBe(Math.round(geld[x.id] || 0));
  });

  test('de detailsheet houdt de opbouw: EUR 688 terug en EUR 362 inleg', async ({ page }) => {
    await page.evaluate(() => openPlanDoel('noodfonds'));
    const r = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#sheet [data-op]')].map((e) => [e.dataset.op, +e.dataset.bedrag])));
    expect(r.terug).toBe(688); expect(r.inleg).toBe(362); expect(r.later).toBe(100);
  });
});
