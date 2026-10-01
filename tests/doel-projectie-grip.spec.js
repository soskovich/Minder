/* v316: DE DOEL-RIJ OP GRIP LEEST DEZELFDE UITKOMST ALS PLAN.
   HET GEMELDE GEVAL, op 1 oktober 2026: Grip zei "EUR 1.980 per maand tegen EUR 2.143 nodig,
   EUR 163 tekort" en Plan zei bij diezelfde EUR 1.980 "vol in mei 2027, net op tijd". Twee
   antwoorden op een vraag (v104).
   DE OORZAAK IS NIET EEN ANDERE MAANDTELLING, en dat is hier gemeten: beide schermen rekenen met
   7 maanden (`doelMaandenTot('2027-05')` op 1 oktober is 7, en `etaDatum(7)` is mei 2027). Wat
   uiteenliep is de LAT: `vatRegels()` las sinds v307 `T.knelt` en dus de projectie van
   `planVooruit()`, en de Grip-rij las `T.gat` en dus de VLAKKE som. Een doel kan zijn datum halen
   terwijl die vlakke som dat niet zegt, want wat een vol doel niet meer nodig heeft zakt door.
   DE FIXTURE CONSTRUEERT PRECIES DIE STAND: Kosten Koper legt EUR 1.980 in en Inrichting EUR 520,
   en zodra Inrichting na drie maanden vol is zakt die 520 door naar Kosten Koper. Daarmee is eta 7
   terwijl `ceil(15000/1980)` 8 zou zijn, en is `benodigd` 2.143 tegen een inleg van 1.980. Zonder
   dat verschil is "hij leest de projectie" niet van "hij leest het gat" te onderscheiden
   (meetles a). */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN='NL01MAIN0000001111', SAV='NL01SAVE0000004323';
const MS=['2026-05','2026-06','2026-07','2026-08','2026-09'];
const CAP=2500, KK_DOEL=15000, KK_ALLOC=1980, IW_DOEL=1560;
const HAALT='2027-05';        // 7 maanden vanaf oktober 2026, en de projectie haalt hem
const HAALT_NIET='2027-01';   // 3 maanden, en die haalt hij ook met de doorzak niet

function seed(o={}){
  const tx=[]; let i=0;
  const add=(m,d,a,n,ds,acc)=>tx.push({id:'x'+(i++),date:`${m}-${d}`,amount:a,acc:acc||MAIN,
    name:n,desc:ds,typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  MS.forEach(m=>{ add(m,'03',4000,'Werkgever','SALARIS LOON');
    add(m,'04',-900,'Woningcorporatie','SEPA INCASSO HUURBETALING');
    add(m,'05',-300,'Albert Heijn','BEA, BETAALPAS ALBERT HEIJN');
    add(m,'06',1980,'Spaarpot','NAAR SPAREN',SAV);
    add(m,'07',-120,'Shell','BEA, BETAALPAS SHELL'); });
  const set=Object.assign({mode:'begeleid',autoIncome:false,income:4000,limit:70,
    bufferNorm:2, nfMaanden:3, savingsEnds:['4323'],
    manualBal:{[MAIN]:3000,[SAV]:9000},
    budgets:{huur:900,boodschappen:400,vervoer:150}, budgetsNext:{},
    budgetMonth:'2026-10', savingMode:'amount', savingAmount:CAP,
    /* DE BUFFER IS VOL, en dat is geen detail: met een BIJNA volle buffer krijgt Kosten Koper zijn
       ruimte via de grendel-doorzak, en dan drukt `vatRegels()` de v255-vorm af ('krijgt wat je
       buffer overhoudt') in plaats van een vol-datum. De gemelde stand toont WEL een vol-datum, dus
       de doorzak komt daar van een DOEL dat eerder vol is en niet van de buffer. Gemeten: met een
       bijna volle buffer zegt Plan 'moet in mei 2027 · krijgt wat je buffer overhoudt'.
       KOSTEN KOPER STAAT VOOROP MET EEN VAST BEDRAG, en Inrichting eronder met de rest: ronde 1
       geeft 1.980 en 520, en zodra Inrichting vol is zakt die 520 in RONDE 2 door naar Kosten Koper
       (die leest de modus niet, v255). Daarmee is eta 7 terwijl ceil(15000/1980) 8 zou zijn.
       `maandDoel()` pakt het eerste lopende doel MET een streefdatum, dus Kosten Koper. */
    nfDoelVast:3000, nfToegewezen:3000, nfToegewezenMigrated:1,
    planOrder:['noodfonds','kk','iw'],
    goals:[{id:'kk',naam:'Kosten Koper',doel:KK_DOEL,gespaard:0,streefdatum:HAALT,
            allocMode:'vast',perMaand:KK_ALLOC},
           {id:'iw',naam:'Inrichting',doel:IW_DOEL,gespaard:0,streefdatum:'2027-04',
            allocMode:'vast',perMaand:CAP-KK_ALLOC}],
  }, o.set||{});
  return {minder_tx:JSON.stringify(tx), minder_ovr:'{}', minder_set:JSON.stringify(set),
    minder_own:JSON.stringify([MAIN,SAV]), minder_accmeta:'{}', minder_plan:'{}'};
}
async function boot(page,o={}){
  await pinDatum(page, o.dag||'2026-10-01');
  await page.addInitScript(s=>{for(const k in s)localStorage.setItem(k,s[k]);}, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof window.renderMaand==='function');
}
const meet = page => page.evaluate(()=>{
  const R=maandRegels(); const d=R.find(x=>x.key==='doel')||{};
  const P=allocatePlan(); const kk=P.find(p=>p.id==='kk')||{};
  const T=doelTempo(kk, kk.alloc)||{};
  return {alloc:kk.alloc, rest:kk.rest, eta:kk.eta,
    maandenTot:T.maandenTot, benodigd:T.benodigd, gat:T.gat, knelt:T.knelt, haalbaar:T.haalbaar,
    status:d.status, waarde:d.waarde, eenheid:d.eenheid, gevolg:d.gevolg, tpm:d.tekortPerMaand,
    plan:(()=>{try{return vatRegels(kk,T).regels.join(' · ');}catch(e){return 'FOUT '+e.message;}})(),
    volDatum:kk.eta?etaDatum(kk.eta):''};
});

/* ===== a) DE INVOER: de stand die de twee latten onderscheidt bestaat echt ===== */
test('a de projectie haalt de datum terwijl de vlakke som een gat houdt', async ({page})=>{
  await boot(page);
  const r=await meet(page);
  expect(r.alloc).toBe(KK_ALLOC);
  expect(r.rest).toBe(KK_DOEL);
  expect(r.maandenTot).toBe(7);                       // 1 okt 2026 -> mei 2027
  expect(r.eta).toBe(7);                              // met de doorzak, niet ceil(15000/1980)=8
  expect(Math.ceil(KK_DOEL/KK_ALLOC)).toBe(8);        // de vlakke telling zou 8 zeggen
  expect(r.benodigd).toBe(2143);
  expect(r.gat).toBeGreaterThan(0);                   // de vlakke som houdt een gat
  expect(r.gat).toBe(163);
  expect(r.haalbaar).toBe(true);                      // en de projectie haalt hem toch
  expect(r.knelt).toBe(false);
});

/* ===== b) GRIP VELT GEEN TEKORT MEER OVER EEN DATUM DIE UITKOMT ===== */
test('b de rij staat op ok en claimt geen maandtekort', async ({page})=>{
  await boot(page);
  const r=await meet(page);
  expect(r.status).toBe('ok');
  expect(r.tpm).toBe(0);                              // beleggenWaarde('doel') leest dit veld (v314)
  expect(r.waarde).toContain('1.980');                // de waarde blijft wat je inlegt (v314)
  expect(r.eenheid).not.toContain('2.143');           // de vlakke eis staat er niet meer als tekort
  expect(r.eenheid).not.toContain('nodig');
  expect(r.eenheid).toContain('genoeg voor je datum');
});

test('c het gevolg zegt WAAROM de datum uitkomt, en noemt de vlakke eis als context', async ({page})=>{
  await boot(page);
  const r=await meet(page);
  expect(r.gevolg).toContain('€1.980');
  expect(r.gevolg).toContain('haalt je datum');
  expect(r.gevolg).toContain('voorgaat');             // een bestemming die eerder vol is
  expect(r.gevolg).toContain('€2.143');               // de vlakke eis gaat niet verloren
  expect(r.gevolg).not.toContain('tekort');
});

/* ===== d) DE TWEE SCHERMEN ZEGGEN HETZELFDE, UIT DEZELFDE BRON ===== */
test('d Plan en Grip vellen hetzelfde oordeel over dezelfde datum', async ({page})=>{
  await boot(page);
  const r=await meet(page);
  expect(r.plan).toContain('vol in mei 2027');
  expect(r.plan).toContain('net op tijd');
  expect(r.plan).not.toContain('te laat');
  /* De vol-datum van Plan en de maandenTot van Grip zijn dezelfde telling: etaDatum(eta) landt op
     precies de streefmaand, en dat is wat "beide schermen gebruiken dezelfde" betekent. */
  expect(r.volDatum).toBe('mei 2027');
  expect(r.eta).toBe(r.maandenTot);
});

/* ===== e) DE TEGENPROEF: een doel dat zijn datum NIET haalt houdt zijn tekort =====
   Zonder dit geval is "hij leest de projectie" niet van "hij staat altijd op ok" te onderscheiden. */
test('e een doel dat de datum niet haalt blijft tekort, met het bedrag erbij', async ({page})=>{
  await boot(page,{set:{goals:[{id:'kk',naam:'Kosten Koper',doel:KK_DOEL,gespaard:0,
    streefdatum:HAALT_NIET,allocMode:'vast',perMaand:KK_ALLOC},
    {id:'iw',naam:'Inrichting',doel:IW_DOEL,gespaard:0,streefdatum:'2027-04',
     allocMode:'vast',perMaand:CAP-KK_ALLOC}]}});
  const r=await meet(page);
  expect(r.maandenTot).toBe(3);
  expect(r.eta).toBeGreaterThan(r.maandenTot);
  expect(r.knelt).toBe(true);
  expect(r.status).toBe('tekort');
  expect(r.tpm).toBe(r.gat);
  expect(r.tpm).toBeGreaterThan(0);
  expect(r.eenheid).toContain('nodig');               // daar hoort de vlakke eis juist wel
  expect(r.gevolg).toContain('tekort');
  expect(r.plan).toContain('te laat');
});

/* DE GEWONE OK-RIJ HOUDT ZIJN VLAKKE EIS, en zonder dit geval is "de nieuwe vorm staat er bij een
   doorzak" niet van "de nieuwe vorm staat er altijd" te onderscheiden (meetles o): een sabotage die
   `viaDoorzak` op waar vastzet blijft dan groen. Kosten Koper legt hier 2.500 in en heeft er 2.143
   nodig, dus het gat is weg en de oude zin hoort er onveranderd te staan. */
test('e2 met een inleg die vlak gerekend al genoeg is blijft de oude vorm staan', async ({page})=>{
  await boot(page,{set:{goals:[{id:'kk',naam:'Kosten Koper',doel:KK_DOEL,gespaard:0,
    streefdatum:HAALT,allocMode:'vast',perMaand:CAP}]}});
  const r=await meet(page);
  expect(r.alloc).toBe(CAP);
  expect(r.gat).toBeLessThanOrEqual(0);               // geen gat: de vlakke som is al genoeg
  expect(r.status).toBe('ok');
  expect(r.eenheid).toContain('€2.143 nodig');        // de vlakke eis staat er juist wel
  expect(r.eenheid).not.toContain('genoeg voor je datum');
  expect(r.gevolg).toBe('Je huidige inleg haalt de datum.');
});

/* DE RAND VAN DE DREMPEL: een inleg die PRECIES gelijk is aan de vlakke eis. Zonder dit geval blijft
   een sabotage die `gat>MAAND_DREMPEL.doelOk` door `gat>=` vervangt groen, want e2 draagt een
   NEGATIEF gat en dan maken de twee vormen geen verschil (meetles o). Gemeten: 15.000 over 7 maanden
   is 2.143, dus bij een inleg van 2.143 is het gat exact nul en hoort de vlakke eis er te staan. */
test('e3 bij een gat van precies nul blijft de vlakke eis staan', async ({page})=>{
  await boot(page,{set:{goals:[{id:'kk',naam:'Kosten Koper',doel:KK_DOEL,gespaard:0,
      streefdatum:HAALT,allocMode:'vast',perMaand:2143},
    {id:'iw',naam:'Inrichting',doel:1071,gespaard:0,streefdatum:'2027-04',
      allocMode:'vast',perMaand:CAP-2143}]}});
  const r=await meet(page);
  expect(r.alloc).toBe(2143);
  expect(r.gat).toBe(0);                              // precies op de drempel
  expect(r.status).toBe('ok');
  expect(r.eenheid).toContain('€2.143 nodig');
  expect(r.eenheid).not.toContain('genoeg voor je datum');
});

/* WAAROM DE DREMPEL IN DE BESLISSING GEEN GEDRAG VERANDERT, en dat is GEMETEN en niet beredeneerd.
   Mijn eerste vorm van deze test beweerde dat `knelt` altijd `gat>0` impliceert, en die is weerlegd
   door zijn eigen meting: bij `alloc 2143` met `eta 8` is het gat NUL en knelt hij toch. Dat paar is
   alleen niet te BEREIKEN: `planVooruit()` kan de alloc per maand alleen laten STIJGEN, dus een echte
   eta is nooit groter dan `ceil(rest/alloc)`, en bij 2.143 is dat 7. Op de bereikbare paren geldt de
   implicatie wel, en daar is `knelt && gat>0` dus karakter voor karakter `knelt`.
   DAAROM BLIJFT DE SABOTAGE DIE DE DREMPEL UIT DE BESLISSING HAALT GROEN (meetles p), en daarom
   blijft hij er toch staan: het label van de beleggen-voorwaarde drukt diezelfde constante af, dus
   zonder hem in de beslissing beloven label en gedrag verschillende dingen zodra iemand hem op iets
   anders dan nul zet. WAT DEZE TEST VASTHOUDT is de implicatie op het bereikbare deel en het paar
   waarop ze breekt; die twee samen zeggen waarom de drempel inert is. */
test('e4 op bereikbare standen impliceert knelt een gat boven nul', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    const REST=15000, TOT=7;
    const rij=(alloc,eta)=>{ const g={doel:REST, gespaard:0, rest:REST, streefdatum:'2027-05'};
      if(eta!=null) g.eta=eta; const T=doelTempo(g, alloc);
      return {alloc, eta, gat:T.gat, knelt:T.knelt}; };
    const bereikbaar=[], onbereikbaar=[];
    for(const alloc of [100,1000,1980,2142,2143,2500,9000]){
      const vlak=Math.ceil(REST/alloc);
      for(const eta of [null,1,3,5,7,8,20]){
        /* BEREIKBAAR = wat planVooruit() kan opleveren: de alloc kan alleen stijgen, dus de eta is
           nooit hoger dan de vlakke telling. */
        (eta==null||eta<=vlak ? bereikbaar : onbereikbaar).push(rij(alloc,eta));
      }
    }
    return {bereikbaar, onbereikbaar, drempel:MAAND_DREMPEL.doelOk, tot:TOT};
  });
  expect(r.drempel).toBe(0);
  expect(r.bereikbaar.length).toBeGreaterThan(15);
  for(const x of r.bereikbaar)
    if(x.knelt) expect(x.gat, `bereikbaar: alloc ${x.alloc}, eta ${x.eta}`).toBeGreaterThan(0);
  expect(r.bereikbaar.some(x=>x.knelt), 'geen enkel bereikbaar geval knelt, dus de lus toetst niets').toBe(true);
  expect(r.bereikbaar.some(x=>!x.knelt), 'geen enkel bereikbaar geval haalt het').toBe(true);
  /* HET PAAR WAAROP DE IMPLICATIE BREEKT bestaat wel, en dat is waarom dit geen bewijs over de hele
     functie is maar over het bereikbare deel. */
  const breuk=r.onbereikbaar.filter(x=>x.knelt && x.gat<=0);
  expect(breuk.length, 'geen onbereikbaar paar dat de implicatie breekt, dus de uitleg hierboven klopt niet').toBeGreaterThan(0);
  expect(breuk[0].gat).toBe(0);
});

/* ===== f) DE TELLING OP DE EERSTE VAN DE MAAND =====
   De gebruiker vroeg of de inleg van oktober meetelt. GEMETEN: nee, en op BEIDE schermen niet.
   `doelMaandenTot()` is het kalenderverschil en sluit de lopende maand uit, en `etaDatum(1)` landt
   op de volgende maand, dus de eerste inleg van de projectie valt in november. De twee tellingen
   zijn daarmee gelijk; dat ze de lopende maand overslaan is een eigen vraag en staat als meting in
   CLAUDE.md. */
test('f beide tellingen slaan de lopende maand over, ook op de 1e', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>({
    vandaag: vandaagYMD(),
    tot: doelMaandenTot('2027-05'),
    eerste: etaDatum(1),
    zeven: etaDatum(7),
  }));
  expect(r.vandaag).toBe('2026-10-01');
  expect(r.tot).toBe(7);                              // nov t/m mei, oktober telt niet mee
  expect(r.eerste).toBe('nov 2026');                  // de eerste inleg van de projectie
  expect(r.zeven).toBe('mei 2027');                   // en de zevende landt op de streefmaand
});

/* DE DAG MAG HET OORDEEL NIET VERZETTEN: `doelMaandenTot()` is een kalenderverschil in MAANDEN, dus
   dag 1 en dag 15 van dezelfde maand horen hetzelfde te zeggen. Zonder dit geval zou een reparatie
   die stil op de dag gaat rekenen niet opvallen. */
test('g op dag 15 van dezelfde maand staat er hetzelfde', async ({page})=>{
  await boot(page,{dag:'2026-10-15'});
  const r=await meet(page);
  expect(r.maandenTot).toBe(7);
  expect(r.eta).toBe(7);
  expect(r.status).toBe('ok');
  expect(r.plan).toContain('net op tijd');
});

/* ===== h) DE TAK ZONDER PROJECTIE IS KARAKTER VOOR KARAKTER DE OUDE VORM ===== */
test('h zonder eta beslist het vlakke gat, net als voor deze ronde', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    const g={doel:15000, gespaard:0, rest:15000, streefdatum:'2027-05'};
    const krap=doelTempo(g, 1980);                 // geen eta: de vlakke som beslist
    const ruim=doelTempo(g, 3000);
    return {krap:{gat:krap.gat, knelt:krap.knelt, haalbaar:krap.haalbaar},
            ruim:{gat:ruim.gat, knelt:ruim.knelt, haalbaar:ruim.haalbaar}};
  });
  expect(r.krap.gat).toBe(163);
  expect(r.krap.knelt).toBe(true);                 // zonder projectie is krap nog steeds een tekort
  expect(r.ruim.gat).toBeLessThanOrEqual(0);
  expect(r.ruim.knelt).toBe(false);
});

/* ===== i) DE BRON ===== */
test('i de rij leest knelt en rekent de projectie niet na', async ({page})=>{
  await boot(page);
  const src=await kaalUit(page,'maandRegels');
  expect(src).toContain('T.knelt');
  expect(src, 'de drempel houdt zijn lezer in de beslissing')
    .toContain('MAAND_DREMPEL.doelOk');
  expect(src, 'de projectie komt uit doelTempo() en wordt hier niet herhaald (v104)')
    .not.toContain('planVooruit(');
  /* vatRegels() leest dezelfde `knelt`, en dat is wat de twee schermen bindt. */
  const vat=await kaalUit(page,'vatRegels');
  expect(vat).toContain('T.knelt');
});
