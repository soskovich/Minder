/* v469: drie bevindingen op Plan na het salaris van 26-10. (1) Je spaarrekening tegen Plan: het verschil tussen het saldo en "gespaard
   voor je doelen" bij naam (spaarPlanAansl()), een regel op Plan met een sheet, en een controle van soort 2 die geen vergelijking maakt
   na een sync zonder transacties. (2) Een doel heet pas vol als het geld het doelbedrag haalt. (3) "Opzij deze periode" zegt "volgens je
   verdeling" en geen percentage.
   GECONSTRUEERD op plan-toestel-stand.js (stap 'nu': de terugzetkeuzes van oktober, EUR 788 nog terug naar het noodfonds). De stand van
   de melding: het noodfonds op zijn doel (EUR 4.000 toegewezen), Kosten Koper EUR 1.350, en een saldo dat de toewijzingen al dekt
   (EUR 5.350,20): het geld dat de keuze nog terug verwacht staat er al. De getallen van het toestel staan niet in deze repo. */
const { test, expect } = require('@playwright/test');
const F = require('./plan-toestel-stand');

async function melding(page, o) {
  await F.boot(page, 'nu');
  await page.evaluate(([sav, o]) => { SET.nfToegewezen = 4000; const kk = SET.goals.find((g) => g.id === 'kk'); kk.gespaard = 1350;
    SET.manualBal[sav] = o.saldo != null ? o.saldo : 5350.20;
    if (o.txFout) { SET.psd2Diag = SET.psd2Diag || {}; SET.psd2Diag[sav] = Object.assign({}, SET.psd2Diag[sav] || {}, { txFout: 'ASPSP_RATE_LIMIT_EXCEEDED' }); }
    save(); renderVooruit(); }, [F.SAV, o || {}]);
}

test.describe('1 · spaarrekening tegen Plan', () => {
  test('a. het verschil bestaat bij naam uit niet toegewezen, nog terug, zonder geld en tekort, en sluit', async ({ page }) => {
    await melding(page);
    const r = await page.evaluate(() => { const A = spaarPlanAansl(); const K = planKpiData();
      return { A: { saldo: A.saldo, geld: A.geld, X: A.X, vrij: A.vrij, terug: A.terug, zonder: A.zonder, tekort: A.tekort, rest: A.rest, al: A.al },
        kpi: K.geld, nf: A.doelen.find((d) => d.id === 'noodfonds') }; });
    expect(r.A.saldo).toBe(5350.2);
    expect(r.A.geld).toBe(r.kpi);                               // dezelfde som als "Gespaard voor je doelen"
    expect(r.nf).toMatchObject({ toegewezen: 4000, n: 788, geld: 3212 });
    expect(r.A.X).toBe(788.2);
    expect(Math.round((r.A.vrij - r.A.tekort + r.A.terug + r.A.zonder + r.A.rest) * 100) / 100).toBe(r.A.X);
    expect(r.A.rest).toBe(0);
    expect(r.A.al).toBe(788);                                   // de keuze verwacht het nog, het saldo heeft het al
  });
  test('b. de regel op Plan en de sheet tellen op tot hetzelfde verschil', async ({ page }) => {
    await melding(page);
    const r = await page.evaluate(() => { const g = document.querySelector('#spaarPlanRegel'); if (!g) return null; const t = g.innerText; g.click();
      const sh = document.querySelector('#spaarPlanSheet'), num = (s) => +s.getAttribute('data-bedrag');
      const delen = [...sh.querySelectorAll('[data-spaardeel]')].reduce((a, e) => a + num(e), 0);
      const doelen = [...sh.querySelectorAll('[data-spaardoel]')].reduce((a, e) => a + +e.dataset.geld, 0);
      const rek = [...sh.querySelectorAll('[data-spaarrek],[data-spaarextra]')].reduce((a, e) => a + num(e), 0);
      return { t, x: +sh.dataset.x, delen: Math.round(delen * 100) / 100, doelen, rek: Math.round(rek * 100) / 100, saldo: num(sh.querySelector('[data-spaarsaldo]')),
        kop: +document.querySelector('#planKpi').dataset.kpigeld, noot: (sh.querySelector('[data-spaarnoot]') || {}).innerText || '' }; });
    expect(r).not.toBeNull();
    expect(r.t).toContain('verschil met je spaarrekening €788,20');
    expect(r.delen).toBe(r.x);
    expect(r.doelen).toBe(r.kop);
    expect(r.rek).toBe(r.saldo);
    expect(Math.round((r.saldo - r.doelen) * 100) / 100).toBe(r.x);
    expect(r.noot).toContain('staat al op je spaarrekening');
  });
  test('c. de controle wacht; na een sync zonder transacties is er geen vergelijking; de gewone stand klopt', async ({ page }) => {
    await melding(page);
    const wacht = await page.evaluate(() => { runControles('test'); return SET.controles.uitkomst.find((u) => u.id === 'spaarplan'); });
    expect(wacht).toMatchObject({ soort: 2, status: 'wacht' });
    await melding(page, { txFout: true });
    const zonder = await page.evaluate(() => { runControles('test'); const sh = (openSpaarPlanAansl(), document.querySelector('#spaarPlanSheet'));
      return { u: SET.controles.uitkomst.find((u) => u.id === 'spaarplan'), geentx: !!sh.querySelector('[data-geentx]') }; });
    expect(zonder.u.status).toBe('verklaard');
    expect(zonder.u.reden).toContain('geen vergelijking');
    expect(zonder.geentx).toBe(true);
    await F.boot(page, 'nu');
    const gewoon = await page.evaluate(() => { runControles('test'); return SET.controles.uitkomst.find((u) => u.id === 'spaarplan'); });
    expect(gewoon.status).toBe('klopt');
  });
  test('d. alleen vrij spaargeld dat spaarVrijLine al noemt: geen tweede regel', async ({ page }) => {
    await F.boot(page, 'nu');
    const r = await page.evaluate((sav) => { SET.terugzet = {}; SET.terugzetGat = []; SET.nfToegewezen = 2000; SET.manualBal[sav] = 2500; save(); renderVooruit();
      const A = spaarPlanAansl(); return { puur: A.puurVrij, X: A.X, regel: !!document.querySelector('#spaarPlanRegel'), vrij: !!document.querySelector('.spaar-vrij') }; }, F.SAV);
    expect(r.puur).toBe(true);
    expect(r.X).toBe(500);
    expect(r.vrij).toBe(true);
    expect(r.regel).toBe(false);
  });
});

test.describe('2 · vol pas als het geld het doel haalt', () => {
  test('a. het noodfonds op zijn doel met geld dat nog terug moet heet niet vol', async ({ page }) => {
    await melding(page);
    const r = await page.evaluate(() => { const rij = document.querySelector('.plan-item[data-id="noodfonds"]');
      return { st: rij.dataset.status, status: rij.querySelector('[data-planstatus]').innerText, vol: rij.querySelector('[data-rijvol]').innerText.replace(/\s*›\s*$/, '').trim(), geld: rij.querySelector('[data-rijgeld]').innerText,
        plan: allocatePlan().find((p) => p.id === 'noodfonds').status }; });
    expect(r.plan).toBe('bereikt');                             // de verdeling stuurt er niets meer heen
    expect(r.st).not.toBe('vol');
    expect(r.status).not.toBe('vol');
    expect(r.vol.replace(/\s*›\s*$/, '').trim()).not.toBe('vol');
    expect(r).toMatchObject({ st: 'terug', status: 'nog €788 terug' });
    expect(r.geld).toContain('€3.212');
  });
  test('b. haalt het geld het doel, dan is het vol', async ({ page }) => {
    await F.boot(page, 'nu');
    const r = await page.evaluate((sav) => { SET.terugzet = {}; SET.terugzetGat = []; SET.nfToegewezen = 4000; SET.manualBal[sav] = 4000.20; save(); renderVooruit();
      const rij = document.querySelector('.plan-item[data-id="noodfonds"]'); return { st: rij.dataset.status, vol: rij.querySelector('[data-rijvol]').innerText.replace(/\s*›\s*$/, '').trim() }; }, F.SAV);
    expect(r.st).toBe('vol');
    expect(r.vol).toBe('vol');
  });
});

test.describe('3 · opzij deze periode zegt "volgens je verdeling"', () => {
  test('a. geen "doel" en geen percentage in de tegel', async ({ page }) => {
    await F.boot(page, 'nu');
    const t = await page.evaluate(() => { SET.salVerdeling = Object.assign({}, SET.salVerdeling || {}, { opzij: 1766, rek: (SET.salVerdeling || {}).rek || {} }); save(); renderVooruit();
      const O = opzijPeriode(); return { tile: document.querySelector('[data-kpiopzijperiode]').innerText, netto: O.netto, pct: O.pct }; });
    expect(t.pct).not.toBeNull();                               // er IS een percentage uit te rekenen; de tegel toont het niet
    expect(t.tile).toContain('volgens je verdeling €1.766');
    expect(t.tile).not.toMatch(/%/);
    expect(t.tile).not.toMatch(/doel/);
  });
});
