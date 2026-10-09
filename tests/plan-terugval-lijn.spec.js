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
/* v367: de regels staan in de tijdlijn (openPlanTijdlijn()) en niet meer onder de vaten. */
const regels = (page) => page.evaluate(() => { openPlanTijdlijn(); const r = [...document.querySelectorAll('#planTijdlijn [data-erfregel]')]
  .map((e) => ({ van: e.dataset.erfregel, naar: e.dataset.erfnaar, tekst: e.innerText.trim() })); closeSheet(); return r; });
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
    expect((await regels(page)).length).toBe(2);
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
  });
});

/* ===== f) DE UITLEG ZEGT WAT ER STAAT =====
   v367: de vaten zijn rijen geworden, en de uitleg zegt dat. Hij wijst nergens naar iets dat er niet is: geen vat,
   geen tak en geen stippellijn. De hoogte van Plan staat sinds v367 in vrij-uitschieters.spec.js d. */
test.describe('f · de uitleg achter het info-icoon', () => {
  const uitleg = (page) => page.evaluate(() => {
    const el = document.createElement('div'); el.innerHTML = (NOTES.planUitleg || '');
    return el.innerText;
  });
  test('de uitleg noemt de rij, het streepje en de tijdlijn, en geen vat of tak', async ({ page }) => {
    await boot(page, DOORZAK);
    const t = await uitleg(page);
    expect(t).toContain('streepje');
    expect(t).toMatch(/tijdlijn/i);
    expect(t).not.toMatch(/\bvat\b|dikte van de tak|stippellijn|pijltje|tijdas/i);
  });
});
