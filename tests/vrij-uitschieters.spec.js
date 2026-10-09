/* v367: VRIJ GELD OP HOME, UITSCHIETERS OP INZICHTEN, DEZE MAAND ALLEEN DEZE MAAND, SPAARDOELEN ALS RIJEN.
   Home, Inzichten en Grip op de stand van 7 oktober 2026 (tests/inzichten-stand.js), Plan op de stand van
   9 oktober (tests/opschonen-stand.js). */
const { test, expect } = require('@playwright/test');
const I = require('./inzichten-stand');
const O = require('./opschonen-stand');

test.describe('a · Home: het saldo is het hoofdgetal, vrij te besteden staat eronder', () => {
  test('de groene regel is safeToSpend(), en het dagbedrag is datzelfde getal door de resterende dagen', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => go('dash'));
    const r = await page.evaluate(() => {
      const S = safeToSpend(), el = document.querySelector('[data-vrij]'), dag = document.querySelector('[data-vrijdag]');
      return { safe: S.safe, saldo: Math.round(S.saldo), vrij: +el.dataset.vrij, tekst: el.innerText, perDag: +dag.dataset.vrijdag,
        dagen: maandDagenOver(thisYM()), big: +document.querySelector('[data-totaalsaldo]').dataset.totaalsaldo,
        hero: document.querySelector('.homehero').innerText };
    });
    expect(r.safe).toBeGreaterThan(0);
    expect(r.vrij).toBe(r.safe);
    expect(r.big).toBe(r.saldo);
    expect(r.perDag).toBe(Math.round(r.safe / r.dagen));
    expect(r.tekst).toContain('waarvan vrij te besteden');
    expect(r.tekst).toContain(`per dag · nog ${r.dagen} dagen`);
    expect(r.hero).not.toMatch(/deze maand, dus/);
    expect(r.hero).not.toMatch(/Veilig te besteden/);
  });
  test('op de bank plus contant is het totaal', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => go('dash'));
    const r = await page.evaluate(() => { const el = document.querySelector('[data-saldosplit]');
      return { bank: +el.dataset.bank, contant: +el.dataset.contant, totaal: +document.querySelector('[data-totaalsaldo]').dataset.totaalsaldo }; });
    expect(r.contant).toBe(80);
    expect(r.bank + r.contant).toBe(r.totaal);
  });
  test('een tik opent de opbouw, en de laatste regel is exact safeToSpend()', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => go('dash'));
    await page.click('[data-vrij]');
    const r = await page.evaluate(() => ({ safe: safeToSpend().safe, eind: +document.querySelector('[data-vrijeind]').dataset.vrijeind,
      kop: document.querySelector('[data-vrijkop]').innerText, deling: document.querySelector('[data-vrijdeling]').innerText,
      V: vrijPerDag() }));
    expect(r.eind).toBe(r.safe);
    expect(r.kop).toContain(`Zo kom je op €${r.safe.toLocaleString('nl-NL')}`);
    expect(r.deling).toContain(`÷ ${r.V.dagenResterend} dagen = €${r.V.perDag.toLocaleString('nl-NL')} per dag`);
  });
  /* DE OPBOUW SLUIT: het saldo, plus wat er nog binnenkomt, min elke regel onder "Hier gaat nog vanaf", is de
     eindregel. De terugzet-regel, contant en onregelmatig zijn "waarvan" en dragen geen term. */
  test('de regels van de opbouw tellen op tot de eindregel', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => { go('dash'); openSafeToSpend(); });
    const r = await page.evaluate(() => {
      const T = [...document.querySelectorAll('#sheet [data-term]')].map((e) => [e.dataset.termsoort, +e.dataset.term]);
      return { T, eind: +document.querySelector('[data-vrijeind]').dataset.vrijeind, safe: safeToSpend().safe };
    });
    expect(r.T.filter(([k]) => k === 'saldo').length).toBe(1);
    expect(r.T.filter(([k]) => k === 'min').length, 'er gaat werkelijk iets vanaf').toBeGreaterThan(1);
    const som = r.T.reduce((a, [k, v]) => a + (k === 'min' ? -v : v), 0);
    expect(Math.round(som)).toBe(r.eind);
    expect(r.eind).toBe(r.safe);
  });

  test('de aankoopcheck rekent met hetzelfde vrije bedrag', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => coStart('koop', null, { cat: 'vices', amt: 300, item: 'test', verder: true }));
    await expect(page.locator('#coThr')).toContainText('vrij te besteden', { timeout: 8000 });
    const r = await page.evaluate(() => ({ t: document.getElementById('coThr').innerText, V: vrijPerDag() }));
    expect(r.t).toContain(`je hebt nu €${r.V.ruimte.toLocaleString('nl-NL')} vrij te besteden, daarna €${(r.V.ruimte - 300).toLocaleString('nl-NL')}`);
  });
});

test.describe('b · Inzichten: geen tweede dagbedrag, en de uitschieters zijn de rode stappen van Grip', () => {
  test('de potjestegel zegt wat het geld is, zonder per dag', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => go('ins'));
    const ms = await page.evaluate(() => document.querySelector('[data-instegel="potjes"] .ms').innerText);
    expect(ms).toBe('al bestemd, verdeeld over je potjes');
    expect(await page.evaluate(() => document.getElementById('s-ins').innerText)).not.toMatch(/per dag/);
  });
  test('tegen je potje: dezelfde set en volgorde als de rode stappen in de bridge', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => { SET.insKeuze = 'potje'; go('ins'); });
    const r = await page.evaluate(() => ({
      ins: [...document.querySelectorAll('[data-insuitschieter]')].map((e) => e.dataset.insuitschieter),
      afw: [...document.querySelectorAll('[data-insuitschieter]')].map((e) => +e.dataset.afwijking),
      rood: dezeMaandBrug(maandVooruit()).stappen.filter((s) => s.soort === 'potje' && s.waarde > 0).map((s) => s.k),
      bron: uitschieters(maandVooruit()).map((x) => [x.k, Math.round(x.overR)]),
      geen: !!document.querySelector('[data-insgeenander]') }));
    expect(r.ins).toEqual(['uiteten', 'vices']);
    expect(r.ins).toEqual(r.rood);
    expect(r.afw).toEqual(r.bron.map((x) => x[1]));
    /* gesorteerd op de verwachte afwijking en NIET op uitgegeven: Uit eten heeft er 110 uit, Vices 0 */
    expect(r.afw[0]).toBeGreaterThan(r.afw[1]);
    expect(r.geen).toBe(true);
  });
  /* DE VOLGORDE IS DE AFWIJKING EN NIET WAT ER AL UIT IS, op een stand waar de twee uiteenlopen. De test hierboven
     vergelijkt twee lezers van dezelfde functie, en een sabotage IN die functie schuift beide kanten mee (meetles x).
     Met Uit eten op EUR 200 eindigt Uit eten verwacht 80 erboven met 110 uitgegeven, en Vices 101 met 0 uitgegeven. */
  test('de volgorde is de verwachte afwijking, ook als uitgegeven de andere kant op wijst', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => { SET.budgets.uiteten = 200; SET.insKeuze = 'potje'; save(); go('ins'); renderIns(); });
    const r = await page.evaluate(() => { const P = maandVooruit().potjes;
      const v = (k) => P.find((x) => x.k === k);
      return { ui: [Math.round(v('uiteten').uit), Math.round(v('uiteten').overR)], vi: [Math.round(v('vices').uit), Math.round(v('vices').overR)],
        ins: [...document.querySelectorAll('[data-insuitschieter]')].map((e) => e.dataset.insuitschieter),
        los: dezeMaandBrug(maandVooruit()).los.map((x) => x.k) }; });
    expect(r.ui[0], 'invoer: Uit eten heeft meer uit').toBeGreaterThan(r.vi[0]);
    expect(r.vi[1], 'invoer: Vices eindigt verder boven').toBeGreaterThan(r.ui[1]);
    expect(r.ins).toEqual(['vices', 'uiteten']);
    expect(r.los).toEqual(['vices', 'uiteten']);
  });
  test('met een uitschieter staat er een regel en "geen andere uitschieters"', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => { SET.budgets.vices = 200; SET.insKeuze = 'potje'; save(); go('ins'); renderIns(); });
    const r = await page.evaluate(() => ({ n: document.querySelectorAll('[data-insuitschieter]').length,
      geen: (document.querySelector('[data-insgeenander]') || {}).innerText || '' }));
    expect(r.n).toBe(1);
    expect(r.geen).toContain('geen andere uitschieters (drempel ≥ €10 én ≥ 25%, of ≥ €50)');
  });
  test('de drempel: een potje dat er net boven komt is geen uitschieter, ook niet in de bridge of de zin', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => { SET.budgets.boodschappen = 380; SET.insKeuze = 'potje'; save(); go('ins'); renderIns(); });
    const r = await page.evaluate(() => { const V = maandVooruit(), b = V.potjes.find((x) => x.k === 'boodschappen'), Br = dezeMaandBrug(V);
      return { over: Math.round(b.overR), aard: b.aard, uit: b.uit, typ: b.typisch, ins: [...document.querySelectorAll('[data-insuitschieter]')].map((e) => e.dataset.insuitschieter),
        los: Br.los.map((x) => x.k), zin: dezeMaandZin(Br) }; });
    expect(r.over).toBeGreaterThan(0);              // invoer: Boodschappen eindigt verwacht boven zijn potje
    expect(r.over).toBeLessThan(380 * 0.25);         // maar onder de drempel
    expect(r.over).toBeLessThan(50);                // en onder de EUR 50 van v368
    expect(r.uit).toBeLessThan(r.typ);               // en loopt achter op het gewone tempo
    expect(r.ins).not.toContain('boodschappen');
    expect(r.los).not.toContain('boodschappen');
    expect(r.zin).not.toContain('Boodschappen');
  });
  test('tegen vorige maanden: de drie grootste verschillen, plus of min, op het absolute verschil', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => { insKeuzeZet('vorige'); });
    const r = await page.evaluate(() => ({ top: [...document.querySelectorAll('#insKeuze [data-insvorigrij]')].map((e) => +e.dataset.verschil),
      alle: insVorigeRijen(insKeuzeData()).map((x) => x.d), sub: (document.querySelector('[data-insallesub]') || {}).innerText || '' }));
    expect(r.top.length).toBeLessThanOrEqual(3);
    const abs = r.top.map(Math.abs);
    expect(abs).toEqual([...abs].sort((a, b) => b - a));
    const groter = r.alle.filter((d) => !r.top.includes(d)).map(Math.abs);
    for (const g of groter) expect(g).toBeLessThanOrEqual(Math.min(...abs));
  });
  test('alle potjes: de drilldown toont elk potje met de nulgroep', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => { SET.insKeuze = 'potje'; go('ins'); });
    const knop = await page.evaluate(() => document.querySelector('[data-insalleknop="potje"]').innerText);
    await page.click('[data-insalleknop="potje"]');
    const r = await page.evaluate(() => ({ rij: document.querySelectorAll('#insAlle [data-inspotrij]').length, nul: !!document.querySelector('#insAlle [data-insnulgroep]'),
      n: insKeuzeData().rows.filter((x) => x.potje > 0).length, kaartNul: !!document.querySelector('#insKeuze [data-insnulgroep]') }));
    expect(knop).toContain(`Alle ${r.n} potjes`);
    expect(r.nul).toBe(true);
    expect(r.kaartNul).toBe(false);
    await page.click('#insAlle [data-insnulgroep] [role=button]');
    expect(await page.evaluate(() => document.querySelectorAll('#insAlle [data-inspotrij]').length)).toBe(r.n);
  });
});

test.describe('c · Grip: Deze maand draagt alleen deze maand', () => {
  test('een afspraak voor later staat niet als regel, maar telt in "N afspraken voor ..."', async ({ page }) => {
    await I.boot(page);
    const r = await page.evaluate(() => {
      const nu = thisYM(), nov = nextYM(nu), dec = nextYM(nov);
      const a1 = afspraakMaak({ soort: 'potje', cat: 'uiteten', bedrag: 120, van: nov, tot: nov, wat: 'Potje Uit eten €120 vanaf november' });
      const a2 = afspraakMaak({ soort: 'potje', cat: 'boodschappen', bedrag: 400, van: nu, tot: nu, wat: 'Potje Boodschappen €400 in oktober' });
      potPlanZet('vices', dec, 60); save(); go('maand');
      return { a1: a1.id, a2: a2.id, later: (document.querySelector('[data-afsprakenlater]') || {}).dataset,
        tekst: (document.querySelector('[data-afsprakenlater]') || {}).innerText || '',
        r1: !!document.querySelector(`#gripDezeMaand [data-afspraak="${a1.id}"]`), r2: !!document.querySelector(`#gripDezeMaand [data-afspraak="${a2.id}"]`),
        omhoog: document.querySelectorAll('#gripDezeMaand [data-potomhoog]').length };
    });
    expect(r.r1).toBe(false);
    expect(r.r2).toBe(true);
    expect(r.omhoog).toBe(0);
    expect(r.later.afsprakenlater).toBe('2');
    expect(r.tekst).toContain('2 afspraken voor nov–dec');
    expect(r.tekst).toContain('Logboek');
  });
  test('de regel van deze maand toont het verwachte bedrag uit dezelfde bron als de bridge', async ({ page }) => {
    await I.boot(page);
    const r = await page.evaluate(() => {
      const nu = thisYM(), V = maandVooruit();
      const vp = V.vastePotjes[0], k = vp.k, alle = [...V.vastePotjes, ...V.potjes].filter((x) => x.k === k);
      const eind = Math.round(alle.reduce((t, x) => t + (x.eindR != null ? x.eindR : x.eind), 0)), g = Math.round(+SET.budgets[k]) + 300;
      const a = afspraakMaak({ soort: 'potje', cat: k, bedrag: g, van: nu, tot: nu, wat: 'Potje test' }); save(); go('maand');
      return { eind, g, feit: document.querySelector(`[data-afspraak="${a.id}"] [data-affeit]`).innerText };
    });
    expect(r.feit).toBe(`€${r.eind.toLocaleString('nl-NL')} verwacht · €${(r.g - r.eind).toLocaleString('nl-NL')} ruimte`);
    expect(r.feit).not.toMatch(/tot nu/);
  });
  test('de zin onder de bridge noemt precies de rode stappen', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => go('maand'));
    const r = await page.evaluate(() => ({ zin: document.querySelector('[data-dmzin]').innerText, los: dezeMaandBrug(maandVooruit()).los.map((x) => x.naam),
      alle: maandVooruit().potjes.map((x) => x.naam) }));
    for (const n of r.alle) { if (r.los.includes(n)) expect(r.zin).toContain(n); else expect(r.zin).not.toContain(n); }
  });
  test('op de 1e van de maand staat in de pop-up wat er vanaf vandaag geldt, een keer', async ({ page }) => {
    await I.boot(page, { dag: '2026-11-01', set: { maandAfsluiting: {}, afsluitPopup: { dag: '2026-10-31' }, maandGelezen: '2026-10-20',
      budgetsNext: Object.assign({}, I.BUDGETS, { vices: 120, vakantie: 1000 }) } });
    await page.evaluate(() => openAfsluiting(afsluitMaand()));
    await page.waitForSelector('[data-maandbegin]');
    const r = await page.evaluate(() => ({ rij: [...document.querySelectorAll('[data-maandbeginrij]')].map((e) => [e.dataset.maandbeginrij, +e.dataset.oud, +e.dataset.nieuw]),
      budget: +document.querySelector('[data-maandbeginbudget]').dataset.maandbeginbudget, tot: Math.round(totalBudget()), t: document.querySelector('[data-maandbegin]').innerText }));
    expect(r.rij).toEqual([['vakantie', 1239, 1000], ['vices', 20, 120]]);
    expect(r.budget).toBe(r.tot);
    expect(r.t).toContain('November begint');
    expect(r.t).toContain('€20 → €120 ↑');
    await page.click('[data-maandbeginklopt]');
    const na = await page.evaluate(() => ({ data: maandBeginData(), blok: !!document.querySelector('[data-maandbegin]'), mag: afsluitPopupMag() }));
    expect(na.data).toBeNull();
    expect(na.blok).toBe(false);
    expect(na.mag).toBe(false);
  });
  test('niet op een andere dag dan de 1e', async ({ page }) => {
    await I.boot(page, { dag: '2026-11-02', set: { maandAfsluiting: {}, maandGelezen: '2026-10-20', budgetsNext: Object.assign({}, I.BUDGETS, { vices: 120 }) } });
    expect(await page.evaluate(() => maandBeginData())).toBeNull();
  });
});

test.describe('d · Plan: een rij per doel en een tijdlijn', () => {
  test('rijen in plaats van vaten, met een status per doel', async ({ page }) => {
    await O.boot(page);
    await page.evaluate(() => go('vooruit'));
    const r = await page.evaluate(() => ({ vat: document.querySelectorAll('#s-vooruit [data-vat], #s-vooruit .wf-kol').length,
      rij: [...document.querySelectorAll('#s-vooruit .plan-item[data-id]')].map((e) => [e.dataset.id, e.querySelector('[data-planstatus]').innerText]),
      volg: (document.querySelector('[data-planvolgorde]') || {}).innerText || '', regel: !!document.getElementById('terugzetRegel'), kaart: !!document.getElementById('terugzetKaart') }));
    expect(r.vat).toBe(0);
    expect(r.rij).toEqual([['noodfonds', 'nu actief'], ['kk', 'nu actief'], ['iw', 'wacht tot apr 2027']]);   // v370: oktober telt mee
    expect(r.volg).toContain('Volgorde: 1 → 2 → 3, de ruimte schuift door');
    expect(r.regel).toBe(true);
    expect(r.kaart).toBe(false);
  });
  test('de datums in de rijen en de tijdlijn komen uit planVooruit() en etaDatum()', async ({ page }) => {
    await O.boot(page);
    await page.evaluate(() => go('vooruit'));
    const r = await page.evaluate(() => { const P = allocatePlan(), VOL = planVooruit(P, planCapacity());
      return { verwacht: Object.fromEntries(P.map((p) => [p.id, etaDatum(VOL[p.id])])),
        rechts: Object.fromEntries([...document.querySelectorAll('#s-vooruit .plan-item[data-id]')].map((e) => [e.dataset.id, e.querySelector('[data-planrechts]').innerText])),
        warn: (document.querySelector('[data-planwaarschuwing]') || {}).innerText || '' }; });
    expect(r.rechts.noodfonds).toContain(`vol ${r.verwacht.noodfonds}`);
    expect(r.rechts.kk).toContain(`vol ${r.verwacht.kk}`);
    expect(r.rechts.iw).toContain('streef mrt 2027');
    expect(r.warn).toContain(`streefdatum niet haalbaar in deze volgorde: vol ${r.verwacht.iw}`);
    await page.click('[data-plantijdlijn]');
    const t = await page.evaluate(() => { const P = allocatePlan(), D = planTijdlijnData(P, planCapacity());
      const rij = (id) => [...document.querySelectorAll(`[data-tlrij="${id}"] [data-tlm]`)];
      return { iwEerste: rij('iw').findIndex((c) => +c.dataset.a > 0), d: D.per.iw.eerste, ruit: rij('iw').findIndex((c) => c.querySelector('[data-ruit]')), K: doelMaandenTot('2027-03'),
        nfVol: rij('noodfonds').filter((c) => c.dataset.tlsoort !== 'leeg').length, nfMnd: D.per.noodfonds.vol,
        wat: (document.querySelector('[data-tlwaarschuwing]') || {}).innerText || '', opties: document.querySelectorAll('[data-tloptie]').length }; });
    expect(t.iwEerste).toBe(t.d);
    expect(t.ruit).toBe(t.K);
    expect(t.wat).toContain('Inrichting: streef mrt 2027, start pas apr 2027');   // v370
    expect(t.wat).toContain('Wat kun je doen?');
    expect(t.opties).toBe(3);
  });
  test('de waarschuwing staat er alleen bij een streefdatum die in deze volgorde niet haalbaar is', async ({ page }) => {
    await O.boot(page);
    await page.evaluate(() => { SET.goals.find((g) => g.id === 'iw').streefdatum = '2027-12'; save(); go('vooruit'); render(); });
    const r = await page.evaluate(() => ({ w: document.querySelectorAll('[data-planwaarschuwing]').length, laat: [...document.querySelectorAll('.plan-item[data-laat="1"]')].length }));
    expect(r.w).toBe(0);
    expect(r.laat).toBe(0);
  });
  for (const vp of [{ width: 360, height: 640 }, { width: 390, height: 844 }]) {
    test(`de hoogte op ${vp.width}px, en op 390x844 staan alle doelen boven de vouw`, async ({ page }) => {
      await O.boot(page);
      await page.setViewportSize(vp);
      await page.evaluate(() => go('vooruit'));
      const r = await page.evaluate(() => { const items = [...document.querySelectorAll('#s-vooruit .plan-item[data-id]')];
        const kaart = items[0].closest('.card'); const nav = document.querySelector('nav, .nav, #nav');
        return { kaart: Math.round(kaart.getBoundingClientRect().height), onder: Math.round(Math.max(...items.map((e) => e.getBoundingClientRect().bottom))),
          vouw: window.innerHeight - (nav ? nav.getBoundingClientRect().height : 0), over: document.documentElement.scrollWidth > window.innerWidth }; });
      console.log(`plan ${vp.width}: kaart ${r.kaart}px, laatste doel ${r.onder} van ${r.vouw}`);
      expect(r.over).toBe(false);
      if (vp.width === 390) expect(r.onder).toBeLessThanOrEqual(r.vouw);
    });
  }
});

/* v368 (keuze van de gebruiker): een uitschieter is (minstens EUR 10 EN 25 procent) OF minstens EUR 50 verwachte
   afwijking, in uitschieterAfw(), de ENE toets voor Inzichten, de bridge en de zin. */
const Z = require('./deze-maand-stand');
test.describe('e · de drempel van v368: of minstens EUR 50', () => {
  test('Boodschappen +61 op EUR 500 is een uitschieter: los in de bridge, in de zin en op Inzichten', async ({ page }) => {
    await Z.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), b = V.potjes.find((x) => x.k === 'boodschappen'), Br = dezeMaandBrug(V);
      return { over: Math.round(b.overR), bud: b.bud, uit: uitschieters(V).map((x) => x.k), los: Br.los.map((x) => x.k), zin: dezeMaandZin(Br),
        ins: insUitschieters(insKeuzeData(thisYM())).map((x) => x.k) }; });
    expect(r.over).toBe(61);                          // invoer: EUR 61 erboven
    expect(r.over).toBeLessThan(r.bud * 0.25);        // invoer: onder de 25 procent, dus alleen de EUR 50 draagt hem
    expect(r.uit).toContain('boodschappen');
    expect(r.los).toContain('boodschappen');
    expect(r.zin).toContain('Boodschappen');
    expect(r.ins).toContain('boodschappen');
  });
  test('Vices +8 op EUR 20 is geen uitschieter: onder de EUR 10 en onder de EUR 50', async ({ page }) => {
    await I.boot(page);
    const r = await page.evaluate(() => ({ vices: potjeUitschieter({ overR: 8, bud: 20 }), bood: potjeUitschieter({ overR: 61, bud: 500 }),
      rand: [potjeUitschieter({ overR: 49, bud: 500 }), potjeUitschieter({ overR: 50, bud: 500 })] }));
    expect(r.vices).toBe(false);
    expect(r.bood).toBe(true);
    expect(r.rand).toEqual([false, true]);
  });
  test('tegen vorige maanden leest dezelfde toets, op de absolute afwijking', async ({ page }) => {
    await I.boot(page);
    const r = await page.evaluate(() => insVorigeTop({ rows: [{ k: 'a', naam: 'A', uit: 340, normaal: 400 }, { k: 'b', naam: 'B', uit: 470, normaal: 400 },
      { k: 'c', naam: 'C', uit: 430, normaal: 400 }] }).map((x) => x.k));
    expect(r).toEqual(['b', 'a']);   // -60 haalt de EUR 50, +70 ook, +30 niet (en 30 is onder 25 procent van 400)
  });
});
