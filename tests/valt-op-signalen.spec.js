// v235: de Valt op-widget deed twee dingen tegelijk. Hij constateerde dat een categorie boven zijn
// potje zat, en bood in dezelfde kaart de uitweg aan. Alleen dat tweede is Grip-werk.
// Eén detectie (valtOpSignals), twee weergaven: Inzichten bepaalt de lijst, Grip leest hem en hangt
// er de historie en de handelingen aan. Deze spec legt de invarianten vast die daarbij horen:
//   - rangorde op euro's boven het potje, bij gelijk bedrag op categorienaam
//   - een drempel van DREMPEL_EUR eronder, zodat een miniatuur-overschrijding geen plek inneemt
//   - maximaal twee signalen, en wat erbuiten valt wordt niet getoond maar wél vastgelegd
//   - een signaal verdwijnt zodra er een actie op is vastgelegd, tot einde maand
//   - transacties bekijken telt niet als actie: kijken is geen keuze
// De vastlegging is de reden dat dit bestaat: het potje verhogen laat een signaal verdwijnen zonder
// dat je minder uitgeeft, en zonder telling is dat de makkelijkste knop.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';

// De omschrijving stuurt de categorie (de echte keyword-regels), de naam stuurt de winkel.
const D = {
  boodschappen: 'BEA, BETAALPAS ALBERT HEIJN',
  uiteten: 'BEA, BETAALPAS RESTAURANT',
  vervoer: 'BEA, BETAALPAS SHELL TANKSTATION',
  shopping: 'ECOM ZALANDO PAYMENTS',
  sport: 'ECOM BASIC FIT BETAALPAS',
  zorg: 'BEA, BETAALPAS APOTHEEK CENTRUM',
};

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of [M2, M1, CUR]) add('inc-' + m, m, '05', 3000, 'Werkgever', 'SALARIS LOON');
  (o.tx || []).forEach((t, i) => add('t' + i, t.m || CUR, t.dag || '08', -t.bedrag, t.naam, D[t.cat]));
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 4000 }, budgetMonth: CUR,
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, o) {
  const d = seed(o);
  // Eenmalig: bij een reload moet de opgeslagen SET blijven staan, anders meet je je eigen fixture.
  await page.addInitScript((s) => {
    if (localStorage.getItem('minder_tx')) return;
    for (const k in s) localStorage.setItem(k, s[k]);
  }, d);
  await page.goto('/');
  await page.waitForFunction(() => typeof valtOpSignals === 'function');
}

const sigKeys = (page) => page.evaluate(() => valtOpSignals(thisYM()).map((s) => s.potjeId));
const logVan = (page) => page.evaluate(() => JSON.parse(JSON.stringify(SET.valtOpLog || {})));

// ---- fixtures ----
// drie potjes boven de drempel (100 / 50 / 30) plus één eronder (8)
const DRIE = {
  tx: [
    { cat: 'boodschappen', bedrag: 300, naam: 'Albert Heijn' },
    { cat: 'uiteten', bedrag: 150, naam: 'Restaurant De Kade' },
    { cat: 'vervoer', bedrag: 80, naam: 'Shell' },
    { cat: 'sport', bedrag: 38, naam: 'Basic-Fit' },
  ],
  // v238: shopping heeft geen boekingen en dus 300 ruimte. Zonder een potje met ruimte valt er
  // niets te verschuiven en staat de opslaanknop altijd uit. Het levert geen signaal op, dus de
  // rangorde, de drempel en de log blijven precies zoals ze waren.
  set: { budgets: { boodschappen: 200, uiteten: 100, vervoer: 50, sport: 30, shopping: 300 } },
};
/* v238: bijstellen is een verdeling. De knop blijft uit tot het verschil nul is, dus elke test die
   opslaat wijst eerst een dekkend potje aan. */
async function dek(page, cat, bedrag) {
  await page.locator('#sheet [onclick*="valtOpDekLijst"]').click();
  await page.locator('#valtOpDekBlok .tx', { hasText: cat }).click();
  await page.locator('#valtOpDekBlok input').last().fill(String(bedrag));
}
// zes losse boodschappen-boekingen op één dag: piekdag vuurt, geen dominante winkel
const ZES = [28, 29, 30, 31, 32, 33].map((b, i) => ({ cat: 'boodschappen', bedrag: b, naam: 'Winkel ' + 'ABCDEF'[i], dag: '08' }));

test.describe('valtOpSignals: de detectie', () => {
  test('rangorde op het bedrag, maximaal twee, de derde wordt wel vastgelegd', async ({ page }) => {
    await boot(page, DRIE);
    expect(await sigKeys(page)).toEqual(['boodschappen', 'uiteten']);
    const log = await logVan(page);
    // vier categorieën boven hun potje? nee: sport valt onder de drempel en krijgt geen record
    expect(Object.keys(log).sort()).toEqual([`${CUR}|boodschappen`, `${CUR}|uiteten`, `${CUR}|vervoer`].sort());
    // wat buiten de twee plekken viel is vastgelegd maar niet getoond
    expect(log[`${CUR}|vervoer`].getoond).toBe(false);
    expect(log[`${CUR}|boodschappen`].getoond).toBe(true);
    expect(log[`${CUR}|uiteten`].getoond).toBe(true);
    // de stand bij detectie, in euro's
    expect(log[`${CUR}|boodschappen`].potje_bij_detectie).toBe(200);
    expect(log[`${CUR}|boodschappen`].over_bij_detectie).toBe(100);
  });

  test('een potje van 30 met 8 over duikt nergens op', async ({ page }) => {
    await boot(page, DRIE);
    expect(await sigKeys(page)).not.toContain('sport');
    expect(await logVan(page)).not.toHaveProperty(`${CUR}|sport`);
    await page.evaluate(() => go('ins'));
    await expect(page.locator('#insSignalRows')).not.toContainText('Sport');
    await page.evaluate(() => go('maand'));
    await expect(page.locator('#s-maand')).not.toContainText('Sport & gezondheid');
  });

  test('bij een gelijk bedrag beslist de categorienaam', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'vervoer', bedrag: 100, naam: 'Shell' }, { cat: 'uiteten', bedrag: 100, naam: 'Restaurant De Kade' }],
      set: { budgets: { vervoer: 50, uiteten: 50 } },
    });
    // beide 50 boven het potje: 'Uit eten & café' vóór 'Vervoer & auto'
    expect(await sigKeys(page)).toEqual(['uiteten', 'vervoer']);
  });

  test('de drempel staat als losse constante bovenaan de functie', async ({ page }) => {
    await boot(page, DRIE);
    const src = await page.evaluate(() => valtOpSignals.toString());
    expect(src).toMatch(/const DREMPEL_EUR\s*=\s*25/);
    // één detectie: Grip rekent niet zelf
    const grip = await page.evaluate(() => gripSignalCards.toString() + valtOpKaartOpen.toString());
    expect(grip).not.toMatch(/DREMPEL|effectiveBudgets|catSpendMap/);
    expect(grip).toMatch(/valtOpSignals\(/);
  });
});

test.describe('Inzichten: constateren, niet oplossen', () => {
  test('drie potjes over: twee regels, geen patroonregel', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('ins'));
    await expect(page.locator('.valtop-rij')).toHaveCount(2);
    await expect(page.locator('.valtop-patroon')).toHaveCount(0);
    const rijen = await page.locator('.valtop-rij').allInnerTexts();
    expect(rijen[0]).toContain('Boodschappen');
    expect(rijen[0]).toContain('in Grip');
    expect(rijen[0]).toMatch(/€\s?300.*€\s?200/s);
    expect(rijen[0]).toContain('boven je potje');
    expect(rijen[1]).toContain('Uit eten');
  });

  /* v239: ZES leverde hiervoor een piekdag, maar die vraagt nu acht losse boekingen en drie
     afgeronde maanden historie, en boot() seedt er twee. De patroonregel komt daarom van de
     grootste uitgave: een dominante winkel in een categorie zonder potje, dus geen budgetsignaal. */
  test('één potje over: die regel plus één patroonregel', async ({ page }) => {
    await boot(page, { tx: ZES.concat([{ cat: 'shopping', bedrag: 400, naam: 'Zalando', dag: '09' }]),
      set: { budgets: { boodschappen: 100 } } });
    await page.evaluate(() => go('ins'));
    await expect(page.locator('.valtop-rij')).toHaveCount(1);
    await expect(page.locator('.valtop-patroon')).toHaveCount(1);
  });

  test('geen potje over: hooguit twee patroonregels, geen lege staat', async ({ page }) => {
    await boot(page, {
      tx: ZES.concat([{ cat: 'shopping', bedrag: 400, naam: 'Zalando', dag: '09' }]),
      set: { budgets: { boodschappen: 400, shopping: 500 } },
    });
    await page.evaluate(() => go('ins'));
    await expect(page.locator('.valtop-rij')).toHaveCount(0);
    const n = await page.locator('.valtop-patroon').count();
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThanOrEqual(2);
  });

  test('niets aan de hand: geen regels en geen lege staat', async ({ page }) => {
    await boot(page, { tx: [{ cat: 'boodschappen', bedrag: 80, naam: 'Albert Heijn' }], set: { budgets: { boodschappen: 400 } } });
    expect(await page.evaluate(() => insSignalRows(thisYM(), true))).toBe('');
    await page.evaluate(() => go('ins'));
    await expect(page.locator('#insSignalRows')).toHaveCount(0);
  });

  test('de kaart met de CTA is weg: geen lamp, geen uit-de-pas, geen vraag', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('ins'));
    await expect(page.locator('#wvoLine')).toHaveCount(0);
    const ins = await page.locator('#s-ins').innerHTML();
    expect(ins).not.toContain('uit de pas');
    expect(ins).not.toContain('Wil je kijken wat je hieraan kunt doen');
    expect(ins).not.toMatch(/coStart\(&quot;?'?lek/);
    /* de rand is var(--mut2), geen nieuw token en geen accent op het bedrag.
       v241: de kaart eromheen is weg, en daarmee de afgeronde hoeken die bij dat kader hoorden.
       Wat het signaal draagt is de linkerrand, en die staat er nog. */
    const rij = await page.locator('.valtop-rij').first().getAttribute('style');
    expect(rij).toContain('border-left:3px solid var(--mut2)');
    expect(rij).not.toContain('border-radius');
    expect(await page.locator('.card .valtop-rij').count()).toBe(0);
  });

  /* v241: de samenstelling van renderIns() is herschreven, dus een grep op de oude regel bewijst
     niets meer. De eigenschap is de volgorde op het scherm, en die meten we op de gerenderde pagina
     en niet in de broncode.
     v252: de volgorde is de stand, de signalen, wat er nog komt, en dan de grafiek. De regel die
     deze test vasthoudt is onveranderd - de rij staat tussen de stand en de grafiek - maar de
     assertie `sig > nog` legde de oude plek van de lijst vast en is daarom omgedraaid. De eis van
     v241 was dat je de signalen ziet zonder te scrollen, en met de lijst ertussen werd die niet
     gehaald (gemeten 651px tegen 567px zichtbaar op 360x640, nu 369px). */
  test('de rij staat tussen de stand en de grafiek', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('ins'));
    const uit = await page.evaluate(() => {
      const el = document.querySelector('#s-ins');
      const blok = [...el.children];
      const idx = (sel) => { const n = el.querySelector(sel); return n ? blok.findIndex((c) => c.contains(n)) : -1; };
      return { stand: idx('.card'), nog: idx('#insNogLijst'), sig: idx('.valtop-rij'), graf: idx('#insSpendCard') };
    });
    expect(uit.stand).toBeGreaterThanOrEqual(0);
    expect(uit.sig).toBeGreaterThan(uit.stand);
    if (uit.nog >= 0) expect(uit.nog).toBeGreaterThan(uit.sig);
    if (uit.graf >= 0) expect(uit.sig).toBeLessThan(uit.graf);
  });
});

test.describe('Grip: dezelfde lijst, de handelingen erbij', () => {
  test('dezelfde twee in dezelfde volgorde, eerste open, tweede dicht', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await expect(page.locator('.valtop-kaart')).toHaveCount(2);
    await expect(page.locator('.valtop-open')).toHaveCount(1);
    const ids = await page.locator('.valtop-kaart').evaluateAll((els) => els.map((e) => e.dataset.sig));
    expect(ids).toEqual([`${CUR}|boodschappen`, `${CUR}|uiteten`]);
    expect(await page.locator('.valtop-open').getAttribute('data-sig')).toBe(`${CUR}|boodschappen`);
    // de ingeklapte kaart draagt kop plus bedrag, en verder niets
    const dicht = await page.locator('.valtop-kaart:not(.valtop-open)').innerText();
    expect(dicht).toContain('Uit eten');
    expect(dicht).toContain('boven je potje');
    expect(dicht).not.toContain('Bijstellen');
  });

  /* De rij op Inzichten belooft "in Grip". Tik je op de TWEEDE rij, dan hoort die kaart open te
     staan en niet de eerste, anders leidt de ingang je naar het verkeerde signaal. */
  test('de rij op Inzichten opent de kaart van dat signaal', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('ins'));
    await page.locator('.valtop-rij').nth(1).click();
    await expect(page.locator('#s-maand')).toHaveClass(/active/);
    expect(await page.locator('.valtop-open').getAttribute('data-sig')).toBe(`${CUR}|uiteten`);
    // de volgorde van de kaarten verandert daar niet van
    const ids = await page.locator('.valtop-kaart').evaluateAll((els) => els.map((e) => e.dataset.sig));
    expect(ids).toEqual([`${CUR}|boodschappen`, `${CUR}|uiteten`]);
    // en de ingeklapte kaart laat zich openen
    await page.locator('.valtop-kaart:not(.valtop-open)').click();
    expect(await page.locator('.valtop-open').getAttribute('data-sig')).toBe(`${CUR}|boodschappen`);
  });

  test('de open kaart draagt het bedrag, de dagen, de historie en drie handelingen', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    const t = await page.locator('.valtop-open').innerText();
    expect(t).toContain('boven je potje');
    expect(t).toMatch(/nog \d+ dagen te gaan|nog 1 dag te gaan|de laatste dag/);
    expect(t).toContain('In de drie maanden hiervoor');
    expect(await page.locator('.valtop-open .valtop-hand button').allInnerTexts())
      .toEqual(['Bijstellen', 'Grens zetten', 'Bekijken']);
  });

  test('geen patroonregels en geen derde kaart op Grip', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await expect(page.locator('#s-maand .valtop-patroon')).toHaveCount(0);
    await expect(page.locator('.valtop-kaart')).toHaveCount(2);
    // het derde signaal staat wel in de log (dat is de bedoeling: je ziet wat je niet gezien hebt),
    // maar niet als kaart
    expect((await page.locator('.valtop-kaart').allInnerTexts()).join('|')).not.toContain('Vervoer & auto');
    await expect(page.locator('.card', { hasText: 'Wat je met deze overschrijdingen deed' })).toContainText('niet getoond');
  });

  test('de historie komt uit de log en wordt niet herberekend', async ({ page }) => {
    const vorig = {};
    vorig[`${M1}|boodschappen`] = { id: `${M1}|boodschappen`, maand: M1, categorie: 'Boodschappen', potjeId: 'boodschappen',
      potje_bij_detectie: 200, over_bij_detectie: 60, gedetecteerd_op: `${M1}-20`, getoond: true,
      actie: 'geen', actie_op: null, potje_voor: null, potje_na: null, over_eind_maand: 60 };
    await boot(page, Object.assign({}, DRIE, { set: Object.assign({}, DRIE.set, { valtOpLog: vorig }) }));
    await page.evaluate(() => go('maand'));
    await expect(page.locator('.valtop-open')).toContainText('één keer');
    const src = await page.evaluate(() => valtOpHistorie.toString());
    expect(src).not.toMatch(/catSpendMap|effectiveBudgets/);
  });

  test('de lek-ingang leeft verder als chevron in de kop', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    const chev = page.locator('.valtop-open [onclick*="coStart"]');
    await expect(chev).toHaveCount(1);
    expect(await chev.getAttribute('onclick')).toContain("coStart('lek'");
    // Grip leest altijd de lopende maand (v233)
    expect(await chev.getAttribute('onclick')).toContain(CUR);
    // geen vierde knop
    await expect(page.locator('.valtop-open .valtop-hand button')).toHaveCount(3);
  });
});

test.describe('de drie handelingen', () => {
  test('potje bijstellen: voorstel boven de stand, deze maand, en vastgelegd', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').first().click();
    const voorstel = +(await page.locator('#valtOpBedrag').inputValue());
    // KRITIEK: nooit onder de huidige stand, anders verdwijnt het signaal terwijl je er nog boven staat
    expect(voorstel).toBeGreaterThanOrEqual(300);
    expect(voorstel % 5).toBe(0);
    const totVoor = await page.evaluate(() => Math.round(totalBudget()));
    await dek(page, 'Online shopping', voorstel - 200);
    await page.locator('#valtOpSave').click();
    const na = await page.evaluate(() => ({ b: SET.budgets.boodschappen, n: SET.budgetsNext.boodschappen, tot: Math.round(totalBudget()) }));
    expect(na.b).toBe(voorstel);          // de lopende maand
    expect(na.n).toBe(200);               // rolloverBudgets() draait hem bij de maandwissel terug
    expect(na.tot).toBe(totVoor);         // v238: het maandtotaal blijft gelijk
    const r = (await logVan(page))[`${CUR}|boodschappen`];
    expect(r.actie).toBe('potje_bijgesteld');
    expect(r.potje_voor).toBe(200);
    expect(r.potje_na).toBe(voorstel);
    expect(r.actie_op).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('een handmatig lager bedrag mag, en de vastlegging laat dat zien', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').first().click();
    await page.locator('#valtOpBedrag').fill('220');
    await dek(page, 'Online shopping', 20);
    await page.locator('#valtOpSave').click();
    const r = (await logVan(page))[`${CUR}|boodschappen`];
    expect(r.potje_voor).toBe(200);
    expect(r.potje_na).toBe(220);
    // 300 uitgegeven tegen een potje van 220: de maand eindigt alsnog boven het potje
    expect(await page.evaluate(() => catSpendMap(thisYM()).boodschappen)).toBeGreaterThan(220);
  });

  test('een actie laat het signaal van beide schermen vallen, ook na herladen, en de derde schuift door', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').first().click();
    await dek(page, 'Online shopping', +(await page.locator('#valtOpBedrag').inputValue()) - 200);
    await page.locator('#valtOpSave').click();
    expect(await sigKeys(page)).toEqual(['uiteten', 'vervoer']);   // nummer drie schuift door
    await page.evaluate(() => go('ins'));
    await expect(page.locator('.valtop-rij')).toHaveCount(2);
    await expect(page.locator('#insSignalRows')).not.toContainText('Boodschappen');
    await page.evaluate(() => go('maand'));
    expect((await page.locator('.valtop-kaart').allInnerTexts()).join('|')).not.toContain('Boodschappen');
    await page.reload();
    await page.waitForFunction(() => typeof valtOpSignals === 'function');
    expect(await sigKeys(page)).toEqual(['uiteten', 'vervoer']);
  });

  test('grens zetten legt de stand vast en laat het signaal vallen', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').nth(1).click();
    const g = await page.evaluate(() => JSON.parse(JSON.stringify(SET.valtOpGrens)));
    expect(g.boodschappen.stand).toBe(300);
    expect(g.boodschappen.ym).toBe(CUR);
    expect(g.boodschappen.bekend.length).toBe(1);
    expect((await logVan(page))[`${CUR}|boodschappen`].actie).toBe('grens_gezet');
    expect(await sigKeys(page)).not.toContain('boodschappen');
  });

  test('een boeking na de grens levert een melding, de bekende boeking niet', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').nth(1).click();
    expect(await page.evaluate(() => scoreNotifs().filter((n) => /^grens-/.test(n.key)).length)).toBe(0);
    // een nieuwe boeking in dezelfde categorie
    const n = await page.evaluate(() => {
      const t = { id: '', date: thisYM() + '-15', amount: -45, acc: TX[0].acc, name: 'Albert Heijn',
        desc: 'BEA, BETAALPAS ALBERT HEIJN XL', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };
      categorize(t); TX.push(t); save();
      return scoreNotifs().filter((x) => /^grens-/.test(x.key)).map((x) => x.l1);
    });
    expect(n.length).toBe(1);
    expect(n[0]).toContain('na je grens');
  });

  test('transacties bekijken is geen actie: het signaal blijft staan', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').nth(2).click();
    await expect(page.locator('#sheet')).toContainText('Boodschappen');
    expect((await logVan(page))[`${CUR}|boodschappen`].actie).toBe(null);
    await page.evaluate(() => closeSheet());
    expect(await sigKeys(page)).toEqual(['boodschappen', 'uiteten']);
    // Grip heeft geen maandkiezer: de lijst gaat over de lopende maand (v233)
    const src = await page.evaluate(() => valtOpKaartOpen.toString());
    expect(src).toMatch(/openCategory\('\$\{esc\(s\.potjeId\)\}','\$\{esc\(s\.maand\)\}'\)/);
  });
});

test.describe('de vastlegging', () => {
  test('een potjeverhoging via de budgeteditor telt ook mee', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => setCatBudget('boodschappen', '350'));
    const r = (await logVan(page))[`${CUR}|boodschappen`];
    expect(r.actie).toBe('potje_bijgesteld');
    expect(r.potje_voor).toBe(200);
    expect(r.potje_na).toBe(350);
    expect(await sigKeys(page)).not.toContain('boodschappen');
  });

  /* setCatBudget() vuurt per toetsaanslag: bij het typen van 350 komt eerst 3 langs, dan 35. Het
     record moet de LAATSTE stand dragen en de EERSTE potje_voor, anders legt de vastlegging een
     tussenstand vast die nooit heeft bestaan. */
  test('typen legt de eindstand vast, niet de eerste toetsaanslag', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => { setCatBudget('boodschappen', '3'); setCatBudget('boodschappen', '35'); setCatBudget('boodschappen', '350'); });
    const r = (await logVan(page))[`${CUR}|boodschappen`];
    expect(r.potje_voor).toBe(200);
    expect(r.potje_na).toBe(350);
  });

  test('terugtypen naar de oude stand telt niet als actie', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => { setCatBudget('boodschappen', '350'); setCatBudget('boodschappen', '200'); });
    const r = (await logVan(page))[`${CUR}|boodschappen`];
    expect(r.actie).toBe(null);
    expect(r.potje_na).toBe(null);
    expect(await sigKeys(page)).toContain('boodschappen');   // het signaal staat er dus weer
  });

  /* Een grens is een andere keuze dan een bijstelling: een potjewijziging erna mag hem niet
     overschrijven, anders telt de log de verkeerde handeling. */
  test('een grens blijft staan als je daarna het potje wijzigt', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').nth(1).click();
    await page.evaluate(() => setCatBudget('boodschappen', '500'));
    expect((await logVan(page))[`${CUR}|boodschappen`].actie).toBe('grens_gezet');
  });

  test('een potjeverhoging via openPotje telt ook mee', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => { openPotje('boodschappen'); potDraftSet('vast', 420); savePotje('boodschappen'); });
    const r = (await logVan(page))[`${CUR}|boodschappen`];
    expect(r.actie).toBe('potje_bijgesteld');
    expect(r.potje_voor).toBe(200);
    expect(r.potje_na).toBe(420);
  });

  test('de telling op Grip loopt mee', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    const blok = page.locator('.card', { hasText: 'Wat je met deze overschrijdingen deed' });
    await expect(blok).toContainText('0× potje bijgesteld');
    await page.locator('.valtop-open .valtop-hand button').first().click();
    await dek(page, 'Online shopping', +(await page.locator('#valtOpBedrag').inputValue()) - 200);
    await page.locator('#valtOpSave').click();
    await page.evaluate(() => go('maand'));
    // v238: een verdeling raakt twee potjes maar blijft een handeling
    await expect(blok).toContainText('1× potje bijgesteld');
    await expect(blok).toContainText('€200');
    await expect(blok).not.toContainText('streak');
  });

  test('de opslag hangt onder SET en overleeft een herstart', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').nth(1).click();
    await page.reload();
    await page.waitForFunction(() => typeof valtOpSignals === 'function');
    const bewaard = await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).valtOpLog);
    expect(bewaard[`${CUR}|boodschappen`].actie).toBe('grens_gezet');
    // lokale kalenderdag, geen UTC (v199)
    const src = await page.evaluate(() => valtOpActieZet.toString() + valtOpSignals.toString());
    expect(src).toContain('vandaagYMD()');
    expect(src).not.toContain('toISOString');
  });
});

test.describe('de maandafsluiting', () => {
  // Een openstaand record van een afgeronde maand wordt bij de eerste opening in de nieuwe maand
  // afgesloten: actie 'geen' waar niets is gebeurd, plus wat er aan het eind van die maand boven
  // het potje stond. Zonder dat weet je niet wat een signaal je uiteindelijk heeft gekost.
  const openRecord = () => {
    const l = {};
    l[`${M1}|boodschappen`] = { id: `${M1}|boodschappen`, maand: M1, categorie: 'Boodschappen', potjeId: 'boodschappen',
      potje_bij_detectie: 200, over_bij_detectie: 40, gedetecteerd_op: `${M1}-12`, getoond: true,
      actie: null, actie_op: null, potje_voor: null, potje_na: null, over_eind_maand: null };
    return l;
  };

  test('een openstaand signaal wordt afgesloten met actie geen en over_eind_maand', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'boodschappen', bedrag: 320, naam: 'Albert Heijn', m: M1, dag: '12' },
           { cat: 'boodschappen', bedrag: 80, naam: 'Albert Heijn' }],
      set: { budgets: { boodschappen: 200 }, valtOpLog: openRecord() },
    });
    const r = (await logVan(page))[`${M1}|boodschappen`];
    expect(r.actie).toBe('geen');
    expect(r.over_eind_maand).toBe(120);   // 320 uitgegeven tegen een potje van 200
    // de nieuwe maand begint schoon: 80 van 200 is geen signaal
    expect(await sigKeys(page)).toEqual([]);
    await page.evaluate(() => go('ins'));
    await expect(page.locator('.valtop-rij')).toHaveCount(0);
  });

  test('een overschrijding die vanzelf oploste houdt zijn record, met nul over', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'boodschappen', bedrag: 320, naam: 'Albert Heijn', m: M1, dag: '12' }],
      set: { budgets: { boodschappen: 200 }, valtOpLog: openRecord() },
    });
    // een terugboeking in dezelfde maand maakt de overschrijding ongedaan
    const r = await page.evaluate(async (m) => {
      const t = { id: '', date: m + '-20', amount: 200, acc: TX[0].acc, name: 'Albert Heijn',
        desc: 'BEA, BETAALPAS ALBERT HEIJN RETOUR', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };
      categorize(t); TX.push(t);
      SET.valtOpLog[m + '|boodschappen'].over_eind_maand = null;
      SET.valtOpLog[m + '|boodschappen'].actie = null;
      save(); valtOpAfsluiten();
      return JSON.parse(JSON.stringify(SET.valtOpLog[m + '|boodschappen']));
    }, M1);
    expect(r.actie).toBe('geen');
    expect(r.over_eind_maand).toBe(0);
  });

  test('bij een bijgesteld potje is potje_na de meetlat', async ({ page }) => {
    const l = openRecord();
    l[`${M1}|boodschappen`].actie = 'potje_bijgesteld';
    l[`${M1}|boodschappen`].potje_voor = 200;
    l[`${M1}|boodschappen`].potje_na = 250;
    await boot(page, {
      tx: [{ cat: 'boodschappen', bedrag: 320, naam: 'Albert Heijn', m: M1, dag: '12' }],
      set: { budgets: { boodschappen: 200 }, valtOpLog: l },
    });
    // 320 tegen de bijgestelde 250: het bijstellen loste de overschrijding niet op
    expect((await logVan(page))[`${M1}|boodschappen`].over_eind_maand).toBe(70);
  });

  test('afsluiten hangt niet aan rolloverBudgets: het record draagt zijn eigen meetlat', async ({ page }) => {
    await boot(page, DRIE);
    const src = await page.evaluate(() => valtOpAfsluiten.toString());
    expect(src).not.toContain('SET.budgets');
    expect(src).toContain('potje_bij_detectie');
  });
});

test.describe('layout', () => {
  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px, op beide schermen`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page, DRIE);
      for (const scherm of ['ins', 'maand']) {
        await page.evaluate((x) => go(x), scherm);
        await page.waitForTimeout(60);
        const over = await page.evaluate((x) => {
          const el = document.querySelector('#s-' + x);
          return { scherm: el.scrollWidth - el.clientWidth,
            body: document.body.scrollWidth - document.body.clientWidth };
        }, scherm);
        expect(over.scherm, scherm).toBeLessThanOrEqual(1);
        expect(over.body, scherm).toBeLessThanOrEqual(1);
      }
      // de knop rechts blijft op één regel staan naast zijn label
      await page.evaluate(() => go('maand'));
      const knop = await page.locator('.valtop-open .valtop-hand button').first().boundingBox();
      const rij = await page.locator('.valtop-open .valtop-hand').first().boundingBox();
      expect(knop.x + knop.width).toBeLessThanOrEqual(rij.x + rij.width + 1);
    });
  }

  test('de sheet past ook, en het veld is een heel bedrag', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').first().click();
    const veld = page.locator('#valtOpBedrag');
    // v215: hele euro's mogen type=number/inputmode=numeric houden
    expect(await veld.getAttribute('type')).toBe('number');
    expect(await veld.getAttribute('inputmode')).toBe('numeric');
    await dek(page, 'Online shopping', 100);   // v238: met de dekkingshelft erbij
    const over = await page.evaluate(() => {
      const el = document.querySelector('#sheet');
      return el.scrollWidth - el.clientWidth;
    });
    expect(over).toBeLessThanOrEqual(1);
  });
});

/* v237: coachLeak() is de vijfde bron voor de patroonregels. De lek-ingang hing sinds v235 alleen
   aan de chevron van de open Grip-kaart, en die kaart bestaat pas bij een overschrijding van
   minstens DREMPEL_EUR. coachLeak() meet iets anders, dus die twee dekten elkaar niet.
   Wat deze groep vasthoudt: het lek staat bovenaan de patroonregels, telt mee in het maximum van
   twee, verdringt nooit een budgetsignaal, en een categorie staat nooit twee keer op het scherm. */
test.describe('de lek-regel op Inzichten', () => {
  const lekRij = (page) => page.locator(".valtop-patroon[onclick*=\"coStart('lek'\"]");
  const ingang = (page, scherm) =>
    page.evaluate((x) => document.querySelectorAll('#s-' + x + " [onclick*=\"coStart('lek'\"]").length, scherm);

  test('een lek zonder overschrijding: ingang op Inzichten, niet op Grip', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'shopping', bedrag: 220, naam: 'Zalando' }],
      set: { budgets: { boodschappen: 400 } },          // shopping heeft geen potje
    });
    expect(await page.evaluate(() => coachLeak(thisYM()).kind)).toBe('impulse');
    expect(await sigKeys(page)).toEqual([]);            // geen enkele overschrijding
    await page.evaluate(() => go('ins'));
    await expect(lekRij(page)).toHaveCount(1);
    expect(await ingang(page, 'ins')).toBe(1);
    await page.evaluate(() => go('maand'));
    await expect(page.locator('.valtop-kaart')).toHaveCount(0);
    expect(await ingang(page, 'maand')).toBe(0);
  });

  test('een lek met een overschrijding in dezelfde categorie: ingang op Grip, geen lek-regel', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'boodschappen', bedrag: 300, naam: 'Albert Heijn' }],
      set: { budgets: { boodschappen: 200 } },
    });
    // dezelfde categorie draagt allebei: de overschrijding is het lek
    expect(await page.evaluate(() => coachLeak(thisYM()))).toMatchObject({ kind: 'over-budget', cat: 'boodschappen' });
    expect(await sigKeys(page)).toEqual(['boodschappen']);
    await page.evaluate(() => go('ins'));
    await expect(lekRij(page)).toHaveCount(0);          // de budgetregel draagt hem al
    await expect(page.locator('.valtop-rij')).toHaveCount(1);
    expect(await ingang(page, 'ins')).toBe(0);
    await page.evaluate(() => go('maand'));
    expect(await ingang(page, 'maand')).toBe(1);
  });

  test('een lek in een categorie die al als patroonregel staat: geen lek-regel', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'zorg', bedrag: 60, naam: 'Apotheek Centrum', m: M2, dag: '18' },
           { cat: 'zorg', bedrag: 120, naam: 'Apotheek Centrum', m: M1, dag: '18' },
           { cat: 'zorg', bedrag: 200, naam: 'Apotheek Centrum', dag: '18' }],
      set: { budgets: { boodschappen: 400 } },
    });
    expect(await page.evaluate(() => coachLeak(thisYM()).cat)).toBe('zorg');
    await page.evaluate(() => go('ins'));
    // zorg loopt drie maanden op: dat patroon heeft de plek, het lek valt weg
    await expect(page.locator('.valtop-patroon')).toHaveCount(1);
    await expect(lekRij(page)).toHaveCount(0);
    await expect(page.locator('.valtop-patroon')).toContainText('Zorg');
  });

  test('twee budgetsignalen plus een lek: geen lek-regel, het maximum van twee wint', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'boodschappen', bedrag: 300, naam: 'Albert Heijn' },
           { cat: 'uiteten', bedrag: 150, naam: 'Restaurant De Kade' },
           { cat: 'shopping', bedrag: 220, naam: 'Zalando' }],
      set: { budgets: { boodschappen: 200, uiteten: 100 } },
    });
    expect(await page.evaluate(() => coachLeak(thisYM()).cat)).toBe('shopping');
    await page.evaluate(() => go('ins'));
    await expect(page.locator('.valtop-rij')).toHaveCount(2);
    await expect(page.locator('.valtop-patroon')).toHaveCount(0);
    expect(await ingang(page, 'ins')).toBe(0);
  });

  /* Het opgegeven geval was "een aandeel-signaal", maar dat is signaal 2 en dat vuurt niet op de
     lopende maand (v230: een halve maand is geen maand), terwijl een budgetsignaal juist alleen
     daar bestaat. De twee kunnen dus nooit samen voorkomen. Gemeten wordt daarom tegen de sterkste
     patroonregel die er wel kan staan: signaal 1, drie maanden op rij, met pri 9. Wint het lek van
     die, dan wint hij van alle vier. */
  test('een budgetsignaal plus een lek plus een patroon: het lek staat er, het patroon niet', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'boodschappen', bedrag: 300, naam: 'Albert Heijn' },
           { cat: 'shopping', bedrag: 220, naam: 'Zalando' },
           { cat: 'zorg', bedrag: 60, naam: 'Apotheek Centrum', m: M2, dag: '18' },
           { cat: 'zorg', bedrag: 120, naam: 'Apotheek Centrum', m: M1, dag: '18' },
           { cat: 'zorg', bedrag: 200, naam: 'Apotheek Centrum', dag: '18' }],
      set: { budgets: { boodschappen: 200 } },
    });
    const pri = await page.evaluate(() => {
      const m = thisYM(); const mv = monthVsPrevInner(m);
      const ex = new Set([...mv.drivers, ...budgetFlaggedCats(m)]);
      return { lek: lekSignaal(m, budgetFlaggedCats(m)).pri, pat: insSignals(m, ex).map((x) => x.pri) };
    });
    expect(pri.lek).toBeGreaterThan(9);
    expect(pri.pat).toContain(9);
    await page.evaluate(() => go('ins'));
    await expect(page.locator('.valtop-rij')).toHaveCount(1);     // het budgetsignaal blijft staan
    await expect(page.locator('.valtop-patroon')).toHaveCount(1); // en er is nog een plek
    await expect(lekRij(page)).toHaveCount(1);                    // die gaat naar het lek
    await expect(page.locator('.valtop-patroon')).not.toContainText('Zorg');
  });

  test('de lek-regel draagt de vaststelling en het gevolg, zonder gebiedende wijs', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'shopping', bedrag: 220, naam: 'Zalando' }],
      set: { budgets: { boodschappen: 400 } },
    });
    await page.evaluate(() => go('ins'));
    const r = lekRij(page);
    const t = await r.innerText();
    expect(t).toContain('Zalando');
    expect(t).toMatch(/€\s?220/);
    expect(t).toContain('Online shopping');
    expect(t).toContain('zat deze maand in geen enkel potje');
    // v222: geen handeling op een regel die vaststelt. De zin van coachWeekRisk blijft in het gesprek.
    expect(t).not.toMatch(/\bGeef\b|\bZet\b|\bStop\b|\bKijk\b/);
    expect(t).not.toMatch(/[!—]/);
    // zelfde stille vorm als de andere patroonregels
    const st = await r.getAttribute('style');
    expect(st).toContain('border-left:3px solid var(--mut2)');
    expect(await r.locator('button').count()).toBe(0);
  });

  test('op een afgesloten maand komt de lek-regel niet mee', async ({ page }) => {
    await boot(page, {
      tx: [{ cat: 'shopping', bedrag: 220, naam: 'Zalando' }],
      set: { budgets: { boodschappen: 400 } },
    });
    const html = await page.evaluate((m) => insSignalRows(m, false), M1);
    expect(html).not.toContain("coStart('lek'");
  });
});

/* v237: de log ging liegen. De knop op Grip verzet de LOPENDE maand, setCatBudget() de volgende.
   Zonder guard overschreef een latere editor-wijziging potje_na, en dan las de log "€200 → €200"
   terwijl het potje van deze maand op €450 stond: precies bij de handeling die de vastlegging
   moest vangen. */
test.describe('terugtypen na de knop op Grip', () => {
  test('de log houdt het bedrag van de Grip-route vast', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').first().click();
    await page.locator('#valtOpBedrag').fill('450');
    await dek(page, 'Online shopping', 250);
    await page.locator('#valtOpSave').click();
    expect((await logVan(page))[`${CUR}|boodschappen`].potje_na).toBe(450);
    // in de budgeteditor terugtypen naar de oude stand, per toetsaanslag
    await page.evaluate(() => { setCatBudget('boodschappen', '2'); setCatBudget('boodschappen', '20'); setCatBudget('boodschappen', '200'); });
    const r = (await logVan(page))[`${CUR}|boodschappen`];
    expect(r.potje_voor).toBe(200);
    expect(r.potje_na).toBe(450);                    // niet 200: de lopende maand staat op 450
    expect(await page.evaluate(() => SET.budgets.boodschappen)).toBe(450);
    // en het signaal komt niet terug, want er is deze maand geen overschrijding meer
    expect(await sigKeys(page)).not.toContain('boodschappen');
    await page.evaluate(() => go('ins'));
    await expect(page.locator('#insSignalRows')).not.toContainText('Boodschappen');
  });

  test('zonder de Grip-route blijft het typen per toetsaanslag werken', async ({ page }) => {
    await boot(page, DRIE);
    await page.evaluate(() => { valtOpSignals(thisYM()); setCatBudget('boodschappen', '3'); setCatBudget('boodschappen', '35'); setCatBudget('boodschappen', '350'); });
    let r = (await logVan(page))[`${CUR}|boodschappen`];
    expect(r.potje_voor).toBe(200);
    expect(r.potje_na).toBe(350);
    await page.evaluate(() => setCatBudget('boodschappen', '200'));
    r = (await logVan(page))[`${CUR}|boodschappen`];
    expect(r.actie).toBe(null);                      // terug op de oude stand telt niet als actie
  });
});

/* v238: bijstellen is een verdeling, geen verhoging. Tot v237 ging het potje omhoog en het
   maandtotaal mee, en de log zweeg over waar dat geld vandaan kwam. Drie harde regels: opslaan kan
   pas als het verschil nul is, je wijst een dekkend potje per keer aan, en een dekkend potje mag
   niet onder wat er deze maand al uit is. */
test.describe('bijstellen is een verdeling', () => {
  // sport 50 met 90 uitgegeven (het signaal), en twee potjes met elk 60 ruimte
  const VERDEEL = {
    tx: [{ cat: 'sport', bedrag: 90, naam: 'Basic-Fit' },
         { cat: 'boodschappen', bedrag: 340, naam: 'Albert Heijn' },
         { cat: 'uiteten', bedrag: 40, naam: 'Restaurant De Kade' }],
    set: { budgets: { sport: 50, boodschappen: 400, uiteten: 100 } },   // totaal 550
  };
  const open = async (page) => {
    await page.evaluate(() => go('maand'));
    await page.locator('.valtop-open .valtop-hand button').first().click();
  };
  const totaal = (page) => page.evaluate(() => Math.round(totalBudget()));

  test('volledige dekking uit een potje: het maandtotaal blijft gelijk', async ({ page }) => {
    await boot(page, VERDEEL);
    expect(await totaal(page)).toBe(550);
    await open(page);
    await page.locator('#valtOpBedrag').fill('96');
    await dek(page, 'Boodschappen', 46);
    await expect(page.locator('#valtOpTekort')).toContainText('Gedekt');
    await page.locator('#valtOpSave').click();
    expect(await totaal(page)).toBe(550);
    const b = await page.evaluate(() => SET.budgets);
    expect(b.sport).toBe(96);
    expect(b.boodschappen).toBe(354);          // beide kanten in de lopende maand
    const r = (await logVan(page))[`${CUR}|sport`];
    expect(r.potje_voor).toBe(50);
    expect(r.potje_na).toBe(96);
    expect(r.dekking).toEqual([{ categorie: 'Boodschappen', potjeId: 'boodschappen', potje_voor: 400, potje_na: 354 }]);
    // een verdeling raakt twee potjes maar is een handeling, en de dekkende kant krijgt geen eigen record
    expect(Object.keys(await logVan(page))).toEqual([`${CUR}|sport`]);
  });

  test('zonder dekking kun je niet opslaan, en het verschil staat in de sheet', async ({ page }) => {
    await boot(page, VERDEEL);
    await open(page);
    await page.locator('#valtOpBedrag').fill('96');
    await expect(page.locator('#valtOpSave')).toBeDisabled();
    await expect(page.locator('#valtOpTekort')).toContainText('Nog te dekken');
    await expect(page.locator('#valtOpTekort')).toContainText('€46');
    // de tweede sluiting zit in valtOpPotjeOpslaan zelf: ook rechtstreeks aanroepen doet niets
    await page.evaluate(() => valtOpPotjeOpslaan(thisYM() + '|sport'));
    expect(await page.evaluate(() => SET.budgets.sport)).toBe(50);
    expect((await logVan(page))[`${CUR}|sport`].actie).toBe(null);
  });

  test('een potje met te weinig ruimte wordt geklemd, en er kan een tweede bij', async ({ page }) => {
    await boot(page, VERDEEL);
    await open(page);
    await page.locator('#valtOpBedrag').fill('150');          // 100 te dekken
    await dek(page, 'Boodschappen', 999);
    expect(await page.locator('#valtOpDek_boodschappen').inputValue()).toBe('60');   // ruimte 400 min 340
    await expect(page.locator('#valtOpTekort')).toContainText('€40');
    await expect(page.locator('#valtOpSave')).toBeDisabled();
    await dek(page, 'Uit eten', 40);
    await expect(page.locator('#valtOpSave')).toBeEnabled();
    await page.locator('#valtOpSave').click();
    expect(await totaal(page)).toBe(550);
    const r = (await logVan(page))[`${CUR}|sport`];
    expect(r.dekking.map((x) => [x.potjeId, x.potje_na])).toEqual([['boodschappen', 340], ['uiteten', 60]]);
  });

  test('een potje kan niet onder zijn huidige stand', async ({ page }) => {
    await boot(page, VERDEEL);
    await open(page);
    await page.locator('#valtOpBedrag').fill('150');
    await dek(page, 'Boodschappen', 100);                     // zou het potje op 300 zetten, met 340 erin
    expect(await page.locator('#valtOpDek_boodschappen').inputValue()).toBe('60');
    expect(await page.locator('#valtOpDek_boodschappen').getAttribute('max')).toBe('60');
    // de rij noemt de ruimte en waar die vandaan komt
    await expect(page.locator('#valtOpDekBlok .tx').first()).toContainText('ruimte €60');
    await expect(page.locator('#valtOpDekBlok .tx').first()).toContainText('€340 uitgegeven');
  });

  test('zonder enkel potje met ruimte valt er niets te verschuiven', async ({ page }) => {
    // boodschappen 300 met 340 erin, uit eten 30 met 40 erin: allebei al over hun potje
    await boot(page, { tx: VERDEEL.tx, set: { budgets: { sport: 50, boodschappen: 300, uiteten: 30 } } });
    await open(page);
    expect(await page.evaluate(() => valtOpDekKandidaten('sport'))).toEqual([]);
    await expect(page.locator('#valtOpDekBlok')).toContainText('Geen enkel ander potje heeft deze maand nog ruimte');
    await expect(page.locator('#valtOpSave')).toBeDisabled();
    // de kaart houdt zijn twee andere handelingen, dus je zit niet vast
    await page.evaluate(() => closeSheet());
    await expect(page.locator('.valtop-open .valtop-hand button')).toHaveCount(3);
  });

  test('de maandwissel draait allebei de kanten terug', async ({ page }) => {
    await boot(page, VERDEEL);
    await open(page);
    await page.locator('#valtOpBedrag').fill('96');
    await dek(page, 'Boodschappen', 46);
    await page.locator('#valtOpSave').click();
    expect(await page.evaluate(() => SET.budgetsNext)).toMatchObject({ sport: 50, boodschappen: 400 });
    const na = await page.evaluate((m) => { SET.budgetMonth = m; save(); rolloverBudgets(); return SET.budgets; }, M1);
    expect(na.sport).toBe(50);
    expect(na.boodschappen).toBe(400);
    expect(await totaal(page)).toBe(550);
  });

  test('de log leest beide kanten en de telling telt een keer', async ({ page }) => {
    await boot(page, VERDEEL);
    await open(page);
    await page.locator('#valtOpBedrag').fill('96');
    await dek(page, 'Boodschappen', 46);
    await page.locator('#valtOpSave').click();
    await page.evaluate(() => go('maand'));
    const blok = page.locator('.card', { hasText: 'Wat je met deze overschrijdingen deed' });
    await expect(blok).toContainText('€50 → €96');
    await expect(blok).toContainText('uit Boodschappen €400 → €354');
    await expect(blok).toContainText('1× potje bijgesteld');
    await expect(blok).not.toContainText('2× potje bijgesteld');
    // een record van voor v238 heeft geen dekking en mag daar niet over liegen
    expect(await page.evaluate(() => { const d = document.createElement('div');
      const bak = SET.valtOpLog[thisYM() + '|sport'].dekking; delete SET.valtOpLog[thisYM() + '|sport'].dekking;
      d.innerHTML = valtOpLogBlok(); SET.valtOpLog[thisYM() + '|sport'].dekking = bak;
      return d.innerText; })).not.toContain('uit ');
  });

  test('een verlaging van je eigen potje vraagt geen dekking', async ({ page }) => {
    await boot(page, VERDEEL);
    await open(page);
    // v235 blijft: een lager bedrag mag, en dat laat het totaal juist dalen
    await page.locator('#valtOpBedrag').fill('40');
    await expect(page.locator('#valtOpSave')).toBeEnabled();
    await page.locator('#valtOpSave').click();
    expect(await totaal(page)).toBe(540);
    expect((await logVan(page))[`${CUR}|sport`].potje_na).toBe(40);
  });
});
