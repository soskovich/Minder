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
// dekking niet laten zakken. Voor deze test moet hij dichterbij staan.
// v226: over 2 maanden en niet over 3. Vanaf MAAND_DREMPEL.dekkingMarge maanden vraagt een gat
// aandacht in plaats van een beslissing, en dan staat de dekkingsrij niet meer op 'tekort'. Deze
// tests gaan over de samenstelling van de drie voorwaarden, niet over dat moment, dus het
// knelmoment ligt hier binnen de marge.
// v323: sinds v323 is alleen een post in de LOPENDE maand een beslissing; elke latere post met een gat is aandacht.
// Deze tests gaan over de samenstelling van de drie voorwaarden, dus de post valt deze maand.
const BINNENKORT = ym(new Date(now.getFullYear(), now.getMonth(), 1));

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
    /* v305: de ondergrens is sinds v305 een KEUZE en heeft geen default meer, dus de fixture kiest
       hem hier. Deze spec is geschreven toen drie maanden een vaste grens was; dat getal staat nu
       waar het thuishoort, in de gegevens van de gebruiker. */
    bufferNorm: 3,
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
/* v340: maandBeleggenRegel() is vervallen. De uitkomst staat nu in de tegel [data-tegel=beleggen] op
   Grip (groen 'klaar' of grijs 'wacht' met 'op je <blokkade>'), en de opbouw met waarde en drempel in
   de sheet openBeleggenVoorwaarden(). `tegel` leest de gerenderde tegel; '' als hij er niet staat. */
const tegel = async (page) => {
  await page.evaluate(() => go('maand'));
  return page.evaluate(() => {
    const t = document.querySelector('#s-maand [data-tegel="beleggen"]');
    return t ? { kleur: t.dataset.kleur, waarde: t.querySelector('.kt-val').textContent.trim(),
      maat: t.querySelector('.kt-maat').textContent.trim(), tekst: t.textContent.replace(/\s+/g, ' ').trim() } : null;
  });
};
const tekst = async (page) => { const t = await tegel(page); return t ? t.tekst : ''; };
const sheetTekst = async (page) => { await page.evaluate(() => openBeleggenVoorwaarden()); return page.locator('#sheet').innerText(); };
const statusVan = (page, key) => page.evaluate((k) => {
  const r = maandRegels().find((x) => x.key === k); return r ? r.status : null;
}, key);

test.describe('a · de samenstelling', () => {
  /* v305: DEZE TEST PINDE DE OUDE GRENS. Hij eiste `MAAND_DREMPEL.bufferKritiek === 3` en die naam
     letterlijk in de bron van de drempel; sinds v305 is de buffernorm een eigen keuze (besluit 4) en
     bestaat die constante niet meer. Hij is herschreven naar wat hij moet vasthouden en daarbij
     STERKER gemaakt: de constante mag ook niet TERUGKOMEN, en de buffer-drempel moet uit een functie
     komen in plaats van uit een getal in deze laag. Dekking en doel houden hun MAAND_DREMPEL. */
  test('elke drempel komt uit een bron en niet uit een getal in deze laag', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => MAAND_DREMPEL);
    expect(d.bufferKritiek, 'de vaste 3 is weg en komt niet terug').toBe(undefined);
    expect(d.dekkingOk).toBe(100);
    const src = await page.evaluate(() => BELEGGEN_VOORWAARDEN.map((v) => v.drempel.toString()).join(' '));
    expect(src, 'de buffer leest zijn eigen drempel').toContain('beleggenDrempel()');
    expect(src).not.toContain('bufferKritiek');
    expect(src).toContain('MAAND_DREMPEL.dekkingOk');
    expect(src).toContain('MAAND_DREMPEL.doelOk');
    const bron = await page.evaluate(() => beleggenDrempel.toString() + ' ' + bufferNorm.toString());
    expect(bron, 'beleggenDrempel() valt terug op de norm en niet op een eigen getal').toContain('bufferNorm()');
    expect(bron, 'en die norm heeft geen default: zonder keuze is er geen grens (v305)').toContain('null');
    const zonder = await page.evaluate(() => { delete SET.bufferNorm; return beleggenDrempel(); });
    expect(zonder, 'dus ook geen drempel om tegen te toetsen').toBe(null);
  });

  test('beleggenKlaar rekent niets: hij leest de rijen van maandRegels', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => beleggenKlaar.toString());
    for (const fn of ['dekking(', 'bufferMaanden(', 'doelTempo(', 'maandRegels(']) {
      expect(src).not.toContain(fn);
    }
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => { beleggenKlaar(maandRegels()); gripTegels(maandRegels(), maandRegels()); });
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
    const t = await tegel(page);
    expect(t.kleur).toBe('groen');
    expect(t.waarde).toBe('klaar');
    expect(t.maat).toBe('alle drie gehaald');
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
    const t = await tegel(page);
    expect(t.kleur, 'niet gehaald is geen fout (v314): grijs').toBe('grijs');
    expect(t.waarde).toBe('wacht');
    expect(t.maat).toBe('op je buffer');
    /* v340: de drempel van 3 maanden staat niet meer in een zin op Grip maar in de sheet, naast de waarde. */
    expect(await sheetTekst(page)).toMatch(/tegen 3 maanden/);
  });

  /* v187: de regel zweeg zodra de blokkerende rij het al zei.
     v340: dat zwijgen is vervallen, want de regel is een tegel en die staat er altijd zolang beleggen
     zichtbaar is; hij noemt de blokkade in een woord en herhaalt geen cijfer. Wat blijft: dezelfde
     blokkade als beleggenKlaar() aanwijst. */
  test('dekking blokkeert: de tegel noemt de reserveringen', async ({ page }) => {
    await boot(page, seed({ resSaldo: 10 }));
    expect(await statusVan(page, 'dekking')).toBe('tekort');
    const b = await B(page);
    expect(b.blokkade.key).toBe('dekking');
    const t = await tegel(page);
    expect([t.kleur, t.waarde, t.maat]).toEqual(['grijs', 'wacht', 'op je reserveringen']);
  });

  test('het aankoopdoel blokkeert: idem, de rij zegt het al', async ({ page }) => {
    await boot(page, seed({ perMaand: 10, set: { savingAmount: 10 } }));
    expect(await statusVan(page, 'doel')).toBe('tekort');
    const b = await B(page);
    expect(b.blokkade.key).toBe('doel');
    const t = await tegel(page);
    expect([t.kleur, t.waarde, t.maat]).toEqual(['grijs', 'wacht', 'op Vakantie']);
  });

  test('precies twee niet gehaald: alleen de eerste in de volgorde wordt genoemd', async ({ page }) => {
    // buffer staat goed, dekking en doel niet
    await boot(page, seed({ resSaldo: 10, perMaand: 10, set: { savingAmount: 10 } }));
    const b = await B(page);
    const nietGehaald = b.voorwaarden.filter((v) => !v.gehaald).map((v) => v.key);
    expect(nietGehaald).toEqual(['dekking', 'doel']);             // precies twee
    expect(b.blokkade.key).toBe('dekking');                       // maar alleen de eerste telt
    expect((await tegel(page)).maat).toBe('op je reserveringen'); // en de tegel noemt alleen die
  });

  test('alle drie niet gehaald: nog steeds één blokkade', async ({ page }) => {
    await boot(page, seed({ spaar: 900, resSaldo: 10, perMaand: 10, set: { savingAmount: 10 } }));
    const b = await B(page);
    expect(b.voorwaarden.filter((v) => !v.gehaald).map((v) => v.key)).toEqual(['buffer', 'dekking', 'doel']);
    expect(b.blokkade.key).toBe('buffer');
    const t = await tegel(page);
    expect(t.maat).toBe('op je buffer');                          // één ding tegelijk
    expect(t.tekst).not.toMatch(/reserveringen|Vakantie/);
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
    geenUitspraak(await tekst(page));
    expect((await tegel(page)).waarde).not.toBe('klaar');
    /* v340: "Niet te beoordelen" staat niet meer op Grip maar in de sheet achter de tegel. */
    expect(await sheetTekst(page)).toMatch(/niet te beoordelen/i);
  });

  test('geen doel met streefdatum: geen uitspraak', async ({ page }) => {
    await boot(page, seed({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, perMaand: 400 }] }));
    expect(await page.evaluate(() => maandRegels().some((r) => r.key === 'doel'))).toBe(false);
    const b = await B(page);
    expect(b.volledig).toBe(false);
    geenUitspraak(await tekst(page));
  });

  test('geen verplichtingen ingevoerd: geen uitspraak', async ({ page }) => {
    await boot(page, seed({ reserveringen: [] }));
    const b = await B(page);
    expect(b.volledig).toBe(false);
    geenUitspraak(await tekst(page));
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
    expect(await tegel(page)).toBe(null);
    expect(await page.locator('#s-maand').innerText()).not.toMatch(/beleggen/i);
  });

  test('een vermogensinstelling alleen is genoeg om hem te tonen', async ({ page }) => {
    await boot(page, seed({ goals: [], assets: [{ id: 'a1', naam: 'Index', waarde: 5000, grow: true, rend: 6 }] }));
    expect(await page.evaluate(() => beleggenZichtbaar())).toBe(true);
    expect(await tegel(page)).not.toBe(null);
  });

  /* v340: de volgorde "onder de regels, boven de coach-ingang" is vervallen, want die kaarten bestaan
     niet meer. Wat blijft: beleggen is een tegel tussen de andere tegels, en er staat geen aparte kaart
     "Voorwaarden voor beleggen" meer op Grip. */
  test('beleggen is een tegel in het raster, geen eigen kaart', async ({ page }) => {
    await boot(page);
    await tegel(page);
    expect(await page.locator('#gripTegels [data-tegel="beleggen"]').count()).toBe(1);
    expect(await page.locator('#s-maand').innerText()).not.toMatch(/voorwaarden voor beleggen/i);
  });

  test('de regel herhaalt de cijfers van de regels niet', async ({ page }) => {
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
    /* v314: ELKE RIJ STAAT IN EEN EENHEID. De dekking-rij zette `€1.200` naast `tegen 100%`, een euro
       tegen een percentage in dezelfde kolom, en dan is er niets te vergelijken zonder zelf te gaan
       rekenen. 100% van de dekking IS je potstand tegen wat er nu in hoort te staan, dus de drempel
       staat nu in euro's en leest dat getal uit de rij. De assertie bindt op de BRON van dat getal en
       niet op een bedrag uit de fixture. */
    const D = await page.evaluate(() => {
      const v = beleggenKlaar(maandRegels()).voorwaarden.find((x) => x.key === 'dekking');
      return { waarde: v.waarde, drempel: v.drempel, stand: dekking(12).benodigdeStand };
    });
    expect(D.drempel).toBe('€' + D.stand.toLocaleString('nl-NL'));
    expect(D.waarde.startsWith('€')).toBe(true);
    expect(sheet).toContain('tegen ' + D.drempel);
    expect(sheet).not.toMatch(/tegen 100%/);
    expect(await page.locator('#sheet button').count()).toBe(0);   // niets dat iets in gang zet
  });

  test('kijken in de sheet verandert niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate(() => openBeleggenVoorwaarden());
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });
});

