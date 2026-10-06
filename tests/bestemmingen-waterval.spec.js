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
// v348: een derde afgeronde maand, zodat wat er opzij ging GEMETEN is (opzijGemiddeld()) en niet van de
// instellingen afhangt die deze tests juist veranderen: 500 naar de spaarrekening en 300 naar de reserveringen.
const M3 = ym(new Date(now.getFullYear(), now.getMonth() - 3, 1));
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
  for (const m of [M3, M2, M1, CUR]) {
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
    best: M.bestemming, volYear: M.freed.volYear, vrij: M.freed.vrij, opz: M.opzij, onv0: M.sim.onverdeeld0,
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
  // v346: niet meer de maandlast van dekking(), maar per post bedrag door interval (resPosten()).
  test('reserveringen zijn de som van bedrag door interval', async ({ page }) => {
    await boot(page);
    const m = await model(page);
    expect(m.res).toBe((300 + 900) / 12);
    expect(await page.evaluate(() => resPosten().perMaand)).toBe(m.res);
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

  // v347: de bruto maandlast (benodigdPerMaand) is opgeruimd; hij had sinds v346 geen lezer meer.
  test('allocatePlan en planCapacity zijn niet veranderd door deze ronde', async ({ page }) => {
    await boot(page);
    const p = await page.evaluate(() => allocatePlan().map((x) => [x.id, x.alloc, x.status]));
    expect(p.length).toBeGreaterThan(0);
    expect(await page.evaluate(() => planCapacity())).toBe(500);
    expect(await page.evaluate(() => 'benodigdPerMaand' in dekking(12))).toBe(false);
  });
});

test.describe('b - de euro landt vlak, niet in de compoundende laag', () => {
  test('de groei-inleg is het restsaldo min de bestemmingen', async ({ page }) => {
    await boot(page);
    const m = await model(page);
    expect(m.volYear).toBe(m.nowY);
    // v348: de waterval loopt over wat er werkelijk opzij ging (gemeten 800), en de rest van het restsaldo
    // blijft vlak staan. Samen is dat het restsaldo.
    expect(m.opz.bron).toBe('gemeten');
    expect(m.opz.bedrag).toBe(800);
    expect(m.opz.bedrag + m.opz.vlak).toBe(m.pmt);
    expect(m.best.groeit).toBe(m.opz.bedrag - m.res - m.doel);
  });

  // v347: EEN AANNAME VOOR DE LIJN EN DE BAND. Wat naar een reservering gaat wordt op de termijn
  // betaald en een doel met een streefdatum gaat op die datum de deur uit; alleen een doel ZONDER
  // datum blijft staan, vlak. Tot v346 bleef alles vlak staan, tot je pensioen. In deze fixture:
  // Verbouwing (geen datum) groeit tot zijn doel van 20.000 en blijft, Nieuwe auto (wel een datum)
  // neemt zijn gespaarde 1.000 mee de deur uit, en de tandarts en de gemeente heffen elkaar per
  // jaar op (100 per maand erin, 1.200 eruit op de termijn).
  test('wat blijft staan komt er in de vlakke laag bij, wat wordt uitgegeven niet', async ({ page }) => {
    await boot(page);
    const met = await model(page);
    await page.evaluate(() => { SET.reserveringen = []; SET.goals = []; save(); });
    const zonder = await model(page);
    expect(zonder.best.groeit).toBe(zonder.opz.bedrag);   // v348: zonder bestemmingen groeit wat opzij ging, niet het hele restsaldo
    expect(zonder.opz.vlak).toBe(met.opz.vlak);   // de meting hangt niet aan de instellingen
    // v348: plus de lopende maand: wat Plan nu verdeelt telt niet mee voor een doel (v316) en staat vlak
    expect(met.onv0).toBe(500);
    expect(met.cashEind - zonder.cashEind).toBe(20000 - 1000 + met.onv0);
    const perMaand = met.res + met.doel;
    expect(met.cashEind - zonder.cashEind).toBeLessThan(perMaand * 12 * met.HZ);
    expect(zonder.inlegEind - met.inlegEind).toBeGreaterThan(0);
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
  /* v242 MAAKT DIT HARDER. Tot v241 kregen de doelen in de vul-fase wél een toewijzing, en de
     waterval moest uitleggen dat die niet nog een keer van je inleg af ging omdat 'vrij' de hele
     capaciteit al naar de buffer diverteerde. Sinds de grendel krijgen ze werkelijk niets: zolang
     de buffer niet vol is gaat de hele spaarinleg daarheen, dus doelPerMaand is nul en staat de
     stap er niet. Wat er wél van je inleg af gaat is onveranderd; dat is de laatste assertie. */
  test('in de vul-fase krijgen de doelen niets, dus er gaat niets dubbel af', async ({ page }) => {
    await boot(page, { nfVol: false });
    const m = await model(page);
    expect(m.volYear).toBeGreaterThan(m.nowY);
    expect(await page.evaluate(() => !!planGrendel())).toBe(true);
    expect(m.doel).toBe(0);
    // v347: fireInputs() draagt elk doel mee (ook een doel dat nu niets krijgt gaat op zijn datum
    // de deur uit); de stap op het scherm leest alleen wat er deze maand heen gaat.
    expect(m.best.doelItems).toEqual([]);
    expect(m.best.nu).toBe(m.res);
    expect(m.best.groeit).toBe(m.opz.bedrag - m.vrij - m.res);   // v348: de buffer krijgt de inleg van Plan uit wat er opzij ging
  });

  test('en zodra de buffer vol is krijgen ze wel een toewijzing', async ({ page }) => {
    await boot(page, { nfVol: true });
    const m = await model(page);
    expect(await page.evaluate(() => planGrendel())).toBe(null);
    expect(m.doel).toBeGreaterThan(0);
  });

  test('reserveringen gaan er ook in de vul-fase af: ze zitten niet in planCapacity', async ({ page }) => {
    await boot(page, { nfVol: false });
    const m = await model(page);
    expect(m.res).toBeGreaterThan(0);
    expect(m.best.nu).toBeGreaterThan(0);
  });

  test('de stap staat er niet, want er gaat niets heen', async ({ page }) => {
    await boot(page, { nfVol: false });
    const t = await waterval(page);
    // v242: geen bedrag tonen dat er niet af gaat, en ook geen stap die uitlegt waarom niet: de
    // noodfonds-vulling erboven draagt dat verhaal al, en die staat er onveranderd
    expect(t).not.toContain('Spaardoelen');
    expect(t).toMatch(/noodfonds/i);
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
