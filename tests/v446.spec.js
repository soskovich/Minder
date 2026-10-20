/* v446 (gevraagd door de gebruiker). Kennis "Contant: ik pin na mijn salaris" in Wat Minder van jou weet (groep Contant, door jou).
   Staat hij en is er in de lopende periode nog niet gepind op een rekening, dan rekent blok 23 TUSSENDOOR en het verwachte saldo voor
   de storting geen contant op die rekening, ook ZONDER patroon van 3 maanden, en staat "contant: verwacht na je salaris" erbij met de
   bron. Voor de gebruiker een keer gezaaid als door jou op 17-10 (bij de salarisbron SKF). GECONSTRUEERDE fixture (v432-stand, 19 okt),
   met de Geldmaat-opname van juli weggehaald: dan heeft Leefgeld 2 maanden met een opname, dus geen patroon, en wel contant (mediaan 100). */
const { test, expect } = require('@playwright/test');
const S432 = require('./v432-stand');

async function boot(page) {
  await S432.boot(page, { dag: '2026-10-19' });
  await page.evaluate((LEEF) => { TX = TX.filter((t) => !(t.acc === LEEF && t.date === '2026-07-11' && t.amount === -100)); save(); }, S432.LEEF);
}
const lees = (page) => page.evaluate(() => {
  const SP = salPeriode(), P = rekVoorstel(), b23 = diagRekVerdeling().join('\n');
  const tus = b23.slice(b23.indexOf('TUSSENDOOR'), b23.indexOf('MOMENT 2'));
  const leef = P.rek.find((x) => x.naam === 'Leefgeld'); let kas = 0;
  for (let d = rekDag(vandaagYMD(), 1); d <= SP.cur.eind; d = rekDag(d, 1)) kas += leef.uitDagDelen(d).kas;
  let kasStart = 0; for (let d = rekDag(vandaagYMD(), 1); d < P.start; d = rekDag(d, 1)) kasStart += leef.uitDagDelen(d).kas;
  return { tus, kas, kasStart, ns: leef.kasNaSal, bron: leef.kasNaSalBron, kp: leef.kasPatroon, kM: leef.kasMaand, vs: leef.verwachtSaldo, nu: P.nu };
});

test('a. zonder patroon en zonder kennis wordt er voor de storting contant verwacht (de invoer draagt het geval)', async ({ page }) => {
  await boot(page);
  const r = await lees(page);
  expect(r.kp.dag).toBeNull();
  expect(r.kp.maanden).toBe(2);
  expect(r.kM).toBeGreaterThan(0);
  expect(r.ns).toBe(false);
  expect(r.kas).toBeGreaterThan(0);
  expect(r.tus).not.toContain('contant: verwacht na je salaris');
});

test('b. met de kennis: geen contant tot de storting, het verwachte saldo stijgt met precies dat contant, en de regel noemt de bron', async ({ page }) => {
  await boot(page);
  const voor = await lees(page);
  expect(voor.nu).toBe(false);
  await page.evaluate(() => { openKennis(); });
  await page.locator('[data-kennisgroep="opname"] [data-kasnasalzet]').click();
  const na = await lees(page);
  expect(na.ns).toBe(true);
  expect(na.bron).toBe('kennis');
  expect(na.kas).toBe(0);
  /* het verwachte saldo op de storting: alleen het contant tot die dag valt weg (dagen tussen morgen en de dag voor de storting) */
  expect(voor.kasStart).toBeGreaterThan(0);
  expect(na.kasStart).toBe(0);
  expect(na.vs - voor.vs).toBeCloseTo(voor.kasStart, 6);
  expect(na.tus).toContain('contant: verwacht na je salaris (deze maand nog 0 opgenomen; contant: ik pin na mijn salaris (door jou op ');
  expect(na.tus).not.toContain('je pint gewoonlijk');
  const K = await page.evaluate(() => kasNaSalKennis());
  expect(K.bron).toBe('jij');
  expect(K.soort).toBe('kasnasal');
});

test('c. het scherm: de keuze staat in Contant zolang hij niet gezet is, daarna een rij met door jou, Wijzigen en Vergeten', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => openKennis());
  await expect(page.locator('[data-kennisgroep="opname"] [data-kasnasalkeuze]')).toContainText('Contant: ik pin na mijn salaris');
  await page.locator('[data-kasnasalzet]').click();
  await page.evaluate(() => openKennis());
  await expect(page.locator('[data-kasnasalkeuze]')).toHaveCount(0);
  const rij = page.locator('[data-kennisgroep="opname"] [data-kennisrij="k:kasnasal"]');
  await expect(rij).toContainText('Contant: ik pin na mijn salaris');
  await expect(rij).toContainText('door jou');
  await rij.locator('[data-kennisvergeet]').click();
  await page.locator('[data-kennisvergeetzet]').click();
  const r = await lees(page);
  expect(r.ns).toBe(false);
  expect(r.kas).toBeGreaterThan(0);
  expect(await page.evaluate(() => kasNaSalKennis())).toBeNull();
});

test('d. tegenproef: met een opname in de lopende maand op die rekening telt de kennis niet, het contant komt gewoon', async ({ page }) => {
  await boot(page);
  await page.evaluate((LEEF) => { kennisZet(KASNASAL_KEY, { soort: 'kasnasal', partij: 'Contant', wat: KASNASAL_WAT, tx: [] });
    const t = { id: 'opn1', date: '2026-10-05', amount: -40, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); }, S432.LEEF);
  const r = await lees(page);
  expect(r.ns).toBe(false);
  expect(r.kas).toBeGreaterThan(0);
  expect(r.tus).not.toContain('contant: verwacht na je salaris');
});

test('e. het zaad: een keer door jou op 17-10 bij de salarisbron SKF, niet bij een andere bron, en na vergeten blijft hij weg', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const o = {}; o.anders = (kennisZaai(), kasNaSalKennis());
    for (const t of TX) if (t.amount > 0 && /WERKGEVER/i.test(`${t.name} ${t.desc}`)) { t.name = 'SKF'; t.desc = String(t.desc || '').replace(/WERKGEVER/ig, 'SKF'); }
    TX.forEach(categorize); save();
    o.bron = salBron().naam; kennisZaai(); o.k = JSON.parse(JSON.stringify(kasNaSalKennis()));
    delete SET.kennis[KASNASAL_KEY]; kennisZaai(); o.weg = kasNaSalKennis(); return o; });
  expect(r.anders).toBeNull();
  expect(r.bron).toMatch(/SKF/i);
  expect(r.k).toMatchObject({ soort: 'kasnasal', bron: 'jij', op: '2026-10-17', wat: 'Contant: ik pin na mijn salaris' });
  expect(r.weg).toBeNull();
});
