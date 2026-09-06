// Vooruitblik (v80): de spaardoel-hero is weg en elk doel met een looptijd noemt zijn einddatum.
// Alleen weergave — de looptijd zelf komt onveranderd uit allocatePlan()/renderGoals().
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

async function openV(page, payload) {
  await open(page, payload);
  await page.evaluate(() => go('vooruit'));
  await page.waitForSelector('#s-vooruit .card');
  if (await page.locator('#s-vooruit .plan-item').count() === 0) {
    await page.locator('#s-vooruit [data-zone="vooruitDoelOpen"]').click();
    await page.waitForSelector('#s-vooruit .plan-item');
  }
}

// de app rekent de datum zelf uit; de test vraagt hem op dezelfde manier op
const datumOver = (page, mnd) => page.evaluate((n) => etaDatum(n), mnd);

test.describe('a · de spaardoel-hero is weg', () => {
  test('geen goalring, geen "Je spaardoel" en geen losse hefboom-kop', async ({ page }) => {
    await openV(page, tweak((s) => { s.goals = [{ id: 'g1', naam: 'Vakantie', doel: 1200, perMaand: 100, gespaard: 200 }]; }));
    const v = await page.locator('#s-vooruit').innerText();
    expect(v).not.toMatch(/je spaardoel/i);
    expect(v).not.toMatch(/sneller bij je doel/i);
    expect(await page.locator('#s-vooruit .vooruit, #s-vooruit .goalring, #s-vooruit .gr-ring').count()).toBe(0);
    expect(await page.locator('#s-vooruit .vh-hef, #s-vooruit .vh-chip, #s-vooruit .vh-lbl').count()).toBe(0);
    // wat blijft: het plan zelf ("Nog deze maand" is sinds v144 alleen nog een Inzichten-kaart)
    expect(v).not.toMatch(/nog deze maand/i);
    expect(await page.locator('#s-vooruit .plan-item').count()).toBeGreaterThan(0);
  });

  // v160: vooruitForecast() bouwde de hero nog wel maar werd sinds v80 nergens aangeroepen; hij is
  // nu verwijderd. De twee functies die de vooruitblik wel gebruikt blijven bestaan.
  test('de dode hero is weg, de gebruikte functies blijven', async ({ page }) => {
    await openV(page, tweak((s) => { s.goals = []; }));
    expect(await page.evaluate(() => typeof vooruitForecast)).toBe('undefined');
    expect(await page.evaluate(() => typeof goalCoachCard)).toBe('undefined');
    expect(await page.evaluate(() => typeof coachRuleOptions)).toBe('function');
    expect(await page.evaluate(() => typeof toggleVooruitCut)).toBe('function');
  });
});

test.describe('b · einddatum per doel', () => {
  /* v193: hier stonden maanden EN de datum, en dat is hetzelfde feit twee keer - de datum is
     vandaag plus dat aantal maanden. Nu is het er een, afhankelijk van de looptijd: onder een jaar
     de maanden, daarboven de datum. De grens staat in ETA_DATUM_VANAF. */
  test('een korte looptijd toont maanden, geen datum', async ({ page }) => {
    await openV(page, tweak((s) => {
      s.goals = [{ id: 'gA', naam: 'Nieuwe laptop', doel: 1000, perMaand: 100, gespaard: 0, allocMode: 'fixed' }];
      s.planOrder = ['gA', 'noodfonds'];
    }));
    const gA = (await page.evaluate(() => allocatePlan())).find((x) => x.id === 'gA');
    expect(gA.eta).toBeGreaterThan(0);
    expect(gA.eta).toBeLessThan(await page.evaluate(() => ETA_DATUM_VANAF));

    const rij = await page.locator('#s-vooruit .plan-item[data-id="gA"]').innerText();
    expect(rij).toContain(`~${gA.eta}`);
    expect(rij).not.toMatch(/rond [a-z]{3,4} \d{4}/i);
  });

  test('een lange looptijd toont de datum, geen maanden', async ({ page }) => {
    await openV(page, tweak((s) => {
      s.goals = [{ id: 'gA', naam: 'Nieuwe keuken', doel: 12000, perMaand: 100, gespaard: 0, allocMode: 'fixed' }];
      s.planOrder = ['gA', 'noodfonds'];
    }));
    const gA = (await page.evaluate(() => allocatePlan())).find((x) => x.id === 'gA');
    expect(gA.eta).toBeGreaterThanOrEqual(await page.evaluate(() => ETA_DATUM_VANAF));

    const rij = await page.locator('#s-vooruit .plan-item[data-id="gA"]').innerText();
    expect(rij).toContain(`rond ${await datumOver(page, gA.eta)}`);
    expect(rij).toMatch(/rond [a-z]{3,4} \d{4}/i);
    expect(rij).not.toContain(`~${gA.eta} maanden`);
  });

  test('de grens ligt op een jaar en staat in een constante', async ({ page }) => {
    await openV(page, tweak(() => {}));
    const r = await page.evaluate(() => ({ grens: ETA_DATUM_VANAF,
      elf: etaTekst(11), twaalf: etaTekst(12), een: etaTekst(1), nul: etaTekst(0) }));
    expect(r.grens).toBe(12);
    expect(r.elf).toBe('~11 maanden');
    expect(r.een).toBe('~1 maand');
    expect(r.twaalf).toMatch(/^rond [a-z]{3,4} \d{4}$/i);
    expect(r.nul).toBe('');
  });

  test('een gepauzeerd of bereikt doel toont geen datum', async ({ page }) => {
    await openV(page, tweak((s) => {
      s.goals = [
        { id: 'klaar', naam: 'Al binnen', doel: 500, perMaand: 100, gespaard: 500 },
        { id: 'pauze', naam: 'Even niet', doel: 800, perMaand: 100, gespaard: 0 },
      ];
      s.planOrder = ['klaar', 'pauze', 'noodfonds'];
      s.planPaused = { pauze: true };
    }));
    expect(await page.locator('#s-vooruit .plan-item[data-id="klaar"]').innerText()).not.toMatch(/rond /);
    expect(await page.locator('#s-vooruit .plan-item[data-id="pauze"]').innerText()).not.toMatch(/rond /);
  });

  test('een doel dat op capaciteit wacht toont geen datum', async ({ page }) => {
    // het item erboven claimt de hele spaarruimte (300), dus gX krijgt niets en heeft geen looptijd
    await openV(page, tweak((s) => {
      s.goals = [
        { id: 'gBig', naam: 'Slokop', doel: 9000, perMaand: 300, gespaard: 0, allocMode: 'fixed' },
        { id: 'gX', naam: 'Ooit', doel: 900, gespaard: 0 },
      ];
      s.planOrder = ['gBig', 'gX', 'noodfonds'];
    }));
    const gX = await page.evaluate(() => allocatePlan().find((x) => x.id === 'gX'));
    expect(gX.alloc).toBe(0);
    expect(gX.status).toBe('wacht op capaciteit');
    const rij = await page.locator('#s-vooruit .plan-item[data-id="gX"]').innerText();
    expect(rij).toMatch(/wacht op capaciteit/i);
    expect(rij).not.toMatch(/rond /);
  });

  test('etaDatum rekent vanaf vandaag en zwijgt bij nul', async ({ page }) => {
    await openV(page, tweak((s) => { s.goals = []; }));
    const r = await page.evaluate(() => {
      const d = new Date(); d.setMonth(d.getMonth() + 8);
      return { acht: etaDatum(8), verwacht: d.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' }).replace('.', ''),
               nul: etaDatum(0), leeg: etaDatum(null) };
    });
    expect(r.acht).toBe(r.verwacht);
    expect(r.nul).toBe('');
    expect(r.leeg).toBe('');
  });
});
