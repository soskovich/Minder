/* v420: HOLDING APART, LENINGEN, EN DE v419-REGELS OOK IN DE APP (besluiten van de gebruiker op v419). Op grip-v409-stand
   (10 oktober 2026, GECONSTRUEERD: de boekingen van het toestel staan alleen daar). */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return L.slice(i, j < 0 ? undefined : j); };
/* een boeking zoals de import hem maakt: categorize(), eventueel een eigen keuze, dan applyOwnAccounts() */
const zet = (page, rij) => page.evaluate(({ MAIN, rij }) => {
  const ids = [];
  for (const r of rij) { const t = Object.assign({ typ: '', ref: '', src: 'csv', accName: '', refNums: [], acc: MAIN }, r); delete t.ovr; delete t.onr; t.desc = t.desc || t.name.toUpperCase(); categorize(t); TX.push(t); ids.push(t.id);
    if (r.ovr) OVR[t.id] = r.ovr; if (r.onr) { SET.onregelmatig = SET.onregelmatig || {}; SET.onregelmatig[t.id] = r.onr; } }
  TX.sort((a, b) => a.date.localeCompare(b.date)); applyOwnAccounts(); buildAccMeta(); save(); return ids; }, { MAIN: S.MAIN, rij });

test.describe('v420', () => {
  test('holding (v421: de partij die jij aanwijst): de maandbetaling is inkomen, de rest Holding, en de controle klopt', async ({ page }) => {
    await S.boot(page);
    const [a, b, c] = await zet(page, [
      { date: '2026-07-31', amount: 5000, name: 'Ernst Management Holding' },
      { date: '2026-08-03', amount: -5000, name: 'Ernst Management Holding' },
      { date: '2026-08-26', amount: 1500, name: 'Ernst Management Holding' }]);
    await page.evaluate(id => { holdingZet(id); }, b);
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), b)).toBe('holding');
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), a)).toBe('holding');   // geen bedrag in 2 maanden: geen maandbetaling
    expect(await page.evaluate(() => (CATS.holding || {}).type)).toBe('internal');
    const L = await lees(page), H = sectie(L, 'HOLDING');
    expect(H[0]).toContain('Ernst Management Holding');
    expect(H.find(x => x.startsWith('  netto:'))).toContain('jul 5000 · aug -3500');
    expect(H.join('\n')).toContain('      aug: 03-08 -5000.00, 26-08 +1500.00');
    const I = sectie(L, '1. INKOMSTEN'), j = I.findIndex(x => x.startsWith('  jul:'));
    expect(I[j + 1]).toMatch(/^      overige inkomsten/);
    expect(I[j + 1]).not.toContain('Ernst');
    const C = sectie(L, 'CONTROLE');
    for (const m of ['jul', 'aug']) expect(C.find(x => x.startsWith(`  ${m}:`))).toMatch(/: klopt$/);
  });

  test('uitgeleend: drie leningen samen 750,99 open, dezelfde tegenpartij streept weg, bij twijfel een vraag, en geen uitgave', async ({ page }) => {
    await S.boot(page);
    const voor = await page.evaluate(() => totals('2026-09').spendNorm);
    const ids = await zet(page, [
      { date: '2026-07-30', amount: -300, name: 'Renate Galdeij' }, { date: '2026-08-06', amount: -45, name: 'A. Buiten' },
      { date: '2026-09-09', amount: -405.99, name: 'Western Union', desc: 'WESTERN UNION GELDOVERMAKING' }]);
    await page.evaluate(ids => { for (const id of ids) markLoan(id, 'uit', 'lening'); }, ids);
    expect((await lees(page)).join('\n')).not.toContain('Western Union -> persoonlijke overboeking');   // een lening wisselt niet van groep
    expect(await page.evaluate(() => totals('2026-09').spendNorm)).toBe(voor);   // een lening is geen uitgave
    let U = sectie(await lees(page), 'UITGELEEND');
    expect(U.find(x => x.startsWith('  TOTAAL NOG OPEN'))).toBe('  TOTAAL NOG OPEN: 750.99 · TOTAAL NIET MEER TERUG: 0.00 · leningen met een verschil zonder verklaring: 0')   // v423;
    expect(U).toContain('  09-09 Western Union | 405.99 | 0.00 | 405.99 | 0.00 · sluit');
    /* dezelfde tegenpartij: weggestreept zonder vraag; een ander bedrag zonder naam: een vraag */
    const [rt, onb] = await zet(page, [{ date: '2026-09-15', amount: 100, name: 'Renate Galdeij' }, { date: '2026-09-20', amount: 405.99, name: 'Hr J Jansen' }]);
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), rt)).toBe('uitgeleend');
    U = sectie(await lees(page), 'UITGELEEND');
    expect(U).toContain('  30-07 Renate Galdeij | 300.00 | 100.00 (15-09 100.00 zelfde tegenpartij) | 200.00 | 0.00 · sluit');
    expect(U.find(x => x.startsWith('  vragen in Zien'))).toBe('  vragen in Zien (Kloppen mijn gegevens?): 1');
    const Q = await page.evaluate(() => { openGegevensVragen('alle'); return document.querySelector('#gegevensSheet').innerText; });
    expect(Q).toContain('Is €405,99 van Hr J Jansen een terugbetaling van je lening?');
    /* Western Union streept alleen weg als jij het bevestigt */
    expect(await page.evaluate(() => loans().find(l => l.naam === 'Western Union').open)).toBe(405.99);
    await page.evaluate(() => document.querySelector('[data-leningja]').click());
    expect(await page.evaluate(() => loans().find(l => l.naam === 'Western Union').open)).toBe(0);
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), onb)).toBe('uitgeleend');
    expect(sectie(await lees(page), 'UITGELEEND').find(x => x.startsWith('  TOTAAL NOG OPEN'))).toBe('  TOTAAL NOG OPEN: 245.00 · TOTAAL NIET MEER TERUG: 0.00 · leningen met een verschil zonder verklaring: 0');
  });

  test('nee onthoudt de vraag, en Zien toont de regel alleen met een vraag', async ({ page }) => {
    await S.boot(page);
    const [w] = await zet(page, [{ date: '2026-09-09', amount: -405.99, name: 'Western Union', desc: 'WESTERN UNION GELDOVERMAKING' }]);
    await page.evaluate(id => markLoan(id, 'uit', 'lening'), w);
    const regel = () => page.evaluate(() => { go('maand'); return !!document.querySelector('[data-gegevensregel]'); });
    expect(await page.evaluate(() => gegevensVragen().filter(q => q.soort === 'lening').length)).toBe(0);
    await zet(page, [{ date: '2026-09-20', amount: 405.99, name: 'Hr J Jansen' }]);
    expect(await regel()).toBe(true);
    await page.evaluate(() => { openGegevensVragen('alle'); document.querySelector('[data-leningnee]').click(); });
    expect(await page.evaluate(() => loanVragen().length)).toBe(0);
    expect(await page.evaluate(() => loans()[0].open)).toBe(405.99);
  });

  test('buiten vast en potjes negatief: de boeking staat erbij met de groep die ontbreekt', async ({ page }) => {
    await S.boot(page);
    await zet(page, [{ date: '2026-05-12', amount: 3000, name: 'Kees Jansen' }]);
    const L = await lees(page), r = L.find(x => x.startsWith('      LET OP mei:'));   // v421: bij de controle
    expect(r).toMatch(/buiten vast en potjes is -\d/);
    expect(L[L.indexOf(r) + 1]).toBe('        12-05 3000.00 Kees Jansen (Persoonlijke overboeking) -> ontbrekende groep: een ontvangst van een ander: een terugbetaling (Uitgeleend), je holding ("Dit is mijn holding") of een eigen rekening');
  });

  test('5a: een opname is een uitgave contant, en een telling boekt alleen het verschil; een opname voor de grens blijft intern', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { SET.contant = { stand: 50, datum: '2026-10-01', op: 1 }; SET.opnameVanaf = '2026-10-01'; save(); });
    const [oud, nieuw] = await zet(page, [
      { date: '2026-09-28', amount: -200, name: 'Geldmaat Koestraat', desc: 'GEA, BETAALPAS GELDMAAT KOESTRAAT' },
      { date: '2026-10-05', amount: -400, name: 'Geldmaat Koestraat', desc: 'GEA, BETAALPAS GELDMAAT KOESTRAAT' }]);
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), oud)).toBe('intern');
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), nieuw)).toBe('contant');
    expect(await page.evaluate(() => contantVerwacht())).toBe(450);
    const r = await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<input id="contInput" value="150">'); contantOpslaan();
      const b = TX.find(t => t.src === 'contant'); const som = TX.filter(t => t.date >= '2026-10-01' && catOf(t) === 'contant').reduce((a, t) => a - t.amount, 0);
      return { b: b && b.amount, som, stand: contantVerwacht() }; });
    expect(r.b).toBe(100);       // 400 stond al als uitgave; 300 ging er werkelijk uit, dus -100
    expect(r.som).toBe(300);     // 50 + 400 - 150: niets dubbel
    expect(r.stand).toBe(150);
  });

  test('5a: de eerste telling boekt terug wat er van de opnames nog in je zak zit, en een volgende telling alleen het verschil', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { delete SET.contant; SET.opnameVanaf = ''; TX = TX.filter(t => catOf(t) !== 'contant'); save(); });
    await zet(page, [{ date: '2026-10-05', amount: -400, name: 'Geldmaat Koestraat', desc: 'GEA, BETAALPAS GELDMAAT KOESTRAAT' }]);
    const tel = b => page.evaluate(b => { document.querySelectorAll('#contInput').forEach(e => e.remove()); document.body.insertAdjacentHTML('beforeend', `<input id="contInput" value="${b}">`); contantOpslaan();
      return { boeking: (TX.find(t => t.src === 'contant') || {}).amount, uit: TX.filter(t => t.date >= '2026-10-01' && catOf(t) === 'contant').reduce((a, t) => a - t.amount, 0) }; }, b);
    let r = await tel(150);
    expect(r.boeking).toBe(150);   // 150 van de 400 is nog niet besteed
    expect(r.uit).toBe(250);
    r = await tel(100);            // dezelfde dag: de boeking wordt bijgewerkt
    expect(r.uit).toBe(300);       // 400 opgenomen, 100 over: 300 uitgegeven, niets dubbel
  });
  test('5b: eigen rekening zonder bewijs blijft staan tot je bevestigt in Zien; een nieuwe boeking volgt meteen', async ({ page }) => {
    await S.boot(page);
    const id = await page.evaluate(MAIN => { const t = { date: '2026-09-03', amount: -100, name: 'Western Union', desc: 'WESTERN UNION GELDOVERMAKING', typ: '', ref: '', src: 'csv', accName: '', refNums: [], acc: MAIN };
      categorize(t); TX.push(t); delete SET.wissel420; applyOwnAccounts(); save(); return t.id; }, S.MAIN);   // de stand bij de eerste keer v420
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), id)).toBe('intern');
    expect(await page.evaluate(id => wisselOpen().some(t => t.id === id), id)).toBe(true);
    const [n] = await zet(page, [{ date: '2026-09-04', amount: -50, name: 'Revolut', desc: 'REVOLUT TOPUP' }]);
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), n)).toBe('persoonlijk');
    expect(await page.evaluate(() => { go('maand'); return document.querySelector('[data-gegevensregel]').textContent; })).toContain('Kloppen mijn gegevens?');   // v428: de kop van de eigen kaart (hoofdletters via CSS)
    const txt = await page.evaluate(() => { openWisselVraag(); return document.querySelector('#wisselSheet').innerText; });
    expect(txt).toContain('Western Union');
    await page.evaluate(() => document.querySelector('[data-wisselbevestig]').click());
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), id)).toBe('persoonlijk');
    expect(await page.evaluate(() => wisselOpen().length)).toBe(0);
    /* met bewijs blijft het een eigen overboeking: je eigen naam */
    const [e] = await zet(page, [{ date: '2026-09-05', amount: -60, name: 'VE Sumter via Tikkie', desc: 'AAB INZ TIKKIE VE SUMTER' }]);
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), e)).toBe('intern');
  });

  test('Nikki: een vaste maandpost per partij staat in het schema, als vast in de signaalrij, en de herzien-sheet biedt budget plus de post', async ({ page }) => {
    await S.boot(page);
    const [a] = await zet(page, [
      { date: '2026-08-20', amount: -47, name: 'Nikki', ovr: 'e_kinderen' }, { date: '2026-09-20', amount: -47, name: 'Nikki', ovr: 'e_kinderen' }]);
    await page.evaluate(id => { const t = TX.find(x => x.id === id); SET.fixOvrM = Object.assign({}, SET.fixOvrM, { [recurKey(t)]: 'fixed' }); SET.budgets.e_kinderen = 40; save(); }, a);
    const s = await page.evaluate(() => recurringSchedule().find(x => x.name === 'Nikki'));
    expect(s && s.cadans).toBe('maand');
    expect(await page.evaluate(() => potVastMaand('e_kinderen'))).toEqual({ som: 47, namen: ['Nikki'] });
    const x = await page.evaluate(() => potMaanden('e_kinderen'));
    expect(await page.evaluate(x => potReeksTekst(x), x)).toContain('vast €47 per maand sinds aug');
    const t = await page.evaluate(() => { openPotHerzien('e_kinderen'); return document.querySelector('[data-phoptie="v"]') ? document.querySelector('[data-phoptie="v"]').innerText : ''; });
    expect(t).toContain('Potje op €40 + €47 vast · €87');
    expect(t).toContain('het variabele deel blijft €40');
    expect(await page.evaluate(() => SET.budgets.e_kinderen)).toBe(40);   // openen zet niets
  });

  test('regel 6: uitgaven zonder woning en studieschuld = vast + potjes + buiten - woning - studieschuld', async ({ page }) => {
    await S.boot(page);
    const L = await lees(page), i = L.findIndex(x => x.startsWith('UITGAVEN ZONDER WONING EN STUDIESCHULD'));
    expect(i).toBeGreaterThan(0);
    const R = await page.evaluate(() => { const r = diagSalarisVerdeling(); return r; });
    expect(L[i + 1]).toMatch(/^  [a-z]{3} -?\d+ · /);
    expect(L[i + 2]).toMatch(/^  waarvan woning: .* · studieschuld: /);
    /* de woning is de partij met het meeste vaste geld in Huur, ook als dat het vaste potje is (hier geen post): niet Shurgard */
    expect(L[i]).toContain('- Woningstichting Oud (woning');
    expect(L[i + 2]).toContain('jul 760 · aug 674');
    expect(R.length).toBe(L.length);
  });
});
