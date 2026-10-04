/* v336: de aflossing als eigen regel onder de spaarquote, en niet erin. Het geval van de gebruiker uit
   v334: Auto Lease, EUR 12.756 met 10,5 procent op 1 september, een gekoppelde betaling van EUR 537,33
   op 14 september. Rente 111,62, aflossing 425,71. De klok staat op 4 oktober, zodat september de
   maand van de tegel op Vermogen is (vermogenSpaarquoteMaand()). */
const { test, expect } = require('@playwright/test');
const { boot } = require('./bezit-koppeling.fixture');

const LEASE_DESC = 'SEPA INCASSO ONTVANGSTEN HILTERMANN L CONTRACT 4471 TERMIJN';
const LEASE = (o) => ({ id: 'lease', naam: 'Auto Lease', type: 'financiallease', rest: 12756, start: 20000, rente: 10.5, perMaand: 537, restOp: '2026-09-01', ...(o || {}) });
const TXS = [{ id: 'lease0914', date: '2026-09-14', amount: -537.33, name: 'Hiltermann Lease', desc: LEASE_DESC }];

async function start(page, o) {
  o = o || {};
  const ids = await boot(page, { dag: '2026-10-04', extraTx: [...TXS, ...(o.extraTx || [])], set: { debts: o.debts || [LEASE()], ...(o.set || {}) } });
  if (o.koppel !== false) await page.evaluate((id) => zetSchuldKoppel(id, 'lease'), ids.lease0914);
  return ids;
}
const tegel = (page) => page.evaluate(() => {
  go('vermogen'); renderVermogen();
  const t = document.querySelector('#s-vermogen #maandKpiBlok [data-kpi="inleg"]');
  const a = t && t.querySelector('[data-aflossing]');
  return { maand: vermogenSpaarquoteMaand(), tekst: t ? t.innerText.replace(/\s+/g, ' ') : '', regel: a ? a.innerText : null,
    waarde: a ? a.dataset.aflossing : null, pct: t ? t.querySelector('.wvo-tv').innerText : null };
});

test.describe('a · de regel staat onder het percentage, met het aflossingsdeel', () => {
  test('september: ongeveer 426 afgelost, bij benadering, niet in het percentage', async ({ page }) => {
    await start(page);
    const r = await tegel(page);
    expect(r.maand).toBe('2026-09');
    expect(r.regel).toBe('+ €426 afgelost op je schulden, bij benadering · niet in dit percentage');
    expect(r.waarde).toBe('426');
  });

  test('de bron is schuldStand(): dezelfde aflossing als de rij op Vermogen', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => ({ A: aflossingMaand('2026-09'), S: schuldStand(SET.debts[0]).betalingen[0].aflossing }));
    expect(r.A.bedrag).toBe(Math.round(r.S));
  });

  test('het percentage verandert niet door de koppeling', async ({ page }) => {
    await start(page, { koppel: false });
    const voor = await tegel(page);
    expect(voor.regel, 'zonder koppeling geen regel').toBeNull();
    const ids = await page.evaluate(() => TX.filter((t) => t.name === 'Hiltermann Lease').map((t) => t.id));
    await page.evaluate((id) => zetSchuldKoppel(id, 'lease'), ids[0]);
    const na = await tegel(page);
    expect(na.pct).toBe(voor.pct);
    expect(await page.evaluate(() => vermogensInleg('2026-09').delen.map((d) => d.key))).toEqual(['spaar', 'res', 'bel']);
    expect(na.regel).toContain('€426');
  });

  test('een betaling in de maand erna verandert september niet', async ({ page }) => {
    const ids = await start(page, { extraTx: [{ id: 'lease1002', date: '2026-10-02', amount: -537.33, name: 'Hiltermann Lease', desc: LEASE_DESC + ' OKT' }] });
    await page.evaluate((id) => zetSchuldKoppel(id, 'lease'), ids.lease1002);
    expect(await page.evaluate(() => schuldStand(SET.debts[0]).betalingen.length), 'invoermeting: twee betalingen na de invuldag').toBe(2);
    expect(await page.evaluate(() => aflossingMaand('2026-09').bedrag)).toBe(426);
  });

  test('zonder rente is alles aflossing, en dat staat erbij', async ({ page }) => {
    await start(page, { debts: [LEASE({ rente: 0 })] });
    expect((await tegel(page)).regel).toBe('+ €537 afgelost op je schulden, bij benadering · zonder rente gerekend · niet in dit percentage');
  });

  test('twee schulden tellen op', async ({ page }) => {
    const DUO_DESC = 'DUO HOOFDREKENING STUDIESCHULD 1234567';
    const ids = await start(page, {
      debts: [LEASE(), { id: 'duo', naam: 'Duo', type: 'studie', rest: 18000, start: 25000, rente: 0, perMaand: 400, restOp: '2026-08-01' }],
      extraTx: [{ id: 'duo09', date: '2026-09-24', amount: -399.72, name: 'DUO Hoofdrekening', desc: DUO_DESC }] });
    await page.evaluate((id) => zetSchuldKoppel(id, 'duo'), ids.duo09);
    const r = await tegel(page);
    expect(r.waarde).toBe(String(Math.round(425.71 + 399.72)));
    expect(r.regel).toContain('zonder rente gerekend');
  });
});

test.describe('b · onbekend blijft onbekend', () => {
  test('een betaling op of voor de invuldag: het aflossingsdeel is niet te zeggen', async ({ page }) => {
    await start(page, { debts: [LEASE({ restOp: '2026-09-14' })] });
    const r = await tegel(page);
    expect(r.waarde).toBe('onbekend');
    expect(r.regel).toBe('Aflossing op je schulden: niet te zeggen, want bij Auto Lease staat geen restschuld van voor deze betaling');
    expect(r.regel).not.toMatch(/€0/);
  });

  test('zonder invuldag ook', async ({ page }) => {
    await start(page, { debts: [LEASE({ restOp: undefined })] });
    expect((await tegel(page)).waarde).toBe('onbekend');
  });

  test('een maand zonder gekoppelde betaling krijgt geen regel', async ({ page }) => {
    await start(page);
    expect(await page.evaluate(() => aflossingMaand('2026-08'))).toBeNull();
    expect(await page.evaluate(() => aflossingRegel('2026-08'))).toBe('');
  });
});

test.describe('c · ook in de sheet achter de tegel', () => {
  test('de sheet draagt dezelfde regel onder het percentage, en de opbouw noemt de koppeling', async ({ page }) => {
    await start(page);
    await page.evaluate(() => openKpiDetail('inleg', '2026-09'));
    await page.waitForSelector('#sheetBg.show');
    const r = await page.evaluate(() => ({ regel: (document.querySelector('#sheet [data-aflossing]') || {}).innerText, tekst: document.querySelector('#sheet').innerText }));
    expect(r.regel).toBe('+ €426 afgelost op je schulden, bij benadering · niet in dit percentage');
    expect(r.tekst).toMatch(/Koppel je de betaling aan een schuld/);
  });
});

for (const breed of [360, 390]) {
  test(`d · de tegel op ${breed}px: de regel breekt af zonder overloop, en wat hij kost`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: 800 });
    await start(page, { koppel: false });
    const h0 = await page.evaluate(() => { go('vermogen'); renderVermogen(); return document.querySelector('#maandKpiBlok [data-kpi="inleg"]').getBoundingClientRect().height; });
    const ids = await page.evaluate(() => TX.filter((t) => t.name === 'Hiltermann Lease').map((t) => t.id));
    await page.evaluate((id) => zetSchuldKoppel(id, 'lease'), ids[0]);
    const m = await page.evaluate(() => { renderVermogen(); const t = document.querySelector('#maandKpiBlok [data-kpi="inleg"]'); const a = t.querySelector('[data-aflossing]');
      return { h: t.getBoundingClientRect().height, r: a.getBoundingClientRect().height, sw: a.scrollWidth, cw: a.clientWidth, scroll: document.documentElement.scrollWidth <= window.innerWidth }; });
    console.log(`tegel ${breed}: ${h0} -> ${m.h}, regel ${m.r}`);
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    expect(m.scroll).toBe(true);
    expect(m.h).toBeGreaterThan(h0);
  });
}
