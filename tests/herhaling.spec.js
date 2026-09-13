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

/* v225: de wachtuitleg was een alinea op planniveau, met een tik naar de invoer van het doel dat
   alles opslokt. Plan toont de waterval nu als vorm, en dan hoeft niemand meer uit te leggen dat
   het van boven naar beneden gaat: elke wachtende rij noemt zelf op welke bestemming hij wacht, en
   die bestemming staat als rij direct erboven. De eis die v193 stelde blijft onverkort gelden en
   wordt hier scherper: geen alinea, en geen herhaalde tik. Wat mag herhalen is de status van een
   rij, want die gaat over die rij - net als 'Gepauzeerd' dat altijd al deed. */
test.describe('a · de wachtuitleg is vervallen; de rij noemt zijn blokkeerder', () => {
  for (const n of [0, 1, 2, 3]) {
    test(`${n} wachtende ${n === 1 ? 'doel' : 'doelen'}: geen alinea, wel een naam per rij`, async ({ page }) => {
      await boot(page, metWachtenden(n));
      const r = await page.evaluate(() => {
        const P = allocatePlan();
        const d = document.createElement('div'); d.innerHTML = renderPlan(true);
        const rijen = [...d.querySelectorAll('.plan-item')].map((x) => x.innerText.replace(/\s+/g, ' '));
        return { wachtend: P.filter((p) => p.status === 'wacht op capaciteit').length,
          regels: d.querySelectorAll('#planWacht').length,
          hints: d.querySelectorAll('.plan-hint').length,
          noemt: rijen.filter((t) => /Wacht op .Vakantie./.test(t)).length };
      });
      expect(r.wachtend).toBe(n);
      expect(r.hints).toBe(0);                       // de oude per-doel-hint bestaat niet meer
      expect(r.regels).toBe(0);                      // en de alinea op planniveau evenmin
      expect(r.noemt).toBe(n);                       // elke wachtende rij noemt de blokkeerder
    });
  }

  test('de rij noemt waarop hij wacht, en nooit wanneer hij aan de beurt is', async ({ page }) => {
    await boot(page, metWachtenden(2));
    const t = (await planHtml(page)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    expect(t).not.toMatch(/doelen eronder wachten/);
    expect(t).not.toMatch(/maandbedrag instellen/);
    /* geen datum bij een wachtend doel: wanneer het aan de beurt komt hangt af van keuzes die nog
       niet gemaakt zijn, en een maand-en-jaar zou daar een precisie aan geven die er niet is */
    const wacht = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = renderPlan(true);
      return [...d.querySelectorAll('.plan-item')].map((x) => x.innerText)
        .filter((x) => /Wacht op/.test(x));
    });
    expect(wacht.length).toBe(2);
    for (const w of wacht) expect(w).not.toMatch(/rond \w+ \d{4}|20\d\d/);
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

  /* v225: bij alleen de auto-werking stond hier een neutrale regel die uitlegde hoe auto werkt.
     Die is vervallen; er is niets mis, dus is er ook niets te melden. De eigenschap die deze test
     bewaakt blijft: de amber-stand is voorbehouden aan een echte overtoewijzing (v78/v93). */
  test('alleen de auto-werking: geen melding, en zeker geen amber', async ({ page }) => {
    await boot(page, metWachtenden(2));
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = renderPlan(true);
      return { warn: !!planAllocWarning(), n: d.querySelectorAll('#planWacht').length,
        amber: /amber|251,191,36/.test(d.innerHTML) };
    });
    expect(r.warn).toBe(false);                      // een auto-doel claimt niets
    expect(r.n).toBe(0);
    expect(r.amber).toBe(false);
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
  /* v225: de zonebalk droeg een samenvatting van de lijst ('#1 Vakantie · +3 meer'). De kaart
     eronder toont die volgorde nu zelf, genummerd, dus de balk zou hem herhalen. Wat blijft: de
     balk draagt niet de naam van de tab, en de nummering staat ergens op het scherm. */
  test('de zone heet Bestemmingen en herhaalt de lijst niet', async ({ page }) => {
    await boot(page, metWachtenden(2));
    await page.evaluate(() => go('vooruit'));
    const t = await page.locator('#s-vooruit [data-zone="vooruitDoelOpen"]').innerText();
    expect(t).not.toMatch(/mijn plan/i);
    expect(t).toContain('Bestemmingen');
    expect(t).not.toContain('Vakantie');
    expect(t).not.toMatch(/\+\d+ meer/);
    const rij = await page.locator('#s-vooruit .plan-item').first().innerText();
    expect(rij).toMatch(/^1\s/);
    expect(rij).toContain('Vakantie');
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
    // v225: de doelnaam stond in de zonebalk; hij staat nu in de rij, en daar geldt dezelfde eis
    const rij = page.locator('#s-vooruit .plan-item[data-id="x"]');
    expect(await rij.innerText()).toContain('<b>Stout</b>');
    expect(await rij.locator('b:has-text("Stout")').count()).toBe(0);
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

/* v223: deze drie bewaakten de ondertitel boven het kerncijfer ('van maand op maand' tegenover
   'nog geen verloop te zien'). Die ondertitel is vervallen met de kaartschil, maar de eigenschap
   die hij droeg niet: het blok mag geen verloop beloven dat er niet is. Die uitspraak staat nu in
   de tegel zelf, in de deltazin. De tests wijzen daarheen; de eis is dezelfde. */
test.describe('f · het kerncijfer belooft geen verloop dat er niet is', () => {
  test('meerdere maanden: het noemt de vorige maand', async ({ page }) => {
    await boot(page, { maanden: 4 });
    const t = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = maandKpiBlok(kijkMaand());
      return d.innerText.replace(/\s+/g, ' ');
    });
    expect(t).toMatch(/vorige maand/);
    expect(t).not.toMatch(/nog geen verloop|vanaf \d+ afgeronde maanden/);
  });

  test('een afgesloten maand ook, want de reeks loopt tot daar', async ({ page }) => {
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
    expect(r.tekst).toMatch(/vorige maand/);
  });

  test('één gemeten maand: geen belofte over verloop', async ({ page }) => {
    await boot(page, { maanden: 1 });
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = maandKpiBlok(kijkMaand());
      return d.innerText.replace(/\s+/g, ' ');
    });
    test.skip(!r, 'geen kerncijferblok in deze opzet');
    expect(r).not.toMatch(/vorige maand/);
    expect(r).toMatch(/verloop zie je vanaf \d+ afgeronde maanden/);
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

/* v224: deze groep toetste de uitnodiging onder de kaart ('Zullen we <naam> doorlopen?'). Die tak
   is vervallen: elke regel draagt nu zijn eigen ingang. De eis eronder blijft en verscherpt zelfs:
   de ingang herhaalt het oordeel niet, en hij noemt de naam ook niet meer - zijn plaats onder de
   regel zegt al waar hij over gaat, en v193 waarschuwde er juist voor dat die naam anders drie keer
   op één scherm staat. */
test.describe('h · de ingang herhaalt niet wat er al staat', () => {
  test('de ingang herhaalt het oordeel en de naam van de regel niet', async ({ page }) => {
    await boot(page, {});
    /* De regel komt hier met de hand: wat getoetst wordt is de formulering van de ingang, niet
       hoe maandRegels() tot een tekort komt. Dat laatste heeft zijn eigen spec. */
    const r = await page.evaluate(() => {
      const R = { key: 'dekking', naam: 'Dekking reserveringen', status: 'tekort', waarde: '€5',
                  eenheid: 'in je pot', gevolg: 'Je pot dekt de eerstvolgende post niet.',
                  tekortPerMaand: 850, act: 'openReserveringen()' };
      const d = document.createElement('div'); d.innerHTML = maandIngang(R, thisYM());
      const el = d.querySelector('[onclick]');
      return { tekst: d.innerText.replace(/\s+/g, ' '),
        act: el ? el.getAttribute('onclick') : null };
    });
    expect(r.tekst).not.toMatch(/dekking reserveringen/i);  // de rij erboven draagt de naam al
    expect(r.tekst).not.toMatch(/vraagt een beslissing|vraagt aandacht/);  // dat staat al in de kaartkop
    expect(r.act).toMatch(/coStart\('maand','[^']*','dekking'\)/);   // op zijn eigen onderwerp
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
