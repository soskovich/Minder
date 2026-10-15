/* v422: DE HOLDING ALS SALARISBRON, GEEN STILLE OMZETTING VAN EEN GESTOPTE POST, EEN TIKKIE IS EEN UITGAVE, EN DE PREVIEW VAN
   "DIT IS MIJN HOLDING" PER BOEKING (besluiten van de gebruiker op v421). Op v421-stand (10 oktober 2026, GECONSTRUEERD: de
   boekingen van het toestel staan alleen daar; mei 5637,28 en augustus 4007,21 vallen buiten de marge van 10%). */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return L.slice(i, j < 0 ? undefined : j); };
const cat = (page, d, a, re) => page.evaluate(({ d, a, re }) => { const t = TX.find(t => t.date === d && Math.abs(t.amount - a) < 0.005 && new RegExp(re).test(t.desc)); return t && catOf(t); }, { d, a, re: re || 'ERNST' });
const zet = (page, rows) => page.evaluate(({ MAIN, rows }) => { for (const r of rows) { const t = Object.assign({ id: 'v422' + r.date + r.amount + r.name, acc: MAIN, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }, r); t.desc = t.desc || t.name.toUpperCase(); categorize(t); TX.push(t); }
  TX.sort((a, b) => a.date.localeCompare(b.date)); TX.forEach(categorize); applyOwnAccounts(); buildAccMeta(); save(); }, { MAIN: S.MAIN, rows });

test.describe('v422', () => {
  test('1. in een maand waarin de holding je salarisbron is telt de grootste bijschrijving als salaris; de rest is Holding', async ({ page }) => {
    await S.boot(page);
    /* de invoer: mei en augustus liggen buiten de marge, en juli heeft een bijschrijving in de marge naast een grotere */
    const M = await page.evaluate(() => { const M = holdingMaandbetaling('ERNST MANAGEMENT HOL'); return { med: M.mediaan, n: M.maanden }; });
    expect(M).toEqual({ med: 3463.86, n: 4 });
    expect(await cat(page, '2026-05-24', 5637.28)).toBe('inkomen');
    expect(await cat(page, '2026-08-24', 4007.21)).toBe('inkomen');
    expect(await cat(page, '2026-07-24', 3463.86)).toBe('inkomen');
    expect(await cat(page, '2026-07-31', 5000)).toBe('holding');   // groter, maar juli heeft een salaris in de marge
    expect(await cat(page, '2026-08-26', 1500)).toBe('holding');
    expect(await cat(page, '2026-09-07', 2491.71)).toBe('holding');   // september: SKF is de salarisbron
    const L = await lees(page), H = sectie(L, 'HOLDING');
    expect(H).toContain('  extra in salaris (v422, buiten de marge van 10%, de grootste bijschrijving van die maand): mei 24-05 5637.28 = mediaan 3463.86 + extra 2173.42, aug 24-08 4007.21 = mediaan 3463.86 + extra 543.35');
    expect(H).toContain('  maanden met een andere salarisbron (alle bijschrijvingen van de holding staan hier): sep');
    expect(H.find(x => x.startsWith('  netto:'))).toBe('  netto: apr 0 · mei -50 · jun -326 · jul 5000 · aug -3500 · sep 2492 · okt* 0');
    const I = sectie(L, '1. INKOMSTEN');
    expect(I.find(x => x.startsWith('  mei:'))).toBe('  mei: salaris 5637 van Ernst Management Holding (24-05 5637.28)');
    expect(I.find(x => x.startsWith('  aug:'))).toBe('  aug: salaris 4007 van Ernst Management Holding (24-08 4007.21)');
    expect(I[I.findIndex(x => x.startsWith('  sep:')) + 1]).toBe('      overige inkomsten 0');   // de 2491,71 is Holding, geen overig inkomen
    const C = sectie(L, 'CONTROLE');
    for (const m of ['apr', 'mei', 'jul', 'aug', 'sep']) expect(C.find(x => x.startsWith(`  ${m}:`))).toMatch(/: klopt$/);
  });

  test('1. met alles in de marge is er geen extra; een nieuwe werkgever vanaf zijn eerste betaling is de salarisbron', async ({ page }) => {
    await S.boot(page, { marge: true });
    expect(sectie(await lees(page), 'HOLDING')).toContain('  extra in salaris (v422, buiten de marge van 10%, de grootste bijschrijving van die maand): geen');
    /* SKF betaalt in september alleen (een maand): toch de salarisbron, want hij is de bron van je laatste salarisbetaling */
    expect(await page.evaluate(() => TX.filter(t => recurKey(t) === 'SKF' && t.amount > 0).map(t => t.date.slice(0, 7)))).toEqual(['2026-09']);
    expect(await cat(page, '2026-09-07', 2491.71)).toBe('holding');
    expect(await page.evaluate(() => holdingSalarisMaand('ERNST MANAGEMENT HOL', '2026-09', 2491.71))).toBe(false);
    expect(await page.evaluate(() => holdingSalarisMaand('ERNST MANAGEMENT HOL', '2026-07', 5000))).toBe(true);
    /* een bijschrijving die groter is dan wat de andere bron die maand betaalt houdt de holding als bron */
    expect(await page.evaluate(() => holdingSalarisMaand('ERNST MANAGEMENT HOL', '2026-09', 6000))).toBe(true);
  });

  test('2. een gestopte post met een betaling daarna wordt niet stil omgezet: de vraag staat in Kloppen mijn gegevens?', async ({ page }) => {
    await S.boot(page);
    expect(await page.evaluate(() => SET.postStatus['HEALTH CLUB'])).toMatchObject({ status: 'gestopt' });
    const Q = await page.evaluate(() => gegevensVragen().filter(q => q.soort === 'poststop'));
    expect(Q.map(q => [q.key, q.dag])).toEqual([['HEALTH CLUB', '2026-10-08']]);
    await page.evaluate(() => { go('maand'); });
    const regel = await page.locator('[data-gegevensregel]').textContent();   // v428: de kop van de eigen kaart (hoofdletters via CSS)
    expect(regel).toContain('Kloppen mijn gegevens?');
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.evaluate(() => openGegevensVragen('alle'));
    const v = page.locator('[data-gegevensvraag="poststop"]');
    expect(await v.innerText()).toContain('Health Club · gestopt, maar betaald op 8 okt. Was dat de laatste betaling?');
    expect(await v.locator('[data-poststopja]').innerText()).toBe('Ja, laatste');
    expect(await v.locator('[data-poststopnee]').innerText()).toBe('Nee, loopt nog');
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);   // openen schrijft niets
    await v.locator('[data-poststopja]').click();
    expect(await page.evaluate(() => SET.postStatus['HEALTH CLUB'])).toMatchObject({ status: 'afloop', tot: '2026-10-08' });
    expect(await page.evaluate(() => postStatus('HEALTH CLUB'))).toMatchObject({ status: 'gestopt', afloop: true, weerBetaald: false });
    expect(await page.evaluate(() => gegevensVragen().filter(q => q.soort === 'poststop').length)).toBe(0);
    expect((await lees(page)).find(x => x.startsWith('  OPGEZEGD, LOOPT AF'))).toBe('  OPGEZEGD, LOOPT AF (v421): Health Club (laatste betaling 8 okt)');
  });

  test('2. Nee, loopt nog: de post is weer actief en wordt weer verwacht; en de vraag staat niet ook in Let op', async ({ page }) => {
    await S.boot(page);
    expect(await page.evaluate(() => gripLetOpItems().filter(x => x.soort === 'weerbetaald').length)).toBe(0);
    await page.evaluate(() => { openGegevensVragen('alle'); document.querySelector('[data-poststopnee]').click(); });
    expect(await page.evaluate(() => [postStatus('HEALTH CLUB').status, postTelt('HEALTH CLUB')])).toEqual(['actief', true]);
  });

  test('2. de migratie van v421 draait terug: alleen wat de app omzette, een keer', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => {
      SET.postStatus['HEALTH CLUB'] = { status: 'afloop', op: '2026-09-20', laatste: '2026-09-10', tot: '2026-10-08', migr: 'v421' };
      SET.postStatus['SHURGARD NL'] = { status: 'afloop', op: '2026-10-01', laatste: '2026-09-30', tot: '' };   // jouw eigen keuze
      delete SET.afloop422; SET.afloop421 = '2026-10-01';
      const a = afloopTerug(), b = afloopTerug();
      return { a, b, hc: SET.postStatus['HEALTH CLUB'], sh: SET.postStatus['SHURGARD NL'], v421: 'afloop421' in SET }; });
    expect(r.a).toBe(true); expect(r.b).toBe(false);
    expect(r.hc).toEqual({ status: 'gestopt', op: '2026-09-20', laatste: '2026-09-10' });
    expect(r.sh.status).toBe('afloop');
    expect(r.v421).toBe(false);
    expect(await page.evaluate(() => typeof afloopMigreer)).toBe('undefined');
  });

  test('3. een Tikkie is een uitgave in zijn categorie; een ontvangen Tikkie verlaagt die; met je eigen naam blijft hij intern', async ({ page }) => {
    await S.boot(page);
    expect(await cat(page, '2026-09-20', -60, 'TIKKIE')).toBe('overig');
    expect(await cat(page, '2026-10-03', -45, 'TIKKIE')).toBe('overig');
    await zet(page, [
      { date: '2026-10-06', amount: -90, name: 'Tikkie', desc: 'TIKKIE ID 4600 RESTAURANT LONA' },
      { date: '2026-10-07', amount: 30, name: 'Tikkie', desc: 'TIKKIE ID 4601 BETAALVERZOEK' },
      { date: '2026-10-08', amount: -25, name: 'Vincent Ernst Sumter', desc: 'VINCENT ERNST SUMTER VIA TIKKIE' }]);
    expect(await cat(page, '2026-10-06', -90, 'TIKKIE')).toBe('uiteten');   // de categorie die een regel hem gaf
    expect(await cat(page, '2026-10-07', 30, 'TIKKIE')).toBe('uiteten');    // ontvangen: de categorie van de laatste betaalde Tikkie
    expect(await cat(page, '2026-10-08', -25, 'TIKKIE')).toBe('intern');    // je eigen naam: een eigen overboeking
    const netto = await page.evaluate(() => catSpendMap('2026-10').uiteten);
    const zonder = await page.evaluate(() => { const t = TX.find(t => t.date === '2026-10-07' && t.amount === 30); const o = OVR[t.id]; OVR[t.id] = 'intern'; const v = catSpendMap('2026-10').uiteten; if (o) OVR[t.id] = o; else delete OVR[t.id]; return v; });
    expect(Math.round(zonder - netto)).toBe(30);   // de ontvangst verlaagt de uitgave
    expect(await page.evaluate(() => WISSEL420.filter(id => /TIKKIE/.test((TX.find(t => t.id === id) || {}).desc || '')).length)).toBe(0);
    expect(await page.evaluate(() => ANDER_KW.includes('TIKKIE'))).toBe(false);
  });

  test('3. een ontvangen Tikkie zonder betaalde Tikkie ervoor staat op Overig; een lening telt alleen als jij hem markeert', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { TX = TX.filter(t => !/TIKKIE/.test(t.desc)); save(); });
    await zet(page, [{ date: '2026-10-07', amount: 30, name: 'Tikkie', desc: 'TIKKIE ID 4601 BETAALVERZOEK' }]);
    expect(await cat(page, '2026-10-07', 30, 'TIKKIE')).toBe('overig');
    /* een lening aan "Tikkie" gemarkeerd: een ontvangen Tikkie wordt niet vanzelf weggestreept */
    await zet(page, [{ date: '2026-10-01', amount: -50, name: 'Tikkie', desc: 'TIKKIE ID 4700 VOORSCHOT' }]);
    await page.evaluate(() => { const t = TX.find(t => t.date === '2026-10-01' && t.amount === -50); markLoan(t.id, 'uit', 'lening'); TX.forEach(categorize); applyOwnAccounts(); save(); });
    expect(await page.evaluate(() => loans()[0].terugAuto || [])).toEqual([]);
    expect(await cat(page, '2026-10-07', 30, 'TIKKIE')).not.toBe('uitgeleend');
  });

  test('3. blok 20 noemt welke boekingen teruggaan naar uitgave, en oktober wijkt niet meer af van v419', async ({ page }) => {
    await S.boot(page);
    const L = await lees(page), i = L.findIndex(x => x.startsWith('      TERUG NAAR UITGAVE'));
    expect(L[i]).toBe('      TERUG NAAR UITGAVE (v422, Tikkie, in v420/v421 overboeking aan een ander): ');
    expect(L[i + 1]).toBe('        20-09 -60.00 Tikkie -> potjes (variabel) [Overig]');
    expect(L[i + 2]).toBe('        03-10 -45.00 Tikkie -> potjes (variabel) [Overig]');
    const j = L.findIndex(x => x.startsWith('  VERSCHUIVING DOOR DE REGELS'));
    expect(L[j + 1]).toBe('      potjes (variabel) verwacht: v419 1468.67 -> nu 1468.67 (+0.00)');
    expect(L.find(x => x.startsWith('      waarvan overboeking aan een ander'))).toBe('      waarvan overboeking aan een ander (geen eigen IBAN en niet je eigen naam, v419): apr 0 · mei 0 · jun 0 · jul 0 · aug 0 · sep 0 · okt* 0');
  });

  test('4. "Dit is mijn holding" toont per boeking welke eigen categorie vervalt, voor je bevestigt', async ({ page }) => {
    await S.boot(page, { holding: false });
    await page.evaluate(() => { for (const [d, c] of [['2026-06-03', 'overig'], ['2026-08-26', 'cadeau']]) { const t = TX.find(t => t.date === d && /ERNST/.test(t.desc)); OVR[t.id] = CATS[c] ? c : 'overig'; } save(); });
    const rijen = await page.evaluate(() => { const t = TX.find(t => t.date === '2026-07-31' && /ERNST/.test(t.desc)); openSheet(t.id); document.querySelector('[data-holdingrij]').click();
      return [...document.querySelectorAll('[data-holdingovr]')].map(r => r.innerText.replace(/\s+/g, ' ').trim()); });
    expect(rijen.length).toBe(2);
    expect(rijen[0]).toBe('3 jun 2026 · je koos Overig -€200,00');
    expect(rijen[1]).toMatch(/^26 aug 2026 · je koos .+ €1\.500,00$/);
    expect(await page.evaluate(() => document.querySelector('#holdingSheet').innerText)).toContain('Je eigen categorie op 2 boekingen vervalt');
    expect(await page.evaluate(() => [...holdingKeys()].length)).toBe(0);   // openen schrijft niets (v426: de holding staat in SET.kennis)
  });
});
