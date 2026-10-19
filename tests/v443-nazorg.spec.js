/* v443 nazorg (gevraagd door de gebruiker). (3) De kolom onder "Nog te gaan" in de maandkaart op Inzichten (soort alle) heet "Nog
   verwacht": de bedragen zijn verwachte uitgaven (de forecast van de groep min wat er al uit is), geen resterend budget; dat staat
   in de kop (EUR X van EUR Y). De sheet achter "in potjes" in zijn forecast-vorm heet ook zo. De soort-tabs Vast en Variabel houden
   "Nog te gaan", want daar is "nog" het resterende budget. (4) De markering "gestopt" die Minder op Ml Macnack zette draagt bron en
   datum (gestoptDoor), en blok 20 KENNIS noemt die: "door Minder gezet op <dd-mm>, op basis van jouw 'opgezegd, loopt af'". Een
   markering van voor deze stap krijgt dat een keer, met de dag van de rechtzetting. (2) De te-ruim-sheet droeg nog "Reserveringen en
   beleggen komen in v441.", een belofte van een ronde die al voorbij is; die regel is weg, en daarmee past de sheet weer op 390x844
   (grip-eigen-budget B). GECONSTRUEERDE fixtures. */
const { test, expect } = require('@playwright/test');
const S432 = require('./v432-stand');
const K = require('./grip-kring-stand');
const CATH = 'NL77ABNA0599037806';

async function bootWoning(page, o = {}) {
  await S432.boot(page, { dag: '2026-10-19' });
  return await page.evaluate(({ CATH, o, LEEF }) => {
    const add = (t) => { categorize(t); TX.push(t); };
    add({ id: 'mac1', date: '2026-07-01', amount: -650, acc: LEEF, name: 'Ml Macnack', desc: 'OVERBOEKING ML MACNACK HUUR JULI', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    for (const d of ['2026-09-01', '2026-10-01']) add({ id: 'ca' + d, date: d, amount: -300, acc: LEEF, name: 'Nathaniel Cathalina via SEPA iDEAL/Wero', desc: 'SEPA IDEAL TIKKIE NATHANIEL CATHALINA VIA SEPA IDEAL/WERO ' + CATH + ' HUUR', typ: '', ref: '', src: 'csv', accName: '', refNums: ['506417344'] });
    const mk = 'woning|' + recurKey(TX.find((t) => t.name === 'Ml Macnack'));
    SET.kennis = SET.kennis || {};
    SET.kennis[mk] = Object.assign({ soort: 'woning', partij: 'Ml Macnack', wat: 'Woonhuur (gestopt)', ja: true, tx: [], bron: 'jij', op: '2026-06-01', zaad: 'macnack' },
      o.alGestopt ? { gestopt: '2026-08', wat: 'Woonhuur (vorige woning)' } : {});
    SET.kennis425 = Object.assign(SET.kennis425 || {}, { macnack: '2026-06-01' }, o.alGestopt ? { macnack443: '2026-10-18' } : {});
    kennisZaai(); save();
    return { E: SET.kennis[mk], b20: diagSalarisVerdeling().join("\n"), Z: SET.kennis425 };
  }, { CATH, o, LEEF: S432.LEEF });
}

test('4a. de rechtzetting zet bron en datum, en blok 20 KENNIS noemt ze', async ({ page }) => {
  const r = await bootWoning(page);
  expect(r.E.gestopt).toBe('2026-08');
  expect(r.E.gestoptDoor).toEqual({ door: 'minder', op: '2026-10-19', grond: "jouw 'opgezegd, loopt af'" });
  expect(r.b20).toContain("gestopt vanaf aug 2026 · door Minder gezet op 19-10, op basis van jouw 'opgezegd, loopt af'");
  // de regel hangt onder de KENNIS-regel van Macnack, en niet onder een andere
  const L = r.b20.split('\n'), i = L.findIndex((l) => /\| Ml Macnack \|/.test(l));
  expect(i).toBeGreaterThan(-1);
  expect(L[i + 1]).toMatch(/^ {4}gestopt vanaf aug 2026 · door Minder gezet op 19-10/);
});

test('4b. een markering van voor deze stap krijgt een keer bron en datum, met de dag van de rechtzetting', async ({ page }) => {
  const r = await bootWoning(page, { alGestopt: true });
  expect(r.E.gestoptDoor).toEqual({ door: 'minder', op: '2026-10-18', grond: "jouw 'opgezegd, loopt af'" });
  expect(r.b20).toContain('door Minder gezet op 18-10');
  expect(r.Z.macnackBron).toBe('2026-10-19');
});

test('4c. een woning zonder markering krijgt geen gestopt-regel', async ({ page }) => {
  const r = await bootWoning(page);
  const L = r.b20.split('\n'), i = L.findIndex((l) => /\| Nathaniel Cathalina \|/.test(l));
  expect(i).toBeGreaterThan(-1);
  expect(L[i + 1] || '').not.toMatch(/gestopt vanaf/);
});

test('3. de kolom heet Nog verwacht op de alle-kaart en in de forecast-sheet; de soort-tabs houden Nog te gaan', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page);
  const r = await page.evaluate(() => { go('ins'); const d = document.getElementById('insMaand');
    const kop = d.querySelector('[data-inslegnog]');
    const uit = { kop: kop ? kop.innerText.trim() : null, alle: d.innerText };
    openInsTegel('potjes', 1); uit.sheet = document.querySelector('#insTegelSheet').innerText; closeSheet();
    window._insSoort = 'var'; renderIns(); uit.var = document.getElementById('insMaand').innerText;
    window._insSoort = 'alle'; renderIns(); return uit; });
  expect(r.kop.toLowerCase()).toBe('nog verwacht');
  expect(r.alle).not.toMatch(/nog te gaan/i);
  expect(r.sheet).toMatch(/^Nog verwacht · in potjes/i);
  expect(r.var).toMatch(/nog te gaan/i);
});

test('2. de te-ruim-sheet belooft geen ronde die al voorbij is', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page);
  await page.evaluate(() => { go('maand'); openTeRuim('huur'); });
  await page.click('[data-teruimoptie="b"]'); await page.fill('[data-teruimbedrag]', '400'); await page.click('[data-teruimbestem="pot:uiteten"]');
  const t = await page.evaluate(() => document.getElementById('sheet').innerText);
  expect(t).not.toMatch(/v441/);
  expect(await page.locator('[data-teruimv441]').count()).toBe(0);
});
