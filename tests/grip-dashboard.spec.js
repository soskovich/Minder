/* v340: GRIP ALS KPI-DASHBOARD, MET DE MAAND IN DE TIJD.
   De stand van de gebruiker op 4 oktober 2026 (de fixture van maand-afsluiting.spec.js): EUR 37 in de
   reserveringspot tegen een boete van EUR 299 in november, de buffer boven zijn norm, een doel, en twee
   bezittingen die groeien. Het logboek van september is beantwoord, september is nog niet afgesloten.
   Grip heeft drie blokken (tegels, Deze maand, Komende 3 maanden) en een link naar het logboek; de
   maandafsluiting is een pop-up. */
const { test, expect } = require('@playwright/test');
const { boot, seed, RES, MAIN } = require('./bezit-koppeling.fixture');
const { pinDatum } = require('./vaste-dag');
const { LOG } = require('./grip-stand');

const SETX = (extra) => Object.assign({ budgetMonth: '2026-10', budgets: { boodschappen: 500, huur: 900, abonnement: 30 }, valtOpLog: LOG, maandGelezen: '2026-10-03' }, extra || {});
async function stand(page, extra, o) {
  return boot(page, Object.assign({ dag: '2026-10-04', set: SETX(extra) }, o || {}));
}
/* Een boot die de opslag maar een keer vult, zodat een herlaadbeurt een tweede keer OPENEN is en geen
   nieuwe stand. De klok kan tussendoor naar een andere dag. */
async function bootBlijvend(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, o.dag);
  await page.addInitScript((d) => { if (!localStorage.getItem('minder_tx')) for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof renderMaand === 'function' && typeof TX !== 'undefined');
}
async function heropen(page, dag) { await pinDatum(page, dag); await page.reload(); await page.waitForFunction(() => typeof TX !== 'undefined' && TX.length > 0); }
const popupOpen = (page) => page.evaluate(() => !!document.getElementById('afsluitSheet') && $('#sheetBg').classList.contains('show'));
const grip = (page) => page.evaluate(() => {
  const s = document.getElementById('s-maand');
  return { tegels: [...s.querySelectorAll('[data-tegel]')].map((e) => ({ key: e.dataset.tegel, kleur: e.dataset.kleur, tekst: e.innerText.replace(/\s+/g, ' ').trim() })),
    blokken: [...s.children].filter((c) => c.id && c.offsetHeight > 0).map((c) => c.id),
    tekst: s.innerText.replace(/\s+/g, ' ') };
});
const OKT = [
  { id: 'o1', date: '2026-10-05', amount: -40, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' },
  { id: 'o2', date: '2026-10-25', amount: 3000, name: 'Werkgever', desc: 'SALARIS LOON' },
];

test('a. de stand op 4 oktober: vier tegels, amber eerst, beleggen grijs en wachtend op de reserveringen', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => { closeSheet(); go('maand'); });
  const g = await grip(page);
  expect(g.tegels.map((t) => t.key)).toEqual(['dekking', 'buffer', 'doel', 'beleggen']);
  expect(g.tegels.map((t) => t.kleur)).toEqual(['amber', 'groen', 'groen', 'grijs']);
  expect(g.tegels[0].tekst).toBe('Reserveringen €37 €299 nodig in november');
  expect(g.tegels[1].tekst).toContain('je norm: 2');
  expect(g.tegels[3].tekst).toBe('Beleggen wacht op je reserveringen');
  // de kleur komt uit de bestaande status, er is geen nieuw oordeel
  const st = await page.evaluate(() => { const R = maandMetAfspraak(maandMetAccept(maandRegels())); return Object.fromEntries(R.map((r) => [r.key, r.status])); });
  expect(st).toMatchObject({ dekking: 'let op', buffer: 'ok', doel: 'ok' });
});

test('b. drie blokken en een link: wat van Grip verdween staat er niet meer', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => { closeSheet(); go('maand'); });
  const g = await grip(page);
  expect(g.blokken).toEqual(['gripTegels', 'gripDezeMaand', 'gripTijdlijn', 'gripNaarLogboek']);
  for (const weg of ['Vraagt een beslissing', 'Vraagt aandacht', 'Staat goed', 'Voorwaarden voor beleggen', 'afsluiten', 'Wat je met overschrijdingen deed', 'Er is niets dat vastloopt', 'Vanaf november'])
    expect(g.tekst.toUpperCase()).not.toContain(weg.toUpperCase());
  const ids = await page.evaluate(() => ['afsluitKaart', 'afgeslotenRegel', 'valtOpGrip', 'afsprakenKaart'].filter((i) => document.querySelector('#s-maand #' + i)));
  expect(ids).toEqual([]);
  expect(g.tekst).toContain('Logboek ›');
});

test('c. een rode beslissing staat linksboven, ook als zijn regel normaal later komt', async ({ page }) => {
  await stand(page, { goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-01' }] });
  await page.evaluate(() => { closeSheet(); go('maand'); });
  const g = await grip(page);
  expect(g.tegels[0]).toMatchObject({ key: 'doel', kleur: 'rood' });
  expect(g.tegels[0].tekst).toContain('Kosten Koper');
  expect(g.tegels.map((t) => t.kleur)).toEqual(['rood', 'amber', 'groen', 'grijs']);
  // linksboven: de eerste cel van het raster
  const pos = await page.evaluate(() => { const T = [...document.querySelectorAll('#gripTegels [data-tegel]')].map((e) => e.getBoundingClientRect()); return { x0: T[0].left, y0: T[0].top, x1: T[1].left, y2: T[2].top }; });
  expect(pos.x0).toBeLessThan(pos.x1);
  expect(pos.y2).toBeGreaterThan(pos.y0);
});

test('d. een tik op een tegel opent de bestaande sheet met uitleg, afspraak en handeling', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => { closeSheet(); go('maand'); });
  await page.waitForTimeout(400);
  await page.click('[data-tegel="dekking"]');
  const t = await page.evaluate(() => $('#sheet').innerText.replace(/\s+/g, ' '));
  expect(t).toContain('Dekking reserveringen');
  expect(t).toContain('€131 per maand tot november');
  expect(t).toContain('Ik stort €131 per maand tot november');
  expect(t).toContain('voorwaarden voor beleggen');           // de samenhang die een eigen kaart was
  await page.evaluate(() => { closeSheet(); });
  await page.waitForTimeout(400);
  await page.click('[data-tegel="beleggen"]');
  expect(await page.evaluate(() => $('#sheet').innerText)).toContain('Voorwaarden voor beleggen');
});

/* Een vaste last NA vandaag (dag 12) in de drie maanden ervoor: die staat in "vast nog" en mag niet nog
   eens in wat er gemiddeld bijkomt tellen. De huur valt op dag 2 en kan dat per constructie niet laten zien. */
const NETFLIX = ['2026-06', '2026-07', '2026-08', '2026-09'].map((m, i) => ({ id: 'n' + i, date: m + '-12', amount: -15.99, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' }));
test('e. Deze maand: de vooruitblik met de lopende afspraak, en een tik opent de waterval', async ({ page }) => {
  await stand(page, null, { extraTx: NETFLIX });
  await page.evaluate(() => { closeSheet(); openMaandBeslis('dekking'); afspraakDekkingZet(); go('maand'); });
  const r = await page.evaluate(() => { const V = maandVooruit(); const k = document.getElementById('gripDezeMaand');
    return { V: { uit: V.uit, vast: V.vast, rest: V.rest, projectie: V.projectie, band: V.band, budget: V.budget, huur: V.restCat.huur || 0, ah: V.restCat.boodschappen || 0 }, tekst: k.innerText.replace(/\s+/g, ' '), afspraak: k.querySelectorAll('[data-afspraak]').length }; });
  expect(r.V.projectie).toBe(r.V.uit + r.V.vast + r.V.rest);
  // de huur is een vaste last en staat al in "vast nog": hij telt niet nog eens mee in wat er gemiddeld bijkomt
  expect(r.V.vast).toBeGreaterThanOrEqual(900);
  expect(r.V.huur).toBe(0);
  // invoermeting: Netflix is een herkende vaste last van na vandaag, en telt niet mee in wat er bijkomt
  const nf = await page.evaluate(() => ({ vast: TX.filter((t) => t.name === 'Netflix').every((t) => isFixed(t)), rest: maandVooruit().restCat.abonnement || 0, dag: daysElapsed(thisYM()).elapsed }));
  expect(nf.vast).toBe(true);
  expect(nf.dag).toBeLessThan(12);
  expect(nf.rest).toBe(0);
  // en de boodschappen na dag 4 (300 op dag 5 in elke maand) wel
  expect(r.V.ah).toBe(300);
  expect(r.V.band.min).toBeLessThanOrEqual(r.V.projectie);
  expect(r.V.band.max).toBeGreaterThanOrEqual(r.V.projectie);
  expect(r.V.band.maanden).toEqual(['2026-07', '2026-08', '2026-09']);
  // v349: de kaart draagt de uitkomst met het verschil met je budget, en de bridge eronder (deze-maand-bridge.spec.js)
  expect(r.tekst).toContain(`€${r.V.projectie.toLocaleString('nl-NL')} · €${(r.V.budget - r.V.projectie).toLocaleString('nl-NL')} onder budget`);
  expect(r.tekst).toContain('€131 per maand naar je reserveringen tot november');
  expect(r.afspraak).toBe(1);
  await page.evaluate(() => openGripVooruit());
  const w = await page.evaluate(() => { const g = document.getElementById('gripVooruit');
    return { stappen: [...g.querySelectorAll('[data-vstap]')].map((e) => [e.dataset.vstap, +e.dataset.vwaarde]), band: g.querySelector('[data-bandtekst]').innerText }; });
  const som = w.stappen.filter((s) => s[0] !== 'eind').reduce((a, s) => a + s[1], 0);
  expect(som).toBe(r.V.projectie);                           // de waterval eindigt op het getal van de kaart
  expect(w.stappen[w.stappen.length - 1]).toEqual(['eind', r.V.projectie]);
});

test('f. zonder drie afgeronde maanden geen vooruitblik, en dat staat er', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => { TX = TX.filter((t) => t.date >= '2026-08-01'); save(); closeSheet(); go('maand'); });
  const r = await page.evaluate(() => ({ V: maandVooruit().onbekend, t: document.getElementById('gripDezeMaand').innerText.replace(/\s+/g, ' ') }));
  expect(r.V).toBe(true);
  expect(r.t).toContain('laatste 3 afgeronde maanden');
  expect(r.t).not.toContain('Komt uit rond');
});

test('g. de tijdlijn draagt de boete in november en wat er vanaf november verandert', async ({ page }) => {
  await stand(page, { budgetsNext: { abonnement: 0 } });
  await page.evaluate(() => { closeSheet(); go('maand'); });
  const t = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#gripTijdlijn [data-tlmaand]')].map((e) => [e.dataset.tlmaand, [...e.querySelectorAll('.tl3-e')].map((x) => x.innerText)])));
  expect(Object.keys(t)).toEqual(['2026-10', '2026-11', '2026-12']);
  expect(t['2026-11']).toEqual(expect.arrayContaining(['Boetes cjib €299', 'Abonnementen stopt']));
});

test('h. de pop-up verschijnt op 1 november, niet opnieuw na Later op dezelfde dag, wel de dag erna', async ({ page }) => {
  await bootBlijvend(page, { dag: '2026-10-20', set: SETX({ maandGelezen: '2026-10-20', afsluitPopup: { maand: '2026-09', dag: '2026-10-20' }, maandAfsluiting: { '2026-09': { op: '2026-10-04', punten: [], afspraken: [], open: [] } } }), extraTx: OKT });
  expect(await popupOpen(page)).toBe(false);                 // september is afgesloten
  await heropen(page, '2026-11-01');
  expect(await popupOpen(page)).toBe(true);
  expect(await page.evaluate(() => document.getElementById('afsluitSheet').dataset.maand)).toBe('2026-10');
  const tegels = await page.$$eval('[data-afsluittegel]', (L) => L.map((e) => e.dataset.afsluittegel));
  expect(tegels).toEqual(['boven', 'antwoord', 'totaal']);
  await page.click('[data-afsluitlater]');
  expect(await popupOpen(page)).toBe(false);
  await heropen(page, '2026-11-01');
  expect(await popupOpen(page)).toBe(false);
  await page.evaluate(() => go('maand'));
  expect(await popupOpen(page)).toBe(false);
  await heropen(page, '2026-11-02');
  expect(await popupOpen(page)).toBe(true);
});

test('i. na afsluiten verschijnt de pop-up nooit meer voor oktober, en oktober staat in het logboek', async ({ page }) => {
  await bootBlijvend(page, { dag: '2026-11-01', set: SETX({ maandGelezen: '2026-10-20', maandAfsluiting: { '2026-09': { op: '2026-10-04', punten: [], afspraken: [], open: [] } } }), extraTx: OKT });
  expect(await popupOpen(page)).toBe(true);
  await page.evaluate(() => maandAfsluiten('2026-10', true));
  expect(await popupOpen(page)).toBe(false);
  for (const dag of ['2026-11-01', '2026-11-02', '2026-11-29']) {
    await heropen(page, dag);
    expect(await popupOpen(page)).toBe(false);
    // ook geen stille poging: de sheet zou zichzelf sluiten, dus wat telt is dat er niets wordt geschreven
    expect(await page.evaluate(() => SET.afsluitPopup.dag)).toBe('2026-11-01');
    await page.evaluate(() => go('maand'));
    expect(await popupOpen(page)).toBe(false);
  }
  await page.evaluate(() => go('logboek'));
  const l = await page.evaluate(() => ({ maanden: [...document.querySelectorAll('[data-logmaand]')].map((e) => e.dataset.logmaand), open: !!document.querySelector('[data-logopen]') }));
  expect(l.maanden).toEqual(['2026-08', '2026-09', '2026-10']);
  expect(l.open).toBe(false);
});

test('j. de eerste keer dat Grip ooit opent geeft geen pop-up, ook niet bij een tweede bezoek die dag', async ({ page }) => {
  await stand(page, { maandGelezen: undefined });
  expect(await popupOpen(page)).toBe(false);
  await page.evaluate(() => go('maand'));
  expect(await popupOpen(page)).toBe(false);
  await page.evaluate(() => { go('dash'); go('maand'); });
  expect(await popupOpen(page)).toBe(false);
  expect(await page.evaluate(() => SET.afsluitPopup.dag)).toBe('2026-10-04');
});

test('k. het logboek: de open maand als regel, en eerdere maanden tegen de huidige potjes', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => { closeSheet(); go('logboek'); });
  const l = await page.evaluate(() => ({ open: (document.querySelector('[data-logopen]') || {}).dataset, maanden: [...document.querySelectorAll('[data-logmaand]')].map((e) => [e.dataset.logmaand, e.innerText.replace(/\s+/g, ' ')]) }));
  expect(l.open.logopen).toBe('2026-09');
  expect(l.maanden.map((m) => m[0])).toEqual(['2026-06', '2026-07', '2026-08']);
  for (const m of l.maanden) expect(m[1]).toContain('tegen huidige potjes');
  await page.evaluate(() => openLogMaand('2026-08'));
  const s = await page.evaluate(() => document.getElementById('logMaand').innerText);
  expect(s).toContain('niet bewaard');
});

for (const w of [360, 390]) test(`l. hoogte van Grip op ${w}px`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: 800 });
  await stand(page);
  await page.evaluate(() => { closeSheet(); openMaandBeslis('dekking'); afspraakDekkingZet(); go('maand'); });
  const h = await page.evaluate(() => { const s = document.getElementById('s-maand'); const r = (id) => { const e = document.getElementById(id); return e ? Math.round(e.getBoundingClientRect().height) : 0; };
    return { tegels: r('gripTegels'), deze: r('gripDezeMaand'), tijd: r('gripTijdlijn'), totaal: Math.round(s.scrollHeight), over: document.documentElement.scrollWidth > window.innerWidth }; });
  /* GEMETEN bij v340 op deze stand (met de afspraak van EUR 131): de tegels 171px, Deze maand 176px op 360
     en 158px op 390, de tijdlijn 129px, en Grip 582px op 360 en 564px op 390. Op v339 was Grip op dezelfde
     stand 966px op 360 en 945px op 390.
     v349: Deze maand draagt de bridge van budget naar uitkomst en de oorzaakzin: 315px op 360 en 297px op
     390, en Grip 721px en 703px (de zin is hier een regel: geen potje komt boven uit). */
  expect(h.over).toBe(false);
  expect(h.tegels).toBe(171);
  expect(h.tijd).toBe(129);
  expect(h.deze).toBe(w === 360 ? 315 : 297);
  expect(h.totaal).toBe(w === 360 ? 721 : 703);
});

/* De handelingen. Uit eten heeft een potje van 150; in juli, augustus en september ging er na dag 4
   telkens 80 heen, en in oktober is er op dag 2 al 100 uit. Op tempo eindigt het dus op 180. */
const UIT = [
  ...['2026-07', '2026-08', '2026-09'].map((m, i) => ({ id: 'u' + i, date: m + '-20', amount: -80, name: 'Restaurant Lona', desc: 'BEA, BETAALPAS RESTAURANT LONA' })),
  { id: 'u9', date: '2026-10-02', amount: -100, name: 'Restaurant Lona', desc: 'BEA, BETAALPAS RESTAURANT LONA' },
];
const UITSET = { budgets: { boodschappen: 500, huur: 900, abonnement: 30, uiteten: 150 } };

test('m. wat je deze maand kunt doen: een grens met zijn effect in euro, en de som onderaan', async ({ page }) => {
  await stand(page, UITSET, { extraTx: UIT });
  await page.evaluate(() => { closeSheet(); go('maand'); });
  const V = await page.evaluate(() => { const V = maandVooruit(); return { h: V.handelingen, voor: V.voor.map((x) => x.k), proj: V.projectie, met: V.metGrenzen, p: V.potjes.find((x) => x.k === 'uiteten') }; });
  expect(V.p).toMatchObject({ uit: 100, rest: 80, eind: 180, bud: 150 });
  expect(V.voor).toEqual(['uiteten']);
  expect(V.h).toEqual([expect.objectContaining({ k: 'uiteten', grens: 50, effect: 30 })]);
  expect(V.met).toBe(V.proj - 30);
  const kaart = await page.evaluate(() => document.getElementById('gripDezeMaand').innerText.replace(/\s+/g, ' '));
  expect(kaart).toContain('Uit eten');
  expect(kaart).toContain('loopt voor');
  // v349: de som met de grenzen staat in de sheet en niet meer op de kaart
  expect(kaart).not.toContain('Met een grens');
  await page.evaluate(() => openGripVooruit());
  const w = await page.evaluate(() => ({ t: document.getElementById('gripVooruit').innerText.replace(/\s+/g, ' '), rood: [...document.querySelectorAll('[data-vstap="potje"]')].length }));
  expect(w.t).toContain('Uit eten & café: nog €50 tot 31 oktober −€30');
  expect(w.t).toContain('Grens op €50');
  expect(w.t).toContain(`Met deze grens rond €${(V.proj - 30).toLocaleString('nl-NL')}`);
});

test('n. een grens zet niets vanzelf: openen schrijft niets, bevestigen maakt een afspraak onder Deze maand', async ({ page }) => {
  await stand(page, UITSET, { extraTx: UIT });
  await page.evaluate(() => { closeSheet(); go('maand'); openGripVooruit(); });
  const voor = await page.evaluate(() => JSON.stringify(SET));
  await page.evaluate(() => openGrensRest('uiteten'));
  expect(await page.evaluate(() => JSON.stringify(SET))).toBe(voor);
  await page.click('#grensRest .btn');
  const a = await page.evaluate(() => afsprakenLopend().find((x) => x.soort === 'grens'));
  expect(a).toMatchObject({ cat: 'uiteten', bedrag: 150, van: '2026-10', tot: '2026-10' });
  const st = await page.evaluate((id) => afspraakStand(afsprakenLijst().find((x) => x.id === id)), a.id);
  expect(st.status).toBe('loopt');
  expect(await page.evaluate(() => document.getElementById('gripDezeMaand').innerText)).toContain('Grens Uit eten & café: nog €50 tot 31 oktober');
});

test('o. een signaal zonder eigen tegel wordt een regel onder Let op, en die opent de kaart die er was', async ({ page }) => {
  await stand(page, UITSET, { extraTx: [...UIT, { id: 'u10', date: '2026-10-03', amount: -90, name: 'Restaurant Lona', desc: 'BEA, BETAALPAS RESTAURANT LONA' }] });
  await page.evaluate(() => { closeSheet(); go('maand'); });
  const L = await page.evaluate(() => [...document.querySelectorAll('#gripLetOp [data-letop]')].map((e) => [e.dataset.letop, e.innerText.replace(/\s+/g, ' ')]));
  expect(L).toEqual([['sig', 'Uit eten & café €40 boven je potje ›']]);
  // de lijst staat direct onder de tegels
  expect(await page.evaluate(() => document.getElementById('gripTegels').nextElementSibling.id)).toBe('gripLetOp');
  await page.evaluate(() => openGripLetOp('sig', valtOpSignals(thisYM())[0].id));
  const t = await page.evaluate(() => document.getElementById('gripLetOpSheet').innerText);
  expect(t).toContain('Zo laten');
  // een keuze in de kaart laat het signaal vallen, en dan sluit de sheet
  await page.evaluate(() => valtOpZoLaten(valtOpSignals(thisYM())[0] ? valtOpSignals(thisYM())[0].id : Object.keys(SET.valtOpLog).find((k) => k.startsWith('2026-10'))));
  expect(await page.evaluate(() => !!document.getElementById('gripLetOpSheet') && $('#sheetBg').classList.contains('show'))).toBe(false);
  expect(await page.evaluate(() => !!document.getElementById('gripLetOp'))).toBe(false);
});

test('p. zonder Let op-signaal staat er geen Let op', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => { closeSheet(); go('maand'); });
  expect(await page.evaluate(() => !!document.getElementById('gripLetOp'))).toBe(false);
});

test('q. een voorwaarde die niet te beoordelen is: de beleggen-tegel zegt onbekend en niet wacht', async ({ page }) => {
  await stand(page, { reserveringen: [] });
  await page.evaluate(() => { closeSheet(); go('maand'); });
  const r = await page.evaluate(() => { const B = beleggenKlaar(maandRegels()); const e = document.querySelector('[data-tegel="beleggen"]');
    return { volledig: B.volledig, tekst: e.innerText.replace(/\s+/g, ' '), kleur: e.dataset.kleur }; });
  expect(r.volledig).toBe(false);
  expect(r.tekst).toBe('Beleggen onbekend je reserveringen nog niet te beoordelen');
  expect(r.kleur).toBe('grijs');
});

/* De band gaat alleen over het deel van de maand dat nog moet komen: per afgeronde maand de uitgaven na
   dezelfde dag, en daarvan het laagste en het hoogste. Hij wordt dus smaller naarmate de maand vordert,
   en is op de laatste dag nul. De fixture verschilt per maand op dag 10 en op dag 28, zodat de breedte
   op dag 4 en op dag 25 een andere is. */
const BAND = [['2026-07', -50, -100], ['2026-08', -150, -100], ['2026-09', -100, -300]].flatMap(([m, a, b], i) => [
  { id: 'bd' + i + 'a', date: m + '-10', amount: a, name: 'Restaurant Lona', desc: 'BEA, BETAALPAS RESTAURANT LONA' },
  { id: 'bd' + i + 'b', date: m + '-28', amount: b, name: 'Restaurant Lona', desc: 'BEA, BETAALPAS RESTAURANT LONA' }]);
for (const [dag, breed] of [['2026-10-04', 250], ['2026-10-25', 200], ['2026-10-31', 0]]) {
  test(`r. de band op ${dag} is ${breed} breed: alleen het deel van de maand dat nog komt`, async ({ page }) => {
    await stand(page, UITSET, { extraTx: BAND, dag });
    const V = await page.evaluate(() => { const V = maandVooruit(); return { min: V.band.min, max: V.band.max, el: V.el, dim: V.dim, rest: V.rest }; });
    expect(V.max - V.min).toBe(breed);
    if (breed === 0) { expect(V.el).toBe(V.dim); expect(V.rest).toBe(0); }
  });
}

/* Let op toont hooguit twee regels, de belangrijkste eerst, met daaronder "nog N ›" naar de rest. */
const DRIE = [
  ...UIT,
  { id: 'u10', date: '2026-10-03', amount: -90, name: 'Restaurant Lona', desc: 'BEA, BETAALPAS RESTAURANT LONA' },
  { id: 'z1', date: '2026-10-02', amount: -140, name: 'Zalando', desc: 'BEA, BETAALPAS ZALANDO' },
  { id: 'g1', date: '2026-10-03', amount: -100, name: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT KOESTRAAT' },
];
test('s. Let op toont twee regels en "nog 1 ›", en die opent een lijst met de rest', async ({ page }) => {
  await stand(page, { budgets: { boodschappen: 500, huur: 900, abonnement: 30, uiteten: 150, shopping: 50 } }, { extraTx: DRIE });
  await page.evaluate(() => { closeSheet(); go('maand'); });
  const r = await page.evaluate(() => { const k = document.getElementById('gripLetOp');
    return { alle: window._gripLetOpL.map((x) => x.soort), rijen: [...k.querySelectorAll('[data-letop]')].map((e) => e.innerText.replace(/\s+/g, ' ')), nog: k.querySelector('[data-letopnog]') ? k.querySelector('[data-letopnog]').innerText : null }; });
  // invoermeting: er zijn er werkelijk drie, anders toetst de grens niets
  expect(r.alle).toEqual(['sig', 'sig', 'contant']);
  expect(r.rijen).toEqual(['Online shopping €90 boven je potje ›', 'Uit eten & café €40 boven je potje ›']);
  expect(r.nog).toBe('nog 1 ›');
  await page.evaluate(() => document.querySelector('[data-letopnog]').click());
  const l = await page.evaluate(() => [...document.querySelectorAll('#gripLetOpLijst [data-letop]')].map((e) => e.dataset.letop));
  expect(l).toEqual(['contant']);                         // de rest, en niet nog eens de eerste twee
  await page.evaluate(() => document.querySelector('#gripLetOpLijst [data-letop]').click());
  expect(await page.evaluate(() => document.getElementById('gripLetOpSheet').dataset.soort)).toBe('contant');
});

test('t. een tekort gaat voor een let op, en daarbinnen houdt Let op de bestaande volgorde', async ({ page }) => {
  await stand(page);
  /* geconstrueerd: een structureel signaal op tekort naast twee potjes op let op. Op deze stand staat er
     geen; wat de test vasthoudt is de sortering en niet hoe vaak dit voorkomt. */
  const L = await page.evaluate(() => gripLetOpItems([{ structureel: true, key: 'overstreak', naam: 'Maanden boven je grens', status: 'tekort' }],
    [{ id: 'a', naam: 'A', over: 90 }, { id: 'b', naam: 'B', over: 40 }], []).map((x) => x.soort + ':' + (x.key || '')));
  expect(L).toEqual(['str:overstreak', 'sig:a', 'sig:b']);
  const L2 = await page.evaluate(() => gripLetOpItems([{ structureel: true, key: 'rente-x', naam: 'Rente', status: 'let op' }],
    [{ id: 'a', naam: 'A', over: 90 }], []).map((x) => x.soort));
  expect(L2).toEqual(['str', 'sig']);
  // het geval dat de sortering onderscheidt: een let op dat in de lijst VOOR een tekort komt
  const L3 = await page.evaluate(() => gripLetOpItems([{ structureel: true, key: 'rente-x', naam: 'Rente', status: 'let op' },
    { structureel: true, key: 'overstreak', naam: 'Maanden boven je grens', status: 'tekort' }], [], []).map((x) => x.key));
  expect(L3).toEqual(['overstreak', 'rente-x']);
});
