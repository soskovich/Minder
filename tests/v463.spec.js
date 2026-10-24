/* v463 (gevraagd door de gebruiker: deel B fase 3). B4: alle vragen in "Kloppen mijn gegevens?", hooguit drie tegelijk en een per
   boeking; onder de drempel (EUR 25 in de laatste 120 dagen of elk bedrag in de lopende salarisperiode) in Diagnose onder kleine vragen
   en niet in de bel; bij elke knop wat hij doet; Weet ik niet maakt de controle verklaard; na een antwoord het effect en de regelvraag
   "Geldt dit voor alle <partij>?". Nieuwe vraag (a): een ontvangst van een rekening op jouw naam die Minder niet kent. Nieuwe vraag (b):
   eenmalig terwijl de partij eerder voorkwam. Terugblik: "eenmalig komt elke maand voor". B10: het koppelscherm. GECONSTRUEERDE fixture. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const ABN = '521200806', N26 = 'DE89370400440532013000';
function seed(o) {
  o = o || {};
  const tx = [];
  const P = (d, a, name, acc, desc) => tx.push({ id: 'w' + tx.length, date: d, amount: a, acc: acc || N26, src: 'psd2', name, desc: desc || (name + ' PMNT'),
    bankRef: '', typ: '', ref: '', accName: '', refNums: [] });
  for (const m of ['04', '05', '06', '07', '08', '09', '10']) { P(`2026-${m}-01`, 3000, 'Werkgever Bv'); P(`2026-${m}-02`, -60, 'Albert Heijn'); P(`2026-${m}-03`, -40, 'Jumbo', ABN); }
  P('2026-07-02', 250, 'Vincent Ernst Sumter', ABN, 'Vincent Ernst Sumter Overboeking');
  P('2025-10-10', -480, 'Gemeente Purmerend', N26); P('2026-10-10', -484, 'Gemeente Purmerend', N26);
  (o.tx || []).forEach((x) => P(...x));
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([N26, ABN]),
    minder_accmeta: JSON.stringify({ [N26]: { balance: 1000, date: '2026-10-23', bank: 'N26' }, [ABN]: { balance: 500, date: '2026-10-23', bank: 'ABN AMRO' } }),
    minder_set: JSON.stringify(Object.assign({ psd2Accounts: { [N26]: { uid: 'u1', iban: N26, label: 'Main', bank: 'N26', exp: '2027-01-03' }, [ABN]: { uid: 'u2', iban: 'NL00ABNA0' + ABN, label: 'Betaalrekening', bank: 'ABN AMRO', exp: '2027-01-08' } },
      psd2LastSync: 4102444800000, psd2Url: 'https://x.test', psd2Token: 't', limit: 70, opnameVanaf: '2099-12-31', manualBal: {},
      budgets: { boodschappen: 300 }, eenmaligOk: { w23: '2026-10-11' } }, o.set || {})),
    minder_plan: '{}',
  };
}
async function boot(page, o) {
  await pinDatum(page, '2026-10-24');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v463')) { sessionStorage.setItem('v463', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof eigenRekVragen === 'function');
  /* de boot rekent elke id opnieuw uit (txId), dus de fixture-ids worden hier op de echte ids gelegd, ook in eenmaligOk */
  const seedTx = JSON.parse(seed(o).minder_tx);
  await page.evaluate((st) => {
    window.ID = {};
    for (const x of st) { const t = TX.find((y) => y.date === x.date && y.amount === x.amount && y.name === x.name && y.acc === x.acc); if (t) ID[x.id] = t.id; }
    const ok = {}; for (const k in (SET.eenmaligOk || {})) ok[ID[k] || k] = SET.eenmaligOk[k]; SET.eenmaligOk = ok; save();
  }, seedTx);
  return page.evaluate(() => ID);
}
const vrId = (page, soort) => page.evaluate((s) => (gegevensVragen().find((q) => q.soort === s) || {}).qkey || '', soort);

test.describe('(a) een ontvangst van een rekening op jouw naam', () => {
  test('a. +EUR 250 van Vincent Ernst Sumter op 02-07 staat in Kloppen mijn gegevens? met de vier keuzes en bij elke knop wat hij doet', async ({ page }) => {
    const I = await boot(page);
    const q = await vrId(page, 'eigenrek');
    expect(q).toBe('eigenrek|' + I.w21);
    await page.evaluate(() => openGegevensVragen());
    const rij = page.locator('[data-gegevensvraag="eigenrek"]');
    await expect(rij).toContainText('Kwam binnen van een rekening op jouw naam die Minder niet kent. Welke?');
    for (const [k, l] of [['eigen', 'Eigen rekening buiten Minder'], ['ander', 'Van iemand anders'], ['weetniet', 'Weet ik niet']]) {
      const b = rij.locator(`[data-eigenrek="${k}"]`); await expect(b).toContainText(l);
      expect((await b.innerText()).split('\n').length).toBeGreaterThan(1);   // de knop zegt wat hij doet
      expect(await b.evaluate((e) => e.className)).toContain('sec');         // niets voorgeselecteerd
    }
    await expect(page.locator(`[data-vraagwrap="eigenrek|${I.w21}"] [data-later]`)).toContainText('Later');
  });
  test('b. Eigen rekening: een niet-gekoppelde eigen rekening, telt als intern, dan "Is dit sparen?" (Ja is opzij)', async ({ page }) => {
    const I = await boot(page);
    await page.evaluate(() => eigenRekZet(ID.w21, 'eigen'));
    const r = await page.evaluate(() => ({ eigen: !!(SET.eigenRekBuiten || {})['vincent ernst sumter'], cat: (CATS[catOf(TX.find((t) => t.id === ID.w21))] || {}).type, vraag: gegevensVragen().some((q) => q.soort === 'eigenrek'),
      sparen: gegevensVragen().some((q) => q.soort === 'eigenreksparen'), effect: (document.querySelector('[data-effecttekst]') || {}).innerText || '',
      regel: !!document.querySelector('[data-regelvraag="altijd"]') && !!document.querySelector('[data-regelvraag="deze"]') }));
    expect(r.eigen).toBe(true);
    expect(r.cat).toBe('internal');
    expect(r.vraag).toBe(false);
    expect(r.sparen).toBe(true);
    expect(r.effect).toContain('juli');
    expect(r.regel).toBe(true);
    await page.evaluate(() => eigenRekSparen(ID.w21, true));
    expect(await page.evaluate(() => catOf(TX.find((t) => t.id === ID.w21)))).toBe('sparen');
  });
  test('c. Weet ik niet maakt de controle verklaard en de vraag weg', async ({ page }) => {
    const I = await boot(page);
    const r = await page.evaluate(() => { eigenRekZet(ID.w21, 'weetniet'); return { verkl: !!((SET.controles || {}).verklaard || {})['vraag:eigenrek|' + ID.w21], vraag: gegevensVragen().some((q) => q.soort === 'eigenrek') }; });
    expect(r).toEqual({ verkl: true, vraag: false });
  });
  test('d. met een tegenkant op een eigen rekening is het geen vraag', async ({ page }) => {
    const I = await boot(page, { tx: [['2026-07-02', -250, 'Naar Betaalrekening', N26]] });
    expect(await vrId(page, 'eigenrek')).toBe('');
  });
  test('e. de regel Ja, altijd: een volgende boeking van dezelfde partij vraagt niets meer, Alleen deze wel', async ({ page }) => {
    const I = await boot(page, { tx: [['2026-10-05', 300, 'Vincent Ernst Sumter', ABN, 'Vincent Ernst Sumter Overboeking']] });
    const r = await page.evaluate(() => { eigenRekZet(ID.w21, 'eigen'); vraagRegelZet('regel|eigenrek|vincent ernst sumter', 'deze');
      const deze = gegevensVragen().filter((q) => q.soort === 'eigenrek').length; vraagRegelZet('regel|eigenrek|vincent ernst sumter', 'altijd');
      return { deze, altijd: gegevensVragen().filter((q) => q.soort === 'eigenrek').length }; });
    expect(r).toEqual({ deze: 1, altijd: 0 });
  });
});

test.describe('(b) eenmalig dat terugkomt', () => {
  test('a. Gemeente EUR 484 (Klopt, eenmalig) met dezelfde partij in 2025: "Komt dit terug? Dan wordt het een reservering."', async ({ page }) => {
    const I = await boot(page);
    expect(await vrId(page, 'eenmterug')).toBe('eenmterug|' + I.w23);
    await page.evaluate(() => openGegevensVragen('eenmterug|' + ID.w23));
    const rij = page.locator('[data-gegevensvraag="eenmterug"]');
    await expect(rij).toContainText('Komt dit terug? Dan wordt het een reservering.');
    await expect(rij.locator('[data-eenmterug="terug"]')).toContainText('Ja, maak een reservering');
    await expect(rij.locator('[data-eenmterug="eenmalig"]')).toContainText('Nee, echt eenmalig');
  });
  test('b. Ja opent de reservering ingevuld (per jaar); Nee legt eenmalig vast', async ({ page }) => {
    const I = await boot(page);
    const r = await page.evaluate(() => { eenmTerugZet(ID.w23, 'terug'); return { naam: document.getElementById('rNaam').value, iv: window._resIv, vraag: gegevensVragen().some((q) => q.soort === 'eenmterug') }; });
    expect(r.naam).toBe('Gemeente Purmerend'); expect(r.iv).toBe(12); expect(r.vraag).toBe(false);
  });
  test('c. zonder een eerdere boeking van die partij geen vraag', async ({ page }) => {
    const I = await boot(page);
    const n = await page.evaluate(() => { TX = TX.filter((t) => t.id !== ID.w22); save(); return gegevensVragen().filter((q) => q.soort === 'eenmterug').length; });
    expect(n).toBe(0);
  });
});

test.describe('B4 · de drempel en de lijst', () => {
  test('c. Weet ik niet op een andere soort vraag maakt die controle ook verklaard', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { kennisUitZet(ID.w22, 'weetniet'); return !!((SET.controles || {}).verklaard || {})['vraag:uit|' + ID.w22]; });
    expect(r).toBe(true);
  });
  test('d. Later komt een keer terug na zeven dagen, daarna pas als jij hem opent', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const q = 'eigenrek|' + ID.w21; kennisLater(q); const een = kennisLaterStand(q);
      kennisLater(q); const twee = kennisLaterStand(q); return { tot: een.tot, wacht1: een.wacht, n2: twee.n, wacht2: twee.wacht, max: KENNIS_LATER_MAX, dagen: KENNIS_LATER_DAGEN }; });
    expect(r.tot).toBe('2026-10-31'); expect(r.wacht1).toBe(true); expect(r.n2).toBe(2); expect(r.wacht2).toBe(true);
    expect(r.max).toBe(2); expect(r.dagen).toBe(7);
  });
  test('a. een vraag van EUR 7 in april staat niet in Zien en niet in de bel, wel in Diagnose; EUR 250 wel', async ({ page }) => {
    const I = await boot(page);
    const r = await page.evaluate(() => {
      const klein = { soort: 'buiten', qkey: 'buiten|x7', bedrag: 7, t: { id: 'x7', date: '2026-04-08', amount: -7 } };
      const groot = { soort: 'eigenrek', qkey: 'eigenrek|' + ID.w21, bedrag: 250, t: TX.find((t) => t.id === ID.w21) };
      return { klein: vraagBovenDrempel(klein), groot: vraagBovenDrempel(groot), lopend: vraagBovenDrempel({ soort: 'buiten', bedrag: 3, t: { id: 'x3', date: '2026-10-20', amount: -3 } }),
        recentKlein: vraagBovenDrempel({ soort: 'buiten', bedrag: 7, t: { id: 'x8', date: '2026-08-10', amount: -7 } }) }; });
    expect(r).toEqual({ klein: false, groot: true, lopend: true, recentKlein: false });
    const d = await page.evaluate(async () => { const echt = gegevensVragen; gegevensVragen = () => echt().concat([{ soort: 'buiten', qkey: 'buiten|x7', bedrag: 7, t: { id: 'x7', date: '2026-04-08', amount: -7, name: 'Bolcom' }, partij: 'Bolcom' }]);
      const open = gegevensOpen().map((q) => q.qkey); const html = controleDiagHtml(); gegevensVragen = echt; return { open, kv: html.includes('Bolcom') }; });
    expect(d.open).not.toContain('buiten|x7');
    expect(d.open).toContain('eigenrek|' + I.w21);
    expect(d.kv).toBe(true);
  });
  test('b. hooguit drie tegelijk en een per boeking', async ({ page }) => {
    const I = await boot(page);
    const r = await page.evaluate(() => { openGegevensVragen(); const ids = [...document.querySelectorAll('#gegevensSheet [data-vraagwrap]')].map((e) => e.dataset.vraagwrap);
      const tx = gegevensVragen().map((q) => q.t && q.t.id).filter(Boolean); return { n: ids.length, uniek: new Set(tx).size === tx.length }; });
    expect(r.n).toBeLessThanOrEqual(3); expect(r.uniek).toBe(true);
  });
});

test.describe('Terugblik en koppelscherm', () => {
  test('a. eenmalig drie afgeronde maanden op rij boven EUR 0: de constatering, zonder advies', async ({ page }) => {
    const I = await boot(page, { tx: [['2026-07-12', -90, 'Kapper Een'], ['2026-08-12', -95, 'Kapper Twee'], ['2026-09-12', -80, 'Kapper Drie']],
      set: { eenmaligOk: { w23: '2026-10-11', w24: '2026-07-13', w25: '2026-08-13', w26: '2026-09-13' } } });
    const h = await page.evaluate(() => eenmaligPatroonHtml());
    expect(h).toContain('Eenmalig komt elke maand voor');
    expect(h).not.toMatch(/maak|zet|verhoog|overweeg|potje voor/i);
  });
  test('b. zonder eenmalig in een van de drie maanden geen constatering', async ({ page }) => {
    const I = await boot(page, { tx: [['2026-07-12', -90, 'Kapper Een'], ['2026-08-12', -95, 'Kapper Twee']],
      set: { eenmaligOk: { w23: '2026-10-11', w24: '2026-07-13', w25: '2026-08-13' } } });
    expect(await page.evaluate(() => eenmaligPatroonHtml())).toBe('');
  });
  test('c. B10: na het koppelen "Minder controleert zichzelf" met vijf punten en Begrepen', async ({ page }) => {
    const I = await boot(page);
    await page.evaluate(() => koppelUitlegSheet());
    const k = page.locator('[data-koppeluitleg]');
    await expect(k).toContainText('Minder controleert zichzelf');
    expect(await k.locator('li').count()).toBe(5);
    await expect(k.locator('li').nth(4)).toHaveText('Je bankgegevens past Minder nooit aan.');
    await page.locator('[data-begrepen]').click();
    await expect(page.locator('[data-koppeluitleg]')).toBeHidden();
  });
});
