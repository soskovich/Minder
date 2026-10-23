/* v454 (gevraagd door de gebruiker, antwoord op v453; nog geen deel B).
   1. Eenmalig: rekenen ja, verbergen nee. Zien en Inzichten dragen EEN regel "eenmalig buiten je potjes deze maand: EUR X (n boekingen)"
      met de boekingen in een sheet (eenmaligMaand, de boekingen met het label eenmalig); blok 20 eenmalig per maand (bedrag, aantal).
      Op v421-stand (10 oktober 2026, GECONSTRUEERD) met de boekingen van v453.
   2. Contant zonder telling: uitgegeven tot nu = budget per dag x verstreken dagen, gemarkeerd als schatting, met als maximum stand
      begin + opnames + ontvangen − storting. Boven je potje (en boven je tempo) alleen na een telling. Een stand met een negatieve rest.
      Blok 20 POTJE CONTANT: per periode telling, schatting of opnames. Op v454-stand (GECONSTRUEERD, november 2026).
   3. Laserbehandeling: de termijn april 2027 blijft staan.
   4. Blok 25: je eigen naam in een van de twee boekingen is genoeg. */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
const S4 = require('./v454-stand');

async function boot(page) {
  await S.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v454' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    add('2026-10-09', -159, 'Lausa Eriksson via Tikki', 'LAUSA ERIKSSON VIA TIKKIE BETAALVERZOEK', 'zorg');
    add('2026-10-04', -484, 'Gemeente Amsterdam', 'GEMEENTE AMSTERDAM WEGSLEPEN', 'belasting');
    add('2026-10-06', -120, 'Albert Heijn', 'ALBERT HEIJN 1234', 'boodschappen');
    add('2026-10-07', -60, 'Iets onvoorziens', 'IETS ONVOORZIENS', Object.keys(CATS).find(k => geenNorm(k) && k !== CONTANT_CAT && CATS[k].type === 'expense'));
    SET.budgets = Object.assign({}, SET.budgets, { zorg: Math.max(+(SET.budgets || {}).zorg || 0, 200), belasting: Math.max(+(SET.budgets || {}).belasting || 0, 600) });
    TX.sort((a, c) => a.date.localeCompare(c.date));
    applyOwnAccounts(); buildAccMeta(); kennisZaai(); save(); render();
  }, { MAIN: S.MAIN });
}
const regel = (L, re) => L.find(l => re.test(l)) || '';

test.describe('1 · eenmalig: rekenen ja, verbergen nee', () => {
  /* v455: de regel is "buiten je potjes" met geenNormTx() als bron (ook de categorie zonder norm zonder label); de vorm staat in
     v455.spec.js. Hier blijft wat v454 vastlegde: de boekingen met het label staan erin en de sheet telt daarop op. */
  test('a. Zien en Inzichten: de boekingen met het label staan in de regel (v455: buiten je potjes), en de sheet telt daarop op', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const okt = TX.filter(t => t.date.startsWith('2026-10') && t.amount < 0);
      const inv = { label: okt.filter(t => eenmaligLabel(t)).map(t => -t.amount).sort((a, b) => a - b), geenNormZonder: okt.filter(t => geenNormTx(t) && !eenmaligLabel(t)).map(t => -t.amount) };
      go('maand'); const z = document.querySelector('#gripZienStand [data-buitenregel]');
      go('ins'); const i = document.querySelector('#insMaand [data-buitenregel]');
      i.click(); const sh = document.querySelector('#buitenMaandSheet'), rijen = [...document.querySelectorAll('#buitenMaandSheet [data-buitengroep="eenmalig"] [data-buitenrij]')].map(e => +e.dataset.buitenrij);
      return { inv, z: z ? [z.dataset.eenmalig, z.dataset.n] : null, i: i ? [i.dataset.eenmalig, i.dataset.n] : null, sh: sh ? sh.dataset.inswaarde : null, rijen, kop: sh ? sh.innerText : '' }; });
    expect(r.inv.label).toEqual([159, 484]);
    expect(r.inv.geenNormZonder).toEqual([60]);
    expect(r.z).toEqual(['643', '3']);
    expect(r.i).toEqual(['643', '3']);
    expect(r.rijen.sort((a, b) => a - b)).toEqual([159, 484]);
    expect(+r.sh).toBe(703);
    expect(r.kop).toMatch(/Laserbehandeling · eenmalig \(door jou\)/);
  });

  test('b. zonder label alleen de categorie zonder norm; met "Klopt, eenmalig" telt de boeking bij eenmalig', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const A = TX.find(t => t.name === 'Albert Heijn' && t.amount === -120);
      SET.eenmaligOk = Object.assign({}, SET.eenmaligOk, { [A.id]: '2026-10-10' }); save(); const met = buitenMaand(['2026-10']).eenmalig;
      const E = Object.values(SET.kennis || {}); for (const e of E) if (e && e.tx) e.tx = Array.isArray(e.tx) ? [] : {}; delete SET.eenmaligOk[A.id]; save();
      go('maand'); const B = buitenMaand(['2026-10']), z = document.querySelector('#gripZienStand [data-buitenregel]');
      return { met: [met.n, met.bedrag], leeg: B.eenmalig.n, z: z ? [z.dataset.eenmalig, z.dataset.zonderlabel] : null }; });
    expect(r.met).toEqual([3, 763]);
    expect(r.leeg).toBe(0);
    expect(r.z).toEqual(['0', '60']);
  });

  test('c. blok 20: eenmalig per maand (bedrag, aantal) over apr t/m okt (v455: in de regel BUITEN JE POTJES)', async ({ page }) => {
    await boot(page);
    const L = await page.evaluate(() => diagSalarisVerdeling());
    const e = regel(L, /BUITEN JE POTJES PER MAAND \(v455/);
    expect(e).toMatch(/apr 0\.00 eenmalig \(0\) .* okt\* 643\.00 eenmalig \(2\) \+ 60\.00 zonder label \(1\) = 703\.00$/);
  });
});

test.describe('2 · contant zonder telling', () => {
  test('d. uitgegeven tot nu is budget per dag x verstreken dagen, gemarkeerd als schatting, met als maximum begin + opnames + ontvangen − storting', async ({ page }) => {
    await S4.boot(page, { dag: '2026-11-10', opn: [['2026-11-03', -300]] });
    const r = await page.evaluate(() => { const C = contantMaandNu(); return { bron: C.bron, ug: C.uitgegeven, pin: C.pin, s: C.schatting, uitkomst: C.uitkomst }; });
    expect(r.bron).toBe('schatting');
    expect(r.pin).toBe(300);
    expect(r.s).toMatchObject({ dagen: 10, max: 300, begrensd: false });
    expect(r.ug).toBeCloseTo(400 * 10 / 30, 2);
    expect(r.uitkomst).toBeCloseTo(400, 2);
    await S4.boot(page, { dag: '2026-11-10', opn: [['2026-11-03', -50]] });
    const b = await page.evaluate(() => { const C = contantMaandNu(); return { ug: C.uitgegeven, s: C.schatting }; });
    expect(b.s).toMatchObject({ max: 50, begrensd: true });
    expect(b.ug).toBe(50);
  });

  test('e. boven je potje en boven je tempo alleen na een telling', async ({ page }) => {
    await S4.boot(page, { dag: '2026-11-10', opn: [['2026-11-03', -600]] });
    const zonder = await page.evaluate(() => { const V = maandVooruit(); go('maand');
      return { cat: Math.round(catSpendMap(thisYM())[CONTANT_CAT]), kt: kasTempo(), sig: valtOpSignals().some(s => s.k === CONTANT_CAT || s.potjeId === CONTANT_CAT), sym: gripCyclus().sym.filter(s => s.id === 'sig:contant' || s.id === 'pat:pot:contant').map(s => s.id),
        pot: potBovenLijst().some(x => x.k === CONTANT_CAT), ins: insPatronen().some(x => x.k === CONTANT_CAT), uit: uitschieters(V).some(x => x.k === CONTANT_CAT) }; });
    /* de invoer draagt het geval: in de categorie staat 600 tegen een potje van 400 */
    expect(zonder.cat).toBe(600);
    expect(zonder.kt.bron).toBe('schatting');
    expect(zonder.kt.boven).toBe(false);
    expect(zonder.sig).toBe(false);
    expect(zonder.sym).toEqual([]);
    expect([zonder.pot, zonder.ins, zonder.uit]).toEqual([false, false, false]);
    const met = await page.evaluate(() => { contantOpslaan(0, 'telling'); go('maand');
      return { kt: kasTempo(), sig: valtOpSignals().some(s => s.k === CONTANT_CAT || s.potjeId === CONTANT_CAT), sym: gripCyclus().sym.filter(s => s.id === 'sig:contant' || s.id === 'pat:pot:contant').map(s => s.id) }; });
    expect(met.kt.bron).toBe('telling');
    expect(met.kt.uit).toBe(600);
    expect(met.kt.boven).toBe(true);
    expect(met.sym.length).toBe(1);
  });

  test('e2. ook met september en oktober boven het potje: zonder telling deze maand geen patroon en geen potje-boven-lijst', async ({ page }) => {
    await S4.boot(page, { dag: '2026-11-10', opn: [['2026-09-14', -500], ['2026-10-14', -500], ['2026-11-03', -600]] });
    const r = await page.evaluate(() => ({ cs: ['2026-09', '2026-10'].map(m => Math.round(catSpendMap(m)[CONTANT_CAT] || 0)), ong: contantOngeteld(),
      pot: potBovenLijst().some(x => x.k === CONTANT_CAT), ins: insPatronen().some(x => x.k === CONTANT_CAT) }));
    /* de invoer draagt het geval: twee afgeronde maanden boven het potje van 400 */
    expect(r.cs[0]).toBeGreaterThan(400);
    expect(r.cs[1]).toBeGreaterThan(400);
    expect(r.ong).toBe(true);
    expect([r.pot, r.ins]).toEqual([false, false]);
  });

  test('f. een negatieve rest: de forecast van het potje is de uitkomst van contantMaanden, niet op nul geklemd', async ({ page }) => {
    await S4.boot(page, { negRest: true });
    const r = await page.evaluate(() => { const V = maandVooruit(), c = V.potjes.find(x => x.k === CONTANT_CAT), C = contantMaandNu();
      return { ug: C.uitgegeven, bron: C.bron, uitkomst: C.uitkomst, uit: V.contant && V.contant.uit, eind: c.eindR, regel: diagSalarisVerdeling().find(l => /CONTROLE Contant/.test(l)) || '' }; });
    /* de invoer draagt het geval: telling 400 hoger dan begin 100 + opnames 200, dus tot de telling -100, en de rest is negatief */
    expect(r.bron).toBe('telling');
    expect(r.ug).toBe(-100);
    expect(r.uitkomst - r.uit).toBeLessThan(-1);
    expect(r.eind).toBeCloseTo(r.uitkomst, 2);
    expect(r.regel).toMatch(/→ klopt/);
  });

  test('g. blok 20 POTJE CONTANT zegt per periode of het getal een telling, een schatting of de opnames is', async ({ page }) => {
    /* in oktober loopt de salarisperiode 24-09 t/m 25-10 (in november staat de lopende periode niet in de tabel: geen salaris op 24-11 in de stand) */
    await S4.boot(page, { dag: '2026-10-16', opn: [['2026-10-12', -300]] });
    const L = await page.evaluate(() => diagSalarisVerdeling());
    const i = L.findIndex(l => /POTJE CONTANT \(v447/.test(l)), rows = L.slice(i + 2).filter(l => /^    \d\d-\d\d t\/m/.test(l));
    expect(rows.length).toBeGreaterThan(2);
    expect(rows.filter(l => !/\*/.test(l)).every(l => / · (OPNAMES \(geen telling|TELLING)/.test(l))).toBe(true);
    expect(rows.find(l => /\*/.test(l))).toMatch(/^    24-09 t\/m 25-10\* .*\| tot nu [\d.]+ · SCHATTING \(tempo [\d.]+ over 23 dagen, maximum begin \+ opnames \+ ontvangen − storting 300\.00; gepind 300\.00 telt niet als uitgegeven\)$/);
    expect(regel(L, /CONTANT PER MAAND \(v450/)).toMatch(/okt\* [\d.]+ schatting/);
    expect(regel(L, /CONTROLE maand \(punt 3\) = periode/)).toMatch(/→ sluit/);
    await S4.boot(page, { negRest: true });
    const M = await page.evaluate(() => diagSalarisVerdeling());
    expect(regel(M, /CONTANT PER MAAND \(v450/)).toMatch(/nov\* -100\.00 telling/);
  });
});

test.describe('3 · Laserbehandeling', () => {
  test('h. de termijn april 2027 blijft staan', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const R = (SET.reserveringen || []).find(x => x.naam === 'Laserbehandeling'); return R ? [R.vervalmaand, R.vanaf, R.bedrag, R.intervalM] : null; });
    expect(r).toEqual(['2027-04', '2026-11', 159, 6]);
    const L = await page.evaluate(() => diagSalarisVerdeling());
    expect(L.join('\n')).toMatch(/op de termijn \(apr 2027\) gereserveerd: 6 maanden \(nov 2026 t\/m apr 2027\)/);
  });
});

test.describe('4 · blok 25', () => {
  test('i. je eigen naam in een van de twee boekingen is genoeg, in de afschrijving of in de bijschrijving', async ({ page }) => {
    await boot(page);
    const j = await page.evaluate(({ MAIN }) => { const add = (d, a, n) => { const t = { id: 'v454p' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); };
      add('2026-09-05', -80, 'From Main to Buffer'); add('2026-09-05', 80, 'Ve Sumter');
      add('2026-08-05', -70, 'Ve Sumter'); add('2026-08-05', 70, 'Bakker Jansen');
      add('2026-07-05', -30, 'Bakker Jansen'); add('2026-07-05', 30, 'Bakker Jansen');
      save(); return diagEigenParen().join('\n'); }, { MAIN: S.MAIN });
    expect(j).toMatch(/\n      2026-09  1 · 80\.00/);
    expect(j).toMatch(/\n      2026-08  1 · 70\.00/);
    expect(j).not.toMatch(/\n      2026-07 /);
  });
});
