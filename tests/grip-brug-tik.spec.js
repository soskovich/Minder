/* v353: EEN TIK OP EEN STAP IN DE BRIDGE OPENT DIE STAP. Op de stand van 6 oktober (deze-maand-stand.js):
   budget 3.375, Vices +83, Boodschappen +61, rest -847, uitkomst 2.672.
   v354: de bridge gaat over de variabele potjes (550 naar 694); de rest-stap bestaat alleen bij meer dan drie
   variabele potjes, dus de rest-tests dragen er vier. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand');

const grip = (page) => page.evaluate(() => { closeSheet(); go('maand'); });
const tik = async (page, sel) => { await page.waitForTimeout(350); await page.click(sel); await page.waitForTimeout(150); };
const sheet = (page) => page.evaluate(() => { const s = $('#sheet'); return { id: (s.querySelector('[id]') || {}).id || null, tekst: s.innerText.replace(/\s+/g, ' '),
  hand: [...s.querySelectorAll('[data-handeling]')].map((e) => e.dataset.handeling), alle: !!s.querySelector('[data-allepotjes]') }; });

test('a. een tik op Vices toont alleen Vices, met waarom en zijn handelingen, en "Alle potjes" onderaan', async ({ page }) => {
  await boot(page); await grip(page);
  const inv = await page.evaluate(() => { const V = maandVooruit(); return { h: V.handelingen.map((h) => h.k), v: V.potjes.find((x) => x.k === 'vices') }; });
  // invoermeting: er zijn meer handelingen dan die van Vices, anders onderscheidt "alleen Vices" niets
  expect(inv.h).toContain('vices');
  expect(inv.h.length).toBeGreaterThan(1);
  await tik(page, '#gripBrug [data-brugstap="potje"][data-brugwaarde="83"]');
  const s = await sheet(page);
  expect(s.id).toBe('gripPotje');
  expect(s.hand).toEqual(['vices']);
  expect(s.tekst).toContain('Vices');
  expect(s.tekst).toContain(`potje €${inv.v.bud}`);
  expect(s.tekst).toContain(`gewoonlijk €${inv.v.typisch}`);
  expect(s.tekst).toContain('Past niet in je potje');
  expect(s.tekst).not.toContain('Boodschappen');
  expect(s.alle).toBe(true);
  await page.click('[data-allepotjes]');
  expect((await sheet(page)).id).toBe('gripVooruit');
});

/* v354: de rest bevat alleen variabele potjes. v356: los staan alleen de potjes die boven eindigen (Uit eten,
   Vices, Boodschappen); Online shopping blijft eronder en is de ruimte. */
// v355: de vaste potjes staan op hun incasso (verzekering 150, abonnement 30, sport 73), anders zijn ze gemengd
// en staat hun variabele rest in de bridge; dan zijn het geen vier variabele potjes meer.
const VIER = { set: { budgets: { huur: 1450, verzekering: 150, abonnement: 30, sport: 73, vices: 50, boodschappen: 500, uiteten: 100, shopping: 300 } } };
test('b. een tik op rest toont de variabele potjes in die stap met hun verschil, en die tellen op tot de stap', async ({ page }) => {
  await boot(page, VIER); await grip(page);
  await tik(page, '#gripBrug [data-brugstap="rest"]');
  const r = await page.evaluate(() => { const g = document.getElementById('gripRest'); const V = maandVooruit(), Br = dezeMaandBrug(V);
    const los = Br.los.map((x) => x.k);
    const rijen = [...g.querySelectorAll('[data-restpotje]')].map((e) => e.dataset.restpotje);
    const verwacht = V.potjes.filter((x) => !los.includes(x.k) && Math.round(x.overR) !== 0).map((x) => x.k);
    const vast = V.vastePotjes.map((x) => x.k);
    const getallen = [...g.querySelectorAll('[data-restpotje]')].map((e) => { const t = e.innerText.match(/([+−-])\s*€\s*([\d.]+)/); return t ? (t[1] === '+' ? 1 : -1) * +t[2].replace(/\./g, '') : NaN; });
    return { rest: +g.dataset.rest, stap: Br.rest, rijen, verwacht, los, vast, som: getallen.reduce((a, b) => a + b, 0), verder: g.querySelectorAll('[data-restverder]').length }; });
  expect(r.rest).toBe(-300);
  expect(r.rijen).toEqual(['shopping']);   // v368: Boodschappen +61 haalt de EUR 50 en staat los
  expect(r.rijen.slice().sort()).toEqual(r.verwacht.slice().sort());
  for (const k of r.los) expect(r.rijen).not.toContain(k);
  for (const k of r.vast) expect(r.rijen).not.toContain(k);   // een vast potje staat nooit in de rest
  expect(r.som).toBe(r.stap);
  expect(r.verder).toBe(0);
  await page.click('[data-restpotje="shopping"]');
  expect(await page.evaluate(() => document.getElementById('gripPotje') && document.getElementById('gripPotje').dataset.potje)).toBe('shopping');
});

test('c. een tik op de kop, op budget of op de uitkomst opent de volle lijst', async ({ page }) => {
  await boot(page);
  for (const sel of ['#gripDezeMaand [data-dmkop]', '#gripBrug [data-brugstap="begin"]', '#gripBrug [data-brugstap="eind"]']) {
    await grip(page);
    await tik(page, sel);
    const s = await sheet(page);
    expect(s.id, sel).toBe('gripVooruit');
    expect(s.tekst.toUpperCase()).toContain('WAT JE DEZE MAAND KUNT DOEN');
    expect(s.hand.length).toBeGreaterThan(1);
  }
});

test('d. het tikvlak is de hele kolom, ook bij een dunne balk', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await boot(page); await grip(page);
  const m = await page.evaluate(() => [...document.querySelectorAll('#gripBrug [data-brugstap]')].map((k) => { const r = k.getBoundingClientRect(), b = k.querySelector('i').getBoundingClientRect();
    return { soort: k.dataset.brugstap, tik: k.hasAttribute('data-brugtik'), kolH: Math.round(r.height), kolW: Math.round(r.width), balkH: Math.round(b.height) }; }));
  for (const c of m) { expect(c.tik).toBe(true); expect(c.kolH).toBeGreaterThanOrEqual(112); expect(c.kolW).toBeGreaterThanOrEqual(40); }
  // de dunste balk: een tik bovenin zijn kolom, ver van de balk, opent toch zijn stap
  const dun = m.filter((c) => c.soort === 'potje').sort((a, b) => a.balkH - b.balkH)[0];
  const box = await page.evaluate((w) => { const k = document.querySelector(`#gripBrug [data-brugstap="potje"][data-brugwaarde="${w}"]`).getBoundingClientRect(); return { x: k.left + k.width / 2, y: k.top + 4 }; }, dun && (await page.evaluate(() => [...document.querySelectorAll('#gripBrug [data-brugstap="potje"]')].sort((a, b) => a.querySelector('i').getBoundingClientRect().height - b.querySelector('i').getBoundingClientRect().height)[0].dataset.brugwaarde)));
  await page.waitForTimeout(350);
  await page.mouse.click(box.x, box.y);
  await page.waitForTimeout(150);
  expect((await sheet(page)).id).toBe('gripPotje');
});

test('e. de bridge op Inzichten krijgt geen tik', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => brugGrafiek({ tegen: 'budget', stappen: [{ soort: 'begin', label: 'b', waarde: 100 }, { soort: 'eind', label: 'e', waarde: 90 }] }));
  expect(r).not.toContain('data-brugtik');
});

for (const w of [360, 390]) {
  test(`f. op ${w}px lopen de potje- en de rest-sheet niet over`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: w === 360 ? 640 : 844 });
    await boot(page, VIER); await grip(page);
    const maat = async () => page.evaluate(() => { const s = $('#sheet'), g = s.querySelector('[id]'); return { id: g.id, h: Math.round(g.getBoundingClientRect().height), over: s.scrollWidth > s.clientWidth }; });
    await tik(page, '#gripBrug [data-brugstap="potje"][data-brugwaarde="83"]'); await page.waitForTimeout(250);
    const p = await maat();
    await grip(page);
    await tik(page, '#gripBrug [data-brugstap="rest"]'); await page.waitForTimeout(250);
    const r = await maat();
    console.log(`v353 ${w}px potje ${p.h} rest ${r.h}`);
    expect(p).toMatchObject({ id: 'gripPotje', over: false });
    expect(r).toMatchObject({ id: 'gripRest', over: false });
  });
}
