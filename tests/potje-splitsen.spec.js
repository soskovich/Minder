// v360: een potje splitsen, de stand "schatting", en de schatting die zich bevestigt.
const { test, expect } = require('@playwright/test');
const { boot } = require('./ruim-bijstel-stand');

/* De stand van de gebruiker (ruim-bijstel-stand.js, 6 oktober): Huur EUR 750 zonder betaling, maandbudget
   EUR 2.355. Alimentatie staat er als eigen categorie (vaste last) zonder bedrag: nog niet vastgesteld (v351).
   September draagt zijn bewaarde potjes (v309), zodat "eerdere maanden veranderen niet" iets meet. */
const SEPT = { huur: 750, verzekering: 335, boodschappen: 1100, vices: 20, uiteten: 150 };
const OPTS = (extra) => ({ set: { eigenCats: { e_alimentatie: { naam: 'Alimentatie', aard: 'vast', kleur: '#e9a3c9', op: '2026-10-01' } },
  potOpen: { e_alimentatie: { op: '2026-10-01' } }, budgetHist: { '2026-09': Object.assign({}, SEPT) } }, extraTx: extra || [] });

const veld = (page, sel, v) => page.evaluate(([sel, v]) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input')); }, [sel, v]);
const tik = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) throw new Error('niet gevonden: ' + sel); e.click(); }, sel);
const STAAT = () => JSON.stringify([SET.budgets, SET.budgetsNext || {}, SET.budgetPlan || {}, SET.potSchat || {}, SET.potOpen || {}, SET.eigenCats || {}, SET.budgetHist || {}]);

/* Huur EUR 750 vanaf oktober: Huur 350, Alimentatie 300 (schatting) en Kinderen 100 (nieuw, vastgesteld). */
async function vulIn(page) {
  await page.evaluate(() => { go('maand'); openPotje('huur'); });
  await tik(page, '[data-potsplits]');
  await tik(page, '[data-splitregel="0"] [data-splitdoel="e_alimentatie"]');
  await veld(page, '[data-splitbedrag="0"]', '300');
  await tik(page, '[data-splitregel="0"] [data-splitstand="schat"]');
  await tik(page, '[data-spliterbij]');
  await tik(page, '[data-splitregel="1"] [data-splitdoel="_nieuw"]');
  await veld(page, '[data-splitnaam="1"]', 'Kinderen');
  await tik(page, '[data-splitregel="1"] [data-splitaard="wisselend"]');
  await veld(page, '[data-splitbedrag="1"]', '100');
  await tik(page, '[data-splitregel="1"] [data-splitstand="vast"]');
  await veld(page, '[data-splitvanaf]', '2026-10');
}

test('a. de sheet van het potje draagt Splitsen, en openen en kiezen schrijven niets; niets is voorgekozen', async ({ page }) => {
  await boot(page, OPTS());
  const voor = await page.evaluate(STAAT);
  await page.evaluate(() => openPotje('huur'));
  const links = await page.evaluate(() => [...document.querySelectorAll('#sheet [data-potsplits], #sheet [data-potvanaf]')].map(e => e.innerText.trim()));
  expect(links[0]).toMatch(/^Splitsen/);
  await tik(page, '[data-potsplits]');
  const s = await page.evaluate(() => ({ on: document.querySelectorAll('#splits .chip.on').length, vanaf: document.querySelector('[data-splitvanaf]').value,
    save: document.querySelector('[data-splitsave]').disabled, doelen: [...document.querySelectorAll('[data-splitregel="0"] [data-splitdoel]')].map(e => e.dataset.splitdoel) }));
  expect(s.on).toBe(0);
  expect(s.vanaf).toBe('');
  expect(s.save).toBe(true);
  expect(s.doelen).toContain('e_alimentatie');   // een potje dat nog niet is vastgesteld kan doel zijn
  expect(s.doelen).toContain('_nieuw');
  expect(s.doelen).not.toContain('huur');
  await vulIn(page);
  expect(await page.evaluate(() => document.querySelector('[data-splitsave]').disabled)).toBe(false);
  expect(await page.evaluate(STAAT)).toBe(voor);
});

test('b. het gevolg vooraf: de potjes oud en nieuw, het maandbudget, de bridge en veilig te besteden', async ({ page }) => {
  await boot(page, OPTS());
  await vulIn(page);
  const g = await page.evaluate(() => ({ t: document.getElementById('splitGevolg').innerText.replace(/\s+/g, ' '),
    brug: document.querySelector('[data-splitbrug]')?.innerText || '', safe: document.querySelector('[data-splitsafe]')?.innerText || '',
    blijft: +document.getElementById('splitBlijft').dataset.splitblijft }));
  expect(g.blijft).toBe(350);
  expect(g.t).toContain('Huur €750 → €350');
  expect(g.t).toContain('Alimentatie nog niet vastgesteld → €300 schatting');
  expect(g.t).toContain('Kinderen nieuw → €100');
  expect(g.t).toContain('Je maandbudget blijft €2.355');
  expect(g.t).toContain('Eerdere maanden veranderen niet');
  expect(g.brug).toMatch(/Huur [−-]€750 wordt [−-]€350/);
  expect(g.brug).toContain('Alimentatie €300 als vaste last');
  expect(g.brug).toMatch(/Kinderen [−-]€100/);
  expect(g.brug).toContain('de uitkomst gaat van rond €1.028 naar rond €1.328');
  expect(g.safe).toMatch(/Veilig te besteden (blijft|gaat van)/);
  console.log('gevolg: ' + g.t);
});

test('c. bevestigen: budget gelijk, de bridge van oktober toont geen Huur −€750 meer, september onveranderd', async ({ page }) => {
  await boot(page, OPTS());
  const voor = await page.evaluate(() => { const V = maandVooruit(); return { tot: totalBudget(), sep: JSON.stringify(maandPotjes('2026-09')), staaf: JSON.stringify(maandStaaf('2026-09')),
    huur: Math.round((V.potjes.find(x => x.k === 'huur') || {}).overR) }; });
  expect(voor.huur).toBe(-750);
  await vulIn(page);
  await tik(page, '[data-splitsave]');
  const na = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V); const kin = Object.keys(CATS).find(k => CATS[k].name === 'Kinderen');
    openGripRest(); const rest = document.getElementById('gripRest')?.innerText || '';
    return { tot: totalBudget(), B: SET.budgets, kin, sep: JSON.stringify(maandPotjes('2026-09')), staaf: JSON.stringify(maandStaaf('2026-09')),
      huur: (V.potjes.find(x => x.k === 'huur') || V.vastePotjes.find(x => x.k === 'huur')), schat: SET.potSchat, open: potIsOpen('e_alimentatie'),
      stappen: Br.stappen.map(s => s.label + ' ' + s.waarde), rest }; });
  expect(na.tot).toBe(voor.tot);
  expect(na.B.huur).toBe(350);
  expect(na.B.e_alimentatie).toBe(300);
  expect(na.B[na.kin]).toBe(100);
  expect(Math.round(na.huur.eind - na.huur.bud)).toBe(-350);
  expect(na.rest).not.toContain('−€750');
  expect(na.stappen.join('|')).not.toMatch(/Huur -750/);
  expect(na.sep).toBe(voor.sep);   // september onveranderd
  expect(na.staaf).toBe(voor.staaf);
  expect(na.open).toBe(false);
  expect(na.schat.e_alimentatie).toMatchObject({ vanaf: '2026-10', bedrag: 300, bron: 'huur' });
  expect(na.schat[na.kin]).toBeUndefined();
});

test('d. het bronpotje kan niet onder nul', async ({ page }) => {
  await boot(page, OPTS());
  await vulIn(page);
  await veld(page, '[data-splitbedrag="0"]', '700');
  const r = await page.evaluate(() => ({ blijft: +document.getElementById('splitBlijft').dataset.splitblijft, onder: document.querySelector('[data-splitonder]')?.innerText || '',
    save: document.querySelector('[data-splitsave]').disabled }));
  expect(r.blijft).toBe(-50);
  expect(r.onder).toContain('kan niet onder nul');
  expect(r.save).toBe(true);
  /* en de schrijver eist het zelf ook (v238) */
  const voor = await page.evaluate(STAAT);
  await page.evaluate(() => splitZet());
  expect(await page.evaluate(STAAT)).toBe(voor);
  /* precies nul mag */
  await veld(page, '[data-splitbedrag="0"]', '650');
  expect(await page.evaluate(() => [+document.getElementById('splitBlijft').dataset.splitblijft, document.querySelector('[data-splitsave]').disabled])).toEqual([0, false]);
});

test('e. een schatting staat overal met "schatting" erbij en telt mee in het budget', async ({ page }) => {
  await boot(page, OPTS());
  await vulIn(page);
  await tik(page, '[data-splitsave]');
  const r = await page.evaluate(() => {
    const tel = () => document.querySelectorAll('#sheet [data-schatting="e_alimentatie"]').length;
    openPotjesVerdeling(thisYM()); const verd = tel();
    SET.budgetAdv = true; openBudgetEditor(thisYM()); const ed = tel();
    openPotje('e_alimentatie'); const pot = tel() + document.querySelectorAll('#sheet [data-potschatstand]').length;
    openGripPotje('e_alimentatie', 'vast'); const grip = tel();
    openGripVast(); const vast = tel();
    openPotje('huur'); const huur = tel();
    return { verd, ed, pot, grip, vast, huur, inBudget: +SET.budgets.e_alimentatie, tot: totalBudget() };
  });
  expect(r).toMatchObject({ verd: 1, ed: 1, pot: 2, grip: 1, vast: 1, huur: 0, inBudget: 300 });
});

test('f. de eerste boeking in Alimentatie: Let op vraagt bevestigen of aanpassen', async ({ page }) => {
  await boot(page, OPTS([{ id: 'ali1', date: '2026-10-06', amount: -280, name: 'Ex partner', desc: 'OVERBOEKING ALIMENTATIE OKTOBER' }]));
  await page.evaluate(() => { const t0 = TX.find(x => x.name === 'Ex partner'); OVR[t0.id] = 'e_alimentatie'; save(); });
  /* voor het splitsen is Alimentatie nog niet vastgesteld en vraagt Let op om een bedrag (v351), niet om een bevestiging */
  expect(await page.evaluate(() => gripLetOpItems().map(x => x.soort))).not.toContain('schat');
  await vulIn(page);
  await tik(page, '[data-splitsave]');
  const r = await page.evaluate(() => { go('maand'); renderMaand(); const L = gripLetOpItems(); const x = L.find(y => y.soort === 'schat');
    openGripLetOp('schat', 'e_alimentatie'); const t = document.getElementById('gripLetOpSheet')?.innerText || '';
    return { x, t, potopen: L.some(y => y.soort === 'potopen') }; });
  expect(r.potopen).toBe(false);
  expect(r.x.naam).toBe('Alimentatie: eerste betaling €280');
  expect(r.x.sub).toBe('je schatting was €300 · bevestigen of aanpassen');
  expect(r.t).toContain('€300 bevestigen');
  expect(r.t).toContain('Aanpassen');
  /* bevestigen maakt het bedrag vastgesteld en de regel verdwijnt */
  await tik(page, '[data-schatbevestig]');
  expect(await page.evaluate(() => [!!(SET.potSchat || {}).e_alimentatie, gripLetOpItems().some(y => y.soort === 'schat'), SET.budgets.e_alimentatie])).toEqual([false, false, 300]);
});

test('g. aanpassen naar EUR 280 vraagt waar de EUR 20 heen gaat, met Huur bovenaan, en schrijft pas na een keuze', async ({ page }) => {
  await boot(page, OPTS([{ id: 'ali1', date: '2026-10-06', amount: -280, name: 'Ex partner', desc: 'OVERBOEKING ALIMENTATIE OKTOBER' }]));
  await page.evaluate(() => { const t0 = TX.find(x => x.name === 'Ex partner'); OVR[t0.id] = 'e_alimentatie'; save(); });
  await vulIn(page);
  await tik(page, '[data-splitsave]');
  await page.evaluate(() => openGripLetOp('schat', 'e_alimentatie'));
  await tik(page, '[data-schataanpas]');
  await veld(page, '#potFormBedrag', '280');
  await veld(page, '#potFormVanaf', '2026-11');
  /* v362: een lager bedrag gaat langs dezelfde component als Te ruime potjes (bestemData()): het bronpotje van de
     splitsing staat bovenaan, dan de potjes die niet passen, sparen en verlagen. Niets voorgekozen. */
  const s = await page.evaluate(() => ({ save: document.querySelector('[data-potformsave]').disabled,
    rijen: [...document.querySelectorAll('[data-pfbest]')].map(e => e.dataset.pfbest), vrij: document.getElementById('pfVrij').innerText,
    reden: (document.querySelector('[data-voetreden]') || {}).innerText }));
  expect(s.save).toBe(true);   // eerst een plek voor het verschil
  expect(s.rijen[0]).toBe('pot:huur');
  expect(s.rijen.slice(-2)).toEqual(['sparen', 'verlagen']);
  expect(s.vrij).toBe('€20 per maand komt vrij vanaf november 2026. Waar gaat het heen?');
  expect(s.reden).toBe('Kies eerst waar de €20 heen gaat');
  await page.evaluate(() => { const e = document.querySelector('[data-pfbest="pot:huur"] input'); e.value = '20'; e.dispatchEvent(new Event('input')); });
  const g = await page.evaluate(() => document.getElementById('potFormGevolg').innerText);
  expect(g).toContain('Huur €350 → €370');
  expect(g).toContain('Je maandbudget blijft');
  const tot0 = await page.evaluate(() => totalBudget());
  await tik(page, '[data-potformsave]');
  const r = await page.evaluate(() => ({ next: SET.budgetsNext, schat: !!(SET.potSchat || {}).e_alimentatie, tot: totalBudget(), totN: Object.values(budgetVoorMaand('2026-11')).reduce((a, x) => a + x, 0) }));
  expect(r.next.e_alimentatie).toBe(280);
  expect(r.next.huur).toBe(370);
  expect(r.schat).toBe(false);
  expect(r.tot).toBe(tot0);
  expect(r.totN).toBe(tot0);
});

test('h. splitsen vanaf een latere maand laat deze maand staan, en een eerdere maand kan niet', async ({ page }) => {
  await boot(page, OPTS());
  await vulIn(page);
  const opties = await page.evaluate(() => [...document.querySelectorAll('[data-splitvanaf] option')].map(o => o.value).filter(Boolean));
  expect(opties[0]).toBe('2026-10');
  expect(opties.length).toBe(13);
  await veld(page, '[data-splitvanaf]', '2027-01');
  expect(await page.evaluate(() => document.querySelector('[data-splitbrug]'))).toBe(null);   // geen bridge van deze maand: die verandert niet
  await tik(page, '[data-splitsave]');
  const r = await page.evaluate(() => ({ nu: SET.budgets.huur, jan: budgetVoorMaand('2027-01'), dec: budgetVoorMaand('2026-12').huur, tag: potSchatTag('e_alimentatie'), tagJan: potSchatTag('e_alimentatie', '2027-01') }));
  expect(r.nu).toBe(750);
  expect(r.dec).toBe(750);
  expect(r.jan.huur).toBe(350);
  expect(r.jan.e_alimentatie).toBe(300);
  expect(r.tag).toBe('');
  expect(r.tagJan).toContain('schatting');
});

for (const w of [360, 390]) {
  test(`i. op ${w}px loopt de sheet niet over`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 740 });
    await boot(page, OPTS());
    await page.evaluate(() => openPotje('huur'));
    const pot = await page.evaluate(() => Math.round(document.getElementById('sheet').getBoundingClientRect().height));
    await tik(page, '[data-potsplits]');
    const leeg = await page.evaluate(() => Math.round(document.getElementById('sheet').scrollHeight));
    await page.evaluate(() => { openPotje('huur'); });
    await vulIn(page);
    const m = await page.evaluate(() => { const sh = document.getElementById('sheet'); const b = sh.getBoundingClientRect();
      const over = [...sh.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > b.right + 0.5).length;
      return { h: Math.round(sh.scrollHeight), over, scroll: document.documentElement.scrollWidth }; });
    console.log(`splitsen ${w}px: potjesheet ${pot}px, leeg ${leeg}px, ingevuld ${m.h}px`);
    expect(m.over).toBe(0);
    expect(m.scroll).toBeLessThanOrEqual(w);
  });
}

test('j. is er deze maand al meer uit het bronpotje dan het nieuwe bedrag, dan zegt het gevolg dat', async ({ page }) => {
  await boot(page, OPTS([{ id: 'hu1', date: '2026-10-02', amount: -500, name: 'Verhuurder', desc: 'OVERBOEKING HUUR OKTOBER' }]));
  await page.evaluate(() => { const t0 = TX.find(x => x.name === 'Verhuurder'); OVR[t0.id] = 'huur'; save(); });
  await vulIn(page);
  const t = await page.evaluate(() => document.querySelector('[data-splital]')?.innerText || '');
  expect(t).toBe('In Huur is deze maand al €500 uitgegeven, €150 meer dan het nieuwe bedrag van €350.');
  /* vanaf een latere maand speelt het niet: die maand is nog leeg */
  await veld(page, '[data-splitvanaf]', '2026-11');
  expect(await page.evaluate(() => !!document.querySelector('[data-splital]'))).toBe(false);
});

test('k. een boeking van voor het splitsen vraagt geen bevestiging, en archiveren wist de schatting', async ({ page }) => {
  await boot(page, OPTS([{ id: 'ali0', date: '2026-10-01', amount: -280, name: 'Ex partner', desc: 'OVERBOEKING ALIMENTATIE SEPTEMBER' }]));
  await page.evaluate(() => { const t0 = TX.find(x => x.name === 'Ex partner'); OVR[t0.id] = 'e_alimentatie'; save(); });
  await vulIn(page);
  await tik(page, '[data-splitsave]');
  /* invoermeting: de boeking staat in Alimentatie en de schatting geldt deze maand */
  const r = await page.evaluate(() => ({ cat: catOf(TX.find(x => x.name === 'Ex partner')), schat: potSchat('e_alimentatie'), tx: potSchatTx('e_alimentatie').length, let: gripLetOpItems().some(y => y.soort === 'schat') }));
  expect(r).toEqual({ cat: 'e_alimentatie', schat: true, tx: 0, let: false });
  await page.evaluate(() => potArchiveer('e_alimentatie', '2026-11'));
  expect(await page.evaluate(() => [!!(SET.potSchat || {}).e_alimentatie, potSchatTag('e_alimentatie')])).toEqual([false, '']);
});

test('l. een schatting die bij een volgende splitsing als vastgesteld wordt gekozen, is daarna vastgesteld', async ({ page }) => {
  await boot(page, OPTS());
  await vulIn(page);
  await tik(page, '[data-splitsave]');
  expect(await page.evaluate(() => potSchat('e_alimentatie'))).toBe(true);   // invoermeting
  await page.evaluate(() => openSplits('huur'));
  await tik(page, '[data-splitregel="0"] [data-splitdoel="e_alimentatie"]');
  await veld(page, '[data-splitbedrag="0"]', '50');
  await tik(page, '[data-splitregel="0"] [data-splitstand="vast"]');
  await veld(page, '[data-splitvanaf]', '2026-10');
  await tik(page, '[data-splitsave]');
  expect(await page.evaluate(() => [SET.budgets.e_alimentatie, SET.budgets.huur, potSchat('e_alimentatie')])).toEqual([350, 300, false]);
});
