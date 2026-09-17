// v233: de nav loopt op in horizon (Home, Inzichten, Plan, Grip) en het laatste scherm heet Grip:
// het gaat niet over de maand maar over of je structuur standhoudt. De interne sleutel 'maand',
// go('maand'), #s-maand en minder_view zijn ongewijzigd (dezelfde afweging als v179 bij Plan). De
// maandkiezer is van Grip af: Grip leest altijd de lopende maand, en de kiezer blijft van Inzichten.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, M1 } = require('./budget-fixture');

const SCHERMEN = ['dash', 'ins', 'vooruit', 'maand'];
const tekst = (page, s) => page.evaluate((x) => { go(x); return document.querySelector('#s-' + x).innerText.replace(/\s+/g, ' '); }, s);

test.describe('a - de volgorde en de naam', () => {
  test('vier tabs, oplopend in horizon, met Grip laatst', async ({ page }) => {
    await open(page, seed());
    const r = await page.evaluate(() => [...document.querySelectorAll('.nav a')].map((a) => ({ go: a.dataset.go, label: a.innerText.trim() })));
    expect(r.map((x) => x.go)).toEqual(SCHERMEN);
    expect(r.map((x) => x.label)).toEqual(['Home', 'Inzichten', 'Plan', 'Grip']);
  });

  test('alle vier de tabs zijn bereikbaar met een tik, en go() volgt de sleutel', async ({ page }) => {
    await open(page, seed());
    for (const s of SCHERMEN) {
      await page.locator(`.nav a[data-go="${s}"]`).click();
      expect(await page.evaluate((x) => document.querySelector('#s-' + x).classList.contains('active'), s), s).toBe(true);
      expect(await page.evaluate((x) => document.querySelector(`.nav a[data-go="${x}"]`).classList.contains('on'), s), s).toBe(true);
      expect(await page.evaluate(() => localStorage.getItem('minder_view')), s).toBe(s);
      expect(await page.evaluate(() => document.querySelectorAll('.screen.active').length), s).toBe(1);
    }
  });

  test('de sleutel, de sectie en de opslag zijn niet hernoemd', async ({ page }) => {
    await open(page, seed());
    expect(await page.locator('#s-maand').count()).toBe(1);
    expect(await page.locator('#s-grip').count()).toBe(0);
    expect(await page.evaluate(() => typeof renderMaand)).toBe('function');
    const bron = await page.evaluate(() => [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n'));
    expect(bron).not.toMatch(/go\('grip'\)|minder_grip|s-grip/);
  });
});

test.describe('b - minder_view met de oude waarde opent na een herstart nog het juiste scherm', () => {
  for (const s of SCHERMEN) {
    test(`minder_view=${s} opent #s-${s}`, async ({ page }) => {
      const p = seed(); p.minder_view = s;
      await open(page, p);
      expect(await page.evaluate(() => document.querySelector('.screen.active').id)).toBe('s-' + s);
      expect(await page.evaluate(() => document.querySelector('.nav a.on').dataset.go)).toBe(s);
    });
  }
});

test.describe('c - geen zichtbare tekst noemt het scherm nog Maand', () => {
  test('op de vier schermen en Vermogen', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const alle = [];
    for (const s of SCHERMEN.concat(['vermogen'])) alle.push(await tekst(page, s));
    for (const t of alle) expect(t).not.toMatch(/\b(op|naar|vanaf|onder|via) Maand\b|maandscherm|Maand-tab/);
  });

  test('in Instellingen, met de coachschakelaar open', async ({ page }) => {
    await open(page, seed());
    const t = await page.evaluate(() => { go('set'); toggleSet('coach'); return document.querySelector('#s-set').innerText.replace(/\s+/g, ' '); });
    expect(t).toContain('in je meldingen en op Grip');
    expect(t).toContain('vanaf Inzichten, Plan en Grip');
    expect(t).not.toMatch(/\b(op|vanaf) Maand\b/);
  });

  test('op de reserveringenkaart en in het spaarquote-detail', async ({ page }) => {
    const p = seed({ maanden: 8 }); const set = JSON.parse(p.minder_set);
    set.reserveringen = [{ id: 'r1', naam: 'Waterschap', bedrag: 900, intervalM: 12, vervalmaand: M1.slice(0, 4) + '-12' }];
    set.resAcc = 'NL01SAVE0000004323'; p.minder_set = JSON.stringify(set);
    await open(page, p);
    const kaart = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = resDekkingCard(); return d.innerText.replace(/\s+/g, ' '); });
    expect(kaart).toContain('lees je op Grip');
    const detail = await page.evaluate((m) => { openKpiDetail('inleg', m); return document.querySelector('#sheet').innerText.replace(/\s+/g, ' '); }, M1);
    expect(detail).toContain('lees je op Grip');
    expect(detail).not.toContain('maandscherm');
  });

  test('de tijdseenheid blijft: een maandinvoer heet Maand', async ({ page }) => {
    await open(page, seed());
    const bron = await page.evaluate(() => [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n'));
    expect(bron).toContain('<label class="fld" style="margin-top:10px">Maand</label>');
  });
});

test.describe('d - Grip leest altijd nu; de kiezer blijft van Inzichten', () => {
  test('Grip heeft geen kiezer, geen banner en geen kop Je maand', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const h = await page.evaluate(() => { go('maand'); return document.querySelector('#s-maand').innerHTML; });
    expect(h).not.toContain('openMaandKiezer()');
    expect(h).not.toContain('afgesloten maand');
    expect(h).not.toMatch(/>Je maand</);
    const ins = await page.evaluate(() => { go('ins'); return document.querySelector('#s-ins').innerHTML; });
    expect(ins).toContain('openMaandKiezer()');
  });

  test('met Inzichten op een eerdere maand rendert Grip byte-identiek, en Inzichten zegt het zelf', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const nu = await page.evaluate(() => { go('maand'); return document.querySelector('#s-maand').innerHTML; });
    await page.evaluate((m) => zetKijkMaand(m), M1);
    await page.waitForTimeout(120);
    const daarna = await page.evaluate(() => { go('maand'); return document.querySelector('#s-maand').innerHTML; });
    expect(daarna).toBe(nu);
    expect(await tekst(page, 'ins')).toMatch(/een afgesloten maand/);
    expect(await page.evaluate(() => kijkMaand())).toBe(M1);
  });
});
