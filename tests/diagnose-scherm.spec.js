// v244: het verborgen diagnosescherm onder Instellingen.
//
// WAAROM HET BESTAAT. De gegevens van de gebruiker staan alleen op zijn eigen toestel en verlaten
// het nooit. Loopt er iets anders dan in deze fixtures, dan is dat alleen daar te zien, en op een
// telefoon is er geen console. Dit scherm leest die staat uit.
//
// DE VOORWAARDE IS HARD EN DIT BESTAND IS DE PLEK WAAR HIJ STAAT: kijken verandert niets. Geen
// save(), niets naar SET, niets naar localStorage, en planMove() wordt niet uitgevoerd maar
// nagerekend. Gemeten op localStorage.setItem en niet alleen op de inhoud achteraf: een schrijver
// die dezelfde waarde terugzet is ook een schrijver, en byte-gelijkheid ziet die niet.
//
// EN HIJ MOET KUNNEN GROEIEN. DIAG_BLOKKEN is de enige plek waar staat welke blokken er zijn; het
// scherm en diagTekst() weten van geen enkel blok af. De test daarop voegt er tijdens de run een
// blok aan toe en eist dat het in de uitvoer staat, want dat is de eigenschap die we willen
// vasthouden en niet het aantal van vijf.
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
    add('i' + m, MAIN, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '03', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  add('s' + M2, SPAAR, M2, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  add('s' + M1, SPAAR, M1, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000, [SPAAR]: 9000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 3000,
    savingsAcc: { [SPAAR]: true },
    // buffer van 40.000 met 9.000 toegewezen: de grendel zit dicht
    nfDoelVast: o.nfDoel != null ? o.nfDoel : 40000,
    nfToegewezen: o.nfToe != null ? o.nfToe : 9000,
    nfToegewezenMigrated: true,
    goals: o.goals || [],
    planAlloc: { noodfonds: { allocMode: 'auto' } },
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
const DRIE = [
  { id: 'g1', naam: 'Vakantie', doel: 3000, gespaard: 0, allocMode: 'fixed', perMaand: 500, streefdatum: '2028-06' },
  { id: 'g2', naam: 'Auto', doel: 16000, gespaard: 0, allocMode: 'fixed', perMaand: 800, streefdatum: '2029-01' },
];
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagOpen === 'function');
}
// De schrijfteller moet eerder staan dan de handeling die we meten, dus hij gaat er ná de boot in.
async function telSchrijvers(page) {
  await page.evaluate(() => {
    window.__setCalls = [];
    const echt = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) { window.__setCalls.push(k); return echt(k, v); };
  });
}
const KEYS = ['minder_tx', 'minder_ovr', 'minder_set', 'minder_own', 'minder_accmeta', 'minder_plan', 'minder_view'];
const dump = (page) => page.evaluate((ks) => {
  const o = {}; for (const k of ks) o[k] = localStorage.getItem(k); return o;
}, KEYS);
const uit = (page) => page.evaluate(() => document.querySelector('#diagUit').value);
async function open(page) {
  await page.evaluate(() => diagOpen());
  await page.waitForFunction(() => {
    const el = document.querySelector('#diagUit');
    return el && el.value.indexOf('=== EINDE ===') > -1;
  });
}

test.describe('a · kijken verandert niets', () => {
  test('localStorage is voor en na het openen byte-gelijk', async ({ page }) => {
    await boot(page, { goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } });
    const voor = await dump(page);
    await open(page);
    expect(await dump(page)).toEqual(voor);
  });

  test('er gaat geen enkele schrijfopdracht naar localStorage', async ({ page }) => {
    await boot(page, { goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } });
    await telSchrijvers(page);
    await open(page);
    // de teller vangt ook een schrijver die dezelfde waarde terugzet; byte-gelijkheid doet dat niet
    expect(await page.evaluate(() => window.__setCalls)).toEqual([]);
  });

  test('de volgorde staat er na het openen nog precies zo, ook bij een dichte grendel', async ({ page }) => {
    await boot(page, { goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } });
    await open(page);
    expect(await page.evaluate(() => SET.planOrder)).toEqual(['noodfonds', 'g1', 'g2']);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).planOrder))
      .toEqual(['noodfonds', 'g1', 'g2']);
  });

  test('blok 4 rekent na en voert niet uit: een verkeerd opgeslagen volgorde blijft verkeerd staan',
    async ({ page }) => {
      // planMove() zou hier corrigeren noch bewaren; het scherm mag hem al helemaal niet aanraken
      await boot(page, { goals: DRIE, set: { planOrder: ['g1', 'noodfonds', 'g2'] } });
      await open(page);
      const t = await uit(page);
      expect(t).toContain('GEBLOKKEERD');
      expect(await page.evaluate(() => SET.planOrder)).toEqual(['g1', 'noodfonds', 'g2']);
    });
});

test.describe('b · de ingang', () => {
  test('een lange druk op de voetregel opent het scherm', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await page.evaluate(() => go('set'));
    const voet = page.locator('#setVoet');
    await expect(voet).toBeVisible();
    // hover() scrollt hem eerst in beeld. Zonder dat staat de voetregel onder de vouw en landt
    // page.mouse ergens anders; de test slaagde dan om de verkeerde reden.
    await voet.hover();
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await page.waitForFunction(() => {
      const el = document.querySelector('#diagUit');
      return el && el.value.indexOf('=== EINDE ===') > -1;
    });
    await expect(page.locator('#sheetBg')).toHaveClass(/show/);
  });

  test('een korte tik opent hem niet en telt nog gewoon als vijf-tik', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await page.evaluate(() => go('set'));
    await page.locator('#setVoet').click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => !!document.querySelector('#diagUit'))).toBe(false);
    expect(await page.evaluate(() => window._advTaps)).toBe(1);
  });

  test('de tik die na een lange druk afgaat telt niet mee als vijf-tik', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await page.evaluate(() => go('set'));
    await page.locator('#setVoet').hover();
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await page.waitForTimeout(200);
    // eerst vaststellen dat de lange druk echt is afgegaan, anders bewijst de teller niets
    expect(await page.evaluate(() => !!document.querySelector('#diagUit'))).toBe(true);
    expect(await page.evaluate(() => window._advTaps || 0)).toBe(0);
  });

  test('en de volgende echte tik wordt daarna weer geteld', async ({ page }) => {
    // de onderdrukking is een tijdstempel en geen vlag: zodra de sheet openstaat dekt hij de
    // voetregel af, dus de klik bereikt bankAdvTap() niet en een vlag zou blijven staan
    await boot(page, { goals: DRIE });
    await page.evaluate(() => go('set'));
    await page.locator('#setVoet').hover();
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();
    await page.evaluate(() => closeSheet());
    await page.waitForTimeout(1300);
    await page.locator('#setVoet').click();
    expect(await page.evaluate(() => window._advTaps)).toBe(1);
  });
});

test.describe('c · wat er in staat', () => {
  test('elk blok uit DIAG_BLOKKEN staat met zijn titel in de uitvoer', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await open(page);
    const t = await uit(page);
    const titels = await page.evaluate(() => DIAG_BLOKKEN.map((b) => b.titel));
    expect(titels.length).toBeGreaterThan(0);
    titels.forEach((titel, i) => expect(t).toContain(`-- ${i + 1}. ${titel} --`));
  });

  test('een blok erbij is een entry erbij: het scherm hoeft niet verbouwd', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await page.evaluate(() => DIAG_BLOKKEN.push({ titel: 'verzonnen blok', lees: () => ['regel uit het verzonnen blok'] }));
    await open(page);
    const t = await uit(page);
    expect(t).toContain('verzonnen blok');
    expect(t).toContain('regel uit het verzonnen blok');
  });

  test('een blok dat een promise teruggeeft wordt afgewacht', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await page.evaluate(() => DIAG_BLOKKEN.push({
      titel: 'traag blok',
      lees: () => new Promise((r) => setTimeout(() => r(['regel na de wachttijd']), 120)),
    }));
    await open(page);
    expect(await uit(page)).toContain('regel na de wachttijd');
  });

  test('een blok dat stukgaat neemt de rest niet mee', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await page.evaluate(() => DIAG_BLOKKEN.push({ titel: 'stuk blok', lees: () => { throw new Error('kapot'); } }));
    await open(page);
    const t = await uit(page);
    expect(t).toContain('FOUT: kapot');
    expect(t).toContain('=== EINDE ===');
  });

  test('blok 1 laat zien of planMove() de grendelcheck draagt', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await open(page);
    expect(await uit(page)).toContain('planMove draagt de grendelcheck: JA');
  });

  test('blok 3 noemt het veld waar de getoonde toegewezen-regel zijn bedrag haalt', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await open(page);
    const t = await uit(page);
    // de getoonde regel wordt door planRegel() zelf geschreven, niet nagebouwd: één bron per getal
    expect(t).toContain('komt uit planRegel(), veld p.gespaard / veld p.doel');
    expect(t).toMatch(/€\s?9\.000 toegewezen \/ €\s?40\.000/);
    expect(t).toContain('p.gespaard = 9000');
    expect(t).toContain('p.doel     = 40000');
    expect(t).toContain('scherm en grendel lezen hetzelfde: JA');
  });

  test('blok 3 zet de twee te-gaan-bedragen naast elkaar en meldt het als ze uiteenlopen',
    async ({ page }) => {
      // toegewezen op het doel (grendel open), gemeten spaarsaldo eronder: twee bronnen, twee uitkomsten
      await boot(page, { nfDoel: 10000, nfToe: 10000, goals: DRIE });
      await open(page);
      const t = await uit(page);
      expect(t).toContain('te gaan volgens het PLAN   (doel - nfToegewezen): 0');
      expect(t).toContain('te gaan volgens de BUFFER  (doel - spaarsaldo):   1000');
      expect(t).toContain('planGrendel(): null');
    });

  test('blok 4 en blok 5 beslissen hetzelfde over de grendel', async ({ page }) => {
    await boot(page, { goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } });
    await open(page);
    const t = await uit(page);
    expect(t).toContain('grendel dicht: JA');
    expect(t).toContain('wacht op de buffer');
    expect(t).toMatch(/Noodfonds \(noodfonds\) omlaag: GEBLOKKEERD/);
  });
});

test.describe('d · het scherm zelf', () => {
  test('de uitvoer staat in een tekstvak met een kopieerknop', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await open(page);
    await expect(page.locator('#diagUit')).toHaveAttribute('readonly', '');
    await expect(page.locator('#diagCopy')).toBeVisible();
  });

  test('het scherm zegt wat het in handen geeft', async ({ page }) => {
    await boot(page, { goals: DRIE });
    await open(page);
    const kop = await page.evaluate(() => document.querySelector('#sheet').textContent);
    expect(kop).toContain('leest alleen');
    expect(kop).toContain('blijft op dit toestel');
  });

  test('past op 360 en 390px zonder horizontaal schuiven', async ({ page }) => {
    for (const breedte of [360, 390]) {
      await page.setViewportSize({ width: breedte, height: 640 });
      await boot(page, { goals: DRIE });
      await open(page);
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, 'breedte ' + breedte).toBeLessThanOrEqual(0);
    }
  });
});
