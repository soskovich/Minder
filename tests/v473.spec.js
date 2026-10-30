/* v473: de salarisstorting gesplitst in salaris, reiskostenvergoeding en eenmalig. GECONSTRUEERD (de getallen van het toestel staan niet
   in deze repo): vast salaris EUR 5.216, een vergoeding van EUR 277 in mei t/m september (bovengrens EUR 300, potje Vervoer), en op
   26 okt EUR 7.693 = 5.216 + 277 + 2.200 met een verwachte bonus van EUR 2.500 in oktober. */
const { test, expect } = require('@playwright/test');
const { pinDatum } = require('./vaste-dag');

const MAIN = 'NL01MAIN0000001111', SAV = 'NL01SAVE0000004323';
async function boot(page, o) {
  o = o || {};
  const tx = []; const add = (id, date, amount, name, desc, acc) => tx.push({ id, date, amount, acc: acc || MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09']) add('sal-' + m, m + '-24', 5216 + 277, 'Werkgever', 'SALARIS LOON WERKGEVER');
  if (o.okt !== null) add('sal-2026-10', '2026-10-26', o.okt != null ? o.okt : 5216 + 277 + 2200, 'Werkgever', 'SALARIS LOON WERKGEVER');
  add('tank-1', '2026-10-10', -(o.tank != null ? o.tank : 400), 'Shell', 'SHELL TANKSTATION');
  add('sp-1', '2026-10-27', 300, 'Spaarpot', 'NAAR SPAREN', SAV);
  const set = { budgetMonth: '2026-10', income: 5216, autoIncome: true, limit: 70, limitMode: 'pct', budgets: { vervoer: 600, boodschappen: 400 }, savingsEnds: ['4323'],
    manualBal: { [MAIN]: 3000, [SAV]: 5000 }, irregularIncome: o.bonus === false ? [] : [{ id: 'bonus-okt', ym: '2026-10', amount: 2500, naam: 'Bonus' }] };
  const d = { minder_tx: JSON.stringify(tx), minder_set: JSON.stringify(set), minder_own: JSON.stringify([MAIN, SAV]), minder_ovr: '{}', minder_accmeta: '{}', minder_plan: '{}' };
  await page.route('**/sw.js', (r) => r.abort());
  await pinDatum(page, '2026-10-27');
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, d);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof salSplitsing === 'function' && typeof TX !== 'undefined' && TX.length > 0);
  /* de id wordt bij de boot herschreven (txId), dus de test zoekt een storting op zijn maand */
  await page.evaluate(() => { window._sal = (ym) => TX.find((t) => t.amount > 0 && String(t.date).startsWith(ym) && /SALARIS/.test(t.desc)); window._sid = (ym) => (window._sal(ym) || {}).id; });
  if (o.cfg !== false) await page.evaluate((c) => { const t = _sal('2026-10') || _sal('2026-09');
    SET.salSplit = Object.assign({ vast: 5216, key: recurKey(t), naam: 'Werkgever', reisAan: true, reisMax: 300, reisPot: 'vervoer' }, c || {}); save(); }, o.cfg || {});
}
const split = (page, ym) => page.evaluate((ym) => salSplitsing(_sal(ym)), ym);

test.describe('regels a, b, c', () => {
  test('a. meerdere binnen de bovengrens en geen verwachte eenmalige ontvangst: alles reiskosten, automatisch', async ({ page }) => {
    await boot(page, { bonus: false });
    const S = await split(page, '2026-09');
    expect(S).toMatchObject({ regel: 'a', salaris: 5216, reis: 277, eenmalig: 0, auto: true, vraag: false });
    const m = await page.evaluate(() => maandInkomen('2026-09'));
    expect(Math.round(m.alles)).toBe(5216);             // reiskosten zijn geen inkomen
  });
  test('b. meerdere boven de bovengrens: een vraag, niets voorgekozen, tot het antwoord alles eenmalig "nog niet gesplitst"', async ({ page }) => {
    await boot(page);
    const S = await split(page, '2026-10');
    expect(S).toMatchObject({ regel: 'b', reis: 0, eenmalig: 2477, vraag: true, nietGesplitst: true });
    const r = await page.evaluate(() => { go('dash'); renderDash(); const v = document.querySelector('[data-salsplitvraag="' + _sid('2026-10') + '"]'); const t = v ? v.innerText : ''; v.click();
      const sh = document.querySelector('#salSplitSheet'); return { t, sec: [...sh.querySelectorAll('button')].every((b) => b.classList.contains('sec')),
        vorig: +(sh.querySelector('[data-salsplitreis]') || {}).dataset.salsplitreis, ander: !!sh.querySelector('[data-salsplitander]'), geen: !!sh.querySelector('[data-salsplitgeen]') }; });
    expect(r.t).toContain('nog niet gesplitst');
    expect(r.sec).toBe(true);
    expect(r).toMatchObject({ vorig: 277, ander: true, geen: true });
    await page.evaluate(() => document.querySelector('[data-salsplitreis]').click());
    const na = await split(page, '2026-10');
    expect(na).toMatchObject({ reis: 277, eenmalig: 2200, beantwoord: true });
    expect(na.nietGesplitst).toBeFalsy();
    const log = await page.evaluate(() => SET.salSplitLog.slice(-1)[0]);
    expect(log.id).toBe(await page.evaluate(() => _sid('2026-10')));
    expect(log).toMatchObject({ actie: 'gesplitst', reis: 277, eenmalig: 2200 });
    await page.evaluate(() => salSplitAntwoord(_sid('2026-10'), 100));   // achteraf te wijzigen, en gelogd
    expect(await split(page, '2026-10')).toMatchObject({ reis: 100, eenmalig: 2377 });
    expect(await page.evaluate(() => SET.salSplitLog.length)).toBe(2);
  });
  test('b2. binnen de bovengrens maar een verwachte eenmalige ontvangst open: toch een vraag', async ({ page }) => {
    await boot(page, { okt: 5216 + 277 });
    expect(await split(page, '2026-10')).toMatchObject({ regel: 'b', vraag: true, eenmalig: 277, open: true });
  });
  test('c. storting lager dan het vaste salaris: "Klopt je vaste salaris nog?" met drie keuzes', async ({ page }) => {
    await boot(page, { okt: 5000 });
    expect(await split(page, '2026-10')).toMatchObject({ regel: 'c', salaris: 5000, vraag: true });
    const r = await page.evaluate(() => { salSplitVraagSheet(_sid('2026-10')); const sh = document.querySelector('#salSplitSheet');
      return { t: sh.innerText, k: [...sh.querySelectorAll('[data-salsplitc]')].map((b) => b.dataset.salsplitc) }; });
    expect(r.t).toContain('Klopt je vaste salaris nog?');
    expect(r.k).toEqual(['aanpassen', 'eenmalig', 'weetniet']);
  });
});

test.describe('punt 2 · Vervoer', () => {
  test('d. de vergoeding verlaagt het potje: "vergoeding −€277"', async ({ page }) => {
    await boot(page, { okt: 5216 + 277, bonus: false });
    const r = await page.evaluate(() => ({ cs: catSpendMap('2026-10').vervoer, ruw: catSpendMapRuw('2026-10').vervoer, R: reisStand('2026-10') }));
    expect(r.ruw).toBe(400);
    expect(r.cs).toBe(123);
    expect(r.R).toMatchObject({ bedrag: 277, af: 277, over: 0 });
    const sh = await page.evaluate(() => { openInsPotje('vervoer'); const e = document.querySelector('[data-vergoeding]'); return { v: e ? +e.dataset.vergoeding : null, t: e ? e.innerText : '', over: !!document.querySelector('[data-vergoedingover]') }; });
    expect(sh).toMatchObject({ v: 277, over: false });
    expect(sh.t).toContain('vergoeding −€277');
  });
  test('e. nooit onder 0: het overschot is "vergoeding over" en geen inkomen', async ({ page }) => {
    await boot(page, { okt: 5216 + 277, bonus: false, tank: 100 });
    const r = await page.evaluate(() => ({ cs: catSpendMap('2026-10').vervoer || 0, R: reisStand('2026-10'), inc: maandInkomen('2026-10').alles }));
    expect(r.cs).toBe(0);
    expect(r.R).toMatchObject({ af: 100, over: 177 });
    expect(Math.round(r.inc)).toBe(5216);
    const sh = await page.evaluate(() => { openInsPotje('vervoer'); const e = document.querySelector('[data-vergoedingover]'); return e ? e.innerText : ''; });
    expect(sh).toContain('vergoeding over €177');
  });
});

test.describe('punt 3, 4 en 5', () => {
  test('f. vast inkomen is het salarisdeel; eenmalig is een eigen keuze', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => salSplitAntwoord(_sid('2026-10'), 277));
    const r = await page.evaluate(() => { const D = salarisData(6); return D.R.map((x) => [x.ym, Math.round(x.salaris)]); });
    for (const [ym, s] of r) if (ym >= '2026-05') expect([ym, s]).toEqual([ym, 5216]);
    const kies = await page.evaluate(() => { try { window._gripCyc = null; } catch (_) {} const C = gripCyclus(); return C.kies.map((k) => k.naam); });
    /* v501 (punt 3): eerst meten. In deze stand ging er sinds de storting €300 boven je afspraak naar opzij, dus de keuze zegt dat dat deel
       al verdeeld lijkt (klopt / niet) in plaats van "verdelen"; het eenmalige deel blijft een eigen keuze */
    expect(kies).toContain('Eenmalig €2.200 lijkt voor €300 al verdeeld');
  });
  test('g. de verwachte bonus is gekoppeld aan het eenmalige deel, een keer', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => salSplitAntwoord(_sid('2026-10'), 277));
    const r = await page.evaluate(() => { const v = irrGeldig()[0]; const a = irrPostOntvangen(v); go('ins'); renderIns();
      const e = document.querySelector('[data-insbonusontv]'); return { a, open: irrVerwachtOpen('2026-10').length, t: e ? e.innerText : '', m: maandInkomen('2026-10'), bo: !!document.querySelector('[data-insbonus]') }; });
    expect(r.a).toMatchObject({ bedrag: 2200, via: 'salaris' });
    expect(r.open).toBe(0);
    expect(r.t).toContain('eenmalig bonus €2.200 ontvangen 26 okt (verwacht €2.500)');
    expect(r.bo).toBe(false);                            // geen tweede regel "telt mee zodra binnen"
    expect(Math.round(r.m.onregelmatig)).toBe(2200);     // telt een keer
  });
  /* v502 (punt 5): de opzij-tegel op Plan toont geen "eenmalig ontvangen" meer (dat staat op Inzichten); de sheet erachter wel */
  test('h. Plan: "eenmalig ontvangen €2.200" in de sheet en niet meer in de tegel; "Toch vast" vraagt eerst; de instelling kiest niets voor', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => salSplitAntwoord(_sid('2026-10'), 277));
    const r = await page.evaluate(() => { go('vooruit'); renderVooruit(); const t = document.querySelector('[data-kpiopzijperiode]'); const e = t && t.querySelector('[data-kpieenmalig]');
      openOpzijHerleiding(); const s = document.querySelector('[data-opzijeenmalig]'); return { e: e ? +e.dataset.kpieenmalig : null, et: e ? e.innerText : '', s: s ? +s.dataset.opzijeenmalig : null }; });
    expect(r).toMatchObject({ e: null, s: 2200 });
    const tv = await page.evaluate(() => { salSplitTochVast(_sid('2026-10')); return { vast: SET.salSplit.vast, sheet: !!document.querySelector('#salSplitVast') }; });
    expect(tv).toEqual({ vast: 5216, sheet: true });     // eerst het gevolg, niets geschreven
    const ins = await page.evaluate(() => { SET.salSplit = { key: SET.salSplit.key }; save(); document.body.insertAdjacentHTML('beforeend', '<div id="tst">' + salSplitInstelHTML() + '</div>'); const d = document.querySelector('#tst');
      return { vast: d.querySelector('[data-salsplitvast]').value, aan: d.querySelector('[data-salsplitreisaan]').checked }; });
    expect(ins).toEqual({ vast: '', aan: false });
    const b20 = await page.evaluate(async () => { SET.salSplit = { vast: 5216, key: recurKey(_sal('2026-10')), reisAan: true, reisMax: 300, reisPot: 'vervoer' }; save();
      const b = DIAG_BLOKKEN.find((x) => x.lees === diagSalarisVerdeling); return String(await b.lees()); });
    expect(b20).toContain('SALARISSPLITSING (v473)');
    expect(b20).toContain('2026-10-26: €7.693 = salaris €5.216 + reiskosten €277 + eenmalig €2.200');
    expect(b20).not.toContain('SLUIT NIET');
  });
});
