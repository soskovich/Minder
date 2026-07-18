#!/usr/bin/env node
/* budget-potjes-test.js — toetst "potjes leidend, inkomen-limiet als spiegel".
 *
 * Extraheert de ECHTE monthBudget(), totalBudget() en totals() uit index.html (brace-matched)
 * en draait ze in EEN gedeelde vm-sandbox met gestubde app-dependencies (txOfMonth/catOf/CATS/
 * baseIncome), net als in de app waar alles globals in één scope zijn.
 *
 * Gebruik:  node tests/budget-potjes-test.js   ·  exit 0 = ok, 1 = mismatch.
 */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const GREEN='\x1b[32m', RED='\x1b[31m', DIM='\x1b[2m', RESET='\x1b[0m';
const html = fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function extract(sig){
  const start = html.indexOf(sig); if(start<0) throw new Error('niet gevonden: '+sig);
  let depth=0, began=false;
  for(let j=html.indexOf('{',start); j<html.length; j++){
    const c=html[j]; if(c==='{'){depth++;began=true;} else if(c==='}'){depth--; if(began&&depth===0) return html.slice(start,j+1);}
  }
  throw new Error('geen sluit-accolade: '+sig);
}

// één gedeelde sandbox, zoals de app: alle functies lezen dezelfde globals
const box = {
  Math,
  SET:{}, TX:[],
  CATS:{inkomen:{type:'income'}, boodschappen:{type:'expense'}, uiteten:{type:'expense'}, huur:{type:'expense'}, intern:{type:'internal'}},
  baseIncome:()=>0, baselineSpend:()=>0,
  catOf:t=>t.autoCat,
};
box.txOfMonth = m => box.TX.filter(t=>t.date.slice(0,7)===m);
vm.createContext(box);
vm.runInContext(
  extract('function monthBudget(')+'\n'+extract('function totalBudget(')+'\n'+extract('function totals(')+
  '\nthis.monthBudget=monthBudget; this.totalBudget=totalBudget; this.totals=totals;',
  box, {filename:'budget-block.js'});

let pass=0, fail=0;
function check(naam, got, exp){
  const ok = JSON.stringify(got)===JSON.stringify(exp);
  if(ok){pass++; console.log(`  ${GREEN}✓${RESET} ${naam}  ${DIM}${JSON.stringify(got)}${RESET}`);}
  else {fail++; console.log(`  ${RED}✗${RESET} ${naam}  ${RED}kreeg ${JSON.stringify(got)}, verwacht ${JSON.stringify(exp)}${RESET}`);}
}

console.log(`\n${DIM}Bouwstenen: monthBudget (inkomen-limiet) + totalBudget (potjes-som)${RESET}\n`);
box.SET = {limit:70, limitMode:'pct'};
check('monthBudget(1000) @70% = 700', box.monthBudget(1000), 700);
box.SET = {limit:70, limitMode:'pct', budgets:{uiteten:300, boodschappen:400, huur:500}};
check('totalBudget som potjes = 1200', box.totalBudget(), 1200);
box.SET = {limit:70, limitMode:'cap', spendCap:900};
check('monthBudget cap-modus = 900', box.monthBudget(1000), 900);

console.log(`\n${DIM}Integratie: echte totals() (potjes leidend + terugval + spiegel)${RESET}\n`);
box.TX = [
  {date:'2026-07-01', amount:1000, autoCat:'inkomen'},
  {date:'2026-07-05', amount:-120,  autoCat:'boodschappen'},
  {date:'2026-07-08', amount:-80,   autoCat:'uiteten'},
  {date:'2026-07-02', amount:-500,  autoCat:'huur'},
];

// potjes-som 1200 > inkomen-limiet 700 → budget = potjes, spiegel vuurt
box.SET = {limit:70, limitMode:'pct', autoIncome:false, income:1000, budgets:{huur:500, boodschappen:400, uiteten:300}};
const r1 = box.totals('2026-07');
check('budget = potjes-som 1200 (leidend)', r1.budget, 1200);
check('limit = inkomen-limiet 700 (referentie)', r1.limit, 700);
check('potTotal = 1200', r1.potTotal, 1200);
check('spend netto = 700', r1.spend, 700);
check('spiegel vuurt (budget>limit)', r1.budget>r1.limit && r1.limit>0, true);

// potjes-som 450 < limiet 700 → budget = potjes, geen spiegel
box.SET = {limit:70, limitMode:'pct', autoIncome:false, income:1000, budgets:{boodschappen:250, uiteten:200}};
const r2 = box.totals('2026-07');
check('budget = potjes-som 450 (leidend, onder limiet)', r2.budget, 450);
check('geen spiegel (budget<limit)', r2.budget>r2.limit, false);

// geen potjes → terugval op de inkomen-limiet (app valt niet zonder budget)
box.SET = {limit:70, limitMode:'pct', autoIncome:false, income:1000, budgets:{}};
const r3 = box.totals('2026-07');
check('geen potjes: budget = limiet 700 (terugval)', r3.budget, 700);
check('geen potjes: potTotal 0', r3.potTotal, 0);

console.log(`\n  ${pass} ok, ${fail} mismatch\n`);
process.exit(fail?1:0);
