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
    const naam = await page.evaluate((sav) => accLabel(sav), F.SAV);
    expect(naam).toBeTruthy();
    expect(r.reden).toContain(naam);                    // de reden noemt de rekening
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

/* 3 · "Opzij deze periode" herleidbaar. Eigen fixture (GECONSTRUEERD): salaris op de 5e (periode vanaf 5 okt 2026), twee spaarrekeningen
   met een gemeten saldo van voor het begin (SET.saldoPunten), een boeking tussen dat saldo en het begin, en boekingen in de periode met
   centen. Saldo nu = begin + som per rekening, tot op de cent. */
const { pinDatum } = require('./vaste-dag');
const MAIN = 'NL01MAIN0000001111', S1 = 'NL01SAVE0000004323', S2 = 'NL01SAVE0000007777';
const PERIODE = [['s1-in', '2026-10-06', 500, S1], ['s1-uit', '2026-10-12', -200.05, S1], ['s1-in2', '2026-10-15', 300.10, S1], ['s2-in', '2026-10-07', 250.25, S2]];
async function opzijStand(page, o) {
  o = o || {};
  const tx = []; const add = (id, date, amount, acc, name, desc) => tx.push({ id, date, amount, acc, name: name || 'Spaarpot', desc: desc || (amount > 0 ? 'NAAR SPAREN' : 'VAN SPAREN'), typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) add('inc-' + m, m + '-05', 3000, MAIN, 'Werkgever', 'SALARIS LOON');
  add('s1-tussen', '2026-10-04', 100, S1);
  for (const [id, d, a, acc] of PERIODE) if (!(o.zonder || []).includes(id)) add(id, d, a, acc);
  const nu1 = 2000 + 100 + 500 - 200.05 + 300.10, nu2 = 1000 + 250.25;
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct', budgets: { boodschappen: 300 }, savingsEnds: ['4323', '7777'],
    manualBal: { [MAIN]: 4000, [S1]: Math.round((nu1 + (o.gat || 0)) * 100) / 100, [S2]: nu2 },
    saldoPunten: o.geenPunt ? {} : { [S1]: [{ d: '2026-10-03', tijd: Date.parse('2026-10-03T20:00:00Z'), saldo: 200000 }], [S2]: [{ d: '2026-10-04', tijd: Date.parse('2026-10-04T20:00:00Z'), saldo: 100000 }] } };
  if (o.txFout) set.psd2Diag = { [S2]: { txFout: 'ASPSP_RATE_LIMIT_EXCEEDED', balGeland: true, _op: Date.parse('2026-10-19T19:05:00Z'), _veldOp: { txFout: Date.parse('2026-10-19T19:05:00Z') } } };
  const d = { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, S1, S2]), minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-19');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof opzijHerleiding === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  await page.evaluate(() => { SET.goals = [{ id: 'g1', naam: 'Doel', doel: 5000, gespaard: 0, streefdatum: '2027-12' }]; save(); go('vooruit'); });
}
const tegel = (page) => page.evaluate(() => { const t = document.querySelector('[data-kpiopzijperiode]'); return t ? { netto: +t.dataset.kpiopzij, exact: +t.dataset.kpiopzijexact, txt: t.innerText, onv: !!t.querySelector('[data-kpionvolledig]') } : null; });
const sheet = (page) => page.evaluate(() => { document.querySelector('[data-kpiopzijperiode]').click(); const sh = document.querySelector('#opzijSheet');
  const rijen = [...sh.querySelectorAll('[data-opzijrij]')].map((e) => Math.round(+e.dataset.bedrag * 100));
  return { som: +sh.dataset.som, rijenC: rijen.reduce((a, b) => a + b, 0), n: rijen.length, gaten: [...sh.querySelectorAll('[data-opzijgat]')].map((e) => ({ v: +e.dataset.opzijgat, t: e.innerText })),
    begin: [...sh.querySelectorAll('[data-opzijbegin]')].map((e) => e.dataset.opzijbegin), onv: [...sh.querySelectorAll('[data-opzijonvolledig]')].map((e) => e.innerText), titel: sh.innerText.split('\n')[0] }; });

test.describe('3 · opzij deze periode herleidbaar', () => {
  test('d. de som van de rijen in de opzij-sheet is het bedrag op de tegel, in centen', async ({ page }) => {
    await opzijStand(page);
    const t = await tegel(page);
    expect(t.exact).toBe(850.3);                        // 500 - 200,05 + 300,10 + 250,25
    expect(t.netto).toBe(850);
    const s = await sheet(page);
    expect(s.titel).toBe('Opzij sinds 5 okt');
    expect(s.n).toBe(4);
    expect(s.rijenC).toBe(Math.round(t.exact * 100));
    expect(Math.round(s.som * 100)).toBe(Math.round(t.exact * 100));
  });
  test('e. beginsaldo + som = saldo nu bij volledige data; een gat van EUR 10 geeft de aansluitregel', async ({ page }) => {
    await opzijStand(page);
    const H = await page.evaluate(() => opzijHerleiding().rek.map((r) => ({ begin: r.begin, som: r.som, nu: r.nu, verschil: r.verschil })));
    expect(H[0]).toEqual({ begin: 2100, som: 600.05, nu: 2700.05, verschil: 0 });   // saldo 3 okt 2.000 + 100 op 4 okt
    expect(H[1]).toEqual({ begin: 1000, som: 250.25, nu: 1250.25, verschil: 0 });
    expect((await sheet(page)).gaten).toEqual([]);
    await opzijStand(page, { gat: 10 });
    const s = await sheet(page);
    expect(s.gaten.length).toBe(1);
    expect(s.gaten[0].v).toBe(10);
    expect(s.gaten[0].t).toContain('sluit niet aan: €10 verschil bij');
    const diag = await page.evaluate(() => diagMaandBudget(maandVooruit(), true, null).join('\n'));
    expect(diag).toContain('OPZIJ HERLEIDING');
    expect(diag).toMatch(/verschil €10 → SLUIT NIET/);
  });
  test('e2. zonder gemeten saldo voor het begin: geen beginsaldo en geen aansluitregel', async ({ page }) => {
    await opzijStand(page, { geenPunt: true, gat: 10 });
    const s = await sheet(page);
    expect(s.begin).toEqual(['', '']);
    expect(s.gaten).toEqual([]);
  });
  test('f. transacties van een spaarrekening ontbraken: de tegel zegt "onvolledig", de sheet welke rekening en sinds wanneer', async ({ page }) => {
    await opzijStand(page);
    expect((await tegel(page)).onv).toBe(false);
    await opzijStand(page, { txFout: true });
    const t = await tegel(page);
    expect(t.onv).toBe(true);
    expect(t.txt).toContain('onvolledig');
    const s = await sheet(page);
    expect(s.onv.length).toBe(1);
    expect(s.onv[0]).toContain('19-10 21:05');
  });
  test('g. een sync waarin saldo en transacties lukten legt het saldo van die dag vast; een sync zonder transacties niet', async ({ page }) => {
    await opzijStand(page, { geenPunt: true });
    const r = await page.evaluate(([s1, s2]) => { aansluitingVastleggen({ [s1]: { saldo: 2700.05, soort: 'XPCD' }, [s2]: { saldo: 1250.25, soort: 'XPCD', txFout: 'ASPSP_RATE_LIMIT_EXCEEDED' } });
      return { p1: (SET.saldoPunten || {})[s1], p2: (SET.saldoPunten || {})[s2] }; }, [S1, S2]);
    expect(r.p1).toEqual([expect.objectContaining({ d: '2026-10-19', saldo: 270005 })]);
    expect(r.p2 || []).toEqual([]);
  });
});
