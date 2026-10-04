/* v331: HET LOGBOEK ALS EIGEN SCHERM, EEN REGEL OF DE VRAAG OP GRIP, DE HERHAALDE UITZONDERING, EN
   JE UITZONDERINGEN OVER DRIE MAANDEN. De fixture is september van het toestel (logboek-scherm.fixture.js). */
const { test, expect } = require('@playwright/test');
const { boot, R, U, SEPTEMBER, AUG, SEP, OKT, JUL } = require('./logboek-scherm.fixture');

const grip = page => page.evaluate(()=>{ const s=document.getElementById('s-maand'); const k=s.querySelector('#valtOpGrip');
  const t=e=>e?e.innerText.replace(/\s+/g,' ').trim():'';
  return {kaart:t(k), regels:[...(k?k.querySelectorAll('.vl-naarlog'):[])].map(t), vraag:k&&k.querySelector('[data-vraag]')?k.querySelector('[data-vraag]').dataset.vraag:null,
    herhaling:k&&k.querySelector('[data-herhaling]')?k.querySelector('[data-herhaling]').dataset.herhaling:null,
    vraagTekst:t(k&&k.querySelector('[data-vraag]')), knoppen:k?[...k.querySelectorAll('[data-vraag] button')].map(t):[],
    logInGrip:!!s.querySelector('#valtOpLog'), maandInGrip:s.querySelectorAll('.vl-maand').length,
    hoogte:Math.round(s.getBoundingClientRect().height)}; });
const logboek = async page => { await page.evaluate(()=>go('logboek'));
  return page.evaluate(()=>{ const s=document.getElementById('s-logboek'); const t=e=>e?e.innerText.replace(/\s+/g,' ').trim():'';
    return {alles:t(s), maanden:[...s.querySelectorAll('.vl-maand')].map(b=>({m:b.dataset.maand, kop:+b.querySelector('[data-maandboven]').dataset.maandboven,
      kopTekst:t(b.querySelector('.vl-kop')), boven:[...b.querySelectorAll('.vl-lijst [data-boven]')].map(e=>+e.dataset.boven),
      antwoorden:[...b.querySelectorAll('[data-antwoord]')].map(e=>e.dataset.keuze), rest:t(b.querySelector('.vl-rest summary')), feit:t(b.querySelector('.vl-uitzfeit'))})),
      vraag:s.querySelectorAll('[data-vraag]').length, tel:t(s.querySelector('.vl-tel')),
      uitz:s.querySelector('#valtOpUitz')?{gem:+s.querySelector('#valtOpUitz').dataset.gem, tel:s.querySelector('[data-uitzteller]').dataset.uitzteller, t:t(s.querySelector('#valtOpUitz')),
        knoppen:[...s.querySelectorAll('#valtOpUitz button')].map(t)}:null,
      zichtbaar:document.getElementById('s-logboek').classList.contains('active')}; }); };

/* ===== a) GRIP ZONDER OPEN VRAAG: EEN REGEL ===== */
test('a1 mijn september geeft op Grip een regel met "3 boven, alle 3 een uitzondering"', async ({page})=>{
  await boot(page, SEPTEMBER(true));
  const g=await grip(page);
  expect(g.regels).toEqual(['September · €381 boven je potjes 3 boven, alle 3 een uitzondering ›']);
  expect(g.vraag).toBe(null);
  expect(g.logInGrip).toBe(false);
  expect(g.maandInGrip).toBe(0);
});
test('a2 de regel opent het logboek als eigen scherm, en terug brengt je op Grip', async ({page})=>{
  await boot(page, SEPTEMBER(true));
  await page.click('#valtOpGrip .vl-naarlog');
  expect(await page.evaluate(()=>document.getElementById('s-logboek').classList.contains('active'))).toBe(true);
  await page.evaluate(()=>terug());
  expect(await page.evaluate(()=>document.getElementById('s-maand').classList.contains('active'))).toBe(true);
});
test('a3 het feit noemt een gemengd antwoord als telling', async ({page})=>{
  const log=SEPTEMBER(true); log[1].antwoord={keuze:'past_niet', op:'2026-10-02'}; delete log[2].antwoord; log[2].antwoord={keuze:'past_niet',op:'2026-10-02'};
  await boot(page, log);
  expect((await grip(page)).regels[0]).toContain('3 boven · 1 uitzondering · 2× potje past niet');
});

/* ===== b) GRIP MET OPEN VRAAG ===== */
test('b1 met een open vraag staat de vraag op Grip, met daaronder "Logboek"', async ({page})=>{
  await boot(page, SEPTEMBER(false));
  const g=await grip(page);
  expect(g.vraag).toBe(SEP+'|uiteten');
  expect(g.vraagTekst).toContain('Uit eten & café bleef ook met een grens boven je potje.');
  expect(g.knoppen).toEqual(['Potje past niet','Uitzondering']);
  expect(g.regels).toEqual(['Logboek ›']);
  expect(g.herhaling).toBe(null);
});
test('b2 verplaatsen is geen kopie: het logboek draagt de vraag niet, en wel het record als rij', async ({page})=>{
  await boot(page, SEPTEMBER(false));
  const L=await logboek(page);
  expect(L.vraag).toBe(0);
  expect(L.maanden[0].boven).toEqual([194,103,84]);
  expect(L.alles).toContain('vraag staat op Grip');
});

/* ===== c) HET LOGBOEK ===== */
test('c1 de maand met kop, regels, rest, feit en telregel', async ({page})=>{
  await boot(page, SEPTEMBER(true));
  const L=await logboek(page);
  expect(L.zichtbaar).toBe(true);
  expect(L.maanden.length).toBe(1);
  const s=L.maanden[0];
  expect(s.kop).toBe(381);
  expect(s.kopTekst).toContain('3 van de 5');
  expect(s.boven).toEqual([194,103,84]);
  expect(s.boven.reduce((a,b)=>a+b,0)).toBe(s.kop);
  expect(s.antwoorden).toEqual(['uitzondering','uitzondering','uitzondering']);
  expect(s.rest).toContain('4 binnen of vervallen');
  expect(s.feit).toBe('Alle 3 waren een uitzondering. Is een potje volgende maand weer een uitzondering, dan vraagt Minder je of dat nog zo is.');
  expect(L.tel).toContain('grens gezet');
});
test('c2 het feit staat er niet als een antwoord geen uitzondering is', async ({page})=>{
  const log=SEPTEMBER(true); log[0].antwoord={keuze:'past_niet', op:'2026-10-02'};
  await boot(page, log);
  expect((await logboek(page)).maanden[0].feit).toBe('');
});
test('c3 alle afgesloten maanden staan in het logboek, nieuwste eerst, ook meer dan drie', async ({page})=>{
  const MEI='2026-05', JUN='2026-06';
  const log=SEPTEMBER(true).concat([R(MEI,'uiteten','Uit eten & café',{actie:'geen',over_eind_maand:30,over_oorspronkelijk:30,antwoord:U('2026-06-02')}),
    R(JUN,'uiteten','Uit eten & café',{actie:'geen',over_eind_maand:0,over_oorspronkelijk:0}),
    R(JUL,'uiteten','Uit eten & café',{actie:'geen',over_eind_maand:0,over_oorspronkelijk:0}),
    R(AUG,'uiteten','Uit eten & café',{actie:'geen',over_eind_maand:0,over_oorspronkelijk:0})]);
  await boot(page, log);
  expect((await logboek(page)).maanden.map(m=>m.m)).toEqual([SEP,AUG,JUL,JUN,MEI]);
});
test('c4 de lopende maand en de poort-inhoud staan in het logboek en niet op Grip', async ({page})=>{
  const log=SEPTEMBER(true).concat([R(OKT,'uiteten','Uit eten & café',{}),
    R(JUL,'uiteten','Uit eten & café',{actie:'geen',over_eind_maand:20,over_oorspronkelijk:20}),
    R(AUG,'uiteten','Uit eten & café',{actie:'geen',over_eind_maand:20,over_oorspronkelijk:20})]);
  await boot(page, log);
  const g=await grip(page);
  expect(g.kaart).not.toContain('uitkomst na');
  expect(g.kaart).not.toMatch(/wat bij jou werkt/i);
  const L=await logboek(page);
  expect(L.alles).toContain('uitkomst na 31 oktober');
  expect(L.alles).toMatch(/wat bij jou werkt/i);
  expect(L.alles).toContain('Uit eten & café eindigde in juli, augustus en september boven je potje.');
});

/* ===== d) DE HERHAALDE UITZONDERING ===== */
const NOV='2026-11-04';
const OKTOBER=()=>[
  R(OKT,'uiteten','Uit eten & café',{actie:'geen', over_eind_maand:160, over_oorspronkelijk:160}),
  R(OKT,'kleding','Kleding',{actie:'geen', over_eind_maand:50, over_oorspronkelijk:50}),
];
test('d1 een tweede uitzondering op hetzelfde potje krijgt de herhaalvraag', async ({page})=>{
  await boot(page, SEPTEMBER(true).concat(OKTOBER()), {}, NOV);
  const g=await grip(page);
  expect(g.vraag).toBe(OKT+'|uiteten');
  expect(g.herhaling).toBe(SEP);
  expect(g.vraagTekst).toContain('Uit eten & café was in september ook een uitzondering.');
  expect(g.vraagTekst).toContain('Is het nog een uitzondering, of past het potje niet?');
  expect(g.knoppen).toEqual(['Potje past niet','Nog steeds']);
});
test('d2 "Nog steeds" bewaart het antwoord met het feit dat het een herhaling was', async ({page})=>{
  await boot(page, SEPTEMBER(true).concat(OKTOBER()), {}, NOV);
  await page.click('#valtOpGrip [data-vraag] button:has-text("Nog steeds")');
  const a=await page.evaluate(()=>SET.valtOpLog['2026-10|uiteten'].antwoord);
  expect(a).toMatchObject({keuze:'uitzondering', herhaling:true, vorige:'2026-09'});
  /* de volgende vraag (Kleding) heeft geen uitzondering ervoor en is de gewone vorm */
  const g=await grip(page);
  expect(g.vraag).toBe(OKT+'|kleding');
  expect(g.herhaling).toBe(null);
  expect(g.knoppen).toEqual(['Potje past niet','Uitzondering']);
  const L=await logboek(page);
  expect(L.alles).toContain('nog steeds een uitzondering');
});
test('d3 ook "Potje past niet" op een herhaalvraag bewaart de herhaling', async ({page})=>{
  await boot(page, SEPTEMBER(true).concat(OKTOBER()), {}, NOV);
  await page.click('#valtOpGrip [data-vraag] button:has-text("Potje past niet")');
  const a=await page.evaluate(()=>SET.valtOpLog['2026-10|uiteten'].antwoord);
  expect(a).toMatchObject({keuze:'past_niet', herhaling:true, vorige:'2026-09'});
});
test('d4 geen herhaling als het vorige antwoord geen uitzondering was', async ({page})=>{
  const log=SEPTEMBER(true); log[0].antwoord={keuze:'past_niet', op:'2026-10-02'};
  await boot(page, log.concat(OKTOBER()), {}, NOV);
  const g=await grip(page);
  expect(g.vraag).toBe(OKT+'|uiteten');
  expect(g.herhaling).toBe(null);
});

/* ===== e) JE UITZONDERINGEN OVER DRIE MAANDEN ===== */
const AUGUSTUS=()=>[
  R(AUG,'uiteten','Uit eten & café',{actie:'geen', over_eind_maand:120, over_oorspronkelijk:120, antwoord:U('2026-09-02')}),
  R(AUG,'vices','Vices',{actie:'geen', over_eind_maand:60, over_oorspronkelijk:60, antwoord:{keuze:'past_niet',op:'2026-09-02'}}),
];
const OKT_BEANTWOORD=()=>{ const o=OKTOBER(); o[0].antwoord={keuze:'uitzondering',op:'2026-11-02',herhaling:true,vorige:SEP}; o[1].antwoord={keuze:'past_niet',op:'2026-11-02'}; return o; };
test('e1 met twee maanden geen uitzonderingenkaart', async ({page})=>{
  await boot(page, SEPTEMBER(true).concat(OKT_BEANTWOORD()), {}, NOV);
  expect((await logboek(page)).uitz).toBe(null);
});
test('e2 met drie maanden met elk een uitzondering wel, met het gemiddelde en de telling', async ({page})=>{
  await boot(page, AUGUSTUS().concat(SEPTEMBER(true), OKT_BEANTWOORD()), {}, NOV);
  const L=await logboek(page);
  /* (120 + 381 + 160) / 3 = 220,33; 5 van de 6 overschrijdingen (aug 2, sep 3, okt 2 waarvan 1 uitz) */
  expect(L.uitz.gem).toBe(220);
  expect(L.uitz.tel).toBe('5/7');
  expect(L.uitz.t).toMatch(/je uitzonderingen · 3 maanden/i);
  expect(L.uitz.t).toContain('5 van de 7 overschrijdingen noemde je een uitzondering');
  expect(L.uitz.t).toContain('aug €120');
  expect(L.uitz.knoppen).toEqual(['Zo laten']);
  /* de kaart staat in het logboek en niet op Grip */
  expect((await grip(page)).kaart).not.toMatch(/je uitzonderingen/i);
});
test('e3 een maand zonder uitzondering in het venster geeft geen kaart', async ({page})=>{
  const aug=AUGUSTUS(); aug[0].antwoord={keuze:'past_niet',op:'2026-09-02'};
  await boot(page, aug.concat(SEPTEMBER(true), OKT_BEANTWOORD()), {}, NOV);
  expect((await logboek(page)).uitz).toBe(null);
});
test('e4 "Zo laten" haalt de kaart weg, schrijft geen potje, en staat op de nieuwste maand van het venster', async ({page})=>{
  await boot(page, AUGUSTUS().concat(SEPTEMBER(true), OKT_BEANTWOORD()), {}, NOV);
  await logboek(page);
  const voor=await page.evaluate(()=>JSON.stringify([SET.budgets,SET.budgetsNext||{}]));
  await page.click('#valtOpUitz button');
  const r=await page.evaluate(()=>({g:SET.valtOpUitzGelaten, b:JSON.stringify([SET.budgets,SET.budgetsNext||{}])}));
  expect(r.g.tot).toBe(OKT);
  expect(r.b).toBe(voor);
  expect((await logboek(page)).uitz).toBe(null);
});
test('e5 renderen schrijft niets', async ({page})=>{
  await boot(page, AUGUSTUS().concat(SEPTEMBER(true), OKT_BEANTWOORD()), {}, NOV);
  const voor=await page.evaluate(()=>JSON.stringify([SET.budgets,SET.budgetsNext||{},SET.valtOpUitzGelaten||null]));
  await logboek(page); await page.evaluate(()=>{ go('maand'); renderMaand(); go('logboek'); });
  expect(await page.evaluate(()=>JSON.stringify([SET.budgets,SET.budgetsNext||{},SET.valtOpUitzGelaten||null]))).toBe(voor);
});

/* ===== f) DE HOOGTE VAN GRIP ===== */
/* GEMETEN voor v331 op dezelfde fixture: Grip 762px op 360 en 728px op 390 met alles beantwoord, waarvan
   635 en 601px logboek; met een open vraag 746 en 712px. */
for (const [w,h] of [[360,640],[390,844]]) {
  test(`f${w} Grip is lager, met en zonder open vraag`, async ({page})=>{
    await page.setViewportSize({width:w,height:h});
    /* v337: de maandafsluiting staat bovenaan Grip met zijn eigen hoogte (maand-afsluiting.spec.js);
       deze test meet wat het logboek van v331 kost en haalt die kaart dus eerst weg. */
    const zonder=()=>page.evaluate(()=>{ for (const id of ['afsluitKaart', 'afgeslotenRegel']) { const e = document.getElementById(id); if (e) e.remove(); } });
    await boot(page, SEPTEMBER(true)); await zonder();
    const a=await grip(page);
    await boot(page, SEPTEMBER(false)); await zonder();
    const b=await grip(page);
    console.log(`GRIP ${w}px: beantwoord ${a.hoogte}px, open vraag ${b.hoogte}px`);
    expect(a.hoogte).toBeLessThan(300);
    expect(b.hoogte).toBeLessThan(460);
    const over=await page.evaluate(()=>{ const k=document.getElementById('valtOpGrip'), r=k.getBoundingClientRect();
      return [...k.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>r.right+0.5).length; });
    expect(over).toBe(0);
  });
}
