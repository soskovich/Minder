// v146: een rekening die je bank niet meer deelt. Bij Enable Banking ligt de rekeninglijst vast bij
// het autoriseren, dus een rekening die daarna bij komt haalt psd2Refresh() nooit op. De app
// herkent dat zelf en biedt één tik naar opnieuw autoriseren. Bewust geen automatische
// classificatie: een tegenrekening als 'van jou' boeken zou een echte uitgave laten verdwijnen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));

const MAIN = '1234567890';        // eigen rekening: er staan boekingen op, dus hij zit in OWN
const SPACE = '9876544891';       // de nieuwe Space: alleen als tegenrekening bekend, ··4891
const WINKEL = '5550001111';      // een gewone tegenpartij

const tx = (id, m, day, amount, naam, num) => ({ id, date: `${m}-${day}`, amount, acc: MAIN,
  name: naam, desc: naam, typ: '', ref: '', src: 'psd2', refNums: num ? [num] : [] });

function seed(set = {}, extra = []) {
  const list = [];
  for (const m of [M1, CUR]) {
    list.push(tx('i' + m, m, '25', 3000, 'Werkgever', null));
    list.push(tx('w' + m, m, '06', -200, 'Supermarkt Vitesse', WINKEL));   // samen 400: zwaarste op bedrag
  }
  for (const t of extra) list.push(t);
  return {
    minder_tx: JSON.stringify(list), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      manualBal: { [MAIN]: 2000 },
    }, set)),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
// de overboeking naar de Space, op jouw naam: de harde aanwijzing
const OPNAAM = tx('sp1', CUR, '10', -250, 'Vincent Sumter', SPACE);
// dezelfde overboeking zonder herkenbare tenaamstelling
const ANONIEM = tx('sp1', CUR, '10', -250, 'Overboeking', SPACE);

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed({}, [OPNAAM]));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof ontbrekendeRekening === 'function');
}
const ontbreekt = (page) => page.evaluate(() => ontbrekendeRekening());
const notifKeys = (page) => page.evaluate(() => scoreNotifs().map((n) => n.key));

test.describe('a · de app stelt het zelf vast', () => {
  test('een tegenrekening op jouw naam die niet gekoppeld is', async ({ page }) => {
    await boot(page);
    const r = await ontbreekt(page);
    expect(r).toBeTruthy();
    expect(r.num).toBe(SPACE);
    expect(r.n).toBe(1);
    expect(r.bedrag).toBe(250);
    expect(await page.evaluate((x) => tegenrekSterk(x), r)).toBe('staat op jouw naam');
  });

  test('een winkel wordt het nooit, ook niet als hij het zwaarst weegt', async ({ page }) => {
    await boot(page);
    const alles = await page.evaluate(() => onbekendeTegenrekeningen());
    expect(alles[0].num).toBe(WINKEL);                       // 400 tegen 250
    expect(await page.evaluate(() => ontbrekendeRekening().num)).toBe(SPACE);
    expect(await page.evaluate((x) => tegenrekSterk(x), alles[0])).toBe('');
  });

  test('zonder herkenbare tenaamstelling doet de app geen uitspraak', async ({ page }) => {
    await boot(page, seed({}, [ANONIEM]));
    expect(await ontbreekt(page)).toBe(null);
    expect((await notifKeys(page)).some((k) => k.startsWith('ontbrek-'))).toBe(false);
  });

  test('een rekening uit OWN telt niet als ontbrekend', async ({ page }) => {
    await boot(page, seed({}, [tx('eig', CUR, '12', -90, 'Vincent Sumter', MAIN)]));
    expect((await page.evaluate(() => onbekendeTegenrekeningen())).some((x) => x.num === MAIN)).toBe(false);
  });
});

test.describe('b · geen automatische classificatie', () => {
  test('de overboeking blijft tellen zoals hij telde', async ({ page }) => {
    // v146 raakt de cijfers niet aan: pas als de rekening echt gekoppeld is verandert er iets,
    // en dan via de bestaande regel (refNums in OWN), niet via een heuristiek.
    await boot(page, seed({}, [ANONIEM]));
    const cat = await page.evaluate((m) => catOf(TX.find((t) => t.date === `${m}-10`)), CUR);
    expect(cat).not.toBe('intern');
    expect(await page.evaluate(() => typeof SET.eigenRek)).toBe('undefined');   // geen keuzelijst-state
  });

  test('verkeer in twee richtingen is bewust geen aanwijzing', async ({ page }) => {
    // een deels terugbetaalde aankoop ziet er identiek uit; die als intern boeken zou echte
    // uitgaven laten verdwijnen
    await boot(page, seed({}, [tx('r1', CUR, '10', -80, 'Webshop Kade', '7770002222'),
                               tx('r2', CUR, '18', 30, 'Webshop Kade', '7770002222')]));
    const r = (await page.evaluate(() => onbekendeTegenrekeningen())).find((x) => x.num === '7770002222');
    expect(r.uit).toBe(1);
    expect(r.in).toBe(1);
    expect(await page.evaluate((x) => tegenrekSterk(x), r)).toBe('');
    expect(await ontbreekt(page)).toBe(null);
  });
});

test.describe('c · één ingang, één knop', () => {
  test('de melding wijst naar het bankpaneel', async ({ page }) => {
    await boot(page);
    const n = await page.evaluate(() => scoreNotifs().filter((x) => x.key.startsWith('ontbrek-')));
    expect(n.length).toBe(1);
    expect(n[0].l1).toContain('··4891');
    expect(n[0].act).toBe('openBankSet()');
  });

  test('de kaart toont de vaststelling en precies één knop', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => ontbrekendeRekBlok());
    expect(h).toContain('··4891');
    expect(h).toContain('Opnieuw autoriseren');
    expect(h).toContain('psd2Connect()');
    expect((h.match(/<button/g) || []).length).toBe(1);
    expect(h).not.toMatch(/Van mij|Nee<|chip/);              // geen keuzelijst meer
  });

  test('de kaart staat op het bankpaneel', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('set'); toggleSet('bank'); });
    await expect(page.locator('#s-set')).toContainText('Er ontbreekt een rekening');
  });

  test('niets vast te stellen: geen kaart, geen lege staat', async ({ page }) => {
    await boot(page, seed({}, [ANONIEM]));
    expect(await page.evaluate(() => ontbrekendeRekBlok())).toBe('');
    await page.evaluate(() => { go('set'); toggleSet('bank'); });
    expect(await page.locator('#s-set').innerText()).not.toContain('Er ontbreekt een rekening');
  });

  test('de kaart en de melding noemen dezelfde rekening', async ({ page }) => {
    await boot(page);
    const r = await ontbreekt(page);
    const h = await page.evaluate(() => ontbrekendeRekBlok());
    const n = await page.evaluate(() => scoreNotifs().find((x) => x.key.startsWith('ontbrek-')));
    expect(h).toContain(`··${r.num.slice(-4)}`);
    expect(n.l1).toContain(`··${r.num.slice(-4)}`);
  });
});
