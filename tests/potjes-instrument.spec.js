// v208: het Kerncijfers-blok is van Inzichten af en de potjes-tegel is het instrument voor
// variabele lasten geworden.
//
// Budgetnaleving stond al in de hero, in dezelfde eenheid en uit dezelfde bron. De
// variabele-lastendruk stuurde niets: je wilt minder euro's variabel uitgeven, en het instrument
// daarvoor zijn je potjes - die al je norm zijn, dus een doel op dat percentage zou een tweede norm
// voor dezelfde vraag zijn. Dat percentage daalde bovendien zodra je vaste lasten stegen, zonder
// dat je gedrag veranderde.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const ins = (page) => page.evaluate(() => { go('ins'); return $('#s-ins').innerText; });
const maand = (page) => page.evaluate(() => { go('maand'); return $('#s-maand').innerText; });
/* v309: DE REGEL IS HET HOOFDGETAL VAN DE STAND-KAART GEWORDEN en staat niet meer in de lijst.
   `lab` is het label, `val` het grote getal, `sub` de regel boven de balk (met een ANDERE noemer
   dan de oude sub: totals().spendNorm tegen totals().budget in plaats van de potjes, v257), en
   `noot` het deel van het achtervoegsel dat de tempo-krapte draagt. */
const potjesTegel = (page) => page.evaluate(() => {
  go('ins');
  const kaart = document.getElementById('insStand');
  const t = kaart ? [...kaart.querySelectorAll('div.row')]
    .find((x) => /nog in je potjes|te veel uitgegeven/.test(x.textContent)) : null;
  if (!t) return null;
  const sp = [...t.querySelectorAll('span')];
  const vol = sp.length > 1 ? sp[1].innerText.replace(/\s+/g, ' ').trim() : '';
  const achter = vol.includes(' \u00b7 ') ? vol.slice(vol.indexOf(' \u00b7 ') + 3) : '';
  const noemer = [...kaart.querySelectorAll('div.row')]
    .find((x) => /van \u20ac[\d.]+ (maandbudget|je inkomen-limiet)/.test(x.textContent));
  return { lab: vol.split(' \u00b7 ')[0], val: sp.length ? sp[0].innerText.trim() : '',
    sub: noemer ? noemer.innerText.replace(/\s+/g, ' ').trim() : '',
    achter, noot: /tekort/.test(achter) ? achter : null,
    nootTik: null, tik: t.getAttribute('onclick'),
    inLijst: [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
      .some((x) => /uit je potjes|te veel uitgegeven/i.test(x.innerText)) };
});

// potjes zonder uitgaven: alles staat nog open
function zonderUitgaven() {
  const p = seed();
  const tx = JSON.parse(p.minder_tx).filter((t) => !/^(ah-cur|eet-cur|fit-)/.test(t.id) || !t.date.startsWith(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')));
  p.minder_tx = JSON.stringify(tx);
  return p;
}
// budgetten zo laag dat de variabele potjes overschreden zijn
function overschreden() {
  const p = seed();
  const s = JSON.parse(p.minder_set);
  // klein genoeg dat zowel de variabele potjes als het totaal overschreden zijn
  s.budgets = { goededoel: 5, sport: 10, boodschappen: 100, uiteten: 50 };
  delete s.budgetsNext;
  p.minder_set = JSON.stringify(s);
  return p;
}
function zonderPotjes() {
  const p = seed();
  const s = JSON.parse(p.minder_set);
  s.budgets = {}; delete s.budgetsNext;
  p.minder_set = JSON.stringify(s);
  return p;
}

test.describe('a - Inzichten voor en na', () => {
  test('geen kerncijfers meer, en geen sectie Verdieping', async ({ page }) => {
    await open(page, seed());
    const t = await ins(page);
    expect(t.toLowerCase()).not.toContain('kerncijfers');
    expect(t.toLowerCase()).not.toContain('verdieping');
    expect(t.toLowerCase()).not.toContain('budgetnaleving');
    expect(t.toLowerCase()).not.toContain('variabele-lasten-druk');
    expect(await page.evaluate(() => document.querySelectorAll('#s-ins [data-kpi]').length)).toBe(0);
    /* v359: Inzichten is een dashboard: het filter bovenaan zegt welke periode je leest, en de tegels dragen de
       bedragen. Geen sectiekoppen meer. */
    expect(await page.evaluate(() => document.querySelectorAll('#s-ins .inssec').length)).toBe(0);
    expect(await page.evaluate(() => !!document.querySelector('#s-ins #insFilter'))).toBe(true);
  });

  test('de hero draagt de budgetstand onveranderd', async ({ page }) => {
    await open(page, seed());
    const t = await ins(page);
    expect(t).toMatch(/uitgegeven/i);
    // v359: de tegel Uitgegeven zegt wat er tot vandaag mocht, en het percentage van v208 is vervallen
    expect(t).toMatch(/tot vandaag mocht|van €[\d.]+ budget/i);   // zonder drie afgeronde maanden geen tempo
  });

  test('de functies achter het blok zijn verwijderd', async ({ page }) => {
    await open(page, seed());
    const r = await page.evaluate(() => ({
      strip: typeof insKpiStrip, sam: typeof insKpiSamenvatting, vouw: typeof insVouw,
      def: Object.keys(COLLAP_DEF), src: renderIns.toString(),
    }));
    expect([r.strip, r.sam, r.vouw]).toEqual(['undefined', 'undefined', 'undefined']);
    expect(r.def).not.toContain('openKpiCard');
    expect(r.src).not.toContain('insVouw(');          // de aanroep, niet het woord in een comment
    expect(r.src).not.toContain("insSection('Verdieping')");
  });
});

test.describe('b - de kerncijfers op Maand zijn ongemoeid', () => {
  // v209: de vaste-lastendruk is van Maand af; de spaarquote blijft, met zijn eigen blok
  // v223: de kaartschil met de kop is vervallen; de tegel staat nu onder de streep in de kaart met
  // je maandregels. Het cijfer en zijn eigen data-kpi blijven, en dat is wat deze test bewaakt.
  // v232: de spaarquote staat op Vermogen; Maand draagt hem niet meer, en de tegel is dezelfde
  test('de spaarquote staat op Vermogen, met zijn eigen tegel, en niet op Maand', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const t = await maand(page);
    expect(t.toLowerCase()).not.toContain('spaarquote');
    expect(t.toLowerCase()).not.toContain('vaste-lasten-druk');
    const v = await page.evaluate(() => { go('vermogen'); return $('#s-vermogen').innerText.toLowerCase(); });
    expect(v).toContain('spaarquote');
    expect(await page.evaluate(() => [...document.querySelectorAll('#s-vermogen #maandKpiBlok [data-kpi]')].map((e) => e.dataset.kpi)))
      .toEqual(['inleg']);
  });

  test('insKpis rekent nog altijd alle vier', async ({ page }) => {
    await open(page, seed());
    const keys = await page.evaluate((m) => insKpis(m).items.map((k) => k.key), null);
    expect(keys.sort()).toEqual(['budget', 'inleg', 'vari', 'vast']);
  });
});

test.describe('c - de potjes-tegel is een voortgang', () => {
  /* v359: 'halverwege: bedrag, label en de noemer eronder' is vervallen: v359: de stand-kaart is de tegel Nog in potjes; dit staat in potjesregel-aansluiting.spec.js en inzichten-dashboard.spec.js */

  test('de getallen komen uit de bestaande potjeslogica', async ({ page }) => {
    await open(page, seed());
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const VP = varPotjeStand(m);
      return { VP, rest: varPlanRemaining(m), budget: varBudget() };
    });
    expect(r.VP.rest).toBe(r.rest);           // geen tweede afleiding
    expect(r.VP.budget).toBe(r.budget);
    expect(r.VP.deel).toBe(Math.round(r.VP.gebruikt / r.VP.budget * 100));
  });

  /* v359: 'de zin onder de balk noemt zijn eigen noemer, en de kop herhaalt hem niet' is vervallen: v359: de stand-kaart is de tegel Nog in potjes; dit staat in potjesregel-aansluiting.spec.js en inzichten-dashboard.spec.js */

  test('zonder potjes staat de tegel er niet', async ({ page }) => {
    await open(page, zonderPotjes());
    expect(await potjesTegel(page)).toBeNull();
    const r = await page.evaluate(() => varPotjeStand(curMonth || months()[months().length - 1]));
    expect(r).toMatchObject({ budget: 0, gebruikt: 0, potjes: 0, deel: null, over: false });
  });

  /* v359: 'de plan-tegels dragen geen alarmkleur' is vervallen: v359: de stand-kaart is de tegel Nog in potjes; dit staat in potjesregel-aansluiting.spec.js en inzichten-dashboard.spec.js */
});

test.describe('d - de tegel leidt naar het instrument', () => {
  /* BEDOELING OMGEDRAAID (v250): de tik zat op de hele regel en dus op het grote getal, terwijl
     openReservedPotjes() potjeRest() per potje optelt en zijn koptotaal daarmee varPlanRemaining
     is. Sinds het grote getal de aftrekking toont, kwam je dan op een ander getal uit dan waarop
     je tikte. De sheet hangt nu aan de regel die dat bedrag noemt. Het grote getal heeft geen tik:
     geen bestaand overzicht komt op die aftrekking uit, en liever geen tik dan een verkeerde. */
  /* BEDOELING OMGEDRAAID (v254): de tik hing aan de regel die de tempo-som noemt, want de sheet
     toonde toen datzelfde getal. Sinds v254 toont die sheet de reservering, dus de tik is weg:
     liever geen tik dan een naar een ander getal. De route naar de sheet loopt via Home. */
  test('de sheet blijft via Home bereikbaar', async ({ page }) => {
    /* overschreden() en niet seed(): die tweede heeft geen potje boven zijn grens en dus geen gat,
       en dan staat de regel met de sheet-ingang er terecht niet. Dat geval staat in
       potjesregel-aansluiting.spec.js, samen met de route die Home dan nog houdt. */
    await open(page, overschreden());
    // v359: op Inzichten opent de tegel "Nog in potjes" zijn eigen sheet; deze sheet hangt aan Home
    const viaHome = await page.evaluate(() => { go('dash'); openSafeToSpend();
      return [...document.querySelectorAll('#sheet [onclick]')]
        .some((x) => /gereserveerd in je potjes/i.test(x.innerText)); });
    expect(viaHome).toBe(true);
    const r = await page.evaluate(() => {
      openReservedPotjes();
      const rijen = [...document.querySelectorAll('#sheet .tx')];
      return { n: rijen.length, tik: rijen.map((x) => x.getAttribute('onclick') || ''),
        voet: $('#sheet').innerText };
    });
    expect(r.n).toBeGreaterThan(0);
    for (const x of r.tik) expect(x).toMatch(/^openPotje\('/);
    expect(r.voet).toMatch(/verlaag je hier een potje/);
  });

  test('zonder potjes wijst de lege staat naar het maken van een potje', async ({ page }) => {
    await open(page, zonderPotjes());
    const r = await page.evaluate(() => { openReservedPotjes(); return $('#sheet').innerHTML; });
    expect(r).toContain('openPotjePick()');
    expect(r).not.toMatch(/bij de Coach/);       // v196: dat scherm bestaat niet meer
  });
});

test.describe('e - layout', () => {
  for (const w of [360, 390]) {
    test(`de tegelrij past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await open(page, seed());
      await ins(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const buiten = await page.evaluate(() => {
        const rij = document.querySelector('#insNogLijst');
        if (!rij) return 0;
        const rb = rij.getBoundingClientRect();
        return [...rij.querySelectorAll('.ins-nog-rij')].filter((t) => t.getBoundingClientRect().right > rb.right + 1).length;
      });
      expect(buiten).toBe(0);
    });
  }
});
