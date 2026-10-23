/* v461 (gevraagd door de gebruiker op fase 1 van deel B, nog geen fase 2). 1. De snelheid: de run meet per stap, per onderdeel van blok 20
   en per controle zijn duur (blok 20 toont het); in de run rekent een zware functie een keer per stand (runMemo) en slaat blok 20 de
   onderdelen zonder CONTROLE over (die rekenen pas bij openen of delen, met dezelfde functies); een sync tekent het scherm na fase A
   (soort 1) en draait de soort-2-controles daarna (fase B). 2. Een maandsom-verschil dat precies een boeking is, is een kleine vraag
   (soort 3), geen "wacht op de bouwer". 3. Een keuze over een potje (herzien, Let op, patroon) hangt aan de forecast van DAT potje; alleen
   een keuze over het geheel hangt aan onder budget. GECONSTRUEERDE fixture (die van v460). */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const N26 = 'DE89370400440532013000', ABN = '521200806';
function seed(extra) {
  const tx = [];
  const P = (d, a, name, acc) => tx.push({ id: 'v' + tx.length, date: d, amount: a, acc: acc || N26, src: 'psd2', name, desc: name + ' PMNT',
    bankRef: '', typ: '', ref: '', accName: '', refNums: [] });
  P('2026-10-21', -150, 'Tango Purmerend'); P('2026-10-21', -97.21, 'Tango Purmerend'); P('2026-10-23', 52.79, 'Tango Purmerend');
  P('2026-08-05', -125, 'Tango Purmerend'); P('2026-08-06', 27.78, 'Tango Purmerend'); P('2026-08-05', -97.22, 'Tango Purmerend');
  for (const m of ['04', '05', '06', '07', '08', '09', '10']) { P(`2026-${m}-01`, 3000, 'Werkgever Bv'); P(`2026-${m}-02`, -60, 'Albert Heijn'); P(`2026-${m}-03`, -40, 'Jumbo', ABN); }
  (extra || []).forEach((x) => P(...x));
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([N26, ABN]),
    minder_accmeta: JSON.stringify({ [N26]: { balance: 1000, date: '2026-10-23', bank: 'N26' }, [ABN]: { balance: 500, date: '2026-10-23', bank: 'ABN AMRO' } }),
    minder_set: JSON.stringify({ psd2Accounts: { [N26]: { uid: 'u1', iban: N26, label: 'Main 3000', bank: 'N26', exp: '2027-01-03' }, [ABN]: { uid: 'u2', iban: 'NL00ABNA0' + ABN, label: 'Betaalrekening', bank: 'ABN AMRO', exp: '2027-01-08' } },
      psd2LastSync: 4102444800000, psd2Url: 'https://x.test', psd2Token: 't', limit: 70, opnameVanaf: '2099-12-31', toonLegeRek: true, manualBal: {},
      budgets: { vervoer: 400, boodschappen: 300, zorg: 80, vices: 50 }, rules: [{ kw: 'TANGO', cat: 'vervoer' }] }),
    minder_plan: '{}',
  };
}
async function boot(page, extra) {
  await pinDatum(page, '2026-10-23');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { if (!sessionStorage.getItem('v461')) { sessionStorage.setItem('v461', '1'); for (const k in d) localStorage.setItem(k, d[k]); } }, seed(extra));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof runControles === 'function');
}
const sync = (page) => page.evaluate(() => {
  psd2Api = async (pad) => { if (/\/balances/.test(pad)) return { balances: [{ balance_type: /u2/.test(pad) ? 'ITBD' : 'XPCD', balance_amount: { amount: /u2/.test(pad) ? '500' : '1000' } }] };
    return { transactions: [] }; };
  return psd2Refresh(true); });
const blokUit = (U) => U.filter((u) => u.blok).map((u) => `${u.id}|${u.status}|${u.soort}`).sort();

test.describe('1 · snelheid: duur per onderdeel, alleen de controles in de run, twee fasen', () => {
  test('a. blok 20 toont de duur van fase A en B, per stap, per onderdeel en per controle', async ({ page }) => {
    await boot(page); await sync(page);
    const r = await page.evaluate(() => { const R = SET.controles.run, U = SET.controles.uitkomst;
      return { faseA: typeof R.faseA, duur: typeof R.duur, stappen: R.stappen.map((x) => x.naam), secties: R.secties.filter((x) => x.blok === 20).map((x) => x.naam),
        zonderMs: U.filter((u) => u.ms == null).map((u) => u.id), L: diagSalarisVerdeling().join('\n') }; });
    expect(r.faseA).toBe('number'); expect(r.duur).toBe('number');
    expect(r.stappen).toEqual(expect.arrayContaining(['blok 20', 'blok 23', 'blok 24', 'blok 25', 'blok 26', 'soort 2: wijzigingen (blok 20)']));
    expect(r.secties).toEqual(expect.arrayContaining(['salarisData (de maanden van blok 20)', 'maandbudget', 'controle afgeronde maanden']));
    expect(r.zonderMs).toEqual(['contant-telling']);   // de historische regel rekent niets
    expect(r.L).toMatch(/DUUR \(v461\): fase A, voor het scherm \(soort 1\): \d+ ms · fase B, de run \(soort 2, na het scherm\): \d+ ms/);
    expect(r.L).toMatch(/stap blok 20: \d+ ms/);
    expect(r.L).toMatch(/blok 20 · maandbudget: \d+ ms/);
    expect(r.L).toMatch(/PER CONTROLE \(de duur van het onderdeel dat hem maakte\):\n    \d+ ms · /);
  });
  test('b. de run slaat de onderdelen zonder CONTROLE over; openen rekent ze wel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const n = { v419: 0, kennis: 0, benoem: 0 }; const o = { v419: diagV419Stand, kennis: kennisLijst, benoem: benoemMaand };
      diagV419Stand = (...a) => { n.v419++; return o.v419(...a); }; kennisLijst = (...a) => { n.kennis++; return o.kennis(...a); }; benoemMaand = (...a) => { n.benoem++; return o.benoem(...a); };
      runControles('sync'); const inRun = Object.assign({}, n); n.v419 = n.kennis = n.benoem = 0;
      const L = diagSalarisVerdeling(); return { inRun, open: Object.assign({}, n), heeft: /KENNIS \(v425/.test(L.join('\n')) }; });
    expect(r.inRun.v419).toBe(0); expect(r.inRun.benoem).toBe(0);
    expect(r.open.v419).toBe(1); expect(r.open.benoem).toBeGreaterThan(0); expect(r.heeft).toBe(true);
  });
  test('c. een bron: de controles uit de run zijn die van het volle blok (zelfde functies)', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { runControles('sync'); const run = SET.controles.uitkomst.filter((u) => u.blok && u.blok !== 26 && !/^(wijzigingen|gedeelde-ids)$/.test(u.id));
      const vol = []; for (const [n, f] of CONTROLE_BLOKKEN()) if (n !== 26) for (const u of controleRegelsVan(n, f())) vol.push(u);
      const k = (U) => U.map((u) => `${u.id}|${u.status}`).sort(); return { run: k(run), vol: k(vol) }; });
    expect(r.run.length).toBeGreaterThan(3);
    expect(r.run).toEqual(r.vol);
  });
  test('d. het run-geheugen verandert geen uitkomst (met en zonder dezelfde controles), ook met een wijziging deze maand', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { window._bwKeuze = 'door jou'; potPlanZet('boodschappen', thisYM(), 340); potPlanZet('zorg', thisYM(), 60); window._bwKeuze = undefined; save();
      const k = () => SET.controles.uitkomst.map((u) => `${u.id}|${u.status}|${(+u.bedrag || 0).toFixed(2)}`).sort().join(';');
      runControles('sync'); const met = k(), treffers = SET.controles.run.memo, g1 = JSON.stringify(SET.controles.getallen);
      const echt = runMemo; runMemo = (n, a, f) => f(); try { runControles('sync'); } finally { runMemo = echt; }
      return { met, zonder: k(), treffers, g1, g2: JSON.stringify(SET.controles.getallen), w: SET.controles.uitkomst.find((u) => u.id === 'wijzigingen') }; });
    expect(r.treffers).toBeGreaterThan(5);
    expect(r.met).toBe(r.zonder);
    expect(r.g1).toBe(r.g2);
    /* het geval dat een geheugen zonder stand zou missen: een simulatie (potSimuleer) in de run. Een vast potje zonder betaling telt met
       zijn hele budget, dus een wijziging deze maand verschuift de forecast; in de run en erbuiten hetzelfde effect */
    const e = await page.evaluate(() => { SET.potAard = Object.assign({}, SET.potAard, { zorg: 'vast' }); save();
      const rij = (E) => E.rijen.filter((x) => x.k === 'zorg').map((x) => x.effect);
      const buiten = rij(wijzForecastEffect()); window._ctrlRun = { memo: new Map(), stappen: [], secties: [] };
      let inRun; try { maandVooruit(); inRun = rij(wijzForecastEffect()); } finally { window._ctrlRun = null; } return { buiten, inRun }; });
    expect(e.buiten.length).toBe(1);
    expect(e.buiten[0]).not.toBe(0);
    expect(e.inRun).toEqual(e.buiten);
  });
  test('e. een sync tekent het scherm na fase A en draait de soort-2-controles daarna', async ({ page }) => {
    await boot(page);
    const log = await page.evaluate(async () => { const L = []; const r0 = render, rc = runControles;
      render = (...a) => { L.push('render'); return r0(...a); }; runControles = (...a) => { L.push('run:' + a[0]); return rc(...a); };
      psd2Api = async (pad) => (/\/balances/.test(pad) ? { balances: [{ balance_type: 'XPCD', balance_amount: { amount: '1000' } }] } : { transactions: [] });
      try { await psd2Refresh(true); } finally { render = r0; runControles = rc; } return L; });
    expect(log).toContain('run:sync');
    expect(log.indexOf('render')).toBeGreaterThanOrEqual(0);
    expect(log.indexOf('render')).toBeLessThan(log.indexOf('run:sync'));
    expect(await page.evaluate(() => typeof SET.controles.run.faseA)).toBe('number');
  });
  test('f. een antwoord: fase A direct (het zelf herstellen), fase B na het tekenen', async ({ page }) => {
    await boot(page);
    const k = await page.evaluate(() => String(TX.find((t) => t.date === '2026-08-05' && t.amount === -125).id));
    const voor = await page.evaluate((k) => { const b0 = SET.controles.run.bron; vorautAntw(k, 1); return { b0, timer: !!window._ctrlTimer, bron: SET.controles.run.bron }; }, k);
    expect(voor.timer).toBe(true); expect(voor.b0).toBe('versie'); expect(voor.bron).toBe('versie');   // fase B nog niet gedraaid
    await page.waitForFunction(() => !window._ctrlTimer && SET.controles.run.bron === 'antwoord');
  });
});

test.describe('2 · een maandsom-verschil dat precies een boeking is, is een kleine vraag', () => {
  const L = ['CONTROLE (afgeronde maanden): vast + potjes', '  apr: 100 + 50 = 150 tegen 143: VERSCHILT 7.00', '      het verschil bij naam (samen 0.00, rest zonder naam 7.00):', ''];
  test('g. Bolcom EUR 7 op 08-04: soort 3, kleine vraag, in Diagnose onder Kleine vragen; niet onder Wacht op de bouwer', async ({ page }) => {
    await boot(page, [['2026-04-08', -7, 'Bol.com Bv']]);
    const r = await page.evaluate((L) => { const U = controleRegelsVan(20, L), u = U[0];
      SET.controles.uitkomst = SET.controles.uitkomst.filter((x) => !/afgerond/.test(x.id)).concat([u]);
      const h = controleDiagHtml(), i = h.indexOf('Kleine vragen'), w = h.indexOf('Wacht op de bouwer'), g = h.indexOf('Gecorrigeerd');
      return { soort: u.soort, status: u.status, klein: u.klein, titel: u.titel, inKlein: h.slice(i, h.indexOf('>Klopt<')).includes('Bol'), inWacht: h.slice(w, g).includes('Bol') }; }, L);
    expect(r).toMatchObject({ soort: 3, status: 'vraag', klein: true, inKlein: true, inWacht: false });
    expect(r.titel).toMatch(/^maandsom apr: Bol\.com €\s?7 \(08-04\) in welke groep\?$/);
  });
  test('h. twee boekingen van hetzelfde bedrag, of geen: blijft wacht op de bouwer', async ({ page }) => {
    await boot(page, [['2026-04-08', -7, 'Bol.com Bv'], ['2026-04-12', -7, 'Hema']]);
    const r = await page.evaluate((L) => { const a = controleRegelsVan(20, L)[0]; const L2 = L.map((x) => x.replace(/7\.00/g, '13.00')); const b = controleRegelsVan(20, L2)[0];
      return [a.soort, a.status, b.soort, b.status]; }, L);
    expect(r).toEqual([2, 'wacht', 2, 'wacht']);
  });
});

test.describe('3 · een keuze over een potje hangt aan de forecast van dat potje', () => {
  test('i. een open controle op Zorg & apotheek laat een keuze over Vices niet wachten; wel een over Zorg en een over het geheel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const C = SET.controles;
      C.getallen = Object.assign({}, C.getallen, { onderBudget: 100, 'pot:vices': 20, 'pot:zorg': 30 });
      const w = (x) => { const g = kiesRaakt(x); return g ? keuzeWacht(g).wacht : false; };
      /* een open controle die het geheel 40 kan schelen en Zorg maar 2 (van 30, 7%): Zorg wacht niet, het geheel wel */
      C.uitkomst = C.uitkomst.filter((u) => u.status !== 'wacht').concat([{ id: 'wijzigingen', soort: 2, status: 'wacht', raakt: ['onderBudget', 'pot:zorg'], perGetal: { onderBudget: 40, 'pot:zorg': 2 }, bedrag: 40 }]);
      const zorgKlein = w({ bron: 'herzien', k: 'zorg' });
      C.uitkomst[C.uitkomst.length - 1].perGetal['pot:zorg'] = 40;
      return { zorgKlein, vices: w({ bron: 'herzien', k: 'vices' }), vicesLetop: w({ bron: 'letop', k: 'vices' }), zorg: w({ bron: 'herzien', k: 'zorg' }), geheel: w({ bron: 'patroon', k: null }),
        naam: keuzeWacht('pot:zorg').naam, raakt: kiesRaakt({ bron: 'patroon', k: 'vices' }) }; });
    expect(r).toMatchObject({ zorgKlein: false, vices: false, vicesLetop: false, zorg: true, geheel: true, raakt: 'pot:vices' });
    expect(r.naam).toMatch(/^de forecast van Zorg/);
  });
  test('j. de run legt de forecast per potje vast', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { runControles('sync'); const G = SET.controles.getallen;
      return { pot: Object.keys(G).filter((k) => /^pot:/.test(k)).sort(), vervoer: G['pot:vervoer'] }; });
    expect(r.pot).toEqual(expect.arrayContaining(['pot:boodschappen', 'pot:vervoer']));
    expect(typeof r.vervoer).toBe('number');
  });
});
