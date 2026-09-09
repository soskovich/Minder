// v210: "Schuld loopt mee · €X/mnd" was een samengesteld bedrag zonder opbouw. Er wordt niets
// nieuws berekend: M.debtPay draagt naam en maandtermijn per schuld al, en debtPer is precies de
// som daarvan. Deze spec bewaakt drie dingen: dat de opbouw optelt tot het getoonde totaal, dat de
// vorm de regel van planSub volgt (tot drie waarden een zin, vanaf vier de minitabel), en dat er
// geen opbouw staat waar hij het bedrag alleen zou herhalen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

// Twee schulden is de stand van de melder: Duo plus een leasetermijn.
const DUO = { id: 'd1', naam: 'Duo', type: 'studie', start: 20000, rest: 18000, perMaand: 547, rente: 2.56 };
const LEASE = { id: 'd2', naam: 'Lease auto', type: 'financiallease', start: 25000, rest: 15000, perMaand: 537, rente: 7.9 };
const DERDE = { id: 'd3', naam: 'Doorlopend krediet', start: 5000, rest: 4000, perMaand: 120, rente: 9 };
const STIL = { id: 'd4', naam: 'Familielening', start: 3000, rest: 3000, perMaand: 0, rente: 0 };

function seed(debts) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  // inkomen ruim boven de uitgaven, zodat er een restsaldo is: zonder surplus keert reisRestsaldo
  // eerder terug en bestaat stap 2 niet.
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '25', 4200, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('s' + m, SPAAR, m, '26', 300, 'Spaarpot', 'NAAR SPAREN');
  }
  const set = {
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4200,
    manualBal: { [MAIN]: 3000, [SPAAR]: 12000 },
    budgets: { boodschappen: 400, huur: 1200 },
    savingMode: 'amount', savingAmount: 300,
    savingsAcc: { [SPAAR]: true },
    debts,
  };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, debts) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(debts));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof reisRestsaldo === 'function');
}

// De stap-2-blok als platte tekst, en als DOM voor de vormtoets.
const stap2 = (page) => page.evaluate(() => {
  const d = document.createElement('div');
  d.innerHTML = reisRestsaldo(reisModel()).inleg;
  const rows = [...d.querySelectorAll('div')].filter((x) => /Schuld loopt mee/.test(x.textContent));
  const blok = rows.length ? rows[rows.length - 1].closest('div[style*="flex:1"]') : null;
  return {
    tekst: (blok || d).textContent.replace(/\s+/g, ' ').trim(),
    tabellen: (blok || d).querySelectorAll('.plan-tab').length,
    tabRegels: [...((blok || d).querySelectorAll('.plan-tab span') || [])].map((s) => s.textContent.trim()),
  };
});
const debtPer = (page) => page.evaluate(() => reisModel().debtPay.reduce((s, x) => s + (+x.per || 0), 0));

test.describe('a · de opbouw telt op tot het getoonde bedrag', () => {
  test('twee schulden: een zin met beide termijnen, samen het totaal', async ({ page }) => {
    await boot(page, [DUO, LEASE]);
    const s = await stap2(page);
    expect(s.tekst).toContain('Schuld loopt mee');
    expect(s.tekst).toContain('waarvan');
    expect(s.tekst).toContain('Duo');
    expect(s.tekst).toContain('Lease auto');
    // het totaal in de kop is exact de som van de twee genoemde termijnen
    expect(await debtPer(page)).toBe(DUO.perMaand + LEASE.perMaand);
    const bedragen = (s.tekst.match(/€\s?[\d.]+/g) || []).map((x) => +x.replace(/[^\d]/g, ''));
    expect(bedragen).toContain(DUO.perMaand);
    expect(bedragen).toContain(LEASE.perMaand);
    expect(bedragen).toContain(DUO.perMaand + LEASE.perMaand);
  });

  test('bij twee schulden blijft het een zin, geen tabel', async ({ page }) => {
    await boot(page, [DUO, LEASE]);
    expect((await stap2(page)).tabellen).toBe(0);
  });

  test('drie schulden: vier waarden, dus de uitgelijnde minitabel', async ({ page }) => {
    await boot(page, [DUO, LEASE, DERDE]);
    const s = await stap2(page);
    expect(s.tabellen).toBe(1);
    expect(s.tekst).not.toContain('waarvan');
    for (const d of [DUO, LEASE, DERDE]) expect(s.tabRegels).toContain(d.naam);
    expect(await debtPer(page)).toBe(DUO.perMaand + LEASE.perMaand + DERDE.perMaand);
  });
});

test.describe('b · geen opbouw waar hij niets toevoegt', () => {
  test('een schuld: het totaal is die schuld, dus geen herhaling', async ({ page }) => {
    await boot(page, [DUO]);
    const s = await stap2(page);
    expect(s.tekst).toContain('Schuld loopt mee');
    expect(s.tekst).not.toContain('waarvan');
    expect(s.tabellen).toBe(0);
  });

  test('een schuld zonder termijn draagt niets bij en staat er niet in', async ({ page }) => {
    await boot(page, [DUO, LEASE, STIL]);
    const s = await stap2(page);
    // drie schulden in debtPay, maar er zijn er twee met een termijn: dus de zin, niet de tabel
    expect(await page.evaluate(() => reisModel().debtPay.length)).toBe(3);
    expect(s.tekst).not.toContain('Familielening');
    expect(s.tabellen).toBe(0);
    expect(await debtPer(page)).toBe(DUO.perMaand + LEASE.perMaand);
  });
});

test.describe('c · er wordt niets herrekend', () => {
  /* Bewust een gedragstoets en geen bron-toets: 'SET.debts' staat in deze functie nog in een
     comment die juist vertelt dat er niet meer rechtstreeks uit gelezen wordt, en commentaar telt
     niet als verwijzing. Wat de twee bronnen onderscheidt is een afgeloste schuld: debtPay filtert
     op rest > 0, SET.debts niet. Staat die termijn in de opbouw, dan is er een tweede bron. */
  test('een afgeloste schuld valt uit debtPay, dus ook uit de opbouw en het totaal', async ({ page }) => {
    const AF = { id: 'd5', naam: 'Afbetaalde lening', start: 6000, rest: 0, perMaand: 200, rente: 4 };
    await boot(page, [DUO, LEASE, AF]);
    const s = await stap2(page);
    expect(await page.evaluate(() => reisModel().debtPay.map((d) => d.nm))).toEqual(['Duo', 'Lease auto']);
    expect(s.tekst).not.toContain('Afbetaalde lening');
    expect(await debtPer(page)).toBe(DUO.perMaand + LEASE.perMaand);
    const bedragen = (s.tekst.match(/€\s?[\d.]+/g) || []).map((x) => +x.replace(/[^\d]/g, ''));
    expect(bedragen).not.toContain(AF.perMaand);
  });

  test('het totaal en de reeksen zijn niet veranderd door de opbouw', async ({ page }) => {
    await boot(page, [DUO, LEASE]);
    const m = await page.evaluate(() => {
      const M = reisModel();
      return { per: M.debtPay.map((d) => d.per), debt0: Math.round(M.debt[0]), mid0: Math.round(M.mid[0]) };
    });
    expect(m.per).toEqual([DUO.perMaand, LEASE.perMaand]);
    expect(m.debt0).toBe(DUO.rest + LEASE.rest);
    expect(Number.isFinite(m.mid0)).toBe(true);
  });
});
