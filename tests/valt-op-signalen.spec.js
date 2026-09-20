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
  set: { budgets: { boodschappen: 200, uiteten: 100, vervoer: 50, sport: 30 } },
};
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

  test('één potje over: die regel plus één patroonregel', async ({ page }) => {
    await boot(page, { tx: ZES, set: { budgets: { boodschappen: 100 } } });
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
    // de rand is var(--mut2), geen nieuw token en geen accent op het bedrag
    const rij = await page.locator('.valtop-rij').first().getAttribute('style');
    expect(rij).toContain('border-left:3px solid var(--mut2)');
    expect(rij).toContain('border-radius:0 16px 16px 0');
  });

  test('de rij staat tussen de hero en de grafiek', async ({ page }) => {
    await boot(page, DRIE);
    const src = await page.evaluate(() => renderIns.toString());
    expect(src).toMatch(/hero \+ insSignalRows\(m, nu\) \+ \(nu\?spendVsBudgetChart\(\)/);
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
    await page.locator('#sheet button.btn').click();
    const na = await page.evaluate(() => ({ b: SET.budgets.boodschappen, n: SET.budgetsNext.boodschappen }));
    expect(na.b).toBe(voorstel);          // de lopende maand
    expect(na.n).toBe(200);               // rolloverBudgets() draait hem bij de maandwissel terug
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
    await page.locator('#sheet button.btn').click();
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
    await page.locator('#sheet button.btn').click();
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
    await page.locator('#sheet button.btn').click();
    await page.evaluate(() => go('maand'));
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
    const over = await page.evaluate(() => {
      const el = document.querySelector('#sheet');
      return el.scrollWidth - el.clientWidth;
    });
    expect(over).toBeLessThanOrEqual(1);
  });
});
