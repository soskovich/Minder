/* v460 · DEEL B FASE 1, DE MOTOR (gevraagd door de gebruiker). Een run van de controles in de sync en na een antwoord; opstarten leest de
   opgeslagen uitkomst (alleen een nieuwe versie draait een keer); de aansluiting per rekening (ABN geboekt moet sluiten, N26 verwacht mag
   een sync en tot 3 dagen); soort 2 alleen in Diagnose; een keuze wacht alleen boven 10% of als het teken kan omdraaien, en komt terug met
   een melding; een correctie die na een nieuwe versie niet meer nodig is gaat uit ("opgelost in de code"); blok 26 bewaakt toevalsgevallen
   (bekend toeval alleen geteld, een nieuw geval per geval en in Wacht op de bouwer); B8 verklaard; het log. GECONSTRUEERDE fixture (die
   van v457/v458), met een tweede rekening (ABN) voor de aansluiting. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const N26 = 'DE89370400440532013000', ABN = '521200806';
function seed(extra) {
  const tx = [];
  const P = (d, a, name, acc) => tx.push({ id: 'v' + tx.length, date: d, amount: a, acc: acc || N26, src: 'psd2', name, desc: name + ' PMNT',
    bankRef: '', typ: '', ref: '', accName: '', refNums: [] });
  P('2026-10-21', -150, 'Tango Purmerend'); P('2026-10-21', -97.21, 'Tango Purmerend'); P('2026-10-23', 52.79, 'Tango Purmerend');
  P('2026-08-05', -125, 'Tango Purmerend'); P('2026-08-06', 27.78, 'Tango Purmerend'); P('2026-08-05', -97.22, 'Tango Purmerend');
  P('2026-08-20', -150, 'Tango Purmerend'); P('2026-08-20', 60.11, 'Tango Purmerend'); P('2026-08-21', -89.89, 'Tango Purmerend');
  P('2026-09-10', -125, 'Tango Purmerend'); P('2026-09-12', 30, 'Tango Purmerend'); P('2026-09-10', -95, 'Tango Purmerend');
  /* bekend toeval: drie verschillende partijen die toevallig optellen */
  P('2026-10-19', -30, 'Kruidvat Purmerend'); P('2026-10-19', 10, 'Jan de Vries'); P('2026-10-19', -20, 'Bol Com');
  for (const m of ['07', '08', '09', '10']) { P(`2026-${m}-01`, 3000, 'Werkgever Bv'); P(`2026-${m}-02`, -60, 'Albert Heijn'); P(`2026-${m}-03`, -40, 'Jumbo', ABN); }
  (extra || []).forEach((x) => P(...x));
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([N26, ABN]),
    minder_accmeta: JSON.stringify({ [N26]: { balance: 1000, date: '2026-10-23', bank: 'N26' }, [ABN]: { balance: 500, date: '2026-10-23', bank: 'ABN AMRO' } }),
    minder_set: JSON.stringify({ psd2Accounts: { [N26]: { uid: 'u1', iban: N26, label: 'Main 3000', bank: 'N26', exp: '2027-01-03' }, [ABN]: { uid: 'u2', iban: 'NL00ABNA0' + ABN, label: 'Betaalrekening', bank: 'ABN AMRO', exp: '2027-01-08' } },
      psd2LastSync: 4102444800000, psd2Url: 'https://x.test', psd2Token: 't', limit: 70, opnameVanaf: '2099-12-31', toonLegeRek: true, manualBal: {},
      budgets: { vervoer: 400, boodschappen: 300 }, rules: [{ kw: 'TANGO', cat: 'vervoer' }] }),
    minder_plan: '{}',
  };
}
async function boot(page, extra) {
  await pinDatum(page, '2026-10-23');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v460')) { sessionStorage.setItem('v460', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(extra));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof runControles === 'function');
}
/* een sync via de echte psd2Refresh met een gestubde bank: per rekening het saldo, de saldosoort en de boekingen */
const sync = (page, B) => page.evaluate((B) => {
  const r = (d, a, n) => ({ transaction_amount: { amount: String(Math.abs(a)) }, credit_debit_indicator: a < 0 ? 'DBIT' : 'CRDT', booking_date: d,
    creditor: { name: n }, debtor: { name: n }, remittance_information: '', bank_transaction_code: { description: 'PMNT' } });
  psd2Api = async (pad) => { const uid = /accounts\/([^/]+)\//.exec(pad)[1], b = B[uid] || { saldo: 0, soort: 'XPCD', tx: [] };
    if (/transaction_status=PDNG/.test(pad)) return { transactions: [] };
    if (/\/balances/.test(pad)) return { balances: [{ balance_type: b.soort, balance_amount: { amount: String(b.saldo) } }] };
    return { transactions: (b.tx || []).map((x) => r(...x)) }; };
  return psd2Refresh(true); }, B);
const aansl = (page, acc) => page.evaluate((acc) => { const u = (SET.controles.uitkomst || []).find((x) => x.id === 'aansl:' + acc); return u ? { status: u.status, bedrag: u.bedrag, soort: u.soort } : null; }, acc);

test.describe('B1 · een run, opgeslagen', () => {
  test('a. opstarten leest de opgeslagen uitkomst; een sync draait de controles', async ({ page }) => {
    await boot(page);
    const t0 = await page.evaluate(() => ({ bron: SET.controles.run.bron, tijd: SET.controles.run.tijd, n: SET.controles.uitkomst.length }));
    expect(t0.bron).toBe('versie');
    expect(t0.n).toBeGreaterThan(3);
    await page.reload(); await page.waitForFunction(() => typeof runControles === 'function');
    expect(await page.evaluate(() => SET.controles.run.tijd)).toBe(t0.tijd);
    await sync(page, { u1: { saldo: 1000, soort: 'XPCD', tx: [] }, u2: { saldo: 500, soort: 'ITBD', tx: [] } });
    const r = await page.evaluate(() => ({ bron: SET.controles.run.bron, duur: typeof SET.controles.run.duur }));
    expect(r).toEqual({ bron: 'sync', duur: 'number' });
    /* blok 20 noemt de run met zijn duur; de blokken met controles dragen de opgeslagen uitkomst */
    const t = await page.evaluate(async () => { const L = diagSalarisVerdeling().join('\n'); return { L, d: await diagTekst() }; });
    expect(t.L).toMatch(/RUN VAN DE CONTROLES \(deel B, v460\): .* · na sync · duur \d+ ms · \d+ controles/);
    expect((t.d.match(/OPGESLAGEN UITKOMST \(run /g) || []).length).toBe(5);
  });
  test('b. een antwoord draait de controles direct', async ({ page }) => {
    await boot(page);
    const k = await page.evaluate(() => String(TX.find((t) => t.date === '2026-08-05' && t.amount === -125).id));
    await page.evaluate((k) => vorautAntw(k, 1), k);
    /* v461 (route 2): fase B draait na het tekenen (een timer); wacht tot hij er is */
    await page.waitForFunction(() => !window._ctrlTimer && SET.controles.run.bron === 'antwoord');
    expect(await page.evaluate(() => SET.controles.run.bron)).toBe('antwoord');
  });
});

test.describe('B3 · aansluiting per rekening', () => {
  test('c. ABN (geboekt): sluit als het saldo met de boekingen beweegt; een verschil wacht op de bouwer, alleen in Diagnose', async ({ page }) => {
    await boot(page);
    await sync(page, { u1: { saldo: 1000, soort: 'XPCD' }, u2: { saldo: 500, soort: 'ITBD' } });
    expect(await aansl(page, ABN)).toBeNull();   // de eerste sync is het beginpunt
    await sync(page, { u1: { saldo: 1000, soort: 'XPCD' }, u2: { saldo: 450, soort: 'ITBD', tx: [['2026-10-23', -50, 'Hema Purmerend']] } });
    expect(await aansl(page, ABN)).toEqual({ status: 'klopt', bedrag: 0, soort: 2 });
    await sync(page, { u1: { saldo: 1000, soort: 'XPCD' }, u2: { saldo: 420, soort: 'ITBD', tx: [['2026-10-23', -50, 'Hema Purmerend']] } });
    expect(await aansl(page, ABN)).toEqual({ status: 'wacht', bedrag: 30, soort: 2 });
    /* Diagnose: aansluiting en wacht op de bouwer */
    await page.evaluate(() => diagOpen());
    const d = await page.locator('#controleDiag').innerText();
    expect(d).toMatch(/ABN ··0806[\s\S]*VERSCHIL € ?30/);
    expect(d).toContain('Aansluiting ABN ··0806');
    /* geen label op de schermen */
    await page.evaluate(() => { closeSheet(); go('maand'); });
    for (const s of ['#s-maand', '#s-dash']) { const t = await page.evaluate((s) => (document.querySelector(s) || {}).textContent || '', s);
      expect(t).not.toMatch(/Aansluiting|nagerekend|onzeker|wacht op de bouwer/i); }
  });
  test('d. N26 (verwacht saldo): een verschil mag een sync blijven en tot 3 dagen; daarna soort 2', async ({ page }) => {
    await boot(page);
    const B = (s) => ({ u1: { saldo: s, soort: 'XPCD' }, u2: { saldo: 500, soort: 'ITBD' } });
    await sync(page, B(1000));
    await sync(page, B(980));
    expect(await aansl(page, N26)).toEqual({ status: 'verklaard', bedrag: 20, soort: 2 });
    await sync(page, B(980));
    expect((await aansl(page, N26)).status).toBe('verklaard');   // twee syncs, maar nog geen 3 dagen
    await page.evaluate((acc) => { SET.controles.aansluiting[acc].open.sinds -= 4 * 864e5; save(); }, N26);
    await sync(page, B(980));
    expect(await aansl(page, N26)).toEqual({ status: 'wacht', bedrag: 20, soort: 2 });
    /* sluit het verschil weer, dan klopt hij */
    await sync(page, { u1: { saldo: 980, soort: 'XPCD', tx: [['2026-10-22', -20, 'Bakker Bart']] }, u2: { saldo: 500, soort: 'ITBD' } });
    expect((await aansl(page, N26)).status).toBe('klopt');
  });
  test('e. Diagnose zegt per rekening dat de maanden voor de eerste sync niet te meten zijn', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => diagOpen());
    const t = await page.locator('[data-aansl]').allInnerTexts();
    expect(t.length).toBe(2);
    for (const r of t) { expect(r).toContain('aug–okt: niet te meten, geen saldo · '); expect(r).toContain(' · vanaf de volgende sync start'); }   // v461: met de reden ertussen
  });
});

test.describe('B3 · een keuze wacht alleen boven 10% of als het teken kan omdraaien', () => {
  const C = (band, w) => ({ uitkomst: [{ id: 'x', soort: 2, status: 'wacht', raakt: ['onderBudget'], bedrag: band }], getallen: { onderBudget: w } });
  test('f. 26 op 415 (6%) wacht niet; 60 op 415 (14%) wel; 500 op 415 (teken) wel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((cs) => cs.map((c) => keuzeWacht('onderBudget', c).wacht), [C(26, 415), C(60, 415), C(500, 415), C(41, 415), C(42, 415), C(5, -3)]);
    expect(r).toEqual([false, true, true, false, true, true]);
  });
  test('g. een wachtende keuze: een zin, geen bedrag, telt niet mee; komt hij terug, dan een melding in de bel (groep Grip)', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const kiesX = { id: 'herz:test', bron: 'herzien', naam: 'Boodschappen herzien', bedrag: '€ 40 te ruim' };
      SET.controles.uitkomst.push({ id: 'testwacht', soort: 2, status: 'wacht', raakt: ['onderBudget'], bedrag: 999 });
      SET.controles.getallen.onderBudget = 415;
      const W = keuzeWacht(kiesRaakt(kiesX));
      return { wacht: W.wacht, naam: W.naam }; });
    expect(r).toEqual({ wacht: true, naam: 'onder budget' });
    /* via de echte cyclus: een gemaakte keuze-rij landt in kiesWacht en de zin staat er, zonder bedrag */
    const h = await page.evaluate(() => { const C = gripCyclusLees(); C.kiesWacht = [{ id: 'herz:test', naam: 'Boodschappen herzien', wachtGetal: keuzeWacht('onderBudget') }];
      return gripKiezenNieuw(C); });
    expect(h).toContain("Deze keuze komt terug zodra 'onder budget' is nagerekend.");
    expect(h).toMatch(/data-kieswacht="herz:test"[^>]*>(?:(?!€).)*nagerekend/s);
    /* de melding: wachtte de keuze in de vorige run en nu niet meer */
    await page.evaluate(() => { SET.controles.wachtGetallen = ['onderBudget']; runControles('sync'); });
    const n = await page.evaluate(() => notifList().map((x) => x.key));
    expect(n).toContain('grip-keuzeterug-onderBudget');
    expect(await page.evaluate(() => notifGrp('grip-keuzeterug-onderBudget'))).toBe('grip');
  });
});

test.describe('B2 · soort 1: een correctie die niet meer nodig is gaat uit', () => {
  test('h. na een nieuwe versie zonder correctie hetzelfde getal: uit en "opgelost in de code"; nog nodig: blijft aan', async ({ page }) => {
    await boot(page);
    /* een herstel door Minder dat niets verandert (de boekingen bestaan niet meer) */
    await page.evaluate(() => { SET.vorautPaar = { 'weg-1': { weg: ['bestaat-niet-a', 'bestaat-niet-b'], bron: 'minder', partij: 'X', op: '2026-10-01' } }; SET.controles.versie = 'oud'; save(); });
    await page.reload(); await page.waitForFunction(() => typeof runControles === 'function');
    const r = await page.evaluate(() => ({ uit: !!SET.controles.uit.voraut, paar: Object.keys(SET.vorautPaar || {}), log: SET.controles.log.map((e) => e.effect).join('|') }));
    expect(r.uit).toBe(true);
    expect(r.paar).toEqual([]);
    expect(r.log).toContain('opgelost in de code · correctie uit');
  });
  test('i. een herstel dat het getal wel verandert blijft aan', async ({ page }) => {
    await boot(page);
    for (const [d, a] of [['2026-08-05', -125], ['2026-08-20', -150], ['2026-09-10', -125]]) {
      const k = await page.evaluate(([d, a]) => String(TX.find((t) => t.date === d && t.amount === a).id), [d, a]);
      await page.evaluate((k) => vorautAntw(k, 1), k); }
    const k = await page.evaluate(() => String(TX.find((t) => t.date === '2026-10-21' && t.amount === -150).id));
    expect(await page.evaluate((k) => SET.vorautPaar[k].bron, k)).toBe('minder');
    await page.evaluate(() => { SET.controles.versie = 'oud'; save(); });
    await page.reload(); await page.waitForFunction(() => typeof runControles === 'function');
    const r = await page.evaluate((k) => ({ uit: !!(SET.controles.uit || {}).voraut, bron: (SET.vorautPaar[k] || {}).bron }), k);
    expect(r).toEqual({ uit: false, bron: 'minder' });
    /* het log draagt het herstel en de historische regel van contant */
    const log = await page.evaluate(() => controleLogTekst());
    expect(log).toMatch(/voorautorisatie \| aan \| .*Tango.*voorautorisatie € ?150,00 en vrijgave −€ ?52,79 tellen niet mee/);
    expect(log).toContain('contant-telling | uit | tellingboekingen van voor de v420-grens telden dubbel in het potje Contant · opgelost in de code (v450) · correctie uit');
  });
});

test.describe('B7 · blok 26 bewaakt toevalsgevallen', () => {
  test('j. bekend toeval alleen in de telling; een nieuw geval per geval, in Wacht op de bouwer; oordeel toeval of echt', async ({ page }) => {
    await boot(page);
    const b = await page.evaluate(() => ({ bekend: SET.controles.bekendToeval.length, wacht: SET.controles.uitkomst.filter((u) => /^vorautnaam:/.test(u.id)).length }));
    expect(b).toEqual({ bekend: 1, wacht: 0 });
    /* een nieuw toevalsgeval komt binnen */
    await page.evaluate(() => { for (const [d, a, n] of [['2026-10-20', -45, 'Hema Zaandam'], ['2026-10-20', 15, 'Piet Jansen'], ['2026-10-20', -30, 'Coolblue Bv']])
      TX.push({ id: 'n' + n, date: d, amount: a, acc: 'DE89370400440532013000', src: 'psd2', name: n, desc: n + ' PMNT', bankRef: '', typ: '', ref: '', accName: '', refNums: [] });
      TX.forEach(categorize); save(); runControles('sync'); });
    const t = (await page.evaluate(() => diagVorautPatroon())).join('\n');
    expect(t).toContain('2026-10-20 ··3000 · LIJKT TOEVAL · nieuw sinds de vorige run · telt nu dubbel 30.00');
    expect(t).toContain('"Hema Zaandam PMNT"');
    expect(t).not.toContain('Kruidvat Purmerend PMNT');   // bekend toeval: alleen geteld
    expect(t).toContain('samen: 0 lijkt echt (telt nu dubbel 0.00) · 1 lijkt toeval (alleen geteld, niet per geval getoond) · 1 nieuw toevalsgeval per geval hierboven');
    await page.evaluate(() => diagOpen());
    expect(await page.locator('[data-controlevorautnaam]').innerText()).toContain('nieuw sinds de vorige run: 1 · bekend toeval: 1');
    /* een volgende run: niet meer nieuw, wacht op je oordeel */
    await page.evaluate(() => runControles('sync'));
    expect((await page.evaluate(() => diagVorautPatroon())).join('\n')).toContain('LIJKT TOEVAL · wacht op je oordeel');
    /* echt: een vraag (soort 3) */
    const k = await page.evaluate(() => String(TX.find((t) => t.name === 'Hema Zaandam').id));
    await page.evaluate((k) => vorautNaamOordeel(k, 'echt'), k);
    expect(await page.evaluate(() => vorautVragen().map((v) => v.t.name))).toContain('Hema Zaandam');
    /* toeval: naar de bekende lijst */
    await page.evaluate((k) => { delete SET.controles.toevalOordeel[k]; vorautNaamOordeel(k, 'toeval'); }, k);
    const e = await page.evaluate(() => ({ bekend: SET.controles.bekendToeval.length, t: diagVorautPatroon().join('\n') }));
    expect(e.bekend).toBe(2);
    expect(e.t).not.toContain('Hema Zaandam PMNT');
  });
});

test.describe('B7 + B8 · Diagnose en verklaard', () => {
  test('k. Diagnose: de secties in volgorde, kopieerbare tekst, en kijken schrijft niets', async ({ page }) => {
    await boot(page);
    let w = 0;
    await page.evaluate(() => { window.__w = 0; const o = localStorage.setItem; localStorage.setItem = function () { window.__w++; return o.apply(this, arguments); }; });
    await page.evaluate(() => diagOpen());
    await page.waitForFunction(() => (document.querySelector('#diagUit') || {}).value && document.querySelector('#diagUit').value.indexOf('=== EINDE ===') > -1);
    w = await page.evaluate(() => window.__w);
    expect(w).toBe(0);
    const t = await page.locator('#controleDiag').innerText();
    const volg = ['AANSLUITING PER REKENING', 'WACHT OP DE BOUWER', 'GECORRIGEERD', 'KLEINE VRAGEN', 'KLOPT', 'Archief: verklaarde maanden', 'Log van aanpassingen'];
    let p = -1; for (const s of volg) { const i = t.toUpperCase().indexOf(s.toUpperCase()); expect(i, s).toBeGreaterThan(p); p = i; }
    expect(await page.locator('[data-controlekopie]').count()).toBeGreaterThan(0);
    expect(t).toContain('Contant: tellingboekingen dubbel');
  });
  test('l. B8: verklaard dekt een wachtende controle zolang het bedrag gelijk blijft; anders weer wacht; een afgesloten maand gaat naar het archief; dezelfde reden in een nieuwe maand wordt een vraag', async ({ page }) => {
    await boot(page);
    const B = (s) => ({ u1: { saldo: 1000, soort: 'XPCD' }, u2: { saldo: s, soort: 'ITBD' } });
    await sync(page, B(500)); await sync(page, B(470));
    expect((await aansl(page, ABN)).status).toBe('wacht');
    await page.evaluate((acc) => { SET.controles.verklaard = { ['aansl:' + acc]: { reden: 'weet ik niet', bedrag: 30, maand: '2026-10' } }; runControles('antwoord'); }, ABN);
    expect((await aansl(page, ABN)).status).toBe('verklaard');
    await sync(page, B(460));
    expect((await aansl(page, ABN)).status).toBe('wacht');   // het bedrag veranderde: de reden dekt het niet meer
    /* een verklaarde controle van september gaat naar het archief, en dezelfde reden in oktober wordt een vraag */
    const r = await page.evaluate((acc) => { SET.controles.verklaard = { ['aansl:' + acc]: { reden: 'weet ik niet', bedrag: 40, maand: '2026-10' }, 'oud:x': { reden: 'weet ik niet', bedrag: 5, maand: '2026-09' } };
      runControles('antwoord'); return (SET.controles.uitkomst.find((u) => u.id === 'aansl:' + acc) || {}).status; }, ABN);
    expect(r).toBe('vraag');
    const a = await page.evaluate(() => SET.controles.uitkomst.filter((u) => u.archief).map((u) => u.maand));
    for (const m of a) expect(m < '2026-10').toBe(true);
  });
});
