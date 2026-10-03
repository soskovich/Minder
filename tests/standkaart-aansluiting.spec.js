/* v326: BLOK 15 LEGT DE STAND-KAART OP INZICHTEN PER CATEGORIE NAAST HET MAANDBUDGET.
   GEMELD op 3 oktober 2026: budget 3.375, nog in je potjes 1.654, uitgegeven 175, nog te betalen vast
   957, dus 589 nergens. Dit blok meet waar dat zit; het verandert niets (v244).
   DE FIXTURE DRAAGT DE TWEE VERMOEDE OORZAKEN als eigen geval: een terugkerend potje waarvan de
   incasso is UITGESLOTEN (Zilveren Kruis, 140), en een vaste last die het schema niet kent maar de
   terugval van vorige maand wel (een incasso die maar EEN keer eerder kwam), in een VARIABEL potje.
   Die tweede telt dan in "nog in je potjes" EN in "nog te betalen", de andere kant op. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const MAIN='NL01MAIN0000001111';
const JUL='2026-07', AUG='2026-08', SEP='2026-09', OKT='2026-10';
function seed(){
  const tx=[]; let i=0;
  const add=(d,a,n,ds)=>tx.push({id:'x'+(i++),date:d,amount:a,acc:MAIN,name:n,desc:ds,typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  for(const m of [JUL,AUG,SEP]){
    add(m+'-01',3000,'Werkgever','SALARIS LOON');
    add(m+'-20',-140,'Zilveren Kruis','SEPA INCASSO ZILVEREN KRUIS ZORGVERZEKERING');
    add(m+'-15',-40,'Vodafone','SEPA INCASSO VODAFONE ABONNEMENT');
    add(m+'-05',-300,'Albert Heijn','BEA, BETAALPAS ALBERT HEIJN');
  }
  add(SEP+'-25',-60,'Basic Fit','SEPA INCASSO BASIC FIT');          // maar een keer: alleen de terugval kent hem
  add(OKT+'-01',3000,'Werkgever','SALARIS LOON');
  add(OKT+'-02',-50,'Albert Heijn','BEA, BETAALPAS ALBERT HEIJN');
  const set={mode:'begeleid',autoIncome:false,income:3000,limit:70,manualBal:{[MAIN]:2000},budgetMonth:OKT};
  return {minder_tx:JSON.stringify(tx), minder_ovr:'{}', minder_set:JSON.stringify(set),
    minder_own:JSON.stringify([MAIN]), minder_accmeta:'{}', minder_plan:'{}'};
}
async function boot(page){
  await pinDatum(page,'2026-10-03');
  await page.addInitScript(s=>{for(const k in s)localStorage.setItem(k,s[k]);}, seed());
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof window.diagStandKaart==='function');
  /* de potjes en de uitsluiting op de ECHTE categorie- en incassosleutels uit de pagina (v299) */
  return await page.evaluate(()=>{
    const cat=n=>catOf(TX.find(t=>t.name===n));
    const k={zorg:cat('Zilveren Kruis'), tel:cat('Vodafone'), ah:cat('Albert Heijn'), gym:cat('Basic Fit')};
    SET.budgets={[k.zorg]:140,[k.tel]:40,[k.ah]:400,[k.gym]:60}; SET.budgetMonth=thisYM();
    const zk=recurKey(TX.find(t=>t.name==='Zilveren Kruis'));
    SET.fixDueExcl={[zk]:{sinds:'2026-09-01'}}; save();
    return k;
  });
}
const blok=page=>page.evaluate(()=>diagStandKaart().join('\n'));
const rij=(txt,naam)=>{ const l=txt.split('\n').find(x=>x.trim().startsWith(naam)); if(!l) return null;
  const n=l.slice(28).trim().split(/\s+/).slice(0,5).map(Number); return {bud:n[0],uit:n[1],inPot:n[2],vast:n[3],rest:n[4],tekst:l}; };

test('a1 de invoer: drie incasso-categorieen verschillen, en twee vermoede oorzaken zijn er', async ({page})=>{
  const k=await boot(page);
  const r=await page.evaluate(k=>{ const rc=recurringCats(); const ML=monthLiquidity();
    return {rc:[...rc], items:ML.fixDueItems.map(s=>({name:s.name, cat:s.cat||null, excl:!!s.excl}))}; }, k);
  expect(new Set([k.zorg,k.tel,k.ah,k.gym]).size).toBe(4);
  expect(r.rc).toContain(k.zorg);
  expect(r.rc).not.toContain(k.gym);                       // Basic Fit kwam maar een keer
  expect(r.items.find(x=>x.name==='Zilveren Kruis').excl).toBe(true);
  expect(r.items.find(x=>x.name==='Basic Fit').cat).toBe(null);   // uit de terugval, zonder categorie
});

test('a2 de rest per categorie telt op tot het gat van de kaart, en elke kolom sluit aan', async ({page})=>{
  await boot(page);
  const t=await blok(page);
  for(const k of ['budget','uitgegeven','in potjes','vast','rest'])
    expect(t, k).toMatch(new RegExp(`^\\s+${k}\\s+-?\\d+ tegen -?\\d+\\s+JA`,'m'));
});

test('a3 een uitgesloten incasso in een terugkerend potje staat nergens', async ({page})=>{
  await boot(page);
  const t=await blok(page);
  const z=rij(t,'Verzekeringen')||rij(t,'Zorg');
  expect(z, t).not.toBe(null);
  expect([z.bud,z.uit,z.inPot,z.vast,z.rest]).toEqual([140,0,0,0,140]);
  expect(z.tekst).toContain("140 aan uitgesloten incasso's");
});

test('a4 een vaste last uit de terugval in een variabel potje telt twee keer', async ({page})=>{
  const k=await boot(page);
  const t=await blok(page);
  const naam=await page.evaluate(c=>CATS[c].name, k.gym);
  const g=rij(t,naam);
  expect([g.bud,g.uit,g.inPot,g.vast,g.rest]).toEqual([60,0,60,60,-60]);
  expect(g.tekst).toContain('telt twee keer');
  expect(t).toMatch(/Basic Fit/);
  expect(t).toMatch(/bron vorige maand/);
});

test('a5 de vier getallen zijn die van het scherm', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{ const T=totals(thisYM()), ML=monthLiquidity(), VP=varPotjeStand(thisYM());
    return {txt:diagStandKaart().join('\n'), b:Math.round(T.budget), u:Math.round(T.spendNorm), v:Math.round(ML.fixDue), p:varBudget()-VP.gebruikt}; });
  expect(r.txt).toMatch(new RegExp(`maandbudget\\s+totals\\(\\)\\.budget\\s+${r.b}\\b`));
  expect(r.txt).toMatch(new RegExp(`staat nergens\\s+budget - de andere drie\\s+${r.b-r.p-r.u-r.v}\\b`));
});

test('a6 het blok schrijft niets', async ({page})=>{
  await boot(page);
  const n=await page.evaluate(()=>{ let n=0; const o=localStorage.setItem.bind(localStorage);
    localStorage.setItem=(...a)=>{ n++; return o(...a); }; diagStandKaart(); localStorage.setItem=o; return n; });
  expect(n).toBe(0);
});
