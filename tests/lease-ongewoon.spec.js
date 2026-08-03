// v86: (1) de "ongewoon"-vlag tempert bij herkende vaste lasten en meet tegen je eigen
// winkel-historie, (2) een terugkerende auto-lease kan gekoppeld worden als financial lease.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

const LEASE = 389;   // maandtermijn Hilterman, elke maand hetzelfde

// Vervoer krijgt kleine variabele posten (parkeren/tanken) plus de lease-incasso, zodat het
// categoriegemiddelde laag is en de lease er zonder fix bovenuit steekt — precies de melding.
function seedLease({ lease = LEASE, spike = true, dubbeleLease = true } = {}) {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  const add = (id, m, day, amount, name, desc) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    if (m !== CUR || dubbeleLease) add('lease-' + m, m, '26', -lease, 'Hilterman lease', 'SEPA INCASSO HILTERMANN LEASECONTRACT 4471');
    for (const d of ['07', '14', '22']) add('park-' + m + d, m, d, -12, 'ParkBee Centrum', 'BEA, BETAALPAS PARKBEE CENTRUM');
    for (const d of ['15', '28']) add('tank-' + m + d, m, d, -55, 'Shell Station', 'BEA, BETAALPAS SHELL STATION');
  }
  // eenmalige piek in dezelfde categorie: een jaartraject, geen herhaling, geen eigen historie
  if (spike) add('ov-cur', CUR, '21', -640, 'NS Groep', 'BEA, BETAALPAS NS GROEP JAARTRAJECT');
  p.minder_tx = JSON.stringify(tx);
  return p;
}

async function boot(page, payload) {
  await open(page, payload || seedLease());
  await page.evaluate(() => { go('tx'); setTxPeriod('all'); });
  await page.waitForSelector('#txlist .tx');
}
// categorize() herschrijft t.id bij elke boot (hash van rekening+datum+bedrag+omschrijving),
// dus we zoeken transacties op naam + maand op i.p.v. op de fixture-id.
const idVan = (page, name, ym) => page.evaluate(([n, m]) => {
  const t = TX.find((x) => x.name === n && x.date.slice(0, 7) === m); return t ? t.id : '';
}, [name, ym]);
const rij = (page, id) => page.locator(`#txlist .tx[onclick="openSheet('${id}')"]`);
// v93: de vlag heet sinds de UX-review "afwijkend bedrag"; de detectie (txOutlier) is dezelfde
const ongewoon = async (page, id) => (await rij(page, id).innerText()).includes('afwijkend bedrag');

test.describe('a · "ongewoon" tempert bij vaste lasten en eigen historie', () => {
  test('de terugkerende lease is niet meer ongewoon, de eenmalige piek nog wél', async ({ page }) => {
    await boot(page);
    const leaseId = await idVan(page, 'Hilterman lease', CUR), garageId = await idVan(page, 'NS Groep', CUR);
    const r = await page.evaluate((ids) => {
      const t = TX.find((x) => x.id === ids.lease), g = TX.find((x) => x.id === ids.spike);
      return { cat: catOf(t), vast: isFixed(t), catG: catOf(g), vastG: isFixed(g) };
    }, { lease: leaseId, spike: garageId });
    expect(r.cat).toBe('vervoer');                       // categorisering onveranderd
    expect(r.vast).toBe(true);                           // herkende herhaling (incasso, 3 maanden)
    expect(r.catG).toBe('vervoer');
    expect(r.vastG).toBe(false);

    expect(await ongewoon(page, leaseId)).toBe(false);
    expect(await ongewoon(page, garageId)).toBe(true);
  });

  test('zonder de fix zou de lease wél gevlagd zijn (de oude categorie-toets vuurt hier)', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((id) => {
      const t = TX.find((x) => x.id === id);
      // reconstrueer de oude toets op exact dezelfde catAvg-basis als renderTxList
      const all = txForPeriod(); const sum = {}, cnt = {};
      for (const x of all) { const k = catOf(x); if (CATS[k] && CATS[k].type === 'expense') { sum[k] = (sum[k] || 0) + (-x.amount); if (x.amount < 0) cnt[k] = (cnt[k] || 0) + 1; } }
      const catAvg = {}; for (const k in sum) if (cnt[k]) catAvg[k] = sum[k] / cnt[k];
      const a = catAvg[catOf(t)];
      return { oud: !!(a && (-t.amount) > Math.max(a * 2.2, 60) && (-t.amount) >= 40), nieuw: txOutlier(t, catAvg), catAvg: Math.round(a) };
    }, await idVan(page, 'Hilterman lease', CUR));
    expect(r.oud).toBe(true);                            // categoriegemiddelde ligt laag door parkeren/tanken
    expect(r.nieuw).toBe(false);
  });

  test('geen enkele isFixed-transactie wordt als outlier gevlagd', async ({ page }) => {
    await boot(page);
    const n = await page.evaluate(() => {
      const all = txForPeriod(); const sum = {}, cnt = {};
      for (const x of all) { const k = catOf(x); if (CATS[k] && CATS[k].type === 'expense') { sum[k] = (sum[k] || 0) + (-x.amount); if (x.amount < 0) cnt[k] = (cnt[k] || 0) + 1; } }
      const catAvg = {}; for (const k in sum) if (cnt[k]) catAvg[k] = sum[k] / cnt[k];
      const vast = all.filter((t) => t.amount < 0 && CATS[catOf(t)].type === 'expense' && isFixed(t));
      return { aantal: vast.length, gevlagd: vast.filter((t) => txOutlier(t, catAvg)).length };
    });
    expect(n.aantal).toBeGreaterThan(0);
    expect(n.gevlagd).toBe(0);
  });

  test('de winkel-eigen mediaan gaat vóór het categoriegemiddelde', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const H = merchHistory();
      const ah = H[recurKey({ name: 'Albert Heijn' })];                  // 400 · 400 · 300 -> mediaan 400
      // een boodschappenrun van 800 wijkt af van je eigen 400, een van 450 niet
      const mk = (amount) => ({ id: 'x', date: months().slice(-1)[0] + '-10', amount, acc: 'NL01MAIN0000001111', name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', autoCat: 'boodschappen' });
      const catAvg = { boodschappen: 30 };                                // laag categoriegemiddelde: de oude toets zou 450 flaggen
      return { n: ah.n, med: ah.med, hoog: txOutlier(mk(-800), catAvg), normaal: txOutlier(mk(-450), catAvg) };
    });
    expect(r.n).toBe(3);
    expect(r.med).toBe(400);
    expect(r.hoog).toBe(true);                                            // 800 > 400 x 1,8
    expect(r.normaal).toBe(false);                                        // 450 past bij je eigen historie
  });

  test('te weinig winkel-historie: gewoon de categorie-toets', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const H = merchHistory();
      const mk = (name, amount) => ({ id: 'y', date: months().slice(-1)[0] + '-10', amount, acc: 'NL01MAIN0000001111', name, desc: 'BEA, BETAALPAS ' + name.toUpperCase(), autoCat: 'boodschappen' });
      const nieuw = H[recurKey({ name: 'Delicatessen Nieuw' })];
      return { onbekend: nieuw ? nieuw.n : 0, gevlagd: txOutlier(mk('Delicatessen Nieuw', -500), { boodschappen: 100 }), klein: txOutlier(mk('Delicatessen Nieuw', -39), { boodschappen: 5 }) };
    });
    expect(r.onbekend).toBe(0);                                           // geen eigen historie
    expect(r.gevlagd).toBe(true);                                         // valt terug op categorie x 2,2
    expect(r.klein).toBe(false);                                          // onder de €40-vloer, zoals voorheen
  });
});

test.describe('b · koppel-aanbod bij de lease', () => {
  test('de transactie-sheet biedt koppelen aan, met het maandbedrag erbij', async ({ page }) => {
    await boot(page);
    await rij(page, await idVan(page, 'Hilterman lease', CUR)).click();
    await page.waitForSelector('#leaseOffer');
    const blok = await page.locator('#leaseOffer').innerText();
    expect(blok).toContain('Dit lijkt een auto-lease');
    expect(blok).toContain(`€${LEASE}`);
    expect(blok).toContain('aflossing');
    expect(blok).toContain('bezitting');
    expect(blok).toContain('Doe je niets');                               // geen dwang
    expect(blok).toContain('Koppelen');
    expect(blok).toContain('Niet nu');
  });

  test('"Koppelen" opent de bestaande financial-lease-invoer, voorgevuld', async ({ page }) => {
    await boot(page);
    await rij(page, await idVan(page, 'Hilterman lease', CUR)).click();
    await page.waitForSelector('#leaseOffer');
    await page.locator('#leaseLinkGo').click();
    await page.waitForSelector('#dType');
    expect(await page.locator('#dType').inputValue()).toBe('financiallease');
    expect((await page.locator('#dNaam').inputValue()).toLowerCase()).toContain('lease');
    expect(await page.locator('#dMnd').inputValue()).toBe(String(LEASE));
    await expect(page.locator('#dslotwrap')).toBeVisible();               // slottermijn + auto-velden staan open
    await expect(page.locator('#dDag')).toBeVisible();
    expect(await page.evaluate(() => (SET.debts || []).length)).toBe(0);  // nog niets opgeslagen
  });

  test('"Niet nu" laat het aanbod verdwijnen en het komt niet terug', async ({ page }) => {
    await boot(page);
    await rij(page, await idVan(page, 'Hilterman lease', CUR)).click();
    await page.waitForSelector('#leaseOffer');
    await page.locator('#leaseLinkNo').click();
    await page.waitForTimeout(150);
    expect(await page.locator('#leaseOffer').count()).toBe(0);
    expect(await page.locator('#sheet').innerText()).toContain('Kies categorie');   // de rest blijft staan
    expect(await page.evaluate(() => Object.keys(SET.leaseLinkOff || {}).length)).toBe(1);

    await page.evaluate(() => closeSheet());
    await rij(page, await idVan(page, 'Hilterman lease', CUR)).click();
    await page.waitForSelector('#sheet .catgrid');
    expect(await page.locator('#leaseOffer').count()).toBe(0);            // ook bij opnieuw openen
    expect(await page.evaluate((id) => leaseLinkOffer(TX.find((t) => t.id === id)), await idVan(page, 'Hilterman lease', CUR))).toBeNull();
  });

  test('geen aanbod bij een losse lease-betaling of een niet-lease vaste last', async ({ page }) => {
    await boot(page, seedLease({ dubbeleLease: false }));                 // lease alleen in M2/M1... maar niet deze maand
    const r = await page.evaluate((ids) => ({
      losse: leaseLinkOffer(TX.find((t) => t.id === ids.tank)),           // geen lease-omschrijving
      huur: leaseLinkOffer(TX.find((t) => t.id === ids.huur)),            // vaste last, maar geen lease
    }), { tank: await idVan(page, 'Shell Station', CUR), huur: await idVan(page, 'Woningcorporatie', M1) });
    expect(r.losse).toBeNull();
    expect(r.huur).toBeNull();
  });
});

test.describe('c · na koppeling doet de bestaande machinerie het werk', () => {
  test('debtInExpenses herkent de termijn en de auto telt mee in netWorth', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((per) => {
      const voor = netWorth().netto;
      SET.debts = [{ id: 'lease1', naam: 'Hilterman Lease', type: 'financiallease', start: 18000, rest: 9000,
        perMaand: per, rente: 6, autoBezit: true, dagwaarde: 16000, afschr: 18 }];
      save();
      const d = SET.debts[0];
      return { voor, na: netWorth().netto, inExp: debtInExpenses(d), leaseAuto: leaseAutoTotal(),
               schulden: netWorth().sch, aanbod: leaseLinkOffer(TX.find((t) => t.name === 'Hilterman lease')) };
    }, LEASE);

    expect(r.inExp.status).toBe('in-uitgaven');                           // de maandtermijn wordt teruggevonden
    expect(r.inExp.bedrag).toBe(LEASE);
    expect(r.leaseAuto).toBe(16000);                                      // auto als bezitting
    expect(r.schulden).toBeGreaterThanOrEqual(9000);                      // restschuld als schuld
    expect(r.na).toBe(r.voor + 16000 - 9000);                             // netto = auto − restschuld
    expect(r.aanbod).toBeNull();                                          // gekoppeld: geen aanbod meer
  });

  test('zonder koppeling verandert er niets aan de cijfers', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate((id) => {
      const t = TX.find((x) => x.id === id);
      return { cat: catOf(t), spend: totals(t.date.slice(0, 7)).spend, byCat: totals(t.date.slice(0, 7)).byCat.vervoer,
               debts: (SET.debts || []).length, leaseAuto: leaseAutoTotal() };
    }, await idVan(page, 'Hilterman lease', CUR));
    expect(r.cat).toBe('vervoer');
    expect(r.debts).toBe(0);
    expect(r.leaseAuto).toBe(0);
    expect(Math.round(-r.byCat)).toBeGreaterThanOrEqual(LEASE);           // telt gewoon als vervoer-uitgave
  });
});

test('d · het aanbod past op 360px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await boot(page);
  await rij(page, await idVan(page, 'Hilterman lease', CUR)).click();
  await page.waitForSelector('#leaseOffer');
  const r = await page.evaluate(() => {
    const s = document.getElementById('sheet'), o = document.getElementById('leaseOffer');
    const sb = s.getBoundingClientRect(), ob = o.getBoundingClientRect();
    return { sheet: s.scrollWidth - s.clientWidth, buiten: ob.right > sb.right + 1 || ob.left < sb.left - 1 };
  });
  expect(r.sheet).toBe(0);
  expect(r.buiten).toBe(false);
});
