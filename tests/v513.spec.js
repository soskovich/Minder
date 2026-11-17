/* v513 (gevraagd door de gebruiker): de categorie-keuze in de boekingssheet, "Welke boeking was dit?" en de twee koppen in
   de noodfonds-sheet. Alleen weergave en invoer; geen rekenfunctie, geen categorie van een bestaande boeking, geen getal.
   Elke test draagt een sabotage die hem rood maakt (zie het rapport bij de ronde).
   De service worker staat globaal uit via playwright.config.js. */
const { test, expect } = require('./klok');
const { seed, open, CUR, MAIN } = require('./budget-fixture');

const tx = (token, date, amount, name, desc) => ({ id: token, date, amount, acc: MAIN, name,
  desc: (desc || name).toUpperCase() + ' ' + token, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
async function boot(page, extra) {
  const p = seed({ maanden: 3 });
  const list = JSON.parse(p.minder_tx);
  (extra || []).forEach((t) => list.push(t));
  p.minder_tx = JSON.stringify(list);
  await open(page, p);
}
// categorize() herschrijft t.id tot een hash; vind de boeking terug aan zijn token in de desc.
const findId = (page, token) => page.evaluate((tk) => { const t = TX.find((x) => String(x.desc || '').includes(tk)); return t ? t.id : null; }, token);
const guitems = (page) => page.evaluate(() => [...document.querySelectorAll('#sheet [data-guitem]')].map((e) => e.getAttribute('data-guitem')));
const catpicks = (page) => page.evaluate(() => [...document.querySelectorAll('#sheet .catpick')].map((e) => e.getAttribute('data-catpick')));

test.describe('deel 1 — categorie kiezen', () => {
  test('elke keuze staat precies één keer: geen interne categorie als tegel', async ({ page }) => {
    await boot(page, [tx('ZEXP', CUR + '-10', -50, 'Albert Heijn', 'ALBERT HEIJN')]);
    const id = await findId(page, 'ZEXP');
    await page.evaluate((i) => openSheet(i), id);
    const picks = await catpicks(page);
    // SABOTAGE "Uitgeleend terug als tegel": dan staat 'uitgeleend' wel in de tegels → rood
    for (const k of ['uitgeleend', 'geleend', 'intern', 'sparen', 'persoonlijk', 'onvoorzien']) expect(picks, k).not.toContain(k);
    expect(picks.length).toBe(new Set(picks).size);   // geen tegel dubbel
    // de interne keuzes staan onder "Geen uitgave", elk één keer
    const gu = await guitems(page);
    expect(gu.length).toBe(new Set(gu).size);
  });

  test('bij een bijschrijving staat het uitgaven-raster ingeklapt', async ({ page }) => {
    await boot(page, [tx('ZINC', CUR + '-10', 800, 'Freelance Opdrachtgever', 'FREELANCE OPDRACHTGEVER')]);
    const id = await findId(page, 'ZINC');
    await page.evaluate((i) => openSheet(i), id);
    // SABOTAGE "raster open": dan draagt <details data-uitgaveraster> het attribuut open → rood
    const open = await page.evaluate(() => { const d = document.querySelector('#sheet [data-uitgaveraster]'); return d ? d.open : null; });
    expect(open).toBe(false);
  });

  test('geen voorstelchip is voorgeselecteerd', async ({ page }) => {
    await boot(page, [tx('ZVST', CUR + '-10', -50, 'Albert Heijn', 'ALBERT HEIJN')]);
    const id = await findId(page, 'ZVST');
    await page.evaluate((i) => openSheet(i), id);
    const chips = await page.evaluate(() => [...document.querySelectorAll('#sheet [data-voorstelchip]')].map((e) => ({ cat: e.getAttribute('data-voorstelchip'), on: e.classList.contains('on') })));
    expect(chips.length).toBeGreaterThan(0);   // er is een voorstel (herkend: boodschappen)
    // SABOTAGE "eerste chip aan": chips[0] krijgt .on → rood
    expect(chips.every((c) => !c.on)).toBe(true);
  });

  test('een boeking op Persoonlijke overboeking toont "nu:" en openen verandert de categorie niet', async ({ page }) => {
    await boot(page, [tx('ZPERS', CUR + '-10', -40, 'Tikkie Cas', 'TIKKIE CAS')]);
    const id = await findId(page, 'ZPERS');
    await page.evaluate((i) => setCat(i, 'persoonlijk'), id);
    expect(await page.evaluate((i) => catOf(TX.find((t) => t.id === i)), id)).toBe('persoonlijk');
    await page.evaluate((i) => openSheet(i), id);
    const r = await page.evaluate((i) => { const e = document.querySelector('#sheet [data-cathuidig]'); return { nu: e ? e.innerText : '', c: catOf(TX.find((t) => t.id === i)) }; }, id);
    expect(r.nu).toContain('Persoonlijke overboeking');
    // SABOTAGE "bij openen op Overig zetten": openSheet schrijft OVR[id]='overig' → r.c wordt 'overig' → rood
    expect(r.c).toBe('persoonlijk');
    await page.evaluate(() => closeSheet());
    expect(await page.evaluate((i) => catOf(TX.find((t) => t.id === i)), id)).toBe('persoonlijk');
  });

  test('een eigen categorie met potje staat één keer in het raster en het zoekveld vindt hem', async ({ page }) => {
    await boot(page, [tx('ZEIG', CUR + '-10', -50, 'Albert Heijn', 'ALBERT HEIJN')]);
    // de gebruiker maakte zelf een categorie "Verzorging" met potje; er is geen ingebouwde ernaast (v513-aanvulling)
    await page.evaluate(() => {
      SET.eigenCats = { e_verzorging: { naam: 'Verzorging', aard: 'wisselend', kleur: '#f5a3c7', op: '2026-01-01' } };
      SET.budgets = SET.budgets || {}; SET.budgets.e_verzorging = 50;
      eigenCatsLaad(); save();
    });
    expect(await page.evaluate(() => 'verzorging' in CATS)).toBe(false);   // geen ingebouwde Verzorging meer
    const id = await findId(page, 'ZEIG');
    await page.evaluate((i) => openSheet(i), id);
    const vz = await page.evaluate(() => [...document.querySelectorAll('#sheet .catpick')]
      .map((e) => ({ k: e.getAttribute('data-catpick'), t: e.innerText }))
      .filter((p) => /Verzorging/.test(p.t)));
    // SABOTAGE "eigen categorieën niet in het raster" (uitCats filtert e_* weg): geen tegel → rood
    expect(vz.length).toBe(1);
    expect(vz[0].k).toBe('e_verzorging');
    // het zoekveld vindt hem op naam
    await page.evaluate(() => catSheetZoek('verzorg'));
    expect(await catpicks(page)).toContain('e_verzorging');
  });

  test('de uitgave-tegels zijn minstens 44px hoog (360px)', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await boot(page, [tx('Z44', CUR + '-10', -50, 'Albert Heijn', 'ALBERT HEIJN')]);
    const id = await findId(page, 'Z44');
    await page.evaluate((i) => openSheet(i), id);
    const hs = await page.evaluate(() => [...document.querySelectorAll('#sheet .catpick')].map((e) => e.getBoundingClientRect().height));
    expect(hs.length).toBeGreaterThan(0);
    // SABOTAGE "40px": min-height op de tegel naar 40px → min < 44 → rood
    expect(Math.min(...hs)).toBeGreaterThanOrEqual(44);
  });
});

test.describe('deel 2 — Welke boeking was dit?', () => {
  async function pickOpen(page, extra, res) {
    await boot(page, extra);
    await page.evaluate((r) => { SET.reserveringen = [r]; save(); openResBoekingPick(r.id); }, res);
    await page.waitForSelector('#resBoekZoek');
  }
  const rijen = (page) => page.evaluate(() => [...document.querySelectorAll('#resBoekLijst [data-resboekrij]')].map((e) => ({ id: e.getAttribute('data-resboekrij'), marked: e.hasAttribute('data-resboekmarked'), tekst: e.innerText })));

  test('zoeken op bedrag vindt de advocaatboeking, met komma en met punt', async ({ page }) => {
    await pickOpen(page, [tx('ZADV', CUR + '-12', -1815, 'Advocaat De Jong', 'ADVOCAAT DE JONG'), tx('ZOV', CUR + '-13', -40, 'Diverse Winkel', 'DIVERSE WINKEL')],
      { id: 'r1', naam: 'Advocaat', bedrag: 1815, vervalmaand: '2026-10', intervalM: 12, cat: '' });
    const na = async (q) => { await page.evaluate((v) => resBoekZoek(v), q); return (await rijen(page)).map((r) => r.tekst).join(' | '); };
    expect(await na('1815')).toMatch(/Advocaat/);
    expect(await na('1815')).not.toMatch(/Diverse/);
    // SABOTAGE "alleen punt-notatie": "1.815,00" matcht dan niet op 1815 → rood
    expect(await na('1.815,00')).toMatch(/Advocaat/);
    expect(await na('advocaat')).toMatch(/Advocaat/);   // ook op tegenpartij
  });

  test('een al-gemarkeerde boeking staat erin met label en houdt na koppelen zijn vlag', async ({ page }) => {
    await boot(page, [tx('ZMARK', CUR + '-12', -200, 'Dakdekker', 'DAKDEKKER BV'), tx('ZU', CUR + '-13', -50, 'Diverse Winkel', 'DIVERSE WINKEL')]);
    const mid = await findId(page, 'ZMARK');
    await page.evaluate((i) => { zetUitReservering(i, 120, false); save(); }, mid);
    expect(await page.evaluate((i) => uitReserveringBedrag(TX.find((t) => t.id === i)), mid)).toBe(120);
    await page.evaluate(() => { SET.reserveringen = [{ id: 'r1', naam: 'Dak', bedrag: 200, vervalmaand: '2026-10', intervalM: 0, cat: '' }]; save(); openResBoekingPick('r1'); });
    await page.waitForSelector('#resBoekZoek');
    const r = await rijen(page);
    const row = r.find((x) => x.id === mid);
    expect(row).toBeTruthy();
    expect(row.marked).toBe(true);
    expect(row.tekst).toContain('al gemarkeerd');
    // SABOTAGE "vlag wissen bij koppelen": dan zet resBoekingKies de vlag naar 200 → rood
    await page.evaluate((i) => resBoekingKies('r1', i), mid);
    expect(await page.evaluate((i) => uitReserveringBedrag(TX.find((t) => t.id === i)), mid)).toBe(120);
  });
});

test.describe('deel 3 — noodfonds-sheet', () => {
  test('twee koppen, en ondergrens vastzetten raakt het doelbedrag niet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openNoodfondsPanel());
    const t = await page.evaluate(() => document.querySelector('#sheet').innerText);
    expect(t).toContain('Doelbedrag');
    expect(t).toContain('hoeveel maanden spaar je op');
    expect(t).toContain('Ondergrens');
    expect(t).toContain('vanaf wanneer is je buffer genoeg');
    const voor = await page.evaluate(() => ({ doel: SET.nfDoelVast, mnd: SET.nfMaanden }));
    // ondergrens op 1 kiezen en vastzetten (1 mnd ligt onder het doel, dus het tilt niets op)
    await page.evaluate(() => { normEigenOpen(); normKeuzeZet('1'); normVastzetten(); });
    const na = await page.evaluate(() => ({ doel: SET.nfDoelVast, mnd: SET.nfMaanden }));
    // SABOTAGE "doel meeschrijven": normVastzetten schrijft ook nfDoelVast/nfMaanden → rood
    expect(na.doel).toEqual(voor.doel);
    expect(na.mnd).toEqual(voor.mnd);
  });
});
