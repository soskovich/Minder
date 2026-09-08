// v204: het blok "Nog deze maand" op Inzichten deed twee dingen tegelijk. Drie gelijkvormige
// tegels waarvan er een geen waarneming maar een plan was, met de vierde post als voetregel in de
// kleinste tekstgraad terwijl dat aan het begin van de maand de grootste uitgaande post is.
// De scheiding die er werkelijk is: waarneming tegenover plan. In twee kolommen zijn de rijen de
// scheiding. Er telt hier niets op, dus vier tegels suggereren geen waterval.
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
    add('i' + i, ACC, m, '25', 3200, 'Werkgever');
    add('h' + i, ACC, m, '02', -1200, 'Huur Woningstichting');
    add('n' + i, ACC, m, '03', -12, 'Netflix');
    // een vaste last laat in de maand, zodat er ook echt nog iets te betalen is
    if (!opt.allesBetaald) add('z' + i, ACC, m, '28', -95, 'Zilveren Kruis');
    if (!(i === 0 && opt.beginMaand)) {
      add('a' + i, ACC, m, '06', -420, 'Albert Heijn');
      add('r' + i, ACC, m, '11', -240, 'Restaurant De Kroeg');
    }
    add('s' + i, SPA, m, '04', 300, 'Naar spaarrekening');
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3200,
      manualBal: { [ACC]: 4200, [SPA]: 9000 }, savingsAcc: { [SPA]: true },
      budgets: opt.geenPotjes ? {} : { boodschappen: 700, uiteten: 300, abonnementen: 40 },
      savingMode: opt.geenSpaardoel ? 'amount' : 'amount',
      savingAmount: opt.geenSpaardoel ? 0 : 750,
      goals: [{ id: 'g1', naam: 'Auto', doel: 8000, gespaard: 1200, per: 200 },
              { id: 'g2', naam: 'Reis', doel: 3000, gespaard: 100, per: 0 },
              { id: 'g3', naam: 'Keuken', doel: 12000, gespaard: 0, per: 0 }],
      planPaused: { g3: true }, vooruitDoelOpen: true,
    }, set)),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof nogDezeMaandBody === 'function');
}

const blok = (page) => page.evaluate(() => {
  go('ins');
  const rij = document.querySelector('#s-ins .wvo-tiles');
  if (!rij) return null;
  return {
    kolommen: getComputedStyle(rij).gridTemplateColumns.split(' ').length,
    tegels: [...rij.querySelectorAll('.wvo-tile')].map((t) => ({
      label: (t.querySelector('.wvo-tl') || {}).innerText || '',
      waarde: (t.querySelector('.wvo-tv') || {}).innerText || '',
      sub: (t.querySelector('.wvo-ts') || {}).innerText || '',
      vol: /grid-column/.test(t.getAttribute('style') || ''),
      top: Math.round(t.getBoundingClientRect().top),
      tik: !!t.getAttribute('onclick'),
    })),
    naDeRij: rij.nextElementSibling ? rij.nextElementSibling.innerText.replace(/\s+/g, ' ') : '',
  };
});

test.describe('a · de rij scheidt waarneming van plan', () => {
  test('vier posten, twee kolommen, waarneming boven en plan onder', async ({ page }) => {
    await boot(page);
    const b = await blok(page);
    expect(b).not.toBeNull();
    expect(b.kolommen).toBe(2);
    expect(b.tegels.map((t) => t.label)).toEqual([
      'NOG TE BETALEN · VAST', 'NOG TE ONTVANGEN', 'NOG TE SPAREN', 'NOG UIT JE POTJES']);
    // de twee waarnemingen staan op dezelfde regel, de twee plan-posten op de volgende
    expect(b.tegels[0].top).toBe(b.tegels[1].top);
    expect(b.tegels[2].top).toBe(b.tegels[3].top);
    expect(b.tegels[2].top).toBeGreaterThan(b.tegels[0].top);
  });

  test('elke sub noemt zijn bron, dus de groepen dragen zichzelf', async ({ page }) => {
    await boot(page);
    const b = await blok(page);
    expect(b.tegels[0].sub).toMatch(/incasso|niets herkend/i);
    expect(b.tegels[1].sub).toBe('inkomen');
    expect(b.tegels[2].sub).toMatch(/van €|gehaald/);
    // v208: de potjes-tegel is een voortgang geworden, met dezelfde noemer-vorm als de tegel ernaast
    expect(b.tegels[3].sub).toMatch(/van €.*gebruikt|variabel/);
    // geen groepskoppen: de rij bestaat uit tegels en verder niets
    const koppen = await page.evaluate(() =>
      document.querySelectorAll('#s-ins .wvo-tiles > :not(.wvo-tile)').length);
    expect(koppen).toBe(0);
  });

  test('de variabele post is een tegel, geen voetregel meer', async ({ page }) => {
    await boot(page);
    const b = await blok(page);
    const pot = b.tegels[3];
    expect(pot.waarde).toMatch(/€/);
    expect(pot.tik).toBe(true);
    // de oude regel bestaat niet meer, in geen enkele vorm
    const src = await page.evaluate(() => nogDezeMaandBody.toString());
    expect(src).not.toMatch(/plus \$\{euro0\(varPlan\)\} variabel/);
    expect(src).not.toMatch(/text-align:right/);
    expect(b.naDeRij).toBe('');
  });
});

test.describe('b · er telt niets op in dit blok', () => {
  test('geen enkel getal is de som of het verschil van de andere', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('ins');                       // eerst renderen, dan pas de bronnen lezen
      let L = null; try { L = monthLiquidity(); } catch (_) {}
      let vp = 0; try { vp = varPlanRemaining(curMonth); } catch (_) {}
      let S = null; try { S = safeToSpend(); } catch (_) {}
      const eur = (t) => Math.abs(Math.round(parseFloat(String(t).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0));
      // let op: Inzichten draagt verderop nog een .wvo-tiles, dus alleen de eerste
      const rij = document.querySelector('#s-ins .wvo-tiles');
      return { getoond: [...rij.querySelectorAll('.wvo-tv')].map((x) => eur(x.innerText)),
               fix: Math.round(L.fixDue), inc: Math.round(L.incDue), vp: Math.round(vp),
               spaar: S ? Math.round(Math.max(S.saveReserved, 0)) : 0 };
    });
    // elk getoond getal komt uit precies een bron, geen enkele is een combinatie
    const bronnen = [r.fix, r.inc, r.spaar, r.vp];
    for (const g of r.getoond) expect(bronnen, JSON.stringify(r)).toContain(g);
    // en de combinaties die de weggehaalde chip toonde staan er niet
    for (const combi of [r.inc - r.fix - r.vp, r.fix + r.vp, r.inc - r.fix, r.fix + r.vp + r.spaar]) {
      if (bronnen.includes(Math.abs(combi))) continue;      // toevallig gelijk aan een bron telt niet
      expect(r.getoond).not.toContain(Math.abs(combi));
    }
  });

  test('de bron rekent niets samen', async ({ page }) => {
    await boot(page);
    // commentaar telt niet: de v169-notitie noemt bedragen met een minteken erin
    const src = await page.evaluate(() => nogDezeMaandBody.toString()
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, ''));
    // geen aftrekking of optelling tussen de drie posten (dat was de chip van v192)
    expect(src).not.toMatch(/incDue\s*-\s*/);
    expect(src).not.toMatch(/teOntvangen\s*-\s*teBetalen/);
    expect(src).not.toMatch(/varPlan\s*\+\s*teBetalen/);
    expect(src).not.toMatch(/eigen kracht|vrij n[aá] sparen/i);
  });
});

test.describe('c · een oneven laatste tegel neemt de volle breedte', () => {
  test('zonder potjes: drie tegels, de laatste vult de rij', async ({ page }) => {
    await boot(page, seed({}, { geenPotjes: true }));
    const b = await blok(page);
    expect(b.tegels.length).toBe(3);
    expect(b.tegels[2].vol).toBe(true);
    expect(b.tegels[0].vol).toBe(false);
    const breed = await page.evaluate(() => {
      const t = [...document.querySelectorAll('#s-ins .wvo-tiles .wvo-tile')];
      return { laatste: Math.round(t[2].getBoundingClientRect().width),
               eerste: Math.round(t[0].getBoundingClientRect().width) };
    });
    expect(breed.laatste).toBeGreaterThan(breed.eerste * 1.8);
  });

  test('zonder spaardoel: drie tegels, ook dan vult de laatste de rij', async ({ page }) => {
    await boot(page, seed({}, { geenSpaardoel: true }));
    const b = await blok(page);
    expect(b.tegels.length).toBe(3);
    expect(b.tegels[2].label).toBe('NOG UIT JE POTJES');
    expect(b.tegels[2].vol).toBe(true);
  });

  test('zonder spaardoel en zonder potjes: twee tegels, geen halve rij', async ({ page }) => {
    await boot(page, seed({}, { geenSpaardoel: true, geenPotjes: true }));
    const b = await blok(page);
    expect(b.tegels.length).toBe(2);
    expect(b.tegels.some((t) => t.vol)).toBe(false);
    expect(b.tegels[0].top).toBe(b.tegels[1].top);
  });
});

test.describe('d · de vier situaties uit de controlelijst', () => {
  test('halverwege de maand', async ({ page }) => {
    await boot(page);
    const b = await blok(page);
    expect(b.tegels.length).toBe(4);
    expect(b.tegels[0].waarde).toMatch(/€/);      // er staat nog een vaste last open
  });

  test('aan het begin van de maand is de potjes-post de grootste', async ({ page }) => {
    await boot(page, seed({}, { beginMaand: true }));
    const b = await blok(page);
    const eur = (s) => Math.abs(parseFloat(String(s).replace(/[^\d,-]/g, '').replace(/\./g, '').replace(',', '.')) || 0);
    const pot = eur(b.tegels[3].waarde), spaar = eur(b.tegels[2].waarde);
    expect(pot).toBeGreaterThan(spaar);
    // en hij staat in dezelfde vorm als zijn buurman, niet meer in de kleinste graad
    const zelfde = await page.evaluate(() => {
      const t = [...document.querySelectorAll('#s-ins .wvo-tiles .wvo-tv')];
      return getComputedStyle(t[2]).fontSize === getComputedStyle(t[3]).fontSize;
    });
    expect(zelfde).toBe(true);
  });

  test('met alles betaald blijft de tegel staan en kleurt hij niet rood', async ({ page }) => {
    await boot(page, seed({}, { allesBetaald: true }));
    const b = await blok(page);
    expect(b.tegels[0].label).toBe('NOG TE BETALEN · VAST');
    const kleur = await page.evaluate(() => {
      const t = document.querySelector('#s-ins .wvo-tiles .wvo-tile .wvo-tv');
      return t.getAttribute('style') || '';
    });
    expect(kleur).toMatch(/--mut/);
  });

  test('zonder potjes verdwijnt de potjes-tegel en niet de rest', async ({ page }) => {
    await boot(page, seed({}, { geenPotjes: true }));
    const b = await blok(page);
    expect(b.tegels.map((t) => t.label)).not.toContain('NOG UIT JE POTJES');
    expect(b.tegels.map((t) => t.label)).toContain('NOG TE ONTVANGEN');
  });
});

test.describe('e · de plan-rij houdt drie rollen en herhaalt de uitleg niet', () => {
  test('een wachtend doel noemt status en modus, en verder niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('vooruit');
      const rij = [...document.querySelectorAll('#s-vooruit .plan-item')]
        .find((x) => /Wacht op capaciteit/.test(x.innerText));
      const onder = document.getElementById('planWacht');
      return { rij: rij ? rij.innerText.replace(/\s+/g, ' ') : '',
               onder: onder ? onder.innerText.replace(/\s+/g, ' ') : '' };
    });
    expect(r.rij).toMatch(/Wacht op capaciteit . auto/);
    // de uitleg staat niet meer in de rij
    expect(r.rij).not.toMatch(/gaat eerst naar de doelen erboven/);
    expect(r.rij).not.toMatch(/pakt wat er nog is/);
    // maar wel een keer, onder de lijst
    expect(r.onder).toMatch(/pakt nu alles wat er overblijft/);
  });

  test('een lopend, een wachtend en een gepauzeerd doel dragen elk drie rollen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('vooruit');
      return [...document.querySelectorAll('#s-vooruit .plan-item')].map((x) => ({
        tekst: x.innerText.replace(/\s+/g, ' '),
        balk: x.querySelectorAll('.bar-track').length,
        keuze: x.querySelectorAll('.plan-mv, .plan-act, [onclick]').length,
      }));
    });
    const lopend = r.find((x) => /op dit tempo/.test(x.tekst));
    const wacht = r.find((x) => /Wacht op capaciteit/.test(x.tekst));
    const pauze = r.find((x) => /Gepauzeerd/.test(x.tekst));
    for (const x of [lopend, wacht, pauze]) {
      expect(x, JSON.stringify(r.map((y) => y.tekst))).toBeTruthy();
      expect(x.tekst).toMatch(/toegewezen \/ €/);   // spiegel
      expect(x.balk).toBe(1);
      expect(x.keuze).toBeGreaterThan(0);           // keuze
    }
    expect(pauze.tekst).toMatch(/Gepauzeerd . krijgt nu niets/);   // gevolg
  });

  test('planModeLabel legt niet meer uit wat auto doet', async ({ page }) => {
    await boot(page);
    // op de uitkomst toetsen en niet op de bron: het commentaar noemt de oude tekst
    expect(await page.evaluate(() => planModeLabel({ mode: 'auto' }))).toBe('auto');
    // de andere twee takken blijven een feit met een bedrag of percentage
    expect(await page.evaluate(() => planModeLabel({ mode: 'fixed', perMaand: 200 }))).toMatch(/vast €/);
  });
});

test.describe('f · layout', () => {
  for (const w of [360, 390]) {
    test(`de tegelrij past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 820 });
      await boot(page);
      await page.evaluate(() => go('ins'));
      const r = await page.evaluate(() => {
        const rij = document.querySelector('#s-ins .wvo-tiles');
        return { over: document.body.scrollWidth - document.body.clientWidth,
                 rijOver: rij.scrollWidth - rij.clientWidth,
                 rijen: new Set([...rij.querySelectorAll('.wvo-tile')]
                   .map((t) => Math.round(t.getBoundingClientRect().top))).size };
      });
      expect(r.over).toBeLessThanOrEqual(1);
      expect(r.rijOver).toBeLessThanOrEqual(1);
      expect(r.rijen).toBe(2);
    });
  }
});
