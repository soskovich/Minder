/* v279: drie metingen per rekening, en alle drie alleen lezen.
 *
 * DE AANLEIDING is de uitvoer van het toestel van 27 sep 2026, na de sync die v277 moest beoordelen:
 * 184 psd2-regels langs `commitTx()` en NUL met een `value_date`, maar de teller was GLOBAAL, dus of de
 * bank waar het om gaat erbij zat was niet te zien. In dezelfde uitvoer stond de saldostempel van de ene
 * bank op vandaag en die van vijf rekeningen van de andere op twee dagen eerder, terwijl de sync van dat
 * moment draaide. Er was dus een rekening waarvan de balances-aanroep niets oplevert, en een ruwe
 * schatting zei dat er ook een rekening was die geen transacties teruggaf. Geen van die drie dingen was
 * uit de uitvoer te halen.
 *
 * WAT DEZE RONDE DOET, en het is alleen diagnose: er verandert geen cijfer in de app. `pickBalance()`
 * meldt op verzoek wat hij zag (de vorm van `betaalMoment(t, metReden)`), de twee sync-routes leggen per
 * rekening vast wat de twee aanroepen deden, `commitTx()` telt per rekening, en het diagnosescherm leest
 * dat terug. HET SCHERM MAG GEEN NETWERK AANROEPEN (v244), en dat is precies waarom dit bij de sync moet
 * worden vastgelegd in plaats van ter plekke gemeten.
 *
 * WAT DE FIXTURE DRAAGT, en elke bewering hieronder is een test (v260):
 *  - een rekening waarvan de balances-aanroep LANDDE, een waarvan hij een LEGE LIJST teruggaf, en een die
 *    GOOIDE. Zonder die drie is er één tak getoetst en twee niet;
 *  - een rekening die 0 regels teruggaf terwijl er boekingen op staan (de STILLE rekening), en een
 *    gekoppelde rekening die nooit langs `commitTx()` kwam. Die twee zijn niet hetzelfde: de eerste is
 *    gemeten nul, de tweede is een ontbrekende meting, en de conclusie over de bron hangt aan de tweede;
 *  - een oudere VLAKKE teller in de vorm van v277, want die staat op het toestel en mag niet als rekening
 *    worden gelezen;
 *  - vier maanden met twee groepen: een bron met het weekend op `t.date` en een met een maandagpiek, zodat
 *    de afgeleide indeling van sectie 6 iets te scheiden heeft.
 * De service worker staat globaal uit via playwright.config.js.
 */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const now = new Date();
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
/* VIER MAANDEN: de drie afgeronde die piekReferentie() leest plus de lopende. De dagen liggen vroeg in de
   maand zodat ze ook in februari bestaan, en de weekdag wordt per boeking gekozen en niet per datum. */
const maand = (terug) => { const d = new Date(now.getFullYear(), now.getMonth() - terug, 1); return d; };
/* de eerste <weekdag> van die maand: 0=ma .. 6=zo */
function dagIn(terug, weekdag) {
  const d = maand(terug);
  while (((d.getDay() + 6) % 7) !== weekdag) d.setDate(d.getDate() + 1);
  return d;
}
const ABN = '521200806';
const N26 = '100110012848184840';
const STIL = 'psd2_stil0001';
const LEEG = 'psd2_leeg0001';

function seed() {
  const tx = [];
  const add = (d, amount, src, acc, name, desc) => tx.push({ id: 'x' + tx.length, date: ymd(d), amount,
    acc, src, name, desc: desc || name, typ: '', ref: '', accName: '', refNums: [] });
  for (const terug of [3, 2, 1, 0]) {
    add(dagIn(terug, 0), 4000, 'mt940', ABN, 'Loonstrook', 'SALARIS MAANDELIJKS');
    // de boekdatum-bron: alles op maandag, zoals een bank die kaartbetalingen op maandag boekt
    add(dagIn(terug, 0), -120, 'psd2', ABN, 'Albert Heijn', 'BEA, Betaalpas Albert Heijn NR:AB1, 01.01.20/14:32 PURMEREND');
    add(dagIn(terug, 0), -60, 'psd2', ABN, 'Jumbo', 'Jumbo PMNT');
    // de betaaldag-bron: alles in het weekend
    add(dagIn(terug, 5), -40, 'psd2', N26, 'Vomar', 'Vomar PMNT');
    add(dagIn(terug, 6), -30, 'psd2', N26, 'Splif', 'Splif PMNT');
    // de stille rekening heeft wel boekingen, en die komen uit een eerdere import
    add(dagIn(terug, 2), -20, 'psd2', STIL, 'Etos', 'Etos PMNT');
  }
  const acc = (iban) => ({ uid: 'uid-' + iban, iban, hash: '', label: 'Rekening ' + iban, bank: 'Bank ' + iban, exp: '2026-12-01' });
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify({
      limit: 70, autoIncome: false, income: 4000, toonLegeRek: true,
      manualBal: {}, budgets: { boodschappen: 500, overig: 400, vices: 200 },
      psd2Accounts: { [ABN]: acc(ABN), [N26]: acc(N26), [STIL]: acc(STIL), [LEEG]: acc(LEEG) },
      psd2LastSync: Date.now(),
      /* DRIE BALANCES-UITKOMSTEN plus een stille transactie-aanroep. */
      psd2Diag: {
        [ABN]: { op: ymd(now), txN: 12, txPag: 1, txFout: '', balUit: 768, balGeland: true, balFout: '', balLijst: 2, balTypes: 'CLBD,ITAV', balGekozen: 'CLBD', balRuw: '768.00', balReden: '' },
        [N26]: { op: ymd(now), txN: 8, txPag: 1, txFout: '', balUit: null, balGeland: false, balFout: '', balLijst: 0, balTypes: '', balGekozen: '', balRuw: '', balReden: 'de balances-lijst is leeg' },
        [STIL]: { op: ymd(now), txN: 0, txPag: 1, txFout: '', balUit: null, balGeland: false, balFout: 'HTTP 500 bij de bank', balLijst: null, balTypes: '', balGekozen: '', balRuw: '', balReden: '' },
      },
      /* DE TELLER PER REKENING, plus een oudere VLAKKE meting ernaast (de vorm van v277). */
      valutaTally: {
        [ABN]: { gezien: 12, veld: 0, anders: 0, nieuw: 0, verrijkt: 0, op: ymd(now) },
        [N26]: { gezien: 8, veld: 6, anders: 4, nieuw: 2, verrijkt: 4, op: ymd(now) },
        gezien: 184, nieuw: 0, verrijkt: 0, op: '2026-09-27',
      },
    }),
    minder_own: JSON.stringify([ABN, N26, STIL]),
    minder_accmeta: JSON.stringify({
      [ABN]: { balance: 768, date: ymd(now), bank: 'Bank ' + ABN },
      [N26]: { balance: 445, date: '2026-09-25', bank: 'Bank ' + N26 },
      [STIL]: { balance: 100, date: '2026-09-25', bank: 'Bank ' + STIL },
    }),
    minder_plan: '{}',
  };
}

async function boot(page) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof diagDubbel === 'function' && typeof pickBalance === 'function');
}

const blok = (page, n) => page.evaluate((i) => {
  const b = DIAG_BLOKKEN[i - 1];
  const L = b.lees();
  return (Array.isArray(L) ? L : []).join(String.fromCharCode(10));
}, n);
const sectie = (page, kop) => page.evaluate((k) => {
  const L = diagDubbel(); const i = L.findIndex((x) => x.indexOf(k) === 0);
  if (i < 0) return '';
  const j = L.findIndex((x, n) => n > i && /^\d\. /.test(x));
  return L.slice(i, j < 0 ? L.length : j).join(String.fromCharCode(10));
}, kop);

test.describe('0 - de fixture draagt wat de comment belooft', () => {
  test('vier maanden, en piekReferentie leest er drie', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ m: months(), lm: thisYM(), ref: piekReferentie(thisYM()) }));
    expect(r.m.length).toBeGreaterThanOrEqual(4);
    expect(r.ref, 'de referentie bestaat, dus signaal 3 zwijgt niet').not.toBe(null);
  });

  test('de twee groepen liggen werkelijk op andere weekdagen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((a) => {
      const dag = (acc) => { const d = [0, 0, 0, 0, 0, 0, 0];
        for (const t of TX) if (t.acc === acc && t.amount < 0) d[_piekDagIdx(t.date)] += -t.amount;
        const tot = d.reduce((x, y) => x + y, 0) || 1;
        return { ma: Math.round(d[0] / tot * 100), wk: Math.round((d[5] + d[6]) / tot * 100) }; };
      return { abn: dag(a.ABN), n26: dag(a.N26) };
    }, { ABN, N26 });
    expect(r.abn.ma).toBeGreaterThan(r.abn.wk);   // boekdatum-bron
    expect(r.n26.wk).toBeGreaterThan(r.n26.ma);   // betaaldag-bron
  });
});

test.describe('1 - pickBalance meldt op verzoek wat hij zag', () => {
  test('een gewone respons geeft het saldo en vult de uitleg', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const u = {};
      const bal = pickBalance({ balances: [{ balance_type: 'CLBD', balance_amount: { amount: '768.00' } }] }, u);
      return { bal, u }; });
    expect(r.bal).toBe(768);
    expect(r.u.lijst).toBe(1);
    expect(r.u.gekozen).toBe('CLBD');
    expect(r.u.ruw).toBe('768.00');
    expect(r.u.reden).toBe(undefined);
  });

  /* DE DRIE MANIEREN WAAROP HIJ NULL GEEFT, elk met zijn eigen reden: zonder die reden is "geen saldo"
     niet te onderscheiden van een fout, en dat was precies het gat op het toestel. */
  test('een lege lijst, een entry zonder bedrag en een onleesbaar bedrag geven elk hun eigen reden', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const geef = (b) => { const u = {}; const bal = pickBalance(b, u); return { bal, reden: u.reden, lijst: u.lijst }; };
      return {
        leeg: geef({ balances: [] }),
        geenLijst: geef({ foo: 1 }),
        geenBedrag: geef({ balances: [{ balance_type: 'CLBD' }] }),
        onleesbaar: geef({ balances: [{ balance_type: 'CLBD', balance_amount: { amount: 'n/a' } }] }),
      };
    });
    expect(r.leeg.bal).toBe(null);
    expect(r.leeg.reden).toContain('leeg');
    expect(r.geenLijst.bal).toBe(null);
    expect(r.geenLijst.reden).toContain('geen balances-lijst');
    expect(r.geenBedrag.bal).toBe(null);
    expect(r.geenBedrag.reden).toContain('geen bedrag');
    expect(r.onleesbaar.bal).toBe(null);
    expect(r.onleesbaar.reden).toContain('niet als getal');
  });

  test('zonder uitleg gedraagt hij zich precies als daarvoor', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => [
      pickBalance({ balances: [{ balance_type: 'CLBD', balance_amount: { amount: '10' } }] }),
      pickBalance({ balances: [{ balance_type: 'CLBD', credit_debit_indicator: 'DBIT', balance_amount: { amount: '10' } }] }),
      pickBalance({ balances: [] }),
      pickBalance(null),
    ]);
    expect(r).toEqual([10, -10, null, null]);
  });
});

test.describe('2 - blok 8 leest per rekening terug wat de sync deed', () => {
  test('de drie balances-uitkomsten staan er, elk met hun reden of hun fout', async ({ page }) => {
    await boot(page);
    const t = await blok(page, 8);
    expect(t).toContain('gelukt, saldo 768, landde in ACCMETA');
    expect(t).toContain('GEEN SALDO, niets naar ACCMETA');
    expect(t).toContain('reden: de balances-lijst is leeg');
    expect(t).toContain('FOUT: HTTP 500 bij de bank');
    expect(t).toContain('lijst 2 entries [CLBD,ITAV]');
  });

  test('een niet-gelande balances-aanroep noemt de ouderdom van het saldo dat blijft staan', async ({ page }) => {
    await boot(page);
    const t = await blok(page, 8);
    expect(t).toMatch(/GEVOLG: het saldo hierboven is van 2026-09-25 en niet van de laatste sync/);
  });

  /* DE STILLE REKENING IS GEMETEN NUL en niet een ontbrekende meting, en het blok zegt dat met zoveel
     woorden naast het aantal boekingen dat er wel op staat. */
  test('nul teruggegeven regels bij een rekening met boekingen heet een stille rekening', async ({ page }) => {
    await boot(page);
    const t = await blok(page, 8);
    expect(t).toMatch(/STILLE REKENING: nul regels terug terwijl er \d+ boekingen op staan/);
  });

  /* WAT ER OP DIE SALDI LEUNT hoort bij de meting, want anders leest een niet-bijgewerkt saldo als een
     schoonheidsfout terwijl het in elk bedrag op Home doorwerkt. */
  test('het blok noemt welke schermgetallen op die saldi leunen, met de som', async ({ page }) => {
    await boot(page);
    const t = await blok(page, 8);
    expect(t).toContain('SALDI DIE NIET ZIJN BIJGEWERKT BIJ DE LAATSTE SYNC:');
    expect(t).toContain('totalBalance()');
    expect(t).toContain('safeToSpend()');
    expect(t).toContain('vrijPerDag()');
    expect(t).toMatch(/som van die rekeningen: 545 van \d+ in totalBalance\(\)/);
  });

  test('een gekoppelde rekening zonder vastlegging zegt dat er niets is vastgelegd', async ({ page }) => {
    await boot(page);
    const t = await blok(page, 8);
    expect(t).toContain('niets vastgelegd');
  });
});

test.describe('3 - de value_date-teller staat per rekening', () => {
  test('het totaal is de som van de rekeningen en geen eigen getal', async ({ page }) => {
    await boot(page);
    const t = await sectie(page, '5. DE VALUTADATUM');
    // 12 + 8 = 20, en de oudere vlakke 184 telt daar NIET in mee
    expect(t).toContain('som over de rekeningen): 20 psd2-regels');
    expect(t).toContain('met een value_date: 6');
    expect(t).toContain('daarvan ANDERS dan booking_date: 4');
    expect(t).toContain('nieuw binnen MET het veld: 2');
    expect(t).toContain('bestaande boekingen VERRIJKT: 4');
  });

  /* HET PAD NAAR commitTx() MOET IN DE TEST ZITTEN, en dat miste: de fixture SCHRIJFT de teller, dus de
     sabotage die alles op een hoop telt bleef groen. Dit is de familie van v269 (c): de test schreef via
     een andere weg dan de code die hij moest toetsen. Nu loopt hij door de echte functie. */
  test('commitTx telt per rekening en niet op een hoop', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((o) => {
      SET.valutaTally = {};   // schoon beginnen, zodat deze ene aanroep te zien is
      const maak = (acc, amt, vd) => mapPsd2Tx({ transaction_amount: { amount: String(amt) }, credit_debit_indicator: 'DBIT',
        booking_date: '2026-09-21', value_date: vd, creditor: { name: 'Test ' + amt }, remittance_information: 'R' + amt,
        creditor_account: {}, bank_transaction_code: { description: 'PMNT' } }, acc);
      const added = commitTx([maak(o.ABN, 11.11, null), maak(o.ABN, 12.12, null), maak(o.N26, 13.13, '2026-09-19')], null);
      return { added, tally: JSON.parse(JSON.stringify(SET.valutaTally)), sleutels: Object.keys(SET.valutaTally).sort() };
    }, { ABN, N26 });
    expect(r.added).toBe(3);
    expect(r.sleutels).toEqual([N26, ABN].sort());
    expect(r.tally['-'], 'niets op een verzamelbak').toBe(undefined);
    expect(r.tally[ABN]).toEqual({ gezien: 2, veld: 0, anders: 0, nieuw: 0, verrijkt: 0, op: expect.any(String) });
    expect(r.tally[N26]).toEqual({ gezien: 1, veld: 1, anders: 1, nieuw: 1, verrijkt: 0, op: expect.any(String) });
  });

  /* EEN TWEEDE AANROEP TELT OP EN VERRIJKT, per rekening. Zonder deze stap is `verrijkt` per rekening
     nergens langs de echte functie gemeten. */
  test('een tweede aanroep met dezelfde regels verrijkt op de juiste rekening', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((o) => {
      SET.valutaTally = {};
      const maak = (acc, amt, vd) => mapPsd2Tx({ transaction_amount: { amount: String(amt) }, credit_debit_indicator: 'DBIT',
        booking_date: '2026-09-21', value_date: vd, creditor: { name: 'Test ' + amt }, remittance_information: 'R' + amt,
        creditor_account: {}, bank_transaction_code: { description: 'PMNT' } }, acc);
      commitTx([maak(o.ABN, 21.21, null)], null);              // eerst zonder veld
      const added = commitTx([maak(o.ABN, 21.21, '2026-09-19')], null);   // dezelfde regel, nu met veld
      const t = TX.find((x) => x.amount === -21.21);
      return { added, tally: JSON.parse(JSON.stringify(SET.valutaTally[o.ABN])), vd: t.valutaDatum };
    }, { ABN, N26 });
    expect(r.added).toBe(0);
    expect(r.vd).toBe('2026-09-19');
    expect(r.tally).toEqual({ gezien: 2, veld: 1, anders: 1, nieuw: 0, verrijkt: 1, op: expect.any(String) });
  });

  test('de oudere vlakke meting staat apart en telt niet mee', async ({ page }) => {
    await boot(page);
    const t = await sectie(page, '5. DE VALUTADATUM');
    expect(t).toContain('een oudere meting ZONDER rekening-splitsing');
    expect(t).toContain('gezien=184');
    expect(t).toContain('die telt hierboven niet mee');
  });

  /* DE BANKNAAM KOMT UIT bankVan() EN NIET UIT DE FIXTURE, en dat is gemeten en geen detail:
     `buildAccMeta()` LEIDT de bank af uit het rekeningnummer, dus wat de fixture in ACCMETA zet wordt
     overschreven. Een test die de fixture-naam pint toetst dan de fixture en niet het blok. */
  test('per rekening staat wat de aanroep teruggaf naast wat commitTx zag', async ({ page }) => {
    await boot(page);
    const t = await sectie(page, '5. DE VALUTADATUM');
    const bank = await page.evaluate((a) => ((ACCMETA[a] || {}).bank || '-'), ABN);
    expect(t).toMatch(new RegExp(ABN + '\\s+bank ' + bank + '\\s+langs commitTx\\s+12'));
    expect(t).toContain('de aanroep gaf 12 regels terug');
    expect(t).toContain('de aanroep gaf 8 regels terug');
  });

  /* DE VLAKKE SLEUTELS MOGEN GEEN RIJ KRIJGEN, en dat is wat de vorm-toets werkelijk vasthoudt. De
     sabotage die elke sleutel als rekening leest bleef groen tot deze test erbij stond: de sommen bleven
     kloppen en de aparte regel bleef staan, alleen kwamen er rijen bij voor 'gezien' en 'op'. */
  test('de vlakke sleutels van de oudere meting krijgen geen eigen rij', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel();
      return L.filter((x) => x.indexOf('langs commitTx ') > 0).map((x) => x.trim().split(/\s+/)[0]);
    });
    expect(r.sort()).toEqual([N26, ABN].sort());
    for (const k of ['gezien', 'nieuw', 'verrijkt', 'op']) expect(r).not.toContain(k);
  });

  /* DE STILLE REKENING IS DE EIGENLIJKE VONDST: zonder hem leest een nul als "de bank levert het niet",
     en dat was de fout die de globale teller op het toestel verborg. */
  test('een gekoppelde rekening die nooit langs commitTx kwam wordt bij naam genoemd', async ({ page }) => {
    await boot(page);
    const t = await sectie(page, '5. DE VALUTADATUM');
    expect(t).toContain('NOOIT langs commitTx() kwamen: ' + [STIL, LEEG].join(', '));
    expect(t).toContain('over die banken zegt een nul hierboven niets');
  });

  test('met een stille rekening wijst de conclusie niet de bron aan', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => {
      for (const x of TX) delete x.valutaDatum;
      const L = diagDubbel(); const i = L.findIndex((y) => y.indexOf('5. DE VALUTADATUM') === 0);
      return L.slice(i).join(String.fromCharCode(10));
    });
    expect(t).toContain('MAAR 2 gekoppelde rekening(en) kwamen nooit langs');
    expect(t).not.toContain('Dat is de bron: de respons levert geen value_date');
  });

  test('zonder stille rekening wijst hij de bron wel aan', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => {
      for (const x of TX) delete x.valutaDatum;
      for (const a of Object.keys(SET.psd2Accounts)) {
        if (!(SET.valutaTally[a] && typeof SET.valutaTally[a] === 'object')) SET.valutaTally[a] = { gezien: 5, veld: 0, anders: 0, nieuw: 0, verrijkt: 0, op: '2026-09-27' };
      }
      const L = diagDubbel(); const i = L.findIndex((y) => y.indexOf('5. DE VALUTADATUM') === 0);
      return L.slice(i).join(String.fromCharCode(10));
    });
    expect(t).toContain('van ELKE gekoppelde rekening');
    expect(t).toContain('de respons levert geen value_date');
  });
});

test.describe('4 - sectie 6 splitst per maand op bron', () => {
  test('hij noemt de maanden die signaal 3 werkelijk leest', async ({ page }) => {
    await boot(page);
    const t = await sectie(page, '6. PER MAAND');
    const r = await page.evaluate(() => ({ lm: thisYM(), ref: months().filter((x) => x < thisYM()).slice(-3) }));
    expect(t).toContain('de lopende maand ' + r.lm);
    for (const m of r.ref) expect(t).toContain(m);
  });

  /* DE INDELING IS AFGELEID en noemt geen bank, en de twee getallen waarop hij besluit staan erbij. */
  test('elke groep krijgt zijn weekend- en maandag-aandeel en daarmee zijn kolom', async ({ page }) => {
    await boot(page);
    const t = await sectie(page, '6. PER MAAND');
    const b = await page.evaluate((o) => ({ abn: (ACCMETA[o.ABN] || {}).bank, n26: (ACCMETA[o.N26] || {}).bank }), { ABN, N26 });
    expect(t).toMatch(new RegExp('psd2 \\| ' + b.n26 + '[^\n]+DRAAGT de betaaldag'));
    expect(t).toMatch(new RegExp('psd2 \\| ' + b.abn + '[^\n]+draagt de BOEKDATUM'));
    expect(t).toMatch(/weekend \d+%\s+maandag \d+%/);
  });

  /* EEN GROEP ZONDER WEEKEND EN ZONDER MAANDAG IS NIET TE ZEGGEN, en dan mag de heuristiek niet doen
     alsof. De fixture heeft er een (alles op woensdag), en het blok zegt het met zoveel woorden in
     plaats van hem stil in een kolom te schuiven. */
  test('een groep zonder weekend en zonder maandag heet niet te zeggen', async ({ page }) => {
    await boot(page);
    const t = await sectie(page, '6. PER MAAND');
    expect(t).toContain('NIET TE ZEGGEN, en telt daarom bij de boekdatum');
  });

  test("de twee kolommen tellen per maand op tot de in-scope euros", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel();
      return L.filter((x) => /in scope \d+ euro\s+betaaldag-bronnen/.test(x)).map((x) => {
        const m = x.match(/in scope (\d+) euro\s+betaaldag-bronnen (\d+) \((\d+)%\)\s+boekdatum-bronnen (\d+) \((\d+)%\)/);
        return m ? { tot: +m[1], a: +m[2], b: +m[4], pa: +m[3], pb: +m[5] } : null;
      });
    });
    expect(r.length).toBeGreaterThanOrEqual(4);
    for (const x of r) {
      expect(x, 'elke regel is te lezen').not.toBe(null);
      expect(x.a + x.b).toBe(x.tot);
      expect(x.pa + x.pb).toBeGreaterThanOrEqual(99);
      expect(x.pa + x.pb).toBeLessThanOrEqual(101);
    }
  });

  test('de weekdagreeks van elke groep staat er en telt tot honderd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const L = diagDubbel();
      const som = (kop) => L.filter((x) => x.includes(kop)).map((x) => (x.match(/(\d+)%/g) || []).reduce((a, b) => a + parseInt(b, 10), 0));
      return { a: som('betaaldag-bronnen op t.date:'), b: som('boekdatum-bronnen op t.date:') };
    });
    expect(r.a.length).toBeGreaterThanOrEqual(4);
    expect(r.b.length).toBeGreaterThanOrEqual(4);
    for (const x of r.a.concat(r.b)) { expect(x).toBeGreaterThanOrEqual(97); expect(x).toBeLessThanOrEqual(103); }
  });

  test('hij waarschuwt tegen de as die v273 verbood', async ({ page }) => {
    await boot(page);
    const t = await sectie(page, '6. PER MAAND');
    expect(t).toContain('NIET DOEN op grond van deze tabel alleen');
    expect(t).toContain('derde kalender');
  });
});

test.describe('5 - de bron', () => {
  /* KIJKEN VERANDERT NIETS (v244), en dat is bij deze ronde de scherpste eis: er zijn drie nieuwe
     opslagvelden bijgekomen en het blok leest ze alleen. */
  test('geen enkel diagnoseblok schrijft naar localStorage', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const echt = localStorage.setItem.bind(localStorage); let n = 0;
      localStorage.setItem = function () { n++; return echt.apply(localStorage, arguments); };
      try { for (const b of DIAG_BLOKKEN) await b.lees(); } finally { localStorage.setItem = echt; }
      return n;
    });
    expect(r).toBe(0);
  });

  test('het blok laat SET.psd2Diag en SET.valutaTally onaangeroerd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const voor = JSON.stringify([SET.psd2Diag, SET.valutaTally]);
      for (const b of DIAG_BLOKKEN) await b.lees();
      return { gelijk: JSON.stringify([SET.psd2Diag, SET.valutaTally]) === voor };
    });
    expect(r.gelijk).toBe(true);
  });

  /* DE SCHRIJVERS STAAN OP EEN PLEK PER VELD. Een tweede schrijver van psd2Diag zou betekenen dat twee
     routes een andere vorm kunnen wegschrijven, en dan leest het blok soms iets anders dan het zegt. */
  test('psd2Diag wordt alleen via psd2DiagZet gezet, en die wordt door de twee sync-routes aangeroepen', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const zet = (src.match(/SET\.psd2Diag\s*=/g) || []).length;
    expect(zet, 'alleen de helper zet hem').toBe(1);
    expect((src.match(/psd2DiagZet\(/g) || []).length, 'de declaratie plus twee aanroepers').toBe(3);
    const stuk = (van, tot) => { const i = src.indexOf(van); const j = src.indexOf(tot, i);
      expect(i, van + ' niet gevonden').toBeGreaterThan(-1); return src.slice(i, j); };
    expect(stuk('async function psd2Refresh(silent){', '\nfunction pickBalance(')).toContain('psd2DiagZet(');
    expect(stuk('async function psd2IngestSession(', '\nfunction pickBalance(')).toContain('psd2DiagZet(');
  });

  test('de teller per rekening wordt alleen in commitTx geschreven', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const i = src.indexOf('function commitTx(newTxns, balances){');
    const j = src.indexOf('\nfunction findDuplicateIds(', i);
    const binnen = (src.slice(i, j).match(/SET\.valutaTally/g) || []).length;
    const totaal = (src.match(/SET\.valutaTally\s*=/g) || []).length;
    expect(binnen).toBeGreaterThan(0);
    expect(totaal, 'precies een schrijver').toBe(1);
  });
});
