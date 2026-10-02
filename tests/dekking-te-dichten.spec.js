/* v322: EEN DEKKINGSGAT DAT LATER VALT EN NOG TE DICHTEN IS, VRAAGT AANDACHT EN GEEN BESLISSING.
   HET GEMELDE GEVAL: EUR 37 op de reserveringsrekening en een boete van EUR 299 eenmalig in november
   stond rood onder 'Vraagt een beslissing' met EUR 262 tekort, terwijl er deze maand niets tekort is.
   De toets was `doelMaandenTot(gat) >= dekkingMarge` (drie maanden), en die zegt niets over de
   grootte van het gat.
   DE REGEL: tekort als de post in de lopende maand valt of als het gat niet te dichten is met wat er
   per maand naar je reserveringsrekening gaat; let op als dat wel kan, met het bedrag per maand tot
   de vervaldag; ok als de pot het dekt.
   DE MAANDEN KOMEN UIT `doelMaandenTot()`, die de lopende maand uitsluit (v316). Op 15 september is
   november dus twee maanden weg en is het gat EUR 131 per maand; op 2 oktober is dat EUR 262. De
   klok staat daarom op 15 september: dat is de stand waarin het gemelde getal valt.
   DE DREMPEL IS HET GEMETEN STORTINGSTEMPO (de mediaan over drie afgeronde maanden) en NIET
   `benodigdPerMaand`: dat tweede is per constructie altijd genoeg (blok e meet dat), en een drempel
   die niet kan vallen is geen drempel. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', RES = 'NL01RESV0000007586';
const DAG = '2026-09-15';
const NOV = '2026-11';

function seed(o) {
  o = o || {};
  const st = o.stort || [150, 150, 150];       // juni, juli, augustus
  const tx = [];
  ['2026-06', '2026-07', '2026-08', '2026-09'].forEach((m, i) => {
    tx.push({ id: 'i' + i, date: m + '-03', amount: 4200, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    if (i < 3 && st[i] > 0) tx.push({ id: 'r' + i, date: m + '-08', amount: st[i], acc: RES, name: 'Reservering', desc: 'NAAR RESERVERING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  });
  // een betaling UIT de reserveringsrekening in elk venster-maand: geen storting, dus geen tempo
  if (o.uit) ['2026-06', '2026-07', '2026-08'].forEach((m, i) => tx.push({ id: 'u' + i, date: m + '-20', amount: -o.uit, acc: RES, name: 'Belastingdienst', desc: 'AANSLAG', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }));
  // een bijschrijving in de LOPENDE maand: telt niet in het tempo, houdt de rekening wel in beeld
  if (o.resSep) tx.push({ id: 'rs', date: '2026-09-05', amount: o.resSep, acc: RES, name: 'Reservering', desc: 'NAAR RESERVERING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4200, bufferNorm: 2, budgetMonth: '2026-09',
    manualBal: { [MAIN]: 3000, [RES]: 37 },
    resAcc: RES, resCheck: '2026-09',
    reserveringen: [{ id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: o.maand || NOV, intervalM: 0 }],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await pinDatum(page, (o && o.dag) || DAG);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof dekkingDichten === 'function');
}
const lees = (page) => page.evaluate(() => {
  const D = dekking(12);
  const r = maandRegels().find((x) => x.key === 'dekking');
  const T = resStortTempo();
  go('maand'); renderMaand();
  const kaart = (kop) => { const c = [...document.querySelectorAll('#s-maand .card')].find((x) => x.querySelector('.hlabel') && x.querySelector('.hlabel').innerText.trim().toUpperCase() === kop.toUpperCase()); return c ? c.innerText : ''; };
  return { gat: D.gat, tempo: T, status: r.status, eenheid: r.eenheid, gevolg: r.gevolg, perMaandTot: r.perMaandTot,
    maanden: doelMaandenTot(D.gat ? D.gat.maand : ''), perList: D.benodigdPerMaand,
    beslis: kaart('Vraagt een beslissing'), aandacht: kaart('Vraagt aandacht') };
});

/* ===== a) het gemelde geval ===== */
test.describe('a · EUR 37 en EUR 299 in november: aandacht, EUR 131 per maand', () => {
  test('de invoer: gat EUR 262, twee maanden, tempo EUR 150', async ({ page }) => {
    await boot(page);
    const r = await lees(page);
    expect(r.gat.tekort).toBe(262);
    expect(r.gat.maand).toBe(NOV);
    expect(r.maanden).toBe(2);
    expect(r.tempo.reeks).toEqual([150, 150, 150]);
    expect(r.tempo.perMaand).toBe(150);
  });
  test('de regel staat op let op en toont het bedrag per maand tot de vervaldag', async ({ page }) => {
    await boot(page);
    const r = await lees(page);
    expect(r.status).toBe('let op');
    expect(r.eenheid).toContain('€131 per maand tot november');
    expect(r.perMaandTot).toEqual({ bedrag: 131, maand: NOV });
    expect(r.gevolg).toContain('Dat is €131 per maand tot november, en de afgelopen 3 maanden ging er €150 per maand naar je reserveringsrekening.');
  });
  test('op het scherm: onder Vraagt aandacht en niet onder Vraagt een beslissing', async ({ page }) => {
    await boot(page);
    const r = await lees(page);
    expect(r.aandacht).toContain('Dekking reserveringen');
    expect(r.aandacht).toContain('€131 per maand tot november');
    expect(r.beslis).not.toContain('Dekking reserveringen');
  });
  /* Dezelfde stand op 2 oktober: doelMaandenTot() telt de lopende maand niet mee (v316), dus het
     is dan een maand en EUR 262 per maand, en dat is meer dan het tempo van EUR 150. */
  test('op 2 oktober is het EUR 262 per maand, en dat is een beslissing', async ({ page }) => {
    await boot(page, { dag: '2026-10-02' });
    const r = await page.evaluate(() => { const D = dekking(12); return { k: doelMaandenTot(D.gat.maand), DD: dekkingDichten(D) }; });
    expect(r.k).toBe(1);
    expect(r.DD.perMaand).toBe(262);
  });
});

/* ===== b) de post valt in de lopende maand ===== */
test('b · dezelfde post in de lopende maand is een beslissing', async ({ page }) => {
  await boot(page, { maand: '2026-09' });
  const r = await lees(page);
  expect(r.maanden).toBe(0);
  expect(r.tempo.perMaand).toBe(150);          // het tempo is er wel, de tijd niet
  expect(r.status).toBe('tekort');
  expect(r.gevolg).toContain('Die post valt deze maand');
  expect(r.beslis).toContain('Dekking reserveringen');
  expect(r.aandacht).not.toContain('Dekking reserveringen');
});

/* ===== c) het gat is groter dan het tempo tot de vervaldag ===== */
test.describe('c · een gat groter dan tempo maal maanden is een beslissing', () => {
  test('EUR 131 per maand tegen een tempo van EUR 100', async ({ page }) => {
    await boot(page, { stort: [100, 100, 100] });
    const r = await lees(page);
    expect(r.tempo.perMaand * r.maanden).toBeLessThan(r.gat.tekort);   // 200 < 262
    expect(r.status).toBe('tekort');
    expect(r.gevolg).toContain('€131 per maand tot november');
    expect(r.gevolg).toContain('€100 per maand');
    expect(r.beslis).toContain('Dekking reserveringen');
  });
  /* De oude marge gaf hier 'let op', want januari is vier maanden weg. De grootte van het gat telt nu:
     EUR 66 per maand tegen EUR 50. */
  test('ook als de post ver weg ligt', async ({ page }) => {
    await boot(page, { maand: '2027-01', stort: [50, 50, 50] });
    const r = await lees(page);
    expect(r.maanden).toBe(4);
    expect(r.status).toBe('tekort');
  });
  test('op de rand: precies tempo maal maanden is te dichten', async ({ page }) => {
    await boot(page, { stort: [131, 131, 131] });
    const r = await lees(page);
    expect(r.status).toBe('let op');
  });
});

/* ===== d) onbekend en de mediaan ===== */
test.describe('d · zonder gemeten tempo is het niet te dichten', () => {
  test('geen stortingen in drie maanden: tempo nul, beslissing', async ({ page }) => {
    await boot(page, { stort: [0, 0, 0], resSep: 500 });
    const r = await lees(page);
    expect(r.tempo.reeks).toEqual([0, 0, 0]);   // de september-storting telt niet mee
    expect(r.tempo.perMaand).toBe(0);
    expect(r.status).toBe('tekort');
  });
  test('minder dan drie afgeronde maanden: onbekend, beslissing', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      TX = TX.filter((t) => t.date >= '2026-08-01'); save();
      return { T: resStortTempo(), st: maandRegels().find((x) => x.key === 'dekking').status, g: maandRegels().find((x) => x.key === 'dekking').gevolg };
    });
    expect(r.T).toBeNull();
    expect(r.st).toBe('tekort');
    expect(r.g).toContain('nog niet te meten');
  });
  /* Het gemiddelde van 0, 0 en 900 is 300 en zou het gat te dichten noemen op geld dat een keer kwam. */
  test('een eenmalige grote storting tilt het tempo niet op', async ({ page }) => {
    await boot(page, { stort: [0, 0, 900] });
    const r = await lees(page);
    expect(r.tempo.reeks).toEqual([0, 0, 900]);
    expect(r.tempo.perMaand).toBe(0);
    expect(r.status).toBe('tekort');
  });
});

/* Het tempo is wat er IN gaat. Een post die je uit de pot betaalt is geen storting minder: het
   netto zou hier 0 per maand zeggen terwijl er elke maand EUR 150 naartoe gaat. */
test('d2 · een betaling uit de pot verlaagt het stortingstempo niet', async ({ page }) => {
  await boot(page, { uit: 150 });
  const r = await lees(page);
  expect(r.tempo.reeks).toEqual([150, 150, 150]);
  expect(r.status).toBe('let op');
});

/* ===== e) waarom niet benodigdPerMaand ===== */
test('e · het maandtempo van de lijst zou het gat in geval c te dichten noemen', async ({ page }) => {
  await boot(page, { stort: [100, 100, 100] });
  const r = await lees(page);
  // 150 x 2 = 300 >= 262: als drempel kan hij hier niet vallen, en dat is het geval dat c rood maakt
  expect(r.perList * r.maanden).toBeGreaterThanOrEqual(r.gat.tekort);
  expect(r.status).toBe('tekort');
});

/* ===== f) ok blijft ok ===== */
test('f · een pot die de post dekt staat goed', async ({ page }) => {
  await boot(page, { set: { manualBal: { [MAIN]: 3000, [RES]: 400 } } });
  const r = await lees(page);
  expect(r.gat).toBeNull();
  expect(r.status).toBe('ok');
  expect(r.perMaandTot).toBeNull();
});
