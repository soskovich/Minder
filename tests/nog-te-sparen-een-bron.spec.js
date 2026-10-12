/* v386: NOG TE SPAREN = PLAN "DEZE MAAND OPZIJ" MIN WAT ER AL GESTORT IS, EN EEN OPNAME UIT VRIJ SPAARGELD VUL JE NIET
   AAN (keuze A van de gebruiker). spaarStortStand() is de ene bron; de regel op Home is zijn exacte optelling.
   (a) een opname uit vrij spaargeld telt niet als aan te vullen, en staat als eigen regel in de opbouw;
   (b) een opname uit toegewezen geld zonder keuze telt mee (v365), met een tik naar dezelfde keuze als op Plan;
   (c) gespreid terugzetten telt alleen het deel van deze maand, en een keuze over toegewezen zonder geld telt de
       opname niet nog eens;
   (d) nog te sparen plus al gestort is Plan "deze maand opzij".
   De stand van het toestel (opnames 231 met keuze, 407 en 150 zonder geld met keuze, en 231 uit vrij spaargeld, op
   een saldo van EUR 3.869,20 aan het begin van de maand tegen EUR 3.638 toegewezen) is GECONSTRUEERD en niet gemeten:
   de boekingen staan alleen op het toestel. */
const { test, expect } = require('@playwright/test');
const O = require('./opschonen-stand');
const T = require('./plan-toestel-stand');

const tekst = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
const stand = (page) => page.evaluate(() => { const S = safeToSpend(); return { nog: S.saveReserved, gestort: S.gestort, aanvullen: S.aanvullen, vrij: S.vrijOpname, extra: S.tzExtra, tgt: S.saveTarget, safe: S.safe, opzij: planKpiData().opzij, z: spaarOver().zonder }; });

/* De stand van het toestel. De keuzes staan rechtstreeks in SET, want hun volgorde op het toestel is niet na te spelen. */
async function toestel(page) {
  const bron = [{ id: 'noodfonds', type: 'noodfonds', naam: 'Noodfonds', af: 0 }];
  await O.boot(page, { dag: '2026-10-10', zonderOpname: true, set: { manualBal: { [O.MAIN]: 3000, [O.SAV]: 2850.20 }, planOrder: ['noodfonds', 'iw', 'kk'],
    terugzet: { '2026-10': { keuze: 'alles', bedrag: 231, delen: [231], bron: [Object.assign({}, bron[0], { af: 231 })], op: '2026-10-05' } },
    terugzetGat: [{ id: 'zg1', M: '2026-10', bedrag: 407, keuze: 'alles', delen: [407], bron: [Object.assign({}, bron[0], { af: 407 })], op: '2026-10-07' },
      { id: 'zg2', M: '2026-10', bedrag: 150, keuze: 'drie', delen: [50, 50, 50], bron: [Object.assign({}, bron[0], { af: 150 })], op: '2026-10-10' }] } });
  await page.evaluate((sav) => {
    for (const [d, a] of [['05', 231], ['07', 407], ['08', 231], ['10', 150]]) { TX.push({ id: 'w' + d, date: '2026-10-' + d, amount: -a, acc: sav, name: 'Spaarpot', desc: 'VAN SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); categorize(TX[TX.length - 1]); }
    save(); render(); }, O.SAV);
}

test.describe('de stand van het toestel', () => {
  test.beforeEach(async ({ page }) => { await toestel(page); });
  test('de invoer: EUR 1.019 eruit, EUR 788 met een keuze, toegewezen EUR 3.638 tegen EUR 3.869,20 aan het begin', async ({ page }) => {
    const r = await page.evaluate(() => ({ net: savedNet(thisYM()), V: spaarVrij(), ss: spaarStortStand() }));
    expect(r.net).toBe(-1019); expect(r.V.toegewezen).toBe(3638); expect(r.ss.uit).toBe(1019); expect(r.ss.gedekt).toBe(788); expect(r.ss.G0).toBe(0);
  });
  /* v397: de 231 uit vrij spaargeld gaat standaard terug (keuze A vervalt): nog te sparen 2.200 + 919 = 3.119. */
  test('nog te sparen is EUR 3.119, de 231 uit vrij spaargeld gaat standaard terug', async ({ page }) => {
    const s = await stand(page);
    expect(s).toMatchObject({ nog: 3119, gestort: 0, aanvullen: 0, vrij: 0, extra: 919, tgt: 2200 });
    expect(s.nog).toBe(s.opzij);
  });
  test('met "niet terug" is het EUR 2.888 en telt de 231 als vrij te besteden (de vorm van v386)', async ({ page }) => {
    await page.evaluate(() => terugzetVrijZet('niet'));
    const s = await stand(page);
    expect(s).toMatchObject({ nog: 2888, gestort: 0, aanvullen: 0, vrij: 231, extra: 688, tgt: 2200 });
    expect(s.nog).toBe(s.opzij);
  });
});

test.describe('(a) een opname uit vrij spaargeld', () => {
  test.beforeEach(async ({ page }) => { await O.boot(page, { opname: 200, set: { manualBal: { [O.MAIN]: 3000, [O.SAV]: 3938 } } }); });
  test('de invoer: aan het begin van de maand stond er EUR 500 meer dan toegewezen', async ({ page }) => {
    const r = await page.evaluate(() => ({ net: savedNet(thisYM()), V: spaarVrij(), z: spaarOver().zonder }));
    expect(r.net).toBe(-200); expect(r.V.savedExact - r.net - r.V.toegewezen).toBe(500); expect(r.z).toBe(0);
  });
  test('gaat standaard terug; met "niet terug" telt hij niet als aan te vullen, en de opbouw zegt het', async ({ page }) => {
    expect(await stand(page)).toMatchObject({ nog: 2400, aanvullen: 0, vrij: 0, gestort: 0, extra: 200 });   // v397
    await page.evaluate(() => terugzetVrijZet('niet'));
    const s = await stand(page);
    expect(s).toMatchObject({ nog: 2200, aanvullen: 0, vrij: 200, gestort: 0 });
    await page.evaluate(() => openSafeToSpend());
    expect(await tekst(page, '[data-spaarvrijopname]')).toBe('€200 uit vrij spaargeld · telt als vrij te besteden');
    expect(await page.locator('[data-spaaraanvullen]').count()).toBe(0);
  });
});

test.describe('(b) een opname uit toegewezen geld zonder keuze', () => {
  test.beforeEach(async ({ page }) => { await O.boot(page); });
  test('telt mee als aan te vullen (v365), zonder regel over vrij spaargeld', async ({ page }) => {
    const s = await stand(page);
    expect(s).toMatchObject({ nog: 2431, aanvullen: 231, vrij: 0, gestort: 0 });
    await page.evaluate(() => openSafeToSpend());
    expect(await tekst(page, '[data-spaaroptelling]')).toBe('maandbedrag €2.200 + €231 eruit gehaald zonder keuze ›');
    expect(await page.locator('[data-spaarvrijopname]').count()).toBe(0);
  });
  test('de tik opent de keuze van Plan, niets voorgekozen, en schrijft niets', async ({ page }) => {
    await page.evaluate(() => openSafeToSpend());
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.locator('[data-spaaraanvullen]').click();
    expect(await page.locator('#sheet [onclick*="terugzetKies"]').count()).toBeGreaterThan(0);
    expect(await page.evaluate(() => (SET.terugzet || {})['2026-10'] || null)).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
  test('na de keuze: alles 2431, drie 2277, niet 2200 (v365)', async ({ page }) => {
    for (const [k, v] of [['alles', 2431], ['drie', 2277], ['niet', 2200]]) {
      await page.evaluate((k) => { delete SET.terugzet; terugzetKies(k); }, k);
      expect((await stand(page)).nog).toBe(v);
    }
  });
});

test.describe('(c) gespreid terugzetten, en een keuze over toegewezen zonder geld', () => {
  test('na150: de 150 zonder keuze vult aan, de oude 407 dekt hem niet', async ({ page }) => {
    await T.boot(page, 'na150');
    expect(await stand(page)).toMatchObject({ nog: 2988, aanvullen: 150, vrij: 0, extra: 638 });
  });
  test('nu: alleen EUR 50 van de 150 in oktober, en de opnames tellen niet nog eens', async ({ page }) => {
    await T.boot(page, 'nu');
    const s = await stand(page);
    expect(s).toMatchObject({ nog: 2888, aanvullen: 0, vrij: 0, gestort: 0, extra: 688 });
    await page.evaluate(() => openSafeToSpend());
    expect(await tekst(page, '[data-spaaroptelling]')).toBe('maandbedrag €2.200 + terug €688');
  });
});

test.describe('(d) nog te sparen plus al gestort is Plan "deze maand opzij"', () => {
  test('met een storting van EUR 1.000', async ({ page }) => {
    await T.boot(page, 'nu');
    await page.evaluate((sav) => { TX.push({ id: 'd1', date: '2026-10-10', amount: 1000, acc: sav, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); categorize(TX[TX.length - 1]); SET.manualBal[sav] = 3850.20; save(); }, T.SAV);
    const s = await stand(page);
    expect(s.gestort).toBe(1000); expect(s.nog + s.gestort).toBe(s.opzij); expect(s.opzij).toBe(2888);
    await page.evaluate(() => openSafeToSpend());
    expect(await tekst(page, '[data-spaaroptelling]')).toBe('maandbedrag €2.200 + terug €688 − €1.000 al gestort');
  });
  test('de regel op Home telt exact op: maandbedrag + terug - gestort + aanvullen', async ({ page }) => {
    for (const b of [() => T.boot(page, 'nu'), () => T.boot(page, 'na150'), () => O.boot(page), () => toestel(page)]) {
      await b(); const s = await stand(page);
      expect(s.nog).toBe(Math.max(s.tgt + s.extra - s.gestort + s.aanvullen, 0));
      await page.evaluate(() => openSafeToSpend());
      const term = await page.evaluate(() => { const r = [...document.querySelectorAll('[data-term]')].find((e) => e.querySelector('[data-spaaroptelling]')); return r ? +r.dataset.term : null; });
      expect(term).toBe(s.nog);
    }
  });
  test('een overboeking tussen twee spaarrekeningen is geen opname', async ({ page }) => {
    await O.boot(page, { zonderOpname: true, set: { savingsAcc: { NL01SAVE0000009999: true }, manualBal: { [O.MAIN]: 3000, [O.SAV]: 3138, NL01SAVE0000009999: 500 } } });
    await page.evaluate((sav) => { for (const [a, acc] of [[-500, sav], [500, 'NL01SAVE0000009999']]) { TX.push({ id: 'i' + a, date: '2026-10-07', amount: a, acc, name: 'Spaarpot', desc: 'OVERBOEKING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }); categorize(TX[TX.length - 1]); } OWN.push && !OWN.includes('NL01SAVE0000009999') && OWN.push('NL01SAVE0000009999'); save(); }, O.SAV);
    const r = await page.evaluate(() => ({ ss: spaarStortStand(), n: n26SavingsAccounts().length }));
    expect(r.n).toBe(2); expect(r.ss.uit).toBe(0);
  });
});
