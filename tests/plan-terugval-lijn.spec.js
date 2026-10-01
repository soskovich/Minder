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
const blokken = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .plan-tak')]
  .map((t) => {
    const vol = t.querySelector('i[data-takkleur]');
    return { id: t.dataset.tak,
      vol: vol ? { l: vol.style.left, w: vol.style.width } : null,
      erf: [...t.querySelectorAll('i.tak-erf')].map((e) => ({ van: e.dataset.erf, l: e.style.left, w: e.style.width })) };
  }));
const regels = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit [data-erfregel]')]
  .map((e) => ({ van: e.dataset.erfregel, tekst: e.innerText.trim(),
    rij: e.closest('.plan-item').dataset.id })));

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
    expect(r[0].rij).toBe(B);
    expect(r[0].tekst).toBe('vanaf jun 2027 ook de ruimte van Kosten Koper');
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
  test('de ontvanger draagt een gestippeld blok op de plek van het segment van de gever', async ({ page }) => {
    await boot(page, DOORZAK);
    const seg = await page.evaluate(() => planSegmenten(allocatePlan(), planCapacity()).segs);
    const bl = await blokken(page);
    const naarA = bl.find((x) => x.id === A);
    const sB = seg.find((x) => x.id === B);
    expect(naarA.erf.length).toBe(1);
    expect(naarA.erf[0].van).toBe(B);
    /* DEZELFDE getallen als het segment van de gever, en dus als zijn eigen tak. De browser
       normaliseert '79.20%' naar '79.2%', dus de vergelijking gaat over het getal. */
    const pct = (v) => Math.round(parseFloat(v) * 100) / 100;
    expect(pct(naarA.erf[0].l)).toBeCloseTo(sB.van, 2);
    expect(pct(naarA.erf[0].w)).toBeCloseTo(sB.breed, 2);
    const takB = bl.find((x) => x.id === B);
    expect(pct(takB.vol.l)).toBeCloseTo(pct(naarA.erf[0].l), 2);
    expect(pct(takB.vol.w)).toBeCloseTo(pct(naarA.erf[0].w), 2);
  });

  test('het blok is gestippeld en draagt geen vulling', async ({ page }) => {
    await boot(page, DOORZAK);
    const st = await page.evaluate(() => {
      const el = document.querySelector('#s-vooruit .plan-tak i.tak-erf');
      const c = getComputedStyle(el);
      return { stijl: c.borderBottomStyle, bg: c.backgroundColor };
    });
    expect(st.stijl).toBe('dashed');
    expect(st.bg).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  });

  test('de regel staat bij de ontvanger, met de maand uit de projectie en de naam van de gever', async ({ page }) => {
    await boot(page, DOORZAK);
    const r = await regels(page);
    expect(r.length).toBe(1);
    expect(r[0].rij).toBe(A);
    expect(r[0].van).toBe(B);
    const e = (await TV(page))[0];
    const lbl = await page.evaluate((m) => etaDatum(m), e.vanaf);
    expect(r[0].tekst).toBe(`vanaf ${lbl} ook de ruimte van Inrichting`);
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
    expect(t.vol).toBe(null);
    expect(t.erf.map((x) => x.van)).toEqual(['noodfonds']);
  });

  test('zonder overdracht staat er geen blok en geen regel', async ({ page }) => {
    await boot(page, { cap: 2500, order: ['noodfonds', A], goals: [
      { id: A, naam: 'Alleen', doel: 5000, gespaard: 0, streefdatum: '2027-06', allocMode: 'auto' }] });
    expect(await page.locator('#s-vooruit .tak-erf').count()).toBe(0);
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
      return { eta: p.eta, tot: T.maandenTot, regels: vatRegels(p).regels };
    }, A);
    const sp = r.tot - r.eta;
    expect(sp).toBeGreaterThan(0);
    expect(r.regels.length).toBe(1);
    expect(r.regels[0]).toContain(`${sp} ${sp === 1 ? 'maand' : 'maanden'} speling`);
    expect(r.regels[0]).toMatch(/^vol in \w+ \d{4} · moet in \w+ \d{4} · \d+ maanden? speling$/);
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

/* ===== e) TAK EN BALKSEGMENT ZIJN EVEN BREED ===== */
test.describe('e · tak en balksegment, ook onder 1 procent', () => {
  const MINI = { cap: 2200, order: ['noodfonds', A, B], goals: [
    { id: A, naam: 'Groot', doel: 50000, gespaard: 0, streefdatum: '2029-01', allocMode: 'pct', pct: 99.5 },
    { id: B, naam: 'Mini', doel: 600, gespaard: 0, streefdatum: '2027-06', allocMode: 'pct', pct: 0.5 }] };

  for (const w of [360, 390]) {
    test(`op ${w}px zijn de twee even breed en staan ze op dezelfde plek`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w === 360 ? 640 : 844 });
      await boot(page, MINI);
      const r = await page.evaluate(() => {
        const balk = document.querySelector('#s-vooruit .inleg-balk');
        const bb = balk.getBoundingClientRect();
        const px = (e) => { const b = e.getBoundingClientRect();
          return { l: Math.round((b.left - bb.left) * 100) / 100, w: Math.round(b.width * 100) / 100 }; };
        const seg = {}; for (const e of balk.querySelectorAll('.bar-fill')) seg[e.dataset.seg] = px(e);
        const tak = {}; for (const t of document.querySelectorAll('#s-vooruit .plan-tak')) {
          const v = t.querySelector('i[data-takkleur]'); if (v) tak[t.dataset.tak] = px(v); }
        return { seg, tak, balk: Math.round(bb.width) };
      });
      // de invoer: er IS een segment onder de minimumbreedte
      expect(await page.evaluate((id) => {
        const P = allocatePlan(); return P.find((p) => p.id === id).alloc / planCapacity() * 100; }, B))
        .toBeLessThan(1);
      for (const id of [A, B]) {
        expect(r.seg[id], `${id} breedte`).toEqual(r.tak[id]);
      }
      // en het kleine segment is op beide plekken de minimumbreedte van 1 procent
      expect(r.seg[B].w).toBeCloseTo(r.balk / 100, 1);
    });
  }

  test('de minimumbreedte staat in de segmenten, zodat beide lezers hem delen', async ({ page }) => {
    await boot(page, MINI);
    const src = await kaalUit(page, 'planSegmenten');
    expect(src).toContain('SEG_MIN_PCT');
    const rp = await kaalUit(page, 'renderPlan');
    expect(rp).not.toContain('min-width:3px');
    // en de tak-CSS draagt hem niet meer
    const css = await page.evaluate(() => [...document.styleSheets]
      .flatMap((s) => { try { return [...s.cssRules]; } catch (_) { return []; } })
      .filter((r) => r.selectorText && /\.plan-tak i$/.test(r.selectorText))
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

/* ===== f) DE UITLEG BELOOFT GEEN HOOGTE MEER ===== */
test.describe('f · de uitleg achter het info-icoon', () => {
  test('geen belofte over de hoogte van een balk', async ({ page }) => {
    await boot(page, DOORZAK);
    const t = await page.evaluate(() => {
      const el = document.createElement('div'); el.innerHTML = NOTES.planUitleg || '';
      return el.innerText;
    });
    expect(t).not.toMatch(/hoogte/i);
    expect(t).not.toMatch(/tijdas/i);
    // en hij zegt wat er wel staat
    expect(t).toContain('dezelfde balk');
    expect(t).toContain('voortgang in procenten');
    expect(t).toContain('streepje');
  });

  test('en hij wijst niet meer naar pijlen die er niet zijn', async ({ page }) => {
    await boot(page, DOORZAK);
    const t = await page.evaluate(() => {
      const el = document.createElement('div'); el.innerHTML = NOTES.planUitleg || '';
      return el.innerText;
    });
    expect(t).not.toMatch(/pijl/i);
  });

  /* De twee CSS-comments beloofden hetzelfde. Een bronzoekende assertie, want een comment is voor
     de volgende ronde net zo sturend als een label op het scherm (v276/v277). */
  test('de CSS-comments bij .vat en .vat-laat beloven geen hoogte en geen stippelrand', async ({ page }) => {
    await boot(page, DOORZAK);
    const css = await page.evaluate(() => {
      const st = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n');
      const i = st.indexOf('.vat{position:relative');
      const j = st.indexOf('.vat-vol{');
      return st.slice(Math.max(st.lastIndexOf('/*', i), 0), j);
    });
    /* De comments mogen de oude vorm wel als GESCHIEDENIS noemen; wat er niet meer mag staan is een
       bewering in de tegenwoordige tijd over een hoogte of een rand die deze regels niet zetten. */
    expect(css).not.toMatch(/Hoogte is het doelbedrag/);
    expect(css).not.toMatch(/staat op de minimumhoogte/);
    expect(css).not.toMatch(/de gestippelde bovenrand zegt dat/);
    expect(css).toMatch(/v317/);
    expect(css).toMatch(/voor elke bestemming even hoog/);
  });
});

/* ===== g) DE PRIJS IN PIXELS, GEMETEN OP DE STAND VAN HET TOESTEL =====
   Twee doelen op 90/10 van EUR 2.200, een volle buffer, en een reserveringspost. De getallen staan
   hier vast zodat een volgende ronde ziet wat deze uitgeeft.
   WAT DEZE RONDE KOST: de terugval-regel is 21px op de ontvanger. WAT HIJ OPLEVERT: de twee
   pijltjes zijn weg (de ingeklapte noodfonds-rij gaat van 65 naar 55px) en de alinea onder de
   waterval gaat van 113 naar 38px op 360px. Netto is de kaart 64px lager en de hele zone 94px.
   DE LAATSTE BESTEMMING EINDIGT OP 566px BIJ EEN VOUW VAN 567, dus met EEN pixel marge. Dat is
   gemeten en niet weggerekend: de regel die er bij kwam past net, en een regel erbij past niet.
   OP 390x844 IS ER RUIMTE: daar eindigt de laatste bestemming op 544 van 771 en past ook de regel
   onder de waterval (tot 612) in het eerste scherm. */
test.describe('g · de hoogte op het toestel', () => {
  const TOESTEL = { cap: 2200, order: ['noodfonds', A, B], goals: [
    { id: A, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 90 },
    { id: B, naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'pct', pct: 10 }] };
  /* DE ZONE IS DIE VAN DEZE FIXTURE en niet die van het toestel: hier staat geen
     reserveringenlijst, dus de kaart eronder is de kale 'instellen'-vorm. Op de gemeten stand van
     het toestel (met een post van EUR 299 en een pot van EUR 37) is de zone 946px op 360 en 926px
     op 390; dat verschil van 111px is die kaart en niet de waterval. */
  const PX = {
    360: { vouw: 567, kaart: 526, nf: 55, zonderErf: 144, metErf: 165, regel: 38, laatsteTot: 566, zone: 835 },
    390: { vouw: 771, kaart: 506, nf: 55, zonderErf: 144, metErf: 165, regel: 38, laatsteTot: 545, zone: 814 },
  };

  for (const w of [360, 390]) {
    test(`${w}px: de kaart, de rijen en de regel`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: w === 360 ? 640 : 844 });
      await boot(page, TOESTEL);
      const d = await page.evaluate(() => {
        const nav = document.querySelector('nav,.nav,#nav');
        const z = document.querySelector('#s-vooruit');
        const h = (e) => (e ? Math.round(e.getBoundingClientRect().height) : null);
        const bot = (e) => Math.round(e.getBoundingClientRect().bottom + window.scrollY);
        const kaart = [...z.querySelectorAll('.card')].find((c) => c.querySelector('.inleg-balk'));
        const regel = [...z.querySelectorAll('.small.mut2')].find((x) => /te gaan/.test(x.innerText));
        const rij = [...z.querySelectorAll('.plan-rij')];
        return { vouw: window.innerHeight - (nav ? Math.round(nav.getBoundingClientRect().height) : 0),
          kaart: h(kaart), rijen: rij.map(h), erf: rij.map((e) => e.querySelectorAll('[data-erfregel]').length),
          regel: h(regel), laatsteTot: bot(rij[rij.length - 1]), zone: h(z),
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      const p = PX[w];
      expect(d.vouw).toBe(p.vouw);
      expect(d.kaart).toBe(p.kaart);
      expect(d.rijen).toEqual([p.nf, p.zonderErf, p.metErf]);
      expect(d.erf).toEqual([0, 0, 1]);              // alleen de ontvanger draagt de regel
      expect(d.rijen[2] - d.rijen[1]).toBe(21);      // wat de terugval-regel kost
      expect(d.regel).toBe(p.regel);
      expect(d.laatsteTot).toBe(p.laatsteTot);
      expect(d.zone).toBe(p.zone);
      expect(d.overflow).toBeLessThanOrEqual(1);
    });
  }

  /* De bestemmingen blijven binnen het eerste scherm, op 360px met EEN pixel marge. Dat is geen
     comfortabele marge en het staat er daarom als eigen assertie: een regel erbij valt eronder. */
  test('360px: de laatste bestemming blijft boven de vouw, met één pixel marge', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await boot(page, TOESTEL);
    const r = await page.evaluate(() => {
      const nav = document.querySelector('nav,.nav,#nav');
      const rij = [...document.querySelectorAll('#s-vooruit .plan-rij')];
      return { vouw: window.innerHeight - (nav ? Math.round(nav.getBoundingClientRect().height) : 0),
        tot: Math.round(rij[rij.length - 1].getBoundingClientRect().bottom + window.scrollY) };
    });
    expect(r.tot).toBeLessThan(r.vouw);
    expect(r.vouw - r.tot).toBe(1);
  });

  /* Met drie doelen past de waterval niet meer in het eerste scherm, en dat was vóór deze ronde al
     zo (gemeten: de derde bestemming eindigde toen op 554 van 567 en de vierde viel eronder). De
     terugval verandert dat niet; wat hij kost is 21px per ontvanger. */
  test('met drie doelen groeit de kaart, en de terugval kost 21px per regel', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await boot(page, { cap: 2200, order: ['noodfonds', A, B, C], goals: [
      { id: A, naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 60 },
      { id: B, naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'pct', pct: 30 },
      { id: C, naam: 'Vakantie', doel: 900, gespaard: 0, streefdatum: '2027-08', allocMode: 'pct', pct: 10 }] });
    const d = await page.evaluate(() => {
      const z = document.querySelector('#s-vooruit');
      const rij = [...z.querySelectorAll('.plan-rij')];
      return { rijen: rij.map((e) => Math.round(e.getBoundingClientRect().height)),
        erf: rij.map((e) => e.querySelectorAll('[data-erfregel]').length) };
    });
    // de ontvanger van twee gevers draagt twee regels, dus 2 x 21px boven de kale 144px
    const n = d.erf.reduce((a, x) => a + x, 0);
    expect(n).toBe(2);
    const metTwee = d.rijen[d.erf.indexOf(2)];
    expect(metTwee).toBe(144 + 42);
  });
});
