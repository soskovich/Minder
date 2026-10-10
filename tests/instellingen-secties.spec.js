// v182: oorzaak 3 uit de Instellingen-audit, de sectie-indeling volgde de code en niet het onderwerp.
// v374: de indeling is opnieuw gemaakt (zes subpagina's, mockup "Minder instellingen"). Wat deze spec over de
// oude volgorde van negen uitklapblokken pinde is weg, want die blokken bestaan niet meer; de nieuwe volgorde en
// de statusbalk staan in instellingen-psd2.spec.js. Wat hier blijft zijn de invarianten die de herindeling
// overleven: de AI-coach staat bij de coach en een keer, de avatar-sheet is de enige editor voor toon en avatar,
// je naam staat bij de coach, er komt geen regel-editor, en er is een rekeningenlijst.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

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

test.describe('a · de AI-coach staat een keer, bij de coach', () => {
  test('de schakelaar staat onder Coach & weergave en niet onder Bank of Gegevens', async ({ page }) => {
    await boot(page);
    expect(await paneel(page, 'setCoachWeergave')).toContain('AI-coach');
    expect(await paneel(page, 'setBank')).not.toContain('AI-coach');
    expect(await paneel(page, 'setPrivacy')).not.toMatch(/AI-coach staat aan|Hoe werkt de coach/);
  });

  test('aan zonder backend zegt de app dat de lokale coach blijft', async ({ page }) => {
    await boot(page, metSet({ aiCoach: true, psd2Url: '', psd2Token: '' }));
    expect(await paneel(page, 'setCoachWeergave')).toContain('lokale coach blijft aan het woord');
    await boot(page, metSet({ aiCoach: true, psd2Url: 'https://x.workers.dev', psd2Token: 't' }));
    expect(await paneel(page, 'setCoachWeergave')).not.toContain('lokale coach blijft aan het woord');
  });

  test('de configuratie blijft achter Geavanceerd bij de bank', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => !!SET.advBank)).toBe(false);
    await page.evaluate(() => openSetSub('bank'));
    expect(await page.evaluate(() => $('#s-set').innerText)).not.toContain('Backend-URL');
  });

  test('de privacyregel telt de AI-coach mee', async ({ page }) => {
    await boot(page, metSet({ aiCoach: true }));
    expect(await page.evaluate(() => privacySub())).toBe('Lokaal, behalve de AI-coach');
  });
});

test.describe('b · de avatar-sheet is de enige editor voor toon en avatar', () => {
  test('bereikbaar vanuit Coach & weergave en vanaf de coachkop', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSetSub('coach'));
    await page.locator('#s-set >> text=Avatar & toon').click();
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toContain('Kies je coach');
    await page.evaluate(() => closeSheet());
    await page.evaluate(() => openCoachAvatar());
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toContain('Kies je coach');
    await page.evaluate(() => setCoachTone('zacht'));
    expect(await page.evaluate(() => coachTone())).toBe('zacht');
  });

  test('de pagina verwijst ernaar en bouwt geen tweede editor (v61)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSetSub('coach'));
    const t = await page.evaluate(() => $('#s-set').innerText.replace(/\s+/g, ' '));
    expect(t).not.toContain('Zacht');
    expect(t).not.toContain('Zakelijk');
    expect(await page.evaluate(() => setCoachWeergave())).not.toContain('setCoachTone');
  });
});

test.describe('d · je naam staat bij de coach die hem gebruikt', () => {
  test('het veld staat onder Coach & weergave en niet onder Inkomen', async ({ page }) => {
    await boot(page);
    expect(await paneel(page, 'setCoachWeergave')).toContain('Je naam');
    expect(await paneel(page, 'setIncome')).not.toContain('Je naam');
    expect(await page.evaluate(() => /SET\.name/.test(coVoornaam.toString()))).toBe(true);
  });

  test('invullen werkt en komt terug in het gesprek', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.name = 'Vincent'; save(); renderSet(); });
    expect(await page.evaluate(() => coVoornaam())).toBe('Vincent');
    expect(await page.evaluate(() => setCoachWeergave())).toContain('value="Vincent"');
  });
});

test.describe('e · Herkenning bouwt geen regel-editor', () => {
  test('hij zegt waar je een regel maakt', async ({ page }) => {
    await boot(page);
    const t = await paneel(page, 'setTransacties');
    expect(t).toMatch(/in een boeking zelf/);
    expect(t).not.toContain('SET.rules');
  });
});

test.describe('g · een rekeningenlijst', () => {
  test('de lijst staat onder Bank & rekeningen en niet onder Inkomen', async ({ page }) => {
    await boot(page);
    const acc = await page.evaluate(() => OWN[0]);
    expect(await page.evaluate(() => accountsCard())).toContain(`data-acc="${acc}"`);
    expect(await page.evaluate(() => setIncome())).not.toContain('data-acc=');
    expect(await page.evaluate(() => setBank())).toContain('data-acc=');
  });

  test('de tik naar je spaarrekening opent Bank & rekeningen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSpaarrekening());
    expect(await page.evaluate(() => window._setSub)).toBe('bank');
    expect(await page.evaluate(() => $('#s-set').innerText)).toContain('spaarrekening');
  });

  for (const w of [360, 390]) {
    test(`elke subpagina past op ${w}px zonder horizontale overflow`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page);
      for (const id of [null, 'inkomen', 'bank', 'spelregels', 'herkenning', 'coach', 'gegevens']) {
        await page.evaluate((x) => openSetSub(x), id);
        await page.waitForTimeout(40);
        const over = await page.evaluate(() => ({
          set: $('#s-set').scrollWidth - $('#s-set').clientWidth,
          body: document.body.scrollWidth - document.body.clientWidth,
        }));
        expect(over.set, String(id)).toBeLessThanOrEqual(1);
        expect(over.body, String(id)).toBeLessThanOrEqual(1);
      }
    });
  }
});
