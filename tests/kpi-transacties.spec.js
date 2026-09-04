// v104 (fase 2): bij een kerncijfer was niet te zien welke transacties de stand maken.
// kpiTx(key,m) levert die verzameling met exact dezelfde predicaten als totals() en
// splitFixedVar(), zodat de lijst per definitie optelt tot het getal erboven. Een lijst die iets
// anders zegt dan het cijfer zou een nieuw vertrouwensprobleem zijn in plaats van een opgelost.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, MAIN, INKOMEN } = require('./budget-fixture');

async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate((m) => { curMonth = m; save(); go('ins'); renderIns(); }, M1);
  await page.waitForTimeout(60);
}
const som = (page, key, m) => page.evaluate(([k, mm]) => netSpend(kpiTx(k, mm)), [key, m || M1]);
const ids = (page, key, m) => page.evaluate(([k, mm]) => kpiTx(k, mm).map((t) => t.name).sort(), [key, m || M1]);

test.describe('a · de lijst telt op tot het cijfer', () => {
  test('vaste lasten: de som is exact splitFixedVar().fixed', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({ lijst: netSpend(kpiTx('vast', m)), cijfer: splitFixedVar(m).fixed }), M1);
    expect(r.lijst).toBe(r.cijfer);
  });

  test('variabele uitgaven: de som is exact splitFixedVar().vari', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({ lijst: netSpend(kpiTx('vari', m)), cijfer: splitFixedVar(m).vari }), M1);
    expect(r.lijst).toBe(r.cijfer);
  });

  test('budgetnaleving: de som is exact totals().spend', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({ lijst: netSpend(kpiTx('budget', m)), cijfer: totals(m).spend }), M1);
    expect(r.lijst).toBe(r.cijfer);
  });

  // v161: de restsaldo-quote is vervallen; de optel-invariant staat hieronder per cijfer.

  test('vast en variabel samen zijn precies de budget-lijst: geen overlap, geen gat', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const v = kpiTx('vast', m).map((t) => t.id), a = kpiTx('vari', m).map((t) => t.id), b = kpiTx('budget', m).map((t) => t.id);
      return { n: v.length + a.length, nb: b.length, overlap: v.filter((x) => a.includes(x)).length, mist: b.filter((x) => !v.includes(x) && !a.includes(x)).length };
    }, M1);
    expect(r.overlap).toBe(0);
    expect(r.mist).toBe(0);
    expect(r.n).toBe(r.nb);
  });
});

test.describe('b · wat er níet in hoort', () => {
  test('doorstroomposten tellen niet mee', async ({ page }) => {
    await boot(page, seed());
    const r = await page.evaluate((m) => {
      const intern = txOfMonth(m).filter((t) => CATS[catOf(t)].type === 'internal');
      const inLijst = kpiTx('budget', m).filter((t) => CATS[catOf(t)].type === 'internal');
      return { intern: intern.length, inLijst: inLijst.length };
    }, CUR);                                                      // de fixture heeft interne spaarboekingen in CUR
    expect(r.intern).toBeGreaterThan(0);                          // ze bestaan écht
    expect(r.inLijst).toBe(0);                                    // maar zitten niet in het cijfer (v77)
  });

  test('inkomsten staan niet als uitgave in de lijst', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => kpiTx('spaar', m).filter((t) => CATS[catOf(t)].type === 'income').length, M1);
    expect(r).toBe(0);
  });

  test('een terugstorting verlaagt de som in plaats van hem te verhogen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const voor = netSpend(kpiTx('vari', m));
      const t = { id: 'retour', date: `${m}-15`, amount: 60, acc: OWN[0], name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN RETOUR', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };
      TX.push(t); categorize(t); save();
      const na = netSpend(kpiTx('vari', m));
      return { voor, na, inLijst: kpiTx('vari', m).some((x) => x.amount === 60), cijfer: splitFixedVar(m).vari };
    }, M1);
    expect(r.inLijst).toBe(true);                                 // hij staat er wél in
    expect(r.na).toBe(r.voor - 60);                               // maar verlaagt het totaal (v18-v28)
    expect(r.na).toBe(r.cijfer);                                  // en het cijfer volgt mee
  });
});

test.describe('c · het inkomen wordt niet als transactie voorgesteld', () => {
  test('een zelf ingesteld inkomen heet ook zo', async ({ page }) => {
    await boot(page);                                             // fixture: autoIncome false, income 3000
    await page.evaluate(() => openKpiDetail('vast'));
    await page.waitForTimeout(60);
    await page.locator('#sheet details.kpi-tx').evaluate((e) => { e.open = true; });   // de lijst staat dicht; innerText ziet verborgen tekst niet
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('zelf ingesteld');
    expect(s).toContain('Inkomen');
    expect(await page.evaluate((m) => totals(m).incomeBasis, M1)).toBe('handmatig');
  });

  test('een herkend inkomen heet anders', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.autoIncome = true; save(); openKpiDetail('vast'); });
    await page.waitForTimeout(60);
    await page.locator('#sheet details.kpi-tx').evaluate((e) => { e.open = true; });   // de lijst staat dicht; innerText ziet verborgen tekst niet
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('herkend uit je transacties');
    expect(s).not.toContain('zelf ingesteld');
  });

  // v161: de kop-som 'inkomen min uitgaven is overgehouden' hoorde bij de restsaldo-quote.
});

test.describe('d · de weergave', () => {
  test('elke kerncijfer-sheet heeft de lijst, met het juiste aantal', async ({ page }) => {
    await boot(page);
    for (const key of ['inleg', 'budget', 'vast', 'vari']) {
      await page.evaluate((k) => openKpiDetail(k), key);
      await page.waitForTimeout(40);
      expect(await page.locator('#sheet details.kpi-tx').count(), key).toBe(1);
      const n = await page.evaluate((k) => kpiTx(k, curMonth).length, key);
      expect(await page.locator('#sheet details.kpi-tx summary').innerText(), key).toContain(String(n));
    }
  });

  test('de lijst staat standaard dicht', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openKpiDetail('budget'));
    await page.waitForTimeout(60);
    expect(await page.locator('#sheet details.kpi-tx').evaluate((e) => e.open)).toBe(false);
  });

  test('een maand zonder passende transacties zegt dat gewoon', async ({ page }) => {
    await boot(page);
    const html = await page.evaluate((m) => { TX = TX.filter((t) => !isExpenseTx(t) || isFixed(t)); save(); return kpiTxLijst('vari', m); }, M1);
    expect(html).toContain('Geen transacties in deze maand');
  });
});

test.describe('e · smalle mobiel', () => {
  for (const w of [360, 390]) {
    test(`de open lijst past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 880 });
      await boot(page);
      await page.evaluate(() => openKpiDetail('vast'));
      await page.waitForTimeout(60);
      await page.locator('#sheet details.kpi-tx').evaluate((e) => { e.open = true; });
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
