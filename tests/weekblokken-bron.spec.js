/* v264: de weekas als bron, en het diagnoseblok dat meet of de reeks zijn drempel haalt.
 *
 * DE REEKS ZELF IS NIET GEBOUWD. Wat hier staat is de indeling (blokken van zeven dagen vanaf de
 * 1e), de drempel als constante, en een blok in DIAG_BLOKKEN dat op het eigen toestel uitleest
 * hoeveel volle blokken er zijn. Die volgorde is met opzet: de drempel is pas te beoordelen als je
 * hem kunt meten, en de gegevens van de gebruiker staan alleen op dat toestel.
 *
 * WAAROM BLOKKEN EN GEEN KALENDERWEKEN: de som van de blokken is per constructie het maandcijfer.
 * Gerekend op de kalender van 2026 valt 10,1 procent van de dagen in een kalenderweek van een
 * andere maand, en gemeten op drie maanden zat de som van de kalenderweken er 11, -97 en -95 naast
 * op maanden van 669 en 764. De reeks komt naast de maandgrafiek te staan, dus aansluiten weegt
 * zwaarder dan doorlopen.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ACC = '100110012555096222';

function seed(vanaf, tot, extra) {
  const tx = [];
  const add = (datum, amount, naam, desc, cat) =>
    tx.push({ id: 'x' + tx.length, date: datum, amount, acc: ACC, name: naam, desc: desc || naam,
              typ: '', ref: '', src: 'psd2', accName: '', refNums: [], ruleCat: cat, autoCat: cat });
  add(vanaf, -20, 'Albert Heijn');
  add(tot, -20, 'Albert Heijn');
  (extra || []).forEach((e) => add(e.datum, -e.bedrag, e.naam || 'Albert Heijn', e.desc, e.cat));
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, mode: 'begeleid', autoIncome: false, income: 5216,
      manualBal: { [ACC]: 4200 }, budgets: { boodschappen: 700, onvoorzien: 0 },
      savingMode: 'amount', savingAmount: 0, goals: [] }),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof weekBlokken === 'function');
}
const blokken = (page) => page.evaluate(() => weekBlokken());

test.describe('a - de indeling', () => {
  test('een maand van 31 dagen geeft vier blokken, en de restdagen zijn er geen', async ({ page }) => {
    await boot(page, seed('2026-01-01', '2026-01-31'));
    const b = await blokken(page);
    expect(b.map((x) => [x.van, x.tot])).toEqual([
      ['2026-01-01', '2026-01-07'], ['2026-01-08', '2026-01-14'],
      ['2026-01-15', '2026-01-21'], ['2026-01-22', '2026-01-28'],
    ]);
    // 29, 30 en 31 januari zitten in geen enkel blok, en dat is de hele keuze
    expect(b.some((x) => x.tot > '2026-01-28')).toBe(false);
  });

  test('februari van 28 dagen geeft ook vier blokken en laat niets liggen', async ({ page }) => {
    await boot(page, seed('2026-02-01', '2026-02-28'));
    const b = await blokken(page);
    expect(b).toHaveLength(4);
    expect(b[3].tot).toBe('2026-02-28');
  });

  test('elk blok draagt zeven dagen, dus elke weekdag precies een keer', async ({ page }) => {
    await boot(page, seed('2026-01-01', '2026-04-30'));
    const b = await blokken(page);
    for (const x of b) {
      const a = new Date(x.van + 'T00:00:00'), z = new Date(x.tot + 'T00:00:00');
      expect(Math.round((z - a) / 864e5), x.van).toBe(6);
      const dagen = new Set();
      for (let i = 0; i < 7; i++) dagen.add(new Date(a.getTime() + i * 864e5).getDay());
      expect(dagen.size, x.van).toBe(7);
    }
  });

  test('de blokken lopen door over de maandgrens heen zonder er een te overslaan', async ({ page }) => {
    await boot(page, seed('2026-01-01', '2026-03-31'));
    const b = await blokken(page);
    expect(b).toHaveLength(12);                       // 4 per maand, drie maanden
    expect([...new Set(b.map((x) => x.maand))]).toEqual(['2026-01', '2026-02', '2026-03']);
    expect([...new Set(b.map((x) => x.nr))].sort()).toEqual([1, 2, 3, 4]);
  });
});

test.describe('b - vol betekent binnen je import', () => {
  test('een blok dat half buiten je gegevens ligt is niet vol', async ({ page }) => {
    await boot(page, seed('2026-01-10', '2026-02-20'));
    const b = await blokken(page);
    const vol = b.filter((x) => x.vol);
    /* 8-14 januari begint voor de eerste boeking en 15-21 februari eindigt erna, dus allebei niet
       vol. Aan beide kanten telt de hele week mee of hij telt niet: een half blok is geen week
       waarover je iets kunt zeggen. */
    expect(vol.map((x) => x.van)).toEqual(['2026-01-15', '2026-01-22', '2026-02-01', '2026-02-08']);
    expect(b.find((x) => x.van === '2026-01-08').vol).toBe(false);
    expect(b.find((x) => x.van === '2026-02-15').vol).toBe(false);
  });

  test('zonder transacties is er geen enkel blok, en geen nul', async ({ page }) => {
    await boot(page, { minder_tx: '[]', minder_ovr: '{}', minder_set: '{}', minder_own: '[]',
                       minder_accmeta: '{}', minder_plan: '{}' });
    expect(await blokken(page)).toEqual([]);
  });
});

test.describe('c - de drempel', () => {
  test('WEEK_MIN_BLOKKEN is twaalf en staat als constante in de bron', async ({ page }) => {
    await boot(page, seed('2026-01-01', '2026-01-31'));
    expect(await page.evaluate(() => WEEK_MIN_BLOKKEN)).toBe(12);
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    expect(src).toMatch(/const WEEK_MIN_BLOKKEN=12;/);
    // geen tweede plek die twaalf hardcodeert naast de constante
    const diag = /function diagWeekblokken\(\)\{([\s\S]*?)\n\}/.exec(src);
    expect(diag, 'diagWeekblokken() niet gevonden').toBeTruthy();
    expect(diag[1]).toMatch(/WEEK_MIN_BLOKKEN/);
    expect(diag[1]).not.toMatch(/[^_A-Z]12[^0-9]/);
  });
});

test.describe('d - het diagnoseblok', () => {
  test('het blok staat in DIAG_BLOKKEN en niet los', async ({ page }) => {
    await boot(page, seed('2026-01-01', '2026-06-30'));
    const r = await page.evaluate(() => {
      const i = DIAG_BLOKKEN.findIndex((b) => /weekreeks/.test(b.titel));
      return { i, titel: i >= 0 ? DIAG_BLOKKEN[i].titel : null, aantal: DIAG_BLOKKEN.length };
    });
    expect(r.i).toBeGreaterThanOrEqual(0);
    expect(r.titel).toMatch(/drempel/);
  });

  test('het telt volle en bruikbare blokken apart, en noemt de drempel', async ({ page }) => {
    // zes maanden import, maar in scope alleen boekingen in de eerste twee maanden
    const extra = [];
    for (const m of ['01', '02']) for (const d of ['03', '10', '17', '24'])
      extra.push({ datum: '2026-' + m + '-' + d, bedrag: 40 });
    await boot(page, seed('2026-01-01', '2026-06-30', extra));
    const tekst = (await page.evaluate(() => diagWeekblokken())).join('\n');
    expect(tekst).toContain('eerste boeking:  2026-01-01');
    expect(tekst).toContain('laatste boeking: 2026-06-30');
    expect(tekst).toMatch(/vol:\s+24/);              // vier per maand, zes maanden
    expect(tekst).toMatch(/bruikbaar:\s+8/);         // alleen januari en februari dragen iets
    expect(tekst).toContain('drempel WEEK_MIN_BLOKKEN: 12');
    expect(tekst).toMatch(/gehaald op volle blokken:\s+ja/);
    expect(tekst).toMatch(/gehaald op bruikbare blokken:\s+nee/);
  });

  /* De ankerboekingen van seed() staan zelf in scope, dus de toets is of een blok waar ALLEEN
     onvoorzien in staat erbij komt. Dat is de vertekening die v239 op de weekdag-as al weghaalde:
     een boeking van 497 zou een blok volledig overheersen. */
  test('geenNorm valt buiten de scope, dus onvoorzien maakt geen blok bruikbaar', async ({ page }) => {
    const extra = [{ datum: '2026-02-10', bedrag: 497, naam: 'Garage' }];
    await boot(page, seed('2026-01-01', '2026-03-31', extra));
    /* De boot hernummert de ids, dus een categorie uit de seed landt niet: categorize() zet deze
       boeking op 'overig'. Hem na de boot als override zetten is dezelfde handeling als in de app,
       en de assertie eronder houdt vast dat de fixture werkelijk draagt wat hij belooft (v260). */
    await page.evaluate(() => { const t = TX.find((x) => /Garage/.test(x.name)); OVR[t.id] = 'onvoorzien'; save(); });
    const r = await page.evaluate(() => {
      const tekst = diagWeekblokken().join('\n');
      return { tekst, cat: catOf(TX.find((t) => /Garage/.test(t.name))) };
    });
    expect(r.cat, 'de fixture zet de boeking niet op onvoorzien').toBe('onvoorzien');
    // alleen het blok met de ankerboeking van 1 januari telt; februari#2 draagt enkel de 497
    expect(r.tekst).toMatch(/bruikbaar:\s+1/);
    expect(r.tekst).toContain('2026-01#1=20');
    expect(r.tekst).not.toContain('2026-02#2');
  });

  test('kijken verandert niets: geen enkele schrijver naar localStorage', async ({ page }) => {
    await boot(page, seed('2026-01-01', '2026-06-30'));
    const r = await page.evaluate(() => {
      const echt = Storage.prototype.setItem; const geschreven = [];
      Storage.prototype.setItem = function (k, v) { geschreven.push(k); return echt.call(this, k, v); };
      const voor = JSON.stringify(SET);
      try { diagWeekblokken(); weekBlokken(); } finally { Storage.prototype.setItem = echt; }
      return { geschreven, zelfde: voor === JSON.stringify(SET) };
    });
    expect(r.geschreven).toEqual([]);
    expect(r.zelfde).toBe(true);
  });
});
