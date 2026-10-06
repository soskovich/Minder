// v348: DE PROJECTIE VERDEELT ZOALS PLAN, EN ALLEEN WAT OPZIJ GING GROEIT MEE.
// A2: fireModel() herhaalt planVerdeelMaand() maand na maand op de rijen van Plan, met de grendel via
// planGrendelVan(), zoals planVooruit(). Wat een vol doel vrijmaakt gaat naar het volgende doel; pas als
// alles vol is (of op zijn datum uitgegeven) gaat de inleg naar de groei.
// A3: wat er werkelijk opzij ging (opzijGemiddeld(): het gemiddelde van vermogensInleg() over de laatste
// drie afgeronde maanden) gaat de waterval in; het surplus min dat bedrag blijft vlak staan. Samen is het
// het surplus.
// De fixture is die van lijn-en-band: inleg 2.200 naar de spaarrekening, Kosten Koper 10.000 over tien
// maanden, Inrichting 3.000 over zes, een boete van 299 volgende maand, een jaarpremie, noodfonds vol.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { kaalUit } = require('./bron-kaal');
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now), M1 = ym(new Date(now.getFullYear(), now.getMonth()-1, 1)), M2 = ym(new Date(now.getFullYear(), now.getMonth()-2, 1)), M3 = ym(new Date(now.getFullYear(), now.getMonth()-3, 1));
const NOV = ym(new Date(now.getFullYear(), now.getMonth()+1, 1));
const MAIN='NL01MAIN0000001111', SPAAR='NL01SAVE0000004323', RES='NL01RESV0000009999';
function seed(o){
  o = o || {};
  const tx=[]; const add=(id,acc,m,d,a,n,desc)=>tx.push({id,date:m+'-'+d,amount:a,acc,name:n,desc,typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  const maanden = o.maanden || [M3,M2,M1,CUR];
  for(const m of maanden){ add('i'+m,MAIN,m,'25',5216,'Werkgever','SALARIS LOON'); add('h'+m,MAIN,m,'02',-750,'Huur','SEPA INCASSO HUUR');
    add('a'+m,MAIN,m,'05',-900,'AH','BEA, BETAALPAS ALBERT HEIJN');
    add('s'+m,SPAAR,m,'26',(o.spaar && o.spaar[m]!=null)?o.spaar[m]:2200,'Spaar','NAAR SPAREN'); }
  const set=Object.assign({limit:70,mode:'begeleid',autoIncome:false,income:5216,manualBal:{[MAIN]:2000,[SPAAR]:9000,[RES]:299},
    budgets:{boodschappen:900,huur:750},savingMode:'amount',savingAmount:2200,savingsAcc:{[SPAAR]:true},resAcc:RES,
    nfDoelVast:3534,nfToegewezen:3534,nfToegewezenMigrated:true,bufferNorm:2,
    goals:[{id:'g1',naam:'Kosten Koper',doel:10000,gespaard:0,streefdatum:ym(new Date(now.getFullYear(),now.getMonth()+10,1))},
           {id:'g2',naam:'Inrichting woning',doel:3000,gespaard:0,streefdatum:ym(new Date(now.getFullYear(),now.getMonth()+6,1))}],
    reserveringen:o.res || [], reis:{birth:1990}}, o.set || {});
  return {minder_tx:JSON.stringify(tx),minder_ovr:'{}',minder_set:JSON.stringify(set),minder_own:JSON.stringify([MAIN,SPAAR,RES]),minder_accmeta:'{}',minder_plan:'{}'};
}
const BOETE = { id: 'r1', naam: 'Boete', bedrag: 299, vervalmaand: NOV, intervalM: 0 };
const PREMIE = { id: 'r2', naam: 'Premie', bedrag: 1200, vervalmaand: ym(new Date(now.getFullYear(), now.getMonth() + 3, 1)), intervalM: 12 };
async function boot(page, o) {
  await page.addInitScript((x) => { for (const k in x) localStorage.setItem(k, x[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof reisModel === 'function');
}
const vol = (page) => page.evaluate(() => ({ plan: planVooruit(allocatePlan()), proj: reisModel().sim.vol }));

test.describe('a · A2: de projectie verdeelt zoals Plan', () => {
  test('Inrichting en Kosten Koper raken in de projectie vol in dezelfde maand als op Plan', async ({ page }) => {
    await boot(page, { res: [BOETE, PREMIE] });
    const v = await vol(page);
    // invoer: Plan zet de twee doelen in verschillende maanden vol, met de terugval van Kosten Koper naar Inrichting
    expect(v.plan.g1).toBe(5);
    expect(v.plan.g2).toBe(6);
    expect(v.proj.g1).toBe(v.plan.g1);
    expect(v.proj.g2).toBe(v.plan.g2);
  });

  test('ook bij een verdeling op percentages, waar het vrijgekomen geld naar het andere doel zakt', async ({ page }) => {
    await boot(page, { set: { goals: [
      { id: 'g1', naam: 'Kosten Koper', doel: 10000, gespaard: 0, streefdatum: ym(new Date(now.getFullYear(), now.getMonth() + 10, 1)), allocMode: 'pct', pct: 90 },
      { id: 'g2', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: ym(new Date(now.getFullYear(), now.getMonth() + 12, 1)), allocMode: 'pct', pct: 10 }] } });
    const v = await vol(page);
    const vast = await page.evaluate(() => { const i = fireInputs(); return Math.ceil(3000 / i.doelItems[1].per); });
    // invoer: zonder terugval zou Inrichting pas na 3000/220 = 14 maanden vol zijn; Plan laat hem eerder vol raken
    expect(vast).toBe(14);
    expect(v.plan.g2).toBeLessThan(vast);
    expect(v.proj).toEqual(v.plan);
  });

  test('ook met een buffer die eerst nog vol moet: de grendel gaat in de projectie in dezelfde maand open', async ({ page }) => {
    // de doelen krijgen een datum na hun vol-maand, zodat het verschil met Plan alleen de grendel kan zijn
    const D = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
    await boot(page, { set: { nfDoelVast: 8000, nfToegewezen: 3534, goals: [
      { id: 'g1', naam: 'Kosten Koper', doel: 10000, gespaard: 0, streefdatum: D(12) },
      { id: 'g2', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: D(12) }] } });
    const v = await vol(page);
    expect(v.plan.noodfonds).toBe(3);
    expect(v.proj).toEqual(v.plan);
  });

  test('een doel waarvan de datum eerder valt dan Plan hem vol heeft, gaat op die datum de deur uit', async ({ page }) => {
    // Plan blijft een doel na zijn datum vullen; de projectie geeft op de datum uit wat er dan staat (v347)
    await boot(page, { set: { nfDoelVast: 8000, nfToegewezen: 3534 } });
    const v = await vol(page);
    expect(v.plan.g2).toBe(8);
    expect(v.proj.g2).toBeUndefined();
    expect(v.proj.g1).toBe(v.plan.g1);
    const L = await page.evaluate(() => diagReisReserveringen().join('\n'));
    expect(L).toMatch(/Inrichting woning: Plan 8 · projectie -  VERSCHIL/);
  });

  test('pas als alles vol is gaat de inleg naar de groei', async ({ page }) => {
    await boot(page, { res: [PREMIE] });
    const r = await page.evaluate(() => { const M = reisModel(); return { g: [0, 1, 2].map((y) => Math.round(M.pmtFor(M.nowY + y) * 12)), o: M.opzij }; });
    // in de eerste zes maanden neemt Plan alles wat opzij ging; daarna gaat het, min de premie, naar de groei
    expect(r.o.bedrag).toBe(2200);
    expect(r.g[1]).toBe(12 * (2200 - 100));
    expect(r.g[0]).toBeLessThan(6 * (2200 - 100) + 1);
  });

  test('fireModel() leent de verdeling van Plan en drukt hem niet opnieuw uit', async ({ page }) => {
    await boot(page);
    const bron = await kaalUit(page, 'fireModel');
    expect(bron).toContain('planVerdeelMaand(');
    expect(bron).toContain('planGrendelVan(');
    expect(bron).not.toContain('doelVraag');
  });
});

test.describe('b · A3: alleen wat opzij ging groeit, de rest staat vlak', () => {
  test('wat opzij ging is het gemiddelde van de laatste drie afgeronde maanden', async ({ page }) => {
    await boot(page, { spaar: { [M3]: 1000, [M2]: 2000, [M1]: 3000, [CUR]: 9999 } });
    const r = await page.evaluate(() => ({ g: opzijGemiddeld(), o: reisModel().opzij }));
    expect(r.g.bedrag).toBe(2000);
    expect(r.g.maanden).toEqual([M3, M2, M1]);
    expect(r.o.bron).toBe('gemeten');
    expect(r.o.bedrag).toBe(2000);
  });

  test('zet je minder opzij dan Plan verdeelt, dan zijn de doelen in de projectie later vol dan op Plan', async ({ page }) => {
    await boot(page, { spaar: { [M3]: 1000, [M2]: 1000, [M1]: 1000 } });
    const v = await vol(page);
    expect(await page.evaluate(() => reisModel().opzij.bedrag)).toBe(1000);
    expect(v.plan.g1).toBe(5);
    expect(v.proj.g1).toBe(10);   // 10.000 met 1.000 per maand
  });

  test('opzij en vlak tellen op tot het surplus, elke maand, en er verdwijnt geen euro', async ({ page }) => {
    // doelen zonder datum en geen posten: dan gaat er niets uit en is elke euro van het surplus terug te vinden
    await boot(page, { set: { goals: [{ id: 'g1', naam: 'Buffer extra', doel: 5000, gespaard: 0 }] } });
    const r = await page.evaluate(() => { const M = reisModel();
      return { a: M.R.pmt, o: M.opzij, c: M.sim.cser, g: [0, 1, 2].map((y) => M.pmtFor(M.nowY + y) * 12) }; });
    expect(r.o.bedrag + r.o.vlak).toBe(r.a);
    expect(r.o.vlak).toBe(r.a - 2200);
    for (const y of [0, 1, 2]) expect(Math.round((r.c[y + 1] - r.c[y]) + r.g[y])).toBe(12 * r.a);
  });

  test('de lijn verandert doordat alleen het opzijgezette deel groeit: na de doelen 2.100 per maand en niet het hele surplus', async ({ page }) => {
    await boot(page, { res: [BOETE, PREMIE] });
    const r = await page.evaluate(() => { const M = reisModel(); return { a: M.R.pmt, vlak: M.opzij.vlak, g2: M.pmtFor(M.nowY + 2) * 12, c: M.sim.cser }; });
    expect(r.a).toBe(3566);
    expect(r.vlak).toBe(1366);
    expect(Math.round(r.g2)).toBe(12 * (2200 - 100));
    // de vlakke laag groeit elk jaar met wat niet opzij ging (de premie komt erin en gaat er weer uit)
    expect(Math.round(r.c[4] - r.c[3])).toBe(12 * 1366);
  });

  test('zonder drie gemeten maanden rekent hij met wat je instelde, en zegt dat', async ({ page }) => {
    await boot(page, { maanden: [M1, CUR], res: [PREMIE] });
    const r = await page.evaluate(() => { const M = reisModel(); const d = document.createElement('div'); d.innerHTML = reisRestsaldo(M).inleg;
      return { o: M.opzij, g: opzijGemiddeld(), t: d.textContent.replace(/\s+/g, ' ') }; });
    expect(r.g).toBeNull();
    expect(r.o.bron).toBe('instelling');
    expect(r.o.bedrag).toBe(2200 + 100);   // spaarinleg plus wat de premie per maand kost
    expect(r.t).toContain('nog geen drie afgeronde maanden gemeten');
  });

  test('zonder meting en zonder ingestelde inleg gaat het hele surplus de waterval in, zoals tot v348', async ({ page }) => {
    await boot(page, { maanden: [M1, CUR], set: { savingMode: 'amount', savingAmount: 0, goals: [] } });
    const r = await page.evaluate(() => { const M = reisModel(); return { o: M.opzij, a: M.R.pmt }; });
    expect(r.o.bron).toBe('surplus');
    expect(r.o.vlak).toBe(0);
    expect(r.o.bedrag).toBe(r.a);
  });

  test('ging er meer opzij dan het surplus, dan rekent hij met het surplus en staat er niets vlak', async ({ page }) => {
    await boot(page, { spaar: { [M3]: 5000, [M2]: 5000, [M1]: 5000 } });
    const r = await page.evaluate(() => { const M = reisModel(); return { o: M.opzij, a: M.R.pmt }; });
    expect(r.o.gemeten).toBe(5000);
    expect(r.o.bedrag).toBe(r.a);
    expect(r.o.vlak).toBe(0);
  });

  test('bij zelf ingevulde inleg wordt er niets gesplitst', async ({ page }) => {
    await boot(page, { set: { reis: { birth: 1990, inlegMode: 'manual', pmt: 1500 } } });
    const r = await page.evaluate(() => { const M = reisModel(); return { o: M.opzij, g: M.pmtFor(M.nowY + 1) * 12, c: M.sim.cser }; });
    expect(r.o.vlak).toBe(0);
    expect(Math.round(r.g)).toBe(12 * 1500);
    expect(r.c[2]).toBe(r.c[0]);
  });

  test('de Monte Carlo leest dezelfde splitsing: de band bij beweeglijkheid nul volgt de lijn', async ({ page }) => {
    await boot(page, { res: [BOETE, PREMIE] });
    const q = await page.evaluate(() => { const M = reisModel(); const mc0 = fireMonteCarlo(Object.assign({}, M, { R: Object.assign({}, M.R, { sigma: 0 }) }));
      return [1, 5, 10, M.HZ].map((y) => mc0.p50[y] / M.mid[y]); });
    for (const x of q) { expect(x).toBeGreaterThan(0.93); expect(x).toBeLessThanOrEqual(1.0001); }
  });
});

test.describe('c · het scherm en het diagnoseblok', () => {
  const tekst = (page) => page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = reisRestsaldo(reisModel()).inleg; return d.textContent.replace(/\s+/g, ' '); });
  test('de waterval zegt wat opzij ging en wat vlak blijft, met de maanden erbij', async ({ page }) => {
    await boot(page, { res: [PREMIE] });
    // invoer: Plan neemt in de eerste maanden alles wat opzij ging, dus voor de premie blijft niets over
    expect(await page.evaluate(() => { const B = reisModel().bestemming; return [B.nu, B.wens]; })).toEqual([2200, 2300]);
    const t = await tekst(page);
    expect(t).toMatch(/Opzij gezet\s*€2\.200\/mnd/);
    expect(t).toMatch(/gemiddeld over \w+ t\/m \w+/);
    expect(t).toMatch(/Blijft vlak staan\s*€1\.366\/mnd/);
    // na de doelen groeit wat opzij ging, en de regel noemt de maand waarin Plan vol is
    expect(t).toMatch(/Groeit mee vanaf nu\s*€0\/mnd\s*Vanaf \w+ \d{4}, als Plan vol is\s*€2\.100\/mnd/);
    expect(t).toContain('€2.200 opzij min wat er hierboven af gaat');
    // de reserveringen staan los van Plan (v128): dat Plan alles opzij gezette neemt is geen klem op je doelen
    expect(t).not.toContain('passen niet');
  });

  for (const w of [360, 390]) {
    test(`het blok past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page, { set: { reis: { birth: 1990, g_inleg: true } } });
      await page.evaluate(() => { go('fire'); });
      const el = page.locator('[data-opzij]');
      await el.scrollIntoViewIfNeeded();
      const m = await el.evaluate((e) => ({ w: e.scrollWidth, cw: e.clientWidth, h: Math.round(e.getBoundingClientRect().height), r: e.getBoundingClientRect().right }));
      expect(m.w).toBeLessThanOrEqual(m.cw);
      expect(m.r).toBeLessThanOrEqual(w);
      console.log(`opzij-blok ${w}px: ${m.h}px`);
    });
  }

  test('blok 18 zet Plan naast de projectie en leest alleen', async ({ page }) => {
    await boot(page, { res: [BOETE] });
    let writes = 0;
    await page.evaluate(() => { window.__w = 0; const o = Storage.prototype.setItem; Storage.prototype.setItem = function () { window.__w++; return o.apply(this, arguments); }; });
    const L = await page.evaluate(() => diagReisReserveringen().join('\n'));
    writes = await page.evaluate(() => window.__w);
    expect(writes).toBe(0);
    expect(L).toContain('inleg: surplus 3566 = opzij 2200');
    expect(L).toContain('blijft vlak 1366');
    expect(L).toMatch(/Kosten Koper: Plan 5 · projectie 5/);
    expect(L).toMatch(/Inrichting woning: Plan 6 · projectie 6/);
    expect(L).not.toContain('VERSCHIL');
  });
});
