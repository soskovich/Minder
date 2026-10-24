/* v457 punt 7 (gevraagd door de gebruiker): de voorautorisatie aan de pomp telt dubbel. GEMELD: 21-10, Tango, N26: EUR 150,00
   (voorautorisatie), +EUR 52,79 (vrijgave), EUR 97,21 (betaling), alle drie in Vervoer & auto: EUR 194,42 waar EUR 97,21 klopt.
   GECONSTRUEERDE fixture met dat geval, drie oudere Tango-gevallen (voor het zelf herstellen na 3x Ja) en de bijna-gevallen die de
   regels onderscheiden (meetles o): een cent ernaast, vijf dagen uit elkaar, een andere rekening, en A = V (vrijgave volledig).
   1. de detectie `vorautPatroon()`: dezelfde rekening, dezelfde partij, binnen 3 dagen, A − V = B tot op de cent;
   2. de vraag in "Kloppen mijn gegevens?" (soort 3): Ja / Nee, niets voorgeselecteerd; Ja haalt A en V uit de sommen (ze blijven in
      de transacties), Vervoer & auto oktober −EUR 97,21;
   3. per partij na 3x Ja zonder Nee herstelt Minder zelf (soort 1), zichtbaar in "Wat Minder van jou weet" en de log, per geval terug
      te draaien (dat telt als Nee);
   4. het meetblok (alleen lezen) en de controle in blok 20. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const N26 = 'DE89370400440532013000', ABN = '521200806';

function seed(extra) {
  const tx = [];
  const P = (d, a, name, acc) => tx.push({ id: 'v' + tx.length, date: d, amount: a, acc: acc || N26, src: 'psd2', name, desc: name + ' PMNT',
    bankRef: '', typ: '', ref: '', accName: '', refNums: [] });
  /* het gemelde geval: A en B op 21-10, de vrijgave twee dagen later */
  P('2026-10-21', -150, 'Tango Purmerend'); P('2026-10-21', -97.21, 'Tango Purmerend'); P('2026-10-23', 52.79, 'Tango Purmerend');
  /* drie oudere Tango-gevallen, met centen */
  P('2026-08-05', -125, 'Tango Purmerend'); P('2026-08-06', 27.78, 'Tango Purmerend'); P('2026-08-05', -97.22, 'Tango Purmerend');
  P('2026-08-20', -150, 'Tango Purmerend'); P('2026-08-20', 60.11, 'Tango Purmerend'); P('2026-08-21', -89.89, 'Tango Purmerend');
  P('2026-09-10', -125, 'Tango Purmerend'); P('2026-09-12', 30, 'Tango Purmerend'); P('2026-09-10', -95, 'Tango Purmerend');
  /* bijna: een cent ernaast */
  P('2026-10-05', -125, 'Shell Express'); P('2026-10-05', 25, 'Shell Express'); P('2026-10-05', -99.99, 'Shell Express');
  /* bijna: vijf dagen uit elkaar */
  P('2026-10-01', -150, 'Esso Zaandam'); P('2026-10-06', 50, 'Esso Zaandam'); P('2026-10-01', -100, 'Esso Zaandam');
  /* bijna: de vrijgave op een andere rekening */
  P('2026-10-12', -150, 'Bp Station'); P('2026-10-12', -100, 'Bp Station'); P('2026-10-12', 50, 'Bp Station', ABN);
  /* A = V: de vrijgave volledig, telt al nul */
  P('2026-10-15', -125, 'Total Energies'); P('2026-10-15', 125, 'Total Energies'); P('2026-10-15', -40, 'Total Energies');
  for (const m of ['07', '08', '09', '10']) { P(`2026-${m}-01`, 3000, 'Werkgever Bv'); P(`2026-${m}-02`, -60, 'Albert Heijn'); }
  (extra || []).forEach((x) => P(...x));
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([N26, ABN]),
    minder_accmeta: JSON.stringify({ [N26]: { balance: 1000, date: '2026-10-23', bank: 'N26' }, [ABN]: { balance: 500, date: '2026-10-23', bank: 'ABN AMRO' } }),
    minder_set: JSON.stringify({ psd2Accounts: { [N26]: { uid: 'u1', iban: N26, label: 'Main 3000', bank: 'N26', exp: '2027-01-20' } }, psd2LastSync: 4102444800000, limit: 70, opnameVanaf: '2099-12-31', toonLegeRek: true, manualBal: {},
      budgets: { vervoer: 400, boodschappen: 300 },
      rules: [{ kw: 'TANGO', cat: 'vervoer' }, { kw: 'SHELL', cat: 'vervoer' }, { kw: 'ESSO', cat: 'vervoer' }, { kw: 'BP STATION', cat: 'vervoer' }, { kw: 'TOTAL ENERGIES', cat: 'vervoer' }] }),
    minder_plan: '{}',
  };
}
async function boot(page, extra) {
  await pinDatum(page, '2026-10-23');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v457')) { sessionStorage.setItem('v457', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(extra));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof vorautPatroon === 'function');
}
const sleutelOp = (page, datum, bedrag) => page.evaluate(([d, b]) => String(TX.find((t) => t.date === d && t.amount === b).id), [datum, bedrag]);
const antw = (page, k, ja) => page.evaluate(([k, ja]) => { vorautAntw(k, ja); }, [k, ja]);

test.describe('1 · het patroon', () => {
  test('a. de fixture draagt de gevallen: alles in vervoer, A en B uitgaven', async ({ page }) => {
    await boot(page);
    const c = await page.evaluate(() => [...new Set(TX.filter((t) => !/Werkgever|Heijn/.test(t.name)).map((t) => catOf(t)))]);
    expect(c).toEqual(['vervoer']);
  });
  test('b. A − V = B tot op de cent, dezelfde rekening, dezelfde partij, binnen 3 dagen; A = V als variant', async ({ page }) => {
    await boot(page);
    const G = await page.evaluate(() => vorautPatroon().map((g) => ({ s: g.soort, d: g.A.date, a: g.A.amount, v: g.V.amount, b: g.B ? g.B.amount : null, n: g.A.name, dubbel: g.dubbel })));
    const deels = G.filter((g) => g.s === 'deels');
    expect(deels.map((g) => g.d).sort()).toEqual(['2026-08-05', '2026-08-20', '2026-09-10', '2026-10-21']);
    expect(deels.find((g) => g.d === '2026-10-21')).toMatchObject({ a: -150, v: 52.79, b: -97.21, dubbel: 9721 });
    /* de drie bijna-gevallen niet: een cent ernaast, vijf dagen, een andere rekening */
    expect(G.some((g) => /Shell|Esso|Bp/.test(g.n))).toBe(false);
    expect(G.filter((g) => g.s === 'volledig').map((g) => g.n)).toEqual(['Total Energies']);
  });
});

test.describe('2 · de vraag in Kloppen mijn gegevens?', () => {
  test('c. per geval een vraag met de bedragen en de partij, Ja en Nee even zwaar, niets voorgeselecteerd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { openGegevensVragen('alle');
      const rows = [...document.querySelectorAll('#sheet [data-gegevensvraag="voraut"]')];
      const rij = rows.find((x) => /150,00/.test(x.textContent) && /97,21/.test(x.textContent));
      return { n: rows.length, kop: rij ? rij.querySelector('div').textContent : '', knoppen: rij ? [...rij.querySelectorAll('button')].map((b) => [b.textContent, b.className, b.getAttribute('data-vorautoptie')]) : [] }; });
    expect(r.n).toBe(4);
    expect(r.kop).toBe('Zijn €150,00 en -€52,79 de voorautorisatie van je betaling van €97,21 bij Tango?');
    expect(r.knoppen).toEqual([['Ja, die twee tellen niet mee', 'btn sec', 'ja'], ['Nee', 'btn sec', 'nee']]);
  });
  test('d. Ja: A en V tellen niet mee, blijven in de transacties; Vervoer & auto oktober −97,21 en de forecast ook', async ({ page }) => {
    await boot(page);
    const meet = () => page.evaluate(() => { const V = maandVooruit(); return { cat: +catSpendMap('2026-10').vervoer, norm: totals('2026-10').spendNorm, proj: V.projectie, onder: V.budget - V.projectie, tx: TX.length, tel: telbareTx().length }; });
    const voor = await meet();
    const k = await sleutelOp(page, '2026-10-21', -150);
    await antw(page, k, 1);
    const na = await meet();
    expect(Math.round((voor.cat - na.cat) * 100)).toBe(9721);
    expect(Math.round((voor.norm - na.norm) * 100)).toBe(9721);
    expect(Math.round(na.onder - voor.onder)).toBe(97);
    expect(na.tx).toBe(voor.tx);
    expect(voor.tel - na.tel).toBe(2);
    const s = await page.evaluate((k) => [SET.vorautPaar[k].bron, SET.vorautPaar[k].weg.length, gegevensVragen().some((q) => q.qkey === 'voraut|' + k)], k);
    expect(s).toEqual(['jij', 2, false]);
  });
  test('e. Nee: er verandert niets en de vraag is weg', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => +catSpendMap('2026-10').vervoer);
    const k = await sleutelOp(page, '2026-10-21', -150);
    await antw(page, k, 0);
    const na = await page.evaluate((k) => [+catSpendMap('2026-10').vervoer, SET.vorautPaar[k].weg.length, gegevensVragen().some((q) => q.qkey === 'voraut|' + k)], k);
    expect(na).toEqual([voor, 0, false]);
  });
});

test.describe('3 · na 3x Ja herstelt Minder zelf', () => {
  test('f. drie keer Ja bij Tango: het vierde geval is door Minder hersteld, zichtbaar en in de log', async ({ page }) => {
    await boot(page);
    for (const [d, a] of [['2026-08-05', -125], ['2026-08-20', -150], ['2026-09-10', -125]]) await antw(page, await sleutelOp(page, d, a), 1);
    const k = await sleutelOp(page, '2026-10-21', -150);
    const r = await page.evaluate((k) => ({ e: SET.vorautPaar[k], log: SET.vorautLog, vraag: gegevensVragen().some((q) => q.soort === 'voraut'),
      kennis: kennisLijst().find((x) => x.id === 'v:' + k), cat: +catSpendMap('2026-10').vervoer }), k);
    expect(r.e).toMatchObject({ bron: 'minder', partij: expect.any(String) });
    expect(r.e.weg.length).toBe(2);
    expect(r.log.map((g) => [g.actie, g.sleutel])).toEqual([['hersteld', k]]);
    expect(r.vraag).toBe(false);
    expect(r.kennis).toMatchObject({ groep: 'voraut', bron: 'minder' });
    /* in Wat Minder van jou weet, met de bron in woorden */
    const t = await page.evaluate(() => { openKennis(); const k = document.querySelector('#sheet').textContent; openJeCijfers(); return { k, c: document.querySelector('#sheet').textContent }; });
    expect(t.k).not.toContain('door Minder hersteld');   // v462 (B6): wat Minder zelf herstelde staat in Je cijfers
    expect(t.c).toContain('rekenfout van Minder · je saldo is niet veranderd');
  });
  test('g. terugdraaien van het herstel telt als Nee: daarna herstelt Minder bij Tango niets meer', async ({ page }) => {
    await boot(page, [['2026-10-22', -110, 'Tango Purmerend'], ['2026-10-22', 30, 'Tango Purmerend'], ['2026-10-22', -80, 'Tango Purmerend']]);
    for (const [d, a] of [['2026-08-05', -125], ['2026-08-20', -150], ['2026-09-10', -125]]) await antw(page, await sleutelOp(page, d, a), 1);
    const k = await sleutelOp(page, '2026-10-21', -150), k2 = await sleutelOp(page, '2026-10-22', -110);
    expect(await page.evaluate(([a, b]) => [SET.vorautPaar[a].bron, SET.vorautPaar[b].bron], [k, k2])).toEqual(['minder', 'minder']);
    await page.evaluate((k) => kennisVergeet('v:' + k), k);
    const r = await page.evaluate(([a, b]) => ({ e: SET.vorautPaar[a], b: SET.vorautPaar[b], actief: vorautAutoActief(vorautKandidaten().find((x) => x.sleutel === a).partij), log: SET.vorautLog.map((g) => g.actie) }), [k, k2]);
    expect(r.e).toMatchObject({ bron: 'jij', terugVan: 'minder' });
    expect(r.e.weg).toEqual([]);
    expect(r.actief).toBe(false);
    expect(r.b.bron).toBe('minder');   // een ander geval blijft zoals het was
    expect(r.log).toEqual(['hersteld', 'hersteld', 'teruggedraaid']);
  });
  test('h. met een Nee ertussen herstelt Minder niets zelf, ook niet na 3x Ja', async ({ page }) => {
    /* een vijfde geval dat open blijft, anders valt er na het laatste antwoord niets meer te herstellen (meetles r) */
    await boot(page, [['2026-10-22', -110, 'Tango Purmerend'], ['2026-10-22', 30, 'Tango Purmerend'], ['2026-10-22', -80, 'Tango Purmerend']]);
    await antw(page, await sleutelOp(page, '2026-08-05', -125), 1);
    await antw(page, await sleutelOp(page, '2026-08-20', -150), 0);
    await antw(page, await sleutelOp(page, '2026-09-10', -125), 1);
    const k = await sleutelOp(page, '2026-10-21', -150);
    await antw(page, k, 1);
    expect(await page.evaluate(() => [Object.values(SET.vorautPaar).filter((e) => e.bron === 'minder').length, (SET.vorautLog || []).length])).toEqual([0, 0]);
    const k5 = await sleutelOp(page, '2026-10-22', -110);
    expect(await page.evaluate((k) => gegevensVragen().some((q) => q.qkey === 'voraut|' + k), k5)).toBe(true);
  });
});

test.describe('4 · meten en blok 20', () => {
  test('i. het meetblok: per maand, per partij, pending of geboekt, v293 ter vergelijking; leest alleen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const b = DIAG_BLOKKEN.find((x) => x.lees === diagVorautPatroon); let w = 0; const o = localStorage.setItem; localStorage.setItem = function () { w++; return o.apply(this, arguments); };
      try { return { L: b.lees(), w }; } finally { localStorage.setItem = o; } });
    const t = r.L.join('\n');
    expect(r.w).toBe(0);
    expect(t).toContain('gevallen: 4 met A − V = B · 1 met A = V');
    expect(t).toContain('    2026-10  1 · 97.21 · 0.00');
    expect(t).toContain('    2026-08  2 · 187.11 · 0.00');
    expect(t).toMatch(/Tango: 4 · 379\.32 · 0 · 0 · 0/);
    expect(t).toMatch(/N26: 14 · 0 · 14 · psd2 · 0 · alle regels kwamen GEBOEKT binnen/);
    expect(t).toContain('zonder de partij-eis (alleen dezelfde rekening)');
    /* de afleiding van v293 (14 dagen, elke rekening) koppelde de vrijgave van 6 aug aan de 150 van 20 aug: twee gevallen gemist */
    expect(t).toContain('de afleiding van v293 (14 dagen, alleen uitgaven) had hiervan 2 van 4 als kandidaat');
  });
  test('j. blok 20: per maand open, bevestigd en zelf hersteld, met een controle', async ({ page }) => {
    await boot(page);
    await antw(page, await sleutelOp(page, '2026-10-21', -150), 1);
    const L = await page.evaluate(() => diagSalarisVerdeling());
    const t = L.join('\n');
    expect(t).toContain('VOORAUTORISATIE (v457): 4 geval(len) A − V = B onder je uitgaven');
    expect(t).toContain('    2026-10  open 0 (0.00) · bevestigd 1 (97.21) · zelf hersteld 0 (0.00) · nee 0 (0.00)');
    expect(t).toContain('    2026-09  open 1 (95.00)');
    expect(t).toMatch(/CONTROLE: open telt dubbel 282\.11 .* → klopt/);
  });
  test('k. de sheet in Instellingen leest dezelfde lijst', async ({ page }) => {
    await boot(page);
    const n = await page.evaluate(() => { openVoraut(); return document.querySelectorAll('#sheet .card').length; });
    expect(n).toBe(4);
  });
});
