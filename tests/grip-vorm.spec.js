/* v314 ronde A: de vorm van Grip en de kleine logica eromheen.
 *
 * v340: GRIP IS EEN DASHBOARD. De samenvatting, 'Staat goed', de beleggen-kaart en de hoogtes van
 * v314 zijn met die kaarten vervallen (zie grip-dashboard.spec.js); wat hier blijft is de volgorde van
 * de handelingen op de valt-op-kaart (nu in de sheet achter 'Let op'), zo laten, de maatstaf op de
 * tegels, de afspraak onder Deze maand, de tegel Beleggen en de potjes-wijziging in de tijdlijn.
 *
 * ZES DINGEN, EN ZE RAKEN ELKAAR VIA DE SAMENVATTING: die telt sinds deze ronde de
 * potje-overschrijdingen mee, en daarmee is het aantal signalen een invoer van het oordeel geworden.
 * Daarom meet elk blok eerst zijn eigen INVOER (hoeveel signalen, welke statussen, hoeveel dagen de
 * maand nog heeft) voordat het de uitkomst toetst: zonder die meting is 'de zin telt het potje mee'
 * niet te onderscheiden van 'de fixture heeft geen potje' (meetles a en o).
 *
 * DE FIXTURE PINT ZIJN DAG, want de volgorde van de handelingen HANGT aan de dag van de maand en
 * het dagwoord in de grens-knop ook (v299/v306/v310). `pinDag(page)` laat DAGEN_OVER dagen over en
 * `pinDag(page, 2)` zet de laatste dagen; de datums in `TX` komen uit `vasteDatum()`, zodat de dag
 * aan beide kanten dezelfde is.
 *
 * NORM EN RICHT LOPEN IN DE FIXTURE UITEEN (norm 2, richt 3), en dat is geen willekeur: de
 * linker-sub van de bufferrij leest de NORM en de rechterkolom de RICHT, en met twee gelijke
 * getallen is 'hij leest de norm' niet van 'hij leest de richt' te onderscheiden. Om dezelfde reden
 * staat de potstand (500) los van de eerstvolgende post (299) EN van de opbouw-eis (249): het getal
 * dat de rij afdrukt is 500 min 299, en met een fixture waarin die twee samenvallen meet de
 * assertie niets.
 */
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum, DAGEN_OVER } = require('./vaste-dag');
const { kaalBron, kaalUit } = require('./bron-kaal');
const fs = require('fs');
const path = require('path');

const MAIN = 'NL01MAIN0000001111';
const SAV  = 'NL01SAVE0000004323';
const RES  = 'NL01RESV0000007788';
const NU   = vasteDatum(DAGEN_OVER);
const ym   = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS   = [4, 3, 2, 1, 0].map((k) => ym(new Date(NU.getFullYear(), NU.getMonth() - k, 1)));
const THIS = MS[MS.length - 1];
const PLUS = (n) => ym(new Date(NU.getFullYear(), NU.getMonth() + n, 1));

// de getallen van de fixture, zodat een assertie ze bij naam noemt en niet herberekent
const POTJE = 400, UITGEGEVEN = 484, OVER = 84;
const POTSTAND = 500, POST = 299, BLIJFT = POTSTAND - POST;   // 201
const NORM = 2, RICHT = 3;
const DOELBEDRAG = 10000;

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m) => {
    add(m, '03', 4000, 'Werkgever', 'SALARIS LOON');
    add(m, '04', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '05', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '06', 600, 'Spaarpot', 'NAAR SPAREN', SAV);
    add(m, '06', 40, 'Reservering', 'NAAR RESERVERING', RES);
  });
  // de overschrijding van deze maand: boodschappen 484 van 400
  add(THIS, '07', -(UITGEGEVEN - 300), 'Jumbo', 'BEA, BETAALPAS JUMBO');
  (o.extra || []).forEach((t) => add(THIS, t.d, t.a, t.n, t.ds));
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4000, limit: 70,
    bufferNorm: NORM, nfMaanden: RICHT, nfToegewezen: 4000, nfDoelVast: 4000,
    savingsEnds: ['4323'], resAcc: RES,
    manualBal: { [MAIN]: 3000, [SAV]: 6000, [RES]: POTSTAND },
    budgets: { huur: 900, boodschappen: POTJE },
    budgetsNext: { huur: 900, boodschappen: POTJE, sport: 50 },
    budgetMonth: THIS,
    reserveringen: [{ id: 'r1', naam: 'Waterschapsbelasting', bedrag: POST, vervalmaand: PLUS(2), intervalM: 12, cat: 'belasting' }],
    goals: [{ id: 'g1', naam: 'Kosten Koper', doel: DOELBEDRAG, gespaard: 0, streefdatum: PLUS(9), allocMode: 'auto' }],
    spaarInleg: 600,
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, o = {}) {
  await pinDag(page, o.dagen);
  await page.addInitScript((s) => { for (const k in s) localStorage.setItem(k, s[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.renderMaand === 'function');
  await page.evaluate(() => go('maand'));
}

/* v340: de valt-op-kaart staat achter de regel onder 'Let op' op Grip, in een sheet. */
async function kaart(page) {
  await page.locator('#gripLetOp [data-letop="sig"]').first().click();
  await page.locator('#gripLetOpSheet .valtop-open').waitFor();
}

const BRON = () => kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));

/* ===== a) de invoer draagt de gevallen ===== */
test('a: de invoer draagt één overschrijding, drie goede regels en zeven resterende dagen', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const R = maandRegels();
    return { dagen: valtOpDagenRest(), sig: valtOpSignals(thisYM()).map(s => ({ n: s.naam, over: s.over, uit: s.uitgegeven, potje: s.potje })),
      st: R.map(x => x.key + ':' + x.status), stru: maandStructureel().length };
  });
  expect(r.dagen).toBe(DAGEN_OVER);
  expect(r.sig.length).toBe(1);
  expect(r.sig[0]).toEqual({ n: 'Boodschappen', over: OVER, uit: UITGEGEVEN, potje: POTJE });
  // alle drie de regels op ok, zodat de ok-tak van het oordeel wordt geraakt en 'Staat goed' alle drie draagt
  expect(r.st.sort()).toEqual(['buffer:ok', 'dekking:ok', 'doel:ok']);
  expect(r.stru).toBe(0);
});

/* ===== c) de handelingen in volgorde van het moment ===== */
test('c: ruim voor het eind staat bijstellen eerst en is hij de enige primaire knop', async ({ page }) => {
  await boot(page);
  await kaart(page);
  const r = await page.evaluate(() => {
    const k = document.querySelector('.valtop-open');
    return { dagen: valtOpDagenRest(),
      labels: [...k.querySelectorAll('.valtop-hand')].map(x => x.innerText.split('\n')[0]),
      knoppen: [...k.querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), pri: !b.classList.contains('sec') })) };
  });
  expect(r.dagen).toBe(DAGEN_OVER);
  expect(r.labels).toEqual(['Potje bijstellen', 'Grens voor de rest van de maand', 'Bekijk de transacties']);
  expect(r.knoppen.filter(b => b.pri).length).toBe(1);
  expect(r.knoppen[0].pri).toBe(true);
  expect(r.labels.join(' ')).not.toContain('Volgende maand anders');
});

test('c: in de laatste dagen staat bekijken eerst, dan volgende maand, dan de grens', async ({ page }) => {
  await boot(page, { dagen: 2 });
  await kaart(page);
  const r = await page.evaluate(() => {
    const k = document.querySelector('.valtop-open');
    return { dagen: valtOpDagenRest(),
      labels: [...k.querySelectorAll('.valtop-hand')].map(x => x.innerText.split('\n')[0]),
      knoppen: [...k.querySelectorAll('button')].map(b => ({ t: b.textContent.trim(), pri: !b.classList.contains('sec') })),
      acts: [...k.querySelectorAll('button')].map(b => b.getAttribute('onclick')) };
  });
  expect(r.dagen).toBe(2);
  expect(r.labels).toEqual(['Bekijk de transacties', 'Volgende maand anders', 'Grens voor de laatste 2 dagen']);
  expect(r.knoppen.filter(b => b.pri).length).toBe(1);
  expect(r.knoppen[0].t).toBe('Bekijken');
  expect(r.knoppen[0].pri).toBe(true);
  // bijstellen staat er niet meer: op de laatste dagen absorbeert het voorstel precies de overschrijding
  expect(r.labels.join(' ')).not.toContain('Potje bijstellen');
  expect(r.acts.join(' ')).not.toContain('valtOpPotjeSheet');
  // en 'volgende maand anders' leidt naar de BESTAANDE potje-editor, die SET.budgetsNext schrijft
  expect(r.acts[1]).toContain("openPotje('boodschappen')");
});

test('c: het dagwoord in de grens-knop volgt dezelfde dagen als de regel erboven', async ({ page }) => {
  await boot(page, { dagen: 1 });
  await kaart(page);
  const r = await page.evaluate(() => {
    const k = document.querySelector('.valtop-open');
    return { dagen: valtOpDagenRest(), tekst: k.innerText,
      labels: [...k.querySelectorAll('.valtop-hand')].map(x => x.innerText.split('\n')[0]) };
  });
  expect(r.dagen).toBe(1);
  expect(r.tekst).toContain('met nog 1 dag te gaan');
  expect(r.labels[2]).toBe('Grens voor de laatste dag');
});

test('c: de grens voor de volgorde is een benoemde constante met twee lezers', async ({ page }) => {
  const bron = BRON();
  expect((bron.match(/VALTOP_LAATSTE_DAGEN/g) || []).length).toBe(2);   // declaratie + de ene lezer
  expect(bron).toContain('const VALTOP_LAATSTE_DAGEN = 3');
  // het dagwoord van de knop leest dezelfde `dagen` als de regel erboven en niet een eigen deling
  const sec = await kaalUit(page => page, 'x').catch(() => null);
  const open = bron.split('function valtOpKaartOpen')[1].split('\nfunction ')[0];
  expect((open.match(/valtOpDagenRest\(\)/g) || []).length).toBe(1);
  expect(open).not.toContain('daysElapsed');
});

test('c: op de grensdag zelf geldt de laatste-dagen-volgorde nog', async ({ page }) => {
  await boot(page, { dagen: 3 });
  await kaart(page);
  const r = await page.evaluate(() => ({ dagen: valtOpDagenRest(),
    labels: [...document.querySelectorAll('.valtop-open .valtop-hand')].map(x => x.innerText.split('\n')[0]) }));
  expect(r.dagen).toBe(3);
  expect(r.labels[0]).toBe('Bekijk de transacties');
});

test('c: één dag erboven is de andere volgorde', async ({ page }) => {
  await boot(page, { dagen: 4 });
  await kaart(page);
  const r = await page.evaluate(() => ({ dagen: valtOpDagenRest(),
    labels: [...document.querySelectorAll('.valtop-open .valtop-hand')].map(x => x.innerText.split('\n')[0]) }));
  expect(r.dagen).toBe(4);
  expect(r.labels[0]).toBe('Potje bijstellen');
});

/* ===== d) zo laten is een keuze en geen stilte ===== */
test('d: zo laten legt een eigen actie vast en haalt het signaal weg', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const voor = valtOpSignals(thisYM()).length;
    const id = valtOpSignals(thisYM())[0].id;
    valtOpZoLaten(id);
    const L = SET.valtOpLog[id];
    return { voor, na: valtOpSignals(thisYM()).length, actie: L.actie, op: L.actie_op,
      tel: valtOpTelling().n, log: (go('logboek'), document.getElementById('s-logboek').innerText) };   // v331: de log is een eigen scherm
  });
  expect(r.voor).toBe(1);
  expect(r.actie).toBe('zo_gelaten');
  expect(r.op).toBeTruthy();
  expect(r.na).toBe(0);
  expect(r.tel.zo_gelaten).toBe(1);
  expect(r.tel.geen).toBe(0);
  expect(r.log).toContain('zo gelaten');
});

test('d: zo gelaten en niets gedaan zijn twee tellers', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    // één record zo gelaten, één record uit een voorbije maand zonder actie (de stilte)
    const id = valtOpSignals(thisYM())[0].id;
    valtOpZoLaten(id);
    SET.valtOpLog['stil'] = { id: 'stil', maand: '2020-01', categorie: 'Vervoer & auto', potjeId: 'vervoer',
      potje_bij_detectie: 100, over_bij_detectie: 50, getoond: true, actie: 'geen', over_eind_maand: 50 };
    save(); renderMaand(); go('logboek');   // v331: de telregel staat in het logboek
    return { tel: valtOpTelling().n, tekst: document.getElementById('s-logboek').innerText };
  });
  expect(r.tel.zo_gelaten).toBe(1);
  expect(r.tel.geen).toBe(1);
  // de telregel houdt de twee apart en voegt ze niet samen
  expect(r.tekst).toContain('1× zo gelaten');
  expect(r.tekst).toContain('1× niets gedaan');
});

test('d: zo gelaten staat onvoorwaardelijk in de telling, de correctie niet', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({ tekst: (go('logboek'), document.getElementById('s-logboek').innerText), tel: valtOpTelling().n }));
  expect(r.tel.zo_gelaten).toBe(0);
  expect(r.tekst).toContain('0× zo gelaten');          // een nul is hier een meting
  expect(r.tekst).not.toContain('vervallen na correctie');   // een uitkomst die niet voorkwam groeit de regel niet
});

test('d: de telling kent zo_gelaten als eigen sleutel', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => Object.keys(valtOpTelling().n));
  // v315: 'volgende_maand' staat ernaast en niet erin: de lat van deze maand verzetten is iets anders
  expect(r).toEqual(['potje_bijgesteld', 'volgende_maand', 'grens_gezet', 'zo_gelaten', 'correctie', 'geen']);
});

/* ===== e) de maatstaf op de tegels ===== */
/* v340: 'Staat goed' is vervallen; de rijen staan als KPI-tegel op Grip. De sub van de buffer (de NORM)
   is de maatstaf van zijn tegel, de dekking noemt de eerstvolgende post, het doel zijn eenheid. De
   velden op de rij zijn ongewijzigd, en de fixture laat norm en richt uiteenlopen (2 tegen 3). */
test('e: de tegels dragen hun maatstaf uit hun eigen bron', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const R = maandRegels(); const by = {}; R.forEach(x => by[x.key] = x);
    const T = Object.fromEntries([...document.querySelectorAll('#gripTegels [data-tegel]')].map(e => [e.dataset.tegel, e.querySelector('.kt-maat').innerText]));
    return { subs: { buffer: by.buffer.sub, dekking: by.dekking.sub }, eenheden: { buffer: by.buffer.eenheid, dekking: by.dekking.eenheid, doel: by.doel.eenheid },
      waarden: { dekking: by.dekking.waarde }, gedektTot: dekking(12).gedektTot, benodigdeStand: by.dekking.benodigdeStand, T, sg: document.getElementById('s-maand').innerText };
  });
  expect(r.subs.buffer).toBe(`je norm: ${NORM} maanden`);
  expect(r.T.buffer).toBe(`je norm: ${NORM} maanden`);
  expect(r.T.buffer).not.toContain(String(RICHT));
  expect(r.eenheden.buffer).toContain(`je richtbedrag is ${RICHT} maanden`);
  expect(r.eenheden.buffer).not.toMatch(/je richt staat/);   // v322: het woord is afgemaakt
  expect(r.subs.dekking).toBe(`verwacht: €${POST} in ${new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(new Date(PLUS(2) + '-01'))}`);
  // v344: zonder gat zegt de tegel tot wanneer je gedekt bent, en niet wat de eerste post kost
  expect(r.T.dekking).toBe(`gedekt t/m ${new Intl.DateTimeFormat('nl-NL', { month: 'long' }).format(new Date(r.gedektTot + '-01'))}`);
  expect(r.waarden.dekking).toBe(`€${POTSTAND}`);
  expect(r.eenheden.dekking).toBe(`in je pot · €${BLIJFT} blijft over`);
  expect(r.benodigdeStand).not.toBe(POST);
  expect(r.T.doel).toBe(r.eenheden.doel);
  expect(r.T.doel).toContain('nodig');
  expect(r.sg.toUpperCase()).not.toContain('STAAT GOED');
});


test('e: de waarde van het doel is de inleg en de eenheid het benodigde, en die twee verschillen', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const d = maandDoel(); const R = maandRegels().find(x => x.key === 'doel');
    return { alloc: Math.round(d.p.alloc), benodigd: Math.round(d.T.benodigd), waarde: R.waarde, eenheid: R.eenheid };
  });
  expect(r.alloc).not.toBe(r.benodigd);   // zonder dit verschil is de omkering niet te zien
  expect(r.waarde).toBe('€' + r.alloc.toLocaleString('nl-NL'));
  expect(r.eenheid).toContain('€' + r.benodigd.toLocaleString('nl-NL') + ' nodig');
});

test('e: de compacte rij rendert de sub en de uitgeklapte rij niet', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const R = maandRegels().find(x => x.key === 'buffer');
    return { compact: maandRij(R, true), vol: maandRij(R, false) };
  });
  expect(r.compact).toContain(`je norm: ${NORM} maanden`);
  expect(r.vol).not.toContain(`je norm: ${NORM} maanden`);
});

/* ===== f) de afspraak een keer ===== */
/* v340: de afspraak uit het gesprek staat onder 'Deze maand', bij de lopende afspraken, en niet op een
   tegel. De zin "staat goed, dus deze afspraak gaat nu niet over een tekort" is met maandCoachIngang()
   vervallen. */
test('f: de afspraak staat onder Deze maand en niet op een tegel', async ({ page }) => {
  await boot(page, { set: { coachLog: [{ type: 'afspraak', regel: 'buffer', ts: NU.getTime(),
    text: 'Ik verhoog het bedrag dat ik per maand opzij zet' }] } });
  const r = await page.evaluate(() => {
    const t = document.getElementById('s-maand').innerText;
    const R = maandMetAfspraak(maandRegels());
    return { n: (t.match(/Ik verhoog het bedrag dat ik per maand opzij zet/g) || []).length,
      deze: document.getElementById('gripDezeMaand').innerText, tegels: document.getElementById('gripTegels').innerText,
      vlag: !!R.find(x => x.key === 'buffer').afspraak };
  });
  expect(r.n).toBe(1);
  expect(r.deze).toContain('Ik verhoog het bedrag dat ik per maand opzij zet');
  expect(r.tegels).not.toContain('Ik verhoog');
  expect(r.vlag).toBe(true);
});

/* ===== g) beleggen: neutraal ===== */
/* v340: de kaart 'Voorwaarden voor beleggen' is de tegel Beleggen. Niet gehaald is grijs (v314: geen
   alarm), gehaald groen. */
test('g: niet gehaald is grijs en geen alarm', async ({ page }) => {
  await boot(page, { set: { beleggenDrempel: 6 } });
  const r = await page.evaluate(() => { const e = document.querySelector('[data-tegel="beleggen"]');
    return { kleur: e.dataset.kleur, tekst: e.innerText.replace(/\s+/g, ' '), blok: beleggenKlaar(maandRegels()).blokkade.key }; });
  expect(r.blok).toBe('buffer');
  expect(r.kleur).toBe('grijs');
  expect(r.tekst).toBe('Beleggen wacht op je buffer');
});

test('g: gehaald blijft groen', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const e = document.querySelector('[data-tegel="beleggen"]'); return { kleur: e.dataset.kleur, tekst: e.innerText.replace(/\s+/g, ' ') }; });
  expect(r.kleur).toBe('groen');
  expect(r.tekst).toContain('alle drie gehaald');
});


/* ===== h) de zes quick wins ===== */
test('h: de afspraak-zin in het gesprek draagt geen gedachtestreepje', async ({ page }) => {
  const bron = BRON();
  const sec = bron.split('async function coAfspraakOpen')[1].split('\nasync function ')[0];
  expect(sec).toContain('dat sprak je deze maand af');
  expect(sec).not.toContain('—');
  expect(sec).not.toContain('–');
});

test('h: de dekking-drempel staat in dezelfde eenheid als zijn waarde', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const B = beleggenKlaar(maandRegels());
    const v = B.voorwaarden.find(x => x.key === 'dekking');
    return { waarde: v.waarde, drempel: v.drempel, stand: maandRegels().find(x => x.key === 'dekking').benodigdeStand };
  });
  // euro tegen euro, niet euro tegen procent
  expect(r.waarde.startsWith('€')).toBe(true);
  expect(r.drempel.startsWith('€')).toBe(true);
  expect(r.drempel).not.toContain('%');
  expect(r.drempel).toBe('€' + r.stand.toLocaleString('nl-NL'));
});

test('h: zonder beoordeelbare dekking valt de drempel terug op het percentage', async ({ page }) => {
  await boot(page, { set: { resAcc: '' } });
  const r = await page.evaluate(() => {
    const v = beleggenKlaar(maandRegels()).voorwaarden.find(x => x.key === 'dekking');
    return { drempel: v.drempel, stand: maandRegels().find(x => x.key === 'dekking').benodigdeStand };
  });
  expect(r.stand).toBe(null);
  expect(r.drempel).toBe('100%');
});

test('h: de reden staat direct boven de grijze Vastzetten-knop', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const id = valtOpSignals(thisYM())[0].id;
    valtOpPotjeSheet(id);
    const b = document.getElementById('valtOpSave');
    const t = document.getElementById('valtOpTekort');
    const blok = document.getElementById('valtOpDekBlok');
    return { uit: b.hasAttribute('disabled'), reden: t.textContent.trim(),
      direct: t.nextElementSibling === b, inBlok: blok.contains(t),
      afstand: Math.round(b.getBoundingClientRect().top - t.getBoundingClientRect().bottom) };
  });
  expect(r.uit).toBe(true);
  expect(r.reden).toContain('Nog te dekken');
  expect(r.direct).toBe(true);        // de reden is het element VOOR de knop
  expect(r.inBlok).toBe(false);       // en staat niet meer bovenaan het dekkingsblok
  expect(r.afstand).toBeLessThan(20);
});

test('h: de reden staat op één plek en wordt niet gekopieerd', async ({ page }) => {
  const bron = BRON();
  expect((bron.match(/id="valtOpTekort"/g) || []).length).toBe(1);
  expect((bron.match(/getElementById\('valtOpTekort'\)/g) || []).length).toBe(1);
});

test('h: de geldt-zin telt de werkelijke wijzigingen', async ({ page }) => {
  /* DEZE STAND HEEFT TWEE DEKKENDE POTJES NODIG, en de basisfixture heeft er nul: huur is deze maand
     volledig besteed (900 van 900), dus valtOpDekKandidaten() houdt er niets over. Zonder twee
     kandidaten is 'Alle 3 wijzigingen' per constructie onbereikbaar en toetst de zin alleen zijn
     eerste twee vormen (meetles q). Vervoer en zorg staan ook in budgetsNext, zodat de potjes-rij
     nog steeds precies één wijziging houdt. */
  await boot(page, { set: {
    budgets: { huur: 900, boodschappen: POTJE, vervoer: 200, zorg: 150 },
    budgetsNext: { huur: 900, boodschappen: POTJE, vervoer: 200, zorg: 150, sport: 50 } } });
  const r = await page.evaluate(() => {
    const id = valtOpSignals(thisYM())[0].id;
    valtOpPotjeSheet(id);
    const lees = () => document.getElementById('valtOpGeldt').textContent;
    const een = lees();
    const k = valtOpDekKandidaten('boodschappen')[0].k;
    valtOpDekVoegToe(k); const nulBedrag = document.getElementById('valtOpGeldt').textContent;
    valtOpDekZet(k, 10); const twee = document.getElementById('valtOpGeldt').textContent;
    const k2 = valtOpDekKandidaten('boodschappen').filter(x => x.k !== k)[0];
    let drie = null;
    if (k2) { valtOpDekVoegToe(k2.k); valtOpDekZet(k2.k, 5); drie = document.getElementById('valtOpGeldt').textContent; }
    return { een, nulBedrag, twee, drie, kandidaten: valtOpDekKandidaten('boodschappen').length };
  });
  expect(r.een).toContain('Deze wijziging geldt voor deze maand');
  // een aangewezen potje zonder bedrag verandert niets, dus hij telt niet mee
  expect(r.nulBedrag).toContain('Deze wijziging geldt');
  expect(r.twee).toContain('Allebei de wijzigingen gelden voor deze maand');
  if (r.drie) expect(r.drie).toContain('Alle 3 wijzigingen gelden voor deze maand');
});

test('h: het label van de coach zegt waar je heen gaat', async ({ page }) => {
  const bron = BRON();
  expect(bron).toContain("l:'Een ander onderwerp kiezen'");
  expect(bron).not.toContain('Terug naar de onderwerpen');
});

/* v340: "Vanaf <maand>" is opgegaan in de tijdlijn op Grip. De volle zin staat in maandVanafData(), de
   tijdlijn draagt de korte vorm in de maand waarin hij ingaat. */
test('h: de potjes-wijziging noemt het potje dat verandert', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({ data: maandVanafData(), B: SET.budgets, P: plannedBudgets(),
    tl: [...document.querySelectorAll('#gripTijdlijn .tl3-e[data-tlsoort="vanaf"]')].map(e => [e.closest('[data-tlmaand]').dataset.tlmaand, e.innerText]) }));
  expect(r.P.sport).toBe(50);
  expect(r.B.sport).toBe(undefined);
  expect(r.data[0].lab).toBe('Je potjes');
  expect(r.data[0].sub).toBe('Sport & gezondheid erbij voor €50, de rest ongewijzigd');
  expect(r.data[0].kort).toBe('Sport & gezondheid erbij');
  expect(r.tl).toEqual([]);   // v365: de tijdlijn op Grip is vervallen
});


test('h: bij meer dan één wijziging noemt de rij het aantal', async ({ page }) => {
  await boot(page, { set: { budgetsNext: { huur: 950, boodschappen: 450, sport: 50 } } });
  const r = await page.evaluate(() => maandVanafData()[0].kort);   // v365: zonder tijdlijn de bron zelf
  expect(r).toContain('3 potjes veranderen');
});

test('h: een potje dat terugzakt heet terug en niet omhoog', async ({ page }) => {
  await boot(page, { set: { budgets: { huur: 900, boodschappen: POTJE, sport: 96 },
    budgetsNext: { huur: 900, boodschappen: POTJE, sport: 50 } } });
  const r = await page.evaluate(() => ({ sub: maandVanafData()[0].sub, tl: maandVanafData()[0].kort }));   // v365: zonder tijdlijn
  expect(r.sub).toBe('Sport & gezondheid terug van €96 naar €50, de rest ongewijzigd');
  expect(r.tl).toContain('Sport & gezondheid naar €50');
});