// v74: persoonlijker coach — doel-first opening op je plan-#1, onderwerpenmenu,
// en een coach-wissel die ook de toon verandert (ook zonder AI-laag).
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

// plan-#1 is een eigen doel, zodat we zien dat de coach niet meer 'buffer' hardcodeert
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
const draad = (page) => page.locator('#coThr').innerText();
const wachtKeuze = (page, txt) => page.waitForFunction(
  (t) => [...document.querySelectorAll('#coCh .cch')].some((b) => b.innerText.indexOf(t) >= 0), txt, { timeout: 15000 });
async function kies(page, txt) {
  await wachtKeuze(page, txt);
  await page.locator('#coCh .cch', { hasText: txt }).first().click();
}
const keuzes = (page) => page.evaluate(() => [...document.querySelectorAll('#coCh .cch')].map((b) => b.innerText.replace(/\s*›\s*$/, '').trim()));

test.describe('a · doel-first opening', () => {
  test('vraagt waar je naartoe werkt en toont je plan-#1, niet automatisch de buffer', async ({ page }) => {
    await coach(page);
    await wachtKeuze(page, 'Kosten koper huis');
    expect(await draad(page)).toMatch(/waar werk je/i);

    const ks = await keuzes(page);
    expect(ks.some((k) => k.indexOf('Kosten koper huis') === 0)).toBe(true);
    expect(ks.some((k) => /€12\.000/.test(k))).toBe(true);
    expect(ks).toContain('Weet ik nog niet');
    expect((await draad(page)).toLowerCase()).not.toContain('buffer');

    // het doel komt uit de plan-laag
    expect(await page.evaluate(() => coachDoel().id)).toBe('gA');
    expect(await page.evaluate(() => coachDoel().naam)).toBe('Kosten koper huis');
  });

  test('valt terug op savingsModel als er geen plan-doel is', async ({ page }) => {
    await coach(page, tweak((s) => { s.goals = []; s.planPaused = { noodfonds: true }; }));
    const D = await page.evaluate(() => coachDoel());
    expect(D).not.toBeNull();
    expect(D.bedrag).toBeGreaterThan(0);
  });

  test('vraagt het doel niet elke sessie opnieuw', async ({ page }) => {
    await coach(page);
    await kies(page, 'Kosten koper huis');
    await wachtKeuze(page, 'Bespaartips');
    expect(await page.evaluate(() => SET.coachGoalConfirmed)).toBe('gA');

    await page.evaluate(() => { go('ins'); go('act'); startCoachTalk(months()[months().length - 1]); });
    await wachtKeuze(page, 'Bespaartips');                       // direct het menu
    const d = await draad(page);
    expect(d).not.toMatch(/waar werk je/i);
    expect(d).toContain('Je werkt aan');
    expect(d).toContain('Kosten koper huis');
  });

  test('"weet ik nog niet" forceert geen doel en start zacht', async ({ page }) => {
    await coach(page);
    await kies(page, 'Weet ik nog niet');
    // wacht tot het onderwerp echt gestart is (de coSay ervoor loopt asynchroon)
    await page.waitForFunction(() => SET.coachTopic === 'potjes', null, { timeout: 15000 });
    expect(await page.evaluate(() => SET.coachGoalConfirmed)).toBe('onbekend');
    expect(await draad(page)).toMatch(/potjes/i);
  });
});

test.describe('b · onderwerpenmenu', () => {
  const naarMenu = async (page, payload) => {
    await coach(page, payload);
    await kies(page, 'Kosten koper huis');
    await wachtKeuze(page, 'Bespaartips');
  };

  test('toont vier onderwerpen plus een eigen uitgang', async ({ page }) => {
    await naarMenu(page);
    const ks = await keuzes(page);
    expect(ks).toContain('Bespaartips');
    expect(ks).toContain('Budget & potjes');
    expect(ks).toContain('Vaste lasten & abonnementen');
    expect(ks).toContain('Grip op impulsen');
    expect(ks.some((k) => /naar mijn cijfers/i.test(k))).toBe(true);
    expect(ks.some((k) => /schuld/i.test(k))).toBe(false);        // geen dure schuld in deze fixture
  });

  test('Schuld aflossen verschijnt alleen bij dure schuld', async ({ page }) => {
    await naarMenu(page, metDoel((s) => { s.debts = [{ id: 'd1', naam: 'Creditcard', type: 'lening', rest: 2000, perMaand: 50, rente: 14 }]; }));
    expect(await keuzes(page)).toContain('Schuld aflossen');

    // goedkope schuld telt niet
    await naarMenu(page, metDoel((s) => { s.debts = [{ id: 'd2', naam: 'Studieschuld', type: 'lening', rest: 9000, perMaand: 80, rente: 2 }]; }));
    expect((await keuzes(page)).some((k) => /schuld/i.test(k))).toBe(false);
  });

  test('elk onderwerp routeert en is te verlaten', async ({ page }) => {
    for (const [onderwerp, verwacht] of [
      ['Bespaartips', /bespaartip|kunnen|kiest zelf/i],
      ['Budget & potjes', /potje|lek|budget/i],
      ['Vaste lasten & abonnementen', /abonnement|vaste posten/i],
      ['Grip op impulsen', /patroon|koopcheck/i],
    ]) {
      await naarMenu(page);
      await kies(page, onderwerp);
      await page.waitForFunction(() => document.querySelectorAll('#coCh .cch').length > 0, null, { timeout: 15000 });
      expect(await draad(page), onderwerp).toMatch(verwacht);
      expect(await page.evaluate(() => SET.coachTopic), onderwerp).toBeTruthy();
      expect((await keuzes(page)).some((k) => /terug naar de onderwerpen/i.test(k)), onderwerp).toBe(true);

      await kies(page, 'Terug naar de onderwerpen');             // skipbaar
      await wachtKeuze(page, 'Bespaartips');
    }
  });

  test('de bestaande afspraak-staat blijft voorgaan', async ({ page }) => {
    await coach(page, metDoel((s) => { s.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'ik zet €150 apart voor uit eten' }]; }));
    await wachtKeuze(page, 'Afspraak aanpassen');                 // pas ná beide bubbels
    expect(await draad(page)).toMatch(/afspraak voor deze maand staat al/i);
    expect(await draad(page)).toContain('ik zet €150 apart voor uit eten');
  });
});

test.describe('c · toon-wissel werkt zonder AI-laag', () => {
  test('opening, stakes en afsluiter verschillen per toon', async ({ page }) => {
    await open(page, metDoel());
    const r = await page.evaluate(() => {
      const leak = { cat: 'uiteten', kind: 'over-budget', amount: 120, name: 'Restaurant' };
      const uit = {};
      for (const t of ['direct', 'zacht', 'zakelijk']) {
        SET.coachTone = t;
        uit[t] = { groet: coTone('groet', 'Vincent'), stakes: coLekHTML(leak, 120, 300, null), slot: coTone('slot'), vraag: coTone('doelVraag') };
      }
      SET.coachTone = 'direct';
      return uit;
    });
    expect(r.direct.groet).not.toBe(r.zacht.groet);
    expect(r.zacht.groet).not.toBe(r.zakelijk.groet);
    expect(r.zacht.groet).toMatch(/fijn dat je kijkt/i);
    expect(r.zakelijk.groet).not.toMatch(/hey/i);
    expect(r.direct.stakes).not.toBe(r.zacht.stakes);
    expect(r.zacht.slot).not.toBe('');                            // zacht sluit geruststellend af
    expect(r.zakelijk.slot).toBe('');
    expect(r.direct.slot).toBe('');
  });

  test('de cijfers zijn in elke toon identiek', async ({ page }) => {
    await open(page, metDoel());
    const bedragen = await page.evaluate(() => {
      const leak = { cat: 'uiteten', kind: 'over-budget', amount: 120, name: 'Restaurant' };
      const uit = {};
      for (const t of ['direct', 'zacht', 'zakelijk']) { SET.coachTone = t; uit[t] = coAmounts(coStripTags(coLekHTML(leak, 120, 300, null))); }
      SET.coachTone = 'direct';
      return uit;
    });
    expect(bedragen.zacht).toEqual(bedragen.direct);
    expect(bedragen.zakelijk).toEqual(bedragen.direct);
    expect(bedragen.direct.length).toBeGreaterThan(0);
  });

  test('de AI-laag krijgt per toon een eigen voice', async ({ page }) => {
    await open(page, metDoel());
    const r = await page.evaluate(() => ({
      d: coachVoice('direct'), z: coachVoice('zacht'), b: coachVoice('zakelijk'),
      gebruikt: coachAI.toString().indexOf('coachVoice(') >= 0,
      standaard: (SET.coachTone === undefined) && coachTone(),
    }));
    expect(r.d).not.toBe(r.z);
    expect(r.d).not.toBe(r.b);
    expect(r.z).toMatch(/geruststellend|warm/i);
    expect(r.b).toMatch(/minimaal|cijfers eerst/i);
    expect(r.d).toContain('Behoud ALLE bedragen');                // harde regel blijft in elke voice
    expect(r.z).toContain('Behoud ALLE bedragen');
    expect(r.b).toContain('Behoud ALLE bedragen');
    expect(r.gebruikt).toBe(true);
    expect(r.standaard).toBe('direct');                           // default = huidig gedrag
  });

  test('de coach-sheet biedt de toon-keuze en belooft niet meer "alleen uiterlijk"', async ({ page }) => {
    await open(page, metDoel());
    await page.evaluate(() => openCoachAvatar());
    await page.waitForSelector('#coachToneChips');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).not.toMatch(/alleen het uiterlijk verandert/i);
    expect(sheet).toMatch(/hoe je coach klinkt/i);
    expect(await page.locator('#coachToneChips .chip').count()).toBe(3);
    expect(await page.locator('#coachToneChips .chip.on').innerText()).toBe('Direct');

    await page.locator('#coachToneChips .chip', { hasText: 'Zacht' }).click();
    await page.waitForFunction(() => SET.coachTone === 'zacht');
    expect(await page.locator('#coachToneVb').innerText()).toMatch(/fijn dat je kijkt/i);
    expect(await page.locator('#coachToneChips .chip.on').innerText()).toBe('Zacht');
  });

  test('de gekozen toon is te horen in het echte gesprek', async ({ page }) => {
    await coach(page, metDoel((s) => { s.coachTone = 'zacht'; }));
    await wachtKeuze(page, 'Kosten koper huis');
    expect(await draad(page)).toMatch(/fijn dat je kijkt/i);
    expect(await page.evaluate(() => SET.aiCoach)).toBeFalsy();   // aantoonbaar zonder AI-laag
  });
});
