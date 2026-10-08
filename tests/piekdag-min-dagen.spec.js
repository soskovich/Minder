/* v326: DE PIEKDAG VUURT PAS VANAF PIEK_MIN_DAGEN (14) VERSTREKEN DAGEN.
   GEMELD op 3 oktober 2026: "donderdag EUR 42 (normaal EUR 9), 55% van je losse geld". Op dag 3 zijn
   er drie weekdagen geweest, en die delen samen 100%, terwijl de referentie elke weekdag ongeveer een
   zevende geeft. DE FIXTURE IS DIE STAND: donderdag 1 oktober EUR 42, vrijdag EUR 18 en zaterdag
   EUR 16, samen EUR 76 in acht boekingen (PIEK_MIN_TX), dus donderdag 55%. De drie maanden ervoor
   dragen elke dag EUR 10, zodat de referentie per weekdag zijn aantal dagen volgt.
   DEZELFDE BOEKINGEN OP EEN LATERE DAG: de verdeling verandert niet, alleen de dagteller, en dat is
   het geval dat "de poort is de dagteller" scheidt van "de verdeling is anders". */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const MAIN='NL01MAIN0000001111';
function seed(){
  const tx=[]; let i=0;
  const add=(d,a,n)=>tx.push({id:'x'+(i++),date:d,amount:a,acc:MAIN,name:n,desc:'BEA, BETAALPAS '+n.toUpperCase(),typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  for(const [m,dim] of [['2026-07',31],['2026-08',31],['2026-09',30]]){
    tx.push({id:'i'+(i++),date:m+'-01',amount:3000,acc:MAIN,name:'Werkgever',desc:'SALARIS LOON',typ:'',ref:'',src:'csv',accName:'',refNums:[]});
    for(let d=1; d<=dim; d++) add(m+'-'+String(d).padStart(2,'0'), -10, 'Albert Heijn');
  }
  tx.push({id:'i'+(i++),date:'2026-10-01',amount:3000,acc:MAIN,name:'Werkgever',desc:'SALARIS LOON',typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  [['01',-20,'Albert Heijn'],['01',-12,'Jumbo'],['01',-10,'Kiosk'],
   ['02',-8,'Albert Heijn'],['02',-6,'Jumbo'],['02',-4,'Kiosk'],
   ['03',-9,'Albert Heijn'],['03',-7,'Jumbo']].forEach(([d,a,n])=>add('2026-10-'+d,a,n));
  const set={mode:'begeleid',autoIncome:false,income:3000,limit:70,manualBal:{[MAIN]:2000},budgetMonth:'2026-10'};
  return {minder_tx:JSON.stringify(tx), minder_ovr:'{}', minder_set:JSON.stringify(set),
    minder_own:JSON.stringify([MAIN]), minder_accmeta:'{}', minder_plan:'{}'};
}
async function meet(page, dag){
  await pinDatum(page, dag);
  await page.addInitScript(s=>{for(const k in s)localStorage.setItem(k,s[k]);}, seed());
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof window.piekVuurt==='function');
  return page.evaluate(()=>{ const m=thisYM(); const V=piekVerdeling(m), ref=piekReferentie(m);
    go('ins');
    return {m, n:V.n, dagen:V.dagen, donderdag:Math.round(V.aandeel[3]*100), tot:Math.round(V.tot),
      ref:Math.round(ref[3]*100), P:piekVuurt(V,ref), // v359: de piekdag staat niet meer op Inzichten (open punt); 'scherm' is nu of insSignals() hem levert
      scherm:insSignals(m,new Set()).some(s=>s.kpiLabel==='Piekdag')}; });
}

test('a de invoer: acht boekingen, donderdag 55% van EUR 76, een referentie rond een zevende', async ({page})=>{
  const r=await meet(page,'2026-10-03');
  expect(r.m).toBe('2026-10');
  expect(r.n).toBe(8);
  expect(r.tot).toBe(76);
  expect(r.donderdag).toBe(55);
  expect(r.ref).toBeGreaterThan(10);
  expect(r.ref).toBeLessThan(18);
  expect(r.donderdag).toBeGreaterThan(r.ref*1.5);   // de drempel wordt gehaald, dus alleen de dagen houden hem tegen
});

test('b op dag 3 geen piekdag', async ({page})=>{
  const r=await meet(page,'2026-10-03');
  expect(r.dagen).toBe(3);
  expect(r.P).toBe(null);
  expect(r.scherm).toBe(false);
});

test('c dezelfde verdeling op dag 15 wel', async ({page})=>{
  const r=await meet(page,'2026-10-15');
  expect(r.dagen).toBe(15);
  expect(r.donderdag).toBe(55);
  expect(r.P && r.P.peak).toBe(3);
  expect(r.scherm).toBe(true);
});

test('d de grens ligt op dag 14', async ({page})=>{
  const r13=await meet(page,'2026-10-13');
  expect(r13.P).toBe(null);
});
test('d2 op dag 14 vuurt hij', async ({page})=>{
  const r14=await meet(page,'2026-10-14');
  expect(r14.P && r14.P.peak).toBe(3);
});

test('e een afgeronde maand telt al zijn dagen', async ({page})=>{
  await meet(page,'2026-10-03');
  const d=await page.evaluate(()=>piekVerdeling('2026-09').dagen);
  expect(d).toBe(30);
});
