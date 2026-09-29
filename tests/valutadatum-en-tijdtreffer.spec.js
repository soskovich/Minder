/* v276: de treffer met een tijd wint, en de valutadatum uit de respons wordt opgevangen.
 *
 * DE AANLEIDING is de uitkomst van v275 op het toestel, en die bestaat uit twee losse vondsten.
 * (1) Van de 52 descs met meer dan één datum kreeg er precies ÉÉN een veld, en dat veld was FOUT: een
 * Apple-abonnement draagt "TERUGKEREND PER 02.02.2026" twee keer en daarna het echte moment
 * "02.03.26/03:03". De eerste treffer won, lag 28 dagen terug en kwam binnen het venster van 45 dagen door.
 * In de maanden waarin die ingangsdatum verder terug lag viel de boeking juist af op het venster, dus
 * dezelfde desc gaf een verkeerd veld of geen veld.
 * (2) Op de rekening met twee bronnen is `t.date` bij mt940 de valutadatum en die is in 42 van de 42
 * gevallen gelijk aan de betaaldatum uit de desc; bij psd2 is het de boekdatum en die klopt in 148 van de
 * 265. De psd2-boekdatum draagt over 287 niet-kaartregels NUL procent weekend, want een bank boekt niet op
 * zaterdag of zondag.
 *
 * WAT DEZE RONDE WEL EN NIET DOET. Wel: de tie-break op de treffer met een tijd, `t.valutaDatum` uit
 * `raw.value_date` opvangen, een teller in blok 10, en twee etiketten die onwaar waren. Niet: één cijfer in
 * de app. `t.date` blijft de boekdatum en GEEN ENKELE app-functie leest het nieuwe veld.
 *
 * WAT DE FIXTURE DRAAGT, en elke bewering hieronder is een test (v260):
 *  - twee Apple-descs in de vorm van het toestel: twee treffers ZONDER tijd en één MET, één waarbij de
 *    ingangsdatum binnen het venster van 45 dagen valt (daar zette de oude regel een verkeerd veld) en
 *    één waarbij hij erbuiten valt (daar zette de oude regel niets);
 *  - een desc waarin BEIDE treffers een tijd dragen: daar blijft de eerste winnen, dus de regel is een
 *    voorkeur voor een EIGENSCHAP en niet voor de laatste positie;
 *  - psd2-boekingen met een opgeslagen `valutaDatum`, sommige gelijk aan `t.date` en sommige in het
 *    weekend terwijl `t.date` op maandag ligt, want dat is de vorm die de teller moet kunnen tonen;
 *  - `mapPsd2Tx()` wordt rechtstreeks aangeroepen met een ruwe regel, want dat is de enige plek waar het
 *    veld ontstaat en een import is in een test niet na te bootsen.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { sectieVan } = require('./bron-sectie');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const MA = new Date(now); MA.setDate(MA.getDate() - ((now.getDay() + 6) % 7) - 7);
const ZA = new Date(MA); ZA.setDate(ZA.getDate() - 2);
const ZO = new Date(MA); ZO.setDate(ZO.getDate() - 1);
const WO = new Date(MA); WO.setDate(WO.getDate() + 2);
const BINNEN = new Date(WO); BINNEN.setDate(BINNEN.getDate() - 28);   // binnen BETAALDATUM_VOOR (45)
const BUITEN = new Date(WO); BUITEN.setDate(BUITEN.getDate() - 60);   // erbuiten
// dd.mm.yy zoals ABN achter een kaart-kenmerk, en dd.mm.yyyy zoals in de abonnementstekst
const dd = (d) => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getFullYear()).slice(2);
const dd4 = (d) => String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
const ABN = '999100200';

const apple = (start, boek) => 'eCom, TERUGKEREND PER ' + dd4(start) + ' APPLE.COM eCom, TERUGKEREND PER '
  + dd4(start) + ' APPLE.COM/BILL Betaalpas NR:00207013, ' + dd(boek) + '/03:03 CORK, Land: IRL';

function seed() {
  const tx = [];
  const add = (date, amount, src, name, desc, extra) => tx.push(Object.assign({ id: 'x' + tx.length,
    date: ymd(date), amount, acc: ABN, src, name, desc, typ: '', ref: '', accName: '', refNums: [] }, extra || {}));
  add(MA, 4000, 'mt940', 'Loonstrook', 'SALARIS MAANDELIJKS');
  /* DE TIE-BREAK. Twee Apple-descs met dezelfde vorm als op het toestel: de eerste twee treffers dragen
     GEEN tijd, de derde wel. Het verschil tussen de twee regels is of de ingangsdatum binnen het venster
     valt, en dat is precies wat de oude regel van een verkeerd veld in geen veld liet omslaan. */
  add(WO, -1.09, 'psd2', 'APPLE.COM', apple(BINNEN, WO));
  add(WO, -2.09, 'psd2', 'APPLE.COM', apple(BUITEN, WO));
  /* BEIDE TREFFERS MET EEN TIJD: hier blijft de eerste winnen en valt de boeking af op het venster. */
  add(WO, -16, 'psd2', 'Kiosk', 'BEA, BETAALPAS KIOSK NR:77, ' + dd(BUITEN) + '/12:00 EN ' + dd(WO) + '/13:00');
  /* EEN GEWONE KAARTBETALING met één treffer, als tegenhanger: daar verandert niets. */
  add(MA, -300, 'psd2', 'Albert Heijn', 'BEA, Betaalpas Albert Heijn NR:AB1C2D, ' + dd(ZA) + '/14:32 PURMEREND');
  /* DE VALUTADATUM, opgeslagen zoals na een import: twee regels waar hij AFWIJKT (weekend tegen maandag)
     en een waar hij GELIJK is, zodat de teller beide kanten kan tonen. */
  add(MA, -120, 'psd2', 'Vomar', 'Vomar PMNT', { valutaDatum: ymd(ZA) });
  add(MA, -60, 'psd2', 'Plus de Gors', 'Plus de Gors PMNT', { valutaDatum: ymd(ZO) });
  add(WO, -40, 'psd2', 'Splif', 'Splif PMNT', { valutaDatum: ymd(WO) });
  /* EEN PSD2-REGEL ZONDER HET VELD, want de teller moet de dekking kunnen noemen. */
  add(WO, -20, 'psd2', 'Etos', 'Etos PMNT');
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 4000,
      manualBal: { [ABN]: 3000 }, budgets: { boodschappen: 500, overig: 400, vices: 200, abonnement: 100 } }),
    minder_own: JSON.stringify([ABN]),
    minder_accmeta: JSON.stringify({ [ABN]: { balance: 3000, date: ymd(now), bank: 'ABN AMRO' } }),
    minder_plan: '{}' };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof mapPsd2Tx === 'function');
}
const veld = (page, bedrag) => page.evaluate((b) => {
  const t = TX.find((x) => x.amount === b); if (!t) return 'ONTBREEKT';
  return { datum: t.betaalDatum || null, tijd: t.betaalTijd || null, vd: t.valutaDatum || null,
    reden: (betaalMoment(t, true) || {}).reden || null };
}, bedrag);
const sectie5 = (page) => page.evaluate(() => {
  const L = diagDubbel(); const i = L.findIndex((x) => /^5\. DE VALUTADATUM UIT DE PSD2-RESPONS/.test(x));
  return i < 0 ? '' : L.slice(i).join(String.fromCharCode(10));
});

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('alle bedragen zijn verschillend, zodat opzoeken op bedrag eenduidig is', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ n: TX.length, uniek: new Set(TX.map((t) => t.amount)).size }));
    expect(r.uniek).toBe(r.n);
  });

  /* DE TWEE APPLE-DESCS MOETEN WERKELIJK DRIE TREFFERS DRAGEN, waarvan precies EEN met een tijd. Zonder
     die meting op de invoer toetst de tie-break niets en zou een sabotage groen blijven (de meetles). */
  test('de Apple-descs dragen drie treffers waarvan precies een met een tijd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const re = new RegExp(BETAALDATUM_RE.source, 'g');
      return [-1.09, -2.09].map((b) => {
        const t = TX.find((x) => x.amount === b);
        const m = [...String(t.desc).matchAll(re)];
        return { treffers: m.length, metTijd: m.filter((x) => x[4]).length, eersteHeeftTijd: !!(m[0] && m[0][4]) };
      });
    });
    for (const x of r) { expect(x.treffers).toBe(3); expect(x.metTijd).toBe(1); expect(x.eersteHeeftTijd).toBe(false); }
  });

  test('de Kiosk-desc draagt twee treffers die BEIDE een tijd dragen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const re = new RegExp(BETAALDATUM_RE.source, 'g');
      const m = [...String(TX.find((x) => x.amount === -16).desc).matchAll(re)];
      return { treffers: m.length, metTijd: m.filter((x) => x[4]).length };
    });
    expect(r.treffers).toBe(2);
    expect(r.metTijd).toBe(2);
  });
});

test.describe('1 - de treffer met een tijd wint', () => {
  /* HET GEMETEN GEVAL: de oude regel nam de eerste treffer, en dat was de ingangsdatum van het abonnement.
     Nu is het veld de dag van de boeking zelf, met de tijd erbij. */
  test('de Apple-regel binnen het venster krijgt de datum MET de tijd, niet de ingangsdatum', async ({ page }) => {
    await boot(page);
    const r = await veld(page, -1.09);
    const boek = await page.evaluate(() => TX.find((x) => x.amount === -1.09).date);
    expect(r.datum).toBe(boek);
    expect(r.tijd).toBe('03:03');
  });

  /* DEZELFDE DESC MET DE INGANGSDATUM BUITEN HET VENSTER viel onder de oude regel volledig af. Nu krijgt
     hij hetzelfde, juiste veld: de regel repareert een fout EN vult een gat. */
  test('de Apple-regel buiten het venster krijgt nu wel een veld', async ({ page }) => {
    await boot(page);
    const r = await veld(page, -2.09);
    const boek = await page.evaluate(() => TX.find((x) => x.amount === -2.09).date);
    expect(r.datum).toBe(boek);
    expect(r.tijd).toBe('03:03');
  });

  /* DE REGEL IS EEN VOORKEUR VOOR EEN EIGENSCHAP EN NIET VOOR DE LAATSTE POSITIE. Dragen beide treffers
     een tijd, dan wint de eerste nog steeds en wordt er niet doorgezocht, precies zoals bij v274. */
  test('met twee treffers met een tijd wint de eerste, en er wordt niet doorgezocht', async ({ page }) => {
    await boot(page);
    const r = await veld(page, -16);
    expect(r.datum).toBe(null);
    expect(r.reden).toBe('buiten het venster');
  });

  test('een desc met een enkele treffer verandert niet', async ({ page }) => {
    await boot(page);
    const r = await veld(page, -300);
    expect(r.tijd).toBe('14:32');
  });
});

test.describe('2 - de valutadatum wordt opgevangen en verder niets', () => {
  const ruw = (over) => Object.assign({
    transaction_amount: { amount: '-12.34' }, credit_debit_indicator: 'DBIT',
    booking_date: '2026-09-21', value_date: '2026-09-19',
    creditor: { name: 'Albert Heijn' }, remittance_information: 'Boodschappen',
    creditor_account: {}, bank_transaction_code: { description: 'PMNT' } }, over || {});

  test('mapPsd2Tx zet het veld uit raw.value_date en laat t.date de boekdatum', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((raw) => { const t = mapPsd2Tx(raw, '999100200');
      return { date: t.date, vd: t.valutaDatum || null }; }, ruw());
    expect(r.date).toBe('2026-09-21');
    expect(r.vd).toBe('2026-09-19');
  });

  test('zonder value_date komt er geen lege sleutel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((raw) => { const t = mapPsd2Tx(raw, '999100200');
      return { heeft: 'valutaDatum' in t, date: t.date }; }, ruw({ value_date: undefined }));
    expect(r.heeft).toBe(false);
    expect(r.date).toBe('2026-09-21');
  });

  test('een onleesbare value_date wordt verworpen en niet gecorrigeerd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((raw) => ({ heeft: 'valutaDatum' in mapPsd2Tx(raw, '999100200') }),
      ruw({ value_date: '19-09-2026' }));
    expect(r.heeft).toBe(false);
  });

  /* ZONDER booking_date IS t.date ZELF DE VALUTADATUM, want mapPsd2Tx leest
     booking_date || value_date || transaction_date. Dan zijn de twee per constructie gelijk, en het blok
     zegt dat erbij zodat "gelijk" niet als meting leest. */
  test('zonder booking_date zijn t.date en de valutadatum per constructie gelijk', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((raw) => { const t = mapPsd2Tx(raw, '999100200');
      return { date: t.date, vd: t.valutaDatum || null }; }, ruw({ booking_date: undefined }));
    expect(r.date).toBe('2026-09-19');
    expect(r.vd).toBe('2026-09-19');
  });

  /* DE ZWAARSTE EIS: het veld mag t.id NIET raken. Die hasht over rekening, datum, bedrag en omschrijving,
     en zou het veld meetellen, dan kreeg elke bestaande boeking bij een herimport een nieuwe id en verloor
     je je overrides en je vlaggen (v270). */
  test('t.id is identiek met en zonder het veld', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((raw) => {
      const zonder = Object.assign({}, raw); delete zonder.value_date;
      return { met: mapPsd2Tx(raw, '999100200').id, zonder: mapPsd2Tx(zonder, '999100200').id };
    }, ruw());
    expect(r.met).toBe(r.zonder);
  });

  /* HET IS DATA EN GEEN AFLEIDING, en daarom mag categorize() hem niet wissen zoals hij t.betaalDatum
     wist zodra de poort niet meer geldt. Een boot herleest TX en draait categorize() over alles. */
  test('een boot laat een opgeslagen valutadatum staan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const t = TX.find((x) => x.amount === -120);
      const voor = t.valutaDatum; categorize(t);
      return { voor, na: t.valutaDatum || null };
    });
    expect(r.voor).toBeTruthy();
    expect(r.na).toBe(r.voor);
  });

  /* GEEN ENKELE APP-FUNCTIE LEEST HET VELD, en dat is de hele afbakening. Dit is dezelfde bronzoekende
     vorm als betaaldatum-veld.spec.js bij v273: elke treffer in de bron moet in een SETTER of in het
     diagnoseblok liggen, anders telt hij nergens mee en valt deze test.
     DE TWEEDE SETTER IS ERBIJ GEKOMEN BIJ v277 (`commitTx()` verrijkt een bestaande boeking), en daarvoor is
     deze lijst verbreed. Dat is precies het geval waarvoor verbreden mag: een echte schrijver. Bij v276 viel
     dezelfde vorm op een COMMENT en toen is de lijst juist NIET verbreed, want dan zou een echte lezer erdoor
     glippen. Hoeveel schrijvers er zijn staat als eigen eis in valutadatum-verrijking.spec.js. */
  /* v302: DE SNEDE LIEP TOT HET REGISTER EN NIET TOT HET EINDE VAN HET BLOK, en daarmee vielen blok 11,
     12 en 13 er ook in. Dat is meetles (t), en `v295` heeft die vorm in drie andere specs al gerepareerd;
     deze bleef staan. GEMETEN wat hij verborg: van de zestien treffers liggen er elf BUITEN `diagDubbel`,
     namelijk zeven in `commitTx()` (die stonden in de tweede snede) en DRIE in `diagVoorautorisatie()`.
     Die derde lezer stond niet in de titel en niet in de lijst: blok 12 leest de valutadatum als
     kandidaat-scheider bij een reservering (v293), dus hij hoort er wel te zijn, alleen ongenoemd.
     Een test die drie plekken noemt terwijl er vier zijn is groen op een onware bewering.
     ELKE SNEDE IS NU `sectieVan()`, dus de buurfunctie doet niet meer mee: een blok erbij verbreedt geen
     enkele snede meer, en een lezer in een vijfde functie laat deze test vallen. */
  test('elke treffer in de bron zit in mapPsd2Tx, commitTx, blok 10 of blok 12', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const totaal = (src.match(/valutaDatum/g) || []).length;
    expect(totaal).toBeGreaterThan(3);
    const delen = [
      'function mapPsd2Tx(raw, accId, pending){',
      'function commitTx(',
      'function diagDubbel(){',
      'function diagVoorautorisatie(){',
    ].map((van) => sectieVan(src, van));
    const binnen = delen.reduce((a, d) => a + (d.match(/valutaDatum/g) || []).length, 0);
    expect(binnen, 'geen enkele andere functie leest het veld').toBe(totaal);
  });
});

test.describe('3 - de teller in blok 10', () => {
  test('hij telt per rekening en noemt hoeveel er afwijken van t.date', async ({ page }) => {
    await boot(page);
    const t = await sectie5(page);
    expect(t).toContain('5. DE VALUTADATUM UIT DE PSD2-RESPONS');
    // acht psd2-regels, drie met het veld, twee daarvan anders dan t.date
    expect(t).toMatch(/psd2-boekingen in totaal: 8\s+met een valutadatum: 3/);
    /* v282: DE BANKNAAM STAAT NIET MEER IN DE ASSERTIE. Deze fixture heeft geen koppel-entry, dus
       `buildAccMeta()` kan de bank niet weten en noemt hem `onbekend` in plaats van de oude hardgecodeerde
       terugval ABN AMRO. Wat de test moet vasthouden is de TELLING en dat de regel dezelfde naam draagt die
       de app zelf voor die rekening heeft; de naam zelf komt daarom uit ACCMETA. */
    const bank = await page.evaluate(() => (ACCMETA['999100200'] || {}).bank);
    expect(bank, 'zonder koppel-entry en zonder IBAN valt er niets te weten').toBe('onbekend');
    expect(t).toMatch(new RegExp('999100200\\s+bank ' + bank + '\\s+psd2-boekingen\\s+8\\s+met valutadatum\\s+3\\s+waarvan ANDERS dan t\\.date 2'));
  });

  /* DE TWEE REEKSEN LOPEN OVER DEZELFDE REGELS, en dat is toetsbaar zonder de code na te rekenen: beide
     zijn aandelen van hetzelfde gedekte bedrag, dus ze tellen elk tot honderd op (v274). */
  test('de twee weekdagreeksen zijn aandelen van hetzelfde gedekte bedrag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel();
      const som = (kop) => { const rij = L.find((x) => x.includes(kop)); if (!rij) return null;
        return (rij.match(/(\d+)%/g) || []).reduce((a, b) => a + parseInt(b, 10), 0); };
      return { tx: som('die regels op t.date:'), vd: som('die regels op valutadatum:') };
    });
    for (const k of ['tx', 'vd']) { expect(r[k], k).toBeGreaterThanOrEqual(97); expect(r[k], k).toBeLessThanOrEqual(103); }
  });

  test('het weekend schuift omhoog op de valutadatum en de piek verschuift', async ({ page }) => {
    await boot(page);
    const t = await sectie5(page);
    expect(t).toMatch(/weekend: 0% op t\.date tegen \d+% op de valutadatum/);
    expect(t).toMatch(/verschuift de piek: JA, van ma naar/);
  });

  /* EEN NUL HIER IS GEEN VONDST, en het blok zegt dat zelf: het veld ontstaat bij de import en niet bij de
     boot. Zonder die regel leest een nul als "de bank levert hem niet", en dat zijn twee verschillende
     dingen. SINDS v277 kan het blok die twee wel scheiden, met de teller van `commitTx()`; dat de twee
     takken elk hun eigen tekst dragen staat in valutadatum-verrijking.spec.js. */
  test('het blok scheidt "nog niet gesynchroniseerd" van "de bron levert hem niet"', async ({ page }) => {
    await boot(page);
    const t = await sectie5(page);
    expect(t).toContain('dit veld wordt bij de IMPORT gezet en niet bij de boot afgeleid');
    const leeg = await page.evaluate(() => {
      for (const x of TX) delete x.valutaDatum;
      const L = diagDubbel(); const i = L.findIndex((y) => /^5\. DE VALUTADATUM/.test(y));
      return L.slice(i).join(String.fromCharCode(10));
    });
    expect(leeg).toContain('GEEN ENKELE psd2-boeking draagt het veld');
    expect(leeg).toContain('Synchroniseer eerst.');
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

test.describe('4 - de twee etiketten', () => {
  /* PMNT IS GEEN N26-KENMERK: hij komt uit raw.bank_transaction_code.description, die mapPsd2Tx IN de desc
     zet, dus elke psd2-bron kan hem dragen. Bij v275 stond een ABN-rekening onder "de N26-vorm". */
  test('de stijlnaam noemt PMNT niet meer een N26-vorm', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagDubbel().join(String.fromCharCode(10)));
    expect(t).toContain('PMNT (de psd2-code)');
    expect(t).not.toContain('PMNT (de N26-vorm)');
    /* en hij staat hier op een psd2-rekening ZONDER koppel-entry, precies het geval waarop het etiket
       omviel. Sinds v282 heet zo'n rekening `onbekend` en niet meer ABN AMRO; wat de test vasthoudt is dat
       meting 1 dezelfde naam draagt als blok 8 over dezelfde rekening, en dat was de reparatie van v275. */
    const r = await page.evaluate(() => ({ bank: (ACCMETA['999100200'] || {}).bank,
      acht: diagRekeningen().join(String.fromCharCode(10)) }));
    expect(t).toMatch(new RegExp('999100200\\s+bank ' + r.bank));
    expect(t).not.toMatch(/999100200\s+bank -/);
    const regel8 = r.acht.split(String.fromCharCode(10)).find((x) => /^\s+bank:/.test(x)) || '';
    expect(regel8.trim(), 'blok 8 en meting 1 mogen niet iets anders zeggen over dezelfde rekening').toBe('bank:               ' + r.bank);
  });

  /* DE VOETREGEL BELOOFDE IETS WAT DE CODE NIET DOET, en dat is de meetles over een label naast een
     gerepareerde afleiding: sinds v275 leest bankVan() eerst ACCMETA, en deze fixture heeft de bank
     daar en juist NIET in SET.psd2Accounts. */
  test('de voetregel onder meting 1 noemt de afleiding die de code werkelijk gebruikt', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagDubbel().join(String.fromCharCode(10)));
    expect(t).toContain('(de bank komt uit ACCMETA en anders uit SET.psd2Accounts, dezelfde afleiding als blok 8)');
    expect(t).not.toContain('staat er dus alleen bij een gekoppelde rekening');
    const gekoppeld = await page.evaluate(() => Object.keys(SET.psd2Accounts || {}).length);
    expect(gekoppeld).toBe(0);
  });
});
