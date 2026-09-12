// v221: per doel zag je toegewezen tegen doelbedrag en wat het per maand krijgt, maar nergens de
// optelling: wat vraagt je plan bij elkaar, wat staat daar tegenover, en wat is het verschil.
// Dit is uitdrukkelijk GEEN maandbedrag: het hoort niet in veilig-te-besteden, want daar gaat de
// maandelijkse inleg af en niet het volledige doelbedrag. safeToSpend() is niet aangeraakt.
// Afbakening: alles behalve type 'aflossen', dus het noodfonds telt MEE. Niet de v211-filter
// (type 'goal' en alloc > 0): die hoort bij maandelijkse bestemmingen en werkt hier averechts,
// want een doel dat 'wacht op capaciteit' heeft alloc 0 en dat is juist het doel waar de vraag
// over gaat. Een gepauzeerd doel telt wel in het totaal en niet in de maanden.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

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

  test('het noodfonds telt mee, anders klopt het woord totaal niet', async ({ page }) => {
    await boot(page);
    expect((await T(page)).nf).toBe(true);
    expect(await regel(page)).toContain('€21.334');
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
    expect(kk.status).toBe('wacht op capaciteit');
    // en toch zit zijn bedrag in het totaal
    expect((await T(page)).nodig).toBe(21334);
  });
});

test.describe('b - het gat afgezet tegen de tijd', () => {
  test('maanden is het gat gedeeld door de plancapaciteit', async ({ page }) => {
    await boot(page);
    const t = await T(page);
    expect(t.cap).toBe(1039);
    expect(t.mnd).toBe(Math.ceil(t.gatLopend / t.cap));
    expect(t.mnd).toBe(19);
  });

  test('de eerstvolgende streefdatum is de datum die knelt', async ({ page }) => {
    await boot(page, { goals: [
      { id: 'g1', naam: 'Later', doel: 8000, gespaard: 0, streefdatum: STREEF, allocMode: 'auto' },
      { id: 'g2', naam: 'Eerder', doel: 4000, gespaard: 0, streefdatum: VROEG, allocMode: 'auto' },
    ] });
    expect((await T(page)).eerste.naam).toBe('Eerder');
  });

  test('de regel zegt dat de maanden en de datum niet uit dezelfde verzameling komen', async ({ page }) => {
    await boot(page);
    const t = await regel(page);
    expect(t).toContain('over je hele plan gaan');
    expect(t).toContain('je noodfonds meegeteld');
    expect(t).toContain('Kosten Koper');
  });

  test('zonder enig doel met streefdatum valt de datumvergelijking weg', async ({ page }) => {
    await boot(page, { goals: [{ id: 'g1', naam: 'Geen datum', doel: 9000, gespaard: 0, allocMode: 'auto' }] });
    const t = await T(page);
    expect(t.eerste).toBe(null);
    const r = await regel(page);
    expect(r).toContain('maanden');           // het tempo blijft
    expect(r).not.toContain('streefdatum');   // de vergelijking niet
  });

  test('zonder capaciteit staat er geen tempo in plaats van een nul', async ({ page }) => {
    await boot(page, { set: { savingMode: 'amount', savingAmount: 0 } });
    const t = await T(page);
    expect(t.cap).toBe(0);
    expect(t.mnd).toBe(null);
    expect(await regel(page)).not.toContain('per maand is');
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

  test('de maanden gaan alleen over wat wel inleg krijgt', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => planTogglePause('g1'));
    const t = await T(page);
    expect(t.mnd).toBe(Math.ceil(2834 / 1039));
    expect(t.mnd).toBe(3);
  });

  test('en de regel noemt dat vóór de maanden, niet als naschrift', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => planTogglePause('g1'));
    const r = await regel(page);
    expect(r).toContain('€16.000 daarvan hoort bij een gepauzeerd doel en krijgt geen inleg');
    expect(r).toContain('de overige €2.834');
    // anders leest 'het verschil is X, op Y per maand is dat Z' als een deling die niet klopt
    expect(r.indexOf('gepauzeerd doel')).toBeLessThan(r.indexOf('per maand'));
  });

  test('een gepauzeerd doel levert ook geen streefdatum', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => planTogglePause('g1'));
    expect((await T(page)).eerste).toBe(null);
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
    expect(t.mnd).toBe(null);
    const r = await regel(page);
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
  test('onder de doelenlijst en boven de reserveringenkaart', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('vooruit'));
    const t = await page.locator('#s-vooruit').innerText();
    const lijst = t.indexOf('Kosten Koper');
    const totaal = t.indexOf('Je plan vraagt in totaal');
    const res = t.indexOf('Reserveringen');
    expect(lijst).toBeGreaterThanOrEqual(0);
    expect(totaal).toBeGreaterThan(lijst);
    expect(res).toBeGreaterThan(totaal);
  });

  test('hij blijft staan als je de doelenlijst inklapt', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.vooruitDoelOpen = false; save(); go('vooruit'); });
    const t = await page.locator('#s-vooruit').innerText();
    expect(t).toContain('Je plan vraagt in totaal');
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
