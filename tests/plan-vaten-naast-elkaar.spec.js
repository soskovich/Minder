/* v318: DE VERTAKTE WATERVAL, MET DE VATEN NAAST ELKAAR EN OP SCHAAL.
   Tot v317 stonden de bestemmingen onder elkaar met een horizontale tak per rij. Het ontwerp zet ze
   NAAST elkaar: een inlegbalk bovenin, verticale takken waarvan de DIKTE het maandbedrag is, en
   daaronder een vat per bestemming waarvan de HOOGTE het doelbedrag is.
   WAT v248 WEGHAALDE KOMT HIERMEE DEELS TERUG, en dat is een bewuste omkering met een gemeten
   grond: v248 haalde de schaal weg omdat een leeg vat van 300px in een GESTAPELDE kolom alleen
   zegt dat een doel ver weg is, en daar de hoogte van elke bestemming bij de hoogte van de vorige
   optelde. Naast elkaar delen de vaten EEN hoogte, en is het verschil tussen twee vaten juist wat
   je wilt zien. Wat v248 kocht (voortgang onderling vergelijkbaar) is daarmee ingeruild voor
   omvang onderling vergelijkbaar; dat staat als besluit in CLAUDE.md.
   DE BODEM IS GEMARKEERD (v246 terug): met 15.000 tegen 3.000 komt het kleine vat onder VAT_MIN en
   staat het dus NIET op schaal. Dat zegt het met een gestippelde bovenrand en een regel voor de
   schermlezer, in plaats van stil een verkeerde verhouding te tonen.
   DE TEKST SCHAALT NIET MEE (besluit v318): de vaten, takken en balk volgen de breedte van het
   scherm, de tekst houdt de vaste graad van de app. Daarom is dit CSS en geen SVG met een viewBox:
   in een geschaalde viewBox schaalt `font-size` mee, en dan leest dezelfde regel op 360px kleiner
   dan op 390px. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
const MS = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'];
const DAG = '2026-10-01';

function seed(o) {
  const cap = o.cap || 2200;
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m) => { add(m, '03', 4200, 'Werkgever', 'SALARIS LOON');
    add(m, '04', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '06', cap, 'Spaarpot', 'NAAR SPAREN', SAV); });
  const set = Object.assign({
    mode: 'begeleid', autoIncome: false, income: 4200, limit: 70, bufferNorm: 2, nfMaanden: 3,
    savingsEnds: ['4323'], manualBal: { [MAIN]: 3000, [SAV]: 30000 },
    budgets: { huur: 900 }, budgetsNext: {}, budgetMonth: '2026-10',
    savingMode: 'amount', savingAmount: cap,
    nfDoelVast: 4000, nfToegewezen: 4000, nfToegewezenMigrated: 1,
    planOrder: o.order, goals: o.goals,
  }, o.set || {});
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, o) {
  await pinDatum(page, o.dag || DAG);
  if (o.breedte) await page.setViewportSize({ width: o.breedte, height: o.hoogte || 800 });
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof planVatHoogten === 'function');
  await page.evaluate(() => go('vooruit'));
}
const vaten = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf-vat')]
  .map((v) => { const b = v.getBoundingClientRect();
    return { id: v.dataset.vat, h: +v.dataset.h, px: Math.round(b.height),
      x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width),
      klem: v.classList.contains('wf-klem') }; }));
const takken = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf-kol')]
  .map((k) => { const i = k.querySelector('.wf-tak i');
    return { id: k.dataset.id, dikte: i ? +i.getBoundingClientRect().width.toFixed(1) : null }; }));

/* de stand van het toestel: het noodfonds is vol en krijgt dus een regel, twee doelen een vat */
const TOESTEL = { cap: 2200, order: ['noodfonds', 'kk', 'iw'], goals: [
  { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 90 },
  { id: 'iw', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'pct', pct: 10 }] };
/* dezelfde vorm, maar met een verhouding die de bodem NIET raakt: zonder dit geval is "het vat is
   geklemd" niet te onderscheiden van "elk klein vat is geklemd" (meetles o) */
const RUIM = { cap: 2200, order: ['noodfonds', 'kk', 'iw'], goals: [
  { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2028-05', allocMode: 'pct', pct: 60 },
  { id: 'iw', naam: 'Inrichting woning', doel: 7500, gespaard: 0, streefdatum: '2028-03', allocMode: 'pct', pct: 40 }] };

/* ===== a) HET AANTAL KOLOMMEN IS HET AANTAL VATEN, TOT DRIE ===== */
test.describe('a · naast elkaar, en het aantal kolommen volgt het aantal vaten', () => {
  test('twee vaten staan naast elkaar: gelijke bovenkant, verschillende x', async ({ page }) => {
    await boot(page, TOESTEL);
    const V = await vaten(page);
    expect(V.map((v) => v.id)).toEqual(['kk', 'iw']);
    // naast elkaar: dezelfde y (ze hangen aan dezelfde balk), een andere x
    expect(V[0].y).toBe(V[1].y);
    expect(V[1].x).toBeGreaterThan(V[0].x + V[0].w);
  });

  test('het noodfonds is vol, dus het is een regel en geen vat', async ({ page }) => {
    await boot(page, TOESTEL);
    const r = await page.evaluate(() => ({
      vaten: [...document.querySelectorAll('#s-vooruit .wf-vat')].map((v) => v.dataset.vat),
      regel: !!document.querySelector('#s-vooruit .vat-vol'),
      regelTekst: document.querySelector('#s-vooruit .vat-vol')?.innerText.replace(/\s+/g, ' ').trim(),
    }));
    expect(r.vaten).not.toContain('noodfonds');
    expect(r.regel).toBe(true);
    expect(r.regelTekst).toContain('Noodfonds');
  });

  test('vier vaten geven drie kolommen en een tweede rij', async ({ page }) => {
    await boot(page, { cap: 2200, order: ['noodfonds', 'a', 'b', 'c', 'd'], goals: [
      { id: 'a', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'auto' },
      { id: 'b', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'auto' },
      { id: 'c', naam: 'Vakantie', doel: 2500, gespaard: 900, streefdatum: '2027-08', allocMode: 'auto' },
      { id: 'd', naam: 'Auto', doel: 9000, gespaard: 1200, streefdatum: '2028-02', allocMode: 'auto' }] });
    const r = await page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf')]
      .map((w) => ({ kol: getComputedStyle(w).gridTemplateColumns.split(' ').length,
        vaten: [...w.querySelectorAll('.wf-vat')].map((v) => v.dataset.vat) })));
    expect(r.length).toBe(2);                       // twee rasterrijen
    expect(r[0].kol).toBe(3);
    expect(r[0].vaten.length).toBe(3);
    expect(r[1].vaten.length).toBe(1);
  });

  test('planVatKolommen is de ene regel en klemt op drie', async ({ page }) => {
    await boot(page, TOESTEL);
    const r = await page.evaluate(() => [0, 1, 2, 3, 4, 7].map((n) => planVatKolommen(n)));
    expect(r).toEqual([1, 1, 2, 3, 3, 3]);
  });
});

/* ===== b) DE HOOGTE IS HET DOELBEDRAG, EN DE BODEM IS GEMARKEERD ===== */
test.describe('b · de schaal, en de markering waar hij wordt geklemd', () => {
  test('het grootste doel krijgt VAT_MAX en de rest zijn aandeel', async ({ page }) => {
    await boot(page, RUIM);
    const V = await vaten(page);
    const max = await page.evaluate(() => VAT_MAX);
    const kk = V.find((v) => v.id === 'kk'), iw = V.find((v) => v.id === 'iw');
    expect(kk.h).toBe(max);
    // 7.500 van 15.000 is de helft, en dat is wat het vat laat zien
    expect(iw.h).toBe(Math.round(max / 2));
    expect(kk.px).toBe(max);
    expect(iw.px).toBe(Math.round(max / 2));
    expect(kk.klem).toBe(false);
    expect(iw.klem).toBe(false);
  });

  test('onder de bodem wordt geklemd, en dat vat zegt dat het niet op schaal staat', async ({ page }) => {
    await boot(page, TOESTEL);
    const V = await vaten(page);
    const [max, min] = await page.evaluate(() => [VAT_MAX, VAT_MIN]);
    const kk = V.find((v) => v.id === 'kk'), iw = V.find((v) => v.id === 'iw');
    // 3.000 van 15.000 is een vijfde: 36px, dus onder de bodem van 40
    expect(Math.round(3000 / 15000 * max)).toBeLessThan(min);
    expect(iw.h).toBe(min);
    expect(iw.klem).toBe(true);
    expect(kk.klem).toBe(false);
    const uitleg = await page.evaluate(() =>
      [...document.querySelectorAll('#s-vooruit .sr-only')].map((e) => e.textContent).join(' | '));
    expect(uitleg).toContain('niet op schaal');
  });

  test('de getoonde verhouding is de echte zolang er niets klemt, en wijkt af zodra er wel iets klemt',
    async ({ page }) => {
      await boot(page, RUIM);
      const A = await vaten(page);
      expect(A[0].h / A[1].h).toBeCloseTo(15000 / 7500, 2);     // 2:1, en het beeld zegt 2:1
      await boot(page, TOESTEL);
      const B = await vaten(page);
      expect(15000 / 3000).toBe(5);
      expect(B[0].h / B[1].h).toBeCloseTo(4.5, 2);              // 180/40, en dus NIET 5
      expect(B[1].klem).toBe(true);                             // daarom staat de markering er
    });

  test('de vaten hangen aan de balk: boven uitgelijnd, en de bodem verschilt', async ({ page }) => {
    await boot(page, TOESTEL);
    const V = await vaten(page);
    expect(V[0].y).toBe(V[1].y);
    expect(V[0].y + V[0].px).toBeGreaterThan(V[1].y + V[1].px);
  });
});

/* ===== c) DE TAK IS HET MAANDBEDRAG IN DIKTE ===== */
test.describe('c · de tak draagt het maandbedrag', () => {
  test('de dikte volgt de verhouding van de maandbedragen', async ({ page }) => {
    await boot(page, TOESTEL);
    const T = await takken(page);
    const alloc = await page.evaluate(() => { const m = {};
      allocatePlan().forEach((p) => { m[p.id] = Math.round(p.alloc); }); return m; });
    expect(alloc.kk).toBe(1980);
    expect(alloc.iw).toBe(220);
    const kk = T.find((t) => t.id === 'kk'), iw = T.find((t) => t.id === 'iw');
    // 1,4px per 100 euro, zoals het ontwerp; afronding op hele pixels
    expect(kk.dikte).toBe(Math.round(1980 * 0.014));
    expect(iw.dikte).toBe(Math.round(220 * 0.014));
    expect(kk.dikte / iw.dikte).toBeGreaterThan(8);
  });

  test('een bestemming die niets krijgt heeft geen tak', async ({ page }) => {
    await boot(page, { cap: 2200, order: ['noodfonds', 'kk', 'iw'], goals: [
      { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'vast', perMaand: 2200 },
      { id: 'iw', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'auto' }] });
    const T = await takken(page);
    expect(T.find((t) => t.id === 'kk').dikte).toBeGreaterThan(0);
    expect(T.find((t) => t.id === 'iw').dikte).toBe(null);
  });

  test('planTakDikte is de ene uitdrukking, met een ondergrens', async ({ page }) => {
    await boot(page, TOESTEL);
    const r = await page.evaluate(() => [0, 50, 100, 220, 1980, 2200].map((a) => planTakDikte(a)));
    expect(r).toEqual([2, 2, 2, 3, 28, 31]);
  });
});

/* ===== d) DE TERUGVAL KOMT UIT planTerugval(), OOK IN RICHTING ===== */
test.describe('d · de terugval', () => {
  test('de richting komt uit de projectie en ligt niet vast in de vorm', async ({ page }) => {
    await boot(page, TOESTEL);
    const a = await page.evaluate(() => planTerugval().map((e) => e.van + '>' + e.naar));
    expect(a).toEqual(['kk>iw']);          // het GROTE doel is eerder vol en geeft
    const regel = await page.evaluate(() =>
      document.querySelector('#s-vooruit [data-erfregel]')?.innerText.replace(/\s+/g, ' ').trim());
    expect(regel).toContain('Kosten Koper');
    expect(regel).toContain('Inrichting woning');
    expect(regel).toMatch(/vanaf \w+ \d{4}/);

    // en omgekeerd: een klein doel dat eerder vol is geeft aan het grote
    await boot(page, { cap: 2500, order: ['noodfonds', 'kk', 'iw'], goals: [
      { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'vast', perMaand: 1980 },
      { id: 'iw', naam: 'Inrichting woning', doel: 1560, gespaard: 0, streefdatum: '2027-04', allocMode: 'vast', perMaand: 520 }] });
    const b = await page.evaluate(() => planTerugval().map((e) => e.van + '>' + e.naar));
    expect(b).toEqual(['iw>kk']);
  });

  test('de lijn loopt van de gever naar de ontvanger, met een pijl op de ontvanger', async ({ page }) => {
    await boot(page, TOESTEL);
    const r = await page.evaluate(() => {
      const erf = document.querySelector('#s-vooruit .wf-erf');
      return { van: erf.querySelector('[data-erf-van]')?.dataset.erfVan,
        naar: erf.querySelector('[data-erf-naar]')?.dataset.erfNaar,
        stippel: [...erf.querySelectorAll('i.v,i.h')].map((e) => getComputedStyle(e).borderLeftStyle + '/' + getComputedStyle(e).borderTopStyle),
        delen: erf.querySelectorAll('i').length };
    });
    expect(r.van).toBe('kk');
    expect(r.naar).toBe('iw');
    expect(r.delen).toBe(4);                       // stomp omlaag, dwars, stomp omhoog, pijl
    expect(r.stippel.join(' ')).toContain('dashed');
  });

  test('tussen twee rasterrijen staat de regel wel en de lijn niet', async ({ page }) => {
    await boot(page, { cap: 2200, order: ['noodfonds', 'a', 'b', 'c', 'd'], goals: [
      { id: 'a', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'auto' },
      { id: 'b', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'auto' },
      { id: 'c', naam: 'Vakantie', doel: 2500, gespaard: 900, streefdatum: '2027-08', allocMode: 'auto' },
      { id: 'd', naam: 'Auto', doel: 9000, gespaard: 1200, streefdatum: '2028-02', allocMode: 'auto' }] });
    const r = await page.evaluate(() => {
      const tv = planTerugval();
      const rijVan = {}; [...document.querySelectorAll('#s-vooruit .wf')].forEach((w, i) =>
        [...w.querySelectorAll('.wf-vat')].forEach((v) => { rijVan[v.dataset.vat] = i; }));
      const over = tv.filter((e) => rijVan[e.van] !== rijVan[e.naar]);
      return { tv: tv.map((e) => e.van + '>' + e.naar), over: over.map((e) => e.van + '>' + e.naar),
        regels: [...document.querySelectorAll('#s-vooruit [data-erfregel]')].map((e) => e.dataset.erfregel),
        lijnen: [...document.querySelectorAll('#s-vooruit .wf-erf [data-erf-van]')].map((e) => e.dataset.erfVan) };
    });
    // de invoer: er IS een overdracht die twee rasterrijen kruist
    expect(r.over.length).toBeGreaterThan(0);
    for (const e of r.over) {
      const van = e.split('>')[0];
      expect(r.regels).toContain(van);      // de regel staat er
      expect(r.lijnen).not.toContain(van);  // de lijn niet
    }
  });
});

/* ===== e) DE TEKST SCHAALT NIET MEE, DE VATEN WEL ===== */
test.describe('e · de tekst houdt zijn graad, het beeld schaalt', () => {
  test('dezelfde tekstgrootte op 360 en 390, terwijl het vat meeschaalt', async ({ page }) => {
    await boot(page, Object.assign({ breedte: 360 }, TOESTEL));
    const a = await page.evaluate(() => ({
      naam: getComputedStyle(document.querySelector('#s-vooruit .wf-naam')).fontSize,
      dat: getComputedStyle(document.querySelector('#s-vooruit .wf-tekst .small')).fontSize,
      vatB: Math.round(document.querySelector('#s-vooruit .wf-vat').getBoundingClientRect().width),
      vatH: Math.round(document.querySelector('#s-vooruit .wf-vat').getBoundingClientRect().height) }));
    await boot(page, Object.assign({ breedte: 390 }, TOESTEL));
    const b = await page.evaluate(() => ({
      naam: getComputedStyle(document.querySelector('#s-vooruit .wf-naam')).fontSize,
      dat: getComputedStyle(document.querySelector('#s-vooruit .wf-tekst .small')).fontSize,
      vatB: Math.round(document.querySelector('#s-vooruit .wf-vat').getBoundingClientRect().width),
      vatH: Math.round(document.querySelector('#s-vooruit .wf-vat').getBoundingClientRect().height) }));
    expect(a.naam).toBe(b.naam);
    expect(a.dat).toBe(b.dat);
    expect(b.vatB).toBeGreaterThan(a.vatB);    // de breedte volgt het scherm
    expect(a.vatH).toBe(b.vatH);               // de hoogte is het doelbedrag en niet het scherm
  });
});

/* ===== f) NAMEN WORDEN NIET AFGEKAPT ===== */
test.describe('f · een naam loopt door in plaats van af te kappen', () => {
  test('geen ellipsis en geen nowrap op de naam onder een vat', async ({ page }) => {
    await boot(page, Object.assign({ breedte: 360 }, TOESTEL));
    const r = await page.evaluate(() => {
      const n = [...document.querySelectorAll('#s-vooruit .wf-naam')]
        .find((e) => e.textContent.includes('Inrichting woning'));
      const cs = getComputedStyle(n);
      return { ellipsis: cs.textOverflow, wrap: cs.whiteSpace,
        afgekapt: n.scrollWidth > n.clientWidth + 1, tekst: n.textContent.trim() };
    });
    expect(r.ellipsis).not.toBe('ellipsis');
    expect(r.wrap).not.toBe('nowrap');
    expect(r.afgekapt).toBe(false);
    expect(r.tekst).toContain('Inrichting woning');
  });
});

/* ===== g) KORTE VORMEN IN EEN SMALLE KOLOM ===== */
test.describe('g · de woordvorm volgt de kolombreedte', () => {
  test('twee kolommen de lange vorm, drie kolommen de korte', async ({ page }) => {
    await boot(page, TOESTEL);
    const breed = await page.evaluate(() =>
      document.querySelector('#s-vooruit .wf-tekst').innerText.replace(/\s+/g, ' '));
    expect(breed).toContain('moet in mei 2027');
    expect(breed).toContain('maand te laat');

    await boot(page, { cap: 2200, order: ['noodfonds', 'kk', 'iw', 'va'], goals: [
      { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 80 },
      { id: 'iw', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'pct', pct: 10 },
      { id: 'va', naam: 'Vakantie', doel: 2500, gespaard: 0, streefdatum: '2027-08', allocMode: 'pct', pct: 10 }] });
    const smal = await page.evaluate(() =>
      document.querySelector('#s-vooruit .wf-tekst').innerText.replace(/\s+/g, ' '));
    expect(smal).toContain('streef mei 2027');
    expect(smal).not.toContain('moet in mei 2027');
    expect(smal).toContain('mnd te laat');
  });

  test('doelDatumLabel is de ene formatter, met dezelfde korte maand als etaDatum', async ({ page }) => {
    await boot(page, TOESTEL);
    const r = await page.evaluate(() => ({
      lang: doelDatumLabel('2027-03'), kort: doelDatumLabel('2027-03'.replace('x', ''), true),
      eta: (() => { const d = new Date(2027, 2, 1);
        return d.toLocaleDateString('nl-NL', { month: 'short', year: 'numeric' }).replace('.', ''); })() }));
    expect(r.lang).toBe('maart 2027');
    expect(r.kort).toBe('mrt 2027');
    expect(r.kort).toBe(r.eta);     // en dus niet 'maa 2027'
  });
});

/* ===== h) EEN ZICHTBARE CIRKEL IN DE KOP ===== */
test.describe('h · de kop draagt een icoon en niet drie', () => {
  test('een cirkel, bij de notitie, en de term houdt zijn stippellijn', async ({ page }) => {
    await boot(page, Object.assign({ breedte: 360 }, TOESTEL));
    const r = await page.evaluate(() => {
      const kaart = [...document.querySelectorAll('#s-vooruit .card')]
        .find((c) => c.querySelector('.inleg-balk'));
      const kop = kaart.querySelector('.row');
      const spans = [...kop.querySelectorAll('span.jrg')];
      let cirkels = 0;
      for (const e of spans) {
        if (e.textContent.indexOf(String.fromCharCode(0x24D8)) >= 0) cirkels++;
        const na = getComputedStyle(e, '::after').content;
        if (na && na.indexOf(String.fromCharCode(0x24D8)) >= 0) cirkels++;
      }
      const term = spans.find((e) => e.textContent.trim() === 'spaarinleg');
      return { cirkels, hoogte: Math.round(kop.getBoundingClientRect().height),
        termStippel: term ? getComputedStyle(term).borderBottomStyle : null };
    });
    expect(r.cirkels).toBe(1);
    expect(r.termStippel).toBe('dotted');
    // en daarmee breekt de kop niet meer over twee regels op 360px
    expect(r.hoogte).toBeLessThan(30);
  });
});

/* ===== i) DE PRIJS IN PIXELS ===== */
/* drie vaten, dus de smalste kolom die deze vorm kan maken (77px op 360, 86 op 390) */
const DRIE3 = { cap: 2200, order: ['noodfonds', 'kk', 'iw', 'va'], goals: [
  { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 60 },
  { id: 'iw', naam: 'Inrichting woning', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'pct', pct: 30 },
  { id: 'va', naam: 'Vakantie', doel: 900, gespaard: 0, streefdatum: '2027-08', allocMode: 'pct', pct: 10 }] };

/* ===== h2) NIETS STEEKT BUITEN ZIJN KOLOM =====
   DEZE EIGENSCHAP IS DOOR EEN SCHERMAFDRUK GEVONDEN EN NIET DOOR DE SUITE, en dat is de reden dat
   hij hier als eigen groep staat. Het maandbedrag stond naast de tak met `position:absolute` vanaf
   de middenlijn en `white-space:nowrap`, en liep daarmee zichtbaar over de BUURKOLOM heen. De 125
   tests over deze kaart bleven groen: geen enkele vroeg of een absoluut geplaatst element binnen
   zijn kolom blijft, en een overflow-meting op de zone ziet het niet omdat de kaart afkapt.
   DE MEETPLEK IS DE RECHTERRAND tegen die van de kolom, en niet de breedte van de kaart. */
test.describe('h2 · niets steekt buiten zijn kolom', () => {
  for (const [W, H] of [[360, 640], [390, 844]]) {
    for (const [naam, fx] of [['twee doelen', TOESTEL], ['drie doelen', DRIE3]]) {
      test(`${naam} op ${W}px: elk element blijft binnen zijn kolom`, async ({ page }) => {
        await boot(page, Object.assign({ breedte: W, hoogte: H }, fx));
        const r = await page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf-kol')]
          .map((kol) => {
            const k = kol.getBoundingClientRect();
            return { id: kol.dataset.id, over: [...kol.querySelectorAll('*')]
              .filter((e) => e.offsetParent !== null)
              .map((e) => { const b = e.getBoundingClientRect();
                return { tag: e.className || e.tagName, l: Math.round(k.left - b.left),
                  r: Math.round(b.right - k.right) }; })
              .filter((x) => x.r > 1 || x.l > 1) };
          }));
        for (const kol of r) {
          expect(kol.over, `${kol.id}: ` + JSON.stringify(kol.over)).toEqual([]);
        }
        // de invoer: er STAAT iets in die kolom, anders meet de eis niets
        expect(await page.locator('#s-vooruit .wf-kol .wf-vat').count()).toBeGreaterThan(0);
      });
    }
  }
});

test.describe('i · wat deze vorm kost', () => {
  for (const [W, H] of [[360, 640], [390, 844]]) {
    test(`de hoogtes op ${W}px staan vast`, async ({ page }) => {
      await boot(page, Object.assign({ breedte: W, hoogte: H }, TOESTEL));
      const r = await page.evaluate(() => {
        const kaart = [...document.querySelectorAll('#s-vooruit .card')]
          .find((c) => c.querySelector('.inleg-balk'));
        const h = (s) => { const e = kaart.querySelector(s);
          return e ? Math.round(e.getBoundingClientRect().height) : null; };
        return { kaart: Math.round(kaart.getBoundingClientRect().height),
          kop: h('.row'), noodfonds: h('.vat-vol'), wf: h('.wf'),
          kolom: h('.wf-kol'), tekst: h('.wf-tekst') };
      });
      // de kolom is de tak plus het hoogste vat, en dat is de prijs van de schaal
      expect(r.kolom).toBe(44 + 180);
      expect(r.kop).toBeLessThan(30);
      // de kaart blijft onder een halve meter aan pixels; het getal zelf staat in CLAUDE.md
      expect(r.kaart).toBeGreaterThan(500);
      expect(r.kaart).toBeLessThan(720);
    });
  }
});

/* ===== j) DE TEKST STAAT IN HET VAT, EN ELKE KOLOM DRAAGT ZIJN EIGEN HOOGTE =====
   Dit is de wissel die de hoogte van v318 terugbrengt. De eerste vorm van deze ronde zette alle
   tekst in een EIGEN rasterrij ONDER de vaten, en dat kostte 171px op 360 en 173 op 390 tegenover
   v317. Het ontwerp zet de tekst IN het vat.
   ER WORDT NIETS OPGEMETEN EN ER WORDT GEEN REGEL GETELD (v317): het vat is een absoluut
   achtergrondvlak binnen de box en de tekst stroomt er normaal doorheen vanaf de BOVENKANT van dat
   vat. Wat binnen de hoogte van dat vat past staat er dus in, en de rest loopt eronder door. Bij een
   hoog vat is dat alles, bij een geklemd vat alleen de naam.
   DE DRIE EISEN STAAN HIER ELK ALS EIGEN TEST, want ze kunnen los van elkaar breken. */
test.describe('j · de tekst in het vat', () => {
  const posities = (page) => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf-kol')]
    .map((k) => { const v = k.querySelector('.wf-vat').getBoundingClientRect();
      const t = k.querySelector('.wf-tekst').getBoundingClientRect();
      const b = k.querySelector('.wf-vatbox').getBoundingClientRect();
      return { id: k.dataset.id, vatTop: Math.round(v.top), vatBot: Math.round(v.bottom),
        tekstTop: Math.round(t.top), tekstBot: Math.round(t.bottom),
        vat: Math.round(v.height), tekst: Math.round(t.height), box: Math.round(b.height) }; }));

  test('de tekst begint op de bovenkant van zijn eigen vat', async ({ page }) => {
    await boot(page, Object.assign({ breedte: 360 }, TOESTEL));
    const r = await posities(page);
    expect(r.length).toBe(2);
    for (const k of r) expect(k.tekstTop, k.id).toBe(k.vatTop);
  });

  /* HET HOGE VAT DRAAGT ZIJN TEKST BINNENIN EN HET GEKLEMDE NIET, en dat paar is de meting: met
     alleen het hoge vat is "de tekst staat in het vat" niet te onderscheiden van "de tekst staat
     boven het vat", en met alleen het geklemde niet van "de tekst staat eronder" (meetles a). */
  test('bij het hoge vat past alles erin, bij het geklemde loopt hij eronder door', async ({ page }) => {
    await boot(page, Object.assign({ breedte: 360 }, TOESTEL));
    const r = await posities(page);
    const hoog = r.find((k) => k.vat === 180), klem = r.find((k) => k.vat === 40);
    expect(hoog, JSON.stringify(r)).toBeTruthy();
    expect(klem, JSON.stringify(r)).toBeTruthy();
    expect(hoog.tekstBot, 'het hoge vat draagt zijn tekst binnenin').toBeLessThanOrEqual(hoog.vatBot);
    expect(klem.tekstBot, 'het geklemde vat niet').toBeGreaterThan(klem.vatBot);
    // en de box is per kolom `max(vat, tekst)`
    for (const k of r) expect(k.box, k.id).toBe(Math.max(k.vat, k.tekst));
  });

  /* DE TWEEDE EIS VAN DEZE RONDE: een lang tekstblok onder het ENE vat maakt de ANDERE kolommen niet
     hoger. Dat is alleen te zien door dezelfde stand twee keer te renderen met ALLEEN de naam van de
     tweede bestemming anders: tot deze wissel stonden de teksten in een rasterrij en groeide de
     eerste kolom mee. */
  test('een langere tekst in de ene kolom laat de andere ongemoeid', async ({ page }) => {
    const met = (naam) => ({ cap: 2200, order: ['noodfonds', 'kk', 'iw'], goals: [
      { id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'pct', pct: 90 },
      { id: 'iw', naam, doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'pct', pct: 10 }] });
    const lees = () => page.evaluate(() => [...document.querySelectorAll('#s-vooruit .wf-kol')]
      .map((k) => ({ id: k.dataset.id, h: Math.round(k.getBoundingClientRect().height) })));
    await boot(page, Object.assign({ breedte: 360 }, met('Inrichting')));
    const kort = await lees();
    await boot(page, Object.assign({ breedte: 360 },
      met('Inrichting woning keuken badkamer en vloer')));
    const lang = await lees();
    // de invoer: de tweede kolom wordt er echt hoger van
    expect(lang[1].h, 'tweede kolom: ' + kort[1].h + ' -> ' + lang[1].h)
      .toBeGreaterThan(kort[1].h);
    // en de eerste niet
    expect(lang[0].h, 'eerste kolom').toBe(kort[0].h);
  });

  /* DE DERDE EIS: de noodfondsregel kapt zijn naam niet af. Dat was de LAATSTE plek op dit scherm
     waar een naam die je zelf invoerde stil werd ingekort (v281/v284); `.vat-naam` droeg een
     ellipsis met nowrap. DE PRIJS IS 21px: de regel gaat van 55 naar 76px, want "Noodfonds · Bereikt"
     past naast het toegewezen bedrag niet op één regel. Dat staat hier als getal, zodat een volgende
     ronde ziet wat de regel kost in plaats van het opnieuw te moeten meten. */
  test('de noodfondsregel kapt zijn naam niet af', async ({ page }) => {
    await boot(page, Object.assign({ breedte: 360 }, TOESTEL));
    const r = await page.evaluate(() => {
      const rij = document.querySelector('#s-vooruit .plan-rij.vat-vol');
      const n = rij.querySelector('.vat-naam');
      const cs = getComputedStyle(n);
      return { ellipsis: cs.textOverflow, wrap: cs.whiteSpace,
        afgekapt: n.scrollWidth > n.clientWidth + 1,
        tekst: n.innerText.replace(/\s+/g, ' ').trim(),
        rij: Math.round(rij.getBoundingClientRect().height) };
    });
    expect(r.ellipsis).not.toBe('ellipsis');
    expect(r.wrap).not.toBe('nowrap');
    expect(r.afgekapt).toBe(false);
    expect(r.tekst).toMatch(/Noodfonds/);
    expect(r.rij, 'de prijs van het niet-afkappen').toBe(76);
  });
});
