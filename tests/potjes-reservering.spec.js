// v254: een potje dat op is reserveert nul.
//
// GEMELD: de sheet "Gereserveerd in je potjes" zegt boven de lijst "budget dat je per categorie
// apart zette · nog niet uitgegeven", terwijl drie van de zes posten potjes waren die op zijn:
// Overig €598 van €500 telde voor €133, Uit eten €249 van €55 voor €15, Vices €56 van €20 voor €5.
// Samen €153 die als opzijgezet budget meetelde terwijl er niets meer in zat, en die ging af van
// veilig te besteden. Dat is het dagtempo maal de resterende dagen (potjeRest, v111): een prognose,
// geen reservering.
//
// TWEE VRAGEN, TWEE FUNCTIES. Inzichten vraagt wat je bij je tempo nog uitgeeft en leest
// varPlanRemaining(); de sheet en veilig te besteden vragen wat er nog IN je potjes zit en lezen
// varPotjesReserve(). potjeRest() zelf is onaangeroerd, want beide lezers hierboven bestaan nog.
//
// DE PROGNOSE VERDWIJNT NIET, maar is geen aftrekking meer: hij staat als eigen regel onder de
// lijst, en alleen als er een leeg potje is.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';

/* De gemelde toestand: zes variabele potjes, drie ervan op. De reserves van die drie zijn op dag 22
   van een maand van 30 dagen precies 133, 15 en 5, samen de gemelde 153; het sheet-totaal was 1.063
   en wordt 910. Huur en abonnement staan er als terugkerende potjes naast, want die horen in geen
   van beide sommen thuis en dat toetsen we hieronder. */
function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, m, '03', -30, 'Netflix', 'SEPA INCASSO NETFLIX ABONNEMENT');
  }
  for (const b of (o.boekingen || [])) add(b[0], CUR, b[1], b[2], b[3], b[4]);
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000 }, savingMode: 'amount', savingAmount: 0,
    budgets: o.budgets || { overig: 500, uiteten: 55, vices: 20, boodschappen: 500, vervoer: 300,
      sport: 240, huur: 900, abonnement: 30 },
    budgetMonth: CUR,
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}
// drie potjes eroverheen: overig 598/500, uiteten 249/55, vices 56/20
const DRIE_OP = [['o1', '04', -598, 'Blokker', 'BEA, BETAALPAS BLOKKER'],
  ['u1', '06', -249, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT'],
  ['v1', '07', -56, 'Slijterij', 'BEA, BETAALPAS SLIJTERIJ'],
  ['b1', '08', -90, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['c1', '09', -40, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION']];
// dezelfde potjes, niets eroverheen
const GEEN_OP = [['o1', '04', -100, 'Blokker', 'BEA, BETAALPAS BLOKKER'],
  ['u1', '06', -20, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT'],
  ['b1', '08', -90, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
  ['c1', '09', -40, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION']];

async function boot(page, bk) {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed({ boekingen: bk }));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof varPotjesReserve === 'function');
}
const eur = (t) => Math.round(parseFloat(String(t).replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.')) || 0);
// de sheet zoals hij op het scherm staat, plus de bronnen waar hij uit hoort te komen
const meet = (page) => page.evaluate(() => {
  const m = curMonth || months()[months().length - 1];
  const S = safeToSpend(), VP = varPotjeStand(m);
  openReservedPotjes();
  const sh = document.querySelector('#sheet');
  const num = (t) => Math.round(parseFloat(String(t).replace(/[^\d,]/g, '').replace(/\./g, '').replace(',', '.')) || 0);
  return {
    kop: num(sh.querySelector('.center div:last-child').innerText),
    rijen: [...sh.querySelectorAll('.tx.res-rij')].map((x) => ({
      nm: x.querySelector('.nm').innerText,
      bedrag: num(x.querySelector('.amt').innerText),
      sub: x.querySelector('.cat').innerText.replace(/\s+/g, ' '),
      afgekapt: x.querySelector('.cat').scrollWidth > x.querySelector('.cat').clientWidth + 1 })),
    prognose: [...sh.querySelectorAll('.small')].map((x) => x.innerText).find((t) => /bij je tempo/i.test(t)) || null,
    reserve: varPotjesReserve(m), plan: varPlanRemaining(m),
    reserved: Math.round(S.reserved), safe: S.safe, potOver: S.potOver,
    inPotjes: VP.budget - VP.gebruikt,
  };
});

test.describe('a · de gemelde toestand: drie lege potjes', () => {
  test('de drie dragen nul, het totaal zakt met 153 en veilig te besteden stijgt met hetzelfde', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    const op = r.rijen.filter((x) => /potje op/.test(x.sub));
    expect(op.length).toBe(3);
    for (const x of op) expect(x.bedrag).toBe(0);
    // de tempo-som is wat de sheet vroeger in zijn kop zette
    expect(r.plan - r.reserve).toBe(153);
    expect(r.kop).toBe(r.reserve);
    /* en veilig te besteden is met precies datzelfde bedrag ruimer geworden. safe trekt de
       reservering af, dus safe met de oude bron is safe min het verschil tussen de twee sommen. */
    const oud = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      return safeToSpend().safe - (varPlanRemaining(m) - varPotjesReserve(m));
    });
    expect(r.safe - oud).toBe(153);
  });

  test('het totaal in de kop is de som van de posten eronder', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    expect(r.rijen.reduce((a, x) => a + x.bedrag, 0)).toBe(r.kop);
    expect(r.kop).toBe(r.reserved);          // en hetzelfde getal als in de opbouw van veilig te besteden
  });

  test('een leeg potje staat in de lijst, met nul en met zijn besteding', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    const o = r.rijen.find((x) => /Overig/.test(x.nm));
    expect(o.bedrag).toBe(0);
    expect(o.sub).toContain('€598 van €500 gebruikt');
    expect(o.sub).toContain('potje op');
    expect(o.sub).toContain('aanpassen');
  });

  test('de prognoseregel staat onder de lijst en telt nergens in mee', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    expect(r.prognose).toMatch(/Bij je tempo verwacht je deze maand nog €153 uit te geven in potjes die al op zijn\./);
    expect(r.kop).not.toBe(r.kop + 153);
    expect(r.rijen.some((x) => x.bedrag === 153)).toBe(false);
  });
});

test.describe('b · geen enkel potje leeg', () => {
  test('totaal en veilig te besteden ongewijzigd, en geen prognoseregel', async ({ page }) => {
    await boot(page, GEEN_OP);
    const r = await meet(page);
    expect(r.reserve).toBe(r.plan);            // zonder leeg potje meten de twee hetzelfde
    expect(r.kop).toBe(r.reserve);
    expect(r.potOver).toBe(0);
    expect(r.prognose).toBeNull();
  });
});

test.describe('c · de twee functies naast elkaar', () => {
  test('dezelfde poort: terugkerende potjes tellen in geen van beide mee', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await page.evaluate(() => {
      const m = curMonth || months()[months().length - 1];
      const B = SET.budgets || {}, rc = recurringCats(), sp = catSpendMap(m);
      let handReserve = 0, handPlan = 0;
      const d = daysElapsed(m), left = Math.max(d.dim - d.elapsed, 0);
      for (const k in B) { const bud = +B[k] || 0; if (bud <= 0 || rc.has(k)) continue;
        handReserve += Math.max(bud - (sp[k] || 0), 0); handPlan += potjeRest(bud, sp[k] || 0, d.dim, left); }
      openReservedPotjes();
      const namen = [...document.querySelectorAll('#sheet .tx.res-rij .nm')].map((x) => x.innerText);
      return { rc: [...rc], namen, reserve: varPotjesReserve(m), plan: varPlanRemaining(m),
        handReserve: Math.round(handReserve), handPlan: Math.round(handPlan) };
    });
    expect(r.rc).toContain('huur');
    expect(r.rc).toContain('abonnement');
    expect(r.namen.join(' ')).not.toMatch(/Huur|Abonnement/);
    expect(r.reserve).toBe(r.handReserve);
    expect(r.plan).toBe(r.handPlan);
  });

  /* De identiteit die de twee verbindt: wat er nog in je potjes zit is de aftrekking van de regel
     op Inzichten plus wat je over je potjes ging. Geen derde som. */
  test('varPotjesReserve is de aftrekking plus potOver', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    expect(r.reserve).toBe(r.inPotjes + r.potOver);
    expect(r.reserved).toBe(r.reserve);
  });

  test('potjeRest is onaangeroerd, en houdt zijn twee lezers', async ({ page }) => {
    await boot(page, DRIE_OP);
    /* De bron zonder commentaar: een naam die alleen in een comment staat is geen lezer, en dit
       bestand legt juist in commentaar uit welke functie waar gebleven is. */
    const r = await page.evaluate(() => {
      const kaal = (f) => f.toString().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      return { rest: kaal(potjeRest).replace(/\s+/g, ' '),
        plan: kaal(varPlanRemaining), reserve: kaal(varPotjesReserve),
        sheet: kaal(openReservedPotjes), safe: kaal(safeToSpend) };
    });
    expect(r.rest).toContain('return Math.round(bud/Math.max(dim,1)*Math.max(daysLeft,0));');
    expect(r.plan).toContain('potjeRest(');          // de tempo-som leest hem nog
    expect(r.sheet).toContain('potjeRest(');         // en de prognoseregel onder de sheet ook
    expect(r.reserve).not.toContain('potjeRest(');   // de reservering niet
    expect(r.safe).toContain('varPotjesReserve(');
    expect(r.safe).not.toContain('varPlanRemaining(');
  });
});

test.describe('d · de subregel raakt zijn aanpassen niet meer kwijt', () => {
  test('geen enkele rij kapt af, ook niet de rijen met uitleg', async ({ page }) => {
    await boot(page, DRIE_OP);
    const r = await meet(page);
    for (const x of r.rijen) {
      expect(x.afgekapt, x.sub).toBe(false);
      expect(x.sub).toContain('aanpassen');
    }
  });

  for (const breedte of [360, 390]) {
    test(`op ${breedte}px past aanpassen op elke rij, en de rij blijft laag`, async ({ page }) => {
      await page.setViewportSize({ width: breedte, height: 800 });
      await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed({ boekingen: DRIE_OP }));
      await page.goto('/index.html');
      await page.waitForFunction(() => typeof openReservedPotjes === 'function');
      const r = await page.evaluate(() => {
        openReservedPotjes();
        return [...document.querySelectorAll('#sheet .tx.res-rij')].map((x) => ({
          h: Math.round(x.getBoundingClientRect().height),
          op: /potje op/.test(x.querySelector('.cat').innerText),
          afgekapt: x.querySelector('.cat').scrollWidth > x.querySelector('.cat').clientWidth + 1 }));
      });
      for (const x of r) expect(x.afgekapt).toBe(false);
      // een rij met uitleg wordt hoger, maar blijft binnen twee regels sub
      for (const x of r) expect(x.h).toBeLessThanOrEqual(x.op ? 90 : 70);
    });
  }
});

test.describe('e · de sheet blijft bereikbaar', () => {
  test('ook als al je potjes op zijn staat de regel op Home er, met nul', async ({ page }) => {
    await boot(page, [['o1', '04', -598, 'Blokker', 'BEA, BETAALPAS BLOKKER'],
      ['u1', '06', -249, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT'],
      ['v1', '07', -56, 'Slijterij', 'BEA, BETAALPAS SLIJTERIJ'],
      ['b1', '08', -900, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN'],
      ['c1', '09', -400, 'Shell', 'BEA, BETAALPAS SHELL TANKSTATION'],
      ['s1', '10', -300, 'Fitness', 'BEA, BETAALPAS FITNESS']]);
    const r = await page.evaluate(() => {
      const S = safeToSpend();
      go('dash'); openSafeToSpend();
      const el = [...document.querySelectorAll('#sheet [onclick]')]
        .find((x) => /gereserveerd in je potjes/i.test(x.innerText));
      return { reserved: Math.round(S.reserved), er: !!el,
        tekst: el ? el.innerText.replace(/\s+/g, ' ') : '' };
    });
    expect(r.reserved).toBe(0);
    expect(r.er).toBe(true);                       // de enige route naar de sheet blijft staan
    expect(r.tekst).toMatch(/je potjes zijn op/);
  });
});
