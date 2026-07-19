#!/usr/bin/env node
/* fixed-recurring-harness.js — voor/na van "isFixed = herkende herhaling".
 *
 * Extraheert de ECHTE isIncasso() + isPeriodicTransfer() uit index.html en gebruikt ze om per
 * betaal-stream te classificeren. De vast/variabel-, safeToSpend-, spiegel- en nog-te-betalen-
 * getallen worden op een TRANSPARANTE fixture berekend volgens de modelformules (OLD = FIXED_CATS,
 * NEW = herkende recurring). Representatief, geen live data — echte getallen vergen de browser.
 *
 * Gebruik:  node tests/fixed-recurring-harness.js
 */
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const DIM='\x1b[2m', B='\x1b[1m', RESET='\x1b[0m', C='\x1b[36m';
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(sig){ const s=html.indexOf(sig); if(s<0)throw new Error('niet gevonden: '+sig);
  let d=0,b=false; for(let j=html.indexOf('{',s);j<html.length;j++){const c=html[j]; if(c==='{'){d++;b=true;} else if(c==='}'){d--; if(b&&d===0)return html.slice(s,j+1);}} }
const box={}; vm.createContext(box);
vm.runInContext(extract('function isIncasso(')+'\n'+extract('function isPeriodicTransfer(')+'\nthis.isIncasso=isIncasso; this.isPeriodicTransfer=isPeriodicTransfer;', box);
const {isIncasso, isPeriodicTransfer}=box;
const FIXED_CATS=new Set(['huur','verzekering','studie','sport','abonnement','bankkosten','persoonlijk']);

// ---- fixture: betaal-streams (payee), maandbedrag, categorie, betaalvorm-omschrijving ----
// recurs = komt >=2 maanden voor (in de historie). chargedYM = maanden waarin al afgeschreven.
const CUR='2026-07', DIM_M=31, DOM=15, daysLeft=DIM_M-DOM;
const streams=[
  {name:'Woningcorporatie', cat:'huur',        mo:900, desc:'SEPA INCASSO HUURBETALING',    recurs:true,  spentCur:0},
  {name:'Zilveren Kruis',   cat:'verzekering', mo:140, desc:'SEPA INCASSO ZORGPREMIE',      recurs:true,  spentCur:0},
  {name:'Goede Doel',       cat:'goededoel',   mo:20,  desc:'PERIODIEKE OVERBOEKING GIFT',  recurs:true,  spentCur:20},
  {name:'Basic-Fit',        cat:'sport',       mo:25,  desc:'ECOM BASIC FIT BETAALPAS',     recurs:true,  spentCur:25},
  {name:'Netflix',          cat:'abonnement',  mo:12,  desc:'ECOM NETFLIX.COM',             recurs:true,  spentCur:12},
  {name:'Diverse',          cat:'persoonlijk', mo:200, desc:'BEA, BETAALPAS DIVERSE',       recurs:false, spentCur:120},
  {name:'Albert Heijn',     cat:'boodschappen',mo:350, desc:'BEA, BETAALPAS ALBERT HEIJN',  recurs:false, spentCur:180},
  {name:'Restaurants',      cat:'uiteten',     mo:150, desc:'BEA, BETAALPAS RESTAURANT',    recurs:false, spentCur:70},
];
const potjes={huur:900,verzekering:140,goededoel:20,sport:25,abonnement:15,persoonlijk:220,boodschappen:380,uiteten:160};
const saldo=3000, savedBal=800, incDue=0, saveTarget=200, savedThisMonth=0;

// ---- classificatie ----
// NEW: herkende recurring = >=2 maanden EN candidate (incasso OF periodieke overboeking). Card recurring telt niet als "herkende vaste betaling".
for(const s of streams){ s.inc=isIncasso(s); s.per=isPeriodicTransfer(s);
  s.newFixed = s.recurs && (s.inc || s.per);
  s.oldFixed = FIXED_CATS.has(s.cat) || /PERIODIEKE OVERB|HUUR|HYPOTHEEK|BASISPAKKET|DUO |INCASSO ALGEMEEN DOORLOPEND/.test(s.desc.toUpperCase());
}
const recurringCatsNew=new Set(streams.filter(s=>s.newFixed).map(s=>s.cat));

const eur=n=>'€'+Math.round(n);
console.log(`\n${B}Classificatie per stream (OLD = FIXED_CATS/heuristiek · NEW = herkende recurring)${RESET}\n`);
console.log('  '+'stream'.padEnd(16)+'cat'.padEnd(14)+'/mnd'.padEnd(7)+'incasso  periodic  OLD    NEW');
for(const s of streams) console.log('  '+s.name.padEnd(16)+s.cat.padEnd(14)+String(s.mo).padEnd(7)+
  String(s.inc).padEnd(9)+String(s.per).padEnd(10)+(s.oldFixed?'vast ':'var  ').padEnd(7)+(s.newFixed?'vast':'var'));

// ---- 1. vast/variabel-split (volle maand, alles afgeschreven) ----
const splitOld={f:0,v:0}, splitNew={f:0,v:0};
for(const s of streams){ (s.oldFixed?splitOld.f+=s.mo:splitOld.v+=s.mo); (s.newFixed?splitNew.f+=s.mo:splitNew.v+=s.mo); }

// ---- 2. fixDue (herkende recurring, nog niet afgeschreven deze maand) ----
const fixDueOld=streams.filter(s=>s.oldFixed && s.inc && s.spentCur===0).reduce((a,s)=>a+s.mo,0); // OLD fixDue vereist incasso
const fixDueNew=streams.filter(s=>s.newFixed && (s.inc||s.per) && s.spentCur===0).reduce((a,s)=>a+s.mo,0);

// ---- potje-restant ----
const rest=k=>Math.max((potjes[k]||0)-(streams.filter(s=>s.cat===k).reduce((a,s)=>a+s.spentCur,0)),0);
const cats=Object.keys(potjes);
const reservedOld=cats.filter(k=>!FIXED_CATS.has(k)).reduce((a,k)=>a+rest(k),0);       // OLD variabel = niet-FIXED_CATS potjes
const fixedBudgetUnspentOld=cats.filter(k=>FIXED_CATS.has(k)).reduce((a,k)=>a+rest(k),0);
const reservedNew=cats.filter(k=>!recurringCatsNew.has(k)).reduce((a,k)=>a+rest(k),0);   // NEW variabel = niet-recurring potjes

// OLD vaste reservering met v54-cap
const typicalFixedOld=splitOld.f;                                   // ~ volle-maand OLD vaste split
const fixedPaidOld=streams.filter(s=>s.oldFixed).reduce((a,s)=>a+s.spentCur,0);
const fixedStillExpectedOld=Math.max(typicalFixedOld-fixedPaidOld,0);
const fixedReserveOld=Math.max(fixDueOld, Math.min(fixedBudgetUnspentOld, fixedStillExpectedOld));
const fixedReserveNew=fixDueNew;

const saveRem=Math.max(saveTarget-savedThisMonth,0), spendSaldo=saldo-savedBal;
const safeOld=spendSaldo+incDue-fixedReserveOld-reservedOld-saveRem;
const safeNew=spendSaldo+incDue-fixedReserveNew-reservedNew-saveRem;

// ---- spiegel: varPlan vs varDue (tempo = hist variabel/dag × daysLeft, blend met tempo deze maand) ----
const varPlanOld=reservedOld, varPlanNew=reservedNew;
function tempo(monthVar, spentVarCur){ const hist=monthVar/DIM_M, act=spentVarCur/DOM, w=DOM/DIM_M; return Math.round((w*act+(1-w)*hist)*daysLeft); }
const spentVarCurOld=streams.filter(s=>!s.oldFixed).reduce((a,s)=>a+s.spentCur,0);
const spentVarCurNew=streams.filter(s=>!s.newFixed).reduce((a,s)=>a+s.spentCur,0);
const varDueOld=tempo(splitOld.v, spentVarCurOld), varDueNew=tempo(splitNew.v, spentVarCurNew);
const fires=(plan,t)=> (t-plan)>=Math.max(50,t*0.2);

const row=(lbl,o,n)=>console.log('  '+lbl.padEnd(30)+String(o).padStart(12)+'   →   '+String(n).padStart(12));
console.log(`\n${B}Voor/na — de vier metrics${RESET}\n`);
console.log('  '+' '.padEnd(30)+`${C}${'OLD'.padStart(12)}${RESET}       ${C}NEW${RESET}`);
row('Vast (volle maand)', eur(splitOld.f), eur(splitNew.f));
row('Variabel (volle maand)', eur(splitOld.v), eur(splitNew.v));
row('fixDue (nog te betalen, vast)', eur(fixDueOld), eur(fixDueNew));
row('varDue (nog te betalen, tempo)', eur(varDueOld), eur(varDueNew));
row('Nog te betalen (fix+var)', eur(fixDueOld+varDueOld), eur(fixDueNew+varDueNew));
row('Vaste reservering (safeToSpend)', eur(fixedReserveOld), eur(fixedReserveNew));
row('Variabele reservering', eur(reservedOld), eur(reservedNew));
row('VEILIG TE BESTEDEN', eur(safeOld), eur(safeNew));
console.log('');
row('Spiegel plan (varPlan)', eur(varPlanOld), eur(varPlanNew));
row('Spiegel tempo (varDue)', eur(varDueOld), eur(varDueNew));
row('Spiegel vuurt?', fires(varPlanOld,varDueOld)?'ja':'nee', fires(varPlanNew,varDueNew)?'ja':'nee');
console.log(`\n  ${DIM}OLD-spiegel vergelijkt verschillende scopes (plan zonder vaste potjes vs tempo zonder vaste uitgaven);${RESET}`);
console.log(`  ${DIM}NEW-spiegel vergelijkt plan en tempo op DEZELFDE scope (alle niet-recurring). Fixture; echte cijfers via browser.${RESET}\n`);
