// v92: bij de allereerste coach-opening staat er één warme bubbel die laat zien wát de coach kan.
// Daarna is de opening precies zoals hij was (groet -> menu).
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

function tweak(fn) {
  const p = seed(); const set = JSON.parse(p.minder_set); fn(set); p.minder_set = JSON.stringify(set); return p;
}
async function coach(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('act'));
  await page.waitForSelector('#s-act .coachhead');
  await page.waitForFunction(() => [...document.querySelectorAll('#coThr .co')].filter((b) => b.innerText.trim()).length >= 2, null, { timeout: 15000 });
  // wachten tot het gesprek is uitgesproken: er staan keuzes klaar, dan komt er niets meer bij
  await page.waitForFunction(() => document.querySelectorAll('#coCh .cch').length > 0, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}
const draad = (page) => page.locator('#coThr').innerText();
// de typ-indicator is ook een .co-bubbel maar zonder tekst; die telt niet mee
const bubbels = (page) => page.evaluate(() => [...document.querySelectorAll('#coThr .co')].map((b) => b.innerText.trim()).filter(Boolean));

test.describe('a · de eerste opening', () => {
  test('toont de groet en daarna één warme waarde-bubbel', async ({ page }) => {
    await coach(page);
    const b = await bubbels(page);
    expect(b[0]).toMatch(/waarmee kan ik je helpen/i);              // de bestaande groet blijft eerst
    expect(b[1]).toContain('aankoop');
    expect(b[1]).toContain('bespaarkans');
    expect(b[1]).toContain('vaste lasten');
    expect(b[1]).toMatch(/jij kiest|of niets/i);                    // geen dwang
    expect(await page.evaluate(() => SET.coachSeen)).toBe(1);
  });

  test('en gaat daarna gewoon door naar het gesprek', async ({ page }) => {
    await coach(page);
    const t = await draad(page);
    expect(t).toMatch(/waar werk je|waar wil je het over hebben|je werkt aan/i);
    expect(await page.locator('#coCh .cch').count()).toBeGreaterThan(0);   // er staan keuzes klaar
  });
});

test.describe('b · daarna nooit meer', () => {
  test('een tweede opening is de bestaande groet zonder intro', async ({ page }) => {
    await coach(page);
    await page.evaluate(() => { go('dash'); go('act'); });
    await page.waitForTimeout(800);
    const b = await bubbels(page);
    expect(b[0]).toMatch(/waarmee kan ik je helpen/i);
    expect(b.join(' ')).not.toContain('bespaarkans');
    expect(b.filter((x) => /waarmee kan ik je helpen/i.test(x)).length).toBe(1);   // precies één groet
  });

  test('een gebruiker die de coach al kent krijgt hem niet alsnog', async ({ page }) => {
    await coach(page, tweak((s) => { s.coachSeen = 1; }));
    const b = await bubbels(page);
    expect(b[0]).toMatch(/waarmee kan ik je helpen/i);
    expect(b.join(' ')).not.toContain('bespaarkans');
  });
});

test.describe('c · toon en robuustheid', () => {
  test('de intro volgt de gekozen coach-toon', async ({ page }) => {
    const varianten = {};
    for (const toon of ['direct', 'zacht', 'zakelijk']) {
      await coach(page, tweak((s) => { s.coachTone = toon; }));
      varianten[toon] = (await bubbels(page))[1];
    }
    expect(varianten.zacht).toMatch(/fijn dat je er bent/i);
    expect(varianten.zakelijk.length).toBeLessThan(varianten.zacht.length);
    for (const t of Object.values(varianten)) {
      expect(t).toContain('bespaarkans');                          // dezelfde inhoud, andere verwoording
      expect(t).toMatch(/vaste lasten/i);
    }
    expect(new Set(Object.values(varianten)).size).toBe(3);
  });

  test('geen dubbele bubbels bij een tussentijdse render', async ({ page }) => {
    await coach(page);
    const voor = await bubbels(page);
    await page.evaluate(() => render());
    await page.waitForTimeout(300);
    expect(await bubbels(page)).toEqual(voor);                      // _coLive-guard: de draad blijft staan
  });

  test('een geparkeerde aankoop komt ná de intro, niet ervoor', async ({ page }) => {
    await coach(page, tweak((s) => {
      s.coachLog = [{ type: 'beslis', uitkomst: 'geparkeerd', item: 'koptelefoon', bedrag: 180, ts: Date.now() - 2 * 864e5 }];
    }));
    const b = await bubbels(page);
    expect(b[0]).toMatch(/waarmee kan ik je helpen/i);
    expect(b[1]).toContain('bespaarkans');
    expect(b.slice(2).join(' ').toLowerCase()).toContain('koptelefoon');
  });
});
