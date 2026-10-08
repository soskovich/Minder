/* v357: DE VASTE LASTEN STAAN WEER IN DE BRIDGE, EN GRIP EN INZICHTEN NOEMEN WAARUIT HET BEDRAG BESTAAT
   (gevraagd door de gebruiker). De bridge op Grip loopt van het hele budget via de potjes die boven eindigen, de
   ruimte in de andere potjes, EEN stap vaste lasten en wat er zonder potje uitgaat naar de uitkomst van de maand.
   Een tik op de stap vaste lasten opent de sheet vaste lasten; de regel onder de bridge is vervallen.
   De sheet vaste lasten en de post "Nog te betalen · vast" op Inzichten lezen dezelfde bron (vasteLastenStand()).
   Fixtures: tests/deze-maand-stand.js (de stand van 6 oktober) en tests/vast-variabel-stand.js (het toestel, met
   Huur EUR 750 zonder betaling). */
const { test, expect } = require('@playwright/test');
const Zes = require('./deze-maand-stand');
const Toe = require('./vast-variabel-stand');
const { kaalUit } = require('./bron-kaal');

const grip = (page) => page.evaluate(() => { closeSheet(); go('maand'); });
const tik = async (page, sel) => { await page.waitForTimeout(350); await page.click(sel); await page.waitForTimeout(150); };
const vastPost = (page) => page.evaluate(() => { const p = nogDezeMaandPosten().find((x) => /Nog te betalen · vast/.test(x.lab));
  return p ? { val: p.val, sub: p.sub } : null; });
const uitleg = (page) => page.evaluate(() => { openGripVast(); return document.querySelector('#gripVast [data-vastuitleg]').innerText; });

test.describe('a. de bridge loopt van het budget naar de uitkomst, met de vaste lasten als EEN stap', () => {
  test('de stappen van 6 oktober tellen exact op, en elke stap komt uit maandVooruit()', async ({ page }) => {
    await Zes.boot(page); await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
      return { st: Br.stappen.map((s) => [s.soort, s.label, s.waarde]), budget: V.budget, proj: V.projectie,
        vast: Math.round(V.vaste.eind - V.vaste.budget), varDiff: Math.round(V.variabel.eind - V.variabel.budget) }; });
    expect(r.st).toEqual([
      ['begin', 'budget', 3375], ['potje', 'Vices', 83], ['potje', 'Boodschappen', 61], ['rest', 'ruimte', -1122],
      ['vast', 'vaste lasten', 0], ['zonder', 'zonder potje', 275], ['eind', 'okt', 2672]]);
    expect(r.st[0][2]).toBe(r.budget);
    expect(r.st[r.st.length - 1][2]).toBe(r.proj);
    expect(r.st.slice(1, -1).reduce((a, s) => a + s[2], r.st[0][2])).toBe(r.proj);
    expect(r.st.find((s) => s[0] === 'vast')[2]).toBe(r.vast);
    // de potjes en de ruimte samen zijn de variabele afwijking: de vaste lasten zitten er niet nog eens in
    expect(83 + 61 - 1122).toBe(r.varDiff);
  });
  test('de kop is de uitkomst tegen het budget, en de regel vaste lasten is weg', async ({ page }) => {
    await Zes.boot(page); await grip(page);
    const r = await page.evaluate(() => ({ kop: document.querySelector('#gripDezeMaand [data-dmregel]').innerText.replace(/\s+/g, ' '),
      regel: document.querySelectorAll('[data-vastregel],[data-vastgrootste],[data-variabel]').length }));
    expect(r.kop).toMatch(/^€2\.672 verwacht · €703 onder je budget/);
    expect(r.regel).toBe(0);
    const bron = await kaalUit(page, 'dezeMaandKaart');
    expect(bron).not.toContain('gripVastRegel');
    expect(await page.evaluate(() => typeof window.gripVastRegel)).toBe('undefined');
  });
  test('een vast potje zonder betaling telt met zijn bedrag, dus de stap blijft nul en de zin noemt het', async ({ page }) => {
    await Toe.boot(page, { set: { potAard: { huur: 'vast' } } }); await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
      return { huur: V.vastePotjes.find((x) => x.k === 'huur'), vast: Br.stappen.find((s) => s.soort === 'vast').waarde,
        proj: V.projectie, zin: document.querySelector('#gripDezeMaand [data-dmzin]').innerText }; });
    expect(r.huur).toMatchObject({ geen: true, eind: 750 });   // invoermeting: Huur draagt geen betaling en telt toch 750
    expect(r.vast).toBe(0);
    expect(r.proj).toBe(2473);
    expect(r.zin).toContain('Huur: geen betaling verwacht deze maand · €750 telt mee als vaste last.');
  });
  test('een vaste last boven zijn potje staat als plus in de stap', async ({ page }) => {
    // Vervoer EUR 500 tegen een lease van EUR 537
    await Toe.boot(page, { set: { budgets: { huur: 750, vervoer: 500, verzekering: 175, boodschappen: 500, vices: 50, uiteten: 70 } } });
    await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
      return { vast: Br.stappen.find((s) => s.soort === 'vast').waarde, verwacht: Math.round(V.vaste.eind - V.vaste.budget),
        kleur: document.querySelector('#gripBrug [data-brugstap="vast"] i').style.background }; });
    expect(r.verwacht).toBe(37);
    expect(r.vast).toBe(37);
    expect(r.kleur).toBe('var(--red)');
  });
});

test.describe('b. een tik op de stap', () => {
  test('vaste lasten opent de sheet vaste lasten, en openen schrijft niets', async ({ page }) => {
    await Zes.boot(page); await grip(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await tik(page, '#gripBrug [data-brugstap="vast"]');
    expect(await page.evaluate(() => !!document.getElementById('gripVast'))).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
  test('zonder potje opent de volle lijst', async ({ page }) => {
    await Zes.boot(page); await grip(page);
    await tik(page, '#gripBrug [data-brugstap="zonder"]');
    expect(await page.evaluate(() => !!document.getElementById('gripVooruit'))).toBe(true);
  });
});

test.describe('c. Grip en Inzichten noemen waaruit het bedrag bestaat, uit dezelfde bron', () => {
  test('6 oktober: EUR 1.703 deze maand, EUR 1.450 betaald, EUR 253 komt nog', async ({ page }) => {
    await Zes.boot(page);
    const S = await page.evaluate(() => vasteLastenStand());
    expect(S).toMatchObject({ totaal: 1703, betaald: 1450, nog: 253, geen: 0, buiten: 0 });
    expect(S.totaal).toBe(S.betaald + S.nog + S.geen);
    expect(await uitleg(page)).toBe('€1.703 deze maand · €1.450 betaald, €253 komt nog');
    expect(await vastPost(page)).toEqual({ val: '€253', sub: 'van €1.703 deze maand' });
    // het getal op Inzichten is wat er nog komt: het deel in je potjes plus wat er zonder potje komt
    expect(await page.evaluate(() => monthLiquidity().fixDue)).toBe(S.nog + S.buiten);
  });
  test('het toestel met Huur op vast: het bedrag zonder betaling staat bij beide, en telt op Inzichten niet mee', async ({ page }) => {
    await Toe.boot(page, { set: { potAard: { huur: 'vast' } } });
    const S = await page.evaluate(() => vasteLastenStand());
    expect(S).toMatchObject({ totaal: 1451, betaald: 0, nog: 701, geen: 750 });
    expect(S.totaal).toBe(S.betaald + S.nog + S.geen);
    expect(await uitleg(page)).toBe('€1.451 deze maand · €0 betaald, €701 komt nog, €750 zonder betaling');
    expect(await vastPost(page)).toEqual({ val: '€701', sub: 'van €1.451 deze maand · €750 zonder betaling telt niet mee' });
  });
  test('de bron: beide lezen vasteLastenStand() en rekenen niets zelf', async ({ page }) => {
    await Zes.boot(page);
    const ins = await kaalUit(page, 'nogDezeMaandPosten'), sh = await kaalUit(page, 'renderGripVast');
    expect(ins).toContain('vasteLastenStand(');
    expect(sh).toContain('vasteLastenZin(vasteLastenStand())');
  });
});

test.describe('d. hooguit zeven kolommen, elk minstens 40px breed op 360px', () => {
  // drie potjes boven (Uit eten, Vices, Boodschappen) EN een uitgave zonder potje (Bol.com op Online shopping)
  const DRIE = { set: { budgets: Object.assign({}, Zes.BUDGETS, { uiteten: 100 }) },
    extraTx: [{ id: 'bolx', date: '2026-10-03', amount: -90, name: 'Bol.com', desc: 'BEA, BETAALPAS BOL.COM' }] };
  test('met een stap zonder potje gaan er twee potjes los, en de zin noemt het derde toch', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await Zes.boot(page, DRIE); await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
      return { boven: V.potjes.filter((x) => Math.round(x.overR) > 0).map((x) => x.k), st: Br.stappen.map((s) => s.soort),
        som: Br.stappen.slice(1, -1).reduce((a, s) => a + s.waarde, V.budget), proj: V.projectie,
        kol: [...document.querySelectorAll('#gripBrug [data-brugstap]')].map((k) => k.getBoundingClientRect().width),
        as: document.querySelectorAll('#gripBrug [data-asbasis]').length,
        zin: document.querySelector('#gripDezeMaand [data-dmzin]').innerText }; });
    expect(r.boven.slice().sort()).toEqual(['boodschappen', 'uiteten', 'vices']);   // invoermeting: drie potjes erboven
    expect(r.st).toEqual(['begin', 'potje', 'potje', 'rest', 'vast', 'zonder', 'eind']);
    expect(r.som).toBe(r.proj);
    expect(r.kol.length).toBe(7);
    // onafgerond: met de as als eigen kolom is een kolom 39,86px, en afgerond leest dat als 40
    expect(r.as).toBe(1);   // invoermeting: de as staat er
    for (const w of r.kol) expect(w).toBeGreaterThanOrEqual(40);
    expect(r.zin).toContain('Boodschappen');
  });
  test('zonder stap zonder potje staan er drie los', async ({ page }) => {
    await Zes.boot(page, { set: DRIE.set }); await grip(page);
    const st = await page.evaluate(() => dezeMaandBrug(maandVooruit()).stappen.map((s) => s.soort));
    expect(st).toEqual(['begin', 'potje', 'potje', 'potje', 'rest', 'vast', 'eind']);
  });
  test('de bridge op Inzichten houdt zijn gap van 4px', async ({ page }) => {
    await Zes.boot(page);
    const h = await page.evaluate(() => brugGrafiek({ tegen: 'budget', stappen: [{ soort: 'begin', label: 'b', waarde: 100 }, { soort: 'eind', label: 'e', waarde: 90 }] }));
    expect(h).toContain('gap:4px');
  });
});

for (const w of [360, 390]) {
  test(`e. op ${w}px loopt de kaart niet over, en de sheet vaste lasten ook niet`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await Zes.boot(page); await grip(page);
    const k = await page.evaluate(() => { const e = document.getElementById('gripDezeMaand'), r = e.getBoundingClientRect();
      return { h: Math.round(r.height), over: [...e.querySelectorAll('*')].filter((x) => x.getBoundingClientRect().right > r.right + 0.5).length,
        kop: Math.round(e.querySelector('[data-dmregel]').getBoundingClientRect().height) }; });
    await tik(page, '#gripBrug [data-brugstap="vast"]');
    const s = await page.evaluate(() => { const g = document.getElementById('gripVast');
      return { h: Math.round(g.getBoundingClientRect().height), uitleg: Math.round(g.querySelector('[data-vastuitleg]').getBoundingClientRect().height),
        over: document.getElementById('sheet').scrollWidth > document.getElementById('sheet').clientWidth }; });
    console.log(`v357 ${w}px: kaart ${k.h}, kop ${k.kop}, sheet ${s.h}, uitleg ${s.uitleg}`);
    expect(k.over).toBe(0);
    expect(k.h).toBe(271);
    expect(s.over).toBe(false);
  });
}
