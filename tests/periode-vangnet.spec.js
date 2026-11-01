/* v507: EEN VANGNET VOOR DE SALARISPERIODE, OP ZES VASTE DAGEN.
 *
 * DE AANLEIDING: de suite draait op een vaste klok (31 okt 2026, tests/klok.js) en toetste daarmee alleen de wereld van voor de
 * salarisperiode, terwijl het toestel vanaf 1 nov in de periode leeft (era vanaf 1 nov, eerste periode 24 nov). Deze spec draait de
 * schermen die over de periode gaan op 1, 15, 23, 24 en 26 nov en 23 dec, met de stand van periode-stand.js (salaris EUR 5.216 op de
 * 24e, verdeling 150/1600/1700, opzij 1766, contant 400). Per dag een getal per scherm, en dat die getallen onderling gelijk zijn.
 *
 * GEVONDEN EN GEREPAREERD (v507): (1) in de periode droeg de Grip-kop geen netto en zei de regel "netto" iets anders dan de
 * Budget-tegel (uitgegeven min tempo tegen verwacht min budget); (2) eenheidTx() had geen memo, dus een render van Grip deed op
 * toestel-omvang honderden kopieen van telbareTx() (gemeten 434), en de lat van v445 is 80.
 */
const { test, expect } = require('./klok');
const S = require('./periode-stand');
const { pinDatum } = require('./vaste-dag');
const { seed, open } = require('./budget-fixture');

const ERA = (d) => d >= '2026-11-24';

/* een getal per scherm, uit de pagina */
const lees = (page) => page.evaluate(({ LEEF }) => {
  const o = {}; const P = periodeVan(vandaagYMD());
  o.ymd = vandaagYMD(); o.era = eraActief(); o.soort = P.soort; o.label = P.label; o.start = P.start; o.eind = P.eind;
  const PB = periodeBudget(); o.pb = PB && { totaal: PB.totaal, som: PB.vast.totaal + PB.potjes.totaal + PB.contant, contant: PB.contant };
  const M = gripMeterBudget(); o.mb = { netto: M.netto, budget: M.budget, verwacht: M.verwacht, buiten: M.buiten };
  o.buitenPeriode = buitenBudget(P.soort === 'periode' ? { start: P.start, eind: P.eind } : { m: thisYM() }).bedrag;
  const U = uitgegevenStand(P.soort === 'periode' ? { start: P.start, eind: P.eind } : { m: thisYM() }); o.uitgegeven = U.totaalR;
  go('ins'); const ik = document.querySelector('[data-insuitgegeven]');
  o.ins = ik ? { getal: +ik.dataset.insuitgegeven, tekst: ik.innerText.split('\n')[0].trim() } : null;
  o.balk = [...document.querySelectorAll('#insMbBalk [data-insseg], #insMaand [data-insseg]')].reduce((a, e) => a + parseFloat(e.style.width || '0'), 0);
  o.overloop = document.body.scrollWidth - document.body.clientWidth;
  const insTxt = document.getElementById('s-ins').innerText;
  go('maand'); const kop = document.querySelector('#gripInhoud [data-zienkopnetto]'), teg = document.querySelector('[data-meternetto]');
  o.kop = kop ? +kop.dataset.zienkopnetto : null; o.tegel = teg ? +teg.dataset.meternetto : null;
  const zienTxt = document.getElementById('gripInhoud').innerText;
  gripKiesTab('kiezen'); const kiesTxt = document.getElementById('gripInhoud').innerText;
  gripKiesTab('terugblik'); const terugTxt = document.getElementById('gripInhoud').innerText;
  go('dash'); const dashTxt = document.getElementById('s-dash').innerText;
  o.teksten = { insTxt, zienTxt, kiesTxt, terugTxt, dashTxt };
  o.opzijDoel = opzijPeriode().doel;
  const D = totSalarisData(LEEF);
  o.tot = D && { saldo: D.saldoExact, vast: D.vastExact, pot: D.potExact, kas: D.kasExact, eind: D.eindExact, venster: D.venster };
  if (D) { openTotSalaris(LEEF); const el = document.getElementById('totSalaris'); o.totTxt = el ? el.innerText : ''; closeSheet(); }
  const W = insWeekTegelP(); o.week = W && { cur: W.cur, over: W.over, bedrag: W.bedrag, nog: W.nog, dagenTeGaan: W.dagenTeGaan, basis: W.basis };
  return o;
}, { LEEF: S.LEEF });

const RAAR = /NaN|undefined|Infinity|\[object/;

for (const dag of S.DAGEN) {
  test.describe(`periode-vangnet ${dag}`, () => {
    test(`${dag}: elk scherm een getal, en ze sluiten op elkaar`, async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await S.boot(page, dag);
      const r = await lees(page);
      expect(r.ymd).toBe(dag);
      /* de eenheid: voor 24 nov de kalendermaand tot het salaris, vanaf 24 nov de periode 24 nov - 23 dec */
      if (ERA(dag)) { expect(r.era).toBe(true); expect(r.soort).toBe('periode'); expect(r.label).toBe('24 nov – 23 dec'); }
      else expect(r.soort).not.toBe('periode');
      /* het budget: vast + potjes + contant is het totaal, en de tegel rekent ermee (in de periode) */
      expect(r.pb.som).toBe(r.pb.totaal);
      expect(r.pb.contant).toBe(400);
      if (ERA(dag)) expect(r.mb.budget).toBe(r.pb.totaal);
      /* Grip: de kop en de tegel dragen hetzelfde netto, en dat is verwacht + buiten budget van DEZE eenheid - budget */
      expect(r.tegel).toBe(r.mb.netto);
      expect(r.kop).toBe(r.mb.netto);
      expect(r.mb.buiten).toBe(r.buitenPeriode);
      expect(r.mb.netto).toBe(r.mb.verwacht + r.mb.buiten - r.mb.budget);
      /* Inzichten: het totaal bovenaan is uitgegevenStand van dezelfde eenheid */
      if (r.ins) { expect(r.ins.getal).toBe(r.uitgegeven); if (ERA(dag)) expect(r.ins.tekst).toBe('Uitgegeven 24 nov – 23 dec'); }
      /* de balk van de maandkaart past in zijn breedte (v507: de schaal las een ander "nog in potjes" dan het segment) */
      expect(r.balk).toBeLessThanOrEqual(100.5);
      expect(r.overloop).toBeLessThanOrEqual(1);
      /* Kiezen: de afspraak van je verdeling is het doel van opzij */
      expect(r.opzijDoel).toBe(1766);
      /* Tot je volgende salaris: saldo - vaste lasten - potjes - contant is de stand op de dag voor je salaris */
      expect(r.tot).not.toBeNull();
      expect(Math.round((r.tot.saldo - r.tot.vast - r.tot.pot - r.tot.kas) * 100)).toBe(Math.round(r.tot.eind * 100));
      /* de weektegel: in de periode ligt de week binnen de periode */
      if (ERA(dag)) { expect(r.week.cur.van >= r.start && r.week.cur.tot <= r.eind).toBe(true); expect(Number.isFinite(r.week.bedrag)).toBe(true); }
      /* geen scherm toont een kapot getal */
      for (const [k, t] of Object.entries(r.teksten)) expect(t, k).not.toMatch(RAAR);
      if (r.totTxt) expect(r.totTxt).not.toMatch(RAAR);
    });
  });
}

/* b: 24 nov, de eerste dag van de periode. Inzichten zegt de periode, en de Grip-kop en de tegel dragen hetzelfde netto, met het
   buiten budget van de PERIODE (de leges van 20 nov horen bij de vorige periode). Sabotage: Grip leest de kalendermaand. */
test('v507 b: 24 nov, Inzichten zegt de periode en Grip-kop en -tegel hetzelfde netto', async ({ page }) => {
  await S.boot(page, '2026-11-24');
  const r = await lees(page);
  expect(r.ins.tekst).toBe('Uitgegeven 24 nov – 23 dec');
  expect(r.kop).toBe(r.tegel);
  const kal = await page.evaluate(() => buitenBudget({ m: thisYM() }).bedrag);
  expect(kal, 'invoer: de kalendermaand draagt de leges van 20 nov, de periode niet').toBe(60);
  expect(r.buitenPeriode).toBe(0);
  expect(r.mb.buiten).toBe(0);
  expect(r.tegel).toBe(r.mb.verwacht - r.mb.budget);
});

/* c: 23 dec, de laatste dag. De periode loopt nog, de stand klopt en niets deelt door nul resterende dagen. Sabotage: dagen-over op 0. */
test('v507 c: 23 dec, de laatste dag van de periode', async ({ page }) => {
  await S.boot(page, '2026-12-23');
  const r = await lees(page);
  expect(r.soort).toBe('periode'); expect(r.eind).toBe('2026-12-23');
  expect(r.tot.pot + r.tot.vast + r.tot.kas).toBe(0);
  expect(r.tot.eind).toBe(r.tot.saldo);
  expect(r.week.dagenTeGaan).toBe(1);
  expect(r.week.over).toBeGreaterThanOrEqual(1);
  expect(Number.isFinite(r.week.bedrag) && Number.isFinite(r.week.nog)).toBe(true);
  expect(r.teksten.zienTxt).toContain('nog 0 dagen in deze periode');
  for (const t of Object.values(r.teksten)) expect(t).not.toMatch(RAAR);
});

/* de voorbeeldweergave van 26 nov vanaf de echte dag (31 okt) zegt dezelfde periode als de klok op 26 nov */
test('v507: de voorbeeldweergave van 26 nov zegt de periode van 26 nov', async ({ page }) => {
  await S.boot(page, '2026-10-31');
  const r = await page.evaluate(() => { voorbeeldStart('2026-11-26'); const P = periodeVan(vandaagYMD()); go('ins');
    const ik = document.querySelector('[data-insuitgegeven]'); return { ymd: vandaagYMD(), label: P.label, soort: P.soort, ins: ik ? ik.innerText.split('\n')[0].trim() : null }; });
  expect(r.ymd).toBe('2026-11-26');
  expect(r.soort).toBe('periode');
  expect(r.label).toBe('24 nov – 23 dec');
  expect(r.ins).toBe('Uitgegeven 24 nov – 23 dec');
});

/* de lat van v445 geldt ook in de periode: een render van Grip op toestel-omvang roept telbareTx() begrensd aan (eenheidTx heeft een
   memo). GEMETEN zonder die memo: 434 aanroepen op 23 nov. */
test('v507: Grip in de periode doet op toestel-omvang geen pass per eenheid over TX', async ({ page }) => {
  await pinDatum(page, '2026-11-26');
  const d = seed({ maanden: 21 }); const tx = JSON.parse(d.minder_tx);
  const ms = [...new Set(tx.map((t) => t.date.slice(0, 7)))].sort();
  for (const m of ms) for (let i = 0; i < 70; i++) tx.push({ id: 'g' + m + '-' + i, date: m + '-' + String((i % 27) + 1).padStart(2, '0'),
    amount: -(5 + (i % 40)), acc: 'NL01MAIN0000001111', name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of ['2026-08', '2026-09', '2026-10', '2026-11']) tx.push({ id: 'sal' + m, date: m + '-24', amount: 5216, acc: 'NL01MAIN0000001111', name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  d.minder_tx = JSON.stringify(tx);
  await open(page, d);
  const r = await page.evaluate(() => { let n = 0; const e = window.telbareTx;
    window.telbareTx = function (...a) { n++; return e.apply(this, a); };
    renderMaand(); n = 0; renderMaand(); const g = n; window.telbareTx = e; return { era: eraActief(), n: g, tx: TX.length }; });
  expect(r.tx).toBeGreaterThan(1400);
  expect(r.era, 'invoer: dit is de periode').toBe(true);
  expect(r.n).toBeLessThanOrEqual(80);
});
