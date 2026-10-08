// v330: 'Wordt een reservering' toont beide gevolgen voor de bevestiging, en schrijft ze samen.
// v360: het verlagen geldt vanaf een maand die je kiest (niets voorgekozen), en het potje gaat omlaag met wat de
// post per maand vraagt. Parkeergelden komt elke maand, dus dat is hier zijn hele bedrag (EUR 19).
const { test, expect } = require('@playwright/test');
const { bootStand } = require('./standkaart-sluit.fixture');

const VELDEN = () => JSON.stringify([SET.fixDueExcl, resLijst(), SET.budgets, SET.budgetsNext||{}, SET.potMetaNext||{}]);
/* v340: de kaart staat achter de Let op-regel [data-letop="uit"] op Grip, in de sheet #gripLetOpSheet.
   De tik op 'Wordt een reservering' komt daar vandaan en vervangt die sheet door de bevestiging. */
const openVervoer = page => page.evaluate(()=>{ go('maand'); renderMaand();
  if(document.querySelector('#s-maand #uitgeslotenKaart')) throw new Error('de kaart staat nog op Grip');
  document.querySelector('#gripLetOp [data-letop="uit"]').click();
  const r=document.querySelector('#gripLetOpSheet #uitgeslotenKaart [data-uitgesloten="vervoer"]');
  const P=uitgeslotenPotjes().find(x=>x.key===r.dataset.sleutel);
  [...r.querySelectorAll('[onclick]')].find(b=>/Wordt een reservering/.test(b.innerText)).click();
  const sh=document.getElementById('sheet');
  return {key:r.dataset.sleutel, P, tekst:sh.innerText,
    res:sh.querySelector('[data-gevolg="reservering"]')?.innerText||'', pot:sh.querySelector('[data-gevolg="potje"]')?.innerText||'',
    vink:document.getElementById('uitResVerlaag')?.checked, vanaf:sh.querySelector('[data-uitresvanaf]')?.value, save:sh.querySelector('[data-uitressave]').disabled}; });
const kiesMaand = (page, ym) => page.evaluate(ym=>{ const e=document.querySelector('[data-uitresvanaf]'); e.value=ym||nextYM(thisYM()); e.dispatchEvent(new Event('change')); }, ym||null);
const bevestig = async page => { if(await page.evaluate(()=>!!document.querySelector('[data-uitresvanaf]') && !document.querySelector('[data-uitresvanaf]').value)) await kiesMaand(page);
  await page.evaluate(()=>[...document.querySelectorAll('#sheet button')].find(b=>b.innerText.trim()==='Bevestigen').click()); };

test('a de tik opent een sheet met beide gevolgen, en schrijft niets', async ({page})=>{
  await bootStand(page);
  const voor=await page.evaluate(VELDEN);
  const s=await openVervoer(page);
  expect(s.P).toMatchObject({k:'vervoer', houdt:19, voorstel:s.P.bud-19});
  expect(s.res).toContain('€19');
  expect(s.res).toContain('maandelijks');
  expect(s.res).toContain('eerste termijn oktober 2026');
  expect(s.vink).toBe(true);
  expect(s.vanaf).toBe('');       // v360: geen maand voorgekozen, dus nog niet te bevestigen
  expect(s.save).toBe(true);
  expect(s.pot).toContain('€19 per maand die deze post vasthoudt');
  await kiesMaand(page, '2026-11');
  const pot=await page.evaluate(()=>document.querySelector('[data-gevolg="potje"]').innerText);
  expect(pot).toContain('vanaf november');
  expect(pot).toContain(`€${s.P.bud.toLocaleString('nl-NL')} naar €${s.P.voorstel.toLocaleString('nl-NL')}`);
  /* het vinkje omzetten schrijft ook niets, en toont wat er dan dubbel staat */
  const uit=await page.evaluate(()=>{ document.getElementById('uitResVerlaag').click();
    return {t:document.querySelector('[data-uitresgevolg]').innerText}; });
  expect(uit.t).toContain('in je potje én in je reserveringen');
  expect(await page.evaluate(VELDEN)).toBe(voor);
  /* annuleren laat ook niets achter, en de regel staat er nog */
  await page.evaluate(()=>[...document.querySelectorAll('#sheet button')].find(b=>b.innerText.trim()==='Annuleren').click());
  expect(await page.evaluate(VELDEN)).toBe(voor);
  expect(await page.evaluate(()=>uitgeslotenPotjes().some(x=>x.k==='vervoer'))).toBe(true);
});

test('b een bevestiging schrijft de reservering en het lagere potje van volgende maand', async ({page})=>{
  await bootStand(page);
  const s=await openVervoer(page);
  const budVoor=await page.evaluate(()=>SET.budgets.vervoer);
  await bevestig(page);
  const r=await page.evaluate(k=>({res:resLijst().filter(x=>x.bron===k), next:(SET.budgetsNext||{}).vervoer, meta:(SET.potMetaNext||{}).vervoer,
    nu:SET.budgets.vervoer, excl:!!SET.fixDueExcl[k], plan:plannedBudgets().vervoer, open:document.getElementById('sheet').innerText}), s.key);
  expect(r.res.length).toBe(1);
  expect(r.res[0]).toMatchObject({bedrag:19, intervalM:1, vervalmaand:'2026-10', bron:s.key});
  expect(r.next).toBe(s.P.voorstel);
  expect(r.meta).toBe(null);
  expect(r.nu).toBe(budVoor);   // deze maand blijft het potje staan
  expect(r.excl).toBe(true);
  /* HETZELFDE BEDRAG STAAT NA DE KEUZE NIET IN POTJE EN RESERVERING TEGELIJK: het potje van volgende
     maand plus deze post is het oude potje, niet het oude potje plus de post */
  expect(r.plan + r.res[0].bedrag).toBe(budVoor);
  expect(r.plan).toBe(budVoor - 19);
  /* de regel zwijgt, en een tweede bevestiging maakt geen tweede reservering en verlaagt niet nog eens */
  expect(await page.evaluate(()=>uitgeslotenPotjes().some(x=>x.k==='vervoer'))).toBe(false);
  const twee=await page.evaluate(k=>{ uitgeslotenNaarRes(k, true, nextYM(thisYM())); return {n:resLijst().filter(x=>x.bron===k).length, next:SET.budgetsNext.vervoer}; }, s.key);
  expect(twee).toEqual({n:1, next:s.P.voorstel});
});

test('c met het vinkje uit verandert het potje niet, en dan staat het bedrag er bewust dubbel', async ({page})=>{
  await bootStand(page);
  const s=await openVervoer(page);
  const voor=await page.evaluate(()=>({next:JSON.stringify(SET.budgetsNext||{}), meta:JSON.stringify(SET.potMetaNext||{}), plan:plannedBudgets().vervoer}));
  await page.evaluate(()=>document.getElementById('uitResVerlaag').click());
  await bevestig(page);
  const r=await page.evaluate(k=>({n:resLijst().filter(x=>x.bron===k).length, next:JSON.stringify(SET.budgetsNext||{}), meta:JSON.stringify(SET.potMetaNext||{}), plan:plannedBudgets().vervoer}), s.key);
  expect(r.n).toBe(1);
  expect(r.next).toBe(voor.next);
  expect(r.meta).toBe(voor.meta);
  expect(r.plan).toBe(voor.plan);
});

test('d de bevestiging leest het potje opnieuw en niet wat de sheet toonde', async ({page})=>{
  await bootStand(page);
  const s=await openVervoer(page);
  /* tussen openen en bevestigen verandert het potje van deze maand (een import, een andere sheet) */
  await page.evaluate(()=>{ SET.budgets.vervoer+=100; save(); });
  await bevestig(page);
  const next=await page.evaluate(()=>SET.budgetsNext.vervoer);
  expect(next).toBe(s.P.bud+100-19);
});

test('e het verlagen telt in de log als "volgende maand anders"', async ({page})=>{
  await bootStand(page);
  const s=await openVervoer(page);
  /* zet een open record klaar zoals een signaal dat zou doen; de route moet hem voeden */
  await page.evaluate(()=>{ SET.valtOpLog=SET.valtOpLog||{}; SET.valtOpLog[valtOpId(thisYM(),'vervoer')]={maand:thisYM(), categorie:'vervoer', actie:null}; save(); });
  await bevestig(page);
  const r=await page.evaluate(()=>SET.valtOpLog[valtOpId(thisYM(),'vervoer')]);
  expect(r).toMatchObject({actie:'volgende_maand', volgend_voor:s.P.bud, volgend_na:s.P.voorstel});
});

for (const w of [360, 390]) {
  test(`f op ${w}px loopt de sheet niet over`, async ({page})=>{
    await page.setViewportSize({width:w, height:740});
    await bootStand(page);
    await openVervoer(page);
    const m=await page.evaluate(()=>{ const sh=document.getElementById('sheet'); const b=sh.getBoundingClientRect();
      const over=[...sh.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().right>b.right+0.5).length;
      return {h:Math.round(b.height), over, scroll:document.documentElement.scrollWidth}; });
    console.log(`sheet ${w}px: ${m.h}px`);
    expect(m.over).toBe(0);
    expect(m.scroll).toBeLessThanOrEqual(w);
  });
}
