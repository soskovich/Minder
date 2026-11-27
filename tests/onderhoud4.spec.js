/* onderhoud4: op Plan staan "Naar je lagen" (planGestortKaart) en "Waarom EUR X meer/minder opzij" standaard DICHT tot een regel.
   Dicht noemt Naar je lagen het gestort tegen het plan (de som van de lagen), de lagen die afwijken met hun verschil (Groeien met
   "nog niet" telt niet), "+ extra EUR X" bij een surplus, en anders "alles volgens plan". Waarom noemt "Waarom EUR X meer/minder
   opzij ›" en "· nog niet gesplitst" als er een tik-actie in staat. Een tik opent en sluit; de stand per blok staat in SET.planOpen
   (op dit toestel, niet naar de Worker). Verschuivingen en Bijsturen op Grip blijven zichtbaar. Geen bedrag verandert: met beide
   blokken open is elk bedrag op Home, Inzichten, Grip en Plan gelijk aan de vorige main (4ce6ffa, git show). */
const { execSync } = require('child_process');
const { test, expect } = require('./klok');
const { pinDatum } = require('./vaste-dag');
const P = require('./periode-stand');
const B = require('./v518-bedragen');
const MAIN_HTML = (() => { try { return execSync('git show 4ce6ffa:index.html', { cwd: __dirname + '/..', maxBuffer: 64 << 20 }).toString(); } catch (_) { return null; } })();

/* een geconstrueerde stand voor de vorm: lagenGestort met vaste getallen (de render leest alleen dit object) */
async function zetG(page, o) {
  await page.evaluate((o) => {
    const echt = window.__echtG || (window.__echtG = lagenGestort);
    window.lagenGestort = () => { const G = echt() || {}; return Object.assign({}, G, { lagen: o.lagen, meer: o.meer, gestortBinnen: true, surplus: o.surplus || 0,
      stort: o.surplus ? { id: 'o4stort', beantwoord: !!o.beantwoord } : null,
      extra: Object.assign({}, G.extra, { bedrag: o.surplus || 0, verg: 0, eenmalig: o.surplus || 0, overTeMaken: 0, laten: false, gekozen: null, naar: 'beschermen' }) }); };
    go('vooruit'); renderVooruit();
  }, o);
}
const lees = (page) => page.evaluate(() => { const g = document.getElementById('planGestort'), w = document.getElementById('planWaarom');
  const zicht = (e) => !!e && e.getClientRects().length > 0;
  return { gOpen: g && g.dataset.blokopen, wOpen: w && w.dataset.blokopen, gDicht: g && g.querySelector('[data-gestortdicht]').innerText, wDicht: w && w.querySelector('[data-waaromdicht]').innerText,
    gBody: zicht(g && g.querySelector('[data-gestortbody]')), wBody: zicht(w && w.querySelector('[data-waarombody]')), gDichtZicht: zicht(g && g.querySelector('[data-gestortdicht]')),
    afw: [...document.querySelectorAll('#planGestort [data-gestortafwijk]')].map((e) => [e.dataset.gestortafwijk, +e.dataset.d]),
    verschuif: !!document.querySelector('#s-vooruit [data-verschuivingenlink]'), bijsturen: zicht(document.querySelector('#s-vooruit [data-gestortbijsturen]')), open: SET.planOpen || null }; });

test('a: beide blokken staan standaard dicht, met de dichte regel zichtbaar en de inhoud weg', async ({ page }) => {
  await P.boot(page, '2026-11-26');
  await page.evaluate(() => { go('vooruit'); renderVooruit(); });
  const r0 = await lees(page);
  expect(r0.gOpen).toBe('0'); expect(r0.gBody).toBe(false); expect(r0.gDichtZicht).toBe(true);
  expect(r0.gDicht).toContain('Naar je lagen · €0 gestort, plan €1.766');   // echte stand: niets gestort, opzij 1.766 gepland
  expect(r0.bijsturen).toBe(true);                                          // Bijsturen op Grip blijft onder de blokken staan
  await zetG(page, { meer: 500, surplus: 500, lagen: [{ k: 'beschermen', plan: 1000, gestort: 1000 }, { k: 'reserveren', plan: 200, gestort: 200 }] });
  const r = await lees(page);
  expect(r.wOpen).toBe('0'); expect(r.wBody).toBe(false);
  expect(r.wDicht).toContain('Waarom €500 meer opzij ›');
  expect(r.wDicht).toContain('· nog niet gesplitst');                     // er staat een tik-actie in (de surplus-regel)
});

test('b: dicht noemt de afwijkende laag met zijn verschil, Groeien met "nog niet" telt niet, en de extra', async ({ page }) => {
  await P.boot(page, '2026-11-26');
  await zetG(page, { meer: -36, surplus: 250, beantwoord: true, lagen: [{ k: 'beschermen', plan: 1000, gestort: 1000 }, { k: 'reserveren', plan: 236, gestort: 200 },
    { k: 'groeien', plan: 300, gestort: 0, later: true }] });
  const r = await lees(page);
  expect(r.afw).toEqual([['reserveren', -36]]);
  expect(r.gDicht).toContain('Naar je lagen · €1.200 gestort, plan €1.536');
  expect(r.gDicht).toContain('Reserveren −€36');
  expect(r.gDicht).not.toContain('Groeien');
  expect(r.gDicht).toContain('+ extra €250');
  expect(r.gDicht).not.toContain('alles volgens plan');
  expect(r.wDicht).toContain('Waarom €36 minder opzij');
  expect(r.wDicht).not.toContain('nog niet gesplitst');                   // gesplitst: geen tik-actie
});

test('c: zonder afwijking zegt de dichte regel "alles volgens plan"', async ({ page }) => {
  await P.boot(page, '2026-11-26');
  await zetG(page, { meer: 0, lagen: [{ k: 'beschermen', plan: 1000, gestort: 1000 }, { k: 'doelen', plan: 0, gestort: 0 }, { k: 'groeien', plan: 300, gestort: 0, later: true }] });
  const r = await lees(page);
  expect(r.afw).toEqual([]);
  expect(r.gDicht).toContain('alles volgens plan');
  expect(r.gDicht).not.toContain('+ extra');
});

test('d: een tik opent en sluit, en de stand blijft na herladen (SET.planOpen)', async ({ page, context }) => {
  await P.boot(page, '2026-11-26');
  await zetG(page, { meer: 500, surplus: 500, lagen: [{ k: 'beschermen', plan: 1000, gestort: 1000 }] });
  await page.click('#planGestort [data-gestortdicht]');
  let r = await lees(page);
  expect(r.gOpen).toBe('1'); expect(r.gBody).toBe(true); expect(r.gDichtZicht).toBe(false); expect(r.open).toEqual({ gestort: true });
  await page.click('#planWaarom [data-waaromdicht]');
  r = await lees(page); expect(r.wBody).toBe(true); expect(r.open).toEqual({ gestort: true, waarom: true });
  await page.click('#planWaarom [data-waaromkop]');                       // en weer dicht
  r = await lees(page); expect(r.wBody).toBe(false); expect(r.open).toEqual({ gestort: true, waarom: false });
  // herladen: een tweede pagina in dezelfde context leest wat er in localStorage staat (zonder het seed-script van de fixture)
  const p2 = await context.newPage(); await pinDatum(p2, '2026-11-26'); await p2.goto('/index.html');
  const r2 = await p2.evaluate(() => { go('vooruit'); renderVooruit(); const g = document.getElementById('planGestort'); return { open: SET.planOpen, g: g && g.dataset.blokopen }; });
  expect(r2.open).toEqual({ gestort: true, waarom: false });
  expect(r2.g).toBe('1');
  await p2.close();
});

test('e: met beide blokken open is elk bedrag gelijk aan de vorige main (4ce6ffa)', async ({ browser }) => {
  expect(MAIN_HTML, '4ce6ffa niet beschikbaar').toBeTruthy();
  test.setTimeout(120000);
  const meet = async (html) => {
    const page = await browser.newPage();
    if (html) await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    const out = {};
    for (const dag of ['2026-11-15', '2026-11-26']) {
      await P.boot(page, dag);
      out[dag] = await page.evaluate(() => { SET.planOpen = { gestort: true, waarom: true }; return true; }).then(() => B.bedragen(page));
    }
    await page.close(); return out;
  };
  const oud = await meet(MAIN_HTML), nu = await meet(null);
  expect(Object.keys(nu['2026-11-26']).length).toBeGreaterThan(3);
  expect(nu['2026-11-26'].plan.length).toBeGreaterThan(0);
  expect(nu).toEqual(oud);
});
