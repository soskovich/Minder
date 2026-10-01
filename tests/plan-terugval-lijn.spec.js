/* v317: DE TERUGVAL OP HET SCHERM, DE MARGE IN HET DATUMPAAR, EN EEN GEMEENSCHAPPELIJKE
   MINIMUMBREEDTE.
   DE TERUGVAL BESTOND SINDS v307 ALLEEN IN DE REKENSOM. `planVooruit()` laat de ruimte van een vol
   doel doorzakken en `p.eta` werd daar een maand of meer vroeger van, maar niets op het scherm zei
   WAAR dat geld heen gaat. `planTerugval()` leent diezelfde projectie en geeft de overdrachten;
   de ontvanger draagt een gestippeld blok in zijn tak op de plek en de breedte van het segment van
   de gever, plus een regel met de maand.
   DE ONTVANGER WORDT GEMETEN EN NIET AFGELEID UIT DE VOLGORDE, en blok b draagt de twee gevallen
   waarop die keuze bijt: een ontvanger BOVEN de gever (het onderste doel is eerder vol en zijn
   ruimte gaat omhoog) en een BUFFER die vol raakt, waar de ruimte via ronde 1 gaat en `extra` dus
   nul blijft.
   DE MARGE KOMT UIT DEZELFDE `sp` ALS "net op tijd" (blok c). Die werd gerekend en alleen gebruikt
   om die ene tak te kiezen.
   DE MINIMUMBREEDTE STAAT IN DE SEGMENTEN EN NIET IN DE CSS VAN EEN VAN DE TWEE LEZERS (blok d).
   `.plan-tak i` had `min-width:3px` en het balksegment niet, en de balk was bovendien flex: gemeten
   werd hetzelfde segment 2,98px in de balk en 3px in de tak. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
const MS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const DAG = '2026-10-01';
const ID = (d) => 'g' + (new Date(d + 'T00:00:00Z').getTime()).toString(36);
const A = ID('2026-07-01'), B = ID('2026-07-02'), C = ID('2026-07-03');

function seed(o) {
  const cap = o.cap || 2500;
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m) => { add(m, '03', 4200, 'Werkgever', 'SALARIS LOON');
    add(m, '04', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '06', cap, 'Spaarpot', 'NAAR SPAREN', SAV); });
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4200, limit: 70, bufferNorm: 2, nfMaanden: 3,
    savingsEnds: ['4323'], manualBal: { [MAIN]: 3000, [SAV]: 4000 },
    budgets: { huur: 900 }, budgetsNext: {}, budgetMonth: '2026-10',
    savingMode: 'amount', savingAmount: cap,
    nfDoelVast: 4000, nfToegewezen: 4000, nfToegewezenMigrated: 1,
    planOrder: o.order, goals: o.goals,
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await pinDatum(page, o.dag || DAG);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planTerugval === 'function');
  await page.evaluate(() => go('vooruit'));
}
const TV = (page) => page.evaluate(() => planTerugval()
  .map((e) => ({ van: e.van, naar: e.naar, maand: e.maand, vanaf: e.vanaf })));
/* v318: DE OVERDRACHT IS EEN STIPPELLIJN IN DE STROOK ONDER DE VATEN en niet meer een gestippeld
   blok in de tak van de ontvanger. De vorm komt uit de mockup: een elleboog van de kolom van de
   gever naar die van de ontvanger, met een pijlpunt. Eén `.wf-lijn` per overdracht, met de gever EN
   de ontvanger erop; de vier `<i>` erin zijn de stukken (verticaal, horizontaal, verticaal, punt).
   HET OMHULSEL IS NODIG EN GEEN LUXE: zonder hem zijn die vier stukken alleen op volgorde aan
   elkaar te koppelen, en dan leest een tweede overdracht als een deel van de eerste. */
const blokken = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf-kol')]
  .map((t) => {
    const vol = t.querySelector('.wf-tak i[data-takkleur]');
    return { id: t.dataset.id,
      vol: vol ? { w: parseFloat(vol.style.width) } : null,
      erf: [...document.querySelectorAll(`#s-vooruit .wf-lijn[data-erf-naar="${t.dataset.id}"]`)]
        .map((e) => ({ van: e.dataset.erfVan, delen: e.querySelectorAll('i').length })) };
  }));
/* De elleboog in horizontale posities: waar hij begint (de kolom van de gever), waar hij eindigt en
   waar de pijlpunt staat. Alle drie uit de stijl die renderPlan() zelf schrijft, want die is
   deterministisch; er wordt niets na het renderen opgemeten. */
const lijnen = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf-lijn')]
  .map((e) => { const i = [...e.querySelectorAll('i')];
    return { van: e.dataset.erfVan, naar: e.dataset.erfNaar,
      xVan: parseFloat(i[0].style.left), xNaar: parseFloat(i[2].style.left),
      punt: !!i[3] && i[3].classList.contains('p') }; }));
const regels = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit [data-erfregel]')]
  .map((e) => ({ van: e.dataset.erfregel, naar: e.dataset.erfnaar, tekst: e.innerText.trim() })));
/* De middenlijn van kolom k van K, in procenten van de strook. Dezelfde uitdrukking als
   renderPlan(), en dat is hier geen tweede waarheid maar de meting: de spec rekent voor WAAR de
   elleboog hoort te beginnen en te eindigen, en vergelijkt dat met waar hij staat. */
const xMid = (k, K) => (k + 0.5) / K * 100;
const kolVan = (page, id) => page.evaluate((i) => {
  const ks = [...document.querySelectorAll('#s-vooruit .wf-kol')].map((e) => e.dataset.id);
  return { k: ks.indexOf(i), K: ks.length };
}, id);

/* het gemelde plan: een doel dat eerder vol is en zijn ruimte aan het grote doel geeft */
const DOORZAK = { cap: 2500, order: ['noodfonds', A, B], goals: [
  { id: A, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'vast', perMaand: 1980 },
  { id: B, naam: 'Inrichting', doel: 1560, gespaard: 0, streefdatum: '2027-04', allocMode: 'vast', perMaand: 520 }] };

/* ===== a) DE OVERDRACHT KOMT UIT DE PROJECTIE ===== */
test.describe('a · de overdracht komt uit de projectie', () => {
  test('de invoer: het tweede doel is eerder vol en het eerste krijgt zijn ruimte', async ({ page }) => {
    await boot(page, DOORZAK);
    const vol = await page.evaluate(() => planVooruit());
    expect(vol[B]).toBe(3);
    expect(vol[A]).toBe(7);
    // en zonder de terugval zou het grote doel er langer over doen
    const vlak = await page.evaluate((id) => {
      const p = allocatePlan().find((x) => x.id === id); return Math.ceil(p.rest / p.alloc); }, A);
    expect(vlak).toBe(8);
    expect(vol[A]).toBeLessThan(vlak);
  });

  test('planTerugval geeft gever, ontvanger en de maand waarin hij het meet', async ({ page }) => {
    await boot(page, DOORZAK);
    /* `vanaf` is de maand waarin de projectie de stijging MEET. Hier is de gever in maand 3 vol en
       stijgt de ontvanger pas in maand 4, want in maand 3 nam de gever nog zijn laatste rest en
       zakte er niets extra door. */
    expect(await TV(page)).toEqual([{ van: B, naar: A, maand: 3, vanaf: 4 }]);
  });

  /* Hij leent `planVooruit()` en drukt de verdeling niet nog eens uit. De bron bevestigt dat:
     `planTerugval()` noemt `planVooruit(` en geen eigen maandlus. */
  test('hij rekent de verdeling niet na', async ({ page }) => {
    await boot(page, DOORZAK);
    const src = await kaalUit(page, 'planTerugval');
    expect(src).toContain('planVooruit(');
    expect(src).not.toContain('planVerdeelMaand(');
    expect(src).not.toMatch(/for\s*\(\s*let\s+m/);
  });

  /* De twee bestaande lezers geven geen collector mee en zien dus geen verschil. */
  test('de bestaande lezers van planVooruit zijn niet geraakt', async ({ page }) => {
    await boot(page, DOORZAK);
    const r = await page.evaluate(() => {
      const P = allocatePlan(), cap = planCapacity();
      const zonder = planVooruit(P, cap, planGrendel());
      const log = []; const met = planVooruit(P, cap, planGrendel(), log);
      return { gelijk: JSON.stringify(zonder) === JSON.stringify(met), n: log.length };
    });
    expect(r.gelijk).toBe(true);
    expect(r.n).toBeGreaterThan(0);
  });

  test('de laatste bestemming heeft geen ontvanger en levert dus geen overdracht', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A], goals: [
      { id: A, naam: 'Alleen', doel: 5000, gespaard: 0, streefdatum: '2027-06', allocMode: 'auto' }] });
    expect(await page.evaluate(() => planVooruit())[A]).toBeUndefined();
    expect(await TV(page)).toEqual([]);
  });
});

/* ===== b) DE ONTVANGER WORDT GEMETEN ===== */
test.describe('b · de ontvanger wordt gemeten en niet uit de volgorde geraden', () => {
  /* HET ONDERSTE DOEL IS EERDER VOL EN ZIJN RUIMTE GAAT NAAR BOVEN. "De volgende op volgorde" zou
     hier niemand of het verkeerde doel noemen. */
  test('de ruimte kan naar een bestemming BOVEN de gever gaan', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A, B], goals: [
      { id: A, naam: 'Groot langzaam', doel: 15000, gespaard: 0, streefdatum: '2028-05', allocMode: 'vast', perMaand: 500 },
      { id: B, naam: 'Klein snel', doel: 4000, gespaard: 0, streefdatum: '2027-04', allocMode: 'vast', perMaand: 2000 }] });
    const vol = await page.evaluate(() => planVooruit());
    expect(vol[B]).toBeLessThan(vol[A]);                 // de onderste is eerder vol
    const tv = await TV(page);
    expect(tv.length).toBe(1);
    expect(tv[0].van).toBe(B);
    expect(tv[0].naar).toBe(A);                          // en zijn ruimte gaat omhoog
  });

  /* DE BUFFER DIE VOL RAAKT. De ruimte gaat daar via RONDE 1 naar het doel erachter (de grendel
     gaat open en een auto-doel vraagt zijn hele rest), dus `extra` blijft nul. Een maat op `extra`
     laat precies deze overdracht vallen, en dat is de belangrijkste van allemaal. */
  test('en van de buffer naar het doel erachter, waar ronde 2 niets uitdeelt', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A],
      goals: [{ id: A, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'auto' }],
      set: { nfDoelVast: 12000, nfToegewezen: 2000 } });
    expect(await page.evaluate(() => !!planGrendel())).toBe(true);
    const tv = await TV(page);
    expect(tv).toEqual([{ van: 'noodfonds', naar: A, maand: 4, vanaf: 5 }]);
    // de meting die de keuze draagt: ronde 2 deelde in die maand niets uit
    const extra = await page.evaluate(() => {
      const P = allocatePlan(), cap = planCapacity();
      let m5 = null;
      planVooruit(P, cap, planGrendel(), []);
      m5 = P.map((p) => p.extra);
      return m5;
    });
    expect(extra.every((x) => x === 0 || x === undefined)).toBe(true);
  });

  /* DE VULMAAND ZELF. Dit is de stand van het toestel: twee doelen op 90/10 van EUR 2.200. Het grote
     doel is in maand 8 vol en neemt daar alleen nog zijn laatste rest, waardoor de rest van zijn
     aandeel DIEZELFDE maand doorzakt; in maand 9 DAALT de ontvanger juist, want dan is hij zelf
     bijna vol. Alleen op de maand erna meten geeft hier NUL overdrachten, en dan is de stippellijn
     op het gemelde scherm onzichtbaar. Dit is het geval dat de twee meetmomenten onderscheidt
     (meetles o). */
  test('de overdracht kan in de vulmaand zelf vallen, en dat is de stand van het toestel', async ({ page }) => {
    await boot(page, { cap: 2200, order: ['noodfonds', A, B], goals: [
      { id: A, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 90 },
      { id: B, naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'pct', pct: 10 }] });
    const vol = await page.evaluate(() => planVooruit());
    expect(vol[A]).toBe(8);
    expect(vol[B]).toBe(9);
    const tv = await TV(page);
    expect(tv).toEqual([{ van: A, naar: B, maand: 8, vanaf: 8 }]);   // vanaf IS de vulmaand
    // de meting die dat draagt: de ontvanger stijgt in maand 8 en daalt in maand 9
    const reeks = await page.evaluate((id) => {
      const P = allocatePlan(), cap = planCapacity(), G = planGrendel();
      const rows = P.map((p) => ({ id: p.id, type: p.type, mode: p.mode, perMaand: p.perMaand, pct: p.pct,
        doel: p.doel, rest: p.rest, nfOnbekend: !!p.nfOnbekend,
        status: p.status === 'gepauzeerd' ? 'gepauzeerd' : '', houdt: p.type === 'aflossen' }));
      const uit = [];
      for (let m = 1; m <= 10; m++) {
        planVerdeelMaand(rows, cap, planGrendelVan(rows.find((r) => r.type === 'noodfonds'), cap));
        uit.push((rows.find((r) => r.id === id) || {}).alloc);
        for (const r of rows) { if (r.status === 'gepauzeerd' || r.houdt) continue;
          r.rest = Math.max(r.rest - Math.max(r.alloc || 0, 0), 0); }
      }
      return uit;
    }, B);
    expect(reeks[7]).toBeGreaterThan(reeks[6]);   // maand 8 stijgt
    expect(reeks[8]).toBeLessThan(reeks[7]);      // en maand 9 daalt weer
    // en de regel staat op het scherm, bij de ontvanger
    const r = await regels(page);
    expect(r.length).toBe(1);
    expect(r[0].naar).toBe(B);
    expect(r[0].tekst).toBe('vanaf jun 2027 gaat de ruimte van Kosten Koper naar Inrichting woning');
  });

  test('bij een gelijke stijging wint de eerste op volgorde, dus de uitkomst is bepaald', async ({ page }) => {
    const o = { cap: 2400, order: ['noodfonds', A, B, C], goals: [
      { id: A, naam: 'Een', doel: 6000, gespaard: 0, streefdatum: '2028-01', allocMode: 'vast', perMaand: 800 },
      { id: B, naam: 'Twee', doel: 6000, gespaard: 0, streefdatum: '2028-01', allocMode: 'vast', perMaand: 800 },
      { id: C, naam: 'Drie', doel: 800, gespaard: 0, streefdatum: '2027-02', allocMode: 'vast', perMaand: 800 }] };
    await boot(page, o);
    const een = await TV(page);
    await boot(page, o);
    const twee = await TV(page);
    expect(een).toEqual(twee);
  });
});

/* ===== c) DE STIPPELLIJN OP HET SCHERM ===== */
test.describe('c · de stippellijn en de regel', () => {
  /* v317 zette de ruimte van de gever als gestippeld BLOK in de tak van de ontvanger, op de plek en
     de breedte van het segment van de gever. v318 maakt er een elleboog van: hij begint bij de
     KOLOM van de gever en eindigt met een pijlpunt bij die van de ontvanger. Dat is de vorm van de
     mockup, en het zegt meer dan het blok: niet alleen hoeveel er doorzakt maar ook waarvandaan.
     DE PLEK WORDT NAGEREKEND EN NIET OPGEMETEN: de kolommen zijn gelijke breedten, dus de
     middenlijn van kolom k volgt uit k en het aantal kolommen. */
  test('de lijn loopt van de kolom van de gever naar die van de ontvanger', async ({ page }) => {
    await boot(page, DOORZAK);
    const L = await lijnen(page);
    expect(L.length).toBe(1);
    expect(L[0]).toMatchObject({ van: B, naar: A, punt: true });
    const kG = await kolVan(page, B), kR = await kolVan(page, A);
    expect(kG.k).toBeGreaterThanOrEqual(0);
    expect(kR.k).toBeGreaterThanOrEqual(0);
    expect(kG.k, 'de gever staat niet op dezelfde kolom als de ontvanger').not.toBe(kR.k);
    expect(L[0].xVan).toBeCloseTo(xMid(kG.k, kG.K), 2);
    expect(L[0].xNaar).toBeCloseTo(xMid(kR.k, kR.K), 2);
    // en de ontvanger weet het van zijn eigen kant
    const naarA = (await blokken(page)).find((x) => x.id === A);
    expect(naarA.erf.map((e) => e.van)).toEqual([B]);
    expect(naarA.erf[0].delen).toBe(4);
  });

  /* DE SABOTAGE DIE DE BOX-HOOGTE OP HET VAT ZELF ZET BLEEF EERST GROEN, en dat lag aan de
     assertie: blok g las de EERSTE `.wf-vatbox`, en dat is de kolom met het HOOGSTE vat, waar de
     box-hoogte en de vathoogte per constructie samenvallen (meetles a). Wat de twee vormen
     onderscheidt is de kolom met het KLEINE vat: daar is de box nog steeds even hoog als het
     hoogste vat, want anders begint de terugval-strook per kolom op een andere y en hangt de
     stippellijn ergens in de lucht.
     DE STOMP VAN DE GEVER WORDT DAAROM OOK GEMETEN: zijn top is de bodem van het vat van de gever,
     uitgedrukt als afstand tot de strook, en dat is precies `-(maxH - h)`. Die uitdrukking staat in
     renderPlan() en de spec rekent hem na uit de GEMETEN vathoogtes; er wordt niets opgemeten dat de
     app zelf opmeet. */
  test('elke box is even hoog, en de lijn begint op de bodem van het vat van de gever', async ({ page }) => {
    await boot(page, DOORZAK);
    const r = await page.evaluate(() => {
      const z = document.querySelector('#s-vooruit');
      const boxen = [...z.querySelectorAll('.wf-vatbox')].map((e) => Math.round(e.getBoundingClientRect().height));
      const H = {}; for (const v of z.querySelectorAll('.wf-vat')) H[v.dataset.vat] = +v.dataset.h;
      const lijn = z.querySelector('.wf-lijn');
      const i = [...lijn.querySelectorAll('i')];
      return { boxen, H, van: lijn.dataset.erfVan, naar: lijn.dataset.erfNaar,
        topVan: parseFloat(i[0].style.top), topPunt: parseFloat(i[3].style.top) };
    });
    // de invoer: de vaten lopen in hoogte uiteen, anders meet de box-eis niets
    expect(new Set(Object.values(r.H)).size).toBeGreaterThan(1);
    expect(new Set(r.boxen).size, 'boxen: ' + r.boxen.join(',')).toBe(1);
    const maxH = Math.max(...Object.values(r.H));
    expect(r.boxen[0]).toBe(maxH);
    expect(r.topVan).toBeCloseTo(-(maxH - r.H[r.van]), 1);
    expect(r.topPunt).toBeCloseTo(-(maxH - r.H[r.naar]), 1);
  });

  test('de lijn is gestippeld en draagt geen vulling', async ({ page }) => {
    await boot(page, DOORZAK);
    const st = await page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf-lijn i')]
      .map((el) => { const c = getComputedStyle(el);
        return { v: c.borderLeftStyle, h: c.borderTopStyle, bg: c.backgroundColor }; }));
    expect(st.length).toBe(4);
    expect(st[0].v).toBe('dashed');
    expect(st[1].h).toBe('dashed');
    expect(st[2].v).toBe('dashed');
    for (const x of st) expect(x.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });

  test('de regel staat bij de ontvanger, met de maand uit de projectie en de naam van de gever', async ({ page }) => {
    await boot(page, DOORZAK);
    const r = await regels(page);
    expect(r.length).toBe(1);
    expect(r[0].naar).toBe(A);
    expect(r[0].van).toBe(B);
    const e = (await TV(page))[0];
    const lbl = await page.evaluate((m) => etaDatum(m), e.vanaf);
    /* v318: de regel noemt de gever EN de ontvanger. Dat is geen tweede weergave van de lijn maar
       wat hem zelfstandig maakt: zodra gever en ontvanger in verschillende rasterrijen staan is er
       geen lijn, en dan is deze regel de enige drager van de richting. */
    expect(r[0].tekst).toBe(`vanaf ${lbl} gaat de ruimte van Inrichting naar Kosten Koper`);
  });

  /* GEEN BEDRAG IN DE REGEL: het blok draagt de maat en de rij van de gever het getal. Een bedrag
     erbij zou een tweede bron zijn voor datzelfde getal (v104). */
  test('de regel noemt geen bedrag', async ({ page }) => {
    await boot(page, DOORZAK);
    expect((await regels(page))[0].tekst).not.toMatch(/€/);
  });

  test('het noodfonds heet "je noodfonds" en niet "Noodfonds", uit de bestaande bron', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A],
      goals: [{ id: A, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'auto' }],
      set: { nfDoelVast: 12000, nfToegewezen: 2000 } });
    const r = await regels(page);
    expect(r[0].tekst).toContain('je noodfonds');
    expect(r[0].tekst).not.toContain('Noodfonds');
  });

  /* EEN ONTVANGER ZONDER EIGEN INLEG KRIJGT TOCH EEN TAK. Dat is het geval dat telt: een doel dat
     vandaag nul krijgt heeft de terugval als enige vooruitzicht. */
  test('een ontvanger zonder eigen segment heeft een tak met alleen het gestippelde blok', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A],
      goals: [{ id: A, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'auto' }],
      set: { nfDoelVast: 12000, nfToegewezen: 2000 } });
    expect(await page.evaluate((id) => allocatePlan().find((p) => p.id === id).alloc, A)).toBe(0);
    const t = (await blokken(page)).find((x) => x.id === A);
    expect(t.vol, 'geen eigen tak, want hij krijgt vandaag nul').toBe(null);
    expect(t.erf.map((x) => x.van)).toEqual(['noodfonds']);
  });

  test('zonder overdracht staat er geen blok en geen regel', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A], goals: [
      { id: A, naam: 'Alleen', doel: 5000, gespaard: 0, streefdatum: '2027-06', allocMode: 'auto' }] });
    expect(await page.locator('#s-vooruit .wf-lijn').count()).toBe(0);
    expect(await page.locator('#s-vooruit [data-erfregel]').count()).toBe(0);
  });

  test('twee gevers naar hetzelfde doel geven twee blokken en twee regels', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A, B, C], goals: [
      { id: A, naam: 'Groot', doel: 20000, gespaard: 0, streefdatum: '2028-06', allocMode: 'vast', perMaand: 1500 },
      { id: B, naam: 'Midden', doel: 2000, gespaard: 0, streefdatum: '2027-06', allocMode: 'vast', perMaand: 700 },
      { id: C, naam: 'Klein', doel: 600, gespaard: 0, streefdatum: '2027-03', allocMode: 'vast', perMaand: 300 }] });
    const tv = await TV(page);
    expect(tv.length).toBe(2);
    expect(new Set(tv.map((x) => x.naar))).toEqual(new Set([A]));
    const t = (await blokken(page)).find((x) => x.id === A);
    expect(t.erf.length).toBe(2);
    expect((await regels(page)).length).toBe(2);
    /* TWEE LIJNEN OP VERSCHILLENDE HOOGTE, anders liggen ze over elkaar en leest het als één
       overdracht. De y-afstand komt uit de index in de strook en wordt hier niet nagerekend; wat
       vastligt is dat ze verschillen. */
    const ys = await page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf-lijn i.h')]
      .map((e) => parseFloat(e.style.top)));
    expect(new Set(ys).size).toBe(2);
  });
});

/* ===== d) DE MARGE IN HET DATUMPAAR ===== */
test.describe('d · de marge komt uit dezelfde sp als "net op tijd"', () => {
  const RUIM = { cap: 2500, order: ['noodfonds', A, B], goals: [
    { id: A, naam: 'Ruim', doel: 2000, gespaard: 0, streefdatum: '2027-08', allocMode: 'vast', perMaand: 1000 },
    { id: B, naam: 'Tweede', doel: 20000, gespaard: 0, streefdatum: '2029-01', allocMode: 'vast', perMaand: 1500 }] };

  test('met speling noemt het vat het aantal maanden, en dat is maandenTot min eta', async ({ page }) => {
    await boot(page, RUIM);
    const r = await page.evaluate((id) => {
      const p = allocatePlan().find((x) => x.id === id);
      const T = doelTempo(p, p.alloc);
      const R = vatRegels(p);
      return { eta: p.eta, tot: T.maandenTot, regels: R.regels, vol: R.vol };
    }, A);
    const sp = r.tot - r.eta;
    expect(sp).toBeGreaterThan(0);
    /* v318: het datumpaar is GESPLITST. "vol" met zijn datum staat apart boven de regels (besluit 2
       van die ronde: naam, bedrag, vol met datum, streefdatum en marge), en de regels dragen de
       streefdatum en de marge. De SPELING blijft hetzelfde getal uit dezelfde `sp`. */
    expect(r.vol).toEqual({ woord: 'vol', datum: await page.evaluate((n) => etaDatum(n), r.eta) });
    expect(r.regels.length).toBe(2);
    expect(r.regels[0]).toMatch(/^moet in \w+ \d{4}$/);
    expect(r.regels[1]).toBe(`${sp} ${sp === 1 ? 'maand' : 'maanden'} speling`);
  });

  test('bij nul of minder speling blijft "net op tijd" staan en komt er geen getal', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A], goals: [
      { id: A, naam: 'Precies', doel: 7500, gespaard: 0, streefdatum: '2027-01', allocMode: 'auto' }] });
    const r = await page.evaluate((id) => {
      const p = allocatePlan().find((x) => x.id === id);
      const T = doelTempo(p, p.alloc);
      return { sp: T.maandenTot - p.eta, regels: vatRegels(p).regels };
    }, A);
    expect(r.sp).toBeLessThanOrEqual(0);
    expect(r.regels).toContain('net op tijd');
    expect(r.regels.join(' ')).not.toContain('speling');
  });

  test('en een doel dat te laat is noemt geen speling', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A], goals: [
      { id: A, naam: 'Te laat', doel: 30000, gespaard: 0, streefdatum: '2027-01', allocMode: 'auto' }] });
    const r = await page.evaluate((id) => vatRegels(allocatePlan().find((x) => x.id === id)), A);
    expect(r.laat).toBe(true);
    expect(r.regels.join(' ')).not.toContain('speling');
  });

  /* De speling en "net op tijd" komen uit dezelfde uitdrukking: de bron van vatRegels() rekent
     `T.maandenTot - p.eta` precies EEN keer. */
  test('de speling wordt een keer gerekend', async ({ page }) => {
    await boot(page, RUIM);
    const src = await kaalUit(page, 'vatRegels');
    expect((src.match(/maandenTot\s*-\s*p\.eta/g) || []).length).toBe(1);
  });
});

/* ===== e) DE MINIMUMBREEDTE BLIJFT IN DE SEGMENTEN =====
   v317 legde vast dat de tak en het balksegment dezelfde minimumbreedte EN dezelfde geometrie
   delen, want de tak lag toen in het assenstelsel van de balk: hij droeg `left` en `width` in
   procenten, net als het segment.
   v318 HAALT DAT ASSENSTELSEL WEG, en daarmee de helft van die regel die over de tak ging: de tak
   staat verticaal boven zijn eigen vat en zijn maat is een DIKTE in pixels (zie
   plan-vaten-naast-elkaar.spec.js blok c). Er is dus geen gedeelde plek meer om te laten uiteenlopen.
   WAT BLIJFT STAAN IS DE BALK-HELFT, en die is onveranderd: `SEG_MIN_PCT` staat in de SEGMENTEN en
   dus in de data, de balk staat absoluut zodat de som boven 100 procent geen enkel segment laat
   krimpen, en een segment van nul blijft nul. Zonder die helft zou een bestemming die bijna niets
   krijgt uit de balk verdwijnen. */
test.describe('e · de minimumbreedte van een segment', () => {
  const MINI = { cap: 2200, order: ['noodfonds', A, B], goals: [
    { id: A, naam: 'Groot', doel: 50000, gespaard: 0, streefdatum: '2029-01', allocMode: 'pct', pct: 99.5 },
    { id: B, naam: 'Mini', doel: 600, gespaard: 0, streefdatum: '2027-06', allocMode: 'pct', pct: 0.5 }] };

  for (const w of [360, 390]) {
    test(`op ${w}px blijft een segment onder 1 procent zichtbaar en krimpt er niets`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w === 360 ? 640 : 844 });
      await boot(page, MINI);
      // de invoer: er IS een aandeel onder de minimumbreedte
      expect(await page.evaluate((id) => {
        const P = allocatePlan(); return P.find((p) => p.id === id).alloc / planCapacity() * 100; }, B))
        .toBeLessThan(1);
      const r = await page.evaluate(() => {
        const balk = document.querySelector('#s-vooruit .inleg-balk');
        const bb = balk.getBoundingClientRect();
        const seg = {}; for (const e of balk.querySelectorAll('.bar-fill'))
          seg[e.dataset.seg] = Math.round(e.getBoundingClientRect().width * 100) / 100;
        return { seg, balk: Math.round(bb.width),
          pos: getComputedStyle(balk.querySelector('.bar-fill')).position,
          disp: getComputedStyle(balk).display };
      });
      expect(r.seg[B]).toBeCloseTo(r.balk / 100, 1);     // precies de minimumbreedte van 1 procent
      /* ABSOLUUT EN GEEN FLEX, en dat is de meting van v317 die hier staande blijft: met de
         minimumbreedte erin kan de som boven 100 procent uitkomen, en flex zou dan ALLE segmenten
         proportioneel laten krimpen. Dan is het kleine segment opeens 2,98px in plaats van 3px. */
      expect(r.pos).toBe('absolute');
      expect(r.disp).not.toBe('flex');
    });
  }

  test('de minimumbreedte staat in de segmenten en niet in de CSS van een lezer', async ({ page }) => {
    await boot(page, MINI);
    const src = await kaalUit(page, 'planSegmenten');
    expect(src).toContain('SEG_MIN_PCT');
    const rp = await kaalUit(page, 'renderPlan');
    expect(rp).not.toContain('min-width:3px');
    /* En de tak-CSS draagt geen eigen minimum. Sinds v318 heet die klasse `.wf-tak i` en is zijn
       maat een dikte in px; een `min-width` daar zou een tweede ondergrens zijn naast de 2px die
       planTakDikte() al klemt (v104). */
    const css = await page.evaluate(() => [...document.styleSheets]
      .flatMap((s) => { try { return [...s.cssRules]; } catch (_) { return []; } })
      .filter((r) => r.selectorText && /\.(plan-tak|wf-tak) i$/.test(r.selectorText))
      .map((r) => r.style.minWidth));
    expect(css.every((x) => !x)).toBe(true);
  });

  test('een segment van nul blijft nul: de minimumbreedte geldt alleen voor wat iets krijgt', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A, B], goals: [
      { id: A, naam: 'Alles', doel: 50000, gespaard: 0, streefdatum: '2029-01', allocMode: 'auto' },
      { id: B, naam: 'Niets', doel: 600, gespaard: 0, streefdatum: '2027-06', allocMode: 'vast', perMaand: 0 }] });
    const seg = await page.evaluate(() => planSegmenten(allocatePlan(), planCapacity()).segs);
    const sB = seg.find((x) => x.id === B);
    expect(sB.alloc).toBe(0);
    expect(sB.breed).toBe(0);
    expect(await page.locator('#s-vooruit .inleg-balk .bar-fill[data-seg="' + B + '"]').count()).toBe(0);
    // en dan is er ook geen tak, want die maat IS het maandbedrag
    expect(await page.locator('#s-vooruit .wf-kol[data-id="' + B + '"] .wf-tak i[data-takkleur]').count()).toBe(0);
  });
});

/* ===== f) DE UITLEG ZEGT WAT ER STAAT =====
   v317 haalde hier een BELOFTE weg die de code niet had: de uitleg zei nog "de hoogte van een vat
   is het doelbedrag" terwijl v248 elke balk gelijk had gemaakt. v318 maakt die belofte weer WAAR,
   en dan hoort hij er juist te staan. Wat deze groep vasthoudt is daarom omgedraaid: de uitleg
   noemt de schaal, de bodem en de markering, en hij wijst nergens naar iets dat er niet is. */
test.describe('f · de uitleg achter het info-icoon', () => {
  const uitleg = (page) => page.evaluate(() => {
    const el = document.createElement('div'); el.innerHTML = (NOTES.planUitleg || '');
    return el.innerText;
  });

  test('de uitleg noemt de schaal, de bodem, de markering en het streepje', async ({ page }) => {
    await boot(page, DOORZAK);
    const t = await uitleg(page);
    expect(t).toMatch(/hoogte van een vat is het doelbedrag/i);
    expect(t).toMatch(/minimumhoogte/i);
    expect(t).toMatch(/gestippelde bovenrand/i);
    expect(t).toContain('streepje');
    expect(t).toMatch(/dikte van de tak/i);
    expect(t).toMatch(/stippellijn/i);
  });

  test('en hij wijst niet naar pijlen of een tijdas die er niet zijn', async ({ page }) => {
    await boot(page, DOORZAK);
    const t = await uitleg(page);
    /* v317 verbood hier het woord "pijl", want de twee pijltjes waarmee je een bestemming
       verplaatste waren toen weg. v318 heeft WEL een pijl: de punt op de stippellijn. Wat verboden
       blijft is dus het PIJLTJE als bediening, en dat is een ander woord. */
    expect(t).not.toMatch(/pijltje/i);
    expect(t).toMatch(/stippellijn met de pijl/i);
    expect(t).not.toMatch(/tijdas/i);
    /* "dezelfde balk" was de v248-formulering en is sinds v318 onwaar: de vaten staan op schaal.
       Een uitleg die beide beweringen draagt is erger dan een die er een draagt. */
    expect(t).not.toContain('dezelfde balk');
  });

  /* De CSS-comments beloven hetzelfde als de uitleg. Een bronzoekende assertie, want een comment is
     voor de volgende ronde net zo sturend als een label op het scherm (v276/v277). */
  test('de CSS-comments bij de waterval beloven geen gelijke hoogte meer', async ({ page }) => {
    await boot(page, DOORZAK);
    const css = await page.evaluate(() => {
      const st = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
      const i = st.indexOf('.wf{position:relative');
      const j = st.indexOf('.sr-only{');
      return st.slice(Math.max(st.lastIndexOf('/*', i), 0), j);
    });
    expect(css).not.toMatch(/voor elke bestemming even hoog/);
    expect(css).toMatch(/v318/);
    expect(css).toMatch(/niet op schaal/i);
  });
});

/* ===== g) DE PRIJS IN PIXELS, GEMETEN OP DE STAND VAN HET TOESTEL =====
   Twee doelen op 90/10 van EUR 2.200, een volle buffer, en geen reserveringenlijst.
   v318 KOST HOOGTE, EN DAT IS GEMETEN EN NIET WEGGEREKEND. De waterval-kaart gaat op 360px van
   526px (v317) naar 697px, en op 390px van 506 naar 679: PLUS 171 EN PLUS 173 PIXELS. De hele zone
   gaat van 835 naar 1006 en van 814 naar 988.
   WAAR DIE 171px ZIT, en dat is het getal dat de volgende ronde nodig heeft:
   - de kolom is 224px (de tak van 44 plus het hoogste vat van 180), en bij doelen ONDER elkaar
     kostte elke bestemming 144px, dus twee bestemmingen 288. De vaten naast elkaar winnen daar 64px.
   - het TEKSTBLOK is 192px op 360px en 174px op 390px, en dat is waar de winst weer heen gaat. Elke
     kolom is 120px breed op 360 en 133 op 390, en de tekst schaalt NIET mee (besluit v318: op elk
     toestel de vaste tekstgrootte van de app), dus naam, maandbedrag, stand, vol-datum en het
     datumpaar breken alle vijf af. Twee bestemmingen onder elkaar droegen diezelfde tekst over de
     volle breedte en hadden hem niet nodig.
   - 18px daarvan is het MAANDBEDRAG, dat bij twee kolommen naar het tekstblok zakt. Naast de tak
     staan kan daar niet: dat label staat absoluut vanaf de middenlijn en breekt niet af, dus het
     liep over de buurkolom heen. Bij EEN kolom staat het er wel naast en kost het nul.
   - de strook met de stippellijn kost 23px, en de regel eronder 36px.
   ALLE TEKSTBLOKKEN ZIJN EVEN HOOG, want ze staan in EEN rasterrij. Dat is met opzet: zo beginnen
   de regels van alle kolommen op dezelfde hoogte, ook als het ene vat 180px is en het andere 40px.
   De prijs is dat de HOOGSTE tekst de hoogte van alle kolommen zet.
   MET DRIE DOELEN IS DE KOLOM 77px BREED OP 360 EN 86px OP 390, en dan is het tekstblok 228px en de
   kaart 788px op BEIDE breedtes. Dat is de prijs van de derde kolom: 54px tekst erbij.
   DE LAATSTE BESTEMMING VALT OP 360px ONDER DE VOUW: de waterval eindigt op 737px bij een vouw van
   567. Op 390px eindigt hij op 719 bij 771 en past hij dus nog net. Op 360px is dat een echte
   achteruitgang tegenover v317 (566 van 567, met EEN pixel marge) en hij staat hier als assertie
   zodat hij niet als detail wegzakt. NIET INGEKORT: de opdracht was de hoogte MELDEN voordat er iets
   wordt ingekort. */
test.describe('g · de hoogte op het toestel', () => {
  const TOESTEL = { cap: 2200, order: ['noodfonds', A, B], goals: [
    { id: A, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 90 },
    { id: B, naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'pct', pct: 10 }] };
  const PX = {
    360: { vouw: 567, kaart: 697, nf: 55, wf: 491, tekst: 192, vatB: 120, tot: 737, zone: 1006, v317kaart: 526 },
    390: { vouw: 771, kaart: 679, nf: 55, wf: 473, tekst: 174, vatB: 133, tot: 719, zone: 988, v317kaart: 506 },
  };

  for (const w of [360, 390]) {
    test(`${w}px: de kaart, de kolommen en de tekst`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w === 360 ? 640 : 844 });
      await boot(page, TOESTEL);
      const d = await page.evaluate(() => {
        const nav = document.querySelector('nav,.nav,#nav');
        const z = document.querySelector('#s-vooruit');
        const h = (e) => (e ? Math.round(e.getBoundingClientRect().height) : null);
        const kaart = [...z.querySelectorAll('.card')].find((c) => c.querySelector('.inleg-balk'));
        const regel = [...z.querySelectorAll('.small.mut2')].find((x) => /te gaan/.test(x.innerText));
        const wf = z.querySelector('.wf');
        return { vouw: window.innerHeight - (nav ? Math.round(nav.getBoundingClientRect().height) : 0),
          kaart: h(kaart), nf: h(z.querySelector('.plan-rij.vat-vol')), wf: h(wf),
          kolom: h(z.querySelector('.wf-kol')), vatbox: h(z.querySelector('.wf-vatbox')),
          vaten: [...z.querySelectorAll('.wf-vat')].map((v) => Math.round(v.getBoundingClientRect().height)),
          vatB: Math.round(z.querySelector('.wf-vat').getBoundingClientRect().width),
          teksten: [...z.querySelectorAll('.wf-tekst')].map(h),
          erf: h(z.querySelector('.wf-erf')), erfRegel: h(z.querySelector('[data-erfregel]')),
          regel: h(regel), tot: Math.round(wf.getBoundingClientRect().bottom + window.scrollY),
          zone: h(z), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      const p = PX[w];
      expect(d.vouw).toBe(p.vouw);
      expect(d.kaart).toBe(p.kaart);
      expect(d.nf).toBe(p.nf);
      expect(d.wf).toBe(p.wf);
      // de kolom is de tak plus het HOOGSTE vat, en het kleine vat staat op de bodem
      expect(d.kolom).toBe(44 + 180);
      expect(d.vatbox).toBe(180);
      expect(d.vaten).toEqual([180, 40]);
      expect(d.vatB).toBe(p.vatB);
      // alle tekstblokken even hoog, want ze staan in een rasterrij
      expect(new Set(d.teksten).size).toBe(1);
      expect(d.teksten[0]).toBe(p.tekst);
      expect(d.erf).toBe(23);
      expect(d.erfRegel).toBe(36);
      expect(d.regel).toBe(38);
      expect(d.tot).toBe(p.tot);
      expect(d.zone).toBe(p.zone);
      expect(d.overflow).toBeLessThanOrEqual(1);
      /* DE ACHTERUITGANG STAAT ALS ASSERTIE, want anders zakt hij weg als detail. De v317-kaart
         staat hier als getal en niet als meting: hij is niet meer te draaien. */
      expect(d.kaart - p.v317kaart).toBeGreaterThan(165);
    });
  }

  /* 360px: de waterval valt onder de vouw. Bij v317 eindigde de laatste bestemming op 566 van 567,
     met EEN pixel marge; nu eindigt hij op 719. Op 390px past hij nog net (701 van 771). */
  test('360px valt de waterval onder de vouw, 390px niet', async ({ page }) => {
    const uit = {};
    for (const [w, h] of [[360, 640], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await boot(page, TOESTEL);
      uit[w] = await page.evaluate(() => {
        const nav = document.querySelector('nav,.nav,#nav');
        const wf = document.querySelector('#s-vooruit .wf');
        return { vouw: window.innerHeight - (nav ? Math.round(nav.getBoundingClientRect().height) : 0),
          tot: Math.round(wf.getBoundingClientRect().bottom + window.scrollY) };
      });
    }
    expect(uit[360].tot).toBeGreaterThan(uit[360].vouw);
    expect(uit[390].tot).toBeLessThan(uit[390].vouw);
  });

  /* Met drie doelen is de kolom 77px breed op 360 en 86px op 390, en dan breekt de tekst verder af:
     228px op BEIDE breedtes, dus de kaart is daar even hoog. Dat is de prijs van de derde kolom. */
  test('met drie doelen is het tekstblok 228px en de kaart op beide breedtes gelijk', async ({ page }) => {
    const DRIE = { cap: 2200, order: ['noodfonds', A, B, C], goals: [
      { id: A, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 60 },
      { id: B, naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'pct', pct: 30 },
      { id: C, naam: 'Vakantie', doel: 900, gespaard: 0, streefdatum: '2027-08', allocMode: 'pct', pct: 10 }] };
    const uit = {};
    for (const [w, h] of [[360, 640], [390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await boot(page, DRIE);
      uit[w] = await page.evaluate(() => {
        const z = document.querySelector('#s-vooruit');
        const H = (e) => Math.round(e.getBoundingClientRect().height);
        const kaart = [...z.querySelectorAll('.card')].find((c) => c.querySelector('.inleg-balk'));
        return { kaart: H(kaart), wf: H(z.querySelector('.wf')),
          tekst: H(z.querySelector('.wf-tekst')),
          vatB: Math.round(z.querySelector('.wf-vat').getBoundingClientRect().width),
          kolommen: z.querySelectorAll('.wf-kol').length,
          erf: H(z.querySelector('.wf-erf')),
          regels: [...z.querySelectorAll('[data-erfregel]')].map((e) => e.dataset.erfnaar) };
      });
    }
    for (const w of [360, 390]) {
      expect(uit[w].kolommen, w + ' kolommen').toBe(3);
      expect(uit[w].tekst, w + ' tekst').toBe(228);
      expect(uit[w].wf, w + ' wf').toBe(582);
      expect(uit[w].kaart, w + ' kaart').toBe(788);
      expect(uit[w].erf, w + ' strook').toBe(34);          // twee lijnen in plaats van een
      expect(uit[w].regels, w + ' regels').toEqual([A, A]);  // twee gevers, een ontvanger
    }
    expect(uit[360].vatB).toBe(77);
    expect(uit[390].vatB).toBe(86);
  });
});
