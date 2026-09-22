// v111: gemeld — "veilig te besteden" houdt rekening met wat er in je potjes gereserveerd staat,
// maar niet met het feit dat je al over je maandbudget heen bent. Oorzaak: een overschreden potje
// reserveerde nul (Math.max(bud - uitgegeven, 0)), terwijl het uitgeven de rest van de maand
// natuurlijk doorloopt. potjeRest() reserveert dan het geplande dagtempo van dat potje maal de
// resterende dagen. Dezelfde bron voor varPlanRemaining, safeToSpend én openReservedPotjes, zodat
// de drill-down het hoofdgetal niet tegenspreekt.
//
// BEDOELING OMGEDRAAID (v254), voor veilig te besteden en voor de sheet. Gemeld: de sheet zegt
// "budget dat je per categorie apart zette · nog niet uitgegeven" terwijl drie van de zes posten
// potjes waren die op zijn; die stonden er voor samen EUR 153 in en gingen af van veilig te
// besteden. Dat is een prognose en geen reservering. Sinds v254 leest safeToSpend().reserved
// varPotjesReserve() - de som van max(potje - besteed, 0) - en reserveert een leeg potje dus weer
// nul. Wat je daarna in zo'n categorie uitgeeft gaat van je vrije geld af op het moment dat je het
// uitgeeft, en dat is precies wat v111 toen niet wilde.
// WAT VAN v111 BLIJFT STAAN, en hieronder ook getoetst: potjeRest() zelf is onaangeroerd, meer
// uitgeven maakt veilig te besteden niet ruimer, en de drill-down spreekt het hoofdgetal niet
// tegen. De prognose is niet weg maar staat onder de lijst in plaats van in het totaal.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { open } = require('./budget-fixture');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now), M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));

// boodschappen-potje 500 met `uit` uitgegeven, uiteten-potje 200 met 50 uitgegeven
function seedPot({ uit = 700, saldo = null } = {}) {
  if (saldo == null) saldo = 2000 - uit;      // saldo beweegt mee, zoals in het echt
  const tx = [];
  const add = (id, m, day, amount, name, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  add('inc-' + M1, M1, '01', 3000, 'Werkgever', 'SALARIS LOON');
  add('ah-' + M1, M1, '08', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('inc-' + CUR, CUR, '01', 3000, 'Werkgever', 'SALARIS LOON');
  add('ah-' + CUR, CUR, '05', -uit, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('eet-' + CUR, CUR, '06', -50, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000, savingMode: 'amount', savingAmount: 0, budgets: { boodschappen: 500, uiteten: 200 }, manualBal: { [MAIN]: saldo } }),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

test.describe('a · de rekenregel', () => {
  test('binnen budget verandert er niets: het onbestede deel', async ({ page }) => {
    await open(page, seedPot());
    const r = await page.evaluate(() => ({
      ruim: potjeRest(500, 200, 30, 10),
      precies: potjeRest(500, 500, 30, 10),
      niets: potjeRest(500, 0, 30, 10),
    }));
    expect(r.ruim).toBe(300);
    expect(r.precies).toBe(0);
    expect(r.niets).toBe(500);
  });

  test('overschreden reserveert het geplande dagtempo maal de resterende dagen', async ({ page }) => {
    await open(page, seedPot());
    const r = await page.evaluate(() => ({
      vroeg: potjeRest(500, 700, 30, 25),      // 500/30 * 25
      laat: potjeRest(500, 700, 30, 3),        // 500/30 * 3
      eind: potjeRest(500, 700, 30, 0),        // maand voorbij
    }));
    expect(r.vroeg).toBe(417);
    expect(r.laat).toBe(50);
    expect(r.eind).toBe(0);                    // geen dagen meer, dus niets meer te reserveren
  });

  test('de reservering hangt aan je plan, niet aan hoe ver je eroverheen ging', async ({ page }) => {
    await open(page, seedPot());
    const r = await page.evaluate(() => ({
      beetjeOver: potjeRest(500, 550, 30, 10),
      veelOver: potjeRest(500, 2000, 30, 10),
    }));
    // na één grote aankoop zou het tempo van déze maand absurd projecteren; het plan is stabiel
    expect(r.beetjeOver).toBe(r.veelOver);
    expect(r.beetjeOver).toBe(167);
  });

  test('in een afgeronde maand valt alleen het overschreden potje weg', async ({ page }) => {
    await open(page, seedPot());
    const r = await page.evaluate((m) => {
      const d = daysElapsed(m), sp = catSpendMap(m), left = Math.max(d.dim - d.elapsed, 0);
      return { left, plan: varPlanRemaining(m),
        boodschappen: potjeRest(500, sp.boodschappen || 0, d.dim, left),
        uiteten: potjeRest(200, sp.uiteten || 0, d.dim, left) };
    }, M1);
    expect(r.left).toBe(0);                    // volledig verstreken maand
    // in M1 is 400 van 500 besteed: onbesteed deel telt gewoon, er is niets overschreden
    expect(r.boodschappen).toBe(100);
    expect(r.plan).toBe(r.boodschappen + r.uiteten);
    // en zou er wél overschreden zijn, dan reserveert dat niets meer: geen dagen over
    expect(await page.evaluate(() => potjeRest(500, 700, 31, 0))).toBe(0);
  });
});

test.describe('b · het gemelde geval', () => {
  /* v254: dit was "telt weer mee in veilig te besteden" met de dagtempo-reservering erin. Nu is de
     eigenschap omgekeerd: een leeg potje reserveert nul, en de overschrijding is wel nog apart
     zichtbaar via potOver en via de prognoseregel onder de sheet. */
  test('een overschreden potje reserveert nul, en de overschrijding blijft zichtbaar', async ({ page }) => {
    await open(page, seedPot());
    const r = await page.evaluate((m) => {
      const S = safeToSpend(), t = totals(m), d = daysElapsed(m), left = Math.max(d.dim - d.elapsed, 0);
      const sp = catSpendMap(m);
      return { safe: S.safe, reserved: S.reserved, potOver: S.potOver, left,
        boodschappen: potjeRest(500, sp.boodschappen || 0, d.dim, left),
        uiteten: potjeRest(200, sp.uiteten || 0, d.dim, left),
        uitetenRest: Math.max(200 - (sp.uiteten || 0), 0),
        reserveBron: varPotjesReserve(m),
        over: t.spend - t.budget };
    }, CUR);
    expect(r.over).toBeGreaterThan(0);                       // je bent over je maandbudget
    expect(r.potOver).toBe(200);                             // en 200 daarvan zit in één potje
    if (r.left > 0) {
      expect(r.boodschappen).toBeGreaterThan(0);             // potjeRest() zelf is onaangeroerd
      // maar de reservering leest hem niet meer: het lege potje draagt nul, het andere zijn restant
      expect(r.reserved).toBe(r.uitetenRest);
      expect(r.reserved).toBe(r.reserveBron);
    }
  });

  test('meer uitgeven maakt veilig te besteden niet ruimer', async ({ page }) => {
    await open(page, seedPot({ uit: 550 }));
    const weinig = await page.evaluate(() => ({ safe: safeToSpend().safe, res: safeToSpend().reserved }));
    await open(page, seedPot({ uit: 900 }));
    const veel = await page.evaluate(() => ({ safe: safeToSpend().safe, res: safeToSpend().reserved }));
    expect(veel.safe).toBeLessThan(weinig.safe);             // saldo daalt mee
    expect(veel.res).toBe(weinig.res);                       // de reservering blijft aan het plan hangen
  });
});

test.describe('c · één bron', () => {
  /* BEDOELING OMGEDRAAID (v254): tot v253 was varPlanRemaining() de enige bron, ook voor
     safeToSpend(). Dat zijn twee vragen gebleken: wat geef je bij je tempo nog uit (Inzichten), en
     wat zit er nog in je potjes (veilig te besteden en de sheet). Twee vragen, twee functies. Wat
     één bron moet blijven is de sheet tegenover veilig te besteden, en dat staat hieronder. */
  test('veilig te besteden leest de reservering, Inzichten de tempo-som', async ({ page }) => {
    await open(page, seedPot());
    const r = await page.evaluate((m) => ({ plan: varPlanRemaining(m), reserve: varPotjesReserve(m),
      safe: safeToSpend().reserved, potOver: safeToSpend().potOver,
      budget: varBudget(), gebruikt: varPotjeStand(m).gebruikt }), CUR);
    expect(r.safe).toBe(r.reserve);
    expect(r.reserve).toBeLessThan(r.plan);          // in deze fixture is een potje op
    // en de reservering is de aftrekking plus wat je erover ging: één identiteit, geen derde som
    expect(r.reserve).toBe((r.budget - r.gebruikt) + r.potOver);
  });

  test('de drill-down spreekt het hoofdgetal niet tegen', async ({ page }) => {
    await open(page, seedPot());
    await page.evaluate(() => openReservedPotjes());
    await page.waitForTimeout(80);
    const r = await page.evaluate(() => {
      const bedragen = [...document.querySelectorAll('#sheet .tx .amt')].map((e) => e.innerText);
      const kop = document.querySelector('#sheet .center div:nth-child(3)');
      return { bedragen, kop: kop ? kop.innerText : '', reserved: safeToSpend().reserved };
    });
    // de som in de kop van de sheet is hetzelfde getal als in de opbouw van veilig te besteden
    const som = r.bedragen.reduce((a, b) => a + Math.round(parseFloat(String(b).replace(/[^\d,-]/g, '').replace(',', '.')) || 0), 0);
    expect(som).toBe(r.reserved);
  });

  /* BEDOELING OMGEDRAAID (v254): de regel legde uit waarom een leeg potje toch reserveerde. Hij
     reserveert niets meer, dus de rij zegt dat, en de prognose staat als eigen regel onder de
     lijst in plaats van in het totaal. */
  test('een leeg potje staat er met nul, en de prognose staat onder de lijst', async ({ page }) => {
    await open(page, seedPot());
    const left = await page.evaluate((m) => { const d = daysElapsed(m); return d.dim - d.elapsed; }, CUR);
    await page.evaluate(() => openReservedPotjes());
    await page.waitForTimeout(80);
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('potje op');
    expect(s).not.toContain('eigen dagtempo');
    if (left > 0) expect(s).toMatch(/Bij je tempo verwacht je deze maand nog \u20ac[\d.]+ uit te geven/);
  });
});

test.describe('d · smalle mobiel', () => {
  for (const w of [360, 390]) {
    test(`de potjes-sheet past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 860 });
      await open(page, seedPot());
      await page.evaluate(() => openReservedPotjes());
      await page.waitForTimeout(80);
      const over = await page.evaluate(() => {
        const s = document.getElementById('sheet');
        return { sheet: s.scrollWidth - s.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect(over.sheet).toBeLessThanOrEqual(0);
      expect(over.doc).toBeLessThanOrEqual(0);
    });
  }
});
