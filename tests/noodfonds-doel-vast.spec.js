// v101: het noodfonds-doel is als enige van de drie getallen op Vooruitblik berekend
// (essCrisis x maanden, met essCrisis uit medianen over je laatste 12 maanden), dus het schoof
// mee met elke import terwijl je spaarsaldo en een spaardoel als "kosten koper" stil bleven staan.
// Je kunt het doel nu zelf vastzetten. Default blijft de schatting: nietsdoen verandert niets.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2 } = require('./budget-fixture');

async function boot(page) {
  await open(page, seed());
  await page.waitForFunction(() => typeof noodfondsModel === 'function');
}
const model = (page) => page.evaluate(() => { const M = noodfondsModel(); return { doel: M.doel, doelAuto: M.doelAuto, doelVast: M.doelVast, maanden: M.maanden, essCrisis: M.essCrisis, pct: M.pct, spaar: M.spaar }; });
const zet = (page, v) => page.evaluate((x) => { setNfDoelVast(x); }, v);

test.describe('a · de default blijft de schatting', () => {
  test('zonder eigen bedrag is het doel essCrisis x maanden, precies als voorheen', async ({ page }) => {
    await boot(page);
    const M = await model(page);
    expect(M.doelVast).toBe(null);
    expect(M.doel).toBe(M.doelAuto);
    expect(M.doel).toBe(Math.round(M.essCrisis * M.maanden));
  });

  test('en dan beweegt het doel nog steeds mee met de maandkeuze', async ({ page }) => {
    await boot(page);
    const vier = (await model(page)).doel;
    await page.evaluate(() => { SET.nfMaanden = 6; save(); });
    const zes = (await model(page)).doel;
    expect(zes).toBeGreaterThan(vier);
  });
});

test.describe('b · een eigen bedrag vervangt de schatting', () => {
  test('het doel is exact wat je invulde', async ({ page }) => {
    await boot(page);
    const auto = (await model(page)).doelAuto;
    await zet(page, 12000);
    const M = await model(page);
    expect(M.doel).toBe(12000);
    expect(M.doelVast).toBe(12000);
    expect(M.doelAuto).toBe(auto);                       // de schatting blijft naast het doel staan
  });

  test('de maandkeuze stuurt het vastgezette doel niet meer', async ({ page }) => {
    await boot(page);
    await zet(page, 12000);
    await page.evaluate(() => { SET.nfMaanden = 6; save(); });
    const M = await model(page);
    expect(M.doel).toBe(12000);
    expect(M.doelAuto).toBe(Math.round(M.essCrisis * 6));   // de schatting schuift wel gewoon door
  });

  test('nieuwe transacties verschuiven het vastgezette doel niet', async ({ page }) => {
    await boot(page);
    await zet(page, 12000);
    const voor = await model(page);
    // essCrisis leunt op de MEDIAAN per categorie, dus één dure maand verschuift niets - juist
    // daarom is de drift traag en verraderlijk. Til alle maanden op, dan beweegt de schatting wel.
    await page.evaluate((mm) => {
      mm.forEach((m, i) => {
        const t = { id: 'extra' + i, date: `${m}-15`, amount: -500, acc: OWN[0], name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };
        TX.push(t); categorize(t);
      });
      save();
    }, [M2, M1, CUR]);
    const na = await model(page);
    expect(na.doel).toBe(12000);
    expect(na.doelAuto).not.toBe(voor.doelAuto);          // de schatting bewoog wel degelijk
  });

  test('de voortgang rekent tegen het vastgezette doel', async ({ page }) => {
    await boot(page);
    await zet(page, 10000);
    const M = await model(page);
    expect(M.pct).toBe(Math.min(100, Math.round(M.spaar / 10000 * 100)));
  });
});

test.describe('c · in een tik terug naar automatisch', () => {
  test('resetNfDoelVast geeft de schatting terug', async ({ page }) => {
    await boot(page);
    const auto = (await model(page)).doelAuto;
    await zet(page, 12000);
    await page.evaluate(() => resetNfDoelVast());
    const M = await model(page);
    expect(M.doelVast).toBe(null);
    expect(M.doel).toBe(auto);
    expect(await page.evaluate(() => SET.nfDoelVast)).toBe(undefined);   // geen dode sleutel
  });

  for (const [label, waarde] of [['leeg', ''], ['nul', 0], ['negatief', -500], ['onzin', 'abc']]) {
    test(`${label} telt als niet gezet, nooit als doel van nul`, async ({ page }) => {
      await boot(page);
      const auto = (await model(page)).doelAuto;
      await zet(page, 12000);
      await zet(page, waarde);
      const M = await model(page);
      expect(M.doelVast).toBe(null);
      expect(M.doel).toBe(auto);
    });
  }

  test('de keuze overleeft een herstart', async ({ page }) => {
    await boot(page);
    await zet(page, 12000);
    const opslag = await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set') || '{}').nfDoelVast);
    expect(opslag).toBe(12000);
  });
});

test.describe('d · het staat er eerlijk bij', () => {
  // De kop staat in kapitalen via text-transform, dus innerText komt als DOEL · DOOR JOU
  // VASTGEZET binnen. Matchen op /i, niet op de letterlijke schrijfwijze.
  test('de sheet noemt de schatting en biedt de weg terug', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { openNoodfondsPanel(); setNfDoelVast(12000); });
    const s = await page.locator('#sheet').innerText();
    expect(s).toMatch(/door jou vastgezet/i);
    expect(s).toContain('schuift niet meer mee');
    expect(s).toContain('terug naar automatisch');
    expect(s).toMatch(/schatting zou nu .* zeggen/);
  });

  test('zonder eigen bedrag legt de sheet uit dat het meebeweegt', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openNoodfondsPanel());
    const s = await page.locator('#sheet').innerText();
    // v107: de schatting rust op afgeronde maanden; de lopende telt niet meer mee.
    expect(s).toMatch(/geschat uit je .*afgeronde maand/);
    expect(s).toContain('nog niet af');
    expect(s).not.toMatch(/door jou vastgezet/i);
  });

  test('Instellingen spreekt de maandkeuze niet tegen', async ({ page }) => {
    await boot(page);
    // "Bufferdoel" zit in de sub-sheet Budget & doelen, niet op #s-set zelf
    await page.evaluate(() => { setNfDoelVast(12000); openBudgetEditor(); });
    await page.waitForTimeout(80);
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('Bufferdoel');
    expect(s).toContain('de maandkeuze hierboven stuurt het niet');
    expect(s).not.toMatch(/Doel nu: .* · \d+ mnd essentiële crisis-last/);
  });

  test('zonder vast doel houdt Instellingen de oude formulering', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openBudgetEditor());
    await page.waitForTimeout(80);
    const s = await page.locator('#sheet').innerText();
    expect(s).toMatch(/mnd essentiële crisis-last/);
    expect(s).not.toContain('de maandkeuze hierboven stuurt het niet');
  });
});

test.describe('e · alle lezers zien hetzelfde getal', () => {
  test('er blijft één bron: elke plek die het doel toont volgt de override', async ({ page }) => {
    await boot(page);
    await zet(page, 12000);
    const gelijk = await page.evaluate(() => {
      const d = noodfondsModel().doel;
      // dezelfde helpers die hero, plan en mijlpaal gebruiken
      return { doel: d, viaModel: noodfondsModel().doel === d, cacheVers: (function () { save(); return noodfondsModel().doel; })() };
    });
    expect(gelijk.doel).toBe(12000);
    expect(gelijk.viaModel).toBe(true);
    expect(gelijk.cacheVers).toBe(12000);                 // ook na cache-invalidatie
  });

  // noodfondsCard() bestaat nog in de file maar wordt nergens aangeroepen sinds het noodfonds een
  // plan-item werd (zie de noot bij renderVooruit). Het scherm en de sheet zijn dus de echte lezers.
  test('het Vooruitblik-scherm en de sheet tonen hetzelfde bedrag', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { setNfDoelVast(12345); SET.vooruitDoelOpen = true; save(); go('vooruit'); renderVooruit(); });
    await page.waitForTimeout(80);
    expect(await page.locator('#s-vooruit').innerText()).toContain('12.345');
    await page.evaluate(() => openNoodfondsPanel());
    expect(await page.locator('#sheet').innerText()).toContain('12.345');
  });
});
