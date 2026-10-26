/* v371: TOEGEWEZEN ZONDER GELD BLIJFT ZICHTBAAR TOT JIJ HET RECHTTREKT, EN DE RIJ LAAT GELD EN PLAN APART ZIEN.
   De stand van het toestel (opschonen-stand met een saldo van EUR 3.000,20): EUR 3.638 toegewezen aan het Noodfonds,
   EUR 231 op 5 oktober eruit gehaald. Een keuze over die EUR 231 dekt alleen haar eigen bedrag, dus er blijft
   EUR 406,80 toegewezen zonder geld, en dat staat er tot je verlaagt of terugzet. Niets gebeurt vanzelf. */
const { test, expect } = require('@playwright/test');
const P = require('./opschonen-stand');

const TOESTEL = { set: { manualBal: { [P.MAIN]: 3000, [P.SAV]: 3000.20 } } };
const stand = (page) => page.evaluate(() => { go('vooruit'); const r = document.getElementById('spaarOverRegel');
  /* v440: de Plan-regel (#spaarOverRegel) is sinds v440 "Inhalen" (opzijInhalen), niet meer "toegewezen zonder geld". Dat laatste
     blijft als signaal op Grip: toewijzingBovenSaldo() is de bron, en die draagt nog steeds spaarOver().zonder. */
  const O = spaarOver(); return { regel: r ? r.innerText.replace(/\s+/g, ' ').trim() : '', tb: toewijzingBovenSaldo(), zonder: O.zonder, dekt: O.dekt, over: O.over,
    nf: SET.nfToegewezen, gat: (SET.terugzetGat || []).length,
    /* v380: de kop "Te verdelen" (#planKopBedrag) is vervallen; het bedrag staat als functie (planToeMaand().teVerdelen)
       en als tegel "Deze maand opzij" in de kop van Plan ([data-kpiopzij]) */
    kop: planToeMaand().teVerdelen, opzij: +document.querySelector('#planKpi [data-kpiopzij]').dataset.kpiopzij,
    kopWeg: !document.getElementById('planKopBedrag'),
    /* v470: de Plan-regel leest planTerug(): wat er toegewezen staat en niet op je spaarrekening, per doel opgeteld */
    terug: planTerug().totaal, verwacht: (() => { const R = planTerug(); return R.totaal >= 0.5 ? 'Terug te zetten ' + euroC(R.totaal) + ' per doel ›' : ''; })() }; });
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
    expect(r.tb.verschil).toBe(638);   // v440: 'toegewezen zonder geld' staat nu op Grip (toewijzingBovenSaldo), niet in de Plan-regel
  });
  test('na een keuze voor de EUR 231 blijft EUR 406,80 staan, en niet nul', async ({ page }) => {
    await P.boot(page, TOESTEL);
    for (const k of ['alles', 'drie']) {
      await page.evaluate((x) => { terugzetHerstel(thisYM()); terugzetKies(x); }, k);
      const r = await stand(page);
      expect(r.dekt, k).toBe(231); expect(r.zonder, k).toBe(406.8);
      expect(r.tb.verschil, k).toBe(407);   // v440: via toewijzingBovenSaldo op Grip
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
    expect(r.zonder).toBe(0); expect(r.terug).toBe(231); expect(r.regel).toBe(r.verwacht);   // v470: EUR 231 staat nog niet op je spaarrekening
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
    /* v380: zonder keuze vult de inleg de EUR 406,80 pas in november aan, dus het Noodfonds is nu vol in november
       (oktober 362 rest, november 407). Verlagen haalt dat weg: rest 769, en oktober draagt 231 terug plus 769 inleg, dus
       vol okt; Kosten Koper krijgt in oktober 407 minder en in november 407 meer, dus zijn datum blijft. Alles terugzetten
       zet de 407 er deze maand bij: Noodfonds vol okt en Kosten Koper 407 eerder (4.038 + 2.200 per maand haalt 15.000 in
       april, tegen 3.631 + 2.200 per maand in mei). Over drie maanden: het laatste deel valt in december (de vol-datum is
       de maand van het laatste terugzetdeel), en Kosten Koper krijgt dezelfde 407 voorsprong. */
    expect(t).toContain('Noodfonds €3.638 → €3.231 · Noodfonds vol okt 2026 (was nov 2026)');
    expect(t).not.toContain('Kosten Koper vol mei 2027 (was apr 2027)');
    expect(t).toContain('Zet het terug · alles deze maand');
    expect(t).toContain('€407 extra deze maand, je toewijzingen blijven staan · Noodfonds vol okt 2026 (was nov 2026) · Kosten Koper vol apr 2027 (was mei 2027)');
    expect(t).toContain('Zet het terug · over 3 maanden');
    expect(t).toContain('€136 extra per maand t/m dec · Noodfonds vol dec 2026 (was nov 2026) · Kosten Koper vol apr 2027 (was mei 2027)');
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
    expect(r.nf).toBe(3231); expect(r.zonder).toBe(0); expect(r.terug).toBe(230.8); expect(r.regel).toBe(r.verwacht);   // v470: de keuze zet de EUR 230,80 nog terug
  });
  test('alles terugzetten: de inleg van deze maand draagt hem, de toewijzing blijft, en de regel is weg', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('alles'));
    await page.evaluate(() => { openSpaarOver(); spaarOverKies('alles'); spaarOverZet(); });
    const r = await stand(page);
    expect(r.nf).toBe(3638); expect(r.zonder).toBe(0); expect(r.terug).toBe(637.8); expect(r.regel).toBe(r.verwacht);   // v470: tot de storting staat het er
    expect(r.kop).toBe(2838);   // planToeMaand().teVerdelen (inleg + terug)
    expect(r.kopWeg).toBe(true);
    /* v440: de kop toont "Opzij deze periode" (opzijPeriode), niet meer "Deze maand opzij" met een terug-chip; het
       terugzetdeel staat gemarkeerd in "verdeling ⚙" (openPlanInstel()). */
    expect(await page.locator('#terugzetGekozen').count()).toBe(0);
    await page.evaluate(() => openPlanInstel());
    expect(await page.locator('[data-instelterug="alles"]').getAttribute('data-gekozen')).toBe('1');
    expect(await page.locator('[data-instelgat="alles"]').innerText()).toContain('€407 · alles deze maand · gekozen');
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

/* v380: DE REKENSOM STAAT NIET MEER IN DE RIJ ([data-geldregel] is vervallen) MAAR IN DE DETAILSHEET (openPlanDoel(),
   [data-op]). De eigenschap blijft: de balk van de rij is het GELD dicht ([data-geldvat]) met wat er deze maand bijkomt
   gearceerd ([data-bijvat], terug en inleg samen), links "geld / doel" en niet de toewijzing, en de rekensom telt geld plus
   terug plus inleg op tot de stand eind deze maand. Zonder geld telt sinds v380 NIET in die stand (planStandEind()): het
   staat er als eigen regel ([data-op="zg"]) onder de som. */
test.describe('d · de rij laat geld en plan apart zien', () => {
  const rij = (page, id) => page.evaluate((i) => { go('vooruit'); const e = document.querySelector(`.plan-item[data-id="${i}"]`);
    const vat = e.querySelector('[data-geldvat]'), bij = e.querySelector('[data-bijvat]');
    const r = { status: e.dataset.status, geld: e.querySelector('[data-rijgeld]').innerText.replace(/\s+/g, ' ').trim(), vol: e.querySelector('[data-rijvol]').innerText,
      tekst: e.innerText, geldPct: vat ? +vat.dataset.pct : null, bijPct: bij ? +bij.dataset.pct : null, geldregel: e.querySelectorAll('[data-geldregel]').length };
    openPlanDoel(i);
    r.op = Object.fromEntries([...document.querySelectorAll('#planDoelSheet [data-op]')].map((o) => [o.dataset.op, o.dataset.bedrag == null ? o.innerText.replace(/\s+/g, ' ').trim() : +o.dataset.bedrag]));
    r.eindVol = (document.querySelector('#planDoelSheet [data-op="eind"]') || { dataset: {} }).dataset.vol;
    r.eindvol = (document.querySelector('#planDoelSheet [data-eindvol]') || {}).innerText || null;
    r.nog = (document.querySelector('#planDoelSheet [data-nognodig]') || { dataset: {} }).dataset.nognodig;
    closeSheet(); return r; }, id);
  test('alles terugzetten: EUR 3.407 in geld + EUR 231 terug + EUR 362 inleg = EUR 4.000', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => terugzetKies('alles'));
    const r = await rij(page, 'noodfonds');
    expect(r.geldregel, 'de rekensom staat niet meer in de rij').toBe(0);
    expect(r.op).toEqual({ geld: 3407, terug: 231, inleg: 362, eind: 4000 });
    expect(r.op.geld + r.op.terug + r.op.inleg).toBe(r.op.eind); expect(r.eindVol).toBe('1');
    expect(r.vol).toBe('vol okt 2026 ›'); expect(r.status).toBe('volin');
    expect(r.geld).toBe('€3.407 / €4.000');
    expect(r.tekst, 'de oude "EUR 3.638 toegewezen" staat er niet').not.toContain('3.638');
    expect(r.geldPct, 'de balk toont het geld (3.407) en niet de toewijzing (3.638)').toBeCloseTo(3407 / 4000 * 100, 1);
    expect(r.bijPct, 'terug en inleg samen gearceerd').toBeCloseTo((231 + 362) / 4000 * 100, 1);
  });
  /* v380: wat er na deze maand nog terugkomt (2 x 77) is pending en wordt niet door inleg gevuld; vol is de maand van het
     laatste deel. 3.407 + 77 + 362 = 3.846 eind oktober, plus 77 in november en 77 in december: vol dec 2026 (was okt). */
  test('spreiden: de som is de verwachte stand na deze maand, en vol valt op het laatste deel', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => terugzetKies('drie'));
    const r = await rij(page, 'noodfonds');
    expect(r.op.geld + r.op.terug + r.op.inleg).toBe(3846); expect(r.op.eind).toBe(3846); expect(r.eindVol).toBe('0');
    expect(r.op.later).toBe(154);
    expect(r.eindvol).toBe('vol dec 2026 (met het laatste terugzetdeel)');
    expect(r.vol).toBe('vol dec 2026 ›'); expect(r.status).toBe('bijnavol');
  });
  /* v380: zonder geld telt niet in de stand eind oktober: 3.000,20 + 231 + 362 = 3.593,20, en de EUR 406,80 staat apart,
     met dezelfde centen als de melding. De inleg vult hem in november aan, dus vol nov 2026 (was okt, toen de som het
     zonder-geld-deel meetelde tot 4.000). */
  test('op het toestel staat het verschil zonder geld als eigen regel, met dezelfde centen als de melding', async ({ page }) => {
    await P.boot(page, TOESTEL); await page.evaluate(() => terugzetKies('alles'));
    const r = await rij(page, 'noodfonds');
    expect(r.op.geld).toBe(3000.2); expect(r.op.terug).toBe(231); expect(r.op.inleg).toBe(362);
    expect(r.op.eind).toBe(3593.2); expect(r.eindVol).toBe('0');
    /* v381: de regel zegt dat er nog niet gekozen is (de keuzes staan eronder); de centen blijven die van de melding */
    expect(r.op.zg).toBe('€406,80 toegewezen zonder geld · nog niet gekozen');
    expect(+r.nog).toBe(406.8);
    expect((await stand(page)).tb.verschil).toBe(407);   // v440: via toewijzingBovenSaldo op Grip
    /* v381: zonder keuze over dat geld is de datum voorlopig */
    expect(r.vol).toBe('vol nov 2026 · voorlopig ›');
  });
  test('zonder iets dat terug moet of zonder geld staat, blijft de gewone som', async ({ page }) => {
    await P.boot(page, { zonderOpname: true });
    const r = await rij(page, 'noodfonds');
    expect(Object.keys(r.op)).toEqual(['geld', 'inleg', 'eind']);
    expect(r.op.geld).toBe(3638); expect(r.geld).toBe('€3.638 / €4.000');
    expect(await page.evaluate(() => planStandEind().per.noodfonds.gesplitst)).toBe(false);
  });
});

test.describe('e · layout', () => {
  for (const w of [360, 390]) {
    test(`regel, rij en sheet passen op ${w}px`, async ({ page }) => {
      await P.boot(page, Object.assign({ vp: { width: w, height: 800 } }, TOESTEL));
      await page.evaluate(() => { terugzetKies('alles'); go('vooruit'); });
      // v440: "toegewezen zonder geld" staat niet meer als Plan-regel (die is nu Inhalen); deze test meet de keuze-sheet
      // (openSpaarOver) en de pagina-overflow. De Inhalen-regel-hoogte staat in v440.spec.js.
      const m = await page.evaluate(() => ({ over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        rij: document.querySelector('.plan-item[data-id="noodfonds"]').getBoundingClientRect().height }));
      await page.evaluate(() => openSpaarOver());
      const s = await page.evaluate(() => { const e = document.getElementById('sheet'); return { h: document.getElementById('spaarOverSheet').getBoundingClientRect().height, over: e.scrollWidth - e.clientWidth }; });
      console.log(`v371 ${w}px: rij ${Math.round(m.rij)}, sheet ${Math.round(s.h)}`);
      expect(m.over).toBeLessThanOrEqual(1); expect(s.over).toBeLessThanOrEqual(1);
    });
  }
});
