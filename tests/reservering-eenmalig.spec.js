/* v317: EEN EENMALIGE POST BINNEN HET VENSTER TELT MEE IN DE OPBOUW-EIS EN IN "BLIJFT OVER".
   HET GEMELDE GEVAL, gereproduceerd: met EUR 500 op de reserveringsrekening en een boete van
   EUR 299 eenmalig in november zei Plan "Blijft over EUR 500" terwijl die 299 volgende maand
   vertrekt. `dekking()` rekende `opgebouwd` alleen `if(x.intervalM>0)`, dus een eenmalige post droeg
   NUL in `benodigdeStand` en viel daarmee uit `graad` en uit `tekort`. Te gunstig is de gevaarlijke
   kant (v168).
   DE WATERVAL IN DEZELFDE FUNCTIE TELDE HEM AL VOLUIT (`run-=x.bedrag`), dus `gat` en `gedektTot`
   kenden die post en `benodigdeStand` niet: EEN functie met twee antwoorden over dezelfde post.
   DAARMEE ZEGGEN PLAN EN GRIP NU HETZELFDE, en dat is de eis van deze ronde. Beide schermen lezen
   `dekking(12)`: Plan drukt de stand, de posten en het verschil af, Grip het oordeel.
   DIT DRAAIT DE v131-REDENERING OM ("bij een eenmalige post hoeft er ook niets opgebouwd te zijn").
   Die blijft kloppen voor een post BUITEN het venster, en die valt per constructie al af in
   `verplichtingen()`; dat staat als eigen geval in blok c.
   EN "N POSTEN" TELT DEZELFDE VERZAMELING ALS DE RIJEN (blok d). `D.aantal` is de LIJST en `inVenster`
   de posten met een voorkomen binnen de horizon; de kop las de eerste boven rijen die uit de tweede
   komen. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', RES = 'NL01RESV0000007586';
const DAG = '2026-10-01';
const NOV = '2026-11', APR = '2027-04', MEI_OUD = '2026-05', VER = '2027-11';

function seed(o) {
  o = o || {};
  const tx = [
    { id: 'i1', date: '2026-09-03', amount: 4200, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
    { id: 'r1', date: '2026-09-08', amount: 25, acc: RES, name: 'Reservering', desc: 'NAAR RESERVERING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
  ];
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4200, bufferNorm: 2, budgetMonth: '2026-10',
    manualBal: Object.assign({ [MAIN]: 3000, [RES]: 500 }, o.bal || {}),
    resAcc: RES, resCheck: '2026-10',
    reserveringen: o.res !== undefined ? o.res
      : [{ id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: NOV, intervalM: 0 }],
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await pinDatum(page, (o && o.dag) || DAG);
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof dekking === 'function');
}
const D = (page) => page.evaluate(() => {
  const d = dekking(12);
  return { aantal: d.aantal, inVenster: d.inVenster, stand: d.werkelijkeStand,
    benodigdeStand: d.benodigdeStand, graad: d.graad, tekort: d.tekort,
    gedektTot: d.gedektTot, gat: d.gat,
    posten: d.regels.filter((x) => x.soort === 'post').map((x) => ({ n: x.naam, b: x.bedrag, m: x.maand, opg: x.opgebouwd })) };
});
const kaart = (page) => page.evaluate(() => {
  const el = document.createElement('div'); el.innerHTML = resDekkingCard();
  return el.innerText.replace(/\s+/g, ' ').trim();
});

/* ===== a) HET GEMELDE GEVAL ===== */
test.describe('a · het gemelde geval: EUR 500 en een boete van EUR 299 eenmalig in november', () => {
  test('de invoer is werkelijk een eenmalige post binnen het venster', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      iv: SET.reserveringen[0].intervalM,
      offset: resVolgende(SET.reserveringen[0]),
      V: verplichtingen(12).map((x) => ({ id: x.id, maand: x.maand, offset: x.offset, iv: x.intervalM })) }));
    expect(r.iv).toBe(0);                 // eenmalig
    expect(r.offset).toBe(1);             // november, één maand vooruit
    expect(r.V.length).toBe(1);           // en hij rolt één keer uit
  });

  test('zijn hele bedrag staat in de opbouw-eis', async ({ page }) => {
    await boot(page);
    const d = await D(page);
    expect(d.posten).toEqual([{ n: 'Boetes cjib', b: 299, m: NOV, opg: 299 }]);
    expect(d.benodigdeStand).toBe(299);
  });

  test('en "Blijft over" is EUR 201 en niet EUR 500', async ({ page }) => {
    await boot(page);
    const d = await D(page);
    expect(d.stand).toBe(500);
    expect(d.stand - d.benodigdeStand).toBe(201);
    const t = await kaart(page);
    expect(t).toContain('Blijft over');
    expect(t).toContain('€201');
    expect(t).not.toMatch(/Blijft over\s*€500/);
  });

  /* De twee helften van dezelfde functie zeiden iets anders over dezelfde post: de waterval trok
     hem voluit af en de opbouw-eis kende hem niet. Nu zeggen ze hetzelfde. */
  test('de waterval en de opbouw-eis zeggen hetzelfde over die post', async ({ page }) => {
    await boot(page);
    const d = await D(page);
    expect(d.gat).toBe(null);                 // 500 dekt de 299
    expect(d.gedektTot).toBe(NOV);
    expect(d.tekort).toBe(0);
    expect(d.graad).toBe(Math.round(500 / 299 * 100));   // en er IS een percentage
  });

  /* v131 zei dat er bij een eenmalige post geen percentage te delen valt. Dat was het gevolg van de
     nul die deze ronde weghaalt, en het stond als vastgelegde eigenschap in de bron. */
  test('graad was null en is nu een echt getal', async ({ page }) => {
    await boot(page, { bal: { [RES]: 100 } });
    const d = await D(page);
    expect(d.graad).toBe(33);
    expect(d.tekort).toBe(199);
  });
});

/* ===== b) PLAN EN GRIP ZEGGEN HETZELFDE ===== */
test.describe('b · Plan en Grip lezen dezelfde bron', () => {
  test('de dekking-regel op Grip en de kaart op Plan komen uit dezelfde dekking(12)', async ({ page }) => {
    await boot(page, { bal: { [RES]: 100 } });
    const r = await page.evaluate(() => {
      const d = dekking(12);
      const rij = (maandRegels() || []).find((x) => x.key === 'dekking') || {};
      return { graad: d.graad, tekort: d.tekort, gedektTot: d.gedektTot, gat: d.gat,
        status: rij.status, waarde: rij.waarde, eenheid: rij.eenheid,
        zin: String(rij.gevolg || '').replace(/<[^>]+>/g, '') };
    });
    expect(r.graad).toBe(33);
    expect(r.tekort).toBe(199);
    // de rij op Grip valt om op dezelfde post: 100 dekt de 299 niet. v323: november ligt na deze
    // maand, dus dat is aandacht en geen beslissing
    expect(r.status).toBe('let op');
    expect(r.gat).toMatchObject({ naam: 'Boetes cjib', bedrag: 299, tekort: 199 });
    expect(r.gedektTot).toBe(null);
    // en zijn zin noemt dezelfde maand, hetzelfde bedrag en hetzelfde tekort
    expect(r.zin).toContain('november 2026');
    expect(r.zin).toContain('€299');
    expect(r.zin).toContain('€199');
    // v323: de eenheid draagt het gat per maand uit dezelfde dekking(12): 199 over oktober en november
    expect(r.eenheid).toContain('€100 per maand tot november');
  });

  test('zonder de reparatie zou Grip zwijgen waar Plan een tekort toont', async ({ page }) => {
    /* De tegenproef op de EIGENSCHAP en niet op de oude code: met de post op een JAARinterval is de
       opbouw-eis pro rata, en dan lopen de twee getallen uiteen zonder dat een van beide nul is. */
    await boot(page, { bal: { [RES]: 100 },
      res: [{ id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: NOV, intervalM: 12 }] });
    const d = await D(page);
    expect(d.posten[0].opg).toBe(274);      // 299 x 11/12
    expect(d.benodigdeStand).toBe(274);
  });
});

/* ===== c) DE AFBAKENING: ALLEEN BINNEN HET VENSTER ===== */
test.describe('c · alleen binnen het venster', () => {
  test('een eenmalige post voorbij de horizon rolt niet uit en draagt dus niets', async ({ page }) => {
    await boot(page, { res: [{ id: 'p1', naam: 'Ver weg', bedrag: 5000, vervalmaand: VER, intervalM: 0 }] });
    const r = await page.evaluate(() => ({
      offset: resVolgende(SET.reserveringen[0]), V: verplichtingen(12).length, d: dekking(12) }));
    expect(r.offset).toBe(13);              // meer dan de horizon van 12
    expect(r.V).toBe(0);
    expect(r.d.benodigdeStand).toBe(0);
    expect(r.d.inVenster).toBe(0);
  });

  test('en een verstreken eenmalige post vervalt volledig', async ({ page }) => {
    await boot(page, { res: [{ id: 'p1', naam: 'Oude aanslag', bedrag: 800, vervalmaand: MEI_OUD, intervalM: 0 }] });
    const r = await page.evaluate(() => ({ offset: resVolgende(SET.reserveringen[0]), d: dekking(12) }));
    expect(r.offset).toBe(null);
    expect(r.d.benodigdeStand).toBe(0);
    expect(r.d.inVenster).toBe(0);
  });

  /* De pro-rata vorm is NIET aangeraakt, en dat is het verschil met een eenmalige post: een jaarpost
     bijna een jaar weg hoeft nog bijna niets opgebouwd te hebben, want er is nog een jaar om te
     sparen. Een eenmalige post heeft die noemer niet. */
  test('een jaarpost die bijna een jaar weg ligt vraagt nog bijna niets', async ({ page }) => {
    await boot(page, { res: [{ id: 'p1', naam: 'Premie', bedrag: 1200, vervalmaand: '2027-09', intervalM: 12 }] });
    const d = await D(page);
    expect(d.posten.length).toBe(1);
    expect(d.posten[0].opg).toBe(100);            // 1200 x 1/12
    expect(d.benodigdeStand).toBe(100);
  });

  test('en dezelfde post als EENMALIG vraagt zijn hele bedrag, want er is geen volgende termijn', async ({ page }) => {
    await boot(page, { res: [{ id: 'p1', naam: 'Premie', bedrag: 1200, vervalmaand: '2027-09', intervalM: 0 }] });
    const d = await D(page);
    expect(d.posten[0].opg).toBe(1200);
    expect(d.benodigdeStand).toBe(1200);
  });
});

/* ===== d) DE TELLING BOVEN DE RIJEN ===== */
test.describe('d · "N posten" telt dezelfde verzameling als de rijen', () => {
  const TWEE = [
    { id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: NOV, intervalM: 0 },
    { id: 'p2', naam: 'Oude aanslag', bedrag: 800, vervalmaand: MEI_OUD, intervalM: 0 },
  ];

  test('de invoer: twee posten in de lijst en één met een voorkomen', async ({ page }) => {
    await boot(page, { res: TWEE });
    const d = await D(page);
    expect(d.aantal).toBe(2);
    expect(d.inVenster).toBe(1);
    expect(d.posten.length).toBe(1);
  });

  test('de kop telt de rijen en noemt wat erbuiten valt', async ({ page }) => {
    await boot(page, { res: TWEE });
    const t = await kaart(page);
    expect(t).toContain('1 post · 1 zonder termijn dit jaar');
    expect(t).not.toContain('2 posten');
  });

  test('een kwartaalpost is EEN post met vier voorkomens', async ({ page }) => {
    await boot(page, { res: [{ id: 'p1', naam: 'Kwartaal', bedrag: 120, vervalmaand: NOV, intervalM: 3 }] });
    const d = await D(page);
    expect(d.posten.length).toBe(4);
    expect(d.inVenster).toBe(1);
    expect(await kaart(page)).toContain('1 post ·');
  });

  test('een post zonder bedrag krijgt zijn eigen reden', async ({ page }) => {
    await boot(page, { res: [
      { id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: NOV, intervalM: 0 },
      { id: 'p2', naam: 'Nog onbekend', bedrag: 0, vervalmaand: APR, intervalM: 12 }] });
    const d = await D(page);
    expect(d.aantal).toBe(2);
    expect(d.inVenster).toBe(1);
    const t = await kaart(page);
    expect(t).toContain('1 post · 1 zonder bedrag');
  });

  /* De lege lijst blijft op de LIJST beslissen en niet op het venster: met alleen een verstreken
     post heb je wél verplichtingen ingevoerd, en dan hoort er geen 'instellen'-kaart te staan. */
  test('met alleen een post buiten het venster staat er geen instellen-kaart', async ({ page }) => {
    await boot(page, { res: [{ id: 'p1', naam: 'Oude aanslag', bedrag: 800, vervalmaand: MEI_OUD, intervalM: 0 }] });
    const t = await kaart(page);
    expect(t).not.toContain('instellen');
    expect(t).toContain('0 posten · 1 zonder termijn dit jaar');
    expect(t).toContain('Er komt de komende twaalf maanden niets aan uit je lijst');
  });

  test('een echt lege lijst geeft wel de instellen-kaart', async ({ page }) => {
    await boot(page, { res: [] });
    expect(await kaart(page)).toContain('instellen');
  });
});

/* ===== e) GEEN MIN-TEKENS ===== */
test.describe('e · de posten dragen geen min-teken', () => {
  /* De rijen zouden als aftrekking lezen en dan niet optellen: stand min de posten is een ANDER
     getal dan het verschil dat eronder staat, want dat verschil is de stand min de OPBOUW-EIS.
     Gemeten op een jaarpost: 500 - 299 = 201, terwijl de opbouw-eis 274 is en er dus 226 staat.
     Dat is de vorm die v249/v250 verbieden. */
  test('met een jaarpost zou een min-teken niet optellen, en hij staat er niet', async ({ page }) => {
    await boot(page, { res: [{ id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: NOV, intervalM: 12 }] });
    const d = await D(page);
    expect(d.stand - d.posten[0].b).toBe(201);
    expect(d.stand - d.benodigdeStand).toBe(226);     // en dit is wat de kaart toont
    const h = await page.evaluate(() => resDekkingCard());
    expect(h).toContain('€299');
    expect(h).not.toContain('− €299');
    expect(h).not.toContain('-€299');
    expect(await kaart(page)).toContain('€226');
  });
});
