/* v325: HET LOGBOEK OP GRIP PER AFGESLOTEN MAAND, MET EEN VRAAG EN LATER WAT BIJ JOU WERKT.
   DE FIXTURE IS SEPTEMBER VAN HET TOESTEL, zoals gemeld: Uit eten +194 met een grens, Boodschappen
   +84 zonder handeling, Sport bijgesteld en binnen, Vervoer grens en binnen, Belasting zonder
   handeling en binnen, Overig vervallen na correctie. De klok staat op 3 oktober 2026, zodat de
   maandsleutels vast zijn (v299/v310) en september de enige afgesloten maand is.
   DE RECORDS DRAGEN HUN AFSLUITING AL (`over_eind_maand`), dus `valtOpAfsluiten()` raakt ze niet
   en de uitkomst hangt niet aan boekingen die deze fixture niet draagt. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN='NL01MAIN0000001111';
const NU='2026-10-03', OKT='2026-10', SEP='2026-09', AUG='2026-08', JUL='2026-07';

const R=(m,k,naam,o)=>Object.assign({id:m+'|'+k, maand:m, potjeId:k, categorie:naam,
  potje_bij_detectie:100, over_bij_detectie:40, getoond:true}, o);
const SEPTEMBER=()=>[
  R(SEP,'uiteten','Uit eten & café',{actie:'grens_gezet', over_eind_maand:194, over_oorspronkelijk:194, grens_na:{n:3,bedrag:120}}),
  R(SEP,'boodschappen','Boodschappen',{actie:'geen', over_eind_maand:84, over_oorspronkelijk:84}),
  R(SEP,'sport','Sport & gezondheid',{actie:'potje_bijgesteld', potje_bij_detectie:50, potje_voor:50, potje_na:96, over_eind_maand:0, over_oorspronkelijk:40}),
  R(SEP,'vervoer','Vervoer & auto',{actie:'grens_gezet', over_eind_maand:0, over_oorspronkelijk:0, grens_na:{n:0,bedrag:0}}),
  R(SEP,'belasting','Belasting & boetes',{actie:'geen', over_eind_maand:0, over_oorspronkelijk:0}),
  R(SEP,'overig','Overig',{actie:'correctie', correctie_bedrag:300, over_eind_maand:0, over_oorspronkelijk:0}),
];
const map=recs=>Object.fromEntries(recs.map(r=>[r.id,r]));

function seed(log, extra={}){
  const tx=[]; let i=0;
  const add=(d,a,n,ds)=>tx.push({id:'x'+(i++),date:d,amount:a,acc:MAIN,name:n,desc:ds,typ:'',ref:'',src:'csv',accName:'',refNums:[]});
  for(const m of [JUL,AUG,SEP,OKT]){ add(m+'-01',3000,'Werkgever','SALARIS LOON'); add(m+'-02',-200,'Albert Heijn','BEA, BETAALPAS ALBERT HEIJN'); }
  const set=Object.assign({mode:'begeleid',autoIncome:false,income:3000,limit:70,manualBal:{[MAIN]:2000},
    budgets:{boodschappen:400,uiteten:150,sport:96,vervoer:150,belasting:50,overig:100},
    budgetMonth:OKT, valtOpLog:map(log)}, extra);
  return {minder_tx:JSON.stringify(tx), minder_ovr:'{}', minder_set:JSON.stringify(set),
    minder_own:JSON.stringify([MAIN]), minder_accmeta:'{}', minder_plan:'{}'};
}
async function boot(page, log, extra){
  await pinDatum(page, NU);
  await page.addInitScript(s=>{for(const k in s)localStorage.setItem(k,s[k]);}, seed(log, extra));
  await page.goto('/index.html');
  await page.waitForFunction(()=>typeof window.renderMaand==='function');
  await page.evaluate(()=>go('maand'));
}
const lees=page=>page.evaluate(()=>{
  const k=document.querySelector('#valtOpLog'); if(!k) return null;
  const t=e=>e?e.innerText.replace(/\s+/g,' ').trim():'';
  const maanden=[...k.querySelectorAll('.vl-maand')].map(b=>({
    maand:b.dataset.maand, kop:+b.querySelector('[data-maandboven]').dataset.maandboven,
    kopTekst:t(b.querySelector('.vl-kop')),
    rijBoven:[...b.querySelectorAll('[data-boven]')].map(e=>+e.dataset.boven),
    vraag:b.querySelector('[data-vraag]')?b.querySelector('[data-vraag]').dataset.vraag:null,
    vraagTekst:t(b.querySelector('[data-vraag]')),
    antwoorden:[...b.querySelectorAll('[data-antwoord]')].map(e=>({id:e.dataset.antwoord, t:t(e)})),
    chips:[...b.querySelectorAll('.vl-vraag .vl-chip')].map(e=>t(e)),
    rest:t(b.querySelector('.vl-rest summary')),
    restRijen:[...b.querySelectorAll('.vl-rest .vl-rij')].map(e=>[...e.querySelectorAll('.vl-naam, .vl-hand, .vl-bedrag, .vl-woord')].filter(x=>!x.classList.contains('vl-naam')).reduce((a,x)=>a+' '+x.textContent, e.querySelector('.vl-naam').firstChild.textContent).replace(/\s+/g,' ').trim()),
    lijst:[...b.querySelectorAll('.vl-lijst .vl-rij')].map(e=>t(e)),
  }));
  return {maanden, alles:t(k), note:t(k.querySelector('.vl-note')),
    trend:!!k.querySelector('.vl-trend'), trendN:k.querySelector('.vl-trend')?+k.querySelector('.vl-trend').dataset.trend:0,
    mlab:t(k.querySelector('.vl-mlab')),
    tegels:[...k.querySelectorAll('[data-tegel]')].map(e=>({a:e.dataset.tegel, t:t(e), in:e.querySelectorAll('.vl-seg i.vl-in').length, n:e.querySelectorAll('.vl-seg i').length})),
    patroon:t(k.querySelector('[data-patroon]'))};
});

/* ===== a) STAND 1: OKTOBER ===== */
test('a1 de kop is de som van precies de bedragen die de regels eronder tonen', async ({page})=>{
  await boot(page, SEPTEMBER());
  const r=await lees(page);
  expect(r.maanden.length).toBe(1);
  const s=r.maanden[0];
  expect(s.maand).toBe(SEP);
  expect(s.kop).toBe(278);
  expect(s.kopTekst).toContain('€278');
  expect(s.kopTekst).toContain('boven je potjes');
  // de bedragen op het scherm: de vraag (194) en de korte rij (84), en samen de kop
  const opScherm=s.rijBoven.concat(s.chips.map(c=>+c.replace(/\D/g,'')));
  expect(opScherm.sort((a,b)=>a-b)).toEqual([84,194]);
  expect(opScherm.reduce((a,b)=>a+b,0)).toBe(s.kop);
});

test('a2 vervallen telt niet mee in de noemer: 2 van de 5', async ({page})=>{
  await boot(page, SEPTEMBER());
  const s=(await lees(page)).maanden[0];
  expect(s.kopTekst).toContain('2 van de 5 potjes met een signaal eindigden erboven.');
  expect(s.kopTekst).not.toContain('van de 6');
});

test('a3 de vraag gaat over de grootste afwijking, en de zin volgt de handeling', async ({page})=>{
  await boot(page, SEPTEMBER());
  const s=(await lees(page)).maanden[0];
  expect(s.vraag).toBe(SEP+'|uiteten');
  expect(s.vraagTekst).toContain('Uit eten & café bleef ook met een grens boven je potje.');
  expect(s.vraagTekst).toContain('Potje past niet');
  expect(s.vraagTekst).toContain('Uitzondering');
  expect(s.chips).toEqual(['€194 boven']);
});

test('a4 de rest staat kort: boven met bedrag, binnen en vervallen ingeklapt', async ({page})=>{
  await boot(page, SEPTEMBER());
  const s=(await lees(page)).maanden[0];
  expect(s.lijst).toEqual(['Boodschappen niets gedaan +€84']);
  expect(s.rest).toBe('4 binnen of vervallen ›');
  expect(s.restRijen).toEqual([
    'Belasting & boetes niets gedaan binnen',
    'Overig vervallen na correctie vervallen',
    'Sport & gezondheid potje bijgesteld · €50 → €96 binnen',
    'Vervoer & auto grens gezet binnen',
  ]);
});

test('a5 na een maand staat de regel over december, en geen trend, tegels of patroon', async ({page})=>{
  await boot(page, SEPTEMBER());
  const r=await lees(page);
  expect(r.note).toBe('Na 1 maand. Vanaf december staat hier ook wat bij jou werkt.');
  expect(r.trend).toBe(false);
  expect(r.tegels).toEqual([]);
  expect(r.patroon).toBe('');
});

test('a6 de lopende maand blijft zoals hij was, met uitkomst na de einddatum', async ({page})=>{
  const log=SEPTEMBER().concat([R(OKT,'uiteten','Uit eten & café',{actie:null, over_eind_maand:null})]);
  await boot(page, log);
  const r=await lees(page);
  expect(r.alles).toContain('Uit eten & café · oktober 2026');
  expect(r.alles).toContain('uitkomst na 31 oktober');
  expect(r.maanden.map(m=>m.maand)).toEqual([SEP]);   // de lopende maand krijgt geen kop
});

/* ===== b) STAND 2: NA JE ANTWOORD ===== */
test('b1 het antwoord staat op het record met keuze en datum, en de vraag gaat naar Boodschappen', async ({page})=>{
  await boot(page, SEPTEMBER());
  await page.locator('[data-vraag] button', {hasText:'Uitzondering'}).click();
  const rec=await page.evaluate(id=>SET.valtOpLog[id].antwoord, SEP+'|uiteten');
  expect(rec).toEqual({keuze:'uitzondering', op:NU});
  const s=(await lees(page)).maanden[0];
  expect(s.vraag).toBe(SEP+'|boodschappen');
  expect(s.vraagTekst).toContain('Boodschappen ging boven je potje, zonder dat je iets deed.');
  // de beantwoorde kaart blijft staan, gedempt, met het antwoord
  expect(s.antwoorden.length).toBe(1);
  expect(s.antwoorden[0].id).toBe(SEP+'|uiteten');
  expect(s.antwoorden[0].t).toContain('Uitzondering');
  expect(s.antwoorden[0].t).toContain('3 okt');
  expect(await page.locator('[data-antwoord]').evaluate(e=>e.classList.contains('vl-dim'))).toBe(true);
  // de kop verandert niet door een antwoord
  expect(s.kop).toBe(278);
  // Boodschappen is nu de vraag en staat dus niet meer als korte rij
  expect(s.lijst).toEqual([]);
});

test('b2 "Potje past niet" opent de route volgende maand anders voor dat potje', async ({page})=>{
  await boot(page, SEPTEMBER());
  await page.locator('[data-vraag] button', {hasText:'Potje past niet'}).click();
  const r=await page.evaluate(id=>({a:SET.valtOpLog[id].antwoord, sheet:document.querySelector('#sheet').innerText}), SEP+'|uiteten');
  expect(r.a).toEqual({keuze:'past_niet', op:NU});
  expect(r.sheet).toContain('Uit eten & café-potje');
  // de editor schrijft de maand erna, en het potje van deze maand blijft staan
  await page.evaluate(()=>{ potDraftSet('vast', 220); savePotje('uiteten'); });
  const b=await page.evaluate(()=>({nu:SET.budgets.uiteten, vlg:(SET.budgetsNext||{}).uiteten}));
  expect(b).toEqual({nu:150, vlg:220});
});

test('b3 een vraag tegelijk, ook met twee onbeantwoorde afwijkingen', async ({page})=>{
  await boot(page, SEPTEMBER());
  expect(await page.locator('[data-vraag]').count()).toBe(1);
  await page.evaluate(id=>valtOpAntwoord(id,'uitzondering'), SEP+'|uiteten');
  expect(await page.locator('[data-vraag]').count()).toBe(1);
  await page.evaluate(id=>valtOpAntwoord(id,'past_niet'), SEP+'|boodschappen');
  await page.evaluate(()=>{ closeSheet(); go('maand'); });
  expect(await page.locator('[data-vraag]').count()).toBe(0);
  expect(await page.locator('[data-antwoord]').count()).toBe(2);
});

test('b4 de zin bij een bijstelling die toch boven bleef', async ({page})=>{
  const log=SEPTEMBER(); log[2].over_eind_maand=30;   // Sport, bijgesteld en toch erboven
  await boot(page, log);
  await page.evaluate(id=>valtOpAntwoord(id,'uitzondering'), SEP+'|uiteten');
  await page.evaluate(id=>valtOpAntwoord(id,'uitzondering'), SEP+'|boodschappen');
  const s=(await lees(page)).maanden[0];
  expect(s.vraag).toBe(SEP+'|sport');
  expect(s.vraagTekst).toContain('Sport & gezondheid bleef ook na bijstellen boven je potje.');
  expect(s.kop).toBe(308);
  expect(s.kopTekst).toContain('3 van de 5');
});

test('b5 een antwoord is in een tik te wijzigen', async ({page})=>{
  await boot(page, SEPTEMBER());
  await page.evaluate(id=>valtOpAntwoord(id,'uitzondering'), SEP+'|uiteten');
  await page.locator('[data-antwoord] .vl-wis').click();
  const r=await page.evaluate(id=>SET.valtOpLog[id].antwoord, SEP+'|uiteten');
  expect(r).toBeUndefined();
  expect((await lees(page)).maanden[0].vraag).toBe(SEP+'|uiteten');
});

/* ===== c) DE POORT EN DE DERDE STAND ===== */
const DRIE=()=>[
  R(JUL,'uiteten','Uit eten & café',{actie:'grens_gezet', over_eind_maand:120, antwoord:{keuze:'past_niet',op:'2026-08-02'}}),
  R(JUL,'sport','Sport & gezondheid',{actie:'potje_bijgesteld', potje_voor:50, potje_na:90, over_eind_maand:0}),
  R(AUG,'uiteten','Uit eten & café',{actie:'geen', over_eind_maand:150, antwoord:{keuze:'past_niet',op:'2026-09-02'}}),
  R(AUG,'vervoer','Vervoer & auto',{actie:'grens_gezet', over_eind_maand:0}),
].concat(SEPTEMBER());

test('c1 met drie afgesloten maanden staan trend, tegels en patroon er', async ({page})=>{
  await boot(page, DRIE());
  const r=await lees(page);
  expect(r.note).toBe('');
  expect(r.trend).toBe(true);
  expect(r.trendN).toBe(3);
  expect(r.mlab).toBe('jul €120 aug €150 sep €278');
  /* grens gezet: jul 120 boven, aug vervoer binnen, sep uiteten boven, sep vervoer binnen = 2/4 */
  const g=r.tegels.find(t=>t.a==='grens_gezet');
  expect(g.t).toContain('2/4');
  expect([g.in, g.n]).toEqual([2,4]);
  const b=r.tegels.find(t=>t.a==='potje_bijgesteld');
  expect(b.t).toContain('2/2');
  const n=r.tegels.find(t=>t.a==='geen');
  expect(n.t).toContain('1/3');     // aug uiteten boven, sep boodschappen boven, sep belasting binnen
  expect(r.tegels.find(t=>t.a==='correctie')).toBeUndefined();
  expect(r.patroon).toContain('Uit eten & café eindigde in juli, augustus en september boven je potje.');
  expect(r.patroon).toContain('Twee keer zei je "potje past niet".');
  expect(r.patroon).toContain('Potje vast ophogen vanaf november');
  expect(r.patroon).toContain('Zo laten');
  expect(r.alles).not.toMatch(/streak|op rij|goed bezig/i);
});

test('c2 met twee afgesloten maanden geen trend, tegels of patroon', async ({page})=>{
  await boot(page, DRIE().filter(x=>x.maand!==JUL));
  const r=await lees(page);
  // augustus en september zijn af; de derde is oktober, en die is af in november
  expect(r.note).toBe('Na 2 maanden. Vanaf november staat hier ook wat bij jou werkt.');
  expect(r.trend).toBe(false);
  expect(r.tegels).toEqual([]);
  expect(r.patroon).toBe('');
});

test('c3 een maand zonder signaal telt mee als maand logboek', async ({page})=>{
  await boot(page, DRIE().filter(x=>x.maand!==AUG));
  const r=await lees(page);
  expect(r.trend).toBe(true);
  expect(r.mlab).toBe('jul €120 aug €0 sep €278');
  expect(r.patroon).toBe('');       // augustus ging niet boven, dus geen drie op rij
});

test('c4 "Zo laten" haalt het patroon weg en staat op het record', async ({page})=>{
  await boot(page, DRIE());
  await page.locator('[data-patroon] button', {hasText:'Zo laten'}).click();
  expect(await page.evaluate(id=>SET.valtOpLog[id].patroon_gelaten, SEP+'|uiteten')).toBe(NU);
  expect((await lees(page)).patroon).toBe('');
});

test('c5 "Potje vast ophogen" opent de editor van de maand erna', async ({page})=>{
  await boot(page, DRIE());
  await page.locator('[data-patroon] button', {hasText:'Potje vast ophogen'}).click();
  expect(await page.evaluate(()=>document.querySelector('#sheet').innerText)).toContain('Uit eten & café-potje');
});

/* ===== d) EEN BRON ===== */
test('d1 kop, rij en trend lezen dezelfde bron', async ({page})=>{
  await boot(page, SEPTEMBER());
  const [blok, stand]=await Promise.all([kaalUit(page,'valtOpLogBlok'), kaalUit(page,'valtOpMaandStand')]);
  expect(stand).toContain('valtOpBoven(');
  expect(blok).toContain('valtOpMaandStand(');
  expect(blok).not.toContain('over_eind_maand');
  expect(blok).not.toContain('catSpendMap');
  expect(blok).toContain('valtOpUitkomst(r)');   // de lopende maand houdt zijn uitkomst (v315)
});

/* ===== p) DE PRIJS IN PIXELS ===== */
/* GEMETEN op deze stand, en niet weggerekend: in stand 1 is de vraagkaart het grootste deel (177px op
   360), en in stand 2 staan er twee kaarten (de gedempte met het antwoord en de nieuwe vraag). GRIP
   HEEFT GEEN 200px-EIS (die van v241 is de stand-kaart op Inzichten). */
const PX={360:{een:569, twee:616}, 390:{een:535, twee:582}};
for (const [w,h] of [[360,640],[390,844]]) {
  test(`p${w} de hoogte van het logboek in stand 1 en 2`, async ({page})=>{
    await page.setViewportSize({width:w, height:h});
    await boot(page, SEPTEMBER());
    const hh=()=>page.evaluate(()=>Math.round(document.querySelector('#valtOpLog').getBoundingClientRect().height));
    const een=await hh();
    await page.evaluate(id=>valtOpAntwoord(id,'uitzondering'), SEP+'|uiteten');
    const twee=await hh();
    expect(een).toBe(PX[w].een);
    expect(twee).toBe(PX[w].twee);
  });
}
