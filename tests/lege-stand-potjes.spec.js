/* v311: DE POTJES VERDWIJNEN NIET VAN DE PAGINA OP EEN DAG ZONDER BOEKINGEN VAN DEZE MAAND.
 *
 * DE OUDE VORM zette `onbekend` als hoofdgetal, en dan was het grootste getal van het scherm een
 * WOORD en stond je potjesbedrag nergens meer. Wat er nu staat is dat bedrag, met `uitgegeven: nog
 * onbekend` eronder.
 * HET IS EEN BUDGET EN GEEN RESTANT, en het verschil zit in het WOORD: met nul boekingen is het
 * restant rekenkundig gelijk aan het budget, dus "nog in je potjes" zou hetzelfde cijfer tonen en
 * tegelijk beweren dat er gemeten is wat je gebruikte (v59/v73/v173). Die gelijkheid staat als
 * assertie vast, want zonder haar is "het is het budget" niet van "het is het restant" te scheiden.
 */
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN = 'NL01MAIN0000001111', PSD = 'psd2acc0001';
const now = vasteDatum();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));

/* DE FIXTURE DRAAGT GEEN ENKELE BOEKING IN DE LOPENDE MAAND, want dat is het geval. De laatste
   boeking ligt in M1, dus `laatsteImport().datum < CUR+'-01'` en de lege tak vuurt. */
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1]) {
    add('i' + m, m, '05', 3000, 'Werkgever', 'SALARIS LOON');
    add('b' + m, m, '08', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('e' + m, m, '12', -150, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    add('h' + m, m, '20', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  }
  const set = Object.assign({
    limit: 70, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 2500 },
    budgets: { boodschappen: 500, uiteten: 150, overig: 120, huur: 900 },
    bufferNorm: 3,
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o, w) {
  await pinDag(page);
  if (w) await page.setViewportSize({ width: w, height: 800 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insTegelsNu === 'function' && TX.length > 0);
}
const koppel = (exp) => ({ set: { psd2Accounts: { [PSD]: { uid: 'u1', iban: 'NL99PSD20000000001',
  hash: '', label: 'Main', bank: 'N26', exp: exp || '2099-01-01' } } } });
const kaart = (page) => page.evaluate(() => { go('ins'); renderIns(); return $('#insStand').innerText.replace(/\s+/g, ' '); });

test.describe('a - de invoer draagt het geval', () => {
  /* v359: DE VORM OP DE TEGELS. Zonder boekingen van deze maand zegt Uitgegeven "onbekend", en de tegel van je
     potjes heet "In je potjes" met het budget: met nul boekingen is het restant rekenkundig het hele budget,
     en "nog in potjes" zou een meting claimen. De reden en de stap om bij te werken staan in de sheet. */
  test('zonder boekingen van deze maand: onbekend, je budget als budget, en de reden in de sheet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { go('ins'); renderIns();
      const q = (k) => { const e = document.querySelector(`#insTegels [data-instegel="${k}"]`); return e ? e.innerText.replace(/\s+/g, ' ') : ''; };
      const L = laatsteImport(); const VP = varPotjeStand(thisYM());
      openInsTegel('uitgegeven'); const sh = $('#sheet').innerText.replace(/\s+/g, ' ');
      return { uit: q('uitgegeven'), pot: q('potjes'), oud: L.datum < thisYM() + '-01', nog: VP.nog, budget: VP.budget + VP.terug, sh, cta: importCta().lab }; });
    expect(r.oud, 'de fixture moet werkelijk geen boeking in deze maand dragen').toBe(true);
    expect(r.uit).toMatch(/Uitgegeven onbekend/);
    expect(r.uit).not.toMatch(/€0/);
    expect(r.pot).toMatch(/^In je potjes/);
    expect(r.pot).not.toMatch(/Nog in potjes/);
    expect(r.pot).toContain('uitgegeven nog onbekend');
    expect(r.sh).toContain('Nul uitgaven en geen data zijn niet hetzelfde');
    expect(r.sh).toContain(r.cta);
  });

  /* v359: 'geen enkele boeking in de lopende maand, en de lege tak vuurt' is vervallen: de stand-kaart op Inzichten bestaat niet meer; de vorm op de tegels staat in blok a hieronder */
});

test.describe('b - het potjesbedrag staat er, als budget en niet als restant', () => {
  /* v359: 'zonder variabele potjes blijft de oude vorm staan' is vervallen: de stand-kaart op Inzichten bestaat niet meer; de vorm op de tegels staat in blok a hieronder */
});

test.describe('b2 - de lopende-maand-eis is een guard die het scherm niet kan bereiken', () => {
  /* v359: 'een andere maand krijgt het potjesbedrag van nu niet' is vervallen: de stand-kaart op Inzichten bestaat niet meer; de vorm op de tegels staat in blok a hieronder */
});

test.describe('c - de handeling volgt de gebruiker', () => {
  /* v359: 'zonder koppeling: Bestand toevoegen' is vervallen: de stand-kaart op Inzichten bestaat niet meer; de vorm op de tegels staat in blok a hieronder */

  test('een verlopen koppeling krijgt opnieuw verbinden en niet vernieuwen', async ({ page }) => {
    await boot(page, koppel('2020-01-01'));
    /* v280: "vernieuwen is precies wat net niets opleverde", dus een koppeling die geen gegevens
       ophaalt krijgt de inlog-route. Die tak komt uit die staande regel en niet uit deze ronde. */
    const r = await page.evaluate(() => ({ cta: importCta(), stand: bankStand() }));
    expect(r.stand.verlopen, 'de fixture moet werkelijk verlopen zijn, anders toetst dit niets').toBe(true);
    expect(r.cta.lab).toBe('Opnieuw verbinden');
    expect(r.cta.act).toContain('psd2Connect');
  });

  test('de herinnering op Home leest dezelfde zin als de knop', async ({ page }) => {
    await boot(page, koppel());
    const r = await page.evaluate(() => {
      /* `renderReminder()` zei onvoorwaardelijk "Importeer je nieuwste bankbestand", en naast een
         knop "Vernieuwen" zijn dat twee handelingen in een regel. */
      const C = importCta();
      SET.lastImport = '2000-01-01';
      return { zin: C.zin, lab: C.lab, rem: renderReminder() };
    });
    expect(r.zin).toContain('Vernieuw je bankkoppeling');
    expect(r.rem).toContain(r.lab);
    expect(r.rem).toContain('Vernieuw je bankkoppeling');
    expect(r.rem).not.toContain('Importeer je nieuwste bankbestand');
  });

  test('de zin komt uit importCta en staat niet tweede keer in renderReminder', async ({ page }) => {
    await boot(page);
    const bron = await kaalUit(page, 'renderReminder');
    expect(bron).toContain('importCta()');
    expect(bron, 'de zin hoort uit de bron te komen').not.toContain('Importeer je nieuwste bankbestand');
  });
});

test.describe('d - de hoogte', () => {
  /* v359: de hoogte-eis van de lege stand-kaart (v241) is met die kaart vervallen. */
});
