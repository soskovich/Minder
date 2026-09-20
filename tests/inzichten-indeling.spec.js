// v241: Inzichten is herschikt. Geen cijfer verdwijnt, er komt niets bij; alleen de indeling.
//
// DE DRUKTE ZAT IN DE EERSTE KAART. insHeroKaart() laste twee vragen in één kader: waar sta ik nu,
// en wat komt er nog. Op 360px was die kaart 351px hoog en stond de onderkant van het tweede
// signaal op 602px terwijl er 567px zichtbaar is, dus je moest scrollen voordat je wist dat er nog
// iets onder zat. De kaart is gesplitst: de stand blijft een kaart (gemeten 120px), de posten
// worden een lijst onder de kop 'Wat er nog komt', en de signalen en de grafiek krijgen elk een
// eigen kop die zegt welke vraag hij beantwoordt.
//
// EEN RASTER SCAN JE, EEN LIJST LEES JE. De vier posten stonden als twee bij twee tegels met elk een
// kop in kapitalen en een derde regel eronder: twaalf tekstelementen voor een blok waar je er
// meestal één van zoekt. Het tegel-CSS blijft staan voor de terugval-kaart en voor maandKpiBlok()
// op Vermogen; de lijst heeft zijn eigen opmaak.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M = (n) => ym(new Date(now.getFullYear(), now.getMonth() - n, 1));

function seed(set, opt) {
  set = set || {}; opt = opt || {};
  const tx = []; let i = 0;
  const add = (m, d, a, naam, desc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const n of [3, 2, 1]) { const m = M(n);
    add(m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '28', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '05', -180, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '12', -90, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
  }
  if (!opt.geenSignalen) {
    add(CUR, '03', -160, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(CUR, '09', -95, 'Jumbo', 'BEA, BETAALPAS JUMBO');
    add(CUR, '15', -85, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(CUR, '06', -110, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    add(CUR, '13', -75, 'Cafe Zuid', 'BEA, BETAALPAS CAFE ZUID');
  } else {
    add(CUR, '03', -40, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([MAIN]),
    minder_accmeta: '{}', minder_plan: '{}',
    minder_set: JSON.stringify(Object.assign({ limit: 70, hideInternal: true, mode: 'begeleid',
      autoIncome: false, income: 3000, savingMode: 'amount', savingAmount: 300,
      manualBal: { [MAIN]: 2000 }, budgets: { boodschappen: 200, uiteten: 100, huur: 900 },
      budgetMonth: CUR }, set)) };
}
async function boot(page, payload, breedte, hoogte) {
  if (breedte) await page.setViewportSize({ width: breedte, height: hoogte || 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof insEyebrow === 'function');
  await page.evaluate(() => go('ins'));
}

test.describe('a · de pagina in volgorde', () => {
  test('eyebrow, stand-kaart, wat er nog komt, wat opvalt, over de maanden heen', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const el = document.querySelector('#s-ins');
      const blok = [...el.children];
      const idx = (sel) => { const n = el.querySelector(sel); return n ? blok.findIndex((c) => c.contains(n)) : -1; };
      return { eyebrow: idx('.ins-eyebrow'), stand: idx('.card'), nog: idx('#insNogLijst'),
        sig: idx('.valtop-rij, .valtop-patroon'), graf: idx('#insSpendCard'),
        secties: [...el.querySelectorAll('.inssec')].map((x) => x.textContent),
        kaarten: el.querySelectorAll('.card').length };
    });
    expect(uit.eyebrow).toBe(0);
    expect(uit.stand).toBe(1);
    expect(uit.nog).toBeGreaterThan(uit.stand);
    expect(uit.sig).toBeGreaterThan(uit.nog);
    expect(uit.graf).toBeGreaterThan(uit.sig);
    expect(uit.secties).toEqual(['Wat er nog komt', 'Wat opvalt', 'Over de maanden heen']);
    // de stand is het enige blok met een kader
    expect(uit.kaarten).toBe(1);
  });
});

test.describe('b · de hoogte tot de vouw', () => {
  /* De nulmeting van v240, met dezelfde fixture: de onderkant van het tweede signaal stond op 602px
     (360px breed) en 588px (390px breed), met een herokaart van 351 respectievelijk 337px.
     Na de splitsing is de kaart 120 respectievelijk 106px, maar de lijst kost meer hoogte dan het
     raster dat hij vervangt: vier posten van twee regels in plaats van twee rijen van twee kolommen.
     Wat deze test vastlegt is de gemeten uitkomst, zodat een volgende ronde ziet wat hij verschuift. */
  for (const [breedte, hoogte, past] of [[360, 640, false], [360, 800, true], [390, 844, true]]) {
    test(`${breedte}x${hoogte}: de signalen ${past ? 'passen' : 'passen niet'} in het eerste scherm`, async ({ page }) => {
      await boot(page, null, breedte, hoogte);
      const r = await page.evaluate(() => {
        const el = document.querySelector('#s-ins');
        const sig = [...el.querySelectorAll('.valtop-rij,.valtop-patroon')];
        const nav = document.querySelector('.nav') || document.querySelector('nav');
        const navH = nav ? Math.round(nav.getBoundingClientRect().height) : 0;
        return { aantal: sig.length,
          kaart: Math.round(el.querySelector('.card').getBoundingClientRect().height),
          bodem: Math.round(sig[sig.length - 1].getBoundingClientRect().bottom + window.scrollY),
          zichtbaar: window.innerHeight - navH };
      });
      expect(r.aantal).toBe(2);
      expect(r.kaart).toBeLessThan(200);                       // de kaart was 351/337px
      expect(r.bodem).toBeLessThanOrEqual(660);                // gemeten 630 / 616
      expect(r.bodem <= r.zichtbaar).toBe(past);
    });
  }
});

test.describe('c · wat er nog komt', () => {
  test('elke post een regel, bedragen rechts uitgelijnd, context op het scherm', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const rijen = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')];
      return rijen.map((t) => ({
        lab: (t.querySelector('.ins-nog-lab') || {}).innerText || '',
        val: (t.querySelector('.ins-nog-val') || {}).innerText || '',
        sub: (t.querySelector('.ins-nog-sub') || {}).innerText || '',
        subZichtbaar: !!t.querySelector('.ins-nog-sub') && t.querySelector('.ins-nog-sub').getBoundingClientRect().height > 0,
        rechts: Math.round(t.querySelector('.ins-nog-val').getBoundingClientRect().right),
        top: Math.round(t.getBoundingClientRect().top),
        uitlijning: getComputedStyle(t.querySelector('.ins-nog-val')).textAlign,
      }));
    });
    expect(r.length).toBeGreaterThanOrEqual(3);
    // elke post op zijn eigen regel
    for (let i = 1; i < r.length; i++) expect(r[i].top).toBeGreaterThan(r[i - 1].top);
    // de bedragen tegen dezelfde rechterkant, dus onderling vergelijkbaar
    expect(new Set(r.map((x) => x.rechts)).size).toBe(1);
    expect(new Set(r.map((x) => x.uitlijning))).toEqual(new Set(['right']));
    // en de context staat op het scherm, niet achter een tik
    for (const x of r) { expect(x.sub, x.lab).not.toBe(''); expect(x.subZichtbaar, x.lab).toBe(true); }
  });

  test('een post van nul blijft staan en leest niet als fout', async ({ page }) => {
    // alles betaald: er staat geen vaste last meer open deze maand
    await boot(page);
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const orig = window.monthLiquidity;
      window.monthLiquidity = () => Object.assign({}, orig(), { fixDue: 0, fixDueExclCount: 0 });
      renderIns();
      const t = [...document.querySelectorAll('#insNogLijst .ins-nog-rij')]
        .find((x) => /nog te betalen/i.test(x.innerText));
      const uit = t ? { val: t.querySelector('.ins-nog-val').innerText,
        kleur: t.querySelector('.ins-nog-val').getAttribute('style'),
        sub: t.querySelector('.ins-nog-sub').innerText } : null;
      window.monthLiquidity = orig; renderIns();
      return uit;
    });
    expect(r).not.toBeNull();
    expect(r.val).toBe('€0');
    expect(r.kleur).toContain('var(--mut)');          // gedempt, geen alarmkleur (v78/v93)
    expect(r.kleur).not.toContain('var(--red)');
    expect(r.sub).toMatch(/niets herkend|incasso/i);  // de reden staat erbij
  });
});

test.describe('d · de eyebrow', () => {
  test('kiezer en dagteller werken, en staan er precies een keer', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => document.querySelector('#s-ins').innerText);
    expect((t.match(/dag \d+ van \d+/g) || []).length).toBe(1);
    expect((t.match(/▾/g) || []).length).toBe(1);
    // de dagteller opent de budget-vergelijking
    await page.locator('#s-ins .ins-eyebrow span[onclick*="openBudgetCompare"]').click();
    await page.waitForSelector('#sheet .grab');
    expect((await page.locator('#sheet').innerText()).toLowerCase()).toMatch(/hoe doe je het deze maand/);
    await page.evaluate(() => closeSheet());
    // en de maandnaam opent de kiezer
    await page.locator('#s-ins .ins-eyebrow [onclick*="openMaandKiezer"]').click();
    await page.waitForSelector('#sheet .chips');
    expect((await page.locator('#sheet').innerText()).toLowerCase()).toContain('welke maand');
  });

  test('ook zonder data over deze maand staat de kiezer er een keer', async ({ page }) => {
    /* De "onbekend"-tak van insBudgetBlok() droeg zijn eigen maandKiezerKop(). Met de kiezer in de
       eyebrow stond hij daar twee keer zodra je laatste boeking van vóór deze maand is. */
    await boot(page);
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const orig = window.laatsteImport;
      window.laatsteImport = () => ({ datum: m + '-01' === m + '-01' ? '2000-01-05' : '' });
      renderIns();
      const el = document.querySelector('#s-ins');
      const uit = { tekst: el.innerText, kiezers: el.querySelectorAll('[onclick*="openMaandKiezer"]').length,
        bron: insBudgetBlok(m) };
      window.laatsteImport = orig; renderIns();
      return uit;
    });
    expect(r.tekst).toContain('onbekend');
    expect(r.kiezers).toBe(1);
    expect(r.bron).not.toContain('openMaandKiezer');   // de tak schrijft hem niet zelf
  });
});

test.describe('e · lege en afwijkende staten', () => {
  test('een maand zonder signalen laat geen lege kop achter', async ({ page }) => {
    await boot(page, seed({ budgets: { boodschappen: 900, huur: 900 } }, { geenSignalen: true }));
    const r = await page.evaluate(() => {
      const el = document.querySelector('#s-ins');
      return { sig: el.querySelectorAll('.valtop-rij, .valtop-patroon').length,
        secties: [...el.querySelectorAll('.inssec')].map((x) => x.textContent) };
    });
    expect(r.sig).toBe(0);
    expect(r.secties).not.toContain('Wat opvalt');
    expect(r.secties).toContain('Wat er nog komt');
  });

  test('zonder budget blijft de terugval via nogDezeMaandCard staan', async ({ page }) => {
    await boot(page, seed({ income: 0, budgets: {} }));
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const el = document.querySelector('#s-ins');
      return { blok: insBudgetBlok(m), tegels: el.querySelectorAll('.wvo-tiles').length,
        lijst: el.querySelectorAll('#insNogLijst').length,
        kop: (el.innerText.match(/NOG DEZE MAAND/g) || []).length,
        prompt: /stel in/i.test(el.innerText) };
    });
    expect(r.blok).toBe('');            // geen budget, dus de stand-kaart valt leeg terug
    expect(r.prompt).toBe(true);
    expect(r.tegels).toBe(1);           // de terugval-kaart houdt de tegelvorm
    expect(r.lijst).toBe(0);
    expect(r.kop).toBe(1);
  });

  test('Vermogen houdt zijn tegels onveranderd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('vermogen');
      const el = document.querySelector('#s-vermogen');
      const g = el.querySelector('.wvo-tiles');
      return { grid: g ? g.style.gridTemplateColumns : null,
        tegels: el.querySelectorAll('.wvo-tile').length,
        labels: el.querySelectorAll('.wvo-tl').length,
        lijst: el.querySelectorAll('.ins-nog-rij').length };
    });
    expect(r.tegels).toBeGreaterThan(0);
    expect(r.labels).toBe(r.tegels);
    expect(r.grid).toBe('1fr');
    expect(r.lijst).toBe(0);            // de lijstvorm blijft op Inzichten
  });
});

test.describe('f · de piekdagregel', () => {
  test('drie regels op het scherm, een lichtere rand, en geen tik', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      // een piekdag forceren via het signaal zelf, zodat de meting ongemoeid blijft
      const rij = insPatroonRij({ kpiLabel: 'Piekdag', kpiVal: 'zaterdag €522', kpiSub: 'normaal €128',
        hyp: 'Ongeveer 37% van je losse geld ging op zaterdag, tegen 9% in de drie maanden ervoor.',
        imp: 'Je losse geld lag deze maand sterker op een dag dan je gewend bent.',
        spiegel: true, act: '' }, 1);
      const d = document.createElement('div'); d.innerHTML = rij;
      document.querySelector('#s-ins').appendChild(d);
      const el = d.querySelector('.valtop-patroon');
      const uit = { regels: [...el.children].length, stil: el.classList.contains('valtop-stil'),
        stijl: el.getAttribute('style'), tik: el.getAttribute('onclick'),
        tekst: el.innerText.replace(/\s+/g, ' ') };
      d.remove(); return uit;
    });
    // kop, de zin met de twee percentages plus de observatie, en de regel dat er geen stap bij hoort
    expect(r.regels).toBe(3);
    expect(r.tekst).toContain('zaterdag €522');
    expect(r.tekst).toContain('normaal €128');
    expect(r.tekst).toContain('37%');
    expect(r.tekst).toContain('9%');
    expect(r.tekst).toContain('Alleen een observatie: hier hoort geen stap bij.');
    expect(r.tekst).not.toMatch(/gebruikelijke aandeel/);
    // de vorm zegt wat de laatste regel zegt: dunner dan een signaal waar je iets mee kunt
    expect(r.stil).toBe(true);
    expect(r.stijl).toContain('border-left:1px solid var(--mut2)');
    expect(r.tik).toBe(null);
    // en een signaal met een tik houdt de dikke rand
    const met = await page.evaluate(() => {
      const d = document.createElement('div');
      d.innerHTML = insPatroonRij({ kpiLabel: 'Grootste uitgave', kpiVal: '€484', kpiSub: 'Gemeente',
        hyp: 'Een winkel domineert je losse uitgaven.', imp: 'x', act: "openMerchant('GEMEENTE')" }, 0);
      return d.querySelector('.valtop-patroon').getAttribute('style');
    });
    expect(met).toContain('border-left:3px solid var(--mut2)');
  });

  test('de haarlijn scheidt de signalen, en staat niet boven de eerste', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => [...document.querySelectorAll('#insSignalRows > div')]
      .map((x) => (x.getAttribute('style') || '').includes('border-top')));
    expect(r.length).toBeGreaterThanOrEqual(2);
    expect(r[0]).toBe(false);
    for (let i = 1; i < r.length; i++) expect(r[i]).toBe(true);
  });
});
