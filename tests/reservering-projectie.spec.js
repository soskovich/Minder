// v346: de lange-termijnprojectie rekent per post. Een terugkerende post kost bedrag door interval,
// elke maand en in elk jaar; een eenmalige post kost zijn volle bedrag in zijn eigen maand en daarna
// niets. Tot v345 las de projectie een maandlast uit dekking(): bruto, dus een boete van EUR 299 over
// een maand werd EUR 299 per maand tot je pensioen. De fixture draagt de vorm van het toestel (een
// boete van EUR 299 eenmalig volgende maand, inleg EUR 2.200, twee doelen) met een vol noodfonds,
// zodat de doelinleg vanaf nu meetelt en elk jaar dezelfde vorm heeft.
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
const KWARTAAL = { id: 'r3', naam: 'Kwartaal', bedrag: 300, vervalmaand: CUR, intervalM: 3 };

async function boot(page, res, extra) {
  const d = seed(res);
  if (extra) { const s = JSON.parse(d.minder_set); Object.assign(s, extra); d.minder_set = JSON.stringify(s); }
  await page.addInitScript((x) => { for (const k in x) localStorage.setItem(k, x[k]); }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof reisModel === 'function');
}
// De toename van de vlakke laag per jaar. v347: wat naar een reservering gaat komt daar binnen en gaat
// er op de termijn weer uit, dus een post laat de vlakke laag per saldo staan en haalt zijn bedrag uit
// de GROEI. Tot v346 bleef hij in de vlakke laag staan, tot je pensioen.
const cashStap = (page) => page.evaluate(() => {
  const M = reisModel(); const c = M.assetParts.find((p) => p.kind === 'cash');
  const s = c ? c.series : M.assets.map(() => 0);
  return { stap: s.slice(1, 6).map((v, i) => Math.round(v - s[i])), volYear: M.freed.volYear, nowY: M.nowY,
           pmt0: M.pmtFor(M.nowY), pmt1: M.pmtFor(M.nowY + 1),
           // v347: de inleg in de groei per projectiejaar (jaarbedrag); daar gaat een post van af
           groei: [0, 1, 2, 3, 4].map((y) => Math.round(M.pmtFor(M.nowY + y) * 12)) };
});

test.describe('a · resPosten() rekent per post', () => {
  test('een terugkerende post is bedrag door interval, een eenmalige draagt zijn maand', async ({ page }) => {
    await boot(page, [BOETE, PREMIE, KWARTAAL]);
    const r = await page.evaluate(() => resPosten());
    expect(r.perMaand).toBe(1200 / 12 + 300 / 3);
    expect(r.eenmalig.map((x) => [x.naam, x.bedrag, x.k, x.maand])).toEqual([['Boete', 299, 1, NOV]]);
    expect(r.eenmalig[0].k).toBe(1);
  });

  test('een betaalde eenmalige post en een post zonder bedrag tellen niet', async ({ page }) => {
    await boot(page, [BOETE, { id: 'r9', naam: 'Leeg', bedrag: 0, vervalmaand: NOV, intervalM: 12 }],
      { resBetaald: { r1: { op: CUR + '-01', maand: NOV } } });
    const r = await page.evaluate(() => resPosten());
    expect(r.perMaand).toBe(0);
    expect(r.eenmalig).toEqual([]);
  });

  test('de projectie leest resPosten() en niet de maandlast van dekking()', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    const bron = await kaalUit(page, 'fireInputs');
    expect(bron).toContain('resPosten(');
    expect(bron).not.toContain('benodigdPerMaand');
    expect(bron).not.toContain('nodigPerMaand');
    const i = await page.evaluate(() => fireInputs());
    expect(i.resPerMaand).toBe(100);
    expect(i.resEenmalig.map((x) => [x.naam, x.bedrag, x.k])).toEqual([['Boete', 299, 1]]);
  });
});

// v348: de groep hieronder draait ZONDER doelen. De waterval loopt sinds v348 over wat er werkelijk opzij
// ging (hier gemeten 2.200), en Plan neemt dat eerst; met de twee doelen van het toestel is er in de eerste
// maanden niets meer over voor een post, en dan wordt hij uit de vlakke laag betaald (zie lijn-en-band).
// Wat deze groep toetst is de maand en het jaar van een post, en daarvoor moet er ruimte zijn.
test.describe('b · een eenmalige post telt alleen in zijn eigen maand', () => {
  test('de boete gaat er in het eerste jaar een keer af en daarna niet meer', async ({ page }) => {
    await boot(page, [BOETE], { goals: [] });
    const zonder = await (async () => { await page.evaluate(() => { SET.reserveringen = []; save(); }); return cashStap(page); })();
    await page.evaluate((b) => { SET.reserveringen = [b]; save(); }, BOETE);
    const met = await cashStap(page);
    expect(met.volYear).toBe(met.nowY);                       // invoermeting: geen vul-fase die de jaren ongelijk maakt
    expect(zonder.groei.map((v, i) => v - met.groei[i])).toEqual([299, 0, 0, 0, 0]);   // uit de groei: een keer
    expect(met.stap).toEqual(zonder.stap);                    // v347: opzij en in dezelfde maand uitgegeven
  });

  // v347: de Monte Carlo leest dezelfde inleg per jaar (pmtFor) EN dezelfde vlakke laag (sim.cser) als de lijn
  test('de Monte Carlo ziet hem ook alleen in zijn eigen jaar', async ({ page }) => {
    await boot(page, [BOETE], { goals: [] });
    const lees = () => page.evaluate(() => { const M = reisModel(); return { p0: M.pmtFor(M.nowY), p1: M.pmtFor(M.nowY + 1), c: M.sim.cser.map(Math.round) }; });
    const met = await lees();
    await page.evaluate(() => { SET.reserveringen = []; save(); });
    const z = await lees();
    expect(Math.round((z.p0 - met.p0) * 12)).toBe(299);
    expect(Math.round((z.p1 - met.p1) * 12)).toBe(0);
    expect(met.c).toEqual(z.c);
  });

  test('een eenmalige post buiten het eerste jaar valt in zijn eigen jaar', async ({ page }) => {
    const LAAT = { id: 'r5', naam: 'Laat', bedrag: 600, vervalmaand: ym(new Date(now.getFullYear(), now.getMonth() + 14, 1)), intervalM: 0 };
    await boot(page, [LAAT]);
    const m = await cashStap(page);
    await page.evaluate(() => { SET.reserveringen = []; save(); });
    const z = await cashStap(page);
    expect(z.groei.map((v, i) => v - m.groei[i])).toEqual([0, 600, 0, 0, 0]);
    expect(m.stap).toEqual(z.stap);
  });
});

test.describe('c · een terugkerende post telt in elk jaar hetzelfde', () => {
  test('een premie van EUR 1.200 per jaar is EUR 1.200 per projectiejaar, ook als hij nu gedekt is', async ({ page }) => {
    await boot(page, [PREMIE], { goals: [], manualBal: { [MAIN]: 2000, [SPAAR]: 9000, [RES]: 5000 } });   // v348: zonder doelen, zie groep b
    const met = await cashStap(page);
    await page.evaluate(() => { SET.reserveringen = []; save(); });
    const z = await cashStap(page);
    expect(z.groei.map((v, i) => v - met.groei[i])).toEqual([1200, 1200, 1200, 1200, 1200]);
    // v347: elk jaar 1.200 opzij en elk jaar 1.200 betaald, dus de vlakke laag groeit er niet van
    expect(met.stap).toEqual(z.stap);
  });

  test('een kwartaalpost die deze maand valt is EUR 100 per maand, niet de achterstand van dit jaar', async ({ page }) => {
    await boot(page, [KWARTAAL]);
    // v347: de bruto som staat niet meer in dekking(), dus de test rekent hem zelf na
    const r = await page.evaluate(() => ({ i: fireInputs().resPerMaand,
      bruto: Math.round(verplichtingen(12).reduce((s, x) => s + x.bedrag / Math.max(x.offset, 1), 0)) }));
    expect(r.i).toBe(100);
    expect(r.bruto).toBeGreaterThan(r.i);   // invoermeting: de oude maandlast lag hier anders
  });
});

test.describe('d · wat er niet verandert', () => {
  test('bij zelf ingevulde inleg trekt de projectie niets af, ook geen eenmalige post', async ({ page }) => {
    await boot(page, [BOETE, PREMIE], { reis: { birth: 1990, inlegMode: 'manual', pmt: 1500 } });
    const m = await cashStap(page);
    await page.evaluate(() => { SET.reserveringen = []; save(); });
    const z = await cashStap(page);
    expect(m.stap).toEqual(z.stap);
    expect(await page.evaluate(() => reisModel().bestemming.eenmalig)).toEqual([]);
  });

  test('het totaal blijft: wat er naar de bestemmingen gaat komt in de vlakke laag', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    const r = await page.evaluate(() => { const M = reisModel(); const k = (n) => M.assetParts.find((p) => p.kind === n);
      return { som: Math.round(M.assetParts.reduce((s, p) => s + (p.series[M.HZ] || 0), 0)), assets: Math.round(M.assets[M.HZ]) }; });
    expect(Math.abs(r.som - r.assets)).toBeLessThanOrEqual(1);
  });
});

test.describe('e · het scherm en de uitlezing', () => {
  test('de stap Reserveringen noemt het structurele bedrag en de eenmalige post met zijn maand', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    const t = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = reisRestsaldo(reisModel()).inleg;
      const el = d.querySelector('[data-resproj]'); return { stap: el ? el.closest('div').parentElement.textContent.replace(/\s+/g, ' ') : '', sub: el ? el.textContent : '' }; });
    expect(t.stap).toContain('€100/mnd');
    expect(t.sub).toMatch(/Eenmalig: €299 Boete in \w+ \d{4}, alleen in die maand\./);
  });

  test('alleen een eenmalige post laat de stap toch staan', async ({ page }) => {
    await boot(page, [BOETE]);
    const sub = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = reisRestsaldo(reisModel()).inleg;
      const el = d.querySelector('[data-resproj]'); return el ? el.textContent : null; });
    expect(sub).toContain('Eenmalig: €299 Boete');
  });

  /* v347: blok 18 zet de lijn naast de band. Per post en per doel wanneer het geld de deur uit gaat,
     de vlakke laag over de jaren, en per jaar de lijn tegen de mediaan van de band en tegen de band
     bij een beweeglijkheid van nul. */
  test('blok 18 zet de lijn naast de band en schrijft niets', async ({ page }) => {
    await boot(page, [BOETE, PREMIE]);
    const r = await page.evaluate(() => {
      const oud = localStorage.setItem; let schrijf = 0; localStorage.setItem = function () { schrijf++; return oud.apply(this, arguments); };
      const b = DIAG_BLOKKEN.find((x) => x.lees === diagReisReserveringen); const L = b ? b.lees() : [];
      localStorage.setItem = oud; const M = reisModel();
      return { L, schrijf, mid1: Math.round(M.mid[1]), jaar1: M.nowY + 1 };
    });
    expect(r.schrijf).toBe(0);
    const t = r.L.join('\n');
    expect(t).toContain('Premie: 1200 per 12 mnd -> 100.00 per maand opzij, betaald vanaf ');
    expect(t).toContain('Boete: 299 eenmalig in ' + NOV + ' (maand 1 vanaf nu), opzij en uitgegeven in die maand');
    expect(t).toContain(`${r.jaar1}: lijn ${r.mid1} · band `);
    expect(t).toMatch(/FIRE \d+: lijn (\d{4}|niet gehaald) · mediaan band (\d{4}|niet gehaald) · band bij nul (\d{4}|niet gehaald)/);
  });
});
