/* v273: de betaaldatum als EIGEN veld naast t.date, en verder niets.
 *
 * DE AANLEIDING is gemeten bij v272: `t.date` is een bankkalender. mt940 levert de valutadatum uit
 * `:61:`, psd2 en de CSV de boekdatum, en geen van de drie de dag van de betaling. Op het toestel
 * draagt maandag op `t.date` 41 procent van de scope van piekVerdeling() en het weekend 8, terwijl de
 * datum in de desc maandag 11 en het weekend 35 geeft.
 *
 * WAT DEZE RONDE WEL EN NIET DOET. Wel: `t.betaalDatum` en `t.betaalTijd` afleiden in `categorize()`,
 * dus zelfherstellend bij elke boot en bij elke regelwijziging. Niet: iets aan het gedrag van de app.
 * `t.date` blijft onaangeroerd, het saldo en de dagteller blijven op de boekdatum, en GEEN ENKELE
 * app-functie leest het veld. Dat laatste is hier een bronzoekende test, want het is de hele
 * afbakening van de ronde en niet iets wat je aan een schermtekst afleest.
 *
 * WAT DE FIXTURE DRAAGT, en elke bewering hieronder is een test (v260):
 *  - een BEA-kaartbetaling met een datum en tijd twee dagen vóór zijn boekdatum, groot genoeg om de
 *    weekdagverdeling te verschuiven (t.date op maandag, betaald op zaterdag);
 *  - een tweede kaartbetaling waarvan de betaaldatum samenvalt met de boekdatum, zodat de
 *    vergelijking twee kanten heeft;
 *  - een eCom-regel met een tijd, en een regel die alleen op `BETAALPAS` matcht;
 *  - een INCASSO met een datum in zijn desc: die krijgt GEEN veld, want dat is de vervaldag;
 *  - een GEA-opname met een datum en tijd: ook GEEN veld, want een opname is geen betaling;
 *  - een kaartbetaling met een datum ver buiten het venster: verworpen, niet gecorrigeerd;
 *  - een psd2-desc die verdubbeld is met een afgekapte kop zonder datum ervoor;
 *  - een niet-kaartregel met "Terugkerend per 02.02.2026" erin, die niets mag krijgen.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const MAANDAG = new Date(now); MAANDAG.setDate(MAANDAG.getDate() - ((now.getDay() + 6) % 7) - 7);
const ZATERDAG = new Date(MAANDAG); ZATERDAG.setDate(ZATERDAG.getDate() - 2);
const WOENSDAG = new Date(MAANDAG); WOENSDAG.setDate(WOENSDAG.getDate() + 2);
// nl-notatie zoals ABN in de :86:-regel: dd.mm.yy
const dd = (d) => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2);
const ABN = '999100200';

function seed() {
  const tx = [];
  const add = (id, date, amount, name, desc) => tx.push({ id, date, amount, acc: ABN, name, desc,
    typ: '', ref: '', src: 'mt940', accName: '', refNums: [] });
  add('inc', ymd(MAANDAG), 4000, 'Loonstrook', 'SALARIS MAANDELIJKS');
  /* Vijf oudere volle weken, zodat blok 9 zes volle voorbije kalenderweken heeft om uit te schrijven.
     Elke vuller staat op de MAANDAG van zijn week: valt hij later in de week, dan ligt de maandag vóór
     de eerste boeking en is die week niet vol. De descs dragen GEEN datum en geen kaart-kenmerk, dus ze
     krijgen het veld niet en raken de tellingen van blok 10 niet. */
  for (let w = 1; w <= 5; w++) {
    const d = new Date(MAANDAG); d.setDate(d.getDate() - 7 * w);
    add('f' + w, ymd(d), -(40 + w), 'Vomar', 'SEPA OVERBOEKING VOMAR DAGELIJKSE BOODSCHAPPEN');
  }
  // 1) de kaartbetaling die de verdeling verschuift: geboekt op maandag, betaald op zaterdag
  add('k1', ymd(MAANDAG), -300, 'Albert Heijn',
    'BEA, BETAALPAS ALBERT HEIJN 1234,PAS123 NR:AB1C2D, ' + dd(ZATERDAG) + '/14:32 PURMEREND');
  // 2) betaaldatum gelijk aan de boekdatum
  add('k2', ymd(WOENSDAG), -50, 'Albert Heijn',
    'BEA, BETAALPAS ALBERT HEIJN 1234,PAS123 NR:XY9Z8W, ' + dd(WOENSDAG) + '/09:05 PURMEREND');
  // 3) eCom met een tijd
  add('k3', ymd(WOENSDAG), -9.99, 'PLAYSTATION',
    'eCom, Betaalpas PLAYSTATION NR:TERMBNET, ' + dd(WOENSDAG) + '/13:06 Hilversum');
  // 4) alleen BETAALPAS, zonder BEA/eCom ervoor
  add('k4', ymd(WOENSDAG), -20, 'Vomar', 'AANKOOP BETAALPAS VOMAR NR:9911, ' + dd(WOENSDAG) + '/17:45');
  // 5) een incasso MET een datum in de desc: dat is de vervaldag, geen betaalmoment
  add('i1', ymd(MAANDAG), -33, 'Basic Fit Nederland B.V.',
    '/TRTP/SEPA INCASSO ALGEMEEN DOORLOPEND/NAME/Basic Fit Nederland B.V./REMI/TERMIJN ' + dd(WOENSDAG));
  // 6) een opname met een datum en tijd: geen betaling
  add('g1', ymd(MAANDAG), -120, 'Geldmaat',
    'GEA, BETAALPAS GELDMAAT ZWANEBLOEM NR:LS41T6, ' + dd(ZATERDAG) + '/11:02 PURMEREND');
  // 7) een kaartbetaling met een datum ver buiten het venster
  add('v1', ymd(WOENSDAG), -15, 'Splif', 'BEA, BETAALPAS SPLIF PURMEREND NR:990199, 01.01.20/12:00');
  // 8) een psd2-desc die verdubbeld is: de afgekapte kop draagt geen datum
  add('d1', ymd(WOENSDAG), -13, 'WEEZEVENT',
    'BEA, Betaalpas WEEZEVENT NR:16721156, 19.0 BEA, Betaalpas WEEZEVENT NR:16721156, ' + dd(WOENSDAG) + '/05:01 DIJON');
  // 9) een niet-kaartregel met een datum erin
  add('n1', ymd(WOENSDAG), -8, 'Abonnement', 'SEPA OVERBOEKING TERUGKEREND PER 02.02.2026 ABONNEMENT');
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 4000,
      manualBal: { [ABN]: 3000 }, budgets: { boodschappen: 400, overig: 200 } }),
    minder_own: JSON.stringify([ABN]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof betaalMoment === 'function');
}
/* De boekingen worden op BEDRAG opgezocht en niet op de id uit de fixture: `categorize()` overschrijft
   `t.id` met zijn eigen hash, dus een meegegeven id bestaat na de boot niet meer. Alle bedragen in deze
   fixture zijn verschillend, en dat is zelf een test hieronder. */
const veld = (page) => page.evaluate(() => {
  const o = {};
  for (const t of TX) o[String(t.amount)] = t.betaalDatum ? (t.betaalDatum + (t.betaalTijd ? ' ' + t.betaalTijd : '')) : null;
  return o;
});
const BEDRAG = { k1: '-300', k2: '-50', k3: '-9.99', k4: '-20', i1: '-33', g1: '-120', v1: '-15', d1: '-13', n1: '-8' };

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('de weekdagen liggen vast en de kaartregel valt echt in de scope', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const k1 = TX.find(t => t.amount === -300);
      const wd = (d) => (new Date(String(d).slice(0, 10) + 'T00:00:00').getDay() + 6) % 7;
      const bedragen = TX.map(t => t.amount);
      return { wdBoek: wd(k1.date), wdBetaald: k1.betaalDatum ? wd(k1.betaalDatum) : null,
        cat: catOf(k1), vast: isFixed(k1), geenNorm: geenNorm(catOf(k1)),
        unieke: new Set(bedragen).size === bedragen.length,
        idOverschreven: !TX.some(t => t.id === 'k1') };
    });
    expect(r.wdBoek).toBe(0);      // geboekt op maandag
    expect(r.wdBetaald).toBe(5);   // betaald op zaterdag
    expect(r.cat).toBe('boodschappen');
    expect(r.vast).toBe(false);
    expect(r.geenNorm).toBe(false);
    // de twee aannames waarop de rest van deze spec leunt
    expect(r.unieke).toBe(true);
    expect(r.idOverschreven).toBe(true);
  });
});

test.describe('1 - het veld staat alleen op een kaartbetaling', () => {
  test('BEA, eCom en Betaalpas krijgen het veld, met hun tijd', async ({ page }) => {
    await boot(page);
    const v = await veld(page);
    expect(v[BEDRAG.k1]).toBe(ymd(ZATERDAG) + ' 14:32');
    expect(v[BEDRAG.k2]).toBe(ymd(WOENSDAG) + ' 09:05');
    expect(v[BEDRAG.k3]).toBe(ymd(WOENSDAG) + ' 13:06');
    expect(v[BEDRAG.k4]).toBe(ymd(WOENSDAG) + ' 17:45');
  });

  test('een incasso krijgt het veld NIET, want de desc noemt de vervaldag', async ({ page }) => {
    await boot(page);
    const v = await veld(page);
    expect(v[BEDRAG.i1]).toBe(null);
  });

  test('een opname krijgt het veld niet, ook al staat er BETAALPAS in', async ({ page }) => {
    await boot(page);
    const v = await veld(page);
    expect(v[BEDRAG.g1]).toBe(null);
    // en de reden is de GEA-poort en niet een ontbrekende datum in de desc
    const heeftDatum = await page.evaluate(() => /\d{2}\.\d{2}\.\d{2}/.test(TX.find(t => t.amount === -120).desc));
    expect(heeftDatum).toBe(true);
  });

  test('een niet-kaartregel met een datum erin krijgt niets', async ({ page }) => {
    await boot(page);
    const v = await veld(page);
    expect(v[BEDRAG.n1]).toBe(null);
  });

  test('een datum buiten het venster wordt verworpen en niet gecorrigeerd', async ({ page }) => {
    await boot(page);
    const v = await veld(page);
    expect(v[BEDRAG.v1]).toBe(null);
    const grens = await page.evaluate(() => ({ voor: BETAALDATUM_VOOR, na: BETAALDATUM_NA }));
    expect(grens.voor).toBeGreaterThan(0);
    expect(grens.na).toBeGreaterThan(0);
  });

  test('een verdubbelde desc levert gewoon zijn datum, en test de tie-break NIET', async ({ page }) => {
    await boot(page);
    const v = await veld(page);
    expect(v[BEDRAG.d1]).toBe(ymd(WOENSDAG) + ' 05:01');
    /* TOETS EERST DE INVOER (de meetles van v268): deze desc draagt maar EEN volledig datumpatroon,
       want de afgekapte kop eindigt op "19.0". Eerste of laatste treffer maakt hier dus niets uit, en
       de sabotage die de laatste neemt blijft daarom groen. Dat is geen invariant die deze fixture kan
       bewijzen, en die eerlijkheid staat hier zwart op wit in plaats van in een fixture die het geval
       verzint. Blok 10 telt op de echte gegevens hoe vaak het wel uitmaakt. */
    const n = await page.evaluate(() => {
      const t = TX.find(x => x.amount === -13);
      return (t.desc.match(/\d{2}[.\-\/]\d{2}[.\-\/]\d{2}/g) || []).length;
    });
    expect(n).toBe(1);
  });
});

test.describe('2 - het veld is zelfherstellend en blijft niet staan', () => {
  test('categorize() wist het zodra de poort niet meer geldt', async ({ page }) => {
    await boot(page);
    /* Het veld staat in TX en gaat dus mee in save(). Zonder wissen zou een oude waarde blijven staan
       zodra de poort of de grens verandert, en dan leest een afgeleide als data. */
    const r = await page.evaluate(() => {
      const t = TX.find(x => x.amount === -33);
      t.betaalDatum = '2020-01-01'; t.betaalTijd = '00:00';
      categorize(t);
      return { datum: t.betaalDatum === undefined, tijd: t.betaalTijd === undefined };
    });
    expect(r.datum).toBe(true);
    expect(r.tijd).toBe(true);
  });

  test('t.date wordt niet aangeraakt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const voor = TX.map(t => t.amount + '=' + t.date).join(',');
      TX.forEach(categorize);
      return { gelijk: TX.map(t => t.amount + '=' + t.date).join(',') === voor };
    });
    expect(r.gelijk).toBe(true);
  });
});

test.describe('3 - geen enkele app-functie leest het veld', () => {
  test('elke treffer in de bron zit in betaalMoment, categorize of een diagnoseblok', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const totaal = (src.match(/betaal(Datum|Tijd)/g) || []).length;
    expect(totaal).toBeGreaterThan(5);
    /* De som over de toegestane functies moet het totaal zijn. Leest een app-functie het veld, dan
       telt die treffer nergens mee en valt deze test. Dat is de hele afbakening van v273. */
    const stuk = (naam, eind) => { const i = src.indexOf(naam); const j = src.indexOf(eind, i);
      expect(i, naam + ' niet gevonden').toBeGreaterThan(-1); expect(j).toBeGreaterThan(i); return src.slice(i, j); };
    const delen = [
      stuk('function betaalMoment(t, metReden){', '\nfunction categorize(t){'),
      stuk('function categorize(t){', '\n/* ---------- CSV parser'),
      stuk('function diagPiekdag(){', '\nfunction diagDubbel(){'),
      stuk('function diagDubbel(){', '\nconst DIAG_BLOKKEN=['),
      // de comment boven de afleiding noemt het veld ook
      stuk('/* ===== DE BETAALDATUM (v273) =====', 'const KAART_RE'),
    ];
    const binnen = delen.reduce((a, d) => a + (d.match(/betaal(Datum|Tijd)/g) || []).length, 0);
    expect(binnen).toBe(totaal);
  });

  test('de cijfers van de app zijn identiek met en zonder het veld', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = thisYM();
      /* `totals()` geeft ook `list` terug, en dat zijn de TRANSACTIE-OBJECTEN zelf. Het veld reist
         daar dus mee, en een snapshot die `list` meeneemt meet zijn eigen aanwezigheid in plaats van
         het gedrag van de app. Hieronder blijft `list` eruit, en direct daarna staat de meting dat het
         verschil in `list` UITSLUITEND die twee velden is: meereizen is niet gelezen worden. */
      const zonderList = (o) => { const x = Object.assign({}, o); delete x.list; return x; };
      const snap = () => JSON.stringify({ t: zonderList(totals(m)), s: safeToSpend(), c: catSpendMap(m),
        vp: varPotjeStand(m), d: daysElapsed(m), ins: (document.querySelector('#s-ins') || {}).innerText || '' });
      /* Eerst renderen en dan pas de eerste snapshot: anders vergelijkt de test een niet-gerenderd
         scherm met een gerenderd scherm en meet hij het renderen in plaats van het veld. */
      try { render(); } catch (_) {}
      const met = snap();
      for (const t of TX) { delete t.betaalDatum; delete t.betaalTijd; }
      try { render(); } catch (_) {}
      const zonder = snap();
      if (met === zonder) return { gelijk: true, verschil: '' };
      const a = JSON.parse(met), b = JSON.parse(zonder);
      const uit = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
      return { gelijk: false, verschil: uit.join(', ') };
    });
    expect(r.gelijk, 'verschilt op: ' + r.verschil).toBe(true);
  });

  test('het veld reist mee in totals().list en verandert daar niets anders', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = thisYM();
      const sleutels = (o) => Object.keys(o).sort().join(',');
      const voor = totals(m).list.map(sleutels);
      const metVeld = totals(m).list.filter(t => t.betaalDatum).length;
      for (const t of TX) { delete t.betaalDatum; delete t.betaalTijd; }
      const na = totals(m).list.map(sleutels);
      const extra = new Set();
      voor.forEach((k, i) => { const a = k.split(','), b = new Set(na[i].split(','));
        a.filter(x => !b.has(x)).forEach(x => extra.add(x)); });
      return { metVeld, extra: [...extra].sort(), evenLang: voor.length === na.length };
    });
    expect(r.evenLang).toBe(true);
    expect(r.metVeld).toBeGreaterThan(0);
    // precies twee velden erbij en geen enkel ander verschil in de objecten
    expect(r.extra).toEqual(['betaalDatum', 'betaalTijd']);
  });
});

test.describe('4 - blok 10 legt de twee kalenders naast elkaar, alleen op de kaartregels', () => {
  test('de tellingen en de verschuiving staan erin', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagDubbel().join(String.fromCharCode(10)));
    expect(t).toContain('BOEKDATUM TEGEN BETAALDATUM (het veld t.betaalDatum, alleen kaartbetalingen)');
    expect(t).toMatch(/boekingen MET het veld:\s+5/);   // k1 k2 k3 k4 d1
    expect(t).toMatch(/een datum in de desc maar GEEN veld: 4/);   // i1 g1 v1 n1
    /* PER REDEN, en die komt uit betaalMoment zelf. De eerste vorm telde de opname mee onder
       "afgevallen op de plausibiliteitsgrens", en dat is een verkeerd etiket op een teller. */
    expect(t).toContain('buiten het venster: 1');                        // v1
    expect(t).toContain('een opname (GEA), geen betaling: 1');            // g1
    expect(t).toContain('geen kaart-kenmerk (BEA/eCom/betaalpas): 2');    // i1 en n1
    expect(t).toContain('verschuift de piek: JA, van ma op t.date naar za op de betaaldatum');
    // en het blok zegt hoe vaak de tie-break uitmaakt; op deze fixture is dat nul
    expect(t).toContain('descs met MEER dan een datum-achtig patroon: 0');
    expect(t).toMatch(/weekend \(za\+zo\):\s+0% op t\.date tegen \d+% op de betaaldatum/);
  });
});

test.describe('5 - blok 9 draait dezelfde weken ook op de betaaldatum', () => {
  test('de pas bestaat, noemt zijn dekking en leest het veld', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagPiekdag().join(String.fromCharCode(10)));
    expect(t).toContain('DEZELFDE WEKEN OP DE BETAALDATUM (t.betaalDatum waar die er is, anders t.date)');
    expect(t).toMatch(/dekking in deze \d+ weken: \d+ van \d+/);
    expect(t).toContain('telling duurste weekdag op betaaldatum:');
    expect(t).toContain('op betaaldatum:  hoogste weekdag-telling');
    // de kaartbetaling van 300 schuift van maandag naar zaterdag, dus de twee tellingen verschillen
    const opTx = /telling duurste weekdag op t\.date:\s+(.+)/.exec(t);
    const opBet = /telling duurste weekdag op betaaldatum:\s+(.+)/.exec(t);
    expect(opTx).toBeTruthy();
    expect(opBet).toBeTruthy();
    expect(opTx[1]).not.toBe(opBet[1]);
  });
});
