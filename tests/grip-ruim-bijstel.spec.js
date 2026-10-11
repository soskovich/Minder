/* v358: TE RUIME POTJES BIJSTELLEN. "bijstellen ›" in de hint van "Ruimte in andere potjes" opent een eigen sheet
   met alleen de potjes van de hint. Per potje een voorstel op de ondergrens per maand van v350, een post die niet
   elke maand komt kan naar de reserveringen, een potje zonder betaling krijgt geen voorstel maar twee bestaande
   ingangen, en het vrije bedrag krijgt een bestemming voordat er iets wordt opgeslagen. De stand is die van de
   gebruiker (ruim-bijstel-stand.js): Verzekeringen EUR 335, gewoonlijk EUR 164, DELA EUR 160 per kwartaal met
   de volgende in december, Vices EUR 20 tegen gewoonlijk EUR 120, Huur EUR 750 zonder betaling, sparen EUR 2.200. */
const { test, expect } = require('@playwright/test');
const RB = require('./ruim-bijstel-stand');
/* v387: VERZEKERINGEN IS OP DE STAND VAN DE MELDING NIET MEER TE RUIM (EUR 324 nodig in december tegen EUR 335, test c).
   De sheet zelf blijft bestaan, dus de tests van de sheet draaien op dezelfde stand met Verzekeringen op EUR 700: dan is
   hij te ruim (EUR 324 is minder dan de helft, en EUR 700 is ruim EUR 50 meer). Alle bedragen hieronder volgen daaruit. */
const bootOrig = RB.boot;
const BUDGETS = Object.assign({}, RB.BUDGETS, { verzekering: 700 });
const boot = (page, o) => RB.boot(page, Object.assign({}, o || {}, { set: Object.assign({ budgets: Object.assign({}, BUDGETS) }, (o || {}).set || {}) }));
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
  await bootOrig(page);
  const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
    const d = recurringSchedule().find((s) => /DELA/.test(s.name));
    return { lijst: gripRuimLijst(V, Br).map((x) => x.k), dela: [d.cat, d.intervalM, d.amount, ymdVan(d.nextDate).slice(0, 7)],
      vices: V.potjes.find((x) => x.k === 'vices').aard, sparen: monthlySavingTarget(), tot: totalBudget() }; });
  /* v387: Verzekeringen staat er niet meer in: met DELA in december heeft hij EUR 324 nodig, en EUR 335 is dan EUR 11 te
     ruim, onder de EUR 50 (teRuimLijst(), keuze van de gebruiker: alleen het deel boven de verwachting van twaalf maanden). */
  expect(r).toEqual({ lijst: ['huur'], dela: ['verzekering', 3, 160, '2026-12'], vices: 'pastniet', sparen: 2200, tot: 2355 });
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

/* v387: Verzekeringen is niet meer te ruim, en dat is de regel van de gebruiker: wat hij in zijn duurste maand van de
   twaalf nodig heeft (december, Zilveren Kruis plus DELA) telt niet als te ruim. Tot v386 stond hij in deze sheet met de
   keuze om DELA naar de reserveringen te zetten. */
test('c. Verzekeringen: EUR 324 nodig in december, dus EUR 11 boven de verwachting en niet te ruim', async ({ page }) => {
  await bootOrig(page); await open(page);
  const x = await page.evaluate(() => teRuimLijst().find((y) => y.k === 'verzekering'));
  expect([x.bud, x.nodig, x.maand, x.ruim]).toEqual([335, 324, '2026-12', false]);
  expect(x.reden).toContain('Dela Natura- en levensv in december');
  expect(await page.locator('[data-ruimpot="verzekering"]').count()).toBe(0);
});

test('d. niets is voorgekozen en opslaan staat uit', async ({ page }) => {
  await boot(page); await open(page);
  const r = await page.evaluate(() => ({ on: document.querySelectorAll('#ruimBijstel .chip.on').length, vanaf: document.querySelector('[data-ruimvanaf]').value,
    uit: document.querySelector('[data-ruimsave]').disabled, best: !!document.getElementById('ruimBest') }));
  expect(r).toEqual({ on: 0, vanaf: '', uit: true, best: false });
});

/* v360: OMGEDRAAID, zoals CLAUDE.md bij v358 vastlegde: Splitsen bestaat, dus een potje zonder betaling draagt
   precies twee ingangen, "Splitsen ›" en "Ander bedrag vanaf een maand ›", en "Splitsen ›" opent de handeling
   met het bronpotje al gekozen. */
test('e. Huur zonder betaling krijgt geen voorstel, maar precies twee ingangen: Splitsen en Ander bedrag vanaf een maand', async ({ page }) => {
  await boot(page); await open(page);
  const r = await page.evaluate(() => { const e = document.querySelector('[data-ruimpot="huur"]');
    return { geen: e.hasAttribute('data-ruimgeen'), keuzes: e.querySelectorAll('[data-ruimkeuze]').length,
      links: [...e.querySelectorAll('[onclick]')].map(x => x.innerText.trim()), ander: e.querySelector('[data-ruimander]').getAttribute('onclick'),
      splits: e.querySelector('[data-ruimsplits]')?.getAttribute('onclick') || null, t: e.innerText.replace(/\s+/g, ' ') }; });
  expect(r.geen).toBe(true);
  expect(r.keuzes).toBe(0);
  expect(r.links).toEqual(['Splitsen ›', 'Ander bedrag vanaf een maand ›']);
  expect(r.splits).toBe("openSplits('huur')");
  expect(r.ander).toBe("openPotForm('huur')");
  expect(r.t).toContain('Geen betaling in juli, augustus en september');
  /* Splitsen opent de handeling met Huur als bronpotje, en schrijft niets */
  const voor = await page.evaluate(() => JSON.stringify([SET.budgets, SET.budgetsNext || {}, SET.budgetPlan || {}]));
  await page.click('[data-ruimpot="huur"] [data-ruimsplits]');
  const s = await page.evaluate(() => ({ bron: document.getElementById('splits')?.dataset.bron, kop: document.querySelector('#splits').innerText.split('\n')[0],
    blijft: +document.getElementById('splitBlijft').dataset.splitblijft }));
  expect(s).toEqual({ bron: 'huur', kop: 'Huur splitsen', blijft: 750 });
  expect(await page.evaluate(() => JSON.stringify([SET.budgets, SET.budgetsNext || {}, SET.budgetPlan || {}]))).toBe(voor);
  /* en de tweede ingang blijft het bestaande formulier */
  await page.evaluate(() => openRuimBijstel());
  await page.click('[data-ruimpot="huur"] [data-ruimander]');
  expect(await tekst(page, '#potForm')).toContain('Huur: bedrag vanaf een maand');
});

test('f. opslaan staat uit tot de vrije ruimte verdeeld is, en de schrijver eist dat zelf ook', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'res');
  await page.selectOption('[data-ruimvanaf]', '2026-11');
  expect(await tekst(page, '#ruimVrij')).toBe('€530 komt vrij. Waar gaat het heen?');
  const uit = () => page.evaluate(() => document.querySelector('[data-ruimsave]').disabled);
  expect(await uit()).toBe(true);
  expect(await tekst(page, '#ruimOpen')).toBe('Nog te verdelen: €530');
  await vul(page, 'pot:vices', 100);
  expect(await uit()).toBe(true);
  expect(await tekst(page, '#ruimOpen')).toBe('Nog te verdelen: €430');
  await vul(page, 'sparen', 445);
  expect(await uit()).toBe(true);
  expect(await tekst(page, '#ruimOpen')).toBe('€15 meer verdeeld dan er vrijkomt');
  const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
  await page.evaluate(() => ruimBijstelZet());
  expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  await vul(page, 'sparen', 430);
  expect(await tekst(page, '#ruimOpen')).toBe('Alles heeft een plek.');
  expect(await uit()).toBe(false);
  // nog steeds niets geschreven
  expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
});

test('g. zonder potjekeuze of zonder maand geen opslag', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'voorstel');
  await vul(page, 'verlagen', 376);
  expect(await page.evaluate(() => [ruimBijstelData().klaar, document.querySelector('[data-ruimsave]').disabled])).toEqual([false, true]);
  await page.selectOption('[data-ruimvanaf]', '2026-11');
  expect(await page.evaluate(() => [ruimBijstelData().klaar, document.querySelector('[data-ruimsave]').disabled])).toEqual([true, false]);
});

test('h. het gevolg vooraf, en na bijstellen: potjes vanaf november, DELA in de reserveringen, sparen, maandbudget, afspraak', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'res');
  await page.selectOption('[data-ruimvanaf]', '2026-11');
  await vul(page, 'pot:vices', 100); await vul(page, 'sparen', 430);
  expect(await tekst(page, '#ruimGevolg')).toBe('Vanaf november 2026: Verzekeringen €700 → €170 '
    + 'Dela Natura- en levensv €160 per kwartaal in je reserveringen, eerste termijn december 2026; telt niet meer in nog te betalen '
    + 'Verzekeringen draagt Dela Natura- en levensv dan niet meer: €170 is je gewone maand zonder die post, die alleen nog in je reserveringen staat '   // v360
    + 'Vices €20 → €120 Sparen €2.200 → €2.630 per maand '
    + 'Je maandbudget gaat van €2.720 naar €2.290. Eerdere maanden veranderen niet. Een potje dat lager gaat wordt een afspraak.');
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
  expect(r.spaarPlan).toEqual({ '2026-11': 430 });
  expect(r.sparenNu).toBe(2200);
  expect(r.nov).toBe(2290);
  expect(r.afspraak).toEqual([['potje', 'verzekering', 170, '2026-11']]);
  expect(r.open).toBe(false);
});

test('i. het voorstel zonder verplaatsen: potje EUR 324, geen reservering, het rest naar een lager maandbudget', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'voorstel');
  await page.selectOption('[data-ruimvanaf]', '2026-12');
  expect(await tekst(page, '#ruimVrij')).toBe('€376 komt vrij. Waar gaat het heen?');
  await page.click('[data-ruimbest="verlagen"] span[onclick]');   // "de rest"
  await page.click('[data-ruimsave]');
  const r = await page.evaluate(() => ({ plan: SET.budgetPlan, next: SET.budgetsNext, res: resLijst().length, excl: Object.keys(SET.fixDueExcl || {}).length,
    dec: Object.values(budgetVoorMaand('2026-12')).reduce((a, b) => a + b, 0), nov: Object.values(budgetVoorMaand('2026-11')).reduce((a, b) => a + b, 0) }));
  expect(r.plan).toEqual({ '2026-12': { verzekering: 324 } });
  expect(r.res).toBe(0);
  expect(r.excl).toBe(0);
  expect(r.dec).toBe(2344);
  expect(r.nov).toBe(2720);   // eerdere maanden blijven
});

test('j. vanaf deze maand: het potje en sparen gaan nu in', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'res');
  await page.selectOption('[data-ruimvanaf]', '2026-10');
  await page.click('[data-ruimbest="sparen"] span[onclick]');
  await page.click('[data-ruimsave]');
  const r = await page.evaluate(() => ({ b: SET.budgets.verzekering, sav: [SET.savingMode, SET.savingAmount], plan: SET.spaarPlan || null,
    res: resLijst().map((x) => x.vervalmaand) }));
  expect(r).toEqual({ b: 170, sav: ['amount', 2730], plan: null, res: ['2026-12'] });
});

test('k. een eigen bedrag onder december zegt dat; boven het potje kan niet', async ({ page }) => {
  await boot(page); await open(page);
  await kies(page, 'verzekering', 'eigen');
  await page.fill('[data-ruimeigen="verzekering"]', '200');
  expect(await tekst(page, '[data-ruimonder="verzekering"]')).toBe('Lager dan €324: in december is het potje dan niet gedekt.');
  expect(await tekst(page, '#ruimVrij')).toBe('€500 komt vrij. Waar gaat het heen?');
  await page.fill('[data-ruimeigen="verzekering"]', '800');
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
  await vul(page, 'verlagen', 530);
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
    await vul(page, 'pot:vices', 100); await vul(page, 'sparen', 430);
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
