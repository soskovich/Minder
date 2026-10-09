/* v362: DE SHEET VASTE LASTEN VERKLAART DE STAP IN DE BRIDGE. De kop is dezelfde rekensom als de stap ("EUR 953
   budget − EUR 390 verwacht = EUR 563 onder budget"), per regel staat het verschil met eronder wat in het budget
   staat en wat verwacht wordt, gesorteerd op het absolute verschil, en regels zonder verschil staan samen onder
   "N vaste lasten volgens budget". Fixture: deze-maand-stand.js met Huur op vast, potje EUR 700 en een betaling van
   EUR 137 deze maand. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand');

const BUD = { huur: 700, verzekering: 675, abonnement: 100, sport: 600, vices: 50, boodschappen: 500 };
async function start(page, aard) {
  await boot(page, { set: { potAard: aard || { huur: 'vast' }, budgets: BUD } });
  await page.evaluate(() => { const st = document.createElement('style'); st.textContent = '*{animation:none!important}'; document.head.appendChild(st);
    const t = TX.find((x) => x.date === '2026-10-01' && /HUUR/.test(x.desc)); t.amount = -137; save(); });
}
const lees = (page) => page.evaluate(() => { const g = document.getElementById('gripVast');
  return { kop: g.querySelector('[data-vastkop]').innerText, stap: +g.dataset.vaststap,
    rijen: [...g.querySelectorAll('[data-vastpotje]')].map((e) => [e.dataset.vastpotje, +e.dataset.vastverschil]),
    nul: (g.querySelector('[data-vastnul]') || {}).innerText || '', brug: dezeMaandBrug(maandVooruit()).stappen.find((s) => s.soort === 'vast').waarde }; });

test('a. Huur 700/137: kop, regel en stap zeggen -563, de rest is EUR 0 en samengevoegd', async ({ page }) => {
  await start(page);
  await page.evaluate(() => openGripVast());
  const r = await lees(page);
  expect(r.brug).toBe(-563);
  expect(r.stap).toBe(-563);
  expect(r.kop).toBe('€953 budget − €390 verwacht = €563 onder budget');
  expect(r.rijen).toEqual([['huur', -563]]);
  expect(r.nul).toContain('3 vaste lasten volgens budget');
  const huur = await page.locator('[data-vastpotje="huur"]').innerText();
  expect(huur).toContain('€700 in budget · €137 verwacht (€137 betaald, €0 komt nog)');
  expect(huur).toContain('-€563');
});

test('b. uitgeklapt: de regels volgens budget hebben EUR 0, en alle verschillen samen zijn de stap', async ({ page }) => {
  await start(page);
  await page.evaluate(() => openGripVast());
  await page.evaluate(() => document.querySelector('[data-vastnul]').click());
  const r = await lees(page);
  expect(r.rijen.map((x) => x[0]).sort()).toEqual(['abonnement', 'huur', 'sport', 'verzekering']);
  expect(r.rijen.filter((x) => x[0] !== 'huur').every((x) => x[1] === 0)).toBe(true);
  expect(r.rijen.reduce((a, x) => a + x[1], 0)).toBe(r.brug);
  await expect(page.locator('[data-vastpotje="verzekering"]')).toContainText('€150 in budget · €150 verwacht (€0 betaald, €150 komt nog)');
  // weer dicht
  await page.evaluate(() => document.querySelector('[data-vastnul]').click());
  expect((await lees(page)).rijen.length).toBe(1);
});

test('c. twee regels met een verschil: gesorteerd op het absolute verschil, en de som blijft de stap', async ({ page }) => {
  await start(page, { huur: 'vast', abonnement: 'vast' });
  await page.evaluate(() => openGripVast());
  const r = await lees(page);
  expect(r.rijen).toEqual([['huur', -563], ['abonnement', -70]]);
  expect(r.nul).toContain('2 vaste lasten volgens budget');
  expect(r.brug).toBe(-633);
  expect(r.kop).toBe('€1.023 budget − €390 verwacht = €633 onder budget');
});

test('d. de bridge-stap opent deze sheet, en op 360 en 390px geen overloop', async ({ page }) => {
  await start(page);
  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 640 });
    await page.evaluate(() => { closeSheet(); go('maand'); renderMaand(); });
    await page.evaluate(() => document.querySelector('#gripBrug [data-brugstap="vast"]').click());
    await page.waitForSelector('#gripVast');
    const m = await page.evaluate(() => { const g = document.getElementById('gripVast'), s = document.getElementById('sheet'), sb = s.getBoundingClientRect();
      const uit = [...g.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width && (q.right > sb.right + 0.5); }).length;
      return { h: Math.round(g.getBoundingClientRect().height), uit, ox: s.scrollWidth - s.clientWidth }; });
    console.log(`gripVast ${w}px: ${m.h}px`);
    expect(m.uit).toBe(0);
    expect(m.ox).toBeLessThanOrEqual(0);
  }
});
