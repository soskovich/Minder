// v194: de grafiekgroep. De toets bij elke vorm: welke beslissing verandert door de vorm van deze
// lijn of balk. Is het antwoord geen, dan verdwijnt de vorm en komt er een getal met delta voor
// terug, niet een kleinere versie van dezelfde vorm.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { pinDag } = require('./vaste-dag');
const { kaalBron, kaalUit } = require('./bron-kaal');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);

/* maanden = totaal aantal maanden inclusief de lopende. De afgeronde maanden zijn identiek, zodat
   elk afgeleid gemiddelde vastligt en alleen het aantal punten verschilt. */
function seed(o = {}) {
  const n = o.maanden == null ? 13 : o.maanden;
  const MS = []; for (let k = n - 1; k >= 0; k--) MS.push(ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
  const tx = []; let i = 0;
  const add = (m, d, a, naam, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: MAIN,
    name: naam, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m, idx) => {
    const nu = idx === MS.length - 1;
    add(m, '05', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    // de lopende maand krijgt het bedrag uit o.nu, zodat we 40%, 100% en 148% kunnen zetten
    const b = nu ? (o.nu == null ? 300 : o.nu) : 500;
    if (b) add(m, nu ? '03' : '08', -b, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  });
  /* v242: de grendel. Zolang het noodfonds niet vol is gaat de hele spaarinleg daarheen en valt er
     niets te verdelen. Deze spec gaat over wat er dáárna gebeurt, dus staat de buffer hier vol. */
  const set = Object.assign({ nfToegewezen: 9e7, nfToegewezenMigrated: true,
    mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 6000 }, savingMode: 'amount', savingAmount: 300,
    budgets: { huur: 900, boodschappen: 500 }, goals: [], planOrder: [] }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  /* v299: de klok op een vaste dag. De drempelzinnen hieronder dragen "met nog N dagen te gaan",
     en op de op-een-na-laatste dag van een maand is dat "1 dag" (v257). */
  await pinDag(page);
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof spendVsBudgetChart === 'function');
}

// het budget in de lopende maand is huur 900 + boodschappen 500 = 1400; huur valt in de maand zelf
// weg tegen de incasso, dus we sturen alleen op wat er extra wordt uitgegeven
const balk = (page) => page.evaluate(() => {
  const m = kijkMaand(); const t = totals(m);
  const d = document.createElement('div'); d.innerHTML = insBudgetBlok(m);
  const fill = d.querySelector('.bar-fill');
  const track = d.querySelector('.bar-track');
  const mark = track ? [...track.parentElement.children].find((e) => (e.getAttribute('style') || '').includes('position:absolute')) : null;
  return { spend: Math.round(t.spend), budget: Math.round(t.budget),
    breedte: fill ? fill.style.width : null, kleur: fill ? fill.style.background : null,
    markBuiten: !!mark && !track.contains(mark), markLinks: mark ? mark.style.left : null,
    streepTitle: mark ? mark.getAttribute('title') : null,     // v309: de streep draagt zijn eigen uitleg
    tekst: d.innerText.replace(/\s+/g, ' ') };
});

test.describe('a · de budgetbalk kent drie standen', () => {
  /* v359: 'de dagstreep blijft' is vervallen: de budgetbalk stond op de stand-kaart van Inzichten, en die is vervallen */
});

test.describe('b · de plan-balk: stilstand is grijs, beweging krijgt een segment', () => {
  const doelen = {
    set: { goals: [{ id: 'a', naam: 'Krijgt', doel: 3000, gespaard: 600, allocMode: 'fixed', perMaand: 300 },
                   { id: 'b', naam: 'Wacht', doel: 3000, gespaard: 300, allocMode: 'fixed', perMaand: 300 },
                   { id: 'c', naam: 'Pauze', doel: 3000, gespaard: 150, allocMode: 'fixed', perMaand: 300 }],
      planOrder: ['a', 'b', 'c', 'noodfonds'],
      planPaused: { noodfonds: true, c: true }, savingAmount: 300 } };

  /* v318: de vulling zit in het VAT en niet meer in een liggende balk, dus de lagen staan in
     `.wf-kol .wf-vat i` en hun maat is een HOOGTE. De eigenschap is onveranderd: één laag bij
     stilstand, twee zodra er deze maand iets bij komt, en de kleur uit planTint(). */
  const rijen = (page) => page.evaluate(() => {
    const P = allocatePlan();
    const d = document.createElement('div'); d.innerHTML = renderPlan(true);
    /* v367: een rij per bestemming; de vulling en het groei-segment staan in zijn dunne balk */
    return [...d.querySelectorAll('.plan-item[data-id]')].map((el) => {
      const f = el.querySelectorAll('.plan-rijbalk > .bar-fill');
      const p = P.find((x) => x.id === el.dataset.id) || {};
      return { id: el.dataset.id, status: p.status, alloc: p.alloc,
        kleur: f[0] ? f[0].style.background : null, segmenten: f.length };
    });
  });

  test('een doel dat geld krijgt: teal met een tweede segment', async ({ page }) => {
    await boot(page, doelen);
    const r = (await rijen(page)).find((x) => x.id === 'a');
    expect(r.alloc).toBeGreaterThan(0);
    expect(r.kleur).toContain('--teal');
    expect(r.segmenten).toBe(2);                       // stand plus wat er deze maand bij komt
  });

  test('wacht op capaciteit: grijs en geen segment, net als gepauzeerd', async ({ page }) => {
    await boot(page, doelen);
    const R = await rijen(page);
    const wacht = R.find((x) => x.id === 'b'), pauze = R.find((x) => x.id === 'c');
    expect(wacht.status).toBe('wacht op capaciteit');
    expect(wacht.alloc).toBe(0);
    expect(wacht.kleur).toContain('--mut');
    expect(wacht.segmenten).toBe(1);
    // en het is exact hetzelfde beeld als gepauzeerd: in beide gevallen komt er niets bij
    expect(pauze.kleur).toBe(wacht.kleur);
    expect(pauze.segmenten).toBe(wacht.segmenten);
  });

  test('de drie doelen zien er niet meer identiek uit', async ({ page }) => {
    await boot(page, doelen);
    const R = await rijen(page);
    const krijgt = R.find((x) => x.id === 'a');
    expect(new Set(R.map((x) => x.kleur + '|' + x.segmenten)).size).toBeGreaterThan(1);
    expect(krijgt.kleur).not.toBe(R.find((x) => x.id === 'b').kleur);
  });

  test('een aflos-item rekent zijn segment met alloc plus je termijn', async ({ page }) => {
    await boot(page, { set: {
      debts: [{ id: 'd1', naam: 'Creditcard', type: 'lening', rest: 3000, start: 6000, perMaand: 100, rente: 8 }],
      goals: [], planOrder: ['af:d1', 'noodfonds'], planPaused: { noodfonds: true }, savingAmount: 300 } });
    const r = await page.evaluate(() => {
      const p = allocatePlan().find((x) => x.type === 'aflossen');
      const d = document.createElement('div'); d.innerHTML = renderPlan(true);
      /* v246 zette het segment in de hoogte, want het vat vulde van onderaf; v248 legde de balk en
         maakte het weer de breedte; v318 zet de vaten naast elkaar en dan is het opnieuw de hoogte.
         De eigenschap is door alle drie onveranderd: het segment is alloc plus je bestaande termijn,
         hetzelfde bedrag dat de regel eronder noemt. */
      const f = d.querySelector('.plan-item[data-id="af:d1"] .plan-rijbalk > .bar-fill[data-groei]');   // v367: de rij
      return { alloc: p.alloc, debtPer: p.debtPer, doel: p.doel, gespaard: p.gespaard,
        breedte: f ? parseFloat(f.style.width) : null };
    });
    const verwacht = Math.min((r.alloc + r.debtPer) / r.doel * 100,
      100 - Math.min(Math.round(r.gespaard / r.doel * 100), 100));
    expect(r.breedte).toBeCloseTo(verwacht, 1);        // hetzelfde bedrag dat de regel eronder noemt
  });
});

test.describe('c · de staafgrafiek plot alleen afgeronde maanden', () => {
  const opMaand = async (page, o) => { await boot(page, o);
    await page.evaluate(() => { SET.openSpendChart = true; save(); }); };

  /* v359: 'de drempel is één constante' is vervallen: de maandgrafiek toont sinds v359 de laatste drie (of twaalf) afgesloten maanden plus de lopende, lichter en met t/m <dag>, met het bedrag in de balk en een budgetlabel; inzichten-dashboard.spec.js draagt dat */
});

test.describe('d · de budgetlijn en de legenda', () => {
  const opMaand = async (page, o) => { await boot(page, o);
    await page.evaluate(() => { SET.openSpendChart = true; save(); }); };

  /* v359: 'een maand zonder budget: geen lijn' is vervallen: de maandgrafiek toont sinds v359 de laatste drie (of twaalf) afgesloten maanden plus de lopende, lichter en met t/m <dag>, met het bedrag in de balk en een budgetlabel; inzichten-dashboard.spec.js draagt dat */
});

test.describe('e · de sparkline onder de drempel', () => {
  const tegel = (page, m) => page.evaluate((mm) => {
    const K = insKpis(mm || kijkMaand());
    const items = K.items.filter((k) => ['budget', 'vari'].includes(k.key));
    const d = document.createElement('div'); d.innerHTML = kpiTegels(items);
    return items.map((k, i) => {
      const el = d.querySelectorAll('.wvo-tile')[i];
      return { key: k.key, val: k.val, klein: k.klein, volle: kpiVolleMaanden(k),
        lijn: !!el.querySelector('.spk-in'), tekst: el.innerText.replace(/\s+/g, ' ') };
    });
  }, m);

  test('drie maanden: geen lijn, wel de vorige waarde en vanaf wanneer', async ({ page }) => {
    await boot(page, { maanden: 3 });
    const r = await tegel(page);
    for (const k of r) {
      expect(k.volle, k.key).toBeLessThan(6);
      expect(k.lijn, k.key).toBe(false);
      expect(k.tekst).toMatch(/vorige maand \d+%|Een verloop zie je vanaf/);
      expect(k.tekst).toContain('verloop vanaf 6');
    }
  });

  test('zes volle maanden: de lijn verschijnt en de delta-zin verdwijnt', async ({ page }) => {
    await boot(page, { maanden: 7 });
    const r = await tegel(page);
    for (const k of r) {
      expect(k.volle, k.key).toBeGreaterThanOrEqual(6);
      expect(k.lijn, k.key).toBe(true);
      expect(k.tekst).not.toContain('verloop vanaf');
    }
  });

  test('de lopende maand telt niet mee als volle maand', async ({ page }) => {
    await boot(page, { maanden: 7 });
    const r = await page.evaluate(() => {
      const k = insKpis(kijkMaand()).items.find((x) => x.key === 'budget');
      return { punten: k.series.filter((x) => x != null).length, volle: kpiVolleMaanden(k), partial: k.partial };
    });
    expect(r.partial).toBe(true);
    expect(r.volle).toBe(r.punten - 1);
  });
});

test.describe('f · een te klein grondtal krijgt geen lijn', () => {
  test('bedrag in de tegel en procenten in de lijn kan niet samen', async ({ page }) => {
    // veel historie, dus de drempel is geen reden om te zwijgen; het grondtal wel
    await boot(page, { maanden: 10, nu: 0, set: { budgets: { boodschappen: 500 } } });
    const r = await page.evaluate(() => {
      const echt = splitFixedVar;
      window.splitFixedVar = (mm) => Object.assign({}, echt(mm), { vari: 20 });
      const k = insKpis(kijkMaand()).items.find((x) => x.key === 'vari');
      const d = document.createElement('div'); d.innerHTML = kpiTegels([k]);
      window.splitFixedVar = echt;
      return { klein: k.klein, val: k.val, volle: kpiVolleMaanden(k),
        lijn: !!d.querySelector('.spk-in'), tekst: d.innerText.replace(/\s+/g, ' ') };
    });
    expect(r.klein).toBe(true);
    expect(r.val).toMatch(/^€/);                   // een bedrag, geen percentage
    expect(r.volle).toBeGreaterThanOrEqual(6);          // dus niet de drempel houdt hem tegen
    expect(r.lijn).toBe(false);
    expect(r.tekst).not.toMatch(/vorige maand \d+%/);   // en ook geen delta in procenten
    expect(r.tekst).toContain('te klein voor een percentage');
  });
});

test.describe('g · layout', () => {
  for (const w of [360, 390]) {
    test(`de balk, de grafiek en de tegels passen op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page, { maanden: 14, nu: 876, set: { budgets: { huur: 900, boodschappen: 300 } } });
      await page.evaluate(() => { SET.openSpendChart = true; save(); go('ins'); });
      await page.waitForSelector('#s-ins .card');
      /* v227: de grafiek staat op Inzichten, onder het blok over deze maand. Beide schermen worden
         nog op overflow gemeten, alleen staat de grafiek nu in het eerste. */
      const ins = await page.evaluate(() => {
        const el = document.getElementById('s-ins');
        return { over: el.scrollWidth - el.clientWidth, grafiek: !!el.querySelector('#insSpendChart') };
      });
      expect(ins.over, `${w}px inzichten`).toBe(0);
      expect(ins.grafiek).toBe(true);
      await page.evaluate(() => go('maand'));
      await page.waitForSelector('#s-maand .card');
      const maand = await page.evaluate(() => {
        const el = document.getElementById('s-maand');
        return { over: el.scrollWidth - el.clientWidth, grafiek: !!el.querySelector('#insSpendChart') };
      });
      expect(maand.over, `${w}px maand`).toBe(0);
      expect(maand.grafiek).toBe(false);
    });
  }
});
