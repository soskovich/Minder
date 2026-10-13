/* v406: LET OP, DE BRUG EN DE LABELS OP GRIP (bevindingen op het toestel). Op grip-v406-stand (10 oktober 2026). */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v406-stand');

const letop = page => page.evaluate(() => gripLetOpItems([], [], []).map(x => ({ soort: x.soort, naam: x.naam, sub: x.sub, act: x.act, groep: x.groep || '', bedrag: x.bedrag, pijl: !x.geenPijl })));
const extra = (page, rij) => page.evaluate(({ MAIN, rij }) => { for (const [d, a, n, cat] of rij) { const t = { id: 'x6' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: 'BEA, BETAALPAS ' + n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; } save(); render(); }, { MAIN: S.MAIN, rij });

test.describe('A1 · een regel per potje dat vaker boven budget eindigt', () => {
  test('Vices: n van 3 mnd boven budget, met de bedragen en het budget, neutraal', async ({ page }) => {
    await S.boot(page); const L = await letop(page);
    const v = L.find(x => x.soort === 'boven' && x.naam.startsWith('Vices'));
    expect(v).toEqual(expect.objectContaining({ naam: 'Vices · 3 van 3 mnd boven budget', sub: '€171 · €94 · €96 · budget €20', act: "openPotHerzien('vices')", groep: 'a' }));
    expect(L.map(x => x.naam + ' ' + x.sub).join('|')).not.toMatch(/te veel/);
  });
  test('"Maanden boven je grens" staat niet meer in Let op', async ({ page }) => {
    await S.boot(page);
    const L = await page.evaluate(() => gripLetOpItems([{ structureel: true, key: 'overstreak', naam: 'Maanden boven je grens', status: 'let op' }], [], []).map(x => x.naam));
    expect(L).not.toContain('Maanden boven je grens');
  });
  test('2 van 3 telt, 1 van 3 niet (het budget van die maand, maandPotjes)', async ({ page }) => {
    await S.boot(page);
    const n = await page.evaluate(() => { const r = []; SET.budgetHist = SET.budgetHist || {};
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
    expect(r.gevolg).toContain('Maandbudget'); expect(r.gevolg).toContain('blijft');
  });
  test('uit het maandbudget: het maandbudget stijgt met het verschil', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const B0 = Math.round(maandVooruit().budget); openPotHerzien('vices'); potHerzienKies('a'); window._ph.bron = 'budget'; renderPotHerzien(); potHerzienBevestig(); return { B0, B1: Math.round(maandVooruit().budget) }; });
    expect(r.B1 - r.B0).toBe(105);
  });
  test('lager: een bestemming is verplicht; laten staan haalt de regel deze maand weg', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { openPotHerzien('vices'); potHerzienKies('b'); window._ph.bedrag = 10; renderPotHerzien();
      const v = { waarheen: !!document.querySelector('[data-phwaarheen]'), uit: document.querySelector('[data-phbevestig]').disabled };
      potHerzienKies('c'); v.knop = document.querySelector('[data-phbevestig]').innerText; potHerzienBevestig();
      v.rij = gripLetOpItems([], [], []).some(x => x.soort === 'boven' && x.key === 'vices'); return v; });
    expect(r).toEqual({ waarheen: true, uit: true, knop: 'Vices laten staan', rij: false });
  });
});

test.describe('A2/A3 · volgorde en eenmalig', () => {
  test('eerst actie met bewijs, dan alleen bewijs, binnen een groep het grootste bedrag eerst', async ({ page }) => {
    await S.boot(page); const L = await letop(page);
    const g = L.filter(x => x.groep).map(x => x.groep);
    expect(g).toEqual([...g].sort());   // alle a voor alle b
    expect(L.findIndex(x => !x.groep)).toBeGreaterThan(L.map(x => !!x.groep).lastIndexOf(true));   // de rest erna
    for (const grp of ['a', 'b']) { const b = L.filter(x => x.groep === grp).map(x => x.bedrag); expect(b).toEqual([...b].sort((p, q) => q - p)); }
    expect(L.filter(x => x.groep === 'a').length).toBeGreaterThanOrEqual(2);   // invoermeting: er valt iets te ordenen
  });
  test('Zorg & apotheek €159 eenmalig: de regel blijft, met "eenmalig · categorie klopt? ›" en zonder losse pijl', async ({ page }) => {
    await S.boot(page);
    const z = (await letop(page)).find(x => x.soort === 'eenmalig');
    expect(z).toEqual({ soort: 'eenmalig', naam: 'Zorg & apotheek €159 zonder potje · 0 van 3 mnd', sub: 'eenmalig · categorie klopt? ›', act: "openCategory('zorg','2026-10')", groep: 'b', bedrag: 159, pijl: false });
    const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); renderMaand(); const L = document.querySelector('#gripLetOp');
      if (L.querySelector('[data-letopnog]')) openGripLetOpLijst(); const rij = [...document.querySelectorAll('[data-letop="eenmalig"]')][0]; return rij ? rij.innerText : ''; });
    expect(r.split('›').length - 1).toBe(1);   // alleen de › in "categorie klopt? ›", geen losse pijl
  });
  test('Let op toont er twee en de rest achter "nog n"', async ({ page }) => {
    await S.boot(page); const L = await letop(page);
    const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); renderMaand(); const K = document.querySelector('#gripLetOp'); return { n: K.querySelectorAll('[data-letop]').length, nog: +(K.querySelector('[data-letopnog]') || { dataset: { letopnog: 0 } }).dataset.letopnog, eerste: [...K.querySelectorAll('[data-letop]')].map(e => e.dataset.letop) }; });
    expect(r.n).toBe(2); expect(r.nog).toBe(L.length - 2); expect(r.eerste).toEqual(L.slice(0, 2).map(x => x.soort));
  });
});

test.describe('B · potje maken met bewijs, piek naar een reservering in Plan', () => {
  test('een categorie die er elke maand is: potje maken met het voorstel en de drie maanden', async ({ page }) => {
    await S.boot(page);
    await extra(page, [['2026-07-09', -30, 'Stichting Een', 'goededoel'], ['2026-08-09', -30, 'Stichting Een', 'goededoel'], ['2026-09-09', -36, 'Stichting Een', 'goededoel'], ['2026-10-09', -30, 'Stichting Een', 'goededoel']]);
    const g = (await letop(page)).find(x => x.soort === 'zonderpot' && x.naam.startsWith('Goede'));
    expect(g.sub).toBe('potje maken · voorstel €32 per maand · jul €30 · aug €30 · sep €36');
    expect(g.act).toBe("openPotForm('goededoel',32)");
  });
  test('Vakantie (2 van 3 mnd): eerst een reservering in Plan, jaarbedrag gedeeld door 12', async ({ page }) => {
    await S.boot(page);
    const v = (await letop(page)).find(x => x.soort === 'zonderpot' && x.naam.startsWith('Vakantie'));
    expect(v).toEqual(expect.objectContaining({ naam: 'Vakantie & reizen zonder potje · 2 van 3 mnd', sub: 'reservering in Plan €33/mnd of potje maken · jul €0 · aug €40 · sep €350', act: "openZonderKeuze('vakantie')" }));
  });
  test('een maand met meer dan 60%: ook een piek', async ({ page }) => {
    await S.boot(page);
    await extra(page, [['2026-07-09', -10, 'Fietsenmaker', 'goededoel'], ['2026-08-09', -10, 'Fietsenmaker', 'goededoel'], ['2026-09-09', -200, 'Fietsenmaker', 'goededoel']]);
    const g = (await letop(page)).find(x => x.soort === 'zonderpot' && x.naam.startsWith('Goede'));
    expect(g.act).toBe("openZonderKeuze('goededoel')");
  });
  test('de keuze: geen voorselectie, reservering in Plan schrijft een inleg en de regel verdwijnt', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { openZonderKeuze('vakantie'); const sh = document.querySelector('#zonderKeuzeSheet');
      const v = { opties: [...sh.querySelectorAll('[data-zkoptie]')].map(e => e.dataset.zkoptie), gekozen: [...sh.querySelectorAll('[data-zkoptie]')].filter(e => e.dataset.gekozen === '1').length, uit: sh.querySelector('[data-zkbevestig]').disabled };
      window._zk.optie = 'res'; renderZonderKeuze(); zonderKeuzeZet();
      return Object.assign(v, { res: SET.planInleg.res.bedrag, van: SET.planInleg.res.van, rij: gripLetOpItems([], [], []).some(x => x.key === 'vakantie') }); });
    expect(r.opties).toEqual(['res', 'pot']); expect(r.gekozen).toBe(0); expect(r.uit).toBe(true);
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
    await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); });
    const r = await page.evaluate(() => ({ af: [...document.querySelectorAll('#gripBrug [data-brugeen], #gripBrug [data-brugeen2]')].filter(e => e.scrollWidth > e.clientWidth + 1 || getComputedStyle(e).textOverflow === 'ellipsis').map(e => e.innerText),
      labels: [...document.querySelectorAll('#gripBrug [data-brugeen]')].map(e => e.innerText.replace(/­|\n/g, '')), licht: (document.querySelector('[data-zienlicht]') || {}).innerText }));
    expect(r.af).toEqual([]);
    expect(r.labels).toEqual(['budget', 'Vices', 'Boodschappen', 'z. potje', '2 potjes', 'overig', 'verwacht']);
    expect(B.tweekleur).toBe(true); expect(r.licht).toBe('licht = nog verwacht');
  });
  test('een te ruim potje alleen: zijn naam en "niet gebruikt"', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); const TR = teRuim(V); const Br = gripZienBrug(V, TR.slice(0, 1)); return { k: TR[0].k, st: Br.stappen.filter(s => s.soort === 'teruim').map(s => [s.label, s.label2]) }; });
    expect(r.st).toEqual([[r.k === 'huur' ? 'Huur' : 'Vervoer', 'niet gebruikt']]);
  });
  test('Zien past op 390x844 boven de menubalk, met Boodschappen als eigen stap', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await S.boot(page);
    const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); return { kol: document.querySelectorAll('#gripBrug [data-brugstap]').length, bood: !!document.querySelector('#gripBrug [data-brugstap="potje"] [title="Boodschappen"]'),
      breed: [...document.querySelectorAll('#gripBrug [data-brugstap]')].map(e => e.getBoundingClientRect().width), knop: document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav: document.querySelector('.nav').getBoundingClientRect().top, sw: document.documentElement.scrollWidth }; });
    console.log(`zien 390: ${r.kol} kolommen, knop ${Math.round(r.knop)}px, menubalk ${Math.round(r.nav)}px`);
    expect(r.bood).toBe(true); expect(r.kol).toBeLessThanOrEqual(7);
    for (const b of r.breed) expect(b).toBeGreaterThanOrEqual(40);
    expect(r.knop).toBeLessThanOrEqual(r.nav); expect(r.sw).toBeLessThanOrEqual(390);
  });
});

test('D · de regel onder de meters begint met "Doelen:", en de feitregel van Budget blijft de eerste', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); const n = document.querySelector('[data-meternuverwacht]'), f = document.querySelector('[data-nietgebruikt]');
    return { tekst: n.innerText, volgorde: f ? !!(f.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING) : null }; });
  expect(r.tekst).toMatch(/^Doelen: nu netto /); expect(r.volgorde).toBe(true);
});
