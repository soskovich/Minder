/* v503: onderhoudsronde. (1) een nieuwe vaste last draagt het bedrag uit zijn herkende reeks en de datum van zijn eerste boeking, en
   de sheet heeft drie keuzes; (2) de huur op "Na mijn salaris" blijft verwacht tot hij geboekt is; (3) twee labels.
   Op tests/v503-stand.js (SportCity, 26 nov), tests/v487-stand.js (de huur, salaris 24 nov) en tests/v502-stand.js (Plan). */
const { test, expect } = require('@playwright/test');
const S = require('./v503-stand');
const H = require('./v487-stand');
const V = require('./v502-stand');

const sport = page => page.evaluate(() => { const G = vastGestegenData(), sp = G.posten.find(p => /sportcity/i.test(p.naam));
  const k = gripCyclus().kies.find(x => x.id === 'vastpost:' + sp.key); return { key: sp.key, status: sp.status, mN: sp.mN, verschil: sp.verschil, sinds: sp.sinds, onbekend: sp.onbekend, kies: k && k.naam, reden: k && k.reden }; });
const openSheet = async (page, key) => { await page.evaluate(k => openVastPostKeuze(k), key); await expect(page.locator('#vastPostKeuze')).toBeVisible(); };

test.describe('v503', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('a: een nieuwe vaste last zonder boeking in de lopende maand: bedrag uit de reeks, datum van de eerste boeking', async ({ page }) => {
    await S.boot(page, { sport: 'reeks' });
    const r = await sport(page);
    expect(r).toMatchObject({ status: 'nieuw', mN: 40, verschil: 40, sinds: '2026-08-10', onbekend: false });
    expect(r.kies).toBe('SportCity: nieuw +€40 · accepteren of nakijken');
    expect(r.reden).toContain('nieuwe vaste last sinds 10 aug');
    await openSheet(page, r.key);
    await expect(page.locator('#vastPostKeuze [data-vpkfeit]')).toContainText('nieuw sinds 10 aug, €40 per maand');
  });

  test('a2: de vorm van het toestel: een kaartcontrole van €0,01 in oktober en €40 in november geeft €40, nooit +€0 of "nieuw sinds ,"', async ({ page }) => {
    await S.boot(page, { sport: 'mini' });
    const r = await sport(page);
    expect(r).toMatchObject({ status: 'nieuw', mN: 40, sinds: '2026-10-03', onbekend: false });
    expect(r.kies).not.toContain('+€0');
    await openSheet(page, r.key);
    const feit = await page.locator('#vastPostKeuze [data-vpkfeit]').innerText();
    expect(feit).toContain('nieuw sinds 3 okt, €40 per maand');
    expect(feit).not.toMatch(/sinds\s*,/);
  });

  test('a3: alleen een kaartcontrole: "bedrag nog onbekend", en geen keuze "vervangt"', async ({ page }) => {
    await S.boot(page, { sport: 'leeg' });
    const r = await sport(page);
    expect(r).toMatchObject({ status: 'nieuw', mN: 0, onbekend: true });
    expect(r.kies).toBe('SportCity: nieuw · bedrag nog onbekend · nakijken');
    await openSheet(page, r.key);
    await expect(page.locator('#vastPostKeuze [data-vpkonbekend]')).toHaveText('bedrag nog onbekend');
    expect(await page.locator('#vastPostKeuze [data-vpkoptie]').evaluateAll(n => n.map(x => x.dataset.vpkoptie))).toEqual(['nakijken']);
  });

  test('b: "vervangt Health Club" geeft SportCity − Health Club met beide bedragen', async ({ page }) => {
    await S.boot(page, { sport: 'mini' });
    const r = await sport(page);
    await openSheet(page, r.key);
    await page.locator('#vastPostKeuze [data-vpkoptie="vervangt"]').click();
    const hc = await page.evaluate(k => vastGestoptePosten(k).find(x => /health club/i.test(x.naam) && x.maand === 50), r.key);
    expect(hc).toBeTruthy();
    await page.locator(`#vastPostKeuze [data-vpkvankeuze="${hc.key}"]`).click();
    await expect(page.locator('#vastPostKeuze [data-vpkverschil]')).toHaveAttribute('data-vpkverschil', '-10');
    await expect(page.locator('#vastPostKeuze [data-vpkgevolg]')).toContainText(`${hc.naam} → SportCity · verschil −€10/mnd`);
    await page.locator('#vastPostKeuze [data-vpkbevestig]').click();
    const na = await page.evaluate(() => { const sp = vastGestegenData().posten.find(p => /sportcity/i.test(p.naam)); return { status: sp.status, mV: sp.mV, mN: sp.mN, verschil: sp.verschil }; });
    expect(na).toEqual({ status: 'vervangt', mV: 50, mN: 40, verschil: -10 });
  });

  test('c: drie keuzes in de volgorde Accepteren · Nakijken · Vervangt een gestopte post, niets voorgekozen', async ({ page }) => {
    await S.boot(page, { sport: 'reeks' });
    const r = await sport(page);
    await openSheet(page, r.key);
    expect(await page.locator('#vastPostKeuze [data-vpkoptie]').evaluateAll(n => n.map(x => x.dataset.vpkoptie))).toEqual(['accepteren', 'nakijken', 'vervangt']);
    expect(await page.locator('#vastPostKeuze [data-vpkgevolg]').count()).toBe(0);
    await expect(page.locator('#vastPostKeuze [data-vpkbevestig]')).toBeDisabled();
    await expect(page.locator('#vastPostKeuze [data-voetreden]')).toHaveText('Kies accepteren, nakijken of vervangt');
  });

  /* d: salaris 24 nov, huur op "Na mijn salaris" (25 nov). Elke dag van 22 tot en met 30 nov staat de novemberhuur EEN keer verwacht in
     de forward-reeks, met betaaldatum 25 nov, tot hij geboekt is; daarna niet meer. */
  const huur = (page, boek) => page.evaluate(({ LEEF, CATH, boek }) => {
    const add = (id, d) => { const t = { id, date: d, amount: -300, acc: LEEF, name: 'Nathaniel Cathalina', desc: 'iDEAL Tikkie Nathaniel Cathalina ' + CATH + ' ' + d, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'huur'; };
    add('v503okt', '2026-10-27'); if (boek) add('v503nov', boek);
    const wk = woningForecast().key; SET.vastDatum = { [wk]: { keuze: 'nasal' } }; save(); window._rekV = null;
    const P = rekVoorstel(), rr = P.rekAlle.find(x => x.acc === LEEF);
    const T = (rr.termAlle || []).filter(t => t.key === wk);
    return { nov: T.filter(t => t.betaaldatum === '2026-11-25').map(t => ({ date: t.date, bedrag: t.bedrag })), nu: (vastDatumNu(wk) || {}).datum, vandaag: vandaagYMD() };
  }, { LEEF: H.LEEF, CATH: H.CATH, boek });
  for (const dag of ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30']) {
    test(`d: ${dag} · de novemberhuur staat een keer verwacht op 25 nov`, async ({ page }) => {
      await H.boot(page, { dag });
      const r = await huur(page, null);
      expect(r.nov.length).toBe(1);
      expect(r.nov[0].bedrag).toBe(300);
      expect(r.nov[0].date > r.vandaag).toBe(true);   // telt vanaf morgen mee in de daling en de krap
      expect(r.nu).toBe('2026-11-25');
    });
  }
  test('d2: geboekt op 27 nov: op 28 nov is de novemberhuur weg, en de december-termijn blijft', async ({ page }) => {
    await H.boot(page, { dag: '2026-11-28' });
    const r = await huur(page, '2026-11-27');
    expect(r.nov.length).toBe(0);
    expect(r.nu).toBe('2026-12-25');
  });

  test('e: "blijft vol X" als de vol-maand niet verschuift ("2e keer" bij te ruim begroot: grip-kiezen-v391 10)', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { closeSheet(); go('vooruit'); });
    await page.locator('[data-verplaats="kk"]').click();
    await page.locator('[data-pvnaar="iw"]').click();
    await page.locator('#pvBedrag').fill('10');
    const vol = await page.locator('#planVerplaats [data-pvvol]').allInnerTexts();
    expect(vol.length).toBeGreaterThan(0);
    for (const v of vol) { const m = v.match(/^vol (\S+ \d{4}) → vol (\S+ \d{4})/); if (m) expect(m[1]).not.toBe(m[2]); }
    expect(vol.some(v => /^blijft vol \S+ \d{4}/.test(v))).toBe(true);
  });
});
