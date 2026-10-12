/* v395: ZIEN NA DE REVIEW OP HET TOESTEL (gevraagd door de gebruiker).
   1. De bridge start bij het eerlijke budget: de eerste balk is het budget met het te ruim begrote deel gearceerd
      bovenop (per potje een stuk), het label "eerlijk EUR X", geen te-ruim-kolommen, daarna alleen de afwijkingen, en
      een eindbalk "verwacht" met een stippellijn op het eerlijke budget en een haakje. DE SOM VAN DE STAPPEN IS HET
      GETAL IN DE KOP ("EUR X onder/boven eerlijk budget").
   2. Overig zegt hoeveel potjes erin onder en boven eindigen; de noot onder de drempel noemt het potje bij een tik.
   3. Let op: een terugkerende partij in een categorie zonder potje is een regel (zie lek-categorie.spec.js).
   4. "Waarom? Bekijk wat erachter zit" is weg.
   Fixture: grip-kring-stand (10 okt 2026): budget 3325, Huur 629 en Vervoer (variabel deel) 390 te ruim, dus eerlijk
   2306, verwacht 1711. GECONSTRUEERD; de getallen van het toestel (3375/2746/2815) staan alleen daar. */
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');
const OPN = [['2026-10-06', 300], ['2026-10-09', 200]];
const grip = async (page, w) => { await page.setViewportSize({ width: w || 390, height: 844 }); await K.boot(page, { opnames: OPN }); await page.evaluate(() => go('maand')); };
const meet = page => page.evaluate(() => { const V = maandVooruit(), B = gripZienBrug(V), M = gripMeterBudget(V);
  const kol = [...document.querySelectorAll('#gripBrug [data-brugstap]')].map(e => [e.dataset.brugstap, +e.dataset.brugwaarde]);
  return { st: B.stappen, kol, eerlijk: Math.round(M.eerlijk), bud: Math.round(V.budget), proj: Math.round(V.projectie),
    kop: document.querySelector('[data-zienkop]').innerText, kopV: +document.querySelector('[data-zienkop]').dataset.zienverschil }; });

test.describe('1 · de bridge start bij het eerlijke budget', () => {
  test('eerste balk = budget, het te ruime deel gearceerd erop, label "eerlijk", geen te-ruim-kolommen', async ({ page }) => {
    await grip(page);
    const r = await meet(page);
    expect(r.st[0]).toEqual(expect.objectContaining({ soort: 'begin', waarde: r.bud, start: r.eerlijk, label: `eerlijk €${r.eerlijk.toLocaleString('nl-NL')}` }));
    expect(r.bud - r.eerlijk).toBe(1019);   // invoermeting: Huur 629 en Vervoer 390 te ruim
    expect(r.kol.map(x => x[0])).not.toContain('teruim');
    expect(await page.locator('#gripBrug [data-brugstap="begin"] [data-gearceerd]').evaluateAll(e => e.map(x => [x.dataset.teruimk, x.title]))).toEqual([['huur', 'Huur · €629 te ruim'], ['vervoer', 'Vervoer & auto · €390 te ruim']]);
    expect(await page.locator('#gripBrug [data-brugstap="begin"] [data-brugeen]').innerText()).toBe('eerlijk €2.306');
  });
  test('de som van de stappen is het getal in de kop', async ({ page }) => {
    await grip(page);
    const r = await meet(page);
    const som = r.kol.slice(1, -1).reduce((a, x) => a + x[1], 0);
    expect(som).toBe(r.proj - r.eerlijk);
    expect(som).toBe(r.kopV);
    expect(r.kop).toBe(`€${Math.abs(som).toLocaleString('nl-NL')} ${som < 0 ? 'onder' : 'boven'} eerlijk budget`);
    expect(r.kol[r.kol.length - 1]).toEqual(['eind', r.proj]);
  });
  test('stappen zijn alleen de afwijkingen: uitschieters, zonder potje, overig', async ({ page }) => {
    await grip(page);
    const r = await meet(page);
    for (const [s] of r.kol.slice(1, -1)) expect(['potje', 'zonder', 'overig']).toContain(s);
    expect(r.kol.find(x => x[0] === 'potje')).toEqual(['potje', 67]);   // Uit eten
  });
  test('eindbalk "verwacht" met een stippellijn op het eerlijke budget en het haakje', async ({ page }) => {
    await grip(page);
    const e = page.locator('#gripBrug [data-brugstap="eind"]');
    expect(await e.locator('[data-brugeen]').innerText()).toBe('verwacht');
    expect(await e.locator('[data-eerlijklijn]').count()).toBe(1);
    expect((await e.locator('[data-haaktekst]').innerText()).replace(/\s+/g, ' ')).toBe('−€595 onder');
    // de stippellijn staat op de hoogte van het eerlijke budget: gelijk aan de lijn die de begin-balk verlaat
    const y = await page.evaluate(() => { const b = document.querySelector('#gripBrug [data-brugstap="begin"]'), l = [...b.querySelectorAll(':scope > div > i')].pop();
      return { begin: l.getBoundingClientRect().top, eind: document.querySelector('[data-eerlijklijn]').getBoundingClientRect().top }; });
    expect(Math.abs(y.begin - y.eind)).toBeLessThan(1.5);
  });
  test('boven het eerlijke budget: een plus en "boven", en de kop zegt hetzelfde getal', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { const add = (d, a, n, c) => { const t = { id: 'x' + d + n, date: d, amount: a, acc: 'NL01MAIN0000001111', name: n, desc: 'BEA, BETAALPAS ' + n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = c; };
      add('2026-10-04', -160, 'Coffeeshop X', 'vices'); add('2026-10-05', -240, 'Zalando Q', 'shopping'); add('2026-10-07', -300, 'Albert Heijn Q', 'boodschappen'); save(); renderMaand(); });
    const r = await meet(page);
    expect(r.kopV).toBeGreaterThan(0);
    expect(r.kol.slice(1, -1).reduce((a, x) => a + x[1], 0)).toBe(r.kopV);
    expect((await page.locator('[data-haaktekst]').innerText()).replace(/\s+/g, ' ')).toBe(`+€${r.kopV} boven`);
    expect(r.kop).toBe(`€${r.kopV} boven eerlijk budget`);
  });
  test('laten staan: niet gearceerd, eerlijk is hoger, en de som klopt nog steeds met de kop', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { teRuimLaten('huur'); closeSheet(); renderMaand(); });
    const r = await meet(page);
    expect(r.bud - r.eerlijk).toBe(390);
    expect(r.kol.slice(1, -1).reduce((a, x) => a + x[1], 0)).toBe(r.kopV);
    expect(r.kopV).toBe(r.proj - r.eerlijk);
  });
  test('een tik op een gearceerd stuk opent de te-ruim-sheet op dat potje; een tik onderin de balk de volle lijst', async ({ page }) => {
    await grip(page);
    await page.waitForTimeout(350);
    await page.click('#gripBrug [data-gearceerd][data-teruimk="vervoer"]');
    expect(await page.locator('[data-teruimfocus]').getAttribute('data-teruimpotje')).toBe('vervoer');
  });
});

test.describe('2 · overig en de noot', () => {
  test('overig zegt hoeveel potjes onder en boven eindigen, uit dezelfde afronding als zijn sheet', async ({ page }) => {
    await grip(page);
    const lab = await page.locator('#gripBrug [data-brugstap="overig"] [data-brugeen2]').innerText();
    const r = await page.evaluate(() => { const D = gripOverigDelen(maandVooruit()); const per = {};
      for (const x of [...D.P.rest, ...D.P.vast]) if (x.k !== '~overige') per[x.k] = (per[x.k] || 0) + x.waarde;
      return { onder: Object.values(per).filter(v => v < 0).length, boven: Object.values(per).filter(v => v > 0).length, tot: D.tot,
        som: [...D.P.rest, ...D.P.vast].reduce((a, x) => a + x.waarde, 0) + (D.R.zonder || 0), huur: per.huur || 0 }; });
    expect(lab).toBe(`${r.onder} onder, ${r.boven} boven`);
    expect(r.boven).toBe(1);   // invoermeting: Vices, onder de drempel
    expect(r.som).toBe(r.tot);
    expect(r.huur).toBe(0);    // het te ruime deel van Huur staat in de eerste balk, niet in overig
    expect(await page.locator('#gripBrug [data-brugstap="overig"] [data-brugeen]').getAttribute('title')).toBe(`overig · ${lab}`);
  });
  test('de telling leest ook de vaste potjes: Huur laten staan eindigt onder en telt mee als een potje onder', async ({ page }) => {
    await grip(page);
    const voor = await page.locator('#gripBrug [data-brugeen2]').innerText();
    await page.evaluate(() => { teRuimLaten('huur'); closeSheet(); renderMaand(); });
    const na = await page.locator('#gripBrug [data-brugeen2]').innerText();
    const r = await page.evaluate(() => { const D = gripOverigDelen(maandVooruit());
      return { vast: D.P.vast.find(x => x.k === 'huur'), rest: D.P.rest.find(x => x.k === 'huur') }; });
    expect(r.vast && r.vast.waarde).toBe(-629);   // invoermeting: Huur staat alleen in de vaste groep
    expect(r.rest).toBeUndefined();
    const n = t => +t.match(/(\d+) onder/)[1];
    expect(n(na)).toBe(n(voor) + 1);
  });
  test('de noot onder de drempel noemt het potje bij een tik (en in title), en de tik opent overig niet', async ({ page }) => {
    await grip(page);
    const n = page.locator('#gripBrug [data-brugnoot]');
    expect(await n.innerText()).toBe('+€5');
    expect(await n.getAttribute('title')).toBe('Vices · onder de drempel');
    await page.waitForTimeout(350); await n.click();
    await expect(page.locator('#toast')).toHaveText('Vices · onder de drempel');
    expect(await page.locator('#gripOverig').count()).toBe(0);
    const h = await n.evaluate(e => e.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(20);   // tikvlak: 9px tekst plus 6px rondom
  });
});

test('4 · "Waarom? Bekijk wat erachter zit" staat niet meer op Zien', async ({ page }) => {
  await grip(page);
  expect(await page.locator('[data-gripcta]').count()).toBe(0);
  expect(await page.locator('#gripInhoud').innerText()).not.toContain('Waarom?');
  expect(await page.locator('[data-griptab="begrijpen"]').count()).toBe(1);   // de tab is de ingang
});

for (const w of [390, 360]) test(`past op ${w}x844 boven de menubalk, labels op een regel, zonder overloop (ook met zes kolommen)`, async ({ page }) => {
  await grip(page, w);
  await page.evaluate(() => { const add = (d, a, n, c) => { const t = { id: 'x' + d + n, date: d, amount: a, acc: 'NL01MAIN0000001111', name: n, desc: 'BEA, BETAALPAS ' + n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = c; };
    add('2026-10-04', -160, 'Coffeeshop X', 'vices'); add('2026-10-05', -240, 'Zalando Q', 'shopping'); add('2026-10-07', -300, 'Albert Heijn Q', 'boodschappen'); save(); renderMaand(); });
  const r = await page.evaluate(() => ({ kol: document.querySelectorAll('#gripBrug [data-brugstap]').length,
    lab: [...document.querySelectorAll('#gripBrug [data-brugstap="begin"] [data-brugeen], #gripBrug [data-brugstap="overig"] [data-brugeen], #gripBrug [data-brugeen2], #gripBrug [data-brugstap="eind"] [data-brugeen]')].map(e => e.scrollWidth - e.clientWidth),
    breed: [...document.querySelectorAll('#gripBrug [data-brugstap]')].map(e => e.getBoundingClientRect().width),
    knop: document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav: document.querySelector('.nav').getBoundingClientRect().top, sw: document.documentElement.scrollWidth }));
  console.log(`zien ${w}: ${r.kol} kolommen, knop ${Math.round(r.knop)}px, menubalk ${Math.round(r.nav)}px`);
  expect(r.kol).toBe(6);
  for (const o of r.lab) expect(o).toBeLessThanOrEqual(0);   // eerlijk, overig, de telling en verwacht passen
  for (const b of r.breed) expect(b).toBeGreaterThanOrEqual(40);   // v357: het tikvlak
  expect(r.knop).toBeLessThanOrEqual(r.nav);
  expect(r.sw).toBeLessThanOrEqual(w);
});
