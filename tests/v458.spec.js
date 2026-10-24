/* v458 (gevraagd door de gebruiker, antwoord op punt 7 van v457): vier punten over de voorautorisatie.
   1. zelf herstelde gevallen staan (tot deel B "Je cijfers" bestaat) in "Wat Minder van jou weet", groep Voorautorisaties, en in de log;
   2. na een Nee of een teruggedraaid geval herstelt Minder bij die partij niets meer zelf, maar de vraag komt per nieuw geval terug;
   3. blok 26 zet eerder bevestigde koppelingen (v293 in SET.vorautPaar zonder bron, v288 in SET.dubbelPaar) naast de nieuwe detectie,
      en verandert niets;
   5. blok 26 toont de gevallen die alleen zonder de partij-eis gevonden worden, met per kant omschrijving en recurKey, en zegt per
      geval of het lijkt op een echte voorautorisatie met een afwijkende partij-sleutel (telt nu dubbel) of op toeval; niets gekoppeld;
   4. het zelf herstellen draait in de sync; het draait TOT DEEL B ook bij het opstarten (gemeld, vastgelegd voor deel B).
   GECONSTRUEERDE fixture: die van v457 (het Tango-geval van 21-10, drie oudere Tango-gevallen en de bijna-gevallen). */
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
    minder_set: JSON.stringify({ psd2Accounts: { [N26]: { uid: 'u1', iban: N26, label: 'Main 3000', bank: 'N26', exp: '2027-01-20' } }, psd2LastSync: 4102444800000, psd2Url: 'https://x.test', psd2Token: 't', limit: 70, opnameVanaf: '2099-12-31', toonLegeRek: true, manualBal: {},
      budgets: { vervoer: 400, boodschappen: 300 },
      rules: [{ kw: 'TANGO', cat: 'vervoer' }, { kw: 'SHELL', cat: 'vervoer' }, { kw: 'ESSO', cat: 'vervoer' }, { kw: 'BP STATION', cat: 'vervoer' }, { kw: 'TOTAL ENERGIES', cat: 'vervoer' }] }),
    minder_plan: '{}',
  };
}
async function boot(page, extra) {
  await pinDatum(page, '2026-10-23');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v458')) { sessionStorage.setItem('v458', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(extra));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof vorautPatroon === 'function');
}
const sleutelOp = (page, datum, bedrag) => page.evaluate(([d, b]) => String(TX.find((t) => t.date === d && t.amount === b).id), [datum, bedrag]);
const antw = (page, k, ja) => page.evaluate(([k, ja]) => { vorautAntw(k, ja); }, [k, ja]);


/* een sync met een nieuw Tango-geval op 22-10 (A 110, V 30, B 80), via de echte psd2Refresh met een gestubde bank */
const syncNieuw = (page) => page.evaluate(() => {
  const r = (a, dc) => ({ transaction_amount: { amount: String(a) }, credit_debit_indicator: dc, booking_date: '2026-10-22',
    creditor: { name: 'Tango Purmerend' }, debtor: { name: 'Tango Purmerend' }, remittance_information: '', bank_transaction_code: { description: 'PMNT' } });
  psd2Api = async (pad) => {
    if (/transaction_status=PDNG/.test(pad)) return { transactions: [] };
    if (/\/balances/.test(pad)) return { balances: [{ balance_type: 'CLBD', balance_amount: { amount: '1000.00' } }] };
    return { transactions: [r('110.00', 'DBIT'), r('30.00', 'CRDT'), r('80.00', 'DBIT')] };
  };
  return psd2Refresh(true);
});
const nieuwK = (page) => page.evaluate(() => { const t = TX.find((x) => x.date === '2026-10-22' && Math.abs(x.amount) === 110); return t ? String(t.id) : null; });
const jaDrie = async (page) => { for (const [d, a] of [['2026-08-05', -125], ['2026-08-20', -150], ['2026-09-10', -125]]) await antw(page, await sleutelOp(page, d, a), 1); };

test.describe('1 · zelf hersteld is zichtbaar', () => {
  test('a. een zelf hersteld geval staat in Wat Minder van jou weet, groep Voorautorisaties, met de bron, en in de log', async ({ page }) => {
    await boot(page);
    await jaDrie(page);
    const k = await sleutelOp(page, '2026-10-21', -150);
    const r = await page.evaluate((k) => { openJeCijfers(); const sh = document.querySelector('#sheet');   // v462 (B6): zelf hersteld staat in Je cijfers
      return { e: SET.vorautPaar[k].bron, log: (SET.vorautLog || []).map((g) => g.actie + ':' + g.sleutel), groep: (kennisLijst().find((x) => x.id === 'v:' + k) || {}).groep, t: sh.textContent, rij: !!sh.querySelector('[data-cijferscorrectie="' + k + '"]') }; }, k);
    expect(r.e).toBe('minder');
    expect(r.log).toEqual(['hersteld:' + k]);
    expect(r.groep).toBe('voraut');
    expect(r.t).toContain('Gecorrigeerd door Minder');
    expect(r.rij).toBe(true);
  });
});

test.describe('2 · na een Nee of een teruggedraaid geval komt de vraag per geval terug', () => {
  test('b. na een Nee: een nieuw geval van die partij uit de sync wordt niet hersteld en krijgt de vraag', async ({ page }) => {
    await boot(page);
    await jaDrie(page);
    /* het vierde geval is al hersteld; een Nee op een ander geval: het 21-10-herstel terugdraaien zou ook kunnen, hier een gewone Nee */
    await page.evaluate(() => { for (const k of Object.keys(SET.vorautPaar)) if (SET.vorautPaar[k].bron === 'minder') delete SET.vorautPaar[k]; SET.vorautLog = []; save(); });
    await antw(page, await sleutelOp(page, '2026-10-21', -150), 0);
    await syncNieuw(page);
    const k = await nieuwK(page);
    expect(k).not.toBeNull();
    const r = await page.evaluate((k) => ({ e: (SET.vorautPaar || {})[k] || null, vraag: gegevensVragen().some((q) => q.qkey === 'voraut|' + k), kand: vorautKandidaten().some((x) => x.sleutel === k) }), k);
    expect(r.kand).toBe(true);
    expect(r.e).toBeNull();
    expect(r.vraag).toBe(true);
  });
  test('c. na terugdraaien van een herstel: een nieuw geval uit de sync krijgt de vraag, en Ja werkt nog per geval', async ({ page }) => {
    await boot(page);
    await jaDrie(page);
    const k4 = await sleutelOp(page, '2026-10-21', -150);
    await page.evaluate((k) => kennisVergeet('v:' + k), k4);
    await syncNieuw(page);
    const k = await nieuwK(page);
    expect(await page.evaluate((k) => [((SET.vorautPaar || {})[k] || {}).bron || null, gegevensVragen().some((q) => q.qkey === 'voraut|' + k)], k)).toEqual([null, true]);
    await antw(page, k, 1);
    expect(await page.evaluate((k) => SET.vorautPaar[k].bron, k)).toBe('jij');
  });
});

test.describe('3 · oude bevestigingen tegen de nieuwe detectie', () => {
  const oudBoot = async (page) => {
    await boot(page);
    await page.evaluate(() => {
      const id = (d, a) => String(TX.find((t) => t.date === d && t.amount === a).id);
      SET.vorautPaar = {
        [id('2026-08-05', -125)]: { weg: [id('2026-08-05', -125), id('2026-08-06', 27.78)], op: '2026-09-01' },   // gelijk
        [id('2026-08-20', -150)]: { weg: [id('2026-08-20', -150), id('2026-08-06', 27.78)], op: '2026-09-01' },   // de oude afleiding: andere vrijgave
        [id('2026-10-01', -150)]: { weg: [id('2026-10-01', -150), id('2026-10-06', 50)], op: '2026-10-07' },      // vijf dagen: niet gevonden
      };
      SET.dubbelPaar = { x: { weg: id('2026-10-21', -97.21), op: '2026-10-22' } };                               // v288: is B in een geval
      save();
    });
  };
  test('d. blok 26 noemt per oude koppeling datum, partij, oud tegen nieuw, en zegt gelijk / anders / niet gevonden', async ({ page }) => {
    await oudBoot(page);
    const t = (await page.evaluate(() => diagVorautPatroon())).join('\n');
    expect(t).toContain('OUDE BEVESTIGINGEN (v288/v293) TEGEN DE NIEUWE DETECTIE');
    expect(t).toContain('v293: 3 bevestigde koppeling(en), waarvan 1 gelijk aan de nieuwe detectie · v288: 1 dubbele kant(en)');
    expect(t).toContain('2026-08-20 · Tango · v293 · oud: A 150.00 op 2026-08-20 · V 27.78 op 2026-08-06 (B zou 122.22 zijn) → ANDERS GEKOPPELD, nieuw: A 150.00 op 2026-08-20 · V 60.11 op 2026-08-20 · B 89.89 op 2026-08-21');
    expect(t).toContain('2026-10-01 · Esso · v293 · oud: A 150.00 op 2026-10-01 · V 50.00 op 2026-10-06 (B zou 100.00 zijn) → NIET GEVONDEN door de nieuwe detectie');
    expect(t).toContain('2026-10-21 · Tango · v288 · oud: dubbele kant 97.21 op 2026-10-21 telt niet mee → ANDERS GEKOPPELD, nieuw: deze boeking is B in A 150.00 op 2026-10-21');
    expect(t).not.toMatch(/2026-08-05 · Tango · v293/);
  });
  test('e. niets verandert: de oude koppelingen blijven staan en het blok schrijft niets', async ({ page }) => {
    await oudBoot(page);
    const r = await page.evaluate(() => { const voor = JSON.stringify([SET.vorautPaar, SET.dubbelPaar]); let w = 0; const o = localStorage.setItem;
      localStorage.setItem = function () { w++; return o.apply(this, arguments); };
      try { diagVorautPatroon(); } finally { localStorage.setItem = o; }
      return { w, gelijk: voor === JSON.stringify([SET.vorautPaar, SET.dubbelPaar]) }; });
    expect(r).toEqual({ w: 0, gelijk: true });
  });
});

test.describe('4 · wanneer het zelf herstellen draait', () => {
  test('f. in de sync: een nieuw geval van een partij met 3x Ja wordt bij psd2Refresh door Minder hersteld', async ({ page }) => {
    await boot(page);
    await jaDrie(page);
    await syncNieuw(page);
    const k = await nieuwK(page);
    const r = await page.evaluate((k) => ({ e: ((SET.vorautPaar || {})[k] || {}).bron || null, log: (SET.vorautLog || []).filter((g) => g.sleutel === k).map((g) => g.actie) }), k);
    expect(r).toEqual({ e: 'minder', log: ['hersteld'] });
  });
  /* v460 (deel B, B1): het opstarten leest de OPGESLAGEN uitkomst; alleen het eerste opstarten van een nieuwe versie draait de controles
     (en daarmee het zelf herstellen) een keer. Tot v460 draaide het herstel bij elk opstarten (gemeld in v458). */
  test('g. deel B: gewoon opstarten herstelt niets; het eerste opstarten van een nieuwe versie wel, een keer', async ({ page }) => {
    await boot(page);
    /* drie keer Ja opgeslagen ZONDER dat het herstel draaide, het vierde geval open; dan opnieuw opstarten */
    const k = await page.evaluate(() => { const id = (d, a) => String(TX.find((t) => t.date === d && t.amount === a).id);
      SET.vorautPaar = {};
      for (const [a, v] of [[['2026-08-05', -125], ['2026-08-06', 27.78]], [['2026-08-20', -150], ['2026-08-20', 60.11]], [['2026-09-10', -125], ['2026-09-12', 30]]])
        SET.vorautPaar[id(...a)] = { weg: [id(...a), id(...v)], op: '2026-10-01', bron: 'jij', partij: '' };
      save(); return id('2026-10-21', -150); });
    expect(await page.evaluate((k) => (SET.vorautPaar[k] || {}).bron || null, k)).toBeNull();
    await page.reload();
    await page.waitForFunction(() => typeof vorautPatroon === 'function');
    /* dezelfde versie: de opgeslagen uitkomst, geen run */
    expect(await page.evaluate((k) => ((SET.vorautPaar || {})[k] || {}).bron || null, k)).toBeNull();
    const run1 = await page.evaluate(() => SET.controles.run.tijd);
    /* een nieuwe versie: een run bij het opstarten, en het herstel gebeurt */
    await page.evaluate(() => { SET.controles.versie = 'een-oudere-versie'; save(); });
    await page.reload();
    await page.waitForFunction(() => typeof vorautPatroon === 'function');
    const r = await page.evaluate((k) => ({ bron: ((SET.vorautPaar || {})[k] || {}).bron || null, run: SET.controles.run.bron, versie: SET.controles.versie === appVersie() }), k);
    expect(r).toEqual({ bron: 'minder', run: 'versie', versie: true });
    expect(await page.evaluate(() => SET.controles.run.tijd)).toBeGreaterThanOrEqual(run1);
  });
});

test.describe('5 · de gevallen alleen zonder de partij-eis', () => {
  const extra = [
    /* echt: dezelfde naamkern, de vrijgave met een andere partij-sleutel */
    ['2026-10-17', -125, 'Shell Station Zaandam'], ['2026-10-18', 40, 'Shell Nederland Bv'], ['2026-10-17', -85, 'Shell Station Zaandam'],
    /* toeval: drie verschillende partijen op dezelfde rekening die toevallig optellen */
    ['2026-10-19', -30, 'Kruidvat Purmerend'], ['2026-10-19', 10, 'Jan de Vries'], ['2026-10-19', -20, 'Bol Com'],
  ];
  test('h. per geval datum, rekening, A V B met omschrijving en recurKey, en echt (telt dubbel) of toeval; niets gekoppeld', async ({ page }) => {
    await boot(page, extra);
    const r = await page.evaluate(() => { let w = 0; const o = localStorage.setItem; localStorage.setItem = function () { w++; return o.apply(this, arguments); };
      try { return { L: diagVorautPatroon(), w, paar: JSON.stringify(SET.vorautPaar || {}) }; } finally { localStorage.setItem = o; } });
    const t = r.L.join('\n');
    expect(r.w).toBe(0);
    expect(r.paar).toBe('{}');
    expect(t).toContain('ZONDER DE PARTIJ-EIS (v458): 2 geval(len) die de detectie met de partij-eis niet vindt · niets wordt gekoppeld');
    expect(t).toContain('2026-10-17 ··3000 · LIJKT ECHT: dezelfde naam, de partij-sleutel van V wijkt af · telt nu dubbel 85.00');
    expect(t).toContain('A 125.00 op 2026-10-17 · "Shell Station Zaandam PMNT" · recurKey SHELL STATION ZAANDA');
    expect(t).toContain('V 40.00 op 2026-10-18 · "Shell Nederland Bv PMNT" · recurKey SHELL NEDERLAND BV');
    expect(t).toContain('B 85.00 op 2026-10-17 · "Shell Station Zaandam PMNT" · recurKey SHELL STATION ZAANDA');
    /* sinds v459 staat toeval niet meer per geval in de uitvoer, alleen in de telling */
    expect(t).not.toContain('LIJKT TOEVAL');
    expect(t).toContain('samen: 1 lijkt echt (telt nu dubbel 85.00) · 1 lijkt toeval (alleen geteld, niet per geval getoond)');
    /* de detectie met de partij-eis vindt ze niet, en de vraag ook niet */
    expect(await page.evaluate(() => vorautKandidaten().some((k) => /Shell Station|Kruidvat/.test(k.voor.name)))).toBe(false);
  });
  /* v459 (gevraagd door de gebruiker: op het toestel waren alle 14 gevallen toeval): alleen LIJKT ECHT staat per geval in blok 26,
     LIJKT TOEVAL alleen als telling. Twee toevalsgevallen naast een echt geval, zodat de telling meer dan een geval draagt. */
  test('i. v459: per geval alleen LIJKT ECHT; toeval wordt geteld en niet getoond, met geen enkele kant ervan in de uitvoer', async ({ page }) => {
    await boot(page, [...extra, ['2026-10-20', -45, 'Hema Zaandam'], ['2026-10-20', 15, 'Piet Jansen'], ['2026-10-20', -30, 'Coolblue Bv']]);
    const t = (await page.evaluate(() => diagVorautPatroon())).join('\n');
    /* invoermeting: alle drie de gevallen worden zonder de partij-eis gevonden */
    expect(t).toContain('ZONDER DE PARTIJ-EIS (v458): 3 geval(len)');
    expect(t).toContain('2026-10-17 ··3000 · LIJKT ECHT: dezelfde naam, de partij-sleutel van V wijkt af · telt nu dubbel 85.00');
    expect(t).toContain('V 40.00 op 2026-10-18 · "Shell Nederland Bv PMNT"');
    expect(t).not.toContain('LIJKT TOEVAL');
    for (const naam of ['Kruidvat Purmerend', 'Jan de Vries', 'Bol Com', 'Hema Zaandam', 'Piet Jansen', 'Coolblue Bv']) expect(t).not.toContain(`"${naam} PMNT"`);
    expect(t).toContain('samen: 1 lijkt echt (telt nu dubbel 85.00) · 2 lijkt toeval (alleen geteld, niet per geval getoond)');
  });
});
