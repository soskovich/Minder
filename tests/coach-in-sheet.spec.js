// v196: de coachpagina (s-act) is opgeheven. Het gesprek is geen bestemming meer maar wordt
// vanaf vier plekken opgeroepen, dus openen gaat via coStart() in plaats van go('act').
// v138: het coachgesprek draaide in een container binnen s-act en was daarmee aan dat scherm
// vastgeklonken. Het draait nu in de sheet, met coStart(onderwerp, m) als enige ingang, zodat het
// later ook vanaf Inzichten, de vooruitblik en het maandscherm op te roepen is. Refactor: het
// gesprek zelf gedraagt zich exact hetzelfde, alleen de plek verandert.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}
const metDoel = (extra) => tweak((s) => {
  s.goals = [{ id: 'gA', naam: 'Kosten koper huis', doel: 12000, gespaard: 1500, allocMode: 'fixed', perMaand: 250 }];
  s.planOrder = ['gA', 'noodfonds'];
  if (extra) extra(s);
});

async function coach(page, payload) {
  await open(page, payload || metDoel());
  await page.evaluate(() => coStart('algemeen'));
  await page.waitForSelector('#coThr');
}
const wachtKeuze = (page, txt) => page.waitForFunction(
  (t) => [...document.querySelectorAll('#coCh .cch')].some((b) => b.innerText.indexOf(t) >= 0), txt, { timeout: 15000 });
async function kies(page, txt) {
  await wachtKeuze(page, txt);
  await page.locator('#coCh .cch', { hasText: txt }).first().click();
}
const log = (page) => page.evaluate(() => JSON.stringify(SET.coachLog || []));

test.describe('a · de draad staat in de sheet', () => {
  test('coThr en coCh hangen in de sheet', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    const waar = await page.evaluate(() => ({
      inSheet: !!document.querySelector('#sheet #coThr') && !!document.querySelector('#sheet #coCh'),
      inAct: false,   // v196: s-act bestaat niet meer, dus er valt niets meer in te hangen
      aantal: document.querySelectorAll('#coThr').length,
      open: document.querySelector('#sheetBg').classList.contains('show'),
    }));
    expect(waar).toEqual({ inSheet: true, inAct: false, aantal: 1, open: true });
  });

  /* v196: hier stond dat s-act zijn kop, koopknop en spiegelkaart hield. Dat scherm is opgeheven:
     de coach is geen bestemming meer maar een gesprek dat je vanaf vier plekken oproept. Wat deze
     test bewaakte - dat het gesprek in de sheet leeft en het scherm eronder niet aantast - heeft
     geen scherm meer om niet aan te tasten; de eerste test hierboven dekt de sheet zelf. */

  test('een render() opent de sheet niet vanzelf', async ({ page }) => {
    await open(page, metDoel());
    await page.evaluate(() => { go('dash'); render(); render(); });
    expect(await page.evaluate(() => document.querySelector('#sheetBg').classList.contains('show'))).toBe(false);
    expect(await page.evaluate(() => !!window._coLive)).toBe(false);
  });
});

test.describe('b · coStart is de enige ingang', () => {
  test('een onbekend onderwerp valt terug op het gewone gesprek', async ({ page }) => {
    await open(page, metDoel());
    // v140: elk onderwerp verklaart of het een maandafspraak mag vastleggen
    expect(await page.evaluate(() => CO_ONDERWERPEN)).toEqual({
      algemeen: { afspraak: true }, lek: { afspraak: false },
      horizon: { afspraak: false }, maand: { afspraak: true } });   // v141: 'maand' erbij
    await page.evaluate(() => coStart('bestaatniet'));
    await wachtKeuze(page, 'Kosten koper huis');
    expect(await page.locator('#coThr').innerText()).toMatch(/waar werk je/i);
  });

  test('twee keer starten rendert niet door elkaar', async ({ page }) => {
    await open(page, metDoel());
    await page.evaluate(() => coStart('algemeen'));
    await wachtKeuze(page, 'Kosten koper huis');
    const gen1 = await page.evaluate(() => _coGen);

    await page.evaluate(() => coStart('algemeen'));
    await wachtKeuze(page, 'Kosten koper huis');
    expect(await page.evaluate(() => _coGen)).toBeGreaterThan(gen1);

    // precies één draad, en de bubbels van het eerste gesprek staan er niet dubbel in
    const n = await page.evaluate(() => ({
      draden: document.querySelectorAll('#coThr').length,
      keuzes: document.querySelectorAll('#coCh .cch').length,
      dubbel: document.querySelectorAll('#coThr .cbub.co').length,
    }));
    expect(n.draden).toBe(1);
    expect(n.keuzes).toBeGreaterThan(0);
    expect(n.dubbel).toBeLessThan(10);
  });

  test('de sheet is van het gesprek: een eerder geopende instellingen-sheet telt niet meer mee', async ({ page }) => {
    await open(page, metDoel());
    await page.evaluate(() => openInkomenSheet());   // v185: de enige sheet-ingang in Instellingen
    await page.evaluate(() => coStart('algemeen'));
    await wachtKeuze(page, 'Kosten koper huis');
    expect(await page.evaluate(() => window._setSheet)).toBeNull();
    expect(await page.locator('#sheet').innerText()).not.toContain('Inkomen & rekeningen');
  });
});

test.describe('c · een volledig gesprek tot een afspraak', () => {
  test('legt precies één afspraak vast en sluit het gesprek', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    await kies(page, 'Kosten koper huis');
    await wachtKeuze(page, 'Budget & potjes');            // het onderwerpenmenu
    const voor = JSON.parse(await log(page)).filter((l) => l.type === 'afspraak').length;

    /* v200: hier stond coAfspraak(), de als-dan-stap. Die vorm is vervallen omdat zo'n afspraak per
       definitie geen categorie kreeg en dus altijd in de zelfrapportage-tak van de afspraaklus
       viel. coCommit() is nog steeds de enige plek waar een afspraak ontstaat; de test toetst
       onveranderd dat er precies een bijkomt en dat het gesprek daarna sluit. */
    await page.evaluate(() => coCommit('ik houd uit eten onder 150 euro'));
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });

    const na = JSON.parse(await log(page)).filter((l) => l.type === 'afspraak');
    expect(na.length).toBe(voor + 1);
    expect(na[0].text).toMatch(/uit eten onder 150/);
    expect(await page.evaluate(() => document.querySelectorAll('#coCh .cch').length)).toBe(0);
  });
});

test.describe('d · halverwege afbreken', () => {
  test('de sheet dicht doet wat coEnd() doet en legt niets vast', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    const voor = await log(page);
    const gen = await page.evaluate(() => _coGen);

    await page.evaluate(() => closeSheet());
    expect(await page.evaluate(() => ({
      live: !!window._coLive,
      open: document.querySelector('#sheetBg').classList.contains('show'),
      keuzes: document.querySelectorAll('#coCh .cch').length,
    }))).toEqual({ live: false, open: false, keuzes: 0 });

    // _coGen is opgehoogd, dus een nog lopende stap schrijft niets meer
    expect(await page.evaluate(() => _coGen)).toBeGreaterThan(gen);
    await page.waitForTimeout(1200);
    expect(await log(page)).toBe(voor);
    // de draad zelf blijft staan, precies zoals coEnd() hem laat staan; de volgende coStart
    // bouwt de sheet-schil opnieuw op, dus hij is nooit zichtbaar naast een nieuw gesprek
    // v200: _coPark hoorde bij coTextSheet() en bestaat niet meer
    expect(await page.evaluate(() => '_coPark' in window)).toBe(false);
  });

  test('op de achtergrondtik werkt het net zo', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    const voor = await log(page);
    await page.locator('#sheetBg').click({ position: { x: 5, y: 5 } });
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 5000 });
    expect(await log(page)).toBe(voor);
  });

  test('afbreken raakt een bestaande afspraak van deze maand niet aan', async ({ page }) => {
    await coach(page, metDoel((s) => { s.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'oude afspraak' }]; }));
    await wachtKeuze(page, 'Kosten koper huis');
    await page.evaluate(() => closeSheet());
    await page.waitForTimeout(600);
    const na = JSON.parse(await log(page));
    expect(na.filter((l) => l.type === 'afspraak').map((l) => l.text)).toEqual(['oude afspraak']);
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('oude afspraak');
  });
});

/* v200: hier stond blok e, over het vrijetekst-invoerscherm in het gesprek. coTextSheet(),
   coTextSave(), coParkeerDraad() en coHerstelDraad() zijn vervallen met de als-dan-vorm die ze als
   enige aanriep. Wat die tests bewaakten was de v138-truc: coTextSheet gebruikte DEZELFDE sheet als
   de gespreksdraad, dus de twee nodes moesten er even uit en daarna terug, als dezelfde elementen,
   anders raakten _coT en _coC hun doel kwijt. Die les staat vastgelegd in CLAUDE.md, want hij geldt
   opnieuw zodra er ergens een tekstinvoer in een gesprek komt.
   Vrije tekst bij een afspraak kan nog wel: coShowAction() heeft een eigen invoerveld binnen de
   draad, dus daar hoeft niets geparkeerd te worden. */
test.describe('e · vrije tekst loopt nu via coShowAction', () => {
  test('het invoerveld staat in de draad zelf, dus er valt niets te parkeren', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    const r = await page.evaluate(() => ({
      textSheet: typeof window.coTextSheet,
      textSave: typeof window.coTextSave,
      parkeer: typeof window.coParkeerDraad,
      herstel: typeof window.coHerstelDraad,
      alsDan: typeof window.coAfspraak,
      showAction: typeof window.coShowAction,
      // coShowAction hangt zijn invoer in #coCh, binnen de draad
      inDraad: /_coC\.appendChild\(inp\)/.test(String(window.coShowAction)),
    }));
    expect(r.textSheet).toBe('undefined');
    expect(r.textSave).toBe('undefined');
    expect(r.parkeer).toBe('undefined');
    expect(r.herstel).toBe('undefined');
    expect(r.alsDan).toBe('undefined');
    expect(r.showAction).toBe('function');
    expect(r.inDraad).toBe(true);
  });
});

test.describe('f · layout', () => {
  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await coach(page);
      await wachtKeuze(page, 'Kosten koper huis');
      const over = await page.evaluate(() => ({
        sheet: document.querySelector('#sheet').scrollWidth - document.querySelector('#sheet').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
