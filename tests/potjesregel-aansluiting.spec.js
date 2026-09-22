// v250: het grote getal op de potjesregel sluit aan op de regel eronder.
//
// GEMELD: "Nog uit je potjes €1.089, van €1.730 · €1.132 gebruikt · 65%". Dat leest als een
// aftrekking en is het niet: €1.089 komt uit varPlanRemaining(), en die geeft voor een overschreden
// potje het geplande dagtempo maal de resterende dagen terug (v111), niet een negatief restant.
// Het grote getal is sinds deze ronde varBudget() min varPotjeStand().gebruikt, en de reservering
// staat als eigen regel eronder met het verschil erbij.
//
// WAT DEZE SPEC VASTHOUDT, en niet de opmaak: dat de twee getallen op de regel uit dezelfde twee
// bronnen komen als de sub eronder, dat de tweede regel varPlanRemaining noemt en er alleen staat
// als er een gat is, en dat een tik altijd uitkomt op het bedrag waarop je tikte.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
  }
  for (const b of (o.boekingen || [])) add(b[0], CUR, b[1], b[2], b[3], b[4]);
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000 }, savingMode: 'amount', savingAmount: 0,
    budgets: o.budgets || { boodschappen: 500, vervoer: 300, uiteten: 400, huur: 1200 },
    budgetMonth: CUR,
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

/* DE GEMETEN TOESTAND VAN HET TOESTEL, en niet een verhouding die erop lijkt. Gemeld werd
   "Nog uit je potjes €1.089, van €1.730 · €1.132 gebruikt · 65%", dus €1.730 aan variabele potjes,
   €1.132 gebruikt en een aftrekking van €598. Die drie staan hieronder als potjes en boekingen.
   WAT NIET VAST TE ZETTEN IS: de €1.089 en het gat van €491. potjeRest() geeft voor een
   overschreden potje bud/dim maal de RESTERENDE DAGEN terug, dus die twee hangen aan de dag van
   de maand: op dag 20 was het gat €385, op dag 22 €491. Een fixture die ze als getal vastlegt zou
   morgen rood staan zonder dat er iets mis is. De potjes zijn daarom zo gekozen dat het gat op
   dag 22 van een maand van 30 dagen precies op €491 uitkomt, en elke test leest hem verder live
   uit varPlanRemaining() in plaats van hem te herhalen. */
const GEMELD_BUDGETS = { boodschappen: 600, uiteten: 400, vervoer: 330, shopping: 400, huur: 1200 };
const GEMELD = [['b1', '03', -931, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['u1', '06', -120, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT'],
  ['v1', '04', -81, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION']];
const gemeld = () => ({ boekingen: GEMELD, budgets: GEMELD_BUDGETS });
// alles ruim binnen de potjes: geen gat
const BINNEN = [['b1', '03', -120, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN']];
// meer uitgegeven dan de som van alle variabele potjes
const OVERAL = [['b1', '03', -900, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['v1', '04', -400, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION']];
/* elk potje precies op nul: potjeRest geeft dan overal bud - uitgegeven = 0 terug, dus
   varPlanRemaining is nul terwijl er wel potjes zijn. Op de oude poort (varPlan>0) verdween de
   regel hier; de nieuwe poort leest varBudget en houdt hem staan. */
const PRECIES = [['b1', '03', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['v1', '04', -300, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION'],
  ['u1', '06', -400, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT']];

async function boot(page, o) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof nogDezeMaandPosten === 'function');
  await page.evaluate(() => go('ins'));
}

// de regel zoals hij op het scherm staat, plus de bronnen waar hij uit hoort te komen
const meet = (page) => page.evaluate(() => {
  const m = curMonth || months()[months().length - 1];
  const VP = varPotjeStand(m);
  const r = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
    .find((x) => /uit je potjes|te veel uitgegeven/i.test(x.innerText));
  const q = (c) => { const e = r && r.querySelector(c); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; };
  const eur = (t) => (t == null ? null : Math.abs(Math.round(parseFloat(String(t).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0)));
  return {
    er: !!r, lab: q('.ins-nog-lab'), val: q('.ins-nog-val'), valEur: eur(q('.ins-nog-val')),
    sub: q('.ins-nog-sub'), noot: q('.ins-nog-noot'),
    rijTik: !!(r && r.getAttribute('onclick')),
    nootTik: !!(r && r.querySelector('.ins-nog-noot') && r.querySelector('.ins-nog-noot').getAttribute('onclick')),
    budget: VP.budget, gebruikt: VP.gebruikt, rest: varPlanRemaining(m),
    inPotjes: VP.budget - VP.gebruikt, gat: varPlanRemaining(m) - (VP.budget - VP.gebruikt),
  };
});

test.describe('a · het grote getal is de aftrekking die eronder staat', () => {
  test('de gemelde verhouding: het getal is budget min gebruikt, niet de reservering', async ({ page }) => {
    await boot(page, gemeld());
    const r = await meet(page);
    expect(r.er).toBe(true);
    expect(r.valEur).toBe(r.inPotjes);          // de aftrekking
    expect(r.valEur).not.toBe(r.rest);          // en in deze fixture wijkt die echt af
    expect(r.gat).toBeGreaterThan(0);
    expect(r.lab).toBe('Nog uit je potjes');
  });

  test('de sub noemt dezelfde twee getallen waaruit het grote getal volgt', async ({ page }) => {
    await boot(page, gemeld());
    const r = await meet(page);
    // "van €1.200 · €1.070 gebruikt · 89%" - en 1200 min 1070 is wat er groot staat
    const g = [...r.sub.matchAll(/€([\d.]+)/g)].map((x) => +x[1].replace(/\./g, ''));
    expect(g[0]).toBe(r.budget);
    expect(g[1]).toBe(r.gebruikt);
    expect(g[0] - g[1]).toBe(r.valEur);
  });

  test('niets gebruikt: het hele potje staat er, zonder extra regel', async ({ page }) => {
    await boot(page, { boekingen: [] });
    const r = await meet(page);
    expect(r.valEur).toBe(r.budget);
    expect(r.gat).toBe(0);
    expect(r.noot).toBeNull();
  });
});

test.describe('b · de reservering staat eronder, met het verschil erbij', () => {
  test('de extra regel noemt varPlanRemaining en het gat', async ({ page }) => {
    await boot(page, gemeld());
    const r = await meet(page);
    const g = [...r.noot.matchAll(/€([\d.]+)/g)].map((x) => +x[1].replace(/\./g, ''));
    expect(g[0]).toBe(r.rest);                  // "heb je nog €493 nodig"
    expect(g[1]).toBe(r.gat);                   // "€363 meer dan er in zit"
    expect(g[0] - g[1]).toBe(r.valEur);         // en de drie sluiten op elkaar aan
    expect(r.noot).not.toMatch(/^(zet|verlaag|stop|houd|pas)/i);   // geen gebiedende wijs
  });

  test('geen enkel potje over zijn grens: het gat is nul en de regel staat er niet', async ({ page }) => {
    await boot(page, { boekingen: BINNEN });
    const r = await meet(page);
    expect(r.er).toBe(true);
    expect(r.gat).toBe(0);
    expect(r.rest).toBe(r.inPotjes);
    expect(r.noot).toBeNull();
    expect(r.nootTik).toBe(false);
  });

  test('de extra regel draagt geen alarmkleur', async ({ page }) => {
    await boot(page, gemeld());
    const kleur = await page.evaluate(() => {
      const n = document.querySelector('#insNogLijst .ins-nog-noot');
      const c = getComputedStyle(n).color;
      const los = (v) => { const d = document.createElement('div'); d.style.color = v; document.body.appendChild(d); const x = getComputedStyle(d).color; d.remove(); return x; };
      const rs = getComputedStyle(document.documentElement);
      return { c, rood: los(rs.getPropertyValue('--red').trim()), amber: los(rs.getPropertyValue('--amber').trim()),
        mut2: los(rs.getPropertyValue('--mut2').trim()) };
    });
    expect(kleur.c).not.toBe(kleur.rood);
    expect(kleur.c).not.toBe(kleur.amber);
    expect(kleur.c).toBe(kleur.mut2);
  });
});

test.describe('c · meer uitgegeven dan er in je potjes zat', () => {
  test('het label zegt het, en er staat geen minteken', async ({ page }) => {
    await boot(page, { boekingen: OVERAL });
    const r = await meet(page);
    expect(r.inPotjes).toBeLessThan(0);
    expect(r.lab).toBe('Te veel uitgegeven');
    expect(r.val).not.toContain('-');
    expect(r.valEur).toBe(-r.inPotjes);
  });

  test('de sub laat het percentage weg, want de hero zegt het al', async ({ page }) => {
    await boot(page, { boekingen: OVERAL });
    const r = await meet(page);
    expect(r.sub).not.toMatch(/%/);
    expect(r.sub).toMatch(/^van €[\d.]+ · €[\d.]+ gebruikt$/);
  });
});

test.describe('d · de poort leest je potjes, niet de reservering', () => {
  test('elk potje precies op: reservering nul, en de regel staat er nog', async ({ page }) => {
    await boot(page, { boekingen: PRECIES });
    const r = await meet(page);
    expect(r.rest).toBe(0);            // de oude poort (varPlan>0) had de regel hier laten vallen
    expect(r.er).toBe(true);
    expect(r.valEur).toBe(0);
    expect(r.gat).toBe(0);
    expect(r.noot).toBeNull();
  });
});

test.describe('e · een tik komt uit op het bedrag waarop je tikte', () => {
  const kopBedrag = (page) => page.evaluate(() => {
    const t = document.querySelector('#sheet').innerText.replace(/\s+/g, ' ');
    const m = t.match(/€([\d.]+)(?:,\d\d)?/);
    return m ? +m[1].replace(/\./g, '') : null;
  });

  test('de tik op de extra regel opent de sheet met datzelfde bedrag in de kop', async ({ page }) => {
    await boot(page, gemeld());
    const r = await meet(page);
    await page.click('#insNogLijst .ins-nog-noot');
    await page.waitForSelector('#sheetBg.show');
    expect(await kopBedrag(page)).toBe(r.rest);      // openReservedPotjes telt potjeRest op
  });

  test('het grote getal heeft geen tik, want geen bestaand overzicht komt erop uit', async ({ page }) => {
    await boot(page, gemeld());
    expect((await meet(page)).rijTik).toBe(false);
    await page.click('#insNogLijst .ins-nog-val');
    expect(await page.locator('#sheetBg.show').count()).toBe(0);
  });

  test('zonder gat is er geen tik op de regel, en Home houdt de route naar de sheet', async ({ page }) => {
    await boot(page, { boekingen: BINNEN });
    const r = await meet(page);
    expect(r.rijTik).toBe(false);
    expect(r.nootTik).toBe(false);
    const home = await page.evaluate(() => {
      go('dash'); openSafeToSpend();
      const el = [...document.querySelectorAll('#sheet [onclick]')]
        .find((x) => /gereserveerd in je potjes/i.test(x.innerText));
      return { er: !!el, bron: Math.round(safeToSpend().reserved) };
    });
    expect(home.er).toBe(true);
    expect(home.bron).toBe(r.rest);
  });
});

test.describe('f · safeToSpend is niet aangeraakt', () => {
  for (const [naam, o] of [['gemeld', gemeld()], ['binnen', { boekingen: BINNEN }],
    ['overal over', { boekingen: OVERAL }]]) {
    test(`${naam}: reserved blijft varPlanRemaining, en de regel wijkt er bewust van af`, async ({ page }) => {
      await boot(page, o);
      const r = await page.evaluate(() => {
        const m = curMonth || months()[months().length - 1];
        const S = safeToSpend();
        return { reserved: Math.round(S.reserved), plan: varPlanRemaining(m),
          src: safeToSpend.toString(),
          safe: S.safe, opnieuw: safeToSpend().safe };
      });
      expect(r.reserved).toBe(r.plan);             // de lezer op Home leest nog de reservering
      expect(r.src).toContain('varPlanRemaining(');
      expect(r.src).not.toContain('varPotjeStand');  // en niet het nieuwe getal van de regel
      expect(r.safe).toBe(r.opnieuw);
    });
  }
});
