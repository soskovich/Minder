/* v507 a: een spec zonder eigen datum draait op de standaardklok van tests/klok.js, in Node EN in de pagina.
   DE SABOTAGE IS DE KLOK UITZETTEN (ECHTE_KLOK=1): dan leest deze spec de systeemdatum en valt hij, net als de specs die
   zonder centrale klok aan de kalender hingen (gemeten op 1 nov: 47 rood op main). */
const { test, expect } = require('./klok');
const { STANDAARD_YMD, standaardDatum } = require('./vaste-dag');
const { seed, open } = require('./budget-fixture');

const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

test('v507 a: zonder eigen datum leest Node de standaarddag', () => {
  expect(ymd(new Date())).toBe(STANDAARD_YMD);
  expect(ymd(new Date(Date.now()))).toBe(STANDAARD_YMD);
  /* de Node-klok loopt door vanaf 12:00 (een duurmeting blijft werken), en blijft binnen dezelfde dag */
  const d = Date.now() - standaardDatum().getTime();
  expect(d).toBeGreaterThanOrEqual(0);
  expect(d).toBeLessThan(12 * 3600 * 1000);
});

test('v507 a: zonder eigen datum leest de pagina de standaarddag, ook bij de boot', async ({ page }) => {
  await open(page, seed());
  const r = await page.evaluate(() => ({ ymd: vandaagYMD(), ym: thisYM(), uur: new Date().getHours() }));
  expect(r.ymd).toBe(STANDAARD_YMD);
  expect(r.ym).toBe(STANDAARD_YMD.slice(0, 7));
  expect(r.uur).toBe(12);
});
