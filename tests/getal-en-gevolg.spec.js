// v189: de groep "getal en gevolg lopen uiteen". Een getoond bedrag hoort uit dezelfde som te
// komen als de conclusie ernaast, of het scherm zegt dat het dat niet doet.
// Vier items gebouwd: het benodigde bedrag naast de capaciteit, de reserveringsinleg die zegt dat
// hij losstaat van je plan, de dagmarkering in de balk in plaats van ernaast, en een opsomming die
// niet met 'en' plakt.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));
const CUR = MS[2];
const overMnd = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323', RES = 'NL01RESE0000009999';

function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of MS) {
    add(m, '02', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '03', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '08', -300, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    // comfort-uitgaven: daaruit komt noodfondsModel().comfortTot, de terugval van planCapacity()
    add(m, '12', -150, 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    // OWN komt uit TX (v122), dus de reserveringspot bestaat pas met een boeking erop
    add(m, '13', 25, 'Reserveringen', 'NAAR RESERVERINGEN', RES);
  }
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 3000, limit: 70, vooruitDoelOpen: true,
    savingMode: 'amount', savingAmount: 300,
    manualBal: { [MAIN]: 4000, [SAV]: 8000, [RES]: 1000 },
    budgets: { huur: 900, boodschappen: 400 }, savingsEnds: ['4323'], resAcc: RES,
    reserveringen: [{ id: 'r1', naam: 'Gemeente', bedrag: 480, vervalmaand: overMnd(3), intervalM: 12 }],
    goals: [{ id: 'g1', naam: 'Vakantie', doel: 8000, gespaard: 0, allocMode: 'fixed',
      perMaand: 200, streefdatum: overMnd(7) }],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planCapacity === 'function' && TX.length > 0);
}
const euroNL = (n) => '€' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const tekst = (page, n) => page.evaluate((x) => { go(x); return $('#s-' + x).innerText.replace(/\s+/g, ' '); }, n);

test.describe('a · het benodigde bedrag staat naast wat er te verdelen is', () => {
  test('de tekortzin noemt de capaciteit', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const p = allocatePlan().find((x) => x.type === 'goal');
      return { regel: doelTempoLine(p).replace(/<[^>]*>/g, ''), cap: euro0(planCapacity()) };
    });
    expect(r.regel).toMatch(/per maand nodig/);
    expect(r.regel).toContain(`Je hele plan heeft ${r.cap} per maand te verdelen.`);
  });

  test('ook wanneer er niets naar het doel gaat', async ({ page }) => {
    const p = seed(); const set = JSON.parse(p.minder_set);
    set.goals[0].perMaand = 0; p.minder_set = JSON.stringify(set);
    await boot(page, p);
    const r = await page.evaluate(() => {
      const g = allocatePlan().find((x) => x.type === 'goal');
      return { alloc: g.alloc, regel: doelTempoLine(g).replace(/<[^>]*>/g, ''), cap: euro0(planCapacity()) };
    });
    if (r.alloc === 0) {
      expect(r.regel).toMatch(/Er gaat op dit moment niets naar dit doel/);
      expect(r.regel).toContain(`${r.cap} per maand te verdelen`);
    }
  });

  test('zonder capaciteit staat er geen spiegel, geen verzonnen nul', async ({ page }) => {
    const p = seed(); const set = JSON.parse(p.minder_set);
    set.savingAmount = 0; set.income = 0; p.minder_set = JSON.stringify(set);
    await boot(page, p);
    const r = await page.evaluate(() => {
      const g = allocatePlan().find((x) => x.type === 'goal');
      return { cap: planCapacity(), regel: g ? doelTempoLine(g).replace(/<[^>]*>/g, '') : '' };
    });
    if (!(r.cap > 0)) expect(r.regel).not.toContain('te verdelen');
  });
});

test.describe('b · de reserveringsinleg zegt dat hij losstaat van je plan', () => {
  test('de kaart benoemt het verband, zonder te herberekenen', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => { const d = document.createElement('div');
      d.innerHTML = resDekkingCard(); return d.innerText.replace(/\s+/g, ' '); });
    expect(t).toContain('staat los van je plan');
    expect(t).toMatch(/concurreert niet met je spaardoelen/);
    // en het bedrag per maand staat er nog steeds niet (v188)
    const per = await page.evaluate(() => dekking(12).benodigdPerMaand);
    if (per > 0) expect(t).not.toContain(String(per).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
  });

  test('de reservering blijft buiten planCapacity', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ cap: planCapacity(), doel: Math.round(monthlySavingTarget()),
      res: dekking(12).benodigdPerMaand }));
    expect(r.cap).toBe(r.doel);
    expect(r.cap).not.toBe(r.doel + r.res);
  });
});

test.describe('c · de dagmarkering staat in de balk', () => {
  test('de balk draagt een streep op het dagpercentage', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('ins'));
    await page.waitForTimeout(90);
    const r = await page.evaluate(() => {
      const track = document.querySelector('#s-ins .bar-track');
      if (!track) return null;
      const mark = [...track.children].find((e) => (e.getAttribute('style') || '').includes('position:absolute'));
      return { heeft: !!mark, left: mark ? mark.style.left : '', title: mark ? mark.getAttribute('title') : '' };
    });
    test.skip(!r, 'geen budgetbalk in deze fixture');
    expect(r.heeft).toBe(true);
    const d = await page.evaluate((m) => daysElapsed(m), CUR);
    const pct = Math.round(d.elapsed / d.dim * 100);
    expect(r.left).toBe(pct + '%');
    expect(r.title).toContain(pct + '%');
  });

  test('de zin eronder is de legenda van die streep, niet een tweede weergave', async ({ page }) => {
    await boot(page);
    const t = await tekst(page, 'ins');
    expect(t).toMatch(/de streep staat waar de maand nu is: \d+% voorbij/);
    expect(t).not.toMatch(/de maand is \d+% voorbij/);
  });

  test('een afgesloten maand heeft geen dagmarkering', async ({ page }) => {
    await boot(page);
    const ms = await page.evaluate(() => months());
    test.skip(ms.length < 2, 'geen afgesloten maand');
    await page.evaluate((m) => zetKijkMaand(m), ms[ms.length - 2]);
    await page.waitForTimeout(120);
    const t = await page.evaluate(() => $('#s-ins').innerText);
    expect(t).not.toMatch(/de streep staat waar de maand nu is/);
  });
});

test.describe('d · een opsomming plakt niet met en', () => {
  test('drie leden krijgen komma, komma, en', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      een: opsomming(['a']), twee: opsomming(['a', 'b']), drie: opsomming(['a', 'b', 'c']),
      leeg: opsomming([]), gaten: opsomming(['a', '', 'c']),
    }));
    expect(r.een).toBe('a');
    expect(r.twee).toBe('a en b');
    expect(r.drie).toBe('a, b en c');
    expect(r.leeg).toBe('');
    expect(r.gaten).toBe('a en c');
  });

  test('het maandoordeel gebruikt hem', async ({ page }) => {
    await boot(page);
    const zin = await page.evaluate(() => {
      const mk = (n) => Array.from({ length: n }, (_, i) => ({ key: 'r' + i, naam: 'Regel ' + i, status: 'ok' }));
      return maandOordeel(mk(3)).sub;
    });
    expect(zin).toBe('Regel 0, regel 1 en regel 2 zijn in orde.');
    expect(zin).not.toContain('en regel 1 en');
  });
});

test.describe('e · al opgelost in de eenheden-ronde', () => {
  test('de Home-hero toont hele euro s, zonder centen', async ({ page }) => {
    await boot(page);
    const t = await tekst(page, 'dash');
    const hero = await page.evaluate(() => $('.homehero') ? $('.homehero').innerText.replace(/\s+/g, ' ') : '');
    expect(hero).not.toMatch(/€[\d.]+,\d\d/);          // geen centen in het hoofdgetal
    expect(t).not.toMatch(/totaal saldo €[\d.]+,\d\d/);
    // en de bron is euro0, niet euro
    const src = await page.evaluate(() => renderDash.toString());
    expect(src).toContain('euro0(S2.safe)');
    expect(src).toContain('euro0(S2.saldo)');
  });
});

test.describe('f · het aflosbedrag en de looptijd komen uit dezelfde som', () => {
  test('met een termijn erbij: het getoonde bedrag is het bedrag waarmee gerekend is', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const p = { type: 'aflossen', rest: 3200, rente: 0, debtPer: 100, alloc: 300, mode: 'fixed',
        perMaand: 300, extra: 0, status: 'loopt' };
      p.eta = payoffMonths(p.rest, (p.debtPer || 0) + p.alloc, p.rente);
      return { sub: planSub(p), eta: p.eta, som: p.debtPer + p.alloc,
        etaUitGetoond: payoffMonths(p.rest, p.debtPer + p.alloc, p.rente) };
    });
    // het bedrag in de regel is precies het bedrag dat in payoffMonths ging
    expect(r.sub).toContain('/mnd');
    expect(r.sub).toContain(euroNL(r.som) + '/mnd');
    expect(r.sub).toContain('waarvan ' + euroNL(100) + ' je termijn');
    expect(r.sub).toContain('~' + r.eta + ' maanden');
    expect(r.eta).toBe(r.etaUitGetoond);
    expect(r.sub).not.toContain(euroNL(300) + '/mnd');   // niet het losse plan-aandeel
  });

  test('zonder termijn blijft de regel zoals hij was', async ({ page }) => {
    await boot(page);
    const sub = await page.evaluate(() => {
      const p = { type: 'aflossen', rest: 3200, rente: 0, debtPer: 0, alloc: 400, mode: 'fixed',
        perMaand: 400, extra: 0, status: 'loopt' };
      p.eta = payoffMonths(p.rest, p.alloc, p.rente);
      return planSub(p);
    });
    expect(sub).toContain(euroNL(400) + '/mnd');
    expect(sub).not.toContain('je termijn');
  });

  test('een spaardoel krijgt geen termijn-uitsplitsing', async ({ page }) => {
    await boot(page);
    const sub = await page.evaluate(() => planSub({ type: 'goal', alloc: 200, mode: 'fixed',
      perMaand: 200, extra: 0, eta: 5, status: 'loopt' }));
    expect(sub).toContain(euroNL(200) + '/mnd');
    expect(sub).not.toContain('termijn');
  });
});

test.describe('g · de kop zegt wat er werkelijk wordt verdeeld', () => {
  test('met een spaarinleg heet het je spaarinleg', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ terugval: planCapTerugval(), label: planCapLabel(),
      kop: (function () { const d = document.createElement('div');
        d.innerHTML = renderPlan(true); return d.innerText.replace(/\s+/g, ' '); })() }));
    expect(r.terugval).toBe(false);
    expect(r.label).toBe('spaarinleg');
    expect(r.kop).toMatch(/spaarinleg gaat van boven naar beneden/);
    expect(r.kop).not.toMatch(/comfortabele ruimte/);
  });

  test('op de terugval zegt de kop dat, met de reden erbij', async ({ page }) => {
    const p = seed(); const set = JSON.parse(p.minder_set);
    set.savingMode = 'amount'; set.savingAmount = 0; p.minder_set = JSON.stringify(set);
    await boot(page, p);
    const r = await page.evaluate(() => ({ doel: Math.round(monthlySavingTarget()), cap: planCapacity(),
      terugval: planCapTerugval(), label: planCapLabel(),
      kop: (function () { const d = document.createElement('div');
        d.innerHTML = renderPlan(true); return d.innerText.replace(/\s+/g, ' '); })() }));
    test.skip(!(r.doel === 0 && r.cap > 0), 'deze opzet valt niet terug');
    expect(r.terugval).toBe(true);
    expect(r.label).toBe('comfortabele ruimte');
    expect(r.kop).toMatch(/nog geen spaarinleg ingesteld/);
    expect(r.kop).toMatch(/comfortabele ruimte/);
  });

  test('planCapacity zelf is niet aangeraakt', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => planCapacity.toString());
    expect(src).toContain('monthlySavingTarget()');
    expect(src).toContain('comfortTot');
    expect(src).not.toContain('planCapLabel');
  });
});

test.describe('h · de waardekolom van dekking toont één soort waarde', () => {
  test('een bedrag, of het woord onbekend, en niets anders', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const uit = [];
      const meet = () => { const d = (maandRegels() || []).find((x) => x.key === 'dekking');
        return d ? { w: d.waarde, e: d.eenheid } : null; };
      uit.push(meet());                                          // gewone stand
      const bal = JSON.parse(JSON.stringify(SET.manualBal));
      SET.resAcc = ''; save(); uit.push(meet());                 // geen pot aangewezen
      SET.resAcc = 'NL01RESE0000009999'; SET.manualBal = bal; save();
      return uit;
    });
    for (const x of r) {
      if (!x) continue;
      expect(x.w === 'onbekend' || /^-?€/.test(x.w), x.w).toBe(true);
      expect(x.w).not.toMatch(/%/);
      expect(x.w).not.toBe('op peil');
      expect(x.w).not.toBe('geen');
    }
  });

  test('het oordeel staat in de eenheid, met de noemer erbij', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => (maandRegels() || []).find((x) => x.key === 'dekking'));
    test.skip(!d, 'geen dekkingsregel');
    expect(d.eenheid).toMatch(/^in je pot |^niet te beoordelen$/);
    if (/%/.test(d.eenheid)) expect(d.eenheid).toMatch(/% van (wat nu nodig is|de eerstvolgende post)/);
  });
});

test.describe('i · een regelnaam is nooit een afgekapte zin', () => {
  test('de bron levert een korte naam waar de zin lang is', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => scoreNotifs.toString());
    expect(src).toContain('Stilstaand geld naast rente');
  });

  test('kortNaam gebruikt die naam en kapt anders op woordgrens', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      metKort: kortNaam({ kort: 'Korte naam', l1: 'Een hele lange zin die veel te ver doorloopt om als naam te dienen.' }),
      kortGenoeg: kortNaam({ l1: 'Je geeft al maanden te veel uit' }),
      lang: kortNaam({ l1: 'Een hele lange zin die veel te ver doorloopt om als naam te dienen.' }),
      html: kortNaam({ l1: '<b>Vet</b> en gewoon' }),
    }));
    expect(r.metKort).toBe('Korte naam');
    expect(r.kortGenoeg).toBe('Je geeft al maanden te veel uit');
    expect(r.lang.length).toBeLessThanOrEqual(43);
    expect(r.lang.slice(-1)).toBe('…');
    expect(r.lang.slice(-2, -1)).not.toBe(' ');             // geen spatie voor de afkapping
    expect(r.html).toBe('Vet en gewoon');                   // tags eruit, zoals voorheen
  });

  test('geen structurele regel draagt een halve zin', async ({ page }) => {
    await boot(page);
    const namen = await page.evaluate(() => maandStructureel().map((r) => r.naam));
    for (const n of namen) expect(n.length).toBeLessThanOrEqual(43);
  });
});

test.describe('j · een dekkingsgraad toont geen percentage boven de drempel', () => {
  /* v191: dezelfde bevinding als het kopcijfer op Plan, dat toen per geval is opgelost door de
     graad van die kaart te halen. De regel staat nu vast in MAAND_DREMPEL, zodat hij niet ergens
     anders terugkomt: tot en met de drempel een percentage, daarboven een vaststelling. */
  test('graadTekst kapt af op de drempel uit de constante', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      drempel: MAAND_DREMPEL.dekkingOk,
      nul: graadTekst(0, 'wat nu nodig is'),
      halve: graadTekst(44, 'wat nu nodig is'),
      precies: graadTekst(100, 'wat nu nodig is'),
      erboven: graadTekst(101, 'wat nu nodig is'),
      ver: graadTekst(1111, 'wat nu nodig is'),
      post: graadTekst(403, 'de eerstvolgende post'),
    }));
    expect(r.drempel).toBe(100);
    expect(r.nul).toBe('0% van wat nu nodig is');
    expect(r.halve).toBe('44% van wat nu nodig is');
    expect(r.precies).toBe('100% van wat nu nodig is');   // de drempel zelf telt nog als percentage
    expect(r.erboven).toBe('op peil voor wat nu nodig is');
    expect(r.ver).toBe('op peil voor wat nu nodig is');
    expect(r.post).toBe('op peil voor de eerstvolgende post');
    for (const k of ['erboven', 'ver', 'post']) expect(r[k]).not.toMatch(/%/);
  });

  test('de dekkingregel toont geen graad boven de honderd', async ({ page }) => {
    const p = seed(); const set = JSON.parse(p.minder_set);
    set.manualBal[RES] = 50000;                            // pot ver boven wat er nu hoort te staan
    p.minder_set = JSON.stringify(set);
    await boot(page, p);
    const r = await page.evaluate(() => ({ graad: dekking(12).graad,
      d: (maandRegels() || []).find((x) => x.key === 'dekking') }));
    test.skip(!r.d || !(r.graad > 100), 'deze opzet geeft geen graad boven de honderd');
    expect(r.d.eenheid).toContain('op peil');
    expect(r.d.eenheid).not.toMatch(/\d+%/);
    expect(r.d.waarde).toMatch(/^€/);                      // het bedrag blijft in de kolom staan
  });

  test('graad wordt nergens anders als percentage getoond', async ({ page }) => {
    await boot(page);
    /* dekkingTekst() rekent met bedragen en maanden, resDekkingCard() draagt de graad sinds v187
       niet meer, en de kolom toont sinds v190 een bedrag. graadTekst() is dus de enige plek. */
    const r = await page.evaluate(() => ({
      tekst: dekkingTekst(dekking(12)),
      kaart: resDekkingCard(),
      bronnen: [dekkingTekst.toString(), resDekkingCard.toString()]
        .map((t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ')),
    }));
    expect(r.tekst).not.toMatch(/\d+%/);
    expect(r.kaart).not.toMatch(/\d+%/);
    for (const b of r.bronnen) expect(b).not.toContain('graad');
  });
});
