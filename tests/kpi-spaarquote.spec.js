// v109: de spaarquote meet wat er écht opzij ging, gedeeld door je inkomen.
// v161: de restsaldo-quote ernaast is vervallen, de spaarquote telt nu de hele vermogensopbouw en
// staat op het maandscherm in plaats van bij de kerncijfers op Inzichten. Er hoort geen norm meer
// bij, dus geen band en geen afstand. De brug bleef: spaarDekking() zegt nog steeds of je storting
// gedekt was door je overschot, maar stelt het cijfer niet bij (v117 ingetrokken in v161).
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { open, CUR, M1, M2, MAIN, SAV } = require('./budget-fixture');

// inkomen 3000, uitgaven 2100, en per maand een storting naar de spaarrekening
function seedSpaar({ stort = { [M2]: 250, [M1]: 300 }, gemarkeerd = true, spaarRekening = true } = {}) {
  const tx = [];
  const add = (id, m, day, amount, name, desc, acc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: acc === SAV ? 'Spaar' : 'Main', refNums: [] });
  for (const m of [M2, M1]) {
    add('inc-' + m, m, '01', 3000, 'Werkgever', 'SALARIS LOON');
    add('huur-' + m, m, '02', -1400, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('ah-' + m, m, '08', -700, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    const s = stort[m];
    if (s) {
      add('sp-uit-' + m, m, '25', -s, 'Eigen spaarrekening', 'OVERBOEKING NAAR SPAARREKENING');
      if (spaarRekening) add('sp-in-' + m, m, '25', s, 'Eigen spaarrekening', 'OVERBOEKING NAAR SPAARREKENING', SAV);
    }
  }
  const own = spaarRekening ? [MAIN, SAV] : [MAIN];
  const set = { limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000, manualBal: { [MAIN]: 500, [SAV]: 2000 }, budgets: { huur: 1400, boodschappen: 700 } };
  if (gemarkeerd) set.savingsEnds = ['4323'];
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set), minder_own: JSON.stringify(own), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, opts) {
  await open(page, seedSpaar(opts));
  await page.evaluate((m) => { SET.kpiAll = 1; curMonth = m; save(); go('ins'); renderIns(); }, M1);
  await page.waitForTimeout(60);
}
const kpi = (page, key, m) => page.evaluate(([k, mm]) => { const x = insKpis(mm)[k]; return { raw: x.raw, val: x.val, band: x.band, state: x.state, afst: x.afst }; }, [key, m || M1]);

test.describe('a · het gemelde geval', () => {
  test('10% opzij, en dat staat op het maandscherm', async ({ page }) => {
    await boot(page);
    const inleg = await kpi(page, 'inleg');
    expect(Math.round(inleg.raw)).toBe(10);          // 300 van 3000, niet 600: één kant van de overboeking
    const blok = await page.evaluate((m) => {
      const d = document.createElement('div'); d.innerHTML = maandKpiBlok(m); return d.textContent;
    }, M1);
    expect(blok).toMatch(/spaarquote/i);
    expect(await page.locator('#insKpiStrip').innerText()).not.toMatch(/spaarquote/i);
  });

  test('beide kanten van een eigen overboeking tellen één keer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({
      V: vermogensInleg(m), bel: beleggingsInleg(m), gestort: savedNet(m),
    }), M1);
    expect(r.gestort).toBe(300);
    expect(r.bel).toBe(0);                           // de afschrijving is de spiegel, geen belegging
    expect(r.V.totaal).toBe(300);
  });

  test('de spaarquote leest de spaarrekening, niet je uitgaven', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({
      tx: kpiTx('inleg', m).map((t) => ({ acc: t.acc, a: t.amount })),
      som: kpiSom('inleg', kpiTx('inleg', m)),
      gestort: savedNet(m),
    }), M1);
    expect(r.tx.length).toBe(1);
    expect(r.tx[0].acc).toBe(SAV);                 // alleen de bijschrijving, niet beide kanten
    expect(r.tx[0].a).toBe(300);
    expect(r.som).toBe(300);
    expect(r.gestort).toBe(300);
  });

  test('de som van de lijst is het cijfer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = totals(m), som = kpiSom('inleg', kpiTx('inleg', m));
      return { pct: som / t.income * 100, cijfer: insKpis(m).inleg.raw };
    }, M1);
    expect(r.pct).toBeCloseTo(r.cijfer, 9);
  });

  test('de bijdragen tellen op tot het cijfer, met het juiste teken', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const basis = kpiBasis('inleg', totals(m));
      const pts = kpiTx('inleg', m).map((t) => kpiBijdrage('inleg', t, basis));
      return { som: pts.reduce((a, b) => a + b, 0), cijfer: insKpis(m).inleg.raw, eerste: pts[0] };
    }, M1);
    expect(r.eerste).toBeGreaterThan(0);           // storten telt positief, anders dan een uitgave
    expect(r.som).toBeCloseTo(r.cijfer, 6);
  });
});

test.describe('b · ontsparen en onbekend', () => {
  test('netto opnemen geeft een negatieve quote, geen nul', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = { id: 'op', date: `${m}-27`, amount: -800, acc: OWN[1], name: 'Eigen spaarrekening', desc: 'OVERBOEKING VAN SPAARREKENING', typ: '', ref: '', src: 'csv', accName: 'Spaar', refNums: [] };
      TX.push(t); categorize(t); save();
      return { gestort: savedNet(m), quote: insKpis(m).inleg.raw, geclampt: savedThisMonth(m) };
    }, M1);
    expect(r.gestort).toBe(-500);                  // 300 erin, 800 eruit
    expect(r.quote).toBeLessThan(0);
    expect(r.geclampt).toBe(0);                    // savedThisMonth clampt wél; daarom een eigen bron
  });

  test('zonder gemarkeerde spaarrekening valt het terug op de spaar-categorie', async ({ page }) => {
    await boot(page, { gemarkeerd: false, spaarRekening: false });
    const r = await page.evaluate((m) => ({ gestort: savedNet(m), quote: insKpis(m).inleg.raw, tx: kpiTx('inleg', m).map((t) => t.amount) }), M1);
    expect(r.gestort).toBe(300);                   // de afschrijving naar 'sparen'
    expect(Math.round(r.quote)).toBe(10);
    expect(r.tx).toEqual([-300]);                  // en dan tellen we de afschrijving, niet beide kanten
  });

  test('zonder enige spaarboeking blijft het onbekend', async ({ page }) => {
    await boot(page, { stort: {}, gemarkeerd: false, spaarRekening: false });
    const r = await page.evaluate((m) => ({ gestort: savedNet(m), k: insKpis(m).inleg }), M1);
    expect(r.gestort).toBeNull();                  // niets weten is geen nul (v59/v73)
    expect(r.k.raw).toBeNull();
    expect(r.k.val).toBe('—');
    expect(r.k.band).toContain('geen spaarrekening bekend');
  });
});

test.describe('c · de twee cijfers horen bij elkaar', () => {
  test('de brug staat in de spaarquote-sheet en noemt het verschil in euro\'s', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openKpiDetail('inleg'));
    await page.waitForTimeout(50);
    const s = await page.locator('#sheet').innerText();
    expect(s).toMatch(/Je hield .* over en zette .* opzij/);
    expect(s).toContain('bleef op je betaalrekening staan');
    expect(s).not.toMatch(/restsaldo-quote/i);
  });

  test('de brug hangt niet aan een tweede cijfer', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => kpiSpaarBrug.toString());
    expect(src).toContain('spaarDekking(m)');
    expect(src).not.toContain('insKpis(');           // één bron, en die is niet het cijfer zelf
    expect(await page.evaluate((m) => kpiSpaarBrug('budget', m), M1)).toBe('');
  });

  test('meer storten dan overhouden heet interen op eerder spaargeld', async ({ page }) => {
    await boot(page);
    await page.evaluate((m) => {
      const t = { id: 'extra', date: `${m}-28`, amount: 1200, acc: OWN[1], name: 'Eigen spaarrekening', desc: 'OVERBOEKING NAAR SPAARREKENING', typ: '', ref: '', src: 'csv', accName: 'Spaar', refNums: [] };
      TX.push(t); categorize(t); save(); openKpiDetail('inleg');
    }, M1);
    await page.waitForTimeout(60);
    expect(await page.locator('#sheet').innerText()).toContain('meer dan je overhield');
  });

  test('de bandtekst benoemt wat er geteld wordt, niet een norm', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ txt: kpiBandTxt('inleg'), band: kpiBand('inleg') }));
    expect(r.txt).toBe('wat je opzij zette en belegde');
    expect(r.txt).not.toMatch(/doel|norm/);
    expect(r.band).toBe(null);                       // geen band is null, niet nul
  });
});

test.describe('e · smalle mobiel', () => {
  for (const w of [360, 390]) {
    test(`de tegels en de spaarquote-sheet passen op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      const strip = await page.evaluate(() => { const e = document.getElementById('insKpiStrip'); return e.scrollWidth - e.clientWidth; });
      expect(strip).toBeLessThanOrEqual(0);
      await page.evaluate(() => openKpiDetail('inleg'));
      await page.waitForTimeout(60);
      const over = await page.evaluate(() => {
        const s = document.getElementById('sheet');
        return { sheet: s.scrollWidth - s.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect(over.sheet).toBeLessThanOrEqual(0);
      expect(over.doc).toBeLessThanOrEqual(0);
    });
  }
});
