/* v489: meldingen opruimen + "tot je salaris" altijd bereikbaar.
   a. Het oude incassosignaal (accountShortfalls) komt niet meer in de bel.         Sabotage: het terugzetten.
   b. Geen meldingstekst bevat een patroon als 'pot:' of 'cat:'.                     Sabotage: de sleutel tonen (meldGetalNaam terug).
   c. Na een update staat er niets onder "Cijfers" in de bel, terwijl Je cijfers de veranderingen wel toont. Sabotage: de cijfermeldingen terugzetten.
   d. Een tik op een betaalrekening in Saldo nu opent de sheet, ook als hij past.    Sabotage: alleen bij een krappe rekening. */
const { test, expect } = require('@playwright/test');
const S = require('./v489-stand');

test('a. het oude incassosignaal komt niet meer in de bel (de fixture zou het wel laten vuren)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    const short = accountShortfalls();                       // de fixture IS krap op accountShortfalls-basis
    const keys = scoreNotifs().map(n => n.key || '');
    return { shortN: short.length, accshort: keys.filter(k => /^accshort/.test(k)) };
  });
  expect(r.shortN).toBeGreaterThan(0);                       // zonder dit is de sabotage inert
  expect(r.accshort).toEqual([]);                            // sabotage: het terugzetten → een accshort-melding verschijnt
});

test('b. geen meldingstekst bevat een interne sleutel (pot:/cat:)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    SET.controles = Object.assign({}, SET.controles, { keuzeTerug: { getal: 'pot:zorg', op: Date.now() } });
    save();
    const ns = scoreNotifs();
    const kt = ns.find(n => n.key && n.key.indexOf('grip-keuzeterug-') === 0);
    return {
      bad: ns.filter(n => /pot:|cat:/.test((n.l1 || '') + ' ' + (n.l2 || ''))).map(n => n.key),
      ktl2: kt ? kt.l2 : null
    };
  });
  expect(r.ktl2).not.toBeNull();
  expect(r.ktl2).toContain('Zorg & apotheek');               // meldGetalNaam('pot:zorg') → de potjenaam
  expect(r.ktl2).not.toMatch(/pot:/);                        // sabotage: de sleutel tonen → 'pot:zorg' in de tekst
  expect(r.bad).toEqual([]);
});

test('c. na een update staat er niets onder Cijfers in de bel, Je cijfers toont de veranderingen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    SET.controles = Object.assign({}, SET.controles, { bewogen: { op: Date.now(), lijst: [{ getal: 'saldo', voor: 10083, na: 10068 }, { getal: 'pot:boodschappen', voor: 400, na: 380 }] } });
    save();
    const cijfersKeys = scoreNotifs().map(n => n.key || '').filter(k => /^cijfers/.test(k));   // sabotage: de cijfermeldingen terugzetten → niet leeg
    openNotifs();
    const groepen = [...document.querySelectorAll('#sheet [data-notifgroep]')].map(el => el.getAttribute('data-notifgroep'));
    closeSheet();
    openJeCijfers();
    const bewogen = [...document.querySelectorAll('[data-cijfersbewogen]')].map(el => ({ g: el.getAttribute('data-cijfersbewogen'), txt: el.textContent.trim() }));
    return { cijfersKeys, groepen, bewogen };
  });
  expect(r.cijfersKeys).toEqual([]);                         // niets onder Cijfers in de bel
  expect(r.groepen).not.toContain('cijfers');                // en geen groep-kop Cijfers in de bel
  expect(r.bewogen.length).toBe(2);                          // Je cijfers toont de twee veranderingen
  const saldo = r.bewogen.find(x => x.g === 'saldo');
  const pot = r.bewogen.find(x => x.g === 'pot:boodschappen');
  expect(saldo.txt).toContain('totaal saldo');               // leesbare naam, geen sleutel
  expect(pot.txt).toContain('Boodschappen');
  expect(r.bewogen.map(x => x.txt).join(' ')).not.toMatch(/pot:|cat:/);
});

test('d. een tik op een betaalrekening in Saldo nu opent de sheet, ook als hij past', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const leef = await page.evaluate((LEEF) => {
    const krap = new Set(salTekortData().map(x => x.acc));
    return { krap: [...krap].map(a => a.slice(-4)), leefKrap: krap.has(LEEF), leef: LEEF };
  }, S.LEEF);
  expect(leef.leefKrap).toBe(false);                         // LEEF past (niet krap) — "ook als hij past" is dus betekenisvol
  await page.evaluate(() => openBalances());
  const row = page.locator(`#sheet [data-saldobetaal][onclick*="${leef.leef}"]`);
  expect(await row.count()).toBe(1);                         // sabotage: alleen bij krap → LEEF krijgt geen tot-salaris-onclick
  await row.click();
  expect(await page.locator('#totSalaris').count()).toBe(1); // de sheet "tot je salaris" opent
  expect(await page.locator(`#totSalaris[data-totsalaris="${leef.leef}"]`).count()).toBe(1);
});
