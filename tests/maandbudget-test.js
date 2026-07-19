#!/usr/bin/env node
/* maandbudget-test.js — Inzichten (nu-actief) vs Instellingen (nu-actief + 'vanaf volgende maand'-noot).
 *
 * Extraheert de ECHTE totalBudget/plannedBudgets/plannedTotalBudget/potRoomLineHTML uit index.html
 * en toetst dat: (1) nu-actief = SET.budgets, gepland = + SET.budgetsNext-laag, en (2) de noot alleen
 * verschijnt als gepland ≠ nu-actief (en niet bij een enkel-argument-aanroep, backward-compatible).
 *
 * Gebruik:  node tests/maandbudget-test.js
 */
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const GREEN='\x1b[32m', RED='\x1b[31m', DIM='\x1b[2m', RESET='\x1b[0m';
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(sig){ const s=html.indexOf(sig); if(s<0)throw new Error('niet gevonden: '+sig);
  let d=0,b=false; for(let j=html.indexOf('{',s);j<html.length;j++){const c=html[j]; if(c==='{'){d++;b=true;} else if(c==='}'){d--; if(b&&d===0)return html.slice(s,j+1);}} }
const box={ Math, SET:{limit:70}, _limit:0, potRoomBase:function(){ return {budget:box._limit}; }, euro0:n=>'€'+Math.round(+n||0), ICON:()=>'!' };
vm.createContext(box);
vm.runInContext([extract('function totalBudget('),extract('function plannedBudgets('),extract('function plannedTotalBudget('),extract('function potRoomLineHTML(')].join('\n')
  +'\nthis.totalBudget=totalBudget;this.plannedBudgets=plannedBudgets;this.plannedTotalBudget=plannedTotalBudget;this.potRoomLineHTML=potRoomLineHTML;', box);
const {totalBudget, plannedTotalBudget, potRoomLineHTML}=box;

let pass=0, fail=0;
const ok=(n,c,got)=>{ if(c){pass++;console.log(`  ${GREEN}✓${RESET} ${n}  ${DIM}${got!==undefined?got:''}${RESET}`);} else {fail++;console.log(`  ${RED}✗${RESET} ${n}  ${RED}${got}${RESET}`);} };
const NEXT='vanaf volgende maand';

console.log(`\n${DIM}totalBudget (nu-actief) vs plannedTotalBudget (+ volgende-maand-laag)${RESET}\n`);
box.SET={limit:70, budgets:{uiteten:300, huur:900}};
ok('totalBudget = som SET.budgets = 1200', totalBudget()===1200, totalBudget());
box.SET.budgetsNext={huur:1000};
ok('plannedTotalBudget met next(huur:1000) = 1300', plannedTotalBudget()===1300, plannedTotalBudget());
box.SET.budgetsNext={huur:0};
ok('plannedTotalBudget met next(huur:0) verwijdert huur = 300', plannedTotalBudget()===300, plannedTotalBudget());

console.log(`\n${DIM}potRoomLineHTML — noot alleen als gepland ≠ nu-actief${RESET}\n`);
box._limit=0;  // geen inkomen-limiet: simpele tak
let s=potRoomLineHTML(1200, 1300);
ok('gepland 1300 ≠ nu 1200: noot met 1300', s.includes(NEXT)&&s.includes('1300'), s.includes(NEXT));
s=potRoomLineHTML(1200, 1200);
ok('gepland = nu: GEEN noot', !s.includes(NEXT), s.includes(NEXT));
s=potRoomLineHTML(1200);
ok('enkel argument (Coach/editor): GEEN noot (backward-compatible)', !s.includes(NEXT), s.includes(NEXT));
s=potRoomLineHTML(1200, 800);
ok('gepland lager (800): noot met 800', s.includes(NEXT)&&s.includes('800'), s.includes(NEXT));

box._limit=2000;  // met inkomen-limiet: 'onder je limiet'-tak draagt de noot ook
s=potRoomLineHTML(1200, 1300);
ok('met limiet-tak: noot blijft aanwezig', s.includes(NEXT)&&s.includes('onder je inkomen-limiet'), s.includes(NEXT));
box._limit=500;  // potjes boven limiet: amber-tak draagt de noot ook
s=potRoomLineHTML(1200, 1300);
ok('met over-limiet-tak: noot blijft aanwezig', s.includes(NEXT)&&s.includes('boven je inkomen-limiet'), s.includes(NEXT));

console.log(`\n  ${pass} ok, ${fail} mismatch\n`);
process.exit(fail?1:0);
