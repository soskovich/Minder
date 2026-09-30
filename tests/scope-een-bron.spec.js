/* v285: DE SNEDE VAN piekVerdeling() STAAT OP EEN PLEK, EN ELKE SCOPE-SOM DRAAGT DE CSV-POORT.
 *
 * DE AANLEIDING IS GEMETEN OP HET TOESTEL, in de uitvoer van v284 zelf: sectie 6 van blok 10 had
 * geen `csv | N26`-groep meer, terwijl meting 1 vier regels hoger nog `csv 0 van 3742 euro` meldde
 * onder het label "in de scope van piekVerdeling()". Twee antwoorden over dezelfde snede in
 * hetzelfde blok. De oorzaak: de snede stond zes keer in de bron, en v284 zette de poort alleen in
 * txOfMonth() en periodTx(), dus de vier lezers die zelf over TX lopen kregen hem niet.
 *
 * WAT DEZE SPEC VASTHOUDT, en het is bewust GEDRAG en niet een spelling: elke scope-lezer geeft
 * hetzelfde antwoord over dezelfde boekingen. Een sabotage die EEN lezer terugzet op TX zet precies
 * de assertie van die lezer rood, en de andere blijven groen - zo wijst de rode test de lezer aan.
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o):
 *  - een csv-rekening die met de psd2-rekening PAART, want zonder paring sluit v284 niets uit en
 *    kan geen enkele assertie hier vallen;
 *  - een csv-boeking ZONDER psd2-tweeling (de Lender Account-vorm van het toestel) die toch binnen
 *    het venster valt: zij is het bedrag dat wegvalt, en zonder haar is "wat de poort kost" nul;
 *  - die boeking is de GROOTSTE van de afgelopen week EN staat in dezelfde categorie als de
 *    psd2-kandidaat eronder, zodat alleen de poort de twee scheidt. Met een even grote psd2-tweeling
 *    ernaast zou de sabotage van de volgorde van TX afhangen in plaats van van de poort;
 *  - een psd2-boeking van VANDAAG, want het venster loopt tot de laatste psd2-boeking en zonder haar
 *    valt de verse csv-boeking er per constructie buiten (dat viel bij de eerste run rood);
 *  - csv-boekingen in een AFGESLOTEN week, want blok 9 rapporteert alleen volle voorbije weken en
 *    een boeking van vandaag raakt zijn reeks per constructie niet;
 *  - een csv-boeking op dag 1 tot 28 in een categorie met een potje, anders ziet weekBedragen() haar
 *    per constructie niet.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum } = require('./vaste-dag');
const fs = require('fs');

const PSD = '100110012848184840';
const CSV = 'N26 Zakgeld';

/* een lokale kalenderdag n dagen terug, net als ymdVan() in de app. toISOString() zou hier de
   UTC-dag geven en dat is onder CEST rond middernacht de dag ervoor (v199, meetles v280). */
/* v310: DE FIXTURE LEEST DEZELFDE DAG ALS DE PAGINA. `pinDag()` zet de klok van de pagina, maar
     deze regel bouwt de datums in Node, en met de echte klok lopen de twee dan uiteen: de app denkt
     dag dim-7 en de fixture schrijft dag 1. Dat is een NIEUWE scheiding die de pin zelf maakt, en
     ze is gemeten: met alleen de pin gingen er in deze groep drie tests rood die eerst groen waren. */
const jetzt = vasteDatum();
function D(n) {
  const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
/* een dag die zeker in een AFGESLOTEN kalenderweek ligt en op dag 1 t/m 28 van zijn maand valt:
   blok 9 leest alleen volle voorbije weken, en weekBedragen() alleen dag 1 t/m 28. */
function dagInVolleWeek(minDagen) {
  for (let n = minDagen; n < minDagen + 14; n++) {
    const s = D(n); const dag = +s.slice(8, 10);
    if (dag >= 1 && dag <= 28) return s;
  }
  return D(minDagen);
}
const CSV_WEEK = dagInVolleWeek(20);       // csv, in een afgesloten week, in een blok
const CSV_VERS = D(2);                     // csv, groot en recent: de kandidaat van scoreNotifs()
const PSD_VERS = D(3);                     // psd2, de kandidaat die WEL mag winnen
const CSV_BEDRAG = 500, PSD_BEDRAG = 200, CSV_WEEK_BEDRAG = 130;

function seed(opt) {
  opt = opt || {};
  const tx = [];
  const add = (acc, src, datum, amount, naam, desc) =>
    tx.push({ id: acc + '_' + tx.length, date: datum, amount, acc, src, name: naam,
      desc: desc || naam, typ: '', ref: '', accName: '', refNums: [] });

  /* de psd2-kant: een paar maanden kleine boodschappen (de mediaan waar de grote-uitgave-melding
     tegen afzet), de twee richtingsregels, en de spiegels van de csv-boekingen die WEL een
     tweeling hebben. */
  for (let n = 120; n >= 0; n -= 5) add(PSD, 'psd2', D(n), -12, 'Albert Heijn', 'Albert Heijn PMNT');
  add(PSD, 'psd2', D(40), 25, 'in', 'From Main to Zakgeld PMNT');
  add(PSD, 'psd2', D(40), -26, 'uit', 'From Zakgeld to Main PMNT');
  add(PSD, 'psd2', CSV_WEEK, -CSV_WEEK_BEDRAG, 'Vomar', 'Vomar Purmerend PMNT');
  add(PSD, 'psd2', PSD_VERS, -PSD_BEDRAG, 'Vomar', 'Vomar Purmerend PMNT');

  /* de csv-kant: een tweeling van de weekboeking (zodat de paring op de bedragen uitkomt) en een
     boeking ZONDER tweeling die toch binnen het venster valt. */
  add(CSV, 'csv', CSV_WEEK, -CSV_WEEK_BEDRAG, 'Vomar', 'Vomar');
  add(CSV, 'csv', CSV_VERS, -CSV_BEDRAG, 'Vomar', 'Vomar');
  if (opt.extraCsv) for (const e of opt.extraCsv) add(CSV, 'csv', e.d, e.a, e.n, e.n);

  const own = [...new Set(tx.map((t) => t.acc))];
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify(own),
    minder_accmeta: JSON.stringify({ [PSD]: { balance: 900, date: D(0) } }),
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 3000, toonLegeRek: true,
      manualBal: {}, budgets: { boodschappen: 700, overig: 400 },
      psd2Accounts: { [PSD]: { uid: 'u', iban: 'DE89' + PSD, hash: 'h', label: 'Zakgeld', bank: 'N26', exp: D(-90) } } }),
    minder_plan: '{}',
  };
}
async function boot(page, opt) {
  await pinDag(page);                                   // v310: voor de goto, anders leest de boot de echte klok
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof piekScope === 'function');
}

test.describe('0 · de fixture draagt het geval', () => {
  test('de csv-rekening paart, en haar boekingen vallen binnen het psd2-venster', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((a) => {
      const P = csvPsd2Paring().find((x) => x.csv === a.CSV);
      return { psd2: P && P.psd2, van: P && P.van, tot: P && P.tot,
        uit: TX.filter((t) => t.acc === a.CSV && csvDubbel(t)).length,
        n: TX.filter((t) => t.acc === a.CSV).length };
    }, { CSV });
    expect(r.psd2).toBe(PSD);
    expect(r.n).toBeGreaterThan(0);
    expect(r.uit).toBe(r.n);            // alle csv-boekingen vallen binnen het venster
  });

  test('de grote csv-boeking heeft GEEN psd2-tweeling, dus de poort is wat haar tegenhoudt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((a) => {
      const c = TX.find((t) => t.acc === a.CSV && t.amount === -a.bedrag);
      return { er: !!c, tweeling: TX.filter((t) => t.src === 'psd2' && t.amount === -a.bedrag).length,
        inScope: c ? piekInScope(c) : false };
    }, { CSV, bedrag: CSV_BEDRAG });
    expect(r.er).toBe(true);
    expect(r.tweeling).toBe(0);
    expect(r.inScope).toBe(true);       // zonder de poort zou zij gewoon meetellen
  });
});

test.describe('1 · de snede staat op een plek', () => {
  test('het predicaat komt precies twee keer voor: de bron en de uitzondering van blok 11', () => {
    const src = fs.readFileSync('index.html', 'utf8');
    const treffers = src.split('\n')
      .map((r, i) => ({ r, i }))
      .filter((x) => /isFixed\(/.test(x.r) && /geenNorm\(/.test(x.r));
    expect(treffers.length).toBe(2);
    expect(treffers[0].r).toContain('function piekInScope(t)');
    /* de tweede staat in diagCsvPsd2(), dat bewust TX leest: dat blok MEET wat de poort kost en zou
       met de poort erin per constructie nul meten. Die uitzondering staat als comment in de bron. */
    const voor = src.slice(0, src.split('\n').slice(0, treffers[1].i).join('\n').length);
    expect(voor.lastIndexOf('function diagCsvPsd2(')).toBeGreaterThan(voor.lastIndexOf('function diagDubbel('));
  });

  test('piekScope() is piekInScope() over de telbare boekingen, en niet over TX', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      scope: piekScope().length,
      telbaar: telbareTx().filter(piekInScope).length,
      ruw: TX.filter(piekInScope).length,
    }));
    expect(r.scope).toBe(r.telbaar);
    expect(r.scope).toBeLessThan(r.ruw);   // de fixture draagt het verschil
  });
});

test.describe('2 · elke lezer geeft hetzelfde antwoord', () => {
  test('piekVerdeling() telt de uitgesloten csv-euro\'s niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = thisYM(); const V = piekVerdeling(m);
      const ruw = TX.filter((t) => t.date.slice(0, 7) === m).filter(piekInScope).reduce((s, t) => s - t.amount, 0);
      const net = piekScope(m).reduce((s, t) => s - t.amount, 0);
      return { tot: V ? Math.round(V.tot) : 0, ruw: Math.round(ruw), net: Math.round(net) };
    });
    expect(r.tot).toBe(r.net);
    expect(r.tot).toBeLessThan(r.ruw);
  });

  test('blok 9 schrijft per week hetzelfde totaal op als piekScope()', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const t = diagPiekdag().join('\n');
      const rijen = [...t.matchAll(/week (\d{4}-\d{2}-\d{2}) t\/m (\d{4}-\d{2}-\d{2})\s+totaal (-?\d+)/g)]
        .map((m) => ({ van: m[1], tot: m[2], blok: +m[3] }));
      const S = piekScope();
      return rijen.map((w) => ({ van: w.van, blok: w.blok,
        app: Math.round(S.filter((x) => x.date >= w.van && x.date <= w.tot).reduce((s, x) => s - x.amount, 0)) }));
    });
    expect(r.length).toBeGreaterThan(0);
    /* de fixture moet een week dragen waarin csv zat, anders toetst deze vergelijking niets */
    expect(r.some((w) => w.van <= CSV_WEEK && w.blok > 0)).toBe(true);
    for (const w of r) expect(w.blok).toBe(w.app);
  });

  test('weekBedragen() telt de uitgesloten csv-euro\'s niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((a) => {
      const W = weekBedragen();
      const dag = +a.dag.slice(8, 10);
      const k = a.dag.slice(0, 7) + '#' + (Math.floor((dag - 1) / 7) + 1);
      const scope = new Set(weekScope());
      const som = (lijst) => Math.round(lijst
        .filter((t) => t.date.slice(0, 7) + '#' + (Math.floor((+t.date.slice(8, 10) - 1) / 7) + 1) === k)
        .filter((t) => scope.has(catOf(t)) && CATS[catOf(t)] && CATS[catOf(t)].type === 'expense')
        .reduce((s, t) => s - t.amount, 0));
      const csvEur = Math.round(TX.filter((t) => t.acc === a.CSV && t.date === a.dag && scope.has(catOf(t)))
        .reduce((s, t) => s - t.amount, 0));
      return { blok: Math.round(W[k] || 0), telbaar: som(telbareTx()), ruw: som(TX), csvEur };
    }, { CSV, dag: CSV_WEEK });
    expect(r.csvEur).toBe(CSV_WEEK_BEDRAG);           // de fixture draagt het geval
    expect(r.ruw - r.telbaar).toBe(CSV_WEEK_BEDRAG);  // en het verschil zit in dit blok
    expect(r.blok).toBe(r.telbaar);
  });

  test('scoreNotifs() wijst de psd2-boeking aan en niet de uitgesloten csv-boeking', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((a) => {
      const csv = TX.find((t) => t.acc === a.CSV && t.amount === -a.csvB);
      const psd = TX.find((t) => t.src === 'psd2' && t.amount === -a.psdB);
      const n = scoreNotifs().filter((x) => String(x.key || '').indexOf('big-') === 0);
      return { keys: n.map((x) => x.key), csvId: csv && csv.id, psdId: psd && psd.id };
    }, { CSV, csvB: CSV_BEDRAG, psdB: PSD_BEDRAG });
    expect(r.keys).toContain('big-' + r.psdId);
    expect(r.keys).not.toContain('big-' + r.csvId);
  });
});

test.describe('3 · blok 10 zegt over csv hetzelfde als sectie 6', () => {
  test('meting 1 meldt nul in-scope euro\'s voor csv, en sectie 6 heeft geen csv-groep', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const t = diagDubbel().join('\n');
      const a = t.indexOf('1. DE DEKKING VAN HET VELD PER BRON');
      const b = t.indexOf('2. DE DESCS MET MEER DAN EEN');
      const meting1 = t.slice(a, b).split('\n');
      const i = meting1.findIndex((r) => /^\s{4}csv\s/.test(r));
      const s6 = t.slice(t.indexOf("6. PER MAAND: WELK DEEL"));
      return { csvRij: i >= 0 ? meting1[i + 1] : '', s6Csv: /\n\s+csv \|/.test(s6),
        csvInTx: TX.filter((t2) => (t2.src || '') === 'csv').length };
    });
    expect(r.csvInTx).toBeGreaterThan(0);         // de bron bestaat nog in TX
    expect(r.csvRij).toContain('in de scope van piekVerdeling(): 0 van 0 euro');
    expect(r.s6Csv).toBe(false);
  });

  test('blok 11 blijft de hele csv-kant meten, want die meet wat de poort kost', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((a) => {
      const t = diagCsvPsd2().join('\n');
      const m = t.match(new RegExp(a.CSV.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+(\\d+) boekingen'));
      return { blok: m ? +m[1] : -1, tx: TX.filter((x) => x.acc === a.CSV).length,
        /* v287: bindt op de OPBRENGSTREGEL en niet meer op "wat het zou kosten"; de eigenschap is
           dezelfde, namelijk dat blok 11 hier een bedrag boven nul meldt terwijl de app er nul telt. */
        kosten: /DE UITSLUITING HAALT HIER WEG: [1-9]\d* boekingen, [1-9]\d* euro netto/.test(t) };
    }, { CSV });
    expect(r.blok).toBe(r.tx);
    expect(r.kosten).toBe(true);
  });
});
