// v163: de spaarquote telt sinds v161 drie stromen op (spaarrekening, reserveringen, beleggingsinleg)
// en telde daarbij beide kanten van een overboeking naar je eigen spaarpot. Zonder herkende
// tegenrekening verdubbelde het cijfer dus. De spiegelboeking is nu de toets, de lijst erachter toont
// alle drie de stromen (v104) en de historische reeks leest dezelfde teller als de tegel.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000007788';

function seed(o = {}) {
  const tx = [];
  const add = (id, m, day, amount, naam, desc, acc, extra) =>
    tx.push(Object.assign({ id, date: `${m}-${day}`, amount, acc: acc || MAIN, name: naam, desc,
      typ: '', ref: '', src: 'csv', accName: '', refNums: [] }, extra || {}));
  for (const m of [M2, M1, CUR]) {
    add('inc-' + m, m, '01', 3000, 'Werkgever', 'SALARIS LOON');
    add('huur-' + m, m, '02', -1000, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    if (!o.geenStorting) {
      // de afschrijving draagt geen tegenrekening: precies het geval waarin de app moest raden
      add('sp-uit-' + m, m, '25', -300, 'Eigen spaarrekening', 'OVERBOEKING NAAR SPAARREKENING',
        MAIN, o.metRefNums ? { refNums: ['4323'] } : null);
      add('sp-in-' + m, m, '25', 300, 'Eigen spaarrekening', 'OVERBOEKING NAAR SPAARREKENING', SPAAR);
    }
    if (o.belegging) add('pk-' + m, m, '08', -100, 'Peaks', 'Peaks SEPA iDEAL investeren met Peaks');
    if (o.reservering) {
      add('res-uit-' + m, m, '26', -150, 'Reserveringen', 'OVERBOEKING NAAR RESERVERINGEN');
      add('res-in-' + m, m, '26', 150, 'Reserveringen', 'OVERBOEKING NAAR RESERVERINGEN', RES);
    }
  }
  const own = [MAIN];
  if (!o.geenStorting) own.push(SPAAR);
  if (o.reservering) own.push(RES);
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
    manualBal: { [MAIN]: 1500, [SPAAR]: 5000 }, budgets: { huur: 1000, boodschappen: 400 },
  }, o.set || {});
  if (!o.nietGemarkeerd && !o.geenStorting) set.savingsEnds = ['4323'];
  if (o.reservering) set.resAcc = RES;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify(own), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof vermogensInleg === 'function' && typeof inlegTx === 'function');
}
const V = (page, m) => page.evaluate((mm) => vermogensInleg(mm), m || M1);

test.describe('a · dezelfde euro telt één keer', () => {
  test('beide kanten van een eigen overboeking zonder tegenrekening', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({
      gestort: savedNet(m), bel: beleggingsInleg(m), V: vermogensInleg(m),
    }), M1);
    expect(r.gestort).toBe(300);
    expect(r.bel).toBe(0);                      // de afschrijving is de spiegel, geen belegging
    expect(r.V.totaal).toBe(300);
  });

  test('met een herkende tegenrekening loopt het via de bestaande toets', async ({ page }) => {
    await boot(page, seed({ metRefNums: true }));
    const r = await V(page);
    expect(r.totaal).toBe(300);
    expect(r.delen.find((d) => d.key === 'bel').bedrag).toBe(null);   // geen enkele beleggingsboeking
  });

  test('één bijschrijving streept hooguit één afschrijving weg', async ({ page }) => {
    await boot(page);
    // een tweede afschrijving van 300 zonder tweede bijschrijving is wél een belegging
    const r = await page.evaluate((m) => {
      const t = { id: 'tweede', date: `${m}-27`, amount: -300, acc: OWN[0], name: 'Brand New Day',
        desc: 'Brand New Day inleg', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      TX.push(t); categorize(t); save();
      return { bel: beleggingsInleg(m), totaal: vermogensInleg(m).totaal };
    }, M1);
    expect(r.bel).toBe(300);
    expect(r.totaal).toBe(600);
  });

  test('een echte belegging telt gewoon mee', async ({ page }) => {
    await boot(page, seed({ belegging: true }));
    const r = await V(page);
    expect(r.delen.find((d) => d.key === 'bel').bedrag).toBe(100);
    expect(r.totaal).toBe(400);
  });

  test('een storting naar je reserveringspot telt één keer, en niet als belegging', async ({ page }) => {
    await boot(page, seed({ reservering: true }));
    const r = await page.evaluate((m) => ({ V: vermogensInleg(m), res: resThisMonth(m) }), M1);
    expect(r.res).toBe(150);
    expect(r.V.delen.find((d) => d.key === 'bel').bedrag).toBe(null);
    expect(r.V.totaal).toBe(450);                // 300 spaar + 150 reserveringen
  });
});

test.describe('b · de lijst telt op tot het cijfer', () => {
  test('alle drie de stromen staan erin', async ({ page }) => {
    await boot(page, seed({ belegging: true, reservering: true }));
    const r = await page.evaluate((m) => {
      const rijen = inlegTx(m);
      return {
        accs: rijen.map((t) => t.acc).sort(),
        som: kpiSom('inleg', rijen),
        totaal: vermogensInleg(m).totaal,
        cijfer: insKpis(m).inleg.raw, inkomen: totals(m).income,
      };
    }, M1);
    expect(new Set(r.accs).size).toBeGreaterThanOrEqual(3);   // spaarpot, reserveringspot, Peaks
    expect(r.som).toBe(r.totaal);
    expect(r.som / r.inkomen * 100).toBeCloseTo(r.cijfer, 9);
  });

  test('de waarde per boeking volgt de stroom, niet een globale vlag', async ({ page }) => {
    await boot(page, seed({ belegging: true }));
    const r = await page.evaluate((m) => {
      const rijen = inlegTx(m);
      const pot = rijen.find((t) => t.amount > 0), derde = rijen.find((t) => t.amount < 0);
      return { pot: inlegWaarde(pot), derde: inlegWaarde(derde) };
    }, M1);
    expect(r.pot).toBe(300);        // bijschrijving op je eigen pot
    expect(r.derde).toBe(100);      // afschrijving naar een derde partij
  });

  test('geen enkele boeking staat er twee keer in', async ({ page }) => {
    await boot(page, seed({ belegging: true, reservering: true }));
    const ids = await page.evaluate((m) => inlegTx(m).map((t) => t.id), M1);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('ontsparen blijft zichtbaar en trekt het cijfer omlaag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => {
      const t = { id: 'op', date: `${m}-28`, amount: -900, acc: 'NL01SAVE0000004323',
        name: 'Eigen spaarrekening', desc: 'OVERBOEKING VAN SPAARREKENING', typ: '', ref: '',
        src: 'csv', accName: '', refNums: [] };
      TX.push(t); categorize(t); save();
      return { totaal: vermogensInleg(m).totaal, som: kpiSom('inleg', inlegTx(m)), cijfer: insKpis(m).inleg.raw };
    }, M1);
    expect(r.totaal).toBe(-600);
    expect(r.som).toBe(r.totaal);
    expect(r.cijfer).toBeLessThan(0);
  });
});

test.describe('c · onbekend blijft onbekend', () => {
  test('geen spaarrekening en geen enkele boeking geeft null, geen nul', async ({ page }) => {
    await boot(page, seed({ geenStorting: true, nietGemarkeerd: true }));
    const r = await page.evaluate((m) => ({ V: vermogensInleg(m), k: insKpis(m).inleg }), M1);
    expect(r.V.delen.every((d) => d.bedrag === null)).toBe(true);
    expect(r.V.totaal).toBe(null);
    expect(r.k.raw).toBe(null);
    expect(r.k.val).toBe('—');
  });

  test('nul beleggingsboekingen is geen nul ingelegd', async ({ page }) => {
    await boot(page);
    const bel = await page.evaluate((m) => vermogensInleg(m).delen.find((d) => d.key === 'bel').bedrag, M1);
    expect(bel).toBe(null);           // niets gezien is niet hetzelfde als nul (v59/v73)
  });
});

test.describe('d · de reeks leest dezelfde teller als de tegel', () => {
  test('de sparkline volgt vermogensInleg, niet alleen de spaarrekening', async ({ page }) => {
    await boot(page, seed({ belegging: true }));
    const r = await page.evaluate(() => {
      const S = insKpiSeries();
      return S.ms.map((m, i) => ({
        reeks: S.inleg[i],
        eigen: totals(m).income > 0 && vermogensInleg(m).totaal != null
          ? vermogensInleg(m).totaal / totals(m).income * 100 : null,
      }));
    });
    for (const x of r) expect(x.reeks).toBe(x.eigen);
    expect(r.some((x) => x.reeks != null)).toBe(true);
  });

  test('het laatste punt van de reeks is het cijfer op de tegel', async ({ page }) => {
    await boot(page, seed({ belegging: true }));
    const r = await page.evaluate((m) => {
      const k = insKpis(m).inleg;
      return { laatste: k.series[k.series.length - 1], raw: k.raw };
    }, M1);
    expect(r.laatste).toBeCloseTo(r.raw, 9);
  });
});

test.describe('e · kijken verandert niets', () => {
  test('geen van deze functies schrijft', async ({ page }) => {
    await boot(page, seed({ belegging: true, reservering: true }));
    const voor = await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }));
    await page.evaluate((m) => {
      vermogensInleg(m); beleggingsInleg(m); beleggingsTx(m); inlegTx(m); inlegSpiegels(m); vermogensPotten();
    }, M1);
    expect(await page.evaluate(() => ({ tx: TX.length, set: JSON.stringify(SET) }))).toEqual(voor);
  });
});
