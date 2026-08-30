// v118: gemeld — de N26-koppeling herkent alle rekeningen, maar sommige potjes tonen hun juiste
// naam en andere geen naam, terwijl elk potje in N26 een naam heeft. Dit read-only blokje in
// Instellingen ▸ Bankkoppeling & import laat per rekening zien wát de app toont, wáár die naam
// vandaan komt en welke naam de koppeling zelf heeft opgeslagen. acctNaam() is daarvoor de enige
// bron: acctNiceName() is nu exact acctNaam().naam, zodat de diagnose het scherm niet kan
// tegenspreken. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);

// Vier N26-rekeningen die samen alle naamgevings-uitkomsten dekken:
//  6222  psd2, IBAN, staat in de vaste tabel      -> 'Main'
//  4323  psd2, IBAN, staat in de vaste tabel      -> 'Spaarpot'
//  9911  psd2, IBAN, staat er NIET in, geen tx    -> 'Space ··9911'
//  psd2_zz  psd2, geen IBAN, geen tx              -> 'Space ··2'  (de 2 komt uit "psd2")
//  N26 Vakantiepot  csv  -> 'Space ··26'  (de 26 komt uit "N26")
//  N26 Autokosten   csv  -> 'Space ··26'  ook, dus twee rekeningen met dezelfde naam
const ACC = { main: '6222', spaar: '4323', space: '9911', geenIban: 'psd2_zz', csv: 'N26 Vakantiepot', csv2: 'N26 Autokosten' };

function seedBank({ acctNames } = {}) {
  const tx = [
    { id: 't1', date: `${CUR}-05`, amount: 3000, acc: ACC.main, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'psd2', refNums: [] },
    { id: 't2', date: `${CUR}-06`, amount: -40, acc: ACC.main, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'psd2', refNums: [] },
    { id: 't3', date: `${CUR}-07`, amount: 200, acc: ACC.spaar, name: 'Spaarpot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'psd2', refNums: [] },
    { id: 't4', date: `${CUR}-08`, amount: 50, acc: ACC.csv, accName: 'Vakantiepot', name: 'Vakantiepot', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', refNums: [] },
    { id: 't5', date: `${CUR}-09`, amount: 30, acc: ACC.csv2, accName: 'Autokosten', name: 'Autokosten', desc: 'NAAR SPAREN', typ: '', ref: '', src: 'csv', refNums: [] },
  ];
  const set = {
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000, setOpen: 'bank',
    psd2Accounts: {
      [ACC.main]:     { uid: 'u1', iban: 'NL01N260 0000 6222', label: 'Main Account ··6222', bank: 'N26' },
      [ACC.spaar]:    { uid: 'u4', iban: 'NL01N260 0000 4323', label: 'Spaarpot ··4323', bank: 'N26' },
      [ACC.space]:    { uid: 'u2', iban: 'NL01N260 0000 9911', label: 'Vakantie ··9911', bank: 'N26' },
      [ACC.geenIban]: { uid: 'zz', iban: '', label: 'Nieuwe wasmachine', bank: 'N26' },
    },
  };
  if (acctNames) set.acctNames = acctNames;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([ACC.main, ACC.spaar, ACC.csv, ACC.csv2]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seedBank());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof acctNaam === 'function');
}

const openBlok = async (page) => {
  await page.evaluate(() => { go('set'); openSet('bank'); bankDiagToggle(); });
  await page.waitForSelector('#sheet >> text=van de koppeling');
};
const rijen = (page) => page.evaluate(() => bankDiagRows());

test.describe('a · acctNaam is de enige bron', () => {
  test('acctNiceName is exact acctNaam().naam, voor elke rekening', async ({ page }) => {
    await boot(page);
    const gelijk = await page.evaluate(() =>
      [...new Set([...OWN, ...Object.keys(SET.psd2Accounts || {})])]
        .every((a) => acctNiceName(a) === acctNaam(a).naam));
    expect(gelijk).toBe(true);
  });

  test('elke uitkomst draagt de bron die hem opleverde', async ({ page }) => {
    await boot(page);
    const per = await page.evaluate((A) => {
      const uit = {};
      for (const k in A) uit[k] = acctNaam(A[k]);
      return uit;
    }, ACC);
    expect(per.main).toEqual({ naam: 'Main', bron: 'vaste tabel in de app' });
    expect(per.spaar).toEqual({ naam: 'Spaarpot', bron: 'vaste tabel in de app' });
    expect(per.space).toEqual({ naam: 'Space ··9911', bron: 'terugval op de laatste cijfers' });
    // zonder IBAN worden de cijfers uit de id geschraapt — "psd2" levert er zelf al één
    expect(per.geenIban).toEqual({ naam: 'Space ··2', bron: 'terugval op de laatste cijfers' });
    // een CSV-potje heeft de naam letterlijk in zijn id staan, maar acctLast4 schraapt daar de
    // cijfers uit "N26" uit — dus elk CSV-potje heet hetzelfde
    expect(per.csv).toEqual({ naam: 'Space ··26', bron: 'terugval op de laatste cijfers' });
    expect(per.csv2).toEqual(per.csv);
  });

  test('een eigen naam wint van alles', async ({ page }) => {
    await boot(page, seedBank({ acctNames: { 6222: 'Mijn hoofdrekening' } }));
    expect(await page.evaluate((a) => acctNaam(a), ACC.main))
      .toEqual({ naam: 'Mijn hoofdrekening', bron: 'eigen naam' });
  });
});

test.describe('b · wat het blokje toont', () => {
  test('ook rekeningen zonder transacties staan erin', async ({ page }) => {
    await boot(page);
    const r = await rijen(page);
    expect(r.map((x) => x.a).sort()).toEqual(Object.values(ACC).sort());
    const zonder = r.find((x) => x.a === ACC.space);
    expect(zonder.tx).toBe(0);                            // staat niet in OWN, wél in psd2Accounts
    expect(zonder.opgeslagen).toBe('Vakantie ··9911');    // de naam is er wél, hij wordt niet gebruikt
    expect(zonder.toont).toBe('Space ··9911');
  });

  test('de naam van de koppeling staat naast wat de app toont', async ({ page }) => {
    await boot(page);
    await openBlok(page);
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('Vakantie ··9911');          // opgeslagen naam
    expect(t).toContain('Space ··9911');             // wat de app ervan maakt
    expect(t).toContain('Nieuwe wasmachine');
    expect(t).toContain('bron: vaste tabel in de app');
    expect(t).toContain('Space ··26');
  });

  test('de samenvatting telt de gevallen op', async ({ page }) => {
    await boot(page);
    await openBlok(page);
    const t = await page.locator('#sheet').innerText();
    expect(t).toMatch(/2 rekeningen krijgen de naam uit een vaste tabel/);
    expect(t).toMatch(/4 rekeningen tonen alleen "Space ··cijfers"/);
    expect(t).toMatch(/2 rekeningen hebben geen transacties/);
    expect(t).toMatch(/2× "Space ··26"/);                      // duplicaat wordt gemeld
    expect(t).toContain('spaarrekening-schakelaar');
  });
});

test.describe('c · read-only en ingeklapt', () => {
  test('standaard ingeklapt, en openen wijzigt geen enkele rekening', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('set'); openSet('bank'); });
    expect(await page.locator('#sheet').innerText()).toContain('Waarom heet een rekening zo?');
    expect(await page.locator('#sheet').innerText()).not.toContain('van de koppeling');

    const staat = () => page.evaluate(() => JSON.stringify({ ps: SET.psd2Accounts, meta: ACCMETA, own: OWN, an: SET.acctNames || null }));
    const voor = await staat();
    await page.locator('#sheet >> text=Waarom heet een rekening zo?').click();
    await page.waitForSelector('#sheet >> text=van de koppeling');
    expect(await staat()).toBe(voor);
  });

  test('de keuze blijft staan en is weer dicht te klappen', async ({ page }) => {
    await boot(page);
    await openBlok(page);
    expect(await page.evaluate(() => SET.bankDiag)).toBe(true);
    await page.locator('#sheet >> text=Naamdiagnose verbergen').click();
    expect(await page.evaluate(() => SET.bankDiag)).toBe(false);
    expect(await page.locator('#sheet').innerText()).not.toContain('van de koppeling');
  });

  test('de kopieertekst bevat dezelfde regels als het scherm', async ({ page }) => {
    await boot(page);
    const txt = await page.evaluate(() => bankDiagText());
    const r = await rijen(page);
    expect(txt.split('\n').length).toBe(r.length);
    expect(txt).toContain('bron: terugval op de laatste cijfers');
    expect(txt).toContain('van de koppeling: Nieuwe wasmachine');
    expect(txt).toContain('IBAN: nee');
  });
});

test.describe('d · layout', () => {
  for (const w of [360, 390]) {
    // De bank-sheet loopt met meerdere rekeningen al horizontaal over vóórdat dit blok bestaat:
    // de rij in accountsCard() met de spaarrekening-schakelaar past niet (sw 392 bij cw 356 op
    // 390px). Dat is een aparte, bestaande kwestie. Wat hier telt is dat dit blok er niets aan
    // toevoegt en zelf binnen de sheet blijft.
    test(`het blok verbreedt de sheet niet op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page);
      await page.evaluate(() => { go('set'); openSet('bank'); });
      const dicht = await page.evaluate(() => { const el = document.querySelector('#sheet'); return el.scrollWidth - el.clientWidth; });
      await openBlok(page);
      const uit = await page.evaluate(() => {
        const el = document.querySelector('#sheet');
        const cw = el.clientWidth;
        const knop = [...el.querySelectorAll('.snz')].find((n) => /Naamdiagnose/.test(n.textContent));
        const eigen = [];
        for (let n = knop.nextElementSibling; n; n = n.nextElementSibling) eigen.push(n);
        return { over: el.scrollWidth - cw, teBreed: eigen.filter((n) => n.scrollWidth > cw).length, rijen: eigen.length };
      });
      expect(uit.rijen).toBeGreaterThan(0);
      expect(uit.over).toBe(dicht);        // het blok voegt geen enkele pixel overloop toe
      expect(uit.teBreed).toBe(0);         // en geen enkel eigen element is breder dan de sheet
    });
  }
});
