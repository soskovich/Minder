/* v286: DE TWEELINGEN BINNEN PSD2, UITGESCHREVEN. Meten, niet bouwen.
 *
 * DE AANLEIDING IS SECTIE (e) VAN BLOK 11, gemeten op het toestel: 9 overgebleven psd2-regels bij Main
 * met een tweeling (470 euro netto, 6 waarvan de tweeling OOK overbleef). (e) TELT ze en zegt niet WAT
 * ze zijn. De hypothese is de Geldmaat-vorm van v272: N26 levert dezelfde opname twee keer met een
 * gedrifte automaatnaam en zonder referentie, en dat is precies het geval dat findDuplicateIds() al
 * zou opruimen.
 *
 * DE VIJF EISEN VAN DIE VORM, en per eis het geval dat hem onderscheidt van de voor de hand liggende
 * variant (meetles o: schrijf dat op VOORDAT je de sabotages draait, en zet het in de fixture):
 *  1. ZELFDE DAG          -> een paar op afstand 1; zonder dat is de dag-eis inert;
 *  2. GEEN bankRef        -> een paar met een bankRef op EEN kant; zonder dat leest elk "anders" in
 *                            dupSig als een referentieverschil, en dat zijn twee verschillende oorzaken;
 *  3. GEEN referentie     -> een paar met twee VERSCHILLENDE cijferreeksen in de desc (de CJIB-vorm van
 *                            v272, die findDuplicateIds() juist terecht apart houdt);
 *  4. NIET twee verschillende desc-tijden -> de PLAYSTATION-vorm van v272: zelfde dag, zelfde bedrag,
 *                            13:06 tegen 19:38, en dat zijn per v281 twee betalingen;
 *  5. EEN NAAM DIE DRIFT  -> twee gevallen, want de eis heeft twee kanten: een paar met een GELIJKE
 *                            naam (geen drift, dus geen bewijs van hetzelfde) en een paar waarvan de
 *                            eerste ACHT letters verschillen (dan ziet _softKey ze niet als hetzelfde).
 * DAARNAAST VIJF GEVALLEN DIE DE KOLOMMEN EN DE PAARVORMING ERNAAST ONDERSCHEIDEN:
 *  6. EEN OVERRIDE op een kant van een verder zuiver Geldmaat-paar. Dat is de toestand van het toestel
 *     (v272: ruleCat=intern autoCat=intern OVR=overig), en zonder dat geval staat er nooit een OVR in
 *     de uitvoer en kan de kolom weg zonder dat een test het ziet;
 *  7. EEN TWEELING DIE ZELF IS GEMATCHT aan een csv-regel; zonder dat staat "beide overgebleven" altijd
 *     op JA en zegt de kolom niets;
 *  8. DRIE regels van hetzelfde bedrag op dezelfde dag; bij twee is de eis dat een boeking in hooguit
 *     EEN paar staat inert, want de tweede is na het paren toch al op;
 *  9. EEN KANDIDAAT EEN DAG ERNAAST die VOORAAN in de lijst staat en zelf is gematcht, naast een
 *     kandidaat op dezelfde dag; zonder dat geeft "de eerste vrije kandidaat" hetzelfde antwoord als
 *     "de dichtstbijzijnde dag";
 * 10. TWEE KANDIDATEN OP DEZELFDE AFSTAND waarvan de eerste is gematcht en de tweede is overgebleven;
 *     zonder dat doet de voorkeur voor een overgebleven tweeling niets;
 * 11. EEN PAAR DAT ER TWEE MIST, waarvan een reden zelf een KOMMA draagt; zonder dat staat er nooit
 *     meer dan een reden op een regel en is de scheider niet te beoordelen.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const CSV = 'N26 Zakgeld';
const PSD = '100110012848184840';

function seed() {
  const tx = [];
  const add = (acc, src, r) => tx.push({ id: acc + '_' + tx.length, date: r.d, amount: r.a, acc, src,
    name: r.n, desc: r.desc || r.n, bankRef: r.bankRef || '', typ: '', ref: '', accName: '', refNums: [] });
  const P = (r) => add(PSD, 'psd2', r);
  const C = (r) => add(CSV, 'csv', r);

  /* de richting, en twee spiegels zodat de paring op de bedragen uitkomt */
  P({ d: '2026-05-01', a: 25, n: 'in', desc: 'From Main to Zakgeld PMNT' });
  P({ d: '2026-05-01', a: -26, n: 'uit', desc: 'From Zakgeld to Main PMNT' });
  for (const [d, a] of [['2026-05-02', -13.5], ['2026-05-03', -17.25]]) {
    P({ d, a, n: 'Plus de Gors', desc: 'Plus de Gors PMNT' });
    C({ d, a, n: 'Plus de Gors' });
  }

  /* 7. de tweeling die ZELF wordt gematcht staat als eerste in TX, want _eenOpEen() pakt binnen een
        bedrag de eerste vrije kandidaat; zo blijft Tango 1 over en is zijn tweeling gematcht. */
  P({ d: '2026-05-13', a: -55, n: 'Tango Purmerend 2', desc: 'Tango Purmerend 2 PMNT' });
  P({ d: '2026-05-13', a: -55, n: 'Tango Purmerend 1', desc: 'Tango Purmerend 1 PMNT' });
  C({ d: '2026-05-13', a: -55, n: 'Tango' });

  /* 1 + 6. de zuivere Geldmaat-vorm, met een override op de tweede kant */
  P({ d: '2026-05-04', a: -180, n: 'Geldmaat Zwanebloem 9', desc: 'Geldmaat Zwanebloem 9 PMNT' });
  P({ d: '2026-05-04', a: -180, n: 'Geldmaat GM Zwanebloe', desc: 'Geldmaat GM Zwanebloe PMNT' });
  /* 3. twee verschillende referenties (de CJIB-vorm) */
  P({ d: '2026-05-05', a: -65, n: 'CJIB Verkeersboete A', desc: 'CJIB Verkeersboete A ref 1234567890' });
  P({ d: '2026-05-05', a: -65, n: 'CJIB Verkeersboete B', desc: 'CJIB Verkeersboete B ref 9876543210' });
  /* 2. een bankRef op een kant */
  P({ d: '2026-05-06', a: -44, n: 'Vomar Purmerend 1', desc: 'Vomar Purmerend 1 PMNT', bankRef: 'REF-A' });
  P({ d: '2026-05-06', a: -44, n: 'Vomar Purmerend 2', desc: 'Vomar Purmerend 2 PMNT' });
  /* 1. een dag ertussen */
  P({ d: '2026-05-07', a: -33, n: 'Splif Purmerend 1', desc: 'Splif Purmerend 1 PMNT' });
  P({ d: '2026-05-08', a: -33, n: 'Splif Purmerend 2', desc: 'Splif Purmerend 2 PMNT' });
  /* 4. twee verschillende desc-tijden (de PLAYSTATION-vorm) */
  P({ d: '2026-05-09', a: -9.99, n: 'eCom Betaalpas PLAYSTATION A',
      desc: 'eCom, Betaalpas PLAYSTATION A NR:TERMBNET, 09.05.26/13:06 Hilversum' });
  P({ d: '2026-05-09', a: -9.99, n: 'eCom Betaalpas PLAYSTATION B',
      desc: 'eCom, Betaalpas PLAYSTATION B NR:TERMBNET, 09.05.26/19:38 Hilversum' });
  /* 5a. gelijke naam, dus geen drift (de desc verschilt alleen zodat t.id niet samenvalt) */
  P({ d: '2026-05-11', a: -22, n: 'Albert Heijn 1347', desc: 'Albert Heijn 1347 PMNT' });
  P({ d: '2026-05-11', a: -22, n: 'Albert Heijn 1347', desc: 'Albert Heijn 1347 PMNT NL' });
  /* 5b. de eerste acht letters verschillen */
  P({ d: '2026-05-12', a: -77, n: 'Praxis Purmerend', desc: 'Praxis Purmerend PMNT' });
  P({ d: '2026-05-12', a: -77, n: 'Gamma Purmerend', desc: 'Gamma Purmerend PMNT' });

  /* 8. DRIE overgebleven regels van hetzelfde bedrag op dezelfde dag. Zonder dit geval is de eis dat
        een boeking in hooguit EEN paar staat inert: bij twee regels is de tweede na het paren toch al
        op, en pas bij drie kan de middelste in twee paren belanden (meetles o). */
  for (const n of ['Kruidvat Purmerend A', 'Kruidvat Purmerend B', 'Kruidvat Purmerend C'])
    P({ d: '2026-05-14', a: -120, n, desc: n + ' PMNT' });

  /* 11. EEN PAAR DAT ER MEER DAN EEN MIST KRIJGT ZE ALLEMAAL, en een van de redenen draagt zelf een
         KOMMA ("gelijke naam, dus geen drift"). Zonder dit geval staat er nooit meer dan een reden op
         een regel en is de scheider niet te beoordelen: met een komma ertussen is de lijst dan niet
         terug te lezen tot de redenen waaruit hij bestaat. */
  P({ d: '2026-05-19', a: -66, n: 'Hema Purmerend', desc: 'Hema Purmerend PMNT', bankRef: 'REF-B' });
  P({ d: '2026-05-19', a: -66, n: 'Hema Purmerend', desc: 'Hema Purmerend PMNT NL' });

  /* 9. DE DICHTSTBIJZIJNDE DAG WINT. De eerste kandidaat in de lijst staat een dag eerder en is zelf
        aan de csv gematcht; de tweede staat op dezelfde dag en is overgebleven. Zonder dit geval geeft
        "de eerste vrije kandidaat" precies hetzelfde antwoord als "de dichtstbijzijnde dag". */
  P({ d: '2026-05-16', a: -88, n: 'Blokker Verweg', desc: 'Blokker Verweg PMNT' });
  C({ d: '2026-05-16', a: -88, n: 'Blokker' });
  P({ d: '2026-05-17', a: -88, n: 'Blokker Bijna A', desc: 'Blokker Bijna A PMNT' });
  P({ d: '2026-05-17', a: -88, n: 'Blokker Bijna B', desc: 'Blokker Bijna B PMNT' });

  /* 10. BIJ EEN GELIJKE DAGAFSTAND WINT EEN TWEELING DIE ZELF IS OVERGEBLEVEN, want dan staat het paar
         volledig buiten de csv en dat is de hardere aanwijzing (v283, sectie e). De eerste kandidaat in
         de lijst is hier aan de csv gematcht; zonder dit geval doet die voorkeur niets. */
  P({ d: '2026-05-18', a: -99, n: 'Etos Purmerend V', desc: 'Etos Purmerend V PMNT' });
  C({ d: '2026-05-18', a: -99, n: 'Etos' });
  P({ d: '2026-05-18', a: -99, n: 'Etos Purmerend A', desc: 'Etos Purmerend A PMNT' });
  P({ d: '2026-05-18', a: -99, n: 'Etos Purmerend B', desc: 'Etos Purmerend B PMNT' });

  const own = [...new Set(tx.map((t) => t.acc))];
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify(own),
    minder_accmeta: JSON.stringify({ [PSD]: { balance: 500, date: '2026-09-28' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {}, budgets: { boodschappen: 400 },
      psd2Accounts: { [PSD]: { uid: 'u', iban: 'DE89' + PSD, hash: 'h', label: 'Zakgeld', bank: 'N26', exp: '2026-12-27' } } }),
    minder_plan: '{}',
  };
}

async function boot(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagCsvPsd2 === 'function');
  /* de override op de tweede Geldmaat-kant, via de echte weg: catOf() leest OVR[t.id] en die id wordt
     bij de boot door categorize() gezet, dus hij kan niet in de fixture staan (v281). */
  await page.evaluate(() => {
    const t = TX.find((x) => x.name === 'Geldmaat GM Zwanebloe');
    OVR[t.id] = 'overig'; save(); TX.forEach(categorize);
  });
}
const blok = (page) => page.evaluate(() => diagCsvPsd2().join('\n'));
/* de regels van EEN paar: vanaf zijn datum+bedrag-kopregel tot de volgende kopregel of het einde */
function paarStuk(t, bedrag) {
  const r = t.split('\n');
  const a = r.findIndex((x) => new RegExp('^\\s+2026-\\d\\d-\\d\\d\\s+' + bedrag.replace('.', '\\.') + '\\s').test(x));
  if (a < 0) return '';
  const rest = r.slice(a + 1);
  const b = rest.findIndex((x) => /^\s+2026-\d\d-\d\d\s+-?\d/.test(x) || /^\s+van de \d+ uitgeschreven/.test(x));
  return [r[a]].concat(b < 0 ? rest : rest.slice(0, b)).join('\n');
}

test.describe('0 · de fixture draagt de elf gevallen', () => {
  test('de csv-rekening paart, en de twaalf paren staan alle twaalf in de uitvoer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((a) => (csvPsd2Paring().find((x) => x.csv === a.CSV) || {}).psd2 || null, { CSV });
    expect(r).toBe(PSD);
    const t = await blok(page);
    expect(+t.match(/(\d+) tweelingparen/)[1]).toBe(12);
  });

  test('de tweeling van Tango is zelf gematcht, dus die kolom kan vallen', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(paarStuk(t, '-55.00')).toMatch(/beide overgebleven: nee/);
    /* en bij een ander paar staat hij wel op JA: zonder dat verschil zegt de kolom niets */
    expect(paarStuk(t, '-180.00')).toMatch(/beide overgebleven: JA/);
  });
});

test.describe('1 · het oordeel per paar', () => {
  const geval = [
    ['-180.00', null, 'de zuivere Geldmaat-vorm'],
    /* v286: DIT GEVAL VOND EEN FOUT IN DE REDEN. `_softKey` begint met de DATUM, dus een paar op
       afstand 1 heeft hem per constructie anders, en de eerste vorm leidde de letter-reden daaruit af:
       de uitvoer zei "de eerste acht letters verschillen" terwijl die gelijk waren (SPLIFPUR). De
       reden leest nu `_naamAcht()` zelf, en deze assertie eist precies EEN reden. */
    ['-33.00', 'niet dezelfde dag (1)', 'een dag ertussen'],
    ['-44.00', 'een bankRef', 'een bankRef op een kant'],
    ['-65.00', 'een referentie in de desc', 'twee verschillende referenties'],
    ['-9.99', 'twee verschillende desc-tijden', 'de PLAYSTATION-vorm'],
    ['-22.00', 'gelijke naam, dus geen drift', 'geen naamdrift'],
    ['-77.00', 'de eerste acht letters verschillen', 'softKey anders'],
  ];
  for (const [bedrag, reden, wat] of geval) {
    test(`${wat} (${bedrag})`, async ({ page }) => {
      await boot(page);
      const stuk = paarStuk(await blok(page), bedrag);
      expect(stuk).not.toBe('');
      if (reden === null) {
        expect(stuk).toMatch(/-> DE GELDMAAT-VORM/);
      } else {
        expect(stuk).toContain('NIET de Geldmaat-vorm: ' + reden);
        /* precies EEN reden: elk geval in de fixture raakt maar een van de vijf eisen, dus een
           tweede reden betekent dat de fixture iets anders meet dan hij zegt.
           v286: DE SCHEIDER IS ' | ' EN GEEN KOMMA, en dat vond deze assertie: met een komma als
           scheider telde "gelijke naam, dus geen drift" als twee redenen, en dat is een lijst die
           niet terug te lezen is tot zijn delen. De code joint nu op ' | '. */
        expect(stuk.match(/NIET de Geldmaat-vorm: ([^\n]+)/)[1].split(' | ').length).toBe(1);
      }
    });
  }

  test('een paar dat er twee mist krijgt ze allebei, gescheiden door een balk', async ({ page }) => {
    await boot(page);
    const stuk = paarStuk(await blok(page), '-66.00');
    const rs = stuk.match(/NIET de Geldmaat-vorm: ([^\n]+)/)[1].split(' | ');
    /* DE SCHEIDER MOET DE LIJST TERUG KUNNEN LEZEN: een van de twee redenen draagt zelf een komma,
       dus met een komma ertussen zouden dit er drie zijn en klopt geen enkele reden meer. */
    expect(rs).toEqual(['een bankRef', 'gelijke naam, dus geen drift']);
  });

  test('de telling en de redenen onderaan tellen op tot de twaalf paren', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toMatch(/van de 12 uitgeschreven paren zijn er 5 de Geldmaat-vorm/);
    const rs = t.match(/wat de andere missen: ([^\n]+)/)[1];
    const som = [...rs.matchAll(/(\d+)x/g)].reduce((s, m) => s + +m[1], 0);
    /* acht redenen over zeven onzuivere paren: het Hema-paar draagt er twee */
    expect(som).toBe(8);
  });
});

test.describe('2 · de kolommen naast het oordeel', () => {
  test('de override staat erbij, met ruleCat en autoCat ernaast', async ({ page }) => {
    await boot(page);
    const stuk = paarStuk(await blok(page), '-180.00');
    expect(stuk).toMatch(/Geldmaat GM Zwanebloe\s+cat=overig\s+\(ruleCat=intern autoCat=intern OVR=overig\)/);
    /* de andere kant draagt er geen, en zegt dat ook zo: zonder dat verschil leest de kolom als vast */
    expect(stuk).toMatch(/Geldmaat Zwanebloem 9\s+cat=intern\s+\(uit de keyword-regels\)/);
  });

  test('refs, bankRef en tijden staan per kant, en een streepje betekent geen', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(paarStuk(t, '-65.00')).toMatch(/refs: 1234567890/);
    expect(paarStuk(t, '-65.00')).toMatch(/refs: 9876543210/);
    expect(paarStuk(t, '-44.00')).toMatch(/bankRef: REF-A/);
    expect(paarStuk(t, '-9.99')).toMatch(/tijden: 13:06/);
    expect(paarStuk(t, '-9.99')).toMatch(/tijden: 19:38/);
    expect(paarStuk(t, '-180.00')).toMatch(/refs: -\s+bankRef: -\s+tijden: -/);
  });

  test('findDuplicateIds ruimt de Geldmaat-vorm op en de CJIB-vorm niet', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(paarStuk(t, '-180.00')).toMatch(/findDuplicateIds ruimt een kant op: JA/);
    expect(paarStuk(t, '-65.00')).toMatch(/findDuplicateIds ruimt een kant op: nee/);
    /* en de tool is alleen GELEZEN: het blok verandert niets (v244) */
    const n = await page.evaluate(() => { const voor = TX.length; diagCsvPsd2(); return { voor, na: TX.length }; });
    expect(n.na).toBe(n.voor);
  });
});

test.describe('3 · in paren en niet in boekingen', () => {
  test('(e) telt in boekingen en (f) in paren, en het blok zegt dat', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('HIER WORDT IN PAREN GETELD');
    const e = +t.match(/met een tweeling binnen psd2: (\d+)/)[1];
    const f = +t.match(/(\d+) tweelingparen/)[1];
    /* (e) telt OVERGEBLEVEN BOEKINGEN met een tweeling, (f) telt PAREN, en op deze fixture lopen die
       twee langs twee wegen uiteen: elf paren dragen twee overgebleven kanten en het Tango-paar maar
       een (zijn tweeling is zelf aan de csv gematcht), dus 11x2+1 = 23, en daar komt de derde
       Kruidvat-regel bij, die wel een tweeling heeft maar in geen paar staat: 24 */
    expect(e).toBe(24);
    expect(f).toBe(12);
    expect(e).toBeGreaterThan(f);   // zonder dat verschil zegt de regel niets
  });

  test('drie regels van hetzelfde bedrag geven EEN paar, niet twee', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    /* zonder de een-op-een-eis pakt de tweede Kruidvat-regel de derde erbij en staat hij in twee paren */
    expect(t.match(/^ {5}2026-05-14 {3}-120\.00/gm).length).toBe(1);
    const stuk = paarStuk(t, '-120.00');
    expect(stuk).toContain('Kruidvat Purmerend A');
    expect(stuk).toContain('Kruidvat Purmerend B');
    expect(stuk).not.toContain('Kruidvat Purmerend C');
  });

  test('de dichtstbijzijnde dag wint van de eerste kandidaat in de lijst', async ({ page }) => {
    await boot(page);
    const stuk = paarStuk(await blok(page), '-88.00');
    expect(stuk).toMatch(/afstand 0 dagen/);
    expect(stuk).toContain('Blokker Bijna B');
    /* Blokker Verweg staat een dag eerder EN vooraan in de lijst; hij hoort hier dus niet te staan */
    expect(stuk).not.toContain('Blokker Verweg');
  });

  test('bij een gelijke afstand wint de tweeling die zelf is overgebleven', async ({ page }) => {
    await boot(page);
    const stuk = paarStuk(await blok(page), '-99.00');
    expect(stuk).toContain('Etos Purmerend B');
    expect(stuk).not.toContain('Etos Purmerend V');   // die is aan de csv gematcht
    expect(stuk).toMatch(/beide overgebleven: JA/);
  });

  test('een boeking staat in hooguit een paar', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    const namen = [...t.matchAll(/^ {7}(\S.*?)\s{2,}cat=/gm)].map((m) => m[1].trim());
    expect(namen.length).toBe(24);                       // twaalf paren, twee kanten
    /* 'Albert Heijn 1347' en 'Hema Purmerend' staan er elk twee keer: dat zijn de twee paren zonder drift */
    expect(new Set(namen).size).toBe(22);
  });
});

/* v286: WAT DE FIXTURE AAN HET LICHT BRENGT EN WAT (f) DAAROM MOET ZEGGEN. Twee paren hebben de
   Geldmaat-vorm NIET en zouden toch door findDuplicateIds() worden opgeruimd: de PLAYSTATION-vorm
   (twee verschillende desc-tijden, dus per v281 twee betalingen) en de gelijke-naam-vorm. Dat is
   letterlijk het open punt van v272 - de opschoontool zou echte boekingen weghalen - en het is hier
   voor het eerst per paar te zien in plaats van als losse observatie. */
test.describe('4 · het gevaarlijke geval staat er apart', () => {
  test('een paar zonder de vorm dat de tool toch zou opruimen krijgt een LET OP', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(paarStuk(t, '-9.99')).toMatch(/LET OP: findDuplicateIds\(\) zou hier toch een kant weghalen/);
    expect(paarStuk(t, '-22.00')).toMatch(/LET OP: findDuplicateIds\(\)/);
    /* de zuivere vorm krijgt hem NIET: zonder dat verschil staat de regel overal en zegt hij niets */
    expect(paarStuk(t, '-180.00')).not.toMatch(/LET OP/);
    /* en een paar dat de tool met rust laat ook niet */
    expect(paarStuk(t, '-65.00')).not.toMatch(/LET OP/);
  });

  test('de telling eronder noemt er precies twee', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toMatch(/paren die de vorm NIET hebben en die de opschoontool toch zou opruimen: 2/);
    expect(t).toContain('dat zijn echte boekingen (v272)');
  });
});

/* v286: de naam-prefix staat op EEN plek, met drie lezers. Hij stond twee keer uitgeschreven en (f)
   had hem als derde nodig; een derde kopie zou bij de eerste wijziging uiteenlopen (v104). */
test.describe('5 · de naam-prefix is een bron', () => {
  test('_softKey en _dupSig lezen _naamAcht(), en de uitdrukking staat er een keer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      acht: _naamAcht({ name: 'Geldmaat Zwanebloem 9' }),
      sk: _softKey.toString(), ds: _dupSig.toString(),
    }));
    expect(r.acht).toBe('GELDMAAT');
    expect(r.sk).toContain('_naamAcht(t)');
    expect(r.ds).toContain('_naamAcht(t)');
    const fs = require('fs');
    const src = fs.readFileSync('index.html', 'utf8');
    const n = (src.match(/match\(\/\[A-Z\]\/g\)\|\|\[\]\)\.join\(''\)\.slice\(0,8\)/g) || []).length;
    expect(n).toBe(1);
  });
});
