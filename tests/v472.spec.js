/* v472: (1) planTekort() gebruikt het saldo zodra het saldo van elke spaarrekening bij de laatste sync lukte; een transactiefout is
   geen reden meer om op de terugzetkeuze terug te vallen (die hoort bij de aansluiting, v465). Alleen een ontbrekend of mislukt saldo
   laat het de keuze blijven, met de reden. (2) Een regel bovenaan Plan in plaats van twee ("verschil met je spaarrekening" en "Terug te
   zetten"): nog terug (planTerug()) en niet toegewezen, met de sheet "Je spaarrekening tegen je doelen"; onder EUR 0,50 geen regel.
   GECONSTRUEERD op plan-toestel-stand.js (stap 'nu', een terugzetkeuze die nog EUR 788 naar het noodfonds verwacht) met de getallen van de
   melding van 26-10: saldo EUR 5.350,20, toegewezen EUR 4.000 Noodfonds + EUR 1.350 Kosten Koper. */
const { test, expect } = require('@playwright/test');
const F = require('./plan-toestel-stand');

async function stand(page, o) {
  o = o || {};
  await F.boot(page, 'nu');
  await page.evaluate(([sav, o]) => { SET.nfToegewezen = 4000; const kk = SET.goals.find((g) => g.id === 'kk'); kk.gespaard = 1350;
    const b = o.saldo != null ? o.saldo : 5350.20, nu = Date.now();
    /* een gekoppelde spaarrekening: het saldo komt uit de bank (ACCMETA), de sync staat in SET.psd2Diag */
    SET.psd2Accounts = Object.assign({}, SET.psd2Accounts || {}, { [sav]: { uid: 'u-sav', bank: 'N26', label: 'Spaarrekening', exp: '2027-01-01' } });
    ACCMETA[sav] = Object.assign({}, ACCMETA[sav] || {}, { balance: b, date: '2026-10-26', bank: 'N26' }); SET.manualBal[sav] = b;
    SET.psd2Diag = SET.psd2Diag || {};
    SET.psd2Diag[sav] = o.saldoFout
      ? { balGeland: false, balFout: 'EXPIRED_SESSION', txFout: '', _op: nu, _veldOp: { balGeland: nu, txFout: nu } }
      : { balGeland: true, balFout: '', txFout: o.txFout ? 'ASPSP_RATE_LIMIT_EXCEEDED' : '', _op: nu, _veldOp: { balGeland: nu, txFout: nu } };
    save(); renderVooruit(); }, [F.SAV, o]);
}
const lees = (page) => page.evaluate(() => { const TK = planTekort(), R = planTerug(), A = spaarPlanAansl(), r = document.querySelector('.plan-item[data-id="noodfonds"]');
  const g = document.querySelector('#spaarPlanRegel');
  return { saldo: TK.saldo, reden: TK.reden, keuze: TK.keuze.noodfonds || 0, nog: TK.nog.noodfonds || 0, terug: R.totaal, vrij: A.vrij, bron: A.bron,
    nf: A.doelen.find((d) => d.id === 'noodfonds'), st: r.dataset.status, geldTxt: r.querySelector('[data-rijgeld]').innerText,
    regel: g ? { nog: +g.dataset.spaarplannog, vrij: +g.dataset.spaarplanvrij, t: g.innerText } : null }; });

test.describe('1 · het saldo telt ook na een transactiefout', () => {
  test('a. transactiefout op de spaarrekening, saldo vers: het saldo wordt gebruikt, nog terug 0, Noodfonds EUR 4.000/EUR 4.000', async ({ page }) => {
    await stand(page, { txFout: true });
    const dg = await page.evaluate((sav) => SET.psd2Diag[sav].txFout, F.SAV);
    expect(dg).toBe('ASPSP_RATE_LIMIT_EXCEEDED');       // de invoer draagt de transactiefout: zonder dit geval meet de test niets
    const r = await lees(page);
    expect(r.keuze).toBe(788);                          // de keuze verwacht nog EUR 788: dat is wat de oude terugval toonde
    expect(r.saldo).toBe(true);
    expect(r.nog).toBe(0);
    expect(r.terug).toBe(0);
    expect(r.nf).toMatchObject({ toegewezen: 4000, n: 0, geld: 4000 });
    expect(r.st).toBe('vol');
    expect(r.geldTxt).toContain('€4.000');
    expect(r.vrij).toBe(0.2);                            // EUR 0,20 niet toegewezen
  });
  test('b. saldo mislukt bij de laatste sync: terugval op de terugzetkeuze, met de reden', async ({ page }) => {
    await stand(page, { saldoFout: true });
    const r = await lees(page);
    expect(r.saldo).toBe(false);
    expect(r.reden).toContain('niet opgehaald bij de laatste sync');
    expect(r.nog).toBe(788);
    expect(r.bron).toBe('keuze');
    expect(r.st).toBe('terug');
    const sh = await page.evaluate(() => { openSpaarPlanAansl(); const s = document.querySelector('#spaarPlanSheet');
      return { noot: (s.querySelector('[data-spaarnoot]') || {}).innerText || '', geen: !!s.querySelector('[data-geensaldo]'), bron: s.dataset.terugbron }; });
    expect(sh.bron).toBe('keuze');
    expect(sh.geen).toBe(true);
    expect(sh.noot).toContain('niet opgehaald');
    expect(sh.noot).toContain('volgt nu je terugzetkeuze');
  });
});

test.describe('2 · een regel bovenaan Plan', () => {
  test('c. er staat maar een verschilregel op Plan, en de sheet draagt nog terug en niet toegewezen', async ({ page }) => {
    await stand(page, { saldo: 5000.20 });
    const r = await page.evaluate(() => { const M = document.querySelector('[data-planmeldingen]'); const t = M ? M.innerText : '';
      const g = document.querySelector('#spaarPlanRegel'); g.click(); const sh = document.querySelector('#spaarPlanSheet');
      return { n: document.querySelectorAll('#spaarPlanRegel').length, oud: !!document.querySelector('#spaarOverRegel'), terugTxt: (t.match(/terug/gi) || []).length,
        teTe: /Terug te zetten/.test(document.querySelector('#s-vooruit').innerText), regelNog: +g.dataset.spaarplannog, bron: planTerug().totaal,
        delen: [...sh.querySelectorAll('[data-spaardeel]')].map((e) => e.dataset.spaardeel), som: +sh.dataset.som,
        rijen: [...sh.querySelectorAll('[data-terugdoel]')].reduce((a, e) => a + +e.dataset.terug, 0),
        fn: typeof window.spaarOverLine, fn2: typeof window.openInhalen }; });
    expect(r.bron).toBe(349.8);
    expect(r.n).toBe(1);
    expect(r.oud).toBe(false);
    expect(r.teTe).toBe(false);
    expect(r.terugTxt).toBe(1);                         // het verschil staat een keer in de meldingen
    expect(r.regelNog).toBe(r.bron);                    // een bron: planTerug()
    expect(r.delen).toEqual(expect.arrayContaining(['terug', 'vrij']));
    expect(r.som).toBe(349.8);
    expect(Math.round(r.rijen * 100) / 100).toBe(349.8);
    expect(r.fn).toBe('undefined');
    expect(r.fn2).toBe('undefined');
  });
  test('d. de stand van de melding: verschil EUR 0,20, dus geen regel', async ({ page }) => {
    await stand(page, { txFout: true });
    const r = await lees(page);
    expect(Math.round((r.terug + r.vrij) * 100) / 100).toBe(0.2);
    expect(r.regel).toBeNull();
  });
  test('e. nog terug op de regel is planTerug(): ook het deel dat zonder keuze ontbreekt', async ({ page }) => {
    await stand(page, { saldo: 4000.20 });
    const r = await page.evaluate(() => { const TK = planTekort(), g = document.querySelector('#spaarPlanRegel');
      const kz = Object.values(TK.nog).reduce((a, v) => a + v, 0), zg = Object.values(TK.zg).reduce((a, v) => a + v, 0);
      return { kz: Math.round(kz * 100) / 100, zg: Math.round(zg * 100) / 100, bron: planTerug().totaal, regel: g ? +g.dataset.spaarplannog : null }; });
    expect(r.zg).toBeGreaterThan(0);                    // er ontbreekt meer dan de keuze verwacht: zonder dit geval meet de test niets
    expect(r.bron).toBe(1349.8);
    expect(r.regel).toBe(r.bron);
    expect(r.regel).not.toBe(r.kz);
  });
});
