// v119: gemeld/nagemeten — de schakelaar "spaarrekening" in de rekeningenlijst deed niets voor een
// N26-potje dat uit een CSV-import komt. `SET.savingsEnds` hield laatste-vier-cijfers bij en
// `acctEndsWith()` toetste `id.endsWith(...)`. Dat werkt voor een PSD2-rekening (id = IBAN-cijfers)
// maar niet voor 'N26 Buffer Rust' — die eindigt op "Rust". De schakelaar schreef `acctLast4()` weg,
// en dat is voor élk N26-CSV-potje '26' (uit "N26"), waar geen enkele id op eindigt: de schakelaar
// sprong terug en de stortingen naar dat potje telden nergens mee, ook niet in savedNet en dus niet
// in de spaarquote. Nu een keuze per rekening-id, drietraps zoals de inklap-vlaggen (v20/v90).
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);

const MAIN = '1234506222';          // PSD2: id = de cijfers van de IBAN
const SPAARPOT = '1234504323';      // PSD2, eindigt op 4323 -> standaard spaarrekening
const BUFFER = '1234501123';        // PSD2, eindigt op 1123 -> standaard spaarrekening
const CSVPOT = 'N26 Buffer Rust';   // CSV: de naam zit in de id, geen cijfers om op te matchen

function seedSav(set = {}) {
  const tx = [
    { id: 'a', date: `${CUR}-05`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'psd2', refNums: [] },
    { id: 'b', date: `${CUR}-06`, amount: 200, acc: SPAARPOT, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'psd2', refNums: [] },
    { id: 'c', date: `${CUR}-07`, amount: 90, acc: BUFFER, name: 'Buffer', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'psd2', refNums: [] },
    { id: 'd', date: `${CUR}-08`, amount: 150, acc: CSVPOT, accName: 'Buffer Rust', name: 'Buffer Rust', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', refNums: [] },
  ];
  const iban = (a) => 'NL01N260' + a;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000, setOpen: 'bank',
      psd2Accounts: {
        [MAIN]: { uid: 'u1', iban: iban(MAIN), label: 'VINCENT ERNST SUMTER ··6222', bank: 'N26' },
        [SPAARPOT]: { uid: 'u2', iban: iban(SPAARPOT), label: 'VINCENT ERNST SUMTER ··4323', bank: 'N26' },
        [BUFFER]: { uid: 'u3', iban: iban(BUFFER), label: 'VINCENT ERNST SUMTER ··1123', bank: 'N26' },
      },
    }, set)),
    minder_own: JSON.stringify([MAIN, SPAARPOT, BUFFER, CSVPOT]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedSav());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof isSavingsAcc === 'function');
}

const stand = (page) => page.evaluate((m) => ({
  sav: n26SavingsAccounts().slice().sort(),
  savedNet: savedNet(m),
  savedThisMonth: savedThisMonth(m),
  keuze: JSON.parse(JSON.stringify(SET.savingsAcc || {})),
  ends: SET.savingsEnds || null,
}), CUR);

test.describe('a · de schakelaar werkt nu voor elk potje', () => {
  test('een CSV-potje is aan te zetten, en telt dan echt mee', async ({ page }) => {
    await boot(page);
    const voor = await stand(page);
    expect(voor.sav).not.toContain(CSVPOT);
    expect(voor.savedNet).toBe(290);                       // 200 + 90, zonder het CSV-potje

    await page.evaluate((a) => toggleSavingsAcct(a), CSVPOT);
    const na = await stand(page);
    expect(na.sav).toContain(CSVPOT);
    expect(na.savedNet).toBe(440);                         // + de 150 die er echt heen ging
    expect(na.savedThisMonth).toBe(440);
    expect(na.keuze[CSVPOT]).toBe(true);
  });

  test('en weer uit te zetten', async ({ page }) => {
    await boot(page);
    await page.evaluate((a) => { toggleSavingsAcct(a); toggleSavingsAcct(a); }, CSVPOT);
    const na = await stand(page);
    expect(na.sav).not.toContain(CSVPOT);
    expect(na.savedNet).toBe(290);
    expect(na.keuze[CSVPOT]).toBe(false);                  // expliciet uit, niet "geen keuze"
  });

  test('de oude last4-sleutel wordt niet meer geschreven', async ({ page }) => {
    await boot(page);
    await page.evaluate((a) => toggleSavingsAcct(a), CSVPOT);
    const na = await stand(page);
    expect(na.ends).toBeNull();                            // savingsEnds blijft ongemoeid
    expect(Object.keys(na.keuze)).toEqual([CSVPOT]);       // de sleutel is de rekening zelf
  });

  test('de schakelaar in de rekeningenlijst blijft staan waar je hem zet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('set'); openInkomenSheet(); });   // v183: de spaarvlag staat in de samengevoegde lijst
    // exact op de rekening selecteren: 'Buffer Rust' (CSV) en 'Buffer rust' (PSD2 ··1123) staan
    // allebei in de lijst, en hasText is hoofdletterongevoelig
    // v183: de rij draagt zijn rekening-id, dus er hoeft niet op opmaak gemikt te worden
    const rij = page.locator(`#sheet [data-acc="${CSVPOT}"]`);
    await expect(rij).toContainText('Buffer Rust');        // v120: de naam uit de bestandsimport
    // de checkbox zelf is visueel verborgen achter de schuif; je klikt het label (.sw)
    await rij.locator('label.sw').click();
    await page.waitForFunction((a) => isSavingsAcc(a), CSVPOT);
    // opnieuw renderen: de schakelaar mag niet terugspringen
    await page.evaluate(() => { renderSet(); });
    expect(await page.evaluate((a) => isSavingsAcc(a), CSVPOT)).toBe(true);
  });
});

test.describe('b · drietraps: geen keuze = de standaard beslist', () => {
  test('zonder enige keuze zijn 4323 en 1123 gewoon spaarrekeningen', async ({ page }) => {
    await boot(page);
    const s = await stand(page);
    expect(s.sav).toEqual([BUFFER, SPAARPOT].sort());
    expect(s.keuze).toEqual({});                           // niets opgeslagen, puur de default
  });

  test('een eigen "uit" wint van de standaard', async ({ page }) => {
    await boot(page);
    await page.evaluate((a) => toggleSavingsAcct(a), SPAARPOT);
    const s = await stand(page);
    expect(s.sav).not.toContain(SPAARPOT);
    expect(s.keuze[SPAARPOT]).toBe(false);
    expect(s.savedNet).toBe(90);                           // alleen de buffer nog
  });
});

test.describe('c · migratie van savingsEnds', () => {
  test('een afwijkende lijst wordt één keer omgezet naar keuzes per rekening', async ({ page }) => {
    // gebruiker had 1123 weggehaald en 6222 toegevoegd
    await boot(page, seedSav({ savingsEnds: ['4323', '6222'] }));
    const s = await stand(page);
    expect(s.keuze[BUFFER]).toBe(false);                   // week af van de standaard -> vastgelegd
    expect(s.keuze[MAIN]).toBe(true);
    expect(s.keuze[SPAARPOT]).toBeUndefined();             // gelijk aan de standaard -> geen keuze nodig
    expect(s.sav).toEqual([MAIN, SPAARPOT].sort());
    expect(s.ends).toEqual(['4323', '6222']);              // blijft staan, ongebruikt
    expect(await page.evaluate(() => SET.savingsAccMigrated)).toBeTruthy();
  });

  test('wie nooit iets omzette houdt precies dezelfde uitkomst', async ({ page }) => {
    await boot(page, seedSav({ savingsEnds: ['4323', '1123'] }));
    const s = await stand(page);
    expect(s.keuze).toEqual({});
    expect(s.sav).toEqual([BUFFER, SPAARPOT].sort());
  });

  test('de migratie overschrijft een bestaande keuze niet', async ({ page }) => {
    await boot(page, seedSav({ savingsEnds: ['4323'], savingsAcc: { [BUFFER]: true } }));
    const s = await stand(page);
    expect(s.keuze[BUFFER]).toBe(true);                    // jouw keuze blijft, ook al zegt de lijst nee
    expect(s.sav).toContain(BUFFER);
  });

  test('een tweede keer migreren draait de keuze niet terug', async ({ page }) => {
    await boot(page, seedSav({ savingsEnds: ['4323', '6222'] }));
    await page.evaluate((a) => toggleSavingsAcct(a), MAIN);   // migratie zette true, gebruiker zet uit
    expect(await page.evaluate((a) => isSavingsAcc(a), MAIN)).toBe(false);
    // migrateSavingsAcc draait bij elke start; de vlag moet 'm stil houden
    await page.evaluate(() => migrateSavingsAcc());
    expect(await page.evaluate((a) => isSavingsAcc(a), MAIN)).toBe(false);
    // en ook zonder die vlag mag hij een bestaande keuze niet overschrijven
    await page.evaluate(() => { SET.savingsAccMigrated = 0; migrateSavingsAcc(); });
    expect(await page.evaluate((a) => isSavingsAcc(a), MAIN)).toBe(false);
  });
});
