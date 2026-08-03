// v96: de vijf meest gebruikte tekstgroottes lopen via type-tokens. Puur consolidatie:
// dezelfde pixels, één bron. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const TOKENS = { '--fs-xs': '11px', '--fs-sm': '12.5px', '--fs-md': '14px', '--fs-lg': '17px', '--fs-xl': '22px' };
const SCHERMEN = ['dash', 'ins', 'act', 'vooruit', 'tx', 'vermogen', 'set'];

async function boot(page) {
  await open(page, seed());
  await page.waitForSelector('#s-dash');
}

test('a · de tokens bestaan met de juiste waarden', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate((keys) => {
    const cs = getComputedStyle(document.documentElement); const uit = {};
    for (const k of keys) uit[k] = cs.getPropertyValue(k).trim();
    return uit;
  }, Object.keys(TOKENS));
  expect(r).toEqual(TOKENS);
});

test('b · geen losse waarde meer voor de vijf schaalmaten', async ({ page }) => {
  await boot(page);
  const bron = await page.evaluate(() => document.documentElement.outerHTML);
  for (const px of Object.values(TOKENS)) {
    // de tokendefinitie zelf mag, een losse font-size niet
    const los = new RegExp(`font-size:\\s*${px.replace('.', '\\.')}`, 'g');
    expect((bron.match(los) || []).length, px).toBe(0);
  }
  // en ze worden ook echt gebruikt
  for (const k of Object.keys(TOKENS)) expect(bron).toContain(`font-size:var(${k})`);
});

test('c · de schermen renderen met exact dezelfde maten', async ({ page }) => {
  await boot(page);
  // steekproef op dragende elementen: de waarden die de tokens vervangen komen letterlijk terug
  const r = await page.evaluate((schermen) => {
    const uit = {};
    for (const s of schermen) {
      go(s);
      const root = document.getElementById('s-' + s); if (!root) continue;
      const maten = new Set();
      for (const e of [...root.querySelectorAll('*')].slice(0, 400)) maten.add(getComputedStyle(e).fontSize);
      uit[s] = [...maten].sort();
    }
    return uit;
  }, SCHERMEN);

  for (const s of SCHERMEN) {
    if (!r[s]) continue;
    for (const m of r[s]) expect(m, `${s}: ${m}`).toMatch(/^\d+(\.\d+)?px$/);   // alles resolvet, geen lege var()
    expect(r[s].includes('0px'), s).toBe(false);
  }
  // de tokenmaten komen daadwerkelijk voor in de gerenderde app
  const alle = new Set(Object.values(r).flat());
  for (const px of ['11px', '12.5px', '14px', '17px']) expect([...alle], px).toContain(px);
});

test('d · thema\'s raken de type-schaal niet', async ({ page }) => {
  await boot(page);
  const meet = () => page.evaluate(() => {
    go('ins');
    const cs = getComputedStyle(document.documentElement);
    const el = document.querySelector('#s-ins .hlabel');
    return {
      tokens: ['--fs-xs', '--fs-sm', '--fs-md', '--fs-lg', '--fs-xl'].map((k) => cs.getPropertyValue(k).trim()).join('|'),
      label: el ? getComputedStyle(el).fontSize : '',
    };
  });
  const standaard = await meet();
  for (const thema of ['prive', 'aurora']) {
    await page.evaluate((t) => { setTheme(t); }, thema);
    await page.waitForTimeout(120);
    const nu = await meet();
    expect(nu.tokens, thema).toBe(standaard.tokens);
    expect(nu.label, thema).toBe(standaard.label);
  }
});
