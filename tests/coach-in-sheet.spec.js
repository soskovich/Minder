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
  await page.evaluate(() => go('act'));
  await page.waitForSelector('#s-act .coachhead');
}
const wachtKeuze = (page, txt) => page.waitForFunction(
  (t) => [...document.querySelectorAll('#coCh .cch')].some((b) => b.innerText.indexOf(t) >= 0), txt, { timeout: 15000 });
async function kies(page, txt) {
  await wachtKeuze(page, txt);
  await page.locator('#coCh .cch', { hasText: txt }).first().click();
}
const log = (page) => page.evaluate(() => JSON.stringify(SET.coachLog || []));

test.describe('a · de draad staat in de sheet', () => {
  test('coThr en coCh hangen in de sheet, niet meer in s-act', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    const waar = await page.evaluate(() => ({
      inSheet: !!document.querySelector('#sheet #coThr') && !!document.querySelector('#sheet #coCh'),
      inAct: !!document.querySelector('#s-act #coThr') || !!document.querySelector('#s-act #coCh'),
      aantal: document.querySelectorAll('#coThr').length,
      open: document.querySelector('#sheetBg').classList.contains('show'),
    }));
    expect(waar).toEqual({ inSheet: true, inAct: false, aantal: 1, open: true });
  });

  test('s-act houdt zijn kop, koopknop en spiegelkaart', async ({ page }) => {
    await coach(page);
    expect(await page.locator('#s-act .coachhead').count()).toBe(1);
    expect(await page.locator('#s-act #buyBtn').count()).toBe(1);
    expect(await page.locator('#s-act').innerText()).toMatch(/alleen als er iets te zeggen valt/i);
  });

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
      algemeen: { afspraak: true }, lek: { afspraak: false }, horizon: { afspraak: false } });
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
    await page.evaluate(() => openSet('privacy'));
    await page.evaluate(() => coStart('algemeen'));
    await wachtKeuze(page, 'Kosten koper huis');
    expect(await page.evaluate(() => window._setSheet)).toBeNull();
    expect(await page.locator('#sheet').innerText()).not.toContain('Waar staat mijn data');
  });
});

test.describe('c · een volledig gesprek tot een afspraak', () => {
  test('legt precies één afspraak vast en sluit het gesprek', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    await kies(page, 'Kosten koper huis');
    await wachtKeuze(page, 'Budget & potjes');            // het onderwerpenmenu
    const voor = JSON.parse(await log(page)).filter((l) => l.type === 'afspraak').length;

    // de als-dan-keuze is het einde van de potjes-tak; hier ontstaat de afspraak
    await page.evaluate(() => coAfspraak(curMonth));
    await kies(page, 'slaap ik er een nacht over');
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });

    const na = JSON.parse(await log(page)).filter((l) => l.type === 'afspraak');
    expect(na.length).toBe(voor + 1);
    expect(na[0].text).toMatch(/slaap ik er een nacht over/);
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
    expect(await page.evaluate(() => !!window._coPark)).toBe(false);
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

test.describe('e · zelf tekst invoeren', () => {
  test('het invoerscherm overschrijft de draad niet, hij hangt er even uit', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    const bubbels = await page.evaluate(() => document.querySelectorAll('#coThr .cbub').length);

    await page.evaluate(() => coTextSheet('Jouw als-dan', 'als ... dan ...', (v) => { window._testV = v; }));
    // draad staat geparkeerd, het invoerveld heeft de sheet
    expect(await page.evaluate(() => ({
      park: Array.isArray(window._coPark),
      inSheet: !!document.querySelector('#sheet #coThr'),
      veld: !!document.getElementById('coTxt'),
      live: !!window._coLive,
    }))).toEqual({ park: true, inSheet: false, veld: true, live: true });

    await page.fill('#coTxt', 'als ik twijfel, dan wacht ik een dag');
    await page.locator('#sheet button.btn').click();

    // dezelfde draad terug, met dezelfde bubbels erin, en de sheet blijft open
    expect(await page.evaluate(() => ({
      v: window._testV,
      park: window._coPark,
      inSheet: !!document.querySelector('#sheet #coThr'),
      bubbels: document.querySelectorAll('#coThr .cbub').length,
      open: document.querySelector('#sheetBg').classList.contains('show'),
      live: !!window._coLive,
    }))).toEqual({
      v: 'als ik twijfel, dan wacht ik een dag', park: null, inSheet: true, bubbels, open: true, live: true,
    });
  });

  test('_coT wijst nog naar de draad in de sheet, dus het gesprek kan verder', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    await page.evaluate(() => coTextSheet('Test', 'ph', () => {}));
    await page.locator('#sheet button.btn').click();
    await page.evaluate(() => coBub('me', 'nog een bubbel'));
    expect(await page.locator('#sheet #coThr').innerText()).toContain('nog een bubbel');
  });

  test('het invoerscherm wegtikken breekt het gesprek af zonder iets vast te leggen', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    const voor = await log(page);
    await page.evaluate(() => coTextSheet('Jouw als-dan', 'als ... dan ...', (v) => coCommit(v || 'eigen afspraak')));
    await page.evaluate(() => closeSheet());
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => ({ live: !!window._coLive, park: window._coPark, cb: window._coTextCb }))).toEqual({ live: false, park: null, cb: null });
    expect(await log(page)).toBe(voor);
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
