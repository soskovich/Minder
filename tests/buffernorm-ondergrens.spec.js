/* v305: DE BUFFERNORM. Vier besluiten van de gebruiker, en ze raken elk een andere kant van dezelfde
 * deling.
 *
 * DE AANLEIDING IS GEMETEN: staan alle spaardoelen op EEN spaarrekening, dan telde het geld voor die
 * doelen als buffer mee, want de teller van bufferMaanden() was dat rekeningsaldo.
 *  (1) DE TELLER wordt wat Plan aan het noodfonds heeft TOEGEWEZEN, dezelfde bron als de
 *      noodfonds-regel op Plan, en dus geen tweede afleiding uit het saldo.
 *  (2) DE CONTROLE IS HET SALDO: is er meer toegewezen dan er staat, dan telt de buffer niet als vol
 *      en zeggen Plan en Grip van welk doel het verschil zou komen.
 *  (3) DE NORM IS DE ONDERGRENS, niet het doel: een eigen noodfonds dat hoger ligt blijft het doel,
 *      een dat lager ligt wordt door de norm opgetild.
 *  (4) DE DREMPEL VOOR BELEGGEN IS EEN EIGEN KEUZE, los van de norm.
 *
 * WAT DE FIXTURE DRAAGT, EN WAAROM ELK GEVAL ERIN STAAT (meetles o):
 *  - DE TOEWIJZING WIJKT AF VAN HET SALDO (1000 tegen 2000). Zonder dat verschil is de nieuwe teller
 *    niet van de oude te onderscheiden en blijft elke sabotage erop groen. Daarvoor is
 *    nfToegewezenMigrated nodig: anders zet migrateNfToegewezen() de toewijzing bij de boot GELIJK
 *    aan het saldo (v172) en is het verschil per constructie nul.
 *  - EEN EIGEN DOEL ONDER DE NORM (1200 tegen 3 x 500), want dat is het geval waarvoor besluit (3)
 *    bestaat; de variant `doelVast: 5000` is de andere kant, en zonder die twee samen is "de norm is
 *    de ondergrens" niet van "de norm is het doel" te onderscheiden.
 *  - EEN RICHT VAN 2 (SET.nfMaanden), want met de default van 4 is `ok` per constructie onbereikbaar
 *    bij een buffer van 2 maanden en toetst de norm-tak niets.
 *  - EEN DOEL MET EEN TOEWIJZING, zodat de som over de bestemmingen boven het saldo KAN komen; in de
 *    basis komt hij daar niet boven (1200 van 2000), en `gespaard: 1500` is de variant waarin hij dat
 *    wel doet. Zonder die twee kanten is de controle van besluit (2) niet toetsbaar.
 *  - GEEN BEWEGING OP DE SPAARREKENING, dus savedNet() is nul en bufferTempo() zegt niet `stijgt`.
 *    Anders schuift de status van `tekort` naar `let op` om een reden die niets met de norm te maken
 *    heeft (meetles r: het geval valt dan al op een andere eis).
 *  - DE NOEMER IS EEN POST: huur, vier gelijke maanden, klasse `vast`, dus essCrisis is die mediaan
 *    en de getallen zijn met de hand na te rekenen.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { sectieVan } = require('./bron-sectie');

const SPAAR = 'NL11BANK0000004323';   // eindigt op 4323: telt via SAV_DEFAULT_ENDS als spaarrekening
const BET = 'NL11BANK0000004840';
const MAANDEN = ['2026-01', '2026-02', '2026-03', '2026-04'];
const REGELS = [{ kw: 'ZKAT HUUR', cat: 'huur' }, { kw: 'ZKAT MUT', cat: 'intern' }];

const ESS = 500;          // huur, vier gelijke maanden, klasse vast
const TOEGEWEZEN = 1000;  // -> teller 1000, dus 2,0 maanden
const SALDO = 2000;
const GESPAARD = 200;     // op het doel; samen 1200 en dus onder het saldo

function seed(opt) {
  const o = opt || {};
  const tx = []; let i = 0;
  for (const m of MAANDEN) {
    tx.push({ id: 'h' + (i++), date: m + '-02', amount: -ESS, acc: BET, src: 'mt940',
      name: 'ZKAT HUUR', desc: 'ZKAT HUUR PURMEREND', typ: '', ref: '', accName: '', refNums: [] });
  }
  // applyOwnAccounts() leidt OWN uit TX af, dus de spaarrekening bestaat pas met een boeking erop.
  // 'intern' via een eigen regel, zodat hij geen enkele categoriesom raakt.
  tx.push({ id: 'm1', date: '2026-04-28', amount: 1, acc: SPAAR, src: 'mt940',
    name: 'ZKAT MUT', desc: 'ZKAT MUT BIJSCHRIJVING', typ: '', ref: '', accName: '', refNums: [] });

  const accmeta = { [BET]: { balance: 300, date: '2026-09-29' } };
  if (!o.geenSaldo) accmeta[SPAAR] = { balance: ('saldo' in o) ? o.saldo : SALDO, date: '2026-09-29' };

  const set = {
    limit: 70, autoIncome: false, income: 3000, rules: REGELS,
    nfToegewezen: ('toegewezen' in o) ? o.toegewezen : TOEGEWEZEN, nfToegewezenMigrated: true,
    nfDoelVast: ('doelVast' in o) ? o.doelVast : 1200,
    nfMaanden: ('richt' in o) ? o.richt : 2,
    goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 10000,
      gespaard: ('gespaard' in o) ? o.gespaard : GESPAARD, streefdatum: '2028-07' }],
    budgets: { huur: 600 },
  };
  if ('norm' in o) set.bufferNorm = o.norm;   // geen norm = geen gekozen grens, en dus geen oordeel
  if ('drempel' in o) set.beleggenDrempel = o.drempel;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([SPAAR, BET]),
    minder_accmeta: JSON.stringify(accmeta), minder_plan: '{}',
  };
}

async function boot(page, opt) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(opt));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof bufferMaanden === 'function');
}
const meet = (page) => page.evaluate(() => {
  const M = noodfondsModel();
  const r = maandRegels().find((x) => x.key === 'buffer') || null;
  return {
    norm: bufferNorm(), drempel: beleggenDrempel(),
    teller: bufferTeller(), bm: bufferMaanden(),
    saldo: spaarSaldo().missing ? null : spaarSaldo().cur,
    ess: Math.round(M.essCrisis), doel: M.doel, doelEigen: M.doelEigen, doelNorm: M.doelNorm,
    doelDoorNorm: M.doelDoorNorm, doelAuto: M.doelAuto,
    rij: r && { status: r.status, kritiek: r.kritiek, maanden: r.maanden, waarde: r.waarde,
      eenheid: r.eenheid, gevolg: r.gevolg },
    tekort: maandTekort(r), nodig: meevallerNodig('buffer', maandRegels()),
    over: toewijzingBovenSaldo(),
  };
});

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('de noemer is 500, en de toewijzing wijkt af van het saldo', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    expect(r.ess, 'huur, vier gelijke maanden, klasse vast').toBe(ESS);
    expect(r.saldo, 'het saldo van de spaarrekening').toBe(SALDO);
    expect(r.teller, 'de toewijzing, en die is NIET het saldo').toBe(TOEGEWEZEN);
    expect(r.teller, 'zonder dit verschil is de nieuwe teller niet van de oude te onderscheiden')
      .not.toBe(r.saldo);
  });

  test('en de spaarrekening beweegt niet, dus de status hangt niet aan het tempo', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => {
      const T = (function(){ try { return bufferTempo(); } catch(_){ return null; } })();
      return { stijgt: T ? !!T.stijgt : null, saved: months().slice(-3).map((m) => savedNet(m)) };
    });
    /* bufferTempo() eist inleg in ELKE maand van zijn venster, dus wat de fixture moet dragen is dat
       minstens een maand op nul staat. De boeking van 1 euro die de spaarrekening laat bestaan telt
       wel als inleg, en die staat er dus bij: zonder dat onderscheid leest de assertie als "er beweegt
       niets" terwijl er iets beweegt. */
    expect(t.saved.filter((x) => x > 0).length, 'alleen de 1 euro die de rekening laat bestaan').toBe(1);
    expect(t.saved.length, 'over drie maanden').toBe(3);
    expect(t.stijgt, 'dus bufferTempo() zegt niet stijgt, en opTempo kan de status niet verschuiven')
      .toBe(false);
  });
});

test.describe('1 - de teller is de toewijzing en niet het saldo', () => {
  test('bufferMaanden() deelt de toewijzing door essCrisis', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    expect(r.bm, '1000 / 500').toBeCloseTo(2, 6);
    expect(r.bm, 'met het saldo als teller zou hier 4,0 staan').not.toBeCloseTo(SALDO / ESS, 6);
    expect(r.rij.waarde, 'de rij toont dezelfde deling').toBe('2');
  });

  test('de klem van planMap() is het plafond van de deling', async ({ page }) => {
    await boot(page, { toegewezen: 9000, saldo: 9000 });
    const r = await meet(page);
    expect(r.doel, 'het doel is wat jij invulde: de norm tilt niets zelf op').toBe(1200);
    expect(r.teller, 'gespaard is Math.min(nfToegewezen, doel)').toBe(1200);
    expect(r.bm, 'dus de buffer kan niet boven doel / essCrisis komen').toBeCloseTo(2.4, 6);
  });

  test('het label noemt de teller die er ligt en niet het rekeningsaldo', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    expect(r.rij.eenheid).toContain('maanden toegewezen aan je noodfonds');
    expect(r.rij.eenheid, 'het oude label beloofde meer dan het getal draagt')
      .not.toContain('op je rekening');
  });

  test('de drie lezers van de teller gaan samen mee', async ({ page }) => {
    await boot(page, { norm: 3 });
    const r = await meet(page);
    expect(r.nodig, 'wat de norm nog vraagt: 3 x 500 - 1000').toBe(500);
    expect(r.nodig, 'met het saldo als teller zou dit nul zijn en zou de verdeelregel zwijgen').not.toBe(0);
    expect(r.tekort, 'wat het doel nog vraagt: 1200 - 1000').toEqual({ bedrag: 200, soort: 'totaal' });
  });

  test('zonder gekozen ondergrens noemt de verdeelregel geen bedrag voor de buffer', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    expect(r.norm, 'niets gekozen').toBe(null);
    expect(r.nodig, 'dan is er geen grens om een bedrag aan op te hangen (v173)').toBe(null);
    expect(r.tekort, 'het DOEL vraagt nog wel iets, en dat hangt niet aan de norm')
      .toEqual({ bedrag: 200, soort: 'totaal' });
  });

  test('zonder bekend spaarsaldo staat de rij niet op Grip, ook al is de teller bekend', async ({ page }) => {
    await boot(page, { geenSaldo: true });
    const r = await meet(page);
    expect(r.teller, 'de toewijzing staat er gewoon').toBe(TOEGEWEZEN);
    expect(r.saldo, 'maar het saldo is onbekend').toBe(null);
    expect(r.bm, 'en dan kan de controle niet lopen, dus er is geen deling').toBe(null);
    expect(r.rij, 'de bufferregel staat niet op Grip').toBe(null);
  });
});

test.describe('2 - de controle is het saldo', () => {
  test('binnen het saldo komt de controle door en kan de buffer ok worden', async ({ page }) => {
    await boot(page, { norm: 2 });
    const r = await meet(page);
    expect(r.over, 'er is 1200 toegewezen op een saldo van 2000').toBe(null);
    expect(r.rij.kritiek, '2,0 maanden op een ondergrens van 2').toBe(false);
    expect(r.rij.status).toBe('ok');
  });

  test('meer toegewezen dan er staat houdt de buffer van ok af, en de rij zegt van welk doel', async ({ page }) => {
    await boot(page, { norm: 2, gespaard: 1500 });
    const r = await meet(page);
    expect(r.over.som, '1000 aan de buffer plus 1500 aan het doel').toBe(2500);
    expect(r.over.saldo).toBe(SALDO);
    expect(r.over.verschil).toBe(500);
    expect(r.rij.kritiek, 'de meting zegt niet dat de buffer te klein is').toBe(false);
    expect(r.rij.status, 'dus let op en geen tekort').toBe('let op');
    expect(r.rij.gevolg).toContain('Op je eigen volgorde komt dat verschil van Kosten Koper.');
    expect(r.rij.gevolg).toContain('Tot je die keuze maakt telt je buffer niet als vol.');
    expect(r.rij.gevolg, 'het noodfonds levert als laatste in en hoeft hier niet mee')
      .not.toContain('je noodfonds');
  });

  test('de volgorde komt uit spaarOverRaakt(), en Plan leest dezelfde lijst', async ({ page }) => {
    await boot(page, { norm: 2, gespaard: 3000 });
    const r = await page.evaluate(() => {
      const raakt = spaarOverRaakt();
      const plan = (function(){ const d = document.createElement('div');
        d.innerHTML = spaarOverLine(allocatePlan()); return d.textContent.replace(/\s+/g, ' ').trim(); })();
      const rij = maandRegels().find((x) => x.key === 'buffer');
      return { raakt, plan, gevolg: rij.gevolg, over: spaarOver() };
    });
    expect(r.over.over, '1000 plus 3000 tegen een saldo van 2000').toBe(2000);
    expect(r.raakt.map((x) => x.naam), 'het doel eerst, want het noodfonds levert als laatste in')
      .toEqual(['Kosten Koper']);
    expect(r.raakt[0].af, 'en het doel kan het hele verschil dragen').toBe(2000);
    expect(r.plan, 'Plan draagt de regel met de handeling').toContain('haal €2.000 weg bij Kosten Koper');
    expect(r.gevolg, 'Grip noemt hetzelfde doel').toContain('Kosten Koper');
  });

  test('de controle leest spaarOver() en telt niet zelf op', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const s = sectieVan(src, 'function toewijzingBovenSaldo(){');
    expect(s, 'de maat komt uit spaarOver()').toContain('spaarOver()');
    expect(s, 'en de namen uit spaarOverRaakt()').toContain('spaarOverRaakt()');
    expect(s, 'geen eigen lus over planMap(): dat zou een tweede som naast spaarOver() zijn (v104)')
      .not.toContain('planMap(');
    expect(s).not.toContain('nfToegewezen');
    const rk = sectieVan(src, 'function spaarOverRaakt(P){');
    expect(rk, 'en die lijst leest diezelfde maat').toContain('spaarOver()');
    expect(rk).toContain('spaarOverItems(P)');
  });
});

test.describe('3 - de norm is de ondergrens, en hij tilt je doel alleen op als jij hem kiest', () => {
  /* v305: DE OPTIL IS EEN HANDELING EN GEEN AFLEIDING. Mijn eerste vorm liet `noodfondsModel()` het
     doel optillen zodra het onder de norm lag, ook zonder dat er een norm gekozen was. GEMETEN kostte
     die tak 42 van de 3054 tests, allemaal op fixtures met een doel onder drie maanden essCrisis, en
     hij botst met MECHANISM_SPEC.defaultEffect: een default die stilletjes een doel zet. */
  test('zonder gekozen ondergrens is er geen grens en geen oordeel', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    expect(r.norm, 'leeg is leeg: er is geen default van 3 meer').toBe(null);
    expect(r.doel, 'en je eigen doel blijft staan waar je het zette').toBe(1200);
    expect(r.rij.status, 'de regel velt geen oordeel').toBe('onbekend');
    expect(r.rij.kritiek, 'en kritiek is niet vast te stellen').toBe(false);
    expect(r.rij.waarde, 'hij toont wel wat hij meet').toBe('2');
    expect(r.rij.gevolg).toContain('Zonder ondergrens valt er niet te zeggen of dat genoeg is');
    expect(r.rij.eenheid).toContain('je ondergrens is nog niet gekozen');
  });

  test('het voorstel rekent voor wat een keuze met je doel doet, en verandert niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const voor = JSON.stringify(SET);
      const drie = normDoelVoorstel(3), twee = normDoelVoorstel(2);
      return { drie, twee, set: JSON.stringify(SET) === voor, doel: noodfondsModel().doel };
    });
    expect(r.drie, '3 x 500 ligt boven je doel van 1200')
      .toMatchObject({ maanden: 3, nu: 1200, naar: 1500, ess: 500, tilt: true });
    expect(r.twee, '2 x 500 ligt eronder, dus er verandert niets aan je doel')
      .toMatchObject({ maanden: 2, nu: 1200, naar: 1000, tilt: false });
    expect(r.set, 'voorrekenen schrijft niets').toBe(true);
    expect(r.doel, 'en het doel is onaangeraakt').toBe(1200);
  });

  /* v315: de keuze loopt via de chips en niet meer via een leeg veld, dus deze test tikt op de
     knop. Dat is het PAD dat de gebruiker loopt en dus strenger dan een `value`-zetter (meetles c).
     De formulering van het gevolg is ook veranderd: het staat nu als rij in het gevolgen-blok. Wat
     de test vasthoudt is wat hij altijd vasthield: BEIDE bedragen staan er voordat je vastzet, en
     pas de tik legt iets vast. */
  test('de sheet zegt het gevolg voordat je vastzet, en pas de tik voert het uit', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openNoodfondsPanel());
    await page.locator('#bufferNormChips .chip', { hasText: '3 maanden' }).click();
    const keuze = await page.evaluate(() => ({ txt: document.getElementById('sheet').innerText,
      norm: bufferNorm(), vlg: bufferNormNext(),
      doel: noodfondsModel().doel, sleutel: 'bufferNorm' in SET }));
    expect(keuze.txt, 'het gevolg staat er met beide bedragen').toContain('€1.200');
    expect(keuze.txt).toContain('€1.500');
    expect(keuze.txt).toContain('Noodfonds');
    expect(keuze.norm, 'maar er is nog niets vastgelegd').toBe(null);
    expect(keuze.vlg).toBe(null);
    expect(keuze.doel).toBe(1200);
    expect(keuze.sleutel).toBe(false);
    const na = await page.evaluate(() => { normVastzetten(); return { norm: bufferNorm(),
      vlg: bufferNormNext(), doel: noodfondsModel().doel, vast: SET.nfDoelVast,
      terug: SET.bufferNormDoelVoor, txt: document.getElementById('sheet').innerText }; });
    /* v315: een EERSTE keuze geldt ook meteen, want zonder norm vraagt de bufferregel erom; een
       WIJZIGING geldt vanaf volgende maand. Zie grip-vanaf-norm.spec.js blok 7. */
    expect(na.norm, 'de tik legt de grens vast, en bij een eerste keuze meteen').toBe(3);
    expect(na.vlg).toBe(3);
    expect(na.doel, 'en tilt het doel op').toBe(1500);
    expect(na.vast).toBe(1500);
    expect(na.terug, 'met de oude waarden erbij, anders is de knop niet terug te draaien')
      .toEqual({ tilt: true, doel: 1200, norm: null, next: null });
    expect(na.txt).toContain('terugdraaien');
  });

  test('terugdraaien zet de grens en het doel allebei terug', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { openNoodfondsPanel(); normKeuzeZet('3'); normVastzetten(); });
    const r = await page.evaluate(() => { normTerugdraaien(); return { norm: bufferNorm(),
      doel: noodfondsModel().doel, vast: SET.nfDoelVast, terug: 'bufferNormDoelVoor' in SET,
      sleutel: 'bufferNorm' in SET }; });
    expect(r.doel, 'je eigen doel staat terug').toBe(1200);
    expect(r.vast).toBe(1200);
    expect(r.norm, 'en de grens is weg, want zonder hem is er geen optil om te tonen').toBe(null);
    expect(r.sleutel).toBe(false);
    expect(r.terug, 'en er blijft geen lege sleutel achter').toBe(false);
  });

  /* v315: de zin staat nu als rij in het gevolgen-blok, en de vlag wordt ALTIJD geschreven omdat
     er sinds de maanddimensie ook zonder optil iets terug te draaien valt (de grens zelf). Wat de
     test vasthoudt is dat er aan je DOEL niets verandert, en dat `tilt` dat zegt. */
  test('ligt je doel al boven de gekozen grens, dan verandert er niets aan je doel', async ({ page }) => {
    await boot(page, { doelVast: 5000 });
    await page.evaluate(() => { openNoodfondsPanel(); normKeuzeZet('3'); });
    const voor = await page.evaluate(() => document.getElementById('sheet').innerText);
    expect(voor).toContain('blijft €5.000');
    expect(voor).toContain('ligt al op of boven');
    const na = await page.evaluate(() => { normVastzetten(); return { norm: bufferNorm(),
      doel: noodfondsModel().doel, terug: SET.bufferNormDoelVoor }; });
    expect(na.norm).toBe(3);
    expect(na.doel).toBe(5000);
    expect(na.terug.tilt, 'er is niets opgetild').toBe(false);
    expect(na.terug.doel, 'en de vlag draagt het doel van toen, zodat terugdraaien het laat staan').toBe(5000);
  });

  test('de schatting wordt nooit meegetild, want die is de schatting', async ({ page }) => {
    await boot(page, { norm: 3 });
    const r = await meet(page);
    expect(r.doelAuto, 'essCrisis x je richt van 2').toBe(1000);
    expect(r.doel, 'en je eigen bedrag blijft het doel').toBe(1200);
  });

  test('met een gekozen grens velt de regel wel een oordeel', async ({ page }) => {
    await boot(page, { norm: 3 });
    const A = await meet(page);
    expect(A.rij.kritiek, '2,0 maanden onder 3').toBe(true);
    expect(A.rij.status).toBe('tekort');
    expect(A.rij.gevolg).toContain('Onder 3 maanden vangt hij weinig op');
    await boot(page, { norm: 2 });
    const B = await meet(page);
    expect(B.rij.kritiek).toBe(false);
    expect(B.rij.status, 'met je eigen ondergrens is dezelfde stand in orde').toBe('ok');
  });

  test('een leeg, nul of onleesbaar veld is geen keuze en laat geen sleutel achter', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openNoodfondsPanel());
    const r = await page.evaluate(() => {
      const uit = [];
      for (const v of ['', '0', '-2', 'abc']) { normKeuzeZet(v); uit.push({ v, norm: bufferNorm(), sleutel: 'bufferNorm' in SET }); }
      normKeuzeZet('99'); normVastzetten(); const klem = { norm: bufferNorm(), opslag: SET.bufferNorm };
      bufferNormWis();
      return { uit, klem, na: bufferNorm(), sleutelNa: 'bufferNorm' in SET };
    });
    for (const u of r.uit) {
      expect(u.norm, 'geen keuze bij ' + JSON.stringify(u.v)).toBe(null);
      expect(u.sleutel, 'en geen lege sleutel in SET (v59/v73/v173)').toBe(false);
    }
    expect(r.klem.norm, 'boven de 24 wordt geklemd, zoals het eigen aantal maanden erboven').toBe(24);
    expect(r.na, 'weghalen in een tik (MECHANISM_SPEC.defaultEffect)').toBe(null);
    expect(r.sleutelNa).toBe(false);
  });
});

test.describe('4 - de drempel voor beleggen is een eigen keuze', () => {
  test('leeg volgt hij de ondergrens', async ({ page }) => {
    await boot(page, { norm: 2 });
    const r = await meet(page);
    expect(r.drempel, 'leeg = je ondergrens').toBe(2);
    const b = await page.evaluate(() => beleggenKlaar(maandRegels()).voorwaarden.find((v) => v.key === 'buffer'));
    expect(b.drempel).toBe('2 maanden');
    expect(b.gehaald, '2,0 tegen 2').toBe(true);
  });

  test('een eigen drempel boven de norm blokkeert beleggen terwijl de buffer in orde is', async ({ page }) => {
    await boot(page, { norm: 2, drempel: 6 });
    const r = await meet(page);
    expect(r.norm).toBe(2);
    expect(r.drempel).toBe(6);
    expect(r.rij.status, 'de bufferregel blijft in orde').toBe('ok');
    const b = await page.evaluate(() => {
      const B = beleggenKlaar(maandRegels());
      return { v: B.voorwaarden.find((x) => x.key === 'buffer'), klaar: B.klaar, blok: B.blokkade && B.blokkade.key };
    });
    expect(b.v.gehaald, '2,0 tegen 6').toBe(false);
    expect(b.v.drempel).toBe('6 maanden');
    expect(b.klaar).toBe(false);
    expect(b.blok).toBe('buffer');
  });

  test('zonder gekozen ondergrens is er ook geen drempel, en dus geen uitspraak', async ({ page }) => {
    await boot(page);
    const r = await meet(page);
    expect(r.norm).toBe(null);
    expect(r.drempel, 'geen norm, geen terugval').toBe(null);
    const b = await page.evaluate(() => {
      const B = beleggenKlaar(maandRegels());
      return { v: B.voorwaarden.find((x) => x.key === 'buffer'), volledig: B.volledig, klaar: B.klaar };
    });
    expect(b.v.ontbreekt, 'de bufferrij staat op onbekend, dus er is niets te beoordelen').toBe(true);
    expect(b.v.drempel).toBe('nog geen grens gekozen');
    expect(b.volledig, 'en dan doet de laag geen uitspraak (v154)').toBe(false);
    expect(b.klaar).toBe(false);
  });

  test('de sheet draagt het veld, met zijn terugval erbij', async ({ page }) => {
    await boot(page, { norm: 2 });
    const leeg = await page.evaluate(() => { openBeleggenVoorwaarden(); return document.getElementById('sheet').innerText; });
    expect(leeg).toContain('Buffer die je hiervoor wilt hebben');
    expect(leeg, 'een leeg veld met alleen een placeholder zou beloven dat er niets geldt')
      .toContain('Leeg = je ondergrens, nu 2 maanden.');
    const eigen = await page.evaluate(() => { setBeleggenDrempel('6'); return document.getElementById('sheet').innerText; });
    expect(eigen).toContain('De bufferrij hierboven toetst tegen 6 maanden.');
    const terug = await page.evaluate(() => { resetBeleggenDrempel(); return { txt: document.getElementById('sheet').innerText, sleutel: 'beleggenDrempel' in SET }; });
    expect(terug.txt).toContain('Leeg = je ondergrens, nu 2 maanden.');
    expect(terug.sleutel, 'geen lege sleutel').toBe(false);
  });
});

test.describe('5 - de bron: een grens per vraag, en niet meer een vaste drie', () => {
  const src = () => fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

  test('er is geen vaste drie meer, ook niet als default', async () => {
    const s = src();
    expect(s, 'de vaste grens is vervangen door een keuze en komt niet terug').not.toContain('bufferKritiek');
    expect(s, 'en er is ook geen default-constante voor in de plaats gekomen').not.toContain('BUFFER_NORM_DEFAULT');
    const d = sectieVan(s, 'function bufferNorm(){');
    expect(d, 'leeg of nul geeft null en niet een getal').toContain('null');
    expect(d).not.toMatch(/\?\s*n\s*:\s*[0-9]/);
  });

  test('elke lezer van de norm leest de functie en niet SET.bufferNorm', async () => {
    const s = src();
    const lezers = ['function bufferMaanden(){', 'function meevallerNodig(', 'function maandTekort('];
    for (const fn of lezers) {
      const d = sectieVan(s, fn);
      expect(d, fn + ' leest geen eigen veld').not.toContain('SET.bufferNorm');
    }
    /* v305: NIET OP EEN AANTAL BINDEN maar op de PLEKKEN, want een teller is precies het anker dat
       dit project elders verbiedt: hij verschuift zodra er een regel bij komt zonder dat de
       eigenschap verandert. Wat vast moet liggen is dat geen enkele LEZER het veld rechtstreeks
       leest; schrijven doen alleen de getter, de drie handelingen rond de keuze en het diagnoseblok. */
    /* v315: `rolloverBudgets()` is de VIERDE schrijver van de lopende norm: hij draagt de norm van
       volgende maand over zodra de maand omslaat. Hij staat in de lijst omdat hij een SCHRIJVER is
       en geen lezer die een oordeel velt - dat is de eigenschap die deze test bewaakt - en zijn
       eigen regel staat hieronder apart vast. */
    const toegestaan = ['function bufferNorm(){', 'function normVastzetten(){',
      'function normTerugdraaien(){', 'function bufferNormWis(){', 'function diagGrendel(){',
      'function rolloverBudgets(){'];
    const gedekt = toegestaan.map((fn) => sectieVan(s, fn)).join('\n');
    const alle = (s.match(/SET\.bufferNorm(?!DoelVoor|Next)/g) || []).length;
    const binnen = (gedekt.match(/SET\.bufferNorm(?!DoelVoor|Next)/g) || []).length;
    expect(binnen, 'elke treffer ligt binnen de getter, de drie handelingen of het diagnoseblok')
      .toBe(alle);
    expect(alle, 'en er is er minstens een, anders toetst deze test niets').toBeGreaterThan(0);
    /* v315: HET VELD VAN VOLGENDE MAAND KRIJGT ZIJN EIGEN LIJST, en die is niet dezelfde: de
       overdracht bij de maandwissel is een vierde schrijver en die mag `SET.bufferNorm` juist WEL
       zetten. Twee aparte tellingen in plaats van de oude regex verruimen, want dan zou een lezer
       van het volgende-maand-veld buiten elke lijst kunnen vallen zonder dat deze test het ziet. */
    const toegestaanNext = ['function bufferNormNext(){', 'function normVastzetten(){',
      'function normTerugdraaien(){', 'function bufferNormWis(){', 'function rolloverBudgets(){'];
    const gedektNext = toegestaanNext.map((fn) => sectieVan(s, fn)).join('\n');
    const alleNext = (s.match(/SET\.bufferNormNext/g) || []).length;
    const binnenNext = (gedektNext.match(/SET\.bufferNormNext/g) || []).length;
    expect(binnenNext, 'elke treffer van het volgende-maand-veld ligt binnen zijn eigen vijf plekken')
      .toBe(alleNext);
    expect(alleNext).toBeGreaterThan(0);
    /* en de overdracht is de ENIGE plek buiten de keuze-handelingen die de lopende norm zet */
    expect(sectieVan(s, 'function rolloverBudgets(){'), 'de maandwissel draagt hem over')
      .toContain('SET.bufferNorm=nn');
  });

  test('de teller staat op een plek en de drie lezers noemen hem', async () => {
    const s = src();
    for (const fn of ['function bufferMaanden(){', 'function meevallerNodig(', 'function maandTekort(']) {
      expect(sectieVan(s, fn), fn + ' leest bufferTeller()').toContain('bufferTeller()');
    }
    const d = sectieVan(s, 'function bufferTeller(){');
    expect(d, 'en die leest de toewijzing van Plan').toContain('planMap()[PLAN_NF]');
    expect(d, 'en niet het saldo').not.toContain('spaarSaldo(');
  });

  /* v305: DE VIERDE LEZER GAAT UITDRUKKELIJK NIET MEE. fireInputs() rolt je vermogen vooruit en wil
     het geld dat er STAAT, niet het label dat je eraan hing: een voornemen verdringt geen feit (v216).
     Hij leest dat saldo via noodfondsModel().spaar, en die leest spaarSaldo(). Zijn nfDoel beweegt wel
     mee, want dat is hetzelfde doel. */
  test('fireInputs() blijft uitdrukkelijk de gemeten stand lezen (v216)', async ({ page }) => {
    const d = sectieVan(src(), 'function fireInputs(){');
    expect(d, 'de stand komt uit noodfondsModel().spaar').toContain('nf.spaar');
    expect(d, 'dus hij leest de toewijzing niet').not.toContain('bufferTeller(');
    await boot(page);
    const f = await page.evaluate(() => { const F = fireInputs(); return { cur: F.nfCur, doel: F.nfDoel }; });
    expect(f.cur, 'het saldo van de spaarrekening en niet de toewijzing van 1000').toBe(2000);
    expect(f.doel, 'en het doel is het doel dat er staat').toBe(1200);
  });

  test('noodfondsModel() tilt nooit zelf op: de optil staat bij de handeling', async () => {
    const s = src();
    const m = sectieVan(s, 'function noodfondsModel(){');
    expect(m, 'het model leest de norm niet').not.toContain('bufferNorm()');
    expect(m, 'en kent de optil niet').not.toContain('normDoelVoorstel');
    const v = sectieVan(s, 'function normVastzetten(){');
    expect(v, 'de handeling leest het voorstel').toContain('normDoelVoorstel(');
    expect(v, 'en zet het doel').toContain('SET.nfDoelVast');
    expect(v, 'met de oude waarde erbij, zodat terugdraaien bestaat').toContain('bufferNormDoelVoor');
  });
});
