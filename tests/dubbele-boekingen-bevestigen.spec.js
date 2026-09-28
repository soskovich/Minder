/* v288: DE KANDIDAAT-PAREN, EN DE GEBRUIKER BESLIST ER EEN VOOR EEN.
 *
 * DE AANLEIDING IS DE TOESTAND VAN HET TOESTEL, gemeten bij v272 en opnieuw in de uitvoer van v286: N26
 * levert dezelfde pinopname twee keer met een gedrifte automaatnaam, en op twee van die vier paren staat
 * een eigen categorie (`ruleCat=intern autoCat=intern OVR=overig`) waardoor de ENE kant wel als uitgave
 * telt en de andere niet. De gebruiker heeft bevestigd dat die twee overrides een vergissing zijn.
 *
 * WAAROM ER GEEN AUTOMATISCHE REGEL KOMT: `findDuplicateIds()` zou op precies dezelfde vorm boekingen
 * weghalen die ECHT zijn. GEMETEN op het toestel: `From Main to Voorziening` naast `From Main to Handgeld`
 * (beide 50 euro op dezelfde dag, beide "FROMMAIN" op de eerste acht letters) zijn twee verschillende
 * overboekingen, en twee PLAYSTATION-betalingen van 9,99 dragen in hun desc 13:06 en 19:38. De app kan het
 * verschil niet zien; de gebruiker wel. Daarom een LIJST met een keuze per paar.
 *
 * DE ZWAARSTE MEETVONDST VAN DEZE RONDE, en de reden dat de twee handelingen er EEN zijn: haal je alleen de
 * override weg, dan wordt de andere kant OOK een opname (`isOpnameTx()` eist `catOf(t)==='intern'`) en
 * springt `contantVerwacht()` en daarmee `totalBalance()` omhoog met geld dat er niet is. GEMETEN op de
 * getallen van het toestel: saldo 1700 -> 2000 bij alleen de override, en 1700 na de bevestiging. Te hoog
 * is de gevaarlijke kant (v168), dus elk van de twee stappen alleen is een slechtere stand dan nu.
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o en q: schrijf eerst op welk geval de
 * regel onderscheidt van de voor de hand liggende variant, en zet dat geval erin met een eigen assertie):
 *   1. EEN GELDMAAT-PAAR MET EEN TEGENSTRIJDIGE OVERRIDE, de toestand van het toestel. Zonder dat geval
 *      raakt de bevestiging nooit een override en blijft elke sabotage daarop groen;
 *   2. EEN TWEEDE GELDMAAT-PAAR ZONDER OVERRIDE. Zonder een tweede paar is "N paren" niet te onderscheiden
 *      van "een paar", en is de regel in Instellingen niet op zijn telling te toetsen;
 *   3. EEN UITGAVE-PAAR (Vomar, boodschappen). De Geldmaat-paren zijn INTERN, dus een bevestiging daar
 *      verandert geen enkele uitgavensom en de poort in `telbareTx()` is er niet op te toetsen;
 *   4. EEN OVERRIDE DIE DE REGEL NIET TEGENSPREEKT, op dat uitgave-paar (de regel zegt boodschappen, niet
 *      intern). Zonder dat geval doet de voorwaarde in `ovrTegenDeRegel()` niets en mag hij weg;
 *   5. DE PLAYSTATION-VAL: twee VERSCHILLENDE desc-tijden op dezelfde dag en hetzelfde bedrag;
 *   6. DE CJIB-VAL: DRIE boekingen met dezelfde sleutel die verder de vorm WEL hebben. Zonder die derde
 *      is er gewoon een paar, en dan is de groepsgrootte-eis inert;
 *   7. DE FROMMAIN-VAL: twee ECHTE overboekingen die de vorm wel hebben. Die hoort de lijst juist te
 *      TONEN, want de app kan het niet zien en de gebruiker wel;
 *   8. EEN PAAR MET EEN bankRef op een kant;
 *   9. EEN PAAR MET TWEE VERSCHILLENDE REFERENTIES in de desc;
 *  10. EEN PAAR MET EEN GELIJKE NAAM (geen drift, dus geen aanwijzing);
 *  11. EEN PAAR WAARVAN DE EERSTE ACHT LETTERS VERSCHILLEN;
 *  12. EEN PAAR OP EEN CSV-REKENING BINNEN HET VENSTER VAN ZIJN GEPAARDE PSD2-REKENING (v284). Die telt al
 *      niet mee en hoort hier dus niet aangeboden te worden; zonder dat geval doet die guard niets.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const PSD = '100110012848184840';          // N26 Zakgeld, psd2
const ABN = '521200806';                   // de rekening met de kaartregels
const CSV = 'N26 Buffer', PB = '100110012555096222';   // het gepaarde stel van v284

const YM = '2026-09';
const TEL = YM + '-01';                    // de dag waarop contant is geteld
const GELD_A = 200, GELD_B = 100;          // de twee Geldmaat-paren
const VOMAR = 40;                          // het uitgave-paar
const REST = 429;                          // de rest van Overig, zodat besteed op 729 uitkomt (de toestand van het toestel)
const POTJE_OVERIG = 500;                  // het potje op het toestel

function seed() {
  const tx = [];
  const add = (acc, src, d, a, n, desc, bankRef) => tx.push({ id: acc + '_' + tx.length, date: d, amount: a,
    acc, src, name: n, desc: desc || n + ' PMNT', bankRef: bankRef || '', typ: '', ref: '', accName: '', refNums: [] });
  const P = (d, a, n, desc, b) => add(PSD, 'psd2', d, a, n, desc, b);

  /* 1 + 2. de twee Geldmaat-paren van het toestel, allebei NA de telling dus allebei een opname */
  P(YM + '-04', -GELD_A, 'Geldmaat Koestraat 13');
  P(YM + '-04', -GELD_A, 'Geldmaat GM Koestraat');
  P(YM + '-19', -GELD_B, 'Geldmaat Koestraat 13');
  P(YM + '-19', -GELD_B, 'Geldmaat GM Koestraat');

  /* 3 + 4. het uitgave-paar: VOMAR valt in boodschappen, dus de regel zegt hier NIET intern */
  P(YM + '-10', -VOMAR, 'Vomar Purmerend 3');
  P(YM + '-10', -VOMAR, 'Vomar Purmerend GM');

  /* 4b. EEN OVERRIDE OP EEN INTERN-BOEKING NAAR EEN NIET-UITGAVE. De regel zegt hier WEL intern, dus het
         geval hierboven (Vomar) kan de type-eis niet toetsen: daar valt hij al op de intern-eis. Een opname
         die je zelf op Sparen & beleggen zet is geen boeking die als uitgave gaat tellen, en dus niet de
         vergissing waar deze lijst over gaat. Zonder dit geval blijft de sabotage die de type-eis weghaalt
         groen (meetles o). Hij staat alleen, dus hij is ook geen kandidaat-paar. */
  P(YM + '-22', -75, 'Geldmaat Marktplein 9');

  /* de rest van Overig, zodat het potje op de gemeten stand staat */
  P(YM + '-02', -REST, 'Rommelmarkt');

  /* 5. de PLAYSTATION-val, zoals blok 10 hem op het toestel afdrukt: de namen zijn daar GELIJK, dus wat
        dit paar tegenhoudt is de naam-eis en niet de desc-tijd. Dat is gemeten en het staat er daarom bij. */
  add(ABN, 'psd2', '2026-08-17', -9.99, 'eCom, Betaalpas PLAYSTATI',
    'eCom, Betaalpas PLAYSTATION NR:TERMBNET, 16.08.26/13:06 Hilversum');
  add(ABN, 'psd2', '2026-08-17', -9.99, 'eCom, Betaalpas PLAYSTATI',
    'eCom, Betaalpas PLAYSTATION NR:TERMBNET, 16.08.26/19:38 Hilversum');

  /* 5b. DE DESC-TIJD APART, want de val hierboven kan hem niet toetsen: met gelijke namen valt dat paar
         al op de naam-eis en blijft een sabotage op de tijd-eis groen (meetles o, en dit is precies de
         groene sabotage die deze ronde opleverde). GECONSTRUEERD EN NIET GEMETEN, net als de Kiosk-regel
         van v274: hij bewijst niets over hoe vaak dit voorkomt, alleen dat de tijd-eis werkt. De namen
         driften en blijven op de eerste acht letters gelijk (BEABETAA). */
  P('2026-08-16', -12.5, 'BEA, Betaalpas Kiosk A',
    'BEA, Betaalpas Kiosk A NR:TERMBNET, 15.08.26/13:06 Purmerend');
  P('2026-08-16', -12.5, 'BEA, Betaalpas Kiosk GM',
    'BEA, Betaalpas Kiosk GM NR:TERMBNET, 15.08.26/19:38 Purmerend');

  /* 6. de CJIB-val: DRIE met dezelfde sleutel, en zonder referentie, dus ze hebben de vorm wel */
  for (const k of ['een', 'twee', 'drie']) add(ABN, 'psd2', '2026-08-11', -65, 'CJIB Verkeersboetes ' + k);

  /* 7. de FROMMAIN-val: twee ECHTE overboekingen met dezelfde vorm */
  P('2026-08-30', -50, 'From Main to Voorziening');
  P('2026-08-30', -50, 'From Main to Handgeld');

  /* 7b. TWEE REKENINGEN, verder de hele vorm. Een overboeking staat aan beide kanten in je gegevens en
         dat is GEEN dubbel: het zijn twee echte boekingen op twee rekeningen. Zonder dit geval doet de
         rekening in `dubbelSleutel()` niets en blijft de sabotage die hem weghaalt groen (meetles o).
         Ze staan voor de telling, dus ze raken de contante meting niet. */
  P('2026-08-25', -45, 'Geldmaat Overweg 1');
  add(ABN, 'psd2', '2026-08-25', -45, 'Geldmaat GM Overweg');

  /* 8. een bankRef op een kant */
  P('2026-08-12', -66, 'Hema Purmerend A', 'Hema Purmerend A PMNT', 'REF-B');
  P('2026-08-12', -66, 'Hema Purmerend B');

  /* 9. twee verschillende referenties van zes cijfers of meer */
  P('2026-08-13', -77, 'Tikkie Sumter A', 'Tikkie Sumter A 1234567 PMNT');
  P('2026-08-13', -77, 'Tikkie Sumter B', 'Tikkie Sumter B 7654321 PMNT');

  /* 10. een gelijke naam: geen drift */
  P('2026-08-14', -88, 'Etos Purmerend', 'Etos Purmerend PMNT');
  P('2026-08-14', -88, 'Etos Purmerend', 'Etos Purmerend PMNT NL');

  /* 11. de eerste acht letters verschillen */
  P('2026-08-15', -99, 'Praxis Purmerend');
  P('2026-08-15', -99, 'Gamma Purmerend');

  /* 12. een gepaard csv-stel (v284), met een gedrifte-naam-paar BINNEN het venster van de psd2-kant */
  const pb = [], cb = [];
  pb.push({ d: '2026-03-01', a: 25, n: 'in', desc: 'From Main to Buffer PMNT' });
  pb.push({ d: '2026-03-01', a: -26, n: 'uit', desc: 'From Buffer to Main PMNT' });
  for (const [d, a] of [['2026-03-03', -13.5], ['2026-03-05', -17.25]]) {
    pb.push({ d, a, n: 'Plus de Gors', desc: 'Plus de Gors Purmerend PMNT' });
    cb.push({ d, a, n: 'Plus de Gors' });
  }
  cb.push({ d: '2026-03-04', a: -31, n: 'Geldmaat Marktplein 4' });
  cb.push({ d: '2026-03-04', a: -31, n: 'Geldmaat GM Marktplei' });
  for (const r of pb) add(PB, 'psd2', r.d, r.a, r.n, r.desc);
  for (const r of cb) add(CSV, 'csv', r.d, r.a, r.n, r.desc);

  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_own: JSON.stringify([...new Set(tx.map((t) => t.acc))]),
    minder_accmeta: JSON.stringify({ [PSD]: { balance: 1000, date: YM + '-28' }, [ABN]: { balance: 500, date: YM + '-28' },
      [PB]: { balance: 200, date: YM + '-28' }, [CSV]: { balance: 100, date: YM + '-28' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {},
      budgets: { overig: POTJE_OVERIG, boodschappen: 400 },
      contant: { stand: 400, datum: TEL },
      psd2Accounts: { [PSD]: { uid: 'u', iban: 'DE89' + PSD, hash: 'h', label: 'Zakgeld', bank: 'N26', exp: '2026-12-27' },
        [PB]: { uid: 'u2', iban: 'DE89' + PB, hash: 'h2', label: 'Buffer', bank: 'N26', exp: '2026-12-27' } } }),
    minder_plan: '{}',
  };
}

/* De overrides gaan via de echte weg en niet via de fixture: `catOf()` leest `OVR[t.id]` en die id wordt
   bij de boot door `categorize()` gezet, dus hij bestaat pas als de app draait (v281). */
async function boot(page, w) {
  await page.setViewportSize({ width: w || 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof dubbelParen === 'function');
  await page.evaluate(() => {
    for (const t of TX) {
      if (t.name === 'Geldmaat Koestraat 13') OVR[t.id] = 'overig';       // 1. spreekt de regel tegen
      if (t.name === 'Vomar Purmerend GM') OVR[t.id] = 'uiteten';         // 4. spreekt de regel NIET tegen
      if (t.name === 'Geldmaat Marktplein 9') OVR[t.id] = 'sparen';       // 4b. intern, maar geen uitgave
    }
    save();
  });
}

const namen = (page) => page.evaluate(() => dubbelParen().map((p) => p.a.name + ' / ' + p.b.name));
const stand = (page) => page.evaluate((ym) => ({
  overig: Math.round(-(totals(ym).byCat.overig || 0)) + 0,
  boodschappen: Math.round(-(totals(ym).byCat.boodschappen || 0)) + 0,
  spendNorm: Math.round(totals(ym).spendNorm),
  contant: contantVerwacht(),
  saldo: Math.round(totalBalance().sum),
  ovr: Object.keys(OVR).length,
}), YM);
const zet = (page, naam, wegNaam) => page.evaluate(([n, w]) => {
  /* het EERSTE nog OPEN paar met die naam: een al beslist paar staat ook in de lijst (voor het
     terugdraaien) en `dubbelParenZet()` keert daar meteen terug, dus zonder dit filter is een tweede
     aanroep stil een no-op. */
  const p = dubbelParen().find((x) => !x.keuze && (x.a.name === n || x.b.name === n));
  const weg = w ? [p.a, p.b].find((t) => t.name === w).id : '';
  dubbelParenZet(p.sleutel, weg);
}, [naam, wegNaam]);

test.describe('v288 de kandidaat-paren', () => {

  /* DE FIXTURE DRAAGT WERKELIJK WAT DE COMMENTS BELOVEN (v260): zonder deze toets kan een geval stil
     wegvallen en blijven de asserties eronder groen op een fixture die het niet meer raakt. */
  test('de fixture draagt de gevallen die de regels onderscheiden', async ({ page }) => {
    await boot(page);
    const f = await page.evaluate(() => ({
      geldmaatOpname: TX.filter((t) => t.name === 'Geldmaat GM Koestraat').every(isOpnameTx),
      vomarUitgave: TX.filter((t) => t.name === 'Vomar Purmerend 3').every((t) => CATS[catOf(t)].type === 'expense'),
      drieCjib: TX.filter((t) => String(t.name).startsWith('CJIB')).length,
      csvUitgesloten: TX.filter((t) => t.name === 'Geldmaat Marktplein 4').every(csvDubbel),
      /* 5b: de Kiosk-namen moeten DRIFTEN en toch dezelfde acht letters dragen, anders sluit de naam-eis
         het paar al uit en toetst de tijd-eis opnieuw niets */
      /* 4b: de regel zegt hier WEL intern en de override is WEL gezet, dus alleen de type-eis houdt hem
         buiten de lijst */
      sparenRegel: (() => { const t = TX.find((x) => x.name === 'Geldmaat Marktplein 9');
        return { regel: t.autoCat, ovr: OVR[t.id] || '', type: CATS[OVR[t.id]].type }; })(),
      overweg: (() => { const k = TX.filter((t) => String(t.name).includes('Overweg'));
        return { zelfdeDag: k[0].date === k[1].date, zelfdeBedrag: k[0].amount === k[1].amount,
          zelfdeAcht: _naamAcht(k[0]) === _naamAcht(k[1]), andereRekening: k[0].acc !== k[1].acc }; })(),
      kiosk: (() => { const k = TX.filter((t) => String(t.name).includes('Kiosk'));
        return { n: k.length, zelfdeAcht: _naamAcht(k[0]) === _naamAcht(k[1]),
          andereNaam: k[0].name !== k[1].name,
          tweeTijden: _descTijden(k[0]).join() !== _descTijden(k[1]).join() }; })(),
      ovrTegen: TX.filter((t) => ovrTegenDeRegel(t)).map((t) => t.name),
    }));
    expect(f.geldmaatOpname).toBe(true);        // 1: anders raakt contantVerwacht() niets
    expect(f.vomarUitgave).toBe(true);          // 3: anders kan de poort geen som bewegen
    expect(f.drieCjib).toBe(3);                 // 6: anders is de groepsgrootte-eis inert
    expect(f.csvUitgesloten).toBe(true);        // 12: anders doet de csvDubbel-guard niets
    expect(f.kiosk).toEqual({ n: 2, zelfdeAcht: true, andereNaam: true, tweeTijden: true });   // 5b
    expect(f.sparenRegel).toEqual({ regel: 'intern', ovr: 'sparen', type: 'internal' });       // 4b
    /* 7b: alles gelijk behalve de rekening, anders toetst de rekening in de sleutel niets */
    expect(f.overweg).toEqual({ zelfdeDag: true, zelfdeBedrag: true, zelfdeAcht: true, andereRekening: true });
    /* 4: de Vomar-override staat er WEL maar spreekt de regel NIET tegen, dus hij hoort niet in de lijst */
    expect(f.ovrTegen).toEqual(['Geldmaat Koestraat 13', 'Geldmaat Koestraat 13']);
  });

  test('de lijst draagt de gedrifte paren en laat de vier vallen vallen', async ({ page }) => {
    await boot(page);
    const n = await namen(page);
    expect(n).toContain('Geldmaat Koestraat 13 / Geldmaat GM Koestraat');
    expect(n).toContain('Vomar Purmerend 3 / Vomar Purmerend GM');
    /* 7: de FROMMAIN-vorm hoort er JUIST in: de app kan het verschil niet zien, de gebruiker wel */
    expect(n).toContain('From Main to Voorziening / From Main to Handgeld');
    const plat = n.join(' | ');
    expect(plat).not.toContain('PLAYSTATI');    // 5. gelijke naam (zo staat het op het toestel)
    expect(plat).not.toContain('Kiosk');        // 5b. gedrifte naam, maar twee desc-tijden
    expect(plat).not.toContain('CJIB');         // 6. drie van dezelfde sleutel
    expect(plat).not.toContain('Hema');         // 8. een bankRef
    expect(plat).not.toContain('Tikkie');       // 9. twee referenties
    expect(plat).not.toContain('Etos');         // 10. gelijke naam
    expect(plat).not.toContain('Praxis');       // 11. andere eerste acht letters
    expect(plat).not.toContain('Overweg');      // 7b. twee verschillende rekeningen
    expect(plat).not.toContain('Marktplein');   // 12. telt al niet mee via csvDubbel()
  });

  /* 6: het onderscheid zelf. Met drie is er geen paar; haal er een weg en er staat er wel een, dus de
     drie voldoen aan de vorm en het is de GROEPSGROOTTE die ze tegenhoudt. */
  test('drie met dezelfde sleutel is geen paar, en het aantal staat in de sheet', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => dubbelParen().veelVoudig)).toBe(1);
    const sheet = await page.evaluate(() => { openDubbelParen(); return $('#sheet').innerText; });
    expect(sheet).toContain('1 groep van drie of meer');
    const na = await page.evaluate(() => {
      TX = TX.filter((t) => t.name !== 'CJIB Verkeersboetes drie');
      return { n: dubbelParen().map((p) => p.a.name).join('|'), veel: dubbelParen().veelVoudig };
    });
    expect(na.n).toContain('CJIB');
    expect(na.veel).toBe(0);
  });

  /* DE KERNMETING VAN DEZE RONDE, en de drie standen staan in EEN test omdat de eigenschap de VERGELIJKING
     is: alleen de override weghalen zet je saldo te hoog, en dat is niet te zien aan een van de drie apart. */
  test('alleen de override weghalen zet je saldo te hoog, de bevestiging zet het terug', async ({ page }) => {
    await boot(page);
    const voor = await stand(page);
    expect(voor.overig).toBe(REST + GELD_A + GELD_B);          // 729: de gemeten stand van het toestel

    await page.evaluate(() => { for (const t of TX) if (t.name === 'Geldmaat Koestraat 13') delete OVR[t.id]; save(); });
    const alleen = await stand(page);
    expect(alleen.overig).toBe(REST);
    expect(alleen.contant).toBe(voor.contant + GELD_A + GELD_B);   // de andere kant werd OOK een opname
    expect(alleen.saldo).toBe(voor.saldo + GELD_A + GELD_B);       // geld dat er niet is

    await page.evaluate(() => { for (const t of TX) if (t.name === 'Geldmaat Koestraat 13') OVR[t.id] = 'overig'; save(); });
    await zet(page, 'Geldmaat Koestraat 13', 'Geldmaat Koestraat 13');
    await zet(page, 'Geldmaat Koestraat 13', 'Geldmaat Koestraat 13');
    const na = await stand(page);
    expect(na.overig).toBe(REST);                 // dezelfde winst als de override alleen
    expect(na.contant).toBe(voor.contant);        // en zonder de sprong
    expect(na.saldo).toBe(voor.saldo);
  });

  /* 3: de poort. De Geldmaat-paren zijn intern, dus alleen dit paar kan hem laten bewegen. */
  test('een bevestigde kant valt uit telbareTx() en dus uit de sommen', async ({ page }) => {
    await boot(page);
    const voor = await stand(page);
    const inLijst = () => page.evaluate(() => telbareTx().filter((t) => String(t.name).startsWith('Vomar')).length);
    expect(await inLijst()).toBe(2);
    await zet(page, 'Vomar Purmerend 3', 'Vomar Purmerend 3');
    expect(await inLijst()).toBe(1);
    const na = await stand(page);
    expect(na.boodschappen).toBe(voor.boodschappen - VOMAR);
    expect(na.spendNorm).toBe(voor.spendNorm - VOMAR);
    /* de boeking BLIJFT in TX en in de lijst staan, en zegt daar dat hij niet meetelt (v281/v284) */
    expect(await page.evaluate(() => TX.filter((t) => String(t.name).startsWith('Vomar')).length)).toBe(2);
    const lijst = await page.evaluate(() => { go('tx'); renderTxList(); return $('#txlist').innerText; });
    expect(lijst).toContain('je legde dit vast als dubbel');
    /* `contantOpnamesSinds()` leest dezelfde poort als `contantVerwacht()`, anders telt de lijst achter
       het bedrag iets anders op dan het bedrag zelf (v104). Meet het op de Geldmaat-kant, want die is een
       opname; zonder die bevestiging staat de lijst hier op vier en is het verschil niet te zien. */
    await zet(page, 'Geldmaat Koestraat 13', 'Geldmaat Koestraat 13');
    const c = await page.evaluate(() => {
      const weg = TX.find((t) => t.name === 'Geldmaat Koestraat 13' && dubbelWeg(t));
      return { eur: contantOpnamesSinds().reduce((sm, t) => sm - t.amount, 0), bedrag: contantVerwacht(),
        isOpname: isOpnameTx(weg), inLijst: contantOpnamesSinds().some((t) => t.id === weg.id) };
    });
    /* de bevestigde kant IS een opname (zijn override is vervallen) en staat er toch niet in: dat is de
       poort, en zonder die twee naast elkaar is de assertie niet te onderscheiden van "hij is geen opname" */
    expect(c.isOpname).toBe(true);
    expect(c.inLijst).toBe(false);
    expect(c.bedrag).toBe(400 + c.eur);
  });

  /* 4: de override vervalt ALLEEN als hij de regel tegenspreekt. Bij Vomar zegt de regel boodschappen,
     dus daar is de eigen categorie geen vergissing die deze vorm aantoont, en hij blijft staan. */
  test('een override die de regel niet tegenspreekt blijft staan', async ({ page }) => {
    await boot(page);
    const vomarOvr = () => page.evaluate(() => {
      const t = TX.find((x) => x.name === 'Vomar Purmerend GM'); return OVR[t.id] || '';
    });
    expect(await vomarOvr()).toBe('uiteten');
    await zet(page, 'Vomar Purmerend 3', 'Vomar Purmerend 3');
    expect(await vomarOvr()).toBe('uiteten');
    expect(await page.evaluate(() => Object.values(SET.dubbelPaar)[0].ovr)).toEqual({});
  });

  test('de bevestiging haalt de tegenstrijdige override van BEIDE kanten weg', async ({ page }) => {
    await boot(page);
    /* de kant die BLIJFT draagt hem hier, want anders zou het weghalen van de wegvallende kant al genoeg zijn */
    const eerst = await page.evaluate(() => dubbelParen().find((p) => p.a.name === 'Geldmaat Koestraat 13').a.date);
    await zet(page, 'Geldmaat Koestraat 13', 'Geldmaat GM Koestraat');
    const na = await page.evaluate(() => TX.filter((t) => ovrTegenDeRegel(t)).map((t) => t.date));
    expect(na).toHaveLength(1);                          // alleen het andere paar staat er nog
    expect(na[0]).not.toBe(eerst);
  });

  test('twee verschillende betalingen laat allebei de kanten en de override staan', async ({ page }) => {
    await boot(page);
    const voor = await stand(page);
    await zet(page, 'Geldmaat Koestraat 13', '');
    const na = await stand(page);
    expect(na.overig).toBe(voor.overig);
    expect(na.contant).toBe(voor.contant);
    expect(na.ovr).toBe(voor.ovr);
    expect(await page.evaluate(() => dubbelParen().filter((p) => !p.keuze).length)).toBe(voor.ovr === 0 ? 0 : 3);
  });

  test('terugdraaien herstelt de override en de telling, karakter voor karakter', async ({ page }) => {
    await boot(page);
    const voor = JSON.stringify(await stand(page));
    await zet(page, 'Geldmaat Koestraat 13', 'Geldmaat Koestraat 13');
    expect(JSON.stringify(await stand(page))).not.toBe(voor);
    await page.evaluate(() => { const p = dubbelParen().find((x) => x.keuze); dubbelParenTerug(p.sleutel); });
    expect(JSON.stringify(await stand(page))).toBe(voor);
    expect(await page.evaluate(() => Object.keys(SET.dubbelPaar || {}).length)).toBe(0);
  });

  /* DE REGEL IN INSTELLINGEN IS DE ENIGE INGANG, en dus ook de enige weg naar het terugdraaien.
     BIJGEWERKT BIJ v293: deze test eiste eerst dat hij VERDWIJNT zodra alles beslist is, en legde daarmee
     een defect vast in plaats van een eigenschap. GEMETEN op het toestel: negen bevestigde paren en nul
     open, dus de sheet was daar niet meer te openen en de terugdraai-knop bestond alleen nog in theorie.
     Hij blijft nu staan zolang er iets te beslissen OF iets te herzien valt. */
  test('de regel in Instellingen telt de open paren en blijft de weg terug', async ({ page }) => {
    await boot(page);
    const regel = () => page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = dubbelParenRegel(); return d.innerText; });
    expect(await regel()).toContain('4 paren boekingen kunnen dezelfde betaling zijn');
    await page.evaluate(() => { for (const p of dubbelParen()) dubbelParenZet(p.sleutel, ''); });
    expect(await regel()).toContain('4 paren boekingen heb je zelf beoordeeld');
    /* en de sheet blijft dan wel leesbaar, met de al besliste paren erin */
    const sheet = await page.evaluate(() => { openDubbelParen(); return $('#sheet').innerText; });
    expect(sheet).toContain('Er staat geen paar meer open');
    expect(sheet).toContain('Al beslist');
  });

  /* DE SHEET DRAAGT WAT JE NODIG HEBT OM TE KIEZEN: de twee VOLLEDIGE namen en waar de categorie vandaan
     komt. Zonder de volledige naam is de FROMMAIN-val niet van een echte dubbel te onderscheiden. */
  test('de sheet noemt beide volledige namen en de herkomst van de categorie', async ({ page }) => {
    await boot(page);
    const sheet = await page.evaluate(() => { openDubbelParen(); return $('#sheet').innerText; });
    expect(sheet).toContain('From Main to Voorziening');
    expect(sheet).toContain('From Main to Handgeld');
    expect(sheet).toContain('je zette deze zelf op Overig, de regel zegt');
    expect(sheet).toContain('uit de regels');
    /* het gevolg staat er alleen bij een tegenstrijdige override, en met het bedrag dat uit de categorie gaat */
    expect(sheet).toContain('€' + GELD_A + ' gaat daarmee uit Overig');
    expect(sheet).toContain('€' + GELD_B + ' gaat daarmee uit Overig');
    /* en niet bij een paar zonder zo'n override */
    expect(sheet.split('From Main to Voorziening')[1].split('Twee verschillende betalingen')[0]).not.toContain('gaat daarmee uit');
  });

  /* DE NAAM-PREFIX WORDT IN `dubbelParen()` TWEE KEER GEEIST, EN DAT IS GEMETEN EN GEEN SLORDIGHEID:
     `dubbelSleutel()` draagt `_softKey()` en die begint bij de acht letters, dus twee boekingen met een
     andere prefix komen nooit in dezelfde groep en de eis in `geldmaatMist()` kan hier per constructie
     niet vuren. GEMETEN met een sabotage die die eis uitschakelt: deze spec blijft dan GROEN en
     `tweelingen-binnen-psd2.spec.js` gaat rood, want (f) paart op dag en bedrag en niet op de sleutel.
     Dat is de keuze van v284 over een guard die niet vanuit de gewone stand bereikbaar is: de eis blijft
     staan omdat hij voor de ANDERE lezer leeft, en hier staat waarom hij hier niets doet. */
  test('de sleutel draagt de naam-prefix, dus een ander naam-begin komt nooit in een groep', async ({ page }) => {
    await boot(page);
    const m = await page.evaluate(() => {
      const p = TX.find((t) => t.name === 'Praxis Purmerend'), g = TX.find((t) => t.name === 'Gamma Purmerend');
      return { zelfdeDag: p.date === g.date, zelfdeBedrag: p.amount === g.amount,
        zelfdeSleutel: dubbelSleutel(p) === dubbelSleutel(g),
        prefixInSleutel: dubbelSleutel(p).endsWith(_naamAcht(p)) };
    });
    expect(m.zelfdeDag).toBe(true);        // alles gelijk behalve de naam
    expect(m.zelfdeBedrag).toBe(true);
    expect(m.prefixInSleutel).toBe(true);  // en de prefix zit in de sleutel
    expect(m.zelfdeSleutel).toBe(false);   // dus ze worden nooit gegroepeerd
  });

  /* DE VORM STAAT OP EEN PLEK (v104): blok 11 en de sheet lezen dezelfde `geldmaatMist()`. Een sabotage die
     de vijf eisen in (f) opnieuw uitschrijft, haalt de bron weg en zet deze test rood. */
  test('blok 11 en de kandidatenlijst lezen dezelfde vorm', async ({ page }) => {
    await boot(page);
    const bron = await page.evaluate(() => fetch('/index.html').then((r) => r.text()));
    const tel = (re) => (bron.match(re) || []).length;
    /* ELKE REDEN STAAT EEN KEER IN DE BRON, en dat geldt ook voor de PROZA eromheen: de kop van (f)
       beschrijft de vorm in eigen woorden, en zou hij een reden letterlijk herhalen, dan zijn er twee
       spellingen van een eis en veroudert die kop zodra de vorm verandert (v276). */
    expect(tel(/de eerste acht letters verschillen/g)).toBe(1);
    expect(tel(/gelijke naam, dus geen drift/g)).toBe(1);
    expect(tel(/twee verschillende desc-tijden/g)).toBe(1);
    /* DE REDENENLIJST WORDT OP EEN PLEK OPGEBOUWD. Dit telt de constructie en niet de naam: op de naam
       tellen is een anker op het aantal keer dat een comment hem noemt, en dat is precies het anker dat
       v271 en v272 twee rondes achter elkaar heeft laten omvallen. */
    expect(tel(/mist\.push\(/g)).toBe(6);
    /* en beide lezers roepen hem aan, in hun EIGEN functie en niet ergens in een comment */
    const lijf = (naam) => { const i = bron.indexOf('function ' + naam + '('); return bron.slice(i, bron.indexOf('\nfunction ', i + 1)); };
    expect(lijf('diagCsvPsd2').match(/geldmaatMist\(P\.a, P\.b, P\.d\)/)).not.toBeNull();
    expect(lijf('dubbelParen').match(/geldmaatMist\(/)).not.toBeNull();
  });

  /* DE LEESLIJST IN BLOK 8 leest dezelfde `ovrTegenDeRegel()` als de bevestiging, en het AANTAL en het
     BEDRAG komen uit dezelfde verzameling (de v287-les: een lezer stelt juist die vraag bij zo'n regel). */
  test('blok 8 schrijft de overrides uit die de regel tegenspreken', async ({ page }) => {
    await boot(page);
    const b = await page.evaluate(() => diagRekeningen().join('\n'));
    const sec = b.split('EIGEN CATEGORIEEN OP EEN BOEKING DIE DE REGEL INTERN GEEFT:')[1].split('SALDI DIE')[0];
    expect(+sec.trim().split(/\s+/)[0]).toBe(2);
    expect(sec).toContain(YM + '-04');
    expect(sec).toContain(YM + '-19');
    expect(sec).toContain('Eigen rekening / overboeking -> Overig');
    expect(sec).toContain('samen ' + (GELD_A + GELD_B) + ' euro');
    expect(sec).toContain('Overig: ' + (GELD_A + GELD_B));
    /* de Vomar-override staat er NIET in: de regel zegt daar boodschappen en geen intern.
       En de Marktplein-override ook niet: de regel zegt daar WEL intern, maar Sparen & beleggen is geen
       uitgave, dus die boeking gaat door die keuze niet als uitgave tellen. Twee verschillende eisen, twee
       verschillende gevallen (meetles n). */
    expect(sec).not.toContain('Vomar');
    expect(sec).not.toContain('Marktplein 9');
    /* en het blok schrijft niets (v244) */
    const voor = await page.evaluate(() => localStorage.getItem('minder_ovr'));
    await page.evaluate(() => diagRekeningen());
    expect(await page.evaluate(() => localStorage.getItem('minder_ovr'))).toBe(voor);
  });

  test('de sheet past op 360 en op 390 zonder horizontale schuif', async ({ page }) => {
    for (const w of [360, 390]) {
      await boot(page, w);
      const m = await page.evaluate(() => { openDubbelParen(); const s = $('#sheet');
        return { sw: s.scrollWidth, cw: s.clientWidth }; });
      expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    }
  });
});
