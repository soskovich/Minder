/* v341: kosten van een bezitting zijn geen inleg, en de kaart "Naar je bezittingen" op Plan is weg.
   Het geval van de gebruiker: Peaks (Kayani) ingevuld op EUR 620 op 4 oktober; daarna EUR 3 aan de
   stichting die kosten zijn en EUR 100 echte inleg. Zonder keuze telt de EUR 3 mee (723), met de keuze
   staat er 620 plus alleen de echte inleg (720). De klok staat op 6 oktober 2026.
   Juli, augustus en september dragen elk ook een kostenpost van EUR 3, zodat te meten is of het gemeten
   gemiddelde kosten bevat (punt d). De omschrijvingen zijn GECONSTRUEERD: wat de echte omschrijving van
   de EUR 3 op het toestel draagt, staat alleen daar, en blok 16 toont het. */
const { test, expect } = require('@playwright/test');
const { boot, STICHTING_DESC } = require('./bezit-koppeling.fixture');

/* 8800123 staat alleen in de kosten: een getal dat niet in elke omschrijving staat, zodat de regel dat
   alleen cijfers geen kenmerk zijn iets te weigeren heeft (anders viel hij al op de universaliteit). */
const KOSTEN_DESC = 'STICHTING BEHEER DERDENGELDEN PEAKS KLANT 7712345 KAYANI REKENING KOSTEN 8800123';
/* De inleg van oktober draagt REKENING ook, zodat dat woord VOOR KOSTEN in de omschrijving staat en meer
   raakt: zonder de sortering op wat een woord nog meer raakt, kwam REKENING eerst. */
const INLEG_OKT_DESC = 'STICHTING BEHEER DERDENGELDEN PEAKS KLANT 7712345 KAYANI REKENING INLEG';
const EXTRA = [
  { id: 'k1005', date: '2026-10-05', amount: -3, desc: KOSTEN_DESC },
  { id: 'inl1005', date: '2026-10-05', amount: -100, desc: INLEG_OKT_DESC },
  { id: 'k0705', date: '2026-07-05', amount: -3, desc: KOSTEN_DESC },
  { id: 'k0805', date: '2026-08-05', amount: -3, desc: KOSTEN_DESC },
  { id: 'k0905', date: '2026-09-05', amount: -3, desc: KOSTEN_DESC },
];
let ID = {};
async function start(page, extra) {
  ID = await boot(page, { dag: '2026-10-06', extraTx: extra || EXTRA,
    set: { assets: [
      { id: 'kayani', naam: 'Peaks (Kayani)', waarde: 620, waardeOp: '2026-10-04', grow: true, rend: 5, per: 100 },
      { id: 'pensioen', naam: 'Peaks (pensioen)', waarde: 3200, grow: true, rend: 5, per: 0 } ] } });
  // een regel op het kenmerk KAYANI koppelt alles naar de stichting met dat woord aan Peaks (Kayani)
  await page.evaluate((id) => { const t = TX.find((x) => x.id === id);
    SET.bezitRegels = [{ id: 'br1', asset: 'kayani', partij: bezitPartij(t), soort: 'kenmerk', waarde: 'KAYANI' }]; save(); }, ID.k1005);
}
const stand = (page) => page.evaluate((I) => {
  const a = SET.assets.find((x) => x.id === 'kayani'), W = bezitWaarde(a), G = bezitGemetenGemiddeld('kayani');
  const k = TX.find((x) => x.id === I.k1005);
  return { waarde: W.waarde, inleg: W.inleg, cat: catOf(k), van: bezitVan(k), G: G && G.bedrag,
    bel: vermogensInleg('2026-10').delen.find((d) => d.key === 'bel').bedrag,
    kosten: (bezitKostenVan(k) || {}).bron || null };
}, ID);

test.describe('1 · de kaart op Plan is weg', () => {
  test('Plan toont geen bezittingen-kaart, ook met gekoppelde inleg deze maand', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => { go('vooruit'); renderVooruit();
      return { kaart: !!document.querySelector('#planBezit, [data-planbezit]'), tekst: document.getElementById('s-vooruit').innerText,
        inleg: bezitInleg('kayani', thisYM()), fn: typeof planBezitKaart }; });
    expect(r.inleg, 'invoermeting: er is gekoppelde inleg deze maand').toBeGreaterThan(0);
    expect(r.kaart).toBe(false);
    expect(r.tekst).not.toContain('Naar je bezittingen');
    expect(r.fn).toBe('undefined');
  });
  test('de inleg staat nog bij de bezitting op Vermogen en in de spaarquote', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => { SET.openBez = true; go('vermogen'); renderVermogen();
      return { sub: (document.querySelector('#s-vermogen [data-bezitwaarde="kayani"]') || {}).innerText || '',
        bel: vermogensInleg('2026-10').delen.find((d) => d.key === 'bel').bedrag }; });
    expect(r.sub).toContain('€620 op 4 okt');
    expect(r.sub).toContain('€723');
    expect(r.bel).toBeGreaterThan(0);
  });
});

test.describe('2 · kosten, geen inleg', () => {
  test('c. zonder keuze telt de EUR 3 mee (723); als kosten staat er 620 plus alleen de echte inleg', async ({ page }) => {
    await start(page);
    const voor = await stand(page);
    expect(voor.waarde).toBe(723);
    expect(voor.van).toBe('kayani');
    expect(voor.bel).toBe(103);
    await page.evaluate((id) => bezitKostenZet(id, '', ''), ID.k1005);
    const na = await stand(page);
    expect(na.waarde).toBe(720);
    expect(na.inleg).toBe(100);
    expect(na.cat).toBe('bankkosten');
    expect(na.van, 'niet meer aan de bezitting').toBe(null);
    expect(na.bel, 'niet in de spaarquote').toBe(100);
    expect(na.kosten).toBe('keuze');
    // zonder de echte inleg is het precies de ingevulde EUR 620
  });
  test('c. alleen de kosten na 4 oktober: de waarde is precies EUR 620', async ({ page }) => {
    await start(page, [EXTRA[0]]);
    expect((await stand(page)).waarde).toBe(623);
    await page.evaluate((id) => bezitKostenZet(id, '', ''), ID.k1005);
    expect((await stand(page)).waarde).toBe(620);
  });
  test('b. de keuze telt als uitgave op Bankkosten, en terugdraaien zet alles terug', async ({ page }) => {
    await start(page);
    const voor = await page.evaluate(() => ({ spend: totals('2026-10').spendNorm, bk: catSpendMap('2026-10').bankkosten || 0 }));
    await page.evaluate((id) => bezitKostenZet(id, '', ''), ID.k1005);
    const na = await page.evaluate(() => ({ spend: totals('2026-10').spendNorm, bk: catSpendMap('2026-10').bankkosten || 0 }));
    expect(na.bk - voor.bk).toBe(3);
    expect(Math.round(na.spend - voor.spend)).toBe(3);
    await page.evaluate((id) => bezitKostenTerug(id), ID.k1005);
    const terug = await stand(page);
    expect(terug.waarde).toBe(723);
    expect(terug.cat).toBe('sparen');
    expect(await page.evaluate((id) => OVR[id] === undefined && !(SET.bezitKosten || {})[id], ID.k1005)).toBe(true);
  });
  test('b. een eerdere eigen categorie komt terug bij terugdraaien', async ({ page }) => {
    await start(page);
    await page.evaluate((id) => { OVR[id] = 'sparen'; save(); bezitKostenZet(id, '', ''); bezitKostenTerug(id); }, ID.k1005);
    expect(await page.evaluate((id) => OVR[id], ID.k1005)).toBe('sparen');
  });
  test('b. een regel op het kenmerk maakt ook de eerdere kosten tot kosten, en raakt de inleg niet', async ({ page }) => {
    await start(page);
    await page.evaluate((id) => bezitKostenZet(id, 'kenmerk', 'KOSTEN'), ID.k1005);
    const r = await page.evaluate((I) => ({ cats: ['k0705', 'k0805', 'k0905'].map((k) => catOf(TX.find((x) => x.id === I[k]))),
      inleg: ['peaks0929', 'inl1005'].map((k) => catOf(TX.find((x) => x.id === I[k]))),
      bron: bezitKostenVan(TX.find((x) => x.id === I.k0805)).bron }), ID);
    expect(r.cats).toEqual(['bankkosten', 'bankkosten', 'bankkosten']);
    expect(r.inleg).toEqual(['sparen', 'sparen']);
    expect(r.bron).toBe('regel');
    // regel weghalen zet ze terug
    await page.evaluate(() => bezitKostenRegelWeg(SET.bezitKostenRegels[0].id));
    expect(await page.evaluate((I) => catOf(TX.find((x) => x.id === I.k0805)), ID)).toBe('sparen');
  });
  test('b. een regel op het bedrag raakt de EUR 3 en niet de EUR 100', async ({ page }) => {
    await start(page);
    await page.evaluate((id) => bezitKostenZet(id, 'bedrag', ''), ID.k1005);
    const r = await page.evaluate((I) => ['k0705', 'k0805', 'peaks0929', 'inl1005'].map((k) => catOf(TX.find((x) => x.id === I[k]))), ID);
    expect(r).toEqual(['bankkosten', 'bankkosten', 'sparen', 'sparen']);
  });
  test('b. een kenmerk dat niet in deze omschrijving staat wordt geweigerd en schrijft niets', async ({ page }) => {
    await start(page);
    const ok = await page.evaluate((id) => bezitKostenZet(id, 'kenmerk', 'BESTAATNIET'), ID.k1005);
    expect(ok).toBe(false);
    expect(await page.evaluate((id) => ({ r: SET.bezitKostenRegels, o: OVR[id] }), ID.k1005)).toEqual({ r: undefined, o: undefined });
  });
  test('a. de voorstellen komen uit deze omschrijving, met wat ze nog meer raken, het minst geraakte eerst', async ({ page }) => {
    await start(page);
    const W = await page.evaluate((id) => bezitKostenWoorden(TX.find((x) => x.id === id)).map((x) => [x.woord, x.raakt.map((t) => -t.amount)]), ID.k1005);
    // KOSTEN raakt alleen de drie eerdere EUR 3 en komt eerst; REKENING raakt ook de inleg van oktober;
    // een woord dat in elke andere boeking staat (KAYANI, STICHTING) staat er niet
    expect(W[0]).toEqual(['KOSTEN', [3, 3, 3]]);
    expect(W[1]).toEqual(['REKENING', [100, 3, 3, 3]]);
    expect(W.map((x) => x[0])).not.toContain('KAYANI');
    expect(W.map((x) => x[0])).not.toContain('STICHTING');
    expect(W.map((x) => x[0])).not.toContain('7712345');
    expect(W.map((x) => x[0])).not.toContain('8800123');
  });
  test('d. het gemeten gemiddelde van juli t/m september bevat de kosten tot je ze aanwijst', async ({ page }) => {
    await start(page);
    expect((await stand(page)).G, '(3 + 3 + 3 + 100) / 3').toBe(36);
    await page.evaluate((id) => bezitKostenZet(id, 'kenmerk', 'KOSTEN'), ID.k1005);
    expect((await stand(page)).G, '100 / 3').toBe(33);
  });
  test('de keuze in de sheet: eerst het gevolg, geen voorselectie, en de rij met de weg terug', async ({ page }) => {
    await start(page);
    await page.evaluate((id) => openSheet(id), ID.k1005);
    await page.locator('#sheet [data-bezitrij]').click();
    await page.locator('#sheet [data-bezitlijst] .row', { hasText: 'Dit zijn kosten, geen inleg' }).click();
    const g = await page.locator('#sheet [data-kostengevolg]').innerText();
    expect(g).toContain('€3,00 telt dan niet als inleg bij Peaks (Kayani)');
    expect(g).toContain('Bankkosten');
    expect(await page.evaluate((id) => OVR[id], ID.k1005), 'openen schrijft niets').toBe(undefined);
    await expect(page.locator('#sheet [data-kostenkenmerk="KOSTEN"]')).toContainText('maakt ook 3 andere boekingen tot kosten');
    await page.locator('#sheet [data-kostenalleen]').click();
    await expect(page.locator('#sheet [data-kostenrij]')).toContainText('Kosten van Peaks (Kayani), geen inleg');
    await expect(page.locator('#sheet [data-kostenrij]')).toContainText('jouw keuze bij deze boeking');
    await expect(page.locator('#sheet [data-bezitrij]')).toHaveCount(0);
    await page.locator('#sheet [data-kostenrij] span', { hasText: 'Terugdraaien' }).click();
    await expect(page.locator('#sheet [data-bezitrij]')).toContainText('Peaks (Kayani)');
    expect((await stand(page)).waarde).toBe(723);
  });
  test('blok 16 noemt de kosten, de bedragen per kenmerk en waaruit het gemiddelde bestaat', async ({ page }) => {
    await start(page);
    await page.evaluate((id) => bezitKostenZet(id, '', ''), ID.k1005);
    const t = (await page.evaluate(() => diagBezitKoppeling())).join('\n');
    expect(t).toContain('-> KOSTEN, geen inleg (jouw keuze)');
    expect(t).toContain('KOSTEN: €3,00, €3,00, €3,00, €3,00');
    expect(t).toContain('INLEG: €100,00, €100,00');
    expect(t).toMatch(/Peaks \(Kayani\): €36 per maand uit 4 boeking\(en\)/);
    expect(t).toContain('kosten naar dezelfde partij in dit venster, niet meegeteld: geen');
    expect(await page.evaluate(() => { let n = 0; const o = localStorage.setItem; localStorage.setItem = function () { n++; return o.apply(this, arguments); }; diagBezitKoppeling(); localStorage.setItem = o; return n; })).toBe(0);
  });
  test('de sheets passen op 360 en 390px', async ({ page }) => {
    await start(page);
    for (const w of [360, 390]) {
      await page.setViewportSize({ width: w, height: 800 });
      await page.evaluate((id) => openBezitKostenVraag(id), ID.k1005);
      const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, h: document.getElementById('sheet').scrollHeight }));
      expect(r.sw).toBe(w);
      console.log('kostenvraag', w, r.h);
    }
  });
});
