// v255: wat de buffer niet meer kan gebruiken, zakt door.
//
// AANLEIDING, gemeten op het toestel. Spaarinleg 3.000, buffer nog 2.534 nodig, Kosten Koper op
// plek 2. Het noodfonds kreeg zijn 2.534 en de resterende 466 bleef staan bij "Blijft over",
// terwijl Kosten Koper op de buffer stond te wachten. Dat is een maand verloren aan geld waar de
// buffer geen bestemming meer voor had.
//
// WAAR HET ZAT. Twee plekken in allocatePlan(), en ze deden niet hetzelfde. Ronde 1 zette alleen
// de status ('wacht op de buffer'), liet left onaangeroerd en haalde het doel niet uit P, dus het
// bleef een geldige ontvanger. De regel die het doorzakken blokkeerde was de expliciete
// `continue` in RONDE 2. Hij raakte zijn ontvanger dus niet kwijt, hij sloeg hem over.
//
// DE VOORWAARDE IS NIET "DE GRENDEL IS OPEN" MAAR "DE BUFFER IS KLAAR" (planBufferKlaar). Gemeten
// met een GEPAUZEERDE buffer bij een dichte grendel: de buffer krijgt nul en er blijft 3.000 over,
// dus alleen de `continue` weghalen zou de hele inleg langs een lege buffer naar het eerste doel
// sturen. Precies wat de grendel tegenhoudt.
//
// WAT DICHT BLIJFT is het SPLITSEN: een eigen maandbedrag voor iets anders dan de buffer. Dat
// hing tot v254 nergens aan een schrijver maar aan ronde 1, die de modus van een niet-buffer-item
// overslaat; gemeten gingen setPlanAllocVeld() en saveGoal() er gewoon in en werden daarna stil
// genegeerd. Sinds v255 is planVastMag() de poort.
//
// DE FIXTURE IS DIE VAN HET TOESTEL, en dat betekent de getallen zelf en niet een paar dat op
// dezelfde uitkomst uitkomt. Noodfonds-doel 3.534 met 1.000 toegewezen, dus 2.534 te gaan bij
// 3.000 inleg; Kosten Koper 10.000 en Inrichting woning 3.000.
// BIJ v255 STOND HIER 40.000 MET 37.466 TOEGEWEZEN. Die rest komt op dezelfde 2.534 uit en alle
// tests hieronder bleven groen, en precies dat is het probleem: een buffer die nog 2.534 nodig
// heeft van 40.000 staat op 94 procent, en een die er 2.534 nodig heeft van 3.534 op 28. Dat is
// een ander geval dan het gemelde, met dezelfde uitkomst voor deze ene som. Zie de fixture-regel
// in CLAUDE.md.
// Kosten Koper stond bij v252 op 16.000, uit blok 5 van het diagnosescherm. Dat doel is daarna
// verlaagd naar 10.000 (het plantotaal ging in dezelfde stap van 21.301 naar 16.534), dus die
// 16.000 is verouderd en geen tegenspraak.
// De zes bestaande grendel-fixtures hebben allemaal een buffer die meer nodig heeft dan één maand
// inleg, dus er blijft daar nooit iets over en ze meten dit geval niet.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const overMnd = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

// de toestand van het toestel: doel 3.534, toegewezen 1.000, dus 2.534 te gaan bij 3.000 inleg
const NF_DOEL = 3534;
const NF_TOE = 1000;
const INLEG = 3000;
const REST = NF_DOEL - NF_TOE;          // 2.534
const OVER = INLEG - REST;              // 466: wat de buffer niet meer kan gebruiken

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '05', 6000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '03', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
  }
  add('s' + M2, SPAAR, M2, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  add('s' + M1, SPAAR, M1, '26', 3000, 'Spaarpot', 'NAAR SPAREN');
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: { [MAIN]: 4000, [SPAAR]: 9000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: o.inleg != null ? o.inleg : INLEG,
    savingsAcc: { [SPAAR]: true },
    nfDoelVast: NF_DOEL,
    nfToegewezen: o.nfToe != null ? o.nfToe : NF_TOE,
    nfToegewezenMigrated: o.migrated === false ? false : true,
    goals: o.goals || [
      { id: 'kk', naam: 'Kosten Koper', doel: 10000, gespaard: o.kkGespaard || 0,
        allocMode: o.kkMode || 'auto', perMaand: o.kkPer || 0, streefdatum: overMnd(10) },
      { id: 'iw', naam: 'Inrichting woning', doel: 3000, gespaard: 0,
        allocMode: 'auto', perMaand: 0, streefdatum: overMnd(6) },
    ],
    planOrder: ['noodfonds', 'kk', 'iw'],
    debts: o.debts || [],
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planBufferKlaar === 'function');
  await page.evaluate(() => go('vooruit'));
}
const plan = (page) => page.evaluate(() => {
  const by = {};
  for (const p of allocatePlan()) by[p.id] = { id: p.id, rest: p.rest, alloc: p.alloc,
    base: p.base, extra: p.extra, status: p.status, eta: p.eta, doorzak: !!p.grendelDoorzak };
  return { by, vrij: planVrij(), klaar: planBufferKlaar(allocatePlan(), planGrendel()) };
});

test.describe('a · het gemelde geval', () => {
  test('de buffer krijgt wat hij nodig heeft en de rest zakt door naar Kosten Koper', async ({ page }) => {
    await boot(page);
    // eerst vaststellen dat dit werkelijk de gemelde toestand is
    expect(await page.evaluate(() => planGrendel())).toMatchObject({ dicht: true, rest: REST });
    expect(await page.evaluate(() => planCapacity())).toBe(INLEG);
    const P = await plan(page);
    expect(P.by.noodfonds.alloc).toBe(REST);            // nooit meer dan hij nodig heeft
    expect(P.by.kk.alloc).toBe(OVER);                   // 466, en niet nul
    expect(P.by.kk.extra).toBe(OVER);                   // volledig doorgezakt, base blijft nul
    expect(P.by.kk.base).toBe(0);
    expect(P.vrij).toBe(0);                             // en er blijft dus niets meer over
  });

  test('"Blijft over" staat op nul op het scherm zelf', async ({ page }) => {
    await boot(page);
    expect(await page.locator('#planVrij').innerText()).toMatch(/Blijft over\s*€0/);
  });

  test('het tweede doel krijgt niets, want het eerste nam het restant', async ({ page }) => {
    await boot(page);
    const P = await plan(page);
    expect(P.by.iw.alloc).toBe(0);
    expect(P.by.iw.status).toBe('wacht op de buffer');  // geen verdeling over meerdere doelen
  });
});

test.describe('b · planBufferKlaar: de drie eisen', () => {
  test('de buffer vraagt meer dan de hele inleg: alles daarheen, niets zakt door', async ({ page }) => {
    await boot(page, { nfToe: 0 });                     // 3.534 te gaan, meer dan de 3.000 inleg
    const P = await plan(page);
    expect(P.klaar).toBe(false);
    expect(P.by.noodfonds.alloc).toBe(INLEG);
    expect(P.by.kk.alloc).toBe(0);
    expect(P.by.kk.status).toBe('wacht op de buffer');
    expect(P.by.iw.alloc).toBe(0);
    expect(P.vrij).toBe(0);
  });

  test('een gepauzeerde buffer is niet klaar: niets zakt door en de hele inleg blijft over', async ({ page }) => {
    await boot(page, { set: { planPaused: { noodfonds: true } } });
    const P = await plan(page);
    expect(P.klaar).toBe(false);
    expect(P.by.noodfonds.alloc).toBe(0);
    expect(P.by.noodfonds.status).toBe('gepauzeerd');
    expect(P.by.kk.alloc).toBe(0);
    expect(P.by.kk.status).toBe('wacht op de buffer');
    expect(P.vrij).toBe(INLEG);                         // zonder deze eis ging dit naar Kosten Koper
  });

  test('een onbekende spaarstand is niet klaar: onbekend blijft onbekend', async ({ page }) => {
    await boot(page, { migrated: false, nfToe: 0, set: { manualBal: {} } });
    const G = await page.evaluate(() => planGrendel());
    expect(G.onbekend).toBe(true);
    const P = await plan(page);
    expect(P.klaar).toBe(false);
    expect(P.by.noodfonds.alloc).toBe(INLEG);
    expect(P.by.kk.alloc).toBe(0);
    expect(P.by.kk.status).toBe('wacht op de buffer');
  });

  test('met een open grendel zegt hij altijd ja: ronde 2 was daar al vrij', async ({ page }) => {
    await boot(page, { nfToe: NF_DOEL });
    expect(await page.evaluate(() => planGrendel())).toBe(null);
    expect((await plan(page)).klaar).toBe(true);
  });
});

test.describe('c · het restant zakt door op volgorde, nooit verder dan nodig', () => {
  /* Kosten Koper staat op 9.000 van 10.000, dus hij heeft nog 1.000 nodig. De buffer heeft nog 500
     nodig van 3.000 inleg, dus er is 2.500 te verdelen: 1.000 naar Kosten Koper en 1.500 naar
     Inrichting woning. Dat gedrag stond er al (v98); nieuw is dat het ook bij een dichte grendel
     gebeurt. */
  const BIJNA = { nfToe: NF_DOEL - 500, kkGespaard: 9000 };

  test('het eerste doel neemt wat het nodig heeft, de rest gaat naar het tweede', async ({ page }) => {
    await boot(page, BIJNA);
    expect(await page.evaluate(() => planGrendel())).toMatchObject({ dicht: true, rest: 500 });
    const P = await plan(page);
    expect(P.by.noodfonds.alloc).toBe(500);
    expect(P.by.kk.alloc).toBe(1000);                   // precies zijn rest, geen euro meer
    expect(P.by.kk.alloc).toBe(P.by.kk.rest);
    expect(P.by.iw.alloc).toBe(1500);                   // het restant, naar het volgende op volgorde
    expect(P.vrij).toBe(0);
  });

  test('de som van de toewijzingen blijft de spaarinleg, en geen post gaat boven zijn rest', async ({ page }) => {
    await boot(page, BIJNA);
    const P = await plan(page);
    const som = Object.values(P.by).reduce((a, x) => a + x.alloc, 0);
    expect(som + P.vrij).toBe(INLEG);
    for (const x of Object.values(P.by)) expect(x.alloc, x.id).toBeLessThanOrEqual(x.rest);
  });

  test('in de maand dat de buffer vol raakt blijft er niets liggen', async ({ page }) => {
    await boot(page, { nfToe: NF_DOEL - 800 });
    const P = await plan(page);
    expect(P.by.noodfonds.alloc).toBe(800);
    expect(P.by.kk.alloc).toBe(2200);                   // vóór v255 bleef dit bij "Blijft over"
    expect(P.vrij).toBe(0);
  });
});

test.describe('d · een doel dat doorgezakt geld krijgt, wacht niet meer', () => {
  test('geen wacht-status, wel een tint en een tak', async ({ page }) => {
    await boot(page);
    const P = await plan(page);
    expect(P.by.kk.status).toBe('');
    expect(P.by.kk.doorzak).toBe(true);
    const r = await page.evaluate(() => {
      const rij = [...document.querySelectorAll('#s-vooruit .plan-rij')].find((e) => /Kosten Koper/.test(e.innerText));
      return { dof: rij.innerHTML.includes('vat-dof'), tak: !!rij.querySelector('.plan-tak'),
        tint: planTint(allocatePlan().find((p) => p.id === 'kk'), 1) };
    });
    expect(r.dof).toBe(false);
    expect(r.tak).toBe(true);
    expect(r.tint).not.toBe('var(--mut)');
  });

  test('de regels zeggen niet meer dat het wacht, en noemen waar het bedrag vandaan komt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => vatRegels(allocatePlan().find((p) => p.id === 'kk')));
    expect(r.regels).toContain('krijgt wat je buffer overhoudt');
    expect(r.regels.join(' ')).not.toMatch(/Wacht op je buffer/);
    expect(r.regels.some((x) => /^verdelen gaat open rond /.test(x))).toBe(true);
  });

  /* GEEN ACHTERSTAND EN GEEN BEDRAG PER MAAND. p.eta is hier ceil(rest / het doorgezakte bedrag),
     en dat bedrag is de rest van de maand van je buffer en niet het tempo van dit doel: volgende
     maand is de buffer vol en kan er de hele inleg heen. Zelfde grond als v242: wachten op de
     buffer is geen achterstand. */
  test('het datumpaar blijft kalm: laat is false, zonder achterstand en zonder bedrag per maand', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => vatRegels(allocatePlan().find((p) => p.id === 'kk')));
    expect(r.laat).toBe(false);
    const t = r.regels.join(' ');
    expect(t).not.toMatch(/te laat/);
    expect(t).not.toMatch(/haalt het wel/);
    expect(t).not.toMatch(/per maand/);
  });

  test('de drie regels passen elk op één regel, op 360 en op 390px', async ({ page }) => {
    for (const w of [360, 390]) {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page);
      const r = await page.evaluate(() => {
        const rij = [...document.querySelectorAll('#s-vooruit .plan-rij')].find((e) => /Kosten Koper/.test(e.innerText));
        const dat = rij.querySelector('.vat-dat');
        return { h: Math.round(dat.getBoundingClientRect().height),
          lh: Math.round(parseFloat(getComputedStyle(dat).lineHeight)),
          n: vatRegels(allocatePlan().find((p) => p.id === 'kk')).regels.length };
      });
      expect(r.n, `${w}px`).toBe(3);
      expect(r.h, `${w}px: ${r.h}px op ${r.n} regels van ${r.lh}px`).toBe(r.n * r.lh);
    }
  });

  /* Het bedrag staat al in de kop van de rij. Bij een dichte grendel is base altijd nul voor een
     doel, dus extra is gelijk aan alloc en zou "waarvan X doorgezakt" datzelfde getal herhalen. */
  test('het doorgezakte bedrag staat er niet een tweede keer bij', async ({ page }) => {
    await boot(page, { kkMode: 'fixed', kkPer: 250 });
    const t = await page.evaluate(() => {
      const rij = [...document.querySelectorAll('#s-vooruit .plan-rij')].find((e) => /Kosten Koper/.test(e.innerText));
      return rij.innerText;
    });
    expect(t).toContain('€466');
    expect(t).not.toMatch(/doorgezakt/);
  });

  /* Het doel dat nog steeds nul krijgt verandert niet: dat wacht wél op de buffer. */
  test('het doel dat niets krijgt houdt zijn wachtregel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => vatRegels(allocatePlan().find((p) => p.id === 'iw')));
    expect(r.regels.some((x) => /^verdelen gaat open rond /.test(x))).toBe(true);
    expect(r.regels).not.toContain('krijgt wat je buffer overhoudt');
  });
});

test.describe('e · doelTempo rekent met wat het doel nu werkelijk krijgt', () => {
  test('het venster loopt vanaf vandaag, want dit doel is al begonnen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const p = allocatePlan().find((x) => x.id === 'kk');
      return { alloc: p.alloc, grendelVeld: p.grendel || null, T: doelTempo(p, p.alloc) };
    });
    expect(r.alloc).toBe(OVER);
    expect(r.grendelVeld).toBe(null);                   // v243 schuift het venster alleen bij nul
    expect(r.T.soort).toBe('normaal');
    expect(r.T.start).toBe(0);
    expect(r.T.venster).toBe(r.T.maandenTot);
    expect(r.T.benodigd).toBe(Math.ceil(10000 / r.T.maandenTot));
    expect(r.T.gat).toBe(r.T.benodigd - OVER);          // het gat telt de 466 mee, niet nul
  });

  test('een doel dat nog niets krijgt rekent onveranderd vanaf de openingsmaand', async ({ page }) => {
    await boot(page, { nfToe: 0 });                     // niemand krijgt iets: grendel dicht, buffer niet klaar
    const r = await page.evaluate(() => {
      const p = allocatePlan().find((x) => x.id === 'kk');
      return { alloc: p.alloc, heeftGrendel: !!p.grendel, T: doelTempo(p, p.alloc) };
    });
    expect(r.alloc).toBe(0);
    expect(r.heeftGrendel).toBe(true);
    expect(r.T.start).toBeGreaterThan(0);               // het venster begint bij de openingsmaand
  });
});

test.describe('f · splitsen blijft dicht: een eigen maandbedrag', () => {
  test('planVastMag is dicht zolang de grendel dicht is, en open zodra hij open is', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => planVastMag())).toBe(false);
    await boot(page, { nfToe: NF_DOEL });
    expect(await page.evaluate(() => planVastMag())).toBe(true);
  });

  test('setPlanAllocVeld schrijft geen maandbedrag op een aflos-item', async ({ page }) => {
    await boot(page, { debts: [{ id: 'd1', naam: 'Lening', start: 8000, rest: 6000, perMaand: 200, rente: 6 }],
      set: { planOrder: ['noodfonds', 'kk', 'iw', 'af:d1'], planAlloc: { 'af:d1': { allocMode: 'fixed', perMaand: 100 } } } });
    await page.evaluate(() => { window._planAllocId = 'af:d1'; setPlanAllocVeld('perMaand', '500'); });
    expect(await page.evaluate(() => SET.planAlloc['af:d1'].perMaand)).toBe(100);
  });

  test('setPlanAllocMode wisselt de modus ook niet: kiezen is de helft van instellen', async ({ page }) => {
    await boot(page, { debts: [{ id: 'd1', naam: 'Lening', start: 8000, rest: 6000, perMaand: 200, rente: 6 }],
      set: { planOrder: ['noodfonds', 'kk', 'iw', 'af:d1'], planAlloc: { 'af:d1': { allocMode: 'auto' } } } });
    await page.evaluate(() => { window._planAllocId = 'af:d1'; setPlanAllocMode('fixed'); });
    expect(await page.evaluate(() => SET.planAlloc['af:d1'].allocMode)).toBe('auto');
  });

  test('setNfAlloc en setNfAllocMode blijven dicht, via dezelfde poort', async ({ page }) => {
    await boot(page, { set: { planAlloc: { noodfonds: { allocMode: 'auto', perMaand: 0 } } } });
    await page.evaluate(() => { setNfAllocMode('fixed'); setNfAlloc('perMaand', '900'); });
    expect(await page.evaluate(() => SET.planAlloc.noodfonds)).toMatchObject({ allocMode: 'auto', perMaand: 0 });
  });

  test('met een open grendel gaan ze alle drie gewoon door', async ({ page }) => {
    await boot(page, { nfToe: NF_DOEL,
      debts: [{ id: 'd1', naam: 'Lening', start: 8000, rest: 6000, perMaand: 200, rente: 6 }],
      set: { planOrder: ['noodfonds', 'kk', 'iw', 'af:d1'], planAlloc: { 'af:d1': { allocMode: 'auto' } } } });
    await page.evaluate(() => { window._planAllocId = 'af:d1'; setPlanAllocMode('fixed'); setPlanAllocVeld('perMaand', '300'); });
    expect(await page.evaluate(() => SET.planAlloc['af:d1'])).toMatchObject({ allocMode: 'fixed', perMaand: 300 });
  });

  test('de chips staan er niet, in de doel-editor en op het aflos-blad', async ({ page }) => {
    await boot(page, { debts: [{ id: 'd1', naam: 'Lening', start: 8000, rest: 6000, perMaand: 200, rente: 6 }],
      set: { planOrder: ['noodfonds', 'kk', 'iw', 'af:d1'] } });
    const g = await page.evaluate(() => { openGoal('kk'); return { chips: document.querySelectorAll('#gModes .chip').length, t: document.getElementById('sheet').innerText }; });
    expect(g.chips).toBe(0);
    expect(g.t).toContain('Een eigen maandbedrag kan zodra');
    const a = await page.evaluate(() => { openPlanAlloc('af:d1'); return { chips: document.querySelectorAll('#paModes .chip').length, t: document.getElementById('sheet').innerText }; });
    expect(a.chips).toBe(0);
    expect(a.t).toContain('Een eigen maandbedrag kan zodra');
  });

  test('met een open grendel staan ze er weer', async ({ page }) => {
    await boot(page, { nfToe: NF_DOEL });
    const g = await page.evaluate(() => { openGoal('kk'); return document.querySelectorAll('#gModes .chip').length; });
    expect(g).toBe(3);
  });
});

test.describe('g · saveGoal slaat op, en laat de verdeling staan', () => {
  test('naam en streefdatum gaan erin, allocMode, perMaand en pct blijven zoals ze waren', async ({ page }) => {
    await boot(page, { kkMode: 'pct', kkPer: 250, set: { goals: [
      { id: 'kk', naam: 'Kosten Koper', doel: 10000, gespaard: 0, allocMode: 'pct', perMaand: 250, pct: 40, streefdatum: overMnd(10) },
      { id: 'iw', naam: 'Inrichting woning', doel: 3000, gespaard: 0, allocMode: 'auto', perMaand: 0, streefdatum: overMnd(6) }] } });
    const nieuw = overMnd(14);
    const g = await page.evaluate((sd) => {
      openGoal('kk');
      /* De chips staan er bij een dichte grendel niet, dus goalMode() is van het scherm niet te
         bereiken. Een blijven staan van een eerdere keuze wel: window._goalMode zetten is precies
         wat goalMode() doet, en saveGoal() hoort hem dan te negeren. Hem via goalMode() zetten kan
         hier niet, want die rendert het blad opnieuw en wist de velden die we net invulden. */
      window._goalMode = 'fixed';
      document.getElementById('gNaam').value = 'Kosten koper huis';
      document.getElementById('gDatum').value = sd;
      saveGoal('kk');
      return (JSON.parse(localStorage.getItem('minder_set')).goals || []).find((x) => x.id === 'kk');
    }, nieuw);
    expect(g.naam).toBe('Kosten koper huis');
    expect(g.streefdatum).toBe(nieuw);
    expect(g.allocMode).toBe('pct');
    expect(g.perMaand).toBe(250);
    expect(g.pct).toBe(40);
  });

  test('een nieuw doel komt op auto met nul, en niet op een vast bedrag', async ({ page }) => {
    await boot(page);
    const sd = overMnd(12);
    const g = await page.evaluate((d) => {
      openGoal('');
      document.getElementById('gNaam').value = 'Nieuwe fiets';
      document.getElementById('gDoel').value = '1200';
      document.getElementById('gDatum').value = d;
      saveGoal('');
      const L = JSON.parse(localStorage.getItem('minder_set')).goals || [];
      return L[L.length - 1];
    }, sd);
    expect(g.naam).toBe('Nieuwe fiets');
    expect(g.allocMode).toBe('auto');
    expect(g.perMaand).toBe(0);
    expect(g.pct).toBe(0);
  });

  test('met een open grendel doet de editor gewoon wat hij deed', async ({ page }) => {
    await boot(page, { nfToe: NF_DOEL });
    const g = await page.evaluate(() => {
      openGoal('kk'); goalMode('fixed');
      document.getElementById('gMnd').value = '400';
      saveGoal('kk');
      return (JSON.parse(localStorage.getItem('minder_set')).goals || []).find((x) => x.id === 'kk');
    });
    expect(g.allocMode).toBe('fixed');
    expect(g.perMaand).toBe(400);
  });
});

/* Blok 5 van het diagnosescherm zegt of ronde 2 mag doorzakken, en of een doel dat geld krijgt
   achter een dichte grendel staat. Zonder die twee zou het blok "grendel=nee" melden bij precies
   het doel waar blok 4 "grendel dicht: JA" over zegt, en dat is de tegenspraak die het blok moet
   vangen. */
test.describe('i · het diagnosescherm leest het mee', () => {
  test('blok 5 noemt planBufferKlaar en de doorzak-markering', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => (function(){ const b=DIAG_BLOKKEN.find((x)=>x.lees===diagAlloc); if(!b) throw new Error('blok diagAlloc staat niet in DIAG_BLOKKEN'); return b.lees().join('\n'); })());
    expect(t).toContain('buffer klaar (planBufferKlaar): JA');
    expect(t).toMatch(/Kosten Koper[^\n]*doorzak=ja/);
    expect(t).toMatch(/Inrichting woning[^\n]*doorzak=nee/);
  });

  test('en bij een gepauzeerde buffer zegt hij dat ronde 2 dicht blijft', async ({ page }) => {
    await boot(page, { set: { planPaused: { noodfonds: true } } });
    const t = await page.evaluate(() => (function(){ const b=DIAG_BLOKKEN.find((x)=>x.lees===diagAlloc); if(!b) throw new Error('blok diagAlloc staat niet in DIAG_BLOKKEN'); return b.lees().join('\n'); })());
    expect(t).toContain('buffer klaar (planBufferKlaar): NEE');
  });

  /* De staande regel van v244: kijken verandert niets. Deze twee lezers zijn nieuw, dus ze worden
     hier ook op localStorage gemeten en niet alleen op de uitvoer. */
  test('het blok schrijft niets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const w = [];
      const echt = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => { w.push(k); return echt(k, v); };
      try { DIAG_BLOKKEN.find((x)=>x.lees===diagAlloc).lees(); } finally { localStorage.setItem = echt; }
      return w;
    });
    expect(r).toEqual([]);
  });
});

/* ===== de bron =====
 * Niet "werkt dit geval", maar "kan ronde 2 langs de grendel zonder de poort te lezen". Dezelfde
 * vorm als de twee bronzoekende tests in grendel-schrijvers.spec.js (v245).
 */
const BRON = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
function strip(t) {
  t = t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return t.split('\n').map((ln) => {
    const m = /(^|[\s;})])\/\/(?!\/)/.exec(ln);
    if (!m) return ln;
    const voor = ln.slice(0, m.index + m[1].length);
    if (/http/.test(ln.slice(Math.max(0, m.index - 8), m.index))) return ln;
    const even = (x, c) => (x.split(c).length - 1) % 2 === 0;
    if (!even(voor, "'") || !even(voor, '"') || !even(voor, '`')) return ln;
    return voor;
  }).join('\n');
}
const CODE = strip(BRON);
const HEADERS = [...CODE.matchAll(/\nfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => ({ i: m.index, naam: m[1] }));
/* De lus die na `anker` begint, afgebakend op zijn eigen accolades. Een slice tot het einde van de
   functie zou de statuslus erbij pakken, en die LEEST de modus wel (p.mode==='auto' voor de
   blokkeerder), dus dan meet deze test iets anders dan hij beweert. */
function lusNa(b, anker) {
  const i = b.indexOf(anker); if (i < 0) return null;
  const f = b.indexOf('for(', i); if (f < 0) return null;
  const open = b.indexOf('{', b.indexOf(')', f)); if (open < 0) return null;
  let d = 0;
  for (let k = open; k < b.length; k++) {
    if (b[k] === '{') d++;
    else if (b[k] === '}') { d--; if (d === 0) return b.slice(open, k + 1); }
  }
  return null;
}
function body(naam) {
  const h = HEADERS.find((x) => x.naam === naam);
  if (!h) return null;
  const volgende = HEADERS.find((x) => x.i > h.i);
  return CODE.slice(h.i, volgende ? volgende.i : CODE.length);
}

test.describe('h · de bron: ronde 2 komt niet langs de grendel zonder de poort', () => {
  test('allocatePlan() leest planBufferKlaar() in een variabele', () => {
    const b = body('allocatePlan');
    expect(b, 'allocatePlan() niet gevonden: de zoekvorm klopt niet meer').toBeTruthy();
    expect(b).toMatch(/(?:const|let)\s+[A-Za-z_$][\w$]*\s*=\s*planBufferKlaar\(/);
  });

  /* Het slot: elke plek in allocatePlan() die een niet-noodfonds-item overslaat moet de uitkomst
     van planBufferKlaar() noemen. Valt die uitzondering weg, of komt er een tweede guard naast die
     zelf beslist, dan valt deze test om. */
  test('elke guard op p.type!==noodfonds noemt de uitkomst van planBufferKlaar()', () => {
    const b = body('allocatePlan');
    const v = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*planBufferKlaar\(/.exec(b);
    expect(v, 'geen variabele uit planBufferKlaar()').toBeTruthy();
    const regels = b.split('\n').filter((ln) => /type!==\s*'noodfonds'/.test(ln) && /continue/.test(ln));
    expect(regels.length, 'geen enkele guard gevonden: de zoekvorm klopt niet meer').toBeGreaterThan(0);
    const ongedekt = regels.filter((ln) => !new RegExp(`\\b${v[1]}\\b`).test(ln));
    expect(ongedekt.map((x) => x.trim())).toEqual([]);
  });

  test('planBufferKlaar() eist alle drie: gekregen, niet gepauzeerd, niet onbekend', () => {
    const b = body('planBufferKlaar');
    expect(b, 'planBufferKlaar() niet gevonden').toBeTruthy();
    expect(b, 'de onbekende stand wordt niet getoetst').toMatch(/nfOnbekend/);
    expect(b, 'pauze wordt niet getoetst').toMatch(/gepauzeerd/);
    expect(b, 'de buffer mag door zonder zijn rest te hebben gekregen').toMatch(/alloc[\s\S]*>=[\s\S]*rest/);
  });

  /* Ronde 2 leest de modus niet, dus een vast maandbedrag splitst hier niets. Dat staat als
     comment bij de lus en als staande regel in CLAUDE.md; deze test houdt het waar, zodat een
     volgende ronde niet iets afdicht dat al dicht is of het opendraait in de veronderstelling dat
     het al meetelde. */
  test('ronde 2 leest geen verdeelmodus', () => {
    const b = body('allocatePlan');
    const ronde2 = lusNa(b, 'planBufferKlaar(');
    expect(ronde2, 'de lus van ronde 2 is niet af te bakenen').toBeTruthy();
    expect(ronde2).toMatch(/p\.extra\s*\+=/);          // dit is werkelijk de doorzak-lus
    expect(ronde2).not.toMatch(/\bmode\b/);
    expect(ronde2).not.toMatch(/perMaand|\bpct\b/);
  });
});
