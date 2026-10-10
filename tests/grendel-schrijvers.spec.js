// v245: de grendel op elke route, en de pijltjes die zeggen wat ze doen.
//
// AANLEIDING, en de meting die hem tegensprak. Gemeld: het pijltje omlaag bij het noodfonds
// verschoof het doel van plek 1 naar plek 2 terwijl de grendel dicht was. Het diagnosescherm van
// v244, gedraaid op het toestel zelf, liet zien dat dat op v244 niet kan: `Noodfonds omlaag:
// GEBLOKKEERD`. Wat de uitlezing wél liet zien is dat datzelfde pijltje als een gewone actieve
// knop rendeerde. De reparatie zit dus niet in de grendel maar in wat de knop belooft.
//
// DRIE ROUTES, ÉÉN REGEL. De volgorde-schrijver had de check, planPromoteDebt() en setNfAlloc() niet.
//
// v317: DE PIJLTJES ZIJN VAN HET SCHERM EN DE REGEL IS GEBLEVEN. Je plek in de rij zet je sinds die
// ronde in de editor van de bestemming, met een chip per plek, en `planMove()`/`planMoveMag()`
// bestaan niet meer. Blok a leest daarom het VELD en niet de rij: een plek die de regel niet
// toelaat is `.chip.off` zonder onclick, precies wat een uitgeschakeld pijltje was. De poort heet
// `planPlekMag()` en de regel zelf `planOrdeMag()`.
// De twee bronzoekende tests onderaan zijn het echte slot: ze lezen index.html en eisen dat
// ELKE schrijver van SET.randorde en elke schrijver van een vast maandbedrag door de bijbehorende
// grens gaat. Komt er een vierde schrijver bij, dan faalt de suite bij het bouwen. Dat is bewust
// gekozen boven een correctie bij het lezen: die zou het volgende lek stil genezen.
//
// DE FIXTURE IS DIE VAN HET TOESTEL. Tot nu toe stond de buffer in deze specs op 9.000 van 40.000,
// dus 31.000 te gaan en elf maanden. De gemelde toestand was 1.100 van 5.301: 4.201 te gaan bij
// een inleg van 3.000, dus twee maanden. Het diagnosescherm liet zien dat fixture en werkelijkheid
// andere paden kunnen nemen, dus staat die toestand hier als eigen geval, naast een buffer die
// binnen één maand vol is.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { kaalBron } = require('./bron-kaal');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '03', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  add('s' + M2, SPAAR, M2, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  add('s' + M1, SPAAR, M1, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000, [SPAAR]: 9000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 3000,
    savingsAcc: { [SPAAR]: true },
    nfDoelVast: o.nfDoel != null ? o.nfDoel : 40000,
    nfToegewezen: o.nfToe != null ? o.nfToe : 9000,
    nfToegewezenMigrated: true,
    goals: o.goals || [],
    debts: o.debts || [],
    planAlloc: o.planAlloc || { noodfonds: { allocMode: 'auto' } },
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
// de toestand van het toestel: 1.100 van 5.301, inleg 3.000, dus 4.201 te gaan en twee maanden
const TOESTEL = { nfDoel: 5301, nfToe: 1100 };
// bijna vol: wat er nog te gaan is past binnen één maand inleg
const BIJNA = { nfDoel: 5301, nfToe: 5200 };
const VOL = { nfDoel: 5301, nfToe: 5301 };
const DRIE = [
  { id: 'g1', naam: 'Kosten Koper', doel: 16000, gespaard: 0, allocMode: 'auto', streefdatum: '2028-06' },
  { id: 'g2', naam: 'Inrichting woning', doel: 3000, gespaard: 0, allocMode: 'auto', streefdatum: '2029-01' },
];
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planPlekMag === 'function');
  await page.evaluate(() => go('vooruit'));
}
const orde = (page) => page.evaluate(() => planItems().map((x) => x.id));

/* v317: HET VOLGORDE-VELD VAN ÉÉN BESTEMMING, gelezen uit de DOM zoals het op het scherm staat.
   Per plek: is hij aantikbaar, is hij de huidige, en hangt er een handler aan. Het anker is
   `data-plek` en geen tekst.
   DE TWEE EDITORS ZIJN TWEE INGANGEN NAAR HETZELFDE VELD, dus de helper opent de juiste. Zonder het
   noodfonds-pad zou de spec de helft van het veld niet toetsen, en juist die helft is de reden dat
   het veld in twee sheets staat: zonder hem is het noodfonds na het weghalen van de pijltjes
   helemaal niet meer te verplaatsen. */
async function plekken(page, id) {
  return page.evaluate((i) => {
    if (i === 'noodfonds') openNoodfondsPanel(); else openGoal(i);
    const els = [...document.querySelectorAll('#planOrdeChips .chip')];
    if (!els.length) return null;
    return els.map((el) => ({
      plek: +el.dataset.plek,
      nu: el.classList.contains('on'),
      off: el.classList.contains('off'),
      handler: el.hasAttribute('onclick'),
    }));
  }, id);
}
/* Wat de poort van dezelfde bestemming zegt, los van de DOM. */
const poort = (page, id) => page.evaluate((i) =>
  planItems().map((_, k) => planPlekMag(i, k)), id);

test.describe('a · het volgorde-veld zegt wat het doet', () => {
  test('dichte grendel op de toestand van het toestel: plek 1 is voor het noodfonds en staat uit bij een doel',
    async ({ page }) => {
      await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
      // eerst vaststellen dat dit werkelijk de gemelde toestand is
      expect(await page.evaluate(() => planGrendel())).toMatchObject({ dicht: true, rest: 4201, maanden: 2 });
      const g1 = await plekken(page, 'g1');
      expect(g1.length).toBe(3);
      expect(g1[0]).toEqual({ plek: 0, nu: false, off: true, handler: false });   // langs de buffer heen mag niet
      expect(g1[1]).toEqual({ plek: 1, nu: true, off: false, handler: false });   // waar hij nu staat
      expect(g1[2]).toEqual({ plek: 2, nu: false, off: false, handler: true });
    });

  test('en het noodfonds kan bij een dichte grendel nergens anders heen', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
    const nf = await plekken(page, 'noodfonds');
    expect(nf.map((x) => x.nu)).toEqual([true, false, false]);
    expect(nf.map((x) => x.off)).toEqual([false, true, true]);
    expect(nf.some((x) => x.handler)).toBe(false);
  });

  test('een buffer die bijna vol is gedraagt zich net zo: bijna vol is niet vol', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, BIJNA));
    expect(await page.evaluate(() => planGrendel())).toMatchObject({ dicht: true, rest: 101, maanden: 1 });
    expect((await plekken(page, 'g1'))[0].off).toBe(true);
    expect((await plekken(page, 'noodfonds'))[1].off).toBe(true);
  });

  test('zodra de buffer vol is gaat elke plek vanzelf open, zonder knop en zonder vlag', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, VOL));
    expect(await page.evaluate(() => planGrendel())).toBe(null);
    expect((await plekken(page, 'g1')).map((x) => x.off)).toEqual([false, false, false]);
    expect((await plekken(page, 'noodfonds')).map((x) => x.off)).toEqual([false, false, false]);
  });

  /* v317: DE PLEK WAAR JE STAAT DRAAGT GEEN HANDLER, en dat is geen detail: met een handler zou een
     tik op je eigen plek een schrijfactie en een render doen zonder dat er iets verandert. */
  test('de plek waar je staat is gemarkeerd en niet aantikbaar', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, VOL));
    const g1 = await plekken(page, 'g1');
    const nu = g1.filter((x) => x.nu);
    expect(nu.length).toBe(1);
    expect(nu[0].plek).toBe(1);
    expect(nu[0].handler).toBe(false);
  });

  test('onderling schuiven onder de buffer mag en werkt, ook bij een dichte grendel', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
    await plekken(page, 'g1');
    await page.locator('#planOrdeChips .chip[data-plek="2"]').click();
    expect(await orde(page)).toEqual(['noodfonds', 'g2', 'g1']);
  });

  /* v317: DE VOLGORDE IS VIA DE EDITOR TE ZETTEN, en dat is de assertie die vóór het weghalen van de
     pijltjes groen moest staan. Beide ingangen, want het noodfonds heeft geen doel-editor. */
  test('en het noodfonds schuift via zijn eigen sheet, want daar is zijn enige ingang', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, VOL));
    await plekken(page, 'noodfonds');
    await page.locator('#planOrdeChips .chip[data-plek="2"]').click();
    expect(await orde(page)).toEqual(['g1', 'g2', 'noodfonds']);
  });

  test('de pijltjes staan niet meer op het scherm', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, VOL));
    expect(await page.locator('#s-vooruit .plan-mv').count()).toBe(0);
    expect(await page.evaluate(() => typeof planMove)).toBe('undefined');
    expect(await page.evaluate(() => typeof planMoveMag)).toBe('undefined');
  });

  test('planPlekMag is de enige poort: het veld en de schrijver beslissen niet apart', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
    for (const id of ['noodfonds', 'g1', 'g2']) {
      const mag = await poort(page, id);
      const dom = await plekken(page, id);
      for (const c of dom) {
        if (c.nu) continue;
        expect(!c.off, `${id} plek ${c.plek} in de DOM`).toBe(mag[c.plek]);
        expect(c.handler, `${id} plek ${c.plek} handler`).toBe(mag[c.plek]);
      }
    }
  });

  /* v317: EEN GEWEIGERDE PLEK SCHRIJFT NIETS, ook als je de schrijver rechtstreeks aanroept. Het
     veld biedt hem niet aan, dus dit pad loopt alleen via een aanroep; dat is de keuze van v284 over
     een poort die vanuit het scherm niet bereikbaar is. */
  test('de schrijver weigert een plek die de regel niet toelaat', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL));
    await page.evaluate(() => planPlekZet('g1', 0));
    expect(await orde(page)).toEqual(['noodfonds', 'g1', 'g2']);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).planOrder))
      .toEqual(['noodfonds', 'g1', 'g2']);
    expect((await page.locator('#toast').textContent())).toContain('buffer gaat eerst');
  });
});

test.describe('b · planPromoteDebt', () => {
  const MET_SCHULD = { debts: [{ id: 'd1', naam: 'Lening', start: 8000, rest: 6000, perMaand: 200, rente: 6 }] };

  test('met een dichte grendel zet hij het aflossen niet bovenaan', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL, MET_SCHULD));
    const voor = await orde(page);
    await page.evaluate(() => planPromoteDebt('d1'));
    expect(await orde(page)).toEqual(voor);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).planOrder))
      .toEqual(['noodfonds', 'g1', 'g2']);
  });

  test('en hij zegt hetzelfde als de volgorde-schrijver, want het is dezelfde regel', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, TOESTEL, MET_SCHULD));
    await page.evaluate(() => planPromoteDebt('d1'));
    const a = await page.locator('#toast').textContent();
    await page.evaluate(() => planPlekZet('noodfonds', 1));
    const b = await page.locator('#toast').textContent();
    expect(a.trim()).toBe(b.trim());
    expect(a).toContain('buffer gaat eerst');
  });

  test('met een volle buffer doet hij gewoon zijn werk', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE, set: { planOrder: ['noodfonds', 'g1', 'g2'] } }, VOL, MET_SCHULD));
    await page.evaluate(() => planPromoteDebt('d1'));
    expect((await orde(page))[0]).toBe('af:d1');
  });
});

test.describe('c · setNfAlloc', () => {
  test('met een dichte grendel verandert een maandbedrag op het noodfonds niets', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, TOESTEL, { planAlloc: { noodfonds: { allocMode: 'fixed', perMaand: 250 } } }));
    await page.evaluate(() => setNfAlloc('perMaand', '9000'));
    expect(await page.evaluate(() => SET.planAlloc.noodfonds.perMaand)).toBe(250);
  });

  test('met een open grendel geldt de harde grens van v242', async ({ page }) => {
    // gemeten vóór deze ronde: 99.000 per maand bij een capaciteit van 3.000 ging er zo in
    await boot(page, Object.assign({ goals: DRIE }, VOL, { planAlloc: { noodfonds: { allocMode: 'fixed', perMaand: 0 } } }));
    expect(await page.evaluate(() => planCapacity())).toBe(3000);
    await page.evaluate(() => { window._nfSheet = true; setNfAlloc('perMaand', '99000'); });
    expect(await page.evaluate(() => SET.planAlloc.noodfonds.perMaand)).toBe(0);
    expect(await page.evaluate(() => planVastSom(null))).toBeLessThanOrEqual(3000);
  });

  test('een bedrag binnen de grens gaat er gewoon in', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, VOL, { planAlloc: { noodfonds: { allocMode: 'fixed', perMaand: 0 } } }));
    await page.evaluate(() => { window._nfSheet = true; setNfAlloc('perMaand', '1200'); });
    expect(await page.evaluate(() => SET.planAlloc.noodfonds.perMaand)).toBe(1200);
  });

  test('zijn eigen bedrag telt niet tegen zichzelf: opnieuw opslaan mag', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, VOL, { planAlloc: { noodfonds: { allocMode: 'fixed', perMaand: 3000 } } }));
    await page.evaluate(() => { window._nfSheet = true; setNfAlloc('perMaand', '3000'); });
    expect(await page.evaluate(() => SET.planAlloc.noodfonds.perMaand)).toBe(3000);
  });
});

/* ===== de twee bronzoekende tests =====
 * Niet "werkt route X", maar "bestaat er een route die de regel omzeilt". Een test op de drie
 * routes die we kennen gaat groen bij een vierde die we niet kennen, en dat is precies hoe
 * planPromoteDebt() jarenlang ongezien bleef terwijl plan-prioriteit.spec.js groen stond.
 */
const BRON = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
/* Comments eruit, maar niet de // in een URL of in een string; blokcomments worden vervangen door
   spaties zodat de regelnummers in een foutmelding blijven kloppen. Overgenomen uit
   lokale-kalenderdag.spec.js, dezelfde valkuil (een te agressieve strip maakt schrijvers onzichtbaar). */
// v309: de strip staat op EEN plek (tests/bron-kaal.js); deze vorm kwam hier vandaan.
const strip = kaalBron;
const CODE = strip(BRON);

/* De functie waarin een positie in de bron valt, plus zijn body. De koppen worden één keer
   verzameld en op positie gezocht, niet door vóór de treffer opnieuw te matchen: dat laatste laat
   de kop van de functie waar je ín zit buiten beeld zodra de treffer vóór het haakje ligt, en dan
   krijgt `function setPlanAlloc(` de naam van de functie erbóven. Die fout maakte deze test eerst
   rood op iets wat niet stuk was. Code buiten elke functie krijgt de naam van de laatste kop
   ervoor; hier schrijft niets op dat niveau, en een schrijver die daar zou bijkomen valt alsnog op
   omdat zijn body de grens dan niet noemt. */
const HEADERS = [...CODE.matchAll(/\nfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => ({ i: m.index, naam: m[1] }));
function functieRond(index) {
  let h = null;
  for (const x of HEADERS) { if (x.i <= index) h = x; else break; }
  if (!h) return null;
  const volgende = HEADERS.find((x) => x.i > h.i);
  return { naam: h.naam, body: CODE.slice(h.i, volgende ? volgende.i : CODE.length) };
}
function schrijvers(re) {
  const uit = [];
  let m;
  const r = new RegExp(re.source, 'g');
  while ((m = r.exec(CODE)) !== null) {
    const f = functieRond(m.index);
    const nr = CODE.slice(0, m.index).split('\n').length;
    uit.push({ regel: nr, tekst: CODE.split('\n')[nr - 1].trim(), fn: f && f.naam, body: f && f.body });
  }
  return uit;
}

test.describe('d · de bron: elke schrijver gaat door de grens', () => {
  test('bij een dichte grendel staat het noodfonds op plek 1, en geen schrijver van SET.planOrder omzeilt dat',
    () => {
      const w = schrijvers(/SET\.planOrder\s*=/);
      expect(w.length, 'geen enkele schrijver gevonden: de zoekvorm klopt niet meer').toBeGreaterThan(0);
      const ongedekt = w.filter((x) => {
        // planForget() haalt alleen een id wég. planItems() zet het noodfonds vooraan terug zodra
        // hij niet in de lijst staat (de unshift-tak), dus deze schrijver kan de invariant niet breken.
        if (x.fn === 'planForget') return false;
        /* v317: `planOrdeMag()` is sinds die ronde de ene uitdrukking van de regel, en de
           schrijver leest hem. De oudere namen blijven in de vorm staan, want een oude bron moet
           hier nog steeds gedekt kunnen zijn. */
        return !/planGrendel\(\)|planMoveMag\(|planOrdeMag\(/.test(x.body || '');
      });
      expect(ongedekt.map((x) => `${x.fn} (regel ${x.regel}): ${x.tekst}`)).toEqual([]);
    });

  test('de unshift-tak in planItems() is er nog: daar leunt de uitzondering voor planForget op', () => {
    const f = functieRond(CODE.indexOf('\nfunction planItems('));
    expect(f.naam).toBe('planItems');
    expect(f.body).toMatch(/seen\.has\(PLAN_NF\)[\s\S]*unshift/);
  });

  /* Een vast maandbedrag belandt op precies twee plekken: in SET.planAlloc[id].perMaand, en dat
     gaat altijd door setPlanAlloc(), en in een doel via saveGoal(). De test zoekt dus op de
     opslagroute en niet op de vorm van het bedrag: een nieuwe schrijver mag zijn variabele noemen
     zoals hij wil, maar hij komt er niet langs setPlanAlloc() vandaan. Een aanroeper die alleen
     een modus zet noemt perMaand niet en heeft de grens niet nodig; zodra hij er wél een bedrag
     bij zet valt hij hier om. */
  test('elke schrijver van een vast maandbedrag gaat door planVastRuimte()', () => {
    const w = schrijvers(/setPlanAlloc\(/);
    expect(w.length, 'geen enkele schrijver gevonden: de zoekvorm klopt niet meer').toBeGreaterThan(0);
    const ongedekt = w.filter((x) => {
      if (x.fn === 'setPlanAlloc') return false;               // de opslagfunctie zelf, geen route
      if (!/perMaand/.test(x.body || '')) return false;        // zet alleen een modus, geen bedrag
      return !/planVastRuimte\(/.test(x.body || '');
    });
    expect(ongedekt.map((x) => `${x.fn} (regel ${x.regel}): ${x.tekst}`)).toEqual([]);
  });

  /* v373: saveGoal() IS GEEN OPSLAGROUTE VOOR EEN BEDRAG MEER. De doel-editor heeft geen verdeelmodus; het bedrag per doel
     staat in de verdeling, en verdelingZet() eist zijn eigen grens (niets te veel verdeeld, verdelingReden()). De test
     houdt nu vast dat saveGoal() geen bedrag of modus uit het blad leest; leest hij dat weer, dan valt hij om. */
  test('saveGoal() schrijft geen bedrag en geen modus meer; de verdeling eist haar eigen grens', () => {
    const f = functieRond(CODE.indexOf('\nfunction saveGoal('));
    expect(f.naam).toBe('saveGoal');
    expect(f.body).not.toMatch(/gMnd|gPct|_goalMode/);
    const z = functieRond(CODE.indexOf('\nfunction verdelingZet('));
    expect(z.body).toMatch(/verdelingReden\(/);
  });

  /* v255: DEZELFDE VORM, DE ANDERE GRENS. planVastRuimte() hierboven is de harde grens op de SOM
     (v242). Dit is de grendel op de handeling zelf: een eigen maandbedrag of een eigen modus voor
     iets anders dan de buffer is splitsen, en dat blijft dicht tot de buffer vol is.
     Tot v254 hing dat aan geen enkele schrijver maar aan ronde 1 van allocatePlan(), die de modus
     van een niet-buffer-item overslaat zolang de grendel dicht is. Gemeten met een dichte grendel:
     setPlanAllocVeld('perMaand','500') schreef 500 weg op een aflos-item, en saveGoal() schreef
     allocMode 'fixed' met perMaand 500 op een wachtend doel. Beide werden daarna stil genegeerd,
     dus het scherm zei 'vast 500' bij een doel dat nul kreeg. Een waarde die je kunt opslaan en
     die niets doet is geen grens (v238).
     HIER GELDT GEEN 'ALLEEN ALS HIJ EEN BEDRAG ZET'-UITZONDERING zoals bij planVastRuimte(): een
     modus kiezen is de helft van een maandbedrag instellen, dus elke aanroeper leest hem. */
  test('elke schrijver van een verdeling gaat door planVastMag()', () => {
    const w = schrijvers(/setPlanAlloc\(/);
    expect(w.length, 'geen enkele schrijver gevonden: de zoekvorm klopt niet meer').toBeGreaterThan(0);
    const ongedekt = w.filter((x) => {
      if (x.fn === 'setPlanAlloc') return false;               // de opslagfunctie zelf, geen route
      return !/planVastMag\(/.test(x.body || '');
    });
    expect(ongedekt.map((x) => `${x.fn} (regel ${x.regel}): ${x.tekst}`)).toEqual([]);
  });

  /* v373: zie hierboven; de grendel staat in de verdeling als vaste regel voor de buffer (verdelingData()) en in ronde 1b
     van planVerdeelMaand(), die een eigen bedrag pas geeft als de buffer zijn rest kreeg. */
  test('de verdeling leest de grendel: de buffer gaat eerst, als vaste regel', () => {
    const f = functieRond(CODE.indexOf('\nfunction verdelingData('));
    expect(f.body).toMatch(/planGrendel\(/);
  });

  /* planVastMag() is de enige toets. Een tweede planGrendel() naast hem in dezelfde functie zou
     een tweede waarheid zijn, precies de fout die de volgorde-poort bij v245 wegnam. */
  test('geen schrijver toetst de grendel daarnaast nog een keer zelf', () => {
    const w = schrijvers(/setPlanAlloc\(/).filter((x) => x.fn !== 'setPlanAlloc');
    const dubbel = w.filter((x) => /planGrendel\(/.test(x.body || ''));
    expect(dubbel.map((x) => x.fn)).toEqual([]);
  });

  test('de drie routes die we kennen staan er alle drie bij', () => {
    const w = schrijvers(/setPlanAlloc\(/).map((x) => x.fn);
    expect(w).toContain('setPlanAllocVeld');
    expect(w).toContain('setNfAlloc');
    expect(schrijvers(/SET\.planOrder\s*=/).map((x) => x.fn)).toContain('planPromoteDebt');
    expect(schrijvers(/SET\.planOrder\s*=/).map((x) => x.fn)).toContain('planPlekZet');
  });

  /* v317: DE REGEL STAAT OP EEN PLEK. `planOrdeMag()` is de enige functie die de grendel tegen een
     VOLGORDE toetst; het veld en de schrijver lezen hem via `planPlekMag()`. Een tweede
     planGrendel() in een van die twee zou de tegenspraak terugbrengen die v245 wegnam. */
  test('het veld en de schrijver drukken de regel niet zelf nog eens uit', () => {
    for (const naam of ['planOrdeVeld', 'planPlekZet', 'planPlekMag']) {
      const f = functieRond(CODE.indexOf('\nfunction ' + naam + '('));
      expect(f.naam, naam).toBe(naam);
      expect(/planGrendel\(/.test(f.body), `${naam} toetst de grendel zelf`).toBe(false);
    }
    const g = functieRond(CODE.indexOf('\nfunction planOrdeMag('));
    expect(g.body).toMatch(/planGrendel\(/);
  });
});
