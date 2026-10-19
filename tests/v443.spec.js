/* v443 (gevraagd door de gebruiker): (1) Inzichten opgeschoond: de kaart "Opzij · netto naar je spaarrekening" is weg, de vaste
   lasten staan weer in het overzicht van de maandkaart (Uitgegeven: vast · potjes · zonder potje; Nog te gaan: vast · in potjes),
   het tempo gaat alleen over je potjes, en per groep is uitgegeven + nog te gaan de forecast van die groep (blok 20 punt 7).
   (2) Terug te zetten begint bij de periode vóór je eerste salarisstorting; een tekort daarvoor telt nooit mee, en het deel boven
   het doel van de lopende periode lost pas af als die periode is afgesloten. (3) De woning: een vorige woning zonder bedrag ging
   voor de nieuwe (de v425-entry van Macnack zonder 'gestopt'); nu wint de woning met een bedrag, en het potje Huur staat in blok 20
   tegen de verwachte huur plus Shurgard, met een keuze in Kiezen als het lager is. GECONSTRUEERDE fixtures; de toestelgetallen
   (open EUR 1.350, termijn 01-11 EUR 300, Laten staan ±EUR 1.800, EUR 371) verifieert de gebruiker met blok 20 en 23. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const S432 = require('./v432-stand');
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
const CATH = 'NL77ABNA0599037806';

/* ---------- 1. Inzichten ---------- */
function seed1() {
  const tx = [];
  const add = (id, date, amount, name, desc, acc, refNums) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: acc === SAV ? 'Instant Savings' : 'Main', refNums: refNums || [] });
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
    add('inc-' + m, m + '-05', 3000, 'Werkgever', 'SALARIS LOON');
    add('vz-' + m, m + '-02', -140, 'Verzekeraar XYZ', 'SEPA INCASSO VERZEKERAAR XYZ');
    add('ah-' + m, m + '-04', -200, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09']) add('ah2-' + m, m + '-20', -150, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');   // later in de maand: de forecast verwacht nog potjes-uitgaven
  add('ah-okt2', '2026-10-06', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('vice-okt', '2026-10-07', -40, 'Coffeeshop', 'BEA, BETAALPAS COFFEESHOP');
  add('sv-okt', '2026-10-08', 400, 'Spaarpot', 'VAN MAIN', SAV);
  add('tk', '2026-10-01', -300, 'Nathaniel Cathalina via SEPA iDEAL/Wero', 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO ' + CATH + ' OKTOBER', MAIN, ['506417344']);
  const set = { budgetMonth: '2026-10', income: 3000, autoIncome: false, limit: 70, limitMode: 'pct',
    rules: [{ kw: 'NATHANIEL CATHALINA', cat: 'huur' }], budgets: { boodschappen: 600, verzekering: 150 },
    savingsEnds: ['4323'], manualBal: { [MAIN]: 4000, [SAV]: 2500 }, salVerdeling: { rek: SAV, opzij: 500 } };
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]),
    minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot1(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-10');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed1());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insGroepen === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}
const kaart = (page) => page.evaluate(() => {
  go('ins'); const k = document.querySelector('#insMaand');
  const leg = (key) => { const e = k.querySelector(`[data-insleg="${key}"]`); return e ? +e.dataset.v : null; };
  const BG = budgetPerGroep(maandVooruit());
  return { opzij: !!document.querySelector('#s-ins #insOpzij, #s-ins [data-insopzij]'), opzijFn: typeof insOpzijKaart,
    vast: leg('vast'), potjes: leg('potjes'), zonder: leg('zonder'), nogvast: leg('nogvast'), nogpot: leg('nogpot'),
    nogpotTik: (k.querySelector('[data-insleg="nogpot"]') || { getAttribute: () => '' }).getAttribute('onclick'),
    oud: !!k.querySelector('[data-insvast], [data-insniettempo], [data-inswoning]'), txt: k.innerText.replace(/\s+/g, ' '),
    tempoRegel: (k.querySelector('[data-instempopotjes]') || {}).innerText || '', tempoTxt: !!k.querySelector('[data-instempotxt]'),
    fcVast: BG.vast.v, fcPot: BG.potjes.v + BG.zonder.v, S: insMaandStand(),
    diag: diagMaandBudget(maandVooruit(), true, null).join('\n') };
});

test('1a. de kaart "Opzij · netto naar je spaarrekening" staat niet meer op Inzichten', async ({ page }) => {
  await boot1(page);
  const r = await kaart(page);
  expect(r.opzij).toBe(false);
  expect(r.opzijFn).toBe('undefined');
  expect(r.txt).not.toContain('netto naar je spaarrekening');
  expect(r.diag).toMatch(/CONTROLE Inzichten draagt geen opzij-kaart \(v443\): klopt/);
});

test('1b. vast staat weer in het overzicht; de losse vaste-lastenregel is weg; tempo alleen over potjes', async ({ page }) => {
  await boot1(page);
  const r = await kaart(page);
  expect(r.vast).toBe(440);                  // verzekering 140 + de huur-Tikkie 300 (de woning is vast)
  expect(r.potjes).toBeGreaterThan(0);
  expect(r.zonder).toBe(40);
  expect(r.nogvast).toBeNull();              // alles vast is deze maand al betaald: een rij op nul staat er niet (nogvast 0)
  expect(r.nogpot).toBeGreaterThan(0);
  expect(r.oud).toBe(false);                 // geen "vaste lasten · op hun eigen datum", geen woningregel, geen "telt niet mee"
  expect(r.txt).not.toContain('op hun eigen datum');
  expect(r.tempoRegel).toBe('tempo gaat alleen over je potjes');
  expect(r.tempoTxt).toBe(true);             // "EUR X onder/boven tempo" blijft, over de potjes
  expect(r.nogpotTik).toBe("openInsTegel('potjes',1)");   // de forecast-vorm van de potjes-sheet
});

test('1c. per groep: uitgegeven + nog te gaan = forecast van die groep (blok 20 punt 7)', async ({ page }) => {
  await boot1(page);
  const r = await kaart(page);
  expect(r.vast + (r.nogvast || 0)).toBe(r.fcVast);
  expect(r.potjes + r.zonder + r.nogpot).toBe(r.fcPot);
  expect(r.diag).toMatch(/CONTROLE Inzichten vast: .* → klopt/);
  expect(r.diag).toMatch(/CONTROLE Inzichten potjes \(met zonder potje\): .* → klopt/);
});

test('1d. "in potjes" opent een sheet die optelt tot het getal waarop je tikte (de forecast-rest)', async ({ page }) => {
  await boot1(page);
  await page.evaluate(() => go('ins'));
  const v = +(await page.locator('#insMaand [data-insleg="nogpot"]').getAttribute('data-v'));
  await page.locator('#insMaand [data-insleg="nogpot"]').click();
  const s = await page.locator('#insTegelSheet[data-instegelsheet="potjes"]').evaluate((e) => ({ fc: e.dataset.insfc, w: +e.dataset.inswaarde, som: [...e.querySelectorAll('[data-insrij]')].reduce((a, x) => a + +x.dataset.insrij, 0) }));
  expect(s.fc).toBe('1');
  expect(s.w).toBe(v);
  expect(s.som).toBe(v);
  await page.evaluate(() => { closeSheet(); openInsTegel('potjes'); });   // de oude ingang (zonder forecast-vlag) blijft de stand van maandSplitsing
  expect(await page.locator('#insTegelSheet').getAttribute('data-insfc')).toBeNull();
});

/* ---------- 2. Terug te zetten: het startpunt ---------- */
function seed2(o = {}) {
  const tx = [];
  const add = (id, date, amount, name, desc, acc) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: acc === SAV ? 'Instant Savings' : 'Main', refNums: [] });
  for (const m of ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add('ah-' + m, m + '-04', -200, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('sal-sep', '2026-09-24', 5216, 'SKF', 'SALARIS SKF');                       // de eerste salarisstorting
  if (o.okt) add('sal-okt', '2026-10-26', 5216, 'SKF', 'SALARIS SKF');            // de volgende (za 24-10 → ma 26-10)
  add('ont-jul', '2026-08-05', -800, 'Spaarpot', 'VAN SPAREN', SAV);              // VÓÓR het startpunt (periode jul): telt nooit mee
  add('ont-aug', '2026-09-05', -1350, 'Spaarpot', 'VAN SPAREN', SAV);             // periode 24 aug – 23 sep: tekort 1350
  add('in-sep', '2026-10-01', 2231, 'Spaarpot', 'NAAR SPAREN', SAV);              // periode 24 sep – 25 okt: 465 boven het doel
  const set = { budgetMonth: '2026-10', income: 5216, autoIncome: false, limit: 70, limitMode: 'pct', budgets: { boodschappen: 600 },
    savingsEnds: ['4323'], manualBal: { [MAIN]: 4000, [SAV]: 2500 }, salVerdeling: { rek: SAV, opzij: 1766 } };
  return { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]),
    minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot2(page, dag, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, dag);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed2(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof opzijInhalen === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}

test('2a. het grootboek begint bij de periode vóór de eerste salarisstorting: open EUR 1.350, niet EUR 2.150', async ({ page }) => {
  await boot2(page, '2026-10-19');
  const r = await page.evaluate(() => { const I = opzijInhalen(), P = salPeriode(); return { I, cur: [P.cur.start, P.cur.eind], diag: diagMaandBudget(maandVooruit(), true, null).join('\n') }; });
  expect(r.cur).toEqual(['2026-09-24', '2026-10-25']);
  expect(r.I.startYm).toBe('2026-08');
  expect(r.I.grootboekStart).toBe('2026-08-24');
  expect(r.I.periodes.map((p) => p.ym)).toEqual(['2026-08']);   // juli staat er nooit in
  expect(r.I.onttrokkenTot).toBe(1350);
  expect(r.I.open).toBe(1350);
  expect(r.diag).toMatch(/startpunt \(v443\): de periode vóór je eerste salarisstorting, aug 2026 \(vanaf 2026-08-24\)/);
});

test('2b. het deel boven het doel lost pas af bij het afsluiten van de lopende periode: dan EUR 885 open', async ({ page }) => {
  await boot2(page, '2026-10-27', { okt: true });
  const I = await page.evaluate(() => opzijInhalen());
  const aug = I.periodes.find((p) => p.ym === '2026-08');
  expect(I.overschotTot).toBe(465);           // 2231 − 1766
  expect(aug.teruggezet).toBe(465);
  expect(I.open).toBe(885);
  expect(I.periodes.map((p) => p.ym)).not.toContain('2026-07');
});

/* ---------- 3. De woning in blok 20 en 23 ---------- */
async function boot3(page, o = {}) {
  await S432.boot(page, { dag: '2026-10-19' });
  return await page.evaluate(({ CATH, o, LEEF }) => {
        const add = (t) => { categorize(t); TX.push(t); };
    // Macnack: de vorige woning, door v425 gezaaid ZONDER 'gestopt' en zonder bedrag (het zaad vuurde daarna niet meer)
    add({ id: 'mac1', date: '2026-07-01', amount: -650, acc: LEEF, name: 'Ml Macnack', desc: 'OVERBOEKING ML MACNACK HUUR JULI', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    for (const d of ['2026-09-01', '2026-10-01']) add({ id: 'ca' + d, date: d, amount: -300, acc: LEEF, name: 'Nathaniel Cathalina via SEPA iDEAL/Wero', desc: 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO ' + CATH + ' ' + d, typ: '', ref: '', src: 'csv', accName: '', refNums: ['r' + d.replace(/-/g, '')] });
    const mk = 'woning|' + recurKey(TX.find((t) => t.name === 'Ml Macnack'));
    SET.kennis = SET.kennis || {}; SET.kennis[mk] = { soort: 'woning', partij: 'Ml Macnack', wat: 'Woonhuur (gestopt)', ja: true, tx: [], bron: 'jij', op: '2026-06-01', zaad: 'macnack' };
    SET.kennis425 = Object.assign(SET.kennis425 || {}, { macnack: '2026-06-01' }, o.zonderMigratie ? { macnack443: '2026-06-01' } : {});
    SET.budgets = Object.assign({}, SET.budgets, { huur: o.huurBud != null ? o.huurBud : 300 });
    kennisZaai(); save(); try { buildAccMeta(); } catch (_) {}
    const WF = woningForecast(nextYM(thisYM())), P = rekVoorstel();
    const won = [...(P.vast || []), ...(P.vastBuiten || [])].find((x) => x.woning || /Cathalina/i.test(x.naam));
    const H = huurPotjeTegen();
    const C = gripCyclusLees();
    return { key: kennisWoningKey(), macGestopt: (SET.kennis[mk] || {}).gestopt || null, WF, wonData: won ? won.data : null, wonTermijn: won ? won.termijn : null,
      H, kies: C.kies.filter((x) => x.id === 'huurpotje').map((x) => ({ naam: x.naam, reden: x.reden, act: x.act })),
      b20: diagMaandBudget(maandVooruit(), true, null).join('\n'), b23: diagRekVerdeling().join('\n') };
  }, { CATH, o, LEEF: S432.LEEF });
}

test('3a. de woning met een bedrag wint van een vorige woning zonder bedrag (kennisWoningKey)', async ({ page }) => {
  const r = await boot3(page, { zonderMigratie: true });   // de migratie draait niet: alleen de regel in kennisWoningKey telt
  expect(r.macGestopt).toBeNull();
  expect(r.key).toBe('599037806');
  expect(r.WF.actief).toBe(true);
  expect(r.WF.bedrag).toBe(300);
  expect(r.b20).not.toContain('geen actieve woning in de kennislaag');
  expect(r.b20).toMatch(/de woning \(Nathaniel Cathalina, €\s?300 huur\)/);
});

test('3b. de v425-Macnack krijgt een keer zijn einde (wat v440 bedoelde)', async ({ page }) => {
  const r = await boot3(page);
  expect(r.macGestopt).toBe('2026-08');
  expect(r.key).toBe('599037806');
});

test('3c. blok 23: de huur als termijn op 1 november, 300', async ({ page }) => {
  const r = await boot3(page);
  expect(r.wonTermijn).toBe(300);
  expect(r.wonData).toContain('2026-11-01');
  expect(r.b23).toMatch(/Cathalina/);
});

test('3d. het potje Huur tegen de verwachte huur: in blok 20, en een keuze in Kiezen als het lager is', async ({ page }) => {
  const r = await boot3(page, { huurBud: 300 });
  expect(r.H.posten.some((x) => x.woning && x.bedrag === 300)).toBe(true);
  expect(r.H.verwacht).toBeGreaterThan(300);           // de huur plus de andere vaste posten in Huur (Shurgard in de stand)
  expect(r.H.tekort).toBe(r.H.verwacht - 300);
  expect(r.b20).toMatch(/potje Huur vanaf 1 november: €\s?300 tegen verwacht/);
  expect(r.b20).toMatch(/te laag, voorstel in Kiezen: potje Huur verhogen vanaf 1 november/);
  expect(r.kies).toHaveLength(1);
  expect(r.kies[0].naam).toBe('Potje Huur verhogen vanaf 1 november');
  expect(r.kies[0].act).toBe('openHuurVerhogen()');
});

test('3e. niets stil: het budget blijft staan, en een potje dat genoeg is geeft geen keuze', async ({ page }) => {
  const r = await boot3(page, { huurBud: 2000 });
  expect(r.H.tekort).toBe(0);
  expect(r.kies).toHaveLength(0);
  expect(r.b20).toMatch(/potje Huur vanaf 1 november: €\s?2\.000 tegen verwacht .* → past/);
  const b = await page.evaluate(() => { const v = SET.budgets.huur; openHuurVerhogen(); closeSheet(); return [v, SET.budgets.huur]; });
  expect(b[0]).toBe(b[1]);
});
