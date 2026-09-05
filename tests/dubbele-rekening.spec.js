// v149: twee ids met dezelfde boekingen. Gemeld werd: twee rekeningen in Instellingen met hetzelfde
// saldo én hetzelfde aantal transacties. Dat is het patroon van het gat uit v122 — de CSV-import
// bouwt een id als 'N26 <Account Name>', de koppeling uit de IBAN-cijfers — en dan telt
// totalBalance() het saldo dubbel. Een correctheidsvraag, geen cosmetica.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));

const CSV = 'N26 Buffer Rust';        // id zoals de CSV-parser hem bouwt
const LIVE = '9876541123';            // id zoals de koppeling hem bouwt (IBAN-cijfers)
const MAIN = '1111112222';

// dezelfde vijf boekingen, één keer per id: datum, bedrag en naam gelijk, dus dezelfde _softKey
const BOEKINGEN = [
  ['05', -40, 'Albert Heijn'], ['08', -12, 'Bakker Jansen'], ['12', -60, 'Tankstation Q8'],
  ['19', -25, 'Apotheek West'], ['24', -33, 'Boekhandel Noord'],
];

function seed({ zelfde = true, set = {} } = {}) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc: naam, typ: '', ref: '',
              src: acc === CSV ? 'csv' : 'psd2', accName: '', refNums: [] });
  for (const m of [M1, CUR]) add('i' + m, MAIN, m, '25', 3000, 'Werkgever');
  BOEKINGEN.forEach(([d, a, n], i) => {
    add('c' + i, CSV, M1, d, a, n);
    // zelfde=false: de tweede rekening krijgt eigen bedragen en namen, dus geen gedeelde sleutels
    add('l' + i, LIVE, M1, d, zelfde ? a : a - 7, zelfde ? n : 'Andere winkel ' + i);
  });
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      manualBal: { [MAIN]: 2000, [CSV]: 850, [LIVE]: 850 },
      psd2Accounts: { [LIVE]: { uid: 'u1', iban: 'DE89370400440532011123', label: 'V Sumter ··1123', bank: 'N26' } },
    }, set)),
    minder_own: JSON.stringify([MAIN, CSV, LIVE]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof rekeningOverlap === 'function');
}
const overlap = (page) => page.evaluate(() => rekeningOverlap());

test.describe('a · de vondst', () => {
  test('twee ids met dezelfde boekingen worden als paar gemeld', async ({ page }) => {
    await boot(page);
    const ov = await overlap(page);
    expect(ov.length).toBe(1);
    expect([ov[0].a, ov[0].b].sort()).toEqual([CSV, LIVE].sort());
    expect(ov[0].gedeeld).toBe(5);
    expect(ov[0].aN).toBe(5);
    expect(ov[0].bN).toBe(5);
  });

  test('de rekening met eigen boekingen blijft erbuiten', async ({ page }) => {
    await boot(page);
    const ov = await overlap(page);
    expect(ov.some((o) => o.a === MAIN || o.b === MAIN)).toBe(false);
  });

  test('twee echte rekeningen worden niet gekoppeld', async ({ page }) => {
    await boot(page, seed({ zelfde: false }));
    expect(await overlap(page)).toEqual([]);
  });

  test('een handvol toevallig gelijke bedragen is niet genoeg', async ({ page }) => {
    // twee gedeelde boekingen op tien: onder de drempel van 3 én onder 60%
    const p = seed({ zelfde: false });
    const tx = JSON.parse(p.minder_tx);
    tx.push({ id: 'x1', date: `${CUR}-03`, amount: -9, acc: CSV, name: 'Kiosk', desc: 'Kiosk', typ: '', ref: '', src: 'csv', refNums: [] });
    tx.push({ id: 'x2', date: `${CUR}-03`, amount: -9, acc: LIVE, name: 'Kiosk', desc: 'Kiosk', typ: '', ref: '', src: 'psd2', refNums: [] });
    p.minder_tx = JSON.stringify(tx);
    await boot(page, p);
    expect(await overlap(page)).toEqual([]);
  });
});

test.describe('b · de melding', () => {
  test('de regel staat onder je rekeningen en opent de sheet', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => rekOverlapRegel());   // v183: de regel staat los van de lijst
    expect(h).toContain('dezelfde boekingen');
    expect(h).toContain('openRekOverlap()');
    await page.evaluate(() => { go('set'); toggleSet('bank'); });   // v183: de overlapregel blijft hier
    await page.locator('#s-set >> text=dezelfde boekingen').first().click();
    await page.waitForSelector('#sheetBg.show');
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Dezelfde boekingen, twee rekeningen');
    expect(sheet).toContain('5 gedeelde boekingen');
    expect(sheet).toContain('Al je rekeningen');
  });

  test('geen overlap: geen regel', async ({ page }) => {
    await boot(page, seed({ zelfde: false }));
    expect(await page.evaluate(() => rekOverlapRegel())).toBe('');
    const t = await page.evaluate(() => { go('set'); toggleSet('bank'); return document.getElementById('s-set').innerText; });
    expect(t).not.toContain('dezelfde boekingen');
  });

  test('uid en consent-vervaldatum staan erbij', async ({ page }) => {
    // v150: twee ids zonder IBAN krijgen hun id uit de uid, en een uid is per sessie. Dat veld is
    // het enige dat 'twee echte Spaces' van 'dezelfde Space uit twee consents' onderscheidt.
    await boot(page);
    const f = await page.evaluate((a) => rekFeiten(a), LIVE);
    expect(f.uid).toBe('u1');
    expect(f.eigenIban).toBe(true);
    const t = await page.evaluate(() => rekOverlapTekst());
    expect(t).toContain('uid u1');
    expect(t).toContain('geen eigen IBAN');            // de CSV-kant heeft er geen
  });

  test('de sheet toont wat de bank stuurde, per rekening', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openRekOverlap());
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('V Sumter ··1123');                  // wat N26 als naam meestuurt
    expect(sheet).toContain('(niet via de koppeling)');           // de CSV-kant
    expect(sheet).toContain('Kopieer deze lijst');
  });
});

// v152: een rekening die de bank wél deelt maar zonder boekingen valt buiten OWN (v122) en stond
// dus ook buiten deze sheet — precies de verdachte als je een rekening mist.
test.describe('b2 · gekoppeld, nog zonder boekingen', () => {
  const LEEG = 'psd2h_abcdef0123456789';
  const metLege = () => {
    const p = seed({ zelfde: false });
    const set = JSON.parse(p.minder_set);
    set.psd2Accounts = Object.assign({}, set.psd2Accounts, {
      [LEEG]: { uid: 'u-leeg', iban: '', hash: 'abcdef0123456789', label: 'V SUMTER', bank: 'N26', exp: '2026-12-01' },
    });
    p.minder_set = JSON.stringify(set);
    return p;
  };

  test('hij staat niet in OWN maar wel in de sheet', async ({ page }) => {
    await boot(page, metLege());
    expect(await page.evaluate((x) => OWN.includes(x), LEEG)).toBe(false);
    expect(await page.evaluate(() => rekZonderBoekingen())).toEqual([LEEG]);
    await page.evaluate(() => openRekOverlap());
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Gekoppeld, maar nog zonder boekingen');
    expect(sheet).toContain('0 transacties');
  });

  test('de regel verschijnt ook zonder overlap', async ({ page }) => {
    await boot(page, metLege());
    expect(await page.evaluate(() => rekeningOverlap())).toEqual([]);   // geen overlap
    expect(await page.evaluate(() => rekOverlapRegel())).toContain('1 gekoppelde rekening zonder boekingen');
  });

  test('de kopieertekst markeert hem', async ({ page }) => {
    await boot(page, metLege());
    const t = await page.evaluate(() => rekOverlapTekst());
    expect(t).toContain('gekoppeld, geen boekingen');
  });

  test('niets gekoppeld zonder boekingen: geen regel', async ({ page }) => {
    await boot(page, seed({ zelfde: false }));
    expect(await page.evaluate(() => rekZonderBoekingen())).toEqual([]);
    expect(await page.evaluate(() => rekOverlapRegel())).toBe('');
  });
});

test.describe('c · read-only', () => {
  test('kijken verandert niets', async ({ page }) => {
    await boot(page);
    const meten = () => page.evaluate(() => ({
      tx: TX.length, own: OWN.length, sum: totalBalance().sum, set: JSON.stringify(SET),
    }));
    const voor = await meten();
    await page.evaluate(() => { rekeningOverlap(); rekOverlapTekst(); openRekOverlap(); });
    expect(await meten()).toEqual(voor);
  });

  test('de kopieertekst leest dezelfde feiten als de sheet', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => rekOverlapTekst());
    expect(t).toContain('OVERLAP: 5 gedeelde boekingen');
    expect(t).toContain(CSV);
    expect(t).toContain(LIVE);
    expect(t).toContain('ALLE REKENINGEN:');
    expect(t.split('\n').length).toBeGreaterThan(5);              // echte regelovergangen
  });
});
