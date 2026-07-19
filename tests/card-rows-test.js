#!/usr/bin/env node
/* card-rows-test.js — budgetkaart-rijen: eigen detail vs. niet klikbaar.
 *
 * (1) Extraheert de ECHTE kv-helper uit monthStatusCard en toetst: mét act → cursor:pointer +
 *     onclick + chevron; zonder act → platte rij. (2) Structurele checks dat de rijen goed bedraad
 *     zijn (Uitgegeven→openMonthSpend, Maandbudget→go('set'), Tempo/Dag plat) en de kaart-brede
 *     klik van de buitenste div naar ring+header is verplaatst.
 *
 * Gebruik:  node tests/card-rows-test.js
 */
'use strict';
const fs=require('fs'), path=require('path'), vm=require('vm');
const GREEN='\x1b[32m', RED='\x1b[31m', DIM='\x1b[2m', RESET='\x1b[0m';
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

let pass=0, fail=0;
const ok=(n,c)=>{ if(c){pass++;console.log(`  ${GREEN}✓${RESET} ${n}`);} else {fail++;console.log(`  ${RED}✗${RESET} ${n}`);} };

// ---- (1) echte kv-helper ----
const kvLine=html.split('\n').find(l=>l.includes('const kv=(l,v,vc,act)=>'));
const box={}; vm.createContext(box);
vm.runInContext(kvLine.trim()+'\nthis.kv=kv;', box);
const {kv}=box;

console.log(`\n${DIM}kv-helper: klikbaar (act) vs. plat${RESET}\n`);
const clic=kv('Uitgegeven','€100','',"openMonthSpend('2026-07')");
ok("act → cursor:pointer aanwezig", /cursor:pointer/.test(clic));
ok("act → onclick met de juiste handler", clic.includes(`onclick="openMonthSpend('2026-07')"`));
ok("act → chevron › aanwezig", clic.includes('›'));
const plat=kv('Tempo','op schema','#f00');
ok("geen act → GEEN cursor:pointer", !/cursor:pointer/.test(plat));
ok("geen act → GEEN onclick", !/onclick/.test(plat));
ok("geen act → GEEN chevron ›", !plat.includes('›'));
const budg=kv('Maandbudget','€1200','',"go('set')");
ok("Maandbudget-act → onclick go('set')", budg.includes(`onclick="go('set')"`));

// ---- (2) bedrading in monthStatusCard ----
console.log(`\n${DIM}monthStatusCard: rijen correct bedraad${RESET}\n`);
ok("Uitgegeven → openMonthSpend", html.includes("kv('Uitgegeven', euro0(sp), '', `openMonthSpend('${m}')`)"));
ok("Maandbudget → go('set')", html.includes(`kv('Maandbudget', euro0(bud), '', "go('set')")`));
ok("Tempo blijft plat (3 args)", html.includes("kv('Tempo', tempo, col)") && !html.includes("kv('Tempo', tempo, col,"));
ok("Dag blijft plat (2 args)", html.includes("kv('Dag', dom+' van '+dim)") && !html.includes("kv('Dag', dom+' van '+dim,"));
ok("kaart-brede klik weg van buitenste div", !html.includes(`return \`<div class="card" style="cursor:pointer" onclick="openBudgetCompare`));
ok("openBudgetCompare op ring + header", (html.match(/onclick="openBudgetCompare\('\$\{m\}'\)"/g)||[]).length>=2);
ok("openMonthSpend-sheet gedefinieerd", /function openMonthSpend\(m\)\{/.test(html));

console.log(`\n  ${pass} ok, ${fail} mismatch\n`);
process.exit(fail?1:0);
