/* v315, ronde B: de norm per maand (7), de gevolgen in de sheet (8), de kaart 'Vanaf <maand>' (9)
   en de uitkomst in het logboek (10).
   DE FIXTURE LAAT DE GETALLEN UITEENLOPEN, want dat is wat de asserties dragen:
   - de toewijzing (6.000 na de migratie) staat BOVEN het doel (3.000), zodat de klem van
     nfGespaardBij() meetbaar is: zonder die functie zou een hypothetisch doel van 7.308 nog 4.308
     te gaan zien in plaats van 1.308 (meetles a: de code mag niet aan beide kanten staan);
   - de norm (2) wijkt af van de richt (3) en van elke keuze die de tests maken;
   - het logboek draagt vier records met een ANDERE uitkomst, waarvan er een op nul staat voor de
     ene lat en op 150 voor de andere. Met samenvallende latten is 'hij leest het oorspronkelijke
     potje' niet van 'hij leest het bijgestelde potje' te onderscheiden. */
const { test, expect } = require('@playwright/test');
const { pinDag, vasteDatum, DAGEN_OVER } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN='NL01MAIN0000001111', SAV='NL01SAVE0000004323', RES='NL01RESV0000007788';
const NU=vasteDatum(DAGEN_OVER);
const ym=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
const MS=[4,3,2,1,0].map(k=>ym(new Date(NU.getFullYear(),NU.getMonth()-k,1)));
const THIS=MS[4], VORIG=MS[3];
const PLUS=n=>ym(new Date(NU.getFullYear(),NU.getMonth()+n,1));
const VOLGENDE=PLUS(1);

const NORM=2, RICHT=3, DOEL=3000, ESS=1218;        // gemeten op deze fixture
/* DE TOEWIJZING BOVEN HET DOEL IS GECONSTRUEERD, en dat staat erbij om de reden van v274: uit de
   verse stand ontstaat hij niet, want `migrateNfToegewezen()` klemt al bij het SCHRIJVEN
   (`Math.min(saved, doel)`). Hij ontstaat als je je doel daarna VERLAAGT, en dan is het een echte
   stand die Grip zelf meldt ('er staat X niet toegewezen'). De fixture zet daarom `migrated` en
   een eigen toewijzing, want zonder dat verschil is de klem van nfGespaardBij() inert. */
const TOEGEWEZEN=6000;
const POTJE_ORIG=400, POTJE_NA=600, UITGAVE_VORIG=550;

function seed(o={}){
  const tx=[]; let i=0;
  const add=(m,d,a,n,ds,acc)=>tx.push({id:'x'+(i++),date:`${m}-${d}`,amount:a,acc:acc||MAIN,
    name:n,desc:ds,typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  MS.forEach(m=>{ add(m,'03',4000,'Werkgever','SALARIS LOON');
    add(m,'04',-900,'Woningcorporatie','SEPA INCASSO HUURBETALING');
    add(m,'05',-300,'Albert Heijn','BEA, BETAALPAS ALBERT HEIJN');
    add(m,'06',600,'Spaarpot','NAAR SPAREN',SAV);
    add(m,'07',-120,'Shell','BEA, BETAALPAS SHELL');
    add(m,'08',-80,'Basic Fit','SEPA INCASSO BASIC FIT'); });
  add(THIS,'09',-184,'Jumbo','BEA, BETAALPAS JUMBO');              // boodschappen 484 van 400
  add(VORIG,'20',-250,'Jumbo','BEA, BETAALPAS JUMBO');             // vorige maand 550 van 400
  /* EEN TWEEDE VERVOER-BOEKING IN DE VORIGE MAAND, en die staat er voor de grens-telling: met
     slechts een boeking is 'de boekingen die er al waren' niet van 'alle boekingen' te
     onderscheiden en is de bekend-lijst inert (meetles q). */
  add(VORIG,'25',-40,'Shell','BEA, BETAALPAS SHELL');
  const set=Object.assign({mode:'begeleid',autoIncome:false,income:4000,limit:70,
    bufferNorm:NORM, nfToegewezen:TOEGEWEZEN, nfToegewezenMigrated:1, nfMaanden:RICHT, nfDoelVast:DOEL,
    savingsEnds:['4323'], resAcc:RES, manualBal:{[MAIN]:3000,[SAV]:6000,[RES]:500},
    budgets:{huur:900,boodschappen:POTJE_ORIG,vervoer:150},
    budgetsNext:{huur:900,boodschappen:POTJE_ORIG,vervoer:150},
    budgetMonth:THIS,
    reserveringen:[{id:'r1',naam:'Waterschapsbelasting',bedrag:299,vervalmaand:PLUS(2),intervalM:12,cat:'belasting'}],
    goals:[{id:'g1',naam:'Kosten Koper',doel:10000,gespaard:0,streefdatum:PLUS(24),allocMode:'auto'},
           {id:'g2',naam:'Inrichting',doel:3000,gespaard:0,streefdatum:PLUS(12),allocMode:'auto'}],
    spaarInleg:600,
  }, o.set||{});
  return {minder_tx:JSON.stringify(tx), minder_ovr:'{}', minder_set:JSON.stringify(set),
    minder_own:JSON.stringify([MAIN,SAV,RES]), minder_accmeta:'{}', minder_plan:'{}'};
}
async function boot(page,o={}){
  await pinDag(page);
  await page.addInitScript(s=>{for(const k in s)localStorage.setItem(k,s[k]);}, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof window.renderMaand==='function');
}
const LOG=(extra={})=>({
  [VORIG+'|boodschappen']:{maand:VORIG,potjeId:'boodschappen',categorie:'Boodschappen',
    potje_bij_detectie:POTJE_ORIG,getoond:true,actie:'potje_bijgesteld',actie_op:VORIG+'-22',
    potje_voor:POTJE_ORIG,potje_na:POTJE_NA},
  [VORIG+'|vervoer']:{maand:VORIG,potjeId:'vervoer',categorie:'Vervoer & auto',
    potje_bij_detectie:100,getoond:true,actie:'grens_gezet',actie_op:VORIG+'-22',
    grens_stand:120,grens_bekend:[]},
  [THIS+'|boodschappen']:{maand:THIS,potjeId:'boodschappen',categorie:'Boodschappen',
    potje_bij_detectie:POTJE_ORIG,getoond:true},
  ...extra});

/* ===== a) DE INVOER, zodat elke assertie hieronder op een gemeten stand staat ===== */
test('a1 de fixture draagt een toewijzing BOVEN het doel, en een norm naast de richt', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>({norm:bufferNorm(), richt:noodfondsModel().maanden,
    doel:Math.round(noodfondsModel().doel), ess:Math.round(noodfondsModel().essCrisis),
    toe:Math.round(+SET.nfToegewezen||0), gespaard:planMap()[PLAN_NF].gespaard,
    cap:planCapacity()}));
  expect(r.norm).toBe(NORM);
  expect(r.richt).toBe(RICHT);                 // norm en richt zijn niet hetzelfde getal
  expect(r.doel).toBe(DOEL);
  expect(r.ess).toBe(ESS);
  expect(r.toe).toBe(TOEGEWEZEN);              // meer toegewezen dan het doel vraagt
  expect(r.gespaard).toBe(DOEL);               // en de klem haalt hem omlaag: hier bijt hij
  expect(r.toe).toBeGreaterThan(r.gespaard);
  expect(r.cap).toBeGreaterThan(0);
});

/* ===== 7) DE NORM PER MAAND ===== */
test('7a bufferNormNext valt terug op de norm van nu', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>({nu:bufferNorm(), vlg:bufferNormNext(), veld:SET.bufferNormNext}));
  expect(r.veld).toBeUndefined();
  expect(r.nu).toBe(NORM);
  expect(r.vlg).toBe(NORM);
});

test('7b een WIJZIGING geldt vanaf volgende maand, deze maand houdt zijn norm', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    const voor={norm:bufferNorm(), sub:(maandRegels().find(x=>x.key==='buffer')||{}).sub};
    normChipZet(3); normVastzetten();
    return {voor, norm:bufferNorm(), vlg:bufferNormNext(),
      sub:(maandRegels().find(x=>x.key==='buffer')||{}).sub};
  });
  expect(r.voor.norm).toBe(NORM);
  expect(r.norm).toBe(NORM);            // de lopende maand is niet aangeraakt
  expect(r.vlg).toBe(3);
  expect(r.voor.sub).toContain('je norm: 2 maanden');
  expect(r.sub).toContain('je norm: 2 maanden');   // de bufferregel leest onveranderd de norm van NU
});

test('7c een EERSTE keuze geldt ook meteen, want zonder grens vraagt de regel erom', async ({page})=>{
  await boot(page, {set:{bufferNorm:undefined}});
  const r=await page.evaluate(()=>{
    const voor={norm:bufferNorm(), st:(maandRegels().find(x=>x.key==='buffer')||{}).status};
    normEigenOpen(); normKeuzeZet('5'); normVastzetten();
    return {voor, norm:bufferNorm(), vlg:bufferNormNext(),
      st:(maandRegels().find(x=>x.key==='buffer')||{}).status};
  });
  expect(r.voor.norm).toBeNull();            // de invoer: er was geen grens
  expect(r.voor.st).toBe('onbekend');
  expect(r.norm).toBe(5);                    // dus hij geldt ook deze maand
  expect(r.vlg).toBe(5);
  expect(r.st).not.toBe('onbekend');
});

test('7d de maandwissel draagt hem over, en gooit een ongeldige waarde weg', async ({page})=>{
  await boot(page);
  const r=await page.evaluate((vorig)=>{
    normChipZet(4); normVastzetten();
    const voor={norm:bufferNorm(), vlg:bufferNormNext()};
    SET.budgetMonth=vorig; save(); rolloverBudgets();
    const na={norm:bufferNorm(), vlg:bufferNormNext(), veld:SET.bufferNormNext,
      vlag:SET.bufferNormDoelVoor, maand:SET.budgetMonth};
    SET.bufferNormNext=0; SET.budgetMonth=vorig; save(); rolloverBudgets();
    return {voor, na, ongeldig:{norm:bufferNorm(), veld:SET.bufferNormNext}};
  }, VORIG);
  expect(r.voor).toEqual({norm:NORM, vlg:4});
  expect(r.na.norm).toBe(4);                 // na de wissel is de norm van volgende maand de norm
  expect(r.na.veld).toBeUndefined();         // en er staat niets meer klaar
  expect(r.na.vlag).toBeUndefined();         // de terugdraai-vlag hoort bij de maand die om is
  expect(r.ongeldig.norm).toBe(4);           // een nul is geen keuze en overschrijft niets
  expect(r.ongeldig.veld).toBeUndefined();
});

/* EEN EIGEN FIXTURE, en die is met twee metingen gekozen in plaats van met een.
   (1) MET HET DOEL VAN DE BASISFIXTURE IS `meevallerNodig('buffer')` NUL, want 3.000 toegewezen
   ligt boven 2 x 1.218. Een invariantie tussen twee nullen is niet van een invariantie te
   onderscheiden (meetles b), dus de toewijzing gaat omlaag tot hij positief is.
   (2) HET DOEL LIGT HOOG GENOEG OM NIET OPGETILD TE WORDEN (6 x 1.218), en dat is de scherpte van
   deze test: zie 7j, waar een OPTIL de teller in dezelfde maand wel verzet. Zonder die tweede
   meting zou deze test de norm en het doel door elkaar halen. */
test('7e de drie lezers van de norm oordelen over NU en gaan dus niet mee', async ({page})=>{
  await boot(page, {set:{nfToegewezen:2000, nfDoelVast:6*ESS}});
  const r=await page.evaluate(()=>{
    const voor={buffer:(maandRegels().find(x=>x.key==='buffer')||{}).waarde,
      mv:meevallerNodig('buffer'), drempel:beleggenDrempel(), drempelNext:beleggenDrempelNext(),
      tilt:normDoelVoorstel(6).tilt};
    normChipZet(6); normVastzetten();
    return {voor, buffer:(maandRegels().find(x=>x.key==='buffer')||{}).waarde,
      mv:meevallerNodig('buffer'), drempel:beleggenDrempel(), drempelNext:beleggenDrempelNext()};
  });
  expect(r.voor.mv).toBe(NORM*ESS-2000);
  expect(r.voor.mv).toBeGreaterThan(0);      // de invoer: er is werkelijk iets nodig
  expect(r.voor.tilt).toBe(false);           // en de invoer: deze keuze tilt het doel niet op
  expect(r.mv).toBe(r.voor.mv);              // meevallerNodig leest de norm van deze maand
  expect(r.buffer).toBe(r.voor.buffer);
  expect(r.voor.drempel).toBe(NORM);
  expect(r.drempel).toBe(NORM);              // beleggenDrempel ook
  expect(r.voor.drempelNext).toBe(NORM);
  expect(r.drempelNext).toBe(6);             // alleen de terugval vanaf volgende maand schuift
});

/* v315, DE GRENS VAN DE SAMENVATTING: niet de NORM beweegt deze maand, maar het DOEL, en alles wat
   uit dat doel volgt beweegt mee. `bufferTeller()` is de toewijzing GEKLEMD op het doel (v305,
   besluit 1), dus een doel dat omhoog gaat laat een toewijzing die erboven uitkwam weer meetellen.
   DAT IS GEMETEN EN GEEN BIJWERKING DIE OVER HET HOOFD IS GEZIEN: het staat hier als assertie zodat
   een volgende ronde niet denkt dat 'de lopende maand houdt zijn norm' ook over de teller gaat. */
test('7j een OPTIL verzet de teller wel in dezelfde maand, want dat is het doel en niet de norm', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    const voor={teller:bufferTeller(), doel:Math.round(noodfondsModel().doel), tilt:normDoelVoorstel(6).tilt};
    normChipZet(6); normVastzetten();
    return {voor, teller:bufferTeller(), doel:Math.round(noodfondsModel().doel),
      norm:bufferNorm(), vlg:bufferNormNext()};
  });
  expect(r.voor.tilt).toBe(true);
  expect(r.voor.teller).toBe(DOEL);          // geklemd op het doel van nu
  expect(r.doel).toBe(6*ESS);
  expect(r.teller).toBe(TOEGEWEZEN);         // de klem loopt terug, dus de teller gaat mee
  expect(r.norm).toBe(NORM);                 // en de GRENS blijft staan tot volgende maand
  expect(r.vlg).toBe(6);
});
test('7f met een eigen beleggingsdrempel schuift er niets mee', async ({page})=>{
  await boot(page, {set:{beleggenDrempel:8}});
  const r=await page.evaluate(()=>{
    normChipZet(6); normVastzetten();
    return {d:beleggenDrempel(), dn:beleggenDrempelNext(), vlg:bufferNormNext()};
  });
  expect(r.vlg).toBe(6);
  expect(r.d).toBe(8);
  expect(r.dn).toBe(8);                      // een eigen keuze heeft geen maanddimensie
});

test('7g het doel verschuift METEEN, en terugdraaien zet alle drie terug', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    normChipZet(6); normVastzetten();
    const na={norm:bufferNorm(), vlg:bufferNormNext(), doel:Math.round(noodfondsModel().doel),
      planDoel:Math.round(planMap()[PLAN_NF].doel)};
    normTerugdraaien();
    return {na, terug:{norm:bufferNorm(), vlg:bufferNormNext(), veld:SET.bufferNormNext,
      doel:Math.round(noodfondsModel().doel), vlag:SET.bufferNormDoelVoor}};
  });
  expect(r.na.doel).toBe(6*ESS);             // Plan rekent met het doel dat er nu staat
  expect(r.na.planDoel).toBe(6*ESS);
  expect(r.terug.doel).toBe(DOEL);
  expect(r.terug.norm).toBe(NORM);
  expect(r.terug.veld).toBeUndefined();
  expect(r.terug.vlag).toBeUndefined();
});

test('7h terugdraaien na een keuze ZONDER optil laat het doel staan', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    const V=normDoelVoorstel(2);
    normChipZet(2); normVastzetten();          // 2 maanden van 1218 ligt onder het doel van 3000
    const vlag=SET.bufferNormDoelVoor;
    const doelNa=Math.round(noodfondsModel().doel);
    normTerugdraaien();
    return {tilt:V.tilt, vlag, doelNa, doelTerug:Math.round(noodfondsModel().doel),
      doelVast:SET.nfDoelVast};
  });
  expect(r.tilt).toBe(false);                 // de invoer: deze keuze tilt niets op
  expect(r.vlag.tilt).toBe(false);
  expect(r.doelNa).toBe(DOEL);
  expect(r.doelTerug).toBe(DOEL);
  expect(Math.round(+r.doelVast)).toBe(DOEL); // en het doel is niet stil weggegooid
});

/* v315: DE `tilt`-VLAG IS NIET INERT, en dit is het geval dat dat laat zien. Bij een keuze ZONDER
   optil bewaart de vlag je doel van dat moment; zonder de guard zou terugdraaien dat oude doel
   terugzetten over een doel dat je daarna zelf hebt gewijzigd. Het pad is gewoon te lopen: kiezen,
   daarna je doel aanpassen, en dan de normkeuze terugdraaien. */
test('7k terugdraaien raakt een doel niet dat je na de keuze zelf hebt gewijzigd', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    normChipZet(2); normVastzetten();          // 2 x 1218 ligt onder het doel: geen optil
    const vlag=SET.bufferNormDoelVoor;
    setNfDoelVast(5000);
    const voor=Math.round(noodfondsModel().doel);
    normTerugdraaien();
    return {tilt:vlag.tilt, bewaard:vlag.doel, voor, na:Math.round(noodfondsModel().doel),
      norm:bufferNorm(), vlg:bufferNormNext()};
  });
  expect(r.tilt).toBe(false);
  expect(r.bewaard).toBe(DOEL);              // de vlag draagt het doel van toen
  expect(r.voor).toBe(5000);
  expect(r.na).toBe(5000);                   // en dat doel wordt niet over je eigen keuze gezet
  expect(r.norm).toBe(NORM);
  expect(r.vlg).toBe(NORM);                  // de grens is wel teruggedraaid
});
test('7i weghalen geldt meteen en haalt beide velden weg', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    normChipZet(6); normVastzetten();
    bufferNormWis();
    return {norm:bufferNorm(), vlg:bufferNormNext(), veld:SET.bufferNormNext,
      a:SET.bufferNorm, vlag:SET.bufferNormDoelVoor,
      st:(maandRegels().find(x=>x.key==='buffer')||{}).status, drempel:beleggenDrempel()};
  });
  expect(r.norm).toBeNull();
  expect(r.vlg).toBeNull();
  expect(r.veld).toBeUndefined();
  expect(r.a).toBeUndefined();
  expect(r.vlag).toBeUndefined();
  expect(r.st).toBe('onbekend');              // zonder grens meet de regel en oordeelt hij niet
  expect(r.drempel).toBeNull();
});

/* ===== 8) DE GEVOLGEN ===== */
test('8a de projectie komt uit planVooruit en schuift de doelen op', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    const G=normGevolgen(6);
    return {v:G.voorstel, nf:G.nf, gr:G.grendel, rij:G.rijen, plan:G.plan};
  });
  expect(r.v.tilt).toBe(true);
  expect(r.v.nu).toBe(DOEL);
  expect(r.v.naar).toBe(6*ESS);
  expect(r.plan).toBe(true);
  expect(r.nf.restVoor).toBe(0);              // op het doel van nu is de buffer vol
  expect(r.nf.restNa).toBe(6*ESS-TOEGEWEZEN);
  expect(r.gr.voor).toBe(0);                  // dus de grendel staat open
  expect(r.gr.na).toBeGreaterThan(0);         // en met deze norm weer dicht
  expect(r.rij.map(x=>x.naam)).toEqual(['Kosten Koper','Inrichting']);
  for(const x of r.rij) expect(x.na).toBeGreaterThan(x.voor);   // elk doel schuift op
});

test('8b de klem wordt per doel opnieuw gelegd, en dat is het verschil van 3.000', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    const nf=allocatePlan().find(p=>p.type==='noodfonds');
    const G=normGevolgen(6);
    return {gespaardNu:nf.gespaard, restNa:G.nf.restNa,
      klem:nfGespaardBij(6*1218), klemLaag:nfGespaardBij(3000), klemNul:nfGespaardBij(0),
      zonder:6*1218-nf.gespaard};
  });
  expect(r.gespaardNu).toBe(DOEL);                    // geklemd op het doel van NU
  expect(r.klem).toBe(TOEGEWEZEN);                    // bij een hoger doel loopt de klem terug
  expect(r.klemLaag).toBe(DOEL);
  expect(r.klemNul).toBe(TOEGEWEZEN);                 // geen doel: geen klem
  expect(r.restNa).toBe(6*ESS-TOEGEWEZEN);
  expect(r.zonder-r.restNa).toBe(TOEGEWEZEN-DOEL);    // precies wat de klem wegnam
});

/* EEN EIGEN FIXTURE, want op de basisfixture is dit geval INERT: daar ligt de toewijzing (6.000)
   boven elk doel dat 2 maanden zou geven, dus de buffer is in beide projecties al vol en lopen ze
   per constructie samen (meetles p). Met een toewijzing van NUL verschillen ze wel, en dan toetst
   `na === voor` werkelijk dat de projectie het doel van NU gebruikt en niet V.naar. */
test('8c zonder optil is de projectie per constructie gelijk, en zegt het blok dat in EEN regel', async ({page})=>{
  await boot(page, {set:{nfToegewezen:0, nfDoelVast:DOEL}});
  const r=await page.evaluate(()=>{
    const V=normDoelVoorstel(1), G=normGevolgen(1);
    const txt=normGevolgBlok(1).replace(/<[^>]+>/g,' ');
    const cap=planCapacity(), toe=nfGespaardBij(V.nu);
    return {tilt:V.tilt, nu:V.nu, naar:V.naar, txt, doelVast:Math.round(+SET.nfDoelVast||0),
      cap, toe, zouNu:Math.ceil((V.nu-toe)/cap), zouNaar:Math.ceil((V.naar-nfGespaardBij(V.naar))/cap),
      voor:JSON.stringify([G.nf.voor,G.nf.restVoor,G.grendel.voor,G.rijen.map(x=>x.voor)]),
      na:JSON.stringify([G.nf.na,G.nf.restNa,G.grendel.na,G.rijen.map(x=>x.na)])};
  });
  expect(r.tilt).toBe(false);
  expect(r.naar).toBeLessThan(r.nu);                  // een lagere norm verlaagt je doel NIET
  expect(r.doelVast).toBe(DOEL);
  /* DE INVOER: op DIT doel lopen de twee projecties werkelijk uiteen, dus `na === voor` hieronder
     kan alleen waar zijn doordat de projectie het doel van NU neemt (meetles a). */
  expect(r.zouNaar).not.toBe(r.zouNu);
  expect(r.na).toBe(r.voor);                          // dus beide projecties lopen op hetzelfde doel
  expect(r.txt).toContain('Je plan');
  expect(r.txt).toContain('verandert hier niet van');
  expect(r.txt).not.toContain('Buffer vol');          // geen vier tautologische rijen
  expect(r.txt).not.toContain('Verdelen');
  expect(r.txt).not.toContain('Kosten Koper');
});

test('8d de gevolgen rekenen mee met een EIGEN aantal', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    openNoodfondsPanel();
    normEigenOpen(); normKeuzeZet('7');
    const t=document.getElementById('sheet').innerText;
    return {t, G:normGevolgen(7).voorstel, veld:document.getElementById('bufferNorm').value};
  });
  expect(r.veld).toBe('7');
  expect(r.G.naar).toBe(7*ESS);
  expect(r.t).toContain(`€${(7*ESS).toLocaleString('nl-NL')}`);
  expect(r.t).toContain('Kosten Koper');
});

test('8e twee knoppen, geen default, en het veld als derde optie', async ({page})=>{
  await boot(page, {set:{bufferNorm:undefined}});
  const r=await page.evaluate(()=>{
    openNoodfondsPanel();
    const chips=()=>[...document.querySelectorAll('#bufferNormChips .chip')].map(c=>
      ({t:c.innerText.trim(), on:c.classList.contains('on')}));
    const leeg=chips(), veld0=!!document.getElementById('bufferNorm');
    normChipZet(3); const na3=chips();
    normEigenOpen(); const open=chips(), veld1=!!document.getElementById('bufferNorm');
    return {leeg, veld0, na3, open, veld1};
  });
  expect(r.leeg.map(c=>c.t)).toEqual(['2 maanden','3 maanden','ander aantal']);
  expect(r.leeg.filter(c=>c.on).length).toBe(0);       // zonder gekozen norm staat er geen aan
  expect(r.veld0).toBe(false);
  expect(r.na3.find(c=>c.t==='3 maanden').on).toBe(true);
  expect(r.na3.find(c=>c.t==='2 maanden').on).toBe(false);
  expect(r.veld1).toBe(true);
  expect(r.open.map(c=>c.t).join('|')).not.toContain('ander aantal');
});

test('8f een eigen getal houdt het veld open, ook zonder tik', async ({page})=>{
  await boot(page, {set:{bufferNorm:4}});
  const r=await page.evaluate(()=>{
    openNoodfondsPanel();
    return {veld:document.getElementById('bufferNorm').value,
      on:[...document.querySelectorAll('#bufferNormChips .chip')].filter(c=>c.classList.contains('on')).length};
  });
  expect(r.veld).toBe('4');
  expect(r.on).toBe(1);
});

test('8g zonder bekende toewijzing is er geen projectie', async ({page})=>{
  await boot(page, {set:{nfToegewezenMigrated:undefined, manualBal:{[MAIN]:3000,[RES]:500}}});
  const r=await page.evaluate(()=>{
    const G=normGevolgen(6);
    return {onb:G.onbekend, plan:G.plan, rij:G.rijen.length,
      txt:normGevolgBlok(6).replace(/<[^>]+>/g,' ')};
  });
  expect(r.onb).toBe(true);
  expect(r.plan).toBe(false);
  expect(r.txt).toContain('niet door te rekenen');
  expect(r.txt).not.toContain('Buffer vol');
});

test('8h de afspraak staat er alleen als hij over je buffer gaat', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    const mk=(regel)=>{ SET.coachLog=[{type:'afspraak', ts:Date.now(), regel, text:'ik verhoog mijn inleg'}]; save(); };
    mk('doel'); const a=normGevolgBlok(6).replace(/<[^>]+>/g,' ');
    mk('buffer'); const b=normGevolgBlok(6).replace(/<[^>]+>/g,' ');
    return {a,b};
  });
  expect(r.a).not.toContain('Je afspraak');
  expect(r.b).toContain('Je afspraak');
  expect(r.b).toContain('ik verhoog mijn inleg');
});

test('8i de rij noemt wanneer de grens geldt, en bij een eerste keuze dat hij meteen geldt', async ({page})=>{
  await boot(page);
  const a=await page.evaluate((v)=>{ openNoodfondsPanel(); normChipZet(3);
    return document.getElementById('sheet').innerText; }, VOLGENDE);
  const vol=await page.evaluate(()=>ymFull(nextYM(SET.budgetMonth||thisYM())));
  expect(a).toContain(`vanaf ${vol} gelden`);
  expect(a).toContain(`Deze maand blijft op ${NORM} maanden staan`);
  await boot(page, {set:{bufferNorm:undefined}});
  const b=await page.evaluate(()=>{ openNoodfondsPanel(); normEigenOpen(); normKeuzeZet('3');
    return document.getElementById('sheet').innerText; });
  expect(b).toContain('meteen gelden');
  expect(b).not.toContain('Deze maand blijft op');
});

/* ===== 9) DE KAART 'VANAF <MAAND>' ===== */
test('9a zonder wijziging is er geen kaart', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{ go('maand');
    return {n:maandVanafRegels().length, kaart:maandVanafKaart(),
      txt:document.getElementById('s-maand').innerText}; });
  expect(r.n).toBe(0);
  expect(r.kaart).toBe('');
  expect(r.txt.toUpperCase()).not.toContain('VANAF ');
});

test('9b drie rijen, elk alleen als er iets verandert', async ({page})=>{
  await boot(page, {set:{budgetsNext:{huur:900,boodschappen:450,vervoer:150}}});
  const r=await page.evaluate(()=>{
    const potjes=maandVanafRegels().length;
    normChipZet(6); normVastzetten();
    go('maand');
    const txt=document.getElementById('s-maand').innerText;
    return {potjes, n:maandVanafRegels().length, txt, vol:ymFull(nextYM(SET.budgetMonth||thisYM()))};
  });
  expect(r.potjes).toBe(1);                   // de potjes-rij stond er al
  expect(r.n).toBe(3);                        // norm en drempel komen erbij
  expect(r.txt.toUpperCase()).toContain('VANAF '+r.vol.toUpperCase());
  expect(r.txt).toContain('Je potjes');
  expect(r.txt).toContain('Ondergrens voor je buffer');
  expect(r.txt).toContain('Buffer die je wilt voor beleggen');
  expect(r.txt).toContain('volgt je ondergrens');
});

test('9c met een eigen beleggingsdrempel blijft die rij weg', async ({page})=>{
  await boot(page, {set:{beleggenDrempel:8}});
  const r=await page.evaluate(()=>{
    normChipZet(6); normVastzetten(); go('maand');
    return {n:maandVanafRegels().length, txt:document.getElementById('s-maand').innerText};
  });
  expect(r.n).toBe(1);
  expect(r.txt).toContain('Ondergrens voor je buffer');
  expect(r.txt).not.toContain('Buffer die je wilt voor beleggen');
});

test('9d de potjes-rij is VERHUISD en staat precies een keer op Grip', async ({page})=>{
  await boot(page, {set:{budgetsNext:{huur:900,boodschappen:450,vervoer:150}}});
  const r=await page.evaluate(()=>{ go('maand');
    const t=document.getElementById('s-maand').innerText;
    const kaarten=[...document.querySelectorAll('#s-maand .card')].map(c=>c.innerText);
    return {n:(t.match(/Je potjes/g)||[]).length,
      inVanaf:kaarten.filter(c=>/VANAF /i.test(c)&&/Je potjes/.test(c)).length,
      inRegels:kaarten.filter(c=>/STAAT GOED|VRAAGT /i.test(c)&&/Je potjes/.test(c)).length,
      voet:typeof window.maandVoetBlok, plan:typeof window.maandPlanRegels};
  });
  expect(r.n).toBe(1);
  expect(r.inVanaf).toBe(1);
  expect(r.inRegels).toBe(0);                 // niet meer onder een streep in de regelkaart
  expect(r.voet).toBe('undefined');           // de voet is met de verhuizing vervallen
  expect(r.plan).toBe('undefined');
});

/* ===== 10) DE UITKOMST IN HET LOGBOEK ===== */
test('10a een bijgesteld potje wordt tegen het OORSPRONKELIJKE potje gelezen', async ({page})=>{
  await boot(page, {set:{valtOpLog:LOG()}});
  const r=await page.evaluate((v)=>{
    const rec=SET.valtOpLog[v+'|boodschappen'];
    return {over:rec.over_eind_maand, orig:rec.over_oorspronkelijk, lat:rec.potje_bij_detectie,
      na:rec.potje_na, uit:valtOpUitkomst(rec), sp:Math.round(catSpendMap(v).boodschappen||0)};
  }, VORIG);
  expect(r.sp).toBe(UITGAVE_VORIG);
  expect(r.over).toBe(0);                     // tegen het BIJGESTELDE potje was er niets over
  expect(r.orig).toBe(UITGAVE_VORIG-POTJE_ORIG);
  expect(r.uit).toBe(`eindigde €150 boven je oorspronkelijke potje van €${POTJE_ORIG}`);
  /* EN HIJ IS NIET UIT over_eind_maand AF TE LEIDEN, en dat is de reden dat het een eigen veld is:
     die staat op NUL omdat hij geklemd is, dus de enige plausibele afleiding
     (over_eind_maand plus het verschil tussen de twee latten) komt op 200 uit en niet op 150. */
  expect(r.over).toBe(0);
  expect(r.orig).toBe(r.sp-r.lat);            // EEN uitgave, gemeten tegen de oorspronkelijke lat
  expect(r.over+(r.na-r.lat)).not.toBe(r.orig);
});

/* DE BEKENDE BOEKINGEN KOMEN UIT DE PAGINA, want `categorize()` herschrijft elke `t.id` bij de
   boot (v281) en in Node is die id dus niet te kennen. De test zet daarom het record met de
   ECHTE id van de eerste boeking en laat `valtOpAfsluiten()` zelf tellen. */
test('10b de telling van een grens landt in het record, en slaat de bekende boekingen over', async ({page})=>{
  await boot(page);
  const r=await page.evaluate((v)=>{
    const bk=txOfMonth(v).filter(t=>catOf(t)==='vervoer'&&t.amount<0)
      .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
    SET.valtOpLog={[v+'|vervoer']:{maand:v, potjeId:'vervoer', categorie:'Vervoer & auto',
      potje_bij_detectie:100, getoond:true, actie:'grens_gezet', actie_op:v+'-22',
      grens_stand:120, grens_bekend:[bk[0].id]}};
    save(); valtOpAfsluiten();
    const rec=SET.valtOpLog[v+'|vervoer'];
    return {na:rec.grens_na, uit:valtOpUitkomst(rec),
      boekingen:bk.length, bedragen:bk.map(t=>-t.amount)};
  }, VORIG);
  expect(r.boekingen).toBe(2);                // de invoer: twee boekingen, waarvan er een bekend is
  expect(r.bedragen).toEqual([120,40]);
  expect(r.na).toEqual({n:1, bedrag:40});     // alleen wat er NA de grens bij kwam
  expect(r.uit).toBe('daarna nog 1 boeking voor €40');
});

test('10c een record van voor deze ronde noemt de lat die hij wel heeft', async ({page})=>{
  const oud={...LOG()};
  oud[VORIG+'|boodschappen']={...oud[VORIG+'|boodschappen'], over_eind_maand:0};
  oud[VORIG+'|vervoer']={...oud[VORIG+'|vervoer'], over_eind_maand:20, grens_bekend:undefined};
  await boot(page, {set:{valtOpLog:oud}});
  const r=await page.evaluate((v)=>{
    const a=SET.valtOpLog[v+'|boodschappen'], b=SET.valtOpLog[v+'|vervoer'];
    return {aOrig:a.over_oorspronkelijk, aUit:valtOpUitkomst(a),
      bNa:b.grens_na, bUit:valtOpUitkomst(b)};
  }, VORIG);
  expect(r.aOrig).toBeUndefined();            // de afsluiting was al gedaan, dus geen nieuw veld
  expect(r.aUit).toBe('bleef binnen je bijgestelde potje');
  expect(r.bNa).toBeUndefined();
  expect(r.bUit).toBe('eindigde €20 boven je potje');
});

test('10d zo gelaten en niets gedaan lezen tegen het potje, een correctie zwijgt', async ({page})=>{
  const L=LOG({
    [VORIG+'|uiteten']:{maand:VORIG,potjeId:'uiteten',categorie:'Uit eten',potje_bij_detectie:100,
      getoond:true,actie:'zo_gelaten',actie_op:VORIG+'-22'},
    [VORIG+'|shopping']:{maand:VORIG,potjeId:'shopping',categorie:'Online shopping',
      potje_bij_detectie:50,getoond:true,actie:'correctie',correctie_bedrag:80,over_eind_maand:0},
  });
  await boot(page, {set:{valtOpLog:L, budgets:{huur:900,boodschappen:400,vervoer:150,uiteten:100,shopping:50}}});
  const r=await page.evaluate((v)=>{
    const z=SET.valtOpLog[v+'|uiteten'], c=SET.valtOpLog[v+'|shopping'];
    return {z:{over:z.over_eind_maand, actie:z.actie, uit:valtOpUitkomst(z)},
      c:{uit:valtOpUitkomst(c)},
      txt:(go('maand'), document.getElementById('s-maand').innerText)};
  }, VORIG);
  expect(r.z.actie).toBe('zo_gelaten');       // de keuze blijft staan, de uitkomst komt erbij
  expect(r.z.uit).toMatch(/^(eindigde €\d+ boven je potje|eindigde binnen je potje)$/);
  expect(r.c.uit).toBe('');                   // 'vervallen na correctie' zegt het al
  expect(r.txt).toContain('zo gelaten');
});

test('10e de lopende maand noemt wanneer de uitkomst er is', async ({page})=>{
  await boot(page, {set:{valtOpLog:LOG()}});
  const r=await page.evaluate((m)=>{
    const rec=SET.valtOpLog[m+'|boodschappen'];
    return {uit:valtOpUitkomst(rec), dim:daysElapsed(m).dim, maand:ymFull(m),
      over:rec.over_eind_maand};
  }, THIS);
  expect(r.over).toBeUndefined();             // een lopende maand is niet afgesloten
  expect(r.uit).toBe(`uitkomst na ${r.dim} ${r.maand}`);
});

/* v325: DE UITKOMSTREGEL HOORT NU BIJ DE LOPENDE MAAND. Een afgesloten maand staat sinds v325 onder
   een kop met wat hij boven je potjes eindigde, en zijn regels staan kort: naam, handeling, en rechts
   het bedrag erboven of het woord. Dat bedrag is `over_eind_maand`, dus tegen de lat van die maand;
   de meting tegen het OORSPRONKELIJKE potje blijft in het record en in `valtOpUitkomst()` (10a). */
test('10f de lopende maand houdt zijn uitkomstregel, een afgesloten maand staat kort onder zijn kop', async ({page})=>{
  await boot(page, {set:{valtOpLog:LOG()}});
  const r=await page.evaluate((v)=>{ go('maand');
    const kaart=document.querySelector('#valtOpLog');
    const blok=kaart.querySelector(`.vl-maand[data-maand="${v}"]`);
    const rij=k=>{ const e=blok.querySelector(`.vl-rij[data-id="${v}|${k}"]`); return e?e.textContent.replace(/\s+/g,' ').trim():''; };
    // de kop zegt 'eindigde(n) erboven'; een uitkomstzin noemt een bedrag of 'binnen'
    return {n:(kaart.innerText.match(/eindigde (€|binnen)|daarna|uitkomst na/g)||[]).length,
      uitkomstNa:/uitkomst na/.test(kaart.innerText), boodschappen:rij('boodschappen'), kop:!!blok.querySelector('[data-maandboven]')};
  }, VORIG);
  expect(r.n).toBe(1);                        // alleen de lopende maand draagt nog een uitkomstzin
  expect(r.uitkomstNa).toBe(true);
  expect(r.kop).toBe(true);
  expect(r.boodschappen).toContain('potje bijgesteld');
  expect(r.boodschappen).toContain('binnen');   // tegen het bijgestelde potje, de lat van die maand
});

test('10g de grens schrijft zijn meetlat in het record', async ({page})=>{
  await boot(page);
  const r=await page.evaluate(()=>{
    go('maand');
    const S=valtOpSignals(thisYM()); const id=S[0].id;
    valtOpGrensZet(id);
    const rec=SET.valtOpLog[id];
    return {actie:rec.actie, stand:rec.grens_stand, bekend:(rec.grens_bekend||[]).length,
      uitGrens:(SET.valtOpGrens||{}).boodschappen};
  });
  expect(r.actie).toBe('grens_gezet');
  expect(r.stand).toBe(484);
  expect(r.bekend).toBeGreaterThan(0);        // de boekingen die er toen al waren
  expect(r.stand).toBe(r.uitGrens.stand);     // dezelfde meetlat, uit dezelfde bron
});

/* ===== e) DE BRON EN DE PRIJS ===== */
test('e1 valtOpUitkomst is de ene bron, en de log leidt er niets zelf uit af', async ({page})=>{
  await boot(page, {set:{valtOpLog:LOG()}});
  const src=await kaalUit(page, 'valtOpLogBlok');
  expect(src).toContain('valtOpUitkomst(r)');
  expect(src).not.toContain('over_oorspronkelijk');
  expect(src).not.toContain('grens_na');
  expect(src).not.toContain('catSpendMap');
});

test('e2 de afsluiting meet EEN uitgave tegen twee latten, uit EEN catSpendMap-aanroep', async ({page})=>{
  await boot(page);
  const src=await kaalUit(page, 'valtOpAfsluiten');
  expect((src.match(/catSpendMap\(/g)||[]).length).toBe(1);
  expect(src).toContain('over_oorspronkelijk');
});

test('e3 de klem staat op een plek, met twee lezers', async ({page})=>{
  await boot(page);
  const [pm, ng] = await Promise.all([kaalUit(page,'planMap'), kaalUit(page,'normGevolgen')]);
  expect(pm).toContain('nfGespaardBij(');
  expect(ng).toContain('nfGespaardBij(');
  expect(pm).not.toContain('Math.min(nfToe,nfDoel)');
  expect(ng).not.toContain('Math.min(');
});

test('e4 de gevolgen lenen de projectie en rekenen hem niet na', async ({page})=>{
  await boot(page);
  const src=await kaalUit(page, 'normGevolgen');
  expect(src).toContain('planVooruit(');
  expect(src).toContain('planGrendelVan(');
  expect(src).toContain('allocatePlan()');
  expect(src).not.toContain('planVerdeelMaand(');   // de verdeling zelf wordt niet herhaald
});

/* ===== p) DE PRIJS IN PIXELS, als assertie en niet als console-regel, zodat een volgende ronde
   ziet wat hij uitgeeft. GRIP HEEFT GEEN 200px-EIS: die van v241 is de stand-kaart op Inzichten.
   DE UITKOMST-REGEL KOST 17px, en dat is gemeten met een record dat er WEL een draagt naast een
   record dat er GEEN draagt (een correctie), op precies dezelfde kaart. Zonder dat paar is 'de
   regel kost iets' niet van 'de kaart is hoger geworden' te onderscheiden.
   OP 360px IS DAT PAAR GEEN METING, en dat staat erbij in plaats van dat het wordt weggerekend: de
   vergelijkingsrij draagt rechts 'vervallen na correctie' en dat breekt daar over twee regels
   (51px tegen 32px op 390px). Het verschil zou dan de AFBREKING meten en niet de nieuwe regel.
   Beide hoogtes staan er wel, want de kaart wordt op beide breedtes gemeten. */
/* v315, de reparatie uit ronde A: DE VIERDE TELLER KOST 19px OP 390px EN NUL OP 360px, en dat is
   GEMETEN op precies deze stand en niet geschat. De telregel is op beide breedtes 75px (vijf regels
   van 15); zonder 'volgende maand anders' erin is hij 75px op 360 en 56px op 390. Op 360 liep hij
   dus al over vijf regels en paste de vierde teller binnen die vijf; op 390 kwam er een regel bij.
   De kaart gaat daarmee van 373 naar 373px en van 317 naar 336px. */
/* v320: `vanaf` was 250/232 en dat was de kaart 'Vraagt een beslissing', niet de vanaf-kaart; zie
   de reden bij de selector hieronder. De vanaf-kaart is 231/216px, en dat is in v319 EN v320
   gemeten, dus deze ronde heeft hem niet verschoven. */
/* v325: HET LOGBOEK GAAT VAN 373 NAAR 583px OP 360 EN VAN 336 NAAR 549px OP 390, GEMETEN op deze
   stand. Wat erbij kwam is de maandkop van de afgesloten maand, de vraag over de grootste afwijking
   (die vraagkaart is het grootste deel) en de regel over wanneer de tegels komen. De uitkomstregel
   van v315 staat alleen nog bij de lopende maand, dus het paar met en zonder uitkomst is vervallen. */
const PX={360:{vanaf:231, log:583, tel:75, metUit:49},
          390:{vanaf:216, log:549, tel:75, metUit:49}};
for (const [w,h] of [[360,640],[390,844]]) {
  test(`p${w} de prijs in pixels van de vanaf-kaart en de uitkomst-regel`, async ({page})=>{
    await page.setViewportSize({width:w, height:h});
    const L=LOG({
      [VORIG+'|shopping']:{maand:VORIG,potjeId:'shopping',categorie:'Online shopping',
        potje_bij_detectie:50,getoond:true,actie:'correctie',correctie_bedrag:80,over_eind_maand:0},
    });
    await boot(page, {set:{valtOpLog:L, budgetsNext:{huur:900,boodschappen:450,vervoer:150}}});
    const r=await page.evaluate(()=>{
      normChipZet(6); normVastzetten(); closeSheet(); go('maand');
      /* v320: deze selector las `c.innerText` en pakte daarmee de EERSTE kaart waarin het woord
         ergens voorkwam. GEMETEN dat dat de verkeerde kaart was: de gevolgzin van een doel achter
         de grendel zegt 'je hebt vanaf mrt 2027 EUR X nodig', en die zin stond tot v320 in de kaart
         'Vraagt een beslissing'. Die kaart werd dus gemeten (250/232px) en de vanaf-kaart niet
         (231/216px, in beide versies), en het getal uit die meting is als 'de vanaf-kaart' in
         CLAUDE.md beland. Nu bindt hij op de KOP, en de assertie eronder zegt welke kop dat was. */
      const kaart=n=>[...document.querySelectorAll('#s-maand .card')]
        .find(c=>n.test(((c.querySelector('.hlabel')||{}).textContent||'').trim()));
      const va=kaart(/^Vanaf /i), lg=kaart(/overschrijdingen/i);
      const hh=e=>e?Math.round(e.getBoundingClientRect().height):0;
      // een logrij is te herkennen aan zijn genestelde .row; de telzin onderaan heeft die niet
      const rijen=[...lg.children].filter(c=>c.tagName==='DIV'&&c.querySelector(':scope > .row'));
      const uit=rijen.filter(c=>/eindigde|daarna|uitkomst na/.test(c.innerText));
      const zonder=rijen.filter(c=>!/eindigde|daarna|uitkomst na/.test(c.innerText));
      return {vaLab:((va.querySelector('.hlabel')||{}).textContent||'').trim(),
        lgLab:((lg.querySelector('.hlabel')||{}).textContent||'').trim(),
        vanaf:hh(va), log:hh(lg), tel:hh(lg.lastElementChild),
        metUit:uit.map(hh), zonderUit:zonder.map(hh),
        nUit:uit.length, nZonder:zonder.length};
    });
    const p=PX[w];
    /* v325: alleen de LOPENDE maand draagt nog een uitkomstregel. De afgesloten records (ook de
       correctie) staan kort onder hun maandkop, dus het paar met en zonder uitkomst bestaat niet meer. */
    expect(r.nUit).toBe(1);
    expect(r.nZonder).toBe(0);
    expect(r.vaLab, 'en het is werkelijk de vanaf-kaart die gemeten wordt').toMatch(/^Vanaf /i);
    expect(r.lgLab).toMatch(/overschrijdingen/i);
    expect(r.vanaf).toBe(p.vanaf);
    expect(r.log).toBe(p.log);
    expect(r.tel, 'de telregel, waar de vierde handeling van v315 in landt').toBe(p.tel);
    expect(Math.min(...r.metUit)).toBe(p.metUit);
  });
}
