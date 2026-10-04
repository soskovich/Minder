/* v338b: OVERBOEKINGEN TUSSEN JE EIGEN REKENINGEN, HERKEND AAN DE NAMEN UIT JE BANKKOPPELING.
   De namen komen uit SET.psd2Accounts (label zonder de laatste vier cijfers). Per naam een lijst van de
   boekingen die zouden omzetten; pas jouw bevestiging laat ze als overboeking tellen. Niets stil.
   De klok staat op 4 oktober 2026, dus september is de maand van de afsluiting. */
const { test, expect } = require('@playwright/test');
const { boot, MAIN } = require('./bezit-koppeling.fixture');

const PA = {
  psd2_res: { label: 'Reservering ··7586', bank: 'N26' },
  psd2_leef: { label: 'Leefgeld ··1234', bank: 'N26' },
  psd2_x: { label: 'Rekening', bank: 'N26' },          // de terugval als de bank geen naam gaf
  abn1: { label: 'V E Sumter ··1111', bank: 'ABN AMRO' },
};
async function stand(page, o) {
  o = o || {};
  await boot(page, { dag: '2026-10-04', set: Object.assign({ budgetMonth: '2026-10', psd2Accounts: PA }, o.set || {}) });
  await page.evaluate(([ovrMin50, MAIN]) => {
    const mk = (id, acc, date, amount, name, src) => ({ id, date, amount, acc, name, desc: name, typ: '', ref: '', src: src || 'psd2', accName: '', refNums: [] });
    TX.push(mk('l1', 'psd2_leef', '2026-09-22', 50, 'From Reservering to Leefgeld'));
    TX.push(mk('l2', 'psd2_res', '2026-09-22', -50, 'From Reservering to Leefgeld'));
    TX.push(mk('l3', 'psd2_res', '2026-08-10', 80, 'From Leefgeld to Reservering'));
    TX.push(mk('l4', 'psd2_leef', '2026-08-10', -80, 'From Leefgeld to Reservering'));
    TX.push(mk('l5', MAIN, '2026-09-12', -200, 'To Reservering', 'csv'));
    TX.push(mk('l6', 'psd2_leef', '2026-09-14', -15, 'Leefgeld Bakkerij'));
    TX.push(mk('l7', 'psd2_leef', '2026-09-16', -60, 'From Main to Leefgeld'));   // al intern via de vaste lijst
    TX.push(mk('l8', 'psd2_res', '2026-09-15', -30, 'From Reservering to Leefgeld'));
    TX.forEach(categorize); applyOwnAccounts(); buildAccMeta();
    const id = (n, d, a) => TX.find((t) => t.name === n && t.date === d && t.amount === a).id;
    OVR[id('From Reservering to Leefgeld', '2026-09-15', -30)] = 'overig';   // "Overig klopt"
    if (ovrMin50) OVR[id('From Reservering to Leefgeld', '2026-09-22', -50)] = 'overig';
    TX.forEach(categorize); applyOwnAccounts(); save();
  }, [!!o.ovrMin50, MAIN]);
}
const cat = (page, n, d, a) => page.evaluate(([n, d, a]) => catOf(TX.find((t) => t.name === n && t.date === d && t.amount === a)), [n, d, a]);
const groepen = (page) => page.evaluate(() => eigenNaamKandidaten().map((g) => ({ key: g.key, status: g.status, rijen: g.rijen.map((t) => t.name + '|' + t.date + '|' + t.amount).sort(), eigen: g.eigen.length })));
const alleCats = (page) => page.evaluate(() => TX.map((t) => t.id + ':' + catOf(t)).sort().join(','));

test('a. de namen komen uit je bankkoppeling, zonder de terugval "Rekening"', async ({ page }) => {
  await stand(page);
  const n = await page.evaluate(() => eigenNamenUitKoppeling().map((x) => x.key).sort());
  expect(n).toEqual(['leefgeld', 'reservering', 'v e sumter']);
});

test('b. de kandidaten per naam: alleen "van/naar <naam>" of precies de naam, en niet wat al intern is', async ({ page }) => {
  await stand(page);
  // invoer: de +50 erft nu Overig van zijn eigen tegenkant, dat is de melding
  expect(await cat(page, 'From Reservering to Leefgeld', '2026-09-22', 50)).toBe('overig');
  expect(await cat(page, 'From Main to Leefgeld', '2026-09-16', -60)).toBe('intern');
  const G = await groepen(page);
  const leef = G.find((g) => g.key === 'leefgeld'), res = G.find((g) => g.key === 'reservering');
  expect(leef.status).toBe('open');
  expect(leef.rijen).toEqual(['From Leefgeld to Reservering|2026-08-10|-80', 'From Leefgeld to Reservering|2026-08-10|80', 'From Reservering to Leefgeld|2026-09-22|-50', 'From Reservering to Leefgeld|2026-09-22|50']);
  expect(leef.eigen).toBe(1);   // de -30 met "Overig klopt"
  expect(res.rijen).toContain('To Reservering|2026-09-12|-200');
  // geen naam die toevallig in een winkelnaam staat
  expect(G.flatMap((g) => g.rijen).some((r) => r.startsWith('Leefgeld Bakkerij'))).toBe(false);
  // de +80 in augustus erft net als de +50 de categorie van zijn eigen tegenkant
  expect(await cat(page, 'From Leefgeld to Reservering', '2026-08-10', 80)).toBe('overig');
});

test('c. niets stil: openen en voorrekenen schrijft niets en laat elke categorie staan', async ({ page }) => {
  await stand(page);
  const voor = await alleCats(page);
  await page.evaluate(() => { window._schrijf = 0; const o = localStorage.setItem.bind(localStorage); localStorage.setItem = (k, v) => { window._schrijf++; return o(k, v); }; });
  await page.evaluate(() => openEigenNamen());
  await expect(page.locator('#eigenNamen')).toBeVisible();
  expect(await page.evaluate(() => [window._schrijf, !!SET.eigenNamen])).toEqual([0, false]);
  expect(await alleCats(page)).toBe(voor);
});

test('d. bevestigen zet de boekingen met die naam om, en laat een eigen keuze en een winkelnaam staan', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => openEigenNamen());
  await page.click('[data-eigengroep="leefgeld"] [data-eigenja]');
  expect(await cat(page, 'From Reservering to Leefgeld', '2026-09-22', 50)).toBe('intern');
  expect(await cat(page, 'From Reservering to Leefgeld', '2026-09-22', -50)).toBe('intern');
  expect(await cat(page, 'From Leefgeld to Reservering', '2026-08-10', -80)).toBe('intern');
  expect(await cat(page, 'From Reservering to Leefgeld', '2026-09-15', -30)).toBe('overig');
  expect(await cat(page, 'Leefgeld Bakkerij', '2026-09-14', -15)).not.toBe('intern');
  expect(await cat(page, 'To Reservering', '2026-09-12', -200)).not.toBe('intern');   // andere naam, nog open
  const st = await page.evaluate(() => ({ b: Object.keys(SET.eigenNamen || {}), saved: JSON.parse(localStorage.getItem('minder_set')).eigenNamen }));
  expect(st.b).toEqual(['leefgeld']);
  expect(Object.keys(st.saved)).toEqual(['leefgeld']);
  await expect(page.locator('[data-eigengroep="leefgeld"]')).toHaveAttribute('data-eigenstatus', 'bevestigd');
});

test('e. het voorgerekende effect op september is wat er na bevestigen gemeten wordt', async ({ page }) => {
  await stand(page);
  const E = await page.evaluate(() => eigenNaamEffect(['reservering'], '2026-09'));
  expect(E.voor.uit - E.na.uit).toBe(200);   // de -200 naar Reservering valt uit je uitgaven
  await page.evaluate(() => openEigenNamen());
  const t = await page.locator('[data-eigengroep="reservering"]').innerText();
  expect(t).toMatch(/In september/i);
  expect(t).toContain('\u2192');
  await page.evaluate(() => eigenNaamZet('reservering', 'ja'));
  const na = await page.evaluate(() => eigenNaamMaat('2026-09'));
  expect(na).toEqual(E.na);
  // de staaf (en dus de bridge) van september leest hetzelfde bedrag
  expect(await page.evaluate(() => Math.round(totals('2026-09').spendNorm))).toBe(E.na.uit);
});

test('f. een symmetrisch paar heft zich in Overig al op: uitgaven veranderen niet, de afsluitpunt wel', async ({ page }) => {
  await stand(page);
  const voor = await page.evaluate(() => ({ uit: eigenNaamMaat('2026-09').uit, n: afsluitOverigTx('2026-09').length }));
  await page.evaluate(() => eigenNaamZet('leefgeld', 'ja'));
  const na = await page.evaluate(() => ({ uit: eigenNaamMaat('2026-09').uit, n: afsluitOverigTx('2026-09').length }));
  expect(na.uit).toBe(voor.uit);
  expect(voor.n - na.n).toBe(2);   // +50 en -50 van 22 september
});

test('g. terugdraaien zet elke categorie terug', async ({ page }) => {
  await stand(page);
  const voor = await alleCats(page);
  await page.evaluate(() => eigenNaamZet('leefgeld', 'ja'));
  expect(await alleCats(page)).not.toBe(voor);
  await page.click('[data-eigengroep="leefgeld"] [data-eigenterug]');
  expect(await alleCats(page)).toBe(voor);
  expect(await page.evaluate(() => 'eigenNamen' in SET)).toBe(false);
});

test('h. "niet mijn rekening" zet niets om en haalt de naam uit de open lijst', async ({ page }) => {
  await stand(page);
  const voor = await alleCats(page);
  await page.evaluate(() => eigenNaamZet('reservering', 'nee'));
  expect(await alleCats(page)).toBe(voor);
  const G = await groepen(page);
  expect(G.find((g) => g.key === 'reservering').status).toBe('nee');
  const regel = await page.evaluate(() => eigenNaamRegel());
  expect(regel).toContain('4 boekingen lijken overboekingen');   // alleen Leefgeld nog open
  await page.evaluate(() => eigenNaamZet('reservering', 'ja'));   // een tweede keuze vervangt de eerste
  expect(await page.evaluate(() => [!!(SET.eigenNamen || {}).reservering, !!(SET.eigenNamenNee || {}).reservering])).toEqual([true, false]);
});

test('i. een bevestigde overboeking met een eigen keuze voedt de terugbetalingskoppeling niet', async ({ page }) => {
  await stand(page, { ovrMin50: true });
  // geconstrueerd geval: een bijschrijving met dezelfde eerste twintig tekens die de naam NIET draagt
  await page.evaluate(() => { TX.push({ id: 'l9', date: '2026-09-23', amount: 25, acc: 'psd2_leef', name: 'From Reservering to Leef', desc: 'From Reservering to Leef', typ: '', ref: '', src: 'psd2', accName: '', refNums: [] }); TX.forEach(categorize); applyOwnAccounts(); save(); });
  expect(await cat(page, 'From Reservering to Leef', '2026-09-23', 25)).toBe('overig');   // erft nu van een -50/-30 op Overig
  await page.evaluate(() => eigenNaamZet('leefgeld', 'ja'));
  expect(await cat(page, 'From Reservering to Leefgeld', '2026-09-22', -50)).toBe('overig');   // eigen keuze wint
  expect(await cat(page, 'From Reservering to Leef', '2026-09-23', 25)).toBe('intern');
});

test('j. de werklijst van de afsluiting wijst naar de kandidaten', async ({ page }) => {
  await stand(page);
  await page.evaluate(() => openAfsluitOverig('2026-09'));
  const h = page.locator('[data-eigenhint]');
  await expect(h).toHaveAttribute('data-eigenhint', '3');   // +50, -50 en -200 staan op Overig
  await h.click();
  await expect(page.locator('#eigenNamen')).toBeVisible();
});

test('k. de regel in Instellingen opent de lijst, en zwijgt zonder kandidaten', async ({ page }) => {
  await stand(page);
  expect(await page.evaluate(() => eigenNaamRegel())).toContain('boekingen lijken overboekingen tussen je eigen rekeningen');
  await page.evaluate(() => { SET.psd2Accounts = {}; save(); });
  expect(await page.evaluate(() => eigenNaamRegel())).toBe('');
});

for (const [w, h] of [[360, 640], [390, 844]]) {
  test(`l. de lijst op ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await stand(page);
    await page.evaluate(() => openEigenNamen());
    const m = await page.evaluate(() => { const s = document.getElementById('sheet');
      const rijen = [...document.querySelectorAll('[data-eigenrij]')].map((r) => r.firstElementChild.getBoundingClientRect().width);
      const knop = document.querySelector('[data-eigenja]').getBoundingClientRect();
      return { over: s.scrollWidth > s.clientWidth, min: Math.min(...rijen), knopB: knop.width, h: document.getElementById('eigenNamen').getBoundingClientRect().height }; });
    expect(m.over).toBe(false);
    expect(m.min).toBeGreaterThan(150);
    expect(m.knopB).toBeGreaterThan(100);
    console.log(`meting ${w}: lijst ${Math.round(m.h)}px`);
  });
}
