// v221: per doel zag je toegewezen tegen doelbedrag en wat het per maand krijgt, maar nergens de
// optelling: wat vraagt je plan bij elkaar, wat staat daar tegenover, en wat is het verschil.
// Dit is uitdrukkelijk GEEN maandbedrag: het hoort niet in veilig-te-besteden, want daar gaat de
// maandelijkse inleg af en niet het volledige doelbedrag. safeToSpend() is niet aangeraakt.
// Afbakening: alles behalve type 'aflossen', dus het noodfonds telt MEE. Niet de v211-filter
// (type 'goal' en alloc > 0): die hoort bij maandelijkse bestemmingen en werkt hier averechts,
// want een doel dat 'wacht op capaciteit' heeft alloc 0 en dat is juist het doel waar de vraag
// over gaat. Een gepauzeerd doel telt wel in het totaal en niet in de maanden.
// v317: DE REGEL LEEST DE PROJECTIE EN REKENT NIET ZELF. De alinea deed `ceil(gatLopend/cap)` plus
// de eerstvolgende streefdatum, en dat was de DERDE telling over dezelfde vraag naast het datumpaar
// in elk vat (dat sinds v307 `planVooruit()` leest). Blok b meet nu de projectie, en het geval dat
// de twee onderscheidt staat erbij: met een aflos-item in het plan is de VLAKKE deling te
// optimistisch, want die deelt door de hele plancapaciteit terwijl de schuld er elke maand een deel
// van opeet.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const STREEF = ym(new Date(now.getFullYear() + 1, now.getMonth() + 10, 1));
const VROEG = ym(new Date(now.getFullYear() + 1, now.getMonth() + 2, 1));

function seed(o) {
  o = o || {};
  const tx = [
    { id: 'i1', date: CUR + '-05', amount: 4000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
    { id: 'h1', date: CUR + '-02', amount: -1200, acc: MAIN, name: 'Woningcorporatie', desc: 'SEPA INCASSO HUURBETALING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
    { id: 's1', date: CUR + '-26', amount: 1039, acc: SPAAR, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
  ];
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: o.mode || 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 3000, [SPAAR]: 2500 },
    budgets: { huur: 1200 },
    savingMode: 'amount', savingAmount: 1039,
    savingsAcc: { [SPAAR]: true },
    nfDoelVast: 5334, nfToegewezen: 2500, nfToegewezenMigrated: true,
    goals: o.goals !== undefined ? o.goals : [
      { id: 'g1', naam: 'Kosten Koper', doel: 16000, gespaard: 0, streefdatum: STREEF, allocMode: 'auto' },
    ],
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planTotaal === 'function');
}
const T = (page) => page.evaluate(() => planTotaal());
const K = (page) => page.evaluate(() => planKlaarMaand());
const regel = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = planTotaalRegel();
  return d.textContent.replace(/\s+/g, ' ').trim();
});

test.describe('a - de optelling telt op', () => {
  test('nodig min toegewezen is het verschil, en dat is de som van de resten', async ({ page }) => {
    await boot(page);
    const t = await T(page);
    expect(t.nodig).toBe(21334);      // 5.334 noodfonds + 16.000 doel
    expect(t.toe).toBe(2500);
    expect(t.gat).toBe(18834);
    expect(t.nodig - t.toe).toBe(t.gat);
  });

  test('de bedragen komen uit allocatePlan, niet uit een tweede som', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const P = allocatePlan().filter((p) => p.type !== 'aflossen');
      return { doel: P.reduce((a, p) => a + p.doel, 0), gesp: P.reduce((a, p) => a + p.gespaard, 0),
        rest: P.reduce((a, p) => a + p.rest, 0), T: planTotaal() };
    });
    expect(uit.T.nodig).toBe(uit.doel);
    expect(uit.T.toe).toBe(uit.gesp);
    expect(uit.T.gat).toBe(uit.rest);
  });

  /* v317: de regel noemde het TOTAAL (nodig) en doet dat niet meer; wat hij noemt is wat er nog te
     gaan is. Dat het noodfonds in de sommen MEEtelt blijft de eigenschap, en die is nu aan het
     verschil af te lezen: zonder het noodfonds zou `gatLopend` 16.000 zijn in plaats van 18.834. */
  test('het noodfonds telt mee, anders klopt de optelling niet', async ({ page }) => {
    await boot(page);
    expect((await T(page)).nf).toBe(true);
    expect((await T(page)).gatLopend).toBe(18834);
    expect(await regel(page)).toContain('€18.834');
    expect(await regel(page)).not.toContain('€21.334');
  });

  test('een aflos-item telt niet mee: schuld is een andere vraag', async ({ page }) => {
    await boot(page, { set: {
      debts: [{ id: 'd1', naam: 'Lening', rest: 8000, start: 12000, perMaand: 200, rente: 4, type: 'lening' }],
      planOrder: ['noodfonds', 'g1', 'af:d1'],
    } });
    const heeft = await page.evaluate(() => allocatePlan().some((p) => p.type === 'aflossen'));
    expect(heeft).toBe(true);
    expect((await T(page)).nodig).toBe(21334);   // ongewijzigd
  });

  test('de v211-filter zou juist het doel wegfilteren waar dit over gaat', async ({ page }) => {
    await boot(page);
    // Kosten Koper krijgt niets omdat het noodfonds de capaciteit pakt
    const kk = await page.evaluate(() => allocatePlan().find((p) => p.id === 'g1'));
    expect(kk.alloc).toBe(0);
    // v242: de buffer van deze fixture is niet vol, dus de grendel houdt dit doel tegen
    expect(kk.status).toBe('wacht op de buffer');
    // en toch zit zijn bedrag in het totaal
    expect((await T(page)).nodig).toBe(21334);
  });
});

test.describe('b - de maand komt uit de projectie', () => {
  /* De invoer eerst: deze fixture IS het tegenvoorbeeld dat de ronde vroeg. Kosten Koper wacht op
     de buffer, dus zijn vat draagt helemaal GEEN vol-datum, en de regel noemt er wel een. Dat is
     precies wat de regel toevoegt aan wat de vaten zeggen. */
  test('de invoer: het doel wacht op de buffer en heeft dus zelf geen vol-datum', async ({ page }) => {
    await boot(page);
    const kk = await page.evaluate(() => allocatePlan().find((p) => p.id === 'g1'));
    expect(kk.status).toBe('wacht op de buffer');
    expect(kk.alloc).toBe(0);
    expect(kk.eta).toBe(null);
    const vat = await page.evaluate(() => vatRegels(allocatePlan().find((p) => p.id === 'g1')).regels.join(' | '));
    expect(vat).not.toMatch(/vol in/);
  });

  test('en de projectie plaatst hem toch, want de grendel gaat erin open', async ({ page }) => {
    await boot(page);
    const k = await K(page);
    expect(k.laatste.id).toBe('g1');
    expect(k.laatste.maand).toBe(19);
    expect(k.zonder).toEqual([]);
    expect(k.mee).toBe(2);
    // en de regel drukt diezelfde maand af, via etaDatum()
    const lbl = await page.evaluate(() => etaDatum(19));
    expect(await regel(page)).toContain(`vol in ${lbl}`);
  });

  test('de maand is de LAATSTE van de projectie en niet de eerste', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ vol: planVooruit(), k: planKlaarMaand() }));
    expect(r.vol.noodfonds).toBe(3);                 // de buffer is er eerder
    expect(r.k.laatste.maand).toBe(Math.max(...Object.values(r.vol)));
  });

  /* HET GEVAL DAT DE PROJECTIE VAN DE VLAKKE DELING ONDERSCHEIDT. `planTotaal()` laat een aflos-item
     uit het gat (schuld is een andere vraag), maar de capaciteit die de oude deling gebruikte was de
     HELE plancapaciteit, terwijl die schuld er elke maand een deel van opeet en zijn alloc volgens
     v307 voor altijd houdt. De vlakke deling leest daardoor te optimistisch; de projectie niet.
     Zonder dit geval is "hij leest de projectie" niet van "hij deelt het gat door de capaciteit" te
     onderscheiden (meetles a). */
  test('met een aflos-item loopt de projectie uiteen met de vlakke deling', async ({ page }) => {
    /* DE BUFFER MOET VOL ZIJN, anders pakt de grendel de hele inleg en krijgt de schuld nul: dan is
       de stand niet die waarop de twee vormen uiteenlopen (meetles a). */
    await boot(page, { set: {
      nfToegewezen: 5334,
      debts: [{ id: 'd1', naam: 'Lening', rest: 8000, start: 12000, perMaand: 0, rente: 4, type: 'lening' }],
      planOrder: ['noodfonds', 'af:d1', 'g1'],
      planAlloc: { 'af:d1': { mode: 'fixed', perMaand: 300 } },
    } });
    expect(await page.evaluate(() => planGrendel())).toBe(null);
    const r = await page.evaluate(() => ({
      alloc: Object.fromEntries(allocatePlan().map((p) => [p.id, p.alloc])),
      cap: planCapacity(), T: planTotaal(), k: planKlaarMaand() }));
    expect(r.alloc['af:d1']).toBe(300);                       // de schuld pakt elke maand 300
    const vlak = Math.ceil(r.T.gatLopend / r.cap);            // de oude vorm
    expect(r.k.laatste.maand).toBeGreaterThan(vlak);          // en de projectie is langzamer
    const lbl = await page.evaluate((m) => etaDatum(m), r.k.laatste.maand);
    expect(await regel(page)).toContain(`vol in ${lbl}`);
    expect(await regel(page)).not.toContain(await page.evaluate((m) => etaDatum(m), vlak));
  });

  test('zonder capaciteit staat er geen maand in plaats van een verzonnen tempo', async ({ page }) => {
    await boot(page, { set: { savingMode: 'amount', savingAmount: 0 } });
    const k = await K(page);
    expect(k.laatste).toBe(null);
    expect(k.zonder.length).toBeGreaterThan(0);
    const r = await regel(page);
    expect(r).not.toContain('vol in');
    expect(r).toContain('valt niet te zeggen wanneer het vol is');
  });

  /* v317: de streefdatum-zin is vervallen. Die bestond alleen om uit te leggen dat de maanden over
     het hele plan gingen en de datum bij EEN doel hoorde; met een echte vol-maand is er geen
     verwarring om weg te schrijven, en de streefdatum per doel staat in het datumpaar van dat doel. */
  test('de regel noemt geen streefdatum van een los doel meer', async ({ page }) => {
    await boot(page, { goals: [
      { id: 'g1', naam: 'Later', doel: 8000, gespaard: 0, streefdatum: STREEF, allocMode: 'auto' },
      { id: 'g2', naam: 'Eerder', doel: 4000, gespaard: 0, streefdatum: VROEG, allocMode: 'auto' },
    ] });
    const r = await regel(page);
    expect(r).not.toContain('streefdatum');
    expect(r).not.toContain('Eerder');
    expect(r).not.toContain('over je hele plan gaan');
  });

  /* De regel is EEN regel. De oude alinea was vijf zinnen; dit houdt vast dat er niet stilletjes
     weer een vierde bij komt. */
  test('het is een regel en geen alinea', async ({ page }) => {
    await boot(page);
    const r = await regel(page);
    expect(r.split('.').filter((x) => x.trim()).length).toBeLessThanOrEqual(2);
    expect(r.length).toBeLessThan(140);
  });
});

test.describe('c - een gepauzeerd doel telt wel in het totaal en niet in de maanden', () => {
  test('het bedrag blijft in het verschil staan', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => planTogglePause('g1'));
    const t = await T(page);
    expect(t.gat).toBe(18834);
    expect(t.gatPauze).toBe(16000);
    expect(t.gatLopend).toBe(2834);
  });

  test('de maand gaat alleen over wat wel inleg krijgt', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => planTogglePause('g1'));
    const k = await K(page);
    expect(k.mee).toBe(1);                   // alleen het noodfonds doet mee
    expect(k.laatste.id).toBe('noodfonds');
    expect(k.laatste.maand).toBe(3);
    expect(k.zonder).toEqual([]);            // een gepauzeerd doel staat niet in de lijst zonder maand
  });

  test('en de regel noemt het gepauzeerde bedrag apart, want het zit niet in de maand', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => planTogglePause('g1'));
    const r = await regel(page);
    expect(r).toContain('€2.834');                                   // wat er wel inleg krijgt
    expect(r).toContain('€16.000 hoort bij een gepauzeerd doel en krijgt geen inleg');
    expect(r).toContain('dat zit hier niet in');
  });
});

test.describe('d - de randen', () => {
  test('geen doelen: geen regel', async ({ page }) => {
    await boot(page, { goals: [] });
    expect(await T(page)).toBe(null);
    expect(await regel(page)).toBe('');
  });

  test('een bereikt doel telt in beide sommen en laat het verschil met rust', async ({ page }) => {
    await boot(page, { goals: [
      { id: 'g1', naam: 'Kosten Koper', doel: 16000, gespaard: 0, streefdatum: STREEF, allocMode: 'auto' },
      { id: 'g2', naam: 'Klaar', doel: 1000, gespaard: 1000, allocMode: 'auto' },
    ] });
    const t = await T(page);
    expect(t.nodig).toBe(22334);
    expect(t.toe).toBe(3500);
    expect(t.gat).toBe(18834);   // ongewijzigd tegenover zonder dat doel
  });

  test('alles bereikt: het verschil is nul en er staat geen felicitatie', async ({ page }) => {
    await boot(page, { goals: [{ id: 'g1', naam: 'Klaar', doel: 1000, gespaard: 1000, allocMode: 'auto' }],
      set: { nfDoelVast: 2000, nfToegewezen: 2000 } });
    const t = await T(page);
    expect(t.gat).toBe(0);
    const k = await K(page);
    expect(k.mee).toBe(0);          // niets doet mee, dus geen maand en geen 'valt niet te zeggen'
    expect(k.laatste).toBe(null);
    const r = await regel(page);
    expect(r).not.toContain('vol in');
    expect(r).not.toContain('valt niet te zeggen');
    expect(r).toContain('€0');
    for (const w of ['goed bezig', 'gefeliciteerd', 'knap', 'mooi']) expect(r.toLowerCase()).not.toContain(w);
  });
});

test.describe('e - een constatering, geen oordeel', () => {
  test('geen kleur die dit als probleem markeert', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => planTotaalRegel());
    expect(h).toContain('mut2');
    expect(h).not.toContain('--amber');
    expect(h).not.toContain('--red');
    expect(h).not.toContain('warn');
  });

  test('geen advies en geen aanmoediging', async ({ page }) => {
    await boot(page);
    const r = (await regel(page)).toLowerCase();
    for (const w of ['zet meer', 'verhoog', 'probeer', 'zou je', 'tip', 'advies', 'lukt het']) {
      expect(r, w).not.toContain(w);
    }
  });

  test('geen ingang die iets van je vraagt', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => planTotaalRegel());
    expect(h).not.toContain('onclick');
  });

  test('in rustig staat een korte vorm', async ({ page }) => {
    await boot(page, { mode: 'rustig' });
    const r = await regel(page);
    expect(r).toContain('€18.834');
    expect(r.length).toBeLessThan(60);
  });
});

test.describe('f - plaatsing en veilig-te-besteden', () => {
  test('onder de doelenlijst, en Plan draagt geen reserveringen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('vooruit'));
    const t = await page.locator('#s-vooruit').innerText();
    const lijst = t.indexOf('Kosten Koper');
    const totaal = t.indexOf('te gaan, en op deze verdeling');
    expect(lijst).toBeGreaterThanOrEqual(0);
    expect(totaal).toBeGreaterThan(lijst);
    expect(t).not.toContain('Reserveringen');   // v344
  });

  test('hij blijft staan als je de doelenlijst inklapt', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.vooruitDoelOpen = false; save(); go('vooruit'); });
    const t = await page.locator('#s-vooruit').innerText();
    expect(t).toContain('te gaan, en op deze verdeling');
  });

  test('KRITIEK: veilig te besteden is niet geraakt door het doelbedrag', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => safeToSpend().safe);
    // een doel tien keer zo groot maken mag veilig-te-besteden niet bewegen
    await page.evaluate(() => { SET.goals[0].doel = 160000; save(); });
    const na = await page.evaluate(() => safeToSpend().safe);
    expect(na).toBe(voor);
  });
});

test.describe('g - layout', () => {
  for (const w of [360, 390]) {
    test(`Plan past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      await page.evaluate(() => go('vooruit'));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
