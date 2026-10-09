/* v370: DE INLEG VAN DE LOPENDE MAAND TELT MEE IN ELKE VOL-DATUM (gevraagd door de gebruiker, het open punt van v316).
   De stand is die van het toestel op 9 oktober 2026 (opschonen-stand): Noodfonds EUR 3.638 van EUR 4.000, inleg
   EUR 2.200, en Inrichting als tweede op volgorde. Tot v370 zei Plan "vol nov 2026" bij een buffer die met de EUR 362
   van oktober vol is. */
const { test, expect } = require('@playwright/test');
const P = require('./opschonen-stand');
const ORDE = { planOrder: ['noodfonds', 'iw', 'kk'] };
const rijTekst = (page, id) => page.evaluate((i) => { go('vooruit'); const r = document.querySelector(`.plan-item[data-id="${i}"] [data-planrechts]`); return r ? r.innerText : null; }, id);

test.describe('a · de lopende maand telt mee', () => {
  test('EUR 3.638 van 4.000 plus 362 in oktober is vol okt 2026', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const r = await page.evaluate(() => { const nf = allocatePlan().find((x) => x.id === 'noodfonds'); return { rest: nf.rest, alloc: nf.alloc, eta: nf.eta, lbl: etaDatum(nf.eta) }; });
    expect(r.rest).toBe(362); expect(r.alloc).toBe(362);
    expect(r.eta).toBe(1); expect(r.lbl).toBe('okt 2026');
    expect(await rijTekst(page, 'noodfonds')).toContain('vol okt 2026');
  });
  test('het doel erna krijgt 1.838 in oktober en de rest in november: vol nov 2026', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const r = await page.evaluate(() => { const iw = allocatePlan().find((x) => x.id === 'iw'); return { alloc: iw.alloc, lbl: etaDatum(iw.eta) }; });
    expect(r.alloc).toBe(1838); expect(r.lbl).toBe('nov 2026');
    expect(await rijTekst(page, 'iw')).toContain('vol nov 2026');
  });
  test('etaDatum(1) is deze maand, en een streefdatum in deze maand is niet verstreken', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const r = await page.evaluate(() => ({ e1: etaDatum(1), e8: etaDatum(8),
      mei: doelTempo({ streefdatum: '2027-05', doel: 8000, gespaard: 0 }, 1000),
      okt: doelTempo({ streefdatum: '2026-10', doel: 500, gespaard: 0 }, 500),
      sep: doelTempo({ streefdatum: '2026-09', doel: 500, gespaard: 0 }, 500) }));
    expect(r.e1).toBe('okt 2026'); expect(r.e8).toBe('mei 2027');
    expect(r.mei.maandenTot).toBe(8); expect(r.mei.benodigd).toBe(1000); expect(r.mei.gat).toBe(0);
    expect(r.okt.maandenTot).toBe(1); expect(r.okt.haalbaar).toBe(true);
    expect(r.sep).toBeNull();
  });
  test('de tijdlijn zet kolom 0 op deze maand met de verdeling van nu, en de rij zegt dezelfde maand', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const r = await page.evaluate(() => { const T = planTijdlijnData(); return { nf: T.per.noodfonds.maanden.slice(0, 2), iw: T.per.iw.maanden.slice(0, 3), volNf: T.per.noodfonds.vol, eerste: T.per.kk.eerste }; });
    expect(r.nf).toEqual([362, 0]); expect(r.iw).toEqual([1838, 1162, 0]);
    expect(r.volNf).toBe(1);
    expect(r.eerste).toBe(1);   // Kosten Koper begint in november (kolom 1)
    const st = await page.evaluate(() => { go('vooruit'); return document.querySelector('.plan-item[data-id="kk"] [data-planstatus]').innerText; });
    expect(st).toContain('nov 2026');
  });
  test('het totaal onder de waterval schuift mee', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const r = await page.evaluate(() => { const P2 = allocatePlan(); return { kk: etaDatum(P2.find((x) => x.id === 'kk').eta), tot: planTotaalRegel(P2).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }; });
    expect(r.tot).toContain('vol in ' + r.kk);
  });
});

test.describe('b · de inleg van deze maand telt een keer', () => {
  const STORT = "{ const o = { id: 'okt-in', date: '2026-10-06', amount: 2200, acc: 'NL01SAVE0000004323', name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(o); TX.push(o); } SET.manualBal['NL01SAVE0000004323'] = 3638 + 2200; save();";
  /* Binnen en via de app toegewezen: dan staat hij al in de stand van je doelen. */
  test('binnen en met Verdeel volgens je plan toegewezen: niet nog eens verdeeld', async ({ page }) => {
    await P.boot(page, { zonderOpname: true, set: ORDE });
    const r = await page.evaluate((st) => {
      eval(st);
      const voor = planInlegLopend(planCapacity());
      spaarVerdeelDoen();
      const P2 = allocatePlan(), iw = P2.find((x) => x.id === 'iw');
      return { voor, na: planInlegLopend(planCapacity()), t: SET.toewijzingMaand, nf: P2.find((x) => x.id === 'noodfonds').status,
        iwGespaard: iw.gespaard, lbl: etaDatum(iw.eta) };
    }, STORT);
    expect(r.voor).toBe(2200);                       // nog niets toegewezen: oktober telt mee
    expect(r.t).toEqual({ ym: '2026-10', bedrag: 2200 });
    expect(r.na).toBe(0);                            // toegewezen: oktober telt niet nog eens
    expect(r.nf).toBe('bereikt');
    expect(r.iwGespaard).toBe(1838);
    expect(r.lbl).toBe('nov 2026');                  // 1.162 te gaan, met de inleg van november
    /* de tijdlijn leest dezelfde projectie: in kolom 0 (oktober) krijgt Inrichting niets meer, hoewel de rij 1.162 per
       maand noemt; dat bedrag is volgende maand */
    const t = await page.evaluate(() => { const T = planTijdlijnData(); return { iw: T.per.iw.maanden.slice(0, 2), alloc: allocatePlan().find((x) => x.id === 'iw').alloc }; });
    expect(t.alloc).toBe(1162); expect(t.iw).toEqual([0, 1162]);
  });
  test('binnen en nog niet toegewezen: telt mee, de buffer is vol in oktober', async ({ page }) => {
    await P.boot(page, { zonderOpname: true, set: ORDE });
    const r = await page.evaluate((st) => { eval(st);
      const nf = allocatePlan().find((x) => x.id === 'noodfonds');
      return { vrij: spaarVrij().vrij, cap1: planInlegLopend(planCapacity()), lbl: etaDatum(nf.eta) }; }, STORT);
    expect(r.vrij).toBe(2200); expect(r.cap1).toBe(2200); expect(r.lbl).toBe('okt 2026');
  });
  /* De stand van het toestel: meer toegewezen dan er staat. Een saldo-afleiding las hier een nieuwe storting als al
     toegewezen; wat je toewees staat apart vast, dus de storting telt mee. */
  test('meer toegewezen dan er staat en een storting zonder toewijzing: oktober telt mee', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const r = await page.evaluate(() => {
      { const o = { id: 'okt-in', date: '2026-10-08', amount: 2431, acc: 'NL01SAVE0000004323', name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(o); TX.push(o); }
      SET.manualBal['NL01SAVE0000004323'] = 3000 + 2431; save();
      return { net: savedNet(thisYM()), cap1: planInlegLopend(planCapacity()), lbl: etaDatum(allocatePlan().find((x) => x.id === 'noodfonds').eta) };
    });
    expect(r.net).toBe(2200); expect(r.cap1).toBe(2200); expect(r.lbl).toBe('okt 2026');
  });
  test('een hogere stand in de doel-editor is een toewijzing van deze maand, een lagere niet', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const r = await page.evaluate(() => {
      openGoal('iw'); document.getElementById('gNu').value = '500'; saveGoal('iw');
      const a = SET.toewijzingMaand && SET.toewijzingMaand.bedrag;
      openGoal('iw'); document.getElementById('gNu').value = '200'; saveGoal('iw');
      return { a, b: SET.toewijzingMaand && SET.toewijzingMaand.bedrag };
    });
    expect(r.a).toBe(500); expect(r.b).toBe(500);
  });
});

test.describe('c · de Vermogensreis telt dezelfde maand', () => {
  test('M.sim.vol is per bestemming gelijk aan planVooruit()', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const r = await page.evaluate(() => { const M = reisModel(); return { sim: M.sim.vol, plan: planVooruit(allocatePlan(), planCapacity()) }; });
    /* Kosten Koper geeft op zijn streefdatum uit wat erin staat voordat hij vol is (v347/v348), dus alleen de twee die vol raken. */
    expect(r.sim.noodfonds).toBe(r.plan.noodfonds); expect(r.sim.iw).toBe(r.plan.iw);
    expect(r.plan.noodfonds).toBe(1); expect(r.plan.iw).toBe(2);
  });
});

test.describe('d · een terugzetting over drie maanden', () => {
  test('de delen die nog komen staan op november en december, maand 2 en 3 van de projectie', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const r = await page.evaluate(() => { terugzetKies('drie'); const T = terugzetProjectie(); const id = (v) => Object.keys(v || {}).map(Number);
      return { bij: id(T.bij), rest: T.rest, maanden: id(T.bij).map((m) => etaDatum(m)), helper: id(terugzetBijVan([5, 6], (d) => d)) }; });
    expect(r.bij).toEqual([2, 3]);
    expect(r.maanden).toEqual(['nov 2026', 'dec 2026']);
    expect(r.rest).toEqual({ noodfonds: 154 });
    expect(r.helper).toEqual([2, 3]);
  });
  test('de scenario\'s in de kaart lezen dezelfde helper', async ({ page }) => {
    await P.boot(page, { set: ORDE });
    const { kaalUit } = require('./bron-kaal');
    const src = await kaalUit(page, 'terugzetScenario', 'terugzetProjectie');
    expect(src.split('terugzetBijVan(').length - 1).toBe(2);
  });
});
