// v257: de stand per dag onder "Nog uit je potjes". v263 maakte er een rollend venster van zeven
// dagen van; deze spec bewaakt onveranderd de noemer, de randgevallen en de plek op het scherm,
// met de ankers verschoven naar de nieuwe vorm. Het venster zelf staat in potjes-weekvenster.spec.js.
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
  if (o.klok) await page.clock.install({ time: o.klok });
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
const potjesPost = (page) => page.evaluate(() => {
  const p = nogDezeMaandPosten().find((x) => /Nog uit je potjes|Te veel uitgegeven/.test(x.lab)) || null;
  const m = kijkMaand();
  const rij = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
    .find((e) => /Nog uit je potjes|Te veel uitgegeven/.test(e.innerText)) || null;
  return { post: p, dagen: maandDagenOver(m), VP: varPotjeStand(m),
    vrijPerDagDagen: vrijPerDag().dagenResterend,
    regels: rij ? rij.innerText.split('\n').map((x) => x.trim()).filter(Boolean) : null,
    dagInDom: rij ? (rij.querySelector('.ins-nog-dag') || {}).innerText || null : null };
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
    expect(r.post.val).toBe('€520');
    expect(r.post.lab).toBe('Nog uit je potjes');
    /* v263: het anker is verschoven van een dagbedrag naar een venster; de eigenschap is dezelfde
       gebleven, namelijk dat de regel dit restant over de resterende dagen verdeelt. Het venster is
       min(dagen, 7) en het bedrag is het restant op datzelfde dagtempo. */
    const venster = Math.min(r.dagen, 7);
    const verwacht = Math.round(520 / r.dagen * venster);
    const woord = venster === 1 ? 'dag' : 'dagen';
    const soort = venster < r.dagen ? 'De komende' : 'De resterende';
    expect(r.post.dagRegel).toBe(`${soort} ${venster} ${woord} heb je €${verwacht.toLocaleString('nl-NL')}`);
  });

  /* Op de meetdag van deze ronde (dag 23 van een maand van 30) zijn dat 7 dagen. Het getal zelf
     hangt aan de kalender, dus de test hierboven leest de dagen live; deze legt de meting vast voor
     precies die dag, met de klok erop gezet.
     v263: anker verschoven. Tot v262 stond hier "7 dagen en €74 per dag"; het venster valt op die
     dag samen met de rest van de maand, dus het bedrag is nu het hele restant van €520 - €74 maal
     zeven, hetzelfde tempo in de eenheid waarin je het gebruikt. */
  test('gemeten op dag 23 van 30: een venster van 7 dagen met het hele restant', async ({ page }) => {
    await boot(page, { klok: new Date(now.getFullYear(), now.getMonth(), 23, 12, 0, 0) });
    const r = await potjesPost(page);
    expect(r.dagen).toBe(Math.max(DIM - 23, 1));
    if (DIM === 30) {
      expect(r.dagen).toBe(7);
      expect(r.post.val).toBe('€520');
      expect(r.post.dagRegel).toBe('De resterende 7 dagen heb je €520');
    }
  });

  test('de drie regels staan in volgorde: de stand, die stand per dag, en het tempo', async ({ page }) => {
    await boot(page);
    const r = await potjesPost(page);
    expect(r.regels[0]).toBe('Nog uit je potjes');
    expect(r.regels[1]).toMatch(/^van €1\.832 · €1\.312 gebruikt/);
    // v263: anker verschoven naar de venstervorm; de volgorde van de drie regels is de eigenschap
    expect(r.regels[2]).toMatch(/^De (komende|resterende) \d+ dagen? heb je €[\d.]+\.$/);
    expect(r.dagInDom).toMatch(/heb je €[\d.]+\.$/);
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
    // v263: anker verschoven; de klem op 1 en het hele restant zijn dezelfde eigenschap als in v257
    expect(r.post.dagRegel).toMatch(/^De resterende 1 dag heb je €\d/);
    const bedrag = Number((r.post.dagRegel.match(/heb je €([\d.]+)$/)[1]).replace(/\./g, ''));
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
    expect(r.post.lab).toBe('Te veel uitgegeven');
    expect(r.post.dagRegel).toBe('');
    expect(r.dagInDom).toBe(null);
  });

  /* Precies op nul: het grote getal zegt het al, dus "€0 per dag" zou datzelfde herhalen. */
  test('restant precies nul: het label blijft staan, de dagregel niet', async ({ page }) => {
    await boot(page, { extraTx: (add) => add('x2', CUR, '17', -520, 'Zalando', 'BEA, BETAALPAS ZALANDO') });
    const r = await potjesPost(page);
    expect(r.VP.budget - r.VP.gebruikt).toBe(0);
    expect(r.post.lab).toBe('Nog uit je potjes');
    expect(r.post.val).toBe('€0');
    expect(r.post.dagRegel).toBe('');
    expect(r.dagInDom).toBe(null);
  });
});

test.describe('d · de dagregel leest de potjes en niets anders', () => {
  /* De opdracht vroeg een test op "geen vaste lasten meer te gaan: het hele restant is variabel".
     In de gebouwde vorm is dat geen aftrekking meer, dus de scherpere toets is dat de dagregel
     NIET verandert als fixDue wegvalt: dat bewijst dat hij varPotjeStand() leest en niet de
     handberekening uit de hero. */
  test('fixDue op nul verandert het restant en de dagregel niet', async ({ page }) => {
    const a = await (async () => { await boot(page); return potjesPost(page); })();
    expect(a.post.dagRegel).toBeTruthy();
    // het abonnement komt deze maand alsnog langs, dus fixDue valt weg
    await boot(page, { extraTx: (add) => add('ab' + CUR, CUR, '08', -389, 'Ziggo', 'SEPA INCASSO ZIGGO ABONNEMENT') });
    const b = await potjesPost(page);
    expect(await page.evaluate(() => monthLiquidity().fixDue)).toBe(0);
    expect(b.post.val).toBe(a.post.val);
    expect(b.post.dagRegel).toBe(a.post.dagRegel);
  });

  /* En een uitgave buiten elk potje raakt hem ook niet, terwijl de handberekening uit de hero er
     wel mee zou zakken. Dat verschil is het open punt van budgetOverZin(), niet van deze regel. */
  test('een uitgave zonder potje raakt de dagregel niet, de handberekening wel', async ({ page }) => {
    await boot(page, { extraTx: (add) => add('x3', CUR, '19', -200, 'Kapper', 'BEA, BETAALPAS KAPPER') });
    const r = await potjesPost(page);
    const hand = await page.evaluate(() => { const m = kijkMaand(); const t = totals(m);
      return Math.round(t.budget) - Math.round(t.spendNorm) - monthLiquidity().fixDue; });
    expect(r.VP.budget - r.VP.gebruikt).toBe(520);
    expect(r.post.val).toBe('€520');
    expect(hand).toBe(320);                       // de aftrekking zakt mee, het restant niet
  });
});

/* De vouw kan hier niet door bewegen, en dat is structureel: 'Wat opvalt' staat sinds v252 VOOR
   'Wat er nog komt', dus een regel die in die tweede sectie bijkomt valt onder de signalen. Deze
   test legt die volgorde vast op de plek waar de regel zelf staat; inzichten-indeling.spec.js
   bewaakt de vouw zelf met zijn eigen drempels (567px op 360x640, 771px op 390x844). */
test.describe('e · de regel staat onder de signalen', () => {
  // shopping gaat 268 over zijn potje, dus er is een valt-op-signaal; er blijft 20 in de potjes
  const MET_SIGNAAL = { extraTx: (add) => add('x4', CUR, '16', -500, 'Zalando', 'BEA, BETAALPAS ZALANDO') };

  test('op 360x640 staat de dagregel onder het laatste signaal, niet erboven', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await boot(page, MET_SIGNAAL);
    const r = await page.evaluate(() => {
      const el = document.querySelector('#s-ins');
      const sig = [...el.querySelectorAll('.valtop-rij,.valtop-patroon')];
      const dag = el.querySelector('.ins-nog-dag');
      const nav = document.querySelector('.nav') || document.querySelector('nav');
      return { signalen: sig.length, dag: !!dag,
        sigBodem: sig.length ? Math.round(sig[sig.length - 1].getBoundingClientRect().bottom + window.scrollY) : null,
        dagTop: dag ? Math.round(dag.getBoundingClientRect().top + window.scrollY) : null,
        zichtbaar: window.innerHeight - (nav ? Math.round(nav.getBoundingClientRect().height) : 0) };
    });
    expect(r.signalen, 'geen signaal in deze fixture, dan meet deze test niets').toBeGreaterThan(0);
    expect(r.dag, 'geen dagregel in deze fixture, dan meet deze test niets').toBe(true);
    expect(r.dagTop).toBeGreaterThan(r.sigBodem);
    expect(r.sigBodem, JSON.stringify(r)).toBeLessThanOrEqual(r.zichtbaar);
  });

  test('en de regel staat er ook bij een overschreden potje, zolang er nog iets in zit', async ({ page }) => {
    await boot(page, MET_SIGNAAL);
    const r = await potjesPost(page);
    expect(r.VP.over).toBe(false);          // in totaal nog binnen, één potje eroverheen
    expect(r.post.val).toBe('€20');
    // v263: anker verschoven; dat de regel er staat zolang er iets in zit is de eigenschap
    expect(r.post.dagRegel).toMatch(/^De (komende|resterende) \d+ dagen? heb je €[\d.]+$/);
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

  test('de dagregel deelt varPotjeStand() en niet de aftrekking uit de hero', () => {
    const m = /function nogDezeMaandPosten\(\)\{([\s\S]*?)\n\}/.exec(CODE);
    expect(m).toBeTruthy();
    const body = m[1];
    expect(body).toMatch(/dagRegel:/);
    // de deler is inPotjes, en dat is VP.budget - VP.gebruikt
    expect(body).toMatch(/const inPotjes=VP\.budget-VP\.gebruikt/);
    expect(body).toMatch(/inPotjes\/dagen/);
    expect(body).not.toMatch(/spendNorm/);
  });
});
