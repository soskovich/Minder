/* v371: DE VERDELING VAN JE INLEG: OP VOLGORDE OF ZELF, EN TERUGZETTEN DAT DOORSCHUIFT ALS DE BRON HET NIET DRAAGT.
   De stand van het toestel in de volgorde van de gebruiker (Noodfonds, Inrichting, Kosten Koper), met de EUR 231
   eruit gehaald en "alles deze maand" gekozen. Datums komen uit planVooruit()/etaDatum(), niet uit de test. */
const { test, expect } = require('@playwright/test');
const P = require('./opschonen-stand');

const VOLGORDE = { set: { planOrder: ['noodfonds', 'iw', 'kk'] } };
const boot = async (page, o) => { await P.boot(page, o || VOLGORDE); await page.evaluate(() => { terugzetKies('alles'); go('vooruit'); }); };
const sheet = (page) => page.evaluate(() => document.getElementById('verdelingSheet').innerText.replace(/\s+/g, ' '));
const opslag = (page) => page.evaluate(() => [localStorage.getItem('minder_set'), localStorage.getItem('minder_plan')].join('|'));

test.describe('a · de lopende maand telt mee en het terugzetbedrag blijft bij de bron', () => {
  test('Noodfonds vol okt 2026, Inrichting nov 2026, Kosten Koper jun 2027, alles jun 2027', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const Pl = allocatePlan(), V = planVooruit(Pl, planCapacity());
      return Object.fromEntries(Pl.map((p) => [p.id, etaDatum(V[p.id])])); });
    expect(r).toEqual({ noodfonds: 'okt 2026', iw: 'nov 2026', kk: 'jun 2027' });
    expect(await page.locator('[data-planwaarschuwing="kk"]').innerText()).toContain('vol jun 2027');
  });
  test('de EUR 231 vult het Noodfonds tot zijn doel en niet erboven, en toegewezen deze maand sluit', async ({ page }) => {
    await boot(page);
    const g = await page.locator('[data-geldregel="noodfonds"]').innerText();
    expect(g.replace(/\s+/g, ' ')).toBe('€3.407 in geld + €231 terug + €362 inleg = €4.000 · vol okt 2026');
    const t = await page.evaluate(() => { const e = document.getElementById('planToeMaand'); return { toe: +e.dataset.toegewezen, te: +e.dataset.teverdelen, txt: e.innerText }; });
    expect(t.toe).toBe(2431); expect(t.te).toBe(2431); expect(t.txt).toMatch(/Toegewezen deze maand\s*€2.431 van €2.431/);
  });
  test('een rij noemt geen koers naast een waarschuwing: een uitspraak per rij', async ({ page }) => {
    await boot(page);
    const t = await page.locator('.plan-item[data-id="kk"]').innerText();
    expect(t).not.toContain('op koers'); expect(t).toContain('niet haalbaar');
    /* de uitspraak van het streepje is dezelfde als de waarschuwing, ook buiten de grendel om */
    expect(await page.locator('[data-streep="kk"] .sr-only').textContent()).toBe('Je streefdatum is in deze volgorde niet haalbaar: vol jun 2027.');
  });
});

test.describe('b · doorschuiven als de bron het niet meer kan dragen', () => {
  test('een bron boven zijn doel: alles schuift naar de volgende, en geen doel krijgt meer dan zijn doelbedrag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const Pl = [{ id: 'noodfonds', type: 'noodfonds', naam: 'Noodfonds', doel: 4000, gespaard: 4300, alloc: 0 },
        { id: 'iw', type: 'goal', naam: 'Inrichting', doel: 3000, gespaard: 0, alloc: 1838 }, { id: 'kk', type: 'goal', naam: 'Kosten Koper', doel: 15000, gespaard: 0, alloc: 0 }];
      return terugzetNaarDoel(Pl); });
    expect(r.per.noodfonds || 0).toBe(0); expect(r.per.iw).toBe(231);
    expect(r.door.iw[0]).toMatchObject({ van: 'noodfonds', bedrag: 231, waarom: 'is vol' });
  });
  test('een gepauzeerde bron: Inrichting krijgt EUR 1.838 + EUR 231, met de reden, en het sluit nog steeds', async ({ page }) => {
    await P.boot(page, { set: { planOrder: ['noodfonds', 'kk', 'iw'], nfToegewezen: 4000, manualBal: { [P.MAIN]: 3000, [P.SAV]: 4269 },
      goals: [{ id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 500, streefdatum: '2027-05', allocMode: 'auto' },
        { id: 'iw', naam: 'Inrichting', doel: 3000, gespaard: 0, streefdatum: '2027-03', allocMode: 'auto' }] } });
    await page.evaluate(() => { terugzetKies('alles'); SET.planPaused = { kk: true }; save(); go('vooruit'); render(); });
    const r = await page.evaluate(() => ({ bron: SET.terugzet['2026-10'].bron.map((b) => b.id), T: terugzetNaarDoel(), toe: +document.getElementById('planToeMaand').dataset.toegewezen,
      te: +document.getElementById('planToeMaand').dataset.teverdelen, sub: (document.querySelector('[data-doorvan]') || {}).innerText }));
    expect(r.bron).toEqual(['kk']); expect(r.T.per.iw).toBe(231); expect(r.toe).toBe(r.te);
    expect(r.sub).toBe('€2.200 + €231 terug (Kosten Koper staat op pauze)');
  });
  test('het doorgeschoven bedrag staat in de projectie van de ontvanger', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const Pl = allocatePlan(); const zonder = planVooruit(Pl, planCapacity(), undefined, undefined, null);
      const met = planVooruit(Pl, planCapacity()); return { zonder: zonder.iw, met: met.iw }; });
    expect(r.met).toBe(r.zonder);   // op deze stand draagt het Noodfonds hem zelf: niets schuift door
  });
});

test.describe('c · de verdeling aanpassen', () => {
  test('de regel op de kaart opent de sheet, op volgorde staat aan, en er staat per doel bedrag en vol-datum', async ({ page }) => {
    await boot(page);
    expect((await page.locator('[data-verdelingregel]').innerText()).replace(/\s+/g, ' ')).toBe('Verdeling: op volgorde aanpassen ›');
    await page.click('[data-verdelingregel]');
    expect(await page.locator('[data-vdmodus="volgorde"]').getAttribute('data-aan')).toBe('1');
    const t = await sheet(page);
    expect(t).toContain('Verdeling van je inleg €2.200 per maand');
    expect(t).toContain('1 Noodfonds vol okt 2026 €362');
    expect(t).toContain('2 Inrichting vol nov 2026 €1.838');
    expect(t).toContain('3 Kosten Koper start nov 2026 · vol jun 2027 €0');
    expect(t).toContain('+ €231 terugzetten · deze maand gaat terug naar Noodfonds; is die vol, dan naar het volgende doel. Het hoort niet bij de €2.200 die je verdeelt.');
    expect(await page.locator('[data-vdbevestig]').isDisabled()).toBe(true);
  });
  test('zelf verdelen: de buffer is een vaste regel, de teller begint op EUR 1.838, de vakken zijn leeg en niets is gekozen', async ({ page }) => {
    await boot(page); await page.evaluate(() => openVerdeling()); await page.click('[data-vdmodus="zelf"]');
    expect((await page.locator('[data-vdbuffer]').innerText()).replace(/\s+/g, ' ')).toBe('Noodfonds €362 gaat eerst, tot vol');
    expect(await page.locator('[data-vdvak="noodfonds"]').count()).toBe(0);
    expect(await page.locator('[data-vdteller]').getAttribute('data-vdteller')).toBe('1838');
    expect(await page.$$eval('[data-vdvak]', (v) => v.map((x) => x.value))).toEqual(['', '']);
    expect(await page.locator('[data-vdbijvol][data-gekozen="1"]').count()).toBe(0);
    expect(await page.locator('[data-vdbevestig]').isDisabled()).toBe(true);
    expect(await page.locator('[data-voetreden]').innerText()).toContain('Verdeel eerst de laatste €1.838');
  });
  test('bevestigen kan niet bij een rest of zonder vol-keuze, en wel als beide rond zijn', async ({ page }) => {
    await boot(page); await page.evaluate(() => { openVerdeling(); verdelingModus('zelf'); verdelingBijVol('volgende'); verdelingBedrag('iw', '1000'); });
    expect(await page.locator('[data-vdbevestig]').isDisabled()).toBe(true);
    expect(await page.locator('[data-voetreden]').innerText()).toContain('Verdeel eerst de laatste €838');
    await page.evaluate(() => { verdelingZet(); });   // de schrijver eist het zelf ook
    expect(await page.evaluate(() => SET.planVerdeling)).toBeUndefined();
    await page.evaluate(() => { window._vd.bijVol = null; verdelingBedrag('kk', '838'); });
    expect(await page.locator('[data-vdteller]').innerText()).toMatch(/Nog te verdelen\s*€0 ✓/);
    expect(await page.locator('[data-voetreden]').innerText()).toContain('Kies wat er gebeurt als een doel vol is');
    await page.click('[data-vdbijvol="volgende"]');
    expect(await page.locator('[data-vdbevestig]').isDisabled()).toBe(false);
  });
  test('het maximum per doel is wat het nog nodig heeft', async ({ page }) => {
    await boot(page); await page.evaluate(() => { openVerdeling(); verdelingModus('zelf'); });
    await page.fill('[data-vdvak="iw"]', '5000');
    expect(await page.locator('[data-vdvak="iw"]').inputValue()).toBe('3000');
    expect(await page.locator('[data-vddoel="iw"] [data-vdmax]').innerText()).toBe('max €3.000');
  });
  test('het gevolg loopt mee en zijn datums zijn etaDatum() van de projectie', async ({ page }) => {
    await boot(page); await page.evaluate(() => { openVerdeling(); verdelingModus('zelf'); verdelingBedrag('iw', '1000'); verdelingBedrag('kk', '838'); verdelingBijVol('volgende'); });
    const t = await page.locator('[data-vdgevolgblok]').innerText();
    expect(t.replace(/\s+/g, ' ')).toBe('Gevolg Noodfonds: vol okt 2026 Inrichting: vol dec 2026 (was nov 2026) Kosten Koper: vol jun 2027 Alles vol: jun 2027');
    const r = await page.evaluate(() => [...document.querySelectorAll('[data-vdgevolg]')].map((e) => [e.innerText.split(': ')[1].split(' (')[0], e.dataset.eta === '' ? null : 'vol ' + etaDatum(+e.dataset.eta)]));
    for (const [a, b] of r) expect(a).toBe(b);
  });
  test('wisselen, typen en kiezen schrijven niets tot je bevestigt', async ({ page }) => {
    await boot(page); const voor = await opslag(page);
    await page.evaluate(() => { openVerdeling(); verdelingModus('zelf'); verdelingBedrag('iw', '1000'); verdelingBijVol('vraag'); verdelingModus('volgorde'); verdelingVerplaats('kk', 1); verdelingModus('zelf'); });
    expect(await opslag(page)).toBe(voor);
    await page.evaluate(() => closeSheet()); expect(await opslag(page)).toBe(voor);
  });
  test('bevestigd: de som van zelf verdelen is de inleg, de alloc volgt, en het logboek noemt het', async ({ page }) => {
    await boot(page); await page.evaluate(() => { openVerdeling(); verdelingModus('zelf'); verdelingBedrag('iw', '1000'); verdelingBedrag('kk', '838'); verdelingBijVol('volgende'); });
    await page.click('[data-vdbevestig]');
    const r = await page.evaluate(() => ({ V: SET.planVerdeling, alloc: Object.fromEntries(allocatePlan().map((p) => [p.id, p.alloc])), cap: planCapacity(),
      regel: document.querySelector('[data-verdelingregel]').dataset.verdelingregel }));
    expect(r.V).toMatchObject({ modus: 'zelf', bedragen: { iw: 1000, kk: 838 }, bijVol: 'volgende' });
    expect(r.alloc).toEqual({ noodfonds: 362, iw: 1000, kk: 838 });
    expect(r.alloc.noodfonds + r.alloc.iw + r.alloc.kk).toBe(r.cap); expect(r.regel).toBe('zelf');
    await page.evaluate(() => go('logboek'));
    expect(await page.locator('[data-logverdeling]').innerText()).toContain('Zelf verdeeld: Inrichting €1.000, Kosten Koper €838 · vol: het volgende doel in de volgorde');
  });
  test('op volgorde: slepen wijzigt de volgorde pas na bevestigen, en het noodfonds blijft boven zolang hij niet vol is', async ({ page }) => {
    await boot(page); await page.evaluate(() => openVerdeling());
    expect(await page.evaluate(() => verdelingVerplaats('kk', 0))).toBe(false);
    expect(await page.evaluate(() => verdelingVerplaats('kk', 1))).toBe(true);
    expect(await page.evaluate(() => SET.planOrder)).toEqual(['noodfonds', 'iw', 'kk']);
    expect(await sheet(page)).toContain('2 Kosten Koper');
    await page.click('[data-vdbevestig]');
    expect(await page.evaluate(() => SET.planOrder)).toEqual(['noodfonds', 'kk', 'iw']);
    await page.evaluate(() => go('logboek'));
    expect(await page.locator('[data-logverdeling]').innerText()).toContain('Op volgorde: Noodfonds → Kosten Koper → Inrichting');
  });
  test('slepen met de vinger verplaatst de rij', async ({ page }) => {
    await boot(page); await page.evaluate(() => openVerdeling());
    await page.waitForTimeout(600);   // de sheet schuift in; meet pas als hij stilstaat
    const g = await page.locator('[data-vdgreep="kk"]').boundingBox(), d = await page.locator('[data-vdrij="iw"]').boundingBox();
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2, d.y + 4, { steps: 5 }); await page.mouse.up();
    expect(await page.evaluate(() => window._vd.orde)).toEqual(['noodfonds', 'kk', 'iw']);
  });
  test('na een volle buffer is er geen vaste regel en verdeel je de hele inleg', async ({ page }) => {
    await P.boot(page, { zonderOpname: true, set: { planOrder: ['noodfonds', 'iw', 'kk'], nfToegewezen: 4000, manualBal: { [P.MAIN]: 3000, [P.SAV]: 4000 } } });
    await page.evaluate(() => { go('vooruit'); openVerdeling(); verdelingModus('zelf'); });
    expect(await page.locator('[data-vdbuffer]').count()).toBe(0);
    expect(await page.locator('[data-vdteller]').getAttribute('data-vdteller')).toBe('2200');
  });
});

test.describe('d · dan vraag ik het opnieuw', () => {
  const ZELF = (k) => ({ zonderOpname: true, set: { planOrder: ['noodfonds', 'iw', 'kk'], nfToegewezen: 4000, manualBal: { [P.MAIN]: 3000, [P.SAV]: 7000 },
    goals: [{ id: 'kk', naam: 'Kosten Koper', doel: 15000, gespaard: 0, streefdatum: '2027-05', allocMode: 'auto' },
      { id: 'iw', naam: 'Inrichting', doel: 3000, gespaard: 3000, streefdatum: '2027-03', allocMode: 'auto' }],
    planVerdeling: { modus: 'zelf', bedragen: { iw: 1000, kk: 1200 }, bijVol: k } } });
  test('een vol doel laat zijn bedrag stilliggen, Grip vraagt het, en de sheet staat klaar met het vrije bedrag', async ({ page }) => {
    await P.boot(page, ZELF('vraag'));
    const r = await page.evaluate(() => ({ vrij: planVrij(allocatePlan()), L: gripLetOpItems([], [], []).filter((x) => x.soort === 'verdeling') }));
    expect(r.vrij).toBe(1000); expect(r.L.length).toBe(1);
    expect(r.L[0].naam).toBe('€1.000 van je inleg ligt stil'); expect(r.L[0].sub).toBe('Inrichting is vol · verdeel opnieuw');
    await page.evaluate(() => openVerdeling());
    expect(await page.locator('[data-vdvak="kk"]').inputValue()).toBe('1200');
    expect(await page.locator('[data-vdteller]').getAttribute('data-vdteller')).toBe('1000');
  });
  test('bij het volgende doel zakt het door en vraagt Grip niets', async ({ page }) => {
    await P.boot(page, ZELF('volgende'));
    const r = await page.evaluate(() => ({ vrij: planVrij(allocatePlan()), L: gripLetOpItems([], [], []).filter((x) => x.soort === 'verdeling').length }));
    expect(r.vrij).toBe(0); expect(r.L).toBe(0);
  });
});

test.describe('e · layout', () => {
  for (const w of [360, 390]) {
    test(`Plan-kaart en sheet op ${w}px`, async ({ page }) => {
      await P.boot(page, Object.assign({ vp: { width: w, height: 800 } }, VOLGORDE));
      await page.evaluate(() => { terugzetKies('alles'); go('vooruit'); });
      const kaart = await page.evaluate(() => { const c = document.querySelector('#planKopBedrag').closest('.card'); return { h: c.getBoundingClientRect().height, over: document.documentElement.scrollWidth - document.documentElement.clientWidth }; });
      await page.evaluate(() => openVerdeling()); const a = await page.evaluate(() => document.getElementById('verdelingSheet').getBoundingClientRect().height);
      await page.evaluate(() => { verdelingModus('zelf'); verdelingBedrag('iw', '1000'); verdelingBedrag('kk', '838'); verdelingBijVol('volgende'); });
      const b = await page.evaluate(() => { const s = document.getElementById('sheet'); return { h: document.getElementById('verdelingSheet').getBoundingClientRect().height, over: s.scrollWidth - s.clientWidth }; });
      console.log(`v371 ${w}px: Plan-kaart ${Math.round(kaart.h)}, sheet op volgorde ${Math.round(a)}, zelf ingevuld ${Math.round(b.h)}`);
      expect(kaart.over).toBeLessThanOrEqual(1); expect(b.over).toBeLessThanOrEqual(1);
    });
  }
});
