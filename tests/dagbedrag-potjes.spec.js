// v257: de stand per dag onder "Nog uit je potjes". v263 maakte er een rollend venster van zeven
// dagen van; v309 heeft de post naar het HOOFDGETAL van de stand-kaart verhuisd en de eenheid weer
// op DAG gezet, voor Inzichten en Home tegelijk, en daarmee is het weekvenster vervallen (de
// constante POTJE_VENSTER_DAGEN en potjes-weekvenster.spec.js zijn weg).
// DEZE SPEC BEWAAKT ONVERANDERD dezelfde eigenschappen: welke bron het getal deelt, welke noemer,
// de randgevallen en de plek op het scherm. Alleen de ankers zijn meeverhuisd naar de kop.
// WAT NIET MEEVERHUISDE is de sub van de post ("van EUR 1.832 . EUR 1.312 gebruikt . 28%"). De
// kaart draagt een eigen regel boven de balk met totals().spendNorm tegen totals().budget, en dat
// is een ANDERE noemer (zie hieronder); twee subs met dezelfde vorm en een andere bron onder een
// getal is de tweede waarheid die deze verhuizing juist weghaalt. Wat je in je potjes hebt gebruikt
// is via de tik op die regel en via "Gereserveerd in je potjes" op Home te bereiken.
//
// GEMELD: op Inzichten staat alleen een maandstand, terwijl de vraag in de winkel is wat er nog
// per dag kan. De opdracht rekende dat met de hand uit de hero: maandbudget 3.421 min 2.512
// uitgegeven is 909, daarvan 389 nog vast, dus 520 variabel.
//
// DIE HANDBEREKENING IS EEN TWEEDE WAARHEID. De drie termen komen niet uit dezelfde meting:
// totals().budget telt ALLE potjes, totals().spendNorm telt ook uitgaven in categorieën ZONDER
// potje, en monthLiquidity().fixDue komt uit recurringSchedule() en dus niet uit een categorie.
// Gemeten op één fixture (zie hieronder): in het gemelde geval komen de aftrekking en
// varPotjeStand().rest allebei op 520 uit, maar met 200 uitgegeven buiten een potje zegt de
// aftrekking 320 tegen 520, en met een incasso van 420 bij een potje van 389 zegt hij 489 tegen
// 520. Op het toestel zelf liepen ze al uiteen: uit de getoonde regel "Bij je tempo nog €1.045
// nodig · €463 tekort" volgt dat daar 582 stond en niet 520.
// De dagregel deelt daarom HET GETAL DAT ER AL STAAT, varPotjeStand().rest, en rekent niets na.
// Dat de aftrekking uit de hero daarvan afwijkt hoort bij het open punt van budgetOverZin().
//
// DE NOEMER KOMT UIT maandDagenOver(), dezelfde bron als vrijPerDag() op Home. Die conventie
// sluit VANDAAG UIT (dim min elapsed), dus op dag 23 van 30 zijn dat 7 dagen en is het dagbedrag
// 74 en niet 65. Met vandaag erbij zou Inzichten "8 dagen" zeggen waar Home op dezelfde dag "7
// dagen" zegt, en dat is een tweede waarheid op de noemer. Het open punt staat in CLAUDE.md.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum, DAGEN_OVER } = require('./vaste-dag');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const DIM = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

/* DE GEMELDE TOESTAND, met de getallen van het toestel: maandbudget 3.421, uitgegeven 2.512,
   onvoorzien 497 daarbuiten, vaste lasten nog te gaan 389. De potjes tellen op tot 3.421; huur en
   abonnement zijn de terugkerende posten, dus varBudget is 3.421 min 1.589 = 1.832. Het abonnement
   komt deze maand niet langs en staat daarom in fixDue. */
const POTJES = { huur: 1200, abonnement: 389, boodschappen: 900, vervoer: 500, shopping: 432 };
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1]) {
    add('i' + m, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('ab' + m, m, '08', -389, 'Ziggo', 'SEPA INCASSO ZIGGO ABONNEMENT');
    add('b' + m, m, '12', -700, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  add('iC', CUR, '05', 6000, 'Werkgever', 'SALARIS LOON');
  add('hC', CUR, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  add('b1', CUR, '06', -812, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  add('v1', CUR, '11', -300, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION');
  add('s1', CUR, '15', -200, 'Zalando', 'BEA, BETAALPAS ZALANDO');
  add('o1', CUR, '18', -497, 'Garage', 'BEA, BETAALPAS GARAGE REPARATIE');
  if (o.extraTx) o.extraTx(add);
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000, [SPAAR]: 9000 },
    budgets: o.budgets || POTJES,
    savingMode: 'amount', savingAmount: 500, savingsAcc: { [SPAAR]: true },
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}' };
}
/* De boot hernummert de transactie-ids, dus een override uit de seed landt niet op de goede id.
   Hem na de boot zetten is dezelfde handeling als in de app zelf. */
async function boot(page, o) {
  o = o || {};
  /* v299: standaard staat de klok op een vaste dag met zeven dagen over, want elke regel hieronder
     draagt dat restant. Een test die een ANDERE dag nodig heeft geeft `klok` mee, en die wint. */
  if (o.klok) await page.clock.setFixedTime(o.klok); else await pinDag(page);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandDagenOver === 'function');
  await page.evaluate(() => {
    const t = TX.find((x) => /Garage/.test(x.name));
    if (t) { OVR[t.id] = 'onvoorzien'; save(); }
  });
  if (o.na) await page.evaluate(o.na);
  await page.evaluate(() => { render(); go('ins'); });
}
/* v309: de stand staat als hoofdgetal op de stand-kaart. `post` blijft, om te toetsen dat hij in
   de lijst NIET meer staat; `kop` is het grote getal, `label` het label en `achter` het
   achtervoegsel (het dagbedrag, of de tempo-krapte als die er is). */
const potjesPost = (page) => page.evaluate(() => {
  const p = nogDezeMaandPosten().find((x) => /Nog uit je potjes|Te veel uitgegeven/.test(x.lab)) || null;
  const m = kijkMaand();
  const kaart = document.getElementById('insStand');
  const rij = kaart ? [...kaart.querySelectorAll('div.row')]
    .find((e) => /nog in je potjes|te veel uitgegeven/.test(e.textContent)) : null;
  const sp = rij ? [...rij.querySelectorAll('span')] : [];
  const vol = sp.length > 1 ? sp[1].innerText.replace(/\s+/g, ' ').trim() : null;
  const VP = varPotjeStand(m);
  return { post: p, dagen: maandDagenOver(m), VP,
    vrijPerDagDagen: vrijPerDag().dagenResterend,
    kop: sp.length ? sp[0].innerText.trim() : null,
    label: vol ? vol.split(' \u00b7 ')[0] : null,
    achter: vol && vol.includes(' \u00b7 ') ? vol.slice(vol.indexOf(' \u00b7 ') + 3) : '',
    gat: VP.rest - (VP.budget - VP.gebruikt),
    kaartTekst: kaart ? kaart.innerText.split(String.fromCharCode(10)).join(' | ') : '' };
});

test.describe('a · de gemelde toestand', () => {
  test('het restant is €520 en de dagregel deelt dat door de resterende dagen', async ({ page }) => {
    await boot(page);
    const r = await potjesPost(page);
    // eerst vaststellen dat dit werkelijk de gemelde toestand is
    const t = await page.evaluate(() => { const m = kijkMaand(); const x = totals(m);
      return { budget: Math.round(x.budget), spendNorm: Math.round(x.spendNorm),
        buitenNorm: Math.round(x.buitenNorm), fixDue: monthLiquidity().fixDue }; });
    expect(t).toEqual({ budget: 3421, spendNorm: 2512, buitenNorm: 497, fixDue: 389 });
    expect(r.VP.budget).toBe(1832);
    expect(r.VP.gebruikt).toBe(1312);
    expect(r.kop).toBe('€520');
    expect(r.label).toBe('nog in je potjes');
    expect(r.post).toBeNull();                 // v309: en niet meer in de lijst eronder
    /* v263 verschoof het anker van een dagbedrag naar een venster; v309 schuift het terug naar een
       dagbedrag, nu in het achtervoegsel van de kop. De eigenschap is over alle drie de vormen
       dezelfde: dit restant wordt over de resterende dagen verdeeld, met maandDagenOver() als
       noemer. Zonder tempo-krapte draagt het achtervoegsel dat dagbedrag. */
    expect(r.gat).toBeLessThanOrEqual(0);
    expect(r.achter).toBe(`€${Math.round(520 / r.dagen).toLocaleString('nl-NL')} per dag`);
  });

  /* Op de meetdag van deze ronde (dag 23 van een maand van 30) zijn dat 7 dagen. Het getal zelf
     hangt aan de kalender, dus de test hierboven leest de dagen live; deze legt de meting vast voor
     precies die dag, met de klok erop gezet.
     DRIE ANKERS OVER DRIE RONDES, EEN EIGENSCHAP: v257 "7 dagen en €74 per dag", v263 "De resterende
     7 dagen heb je €520" (hetzelfde tempo in de eenheid van een week), v309 weer "€74 per dag" maar
     nu in de kop. 520 gedeeld door 7 is 74, en dat is de hele rekensom. */
  test('gemeten op dag 23 van 30: 7 dagen en €74 per dag', async ({ page }) => {
    await boot(page, { klok: new Date(now.getFullYear(), now.getMonth(), 23, 12, 0, 0) });
    const r = await potjesPost(page);
    expect(r.dagen).toBe(Math.max(DIM - 23, 1));
    if (DIM === 30) {
      expect(r.dagen).toBe(7);
      expect(r.kop).toBe('€520');
      expect(r.achter).toBe('€74 per dag');
    }
  });

  test('het getal, zijn label en zijn achtervoegsel staan in die volgorde op een regel', async ({ page }) => {
    await boot(page);
    const r = await potjesPost(page);
    /* v309: tot v308 waren dit drie regels onder elkaar (de stand, zijn sub, en die stand per dag).
       Het zijn er nu twee delen op EEN regel, en de sub is niet meegegaan: zie de kop van dit
       bestand. De volgorde blijft de eigenschap. */
    expect(r.kaartTekst.indexOf(r.kop)).toBeLessThan(r.kaartTekst.indexOf(r.label));
    expect(r.kaartTekst.indexOf(r.label)).toBeLessThan(r.kaartTekst.indexOf(r.achter));
    // en de potjes-noemer staat hier niet meer; de regel eronder noemt een andere noemer
    expect(r.kaartTekst).not.toMatch(/van €1\.832/);
    expect(r.kaartTekst).toMatch(/van €3\.421 maandbudget/);
  });
});

test.describe('b · de noemer is die van de app', () => {
  test('dezelfde bron als vrijPerDag() op Home, dus geen twee aantallen dagen op één dag', async ({ page }) => {
    await boot(page);
    const r = await potjesPost(page);
    expect(r.dagen).toBe(r.vrijPerDagDagen);
  });

  /* De klem op 1 houdt de deling heel. Zonder hem zou de laatste dag delen door nul en een
     oneindig dagbedrag geven; met hem staat er "nog 1 dag" en het hele restant. */
  test('op de laatste dag van de maand: nog 1 dag, en geen deling door nul', async ({ page }) => {
    await boot(page, { klok: new Date(now.getFullYear(), now.getMonth(), DIM, 12, 0, 0) });
    const r = await potjesPost(page);
    expect(r.dagen).toBe(1);
    // v263/v309: het anker schoof twee keer mee; de klem op 1 en het hele restant zijn dezelfde
    // eigenschap als in v257
    expect(r.gat).toBeLessThanOrEqual(0);
    expect(r.achter).toMatch(/^€[\d.]+ per dag$/);
    const bedrag = Number((r.achter.match(/^€([\d.]+) per dag$/)[1]).replace(/\./g, ''));
    expect(Number.isFinite(bedrag)).toBe(true);
    expect(bedrag).toBe(Math.abs(r.VP.budget - r.VP.gebruikt));   // één dag, dus het hele restant
  });
});

test.describe('c · wanneer de regel er niet staat', () => {
  /* De opdracht vroeg om een constatering bij een negatief bedrag. Die zit al in het label:
     inPotjes onder nul heet "Te veel uitgegeven". Een dagbedrag hoort daar niet bij, want een
     negatief dagbedrag zegt niets (dezelfde grond als v158). */
  test('potjes overschreden: Te veel uitgegeven, en geen dagregel', async ({ page }) => {
    await boot(page, { extraTx: (add) => add('x1', CUR, '17', -900, 'Zalando', 'BEA, BETAALPAS ZALANDO') });
    const r = await potjesPost(page);
    expect(r.VP.gebruikt).toBeGreaterThan(r.VP.budget);
    expect(r.label).toBe('te veel uitgegeven');
    expect(r.achter).toBe('');
    expect(r.kaartTekst).not.toMatch(/per dag/);
  });

  /* Precies op nul: het grote getal zegt het al, dus "€0 per dag" zou datzelfde herhalen. */
  test('restant precies nul: het label blijft staan, de dagregel niet', async ({ page }) => {
    await boot(page, { extraTx: (add) => add('x2', CUR, '17', -520, 'Zalando', 'BEA, BETAALPAS ZALANDO') });
    const r = await potjesPost(page);
    expect(r.VP.budget - r.VP.gebruikt).toBe(0);
    expect(r.label).toBe('nog in je potjes');
    expect(r.kop).toBe('€0');
    expect(r.achter).toBe('');
    expect(r.kaartTekst).not.toMatch(/per dag/);
  });
});

test.describe('d · de dagregel leest de potjes en niets anders', () => {
  /* De opdracht vroeg een test op "geen vaste lasten meer te gaan: het hele restant is variabel".
     In de gebouwde vorm is dat geen aftrekking meer, dus de scherpere toets is dat de dagregel
     NIET verandert als fixDue wegvalt: dat bewijst dat hij varPotjeStand() leest en niet de
     handberekening uit de hero. */
  test('fixDue op nul verandert het restant en de dagregel niet', async ({ page }) => {
    const a = await (async () => { await boot(page); return potjesPost(page); })();
    expect(a.achter).toBeTruthy();
    // het abonnement komt deze maand alsnog langs, dus fixDue valt weg
    await boot(page, { extraTx: (add) => add('ab' + CUR, CUR, '08', -389, 'Ziggo', 'SEPA INCASSO ZIGGO ABONNEMENT') });
    const b = await potjesPost(page);
    expect(await page.evaluate(() => monthLiquidity().fixDue)).toBe(0);
    expect(b.kop).toBe(a.kop);
    expect(b.achter).toBe(a.achter);
  });

  /* En een uitgave buiten elk potje raakt hem ook niet, terwijl de handberekening uit de hero er
     wel mee zou zakken. Dat verschil is het open punt van budgetOverZin(), niet van deze regel. */
  test('een uitgave zonder potje raakt de dagregel niet, de handberekening wel', async ({ page }) => {
    await boot(page, { extraTx: (add) => add('x3', CUR, '19', -200, 'Kapper', 'BEA, BETAALPAS KAPPER') });
    const r = await potjesPost(page);
    const hand = await page.evaluate(() => { const m = kijkMaand(); const t = totals(m);
      return Math.round(t.budget) - Math.round(t.spendNorm) - monthLiquidity().fixDue; });
    expect(r.VP.budget - r.VP.gebruikt).toBe(520);
    expect(r.kop).toBe('€520');
    expect(hand).toBe(320);                       // de aftrekking zakt mee, het restant niet
  });
});

/* v257 NOEMDE HET ALS OPEN PUNT: het dagbedrag stond onder de vouw op 360x640 (het begon op 592px
   bij 567px zichtbaar), en dat haalde de reden weg waarom het gevraagd werd, want dit is het enige
   getal op Inzichten dat je BUITEN DE DEUR gebruikt. De richting die daar stond was: de plek waar
   dit getal hoort is de hero, bij de balk die al zegt hoeveel van je maandbudget op is, met als
   HARDE VOORWAARDE dat het daar HETZELFDE getal blijft lezen en niet de hero-meting.
   v309 HEEFT DAT GEDAAN, en aan die voorwaarde is voldaan: de kop deelt `varBudget()` min
   `varPotjeStand().gebruikt`, precies het getal dat de oude regel deelde, en de hero-meting
   (`totals().budget` min `totals().spendNorm`) staat als EIGEN regel eronder met zijn eigen noemer.
   DE EIGENSCHAP KEERT DAARMEE OM: het dagbedrag stond ONDER het laatste signaal en staat er nu
   BOVEN, want de stand-kaart staat boven "Wat opvalt". Wat blijft is dat de signalen binnen het
   eerste scherm vallen (de eis van v241, bewaakt door inzichten-indeling.spec.js met 567px op
   360x640 en 771px op 390x844); wat erbij komt is dat het dagbedrag dat nu ook doet. */
test.describe('e · het dagbedrag staat boven de vouw, en boven de signalen', () => {
  // shopping gaat 268 over zijn potje, dus er is een valt-op-signaal; er blijft 20 in de potjes
  const MET_SIGNAAL = { extraTx: (add) => add('x4', CUR, '16', -500, 'Zalando', 'BEA, BETAALPAS ZALANDO') };

  for (const [w, h] of [[360, 640], [390, 844]]) {
    test(`op ${w}x${h} staat het achtervoegsel boven het laatste signaal en binnen het eerste scherm`,
      async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await boot(page, MET_SIGNAAL);
      const r = await page.evaluate(() => {
        const el = document.querySelector('#s-ins');
        const sig = [...el.querySelectorAll('.valtop-rij,.valtop-patroon')];
        const kaart = document.getElementById('insStand');
        const rij = kaart ? [...kaart.querySelectorAll('div.row')]
          .find((e) => /nog in je potjes|te veel uitgegeven/.test(e.textContent)) : null;
        const nav = document.querySelector('.nav') || document.querySelector('nav');
        return { signalen: sig.length, kop: !!rij,
          sigBodem: sig.length ? Math.round(sig[sig.length - 1].getBoundingClientRect().bottom + window.scrollY) : null,
          kopBodem: rij ? Math.round(rij.getBoundingClientRect().bottom + window.scrollY) : null,
          tekst: rij ? rij.innerText.split(String.fromCharCode(10)).join(' ') : '',
          zichtbaar: window.innerHeight - (nav ? Math.round(nav.getBoundingClientRect().height) : 0) };
      });
      // de invoer: zonder signaal en zonder kop meet deze test niets
      expect(r.signalen, 'geen signaal in deze fixture').toBeGreaterThan(0);
      expect(r.kop, 'geen potjes-kop in deze fixture').toBe(true);
      expect(r.tekst).toMatch(/per dag|bij je tempo/);
      console.log(`### @${w}x${h}: kop tot ${r.kopBodem}px, laatste signaal tot ${r.sigBodem}px, zichtbaar ${r.zichtbaar}px`);
      expect(r.kopBodem).toBeLessThan(r.sigBodem);
      expect(r.kopBodem).toBeLessThanOrEqual(r.zichtbaar);
      expect(r.sigBodem).toBeLessThanOrEqual(r.zichtbaar);
    });
  }

  test('en het achtervoegsel staat er ook bij een overschreden potje, zolang er nog iets in zit', async ({ page }) => {
    await boot(page, MET_SIGNAAL);
    const r = await potjesPost(page);
    expect(r.VP.over).toBe(false);          // in totaal nog binnen, één potje eroverheen
    expect(r.kop).toBe('\u20ac20');
    /* v263 verschoof het anker naar de venstervorm, v309 naar het achtervoegsel. Dat er iets staat
       zolang er iets in je potjes zit is de eigenschap; WELKE van de twee vormen het is volgt uit
       het gat, en dat leest deze test uit de app zelf in plaats van het aan te nemen. */
    expect(r.achter).toBe(r.gat > 0
      ? `bij je tempo \u20ac${r.gat.toLocaleString('nl-NL')} tekort`
      : `\u20ac${Math.round((r.VP.budget - r.VP.gebruikt) / r.dagen).toLocaleString('nl-NL')} per dag`);
    console.log(`### overschreden potje: kop ${r.kop}, gat ${r.gat}, achtervoegsel "${r.achter}"`);
  });
});

test.describe('f · de bron: één afleiding van de resterende dagen', () => {
  const BRON = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  function strip(t) {
    t = t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
    return t.split('\n').map((ln) => {
      const m = /(^|[\s;})])\/\/(?!\/)/.exec(ln);
      if (!m) return ln;
      const voor = ln.slice(0, m.index + m[1].length);
      if (/http/.test(ln.slice(Math.max(0, m.index - 8), m.index))) return ln;
      const even = (x, c) => (x.split(c).length - 1) % 2 === 0;
      if (!even(voor, "'") || !even(voor, '"') || !even(voor, '`')) return ln;
      return voor;
    }).join('\n');
  }
  const CODE = strip(BRON);

  test('maandDagenOver() bestaat en klemt op 1', () => {
    const m = /function maandDagenOver\(ym\)\{([\s\S]*?)\n\}/.exec(CODE);
    expect(m, 'maandDagenOver() niet gevonden').toBeTruthy();
    expect(m[1]).toMatch(/Math\.max\([^)]*dim[^)]*elapsed[^)]*,\s*1\)/);
  });

  /* Het slot: niemand leidt die klem nog een tweede keer inline af. dim-elapsed zonder klem mag
     wel (potjeRest en varPlanRemaining rekenen met 0 op de laatste dag, en dat is hun bedoeling);
     wat niet mag is een tweede `Math.max(dim-elapsed, 1)` naast deze functie. */
  test('geen tweede inline afleiding met dezelfde klem op 1', () => {
    const treffers = [...CODE.matchAll(/Math\.max\(\s*\w*\.?dim\s*-\s*\w*\.?elapsed\s*,\s*1\s*\)/g)];
    expect(treffers.length, 'meer dan één plek klemt dim-elapsed op 1').toBe(1);
    const regel = CODE.slice(0, treffers[0].index).split('\n').length;
    const fn = CODE.split('\n').slice(0, regel).reverse().find((x) => /^function /.test(x)) || '';
    expect(fn).toMatch(/^function maandDagenOver\(/);
  });

  test('vrijPerDag() leest dezelfde functie en rekent hem niet zelf uit', () => {
    const m = /function vrijPerDag\(\)\{([\s\S]*?)\n\}/.exec(CODE);
    expect(m).toBeTruthy();
    expect(m[1]).toMatch(/maandDagenOver\(/);
  });

  test('het dagbedrag deelt varPotjeStand() en niet de aftrekking uit de hero', () => {
    /* v309: deze afleiding stond in nogDezeMaandPosten() en staat nu in insBudgetBlok(), want daar
       is de kop. De HARDE VOORWAARDE van het open punt van v257 is precies deze assertie: hij mag
       daar niet de hero-meting gaan lezen omdat hij nu in de hero staat. */
    const m = /function insBudgetBlok\(m\)\{([\s\S]*?)\n\}/.exec(CODE);
    expect(m).toBeTruthy();
    const body = m[1];
    expect(body).toMatch(/per dag/);
    // de deler is inPotjes, en dat is VP.budget - VP.gebruikt
    expect(body).toMatch(/const inPotjes = potjesKop \? VP\.budget-VP\.gebruikt/);
    expect(body).toMatch(/inPotjes\/potjesDagen/);
    // en het percentage naast de noemer eronder leest wel spendNorm, dus dat is de scherpte:
    // het dagbedrag deelt inPotjes en niet bud-sp
    expect(body).not.toMatch(/\(bud\s*-\s*sp\)\s*\/|sp\s*\/\s*potjesDagen/);
    // en nogDezeMaandPosten() draagt hem niet meer
    const n = /function nogDezeMaandPosten\(\)\{([\s\S]*?)\n\}/.exec(CODE);
    expect(n[1]).not.toMatch(/dagRegel:/);
    expect(n[1]).not.toMatch(/per dag/);
  });
});
