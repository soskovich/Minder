// v211: de restsaldo-waterval was het bestemmingsmodel maar kende er twee niet. surplus = fNet telt
// alleen type==='expense', dus een reserveringsinleg (interne overboeking) en een spaardoel (geen
// transacties, v99) bleven in het restsaldo staan en compoundeerden mee tot je pensioen. Deze spec
// bewaakt drie dingen: dat een euro die naar reserveringen of een doel gaat in de VLAKKE laag
// belandt en niet in de compoundende, dat er geen euro ontstaat of verdwijnt, en dat er in de
// vul-fase niets dubbel af gaat.
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
const DOELDATUM = ym(new Date(now.getFullYear() + 3, now.getMonth(), 1));

// Basis: noodfonds vol (volYear === nowY), zodat de doelinleg meteen telt. Per test schuiven we
// precies een knop: de reserveringenlijst, de doelen, de modus of het noodfonds.
function seed(o) {
  o = o || {};
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
  const nfVol = o.nfVol !== false;
  const set = {
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 3000, [SPAAR]: 20000, [RES]: 2000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 500,
    savingsAcc: { [SPAAR]: true }, resAcc: RES,
    planAlloc: { noodfonds: { allocMode: 'fixed', perMaand: 200 } },
    nfDoelVast: nfVol ? 8000 : 40000,
    nfToegewezen: nfVol ? 8000 : 2000, nfToegewezenMigrated: true,
    goals: o.goals !== undefined ? o.goals : [
      { id: 'g1', naam: 'Nieuwe auto', doel: 15000, gespaard: 1000, streefdatum: DOELDATUM, mode: 'fixed', perMaand: 300 },
      { id: 'g2', naam: 'Verbouwing', doel: 20000, gespaard: 0, mode: 'fixed', perMaand: 200 },
    ],
    reserveringen: o.reserveringen !== undefined ? o.reserveringen : [
      { id: 'r1', naam: 'Tandarts', bedrag: 300, vervalmaand: BINNENKORT, intervalM: 12 },
      { id: 'r2', naam: 'Gemeente', bedrag: 900, vervalmaand: BINNENKORT, intervalM: 12 },
    ],
    reis: o.reis || {},
  };
  if (o.debts) set.debts = o.debts;
  if (o.planOrder) set.planOrder = o.planOrder;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign(set, o.set || {})),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof reisModel === 'function');
}

const model = (page) => page.evaluate(() => {
  const M = reisModel(), i = fireInputs();
  const laag = (k) => { const p = M.assetParts.find((x) => x.kind === k); return p ? (p.series[M.HZ] || 0) : 0; };
  return {
    surplus: M.R.surplus, pmt: Math.round(M.R.pmt), nowY: M.nowY, HZ: M.HZ,
    res: i.resPerMaand, doel: i.doelPerMaand, doelItems: i.doelItems,
    best: M.bestemming, volYear: M.freed.volYear, vrij: M.freed.vrij,
    eind: Math.round(M.mid[M.HZ]), assetsEind: Math.round(M.assets[M.HZ]),
    cashEind: Math.round(laag('cash')), inlegEind: Math.round(laag('inleg')),
    somParts: Math.round(M.assetParts.reduce((s, p) => s + (p.series[M.HZ] || 0), 0)),
  };
});
const waterval = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = reisRestsaldo(reisModel()).inleg;
  return d.textContent.replace(/\s+/g, ' ').trim();
});

test.describe('a - de bedragen komen uit de bestaande bronnen', () => {
  test('reserveringen zijn exact dekking(12).benodigdPerMaand', async ({ page }) => {
    await boot(page);
    const m = await model(page);
    const d = await page.evaluate(() => Math.round(dekking(12).benodigdPerMaand || 0));
    expect(m.res).toBe(d);
    expect(m.res).toBeGreaterThan(0);
  });

  test('doelen zijn de som van de alloc van alle goal-items uit allocatePlan', async ({ page }) => {
    await boot(page);
    const m = await model(page);
    const som = await page.evaluate(() => allocatePlan().filter((p) => p.type === 'goal').reduce((s, p) => s + (+p.alloc || 0), 0));
    expect(m.doel).toBe(Math.round(som));
    expect(m.doelItems.map((x) => x.naam)).toEqual(['Nieuwe auto', 'Verbouwing']);
  });

  test('een aflos-item telt niet mee: schuld is een eigen stap', async ({ page }) => {
    const debts = [{ id: 'd1', naam: 'Duo', type: 'studie', start: 20000, rest: 18000, perMaand: 547, rente: 2.56 }];
    await boot(page, { debts, planOrder: ['__nf__', 'g1', 'g2', 'af:d1'] });
    const m = await model(page);
    expect(m.doelItems.every((x) => !/Aflossen/.test(x.naam))).toBe(true);
    const alloc = await page.evaluate(() => allocatePlan().filter((p) => p.type === 'goal').reduce((s, p) => s + (+p.alloc || 0), 0));
    expect(m.doel).toBe(Math.round(alloc));
  });

  test('allocatePlan, planCapacity en dekking zijn niet veranderd door deze ronde', async ({ page }) => {
    await boot(page);
    const p = await page.evaluate(() => allocatePlan().map((x) => [x.id, x.alloc, x.status]));
    expect(p.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => planCapacity())).toBe(500);
    expect(await page.evaluate(() => Math.round(dekking(12).benodigdPerMaand))).toBe(400);
  });
});

test.describe('b - de euro landt vlak, niet in de compoundende laag', () => {
  test('de groei-inleg is het restsaldo min de bestemmingen', async ({ page }) => {
    await boot(page);
    const m = await model(page);
    expect(m.volYear).toBe(m.nowY);
    expect(m.best.groeit).toBe(m.pmt - m.res - m.doel);
  });

  test('wat er af gaat komt er in de vlakke laag precies bij', async ({ page }) => {
    await boot(page);
    const met = await model(page);
    await page.evaluate(() => { SET.reserveringen = []; SET.goals = []; save(); });
    const zonder = await model(page);
    const perMaand = met.res + met.doel;
    expect(zonder.best.groeit).toBe(zonder.pmt);
    expect(met.cashEind - zonder.cashEind).toBe(perMaand * 12 * met.HZ);
    expect(zonder.inlegEind - met.inlegEind).toBeGreaterThan(perMaand * 12 * met.HZ);
  });

  test('het totaal daalt, en precies met het rendement dat die euro niet meer maakt', async ({ page }) => {
    await boot(page);
    const met = await model(page);
    await page.evaluate(() => { SET.reserveringen = []; SET.goals = []; save(); });
    const zonder = await model(page);
    expect(met.eind).toBeLessThan(zonder.eind);
    const gemist = (zonder.inlegEind - met.inlegEind) - (met.cashEind - zonder.cashEind);
    expect(zonder.eind - met.eind).toBe(gemist);
  });

  test('er ontstaat of verdwijnt geen euro: de opbouw telt op tot de bezittingen', async ({ page }) => {
    await boot(page);
    const m = await model(page);
    expect(m.somParts).toBe(m.assetsEind);
  });
});

test.describe('c - in de vul-fase gaat er niets dubbel af', () => {
  test('een doel gaat er pas af vanaf het vol-jaar, want vrij diverteert de hele capaciteit', async ({ page }) => {
    await boot(page, { nfVol: false });
    const m = await model(page);
    expect(m.volYear).toBeGreaterThan(m.nowY);
    expect(m.doel).toBeGreaterThan(0);
    expect(m.best.nu).toBe(m.res);
    expect(m.best.groeit).toBe(m.pmt - m.vrij - m.res);
  });

  test('reserveringen gaan er ook in de vul-fase af: ze zitten niet in planCapacity', async ({ page }) => {
    await boot(page, { nfVol: false });
    const m = await model(page);
    expect(m.res).toBeGreaterThan(0);
    expect(m.best.nu).toBeGreaterThan(0);
  });

  test('de stap zegt het ook, in plaats van een bedrag te tonen dat er niet af gaat', async ({ page }) => {
    await boot(page, { nfVol: false });
    expect(await waterval(page)).toContain('zit nu nog in de noodfonds-vulling');
  });
});

test.describe('d - de waterval toont de stappen', () => {
  test('beide bestemmingen staan er, met het bedrag dat dan pas mag groeien', async ({ page }) => {
    await boot(page);
    const t = await waterval(page);
    const m = await model(page);
    expect(t).toContain('Reserveringen');
    expect(t).toContain('Spaardoelen');
    expect(t).toContain('Groeit mee vanaf nu');
    expect(t).toContain('Nieuwe auto');
    expect(t).toContain(m.best.groeit.toLocaleString('nl-NL'));
  });

  test('geen reserveringen en geen doelen: geen stap en geen slotregel', async ({ page }) => {
    await boot(page, { reserveringen: [], goals: [] });
    const t = await waterval(page);
    expect(t).not.toContain('Reserveringen');
    expect(t).not.toContain('Spaardoelen');
    expect(t).not.toContain('Groeit mee vanaf nu');
    expect(t).toContain('Noodfonds');
  });

  test('bij zelf invullen blijft de projectie ongemoeid', async ({ page }) => {
    await boot(page, { reis: { inlegMode: 'manual', pmt: 700 } });
    const m = await model(page);
    expect(m.best.res).toBe(0);
    expect(m.best.doel).toBe(0);
    expect(m.best.groeit).toBe(700);
    expect(await waterval(page)).not.toContain('Groeit mee vanaf nu');
  });
});

test.describe('e - nooit meer diverteren dan er is', () => {
  test('een restsaldo kleiner dan de bestemmingen klemt op nul', async ({ page }) => {
    await boot(page, { reserveringen: [{ id: 'r1', naam: 'Groot', bedrag: 60000, vervalmaand: BINNENKORT, intervalM: 12 }] });
    const m = await model(page);
    expect(m.res).toBeGreaterThan(m.pmt);
    expect(m.best.groeit).toBe(0);
  });
});

test.describe('f - layout', () => {
  for (const w of [360, 390]) {
    test('de waterval past op ' + w + 'px', async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page);
      await page.evaluate(() => go('fire'));
      await page.waitForSelector('#s-fire .hlabel');
      const over = await page.evaluate((breedte) => {
        const el = document.getElementById('s-fire');
        const buiten = [...el.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().right > breedte + 1);
        return { scroll: document.documentElement.scrollWidth, buiten: buiten.length };
      }, w);
      expect(over.scroll).toBeLessThanOrEqual(w);
      expect(over.buiten).toBe(0);
    });
  }
});
