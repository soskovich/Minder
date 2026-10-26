/* v474: herstel op v473. GECONSTRUEERD (de getallen van het toestel staan niet in deze repo).
   1. Grip "Na je salaris": de regel noemt de bedragen waarover hij de mediaan neemt; blok 20 splitst elke storting.
   2. De hint bij de bovengrens telt geen maand met een eenmalige ontvangst.
   3. Instellingen › Inkomen: de schakelaar werkt na het intikken van je vaste salaris (de tik ging verloren). */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111';
async function boot(page, o) {
  o = o || {};
  const tx = []; const add = (id, date, amount, name, desc) => tx.push({ id, date, amount, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  const voor = o.voor || { '2026-05': 5493, '2026-06': 5493, '2026-07': 5493, '2026-08': 5493, '2026-09': 5493 };
  for (const m in voor) add('sal-' + m, m + '-24', voor[m], 'Werkgever', 'SALARIS LOON WERKGEVER');
  add('sal-2026-10', '2026-10-26', o.okt != null ? o.okt : 5216 + 277 + 2200, 'Werkgever', 'SALARIS LOON WERKGEVER');
  add('tank-1', '2026-10-10', -400, 'Shell', 'SHELL TANKSTATION');
  const set = { budgetMonth: '2026-10', income: 5216, autoIncome: o.auto !== false, limit: 70, limitMode: 'pct', budgets: { vervoer: 600, boodschappen: 400 },
    manualBal: { [MAIN]: 3000 }, irregularIncome: o.bonus === false ? [] : [{ id: 'bonus-okt', ym: '2026-10', amount: 2500, naam: 'Bonus' }] };
  const d = { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN]), minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-27');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof salSplitsing === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  await page.evaluate(() => { window._sal = (ym) => TX.find((t) => t.amount > 0 && String(t.date).startsWith(ym) && /SALARIS/.test(t.desc)); });
  if (o.cfg !== false) await page.evaluate((c) => { SET.salSplit = Object.assign({ vast: 5216, key: recurKey(_sal('2026-10')), naam: 'Werkgever', reisAan: true, reisMax: 300, reisPot: 'vervoer' }, c || {}); save(); }, o.cfg || {});
}

test.describe('1 · de mediaan van Na je salaris en blok 20', () => {
  test('a. de regel noemt per maand het bedrag, en de mediaan van die bedragen is het getal ervoor', async ({ page }) => {
    /* mei t/m sep 4.007 (lager dan je vaste salaris: regel c, alles salaris), okt 5.216 + 277 + 2.200 */
    await boot(page, { voor: { '2026-05': 4007, '2026-06': 4007, '2026-07': 3990, '2026-08': 4007, '2026-09': 4100 } });
    const r = await page.evaluate(() => { const N = inkomenStijging(); const h = gripNaSalarisBlok({ N: naJeSalarisData() }, { IV: null });
      const d = document.createElement('div'); d.innerHTML = h; const el = d.querySelector('[data-inkomenstijging]'); return { N, t: el ? el.innerText : '' }; });
    expect(r.N).toMatchObject({ voor: ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'], voorBed: [4007, 4007, 3990, 4007, 4100], mV: 4007, naBed: [5216], mN: 5216 });
    expect(r.t).toContain('van €4.007 naar €5.216');
    expect(r.t).toContain('mediaan van mei €4.007 · jun €4.007 · jul €3.990 · aug €4.007 · sep €4.100 tegen mediaan van okt €5.216');
  });
  test('b. blok 20 splitst elke storting in salaris, reiskosten en eenmalig, en de reiskosten staan niet bij de overige inkomsten', async ({ page }) => {
    await boot(page);
    const b20 = await page.evaluate(async () => { const b = DIAG_BLOKKEN.find((x) => x.lees === diagSalarisVerdeling); const L = await b.lees(); return Array.isArray(L) ? L.join('\n') : String(L); });
    expect(b20).toContain('storting 24-09 5493.00 = salaris 5216.00 + reiskosten 277.00 + eenmalig 0.00 · regel a (automatisch)');
    expect(b20).toContain('storting 26-10 7693.00 = salaris 5216.00 + reiskosten 0.00 + eenmalig 2477.00 · regel b (nog niet gesplitst)');
    const sep = b20.split('\n').find((l) => /^\s+sep: salaris/.test(l));
    expect(sep).toContain('salaris 5216');
    const ov = b20.split('\n').slice(b20.split('\n').indexOf(sep) + 1, b20.split('\n').indexOf(sep) + 4).join('\n');
    expect(ov).not.toContain('eenmalig 277');
    expect(ov).not.toContain('ontvangst bij een lening');
    expect(b20).not.toContain('SLUIT NIET');
    /* de reiskosten staan op je betaalrekening en zijn een eigen term in de controle; zonder die term VERSCHILT elke maand met +277 */
    expect(b20).toContain('sep: 0 + 0 + 0 + 0 + 5493 = 5493 tegen 5216 + 277 + 0 + 0 + 0 = 5493: klopt');
    expect(b20).not.toMatch(/VERSCHILT \+277/);
    expect(b20).toContain('CONTROLE eenmalig inkomen niet in salaris: okt');
    expect(b20).not.toMatch(/CONTROLE eenmalig inkomen niet in salaris:[^\n]*VERSCHILT/);
  });
});

test.describe('2 · de hint bij de bovengrens', () => {
  test('c. een maand met een eenmalige ontvangst telt niet mee: het hoogste meerdere komt uit de andere maanden', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => salSplitHoogsteMeer(5216))).toBe(277);
    /* ook na je antwoord met een eenmalig deel blijft oktober eruit */
    await page.evaluate(() => { SET.irregularIncome = []; salSplitAntwoord(_sal('2026-10').id, 277); });
    expect(await page.evaluate(() => salSplitHoogsteMeer(5216))).toBe(277);
  });
  test('d. zonder maand zonder eenmalige ontvangst geen hint, ook niet in het veld', async ({ page }) => {
    await boot(page, { voor: {} });
    const r = await page.evaluate(() => { openSetSub('inkomen'); return { h: salSplitHoogsteMeer(5216), el: !!document.querySelector('[data-salsplithoog]'),
      ph: document.querySelector('[data-salsplitmax]').placeholder }; });
    expect(r).toEqual({ h: null, el: false, ph: 'bovengrens' });
  });
});

test.describe('3 · Instellingen › Inkomen › Je salaris', () => {
  test('e. vast salaris intikken en meteen de schakelaar aantikken: Bovengrens en Potje staan er, de pagina blijft open en op zijn plek', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 640 });
    await boot(page, { cfg: false });
    await page.evaluate(() => openSetSub('inkomen'));
    await page.fill('[data-salsplitvast]', '5216');
    await page.click('[data-salsplitreisaan] + .sl');   // de tik op de schakelaar laat eerst het vaste salaris los (onchange)
    const r = await page.evaluate(() => ({ sub: window._setSub, aan: SET.salSplit.reisAan, vast: SET.salSplit.vast, max: !!document.querySelector('[data-salsplitmax]'),
      pot: !!document.querySelector('[data-salsplitpot]'), check: document.querySelector('[data-salsplitreisaan]').checked }));
    expect(r).toMatchObject({ sub: 'inkomen', aan: true, vast: 5216, max: true, pot: true, check: true });
    /* de scrollpositie: gemeten rond de herbouw zelf (een klik van Playwright scrolt het doel eerst in beeld en meet dus niet de app) */
    const y = await page.evaluate(() => { const el = document.querySelector('[data-salsplitreisaan]'); el.scrollIntoView({ block: 'center' }); const y0 = scrollY;
      el.checked = false; el.dispatchEvent(new Event('change')); const y1 = scrollY; const el2 = document.querySelector('[data-salsplitreisaan]');
      el2.checked = true; el2.dispatchEvent(new Event('change')); return { y0, y1, y2: scrollY, max: !!document.querySelector('[data-salsplitmax]') }; });
    expect(y.y0).toBeGreaterThan(0);                     // de pagina scrolt echt, anders meet dit niets
    expect(y).toMatchObject({ y1: y.y0, y2: y.y0, max: true });
  });
  test('f. het potje kiezen en de bovengrens invullen houden het blok open en de waarde staat', async ({ page }) => {
    await boot(page, { cfg: false });
    await page.evaluate(() => openSetSub('inkomen'));
    await page.fill('[data-salsplitvast]', '5216');
    await page.click('[data-salsplitreisaan] + .sl');
    await page.selectOption('[data-salsplitpot]', 'vervoer');
    await page.fill('[data-salsplitmax]', '300');
    await page.click('[data-salsplitvast]');            // laat de bovengrens los
    const r = await page.evaluate(() => ({ C: SET.salSplit, pot: document.querySelector('[data-salsplitpot]').value, max: document.querySelector('[data-salsplitmax]').value,
      vast: document.querySelector('[data-salsplitvast]').value, part: document.querySelector('[data-salsplitpartij]').innerText }));
    expect(r.C).toMatchObject({ vast: 5216, reisAan: true, reisPot: 'vervoer', reisMax: 300 });
    expect(r.pot).toBe('vervoer');
    expect(r.max).toBe('300');
    expect(r.vast).toBe('5216');
    expect(r.part).toContain('Partij: Werkgever');
  });
  test('g. "Inkomen per maand" blijft beschrijfbaar terwijl je typt (dezelfde fout: elke toets bouwde de pagina opnieuw)', async ({ page }) => {
    await boot(page, { cfg: false, auto: false });
    await page.evaluate(() => openSetSub('inkomen'));
    const sel = 'input[placeholder="bv. 2500"]';
    await page.fill(sel, '');
    await page.type(sel, '4250');
    const r = await page.evaluate((sel) => ({ inc: SET.income, val: document.querySelector(sel).value, focus: document.activeElement === document.querySelector(sel) }), sel);
    expect(r).toEqual({ inc: 4250, val: '4250', focus: true });
  });
});
