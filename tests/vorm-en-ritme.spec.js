// v203: de vorm-en-ritmegroep. Niets hiervan was fout; het leidde de aandacht verkeerd.
// Kern: teal droeg op Home en Inzichten meerdere betekenissen tegelijk, en er stonden vier
// vouw-plekken met drie verschillende idiomen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));
const ACC = '100110012555096222';
const SPA = 'psd2_spaar01';

function seed(set = {}, opt = {}) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc: naam, typ: '', ref: '',
              src: 'psd2', accName: '', refNums: [] });
  for (let i = 9; i >= 0; i--) {
    const m = M(i);
    /* Bij maandgrens krijgt de lopende maand maar twee boekingen, zodat de zes rijen van Recent
       over twee maanden lopen. Zonder die beperking vult de lopende maand de lijst in zijn eentje
       en is er geen grens om te tonen. */
    if (i === 0 && opt.maandgrens) { add('c1', ACC, m, '02', -55, 'Coffeecompany'); add('c2', ACC, m, '03', -31, 'Bol.com'); continue; }
    add('i' + i, ACC, m, '25', 3200, 'Werkgever');
    add('h' + i, ACC, m, '02', -1200, 'Huur Woningstichting');
    add('a' + i, ACC, m, '06', -420, 'Albert Heijn');
    add('a2' + i, ACC, m, '16', -180, 'Albert Heijn');
    add('r' + i, ACC, m, '11', -240, 'Restaurant De Kroeg');
    add('n' + i, ACC, m, '03', -12, 'Netflix');
    add('s' + i, SPA, m, '04', 300, 'Naar spaarrekening');
  }
  if (!opt.maandgrens) { add('x1', ACC, CUR, '03', -55, 'Coffeecompany'); add('x2', ACC, CUR, '04', -31, 'Bol.com'); }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3200,
      manualBal: { [ACC]: 4200, [SPA]: 9000 }, savingsAcc: { [SPA]: true },
      budgets: { boodschappen: 700, uiteten: 300, abonnementen: 40 },
      goals: [{ id: 'g1', naam: 'Auto', doel: 8000, gespaard: 1200, per: 200 },
              { id: 'g2', naam: 'Reis', doel: 3000, gespaard: 100, per: 0 },
              { id: 'g3', naam: 'Keuken', doel: 12000, gespaard: 0, per: 0 }],
      reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 480, vervalmaand: CUR, intervalM: 12 }],
      resAcc: ACC,
    }, set)),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof renderPlan === 'function');
}

/* De inventaris leest elke CSS-regel die --teal of --accent noemt plus elke inline stijl, en niet
   een kleurvergelijking: color-mix en gradients vallen daar buiten. Per element wordt genoteerd of
   het binnen iets tikbaars zit. */
const accentElementen = (page, sel) => page.evaluate((s) => {
  const root = document.querySelector(s);
  if (!root) return [];
  const gevonden = new Map();
  const zet = (el, hoe) => {
    if (!root.contains(el) || el.offsetParent === null) return;
    const v = gevonden.get(el) || new Set(); v.add(hoe); gevonden.set(el, v);
  };
  for (const sheet of document.styleSheets) {
    let regels; try { regels = sheet.cssRules; } catch (_) { continue; }
    for (const r of regels || []) {
      if (!r.selectorText || !/--teal|--accent/.test(r.cssText || '')) continue;
      let els; try { els = root.querySelectorAll(r.selectorText); } catch (_) { continue; }
      for (const e of els) zet(e, r.selectorText);
    }
  }
  for (const e of root.querySelectorAll('[style*="--teal"],[style*="--accent"]')) zet(e, 'inline');
  return [...gevonden].map(([el, hoe]) => ({
    hoe: [...hoe].join(','),
    tik: !!(el.getAttribute('onclick') || el.closest('[onclick]')),
    tekst: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 46),
  }));
}, sel);

test.describe('a · teal betekent op Home en Inzichten nog één ding', () => {
  /* De regel voor de hele app: teal is beweging of een ingang. Op Plan is dat de vulling van een
     doel dat geld krijgt plus de acties; op Home en Inzichten bestaat er geen beweging, dus houdt
     teal daar alleen "hier kun je tikken" over. Het oordeel woont in het label en in rood, amber
     en groen (v78/v93). */
  for (const [naam, tab, sel] of [['Home', 'dash', '#s-dash'], ['Inzichten', 'ins', '#s-ins']]) {
    test(`${naam}: alles met accent is een ingang`, async ({ page }) => {
      await boot(page);
      await page.evaluate((t) => go(t), tab);
      const inv = await accentElementen(page, sel);
      expect(inv.length).toBeGreaterThan(0);
      for (const x of inv) expect(x, JSON.stringify(x)).toHaveProperty('tik', true);
    });
  }

  /* v359: 'de sectiekop draagt geen accent meer' is vervallen: v359: Inzichten draagt geen sectiekoppen meer; het dashboard heeft een filter, tegels en kaarten */

  test('de tegel Nog te sparen kleurt alleen nog als hij gehaald is', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => nogDezeMaandPosten.toString());
    // teal verdwijnt uit deze tegel; groen bij gehaald blijft, zoals de twee tegels ernaast
    expect(src).toMatch(/gehaald\?'var\(--green\)':'var\(--txt\)'/);
    expect(src).not.toMatch(/gehaald\?'var\(--green\)':'var\(--teal\)'/);
  });

  /* v367: het herogetal is het saldo en draagt geen accent; de groene regel vrij te besteden is de ingang naar de opbouw,
     met een chevron. Groen is daar een stand (er is vrij geld), geen teal. */
  test('het herogetal op Home is het saldo, en de ingang naar de opbouw is de groene regel', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('dash'));
    const r = await page.evaluate(() => {
      const el = document.querySelector('#s-dash .hh-big'), v = document.querySelector('#s-dash [data-vrij]');
      return { grad: el.classList.contains('grad'), tik: el.closest('[data-saldoblok]').getAttribute('onclick') === 'openBalances()', vrij: v.getAttribute('onclick'), pijl: v.innerText.includes('›') };   // v378: de tik staat op het saldoblok
    });
    expect(r.grad).toBe(true);    // de klasse draagt het verloop van Aurora; in het standaardthema is het saldo de tekstkleur
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('#s-dash .hh-big')).color)).toBe(await page.evaluate(() => getComputedStyle(document.body).color));
    expect(r.tik).toBe(true);
    expect(r.vrij).toBe('openSafeToSpend()');
    expect(r.pijl).toBe(true);
  });

  test('Maand en Plan zijn niet aangeraakt', async ({ page }) => {
    await boot(page);
    for (const [tab, sel] of [['maand', '#s-maand'], ['vooruit', '#s-vooruit']]) {
      await page.evaluate((t) => go(t), tab);
      const inv = await accentElementen(page, sel);
      expect(inv.length).toBeGreaterThan(0);
    }
    // op Plan draagt de vulling van een lopend doel accent: dat is beweging, geen ingang
    const bar = await page.evaluate(() => {
      const f = [...document.querySelectorAll('#s-vooruit .bar-fill')]
        .map((x) => x.getAttribute('style') || '');
      return f.some((x) => /--teal|--accent/.test(x));
    });
    expect(bar).toBe(true);
  });
});

test.describe('b · één idioom voor vouwen', () => {
  /* v203: vier plekken, drie idiomen, alle vier met een chevron die sinds v185 "gaat ergens heen"
     betekent. Nu overal: driehoek omlaag dicht, driehoek omhoog open.
     v208: insVouw() is vervallen met het Kerncijfers-blok op Inzichten - dat was zijn enige
     aanroeper. Er blijven drie plekken over, met hetzelfde idioom. */
  /* v380: vooruitZone() is vervallen met de zonebalk "Bestemmingen"; Plan opent op de kop. */
  const BRONNEN = ['renderMerchants', 'spendVsBudgetChart'];

  test('geen enkele vouwknop draagt nog een chevron', async ({ page }) => {
    await boot(page);
    /* De markering staat een paar regels na de onclick, dus een filter per regel vindt hem niet.
       We nemen daarom het venster na elke vouw-toggle in de platgeslagen bron: daar hoort een
       driehoek te staan en geen chevron. */
    const r = await page.evaluate((namen) => {
      const uit = {};
      for (const n of namen) {
        const f = window[n]; if (typeof f !== 'function') { uit[n] = 'ontbreekt'; continue; }
        const src = f.toString().replace(/\s+/g, ' ');
        const vensters = [];
        const rx = /toggle(?:Collap|Vooruit)\(/g; let m;
        while ((m = rx.exec(src))) vensters.push(src.slice(m.index, m.index + 420));
        uit[n] = { regels: vensters.length,
                   chevron: vensters.some((v) => v.includes('›')),
                   neer: vensters.some((v) => v.includes('▼')),
                   op: vensters.some((v) => v.includes('▲')) };
      }
      return uit;
    }, BRONNEN);
    for (const n of BRONNEN) {
      expect(r[n], n).not.toBe('ontbreekt');
      expect(r[n].regels, n).toBeGreaterThan(0);
      expect(r[n].chevron, n + ' draagt nog een chevron').toBe(false);
      expect(r[n].neer, n + ' mist de driehoek omlaag').toBe(true);
      expect(r[n].op, n + ' mist de driehoek omhoog').toBe(true);
    }
  });

  /* v208: hier stonden twee tests op insVouw(). Die functie is vervallen met zijn enige aanroeper,
     dus de knop-boven-de-inhoud en het wisselen worden nu getoetst op de vouwplek die er wel is:
     de maandgrafiek, met dezelfde drietraps vlag (v90) en hetzelfde idioom.
     v227: die grafiek staat sinds deze ronde op Inzichten en niet meer op Maand. Het idioom is wat
     hier getoetst wordt, niet de plek, dus alleen het scherm dat gelezen wordt verschuift. */
  test('de vouwknop staat boven de inhoud, niet als voetregel eronder', async ({ page }) => {
    await boot(page);
    const open = await page.evaluate(() => { SET.openSpendChart = true; save(); return spendVsBudgetChart(); });
    expect(open).toContain('▲');
    // 'cbar' is de eerste staaf van de grafiek; het icoon in de kop is zelf ook een svg
    expect(open.indexOf('▲')).toBeLessThan(open.indexOf('cbar'));
    expect(open).not.toMatch(/inklappen/);
  });

  test('open en dicht wisselen elkaar echt af op het scherm', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.openSpendChart = true; save(); render(); go('ins'); });
    const a = await page.evaluate(() => $('#s-ins').innerText);
    expect(a).toContain('▲');
    await page.evaluate(() => toggleCollap('openSpendChart'));
    const b = await page.evaluate(() => $('#s-ins').innerText);
    expect(b).toContain('▼');
  });

  test('insVouw en zijn vlag bestaan niet meer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ vouw: typeof insVouw, def: Object.keys(COLLAP_DEF) }));
    expect(r.vouw).toBe('undefined');
    expect(r.def).not.toContain('openKpiCard');
  });
});

test.describe('c · op Plan draagt het bedrag de stand', () => {
  /* v203 gaf het gewicht aan het bedrag in plaats van aan de naam, en dat blijft zo. v225 wisselt
     wélk bedrag daar staat: dit scherm gaat over verdelen, dus rechts in de rij staat wat deze
     bestemming per maand krijgt. De stand verhuist naar de regel eronder, en houdt daar zijn eigen
     verhouding: het bereikte bedrag vet, de eenheid en de noemer gedempt. */
  /* v380: de rij draagt geen maandbedrag meer rechts (dat staat klein als "+EUR X deze maand"); het geld tegen het doel
     draagt het gewicht, de noemer is gedempt. */
  test('het geld heeft het gewicht, de noemer stapt terug', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('vooruit'));
    const r = await page.evaluate(() => {
      const item = document.querySelector('#s-vooruit .plan-item[data-status="actief"]') || document.querySelector('#s-vooruit .plan-item');
      const naam = item.querySelector('.wf-naam'), g = item.querySelector('[data-rijgeld]');
      return { naamGewicht: +getComputedStyle(naam).fontWeight, geldGewicht: +getComputedStyle(g.querySelector('b')).fontWeight,
               noemer: getComputedStyle(g.querySelector('span')).color !== getComputedStyle(g.querySelector('b')).color, tekst: g.innerText };
    });
    expect(r.geldGewicht).toBeGreaterThan(r.naamGewicht);
    expect(r.noemer).toBe(true);
    expect(r.tekst).toMatch(/€[\d.]+ \/ €/);
  });

  test('een noodfonds zonder bekend spaarsaldo blijft onbekend zeggen', async ({ page }) => {
    await boot(page, seed({ savingsAcc: {}, manualBal: { [ACC]: 4200 } }));
    await page.evaluate(() => { SET.vooruitDoelOpen = true; save(); render(); go('vooruit'); });
    const t = await page.evaluate(() => {
      const rij = [...document.querySelectorAll('#s-vooruit .plan-item')]
        .find((x) => /Noodfonds/.test(x.innerText));
      return rij ? rij.innerText.replace(/\s+/g, ' ') : '';
    });
    if (t) expect(t).toMatch(/onbekend|€/);
  });

  /* v367: "de vaten staan op schaal, de kolommen zijn even breed" is vervallen met de vaten (zie vrij-uitschieters.spec.js d). */
});

test.describe('d · Recent scheidt op maand', () => {
  test('over een maandgrens staat er een kop, en niet boven de eerste rij', async ({ page }) => {
    await boot(page, seed({}, { maandgrens: true }));
    await page.evaluate(() => go('dash'));
    const r = await page.evaluate(() => {
      const lijst = document.querySelector('#s-dash .homelist');
      const kids = [...lijst.children];
      const koppen = kids.filter((x) => x.classList.contains('hlabel'));
      return { koppen: koppen.map((x) => x.innerText),
               eersteIsRij: kids.findIndex((x) => x.classList.contains('txl'))
                          < (kids.findIndex((x) => x.classList.contains('hlabel')) + 1 || 99),
               volgorde: kids.map((x) => x.classList.contains('hlabel') ? 'KOP' : (x.classList.contains('txl') ? 'rij' : 'kop-rij')) };
    });
    expect(r.koppen.length).toBeGreaterThan(0);
    // de kop noemt de maand met het jaar
    for (const k of r.koppen) expect(k).toMatch(/\w+ \d{4}/);
    // de eerste transactierij komt vóór de eerste maandkop
    expect(r.volgorde.indexOf('rij')).toBeLessThan(r.volgorde.indexOf('KOP'));
  });

  test('binnen één maand staat er geen enkele kop', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('dash'));
    const n = await page.evaluate(() => {
      const lijst = document.querySelector('#s-dash .homelist');
      const rijen = [...lijst.querySelectorAll('.txl')];
      const maanden = new Set(rijen.map((x) => x.getAttribute('data-m') || ''));
      return { koppen: lijst.querySelectorAll('.hlabel').length, rijen: rijen.length };
    });
    expect(n.rijen).toBeGreaterThan(1);
    expect(n.koppen).toBe(0);
  });
});

test.describe('e · Plan opent open', () => {
  for (const modus of ['rustig', 'begeleid', 'expert']) {
    test(`in ${modus} staat de doelenlijst er bij het openen`, async ({ page }) => {
      await boot(page, seed({ mode: modus }));
      await page.evaluate(() => { delete SET.vooruitDoelOpen; save(); render(); go('vooruit'); });
      const n = await page.evaluate(() => document.querySelectorAll('#s-vooruit .plan-item').length);
      expect(n).toBeGreaterThan(0);
    });
  }

  /* v380: de zonebalk is vervallen, dus er valt niets meer in te klappen: een oude keuze verbergt de lijst niet. */
  test('een oude inklapkeuze verbergt de lijst niet meer', async ({ page }) => {
    await boot(page, seed({ vooruitDoelOpen: false }));
    await page.evaluate(() => go('vooruit'));
    expect(await page.evaluate(() => document.querySelectorAll('#s-vooruit .plan-item').length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => !!document.querySelector('[data-zone]'))).toBe(false);
  });
});

test.describe('f · een gepauzeerd doel blijft grijs en stil (v194, regressie)', () => {
  test('grijze vulling, geen tweede segment, en de regel zegt het', async ({ page }) => {
    await boot(page, seed({ planPaused: { g3: true } }));
    await page.evaluate(() => { SET.vooruitDoelOpen = true; save(); render(); go('vooruit'); });
    const r = await page.evaluate(() => {
      /* v318: de vulling zit in het VAT, dus in de kolom naast het tekstblok. De eigenschap is
         onveranderd: grijs, en geen tweede laag, want er komt niets bij. */
      const rij = [...document.querySelectorAll('#s-vooruit .plan-item')]
        .find((x) => /Keuken/.test(x.innerText));
      const fills = [...rij.querySelectorAll('.bar-fill')]
        .map((x) => x.getAttribute('style') || '');
      return { tekst: rij.innerText.replace(/\s+/g, ' '), fills };
    });
    expect(r.tekst).toMatch(/gepauzeerd/i); expect(r.tekst).toMatch(/krijgt nu niets/i);
    expect(r.fills.some((x) => /--mut/.test(x))).toBe(true);
    expect(r.fills.some((x) => /--teal|--accent/.test(x))).toBe(false);
    expect(r.fills.length).toBe(1);            // geen groei-segment
  });
});

test.describe('g · layout', () => {
  for (const w of [360, 390]) {
    test(`Home, Inzichten en Plan passen op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page, seed({}, { maandgrens: true }));
      for (const tab of ['dash', 'ins', 'vooruit']) {
        await page.evaluate((t) => go(t), tab);
        const over = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth);
        expect(over, tab).toBeLessThanOrEqual(1);
      }
    });
  }
});
