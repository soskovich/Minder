/* v333: de waarde van een bezitting is de laatst ingevulde waarde plus de gekoppelde inleg met een
   datum NA de dag waarop je die invulde. Geen rendement en geen schatting.
   Het geval van de gebruiker: EUR 420 ingevuld op 25 september, EUR 100 inleg op 29 september naar
   Peaks (Kayani). Ingevuld op 25 september wordt dat EUR 520; ingevuld op 30 september blijft het
   EUR 420. Zie bezit-koppeling.fixture.js voor de rest van de stand. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./bezit-koppeling.fixture');

const KAYANI = (op, extra) => ({ id: 'kayani', naam: 'Peaks (Kayani)', waarde: 420, grow: true, rend: 5, per: 50,
  ...(op ? { waardeOp: op } : {}), ...(extra || {}) });
const PENSIOEN = { id: 'pensioen', naam: 'Peaks (pensioen)', waarde: 3200, grow: true, rend: 5, per: 0 };
async function start(page, kay, o) {
  o = o || {};
  const ids = await boot(page, { ...o, set: { assets: [kay, PENSIOEN], ...(o.set || {}) } });
  await page.evaluate((id) => zetBezitKoppel(id, 'kayani'), ids.peaks0929);
  return ids;
}
const vermogen = (page) => page.evaluate(() => {
  SET.openBez = true; go('vermogen'); renderVermogen();
  const q = (s) => (document.querySelector(s) || {}).innerText || '';
  return { totaal: q('#s-vermogen [data-bezittotaal="kayani"]'), regel: q('#s-vermogen [data-bezitwaarde="kayani"]'),
    vraag: q('#s-vermogen [data-bezitvraag="kayani"]'), netto: netWorth().overig,
    reis: (fireInputs().belegdItems.find((x) => x.naam === 'Peaks (Kayani)') || {}).waarde };
});

test.describe('a · ingevuld op 25 september: EUR 420 + EUR 100 = EUR 520', () => {
  test('de rij, het vermogen en de reis lezen EUR 520, en de rij noemt de optelling', async ({ page }) => {
    await start(page, KAYANI('2026-09-25'));
    const r = await vermogen(page);
    expect(r.totaal).toBe('€520');
    expect(r.regel).toBe('€420 op 25 sep + €100 inleg sindsdien = €520');
    expect(r.netto, 'netWorth leest dezelfde waarde').toBe(520 + 3200);
    expect(r.reis, 'de Vermogensreis begint bij dezelfde waarde').toBe(520);
  });
  test('de ingevulde waarde zelf blijft staan: de optelling wordt niet in a.waarde geschreven', async ({ page }) => {
    await start(page, KAYANI('2026-09-25'));
    await vermogen(page);
    const a = await page.evaluate(() => SET.assets.find((x) => x.id === 'kayani'));
    expect(a.waarde).toBe(420);
    expect(a.waardeOp).toBe('2026-09-25');
  });
  test('de editor toont EUR 520 in het veld met de optelling eronder', async ({ page }) => {
    await start(page, KAYANI('2026-09-25'));
    const r = await page.evaluate(() => { openAsset('kayani'); return { veld: document.getElementById('aWaarde').value,
      regel: (document.querySelector('#sheet [data-bezitwaarde="kayani"]') || {}).innerText || '' }; });
    expect(r.veld).toBe('520');
    expect(r.regel).toContain('€420 op 25 sep + €100 inleg sindsdien = €520');
  });
  test('alleen de naam wijzigen schrijft de optelling niet vast en verzet de datum niet', async ({ page }) => {
    await start(page, KAYANI('2026-09-25'));
    const a = await page.evaluate(() => { openAsset('kayani'); document.getElementById('aNaam').value = 'Peaks Kayani'; saveAsset('kayani');
      return SET.assets.find((x) => x.id === 'kayani'); });
    expect(a.naam).toBe('Peaks Kayani');
    expect(a.waarde).toBe(420);
    expect(a.waardeOp).toBe('2026-09-25');
  });
});

test.describe('b · ingevuld op 30 september: blijft EUR 420', () => {
  test('inleg van voor de invuldag telt niet', async ({ page }) => {
    await start(page, KAYANI('2026-09-30'));
    const r = await vermogen(page);
    expect(r.totaal).toBe('€420');
    expect(r.regel).toBe('');
    expect(r.netto).toBe(420 + 3200);
  });
  test('inleg op de invuldag zelf telt ook niet: die kan al in je getal zitten', async ({ page }) => {
    await start(page, KAYANI('2026-09-29'));
    expect((await vermogen(page)).totaal).toBe('€420');
  });
});

test.describe('c · opnieuw invullen is een nieuw startpunt', () => {
  test('een ander getal in het veld zet de waarde en de datum op vandaag, en daarna telt alleen latere inleg', async ({ page }) => {
    await start(page, KAYANI('2026-09-25'));
    const a = await page.evaluate(() => { openAsset('kayani'); document.getElementById('aWaarde').value = '530'; saveAsset('kayani');
      return SET.assets.find((x) => x.id === 'kayani'); });
    expect(a.waarde).toBe(530);
    expect(a.waardeOp).toBe('2026-09-30');
    const r = await vermogen(page);
    expect(r.totaal, 'de EUR 100 van 29 september zit in de nieuwe EUR 530').toBe('€530');
  });
  test('een nieuwe bezitting krijgt de invuldag van vandaag', async ({ page }) => {
    await start(page, KAYANI('2026-09-25'));
    const a = await page.evaluate(() => { openAsset(); document.getElementById('aNaam').value = 'Holding'; document.getElementById('aWaarde').value = '1000';
      saveAsset(''); return SET.assets.find((x) => x.naam === 'Holding'); });
    expect(a.waardeOp).toBe('2026-09-30');
  });
});

test.describe('d · een waarde zonder invuldag: een keer de vraag, niet raden', () => {
  test('zonder antwoord telt er niets bij op, en de rij stelt de vraag', async ({ page }) => {
    await start(page, KAYANI(null));
    const r = await vermogen(page);
    expect(r.totaal).toBe('€420');
    expect(r.vraag).toContain('Zat de inleg van 29 sep al in de €420?');
  });
  test('de editor stelt de vraag met twee even zware knoppen, zonder voorselectie', async ({ page }) => {
    await start(page, KAYANI(null));
    const r = await page.evaluate(() => { openAsset('kayani');
      const b = [...document.querySelectorAll('#sheet [data-bezitvraagknop]')];
      const st = b.map((x) => { const c = getComputedStyle(x); return [c.color, c.fontWeight, c.fontSize, c.borderColor].join('|'); });
      return { tekst: (document.querySelector('#sheet [data-bezitvraagblok]') || {}).innerText || '', labels: b.map((x) => x.innerText.trim()), st }; });
    expect(r.tekst).toContain('Zat de inleg van 29 sep (€100) al in de €420?');
    expect(r.labels).toEqual(['Ja, al meegeteld', 'Nee, tel erbij']);
    expect(r.st[0]).toBe(r.st[1]);
  });
  test('"Nee, tel erbij" maakt er EUR 520 van, en de vraag komt niet terug', async ({ page }) => {
    await start(page, KAYANI(null));
    await page.evaluate(() => openAsset('kayani'));
    await page.locator('#sheet [data-bezitvraagknop="nee"]').click();
    await expect(page.locator('#sheet [data-bezitvraagblok]')).toHaveCount(0);
    const r = await vermogen(page);
    expect(r.totaal).toBe('€520');
    expect(r.vraag).toBe('');
    expect(await page.evaluate(() => SET.assets[0].waardeOp)).toBe('2026-09-28');
  });
  test('"Ja, al meegeteld" houdt EUR 420, en de vraag komt niet terug', async ({ page }) => {
    await start(page, KAYANI(null));
    await page.evaluate(() => openAsset('kayani'));
    await page.locator('#sheet [data-bezitvraagknop="ja"]').click();
    const r = await vermogen(page);
    expect(r.totaal).toBe('€420');
    expect(r.vraag).toBe('');
    expect(await page.evaluate(() => SET.assets[0].waardeOp)).toBe('2026-09-29');
  });
  test('de vraag gaat over de nieuwste boeking, en inleg na de invuldag telt erbij', async ({ page }) => {
    const ids = await start(page, KAYANI(null), { dag: '2026-10-08', extraTx: [{ id: 'okt', date: '2026-10-06', amount: -100 }] });
    await page.evaluate((id) => zetBezitKoppel(id, 'kayani'), ids.okt);
    const r0 = await page.evaluate(() => bezitWaarde(SET.assets[0]).vraag);
    expect(r0.datum, 'de vraag gaat over de nieuwste gekoppelde boeking').toBe('2026-10-06');
    await page.evaluate(() => bezitWaardeVraag('kayani', true));
    expect((await vermogen(page)).totaal, 'beide boekingen zaten erin').toBe('€420');
    /* en een boeking na de invuldag telt er weer bij */
    await page.evaluate(() => { SET.assets[0].waardeOp = '2026-10-01'; });
    expect((await vermogen(page)).totaal, 'september zat erin, oktober niet').toBe('€520');
  });
  test('zonder gekoppelde boeking is er niets te vragen', async ({ page }) => {
    const ids = await boot(page, { set: { assets: [KAYANI(null), PENSIOEN] } });
    expect(ids.peaks0929).toBeTruthy();
    const r = await vermogen(page);
    expect(r.vraag).toBe('');
    expect(r.totaal).toBe('€420');
  });
});

test.describe('e · de periodieke inleg: ingevuld naast gemeten', () => {
  /* Op 8 oktober is september afgerond: het venster is juli t/m september, met EUR 100 in
     september, dus gemiddeld EUR 33. */
  test('de editor toont beide, en de reis rekent met het gemeten bedrag', async ({ page }) => {
    await start(page, KAYANI('2026-09-25'), { dag: '2026-10-08' });
    const r = await page.evaluate(() => { openAsset('kayani');
      return { regel: (document.querySelector('#sheet [data-bezitper="kayani"]') || {}).innerText || '',
        reis: fireInputs().belegdItems.find((x) => x.naam === 'Peaks (Kayani)').per }; });
    expect(r.regel).toContain('ingevuld €50 · gemeten gemiddeld €33 (juli t/m september)');
    expect(r.reis).toBe(33);
  });
  test('zonder gekoppelde boeking in een afgeronde maand: geen regel, en de reis houdt het ingevulde bedrag', async ({ page }) => {
    await start(page, KAYANI('2026-09-25'));
    const r = await page.evaluate(() => { openAsset('kayani');
      return { regel: !!document.querySelector('#sheet [data-bezitper]'), reis: fireInputs().belegdItems.find((x) => x.naam === 'Peaks (Kayani)').per }; });
    expect(r.regel).toBe(false);
    expect(r.reis).toBe(50);
  });
  test('een pauze wint van het gemeten bedrag', async ({ page }) => {
    await start(page, KAYANI('2026-09-25', { pauze: { sinds: '2026-10', perVoor: 50 }, per: 0 }), { dag: '2026-10-08' });
    expect(await page.evaluate(() => fireInputs().belegdItems.find((x) => x.naam === 'Peaks (Kayani)').per)).toBe(0);
  });
});

for (const w of [360, 390]) {
  test(`f · de rij met de optelling op ${w}px, zonder overloop`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await start(page, KAYANI('2026-09-25'));
    await vermogen(page);
    const r = await page.evaluate(() => { const e = document.querySelector('#s-vermogen [data-bezitwaarde="kayani"]');
      const rij = e.closest('.cz-pot'); return { over: document.documentElement.scrollWidth > innerWidth, h: Math.round(rij.getBoundingClientRect().height),
        rechts: e.getBoundingClientRect().right, rand: rij.getBoundingClientRect().right }; });
    expect(r.over).toBe(false);
    expect(r.rechts).toBeLessThanOrEqual(r.rand + 0.5);
    console.log(`rij ${w}px: ${r.h}px`);
  });
}

/* v333: de editor las de laatste drie maanden van months(), inclusief de lopende. Op 4 oktober was dat
   augustus, september en een lege oktober, en viel de gekoppelde inleg van mei tot en met juli weg.
   Een regel geldt voor ELKE boeking die hij raakt, ook een oudere dan de regel zelf. */
const MACHT = 'STICHTING BEHEER DERDENGELDEN PEAKS MACHTIGING 9fa570110ce945fc8bef';
const OUD = [['mei', '2026-05-12'], ['jun1', '2026-06-09'], ['jun2', '2026-06-23'], ['jul', '2026-07-14'], ['aug', '2026-08-11'], ['sep', '2026-09-01']]
  .map(([id, date]) => ({ id, date, amount: -5.25, desc: MACHT }));
test.describe('g · de gemeten inleg toont de maanden met inleg, en het totaal sinds de eerste', () => {
  test('een regel die nu wordt gezet koppelt ook de boeking van mei', async ({ page }) => {
    const ids = await start(page, KAYANI('2026-09-25'), { dag: '2026-10-04', extraTx: OUD });
    const r = await page.evaluate(([sep, mei]) => { bezitRegelZet(sep, 'kayani', 'kenmerk', '9fa570110ce945fc8bef');
      return bezitVan(TX.find((t) => t.id === mei)); }, [ids.sep, ids.mei]);
    expect(r).toBe('kayani');
  });
  test('de editor toont september, augustus en juli, niet een lege oktober, en het totaal sinds mei', async ({ page }) => {
    const ids = await start(page, KAYANI('2026-09-25'), { dag: '2026-10-04', extraTx: OUD });
    const r = await page.evaluate((sep) => { bezitRegelZet(sep, 'kayani', 'kenmerk', '9fa570110ce945fc8bef'); openAsset('kayani');
      const blok = document.querySelector('#sheet [data-bezitgemeten]');
      return { tekst: blok.innerText, totaal: (blok.querySelector('[data-bezitinlegtotaal="kayani"]') || {}).innerText || '' }; }, ids.sep);
    expect(r.tekst).toMatch(/september 2026\s+€105 · 2 boekingen/);
    expect(r.tekst).toMatch(/augustus 2026\s+€5/);
    expect(r.tekst).toMatch(/juli 2026\s+€5/);
    expect(r.tekst).not.toContain('oktober');
    expect(r.tekst, 'juni en mei vallen buiten de drie, en staan in het totaal').not.toContain('juni 2026');
    expect(r.totaal).toMatch(/Sinds mei 2026\s+€132 · 7 boekingen/);
  });
  test('het totaal rekent op de boekingen en niet op afgeronde maanden', async ({ page }) => {
    const ids = await start(page, KAYANI('2026-09-25'), { dag: '2026-10-04', extraTx: OUD });
    const r = await page.evaluate((sep) => { bezitRegelZet(sep, 'kayani', 'kenmerk', '9fa570110ce945fc8bef');
      return { maanden: bezitInlegRecent('kayani').reduce((s, x) => s + x.bedrag, 0), ruw: bezitGekoppeld('kayani').reduce((s, t) => s - t.amount, 0) }; }, ids.sep);
    expect(r.ruw).toBeCloseTo(131.5, 2);
    expect(r.maanden, 'per maand afgerond is het een ander getal, dus de keuze is niet inert').toBe(131);
  });
});
