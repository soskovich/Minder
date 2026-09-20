// v239: twee patroonsignalen op Inzichten deelden een bron en misten een noemer.
//
// BESMETTING. Signaal 3 (piekdag) en 4 (grootste uitgave) waren de enige twee plekken in de
// normlaag waar `geenNorm` niet werd uitgesloten, terwijl signaal 1 en 2 in dezelfde functie dat
// al deden (v234). Gemeten gevolg: een uitgave van €484 bij de gemeente, door de gebruiker op
// onvoorzien gezet, tilde een vrijdag naar 52% en vuurde tegelijk als grootste uitgave. Twee
// regels op hetzelfde scherm uit een bedrag dat nergens een keuze was.
//
// GEEN NOEMER. 24% was een vaste grens zonder referentie, dus vijf actieve dagen en twee actieve
// dagen werden aan dezelfde lat gehouden. De referentie is nu je eigen verdeling over drie
// afgeronde maanden: aandeel tegen aandeel (v230), nooit aandeel tegen bedrag.
//
// EEN BRON DRAAGT NOOIT TWEE REGELS, gemeten op WINKEL en niet op een losse transactie, want dat
// is de eenheid waarop signaal 4 vuurt.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const M3 = ym(new Date(now.getFullYear(), now.getMonth() - 3, 1));

// dag-van-de-maand voor de n-de keer dat weekdag wd (0=maandag .. 6=zondag) in maand m valt
function dagVan(m, wd, n) {
  const [y, mo] = m.split('-').map(Number); let hit = 0;
  for (let d = 1; d <= 31; d++) { const dt = new Date(y, mo - 1, d);
    if (dt.getMonth() !== mo - 1) break;
    if ((dt.getDay() + 6) % 7 === wd) { hit++; if (hit === (n || 1)) return String(d).padStart(2, '0'); } }
  return '01';
}
// negen winkels, elk in boodschappen: de categorie doet er niet toe, de weekdag en de winkel wel
const WINKELS = [['Albert Heijn', 'ALBERT HEIJN'], ['Jumbo', 'JUMBO'], ['Restaurant De Kade', 'RESTAURANT'],
  ['Kiosk', 'KIOSK'], ['Hema', 'HEMA'], ['Etos', 'ETOS'], ['Blokker', 'BLOKKER'],
  ['Gamma', 'GAMMA'], ['Praxis', 'PRAXIS']];

function bouw(maanden) {
  const tx = []; let i = 0;
  const add = (m, d, a, w) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: MAIN,
    name: WINKELS[w % 9][0], desc: 'BEA, BETAALPAS ' + WINKELS[w % 9][1], typ: '', ref: '', src: 'csv',
    accName: 'Main', refNums: [] });
  maanden.forEach((mm) => {
    tx.push({ id: 'i' + (i++), date: `${mm.m}-02`, amount: 3000, acc: MAIN, name: 'Werkgever',
      desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    (mm.posten || []).forEach((p, j) => add(mm.m, dagVan(mm.m, p.wd, p.n || 1), -p.bedrag, p.w != null ? p.w : j));
  });
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([MAIN]),
    minder_accmeta: '{}', minder_plan: '{}',
    minder_set: JSON.stringify({ limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false,
      income: 3000, manualBal: { [MAIN]: 4000 }, budgets: { boodschappen: 900 }, budgetMonth: CUR }) };
}
async function boot(page, maanden, opOnvoorzien) {
  await page.addInitScript((s) => { if (localStorage.getItem('minder_tx')) return;
    for (const k in s) localStorage.setItem(k, s[k]); }, bouw(maanden));
  await page.goto('/');
  await page.waitForFunction(() => typeof piekVerdeling === 'function');
  if (opOnvoorzien) await page.evaluate((nm) => {
    TX.filter((x) => x.name === nm && x.amount < 0).forEach((t) => setCat(t.id, 'onvoorzien')); }, opOnvoorzien);
}
// alles wat een maand over de piekdag te zeggen heeft, in een keer
const meet = (page) => page.evaluate(() => {
  const m = thisYM(); const mv = monthVsPrevInner(m);
  const ex = new Set([...mv.drivers, ...budgetFlaggedCats(m)]);
  const V = piekVerdeling(m), ref = piekReferentie(m);
  const dn = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  const P = piekVuurt(V, ref);
  return { n: V ? V.n : 0, tot: V ? Math.round(V.tot) : 0,
    piek: V ? dn[V.aandeel.indexOf(Math.max(...V.aandeel))] : null,
    aandeel: V ? Math.round(Math.max(...V.aandeel) * 100) : 0,
    refPeak: (V && ref) ? Math.round(ref[V.aandeel.indexOf(Math.max(...V.aandeel))] * 100) : null,
    vuurt: !!P, labels: insSignals(m, ex).map((s) => s.kpiLabel),
    subs: insSignals(m, ex).map((s) => s.kpiSub) };
});

// drie rustige historiemaanden; frVr stelt het vrijdag-bedrag in
const hist = (m, frVr) => ({ m, posten: [
  { wd: 0, bedrag: 70, w: 0 }, { wd: 1, bedrag: 65, w: 1 }, { wd: 2, bedrag: 60, w: 2 },
  { wd: 3, bedrag: 55, w: 3 }, { wd: 4, bedrag: frVr, w: 4 }, { wd: 5, bedrag: 50, w: 5 },
  { wd: 6, bedrag: 45, w: 6 }, { wd: 0, bedrag: 40, n: 2, w: 7 }, { wd: 1, bedrag: 35, n: 2, w: 8 }] });
// acht losse boekingen in de lopende maand, geen vrijdag
const SEPT = [{ wd: 0, bedrag: 80, w: 0 }, { wd: 1, bedrag: 78, w: 1 }, { wd: 2, bedrag: 76, w: 2 },
  { wd: 3, bedrag: 74, w: 3 }, { wd: 5, bedrag: 72, w: 5 }, { wd: 6, bedrag: 67, w: 6 },
  { wd: 0, bedrag: 60, n: 2, w: 7 }, { wd: 1, bedrag: 55, n: 2, w: 8 }];
// zes losse boekingen: de reconstructie van de gemelde september
const SEPT6 = SEPT.slice(0, 6);
const RUSTIG = [hist(M3, 60), hist(M2, 60), hist(M1, 60)];

test.describe('onvoorzien telt niet mee in het losse geld', () => {
  test('een grote uitgave op onvoorzien valt uit de piekdag en uit de grootste uitgave', async ({ page }) => {
    const posten = SEPT.concat([{ wd: 4, bedrag: 484, w: 4 }]);   // Hema is winkel 4, op vrijdag
    await boot(page, RUSTIG.concat([{ m: CUR, posten }]), 'Hema');
    const r = await meet(page);
    expect(r.tot).toBe(562);                 // 1046 min de 484 van Hema
    expect(r.labels).toEqual([]);            // geen piekdag en geen grootste uitgave
    // dezelfde maand zonder die categorie-keuze levert wel een signaal op
    expect(await page.evaluate(() => catOf(TX.find((x) => x.name === 'Hema' && x.amount < 0)))).toBe('onvoorzien');
  });

  test('de telpoort telt onvoorzien ook niet mee', async ({ page }) => {
    // acht losse boekingen plus een negende op onvoorzien: de poort blijft op acht staan
    const posten = SEPT.concat([{ wd: 4, bedrag: 484, w: 4 }]);
    await boot(page, RUSTIG.concat([{ m: CUR, posten }]), 'Hema');
    expect((await meet(page)).n).toBe(8);
    const src = await page.evaluate(() => piekVerdeling.toString());
    expect(src).toContain('geenNorm(catOf(x))');
  });
});

test.describe('de noemer', () => {
  test('de reconstructie van september: eerst twee regels, nu geen', async ({ page }) => {
    const posten = SEPT6.concat([{ wd: 4, bedrag: 484, w: 4 }]);
    await boot(page, RUSTIG.concat([{ m: CUR, posten }]), 'Hema');
    const r = await meet(page);
    expect(r.n).toBe(6);                     // zes losse boekingen, de 484 valt eruit
    expect(r.tot).toBe(447);
    expect(r.vuurt).toBe(false);
    expect(r.labels).toEqual([]);
  });

  test('minder losse transacties dan het minimum: geen piekdag', async ({ page }) => {
    const posten = SEPT6.concat([{ wd: 4, bedrag: 400, w: 4 }]);   // zeven losse, minimum is acht
    await boot(page, RUSTIG.concat([{ m: CUR, posten }]));
    const r = await meet(page);
    expect(r.n).toBe(7);
    expect(r.aandeel).toBeGreaterThan(24);   // met de oude vaste grens van 24% had hij gevuurd
    expect(r.vuurt).toBe(false);
    expect(r.labels).not.toContain('Piekdag');
  });

  test('zonder drie afgeronde maanden: geen piekdag, en geen gelijke verdeling als terugval', async ({ page }) => {
    const posten = SEPT.concat([{ wd: 4, bedrag: 484, w: 4 }]);
    await boot(page, [hist(M1, 60), { m: CUR, posten }]);
    expect(await page.evaluate(() => piekReferentie(thisYM()))).toBe(null);
    const r = await meet(page);
    expect(r.n).toBeGreaterThanOrEqual(8);
    expect(r.aandeel).toBeGreaterThan(24);
    expect(r.vuurt).toBe(false);
    // geen terugval: de functie deelt nergens door zeven
    const src = await page.evaluate(() => piekReferentie.toString() + piekVuurt.toString());
    expect(src).not.toMatch(/\/\s*7|1\s*\/\s*7|0\.14/);
  });

  test('een vaste vrijdag-gewoonte vuurt niet, want er is geen afwijking', async ({ page }) => {
    const posten = SEPT.concat([{ wd: 4, bedrag: 300, w: 4 }]);
    await boot(page, [hist(M3, 300), hist(M2, 300), hist(M1, 300), { m: CUR, posten }]);
    const r = await meet(page);
    expect(r.piek).toBe('vrijdag');
    expect(r.aandeel).toBeGreaterThan(24);   // ruim boven de oude vaste grens
    expect(r.refPeak).toBeGreaterThan(r.aandeel);   // je doet dit normaal juist meer
    expect(r.vuurt).toBe(false);
    expect(r.labels).not.toContain('Piekdag');
  });

  test('een echte uitschieter vuurt wel, met de referentie in de regel', async ({ page }) => {
    // de vrijdag over twee winkels, zodat geen enkele winkel domineert
    const posten = SEPT.concat([{ wd: 4, bedrag: 300, w: 4 }, { wd: 4, bedrag: 200, n: 2, w: 3 }]);
    await boot(page, RUSTIG.concat([{ m: CUR, posten }]));
    const r = await meet(page);
    expect(r.piek).toBe('vrijdag');
    expect(r.vuurt).toBe(true);
    expect(r.labels).toContain('Piekdag');
    const sub = r.subs[r.labels.indexOf('Piekdag')];
    expect(sub).toMatch(/^\d+% van je losse geld, normaal \d+%$/);
    expect(sub).toContain(`${r.aandeel}%`);
    expect(sub).toContain(`normaal ${r.refPeak}%`);
    // vaststellen, geen opdracht
    const s = await page.evaluate(() => { const m = thisYM(); const mv = monthVsPrevInner(m);
      const ex = new Set([...mv.drivers, ...budgetFlaggedCats(m)]);
      return insSignals(m, ex).find((x) => x.kpiLabel === 'Piekdag'); });
    expect(s.hyp + ' ' + s.imp).not.toMatch(/\bZet\b|\bGeef\b|\bKijk\b|\bCheck\b|\bStop\b|levert de meeste winst/);
    expect(s.spiegel).toBe(true);
    expect(s.act).toBe('');
  });

  test('de twee knoppen staan als losse constanten', async ({ page }) => {
    await boot(page, RUSTIG.concat([{ m: CUR, posten: SEPT }]));
    const c = await page.evaluate(() => ({ min: PIEK_MIN_TX, fac: PIEK_FACTOR }));
    expect(c.min).toBe(8);
    expect(c.fac).toBe(1.5);
    // de conditie leest de constanten en heeft geen tweede drempel ingebakken
    const src = await page.evaluate(() => piekVuurt.toString());
    expect(src).toContain('PIEK_MIN_TX');
    expect(src).toContain('PIEK_FACTOR');
    expect(src).not.toMatch(/>=\s*24|share\s*>=\s*\d/);
  });
});

test.describe('een bron draagt nooit twee regels', () => {
  test('dezelfde winkel: alleen de grootste uitgave blijft staan', async ({ page }) => {
    // een winkel van 484 op vrijdag: hij domineert de winkels en tilt de vrijdag omhoog
    const posten = SEPT.concat([{ wd: 4, bedrag: 484, w: 4 }]);
    await boot(page, RUSTIG.concat([{ m: CUR, posten }]));
    const r = await meet(page);
    expect(r.vuurt).toBe(true);                    // op zichzelf zou de piekdag vuren
    expect(r.labels).toEqual(['Grootste uitgave']);   // maar hij staat er niet
    // de tegentest meet op winkel, niet op een losse boeking
    const zonder = await page.evaluate(() => {
      const m = thisYM();
      return { met: !!piekVuurt(piekVerdeling(m), piekReferentie(m)),
        zonderWinkel: !!piekVuurt(piekVerdeling(m, 'Hema'), piekReferentie(m)) }; });
    expect(zonder.met).toBe(true);
    expect(zonder.zonderWinkel).toBe(false);
  });

  test('een andere winkel raakt de piekdag niet', async ({ page }) => {
    // de vrijdag over twee winkels: geen enkele domineert, dus beide regels mogen los bestaan
    const posten = SEPT.concat([{ wd: 4, bedrag: 300, w: 4 }, { wd: 4, bedrag: 200, n: 2, w: 3 }]);
    await boot(page, RUSTIG.concat([{ m: CUR, posten }]));
    expect((await meet(page)).labels).toEqual(['Piekdag']);
  });
});

test.describe('het meetscript', () => {
  test('geeft dezelfde uitkomst als de app, en schrijft niets', async ({ page }) => {
    // vier historiemaanden, zodat de laatste er drie voor zich heeft en er echt iets te vuren valt
    const heftig = { m: M1, posten: SEPT.concat([{ wd: 4, bedrag: 300, w: 4 }, { wd: 4, bedrag: 200, n: 2, w: 3 }]) };
    await boot(page, [hist(ym(new Date(now.getFullYear(), now.getMonth() - 4, 1)), 60),
      hist(M3, 60), hist(M2, 60), heftig, { m: CUR, posten: SEPT }]);
    const regels = []; page.on('console', (m) => regels.push(m.text()));
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.evaluate(fs.readFileSync('piekdag-meten.js', 'utf8'));
    const uit = regels.join('\n');
    // de app, over dezelfde afgeronde maanden
    const app = await page.evaluate(() => months().filter((m) => m < thisYM())
      .map((m) => m + ':' + (piekVuurt(piekVerdeling(m), piekReferentie(m)) ? 'VUURT' : 'stil')));
    for (const a of app) {
      const [m, verwacht] = a.split(':');
      const regel = uit.split('\n').find((l) => l.indexOf(m) === 0);
      expect(regel, m).toBeTruthy();
      expect(regel.indexOf('VUURT') >= 0, m + ' ' + verwacht).toBe(verwacht === 'VUURT');
    }
    expect(app.some((a) => /VUURT/.test(a))).toBe(true);    // en er vuurt er echt een
    expect(uit).toContain('minimum 8 boekingen, factor 1,5x');
    expect(uit).not.toContain('[object Object]');
    // leest alleen
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
    const bron = fs.readFileSync('piekdag-meten.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(bron).not.toMatch(/save\(\)|localStorage\.|fetch\(|XMLHttpRequest|SET\s*\./);
  });
});
