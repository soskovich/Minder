/* v274: de drie metingen die beslissen welke as de piekdag eerlijk kan dragen.
 *
 * DE AANLEIDING is de uitkomst van v273: de betaaldatum-pas van blok 9 haalde op het toestel een
 * dekking van 35 van 3.161 euro, ÉÉN procent, en dus een telling die karakter voor karakter gelijk is
 * aan die op `t.date`. Punt 1 is daarmee niet beslist en ook niet heropend: de pas zegt niets. De
 * oorzaak zit in de bron, want alleen ABN zet `BEA, ... dd.mm.yy/hh:mm` in zijn regel en een N26-desc is
 * de kale tegenpartij plus `PMNT`. Wat er nog niet gemeten was, is de dekking PER BRON en PER REKENING,
 * en zonder die uitsplitsing is "N26 levert het moment niet" afgeleid uit tegenpartijnamen.
 *
 * WAT DEZE RONDE WEL EN NIET DOET. Wel: drie metingen in blok 10, en één patroon voor de datum in de
 * bron. Niet: iets aan de piekdag. Er wordt niets op een as gebouwd voordat meting 1 en 3 samen zeggen
 * welke as eerlijk is, en dat is precies waarom het blok zijn eigen conclusie NIET trekt: hij zet de
 * cijfers neer en noemt de drie uitkomsten die eruit kunnen volgen.
 *
 * WAT DE FIXTURE DRAAGT, en elke bewering hieronder is een test (v260):
 *  - een ABN-rekening (mt940) met kaartbetalingen die op maandag boeken en op zaterdag betaald zijn,
 *    dus met het veld en met een piek die verschuift;
 *  - een N26-rekening (psd2) met `PMNT`-regels die op zaterdag en zondag boeken en GEEN veld dragen,
 *    dus de vraag of `t.date` daar al de betaaldag is;
 *  - een `PMNT`-regel die een INCASSO is: die moet uit meting 3 vallen, en hij komt maar één keer voor,
 *    dus `isFixed()` ziet hem niet en de scope van piekVerdeling() laat hem er wel in;
 *  - een wallet-regel zonder datum: kaartachtig, maar zonder veld, want KAART_RE laat hem er niet in;
 *  - een GEA-opname met `BETAALPAS` in zijn desc: die is geen betaling en dus niet kaartachtig;
 *  - drie descs met meer dan één datum-patroon: één waarin alle treffers dezelfde dag noemen (de
 *    tie-break is daar inert), één met twee verschillende dagen waar de eerste treffer het veld zet, en
 *    één waarin de eerste treffer buiten het venster valt en er NIET wordt doorgezocht.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const MA = new Date(now); MA.setDate(MA.getDate() - ((now.getDay() + 6) % 7) - 7);
const ZA = new Date(MA); ZA.setDate(ZA.getDate() - 2);
const ZO = new Date(MA); ZO.setDate(ZO.getDate() - 1);
const WO = new Date(MA); WO.setDate(WO.getDate() + 2);
// dd.mm.yy, zoals ABN het in de :86:-regel zet
const dd = (d) => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2);
const ABN = '999100200';
const N26 = '370400449876543210';

function seed() {
  const tx = [];
  const add = (date, amount, acc, src, name, desc) => tx.push({ id: 'x' + tx.length, date: ymd(date),
    amount, acc, src, name, desc, typ: '', ref: '', accName: '', refNums: [] });
  add(MA, 4000, ABN, 'mt940', 'Loonstrook', 'SALARIS MAANDELIJKS');
  // ABN: kaartbetalingen met het veld, geboekt op maandag en betaald op zaterdag
  add(MA, -300, ABN, 'mt940', 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN 1234,PAS123 NR:AB1C2D, ' + dd(ZA) + '/14:32 PURMEREND');
  add(MA, -110, ABN, 'mt940', 'Vomar', 'BEA, BETAALPAS VOMAR NR:9911, ' + dd(ZA) + '/10:00 PURMEREND');
  // en één waarvan de betaaldatum samenvalt met de boekdatum
  add(WO, -45, ABN, 'mt940', 'Splif', 'BEA, BETAALPAS SPLIF NR:990199, ' + dd(WO) + '/12:00 PURMEREND');
  // kaartachtig maar zonder veld: KAART_RE laat een wallet-regel er niet in
  add(WO, -26, ABN, 'mt940', 'Etos', 'Apple Pay AANKOOP ETOS PURMEREND');
  // een opname: BETAALPAS staat erin, maar GEA is geen betaling
  add(MA, -120, ABN, 'mt940', 'Geldmaat', 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM NR:LS41T6, ' + dd(ZA) + '/11:02');
  // N26: PMNT-regels, geen kaart-kenmerk en geen tijd, geboekt in het weekend
  add(ZA, -85, N26, 'psd2', 'Absolute', 'Absolute PMNT');
  add(ZO, -65, N26, 'psd2', 'Plus de Gors', 'Plus de Gors PMNT');
  add(MA, -21, N26, 'psd2', 'Vomar', 'Vomar PMNT');
  // een PMNT-regel die een incasso is: hoort niet in meting 3
  add(WO, -31, N26, 'psd2', 'Basic Fit', 'Basic Fit PMNT SEPA INCASSO ALGEMEEN DOORLOPEND');
  // drie descs met meer dan een datum-patroon
  add(WO, -13, ABN, 'mt940', 'WEEZEVENT', 'BEA, Betaalpas WEEZEVENT NR:16721156, ' + dd(WO) + '/05:01 BEA, Betaalpas WEEZEVENT NR:16721156, ' + dd(WO) + '/05:01 DIJON');
  add(WO, -14, ABN, 'mt940', 'Shell', 'BEA, BETAALPAS SHELL NR:1234, ' + dd(WO) + '/08:00 TERMIJN ' + dd(ZA));
  add(WO, -16, ABN, 'mt940', 'Kiosk', 'BEA, BETAALPAS KIOSK NR:77, 01.01.20/12:00 EN ' + dd(WO) + '/13:00');
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 4000,
      manualBal: { [ABN]: 3000, [N26]: 500 },
      psd2Accounts: { [N26]: { uid: 'u1', iban: 'NL00TEST0123456789', label: 'Main', bank: 'N26' } },
      budgets: { boodschappen: 500, overig: 300, sport: 50 } }),
    minder_own: JSON.stringify([ABN, N26]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagDubbel === 'function');
}
const blok = (page) => page.evaluate(() => diagDubbel().join(String.fromCharCode(10)));
/* De boekingen worden op BEDRAG opgezocht: `categorize()` overschrijft `t.id` met zijn eigen hash, dus
   een meegegeven id bestaat na de boot niet meer. Dat alle bedragen verschillen is zelf een test. */
const opBedrag = (page, bedrag) => page.evaluate((b) => {
  const t = TX.find((x) => x.amount === b); if (!t) return null;
  return { acc: t.acc, src: t.src, date: t.date, cat: catOf(t), veld: t.betaalDatum || null,
    tijd: t.betaalTijd || null, fixed: isFixed(t), incasso: isIncasso(t) };
}, bedrag);

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('alle bedragen zijn verschillend, zodat opzoeken op bedrag eenduidig is', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ n: TX.length, uniek: new Set(TX.map((t) => t.amount)).size }));
    expect(r.uniek).toBe(r.n);
  });

  test('twee rekeningen en twee bronnen, en de N26-regels dragen geen veld', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      rek: [...new Set(TX.map((t) => t.acc))].sort(),
      bron: [...new Set(TX.map((t) => t.src))].sort(),
      n26Veld: TX.filter((t) => t.acc === '370400449876543210' && t.betaalDatum).length,
      abnVeld: TX.filter((t) => t.acc === '999100200' && t.betaalDatum).length }));
    expect(r.rek).toEqual(['370400449876543210', '999100200']);
    expect(r.bron).toEqual(['mt940', 'psd2']);
    expect(r.n26Veld).toBe(0);      // geen kaart-kenmerk en geen datum in de desc
    expect(r.abnVeld).toBeGreaterThan(3);
  });

  /* DE INCASSO-REGEL MOET IN DE SCOPE VAN piekVerdeling() VALLEN, anders toetst de sabotage op meting 3
     niets: valt hij daar toch al uit, dan kan de eigen uitsluiting weg zonder dat een test het ziet.
     Dat is de meetles over een test die niet kan falen. */
  test('de PMNT-incasso is een incasso, is NIET vast, en valt dus binnen piekVerdeling()', async ({ page }) => {
    await boot(page);
    const t = await opBedrag(page, -31);
    expect(t.incasso).toBe(true);
    expect(t.fixed).toBe(false);    // één voorkomen, dus recurringKeys() ziet hem niet
    const inScope = await page.evaluate(() => { const t = TX.find((x) => x.amount === -31);
      const c = catOf(t); return !!(CATS[c] && CATS[c].type === 'expense' && !isFixed(t) && !geenNorm(c)); });
    expect(inScope).toBe(true);
  });

  test('de weekend-regels van N26 staan op zaterdag en zondag, de ABN-kaartregels boeken op maandag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const wd = (d) => (new Date(String(d).slice(0, 10) + 'T00:00:00').getDay() + 6) % 7;
      const v = (b) => wd(TX.find((t) => t.amount === b).date);
      return { za: v(-85), zo: v(-65), ma: v(-300), betaald: wd(TX.find((t) => t.amount === -300).betaalDatum) }; });
    expect(r.za).toBe(5); expect(r.zo).toBe(6); expect(r.ma).toBe(0); expect(r.betaald).toBe(5);
  });
});

test.describe('1 - de dekking staat per bron EN per rekening, en de maat is het bedrag', () => {
  test('beide tabellen staan er, met de bank bij de rekening', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('1. DE DEKKING VAN HET VELD PER BRON EN PER REKENING');
    expect(t).toContain('  per bron:');
    expect(t).toContain('  per rekening:');
    expect(t).toMatch(/mt940 .*met het veld/);
    expect(t).toMatch(/psd2 .*met het veld/);
    expect(t).toMatch(/370400449876543210\s+bank N26/);
  });

  /* DE MAAT IS HET BEDRAG, net als in blok 9: een dekking in aantal zegt niets over een verdeling die
     op euro's weegt. Daarom staat er per rij een gedekt bedrag van een totaal en een percentage. */
  test('elke rij noemt het gedekte bedrag van het totaal in de scope van piekVerdeling()', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    const rijen = t.split('\n').filter((r) => /in de scope van piekVerdeling\(\):/.test(r));
    expect(rijen.length).toBeGreaterThanOrEqual(4);   // twee bronnen plus twee rekeningen
    for (const r of rijen) expect(r).toMatch(/\d+ van \d+ euro/);
  });

  /* DE UITSPLITSING IS DE HELE MEETVRAAG: is het veld bij de ene bron vol en bij de andere leeg, dan zou
     een as op de betaaldatum een derde kalender zijn. Op deze fixture is psd2 nul procent gedekt.
     DE GETALLEN STAAN ER VOLUIT, en dat is geen strengheid maar de enige vorm die kan vallen: de sabotage
     die per boeking telt in plaats van per euro gaf hier 5 van 7 tegen 482 van 524, en dat is bij deze
     bedragen allebei boven de helft. Een assertie op 'meer dan de helft' bleef dus groen op precies de
     eigenschap die deze meting draagt (zie de meetlessen).
     482 is 300 + 110 + 45 + 13 + 14, de kaartregels met het veld; 524 is dat plus de wallet-regel van 26
     en de verworpen Kiosk-regel van 16. Bij psd2 is 202 gelijk aan 85 + 65 + 21 + 31. */
  test('de dekking is een aandeel van het BEDRAG en niet van het aantal boekingen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel();
      const i = L.findIndex((x) => /^1\. DE DEKKING/.test(x));
      const j = L.findIndex((x, n) => n > i && /^  per rekening:/.test(x));
      const pak = (van, tot, kop) => { const deel = L.slice(van, tot);
        const k = deel.findIndex((x) => x.trim().startsWith(kop)); if (k < 0) return null;
        const m = (deel[k + 1] || '').match(/(\d+) van (\d+) euro gedekt = (\d+)%/);
        return m ? { gedekt: +m[1], totaal: +m[2], pct: +m[3] } : null; };
      return { bron: { mt940: pak(i, j, 'mt940'), psd2: pak(i, j, 'psd2') },
        rek: { abn: pak(j, L.length, '999100200'), n26: pak(j, L.length, '370400449876543210') } };
    });
    expect(r.bron.mt940).toEqual({ gedekt: 482, totaal: 524, pct: 92 });
    expect(r.bron.psd2).toEqual({ gedekt: 0, totaal: 202, pct: 0 });
    // op deze fixture draagt elke rekening precies een bron, dus de twee tabellen moeten samenvallen
    expect(r.rek.abn).toEqual(r.bron.mt940);
    expect(r.rek.n26).toEqual(r.bron.psd2);
  });

  test('een opname is niet kaartachtig, ook al staat BETAALPAS in zijn desc', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel(); const i = L.findIndex((x) => /1\. DE DEKKING/.test(x));
      const rij = L.slice(i).find((x) => /kaart \(BEA\/eCom\/betaalpas\)/.test(x)) || '';
      const m = rij.match(/kaart \(BEA\/eCom\/betaalpas\) (\d+)/);
      const opname = TX.find((t) => t.amount === -120);
      return { kaart: m ? +m[1] : null, opnameCat: catOf(opname) };
    });
    /* zes BEA/betaalpas-regels in de fixture, en de GEA-opname hoort er niet bij */
    expect(r.kaart).toBe(6);
    expect(r.opnameCat).toBe('intern');
  });

  test('de wallet-regel staat als eigen stijl en draagt geen veld', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('wallet (Apple/Google Pay) 1');
    expect((await opBedrag(page, -26)).veld).toBe(null);
  });

  test('het blok zegt dat psd2 geen tijd bewaart, en dat dat nagelezen is', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('psd2 bewaart GEEN tijd, en gooit value_date weg zodra booking_date bestaat');
  });
});

test.describe('2 - de descs met meer dan een datum staan uitgeschreven', () => {
  test('de telling scheidt dezelfde dag van meer dan een dag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel(); const i = L.findIndex((x) => /^2\. DE DESCS/.test(x));
      const deel = L.slice(i, i + 6).join(String.fromCharCode(10));
      const pak = (re) => { const m = deel.match(re); return m ? +m[1] : null; };
      return { totaal: pak(/descs met meer dan een treffer: (\d+)/),
        zelfde: pak(/DEZELFDE dag: (\d+)/),
        meer: pak(/MEER dan een dag:\s+(\d+)/),
        zonder: pak(/waarvan zonder veld:\s+(\d+)/) };
    });
    /* drie descs: de verdubbelde (één dag), Shell (twee dagen, veld gezet) en Kiosk (twee dagen, de
       eerste treffer verworpen en er wordt niet doorgezocht) */
    expect(r.totaal).toBe(3);
    expect(r.zelfde).toBe(1);
    expect(r.meer).toBe(2);
    expect(r.zonder).toBe(1);
  });

  /* DEZE TEST PINT DE HUIDIGE TIE-BREAK MEE, en dat is met opzet en niet per ongeluk. Het doorzoeken en
     de keuze welke treffer wint zijn niet los te toetsen: de doorval is alleen te zien als de GEKOZEN
     treffer wordt verworpen terwijl een andere plausibel was. De sabotage die de LAATSTE treffer neemt
     zet daarom beide kanten rood, en dat is eerlijk, want v273 heeft vastgelegd dat 'de eerste treffer
     wint' een AFSPRAAK is en geen meting. Wordt die afspraak ooit herzien op de 52 echte descs, dan valt
     deze test met opzet en hoort hij herschreven; dat is dezelfde vorm als het pinnen van de kapotte
     pending-tak in rekeningen-diagnose.spec.js (v270).
     DE KIOSK-REGEL IS GECONSTRUEERD EN NIET GEMETEN. Hij bewijst dus niets over hoe vaak dit voorkomt of
     welke treffer de juiste is; dat blijft de meting op het toestel. Wat hij vastlegt is dat het label
     'waarvan zonder veld' in meting 2 waar is. */
  test('betaalMoment valt niet door naar een latere treffer', async ({ page }) => {
    await boot(page);
    expect((await opBedrag(page, -16)).veld).toBe(null);     // eerste treffer 01.01.20, buiten het venster
    expect((await opBedrag(page, -14)).veld).not.toBe(null);  // eerste treffer plausibel
  });

  test('elke uitgeschreven regel noemt zijn treffers, zijn dagen en wat het veld werd', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('2. DE DESCS MET MEER DAN EEN DATUM-ACHTIG PATROON');
    expect(t).toMatch(/treffers: >"/);          // het teken staat bij de gekozen treffer
    expect(t).toMatch(/dagen: \d{2}\.\d{2}\.\d{2} \/ \d{2}\.\d{2}\.\d{2}/);
    expect(t).toMatch(/geen veld: buiten het venster/);
  });

  /* HERSCHREVEN BIJ v278, en de code was niet fout: deze test eiste dat een VERWORPEN regel geen teken
     draagt, met de redenering dat het teken bij het veld hoort. Dat is de oude betekenis. Het teken staat
     bij de treffer die `betaalMoment()` KOOS, en juist bij een verworpen regel is dat de informatie die
     je wil: welke van de treffers is weggegooid. Zonder dat teken neemt de tekst 'de gekozen treffer is
     verworpen' aan wat ze beweert. De nieuwe assertie is sterker dan de oude, want ze pint WELKE treffer
     het teken draagt in plaats van dat er geen is. */
  test('de verworpen regel markeert de treffer die betaalMoment koos', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel(); const i = L.findIndex((x) => /01\.01\.20/.test(x) && /treffers:/.test(x));
      const t = TX.find((x) => /01\.01\.20/.test(String(x.desc || '')));
      return { regel: i < 0 ? null : L[i], bm: t ? betaalMoment(t, true) : null };
    });
    expect(r.regel).not.toBe(null);
    expect(r.bm, 'de fixture draagt de verworpen desc').not.toBe(null);
    expect(r.bm.reden).toBe('buiten het venster');
    expect(r.bm.treffer).toBeTruthy();
    expect(r.regel).toContain('>"' + r.bm.treffer + '"');
    expect((r.regel.match(/>/g) || []).length).toBe(1);
  });
});

test.describe('3 - de weekdagverdeling op t.date per rekening en per stijl', () => {
  test('elke rekening staat met zijn eigen stijl, bank en bronnen', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('3. DE WEEKDAGVERDELING OP t.date PER REKENING EN PER STIJL');
    expect(t).toMatch(/999100200 \| kaart \(BEA\/eCom\/betaalpas\)/);
    expect(t).toMatch(/370400449876543210 \| PMNT \(de psd2-code\)/);
    expect(t).toMatch(/bank N26\s+bronnen psd2/);
  });

  /* DE MEETVRAAG ZELF: heeft de rekening zonder veld een maandagpiek of een weekend. Op deze fixture
     draagt N26 het weekend en ABN de maandag, en dat is precies de uitkomst die zegt dat `t.date` bij de
     ene bron al de betaaldag is en bij de andere niet. */
  test('de rekening zonder veld toont het weekend, de rekening met het veld de maandag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel(); const i = L.findIndex((x) => /^3\. DE WEEKDAG/.test(x));
      const uit = L.slice(i);
      const pak = (kop) => { const k = uit.findIndex((x) => x.includes(kop));
        if (k < 0) return null;
        const reg = uit.slice(k, k + 5).find((x) => /grootste weekdag/.test(x)) || '';
        const m = reg.match(/grootste weekdag (\w+)\s+maandag (\d+)%\s+weekend \(za\+zo\) (\d+)%/);
        return m ? { piek: m[1], ma: +m[2], wknd: +m[3] } : null; };
      return { n26: pak('370400449876543210 | PMNT'), abn: pak('999100200 | kaart') };
    });
    expect(r.n26.wknd).toBeGreaterThan(r.n26.ma);
    expect(r.abn.piek).toBe('ma');
    expect(r.abn.ma).toBeGreaterThan(r.abn.wknd);
  });

  test('bij de rekening met het veld staat de dekking erbij en verschuift de piek', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toMatch(/dekking hier: \d+ van \d+ regels, \d+ van \d+ euro \(\d+% van het bedrag\)/);
    expect(t).toMatch(/verschuift de piek: JA, van ma naar za/);
  });

  /* DE TWEE KOLOMMEN LOPEN OVER DEZELFDE REGELS, en dat is te toetsen zonder de code na te rekenen:
     beide reeksen zijn aandelen van het GEDEKTE bedrag, dus ze tellen elk tot honderd op. Rekent een van
     de twee tegen het volle bedrag van de rij, dan is het verschil tussen de kolommen vooral de dekking
     en niet de kalender, en dat is precies de val die v273 benoemde. */
  test('de twee kolommen zijn aandelen van hetzelfde gedekte bedrag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel();
      const som = (kop) => { const rij = L.find((x) => x.includes(kop)); if (!rij) return null;
        return (rij.match(/(\d+)%/g) || []).reduce((a, b) => a + parseInt(b, 10), 0); };
      return { tx: som('die regels op t.date:'), bet: som('die regels op betaaldatum:') };
    });
    /* afronding per weekdag mag een paar procent schelen, een verkeerde noemer niet */
    expect(r.tx).toBeGreaterThanOrEqual(97); expect(r.tx).toBeLessThanOrEqual(103);
    expect(r.bet).toBeGreaterThanOrEqual(97); expect(r.bet).toBeLessThanOrEqual(103);
  });

  test('bij de rekening zonder veld staat dat t.date het enige is dat er is', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel(); const i = L.findIndex((x) => x.includes('370400449876543210 | PMNT'));
      return L.slice(i, i + 5).join(String.fromCharCode(10));
    });
    expect(r).toContain('geen enkele regel hier draagt het veld');
  });

  /* DE EIGEN UITSLUITING IS NODIG en geen dubbele: `isFixed()` ziet alleen een HERKENDE herhaling, dus
     een losse incasso komt door de scope van piekVerdeling() heen. Zonder deze uitsluiting zou zijn
     bedrag in de N26-rij meetellen, en dan meet de verdeling een afschrijving mee. */
  test('een losse incasso valt uit meting 3, ook al staat hij in de scope van piekVerdeling()', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel(); const i = L.findIndex((x) => x.includes('370400449876543210 | PMNT'));
      const m = L[i].match(/(\d+) regels, som (\d+)/);
      return { n: m ? +m[1] : null, som: m ? +m[2] : null };
    });
    /* drie PMNT-regels (85, 65, 21), de incasso van 31 hoort er niet bij */
    expect(r.n).toBe(3);
    expect(r.som).toBe(171);
  });

  test('het blok noemt de drie uitkomsten die uit 1 en 3 samen kunnen volgen', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('WAT DEZE UITVOER BESLIST, samen met blok 9:');
    expect(t).toContain('mag NIET op een GEMENGDE as');
    expect(t).toContain('MEEVALLER_FACTOR (v259)');
  });
});

test.describe('4 - een patroon voor de datum, niet drie', () => {
  /* DRIE LEZERS, ÉÉN PATROON: `betaalMoment()` neemt de eerste treffer, het blok telt hoeveel treffers
     er zijn en schrijft ze uit. Stond het patroon op elk van die plekken los, dan telt het blok iets
     anders dan het veld leest, en dat is een tweede waarheid over dezelfde desc (v104). */
  test('het datum-patroon staat op precies een plek in de bron', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const kern = String.raw`(\d{2})[.\-\/](\d{2})[.\-\/](\d{2}`;
    const n = src.split(kern).length - 1;
    expect(n, 'het patroon staat ' + n + ' keer in de bron').toBe(1);
    expect(src).toContain('const BETAALDATUM_RE =');
    /* DE INVARIANT IS DAT ELKE LEZER DE CONSTANTE LEEST, en niet hoe die aanroep eruitziet. Mijn eerste
       vorm pinde de regel `const m=desc.match(BETAALDATUM_RE);` letterlijk, en die viel bij `v276` toen
       `betaalMoment()` op de treffer met een tijd ging kiezen en dus `matchAll` nodig had. De code was
       daar niet fout; de assertie stond te dicht op de implementatie (de meetles over een test die de
       implementatie vastlegt in plaats van de eigenschap). */
    expect(src).toMatch(/BETAALDATUM_RE\.source/);
    expect(src).toMatch(/desc\.matchAll\(new RegExp\(BETAALDATUM_RE\.source, *'g'\)\)/);
  });

  test('het blok telt met hetzelfde patroon waarmee het veld wordt gezet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const re = new RegExp(BETAALDATUM_RE.source, 'g');
      const eigen = TX.filter((t) => (String(t.desc || '').match(re) || []).length > 1).length;
      const L = diagDubbel();
      const m = L.join(String.fromCharCode(10)).match(/descs met MEER dan een datum-achtig patroon: (\d+)/);
      const m2 = L.join(String.fromCharCode(10)).match(/descs met meer dan een treffer: (\d+)/);
      return { eigen, oud: m ? +m[1] : null, nieuw: m2 ? +m2[1] : null };
    });
    expect(r.oud).toBe(r.eigen);
    expect(r.nieuw).toBe(r.eigen);
  });

  /* HET REGISTER GROEIT, dus een teller of een positie erop is per constructie een verkeerd anker
     (tweemaal dezelfde fout, v271 en v272). Binden op de lees-functie. */
  test('blok 10 staat als entry in DIAG_BLOKKEN en het scherm kent hem niet bij naam', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      erin: DIAG_BLOKKEN.some((b) => b.lees === diagDubbel),
      inTekst: !/diagDubbel/.test(String(diagTekst)) }));
    expect(r.erin).toBe(true);
    expect(r.inTekst).toBe(true);
  });

  test('het blok schrijft niets weg', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const echt = localStorage.setItem.bind(localStorage); let n = 0;
      localStorage.setItem = function () { n++; return echt.apply(localStorage, arguments); };
      try { diagDubbel(); } finally { localStorage.setItem = echt; }
      return n;
    });
    expect(r).toBe(0);
  });
});
