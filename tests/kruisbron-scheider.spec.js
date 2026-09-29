/* v301: TWEE METINGEN OVER DE KRUISBRON-PAREN, EN GEEN ENKELE REPARATIE.
 *
 * (1) DE DRIE BAKKEN. Het plafond van v300 zegt hoeveel er ten hoogste dubbel telt; de bakken zeggen
 *     bij hoeveel daarvan de app een HARDE identiteit heeft (beide kanten een betaaldatum EN hetzelfde
 *     moment), bij hoeveel het moment verschilt, en bij hoeveel er geen veld is. Dat laatste is een
 *     GRENS en geen gebrek: zonder kaart-kenmerk in de desc bestaat het veld per constructie niet (v273).
 * (2) DE VENSTERREGEL VAN v284, NU VOOR mt940. Dezelfde vraag als bij de csv-rekeningen: is de
 *     mt940-kant binnen het psd2-venster een DEELVERZAMELING van psd2. Zo ja, dan kan dezelfde
 *     vensterregel hem uitsluiten; zo nee, dan zijn de niet-gematchte regels de prijs.
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o):
 * REKENING A, voor de bakken:
 *  - een paar met aan BEIDE kanten een kaart-desc met HETZELFDE moment (harde identiteit);
 *  - een paar met aan beide kanten een kaart-desc op dezelfde DAG maar met een ANDERE TIJD. Zonder dit
 *    geval is "gelijk moment" niet van "gelijke datum" te onderscheiden;
 *  - een paar met het veld aan precies EEN kant, en een paar met het veld aan GEEN van beide. Zonder
 *    dat verschil is de telling "waarvan aan een kant wel" inert;
 *  - een INTERN paar. Dat staat in het aantal paren en in GEEN bak, want het draagt geen uitgave.
 *    Zonder dit geval telt het aantal bakken per constructie op tot het aantal paren.
 * REKENING B, voor de vensterregel:
 *  - twee mt940-regels met een psd2-tegenhanger 0 en 1 dag LATER;
 *  - een mt940-regel waarvan de enige psd2-kandidaat 2 dagen EERDER ligt. Die mag NIET matchen, want de
 *    afstand is gericht; met een absolute afstand zou hij dat wel doen. Dat is het enige geval waarop
 *    die twee vormen uiteenlopen;
 *  - TWEE mt940-regels van hetzelfde bedrag met EEN psd2-kandidaat: een-op-een, dus er matcht er precies
 *    een, en dat is de dichtstbijzijnde;
 *  - een niet-gematchte mt940-regel die INTERN is. Die telt in het aantal en niet in de euro's, dus
 *    zonder dat geval is de prijs niet van de telling te onderscheiden;
 *  - een mt940-regel BUITEN het psd2-venster. Die raakt een vensterregel per definitie niet.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { sectieVan } = require('./bron-sectie');

const A = '521200806';      // de rekening met de veld-varianten
const B = '636222403';      // de rekening met de vensterregel

/* een kaart-desc zoals ABN hem levert; daar leest betaalMoment() de betaaldatum en -tijd uit. */
const kaart = (naam, d, t) => 'BEA, BETAALPAS ' + naam + ' NR:LS41T6, ' + d + '/' + t + ' PURMEREND KAARTNUMMER: **1720';
/* een psd2-desc zonder kaart-kenmerk: die krijgt per constructie geen betaaldatum (v273). */
const kaal = (naam) => naam + ' Purmerend PMNT';

function seed() {
  const tx = []; let i = 0;
  const add = (acc, src, date, amount, name, desc) => {
    tx.push({ id: 'x' + (i++), date, amount, acc, src, name, desc, typ: '', ref: '', accName: '', refNums: [] });
  };

  // A1 harde identiteit: beide kanten kaart, hetzelfde moment
  add(A, 'mt940', '2026-06-12', -60, 'Plus de Gors', kaart('PLUS DE GORS', '12.06.26', '15:58'));
  add(A, 'psd2', '2026-06-13', -60, 'Plus de Gors', kaart('Plus de Gors', '12.06.26', '15:58'));
  // A2 beide kanten kaart, dezelfde dag maar een ANDERE tijd
  add(A, 'mt940', '2026-06-15', -45, 'Vomar', kaart('VOMAR', '15.06.26', '09:05'));
  add(A, 'psd2', '2026-06-16', -45, 'Vomar', kaart('Vomar', '15.06.26', '19:40'));
  // A3 het veld aan precies EEN kant
  add(A, 'mt940', '2026-06-18', -31, 'Etos', kaart('ETOS', '18.06.26', '11:22'));
  add(A, 'psd2', '2026-06-19', -31, 'Etos', kaal('Etos'));
  // A4 aan geen van beide kanten een veld
  add(A, 'mt940', '2026-06-21', -22, 'Bakker', kaal('Bakker'));
  add(A, 'psd2', '2026-06-22', -22, 'Bakker', kaal('Bakker'));
  // A5 een INTERN paar: wel een paar, geen bak
  add(A, 'mt940', '2026-06-24', -150, 'Geldmaat', 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM');
  add(A, 'psd2', '2026-06-25', -150, 'Geldmaat', kaal('Geldmaat GM Zwanebloe'));

  // B: het psd2-venster loopt van 03-01 t/m 03-31; deze twee zetten die randen en paren met niets
  add(B, 'psd2', '2026-03-01', -11, 'Rand voor', kaal('Rand voor'));
  add(B, 'psd2', '2026-03-31', -12, 'Rand na', kaal('Rand na'));
  // B1 tegenhanger 1 dag later
  add(B, 'mt940', '2026-03-10', -80, 'Jumbo', kaal('Jumbo'));
  add(B, 'psd2', '2026-03-11', -80, 'Jumbo', kaal('Jumbo'));
  // B2 tegenhanger op dezelfde dag
  add(B, 'mt940', '2026-03-12', -70, 'Hema', kaal('Hema'));
  add(B, 'psd2', '2026-03-12', -70, 'Hema', kaal('Hema'));
  // B3 de enige kandidaat ligt EERDER: mag niet matchen
  add(B, 'mt940', '2026-03-20', -90, 'Gamma', kaal('Gamma'));
  add(B, 'psd2', '2026-03-18', -90, 'Gamma', kaal('Gamma'));
  // B4 twee mt940-regels, een kandidaat: er matcht er precies een, de dichtstbijzijnde
  add(B, 'mt940', '2026-03-05', -55, 'Kiosk', kaal('Kiosk'));
  add(B, 'mt940', '2026-03-06', -55, 'Kiosk', kaal('Kiosk'));
  add(B, 'psd2', '2026-03-07', -55, 'Kiosk', kaal('Kiosk'));
  // B5 niet gematcht EN intern: telt in het aantal, niet in de euro's
  add(B, 'mt940', '2026-03-22', -200, 'Geldmaat', 'GEA, BETAALPAS GELDMAAT KOESTRAAT');
  // B6 buiten het psd2-venster
  add(B, 'mt940', '2026-02-10', -40, 'Praxis', kaal('Praxis'));

  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 3000,
      manualBal: { [A]: 2000, [B]: 500 }, budgets: { boodschappen: 400, overig: 300 } }),
    minder_own: JSON.stringify([A, B]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagDubbel === 'function');
  await page.evaluate(() => { window.REGELS_ = () => diagDubbel().join(String.fromCharCode(10)); });
}
const regels = (page) => page.evaluate(() => REGELS_());
/* de 4d-uitvoer van EEN rekening, want section 4 draait per rekening met twee bronnen en twee
   rekeningen met dezelfde koppen zijn anders niet te scheiden (meetles h/j). */
const blokVan = (t, acc) => {
  const i = t.indexOf('  rekening ' + acc + ' ');
  expect(i, 'rekening ' + acc + ' staat in de uitvoer').toBeGreaterThan(-1);
  const j = t.indexOf('\n  rekening ', i + 1), k = t.indexOf('WAT 4a TOT 4c SAMEN', i);
  const eind = (j > -1 && j < k) ? j : k;
  return t.slice(i, eind > -1 ? eind : undefined);
};

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('de velden staan waar ze horen, en het interne paar draagt geen uitgave', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(([a, b]) => {
      const bij = (acc, bedrag) => TX.filter((t) => t.acc === acc && t.amount === bedrag)
        .map((t) => ({ src: t.src, bd: t.betaalDatum || null, bt: t.betaalTijd || null,
          ty: CATS[catOf(t)].type, scope: piekInScope(t) }));
      return { a60: bij(a, -60), a45: bij(a, -45), a31: bij(a, -31), a22: bij(a, -22), a150: bij(a, -150),
        b90: bij(b, -90), b200: bij(b, -200),
        bronnenA: [...new Set(TX.filter((t) => t.acc === a).map((t) => t.src))].sort(),
        bronnenB: [...new Set(TX.filter((t) => t.acc === b).map((t) => t.src))].sort() };
    }, [A, B]);
    expect(r.bronnenA, 'rekening A draagt twee bronnen').toEqual(['mt940', 'psd2']);
    expect(r.bronnenB, 'rekening B draagt twee bronnen').toEqual(['mt940', 'psd2']);
    // het veld komt uit de desc en wordt bij de boot gezet; de fixture schrijft het niet zelf (meetles u)
    expect(r.a60.map((x) => x.bd + ' ' + x.bt), 'A1 draagt aan beide kanten hetzelfde moment')
      .toEqual(['2026-06-12 15:58', '2026-06-12 15:58']);
    expect(r.a45.map((x) => x.bd), 'A2 draagt aan beide kanten dezelfde DAG').toEqual(['2026-06-15', '2026-06-15']);
    expect(r.a45.map((x) => x.bt), 'maar een andere TIJD').toEqual(['09:05', '19:40']);
    expect(r.a31.filter((x) => x.bd).length, 'A3 draagt het veld aan precies een kant').toBe(1);
    expect(r.a22.filter((x) => x.bd).length, 'A4 draagt het veld aan geen van beide kanten').toBe(0);
    expect(r.a150.map((x) => x.ty), 'A5 is intern en draagt dus geen uitgave').toEqual(['internal', 'internal']);
    expect(r.b90.map((x) => x.ty), 'B3 is wel een uitgave').toEqual(['expense', 'expense']);
    expect(r.b90.every((x) => x.scope), 'en valt in de scope van piekVerdeling()').toBe(true);
    expect(r.b200.map((x) => x.ty), 'B5 is intern').toEqual(['internal']);
    expect(r.b200.every((x) => !x.scope), 'en valt dus buiten de scope').toBe(true);
  });
});

test.describe('1 - de drie bakken over de paren die geld dragen', () => {
  test('harde identiteit, verschillend moment en geen veld staan elk apart', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect(t).toContain('harde identiteit, beide kanten het veld en GELIJK moment: 1 paren, 60 euro');
    expect(t).toContain('beide kanten het veld, VERSCHILLEND moment:               1 paren, 45 euro');
  });

  test('de derde bak zegt erbij hoeveel er aan EEN kant wel een veld dragen', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect(t).toContain('geen veld aan minstens een kant:                          7 paren, 403 euro   (waarvan aan EEN kant wel: 1)');
  });

  test('de drie bakken tellen op tot het plafond, en het interne paar zit in geen van drie', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    /* tien paren, negen met een uitgave: het interne paar staat in het AANTAL en in geen bak. Zonder
       dat verschil zou deze aansluiting per constructie kloppen en dus niets toetsen. */
    expect(t).toContain('met VERSCHILLENDE bron: 10   (in de IMPORT, dus op TX)');
    expect(t).toContain('de drie samen: 9 paren, 508 euro   tegen het plafond 9 paren, 508 euro   sluit aan: JA');
  });
});

test.describe('2 - de vensterregel van v284, nu voor mt940', () => {
  test('alleen de mt940-regels binnen het psd2-venster doen mee', async ({ page }) => {
    await boot(page);
    const b = blokVan(await regels(page), B);
    expect(b).toContain('het psd2-venster op deze rekening: 2026-03-01 t/m 2026-03-31');
    expect(b).toContain('mt940-regels BINNEN dat venster: 6 van 7   (erbuiten: 1, die raakt een vensterregel niet)');
  });

  test('de afstand is gericht: een psd2-kant die ERVOOR ligt matcht niet', async ({ page }) => {
    await boot(page);
    const b = blokVan(await regels(page), B);
    /* B1 (1 dag later), B2 (dezelfde dag) en de dichtstbijzijnde helft van B4 matchen; B3 heeft zijn
       enige kandidaat 2 dagen ERVOOR en blijft dus staan. Met een absolute afstand zouden het er 4 zijn. */
    expect(b).toContain('GEMATCHT 3 van 6 (50%)');
    expect(b).toContain('verdeling van de dagafstand: 0d 1, 1d 2, 2d 0, 3d 0, 4d 0, 5d 0, 6d 0');
  });

  test('de prijs telt de euro-s in scope en niet elke niet-gematchte regel', async ({ page }) => {
    await boot(page);
    const b = blokVan(await regels(page), B);
    /* drie regels vinden niets: B3 (90), de verste helft van B4 (55) en de interne opname van 200.
       Die laatste telt nergens als uitgave, dus de prijs is 145 over twee boekingen. */
    expect(b).toContain('NIET GEMATCHT (mt940): 3   in de scope van piekVerdeling(): 2 boekingen, 145 euro netto');
  });

  test('de andere rekening krijgt zijn eigen 4d en de twee lopen niet door elkaar', async ({ page }) => {
    await boot(page);
    const t = await regels(page);
    expect((t.match(/4d\. DE VENSTERREGEL VAN v284/g) || []).length, 'beide rekeningen dragen twee bronnen').toBe(2);
    const a = blokVan(t, A);
    /* GEMETEN EN NIET VOORSPELD: op rekening A ligt de EERSTE mt940-regel (06-12) een dag VOOR de eerste
       psd2-regel (06-13), want die psd2-regel is zijn eigen tegenhanger. Hij valt daarmee buiten het
       venster en doet niet mee. Dat is de vensterrand die (c) van blok 11 bij de csv-kant noemt, nu aan
       de mt940-kant: een uitsluiting op venster raakt de oudste regel van de import per constructie niet.
       De vier die wel meedoen matchen alle vier, dus de deelverzameling-vraag staat hier op ja. */
    expect(a).toContain('het psd2-venster op deze rekening: 2026-06-13 t/m 2026-06-25');
    expect(a).toContain('mt940-regels BINNEN dat venster: 4 van 5   (erbuiten: 1, die raakt een vensterregel niet)');
    expect(a).toContain('GEMATCHT 4 van 4 (100%)');
  });
});

test.describe('3 - de bron: een toewijzing, geen tweede formulering', () => {
  const sectie = () => sectieVan(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'), 'function diagDubbel(){');

  test('4d leest _eenOpEen() en drukt de toewijzing niet opnieuw uit', () => {
    const s = sectie();
    expect(s).toContain('_eenOpEen(');
    expect(s, 'geen eigen venster-constante naast die van de parenscan').toContain('DIAG_PAAR_VENSTER, laterDan');
    /* de richting is het enige verschil met (d) van blok 11, en hij staat op een plek */
    expect((s.match(/laterDan=/g) || []).length).toBe(1);
  });

  test('de aansluiting wordt gerekend en niet geschreven', () => {
    const s = sectie();
    /* EEN SABOTAGE DIE 'JA' HARDCODEERT BLIJFT GROEN, en dat is geen gat in deze test maar een
       eigenschap van de regel: in een gezonde stand IS de uitkomst JA, dus de tekst is identiek.
       GEMETEN dat de regel wel werkt: een sabotage die de bak-som met een euro verhoogt laat hem
       'sluit aan: NEE' schrijven (9 paren, 517 tegen 508) en zet de test hierboven rood. Wat deze
       assertie tegenhoudt is dat een volgende ronde de vergelijking door een letterlijke JA
       vervangt; dat is de keuze van v284 over een guard die vanuit de verse stand niet valt. */
    expect(s).toContain("(bakN===nImp && bakE===Math.round(plafondImp))?'JA':'NEE'");
  });

  test('de bakken lezen dezelfde kant als het plafond', () => {
    const s = sectie();
    /* een tweede uitdrukking van "welke kant draagt het geld" zou bij de eerste wijziging uiteenlopen
       (v104); de bak telt daarom binnen dezelfde `if(kant)` als het plafond. */
    expect((s.match(/const kant=\[p\.a,p\.b\]\.find/g) || []).length).toBe(1);
    expect(s).toContain('bak[bk].eur+=-kant.amount');
  });
});
