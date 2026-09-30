/* v280: een saldo dat niet is bijgewerkt telt mee, en dat staat nu bij het getal waarop je beslist.
 *
 * DE AANLEIDING, gemeten op het toestel op 28 sep 2026 00:06 met v279 erop: vijf van de zes gekoppelde
 * rekeningen gaven bij ELKE aanroep EXPIRED_SESSION terug, de zesde lukte. Samen 5.059 van de 6.226 in
 * `totalBalance()`, dus 81 procent van het saldo stond stil, en drie dingen zwegen:
 *  - `saldoAchterRegel()` (v198) gaf de LEGE STRING. Hij toetst `td>bd`, en omdat de transactie-aanroep
 *    net zo hard faalde stond de nieuwste boeking op dezelfde dag als het saldo. Nul treffers, precies
 *    in het geval waarvoor de regel bestaat;
 *  - `bankStand()` zei groen "Je bank is gekoppeld", want die las alleen `exp`, en die stond op
 *    2026-12-01 terwijl de bank de sessie al weigerde;
 *  - de melding stond op `authFail && !anyOk`, en die eist dat ELKE rekening faalt. Eén werkende bank
 *    verborg vijf kapotte rekeningen, vier syncs op een rij.
 *
 * WAT DEZE RONDE DOET: `psd2Falend()` is de ENE afleiding van welke gekoppelde rekening bij de laatste
 * sync geen saldo ophaalde, met vier lezers (bankStand, de melding, saldoAchter, blok 8).
 * `saldoAchter()` heeft daarmee een TWEEDE reden, `saldoAchterZinnen()` is de enige plek waar de tekst
 * staat, en die tekst staat nu op twee oppervlakken: de opbouw-sheet (waar hij al stond) en de hero op
 * Home, bij het herogetal, het totale saldo en het bedrag per dag.
 *
 * WAT DE FIXTURE DRAAGT. `deviceSeed()` is de toestand van het toestel: twaalf rekeningen met hun
 * bedragen (4000, 114, 768, 500, 445 en zeven op nul), vijf die falen met EXPIRED_SESSION, en bij alle
 * vijf een saldodatum die GELIJK is aan de nieuwste boeking erop - dat laatste is het hele punt.
 * DE DATUMS STAAN ALS AFSTAND en niet als datum (v248/v252): een `exp` van 2026-12-01 ligt na 1 dec 2026
 * in het verleden en dan toetst deze spec `verlopen` in plaats van `stuk`. De BEDRAGEN zijn wel die van
 * het toestel, want daar verwijst de spec naar.
 * `vormSeed()` is GECONSTRUEERD en niet gemeten, en dat staat erbij omdat het anders als toestand leest:
 * een rekening waarvan de balances-aanroep LUKTE maar een lege lijst gaf (geen fouttekst, dus de
 * discriminator moet `balGeland` zijn), een entry ZONDER `balGeland` (de vorm van vóór v279, een
 * ontbrekende meting en geen mislukking), een ONTKOPPELDE rekening met een oude entry, en twee
 * verschillende saldodata zodat de regel de OUDSTE moet noemen.
 */
const { test, expect } = require('@playwright/test');
const { kaalBron, kaalUit } = require('./bron-kaal');

const d0 = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dagenTerug = (n) => { const d = new Date(d0); d.setDate(d.getDate() - n); return ymd(d); };
const maandenVooruit = (n) => { const d = new Date(d0); d.setMonth(d.getMonth() + n); return ymd(d); };

/* de twaalf rekeningen van het toestel, met hun bedragen en hun bron.
   `fout:true` = de vijf die EXPIRED_SESSION gaven, en hun saldodatum is GELIJK aan hun nieuwste boeking. */
const STAAT = dagenTerug(3);
const REK = [
  { a: '100110012859441123', bal: 4000, bd: STAAT, tx: STAAT, src: 'psd2', bank: 'N26', fout: true },
  { a: '100110012555096222', bal: 114, bd: STAAT, tx: STAAT, src: 'psd2', bank: 'N26', fout: true },
  { a: '521200806', bal: 768, bd: ymd(d0), tx: ymd(d0), src: 'psd2', bank: 'ABN AMRO', fout: false },
  { a: '636222403', bal: 0, bd: dagenTerug(153), tx: dagenTerug(153), src: 'mt940', bank: 'ABN AMRO', fout: null },
  { a: 'N26 Main', bal: null, bd: null, tx: dagenTerug(113), src: 'csv', bank: 'N26', fout: null },
  { a: '100110012252714323', bal: 0, bd: STAAT, tx: STAAT, src: 'psd2', bank: 'N26', fout: true },
  { a: 'N26 Buffer Rust', bal: null, bd: null, tx: dagenTerug(113), src: 'csv', bank: 'N26', fout: null },
  { a: 'psd2_874633c7', bal: 0, bd: dagenTerug(81), tx: dagenTerug(130), src: 'psd2', bank: 'ABN AMRO', fout: null },
  { a: 'N26 Buffer Comfort', bal: null, bd: null, tx: dagenTerug(130), src: 'csv', bank: 'N26', fout: null },
  { a: 'psd2_94a07621', bal: 500, bd: STAAT, tx: dagenTerug(4), src: 'psd2', bank: 'N26', fout: true },
  { a: '100110012848184840', bal: 445, bd: STAAT, tx: STAAT, src: 'psd2', bank: 'N26', fout: true },
  { a: 'N26 Zakgeld', bal: null, bd: null, tx: dagenTerug(104), src: 'csv', bank: 'N26', fout: null },
];
const FALEND = REK.filter((r) => r.fout === true).map((r) => r.a);
const STIL_SOM = REK.filter((r) => r.fout === true).reduce((x, r) => x + (r.bal || 0), 0);   // 5059 op het toestel

function deviceSeed() {
  const tx = [];
  let n = 0;
  for (const r of REK) {
    tx.push({ id: 'x' + (n++), date: r.tx, amount: -25, acc: r.a, src: r.src, name: 'Albert Heijn',
      desc: 'Albert Heijn PMNT', typ: '', ref: '', accName: '', refNums: [] });
    /* de TWEEDE boeking ligt VOOR de nieuwste: op het toestel is de nieuwste boeking per rekening
       precies r.tx, en een seed die daar voorbij gaat laat saldoAchter() vuren op de import-reden bij
       een rekening die op het toestel gelijk staat. Dan meet de test zijn eigen seed. */
    const e = new Date(r.tx); e.setDate(e.getDate() - 30);
    tx.push({ id: 'x' + (n++), date: ymd(e), amount: 2500, acc: r.a, src: r.src, name: 'Loonstrook',
      desc: 'SALARIS', typ: '', ref: '', accName: '', refNums: [] });
  }
  const ps = {}, diag = {}, meta = {};
  for (const r of REK) {
    if (r.fout !== null) {
      ps[r.a] = { uid: 'uid-' + r.a, iban: r.a.replace(/\D/g, ''), hash: '', label: r.a, bank: r.bank,
        exp: r.bank === 'N26' ? maandenVooruit(2) : maandenVooruit(1) };
      diag[r.a] = r.fout
        ? { op: ymd(d0), txN: 0, txPag: 0, txFout: 'EXPIRED_SESSION', balUit: null, balGeland: false,
            balFout: 'EXPIRED_SESSION', balLijst: null, balTypes: '', balGekozen: '', balRuw: '', balReden: '' }
        : { op: ymd(d0), txN: 92, txPag: 2, txFout: '', balUit: 768, balGeland: true, balFout: '',
            balLijst: 1, balTypes: 'ITBD', balGekozen: 'ITBD', balRuw: '768.00', balReden: '' };
    }
    meta[r.a] = r.bal != null ? { balance: r.bal, date: r.bd || '', bank: r.bank } : { balance: 0, bank: r.bank };
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_own: JSON.stringify(REK.map((r) => r.a)),
    minder_accmeta: JSON.stringify(meta),
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 5216, toonLegeRek: true,
      manualBal: {}, budgets: { boodschappen: 500, overig: 400 },
      psd2Accounts: ps, psd2Diag: diag, psd2LastSync: Date.now(), nfToegewezen: 4000, nfDoelVast: 4000 }),
    minder_plan: '{}',
  };
}

/* GECONSTRUEERD, niet gemeten. Vier vormen die op het toestel niet voorkomen en die de code wel moet
   kunnen scheiden. */
const V_LEEG = 'psd2_leeg0001';     // balances-aanroep LUKTE, lege lijst, dus geen fouttekst
const V_HALF = 'psd2_half0001';     // entry zonder balGeland: de vorm van vóór v279
const V_WEG = 'psd2_weg00001';      // entry aanwezig, rekening NIET meer gekoppeld
const V_OUD = 'psd2_oud00001';      // faalt, met een OUDERE saldodatum dan V_LEEG
function vormSeed() {
  const rek = [V_LEEG, V_HALF, V_WEG, V_OUD];
  const tx = rek.map((a, i) => ({ id: 'v' + i, date: dagenTerug(2), amount: -30, acc: a, src: 'psd2',
    name: 'Etos', desc: 'Etos PMNT', typ: '', ref: '', accName: '', refNums: [] }));
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_own: JSON.stringify(rek),
    minder_accmeta: JSON.stringify({
      [V_LEEG]: { balance: 200, date: dagenTerug(2), bank: 'N26' },
      [V_HALF]: { balance: 300, date: dagenTerug(2), bank: 'N26' },
      [V_WEG]: { balance: 400, date: dagenTerug(2), bank: 'N26' },
      [V_OUD]: { balance: 500, date: dagenTerug(20), bank: 'N26' },
    }),
    minder_set: JSON.stringify({ limit: 70, autoIncome: false, income: 3000, toonLegeRek: true, manualBal: {},
      psd2Accounts: {
        [V_LEEG]: { uid: 'u1', iban: '1111', label: 'Leeg', bank: 'N26', exp: maandenVooruit(2) },
        [V_HALF]: { uid: 'u2', iban: '2222', label: 'Half', bank: 'N26', exp: maandenVooruit(2) },
        [V_OUD]: { uid: 'u4', iban: '4444', label: 'Oud', bank: 'N26', exp: maandenVooruit(2) },
      },
      psd2Diag: {
        [V_LEEG]: { op: ymd(d0), txN: 4, txPag: 1, txFout: '', balUit: null, balGeland: false, balFout: '',
          balLijst: 0, balTypes: '', balGekozen: '', balRuw: '', balReden: 'de balances-lijst is leeg' },
        [V_HALF]: { op: ymd(d0), txN: 4, txPag: 1 },
        [V_WEG]: { op: ymd(d0), txN: 0, txPag: 0, txFout: 'EXPIRED_SESSION', balGeland: false, balFout: 'EXPIRED_SESSION' },
        [V_OUD]: { op: ymd(d0), txN: 0, txPag: 0, txFout: 'EXPIRED_SESSION', balUit: null, balGeland: false,
          balFout: 'EXPIRED_SESSION', balLijst: null, balTypes: '', balGekozen: '', balRuw: '', balReden: '' },
      },
      psd2LastSync: Date.now() }),
    minder_plan: '{}',
  };
}

async function boot(page, seed, w) {
  await page.setViewportSize({ width: w || 390, height: 844 });
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof psd2Falend === 'function' && typeof saldoAchterZinnen === 'function');
}
const zin = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = saldoAchterRegel(); return d.innerText.trim();
});

test.describe('0 · de fixture draagt wat de comment belooft', () => {
  test('bij de vijf falende rekeningen is de saldodatum GELIJK aan de nieuwste boeking', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate((f) => f.map((a) => ({ a, bd: accBalanceDatum(a), td: nieuwsteTxDatum(a) })), FALEND);
    for (const x of r) expect(x.td <= x.bd, x.a + ' moet gelijk of ouder zijn, anders vuurt de oude reden al').toBe(true);
  });

  test('de oude poort td>bd geeft op deze toestand NUL treffers', async ({ page }) => {
    await boot(page, deviceSeed());
    /* DIT IS DE MEETSTAP UIT DE MEETLESSEN: zonder deze test kan de sync-reden weg zonder dat er iets
       rood wordt, want dan neemt de import-reden hem stilzwijgend over. Hier staat dat de oude poort
       deze twaalf rekeningen niet raakt, gerekend zonder de code die getoetst wordt. */
    const n = await page.evaluate(() => (OWN || []).filter((a) => {
      if (accBalance(a) == null) return false;
      const bd = accBalanceDatum(a); if (!bd) return false;
      const td = nieuwsteTxDatum(a); if (!td) return false;
      return td > bd;
    }).length);
    expect(n).toBe(0);
  });

  test('de koppeling is niet over datum, dus het gaat om de mislukking en niet om exp', async ({ page }) => {
    await boot(page, deviceSeed());
    const B = await page.evaluate(() => bankStand());
    expect(B.verlopen).toBe(false);
    expect(B.n).toBe(6);
  });

  test('de som van de stille saldi is die van het toestel', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => {
      const f = psd2Falend().map((x) => x.acc);
      return { n: f.length, som: Math.round(f.reduce((x, a) => x + (+accBalance(a) || 0), 0)) };
    });
    expect(r.n).toBe(5);
    expect(r.som).toBe(STIL_SOM);        // 5059
  });
});

test.describe('1 · psd2Falend is de ene afleiding', () => {
  test('hij noemt precies de vijf rekeningen die geen saldo ophaalden', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => psd2Falend().map((f) => f.acc).sort());
    expect(r).toEqual([...FALEND].sort());
  });

  test('een lege balances-lijst telt mee, ook zonder fouttekst', async ({ page }) => {
    await boot(page, vormSeed());
    /* DE DISCRIMINATOR IS balGeland EN NIET DE FOUTTEKST. Deze rekening gaf 4 regels terug en de
       balances-aanroep GOOIDE niet: hij kwam terug met een lege lijst. Het saldo staat net zo stil. */
    const r = await page.evaluate((a) => {
      const f = psd2Falend().find((x) => x.acc === a);
      return { erin: !!f, fout: f ? f.fout : null, balFout: (SET.psd2Diag[a] || {}).balFout };
    }, V_LEEG);
    expect(r.erin).toBe(true);
    expect(r.balFout).toBe('');
    expect(r.fout).toContain('lijst is leeg');     // de reden komt uit de bron, niet uit het blok
  });

  test('een entry zonder balGeland is een ontbrekende meting en geen mislukking', async ({ page }) => {
    await boot(page, vormSeed());
    const r = await page.evaluate((a) => psd2Falend().some((x) => x.acc === a), V_HALF);
    expect(r).toBe(false);
  });

  test('een ontkoppelde rekening met een oude entry telt niet mee', async ({ page }) => {
    await boot(page, vormSeed());
    const r = await page.evaluate((a) => ({
      inDiag: !!(SET.psd2Diag || {})[a], gekoppeld: !!(SET.psd2Accounts || {})[a],
      erin: psd2Falend().some((x) => x.acc === a) }), V_WEG);
    expect(r.inDiag).toBe(true);        // de entry bestaat wel
    expect(r.gekoppeld).toBe(false);
    expect(r.erin).toBe(false);
  });
});

test.describe('2 · bankStand leest de mislukking, niet alleen exp', () => {
  test('amber en een sub die de rekeningen telt', async ({ page }) => {
    await boot(page, deviceSeed());
    const B = await page.evaluate(() => bankStand());
    expect(B.stuk).toBe(true);
    expect(B.col).toBe('var(--amber)');
    expect(B.sub).toBe('5 rekeningen halen geen saldo op');
    expect(B.falend.length).toBe(5);
  });

  test('één falende rekening staat in het enkelvoud', async ({ page }) => {
    await boot(page, vormSeed());
    const B = await page.evaluate(() => {
      // alleen de lege-lijst-rekening laten falen
      SET.psd2Diag[psd2Falend()[1] ? psd2Falend()[1].acc : 'x'] = { op: '2026-01-01', balGeland: true };
      return bankStand();
    });
    expect(B.falend.length).toBe(1);
    expect(B.sub).toBe('1 rekening haalt geen saldo op');
  });

  test('zonder mislukking is hij groen', async ({ page }) => {
    await boot(page, deviceSeed());
    const B = await page.evaluate(() => {
      for (const a of Object.keys(SET.psd2Diag)) SET.psd2Diag[a].balGeland = true;
      return bankStand();
    });
    expect(B.stuk).toBe(false);
    expect(B.col).toBe('');
    expect(B.sub).toBe('Je bank is gekoppeld');
  });

  test('een verlopen consent gaat voor: dan is opnieuw inloggen de handeling', async ({ page }) => {
    await boot(page, deviceSeed());
    const B = await page.evaluate(() => {
      for (const a of Object.keys(SET.psd2Accounts)) SET.psd2Accounts[a].exp = '2020-01-01';
      return bankStand();
    });
    expect(B.verlopen).toBe(true);
    expect(B.stuk).toBe(false);
    expect(B.sub).toBe('Verbinding verlopen');
  });

  test('de rij in Instellingen draagt die kleur en die sub', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => { go('set'); const t = document.getElementById('s-set').innerText;
      return { t, amber: document.getElementById('s-set').innerHTML.indexOf('var(--amber)') >= 0 }; });
    expect(r.t).toMatch(/5 rekeningen halen geen saldo op/);
    expect(r.amber).toBe(true);
  });

  test('het bankscherm noemt de rekeningen bij naam en biedt opnieuw verbinden als eerste', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => {
      const d = document.createElement('div'); d.innerHTML = setBank();   // setBank() geeft HTML terug
      const btn = [...d.querySelectorAll('button')].map((b) => b.textContent.trim());
      return { t: d.textContent, btn }; });
    for (const a of FALEND) {
      const naam = await page.evaluate((x) => acctNiceName(x), a);
      expect(r.t, 'de naam van ' + a + ' hoort erbij te staan').toContain(naam);
    }
    expect(r.t).toMatch(/EXPIRED_SESSION/);
    expect(r.btn[0]).toMatch(/Opnieuw verbinden/);
  });
});

test.describe('3 · de melding vuurt per falende rekening', () => {
  test('de zin noemt de namen, in het enkelvoud en het meervoud', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => ({
      vijf: psd2FalendZin(psd2Falend()),
      een: psd2FalendZin([psd2Falend()[0]]),
      geen: psd2FalendZin([]) }));
    expect(r.vijf).toMatch(/ en /);
    expect(r.vijf).toMatch(/halen geen saldo op$/);
    expect(r.een).toMatch(/haalt geen saldo op$/);
    expect(r.een).not.toMatch(/ en /);
    expect(r.geen).toBe('');
  });

  test('één toast, met de mislukking én wat er wel binnenkwam', async ({ page }) => {
    await boot(page, deviceSeed());
    /* DE POORT WAS authFail && !anyOk, en dat is precies het geval hier: vijf rekeningen falen en
       de zesde lukt, dus de oude poort zweeg. */
    const r = await page.evaluate(() => { psd2SyncToast('7 nieuwe transacties');
      return document.getElementById('toast').innerText; });
    expect(r).toMatch(/halen geen saldo op/);
    expect(r).toMatch(/7 nieuwe transacties/);
  });

  test('zonder mislukking blijft de toast zoals hij was', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => {
      for (const a of Object.keys(SET.psd2Diag)) SET.psd2Diag[a].balGeland = true;
      psd2SyncToast('7 nieuwe transacties');
      return document.getElementById('toast').innerText; });
    expect(r.trim()).toBe('7 nieuwe transacties');
  });

  test('beide sync-routes lezen dezelfde melding, en niemand formuleert er een tweede', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = { ref: await kaalUit(page, 'psd2Refresh'), ing: await kaalUit(page, 'psd2IngestSession') };
    expect(r.ref).toContain('psd2SyncToast(');
    expect(r.ing).toContain('psd2SyncToast(');
    // en het predicaat staat op precies één plek
    const bron = await page.evaluate(() => falendPredikaat.toString());
    expect(bron).toMatch(/geen saldo op/);
    /* HET PREDICAAT STAAT OP ÉÉN PLEK. Deze test viel toen bankStand() en setBank() het zelf
       opschreven, en dat is de reden dat falendPredikaat() bestaat. Drie plekken zeggen dit over
       dezelfde toestand met een ander onderwerp ervoor; de bewering erachter is er één. */
    for (const k of ['psd2Refresh', 'psd2IngestSession', 'bankStand', 'setBank', 'psd2FalendZin']) {
      const src = await kaalUit(page, k);
      expect(src, k + ' mag het predicaat niet zelf opschrijven').not.toMatch(/geen saldo op/);
    }
    const pred = await page.evaluate(() => [falendPredikaat(1), falendPredikaat(2)]);
    expect(pred[0]).toBe(' haalt geen saldo op');
    expect(pred[1]).toBe(' halen geen saldo op');
  });
});

test.describe('4 · de regel bij het saldo, met twee redenen', () => {
  test('hij vuurt waar de oude poort nul gaf', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => ({ n: saldoAchter().length, redenen: saldoAchter().map((x) => x.reden) }));
    expect(r.n).toBe(5);
    expect(r.redenen.every((x) => x === 'sync')).toBe(true);
    expect(await zin(page)).toMatch(/Bij 5 rekeningen is het saldo van .* en niet bijgewerkt bij de laatste synchronisatie\./);
  });

  test('de sync-tekst zegt niet dat er iets tussenin zit, want dat is er niet', async ({ page }) => {
    await boot(page, deviceSeed());
    const t = await zin(page);
    expect(t).not.toMatch(/nieuwste boeking erop/);
    expect(t).not.toMatch(/tussenin/);
  });

  test('de sync-reden wint van de import-reden op dezelfde rekening', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate((a) => {
      /* v199: toISOString() geeft de UTC-dag, en onder CEST is dat rond middernacht de dag ervoor.
         De datums in TX zijn lokale kalenderdagen, dus deze ook - anders toetst deze test bij een
         andere klok een ander geval. */
      const m = new Date(); m.setDate(m.getDate() + 1);
      TX.push({ id: 'later', date: ymdVan(m), amount: -9,
        acc: a, src: 'mt940', name: 'Later', desc: 'Later', refNums: [] });
      const rij = saldoAchter().filter((x) => x.acc === a);
      return { n: rij.length, reden: rij[0] && rij[0].reden, totaal: saldoAchter().length };
    }, FALEND[0]);
    expect(r.n).toBe(1);               // één keer genoemd, niet twee
    expect(r.reden).toBe('sync');
    expect(r.totaal).toBe(5);
  });

  test('beide redenen naast elkaar geven twee zinnen', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => {
      // een rekening die NIET faalt en wel een nieuwere boeking dan zijn saldo heeft
      const m = new Date(); m.setDate(m.getDate() + 1);   // lokale dag, niet toISOString (v199)
      TX.push({ id: 'na', date: ymdVan(m), amount: -9,
        acc: '521200806', src: 'mt940', name: 'Later', desc: 'Later', refNums: [] });
      return { zinnen: saldoAchterZinnen().length, redenen: saldoAchter().map((x) => x.reden) };
    });
    expect(r.zinnen).toBe(2);
    expect(r.redenen).toContain('sync');
    expect(r.redenen).toContain('import');
  });

  test('bij verschillende saldodata noemt hij de oudste en niet een willekeurige', async ({ page }) => {
    await boot(page, vormSeed());
    const r = await page.evaluate(() => {
      const dagen = psd2Falend().map((f) => accBalanceDatum(f.acc)).sort();
      return { n: psd2Falend().length, dagen, zin: saldoAchterZinnen().join(' ') };
    });
    expect(r.n).toBe(2);
    expect(r.dagen[0]).not.toBe(r.dagen[1]);
    expect(r.zin).toMatch(/het oudste van/);
    const oudste = await page.evaluate((d) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }), r.dagen[0]);
    expect(r.zin).toContain(oudste);
    const jongste = await page.evaluate((d) => new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }), r.dagen[1]);
    expect(r.zin).not.toContain(jongste);
  });

  test('bij één rekening staat de naam erin', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate((f) => {
      for (const a of f.slice(1)) SET.psd2Diag[a].balGeland = true;
      return { zin: saldoAchterZinnen().join(' '), naam: acctNiceName(f[0]) };
    }, FALEND);
    expect(r.zin).toContain(r.naam);
    expect(r.zin).toMatch(/^Het saldo van /);
  });
});

test.describe('5 · de regel staat in de hero, bij de getallen waarop je beslist', () => {
  for (const w of [360, 390]) {
    test('op ' + w + 'px staat hij in de hero, onder het totale saldo', async ({ page }) => {
      await boot(page, deviceSeed(), w);
      const r = await page.evaluate(() => {
        go('dash');
        const hero = document.querySelector('.homehero');
        const kids = [...hero.children].map((x) => (x.innerText || '').trim());
        const i = kids.findIndex((x) => /niet bijgewerkt bij de laatste synchronisatie/.test(x));
        const j = kids.findIndex((x) => /^totaal saldo/.test(x));
        const k = kids.findIndex((x) => /per dag\.|ruimte voor deze maand is op/.test(x));
        return { i, j, k, h: Math.round(hero.getBoundingClientRect().height), kaders: hero.querySelectorAll('.card').length };
      });
      expect(r.i).toBeGreaterThan(-1);
      expect(r.i).toBe(r.j + 1);               // direct onder het saldo dat hij kwalificeert
      if (r.k > -1) expect(r.k).toBeGreaterThan(r.i);
      expect(r.kaders).toBe(0);                // geen eigen kaart erbij
      expect(r.h).toBeLessThanOrEqual(200);    // gemeten 188px op beide breedtes
    });
  }

  test('zonder mislukking staat er niets extra in de hero', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => {
      for (const a of Object.keys(SET.psd2Diag)) SET.psd2Diag[a].balGeland = true;
      renderDash();
      const hero = document.querySelector('.homehero');
      return { t: hero.innerText, h: Math.round(hero.getBoundingClientRect().height) };
    });
    expect(r.t).not.toMatch(/niet bijgewerkt/);
    expect(r.h).toBeLessThan(160);             // gemeten 147px zonder de regel
  });

  test('bij een onbekend saldo staat hij er niet: dan draagt de hero al een eigen reden', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => {
      for (const a of Object.keys(ACCMETA)) delete ACCMETA[a].balance;
      renderDash();
      return document.querySelector('.homehero').innerText;
    });
    expect(r).toMatch(/onbekend/);
    expect(r).not.toMatch(/niet bijgewerkt bij de laatste synchronisatie/);
  });
});

test.describe('6 · herstel: een geslaagde sync haalt de rekening eruit', () => {
  test('per herstelde rekening verdwijnt hij, en bij de laatste verdwijnt de regel', async ({ page }) => {
    await boot(page, deviceSeed());
    /* HIJ LOOPT DOOR DE ECHTE SCHRIJVER, psd2DiagZet(), en niet door een zet in SET: dat is de
       meetles van v279 (g). Een test die de teller zelf wegschrijft raakt de schrijver niet, en dan
       blijft de sabotage op het overschrijven groen. */
    const stap = async (acc) => page.evaluate((a) => {
      psd2DiagZet(a, { txN: 12, txPag: 1, txFout: '', balUit: 100, balGeland: true, balFout: '',
        balLijst: 1, balTypes: 'ITBD', balGekozen: 'ITBD', balRuw: '100.00', balReden: '' });
      renderDash();
      const B = bankStand();
      return { falend: psd2Falend().map((x) => x.acc), achter: saldoAchter().length,
        zin: saldoAchterZinnen().join(' '), col: B.col, sub: B.sub,
        hero: document.querySelector('.homehero').innerText };
    }, acc);

    let r = await page.evaluate(() => ({ falend: psd2Falend().length, col: bankStand().col }));
    expect(r.falend).toBe(5);
    expect(r.col).toBe('var(--amber)');

    for (let i = 0; i < FALEND.length; i++) {
      const s = await stap(FALEND[i]);
      const over = FALEND.length - 1 - i;
      expect(s.falend, 'na het herstellen van ' + FALEND[i]).toHaveLength(over);
      expect(s.falend).not.toContain(FALEND[i]);
      expect(s.achter).toBe(over);
      if (over > 0) {
        expect(s.zin).toMatch(/niet bijgewerkt bij de laatste synchronisatie/);
        expect(s.hero).toMatch(/niet bijgewerkt/);
        expect(s.col).toBe('var(--amber)');
        // de naam van een herstelde rekening staat er niet meer in
        const naam = await page.evaluate((a) => acctNiceName(a), FALEND[i]);
        if (over === 1) expect(s.zin).not.toContain(naam);
      } else {
        expect(s.zin).toBe('');
        expect(s.hero).not.toMatch(/niet bijgewerkt/);
        expect(s.col).toBe('');
        expect(s.sub).toBe('Je bank is gekoppeld');
      }
    }
  });

  /* HERSCHREVEN BIJ v298, EN DE OUDE TITEL WAS HET DEFECT EN NIET DE EIGENSCHAP. Hij heette "een entry
     wordt overschreven en niet aangevuld", en dat is precies wat v298 heeft omgedraaid: `psd2DiagZet()`
     mergt nu per veld, want anders wist een route met minder velden stil wat een andere route mat. De
     assertie bleef groen (deze route schrijft alle saldo-velden, dus de waarden komen hetzelfde uit),
     maar de titel zou een volgende ronde de verkeerde kant op sturen. WAT HIJ MOET VASTHOUDEN is de
     eigenschap: wat de route WEL meet wordt bijgewerkt, een gewiste fout blijft gewist, en wat hij NIET
     meet blijft staan met zijn eigen stempel. Die laatste helft is nieuw en is de reden dat hij sterker
     is dan de test die hij vervangt. */
  test('wat een route meet wordt bijgewerkt, en wat hij niet meet blijft staan', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate((a) => {
      psd2DiagZet(a, { txN: 12, txPag: 1, txFout: '', balUit: 100, balGeland: true, balFout: '',
        balLijst: 1, balTypes: 'ITBD', balGekozen: 'ITBD', balRuw: '100.00', balReden: '' });
      const d = SET.psd2Diag[a];
      const gemeten = { balGeland: d.balGeland, balFout: d.balFout, txFout: d.txFout,
        erin: psd2Falend().some((x) => x.acc === a) };
      /* Een tweede route die alleen de pending-aanroep vastlegt: de saldo-velden moeten blijven staan,
         en ze moeten zeggen dat ze van een EERDERE schrijver zijn. */
      psd2DiagZet(a, { pendN: 0, pendMap: 0, pendFout: '', pendGeland: true });
      const na = SET.psd2Diag[a];
      return Object.assign(gemeten, { blijft: na.balTypes, txBlijft: na.txN,
        saldoVers: psd2DiagVers(na, 'balGeland'), pendVers: psd2DiagVers(na, 'pendN') });
    }, FALEND[0]);
    expect(r.balGeland).toBe(true);
    expect(r.balFout).toBe('');          // de oude EXPIRED_SESSION is weg, niet bewaard
    expect(r.txFout).toBe('');
    expect(r.erin).toBe(false);
    expect(r.blijft, 'de tweede route meet het saldo niet en wist het dus niet').toBe('ITBD');
    expect(r.txBlijft).toBe(12);
    expect(r.saldoVers, 'maar het is niet meer van de laatste sync, en dat staat erbij').toBe(false);
    expect(r.pendVers).toBe(true);
  });

  test('en de melding zwijgt weer zodra alles lukt', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate((f) => {
      for (const a of f) psd2DiagZet(a, { txN: 1, txPag: 1, txFout: '', balUit: 1, balGeland: true,
        balFout: '', balLijst: 1, balTypes: 'ITBD', balGekozen: 'ITBD', balRuw: '1', balReden: '' });
      psd2SyncToast('7 nieuwe transacties');
      return document.getElementById('toast').innerText;
    }, FALEND);
    expect(r.trim()).toBe('7 nieuwe transacties');
  });
});

test.describe('7 · het diagnosescherm leest en verzint niets', () => {
  test('blok 8 leest psd2Falend en leidt de lijst niet zelf af', async ({ page }) => {
    await boot(page, deviceSeed());
    const src = await page.evaluate(() => {
      const b = DIAG_BLOKKEN.find((x) => /rekeningen en de bankverbindingen/.test(x.titel));
      return b.lees.toString();
    });
    expect(src).toContain('psd2Falend()');
    expect(src, 'geen tweede filter op balGeland naast psd2Falend()').not.toMatch(/filter\([^)]*balGeland/);
  });

  test('blok 8 noemt de contant-term, zodat de som narekenbaar is', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => {
      const b = DIAG_BLOKKEN.find((x) => /rekeningen en de bankverbindingen/.test(x.titel));
      const L = b.lees();
      return L.find((x) => /^totalBalance\(\)/.test(x)) || '';
    });
    expect(r).toMatch(/contant/);
  });

  test('de som en de contant-term sluiten aan op de rekeningen', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => {
      const perRek = (OWN || []).reduce((x, a) => x + (+accBalance(a) || 0), 0);
      const tb = totalBalance();
      return { perRek: Math.round(perRek), som: Math.round(tb.sum), contant: tb.contant };
    });
    expect(r.contant).toBe(null);            // nooit geteld in deze fixture
    expect(r.som).toBe(r.perRek);            // en dan is de som precies de rekeningen
  });

  test('een negatief aandeel wordt benoemd als terugstorting', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => {
      /* DE SOM MOET POSITIEF BLIJVEN, anders slaat het blok de rij over (`if(B.som>0)`) en toetst deze
         test niets. Drie dagen met een uitgave, en op de vierde dag een terugstorting die groter is dan
         wat er die dag uitging: die ENE dag wordt netto negatief en de maand blijft positief. */
      const dag = (n) => { const d = new Date(); d.setDate(n); return ymdVan(d); };
      /* DE NAAM MOET EEN KEYWORD-REGEL RAKEN. Een bijschrijving zonder regel landt in een
         INKOMEN-categorie en valt dus buiten de snede van het blok, en dan is er niets negatiefs te
         zien: gemeten gaf een naam zonder regel `vr 8%` in plaats van `vr -20%`. Op het toestel was de
         terugstorting juist een winkelnaam, en dat is precies waarom die -7% daar ontstond.
         EN DE NAAM MOET UNIEK ZIJN IN DEZE FIXTURE: met 'Albert Heijn' staat hij op twaalf rekeningen in
         vijf maanden, en dan ziet de herhalingsdetectie hem als vaste post en valt de hele reeks buiten
         de snede (isFixed). Gemeten: nul negatieve rijen met die naam, en de bedoelde -20% met 'Jumbo'. */
      const zet = (n, amount, id) => TX.push({ id, date: dag(n), amount, acc: '521200806', src: 'psd2',
        name: 'Jumbo', desc: 'Jumbo PMNT', typ: '', ref: '', accName: '', refNums: [] });
      zet(1, -200, 'z1'); zet(2, -200, 'z2'); zet(3, -200, 'z3');
      /* DE TERUGSTORTING MOET DE WEEKDAG DRAGEN, niet alleen de dag. GEMETEN: met 150 viel de vierde
         dag op dezelfde weekdag als vijf andere boekingen uit de fixture en werd hij netto POSITIEF
         (`vr 0%`), dus de test bewees niets. Vier ligt vast op weekdag, niet op dagnummer, en de
         andere boekingen dragen samen hoogstens 125, dus 400 maakt die weekdag onmiskenbaar negatief. */
      zet(4, -50, 'z4'); zet(4, 400, 'z5');
      TX.forEach(categorize);
      const L = diagDubbel();
      return { neg: L.filter((x) => /\s-\d+%/.test(x)), alle: L.filter((x) => /op t\.date:/.test(x)) };
    });
    expect(r.alle.length, 'het blok moet rijen met aandelen opleveren').toBeGreaterThan(0);
    const rr = r.neg;
    expect(rr.length, 'de fixture moet werkelijk een negatief aandeel opleveren').toBeGreaterThan(0);
    for (const rij of rr) expect(rij).toMatch(/negatief aandeel is een terugstorting/);
  });

  test('een rij zonder negatief aandeel krijgt die opmerking niet', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(() => diagDubbel().filter((x) => /terugstorting/.test(x)));
    expect(r.length).toBe(0);
  });
});

test.describe('8 · kijken verandert niets (v244)', () => {
  test('geen enkel blok schrijft, en de regel leest alleen', async ({ page }) => {
    await boot(page, deviceSeed());
    const r = await page.evaluate(async () => {
      const schrijvers = [];
      const echt = localStorage.setItem.bind(localStorage);
      localStorage.setItem = (k, v) => { schrijvers.push(k); return echt(k, v); };
      try {
        for (const b of DIAG_BLOKKEN) { const L = b.lees(); if (L && L.then) await L; }
        saldoAchter(); saldoAchterZinnen(); saldoAchterRegel(); saldoAchterHero(); psd2Falend(); bankStand();
      } finally { localStorage.setItem = echt; }
      return schrijvers;
    });
    expect(r).toEqual([]);
  });
});
