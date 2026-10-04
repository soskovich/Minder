/* v336: de aflossing als eigen regel onder de spaarquote, en niet erin. Het geval van de gebruiker uit
   v334: Auto Lease, EUR 12.756 met 10,5 procent op 1 september, een gekoppelde betaling van EUR 537,33
   op 14 september (rente 111,62, aflossing 425,71), en DUO met EUR 399,72 per maand. De klok staat op
   4 oktober, zodat september de maand van de tegel op Vermogen is (vermogenSpaarquoteMaand()). */
const { test, expect } = require('@playwright/test');
const { boot } = require('./bezit-koppeling.fixture');

const LEASE_DESC = 'SEPA INCASSO ONTVANGSTEN HILTERMANN L CONTRACT 4471 TERMIJN';
const DUO_DESC = 'DUO HOOFDREKENING STUDIESCHULD 1234567';
const LEASE = (o) => ({ id: 'lease', naam: 'Auto Lease', type: 'financiallease', rest: 12756, start: 20000, rente: 10.5, perMaand: 537,
  restOp: '2026-09-01', autoBezit: true, dagwaarde: 21000, ...(o || {}) });
const DUO = (o) => ({ id: 'duo', naam: 'Duo', type: 'studie', rest: 18000, start: 25000, rente: 2.56, perMaand: 547, restOp: '2026-06-01', ...(o || {}) });
const TXS = [
  { id: 'lease0914', date: '2026-09-14', amount: -537.33, name: 'Hiltermann Lease', desc: LEASE_DESC },
  { id: 'duo08', date: '2026-08-24', amount: -399.72, name: 'DUO Hoofdrekening', desc: DUO_DESC },
  { id: 'duo09', date: '2026-09-24', amount: -399.72, name: 'DUO Hoofdrekening', desc: DUO_DESC },
];

async function start(page, o) {
  o = o || {};
  const ids = await boot(page, { dag: '2026-10-04', extraTx: [...TXS, ...(o.extraTx || [])], set: { debts: o.debts || [LEASE(), DUO()], ...(o.set || {}) } });
  if (o.koppel !== false) await page.evaluate((x) => { zetSchuldKoppel(x.l, 'lease'); zetSchuldKoppel(x.d8, 'duo'); zetSchuldKoppel(x.d9, 'duo'); },
    { l: ids.lease0914, d8: ids.duo08, d9: ids.duo09 });
  return ids;
}
const tegel = (page) => page.evaluate(() => {
  go('vermogen'); renderVermogen();
  const t = document.querySelector('#s-vermogen #maandKpiBlok [data-kpi="inleg"]');
  const a = t && t.querySelector('[data-aflossing]');
  return { maand: vermogenSpaarquoteMaand(), regel: a ? a.innerText.trim() : null, waarde: a ? a.dataset.aflossing : null,
    pct: t ? t.querySelector('.wvo-tv').innerText : null };
});
const deel = (page, id) => page.evaluate((i) => Math.round(schuldStand(SET.debts.find((d) => d.id === i)).betalingen.filter((b) => b.datum.startsWith('2026-09')).reduce((s, b) => s + b.aflossing, 0)), id);

test.describe('a · het geval van de gebruiker: lease en DUO gekoppeld', () => {
  test('het percentage blijft gelijk, en de regel toont de som van beide aflossingsdelen', async ({ page }) => {
    const ids = await start(page, { koppel: false });
    const voor = await tegel(page);
    expect(voor.regel, 'zonder koppeling geen regel').toBeNull();
    await page.evaluate((x) => { zetSchuldKoppel(x.l, 'lease'); zetSchuldKoppel(x.d8, 'duo'); zetSchuldKoppel(x.d9, 'duo'); },
      { l: ids.lease0914, d8: ids.duo08, d9: ids.duo09 });
    const na = await tegel(page);
    expect(na.maand).toBe('2026-09');
    expect(na.pct).toBe(voor.pct);
    const lease = await deel(page, 'lease'), duo = await deel(page, 'duo');
    expect(lease).toBe(426);
    expect(duo).toBeGreaterThan(350);                          // invoermeting: DUO draagt een eigen aflossingsdeel
    expect(na.regel).toBe(`Daarnaast €${lease + duo} afgelost op je schulden ›`);
    expect(Number(na.waarde)).toBe(lease + duo);
    expect(await page.evaluate(() => vermogensInleg('2026-09').delen.map((d) => d.key))).toEqual(['spaar', 'res', 'bel']);
  });

  test('alleen het aflossingsdeel telt, niet de rente', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => aflossingMaand('2026-09').regels.find((x) => x.id === 'lease'));
    expect(r).toMatchObject({ aflossing: 426, rente: 112, betaald: 537 });
  });

  test('een betaling in de maand erna verandert september niet', async ({ page }) => {
    const ids = await start(page, { extraTx: [{ id: 'lease1002', date: '2026-10-02', amount: -537.33, name: 'Hiltermann Lease', desc: LEASE_DESC + ' OKT' }] });
    await page.evaluate((id) => zetSchuldKoppel(id, 'lease'), ids.lease1002);
    expect(await page.evaluate(() => schuldStand(SET.debts[0]).betalingen.length), 'invoermeting').toBe(2);
    expect(await page.evaluate(() => aflossingMaand('2026-09').regels.find((x) => x.id === 'lease').aflossing)).toBe(426);
  });

  test('de regel is de som van de afgeronde rijen van de uitsplitsing', async ({ page }) => {
    await start(page);
    const r = await page.evaluate(() => { const A = aflossingMaand('2026-09'); return { som: A.regels.reduce((s, x) => s + x.aflossing, 0), bedrag: A.bedrag }; });
    expect(r.bedrag).toBe(r.som);
  });
});

test.describe('b · een tik toont het per schuld', () => {
  test('de uitsplitsing noemt elke schuld met zijn aflossing, de rente als context, en de som', async ({ page }) => {
    await start(page);
    await tegel(page);
    await page.locator('#maandKpiBlok [data-aflossing]').click();
    await page.waitForSelector('[data-aflossheet]');
    const r = await page.evaluate(() => ({
      rijen: [...document.querySelectorAll('[data-aflosrij]')].map((e) => ({ id: e.dataset.aflosrij, t: e.innerText.replace(/\s+/g, ' ') })),
      tekst: document.querySelector('#sheet').innerText }));
    expect(r.rijen.map((x) => x.id)).toEqual(['lease', 'duo']);
    expect(r.rijen[0].t).toContain('€426');
    expect(r.rijen[0].t).toContain('€112 rente');
    expect(r.tekst).toMatch(/telt er niet in mee/);
    expect(r.tekst).not.toMatch(/Spaarquote/);                // de tik op de regel opent niet de tegel-sheet
  });

  test('een schuld met een auto als bezitting krijgt "de auto verliest ook waarde", zonder bedrag', async ({ page }) => {
    await start(page);
    await page.evaluate(() => openAflossing('2026-09'));
    const r = await page.evaluate(() => ({
      lease: document.querySelector('[data-aflosrij="lease"]').innerText.replace(/\s+/g, ' '),
      duo: document.querySelector('[data-aflosrij="duo"]').innerText }));
    expect(r.lease).toMatch(/· de auto verliest ook waarde €426$/);   // geen bedrag achter de toevoeging, alleen het aflossingsdeel rechts
    expect(r.duo).not.toMatch(/auto/);
  });

  test('zonder auto als bezitting geen toevoeging', async ({ page }) => {
    await start(page, { debts: [LEASE({ autoBezit: false }), DUO()] });
    await page.evaluate(() => openAflossing('2026-09'));
    expect(await page.evaluate(() => document.querySelector('[data-aflosrij="lease"]').innerText)).not.toMatch(/auto verliest/);
  });

  test('zonder rente is alles aflossing, en dat staat in de uitsplitsing', async ({ page }) => {
    await start(page, { debts: [LEASE({ rente: 0 }), DUO()] });
    await page.evaluate(() => openAflossing('2026-09'));
    const t = await page.evaluate(() => document.querySelector('[data-aflosrij="lease"]').innerText);
    expect(t).toContain('zonder rente gerekend');
    expect(t).toContain('€537');
  });
});

test.describe('c · onbekend blijft onbekend, geen schatting', () => {
  test('een schuld zonder startdatum van voor de betaling: de regel zegt "deels onbekend" en telt alleen wat bekend is', async ({ page }) => {
    await start(page, { debts: [LEASE({ restOp: '2026-09-14' }), DUO()] });
    const duo = await deel(page, 'duo');
    const r = await tegel(page);
    expect(r.regel).toBe(`Daarnaast €${duo} afgelost op je schulden · deels onbekend ›`);
    await page.evaluate(() => openAflossing('2026-09'));
    const t = await page.evaluate(() => document.querySelector('[data-aflosrij="lease"]').innerText);
    expect(t).toContain('niet te zeggen');
    expect(t).toContain('onbekend');
  });

  test('is het bij elke schuld onbekend, dan staat de regel er niet', async ({ page }) => {
    await start(page, { debts: [LEASE({ restOp: undefined }), DUO({ restOp: '2026-09-30' })] });
    expect(await page.evaluate(() => aflossingMaand('2026-09').bedrag)).toBeNull();
    expect((await tegel(page)).regel).toBeNull();
  });

  test('een maand zonder gekoppelde betaling krijgt geen regel', async ({ page }) => {
    await start(page);
    expect(await page.evaluate(() => aflossingMaand('2026-07'))).toBeNull();
    expect(await page.evaluate(() => aflossingRegel('2026-07'))).toBe('');
  });
});

test.describe('d · de uitleg en de sheet achter de tegel', () => {
  test('de uitleg zegt dat aflossing er niet in zit, maar eronder staat, en de sheet draagt de regel', async ({ page }) => {
    await start(page);
    await page.evaluate(() => openKpiDetail('inleg', '2026-09'));
    await page.waitForSelector('#sheetBg.show');
    const r = await page.evaluate(() => ({ regel: (document.querySelector('#sheet [data-aflossing]') || {}).innerText, tekst: document.querySelector('#sheet').innerText }));
    expect(r.regel).toMatch(/^Daarnaast €\d+ afgelost op je schulden ›$/);
    expect(r.tekst).toMatch(/Een aflossing zit er niet in, maar staat eronder/);
    expect(r.tekst).toMatch(/Koppel je de betaling aan een schuld/);
  });
});

for (const breed of [360, 390]) {
  test(`e · de tegel op ${breed}px: zonder overloop, en wat de regel kost`, async ({ page }) => {
    await page.setViewportSize({ width: breed, height: 800 });
    const ids = await start(page, { koppel: false });
    const h0 = await page.evaluate(() => { go('vermogen'); renderVermogen(); return document.querySelector('#maandKpiBlok [data-kpi="inleg"]').getBoundingClientRect().height; });
    await page.evaluate((x) => { zetSchuldKoppel(x.l, 'lease'); zetSchuldKoppel(x.d9, 'duo'); }, { l: ids.lease0914, d9: ids.duo09 });
    const m = await page.evaluate(() => { renderVermogen(); const t = document.querySelector('#maandKpiBlok [data-kpi="inleg"]'); const a = t.querySelector('[data-aflossing]');
      return { h: t.getBoundingClientRect().height, r: a.getBoundingClientRect().height, sw: a.scrollWidth, cw: a.clientWidth, scroll: document.documentElement.scrollWidth <= window.innerWidth }; });
    console.log(`tegel ${breed}: ${h0} -> ${m.h}, regel ${m.r}`);
    expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
    expect(m.scroll).toBe(true);
    expect(m.h).toBeGreaterThan(h0);
  });
}
