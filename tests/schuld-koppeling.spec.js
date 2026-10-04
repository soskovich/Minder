/* v334: een boeking koppelen aan een schuld, in de vorm van v332 (bezittingen). Het geval van de
   gebruiker: Auto Lease, EUR 12.756 met 10,5 procent op 1 september, en een gekoppelde betaling van
   EUR 537,33 op 14 september (ONTVANGSTEN HILTERMANN L). Rente 12.756 x 10,5 / 100 / 12 = 111,62,
   aflossing 425,71, nieuwe stand 12.330,29. Duo: ingevuld EUR 547 per maand, gemeten EUR 399,72.
   De klok en de rest van de stand komen uit bezit-koppeling.fixture.js. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./bezit-koppeling.fixture');

const LEASE_DESC = 'SEPA INCASSO ONTVANGSTEN HILTERMANN L CONTRACT 4471 TERMIJN';
const DUO_DESC = 'DUO HOOFDREKENING STUDIESCHULD 1234567';
const LEASE = (o) => ({ id: 'lease', naam: 'Auto Lease', type: 'financiallease', rest: 12756, start: 20000, rente: 10.5, perMaand: 537, restOp: '2026-09-01', ...(o || {}) });
const DUO = (o) => ({ id: 'duo', naam: 'Duo', type: 'studie', rest: 18000, start: 25000, rente: 2.56, perMaand: 547, restOp: '2026-06-01', ...(o || {}) });
const TXS = [
  { id: 'lease0914', date: '2026-09-14', amount: -537.33, name: 'Hiltermann Lease', desc: LEASE_DESC },
  { id: 'duo07', date: '2026-07-24', amount: -399.72, name: 'DUO Hoofdrekening', desc: DUO_DESC },
  { id: 'duo08', date: '2026-08-24', amount: -399.72, name: 'DUO Hoofdrekening', desc: DUO_DESC },
  { id: 'duo09', date: '2026-09-24', amount: -399.72, name: 'DUO Hoofdrekening', desc: DUO_DESC },
];
async function start(page, o) {
  o = o || {};
  const ids = await boot(page, { dag: o.dag, extraTx: [...TXS, ...(o.extraTx || [])], set: { debts: o.debts || [LEASE(), DUO()], ...(o.set || {}) } });
  if (o.koppel !== false) await page.evaluate((id) => zetSchuldKoppel(id, 'lease'), ids.lease0914);
  return ids;
}
const vermogen = (page) => page.evaluate(() => {
  SET.openSchuld = true; go('vermogen'); renderVermogen();
  const rij = (id) => [...document.querySelectorAll('#s-vermogen .cz-pot')].find((x) => x.querySelector(`[data-schuldstand="${id}"],[data-schuldvraag="${id}"]`) || x.innerText.includes(id === 'lease' ? 'Auto Lease' : 'Duo'));
  const q = (s) => (document.querySelector(s) || {}).innerText || '';
  return { stand: q('#s-vermogen [data-schuldstand="lease"]'), vraag: q('#s-vermogen [data-schuldvraag="lease"]'),
    leaseRij: (rij('lease') || {}).innerText || '', duoRij: (rij('duo') || {}).innerText || '' };
});

test.describe('a · de restschuld daalt met de gekoppelde betaling', () => {
  test('rente ongeveer 112, aflossing ongeveer 426, nieuwe stand ongeveer 12.330', async ({ page }) => {
    await start(page);
    const S = await page.evaluate(() => schuldStand(SET.debts.find((d) => d.id === 'lease')));
    expect(S.betalingen.length).toBe(1);
    expect(Math.round(S.betalingen[0].rente)).toBe(112);
    expect(Math.round(S.betalingen[0].aflossing)).toBe(426);
    expect(Math.round(S.stand)).toBe(12330);
  });
  test('de rij zegt de optelling, en het vermogen en de reis lezen dezelfde stand', async ({ page }) => {
    await start(page);
    const r = await vermogen(page);
    expect(r.stand).toBe('€12.756 op 1 sep − €426 afgelost sindsdien = €12.330 · bij benadering');
    expect(r.leaseRij).toContain('Nog €12.330');
    const n = await page.evaluate(() => ({ sch: netWorth().sch, reis: fireInputs().debts.find((d) => d.id === 'lease').rest, ruw: SET.debts.find((d) => d.id === 'lease').rest }));
    expect(n.reis).toBe(12330);
    expect(n.ruw, 'de ingevulde stand zelf blijft staan').toBe(12756);
    expect(n.sch).toBe(12330 + 18000);
  });
  test('"restschuld werk je zelf bij" en de detectie vervallen bij een gekoppelde schuld, en blijven bij een andere', async ({ page }) => {
    await start(page);
    const r = await vermogen(page);
    expect(r.leaseRij).not.toContain('werk je zelf bij');
    expect(r.leaseRij).not.toMatch(/maandbetaling (lijkt|herkend|loopt|valt|niet)/);
    expect(r.duoRij, 'Duo heeft nog geen koppeling').toContain('werk je zelf bij');
  });
  test('de categorie van de boeking verandert niet: hij blijft een vaste last in je maand', async ({ page }) => {
    const ids = await start(page, { koppel: false });
    const voor = await page.evaluate((id) => ({ cat: catOf(TX.find((t) => t.id === id)), spend: totals(thisYM()).spend }), ids.lease0914);
    await page.evaluate((id) => zetSchuldKoppel(id, 'lease'), ids.lease0914);
    const na = await page.evaluate((id) => ({ cat: catOf(TX.find((t) => t.id === id)), spend: totals(thisYM()).spend }), ids.lease0914);
    expect(na).toEqual(voor);
    expect(voor.cat).toBe('vervoer');
  });
  test('zonder rentepercentage telt de hele betaling als aflossing, en de app zegt dat erbij', async ({ page }) => {
    await start(page, { debts: [LEASE({ rente: 0 }), DUO()] });
    const r = await vermogen(page);
    expect(r.stand).toBe('€12.756 op 1 sep − €537 afgelost sindsdien = €12.219 · bij benadering · zonder rente gerekend');
  });
  test('een betaling op de invuldag zelf telt niet: die kan al in je stand zitten', async ({ page }) => {
    await start(page, { debts: [LEASE({ restOp: '2026-09-14' }), DUO()] });
    expect(await page.evaluate(() => schuldRestNu(SET.debts.find((d) => d.id === 'lease')))).toBe(12756);
  });
});

test.describe('b · koppelen in de boekingssheet, met dezelfde regels als bij bezittingen', () => {
  test('de rij staat bij een afschrijving, en een keuze schrijft de koppeling', async ({ page }) => {
    const ids = await start(page, { koppel: false });
    await page.evaluate((id) => openSheet(id), ids.lease0914);
    await expect(page.locator('#sheet [data-schuldrij]')).toContainText('geen schuld');
    await page.locator('#sheet [data-schuldrij]').click();
    await page.locator('#sheet [data-schuldlijst] .row', { hasText: 'Auto Lease' }).click();
    await page.locator('#sheet button', { hasText: 'Alleen deze boeking' }).click();
    await expect(page.locator('#sheet [data-schuldrij]')).toContainText('Auto Lease');
    expect(await page.evaluate((id) => SET.schuldKoppel[id], ids.lease0914)).toBe('lease');
  });
  test('een regel op de naam koppelt ook de volgende en de eerdere Duo-betalingen', async ({ page }) => {
    const ids = await start(page);
    const r = await page.evaluate((i) => { schuldRegelZet(i.duo09, 'duo', 'partij');
      return [i.duo07, i.duo08, i.duo09].map((id) => schuldVan(TX.find((t) => t.id === id))); }, ids);
    expect(r).toEqual(['duo', 'duo', 'duo']);
  });
  test('een kenmerk moet in de omschrijving staan', async ({ page }) => {
    const ids = await start(page);
    const r = await page.evaluate((i) => ({ nee: schuldRegelMag(TX.find((t) => t.id === i.lease0914), 'lease', 'kenmerk', 'XYZ'),
      ja: schuldRegelMag(TX.find((t) => t.id === i.lease0914), 'lease', 'kenmerk', 'CONTRACT 4471') }), ids);
    expect(r.nee).toBe('nietInOmschrijving');
    expect(r.ja).toBe('');
  });
  test('twee regels voor twee schulden op dezelfde boeking koppelen niets, en de sheet vraagt om je keuze', async ({ page }) => {
    const ids = await start(page, { koppel: false });
    const r = await page.evaluate((i) => {
      const t = TX.find((x) => x.id === i.lease0914);
      schuldRegelZet(i.lease0914, 'lease', 'bedrag'); delete SET.schuldKoppel[i.lease0914];
      const gedeeld = schuldRegelMag(t, 'duo', 'partij');
      SET.schuldRegels.push({ id: 'x', schuld: 'duo', partij: bezitPartij(t), soort: 'kenmerk', waarde: 'CONTRACT' });
      return { gedeeld, van: schuldVan(t), botsing: schuldRegelBotsing(t) };
    }, ids);
    expect(r.gedeeld, 'zoals bij bezittingen: elke regel van een andere schuld op deze naam sluit een regel op alleen de naam uit').toBe('gedeeld');
    expect(r.van).toBe(null);
    expect(r.botsing).toBe(true);
  });
  test('een regel op de naam wordt geweigerd zodra een andere schuld er een regel op de naam heeft', async ({ page }) => {
    const ids = await start(page, { koppel: false });
    const r = await page.evaluate((i) => { schuldRegelZet(i.lease0914, 'lease', 'partij');
      return schuldRegelMag(TX.find((x) => x.id === i.lease0914), 'duo', 'partij'); }, ids);
    expect(r).toBe('gedeeld');
  });
  test('een boeking bij een bezitting kan niet ook bij een schuld horen', async ({ page }) => {
    const ids = await start(page);
    const r = await page.evaluate((id) => { const t = TX.find((x) => x.id === id); zetBezitKoppel(id, 'kayani');
      return { kand: schuldKandidaat(t), van: schuldVan(t) }; }, ids.peaks0929);
    expect(r).toEqual({ kand: false, van: null });
  });
  test('het lease-aanbod zwijgt voor een gekoppelde betaling', async ({ page }) => {
    /* Het aanbod eist een HERKENDE herhaling en een termijn die niet al bij een lease-schuld past, dus
       de stand draagt drie termijnen en een schuld met een ander maandbedrag. Zonder die twee zweeg
       het aanbod al voor de koppeling, en dan toetst deze test niets. */
    const extra = [['lease07', '2026-07-14'], ['lease08', '2026-08-14']].map(([id, date]) => ({ id, date, amount: -537.33, name: 'Hiltermann Lease', desc: LEASE_DESC }));
    const ids = await start(page, { koppel: false, extraTx: extra, debts: [LEASE({ perMaand: 900 }), DUO()] });
    const voor = await page.evaluate((id) => leaseLinkOffer(TX.find((t) => t.id === id)), ids.lease0914);
    expect(voor, 'invoermeting: zonder koppeling biedt de app de lease aan').not.toBe(null);
    await page.evaluate((id) => zetSchuldKoppel(id, 'lease'), ids.lease0914);
    expect(await page.evaluate((id) => leaseLinkOffer(TX.find((t) => t.id === id)), ids.lease0914)).toBe(null);
  });
  test('de koppeling verhuist mee bij een samenvoeging', async ({ page }) => {
    await start(page);
    expect(await page.evaluate(() => VLAG_MAPS.includes('schuldKoppel'))).toBe(true);
  });
});

test.describe('c · opnieuw invullen, en een stand zonder datum', () => {
  test('een andere restschuld in de editor is een nieuw startpunt van vandaag', async ({ page }) => {
    await start(page);
    const d = await page.evaluate(() => { openDebt('lease'); const veld = document.getElementById('dRest').value;
      document.getElementById('dRest').value = '12300'; saveDebt('lease'); return { veld, d: SET.debts.find((x) => x.id === 'lease') }; });
    expect(d.veld).toBe('12330');
    expect(d.d.rest).toBe(12300);
    expect(d.d.restOp).toBe('2026-09-30');
    expect(await page.evaluate(() => schuldRestNu(SET.debts.find((x) => x.id === 'lease')))).toBe(12300);
  });
  test('alleen de naam wijzigen laat de stand en zijn datum staan', async ({ page }) => {
    await start(page);
    const d = await page.evaluate(() => { openDebt('lease'); document.getElementById('dNaam').value = 'Lease auto'; saveDebt('lease'); return SET.debts.find((x) => x.id === 'lease'); });
    expect(d.naam).toBe('Lease auto');
    expect(d.rest).toBe(12756);
    expect(d.restOp).toBe('2026-09-01');
  });
  test('bijwerken via de snelle sheet is ook een nieuw startpunt', async ({ page }) => {
    await start(page);
    const d = await page.evaluate(() => { openDebtUpdate('lease'); const t = document.querySelector('#sheet').innerText;
      document.getElementById('duRest').value = '12250'; saveDebtRest('lease'); return { t, d: SET.debts.find((x) => x.id === 'lease') }; });
    expect(d.t).toContain('daalt mee met je gekoppelde betalingen');
    expect(d.t).not.toContain('daalt niet vanzelf mee');
    expect(d.d.rest).toBe(12250);
    expect(d.d.restOp).toBe('2026-09-30');
  });
  test('zonder datum trekt Minder niets af en vraagt een keer, met twee even zware knoppen', async ({ page }) => {
    await start(page, { debts: [LEASE({ restOp: undefined }), DUO()] });
    const r = await vermogen(page);
    expect(r.vraag).toContain('Zat de betaling van 14 sep al in de €12.756?');
    expect(r.leaseRij).toContain('Nog €12.756');
    const k = await page.evaluate(() => { openDebt('lease'); const b = [...document.querySelectorAll('#sheet [data-schuldvraagknop]')];
      return { labels: b.map((x) => x.innerText.trim()), st: b.map((x) => { const c = getComputedStyle(x); return [c.color, c.fontWeight, c.fontSize, c.borderColor].join('|'); }) }; });
    expect(k.labels).toEqual(['Ja, al meegeteld', 'Nee, trek af']);
    expect(k.st[0]).toBe(k.st[1]);
  });
  test('"Nee, trek af" geeft 12.330 en de vraag komt niet terug; "Ja" houdt 12.756', async ({ page }) => {
    await start(page, { debts: [LEASE({ restOp: undefined }), DUO()] });
    await page.evaluate(() => openDebt('lease'));
    await page.locator('#sheet [data-schuldvraagknop="nee"]').click();
    expect(await page.evaluate(() => [schuldRestNu(SET.debts[0]), SET.debts[0].restOp])).toEqual([12330, '2026-09-13']);
    expect((await vermogen(page)).vraag).toBe('');
    await page.evaluate(() => { delete SET.debts[0].restOp; schuldVraagBeantwoord('lease', true); });
    expect(await page.evaluate(() => schuldRestNu(SET.debts[0]))).toBe(12756);
  });
});

test.describe('d · gemeten tegen ingevuld', () => {
  test('Duo: ingevuld 547, gemeten 399,72, en de regel staat in de editor', async ({ page }) => {
    const ids = await start(page, { dag: '2026-10-08' });
    const r = await page.evaluate((id) => { schuldRegelZet(id, 'duo', 'partij'); openDebt('duo');
      return (document.querySelector('#sheet [data-schuldper="duo"]') || {}).innerText || ''; }, ids.duo09);
    expect(r).toContain('ingevuld €547 · gemeten €399,72 per maand (juli t/m september)');
  });
  test('liggen ze dicht bij elkaar, dan staat de regel er niet', async ({ page }) => {
    const ids = await start(page, { dag: '2026-10-08', debts: [LEASE(), DUO({ perMaand: 400 })] });
    const r = await page.evaluate((id) => { schuldRegelZet(id, 'duo', 'partij'); openDebt('duo'); return !!document.querySelector('#sheet [data-schuldper]'); }, ids.duo09);
    expect(r).toBe(false);
  });
});

test.describe('e · de spaarquote', () => {
  test('een afschrijving op Sparen & beleggen die je aan een schuld koppelt is geen beleggingsinleg', async ({ page }) => {
    const ids = await start(page, { koppel: false });
    const r = await page.evaluate((id) => { const voor = beleggingsInleg(thisYM()); zetSchuldKoppel(id, 'duo'); return { voor, na: beleggingsInleg(thisYM()) }; }, ids.peaks0929);
    expect(r.voor).toBe(100);
    expect(r.na).toBe(0);
  });
});

for (const w of [360, 390]) {
  test(`f · de schuldrij met de optelling op ${w}px, zonder overloop`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await start(page);
    await vermogen(page);
    const r = await page.evaluate(() => { const e = document.querySelector('#s-vermogen [data-schuldstand="lease"]'); const rij = e.closest('.cz-pot');
      return { over: document.documentElement.scrollWidth > innerWidth, h: Math.round(rij.getBoundingClientRect().height), rechts: e.getBoundingClientRect().right, rand: rij.getBoundingClientRect().right }; });
    expect(r.over).toBe(false);
    expect(r.rechts).toBeLessThanOrEqual(r.rand + 0.5);
    console.log(`schuldrij ${w}px: ${r.h}px`);
  });
}
