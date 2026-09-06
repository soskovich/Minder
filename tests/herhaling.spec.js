// v193: de herhalingsgroep. Dezelfde mededeling stond meerdere keren op een scherm, of een regel
// liet weg wat hem leesbaar maakt. De twee dingen die een getal leesbaar maken zijn de eenheid en
// het referentiepunt; die mogen nooit sneuvelen om compact te blijven.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const RES = 'NL01RESE0000009999';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

function seed(o = {}) {
  const n = o.maanden || 4;
  const MS = []; for (let k = n - 1; k >= 0; k--) MS.push(ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
  const tx = []; let i = 0;
  const add = (m, d, a, acc, naam, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc, name: naam, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m, idx) => {
    const nu = idx === MS.length - 1;
    add(m, '25', 3000, MAIN, 'Werkgever', 'SALARIS LOON');
    if (!(nu && o.geenUitgaven)) {
      add(m, '02', -900, MAIN, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
      add(m, '05', -400, MAIN, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    }
    if (!(nu && o.geenUitgaven)) add(m, '16', -10, RES, 'Reserve', 'RESERVERING');
  });
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 6000, [RES]: 250 }, savingMode: 'amount', savingAmount: 300,
    budgets: { huur: 900, boodschappen: 500, uiteten: 200 },
    resAcc: RES, reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 300, interval: 12, offset: 6 }],
    goals: [], planOrder: [] }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, o) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof allocatePlan === 'function');
}
// Een auto-doel bovenaan slokt de hele capaciteit op; de doelen eronder wachten dan.
const metWachtenden = (aantal) => {
  const goals = [{ id: 'top', naam: 'Vakantie', doel: 9000, gespaard: 0, allocMode: 'auto' }];
  for (let k = 0; k < aantal; k++) goals.push({ id: 'w' + k, naam: 'Doel ' + (k + 1), doel: 900,
    gespaard: 0, allocMode: 'fixed', perMaand: 100 });
  return { set: { goals, planOrder: goals.map((g) => g.id).concat(['noodfonds']),
    planPaused: { noodfonds: true } } };
};
const planHtml = (page) => page.evaluate(() => renderPlan(true));

test.describe('a · de wachtuitleg staat er precies één keer', () => {
  for (const n of [0, 1, 2, 3]) {
    test(`${n} wachtende ${n === 1 ? 'doel' : 'doelen'}: hoogstens één regel`, async ({ page }) => {
      await boot(page, metWachtenden(n));
      const r = await page.evaluate(() => {
        const P = allocatePlan();
        const d = document.createElement('div'); d.innerHTML = renderPlan(true);
        const regels = [...d.querySelectorAll('#planWacht')];
        return { wachtend: P.filter((p) => p.status === 'wacht op capaciteit').length,
          regels: regels.length, tekst: regels.map((x) => x.innerText.replace(/\s+/g, ' ')),
          tikken: d.querySelectorAll('#planWacht [onclick]').length,
          hints: d.querySelectorAll('.plan-hint').length };
      });
      expect(r.wachtend).toBe(n);
      expect(r.hints).toBe(0);                       // de oude per-doel-hint bestaat niet meer
      expect(r.regels).toBe(n > 0 ? 1 : 0);          // nooit twee keer dezelfde alinea
      if (n > 0) {
        expect(r.tekst[0]).toContain('Vakantie');    // welk doel het opslokt
        expect(r.tekst[0]).toContain(n === 1 ? '1 doel' : `${n} doelen`);
        expect(r.tikken).toBe(1);                    // en één tik naar die invoer
      }
    });
  }

  test('de regel telt in enkelvoud en meervoud mee', async ({ page }) => {
    await boot(page, metWachtenden(1));
    const een = (await planHtml(page)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    expect(een).toMatch(/1 doel eronder wacht\b/);
    await boot(page, metWachtenden(2));
    const twee = (await planHtml(page)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    expect(twee).toMatch(/2 doelen eronder wachten\b/);
  });
});

test.describe('b · waarschuwing en wachtuitleg zijn één regel', () => {
  test('overtoewijzing zonder blokkeerder: amber, en maar één regel', async ({ page }) => {
    await boot(page, { set: {
      goals: [{ id: 'a', naam: 'A', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 250 },
              { id: 'b', naam: 'B', doel: 9000, gespaard: 0, allocMode: 'pct', pct: 60 }],
      planOrder: ['a', 'b', 'noodfonds'], planPaused: { noodfonds: true } } });
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = renderPlan(true);
      const el = d.querySelector('#planWacht');
      return { warn: !!planAllocWarning(), n: d.querySelectorAll('#planWacht').length,
        oud: d.querySelectorAll('#planWarn, .plan-hint').length,
        amber: /amber/.test((el || {}).outerHTML || ''), tekst: (el || {}).innerText || '' };
    });
    expect(r.warn).toBe(true);
    expect(r.n).toBe(1);
    expect(r.oud).toBe(0);
    expect(r.amber).toBe(true);                      // een echte aandachtsstand (v78/v93)
    expect(r.tekst).toMatch(/wachten dan op capaciteit|tellen op tot/);
  });

  test('alleen de auto-werking: neutraal, geen amber', async ({ page }) => {
    await boot(page, metWachtenden(2));
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = renderPlan(true);
      const el = d.querySelector('#planWacht');
      return { warn: !!planAllocWarning(), amber: /amber|251,191,36/.test(el.outerHTML) };
    });
    expect(r.warn).toBe(false);                      // een auto-doel claimt niets
    expect(r.amber).toBe(false);                     // dus er is niets mis, alleen iets uit te leggen
  });

  test('niets aan de hand: geen regel, geen lege staat', async ({ page }) => {
    await boot(page, { set: {
      goals: [{ id: 'a', naam: 'A', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 100 }],
      planOrder: ['a', 'noodfonds'], planPaused: { noodfonds: true } } });
    const n = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = renderPlan(true);
      return d.querySelectorAll('#planWacht, #planWarn, .plan-hint').length;
    });
    expect(n).toBe(0);
  });
});

test.describe('c · vanaf vier waarden een uitgelijnde tabel', () => {
  test('een aflosdoel met vijf waarden krijgt de tabel, niet de zin', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      const p = { type: 'aflossen', naam: 'Creditcard', rest: 9000, rente: 0, debtPer: 100,
        alloc: 300, extra: 50, mode: 'pct', pct: 40, eta: 20, status: 'loopt' };
      const d = document.createElement('div'); d.innerHTML = planSub(p);
      const tab = d.querySelector('.plan-tab');
      return { tab: !!tab, labels: tab ? [...tab.children].filter((_, i) => i % 2 === 0).map((x) => x.textContent) : [],
        waarden: tab ? [...tab.children].filter((_, i) => i % 2 === 1).map((x) => x.textContent) : [] };
    });
    expect(r.tab).toBe(true);
    expect(r.labels).toEqual(['Per maand', 'waarvan je termijn', 'waarvan doorgezakt', 'Aandeel', 'Klaar']);
    expect(r.waarden[0]).toBe('€400');            // alloc + termijn, zoals v190 vastlegde
    expect(r.waarden[1]).toBe('€100');
    expect(r.waarden[2]).toBe('€50');
    expect(r.waarden[3]).toMatch(/^40% van je /);
    expect(r.waarden[4]).toMatch(/^op dit tempo rond /);
  });

  test('drie waarden blijven een zin', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      const p = { type: 'goal', alloc: 200, mode: 'fixed', perMaand: 200, extra: 0, eta: 5, status: 'loopt' };
      return { html: planSub(p), tab: /plan-tab/.test(planSub(p)) };
    });
    expect(r.tab).toBe(false);
    expect(r.html).toContain('€200/mnd');
    expect(r.html).toContain('~5 maanden');
  });

  test('de tabel rekent niets: elke waarde staat ook in de zinvorm', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      const p = { type: 'aflossen', rest: 9000, rente: 0, debtPer: 100, alloc: 300, extra: 50,
        mode: 'fixed', perMaand: 300, eta: 6, status: 'loopt' };
      const d = document.createElement('div'); d.innerHTML = planSub(p);   // 4 waarden -> tabel
      return { tab: !!d.querySelector('.plan-tab'), tekst: d.innerText.replace(/\s+/g, ' ') };
    });
    expect(r.tab).toBe(true);
    for (const v of ['€400', '€100', '€50', '~6 maanden']) expect(r.tekst).toContain(v);
  });
});

test.describe('d · de plan-zone en het voorbehoud', () => {
  test('de samenvatting is de kop, "Mijn plan" bestaat niet meer', async ({ page }) => {
    await boot(page, metWachtenden(2));
    await page.evaluate(() => go('vooruit'));
    const t = await page.locator('#s-vooruit [data-zone="vooruitDoelOpen"]').innerText();
    const rest = (await page.evaluate(() => planItems().length)) - 1;   // het noodfonds telt mee
    expect(t).not.toMatch(/mijn plan/i);
    expect(t).toContain('#1 Vakantie');
    expect(t).toContain(`+${rest} meer`);
  });

  test('zonder doelen zegt de kop dat', async ({ page }) => {
    await boot(page, { set: { goals: [], planOrder: [], planPaused: { noodfonds: true } } });
    await page.evaluate(() => go('vooruit'));
    const t = await page.locator('#s-vooruit [data-zone="vooruitDoelOpen"]').innerText();
    expect(t).not.toMatch(/mijn plan/i);
    expect(t.length).toBeGreaterThan(0);
  });

  test('een doelnaam met opmaak wordt geescapet', async ({ page }) => {
    await boot(page, { set: { goals: [{ id: 'x', naam: '<b>Stout</b>', doel: 900, gespaard: 0,
      allocMode: 'fixed', perMaand: 100 }], planOrder: ['x', 'noodfonds'], planPaused: { noodfonds: true } } });
    await page.evaluate(() => go('vooruit'));
    const bar = page.locator('#s-vooruit [data-zone="vooruitDoelOpen"]');
    expect(await bar.innerText()).toContain('<b>Stout</b>');
    expect(await bar.locator('b').count()).toBe(0);
  });

  test('het voorbehoud gaat over de getallen, niet over het scherm', async ({ page }) => {
    await boot(page, metWachtenden(1));
    await page.evaluate(() => go('vooruit'));
    const t = await page.locator('#s-vooruit .scr-foot').innerText();
    expect(t).toMatch(/looptijden en datums/i);
    expect(t).toMatch(/schatting, geen belofte/);
    expect(t).not.toMatch(/vooruitkijken/i);
  });
});

test.describe('e · de compacte maandrij houdt zijn eenheid', () => {
  test('elke "Staat goed"-rij draagt zijn eenheid, niet alleen het getal', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      const R = maandRegels().filter((x) => x.status === 'ok');
      const d = document.createElement('div');
      d.innerHTML = R.map((x) => maandRij(x, true)).join('');
      return { n: R.length, regels: R.map((x) => ({ waarde: x.waarde, eenheid: x.eenheid })),
        rijen: [...d.querySelectorAll('.row')].map((x) => x.innerText.replace(/\s+/g, ' ')) };
    });
    test.skip(!r.n, 'geen ok-regel in deze opzet');
    for (let i = 0; i < r.n; i++) {
      expect(r.rijen[i]).toContain(r.regels[i].waarde);
      expect(r.rijen[i]).toContain(r.regels[i].eenheid);   // de eenheid is wat de rij leesbaar maakt
    }
  });

  test('de compacte rij laat het gevolg weg, niet de eenheid', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      const x = maandRegels()[0];
      const mk = (c) => { const d = document.createElement('div'); d.innerHTML = maandRij(x, c);
        return d.innerText.replace(/\s+/g, ' '); };
      return { x, kort: mk(true), lang: mk(false) };
    });
    test.skip(!r.x, 'geen maandregel');
    expect(r.kort).toContain(r.x.eenheid);
    expect(r.lang).toContain(r.x.eenheid);
    if (r.x.gevolg) { expect(r.lang).toContain(r.x.gevolg); expect(r.kort).not.toContain(r.x.gevolg); }
  });
});

test.describe('f · de kerncijferkop telt wat er staat', () => {
  test('meerdere maanden: van maand op maand', async ({ page }) => {
    await boot(page, { maanden: 4 });
    const t = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = maandKpiBlok(kijkMaand());
      return d.innerText.replace(/\s+/g, ' ');
    });
    expect(t).toContain('van maand op maand');
  });

  test('een afgesloten maand houdt de kop, want de reeks loopt tot daar', async ({ page }) => {
    await boot(page, { maanden: 4 });
    const r = await page.evaluate(() => {
      const ms = months(); const eerder = ms[ms.length - 2];
      const d = document.createElement('div'); d.innerHTML = maandKpiBlok(eerder);
      const K = insKpis(eerder);
      return { tekst: d.innerText.replace(/\s+/g, ' '),
        punten: Math.max(0, ...K.items.filter((k) => ['inleg', 'vast'].includes(k.key))
          .map((k) => (k.series || []).filter((x) => x != null).length)) };
    });
    expect(r.punten).toBeGreaterThan(1);
    expect(r.tekst).toContain('van maand op maand');
  });

  test('één gemeten maand: geen belofte over verloop', async ({ page }) => {
    await boot(page, { maanden: 1 });
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = maandKpiBlok(kijkMaand());
      return d.innerText.replace(/\s+/g, ' ');
    });
    test.skip(!r, 'geen kerncijferblok in deze opzet');
    expect(r).not.toContain('van maand op maand');
    expect(r).toMatch(/nog geen verloop te zien/);
  });
});

test.describe('g · "Boven je inkomen-limiet" heeft een gevolg en een ingang', () => {
  const boven = { set: { budgets: { huur: 900, boodschappen: 700, uiteten: 400, shopping: 400 } } };

  test('de rij draagt een zin met richting en opent de potjes', async ({ page }) => {
    await boot(page, boven);
    const r = await page.evaluate(() => {
      const t = totals(kijkMaand());
      const d = document.createElement('div'); d.innerHTML = maandPlanRegels();
      const rij = [...d.querySelectorAll('[onclick]')].find((x) => /inkomen-limiet/.test(x.innerText));
      return { over: t.budget > t.limit, budget: Math.round(t.budget), limiet: Math.round(t.limit),
        tekst: rij ? rij.innerText.replace(/\s+/g, ' ') : null,
        act: rij ? rij.getAttribute('onclick') : null };
    });
    expect(r.over).toBe(true);
    expect(r.tekst).toContain(String(r.budget).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
    expect(r.tekst).toMatch(/spiegel, geen plafond/);
    expect(r.act).toMatch(/^openPotjesVerdeling\(/);      // een ingang, geen doodlopende regel
  });

  test('binnen de limiet staat de rij er niet', async ({ page }) => {
    await boot(page, { set: { budgets: { huur: 900, boodschappen: 300 } } });
    const t = await page.evaluate(() => maandPlanRegels());
    expect(t).not.toMatch(/inkomen-limiet/);
  });
});

test.describe('h · de coach-ingang noemt de naam, niet het oordeel', () => {
  test('de ingang herhaalt het oordeel van de kaartkop niet', async ({ page }) => {
    await boot(page, {});
    /* De regels komen hier met de hand: wat getoetst wordt is de formulering van de ingang, niet
       hoe maandRegels() tot een tekort komt. Dat laatste heeft zijn eigen spec. */
    const r = await page.evaluate(() => {
      const R = [{ key: 'dekking', naam: 'Dekking reserveringen', status: 'tekort', waarde: '€5',
                   eenheid: 'in je pot', gevolg: 'Je pot dekt de eerstvolgende post niet.',
                   act: 'openReserveringen()' },
                 { key: 'buffer', naam: 'Buffer in maanden', status: 'let op', waarde: '3,2',
                   eenheid: 'maanden op je rekening', gevolg: '', act: 'openNoodfondsPanel()' }];
      const z = coMaandZwaarste(R);
      const d = document.createElement('div'); d.innerHTML = maandCoachIngang(R);
      const el = d.querySelector('[onclick]');
      return { naam: z && z.naam, tekst: d.innerText.replace(/\s+/g, ' '),
        act: el ? el.getAttribute('onclick') : null };
    });
    expect(r.naam).toBe('Dekking reserveringen');          // de zwaarste van de twee
    expect(r.tekst).toContain('dekking reserveringen');     // de naam blijft: de vraag heeft een onderwerp
    expect(r.tekst).not.toMatch(/vraagt een beslissing|vraagt aandacht/);  // dat staat al in de kaartkop
    expect(r.act).toMatch(/^coStart\('maand'/);            // de fasering blijft ongemoeid
    expect(r.act).toContain("'dekking'");                  // en opent op die regel
  });

  test('de rij houdt zijn eigen tik naar zijn sheet', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => {
      const x = maandRegels()[0];
      const d = document.createElement('div'); d.innerHTML = maandRij(x, false);
      return { act: x && x.act, dom: (d.querySelector('[onclick]') || {}).getAttribute('onclick') };
    });
    test.skip(!r.act, 'geen maandregel');
    expect(r.dom).toBe(r.act);
    expect(r.dom).not.toMatch(/coStart/);                // een rij draagt nooit twee handelingen
  });
});

test.describe('i · het nulgeval van een kerncijfer', () => {
  test('grondtal €0: hero en tegel zeggen allebei 0%', async ({ page }) => {
    await boot(page, { geenUitgaven: true });
    const r = await page.evaluate(() => {
      const m = kijkMaand(); const t = totals(m);
      const b = insKpis(m).items.find((k) => k.key === 'budget');
      const d = document.createElement('div'); d.innerHTML = insBudgetBlok(m);
      return { spend: Math.round(t.spend), val: b.val, klein: b.klein, raw: b.raw,
        hero: d.innerText.replace(/\s+/g, ' ') };
    });
    expect(r.spend).toBe(0);
    expect(r.raw).toBe(0);
    expect(r.klein).toBe(false);                 // nul is een meting, geen ondergrens
    expect(r.val).toBe('0%');
    expect(r.hero).toContain('0%');
  });

  test('een klein maar niet-nul grondtal blijft het bedrag tonen', async ({ page }) => {
    await boot(page, {});
    const r = await page.evaluate(() => ({
      nul: pctZinvol(0), klein: pctZinvol(40), grens: pctZinvol(MAAND_DREMPEL.kpiMinBedrag),
      negatiefKlein: pctZinvol(-40), groot: pctZinvol(5000), onbekend: pctZinvol(null) }));
    expect(r.nul).toBe(true);
    expect(r.klein).toBe(false);
    expect(r.negatiefKlein).toBe(false);         // de -1% uit v161 blijft afgevangen
    expect(r.grens).toBe(true);
    expect(r.groot).toBe(true);
    expect(r.onbekend).toBe(false);              // onbekend is een andere zaak (v163)
  });
});

test.describe('j · de beleggen-regel somt op zoals de rest', () => {
  test('meerdere ontbrekende bronnen: kommas en een "en", met meervoud', async ({ page }) => {
    // zonder spaarrekening en zonder streefdatum ontbreken buffer en doel allebei; het spaardoel
    // maakt de regel zichtbaar (beleggenZichtbaar)
    await boot(page, { set: { goals: [{ id: 'g', naam: 'Vakantie', doel: 3000, gespaard: 0,
      allocMode: 'fixed', perMaand: 100 }], planOrder: ['g', 'noodfonds'] } });
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = maandBeleggenRegel(maandRegels());
      return d.innerText.replace(/\s+/g, ' ');
    });
    test.skip(!/Niet te beoordelen/.test(r), 'alle bronnen aanwezig in deze opzet');
    expect(r).not.toMatch(/ en .* en /);         // geen 'a en b en c'
    if (/,/.test(r)) expect(r).toMatch(/, .* en /);
    const n = r.replace(/^.*zolang /, '').replace(/ ontbre.*$/, '').split(/, | en /).length;
    expect(r).toMatch(n > 1 ? /ontbreken\./ : /ontbreekt\./);
  });
});

test.describe('k · layout op smalle schermen', () => {
  for (const w of [360, 390]) {
    test(`de minitabel en de compacte rij passen op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page, { set: {
        goals: [{ id: 'g', naam: 'Vakantie', doel: 9000, gespaard: 0, allocMode: 'pct', pct: 40 }],
        debts: [{ id: 'd1', naam: 'Creditcard', type: 'lening', rest: 9000, start: 9000, perMaand: 100, rente: 12 }],
        planOrder: ['af:d1', 'g', 'noodfonds'], vooruitDoelOpen: true } });
      await page.evaluate(() => go('vooruit'));
      await page.waitForSelector('#s-vooruit .plan-item');
      const plan = await page.evaluate(() => {
        const el = document.getElementById('s-vooruit');
        const buiten = [...el.querySelectorAll('.plan-tab .v')]
          .filter((x) => x.scrollWidth > x.clientWidth + 1).length;
        return { over: el.scrollWidth - el.clientWidth, buiten,
          tabellen: el.querySelectorAll('.plan-tab').length };
      });
      expect(plan.over, `${w}px plan`).toBe(0);
      expect(plan.buiten, `${w}px afgekapte waarde`).toBe(0);

      await page.evaluate(() => go('maand'));
      await page.waitForSelector('#s-maand .card');
      const maand = await page.evaluate(() => {
        const el = document.getElementById('s-maand');
        return { over: el.scrollWidth - el.clientWidth,
          buiten: [...el.querySelectorAll('.row')]
            .filter((x) => x.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).length };
      });
      expect(maand.over, `${w}px maand`).toBe(0);
      expect(maand.buiten, `${w}px rijen`).toBe(0);
    });
  }
});
