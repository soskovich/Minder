/* v332: een boeking koppelen aan een bezitting, en beleggen terwijl de voorwaarden niet gehaald zijn.
   Het geval van de gebruiker: EUR 100 op 29 september naar Stichting Beheer Derdengelden, gekoppeld
   aan Peaks (Kayani); de voorwaarden zijn niet gehaald door de dekking van de reserveringen (EUR 37
   tegen EUR 299). Zie bezit-koppeling.fixture.js. */
const { test, expect } = require('@playwright/test');
const { boot, MAIN, SPAAR, PENSIOEN_DESC } = require('./bezit-koppeling.fixture');

let T = null, ID = {};
async function start(page, o) { ID = await boot(page, o); T = ID.peaks0929; return ID; }
const koppel = (page, asset) => page.evaluate(([id, a]) => { zetBezitKoppel(id, a); }, [T, asset]);
const grip = (page) => page.evaluate(() => {
  go('maand'); renderMaand();
  const kaart = (kop) => { const c = [...document.querySelectorAll('#s-maand .card')].find((x) => x.querySelector('.hlabel') && x.querySelector('.hlabel').innerText.trim().toUpperCase() === kop.toUpperCase()); return c || null; };
  const a = kaart('Vraagt aandacht'), b = kaart('Vraagt een beslissing');
  return { aandacht: a ? a.innerText : '', beslis: b ? b.innerText : '', rij: !!document.querySelector('#s-maand [data-beleg="kayani"]'),
    rijTekst: (document.querySelector('#s-maand [data-beleg="kayani"]') || {}).innerText || '' };
});

/* ===== a) de meting: wat er was voor deze ronde ===== */
test.describe('a · de beleggingsinleg in de spaarquote, en geen koppeling', () => {
  test('de boeking staat op Sparen & beleggen en telt al als beleggingsinleg, zonder bezitting', async ({ page }) => {
    await start(page);
    const r = await page.evaluate((id) => {
      const t = TX.find((x) => x.id === id);
      return { cat: catOf(t), bel: beleggingsTx(thisYM()).map((x) => x.id), van: bezitVan(t),
        deel: vermogensInleg(thisYM()).delen.find((d) => d.key === 'bel').bedrag };
    }, T);
    expect(r.cat).toBe('sparen');
    expect(r.bel).toContain(T);
    expect(r.deel).toBe(100);
    expect(r.van, 'zonder keuze hangt hij aan geen bezitting').toBe(null);
  });
  test('zonder koppeling staat hij niet bij de bezitting en niet op Plan', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => { go('vooruit'); renderVooruit(); return { plan: !!document.querySelector('#planBezit'), sub: bezitInlegSub(SET.assets.find((a) => a.id === 'kayani')) }; });
    expect(r.plan).toBe(false);
    expect(r.sub).toBe('');
  });
});

/* ===== b) koppelen per boeking ===== */
test.describe('b · een gekoppelde boeking is gemeten inleg bij die bezitting', () => {
  test('hij hangt aan Peaks (Kayani) en telt in de spaarquote', async ({ page }) => {
    await start(page);
    await koppel(page, 'kayani');
    const r = await page.evaluate((id) => ({ van: bezitVan(TX.find((x) => x.id === id)), inleg: bezitInleg('kayani', thisYM()),
      pensioen: bezitInleg('pensioen', thisYM()), deel: vermogensInleg(thisYM()).delen.find((d) => d.key === 'bel').bedrag }), T);
    expect(r.van).toBe('kayani');
    expect(r.inleg).toBe(100);
    expect(r.pensioen).toBe(0);
    expect(r.deel).toBe(100);
  });
  test('zonder invuldag telt er niets bij op, en zonder afgeronde maand met inleg houdt de reis het ingevulde maandbedrag (v333)', async ({ page }) => {
    await start(page);
    const voor = await page.evaluate(() => fireInputs().belegdItems.map((x) => [x.naam, x.waarde, x.per]));
    await koppel(page, 'kayani');
    const na = await page.evaluate(() => ({ items: fireInputs().belegdItems.map((x) => [x.naam, x.waarde, x.per]),
      waarde: SET.assets.find((a) => a.id === 'kayani').waarde }));
    expect(na.waarde).toBe(1450);
    expect(na.items).toEqual(voor);
  });
  test('de bezitting, de editor en Plan tonen de gemeten inleg', async ({ page }) => {
    await start(page);
    await koppel(page, 'kayani');
    const r = await page.evaluate(() => {
      /* v333: zonder invuldag staat de vraag in de rij, en met een invuldag voor 29 september de
         optelling. Op de invuldag van vandaag telt er niets bij en staat de gemeten maand er weer. */
      SET.assets.find((a) => a.id === 'kayani').waardeOp = '2026-09-30';
      SET.openBez = true; go('vermogen'); renderVermogen();
      const sub = (document.querySelector('#s-vermogen [data-bezitinleg="kayani"]') || {}).innerText || '';
      openAsset('kayani'); const ed = (document.querySelector('#sheet [data-bezitgemeten]') || {}).innerText || ''; closeSheet();
      go('vooruit'); renderVooruit(); const plan = (document.querySelector('#planBezit') || {}).innerText || '';
      return { sub, ed, plan };
    });
    expect(r.sub).toContain('€100 ingelegd in september');
    expect(r.ed).toMatch(/september 2026\s+€100/);
    expect(r.plan).toContain('Peaks (Kayani)');
    expect(r.plan).toContain('€100');
    expect(r.plan).toContain('los van je spaarinleg');
  });
  test('de koppeling staat in de boekingssheet, en een keuze daar schrijft hem', async ({ page }) => {
    await start(page);
    await page.evaluate((id) => openSheet(id), T);
    await expect(page.locator('#sheet [data-bezitrij]')).toContainText('geen bezitting');
    await page.locator('#sheet [data-bezitrij]').click();
    await page.locator('#sheet [data-bezitlijst] .row', { hasText: 'Peaks (Kayani)' }).click();
    await page.locator('#sheet button', { hasText: 'Alleen deze boeking' }).click();
    await expect(page.locator('#sheet [data-bezitrij]')).toContainText('Peaks (Kayani)');
    await expect(page.locator('#sheet [data-bezitrij]')).toContainText('jouw keuze bij deze boeking');
    expect(await page.evaluate((id) => SET.bezitKoppel[id], T)).toBe('kayani');
  });
  test('een uitgave kan niet worden gekoppeld, want die telt al in je maand', async ({ page }) => {
    await start(page);
    const r = await page.evaluate((id) => { const t = TX.find((x) => x.id === id); SET.bezitKoppel = { [t.id]: 'kayani' };
      return { kand: bezitKandidaat(t), van: bezitVan(t), blok: bezitBlok(t) }; }, ID['a2026-09']);
    expect(r.kand).toBe(false);
    expect(r.van).toBe(null);
    expect(r.blok).toBe('');
  });
  test('een keuze voor geen bezitting wint van een regel', async ({ page }) => {
    await start(page);
    const r = await page.evaluate((id) => { bezitRegelZet(id, 'kayani', 'bedrag'); zetBezitKoppel(id, '');
      return bezitVan(TX.find((x) => x.id === id)); }, T);
    expect(r).toBe(null);
  });
});

/* ===== c) de spiegel-toets streept een gekoppelde boeking niet weg ===== */
test('c · met EUR 100 naar je spaarrekening in dezelfde maand blijft de gekoppelde inleg staan', async ({ page }) => {
  await start(page, { extraTx: [{ id: 'spiegel', acc: SPAAR, date: '2026-09-28', amount: 100, name: 'Spaarpot', desc: 'NAAR SPAREN' }] });
  const zonder = await page.evaluate(() => beleggingsTx(thisYM()).map((t) => t.id));
  expect(zonder, 'zonder koppeling streept de spiegel hem weg (de invoer draagt het geval)').not.toContain(T);
  await koppel(page, 'kayani');
  const met = await page.evaluate(() => beleggingsTx(thisYM()).map((t) => t.id));
  expect(met).toContain(T);
});

/* ===== d) een regel voor de volgende, en niet raden ===== */
test.describe('d · een regel onthoudt het kenmerk of het bedrag', () => {
  const OKT = [{ id: 'okt-kayani', date: '2026-09-30', amount: -100 }, { id: 'okt-pensioen', date: '2026-09-30', amount: -100, desc: PENSIOEN_DESC }];
  test('een kenmerk scheidt Kayani van pensioen bij dezelfde partij en hetzelfde bedrag', async ({ page }) => {
    await start(page, { extraTx: OKT });
    const r = await page.evaluate(([id, I]) => { const ok = bezitRegelZet(id, 'kayani', 'kenmerk', 'kayani');
      const v = (x) => bezitVan(TX.find((t) => t.id === I[x]));
      return { ok, kayani: v('okt-kayani'), pensioen: v('okt-pensioen') }; }, [T, ID]);
    expect(r.ok).toBe(true);
    expect(r.kayani).toBe('kayani');
    expect(r.pensioen).toBe(null);
  });
  test('een bedrag-regel voor twee bezittingen op hetzelfde bedrag koppelt niets: de app raadt niet', async ({ page }) => {
    await start(page, { extraTx: OKT });
    const r = await page.evaluate((I) => { bezitRegelZet(I['okt-kayani'], 'kayani', 'bedrag'); bezitRegelZet(I['okt-pensioen'], 'pensioen', 'bedrag');
      delete SET.bezitKoppel[I.peaks0929];
      const t = TX.find((x) => x.id === I.peaks0929); return { van: bezitVan(t), botsing: bezitRegelBotsing(t), blok: bezitBlok(t) }; }, ID);
    expect(r.van).toBe(null);
    expect(r.botsing).toBe(true);
    expect(r.blok).toContain('kies zelf');
  });
  test('alle boekingen naar de partij mag niet zodra een andere bezitting er een regel op heeft', async ({ page }) => {
    await start(page, { extraTx: OKT });
    const r = await page.evaluate((I) => { bezitRegelZet(I['okt-pensioen'], 'pensioen', 'kenmerk', 'pensioen');
      const t = TX.find((x) => x.id === I.peaks0929);
      return { mag: bezitRegelMag(t, 'kayani', 'partij'), gezet: bezitRegelZet(t.id, 'kayani', 'partij'), regels: SET.bezitRegels.length }; }, ID);
    expect(r.mag).toBe('gedeeld');
    expect(r.gezet).toBe(false);
    expect(r.regels).toBe(1);
  });
  test('een kenmerk dat niet in de omschrijving staat wordt geweigerd', async ({ page }) => {
    await start(page);
    const r = await page.evaluate((id) => ({ mag: bezitRegelMag(TX.find((x) => x.id === id), 'kayani', 'kenmerk', 'XYZ999'),
      gezet: bezitRegelZet(id, 'kayani', 'kenmerk', 'XYZ999') }), T);
    expect(r.mag).toBe('nietInOmschrijving');
    expect(r.gezet).toBe(false);
  });
  test('een tweede gelijke regel komt er niet bij', async ({ page }) => {
    await start(page);
    const n = await page.evaluate((id) => { bezitRegelZet(id, 'kayani', 'bedrag'); bezitRegelZet(id, 'kayani', 'bedrag'); return SET.bezitRegels.length; }, T);
    expect(n).toBe(1);
  });
  test('blok 16 noemt de partij, de omschrijvingen en de kenmerken die ze scheiden', async ({ page }) => {
    await start(page, { extraTx: OKT });
    const L = (await page.evaluate(() => diagBezitKoppeling())).join('\n');
    expect(L).toContain('partij "stichting beheer derdengelden": 3 afschrijving(en)');
    expect(L).toMatch(/KAYANI \(2x\)/);
    expect(L).toMatch(/PENSIOEN \(1x\)/);
    expect(L).toContain('voorwaarden open');
  });
});

/* ===== e) de keuze over de voorwaarden ===== */
test.describe('e · gelden de voorwaarden hiervoor, zonder standaard', () => {
  test('zolang je niets kiest is de vraag open, en kijken schrijft niets', async ({ page }) => {
    await start(page);
    await koppel(page, 'kayani');
    const r = await page.evaluate(() => { go('maand'); renderMaand(); openAsset('kayani');
      const k = document.querySelector('#sheet [data-vwkeuze]');
      const stijl = [...document.querySelectorAll('#sheet [data-vwknop]')].map((b) => getComputedStyle(b).borderColor + '|' + getComputedStyle(b).fontWeight);
      return { keuze: k && k.dataset.vwkeuze, stijl, vw: SET.assets.find((a) => a.id === 'kayani').voorwaarden,
        opgeslagen: JSON.parse(localStorage.getItem('minder_set')).assets.find((a) => a.id === 'kayani').voorwaarden }; });
    expect(r.keuze).toBe('open');
    expect(r.stijl[0], 'ja en nee wegen even zwaar').toBe(r.stijl[1]);
    expect(r.vw).toBe(undefined);
    expect(r.opgeslagen).toBe(undefined);
  });
  test('opslaan in de editor houdt de keuze en de pauze vast', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => { zetBezitVoorwaarden('kayani', true); SET.assets.find((a) => a.id === 'kayani').pauze = { sinds: '2026-09', perVoor: 100 };
      openAsset('kayani'); saveAsset('kayani'); const a = SET.assets.find((x) => x.id === 'kayani'); return { vw: a.voorwaarden, pauze: a.pauze }; });
    expect(r.vw).toBe(true);
    expect(r.pauze).toEqual({ sinds: '2026-09', perVoor: 100 });
  });
});

/* ===== f) Grip ===== */
test.describe('f · Je belegde EUR 100 in Peaks (Kayani) onder Vraagt aandacht', () => {
  test('met voorwaarden op ja: de lijstregel, zonder oordeel', async ({ page }) => {
    await start(page);
    await koppel(page, 'kayani');
    await page.evaluate(() => zetBezitVoorwaarden('kayani', true));
    const g = await grip(page);
    expect(g.rij).toBe(true);
    expect(g.aandacht).toContain('Je belegde €100 in Peaks (Kayani)');
    expect(g.rijTekst).toMatch(/voorwaarden nog niet gehaald\s*›?$/);
    expect(g.beslis).not.toContain('Peaks');
  });
  test('de sheet noemt de voorwaarde die ontbreekt, met zijn waarde en drempel, en de twee keuzes', async ({ page }) => {
    await start(page);
    await koppel(page, 'kayani');
    await page.evaluate(() => zetBezitVoorwaarden('kayani', true));
    await grip(page);
    await page.locator('#s-maand [data-beleg="kayani"]').click();
    await expect(page.locator('#sheet [data-belegmist="dekking"]')).toContainText('Dekking reserveringen');
    await expect(page.locator('#sheet [data-belegmist="dekking"]')).toContainText('€37 tegen €299');
    await expect(page.locator('#sheet [data-belegmist]')).toHaveCount(1);
    await expect(page.locator('#sheet [data-belegkeuze] button')).toHaveText(['Bewust doorgaan', 'Ik zet de inleg zelf stil']);   // v337: heette 'Inleg pauzeren'
    await expect(page.locator('#sheet')).toContainText('29 september');
  });
  test('met voorwaarden op nee staat er geen regel', async ({ page }) => {
    await start(page);
    await koppel(page, 'kayani');
    await page.evaluate(() => zetBezitVoorwaarden('kayani', false));
    expect((await grip(page)).rij).toBe(false);
  });
  test('met een open vraag staat de regel er, en de sheet vraagt eerst of ze gelden', async ({ page }) => {
    await start(page);
    await koppel(page, 'kayani');
    const g = await grip(page);
    expect(g.rij).toBe(true);
    expect(g.rijTekst).toContain('nog niet gekozen of ze hiervoor gelden');
    await page.locator('#s-maand [data-beleg="kayani"]').click();
    await expect(page.locator('#sheet [data-belegopen]')).toBeVisible();
    await expect(page.locator('#sheet [data-belegkeuze]')).toHaveCount(0);
    await page.locator('#sheet [data-belegopen] button', { hasText: 'Ja' }).click();
    await expect(page.locator('#sheet [data-belegkeuze]')).toBeVisible();
    expect(await page.evaluate(() => SET.assets.find((a) => a.id === 'kayani').voorwaarden)).toBe(true);
  });
  test('zonder koppeling geen regel: een ingevulde periodieke inleg is geen meting', async ({ page }) => {
    await start(page);
    await page.evaluate(() => zetBezitVoorwaarden('kayani', true));
    expect((await grip(page)).rij).toBe(false);
  });
  test('met de voorwaarden gehaald geen regel', async ({ page }) => {
    await start(page, { set: { manualBal: { [MAIN]: 2000, [SPAAR]: 9000, ['NL01RESV0000007586']: 400 } } });
    await koppel(page, 'kayani');
    await page.evaluate(() => zetBezitVoorwaarden('kayani', true));
    expect(await page.evaluate(() => beleggenKlaar(maandRegels()).klaar)).toBe(true);
    expect((await grip(page)).rij).toBe(false);
  });
  test('een voorwaarde die niet te beoordelen is, is geen ontbrekende: geen regel', async ({ page }) => {
    /* De dekking staat hier goed (EUR 400 in de pot), dus het enige wat ontbreekt is de buffernorm, en
       die is niet gekozen en dus niet te beoordelen. Een voorwaarde die WEL meetbaar faalt naast een
       onbekende laat de regel staan: dat is de volgende test. */
    await start(page, { set: { bufferNorm: null, manualBal: { [MAIN]: 2000, [SPAAR]: 9000, ['NL01RESV0000007586']: 400 } } });
    await koppel(page, 'kayani');
    await page.evaluate(() => zetBezitVoorwaarden('kayani', true));
    const B = await page.evaluate(() => beleggenKlaar(maandRegels()));
    expect(B.volledig).toBe(false);
    expect((await grip(page)).rij).toBe(false);
  });
});

test('f · een meetbaar falende voorwaarde naast een onbekende laat de regel staan, met alleen de meetbare in de sheet', async ({ page }) => {
  await start(page, { set: { bufferNorm: null } });
  await koppel(page, 'kayani');
  await page.evaluate(() => zetBezitVoorwaarden('kayani', true));
  expect((await grip(page)).rij).toBe(true);
  await page.locator('#s-maand [data-beleg="kayani"]').click();
  await expect(page.locator('#sheet [data-belegmist]')).toHaveCount(1);
  await expect(page.locator('#sheet [data-belegmist="dekking"]')).toContainText('€37 tegen €299');
});

/* ===== g) bewust doorgaan en pauzeren ===== */
test.describe('g · een keuze geldt voor de maand', () => {
  test('bewust doorgaan wordt bewaard en haalt de regel voor september weg', async ({ page }) => {
    await start(page);
    await koppel(page, 'kayani');
    await page.evaluate(() => { zetBezitVoorwaarden('kayani', true); belegKies('kayani', 'door'); });
    const r = await page.evaluate(() => SET.belegKeuze.kayani);
    expect(r.maand).toBe('2026-09');
    expect(r.keuze).toBe('door');
    expect((await grip(page)).rij).toBe(false);
  });
  test('de maand erna komt de vraag terug bij nieuwe inleg, zolang de voorwaarden niet gehaald zijn', async ({ page }) => {
    await start(page, { dag: '2026-10-03', set: { budgetMonth: '2026-10', resCheck: '2026-10',
      belegKeuze: { kayani: { maand: '2026-09', keuze: 'door', op: '2026-09-30' } } },
      extraTx: [{ id: 'okt', date: '2026-10-02', amount: -100 }] });
    await page.evaluate((id) => { zetBezitVoorwaarden('kayani', true); bezitRegelZet(id, 'kayani', 'kenmerk', 'KAYANI'); delete SET.bezitKoppel[id]; save(); }, ID.okt);
    const g = await grip(page);
    expect(g.rij).toBe(true);
    expect(g.aandacht).toContain('Je belegde €100 in Peaks (Kayani)');
  });
  /* v337: "Ik zet de inleg zelf stil" (tot v337 "Inleg pauzeren") verandert NIETS: de periodieke inleg
     blijft staan en de keuze wordt een afspraak. Een pauze van voor v337 (a.pauze) blijft te hervatten. */
  test('ik zet de inleg zelf stil: Minder stopt niets, de periodieke inleg blijft, het voornemen wordt bewaard', async ({ page }) => {
    await start(page);
    await koppel(page, 'kayani');
    await page.evaluate(() => zetBezitVoorwaarden('kayani', true));
    await grip(page);
    await page.locator('#s-maand [data-beleg="kayani"]').click();
    await expect(page.locator('#sheet')).toContainText('Minder stopt niets: je stopt de inleg voor Peaks (Kayani) zelf, in de app waar je belegt of bij je bank. De periodieke inleg van €100 in je Vermogensreis blijft staan. Je voornemen wordt bewaard');
    const voorReis = await page.evaluate(() => fireInputs().belegdItems.find((x) => x.naam === 'Peaks (Kayani)').per);
    await page.locator('#sheet [data-belegkeuze] button', { hasText: 'Ik zet de inleg zelf stil' }).click();
    const r = await page.evaluate(() => { const a = SET.assets.find((x) => x.id === 'kayani');
      return { per: a.per, pauze: a.pauze, keuze: SET.belegKeuze.kayani.keuze, reis: fireInputs().belegdItems.find((x) => x.naam === 'Peaks (Kayani)').per,
        af: afsprakenLijst().filter((x) => x.soort === 'pauze').map((x) => ({ asset: x.assetId, wat: x.wat })) }; });
    expect(r.per).toBe(100);
    expect(r.pauze).toBe(undefined);
    expect(r.keuze).toBe('pauze');
    expect(r.reis).toBe(voorReis);
    expect(r.af).toEqual([{ asset: 'kayani', wat: 'Inleg naar Peaks (Kayani) zelf stilzetten' }]);
  });
  test('een pauze van voor v337 blijft te hervatten', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => { const a = SET.assets.find((x) => x.id === 'kayani'); a.pauze = { sinds: '2026-08', perVoor: 100 }; a.per = 0;
      belegHervat('kayani'); return { per: a.per, pauze: a.pauze }; });
    expect(r).toEqual({ per: 100, pauze: undefined });
  });
});

/* ===== h) hoogte ===== */
for (const w of [360, 390]) {
  test(`h · de aandacht-kaart op ${w}px, zonder overloop`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await start(page);
    const voor = await page.evaluate(() => { go('maand'); renderMaand();
      const c = [...document.querySelectorAll('#s-maand .card')].find((x) => x.querySelector('.hlabel') && /vraagt aandacht/i.test(x.querySelector('.hlabel').innerText));
      return c ? Math.round(c.getBoundingClientRect().height) : 0; });
    await koppel(page, 'kayani');
    await page.evaluate(() => zetBezitVoorwaarden('kayani', true));
    const na = await page.evaluate(() => { go('maand'); renderMaand();
      const c = [...document.querySelectorAll('#s-maand .card')].find((x) => x.querySelector('.hlabel') && /vraagt aandacht/i.test(x.querySelector('.hlabel').innerText));
      return { h: Math.round(c.getBoundingClientRect().height), over: document.documentElement.scrollWidth > window.innerWidth }; });
    console.log(`aandacht-kaart ${w}px: ${voor} -> ${na.h}`);
    expect(na.over).toBe(false);
    expect(na.h).toBeGreaterThan(voor);
  });
}
