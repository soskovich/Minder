const { test } = require('@playwright/test');
const S = require('./v437-stand');
test('p', async ({ page }) => { await S.boot(page);
  console.log(await page.evaluate(() => { const V=maandVooruit(), I=brugIndeling(V); return JSON.stringify(I.groepen.map(g=>[g.k,Math.round(g.b),Math.round(g.v),g.d,(g.pots||[]).map(x=>x.k+':'+x.d.toFixed(1)+':w'+x.w)])); }));
});
