// v139: de eerste ingang naar het coachgesprek buiten het coachscherm. Op Inzichten staat onder de
// bevinding een regel die coStart('lek', m) opent: een gesprek dat begint bij het cijfer zelf in
// plaats van bij een groet. Kritiek: dit gesprek mag de maandafspraak nooit raken, want
// coachThisMonthAfspraak() laat er één per maand toe en coAfspraakOpen() wist de bestaande eerst.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, MAIN } = require('./budget-fixture');

// een impuls zonder potje: geen categorie-budget, niet terugkerend, ruim boven de 25-euro-drempel.
// Zelfde veldvorm als de fixture zelf, anders struikelt categorize() bij het booten.
function metLek(extra) {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  tx.push({ id: 'lek1', date: `${CUR}-08`, amount: -220, acc: MAIN, name: 'MediaMarkt',
    desc: 'BEA, BETAALPAS MEDIAMARKT', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  p.minder_tx = JSON.stringify(tx);
  const set = JSON.parse(p.minder_set);
  delete set.budgets.shopping;          // zonder potje valt de aankoop onder noPotLeak
  if (extra) extra(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

async function ins(page, payload) {
  await open(page, payload || metLek());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#s-ins .card');
}
const wachtKeuze = (page) => page.waitForFunction(
  () => document.querySelectorAll('#coCh .cch').length > 0, null, { timeout: 15000 });
const log = (page) => page.evaluate(() => JSON.stringify(SET.coachLog || []));

test.describe('a · de ingang op Inzichten', () => {
  test('staat er als een vraag over de bevinding, met bedrag en naam', async ({ page }) => {
    await ins(page);
    const r = page.locator('#insLekVraag');
    await expect(r).toHaveCount(1);
    const t = await r.innerText();
    expect(t).toMatch(/viel op/);
    expect(t).toMatch(/wil je kijken wat je daaraan kunt doen\?/i);
    expect(t).toMatch(/€\d/);                                    // het bedrag uit coachLeak
    expect(t).not.toMatch(/coach/i);                             // geen neutrale knop naar de coach
  });

  test('staat direct onder de bevinding', async ({ page }) => {
    await ins(page);
    const volgorde = await page.evaluate(() => {
      const ids = [...document.querySelectorAll('#s-ins > *')].map((e) => e.id || '');
      return { wvo: ids.indexOf('wvoLine'), lek: ids.indexOf('insLekVraag') };
    });
    if (volgorde.wvo >= 0) expect(volgorde.lek).toBe(volgorde.wvo + 1);
    else expect(volgorde.lek).toBeGreaterThan(0);
  });

  test('geen lek betekent geen regel, en geen lege staat', async ({ page }) => {
    await ins(page, seed());                                     // fixture zonder lek-transactie
    const R = await page.evaluate((m) => coachWeekRisk(m), CUR);
    expect(R.tone).toBe('ok');
    expect(await page.locator('#insLekVraag').count()).toBe(0);
    expect(await page.locator('#s-ins').innerText()).not.toMatch(/viel op/);
    expect(await page.evaluate((m) => insLekVraag(m), CUR)).toBe('');
  });

  test('het is de enige nieuwe ingang', async ({ page }) => {
    await ins(page);
    for (const scherm of ['vooruit', 'dash', 'tx', 'maand']) {
      expect(await page.evaluate((s) => (document.querySelector('#s-' + s) || {}).innerHTML || '', scherm))
        .not.toContain("coStart('lek'");
    }
  });
});

test.describe('b · het gesprek begint bij het cijfer', () => {
  test('opent met de bevinding, niet met een groet', async ({ page }) => {
    await ins(page);
    await page.locator('#insLekVraag').click();
    await wachtKeuze(page);
    const draad = await page.locator('#coThr').innerText();
    expect(draad).toMatch(/mediamarkt/i);
    expect(draad).toMatch(/€220/);
    expect(draad).not.toMatch(/waar werk je/i);                  // coachOpening komt hier niet voor
    expect(await page.evaluate(() => window._coOnderwerp)).toBe('lek');
    expect(await page.evaluate(() => document.querySelector('#sheetBg').classList.contains('show'))).toBe(true);
  });

  test('de keuzes zijn coachRuleOptions, met het bedrag per maand', async ({ page }) => {
    await ins(page);
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const ks = await page.evaluate(() => [...document.querySelectorAll('#coCh .cch')].map((b) => b.innerText.replace(/\s*›\s*$/, '').trim()));
    const opts = await page.evaluate((m) => coachRuleOptions(m), CUR);
    for (const o of opts) expect(ks.some((k) => k.indexOf(o.label) === 0 && k.indexOf('/mnd') > 0)).toBe(true);
    expect(ks[ks.length - 1]).toBe('Nu even niet');
  });

  test('een keuze zet de regel via coachRules en sluit het gesprek', async ({ page }) => {
    await ins(page);
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const opt = (await page.evaluate((m) => coachRuleOptions(m), CUR))[0];

    await page.locator('#coCh .cch').first().click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });
    expect(await page.evaluate((k) => (SET.coachRules || {})[k], opt.key)).toBe(opt.cut);
    expect(await page.locator('#coThr').innerText()).toMatch(/terug in je plan/i)      // v179: het scherm heet Plan;
  });
});

test.describe('c · nooit een maandafspraak vanaf deze ingang', () => {
  const metAfspraak = () => metLek((s) => { s.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'oude afspraak' }]; });

  test('een keuze schrijft type tip, nooit type afspraak', async ({ page }) => {
    await ins(page, metAfspraak());
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    await page.locator('#coCh .cch').first().click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });

    const na = JSON.parse(await log(page));
    expect(na[0].type).toBe('tip');
    expect(na.filter((l) => l.type === 'afspraak').map((l) => l.text)).toEqual(['oude afspraak']);
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('oude afspraak');
  });

  test('coachLogAdd weigert een afspraak zolang dit gesprek loopt', async ({ page }) => {
    await ins(page, metAfspraak());
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const voor = await log(page);
    await page.evaluate(() => coachLogAdd({ type: 'afspraak', text: 'stiekem' }));
    expect(await log(page)).toBe(voor);
    // andere typen blijven gewoon werken
    await page.evaluate(() => coachLogAdd({ type: 'tip', text: 'mag wel' }));
    expect(JSON.parse(await log(page))[0].text).toBe('mag wel');
  });

  test('de twee stappen die eerst wissen zijn afgesloten', async ({ page }) => {
    await ins(page, metAfspraak());
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const voor = await log(page);

    await page.evaluate((m) => coAfspraakOpen(m), CUR);
    await page.evaluate(() => coShowAction({ title: 'x', afspraak: 'y' }));
    await page.waitForTimeout(400);
    expect(await log(page)).toBe(voor);                          // niets gewist, niets geschreven
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('oude afspraak');
  });

  test('coCommit legt niets vast vanuit dit onderwerp', async ({ page }) => {
    await ins(page, metAfspraak());
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const voor = await log(page);
    await page.evaluate(() => coCommit('een afspraak die hier niet hoort'));
    await page.waitForTimeout(600);
    expect(await log(page)).toBe(voor);
  });

  test('het gewone gesprek mag nog wel een afspraak vastleggen', async ({ page }) => {
    await ins(page, metLek());
    await page.evaluate(() => coStart('algemeen'));
    await page.waitForFunction(() => window._coOnderwerp === 'algemeen', null, { timeout: 15000 });
    expect(await page.evaluate(() => coMagAfspraak())).toBe(true);
    await page.evaluate(() => coachLogAdd({ type: 'afspraak', text: 'wel toegestaan' }));
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('wel toegestaan');
  });
});

test.describe('d · onderbreken', () => {
  test('de sheet dicht laat niets achter in coachRules of coachLog', async ({ page }) => {
    await ins(page);
    const regelsVoor = await page.evaluate(() => JSON.stringify(SET.coachRules || {}));
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const logVoor = await log(page);

    await page.evaluate(() => closeSheet());
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => ({
      live: !!window._coLive,
      onderwerp: window._coOnderwerp,
      open: document.querySelector('#sheetBg').classList.contains('show'),
      keuzes: document.querySelectorAll('#coCh .cch').length,
    }))).toEqual({ live: false, onderwerp: null, open: false, keuzes: 0 });
    expect(await page.evaluate(() => JSON.stringify(SET.coachRules || {}))).toBe(regelsVoor);
    expect(await log(page)).toBe(logVoor);
  });

  test('"Nu even niet" sluit zonder iets te zetten', async ({ page }) => {
    await ins(page);
    const regelsVoor = await page.evaluate(() => JSON.stringify(SET.coachRules || {}));
    await page.evaluate((m) => coStart('lek', m), CUR);
    await wachtKeuze(page);
    const logVoor = await log(page);
    await page.locator('#coCh .cch', { hasText: 'Nu even niet' }).click();
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 5000 });
    expect(await page.evaluate(() => JSON.stringify(SET.coachRules || {}))).toBe(regelsVoor);
    expect(await log(page)).toBe(logVoor);
  });
});

test.describe('e · layout', () => {
  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await ins(page);
      await page.locator('#insLekVraag').click();
      await wachtKeuze(page);
      const over = await page.evaluate(() => ({
        ins: document.querySelector('#s-ins').scrollWidth - document.querySelector('#s-ins').clientWidth,
        sheet: document.querySelector('#sheet').scrollWidth - document.querySelector('#sheet').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.ins).toBeLessThanOrEqual(1);
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
