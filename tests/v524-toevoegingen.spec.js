/* v524 stop 2, twee toevoegingen uit deel C:
   1. Zonder herkende spaarrekening toont de lagen-hero geen €0 maar "Wijs je spaarrekening aan ›" (naar openSpaarrekening),
      en er is geen blok 2. Getest op de budget-fixture (geen spaarrekening), met een contrast mét spaargeld-elders.
   2. Een tik op de laag Doelen in "Per laag · stand" brengt je naar de doelenlijst (scrollt hem in beeld, en zet eerst
      Lijst aan vanuit Tijdlijn). Getest op de toestel-stand (doelen + een spaarrekening). */
const { test, expect } = require('./klok');
const K = require('./v516-stand');   // de fixture van de v516/v517-app-goldens: geen herkende spaarrekening
const T = require('./plan-toestel-stand');

test.describe('v524 toevoeging 1: geen herkende spaarrekening', () => {
  test('a: de hero toont de aanwijzing, geen €0-kop en geen blok 2', async ({ page }) => {
    await K.boot(page);
    const r = await page.evaluate(() => {
      go('vooruit'); renderVooruit();
      const hero = document.getElementById('planLagenHero'), a = hero.querySelector('[data-spaaraanwijzen]');
      return {
        bron: spaarSaldo().bron, geenSpaar: lagenData().geenSpaar,
        aanwijzing: !!a, onclick: a ? (a.getAttribute('onclick') || '') : '',
        geenKop: !hero.querySelector('[data-lagenkoptekst]'),
        geenLaagSaldo: !hero.querySelector('[data-laagsaldo]'),
        geenBlok2: !document.getElementById('planGestort'),
        geenKaart: !document.getElementById('planLagenKaart'),
      };
    });
    expect(r.bron).toBe('geen');
    expect(r.geenSpaar).toBe(true);
    expect(r.aanwijzing).toBe(true);
    expect(r.onclick).toContain('openSpaarrekening');
    expect(r.geenKop).toBe(true);        // geen €0-lagenkop
    expect(r.geenLaagSaldo).toBe(true);  // en geen per-laag getallen
    expect(r.geenBlok2).toBe(true);      // geen "gestort naast plan"
    expect(r.geenKaart).toBe(true);      // en geen "Per laag · stand"
  });

  test('b: openSpaarrekening gaat naar de plek waar je een spaarrekening aanwijst', async ({ page }) => {
    await K.boot(page);
    const sub = await page.evaluate(() => { try { openSpaarrekening(); } catch (_) {} return window._setSub || null; });
    expect(sub).toBe('bank');   // openSetSub('bank'): daar staat de spaarrekening-schakelaar
  });

  test('c: mét spaargeld-elders is er geen aanwijzing maar een lagen-hero met de kaart', async ({ page }) => {
    await K.boot(page);
    const r = await page.evaluate(() => {
      SET.extraSavings = 3000; save(); go('vooruit'); renderVooruit();
      const hero = document.getElementById('planLagenHero');
      return {
        bron: spaarSaldo().bron, geenSpaar: lagenData().geenSpaar,
        aanwijzing: !!hero.querySelector('[data-spaaraanwijzen]'),
        heeftKop: !!hero.querySelector('[data-lagenkoptekst]'),
        kaart: !!document.getElementById('planLagenKaart'),
        blok2: !!document.getElementById('planGestort'),
      };
    });
    expect(r.bron).toBe('extra');
    expect(r.geenSpaar).toBe(false);
    expect(r.aanwijzing).toBe(false);
    expect(r.heeftKop).toBe(true);
    expect(r.kaart).toBe(true);
    /* blok 2 (gestort naast plan) hangt aan een salarisperiode; de budget-fixture heeft er geen,
       dus hij is leeg — maar de kaart "Per laag · stand" staat er wel, en dat is het verschil met toevoeging 1 */
  });
});

test.describe('v524 toevoeging 2: tik op de laag Doelen', () => {
  test('a: de Doelen-laag is bekabeld op planScrollDoelen', async ({ page }) => {
    await T.boot(page, 'nu');
    const onclick = await page.evaluate(() => { go('vooruit'); renderVooruit();
      const el = document.querySelector('#planLagenKaart [data-laag="doelen"]'); return el ? el.getAttribute('onclick') : null; });
    expect(onclick).toContain('planScrollDoelen');
  });

  test('b: in Lijst scrollt de tik de doelenlijst in beeld', async ({ page }) => {
    await T.boot(page, 'nu');
    await page.evaluate(() => { if (planWeergave() !== 'lijst') { SET.planWeergave = 'lijst'; save(); } go('vooruit'); renderVooruit();
      window.__scrolled = []; const o = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = function () { window.__scrolled.push(this.id || '?'); return o.apply(this, arguments); }; });
    expect(await page.locator('#planLijst').count()).toBe(1);
    await page.locator('#planLagenKaart [data-laag="doelen"]').click();
    expect(await page.evaluate(() => window.__scrolled)).toContain('planLijst');
  });

  test('c: vanuit Tijdlijn zet de tik eerst Lijst aan en toont de doelenlijst', async ({ page }) => {
    await T.boot(page, 'nu');
    await page.evaluate(() => { SET.planWeergave = 'tijdlijn'; save(); go('vooruit'); renderVooruit(); });
    expect(await page.locator('#planLijst').count()).toBe(0);   // tijdlijn: geen doelenlijst
    await page.locator('#planLagenKaart [data-laag="doelen"]').click();
    expect(await page.evaluate(() => planWeergave())).toBe('lijst');
    expect(await page.locator('#planLijst').count()).toBe(1);
  });
});
