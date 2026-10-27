/* v476: "Inkomen per maand" is een berekende waarde: vast salaris (SET.salSplit.vast) + overig vast (SET.overigVast).
   De overzetting van SET.income gebeurt een keer bij het laden (SET.inkomen476). GECONSTRUEERD. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');
const { kaalUit } = require('./bron-kaal');

const MAIN = 'NL01MAIN0000001111';
async function boot(page, o) {
  o = o || {};
  const tx = [];
  for (const m of ['2026-07', '2026-08', '2026-09', '2026-10']) tx.push({ id: 'sal-' + m, date: m + '-24', amount: 5216, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON WERKGEVER', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  tx.push({ id: 'b1', date: '2026-10-10', amount: -400, acc: MAIN, name: 'AH', desc: 'ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  const set = Object.assign({ budgetMonth: '2026-10', income: o.income, autoIncome: o.auto === true, limit: 70, limitMode: 'pct', budgets: { boodschappen: 400 }, manualBal: { [MAIN]: 3000 } },
    o.vast != null ? { salSplit: { vast: o.vast, key: 'WERKGEVER', naam: 'Werkgever' } } : {}, o.set || {});
  const d = { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]), minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-27');
  await page.addInitScript((d) => { if (!sessionStorage.getItem('geladen')) { for (const k in d) localStorage.setItem(k, d[k]); sessionStorage.setItem('geladen', '1'); } }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof inkomenHandmatig === 'function' && typeof TX !== 'undefined' && TX.length > 0);
}
const stand = (page) => page.evaluate(() => ({ som: inkomenHandmatig(), overig: SET.overigVast.map((x) => +x.bedrag), base: baseIncome(), inc: totals(thisYM()).income, R: SET.inkomen476, vast: inkVast() }));
const blok20 = (page) => page.evaluate(async () => { const b = DIAG_BLOKKEN.find((x) => x.lees === diagSalarisVerdeling); const L = await b.lees(); return Array.isArray(L) ? L.join('\n') : String(L); });

test.describe('de overzetting van SET.income', () => {
  test('a. SET.income 5216 en vast salaris 5216: inkomen per maand 5216, geen overig vast, geen vraag', async ({ page }) => {
    await boot(page, { income: 5216, vast: 5216 });
    const r = await stand(page);
    expect(r).toMatchObject({ som: 5216, overig: [], base: 5216, inc: 5216 });
    expect(r.R).toMatchObject({ voor: { income: 5216, vast: 5216, overig: 0 }, na: { income: 5216, vast: 5216, overig: 0, som: 5216 }, vraag: null });
    expect(await page.evaluate(() => inkVraag476())).toBeNull();
  });
  test('b. SET.income 5500, vast 5216: overig vast 284, som 5500', async ({ page }) => {
    await boot(page, { income: 5500, vast: 5216 });
    expect(await stand(page)).toMatchObject({ som: 5500, overig: [284], base: 5500, inc: 5500 });
  });
  test('c. geen vast salaris: overig vast is het hele SET.income; daarna een vraag als je een vast salaris invult, en Ja trekt het eraf', async ({ page }) => {
    await boot(page, { income: 4250 });
    expect(await stand(page)).toMatchObject({ som: 4250, overig: [4250], vast: 0 });
    await page.evaluate(() => { SET.salSplit = { vast: 4000, key: 'WERKGEVER', naam: 'Werkgever' }; save(); openSetSub('inkomen'); });
    /* v477: tot het antwoord telt het vaste salaris niet twee keer; de volle som zou 8250 zijn */
    expect(await page.evaluate(() => inkomenHandmatig())).toBe(4250);
    await expect(page.locator('[data-inkvraag="zondervast"]')).toContainText('Je overig vast van €4.250 kwam uit je oude inkomen per maand');
    await page.click('[data-inkantw="erin"]');
    expect(await stand(page)).toMatchObject({ som: 4250, overig: [250] });
    await expect(page.locator('[data-inkvraag]')).toHaveCount(0);
  });
  test('d. SET.income lager dan vast salaris: geen overig vast, een vraag in Instellingen, niets aangepast', async ({ page }) => {
    await boot(page, { income: 5000, vast: 5216 });
    expect(await stand(page)).toMatchObject({ som: 5216, overig: [], vast: 5216 });
    await page.evaluate(() => openSetSub('inkomen'));
    await expect(page.locator('[data-inkvraagtekst]')).toHaveText('Je inkomen per maand was €5.000, je vaste salaris is €5.216. Klopt je vaste salaris?');
    expect(await page.evaluate(() => SET.salSplit.vast)).toBe(5216);
    await page.click('[data-inkantw="klopt"]');
    await expect(page.locator('[data-inkvraag]')).toHaveCount(0);
    expect(await page.evaluate(() => ({ v: SET.salSplit.vast, a: SET.inkomen476.antwoord.keuze }))).toEqual({ v: 5216, a: 'klopt' });
  });
  test('e. een keer: een latere SET.income verandert niets, en een herlaad zet niet opnieuw over', async ({ page }) => {
    await boot(page, { income: 5500, vast: 5216 });
    await page.evaluate(() => { SET.income = 9999; save(); });
    await page.reload(); await page.waitForFunction(() => typeof inkomenHandmatig === 'function' && TX.length > 0);
    expect(await stand(page)).toMatchObject({ som: 5500, overig: [284] });
  });
  test('f. blok 20 laat voor en na de overzetting zien: SET.income, vast salaris, overig vast, de som', async ({ page }) => {
    await boot(page, { income: 5500, vast: 5216 });
    const b = await blok20(page);
    expect(b).toContain('voor de overzetting (2026-10-27): SET.income €5.500 · vast salaris €5.216 · overig vast €0 · som (vast + overig vast) €5.216');
    expect(b).toContain('na de overzetting: SET.income €5.500 · vast salaris €5.216 · overig vast €284 · som (vast + overig vast) €5.500');
    expect(b).toContain('regel: overig vast = SET.income - vast salaris');
    expect(b).toContain('CONTROLE inkomen per maand = vast salaris + overig vast: €5.500 = €5.216 + €284 → klopt');
  });
});

test.describe('Instellingen › Inkomen', () => {
  test('g. inkomen per maand is berekend; overig vast toevoegen en invullen werkt de som bij zonder de pagina te herbouwen', async ({ page }) => {
    await boot(page, { income: 5216, vast: 5216 });
    await page.evaluate(() => openSetSub('inkomen'));
    await expect(page.locator('input[placeholder="bv. 2500"]')).toHaveCount(0);
    await expect(page.locator('[data-inkomenpermaand]')).toHaveText('€5.216');
    await page.click('[data-overigtoevoegen]');
    await page.fill('[data-overigvast] [data-overignaam]', 'Toeslag');
    await page.fill('[data-overigvast] [data-overigbedrag]', '150');
    await page.click('[data-salsplitreisaan] + .sl');   // de tik laat het bedrag los (onchange) en de schakelaar moet daarna nog werken
    const r = await page.evaluate(() => ({ som: inkomenHandmatig(), t: document.querySelector('[data-inkomenpermaand]').textContent, aan: SET.salSplit.reisAan, ov: SET.overigVast }));
    expect(r).toMatchObject({ som: 5366, t: '€5.366', aan: true, ov: [{ naam: 'Toeslag', bedrag: 150 }] });
    expect(await page.evaluate(() => ({ b: baseIncome(), t: totals(thisYM()).income, s: SET.income }))).toEqual({ b: 5366, t: 5366, s: 5216 });   // SET.income blijft staan en wordt niet gelezen
    await page.click('[data-overigweg]');
    expect(await page.evaluate(() => ({ som: inkomenHandmatig(), t: document.querySelector('[data-inkomenpermaand]').textContent }))).toEqual({ som: 5216, t: '€5.216' });
  });
  test('h. met detectie aan blijft baseIncome() de meting en leest niemand de som', async ({ page }) => {
    await boot(page, { income: 9000, vast: 5216, auto: true });
    expect(await page.evaluate(() => ({ base: baseIncome(), som: inkomenHandmatig() }))).toEqual({ base: 5216, som: 9000 });
  });
});

/* v477: overig vast uit de overzetting ZONDER vast salaris telt het vaste salaris niet twee keer zolang de vraag openstaat.
   De som is dan vast + overig - min(overig, vast), dus nooit hoger dan het hoogste van de twee, en dat is precies de uitkomst
   van "Ja, het zit erin": Ja verandert geen getal, "Nee, het komt erbij" zet de volle som aan. GECONSTRUEERD.
   De fixture draagt BEIDE kanten (overig boven en onder het vaste salaris), want alleen met overig ONDER het vaste salaris
   is "min(overig, vast)" te onderscheiden van "overig" (meetles a en o). */
test.describe('v477: nog niet bevestigd', () => {
  const zet = (page, vast) => page.evaluate((v) => { SET.salSplit = { vast: v, key: 'WERKGEVER', naam: 'Werkgever' }; save(); openSetSub('inkomen'); }, vast);
  test('i. overig vast BOVEN het vaste salaris: de som is het overig vast, niet de dubbeltelling', async ({ page }) => {
    await boot(page, { income: 4250 });
    await zet(page, 4000);
    const r = await stand(page);
    expect(r).toMatchObject({ som: 4250, overig: [4250], vast: 4000, base: 4250, inc: 4250 });   // de volle som zou 8250 zijn
    expect(await page.evaluate(() => inkOnbevestigd())).toMatchObject({ bedrag: 4250, vast: 4000, af: 4000 });
    await expect(page.locator('[data-inkonbevestigd]')).toHaveAttribute('data-inkonbevestigd', '4000');
    await expect(page.locator('[data-inkomenpermaand]')).toHaveText('€4.250');
    await expect(page.locator('[data-inkomenopbouw]')).toContainText('- €4.000 nog niet bevestigd');
  });
  test('j. overig vast ONDER het vaste salaris: de som is het vaste salaris (niet hoger dan het hoogste van de twee)', async ({ page }) => {
    await boot(page, { income: 3000 });
    await zet(page, 4000);
    expect(await stand(page)).toMatchObject({ som: 4000, overig: [3000], vast: 4000 });   // 3000 zou de kale aftrekking zijn, 7000 de dubbeltelling
    expect(await page.evaluate(() => inkOnbevestigd().af)).toBe(3000);
    await expect(page.locator('[data-inkonbevestigd]')).toContainText('nog niet bevestigd');
  });
  test('k. "Ja, het zit erin" verandert geen getal, "Nee, het komt erbij" zet de volle som aan', async ({ page }) => {
    await boot(page, { income: 4250 });
    await zet(page, 4000);
    await expect(page.locator('[data-inkantw="erin"]')).toContainText('inkomen per maand blijft €4.250');
    await expect(page.locator('[data-inkantw="erbij"]')).toContainText('inkomen per maand wordt €8.250');
    await page.click('[data-inkantw="erbij"]');
    expect(await stand(page)).toMatchObject({ som: 8250, overig: [4250], base: 8250, inc: 8250 });
    expect(await page.evaluate(() => inkOnbevestigd())).toBeNull();
    await expect(page.locator('[data-inkonbevestigd]')).toHaveCount(0);
    await expect(page.locator('[data-inkomenopbouw]')).not.toContainText('nog niet bevestigd');
  });
  test('l. zonder vast salaris telt het hele overig vast mee en is er niets onbevestigd', async ({ page }) => {
    await boot(page, { income: 4250 });
    expect(await stand(page)).toMatchObject({ som: 4250, overig: [4250], vast: 0 });
    expect(await page.evaluate(() => inkOnbevestigd())).toBeNull();
  });
  test('n. de vraag en de som lezen dezelfde bron: inkVraag476() drukt de voorwaarde niet opnieuw uit', async ({ page }) => {
    await boot(page, { income: 4250 });
    const v = await kaalUit(page, 'inkVraag476'), h = await kaalUit(page, 'inkomenHandmatig');
    expect(v).toContain('inkOnbevestigd(');
    expect(h).toContain('inkOnbevestigd(');
    expect(v).not.toContain('zonderVastAntw');   // de stand staat op een plek, niet twee keer uitgedrukt
    expect(v).not.toContain("x.bron==='overzetting'");
  });
  test('m. blok 20 noemt wat er niet meetelt en de CONTROLE sluit met de aftrek', async ({ page }) => {
    await boot(page, { income: 4250 });
    await zet(page, 4000);
    const b = await blok20(page);
    expect(b).toContain('nog niet bevestigd (v477): €4.000 telt niet mee zolang de vraag openstaat · overig vast €4.250 · vast salaris €4.000 · volle som zou €8.250 zijn');
    expect(b).toContain('CONTROLE inkomen per maand = vast salaris + overig vast - nog niet bevestigd: €4.250 = €4.000 + €4.250 - €4.000 → klopt');
    await page.click('[data-inkantw="erbij"]');
    const b2 = await blok20(page);
    expect(b2).not.toContain('nog niet bevestigd (v477)');
    expect(b2).toContain('CONTROLE inkomen per maand = vast salaris + overig vast: €8.250 = €4.000 + €4.250 → klopt');
  });
});
