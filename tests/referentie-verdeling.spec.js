// Referentie-verdeling (v84): de norm waartegen de kerncijfers en "Hoe gezond is jouw verdeling?"
// meten is instelbaar (kaders, op maat uit je historie, of zelf), en alle banden volgen die keuze.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

// De basisfixture heeft twee afgeronde maanden (M2, M1) — precies onder de drempel van drie,
// dus daar hoort géén op-maat-voorstel te staan. Voor het voorstel zelf breiden we de historie uit
// met drie eerdere maanden die exact het patroon van M1 herhalen.
function ym(back) {
  const n = new Date();
  const d = new Date(n.getFullYear(), n.getMonth() - back, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function seedLang() {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  const add = (id, m, day, amount, name, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of [ym(3), ym(4), ym(5)]) {
    add('inc-' + m, m, '05', 3000, 'Werkgever', 'SALARIS LOON');
    add('huur-' + m, m, '20', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('gift-' + m, m, '03', -20, 'Greenpeace', 'PERIODIEKE OVERBOEKING MAANDELIJKSE GIFT');
    add('fit-' + m, m, '04', -25, 'Basic-Fit', 'ECOM BASIC FIT BETAALPAS');
    add('ah-' + m, m, '08', -400, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('eet-' + m, m, '12', -150, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
  }
  p.minder_tx = JSON.stringify(tx);
  return p;
}
function tweak(payload, fn) {
  const p = payload || seed();
  const set = JSON.parse(p.minder_set);
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('ins'));
  await page.waitForSelector('#insKpiStrip');
}
const openNorm = async (page) => { await page.evaluate(() => openSplitNorm()); await page.waitForSelector('[data-split="503020"]'); };
const tegel = (page, key) => page.locator(`#insKpiStrip .wvo-tile[data-kpi="${key}"]`);

test.describe('a · een andere norm kiezen, en de banden volgen mee', () => {
  test('default is 50/30/20 en dat is exact het oude gedrag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      mode: splitMode(), t: splitTarget(), gezet: SET.splitMode,
      vast: kpiBand('vast'),
      vastTxt: kpiBandTxt('vast'),
    }));
    expect(r.mode).toBe('503020');
    expect(r.gezet).toBeUndefined();                                    // geen migratie: niets opgeslagen
    expect({ f: r.t.fixed, v: r.t.vari, s: r.t.save }).toEqual({ f: 50, v: 30, s: 20 });
    expect(r.vast).toBe(null);            // v161: de norm stuurt de banden niet meer
    expect(r.vastTxt).toContain('geen doel');
  });

  test('een kader kiezen zet splitMode en splitTarget, en raakt de kerncijfers niet', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => insKpis(curMonth).vast.raw);
    await page.evaluate(() => { SET.splitMode = '702010'; save(); });
    const r = await page.evaluate(() => ({ mode: SET.splitMode, t: splitTarget(), na: insKpis(curMonth).vast.raw, band: kpiBand('vast') }));
    const SPLIT_FIXED_702010 = r.t.fixed;   // de norm zelf is de bron, geen aangenomen getal
    expect(r.mode).toBe('702010');
    expect(r.t.fixed).toBe(SPLIT_FIXED_702010);
    expect(r.na).toBe(voor);            // het cijfer beweegt niet mee
    expect(r.band).toBe(null);
  });

  test('de verdeling-toets meet tegen dezelfde norm', async ({ page }) => {
    await boot(page);
    // meet over een afgeronde maand (M1): vast 31%, vrij 19%, sparen 0% van 3000
    const r = await page.evaluate((m) => {
      SET.openHealth = true; SET.insYear = m.slice(0, 4); SET.insMonths = [m];
      const standaard = ruleOfThumbCard();
      SET.splitMode = 'custom'; SET.splitTarget = { fixed: 20, vari: 40, save: 40 }; save();
      const streng = ruleOfThumbCard();
      return { standaard, streng, T: splitTarget() };
    }, M1);
    expect(r.standaard).toContain('Gemeten tegen 50/30/20');
    expect(r.standaard).not.toContain('boven je norm van');           // 31% vast past binnen 50%
    expect(r.streng).toContain('boven je norm van 20%');
    expect(r.streng).toContain('Gemeten tegen Zelf instellen · 20/40/40');
    expect(r.streng).toContain('een ijkpunt, geen wet');

    // en de spaarnorm zelf: deze maand ging er €200 naar de spaarrekening (7% van 3000)
    const spaar = await page.evaluate((m) => {
      SET.insMonths = [m]; SET.insYear = m.slice(0, 4);
      SET.splitMode = 'custom'; SET.splitTarget = { fixed: 20, vari: 40, save: 40 }; save();
      const streng = ruleOfThumbCard();
      SET.splitMode = '503020'; save();
      return { streng, standaard: ruleOfThumbCard() };
    }, CUR);
    expect(spaar.streng).toContain('onder je spaarnorm van 40%');
    expect(spaar.standaard).toContain('onder je spaarnorm van 20%');   // dezelfde 7%, andere norm
  });

  // v161: er is geen bandlijn meer in de KPI-historie, want er is geen band.
  test('de KPI-historie tekent geen bandlijn meer', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.splitMode = '502030'; save(); });
    await page.evaluate(() => openKpiDetail('vast'));
    await page.waitForSelector('#kpiDetailHead');
    expect(await page.locator('#kpiHist line[stroke-dasharray]').count()).toBe(0);
  });
});

test.describe('b · op maat uit de eigen historie', () => {
  test('stelt een haalbaar doel voor: vast blijft staan, sparen stapt omhoog', async ({ page }) => {
    await boot(page, seedLang());
    const r = await page.evaluate(() => ({ A: splitActual(6), V: splitVoorstel() }));
    expect(r.A.n).toBe(5);                                             // vijf afgeronde maanden
    expect(r.V).not.toBeNull();

    const { nu, target } = r.V;
    expect(target.fixed).toBe(nu.fixed);                               // vaste lasten forceren we niet omlaag
    expect(target.save).toBeGreaterThanOrEqual(nu.save);               // nooit lager dan wat je nu doet
    expect(target.save).toBeLessThanOrEqual(nu.save + 5);              // een bereikbare stap
    expect(target.save).toBeLessThanOrEqual(25);                       // en begrensd
    expect(target.fixed + target.vari + target.save).toBe(100);
    expect(r.V.deltaP).toBe(target.save - nu.save);
    expect(r.V.extra).toBe(Math.round(r.V.incM * r.V.deltaP / 100));   // euro-effect = % van je inkomen
    expect(r.V.extra).toBeGreaterThan(0);
  });

  test('toont het euro-effect en koppelt het aan je spaardoel', async ({ page }) => {
    await boot(page, seedLang());
    await openNorm(page);
    const blok = await page.locator('[data-split="ophistorie"]').innerText();
    const V = await page.evaluate(() => splitVoorstel());

    expect(blok).toContain(`Voorstel op basis van je laatste ${V.n} maanden`);
    expect(blok).toContain('vrij → sparen');
    expect(blok).toMatch(/\+€\d/);                                     // het bedrag per maand
    expect(blok).toContain('Gebruik dit als mijn norm');
    expect(blok).toContain('Aanpassen');
    // ETA-koppeling via dezelfde rekenwijze als de bespaartips (tipEffect)
    const eff = await page.evaluate((extra) => tipEffect(extra), V.extra);
    expect(V.effect).toEqual(eff);
    if (eff && eff.eerder >= 1) expect(blok).toContain(eff.vergelijk);
  });

  // v161: de norm wordt nog gezet en opgeslagen, maar hij meet de kerncijfers niet meer.
  test('"Gebruik dit als mijn norm" zet de norm', async ({ page }) => {
    await boot(page);
    const V = await page.evaluate(() => splitVoorstel());
    test.skip(!V, 'geen voorstel bij deze fixture');
    await page.evaluate(() => splitUseVoorstel());
    const r = await page.evaluate(() => ({ mode: SET.splitMode, opgeslagen: SET.splitTarget, t: splitTarget(), band: kpiBand('inleg') }));
    expect(r.mode).toBe('ophistorie');
    expect(r.opgeslagen).toEqual(V.target);
    expect(r.band).toBe(null);          // de kerncijfers meten er niet meer tegen
  });

  test('"Aanpassen" neemt het voorstel over als eigen norm', async ({ page }) => {
    await boot(page, seedLang());
    await openNorm(page);
    const V = await page.evaluate(() => splitVoorstel());
    await page.locator('[data-split="ophistorie"] button.sec').click();
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => ({ mode: SET.splitMode, t: splitTarget() }));
    expect(r.mode).toBe('custom');
    expect({ f: r.t.fixed, v: r.t.vari, s: r.t.save }).toEqual({ f: V.target.fixed, v: V.target.vari, s: V.target.save });
    await expect(page.locator('#splitCustom-save')).toHaveValue(String(V.target.save));
  });
});

test.describe('c · randgevallen', () => {
  test('onder drie afgeronde maanden: geen voorstel, gewoon 50/30/20', async ({ page }) => {
    await boot(page);                                                  // basisfixture: 2 afgeronde maanden
    const r = await page.evaluate(() => ({ n: splitActual(6).n, V: splitVoorstel(), t: splitTarget() }));
    expect(r.n).toBe(2);
    expect(r.V).toBeNull();
    expect({ f: r.t.fixed, v: r.t.vari, s: r.t.save }).toEqual({ f: 50, v: 30, s: 20 });

    await openNorm(page);
    const blok = await page.locator('[data-split="ophistorie"]').innerText();
    expect(blok).toContain('Na drie afgeronde maanden');
    expect(blok).not.toContain('Gebruik dit als mijn norm');
    // en de keuze blijft ongemoeid als je er toch op tikt
    await page.evaluate(() => setSplitMode('ophistorie'));
    expect(await page.evaluate(() => splitMode())).toBe('503020');
  });

  test('inkomen onbekend: geen norm forceren', async ({ page }) => {
    await boot(page, tweak(null, (s) => { s.income = 0; s.autoIncome = false; }));
    const r = await page.evaluate(() => ({ inc: totals(curMonth).income, kaart: ruleOfThumbCard(), vast: insKpis(curMonth).vast.val }));
    expect(r.inc).toBe(0);
    expect(r.kaart).not.toMatch(/boven je norm|spaarnorm/);
    expect(r.vast).toBe('—');                    // geen inkomen, dus geen percentage (v59/v73)
  });

  test('vaste lasten boven de norm blijven eerlijk staan, met een zachte vlag', async ({ page }) => {
    // huur 900 -> 2600, zodat de vaste lasten ver boven de norm uitkomen
    const p = seedLang();
    const tx = JSON.parse(p.minder_tx).map((t) => (t.id.startsWith('huur-') ? { ...t, amount: -2600 } : t));
    p.minder_tx = JSON.stringify(tx);
    await boot(page, p);
    const V = await page.evaluate(() => splitVoorstel());
    expect(V.nu.fixed).toBeGreaterThan(55);
    expect(V.target.fixed).toBe(V.nu.fixed);                           // eerlijk, niet weggerekend
    expect(V.hoogVast).toBe(true);
    expect(V.target.fixed + V.target.vari + V.target.save).toBe(100);

    await openNorm(page);
    expect(await page.locator('[data-split="ophistorie"]').innerText()).toContain('aan de hoge kant');
    // Rustig: dezelfde cijfers, zonder de vlag erbij
    const zacht = await page.evaluate(() => { SET.mode = 'rustig'; save(); return splitVoorstelBlok(); });
    expect(zacht).not.toContain('aan de hoge kant');
    expect(zacht).toContain(`+€`);
  });

  test('zelf instellen normaliseert naar 100%', async ({ page }) => {
    await boot(page);
    await openNorm(page);
    await page.locator('[data-split="custom"]').click();
    await page.waitForSelector('#splitCustom-fixed');
    await page.locator('#splitCustom-fixed').fill('60');
    await page.locator('#splitCustom-vari').fill('60');
    await page.locator('#splitCustom-save').fill('30');
    await page.waitForTimeout(150);
    // de invoervelden blijven staan tijdens het typen (geen sheet-herbouw)
    await expect(page.locator('#splitCustom-vari')).toHaveValue('60');

    const r = await page.evaluate(() => ({ ruw: SET.splitTarget, t: splitTarget(), band: kpiBand('spaar') }));
    expect(r.ruw).toEqual({ fixed: 60, vari: 60, save: 30 });          // je invoer blijft staan
    expect(r.t.fixed + r.t.vari + r.t.save).toBe(100);                 // we rekenen genormaliseerd
    expect({ f: r.t.fixed, v: r.t.vari, s: r.t.save }).toEqual({ f: 40, v: 40, s: 20 });
    expect(r.band).toBe(null);        // v161: geen band meer
    expect(await page.locator('#splitCustomSom').innerText()).toContain('Samen 150% · we rekenen met 40/40/20');
  });
});

test.describe('d · de actieve norm is zichtbaar en de toon blijft "geen wet"', () => {
  // v161: de norm stuurt de kerncijfers niet meer, dus hij staat niet meer op Inzichten.
  // Aanpassen loopt via Instellingen, waar de norm nog wel over gaat.
  test('de norm staat niet meer bij de kerncijfers', async ({ page }) => {
    await boot(page);
    const txt = await page.locator('#insKpiStrip').innerText();
    expect(txt).not.toContain('Gemeten tegen');
    expect(await page.evaluate(() => typeof setSplitNorm)).toBe('function');
  });

  test('de norm-keuze toont elke optie met een verdelingsbalk en geen dwingende taal', async ({ page }) => {
    await boot(page, seedLang());
    await openNorm(page);
    const sheet = page.locator('#sheet');
    for (const k of ['503020', '60', 'payfirst', 'fire', 'ophistorie', 'custom']) {
      await expect(sheet.locator(`[data-split="${k}"]`)).toHaveCount(1);
    }
    // elk kader heeft een mini-verdelingsbalk (3 segmenten) zodat het verschil voelbaar is
    for (const k of ['503020', '60', 'payfirst', 'fire']) {
      const segs = await sheet.locator(`[data-split="${k}"] > div:nth-child(2) > div > div`).count();
      expect(segs, k).toBe(3);
    }
    const txt = await sheet.innerText();
    expect(txt).toContain('Een ijkpunt, geen wet');
    expect(txt).toContain('je verandert er geen cent mee');
    expect(txt).toMatch(/Nu · vast \d+% · vrij \d+% · sparen \d+%/);
    expect(txt.match(/\bmoet\b|\bmoeten\b|gegarandeerd|verplicht je/i)).toBeNull();
    expect(await page.evaluate(() => splitMode())).toBe('503020');      // kijken verandert niets
  });

  test('pay-yourself-first neemt je werkelijke vaste lasten over', async ({ page }) => {
    await boot(page, seedLang());
    const r = await page.evaluate(() => { const A = splitActual(6); setSplitMode('payfirst'); return { A, t: splitTarget() }; });
    expect(r.t.save).toBe(20);
    expect(r.t.fixed).toBe(r.A.fixP);
    expect(r.t.fixed + r.t.vari + r.t.save).toBe(100);
  });

  test('Instellingen heeft een eigen rij met de actieve norm', async ({ page }) => {
    await boot(page, tweak(seed(), (s) => { s.splitMode = 'fire'; }));
    await page.evaluate(() => go('set'));
    const set = await page.locator('#s-set').innerText();
    expect(set).toContain('Referentie-verdeling');
    expect(set).toContain('Aggressief · FIRE · 50/20/30');
  });
});
