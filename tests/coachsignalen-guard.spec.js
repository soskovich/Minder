// SET.coachOff wordt op precies een functionele plek gelezen: de guard in scoreNotifs(). Welke
// signalen daarbinnen vallen stond fout beschreven in CLAUDE.md en in de comment ernaast: er
// werden er vijf genoemd, met het geparkeerde-aankoopsignaal erbij. Het zijn er vier, en park-
// wordt ruim honderd regels boven de guard gepusht. Deze spec meet dat aan de accolades van het
// blok, zodat de tekst en de code niet opnieuw uiteen kunnen lopen.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const BINNEN_GUARD = ['savrules', 'meevaller', 'inflatie', 'overstreak'];

// leest de bron en geeft de push-keys terug, gesplitst op binnen/buiten het coachOff-blok
function guardKeys(page) {
  return page.evaluate(() => {
    const src = [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n').split('\n');
    const start = src.findIndex((l) => l.indexOf('if(!SET.coachOff){') >= 0);
    if (start < 0) return null;
    let d = 0, eind = -1;
    for (let i = start; i < src.length; i++) {
      d += (src[i].match(/\{/g) || []).length - (src[i].match(/\}/g) || []).length;
      if (i > start && d <= 0) { eind = i; break; }
    }
    const binnen = [], buiten = [];
    src.forEach((l, i) => {
      const m = l.match(/key:\s*'([a-z0-9-]+)'/);
      if (!m) return;
      (i >= start && i <= eind ? binnen : buiten).push(m[1]);
    });
    return { binnen, buiten, guards: src.filter((l) => l.indexOf('SET.coachOff') >= 0).length };
  });
}

test.describe('a - de guard dekt precies vier signalen', () => {
  test('savrules, meevaller, inflatie en overstreak, en niets anders', async ({ page }) => {
    await open(page, seed());
    const g = await guardKeys(page);
    expect(g).not.toBeNull();
    expect(g.binnen.sort()).toEqual(BINNEN_GUARD.slice().sort());
  });

  test('het geparkeerde-aankoopsignaal staat buiten de guard', async ({ page }) => {
    await open(page, seed());
    const g = await guardKeys(page);
    expect(g.buiten).toContain('park-');
    expect(g.binnen).not.toContain('park-');
  });

  test('SET.coachOff wordt op precies een functionele plek gelezen', async ({ page }) => {
    await open(page, seed());
    const n = await page.evaluate(() => {
      const src = [...document.querySelectorAll('script')].map((s) => s.textContent).join('\n').split('\n');
      // functioneel = er staat een operator omheen (!x, x?, x=). Een zin in commentaar noemt de
      // naam kaal, en een comment-strip zou hier meer kapotmaken dan hij oplost (v197).
      const raakt = src.filter((l) => /[!(]SET\.coachOff|SET\.coachOff\s*[?=]/.test(l));
      return {
        guard: raakt.filter((l) => l.indexOf('if(!SET.coachOff){') >= 0).length,
        // buiten de guard mag hij alleen in weergave staan: de sectieregel en de schakelaar zelf
        anders: raakt.filter((l) => l.indexOf('if(!SET.coachOff){') < 0)
          .map((l) => (l.indexOf('PATROONSIGNALEN_NAAM} staan') >= 0 ? 'sectieregel'
            : l.indexOf('type="checkbox"') >= 0 ? 'schakelaar' : l.trim().slice(0, 60))),
      };
    });
    expect(n.guard).toBe(1);
    expect(n.anders).toEqual(['sectieregel', 'schakelaar']);   // weergave, geen gedrag
  });
});

test.describe('a2 - de tekst komt uit dezelfde vier', () => {
  // v202 zette 'je coach staat uit' om naar 'je coachsignalen staan uit', op de aanname dat het om
  // alle signalen ging. Het zijn er vier van de ruim veertig, dus die tekst was nog steeds te ruim.
  // PATROONSIGNALEN is nu de enige bron voor wat de schakelaar noemt, en hier hangt hij aan de guard.
  test('PATROONSIGNALEN heeft precies de keys van de guard', async ({ page }) => {
    await open(page, seed());
    const g = await guardKeys(page);
    const tab = await page.evaluate(() => Object.keys(PATROONSIGNALEN));
    expect(tab.sort()).toEqual(g.binnen.sort());
  });

  test('de schakelaar noemt de vier en zegt wat er blijft staan', async ({ page }) => {
    await open(page, seed());
    const t = await page.evaluate(() => { go('set'); toggleSet('coach'); return $('#s-set').innerText; });
    expect(t).toContain('Signalen uit je patronen');
    expect(t).toContain('Wat Minder over meerdere maanden uit je cijfers afleidt');
    for (const w of await page.evaluate(() => Object.values(PATROONSIGNALEN))) expect(t).toContain(w);
    expect(t).toContain('Meldingen over wat er nu speelt blijven staan');
    // niet meer beweren dat het om alle signalen gaat
    expect(t).not.toContain('Je coachsignalen');
  });

  test('de sectieregel en de schakelaar gebruiken hetzelfde woord', async ({ page }) => {
    await open(page, seed());
    const r = await page.evaluate(() => {
      go('set');
      const naam = PATROONSIGNALEN_NAAM;
      const dicht = $('#s-set').innerText;
      toggleSet('coach');
      return { naam, sectie: dicht.indexOf(naam + ' staan aan') >= 0, paneel: $('#s-set').innerText.split(naam).length - 1 };
    });
    expect(r.sectie).toBe(true);
    expect(r.paneel).toBeGreaterThanOrEqual(2);   // de sectieregel en de kop van de schakelaar
  });
});

test.describe('b - gemeten aan het gedrag', () => {
  test('met de signalen uit is het regelblok op Maand leeg, en de rest blijft', async ({ page }) => {
    await open(page, seed());
    const aan = await page.evaluate(() => ({
      notif: scoreNotifs().map((n) => n.key), str: maandStructureel().map((n) => n.key),
    }));
    await page.evaluate(() => { SET.coachOff = true; save(); });
    const uit = await page.evaluate(() => ({
      notif: scoreNotifs().map((n) => n.key), str: maandStructureel().map((n) => n.key),
    }));
    expect(uit.str).toEqual([]);
    // wat wegvalt zit per definitie in de vier van de guard, en niets anders
    const weg = aan.notif.filter((k) => uit.notif.indexOf(k) < 0);
    for (const k of weg) expect(BINNEN_GUARD).toContain(k);
    for (const k of uit.notif) expect(aan.notif).toContain(k);
  });

  test('een geparkeerde aankoop blijft ook met de signalen uit gemeld', async ({ page }) => {
    const p = seed();
    const s = JSON.parse(p.minder_set);
    s.coachOff = true;
    s.coachLog = [{ ts: Date.now() - 24 * 36e5, type: 'beslis', item: 'koptelefoon', bedrag: 250, potjeId: 'boodschappen', uitkomst: 'geparkeerd', intentie: 'nu', text: 'x' }];
    p.minder_set = JSON.stringify(s);
    await open(page, p);
    expect(await page.evaluate(() => !!coParkDue())).toBe(true);
    const sig = await page.evaluate(() => (scoreNotifs() || []).filter((n) => String(n.key).indexOf('park-') === 0).map((n) => n.act));
    expect(sig).toEqual(["coStart('algemeen')"]);
  });
});
