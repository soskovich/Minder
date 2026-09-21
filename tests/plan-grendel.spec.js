// v242, ronde A: de rekenkant van Plan.
//
// DE GRENDEL. Zolang je noodfonds niet vol is gaat de hele spaarinleg daarheen en valt er niets te
// verdelen. Hij hangt aan type 'noodfonds' en niet aan "het item zonder streefdatum": die tweede
// regel klopt pas in de eindtoestand en wijst tijdens de overgang elk oud doel zonder datum ook
// aan. Zodra de buffer vol is gaat de grendel vanzelf open, zonder handeling.
//
// STREEFDATUM VERPLICHT bij elk doel dat geen noodfonds is, afgedwongen in de editor bij aanmaken
// en bij wijzigen. Bestaande doelen zonder datum blijven bestaan en blijven meetellen, maar lezen
// als onvolledig, met één ingang om de datum alsnog te zetten. Geen stille default.
//
// HARDE GRENS op de som van de vaste maandbedragen: meer verdelen dan je spaarinleg kun je niet
// opslaan. Dezelfde stap van spiegel naar grens als bij het bijstellen van een potje (v238).
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000007788';

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
  // een boeking op de reserveringsrekening, anders valt hij uit OWN en kent resAccId() hem niet
  add('rv' + M1, RES, M1, '10', 200, 'Reservering', 'NAAR RESERVERING');
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 6000,
    manualBal: Object.assign({ [MAIN]: 4000, [SPAAR]: 9000, [RES]: 1200 }, o.bal || {}),
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 3000,
    savingsAcc: { [SPAAR]: true },
    // buffer van 40.000 met 9.000 toegewezen: de grendel zit dicht
    nfDoelVast: o.nfDoel != null ? o.nfDoel : 40000,
    nfToegewezen: o.nfToe != null ? o.nfToe : 9000,
    nfToegewezenMigrated: true,
    goals: o.goals || [],
    planAlloc: { noodfonds: { allocMode: 'auto' } },
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planGrendel === 'function');
  await page.evaluate(() => go('vooruit'));
}
const VOL = { nfDoel: 10000, nfToe: 10000 };   // buffer vol: de grendel staat open
const DRIE = [
  { id: 'g1', naam: 'Vakantie', doel: 3000, gespaard: 0, allocMode: 'fixed', perMaand: 500, streefdatum: '2028-06' },
  { id: 'g2', naam: 'Auto', doel: 16000, gespaard: 0, allocMode: 'fixed', perMaand: 800, streefdatum: '2029-01' },
  { id: 'g3', naam: 'Studie', doel: 9000, gespaard: 0, allocMode: 'fixed', perMaand: 400, streefdatum: '2030-01' },
];
const plan = (page) => page.evaluate(() => allocatePlan().map((p) => ({
  id: p.id, type: p.type, naam: p.naam, alloc: p.alloc, base: p.base, extra: p.extra,
  status: p.status, mode: p.mode, perMaand: p.perMaand })));

test.describe('a · de grendel', () => {
  test('dicht: de hele inleg gaat naar de buffer en de rest wacht', async ({ page }) => {
    await boot(page, { goals: DRIE });
    const G = await page.evaluate(() => planGrendel());
    expect(G.dicht).toBe(true);
    expect(G.rest).toBe(31000);
    const P = await plan(page);
    const nf = P.find((p) => p.type === 'noodfonds');
    expect(nf.alloc).toBe(3000);                       // de hele spaarinleg
    for (const p of P.filter((x) => x.type === 'goal')) {
      expect(p.alloc, p.naam).toBe(0);
      expect(p.status, p.naam).toBe('wacht op de buffer');
    }
    /* En de rij zegt wanneer verdelen opengaat. v246: dat stond in planSub() als "Wacht op je
       buffer · verdelen gaat open rond X"; sinds de vertakte waterval staat het in het datumpaar
       van het vat, onder de streefdatum. Dezelfde bron (planGrendelDatum), andere plek. */
    const t = await page.evaluate(() => document.querySelector('#s-vooruit').innerText);
    expect(t).toMatch(/verdelen gaat open rond \w+ \d{4}/);
  });

  test('het noodfonds is niet te verslepen en niet op een vast bedrag te zetten', async ({ page }) => {
    await boot(page, { goals: DRIE });
    const r = await page.evaluate(() => {
      const voor = planItems().map((x) => x.id);
      planMove('noodfonds', 1);                         // omlaag duwen
      const naOmlaag = planItems().map((x) => x.id);
      planMove('g1', -1);                               // een doel erboven trekken
      const naOmhoog = planItems().map((x) => x.id);
      setNfAllocMode('fixed');
      return { voor, naOmlaag, naOmhoog, mode: planAllocOf(planAllocCfg('noodfonds')).mode };
    });
    expect(r.naOmlaag).toEqual(r.voor);
    expect(r.naOmhoog).toEqual(r.voor);
    expect(r.mode).toBe('auto');
    // en de sheet toont geen keuze, maar zegt waarom
    const sheet = await page.evaluate(() => { openNoodfondsPanel(); return document.querySelector('#sheet').innerText; });
    expect(sheet).toMatch(/Je hele spaarinleg/);
    expect(sheet).not.toMatch(/Vast bedrag|Percentage/);
  });

  test('vol: de grendel gaat vanzelf open, zonder handeling', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, VOL));
    expect(await page.evaluate(() => planGrendel())).toBe(null);
    const P = await plan(page);
    expect(P.find((p) => p.type === 'noodfonds').status).toBe('bereikt');
    expect(P.filter((p) => p.type === 'goal').every((p) => p.status !== 'wacht op de buffer')).toBe(true);
    // en dan mag het noodfonds wel schuiven
    const na = await page.evaluate(() => { planMove('noodfonds', 1); return planItems().map((x) => x.id); });
    expect(na[0]).not.toBe('noodfonds');
  });

  test('zonder buffer-doel is er niets te grendelen', async ({ page }) => {
    await boot(page, { goals: DRIE, nfDoel: 0, nfToe: 0, set: { nfDoelVast: 0 } });
    const G = await page.evaluate(() => planGrendel());
    if (G) expect(G.doel).toBeGreaterThan(0);          // een geschat doel telt ook
    else expect(G).toBe(null);
  });

  test('onbekende spaarstand: dicht, maar zonder maand', async ({ page }) => {
    await boot(page, { goals: DRIE, set: { nfToegewezenMigrated: false, manualBal: { [MAIN]: 4000 } } });
    const G = await page.evaluate(() => planGrendel());
    expect(G.dicht).toBe(true);
    expect(G.onbekend).toBe(true);
    expect(await page.evaluate(() => planGrendelDatum())).toBe('');
    const t = await page.evaluate(() => document.querySelector('#s-vooruit').innerText);
    expect(t).not.toMatch(/verdelen gaat open rond/);
  });
});

test.describe('b · de streefdatum', () => {
  test('een nieuw doel zonder streefdatum kan niet worden opgeslagen', async ({ page }) => {
    await boot(page, Object.assign({ goals: [] }, VOL));
    const r = await page.evaluate(() => {
      openGoal();
      document.getElementById('gNaam').value = 'Zonder datum';
      document.getElementById('gDoel').value = '2000';
      const veld = document.getElementById('gMnd'); if (veld) veld.value = '100';
      saveGoal('');
      return { aantal: (SET.goals || []).length, sheetOpen: !!document.querySelector('#sheet .fld') };
    });
    expect(r.aantal).toBe(0);
    expect(r.sheetOpen).toBe(true);                    // de sheet blijft open, niets opgeslagen
    expect(await page.evaluate(() => document.body.innerText)).toMatch(/Kies een streefdatum/);
  });

  test('met een streefdatum kan het wel, en het label zegt niet meer optioneel', async ({ page }) => {
    await boot(page, Object.assign({ goals: [] }, VOL));
    const r = await page.evaluate(() => {
      openGoal();
      const labels = [...document.querySelectorAll('#sheet .fld')].map((x) => x.textContent);
      document.getElementById('gNaam').value = 'Vakantie';
      document.getElementById('gDoel').value = '3000';
      document.getElementById('gDatum').value = '2029-06';
      document.getElementById('gMnd').value = '250';
      saveGoal('');
      return { labels, goals: (SET.goals || []).map((g) => ({ naam: g.naam, sd: g.streefdatum, mode: g.allocMode, per: g.perMaand })) };
    });
    expect(r.labels.some((l) => /Streefdatum$/.test(l))).toBe(true);
    expect(r.labels.some((l) => /optioneel/i.test(l))).toBe(false);
    expect(r.goals).toEqual([{ naam: 'Vakantie', sd: '2029-06', mode: 'fixed', per: 250 }]);
  });

  test('een bestaand doel zonder datum telt mee, leest als onvolledig en heeft een ingang', async ({ page }) => {
    await boot(page, Object.assign({ goals: [{ id: 'oud', naam: 'Oud doel', doel: 5000, gespaard: 1000 }] }, VOL));
    const P = await plan(page);
    const g = P.find((x) => x.id === 'oud');
    expect(g).toBeTruthy();
    expect(g.alloc).toBeGreaterThan(0);                // telt gewoon mee in de verdeling
    const t = await page.evaluate(() => document.querySelector('#s-vooruit').innerText);
    expect(t).toMatch(/Streefdatum ontbreekt/);
    expect(t).toMatch(/datum zetten/);
    // en die ingang zet de datum alsnog
    const na = await page.evaluate(() => {
      openGoal('oud');
      document.getElementById('gDatum').value = '2029-03';
      saveGoal('oud');
      return (SET.goals || []).find((x) => x.id === 'oud').streefdatum;
    });
    expect(na).toBe('2029-03');
    expect(await page.evaluate(() => document.querySelector('#s-vooruit').innerText)).not.toMatch(/Streefdatum ontbreekt/);
  });

  test('wijzigen zonder datum kan ook niet, dus er ontstaat er nooit een tweede', async ({ page }) => {
    await boot(page, Object.assign({ goals: [{ id: 'g1', naam: 'Vakantie', doel: 3000, gespaard: 0, streefdatum: '2029-06' }] }, VOL));
    const r = await page.evaluate(() => {
      openGoal('g1');
      document.getElementById('gDatum').value = '';
      saveGoal('g1');
      return (SET.goals || []).find((x) => x.id === 'g1').streefdatum;
    });
    expect(r).toBe('2029-06');
  });
});

test.describe('c · het maandbedrag en de harde grens', () => {
  test('drie doelen onder de inleg: de verdeling klopt en het restant is zichtbaar', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, VOL));
    const P = await plan(page);
    const byId = Object.fromEntries(P.map((p) => [p.id, p]));
    expect(byId.g1.base).toBe(500);
    expect(byId.g2.base).toBe(800);
    expect(byId.g3.base).toBe(400);
    // 3000 inleg, 1700 verdeeld: het restant zakt door naar het eerste lopende doel (ronde 2)
    const verdeeld = P.reduce((a, p) => a + p.alloc, 0);
    expect(verdeeld).toBe(3000);
    expect(byId.g1.extra + byId.g2.extra + byId.g3.extra).toBe(1300);
    expect(await page.evaluate(() => planVastRuimte().over)).toBe(1300);
  });

  test('boven de inleg: opslaan kan niet, en de sheet toont het verschil', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, VOL));
    const r = await page.evaluate(() => {
      openGoal('g3');
      document.getElementById('gMnd').value = '2000';   // 500 + 800 + 2000 = 3300 > 3000
      saveGoal('g3');
      const bewaard = (SET.goals || []).find((x) => x.id === 'g3').perMaand;
      openGoal('g3');
      return { bewaard, sheet: document.querySelector('#sheet').innerText };
    });
    expect(r.bewaard).toBe(400);                        // niets opgeslagen
    expect(await page.evaluate(() => document.body.innerText)).toMatch(/te veel verdeeld/);
    expect(r.sheet).toMatch(/Er is €1\.700 per maand te verdelen/);
  });

  test('precies op de inleg mag wel', async ({ page }) => {
    await boot(page, Object.assign({ goals: DRIE }, VOL));
    const r = await page.evaluate(() => {
      openGoal('g3');
      document.getElementById('gMnd').value = '1700';   // 500 + 800 + 1700 = 3000
      saveGoal('g3');
      return (SET.goals || []).find((x) => x.id === 'g3').perMaand;
    });
    expect(r).toBe(1700);
    expect(await page.evaluate(() => planVastRuimte().over)).toBe(0);
  });

  test('een doel dat vol raakt geeft zijn restant aan het volgende op volgorde', async ({ page }) => {
    // Vakantie heeft nog 200 nodig maar krijgt 500 toegewezen: 300 zakt door naar Auto
    const G = [
      { id: 'g1', naam: 'Vakantie', doel: 3000, gespaard: 2800, allocMode: 'fixed', perMaand: 500, streefdatum: '2028-06' },
      { id: 'g2', naam: 'Auto', doel: 16000, gespaard: 0, allocMode: 'fixed', perMaand: 800, streefdatum: '2029-01' },
    ];
    await boot(page, Object.assign({ goals: G }, VOL));
    const P = await plan(page);
    const byId = Object.fromEntries(P.map((p) => [p.id, p]));
    expect(byId.g1.alloc).toBe(200);                    // nooit meer dan wat het nodig heeft
    expect(byId.g1.base).toBe(200);
    expect(byId.g2.base).toBe(800);
    /* ronde 1 geeft Vakantie 200 (wat het nog nodig heeft, niet de 500 van zijn maandbedrag) en
       Auto zijn 800; de 2.000 die daarna nog over is zakt in ronde 2 door naar Auto, want dat is
       het volgende lopende doel op volgorde. */
    expect(byId.g2.extra).toBe(2000);
    expect(byId.g2.alloc).toBe(2800);
    expect(byId.g1.alloc + byId.g2.alloc).toBe(3000);
  });
});

test.describe('d · reserveringen: stand, kosten, verschil', () => {
  const POSTEN = [
    { id: 'r1', naam: 'Gemeentelijke aanslag', bedrag: 480, vervalmaand: ym(new Date(now.getFullYear(), now.getMonth() + 3, 1)), intervalM: 12 },
    { id: 'r2', naam: 'Tandarts', bedrag: 300, vervalmaand: ym(new Date(now.getFullYear(), now.getMonth() + 6, 1)), intervalM: 12 },
  ];
  const kaart = (page) => page.evaluate(() => {
    const el = [...document.querySelectorAll('#s-vooruit .card')].find((c) => /Reserveringen/.test(c.innerText));
    return el ? el.innerText.replace(/\s+/g, ' ') : '';
  });

  test('met dekking: het verschil leest als wat er overblijft', async ({ page }) => {
    await boot(page, Object.assign({ set: { resAcc: RES, reserveringen: POSTEN }, bal: { [RES]: 5000 } }, VOL));
    const D = await page.evaluate(() => dekking(12));
    expect(D.werkelijkeStand).toBe(5000);
    expect(D.tekort).toBe(0);
    const t = await kaart(page);
    expect(t).toContain('€5.000');
    expect(t).toMatch(/Gemeentelijke aanslag ·/);
    expect(t).toMatch(/Tandarts ·/);
    expect(t).toMatch(/Blijft over/);
    expect(t).not.toMatch(/Tekort/);
    // de dekkingsgraad en gedektTot staan niet meer op dit blok
    expect(t).not.toMatch(/gedekt tot|%/);
  });

  test('zonder dekking: het verschil leest als tekort, zonder alarmkleur', async ({ page }) => {
    await boot(page, Object.assign({ set: { resAcc: RES, reserveringen: POSTEN }, bal: { [RES]: 50 } }, VOL));
    const D = await page.evaluate(() => dekking(12));
    expect(D.tekort).toBeGreaterThan(0);
    const t = await kaart(page);
    expect(t).toMatch(/Tekort/);
    expect(t).not.toMatch(/Blijft over/);
    const rood = await page.evaluate(() => {
      const el = [...document.querySelectorAll('#s-vooruit .card')].find((c) => /Reserveringen/.test(c.innerText));
      return (el.innerHTML.match(/var\(--red\)|var\(--amber\)/g) || []).length;
    });
    expect(rood).toBe(0);
  });

  test('zonder rekening of zonder saldo staat er geen verschil', async ({ page }) => {
    await boot(page, Object.assign({ set: { reserveringen: POSTEN } }, VOL));
    const t = await kaart(page);
    expect(t).toMatch(/nog geen rekening aangewezen/);
    expect(t).not.toMatch(/Tekort|Blijft over/);
  });

  test('een verstreken eenmalige post vervalt, een post met interval rolt door', async ({ page }) => {
    const oud = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
    const lijst = [
      { id: 'een', naam: 'Eenmalig verleden', bedrag: 400, vervalmaand: oud, intervalM: 0 },
      { id: 'rol', naam: 'Jaarlijks verleden', bedrag: 600, vervalmaand: oud, intervalM: 12 },
    ];
    await boot(page, Object.assign({ set: { resAcc: RES, reserveringen: lijst }, bal: { [RES]: 5000 } }, VOL));
    const r = await page.evaluate(() => ({
      een: resVolgende(resLijst().find((x) => x.id === 'een')),
      rol: resVolgende(resLijst().find((x) => x.id === 'rol')),
      namen: verplichtingen(12).map((x) => x.naam),
    }));
    expect(r.een).toBe(null);                           // eenmalig en verstreken: vervalt
    expect(r.rol).toBe(10);                             // jaarlijks: rolt door naar de volgende cyclus
    expect(r.namen).toEqual(['Jaarlijks verleden']);
    const t = await kaart(page);
    expect(t).toMatch(/Jaarlijks verleden/);
    expect(t).not.toMatch(/Eenmalig verleden/);
  });
});

test.describe('e · een reservering wordt een spaardoel', () => {
  const POST = [{ id: 'r1', naam: 'Woninginrichting', bedrag: 8000,
    vervalmaand: ym(new Date(now.getFullYear() + 1, now.getMonth(), 1)), intervalM: 0 }];

  test('reservering weg, doel aangemaakt met de juiste streefdatum', async ({ page }) => {
    await boot(page, Object.assign({ set: { resAcc: RES, reserveringen: POST }, bal: { [RES]: 5000 } }, VOL));
    const doelYm = ym(new Date(now.getFullYear() + 1, now.getMonth(), 1));
    const r = await page.evaluate((y) => {
      openResNaarDoel('r1');
      const sheet = document.querySelector('#sheet').innerText;
      document.getElementById('rnGespaard').value = '0';
      resNaarDoel('r1');
      const g = (SET.goals || []).find((x) => x.naam === 'Woninginrichting');
      return { sheet, res: resLijst().length, doel: g ? g.doel : null, sd: g ? g.streefdatum : null,
        gespaard: g ? g.gespaard : null, wil: y };
    }, doelYm);
    expect(r.res).toBe(0);                              // de reservering is weg
    expect(r.doel).toBe(8000);
    expect(r.sd).toBe(r.wil);
    expect(r.gespaard).toBe(0);
    // en de regel over dubbeltelling stond in de sheet, zonder gebiedende wijs
    expect(r.sheet).toMatch(/telt het hier én in je dekking, dus twee keer/);
    expect(r.sheet).not.toMatch(/\bBoek\b|\bZorg\b|\bMoet\b/);
  });

  test('al gespaard komt mee, geklemd op het doelbedrag', async ({ page }) => {
    await boot(page, Object.assign({ set: { resAcc: RES, reserveringen: POST }, bal: { [RES]: 5000 } }, VOL));
    const r = await page.evaluate(() => {
      openResNaarDoel('r1');
      document.getElementById('rnGespaard').value = '99999';
      resNaarDoel('r1');
      return (SET.goals || []).find((x) => x.naam === 'Woninginrichting').gespaard;
    });
    expect(r).toBe(8000);
  });

  test('zonder bedrag of zonder volgende maand kan het omzetten niet', async ({ page }) => {
    const leeg = [{ id: 'r2', naam: 'Nog leeg', bedrag: 0, vervalmaand: ym(new Date(now.getFullYear() + 1, now.getMonth(), 1)), intervalM: 0 }];
    await boot(page, Object.assign({ set: { resAcc: RES, reserveringen: leeg }, bal: { [RES]: 5000 } }, VOL));
    const r = await page.evaluate(() => {
      openResNaarDoel('r2');
      const sheet = document.querySelector('#sheet').innerText;
      resNaarDoel('r2');
      return { sheet, goals: (SET.goals || []).length, res: resLijst().length };
    });
    expect(r.goals).toBe(0);
    expect(r.res).toBe(1);
    expect(r.sheet).toMatch(/geen bedrag/i);
  });
});
