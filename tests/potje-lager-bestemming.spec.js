/* v362: EEN ROUTE VOOR EEN LAGER POTJE. "Ander bedrag vanaf een maand" (openPotForm) verlaagde bij een lager
   bedrag meteen je maandbudget, terwijl Te ruime potjes (v358) en een schatting aanpassen (v360) eerst vroegen
   waar het vrije geld heen gaat. Nu gaan alle drie langs dezelfde component (bestemData(), bestemBlok(),
   bestemSchrijf()): eerst "EUR X per maand komt vrij vanaf <maand>", dan de bestemming (een potje dat niet
   past, sparen, maandbudget verlagen, ook verdeeld), niets voorgekozen, en Vastzetten pas als alles een plek
   heeft. Verhogen is ongewijzigd. Fixture: deze-maand-stand.js (6 oktober; Vices en Boodschappen passen niet). */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand');

const OPT = { set: { nfToegewezenMigrated: true, nfToegewezen: 3000, goals: [{ id: 'g1', naam: 'Vakantie', doel: 4800, gespaard: 0, streefdatum: '2027-12' }] } };
const meet = (page) => page.evaluate(() => { const Br = dezeMaandBrug(maandVooruit()), nf = allocatePlan().find((p) => p.id === 'noodfonds');
  return { safe: Math.round(safeToSpend().safe), tot: totalBudget(), cap: planCapacity(), eta: nf.eta,
    brug: Br.stappen.map((s) => s.label + ':' + s.waarde).join(' ') }; });
const open = (page) => page.evaluate(() => { openPotForm('sport'); potFormZetVeld('bedrag', '400'); potFormZetVeld('vanaf', '2026-10'); });
const vul = (page, id, v) => page.evaluate(([id, v]) => { const e = document.querySelector(`[data-pfbest="${id}"] input`); e.value = v; e.dispatchEvent(new Event('input')); }, [id, v]);
const opslag = (page) => page.evaluate(() => localStorage.getItem('minder_set'));

test.describe('a · lager zonder bestemming kan niet', () => {
  test('eerst wat vrijkomt, dan de bestemmingen, niets voorgekozen, en Vastzetten uit met de reden', async ({ page }) => {
    await boot(page, OPT);
    const voor = await opslag(page);
    await open(page);
    const r = await page.evaluate(() => ({ vrij: document.getElementById('pfVrij').innerText,
      rijen: [...document.querySelectorAll('[data-pfbest]')].map((e) => e.dataset.pfbest),
      waarden: [...document.querySelectorAll('[data-pfbest] input')].map((e) => e.value),
      uit: document.querySelector('[data-potformsave]').disabled, reden: document.querySelector('[data-voetreden]').innerText,
      voet: !!document.querySelector('#sheet .sheet-voet [data-potformsave]'),
      volgorde: document.getElementById('pfVrij').compareDocumentPosition(document.getElementById('pfBest')) & Node.DOCUMENT_POSITION_FOLLOWING }));
    expect(r.vrij).toBe('€200 per maand komt vrij vanaf oktober 2026. Waar gaat het heen?');
    expect(r.rijen).toEqual(['pot:boodschappen', 'pot:vices', 'sparen', 'verlagen']);
    expect(r.waarden).toEqual(['', '', '', '']);
    expect(r.uit).toBe(true);
    expect(r.reden).toBe('Kies eerst waar de €200 heen gaat');
    expect(r.voet, 'de knop staat in de vaste balk').toBe(true);
    expect(r.volgorde).toBeTruthy();
    // openen en kiezen schrijven niets, en de schrijver weigert zelf zonder bestemming
    expect(await opslag(page)).toBe(voor);
    await page.evaluate(() => potFormZet());
    expect(await page.evaluate(() => [SET.budgets.sport, totalBudget()])).toEqual([600, 3375]);
    expect(await opslag(page)).toBe(voor);
  });
  test('te veel verdeeld kan ook niet', async ({ page }) => {
    await boot(page, OPT);
    await open(page);
    await vul(page, 'verlagen', '250');
    expect(await page.evaluate(() => [document.querySelector('[data-potformsave]').disabled, document.querySelector('[data-voetreden]').innerText, document.getElementById('pfOpen').innerText]))
      .toEqual([true, 'Je verdeelt €50 meer dan er vrijkomt', '€50 meer verdeeld dan er vrijkomt']);
  });
});

test.describe('b · elke bestemming boekt door', () => {
  test('naar een potje dat niet past: maandbudget gelijk, veilig te besteden gelijk, de stap Vices verdwijnt uit de bridge', async ({ page }) => {
    await boot(page, OPT);
    const a = await meet(page);
    expect(a.brug).toBe('budget:3375 Vices:83 Boodschappen:61 ruimte:-1122 vaste lasten:0 zonder potje:275 okt:2672');
    await open(page);
    await vul(page, 'pot:vices', '200');
    await expect(page.locator('#potFormGevolg')).toContainText('Vices €50 → €250');
    await expect(page.locator('#potFormGevolg')).toContainText('Je maandbudget blijft €3.375');
    await page.click('[data-potformsave]');
    const b = await meet(page);
    expect(await page.evaluate(() => [SET.budgets.sport, SET.budgets.vices])).toEqual([400, 250]);
    expect(b.tot).toBe(3375);
    expect(b.safe).toBe(a.safe);
    expect(b.cap).toBe(a.cap);
    expect(b.brug).toBe('budget:3375 Boodschappen:61 ruimte:-1039 vaste lasten:0 zonder potje:275 okt:2672');
  });
  test('naar sparen: maandbudget omlaag, spaarinleg omhoog, Plan sneller, veilig te besteden gelijk', async ({ page }) => {
    await boot(page, OPT);
    const a = await meet(page);
    await open(page);
    await page.click('[data-pfbest="sparen"] span[onclick]');   // "de rest"
    await expect(page.locator('#potFormGevolg')).toContainText('Sparen €400 → €600 per maand');
    await page.click('[data-potformsave]');
    const b = await meet(page);
    expect(b.tot).toBe(3175);
    expect(b.cap).toBe(600);
    expect([a.eta, b.eta]).toEqual([14, 9]);   // planVooruit(): het noodfonds is vijf maanden eerder vol
    expect(b.safe).toBe(a.safe);              // wat uit het potje gaat, gaat naar nog te sparen
    expect(b.brug.split(' ')[0]).toBe('budget:3175');
  });
  test('maandbudget verlagen: veilig te besteden stijgt met het bedrag, Plan gelijk', async ({ page }) => {
    await boot(page, OPT);
    const a = await meet(page);
    await open(page);
    await vul(page, 'verlagen', '200');
    await expect(page.locator('#potFormGevolg')).toContainText('Je maandbudget gaat van €3.375 naar €3.175');
    await page.click('[data-potformsave]');
    const b = await meet(page);
    expect(b.tot).toBe(3175);
    expect(b.safe).toBe(a.safe + 200);
    expect([b.cap, b.eta]).toEqual([a.cap, a.eta]);
    expect(b.brug).toBe('budget:3175 Vices:83 Boodschappen:61 ruimte:-922 vaste lasten:0 zonder potje:275 okt:2672');
  });
  test('verdeeld over twee, en het logboek noemt de bestemming', async ({ page }) => {
    await boot(page, OPT);
    await open(page);
    await vul(page, 'pot:vices', '100');
    await expect(page.locator('#pfOpen')).toHaveText('Nog te verdelen: €100');
    await vul(page, 'verlagen', '100');
    await page.click('[data-potformsave]');
    const r = await page.evaluate(() => ({ B: [SET.budgets.sport, SET.budgets.vices, totalBudget()], af: (SET.afspraken || []).map((a) => [a.cat, a.wat, a.bestemming]) }));
    expect(r.B).toEqual([400, 150, 3275]);
    expect(r.af).toEqual([['sport', 'Potje Sport & gezondheid €400 vanaf oktober; €200 naar Vices €100 en maandbudget €100 lager', '€200 naar Vices €100 en maandbudget €100 lager']]);
    // de afspraak staat in de lijst die het logboek en de afsluiting lezen
    expect(await page.evaluate(() => afsprakenVoor('2026-10').map((a) => a.wat))).toContain(r.af[0][1]);
  });
});

test.describe('c · verhogen is ongewijzigd', () => {
  test('hoger vraagt een dekking of een bewuste verhoging, zonder de bestemmingen', async ({ page }) => {
    await boot(page, OPT);
    await page.evaluate(() => { openPotForm('vices'); potFormZetVeld('bedrag', '100'); potFormZetVeld('vanaf', '2026-11'); });
    const r = await page.evaluate(() => ({ bron: [...document.querySelectorAll('[data-potbron]')].map((e) => e.dataset.potbron), best: document.querySelectorAll('[data-pfbest]').length,
      reden: document.querySelector('[data-voetreden]').innerText }));
    expect(r).toEqual({ bron: ['dek', 'verhoog'], best: 0, reden: 'Kies waar de €50 extra vandaan komt' });
    await page.click('[data-potbron="verhoog"]');
    await page.click('[data-potformsave]');
    expect(await page.evaluate(() => [SET.budgetsNext.vices, Object.values(budgetVoorMaand('2026-11')).reduce((a, x) => a + x, 0)])).toEqual([100, 3425]);
  });
});

test.describe('d · maat', () => {
  for (const w of [360, 390]) test(`de sheet op ${w}px: geen overloop, de knop zichtbaar`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 640 });
    await boot(page, OPT);
    await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '*{animation:none!important}'; document.head.appendChild(st); });
    await open(page);
    for (const fase of ['leeg', 'vol']) {
      if (fase === 'vol') { await vul(page, 'pot:vices', '100'); await vul(page, 'sparen', '50'); await vul(page, 'verlagen', '50'); }
      const m = await page.evaluate(() => { const s = document.getElementById('sheet'); s.scrollTop = 0; const k = document.querySelector('[data-potformsave]').getBoundingClientRect();
        let over = 0; for (const e of s.querySelectorAll('*')) { const r = e.getBoundingClientRect(); if (r.width && r.right > s.getBoundingClientRect().right + 1) over++; }
        return { h: s.scrollHeight, over, knop: k.bottom <= innerHeight + 0.5 && k.top >= s.getBoundingClientRect().top, sw: s.scrollWidth - s.clientWidth }; });
      console.log(`${w}px ${fase}: ${m.h}px`);
      expect(m.over, fase).toBe(0);
      expect(m.sw, fase).toBeLessThanOrEqual(0);
      expect(m.knop, fase).toBe(true);
    }
  });
});
