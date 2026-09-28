/* v290: DE TANKVOORAUTORISATIE, ALLEEN GEMETEN.
 *
 * DE AANLEIDING STAAT IN BLOK 9 OP HET TOESTEL (gemeten bij v288): op alle vijf de duurste tankdagen
 * staan DRIE regels van hetzelfde station op dezelfde dag, en in alle vijf de gevallen is de
 * voorautorisatie MIN de terugboeking exact gelijk aan de tweede afschrijving: 150-100=50, 125-51=74,
 * 125-18=107, 125-22=103, 125-25=100. Als dat klopt telt elke tankbeurt DUBBEL en is Vervoer & auto
 * structureel te hoog, en dan is de zaterdagpiek van 3 van 6 weken mogelijk een artefact van die vorm.
 *
 * DIE VIJF ZIJN EEN VERTEKENDE STEEKPROEF, en dat is de reden dat blok 12 bestaat: blok 9 drukt alleen
 * de DUURSTE dag per week af, en een dag die dubbel telt wordt daardoor vaker de duurste.
 *
 * DIT BLOK BOUWT NIETS. Geen koppeling, geen app-gedrag, geen lezer buiten het blok, en het schrijft
 * niets (v244). Wat het beslist is of die koppeling er moet komen.
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o en q):
 *   1. DE VIER TOESTEL-DRIETALLEN als vorm 3. Zonder die is de verdubbeling niet te zien;
 *   2. VORM 1 (deels terug, geen tweede afschrijving). Zonder dit geval is vorm 1 niet van vorm 3 te
 *      onderscheiden en mag de match op het verschil weg;
 *   3. VORM 2 (volledig terug, de tankbeurt apart). Idem voor de volledig-terug-tak;
 *   4. EEN AFSCHRIJVING ZONDER ENIGE BIJSCHRIJVING. Die hoort geen drietal te worden, en hij voedt de
 *      tegenproef-regel onder het histogram;
 *   5. EEN TERUGBOEKING IN EEN ANDERE MAAND, drie dagen later, met de echte tankbeurt OP die latere dag.
 *      Dit geval doet drie dingen tegelijk die geen ander geval doet: het maakt de maandgrens-telling
 *      toetsbaar, het maakt de weekdag-verschuiving niet-inert, EN het is het enige geval waarin
 *      "grootste bedrag eerst" een ander antwoord geeft dan "dichtstbijzijnde dag eerst" (die tweede zou
 *      de terugboeking aan de tankbeurt van diezelfde dag hangen in plaats van aan de voorautorisatie);
 *   6. TWEE TANKBEURTEN BIJ DEZELFDE TEGENPARTIJ BINNEN HET VENSTER. Zonder dat kan een terugboeking
 *      per constructie niet twee keer geclaimd worden en is de een-op-een-eis inert;
 *   7. EEN ROND BEDRAG BUITEN VERVOER (drie keer 125 bij een supermarkt). Zonder dat doet de
 *      categorie-poort niets;
 *   8. EEN TEGENPARTIJ DIE ALLEEN VIA EEN EIGEN REGEL IN VERVOER VALT (Tango). Dat is de toestand van
 *      het toestel: TANGO staat niet in de ingebouwde RULES maar in SET.rules. Zonder die regel viel
 *      het 150-drietal in de eerste meting stil weg op `overig`, en dat was precies het geval dat de
 *      vraag noemde.
 *
 * v291: DE OORZAAK IS BUITEN DE APP BEVESTIGD. In de bank-app staat bij een van de vijf drietallen alleen
 * de DERDE regel als boeking; de eerste twee zijn een reservering en haar vrijgave. Vorm 3 is dus geen
 * dubbele betaling van de bank maar een regel die de app vasthoudt nadat de bank hem heeft ingetrokken.
 * Deze ronde MEET welk opgeslagen veld die twee scheidt (sectie 2b) en of andere tegenpartijen dezelfde
 * vorm dragen (sectie 4). Er komt nog geen poort en geen kandidatenlijst: welke vorm de reparatie moet
 * hebben hangt af van HOE die regels binnenkwamen, en een poort bouwen die per constructie niet kan vuren
 * op het geval waarvoor hij bestaat is wat meetles (a) en (p) verbieden.
 *
 * WAT DE FIXTURE ER VOOR v291 BIJ KREEG:
 *   10. EEN DRIETAL WAARVAN DE VOORAUTORISATIE ALS PENDING BINNENKWAM, zonder _p-id: `categorize()` doet
 *       `t.id=txId(t)` en de boot loopt over alle TX, dus dat achtervoegsel is weg voordat het
 *       diagnosescherm leest. De fixture bootst de stand NA een boot na, en dat het `_p` er niet komt is
 *       een eigen assertie (meetles u);
 *   11. EEN DESC-STAART DIE PER POSITIE VERSCHILT. Zonder verschil is de staart-telling niet van een
 *       constante te onderscheiden, en juist die staart is de enige kandidaat-scheider die de app al
 *       opslaat zonder hem te lezen;
 *   12. PRECIES EEN AFWIJKENDE VALUTADATUM, plus een bankRef en een referentie op een derde positie.
 *       Zonder die drie staan de kolommen "vd anders", "bankRef" en "referentie" per constructie op nul;
 *   13. EEN UITGAVE BUITEN DE VERVOER-CATEGORIE met dezelfde vorm. Zonder dat toont sectie 4 alleen de
 *       vervoer-rijen en is de ruimere scope niet van de smalle te onderscheiden;
 *   14. EEN INTERNE VORM DIE ERUIT MOET. Zonder dat doet de uitgaven-poort van sectie 4 niets.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');

const A = '521200806';
/* de vier drietallen zoals blok 9 ze op het toestel afdrukt: voorautorisatie, echte tankbeurt, terug */
const TOESTEL = [
  ['2026-09-05', 'ShellExpress Amste', 125, 74, 51],
  ['2026-09-11', 'ShellExpress Amste', 125, 107, 18],
  ['2026-09-19', 'Shell Laarderhoogt', 125, 103, 22],
  ['2026-08-20', 'Tango Purmerend', 150, 50, 100],
];

function seed() {
  const tx = [];
  const P = (d, a, name, extra) => tx.push(Object.assign({ id: 'y' + tx.length, date: d, amount: a, acc: A,
    src: 'psd2', name, desc: name + ' PMNT', bankRef: '', typ: '', ref: '', accName: '', refNums: [] }, extra || {}));

  for (const [d, n, voor, echt, terug] of TOESTEL) { P(d, -voor, n); P(d, -echt, n); P(d, terug, n); }
  /* 2. vorm 1 */
  P('2026-07-04', -125, 'Esso Zaandam'); P('2026-07-04', 60, 'Esso Zaandam');
  /* 3. vorm 2 */
  P('2026-07-11', -125, 'BP Wormerveer'); P('2026-07-11', 125, 'BP Wormerveer'); P('2026-07-11', -88, 'BP Wormerveer');
  /* 4. geen enkele bijschrijving */
  P('2026-07-18', -125, 'Tinq Edam');
  /* 5. maandgrens, drie dagen later, met de tankbeurt op de LATERE dag */
  P('2026-05-31', -125, 'Total Volendam'); P('2026-06-03', 40, 'Total Volendam'); P('2026-06-03', -85, 'Total Volendam');
  /* 9. EEN BIJSCHRIJVING DIE GROTER IS DAN ELKE AFSCHRIJVING van die tegenpartij in het venster. Een
        terugboeking kan haar voorautorisatie niet overtreffen, dus dit is er geen; zonder dit geval is
        die eis inert, want de sortering pakt toch al het grootste bedrag. Laat je hem weg, dan ontstaat
        een drietal met een NEGATIEVE "echte tankbeurt" en loopt 3c mee de mist in. */
  P('2026-07-25', -30, 'ParkBee Zaandam'); P('2026-07-25', 80, 'ParkBee Zaandam');

  /* 10. EEN DRIETAL WAARVAN DE VOORAUTORISATIE ALS PENDING BINNENKWAM (v291). Zonder dit geval staat de
        pending-kolom van 2b per constructie op nul en blijft een sabotage die t.pending nooit leest groen
        (meetles a). DE _p-ID STAAT ER BEWUST NIET OP: categorize() doet t.id=txId(t) en de boot loopt over
        alle TX, dus dat achtervoegsel is bij de eerste start weg. De fixture bootst de stand NA een boot
        na, want dat is de stand waarin het diagnosescherm leest.
     11. DE STAART VAN DE DESC VERSCHILT PER POSITIE (RSRV tegen PMNT). Zonder een verschil is de
        staart-telling niet van een constante te onderscheiden, en juist die staart is de enige kandidaat-
        scheider die de app al opslaat.
     12. DE VALUTADATUM, waarvan er precies EEN afwijkt van de boekdatum. Zonder een afwijkende staat de
        kolom "vd anders" per constructie op nul.
     Dit is een GECONSTRUEERD geval en geen meting: het zegt niets over hoe de bank codeert, alleen dat de
     uitlezing een verschil ZOU zien. TINQ staat in de ingebouwde vervoer-regels, dus deze tegenpartij valt
     in dezelfde categorie als de rest zonder een eigen regel. */
  P('2026-07-08', -125, 'Tinq Purmerend', { pending: true, desc: 'Tinq Purmerend RSRV', valutaDatum: '2026-07-08' });
  P('2026-07-08', 35, 'Tinq Purmerend', { desc: 'Tinq Purmerend RSRV', valutaDatum: '2026-07-10' });
  P('2026-07-08', -90, 'Tinq Purmerend', { desc: 'Tinq Purmerend 887766554 PMNT', bankRef: 'B-9931', valutaDatum: '2026-07-08' });

  /* 13. DEZELFDE VORM BUITEN DE VERVOER-CATEGORIE (v291). Zonder dit geval toont sectie 4 alleen de
        vervoer-rijen en is de ruimere scope niet van de smalle te onderscheiden. COOLBLUE staat in de
        shopping-regels, dus de categorie komt uit de gegevens en niet uit de fixture.
     14. EEN INTERNE VORM DIE ERUIT MOET. Zonder dit geval doet de uitgaven-poort van sectie 4 niets en
        blijft een sabotage die hem weghaalt groen (meetles a en p). GELDMAAT staat in de intern-regels, en
        dit is letterlijk de vorm van de paren van v288: dezelfde tegenpartij, een bijschrijving, en een
        tweede afschrijving die op het verschil past. */
  P('2026-06-12', -125, 'Coolblue Online'); P('2026-06-12', 45, 'Coolblue Online'); P('2026-06-12', -80, 'Coolblue Online');
  P('2026-06-20', -200, 'Geldmaat Koestraat'); P('2026-06-20', 60, 'Geldmaat Koestraat'); P('2026-06-20', -140, 'Geldmaat Koestraat');

  /* 7. rond bedrag buiten vervoer */
  for (const d of ['15', '16', '17']) P('2026-04-' + d, -125, 'Albert Heijn 1347');

  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([A]),
    minder_accmeta: JSON.stringify({ [A]: { balance: 1000, date: '2026-09-28' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {}, budgets: { vervoer: 1100 },
      rules: [{ kw: 'TANGO', cat: 'vervoer' }] }),   // 8. Tango valt alleen via een eigen regel in vervoer
    minder_plan: '{}',
  };
}

async function boot(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagVoorautorisatie === 'function');
}
const blok = (page) => page.evaluate(() => diagVoorautorisatie().join('\n'));

test.describe('v290 de tankvoorautorisatie', () => {

  /* DE FIXTURE DRAAGT WAT DE COMMENTS BELOVEN (v260). De achtste is de scherpste: zonder de eigen regel
     valt Tango op `overig` en verdwijnt het 150-drietal zonder dat een assertie het merkt. */
  test('de fixture draagt de gevallen die de regels onderscheiden', async ({ page }) => {
    await boot(page);
    const f = await page.evaluate(() => ({
      tango: TX.filter((t) => /Tango/.test(t.name)).map((t) => catOf(t)),
      ah: TX.filter((t) => /Albert/.test(t.name)).map((t) => catOf(t)),
      totalEcht: TX.filter((t) => /Total/.test(t.name) && t.amount === -85)[0].date,
      totalVoor: TX.filter((t) => /Total/.test(t.name) && t.amount === -125)[0].date,
      shellInVenster: TX.filter((t) => t.name === 'ShellExpress Amste' && t.amount < 0).length,
    }));
    expect(f.tango).toEqual(['vervoer', 'vervoer', 'vervoer']);   // 8: via SET.rules, niet via RULES
    expect(f.ah.every((c) => c !== 'vervoer')).toBe(true);        // 7: anders doet de categorie-poort niets
    /* 5: de echte tankbeurt staat op de LATERE dag, dus "dichtstbijzijnde dag eerst" zou hem kiezen */
    expect(f.totalEcht).toBe('2026-06-03');
    expect(f.totalVoor).toBe('2026-05-31');
    expect(f.shellInVenster).toBe(4);                             // 6: twee tankbeurten in het venster
  });

  test('de drietallen komen uit de VORM en niet uit een bedrag', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    /* zeven drietallen: vier van het toestel, vorm 1, vorm 2 en de maandgrens.
       De boeking zonder bijschrijving en de drie supermarkt-boekingen horen er NIET bij. */
    expect(t).toContain('drietallen gevonden: 8');
    /* 9: de bijschrijving die groter is dan elke afschrijving levert GEEN drietal op */
    expect(t).not.toContain('ParkBee');
    /* het histogram is een WAARNEMING: dat 125 en 150 de pompbedragen zijn komt eruit, het gaat er niet in */
    expect(t).toMatch(/125\.00\s+7x/);
    expect(t).toMatch(/150\.00\s+1x/);
    expect(t).toContain('heel eurobedrag');
    /* de tegenproef: een 125 zonder bijschrijving (Tinq) staat apart en verdwijnt niet */
    expect(t).toMatch(/ZONDER bijschrijving:.*125\.00 1x/);
    /* en er staat geen bedrag en geen winkelnaam in de bron (v266) */
    const bron = await page.evaluate(() => fetch('/index.html').then((r) => r.text()));
    const lijf = bron.slice(bron.indexOf('function diagVoorautorisatie('));
    const eind = lijf.indexOf('\nconst DIAG_BLOKKEN');
    expect(lijf.slice(0, eind)).not.toMatch(/\b(125|150|Shell|Tango|Esso)\b/);
  });

  /* (a) DE VIER VORMEN, EN DE TOESTEL-VORM IS GEEN VAN DE TWEE UIT DE VRAAG */
  test('elke vorm komt uit op zijn eigen geval', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toMatch(/6x\s+vorm 3/);   // de vier van het toestel, de maandgrens en het pending-drietal
    expect(t).toMatch(/1x\s+vorm 2/);
    expect(t).toMatch(/1x\s+vorm 1/);
    /* per toestel-drietal: netto nu is TWEE keer de echte tankbeurt */
    for (const [d, , voor, echt] of TOESTEL) {
      const rij = t.split('\n').find((l) => l.includes(d) && l.includes(voor.toFixed(2)));
      expect(rij, 'rij voor ' + d).toBeTruthy();
      const blokje = t.slice(t.indexOf(rij)).split('\n').slice(0, 4).join('\n');
      expect(blokje).toContain('VORM 3');
      expect(blokje).toContain('netto nu ' + (2 * echt).toFixed(2));
      expect(blokje).toContain('echte tankbeurt ' + echt.toFixed(2));
    }
  });

  /* DE EEN-OP-EEN-EIS: een terugboeking hoort bij precies EEN afschrijving. Zonder die eis claimt de
     tweede afschrijving van een drietal dezelfde terugboeking nog eens, en komt elk drietal er twee
     keer in: een keer terecht en een keer als spook-vorm-1. */
  test('elke boeking komt in hooguit een drietal voor', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    /* DE SECTIE WORDT EERST AFGEBAKEND en de test bindt niet op de INDENTATIE alleen: sectie 2b drukt
       sinds v291 rijen met exact dezelfde vorm af, en zonder deze snede telt de filter er twee secties
       bij elkaar op. Dat is de meetles over een test die op een opmaak ankert in plaats van op de
       eigenschap: hij viel hier terecht, en de snede is de reparatie. */
    const sec2 = t.slice(t.indexOf('2. PER KANDIDAAT-BOEKING'), t.indexOf('2b. WELK OPGESLAGEN VELD'));
    const koppen = sec2.split('\n').filter((l) => /^ {2}20\d\d-\d\d-\d\d\s/.test(l));
    expect(koppen).toHaveLength(8);
    /* geen enkele afschrijving staat twee keer als voorautorisatie */
    const sleutels = koppen.map((l) => l.trim().split(/\s{2,}/).slice(0, 3).join('|'));
    expect(new Set(sleutels).size).toBe(8);
    /* en de echte tankbeurten staan NIET als eigen kop: ze horen bij hun drietal. Het bedrag wordt in
       zijn EIGEN kolom vergeleken en niet als losse tekst: "150.00" bevat "50.00" (meetles: een
       assertie die op een substring bindt raakt een ander geval dan hij beschrijft). */
    const bedragen = koppen.map((l) => l.trim().split(/\s{2,}/)[1]);
    for (const [, , , echt] of TOESTEL) expect(bedragen).not.toContain(echt.toFixed(2));
  });

  /* (b) DE AFSTAND EN DE MAANDGRENS, en de keuzeregel die het maandgrens-geval blootlegt */
  test('de terugboeking hoort bij de voorautorisatie en niet bij de tankbeurt van die dag', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('per dagafstand: 0d 7, 3d 1');
    expect(t).toContain('grootste afstand: 3 dagen');
    expect(t).toContain('terugboeking in een ANDERE maand dan de afschrijving: 1');
    expect(t).toContain('2026-05-31 -> 2026-06-03');
    /* de 40 hangt aan de 125 van 31 mei en niet aan de 85 van 3 juni: het grootste bedrag wint */
    const rij = t.split('\n').find((l) => l.includes('2026-05-31') && l.includes('125.00'));
    const blokje = t.slice(t.indexOf(rij)).split('\n').slice(0, 4).join('\n');
    expect(blokje).toContain('40.00 op 2026-06-03');
    expect(blokje).toContain('85.00 op 2026-06-03 <-- past op het verschil');
  });

  /* (c) WAT HET PER MAAND SCHEELT, EN DE WEEKDAG */
  test('per maand het verschil, en de weekdagrij verschuift als er iets te verschuiven valt', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    /* september: drie drietallen van het toestel, nu 148+214+206, gekoppeld 74+107+103 */
    expect(t).toMatch(/2026-09\s+3\s+568\.00\s+284\.00\s+284\.00/);
    /* juli draagt vorm 1 (65) en vorm 2 (88), die samen NIETS kosten, plus het pending-drietal als vorm 3
       (180 nu tegen 90 gekoppeld). Het verschil van 90 is dus volledig van die vorm 3, en dat is het
       contrast dat vorm 3 duidt: de andere twee vormen kosten niets. */
    expect(t).toMatch(/2026-07\s+3\s+333\.00\s+243\.00\s+90\.00/);
    /* MEI EN JUNI STAAN APART, en dat is de reparatie van v291 op mijn eigen 3c. De vorm van v290 telde
       de terugboeking alleen mee als hij in de maand van de AFSCHRIJVING viel en liet hem anders helemaal
       vallen, terwijl de koptekst "de terugboeking in de hare" beloofde. Die vorm zei mei 125/85/40 en
       juni niets, dus hij verzweeg 45 euro aan juni-regels en stelde de opbrengst 45 te laag voor.
       NU: mei draagt alleen de voorautorisatie (125, gekoppeld niets, want het bedrag valt in juni), juni
       draagt de terugboeking en de tankbeurt (-40 + 85 = 45) tegen een gekoppelde 85. Samen 170 nu tegen
       85 gekoppeld, en dat is precies wat de app over die twee maanden telt. */
    expect(t).toMatch(/2026-05\s+1\s+125\.00\s+0\.00\s+125\.00/);
    expect(t).toMatch(/2026-06\s+0\s+45\.00\s+85\.00\s+-40\.00/);
    /* de weekdagrij is niet inert: er is er precies een te verschuiven */
    expect(t).toContain('verschoven terugboekingen: 1');
    const nu = t.split('\n').find((l) => l.trim().startsWith('nu:'));
    const gek = t.split('\n').find((l) => l.trim().startsWith('gekoppeld:'));
    expect(nu).toBeTruthy(); expect(gek).toBeTruthy();
    expect(nu.replace('nu:', '')).not.toBe(gek.replace('gekoppeld:', ''));
  });


  /* ===== v291: DE FIXTURE DRAAGT DE GEVALLEN DIE 2b EN SECTIE 4 KUNNEN LATEN VALLEN =====
     DE INVOER WORDT EERST GEMETEN, want zonder deze test kan een assertie hieronder groen staan op een
     fixture die het geval niet draagt (meetles b). De pending-vlag is de scherpste: hij moet een boot
     overleven, en het _p-achtervoegsel doet dat NIET omdat categorize() de id herschrijft. */
  test('de fixture draagt de pending-vlag, de afwijkende staart en de interne vorm', async ({ page }) => {
    await boot(page);
    const f = await page.evaluate(() => ({
      pend: TX.filter((t) => t.pending).map((t) => [t.name, t.amount, String(t.id).slice(-2)]),
      tinqCats: TX.filter((t) => /Tinq Purmerend/.test(t.name)).map((t) => catOf(t)),
      staarten: TX.filter((t) => /Tinq Purmerend/.test(t.name)).map((t) => String(t.desc).slice(-4)),
      vdAnders: TX.filter((t) => t.valutaDatum && t.valutaDatum !== t.date).length,
      coolblue: TX.filter((t) => /Coolblue/.test(t.name)).map((t) => catOf(t)),
      geldmaat: TX.filter((t) => /Geldmaat/.test(t.name)).map((t) => catOf(t)),
    }));
    /* de vlag staat op precies EEN boeking, en die is de voorautorisatie van het drietal */
    expect(f.pend).toHaveLength(1);
    expect(f.pend[0][0]).toBe('Tinq Purmerend');
    expect(f.pend[0][1]).toBe(-125);
    /* HET ACHTERVOEGSEL IS GEEN _p MEER NA DE BOOT, en dat is de vondst die 2b uitschrijft: categorize()
       doet t.id=txId(t) en de boot loopt over alle TX. Zou hij er wel staan, dan is die herschrijving
       verdwenen en verandert de betekenis van de _p-kolom in 2b. */
    expect(f.pend[0][2]).not.toBe('_p');
    expect(f.tinqCats).toEqual(['vervoer', 'vervoer', 'vervoer']);   // via de ingebouwde TINQ-regel
    expect(f.staarten).toEqual(['RSRV', 'RSRV', 'PMNT']);            // de staart verschilt per positie
    expect(f.vdAnders).toBe(1);                                      // precies een afwijkende valutadatum
    expect(f.coolblue.every((c) => c === 'shopping')).toBe(true);     // een uitgave BUITEN vervoer
    expect(f.geldmaat.every((c) => c === 'intern')).toBe(true);       // en een interne vorm die eruit moet
  });

  /* 2b: WELK OPGESLAGEN VELD DE DRIE REGELS ONDERSCHEIDT.
     DE ASSERTIE LEEST DE RIJ VAN DIE ENE POSITIE en niet de hele tekst, want een telling die over alle
     posities samen klopt kan de twee posities verwisseld hebben (meetles j). */
  test('2b telt de velden PER POSITIE en niet over alles samen', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    const rij = (nm) => t.split('\n').find((l) => l.trim().startsWith(nm) && /\d/.test(l));
    const kol = (nm) => rij(nm).trim().slice(nm.length).trim().split(/\s+/).map(Number);
    /* kolommen: n, pending, id op _p, valutadatum, vd anders, bankRef, referentie, desc-tijd */
    expect(kol('afschrijving')).toEqual([8, 1, 0, 1, 0, 0, 0, 0]);
    expect(kol('bijschrijving')).toEqual([8, 0, 0, 1, 1, 0, 0, 0]);
    expect(kol('tweede afschrijving')).toEqual([7, 0, 0, 1, 0, 1, 1, 0]);
    /* de bron staat per positie en niet als een totaal */
    expect(t).toMatch(/afschrijving\s+psd2 8/);
    expect(t).toMatch(/tweede afschrijving psd2 7/);
  });

  /* DE STAART VAN DE DESC IS DE ENIGE KANDIDAAT-SCHEIDER DIE DE APP AL OPSLAAT, en de vraag is of de
     uitlezing een verschil TUSSEN de posities laat zien. Zonder de afwijkende staart in de fixture is
     deze telling niet van een constante te onderscheiden. */
  test('2b laat zien dat de staart van de desc per positie kan verschillen', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    const sec = t.slice(t.indexOf('de STAART van de desc'), t.indexOf('   PER DRIETAL,'));
    const stuk = (nm) => { const i = sec.indexOf('     ' + nm + ':'); const r = sec.slice(i + 1);
      const j = r.search(/\n {5}\S.*:\n/); return j < 0 ? r : r.slice(0, j); };
    /* RSRV staat op de afschrijving en op de bijschrijving, en juist NIET op de tweede afschrijving */
    expect(stuk('afschrijving')).toContain('RSRV');
    expect(stuk('bijschrijving')).toContain('RSRV');
    expect(stuk('tweede afschrijving')).not.toContain('RSRV');
    /* en de per-drietal-regels dragen de volle desc, want daar staat de echte code in */
    expect(t).toContain('desc: Tinq Purmerend RSRV');
  });

  /* WAT NIET TE METEN IS, STAAT ER OOK. Een blok dat zwijgt over een ontbrekende meting laat een volgende
     ronde die vraag aan deze uitvoer stellen (v279). */
  test('2b zegt dat er geen import-tijdstip per boeking bestaat', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    expect(t).toContain('UIT WELKE SYNC EEN REGEL KWAM IS NIET TE METEN');
    expect(t).toContain('SET.psd2LastSync');
    /* en de reden dat de _p-kolom op nul staat, want een nul zonder reden leest als een meting */
    expect(t).toContain('PER CONSTRUCTIE OP NUL');
    expect(t).toContain('t.id=txId(t)');
    /* dat die nul geen toevalligheid van deze fixture is, is hierboven op de invoer gemeten */
    const bron = await page.evaluate(() => fetch('/index.html').then((r) => r.text()));
    expect(bron).toContain('TX.forEach(categorize)');
  });

  /* SECTIE 4: DEZELFDE AFLEIDING, EEN RUIMERE SCOPE. De afleiding staat op EEN plek, dus een tweede
     uitdrukking ernaast kan niet uiteenlopen (v104). De test bindt op het GEDRAG: de vervoer-telling van
     sectie 1 moet in sectie 4 terugkomen, plus wat er buiten die categorie staat. */
  test('sectie 4 loopt dezelfde vorm over een ruimere scope', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    const sec = t.slice(t.indexOf('4. DEZELFDE VORM BUITEN'));
    expect(sec).toContain('drietallen: 9');
    expect(sec).toContain('(vervoer alleen: 8)');
    /* de vervoer-rij is dezelfde uitkomst als sectie 1 tot 3, dus die twee kunnen niet uiteenlopen */
    expect(sec).toMatch(/vervoer\s+8\s+1\s+1\s+6\s+1171\.00\s+662\.00\s+509\.00/);
    /* en de winst is dat er een categorie BUITEN vervoer staat met dezelfde vorm */
    expect(sec).toMatch(/shopping\s+1\s+0\s+0\s+1\s+160\.00\s+80\.00\s+80\.00/);
    expect(sec).toContain('Coolblue Online');
    /* DE UITGAVEN-POORT DOET IETS: de interne vorm staat er NIET, ook al is hij vorm 3 met 200-60=140.
       DE ASSERTIE LEEST DE CATEGORIE-KOLOM en niet de hele tekst: de koptekst noemt "een interne
       overboeking valt eruit", dus een verbod op het woord zou op de uitleg vuren in plaats van op een rij. */
    expect(sec).not.toContain('Geldmaat');
    const catRijen = sec.split('\n').filter((l) => /^ {3}\S+\s+\d+\s+\d+\s+\d+\s+\d+\s/.test(l))
      .map((l) => l.trim().split(/\s+/)[0]);
    expect(catRijen).toEqual(['vervoer', 'shopping']);
    /* per tegenpartij, op wat een koppeling zou opleveren; vorm 1 en 2 leveren nul op */
    expect(sec).toMatch(/BP Wormerveer\s+1\s+0\s+0\.00/);
    expect(sec).toMatch(/Esso Zaandam\s+1\s+0\s+0\.00/);
    expect(sec).toContain('tegenpartijen met minstens een vorm 3: 6 van 8');
  });

  /* DE AFLEIDING STAAT OP EEN PLEK (v104), en dat is op de BRON getoetst: het blok mag de vorm niet een
     tweede keer uitdrukken. Beide scopes lopen door vorautDrietallen(), en welke tweede afschrijving bij
     een drietal hoort staat alleen in vorautDelen(). */
  test('de vorm staat een keer in de bron, met twee aanroepers', async ({ page }) => {
    await boot(page);
    const bron = await page.evaluate(() => fetch('/index.html').then((r) => r.text()));
    /* de een-op-een-lus en de vormkeuze staan precies een keer */
    expect(bron.split('const terugAlle=').length - 1).toBe(1);
    expect(bron.split("vorm='3 (").length - 1).toBe(1);
    /* en de "welke tweede afschrijving hoort hierbij"-regel ook */
    expect(bron.split('function vorautDelen(').length - 1).toBe(1);
    expect(bron.split('r.past || (String(r.vorm)').length - 1).toBe(1);
    /* TWEE AANROEPERS, EN DE TELLER NOEMT DE AANROEP EN NIET DE NAAM. Een teller op de bare naam vangt
       ook het comment erboven dat de functie bij naam noemt, en dat is precies het anker dat v276 heeft
       laten omvallen: een bronzoekende teller maakt commentaar deel van zijn oppervlak. */
    expect(bron.split('function vorautDrietallen(').length - 1).toBe(1);
    expect(bron.split('vorautDrietallen(tel)').length - 1).toBe(1);
    expect(bron.split('vorautDrietallen(alles)').length - 1).toBe(1);
    /* EN DE REGEL "WELKE TWEEDE AFSCHRIJVING HOORT HIERBIJ" STAAT EEN KEER. De test telt de REGEL en niet
       zijn LEZERS: een teller op het aantal aanroepen valt bij elke sectie die erbij komt, en dat is het
       anker dat v271 en v272 heeft laten omvallen. Wat vast moet staan is dat geen lezer hem opnieuw
       uitdrukt. */
    expect(bron.split('function vorautDelen(').length - 1).toBe(1);
    expect(bron.split('r.past ||').length - 1).toBe(1);
  });

  /* 3c TELT ELKE BOEKING IN HAAR EIGEN MAAND, en dat is toetsbaar zonder de code na te rekenen: de som
     van de nu-kolom moet gelijk zijn aan wat de app netto over diezelfde boekingen telt. De vorm van v290
     liet een terugboeking in een andere maand VALLEN en haalde die eis dus niet. */
  test('de nu-kolom van 3c telt op tot wat de app over dezelfde boekingen telt', async ({ page }) => {
    await boot(page);
    const t = await blok(page);
    const sec = t.slice(t.indexOf('3c. WAT HET PER MAAND'), t.indexOf('   DE WEEKDAGVERDELING'));
    const rijen = sec.split('\n').filter((l) => /^ {3}20\d\d-\d\d\s/.test(l))
      .map((l) => l.trim().split(/\s+/));
    /* alle vijf de maanden staan er, ook de maand waarin alleen de terugboeking en de tankbeurt vallen */
    expect(rijen.map((r) => r[0])).toEqual(['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    const somNu = rijen.reduce((a, r) => a + Number(r[2]), 0);
    /* de app-kant: dezelfde boekingen, netto, uit de drietallen zelf gehaald en niet uit een constante */
    const echt = await page.evaluate(() => {
      const rij = vorautDrietallen(telbareTx().filter((t2) => catOf(t2) === 'vervoer'));
      let s = 0;
      for (const r of rij) { const D = vorautDelen(r); for (const x of [D.voor, D.terug, D.bij]) if (x) s += -x.amount; }
      return Math.round(s * 100) / 100;
    });
    expect(somNu).toBeCloseTo(echt, 2);
    /* en het TOTAAL in de tabel is de optelling van die rijen (v287) */
    expect(sec).toContain((somNu).toFixed(2));
  });

  /* HET BLOK SCHRIJFT NIETS (v244), gemeten op de SCHRIJVER en niet op de inhoud achteraf. */
  test('het blok schrijft niets en staat in het register', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window._w = 0; const o = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => { window._w++; return o(k, v); }; });
    await blok(page);
    expect(await page.evaluate(() => window._w)).toBe(0);
    /* BIND OP DE LEES-FUNCTIE en niet op de lengte of de laatste entry: dat anker heeft v271 en v272
       twee rondes achter elkaar laten omvallen zodra er een blok bij kwam. */
    expect(await page.evaluate(() => DIAG_BLOKKEN.some((b) => b.lees === diagVoorautorisatie))).toBe(true);
  });
});

