/* v448-nazorg (gevraagd door de gebruiker): een negatieve contant-uitgave zonder stand begin is geld uit een eerdere opname. Het
   overschot gaat als correctie terug naar de vorige periode (uitgegeven daar − overschot, nooit onder nul); deze periode is 0 tot de
   telling, plus het tempo daarna. Kan de vorige periode het niet dragen, dan blijft de rest gemeld. GECONSTRUEERDE fixture
   (v448-stand); de getallen van het toestel (24-08 t/m 23-09 EUR 700 -> EUR 380) bouwt optie vorigOpn na: EUR 300 + EUR 400 = 700. */
const { test, expect } = require('@playwright/test');
const S = require('./v448-stand');

const b20 = (page) => page.evaluate(() => diagSalarisVerdeling().join('\n'));
const regel = (b, re) => b.split('\n').find((l) => re.test(l)) || '';
const perioden = (page) => page.evaluate(() => contantPeriodenGecorr().map((x) => ({ start: x.start, eind: x.eind, lopend: x.lopend, begin: !!x.begin,
  uitgegeven: x.uitgegeven, ruw: x.uitgegevenRuw, uitkomst: x.uitkomst, verwachtNa: x.verwachtNa, sluit: x.sluit,
  correctie: x.correctie ? { bedrag: x.correctie.bedrag, telling: x.correctie.telling } : null,
  corr: x.corr ? { bedrag: x.corr.bedrag, rest: x.corr.rest, overschot: x.corr.overschot, telling: x.corr.telling, naar: x.corr.naar && x.corr.naar.start } : null })));

test('a. de stand van het toestel: 24-08 t/m 23-09 EUR 700 -> EUR 380 (correctie −320 uit telling 07-10), lopend 0 tot 07-10 + 232 volgens tempo', async ({ page }) => {
  await S.boot(page, { vorigOpn: 400 });
  const P = await perioden(page);
  const vorig = P.find((x) => x.start === '2026-08-24'), nu = P.find((x) => x.start === '2026-09-24');
  /* de invoer draagt het geval: vorige periode 700 zonder telling, deze periode −320 zonder stand begin */
  expect(vorig.ruw).toBe(700);
  expect(nu.ruw).toBe(-320);
  expect(nu.begin).toBe(false);
  expect(vorig.uitgegeven).toBe(380);
  expect(vorig.correctie).toEqual({ bedrag: 320, telling: '2026-10-07' });
  expect(nu.uitgegeven).toBe(0);
  expect(nu.corr).toEqual({ bedrag: 320, rest: 0, overschot: 320, telling: '2026-10-07', naar: '2026-08-24' });
  expect(nu.verwachtNa).toBeCloseTo(400 * 18 / 31, 2);
  expect(nu.uitkomst).toBeCloseTo(232.26, 2);
  /* de andere periodes ongemoeid */
  expect(P.filter((x) => x.correctie || x.corr).length).toBe(2);
  for (const x of P) if (!x.correctie && !x.corr) expect(x.uitgegeven).toBe(x.ruw);
  const b = await b20(page);
  expect(regel(b, /^    24-08 t\/m 23-09 \|/)).toContain('| 380.00 (was 700.00, correctie −320.00 uit telling 07-10)');
  expect(regel(b, /^    24-09 t\/m 25-10\*/)).toContain('tot de telling 0.00 (was -320.00, overschot 320.00 naar de vorige periode)');
  const cr = regel(b, /^    24-09 t\/m 25-10: uitgegeven -320.00 zonder telling/);
  expect(cr).toContain('correctie −320.00 op 24-08 t/m 23-09 (700.00 -> 380.00), uit telling 07-10');
  expect(cr).toContain('deze periode 0.00 tot de telling, daarna 232.26 volgens tempo = 232.26');
  expect(cr).not.toContain('REST');
  expect(regel(b, /CONTROLE formule = loop/)).toContain('sluit in alle');
});

test('b. de vorige periode kan het overschot niet dragen: corrigeren tot 0, nooit onder nul, en de rest gemeld', async ({ page }) => {
  await S.boot(page);
  const P = await perioden(page);
  const vorig = P.find((x) => x.start === '2026-08-24'), nu = P.find((x) => x.start === '2026-09-24');
  expect(vorig.ruw).toBe(300);
  expect(vorig.uitgegeven).toBe(0);
  expect(vorig.correctie.bedrag).toBe(300);
  expect(nu.corr).toMatchObject({ bedrag: 300, rest: 20, overschot: 320 });
  expect(nu.uitgegeven).toBe(0);
  for (const x of P) expect(x.uitgegeven).toBeGreaterThanOrEqual(0);
  const cr = regel(await b20(page), /^    24-09 t\/m 25-10: uitgegeven -320.00/);
  expect(cr).toContain('correctie −300.00 op 24-08 t/m 23-09 (300.00 -> 0.00)');
  expect(cr).toContain('REST 20.00 niet verdeeld');
});

test('c. met een telling bij de start is er geen correctie: dan is de negatieve uitgave een meting tegen die telling', async ({ page }) => {
  await S.boot(page, { vorigOpn: 400, beginTelling: 0 });
  const P = await perioden(page);
  const nu = P.find((x) => x.start === '2026-09-24');
  expect(nu.begin).toBe(true);
  expect(nu.uitgegeven).toBe(-320);
  expect(nu.corr).toBeNull();
  expect(P.every((x) => !x.correctie)).toBe(true);
  expect(regel(await b20(page), /CORRECTIES negatieve uitgave/)).toContain(': geen');
});

test('d. contantPeriode() zelf blijft de ruwe meting; de correctie zit alleen in contantCorrigeer()', async ({ page }) => {
  await S.boot(page, { vorigOpn: 400 });
  const r = await page.evaluate(() => [contantPeriode({ start: '2026-08-24', eind: '2026-09-23' }).uitgegeven, contantPeriode({ start: '2026-09-24', eind: '2026-10-25' }).uitgegeven]);
  expect(r).toEqual([700, -320]);
});
