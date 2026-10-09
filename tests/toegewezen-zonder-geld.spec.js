/* v371: TOEGEWEZEN ZONDER GELD BLIJFT ZICHTBAAR TOT JIJ HET RECHTTREKT, EN DE RIJ LAAT GELD EN PLAN APART ZIEN.
   De stand van het toestel (opschonen-stand met een saldo van EUR 3.000,20): EUR 3.638 toegewezen aan het Noodfonds,
   EUR 231 op 5 oktober eruit gehaald. Een keuze over die EUR 231 dekt alleen haar eigen bedrag, dus er blijft
   EUR 406,80 toegewezen zonder geld, en dat staat er tot je verlaagt of terugzet. Niets gebeurt vanzelf. */
const { test, expect } = require('@playwright/test');
const P = require('./opschonen-stand');

const TOESTEL = { set: { manualBal: { [P.MAIN]: 3000, [P.SAV]: 3000.20 } } };
const stand = (page) => page.evaluate(() => { go('vooruit'); const r = document.getElementById('spaarOverRegel');
  const O = spaarOver(); return { regel: r ? r.innerText.replace(/\s+/g, ' ').trim() : '', zonder: O.zonder, dekt: O.dekt, over: O.over,
    nf: SET.nfToegewezen, gat: (SET.terugzetGat || []).length, kop: document.getElementById('planKopBedrag').innerText }; });
const sheet = (page) => page.evaluate(() => { openSpaarOver(); return document.getElementById('spaarOverSheet').innerText.replace(/\s+/g, ' '); });

test.describe('a · de melding blijft staan naast een terugzetkeuze', () => {
  test('de invoer: EUR 3.638 toegewezen tegen EUR 3.000,20, en EUR 231 eruit gehaald', async ({ page }) => {
    await P.boot(page, TOESTEL);
    const r = await page.evaluate(() => ({ V: spaarVrij(), opname: terugzetOpname() }));
    expect(r.V.toegewezen).toBe(3638); expect(r.V.savedExact).toBeCloseTo(3000.2, 5); expect(r.opname).toBe(231);
  });
  test('zonder keuze is het hele verschil zonder geld: EUR 637,80', async ({ page }) => {
    await P.boot(page, TOESTEL);
    const r = await stand(page);
    expect(r.zonder).toBe(637.8); expect(r.dekt).toBe(0);
    expect(r.regel).toBe('€637,80 toegewezen zonder geld bekijk ›');
  });
  test('na een keuze voor de EUR 231 blijft EUR 406,80 staan, en niet nul', async ({ page }) => {
    await P.boot(page, TOESTEL);
    for (const k of ['alles', 'drie']) {
      await page.evaluate((x) => { terugzetHerstel(thisYM()); terugzetKies(x); }, k);
      const r = await stand(page);
      expect(r.dekt, k).toBe(231); expect(r.zonder, k).toBe(406.8);
      expect(r.regel, k).toBe('€406,80 toegewezen zonder geld bekijk ›');
    }
  });
  test('niet terugzetten verlaagt de toewijzing, en dan blijft hetzelfde verschil over', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('niet'));
    const r = await stand(page);
    expect(r.nf).toBe(3407); expect(r.dekt).toBe(0); expect(r.zonder).toBe(406.8);
  });
  test('op de fixture zelf dekt de keuze precies het verschil, en dan is er geen regel', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => terugzetKies('alles'));
    const r = await stand(page);
    expect(r.zonder).toBe(0); expect(r.regel).toBe('');
  });
  test('Grip leest hetzelfde getal: de buffer zegt welk deel je terugzet en welk deel zonder geld staat', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('alles'));
    /* De bufferregel zelf staat op deze stand niet op Grip (geen essentiele lasten te meten, bufferMaanden() is null);
       wat Grip leest is toewijzingBovenSaldo(), en die draagt het getal van de melding, niet het kale verschil. */
    const r = await page.evaluate(() => toewijzingBovenSaldo());
    expect(r.verschil).toBe(407); expect(r.dekt).toBe(231);
  });
});

test.describe('b · de sheet: de onttrekkingen en een keuze zonder voorkeuze', () => {
  test('de onttrekkingen per maand komen uit savedTx(), en de keuzes noemen hun gevolg', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('alles'));
    const t = await sheet(page);
    expect(t).toContain('€406,80 meer toegewezen dan er op je spaarrekening staat');
    expect(t).toContain('Je plan heeft samen €3.638 toegewezen, terwijl er €3.000,20 op je spaarrekening staat.');
    expect(t).toContain('Kaal verschil €637,80 − €231 gedekt door je keuze = €406,80');
    expect(await page.locator('[data-onttrekking="2026-10"]').innerText()).toMatch(/oktober · 1 boeking\s*€231/);
    expect(t).toContain('Verlaag de toewijzing van je noodfonds');
    expect(t).toContain('Noodfonds €3.638 → €3.231 · Kosten Koper vol mei 2027 (was apr 2027)');
    expect(t).toContain('Zet het terug · alles deze maand');
    expect(t).toContain('€407 extra deze maand, je toewijzingen blijven staan · je vol-datums veranderen niet');
    expect(t).toContain('Zet het terug · over 3 maanden');
    expect(t).toContain('€136 extra per maand t/m dec');
  });
  test('niets voorgekozen: openen en kiezen schrijven niets, en bevestigen kan pas na een keuze', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('alles'));
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.evaluate(() => openSpaarOver());
    expect(await page.locator('[data-zgkeuze][data-gekozen="1"]').count()).toBe(0);
    expect(await page.locator('[data-zgbevestig]').isDisabled()).toBe(true);
    expect(await page.locator('[data-voetreden]').innerText()).toContain('Kies eerst wat je met de €406,80 doet');
    await page.evaluate(() => spaarOverZet());   // zonder keuze schrijft de schrijver niets
    await page.click('[data-zgkeuze="drie"]');
    expect(await page.locator('[data-zgbevestig]').isDisabled()).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
  test('nooit automatisch: een render en een nieuwe maand zonder keuze zetten niets recht', async ({ page }) => {
    await P.boot(page, TOESTEL);
    await page.evaluate(() => { go('vooruit'); go('maand'); go('vooruit'); });
    const r = await stand(page);
    expect(r.nf).toBe(3638); expect(r.gat).toBe(0); expect(r.zonder).toBe(637.8);
  });
});

test.describe('c · gelijktrekken laat de melding verdwijnen', () => {
  test('verlagen: het noodfonds gaat met EUR 407 omlaag en de regel is weg', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('alles'));
    await page.evaluate(() => { openSpaarOver(); }); await page.click('[data-zgkeuze="v:noodfonds"]'); await page.click('[data-zgbevestig]');
    const r = await stand(page);
    expect(r.nf).toBe(3231); expect(r.zonder).toBe(0); expect(r.regel).toBe('');
  });
  test('alles terugzetten: de inleg van deze maand draagt hem, de toewijzing blijft, en de regel is weg', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('alles'));
    await page.evaluate(() => { openSpaarOver(); spaarOverKies('alles'); spaarOverZet(); });
    const r = await stand(page);
    expect(r.nf).toBe(3638); expect(r.zonder).toBe(0); expect(r.regel).toBe('');
    expect(r.kop).toBe('€2.838');                                   // 2.200 + 231 + 407
    expect(await page.evaluate(() => safeToSpend().saveReserved)).toBe(2838);
    expect(await page.locator('#terugzetGekozen').innerText()).toContain('€2.200 vaste inleg + €638 terugzetten · gekozen: alles deze maand');
  });
  test('over drie maanden: EUR 136 deze maand, en de projectie ziet de rest', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('alles'));
    await page.evaluate(() => { openSpaarOver(); spaarOverKies('drie'); spaarOverZet(); });
    const r = await page.evaluate(() => ({ deel: terugzetDeel(thisYM()), tz: terugzetProjectie(), zonder: spaarOver().zonder }));
    expect(r.deel).toBe(231 + 136); expect(r.zonder).toBe(0);
    expect(r.tz.rest.noodfonds).toBe(271); expect(r.tz.bij[2].noodfonds).toBe(136); expect(r.tz.bij[3].noodfonds).toBe(135);
  });
  test('een keuze die niet wordt nagekomen, staat de maand erna weer als verschil', async ({ page }) => {
    const gat = [{ id: 'zg1', M: '2026-10', bedrag: 407, exact: 406.8, keuze: 'alles', bron: [{ id: 'noodfonds', type: 'noodfonds', naam: 'Noodfonds', af: 407 }], delen: [407], op: '2026-10-09' }];
    await P.boot(page, { dag: '2026-11-09', set: { terugzetGat: gat, manualBal: { [P.MAIN]: 3000, [P.SAV]: 3000.20 } } });
    const r = await stand(page);
    expect(r.dekt).toBe(0); expect(r.zonder).toBe(637.8);
  });
  test('een storting telt eerst als terugzetten: is het geld binnen, dan dekt de keuze niets meer', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => terugzetKies('alles'));
    const r = await page.evaluate(() => { TX.push(Object.assign({ id: 'dep', date: '2026-10-08', amount: 231, acc: 'NL01SAVE0000004323', name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }));
      categorize(TX[TX.length - 1]); SET.manualBal['NL01SAVE0000004323'] = 3638; save(); return { dekt: terugzetDekt(), zonder: spaarOver().zonder }; });
    expect(r.dekt).toBe(0); expect(r.zonder).toBe(0);
  });
  test('het logboek noemt de keuze', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => { terugzetKies('alles'); openSpaarOver(); spaarOverKies('alles'); spaarOverZet(); go('logboek'); });
    expect(await page.locator('[data-loggat]').innerText()).toContain('€406,80 toegewezen zonder geld: alles deze maand');
    expect(await page.locator('[data-logterugzet="2026-10"]').innerText()).toContain('€231 uit Noodfonds: alles deze maand');
  });
});

test.describe('d · de rij laat geld en plan apart zien', () => {
  const rij = (page, id) => page.evaluate((i) => { go('vooruit'); const e = document.querySelector(`.plan-item[data-id="${i}"]`), g = e.querySelector('[data-geldregel]');
    const vat = e.querySelector('[data-geldvat]');
    return { tekst: g ? g.innerText.replace(/\s+/g, ' ').trim() : null, d: g ? Object.assign({}, g.dataset) : null, stand: !!e.querySelector('.vat-stand b') && e.innerText.includes('toegewezen /'),
      geldPct: vat ? +vat.dataset.pct : null, terugPct: (e.querySelector('[data-terugvat]') || { dataset: {} }).dataset.pct }; }, id);
  test('alles terugzetten: EUR 3.407 in geld + EUR 231 terug + EUR 362 inleg = EUR 4.000', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => terugzetKies('alles'));
    const r = await rij(page, 'noodfonds');
    expect(r.tekst).toBe('€3.407 in geld + €231 terug + €362 inleg = €4.000 · vol okt 2026');
    expect(+r.d.geld + +r.d.terug + +r.d.inleg).toBe(+r.d.som); expect(+r.d.som).toBe(+r.d.doel);
    expect(r.stand, 'de oude "EUR 3.638 toegewezen" staat er niet').toBe(false);
    expect(r.geldPct, 'de balk toont het geld (3.407) en niet de toewijzing (3.638)').toBeCloseTo(3407 / 4000 * 100, 1);
    expect(+r.terugPct).toBeCloseTo(231 / 4000 * 100, 1);
  });
  test('spreiden: de som is de verwachte stand na deze maand', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => terugzetKies('drie'));
    const r = await rij(page, 'noodfonds');
    expect(r.tekst).toBe('€3.407 in geld + €77 terug + €362 inleg = €3.846 · vol okt 2026');
    expect(+r.d.geld + +r.d.terug + +r.d.inleg).toBe(3846);
  });
  test('op het toestel staat het verschil zonder geld als eigen term, met dezelfde centen als de melding', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('alles'));
    const r = await rij(page, 'noodfonds');
    expect(r.tekst).toBe('€3.000,20 in geld + €406,80 zonder geld + €231 terug + €362 inleg = €4.000 · vol okt 2026');
    expect(Math.round((+r.d.geld + +r.d.zg + +r.d.terug + +r.d.inleg) * 100) / 100).toBe(4000);
  });
  test('zonder iets dat terug moet of zonder geld staat, blijft de gewone rij', async ({ page }) => {
    await P.boot(page, { zonderOpname: true });
    const r = await rij(page, 'noodfonds');
    expect(r.tekst).toBe(null); expect(r.stand).toBe(true);
  });
});

test.describe('e · layout', () => {
  for (const w of [360, 390]) {
    test(`regel, rij en sheet passen op ${w}px`, async ({ page }) => {
      await P.boot(page, Object.assign({ vp: { width: w, height: 800 } }, TOESTEL));
      await page.evaluate(() => { terugzetKies('alles'); go('vooruit'); });
      const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        regel: document.getElementById('spaarOverRegel').getBoundingClientRect().height,
        rij: document.querySelector('[data-geldregel="noodfonds"]').getBoundingClientRect().height }));
      await page.evaluate(() => openSpaarOver());
      const s = await page.evaluate(() => { const e = document.getElementById('sheet'); return { h: document.getElementById('spaarOverSheet').getBoundingClientRect().height, over: e.scrollWidth - e.clientWidth }; });
      console.log(`v371 ${w}px: regel ${Math.round(m.regel)}, rij ${Math.round(m.rij)}, sheet ${Math.round(s.h)}`);
      expect(m.over).toBeLessThanOrEqual(1); expect(s.over).toBeLessThanOrEqual(1);
      expect(m.regel).toBeLessThan(45);
    });
  }
});
