// v176: er was geen maandkiezer, dus Inzichten en Maand konden alleen de lopende maand tonen.
// Eén bron voor "welke maand kijk ik" (curMonth, module-state dus sessiegebonden), gedeeld door
// beide schermen. De lopende maand is altijd de standaard.
// KRITIEK: standen die een rekeningsaldo van NU lezen - buffer, dekking, aansluiting, aankoopdoel -
// worden bij een afgesloten maand niet getoond. Ze met de huidige waarde onder een historische kop
// zetten zou suggereren dat je buffer toen op dat niveau stond.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

// v177: de app legt de LOKALE dag vast (vandaagYMD), niet de UTC-dag. Tussen middernacht
// en 02:00 zomertijd verschillen die, en dan toonde "Gelezen op" de dag ervoor.
const vandaag = () => { const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [3, 2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[3], VORIGE = MS[2], EERSTE = MS[0];
const TOEKOMST = ym(new Date(now.getFullYear(), now.getMonth() + 1, 1));

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of MS) {
    add(m, '02', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    // de eerste maand krijgt bewust weinig: dat is het "weinig data"-geval
    if (!(o.dun && m === EERSTE)) add(m, '05', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '26', 200, 'Spaarpot', 'NAAR SPAREN', SAV);
  }
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 1500, [SAV]: 9000 }, savingsEnds: ['4323'],
    budgets: { huur: 900, boodschappen: 600 },
    nfDoelVast: 4000, nfToegewezen: 4000, nfToegewezenMigrated: 1,
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof kijkMaand === 'function');
}
const kies = async (page, m) => { await page.evaluate((x) => zetKijkMaand(x), m);
  await page.waitForTimeout(120); };
const tekst = async (page, scherm) => { await page.evaluate((n) => go(n), scherm);
  await page.waitForTimeout(120);
  return page.evaluate((n) => $('#s-' + n).innerText.replace(/\s+/g, ' '), scherm); };

test.describe('a · de lopende maand is de standaard', () => {
  test('bij het openen staat de kiezer op nu', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => kijkMaand())).toBe(CUR === undefined ? null : await page.evaluate(() => thisYM()));
  });

  test('een keuze overleeft geen herstart', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    expect(await page.evaluate(() => kijkMaand())).toBe(VORIGE);
    await page.reload();
    await page.waitForFunction(() => typeof kijkMaand === 'function');
    expect(await page.evaluate(() => kijkMaand())).toBe(await page.evaluate(() => thisYM()));
    // en de keuze staat nergens in de opslag
    expect(await page.evaluate(() => JSON.stringify(SET))).not.toContain(VORIGE);
  });

  test('de keuze blijft wel staan binnen de sessie, ook tussen de schermen', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    await page.evaluate(() => go('maand'));
    await page.waitForTimeout(110);
    expect(await page.evaluate(() => kijkMaand())).toBe(VORIGE);
    await page.evaluate(() => go('ins'));
    await page.waitForTimeout(110);
    expect(await page.evaluate(() => kijkMaand())).toBe(VORIGE);
  });
});

test.describe('b · het bereik is months(), niet meer', () => {
  test('geen toekomst en niets vóór je eerste boeking', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { openMaandKiezer();
      return [...document.querySelectorAll('#sheet .chip')].map((e) => e.getAttribute('onclick')); });
    const ms = await page.evaluate(() => months());
    expect(r.length).toBe(ms.length);
    for (const m of ms) expect(r.join(' ')).toContain(`zetKijkMaand('${m}')`);
    expect(r.join(' ')).not.toContain(TOEKOMST);
  });

  test('een maand zonder data wordt genegeerd', async ({ page }) => {
    await boot(page);
    await page.evaluate((t) => zetKijkMaand(t), TOEKOMST);
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => kijkMaand())).toBe(await page.evaluate(() => thisYM()));
  });

  test('de eerste maand in de reeks is gewoon te kiezen', async ({ page }) => {
    await boot(page);
    await kies(page, EERSTE);
    expect(await page.evaluate(() => kijkMaand())).toBe(EERSTE);
    expect(await tekst(page, 'ins')).toContain('een afgesloten maand');
  });
});

test.describe('c · zichtbaar dat je niet naar nu kijkt', () => {
  for (const scherm of ['ins', 'maand']) {
    test(`${scherm}: de banner staat er bij een afgesloten maand, en niet bij nu`, async ({ page }) => {
      await boot(page);
      expect(await tekst(page, scherm)).not.toContain('een afgesloten maand');
      await kies(page, VORIGE);
      const t = await tekst(page, scherm);
      expect(t).toContain('een afgesloten maand');
      expect(t).toMatch(/Terug naar/);
    });

    test(`${scherm}: de kop is de kiezer`, async ({ page }) => {
      await boot(page);
      await page.evaluate((n) => go(n), scherm);
      await page.waitForTimeout(110);
      expect(await page.evaluate((n) => $('#s-' + n).innerHTML, scherm)).toContain('openMaandKiezer()');
    });
  }

  test('terug naar nu werkt vanaf de banner', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    await page.evaluate(() => naarLopendeMaand());
    await page.waitForTimeout(110);
    expect(await page.evaluate(() => kijkMaand())).toBe(await page.evaluate(() => thisYM()));
  });
});

test.describe('d · standen van nu staan niet onder een historische kop', () => {
  test('geen enkele maandregel wordt historisch getoond', async ({ page }) => {
    await boot(page);
    const nu = await tekst(page, 'maand');
    expect(nu).toMatch(/buffer in maanden/i);          // op de lopende maand staan ze er wel
    await kies(page, VORIGE);
    const oud = await tekst(page, 'maand');
    for (const woord of ['Buffer in maanden', 'Dekking reserveringen', 'Aansluiting spaargeld',
      'Patroon van de maand']) {
      expect(oud, woord).not.toContain(woord);
    }
    expect(oud).toMatch(/niet met terugwerkende kracht/);
  });

  test('geen oordeelzin die iets beoordeelt wat er niet staat', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    const t = await tekst(page, 'maand');
    for (const zin of ['regels staan goed', 'ontbreekt te veel', 'vraagt een beslissing',
      'vraagt aandacht', 'niets te beoordelen']) {
      expect(t, zin).not.toContain(zin);
    }
  });

  test('wat wel per maand rekent blijft staan', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    const maand = await tekst(page, 'maand');
    expect(maand).toMatch(/kerncijfers/i);             // spaarquote en vaste-lastendruk per maand
    const ins = await tekst(page, 'ins');
    expect(ins).toMatch(/uitgegeven/);                 // de budgetstand rekent door
    expect(ins).toMatch(/hele maand/);                 // en niet meer "dag x van y"
  });

  test('wat over het nu gaat verdwijnt', async ({ page }) => {
    await boot(page);
    expect(await tekst(page, 'ins')).toMatch(/nog deze maand/i);
    await kies(page, VORIGE);
    const t = await tekst(page, 'ins');
    expect(t).not.toMatch(/nog deze maand/i);
    expect(t).not.toMatch(/nog te betalen/i);
    expect(t).not.toMatch(/abonnementen/i);
    /* "loopt nog" mag nog wel in de meermaands-grafiek staan: dat is de legenda bij de ster van de
       huidige maand, en die grafiek gaat per definitie over alle maanden. In de herokaart hoort hij
       niet, want die gaat over de gekozen maand. */
    const hero = await page.evaluate(() => ($('#s-ins .card') || {}).innerText || '');
    expect(hero).not.toMatch(/loopt nog/i);
  });
});

test.describe('e · maandGelezen blijft van de lopende maand', () => {
  test('een afgesloten maand bekijken zet de vlag niet', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    await page.evaluate(() => go('maand'));
    await page.waitForTimeout(130);
    expect(await page.evaluate(() => SET.maandGelezen)).toBe(undefined);
  });

  test('en onderdrukt de structurele signalen van nu niet', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => maandStructureel().map((r) => r.key));
    await kies(page, VORIGE);
    await page.evaluate(() => go('maand'));
    await page.waitForTimeout(130);
    expect(await page.evaluate(() => maandStructureel().map((r) => r.key))).toEqual(voor);
  });

  test('de lopende maand bekijken zet hem wel', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    await page.waitForTimeout(130);
    expect(await page.evaluate(() => SET.maandGelezen)).toBe(vandaag());
  });
});

test.describe('f · alleen kijken', () => {
  test('geen afspraak-ingang en geen coachgesprek in een afgesloten maand', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    const h = await page.evaluate(() => $('#s-maand').innerHTML);
    expect(h).not.toContain("coStart('maand'");
    expect(h).not.toContain('coAfspraakOpen');
    const ins = await page.evaluate(() => { go('ins'); return $('#s-ins').innerHTML; });
    expect(ins).not.toContain("coStart('lek'");
  });

  test('een maand met weinig data toont wat er is en verzint niets', async ({ page }) => {
    await boot(page, seed({ dun: true }));
    await kies(page, EERSTE);
    const t = await tekst(page, 'ins');
    expect(t).toContain('een afgesloten maand');
    expect(t).not.toMatch(/NaN|Infinity|undefined/);
    const maand = await tekst(page, 'maand');
    expect(maand).not.toMatch(/NaN|Infinity|undefined/);
  });
});
