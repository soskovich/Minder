/* v470: drie punten na v469. (1) "Nog terug" volgt het saldo: per doel gespaard = min(toegewezen, het deel van het saldo dat aan dat doel
   toekomt) (planTekort()); een doel is vol als dat het doelbedrag haalt; alleen na een sync waarin de transacties lukten. (2) Terug te
   zetten op Plan en "nog terug" per doel zijn een bron (planTerug()): een storting lost beide af, en blok 20 legt de twee rekenwegen
   naast elkaar. Het grootboek over de salarisperiodes (opzijInhalen(), v442) is geen bron meer. (3) De Doelen-meter op Grip toont geen
   percentage en geen "van je doel".
   GECONSTRUEERD op plan-toestel-stand.js (stap 'nu': een terugzetkeuze die nog EUR 788 naar het noodfonds verwacht). De getallen van het
   toestel (EUR 1.088 en EUR 1.350) staan niet in deze repo. */
const { test, expect } = require('@playwright/test');
const F = require('./plan-toestel-stand');

async function stand(page, o) {
  o = o || {};
  await F.boot(page, 'nu');
  await page.evaluate(([sav, o]) => { SET.nfToegewezen = 4000; const kk = SET.goals.find((g) => g.id === 'kk'); kk.gespaard = 1350;
    SET.manualBal[sav] = o.saldo != null ? o.saldo : 5350.20;
    if (o.txFout) { SET.psd2Diag = SET.psd2Diag || {}; SET.psd2Diag[sav] = Object.assign({}, SET.psd2Diag[sav] || {}, { txFout: 'ASPSP_RATE_LIMIT_EXCEEDED' }); }
    save(); renderVooruit(); }, [F.SAV, o]);
}
const rij = (page) => page.evaluate(() => { const r = document.querySelector('.plan-item[data-id="noodfonds"]');
  return { st: r.dataset.status, status: r.querySelector('[data-planstatus]').innerText, vol: r.querySelector('[data-rijvol]').innerText.replace(/\s*›\s*$/, '').trim() }; });

test.describe('1 · nog terug volgt het saldo', () => {
  test('a. het saldo dekt de toewijzingen: noodfonds vol, gespaard voor je doelen EUR 5.350, verschil EUR 0,20 niet toegewezen', async ({ page }) => {
    await stand(page);
    const r = await page.evaluate(() => { const A = spaarPlanAansl(), TK = planTekort();
      return { keuze: TK.keuze.noodfonds, geld: A.geld, kpi: planKpiData().geld, X: A.X, puur: A.puurVrij, al: A.al, nf: A.doelen.find((d) => d.id === 'noodfonds'),
        regel: (document.querySelector('#spaarPlanRegel') || {}).innerText || '' }; });
    expect(r.keuze).toBe(788);                         // de terugzetkeuze verwacht het nog: zonder dit geval meet de test niets
    expect(r.nf).toMatchObject({ toegewezen: 4000, n: 0, geld: 4000 });
    expect(r.geld).toBe(5350);
    expect(r.kpi).toBe(5350);
    expect(r.X).toBe(0.2);
    expect(r.puur).toBe(true);
    expect(r.al).toBe(788);                            // wat de keuze verwacht en al op je spaarrekening staat
    expect(r.regel).toContain('niet toegewezen €0,20');
    const R = await rij(page);
    expect(R.st).toBe('vol');
    expect(R.vol).toBe('vol');
    const u = await page.evaluate(() => { runControles('test'); return SET.controles.uitkomst.find((x) => x.id === 'spaarplan'); });
    expect(u.status).toBe('klopt');
  });
  test('b. staat er minder dan toegewezen, dan is alleen dat tekort nog terug (niet de hele keuze)', async ({ page }) => {
    await stand(page, { saldo: 5000.20 });
    const r = await page.evaluate(() => { const TK = planTekort(), A = spaarPlanAansl(); return { T: TK.T, nog: TK.nog.noodfonds || 0, nf: A.doelen.find((d) => d.id === 'noodfonds'), X: A.X }; });
    expect(r.T).toBe(349.8);
    expect(r.nog).toBe(349.8);                         // niet 788: de rest staat al op je spaarrekening
    expect(r.nf.geld).toBe(3650.2);
    expect(r.X).toBe(0);
    const R = await rij(page);
    expect(R.st).not.toBe('vol');                      // het geld haalt het doel niet: vol in een latere stap, niet nu
  });
  test('c. na een sync zonder transacties blijft het de terugzetkeuze', async ({ page }) => {
    await stand(page, { txFout: true });
    const r = await page.evaluate(() => { const TK = planTekort(), A = spaarPlanAansl(); return { saldo: TK.saldo, reden: TK.reden, nf: A.doelen.find((d) => d.id === 'noodfonds'), status: A.status }; });
    expect(r.saldo).toBe(false);
    expect(r.reden).toContain('transacties ontbraken');
    expect(r.nf).toMatchObject({ n: 788, geld: 3212 });
    expect(r.status).toBe('verklaard');
    const R = await rij(page);
    expect(R.st).toBe('terug');
  });
});

test.describe('2 · een bron voor terugzetten', () => {
  test('a. Terug te zetten op Plan is de som van nog terug per doel, en een storting lost beide in een keer af', async ({ page }) => {
    await stand(page, { saldo: 5000.20 });
    const voor = await page.evaluate(() => { const g = document.querySelector('#spaarOverRegel'); openInhalen(); const sh = document.querySelector('#inhalenSheet');
      const rijen = [...sh.querySelectorAll('[data-terugdoel]')].reduce((a, e) => a + +e.dataset.terug, 0);
      const SE = planStandEind(); let som = 0; for (const p of allocatePlan()) { if (!(p.type === 'goal' || p.type === 'noodfonds')) continue; som += Math.max(Math.round(+p.gespaard || 0) - SE.per[p.id].geld, 0); }
      const diag = diagMaandBudget(maandVooruit(), true, null).join('\n');
      return { regel: g ? +g.dataset.planinhalen : null, tekst: g ? g.innerText : '', rijen: Math.round(rijen * 100) / 100, som: Math.round(som * 100) / 100,
        controle: diag.split('\n').find((l) => /CONTROLE terug te zetten op Plan/.test(l)) || '' }; });
    expect(voor.regel).toBe(349.8);
    expect(voor.tekst).toContain('Terug te zetten €349,80');
    expect(voor.rijen).toBe(349.8);
    expect(voor.som).toBe(349.8);
    expect(voor.controle).toMatch(/€349,80 tegen €349,80 → klopt/);
    const na = await page.evaluate((sav) => { SET.manualBal[sav] = 5350.20; save(); renderVooruit();
      const r = document.querySelector('.plan-item[data-id="noodfonds"]');
      return { regel: !!document.querySelector('#spaarOverRegel'), st: r.dataset.status, controle: diagMaandBudget(maandVooruit(), true, null).join('\n').split('\n').find((l) => /CONTROLE terug te zetten op Plan/.test(l)) || '' }; }, F.SAV);
    expect(na.regel).toBe(false);                      // de storting lost Terug te zetten af
    expect(na.st).toBe('vol');                         // en nog terug bij het noodfonds
    expect(na.controle).toMatch(/€0 tegen €0 → klopt/);
  });
  test('b. de terugzetkeuze alleen maakt geen Terug te zetten als het geld er al staat', async ({ page }) => {
    await stand(page);
    const r = await page.evaluate(() => ({ keuze: planTekort().keuze.noodfonds, regel: !!document.querySelector('#spaarOverRegel') }));
    expect(r.keuze).toBe(788);
    expect(r.regel).toBe(false);
  });
});

test.describe('2c · het grootboek over de periodes is geen bron meer', () => {
  /* De fixture van v442-inhalen: augustus -EUR 500, september +EUR 500 tegen een opzij-doel van EUR 300, dus EUR 300 open in het
     grootboek, terwijl er niets aan een doel is toegewezen. */
  const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
  test('Plan toont geen Terug te zetten uit het grootboek', async ({ page }) => {
    const tx = []; const add = (id, date, amount, name, desc, acc) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: acc === SAV ? 'Instant Savings' : 'Main', refNums: [] });
    for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add('inc-' + m, m + '-05', 3000, 'Werkgever', 'SALARIS LOON');
    add('ont-aug', '2026-08-10', -500, 'Spaarpot', 'VAN SPAREN', SAV); add('in-sep', '2026-09-10', 500, 'Spaarpot', 'NAAR SPAREN', SAV);
    const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct', budgets: { boodschappen: 600 }, savingsEnds: ['4323'],
      manualBal: { [MAIN]: 4000, [SAV]: 2500 }, salVerdeling: { rek: SAV, opzij: 300 } };
    const d = { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]), minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
    await page.route('**/sw.js', (r) => r.abort());
    await require('./vaste-dag').pinDatum(page, '2026-10-10');
    await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, d);
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof opzijInhalen === 'function' && typeof TX !== 'undefined' && TX.length > 0);
    const r = await page.evaluate(() => { go('vooruit'); return { grootboek: opzijInhalen().inhalen, bron: planTerug().totaal, regel: !!document.querySelector('#spaarOverRegel') }; });
    expect(r.grootboek).toBe(300);                     // het grootboek draagt een bedrag: zonder dat meet de test niets
    expect(r.bron).toBe(0);
    expect(r.regel).toBe(false);
  });
});

test.describe('3 · de Doelen-meter op Grip', () => {
  test('geen percentage en geen "van je doel", wel "EUR X opzij · volgens je verdeling EUR Y"', async ({ page }) => {
    await F.boot(page, 'nu');
    const r = await page.evaluate(() => { SET.salVerdeling = Object.assign({}, SET.salVerdeling || {}, { opzij: 1766, rek: (SET.salVerdeling || {}).rek || {} }); save();
      opzijPeriode = () => ({ ok: true, meetbaar: true, netto: 2031, doel: 1766, tx: [] }); go('maand');
      const m = document.querySelector('#gripMeters [data-meter="doelen"]'); const t = m.innerText;
      openGripMeter('doelen'); const sh = document.querySelector('#sheet').innerText; closeSheet();
      return { t, sub: (m.querySelector('[data-meterverwachtdoel]') || {}).innerText, sh, pct: gripMeterDoelen().pct }; });
    expect(r.pct).toBe(115);                           // er IS een percentage uit te rekenen; de meter toont het niet
    expect(r.t).not.toMatch(/%/);
    expect(r.t).not.toMatch(/van je doel/);
    expect(r.sub).toBe('€2.031 opzij · volgens je verdeling €1.766');
    expect(r.sh).not.toMatch(/van je doel/);
    expect(r.sh).not.toMatch(/115/);
  });
});
