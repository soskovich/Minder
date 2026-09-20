// v240: de piekdagregel leest voorop een bedrag.
//
// "zaterdag, 37% van je losse geld, normaal 9%" is informatief, maar je moet het omrekenen voordat
// het iets betekent. Een bedrag herken je meteen. Het percentage blijft staan, want daar zit de
// vergelijkbaarheid: een maand met 900 euro los geld en een maand met 400 geven bij hetzelfde
// patroon andere bedragen.
//
// DE MEETKANT VERANDERT NIET. De piekdag vuurt nog steeds op het aandeel: het aandeel van deze
// maand tegen het gemiddelde aandeel van de drie afgeronde maanden ervoor. De afwijkingsfactor, de
// poort van acht losse transacties, de uitsluiting van onvoorzien en de historie-eis staan in
// piekdag-noemer.spec.js en blijven daar.
//
// HET NORMAAL-BEDRAG IS EEN AFGELEIDE: het gemiddelde aandeel maal het losse geld van deze maand,
// niet het gemiddelde van de drie werkelijke dagbedragen. Het derde testgeval hieronder is het
// beslissende argument voor die keuze.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

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
  // budget ruim boven het maandtotaal: geen valt-op-signaal dat de twee plekken opeet
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([MAIN]),
    minder_accmeta: '{}', minder_plan: '{}',
    minder_set: JSON.stringify({ limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false,
      income: 3000, manualBal: { [MAIN]: 4000 }, budgets: { boodschappen: 2000 }, budgetMonth: CUR }) };
}
async function boot(page, maanden) {
  await page.addInitScript((s) => { if (localStorage.getItem('minder_tx')) return;
    for (const k in s) localStorage.setItem(k, s[k]); }, bouw(maanden));
  await page.goto('/');
  await page.waitForFunction(() => typeof piekVuurt === 'function');
}
// het signaal zoals insSignals() het aflevert, plus de ruwe meting eronder
const meet = (page) => page.evaluate(() => {
  const m = thisYM(); const mv = monthVsPrevInner(m);
  const ex = new Set([...mv.drivers, ...budgetFlaggedCats(m)]);
  const V = piekVerdeling(m), ref = piekReferentie(m);
  const P = piekVuurt(V, ref);
  const S = insSignals(m, ex).find((x) => x.kpiLabel === 'Piekdag') || null;
  // rekenwijze b, alleen om vast te leggen dat hij niet gebruikt wordt
  const peak = V ? V.aandeel.indexOf(Math.max(...V.aandeel)) : -1;
  const ms = months().filter((x) => x < m).slice(-3);
  const rijB = ms.map((mm) => { const W = piekVerdeling(mm); return W ? W.sumd[peak] : null; });
  const bB = rijB.every((v) => v != null) ? rijB.reduce((a, b) => a + b, 0) / 3 : null;
  return { vuurt: !!P, tot: V ? V.tot : 0, P, S, gemiddeldDagbedrag: bB };
});

// --- fixtures ---
// drie afgeronde maanden, zaterdag 45 van 500 = 9,0%
const HIST = (m) => ({ m, posten: [
  { wd: 0, bedrag: 60, w: 0 }, { wd: 0, bedrag: 40, n: 2, w: 7 }, { wd: 1, bedrag: 55, w: 1 },
  { wd: 1, bedrag: 40, n: 2, w: 8 }, { wd: 2, bedrag: 90, w: 2 }, { wd: 3, bedrag: 85, w: 3 },
  { wd: 4, bedrag: 45, w: 4 }, { wd: 5, bedrag: 45, w: 5 }, { wd: 6, bedrag: 40, w: 6 }] });
const H3 = [HIST(M3), HIST(M2), HIST(M1)];
// de reconstructie: zaterdag 340 van 919 = 37,0%, over twee winkels zodat er geen winkel domineert
const RECON = [{ wd: 5, bedrag: 180, w: 5 }, { wd: 5, bedrag: 160, n: 2, w: 3 },
  { wd: 0, bedrag: 120, w: 0 }, { wd: 1, bedrag: 110, w: 1 }, { wd: 2, bedrag: 100, w: 2 },
  { wd: 3, bedrag: 95, w: 3 }, { wd: 4, bedrag: 90, w: 4 }, { wd: 6, bedrag: 64, w: 6 }];
// dezelfde vorm maal drie: elk aandeel gelijk, elk bedrag drie keer zo hoog
const SCHAAL = [
  { wd: 0, bedrag: 180, w: 0 }, { wd: 0, bedrag: 120, n: 2, w: 7 }, { wd: 1, bedrag: 165, w: 1 },
  { wd: 1, bedrag: 120, n: 2, w: 8 }, { wd: 2, bedrag: 270, w: 2 }, { wd: 3, bedrag: 255, w: 3 },
  { wd: 4, bedrag: 135, w: 4 }, { wd: 5, bedrag: 135, w: 5 }, { wd: 6, bedrag: 120, w: 6 }];
// maandag 80 van 250 = 32%, tegen 20% in de historie (daar 100 van 500): minder euro's, groter aandeel
const LAGER = [{ wd: 0, bedrag: 45, w: 0 }, { wd: 0, bedrag: 35, n: 2, w: 7 }, { wd: 1, bedrag: 35, w: 1 },
  { wd: 1, bedrag: 25, n: 2, w: 8 }, { wd: 2, bedrag: 30, w: 2 }, { wd: 3, bedrag: 28, w: 3 },
  { wd: 4, bedrag: 22, w: 4 }, { wd: 5, bedrag: 20, w: 5 }, { wd: 6, bedrag: 10, w: 6 }];

test.describe('het bedrag voorop', () => {
  test('de reconstructie: de kop draagt de twee bedragen, de toelichting de twee percentages', async ({ page }) => {
    await boot(page, H3.concat([{ m: CUR, posten: RECON }]));
    const r = await meet(page);
    // de meting: zaterdag 340 van 919 los geld = 37%, gemiddeld aandeel 9%
    expect(r.vuurt).toBe(true);
    expect(r.tot).toBe(919);
    expect(Math.round(r.P.bedrag)).toBe(340);
    expect(r.P.share).toBe(37);
    expect(r.P.norm).toBe(9);
    expect(Math.round(r.P.normBedrag)).toBe(83);
    // de kop: voor v240 stond hier 'zaterdag' met '(37% van je losse geld, normaal 9%)'
    expect(r.S.kpiVal).toBe('zaterdag €340');
    expect(r.S.kpiSub).toBe('normaal €83');
    // het percentage is niet verdwenen, het staat in de toelichting
    expect(r.S.hyp).toContain('37%');
    expect(r.S.hyp).toContain('9%');
    // en de herkomst van het normaal-bedrag staat erbij, zodat het niet als meting leest
    expect(r.S.hyp).toContain('€83');
    expect(r.S.hyp).toMatch(/gebruikelijke aandeel/);
    // vaststellen, geen opdracht, en nog altijd zonder tik
    expect(r.S.hyp + ' ' + r.S.imp).not.toMatch(/\bZet\b|\bGeef\b|\bKijk\b|\bCheck\b|\bStop\b|\bPak\b/);
    expect(r.S.imp).toBe('Je losse geld lag deze maand sterker op een dag dan je gewend bent.');
    expect(r.S.spiegel).toBe(true);
    expect(r.S.act).toBe('');
  });

  test('geen centen: beide bedragen staan in hele euros', async ({ page }) => {
    await boot(page, H3.concat([{ m: CUR, posten: RECON }]));
    const r = await meet(page);
    // de bron is ongeafgerond, de weergave niet
    expect(r.P.normBedrag).not.toBe(Math.round(r.P.normBedrag));
    expect(r.S.kpiVal + ' ' + r.S.kpiSub + ' ' + r.S.hyp).not.toMatch(/€\d+[.,]\d/);
  });

  test('de vier getallen zijn onderling consistent', async ({ page }) => {
    await boot(page, H3.concat([{ m: CUR, posten: RECON }]));
    const r = await meet(page);
    const nu = +r.S.kpiVal.match(/€(\d+)/)[1];
    const norm = +r.S.kpiSub.match(/€(\d+)/)[1];
    // de verhouding tussen de twee bedragen is die tussen de twee percentages: het maandtotaal
    // staat niet op het scherm, dus dit is de rekensom die je wel kunt maken
    expect(Math.abs(norm / nu - r.P.norm / r.P.share)).toBeLessThan(0.01);
    // beide bedragen rusten op hetzelfde maandtotaal
    expect(Math.abs(nu / r.tot - r.P.share / 100)).toBeLessThan(0.01);
    expect(Math.abs(norm / r.tot - r.P.norm / 100)).toBeLessThan(0.01);
  });
});

test.describe('de weergave verschuift de meting niet', () => {
  test('zelfde aandeel, drie keer zoveel euros: de piekdag vuurt niet', async ({ page }) => {
    await boot(page, H3.concat([{ m: CUR, posten: SCHAAL }]));
    const r = await meet(page);
    expect(r.tot).toBe(1500);                       // drie keer het maandtotaal van de historie
    // de piekdag van deze maand is in euro's drie keer die van de historie
    expect(r.gemiddeldDagbedrag).toBe(100);
    expect(r.vuurt).toBe(false);                    // maar het aandeel is gelijk, dus geen bevinding
    expect(r.S).toBe(null);
  });

  test('lager dagbedrag, hoger aandeel: het normaal-bedrag ligt onder dat van deze maand', async ({ page }) => {
    await boot(page, H3.concat([{ m: CUR, posten: LAGER }]));
    const r = await meet(page);
    expect(r.vuurt).toBe(true);
    expect(Math.round(r.P.bedrag)).toBe(80);
    expect(r.P.share).toBe(32);
    expect(r.P.norm).toBe(20);
    // dit is het geval waarin de twee rekenwijzen uiteenlopen
    expect(Math.round(r.P.normBedrag)).toBe(50);    // aandeel maal maandtotaal: onder de 80
    expect(r.gemiddeldDagbedrag).toBe(100);         // gemiddeld dagbedrag: boven de 80
    // de kop spreekt de toelichting niet tegen: minder euro's dan normaal en toch een groter aandeel
    // zou als kop 'maandag 80 euro, normaal 100 euro' lezen, en dat is precies wat hier niet gebeurt
    expect(r.S.kpiVal).toBe('maandag €80');
    expect(r.S.kpiSub).toBe('normaal €50');
    expect(Math.round(r.P.normBedrag)).toBeLessThan(Math.round(r.P.bedrag));
  });
});

test.describe('de kop blijft een kop', () => {
  for (const breedte of [360, 390]) {
    test(`op ${breedte}px breekt de kop niet over drie regels`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: 780 });
      await boot(page, H3.concat([{ m: CUR, posten: RECON }]));
      await page.evaluate(() => go('ins'));
      // de lek-regel staat er ook (pri 12), dus zoek de piekdag op zijn label en niet op volgorde
      const kaart = page.locator('.valtop-patroon').filter({ hasText: 'Piekdag' });
      const kop = kaart.locator('.row > span').first();
      await expect(kop).toContainText('zaterdag €340');
      const regels = await kop.evaluate((el) => {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 18;
        return Math.round(el.getBoundingClientRect().height / lh); });
      expect(regels).toBeLessThanOrEqual(2);
      // en het percentage staat eronder, niet in de kop
      expect(await kop.innerText()).not.toContain('%');
      await expect(kaart.locator('.small.muted').first()).toContainText('37%');
      await expect(kaart).toContainText('Alleen een observatie: hier hoort geen stap bij.');
    });
  }
});
