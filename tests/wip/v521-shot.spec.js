const { test } = require('../klok');
const S = require('../v521-stand'); const V = require('../v520-stand');
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
test('shots', async ({ page }) => {
  await S.boot(page);
  await V.stubVraag(page, Object.assign({}, V.LEEG, { soort: 'inkomenVerdeling' }));
  await V.vraag(page, 'Van elke euro die binnenkomt, hoeveel geef ik uit?');
  await page.waitForTimeout(400);
  await page.locator('#sheet').screenshot({ path: '/tmp/claude-0/-home-user-Minder/d3308f90-1d1b-51a5-b5b1-9bef4d3ad46b/scratchpad/v521-inkomenverdeling.png' });
  await V.stubVraag(page, Object.assign({}, V.LEEG, { soort: 'onbekend' })); await V.vraag(page, 'Wat is de zin van het leven?');
  await V.stubVraag(page, Object.assign({}, V.LEEG, { soort: 'som' })); await V.vraag(page, 'Hoeveel gaf ik uit?');
  await page.evaluate(() => { closeSheet(); diagOpen(); }); await page.waitForSelector('#diagVraagNiet [data-vraagniet]', { state: 'attached' }); await page.locator('#diagVraagNiet').scrollIntoViewIfNeeded();

  await page.locator('#diagVraagNiet').screenshot({ path: '/tmp/claude-0/-home-user-Minder/d3308f90-1d1b-51a5-b5b1-9bef4d3ad46b/scratchpad/v521-diagnose.png' });
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, document.getElementById('sheet').scrollWidth, document.getElementById('sheet').clientWidth]); console.log('breedte', JSON.stringify(w));
});
