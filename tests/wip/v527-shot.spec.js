/* v527 deel C: schermafdrukken op 390px van de nagebouwde stand (niet committen), het bewijs dat de server deze index.html serveert, en een
   nagebouwde export om tests/wip/v527-export.spec.js droog te draaien (de getallen van het toestel gelden daar niet). */
const fs = require('fs'), crypto = require('crypto');
const { test, expect } = require('../klok');
const S = require('../v527-stand');
const UIT = process.env.V527_SHOT || '/tmp';
test('schermen en geserveerde bron', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dubbel: true });
  const body = await page.evaluate(async () => (await fetch('/index.html', { cache: 'no-store' })).text());
  const lokaal = fs.readFileSync(__dirname + '/../../index.html', 'utf8');
  const h = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);
  console.log('geserveerd', h(body), 'lokaal', h(lokaal), body.length, lokaal.length);
  expect(h(body)).toBe(h(lokaal));
  await page.evaluate(() => { go('ins'); renderIns(); window.scrollTo(0, 0); });
  await page.screenshot({ path: UIT + '/v527-inzichten.png', fullPage: true });
  await page.evaluate(() => openInsPotjesPeriode()); await page.waitForTimeout(400);
  await page.screenshot({ path: UIT + '/v527-sheet-potjes.png' });
  await page.evaluate(() => { closeSheet(); go('maand'); gripKiesTab('begrijpen'); window.scrollTo(0, 0); });
  await page.screenshot({ path: UIT + '/v527-grip-begrijpen.png', fullPage: true });
  await page.evaluate(() => openGripPatroon()); await page.waitForTimeout(400);
  await page.screenshot({ path: UIT + '/v527-tabel.png' });
  await page.evaluate(() => { closeSheet(); gripKiesTab('kiezen'); window.scrollTo(0, 0); });
  await page.screenshot({ path: UIT + '/v527-kiezen.png', fullPage: true });
  /* overlap van de kolommen in de tabel en in de stand-kaart */
  const ov = await page.evaluate(() => { gripKiesTab('begrijpen'); const k = document.getElementById('gripStand');
    const kaart = [...k.querySelectorAll('[data-standrij]')].map((rw) => { const sp = rw.querySelectorAll(':scope > span, :scope > b'); if (sp.length < 2) return 0; const a = sp[0].getBoundingClientRect(), b = sp[sp.length - 1].getBoundingClientRect(); return +(a.right - b.left).toFixed(1); });
    openGripPatroon(); const sh = document.getElementById('gripPatroonSheet');
    const tab = [...sh.querySelectorAll('[data-patroonrij],[data-patroontotaal]')].map((rw) => { const n = rw.firstElementChild.getBoundingClientRect(), ru = rw.querySelector('[data-kol="ruimte"]').getBoundingClientRect(), ve = rw.querySelector('[data-kol="verwacht"]').getBoundingClientRect(); return [+(n.right - ru.left).toFixed(1), +(ru.right - ve.left).toFixed(1)]; });
    closeSheet(); return { kaart, tab }; });
  console.log('overlap', JSON.stringify(ov));
  /* de nagebouwde export */
  const ex = await page.evaluate(() => ({ tx: JSON.parse(localStorage.getItem('minder_tx') || '[]'), ovr: JSON.parse(localStorage.getItem('minder_ovr') || '{}'), own: JSON.parse(localStorage.getItem('minder_own') || '[]'),
    accmeta: JSON.parse(localStorage.getItem('minder_accmeta') || '{}'), plan: JSON.parse(localStorage.getItem('minder_plan') || '{}'), set: JSON.parse(localStorage.getItem('minder_set') || '{}') }));
  fs.writeFileSync(UIT + '/v527-nagebouwd-export.json', JSON.stringify(ex));
});
