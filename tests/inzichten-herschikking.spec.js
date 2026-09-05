// v135: Inzichten krijgt "Nog deze maand" terug zonder vol te lopen. Budgetstand en nog-deze-maand
// beantwoorden dezelfde vraag - hoe sta ik er halverwege de maand voor - dus staan ze in één
// herokaart, opgebouwd uit twee blokken die elk los kunnen ontbreken. Daaronder één regel met wat
// opviel, en de rest ingeklapt onder Verdieping. Een herschikking: geen nieuwe berekeningen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';

// standaard: drie maanden met een terugkerende huur en salaris, dus fixDue en incDue lopen door
function seedIns(set = {}, opt = {}) {
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  const maanden = opt.alleenNu ? [CUR] : [M2, M1, CUR];
  for (const m of maanden) {
    add('i' + m, m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    if (!opt.alleenNu && m !== CUR) add('h' + m, m, '28', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '05', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 300, manualBal: { [MAIN]: 2000 },
      budgets: { boodschappen: 500, huur: 900 },
    }, set)),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedIns());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof insHeroKaart === 'function');
  await page.evaluate(() => go('ins'));
}

/* De twee terugval-tests leunden op een fixture die alleen op de eerste dagen van de maand een
   lege liquiditeit oplevert: varDue is tempo maal de resterende dagen, dus die loopt vanaf de derde
   vanzelf op en dan viel de test om op de kalender in plaats van op het gedrag. De guard leest
   monthLiquidity(), dus die leggen we vast - net als de 'stukkende bron'-test verderop doet. */
const legeLiquiditeit = (page) => page.evaluate(() => {
  window.monthLiquidity = () => ({ fixDue: 0, varDue: 0, incDue: 0, fixDueExclCount: 0, sum: 0, projected: 0, daysLeft: 0 });
  // v169: het variabele deel komt uit varPlanRemaining(), niet meer uit L.varDue. "Niets meer open"
  // betekent dus ook: niets meer in je potjes.
  window.varPlanRemaining = () => 0;
});
const beeld = (page) => page.evaluate(() => {
  const el = document.querySelector('#s-ins');
  const t = el.innerText;
  return {
    kaarten: [...el.querySelectorAll('.card')].length,
    secties: [...el.querySelectorAll('.inssec')].map((x) => x.textContent),
    eerste: (el.querySelector('.card') || { innerText: '' }).innerText,
    ndmKoppen: (t.match(/NOG DEZE MAAND/g) || []).length,
    streep: !!el.querySelector('.ndm-net'),
    prompt: /stel in/.test(t),
    kpiOpen: !!el.querySelector('#insKpiStrip'),
    over: el.scrollWidth - el.clientWidth,
    tekst: t,
  };
});

test.describe('a · de herokaart', () => {
  test('budgetstand en nog-deze-maand staan in één kaart', async ({ page }) => {
    await boot(page);
    const b = await beeld(page);
    expect(b.eerste).toMatch(/dag \d+ van \d+/);
    expect(b.eerste).toMatch(/van €[\d.]+ maandbudget/);
    expect(b.eerste).toMatch(/NOG DEZE MAAND/);
    expect(b.eerste).toMatch(/Deze maand op eigen kracht/);
    expect(b.ndmKoppen).toBe(1);                       // niet twee keer op het scherm
  });

  test('de kop noemt de maand en de dag, zonder status-chip', async ({ page }) => {
    await boot(page);
    const kop = await page.evaluate(() => document.querySelector('#s-ins .card').innerText.split('\n').slice(0, 3).join(' | '));
    expect(kop).toMatch(/dag \d+ van \d+/);
    // de chip-woorden wonen in monthStatusCard en zijn daar bewust gebleven
    expect(kop).not.toMatch(/op schema|sneller dan de maand|over budget/i);
  });

  test('de tegels houden hun eigen ingangen', async ({ page }) => {
    await boot(page);
    const acties = await page.evaluate(() => [...document.querySelectorAll('#s-ins .wvo-tile[onclick]')].map((n) => n.getAttribute('onclick')));
    expect(acties.some((a) => /openFixedDue/.test(a))).toBe(true);
    expect(acties.some((a) => /openSafeToSpend/.test(a))).toBe(true);
  });

  test('de budgethelft blijft de budget-vergelijking openen', async ({ page }) => {
    await boot(page);
    /* v176: de maandnaam in de kop is de maandkiezer geworden, dus openBudgetCompare hangt nu aan
       de dagteller ernaast. De ingang blijft bestaan, alleen op een ander element (v114/v115). */
    const h = await page.evaluate(() => $('#s-ins').innerHTML);
    expect(h).toContain('openBudgetCompare');
    expect(h).toContain('openMaandKiezer()');
  });
});

test.describe('b · terugvallen', () => {
  test('niets meer open: alleen de budgethelft, geen lege tegels', async ({ page }) => {
    await boot(page, seedIns({ savingAmount: 0 }, { alleenNu: true }));
    await legeLiquiditeit(page);
    await page.evaluate(() => renderIns());
    expect(await page.evaluate(() => nogDezeMaandBody())).toBe('');
    const b = await beeld(page);
    expect(b.eerste).toMatch(/van €[\d.]+ maandbudget/);
    expect(b.ndmKoppen).toBe(0);
    expect(b.streep).toBe(false);
    expect(b.tekst).not.toMatch(/Nog te betalen/i);
  });

  test('geen budget: de prompt van monthStatusCard, met nog-deze-maand er los onder', async ({ page }) => {
    await boot(page, seedIns({ income: 0, budgets: {} }));
    const b = await beeld(page);
    expect(await page.evaluate((m) => Math.round(totals(m).budget), CUR)).toBe(0);
    expect(await page.evaluate((m) => insHeroKaart(m), CUR)).toBe('');
    expect(b.prompt).toBe(true);                       // de bestaande budget-prompt
    expect(b.ndmKoppen).toBe(1);                       // en de kaart er los onder
    expect(b.streep).toBe(true);
  });

  // v166: de tak 'een vorige maand' bestond alleen in dode code. months() voegt de huidige
  // maand altijd toe en render() zet curMonth op het laatste element, dus die stand is
  // onbereikbaar. De toets is met de tak mee vervallen.

  test('een stukkende bron laat de rest staan', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate((m) => {
      const orig = window.monthLiquidity;
      window.monthLiquidity = () => { throw new Error('stuk'); };
      const hero = insHeroKaart(m);
      window.monthLiquidity = orig;
      return { hero, heeftBudget: /budget/.test(hero), heeftTegels: /wvo-tiles/.test(hero) };
    }, CUR);
    expect(uit.heeftBudget).toBe(true);                // de budgethelft blijft
    expect(uit.heeftTegels).toBe(false);               // de tegels vallen weg
  });
});

// v144: "Nog deze maand" is van Vooruitblik af; het omhulsel blijft de terugval van renderIns()
// wanneer er geen budget is. Dat Vooruitblik hem niet meer toont staat in nog-deze-maand-eenmaal.
test.describe('c · het omhulsel blijft bestaan', () => {
  test('nogDezeMaandCard is de body in zijn eigen omhulsel', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const body = nogDezeMaandBody();
      const kaart = nogDezeMaandCard();
      return { body, kaart, klopt: kaart === `<div class="card"><div class="hlabel" style="margin:0 0 12px">Nog deze maand</div>${body}</div>` };
    });
    expect(uit.body).not.toBe('');
    expect(uit.klopt).toBe(true);
  });

  test('een lege body geeft ook een lege kaart', async ({ page }) => {
    await boot(page, seedIns({ savingAmount: 0 }, { alleenNu: true }));
    await legeLiquiditeit(page);
    expect(await page.evaluate(() => nogDezeMaandBody())).toBe('');
    expect(await page.evaluate(() => nogDezeMaandCard())).toBe('');
  });
});

test.describe('d · de verdieping', () => {
  test('de kaarten onder Verdieping, met de juiste standen', async ({ page }) => {
    await boot(page);
    const b = await beeld(page);
    expect(b.secties).toEqual(['Deze maand', 'Verdieping']);
    expect(b.kpiOpen).toBe(true);                                        // kerncijfers standaard open
    // v178: de meermaands-grafiek en de abonnementenkaart staan op Maand
    expect(b.tekst).not.toMatch(/uitgaven vs budget/i);
    expect(b.tekst).not.toMatch(/tik om te bekijken/);
    // v136: de Categorieen-kaart is weg van de pagina; die verdeling staat achter "Uitgegeven"
    expect(b.tekst).not.toMatch(/^categorieën/im);
    expect(b.tekst).not.toMatch(/grootste:/)
  });

  test('de kerncijfers zijn in te klappen en tonen dan een samenvatting', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => toggleCollap('openKpiCard'));
    const b = await beeld(page);
    expect(b.kpiOpen).toBe(false);
    expect(b.tekst).toMatch(/kerncijfers/i);
    const sam = await page.evaluate((m) => insKpiSamenvatting(m), CUR);
    expect(sam).toMatch(/spaarquote|budgetnaleving/i);
    expect(b.tekst).toContain(sam);
  });

  test('de samenvatting komt uit dezelfde bron als de strip', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate((m) => {
      const K = insKpis(m);
      const w = (k) => (K[k] && K[k].raw != null) ? K[k].val : null;   // onbekend telt niet mee
      return { sam: insKpiSamenvatting(m), inleg: w('inleg'), budget: w('budget') };
    }, CUR);
    expect(uit.inleg || uit.budget).toBeTruthy();                       // minstens één bruikbaar cijfer
    if (uit.inleg) expect(uit.sam).toContain(uit.inleg);
    if (uit.budget) expect(uit.sam).toContain(uit.budget);
  });

  /* v187: de Gedrag-kaart is vervallen. Drie van zijn vier bronnen stonden woordelijk ook in
     scoreNotifs() (v143), en de vierde, de over-budget-rij, is de eerste bron van de Valt-op-kaart
     geworden. Eén observatie, één plek. */
  test('Gedrag bestaat niet meer; de observatie staat in de Valt-op-kaart', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof window.renderBehavior)).toBe('undefined');
    const b = await beeld(page);
    expect(b.tekst).not.toMatch(/gedrag/i);
  });

  test('wat opviel blijft uitgeklapt en staat boven Verdieping', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const el = document.querySelector('#s-ins');
      const wvo = el.querySelector('#wvoLine');
      const sec = [...el.querySelectorAll('.inssec')].find((x) => x.textContent === 'Verdieping');
      if (!wvo || !sec) return { aanwezig: !!wvo, voor: null };
      return { aanwezig: true, voor: !!(wvo.compareDocumentPosition(sec) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    if (uit.aanwezig) expect(uit.voor).toBe(true);
  });
});

test.describe('e · modus en layout', () => {
  // v161: Inzichten draagt nog twee kerncijfers; de andere twee staan op het maandscherm.
  test('rustig toont er een, Begeleid beide', async ({ page }) => {
    await boot(page, seedIns({ mode: 'rustig' }));
    const n = await page.evaluate(() => document.querySelectorAll('#insKpiStrip [data-kpi]').length);
    expect(n).toBe(1);
    await boot(page);
    expect(await page.evaluate(() => document.querySelectorAll('#insKpiStrip [data-kpi]').length)).toBe(2);
  });

  for (const w of [360, 390]) {
    test(`geen overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page);
      const b = await beeld(page);
      expect(b.over).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth)).toBeLessThanOrEqual(1);
    });
  }
});
