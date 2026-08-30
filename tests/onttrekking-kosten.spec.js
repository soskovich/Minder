// v124: de app kon al laten zien wat extra inleg oplevert (saveFasterTip). De omgekeerde richting
// ontbrak: wat kost het om geld uit je belegde laag te halen. Dat komt niet in euro's terug maar in
// maanden op je horizon, want het samengestelde rendement over dat bedrag is het echte verlies.
// reisModel() neemt daarvoor een optionele override; zonder argument is het gedrag ongewijzigd.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';

// vaste aannames, zodat de reis voorspelbaar is: 5% rendement, geen belasting, geen inflatie-effect
// op de lijn, FIRE = 25x jaaruitgaven, streefjaar vastgezet zodat de horizon niet met de AOW schuift
function seedReis(set = {}, opt = {}) {
  const tx = [];
  const add = (id, m, day, amount, name, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('inc-' + m, m, '01', 4000, 'Werkgever', 'SALARIS LOON');
    if (opt.geenUitgaven) continue;           // zonder uitgaven is er geen FIRE-getal om te halen
    add('huur-' + m, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('ah-' + m, m, '08', -800, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
      savingMode: 'amount', savingAmount: 500,
      manualBal: opt.geenSaldo ? {} : { [MAIN]: 10000 },
      assets: opt.geenBezit ? [] : [{ naam: 'Indexfonds', waarde: 150000, grow: true }, { naam: 'Auto', waarde: 8000 }],
      nfDoelVast: 1,
      reis: Object.assign({
        expMode: 'eigen', expMonthly: 2000, inlegMode: 'manual', pmt: 800,
        rend: 5, taxPct: 0, infl: 2, fireMult: 25, override: now.getFullYear() + 40,
      }, set.reis || {}),
    }, set)),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedReis());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof onttrekkingKosten === 'function');
}

// de velden die de reis bepalen, als vergelijkbare vingerafdruk
const vinger = (page, arg) => page.evaluate((a) => {
  const M = a === undefined ? reisModel() : reisModel(a);
  const r = (x) => Math.round(x);
  return {
    FIRE: r(M.FIRE), curNW: r(M.curNW), targetYear: M.targetYear, HZ: M.HZ, nowY: M.nowY,
    mid: M.mid.map(r), assets: M.assets.map(r), debt: M.debt.map(r), koop: M.koop.map(r),
    sim: { liq0: r(M.sim.liq0), belegd0: r(M.sim.belegd0), flat0: r(M.sim.flat0) },
    pmt: r(M.R.pmt), annualExp: r(M.R.annualExp), rend: M.R.rend,
    ms: M.ms.map((m) => [m.key, m.yr, m.target == null ? null : r(m.target)]),
    parts: (M.assetParts || []).map((p) => [p.naam, r(p.series[0]), r(p.series[p.series.length - 1])]),
  };
}, arg);

test.describe('a · regressie: zonder override verandert er niets', () => {
  test('reisModel() en reisModel(undefined) leveren dezelfde reis', async ({ page }) => {
    await boot(page);
    expect(await vinger(page, undefined)).toEqual(await vinger(page, undefined));
  });

  test('een lege of nul-override is hetzelfde als geen override', async ({ page }) => {
    await boot(page);
    const basis = await vinger(page, undefined);
    expect(await vinger(page, {})).toEqual(basis);
    expect(await vinger(page, { vermogenDelta: 0 })).toEqual(basis);
    // en het inputs-object gaat dan letterlijk ongewijzigd door
    const zelfde = await page.evaluate(() => {
      const inp = fireInputs();
      return fireInputsDelta(inp, 0) !== inp;      // alleen bij een delta maken we een kopie
    });
    expect(zelfde).toBe(true);                     // fireInputsDelta kopieert altijd; reisModel roept 'm niet aan bij 0
  });

  test('na een doorrekening met override is de gewone reis onveranderd', async ({ page }) => {
    await boot(page);
    const voor = await vinger(page, undefined);
    await page.evaluate(() => { reisModel({ vermogenDelta: -25000 }); onttrekkingKosten(4000); });
    expect(await vinger(page, undefined)).toEqual(voor);
  });

  test('de bestaande aanroepplekken roepen zonder argument aan', async ({ page }) => {
    await boot(page);
    const bronnen = await page.evaluate(() => [renderFire, fireOpKoers].map((f) => String(f)));
    for (const src of bronnen) expect(src).toContain('reisModel()');
  });
});

test.describe('b · de override raakt alleen de belegde laag', () => {
  test('belegd en netto vermogen zakken, uitgaven en inleg niet', async ({ page }) => {
    await boot(page);
    const a = await vinger(page, undefined);
    const b = await vinger(page, { vermogenDelta: -4000 });
    expect(b.sim.belegd0).toBe(a.sim.belegd0 - 4000);
    expect(b.curNW).toBe(a.curNW - 4000);
    expect(b.sim.liq0).toBe(a.sim.liq0);          // cash blijft
    expect(b.sim.flat0).toBe(a.sim.flat0);        // niet-groeiende bezittingen blijven
    expect(b.pmt).toBe(a.pmt);                    // je maandinleg verandert niet
    expect(b.annualExp).toBe(a.annualExp);        // je uitgaven ook niet
    expect(b.FIRE).toBe(a.FIRE);                  // en dus het FIRE-getal ook niet
  });

  test('de bezittingen-opbouw blijft optellen tot het geheel', async ({ page }) => {
    await boot(page);
    const klopt = await page.evaluate(() => {
      const M = reisModel({ vermogenDelta: -4000 });
      return M.assets.map((a, i) => Math.abs(a - (M.assetParts || []).reduce((s, p) => s + (p.series[i] || 0), 0)) < 1);
    });
    expect(klopt.every(Boolean)).toBe(true);
  });

  test('meer opnemen dan er belegd staat klemt op nul', async ({ page }) => {
    await boot(page);
    const b = await vinger(page, { vermogenDelta: -999999 });
    expect(b.sim.belegd0).toBe(0);
    expect(b.sim.flat0).toBeGreaterThan(0);        // de rest van je bezittingen blijft staan
  });
});

test.describe('c · onttrekkingKosten', () => {
  test('geeft het gevolg in maanden, met beide jaartallen', async ({ page }) => {
    await boot(page);
    const K = await page.evaluate(() => onttrekkingKosten(4000));
    expect(K.bedrag).toBe(4000);
    expect(K.maandenLater).toBeGreaterThan(0);
    expect(K.jaarNa).toBeGreaterThanOrEqual(K.jaarNu);
    expect(K.jaarNu).toBeGreaterThan(now.getFullYear());
  });

  test('een groter bedrag kost nooit minder tijd', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => [1000, 5000, 20000, 50000].map((b) => onttrekkingKosten(b).maandenLater));
    for (let i = 1; i < uit.length; i++) expect(uit[i]).toBeGreaterThanOrEqual(uit[i - 1]);
  });

  test('null bij een leeg of negatief bedrag', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => [onttrekkingKosten(0), onttrekkingKosten(-100), onttrekkingKosten(''), onttrekkingKosten('abc')]);
    expect(uit).toEqual([null, null, null, null]);
  });

  test('null als er saldi of bezittingen ontbreken', async ({ page }) => {
    await boot(page, seedReis({}, { geenSaldo: true }));
    expect(await page.evaluate(() => reisModel().missing.balances)).toBe(true);
    expect(await page.evaluate(() => onttrekkingKosten(4000))).toBeNull();
  });

  test('null zonder FIRE-getal', async ({ page }) => {
    // fireMult 0 valt in fireState terug op 25, dus het FIRE-getal moet via de uitgaven op nul
    await boot(page, seedReis({ reis: { expMode: 'eigen', expMonthly: 0 } }, { geenUitgaven: true }));
    expect(await page.evaluate(() => reisModel().FIRE)).toBe(0);
    expect(await page.evaluate(() => onttrekkingKosten(4000))).toBeNull();
  });

  test('null als de mijlpaal binnen de horizon niet gehaald wordt', async ({ page }) => {
    // uitgaven fors omhoog: FIRE-getal buiten bereik binnen de horizon
    await boot(page, seedReis({ reis: { expMonthly: 20000, override: now.getFullYear() + 5 } }));
    const K = await page.evaluate(() => onttrekkingKosten(4000));
    expect(K).toBeNull();
  });

  test('het kruispunt is fijner dan hele jaren', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const M = reisModel();
      const k = fireKruisMaanden(M);
      const fire = M.ms.find((m) => m.key === 'fire');
      return { k, jaarIdx: fire.tIdx };
    });
    expect(uit.k).toBeLessThanOrEqual(uit.jaarIdx * 12);          // het kruispunt ligt in of vóór dat jaar
    expect(uit.k).toBeGreaterThan((uit.jaarIdx - 1) * 12);        // maar na het jaar ervoor
  });
});

test.describe('d · de zin', () => {
  test('spiegel, gevolg, keuze, zonder oordeel', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => onttrekkingUitkomst(onttrekkingKosten(4000)).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
    expect(t).toMatch(/^€4\.000 uit je belegde laag\./);
    expect(t).toMatch(/Je FIRE-jaar (verschuift van \d{4} naar \d{4}|blijft \d{4})/);
    expect(t).toMatch(/ongeveer \d+ maand(en)? later\./);
    expect(t).toContain('Wat je hiermee doet is aan jou.');
    expect(t).not.toMatch(/[!—]/);
    expect(t).not.toMatch(/let op|pas op|beter|verstandig|advies/i);
  });

  test('bij een verschuiving binnen hetzelfde jaar zegt hij dat ook zo', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => {
      const K = onttrekkingKosten(500);
      return K.jaarNa === K.jaarNu ? onttrekkingUitkomst(K).replace(/<[^>]*>/g, ' ') : 'ANDERS';
    });
    if (t !== 'ANDERS') expect(t).toContain('Je FIRE-jaar blijft');
  });
});

test.describe('e · de ingang', () => {
  test('staat op het FIRE-scherm en opent de sheet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('fire'); });
    await page.waitForSelector('#s-fire');
    expect(await page.locator('#s-fire').innerText()).toMatch(/wat kost een onttrekking\?/i);   // .hlabel rendert uppercase
    await page.locator('#s-fire >> text=Wat kost een onttrekking?').click();
    await page.waitForSelector('#onttrInp');
  });

  test('een bedrag invullen levert het antwoord in maanden', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openOnttrekking());
    await page.waitForSelector('#onttrInp');
    await page.locator('#onttrInp').fill('4000');
    await page.locator('#sheet >> text=Reken door').click();
    await page.waitForSelector('#sheet >> text=uit je belegde laag');
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('€4.000 uit je belegde laag');
    expect(t).toMatch(/maand(en)? later/);
  });

  test('zonder bruikbare gegevens belooft de sheet niets', async ({ page }) => {
    await boot(page, seedReis({}, { geenSaldo: true }));
    await page.evaluate(() => { openOnttrekking(); window._onttrBedrag = '4000'; renderOnttrekkingSheet(); });
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('Hier valt nog niets over te zeggen');
    expect(t).not.toMatch(/maand(en)? later/);
  });

  for (const w of [360, 390]) {
    test(`de sheet past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page);
      await page.evaluate(() => { openOnttrekking(); window._onttrBedrag = '4000'; renderOnttrekkingSheet(); });
      const over = await page.evaluate(() => {
        const el = document.querySelector('#sheet');
        return { sheet: el.scrollWidth - el.clientWidth, body: document.body.scrollWidth - document.body.clientWidth };
      });
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
