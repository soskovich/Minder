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

/* v233: de kiezer is van Maand af; het scherm heet Grip en leest altijd de lopende maand. Wat hier
   over Maand stond (banner, kop-als-kiezer, geen regels, geen oordeel, vlag niet gezet, geen
   gesprek) is vervallen, omdat er op Grip geen afgesloten maand meer bestaat. Wat ervoor in de
   plaats staat: de kiezer van Inzichten raakt Grip niet, en Grip noemt nergens een maand. */
test.describe('c · zichtbaar dat je niet naar nu kijkt', () => {
  for (const scherm of ['ins']) {
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

  test('Grip heeft geen kiezer en geen banner, ook niet als Inzichten op een eerdere maand staat', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    const h = await page.evaluate(() => { go('maand'); return $('#s-maand').innerHTML; });
    expect(h).not.toContain('openMaandKiezer()');
    expect(h).not.toContain('een afgesloten maand');
    expect(h).not.toContain('naarLopendeMaand()');
    expect(await page.evaluate(() => typeof maandKiezerChip)).toBe('undefined');
  });

  test('terug naar nu werkt vanaf de banner', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    await page.evaluate(() => naarLopendeMaand());
    await page.waitForTimeout(110);
    expect(await page.evaluate(() => kijkMaand())).toBe(await page.evaluate(() => thisYM()));
  });
});

test.describe('d · Grip leest altijd nu, de kiezer van Inzichten raakt hem niet', () => {
  test('met de kiezer op een eerdere maand rendert Grip byte-identiek', async ({ page }) => {
    await boot(page);
    const nu = await page.evaluate(() => { go('maand'); return $('#s-maand').innerHTML; });
    expect(nu).toMatch(/buffer in maanden/i);
    await kies(page, VORIGE);
    const daarna = await page.evaluate(() => { go('maand'); return $('#s-maand').innerHTML; });
    expect(daarna).toBe(nu);
    expect(await page.evaluate(() => kijkMaand())).toBe(VORIGE);   // en Inzichten houdt zijn keuze
  });

  test('alles wat vanaf Grip een maand meegeeft, geeft de lopende maand mee', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    const r = await page.evaluate(() => { go('maand'); const h = $('#s-maand').innerHTML;
      return { maanden: [...h.matchAll(/coStart\('maand','(\d{4}-\d{2})'/g)].map((x) => x[1]),
        potjes: [...h.matchAll(/openPotjesVerdeling\('(\d{4}-\d{2})'/g)].map((x) => x[1]), nu: thisYM() }; });
    for (const m of r.maanden.concat(r.potjes)) expect(m).toBe(r.nu);
    const src = await page.evaluate(() => renderMaand.toString() + maandIngang.toString() + maandCoachIngang.toString() + maandPlanRegels.toString());
    expect(src.replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/kijkMaand\(\)|curMonth/);
  });

  test('wat wel per maand rekent blijft staan', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    const maand = await tekst(page, 'maand');
    // v223: de kop 'Vermogensopbouw' is met de kaartschil vervallen; het cijfer zelf bleef.
    // v232: de spaarquote staat op Vermogen en niet meer op Maand, ook niet bij een andere maand.
    expect(maand).not.toMatch(/spaarquote/i);
    const ins = await tekst(page, 'ins');
    expect(ins).toMatch(/uitgegeven/);                 // de budgetstand rekent door
    expect(ins).toMatch(/hele maand/);                 // en niet meer "dag x van y"
  });

  test('wat over het nu gaat verdwijnt', async ({ page }) => {
    await boot(page);
    // v241: de kop 'Nog deze maand' werd de sectiekop. v260: en heet weer 'Nog deze maand' (v91)
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

test.describe('e · maandGelezen is van de lopende maand', () => {
  test('Grip openen zet de vlag, ook als Inzichten op een eerdere maand staat', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    await page.evaluate(() => go('maand'));
    await page.waitForTimeout(130);
    expect(await page.evaluate(() => SET.maandGelezen)).toBe(vandaag());   // v233: Grip is altijd de lopende maand
    expect(await page.evaluate(() => /isLopendeMaand\(\)/.test(go.toString().replace(/\/\*[\s\S]*?\*\//g, '')))).toBe(false);   // de guard is weg
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
  test('geen coachgesprek op Inzichten in een afgesloten maand; Grip houdt zijn ingang', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => { go('maand'); return ($('#s-maand').innerHTML.match(/coStart\('maand'/g) || []).length; });
    await kies(page, VORIGE);
    const na = await page.evaluate(() => { go('maand'); return ($('#s-maand').innerHTML.match(/coStart\('maand'/g) || []).length; });
    expect(na).toBe(voor);   // v233: Grip leest nu, dus de kiezer verandert niets aan zijn ingang
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
