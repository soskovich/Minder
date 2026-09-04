// v177: een tempo veronderstelt dat een uitgave gelijkmatig over de maand valt, en een incasso doet
// dat per definitie niet. Huur op dag 2 liet het tempo op dag 5 exploderen, en dat gebeurt elke
// maand bij iedereen in de eerste week: dan levert de kalender het oordeel in plaats van je gedrag.
// tempoProjectie() extrapoleert alleen het variabele deel; vaste lasten tellen als waarneming mee.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[2], VORIGE = MS[1];
const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const VANDAAG = Math.min(now.getDate(), dim);
const dd = (n) => String(Math.max(1, Math.min(n, dim))).padStart(2, '0');

/* De huur valt op dag 2, dus in de eerste week is hij al afgeschreven terwijl er nog nauwelijks
   dagen om zijn. Dat is het reële patroon dat de fixture vastlegt. */
function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: MAIN,
    name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of MS) {
    add(m, '01', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    // variabel: klein en al gebeurd, tenzij de test anders vraagt
    add(m, dd(1), -(o.variabel != null ? o.variabel : 40), 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  if (o.gepland) add(CUR, dd(VANDAAG + 3), -400, 'Mediamarkt', 'BEA, BETAALPAS MEDIAMARKT');
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 4000 }, budgets: { huur: 900, boodschappen: 400 },
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof tempoProjectie === 'function');
}
const P = (page, m) => page.evaluate((x) => tempoProjectie(x), m || CUR);

test.describe('a · vaste lasten worden niet geëxtrapoleerd', () => {
  test('de huur telt als waarneming, niet als tempo', async ({ page }) => {
    await boot(page);
    const r = await P(page);
    expect(r.vast).toBeGreaterThanOrEqual(900);          // afgeschreven, plus wat nog komt
    expect(r.variTot).toBe(40);
    // het tempo gaat alleen over het variabele deel
    expect(r.variTempo).toBe(Math.round(40 / Math.max(r.elapsed, 1) * r.dim));
    expect(r.proj).toBe(r.vast + r.variLater + r.variTempo);
    // en dus nooit 900 * dim / elapsed
    expect(r.proj).toBeLessThan(900 * r.dim / Math.max(r.elapsed, 1));
  });

  test('een geplande boeking later deze maand telt mee, maar niet in het tempo', async ({ page }) => {
    test.skip(VANDAAG + 3 > dim, 'deze maand heeft geen dag meer over voor een geplande boeking');
    await boot(page, seed({ gepland: true }));
    const r = await P(page);
    expect(r.variLater).toBe(400);                       // wel in de projectie
    expect(r.variTot).toBe(40);                          // niet in het tempo
    expect(r.variTempo).toBe(Math.round(40 / Math.max(r.elapsed, 1) * r.dim));
  });

  test('een afgesloten maand wordt niet geëxtrapoleerd', async ({ page }) => {
    await boot(page);
    const r = await P(page, VORIGE);
    expect(r.lopend).toBe(false);
    expect(r.variTempo).toBe(r.variTot);                 // volledig waargenomen
    expect(r.variLater).toBe(0);
  });

  test('er is één tempo-bron, geen vier', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => ({
      sig: scoreNotifs.toString(), coach: coachStatus.toString(), cmp: openBudgetCompare.toString() }));
    for (const [naam, t] of Object.entries(src)) {
      expect(t, naam).toContain('tempoProjectie(');
    }
    /* En niemand deelt nog de hele uitgave door de verstreken dagen. Commentaar telt niet als
       gebruik: beide functies leggen in een comment uit welke formule er stond. */
    const kaal = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .map((r) => r.replace(/(^|[^:\w])\/\/.*$/, '$1')).join(' ');
    expect(kaal(src.sig)).not.toMatch(/t\.spend\/el\*de\.dim/);
    expect(kaal(src.coach)).not.toMatch(/bud\*elapsed\/dim/);
  });
});

test.describe('b · geen tempo-oordeel in de eerste week door de huur', () => {
  test('het tempo-signaal zwijgt bij een normale variabele uitgave', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => ({ keys: scoreNotifs().map((n) => n.key),
      proj: tempoProjectie(m).proj, bud: totals(m).budget }), CUR);
    expect(r.proj).toBeLessThan(r.bud * 1.07);
    expect(r.keys).not.toContain('tempo');
  });

  test('en vuurt wel als het variabele deel echt uit de pas loopt', async ({ page }) => {
    await boot(page, seed({ variabel: 900 }));
    const r = await page.evaluate((m) => ({ keys: scoreNotifs().map((n) => n.key),
      proj: tempoProjectie(m).proj, bud: totals(m).budget }), CUR);
    expect(r.proj).toBeGreaterThan(r.bud * 1.07);
    // het signaal kan door de loss-frame-dosering achter een ander frame staan; de projectie telt
    expect(r.proj).toBeGreaterThan(900);
  });

  test('coachStatus oordeelt op het variabele deel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((m) => { const st = coachStatus(m);
      return { verdict: st.verdict, expected: st.expected, spent: st.spent, P: tempoProjectie(m) }; }, CUR);
    expect(r.verdict).not.toBe('over budget');
    // expected leest nog als "wat je nu ongeveer kwijt zou zijn": de vaste lasten zitten erin
    expect(r.expected).toBeGreaterThanOrEqual(r.P.vast);
  });

  test('openBudgetCompare noemt je niet te snel door een incasso', async ({ page }) => {
    await boot(page);
    await page.evaluate((m) => openBudgetCompare(m), CUR);
    await page.waitForTimeout(90);
    const t = await page.locator('#sheet').innerText();
    expect(t).not.toMatch(/iets te snel/);
    expect(t).toMatch(/op schema|ruim op schema/);
  });
});

test.describe('c · de dag van vandaag is een lokale dag', () => {
  test('vandaagYMD volgt je eigen kalender, niet UTC', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ lokaal: vandaagYMD(), utc: new Date().toISOString().slice(0, 10),
      d: new Date().getDate() }));
    expect(r.lokaal.slice(8, 10)).toBe(String(r.d).padStart(2, '0'));
    // tussen middernacht en 02:00 zomertijd lopen die twee uiteen; dat mag het cijfer niet raken
    expect(r.lokaal.length).toBe(10);
  });

  test('Gelezen op toont de dag waarop je las', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    await page.waitForTimeout(130);
    const t = await page.evaluate(() => $('#s-maand').innerText);
    expect(t).toContain(`Gelezen op ${new Date().getDate()} `);
  });
});
