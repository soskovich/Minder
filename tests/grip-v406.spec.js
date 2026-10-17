/* v406: LET OP, DE BRUG EN DE LABELS OP GRIP (bevindingen op het toestel). Op grip-v406-stand (10 oktober 2026). */
/* v428: Let op bestaat niet meer; de handelingen staan in Kiezen onder Te kiezen (#gripTeKiezen, met data-letop), dus Grip
   opent hier op Kiezen. Alleen de plek is veranderd. */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v406-stand');

const letop = page => page.evaluate(() => gripLetOpItems([], [], []).map(x => ({ soort: x.soort, naam: x.naam, sub: x.sub, act: x.act, groep: x.groep || '', bedrag: x.bedrag, pijl: !x.geenPijl })));
const extra = (page, rij) => page.evaluate(({ MAIN, rij }) => { for (const [d, a, n, cat] of rij) { const t = { id: 'x6' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: 'BEA, BETAALPAS ' + n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; } save(); render(); }, { MAIN: S.MAIN, rij });

test.describe('A1 · een regel per potje dat vaker boven budget eindigt', () => {
  test('Vices: n van 3 mnd boven budget, met de bedragen en het budget, neutraal', async ({ page }) => {
    await S.boot(page); const L = await letop(page);
    /* v408: Vices zit als signaal in een patroon in Begrijpen, dus Let op draagt een verwijzing en geen eigen herzien. De
       regel zelf (n van 3, de maanden met naam, het budget) staat in grip-v408.spec.js op een potje zonder patroon. */
    const x = await page.evaluate(() => { const b = potBovenLijst().find(y => y.k === 'vices'); return { n: b.n, t: maandReeksTekst(b.ms, b.bedragen), bud: b.bud }; });
    expect(x).toEqual({ n: 3, t: 'jul €171 · aug €94 · sep €96', bud: 20 });
    const v = L.filter(y => y.naam.startsWith('Vices'));
    expect(v.length).toBe(1); expect(v[0].soort).toBe('patroon'); expect(v[0].act).toMatch(/^gripNaarBegrijpen\('pot:vices'\)$/);
    expect(L.map(x => x.naam + ' ' + x.sub).join('|')).not.toMatch(/te veel/);
  });
  test('"Maanden boven je grens" staat niet meer in Let op', async ({ page }) => {
    await S.boot(page);
    /* v406: scoreNotifs() zet overstreak niet meer neer zodra een potje-regel (potBovenLijst) het verklaart; een bron, dus de
       structurele rijen, Let op en de coach zien hetzelfde. Invoermeting: zonder potje-regel vuurt hij op deze stand wel. */
    const r = await page.evaluate(() => { for (const k of Object.keys(SET.budgets)) SET.budgets[k] = 1; SET.budgetHist = {}; save();   // elke maand boven het maandbudget
      const met = scoreNotifs({ negeerSnooze: true }).some(n => n.key === 'overstreak'), pb = potBovenLijst().length;
      const echt = window.potBovenLijst; window.potBovenLijst = () => []; const zonder = scoreNotifs({ negeerSnooze: true }).find(n => n.key === 'overstreak');
      window.potBovenLijst = echt; return { met, pb, zonder: zonder ? zonder.l1 + ' ' + zonder.l2 : null,
        letop: gripLetOpItems(maandStructureel(), [], []).map(x => x.naam) }; });
    expect(r.pb).toBeGreaterThan(0);
    expect(r.met).toBe(false);
    expect(r.letop).not.toContain('Maanden boven je grens');
    expect(r.zonder).toMatch(/^Boven je maandbudget in de laatste \d+ afgeronde maanden/);   // v407: zonder 'op rij'
    expect(r.zonder).not.toMatch(/te veel/);
  });
  test('2 van 3 telt, 1 van 3 niet (het budget van die maand, maandPotjes)', async ({ page }) => {
    await S.boot(page);
    const n = await page.evaluate(() => { const r = []; SET.budgetHist = {};   // v409: alle drie bewaard, anders telt het huidige budget voor alle drie
      for (const m of ['2026-07', '2026-08', '2026-09']) SET.budgetHist[m] = Object.assign({}, SET.budgets);
      SET.budgetHist['2026-08'] = Object.assign({}, SET.budgets, { vices: 200 }); save(); r.push((potBovenLijst().find(x => x.k === 'vices') || {}).n || 0);
      SET.budgetHist['2026-07'] = Object.assign({}, SET.budgets, { vices: 200 }); save(); r.push((potBovenLijst().find(x => x.k === 'vices') || {}).n || 0); return r; });
    expect(n).toEqual([2, 0]);
  });
  test('potje herzien: geen voorselectie, omhoog vraagt een bron, uit Huur houdt het maandbudget gelijk', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { openPotHerzien('vices'); const sh = document.querySelector('#potHerzienSheet');
      const v = { gekozen: [...sh.querySelectorAll('[data-phoptie]')].filter(e => e.dataset.gekozen === '1').length, uit: document.querySelector('[data-phbevestig]').disabled };
      potHerzienKies('a'); v.bronnen = [...document.querySelectorAll('[data-phbron]')].map(e => e.dataset.phbron); v.uitA = document.querySelector('[data-phbevestig]').disabled;
      const B0 = Math.round(maandVooruit().budget), huur0 = SET.budgets.huur;
      window._ph.bron = 'pot:huur'; renderPotHerzien(); v.gevolg = document.querySelector('[data-phgevolg]').innerText; potHerzienBevestig();
      return Object.assign(v, { vices: SET.budgets.vices, huur: SET.budgets.huur, huur0, B0, B1: Math.round(maandVooruit().budget), rij: gripLetOpItems([], [], []).some(x => x.soort === 'boven' && x.key === 'vices') }); });
    expect(r.gekozen).toBe(0); expect(r.uit).toBe(true); expect(r.uitA).toBe(true);
    expect(r.bronnen).toEqual(['pot:huur', 'pot:vervoer', 'budget']);   // de te ruime potjes die het verschil dragen, en het maandbudget
    expect(r.vices).toBe(125);   // (171 + 94 + 96) / 3 = 120,3, op vijf naar boven
    expect(r.huur).toBe(r.huur0 - 105); expect(r.B1).toBe(r.B0);
    /* v436: het gevolg noemt de forecast van deze maand en het maandbudget vanaf november, en dat budget is gelijk */
    expect(r.gevolg).toMatch(/deze maand: forecast/); expect(r.gevolg).toContain(`maandbudget €${r.B0.toLocaleString('nl-NL')} vanaf november`);
  });
  test('uit het maandbudget: het maandbudget stijgt met het verschil', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const B0 = Math.round(maandVooruit().budget); openPotHerzien('vices'); potHerzienKies('a'); window._ph.bron = 'budget'; renderPotHerzien(); potHerzienBevestig();
      const V = maandVooruit(); return { B0, B1: Math.round(V.budget), nu: Math.round(V.budgetNu) }; });
    /* v436: het vastgelegde maandbudget van deze maand blijft; het budget van nu (en dus dat van volgende maand) stijgt */
    expect(r.B1).toBe(r.B0); expect(r.nu - r.B0).toBe(105);
  });
  test('lager: een bestemming is verplicht; laten staan haalt de regel deze maand weg', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { openPotHerzien('vices'); potHerzienKies('b'); window._ph.bedrag = 10; renderPotHerzien();
      const v = { waarheen: !!document.querySelector('[data-phwaarheen]'), uit: document.querySelector('[data-phbevestig]').disabled };
      potHerzienKies('c'); v.knop = document.querySelector('[data-phbevestig]').innerText; potHerzienBevestig();
      v.rij = gripLetOpItems([], [], []).some(x => x.key === 'vices'); return v; });   // v408: laten staan geldt voor elk signaal van Vices
    expect(r).toEqual({ waarheen: true, uit: true, knop: 'Vices laten staan', rij: false });
  });
});

test.describe('A2/A3 · volgorde en eenmalig', () => {
  test('eerst actie met bewijs, dan alleen bewijs, binnen een groep het grootste bedrag eerst', async ({ page }) => {
    await S.boot(page);
    /* v408: Vices staat als verwijzing naar zijn patroon (geen groep a meer), dus Overig gaat in juli en augustus boven zijn
       budget, zodat er weer twee regels met een actie zijn om te ordenen */
    await extra(page, [['2026-07-25', -220, 'Hema Winkel', 'overig'], ['2026-08-25', -220, 'Hema Winkel', 'overig']]);
    const L = await letop(page);
    const g = L.filter(x => x.groep).map(x => x.groep);
    expect(g).toEqual([...g].sort());   // alle a voor alle b
    expect(L.findIndex(x => !x.groep)).toBeGreaterThan(L.map(x => !!x.groep).lastIndexOf(true));   // de rest erna
    for (const grp of ['a', 'b']) { const b = L.filter(x => x.groep === grp).map(x => x.bedrag); expect(b).toEqual([...b].sort((p, q) => q - p)); }
    expect(L.filter(x => x.groep === 'a').length).toBeGreaterThanOrEqual(2);   // invoermeting: er valt iets te ordenen
  });
  test('Zorg & apotheek €159 eenmalig: de regel blijft, met "eenmalig · categorie klopt? ›" en zonder losse pijl', async ({ page }) => {
    await S.boot(page);
    const z = (await letop(page)).find(x => x.soort === 'eenmalig');
    expect(z).toEqual({ soort: 'eenmalig', naam: 'Zorg & apotheek €159 zonder potje · 0 van 3 mnd', sub: 'eenmalig · categorie klopt? ›', act: "openEenmalig('zorg')", groep: 'b', bedrag: 159, pijl: false });   // v415: de eenmalig-sheet (met "Klopt, eenmalig"); het gesprek staat daarin als het lek over dezelfde categorie gaat
    /* het lek gaat hier over dezelfde categorie en heeft geen eigen partij-regel: de tik opent zijn sheet (categorie wijzigen,
       potje maken, het gesprek), zodat de ingang naar de coach blijft (v359) */
    expect(await page.evaluate(() => (lekSignaal(thisYM(), budgetFlaggedCats(thisYM())) || {}).cat)).toBe('zorg');
    const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); gripKiesTab('kiezen'); renderMaand(); const L = document.querySelector('#gripTeKiezen');
      if (L.querySelector('[data-letopnog]')) gripKiesTab('kiezen'); const rij = [...document.querySelectorAll('[data-letop="eenmalig"]')][0]; return rij ? rij.innerText : ''; });
    expect(r.split('›').length - 1).toBe(1);   // alleen de › in "categorie klopt? ›", geen losse pijl
  });
  /* v428: Let op is geen kaart meer en heeft geen maximum; Te kiezen toont elke handeling, in de volgorde van Let op */
  test('Te kiezen toont elke handeling uit Let op, zonder "nog n", in de volgorde van Let op', async ({ page }) => {
    await S.boot(page); const L = await letop(page);
    const r = await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); const K = document.querySelector('#gripTeKiezen');
      return { nog: document.querySelectorAll('[data-letopnog]').length, eerste: [...K.querySelectorAll('[data-letop]')].map(e => e.dataset.letop),
        kies: gripCyc().kies.filter(k => k.bron === 'letop' && k.x).map(k => k.x.soort) }; });
    expect(r.nog).toBe(0); expect(r.eerste.length).toBeGreaterThanOrEqual(2); expect(r.eerste).toEqual(r.kies);
    expect(r.eerste).toEqual(L.map(x => x.soort).filter(s => r.eerste.includes(s)));
  });
});

test.describe('B · potje maken met bewijs, piek naar een reservering in Plan', () => {
  test('een categorie die er elke maand is: potje maken met het voorstel en de drie maanden', async ({ page }) => {
    await S.boot(page);
    await extra(page, [['2026-07-09', -30, 'Stichting Een', 'goededoel'], ['2026-08-09', -30, 'Stichting Een', 'goededoel'], ['2026-09-09', -36, 'Stichting Een', 'goededoel'], ['2026-10-09', -30, 'Stichting Een', 'goededoel']]);
    const g = (await letop(page)).find(x => x.soort === 'zonderpot' && x.naam.startsWith('Goede'));
    expect(g.sub).toBe('potje maken · voorstel €32 per maand · jul €30 · aug €30 · sep €36');
    expect(g.act).toBe("openZonderKeuze('goededoel')");   // v415: de keuze met "geen potje nodig"
  });
  test('Vakantie (2 van 3 mnd): eerst een reservering in Plan, jaarbedrag gedeeld door 12', async ({ page }) => {
    await S.boot(page);
    const v = (await letop(page)).find(x => x.soort === 'zonderpot' && x.naam.startsWith('Vakantie'));
    expect(v).toEqual(expect.objectContaining({ naam: 'Vakantie & reizen zonder potje · 2 van 3 mnd', sub: 'reservering in Plan €33/mnd of potje maken · jul €0 · aug €40 · sep €350', act: "openZonderKeuze('vakantie')" }));
  });
  test('een maand met meer dan 60%: ook een piek', async ({ page }) => {
    await S.boot(page);
    await extra(page, [['2026-07-09', -30, 'Fietsenmaker', 'goededoel'], ['2026-08-09', -30, 'Fietsenmaker', 'goededoel'], ['2026-09-09', -300, 'Fietsenmaker', 'goededoel']]);
    const g = (await letop(page)).find(x => x.soort === 'zonderpot' && x.naam.startsWith('Goede'));
    expect(g.act).toBe("openZonderKeuze('goededoel')");
  });
  test('de keuze: geen voorselectie, reservering in Plan schrijft een inleg en de regel verdwijnt', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { openZonderKeuze('vakantie'); const sh = document.querySelector('#zonderKeuzeSheet');
      const v = { opties: [...sh.querySelectorAll('[data-zkoptie]')].map(e => e.dataset.zkoptie), gekozen: [...sh.querySelectorAll('[data-zkoptie]')].filter(e => e.dataset.gekozen === '1').length, uit: sh.querySelector('[data-zkbevestig]').disabled };
      window._zk.optie = 'res'; renderZonderKeuze(); zonderKeuzeZet();
      return Object.assign(v, { res: SET.planInleg.res.bedrag, van: SET.planInleg.res.van, rij: gripLetOpItems([], [], []).some(x => x.key === 'vakantie') }); });
    expect(r.opties).toEqual(['res', 'pot', 'nee']);   // v415: derde keuze "geen potje nodig" expect(r.gekozen).toBe(0); expect(r.uit).toBe(true);
    expect(r.res).toBe(33); expect(r.van).toContain('vakantie'); expect(r.rij).toBe(false);
  });
  test('potje maken vanuit de keuze opent het formulier met het voorstel', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { openZonderKeuze('vakantie'); window._zk.optie = 'pot'; zonderKeuzeZet(); return document.querySelector('#potFormBedrag').value; });
    expect(r).toBe('130');   // (0 + 40 + 350) / 3
  });
});

const brug = page => page.evaluate(() => { const V = maandVooruit(), Br = gripZienBrug(V);
  return { st: Br.stappen.map(s => ({ soort: s.soort, k: s.k || '', label: s.label, label2: s.label2 || '', w: s.waarde })), P: Math.round(V.projectie), U: uitschieters(V).map(x => x.k), tweekleur: Br.tweekleur }; });
test.describe('C · de brug op Zien', () => {
  test('Boodschappen (+€69 verwacht) is een eigen stap, budget plus stappen is verwacht, en overig mengt niet', async ({ page }) => {
    await S.boot(page); const B = await brug(page);
    expect(B.U).toEqual(['vices', 'boodschappen']);   // invoermeting
    expect(B.st.filter(s => s.soort === 'potje').map(s => s.k)).toEqual(['vices', 'boodschappen']);
    expect(B.st.slice(0, -1).reduce((a, s) => a + s.w, 0)).toBe(B.P);
    const ov = B.st.filter(s => s.soort === 'overig');
    for (const s of ov) expect(s.k === 'boven' ? s.w >= 0 : s.w <= 0).toBe(true);
    expect(B.st.length).toBeLessThanOrEqual(7);
  });
  test('met drie uitschieters en te weinig kolommen gaat de kleinste naar overig boven, nooit naar onder', async ({ page }) => {
    await S.boot(page); await page.evaluate(() => { SET.budgets.uiteten = 55; save(); });
    const B = await brug(page);
    expect(B.U.length).toBe(3);   // invoermeting
    expect(B.st.length).toBeLessThanOrEqual(7);
    expect(B.st.filter(s => s.soort === 'potje').map(s => s.k)).toEqual(B.U.slice(0, B.st.filter(s => s.soort === 'potje').length));
    const ovB = B.st.find(s => s.soort === 'overig' && s.k === 'boven'), ovO = B.st.find(s => s.soort === 'overig' && s.k === 'onder');
    expect(ovB && ovB.w).toBeGreaterThan(0); expect(ovO.w).toBeLessThan(0);
    expect(B.st.slice(0, -1).reduce((a, s) => a + s.w, 0)).toBe(B.P);
  });
  test('labels: te ruim met naam en "niet gebruikt" of "n potjes", korte vaste namen, geen afgekapte tekst, uitleg bij twee kleuren', async ({ page }) => {
    await S.boot(page); const B = await brug(page);
    const tr = B.st.filter(s => s.soort === 'teruim');
    expect(tr.map(s => [s.label, s.label2])).toEqual([['2 potjes', 'niet gebruikt']]);
    /* v428: de brug op Grip is de groepbrug in Begrijpen; te ruim staat in de sheet per groep. De labels blijven kort en vast. */
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    const r = await page.evaluate(() => ({ af: [...document.querySelectorAll('#gripGroepBrug [data-brugeen], #gripGroepBrug [data-brugeen2]')].filter(e => e.scrollWidth > e.clientWidth + 1)   /* v410: een label buiten BRUG_KORT staat op een regel met ellipsis-stijl; afgekapt is het pas als de tekst er niet in past */.map(e => e.innerText),
      labels: [...document.querySelectorAll('#gripGroepBrug [data-brugeen]')].map(e => e.innerText.replace(/­|\n/g, '')), licht: (document.querySelector('[data-zienlicht]') || {}).innerText }));
    expect(r.af).toEqual([]);
    expect(r.labels).toEqual(['budget', 'vast', 'Vices', 'Boodschappen', expect.stringMatching(/^\d+ onder$/), 'z. potje', 'verwacht']);   // v408: "n onder", nooit "overig"
    expect(B.tweekleur).toBe(true); expect(r.licht).toBe('licht = nog verwacht');
  });
  test('een te ruim potje alleen: zijn naam en "niet gebruikt"', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); const TR = teRuim(V); const Br = gripZienBrug(V, TR.slice(0, 1)); return { k: TR[0].k, st: Br.stappen.filter(s => s.soort === 'teruim').map(s => [s.label, s.label2]) }; });
    expect(r.st).toEqual([[r.k === 'huur' ? 'Huur' : 'Vervoer', 'niet gebruikt']]);
  });
  test('Begrijpen past op 390x844 boven de menubalk, met Boodschappen als eigen stap (v428)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await S.boot(page);
    const r = await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); return { kol: document.querySelectorAll('#gripGroepBrug [data-brugstap]').length, bood: !!document.querySelector('#gripGroepBrug [data-brugstap="potje"][data-brugk="boodschappen"]'),
      breed: [...document.querySelectorAll('#gripGroepBrug [data-brugstap]')].map(e => e.getBoundingClientRect().width), knop: document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav: document.querySelector('.nav').getBoundingClientRect().top, sw: document.documentElement.scrollWidth }; });
    console.log(`zien 390: ${r.kol} kolommen, knop ${Math.round(r.knop)}px, menubalk ${Math.round(r.nav)}px`);
    expect(r.bood).toBe(true); expect(r.kol).toBeLessThanOrEqual(7);
    for (const b of r.breed) expect(b).toBeGreaterThanOrEqual(40);
    expect(r.knop).toBeLessThanOrEqual(r.nav - 16); expect(r.sw).toBeLessThanOrEqual(390);
  });
});

test('D · de regel onder de meters begint met "Doelen:", en de feitregel van Budget blijft de eerste', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); gripKiesTab('kiezen'); const n = document.querySelector('[data-meternuverwacht]'), f = document.querySelector('[data-nietgebruikt]');
    return { tekst: n.innerText, volgorde: f ? !!(f.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) : null }; });
  expect(r.tekst).toMatch(/^Doelen: nu netto /); expect(r.volgorde).toBe(true);
});

/* Vijf gevallen die de eerste sabotage-ronde niet droeg (meetles a): twee gelijke maanden (de piek op 2 van 3, niet op 60%),
   vier uitschieters los, een afrondingseuro bij een bijna lege overig-stap, een lange categorienaam los, en een te ruim
   potje alleen in de samengevoegde vorm. */
test('B5b · 2 van 3 maanden met gelijke bedragen is ook een piek', async ({ page }) => {
  await S.boot(page);
  await extra(page, [['2026-08-09', -100, 'Stichting Twee', 'goededoel'], ['2026-09-09', -100, 'Stichting Twee', 'goededoel']]);
  const r = await page.evaluate(() => { const x = zonderPotjeStand(thisYM()).rijen.find(y => y.k === 'goededoel'); return { n: x.n, max: Math.max(...x.bedragen) / x.bedragen.reduce((a, v) => a + v, 0) }; });
  expect(r.n).toBe(2); expect(r.max).toBeLessThanOrEqual(0.6);   // invoermeting: alleen de 2-van-3-regel kan hier vuren
  const g = (await letop(page)).find(x => x.soort === 'zonderpot' && x.naam.startsWith('Goede'));
  expect(g.act).toBe("openZonderKeuze('goededoel')");
});
/* Een brug zonder stap zonder potje en zonder te ruim, zodat vier uitschieters in zeven kolommen passen. */
const brugZonder = (page, TRn) => page.evaluate(TRn => { const V0 = maandVooruit(), Z = V0.zonderStand;
  const V = Object.assign({}, V0, { zonder: 0, zonderExact: 0, projectie: V0.projectie - V0.zonderExact, zonderStand: Object.assign({}, Z, { geboekt: 0, verwacht: 0 }) });
  const TR = teRuim(V0).slice(0, TRn); const Br = gripZienBrug(V, TR);
  return { U: uitschieters(V).map(x => x.k), st: Br.stappen.map(s => ({ soort: s.soort, k: s.k || '', label: s.label, label2: s.label2 || '', w: s.waarde })), P: Math.round(V.projectie) }; }, TRn);
test('C6b · vier uitschieters staan alle vier los als ze passen, met korte namen', async ({ page }) => {
  await S.boot(page); await page.evaluate(() => { SET.budgets.uiteten = 55; save(); });
  await extra(page, [['2026-10-08', -320, 'Hema Winkel', 'overig']]);
  const B = await brugZonder(page, 0);
  expect(B.U.length).toBe(4); expect(B.st.length).toBeLessThanOrEqual(7);   // invoermeting
  expect(B.st.filter(s => s.soort === 'potje').map(s => s.k)).toEqual(B.U);
  expect(B.st.find(s => s.k === 'uiteten').label).toBe('Uit eten');   // korte vaste naam, niet "Uit eten & café"
  expect(B.st.slice(0, -1).reduce((a, s) => a + s.w, 0)).toBe(B.P);
});
test('C6c · een afrondingseuro draait het teken van een overig-stap nooit om', async ({ page }) => {
  await S.boot(page);
  let gezien = 0;
  /* een raster: een potje net boven (c), en een uitkomst die een fractie lager of hoger ligt dan de som (d), zodat de
     afronding soms een euro moet weghalen en die bij het kleine positieve deel kan landen */
  const r = await page.evaluate(() => { const V0 = maandVooruit(), TR = teRuim(V0), uit = [];
    for (const c of [0.01, 0.05, 0.2, 0.45]) for (const d of [-0.9, -0.7, -0.49, -0.3, -0.1, 0.1, 0.3, 0.49]) {
      const V = Object.assign({}, V0, { projectie: V0.projectie + c + d, potjes: V0.potjes.map(x => Object.assign({}, x, { overR: x.overR > 0 && !potjeUitschieter(x) ? 0 : x.overR })).concat([{ k: 'x_test', naam: 'Test', bud: 10, overR: c, eindR: 10 + c, eind: 10, uit: 10 }]),
        vastePotjes: (V0.vastePotjes || []).map(x => Object.assign({}, x, { eindR: Math.min(+x.eindR || +x.eind || 0, +x.bud || 0), eind: Math.min(+x.eind || 0, +x.bud || 0) })) });
      const Br = gripZienBrug(V, TR); uit.push(...Br.stappen.filter(s => s.soort === 'overig').map(s => [s.k, s.waarde]));
      const som = Br.stappen.slice(0, -1).reduce((a, s) => a + s.waarde, 0); if (som !== Br.stappen[Br.stappen.length - 1].waarde) uit.push(['som', 1]); }
    return uit; });
  for (const [k, w] of r) { if (k === 'boven') expect(w).toBeGreaterThanOrEqual(0); else if (k === 'onder') expect(w).toBeLessThanOrEqual(0); else expect(k).toBe('geen som-fout'); }
  gezien = r.length;
  expect(gezien).toBeGreaterThan(0);
});
test('C7b · een te ruim potje alleen houdt zijn naam, ook als de te ruime potjes samengaan', async ({ page }) => {
  await S.boot(page); await page.evaluate(() => { SET.budgets.uiteten = 55; save(); });
  const r = await page.evaluate(() => { const V = maandVooruit(), TR = teRuim(V).slice(0, 1), Br = gripZienBrug(V, TR);
    return { k: TR[0].k, st: Br.stappen.filter(s => s.soort === 'teruim').map(s => [s.label, s.label2, s.k]) }; });
  expect(r.st).toEqual([[r.k === 'huur' ? 'Huur' : 'Vervoer', 'niet gebruikt', r.k]]);
});
test('C6d · de guard: een afrondingseuro die het teken omdraait schuift naar de andere kant', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => [brugTekenVast({ '~ovB': -1, '~ovO': -40 }), brugTekenVast({ '~ovB': 12, '~ovO': 1 }), brugTekenVast({ '~ovB': 3, '~ovO': -2 })]);
  expect(r).toEqual([{ '~ovB': 0, '~ovO': -41 }, { '~ovB': 13, '~ovO': 0 }, { '~ovB': 3, '~ovO': -2 }]);
  const src = await page.evaluate(() => gripZienBrug.toString());
  expect(src).toContain('brugTekenVast(R)');
});
