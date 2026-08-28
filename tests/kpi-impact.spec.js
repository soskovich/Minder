// v105 (fase 3): de lijst achter een kerncijfer stond op datum en zei niets over gewicht.
// kpiBijdrage() rekent per transactie uit wat ze aan het cijfer deed, in procentpunten, met
// dezelfde noemer als het cijfer zelf — zodat de bijdragen optellen tot het getal erboven.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, M1, INKOMEN, POTJES } = require('./budget-fixture');

async function boot(page) {
  await open(page, seed());
  await page.evaluate((m) => { curMonth = m; save(); go('ins'); renderIns(); }, M1);
  await page.waitForTimeout(60);
}
// alle bijdragen van één kerncijfer, in de volgorde waarin de lijst ze toont
const bijdragen = (page, key) => page.evaluate(([k, m]) => {
  const basis = insKpis(m)[k].afst.basis;
  return kpiTx(k, m).map((t) => ({ naam: t.name, bedrag: t.amount, pt: kpiBijdrage(k, t, basis) }))
    .sort((a, b) => Math.abs(b.pt) - Math.abs(a.pt));
}, [key, M1]);

test.describe('a · de bijdragen tellen op tot het cijfer', () => {
  for (const key of ['budget', 'vast', 'vari']) {
    test(`${key}: de som van de punten is het cijfer`, async ({ page }) => {
      await boot(page);
      const r = await page.evaluate(([k, m]) => {
        const basis = insKpis(m)[k].afst.basis;
        const som = kpiTx(k, m).reduce((s, t) => s + kpiBijdrage(k, t, basis), 0);
        return { som, cijfer: insKpis(m)[k].raw };
      }, [key, M1]);
      expect(r.som).toBeCloseTo(r.cijfer, 6);
    });
  }

  test('restsaldo-quote: honderd min de som van de punten is het cijfer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const basis = insKpis(m).spaar.afst.basis;
      const som = kpiTx('spaar', m).reduce((s, t) => s + kpiBijdrage('spaar', t, basis), 0);
      return { som, cijfer: insKpis(m).spaar.raw };
    }, M1);
    expect(100 + r.som).toBeCloseTo(r.cijfer, 6);       // elke uitgave duwt de quote omlaag
    expect(r.som).toBeLessThan(0);
  });
});

test.describe('b · het teken volgt de betekenis', () => {
  test('een uitgave verlaagt je restsaldo-quote en verhoogt een drukmetriek', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = kpiTx('vast', m)[0];
      return {
        spaar: kpiBijdrage('spaar', t, insKpis(m).spaar.afst.basis),
        vast: kpiBijdrage('vast', t, insKpis(m).vast.afst.basis),
        budget: kpiBijdrage('budget', t, insKpis(m).budget.afst.basis),
      };
    }, M1);
    expect(r.spaar).toBeLessThan(0);
    expect(r.vast).toBeGreaterThan(0);
    expect(r.budget).toBeGreaterThan(0);
  });

  test('een terugstorting draait het teken om', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = { id: 'retour', date: `${m}-15`, amount: 60, acc: OWN[0], name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN RETOUR', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };
      TX.push(t); categorize(t); save();
      const basis = insKpis(m).vari.afst.basis;
      const rij = kpiTx('vari', m).find((x) => x.amount === 60);
      const som = kpiTx('vari', m).reduce((s, x) => s + kpiBijdrage('vari', x, basis), 0);
      return { pt: kpiBijdrage('vari', rij, basis), som, cijfer: insKpis(m).vari.raw };
    }, M1);
    expect(r.pt).toBeLessThan(0);                       // verlaagt de druk
    expect(r.som).toBeCloseTo(r.cijfer, 6);             // en de optelling blijft kloppen
  });

  test('budgetnaleving rekent tegen je potjes, de rest tegen je inkomen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = kpiTx('vast', m).find((x) => Math.abs(x.amount) === 900);
      return { budget: kpiBijdrage('budget', t, insKpis(m).budget.afst.basis), vast: kpiBijdrage('vast', t, insKpis(m).vast.afst.basis) };
    }, M1);
    expect(r.budget).toBeCloseTo(900 / POTJES * 100, 6);
    expect(r.vast).toBeCloseTo(900 / INKOMEN * 100, 6);
  });

  test('zonder basis geen bijdrage', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => kpiBijdrage('spaar', kpiTx('spaar', m)[0], 0), M1);
    expect(r).toBe(null);
  });
});

test.describe('c · de zwaarste staat boven', () => {
  test('de lijst is op gewicht gesorteerd, niet op datum', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const html = kpiTxLijst('spaar', m);
      const namen = [...html.matchAll(/class="nm">([^<]+)</g)].map((x) => x[1]);
      const basis = insKpis(m).spaar.afst.basis;
      const verwacht = kpiTx('spaar', m).slice()
        .sort((a, b) => Math.abs(kpiBijdrage('spaar', b, basis)) - Math.abs(kpiBijdrage('spaar', a, basis)))
        .map((t) => t.name);
      return { namen, verwacht };
    }, M1);
    expect(r.namen).toEqual(r.verwacht);
    expect(r.namen[0]).toBe('Woningcorporatie');        // €900 van €3.000 is de zwaarste
  });

  test('bij gelijk gewicht wint de nieuwste', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      for (const d of ['05', '19']) {
        const t = { id: 'gelijk' + d, date: `${m}-${d}`, amount: -77, acc: OWN[0], name: 'Winkel ' + d, desc: 'BEA, BETAALPAS WINKEL ' + d, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] };
        TX.push(t); categorize(t);
      }
      save();
      const namen = [...kpiTxLijst('vari', m).matchAll(/class="nm">([^<]+)</g)].map((x) => x[1]);
      return namen.filter((n) => n.indexOf('Winkel') === 0);
    }, M1);
    expect(r).toEqual(['Winkel 19', 'Winkel 05']);
  });
});

test.describe('d · de weergave', () => {
  test('elke regel draagt zijn bijdrage', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const html = kpiTxLijst('vast', m);
      return { rijen: (html.match(/class="tx"/g) || []).length, pts: (html.match(/class="kpi-pt/g) || []).length };
    }, M1);
    expect(r.pts).toBe(r.rijen);
  });

  test('de eenheid wordt één keer uitgelegd, via het bestaande jargon-mechanisme', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openKpiDetail('spaar'));
    await page.waitForTimeout(60);
    await page.locator('#sheet details.kpi-tx').evaluate((e) => { e.open = true; });
    // jrg() zet showTip zowel op onclick als op onkeydown, dus tellen doen we op de span
    expect(await page.locator('#sheet .kpi-tx span.jrg').count()).toBe(1);
    const html = await page.locator('#sheet').innerHTML();
    expect(html).toContain("showTip(event,'procentpunt')");
    expect(await page.locator('#sheet').innerText()).toContain('Een uitgave duwt je restsaldo-quote omlaag');
  });

  test('een drukmetriek legt het andersom uit', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openKpiDetail('vast'));
    await page.waitForTimeout(60);
    await page.locator('#sheet details.kpi-tx').evaluate((e) => { e.open = true; });
    expect(await page.locator('#sheet').innerText()).toContain('Een uitgave duwt dit cijfer omhoog');
  });

  test('punten in NL-notatie, met een echt minteken', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ neg: kpiPt(-13.34), pos: kpiPt(7.25), nul: kpiPt(0.01) }));
    expect(r.neg).toBe('−13,3 pt');
    expect(r.pos).toBe('+7,3 pt');
    expect(r.nul).toBe('0 pt');
  });
});

test.describe('e · smalle mobiel', () => {
  for (const w of [360, 390]) {
    test(`de lijst met bijdragen past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 880 });
      await boot(page);
      await page.evaluate(() => openKpiDetail('spaar'));
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
