/* v284: EEN CSV-REGEL BINNEN HET VENSTER VAN ZIJN GEKOPPELDE PSD2-REKENING TELT NIET MEE.
 *
 * DE AANLEIDING IS GEMETEN IN BLOK 11 op het toestel: vier N26-Spaces kwamen eerst als csv-export binnen
 * en staan sinds de koppeling van 24 maanden ook als psd2-rekening in TX. Van de 371 csv-boekingen in die
 * vier vensters kreeg de match per boeking er 345 een tegenhanger; de csv-kant is dus vrijwel een
 * DEELVERZAMELING van de psd2-kant en elke euro in dat venster telde twee keer (3.493 euro netto in de
 * scope van piekVerdeling(), precies het `csv | N26`-getal in sectie 6 van blok 10).
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o: schrijf eerst op welk geval de regel
 * onderscheidt van de voor de hand liggende variant, en zet dat geval erin):
 *  - VIER PAREN zoals blok 11 ze op het toestel vaststelt (Main, Zakgeld, Buffer Rust, Buffer Comfort);
 *  - EEN VIJFDE CSV-REKENING MET EEN GELIJKE STAND: even veel dag+bedrag-treffers op twee psd2-rekeningen,
 *    terwijl de RICHTING er een aanwijst. Zonder dit geval kan de tie-break niet vallen: haal hem weg en
 *    er wordt wel gepaard, dus wel uitgesloten;
 *  - BUFFER RUST DRAAGT EEN SMALLER PSD2-VENSTER DAN ZIJN CSV-VENSTER, met een csv-boeking ervoor en een
 *    erna. Zonder dit geval is "het venster van de psd2-kant" niet te onderscheiden van "het venster van
 *    de csv-kant" en van "alles van een gepaarde rekening";
 *  - EEN PSD2-BOEKING BINNEN HETZELFDE VENSTER, die gewoon moet blijven meetellen. Zonder dit geval is een
 *    poort op de REKENING niet te onderscheiden van een poort op de BRON;
 *  - EEN UITGESLOTEN OPNAME (intern, dus nooit een uitgave). Zonder dit geval is het bedrag op de kaart niet
 *    te onderscheiden van een som over alle uitgesloten boekingen.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const CM = 'N26 Main', PM = '100110012555096222';
const CZ = 'N26 Zakgeld', PZ = '100110012848184840';
const CR = 'N26 Buffer Rust', PR = '100110012252714323';
const CB = 'N26 Buffer Comfort', PB = '100110012351717586';
const CG = 'N26 Gelijk';                 // de vijfde: gelijke stand, dus geen paring

const rij = (acc, src, rows) => rows.map((r, i) => ({ id: acc + '_s' + i, date: r.d, amount: r.a, acc, src,
  name: r.n, desc: r.desc || r.n, typ: '', ref: '', accName: '', refNums: [] }));

/* een paar bouwen: dezelfde dag en hetzelfde bedrag aan beide kanten, met een andere omschrijving (en dus
   een andere t.id), plus de "From X to Y"-regels die de RICHTING dragen. */
function paar(spatie, rows) {
  const csv = rows.map((r) => ({ d: r.d, a: r.a, n: r.n, desc: r.n }));
  const psd = rows.map((r) => ({ d: r.d, a: r.a, n: r.n, desc: r.n + ' Purmerend PMNT' }));
  psd.push({ d: rows[0].d, a: 25, n: 'in', desc: 'From Main to ' + spatie + ' PMNT' });
  psd.push({ d: rows[0].d, a: -26, n: 'uit', desc: 'From ' + spatie + ' to Main PMNT' });
  return { csv, psd };
}

function seed(opt) {
  opt = opt || {};
  const M = paar('Main', [
    { d: '2026-03-03', a: -21.5, n: 'Plus de Gors' },
    { d: '2026-03-09', a: -32.75, n: 'Vomar' },
    { d: '2026-04-04', a: -43, n: 'Splif' },
  ]);
  /* EEN UITGESLOTEN OPNAME: intern, dus nooit een uitgave. Hij valt in het venster en verdwijnt uit de
     maandsommen, maar hij hoort niet in het bedrag op de kaart. */
  M.csv.push({ d: '2026-03-12', a: -200, n: 'Geldmaat', desc: 'GELDMAAT Purmerend' });
  M.psd.push({ d: '2026-03-12', a: -200, n: 'Geldmaat', desc: 'Geldmaat Purmerend PMNT' });
  /* EEN PSD2-BOEKING BINNEN HETZELFDE VENSTER ZONDER CSV-KANT: die blijft gewoon tellen. */
  M.psd.push({ d: '2026-03-20', a: -60, n: 'Tango', desc: 'Tango Purmerend PMNT' });

  const Z = paar('Zakgeld', [
    { d: '2026-03-05', a: -11.25, n: 'Kiosk' },
    { d: '2026-03-18', a: -12.5, n: 'Bakker' },
  ]);
  const B = paar('Buffer Comfort', [
    { d: '2026-03-07', a: -13.4, n: 'Etos' },
    { d: '2026-03-21', a: -14.6, n: 'Hema' },
  ]);

  /* BUFFER RUST: het psd2-venster is SMALLER dan het csv-venster. De psd2-kant loopt van 03-01 t/m 04-01,
     de csv-kant van 02-01 t/m 05-30. De boeking van 02-01 ligt ervoor en die van 05-30 erna; allebei
     blijven ze meetellen. */
  const R = paar('Buffer Rust', [
    { d: '2026-03-15', a: -19.9, n: 'Gamma' },
  ]);
  R.psd.push({ d: '2026-03-01', a: -7, n: 'Rand', desc: 'Rand Purmerend PMNT' });
  R.psd.push({ d: '2026-04-01', a: -8, n: 'Rand', desc: 'Rand Purmerend PMNT' });
  R.csv.push({ d: '2026-02-01', a: -91, n: 'Voor het venster', desc: 'Voor het venster' });
  R.csv.push({ d: '2026-05-30', a: -92, n: 'Na het venster', desc: 'Na het venster' });

  /* DE VIJFDE: GELIJKE STAND OP DE BEDRAGEN. Een boeking met een dag+bedrag-treffer op PM en een op PZ,
     dus ex=1 tegen ex=1, terwijl de richting ("to gelijk" / "from gelijk") alleen op PM staat. Zonder de
     tie-break zou hij dus met PM paren en zou 2026-03 hier euro's verliezen. */
  const G = [
    { d: '2026-03-03', a: -21.5, n: 'Plus de Gors', desc: 'Plus de Gors' },
    { d: '2026-03-05', a: -11.25, n: 'Kiosk', desc: 'Kiosk' },
    { d: '2026-03-06', a: -150, n: 'Praxis', desc: 'Praxis' },
  ];
  M.psd.push({ d: '2026-03-02', a: 31, n: 'in', desc: 'From Main to Gelijk PMNT' });
  M.psd.push({ d: '2026-03-02', a: -32, n: 'uit', desc: 'From Gelijk to Main PMNT' });
  if (opt.geenGelijk) { G.length = 0; }

  let alles = rij(CM, 'csv', M.csv).concat(rij(PM, 'psd2', M.psd))
    .concat(rij(CZ, 'csv', Z.csv)).concat(rij(PZ, 'psd2', Z.psd))
    .concat(rij(CR, 'csv', R.csv)).concat(rij(PR, 'psd2', R.psd))
    .concat(rij(CB, 'csv', B.csv)).concat(rij(PB, 'psd2', B.psd))
    .concat(rij(CG, 'csv', G));
  if (opt.geenKoppeling) alles = alles.filter((t) => t.src !== 'psd2');

  const ps = {};
  for (const [a, l] of [[PM, 'Main'], [PZ, 'Zakgeld'], [PR, 'Buffer Rust'], [PB, 'Buffer Comfort']])
    ps[a] = { uid: 'u-' + l, iban: 'DE89' + a, hash: 'h-' + l, label: l, bank: 'N26', exp: '2026-12-27' };
  return {
    minder_tx: JSON.stringify(alles), minder_ovr: '{}',
    minder_own: JSON.stringify([...new Set(alles.map((t) => t.acc))]),
    minder_accmeta: JSON.stringify({ [PM]: { balance: 500, date: '2026-09-28' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {},
      budgets: { boodschappen: 400, overig: 400, wonen: 200 },
      psd2Accounts: opt.geenKoppeling ? {} : ps, psd2LastSync: Date.now() }),
    minder_plan: '{}',
  };
}

async function boot(page, opt) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof csvDubbel === 'function');
}
const M3 = '2026-03';

test.describe('0 · de fixture draagt de gevallen waarop de regel uiteenloopt', () => {
  test('vier paren, en de vijfde rekening paart NIET op een gelijke stand', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => csvPsd2Paring().map((x) => ({ csv: x.csv, psd2: x.psd2, pb: x.pb, pr: x.pr })));
    const map = {}; for (const x of r) map[x.csv] = x;
    expect(map[CM].psd2).toBe(PM);
    expect(map[CZ].psd2).toBe(PZ);
    expect(map[CR].psd2).toBe(PR);
    expect(map[CB].psd2).toBe(PB);
    /* de vijfde: de bedragen wijzen NIETS aan (gelijke stand), de richting wel. Zonder dat verschil
       toetst de tie-break niets, dus dat staat hier apart. */
    expect(map[CG].pb).toBe(null);
    expect(map[CG].pr).toBe(PM);
    expect(map[CG].psd2).toBe(null);
  });

  test('de gelijke stand is er echt: twee psd2-rekeningen met evenveel dag+bedrag-treffers', async ({ page }) => {
    await boot(page);
    const ex = await page.evaluate(() => {
      const r = csvPsd2Paring().find((x) => x.csv === 'N26 Gelijk');
      return r.rij.map((x) => x.ex).sort((a, b) => b - a);
    });
    expect(ex[0]).toBeGreaterThan(0);
    expect(ex[1]).toBe(ex[0]);
  });

  test('het psd2-venster van Buffer Rust is SMALLER dan zijn csv-venster', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const d = (a) => TX.filter((t) => t.acc === a).map((t) => t.date).sort();
      const c = d('N26 Buffer Rust'), p = d('100110012252714323');
      return { c: [c[0], c[c.length - 1]], p: [p[0], p[p.length - 1]] };
    });
    expect(r.c[0] < r.p[0]).toBe(true);
    expect(r.c[1] > r.p[1]).toBe(true);
  });
});

test.describe('1 · de poort', () => {
  test('binnen het venster van zijn gepaarde psd2-rekening telt een csv-regel niet mee', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const inM = TX.filter((t) => t.date.slice(0, 7) === m);
      return {
        uit: inM.filter((t) => csvDubbel(t)).map((t) => t.acc + '|' + t.date + '|' + t.amount).sort(),
        maand: txOfMonth(m).length, alle: inM.length,
      };
    }, M3);
    expect(r.maand).toBeLessThan(r.alle);
    /* alle csv-regels van de vier gepaarde rekeningen die in maart binnen het venster vallen */
    expect(r.uit).toContain(CM + '|2026-03-03|-21.5');
    expect(r.uit).toContain(CM + '|2026-03-12|-200');
    expect(r.uit).toContain(CZ + '|2026-03-05|-11.25');
    expect(r.uit).toContain(CB + '|2026-03-07|-13.4');
    expect(r.uit).toContain(CR + '|2026-03-15|-19.9');
  });

  test('buiten het psd2-venster blijft een csv-regel meetellen, aan beide kanten', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      voor: txOfMonth('2026-02').filter((t) => t.acc === 'N26 Buffer Rust').map((t) => t.amount),
      na: txOfMonth('2026-05').filter((t) => t.acc === 'N26 Buffer Rust').map((t) => t.amount),
      dubVoor: TX.filter((t) => t.date === '2026-02-01').every((t) => !csvDubbel(t)),
      dubNa: TX.filter((t) => t.date === '2026-05-30').every((t) => !csvDubbel(t)),
    }));
    expect(r.voor).toEqual([-91]);
    expect(r.na).toEqual([-92]);
    expect(r.dubVoor).toBe(true);
    expect(r.dubNa).toBe(true);
  });

  test('bij een gelijke stand wordt er niets uitgesloten', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({
      uit: TX.filter((t) => t.acc === 'N26 Gelijk' && csvDubbel(t)).length,
      n: txOfMonth(m).filter((t) => t.acc === 'N26 Gelijk').length,
      som: txOfMonth(m).filter((t) => t.acc === 'N26 Gelijk').reduce((s, t) => s - t.amount, 0),
    }), M3);
    expect(r.uit).toBe(0);
    expect(r.n).toBe(3);
    expect(r.som).toBeCloseTo(182.75, 2);
  });

  test('een psd2-boeking in hetzelfde venster blijft gewoon meetellen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({
      psd: txOfMonth(m).filter((t) => t.src === 'psd2').length,
      alle: TX.filter((t) => t.date.slice(0, 7) === m && t.src === 'psd2').length,
      tango: txOfMonth(m).some((t) => t.name === 'Tango' && t.amount === -60),
    }), M3);
    expect(r.psd).toBe(r.alle);
    expect(r.tango).toBe(true);
  });

  /* DE BRON-TOETS IS ALLEEN LANGS EEN VEROUDERDE CACHE TE BEREIKEN, en zonder dit pad is hij een guard
     die per constructie niet kan vallen: een gepaarde rekening draagt alleen csv, dus `src==='csv'` is
     daar altijd waar. Hier verandert TX zonder buildAccMeta(), precies zoals tussen twee stappen van een
     import, en dan moet een psd2-boeking op die rekening gewoon blijven tellen. */
  test('een psd2-boeking op een gepaarde rekening telt mee, ook met een verouderde paring', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      csvPaar();                                  // de cache staat nu, en blijft staan
      TX.push({ id: 'laat1', date: m + '-10', amount: -70, acc: 'N26 Main', src: 'psd2',
        name: 'Laat', desc: 'Laat Purmerend PMNT', typ: '', ref: '', accName: '', refNums: [] });
      TX.forEach(categorize); save();   /* v310: save() hoort hier, want de poort-memo hangt aan `_dataGen` en elke route in de app bumpt die. Zonder deze regel leest de meting de stand van voor de mutatie. De paar-cache blijft wel staan: die gooit alleen buildAccMeta() weg, en dat is precies het pad dat deze test loopt. */
      const t = TX[TX.length - 1];
      return { dub: csvDubbel(t), inMaand: txOfMonth(m).some((x) => x.id === t.id) };
    }, M3);
    expect(r.dub).toBe(false);
    expect(r.inMaand).toBe(true);
  });

  test('zonder koppeling is er geen paring en telt alles mee', async ({ page }) => {
    await boot(page, { geenKoppeling: true });
    const r = await page.evaluate((m) => ({
      paren: csvPsd2Paring().filter((x) => x.psd2).length,
      uit: TX.filter((t) => csvDubbel(t)).length,
      maand: txOfMonth(m).length, alle: TX.filter((t) => t.date.slice(0, 7) === m).length,
    }), M3);
    expect(r.paren).toBe(0);
    expect(r.uit).toBe(0);
    expect(r.maand).toBe(r.alle);
  });
});

test.describe('2 · wat de sommen ervan merken', () => {
  test('de uitsluiting verlaagt spendNorm met precies de uitgesloten norm-uitgaven', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const na = totals(m).spendNorm;
      const uit = TX.filter((t) => t.date.slice(0, 7) === m && csvDubbel(t) && dubbelBronTelt(t))
        .reduce((s, t) => s - t.amount, 0);
      /* de tegenmeting: dezelfde som zonder de poort, met dezelfde afronding als totals() */
      const zonder = TX.filter((t) => t.date.slice(0, 7) === m)
        .filter((t) => CATS[catOf(t)].type === 'expense' && !geenNorm(catOf(t)))
        .reduce((s, t) => s - t.amount, 0);
      return { na, uit, zonder };
    }, M3);
    expect(r.uit).toBeGreaterThan(0);
    expect(r.na).toBeCloseTo(r.zonder - r.uit, 2);
  });

  test('piekVerdeling() telt de uitgesloten regels niet meer, en dat scheelt euro\'s', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const V = piekVerdeling(m);
      const ruw = TX.filter((t) => t.date.slice(0, 7) === m)
        .filter((t) => CATS[catOf(t)] && CATS[catOf(t)].type === 'expense' && !isFixed(t) && !geenNorm(catOf(t)))
        .reduce((s, t) => s - t.amount, 0);
      return { tot: V ? V.tot : 0, ruw };
    }, M3);
    expect(r.tot).toBeGreaterThan(0);
    expect(r.tot).toBeLessThan(r.ruw);
  });

  test('een drill-down telt op tot het cijfer erboven: openCategory leest dezelfde poort', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const k = Object.keys(catSpendMap(m)).sort((a, b) => catSpendMap(m)[b] - catSpendMap(m)[a])[0];
      openCategory(k, m);
      const rijen = [...document.querySelectorAll('#sheet .tx')].length;
      const lijst = txOfMonth(m).filter((t) => catOf(t) === k).length;
      const ruw = TX.filter((t) => t.date.slice(0, 7) === m && catOf(t) === k).length;
      return { k, rijen, lijst, ruw };
    }, M3);
    expect(r.rijen).toBe(r.lijst);
    expect(r.rijen).toBeLessThan(r.ruw);
  });

  test('periodTx() leest dezelfde poort als txOfMonth()', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      per: periodTx().filter((t) => csvDubbel(t)).length,
      heeft: TX.filter((t) => csvDubbel(t)).length,
    }));
    expect(r.heeft).toBeGreaterThan(0);
    expect(r.per).toBe(0);
  });

  test('het saldo blijft ongemoeid: totalBalance() leest ACCMETA en geen boekingen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => totalBalance().sum);
    expect(r).toBe(500);
  });
});

test.describe('3 · wat de gebruiker ervan ziet', () => {
  test('een regel per rekening in de geenNorm-vorm, met het bedrag dat wegvalt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const h = csvDubbelRegels(m);
      const d = document.createElement('div'); d.innerHTML = h;
      return [...d.children].map((x) => x.textContent.trim());
    }, M3);
    expect(r.length).toBe(4);
    expect(r.some((x) => /Main/.test(x))).toBe(true);
    expect(r.some((x) => /Zakgeld/.test(x))).toBe(true);
    expect(r.some((x) => /Buffer Rust/.test(x))).toBe(true);
    expect(r.some((x) => /Buffer Comfort/.test(x))).toBe(true);
    for (const x of r) expect(x).toMatch(/ook via je bankkoppeling/);
    expect(r.every((x) => /Gelijk/.test(x))).toBe(false);
  });

  test('de bedragen tellen op tot de uitgesloten norm-uitgaven en laten de opname erbuiten', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const d = document.createElement('div'); d.innerHTML = csvDubbelRegels(m);
      const som = [...d.children].map((x) => +(x.textContent.match(/€\s*([\d.]+)/) || [0, 0])[1].replace(/\./g, ''))
        .reduce((a, b) => a + b, 0);
      const norm = TX.filter((t) => t.date.slice(0, 7) === m && csvDubbel(t) && dubbelBronTelt(t))
        .reduce((s, t) => s - t.amount, 0);
      const opname = TX.filter((t) => t.date.slice(0, 7) === m && csvDubbel(t) && !dubbelBronTelt(t))
        .reduce((s, t) => s - t.amount, 0);
      return { som: Math.round(som), norm: Math.round(norm), opname: Math.round(opname) };
    }, M3);
    expect(r.opname).toBe(200);          // de opname valt weg uit de sommen en NIET in het bedrag
    expect(r.som).toBe(r.norm);
    expect(r.som).toBeLessThan(r.norm + r.opname);
  });

  /* v359: de stand-kaart is vervallen; de regel staat in de sheet achter de tegel Uitgegeven, ook bij een
     afgesloten maand (hier via curMonth, zoals het filter dat zet). */
  test('de regel staat in de sheet achter Uitgegeven op Inzichten', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate((m) => { curMonth = m; go('ins'); openInsTegel('uitgegeven'); return document.getElementById('insTegelSheet').innerHTML; }, M3);
    expect(t).toMatch(/ook via je bankkoppeling/);
    expect(t).toMatch(/openCsvDubbel\('N26 Main','2026-03'\)/);
  });

  test('de sheet erachter telt op tot het bedrag waarop je tikte, met het venster erbij', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const d = document.createElement('div'); d.innerHTML = csvDubbelRegels(m);
      const regel = [...d.children].find((x) => /Main/.test(x.textContent)).textContent;
      openCsvDubbel('N26 Main', m);
      const s = document.getElementById('sheet');
      const rijen = [...s.querySelectorAll('.tx')];
      const som = rijen.map((x) => +x.querySelector('.amt').textContent.replace(/[^\d,-]/g, '').replace(',', '.'))
        .reduce((a, b) => a - b, 0);
      const e = csvPaar().map['N26 Main'];
      const dag = (d) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
      return { regel, tekst: s.innerText, rijen: rijen.length, som: Math.round(som),
        van: dag(e.van), tot: dag(e.tot) };
    }, M3);
    expect(r.rijen).toBe(2);             // 03-03 en 03-09; de opname staat er niet bij
    const bedrag = +(r.regel.match(/€\s*([\d.]+)/)[1].replace(/\./g, ''));
    expect(r.som).toBe(bedrag);
    /* het venster komt uit dezelfde bron als de poort, dus de sheet kan er niet een ander venster
       noemen dan waarop is uitgesloten (v104) */
    expect(r.tekst).toContain(r.van);
    expect(r.tekst).toContain(r.tot);
    expect(r.tekst).toMatch(/valt nog 1 boeking van deze rekening/);
  });

  test('de boeking blijft in de transactielijst staan, en zegt daar dat hij niet meetelt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      txPeriod = 'all'; go('tx'); renderTxList();
      const el = document.getElementById('txlist');
      return { tekst: el.innerText, n: el.innerText.split('telt niet mee, ook via je bankkoppeling').length - 1 };
    });
    expect(r.n).toBeGreaterThan(0);
    expect(r.tekst).toMatch(/Plus de Gors/);
  });
});

/* v359: hier stond 3b, de hoogte van de stand-kaart met vier regels. Die kaart is vervallen; de regels staan in de
   sheet achter Uitgegeven, en daar geldt geen hoogte-eis. */
test.describe('4 · een bron, en hij loopt mee met TX', () => {
  test('blok 11 leest dezelfde paring als de app en noemt de uitsluiting', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagCsvPsd2().join('\n'));
    expect(t).toMatch(/DE APP SLUIT DAAROM UIT: csv-boekingen van N26 Main met een datum van 2026-03-0\d t\/m/);
    expect(t).toMatch(/DE APP SLUIT HIER NIETS UIT/);
  });

  test('blok 11 blijft de HELE csv-kant meten, ook wat de app uitsluit', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const t = diagCsvPsd2().join('\n');
      const m = t.match(/N26 Main\s+(\d+) boekingen/);
      return { blok: m ? +m[1] : -1, tx: TX.filter((x) => x.acc === 'N26 Main').length };
    });
    expect(r.blok).toBe(r.tx);
  });

  test('buildAccMeta() gooit de paring weg, dus een verhuizing werkt door', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const voor = TX.filter((t) => csvDubbel(t)).length;
      /* de psd2-kant van Buffer Comfort weghalen: dan valt die paring weg en telt zijn csv-kant weer mee */
      TX = TX.filter((t) => t.acc !== '100110012351717586');
      OWN = [...new Set(TX.map((t) => t.acc))];
      buildAccMeta();
      const na = TX.filter((t) => csvDubbel(t)).length;
      return { voor, na, bc: TX.filter((t) => t.acc === 'N26 Buffer Comfort' && csvDubbel(t)).length };
    });
    expect(r.voor).toBeGreaterThan(r.na);
    expect(r.bc).toBe(0);
  });
});
