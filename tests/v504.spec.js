/* v504: de voorbeeldweergave simuleert ook je verdeling, een saldo uit het verleden zegt dat, en een onbetaalde termijn verdwijnt niet
   stil. Fixture v504-stand (echte dag 31 okt, saldi van 31 okt, verdeling 150 / 1.600 / 1.700 / opzij 1.766). */
const { test, expect } = require('@playwright/test');
const S = require('./v504-stand');
const ACC = { MAIN: S.MAIN, BET: S.BET, LEEF: S.LEEF, SPAAR: S.SPAAR };

async function voorbeeld(page) {
  await S.boot(page);
  await page.evaluate(() => { voorbeeldStart('2026-11-26'); voorbeeldSalarisZet(true); });
}

// a. Voorbeeld 26 nov, salaris erbij aan: de Betaalrekening krijgt +1.600 op 24 nov, de stand op 23 dec is saldo + 1.600 − vast − potjes.
test('v504 a: de verdeling staat op de salarisdag, en de stand tot je salaris telt hem mee', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await voorbeeld(page);
  const r = await page.evaluate(({ BET, MAIN, LEEF, SPAAR }) => {
    const op24 = acc => TX.filter(t => String(t.src) === 'voorbeeld' && t.acc === acc && t.date === '2026-11-24' && String(t.id).startsWith('vb:vd:')).reduce((a, t) => a + t.amount, 0);
    const D = totSalarisData(BET);
    return { bet: op24(BET), leef: op24(LEEF), spaar: op24(SPAAR), main: op24(MAIN), ruw: D.sim.ruw, sim: D.sim.salVerd, vast: D.vastExact, pot: D.potExact, kas: D.kasExact, eind: D.eindExact, eindDag: D.eindDag };
  }, ACC);
  expect(r.bet).toBe(1600);
  expect(r.leef).toBe(1700);
  expect(r.spaar).toBe(1766);
  expect(r.main).toBe(-(1600 + 1700 + 1766));
  expect(r.ruw).toBe(799);
  expect(r.sim).toBe(1600);
  expect(r.eindDag).toBe('2026-12-23');
  expect(Math.round(r.eind * 100)).toBe(Math.round((799 + 1600 - r.vast - r.pot - r.kas) * 100));
  expect(Math.round(r.vast)).toBe(537);
});

// b. De gesimuleerde overboekingen tellen niet als uitgave en niet als inkomen.
test('v504 b: de verdeling is geen uitgave en geen inkomen', async ({ page }) => {
  await voorbeeld(page);
  const r = await page.evaluate(() => {
    const T1 = totals('2026-11'), I1 = maandInkomen('2026-11');
    const vd = TX.filter(t => String(t.id).startsWith('vb:vd:'));
    const keep = TX; TX = TX.filter(t => !String(t.id).startsWith('vb:vd:')); runMemoVergeten(); _dataGen++;
    const T0 = totals('2026-11'), I0 = maandInkomen('2026-11');
    TX = keep; runMemoVergeten(); _dataGen++;
    return { n: vd.length, cats: [...new Set(vd.map(t => (CATS[catOf(t)] || {}).type))], spend: [T1.spend, T0.spend], norm: [T1.spendNorm, T0.spendNorm], inc: [T1.incomeAlles, T0.incomeAlles], alles: [I1.alles, I0.alles] };
  });
  expect(r.n).toBe(6);
  expect(r.cats).toEqual(['internal']);
  expect(r.spend[0]).toBe(r.spend[1]);
  expect(r.norm[0]).toBe(r.norm[1]);
  expect(r.inc[0]).toBe(r.inc[1]);
  expect(r.alles[0]).toBe(r.alles[1]);
});

// c. Na "terug naar vandaag" zijn er geen vb:-boekingen meer; de balk noemde de verdeling.
test('v504 c: terug naar vandaag wist salaris en verdeling', async ({ page }) => {
  await voorbeeld(page);
  const r = await page.evaluate(() => {
    const balk = document.getElementById('voorbeeldBalk').innerText;
    const voor = TX.filter(t => String(t.id).startsWith('vb:')).length;
    voorbeeldStop();
    return { balk, voor, na: TX.filter(t => String(t.id).startsWith('vb:') || String(t.src) === 'voorbeeld').length, ovr: Object.keys(OVR).filter(k => k.startsWith('vb:')).length };
  });
  expect(r.balk).toContain('met verwacht salaris, je verdeling en vaste lasten');
  expect(r.voor).toBeGreaterThan(6);
  expect(r.na).toBe(0);
  expect(r.ovr).toBe(0);
});

// d. De sheet zegt dat het saldo van de laatste import is, en in het voorbeeld de simulatie als eigen regel.
test('v504 d: de sheet noemt laatste import 31 okt en de simulatie', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await voorbeeld(page);
  const r = await page.evaluate(({ BET }) => {
    openTotSalaris(BET);
    const el = document.getElementById('totSalaris');
    return { saldo: el.querySelector('[data-totsaldo]').innerText, sim: (el.querySelector('[data-totsim]') || {}).innerText || '', simCent: (el.querySelector('[data-totsim]') || { dataset: {} }).dataset.totsim };
  }, ACC);
  expect(r.saldo).toContain('laatste import 31 okt');
  expect(r.saldo).toContain('€799');
  expect(r.sim).toContain('gesimuleerd salaris en verdeling');
  expect(r.simCent).toBe('160000');
  // buiten het voorbeeld: dezelfde datum, geen simulatieregel
  const r2 = await page.evaluate(({ BET }) => { voorbeeldStop(); return { herk: saldoHerkomst(BET) }; }, ACC);
  expect(r2.herk).toBe('');   // vandaag is 31 okt: het saldo is van vandaag
});

// e. Een termijn 8 dagen over tijd zonder boeking: één melding met drie keuzes, niets voorgekozen; "nog niet" houdt hem verwacht.
test('v504 e: een onbetaalde termijn geeft één melding, en nog niet houdt hem verwacht', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-04', oktNa: false });   // de oktobertermijn: 24 okt salaris + 3 = 27 okt; 27 + 8 = 4 nov
  const r = await page.evaluate(() => {
    const N = scoreNotifs().filter(n => n.onbetaald);
    openNotifs(); const groep = !!document.querySelector('[data-notifgroep="rekgeld"]');
    const W = () => rekVoorstel().vastAlle.find(x => x.woning), fw = () => { const w = W(); const a = w.genW(rekDag(vandaagYMD(), 1), rekDag(vandaagYMD(), 30)); return Object.values(a.orig || {}); };
    const voor = fw();
    openOnbetaald(N[0] && N[0].key.replace(/^onbetaald-/, '').split('|').slice(0, 2).join('|'), '2026-10-27');
    const knoppen = [...document.querySelectorAll('[data-onbetkeuze]')].map(b => ({ k: b.dataset.onbetkeuze, cls: b.className }));
    document.querySelector('[data-onbetkeuze="nognie"]').click();
    const na = fw(), N2 = scoreNotifs().filter(n => n.onbetaald).length;
    return { n: N.length, l1: N[0] && N[0].l1, l2: N[0] && N[0].l2, groep, voor, knoppen, na, N2 };
  });
  expect(r.n).toBe(1);
  expect(r.l1).toBe('Huur Nathaniel Cathalina van 27 okt nog niet gezien · €300');
  expect(r.l2).toBe('al betaald? / nog niet / niet meer');
  expect(r.groep).toBe(true);
  expect(r.voor).not.toContain('2026-10-27');   // zonder antwoord valt hij na de tolerantie af (v503)
  expect(r.knoppen.map(x => x.k)).toEqual(['betaald', 'nognie', 'nietmeer']);
  expect(new Set(r.knoppen.map(x => x.cls))).toEqual(new Set(['btn sec']));   // niets voorgekozen
  expect(r.na).toContain('2026-10-27');         // nog niet: weer verwacht, tot de volgende termijn
  expect(r.N2).toBe(0);
});

// e2. Al betaald wijst een boeking aan (of contant/elders); daarna geen melding en niet verwacht. Niet meer opent de stop-keuze.
test('v504 e2: al betaald en niet meer', async ({ page }) => {
  await S.boot(page, { dag: '2026-11-04', oktNa: false });
  const r = await page.evaluate(() => {
    const key = vastOnbetaaldLijst()[0].key;
    openOnbetaald(key, '2026-10-27'); document.querySelector('[data-onbetkeuze="betaald"]').click();
    const kandidaten = document.querySelectorAll('[data-onbetkandidaat]').length, elders = !!document.querySelector('[data-onbetelders]');
    document.querySelector('[data-onbetelders]').click();
    const na = vastOnbetaaldLijst().length, K = vastOnbetaaldKeuze(key, '2026-10-27');
    delete SET.vastOnbetaald; save(); window._rekV = null;
    openOnbetaald(key, '2026-10-27'); document.querySelector('[data-onbetkeuze="nietmeer"]').click();
    const stop = !!document.querySelector('[data-woningstop]'), gestoptVoor = !!(kennisGet(key) || {}).gestopt;
    return { kandidaten, elders, na, K: K && K.keuze, stop, gestoptVoor };
  });
  expect(r.kandidaten).toBeGreaterThan(0);
  expect(r.elders).toBe(true);
  expect(r.K).toBe('elders');
  expect(r.na).toBe(0);
  expect(r.stop).toBe(true);
  expect(r.gestoptVoor).toBe(false);   // openen schrijft niets
});
