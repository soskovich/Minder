// v194: de grafiekgroep. De toets bij elke vorm: welke beslissing verandert door de vorm van deze
// lijn of balk. Is het antwoord geen, dan verdwijnt de vorm en komt er een getal met delta voor
// terug, niet een kleinere versie van dezelfde vorm.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

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
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 6000 }, savingMode: 'amount', savingAmount: 300,
    budgets: { huur: 900, boodschappen: 500 }, goals: [], planOrder: [] }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
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
    tekst: d.innerText.replace(/\s+/g, ' ') };
});

test.describe('a · de budgetbalk kent drie standen', () => {
  test('ruim eronder: accent, geen drempelzin', async ({ page }) => {
    await boot(page, { nu: 60 });                      // 960 van 1400 = 69%
    const b = await balk(page);
    expect(b.spend).toBeLessThan(b.budget);
    expect(b.kleur).toContain('--accent');
    expect(b.tekst).not.toMatch(/over je potjes|precies op/);
  });

  test('precies op de grens: een eigen stand, niet dezelfde als eronder', async ({ page }) => {
    // huur 900 wordt ook deze maand geboekt, dus hij hoort in het budget: 900+300 uit, 1200 potje
    await boot(page, { set: { budgets: { huur: 900, boodschappen: 300 } } });
    const b = await balk(page);
    expect(b.spend).toBe(b.budget);
    expect(b.kleur).toContain('--amber');               // niet het accent van 'ruim eronder'
    expect(b.kleur).not.toContain('--red');             // en niet het rood van 'eroverheen'
    expect(b.breedte).toBe('100%');
    expect(b.tekst).toMatch(/Je potjes zijn precies op, met nog \d+ dagen te gaan/);
  });

  test('ruim eroverheen: de balk klemt, de drempelzin draagt het bedrag en de tijd', async ({ page }) => {
    await boot(page, { nu: 876, set: { budgets: { huur: 900, boodschappen: 300 } } });   // 1776 van 1200 = 148%
    const b = await balk(page);
    expect(Math.round(b.spend / b.budget * 100)).toBe(148);
    expect(b.spend).toBeGreaterThan(b.budget);
    expect(b.kleur).toContain('--red');
    expect(b.breedte).toBe('100%');                     // de norm blijft op 100, de as beweegt niet
    const over = await page.evaluate((n) => euro0(n), b.spend - b.budget);
    expect(b.tekst).toContain(`${over} over je potjes`);
    expect(b.tekst).toMatch(/over je potjes, met nog \d+ dagen te gaan/);
  });

  test('de grens staat in de drempelconstante, niet inline', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => ({ grens: MAAND_DREMPEL.budgetVol,
      src: insBudgetBlok.toString().replace(/\/\*[\s\S]*?\*\//g, '') }));
    expect(r.grens).toBe(100);
    expect(r.src).toContain('MAAND_DREMPEL.budgetVol');
  });

  test('de dagstreep blijft, en staat buiten de vulling', async ({ page }) => {
    for (const nu of [60, 444]) {                      // eronder en eroverheen
      await boot(page, { nu, set: { budgets: { huur: 900, boodschappen: 300 } } });
      const b = await balk(page);
      const d = await page.evaluate((m) => daysElapsed(m), CUR);
      expect(b.markBuiten, `bij ${nu}`).toBe(true);
      expect(b.markLinks).toBe(Math.round(d.elapsed / d.dim * 100) + '%');
      expect(b.tekst).toMatch(/de streep staat waar de maand nu is/);
    }
  });
});

test.describe('b · de plan-balk: stilstand is grijs, beweging krijgt een segment', () => {
  const doelen = {
    set: { goals: [{ id: 'a', naam: 'Krijgt', doel: 3000, gespaard: 600, allocMode: 'fixed', perMaand: 300 },
                   { id: 'b', naam: 'Wacht', doel: 3000, gespaard: 300, allocMode: 'fixed', perMaand: 300 },
                   { id: 'c', naam: 'Pauze', doel: 3000, gespaard: 150, allocMode: 'fixed', perMaand: 300 }],
      planOrder: ['a', 'b', 'c', 'noodfonds'],
      planPaused: { noodfonds: true, c: true }, savingAmount: 300 } };

  const rijen = (page) => page.evaluate(() => {
    const P = allocatePlan();
    const d = document.createElement('div'); d.innerHTML = renderPlan(true);
    return [...d.querySelectorAll('.plan-item')].map((el) => {
      const f = el.querySelectorAll('.bar-fill');
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
      const f = d.querySelector('.plan-item[data-id="af:d1"] .bar-fill:nth-child(2)');
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

  test('drie maanden: geen grafiek, wel een lege staat die zegt vanaf wanneer', async ({ page }) => {
    await opMaand(page, { maanden: 3 });
    const r = await page.evaluate(() => ({ min: GRAFIEK_MIN, html: spendVsBudgetChart(),
      afgerond: months().filter((m) => m < thisYM()).length }));
    expect(r.afgerond).toBe(2);
    expect(r.html).not.toContain('id="insSpendChart"');   // het icoon in de kop is ook een <svg>
    expect(r.html).toContain(`Vanaf ${r.min} afgeronde maanden`);
    expect(r.html).toContain('Je hebt er nu 2');
  });

  test('zes afgeronde maanden: de grafiek verschijnt, zonder de lopende maand', async ({ page }) => {
    await opMaand(page, { maanden: 7 });
    const r = await page.evaluate(() => {
      const html = spendVsBudgetChart();
      return { afgerond: months().filter((m) => m < thisYM()).length, html,
        staven: (html.match(/<rect class="cbar"/g) || []).length,
        nuLabel: MNAMES[+thisYM().slice(5, 7) - 1] };
    });
    expect(r.afgerond).toBe(6);
    expect(r.staven).toBe(6);
    expect(r.html).not.toContain('*<');                // geen sterretje
    expect(r.html).not.toContain('loopt nog');         // geen voetnoot
    expect(r.html).not.toContain(`>${r.nuLabel}<`);    // de lopende maand staat er niet in
  });

  test('twaalf afgeronde maanden: elke staaf een waardelabel', async ({ page }) => {
    await opMaand(page, { maanden: 14 });
    const r = await page.evaluate(() => {
      const html = spendVsBudgetChart();
      const d = document.createElement('div'); d.innerHTML = html;
      const svg = d.querySelector('#insSpendChart');       // niet het icoon in de kop
      return { staven: svg.querySelectorAll('rect.cbar').length,
        labels: [...svg.querySelectorAll('text[font-weight="700"]')].map((x) => x.textContent) };
    });
    expect(r.staven).toBe(12);                         // slice(-12)
    expect(r.labels.filter((t) => !/budget/.test(t)).length).toBe(12);
  });

  test('de drempel is één constante, gedeeld met de sparklines', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => ({ min: GRAFIEK_MIN,
      chart: spendVsBudgetChart.toString().replace(/\/\*[\s\S]*?\*\//g, ''),
      tegel: kpiTegels.toString().replace(/\/\*[\s\S]*?\*\//g, '') }));
    expect(r.min).toBe(6);
    expect(r.chart).toContain('GRAFIEK_MIN');
    expect(r.tegel).toContain('GRAFIEK_MIN');
  });
});

test.describe('d · de budgetlijn en de legenda', () => {
  const opMaand = async (page, o) => { await boot(page, o);
    await page.evaluate(() => { SET.openSpendChart = true; save(); }); };

  test('gelijke budgetten: segmenten, geen tag erbovenop', async ({ page }) => {
    await opMaand(page, { maanden: 8 });
    const html = await page.evaluate(() => spendVsBudgetChart());
    expect(html).toContain('stroke-dasharray="4 3"');     // de segmenten blijven
    expect(html).not.toContain('budget €');          // de tag zegt niets extra's
  });

  test('de legenda telt de coderingen die er staan', async ({ page }) => {
    await opMaand(page, { maanden: 8 });
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = spendVsBudgetChart();
      return { items: [...d.querySelectorAll('.gc-leg span')].map((x) => x.textContent),
        lijnen: d.querySelectorAll('line[stroke-dasharray="4 3"]').length,
        kleuren: new Set([...d.querySelectorAll('rect.cbar')].map((x) => x.getAttribute('fill'))).size };
    });
    expect(r.items).toEqual(['per maand', 'maandbudget']);   // geen 'deze maand' meer
    expect(r.items.length).toBe(r.kleuren + (r.lijnen > 0 ? 1 : 0));
  });

  test('een maand zonder budget: geen lijn, en de legenda noemt hem niet', async ({ page }) => {
    await opMaand(page, { maanden: 8, set: { budgets: {}, budgetsNext: {}, limit: 0, limitMode: 'pct' } });
    const r = await page.evaluate(() => {
      const html = spendVsBudgetChart();
      const d = document.createElement('div'); d.innerHTML = html;
      return { budget: months().filter((m) => m < thisYM()).map((m) => Math.round(totals(m).budget)),
        lijnen: d.querySelectorAll('line[stroke-dasharray="4 3"]').length,
        items: [...d.querySelectorAll('.gc-leg span')].map((x) => x.textContent) };
    });
    test.skip(r.budget.some((b) => b > 0), 'deze opzet houdt toch een budget');
    expect(r.lijnen).toBe(0);
    expect(r.items).toEqual(['per maand']);              // geen belofte over een vorm die er niet is
  });
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
      const ins = await page.evaluate(() => {
        const el = document.getElementById('s-ins');
        return el.scrollWidth - el.clientWidth;
      });
      expect(ins, `${w}px inzichten`).toBe(0);
      await page.evaluate(() => go('maand'));
      await page.waitForSelector('#s-maand .card');
      const maand = await page.evaluate(() => {
        const el = document.getElementById('s-maand');
        const svg = el.querySelector('#insSpendChart');
        return { over: el.scrollWidth - el.clientWidth, grafiek: !!svg };
      });
      expect(maand.over, `${w}px maand`).toBe(0);
      expect(maand.grafiek).toBe(true);
    });
  }
});
