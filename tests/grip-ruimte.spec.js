/* v356: DE STAP "RUIMTE IN ANDERE POTJES". Op de stand van 6 oktober (deze-maand-stand.js) staan alleen de potjes
   die boven eindigen los (Vices +83, Boodschappen +61), en de rest is de ruimte in de andere potjes (-1.122).
   De sheet achter die stap noemt bovenaan de potjes die structureel ruimer zijn dan je gewoonlijk uitgeeft
   (potRuimer, RUIMER_DREMPEL: de keuze van de gebruiker, bevestigd bij v357). */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand');

const grip = (page) => page.evaluate(() => { closeSheet(); go('maand'); });
const VIER = { set: { budgets: { huur: 1450, verzekering: 150, abonnement: 30, sport: 73, vices: 50, boodschappen: 500, uiteten: 100, shopping: 300 } } };

test('a. de sheet heet ruimte, noemt bovenaan de ruimere potjes, en de regels tellen op tot de stap', async ({ page }) => {
  await boot(page); await grip(page);
  const r = await page.evaluate(() => { const V = maandVooruit();
    const maanden = Object.fromEntries(V.potjes.map((x) => [x.k, x.maanden]));
    openGripRest(); const g = document.getElementById('gripRest');
    const kinderen = [...g.querySelectorAll('[data-ruimer],[data-restpotje]')].map((e) => e.hasAttribute('data-ruimer') ? 'ruimer' : e.dataset.restpotje);
    return { maanden, rest: +g.dataset.rest, titel: g.firstElementChild.innerText, ruimer: g.querySelector('[data-ruimer]').dataset.ruimer,
      regel: g.querySelector('[data-ruimer]').innerText.replace(/\s+/g, ' ').trim(), kinderen }; });
  // invoermeting: Sport, Verzekeringen en Abonnementen hadden in drie maanden geen variabele uitgave
  expect(r.maanden.sport).toEqual([0, 0, 0]);
  expect(r.maanden.verzekering).toEqual([0, 0, 0]);
  expect(r.maanden.vices).toEqual([133, 133, 133]);
  expect(r.rest).toBe(-1122);
  expect(r.titel).toBe('Ruimte in andere potjes · -€1.122');
  expect(r.ruimer).toBe('sport,verzekering,abonnement');
  expect(r.regel).toBe('Sport & gezondheid, Verzekeringen en Abonnementen zijn ruimer dan je gewoonlijk uitgeeft · bijstellen ›');
  expect(r.kinderen[0]).toBe('ruimer');   // bovenaan
  expect(r.kinderen.slice(1)).toEqual(['sport', 'verzekering', 'abonnement']);
});

test('b. de drempel: elke maand hooguit de helft van het variabele bedrag EN minstens EUR 50 eronder', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => [
    potRuimer({ bud: 100, maanden: [50, 0, 0] }),
    potRuimer({ bud: 100, maanden: [51, 0, 0] }),     // een maand boven de helft
    potRuimer({ bud: 90, maanden: [0, 0, 41] }),      // onder de helft, maar 49 eronder
    potRuimer({ bud: 90, maanden: [0, 0, 40] }),
    potRuimer({ bud: 0, maanden: [0, 0, 0] }),
    potRuimer({ bud: 100, maanden: [] }),
    RUIMER_DREMPEL]);
  expect(r).toEqual([true, false, false, true, false, false, { deel: 0.5, euro: 50 }]);
});

test('c. openen schrijft niets; bij meer potjes opent bijstellen de budgeteditor', async ({ page }) => {
  await boot(page); await grip(page);
  const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
  await page.evaluate(() => openGripRest());
  expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  await page.click('[data-ruimer]');
  expect(await page.evaluate(() => !!document.getElementById('budgetSheetHead'))).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
});

test('d. bij een potje opent bijstellen dat potje', async ({ page }) => {
  await boot(page, VIER); await grip(page);
  await page.evaluate(() => openGripRest());
  const r = await page.evaluate(() => document.querySelector('[data-ruimer]').dataset.ruimer);
  expect(r).toBe('shopping');
  await page.click('[data-ruimer]');
  expect(await page.evaluate(() => { const f = document.getElementById('potForm'); return f ? f.innerText : null; })).toContain('Online shopping');
});

test('e. geen ruimer potje, geen regel', async ({ page }) => {
  // Online shopping kreeg in juli EUR 200 van een potje van 300: niet elke maand onder de helft
  await boot(page, Object.assign({}, VIER, { extraTx: [{ id: 'bolj', date: '2026-07-20', amount: -200, name: 'Bol.com', desc: 'BEA, BETAALPAS BOL.COM' }] }));
  await grip(page);
  const r = await page.evaluate(() => { const x = maandVooruit().potjes.find((p) => p.k === 'shopping'); openGripRest();
    return { maanden: x.maanden, regel: document.querySelectorAll('#gripRest [data-ruimer]').length, open: !!document.getElementById('gripRest') }; });
  expect(r.maanden[2]).toBe(200);   // invoermeting: juli is de derde maand terug
  expect(r.open).toBe(true);
  expect(r.regel).toBe(0);
});

for (const w of [360, 390]) test('f. de sheet loopt niet over op ' + w + 'px', async ({ page }) => {
  await page.setViewportSize({ width: w, height: 800 });
  await boot(page); await grip(page);
  const r = await page.evaluate(() => { openGripRest(); const g = document.getElementById('gripRest'), gr = g.getBoundingClientRect();
    return { h: Math.round(gr.height), regel: Math.round(g.querySelector('[data-ruimer]').getBoundingClientRect().height),
      over: [...g.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > gr.right + 0.5).length }; });
  console.log('hoogte', w, JSON.stringify(r));
  expect(r.over).toBe(0);
  expect(r.h).toBeLessThan(420);
});

test('g. een potje dat deze maand los staat, staat niet in de ruimer-regel, ook al gaf het eerder niets uit', async ({ page }) => {
  await boot(page, Object.assign({}, VIER, { extraTx: [{ id: 'bolo', date: '2026-10-04', amount: -400, name: 'Bol.com', desc: 'BEA, BETAALPAS BOL.COM' }] }));
  await grip(page);
  const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V), x = V.potjes.find((p) => p.k === 'shopping');
    openGripRest(); const e = document.querySelector('#gripRest [data-ruimer]');
    return { los: Br.los.map((p) => p.k), maanden: x.maanden, ruimer: potRuimer(x), regel: e ? e.dataset.ruimer : '' }; });
  // invoermeting: Online shopping staat los en zou op zijn maanden alleen ruimer heten
  expect(r.los).toContain('shopping');
  expect(r.maanden).toEqual([0, 0, 0]);
  expect(r.ruimer).toBe(true);
  expect(r.regel.split(',')).not.toContain('shopping');
});
