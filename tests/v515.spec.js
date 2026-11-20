/* v515: DE SHEET "NOG VERWACHT IN JE POTJES" IN EEN BLIK (gevraagd door de gebruiker). Alleen weergave: geen getal verandert.
   Fixture v515-stand (20 nov, GECONSTRUEERD naar de getallen van het toestel): dertien potjes samen EUR 670, rest -499, totaal 171.
   De getallen komen uit maandVooruit() en insGroepen() en worden hier eerst als invoer gemeten. */
const { test, expect } = require('./klok');
const K = require('./v515-stand');
const VOOR = require('./v515-voor.json');

async function open(page, o) {
  await page.setViewportSize({ width: 390, height: 844 });
  await K.boot(page, o);
  await page.evaluate(() => { go('ins'); openInsTegel('potjes', 1); });
}
const lees = (page) => page.evaluate(() => { const e = document.getElementById('insTegelSheet');
  const balken = [...e.querySelectorAll('[data-insfcbalken] > [data-insfcpot]')].map((d) => ({ k: d.dataset.insfcpot, w: d.querySelector('[data-insfcbalk]').getBoundingClientRect().width, open: !d.querySelector('[data-insfcdetail]').hidden }));
  const ander = e.querySelector('[data-insfcander]'), rest = e.querySelector('[data-insrest]'), tot = e.querySelector('[data-insmaandtotaal]');
  const rijen = {}; for (const r of e.querySelectorAll('[data-inspotrij]')) rijen[r.dataset.inspotrij] = +r.dataset.insrij;
  return { tekst: e.innerText, w: +e.dataset.inswaarde, som: +e.dataset.inspotsom, balken, rijen,
    ander: ander && { v: +ander.dataset.insfcander, tekst: ander.firstElementChild.innerText.replace(/\s+/g, ' ').trim(), open: !ander.querySelector('[data-insfcdetail]').hidden },
    rest: rest && { v: +rest.dataset.insrij, soort: rest.dataset.insrest, tekst: rest.innerText, inBalken: !!rest.closest('[data-insfcbalken]'), kleur: getComputedStyle(rest.querySelector('b')).color },
    groen: getComputedStyle(document.body).getPropertyValue('--green'),
    tot: tot && { v: +tot.dataset.insmaandtotaal, tekst: tot.innerText }, allesRij: [...e.querySelectorAll('[data-insrij]')].reduce((a, x) => a + +x.dataset.insrij, 0),
    gripLink: !!e.querySelector('[data-insgrip]'), detailsOpen: [...e.querySelectorAll('[data-insfcdetail]')].filter((x) => !x.hidden).length }; });

test('v515 invoer: de fixture levert via maandVooruit en insGroepen 670 / -499 / 171', async ({ page }) => {
  await K.boot(page);
  const r = await page.evaluate(() => { const G = insGroepen(insMaandStand()), V = maandVooruit();
    const som = V.potjes.reduce((a, x) => a + Math.max(Math.round(x.eindR) - Math.round(x.uit), 0), 0); return { nog: G.pot.nog, som, n: V.potjes.filter((x) => Math.round(x.eindR) - Math.round(x.uit) > 0).length }; });
  expect(r).toEqual({ nog: 171, som: 670, n: 13 });
});

test('v515 a: de kop is de som van de potjesrijen (EUR 670), met "4 potjes zijn samen EUR 438"', async ({ page }) => {
  await open(page);
  const r = await lees(page);
  expect(r.tekst).toMatch(/^Nog verwacht in je potjes\ntot eind november, op je tempo · 4 potjes zijn samen €438\n€670\n/);
  expect(r.som).toBe(670);
  expect(r.w, 'data-inswaarde blijft het getal van de tegel').toBe(171);
});

test('v515 b: precies vier balken in volgorde, plus "9 andere potjes EUR 232"', async ({ page }) => {
  await open(page);
  const r = await lees(page);
  expect(r.balken.map((b) => b.k)).toEqual(['boodschappen', 'vervoer', 'zorg', 'belasting']);
  expect(r.ander.tekst).toBe('9 andere potjes €232');
  expect(r.ander.v).toBe(232);
});

test('v515 c: de balk is r.nog gedeeld door de grootste (Vervoer is 124/199 van Boodschappen), de andere-regel hooguit 100%', async ({ page }) => {
  await open(page);
  const r = await lees(page);
  const [b, v] = r.balken;
  expect(Math.abs(v.w - b.w * 124 / 199)).toBeLessThanOrEqual(1);
  const aw = await page.locator('[data-insfcander] [data-insfcbalk]').evaluate((e) => e.getBoundingClientRect().width);
  expect(Math.abs(aw - b.w)).toBeLessThanOrEqual(1);   // 232 > 199: geklemd op de volle lengte, niet verder
});

test('v515 d: bij openen staat alles dicht; een tik op Boodschappen toont het detail en een tweede tik sluit het', async ({ page }) => {
  await open(page);
  expect((await lees(page)).detailsOpen).toBe(0);
  await page.click('[data-insfcpot="boodschappen"] > [data-inspotrij]');
  const d = page.locator('[data-insfcpot="boodschappen"] [data-insfcdetail]');
  await expect(d).toBeVisible();
  expect((await d.innerText()).replace(/\s+/g, ' ').trim()).toBe('€214 uitgegeven · verwacht eind €413 · potje openen ›');
  expect((await lees(page)).detailsOpen).toBe(1);
  await page.click('[data-insfcpot="boodschappen"] > [data-inspotrij]');
  await expect(d).toBeHidden();
  /* de andere potjes klappen open op een regel, en "potje openen" opent het potje */
  await page.click('[data-insfcander] > div');
  await expect(page.locator('[data-insfcander] [data-insfcdetail]')).toHaveText('Contant €46 · Vices €46 · Kinderen €42 · Verzorging €39 · Uit eten & café €21 · Online shopping €18 · Overig €9 · Bankkosten €6 · Abonnementen €5');
  await page.click('[data-insfcpot="vervoer"] > [data-inspotrij]');
  await page.click('[data-insfcpot="vervoer"] [data-insfcopen]');
  expect(await page.evaluate(() => window._insPotje)).toBe('vervoer');
});

test('v515 e: de rest staat apart onder de balken, als "Verlaagt je totaal", -EUR 499 in de positieve kleur', async ({ page }) => {
  await open(page);
  const r = await lees(page);
  expect(r.rest.inBalken).toBe(false);
  expect(r.rest.soort).toBe('verlaagt');
  expect(r.rest.v).toBe(-499);
  expect(r.rest.tekst.replace(/\s+/g, ' ').trim()).toBe('Verlaagt je totaal · geen uitgave uit een potje valt buiten je potjes -€499');
  const groen = await page.evaluate(() => { const d = document.createElement('b'); d.style.color = 'var(--green)'; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; });
  expect(r.rest.kleur).toBe(groen);
  expect(r.balken.length + (r.ander ? 1 : 0)).toBe(5);
});

test('v515 f: "In je maandtotaal" is EUR 171 = data-inswaarde, en potjessom plus rest is G.pot.nog', async ({ page }) => {
  await open(page);
  const r = await lees(page);
  expect(r.tot.v).toBe(r.w);
  expect(r.tot.tekst.replace(/\s+/g, ' ').trim()).toBe('In je maandtotaal €670 in potjes − €499 €171');
  expect(r.som + r.rest.v).toBe(r.w);
  expect(r.allesRij, 'de rijen tellen op tot het getal van de tegel').toBe(r.w);
  expect(r.gripLink).toBe(true);
});

test('v515 g: met drie potjes geen samenvoegregel; een rest boven nul heet "Zonder potje"', async ({ page }) => {
  await open(page, { nog: { boodschappen: 199, vervoer: 124, zorg: 62 }, zonderContant: true });
  const r = await lees(page);
  expect(r.balken.map((b) => b.k)).toEqual(['boodschappen', 'vervoer', 'zorg']);
  expect(r.ander).toBeNull();
  expect(r.tekst).toContain('3 potjes zijn samen €385');
  expect(r.rest.soort).toBe('zonder');
  expect(r.rest.tekst).toMatch(/^Zonder potje\nvalt buiten je potjes/);
});

test('v515 h: elk bedrag in de sheet is gelijk aan d62e105 in dezelfde fixture', async ({ page }) => {
  for (const [naam, o] of [['toestel', {}], ['drie', { nog: { boodschappen: 199, vervoer: 124, zorg: 62 }, zonderContant: true }]]) {
    await open(page, o);
    const r = await lees(page);
    expect(r.w, naam).toBe(VOOR[naam].totaal);
    expect(r.rijen, naam).toEqual(VOOR[naam].rijen);
    expect(r.rest ? r.rest.v : 0, naam).toBe(VOOR[naam].rest);
  }
});
