/* v315, reparatie uit ronde A: "VOLGENDE MAAND ANDERS" IS EEN EIGEN HANDELING IN HET LOGBOEK.
   HET GEVAL, gemeld bij v314 en daar als bekend gedrag opgeschreven: de knop op de signaalkaart
   gaat via `openPotje()` naar `savePotje()`, en die schrijft `SET.budgetsNext`. De haak
   `valtOpPotjeGewijzigd()` zette daar `potje_bijgesteld` met `potje_na` uit de VOLGENDE maand, dus
   de log las "€400 → €450" terwijl het potje van DEZE maand op €400 bleef staan. Dat is het
   verkeerde etiket dat dit project verbiedt, en het raakt drie ingangen naar dezelfde route: de
   knop op Grip, de potje-editor via Inzichten en het budgetraster in de instellingen.
   DE FIXTURE LAAT DE TWEE GETALLEN UITEENLOPEN, en dat is de meting die de asserties draagt:
   `SET.budgets.boodschappen` is 400 en `SET.budgetsNext.boodschappen` staat al op 500. Zonder dat
   verschil is "volgend_voor is het potje van DEZE maand" niet te onderscheiden van "volgend_voor is
   de stand die er voor volgende maand al klaar stond" (meetles a). */
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum, DAGEN_OVER } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN='NL01MAIN0000001111', SAV='NL01SAVE0000004323';
const NU=vasteDatum(DAGEN_OVER);
const ym=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
const MS=[3,2,1,0].map(k=>ym(new Date(NU.getFullYear(),NU.getMonth()-k,1)));
const THIS=MS[3], VORIG=MS[2];

const POTJE=400, GEPLAND=500, NIEUW=450;
const UITGAVE_VORIG=550;                 // 150 boven het potje van 400: de lat die blijft staan

function seed(o={}){
  const tx=[]; let i=0;
  const add=(m,d,a,n,ds,acc)=>tx.push({id:'x'+(i++),date:`${m}-${d}`,amount:a,acc:acc||MAIN,
    name:n,desc:ds,typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  MS.forEach(m=>{ add(m,'03',4000,'Werkgever','SALARIS LOON');
    add(m,'04',-900,'Woningcorporatie','SEPA INCASSO HUURBETALING');
    add(m,'05',-300,'Albert Heijn','BEA, BETAALPAS ALBERT HEIJN');
    add(m,'06',600,'Spaarpot','NAAR SPAREN',SAV);
    add(m,'07',-120,'Shell','BEA, BETAALPAS SHELL'); });
  add(THIS,'09',-184,'Jumbo','BEA, BETAALPAS JUMBO');                  // boodschappen 484 van 400
  add(VORIG,'20',-(UITGAVE_VORIG-300),'Jumbo','BEA, BETAALPAS JUMBO'); // vorige maand 550 van 400
  const set=Object.assign({mode:'begeleid',autoIncome:false,income:4000,limit:70,
    bufferNorm:3, nfMaanden:3, savingsEnds:['4323'], manualBal:{[MAIN]:3000,[SAV]:6000},
    budgets:{huur:900,boodschappen:POTJE,vervoer:150},
    /* DE GEPLANDE STAND WIJKT AF VAN DIE VAN DEZE MAAND. Dat is geen decor: `openPotje()` begint
       zijn concept juist bij `budgetsNext`, dus zonder dit verschil zouden beide kandidaten voor
       `volgend_voor` hetzelfde getal zijn. */
    budgetsNext:{huur:900,boodschappen:GEPLAND,vervoer:150},
    budgetMonth:THIS, spaarInleg:600,
  }, o.set||{});
  return {minder_tx:JSON.stringify(tx), minder_ovr:'{}', minder_set:JSON.stringify(set),
    minder_own:JSON.stringify([MAIN,SAV]), minder_accmeta:'{}', minder_plan:'{}'};
}
async function boot(page,o={}){
  if(o.dagen!=null) await pinDag(page,o.dagen); else await pinDag(page);
  await page.addInitScript(s=>{for(const k in s)localStorage.setItem(k,s[k]);}, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof window.renderMaand==='function');
}
/* De records worden in de PAGINA gezet en met de echte sleutel van `valtOpId()`, want een sleutel
   in Node afleiden is de val van v299. */
async function zetLog(page, recs){
  await page.evaluate(rs=>{ SET.valtOpLog=SET.valtOpLog||{};
    for(const r of rs) SET.valtOpLog[valtOpId(r.maand, r.potjeId)]=r;
    save(); }, recs);
}
const REC=(o)=>Object.assign({maand:THIS,potjeId:'boodschappen',categorie:'Boodschappen',
  potje_bij_detectie:POTJE,getoond:true}, o);
const lees=(page,k)=>page.evaluate(kk=>{
  const r=(SET.valtOpLog||{})[valtOpId(thisYM(),kk)]||{};
  return {actie:r.actie, voor:r.volgend_voor===undefined?null:r.volgend_voor,
    na:r.volgend_na===undefined?null:r.volgend_na,
    pv:r.potje_voor===undefined?null:r.potje_voor, pn:r.potje_na===undefined?null:r.potje_na,
    nu:Math.round(+(SET.budgets||{})[kk]||0), vlg:Math.round(+(SET.budgetsNext||{})[kk]||0)};
}, k);

/* v315: DE RIJ WORDT APART GELEZEN EN NIET DE HELE KAART. GEMETEN: een sabotage die het woord van
   de handeling in de `woord`-map door 'potje bijgesteld' vervangt bleef GROEN op een assertie over
   de volle tekst, want de TELREGEL onderaan draagt hetzelfde woord ("1x volgende maand anders").
   Dat is meetles (r): de assertie viel op een andere bron in dezelfde tekst. De rijen zijn de
   `div`s met een `border-top`, de telregel is het laatste kind van de kaart. */
async function logDelen(page){
  return await page.evaluate(()=>{
    const d=document.createElement('div'); d.innerHTML=valtOpLogBlok(); document.body.appendChild(d);
    const kaart=d.querySelector('.card');
    const schoon=s=>String(s||'').replace(/\s+/g,' ').trim();
    const rijen=[...kaart.children].filter(x=>/border-top/.test(x.getAttribute('style')||''))
      .map(x=>schoon(x.innerText));
    const tel=schoon(kaart.lastElementChild && kaart.lastElementChild.innerText);
    d.remove();
    return {rijen, tel};
  });
}

/* ===== a) DE INVOER ===== */
test('a1 de fixture draagt een open record, en twee potjebedragen die uiteenlopen', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{ const L=valtOpSignals();
    const rec=(SET.valtOpLog||{})[valtOpId(thisYM(),'boodschappen')];
    return {n:L.length, key:L[0]&&L[0].potjeId, over:L[0]&&L[0].over, open:!!rec&&!rec.actie,
      nu:Math.round(+SET.budgets.boodschappen), vlg:Math.round(+SET.budgetsNext.boodschappen)}; });
  expect(r.n).toBeGreaterThan(0);
  expect(r.key).toBe('boodschappen');
  expect(r.over).toBeGreaterThan(25);            // boven DREMPEL_EUR, dus het signaal vuurt echt
  expect(r.open).toBe(true);
  expect(r.nu).toBe(POTJE);
  expect(r.vlg).toBe(GEPLAND);
  expect(r.nu).not.toBe(r.vlg);                  // zonder dit verschil meet b1 niets
});

/* De this-month-tak van de haak is vanuit deze twee aanroepers NIET bereikbaar, en dat is hier
   GEMETEN en niet beredeneerd: een record bestaat alleen als er een signaal vuurde, en dat vraagt
   een potje boven nul, dus `exists` is daar waar. f3 loopt die tak langs het pad dat hij wel heeft. */
test('a2 een categorie met een record heeft per constructie een potje, dus schrijven ze budgetsNext',
  async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{ const ids=Object.keys(SET.valtOpLog||{});
    return ids.map(id=>{ const k=SET.valtOpLog[id].potjeId; return +(SET.budgets||{})[k]>0; }); });
  expect(r.length).toBeGreaterThan(0);
  expect(r.every(Boolean)).toBe(true);
});

/* ===== b) DE HANDELING ===== */
test('b1 de potje-editor zet volgende_maand, en laat het potje van deze maand staan', async ({page})=>{
  await boot(page);
  await page.evaluate(n=>{ window._potDraft={type:'vast',vast:n}; savePotje('boodschappen'); }, NIEUW);
  const r=await lees(page,'boodschappen');
  expect(r.actie).toBe('volgende_maand');
  expect(r.voor).toBe(POTJE);                    // het potje van DEZE maand, niet de geplande 500
  expect(r.na).toBe(NIEUW);
  expect(r.pv).toBeNull();                       // de velden van een bijstelling blijven leeg
  expect(r.pn).toBeNull();
  expect(r.nu).toBe(POTJE);                      // v314: dit getal bleef staan en de log zei van niet
  expect(r.vlg).toBe(NIEUW);
});

test('b2 het budgetraster zet dezelfde handeling via setCatBudget', async ({page})=>{
  await boot(page);
  await page.evaluate(n=>setCatBudget('boodschappen',String(n)), NIEUW);
  const r=await lees(page,'boodschappen');
  expect(r.actie).toBe('volgende_maand');
  expect(r.voor).toBe(POTJE);
  expect(r.na).toBe(NIEUW);
  expect(r.nu).toBe(POTJE);
});

/* DE KNOP OP GRIP LOOPT HET ECHTE PAD: hij staat alleen in de laatste dagen (v314), dus deze test
   pint twee dagen voor het eind. Hij tikt de knop, vult het veld van de sheet en zet vast; een
   rechtstreekse aanroep van savePotje() zou de ingang zelf niet meten (meetles c). */
test('b3 de knop "Volgende maand anders" op Grip komt in het logboek als volgende_maand', async ({page})=>{
  await boot(page,{dagen:2});
  await page.evaluate(()=>go('maand'));
  await expect(page.locator('.valtop-open')).toContainText('Volgende maand anders');
  const oc=await page.evaluate(()=>{
    const el=[...document.querySelectorAll('.valtop-open [onclick]')]
      .find(x=>/openPotje\(/.test(x.getAttribute('onclick')||''));
    return el?el.getAttribute('onclick'):null; });
  expect(oc).toContain("openPotje('boodschappen')");
  await page.evaluate(()=>{ const el=[...document.querySelectorAll('.valtop-open [onclick]')]
    .find(x=>/openPotje\(/.test(x.getAttribute('onclick')||'')); el.click(); });
  await page.waitForFunction(()=>!!document.querySelector('#sheet input[type=number]'));
  await page.fill('#sheet input[type=number]', String(NIEUW));
  await page.locator('#sheet button.btn').click();
  const r=await lees(page,'boodschappen');
  expect(r.actie).toBe('volgende_maand');
  expect(r.voor).toBe(POTJE);
  expect(r.na).toBe(NIEUW);
  expect(r.nu).toBe(POTJE);
});

test('b4 setCatBudget vuurt per toetsaanslag, en volgend_voor houdt zijn eerste waarde', async ({page})=>{
  await boot(page);
  await page.evaluate(()=>{ setCatBudget('boodschappen','4'); setCatBudget('boodschappen','45'); setCatBudget('boodschappen','450'); });
  const r=await lees(page,'boodschappen');
  expect(r.actie).toBe('volgende_maand');
  expect(r.voor).toBe(POTJE);
  expect(r.na).toBe(450);
});

test('b5 terug op de oude stand draait de handeling terug', async ({page})=>{
  await boot(page);
  await page.evaluate(n=>{ setCatBudget('boodschappen',String(n)); setCatBudget('boodschappen',String(400)); }, NIEUW);
  const r=await lees(page,'boodschappen');
  expect(r.actie).toBeFalsy();
  expect(r.voor).toBeNull();
  expect(r.na).toBeNull();
});

test('b6 het potje stoppen vanaf volgende maand is dezelfde handeling, met nul', async ({page})=>{
  await boot(page);
  await page.evaluate(()=>savePotje('boodschappen',true));
  const r=await lees(page,'boodschappen');
  expect(r.actie).toBe('volgende_maand');
  expect(r.voor).toBe(POTJE);
  expect(r.na).toBe(0);
  expect(r.nu).toBe(POTJE);
});

/* ===== c) DE PRECEDENTIE: ÉÉN ACTIE PER RECORD ===== */
test('c1 een bijstelling van DEZE maand blijft staan en wordt niet overschreven', async ({page})=>{
  await boot(page);
  await zetLog(page,[REC({actie:'potje_bijgesteld',actie_op:THIS+'-10',potje_voor:POTJE,potje_na:700})]);
  await page.evaluate(n=>setCatBudget('boodschappen',String(n)), NIEUW);
  const r=await lees(page,'boodschappen');
  expect(r.actie).toBe('potje_bijgesteld');
  expect(r.pn).toBe(700);                  // het getal van de Grip-route staat er onveranderd
  expect(r.voor).toBeNull();
  expect(r.na).toBeNull();
});

test('c2 een grens en een zo-gelaten blijven ook staan', async ({page})=>{
  await boot(page);
  for(const a of ['grens_gezet','zo_gelaten']){
    await zetLog(page,[REC({actie:a,actie_op:THIS+'-10'})]);
    await page.evaluate(n=>setCatBudget('boodschappen',String(n)), NIEUW);
    const r=await lees(page,'boodschappen');
    expect(r.actie, a+' werd overschreven').toBe(a);
    expect(r.na).toBeNull();
  }
});

test('c3 de Grip-route overschrijft een volgende_maand wel, want die verzet de lat', async ({page})=>{
  await boot(page);
  await page.evaluate(n=>setCatBudget('boodschappen',String(n)), NIEUW);
  const r=await page.evaluate(()=>{
    const id=valtOpId(thisYM(),'boodschappen');
    valtOpActieZet(id,'potje_bijgesteld',{potje_voor:400,potje_na:700});
    const r=SET.valtOpLog[id]; return {actie:r.actie, pn:r.potje_na, na:r.volgend_na}; });
  expect(r.actie).toBe('potje_bijgesteld');
  expect(r.pn).toBe(700);
  expect(r.na).toBe(NIEUW);                // de wijziging voor volgende maand staat er nog
});

/* ===== d) DE LAT EN DE UITKOMST ===== */
/* DIT IS DE SCHERPSTE ASSERTIE VAN DEZE RONDE: de lat van een afgesloten maand mag nooit het bedrag
   van de VOLGENDE maand zijn. Met `volgend_na` als lat zou de uitkomst 0 zijn in plaats van 150, en
   dan zou een maand die 150 boven zijn potje eindigde als binnen-het-potje lezen (v168: te gunstig
   is de gevaarlijke kant). */
test('d1 de afsluiting meet tegen het potje van die maand en niet tegen dat van de maand erna', async ({page})=>{
  await boot(page);
  await zetLog(page,[{maand:VORIG,potjeId:'boodschappen',categorie:'Boodschappen',
    potje_bij_detectie:POTJE,getoond:true,actie:'volgende_maand',actie_op:VORIG+'-22',
    volgend_voor:POTJE,volgend_na:700}]);
  const r=await page.evaluate(m=>{ valtOpAfsluiten();
    const r=SET.valtOpLog[valtOpId(m,'boodschappen')];
    return {over:r.over_eind_maand, sp:Math.round(catSpendMap(m).boodschappen||0),
      uit:valtOpUitkomst(r)}; }, VORIG);
  expect(r.sp).toBe(UITGAVE_VORIG);               // de invoer: 550 besteed
  expect(r.over).toBe(UITGAVE_VORIG-POTJE);       // 150, tegen de lat van 400
  expect(r.over).not.toBe(0);                     // tegen 700 zou het nul zijn
  expect(r.uit).toContain('150');
  expect(r.uit).toContain('boven je potje');
});

test('d2 eindigde de maand binnen het potje, dan zegt de uitkomst dat', async ({page})=>{
  await boot(page);
  const uit=await page.evaluate(m=>valtOpUitkomst({maand:m,potjeId:'boodschappen',
    actie:'volgende_maand',volgend_voor:400,volgend_na:700,over_eind_maand:0}), VORIG);
  expect(uit).toBe('eindigde binnen je potje');
});

/* ===== e) HET LOGBOEK EN DE TELLING ===== */
test('e1 de rij noemt de handeling en zegt welk bedrag deze maand geldt', async ({page})=>{
  await boot(page);
  await page.evaluate(n=>setCatBudget('boodschappen',String(n)), NIEUW);
  const d=await logDelen(page);
  const rij=d.rijen.find(x=>/Boodschappen/.test(x))||'';
  expect(rij, 'geen rij voor deze categorie').not.toBe('');
  expect(rij).toContain('volgende maand anders');
  expect(rij).toMatch(/nu\s*€\s?400\s*→\s*€\s?450/);
});

/* ZONDER DEZE ASSERTIE IS DE NIEUWE VORM NIET VAN DE OUDE TE ONDERSCHEIDEN: een bijstelling drukt
   hetzelfde paar af zonder het woord `nu`, en dat paar beweert dat het potje van deze maand bewoog. */
test('e2 een bijstelling houdt zijn kale pijl, en de twee vormen zijn te scheiden', async ({page})=>{
  await boot(page);
  await zetLog(page,[REC({actie:'potje_bijgesteld',actie_op:THIS+'-10',potje_voor:POTJE,potje_na:700})]);
  const d=await logDelen(page);
  const rij=d.rijen.find(x=>/Boodschappen/.test(x))||'';
  expect(rij).toContain('potje bijgesteld');
  expect(rij).toMatch(/€\s?400\s*→\s*€\s?700/);
  expect(rij).not.toMatch(/nu\s*€\s?400/);
  expect(rij).not.toContain('volgende maand anders');
});

test('e3 de telling noemt de handeling onvoorwaardelijk, ook op nul, en naast de bijstelling', async ({page})=>{
  await boot(page);
  await zetLog(page,[REC({actie:'potje_bijgesteld',actie_op:THIS+'-10',potje_voor:POTJE,potje_na:700})]);
  const d=await logDelen(page);
  expect(d.tel).toContain('0× volgende maand anders');
  expect(d.tel).toContain('1× potje bijgesteld');
});

test('e4 de telling houdt de twee handelingen apart', async ({page})=>{
  await boot(page);
  await page.evaluate(n=>setCatBudget('boodschappen',String(n)), NIEUW);
  const r=await page.evaluate(()=>valtOpTelling().n);
  expect(r.volgende_maand).toBe(1);
  expect(r.potje_bijgesteld).toBe(0);
  expect(r.zo_gelaten).toBe(0);
});

/* ===== f) DE BRON ===== */
test('f1 de haak leidt de laag niet zelf af', async ({page})=>{
  await boot(page);
  const src=await kaalUit(page,'valtOpPotjeGewijzigd');
  expect(src).toContain('vanafNext');
  expect(src, 'de laag komt van de aanroeper en wordt hier niet opnieuw uitgedrukt (v104)')
    .not.toContain('budgetsNext');
  /* v315: de v237-guard las `SET.budgets` om te RADEN welke laag had geschreven. Nu de laag van
     buiten komt mag die lezing hier niet terugkomen; met beide zouden er twee waarheden over
     dezelfde vraag staan. */
  expect(src).not.toContain('SET.budgets');
});

test('f2 elke aanroeper geeft zijn laag mee', async ({page})=>{
  await boot(page);
  for(const fn of ['setCatBudget','savePotje']){
    const src=await kaalUit(page,fn);
    /* DE ARGUMENTEN WORDEN OP DIEPTE EEN GETELD. Een `split(',')` of een `[^)]*` knipt midden in
       `+(SET.budgets||{})[k]||0` en meet dan de haakjes in plaats van de argumenten; dat is de val
       van een test die te dicht op de spelling staat. */
    const calls=[]; let i=-1;
    while((i=src.indexOf('valtOpPotjeGewijzigd(', i+1))>=0){
      let d=0, n=1, j=i+'valtOpPotjeGewijzigd'.length;
      for(; j<src.length; j++){ const c=src[j];
        if(c==='('||c==='['||c==='{') d++;
        else if(c===')'||c===']'||c==='}'){ d--; if(d===0) break; }
        else if(c===',' && d===1) n++; }
      calls.push({tekst:src.slice(i,j+1), n});
    }
    expect(calls.length, fn+' roept de haak niet aan').toBeGreaterThan(0);
    for(const c of calls) expect(c.n, fn+': '+c.tekst).toBeGreaterThanOrEqual(4);
  }
});

test('f3 de this-month-tak schrijft potje_bijgesteld, langs het pad dat hij heeft', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{ valtOpPotjeGewijzigd('boodschappen',400,450,false);
    const r=SET.valtOpLog[valtOpId(thisYM(),'boodschappen')];
    return {actie:r.actie, pv:r.potje_voor, pn:r.potje_na,
      na:r.volgend_na===undefined?null:r.volgend_na}; });
  expect(r.actie).toBe('potje_bijgesteld');
  expect(r.pv).toBe(400);
  expect(r.pn).toBe(450);
  expect(r.na).toBeNull();
});
