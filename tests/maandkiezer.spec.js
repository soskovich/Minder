// v176: er was geen maandkiezer, dus Inzichten en Maand konden alleen de lopende maand tonen.
// Eén bron voor "welke maand kijk ik" (curMonth, module-state dus sessiegebonden), gedeeld door
// beide schermen. De lopende maand is altijd de standaard.
// KRITIEK: standen die een rekeningsaldo van NU lezen - buffer, dekking, aansluiting, aankoopdoel -
// worden bij een afgesloten maand niet getoond. Ze met de huidige waarde onder een historische kop
// zetten zou suggereren dat je buffer toen op dat niveau stond.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { kaalBron, kaalUit } = require('./bron-kaal');

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
const kies = async (page, m) => { await page.evaluate((x) => ((m)=>{ curMonth=m; window._insPer=null; closeSheet(); render(); })(x), m);
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
    /* v340: SET.afsluitPopup draagt de maand die je afsluit, en dat is per constructie de vorige maand
       (afsluitMaand()), los van de kiezer. Die ene sleutel telt daarom niet als de keuze. */
    const opslag = await page.evaluate(() => { const S = Object.assign({}, SET);
      const af = S.afsluitPopup; delete S.afsluitPopup; return { rest: JSON.stringify(S), af: af ? af.maand : null, afMaand: afsluitMaand() }; });
    expect(opslag.rest).not.toContain(VORIGE);
    if (opslag.af) expect(opslag.af).toBe(opslag.afMaand);
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
  /* v359: de maandkiezer is vervangen door het filter (periode en soort). Het bereik blijft months(): vorige
     maand staat er alleen als er een vorige maand met boekingen is, en een toekomstige maand niet. */
  test('het filter biedt alleen periodes die er zijn', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { openInsFilter();
      return [...document.querySelectorAll('#insFilterSheet [data-insopt^="per:"]')]
        .map((e) => ({ k: e.dataset.insopt, uit: e.classList.contains('off') })); });
    expect(r.map((x) => x.k)).toEqual(['per:nu', 'per:vorige', 'per:3', 'per:12']);
    expect(r.every((x) => !x.uit)).toBe(true);
    expect(JSON.stringify(r)).not.toContain(TOEKOMST);
  });

  test('een maand zonder data wordt genegeerd', async ({ page }) => {
    await boot(page);
    await page.evaluate((t) => ((m)=>{ curMonth=m; window._insPer=null; closeSheet(); render(); })(t), TOEKOMST);
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => kijkMaand())).toBe(await page.evaluate(() => thisYM()));
  });

  test('de eerste maand in de reeks is gewoon te kiezen', async ({ page }) => {
    await boot(page);
    await kies(page, EERSTE);
    expect(await page.evaluate(() => kijkMaand())).toBe(EERSTE);
    // v359: geen banner meer; het filter noemt de periode die je bekijkt
    expect(await page.evaluate(() => { go('ins'); return $('#insFilter').dataset.insper; })).not.toBe('nu');
  });
});

/* v233: de kiezer is van Maand af; het scherm heet Grip en leest altijd de lopende maand. Wat hier
   over Maand stond (banner, kop-als-kiezer, geen regels, geen oordeel, vlag niet gezet, geen
   gesprek) is vervallen, omdat er op Grip geen afgesloten maand meer bestaat. Wat ervoor in de
   plaats staat: de kiezer van Inzichten raakt Grip niet, en Grip noemt nergens een maand. */
test.describe('c · zichtbaar dat je niet naar nu kijkt', () => {
  /* v359: de banner en de kop-als-kiezer zijn vervangen door het filter bovenaan. Het filter zegt welke
     periode je bekijkt, en dat is de plek waar je ziet dat je niet naar nu kijkt. */
  test('ins: het filter zegt welke periode je bekijkt', async ({ page }) => {
    await boot(page);
    const nu = await page.evaluate(() => { go('ins'); return { k: $('#insFilter').dataset.insper, t: $('#insFilter').innerText }; });
    expect(nu.k).toBe('nu');
    await kies(page, VORIGE);
    const daarna = await page.evaluate(() => { go('ins'); return { k: $('#insFilter').dataset.insper, t: $('#insFilter').innerText }; });
    expect(daarna.k).not.toBe('nu');
    expect(daarna.t).not.toBe(nu.t);
    expect(await page.evaluate(() => $('#s-ins').innerHTML)).toContain('openInsFilter()');
  });

  test('Grip heeft geen kiezer en geen banner, ook niet als Inzichten op een eerdere maand staat', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    const h = await page.evaluate(() => { go('maand'); return $('#s-maand').innerHTML; });
    expect(h).not.toContain('openMaandKiezer()');
    expect(h).not.toContain('een afgesloten maand');
    expect(h).not.toContain('naarLopendeMaand()');
    expect(await page.evaluate(() => typeof maandKiezerChip)).toBe('undefined');
  });

  test('terug naar nu werkt vanuit het filter', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    await page.evaluate(() => insFilterZet('nu', null));
    await page.waitForTimeout(110);
    expect(await page.evaluate(() => kijkMaand())).toBe(await page.evaluate(() => thisYM()));
  });
});

test.describe('d · Grip leest altijd nu, de kiezer van Inzichten raakt hem niet', () => {
  test('met de kiezer op een eerdere maand rendert Grip byte-identiek', async ({ page }) => {
    await boot(page);
    const nu = await page.evaluate(() => { go('maand'); return $('#s-maand').innerHTML; });
    expect(nu).toContain('data-tegel="buffer"');   // v340: de bufferregel is een tegel
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
    /* v315: maandPlanRegels() is vervallen. v340: maandVanafRegels() ook; wat vanaf volgende maand
       verandert leest de tijdlijn uit maandVanafData(). Alle bouwstenen van Grip worden gelezen. */
    const src = await kaalUit(page, 'renderMaand', 'maandIngang', 'maandCoachIngang', 'maandVanafData',
      'gripTegels', 'gripLetOpItems', 'dezeMaandKaart', 'gripTijdlijnData', 'renderMaandBeslisSheet');
    expect(src).not.toMatch(/kijkMaand\(\)|curMonth/);
  });

  test('wat wel per maand rekent blijft staan', async ({ page }) => {
    await boot(page);
    await kies(page, VORIGE);
    const maand = await tekst(page, 'maand');
    // v223: de kop 'Vermogensopbouw' is met de kaartschil vervallen; het cijfer zelf bleef.
    // v232: de spaarquote staat op Vermogen en niet meer op Maand, ook niet bij een andere maand.
    expect(maand).not.toMatch(/spaarquote/i);
    const ins = await tekst(page, 'ins');
    expect(ins).toMatch(/uitgegeven/i);                // de budgetstand rekent door
    // v359: een afgesloten maand draagt de uitkomst tegen je potjes, en geen tempo of dagteller
    expect(ins).toMatch(/in je potjes/i);
    expect(ins).not.toMatch(/tot vandaag/i);
  });

  test('wat over het nu gaat verdwijnt', async ({ page }) => {
    await boot(page);
    // v359: 'Nog deze maand' is opgegaan in de tegels; een afgesloten maand draagt alleen wat er uitkwam
    expect(await tekst(page, 'ins')).toMatch(/nog te betalen/i);
    await kies(page, VORIGE);
    const t = await tekst(page, 'ins');
    expect(t).not.toMatch(/nog te betalen/i);
    expect(t).not.toMatch(/nog te ontvangen/i);
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
    expect(/isLopendeMaand\(\)/.test(await kaalUit(page, 'go'))).toBe(false);   // de guard is weg
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
    expect(t).not.toMatch(/NaN|Infinity|undefined/);
    const maand = await tekst(page, 'maand');
    expect(maand).not.toMatch(/NaN|Infinity|undefined/);
  });
});
