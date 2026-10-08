/* v358: TE RUIME POTJES BIJSTELLEN. "bijstellen ›" in de hint van "Ruimte in andere potjes" opent een eigen sheet
   met alleen de potjes van de hint. Per potje een voorstel op de ondergrens per maand van v350, een post die niet
   elke maand komt kan naar de reserveringen, een potje zonder betaling krijgt geen voorstel maar twee bestaande
   ingangen, en het vrije bedrag krijgt een bestemming voordat er iets wordt opgeslagen. De stand is die van de
   gebruiker (ruim-bijstel-stand.js): Verzekeringen EUR 335, gewoonlijk EUR 164, DELA EUR 160 per kwartaal met
   de volgende in december, Vices EUR 20 tegen gewoonlijk EUR 120, Huur EUR 750 zonder betaling, sparen EUR 2.200. */
const { test, expect } = require('@playwright/test');
const { boot, BUDGETS } = require('./ruim-bijstel-stand');
const { kaalUit } = require('./bron-kaal');

async function open(page) {
  await page.evaluate(() => { go('maand'); openGripRest(); });
  await page.click('[data-ruimer]');
}
const tekst = (page, sel) => page.evaluate((s) => { const e = document.querySelector(s); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; }, sel);
const kies = (page, k, v) => page.click(`[data-ruimpot="${k}"] [data-ruimkeuze="${v}"]`);
async function vul(page, id, v) {
  const sel = `[data-ruimbest="${id}"] input`;
  await page.fill(sel, String(v));
}

test('a. de invoer draagt het geval: DELA per kwartaal in december, Vices past niet, Huur zonder betaling', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
    const d = recurringSchedule().find((s) => /DELA/.test(s.name));
    return { lijst: gripRuimLijst(V, Br).map((x) => x.k), dela: [d.cat, d.intervalM, d.amount, ymdVan(d.nextDate).slice(0, 7)],
      vices: V.potjes.find((x) => x.k === 'vices').aard, sparen: monthlySavingTarget(), tot: totalBudget() }; });
  expect(r).toEqual({ lijst: ['huur', 'verzekering'], dela: ['verzekering', 3, 160, '2026-12'], vices: 'pastniet', sparen: 2200, tot: 2355 });
});

test('b. bijstellen opent de sheet en niet de budgeteditor, met alleen de potjes van de hint; openen schrijft niets', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { go('maand'); openGripRest(); });   // Grip openen schrijft maandGelezen; dat is niet deze sheet
  const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
  await page.click('[data-ruimer]');
  const r = await page.evaluate(() => ({ editor: !!document.getElementById('budgetSheetHead'),
    titel: document.querySelector('#ruimBijstel').firstElementChild.innerText,
    pots: [...document.querySelectorAll('[data-ruimpot]')].map((e) => e.dataset.ruimpot),
    hint: (() => { const V = maandVooruit(); return gripRuimLijst(V, dezeMaandBrug(V)).map((x) => x.k); })() }));
  expect(r.editor).toBe(false);
  expect(r.titel).toBe('Te ruime potjes bijstellen');
  expect(r.pots).toEqual(r.hint);
  expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
});

test('c. Verzekeringen: gewoonlijk EUR 164, het voorstel zonder verplaatsen dekt december, met DELA naar de reserveringen de gewone maand plus marge', async ({ page }) => {
  await boot(page); await open(page);
  const rij = await tekst(page, '[data-ruimpot="verzekering"]');
  expect(rij).toContain('€335');
  expect(rij).toContain('gewoonlijk €164 per maand (Zilveren Kruis)');
  expect(await tekst(page, '[data-ruimpot="verzekering"] [data-ruimpost]'))
    .toBe('In december komt Dela Natura- en levensv, €160 per kwartaal. Verlaag je het potje naar €170, dan is december niet gedekt.');
  const r = await page.evaluate(() => { const P = ruimBijstelData(), p = P.pots.find((x) => x.k === 'verzekering');
    return { opties: p.opties, vloer: p.vloer, gewoon: p.gewoon, maand: p.vloerMaand }; });
  // de ondergrens van december is de gewone maand plus DELA
  expect(r).toEqual({ opties: { voorstel: 324, res: 170 }, vloer: 324, gewoon: 164, maand: '2026-12' });
  expect(r.opties.voorstel).toBeGreaterThanOrEqual(164 + 160);
  expect(r.opties.res).toBeGreaterThan(r.gewoon);
  expect(r.opties.res % 10).toBe(0);
  const chips = await page.evaluate(() => [...document.querySelectorAll('[data-ruimpot="verzekering"] [data-ruimkeuze]')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  expect(chips).toEqual(['Dela Natura- en levensv naar reserveringen, potje €170', 'Potje €324', 'Zelf een bedrag', 'Laten']);
});

test('d. niets is voorgekozen en opslaan staat uit', async ({ page }) => {
  await boot(page); await open(page);
  const r = await page.evaluate(() => ({ on: document.querySelectorAll('#ruimBijstel .chip.on').length, vanaf: document.querySelector('[data-ruimvanaf]').value,
    uit: document.querySelector('[data-ruimsave]').disabled, best: !!document.getElementById('ruimBest') }));
  expect(r).toEqual({ on: 0, vanaf: '', uit: true, best: false });
});

test('e. Huur zonder betaling krijgt geen voorstel maar de verwijzing naar splitsen en ander bedrag', async ({ page }) => {
  await boot(page); await open(page);
  const r = await page.evaluate(() => { const e = document.querySelector('[data-ruimpot="huur"]');
    return { geen: e.hasAttribute('data-ruimgeen'), keuzes: e.querySelectorAll('[data-ruimkeuze]').length,
      splits: e.querySelector('[data-ruimsplits]').getAttribute('onclick'), ander: e.querySelector('[data-ruimander]').getAttribute('onclick'),
      t: e.innerText.replace(/\s+/g, ' ') }; });
  expect(r.geen).toBe(true);
  expect(r.keuzes).toBe(0);
  expect(r.splits).toBe('openPotForm()');
  expect(r.ander).toBe("openPotForm('huur')");
  expect(r.t).toContain('Geen betaling in juli, augustus en september');
  await page.click('[data-ruimpot="huur"] [data-ruimander]');
  expect(await tekst(page, '#potForm')).toContain('Huur: bedrag vanaf een maand');
});

test('f. opslaan staat uit tot de vrije ruimte verdeeld is, en de schrijver eist dat zelf ook', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'res');
  await page.selectOption('[data-ruimvanaf]', '2026-11');
  expect(await tekst(page, '#ruimVrij')).toBe('€165 komt vrij. Waar gaat het heen?');
  const uit = () => page.evaluate(() => document.querySelector('[data-ruimsave]').disabled);
  expect(await uit()).toBe(true);
  expect(await tekst(page, '#ruimOpen')).toBe('Nog te verdelen: €165');
  await vul(page, 'pot:vices', 100);
  expect(await uit()).toBe(true);
  expect(await tekst(page, '#ruimOpen')).toBe('Nog te verdelen: €65');
  await vul(page, 'sparen', 80);
  expect(await uit()).toBe(true);
  expect(await tekst(page, '#ruimOpen')).toBe('€15 meer verdeeld dan er vrijkomt');
  const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
  await page.evaluate(() => ruimBijstelZet());
  expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  await vul(page, 'sparen', 65);
  expect(await tekst(page, '#ruimOpen')).toBe('Alles heeft een plek.');
  expect(await uit()).toBe(false);
  // nog steeds niets geschreven
  expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
});

test('g. zonder potjekeuze of zonder maand geen opslag', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'voorstel');
  await vul(page, 'verlagen', 11);
  expect(await page.evaluate(() => [ruimBijstelData().klaar, document.querySelector('[data-ruimsave]').disabled])).toEqual([false, true]);
  await page.selectOption('[data-ruimvanaf]', '2026-11');
  expect(await page.evaluate(() => [ruimBijstelData().klaar, document.querySelector('[data-ruimsave]').disabled])).toEqual([true, false]);
});

test('h. het gevolg vooraf, en na bijstellen: potjes vanaf november, DELA in de reserveringen, sparen, maandbudget, afspraak', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'res');
  await page.selectOption('[data-ruimvanaf]', '2026-11');
  await vul(page, 'pot:vices', 100); await vul(page, 'sparen', 65);
  expect(await tekst(page, '#ruimGevolg')).toBe('Vanaf november 2026: Verzekeringen €335 → €170 '
    + 'Dela Natura- en levensv €160 per kwartaal in je reserveringen, eerste termijn december 2026; telt niet meer in nog te betalen '
    + 'Vices €20 → €120 Sparen €2.200 → €2.265 per maand '
    + 'Je maandbudget gaat van €2.355 naar €2.290. Eerdere maanden veranderen niet. Een potje dat lager gaat wordt een afspraak.');
  await page.click('[data-ruimsave]');
  const r = await page.evaluate(() => { const d = recurringSchedule().find((s) => /DELA/.test(s.name));
    const res = resLijst().find((x) => x.bron === d.key);
    return { budgets: SET.budgets, next: SET.budgetsNext, res: res && [res.bedrag, res.intervalM, res.vervalmaand, res.cat], excl: !!(SET.fixDueExcl || {})[d.key],
      spaarPlan: SET.spaarPlan, sparenNu: monthlySavingTarget(), nov: Object.values(budgetVoorMaand('2026-11')).reduce((a, b) => a + b, 0),
      afspraak: (SET.afspraken || []).map((a) => [a.soort, a.cat, a.bedrag, a.van]), open: document.getElementById('sheetBg').classList.contains('show') }; });
  expect(r.budgets).toEqual(BUDGETS);   // deze maand verandert niets
  expect(r.next).toEqual({ verzekering: 170, vices: 120 });
  expect(r.res).toEqual([160, 3, '2026-12', 'verzekering']);
  expect(r.excl).toBe(true);
  expect(r.spaarPlan).toEqual({ '2026-11': 65 });
  expect(r.sparenNu).toBe(2200);
  expect(r.nov).toBe(2290);
  expect(r.afspraak).toEqual([['potje', 'verzekering', 170, '2026-11']]);
  expect(r.open).toBe(false);
});

test('i. het voorstel zonder verplaatsen: potje EUR 324, geen reservering, het rest naar een lager maandbudget', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'voorstel');
  await page.selectOption('[data-ruimvanaf]', '2026-12');
  expect(await tekst(page, '#ruimVrij')).toBe('€11 komt vrij. Waar gaat het heen?');
  await page.click('[data-ruimbest="verlagen"] span[onclick]');   // "de rest"
  await page.click('[data-ruimsave]');
  const r = await page.evaluate(() => ({ plan: SET.budgetPlan, next: SET.budgetsNext, res: resLijst().length, excl: Object.keys(SET.fixDueExcl || {}).length,
    dec: Object.values(budgetVoorMaand('2026-12')).reduce((a, b) => a + b, 0), nov: Object.values(budgetVoorMaand('2026-11')).reduce((a, b) => a + b, 0) }));
  expect(r.plan).toEqual({ '2026-12': { verzekering: 324 } });
  expect(r.res).toBe(0);
  expect(r.excl).toBe(0);
  expect(r.dec).toBe(2344);
  expect(r.nov).toBe(2355);   // eerdere maanden blijven
});

test('j. vanaf deze maand: het potje en sparen gaan nu in', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'res');
  await page.selectOption('[data-ruimvanaf]', '2026-10');
  await page.click('[data-ruimbest="sparen"] span[onclick]');
  await page.click('[data-ruimsave]');
  const r = await page.evaluate(() => ({ b: SET.budgets.verzekering, sav: [SET.savingMode, SET.savingAmount], plan: SET.spaarPlan || null,
    res: resLijst().map((x) => x.vervalmaand) }));
  expect(r).toEqual({ b: 170, sav: ['amount', 2365], plan: null, res: ['2026-12'] });
});

test('k. een eigen bedrag onder december zegt dat; boven het potje kan niet', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'eigen');
  await page.fill('[data-ruimeigen="verzekering"]', '200');
  expect(await tekst(page, '[data-ruimonder="verzekering"]')).toBe('Lager dan €324: in december is het potje dan niet gedekt.');
  expect(await tekst(page, '#ruimVrij')).toBe('€135 komt vrij. Waar gaat het heen?');
  await page.fill('[data-ruimeigen="verzekering"]', '400');
  expect(await page.evaluate(() => { const p = ruimBijstelData().pots.find((x) => x.k === 'verzekering'); return [p.ok, p.vrij]; })).toEqual([false, 0]);
});

test('l. een spaarverhoging vanaf een latere maand gaat in bij de maandwissel', async ({ page }) => {
  await boot(page, { dag: '2026-11-03', set: { spaarPlan: { '2026-11': 65 } } });
  expect(await page.evaluate(() => [SET.savingMode, SET.savingAmount, SET.spaarPlan, SET.budgetMonth])).toEqual(['amount', 2265, {}, '2026-11']);
});

test('m. de schrijver leest opnieuw: verandert het potje na het kiezen, dan sluit de verdeling niet meer en wordt er niets geschreven', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'res');
  await page.selectOption('[data-ruimvanaf]', '2026-11');
  await vul(page, 'verlagen', 165);
  await page.evaluate(() => { SET.budgetsNext = { verzekering: 400 }; save(); });
  await page.evaluate(() => ruimBijstelZet());
  expect(await page.evaluate(() => [SET.budgetsNext, resLijst().length])).toEqual([{ verzekering: 400 }, 0]);
});

for (const w of [360, 390]) {
  test(`n. hoogte en overloop op ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await boot(page); await open(page);
    const a = await page.evaluate(() => Math.round(document.getElementById('ruimBijstel').getBoundingClientRect().height));
    await kies(page, 'verzekering', 'res');
    await page.selectOption('[data-ruimvanaf]', '2026-11');
    await vul(page, 'pot:vices', 100); await vul(page, 'sparen', 65);
    const r = await page.evaluate(() => { const s = document.getElementById('ruimBijstel'), b = s.getBoundingClientRect();
      const uit = [...s.querySelectorAll('*')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > b.right + 0.5 || r.left < b.left - 0.5); }).map((e) => e.tagName + (e.className ? '.' + e.className : ''));
      return { h: Math.round(b.height), uit, chips: Math.round(s.querySelector('[data-ruimpot="verzekering"] .chips').getBoundingClientRect().height) }; });
    console.log(`v358 ${w}px: sheet ${a} -> ${r.h}, chips ${r.chips}`);
    expect(r.uit).toEqual([]);
    expect(a).toBeLessThan(650);
    expect(r.h).toBeLessThan(1150);
  });
}

test('o. bron: de hint en de sheet lezen dezelfde lijst, en bijstellen opent de budgeteditor niet', async ({ page }) => {
  await boot(page);
  const src = await kaalUit(page, 'gripRuimerBijstel', 'renderGripRest', 'ruimBijstelData');
  expect(src).not.toContain('openBudgetEditor');
  expect(src.match(/gripRuimLijst\(/g).length).toBe(2);
  expect(src).not.toContain('filter(potRuimer)');
});

test('p. de eerste termijn in de reserveringen valt op of na de gekozen maand: vanaf januari is dat maart', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'res');
  await page.selectOption('[data-ruimvanaf]', '2027-01');
  expect(await tekst(page, '#ruimGevolg')).toContain('eerste termijn maart 2027');
  await page.click('[data-ruimbest="verlagen"] span[onclick]');
  await page.click('[data-ruimsave]');
  expect(await page.evaluate(() => resLijst().map((x) => x.vervalmaand))).toEqual(['2027-03']);
});
