// v97: het Privé-thema haalt WCAG AA voor tekst-tokens op zowel de pagina- als de kaartachtergrond.
// Alleen Privé is bijgesteld; standaard en Aurora blijven wat ze waren.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

async function boot(page) {
  await open(page, seed());
  await page.waitForSelector('#s-dash');
}
// relatieve luminantie volgens WCAG, net als in themas.spec.js
const meet = (page) => page.evaluate(() => {
  const rgb = (c) => { const d = document.createElement('i'); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v.match(/[\d.]+/g).slice(0, 3).map(Number); };
  const L = (c) => { const s = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
  const ratio = (a, b) => { const l1 = L(a), l2 = L(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const cs = getComputedStyle(document.documentElement); const t = (k) => cs.getPropertyValue(k).trim();
  const uit = {};
  for (const k of ['--txt', '--mut', '--mut2', '--amber', '--red', '--green', '--accent', '--lab', '--ref', '--blue']) {
    uit[k] = { waarde: t(k), bg: ratio(t(k), t('--bg')), card: ratio(t(k), t('--card')) };
  }
  return uit;
});

test('a · Privé: elk tekst-token haalt AA op pagina én kaart', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => setTheme('prive'));
  const r = await meet(page);
  for (const k of ['--txt', '--mut', '--mut2', '--amber', '--red', '--green', '--accent', '--lab', '--ref', '--blue']) {
    expect(r[k].bg, `${k} op --bg (${r[k].waarde})`).toBeGreaterThanOrEqual(4.5);
    expect(r[k].card, `${k} op --card (${r[k].waarde})`).toBeGreaterThanOrEqual(4.5);
  }
});

test('b · de bijgestelde tokens zijn donkerder dan voorheen, met dezelfde tint', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => setTheme('prive'));
  const r = await meet(page);
  // de vier die eerder onder AA zaten
  expect(r['--mut2'].waarde).toBe('#676e68');
  expect(r['--amber'].waarde).toBe('#91651d');
  expect(r['--green'].waarde).toBe('#2e7958');
  expect(r['--ref'].waarde).toBe('#666e69');
  // en de tint is niet omgeslagen: amber blijft warm (rood > blauw), groen blijft groen
  const kanaal = (hex) => [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16));
  const [ar, , ab] = kanaal(r['--amber'].waarde); expect(ar).toBeGreaterThan(ab);
  const [gr, gg, gb] = kanaal(r['--green'].waarde); expect(gg).toBeGreaterThan(gr); expect(gg).toBeGreaterThan(gb);
});

test('c · standaard en Aurora zijn niet aangeraakt', async ({ page }) => {
  await boot(page);
  const verwacht = {
    standaard: { '--mut2': '#7f8ba1', '--amber': '#f5b544', '--red': '#e2685f', '--green': '#34d399', '--ref': '#56627d' },
    aurora: { '--mut2': '#7e8ba4', '--amber': '#f5b544', '--red': '#e2685f', '--green': '#34d399', '--ref': '#5b6a86' },
  };
  for (const thema in verwacht) {
    await page.evaluate((t) => setTheme(t), thema);
    const r = await meet(page);
    for (const k in verwacht[thema]) expect(r[k].waarde, `${thema} ${k}`).toBe(verwacht[thema][k]);
    expect(r['--txt'].bg, `${thema} tekst`).toBeGreaterThan(7);        // donkere thema's blijven ruim boven AA
  }
});

test('d · Privé blijft er licht uitzien en de app rendert normaal', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { setTheme('prive'); go('ins'); });
  await page.waitForSelector('#insKpiStrip');
  const r = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    const html = document.getElementById('s-ins').innerText;
    return { bg: cs.getPropertyValue('--bg').trim(), serif: /serif/i.test(cs.getPropertyValue('--font-head')), tekst: html.length };
  });
  expect(r.bg).toBe('#f6f2e9');                                        // ivoor, niet donkerder gemaakt
  expect(r.serif).toBe(true);
  expect(r.tekst).toBeGreaterThan(50);
});
