/* v314 ronde A: de vorm van Grip en de kleine logica eromheen.
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

/* ===== b) de samenvatting ===== */
test('b: de samenvatting staat vóór de signaalkaarten en telt het potje mee', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const K = [...document.querySelectorAll('#s-maand .card')];
    const sig = K.findIndex(c => /boven je potje/.test(c.innerText));
    return { eerste: K[0].innerText, sigIdx: sig,
      zin: maandOordeel(maandRegels(), valtOpSignals(thisYM()).length).zin };
  });
  // de eerste kaart van het scherm IS de samenvatting, en de signaalkaart staat erna
  expect(r.eerste).toContain('Eén potje vraagt aandacht.');
  expect(r.eerste).toContain('De rest staat goed.');
  expect(r.sigIdx).toBe(1);
  expect(r.zin).toBe('Eén potje vraagt aandacht. De rest staat goed.');
});

test('b: een terugblik op de vorige maand staat erboven', async ({ page }) => {
  /* 'BOVENAAN' GAAT OVER DE VASTE INHOUD. De drie lussen (een verlopen acceptatie, de afspraak van
     vorige maand, het maandmoment) zijn terugblikken die er een paar dagen staan, en v141 heeft de
     afspraaklus met zoveel woorden vóór het oordeel gezet. Ze blijven dus boven de samenvatting; wat
     deze ronde verplaatst is de samenvatting ten opzichte van de SIGNAALKAARTEN. Zonder dit geval is
     'de samenvatting is de eerste kaart' niet te onderscheiden van 'de samenvatting staat voor de
     signalen', en vijf tests in afspraak-lus.spec.js hangen aan de eerste kaart. */
  await boot(page, { set: { coachLog: [{ type: 'afspraak', cat: 'boodschappen', ts: new Date(NU.getFullYear(), NU.getMonth() - 1, 15).getTime(),
    text: 'strakker op boodschappen' }] } });
  const r = await page.evaluate(() => {
    const K = [...document.querySelectorAll('#s-maand > .card')];
    return { koppen: K.slice(0, 3).map(c => c.innerText.split('\n')[0].slice(0, 40)) };
  });
  expect(r.koppen[0].toUpperCase()).toContain('JE AFSPRAAK VAN VORIGE MAAND');
  expect(r.koppen[1]).toContain('potje vraagt aandacht');
  expect(r.koppen[2]).toContain('Boodschappen');
});

test('b: zonder potje blijft de oude telzin staan, met potje niet', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const R = maandRegels();
    return { nul: maandOordeel(R, 0).zin, een: maandOordeel(R, 1).zin, twee: maandOordeel(R, 2).zin,
      sub: maandOordeel(R, 1).sub };
  });
  expect(r.nul).toBe('Alle 3 regels staan goed.');
  expect(r.een).toBe('Eén potje vraagt aandacht. De rest staat goed.');
  expect(r.twee).toBe('2 potjes vragen aandacht. De rest staat goed.');
  // de sub blijft noemen WELKE regels in orde zijn, dus 'de rest' is niet vaag
  expect(r.sub.toLowerCase()).toContain('dekking reserveringen');
  expect(r.sub.toLowerCase()).toContain('buffer in maanden');
});

test('b: een potje telt niet mee in het aantal REGELS', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const R = maandRegels();
    return { len: R.length, nul: maandOordeel(R, 0).zin, drie: maandOordeel(R, 3).zin };
  });
  // het aantal regels is en blijft 3; het potje krijgt een eigen zin en verschuift de telling niet
  expect(r.len).toBe(3);
  expect(r.nul).toContain('Alle 3 regels');
  expect(r.drie.startsWith('3 potjes vragen aandacht.')).toBe(true);
  expect(r.drie).not.toContain('4');
});

test('b: het oordeel haalt de signalen van de aanroeper en rekent ze niet zelf uit', async ({ page }) => {
  await boot(page);
  const bron = await kaalUit(page, 'maandOordeel', 'renderMaand', 'gripSignalCards');
  const sec = (n) => bron.split('function ' + n)[1] || '';
  // maandOordeel roept valtOpSignals() niet aan: één bron voor het aantal (v104)
  expect(/function maandOordeel/.test(bron)).toBe(true);
  expect(bron.split('function maandOordeel')[1].split('function ')[0]).not.toContain('valtOpSignals');
  // renderMaand haalt de lijst één keer op en geeft hem aan beide lezers mee
  const rm = bron.split('function renderMaand')[1].split('\nfunction ')[0];
  expect((rm.match(/valtOpSignals\(/g) || []).length).toBe(1);
  expect(rm).toContain('gripSignalCards(SIG)');
  expect(rm).toContain('maandOordeel(RO, SIG.length)');
});

/* ===== c) de handelingen in volgorde van het moment ===== */
test('c: ruim voor het eind staat bijstellen eerst en is hij de enige primaire knop', async ({ page }) => {
  await boot(page);
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
  const r = await page.evaluate(() => ({ dagen: valtOpDagenRest(),
    labels: [...document.querySelectorAll('.valtop-open .valtop-hand')].map(x => x.innerText.split('\n')[0]) }));
  expect(r.dagen).toBe(3);
  expect(r.labels[0]).toBe('Bekijk de transacties');
});

test('c: één dag erboven is de andere volgorde', async ({ page }) => {
  await boot(page, { dagen: 4 });
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
      tel: valtOpTelling().n, log: document.getElementById('s-maand').innerText };
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
    save(); renderMaand();
    return { tel: valtOpTelling().n, tekst: document.getElementById('s-maand').innerText };
  });
  expect(r.tel.zo_gelaten).toBe(1);
  expect(r.tel.geen).toBe(1);
  // de telregel houdt de twee apart en voegt ze niet samen
  expect(r.tekst).toContain('1× zo gelaten');
  expect(r.tekst).toContain('1× niets gedaan');
});

test('d: zo gelaten staat onvoorwaardelijk in de telling, de correctie niet', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => ({ tekst: document.getElementById('s-maand').innerText, tel: valtOpTelling().n }));
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

/* ===== e) Staat goed, met de linker-sub ===== */
test('e: de drie rijen dragen een linker-sub uit hun eigen bron', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const R = maandRegels(); const by = {}; R.forEach(x => by[x.key] = x);
    const sg = [...document.querySelectorAll('#s-maand .card')].find(c => /STAAT GOED/.test(c.innerText));
    return { subs: { buffer: by.buffer.sub, dekking: by.dekking.sub, doel: by.doel.sub },
      waarden: { buffer: by.buffer.waarde, dekking: by.dekking.waarde, doel: by.doel.waarde },
      eenheden: { buffer: by.buffer.eenheid, dekking: by.dekking.eenheid, doel: by.doel.eenheid },
      alloc: by.doel.waarde, benodigdeStand: by.dekking.benodigdeStand, tekst: sg.innerText };
  });
  // buffer: de sub noemt de NORM, de rechterkolom de RICHT, en die twee zijn in deze fixture 2 en 3
  expect(r.subs.buffer).toBe(`je norm: ${NORM} maanden`);
  expect(r.eenheden.buffer).toContain(`je richt staat op ${RICHT}`);
  expect(r.subs.buffer).not.toContain(String(RICHT));
  // dekking: de eerstvolgende post links, wat er na die post overblijft rechts
  expect(r.subs.dekking).toBe(`verwacht: €${POST} in ${new Intl.DateTimeFormat('nl-NL', { month: 'long', year: 'numeric' }).format(new Date(PLUS(2) + '-01'))}`);
  expect(r.waarden.dekking).toBe(`€${POTSTAND}`);
  expect(r.eenheden.dekking).toBe(`in je pot · €${BLIJFT} blijft over`);
  // en dat is de potstand min DEZE post, niet min de opbouw-eis: die twee verschillen hier echt
  expect(r.benodigdeStand).not.toBe(POST);
  expect(r.eenheden.dekking).not.toContain(String(POTSTAND - r.benodigdeStand));
  // doel: de waarde is wat je INLEGT, de eenheid wat er nodig is
  expect(r.subs.doel).toContain('€10.000');
  expect(r.eenheden.doel).toContain('nodig');
  expect(r.tekst).toContain(`je norm: ${NORM} maanden`);
  expect(r.tekst).toContain(`€${BLIJFT} blijft over`);
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

/* ===== f) de afspraak één keer ===== */
test('f: de afspraak staat als kaart en niet in de regel', async ({ page }) => {
  await boot(page, { set: { coachLog: [{ type: 'afspraak', regel: 'buffer', ts: NU.getTime(),
    text: 'Ik verhoog het bedrag dat ik per maand opzij zet' }] } });
  const r = await page.evaluate(() => {
    const t = document.getElementById('s-maand').innerText;
    const R = maandMetAfspraak(maandRegels());
    return { tekst: t, n: (t.match(/Ik verhoog het bedrag dat ik per maand opzij zet/g) || []).length,
      rij: maandRij(R.find(x => x.key === 'buffer'), false),
      vlag: !!R.find(x => x.key === 'buffer').afspraak };
  });
  expect(r.n).toBe(1);
  expect(r.tekst).toContain('JE AFSPRAAK DEZE MAAND');
  expect(r.tekst).not.toContain('Hier loopt een afspraak over');
  expect(r.rij).not.toContain('Hier loopt een afspraak over');
  // de vlag blijft wel op de rij staan: maandMetAfspraak() zet daarmee de status om
  expect(r.vlag).toBe(true);
});

test('f: de kaart noemt de regel als die op ok staat', async ({ page }) => {
  await boot(page, { set: { coachLog: [{ type: 'afspraak', regel: 'buffer', ts: NU.getTime(),
    text: 'Ik verhoog het bedrag dat ik per maand opzij zet' }] } });
  const r = await page.evaluate(() => ({
    st: maandRegels().find(x => x.key === 'buffer').status,
    tekst: document.getElementById('s-maand').innerText }));
  expect(r.st).toBe('ok');
  expect(r.tekst).toContain('Je buffer in maanden staat goed, dus deze afspraak gaat nu niet over een tekort.');
});

test('f: bij een regel die niet op ok staat zegt de kaart dat niet', async ({ page }) => {
  // een afspraak over het doel, met een doel dat zijn datum niet haalt
  await boot(page, { set: { spaarInleg: 50,
    goals: [{ id: 'g1', naam: 'Kosten Koper', doel: DOELBEDRAG, gespaard: 0, streefdatum: PLUS(3), allocMode: 'auto' }],
    coachLog: [{ type: 'afspraak', regel: 'doel', ts: NU.getTime(), text: 'Ik leg meer per maand in' }] } });
  const r = await page.evaluate(() => ({
    st: maandRegels().find(x => x.key === 'doel').status,
    tekst: document.getElementById('s-maand').innerText }));
  expect(r.st).not.toBe('ok');
  expect(r.tekst).toContain('JE AFSPRAAK DEZE MAAND');
  expect(r.tekst).not.toContain('gaat nu niet over een tekort');
});

/* ===== g) beleggen: neutraal, en 'je drempel' alleen waar het jouw keuze is ===== */
test('g: niet gehaald is neutraal en geen alarm', async ({ page }) => {
  await boot(page, { set: { beleggenDrempel: 6 } });
  const r = await page.evaluate(() => {
    const c = [...document.querySelectorAll('#s-maand .card')].find(x => /VOORWAARDEN VOOR BELEGGEN/.test(x.innerText));
    const dot = c.querySelector('span[style*="border-radius:50%"]');
    const cs = getComputedStyle(document.documentElement);
    const hex = (n) => cs.getPropertyValue(n).trim();
    const rgb = (h) => { const m = h.replace('#', ''); return 'rgb(' + [0, 2, 4].map(i => parseInt(m.slice(i, i + 2), 16)).join(', ') + ')'; };
    return { kleur: getComputedStyle(dot).backgroundColor, bar: rgb(hex('--bar')), red: rgb(hex('--red')), amber: rgb(hex('--amber')),
      zin: c.innerText, blok: beleggenKlaar(maandRegels()).blokkade.key };
  });
  expect(r.blok).toBe('buffer');
  expect(r.kleur).toBe(r.bar);
  expect(r.kleur).not.toBe(r.red);
  expect(r.kleur).not.toBe(r.amber);
  expect(r.zin).toContain('tegen je drempel van 6 maanden');
});

test('g: gehaald blijft groen', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const c = [...document.querySelectorAll('#s-maand .card')].find(x => /VOORWAARDEN VOOR BELEGGEN/.test(x.innerText));
    const dot = c.querySelector('span[style*="border-radius:50%"]');
    const cs = getComputedStyle(document.documentElement);
    const h = cs.getPropertyValue('--green').trim().replace('#', '');
    return { kleur: getComputedStyle(dot).backgroundColor, zin: c.innerText,
      green: 'rgb(' + [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(', ') + ')' };
  });
  expect(r.zin).toContain('alle drie gehaald');
  expect(r.kleur).toBe(r.green);
});

test('g: je drempel staat alleen bij de buffer en niet bij dekking of doel', async ({ page }) => {
  /* DE DEKKING MOET BLOKKEREN EN DE KAART MOET TOCH RENDEREN, en die twee eisen vechten met elkaar:
     v187 laat de kaart ZWIJGEN zodra de blokkerende rij zelf al 'tekort' zegt. Mijn eerste vorm van
     deze test zette alleen de potstand op 50; dan staat de dekking op 'tekort', verdwijnt de kaart
     en sloeg de assertie zichzelf over achter een `if (r.zin)`. Dat is precies het weggefilterde
     geval van v299/v300, en de sabotage die 'je drempel' onvoorwaardelijk maakt bleef er groen op.
     DE STAND DIE HET WEL DRAAGT is een dekking op TEMPO: een grote post die verder dan
     MAAND_DREMPEL.dekkingMarge maanden weg ligt geeft status 'let op', en dan is de dekking de
     blokkade EN rendert de kaart. */
  await boot(page, { set: { reserveringen: [
    { id: 'r1', naam: 'Waterschapsbelasting', bedrag: POST, vervalmaand: PLUS(2), intervalM: 12, cat: 'belasting' },
    { id: 'r2', naam: 'Dakrenovatie', bedrag: 5000, vervalmaand: PLUS(8), intervalM: 12, cat: 'onderhoud' } ] } });
  const r = await page.evaluate(() => {
    const R = maandRegels();
    const c = [...document.querySelectorAll('#s-maand .card')].find(x => /VOORWAARDEN VOOR BELEGGEN/.test(x.innerText));
    return { blok: beleggenKlaar(R).blokkade, dek: R.find(x => x.key === 'dekking').status,
      buf: R.find(x => x.key === 'buffer').status, zin: c ? c.innerText : '' };
  });
  // de invoer: de buffer haalt zijn drempel, de dekking niet, en de kaart staat er echt
  expect(r.buf).toBe('ok');
  expect(r.dek).toBe('let op');
  expect(r.blok.key).toBe('dekking');
  expect(r.zin).toContain('Nog niet aan je voorwaarden voor beleggen');
  // die drempel komt uit MAAND_DREMPEL en is geen keuze van jou
  expect(r.zin).not.toContain('je drempel');
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

test('h: de potjes-rij noemt het potje dat verandert', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const t = document.getElementById('s-maand').innerText;
    return { tekst: t, B: SET.budgets, P: plannedBudgets() };
  });
  // de fixture verandert precies één potje: sport komt erbij voor €50
  expect(r.P.sport).toBe(50);
  expect(r.B.sport).toBe(undefined);
  /* v315: de rij staat in de kaart 'Vanaf <maand>' en heet daar 'Je potjes'; de woorden 'vanaf
     volgende maand' zijn naar de KOP van die kaart verhuisd. De sub is onveranderd. */
  expect(r.tekst.toUpperCase()).toContain('VANAF ');
  expect(r.tekst).toContain('Je potjes');
  expect(r.tekst).toContain('Sport & gezondheid erbij voor €50, de rest ongewijzigd');
});

test('h: bij meer dan één wijziging noemt de rij het aantal', async ({ page }) => {
  await boot(page, { set: { budgetsNext: { huur: 950, boodschappen: 450, sport: 50 } } });
  const r = await page.evaluate(() => document.getElementById('s-maand').innerText);
  expect(r).toContain('3 potjes veranderen');
});

test('h: een potje dat terugzakt heet terug en niet omhoog', async ({ page }) => {
  await boot(page, { set: { budgets: { huur: 900, boodschappen: POTJE, sport: 96 },
    budgetsNext: { huur: 900, boodschappen: POTJE, sport: 50 } } });
  const r = await page.evaluate(() => document.getElementById('s-maand').innerText);
  expect(r).toContain('Sport & gezondheid terug van €96 naar €50, de rest ongewijzigd');
});

/* ===== i) de hoogtes, gemeten en vastgepind ===== */
for (const [w, h, zichtbaar] of [[360, 640, 567], [390, 844, 771]]) {
  test(`i: de hoogtes op ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await boot(page);
    const r = await page.evaluate(() => {
      const K = [...document.querySelectorAll('#s-maand .card')];
      const sig = K.find(c => /boven je potje/.test(c.innerText));
      const sg = K.find(c => /STAAT GOED/.test(c.innerText));
      const va = K.find(c => /^VANAF /.test(c.innerText));
      const nav = document.querySelector('.nav, nav, #nav');
      return { sam: Math.round(K[0].getBoundingClientRect().height),
        samBodem: Math.round(K[0].getBoundingClientRect().bottom),
        sigTop: Math.round(sig.getBoundingClientRect().top),
        sigBodem: Math.round(sig.getBoundingClientRect().bottom),
        sgH: Math.round(sg.getBoundingClientRect().height),
        vaH: va ? Math.round(va.getBoundingClientRect().height) : 0,
        navH: nav ? Math.round(nav.getBoundingClientRect().height) : 0,
        hand: [...sig.querySelectorAll('.valtop-hand')].map(x => Math.round(x.getBoundingClientRect().bottom)) };
    });
    expect(h - r.navH).toBe(zichtbaar);
    // DE SAMENVATTING STAAT VOLLEDIG BOVEN DE VOUW, op beide breedtes
    expect(r.sam).toBe(124);
    expect(r.samBodem).toBe(194);
    expect(r.samBodem).toBeLessThan(zichtbaar);
    expect(r.sigTop).toBe(210);
    // de primaire handeling en de tweede staan boven de vouw
    expect(r.hand[0]).toBeLessThan(zichtbaar);
    expect(r.hand[1]).toBeLessThan(zichtbaar);
    if (w === 360) {
      // GEMETEN PRIJS: op de kleinste telefoon valt de derde handeling net onder de vouw
      expect(r.sigBodem).toBe(615);
      expect(r.hand[2]).toBe(569);
      /* v315: 'Staat goed' is 77px lager, want de potjes-rij hing hier onder de streep en staat nu
         in zijn eigen kaart. Die kaart kost 118px op 360 en 103px op 390, dus de pagina wordt 41 en
         41px hoger; de sub breekt op 360px over twee regels en dat is het verschil tussen de twee.
         De prijs staat als assertie vast, zodat een volgende ronde ziet wat hij uitgeeft. */
      expect(r.sgH).toBe(230);
      expect(r.vaH).toBe(118);
    } else {
      expect(r.sigBodem).toBe(576);
      expect(r.sigBodem).toBeLessThan(zichtbaar);
      expect(r.sgH).toBe(215);
      expect(r.vaH).toBe(103);
    }
  });
}
