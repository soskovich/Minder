// De koopcheck draait als gesprek: buyFlow() schrijft in #coThr/#coCh, en die twee bestaan sinds
// v138 alleen in de sheet die coStart() bouwt. openBuy() vult diezelfde sheet met zijn formulier,
// dus startBuy() deed closeSheet() en riep buyFlow() aan zonder draad: die keerde terug op zijn
// eerste regel, en er kwam geen bubbel, geen keuze en geen log-entry. Alle drie de ingangen liepen
// via openBuy() en braken dus op hetzelfde punt. Deze spec legt vast dat elk van de drie tot een
// zichtbare uitkomst leidt, dat er dan ook echt iets in SET.coachLog landt, en dat een geparkeerde
// aankoop terugkeert.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

// boodschappen: potje 800, deze maand 300 uitgegeven, dus 500 ruimte
// v205: onder SLAAP_DREMPEL_DEFAULT (100) blijft, zodat deze spec de check zelf toetst en niet de
// slaapstap. Waar het bedrag er wel boven ligt wordt die stap expliciet gepasseerd.
const BINNEN = 60;
const BUITEN = 900;
const slaapStap = (page) => kies(page, 'Toch nu zien');   // v205: BUITEN ligt boven de drempel

const draad = (page) => page.evaluate(() => (document.getElementById('coThr') || {}).innerText || '');
const log = (page) => page.evaluate(() => (SET.coachLog || []).filter((l) => l.type === 'beslis'));
const wachtZin = (page, txt) => page.waitForFunction(
  (t) => { const e = document.getElementById('coThr'); return !!e && e.innerText.indexOf(t) >= 0; }, txt, { timeout: 15000 });
const wachtKeuze = (page, txt) => page.waitForFunction(
  (t) => [...document.querySelectorAll('#coCh .cch')].some((b) => b.innerText.indexOf(t) >= 0), txt, { timeout: 15000 });
async function kies(page, txt) {
  await wachtKeuze(page, txt);
  await page.locator('#coCh .cch', { hasText: txt }).first().click();
}

// vult het koopcheck-formulier dat al open staat en drukt op Check
async function vulCheck(page, amt, cat, item) {
  await page.waitForSelector('#buyAmt');
  await page.fill('#buyItem', item || 'koptelefoon');
  await page.fill('#buyAmt', String(amt));
  await page.selectOption('#buyCat', cat || 'boodschappen');
  await page.locator('#sheet button.btn', { hasText: 'Check' }).click();
}

test.describe('a - de drie ingangen leiden tot een zichtbare uitkomst', () => {
  test('vanaf Home: de regel opent de check en de check antwoordt', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => go('dash'));
    const regel = page.locator('#s-dash [onclick*="openBuy"]');
    await expect(regel).toHaveCount(1);
    await regel.click();
    await vulCheck(page, BINNEN);
    await wachtZin(page, 'Past binnen boodschappen');
    expect(await page.evaluate(() => !!document.querySelector('#sheet #coThr'))).toBe(true);
    expect(await page.evaluate(() => document.querySelector('#sheetBg').classList.contains('show'))).toBe(true);
    expect(await draad(page)).toContain('koptelefoon');
  });

  test('vanuit een gesprek: Grip op impulsen, Nu iets kopen', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set);
    set.coachGoalConfirmed = 'onbekend';   // sla de doel-vraag over, die hoort bij het menu en niet bij de check
    p.minder_set = JSON.stringify(set);
    await open(page, p);
    await page.evaluate(() => coStart('algemeen'));
    await kies(page, 'Grip op impulsen');
    await kies(page, 'Nu iets kopen');
    await vulCheck(page, BINNEN);
    await wachtZin(page, 'Past binnen boodschappen');
  });

  test('vanaf de PWA-shortcut ?action=buy', async ({ page }) => {
    await page.route('**/sw.js', (r) => r.abort());
    await page.addInitScript((data) => { for (const k in data) localStorage.setItem(k, data[k]); }, seed());
    await page.goto('/index.html?action=buy');
    await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0);
    await vulCheck(page, BINNEN);
    await wachtZin(page, 'Past binnen boodschappen');
  });
});

test.describe('b - binnen en buiten je ruimte, en wat er wordt opgeslagen', () => {
  test('een bedrag binnen je potje legt gepland vast', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => openBuy());
    await vulCheck(page, BINNEN);
    await wachtZin(page, 'vastgelegd');   // de log-entry volgt op de zin, dus wacht op de bevestiging zelf
    const l = await log(page);
    expect(l.length).toBe(1);
    expect(l[0].uitkomst).toBe('gepland');
    expect(l[0].bedrag).toBe(BINNEN);
    expect(l[0].potjeId).toBe('boodschappen');
  });

  test('een bedrag buiten je potje vraagt door in plaats van te oordelen', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => openBuy());
    await vulCheck(page, BUITEN);
    await slaapStap(page);
    await wachtZin(page, 'Wil je dit echt');
    await wachtKeuze(page, 'Ik wil het');
    const keuzes = await page.evaluate(() => [...document.querySelectorAll('#coCh .cch')].map((b) => b.innerText.trim().split('\n')[0]));
    expect(keuzes).toContain('Ik wil het écht');
    expect(keuzes).toContain('Ik wil het nú');
    expect(await log(page)).toEqual([]);   // nog geen uitkomst, dus nog niets vastgelegd
  });

  test('doorzetten legt doorgezet vast', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => openBuy());
    await vulCheck(page, BUITEN);
    await slaapStap(page);
    await kies(page, 'Ik wil het nú');
    await kies(page, 'Toch doen');
    await wachtZin(page, 'Doorgezet');
    const l = await log(page);
    expect(l.map((x) => x.uitkomst)).toEqual(['doorgezet']);
  });

  test('zonder bedrag gebeurt er niets, en dat is zichtbaar', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => openBuy());
    await page.waitForSelector('#buyAmt');
    await page.locator('#sheet button.btn', { hasText: 'Check' }).click();
    await expect(page.locator('#toast')).toContainText('Vul een bedrag in');
    expect(await log(page)).toEqual([]);
  });
});

test.describe('c1 - de omweg langs een nieuw potje komt terug in de check', () => {
  // buyFlow() biedt bij een categorie zonder potje aan er eerst een te maken. openPotje() neemt de
  // sheet over, dus de draad is daarna weg; de terugkeer moet hem opnieuw laten bouwen.
  test('een potje maken en dan opnieuw checken', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => openBuy());
    await page.waitForSelector('#buyAmt');
    const zonder = await page.evaluate(() => {
      const o = [...document.querySelectorAll('#buyCat option')].find((x) => x.textContent.indexOf('geen potje') >= 0);
      return o ? o.value : null;
    });
    expect(zonder).toBeTruthy();
    await vulCheck(page, 60, zonder, 'losse aankoop');
    await wachtKeuze(page, 'Maak eerst een');
    await page.locator('#coCh .cch', { hasText: 'Maak eerst een' }).first().click();
    await page.waitForFunction(() => !document.getElementById('coThr'));   // openPotje() heeft de sheet overgenomen
    await page.evaluate((k) => { window._potDraft = { type: 'vast', vast: 200 }; savePotje(k); }, zonder);
    await wachtZin(page, 'vastgelegd');
    const l = await log(page);
    expect(l.length).toBe(1);
    expect(l[0].uitkomst).toBe('gepland');
    expect(await page.evaluate(() => document.querySelectorAll('#sheet #coThr').length)).toBe(1);
  });
});

test.describe('c - parkeren en de terugkeer', () => {
  test('parkeren legt geparkeerd vast en de aankoop keert terug in koude staat', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => openBuy());
    await vulCheck(page, BUITEN);
    await slaapStap(page);
    await kies(page, 'Ik wil het nú');
    await kies(page, 'Even wachten tot morgen');
    await wachtZin(page, 'morgen nog');
    let l = await log(page);
    expect(l.map((x) => x.uitkomst)).toEqual(['geparkeerd']);

    // de belofte is "morgen": zet de beslissing een dag terug, precies wat de klok anders doet
    await page.evaluate(() => {
      const e = (SET.coachLog || []).find((x) => x.uitkomst === 'geparkeerd');
      e.ts -= 24 * 36e5; save();
    });
    expect(await page.evaluate(() => !!coParkDue())).toBe(true);
    const sig = await page.evaluate(() => (scoreNotifs() || []).filter((n) => String(n.key).indexOf('park-') === 0).map((n) => n.act));
    expect(sig).toEqual(["coStart('algemeen')"]);

    await page.evaluate(() => coStart('algemeen'));
    await wachtZin(page, 'parkeerde');
    expect(await draad(page)).toContain('koptelefoon');
    await kies(page, 'Laten gaan');
    await wachtZin(page, 'de impuls');
    l = await log(page);
    expect(l.map((x) => x.uitkomst)).toEqual(['geannuleerd', 'geparkeerd']);   // coachLogAdd zet nieuw vooraan
    expect(l.find((x) => x.uitkomst === 'geparkeerd').resolved).toBe(true);
  });
});

test.describe('d - de check leunt op de sheet van coStart, niet op een eigen oppervlak', () => {
  test('startBuy laat de sheet niet dicht met een geldig bedrag', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => openBuy());
    await vulCheck(page, BINNEN);
    await wachtZin(page, 'Past binnen');
    const st = await page.evaluate(() => ({
      thr: document.querySelectorAll('#sheet #coThr').length,
      open: document.querySelector('#sheetBg').classList.contains('show'),
      onderwerp: window._coOnderwerp,
    }));
    expect(st).toEqual({ thr: 1, open: true, onderwerp: 'koop' });
  });

  test('koop schrijft nooit een maandafspraak', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => openBuy());
    await vulCheck(page, BUITEN);
    await slaapStap(page);
    await kies(page, 'Ik wil het nú');
    await kies(page, 'Toch doen');
    await wachtZin(page, 'Doorgezet');
    expect(await page.evaluate(() => (SET.coachLog || []).filter((l) => l.type === 'afspraak'))).toEqual([]);
  });
});
