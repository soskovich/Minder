/* v327: ELK DEEL VAN HET MAANDBUDGET STAAT IN PRECIES EEN GETAL VAN DE STAND-KAART.
   Op de stand van het toestel (blok 15, 3 oktober 2026) stond EUR 589 nergens. Sinds v327:
   - de rest van een terugkerend potje boven zijn incasso's telt in "nog in je potjes" (terugPotjes());
   - een uitgesloten incasso blijft in die rest staan, en Grip meldt het met de keuze het potje voor
     volgende maand te verlagen (niet stil);
   - een post uit de terugval op vorige maand draagt zijn categorie, en valt die in een variabel
     potje, dan telt hij daar en niet nog eens in "nog te betalen" (Shurgard);
   - safeToSpend() reserveert dezelfde som.
   De fixture is de stand van het toestel en geeft op de code van v326 exact 3.375 / 1.654 / 175 /
   957 en veilig te besteden 1.113 (gemeten bij het bouwen; zie standkaart-sluit.fixture.js). */
const { test, expect } = require('@playwright/test');
const { bootStand } = require('./standkaart-sluit.fixture');
const { kaalUit } = require('./bron-kaal');

const stand=page=>page.evaluate(()=>{ const ym=thisYM(); const T=totals(ym), ML=monthLiquidity(), VP=varPotjeStand(ym), S=safeToSpend();
  return {budget:Math.round(T.budget), uit:Math.round(T.spendNorm), vast:ML.fixDue, nog:VP.nog, terug:VP.terug, S,
    items:ML.fixDueItems.map(s=>({name:s.name,cat:s.cat||null,excl:!!s.excl,inPotje:!!s.inPotje,terugval:!!s.terugval,amount:s.amount}))}; });

test('a1 de invoer is de stand van het toestel: dezelfde incasso\'s, categorieen en bronnen als blok 15', async ({page})=>{
  await bootStand(page);
  const r=await stand(page);
  const rc=await page.evaluate(()=>[...recurringCats()].sort());
  expect(rc).toEqual(['bankkosten','belasting','shopping','sport','vervoer','verzekering']);
  const per=n=>r.items.find(x=>x.name===n);
  expect(per('Shurgard NL')).toMatchObject({cat:'huur',terugval:true,excl:false,inPotje:true,amount:137});
  /* v328: DELA komt per kwartaal; het schema kent hem (volgende in december) en dan zet de terugval
     hem niet als maandlast in oktober. Op v327 stond hij hier als terugval-post. */
  expect(per('DELA Natura- en levensv')).toBeUndefined();
  expect(per('Huurwoningen')).toMatchObject({cat:'belasting',excl:true,amount:30});
  expect(per('Stparkeergelden via Rive')).toMatchObject({cat:'vervoer',excl:true,amount:19});
  expect(r.items.filter(x=>!x.excl&&!x.inPotje).reduce((a,x)=>a+x.amount,0)).toBe(820);
  expect(r.items.some(x=>x.cat==='shopping')).toBe(false);          // Online shopping: geen openstaande incasso
});

test('a1b een post die het schema met een langer interval kent, zet de terugval niet in deze maand', async ({page})=>{
  await bootStand(page);
  const r=await page.evaluate(()=>{ const s=recurringSchedule().find(x=>/DELA/.test(x.name));
    return {iv:s&&s.intervalM, next:s&&ymdVan(s.nextDate), inLijst:monthLiquidity().fixDueItems.some(x=>/DELA/.test(x.name))}; });
  expect(r.iv).toBe(3);                         // invoermeting: het schema kent hem als kwartaalpost
  expect(r.next.slice(0,7)).toBe('2026-12');
  expect(r.inLijst).toBe(false);
});

test('a2 budget = uitgegeven + nog in je potjes + nog te betalen, rest nul, op de stand van het toestel', async ({page})=>{
  await bootStand(page);
  const r=await stand(page);
  expect([r.budget,r.uit,r.nog,r.vast]).toEqual([3375,175,2380,820]);
  expect(r.terug).toBe(726);                                       // 398 + 171 + 95 + 40 + 22
  expect(r.budget-r.uit-r.nog-r.vast).toBe(0);
  const t=await page.evaluate(()=>diagStandKaart().join('\n'));
  expect(t).toMatch(/staat nergens\s+budget - de andere drie\s+0\b/);
  for(const k of ['budget','uitgegeven','in potjes','vast','rest']) expect(t,k).toMatch(new RegExp(`^\\s+${k}\\s+-?\\d+ tegen -?\\d+\\s+JA`,'m'));
});

test('a3 per categorie: de rest van een terugkerend potje staat in "nog in je potjes", niet onder nul', async ({page})=>{
  await bootStand(page);
  const rij=await page.evaluate(()=>Object.fromEntries(terugPotjes(thisYM()).rijen.map(r=>[r.k,[r.bud,Math.round(r.uit),r.vast,r.rest]])));
  expect(rij.vervoer).toEqual([1100,99,603,398]);
  expect(rij.verzekering).toEqual([335,0,164,171]);
  expect(rij.shopping).toEqual([95,0,0,95]);
  expect(rij.belasting).toEqual([40,0,0,40]);
  expect(rij.bankkosten).toEqual([25,0,3,22]);
  expect(rij.sport).toEqual([50,0,50,0]);
  /* niet onder nul: een terugkerend potje dat al op is reserveert niets meer */
  const leeg=await page.evaluate(()=>{ SET.budgets.sport=30; save(); return terugPotjes(thisYM()).rijen.find(r=>r.k==='sport').rest; });
  expect(leeg).toBe(0);
});

test('a4 alleen de lopende maand: van een afgeronde maand valt niets meer te verwachten', async ({page})=>{
  await bootStand(page);
  expect(await page.evaluate(()=>terugPotjes('2026-09').rest)).toBe(0);
});

test('b1 veilig te besteden reserveert dezelfde som als de kaart, en toont 524', async ({page})=>{
  await bootStand(page);
  const r=await stand(page);
  const S=r.S;
  expect(S.fixDue).toBe(820);
  expect(S.reserved).toBe(r.nog+S.potOver);                        // de identiteit van v254
  expect(S.reserved).toBe(2380);
  expect(S.safe).toBe(Math.round(S.saldo-S.savedBal-S.resBal+S.incDue-S.fixDue-S.reserved-S.saveReserved));
  expect(S.safe).toBe(524);
});

test('b2 fixDueBudgetExtra bestaat niet meer, niet in de uitkomst en niet als claim', async ({page})=>{
  await bootStand(page);
  const r=await page.evaluate(()=>({S:Object.keys(safeToSpend()), C:SAFE_CLAIMS.map(c=>c.key)}));
  expect(r.S).not.toContain('fixDueBudgetExtra');
  expect(r.C).not.toContain('fixDueBudgetExtra');
  const src=await kaalUit(page,'safeToSpend','openSafeToSpend');
  expect(src).not.toContain('fixDueBudgetExtra');
});

test('b3 de lijst achter "Gereserveerd in je potjes" telt op tot het bedrag, met de terugkerende potjes erin', async ({page})=>{
  await bootStand(page);
  const r=await page.evaluate(()=>{ openReservedPotjes(); const t=document.querySelector('#sheet').innerText; return {t, S:safeToSpend().reserved}; });
  expect(r.t).toContain('€2.380');
  expect(r.t).toMatch(/Vervoer & auto[\s\S]*€99 van €1\.100 gebruikt · €603 incasso nog te gaan/);
  expect(r.t).toContain('€398');
});

test('b4 de lijst achter "nog te betalen" zegt dat Shurgard in zijn potje telt', async ({page})=>{
  await bootStand(page);
  const t=await page.evaluate(()=>{ openFixedDue(); return document.querySelector('#sheet').innerText; });
  expect(t).toContain('€820');
  expect(t).toMatch(/IN EEN POTJE · TELT DAAR[\s\S]*Shurgard NL[\s\S]*uit je potje Huur/i);
});

test('c1 de tegel toont €2.380 nog in potjes, met €85 per dag', async ({page})=>{
  await bootStand(page);
  /* v359: de stand-kaart is de tegel "Nog in potjes"; go() hertekent niet als het scherm al de bron is (v280) */
  const t=await page.evaluate(()=>{ go('ins'); renderIns(); const q=(k)=>document.querySelector(`#insTegels [data-instegel="${k}"]`).innerText.replace(/\s+/g,' ');
    return {pot:q('potjes'), uit:q('uitgegeven')}; });
  expect(t.pot).toMatch(/Nog in potjes €2\.380 €85 per dag/);
  expect(t.uit).toMatch(/Uitgegeven €175/);
});

/* v340: de kaart staat niet meer op Grip maar achter de Let op-regel [data-letop="uit"], in de sheet
   #gripLetOpSheet. De tests openen die regel zoals een tik dat doet en eisen dat de kaart niet meer los
   op Grip staat; zonder regel is er geen kaart. */
test('d1 Grip meldt elk terugkerend potje met een uitgesloten incasso, met het bedrag', async ({page})=>{
  await bootStand(page);
  const t=await page.evaluate(()=>{ go('maand'); renderMaand(); const k=(()=>{ if(document.querySelector('#s-maand #uitgeslotenKaart')) throw new Error('de kaart staat nog op Grip'); const g=document.querySelector('#gripLetOp [data-letop="uit"]'); if(!g) return null; g.click(); return document.querySelector('#gripLetOpSheet #uitgeslotenKaart'); })(); return k?k.innerText:''; });
  expect(t).not.toContain('Verzekeringen');    // v328: DELA is een kwartaalpost en geen uitgesloten maandlast
  expect(t).toContain('Potje Belasting & boetes houdt €30 vast voor Huurwoningen, een uitgesloten incasso.');
  expect(t).toContain('Potje Vervoer & auto houdt €19 vast voor Stparkeergelden via Rive, een uitgesloten incasso.');
  expect(t).toContain('Potje verlagen naar €10');
  expect(t).toContain('geldt vanaf november');
});

test('d2 niet stil verlagen: renderen en de tik schrijven geen potje', async ({page})=>{
  await bootStand(page);
  const r=await page.evaluate(()=>{ const voor=JSON.stringify([SET.budgets,SET.budgetsNext||{}]);
    go('maand'); renderMaand(); uitgeslotenPotjeVerlaag('belasting');
    const veld=document.querySelector('#sheet input'); return {na:JSON.stringify([SET.budgets,SET.budgetsNext||{}]), voor, veld:veld&&veld.value}; });
  expect(r.na).toBe(r.voor);
  expect(r.veld).toBe('10');
});

test('d3 de keuze loopt via de bestaande route naar volgende maand, en daarna zwijgt de melding', async ({page})=>{
  await bootStand(page);
  const r=await page.evaluate(()=>{ uitgeslotenPotjeVerlaag('belasting'); savePotje('belasting');
    go('maand'); renderMaand(); const k=(()=>{ if(document.querySelector('#s-maand #uitgeslotenKaart')) throw new Error('de kaart staat nog op Grip'); const g=document.querySelector('#gripLetOp [data-letop="uit"]'); if(!g) return null; g.click(); return document.querySelector('#gripLetOpSheet #uitgeslotenKaart'); })();
    return {nu:SET.budgets.belasting, next:SET.budgetsNext.belasting, t:k?k.innerText:''}; });
  expect(r.nu).toBe(40);
  expect(r.next).toBe(10);
  expect(r.t).not.toContain('Belasting & boetes');
  expect(r.t).toContain('Vervoer & auto');
});

test('d4 zonder uitgesloten incasso in een terugkerend potje staat er geen kaart', async ({page})=>{
  await bootStand(page);
  const n=await page.evaluate(()=>{ SET.fixDueExcl={}; save(); go('maand'); renderMaand(); return document.querySelectorAll('#uitgeslotenKaart, #gripLetOp [data-letop="uit"]').length; });
  expect(n).toBe(0);
});

test('e1 Home toont het lagere veilig te besteden, met het bedrag per dag', async ({page})=>{
  await bootStand(page);
  const t=await page.evaluate(()=>{ go('dash'); renderDash(); return document.querySelector('#s-dash').innerText; });
  expect(t).toContain('€524');
  expect(t).toContain('Nog 28 dagen deze maand, dus €19 per dag.');
});

test('d5 meer dan er nog in het potje zit kan het niet vasthouden', async ({page})=>{
  await bootStand(page);
  /* invoermeting: met een potje van 715 is de rest 715 - 99 - 603 = 13, kleiner dan Parkeergelden 19 */
  const r=await page.evaluate(()=>{ SET.budgets.vervoer=715; save();
    const rij=terugPotjes(thisYM()).rijen.find(x=>x.k==='vervoer');
    go('maand'); renderMaand(); const k=(()=>{ if(document.querySelector('#s-maand #uitgeslotenKaart')) throw new Error('de kaart staat nog op Grip'); const g=document.querySelector('#gripLetOp [data-letop="uit"]'); if(!g) return null; g.click(); return document.querySelector('#gripLetOpSheet #uitgeslotenKaart'); })(); return {rest:rij.rest, t:k?k.innerText:''}; });
  expect(r.rest).toBe(13);
  expect(r.t).toContain('Potje Vervoer & auto houdt €13 vast voor Stparkeergelden via Rive');
  expect(r.t).toContain('Potje verlagen naar €702');
});

for (const w of [360, 390]) {
  test(`f1 op ${w}px: de Grip-kaart loopt niet over, en de tegels op Inzichten ook niet`, async ({page})=>{
    await page.setViewportSize({width:w, height:w===360?640:844});
    await bootStand(page);
    const r=await page.evaluate(()=>{ go('maand'); renderMaand(); const k=(()=>{ if(document.querySelector('#s-maand #uitgeslotenKaart')) throw new Error('de kaart staat nog op Grip'); const g=document.querySelector('#gripLetOp [data-letop="uit"]'); if(!g) return null; g.click(); return document.querySelector('#gripLetOpSheet #uitgeslotenKaart'); })();
      const kr=k.getBoundingClientRect(); const over=[...k.querySelectorAll('*')].some(e=>e.getBoundingClientRect().right>kr.right+0.5);
      closeSheet(); go('ins'); renderIns(); const g=document.querySelector('#insTegels'), gr=g.getBoundingClientRect();
      const tover=[...g.querySelectorAll('*')].some(e=>e.getBoundingClientRect().right>gr.right+0.5);
      return {kh:Math.round(kr.height), over, tover, sw:document.documentElement.scrollWidth, vw:innerWidth}; });
    expect(r.over).toBe(false);
    expect(r.tover).toBe(false);
    expect(r.sw).toBeLessThanOrEqual(r.vw);
  });
}
