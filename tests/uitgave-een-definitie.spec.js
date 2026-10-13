/* v405: EEN DEFINITIE VAN UITGAVE VOOR ALLE SCHERMEN EN DE COACH (isUitgave). Op de stand van grip-kring-stand (10 oktober
   2026), met in september en oktober:
   - Persoonlijke overboeking zonder potje (Tikkie): telt nergens als uitgave, ook niet bij de coach en de lek-detectie;
   - een overboeking "From Main to Buffer" die de bank als uitgave levert (OVR overig): een eigen overboeking, dus intern;
   - Vakantie & reizen zonder potje en Uit eten met een losse uitgave: tellen overal gelijk.
   GECONSTRUEERD EN NIET GEMETEN: de stand van het toestel staat alleen daar. */
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

async function boot(page) {
  await K.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, cat, desc) => { const t = { id: 'u' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: desc || ('BEA, BETAALPAS ' + n.toUpperCase()), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    delete SET.budgets.persoonlijk; delete SET.budgets.vakantie;
    add('2026-09-12', -240, 'Tikkie Anna', 'persoonlijk'); add('2026-10-04', -150, 'Tikkie Dirk', 'persoonlijk');
    add('2026-09-15', -300, 'From Main to Buffer', null, 'From Main to Buffer'); add('2026-10-05', -200, 'From Main to Buffer', null, 'From Main to Buffer');
    add('2026-09-20', -310.45, 'Transavia', 'vakantie'); const bk = add('2026-10-03', -89.99, 'Booking Com', 'vakantie');
    SET.uitReservering = SET.uitReservering || {}; SET.uitReservering[bk.id] = 40;   // een deel uit een reservering: telt netto 49,99
    applyOwnAccounts(); save(); render();
  }, { MAIN: K.MAIN });
}
/* Per maand de uitgave per categorie volgens elke lezer. */
const lezers = (page, m) => page.evaluate(m => {
  const r2 = o => { const x = {}; for (const k in o) { const v = Math.round(o[k] * 100) / 100; if (v) x[k] = v; } return x; };
  const MB = maandPotjes(m).B;
  const coach = r2(catSpendMap(m));
  const ins = {}; for (const t of txOfMonth(m)) { if (!insTxSoort(t, MB)) continue; const k = catOf(t); ins[k] = (ins[k] || 0) + uitgaveNorm(t); }
  const lek = r2(noPotLeak(m).perCat);
  const insZonder = {}; for (const t of txOfMonth(m)) { if (insTxSoort(t, MB) !== 'zonder' || isFixed(t)) continue; const k = catOf(t); insZonder[k] = (insZonder[k] || 0) + uitgaveNorm(t); }
  const grip = {}; if (m === thisYM()) for (const x of zonderPotjeStand(m).rijen) if (x.telt && x.geboekt) grip[x.k] = Math.round(x.geboekt * 100) / 100;
  const T = totals(m), som = Object.entries(coach).filter(([k]) => !geenNorm(k)).reduce((a, [, v]) => a + v, 0);
  return { coach, ins: r2(ins), lek, insZonder: r2(insZonder), grip, spendNorm: Math.round(T.spendNorm * 100) / 100, som: Math.round(som * 100) / 100,
    pers: Math.round(T.persoonlijk), eigen: txOfMonth(m).filter(t => t.name === 'From Main to Buffer').map(t => catOf(t)) };
}, m);

for (const m of ['2026-10', '2026-09']) {
  test(`a ${m}: coach, lek, Inzichten en Grip geven hetzelfde bedrag per categorie`, async ({ page }) => {
    await boot(page); const L = await lezers(page, m);
    expect(L.pers).toBeGreaterThan(0);   // invoermeting: er is een persoonlijke overboeking deze maand
    expect(L.eigen.length).toBe(1); expect(L.eigen[0]).toBe('intern');   // de eigen overboeking is intern
    for (const k of Object.keys(L.coach).filter(k => !geenNormNode(k))) expect([k, L.ins[k]]).toEqual([k, L.coach[k]]);
    expect(Object.keys(L.ins).sort()).toEqual(Object.keys(L.coach).filter(k => !geenNormNode(k)).sort());
    expect(L.coach.persoonlijk).toBeUndefined(); expect(L.lek.persoonlijk).toBeUndefined(); expect(L.ins.persoonlijk).toBeUndefined();
    expect(L.lek.vakantie).toBeTruthy();   // invoermeting: de lek-detectie ziet een categorie zonder potje
    if (m === '2026-10') expect(L.lek.vakantie).toBe(49.99);   // netto na het deel uit een reservering
    for (const k of Object.keys(L.lek)) expect([k, L.lek[k]]).toEqual([k, L.insZonder[k]]);
    for (const k of Object.keys(L.grip)) expect([k, L.grip[k]]).toEqual([k, L.insZonder[k]]);
    expect(Math.abs(L.som - L.spendNorm)).toBeLessThan(0.01);   // de som per categorie is het uitgaventotaal van Inzichten en Grip
  });
}
const geenNormNode = k => ['onvoorzien', 'contant'].includes(k);

test('b: de coach en de lek-detectie noemen een persoonlijke overboeking nooit', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({ leak: (coachLeak(thisYM()) || {}).cat, hef: (grootsteHefboom() || {}).cat,
    over: (budgetOverCat(thisYM()) || {}).k, vc: Object.keys(catSpendMap('2026-09')) }));
  expect(r.leak).not.toBe('persoonlijk'); expect(r.hef).not.toBe('persoonlijk'); expect(r.over).not.toBe('persoonlijk');
  expect(r.vc).not.toContain('persoonlijk');
});

test('b2: de grootste hefboom van de coach volgt dezelfde definitie, met de potjes van die maand', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const t = { id: 'uhef', date: '2026-08-12', amount: -5000, acc: TX[0].acc, name: 'Tikkie Groot', desc: 'TIKKIE GROOT', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = 'persoonlijk'; save();
    const zonder = (grootsteHefboom() || {}).cat;
    SET.budgetHist = SET.budgetHist || {}; SET.budgetHist['2026-08'] = Object.assign({}, SET.budgets, { persoonlijk: 6000 }); save();
    return { zonder, met: (grootsteHefboom() || {}).cat }; });
  expect(r.zonder).not.toBe('persoonlijk');   // zonder potje is het geen uitgave
  expect(r.met).toBe('persoonlijk');          // met een potje in augustus wel, ook al heeft hij er nu geen
});

test('c: een persoonlijke overboeking met een potje in die maand telt wel, ook bij de coach', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { SET.budgetHist = SET.budgetHist || {}; SET.budgetHist['2026-09'] = Object.assign({}, SET.budgets, { persoonlijk: 300 }); save();
    return { coach: catSpendMap('2026-09').persoonlijk, ins: insPeriodeStand(['2026-09']).pers, nu: catSpendMap('2026-10').persoonlijk }; });
  expect(r.coach).toBe(240); expect(r.ins).toBe(0); expect(r.nu).toBeUndefined();
});

test('d: de grijze regel staat ook bij een afgesloten maand, en categorie geven rekent de Terugblik opnieuw', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { SET.gripKeuze = SET.gripKeuze || {}; SET.gripKeuze['2026-09'] = { uiteten: { titel: 'Uit eten max', lat: [{ soort: 'potmax', k: 'uiteten', naam: 'Uit eten', max: (catSpendMap('2026-09').uiteten || 0) + 100, potje: 0 }] } }; save(); });
  const voor = await page.evaluate(() => gripTerugblik('2026-09').items.find(x => x.id === 'uiteten').s);
  expect(voor).toBe('ok');   // invoermeting: binnen de grens zolang de 240 geen uitgave is
  await page.evaluate(() => { go('ins'); insFilterZet('vorige', null); });
  const regel = await page.evaluate(() => { const e = document.querySelector('#insMaand [data-inspers]'); return e && { v: +e.dataset.inspers, t: e.innerText, oc: e.getAttribute('onclick') }; });
  expect(regel).toEqual({ v: 240, t: '€240 persoonlijke overboekingen · niet in je budget ›', oc: "openInsPersoonlijk('2026-09')" });
  const sh = await page.evaluate(() => { openInsPersoonlijk('2026-09'); const S = document.querySelector('#insPersSheet');
    return { v: +S.dataset.inswaarde, rijen: [...S.querySelectorAll('[data-persrij]')].map(e => +e.dataset.persrij), kop: S.innerText.split('\n')[0] }; });
  expect(sh.v).toBe(240); expect(sh.rijen).toEqual([240]); expect(sh.kop).toBe('Persoonlijke overboekingen · september');
  const na = await page.evaluate(() => { const t = TX.find(x => x.name === 'Tikkie Anna'); window._werklijst = { persoonlijk: true, ms: '2026-09' }; openSheet(t.id); setCat(t.id, 'uiteten');
    return { s: gripTerugblik('2026-09').items.find(x => x.id === 'uiteten').s, pers: insPeriodeStand(['2026-09']).pers, coach: Math.round(catSpendMap('2026-09').uiteten),
      regel: !!document.querySelector('#insMaand [data-inspers]') }; });
  expect(na.s).toBe('nee'); expect(na.pers).toBe(0); expect(na.regel).toBe(false);
});

test('e: op de lopende maand staat de regel zoals bij v403', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { go('ins'); insFilterZet('nu', null); const e = document.querySelector('#insMaand [data-inspers]'); return e && [+e.dataset.inspers, e.getAttribute('onclick')]; });
  expect(r).toEqual([150, 'openInsPersoonlijk()']);
});
