/* v304: DE MT940-KANT VAN EEN REKENING DIE OOK PSD2 DRAAGT TELT NIET MEE.
 *
 * DE AANLEIDING IS GEMETEN, sectie 4d van blok 10 op het toestel: van de 84 mt940-regels op rekening
 * 521200806 liggen er 84 binnen het psd2-venster, en de een-op-een-match geeft 84 van 84 een tegenhanger
 * 1 tot 5 dagen later. NIET GEMATCHT is nul, dus de prijs is nul boekingen en nul euro: de mt940-kant is
 * daar een volledige deelverzameling van psd2 en elke euro telde twee keer.
 *
 * DIT IS v284 OP EEN ANDERE AS, en dat verschil is de hele poort: daar twee rekeningen, hier EEN rekening
 * met twee bronnen. De poort keyt daarom op "deze rekening draagt ook psd2".
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o):
 *  - DUAL: een rekening met mt940 EN psd2. Daar valt de mt940-kant binnen het psd2-venster weg;
 *  - DUAL draagt ook een mt940-regel BUITEN het psd2-venster (ervoor). Zonder dat geval is "binnen het
 *    venster" niet te onderscheiden van "alles van deze rekening", en blijft de sabotage die het venster
 *    negeert groen. Op het toestel is dat geval er niet (0 erbuiten), dus hij is hier geconstrueerd;
 *  - SOLO: een rekening met ALLEEN mt940. Die moet volledig meetellen, want er is geen tweede bron die de
 *    boeking kan dragen. Dat is `636222403` op het toestel, met 115 boekingen. Zonder deze rekening blijft
 *    de sabotage die op "de bron is mt940" keyt groen, en dat is precies de poort die de opdracht verbiedt;
 *  - DUAL draagt psd2-regels BINNEN datzelfde venster. Die moeten blijven staan: zonder de bron-toets valt
 *    de psd2-kant er ook uit en is de hele rekening leeg. Anders dan bij v284 is die toets hier dragend en
 *    geen guard (meetles p);
 *  - een mt940-regel op DUAL die een OPNAME is (intern). Die telt nooit als uitgave, dus hij hoort niet in
 *    het bedrag van de regel en wel in de sheet erachter. Zonder dat geval doet `dubbelBronTelt()` niets;
 *  - een csv-rekening gepaard aan een psd2-rekening, zodat de twee poorten naast elkaar staan en de twee
 *    regels op de stand-kaart te scheiden zijn.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { sectieVan } = require('./bron-sectie');

const DUAL = '521200806';        // mt940 + psd2, zoals op het toestel
const SOLO = '636222403';        // alleen mt940, zoals op het toestel
const PSD = '100110012848184840';
const CSV = 'N26 Zakgeld';
const M = '2026-03';

const kaart = (naam, d, t) => 'BEA, BETAALPAS ' + naam + ' NR:LS41T6, ' + d + '/' + t + ' PURMEREND KAARTNUMMER: **1720';

/* eigen regels winnen van de ingebouwde categorisatie, dus de categorie van elke boeking staat vast
   zonder dat de fixture op een RULES-trefwoord leunt. Mijn eerste vorm gokte die categorieen en de
   som kwam 7 euro anders uit; dat is precies de aanname die je niet in een assertie wilt hebben. */
const REGELS = [
  { kw: 'PLUS DE GORS', cat: 'boodschappen' }, { kw: 'JUMBO', cat: 'boodschappen' },
  { kw: 'ETOS', cat: 'boodschappen' }, { kw: 'HEMA', cat: 'boodschappen' },
  { kw: 'KRUIDVAT', cat: 'boodschappen' }, { kw: 'ALBERT HEIJN', cat: 'boodschappen' },
  { kw: 'SPLIF', cat: 'vices' }, { kw: 'KIOSK', cat: 'overig' },
  { kw: 'GELDMAAT', cat: 'intern' },
];

function seed() {
  const tx = []; let i = 0;
  const add = (acc, src, date, amount, name, desc) => {
    tx.push({ id: 'x' + (i++), date, amount, acc, src, name, desc: desc || name, typ: '', ref: '', accName: '', refNums: [] });
  };

  /* DUAL: het psd2-venster loopt van 03-05 t/m 03-25. Deze twee zetten de randen. */
  add(DUAL, 'psd2', '2026-03-05', -11, 'Rand voor', 'Rand voor PMNT');
  add(DUAL, 'psd2', '2026-03-25', -12, 'Rand na', 'Rand na PMNT');
  /* de mt940-kant BINNEN dat venster: drie uitgaven en een opname */
  add(DUAL, 'mt940', '2026-03-10', -60, 'PLUS DE GORS', kaart('BCK*PLUS DE GORS', '10.03.26', '15:58'));
  add(DUAL, 'mt940', '2026-03-12', -40, 'JUMBO', kaart('JUMBO GILDEPLEIN', '12.03.26', '09:05'));
  add(DUAL, 'mt940', '2026-03-20', -25, 'SPLIF', kaart('SPLIF PURMEREND', '20.03.26', '13:00'));
  add(DUAL, 'mt940', '2026-03-18', -200, 'GEA', 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM NR:LS41T6, 18.03.26/10:00 PURMEREND');
  /* TWEE mt940-REGELS DIE EEN KANDIDAAT-PAAR VORMEN (de Geldmaat-vorm van v272/v288: zelfde dag, zelfde
     bedrag, een naam die drift maar op de eerste acht letters gelijk blijft, geen bankRef, geen
     referentie, geen desc-tijd). Beide liggen BINNEN het venster, dus beide vallen weg, en dan hoort
     dubbelParen() ze niet meer aan te bieden. Zonder dit paar vormt de fixture geen enkel paar en blijft
     de sabotage die die uitsluiting weghaalt groen (meetles o/q). */
  add(DUAL, 'mt940', '2026-03-16', -18, 'Geldmaat Zwanebloem 9', 'Geldmaat Zwanebloem 9');
  add(DUAL, 'mt940', '2026-03-16', -18, 'Geldmaat GM Zwanebloe', 'Geldmaat GM Zwanebloe');
  /* de mt940-kant BUITEN dat venster: die moet blijven meetellen */
  add(DUAL, 'mt940', '2026-03-02', -33, 'ETOS', kaart('ETOS PURMEREND', '02.03.26', '11:22'));
  /* de psd2-kant BINNEN het venster: die moet blijven staan */
  add(DUAL, 'psd2', '2026-03-11', -60, 'Plus de Gors', 'Plus de Gors PMNT');
  add(DUAL, 'psd2', '2026-03-13', -40, 'Jumbo', 'Jumbo PMNT');

  /* SOLO: alleen mt940, en met dezelfde datums als DUAL zodat een poort op de BRON hem zou raken */
  add(SOLO, 'mt940', '2026-03-10', -70, 'HEMA', kaart('HEMA PURMEREND', '10.03.26', '12:00'));
  add(SOLO, 'mt940', '2026-03-20', -30, 'KRUIDVAT', kaart('KRUIDVAT 2534', '20.03.26', '16:30'));

  /* de csv-poort van v284 ernaast, zodat de twee regels op de kaart te scheiden zijn */
  add(PSD, 'psd2', '2026-03-06', -55, 'Albert Heijn', 'Albert Heijn PMNT');
  add(PSD, 'psd2', '2026-03-22', -15, 'Kiosk', 'Kiosk PMNT');
  add(CSV, 'csv', '2026-03-06', -55, 'Albert Heijn', 'Albert Heijn');
  add(CSV, 'csv', '2026-03-22', -15, 'Kiosk', 'Kiosk');
  /* DE RICHTING, en niet de spiegel: csvPsd2Paring() leest op de PSD2-rekening of de desc ' to <space>'
     draagt met een POSITIEF bedrag. Mijn eerste vorm zette 'From Zakgeld to Main' en dat is precies de
     spiegel, dus er werd niet gepaard en de csv-regel bleef leeg (v284: bij een oneens zijn de gronden
     zwijgt de paring). */
  add(PSD, 'psd2', '2026-03-14', 90, 'From Main to Zakgeld', 'From Main to Zakgeld PMNT');

  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 3000, rules: REGELS,
      budgets: { boodschappen: 400, overig: 300, vices: 100 } }),
    minder_own: JSON.stringify([DUAL, SOLO, PSD, CSV]),
    minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof mt940Dubbel === 'function');
}

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('DUAL draagt twee bronnen, SOLO maar een, en het venster ligt waar de comment zegt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([dual, solo]) => ({
      bronnenDual: [...new Set(TX.filter((t) => t.acc === dual).map((t) => t.src))].sort(),
      bronnenSolo: [...new Set(TX.filter((t) => t.acc === solo).map((t) => t.src))].sort(),
      venster: mt940Paar().map[dual],
      soloInMap: !!mt940Paar().map[solo],
      buiten: TX.filter((t) => t.acc === dual && t.src === 'mt940' && t.date < mt940Paar().map[dual].van)
        .map((t) => t.date + '|' + t.amount),
    }), [DUAL, SOLO]);
    expect(r.bronnenDual, 'DUAL draagt mt940 en psd2').toEqual(['mt940', 'psd2']);
    expect(r.bronnenSolo, 'SOLO draagt alleen mt940').toEqual(['mt940']);
    expect(r.venster.van).toBe('2026-03-05');
    expect(r.venster.tot).toBe('2026-03-25');
    expect(r.soloInMap, 'SOLO staat niet in de map, want er is geen tweede bron').toBe(false);
    expect(r.buiten, 'er is precies een mt940-regel BUITEN het venster, anders is het venster inert')
      .toEqual(['2026-03-02|-33']);
  });
});

test.describe('1 - de poort', () => {
  test('mt940 binnen het psd2-venster van dezelfde rekening valt weg', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([dual]) => TX.filter((t) => t.acc === dual && t.src === 'mt940')
      .map((t) => t.date + ' ' + t.amount + ' ' + (mt940Dubbel(t) ? 'WEG' : 'telt')).sort(), [DUAL]);
    expect(r).toEqual([
      '2026-03-02 -33 telt',   // buiten het venster
      '2026-03-10 -60 WEG',
      '2026-03-12 -40 WEG',
      '2026-03-16 -18 WEG',    // het kandidaat-paar, beide kanten
      '2026-03-16 -18 WEG',
      '2026-03-18 -200 WEG',   // de opname, telt nergens als uitgave maar valt wel uit de sommen
      '2026-03-20 -25 WEG',
    ]);
  });

  test('een rekening met ALLEEN mt940 telt volledig mee', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([solo]) => ({
      weg: TX.filter((t) => t.acc === solo && mt940Dubbel(t)).length,
      inScope: telbareTx().filter((t) => t.acc === solo).length,
      eur: Math.round(telbareTx().filter((t) => t.acc === solo).reduce((s, t) => s - t.amount, 0)),
    }), [SOLO]);
    expect(r.weg, 'geen tweede bron, dus geen uitsluiting').toBe(0);
    expect(r.inScope, 'beide boekingen tellen mee').toBe(2);
    expect(r.eur).toBe(100);
  });

  test('de psd2-kant van dezelfde rekening blijft staan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([dual]) => ({
      weg: TX.filter((t) => t.acc === dual && t.src === 'psd2' && mt940Dubbel(t)).length,
      over: telbareTx().filter((t) => t.acc === dual && t.src === 'psd2').length,
    }), [DUAL]);
    expect(r.weg, 'de bron-toets is hier dragend: zonder hem is de hele rekening leeg').toBe(0);
    expect(r.over, 'alle vier de psd2-regels van DUAL blijven').toBe(4);
  });

  test('de sommen volgen, want telbableTx leest de ene poort', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const cm = catSpendMap(m);
      return { bood: Math.round(cm.boodschappen || 0), vices: Math.round(cm.vices || 0),
        overig: Math.round(cm.overig || 0) };
    }, M);
    /* boodschappen: de mt940-kant van DUAL (60+40) valt weg en de psd2-tegenhangers (60+40) blijven, de
       mt940-regel BUITEN het venster (33, Etos) telt mee, SOLO (70+30) telt volledig mee, en de csv-kant
       van Zakgeld (55) valt weg via v284 terwijl zijn psd2-tegenhanger blijft. */
    expect(r.bood, '100 psd2 + 33 Etos + 100 SOLO + 55 psd2 Albert Heijn').toBe(288);
    expect(r.vices, 'de mt940-regel van Splif valt weg en heeft geen tegenhanger').toBe(0);
    /* de twee psd2-regels die het VENSTER zetten (11 en 12) dragen geen eigen regel en landen dus op
       overig; ze horen erbij, want ze zijn de reden dat het venster bestaat. */
    expect(r.overig, '15 Kiosk plus de twee vensterranden van 11 en 12').toBe(38);
  });
});

test.describe('2 - zichtbaar in de geenNorm-vorm', () => {
  test('een regel per rekening, met het bedrag dat uit spendNorm wegvalt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const d = document.createElement('div'); d.innerHTML = mt940DubbelRegels(m);
      const rijen = [...d.querySelectorAll('div')].map((x) => x.textContent.trim());
      const norm = TX.filter((t) => t.date.slice(0, 7) === m && mt940Dubbel(t) && dubbelBronTelt(t))
        .reduce((s, t) => s - t.amount, 0);
      const opname = TX.filter((t) => t.date.slice(0, 7) === m && mt940Dubbel(t) && !dubbelBronTelt(t)).length;
      return { rijen, norm: Math.round(norm), opname, html: d.innerHTML };
    }, M);
    expect(r.rijen.length, 'een regel, want een rekening draagt de uitsluiting').toBe(1);
    expect(r.norm, '60 + 40 + 25; de opname van 200 telt nergens als uitgave').toBe(125);
    expect(r.opname, 'drie uitgesloten boekingen tellen nergens als uitgave (de opname en het'
      + ' kandidaat-paar), en zonder zo n geval doet dubbelBronTelt() niets').toBe(3);
    expect(r.rijen[0]).toContain('125');
    expect(r.rijen[0]).toContain('ook via je bankkoppeling');
    expect(r.html).toContain("openMt940Dubbel('" + DUAL + "','" + M + "')");
  });

  test('de twee uitsluitingen staan als eigen regel en noemen nooit dezelfde rekening', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const lees = (h) => { const d = document.createElement('div'); d.innerHTML = h;
        return [...d.querySelectorAll('div')].map((x) => x.getAttribute('onclick') || ''); };
      return { csv: lees(csvDubbelRegels(m)), mt: lees(mt940DubbelRegels(m)) };
    }, M);
    expect(r.csv.length, 'de csv-poort van v284 levert ook een regel').toBe(1);
    expect(r.mt.length).toBe(1);
    expect(r.csv[0]).toContain('openCsvDubbel');
    expect(r.mt[0]).toContain('openMt940Dubbel');
    const acc = (s) => (s.match(/\('([^']+)'/) || [])[1];
    expect(acc(r.csv[0]), 'de twee verzamelingen zijn per constructie disjunct')
      .not.toBe(acc(r.mt[0]));
  });

  /* v359: de stand-kaart is vervallen; de regels staan in de sheet achter de tegel Uitgegeven, onder "Niet in
     dit bedrag", ook voor een afgesloten maand. */
  test('de sheet achter Uitgegeven draagt beide regels', async ({ page }) => {
    await boot(page);
    /* `renderIns()` en niet alleen `go('ins')`: een navigatie is geen hertekening, en met alleen de
       navigatie stond de kaart er nog zonder deze regels. Dat is de meetles van `v280`, hier gemeten. */
    const t = await page.evaluate((m) => { curMonth = m; window._insPer = null; go('ins'); renderIns(); openInsTegel('uitgegeven'); return document.getElementById('sheet').innerText; }, M);
    expect((t.match(/ook via je bankkoppeling/g) || []).length, 'een regel per uitsluiting').toBe(2);
  });

  test('de sheet telt op tot het bedrag van de regel en noemt het venster', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([m, dual]) => {
      openMt940Dubbel(dual, m);
      const sh = document.getElementById('sheet');
      const bedragen = [...sh.querySelectorAll('.tx .amt')].map((x) => x.textContent);
      return { txt: sh.innerText, n: bedragen.length };
    }, [M, DUAL]);
    expect(r.n, 'drie uitgaven; de opname staat niet in de lijst').toBe(3);
    expect(r.txt, 'het bedrag boven de lijst').toContain('125');
    expect(r.txt, 'het venster van de psd2-kant').toContain('5 mrt 2026');
    expect(r.txt).toContain('25 mrt 2026');
    expect(r.txt, 'twee bronnen voor dezelfde rekening, dus niet de csv-formulering')
      .toContain('twee bronnen voor dezelfde rekening');
    /* drie: de opname en de twee kanten van het kandidaat-paar. Die telden nooit als uitgave, dus ze
       zitten niet in de 125, en dat mag niet stil blijven (v284). */
    expect(r.txt, 'wat er in hetzelfde venster viel zonder als uitgave te tellen').toContain('nog 3 boekingen');
  });
});

test.describe('3 - de boeking blijft staan en zegt dat hij niet meetelt', () => {
  test('de transactielijst markeert hem met dezelfde reden als de csv-kant', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([m, dual]) => {
      txPeriod = m; go('tx'); renderTxList();
      const el = document.getElementById('txList') || document.body;
      const weg = TX.filter((t) => t.acc === dual && mt940Dubbel(t));
      return { inTx: weg.length, tekst: el.innerText,
        n: (el.innerText.match(/telt niet mee, ook via je bankkoppeling/g) || []).length };
    }, [M, DUAL]);
    expect(r.inTx, 'zes uitgesloten boekingen staan nog in TX').toBe(6);
    expect(r.n, 'elke uitgesloten boeking zegt het, csv en mt940 samen').toBeGreaterThanOrEqual(4);
  });

  /* DE FIXTURE MOET HET PAAR WERKELIJK KUNNEN VORMEN, anders toetst deze test niets: eerst de meting dat
     de twee kanten dezelfde sleutel dragen en dat geldmaatMist() leeg is, dan de uitsluiting. */
  test('dubbelParen() biedt een uitgesloten boeking niet nog eens aan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([dual]) => {
      const kant = TX.filter((t) => t.acc === dual && t.amount === -18 && t.src === 'mt940');
      const zonderPoort = new Map();
      for (const t of TX) { const k = dubbelSleutel(t); zonderPoort.set(k, (zonderPoort.get(k) || 0) + 1); }
      const ids = new Set();
      for (const p of dubbelParen()) { ids.add(p.a && p.a.id); ids.add(p.b && p.b.id); }
      return { n: kant.length, sleutels: [...new Set(kant.map(dubbelSleutel))].length,
        mist: kant.length === 2 ? geldmaatMist(kant[0], kant[1], 0) : ['geen paar'],
        groep: zonderPoort.get(dubbelSleutel(kant[0])),
        aangeboden: TX.filter((t) => mt940Dubbel(t) && ids.has(t.id)).length };
    }, [DUAL]);
    expect(r.n, 'twee kanten van hetzelfde bedrag op dezelfde dag').toBe(2);
    expect(r.sleutels, 'en ze dragen dezelfde sleutel, dus zonder de poort vormen ze een groep').toBe(1);
    expect(r.groep).toBe(2);
    expect(r.mist, 'de Geldmaat-vorm gaat op, dus zonder de poort wordt dit paar voorgelegd').toEqual([]);
    expect(r.aangeboden, 'een tweede poort op dezelfde boeking hoort niet te bestaan (v288)').toBe(0);
  });
});

test.describe('4 - een bron, en hij loopt mee met TX', () => {
  test('de poort staat op een plek en vorautBron() leest hem', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const n = (src.match(/mt940Dubbel\(/g) || []).length;
    expect(n, 'de poort plus zijn lezers').toBeGreaterThan(4);
    /* DE POORT STAAT IN DE LIJST EN NERGENS ANDERS. Tot v304 stond hij als vierde eis in de filter van
       vorautBron(); sinds deze ronde is dat een lijst met een naam per poort, omdat blok 10 er precies
       EEN van moet kunnen overslaan zonder de andere drie te kopieren (v104). */
    expect(src.split('const TELPOORTEN=').length - 1).toBe(1);
    expect(src.split("['mt940',  t=>mt940Dubbel(t)]").length - 1,
      'de poort komt een keer in de sommen, via de lijst').toBe(1);
    expect(src.split("function vorautBron(){ return telbareTx('voraut'); }").length - 1,
      'en vorautBron() is uit diezelfde lijst afgeleid').toBe(1);
    const poort = sectieVan(src, 'function mt940Dubbel(t){');
    expect(poort, 'de bron-toets is hier dragend en geen guard').toContain("(t.src||'')!=='mt940'");
    expect(poort, 'en het venster komt uit de cache en wordt niet opnieuw afgeleid').toContain('mt940Paar().map[t.acc]');
  });

  test('buildAccMeta() gooit de vensters weg, dus een import werkt door', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([dual]) => {
      const voor = mt940Paar().map[dual].tot;
      TX.push({ id: 'nieuw', date: '2026-04-09', amount: -5, acc: dual, src: 'psd2',
        name: 'Later', desc: 'Later PMNT', typ: '', ref: '', accName: '', refNums: [] });
      const zonder = mt940Paar().map[dual].tot;   // cache staat er nog
      buildAccMeta();
      return { voor, zonder, na: mt940Paar().map[dual].tot };
    }, [DUAL]);
    expect(r.voor).toBe('2026-03-25');
    expect(r.zonder, 'zonder buildAccMeta() blijft de cache staan').toBe('2026-03-25');
    expect(r.na, 'en daarna is het venster opgeschoven').toBe('2026-04-09');
  });

  /* 5 - DE PRIJS VAN DE POORT VOOR DE METING ZELF, en dit is de regressie die deze ronde bijna had
     opgeleverd. Blok 10 MEET of `t.date` bij een bron al de betaaldag is, en de poort haalt juist die
     bron uit de sommen. GEMETEN met de eerste vorm van v304, waarin sectie 2, 3 en 4 de volle poort
     lazen: sectie 4 zei `bron psd2   8 boekingen` op de rekening die twee regels hoger `mt940+psd2`
     heet, en sectie 2 kwam op nul boekingen met het veld. Dat is meetles (a) en (m), en zeven bestaande
     tests in twee bestanden vielen erop.
     DE TEST BINDT OP DE EIGENSCHAP: de secties die de as meten noemen de mt940-kant nog, en de secties
     die GELD tellen doen dat niet. Die twee tegelijk is wat een sabotage aan beide kanten rood zet. */
  test('sectie 2, 3 en 4 zien de mt940-kant nog, en zeggen in hun eigen uitvoer dat ze dat doen', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagDubbel().join(String.fromCharCode(10)));
    /* eerst meten dat de poort werkelijk vuurt op deze invoer: anders toetst de rest niets */
    const weg = await page.evaluate(() => TX.filter((x) => mt940Dubbel(x)).length);
    expect(weg, 'de poort vuurt op deze fixture').toBeGreaterThan(3);
    const s4 = t.slice(t.indexOf('4. DE BRON BINNEN EEN REKENING'), t.indexOf('5. DE VALUTADATUM'));
    expect(s4, 'sectie 4 leest beide bronnen van de rekening waarover hij gaat').toMatch(/bron mt940/);
    expect(s4).toMatch(/bron psd2/);
    expect(s4, 'en hij zegt welke lijst hij leest (v287)').toContain('met de mt940-poort van v304 eruit');
    const s2 = t.slice(t.indexOf('BOEKDATUM TEGEN BETAALDATUM'), t.indexOf('1. DE DEKKING'));
    expect(s2, 'sectie 2 noemt zijn bron in de uitvoer').toContain('MET de mt940-poort van v304 eruit');
    expect(s2, 'en telt de kaartregels van de mt940-kant nog mee').toMatch(/boekingen MET het veld:\s+[1-9]/);
    const s3 = t.slice(t.indexOf('3. DE WEEKDAGVERDELING'), t.indexOf('4. DE BRON BINNEN'));
    expect(s3).toContain('met de mt940-poort van v304 eruit');
    /* EN DE KANT DIE GELD TELT DOET HET OMGEKEERDE, en zegt dat ook: een bron die door een poort valt
       draagt daar nul euro. Zonder deze helft zou een sabotage die ALLES op de ongefilterde lijst zet
       groen blijven. */
    const s6 = t.slice(t.indexOf('6. PER MAAND'));
    expect(s6, 'sectie 6 telt geld en leest de volle poort').toContain('dus de VOLLE poort');
    expect(s6, 'en zegt waarom een mt940-groep daar kan ontbreken').toContain('de poort van');
    /* MIJN EERSTE VORM EISTE DAT ER GEEN mt940-GROEP STAAT, en die aanname was fout: de mt940-regel
       BUITEN het venster telt gewoon mee, dus die groep bestaat wel. Wat de twee kanten onderscheidt
       is het BEDRAG, en dat is ook de eigenschap die telt: sectie 6 draagt alleen de niet-uitgesloten
       mt940-euro's en sectie 4 draagt ze allemaal. Zonder dat verschil is een sabotage die alles op de
       ongefilterde lijst zet niet te vangen. */
    const s6mt = [...s6.matchAll(/^ +mt940 \|[^\n]*?in scope\s+(\d+) euro/gm)]
      .reduce((x, m) => x + (+m[1]), 0);
    const m4 = s4.match(/bron mt940\s+\d+ boekingen[\s\S]*?som (\d+)/);
    /* SOLO draagt 100 euro in scope en blijft volledig meetellen; van DUAL blijft alleen de
       mt940-regel VOOR het venster over (33). De 125 uitgesloten euro's van DUAL staan hier dus niet,
       en dat is het hele verschil met sectie 4, die ze wel leest. */
    expect(s6mt, 'sectie 6: SOLO 100 plus de regel buiten het venster 33, en niets uitgeslotens').toBe(133);
    expect(m4, 'sectie 4 leest een mt940-som op de rekening met twee bronnen').toBeTruthy();
    expect(+m4[1], 'en die is groter dan de 33 die sectie 6 van deze rekening overhoudt').toBeGreaterThan(33);
  });

  test('blok 10 noemt de vierde poort, ook op nul, en zegt wat de app uitsluit', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagDubbel().join(String.fromCharCode(10)));
    expect(t, 'een poort die niet in de lijst staat is niet van nul te scheiden (v300)')
      .toContain('mt940 in het psd2-venster van dezelfde rekening');
    expect(t, 'en 4d zegt wat de app met zijn eigen uitkomst doet (v287)')
      .toContain('DE APP SLUIT DAAROM UIT: mt940-boekingen van ' + DUAL);
    expect(t).toContain('2026-03-05 t/m 2026-03-25');
  });
});
