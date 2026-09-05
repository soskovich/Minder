// v182: oorzaak 3 uit de Instellingen-audit. De sectie-indeling volgde de code en niet het
// onderwerp: de AI-coach stond onder Coach terwijl zijn configuratie onder Bankkoppeling staat, de
// coach had twee losse regels met verschillend gedrag, en Uiterlijk en Weergave stonden boven
// Inkomen en Bankkoppeling. Dit is verplaatsen: elk paneel houdt zijn inhoud en zijn gedrag.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

// De volgorde loopt van binnenkomende data naar wat je ermee doet naar hoe het verteld wordt.
const VOLGORDE = ['Inkomen & rekeningen', 'Bankkoppeling', 'Budget & doelen',
  'Vermogensreis · aannames', 'Coach', 'Weergave & modus', 'Uiterlijk', 'Privacy & gegevens'];

function metSet(v) {
  const p = seed();
  p.minder_set = JSON.stringify(Object.assign(JSON.parse(p.minder_set), v));
  return p;
}
async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('set'));
  await page.waitForSelector('#s-set');
}
const paneel = (page, fn) => page.evaluate((f) => {
  const d = document.createElement('div'); d.innerHTML = window[f](); return d.innerText.replace(/\s+/g, ' ');
}, fn);

test.describe('a · de AI-coach staat bij wat hij nodig heeft', () => {
  test('de schakelaar staat onder Bankkoppeling en niet meer onder Coach', async ({ page }) => {
    await boot(page);
    const bank = await paneel(page, 'setBank');
    const coach = await paneel(page, 'setCoach');
    expect(bank).toContain('AI-coach');
    expect(bank).toMatch(/coach-tekst gaat naar je eigen backend/);
    expect(coach).not.toMatch(/coach-tekst gaat naar je eigen backend/);
  });

  test('de schakelaar werkt en staat zichtbaar, niet achter Geavanceerd', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => !!SET.advBank)).toBe(false);
    await page.evaluate(() => toggleSet('bank'));
    const t = await page.evaluate(() => $('#s-set').innerText.replace(/\s+/g, ' '));
    expect(t).toContain('AI-coach');
    expect(t).not.toContain('Backend-URL');          // de configuratie blijft wel verborgen
  });

  test('aan zonder backend zegt de app nog steeds dat de lokale coach blijft', async ({ page }) => {
    await boot(page, metSet({ aiCoach: true, psd2Url: '', psd2Token: '' }));
    expect(await paneel(page, 'setBank')).toContain('nog niet ingesteld');
    await boot(page, metSet({ aiCoach: true, psd2Url: 'https://x.workers.dev', psd2Token: 't' }));
    expect(await paneel(page, 'setBank')).toContain('Die staat ingesteld');
  });

  test('de privacyregel blijft de AI-coach meetellen na de verhuizing', async ({ page }) => {
    await boot(page, metSet({ aiCoach: true }));
    expect(await page.evaluate(() => privacySub())).toBe('Lokaal, behalve de AI-coach');
  });
});

test.describe('b · de coach is één regel met één gedrag', () => {
  test('er is geen aparte regel Coach-avatar & toon meer', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => $('#s-set').innerText.replace(/\s+/g, ' '));
    expect(t).not.toContain('Coach-avatar & toon');
    expect((t.match(/Coach/g) || []).length).toBeGreaterThan(0);
    // de subregel van de ene regel noemt allebei: de stand en de gekozen coach
    expect(t).toMatch(/Je coach staat aan · .+ toon/);
  });

  test('de regel klapt inline uit, zoals elke regel zonder eigen sheet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => toggleSet('coach'));
    const t = await page.evaluate(() => $('#s-set').innerText.replace(/\s+/g, ' '));
    expect(t).toContain('Coaching');
    expect(t).toContain('Avatar & toon');
    expect(await page.evaluate(() => !$('#sheetBg').classList.contains('show'))).toBe(true);
  });

  test('de avatar-sheet blijft bereikbaar vanaf al zijn ingangen', async ({ page }) => {
    await boot(page);
    // 1) vanuit het coach-paneel in Instellingen
    await page.evaluate(() => { toggleSet('coach'); });
    await page.waitForTimeout(50);
    await page.locator('#s-set >> text=Avatar & toon').click();
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toContain('Kies je coach');
    await page.evaluate(() => closeSheet());

    // 2) vanaf de coachkop op het coachscherm
    await page.evaluate(() => go('act'));
    await page.waitForTimeout(80);
    // de kop animeert bij binnenkomst, dus we klikken hem in de pagina zelf aan
    expect(await page.evaluate(() => document.querySelector('#s-act .coachhead').getAttribute('onclick')))
      .toContain('openCoachAvatar()');
    await page.evaluate(() => document.querySelector('#s-act .coachhead').click());
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toContain('Kies je coach');

    // 3) setCoachTone heropent hem, zodat je je keuze meteen terugziet
    await page.evaluate(() => setCoachTone('zacht'));
    await page.waitForTimeout(80);
    expect(await page.locator('#sheet').innerText()).toContain('Kies je coach');
    expect(await page.evaluate(() => coachTone())).toBe('zacht');
  });

  test('de sheet blijft de enige plek waar toon en avatar instelbaar zijn', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => toggleSet('coach'));
    const t = await page.evaluate(() => $('#s-set').innerText.replace(/\s+/g, ' '));
    // het paneel verwijst ernaar, het bouwt geen tweede editor (v61)
    expect(t).not.toContain('Zacht');
    expect(t).not.toContain('Zakelijk');
    expect(await paneel(page, 'setCoach')).not.toContain('setCoachTone');
  });
});

test.describe('c · data en koppelingen boven vormgeving', () => {
  test('de acht regels staan in de nieuwe volgorde', async ({ page }) => {
    await boot(page);
    const namen = await page.evaluate(() => [...document.querySelectorAll('#s-set div[style*="min-width:0"] > div')]
      .filter((e) => (e.getAttribute('style') || '').includes('font-weight:600'))
      .map((e) => e.textContent.trim()));
    expect(namen).toEqual(VOLGORDE);
  });

  test('Uiterlijk en Weergave staan onder Inkomen en Bankkoppeling', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => $('#s-set').innerText);
    const p = (w) => t.indexOf(w);
    expect(p('Inkomen & rekeningen')).toBeLessThan(p('Uiterlijk'));
    expect(p('Bankkoppeling')).toBeLessThan(p('Uiterlijk'));
    expect(p('Bankkoppeling')).toBeLessThan(p('Weergave & modus'));
    expect(p('Privacy & gegevens')).toBeGreaterThan(p('Uiterlijk'));   // beheer onderaan
  });

  test('elke regel klapt open en dicht zonder console-fout', async ({ page }) => {
    const fouten = [];
    page.on('pageerror', (e) => fouten.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
    await boot(page);
    for (const id of ['income', 'bank', 'budget', 'fire', 'coach', 'modus', 'look', 'privacy']) {
      await page.evaluate((x) => toggleSet(x), id);
      await page.waitForTimeout(30);
      await page.evaluate((x) => toggleSet(x), id);
      await page.waitForTimeout(30);
    }
    expect(fouten).toEqual([]);
    expect(await page.evaluate(() => $('#s-set').innerText)).toContain('Privacy & gegevens');
  });
});
