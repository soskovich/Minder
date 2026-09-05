// v137: de coachavatar en de coachtoon waren alleen bereikbaar via de kop van het coachscherm.
// Dat scherm verdwijnt later, dus staat er nu ook een regel bij Instellingen die dezelfde sheet
// opent. Verhuizing, geen herontwerp: één sheet, twee ingangen, en wisselen tekent voortaan het
// scherm dat je voor je hebt in plaats van alleen de Coach-tab.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const RIJ = '#s-set >> text=Coach-avatar & toon';

async function boot(page, scherm) {
  await open(page, seed());
  await page.evaluate((s) => go(s), scherm || 'set');
  await page.waitForSelector(`#s-${scherm || 'set'} .card`);
}

test.describe('a · de regel bij Instellingen', () => {
  test('staat er, in de vorm van de andere regels', async ({ page }) => {
    await boot(page);
    const rij = page.locator('#s-set .card > div', { hasText: 'Coach-avatar & toon' }).first();
    await expect(rij).toHaveCount(1);
    const t = await rij.innerText();
    expect(t).toContain('Coach-avatar & toon');
    expect(t).toMatch(/Sara · directe toon/);   // label boven, samenvatting eronder
    expect(t).toContain('›');
  });

  test('de samenvatting volgt de gekozen avatar en toon', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => coachSamenvatting())).toBe('Sara · directe toon');
    await page.evaluate(() => { SET.coachAvatar = 'm'; SET.coachTone = 'zacht'; save(); renderSet(); });
    expect(await page.evaluate(() => coachSamenvatting())).toBe('Daan · zachte toon');
    expect(await page.locator('#s-set').innerText()).toContain('Daan · zachte toon');
  });

  test('de namen hebben één bron: sheet en instellingsregel kunnen niet uiteenlopen', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => COACH_AV_NAAM)).toEqual({ v: 'Sara', m: 'Daan' });
    expect(await page.evaluate(() => /COACH_AV_NAAM/.test(openCoachAvatar.toString()))).toBe(true);
    expect(await page.evaluate(() => openCoachAvatar.toString().includes("'Sara'"))).toBe(false);
  });

  test('tikken opent de sheet, niet een uitklap', async ({ page }) => {
    await boot(page);
    await page.locator(RIJ).first().click();
    await page.waitForSelector('#sheetBg.show');
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('Kies je coach');
    expect(s).toContain('Toon');
    expect(await page.evaluate(() => SET.setOpen || '')).not.toBe('coachlook');
  });
});

test.describe('b · wisselen werkt vanaf beide plekken', () => {
  test('toon wisselen vanuit Instellingen wordt opgeslagen en teruggelezen', async ({ page }) => {
    await boot(page);
    await page.locator(RIJ).first().click();
    await page.waitForSelector('#sheetBg.show');
    await page.locator('#coachToneChips .chip', { hasText: 'Zacht' }).click();
    await page.waitForFunction(() => coachTone() === 'zacht');

    // opgeslagen, en de regel eronder is meteen bijgewerkt
    expect(await page.evaluate(() => JSON.parse(localStorage.minder_set).coachTone)).toBe('zacht');
    expect(await page.locator('#s-set').innerText()).toContain('zachte toon');

    // niet via page.reload(): de fixture zet zijn seed bij elke navigatie opnieuw weg en zou de
    // keuze juist overschrijven. load() leest dezelfde sleutel terug, precies zoals de boot doet.
    await page.evaluate(() => { SET.coachTone = 'direct'; load(); renderSet(); });
    expect(await page.evaluate(() => coachTone())).toBe('zacht');
    expect(await page.locator('#s-set').innerText()).toContain('Sara · zachte toon');
  });

  test('avatar wisselen vanuit Instellingen sluit de sheet en werkt de regel bij', async ({ page }) => {
    await boot(page);
    await page.locator(RIJ).first().click();
    await page.waitForSelector('#sheetBg.show');
    await page.evaluate(() => setCoachAvatar('m'));
    expect(await page.locator('#sheetBg').getAttribute('class')).not.toContain('show');
    expect(await page.locator('#s-set').innerText()).toContain('Daan · directe toon');
  });

  test('wisselen vanaf de coachkop werkt nog steeds', async ({ page }) => {
    await boot(page, 'act');
    // v138: het gesprek start nu in de sheet en dekt s-act af; die eerst dicht om bij de kop te komen
    await page.evaluate(() => closeSheet());
    await page.locator('#s-act .coachhead').click();
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toContain('Kies je coach');
    await page.locator('#coachToneChips .chip', { hasText: 'Zakelijk' }).click();
    await page.waitForFunction(() => coachTone() === 'zakelijk');
    expect(await page.evaluate(() => JSON.parse(localStorage.minder_set).coachTone)).toBe('zakelijk');
    // de kop staat er nog: hij verdwijnt pas als s-act zelf wordt opgeheven
    expect(await page.locator('#s-act .coachhead').count()).toBe(1);
  });
});

test.describe('c · plaatsonafhankelijk', () => {
  test('wisselen hangt niet meer aan renderActions', async ({ page }) => {
    await boot(page);
    for (const f of ['setCoachTone', 'setCoachAvatar']) {
      expect(await page.evaluate((n) => /renderActions/.test(window[n].toString()), f)).toBe(false);
      expect(await page.evaluate((n) => /coachHerteken/.test(window[n].toString()), f)).toBe(true);
    }
  });

  test('een ontbrekende renderActions geeft geen fout', async ({ page }) => {
    await boot(page);
    const fout = await page.evaluate(() => {
      const bewaard = window.renderActions;
      window.renderActions = undefined;
      let f = null;
      try { setCoachTone('zacht'); } catch (e) { f = String(e); }
      window.renderActions = bewaard;
      return f;
    });
    expect(fout).toBeNull();
    expect(await page.evaluate(() => coachTone())).toBe('zacht');
  });

  test('de sheet neemt het oppervlak over van een eerder geopende instellingen-sheet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSet('income'));   // v180: openSet kent nog income en bank
    await page.waitForSelector('#sheetBg.show');
    await page.evaluate(() => openCoachAvatar());
    expect(await page.evaluate(() => window._setSheet)).toBeNull();
    await page.evaluate(() => setCoachTone('zacht'));   // render() mag de sheet niet overschrijven
    expect(await page.locator('#sheet').innerText()).toContain('Kies je coach');
  });
});

test.describe('d · layout', () => {
  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page);
      await page.locator(RIJ).first().click();
      await page.waitForSelector('#sheetBg.show');
      const over = await page.evaluate(() => ({
        set: document.querySelector('#s-set').scrollWidth - document.querySelector('#s-set').clientWidth,
        sheet: document.querySelector('#sheet').scrollWidth - document.querySelector('#sheet').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.set).toBeLessThanOrEqual(1);
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
