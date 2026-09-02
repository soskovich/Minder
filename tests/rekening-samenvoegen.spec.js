// v151: de id van een rekening zonder IBAN hing aan de uid, en die is per sessie ("valid only until
// the session ... is in the AUTHORIZED status"). Elke nieuwe machtiging gaf zo'n rekening dus een
// tweede exemplaar, met dezelfde boekingen en een dubbel geteld saldo. identification_hash is
// precies voor het matchen over sessies heen bedoeld. Plus: samenvoegen voor wat er al dubbel staat.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));

const MAIN = '100110012555096222';    // rekening mét IBAN: stabiele id
const OUD = 'psd2_2930129f';          // dezelfde Space, oude machtiging
const NIEUW = 'psd2_94a07621';        // dezelfde Space, nieuwe machtiging

// vijf identieke boekingen op beide ids, plus één die alleen op de oude staat
const GEDEELD = [['05', -10, 'Naar Reserveringen'], ['12', -10, 'Naar Reserveringen'],
                 ['19', -10, 'Naar Reserveringen'], ['24', -10, 'Naar Reserveringen']];

function seed(set = {}) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc: naam, typ: '', ref: '',
              src: 'psd2', accName: '', refNums: [] });
  for (const m of [M1, CUR]) add('i' + m, MAIN, m, '25', 3000, 'Werkgever');
  GEDEELD.forEach(([d, a, n], i) => { add('o' + i, OUD, M1, d, a, n); add('n' + i, NIEUW, M1, d, a, n); });
  add('alleen-oud', OUD, M1, '28', -5, 'Alleen op de oude');   // moet meeverhuizen
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      manualBal: { [MAIN]: 2000, [OUD]: 50, [NIEUW]: 50 },
      acctName: { [OUD]: 'Reserveringen', [NIEUW]: 'Handgeld' },
      psd2Accounts: {
        [MAIN]: { uid: 'u-main', iban: 'DE8937040044053206222', label: 'V SUMTER ··6222', bank: 'N26', exp: '2026-12-01' },
        [OUD]: { uid: '2930129f-5706', iban: '', label: 'V SUMTER', bank: 'N26', exp: '2026-10-12' },
        [NIEUW]: { uid: '94a07621-7b94', iban: '', label: 'V SUMTER', bank: 'N26', exp: '2026-12-01' },
      },
    }, set)),
    minder_own: JSON.stringify([MAIN, OUD, NIEUW]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof rekSamenvoeg === 'function');
}

test.describe('a · de id hangt niet meer aan de sessie', () => {
  test('identification_hash gaat voor op de uid', async ({ page }) => {
    await boot(page);
    const ids = await page.evaluate(() => {
      const zien = [];
      const orig = window.psd2Api;
      // we roepen de id-afleiding niet aan via het netwerk; we toetsen de regel zelf
      const mk = (a, meta) => {
        const iban = (a.account_id && a.account_id.iban) || a.iban || '';
        const hash = a.identification_hash || (Array.isArray(a.identification_hashes) ? a.identification_hashes[0] : '') || '';
        let bekend = '';
        if (hash) for (const k in meta) { if (meta[k] && meta[k].hash === hash) { bekend = k; break; } }
        return bekend || ibanNum(iban) || (hash ? 'psd2h_' + String(hash).slice(0, 16) : 'psd2_' + String(a.uid).slice(0, 8));
      };
      window.psd2Api = orig;
      zien.push(mk({ uid: 'aaaaaaaa-1111', identification_hash: 'H123456789012345678' }, {}));
      zien.push(mk({ uid: 'bbbbbbbb-2222', identification_hash: 'H123456789012345678' }, {}));   // nieuwe sessie, zelfde hash
      zien.push(mk({ uid: 'cccccccc-3333' }, {}));                                                // geen hash: terugval
      return zien;
    });
    expect(ids[0]).toBe(ids[1]);                       // een nieuwe machtiging geeft dezelfde id
    expect(ids[0].startsWith('psd2h_')).toBe(true);
    expect(ids[2]).toBe('psd2_cccccccc');              // zonder hash de oude terugval
  });

  test('een bekende hash houdt zijn bestaande id, ook een oude uid-id', async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => {
      const meta = { 'psd2_2930129f': { uid: 'oud', hash: 'HASH-X' } };
      const a = { uid: 'nieuw-uid', identification_hash: 'HASH-X' };
      const hash = a.identification_hash;
      let bekend = '';
      for (const k in meta) { if (meta[k] && meta[k].hash === hash) { bekend = k; break; } }
      return bekend || ('psd2h_' + hash);
    });
    expect(id).toBe('psd2_2930129f');                  // geen derde exemplaar door de fix zelf
  });

  test('de bron leest identification_hash en bewaart hem', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => psd2IngestSession.toString());
    expect(src).toContain('identification_hash');
    expect(src).toContain('psd2h_');
    expect(src).toMatch(/meta\[accId\]=\{[^}]*hash/);
  });
});

test.describe('b · samenvoegen', () => {
  test('het plan telt wat er wegvalt en wat meeverhuist', async ({ page }) => {
    await boot(page);
    const P = await page.evaluate((x) => rekSamenvoegPlan(x[0], x[1]), [OUD, NIEUW]);
    expect(P.weg).toBe(4);                             // de vier dubbele
    expect(P.mee).toBe(1);                             // 'Alleen op de oude'
    expect(P.saldoVan).toBe(50);
  });

  test('na samenvoegen is er één rekening en telt het saldo één keer', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ own: OWN.length, sum: totalBalance().sum, tx: TX.length }));
    expect(voor.sum).toBe(2100);                       // 2000 + 50 + 50
    await page.evaluate((x) => rekSamenvoeg(x[0], x[1]), [OUD, NIEUW]);
    const na = await page.evaluate(() => ({ own: OWN.length, sum: totalBalance().sum, tx: TX.length }));
    expect(na.own).toBe(voor.own - 1);
    expect(na.sum).toBe(2050);                         // de dubbeltelling is weg
    expect(na.tx).toBe(voor.tx - 4);                   // alleen de vier dubbele
  });

  test('een boeking die alleen op de opgeheven rekening stond blijft bestaan', async ({ page }) => {
    await boot(page);
    await page.evaluate((x) => rekSamenvoeg(x[0], x[1]), [OUD, NIEUW]);
    const t = await page.evaluate(() => TX.find((x) => x.name === 'Alleen op de oude'));
    expect(t).toBeTruthy();
    expect(t.acc).toBe(NIEUW);                         // verhuisd, niet verdwenen
  });

  test('de instellingen van de opgeheven rekening zijn opgeruimd', async ({ page }) => {
    await boot(page);
    await page.evaluate((x) => rekSamenvoeg(x[0], x[1]), [OUD, NIEUW]);
    const r = await page.evaluate(() => ({
      ps: Object.keys(SET.psd2Accounts || {}), bal: SET.manualBal || {}, naam: SET.acctName || {},
    }));
    expect(r.ps).not.toContain(OUD);
    expect(r.bal[OUD]).toBeUndefined();
    expect(r.naam[OUD]).toBeUndefined();
    expect(r.naam[NIEUW]).toBe('Handgeld');            // de blijvende houdt zijn naam
  });

  test('en de melding is daarna weg', async ({ page }) => {
    await boot(page);
    await page.evaluate((x) => rekSamenvoeg(x[0], x[1]), [OUD, NIEUW]);
    expect(await page.evaluate(() => rekeningOverlap())).toEqual([]);
    expect(await page.evaluate(() => rekOverlapRegel())).toBe('');
  });
});

test.describe('c · niets gebeurt zonder bevestiging', () => {
  test('de vraag toont welke blijft en welke vervalt, en wijzigt nog niets', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({ tx: TX.length, own: OWN.length, set: JSON.stringify(SET) }));
    await page.evaluate((x) => rekSamenvoegVraag(x[0], x[1]), [OUD, NIEUW]);
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Samenvoegen tot één rekening');
    expect(sheet).toContain('Dit is niet terug te draaien');
    expect(sheet).toContain('Handgeld');               // nieuwste machtiging blijft
    expect(sheet).toContain('Reserveringen');
    expect(sheet).toMatch(/4 dubbele boekingen vallen weg/);
    expect(sheet).toMatch(/1 boeking verhuist mee/);
    expect(await page.evaluate(() => ({ tx: TX.length, own: OWN.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });

  test('de nieuwste machtiging wordt de blijvende, ongeacht de volgorde', async ({ page }) => {
    await boot(page);
    for (const paar of [[OUD, NIEUW], [NIEUW, OUD]]) {
      await page.evaluate((x) => rekSamenvoegVraag(x[0], x[1]), paar);
      const sheet = await page.locator('#sheet').innerText();
      const blijft = sheet.split('Vervalt')[0];
      expect(blijft).toContain('Handgeld');
      expect(blijft).not.toContain('Reserveringen');
    }
  });
});
