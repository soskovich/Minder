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
const potjesTegel = (page) => page.evaluate(() => {
  go('ins');
  const t = [...document.querySelectorAll('#s-ins .wvo-tile')].find((x) => /uit je potjes/i.test(x.innerText));
  if (!t) return null;
  const r = t.innerText.split('\n');
  return { lab: r[0], val: r[1], sub: r[2] || '', tik: t.getAttribute('onclick') };
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
    // één sectiekop over, en die zegt ook welke maand je leest
    expect(await page.evaluate(() => [...document.querySelectorAll('#s-ins .inssec')].map((x) => x.innerText)))
      .toEqual(['DEZE MAAND']);
  });

  test('de hero draagt de budgetstand onveranderd', async ({ page }) => {
    await open(page, seed());
    const t = await ins(page);
    expect(t).toMatch(/uitgegeven/i);
    expect(t).toMatch(/maandbudget/i);
    expect(t).toMatch(/\d+%/);                    // hetzelfde percentage, in de hero
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
  test('de spaarquote staat er, met zijn eigen blok', async ({ page }) => {
    await open(page, seed({ maanden: 8 }));
    const t = await maand(page);
    expect(t.toLowerCase()).toContain('vermogensopbouw');
    expect(t.toLowerCase()).toContain('spaarquote');
    expect(t.toLowerCase()).not.toContain('vaste-lasten-druk');
    expect(await page.evaluate(() => [...document.querySelectorAll('#maandKpiBlok [data-kpi]')].map((e) => e.dataset.kpi)))
      .toEqual(['inleg']);
  });

  test('insKpis rekent nog altijd alle vier', async ({ page }) => {
    await open(page, seed());
    const keys = await page.evaluate((m) => insKpis(m).items.map((k) => k.key), null);
    expect(keys.sort()).toEqual(['budget', 'inleg', 'vari', 'vast']);
  });
});

test.describe('c - de potjes-tegel is een voortgang', () => {
  test('halverwege: bedrag, noemer en deel', async ({ page }) => {
    await open(page, seed());
    const t = await potjesTegel(page);
    expect(t).not.toBeNull();
    expect(t.lab).toMatch(/NOG UIT JE POTJES/i);
    expect(t.val).toMatch(/^€/);
    expect(t.sub).toMatch(/^van €[\d.]+ · €[\d.]+ gebruikt · \d+%$/);
    // de vorm volgt de tegel ernaast in dezelfde rij (v204)
    const spaar = await page.evaluate(() => {
      const x = [...document.querySelectorAll('#s-ins .wvo-tile')].find((e) => /nog te sparen/i.test(e.innerText));
      return x ? x.innerText.split('\n')[2] : '';
    });
    expect(spaar).toMatch(/^van €/);
  });

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

  test('potjes onaangeroerd: nog niets gebruikt, geen percentage van nul', async ({ page }) => {
    await open(page, zonderUitgaven());
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      SET.budgets = { boodschappen: 800, uiteten: 400 }; save();
      // geen enkele uitgave in die twee categorieën deze maand
      TX = TX.filter((t) => !(t.date.slice(0, 7) === m && ['boodschappen', 'uiteten'].includes(catOf(t))));
      render(); go('ins');
      const VP = varPotjeStand(m);
      const t = [...document.querySelectorAll('#s-ins .wvo-tile')].find((x) => /uit je potjes/i.test(x.innerText));
      return { VP, sub: t ? t.innerText.split('\n')[2] : null };
    });
    expect(r.VP.gebruikt).toBe(0);
    expect(r.sub).toMatch(/^van €[\d.]+ · nog niets gebruikt$/);
  });

  test('overschreden: bedrag en noemer, maar geen percentage', async ({ page }) => {
    await open(page, overschreden());
    const r = await page.evaluate(() => varPotjeStand(curMonth || months()[months().length - 1]));
    expect(r.over).toBe(true);
    expect(r.gebruikt).toBeGreaterThan(r.budget);
    const t = await potjesTegel(page);
    expect(t.sub).toMatch(/^van €[\d.]+ · €[\d.]+ gebruikt$/);
    expect(t.sub).not.toMatch(/%/);              // de hero zegt al hoeveel je erover bent
  });

  test('de hero noemt de overschrijding, de tegel herhaalt hem niet', async ({ page }) => {
    await open(page, overschreden());
    const t = await ins(page);
    expect(t).toMatch(/over je potjes/);          // budgetOverZin, in de hero
    const tegel = await potjesTegel(page);
    expect(tegel.sub).not.toMatch(/over je potjes|te gaan/);
  });

  test('zonder potjes staat de tegel er niet', async ({ page }) => {
    await open(page, zonderPotjes());
    expect(await potjesTegel(page)).toBeNull();
    const r = await page.evaluate(() => varPotjeStand(curMonth || months()[months().length - 1]));
    expect(r).toMatchObject({ budget: 0, gebruikt: 0, potjes: 0, deel: null, over: false });
  });

  test('de plan-tegels dragen geen alarmkleur', async ({ page }) => {
    await open(page, overschreden());
    const kleur = await page.evaluate(() => {
      go('ins');
      const t = [...document.querySelectorAll('#s-ins .wvo-tile')].find((x) => /uit je potjes/i.test(x.innerText));
      return t ? t.querySelector('.wvo-tv').getAttribute('style') : '';
    });
    expect(kleur).toContain('var(--txt)');
    expect(kleur).not.toMatch(/--red|--amber/);
  });
});

test.describe('d - de tegel leidt naar het instrument', () => {
  test('de tik opent de potjes, en elke rij opent zijn eigen potje', async ({ page }) => {
    await open(page, seed());
    const t = await potjesTegel(page);
    expect(t.tik).toBe('openReservedPotjes()');
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
        const rij = document.querySelector('#s-ins .wvo-tiles');
        if (!rij) return 0;
        const rb = rij.getBoundingClientRect();
        return [...rij.querySelectorAll('.wvo-tile')].filter((t) => t.getBoundingClientRect().right > rb.right + 1).length;
      });
      expect(buiten).toBe(0);
    });
  }
});
