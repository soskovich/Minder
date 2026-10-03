/* v289: DE UITLEZING VAN v288, EN EEN OVERSCHRIJDING DIE DOOR EEN CORRECTIE VERDWEEN.
 *
 * DE AANLEIDING IS DE UITVOER VAN v288 ZELF, op het toestel. Na vier bevestigde paren was in de hele
 * diagnose niet te zien WELKE paren waren afgehandeld: `SET.dubbelPaar` had geen enkele lezer, en de
 * dezelfde-dag-lijst van blok 10 drukte precies hetzelfde af als ervoor. Dat moest worden afgeleid uit
 * de "niet meegeteld"-regels van blok 9, en die dekken zes weken, dus de paren van 03-08 en 04-08 waren
 * per constructie onzichtbaar. Elk ander stuk van v288 had wel een uitlezing.
 *
 * EN DE LOG NOEMDE EEN CORRECTIE "NIETS GEDAAN". `valtOpAfsluiten()` kent twee handelingen (potje
 * bijgesteld, grens gezet) en zet al het andere op 'geen'. Een overschrijding die verdween omdat je een
 * dubbele boeking bevestigde of een verkeerde eigen categorie liet vervallen, las daarmee als een maand
 * waarin je niets deed, bij precies de handeling die hem oploste.
 *
 * HET LABEL EIST DAT DE CORRECTIE HET VERSCHIL MAAKTE, en dat is de scherpte van deze ronde: drie eisen
 * tegelijk (de maand eindigt op of onder het potje, er IS een correctie, en zonder die correctie was hij
 * er nog overheen). Elk van de drie heeft hieronder zijn eigen categorie, want een eis die op geen enkel
 * geval kan vallen is geen eis (meetles o).
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT:
 *   overig       - over het potje, en de correctie haalde hem eronder            -> 'correctie'
 *   uiteten      - over het potje, WEL een correctie, en nog steeds over         -> 'geen'
 *   boodschappen - WEL een correctie, maar de maand was toch al onder het potje  -> 'geen'
 *   vervoer      - over het potje, GEEN enkele correctie                         -> 'geen'
 *   abonnement   - draagt al een eigen actie (potje bijgesteld), die wint        -> blijft
 * En binnen `overig` staan BEIDE takken van de correctie-meting, want ze vinden elkaars geval niet:
 *   de Warrie-vorm  - de bevestigde kant telde ZELF in die categorie mee (26 euro);
 *   de Geldmaat-vorm - de bevestigde kant is nu `intern`, en wat uit de categorie viel is de OVERRIDE
 *                      die bij de bevestiging verviel (200 euro). Tak (a) ziet die per constructie niet.
 *   de derde vorm   - de override stond op de kant die WEGVIEL. Dan moet de override winnen van de
 *                      huidige categorie van die boeking, anders telt hij als `intern` en valt hij weg.
 *                      Zonder dit geval is de volgorde waarin de twee takken schrijven inert.
 * Voor blok 10 staan er vier gevallen die de vier statusvormen onderscheiden: afgehandeld, open, geen
 * kandidaat op een reden, en een groep van drie.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
/* v324: DE KLOK STAAT OP EEN GENOEMDE DAG, en dat is gemeten en niet voorzichtig. De fixture draagt
   een HARDGECODEERDE maand (2026-08) en blok 10 leest alleen de laatste DIAG_RECENT_DAGEN (60) dagen.
   Op 3 oktober 2026 ligt de grens op 4 augustus, dus het Zwanebloem-paar van 08-03 viel erbuiten en
   stonden er vier gemarkeerde regels in plaats van vijf. GEMETEN met DEZELFDE code: groen met de klok
   op 2 oktober, rood op 3 oktober. Er is dus geen commit die hem rood maakte; het is de kalender-as
   van v299/v310, op de rand van een venster in plaats van op een maandgrens. Op 15 september valt heel
   augustus binnen het venster en is augustus een afgeronde maand, wat valtOpAfsluiten() eist. */
const DAG = '2026-09-15';

const A = '100110012848184840';
const M = '2026-08';                    // een AFGERONDE maand, anders sluit valtOpAfsluiten() niets af
const POT = { overig: 500, vervoer: 100, boodschappen: 400, uiteten: 55 };
const GELD = 200, GELD2 = 150, WARRIE = 26, MCD = 40, VOMAR = 30;

function seed() {
  const tx = [];
  const P = (d, a, name, desc) => tx.push({ id: 'x' + tx.length, date: M + '-' + d, amount: a, acc: A,
    src: 'psd2', name, desc: desc || name + ' PMNT', bankRef: '', typ: '', ref: '', accName: '', refNums: [] });

  /* overig, tak (b): de override staat op de kant die BLIJFT */
  P('04', -GELD, 'Geldmaat Koestraat 13'); P('04', -GELD, 'Geldmaat GM Koestraat');
  /* overig, de derde vorm: de override staat op de kant die WEGVALT */
  P('03', -GELD2, 'Geldmaat Zwanebloem 9'); P('03', -GELD2, 'Geldmaat GM Zwanebloe');
  /* overig, tak (a): de bevestigde kant telt zelf in overig mee */
  P('19', -WARRIE, 'Rest.Warrie& Knarr'); P('19', -WARRIE, 'Rest.Warrie_ Knarr');
  P('02', -403, 'Rommelmarkt');

  /* uiteten: over het potje, een correctie, en nog steeds over */
  P('06', -120, 'McDonalds Purmerend');
  P('05', -MCD, 'McDonalds Purmerend A'); P('05', -MCD, 'McDonalds Purmerend GM');

  /* boodschappen: een correctie, maar ver onder het potje */
  P('07', -VOMAR, 'Vomar Purmerend 3'); P('07', -VOMAR, 'Vomar Purmerend GM');

  /* vervoer: over het potje, geen correctie */
  P('09', -300, 'Shell Muntbergweg');

  /* blok 10: geen kandidaat op de desc-tijd */
  P('11', -9.99, 'eCom, Betaalpas PLAYSTATI', 'eCom, Betaalpas PLAYSTATION NR:TERMBNET, 10.08.26/13:06 Hilversum');
  P('11', -9.99, 'eCom, Betaalpas PLAYSTATIE', 'eCom, Betaalpas PLAYSTATION NR:TERMBNET, 10.08.26/19:38 Hilversum');
  /* blok 10: drie met dezelfde sleutel */
  for (const k of ['een', 'twee', 'drie']) P('12', -65, 'CJIB Verkeersboetes ' + k);
  /* blok 10: een paar dat OPEN blijft */
  P('13', -55, 'Kruidvat Purmerend 1'); P('13', -55, 'Kruidvat Purmerend GM');

  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([A]),
    minder_accmeta: JSON.stringify({ [A]: { balance: 1000, date: '2026-09-28' } }),
    minder_set: JSON.stringify({ limit: 70, toonLegeRek: true, manualBal: {}, budgets: POT,
      psd2Accounts: { [A]: { uid: 'u', iban: 'DE89' + A, hash: 'h', label: 'Zakgeld', bank: 'N26', exp: '2026-12-27' } } }),
    minder_plan: '{}',
  };
}

/* De overrides en de bevestigingen gaan via de echte weg: `t.id` bestaat pas als de app draait (v281),
   en een fixture die zelf schrijft wat de code moet schrijven toetst de code niet (meetles g). */
async function boot(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await pinDatum(page, DAG);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof valtOpCorrectieBedrag === 'function');
  await page.evaluate(() => {
    for (const t of TX) {
      if (t.name === 'Geldmaat Koestraat 13') OVR[t.id] = 'overig';     // op de kant die BLIJFT
      if (t.name === 'Geldmaat GM Zwanebloe') OVR[t.id] = 'overig';     // op de kant die WEGVALT
    }
    save();
    const kies = (naam, wegNaam) => {
      const p = dubbelParen().find((x) => !x.keuze && (x.a.name === naam || x.b.name === naam));
      dubbelParenZet(p.sleutel, [p.a, p.b].find((t) => t.name === wegNaam).id);
    };
    kies('Geldmaat Koestraat 13', 'Geldmaat GM Koestraat');
    kies('Geldmaat Zwanebloem 9', 'Geldmaat GM Zwanebloe');
    kies('Rest.Warrie& Knarr', 'Rest.Warrie_ Knarr');
    kies('McDonalds Purmerend A', 'McDonalds Purmerend GM');
    kies('Vomar Purmerend 3', 'Vomar Purmerend GM');
  });
}

/* De vijf records, alle vier open plus een met een eigen actie, en dan afsluiten. */
const sluit = (page) => page.evaluate(([m, pot]) => {
  SET.valtOpLog = {};
  for (const k in pot) SET.valtOpLog[m + '|' + k] = { id: m + '|' + k, maand: m, categorie: CATS[k].name,
    potjeId: k, potje_bij_detectie: pot[k], over_bij_detectie: 1, gedetecteerd_op: m + '-20', getoond: true,
    actie: null, actie_op: null, potje_voor: null, potje_na: null, over_eind_maand: null };
  SET.valtOpLog[m + '|abonnement'] = { id: m + '|abonnement', maand: m, categorie: 'Abonnementen',
    potjeId: 'abonnement', potje_bij_detectie: 5, over_bij_detectie: 10, gedetecteerd_op: m + '-20',
    getoond: true, actie: 'potje_bijgesteld', actie_op: m + '-21', potje_voor: 5, potje_na: 20, over_eind_maand: null };
  valtOpAfsluiten();
  const uit = {};
  for (const k in SET.valtOpLog) uit[k.split('|')[1]] = { actie: SET.valtOpLog[k].actie,
    over: SET.valtOpLog[k].over_eind_maand, bedrag: SET.valtOpLog[k].correctie_bedrag || 0 };
  return uit;
}, [M, POT]);

const blok8 = (page) => page.evaluate(() => diagRekeningen().join('\n'));
const blok10 = (page) => page.evaluate(() => diagDubbel().join('\n'));

test.describe('v289 correctie en uitlezing', () => {

  /* DE FIXTURE DRAAGT DE DRIE VORMEN DIE DE TWEE TAKKEN ONDERSCHEIDEN (v260: een comment is een bewering
     en die hoort zelf getoetst). Zonder deze toets kan een geval stil wegvallen en blijven de asserties
     eronder groen op een fixture die ze niet meer raakt. */
  test('de fixture draagt de drie vormen van een correctie', async ({ page }) => {
    await boot(page);
    const f = await page.evaluate(() => {
      const P = SET.dubbelPaar, idx = new Map(); for (const t of TX) idx.set(t.id, t);
      const vorm = (naam) => { for (const k in P) { const e = P[k];
        const w = idx.get(e.weg); if (!w) continue;
        const kanten = TX.filter((t) => dubbelSleutel(t) === k);
        if (!kanten.some((t) => t.name === naam)) continue;
        return { wegNaam: w.name, wegCat: catOf(w), ovrOp: Object.keys(e.ovr || {}).map((id) => (idx.get(id) || {}).name) };
      } return null; };
      return { warrie: vorm('Rest.Warrie& Knarr'), koestraat: vorm('Geldmaat Koestraat 13'),
        zwanebloem: vorm('Geldmaat Zwanebloem 9') };
    });
    /* tak (a): de bevestigde kant staat ZELF in overig, en er verviel geen override */
    expect(f.warrie).toEqual({ wegNaam: 'Rest.Warrie_ Knarr', wegCat: 'overig', ovrOp: [] });
    /* tak (b): de bevestigde kant is intern, en de override stond op de kant die BLIJFT */
    expect(f.koestraat).toEqual({ wegNaam: 'Geldmaat GM Koestraat', wegCat: 'intern', ovrOp: ['Geldmaat Koestraat 13'] });
    /* de derde vorm: de override stond op de kant die WEGVIEL */
    expect(f.zwanebloem).toEqual({ wegNaam: 'Geldmaat GM Zwanebloe', wegCat: 'intern', ovrOp: ['Geldmaat GM Zwanebloe'] });
  });

  test('de correctie-meting telt beide takken, en elke boeking een keer', async ({ page }) => {
    await boot(page);
    const m = await page.evaluate(([mnd]) => ({
      overig: valtOpCorrectieBedrag(mnd, 'overig'),
      uiteten: valtOpCorrectieBedrag(mnd, 'uiteten'),
      boodschappen: valtOpCorrectieBedrag(mnd, 'boodschappen'),
      vervoer: valtOpCorrectieBedrag(mnd, 'vervoer'),
    }), [M]);
    /* 26 uit tak (a) plus 200 en 150 uit tak (b); de derde vorm telt EEN keer en niet nul of twee */
    expect(m.overig).toBe(WARRIE + GELD + GELD2);
    expect(m.uiteten).toBe(MCD);
    expect(m.boodschappen).toBe(VOMAR);
    expect(m.vervoer).toBe(0);
  });

  /* DE DRIE EISEN, ELK MET DE CATEGORIE DIE HEM ONDERSCHEIDT. Dit is de kern van de ronde en het staat
     in EEN test, want de eigenschap is het CONTRAST: vier categorieën, een uitkomst. */
  test('alleen een correctie die het verschil maakte sluit af als correctie', async ({ page }) => {
    await boot(page);
    const r = await sluit(page);
    expect(r.overig).toEqual({ actie: 'correctie', over: 0, bedrag: WARRIE + GELD + GELD2 });
    expect(r.uiteten.actie).toBe('geen');          // wel een correctie, maar nog steeds over
    expect(r.uiteten.over).toBeGreaterThan(0);
    expect(r.boodschappen.actie).toBe('geen');     // wel een correctie, maar was toch al onder
    expect(r.boodschappen.over).toBe(0);
    expect(r.vervoer.actie).toBe('geen');          // over, maar geen enkele correctie
    expect(r.vervoer.over).toBeGreaterThan(0);
    /* een record dat al een eigen handeling draagt houdt die: jouw keuze wint van een afleiding */
    expect(r.abonnement.actie).toBe('potje_bijgesteld');
  });

  test('de log noemt het zo, en de telling zet het apart', async ({ page }) => {
    await boot(page);
    await sluit(page);
    const t = await page.evaluate(() => { const d = document.createElement('div');
      d.innerHTML = valtOpLogBlok(); return d.innerText.replace(/\s+/g, ' '); });
    expect(t).toContain('Overig · augustus 2026 vervallen na correctie');
    expect(t).toContain('1× vervallen na correctie');
    expect(t).toContain('3× niets gedaan');
    /* en de telling telt hem NIET ook nog eens bij 'niets gedaan' */
    expect(await page.evaluate(() => valtOpTelling().n)).toEqual(
      // v314: 'zo gelaten' is een eigen uitkomst naast 'niets gedaan' - een keuze tegenover een stilte
      // v315: 'volgende maand anders' is de vierde handeling en staat onvoorwaardelijk in de teller
      { potje_bijgesteld: 1, volgende_maand: 0, grens_gezet: 0, zo_gelaten: 0, correctie: 1, geen: 3 });
  });

  /* ZONDER CORRECTIE STAAT DE TERM ER NIET, want een telregel die altijd een nul meedraagt groeit voor
     wie hem nooit haalt. Dat is te toetsen door de vlaggen weg te halen en opnieuw af te sluiten. */
  test('zonder enige correctie noemt de telregel de term niet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.dubbelPaar = {}; save(); });
    await sluit(page);
    const t = await page.evaluate(() => { const d = document.createElement('div');
      d.innerHTML = valtOpLogBlok(); return d.innerText.replace(/\s+/g, ' '); });
    expect(t).not.toContain('vervallen na correctie');
    expect(t).toContain('4× niets gedaan');
  });

  test('blok 8 schrijft elk bevestigd paar uit, met de vijf feiten', async ({ page }) => {
    await boot(page);
    const b = await blok8(page);
    const sec = b.split('BEVESTIGDE KANDIDAAT-PAREN')[1].split('EIGEN CATEGORIEEN')[0];
    expect(+sec.split(':')[1].trim().split(/\s/)[0]).toBe(5);
    /* datum, bedrag, welke kant bleef, welke viel weg, en de keuze */
    expect(sec).toContain(M + '-04');
    expect(sec).toContain('-200.00');
    expect(sec).toContain('valt weg:     Geldmaat GM Koestraat');
    expect(sec).toContain('blijft staan: Geldmaat Koestraat 13');
    expect(sec).toContain('jouw keuze:   deze kant valt weg');
    expect(sec).toContain('eigen categorie vervallen: Geldmaat Koestraat 13 -> Overig');
    /* de paren buiten het venster van blok 9 staan er ook in, en dat was de hele aanleiding */
    expect(sec).toContain(M + '-03');
    expect(sec).toContain(M + '-19');
    /* het totaal telt de rijen op (v271/v287) */
    const eur = WARRIE + GELD + GELD2 + MCD + VOMAR;
    expect(sec).toContain('5 paar als dubbel bevestigd (' + eur + ' euro');
    /* en wat er nog openstaat hoort er als andere helft bij */
    expect(sec).toContain('nog open in de kandidatenlijst: 1');
    expect(sec).toContain('Kruidvat');
  });

  test('blok 8 kent de keuze twee-verschillende-betalingen apart', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { const p = dubbelParen().find((x) => !x.keuze); dubbelParenZet(p.sleutel, ''); });
    const sec = (await blok8(page)).split('BEVESTIGDE KANDIDAAT-PAREN')[1].split('EIGEN CATEGORIEEN')[0];
    expect(sec).toContain('jouw keuze:   twee verschillende betalingen, allebei tellen mee');
    expect(sec).toContain('1 paar vastgelegd als twee betalingen');
    expect(sec).toContain('nog open in de kandidatenlijst: 0');
  });

  /* BLOK 10 ZEGT PER GROEP WAT ER MEE IS GEBEURD, en de vier vormen staan er alle vier. Zonder deze
     regels drukt de lijst na vijf bevestigingen precies hetzelfde af als ervoor. */
  test('blok 10 markeert elke groep en elke bevestigde boeking', async ({ page }) => {
    await boot(page);
    const sec = (await blok10(page)).split('OP DEZELFDE DAG')[1].split('BOEKDATUM TEGEN')[0];
    expect(sec).toContain('AFGEHANDELD: "Geldmaat GM Koestraat" valt weg');
    expect(sec).toContain('STAAT OPEN in de kandidatenlijst');
    expect(sec).toContain('geen kandidaat: twee verschillende desc-tijden');
    expect(sec).toContain('geen kandidaat: drie of meer boekingen');
    /* DE GEMARKEERDE REGELS ZIJN PRECIES DE BEVESTIGDE KANTEN, en dat wordt uit de BRON gelezen en niet
       aan een naamconventie opgehangen: een assertie op "de naam bevat GM" bindt op de fixture en niet
       op de eigenschap (v276). */
    const weg = await page.evaluate(() => { const idx = new Map(); for (const t of TX) idx.set(t.id, t);
      return Object.values(SET.dubbelPaar).filter((e) => e.weg).map((e) => (idx.get(e.weg) || {}).name); });
    const rij = sec.split('\n').filter((l) => l.includes('name="'));
    const gemarkeerd = rij.filter((l) => l.includes('bevestigd als dubbel'));
    expect(gemarkeerd).toHaveLength(weg.length);
    for (const naam of weg) expect(gemarkeerd.some((l) => l.includes('name="' + naam.slice(0, 26)))).toBe(true);
    /* en de kant die bleef staan draagt de markering juist NIET */
    for (const l of rij.filter((x) => !x.includes('bevestigd als dubbel')))
      expect(weg.some((naam) => l.includes('name="' + naam.slice(0, 26) + '"'))).toBe(false);
  });

  /* HET BLOK VERANDERT NIETS (v244), en dat wordt op de SCHRIJVER gemeten en niet op de inhoud
     achteraf: wie dezelfde waarde terugzet is ook een schrijver. */
  test('beide blokken schrijven niets', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { window._w = 0; const o = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => { window._w++; return o(k, v); }; });
    await blok8(page); await blok10(page);
    expect(await page.evaluate(() => window._w)).toBe(0);
  });
});
