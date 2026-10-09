// v347: DE LIJN EN DE BAND REKENEN MET EEN AANNAME OVER GELD VOOR RESERVERINGEN EN DOELEN. Tot v346 bleef
// dat geld in de lijn (fireModel) als vlak geld staan tot je pensioen, en telde de Monte Carlo het helemaal
// niet mee: hij liet de vlakke laag alleen met `vrij` groeien. De aanname nu: wat wordt uitgegeven gaat er op
// zijn moment uit (een reservering op elke termijn, een eenmalige post in zijn maand, een doel op zijn
// streefdatum), en wat blijft staan (je noodfonds, een doel zonder datum) staat vlak op je spaarrekening.
// Een bezittingsinleg (a.per) groeit in zijn eigen pot. De Monte Carlo leest dezelfde vlakke reeks
// (sim.cser) en dezelfde inleg per jaar (pmtFor) als de lijn.
// De fixture draagt de vorm van het toestel: inleg 2.200, Kosten Koper 10.000 over tien maanden en
// Inrichting 3.000 over zes, een boete van 299 volgende maand, noodfonds vol.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { kaalUit } = require('./bron-kaal');
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now), M1 = ym(new Date(now.getFullYear(), now.getMonth()-1, 1)), M2 = ym(new Date(now.getFullYear(), now.getMonth()-2, 1)), M3 = ym(new Date(now.getFullYear(), now.getMonth()-3, 1));
// NOV is volgende maand: de boete van het toestel valt een maand weg.
const NOV = ym(new Date(now.getFullYear(), now.getMonth()+1, 1));
const MAIN='NL01MAIN0000001111', SPAAR='NL01SAVE0000004323', RES='NL01RESV0000009999';
function seed(res){
  const tx=[]; const add=(id,acc,m,d,a,n,desc)=>tx.push({id,date:m+'-'+d,amount:a,acc,name:n,desc,typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  for(const m of [M3,M2,M1,CUR]){ add('i'+m,MAIN,m,'25',5216,'Werkgever','SALARIS LOON'); add('h'+m,MAIN,m,'02',-750,'Huur','SEPA INCASSO HUUR');
    add('a'+m,MAIN,m,'05',-900,'AH','BEA, BETAALPAS ALBERT HEIJN'); add('s'+m,SPAAR,m,'26',2200,'Spaar','NAAR SPAREN'); }
  const set={limit:70,mode:'begeleid',autoIncome:false,income:5216,manualBal:{[MAIN]:2000,[SPAAR]:9000,[RES]:299},
    budgets:{boodschappen:900,huur:750},savingMode:'amount',savingAmount:2200,savingsAcc:{[SPAAR]:true},resAcc:RES,
    nfDoelVast:3534,nfToegewezen:3534,nfToegewezenMigrated:true,bufferNorm:2,
    goals:[{id:'g1',naam:'Kosten Koper',doel:10000,gespaard:0,streefdatum:ym(new Date(now.getFullYear(),now.getMonth()+10,1))},
           {id:'g2',naam:'Inrichting woning',doel:3000,gespaard:0,streefdatum:ym(new Date(now.getFullYear(),now.getMonth()+6,1))}],
    reserveringen:res, reis:{birth:1990}};
  return {minder_tx:JSON.stringify(tx),minder_ovr:'{}',minder_set:JSON.stringify(set),minder_own:JSON.stringify([MAIN,SPAAR,RES]),minder_accmeta:'{}',minder_plan:'{}'};
}


const BOETE = { id: 'r1', naam: 'Boete', bedrag: 299, vervalmaand: NOV, intervalM: 0 };
const PREMIE = { id: 'r2', naam: 'Premie', bedrag: 1200, vervalmaand: ym(new Date(now.getFullYear(), now.getMonth() + 3, 1)), intervalM: 12 };
async function boot(page, res, extra) {
  const d = seed(res);
  if (extra) { const s = JSON.parse(d.minder_set); Object.assign(s, extra); d.minder_set = JSON.stringify(s); }
  await page.addInitScript((x) => { for (const k in x) localStorage.setItem(k, x[k]); }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof reisModel === 'function');
}

const vast = () => { let s = 12345; Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; };
const cser = (page) => page.evaluate(() => reisModel().sim.cser.map(Math.round));
const cashLijn = (page) => page.evaluate(() => { const M = reisModel(); const c = M.assetParts.find((p) => p.kind === 'cash'); return c ? c.series.map(Math.round) : []; });

test.describe('a · wat wordt uitgegeven gaat eruit, wat blijft staat', () => {
  test('een doel met een streefdatum laat de vlakke laag niet groeien: het gaat op zijn datum de deur uit', async ({ page }) => {
    await boot(page, []);
    const met = await cser(page);
    await page.evaluate(() => { SET.goals = []; save(); });
    const zonder = await cser(page);
    /* v370: de lopende maand telt mee voor de doelen, zoals op Plan, dus al het doelgeld gaat op de datum de deur uit
       en er blijft niets vlak staan (tot v370 bleef de inleg van deze maand, 2.200, staan). */
    expect(met.slice(1, 11).map((v, i) => v - zonder[i + 1])).toEqual(Array(10).fill(0));
    expect(met[0]).toBe(zonder[0]);
  });

  test('tussen het sparen en de datum staat het geld er wel', async ({ page }) => {
    // Kosten Koper op dertig maanden: na het eerste jaar staat er twaalf maanden inleg, na het derde niets meer
    await boot(page, [], { goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 100000, gespaard: 0, streefdatum: ym(new Date(now.getFullYear(), now.getMonth() + 30, 1)) }] });
    const r = await page.evaluate(() => { const M = reisModel(); return { c: M.sim.cser.map(Math.round), per: (fireInputs().doelItems[0] || {}).per,
      g: [0, 1, 2, 3].map((y) => M.pmtFor(M.nowY + y) * 12) }; });
    await page.evaluate(() => { SET.goals = []; save(); });
    const z = await page.evaluate(() => { const M = reisModel(); return [0, 1, 2, 3].map((y) => M.pmtFor(M.nowY + y) * 12); });
    const zc = await page.evaluate(() => reisModel().sim.cser.map(Math.round));
    expect(r.per).toBeGreaterThan(0);
    // v370: vanaf DEZE maand krijgt het doel de inleg van Plan, ook in de maand van zijn datum (vol in mei, moet in
    // mei is op tijd), en daarna gaat het eruit; er blijft niets van de lopende maand vlak staan
    expect(r.c[1] - zc[1]).toBe(12 * r.per);
    expect(r.c[2] - zc[2]).toBe(24 * r.per);
    expect(r.c[3] - zc[3]).toBe(0);
    // de groei mist de lopende maand en de dertig maanden tot en met de datum
    expect(z.map((v, i) => Math.round(v - r.g[i]))).toEqual([12 * r.per, 12 * r.per, 7 * r.per, 0]);
  });

  test('een doel zonder datum blijft staan, tot zijn doelbedrag en niet verder', async ({ page }) => {
    await boot(page, [], { goals: [{ id: 'g1', naam: 'Buffer extra', doel: 5000, gespaard: 0 }] });
    const met = await cser(page);
    await page.evaluate(() => { SET.goals = []; save(); });
    const zonder = await cser(page);
    // v370: de lopende maand telt mee voor het doel, dus er staat precies het doelbedrag vlak en niets erbovenop
    expect(met[met.length - 1] - zonder[zonder.length - 1]).toBe(5000);
    expect(met[5] - zonder[5]).toBe(5000);
  });

  test('een reservering komt binnen en gaat op de termijn weer uit', async ({ page }) => {
    await boot(page, [PREMIE], { goals: [] });
    const met = await cser(page);
    await page.evaluate(() => { SET.reserveringen = []; save(); });
    const zonder = await cser(page);
    expect(met.slice(0, 11)).toEqual(zonder.slice(0, 11));
  });

  test('de lijn toont dezelfde vlakke laag als de reeks die de band leest', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    const c = await cser(page), l = await cashLijn(page);
    expect(l.slice(0, 11)).toEqual(c.slice(0, 11));
  });
  // het scherm zegt wat er met het geld gebeurt, ook als een doel geen datum heeft
  test('de stap Spaardoelen noemt uitgeven bij een datum en blijven zonder', async ({ page }) => {
    const sub = () => page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = reisRestsaldo(reisModel()).inleg; return d.textContent.replace(/\s+/g, ' '); });
    await boot(page, []);
    expect(await sub()).toContain('groeit niet mee en gaat op de streefdatum de deur uit');
    await page.evaluate(() => { SET.goals = SET.goals.map((g, i) => Object.assign({}, g, { mode: 'fixed', perMaand: 1000 }, i === 1 ? { streefdatum: '' } : {})); save(); });
    expect(await page.evaluate(() => reisModel().bestemming.doelItems.length)).toBe(2);   // invoer: beide doelen krijgen inleg
    expect(await sub()).toContain('gaat op een streefdatum de deur uit; zonder datum blijft het staan');
    await page.evaluate(() => { SET.goals = SET.goals.map((g) => Object.assign({}, g, { streefdatum: '' })); save(); });
    expect(await sub()).toContain('groeit niet mee en blijft staan, want er is geen streefdatum');
  });
});

test.describe('b · de lijn en de band', () => {
  test('bij een beweeglijkheid van nul ligt de band binnen enkele procenten van de lijn', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    const r = await page.evaluate(() => { const M = reisModel();
      const mc0 = fireMonteCarlo(Object.assign({}, M, { R: Object.assign({}, M.R, { sigma: 0 }) }));
      return [1, 5, 10, M.HZ].map((y) => mc0.p50[y] / M.mid[y]); });
    // wat overblijft is de rekenwijze: de band rent per jaar, de lijn per maand
    for (const q of r) { expect(q).toBeGreaterThan(0.93); expect(q).toBeLessThanOrEqual(1.0001); }
  });

  test('op koers en de haalbaarheid zeggen hetzelfde op de stand van het toestel', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    const r = await page.evaluate((v) => { eval(v)(); const M = reisModel(); const mc = fireMonteCarlo(M);
      const f = M.ms.find((m) => m.key === 'fire'); let reikt = null; for (let y = 0; y <= M.HZ; y++) if (mc.p50[y] >= M.FIRE) { reikt = M.nowY + y; break; }
      return { opKoers: fireOpKoers(), lijn: f && f.yr, reikt, succ: mc.succ, doel: M.targetYear }; }, vast.toString());
    expect(r.opKoers).toBe(true);
    expect(r.lijn).toBeLessThanOrEqual(r.doel);
    expect(r.reikt).not.toBeNull();
    expect(r.reikt).toBeLessThanOrEqual(r.doel);
    expect(Math.abs(r.reikt - r.lijn)).toBeLessThanOrEqual(2);
    expect(r.succ).toBeGreaterThanOrEqual(90);
  });

  test('de Monte Carlo leest de vlakke reeks van de lijn en laat hem niet zelf groeien', async ({ page }) => {
    await boot(page, []);
    const bron = await kaalUit(page, 'fireMonteCarlo');
    expect(bron).toContain('cser');
    expect(bron).not.toMatch(/vrij\s*\*\s*12/);
  });
});

test.describe('c · wat niet verandert, en wat weg is', () => {
  /* v347, bijvangst: fireOpKoers() toetste `if(M.missing)` en dat is een object, dus hij gaf nooit een
     oordeel. Een onbekend saldo blijft wel geen oordeel (v59/v73/v173). */
  test('fireOpKoers geeft een oordeel, behalve bij een onbekend saldo', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    const r = await page.evaluate(() => { const M = reisModel(); return { miss: M.missing, ok: fireOpKoers() }; });
    expect(typeof r.miss).toBe('object');           // invoer: het object dat de oude toets altijd waar maakte
    expect(r.miss.balances).toBeFalsy();
    expect(r.ok).toBe(true);
    const bron = await kaalUit(page, 'fireOpKoers');
    expect(bron).toContain('M.missing.balances');
  });

  test('bij zelf ingevulde inleg gaat er niets in en niets uit', async ({ page }) => {
    await boot(page, [BOETE, PREMIE], { reis: { birth: 1990, inlegMode: 'manual', pmt: 1500 } });
    const met = await cser(page);
    await page.evaluate(() => { SET.reserveringen = []; SET.goals = []; save(); });
    const zonder = await cser(page);
    expect(met).toEqual(zonder);
    expect(new Set(met).size).toBe(1);
  });

  test('dekking() draagt geen bruto maandsom meer', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    expect(await kaalUit(page, 'dekking')).not.toContain('benodigdPerMaand');
    expect(await page.evaluate(() => 'benodigdPerMaand' in dekking(12))).toBe(false);
  });

  test('blok 18 zet de lijn naast de band en schrijft niets', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    const r = await page.evaluate(() => {
      const oud = localStorage.setItem; let n = 0; localStorage.setItem = function () { n++; return oud.apply(this, arguments); };
      const L = diagReisReserveringen(); localStorage.setItem = oud; return { n, t: L.join('\n') }; });
    expect(r.n).toBe(0);
    expect(r.t).toContain('Kosten Koper: doel 10000, staat 0, 2200 per maand, uitgegeven in ');
    expect(r.t).toMatch(/bij nul \d+ \(\d+%\)/);
  });
});
