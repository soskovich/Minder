// v217: de over-helft is terug. v172 haalde spaarOver() c.s. weg met de redenering dat de som het
// saldo alleen nog kan overschrijden als je zelf te veel toewijst, en dat spaarVrijToe() dat
// tegenhoudt. Die redenering keek alleen naar de invoerkant. In model B ligt een toewijzing per
// ontwerp stil en beweegt je SALDO: neem je geld op, of legt migrateNfToegewezen() de toewijzing
// vast op een moment dat er meer stond, dan ontstaat het verschil zonder dat jij iets doet.
// Gemeten geval: noodfonds op 3.050 toegewezen bij 2.500 op de rekening, en niets dat er iets over
// zei, want spaarVrij() klemt het tekort weg op nul.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '25', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('s' + m, SPAAR, m, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000, [SPAAR]: o.saldo != null ? o.saldo : 2500 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 3000,
    savingsAcc: { [SPAAR]: true },
    nfDoelVast: 10000,
    goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 30000, gespaard: 0, mode: 'fixed', perMaand: 500 }],
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof spaarOver === 'function');
}
// het gemeten geval: de toewijzing staat vast op een hoger bedrag dan er nu op de rekening staat
const GEMETEN = { set: { nfToegewezen: 3050, nfToegewezenMigrated: 1 }, saldo: 2500 };

const over = (page) => page.evaluate(() => spaarOver());
const vrij = (page) => page.evaluate(() => spaarVrij());
const regel = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = spaarOverLine(allocatePlan());
  return d.textContent.replace(/\s+/g, ' ').trim();
});
const stand = (page) => page.evaluate(() => ({
  nf: Math.max(Math.round(+SET.nfToegewezen || 0), 0),
  goals: (SET.goals || []).map((g) => ({ naam: g.naam, gespaard: g.gespaard })),
}));

test.describe('a - KRITIEK: het verschil ontstaat zonder dat je iets doet', () => {
  test('een toewijzing blijft staan terwijl het saldo zakt', async ({ page }) => {
    // de migratie legt de toewijzing vast op het saldo van dat moment
    await boot(page, { saldo: 3050 });
    expect((await stand(page)).nf).toBe(3050);
    expect(await page.evaluate(() => SET.nfToegewezenMigrated)).toBe(1);
    // daarna zakt het saldo, en de toewijzing beweegt niet mee
    await page.evaluate(() => { SET.manualBal['NL01SAVE0000004323'] = 2500; save(); });
    expect((await stand(page)).nf).toBe(3050);
    expect((await over(page)).over).toBe(550);
  });

  test('spaarVrij klemt het tekort weg, dus die helft kan het niet melden', async ({ page }) => {
    await boot(page, GEMETEN);
    const V = await vrij(page);
    expect(V.vrij).toBe(0);
    expect(V.toegewezen).toBe(3050);
    expect(V.saved).toBe(2500);
  });

  test('en nu zegt de over-helft het wel', async ({ page }) => {
    await boot(page, GEMETEN);
    const t = await regel(page);
    expect(t).toContain('€3.050');
    expect(t).toContain('€2.500');
    expect(t).toContain('€550');
  });
});

test.describe('b - vrij en over zijn hetzelfde verschil, andere kant van nul', () => {
  test('ze kunnen nooit allebei positief zijn', async ({ page }) => {
    await boot(page, GEMETEN);
    for (const saldo of [0, 1000, 2500, 3050, 5000, 20000]) {
      const r = await page.evaluate((b) => {
        SET.manualBal['NL01SAVE0000004323'] = b; save();
        return { vrij: spaarVrij().vrij, over: spaarOver().over };
      }, saldo);
      expect(Math.min(r.vrij, r.over)).toBe(0);
    }
  });

  test('over telt exact op met vrij tot het verschil', async ({ page }) => {
    await boot(page, GEMETEN);
    const V = await vrij(page); const O = await over(page);
    expect(O.over - V.vrij).toBe(V.toegewezen - V.saved);
  });

  /* De rekening expliciet uitzetten, niet alleen weglaten: zonder keuze herkent isSavingsAcc()
     hem alsnog aan de boekingen, en dan is het saldo gewoon bekend. */
  test('zonder bekend spaarsaldo meldt de over-helft niets', async ({ page }) => {
    await boot(page, { set: { savingsAcc: { [SPAAR]: false }, nfToegewezen: 3050, nfToegewezenMigrated: 1 } });
    expect(await page.evaluate(() => spaarSaldo().missing)).toBe(true);
    expect((await over(page)).over).toBe(0);
    expect(await regel(page)).toBe('');
  });
});

test.describe('c - de volgorde is van onder naar boven, het noodfonds als laatste', () => {
  const METDOELEN = {
    saldo: 2500,
    set: {
      nfToegewezen: 2000, nfToegewezenMigrated: 1,
      goals: [
        { id: 'g1', naam: 'Kosten Koper', doel: 30000, gespaard: 800, mode: 'fixed', perMaand: 500 },
        { id: 'g2', naam: 'Vakantie', doel: 3000, gespaard: 400, mode: 'fixed', perMaand: 100 },
      ],
    },
  };

  test('de onderste staat vooraan in de rij', async ({ page }) => {
    await boot(page, METDOELEN);
    const items = await page.evaluate(() => spaarOverItems().map((x) => x.naam));
    expect(items[items.length - 1]).toBe('Noodfonds');
    expect(items[0]).toBe('Vakantie');
  });

  test('doelen leveren eerst in en het noodfonds blijft ongemoeid als het past', async ({ page }) => {
    await boot(page, METDOELEN);
    expect((await over(page)).over).toBe(700);
    await page.evaluate(() => spaarOverAf());
    const na = await stand(page);
    expect(na.nf).toBe(2000);                                    // niet aangeraakt
    expect(na.goals.find((g) => g.naam === 'Vakantie').gespaard).toBe(0);      // helemaal
    expect(na.goals.find((g) => g.naam === 'Kosten Koper').gespaard).toBe(500); // en de rest hier
    expect((await over(page)).over).toBe(0);
  });

  test('een aflos-item levert nooit in: die voortgang komt uit de restschuld', async ({ page }) => {
    await boot(page, {
      saldo: 2500,
      set: {
        nfToegewezen: 3050, nfToegewezenMigrated: 1,
        debts: [{ id: 'd1', naam: 'Lening', rest: 2000, start: 5000, perMaand: 100, rente: 3, type: 'lening' }],
        planOrder: ['noodfonds', 'g1', 'af:d1'],
      },
    });
    const items = await page.evaluate(() => spaarOverItems().map((x) => x.type));
    expect(items).not.toContain('aflossen');
  });
});

test.describe('d - de correctie kan het noodfonds verlagen, want anders doet de knop niets', () => {
  test('staan de doelen op nul, dan gaat het van het noodfonds af', async ({ page }) => {
    await boot(page, GEMETEN);
    await page.evaluate(() => spaarOverAf());
    const na = await stand(page);
    expect(na.nf).toBe(2500);
    expect((await over(page)).over).toBe(0);
    expect((await vrij(page)).vrij).toBe(0);
  });

  test('en de melding zegt dat vooraf, met de reden', async ({ page }) => {
    await boot(page, GEMETEN);
    const t = await regel(page);
    expect(t).toContain('van je noodfonds af');
    expect(t).toContain('bij je doelen niets toegewezen');
    // en niet de zin over doelen die eerst inleveren, want die zouden hier niets doen
    expect(t).not.toContain('Je doelen leveren eerst in');
  });

  test('zijn er wél doelen die inleveren, dan staat die zin er juist wel', async ({ page }) => {
    await boot(page, {
      saldo: 1000,
      set: {
        nfToegewezen: 2000, nfToegewezenMigrated: 1,
        goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 30000, gespaard: 800, mode: 'fixed', perMaand: 500 }],
      },
    });
    const t = await regel(page);
    expect(t).toContain('Je doelen leveren eerst in en je noodfonds als laatste');
  });

  test('na de correctie is de melding weg', async ({ page }) => {
    await boot(page, GEMETEN);
    expect(await regel(page)).not.toBe('');
    await page.evaluate(() => spaarOverAf());
    expect(await regel(page)).toBe('');
  });

  test('past alles, dan staat er niets', async ({ page }) => {
    await boot(page, { saldo: 20000, set: { nfToegewezen: 3050, nfToegewezenMigrated: 1 } });
    expect((await over(page)).over).toBe(0);
    expect(await regel(page)).toBe('');
  });
});

test.describe('e - de melding is een correctie en geen alarm', () => {
  test('mut en niet amber, want er is niets mis met je geld', async ({ page }) => {
    await boot(page, GEMETEN);
    const html = await page.evaluate(() => spaarOverLine(allocatePlan()));
    expect(html).toContain('var(--mut)');
    expect(html).not.toContain('--amber');
    expect(html).not.toContain('warn');
  });

  /* Hij hangt aan renderPlan() zelf en niet aan een plan-rij, dus hij blijft staan ook als het
     noodfonds gepauzeerd, bereikt of uit het plan is. Dat was de reden dat v126 deze regels ooit
     van de rij naar planniveau tilde. */
  test('hij staat op planniveau en niet in een rij die kan wegvallen', async ({ page }) => {
    await boot(page, GEMETEN);
    await page.evaluate(() => go('vooruit'));
    const t = await page.locator('#s-vooruit').innerText();
    expect(t).toContain('op je spaarrekening staat');
    expect(t).toContain('€550');
  });

  test('ook met een gepauzeerd noodfonds blijft de melding staan', async ({ page }) => {
    await boot(page, GEMETEN);
    await page.evaluate(() => { planTogglePause(PLAN_NF); });
    expect(await regel(page)).not.toBe('');
  });
});

test.describe('f - layout', () => {
  for (const w of [360, 390]) {
    test(`de melding past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page, GEMETEN);
      await page.evaluate(() => go('vooruit'));
      const over2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over2).toBeLessThanOrEqual(1);
    });
  }
});
