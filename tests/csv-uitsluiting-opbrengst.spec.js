/* v287: DE REGEL IN (c) NOEMT WAT DE UITSLUITING OPLEVERT EN WAT ZE KOST, IN DE TEGENWOORDIGE TIJD.
 *
 * DE AANLEIDING STAAT IN DE UITVOER VAN v286 ZELF, op het toestel. Sectie (c) zei per paar "wat het zou
 * kosten om deze csv-regels binnen het venster niet mee te tellen: 2120 euro" bij Main en 1373 bij Zakgeld.
 * Samen 3.493, en dat is exact het bedrag dat v284 optekende als het bedrag dat NIET LANGER DUBBEL telt.
 * Het label noemde dus de opbrengst een kostenpost, in de voorwaardelijke tijd terwijl v284 de uitsluiting
 * al had gebouwd, en met een getal dat niet de prijs is: die is 26 boekingen en 49 euro, en (d) rekent hem
 * al uit. Drie fouten in een label, en dat is de meetles over een label dat iets belooft wat de code niet
 * doet, nu in mijn eigen blok van drie rondes oud.
 *
 * DAARNAAST GAF BLOK 11 EEN ANDER ANTWOORD DAN METING 1 VAN BLOK 10 onder een gelijkende kop ("in de scope
 * van piekVerdeling()"): 2120 tegen 0. Allebei waar, want blok 11 leest bewust TX (v285) en meting 1 leest
 * de poort, maar die reden stond in CLAUDE.md en niet in de uitvoer. Dat verschil is precies waar v285 op
 * begon, en het staat er nu zelf bij.
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o en q: schrijf eerst op welk geval de
 * regel onderscheidt van de voor de hand liggende variant, en zorg dat een regel die KIEST meer dan een
 * kandidaat ziet):
 *  1. EEN PAAR WAARIN DE PRIJS LAGER IS DAN DE OPBRENGST. Main draagt drie csv-boekingen MET een psd2-
 *     tegenhanger en twee ZONDER. Zonder dat verschil zijn de twee regels niet te onderscheiden en blijft
 *     de sabotage die de prijs uit `sc` haalt groen;
 *  2. EEN PAAR WAARIN DE PRIJS NUL IS. Zakgeld matcht volledig. Zonder dat geval is het totaal niet te
 *     onderscheiden van "elk paar draagt dezelfde prijs";
 *  3. TWEE PAREN, want "over alle paren" is een optelling en bij een paar is die gelijk aan de rij zelf;
 *  4. EEN NIET-GEMATCHTE BOEKING BUITEN DE SCOPE (een opname, dus intern). Zonder dat geval geeft
 *     `csvNiet` hetzelfde antwoord als `csvNiet.filter(inScope)` en doet de scope-filter op de prijsregel
 *     niets;
 *  5. EEN PSD2-BOEKING ZONDER CSV-KANT binnen hetzelfde venster, zodat "overgebleven aan de psd2-kant"
 *     niet samenvalt met "niet gematcht aan de csv-kant".
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const CM = 'N26 Main', PM = '100110012555096222';
const CZ = 'N26 Zakgeld', PZ = '100110012848184840';

/* de bedragen staan als constante, want de asserties lezen ze terug en een getal in twee vormen loopt
   uiteen (v104). GEMATCHT is wat een tegenhanger heeft, LOS is wat er geen heeft. */
const M_GEMATCHT = [20, 30, 40];      // in scope, met tegenhanger: 90 euro
const M_LOS = [7, 8];                 // in scope, zonder tegenhanger: 15 euro
const M_LOS_INTERN = 200;             // zonder tegenhanger EN buiten de scope
const Z_GEMATCHT = [11, 12];          // Zakgeld matcht volledig: prijs nul

const rij = (acc, src, rows) => rows.map((r, i) => ({ id: acc + '_' + src + i, date: r.d, amount: r.a, acc, src,
  name: r.n, desc: r.desc || r.n, typ: '', ref: '', accName: '', refNums: [] }));

function seed() {
  const cm = [], pm = [], cz = [], pz = [];
  /* de richting, zodat de paring op twee gronden uitkomt (v284) */
  pm.push({ d: '2026-03-01', a: 25, n: 'in', desc: 'From Main to Main PMNT' });
  pm.push({ d: '2026-03-01', a: -26, n: 'uit', desc: 'From Main to Zakgeld PMNT' });
  pz.push({ d: '2026-03-01', a: 27, n: 'in', desc: 'From Main to Zakgeld PMNT' });
  pz.push({ d: '2026-03-01', a: -28, n: 'uit', desc: 'From Zakgeld to Main PMNT' });

  /* 1. MET een tegenhanger: dezelfde dag en hetzelfde bedrag aan beide kanten, andere desc dus andere id */
  M_GEMATCHT.forEach((a, i) => {
    const d = '2026-03-0' + (3 + i);
    cm.push({ d, a: -a, n: 'Plus de Gors' });
    pm.push({ d, a: -a, n: 'Plus de Gors', desc: 'Plus de Gors Purmerend PMNT' });
  });
  /* 1. ZONDER tegenhanger: geen psd2-regel met dit bedrag, waar dan ook op die rekening */
  M_LOS.forEach((a, i) => cm.push({ d: '2026-03-1' + (5 + i), a: -a, n: 'Lender Account' }));
  /* 4. zonder tegenhanger EN buiten de scope: een opname is intern en telde nooit als uitgave */
  cm.push({ d: '2026-03-19', a: -M_LOS_INTERN, n: 'Geldmaat', desc: 'GELDMAAT Purmerend' });
  /* 5. een psd2-regel zonder csv-kant: die blijft over aan de psd2-kant en is geen prijs */
  pm.push({ d: '2026-03-21', a: -60, n: 'Tango', desc: 'Tango Purmerend PMNT' });

  /* 2. Zakgeld matcht volledig, dus de prijs daar is nul */
  Z_GEMATCHT.forEach((a, i) => {
    const d = '2026-03-0' + (5 + i);
    cz.push({ d, a: -a, n: 'Kiosk' });
    pz.push({ d, a: -a, n: 'Kiosk', desc: 'Kiosk Purmerend PMNT' });
  });

  const alles = rij(CM, 'csv', cm).concat(rij(PM, 'psd2', pm))
    .concat(rij(CZ, 'csv', cz)).concat(rij(PZ, 'psd2', pz));
  const ps = {};
  for (const [a, l] of [[PM, 'Main'], [PZ, 'Zakgeld']])
    ps[a] = { uid: 'u-' + l, iban: 'DE89' + a, hash: 'h-' + l, label: l, bank: 'N26', exp: '2026-12-27' };
  return {
    minder_tx: JSON.stringify(alles), minder_ovr: '{}',
    minder_own: JSON.stringify([...new Set(alles.map((t) => t.acc))]),
    minder_accmeta: JSON.stringify({ [PM]: { balance: 500, date: '2026-09-28' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {},
      budgets: { boodschappen: 400, overig: 400 },
      psd2Accounts: ps, psd2LastSync: Date.now() }),
    minder_plan: '{}',
  };
}

async function boot(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagCsvPsd2 === 'function');
}
const blok = (page) => page.evaluate(() => diagCsvPsd2().join('\n'));
/* de regels van EEN paar in sectie (c): vanaf zijn kopregel tot de volgende kop of het totaal */
function paarStuk(t, csv) {
  const r = t.split('\n');
  const a = r.findIndex((x) => x.includes(csv + ' -> ') && x.includes('venster '));
  if (a < 0) return '';
  const rest = r.slice(a + 1);
  const b = rest.findIndex((x) => x.includes(' -> ') || x.includes('OVER ALLE PAREN'));
  return [r[a]].concat(b < 0 ? rest : rest.slice(0, b)).join('\n');
}
const getal = (s, re) => { const m = s.match(re); return m ? +m[1] : null; };

test.describe('0 · de fixture draagt de gevallen waarop de regels uiteenlopen', () => {
  test('twee paren, en beide gronden wijzen dezelfde rekening aan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => csvPsd2Paring().map((x) => ({ csv: x.csv, psd2: x.psd2 })));
    const map = {}; for (const x of r) map[x.csv] = x.psd2;
    expect(map[CM]).toBe(PM);
    expect(map[CZ]).toBe(PZ);
    /* twee, want bij een paar is "over alle paren" gelijk aan de rij zelf en toetst het totaal niets */
    expect(Object.keys(map).length).toBe(2);
  });

  test('bij Main is de prijs LAGER dan de opbrengst, bij Zakgeld is hij nul', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const uit = {};
      for (const pr of csvPsd2Paring().filter((x) => x.psd2)) uit[pr.csv] = TX.filter((t) => t.acc === pr.csv).length;
      return uit;
    });
    /* Main draagt vijf csv-boekingen in scope plus een opname; Zakgeld draagt er twee, alle gematcht */
    expect(r[CM]).toBe(M_GEMATCHT.length + M_LOS.length + 1);
    expect(r[CZ]).toBe(Z_GEMATCHT.length);
  });
});

test.describe('1 · de regel in (c) noemt de opbrengst en de prijs', () => {
  test('de opbrengst is wat er in scope wegvalt, en dat is wat niet langer dubbel telt', async ({ page }) => {
    await boot(page);
    const s = paarStuk(await blok(page), CM);
    expect(s).not.toBe('');
    const n = getal(s, /DE UITSLUITING HAALT HIER WEG: (\d+) boekingen/);
    const e = getal(s, /DE UITSLUITING HAALT HIER WEG: \d+ boekingen, (\d+) euro/);
    /* de opname telt niet als uitgave en hoort dus NIET in dit bedrag (v258) */
    expect(n).toBe(M_GEMATCHT.length + M_LOS.length);
    expect(e).toBe(M_GEMATCHT.reduce((a, b) => a + b, 0) + M_LOS.reduce((a, b) => a + b, 0));
    expect(s).toContain('dat bedrag telde ook via de psd2-kant mee');
  });

  test('de prijs is alleen de kant zonder tegenhanger, dus strikt kleiner', async ({ page }) => {
    await boot(page);
    const s = paarStuk(await blok(page), CM);
    const pn = getal(s, /DE PRIJS: (\d+) van die boekingen/);
    const pe = getal(s, /geen tegenhanger en vallen toch weg, (\d+) euro/);
    expect(pn).toBe(M_LOS.length);
    expect(pe).toBe(M_LOS.reduce((a, b) => a + b, 0));
    /* STRIKT KLEINER, en dat is het hele punt: zonder dit verschil is de prijsregel een kopie van de
       opbrengstregel en zegt hij niets. */
    expect(pn).toBeLessThan(getal(s, /DE UITSLUITING HAALT HIER WEG: (\d+) boekingen/));
    expect(pe).toBeLessThan(getal(s, /DE UITSLUITING HAALT HIER WEG: \d+ boekingen, (\d+) euro/));
  });

  test('de opname zonder tegenhanger telt in geen van beide bedragen', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    const s = paarStuk(t, CM);
    /* hij is WEL niet-gematcht, en dat staat in (d); hij is alleen geen uitgave, dus hij hoort niet in
       de prijs. Zonder deze twee asserties naast elkaar doet de scope-filter op de prijsregel niets. */
    expect(t).toMatch(/NIET GEMATCHT \(csv\): 3\b/);
    expect(getal(s, /DE PRIJS: (\d+) van die boekingen/)).toBe(M_LOS.length);
    expect(getal(s, /geen tegenhanger en vallen toch weg, (\d+) euro/))
      .toBe(M_LOS.reduce((a, b) => a + b, 0));
  });

  test('een paar dat volledig matcht heeft prijs nul en toch een opbrengst', async ({ page }) => {
    await boot(page);
    const s = paarStuk(await blok(page), CZ);
    expect(getal(s, /DE UITSLUITING HAALT HIER WEG: \d+ boekingen, (\d+) euro/))
      .toBe(Z_GEMATCHT.reduce((a, b) => a + b, 0));
    expect(getal(s, /DE PRIJS: (\d+) van die boekingen/)).toBe(0);
    expect(getal(s, /geen tegenhanger en vallen toch weg, (\d+) euro/)).toBe(0);
  });

  test('de voorwaardelijke tijd staat er niet meer', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    /* DIT BINDT OP EEN FORMULERING, en dat mag hier omdat de formulering ZELF de vondst was: de regel
       stond in de voorwaardelijke tijd terwijl v284 de uitsluiting had gebouwd. */
    expect(t).not.toContain('wat het zou kosten');
    expect(t).toContain('DE UITSLUITING HAALT HIER WEG');
  });
});

test.describe('2 · het totaal is de optelling van de rijen', () => {
  test('over alle paren telt de opbrengst en de prijs op tot de som van de paren', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    const on = getal(t, /de uitsluiting haalt (\d+) boekingen/);
    const oe = getal(t, /de uitsluiting haalt \d+ boekingen en (\d+) euro/);
    const pn = getal(t, /de prijs daarvan is (\d+) boekingen/);
    const pe = getal(t, /de prijs daarvan is \d+ boekingen en (\d+) euro/);
    const som = (a) => a.reduce((x, y) => x + y, 0);
    expect(on).toBe(M_GEMATCHT.length + M_LOS.length + Z_GEMATCHT.length);
    expect(oe).toBe(som(M_GEMATCHT) + som(M_LOS) + som(Z_GEMATCHT));
    expect(pn).toBe(M_LOS.length);
    expect(pe).toBe(som(M_LOS));
  });

  test('het totaal is geen kopie van het grootste paar', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    /* zonder deze assertie zou een totaal dat alleen Main leest groen blijven */
    const oe = getal(t, /de uitsluiting haalt \d+ boekingen en (\d+) euro/);
    const mainE = getal(paarStuk(t, CM), /DE UITSLUITING HAALT HIER WEG: \d+ boekingen, (\d+) euro/);
    expect(oe).toBeGreaterThan(mainE);
  });
});

test.describe('3 · het blok zegt zelf dat het TX leest', () => {
  test('de reden staat in de uitvoer en noemt blok 10 erbij', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('DIT BLOK LEEST TX EN NIET telbareTx()');
    expect(t).toMatch(/METING 1 VAN BLOK 10/);
    /* de reden zelf, niet alleen de vaststelling: zonder hem leest het als een implementatiedetail */
    expect(t).toMatch(/mat het zijn eigen uitkomst/);
  });

  test('de twee antwoorden staan er allebei, en het blok zegt waarom dat geen tegenspraak is', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    /* blok 11 meldt euro's in scope; de app telt daar via de poort nul. Dat de twee verschillen is
       precies wat de regel hierboven moet uitleggen. */
    expect(getal(paarStuk(t, CM), /DE UITSLUITING HAALT HIER WEG: \d+ boekingen, (\d+) euro/))
      .toBeGreaterThan(0);
    const inApp = await page.evaluate((a) => telbareTx().filter((x) => x.acc === a.CM).length, { CM });
    expect(inApp).toBe(0);
    expect(t).toContain('geen tegenspraak');
  });
});

test.describe('4 · de match staat op een plek', () => {
  test('_eenOpEen() wordt een keer aangeroepen in het blok, en (c) en (d) lezen hem', async ({ page }) => {
    await boot(page);
    const fs = require('fs');
    const src = fs.readFileSync('index.html', 'utf8');
    const blk = src.slice(src.indexOf('function diagCsvPsd2('));
    const eind = blk.indexOf('\nfunction ', 1);
    const body = eind > 0 ? blk.slice(0, eind) : blk;
    /* EEN AANROEP, want (c) heeft de match nodig voor de prijs en (d) schrijft hem uit. Een tweede
       aanroep ernaast zou bij de eerste wijziging van de toewijzing uiteenlopen (v104). */
    expect((body.match(/_eenOpEen\(/g) || []).length).toBe(1);
    /* en beide secties lezen dezelfde map */
    expect((body.match(/matchVan\[/g) || []).length).toBeGreaterThan(1);
  });

  test('de match geeft hetzelfde antwoord als de prijsregel erboven', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    /* de prijs in (c) moet karakter voor karakter hetzelfde aantal en bedrag zijn als de in-scope-regel
       van (d); dat is de aansluiting die bewijst dat er een bron is */
    const d = t.slice(t.indexOf('d. DE MATCH PER BOEKING'));
    const dn = getal(d, /in de scope van piekVerdeling\(\): (\d+) boekingen/);
    const de = getal(d, /in de scope van piekVerdeling\(\): \d+ boekingen, (\d+) euro/);
    const s = paarStuk(t, CM);
    expect(getal(s, /DE PRIJS: (\d+) van die boekingen/)).toBe(dn);
    expect(getal(s, /geen tegenhanger en vallen toch weg, (\d+) euro/)).toBe(de);
  });
});
