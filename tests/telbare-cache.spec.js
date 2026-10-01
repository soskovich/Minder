/* v310: DE POORT EEN KEER PER STAND VAN DE GEGEVENS.
 *
 * WAT DEZE SPEC VASTHOUDT is niet de snelheid maar de VERSHEID: na elke soort wijziging moet het
 * nieuwe getal er direct staan. Een cache die een verouderd getal toont is erger dan een trage app,
 * want te veel of te weinig meetellen is niet te zien (v168).
 * DE MAAT IS HET AANTAL POORT-EVALUATIES EN NIET DE TIJD, want dat eerste is deterministisch en het
 * tweede niet (meetles d: een assertie die te ruim staat). Het aantal AANROEPEN van telbareTx()
 * verandert door de memo niet, dus daarop meten zou de winst niet kunnen zien: wat de memo weghaalt
 * is hoe vaak de vier poorten per boeking worden uitgevoerd.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { seed, open } = require('./budget-fixture');
const { pinDag } = require('./vaste-dag');
const { kaalBron, kaalUit } = require('./bron-kaal');

const MAANDEN = 21, PER_MAAND = 70;          // toestel: ~21 maanden, ~1500 boekingen
const MAIN = 'NL01MAIN0000001111';

/* Bouwt op de gedeelde fixture voort, zodat elke afgeleide blijft kloppen. Wat erbij komt zijn losse
   kaartbetalingen plus paren in de twee bevestigings-lijsten: die twee poorten lopen PER BOEKING
   over hun hele lijst, en zonder paren erin is de lus TX in plaats van TX maal paren. */
function groot(extra) {
  const d = seed({ maanden: MAANDEN });
  const tx = JSON.parse(d.minder_tx);
  const set = JSON.parse(d.minder_set);
  const ms = [...new Set(tx.map((t) => t.date.slice(0, 7)))].sort();
  const winkels = ['Albert Heijn', 'Jumbo', 'Hema', 'Shell', 'Bol', 'NS', 'Etos', 'Kruidvat'];
  for (const m of ms) {
    for (let i = 0; i < PER_MAAND; i++) {
      const w = winkels[i % winkels.length];
      tx.push({ id: 'g' + m + '-' + i, date: m + '-' + String((i % 27) + 1).padStart(2, '0'),
        amount: -(5 + (i % 40)), acc: MAIN, name: w, desc: 'BEA, BETAALPAS ' + w.toUpperCase(),
        typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
    }
  }
  set.dubbelPaar = {}; set.vorautPaar = {};
  for (let k = 0; k < 12; k++) set.dubbelPaar['s' + k] = { weg: 'onbestaand-' + k, op: ms[0] + '-01', ovr: {} };
  for (let k = 0; k < 10; k++) set.vorautPaar['v' + k] = { weg: ['onbestaand-a' + k, 'onbestaand-b' + k], keuze: 'reservering' };
  d.minder_tx = JSON.stringify(tx); d.minder_set = JSON.stringify(set);
  return Object.assign(d, extra || {});
}

/* Telt hoe vaak de VIER POORTEN worden uitgevoerd. Ze staan in TELPOORTEN als thunks die de echte
   functie aanroepen, dus window[naam] vervangen telt ze. */
async function armeerPoorten(page) {
  await page.evaluate(() => {
    window.__poort = 0;
    window.__poortEcht = {};
    for (const n of ['csvDubbel', 'mt940Dubbel', 'dubbelWeg', 'vorautWeg']) {
      const e = window[n]; window.__poortEcht[n] = e;
      window[n] = function (...a) { window.__poort++; return e.apply(this, a); };
    }
  });
}
const poortTelling = (page) => page.evaluate(() => { const n = window.__poort; window.__poort = 0; return n; });

test.describe('a - de poort wordt een keer per stand uitgerekend', () => {
  test('twee aanroepen achter elkaar voeren de poorten een keer uit', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    await armeerPoorten(page);
    const r = await page.evaluate(() => {
      /* DE CACHE MOET EERST KOUD, want de boot rendert al en vult hem dus onder hetzelfde _dataGen.
         Zonder dit zijn BEIDE aanroepen nul en meet de test alleen dat er niets gebeurt, niet dat de
         eerste aanroep een pass over TX doet (meetles a). */
      telbaarVergeten();
      const n = TX.length; window.__poort = 0;
      const a = telbareTx().length; const eerste = window.__poort;
      window.__poort = 0;
      const b = telbareTx().length; const tweede = window.__poort;
      return { n, a, b, eerste, tweede };
    });
    expect(r.a, 'de fixture moet boekingen dragen, anders toetst deze test niets').toBeGreaterThan(1000);
    expect(r.b).toBe(r.a);
    // de eerste aanroep loopt precies een keer over TX; de poorten stoppen bij de eerste treffer
    expect(r.eerste, 'de eerste aanroep evalueert de poorten').toBeGreaterThan(0);
    expect(r.eerste).toBeLessThanOrEqual(r.n * 4);
    expect(r.tweede, 'de tweede aanroep evalueert geen enkele poort meer').toBe(0);
  });

  test('een render evalueert de poorten een keer en niet een keer per aanroep', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    await armeerPoorten(page);
    const r = await page.evaluate(() => {
      const uit = {};
      for (const [label, fn] of [['Home', renderDash], ['Inzichten', renderIns], ['Plan', renderVooruit],
        ['Grip', renderMaand], ['Vermogen', renderVermogen]]) {
        let n = 0; const e = window.telbareTx;
        window.telbareTx = function (...a) { n++; return e.apply(this, a); };
        window.__poort = 0;
        fn();
        uit[label] = { aanroepen: n, poorten: window.__poort };
        window.telbareTx = e;
      }
      uit._n = TX.length;
      return uit;
    });
    const n = r._n;
    for (const [label, v] of Object.entries(r)) {
      if (label === '_n') continue;
      expect(v.aanroepen, label + ' moet telbareTx werkelijk aanroepen, anders toetst deze test niets')
        .toBeGreaterThan(5);
      /* DE LAT: ten hoogste vier passes over TX, ongeacht het aantal aanroepen. Vier omdat er drie
         `behalve`-sleutels bestaan ('', 'voraut', 'mt940') plus ruimte voor een vierde. Zonder de
         memo is dit `aanroepen` maal TX, en dat is op Grip ruim anderhalf miljoen. */
      expect(v.poorten, label + ': ' + v.aanroepen + ' aanroepen gaven ' + v.poorten + ' poort-evaluaties')
        .toBeLessThanOrEqual(n * 4);
    }
  });
});

test.describe('b - na elke soort wijziging staat het nieuwe getal er direct', () => {
  test('commitTx: een nieuwe boeking telt meteen mee', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      const voor = telbareTx().length;
      commitTx([{ date: thisYM() + '-11', amount: -77, acc: OWN[0], name: 'Nieuwe Winkel',
        desc: 'BEA, BETAALPAS NIEUWE WINKEL', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] }], null);
      return { voor, na: telbareTx().length, inTX: TX.length };
    });
    expect(r.na).toBe(r.voor + 1);
  });

  test('een bevestigd dubbel valt er meteen uit', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      const t = TX.find((x) => x.name === 'Jumbo');
      const voor = telbareTx().length;
      const zatErin = telbareTx().some((x) => x.id === t.id);
      // dezelfde route als de bevestiging: de vlag, dan save, dan buildAccMeta
      SET.dubbelPaar = SET.dubbelPaar || {};
      SET.dubbelPaar['nieuw'] = { weg: t.id, op: vandaagYMD(), ovr: {} };
      save(); buildAccMeta();
      const L = telbareTx();
      return { voor, zatErin, na: L.length, zitErnog: L.some((x) => x.id === t.id) };
    });
    expect(r.zatErin, 'de boeking moet er eerst in zitten, anders toetst deze test niets').toBe(true);
    expect(r.zitErnog).toBe(false);
    expect(r.na).toBe(r.voor - 1);
  });

  test('een bevestigde reservering valt er meteen uit, en blijft in vorautBron', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      const a = TX.find((x) => x.name === 'Shell');
      const b = TX.filter((x) => x.name === 'Shell')[1];
      const voor = telbareTx().length;
      SET.vorautPaar = SET.vorautPaar || {};
      SET.vorautPaar['nieuw'] = { weg: [a.id, b.id], keuze: 'reservering' };
      save(); buildAccMeta();
      const L = telbareTx(), B = vorautBron();
      return { voor, na: L.length, inTelbaar: L.filter((x) => x.id === a.id || x.id === b.id).length,
        inBron: B.filter((x) => x.id === a.id || x.id === b.id).length };
    });
    expect(r.na).toBe(r.voor - 2);
    expect(r.inTelbaar).toBe(0);
    // v293: de poort zonder zijn eigen uitkomst, anders is de keuze niet terug te draaien
    expect(r.inBron).toBe(2);
  });

  test('een instelling die een poort leest: de route langs buildAccMeta maakt de memo ongeldig',
    async ({ page }) => {
    await pinDag(page); await open(page, groot());
    await armeerPoorten(page);
    const r = await page.evaluate(() => {
      /* WAT DEZE TEST VASTHOUDT IS DE VERSHEID EN NIET DE UITKOMST. De twee paar-poorten lezen
         `csvPaar()` en `mt940Paar()`, en die lezen `csvPsd2Paring()` over `SET.psd2Accounts`, `ACCMETA`
         en `TX`. Wat die paring OPLEVERT staat al vast in `csv-venster-uitsluiting` en
         `scope-een-bron`; wat hier moet vastliggen is dat een wijziging in die instelling de memo
         omgooit, en dat is te meten aan de poorten die opnieuw worden uitgevoerd.
         DE ROUTE IS DIE VAN DE APP, en juist deze: op vijf plekken staat `save()` VOOR
         `buildAccMeta()`, dus de teller bumpt terwijl de vensters nog de oude zijn. Een
         `telbareTx()` daartussen landt onder het nieuwe nummer met de OUDE vensters, en dat is
         precies wat de tweede invalidatie afvangt. */
      telbareTx();                                       // vul de memo
      window.__poort = 0;
      telbareTx();
      const koudNa = window.__poort;                     // 0: hij hergebruikt
      SET.psd2Accounts = { psd2acc0001: { uid: 'u1', iban: 'NL99PSD20000000001', hash: '',
        label: 'Main', bank: 'N26', exp: '2027-01-01' } };
      save();
      telbareTx();                                       // de val: onder het nieuwe nummer, oude vensters
      const naSave = window.__poort;
      window.__poort = 0;
      const paarVoor = csvPaar();
      buildAccMeta();
      const paarNa = csvPaar();
      telbareTx();
      const naBuild = window.__poort;
      return { koudNa, naSave, naBuild, paarWeg: paarVoor !== paarNa, n: TX.length };
    });
    expect(r.koudNa, 'zonder mutatie evalueert hij geen poort').toBe(0);
    expect(r.naSave, 'save() bumpt de teller, dus hij rekent opnieuw').toBeGreaterThan(0);
    /* DE KERN: buildAccMeta() gooit de paar-vensters weg, en dan MOET de poort ook opnieuw, ook al is
       _dataGen sinds de save niet meer veranderd. Zonder `telbaarVergeten()` op die regel is dit nul. */
    expect(r.paarWeg, 'buildAccMeta gooit de paar-cache weg').toBe(true);
    expect(r.naBuild, 'na buildAccMeta rekent hij opnieuw, met de nieuwe vensters').toBeGreaterThan(0);
    expect(r.naBuild).toBeLessThanOrEqual(r.n * 4);
  });

  test('een route die TX wijzigt zonder buildAccMeta: het tellen van contant', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      /* DIT IS DE ROUTE DIE DE `_dataGen`-TOETS ALS ENIGE DEKT, en dat is gemeten en geen voorzorg.
         Elke andere schrijver van TX of van een poort-instelling komt langs `buildAccMeta()` en dus
         langs `telbaarVergeten()`: `commitTx()`, de twee bevestigingsroutes, de samenvoeging, het
         verwijderen van boekingen, de import en de boot. `contantOpslaan()` niet: die duwt een
         boeking in TX en doet alleen `save()`. Zonder de `_dataGen`-toets valt dus precies deze
         boeking buiten de sommen, en dat is te zien in het maandtotaal.
         GEMETEN: de sabotage die de memo nooit ongeldig maakt zet zes tests in
         `contant-stand.spec.js` rood, en die eigenschap staat hier omdat deze spec hem bezit. */
      const m = thisYM();
      const tel = (b) => { contantTellen(); document.querySelector('#contInput').value = String(b); contantOpslaan(); };
      /* DE EERSTE TELLING SCHRIJFT GEEN BOEKING (v258): zonder beginpunt is er geen verschil. De
         tweede telling is de wijziging die deze test nodig heeft. */
      tel(400);
      telbareTx(); totals(m);                            // vul de memo NA het beginpunt
      const voor = telbareTx().length;
      const normVoor = Math.round(totals(m).spend);
      tel(145.5);
      return { voor, na: telbareTx().length, normVoor, normNa: Math.round(totals(m).spend),
        inTX: TX.some((t) => t.src === 'contant') };
    });
    expect(r.inTX, 'de route moet werkelijk een boeking in TX zetten, anders toetst dit niets').toBe(true);
    expect(r.na).toBe(r.voor + 1);
    expect(r.normNa).toBeGreaterThan(r.normVoor);
  });

  test('een override verandert de uitkomst niet, en dat is de eigenschap', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      const t = TX.find((x) => x.name === 'Hema');
      const voor = telbareTx().map((x) => x.id).join(',');
      OVR[t.id] = 'onvoorzien'; save();
      const na = telbareTx().map((x) => x.id).join(',');
      return { gelijk: voor === na, n: voor.split(',').length, cat: catOf(t) };
    });
    /* DE VIER POORTEN LEZEN t.src, t.acc, t.date EN t.id, en een override schrijft OVR[t.id]. De
       lijst is dus per constructie dezelfde, en de cache kan hier niet verouderd raken. Wat de
       override wel doet is `save()` aanroepen, dus de memo valt toch om. */
    expect(r.cat, 'de override moet werkelijk zijn gezet, anders toetst deze test niets').toBe('onvoorzien');
    expect(r.gelijk).toBe(true);
    expect(r.n).toBeGreaterThan(1000);
  });

  test('het scherm toont het nieuwe getal na een bevestiging, niet het oude', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      const m = thisYM();
      renderIns();                                       // vult de cache
      const voor = Math.round(totals(m).spendNorm);
      const kand = txOfMonth(m).filter((t) => t.amount < 0 && catOf(t) === 'boodschappen');
      const t = kand[0];
      SET.dubbelPaar = SET.dubbelPaar || {};
      SET.dubbelPaar['scherm'] = { weg: t.id, op: vandaagYMD(), ovr: {} };
      save(); buildAccMeta(); renderIns();
      return { voor, na: Math.round(totals(m).spendNorm), bedrag: Math.round(-t.amount) };
    });
    expect(r.bedrag, 'de boeking moet een bedrag hebben, anders is voor en na gelijk').toBeGreaterThan(0);
    expect(r.voor - r.na).toBe(r.bedrag);
  });
});

test.describe('b2 - het contract: de memo volgt save()', () => {
  /* DIT IS DE PRIJS VAN DE MEMO, EN HIJ STAAT HIER OMDAT HIJ ANDERS EEN VERRASSING IS. Elke route in
     de app roept `save()` aan na een mutatie, dus voor de app is dit geen beperking. Voor een TEST die
     rechtstreeks in `TX` of in een poort-instelling schrijft wel: zonder `save()` leest hij de stand
     van voor zijn eigen mutatie.
     DAT CONTRACT BESTOND AL, en dat is nagegaan en niet aangenomen: `recurringKeys`, `recurringCats`,
     `noodfondsModel` en `merchStats` hangen sinds eerdere rondes aan dezelfde `_dataGen`. Het beet deze
     tests alleen niet, omdat zij `telbareTx()` niet lezen. GEMETEN bij v310: ZES specs duwden boekingen
     of een bevestiging rechtstreeks door zonder `save()`, en die zijn de route van de app gaan lopen in
     plaats van dat de invalidatie is verzwakt.
     EEN VINGERAFDRUK OP `TX.length` ZOU VIJF VAN DIE ZES HEBBEN GEDEKT, en is bewust NIET gekozen: dan
     is de memo SOMS juist en is het restgeval (een veld dat in plaats wordt gewijzigd) onzichtbaar. Een
     halve invalidatie die er als een hele uitziet is precies het etiket dat dit project verbiedt. */
  test('een mutatie zonder save is niet zichtbaar, en met save wel', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      const nieuw = () => ({ id: 'los' + Math.random(), date: thisYM() + '-11', amount: -11,
        acc: OWN[0], name: 'Los', desc: 'BEA, BETAALPAS LOS', typ: '', ref: '', src: 'csv',
        accName: 'Main', refNums: [] });
      const voor = telbareTx().length;
      TX.push(nieuw());                                  // geen save
      const zonder = telbareTx().length;
      TX.push(nieuw()); save();                          // met save
      return { voor, zonder, met: telbareTx().length, inTX: TX.length };
    });
    expect(r.zonder, 'zonder save leest hij de stand van voor de mutatie').toBe(r.voor);
    expect(r.met, 'save() maakt beide boekingen zichtbaar').toBe(r.voor + 2);
  });

  test('telbaarVergeten() is de uitweg voor wie geen save wil doen', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      const voor = telbareTx().length;
      TX.push({ id: 'los2', date: thisYM() + '-12', amount: -12, acc: OWN[0], name: 'Los',
        desc: 'BEA, BETAALPAS LOS', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
      const zonder = telbareTx().length;
      telbaarVergeten();
      return { voor, zonder, na: telbareTx().length };
    });
    expect(r.zonder).toBe(r.voor);
    expect(r.na).toBe(r.voor + 1);
  });
});

test.describe('c - de aanroeper krijgt een eigen array', () => {
  test('sorteren van de uitkomst bederft de cache niet', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      const a = telbareTx();
      const eersteVoor = a[0].id;
      a.sort((x, y) => String(y.date).localeCompare(String(x.date)));   // omgekeerd
      a.length = 3;                                                     // en ingekort
      const b = telbareTx();
      return { eersteVoor, eersteNa: b[0].id, n: b.length, anders: a !== b };
    });
    expect(r.anders).toBe(true);
    expect(r.eersteNa).toBe(r.eersteVoor);
    expect(r.n).toBeGreaterThan(1000);
  });
});

test.describe('d - de prestatiegrens', () => {
  /* EEN GRENS IN MILLISECONDEN IS RUIM, want een testmachine is niet een telefoon en de spreiding
     tussen runs is groot. Wat hem toch waard maakt is de ORDE: vóór v310 kostte renderMaand() op
     deze fixture 608 ms en de budget-editor 258 ms, en dat is wat de gebruiker als traag meldde.
     De deterministische kant van dezelfde meting staat in blok a. */
  test('Grip en de budget-editor blijven onder de grens op toestel-omvang', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const r = await page.evaluate(() => {
      const meet = (fn) => { const t0 = performance.now(); fn(); return performance.now() - t0; };
      renderDash();                                        // een keer warmlopen
      return { n: TX.length, maanden: months().length,
        grip: meet(() => renderMaand()), editor: meet(() => openBudgetEditor(thisYM())),
        home: meet(() => renderDash()), ins: meet(() => renderIns()) };
    });
    expect(r.n, 'de fixture moet de omvang van het toestel hebben').toBeGreaterThan(1400);
    expect(r.maanden).toBeGreaterThan(18);
    expect(r.grip, 'Grip: ' + Math.round(r.grip) + ' ms').toBeLessThan(250);
    expect(r.editor, 'budget-editor: ' + Math.round(r.editor) + ' ms').toBeLessThan(150);
    expect(r.home, 'Home: ' + Math.round(r.home) + ' ms').toBeLessThan(120);
    expect(r.ins, 'Inzichten: ' + Math.round(r.ins) + ' ms').toBeLessThan(120);
  });
});

test.describe('e - een memo en geen tweede waarheid', () => {
  test('de memo leest _dataGen, zoals de vier die er al waren', async () => {
    const src = kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
    expect(src).toMatch(/function telbareTx\(behalve\)\{[\s\S]{0,400}_dataGen/);
    expect((src.match(/_telbaarGen/g) || []).length, 'de memo staat op een plek').toBe(4);
    expect((src.match(/function telbaarVergeten\(\)/g) || []).length).toBe(1);
  });

  test('de tweede invalidatie staat waar de paar-vensters al worden weggegooid', async () => {
    const src = kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
    /* EEN DERDE PLEK ZOU EEN DERDE WAARHEID ZIJN over wanneer de poort ongeldig is. Deze test valt
       zodra telbaarVergeten() ergens anders wordt aangeroepen dan naast CSVPAAR/MT940PAAR. */
    const aanroepen = (src.match(/telbaarVergeten\(\)/g) || []).length;
    expect(aanroepen, 'een definitie en precies een aanroep').toBe(2);
    expect(src).toMatch(/CSVPAAR=null; MT940PAAR=null; telbaarVergeten\(\);/);
  });

  test('geen enkele lezer houdt de gecachete array vast', async ({ page }) => {
    await pinDag(page); await open(page, groot());
    const bron = await kaalUit(page, 'telbareTx');
    expect(bron, 'de uitkomst gaat als eigen array naar de aanroeper').toMatch(/\.slice\(\)/);
    const src = kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
    expect(src, 'een aanroeper die de uitkomst muteert zou de cache bederven')
      .not.toMatch(/(telbareTx\([^)]*\)|vorautBron\(\)|periodTx\(\))\.(sort|push|splice|reverse|shift|pop|unshift)\(/);
  });
});
