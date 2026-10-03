// v329: drie keuzes per uitgesloten incasso op Grip, zonder voorselectie.
const { test, expect } = require('@playwright/test');
const { bootStand } = require('./standkaart-sluit.fixture');

const rijen = page => page.evaluate(()=>{ go('maand'); renderMaand();
  return [...document.querySelectorAll('#uitgeslotenKaart [data-sleutel]')].map(r=>({k:r.dataset.uitgesloten, key:r.dataset.sleutel, t:r.innerText,
    knoppen:[...r.querySelectorAll('[onclick]')].map(b=>{ const cs=getComputedStyle(b); return {t:b.innerText.trim(), kleur:cs.color, gewicht:cs.fontWeight, grootte:cs.fontSize}; })})); });
const sluit = page => page.evaluate(()=>{ const VP=varPotjeStand(thisYM()), L=monthLiquidity(), T=totals(thisYM());
  return {budget:Math.round(T.budget), som:Math.round(T.spendNorm+VP.nog+L.fixDue), fixDue:L.fixDue, nog:VP.nog}; });

test('a een regel per post, met precies drie keuzes van hetzelfde gewicht', async ({page})=>{
  await bootStand(page);
  const R=await rijen(page);
  expect(R.map(r=>r.k).sort()).toEqual(['belasting','vervoer']);
  for(const r of R){
    expect(r.knoppen.map(b=>b.t.replace(/ ›$/,'').replace(/ naar .*/,''))).toEqual(['Telt weer mee','Potje verlagen','Wordt een reservering']);
    for(const b of r.knoppen){ expect(b.kleur).toBe(r.knoppen[0].kleur); expect(b.gewicht).toBe(r.knoppen[0].gewicht); expect(b.grootte).toBe(r.knoppen[0].grootte); }
  }
});

test('b renderen schrijft geen keuze, en de regel blijft staan tot je kiest', async ({page})=>{
  await bootStand(page);
  /* renderMaand() doet zelf een save() (de valt-op-log), dus de toets staat op de velden die een
     keuze zou schrijven en niet op localStorage als geheel */
  const r=await page.evaluate(()=>{ const f=()=>JSON.stringify([SET.fixDueExcl,resLijst(),SET.budgets,SET.budgetsNext||{}]); const voor=f();
    for(let i=0;i<3;i++){ go('maand'); renderMaand(); go('dash'); renderDash(); } return {voor, na:f()}; });
  expect(r.na).toBe(r.voor);
  expect((await rijen(page)).length).toBe(2);
});

test('c "telt weer mee" haalt de uitsluiting weg; de post staat weer in nog te betalen en de kaart sluit nog', async ({page})=>{
  await bootStand(page);
  const voor=await sluit(page);
  const R=await rijen(page); const hw=R.find(r=>r.k==='belasting');
  await page.evaluate(k=>uitgeslotenTeltMee(k), hw.key);
  const na=await sluit(page);
  expect(await page.evaluate(k=>!!(SET.fixDueExcl||{})[k], hw.key)).toBe(false);
  expect(na.fixDue-voor.fixDue).toBe(30);
  expect(voor.nog-na.nog).toBe(30);
  expect(na.som).toBe(na.budget);
  expect((await rijen(page)).map(r=>r.k)).toEqual(['vervoer']);
});

test('d "wordt een reservering" zet de post met het herkende bedrag en de maand in de reserveringen', async ({page})=>{
  await bootStand(page);
  const voor=await sluit(page);
  const pk=(await rijen(page)).find(r=>r.k==='vervoer').key;
  const r=await page.evaluate(k=>{ uitgeslotenNaarRes(k); return {res:resLijst().filter(x=>x.bron===k), excl:!!SET.fixDueExcl[k], ym:thisYM()}; }, pk);
  expect(r.res.length).toBe(1);
  expect(r.res[0]).toMatchObject({naam:'Stparkeergelden via Rive', bedrag:19, intervalM:1, vervalmaand:r.ym, cat:'vervoer', bron:pk});
  expect(r.excl).toBe(true);   // anders telt hij twee keer
  expect((await sluit(page)).fixDue).toBe(voor.fixDue);
  expect((await rijen(page)).map(x=>x.k)).toEqual(['belasting']);
  /* een tweede tik maakt er geen tweede van */
  expect(await page.evaluate(k=>{ uitgeslotenNaarRes(k); return resLijst().filter(x=>x.bron===k).length; }, pk)).toBe(1);
});

test('e een reservering verwijderen brengt de regel terug, en wijzigen houdt de koppeling', async ({page})=>{
  await bootStand(page);
  const pk=(await rijen(page)).find(r=>r.k==='vervoer').key;
  const id=await page.evaluate(k=>{ uitgeslotenNaarRes(k); return resLijst().find(x=>x.bron===k).id; }, pk);
  const bron=await page.evaluate(id=>{ openReservering(id); document.getElementById('rBedrag').value='25'; saveReservering(id); return resLijst().find(x=>x.id===id).bron; }, id);
  expect(bron).toBe(pk);
  expect((await rijen(page)).map(x=>x.k)).toEqual(['belasting']);
  await page.evaluate(id=>deleteReservering(id), id);
  expect((await rijen(page)).map(x=>x.k).sort()).toEqual(['belasting','vervoer']);
});

test('f DELA in zijn kwartaalmaand: de reservering krijgt per kwartaal en de maand uit het schema', async ({page})=>{
  await bootStand(page, '2026-12-03');
  /* invoermeting: in december staat DELA als uitgesloten post in Verzekeringen */
  const R=await rijen(page); const d=R.find(r=>r.k==='verzekering');
  expect(d && d.t).toContain('DELA Natura- en levensv, een uitgesloten incasso');
  const r=await page.evaluate(k=>{ uitgeslotenNaarRes(k); return resLijst().find(x=>x.bron===k); }, d.key);
  expect(r).toMatchObject({naam:'DELA Natura- en levensv', bedrag:160, intervalM:3, vervalmaand:'2026-12', cat:'verzekering'});
});

test('g "potje verlagen" is per post: het voorstel is het potje min wat deze post vasthoudt', async ({page})=>{
  await bootStand(page);
  const v=await page.evaluate(()=>{ uitgeslotenPotjeVerlaag('vervoer', uitgeslotenPotjes().find(x=>x.k==='vervoer').key);
    const veld=document.querySelector('#sheet input'); return veld&&veld.value; });
  expect(v).toBe('1081');
});

test('i twee uitgesloten posten in een potje: elk een eigen regel, en samen niet meer dan er nog in zit', async ({page})=>{
  await bootStand(page);
  const r=await page.evaluate(()=>{ SET.budgets.vervoer=715;
    SET.fixDueExcl[recurKey(TX.find(t=>t.name==='Ontvangsten Hiltermann L'))]={sinds:'2026-09-30'}; save();
    const rij=terugPotjes(thisYM()).rijen.find(x=>x.k==='vervoer');
    const U=uitgeslotenPotjes().filter(x=>x.k==='vervoer');
    return {rest:rij.rest, excl:rij.excl.map(x=>({key:x.key, a:x.amount})), U:U.map(u=>({key:u.key,houdt:u.houdt}))}; });
  /* invoermeting: de twee uitgesloten posten (537 en 19) zijn samen meer dan de rest */
  expect(r.rest).toBe(715-99-66);
  expect(r.excl.reduce((a,x)=>a+x.a,0)).toBeGreaterThan(r.rest);
  expect(r.U.length).toBe(2);
  expect(r.U.reduce((a,u)=>a+u.houdt,0)).toBe(r.rest);
  for(const u of r.U) expect(u.houdt).toBeLessThanOrEqual(r.excl.find(x=>x.key===u.key).a);
});

for (const w of [360, 390]) {
  test(`h op ${w}px loopt de kaart niet over`, async ({page})=>{
    await page.setViewportSize({width:w, height:w===360?640:844});
    await bootStand(page);
    const r=await page.evaluate(()=>{ go('maand'); renderMaand(); const k=document.querySelector('#uitgeslotenKaart'); const kr=k.getBoundingClientRect();
      return {over:[...k.querySelectorAll('*')].some(e=>e.getBoundingClientRect().right>kr.right+0.5), h:Math.round(kr.height), sw:document.documentElement.scrollWidth, vw:innerWidth}; });
    console.log(`kaart ${w}px: ${r.h}px`);
    expect(r.over).toBe(false);
    expect(r.sw).toBeLessThanOrEqual(r.vw);
  });
}
