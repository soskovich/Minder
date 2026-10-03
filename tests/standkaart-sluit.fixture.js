/* v327: DE STAND VAN HET TOESTEL OP 3 OKTOBER 2026, nagebouwd uit blok 15 en blok 3 (v251/v256: een
   fixture die "de gemelde stand" heet draagt die getallen). Op de code van v326 geeft hij exact
   wat het toestel toonde: maandbudget 3.375, nog in je potjes 1.654, uitgegeven 175, nog te
   betalen 957, dus 589 nergens, en veilig te besteden 1.113. De incasso's dragen dezelfde namen,
   bedragen, categorieen en dezelfde bron (schema of de terugval op vorige maand) als in blok 15
   (v328: DELA staat er zoals op het toestel, in maart, juni en september; op v326 en v327 zette de
   terugval hem desondanks als maandlast in oktober, en dat was de fout);
   de saldi zijn die van blok 3 (4.744,83 in totaal, 4.000 op de spaarrekening, 37 in de
   reserveringspot), en het spaarbedrag is 2.200 per maand. */
const MAIN='NL01MAIN0000001111', SPAAR='NL01SPAR0000002222', RES='NL01RESV0000003333';
const MND=['2026-03','2026-04','2026-05','2026-06','2026-07','2026-08','2026-09'];
const OKT='2026-10';
function seed(){
  const tx=[]; let i=0;
  const add=(acc,d,a,n,ds)=>tx.push({id:'s'+(i++),date:d,amount:a,acc,name:n,desc:ds,typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  const inc=(m,d,n,a)=>add(MAIN,m+'-'+d,-a,n,'SEPA INCASSO '+n.toUpperCase());
  add(SPAAR,'2026-03-02',4000,'Eigen overboeking','OVERBOEKING SPAREN');
  add(RES,'2026-03-02',37,'Eigen overboeking','OVERBOEKING RESERVERING');
  for(const m of MND){
    add(MAIN,m+'-24',5216,'Werkgever','SALARIS LOON');
    if(m>='2026-06'){
      inc(m,'05','Stichting Beheer Derdeng',3);
      inc(m,'08','Stparkeergelden via Rive',19);
      inc(m,'10','Health Club Purmerend BV',50);
      inc(m,'12','Ontvangsten Hiltermann L',537);
      inc(m,'14','Huurwoningen',30);
      inc(m,'18','Zilveren Kruis Zorgverze',164);
      inc(m,'20','Belastingdienst',66);
    }
  }
  for(const m of ['2026-02','2026-05','2026-08']) inc(m,'16','Bol Abonnement Select',95);   // per kwartaal, volgende in november: deze maand niets open
  inc('2026-09','22','Shurgard NL',137);                       // een keer: alleen de terugval kent hem
  for(const m of ['2026-03','2026-06','2026-09']) inc(m,'26','DELA Natura- en levensv',160);   // per kwartaal (toestel: maart, juni, september), en uitgesloten
  const bea=(d,a,n)=>add(MAIN,OKT+'-'+d,-a,n,'BEA, BETAALPAS '+n.toUpperCase());
  bea('01',99,'Tango Tankstation'); bea('01',1,'Appstore Kleintje'); bea('02',16,'Albert Heijn');
  bea('02',7,'Hema Winkel'); bea('02',52,'Cafe De Kroeg');
  const set={mode:'begeleid',autoIncome:false,income:5216,limit:70,limitMode:'pct',insPeriod:'month',budgetMonth:OKT,
    manualBal:{[MAIN]:707.83,[SPAAR]:4000,[RES]:37}, savingsAcc:{[SPAAR]:true,[MAIN]:false,[RES]:false}, resAcc:RES,
    savingMode:'amount', savingAmount:2200};
  return {minder_tx:JSON.stringify(tx), minder_ovr:'{}', minder_set:JSON.stringify(set),
    minder_own:JSON.stringify([MAIN,SPAAR,RES]), minder_accmeta:'{}', minder_plan:'{}'};
}
/* de categorieen en de potjes op de ECHTE sleutels, en de uitsluitingen op de echte incassosleutels */
const CATMAP={'Stichting Beheer Derdeng':'bankkosten','Stparkeergelden via Rive':'vervoer','Health Club Purmerend BV':'sport',
  'Ontvangsten Hiltermann L':'vervoer','Huurwoningen':'belasting','Zilveren Kruis Zorgverze':'verzekering','Belastingdienst':'vervoer',
  'Bol Abonnement Select':'shopping','Shurgard NL':'huur','DELA Natura- en levensv':'verzekering','Tango Tankstation':'vervoer',
  'Appstore Kleintje':'abonnement','Albert Heijn':'boodschappen','Hema Winkel':'overig','Cafe De Kroeg':'uiteten'};
const POTJES={vervoer:1100,verzekering:335,huur:750,shopping:95,belasting:40,bankkosten:25,abonnement:5,boodschappen:400,overig:500,sport:50,uiteten:55,vices:20};
const UIT=['Stparkeergelden via Rive','Huurwoningen','DELA Natura- en levensv'];
async function bootStand(page){
  const { pinDatum } = require('./vaste-dag');
  await pinDatum(page,'2026-10-03');
  await page.addInitScript(s=>{for(const k in s)localStorage.setItem(k,s[k]);}, seed());
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof window.monthLiquidity==='function' && TX.length>0);
  await page.evaluate(({CATMAP,POTJES,UIT})=>{
    for(const t of TX){ const c=CATMAP[t.name]; if(c) OVR[t.id]=c; }
    SET.budgets=Object.assign({},POTJES); SET.budgetMonth=thisYM();
    SET.fixDueExcl={}; for(const n of UIT) SET.fixDueExcl[recurKey(TX.find(t=>t.name===n))]={sinds:'2026-09-30'};
    save();
  },{CATMAP,POTJES,UIT});
}
module.exports={bootStand, POTJES};
