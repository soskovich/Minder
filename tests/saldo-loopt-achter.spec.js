// v198: de app veronderstelde dat een banksaldo en een transactiereeks uit hetzelfde moment komen.
// Bij een PSD2-koppeling klopt dat (beide uit dezelfde ophaling), bij een handmatig saldo of een
// CSV-import niet. Gemeten gevolg: safeToSpend() liep €1 per uitgegeven euro omhoog, want de
// potjesreservering leest je transacties van vandaag terwijl het saldo van eergisteren is.
// De keuze is: niets aan de berekening, wel zeggen dat het saldo achterloopt. Geen bedrag en geen
// richting, want zodra daar een richting in staat gaat iemand rekenen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const TWEE = 'NL01TWEE0000002222';
const now = new Date();
const d2 = (n) => String(n).padStart(2, '0');
const ymd = (d) => d.getFullYear() + '-' + d2(d.getMonth() + 1) + '-' + d2(d.getDate());
const dagenGeleden = (n) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n));
const ym = (d) => d.getFullYear() + '-' + d2(d.getMonth() + 1);

/* De boekingen staan bewust vlak achter elkaar in de lopende maand, zodat we de saldodatum er
   omheen kunnen schuiven zonder dat de maandindeling verandert. */
function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (dag, a, acc, naam, ds) => tx.push({ id: 'x' + (i++), date: dag, amount: a, acc,
    name: naam, desc: ds, typ: '', ref: '', src: o.bron || 'csv', accName: '', refNums: [] });
  for (const k of [40, 25, 10]) add(dagenGeleden(k), -300, MAIN, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  for (const k of [42, 27, 12]) add(dagenGeleden(k), 3000, MAIN, 'Werkgever', 'SALARIS LOON');
  add(dagenGeleden(o.laatsteTx == null ? 3 : o.laatsteTx), -120, MAIN, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  if (o.tweede) add(dagenGeleden(o.tweedeTx == null ? 3 : o.tweedeTx), -60, TWEE, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: Object.assign({ [MAIN]: 4000 }, o.tweede ? { [TWEE]: 500 } : {}),
    savingMode: 'amount', savingAmount: 300,
    budgets: { boodschappen: 800 }, goals: [], planOrder: [] }, o.set || {});
  const own = o.tweede ? [MAIN, TWEE] : [MAIN];
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify(own), minder_accmeta: JSON.stringify(o.accmeta || {}), minder_plan: '{}' };
}
async function boot(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof saldoAchter === 'function');
}
const regel = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = saldoAchterRegel();
  return d.innerText.replace(/\s+/g, ' ').trim();
});

test.describe('a · de datum bij het saldo', () => {
  test('een handmatig saldo krijgt de dag van invoeren mee', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate((acc) => {
      setBal(acc, 5000);
      return { bedrag: accBalance(acc), datum: accBalanceDatum(acc), vandaag: vandaagYMD(),
        opslag: JSON.parse(localStorage.minder_set).manualBalDatum };
    }, MAIN);
    expect(r.bedrag).toBe(5000);
    expect(r.datum).toBe(r.vandaag);
    expect(r.opslag[MAIN]).toBe(r.vandaag);
  });

  test('een saldo wissen wist ook zijn datum', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate((acc) => {
      setBal(acc, 5000); setBal(acc, '');
      return { bedrag: accBalance(acc), datum: accBalanceDatum(acc),
        opslag: (JSON.parse(localStorage.minder_set).manualBalDatum || {})[acc] };
    }, MAIN);
    expect(r.bedrag).toBeNull();
    expect(r.datum).toBeNull();
    expect(r.opslag).toBeUndefined();
  });

  /* Een saldo dat vóór v198 is ingevoerd heeft geen datum. Dan weten we het niet, en dat is geen
     achterstand: er staat niets. (v59/v73: onbekend blijft onbekend.) */
  test('een saldo zonder datum levert geen melding op', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate((acc) => ({ datum: accBalanceDatum(acc),
      achter: saldoAchter().length, regel: saldoAchterRegel() }), MAIN);
    expect(r.datum).toBeNull();
    expect(r.achter).toBe(0);
    expect(r.regel).toBe('');
  });

  test('de datum volgt dezelfde volgorde als het bedrag: handmatig wint van ACCMETA', async ({ page }) => {
    await boot(page, { set: { manualBal: {} },
      accmeta: { [MAIN]: { balance: 9999, date: dagenGeleden(30) } } });
    const r = await page.evaluate((acc) => {
      const voor = { bedrag: accBalance(acc), datum: accBalanceDatum(acc) };
      setBal(acc, 5000);
      return { voor, na: { bedrag: accBalance(acc), datum: accBalanceDatum(acc) }, vandaag: vandaagYMD() };
    }, MAIN);
    // zonder handmatig saldo: het bedrag en de datum uit ACCMETA
    expect(r.voor.datum).toBe(dagenGeleden(30));
    // met: allebei het handmatige, nooit een bedrag bij de datum van een ander
    expect(r.na.bedrag).toBe(5000);
    expect(r.na.datum).toBe(r.vandaag);
  });
});

test.describe('b · de regel verschijnt alleen als er tijd tussen zit', () => {
  test('saldo ouder dan de nieuwste boeking: de regel staat er', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(9) } },
      set: { manualBal: {} }, laatsteTx: 3 });
    const r = await page.evaluate(() => saldoAchter());
    expect(r.length).toBe(1);
    expect(r[0].saldoDatum).toBe(dagenGeleden(9));
    expect(r[0].txDatum).toBe(dagenGeleden(3));
    const t = await regel(page);
    expect(t).toMatch(/is van .*, de nieuwste boeking erop van /);
  });

  test('saldo op dezelfde dag als de nieuwste boeking: niets', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(3) } },
      set: { manualBal: {} }, laatsteTx: 3 });
    expect(await page.evaluate(() => saldoAchter().length)).toBe(0);
    expect(await regel(page)).toBe('');
  });

  test('saldo nieuwer dan de nieuwste boeking: niets', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(1) } },
      set: { manualBal: {} }, laatsteTx: 3 });
    expect(await page.evaluate(() => saldoAchter().length)).toBe(0);
    expect(await regel(page)).toBe('');
  });

  test('een rekening zonder boekingen levert niets op', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(9) } },
      set: { manualBal: {} } });
    const r = await page.evaluate((acc) => {
      TX.length = 0; applyOwnAccounts(); OWN.push(acc);
      return { achter: saldoAchter().length, tx: nieuwsteTxDatum(acc) };
    }, MAIN);
    expect(r.tx).toBeNull();
    expect(r.achter).toBe(0);
  });

  test('een onbekend saldo is een andere staat, geen achterstand', async ({ page }) => {
    await boot(page, { set: { manualBal: {} } });
    const r = await page.evaluate((acc) => ({ bal: accBalance(acc), achter: saldoAchter().length }), MAIN);
    expect(r.bal).toBeNull();
    expect(r.achter).toBe(0);
  });
});

test.describe('c · de regel noemt geen bedrag en geen richting', () => {
  test('alleen twee datums, geen euro en geen hoger of lager', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(9) } },
      set: { manualBal: {} }, laatsteTx: 3 });
    const t = await regel(page);
    expect(t.length).toBeGreaterThan(0);
    expect(t).not.toMatch(/€/);
    // geen bedrag: geen duizendtalscheiding en geen decimaalkomma achter cijfers. Een
    // rekeningnaam mag wel cijfers dragen (Space ··1111), dus niet op losse cijfers toetsen.
    expect(t).not.toMatch(/\d[.,]\d/);
    expect(t).not.toMatch(/hoger|lager|meer|minder|te veel|te weinig/i);
    expect(t).not.toMatch(/waarschijnlijk|ongeveer|naar schatting/i);
  });

  test('bij meerdere rekeningen telt hij ze, zonder ze door te rekenen', async ({ page }) => {
    await boot(page, { tweede: true, set: { manualBal: {} },
      accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(9) },
        [TWEE]: { balance: 500, date: dagenGeleden(9) } }, laatsteTx: 3, tweedeTx: 3 });
    expect(await page.evaluate(() => saldoAchter().length)).toBe(2);
    const t = await regel(page);
    expect(t).toMatch(/Bij 2 rekeningen/);
    expect(t).not.toMatch(/€/);
  });

  test('de bron van de source-tekst draagt geen bedrag', async ({ page }) => {
    await boot(page, {});
    const src = await page.evaluate(() => saldoAchterRegel.toString()
      .replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(src).not.toMatch(/euro0|euro\(|accBalance\(/);   // hij leest alleen datums
  });
});

test.describe('d · geen enkele berekening verandert', () => {
  test('safeToSpend, totalBalance en netWorth zijn identiek met en zonder datum', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(9) } },
      set: { manualBal: {} }, laatsteTx: 3 });
    const r = await page.evaluate(() => {
      const meet = () => ({ safe: safeToSpend().safe, tb: JSON.stringify(totalBalance()),
        nw: netWorth().netto, liq: monthLiquidity().projected });
      const metDatum = meet();
      const bewaard = ACCMETA[Object.keys(ACCMETA)[0]].date;
      delete ACCMETA[Object.keys(ACCMETA)[0]].date;        // dezelfde stand, alleen zonder datum
      const zonderDatum = meet();
      ACCMETA[Object.keys(ACCMETA)[0]].date = bewaard;
      return { metDatum, zonderDatum, achter: saldoAchter().length };
    });
    expect(r.metDatum).toEqual(r.zonderDatum);
    expect(r.achter).toBe(1);                              // de melding hangt er los van
  });

  test('accBalance leest nog steeds alleen het bedrag', async ({ page }) => {
    await boot(page, {});
    const src = await page.evaluate(() => accBalance.toString().replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(src).not.toMatch(/\.date|manualBalDatum/);
  });
});

test.describe('e · de regel verdwijnt weer, en blijft nergens hangen', () => {
  /* De vraag die hier vastligt: is er een stand waarin de regel blijft staan terwijl het saldo wél
     actueel is? Drie routes waarlangs hij hoort te verdwijnen. */
  test('een handmatig saldo opnieuw invoeren laat hem verdwijnen', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(9) } },
      set: { manualBal: {} }, laatsteTx: 3 });
    expect(await page.evaluate(() => saldoAchter().length)).toBe(1);
    await page.evaluate((acc) => setBal(acc, 4000), MAIN);
    expect(await page.evaluate(() => saldoAchter().length)).toBe(0);
    expect(await regel(page)).toBe('');
  });

  test('een verse saldodatum uit een ophaling laat hem verdwijnen', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(9) } },
      set: { manualBal: {} }, laatsteTx: 3 });
    expect(await page.evaluate(() => saldoAchter().length)).toBe(1);
    await page.evaluate((acc) => { ACCMETA[acc].date = vandaagYMD(); save(); }, MAIN);
    expect(await page.evaluate(() => saldoAchter().length)).toBe(0);
  });

  /* Het randgeval dat de aanleiding was voor deze controle: de PSD2-stempel gebruikte de UTC-dag
     (toISOString), en die loopt tussen middernacht en 02:00 zomertijd een dag achter op de lokale
     dag waarop TX zijn datums draagt. Een vers opgehaald saldo zou dan als achterlopend lezen. */
  test('de saldostempel is een lokale dag, net als de datums in TX', async ({ page }) => {
    await boot(page, {});
    const src = await page.evaluate(() => document.documentElement.outerHTML);
    expect(src).toContain('balances[accId]={balance:bal,date:vandaagYMD()}');
    expect(src).not.toContain('date:new Date().toISOString().slice(0,10)}');
  });

  test('een boeking van vandaag naast een saldo van vandaag geeft niets', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(0) } },
      set: { manualBal: {} }, laatsteTx: 0 });
    const r = await page.evaluate((acc) => ({ bal: accBalanceDatum(acc), tx: nieuwsteTxDatum(acc),
      achter: saldoAchter().length }), MAIN);
    expect(r.bal).toBe(r.tx);
    expect(r.achter).toBe(0);
  });
});

test.describe('f · de regel staat in de opbouw-sheet, bij het saldo', () => {
  test('hij staat onder Totaal saldo en nergens anders', async ({ page }) => {
    await boot(page, { accmeta: { [MAIN]: { balance: 4000, date: dagenGeleden(9) } },
      set: { manualBal: {} }, laatsteTx: 3 });
    await page.evaluate(() => { go('dash'); openSafeToSpend(); });
    await page.waitForSelector('#sheetBg.show');
    const t = await page.locator('#sheet').innerText();
    expect(t).toMatch(/Totaal saldo/);
    expect(t).toMatch(/de nieuwste boeking erop van/);
    // en niet op Home zelf: een tweede mededeling naast de hero is een tweede oppervlak
    await page.evaluate(() => closeSheet());
    expect(await page.locator('#s-dash').innerText()).not.toMatch(/nieuwste boeking erop/);
  });

  test('bij een onbekend saldo staat hij er niet: dan is er al een andere melding', async ({ page }) => {
    await boot(page, { set: { manualBal: {} } });
    await page.evaluate(() => { go('dash'); openSafeToSpend(); });
    await page.waitForSelector('#sheetBg.show');
    const t = await page.locator('#sheet').innerText();
    expect(t).toMatch(/onbekend/);
    expect(t).not.toMatch(/nieuwste boeking erop/);
  });

  test('renderReminder is ongemoeid: die gaat over verouderde transacties', async ({ page }) => {
    await boot(page, {});
    const src = await page.evaluate(() => renderReminder.toString().replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(src).toContain('laatsteImport()');
    expect(src).not.toMatch(/saldoAchter|accBalanceDatum/);
  });
});
