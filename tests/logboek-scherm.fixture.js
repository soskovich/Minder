/* v331: de fixture is SEPTEMBER VAN HET TOESTEL zoals gemeld bij v331: drie potjes boven, alle drie
   als uitzondering beantwoord (Uit eten +194 met een grens, Vices +103 met een grens, Boodschappen
   +84 zonder handeling), en vier binnen of vervallen: twee binnen en twee vervallen, dus 3 van de 5. Samen EUR 381. De klok staat op 4 oktober
   2026, zodat september de enige afgesloten maand is (v299/v310). De records dragen hun afsluiting
   al, dus `valtOpAfsluiten()` raakt ze niet. */
const { pinDatum } = require('./vaste-dag');
const MAIN='NL01MAIN0000001111';
const NU='2026-10-04', OKT='2026-10', SEP='2026-09', AUG='2026-08', JUL='2026-07', JUN='2026-06';
const U=(op)=>({keuze:'uitzondering', op});
const R=(m,k,naam,o)=>Object.assign({id:m+'|'+k, maand:m, potjeId:k, categorie:naam,
  potje_bij_detectie:100, over_bij_detectie:40, getoond:true}, o);
const SEPTEMBER=(antwoord=true)=>[
  R(SEP,'uiteten','Uit eten & café',{actie:'grens_gezet', over_eind_maand:194, over_oorspronkelijk:194, grens_na:{n:3,bedrag:120}, antwoord:antwoord?U('2026-10-02'):undefined}),
  R(SEP,'vices','Vices',{actie:'grens_gezet', over_eind_maand:103, over_oorspronkelijk:103, grens_na:{n:2,bedrag:40}, antwoord:antwoord?U('2026-10-02'):undefined}),
  R(SEP,'boodschappen','Boodschappen',{actie:'geen', over_eind_maand:84, over_oorspronkelijk:84, antwoord:antwoord?U('2026-10-02'):undefined}),
  R(SEP,'sport','Sport & gezondheid',{actie:'potje_bijgesteld', potje_bij_detectie:50, potje_voor:50, potje_na:96, over_eind_maand:0, over_oorspronkelijk:0}),
  R(SEP,'vervoer','Vervoer & auto',{actie:'grens_gezet', over_eind_maand:0, over_oorspronkelijk:0, grens_na:{n:0,bedrag:0}}),
  R(SEP,'belasting','Belasting & boetes',{actie:'correctie', correctie_bedrag:40, over_eind_maand:0, over_oorspronkelijk:0}),
  R(SEP,'overig','Overig',{actie:'correctie', correctie_bedrag:300, over_eind_maand:0, over_oorspronkelijk:0}),
];
const map=recs=>Object.fromEntries(recs.map(r=>[r.id,r]));
function seed(log, extra={}){
  const tx=[]; let i=0;
  const add=(d,a,n,ds)=>tx.push({id:'x'+(i++),date:d,amount:a,acc:MAIN,name:n,desc:ds,typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  for(const m of [JUN,JUL,AUG,SEP,OKT]){ add(m+'-01',3000,'Werkgever','SALARIS LOON'); add(m+'-02',-200,'Albert Heijn','BEA, BETAALPAS ALBERT HEIJN'); }
  const set=Object.assign({mode:'begeleid',autoIncome:false,income:3000,limit:70,manualBal:{[MAIN]:2000},
    budgets:{boodschappen:400,uiteten:150,vices:60,sport:96,vervoer:150,belasting:50,overig:100},
    budgetMonth:OKT, valtOpLog:map(log)}, extra);
  return {minder_tx:JSON.stringify(tx), minder_ovr:'{}', minder_set:JSON.stringify(set),
    minder_own:JSON.stringify([MAIN]), minder_accmeta:'{}', minder_plan:'{}'};
}
async function boot(page, log, extra, datum=NU){
  await pinDatum(page, datum);
  await page.addInitScript(s=>{for(const k in s)localStorage.setItem(k,s[k]);}, seed(log, extra));
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof window.renderMaand==='function');
  await page.evaluate(()=>go('maand'));
}
module.exports={ boot, R, U, SEPTEMBER, map, NU, OKT, SEP, AUG, JUL, JUN };
