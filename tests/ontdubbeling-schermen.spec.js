// v186: de groep "dubbeling tussen schermen". Twee items gebouwd.
// (2) 'Patroon van de maand' las maandPatroon(), en dat filtert scoreNotifs() op budget-, discr- en
//     tempo. Die dragen alle drie h:'direct', dus het was letterlijk dezelfde melding die ook in de
//     meldingenlijst staat. De horizon-indeling uit v162 zegt waar een signaal hoort: structureel
//     op Maand, direct en correctie in de lijst.
// (5) 'Valt op' en de lek-vraag waren twee identiek vormgegeven kaarten die tegelijk renderden,
//     over dezelfde soort bevinding. Nu een kaart: de bevinding, met het gesprek als voetregel.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [3, 2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[3];
const MAIN = 'NL01MAIN0000001111';
const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
const dd = (n) => String(Math.max(1, Math.min(n, dim))).padStart(2, '0');

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a, acc: MAIN,
    name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of MS) {
    add(m, '02', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, dd(4), -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  // een forse losse uitgave deze maand: hier komt zowel een melding als een lek uit
  if (o.uitschieter !== false) add(CUR, dd(5), -420, 'Mediamarkt', 'BEA, BETAALPAS MEDIAMARKT');
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 4000 }, budgets: { huur: 900, boodschappen: 400 },
    reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 300, interval: 12, maand: 6 }],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandRegels === 'function' && TX.length > 0);
}
const scherm = async (page, n) => { await page.evaluate((x) => go(x), n); await page.waitForTimeout(90);
  return page.evaluate((x) => $('#s-' + x).innerText.replace(/\s+/g, ' '), n); };

test.describe('a · het patroon staat op precies één plek', () => {
  test('het is geen maandregel meer', async ({ page }) => {
    await boot(page);
    const keys = await page.evaluate(() => maandRegels().map((r) => r.key));
    expect(keys).not.toContain('patroon');
    expect(keys.every((k) => ['dekking', 'buffer', 'doel'].includes(k))).toBe(true);
    expect(await page.evaluate(() => MAAND_VOLGORDE)).toEqual(['dekking', 'buffer', 'doel']);
    expect(await scherm(page, 'maand')).not.toContain('Patroon van de maand');
  });

  test('de melding waar hij op leunde heeft horizon direct, dus hoort in de lijst', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const p = maandPatroon();
      return p ? { key: p.key, h: p.h, inLijst: notifList().some((n) => n.key === p.key) } : null;
    });
    test.skip(!r, 'deze fixture levert geen patroonsignaal');
    expect(r.h).toBe('direct');
    expect(r.inLijst).toBe(true);
  });

  test('maandPatroon blijft bestaan, maar alleen voor het verband', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof maandPatroon)).toBe('function');
    const src = await page.evaluate(() => maandVerband.toString());
    expect(src).toContain('maandPatroon()');
    /* En maandRegels roept hem niet meer aan. Commentaar telt niet als aanroep: de functie legt in
       een comment uit welke regel er stond en waarom hij weg is (dezelfde meetfout als v164). */
    const kaal = (await page.evaluate(() => maandRegels.toString()))
      .replace(/\/\*[\s\S]*?\*\//g, ' ').split(String.fromCharCode(10))
      .map((r) => r.replace(/(^|[^:\w])\/\/.*$/, '$1')).join(' ');
    expect(kaal).not.toContain('maandPatroon');
  });

  test('het gesprek kent de sleutel niet meer en valt netjes terug', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => CO_MAAND_REGELS)).not.toContain('patroon');
    expect(await page.evaluate(() => coMaandRegel('patroon'))).toBeFalsy();
  });
});

test.describe('b · één kaart voor wat opvalt', () => {
  test('de bevinding en de ingang staan in dezelfde kaart', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    await page.waitForTimeout(90);
    const ids = await page.evaluate(() => [...document.querySelectorAll('#s-ins > *')].map((e) => e.id || ''));
    expect(ids).not.toContain('insLekVraag');
    expect(ids.filter((x) => x === 'wvoLine').length).toBeLessThanOrEqual(1);
    if (ids.includes('wvoLine')) {
      const html = await page.locator('#wvoLine').innerHTML();
      expect((html.match(/coStart\('lek'/g) || []).length).toBeLessThanOrEqual(1);
    }
  });

  test('twee identieke kaarten onder elkaar bestaan niet meer', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    const n = await page.evaluate(() => document.querySelectorAll('#s-ins [onclick*="coStart(\'lek\'"]').length);
    expect(n).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => typeof window.insLekVraag)).toBe('undefined');
  });

  test('zonder bevinding en zonder lek rendert er niets', async ({ page }) => {
    await boot(page, seed({ uitschieter: false }));
    const html = await page.evaluate((m) => whatStandsOutLine(m, true), CUR);
    const r = await page.evaluate((m) => {
      let top = null;
      try { const mv = monthVsPrevInner(m);
        const ex = new Set([...mv.drivers, ...budgetFlaggedCats(m)]);
        top = insSignals(m, ex).sort((a, b) => b.pri - a.pri)[0] || null; } catch (_) {}
      let L = null; try { const W = coachWeekRisk(m); if (W && W.tone === 'warn') L = coachLeak(m); } catch (_) {}
      return { top: !!top, lek: !!L };
    }, CUR);
    if (!r.top && !r.lek) expect(html).toBe('');
    else expect(html).not.toBe('');
  });

  test('op een afgesloten maand komt de gespreksingang niet mee', async ({ page }) => {
    await boot(page);
    const ms = await page.evaluate(() => months());
    test.skip(ms.length < 2, 'geen afgesloten maand');
    const vorige = ms[ms.length - 2];
    const html = await page.evaluate((m) => whatStandsOutLine(m, false), vorige);
    expect(html).not.toContain("coStart('lek'");
  });

  test('de kaart houdt de duiding en het dus-wat uit v174', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => whatStandsOutLine.toString());
    expect(src).toContain('top.hyp');
    expect(src).toContain('top.imp');
    expect(src).toContain('Alleen een observatie');
  });
});

test.describe('c · de keuze staat vast, zodat de tweede niet terugkomt', () => {
  test('geen enkele maandregel leest scoreNotifs met horizon direct', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => (maandRegels() || []).map((x) => ({ key: x.key, sig: !!x.sig })));
    for (const x of r) expect(x.sig, x.key).toBe(false);
  });

  test('Inzichten toont geen enkele maandregel, en Maand geen lek-ingang', async ({ page }) => {
    await boot(page);
    const ins = await scherm(page, 'ins');
    const maand = await scherm(page, 'maand');
    expect(ins).not.toContain('Patroon van de maand');
    expect(maand).not.toMatch(/kunt doen\?/);
    expect(await page.evaluate(() => ($('#s-maand').innerHTML || '')))
      .not.toContain("coStart('lek'");
  });
});

test.describe('d · de coach-inzichten hebben één bron', () => {
  test('renderBehavior bestaat niet meer, en coachItems heeft geen lezer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => typeof window.renderBehavior)).toBe('undefined');
    expect(await page.evaluate(() => typeof coachItems)).toBe('function');
    const kaal = (await page.evaluate(() => renderIns.toString()))
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(kaal).not.toContain('coachItems');
    expect(kaal).not.toContain('renderBehavior');
    expect(kaal).not.toContain('openBehavior');
  });

  test('de vier regels staan in de signalen-engine, niet op een derde oppervlak', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => scoreNotifs.toString());
    for (const k of ['savrules', 'meevaller', 'inflatie', 'overstreak']) expect(src).toContain(`key:'${k}'`);
    await page.evaluate(() => go('ins'));
    const ins = await page.evaluate(() => $('#s-ins').innerText);
    expect(ins).not.toMatch(/gedrag/i);
  });
});

test.describe('e · de over-budget-observatie staat op één plek', () => {
  test('hij is de eerste bron van de Valt-op-kaart', async ({ page }) => {
    const p = seed({ set: { budgets: { huur: 900, boodschappen: 100 } } });   // boodschappen loopt over
    await boot(page, p);
    const ov = await page.evaluate((m) => budgetOverCat(m), CUR);
    test.skip(!ov, 'deze fixture levert geen overschrijding');
    const html = await page.evaluate((m) => whatStandsOutLine(m, true), CUR);
    expect(html).toContain(ov.name);
    expect(html).toContain('loopt uit de pas');
    expect(html).toContain(`openCategory('${ov.k}')`);
    // geen nieuwe berekening: budgetOverCat is de bron
    expect(await page.evaluate(() => /budgetOverCat\(/.test(whatStandsOutLine.toString()))).toBe(true);
  });

  test('en verschijnt niet twee keer in dezelfde kaart', async ({ page }) => {
    const p = seed({ set: { budgets: { huur: 900, boodschappen: 100 } } });
    await boot(page, p);
    const html = await page.evaluate((m) => whatStandsOutLine(m, true), CUR);
    const ov = await page.evaluate((m) => budgetOverCat(m), CUR);
    if (ov) expect((html.match(new RegExp(ov.name, 'g')) || []).length).toBeLessThanOrEqual(2);
  });
});

test.describe('f · dekking wordt op één scherm beoordeeld', () => {
  test('Maand oordeelt, Plan beheert', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      regel: (maandRegels() || []).find((x) => x.key === 'dekking'),
      zin: dekkingTekst(dekking(12)),
      kaart: (function () { const d = document.createElement('div');
        d.innerHTML = resDekkingCard(); return d.innerText.replace(/\s+/g, ' '); })(),
    }));
    expect(r.regel.gevolg).toBe(r.zin);                  // het oordeel staat op Maand
    expect(r.kaart).not.toContain(r.zin);                // en niet op Plan
    expect(r.kaart).toMatch(/\d+ post/);                 // Plan houdt de feiten
    expect(r.kaart).toMatch(/lees je op Maand/);         // en wijst waar het oordeel staat
  });
});

test.describe('g · de aansluiting staat op Plan, niet op Maand', () => {
  test('geen maandregel, wel de vrij-regel op je plan', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => MAAND_VOLGORDE)).not.toContain('aansluiting');
    expect(await page.evaluate(() => (maandRegels() || []).some((x) => x.key === 'aansluiting'))).toBe(false);
    expect(await page.evaluate(() => typeof window.openAansluiting)).toBe('undefined');
    expect(await page.evaluate(() => typeof spaarVrijLine)).toBe('function');
  });

  test('het verband dat erop leunde blijft, en leest de bron rechtstreeks', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => maandVerband.toString());
    expect(src).toContain('spaarVrij()');
    expect(src).not.toMatch(/r\.key==='aansluiting'/);
  });
});

test.describe('h · de beleggen-regel herhaalt geen zichtbare rij', () => {
  test('bij een zichtbaar tekort op dekking of doel zwijgt hij', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const R = maandRegels(); const B = beleggenKlaar(R);
      return { blok: B.blokkade ? B.blokkade.key : null, klaar: B.klaar,
        rij: B.blokkade ? (R.find((x) => x.key === B.blokkade.key) || {}).status : null,
        regel: maandBeleggenRegel(R) };
    });
    if (r.blok && r.blok !== 'buffer' && r.rij === 'tekort') expect(r.regel).toBe('');
  });

  test('de bufferblokkade blijft altijd staan: let op is een ander oordeel', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => maandBeleggenRegel.toString());
    expect(src).toContain("B.blokkade.key!=='buffer'");
    // en beleggenKlaar zelf is niet aangeraakt
    expect(await page.evaluate(() => /r\.status!=='tekort'/.test(beleggenKlaar.toString()))).toBe(true);
  });
});
