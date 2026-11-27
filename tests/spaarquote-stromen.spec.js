// v163: de spaarquote telt sinds v161 drie stromen op (spaarrekening, reserveringen, beleggingsinleg)
// en telde daarbij beide kanten van een overboeking naar je eigen spaarpot. Zonder herkende
// tegenrekening verdubbelde het cijfer dus. De spiegelboeking is nu de toets, de lijst erachter toont
// alle drie de stromen (v104) en de historische reeks leest dezelfde teller als de tegel.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('./klok');

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
  await page.waitForFunction(() => typeof vermogensInleg === 'function');
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



});

test.describe('c · onbekend blijft onbekend', () => {

  test('nul beleggingsboekingen is geen nul ingelegd', async ({ page }) => {
    await boot(page);
    const bel = await page.evaluate((m) => vermogensInleg(m).delen.find((d) => d.key === 'bel').bedrag, M1);
    expect(bel).toBe(null);           // niets gezien is niet hetzelfde als nul (v59/v73)
  });
});

test.describe('d · de reeks leest dezelfde teller als de tegel', () => {

});

test.describe('e · kijken verandert niets', () => {
});
