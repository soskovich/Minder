#!/usr/bin/env node
/* liquiditeit-test.js — Optie B: potjes-plan naast forecast, vaste-cap, en de spiegel.
 *
 * Extraheert de ECHTE varPlanRemaining() en varTempoMirror() uit index.html (brace-matched)
 * en draait ze in een vm-sandbox. De vaste-cap zit inline in safeToSpend (te veel deps om te
 * extraheren) en wordt hier als exacte transcriptie van de regel getoetst.
 *
 * Gebruik:  node tests/liquiditeit-test.js   ·  exit 0 = ok, 1 = mismatch.
 */
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const GREEN='\x1b[32m', RED='\x1b[31m', DIM='\x1b[2m', RESET='\x1b[0m';
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
function extract(sig){
  const start=html.indexOf(sig); if(start<0) throw new Error('niet gevonden: '+sig);
  let depth=0, began=false;
  for(let j=html.indexOf('{',start); j<html.length; j++){
    const c=html[j]; if(c==='{'){depth++;began=true;} else if(c==='}'){depth--; if(began&&depth===0) return html.slice(start,j+1);}
  }
  throw new Error('geen sluit-accolade: '+sig);
}
const box={ Math,
  SET:{}, _sp:{}, FIXED_CATS:new Set(['huur','vervoer','zorg']),
  catSpendMap:function(){ return box._sp; },
  euro0:n=>'€'+Math.round(+n||0),
};
vm.createContext(box);
vm.runInContext(extract('function varPlanRemaining(')+'\n'+extract('function varTempoMirror(')+
  '\nthis.varPlanRemaining=varPlanRemaining; this.varTempoMirror=varTempoMirror;', box, {filename:'liq-block.js'});
const {varPlanRemaining, varTempoMirror}=box;

// exacte transcriptie van de cap-regel uit safeToSpend (Kant B)
function fixedCap(fixDue, fixedBudgetUnspent, typicalFixed, fixedPaid){
  const fixedStillExpected=Math.max(typicalFixed-fixedPaid,0);
  return Math.max(Math.round(fixDue), Math.min(Math.round(fixedBudgetUnspent), fixedStillExpected));
}

let pass=0, fail=0;
function ok(naam, cond, got){ if(cond){pass++; console.log(`  ${GREEN}✓${RESET} ${naam}  ${DIM}${got!==undefined?JSON.stringify(got):''}${RESET}`);} else {fail++; console.log(`  ${RED}✗${RESET} ${naam}  ${RED}${JSON.stringify(got)}${RESET}`);} }

console.log(`\n${DIM}varPlanRemaining — onbestede variabele potjes (je plan)${RESET}\n`);
box.SET={budgets:{uiteten:300, boodschappen:400, huur:500}};
box._sp={uiteten:180, boodschappen:400};
let r=varPlanRemaining('2026-07');
ok('uiteten rest 120, boodschappen 0, huur (vast) genegeerd = 120', r===120, r);

box.SET={budgets:{uiteten:300, boodschappen:400}}; box._sp={};
r=varPlanRemaining('2026-07');
ok('geen uitgaven → volle potjes = 700', r===700, r);

box.SET={budgets:{huur:900, zorg:150}}; box._sp={};
r=varPlanRemaining('2026-07');
ok('alleen vaste categorieën → variabel plan = 0', r===0, r);

console.log(`\n${DIM}varTempoMirror — spiegel (Optie B), materialiteitsdrempel${RESET}\n`);
let m=varTempoMirror(116,700,'safe');
ok('plan 116 vs tempo 700 (safe): vuurt, noemt 116/700/584', m!==''&&/116/.test(m)&&/700/.test(m)&&/584/.test(m), m.slice(0,60)+'…');
m=varTempoMirror(116,700,'card');
ok('plan 116 vs tempo 700 (card): vuurt teal, noemt verschil 584', m!==''&&/584/.test(m)&&/var\(--teal\)/.test(m), '(teal)');
m=varTempoMirror(680,700,'safe');
ok('klein gat (20 < drempel): leeg', m==='', JSON.stringify(m));
m=varTempoMirror(0,700,'safe');
ok('plan 0 vs tempo 700: vuurt', m!=='', m!=='');

console.log(`\n${DIM}Vaste-cap (Kant B) — begrens het budget-vangnet op je typische vaste last${RESET}\n`);
r=fixedCap(260,1160,260,0);
ok('jouw geval: 1160 → 260 (900 extra weg)', r===260, r);
r=fixedCap(260,1160,500,100);
ok('typisch 500, al 100 betaald → 400', r===400, r);
r=fixedCap(260,1160,0,0);
ok('geen historie → vloer = herkende incasso 260', r===260, r);
r=fixedCap(300,100,500,0);
ok('klein budget, hoge incasso → vloer wint = 300', r===300, r);

console.log(`\n  ${pass} ok, ${fail} mismatch\n`);
process.exit(fail?1:0);
