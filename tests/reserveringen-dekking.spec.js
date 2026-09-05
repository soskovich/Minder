// v128: de dekkingsvraag. Is mijn reserveringenpot toereikend voor de kosten die de komende twaalf
// maanden aankomen maar niet maandelijks vallen? Dat is een andere vraag dan de liquiditeitsvraag
// (krijgt mijn saldo een dip), dus een los pad: recurringSchedule() en liquidityDaily() worden hier
// niet aangeroepen. Verplichtingen voer je zelf in; niets wordt uit transacties gedetecteerd.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const over = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const MAIN = 'NL01MAIN0000001111';
const RES = 'NL01RESV0000002222';
const SAV = 'NL01SAVE0000004323';

function seedRes(set = {}, opt = {}) {
  const tx = [
    { id: 'i1', date: `${CUR}-01`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    { id: 'r1', date: `${CUR}-03`, amount: 50, acc: RES, name: 'Eigen rekening', desc: 'RESERVERINGEN', typ: '', ref: '', src: 'csv', accName: 'Res', refNums: [] },
    { id: 'v1', date: `${CUR}-04`, amount: 10, acc: SAV, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', accName: 'Spaar', refNums: [] },
  ];
  const bal = { [MAIN]: 2000, [SAV]: 5000 };
  if (!opt.geenSaldo) bal[RES] = 1000;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 300, vooruitDoelOpen: true,
      manualBal: bal,
      resAcc: opt.geenAcc ? undefined : RES,
      reserveringen: [
        { id: 'a', naam: 'Gemeente', bedrag: 480, vervalmaand: over(3), intervalM: 12, cat: '' },
        { id: 'b', naam: 'Autobelasting', bedrag: 120, vervalmaand: over(1), intervalM: 3, cat: '' },
      ],
    }, set)),
    minder_own: JSON.stringify([MAIN, RES, SAV]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedRes());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof dekking === 'function');
}

const V = (page, n) => page.evaluate((x) => verplichtingen(x), n || 12);
const D = (page, n) => page.evaluate((x) => dekking(x), n || 12);

test.describe('a · uitrollen over de horizon', () => {
  test('een kwartaalpost verschijnt vier keer in een jaar, een jaarpost één keer', async ({ page }) => {
    await boot(page);
    const v = await V(page);
    expect(v.filter((x) => x.id === 'b').length).toBe(4);       // offsets 1, 4, 7, 10
    expect(v.filter((x) => x.id === 'a').length).toBe(1);
    expect(v.map((x) => x.offset)).toEqual([1, 3, 4, 7, 10]);   // chronologisch
    expect(v[0]).toMatchObject({ id: 'b', naam: 'Autobelasting', bedrag: 120, maand: over(1) });
  });

  test('een verstreken vervalmaand met interval rolt door', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [{ id: 'a', naam: 'Kwartaal', bedrag: 90, vervalmaand: over(-4), intervalM: 3 }] }));
    const v = await V(page);
    expect(v[0].offset).toBe(2);                                // -4 + 2x3 = 2
    expect(v.map((x) => x.offset)).toEqual([2, 5, 8, 11]);
  });

  test('een verstreken eenmalige post vervalt', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [{ id: 'a', naam: 'Eenmalig', bedrag: 200, vervalmaand: over(-1), intervalM: 0 }] }));
    expect(await V(page)).toEqual([]);
  });

  test('een eenmalige post in de toekomst verschijnt precies één keer', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [{ id: 'a', naam: 'Eenmalig', bedrag: 200, vervalmaand: over(5), intervalM: 0 }] }));
    const v = await V(page);
    expect(v.length).toBe(1);
    expect(v[0].offset).toBe(5);
  });

  test('maandelijks mag en telt gewoon mee', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [{ id: 'a', naam: 'Maandpost', bedrag: 30, vervalmaand: CUR, intervalM: 1 }] }));
    expect((await V(page)).length).toBe(12);
  });

  test('de horizon loopt gewoon over de jaargrens', async ({ page }) => {
    await boot(page);
    const v = await V(page);
    const jaren = new Set(v.map((x) => x.maand.slice(0, 4)));
    expect(v.every((x) => /^\d{4}-(0[1-9]|1[0-2])$/.test(x.maand))).toBe(true);
    expect(jaren.size).toBeGreaterThanOrEqual(1);
  });

  test('een post zonder bedrag rolt niet uit', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [{ id: 'a', naam: 'Nog onbekend', bedrag: 0, vervalmaand: over(2), intervalM: 12 }] }));
    expect(await V(page)).toEqual([]);
  });
});

test.describe('b · de dekkingssom', () => {
  test('benodigdPerMaand is bedrag gedeeld door de maanden tot die maand', async ({ page }) => {
    await boot(page);
    const d = await D(page);
    // 120/1 + 480/3 + 120/4 + 120/7 + 120/10 = 120 + 160 + 30 + 17,14 + 12 = 339,14 -> 339
    expect(d.benodigdPerMaand).toBe(339);
  });

  test('een post die deze maand valt heb je nu in zijn geheel nodig', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [{ id: 'a', naam: 'Nu', bedrag: 300, vervalmaand: CUR, intervalM: 12 }] }));
    const d = await D(page);
    expect(d.benodigdPerMaand).toBe(300);                       // niet gedeeld door nul
    expect(d.benodigdeStand).toBe(300);                         // en hij hoort er nu helemaal te staan
  });

  test('benodigdeStand is het opgebouwde deel van het eerstvolgende voorkomen', async ({ page }) => {
    await boot(page);
    const d = await D(page);
    // Gemeente 480, jaarpost over 3 mnd -> 480 x (12-3)/12 = 360
    // Auto 120, kwartaal over 1 mnd     -> 120 x (3-1)/3   = 80
    expect(d.benodigdeStand).toBe(440);
  });

  test('latere voorkomens binnen de horizon tellen niet mee in de stand', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [{ id: 'b', naam: 'Autobelasting', bedrag: 120, vervalmaand: over(1), intervalM: 3 }] }));
    const d = await D(page);
    expect((await V(page)).length).toBe(4);
    expect(d.benodigdeStand).toBe(80);                          // alleen het eerste voorkomen
  });

  test('een eenmalige post draagt niets bij aan de stand', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [{ id: 'a', naam: 'Eenmalig', bedrag: 600, vervalmaand: over(6), intervalM: 0 }] }));
    const d = await D(page);
    expect(d.benodigdeStand).toBe(0);
    expect(d.benodigdPerMaand).toBe(100);                       // 600 / 6
  });

  test('gedektTot telt chronologisch af vanaf de huidige stand', async ({ page }) => {
    await boot(page);                                           // stand 1000
    const d = await D(page);
    // 120 (o1) -> 880, 480 (o3) -> 400, 120 (o4) -> 280, 120 (o7) -> 160, 120 (o10) -> 40
    expect(d.gat).toBeNull();
    expect(d.gedektTot).toBe(over(10));
  });

  test('bij een gat noemt hij de maand, het bedrag en het tekort', async ({ page }) => {
    await boot(page, seedRes({}, {}), );
    await page.evaluate((a) => { SET.manualBal[a] = 500; save(); }, RES);
    const d = await D(page);
    // 120 -> 380, dan komt 480 en dat past niet: tekort 100
    expect(d.gedektTot).toBe(over(1));
    expect(d.gat).toMatchObject({ maand: over(3), bedrag: 480, tekort: 100 });
  });

  test('dekt de pot de eerstvolgende post al niet, dan is gedektTot leeg', async ({ page }) => {
    await boot(page);
    await page.evaluate((a) => { SET.manualBal[a] = 10; save(); }, RES);
    const d = await D(page);
    expect(d.gedektTot).toBeNull();
    expect(d.gat.maand).toBe(over(1));
  });

  test('tekort is de benodigde stand min wat er staat, nooit negatief', async ({ page }) => {
    await boot(page);
    expect((await D(page)).tekort).toBe(0);                     // 1000 staat er, 440 nodig
    await page.evaluate((a) => { SET.manualBal[a] = 300; save(); }, RES);
    expect((await D(page)).tekort).toBe(140);
  });

  test('een negatief saldo wordt meegenomen, niet afgekapt', async ({ page }) => {
    await boot(page);
    await page.evaluate((a) => { SET.manualBal[a] = -200; save(); }, RES);
    const d = await D(page);
    expect(d.werkelijkeStand).toBe(-200);
    expect(d.gedektTot).toBeNull();
    expect(d.tekort).toBe(640);
  });
});

test.describe('c · volledig, of eerlijk zwijgen', () => {
  test('zonder reserveringsrekening: wel de behoefte, geen stand', async ({ page }) => {
    await boot(page, seedRes({}, { geenAcc: true }));
    const d = await D(page);
    expect(d.benodigdPerMaand).toBe(339);
    expect(d.benodigdeStand).toBe(440);
    expect(d.werkelijkeStand).toBeNull();
    expect(d.graad).toBeNull();
    expect(d.volledig).toBe(false);
  });

  test('onbekend saldo: niets doorrekenen', async ({ page }) => {
    await boot(page, seedRes({}, { geenSaldo: true }));
    const d = await D(page);
    expect(d.werkelijkeStand).toBeNull();
    expect(d.volledig).toBe(false);
    expect(d.gedektTot).toBeNull();
  });

  test('een post zonder bedrag zet volledig op false maar blijft in het overzicht', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [
      { id: 'a', naam: 'Gemeente', bedrag: 480, vervalmaand: over(3), intervalM: 12 },
      { id: 'z', naam: 'Tandarts', bedrag: 0, vervalmaand: over(5), intervalM: 12 },
    ] }));
    const d = await D(page);
    expect(d.volledig).toBe(false);
    expect(d.zonderBedrag).toEqual(['Tandarts']);
    expect(d.aantal).toBe(2);
    await page.evaluate(() => openReserveringen());
    expect(await page.locator('#sheet').innerText()).toContain('Tandarts');
  });

  test('graad is de stand gedeeld door de benodigde stand', async ({ page }) => {
    await boot(page);
    expect((await D(page)).graad).toBe(227);                    // 1000 / 440
  });
});

test.describe('d · de zin', () => {
  test('gedekt: rustige vaststelling, geen felicitatie', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => dekkingTekst(dekking(12)));
    expect(t).toMatch(/^Je bent gedekt tot en met \w+ \d{4}\./);
    expect(t).toContain('€339 per maand nodig');
    expect(t).not.toMatch(/[!—]/);
    expect(t).not.toMatch(/goed bezig|knap|gefeliciteerd|prima/i);
  });

  test('niet gedekt: maand, bedrag en tekort', async ({ page }) => {
    await boot(page);
    await page.evaluate((a) => { SET.manualBal[a] = 500; save(); }, RES);
    const t = await page.evaluate(() => dekkingTekst(dekking(12)));
    expect(t).toMatch(/Je bent gedekt tot en met \w+ \d{4}\./);
    expect(t).toMatch(/komt €480 en dan kom je €100 tekort/);
  });

  test('zonder rekening zegt hij wat er ontbreekt', async ({ page }) => {
    await boot(page, seedRes({}, { geenAcc: true }));
    const t = await page.evaluate(() => dekkingTekst(dekking(12)));
    expect(t).toContain('Wijs een reserveringsrekening aan');
    expect(t).not.toMatch(/gedekt tot en met/);
  });

  test('zonder verplichtingen: één rustige regel met een tik', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [] }));
    expect(await page.evaluate(() => dekkingTekst(dekking(12)))).toBe('Je hebt nog geen verplichtingen ingevoerd.');
    await page.evaluate(() => go('vooruit'));
    const h = await page.evaluate(() => resDekkingCard());
    expect(h).toContain('openReserveringen()');
    expect(h).not.toContain('per maand nodig');
  });
});

test.describe('e · beheer en de rekening', () => {
  test('toevoegen, bewerken en verwijderen', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [] }));
    await page.evaluate(() => openReservering());
    await page.waitForSelector('#rNaam');
    await page.locator('#rNaam').fill('Tandarts');
    await page.locator('#rBedrag').fill('240');
    await page.locator('#rMaand').fill(over(4));
    await page.locator('#sheet >> text=jaarlijks').click();
    await page.locator('#sheet >> text=Opslaan').click();
    await page.waitForSelector('#resHead');
    let g = await page.evaluate(() => JSON.parse(JSON.stringify(SET.reserveringen)));
    expect(g.length).toBe(1);
    expect(g[0]).toMatchObject({ naam: 'Tandarts', bedrag: 240, vervalmaand: over(4), intervalM: 12 });

    await page.evaluate((id) => openReservering(id), g[0].id);
    await page.locator('#rBedrag').fill('260');
    await page.locator('#sheet >> text=Opslaan').click();
    await page.waitForSelector('#resHead');
    expect((await page.evaluate(() => SET.reserveringen))[0].bedrag).toBe(260);

    await page.evaluate((id) => openReservering(id), g[0].id);
    await page.locator('#sheet >> text=Verwijderen').click();
    await page.waitForSelector('#resHead');
    expect(await page.evaluate(() => SET.reserveringen)).toEqual([]);
  });

  test('het overzicht staat op eerstvolgende vervalmaand', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openReserveringen());
    const t = await page.locator('#sheet').innerText();
    expect(t.indexOf('Autobelasting')).toBeLessThan(t.indexOf('Gemeente'));   // over 1 mnd vóór over 3 mnd
  });

  test('de rekening is te kiezen en weer los te laten', async ({ page }) => {
    await boot(page, seedRes({}, { geenAcc: true }));
    expect(await page.evaluate(() => resAccId())).toBe('');
    await page.evaluate((a) => resAccSet(a), RES);
    expect(await page.evaluate(() => resAccId())).toBe(RES);
    expect(await page.evaluate(() => resSaldo())).toBe(1000);
    await page.evaluate(() => resAccSet(''));
    expect(await page.evaluate(() => resAccId())).toBe('');
  });

  test('is de rekening ook spaarrekening, dan meldt de sheet de botsing', async ({ page }) => {
    await boot(page, seedRes({ savingsAcc: { [RES]: true } }));
    expect(await page.evaluate((a) => isSavingsAcc(a), RES)).toBe(true);
    await page.evaluate(() => openReserveringen());
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('ook aangemerkt als spaarrekening');
    expect(t).toContain('spaarvlag uitzetten');
    // niets wordt automatisch gecorrigeerd
    expect(await page.evaluate((a) => isSavingsAcc(a), RES)).toBe(true);
    await page.locator('#sheet >> text=spaarvlag uitzetten').click();
    expect(await page.evaluate((a) => isSavingsAcc(a), RES)).toBe(false);
  });
});

test.describe('f · de reservering is geen spaardoel en raakt de andere lagen niet', () => {
  test('niets van dit alles komt in het plan terecht', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => ({
      ids: planItems().map((x) => x.id),
      cap: planCapacity(),
      alloc: allocatePlan().reduce((s, x) => s + x.alloc, 0),
    }));
    expect(uit.ids.some((i) => i === 'a' || i === 'b')).toBe(false);
    expect(uit.cap).toBe(300);                                   // ongewijzigd de spaarinleg
    expect(uit.alloc).toBeLessThanOrEqual(300);
  });

  test('de reserveringsrekening telt niet als spaarrekening', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate((a) => ({ sav: n26SavingsAccounts(), isSav: isSavingsAcc(a), totalSaved: totalSaved().sum }), RES);
    expect(uit.isSav).toBe(false);
    expect(uit.sav).not.toContain(RES);
    expect(uit.totalSaved).toBe(5000);                           // alleen de echte spaarrekening
  });

  test('liquiditeit en terugkerende lasten zijn niet aangeraakt', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => ({
      rec: recurringSchedule().length,
      liq: JSON.stringify(monthLiquidity()),
      saved: savedThisMonth(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')),
    }));
    await page.evaluate(() => { dekking(12); verplichtingen(12); resDekkingCard(); });
    const na = await page.evaluate(() => ({
      rec: recurringSchedule().length,
      liq: JSON.stringify(monthLiquidity()),
      saved: savedThisMonth(new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')),
    }));
    expect(na).toEqual(voor);
  });

  test('dekking() leest niets uit je transacties', async ({ page }) => {
    await boot(page);
    const voor = await D(page);
    await page.evaluate(() => {
      TX.push({ id: 'nieuw', date: new Date().toISOString().slice(0, 10), amount: -800, acc: 'NL01MAIN0000001111', name: 'Gemeente', desc: 'AANSLAG', typ: '', ref: '', src: 'csv', refNums: [] });
      save();
    });
    expect(await D(page)).toEqual(voor);
  });
});

test.describe('g · het controlemoment', () => {
  test('hooguit één keer per maand, en weg te tikken', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => resCheckDue())).toBe(true);
    const h = await page.evaluate(() => resDekkingCard());
    expect(h).toContain('Klopt je lijst nog?');
    await page.evaluate(() => resCheckOk());
    expect(await page.evaluate(() => resCheckDue())).toBe(false);
    expect(await page.evaluate(() => resDekkingCard())).not.toContain('Klopt je lijst nog?');
  });

  test('zonder verplichtingen vraagt hij niets', async ({ page }) => {
    await boot(page, seedRes({ reserveringen: [] }));
    expect(await page.evaluate(() => resCheckDue())).toBe(false);
  });

  test('hij komt ook langs in de signalen, met de bestaande snooze', async ({ page }) => {
    await boot(page);
    const n = await page.evaluate(() => scoreNotifs().find((x) => x.key === 'res-check'));
    expect(n).toMatchObject({ key: 'res-check', l1: 'Klopt je lijst met reserveringen nog?', act: 'openReserveringen()' });
    await page.evaluate(() => resCheckOk());
    expect(await page.evaluate(() => scoreNotifs().some((x) => x.key === 'res-check'))).toBe(false);
  });
});

test.describe('h · weergave', () => {
  /* v187: dekking is een structurele vraag, dus het oordeel staat op Maand. Deze kaart is de plek
     waar je de lijst beheert en houdt daarom de feiten over die lijst en de ingang ernaartoe, zonder
     de graad en zonder dekkingTekst. Twee schermen, één bron: het oordeel staat er nog maar één keer. */
  test('de kaart staat op Plan met de feiten en de ingang, zonder het oordeel', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('vooruit'));
    await page.waitForSelector('#s-vooruit');
    const t = await page.locator('#s-vooruit').innerText();
    expect(t).toContain('Reserveringen');
    expect(t).toMatch(/\d+ post/);
    expect(t).not.toMatch(/gedekt tot en met/);
    expect(t).not.toMatch(/\d+% van wat er/);
    await page.locator('#s-vooruit >> text=Reserveringen').first().click();
    await page.waitForSelector('#resHead');
  });

  test('het oordeel staat op Maand, en daar maar één keer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      go('maand');
      return { regel: (maandRegels() || []).find((x) => x.key === 'dekking'),
        zin: dekkingTekst(dekking(12)), scherm: $('#s-maand').innerText };
    });
    expect(r.regel).toBeTruthy();
    expect(r.regel.gevolg).toBe(r.zin);                 // het oordeel komt uit dekkingTekst
    expect(r.scherm).toContain('Dekking reserveringen');
    /* En resDekkingCard roept die zin niet meer aan. Commentaar telt niet als aanroep: de functie
       legt in een comment uit wat er stond en waarom (dezelfde meetfout als v164). */
    const kaal = (await page.evaluate(() => resDekkingCard.toString()))
      .replace(/\/\*[\s\S]*?\*\//g, ' ');
    expect(kaal).not.toContain('dekkingTekst');
    expect(kaal).not.toContain('D.graad');
  });

  for (const w of [360, 390]) {
    test(`de sheet past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page);
      await page.evaluate(() => openReserveringen());
      const over2 = await page.evaluate(() => {
        const el = document.querySelector('#sheet');
        return { sheet: el.scrollWidth - el.clientWidth, body: document.body.scrollWidth - document.body.clientWidth };
      });
      expect(over2.sheet).toBeLessThanOrEqual(1);
      expect(over2.body).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('i · de pot valt buiten veilig te besteden (v129)', () => {
  const S = (page) => page.evaluate(() => safeToSpend());

  test('het saldo van de pot gaat van je vrij besteedbare geld af', async ({ page }) => {
    await boot(page);
    const a = await S(page);
    expect(a.saldo).toBe(8000);              // 2000 main + 1000 pot + 5000 spaar
    expect(a.savedBal).toBe(5000);           // de echte spaarrekening
    expect(a.resBal).toBe(1000);             // de reserveringspot
    expect(a.spendSaldo).toBe(2000);         // alleen je betaalrekening blijft over

    await page.evaluate(() => { delete SET.resAcc; save(); });
    const b = await S(page);
    expect(b.resBal).toBe(0);
    expect(b.spendSaldo).toBe(3000);         // zonder aangewezen pot telt hij weer mee
    expect(b.safe - a.safe).toBe(1000);
  });

  test('een pot die ook spaarrekening is wordt niet twee keer afgetrokken', async ({ page }) => {
    await boot(page, seedRes({ savingsAcc: { [RES]: true } }));
    const a = await S(page);
    expect(a.savedBal).toBe(6000);           // 5000 + de pot, want die telt nu als spaarrekening
    expect(a.resBal).toBe(0);                // dus niet nog eens
    expect(a.spendSaldo).toBe(2000);
  });

  test('een onbekend potsaldo verandert niets', async ({ page }) => {
    await boot(page, seedRes({}, { geenSaldo: true }));
    const a = await S(page);
    expect(a.resBal).toBe(0);
    expect(a.spendSaldo).toBe(2000);         // 7000 saldo min 5000 spaar; de pot zit er niet in
  });

  test('een negatieve pot wordt op nul geklemd, niet bijgeteld', async ({ page }) => {
    await boot(page);
    await page.evaluate((x) => { SET.manualBal[x] = -200; save(); }, RES);
    const a = await S(page);
    expect(a.saldo).toBe(6800);              // de roodstand telt gewoon mee in je totale saldo
    expect(a.resBal).toBe(0);                // maar je reserveert geen negatief bedrag
    expect(a.spendSaldo).toBe(1800);
  });

  test('de opbouw-sheet noemt de post met een tik naar het beheer', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openSafeToSpend());
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('In je reserveringspot');
    expect(t).toContain('al vergeven aan posten die nog moeten komen');
    await page.locator('#sheet >> text=In je reserveringspot').click();
    await page.waitForSelector('#resHead');
  });

  test('zonder pot staat de regel er niet', async ({ page }) => {
    await boot(page, seedRes({}, { geenAcc: true }));
    await page.evaluate(() => openSafeToSpend());
    expect(await page.locator('#sheet').innerText()).not.toContain('In je reserveringspot');
  });
});
