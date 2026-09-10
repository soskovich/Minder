// v213: a.rend (Netto rendement per bezitting) had één lezer (expectedReturnPct, een zin in de
// schuld-editor) en raakte de projectie niet: elke groeiende bezitting groeide op het globale
// tarief uit de groeikeuze-chips. Een stand die je maandelijks zelf bijwerkt (een holding, een
// spaarpot, een restwaarde) groeide daardoor mee alsof het een belegging was.
// De regel die deze spec bewaakt: een bezitting groeit alleen als er een netto rendement bij
// staat. Is dat leeg, dan blijft de stand staan. Geen terugval op het globale tarief; dat geldt
// nog uitsluitend voor nieuwe inleg, waarvan de bestemming nog niet bepaald is.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';
const BINNENKORT = ym(new Date(now.getFullYear(), now.getMonth() + 3, 1));

// Twee potten met een eigen tarief en drie standen die je zelf bijwerkt: precies de situatie
// waarin het globale tarief het verkeerde antwoord gaf.
const GEMENGD = [
  { id: 'a1', naam: 'Peaks pensioen', waarde: 3219, grow: true, rend: 6, per: 250 },
  { id: 'a2', naam: 'Peaks Kayani', waarde: 420, grow: true, rend: 6, per: 50 },
  { id: 'a3', naam: 'Holding', waarde: 45000, grow: true },
  { id: 'a4', naam: 'Zakelijk spaargeld', waarde: 20000, grow: true },
  { id: 'a5', naam: 'Lease restwaarde', waarde: 12000, grow: true },
];
const VLAKKE = ['Holding', 'Zakelijk spaargeld', 'Lease restwaarde'];
const wijzig = (as, f) => as.map((a) => Object.assign({}, a, f(a) || {}));

function seed(assets, reis) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '25', 4000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('v' + m, MAIN, m, '08', -400, 'Diversen', 'BEA, BETAALPAS DIVERSEN');
    add('s' + m, SPAAR, m, '26', 500, 'Spaarpot', 'NAAR SPAREN');
    add('r' + m, RES, m, '10', 300, 'Reserveringen', 'NAAR RESERVERINGEN');
  }
  const set = {
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 3000, [SPAAR]: 20000, [RES]: 2000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 500,
    savingsAcc: { [SPAAR]: true }, resAcc: RES,
    nfDoelVast: 8000, nfToegewezen: 8000, nfToegewezenMigrated: true,
    goals: [{ id: 'g1', naam: 'Nieuwe auto', doel: 15000, gespaard: 1000, mode: 'fixed', perMaand: 300 }],
    reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 300, vervalmaand: BINNENKORT, intervalM: 12 }],
    assets, reis: reis || {},
  };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, assets, reis) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(assets, reis));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof reisModel === 'function');
}
// Beide varianten op dezelfde geladen data, zodat alleen de bezittingen verschillen.
const zet = (page, assets) => page.evaluate((as) => { SET.assets = as; save(); }, assets);
const groei = (page, mode) => page.evaluate((m) => { SET.reis = Object.assign({}, SET.reis, { growMode: m }); save(); }, mode);

const model = (page) => page.evaluate(() => {
  const M = reisModel();
  const o = {};
  M.assetParts.forEach((p) => { o[p.naam] = { eind: Math.round(p.series[M.HZ]), kind: p.kind, col: p.col, reeks: p.series.map((v) => Math.round(v)) }; });
  return {
    HZ: M.HZ, nowY: M.nowY,
    mid: M.mid.map((v) => Math.round(v)), low: Math.round(M.low[M.HZ]), high: Math.round(M.high[M.HZ]),
    eind: Math.round(M.mid[M.HZ]), assets: Math.round(M.assets[M.HZ]),
    somParts: Math.round(M.assetParts.reduce((s, p) => s + (p.series[M.HZ] || 0), 0)),
    vlak: (M.bezit && M.bezit.vlak) || [], parts: o,
  };
});
const waterval = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = reisRestsaldo(reisModel()).inleg;
  return d.textContent.replace(/\s+/g, ' ').trim();
});

test.describe('a - KRITIEK: geen rendement is geen groei, en geen terugval', () => {
  test('een bezitting zonder rendement staat elk jaar op exact zijn eigen waarde', async ({ page }) => {
    await boot(page, GEMENGD);
    const m = await model(page);
    for (const n of VLAKKE) {
      const w = GEMENGD.find((a) => a.naam === n).waarde;
      expect(m.parts[n].reeks.every((v) => v === w)).toBe(true);
    }
  });

  test('het globale tarief is geen terugval: de groeikeuze raakt die standen niet', async ({ page }) => {
    await boot(page, GEMENGD);
    const beleggen = await model(page);
    await groei(page, 'cash');
    const cash = await model(page);
    for (const n of VLAKKE) expect(cash.parts[n].reeks).toEqual(beleggen.parts[n].reeks);
  });

  test('ook de heffing raakt een vlakke stand niet: vlak is vlak', async ({ page }) => {
    await boot(page, GEMENGD, { taxPct: 3 });
    const m = await model(page);
    for (const n of VLAKKE) {
      const w = GEMENGD.find((a) => a.naam === n).waarde;
      expect(m.parts[n].eind).toBe(w);
    }
  });

  test('en de bandbreedte ook niet: hij draagt in low, mid en high hetzelfde bij', async ({ page }) => {
    await boot(page, GEMENGD, { band: true });
    const met = await model(page);
    await zet(page, GEMENGD.filter((a) => a.naam !== 'Holding'));
    const zonder = await model(page);
    const w = 45000;
    expect(met.eind - zonder.eind).toBe(w);
    expect(met.low - zonder.low).toBe(w);
    expect(met.high - zonder.high).toBe(w);
  });
});

test.describe('b - een eigen tarief stuurt de projectie', () => {
  test('een hoger rendement geeft een hogere pot en een hoger vermogen', async ({ page }) => {
    await boot(page, GEMENGD);
    const zes = await model(page);
    await zet(page, wijzig(GEMENGD, (a) => ((+a.rend || 0) > 0 ? { rend: 8 } : null)));
    const acht = await model(page);
    expect(acht.parts['Peaks pensioen'].eind).toBeGreaterThan(zes.parts['Peaks pensioen'].eind);
    expect(acht.eind).toBeGreaterThan(zes.eind);
  });

  test('de groeikeuze verandert die pot niet, alleen de nieuwe inleg', async ({ page }) => {
    await boot(page, GEMENGD);
    const beleggen = await model(page);
    await groei(page, 'sparen');
    const sparen = await model(page);
    expect(sparen.parts['Peaks pensioen'].reeks).toEqual(beleggen.parts['Peaks pensioen'].reeks);
    expect(sparen.parts['Nieuwe inleg'].eind).toBeLessThan(beleggen.parts['Nieuwe inleg'].eind);
  });

  test('nieuwe inleg volgt wel het globale tarief: bij laten staan compoundeert hij niet', async ({ page }) => {
    await boot(page, GEMENGD);
    await groei(page, 'beleggen');
    const b = (await model(page)).parts['Nieuwe inleg'];
    await groei(page, 'cash');
    const c = (await model(page)).parts['Nieuwe inleg'];
    expect(c.reeks[0]).toBe(0);
    expect(c.eind).toBeLessThan(b.eind);
    // Bij rendement wordt de aangroei elk jaar groter; zonder rendement niet. Niet exact gelijk:
    // de nieuwe-inleg-pot wordt wel belast, ook bij 0%. Dat is bestaand gedrag van vóór v213 en
    // staat los van de keuze om een vlakke BEZITTING niet te belasten (die stand werk jij bij,
    // deze pot is geld dat de app zelf laat groeien).
    expect(b.reeks[2] - b.reeks[1]).toBeGreaterThan(b.reeks[1]);
    expect(c.reeks[2] - c.reeks[1]).toBeLessThanOrEqual(c.reeks[1]);
  });
});

test.describe('c - er ontstaat en verdwijnt niets', () => {
  test('de opbouw telt op tot de bezittingen, ook met gemengde tarieven', async ({ page }) => {
    await boot(page, GEMENGD);
    const m = await model(page);
    expect(m.somParts).toBe(m.assets);
  });

  test('dat blijft gelden bij elke groeikeuze', async ({ page }) => {
    await boot(page, GEMENGD);
    for (const g of ['cash', 'sparen', 'beleggen', 'verdelen']) {
      await groei(page, g);
      const m = await model(page);
      expect(m.somParts).toBe(m.assets);
    }
  });

  test('een vlakke bezitting hoort bij de vlakke laag, ook in de kleur', async ({ page }) => {
    await boot(page, GEMENGD);
    const m = await model(page);
    for (const n of VLAKKE) expect(m.parts[n].kind).toBe('flat');
    expect(m.parts['Peaks pensioen'].kind).toBe('belegging');
    // dezelfde kleur als de niet-groeiende bezittingen, want de lijn is even recht
    expect(m.parts['Holding'].col).toBe(m.parts['Lease restwaarde'].col);
    expect(m.parts['Peaks pensioen'].col).not.toBe(m.parts['Holding'].col);
  });

  test('krijgt een pot zonder rendement wel inleg, dan beweegt hij en blijft hij een belegging', async ({ page }) => {
    await boot(page, wijzig(GEMENGD, (a) => (a.naam === 'Holding' ? { per: 100 } : null)));
    const m = await model(page);
    expect(m.parts['Holding'].kind).toBe('belegging');
    // geen rendement, dus precies de inleg erbij en geen euro meer
    expect(m.parts['Holding'].eind).toBe(45000 + 100 * 12 * m.HZ);
  });
});

test.describe('d - het scherm zegt welke standen vlak liggen', () => {
  test('de namen staan er, met wat ze samen zijn', async ({ page }) => {
    await boot(page, GEMENGD);
    const t = await waterval(page);
    expect(t).toContain('Deze standen groeien niet mee');
    for (const n of VLAKKE) expect(t).toContain(n);
    expect(t).toContain('77.000');
  });

  test('heeft elke bezitting een rendement, dan staat er niets', async ({ page }) => {
    await boot(page, wijzig(GEMENGD, () => ({ rend: 6 })));
    expect(await waterval(page)).not.toContain('Deze standen groeien niet mee');
  });

  test('de melding leidt naar een keuze die bestaat, en eist niets', async ({ page }) => {
    await boot(page, GEMENGD);
    expect(await waterval(page)).toContain('vul dan een rendement in bij de bezitting');
    expect(await page.evaluate(() => typeof openAsset === 'function')).toBe(true);
  });

  test('de editor zegt wat een leeg rendement betekent', async ({ page }) => {
    await boot(page, GEMENGD);
    await page.evaluate(() => openAsset('a3'));
    expect(await page.locator('#sheet').innerText()).toContain('groeit deze bezitting niet');
    // en de placeholder belooft geen 5% meer
    expect(await page.locator('#aRend').getAttribute('placeholder')).toBe('0');
  });
});

test.describe('e - buiten bereik van deze ronde', () => {
  test('a.eenmalig, a.horizon en a.infl worden nog steeds niet gelezen', async ({ page }) => {
    await boot(page, GEMENGD);
    const voor = await model(page);
    await zet(page, wijzig(GEMENGD, () => ({ eenmalig: 50000, horizon: 5, infl: 9 })));
    expect((await model(page)).mid).toEqual(voor.mid);
  });
});

test.describe('f - layout', () => {
  for (const w of [360, 390]) {
    test(`de melding past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page, GEMENGD);
      await page.evaluate(() => go('vermogen'));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
