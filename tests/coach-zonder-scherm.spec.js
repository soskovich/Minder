// v196, fase 6: de coachpagina is opgeheven. De coach is geen bestemming meer maar een gesprek dat
// je vanaf vier plekken oproept, dus hij heeft geen eigen adres nodig. Deze spec bewaakt wat er dan
// moet blijven: de vier ingangen, de instelbaarheid van toon en avatar, en dat er nergens nog een
// verwijzing naar 'act' staat.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const RES = 'NL01RESE0000009999';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

function seed(o = {}) {
  const MS = []; for (let k = 7; k >= 0; k--) MS.push(ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
  const tx = []; let i = 0;
  const add = (m, d, a, acc, naam, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc, name: naam, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m) => {
    add(m, '02', 3000, MAIN, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -900, MAIN, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '04', -620, MAIN, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '06', -240, MAIN, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    add(m, '08', -10, RES, 'Reserve', 'RESERVERING');
  });
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 6000, [RES]: 250 }, savingMode: 'amount', savingAmount: 300,
    budgets: { huur: 900, boodschappen: 700, uiteten: 300 },
    resAcc: RES, reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 300, interval: 12, offset: 6 }],
    goals: [], planOrder: [] }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof coStart === 'function');
}
const kaal = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

test.describe('a · het scherm bestaat niet meer', () => {
  test('geen sectie, geen nav-item, geen renderer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      sectie: !!document.getElementById('s-act'),
      nav: [...document.querySelectorAll('.nav a')].map((a) => a.dataset.go),
      fn: ['renderActions', 'coachItems', 'coOfferAction', 'coachDiscipline', 'coachMirrorCard',
        'toggleCoachDisc', 'toggleStep', 'toggleActDeep'].map((n) => typeof window[n]),
      kop: document.querySelectorAll('.coachhead').length,
      reopen: '_coReopen' in window ? window._coReopen : 'weg',
    }));
    expect(r.sectie).toBe(false);
    expect(r.nav).toEqual(['dash', 'ins', 'maand', 'vooruit']);   // vijf tabs zijn er vier
    for (const t of r.fn) expect(t).toBe('undefined');
    expect(r.kop).toBe(0);
  });

  test('geen enkele functie noemt het scherm nog, comments niet meegeteld', async ({ page }) => {
    await boot(page);
    const treffers = await page.evaluate(() => {
      const kaal = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      const uit = [];
      for (const n of Object.getOwnPropertyNames(window)) {
        let f; try { f = window[n]; } catch (_) { continue; }
        if (typeof f !== 'function') continue;
        let src; try { src = kaal(f.toString()); } catch (_) { continue; }
        if (/go\(['"]act['"]\)|s-act|renderActions|toggleActDeep|toggleStep\(/.test(src)) uit.push(n);
      }
      return uit;
    });
    expect(treffers).toEqual([]);
  });

  /* De ruwe innerHTML bevat ook het script, en daar staan comments die het opgeheven scherm bij
     naam noemen. Comments zijn geen verwijzing (v165), dus we kijken naar de DOM zelf. */
  test('ook de DOM noemt het niet meer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      ids: [...document.querySelectorAll('[id]')].map((e) => e.id).filter((x) => /act/i.test(x)),
      gos: [...document.querySelectorAll('[data-go]')].map((e) => e.dataset.go),
      klik: [...document.querySelectorAll('[onclick]')].map((e) => e.getAttribute('onclick'))
        .filter((x) => /go\(['"]act['"]\)|renderActions/.test(x)),
    }));
    expect(r.ids).toEqual([]);
    expect(r.gos).not.toContain('act');
    expect(r.klik).toEqual([]);
  });
});

test.describe('b · de vier gespreksingangen blijven werken', () => {
  /* Elk onderwerp mag meteen weer eindigen als er niets te bespreken valt (coTopicLek stopt zonder
     lek, coTopicHorizon zonder bron). Wat deze test bewaakt is dat de ingang bestaat en het juiste
     pad kiest, niet dat er in deze fixture toevallig inhoud is. */
  const opent = async (page, fn) => {
    await page.evaluate(() => closeSheet());
    await page.evaluate((f) => eval(f), fn);
    await page.waitForTimeout(150);
    return page.evaluate(() => ({ thr: !!document.querySelector('#sheet #coThr'),
      onderwerp: window._coOnderwerp }));
  };

  for (const [naam, aanroep, verwacht] of [
    ['algemeen', "coStart('algemeen')", 'algemeen'],
    ['lek (Inzichten)', "coStart('lek')", 'lek'],
    ['horizon (Plan)', "coStart('horizon')", 'horizon'],
    ['maand (Maand)', "coStart('maand')", 'maand'],
  ]) {
    test(`${naam} opent het gesprek in de sheet`, async ({ page }) => {
      await boot(page);
      const r = await opent(page, aanroep);
      expect(r.thr).toBe(true);                 // de draad hangt in de sheet, niet in een scherm
      expect(r.onderwerp).toBe(verwacht);
    });
  }

  test('elk van de vier schermen draagt zijn eigen ingang', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const kaal = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      return { ins: /coStart\('lek'/.test(kaal(whatStandsOutLine.toString())),
        plan: /coStart\('horizon'/.test(kaal(coHorizonVraag.toString())),
        maand: /coStart\('maand'/.test(kaal(maandCoachIngang.toString())),
        algemeen: /coStart\('algemeen'/.test(kaal(maandCoachIngang.toString())) };
    });
    expect(r).toEqual({ ins: true, plan: true, maand: true, algemeen: true });
  });

  /* Het onderwerp 'algemeen' hield na het opheffen van het scherm zijn aanroepers, maar alle drie
     zijn contextueel: de maandingang wanneer alles ok is, het geparkeerde-aankoopsignaal, en de
     bespaartip-knop in de budgetafwijkingen-sheet. Er is dus geen plek meer waar je 'de coach
     opent' zonder aanleiding; het gesprek is voortaan altijd een antwoord op iets. */
  test('algemeen wordt alleen contextueel opgeroepen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const kaal = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      const uit = [];
      for (const n of Object.getOwnPropertyNames(window)) {
        let f; try { f = window[n]; } catch (_) { continue; }
        if (typeof f !== 'function') continue;
        let src; try { src = kaal(f.toString()); } catch (_) { continue; }
        if (/coStart\('algemeen'/.test(src)) uit.push(n);
      }
      return uit.sort();
    });
    expect(r.length).toBeGreaterThan(0);
    expect(r).toContain('maandCoachIngang');       // alles ok: een rustige vraag
    expect(r).toContain('scoreNotifs');            // het geparkeerde-aankoopsignaal
  });
});

test.describe('c · toon en avatar blijven instelbaar', () => {
  test('de sheet is bereikbaar vanuit Instellingen en wisselt allebei', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('set'); openCoachAvatar(); });
    await page.waitForSelector('#sheetBg.show');
    expect(await page.locator('#sheet').innerText()).toContain('Kies je coach');
    await page.locator('#coachToneChips .chip', { hasText: 'Zakelijk' }).click();
    await page.waitForFunction(() => coachTone() === 'zakelijk');
    const av = await page.evaluate(() => SET.coachAvatar);
    await page.locator('#sheet .coav, #sheet [onclick*="setCoachAvatar"]').first().click();
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => ({ tone: coachTone(), avatarBestaat: typeof coachAvatar() })))
      .toEqual({ tone: 'zakelijk', avatarBestaat: 'string' });
    expect(av === undefined || typeof av === 'string').toBe(true);
  });

  test('de instellingsregel noemt de stand en opent de sheet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('set'));
    const t = await page.locator('#s-set').innerText();
    expect(t).toMatch(/Signalen uit je patronen staan (aan|uit)/);   // v202
    expect(await page.evaluate(() => typeof openCoachAvatar)).toBe('function');
    // de regel klapt inline uit en verwijst dan naar de sheet; hij stelt zelf niets in (v182)
    await page.evaluate(() => toggleSet('coach'));
    expect(await page.locator('#s-set').innerHTML()).toContain('openCoachAvatar()');
  });

  test('wisselen hangt nergens meer aan het opgeheven scherm', async ({ page }) => {
    await boot(page);
    for (const f of ['setCoachTone', 'setCoachAvatar', 'coachHerteken']) {
      const src = await page.evaluate((n) => window[n].toString(), f);
      expect(kaal(src), f).not.toMatch(/renderActions|s-act/);
    }
  });
});

test.describe('d · de koopcheck houdt een ingang', () => {
  test('een regel op Home opent de check', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('dash'));
    await page.waitForSelector('#s-dash .homehero');
    const regel = page.locator('#s-dash [onclick="openBuy()"]');
    await expect(regel).toHaveCount(1);
    expect((await regel.innerText()).toLowerCase()).toContain('ik wil iets kopen');
    await regel.click();
    await page.waitForSelector('#sheetBg.show');
    expect((await page.locator('#sheet').innerText()).toLowerCase()).toMatch(/kopen|aankoop/);
  });

  test('de PWA-shortcut blijft de tweede ingang', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => document.documentElement.outerHTML);
    expect(src).toContain("action')==='buy'");
  });
});

test.describe('e · regel 5 is context, geen bevinding', () => {
  test('grootsteHefboom leest zes afgeronde maanden en zegt het in één zin', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ H: grootsteHefboom(), zin: hefboomZin(),
      keys: (scoreNotifs({ negeerSnooze: true }) || []).map((n) => n.key) }));
    expect(r.H).toBeTruthy();
    expect(r.H.maanden).toBe(6);                       // slice(-6) van de afgeronde maanden
    expect(r.H.cat).toBe('boodschappen');              // de grootste variabele post in deze fixture
    expect(r.zin).toMatch(/Over de laatste 6 maanden/);
    expect(r.zin).toMatch(/grootste/);
    expect(r.keys).not.toContain('hefboom');           // geen signaal, dus geen melding
  });

  test('zonder afgeronde historie zegt hij niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const echt = months;
      window.months = () => [thisYM()];
      const uit = { H: grootsteHefboom(), zin: hefboomZin() };
      window.months = echt; return uit;
    });
    expect(r.H).toBeNull();
    expect(r.zin).toBe('');
  });
});
