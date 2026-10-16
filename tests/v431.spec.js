/* v431: REPARATIE NA v430 OP HET TOESTEL (blok 20 en 22, 16 okt). Geen nieuwe functies. Op de stand van v428 (v421-stand, 10 oktober
   2026, GECONSTRUEERD) en, voor de betaalrekening, grip-kring-stand met twee opnames uit je spaargeld. */
const { test, expect } = require('@playwright/test');
const V = require('./v428-boot');
const K = require('./grip-kring-stand');
const { MAIN } = require('./v421-stand');
const OPN = [['2026-10-06', 300], ['2026-10-09', 400]];
const G = page => page.evaluate(() => { const G = vastGestegenData(); return { totVoor: G.totVoor, totNa: G.totNa, stijging: G.stijging, posten: G.posten.map(p => ({ naam: p.naam, key: p.key, status: p.status, door: p.door, termijn: p.termijn, cadans: p.cadans, mV: p.mV, mN: p.mN, verschil: p.verschil })), vragen: G.vragen.map(v => v.key) }; });
const infomedics = page => page.evaluate(MAIN => { for (const d of ['2026-07-12', '2026-08-12']) { const t = { id: 'v431im' + d, date: d, amount: -46, acc: MAIN, name: 'Infomedics', desc: 'INFOMEDICS ZORGNOTA', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'zorg'; TX.push(t); }
  SET.fixOvrM = Object.assign({}, SET.fixOvrM, { INFOMEDICS: 'fixed' }); TX.sort((a, b) => a.date.localeCompare(b.date)); save(); }, MAIN);

test.describe('v431 · 1 vaste lasten gestegen', () => {
  test('1a. een post die jij stopte telt nooit als nieuw of gestegen: hij staat onder gestopt met wat vrijkomt', async ({ page }) => {
    await V.boot(page);
    let g = await G(page);
    expect(g.posten.find(p => p.naam === 'Health Club')).toMatchObject({ status: 'gestopt', door: 'jij', termijn: 39, cadans: 'per 4 weken', mV: 42, mN: 0, verschil: -42 });
    expect(g.posten.find(p => p.naam === 'Nikki').status).toBe('nieuw');   // de invoer: Nikki is nieuw zolang hij loopt
    await page.evaluate(() => postZet('NIKKI', 'gestopt'));
    g = await G(page);
    expect(g.posten.find(p => p.naam === 'Nikki')).toMatchObject({ status: 'gestopt', door: 'jij', mN: 0 });
    expect(await page.evaluate(() => gripCyclusLees().kies.some(k => k.id === 'vastpost:NIKKI'))).toBe(false);
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('vast:gestegen'); });
    await expect(page.locator('[data-vastgroep="gestopt"]')).toHaveCount(1);
    await expect(page.locator('[data-vastpostrij="NIKKI"]')).toContainText('gestopt door jou');
  });
  test('1b. nieuw alleen als hij in de laatste afgeronde maand betaald is of verwacht wordt; anders een gegevensvraag', async ({ page }) => {
    await V.boot(page);
    await infomedics(page);
    let g = await G(page);
    expect(g.posten.some(p => p.key === 'INFOMEDICS')).toBe(false);
    expect(g.vragen).toEqual(['INFOMEDICS']);
    const q = await page.evaluate(() => gegevensVragen().filter(q => q.soort === 'vastafgelopen').map(q => gegevensVraagKort(q)));
    expect(q).toEqual(['Infomedics: afgelopen of komt terug? · 12 aug']);
    await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); openGegevensVragen('alle'); });
    await page.locator('[data-gegevensvraag="vastafgelopen"] [data-vastafgelopen="actief"]').click();
    g = await G(page);
    expect(g.posten.find(p => p.key === 'INFOMEDICS')).toMatchObject({ status: 'nieuw', mN: 46 });
    expect(g.vragen).toEqual([]);
  });
  test('1c. het bedrag is het laatste termijnbedrag per maand: Shurgard EUR 71 per 4 weken is EUR 77 (niet de EUR 137 van september)', async ({ page }) => {
    await V.boot(page);
    const g = await G(page);
    expect(g.posten.find(p => p.naam === 'Shurgard Nl')).toMatchObject({ status: 'nieuw', termijn: 71, cadans: 'per 4 weken', mN: 77, verschil: 77 });
    expect(await page.evaluate(() => [postMaandBedrag({ cadans: '4w' }, 71), postMaandBedrag({ intervalM: 3 }, 90), postMaandBedrag({ intervalM: 12 }, 120), postMaandBedrag({ cadans: 'maand' }, 50)].map(x => Math.round(x)))).toEqual([77, 30, 10, 50]);
  });
  test('1d. een bron: de stijging is de som van de regels (nieuw + gestegen - gestopt), en de kop toont die', async ({ page }) => {
    await V.boot(page);
    const g = await G(page);
    expect(g.stijging).toBe(g.totNa - g.totVoor);
    expect(g.posten.reduce((a, p) => a + p.verschil, 0)).toBe(g.stijging);
    expect(g.stijging).toBe(77 + 47 - 42);
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('vast:gestegen'); });
    const d = await page.evaluate(() => { const e = document.querySelector('[data-vastvoorna]'); return { voor: +e.dataset.vasttotvoor, na: +e.dataset.vasttotna, st: +e.dataset.vaststijging, rijen: [...document.querySelectorAll('[data-vastpostrij]')].reduce((a, r) => a + +r.dataset.vastbedrag, 0) }; });
    expect(d).toEqual({ voor: g.totVoor, na: g.totNa, st: g.stijging, rijen: g.stijging });
  });
});

test.describe('v431 · 2 na je salaris', () => {
  test('2a/2b. vier groepen die samen het totaal zijn, en de basis: 1 volle maand na je verhoging (sep)', async ({ page }) => {
    await V.boot(page);
    const N = await page.evaluate(() => naJeSalarisData());
    expect(N.groepen.map(g => g.id)).toEqual(['vices+uiteten', 'contant', 'online+overig', 'overige']);
    expect(N.groepen[3].naam).toMatch(/^Overige potjes \(.+, …\)$/);
    expect(N.groepen.reduce((a, g) => a + g.voor, 0)).toBe(N.voorTot);
    expect(N.groepen.reduce((a, g) => a + g.na, 0)).toBe(N.naTot);
    expect(N.groepen.reduce((a, g) => a + g.verschil, 0)).toBe(N.extra);
    expect(N.basis).toBe('op basis van 1 volle maand na je verhoging (sep)');
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('inkomen:na'); });
    await expect(page.locator('[data-nasalgroep]')).toHaveCount(4);
    await expect(page.locator('[data-nasalbasis]')).toHaveText('op basis van 1 volle maand na je verhoging (sep)');
  });
});

test.describe('v431 · 3 salaris opgedeeld', () => {
  test('3a. de toets loopt op de afgeronde maanden, met de rest per maand; de lopende maand telt niet mee', async ({ page }) => {
    await K.boot(page, { opnames: OPN });
    const before = await page.evaluate(() => { const X = gripCyclusLees().OV.A['pat:spaargeld'], o = X.toetsen.find(t => t.soort === 'opgedeeld'); return { vuurt: o.vuurt, m: o.getallen.maanden }; });
    expect(before.vuurt).toBe(false);
    expect(before.m).not.toContain('2026-10');
    expect(before.m.split(' · ').map(x => x.slice(0, 7))).toEqual(['2026-07', '2026-08', '2026-09']);
    /* een maand onder de 5% is niet genoeg (1 van 3); twee wel */
    const zet = (d) => page.evaluate(d => { const t = { id: 'v431op' + d, date: d, amount: -5000, acc: 'NL01MAIN0000001111', name: 'Albert Heijn', desc: 'BEA ALBERT HEIJN GROOT', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'boodschappen'; TX.push(t); save(); }, d);
    const lees = () => page.evaluate(() => { const o = gripCyclusLees().OV.A['pat:spaargeld'].toetsen.find(t => t.soort === 'opgedeeld'); return { vuurt: o.vuurt, onder: o.getallen.onder, bewijs: o.vuurt ? o.bewijs : o.niet }; });
    await zet('2026-09-26');
    expect(await lees()).toMatchObject({ vuurt: false, onder: '1 van 3' });
    /* de lopende maand telt niet: ook met een salaris en een tekort in oktober is hij niet zeker */
    await page.evaluate(() => { const t = { id: 'v431salokt', date: '2026-10-02', amount: 5216, acc: 'NL01MAIN0000001111', name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); });
    await zet('2026-10-08');
    expect(await page.evaluate(() => oorzaakSalData().R.slice(-1)[0].salaris)).toBeGreaterThan(0);   // de invoer: oktober heeft een salaris
    expect(await lees()).toMatchObject({ vuurt: false, onder: '1 van 3' });
    expect(await page.evaluate(() => opgedeeldData().M.map(x => x.ym))).toEqual(['2026-07', '2026-08', '2026-09']);
    await zet('2026-08-26');
    const r = await lees();
    expect(r).toMatchObject({ vuurt: true, onder: '2 van 3' });
    expect(r.bewijs).toMatch(/rest per maand: jul €[\d.]+ · aug −€[\d.]+ · sep −€[\d.]+$/);
  });
  test('3b. een verschoven salarisdatum staat in het bewijs (de datums uit blok 20)', async ({ page }) => {
    await K.boot(page, { opnames: OPN });
    expect(await page.evaluate(() => opgedeeldData().verschoven)).toBe('');   // de invoer: salaris elke maand op de 24e
    await page.evaluate(() => { for (const t of TX) if (t.amount === 5216 && t.date < '2026-09') t.date = t.date.slice(0, 8) + '05'; TX.forEach(categorize); save(); });
    const r = await page.evaluate(() => { const Z = opgedeeldData(), o = gripCyclusLees().OV.A['pat:spaargeld'].toetsen.find(t => t.soort === 'opgedeeld'); return { v: Z.verschoven, txt: o.vuurt ? o.bewijs : o.niet, g: o.getallen.verschoven }; });
    expect(r.v).toBe('salaris kwam eerst rond de 5e, nu op de 24e');
    expect(r.g).toBe(r.v);
  });
  test('3c. onder Kiezen staat bij de betaalrekening een handeling, niet de naam van het symptoom', async ({ page }) => {
    await K.boot(page, { opnames: OPN });
    const r = await page.evaluate(() => { const C = gripCyclusLees(), s = C.sym.find(z => z.id === 'pat:spaargeld'); return { naam: s.naam, kies: C.kies.concat(C.wacht).filter(k => k.sym === 'pat:spaargeld').map(k => k.naam) }; });
    expect(r.kies.length).toBeGreaterThan(0);
    for (const k of r.kies) expect(k).not.toBe(r.naam);
    expect(r.kies).toContain('Niets meer uit je spaargeld, of het terugzetten');
  });
});

test.describe('v431 · 4 een symptoom toont alleen zichzelf', () => {
  test('4a/4b/4c. het potje binnen de betaalrekening: kop, staafjes, oorzaken en de vraag; geen patroonblok; onderaan "telt ook mee in"', async ({ page }) => {
    await K.boot(page, { opnames: OPN });
    await page.evaluate(() => go('maand'));
    const sym = await page.evaluate(() => gripCyclusLees().sym.find(s => s.id === 'sig:uiteten'));
    expect(sym.sub).toBe(`€${sym.bedrag} erboven`);   // 4c: geen "in Betaalrekening op ..."
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('sig:uiteten'); });
    const d = await page.evaluate(() => { const e = document.querySelector('#gripSymptoom'); return { t: e.innerText, patroon: e.querySelectorAll('[data-patroon],[data-patboom],[data-patbewijs]').length, kop: (e.querySelector('[data-symkop]') || {}).innerText, balk: e.querySelectorAll('[data-symmaand]').length, lijn: !!e.querySelector('[data-budgetlijn]'), oorzaak: !!e.querySelector('[data-symoorzaak]'), ook: [...e.querySelectorAll('[data-teltookmee]')].map(x => x.dataset.teltookmee) }; });
    expect(d.patroon).toBe(0);
    expect(d.t.replace(/telt ook mee in:.*$/m, '')).not.toMatch(/PATROON|Gezien:|Betaalrekening op na/);   // alleen de link onderaan noemt het bredere symptoom
    expect((d.t.match(/^\s*€\d+ erboven\s*$/gm) || []).length).toBe(1);   // de kop staat er een keer (niet ook als sub)
    expect(d.kop).toBe(`€${sym.bedrag} erboven`);
    expect(d.balk).toBe(4); expect(d.lijn).toBe(true); expect(d.oorzaak).toBe(true);
    expect(d.ook).toEqual(['pat:spaargeld']);
    await page.locator('[data-teltookmee="pat:spaargeld"]').click();
    expect(await page.evaluate(() => document.querySelector('#gripSymptoom').dataset.symdrill)).toBe('pat:spaargeld');
  });
  test('4b. een potje telt ook mee in na je salaris', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('pat:pot:vices'); });
    const d = await page.evaluate(() => ({ patroon: document.querySelectorAll('#gripSymptoom [data-patroon],#gripSymptoom [data-patbewijs]').length, ook: [...document.querySelectorAll('[data-teltookmee]')].map(x => x.dataset.teltookmee) }));
    expect(d.patroon).toBe(0);
    expect(d.ook).toContain('inkomen:na');
  });
  test('4d. Betaalrekening op is een eigen symptoom: het bedrag uit spaargeld, de onttrekkingen per datum en de oorzaken uit punt 3', async ({ page }) => {
    await K.boot(page, { opnames: OPN });
    await page.evaluate(() => { gripKiesTab('begrijpen'); });
    await expect(page.locator('#gripSymptomen [data-symptoom="pat:spaargeld"]')).toHaveCount(1);
    await page.evaluate(() => gripNaarSymptoom('pat:spaargeld'));
    const d = await page.evaluate(() => { const e = document.querySelector('#gripSymptoom'); return { kop: e.querySelector('[data-onttrekkingen] .hlabel').innerText, rijen: [...e.querySelectorAll('[data-onttrekking]')].map(x => x.dataset.onttrekking), boom: e.querySelectorAll('[data-patboom]').length, oorzaken: e.querySelector('[data-symoorzaak]').innerText }; });
    expect(d.kop).toMatch(/€700$/);
    expect(d.rijen).toEqual(['2026-10-06', '2026-10-09']);
    expect(d.boom).toBe(0);
    expect(d.oorzaken).toMatch(/Mijn salaris is al verdeeld voordat de maand om is/);   // de vraag met de oorzaken uit punt 3
  });
});

test.describe('v431 · 5 blok 22', () => {
  test('de vier controles staan er en sluiten', async ({ page }) => {
    await V.boot(page);
    const b = await page.evaluate(() => diagOorzaken().join('\n'));
    expect(b).toMatch(/vaste lasten: som van de regels \(nieuw \+ gestegen - gestopt\) 82 tegen de stijging van het totaal 82 \(\d+ -> \d+\): gelijk/);
    expect(b).toMatch(/na je salaris: som van de groepen .*: gelijk/);
    expect(b).toContain('gestopte post (door jou) als nieuw of gestegen: geen');
    expect(b).toContain('potje-symptoom met een ander symptoom als kop of patroonblok: geen');
  });
  test('en ze vallen als het niet klopt: een gestopte post als nieuw', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => postZet('NIKKI', 'gestopt'));
    const b = await page.evaluate(() => diagOorzaken().join('\n'));
    expect(b).toContain('gestopte post (door jou) als nieuw of gestegen: geen');   // de invoer: na de reparatie staat Nikki onder gestopt
    expect(b).toMatch(/gestopt +Nikki \(NIKKI\) · door jou/);
  });
});
