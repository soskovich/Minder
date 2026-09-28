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
  const P = (d, a, name) => tx.push({ id: 'y' + tx.length, date: d, amount: a, acc: A, src: 'psd2',
    name, desc: name + ' PMNT', bankRef: '', typ: '', ref: '', accName: '', refNums: [] });

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
    expect(t).toContain('drietallen gevonden: 7');
    /* 9: de bijschrijving die groter is dan elke afschrijving levert GEEN drietal op */
    expect(t).not.toContain('ParkBee');
    /* het histogram is een WAARNEMING: dat 125 en 150 de pompbedragen zijn komt eruit, het gaat er niet in */
    expect(t).toMatch(/125\.00\s+6x/);
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
    expect(t).toMatch(/5x\s+vorm 3/);   // de vier van het toestel plus de maandgrens
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
    const koppen = t.split('\n').filter((l) => /^ {2}20\d\d-\d\d-\d\d\s/.test(l));
    expect(koppen).toHaveLength(7);
    /* geen enkele afschrijving staat twee keer als voorautorisatie */
    const sleutels = koppen.map((l) => l.trim().split(/\s{2,}/).slice(0, 3).join('|'));
    expect(new Set(sleutels).size).toBe(7);
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
    expect(t).toContain('per dagafstand: 0d 6, 3d 1');
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
    /* juli draagt vorm 1 en vorm 2: die kosten NIETS, en dat is het contrast dat vorm 3 duidt */
    expect(t).toMatch(/2026-07\s+2\s+153\.00\s+153\.00\s+0\.00/);
    /* mei: de terugboeking valt in juni, dus de maand zelf staat te hoog ook al is de vorm gelijk */
    expect(t).toMatch(/2026-05\s+1\s+125\.00\s+85\.00\s+40\.00/);
    /* de weekdagrij is niet inert: er is er precies een te verschuiven */
    expect(t).toContain('verschoven terugboekingen: 1');
    const nu = t.split('\n').find((l) => l.trim().startsWith('nu:'));
    const gek = t.split('\n').find((l) => l.trim().startsWith('gekoppeld:'));
    expect(nu).toBeTruthy(); expect(gek).toBeTruthy();
    expect(nu.replace('nu:', '')).not.toBe(gek.replace('gekoppeld:', ''));
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
