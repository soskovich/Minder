// v201: een gekoppelde rekening zonder boekingen valt buiten OWN (v122), dus rekeningOverlap() kan
// hem structureel niet vinden - die toets vergelijkt de boekingen zelf. openRekOverlap() benoemde
// hem wel, maar er was geen actie. Nu is er er een: je kiest zelf een kandidaat, en Minder stelt
// niets voor. Plus de bug die er al zat: rekSamenvoeg() wiste de spaarvlag van de opgeheven id en
// liet SET.resAcc naar een dode id wijzen, allebei zonder het te zeggen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));

const MAIN = '100110012555096222';   // betaalrekening, met boekingen
const SPAAR = 'psd2_11111111';       // tweede rekening met boekingen
const LEEG = 'psd2_99999999';        // gekoppeld, nul boekingen: staat niet in OWN

function seed(set = {}, opt = {}) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc, name: naam, desc: naam, typ: '', ref: '',
              src: 'psd2', accName: '', refNums: [] });
  if (!opt.geenTx) {
    for (const m of [M1, CUR]) {
      add('i' + m, MAIN, m, '25', 3000, 'Werkgever');
      add('b' + m, MAIN, m, '06', -40, 'Albert Heijn');
      if (!opt.eenKandidaat) add('s' + m, SPAAR, m, '02', -25, 'Naar potje');
    }
  }
  const ps = {
    [MAIN]: { uid: 'u-main', iban: 'DE8937040044053206222', label: 'V SUMTER', bank: 'N26', exp: '2026-10-01' },
    // de lege rekening heeft bewust de NIEUWSTE machtiging: de heuristiek in rekSamenvoegVraag()
    // zou hem daarom als blijvende kiezen, en dat is precies wat de vaste richting moet voorkomen
    [LEEG]: { uid: 'u-leeg', iban: '', label: 'V SUMTER', bank: 'N26', exp: '2027-06-01' },
  };
  if (!opt.eenKandidaat && !opt.geenTx) {
    ps[SPAAR] = { uid: 'u-spaar', iban: '', label: 'V SUMTER', bank: 'N26', exp: '2026-11-01' };
  }
  if (opt.geenKandidaat) { delete ps[MAIN]; delete ps[SPAAR]; }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      manualBal: { [MAIN]: 4000, [SPAAR]: 900, [LEEG]: 2500 },
      acctName: { [MAIN]: 'Betaalrekening', [SPAAR]: 'Potje', [LEEG]: 'Buffer Rust' },
      savingsAcc: { [MAIN]: false, [SPAAR]: false, [LEEG]: false },
      psd2Accounts: ps,
    }, set)),
    minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof rekKandidaten === 'function');
}

const sheet = (page) => page.evaluate(() => document.getElementById('sheet').innerText);
const staat = (page) => page.evaluate(() => JSON.stringify({
  tx: TX.length, own: OWN.slice().sort(), alle: allAccounts().slice().sort(),
  res: SET.resAcc || '', sav: JSON.stringify(SET.savingsAcc || {}),
  bal: JSON.stringify(SET.manualBal || {}), ps: Object.keys(SET.psd2Accounts || {}).sort(),
}));

test.describe('a · de lege rekening krijgt een kandidatenlijst', () => {
  test('de andere rekeningen staan eronder, met naam, boekingen, saldo en herkenning', async ({ page }) => {
    await boot(page);
    // uitgangspunt: hij valt buiten OWN en is dus met geen enkele boeking te vinden
    const uit = JSON.parse(await page.evaluate(() => JSON.stringify({
      own: OWN.includes('psd2_99999999'), leeg: rekZonderBoekingen(),
      ov: rekeningOverlap().length,
    })));
    expect(uit.own).toBe(false);
    expect(uit.leeg).toEqual([LEEG]);
    expect(uit.ov).toBe(0);

    await page.evaluate(() => openRekOverlap());
    const t = await sheet(page);
    expect(t).toMatch(/Hoort Buffer Rust bij een van deze\?/);
    expect(t).toMatch(/Betaalrekening/);
    expect(t).toMatch(/2 boekingen/);           // de spaarrekening-kandidaat
    expect(t).toMatch(/4 boekingen/);           // de betaalrekening-kandidaat
    expect(t).toMatch(/€\s?4\.000/);
    expect(t).toMatch(/€\s?900/);
    expect(t).toMatch(/id psd2_11111111/);      // zonder eigen IBAN onderscheidt de id ze
    expect(t).toMatch(/IBAN 6222/);             // met IBAN: de laatste vier cijfers
  });

  test('er wordt niets voorgesteld en niets voorgeselecteerd', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openRekOverlap());
    const t = await sheet(page);
    expect(t).toMatch(/Kies zelf\./);
    expect(t).toMatch(/zonder boekingen is er niets om op te vergelijken/i);
    // geen aanbeveling, geen naamgelijkenis, geen voorselectie
    expect(t).not.toMatch(/waarschijnlijk|vermoedelijk|lijkt op|zelfde naam|aanbevolen|meest/i);
    const gemarkeerd = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#sheet .row')];
      return rows.filter((r) => /\bon\b|selected|aanbevolen/.test(r.className)).length;
    });
    expect(gemarkeerd).toBe(0);
  });

  test('twee kandidaten worden allebei aangeboden, één kandidaat ook', async ({ page }) => {
    await boot(page);
    const twee = await page.evaluate(() => (rekKandidaten('psd2_99999999').match(/rekSamenvoegVraag\(/g) || []).length);
    expect(twee).toBe(2);

    await boot(page, seed({}, { eenKandidaat: true }));
    const een = await page.evaluate(() => (rekKandidaten('psd2_99999999').match(/rekSamenvoegVraag\(/g) || []).length);
    expect(een).toBe(1);
    await page.evaluate(() => openRekOverlap());
    expect(await sheet(page)).toMatch(/Hoort Buffer Rust bij een van deze\?/);
  });

  test('zonder andere rekening staat er geen keuze maar een vaststelling', async ({ page }) => {
    await boot(page, seed({}, { geenTx: true, geenKandidaat: true }));
    const alle = JSON.parse(await page.evaluate(() => JSON.stringify(allAccounts())));
    expect(alle).toEqual([LEEG]);
    const h = await page.evaluate(() => rekKandidaten('psd2_99999999'));
    expect(h).toMatch(/Er is geen andere rekening om mee samen te voegen\./);
    expect(h).not.toMatch(/rekSamenvoegVraag\(/);
  });
});

test.describe('b · samenvoegen gebeurt pas na een expliciete bevestiging', () => {
  test('een kandidaat aantikken wijzigt niets en opent de bevestiging', async ({ page }) => {
    await boot(page);
    const voor = await staat(page);
    await page.evaluate(() => rekSamenvoegVraag('psd2_99999999', '100110012555096222', 'vast'));
    expect(await staat(page)).toBe(voor);            // niets gewijzigd door het openen

    const t = await sheet(page);
    expect(t).toMatch(/Samenvoegen tot één rekening/);
    expect(t).toMatch(/Dit is niet terug te draaien\./);
    expect(t).toMatch(/Blijft bestaan/);
    expect(t).toMatch(/Vervalt/);
    // de knop is de enige route naar de wijziging
    const knop = await page.evaluate(() => {
      const b = [...document.querySelectorAll('#sheet button')].find((x) => /Samenvoegen/.test(x.innerText));
      return b ? b.getAttribute('onclick') : '';
    });
    expect(knop).toMatch(/^rekSamenvoeg\('psd2_99999999','100110012555096222'\)$/);
  });

  test('de richting staat vast: de lege rekening vervalt, ook met de nieuwste machtiging', async ({ page }) => {
    await boot(page);
    // zonder vaste richting zou de heuristiek de lege rekening kiezen als blijvende (exp wint)
    await page.evaluate(() => rekSamenvoegVraag('psd2_99999999', '100110012555096222'));
    const los = await sheet(page);
    expect(los.indexOf('Buffer Rust')).toBeLessThan(los.indexOf('Betaalrekening'));

    await page.evaluate(() => rekSamenvoegVraag('psd2_99999999', '100110012555096222', 'vast'));
    const vast = await sheet(page);
    const blijft = vast.indexOf('Blijft bestaan'), vervalt = vast.indexOf('Vervalt');
    expect(vast.slice(blijft, vervalt)).toMatch(/Betaalrekening/);
    expect(vast.slice(vervalt)).toMatch(/Buffer Rust/);
  });

  test('het saldo dat definitief weg is staat met het bedrag in de bevestiging', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => rekSamenvoegVraag('psd2_99999999', '100110012555096222', 'vast'));
    const t = await sheet(page);
    expect(t).toMatch(/het saldo van €\s?2\.500,00 verdwijnt met Buffer Rust/);
    // de lege rekening zit niet in OWN, dus zijn saldo telde niet mee in het totaal:
    // dan is 'minder in je totaal' onwaar en staat het er niet
    expect(t).not.toMatch(/minder in je totaal/);
    const tot = await page.evaluate(() => totalBalance().sum);
    await page.evaluate(() => rekSamenvoeg('psd2_99999999', '100110012555096222'));
    expect(await page.evaluate(() => totalBalance().sum)).toBe(tot);
  });

  test('bij een overlap houdt de bestaande zin zijn vorm, want daar telt het saldo wel dubbel', async ({ page }) => {
    await boot(page);
    // beide rekeningen staan in OWN, dus daar telt het saldo wel dubbel en daalt je totaal echt.
    // De heuristiek kiest hier de nieuwste machtiging als blijvende, dus Betaalrekening vervalt.
    await page.evaluate(() => rekSamenvoegVraag('psd2_11111111', '100110012555096222'));
    const t = await sheet(page);
    expect(t).toMatch(/het saldo telt daarna nog één keer mee \(€\s?4\.000,00 minder in je totaal\)/);
  });
});

test.describe('c · een opgeheven spaarrekening verdwijnt niet stilletjes', () => {
  test('de spaarvlag verhuist mee en de bevestiging zegt het', async ({ page }) => {
    await boot(page, seed({ savingsAcc: { [MAIN]: false, [SPAAR]: false, [LEEG]: true } }));
    const voor = JSON.parse(await page.evaluate(() => JSON.stringify({
      sav: n26SavingsAccounts(), saved: totalSaved(), buf: bufferMaanden(),
    })));
    expect(voor.sav).toEqual([LEEG]);
    expect(voor.saved.sum).toBe(2500);

    await page.evaluate(() => rekSamenvoegVraag('psd2_99999999', '100110012555096222', 'vast'));
    expect(await sheet(page)).toMatch(/Buffer Rust staat aangemerkt als spaarrekening; die vlag gaat mee naar Betaalrekening/);

    await page.evaluate(() => rekSamenvoeg('psd2_99999999', '100110012555096222'));
    const na = JSON.parse(await page.evaluate(() => JSON.stringify({
      sav: n26SavingsAccounts(), saved: totalSaved(), buf: bufferMaanden(),
      vlag: (SET.savingsAcc || {})['100110012555096222'],
    })));
    expect(na.sav).toEqual([MAIN]);
    expect(na.vlag).toBe(true);
    // voorheen viel de vlag weg: totalSaved() ging naar 0, spaarSaldo() naar onbekend en de buffer
    // naar null, waarna veilig-te-besteden met datzelfde bedrag omhoog sprong
    expect(na.saved.n).toBe(1);
    expect(na.buf).not.toBeNull();
  });

  test('de vlag vervalt zichtbaar als de blijvende rekening al de reserveringenpot is', async ({ page }) => {
    await boot(page, seed({ savingsAcc: { [MAIN]: false, [SPAAR]: false, [LEEG]: true }, resAcc: MAIN }));
    await page.evaluate(() => rekSamenvoegVraag('psd2_99999999', '100110012555096222', 'vast'));
    expect(await sheet(page)).toMatch(/is al je reserveringenpot; die vlag vervalt/);
    await page.evaluate(() => rekSamenvoeg('psd2_99999999', '100110012555096222'));
    const r = JSON.parse(await page.evaluate(() => JSON.stringify({
      vlag: isSavingsAcc('100110012555096222'), res: SET.resAcc,
    })));
    // twee rollen op één rekening is precies wat v128 uitsluit
    expect(r.vlag).toBe(false);
    expect(r.res).toBe(MAIN);
  });
});

test.describe('d · een opgeheven reserveringenpot verdwijnt niet stilletjes', () => {
  test('SET.resAcc verhuist mee en de bevestiging zegt het', async ({ page }) => {
    await boot(page, seed({ resAcc: LEEG, reserveringen: [{ id: 'r1', naam: 'Tandarts', bedrag: 480, vervalmaand: CUR, intervalM: 12 }] }));
    const voor = JSON.parse(await page.evaluate(() => JSON.stringify({ id: resAccId(), bal: resSaldo() })));
    expect(voor.id).toBe(LEEG);
    expect(voor.bal).toBe(2500);

    await page.evaluate(() => rekSamenvoegVraag('psd2_99999999', '100110012555096222', 'vast'));
    expect(await sheet(page)).toMatch(/Buffer Rust is je reserveringenpot; die rol gaat mee naar Betaalrekening/);

    await page.evaluate(() => rekSamenvoeg('psd2_99999999', '100110012555096222'));
    const na = JSON.parse(await page.evaluate(() => JSON.stringify({
      res: SET.resAcc, id: resAccId(), bal: resSaldo(),
    })));
    // voorheen bleef SET.resAcc naar de dode id wijzen: resAccId() gaf leeg terug en de
    // dekkingsregel op Maand viel van ok naar onbekend
    expect(na.res).toBe(MAIN);
    expect(na.id).toBe(MAIN);
    expect(na.bal).toBe(4000);
  });

  test('de rol vervalt zichtbaar als de blijvende rekening al spaarrekening is', async ({ page }) => {
    await boot(page, seed({ resAcc: LEEG, savingsAcc: { [MAIN]: true, [SPAAR]: false, [LEEG]: false } }));
    await page.evaluate(() => rekSamenvoegVraag('psd2_99999999', '100110012555096222', 'vast'));
    expect(await sheet(page)).toMatch(/staat al aangemerkt als spaarrekening; die rol vervalt en je wijst zelf een nieuwe pot aan/);
    await page.evaluate(() => rekSamenvoeg('psd2_99999999', '100110012555096222'));
    const r = JSON.parse(await page.evaluate(() => JSON.stringify({ res: SET.resAcc || '', id: resAccId() })));
    expect(r.res).toBe('');
    expect(r.id).toBe('');
  });

  test('een rekening die allebei was, houdt allebei: die botsing bestond al', async ({ page }) => {
    await boot(page, seed({ resAcc: LEEG, savingsAcc: { [MAIN]: false, [SPAAR]: false, [LEEG]: true } }));
    await page.evaluate(() => rekSamenvoeg('psd2_99999999', '100110012555096222'));
    const r = JSON.parse(await page.evaluate(() => JSON.stringify({
      res: SET.resAcc, vlag: isSavingsAcc('100110012555096222'),
    })));
    expect(r.res).toBe(MAIN);
    expect(r.vlag).toBe(true);
  });
});

test.describe('e · hetzelfde gedrag op het bestaande overlap-pad', () => {
  test('ook een samenvoeging tussen twee rekeningen mét boekingen neemt de rollen mee', async ({ page }) => {
    await boot(page, seed({ resAcc: SPAAR, savingsAcc: { [MAIN]: false, [SPAAR]: false, [LEEG]: false } }));
    // hier geen vaste richting: het bestaande pad houdt zijn heuristiek
    await page.evaluate(() => rekSamenvoeg('psd2_11111111', '100110012555096222'));
    expect(await page.evaluate(() => SET.resAcc)).toBe(MAIN);
    expect(await page.evaluate(() => resAccId())).toBe(MAIN);
  });

  test('de heuristiek van het bestaande pad is ongemoeid', async ({ page }) => {
    await boot(page);
    // MAIN heeft de oudste machtiging, LEEG de nieuwste: zonder derde argument wint exp
    const src = await page.evaluate(() => String(rekSamenvoegVraag));
    expect(src).toMatch(/vasteRichting \? false :/);
    expect(src).toMatch(/fa\.exp>fb\.exp/);
  });
});

test.describe('f · de kop van de sheet klopt met wat je er kunt doen', () => {
  test('er staat niet meer dat de sheet read-only is', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openRekOverlap());
    const t = await sheet(page);
    expect(t).not.toMatch(/Read-only/i);
    expect(t).toMatch(/Samenvoegen is het enige wat je hier kunt wijzigen, en dat gaat nooit vanzelf\./);
  });
});
