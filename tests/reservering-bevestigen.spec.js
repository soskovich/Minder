/* v293: DE RESERVERING AAN DE POMP, EN DE GEBRUIKER BESLIST PER GEVAL.
 *
 * DE AANLEIDING IS BUITEN DE APP GEMETEN. In de bank-app staat bij zo'n drietal alleen de derde regel
 * als boeking; de eerste twee zijn een reservering en haar vrijgave. Blok 12 heeft op het toestel per
 * positie nagelezen welk opgeslagen veld die twee scheidt, en het antwoord was GEEN ENKEL: pending 0,
 * id-achtervoegsel 0, geen bankRef, geen referentie, geen desc-tijd, en een desc met alleen de naam plus
 * de psd2-code. De reservering kwam dus als GEBOEKTE regel binnen, en een poort op
 * transaction_status=PDNG is daarvoor per constructie blind. Wat overblijft is de VORM plus een
 * bevestiging per geval, precies de vorm van v288.
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o en q):
 *   1. TWEE VORM-3-DRIETALLEN bij verschillende tegenpartijen, met CENTEN. Zonder centen is "de tweede
 *      afschrijving is precies het verschil" niet van een rond toeval te onderscheiden, en met maar een
 *      drietal is niet te zien dat een bevestiging alleen zijn eigen geval raakt;
 *   2. VORM 1 (deels terug, geen tweede afschrijving). Die hoort GEEN kandidaat te zijn, want hij telt
 *      netto al de echte betaling. Zonder dit geval doet de vorm-3-filter niets;
 *   3. VORM 2 (volledig terug, de tankbeurt apart). Idem voor de andere niet-kandidaat-vorm;
 *   4. EEN INTERNE VORM (een Geldmaat-drietal). Zonder dit geval doet de uitgaven-poort niets en blijft
 *      een sabotage die hem weghaalt groen (meetles a en p);
 *   5. EEN LOSSE AFSCHRIJVING VAN DEZELFDE TEGENPARTIJ OP DEZELFDE DAG, die niet op het verschil past.
 *      Die hoort te BLIJVEN staan na een bevestiging; zonder dit geval is niet te zien dat de
 *      bevestiging precies twee boekingen raakt en niet alles van die dag;
 *   6. EEN BOEKING IN EEN ANDERE CATEGORIE op dezelfde dag, zodat de som per categorie toetsbaar is.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const A = '100110012848184840';

function seed() {
  const tx = [];
  const P = (d, a, name, extra) => tx.push(Object.assign({ id: 'z' + tx.length, date: d, amount: a, acc: A,
    src: 'psd2', name, desc: name + ' PMNT', bankRef: '', typ: '', ref: '', accName: '', refNums: [] }, extra || {}));

  /* 1. twee vorm-3-drietallen met centen: 125 - 17.78 = 107.22 en 150 - 99.89 = 50.11 */
  P('2026-09-11', -125, 'BCK*ShellExpress Amste');
  P('2026-09-11', 17.78, 'BCK*ShellExpress Amste');
  P('2026-09-11', -107.22, 'BCK*ShellExpress Amste');
  /* 5. een losse afschrijving van dezelfde tegenpartij op dezelfde dag die NIET op het verschil past */
  P('2026-09-11', -13.5, 'BCK*ShellExpress Amste');

  P('2026-08-20', -150, 'Tango Purmerend');
  P('2026-08-20', 99.89, 'Tango Purmerend');
  P('2026-08-20', -50.11, 'Tango Purmerend');

  /* 2. vorm 1: deels terug, geen tweede afschrijving die past */
  P('2026-07-04', -125, 'Esso Zaandam');
  P('2026-07-04', 60, 'Esso Zaandam');

  /* 3. vorm 2: volledig terug, de tankbeurt apart */
  P('2026-07-11', -125, 'BCK*SHELL LAARDERHOOGT');
  P('2026-07-11', 125, 'BCK*SHELL LAARDERHOOGT');
  P('2026-07-11', -88, 'BCK*SHELL LAARDERHOOGT');

  /* 4. een interne vorm die eruit moet: 200 - 60 = 140 */
  P('2026-06-20', -200, 'Geldmaat Koestraat');
  P('2026-06-20', 60, 'Geldmaat Koestraat');
  P('2026-06-20', -140, 'Geldmaat Koestraat');

  /* 6. een boeking in een andere categorie op dezelfde dag */
  P('2026-09-11', -20, 'Plus de Gors');

  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([A]),
    minder_accmeta: JSON.stringify({ [A]: { balance: 1000, date: '2026-09-28' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {},
      budgets: { vervoer: 1100, boodschappen: 400 },
      rules: [{ kw: 'TANGO', cat: 'vervoer' }] }),   // TANGO staat niet in de ingebouwde RULES
    minder_plan: '{}',
  };
}

async function boot(page) {
/* v310: DEZE SPEC PINT EEN GENOEMDE DAG EN NIET HET RESTANT, want zijn fixture draagt een
     HARDGECODEERDE maand ('2026-09'). Zolang dat september 2026 was stond hij groen; op 1 oktober
     kijkt de transactielijst naar de LOPENDE maand en is die leeg, dus zei hij 'Geen transacties in
     deze periode'. Dat hangt niet aan de dag maar aan de MAAND, en `pinDag()` zou dat niet raken.
     Met een genoemde dag in zijn eigen maand is hij voor altijd deterministisch. */
  await pinDatum(page, '2026-09-24');   // voor de goto, anders leest de boot de echte klok
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof vorautKandidaten === 'function');
}
const kand = (page) => page.evaluate(() => vorautKandidaten().map((x) => ({
  sleutel: x.sleutel, naam: x.voor.name, datum: x.voor.date,
  voor: x.voor.amount, terug: x.terug.amount, bij: x.bij.amount, echt: x.echt,
  keuze: x.keuze })));

test.describe('v293 de reservering aan de pomp', () => {

  /* DE INVOER WORDT EERST GEMETEN (meetles b): zonder deze test kan een assertie hieronder groen staan
     op een fixture die het geval niet draagt. De interne kant is de scherpste. */
  test('de fixture draagt de vormen en de categorieen die de regels onderscheiden', async ({ page }) => {
    await boot(page);
    const f = await page.evaluate(() => ({
      tango: TX.filter((t) => /Tango/.test(t.name)).map((t) => catOf(t)),
      geldmaat: TX.filter((t) => /Geldmaat/.test(t.name)).map((t) => catOf(t)),
      gors: TX.filter((t) => /Gors/.test(t.name)).map((t) => catOf(t)),
      shellLos: TX.filter((t) => /ShellExpress/.test(t.name) && t.amount === -13.5).length,
      /* de vier vormen zoals de afleiding ze ziet, over dezelfde scope als de kandidatenlijst */
      vormen: vorautDrietallen(vorautBron()).map((r) => String(r.vorm).charAt(0) + ':' + r.t.name),
    }));
    expect(f.tango).toEqual(['vervoer', 'vervoer', 'vervoer']);   // via SET.rules, niet via RULES
    expect(f.geldmaat.every((c) => c === 'intern')).toBe(true);   // 4: de interne vorm
    expect(f.gors).toEqual(['boodschappen']);                     // 6: een andere categorie
    expect(f.shellLos).toBe(1);                                   // 5: de losse afschrijving bestaat
    /* alle vier de vormen komen werkelijk voor, anders toetst de vorm-3-filter niets */
    expect(f.vormen.filter((v) => v.startsWith('3:')).length).toBe(3);   // twee tank plus de interne
    expect(f.vormen.filter((v) => v.startsWith('1:')).length).toBe(1);
    expect(f.vormen.filter((v) => v.startsWith('2:')).length).toBe(1);
  });

  /* DE LIJST: alleen vorm 3, alleen uitgaven, nieuwste eerst. */
  test('alleen vorm 3 in een uitgaven-categorie wordt voorgelegd', async ({ page }) => {
    await boot(page);
    const K = await kand(page);
    expect(K).toHaveLength(2);
    expect(K.map((x) => x.naam)).toEqual(['BCK*ShellExpress Amste', 'Tango Purmerend']);
    /* de interne vorm staat er NIET, ook al is hij vorm 3 met 200-60=140 */
    expect(K.some((x) => /Geldmaat/.test(x.naam))).toBe(false);
    /* vorm 1 en vorm 2 staan er niet: die tellen netto al de echte betaling */
    expect(K.some((x) => /Esso/.test(x.naam))).toBe(false);
    expect(K.some((x) => /LAARDERHOOGT/.test(x.naam))).toBe(false);
    /* de drie bedragen per geval, en de echte tankbeurt is het VERSCHIL en niet de tweede regel op zich */
    expect(K[0].voor).toBeCloseTo(-125, 2);
    expect(K[0].terug).toBeCloseTo(17.78, 2);
    expect(K[0].bij).toBeCloseTo(-107.22, 2);
    expect(K[0].echt).toBe(10722);
    expect(K.every((x) => x.keuze === null)).toBe(true);
    /* ELKE KANDIDAAT DRAAGT DRIE REGELS. Dat is de eigenschap achter de guard in vorautKandidaten(), en
       die guard kan vanuit de huidige stand niet vallen omdat vorm 3 hem per constructie waar maakt: een
       sabotage erop blijft groen (meetles r). Daarom staat hier de eigenschap en niet de guard. */
    const drie = await page.evaluate(() => vorautKandidaten().map((x) => [!!x.voor, !!x.terug, !!x.bij]));
    expect(drie).toEqual([[true, true, true], [true, true, true]]);
  });

  /* DE POORT: de bevestiging haalt PRECIES twee boekingen uit de sommen en laat de rest staan. Dit is de
     eigenschap die telt, en hij wordt op de SOM gemeten en niet op een vlag. */
  test('een bevestiging halveert de categorie en raakt niets anders', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({
      vervoer: catSpendMap('2026-09').vervoer, bood: catSpendMap('2026-09').boodschappen,
      n: telbareTx().length,
    }));
    /* 125 - 17.78 + 107.22 + 13.50 = 227.94 */
    expect(voor.vervoer).toBeCloseTo(227.94, 2);
    expect(voor.bood).toBeCloseTo(20, 2);

    const na = await page.evaluate(() => {
      vorautZet(vorautKandidaten()[0].sleutel, 1);
      return { vervoer: catSpendMap('2026-09').vervoer, bood: catSpendMap('2026-09').boodschappen,
        n: telbareTx().length };
    });
    /* de reservering en de vrijgave vallen weg, de echte tankbeurt EN de losse 13.50 blijven staan */
    expect(na.vervoer).toBeCloseTo(120.72, 2);
    expect(na.bood).toBeCloseTo(20, 2);                 // een andere categorie blijft ongemoeid
    expect(na.n).toBe(voor.n - 2);                      // precies twee boekingen, niet drie en niet een
  });

  /* ALLEEN ZIJN EIGEN GEVAL: een bevestiging op het ene drietal laat het andere open en ongewijzigd.
     Zonder een tweede drietal in de fixture is dat niet te zien. */
  test('een bevestiging raakt alleen zijn eigen drietal', async ({ page }) => {
    await boot(page);
    const na = await page.evaluate(() => {
      vorautZet(vorautKandidaten().find((x) => /Shell/.test(x.voor.name)).sleutel, 1);
      return { aug: catSpendMap('2026-08').vervoer,
        open: vorautKandidaten().filter((x) => !x.keuze).map((x) => x.voor.name) };
    });
    /* augustus: 150 - 99.89 + 50.11 = 100.22, onveranderd */
    expect(na.aug).toBeCloseTo(100.22, 2);
    expect(na.open).toEqual(['Tango Purmerend']);
  });

  /* DE DERDE UITKOMST: drie echte boekingen. Zonder die blijft een geval dat geen reservering is eeuwig
     in de lijst staan en gaat de vraag zeuren (v288). Hij legt een keuze vast en verandert geen cijfer. */
  test('drie echte boekingen legt de keuze vast en verandert geen enkel bedrag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const voor = catSpendMap('2026-09').vervoer, n = telbareTx().length;
      vorautZet(vorautKandidaten()[0].sleutel, 0);
      const K = vorautKandidaten()[0];
      return { voor, na: catSpendMap('2026-09').vervoer, n, nNa: telbareTx().length,
        weg: K.keuze.weg, open: vorautKandidaten().filter((x) => !x.keuze).length };
    });
    expect(r.na).toBeCloseTo(r.voor, 2);
    expect(r.nNa).toBe(r.n);
    expect(r.weg).toEqual([]);
    expect(r.open).toBe(1);   // hij staat niet meer open, dus de vraag komt niet terug
  });

  /* EEN KEUZE WORDT NIET STIL OVERSCHREVEN. De sheet toont bij een beslist geval alleen nog
     'Terugdraaien', dus dit pad ontstaat alleen uit een sheet die nog openstond toen je elders koos.
     Zonder deze test blijft de sabotage die de guard weghaalt groen: geen enkele andere test roept
     vorautZet() twee keer op dezelfde sleutel. */
  test('een tweede keuze op hetzelfde geval verandert de vastgelegde keuze niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const s = vorautKandidaten()[0].sleutel;
      vorautZet(s, 0);                                   // drie echte boekingen
      const eerst = JSON.parse(JSON.stringify(SET.vorautPaar[s]));
      const som = catSpendMap('2026-09').vervoer;
      vorautZet(s, 1);                                   // en daarna alsnog 'reservering'
      return { eerst, tweede: SET.vorautPaar[s], som, somNa: catSpendMap('2026-09').vervoer };
    });
    expect(r.tweede).toEqual(r.eerst);
    expect(r.somNa).toBeCloseTo(r.som, 2);
    /* terugdraaien blijft de weg terug, en die staat in de sheet */
    const terug = await page.evaluate(() => { openVoraut(); return $('#sheet').innerText; });
    expect(terug).toContain('Terugdraaien');
  });

  /* TERUGDRAAIEN IS DE VLAG WEGHALEN, en dan is de stand karakter voor karakter terug. */
  test('terugdraaien zet elke som exact terug', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const voor = JSON.stringify([catSpendMap('2026-09'), telbareTx().length, totalBalance().som]);
      const s = vorautKandidaten()[0].sleutel;
      vorautZet(s, 1);
      const mid = JSON.stringify([catSpendMap('2026-09'), telbareTx().length, totalBalance().som]);
      vorautTerug(s);
      return { voor, mid, na: JSON.stringify([catSpendMap('2026-09'), telbareTx().length, totalBalance().som]) };
    });
    expect(r.mid).not.toBe(r.voor);   // de bevestiging deed werkelijk iets
    expect(r.na).toBe(r.voor);
    /* EN HET GEVAL STAAT WEER OPEN, niet als 'drie echte boekingen' vastgelegd. Zonder deze assertie
       blijft een terugdraaien dat de vlag op een lege keuze zet in plaats van hem te WISSEN groen: de
       sommen zijn dan namelijk identiek, want een lege keuze haalt ook niets weg. */
    const open = await page.evaluate(() => vorautKandidaten().filter((x) => !x.keuze).length);
    expect(open).toBe(2);
    expect(await page.evaluate(() => Object.keys(SET.vorautPaar || {}).length)).toBe(0);
  });

  /* DE BOEKING BLIJFT IN TX EN IN DE LIJST, en zegt daar dat hij niet meetelt. Stil verdwijnen is erger
     dan een dubbele die je ziet (v281/v284/v288). */
  test('de weggevallen boekingen staan nog in de lijst en zeggen dat ze niet meetellen', async ({ page }) => {
    await boot(page);
    const n = await page.evaluate(() => {
      vorautZet(vorautKandidaten()[0].sleutel, 1);
      return TX.length;
    });
    expect(n).toBe(16);   // er is niets weggegooid
    await page.evaluate(() => { go('tx'); renderTxList(); });
    const txt = await page.locator('#txlist').innerText();
    expect(txt).toContain('telt niet mee, je legde dit vast als reservering');
    /* en de echte tankbeurt draagt die regel NIET */
    const regels = txt.split('\n');
    const i = regels.findIndex((l) => /107,22/.test(l));
    expect(i).toBeGreaterThanOrEqual(0);
  });

  /* DE REGEL IN INSTELLINGEN IS GEDEMPT EN NIET AMBER (v78/v93): de app KAN hier niets vaststellen, en
     amber zou een vondst claimen die de code niet draagt. Geen open geval, geen regel. */
  test('de regel in Instellingen verschijnt en verdwijnt met de open gevallen', async ({ page }) => {
    await boot(page);
    let r = await page.evaluate(() => vorautRegel());
    expect(r).toContain('2 betalingen kunnen een reservering');
    expect(r).toContain('--mut2');
    expect(r).not.toContain('amber');
    /* DE REGEL DRAAGT DE ENIGE INGANG NAAR HET TERUGDRAAIEN, dus hij blijft staan zodra je iets hebt
       beslist, met een andere tekst. Zou hij verdwijnen, dan is de belofte van de terugdraai-knop onwaar
       en is het geval uit zicht (de meetles over een melding als enige drager van een ingang). */
    r = await page.evaluate(() => {
      for (const x of vorautKandidaten()) vorautZet(x.sleutel, 1);
      return vorautRegel();
    });
    expect(r).toContain('2 betalingen heb je zelf beoordeeld');
    expect(r).toContain('openVoraut()');
    const sheet = await page.evaluate(() => { openVoraut(); return $('#sheet').innerText; });
    expect(sheet).toContain('Terugdraaien');
    /* en zonder enig geval staat er niets */
    const leeg = await page.evaluate(() => { TX.length = 0; return vorautRegel(); });
    expect(leeg).toBe('');
  });

  /* DE POORT STAAT OP EEN PLEK, EN telbareTx() IS ERUIT AFGELEID. Een bevestigd drietal moet in de LIJST
     blijven staan, anders is de keuze niet terug te draaien; daarom leest vorautKandidaten() vorautBron()
     en telbareTx() diezelfde bron plus vorautWeg(). De test bindt op de AFLEIDING en niet op een spelling. */
  test('vorautBron is telbareTx plus de eigen uitkomst, en verder niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      vorautZet(vorautKandidaten()[0].sleutel, 1);
      const bron = vorautBron(), tel = telbareTx();
      return { bron: bron.length, tel: tel.length,
        verschil: bron.filter((t) => !tel.includes(t)).map((t) => t.amount).sort((a, b) => a - b) };
    });
    expect(r.bron).toBe(r.tel + 2);
    expect(r.verschil).toEqual([-125, 17.78]);
  });

  /* BLOK 12 LEEST ZIJN EIGEN UITKOMST TERUG (v289): na een bevestiging moet per drietal te zien zijn wat
     er met hem is gebeurd, anders is dat na een paar keuzes niet meer af te leiden. */
  test('blok 12 zegt per drietal wat de app ermee deed', async ({ page }) => {
    await boot(page);
    let t = await page.evaluate(() => diagVoorautorisatie().join('\n'));
    expect(t).toContain('STAAT OPEN in de kandidatenlijst');
    /* vorm 1 en vorm 2 staan er als GEEN kandidaat, met de reden */
    expect(t).toContain('geen kandidaat: alleen vorm 3 wordt voorgelegd');
    t = await page.evaluate(() => {
      vorautZet(vorautKandidaten()[0].sleutel, 1);
      return diagVoorautorisatie().join('\n');
    });
    expect(t).toContain('AFGEHANDELD: jij legde dit vast als een reservering');
    /* HET DRIETAL BLIJFT IN DE MEETLIJST STAAN, want het blok leest vorautBron() en niet telbareTx():
       las hij de poort met zijn eigen uitkomst erin, dan verdween precies het geval dat hij moet tonen. */
    expect(t).toContain('drietallen gevonden: 4');
    /* VIER EN NIET TWEE, en dat verschil is de reden dat beide tellingen bestaan: het blok telt alle
       DRIETALLEN in de vervoer-categorie (ook vorm 1 en vorm 2), de kandidatenlijst telt alleen de
       gevallen waarover jij iets te beslissen hebt. Een assertie op 2 zou die twee door elkaar halen. */
    /* en 3c zegt dat er bij dat drietal niets meer te winnen is, want de nu-kolom leest de poort wel */
    expect(t).toMatch(/2026-09\s+1\s+107\.22\s+107\.22\s+0\.00/);
    /* augustus staat er nog wel op de volle winst */
    expect(t).toMatch(/2026-08\s+1\s+100\.22\s+50\.11\s+50\.11/);
    /* en juli, met vorm 1 en vorm 2, kost nul: dat is de meting waarop de vorm-3-afbakening rust */
    expect(t).toMatch(/2026-07\s+2\s+153\.00\s+153\.00\s+0\.00/);
  });

  /* DE AFLEIDING STAAT OP EEN PLEK, MET DRIE AANROEPERS: de twee scopes van blok 12 en de
     kandidatenlijst. Een tweede uitdrukking van de vorm zou bij de eerste wijziging uiteenlopen (v104). */
  test('de vorm staat een keer in de bron, en de kandidatenlijst leest hem', async ({ page }) => {
    await boot(page);
    const bron = await page.evaluate(() => fetch('/index.html').then((r) => r.text()));
    expect(bron.split('function vorautDrietallen(').length - 1).toBe(1);
    expect(bron.split('const terugAlle=').length - 1).toBe(1);
    expect(bron.split("vorm='3 (").length - 1).toBe(1);
    /* de kandidatenlijst drukt de vorm-keuze niet opnieuw uit: hij LEEST het vorm-veld */
    expect(bron.split("String(r.vorm).charAt(0)!=='3'").length - 1).toBe(1);
    /* EN DE POORT STAAT OP EEN PLEK, MET vorautBron() ERUIT AFGELEID. Deze assertie ankerde tot v304 op
       de letterlijke regel `vorautBron().filter(t=>!vorautWeg(t))`, en dat is een anker op een SPELLING
       en niet op de eigenschap (v276). Sinds v304 staat de poort als lijst met een naam per poort, zodat
       een meting er precies EEN kan overslaan zonder de rest te kopieren; de eigenschap die vast moet
       liggen is dat elke eis EEN keer in die lijst staat en dat beide ingangen die lijst lezen. */
    expect(bron.split('function vorautWeg(').length - 1).toBe(1);
    expect(bron.split('function vorautBron(').length - 1).toBe(1);
    expect(bron.split('const TELPOORTEN=').length - 1).toBe(1);
    for (const pred of ['csvDubbel(t)', 'mt940Dubbel(t)', 'dubbelWeg(t)', 'vorautWeg(t)'])
      expect(bron.split('t=>' + pred).length - 1, pred + ' staat een keer in de poortlijst').toBe(1);
    expect(bron.split("function vorautBron(){ return telbareTx('voraut'); }").length - 1).toBe(1);
  });
});
