/* v380 (deel 1 van de ronde Plan): de getallen kloppend.
   C (variant X): wat na deze maand nog terugkomt is GEEN ruimte voor je inleg. De inleg van deze maand in de projectie is
   die van allocatePlan(), de terugzetdelen vullen het restant aan, en vol is pas als alles binnen is (december).
   D: een functie voor de verwachte stand eind deze maand (planStandEind()), en nog te gaan rekent vanaf het geld. */
const { test, expect } = require('@playwright/test');
const T = require('./plan-toestel-stand');

test.describe('a · de stand van het toestel na de drie keuzes', () => {
  test.beforeEach(async ({ page }) => { await T.boot(page, 'nu'); });

  test('de invoer draagt het geval: EUR 150 gespreid, EUR 50 nu en EUR 100 later', async ({ page }) => {
    const r = await page.evaluate(() => { const TP = terugzetProjectie(); return { rest: TP && TP.rest.noodfonds, bij: TP && TP.bij }; });
    expect(r.rest).toBe(100);
    expect(r.bij[2].noodfonds).toBe(50); expect(r.bij[3].noodfonds).toBe(50);
  });

  test('de verwachte stand eind oktober is EUR 2.850 + EUR 688 + EUR 362 = EUR 3.900, onder het doel', async ({ page }) => {
    const x = await page.evaluate(() => planStandEind().per.noodfonds);
    expect(Math.round(x.geld)).toBe(2850); expect(x.tb).toBe(688); expect(x.inleg).toBe(362);
    expect(Math.round(x.S)).toBe(3900); expect(x.S).toBeLessThan(x.doel);
    expect(x.nogLater).toBe(100); expect(x.later.map((l) => l.bedrag)).toEqual([50, 50]);
  });

  test('vol december 2026, met het laatste terugzetdeel', async ({ page }) => {
    const r = await page.evaluate(() => { const V = planVooruit(); return { m: V.noodfonds, lbl: etaDatum(V.noodfonds) }; });
    expect(r.m).toBe(3); expect(r.lbl).toBe('dec 2026');
  });

  test('de projectie geeft in oktober dezelfde inleg als de toewijzing: Noodfonds 362, Inrichting 1.838', async ({ page }) => {
    const r = await page.evaluate(() => { const P = allocatePlan(), reeks = {}; planVooruit(P, planCapacity(), null, null, undefined, reeks);
      const a = Object.fromEntries(P.map((p) => [p.id, p.alloc])); return { a, nf1: reeks.noodfonds[1], iw1: reeks.iw[1] }; });
    expect(r.a.noodfonds).toBe(362); expect(r.a.iw).toBe(1838);
    expect(r.nf1).toBe(362); expect(r.iw1).toBe(1838);
  });

  test('de inleg schuift door: in november vraagt het Noodfonds niets meer', async ({ page }) => {
    const r = await page.evaluate(() => { const reeks = {}; planVooruit(allocatePlan(), planCapacity(), null, null, undefined, reeks); return { nf2: reeks.noodfonds[2], iw2: reeks.iw[2] }; });
    expect(r.nf2 || 0).toBe(0); expect(r.iw2).toBe(1162);
  });

  test('nog te gaan is EUR 16.262: doel min verwachte stand, en niet doel min toewijzing', async ({ page }) => {
    await page.evaluate(() => go('vooruit'));
    const r = await page.evaluate(() => { const P = allocatePlan(); return { se: planStandEind(P).nogTeGaan, tot: +document.getElementById('planKpi').dataset.nogtegaan,
      toe: P.filter((p) => p.type !== 'aflossen').reduce((a, p) => a + Math.max(p.doel - p.gespaard - p.alloc, 0), 0) }; });
    expect(r.se).toBe(16262); expect(r.tot).toBe(16262);
    expect(r.toe).not.toBe(16262);
  });

  test('de rij zegt bijna vol, met wat er deze maand bijkomt en wat later nog terugkomt (v385)', async ({ page }) => {
    await page.evaluate(() => go('vooruit'));
    const r = await page.evaluate(() => { const e = document.querySelector('.plan-item[data-id="noodfonds"]'); const b = e && e.querySelector('[data-rijsub]');
      return { st: e && e.dataset.status, sub: b ? b.innerText.replace(/\s+/g, ' ').trim() : '' }; });
    expect(r.st).toBe('bijnavol');
    expect(r.sub).toBe('+€1.050 deze maand · €100 later');
  });

  test('geen ongedekt verschil meer, dus geen melding', async ({ page }) => {
    await page.evaluate(() => go('vooruit'));
    expect(await page.evaluate(() => spaarOver().zonder)).toBe(0);
    // v440: "toegewezen zonder geld" staat op Grip (toewijzingBovenSaldo); geen verschil = geen signaal (null) (de Plan-regel is nu Inhalen)
    expect(await page.evaluate(() => toewijzingBovenSaldo())).toBeNull();
  });
});

test.describe('b · tussenstand: EUR 150 binnen zonder keuze', () => {
  test.beforeEach(async ({ page }) => { await T.boot(page, 'na150'); });

  test('de melding blijft zolang er een ongedekt verschil is', async ({ page }) => {
    await page.evaluate(() => go('vooruit'));
    const z = await page.evaluate(() => spaarOver().zonder);
    expect(z).toBeGreaterThan(0);
    // v440: het signaal staat op Grip (toewijzingBovenSaldo), los van de Plan-regel (die is nu Inhalen)
    expect(await page.evaluate(() => toewijzingBovenSaldo().verschil)).toBeGreaterThan(0);
  });

  test('zonder geld telt niet in de stand: niet vol in oktober, de inleg vult het vanaf november aan, en geen bijna vol', async ({ page }) => {
    const r = await page.evaluate(() => { const x = planStandEind().per.noodfonds; return { S: x.S, zg: x.zg, doel: x.doel, vol: planVooruit().noodfonds, bijna: planBijnaVol(x) }; });
    expect(r.zg).toBeGreaterThan(0); expect(r.S).toBeLessThan(r.doel);
    expect(r.vol).toBe(2); expect(r.bijna).toBe(false);
  });
});

test.describe('c · alles terug: geen deel later', () => {
  test('vol oktober en de stand haalt het doel', async ({ page }) => {
    await T.boot(page, 'gister');
    const r = await page.evaluate(() => { const x = planStandEind().per.noodfonds; return { S: x.S, doel: x.doel, later: x.nogLater, vol: planVooruit().noodfonds }; });
    expect(r.S).toBe(r.doel); expect(r.later).toBe(0); expect(r.vol).toBe(1);
  });
});
