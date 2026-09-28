/* v282: blok 11 meet de csv-import tegen de psd2-koppeling. Meten, niet bouwen.
 *
 * DE AANLEIDING IS EEN TEGENSPRAAK IN SECTIE 6 VAN BLOK 10, gemeten op het toestel: `csv | N26` zegt
 * maandag 40 en weekend 20, `psd2 | N26` zegt bij dezelfde bank maandag 8 en weekend 38, over overlappende
 * periodes (jan t/m jun 2026). Zolang niet vaststaat of die csv-regels dezelfde boekingen zijn als de
 * psd2-regels, is elke euro-dekking in dat venster mogelijk dubbel geteld.
 *
 * WAT DE TWEE SCHEIDERS VAN v281 HIER NIET KUNNEN, en dat is waarom dit een eigen vraag is: `t.id` niet,
 * want de psd2-desc en de csv-desc verschillen; de desc-TIJD niet, want geen csv-regel draagt er een.
 * Daarom paart het blok op twee ONAFHANKELIJKE gronden, en alleen als ze het eens zijn.
 *
 * WAT DE FIXTURE DRAAGT:
 *  - een csv-potje waarvan de bedragen EN de richting dezelfde psd2-rekening aanwijzen: dat paart;
 *  - een csv-potje waarvan de bedragen de ENE en de richting de ANDERE aanwijzen: dat paart NIET, en zonder
 *    dat geval blijft een sabotage die op een van de twee gronden alleen paart per constructie groen;
 *  - een boeking die buiten de scope van piekVerdeling() valt, zodat de kostenregel iets te onderscheiden
 *    heeft;
 *  - varianten waarin psd2 het csv-venster niet dekt en waarin een maand niet aansluit.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const CSVZ = 'N26 Zakgeld';               // Space-naam uit de id: "Zakgeld"
const CSVX = 'N26 Buffer Rust';           // de dwarsligger: bedragen en richting wijzen verschillend aan
const PZ = '100110012252714323';          // de psd2-rekening van Zakgeld
const PM = '100110012555096222';          // Main, de tegenpartij
/* v283: EEN DERDE PAAR, ALLEEN VOOR DE MATCH PER BOEKING. Het staat los van CSVZ zodat de asserties op
   de maandtabel (c) daar niet meebewegen, en het draagt de vier gevallen waarop (d) en (e) uiteenlopen:
   een tweeling die NET buiten het csv-venster valt, een csv-boeking zonder enige tegenhanger, twee
   psd2-kandidaten op verschillende afstand, en twee overgebleven psd2-regels die elkaars tweeling zijn. */
const CSVB = 'N26 Buffer Comfort';        // Space-naam uit de id: "Buffer Comfort"
const PB = '100110012351717586';          // de psd2-rekening van Buffer Comfort

const rij = (acc, src, rows) => rows.map((r, i) => ({ id: acc + '_s' + i, date: r.d, amount: r.a, acc, src,
  name: r.n, desc: r.desc || r.n, typ: '', ref: '', accName: '', refNums: [] }));

/* dezelfde overboekingen van drie kanten. De csv-kant draagt de KALE tegenpartij (de vorm van het toestel),
   de psd2-kant de volledige "From X to Y"-tekst, dus een andere desc en dus een andere t.id. */
const OVER = [
  { d: '2026-01-05', a: 100, csv: 'Main', psd2: 'From Main to Zakgeld PMNT' },
  { d: '2026-02-10', a: -50, csv: 'Main', psd2: 'From Zakgeld to Main PMNT' },
  { d: '2026-03-15', a: 75, csv: 'Main', psd2: 'From Main to Zakgeld PMNT' },
];
/* gewone uitgaven, op beide kanten dezelfde dag en hetzelfde bedrag, met een andere omschrijving */
const KOOP = [
  { d: '2026-01-20', a: -22.5, csv: 'Plus de Gors', psd2: 'Plus de Gors Purmerend PMNT' },
  { d: '2026-02-11', a: -13.25, csv: 'Vomar', psd2: 'Vomar Purmerend PMNT' },
  { d: '2026-03-03', a: -31, csv: 'Splif', psd2: 'Splif Purmerend PMNT' },
];

function seed(opt) {
  opt = opt || {};
  const zCsv = OVER.concat(KOOP).map((r) => ({ d: r.d, a: r.a, n: r.csv, desc: r.csv }));
  const zPsd = OVER.concat(KOOP).map((r) => ({ d: r.d, a: r.a, n: r.psd2.slice(0, 20), desc: r.psd2 }));
  if (opt.scheef) zPsd.push({ d: '2026-02-25', a: -40, n: 'Extra', desc: 'Extra Purmerend PMNT' });
  /* v282: TWEE VERSCHILLEN DIE ELK MAAR EEN HELFT VAN HET OORDEEL RAKEN, want `scheef` hierboven verandert
     aantal EN som tegelijk, en dan bleef de sabotage die de bedragvergelijking weghaalt GROEN (meetles f).
     `scheefBedrag`: hetzelfde AANTAL, een ander BEDRAG. `scheefAantal`: dezelfde SOM, een ander aantal. */
  if (opt.scheefBedrag) { const i = zPsd.findIndex((r) => r.d === '2026-02-11'); zPsd[i] = Object.assign({}, zPsd[i], { a: -19.75 }); }
  if (opt.scheefAantal) { const i = zPsd.findIndex((r) => r.d === '2026-02-11');
    const b = zPsd[i].a; zPsd.splice(i, 1, Object.assign({}, zPsd[i], { a: b / 2 }), Object.assign({}, zPsd[i], { a: b / 2, d: '2026-02-12' })); }
  /* een boeking BUITEN de scope van piekVerdeling(): intern telt niet als uitgave */
  zCsv.push({ d: '2026-03-20', a: -300, n: 'Geldmaat', desc: 'GELDMAAT Purmerend' });
  zPsd.push({ d: '2026-03-20', a: -300, n: 'Geldmaat', desc: 'Geldmaat Purmerend PMNT' });
  /* psd2 begint later dan csv: ALLE psd2-regels van januari eruit, niet alleen de eerste. Met een losse
     boeking van 20 januari nog aanwezig ontstaat er geen maandgat en toetst de variant niets. */
  const zPsdLaat = opt.laterPsd2 ? zPsd.filter((r) => r.d >= '2026-02-01') : zPsd;

  /* de dwarsligger: zijn bedragen staan op PM, zijn Space-naam staat met de juiste tekens op PZ */
  const xCsv = [{ d: '2026-04-04', a: -17, n: 'Tango', desc: 'Tango' }, { d: '2026-04-05', a: -18, n: 'Shell', desc: 'Shell' }];
  const mPsd = xCsv.map((r) => ({ d: r.d, a: r.a, n: r.n, desc: r.n + ' Purmerend PMNT' }))
    .concat(OVER.map((r) => ({ d: r.d, a: -r.a, n: r.psd2.slice(0, 20), desc: r.psd2 })));
  const zExtra = [{ d: '2026-04-06', a: 60, n: 'naar Buffer Rust', desc: 'From Main to Buffer Rust PMNT' },
    { d: '2026-04-07', a: -61, n: 'uit Buffer Rust', desc: 'From Buffer Rust to Main PMNT' }];

  /* het derde paar. De csv-kant draagt vijf boekingen, de psd2-kant acht. */
  const bCsv = [
    { d: '2026-05-05', a: 150, n: 'Main', desc: 'Main' },              // d0
    { d: '2026-05-20', a: -150, n: 'Zakgeld', desc: 'Zakgeld' },       // d0
    { d: '2026-05-12', a: -66, n: 'Plus de Gors', desc: 'Plus de Gors' },  // twee kandidaten, d0 wint
    { d: '2026-05-25', a: -40, n: 'Vomar', desc: 'Vomar' },            // tweeling valt NA het csv-venster
    { d: '2026-05-10', a: -77, n: 'Vomar', desc: 'Vomar' },            // geen enkele tegenhanger
    /* TWEE MET HETZELFDE BEDRAG OP DEZELFDE DAG EN MAAR EEN TEGENHANGER. Zonder dit paar kan een psd2-regel
       per constructie niet hergebruikt worden en is de een-op-een-eis inert: elk ander bedrag komt in deze
       fixture maar een keer voor aan de csv-kant. */
    { d: '2026-05-18', a: -55, n: 'Vomar', desc: 'Vomar' },
    { d: '2026-05-18', a: -55, n: 'Vomar', desc: 'Vomar' },
    /* TWEE DIE OM DEZELFDE KANDIDAAT VECHTEN OP VERSCHILLENDE AFSTAND. Neemt de code eerst een boeking en
       dan de afstanden (in plaats van andersom), dan pakt die van 05-10 de kandidaat van 05-12 op twee dagen
       en houdt die van 05-12 er een op een dag over: 0d 4, 1d 1, 2d 2 in plaats van 0d 5, 2d 1, 3d 1. */
    { d: '2026-05-10', a: -99, n: 'Vomar', desc: 'Vomar' },
    { d: '2026-05-12', a: -99, n: 'Vomar', desc: 'Vomar' },
    /* EEN TEGENHANGER DIE GEMATCHT WORDT EN EEN TWEELING HEEFT DIE OVERBLIJFT. Zonder dit paar is elke
       tweeling in deze fixture zelf ook overgebleven, en dan maakt het geen verschil of de tweeling in de
       HELE rekening of alleen onder de overgeblevenen wordt gezocht. */
    { d: '2026-05-11', a: -44, n: 'Vomar', desc: 'Vomar' },
    /* NIET GEMATCHT EN BUITEN DE SCOPE: een opname is intern en dus geen uitgave. Zonder deze regel valt
       elke niet-gematchte boeking toevallig in scope en doet de scope-filter op de euroregel niets. */
    { d: '2026-05-22', a: -200, n: 'Geldmaat', desc: 'GELDMAAT Purmerend' },
    /* EEN TEGENHANGER DIE BINNEN HET VENSTER LIGT MAAR TE VER WEG IN DAGEN (zeven). Zonder deze regel kan
       een ruimere dagafstand per constructie niets extra's matchen en is PAAR_DAGEN inert. */
    { d: '2026-05-06', a: -111, n: 'Vomar', desc: 'Vomar' },
  ];
  const bPsd = [
    { d: '2026-05-05', a: 150, n: 'naar Buffer Comfort', desc: 'From Main to Buffer Comfort PMNT' },
    { d: '2026-05-20', a: -150, n: 'uit Buffer Comfort', desc: 'From Buffer Comfort to Zakgeld PMNT' },
    { d: '2026-05-12', a: -66, n: 'Plus de Gors', desc: 'Plus de Gors Purmerend PMNT' },
    { d: '2026-05-14', a: -66, n: 'Plus de Gors', desc: 'Plus de Gors Purmerend PMNT' },
    { d: '2026-05-27', a: -40, n: 'Vomar', desc: 'Vomar Purmerend PMNT' },   // 2 dagen NA 05-25
    { d: '2026-05-15', a: -88, n: 'Splif', desc: 'Splif Purmerend PMNT' },   // tweeling van de volgende
    { d: '2026-05-16', a: -88, n: 'Splif', desc: 'Splif Purmerend PMNT' },
    { d: '2026-05-13', a: -123, n: 'Tango', desc: 'Tango Purmerend PMNT' },  // blijft over, geen tweeling
    { d: '2026-05-18', a: -55, n: 'Vomar', desc: 'Vomar Purmerend PMNT' },   // EEN tegenhanger voor TWEE
    { d: '2026-05-12', a: -99, n: 'Vomar', desc: 'Vomar Purmerend PMNT' },
    { d: '2026-05-13', a: -99, n: 'Vomar', desc: 'Vomar Purmerend PMNT' },
    { d: '2026-05-11', a: -44, n: 'Vomar', desc: 'Vomar Purmerend PMNT' },   // wordt gematcht
    { d: '2026-05-12', a: -44, n: 'Vomar', desc: 'Vomar Purmerend PMNT' },   // blijft over, tweeling is gematcht
    { d: '2026-05-13', a: -111, n: 'Vomar', desc: 'Vomar Purmerend PMNT' },  // zeven dagen van zijn csv-kant
  ];
  const alles = rij(CSVZ, 'csv', zCsv).concat(rij(PZ, 'psd2', zPsdLaat.concat(zExtra)))
    .concat(rij(CSVX, 'csv', xCsv)).concat(rij(PM, 'psd2', mPsd))
    .concat(rij(CSVB, 'csv', bCsv)).concat(rij(PB, 'psd2', bPsd));
  const ps = {
    [PZ]: { uid: 'u-z', iban: 'DE89' + PZ, hash: 'h-z', label: 'Zakgeld', bank: 'N26', exp: '2026-12-27' },
    [PM]: { uid: 'u-m', iban: 'DE89' + PM, hash: 'h-m', label: 'Main', bank: 'N26', exp: '2026-12-27' },
    [PB]: { uid: 'u-b', iban: 'DE89' + PB, hash: 'h-b', label: 'Buffer Comfort', bank: 'N26', exp: '2026-12-27' },
  };
  return {
    minder_tx: JSON.stringify(alles), minder_ovr: '{}',
    minder_own: JSON.stringify([...new Set(alles.map((t) => t.acc))]),
    minder_accmeta: JSON.stringify({ [PZ]: { balance: 100, date: '2026-09-28' }, [PM]: { balance: 200, date: '2026-09-28' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {}, budgets: { boodschappen: 500 },
      psd2Accounts: ps, psd2LastSync: Date.now() }),
    minder_plan: '{}',
  };
}

async function boot(page, opt) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagCsvPsd2 === 'function');
}
const blok = (page, opt) => boot(page, opt).then(() => page.evaluate(() => diagCsvPsd2().join('\n')));
/* de regels van EEN paar, zodat een assertie niet over de hele uitvoer staat (v281, meetles j) */
/* de regels van EEN paar binnen een sectie: vanaf zijn kopregel tot de volgende kopregel met een pijl.
   Zonder deze knip staat elke assertie over ALLE paren tegelijk, en dan verschuift hij zodra de fixture
   een paar krijgt (v281, meetles j). */
function paarStuk(t, kop, volgende, csv) {
  const r = stuk(t, kop, volgende).split('\n');
  const a = r.findIndex((x) => x.indexOf(csv + ' -> ') >= 0);
  if (a < 0) return '';
  const rest = r.slice(a + 1);
  const b = rest.findIndex((x) => / -> /.test(x));
  return [r[a]].concat(b < 0 ? rest : rest.slice(0, b)).join('\n');
}
/* de TABELregel van een maand, en niet de kopregel die diezelfde maand in zijn venster noemt */
const tabelRij = (s, m) => s.split('\n').find((x) => new RegExp('^\\s+' + m + '\\s+\\d').test(x)) || '';
function stuk(t, kop, volgende) {
  const a = t.indexOf(kop); if (a < 0) return '';
  const b = volgende ? t.indexOf(volgende, a + 1) : -1;
  return t.slice(a, b < 0 ? undefined : b);
}

test.describe('0 · de fixture draagt het geval dat de bestaande scheiders niet kunnen', () => {
  test('geen enkele csv-boeking heeft ergens dezelfde t.id', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const csv = TX.filter((t) => (t.src || 'mt940') === 'csv');
      const psd = TX.filter((t) => t.src === 'psd2');
      const raak = csv.filter((t) => psd.some((x) => x.id === txId(t, x.acc)));
      return { csv: csv.length, psd: psd.length, raak: raak.length,
        tijden: csv.filter((t) => _descTijden(t).length).length };
    });
    expect(r.csv).toBeGreaterThan(0);
    expect(r.psd).toBeGreaterThan(0);
    expect(r.raak, 'kan de id het al, dan is dit blok niet nodig').toBe(0);
    expect(r.tijden, 'draagt een csv-regel een tijd, dan kan de scheider van v281 het wel').toBe(0);
  });

  test('de twee gronden wijzen bij de dwarsligger verschillende rekeningen aan', async ({ page }) => {
    await boot(page);
    /* zonder dit geval blijft een sabotage die op EEN grond paart per constructie groen */
    const r = await page.evaluate((v) => {
      const lj = TX.filter((t) => t.acc === v.CSVX);
      const tel = (p) => {
        const pl = TX.filter((t) => t.acc === p);
        const bedrag = lj.filter((t) => pl.some((x) => x.date === t.date && Math.abs(x.amount - t.amount) < 0.005)).length;
        let richt = 0;
        for (const x of pl) { const d = ' ' + x.desc.toLowerCase() + ' ';
          if (d.indexOf(' to buffer rust') >= 0 && x.amount > 0) richt++;
          if (d.indexOf(' from buffer rust') >= 0 && x.amount < 0) richt++; }
        return { bedrag, richt };
      };
      return { pz: tel(v.PZ), pm: tel(v.PM) };
    }, { CSVX, PZ, PM });
    expect(r.pm.bedrag, 'op de bedragen moet PM leiden').toBeGreaterThan(r.pz.bedrag);
    expect(r.pz.richt, 'op de richting moet PZ leiden').toBeGreaterThan(r.pm.richt);
  });
});

test.describe('1 · a, de paarvorming', () => {
  test('beide gronden wijzen dezelfde rekening aan, dus gepaard', async ({ page }) => {
    const t = await blok(page);
    const s = stuk(t, '  ' + CSVZ + '   ', '  ' + CSVX + '   ');
    expect(s).toContain('Space-naam uit de id: "Zakgeld"');
    expect(s).toContain('op de bedragen wijst dit aan: ' + PZ);
    expect(s).toContain('op de richting wijst dit aan: ' + PZ);
    expect(s).toContain('BEIDE GRONDEN WIJZEN ' + PZ + ' AAN, dus gepaard');
  });

  test('wijzen de twee gronden verschillend, dan wordt er niet gepaard', async ({ page }) => {
    const t = await blok(page);
    const s = stuk(t, '  ' + CSVX + '   ', 'b. DEKT PSD2');
    expect(s).toContain('op de bedragen wijst dit aan: ' + PM);
    expect(s).toContain('op de richting wijst dit aan: ' + PZ);
    expect(s).toContain('DE TWEE GRONDEN ZIJN HET NIET EENS, dus NIET gepaard');
    expect(t, 'een ongepaarde rekening hoort niet in b en c te staan')
      .not.toContain(CSVX + ' -> ');
  });

  test('het blok meldt dat de id hier niet kan ontdubbelen', async ({ page }) => {
    const t = await blok(page);
    expect(t).toContain('geen enkele csv-boeking heeft ergens dezelfde t.id, dus de id kan hier niet ontdubbelen');
  });
});

test.describe('2 · b, dekt psd2 het csv-venster', () => {
  test('dekt hij het, dan staat er JA met de twee vensters erbij', async ({ page }) => {
    const t = await blok(page);
    const s = stuk(t, 'b. DEKT PSD2', 'c. PER PAAR');
    expect(s).toContain(CSVZ + ' -> ' + PZ);
    expect(s).toContain('psd2 dekt het hele csv-venster: JA');
    expect(s).toContain('csv  2026-01-05 t/m 2026-03-20');
    expect(s).toContain('daarvan ZONDER enkele psd2-boeking: geen');
  });

  test('begint psd2 later, dan staat er NEE en wordt gezegd aan welke kant', async ({ page }) => {
    const t = await blok(page, { laterPsd2: true });
    const s = stuk(t, 'b. DEKT PSD2', 'c. PER PAAR');
    expect(s).toContain('psd2 dekt het hele csv-venster: NEE');
    expect(s).toContain('psd2 begint NA de eerste csv-boeking');
    expect(s).toContain('eindigt op of na de laatste');
    expect(s, 'januari heeft dan geen enkele psd2-boeking meer').toContain('daarvan ZONDER enkele psd2-boeking: 2026-01');
  });
});

test.describe('3 · c, aantal en som per maand, uit en in apart', () => {
  test('sluiten de maanden aan, dan staat er ja en het totaal ook', async ({ page }) => {
    const t = await blok(page);
    const s = paarStuk(t, 'c. PER PAAR', 'd. DE MATCH', CSVZ);
    const r = s.split('\n').filter((x) => /^\s+2026-/.test(x));
    expect(r.length).toBe(3);
    for (const x of r) expect(x.trim().endsWith('ja'), x).toBe(true);
    expect(s.split('\n').find((x) => x.indexOf('TOTAAL') >= 0).trim().endsWith('ja')).toBe(true);
  });

  test('uit en in staan apart en in de juiste kolom', async ({ page }) => {
    const t = await blok(page);
    const s = paarStuk(t, 'c. PER PAAR', 'd. DE MATCH', CSVZ);
    /* januari: een bijschrijving van 100 en een afschrijving van 22,50 */
    expect(tabelRij(s, '2026-01')).toMatch(/2026-01\s+2\s+23\s+100\s+2\s+23\s+100\s+ja/);
    /* februari: alleen afschrijvingen, dus in is nul */
    expect(tabelRij(s, '2026-02')).toMatch(/2026-02\s+2\s+63\s+0\s+2\s+63\s+0\s+ja/);
  });

  test('sluit een maand niet aan, dan staat er NEE bij die maand en bij het totaal', async ({ page }) => {
    const t = await blok(page, { scheef: true });
    const s = paarStuk(t, 'c. PER PAAR', 'd. DE MATCH', CSVZ);
    const feb = tabelRij(s, '2026-02'), jan = tabelRij(s, '2026-01');
    expect(feb.trim().endsWith('NEE'), feb).toBe(true);
    expect(jan.trim().endsWith('ja'), 'alleen de maand met het verschil mag NEE zeggen').toBe(true);
    expect(s.split('\n').find((x) => x.indexOf('TOTAAL') >= 0).trim().endsWith('NEE')).toBe(true);
  });

  test('een ander BEDRAG bij een gelijk aantal geeft ook NEE', async ({ page }) => {
    const t = await blok(page, { scheefBedrag: true });
    const s = paarStuk(t, 'c. PER PAAR', 'd. DE MATCH', CSVZ);
    const feb = tabelRij(s, '2026-02');
    expect(feb).toMatch(/2026-02\s+2\s+63\s+0\s+2\s+70\s+0/);   // gelijk aantal, andere som
    expect(feb.trim().endsWith('NEE'), feb).toBe(true);
    expect(tabelRij(s, '2026-01').trim().endsWith('ja')).toBe(true);
  });

  test('een ander AANTAL bij een gelijke som geeft ook NEE', async ({ page }) => {
    const t = await blok(page, { scheefAantal: true });
    const s = paarStuk(t, 'c. PER PAAR', 'd. DE MATCH', CSVZ);
    const feb = tabelRij(s, '2026-02');
    expect(feb).toMatch(/2026-02\s+2\s+63\s+0\s+3\s+63\s+0/);   // gelijke som, ander aantal
    expect(feb.trim().endsWith('NEE'), feb).toBe(true);
  });

  /* v283: (c) KLEMT DE PSD2-KANT OP HET CSV-VENSTER en meet een verschuiving daardoor als een verschil.
     Die waarschuwing hoort erbij te staan, anders leest de kolom met NEE als een oordeel terwijl (d) het
     tegendeel kan zeggen. Zonder deze assertie kan hij weg zonder dat een test het ziet. */
  test('de tabel waarschuwt voor zijn eigen vensterrand en wijst naar d', async ({ page }) => {
    const t = await blok(page);
    const s = stuk(t, 'c. PER PAAR', 'd. DE MATCH');
    expect(s).toContain('de psd2-kant is hier op het csv-venster geklemd');
    expect(s).toContain('(d) kijkt daarom buiten het venster en is de meting die beslist');
  });

  test('de kostenregel telt netto en alleen wat in de scope valt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const lj = TX.filter((t) => t.acc === v.CSVZ);
      const sc = lj.filter((t) => { const c = catOf(t);
        return CATS[c] && CATS[c].type === 'expense' && !isFixed(t) && !geenNorm(c); });
      const regel = diagCsvPsd2().join('\n').split('\n').find((x) => x.indexOf('wat het zou kosten') >= 0) || '';
      return { alle: lj.length, sc: sc.length, netto: Math.round(sc.reduce((s, t) => s - t.amount, 0)), regel };
    }, { CSVZ });
    expect(r.sc, 'zonder een boeking buiten de scope toetst deze test niets').toBeLessThan(r.alle);
    expect(r.regel).toContain(r.sc + ' boekingen');
    expect(r.regel).toContain(r.netto + ' euro netto');
  });
});

test.describe('5 \u00b7 d, de match per boeking', () => {
  const dStuk = (t) => paarStuk(t, 'd. DE MATCH', 'e. DE OVERGEBLEVEN', CSVB);

  test('de fixture draagt de vier gevallen waarop de match uiteenloopt', async ({ page }) => {
    await boot(page);
    /* zonder deze meting toetsen de asserties eronder niets: een tweeling BINNEN het venster maakt de
       verruiming inert, en zonder een tweede kandidaat op een andere afstand maakt "dichtstbijzijnde
       eerst" geen verschil (v281, meetles over een inerte sabotage). */
    const r = await page.evaluate((v) => {
      const c = TX.filter((t) => t.acc === v.CSVB).map((t) => t.date).sort();
      const p = TX.filter((t) => t.acc === v.PB);
      return { csvEind: c[c.length - 1], buiten: p.filter((t) => t.date > c[c.length - 1]).map((t) => t.date),
        zesZes: p.filter((t) => Math.abs(t.amount + 66) < 0.005).map((t) => t.date).sort(),
        zonderTegen: p.filter((t) => Math.abs(t.amount + 77) < 0.005).length };
    }, { CSVB, PB });
    expect(r.csvEind).toBe('2026-05-25');
    expect(r.buiten, 'zonder een tweeling BUITEN het csv-venster is de verruiming inert').toEqual(['2026-05-27']);
    expect(r.zesZes, 'twee kandidaten op verschillende afstand, anders beslist de volgorde niets').toEqual(['2026-05-12', '2026-05-14']);
    expect(r.zonderTegen, 'de csv-boeking van 77 moet nergens een tegenhanger hebben').toBe(0);
  });

  test('vier van de vijf matchen, en de tweeling buiten het venster telt mee', async ({ page }) => {
    const s = dStuk(await blok(page));
    expect(s).toContain('csv 12 boekingen, psd2 14 in het verruimde venster 2026-05-02 t/m 2026-05-28');
    expect(s).toMatch(/GEMATCHT 8 van 12 \(67%\)/);
    /* DE VERDELING IS DE ASSERTIE EN NIET HET TOTAAL: een volgorde die eerst een boeking neemt en dan de
       afstanden matcht er even veel, maar op andere afstanden (0d 4, 1d 1, 2d 2). */
    expect(s, 'dichtstbijzijnde dag eerst geeft zes op nul dagen').toContain('0d 6, 1d 0, 2d 1, 3d 1');
  });

  test('de niet-gematchte csv-kant draagt zijn euro\'s in scope', async ({ page }) => {
    const s = dStuk(await blok(page));
    /* DRIE BLIJVEN ONGEMATCHT, TWEE DAARVAN IN SCOPE: de opname is intern en telt niet als uitgave. */
    expect(s).toContain('NIET GEMATCHT (csv): 4   in de scope van piekVerdeling(): 3 boekingen, 243 euro netto');
    /* de tweede van 55 heeft WEL hetzelfde bedrag op die rekening, alleen is die tegenhanger al vergeven;
       die van 77 staat er nergens. Zonder dat onderscheid leest "verder weg" als een ruimer venster. */
    /* twee hebben WEL hetzelfde bedrag op die rekening: de tweede van 55 (zijn tegenhanger is al vergeven)
       en die van 111 (zeven dagen weg, buiten PAAR_DAGEN). Die van 77 en de opname staan er nergens. */
    expect(s).toContain('verder weg: 2');
  });

  test('vier psd2-regels blijven over', async ({ page }) => {
    const s = dStuk(await blok(page));
    expect(s).toMatch(/OVER \(psd2\): 6/);
  });

  test('een psd2-regel wordt maar een keer gebruikt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const cl = TX.filter((t) => t.acc === v.CSVB).sort((a, b) => a.date.localeCompare(b.date));
      const pl = TX.filter((t) => t.acc === v.PB).sort((a, b) => a.date.localeCompare(b.date));
      const M = _eenOpEen(cl, pl, 3);
      const vijftig = cl.filter((x) => Math.abs(x.amount + 55) < 0.005).length;
      const doelVijftig = pl.filter((x) => Math.abs(x.amount + 55) < 0.005).length;
      return { n: M.match.length, doelen: M.match.map((x) => x.p.id), uniek: new Set(M.match.map((x) => x.p.id)).size,
        vijftig, doelVijftig };
    }, { CSVB, PB });
    expect(r.vijftig, 'zonder twee csv-boekingen op een tegenhanger is de een-op-een-eis inert').toBe(2);
    expect(r.doelVijftig).toBe(1);
    expect(r.n).toBe(8);
    expect(r.uniek, 'twee csv-boekingen op dezelfde psd2-regel is dubbel tellen').toBe(r.doelen.length);
  });

  test('dichtstbijzijnde dag eerst: de kandidaat op afstand nul wint', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((v) => {
      const cl = TX.filter((t) => t.acc === v.CSVB && Math.abs(t.amount + 66) < 0.005);
      const pl = TX.filter((t) => t.acc === v.PB).sort((a, b) => a.date.localeCompare(b.date));
      const M = _eenOpEen(cl, pl, 3);
      return { d: M.match[0].d, dag: M.match[0].p.date };
    }, { CSVB, PB });
    expect(r.d).toBe(0);
    expect(r.dag, 'de kandidaat van 05-14 ligt twee dagen verder en mag niet winnen').toBe('2026-05-12');
  });
});

test.describe('6 \u00b7 e, wat de overgebleven psd2-regels zijn', () => {
  const eStuk = (t) => paarStuk(t, 'e. DE OVERGEBLEVEN', 'WAT DEZE UITVOER BESLIST', CSVB);

  test('de tweelingen en het deel zonder tweeling staan apart', async ({ page }) => {
    const s = eStuk(await blok(page));
    expect(s).toContain('overgebleven psd2-regels: 6');
    /* de twee van 88 op opeenvolgende dagen zijn elkaars tweeling; die van 66 ligt twee dagen van zijn
       gelijke af en die van 123 staat alleen. */
    /* de twee van 88 zijn elkaars tweeling en blijven allebei over; die van 44 heeft een tweeling die WEL
       is gematcht, en die telt dus wel bij "met een tweeling" en niet bij "OOK overgebleven". */
    expect(s).toContain('met een tweeling binnen psd2: 3   netto 220 euro   waarvan de tweeling OOK is overgebleven: 2');
    expect(s).toContain('zonder tweeling: 3');
  });

  test('een tweeling op twee dagen afstand telt niet mee', async ({ page }) => {
    await boot(page);
    /* de twee van 66 liggen op 05-12 en 05-14. Zou de tweeling-toets op twee dagen staan, dan telde de
       overgebleven 05-14 mee en zou "zonder tweeling" op 1 uitkomen in plaats van 2. */
    const r = await page.evaluate((v) => {
      const p = TX.filter((t) => t.acc === v.PB && Math.abs(t.amount + 66) < 0.005).map((t) => t.date).sort();
      return _dagAfstand(p[1], p[0]);
    }, { PB });
    expect(r).toBe(2);
  });
});

test.describe('4 · het blok leest en beslist niets', () => {
  test('kijken verandert niets', async ({ page }) => {
    await boot(page);
    const n = await page.evaluate(() => {
      let n = 0; const echt = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => { n++; return echt(k, v); };
      diagCsvPsd2();
      localStorage.setItem = echt; return n;
    });
    expect(n).toBe(0);
  });

  test('het blok staat in het register op zijn lees-functie', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      erin: DIAG_BLOKKEN.some((b) => b.lees === diagCsvPsd2),
      titel: (DIAG_BLOKKEN.find((b) => b.lees === diagCsvPsd2) || {}).titel,
    }));
    expect(r.erin).toBe(true);
    expect(r.titel).toContain('csv');
  });

  test('het blok stelt geen uitsluiting in en verandert geen enkel cijfer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const voor = [totalBalance().som, JSON.stringify(catSpendMap('2026-01')), TX.length, JSON.stringify(SET)];
      diagCsvPsd2();
      const na = [totalBalance().som, JSON.stringify(catSpendMap('2026-01')), TX.length, JSON.stringify(SET)];
      return { gelijk: voor.every((x, i) => x === na[i]) };
    });
    expect(r.gelijk).toBe(true);
  });

  test('zonder een van de twee bronnen zegt het blok dat er niets te vergelijken is', async ({ page }) => {
    await page.route('**/sw.js', (r) => r.abort());
    await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, (() => {
      const d = seed(); const tx = JSON.parse(d.minder_tx).filter((t) => t.src !== 'csv');
      d.minder_tx = JSON.stringify(tx); d.minder_own = JSON.stringify([...new Set(tx.map((t) => t.acc))]); return d;
    })());
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof diagCsvPsd2 === 'function');
    const t = await page.evaluate(() => diagCsvPsd2().join('\n'));
    expect(t).toContain('csv-rekeningen: geen');
    expect(t).toContain('zonder beide bronnen is er niets te vergelijken');
  });
});
