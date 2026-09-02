// v154: de drie voorwaarden voor beleggen als één regel op het maandscherm. Buffer >= 3 maanden,
// dekking >= 100%, aankoopdoel zonder tekort. Alle drie komen uit de rijen die maandRegels() al
// opleverde; er wordt niets opnieuw afgeleid. Zwijgen zodra een van de drie niet te beoordelen is:
// een verkeerd groen licht kost geld dat binnen een jaar nodig is.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';
const OVER = ym(new Date(now.getFullYear() + 1, now.getMonth(), 1));
// een jaarpost die pas over 12 maanden valt heeft nog geen opbouw nodig (v131), dus die kan de
// dekking niet laten zakken. Voor deze test moet hij dichterbij staan: over 3 maanden.
const BINNENKORT = ym(new Date(now.getFullYear(), now.getMonth() + 3, 1));

// Eén basis, en per test schuiven we precies één knop: het spaarsaldo (buffer), de stand van de
// reserveringenpot (dekking) of de inleg op het doel (aankoopdoel).
function seed(o = {}) {
  const spaar = o.spaar != null ? o.spaar : 9000;      // ruim boven 3 maanden essentiële last
  const resSaldo = o.resSaldo != null ? o.resSaldo : 1200;
  const perMaand = o.perMaand != null ? o.perMaand : 400;
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('s' + m, SPAAR, m, '26', 200, 'Spaarpot', 'NAAR SPAREN');
  }
  add('r1', RES, M1, '10', 50, 'Reserveringen', 'NAAR RESERVERINGEN');
  const set = {
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 2000, [SPAAR]: spaar, [RES]: resSaldo },
    budgets: { boodschappen: 500, huur: 900 },
    savingMode: 'amount', savingAmount: 400,
    savingsAcc: { [SPAAR]: true, [RES]: false },
    goals: o.goals !== undefined ? o.goals
      : [{ id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, perMaand, streefdatum: OVER }],
    resAcc: o.resAcc !== undefined ? o.resAcc : RES,
    reserveringen: o.reserveringen !== undefined ? o.reserveringen
      : [{ id: 'r1', naam: 'Tandarts', bedrag: 300, vervalmaand: BINNENKORT, intervalM: 12 }],
  };
  if (o.assets) set.assets = o.assets;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign(set, o.set || {})),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof beleggenKlaar === 'function');
}
const B = (page) => page.evaluate(() => beleggenKlaar(maandRegels()));
const regel = (page) => page.evaluate(() => maandBeleggenRegel(maandRegels()));
const tekst = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = maandBeleggenRegel(maandRegels());
  return d.textContent.replace(/\s+/g, ' ').trim();
});
const statusVan = (page, key) => page.evaluate((k) => {
  const r = maandRegels().find((x) => x.key === k); return r ? r.status : null;
}, key);

test.describe('a · de samenstelling', () => {
  test('de drempels komen uit MAAND_DREMPEL, niet uit een eigen constante', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => MAAND_DREMPEL);
    expect(d.bufferKritiek).toBe(3);
    expect(d.dekkingOk).toBe(100);
    const src = await page.evaluate(() => BELEGGEN_VOORWAARDEN.map((v) => v.drempel.toString()).join(' '));
    expect(src).toContain('MAAND_DREMPEL.bufferKritiek');
    expect(src).toContain('MAAND_DREMPEL.dekkingOk');
    expect(src).toContain('MAAND_DREMPEL.doelOk');
  });

  test('beleggenKlaar rekent niets: hij leest de rijen van maandRegels', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => beleggenKlaar.toString());
    for (const fn of ['dekking(', 'bufferMaanden(', 'doelTempo(', 'maandRegels(']) {
      expect(src).not.toContain(fn);
    }
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => { beleggenKlaar(maandRegels()); maandBeleggenRegel(maandRegels()); });
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });

  test('alle drie gehaald', async ({ page }) => {
    await boot(page);
    const b = await B(page);
    expect(b.volledig).toBe(true);
    expect(b.voorwaarden.map((v) => v.key)).toEqual(['buffer', 'dekking', 'doel']);
    expect(b.voorwaarden.every((v) => v.gehaald)).toBe(true);
    expect(b.klaar).toBe(true);
    expect(b.blokkade).toBe(null);
    expect(await regel(page)).toContain('Je drie voorwaarden voor beleggen zijn alle drie gehaald.');
  });

  test('buffer telt ook als hij tussen drie maanden en je richtbedrag staat', async ({ page }) => {
    await boot(page, seed({ spaar: 4200 }));
    expect(await statusVan(page, 'buffer')).toBe('let op');     // onder je richt, boven de drie
    const b = await B(page);
    expect(b.voorwaarden.find((v) => v.key === 'buffer').gehaald).toBe(true);
  });
});

test.describe('b · elk van de drie als blokkade', () => {
  test('buffer blokkeert', async ({ page }) => {
    await boot(page, seed({ spaar: 900 }));
    expect(await statusVan(page, 'buffer')).toBe('tekort');
    const b = await B(page);
    expect(b.klaar).toBe(false);
    expect(b.blokkade.key).toBe('buffer');
    const h = await regel(page);
    expect(h).toContain('Nog niet aan je voorwaarden voor beleggen: buffer');
    expect(h).toContain('tegen 3 maanden');
  });

  test('dekking blokkeert', async ({ page }) => {
    await boot(page, seed({ resSaldo: 10 }));
    expect(await statusVan(page, 'dekking')).toBe('tekort');
    const b = await B(page);
    expect(b.blokkade.key).toBe('dekking');
    expect(await regel(page)).toContain('tegen 100%');
  });

  test('het aankoopdoel blokkeert', async ({ page }) => {
    await boot(page, seed({ perMaand: 10, set: { savingAmount: 10 } }));
    expect(await statusVan(page, 'doel')).toBe('tekort');
    const b = await B(page);
    expect(b.blokkade.key).toBe('doel');
    const h = await regel(page);
    expect(h).toContain('Vakantie');
    expect(h).toContain('tekort');
  });

  test('precies twee niet gehaald: alleen de eerste in de volgorde wordt genoemd', async ({ page }) => {
    // buffer staat goed, dekking en doel niet
    await boot(page, seed({ resSaldo: 10, perMaand: 10, set: { savingAmount: 10 } }));
    const b = await B(page);
    const nietGehaald = b.voorwaarden.filter((v) => !v.gehaald).map((v) => v.key);
    expect(nietGehaald).toEqual(['dekking', 'doel']);             // precies twee
    expect(b.blokkade.key).toBe('dekking');                       // maar alleen de eerste telt
    const t = await tekst(page);
    expect(t).toContain('dekking reserveringen');
    expect(t).not.toContain('Vakantie');
    expect((t.match(/tegen/g) || []).length).toBe(1);             // één ding tegelijk
  });

  test('alle drie niet gehaald: nog steeds één blokkade', async ({ page }) => {
    await boot(page, seed({ spaar: 900, resSaldo: 10, perMaand: 10, set: { savingAmount: 10 } }));
    const b = await B(page);
    expect(b.voorwaarden.filter((v) => !v.gehaald).map((v) => v.key)).toEqual(['buffer', 'dekking', 'doel']);
    expect(b.blokkade.key).toBe('buffer');
    const h = await regel(page);
    expect(h).toContain('buffer');
    expect(h).not.toContain('dekking reserveringen');
    expect((h.match(/tegen/g) || []).length).toBe(1);             // één ding tegelijk
  });
});

test.describe('c · zwijgen bij onvolledigheid', () => {
  const geenUitspraak = (h) => {
    expect(h).not.toMatch(/alle drie gehaald/i);
    expect(h).not.toMatch(/nog niet aan je voorwaarden/i);
    expect(h).not.toMatch(/bijna|waarschijnlijk|vermoedelijk|ongeveer/i);
  };

  test('geen reserveringenrekening: geen uitspraak', async ({ page }) => {
    await boot(page, seed({ resAcc: '' }));
    const b = await B(page);
    expect(b.volledig).toBe(false);
    expect(b.klaar).toBe(false);
    geenUitspraak(await regel(page));
    expect(await regel(page)).toContain('Niet te beoordelen');
  });

  test('geen doel met streefdatum: geen uitspraak', async ({ page }) => {
    await boot(page, seed({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, perMaand: 400 }] }));
    expect(await page.evaluate(() => maandRegels().some((r) => r.key === 'doel'))).toBe(false);
    const b = await B(page);
    expect(b.volledig).toBe(false);
    geenUitspraak(await regel(page));
  });

  test('geen verplichtingen ingevoerd: geen uitspraak', async ({ page }) => {
    await boot(page, seed({ reserveringen: [] }));
    const b = await B(page);
    expect(b.volledig).toBe(false);
    geenUitspraak(await regel(page));
  });

  test('onvolledig kan nooit klaar worden, ook niet als de rest goed staat', async ({ page }) => {
    await boot(page, seed({ resAcc: '' }));
    const b = await B(page);
    const rest = b.voorwaarden.filter((v) => !v.ontbreekt);
    expect(rest.every((v) => v.gehaald)).toBe(true);   // buffer en doel staan goed
    expect(b.klaar).toBe(false);                       // en tóch geen groen licht
  });
});

test.describe('d · zichtbaarheid en plek', () => {
  test('zonder spaardoel en zonder vermogen staat de regel er niet', async ({ page }) => {
    await boot(page, seed({ goals: [] }));
    expect(await page.evaluate(() => beleggenZichtbaar())).toBe(false);
    expect(await regel(page)).toBe('');
    await page.evaluate(() => go('maand'));
    expect(await page.locator('#s-maand').innerText()).not.toMatch(/voorwaarden voor beleggen/i);
  });

  test('een vermogensinstelling alleen is genoeg om hem te tonen', async ({ page }) => {
    await boot(page, seed({ goals: [], assets: [{ id: 'a1', naam: 'Index', waarde: 5000, grow: true, rend: 6 }] }));
    expect(await page.evaluate(() => beleggenZichtbaar())).toBe(true);
    expect(await regel(page)).not.toBe('');
  });

  test('de regel staat onder de vijf regels en boven de coach-ingang', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    const t = await page.locator('#s-maand').innerText();
    const iRegels = Math.max(t.indexOf('Buffer in maanden'), t.indexOf('Dekking reserveringen'));
    const iBeleg = t.toLowerCase().indexOf('voorwaarden voor beleggen');
    const iCoach = Math.max(t.indexOf('Zullen we dat doorlopen'), t.indexOf('Wil je toch iets doornemen'),
      t.indexOf('Je afspraak deze maand'));
    expect(iBeleg).toBeGreaterThan(iRegels);
    if (iCoach > -1) expect(iBeleg).toBeLessThan(iCoach);
  });

  test('de regel herhaalt de cijfers van de vijf regels niet', async ({ page }) => {
    await boot(page);
    const t = await tekst(page);                       // de gerenderde tekst, niet de HTML
    expect(t).not.toMatch(/%/);                        // geen dekkingsgraad
    expect(t).not.toMatch(/je richt staat op/);        // geen buffer-eenheid
  });
});

test.describe('e · geen advies', () => {
  test('bij groen geen aanmoediging, geen bedrag, geen product', async ({ page }) => {
    await boot(page);
    const t = await tekst(page);                       // de gerenderde tekst, niet de HTML
    expect(t).not.toMatch(/je kunt|begin|start|inleg|beleggingsfonds|etf|rendement|%/i);
    expect(t).not.toMatch(/!/);
  });

  test('de sheet toont de opbouw met waarde en drempel, zonder actieknop', async ({ page }) => {
    await boot(page, seed({ spaar: 900 }));
    await page.evaluate(() => openBeleggenVoorwaarden());
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Voorwaarden voor beleggen');
    expect(sheet).toContain('buffer');
    expect(sheet).toContain('dekking reserveringen');
    expect(sheet).toMatch(/tegen 3 maanden/);
    expect(sheet).toMatch(/tegen 100%/);
    expect(await page.locator('#sheet button').count()).toBe(0);   // niets dat iets in gang zet
  });

  test('kijken in de sheet verandert niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => openBeleggenVoorwaarden());
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });
});

