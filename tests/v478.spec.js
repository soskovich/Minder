// v478 (gevraagd door de gebruiker): het splitblok van de te-ruim-sheet draagt zijn reden en zijn voorstel niet meer zelf.
// De twee weggehaalde regels waren dubbelingen BINNEN DEZELFDE SHEET, en elke weggehaalde zin en elk weggehaald bedrag
// staat er nog: de reden in de sheet-voet (v361, de ENE plek voor de reden), het eerste bedrag met zijn naam in de
// uitlegregel en bij veld 1, het tweede bedrag in veld 2 en in de voet-reden, en zodra er een tweede bestemming is
// beide bedragen met beide namen in het Gevolg-blok.
// AANLEIDING: de fit-eis van grip-eigen-budget (B, 390x844) kwam op 697 van 673px uit na de wissel naar Chromium 1243.
// Die grens blijft staan; de sheet gaat omlaag. GEMETEN: 697 -> 656 van 673px.
// Fixture: grip-kring-stand (10 okt 2026). Huur 700, zelf 400, dus vrij 300; Uit eten & café eindigt +67 boven, dus
// het splitblok vuurt (N.vrij > d.boven) met e1 67 en e2 233. De twee bedragen verschillen, anders is "het eerste
// bedrag" niet van "het tweede" te onderscheiden.
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const splitsheet = async (page) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await K.boot(page);
  await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); openTeRuim('huur'); });
  await page.click('[data-teruimoptie="b"]');
  await page.fill('[data-teruimbedrag]', '400');
  await page.click('[data-teruimbestem="pot:uiteten"]');
};

const stand = page => page.evaluate(() => {
  const t = s => { const n = document.querySelector(s); return n ? n.innerText.trim() : null; };
  const sp = document.querySelector('[data-teruimsplit]');
  const v = k => document.querySelector(`[data-splitbedrag="${k}"]`);
  const st = teRuimStand(), S = st.S, V = st.V, x = st.x;
  const N = teRuimNieuw(S, x), d = teRuimBestemVan(V, x, S.bestem), T = teRuimDelen(S, V, x, N, d);
  const sh = document.getElementById('sheet');
  return {
    split: !!sp,
    voorstel: !!document.querySelector('[data-splitvoorstel]'),
    splitreden: !!document.querySelector('[data-splitreden]'),
    voetreden: t('[data-voetreden]'),
    uitleg: sp ? sp.querySelector('.small.muted').innerText.trim() : null,
    v1: v(1).value, v2: v(2).value,
    lab1: v(1).parentElement.innerText.replace(/\s+/g, ' ').trim(),
    chipAan: [...document.querySelectorAll('[data-splitbestem]')].filter(c => c.className.includes('on')).map(c => c.innerText.trim()),
    chips: [...document.querySelectorAll('[data-splitbestem]')].map(c => c.dataset.splitbestem),
    gevolg: [...document.querySelectorAll('[data-gevolgbestem]')].map(n => n.innerText.replace(/\s+/g, ' ').trim()),
    bron: { reden: T.reden, e1: T.e1, e2: T.e2, boven: d.boven, naam: d.naam, vrij: N.vrij },
    h: sh.scrollHeight, ch: sh.clientHeight,
  };
});

test.describe('het splitblok zonder zijn twee dubbelingen', () => {
  test('invoermeting: het splitblok vuurt, met twee verschillende bedragen', async ({ page }) => {
    await splitsheet(page);
    const r = await stand(page);
    expect(r.split).toBe(true);
    expect(r.bron.vrij).toBe(300);
    expect(r.bron.boven).toBe(67);
    expect(r.bron.e1).toBe(67);
    expect(r.bron.e2).toBe(233);
    expect(r.bron.e1).not.toBe(r.bron.e2);   // anders meet "het eerste bedrag" niets
    expect(r.bron.naam).toBe('Uit eten & café');
  });

  test('de twee dubbelingen staan er niet meer', async ({ page }) => {
    await splitsheet(page);
    const r = await stand(page);
    expect(r.voorstel).toBe(false);
    expect(r.splitreden).toBe(false);
  });

  test('de reden staat in de voet, letterlijk dezelfde zin als teRuimDelen() hem maakt', async ({ page }) => {
    await splitsheet(page);
    const r = await stand(page);
    expect(r.bron.reden).toBe('Kies waar €233 naartoe gaat');   // de zin die data-splitreden droeg
    expect(r.voetreden).toBe(r.bron.reden);
  });

  test('het eerste bedrag en zijn naam staan in de uitlegregel van het splitblok', async ({ page }) => {
    await splitsheet(page);
    const r = await stand(page);
    expect(r.uitleg).toContain('€67');
    expect(r.uitleg).toContain('Uit eten & café');
  });

  test('het eerste bedrag staat in veld 1, met zijn naam ernaast', async ({ page }) => {
    await splitsheet(page);
    const r = await stand(page);
    expect(r.v1).toBe('67');
    expect(r.lab1).toContain('naar Uit eten & café');
  });

  test('het tweede bedrag staat in veld 2 en in de voet-reden', async ({ page }) => {
    await splitsheet(page);
    const r = await stand(page);
    expect(r.v2).toBe('233');
    expect(r.voetreden).toContain('€233');
  });

  test('met een tweede bestemming dragen de Gevolg-regels beide bedragen en beide namen', async ({ page }) => {
    await splitsheet(page);
    const c = (await stand(page)).chips;
    expect(c).toEqual(['pot:vices']);
    await page.click(`[data-splitbestem="${c[0]}"]`);
    const r = await stand(page);
    expect(r.bron.reden).toBe('');            // niets meer te kiezen, dus geen reden in de voet
    expect(r.voetreden).toBe(null);
    expect(r.gevolg).toContain('Uit eten & café +€67/mnd');
    expect(r.gevolg).toContain('Vices +€233/mnd');
    expect(r.chipAan).toEqual(['Vices']);
  });

  test('de sheet past weer op 390x844 (de grens van 673 staat in grip-eigen-budget)', async ({ page }) => {
    await splitsheet(page);
    const r = await stand(page);
    console.log(`sheet 390: ${r.h} van ${r.ch}px`);
    expect(r.h).toBeLessThanOrEqual(r.ch);
    expect(r.h).toBeLessThanOrEqual(673);
  });
});
