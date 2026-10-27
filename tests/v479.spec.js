/* v479: KRAPPE REKENINGEN ZIJN EEN MELDING + POP-UP, GEEN KAART OP ZIEN. salTekortStand is de live stand (de één-dag-regel
   is weg): hij blijft tot alle rekeningen passen of de periode eindigt. De bel draagt EEN melding (groep "Geld op je
   rekeningen") voor alle krappe rekeningen samen; een pop-up verschijnt bij elke app-opening zolang de melding open is, tot
   je een rekening aantikt (dan opent tot v480 de bestaande uitleg, salHoeHtml). Sluiten markeert niets. Een nieuwe melding
   (+EUR 100, salTekortBewaar) wist bekeken, dus de pop-up komt terug. PUNT 4: is "Niets meer uit je spaargeld" gezet
   (SET.salGeenSpaar[acc]), dan stelt de pop-up geen spaargeld voor. Op v432-stand (16 okt 2026), met een Akkoord in september
   zodat de controlemomenten gelden (salTekortActief). GECONSTRUEERD, niet gemeten. */
const { test, expect } = require('@playwright/test');
const S = require('./v432-stand');
const { MAIN, LEEF } = S;
const boot = async (page, o) => { await page.setViewportSize({ width: 390, height: 844 }); await S.boot(page, o); };
/* een periode die met een Akkoord begon (september), zodat salTekortData vuurt */
const AKK = { salVerdeling: { op: '2026-09-24', ym: '2026-09', salYM: '2026-09', rek: { [MAIN]: 1200, [LEEF]: 850 }, opzij: 3166, plan: 280, salaris: 5216, salAcc: MAIN, start: '2026-09-24', eind: '2026-10-25', dagen: 32 } };
const popupOpen = page => page.evaluate(() => !!($('#sheetBg') && $('#sheetBg').classList.contains('show')) && !!document.querySelector('#sheet [data-krapsluit]'));

test.describe('v479 · krappe rekeningen: melding + pop-up', () => {

  test('a. Zien toont de krap-kaart niet meer; de bel draagt EEN melding in "Geld op je rekeningen"', async ({ page }) => {
    await boot(page, { set: AKK });
    await page.evaluate(() => { go('maand'); renderMaand(); try { closeSheet(); } catch (_) {} });
    /* niet op Zien */
    expect(await page.evaluate(() => document.querySelectorAll('#gripInhoud [data-saltekort]').length)).toBe(0);
    /* wel krappe rekeningen in de stand */
    expect(await page.evaluate(() => salTekortStand().length)).toBeGreaterThan(0);
    /* EEN melding voor alle krappe rekeningen samen */
    const bel = await page.evaluate(() => scoreNotifs().filter(n => n.key === 'rekgeld'));
    expect(bel.length).toBe(1);
    expect(bel[0].l1).toMatch(/wordt krap|rekeningen worden krap/);
    expect(bel[0].l2).toMatch(/Leefgeld nodig €\d+/);
    /* de bel toont de melding onder de kop "Geld op je rekeningen" */
    await page.evaluate(() => openNotifs());
    await expect(page.locator('[data-notifgroep="rekgeld"]')).toContainText('Geld op je rekeningen');
    await expect(page.locator('[data-notif="rekgeld"]')).toHaveCount(1);
    /* nooit over een andere sheet heen: met de bel open opent de pop-up niet vanzelf */
    expect(await page.evaluate(() => salKrapPopupMisschien())).toBe(false);
  });

  test('b. de melding staat er de volgende dag nog, zolang een rekening krap is (geen één-dag-regel)', async ({ page }) => {
    await boot(page, { set: AKK });
    await page.evaluate(() => { go('maand'); renderMaand(); salTekortBewaar(); try { closeSheet(); } catch (_) {} });
    /* de melding ontstond eerder (op op een dag in het verleden) */
    await page.evaluate(() => { const A = SET.salTekort, k = Object.keys(A)[0]; for (const a in A[k]) A[k][a].op = '2026-10-01'; save(); });
    /* vandaag staat hij er nog: de stand leest niet meer op===vandaag */
    expect(await page.evaluate(() => salTekortStand().length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => !!scoreNotifs().find(n => n.key === 'rekgeld'))).toBe(true);
  });

  test('c. de pop-up komt bij elke app-opening tot een tik; Sluiten laat hem terugkeren; na een tik stopt hij tot een nieuwe melding (+EUR 100)', async ({ page }) => {
    await boot(page, { set: AKK });
    await page.evaluate(() => { go('maand'); renderMaand(); try { closeSheet(); } catch (_) {} });
    /* app-opening 1: de pop-up verschijnt */
    await page.evaluate(() => salKrapPopupMisschien());
    expect(await popupOpen(page)).toBe(true);
    /* Sluiten (de knop, niet closeSheet rechtstreeks) markeert niets */
    await page.locator('[data-krapsluit]').click();
    expect(await popupOpen(page)).toBe(false);
    /* app-opening 2: hij komt terug */
    await page.evaluate(() => salKrapPopupMisschien());
    expect(await popupOpen(page)).toBe(true);
    /* een tik op een rekening opent de bestaande uitleg (salHoeHtml) en markeert bekeken */
    await page.evaluate(acc => openKrapRek(acc), LEEF);
    expect(await page.evaluate(acc => !!document.querySelector(`#sheet [data-salvhoe="${acc}"]`), LEEF)).toBe(true);
    await page.evaluate(() => closeSheet());
    /* app-opening 3: hij komt NIET meer terug */
    await page.evaluate(() => salKrapPopupMisschien());
    expect(await popupOpen(page)).toBe(false);
    /* +EUR 100: een nieuwe melding herschrijft de entry en wist bekeken, dus hij komt terug */
    await page.evaluate(acc => { const A = SET.salTekort, k = Object.keys(A)[0]; A[k][acc].tekort = (A[k][acc].tekort || 0) - 200; save(); }, LEEF);
    await page.evaluate(() => salKrapPopupMisschien());
    expect(await popupOpen(page)).toBe(true);
  });

  test('h. de keuze "Niets meer uit je spaargeld" haalt spaargeld uit de pop-up; zonder keuze blijft spaargeld een bron', async ({ page }) => {
    /* scenario A: Salarisrekening ruim boven zijn buffer, Leefgeld krap → de bron is een andere rekening */
    await boot(page, { set: Object.assign({ manualBal: { [MAIN]: 5000, [LEEF]: 1 } }, AKK) });
    await page.evaluate(() => { go('maand'); renderMaand(); try { closeSheet(); } catch (_) {} openKrapPopup(); });
    const rij = page.locator(`#salTekort [data-saltekortrij="${LEEF}"]`);
    await expect(rij).toContainText('spaargeld');
    const naam = await page.evaluate(acc => rekNaam(acc), MAIN);
    /* met de keuze: geen spaargeld, wel de andere rekening */
    await page.evaluate(acc => { SET.salGeenSpaar = { [acc]: true }; save(); closeSheet(); openKrapPopup(); }, LEEF);
    await expect(rij).not.toContainText('spaargeld');
    await expect(rij).toContainText(naam);

    /* scenario B: geen enkele andere rekening boven buffer → verlaag je uitgaven of pas je verdeling aan */
    await boot(page, { set: Object.assign({ manualBal: { [MAIN]: 1, [LEEF]: 1 }, salGeenSpaar: { [LEEF]: true } }, AKK) });
    await page.evaluate(() => { go('maand'); renderMaand(); try { closeSheet(); } catch (_) {} openKrapPopup(); });
    const rijB = page.locator(`#salTekort [data-saltekortrij="${LEEF}"]`);
    await expect(rijB).not.toContainText('spaargeld');
    await expect(rijB).toContainText('pas je verdeling aan');
    await expect(rijB.locator('[data-krapverdeling]')).toHaveCount(1);
  });
});
