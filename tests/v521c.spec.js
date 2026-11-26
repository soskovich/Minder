/* v521c: Kiezen › "Dekking reserveringen: accepteren of oplossen" gaat dicht, en de stortingsafspraak wordt goed gemeten. Stand:
   tests/v521c-stand.js (24 nov, pot EUR 0, Laserbehandeling EUR 159 april 2027, ANWB EUR 123 november 2027, inleg EUR 36 per periode, de
   acceptatie van 6 nov met een ander bedrag; GECONSTRUEERD). De bedragen van 82e517c staan in tests/v521c-voor.json (generator
   tests/wip/v521c-voor-gen.spec.js). */
const { test, expect } = require('./klok');
const B = require('./v521c-stand');
const { bedragen } = require('./v521a-stand');
const V = require('./v428-boot');
const VOOR = require('./v521c-voor.json');

const regel = (page) => page.evaluate(() => { const r = maandRegels().find((x) => x.key === 'dekking'); const C = gripCyclusLees();
  return { status: r.status, gevolg: r.gevolg, kies: C.kies.map((x) => x.id) }; });
const kiezenDom = (page) => page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); const k = document.querySelector('[data-kies="accept:dekking"]');
  return { accept: !!k, al: [...document.querySelectorAll('#gripAlGekozen [data-afspraak]')].map((x) => x.dataset.afspraak + ':' + x.textContent.replace(/\s+/g, ' ').trim()) }; });

test.describe('v521c', () => {
  test('a: met inleg EUR 36 is Dekking ok en staat er geen keuze in Kiezen', async ({ page }) => {
    await B.boot(page);
    const r = await regel(page);
    const inv = await page.evaluate(() => { const D = dekking(12); return { stand: D.werkelijkeStand, gat: D.gat && D.gat.naam, inleg: D.inlegDekt && D.inlegDekt.inleg }; });
    expect(inv).toEqual({ stand: 0, gat: 'Laserbehandeling', inleg: 36 });   // de invoer: de pot alleen dekt de laser niet
    expect(r.status).toBe('ok');
    expect(r.kies).not.toContain('accept:dekking');
    expect((await kiezenDom(page)).accept).toBe(false);
  });

  test('b: zonder inleg staat de keuze er; na een afspraak of een aanpassing van je reserveringen is hij weg', async ({ page }) => {
    await B.boot(page, { inleg: 0 });
    let r = await regel(page);
    expect(r.status).toBe('let op');
    expect(r.kies).toContain('accept:dekking');
    expect((await kiezenDom(page)).accept).toBe(true);
    await page.evaluate(() => { afspraakDekkingZet(); window._gripCyc = null; });
    r = await regel(page);
    expect(r.kies).not.toContain('accept:dekking');
    const k = await kiezenDom(page);
    expect(k.accept).toBe(false);
    expect(k.al.join('|')).toMatch(/storting:✓€27 per maand naar je reserveringen tot april 2027● gekozen op 24 nov/);
    // ook gestopt telt als afgerond
    await page.evaluate(() => { const a = afsprakenLijst().find((x) => x.soort === 'storting'); afspraakStop(a.id); });
    expect((await regel(page)).kies).not.toContain('accept:dekking');
    // de andere route: "Dekking reserveringen aanpassen" en opslaan
    await B.boot(page, { inleg: 0 });
    expect((await regel(page)).kies).toContain('accept:dekking');
    await page.evaluate(() => { openReservering('r521c2'); saveReservering('r521c2'); closeSheet(); });
    r = await regel(page);
    expect(r.kies).not.toContain('accept:dekking');
    expect((await kiezenDom(page)).al.join('|')).toMatch(/reserveringen:✓Dekking reserveringen aangepast● gekozen op 24 nov/);
  });

  test('c: de tekst van het sheet noemt geen tekort als de inleg het dekt, en rekent met een aanname', async ({ page }) => {
    await B.boot(page);
    const t = await page.evaluate(() => { go('maand'); openMaandBeslis('dekking'); const s = document.getElementById('sheet').textContent.replace(/\s+/g, ' '); closeSheet(); return s; });
    expect(t).toContain('Met je inleg van €36 per periode staat er in april 2027 €180; Laserbehandeling van €159 is gedekt.');
    expect(t).not.toMatch(/tekort/);
    expect(t).not.toContain('nu al niet');
    expect(t).not.toContain('zonder inleg');
    // zonder inleg alleen de zin zonder inleg
    await B.boot(page, { inleg: 0 });
    const t0 = (await regel(page)).gevolg;
    expect(t0).toContain('Je pot dekt de eerstvolgende post nu al niet.');
    expect(t0).not.toContain('met je inleg');
  });

  test('d: storting EUR 36 op 25 nov en een betaling uit de pot EUR 1.000 in dezelfde periode: het vinkje gaat aan', async ({ page }) => {
    await B.boot(page, { dag: '2026-11-26', extra: [{ acc: 'RES', d: '2026-11-25', a: 36, n: 'Eigen rekening', ds: 'Overboeking naar reserveringen' }, { acc: 'RES', d: '2026-11-25', a: -1000, n: 'Advocatenkantoor', ds: 'iDEAL Advocatenkantoor voorschot', cat: 'overig' }] });
    const r = await page.evaluate(() => { const a = afspraakMaak({ soort: 'storting', bedrag: 27, van: thisYM(), tot: '2027-04', wat: '€27 per maand naar je reserveringen tot april 2027' }); save();
      const S = afspraakStand(a); openAfspraak(a.id); const box = document.querySelector('#sheet [data-box]').dataset.box; closeSheet();
      return { net: resThisMonth('2026-11'), status: S.status, per: S.per.map((x) => [x.label, x.g]), box }; });
    expect(r.net).toBeLessThan(0);   // de invoer: netto ging er meer af dan erbij kwam
    expect(r.per).toEqual([['24 nov – 23 dec', 36]]);
    expect(r.status).toBe('gezien');
    expect(r.box).toBe('aan');
  });

  test('e: een storting op 25 nov telt voor 24 nov – 23 dec en niet voor november (1–23)', async ({ page }) => {
    await B.boot(page, { dag: '2026-11-26', extra: [{ acc: 'RES', d: '2026-11-25', a: 36, n: 'Eigen rekening', ds: 'Overboeking naar reserveringen' }] });
    const r = await page.evaluate(() => { const a = afspraakMaak({ soort: 'storting', bedrag: 27, van: '2026-11', tot: '2027-04', wat: 'x' }); a.op = '2026-11-20'; save();
      const S = afspraakStand(a); return { per: S.per.map((x) => [x.label, x.g]), feit: S.feit }; });
    expect(r.per).toEqual([['november (1–23)', 0], ['24 nov – 23 dec', 36]]);   // de betaling van de advocaat (20 nov) telt niet als min
    expect(r.feit).toBe('storting in november (1–23) nog niet gezien');
  });

  test('f: "lijkt te kloppen" staat in Terugblik en niet in Kiezen; "klopt niet" staat in Kiezen met de vraag', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { SET.budgetHist = Object.assign({}, SET.budgetHist); const h = SET.budgetHist['2026-09'] = Object.assign({}, SET.budgetHist['2026-09'] || SET.budgets); h.vices = 200;
      afspraakMaak({ soort: 'gedrag', oorzaak: 'gevoel', key: 'oorz:cat:vices', cat: 'vices', wat: 'x', titel: 'Vices bij spanning', van: '2026-09', tot: '2026-09' }); save(); window._gripCyc = null; });
    const lijkt = await page.evaluate(() => { const C = gripCyclusLees(); go('maand'); gripKiesTab('kiezen'); const k = document.querySelectorAll('#gripMee [data-terugcheck]').length;
      gripKiesTab('terugblik'); const el = document.querySelector('#gripKlopteOorzaak [data-lijktkloppen]'); return { tc: C.TC.map((t) => t.stand), k, t: el ? el.textContent.replace(/\s+/g, ' ').trim() : null }; });
    expect(lijkt.tc).toEqual(['lijkt']);
    expect(lijkt.k).toBe(0);
    expect(lijkt.t).toMatch(/^Gevoel hielp: Vices boven budget €\d+ minder \(.+ → .+\)$/);
    await V.boot(page);
    await page.evaluate(() => { SET.kennis['oorzaak|cat:vices'] = { soort: 'oorzaak', partij: 'Vices', wat: 'gevoel', aard: 'gevoel', bron: 'jij', op: '2026-09-02' };
      afspraakMaak({ soort: 'gedrag', oorzaak: 'gevoel', key: 'oorz:cat:vices', cat: 'vices', wat: 'eerst 10 minuten', titel: 'Vices bij spanning: eerst 10 minuten', van: '2026-09', tot: '2026-09' }); save(); window._gripCyc = null; });
    const niet = await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); const L = [...document.querySelectorAll('#gripMee [data-terugcheck]')]; return L.map((x) => x.textContent.replace(/\s+/g, ' ')); });
    expect(niet.length).toBe(1);
    expect(niet[0]).toContain('Was het iets anders?');
  });

  test('g: alle bedragen op Home, Inzichten, Grip, Plan en Vermogen zijn gelijk aan 82e517c', async ({ page }) => {
    test.setTimeout(90000);
    for (const [n, o] of [['inleg', {}], ['zonder', { inleg: 0 }]]) {
      await B.boot(page, o);
      const u = await bedragen(page);
      for (const k of ['home', 'ins', 'insSplit', 'grip-zien', 'grip-begrijpen', 'gripSplit', 'vermogen']) expect([n, k, u[k]]).toEqual([n, k, VOOR[n][k]]);   // v524: 'plan' is nu de lagen-invariant
      expect(await require('./plan-lagen-invariant').planLagenInvariant(page)).toMatchObject({ ok: true });
      /* v523 (punt 4): de reserveringen tellen per salarisperiode tot de vervaldag; alleen dat bedrag (en opzij, salaris min de rest) verschuift,
         de rekeningen niet, en opzij + reserveringen blijft gelijk */
      expect([n, u.P.rek, u.P.som, u.P.opzij + u.P.res]).toEqual([n, VOOR[n].P.rek, VOOR[n].P.som, VOOR[n].P.opzij + VOOR[n].P.res]);
    }
  });
});
