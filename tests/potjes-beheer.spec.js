/* v351: POTJES AANMAKEN, VANAF EEN MAAND, ARCHIVEREN, KANDIDATEN VERPLAATSEN.
   Fixture: de stand van 6 oktober 2026 (deze-maand-stand.js) met Huur op EUR 750, zoals op het toestel.
   - Een nieuw potje met dekking uit een ander potje houdt het maandtotaal gelijk.
   - Met een verhoging stijgt het totaal, en de app toont eerst het gevolg voor veilig te besteden en Plan.
   - Een gearchiveerd potje verdwijnt uit het budget, en september (bewaard in budgetHist) blijft gelijk.
   - Niets is voorgekozen, en openen of kiezen schrijft niets. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand.js');

const BUD = { huur: 750, verzekering: 675, abonnement: 100, sport: 600, vices: 50, boodschappen: 500 };
const HIST = { '2026-09': Object.assign({}, BUD) };
const opt = (o) => Object.assign({ set: Object.assign({ budgets: Object.assign({}, BUD), budgetHist: JSON.parse(JSON.stringify(HIST)) }, (o && o.set) || {}) }, o && o.dag ? { dag: o.dag } : {}, o && o.extraTx ? { extraTx: o.extraTx } : {});
const opslag = (page) => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map((k) => [k, localStorage.getItem(k)])));
const som = (B) => Object.values(B).reduce((s, v) => s + (+v || 0), 0);

test.describe('nieuw potje met dekking', () => {
  test('niets voorgekozen, openen en kiezen schrijven niets, en het totaal blijft gelijk', async ({ page }) => {
    await boot(page, opt());
    const voor = await opslag(page);
    await page.evaluate(() => openPotForm());
    await expect(page.locator('#potForm')).toBeVisible();
    expect(await page.locator('#potForm .chip.on').count()).toBe(0);
    await expect(page.locator('[data-potformsave]')).toBeDisabled();
    await page.click('[data-potcat="_nieuw"]');
    await page.fill('#potFormNaam', 'Kinderen');
    await page.click('[data-potaard="wisselend"]');
    await page.fill('#potFormBedrag', '100');
    await page.selectOption('#potFormVanaf', '2026-11');
    await expect(page.locator('[data-potbron]')).toHaveCount(2);
    expect(await page.locator('[data-potbron].on').count()).toBe(0);
    await expect(page.locator('[data-potformsave]')).toBeDisabled();
    await page.click('[data-potbron="dek"]');
    expect(await page.locator('[data-potdek]').count()).toBeGreaterThan(0);
    await expect(page.locator('[data-potformsave]')).toBeDisabled();
    // huur kan niet dekken: zijn ondergrens is de incasso van 1.450
    expect(await page.locator('[data-potdek="huur"]').count()).toBe(0);
    await page.click('[data-potdek="sport"]');
    await expect(page.locator('[data-potgevolg]')).toContainText('levert Sport & gezondheid');
    expect(await opslag(page)).toBe(voor);
    const tot0 = await page.evaluate(() => Object.values(budgetVoorMaand('2026-11')).reduce((s, v) => s + v, 0));
    await page.click('[data-potformsave]');
    const r = await page.evaluate(() => ({ B: budgetVoorMaand('2026-11'), nu: Object.assign({}, SET.budgets), E: SET.eigenCats, cat: Object.keys(SET.eigenCats)[0] }));
    expect(r.E[r.cat]).toMatchObject({ naam: 'Kinderen', aard: 'wisselend' });
    expect(r.B[r.cat]).toBe(100);
    expect(r.B.sport).toBe(500);
    expect(som(r.B)).toBe(tot0);
    expect(r.nu.sport).toBe(600);            // deze maand verandert niets
    expect(r.nu[r.cat]).toBeUndefined();
    await expect(page.locator('#catKandidaten')).toBeVisible();   // kandidaten na het aanmaken
  });
  test('de schrijver eist de dekking zelf, ook buiten het formulier om', async ({ page }) => {
    await boot(page, opt());
    const r = await page.evaluate(() => { window._potForm = { cat: '_nieuw', naam: 'Kinderen', aard: 'wisselend', bedrag: '100', vanaf: '2026-11', bron: 'dek', dek: null };
      potFormZet(); return { E: SET.eigenCats || {}, N: SET.budgetsNext || {} }; });
    expect(Object.keys(r.E).length).toBe(0);
    expect(Object.keys(r.N).length).toBe(0);
  });
  test('een eigen categorie overleeft het herladen, draagt haar aard en is te hernoemen', async ({ page }) => {
    await boot(page, opt());
    await page.evaluate(() => { const k = eigenCatMaak('Alimentatie', 'vast'); potPlanZet(k, '2026-11', 400); save(); });
    // herladen: de fixture zet localStorage opnieuw bij een reload, dus de lezer van de opslag wordt hier zelf aangeroepen
    const r = await page.evaluate(() => { for (const x of Object.keys(CATS)) if (CATS[x].eigen) delete CATS[x]; load(); const k = Object.keys(SET.eigenCats)[0]; const v = { naam: CATS[k] && CATS[k].name, vast: isFixedCat(k), next: SET.budgetsNext[k] };
      v.dubbel = eigenCatHernoem(k, 'Huur'); v.ok = eigenCatHernoem(k, 'Kinderalimentatie'); v.na = CATS[k].name; return v; });
    expect(r).toMatchObject({ naam: 'Alimentatie', vast: true, next: 400, dubbel: false, ok: true, na: 'Kinderalimentatie' });
  });
});

test.describe('verhoging van het maandbudget', () => {
  test('toont eerst het gevolg voor veilig te besteden en Plan, en het totaal stijgt', async ({ page }) => {
    await boot(page, opt());
    const voor = await opslag(page);
    const m = await page.evaluate(() => ({ safe: Math.round(safeToSpend().safe), cap: planCapacity(), tot: totalBudget() }));
    await page.evaluate(() => openPotForm());
    await page.click('[data-potcat="_nieuw"]');
    await page.fill('#potFormNaam', 'Kinderen');
    await page.click('[data-potaard="wisselend"]');
    await page.fill('#potFormBedrag', '200');
    await page.selectOption('#potFormVanaf', '2026-10');
    await page.click('[data-potbron="verhoog"]');
    const g = await page.locator('[data-potgevolg]').innerText();
    expect(g).toContain(`van € ${m.tot.toLocaleString('nl-NL')}`.replace('€ ', '€'));
    expect(g).toContain('Veilig te besteden gaat deze maand van');
    expect(g).toContain('Plan blijft');
    expect(await opslag(page)).toBe(voor);
    const sim = await page.evaluate(() => potVerhoogGevolg(potFormVoorstel()));
    expect(sim.safe0).toBe(m.safe);
    expect(sim.safe1).toBe(m.safe - 200);
    expect(sim.cap1).toBe(m.cap);
    await page.click('[data-potformsave]');
    const na = await page.evaluate(() => ({ tot: totalBudget(), safe: Math.round(safeToSpend().safe) }));
    expect(na.tot).toBe(m.tot + 200);
    expect(na.safe).toBe(m.safe - 200);
  });
  test('vanaf een latere maand verandert veilig te besteden deze maand niet, en het plan schuift door', async ({ page }) => {
    await boot(page, opt());
    await page.evaluate(() => { window._potForm = { cat: '_nieuw', naam: 'Kinderen', aard: 'wisselend', bedrag: '150', vanaf: '2027-01', bron: 'verhoog' }; renderPotForm(); showSheetBg(); });
    await expect(page.locator('[data-potgevolg]')).toContainText('Veilig te besteden verandert deze maand niet');
    await page.click('[data-potformsave]');
    const r = await page.evaluate(() => { const k = Object.keys(SET.eigenCats)[0]; return { k, P: SET.budgetPlan, nov: budgetVoorMaand('2026-11')[k], jan: budgetVoorMaand('2027-01')[k] }; });
    expect(r.P['2027-01'][r.k]).toBe(150);
    expect(r.nov).toBeUndefined();
    expect(r.jan).toBe(150);
  });
});

test.describe('archiveren', () => {
  test('het potje verdwijnt uit het budget en september blijft gelijk', async ({ page }) => {
    await boot(page, opt());
    const voor = await page.evaluate(() => ({ sep: JSON.stringify(maandPotjes('2026-09')), staaf: JSON.stringify(maandStaaf('2026-09')), brug: JSON.stringify(maandBrug('2026-09', 'budget')), tot: totalBudget() }));
    await page.evaluate(() => openPotArchief('vices'));
    await expect(page.locator('[data-archsave]')).toBeDisabled();
    expect(await page.locator('#potArchief .chip.on').count()).toBe(0);
    await page.click('[data-archmaand="2026-10"]');
    await expect(page.locator('[data-archgevolg]')).toContainText('September en eerdere maanden blijven');
    await page.click('[data-archsave]');
    const na = await page.evaluate(() => ({ sep: JSON.stringify(maandPotjes('2026-09')), staaf: JSON.stringify(maandStaaf('2026-09')), brug: JSON.stringify(maandBrug('2026-09', 'budget')), tot: totalBudget(), v: SET.budgets.vices, gr: (SET.budgetAdv = true, openBudgetEditor(), document.querySelector('#sheet').innerText), kies: (openSheet(TX.find((t) => catOf(t) === 'boodschappen').id), [...document.querySelectorAll('.catpick')].map((e) => e.innerText).join('|')) }));
    expect(na.gr).toContain('Boodschappen');
    expect(na.gr).not.toContain('Vices');
    expect(na.kies).not.toContain('Vices');
    expect(na.v).toBeUndefined();
    expect(na.tot).toBe(voor.tot - 50);
    expect(na.sep).toBe(voor.sep);
    expect(na.staaf).toBe(voor.staaf);
    expect(na.brug).toBe(voor.brug);
  });
  test('een boeking die daarna in de categorie landt, vraagt waar hij heen moet', async ({ page }) => {
    await boot(page, opt({ extraTx: [{ id: 'vic10', date: '2026-10-05', amount: -20, name: 'Coffeeshop', desc: 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING' }] }));
    await page.evaluate(() => potArchiveer('vices', '2026-10'));
    const r = await page.evaluate(() => ({ L: potArchiefTx().map((t) => t.date + ' ' + t.amount), op: gripLetOpItems([], [], []).filter((x) => x.soort === 'archief').length }));
    expect(r.L).toEqual(['2026-10-05 -20']);
    expect(r.op).toBe(1);
    await page.evaluate(() => openPotArchiefWerk());
    await page.click('[data-archieftx]');
    await page.click('.catpick:has-text("Uit eten")');
    await expect(page.locator('#potArchiefWerk')).toHaveCount(0);   // lijst leeg, dus dicht
    expect(await page.evaluate(() => [catOf(TX.find((t) => t.date === '2026-10-05' && t.amount === -20)), potArchiefTx().length])).toEqual(['uiteten', 0]);
  });
});

test.describe('huur omlaag vanaf een gekozen maand', () => {
  test('nu op nul: de vooruitblik en de verwachte incasso staan in het gevolg, eerdere maanden niet', async ({ page }) => {
    await boot(page, opt());
    await page.evaluate(() => openPotForm('huur'));
    await page.fill('#potFormBedrag', '0');
    await page.selectOption('#potFormVanaf', '2026-10');
    const g = await page.locator('[data-potgevolg]').innerText();
    expect(g).toContain('van €750 naar €0');
    expect(await page.locator('[data-potbron]').count()).toBe(0);   // lager vraagt geen dekking
    /* v362: wat vrijkomt krijgt eerst een bestemming; zonder keuze blijft Vastzetten uit. */
    await expect(page.locator('#pfVrij')).toHaveText('€750 per maand komt vrij vanaf oktober 2026. Waar gaat het heen?');
    await expect(page.locator('[data-potformsave]')).toBeDisabled();
    await page.click('[data-pfbest="verlagen"] span[onclick]');   // "de rest"
    await expect(page.locator('[data-potvooruit]')).toContainText('boven budget');
    await expect(page.locator('[data-potincasso]')).toContainText('1.450');
    await page.click('[data-potformsave]');
    const r = await page.evaluate(() => ({ h: SET.budgets.huur, sep: maandPotjes('2026-09').B.huur, V: maandVooruit() }));
    expect(r.h).toBeUndefined();
    expect(r.sep).toBe(750);
    expect(r.V.budget).toBe(1925);
    expect(r.V.projectie).toBe(2672);
  });
  test('een geplande maand gaat bij de maandwissel in, ook over een overgeslagen maand', async ({ page }) => {
    await boot(page, Object.assign(opt({ set: { budgetMonth: '2026-10', budgetsNext: { huur: 0 }, budgetPlan: { '2026-12': { huur: 300 }, '2027-01': { huur: 350 } } } }), { dag: '2026-12-03' }));
    const r = await page.evaluate(() => ({ B: SET.budgets.huur, N: SET.budgetsNext.huur, P: SET.budgetPlan, H: SET.budgetHist['2026-10'].huur, m: SET.budgetMonth }));
    expect(r).toEqual({ B: 300, N: 350, P: {}, H: 750, m: '2026-12' });
  });
});

test.describe('kandidaten verplaatsen', () => {
  test('de lijst staat er eerst, niets is aangevinkt, en pas Verplaatsen zet de categorie', async ({ page }) => {
    await boot(page, opt({ extraTx: [
      { id: 'toy1', date: '2026-09-12', amount: -45, name: 'TOP 1 TOYS', desc: 'BEA, BETAALPAS TOP 1 TOYS ALKMAAR' },
      { id: 'toy2', date: '2026-08-02', amount: -30, name: 'TOP 1 TOYS', desc: 'BEA, BETAALPAS TOP 1 TOYS ALKMAAR' },
      { id: 'kad1', date: '2026-09-14', amount: -60, name: 'Kaasboer', desc: 'BEA, BETAALPAS KAASBOER' } ] }));
    const k = await page.evaluate(() => { const k = eigenCatMaak('Kinderen', 'wisselend'); save(); openCatKandidaten(k, true); return k; });
    const voor = await opslag(page);
    await expect(page.locator('[data-kandgroep]')).toHaveCount(1);
    await expect(page.locator('[data-kandgroep]')).toContainText('2 boekingen');
    expect(await page.locator('#catKandidaten input[type=checkbox]:checked').count()).toBe(0);
    await expect(page.locator('[data-kandsave]')).toBeDisabled();
    await page.fill('#catKandZoek', 'kaasb');
    await expect(page.locator('[data-kandgroep]')).toHaveCount(2);
    await page.locator('[data-kandgroep]', { hasText: 'Top 1 Toys' }).locator('input').check();
    await expect(page.locator('[data-kandgevolg]')).toContainText('2 boekingen');
    expect(await opslag(page)).toBe(voor);
    await page.click('[data-kandsave]');
    const r = await page.evaluate((k) => [['2026-09-12', -45], ['2026-08-02', -30], ['2026-09-14', -60]].map(([d, a]) => catOf(TX.find((t) => t.date === d && t.amount === a)) === k), k);
    expect(r).toEqual([true, true, false]);
  });
});

test.describe('een potje zonder bedrag: nog niet vastgesteld', () => {
  test('niets voorgekozen, het telt niet mee in het budget, en staat wel in de lijst', async ({ page }) => {
    await boot(page, opt());
    const m = await page.evaluate(() => ({ tot: totalBudget(), safe: Math.round(safeToSpend().safe), V: maandVooruit().budget }));
    const voor = await opslag(page);
    await page.evaluate(() => openPotForm());
    await page.click('[data-potcat="_nieuw"]');
    await page.fill('#potFormNaam', 'Alimentatie');
    await page.click('[data-potaard="vast"]');
    expect(await page.locator('[data-potopen].on').count()).toBe(0);
    await page.click('[data-potopen]');
    await expect(page.locator('#potFormBedrag')).toHaveCount(0);
    await expect(page.locator('[data-potres]')).toHaveCount(2);
    expect(await page.locator('[data-potres].on').count()).toBe(0);
    await expect(page.locator('[data-potformsave]')).toBeDisabled();
    await expect(page.locator('[data-potgevolg]')).toContainText('nog niet vastgesteld');
    await expect(page.locator('[data-potgevolg]')).toContainText(`blijft €${m.tot.toLocaleString('nl-NL')}`);
    expect(await opslag(page)).toBe(voor);
    await page.click('[data-potres="nee"]');
    await expect(page.locator('[data-potformsave]')).toBeEnabled();
    await page.click('[data-potformsave]');
    const r = await page.evaluate(() => { const k = Object.keys(SET.eigenCats)[0]; return { k, open: potIsOpen(k), lijst: potOpenLijst(), B: SET.budgets[k], N: (SET.budgetsNext || {})[k], tot: totalBudget(), safe: Math.round(safeToSpend().safe), V: maandVooruit().budget, res: resLijst().length, vast: isFixedCat(k) }; });
    expect(r).toMatchObject({ open: true, lijst: [r.k], tot: m.tot, safe: m.safe, V: m.V, res: 0, vast: true });
    expect(r.B).toBeUndefined();
    expect(r.N).toBeUndefined();
    // in de lijst: de verdeling, de budgeteditor en de sheet van het potje
    const L = await page.evaluate((k) => { openPotjesVerdeling(thisYM()); const a = document.querySelector(`[data-verdopen="${k}"]`); const at = a ? a.innerText : '';
      SET.budgetAdv = true; openBudgetEditor(); const g = document.querySelector('#sheet').innerText;
      openPotje(k); const p = document.querySelector('[data-potopenstand]'); return { at, g, p: p ? p.innerText : '' }; }, r.k);
    expect(L.at).toContain('nog niet vastgesteld');
    expect(L.g).toMatch(/Alimentatie[^\n]*nog niet vastgesteld/);
    expect(L.p).toContain('Nog niet vastgesteld');
  });
  test('een boeking die binnenkomt laat Grip om een bedrag vragen, en een bedrag sluit dat', async ({ page }) => {
    await boot(page, opt());
    const k = await page.evaluate(() => { const k = eigenCatMaak('Alimentatie', 'vast'); SET.potOpen = { [k]: { op: '2026-10-02' } }; save(); return k; });
    expect(await page.evaluate(() => gripLetOpItems([], [], []).filter((x) => x.soort === 'potopen').length)).toBe(0);
    // een oude boeking (voor het aanmaken) vraagt niets; een nieuwe wel
    await page.evaluate((k) => { TX.push({ id: 'al0', acc: 'NL01', date: '2026-09-20', amount: -300, name: 'LBIO', desc: 'LBIO ALIMENTATIE SEP', src: 'mt940', autoCat: 'overig', ruleCat: 'overig' });
      TX.push({ id: 'al1', acc: 'NL01', date: '2026-10-04', amount: -350, name: 'LBIO', desc: 'LBIO ALIMENTATIE OKT', src: 'mt940', autoCat: 'overig', ruleCat: 'overig' });
      OVR.al0 = k; OVR.al1 = k; save(); }, k);
    const it = await page.evaluate(() => gripLetOpItems([], [], []).filter((x) => x.soort === 'potopen'));
    expect(it.length).toBe(1);
    expect(it[0].sub).toContain('1 boeking binnen, €350');
    expect(it[0].act).toBe(`openPotForm('${k}')`);
    // het bedrag gaat langs dezelfde dekkingsregel; daarna is het potje vastgesteld en zwijgt de vraag
    await page.evaluate((k) => { window._potForm = { cat: k, vast: true, bedrag: '350', vanaf: '2026-11', bron: 'dek', dek: 'sport' }; renderPotForm(); showSheetBg(); }, k);
    await expect(page.locator('#potForm')).toContainText('Nu nog niet vastgesteld');
    await page.click('[data-potformsave]');
    const r = await page.evaluate((k) => ({ open: potIsOpen(k), n: budgetVoorMaand('2026-11')[k], sp: budgetVoorMaand('2026-11').sport, vraag: gripLetOpItems([], [], []).filter((x) => x.soort === 'potopen').length, flag: (SET.potOpen || {})[k] }), k);
    expect(r).toMatchObject({ open: false, n: 350, sp: 250, vraag: 0 });
    expect(r.flag).toBeUndefined();
  });
  test('de schatting als reservering: niets voorgekozen, een gewone verplichting met de gekozen maand', async ({ page }) => {
    await boot(page, opt());
    const tot = await page.evaluate(() => totalBudget());
    await page.evaluate(() => openPotForm());
    await page.click('[data-potcat="_nieuw"]');
    await page.fill('#potFormNaam', 'Alimentatie');
    await page.click('[data-potaard="vast"]');
    await page.click('[data-potopen]');
    await page.click('[data-potres="ja"]');
    await expect(page.locator('[data-potformsave]')).toBeDisabled();
    await page.fill('#potFormSchat', '350');
    await expect(page.locator('[data-potformsave]')).toBeDisabled();
    await page.selectOption('#potFormResMaand', '2026-11');
    await expect(page.locator('[data-potresgevolg]')).toContainText('€350 per maand vanaf november 2026');
    const voor = await page.evaluate(() => resLijst().length);
    expect(voor).toBe(0);
    await page.click('[data-potformsave]');
    const r = await page.evaluate(() => { const k = Object.keys(SET.eigenCats)[0]; return { k, R: resLijst(), tot: totalBudget(), V: verplichtingen(12).filter((x) => x.naam && /Alimentatie/.test(x.naam)).length }; });
    expect(r.R.length).toBe(1);
    expect(r.R[0]).toMatchObject({ naam: 'Alimentatie (schatting)', bedrag: 350, vervalmaand: '2026-11', intervalM: 1, cat: r.k, bron: 'pot:' + r.k });
    expect(r.tot).toBe(tot);
    expect(r.V).toBeGreaterThan(0);
    // komt er later een bedrag, dan noemt het formulier de schatting met een route om hem weg te halen
    await page.evaluate((k) => { closeSheet(); window._potForm = { cat: k, vast: true, bedrag: '400', vanaf: '2026-11', bron: 'verhoog' }; renderPotForm(); showSheetBg(); }, r.k);
    await expect(page.locator('[data-potresoud]')).toContainText('€350 staat nog in je reserveringen');
  });
  for (const w of [360, 390]) test(`het formulier met schatting loopt niet over op ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await boot(page, opt());
    await page.evaluate(() => { window._potForm = { cat: '_nieuw', naam: 'Alimentatie', aard: 'vast', open: true, res: 'ja', schat: '350', resMaand: '2026-11' }; renderPotForm(); showSheetBg(); });
    const a = await page.evaluate(() => { const s = document.querySelector('#sheet'); return { o: s.scrollWidth - s.clientWidth, h: Math.round(document.querySelector('#potForm').getBoundingClientRect().height) }; });
    expect(a.o).toBeLessThanOrEqual(0);
    console.log(`potForm open ${w}px: ${a.h}px`);
  });
});

test.describe('maat', () => {
  for (const w of [360, 390]) test(`het formulier en de kandidatenlijst lopen niet over op ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await boot(page, opt());
    await page.evaluate(() => { window._potForm = { cat: '_nieuw', naam: 'Kinderen', aard: 'wisselend', bedrag: '100', vanaf: '2026-11', bron: 'dek' }; renderPotForm(); showSheetBg(); });
    const a = await page.evaluate(() => { const s = document.querySelector('#sheet'); return { o: s.scrollWidth - s.clientWidth, h: Math.round(document.querySelector('#potForm').getBoundingClientRect().height) }; });
    expect(a.o).toBeLessThanOrEqual(0);
    console.log(`potForm ${w}px: ${a.h}px`);
  });
});
