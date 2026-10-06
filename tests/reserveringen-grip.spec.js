// v344: de kaart Reserveringen op Plan is weg, en het maandbedrag van de dekking is netto van de pot.
// (1) Plan droeg een kaart die de tegel en de sheet op Grip dubbelde, en Plan rekende er niet mee. De
//     tegel en de dekkingsregel hangen er niet van af, elke ingang opent openReserveringen(), en een
//     lege lijst heeft een grijze tegel "instellen" op Grip.
// (2) Pot EUR 299 en een boete van EUR 299 in november zei "gedekt tot en met november" EN "EUR 299 per
//     maand nodig". Gedekt is nu gedekt, zonder maandbedrag, en de tegel zegt "gedekt t/m november".
const { test, expect } = require('@playwright/test');
const { kaalUit } = require('./bron-kaal');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const over = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const MFULL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
const mnd = (n) => MFULL[new Date(now.getFullYear(), now.getMonth() + n, 1).getMonth()];
const MAIN = 'NL01MAIN0000001111';
const RES = 'NL01RESV0000002222';

function seed(pot, res, set = {}) {
  const tx = [
    { id: 'i1', date: `${CUR}-01`, amount: 3000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] },
    { id: 'r1', date: `${CUR}-01`, amount: 20, acc: RES, name: 'Eigen rekening', desc: 'RESERVERINGEN', typ: '', ref: '', src: 'csv', accName: 'Res', refNums: [] },
  ];
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      savingMode: 'amount', savingAmount: 300,
      manualBal: { [MAIN]: 2000, [RES]: pot },
      resAcc: RES, reserveringen: res,
    }, set)),
    minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
const BOETE = [{ id: 'b', naam: 'Boete', bedrag: 299, vervalmaand: over(1), intervalM: 0, cat: '' }];

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof dekking === 'function');
}
const sheetTekst = (page) => page.evaluate(() => document.querySelector('#sheet').innerText.replace(/\s+/g, ' '));
const tegel = (page) => page.evaluate(() => { go('maand'); const e = document.querySelector('[data-tegel="dekking"]'); return e ? { tekst: e.innerText.replace(/\s+/g, ' ').trim(), kleur: e.dataset.kleur } : null; });

test.describe('1 · de kaart op Plan is weg', () => {
  test('Plan draagt geen reserveringen meer, met en zonder lijst', async ({ page }) => {
    await boot(page, seed(299, BOETE));
    const t = await page.evaluate(() => { go('vooruit'); return document.querySelector('#s-vooruit').innerText; });
    expect(t).not.toContain('Reserveringen');
    expect(await page.evaluate(() => typeof resDekkingCard)).toBe('undefined');
    const leeg = await page.evaluate(() => { SET.reserveringen = []; save(); go('vooruit'); return document.querySelector('#s-vooruit').innerText; });
    expect(leeg).not.toContain('Reserveringen');
  });

  test('de tegel en de dekkingsregel staan op Grip zonder de kaart', async ({ page }) => {
    await boot(page, seed(299, BOETE));
    expect(await tegel(page)).not.toBeNull();
    const r = await page.evaluate(() => maandRegels().find((x) => x.key === 'dekking'));
    expect(r).toMatchObject({ status: 'ok', act: 'openReserveringen()' });
  });

  test('elke ingang naar de lijst opent de sheet en geen enkele gaat naar Plan', async ({ page }) => {
    await boot(page, seed(37, BOETE));
    const src = await kaalUit(page, 'maandRegels', 'gripTegels', 'gripTijdlijn', 'renderVooruit');
    expect(src).not.toMatch(/resDekkingCard/);
    // de link "Dekking reserveringen aanpassen" in de sheet van de regel opent de lijst
    await page.evaluate(() => { go('maand'); });
    await page.click('[data-tegel="dekking"]');
    const link = page.locator('#sheet').getByText(/aanpassen/).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.locator('#resHead')).toBeVisible();
  });

  test('toevoegen en aanpassen kan volledig via de sheet', async ({ page }) => {
    await boot(page, seed(299, []));
    await page.evaluate(() => openReserveringen());
    await page.locator('#sheet').getByText('+ Verplichting toevoegen').click();
    const editor = await page.evaluate(() => document.querySelector('#sheet').innerHTML);
    expect(editor).toMatch(/saveReservering\(/);
    // een post via de bestaande schrijver, en daarna terug in de lijst aanpassen
    await page.evaluate((m) => { SET.reserveringen = [{ id: 'x', naam: 'Tandarts', bedrag: 150, vervalmaand: m, intervalM: 0 }]; save(); openReserveringen(); }, over(2));
    expect(await sheetTekst(page)).toContain('Tandarts');
    await page.locator('#sheet').getByText('Tandarts').click();
    expect(await page.evaluate(() => document.querySelector('#sheet').innerHTML)).toMatch(/saveReservering\(/);
  });

  test('een lege lijst heeft een grijze tegel die de sheet opent', async ({ page }) => {
    await boot(page, seed(299, []));
    const t = await tegel(page);
    expect(t).toMatchObject({ kleur: 'grijs' });
    expect(t.tekst).toContain('instellen');
    await page.click('[data-tegel="dekking"]');
    await expect(page.locator('#resHead')).toBeVisible();
    // de terugval "te weinig ingesteld" zegt niet meer dat er geen tegels zijn terwijl er een staat
    const g = await page.evaluate(() => { go('maand'); return { t: document.querySelector('#s-maand').innerText,
      n: document.querySelectorAll('#s-maand [data-tegel]').length }; });
    expect(g.n).toBe(1);                                    // invoer: de instel-tegel is de enige
    expect(g.t).not.toContain('om tegels te tonen');
    expect(g.t).toContain('Er is nog te weinig ingesteld.'); // en de terugval staat er nog
  });

  test('met een lijst staat de grijze tegel er niet naast de echte', async ({ page }) => {
    await boot(page, seed(299, BOETE));
    const n = await page.evaluate(() => { go('maand'); return document.querySelectorAll('[data-tegel="dekking"]').length; });
    expect(n).toBe(1);
    expect((await tegel(page)).tekst).not.toContain('instellen');
  });

  test('de controlevraag over de lijst staat in de sheet en "klopt nog" schrijft de maand', async ({ page }) => {
    await boot(page, seed(299, BOETE));
    await page.evaluate(() => openReserveringen());
    await expect(page.locator('[data-rescheck]')).toBeVisible();
    await page.locator('[data-rescheck]').getByText('klopt nog').click();
    expect(await page.evaluate(() => SET.resCheck === thisYM())).toBe(true);
    await expect(page.locator('#resHead')).toBeVisible();
    await expect(page.locator('[data-rescheck]')).toHaveCount(0);
  });
});

test.describe('2 · gedekt is gedekt, zonder maandbedrag', () => {
  test('meting: de oude EUR 299 is de bruto som, die de pot negeert', async ({ page }) => {
    await boot(page, seed(299, BOETE));
    const D = await page.evaluate(() => dekking(12));
    expect(D.benodigdPerMaand).toBe(299);   // 299 / max(offset 1, 1): de pot doet niet mee
    expect(D.gat).toBeNull();
    expect(D.nodigPerMaand).toBe(0);
  });

  test('pot 299, boete 299: de sheet noemt geen maandbedrag en de tegel zegt gedekt t/m', async ({ page }) => {
    await boot(page, seed(299, BOETE));
    await page.evaluate(() => openReserveringen());
    const s = await sheetTekst(page);
    expect(s).toContain(`Je bent gedekt tot en met ${mnd(1)}`);
    expect(s).toContain('Er is niets meer nodig tot de volgende post.');
    expect(s).not.toMatch(/per maand nodig/);
    const rij = await page.evaluate(() => document.querySelector('[data-resnodig]').innerText.replace(/\s+/g, ' '));
    expect(rij).toBe('Nog nodig per maand niets tot de volgende post');
    const t = await tegel(page);
    expect(t.tekst).toBe(`Reserveringen €299 gedekt t/m ${mnd(1)}`);
    expect(t.tekst).not.toContain('nodig');
  });

  test('een pot boven de som blijft gedekt, een euro eronder is een gat', async ({ page }) => {
    await boot(page, seed(300, BOETE));
    expect(await page.evaluate(() => dekking(12).nodigPerMaand)).toBe(0);
    await boot(page, seed(298, BOETE));
    const D = await page.evaluate(() => dekking(12));
    expect(D.gat).not.toBeNull();
    expect(D.nodigPerMaand).toBe(1);   // ceil(1 / 2): november, oktober meegeteld
  });

  test('een gat: de sheet en de regel zeggen hetzelfde, netto, zonder de bruto som', async ({ page }) => {
    await boot(page, seed(37, BOETE));
    const D = await page.evaluate(() => dekking(12));
    expect(D.nodigPerMaand).toBe(131);
    const r = await page.evaluate(() => maandRegels().find((x) => x.key === 'dekking'));
    expect(r.gevolg).toContain('Dat is €131 per maand tot');
    expect(r.gevolg).not.toContain('€299 per maand');
    expect(r.gevolg.match(/per maand/g).length).toBe(1);   // geen tweede zin bij gelijk bedrag
    await page.evaluate(() => openReserveringen());
    const s = await sheetTekst(page);
    expect(s).toContain(r.gevolg);
    const rij = await page.evaluate(() => document.querySelector('[data-resnodig]').innerText.replace(/\s+/g, ' '));
    expect(rij).toBe('Nog nodig per maand €131');
  });

  test('vragen de posten na het gat meer, dan noemt de zin ook het jaarbedrag', async ({ page }) => {
    // gat in november (37 tegen 299), en in maand +3 nog 900: (299+900-37) / 4 = 291 > 131
    const res = BOETE.concat([{ id: 'c', naam: 'Aanslag', bedrag: 900, vervalmaand: over(3), intervalM: 0 }]);
    await boot(page, seed(37, res));
    const D = await page.evaluate(() => dekking(12));
    expect(D.nodigPerMaand).toBe(Math.ceil((299 + 900 - 37) / 4));
    const r = await page.evaluate(() => maandRegels().find((x) => x.key === 'dekking'));
    expect(r.gevolg).toContain('Dat is €131 per maand tot');
    expect(r.gevolg).toContain(`Voor alles wat er dit jaar nog aankomt heb je €${D.nodigPerMaand} per maand nodig.`);
  });

  test('een gedekte eerste post met een gat later: de eis komt uit dat latere gat', async ({ page }) => {
    // pot 400 dekt de boete (299) maar niet ook de 900 in maand +3: (1199-400)/4 = 200
    const res = BOETE.concat([{ id: 'c', naam: 'Aanslag', bedrag: 900, vervalmaand: over(3), intervalM: 0 }]);
    await boot(page, seed(400, res));
    const D = await page.evaluate(() => dekking(12));
    expect(D.nodigPerMaand).toBe(200);
    expect(D.gat.maand).toBe(over(3));
  });

  test('het hoogste voorkomen beslist, niet het laatste', async ({ page }) => {
    // pot 0: 600 in maand +1 vraagt 300 per maand, 100 in maand +5 daarna (700/6) maar 117
    await boot(page, seed(0, [{ id: 'x', naam: 'Groot', bedrag: 600, vervalmaand: over(1), intervalM: 0 },
      { id: 'y', naam: 'Klein', bedrag: 100, vervalmaand: over(5), intervalM: 0 }]));
    expect(await page.evaluate(() => dekking(12).nodigPerMaand)).toBe(300);
  });

  test('onbekend saldo: geen netto bedrag, en de rij zegt onbekend', async ({ page }) => {
    const p = seed(299, BOETE); const S = JSON.parse(p.minder_set); delete S.manualBal[RES]; p.minder_set = JSON.stringify(S);
    await boot(page, p);
    expect(await page.evaluate(() => dekking(12).nodigPerMaand)).toBeNull();
    await page.evaluate(() => openReserveringen());
    const rij = await page.evaluate(() => document.querySelector('[data-resnodig]').innerText.replace(/\s+/g, ' '));
    expect(rij).toBe('Nog nodig per maand onbekend');
  });

  test('een gat deze maand zonder latere post: de rij noemt het tekort van nu', async ({ page }) => {
    await boot(page, seed(100, [{ id: 'n', naam: 'Nu', bedrag: 299, vervalmaand: CUR, intervalM: 0 }]));
    const D = await page.evaluate(() => dekking(12));
    expect(D.nodigPerMaand).toBe(0);
    await page.evaluate(() => openReserveringen());
    const rij = await page.evaluate(() => document.querySelector('[data-resnodig]').innerText.replace(/\s+/g, ' '));
    expect(rij).toBe('Nog nodig per maand €199 deze maand');
  });
});

test.describe('3 · layout', () => {
  for (const w of [360, 390]) {
    test(`de sheet en de tegels lopen niet over op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 740 });
      await boot(page, seed(299, BOETE));
      const t = await page.evaluate(() => { go('maand'); const e = document.querySelector('[data-tegel="dekking"]'); return { sw: e.scrollWidth, cw: e.clientWidth }; });
      expect(t.sw).toBeLessThanOrEqual(t.cw);
      await page.evaluate(() => openReserveringen());
      const o = await page.evaluate(() => { const s = document.querySelector('#sheet'); return { sw: s.scrollWidth, cw: s.clientWidth }; });
      expect(o.sw).toBeLessThanOrEqual(o.cw);
    });
  }
});

/* v345: de tekst zonder reserveringsrekening en de coach-suggestie lezen de ene netto som
   (resNodigPerMaand); de bruto som houdt alleen de projectie als lezer. */
test.describe('4 · een bron voor nog nodig per maand', () => {
  const zonderRek = (pot, res) => { const p = seed(pot, res); const S = JSON.parse(p.minder_set); delete S.resAcc; p.minder_set = JSON.stringify(S); return p; };
  test('zonder rekening: de boete van 299 over een maand vraagt 150 en niet 299', async ({ page }) => {
    await boot(page, zonderRek(299, BOETE));
    const r = await page.evaluate(() => { const D = dekking(12); return { t: dekkingTekst(D), bruto: D.benodigdPerMaand, leeg: D.nodigZonderPot }; });
    expect(r.bruto).toBe(299);                          // invoer: de oude som
    expect(r.leeg).toBe(150);                           // ceil(299 / 2), deze maand meegeteld
    expect(r.t).toContain('Met een lege pot heb je voor wat er dit jaar nog aankomt €150 per maand nodig');
    expect(r.t).not.toContain('€299 per maand');
  });
  test('zonder rekening: een jaarpremie over een maand vraagt de helft, niet het hele bedrag per maand', async ({ page }) => {
    await boot(page, zonderRek(0, [{ id: 'j', naam: 'Premie', bedrag: 1200, vervalmaand: over(1), intervalM: 12 }]));
    const r = await page.evaluate(() => { const D = dekking(12); return { t: dekkingTekst(D), leeg: D.nodigZonderPot }; });
    expect(r.leeg).toBe(600);
    expect(r.t).toContain('€600 per maand');
  });
  test('zonder rekening en zonder post in het venster: geen bedrag', async ({ page }) => {
    await boot(page, zonderRek(0, [{ id: 'v', naam: 'Ver', bedrag: 500, vervalmaand: over(14), intervalM: 0 }]));
    const t = await page.evaluate(() => dekkingTekst(dekking(12)));
    expect(t).toContain('Er komt de komende twaalf maanden niets aan');
    expect(t).not.toMatch(/€\d/);
  });
  test('de twee netto sommen komen uit dezelfde functie, met de stand en met nul', async ({ page }) => {
    await boot(page, seed(37, BOETE));
    const r = await page.evaluate(() => { const D = dekking(12); const V = verplichtingen(12);
      return { n: D.nodigPerMaand, z: D.nodigZonderPot, fn: resNodigPerMaand(V, 37), f0: resNodigPerMaand(V, 0) }; });
    expect(r).toEqual({ n: 131, z: 150, fn: 131, f0: 150 });
    const src = await kaalUit(page, 'dekking', 'maandSuggestie', 'dekkingTekst');
    expect((src.match(/resNodigPerMaand\(/g) || []).length).toBe(2);   // de twee lezers in dekking()
    expect(src).not.toMatch(/Math\.ceil\(Math\.max\(som/);              // geen tweede kopie van de som
  });
  test('de coach-suggestie noemt de bruto som niet meer', async ({ page }) => {
    await boot(page, seed(100, [{ id: 'n', naam: 'Nu', bedrag: 299, vervalmaand: CUR, intervalM: 0 }]));
    const r = await page.evaluate(() => { const R = maandRegels().find((x) => x.key === 'dekking'); return { st: R.status, s: maandSuggestie(R, thisYM()) }; });
    expect(r.st).toBe('tekort');                        // invoer: alleen een tekort draagt een suggestie
    expect(r.s).toBe('€199 erbij brengt je pot op de stand die er nu bij hoort.');
  });
});
