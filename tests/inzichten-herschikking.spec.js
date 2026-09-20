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
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof insEyebrow === 'function');
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
    // v192: de scheidingslijn (.ndm-net) hing aan de chip die verviel. De tegelrij is de nieuwe
    // markering, maar .wvo-tiles staat ook elders op het scherm; de vaste-lastentegel is uniek.
    // v241: op Inzichten zijn de tegels een lijst geworden; de terugval-kaart houdt de tegelvorm
    tegels: [...el.querySelectorAll('.ins-nog-lab, .wvo-tl')].some((x) => /Nog te betalen/i.test(x.textContent)),
    lijst: !!el.querySelector('#insNogLijst'),
    lijstBuitenKaart: !!el.querySelector('#insNogLijst') && !el.querySelector('.card #insNogLijst'),
    eyebrow: (el.querySelector('.ins-eyebrow') || { innerText: '' }).innerText,
    prompt: /stel in/.test(t),
    kpiOpen: !!el.querySelector('#insKpiStrip'),
    over: el.scrollWidth - el.clientWidth,
    tekst: t,
  };
});

/* v241 draait de las van v135 terug. De twee helften beantwoordden twee vragen en vulden samen op
   360px het hele scherm tot de vouw, dus ze staan nu als twee blokken onder elkaar: de stand in de
   enige kaart van de pagina, 'wat er nog komt' als lijst zonder kaart eronder. De eigenschappen die
   v135 bewaakte blijven: precies één plek voor de posten, dezelfde ingangen, dezelfde terugvallen. */
test.describe('a · de stand en wat er nog komt', () => {
  test('de stand is een kaart, wat er nog komt staat eronder zonder kaart', async ({ page }) => {
    await boot(page);
    const b = await beeld(page);
    expect(b.eerste).toMatch(/van €[\d.]+ maandbudget/);
    expect(b.eerste).not.toMatch(/Nog te betalen/i);   // de posten zitten niet meer in de kaart
    expect(b.kaarten).toBe(1);                         // en de kaart is de enige op het scherm
    expect(b.lijst).toBe(true);
    expect(b.lijstBuitenKaart).toBe(true);
    expect(b.secties).toContain('Wat er nog komt');
    expect(b.tekst).toMatch(/Nog te betalen/i);
    expect(b.ndmKoppen).toBe(0);                       // de oude kop 'Nog deze maand' is de sectiekop geworden
  });

  test('de eyebrow noemt de maand en de dag, zonder status-chip', async ({ page }) => {
    await boot(page);
    const b = await beeld(page);
    expect(b.eyebrow).toMatch(/dag \d+ van \d+/);
    expect(b.eyebrow).toMatch(/\u25be/);                 // de maandkiezer
    // ze staan er precies één keer, dus niet ook nog in de kaart
    expect(b.eerste).not.toMatch(/dag \d+ van \d+/);
    expect((b.tekst.match(/dag \d+ van \d+/g) || []).length).toBe(1);
    // de chip-woorden wonen in monthStatusCard en zijn daar bewust gebleven
    expect(b.eyebrow).not.toMatch(/op schema|sneller dan de maand|over budget/i);
  });

  test('de posten houden hun eigen ingangen', async ({ page }) => {
    await boot(page);
    const acties = await page.evaluate(() => [...document.querySelectorAll('#insNogLijst .ins-nog-rij[onclick]')].map((n) => n.getAttribute('onclick')));
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
    expect(await page.evaluate(() => nogDezeMaandPosten().length)).toBe(0);
    expect(await page.evaluate(() => insNogLijst())).toBe('');
    const b = await beeld(page);
    expect(b.eerste).toMatch(/van €[\d.]+ maandbudget/);
    expect(b.ndmKoppen).toBe(0);
    expect(b.tegels).toBe(false);
    expect(b.lijst).toBe(false);
    expect(b.secties).not.toContain('Wat er nog komt');   // geen kop zonder inhoud
    expect(b.tekst).not.toMatch(/Nog te betalen/i);
  });

  test('geen budget: de prompt van monthStatusCard, met nog-deze-maand er los onder', async ({ page }) => {
    await boot(page, seedIns({ income: 0, budgets: {} }));
    const b = await beeld(page);
    expect(await page.evaluate((m) => Math.round(totals(m).budget), CUR)).toBe(0);
    // v241: insHeroKaart() bestaat niet meer; de terugval hangt aan insBudgetBlok()
    expect(await page.evaluate((m) => insBudgetBlok(m), CUR)).toBe('');
    expect(b.prompt).toBe(true);                       // de bestaande budget-prompt
    expect(b.ndmKoppen).toBe(1);                       // en de kaart er los onder, nog als tegels
    expect(b.tegels).toBe(true);
    expect(b.lijst).toBe(false);
  });

  // v166: de tak 'een vorige maand' bestond alleen in dode code. months() voegt de huidige
  // maand altijd toe en render() zet curMonth op het laatste element, dus die stand is
  // onbereikbaar. De toets is met de tak mee vervallen.

  test('een stukkende bron laat de rest staan', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate((m) => {
      const orig = window.monthLiquidity;
      window.monthLiquidity = () => { throw new Error('stuk'); };
      const stand = insBudgetBlok(m); let lijst = 'NIET AFGEVANGEN';
      try { lijst = insNogLijst(); } catch (_) {}
      renderIns();
      const paginaTekst = document.querySelector('#s-ins').innerText;
      window.monthLiquidity = orig;
      return { heeftBudget: /budget/.test(stand), lijst, paginaTekst };
    }, CUR);
    expect(uit.heeftBudget).toBe(true);                // de standkaart blijft
    expect(uit.lijst).toBe('');                        // en de posten vallen weg, afgevangen
    expect(uit.paginaTekst).not.toMatch(/Wat er nog komt/i);
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
  /* v208: Verdieping bevatte precies één element, het Kerncijfers-blok, en dat is van Inzichten af.
     De sectiekop viel vanzelf weg: renderIns() had die guard al. Er blijft één sectie over, en die
     zegt ook welke maand je leest. */
  test('Verdieping bestaat niet meer; elke sectie zegt welke vraag hij beantwoordt', async ({ page }) => {
    await boot(page);
    const b = await beeld(page);
    /* v241: er is niet één sectie meer maar één per blok, en elke kop zegt zijn vraag. Welke maand
       je leest staat in de eyebrow. Een kop zonder inhoud staat er niet, dus deze lijst is precies
       wat deze fixture oplevert. */
    expect(b.secties).toEqual(['Wat er nog komt', 'Over de maanden heen']);
    expect(b.tekst).not.toMatch(/kerncijfers/i);
    /* v178: de meermaands-grafiek en de abonnementenkaart staan op Maand. v227: de grafiek is terug
       onder Deze maand, dus die twee asserties zijn omgedraaid; de abonnementenkaart blijft op
       Maand. Wat deze test bewaakt is dat er één sectie is, niet wat er in staat. */
    expect(b.tekst).toMatch(/uitgaven vs budget/i);
    expect(b.tekst).not.toMatch(/abonnementen/i);
    // v136: de Categorieen-kaart is weg van de pagina; die verdeling staat achter "Uitgegeven"
    expect(b.tekst).not.toMatch(/^categorieën/im);
    expect(b.tekst).not.toMatch(/grootste:/)
  });

  /* v208: hier stonden twee tests over de ingeklapte kop en zijn samenvatting. Met het
     Kerncijfers-blok verviel de enige aanroeper van insVouw() en insKpiSamenvatting(), dus die twee
     bestaan niet meer. Wat er voor in de plaats komt is de vaststelling dat ze weg zijn en dat er
     op Inzichten niets meer te vouwen valt. */
  test('de vouwlaag op Inzichten is vervallen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      vouw: typeof insVouw, sam: typeof insKpiSamenvatting, strip: typeof insKpiStrip,
      def: Object.keys(COLLAP_DEF),
      src: renderIns.toString(),
    }));
    expect([r.vouw, r.sam, r.strip]).toEqual(['undefined', 'undefined', 'undefined']);
    expect(r.def).not.toContain('openKpiCard');
    expect(r.src).not.toContain('insVouw');
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

  /* v208: Verdieping bestaat niet meer, dus 'boven Verdieping' heeft geen anker. Wat blijft is dat
     de Valt-op-regel uitgeklapt onder de hero staat.
     v227: 'als laatste blok van het scherm' is geen anker meer, want de meermaands-grafiek staat
     eronder. Het anker is waar hij hoort: direct onder de hero, dus met niets tussen die twee.
     v135 zette die twee bij elkaar en dat is wat deze test bewaakt. */
  test('wat opviel staat uitgeklapt direct onder de hero', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const el = document.querySelector('#s-ins');
      // v235: #wvoLine is vervallen; de valt-op-regels staan als losse kaarten op dezelfde plek
      const wvo = el.querySelector('.valtop-rij, .valtop-patroon');
      if (!wvo) return { aanwezig: false };
      /* v241: de signalen staan niet meer in een kaart, dus het anker is de sectiekop erboven.
         Wat v135 bij elkaar zette blijft bij elkaar: de kop 'Wat opvalt' staat direct vóór de
         eerste signaalregel, met niets ertussen. */
      const kop = [...el.querySelectorAll('.inssec')].find((k) => /wat opvalt/i.test(k.textContent));
      const houder = wvo.parentElement;
      return { aanwezig: true, kop: !!kop, direct: kop ? kop.nextElementSibling === houder : false,
        inKaart: !!el.querySelector('.card .valtop-rij, .card .valtop-patroon') };
    });
    if (uit.aanwezig) {
      expect(uit.kop, 'de sectiekop staat er').toBe(true);
      expect(uit.direct, 'direct onder de kop').toBe(true);
      expect(uit.inKaart, 'geen kaart om het signaal').toBe(false);
    }
  });
});

test.describe('e · modus en layout', () => {
  // v161: Inzichten draagt nog twee kerncijfers; de andere twee staan op het maandscherm.
  /* v208: de kerncijfers staan alleen nog op Maand, dus de drietraps uitklap uit v90 leeft daar.
     Op Inzichten staat geen enkele tegel meer, in geen enkele modus. */
  test('Inzichten draagt in geen enkele modus nog een kerncijfer', async ({ page }) => {
    for (const mode of ['rustig', 'begeleid', 'expert']) {
      await boot(page, seedIns({ mode }));
      expect(await page.evaluate(() => document.querySelectorAll('#s-ins [data-kpi]').length), mode).toBe(0);
    }
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
