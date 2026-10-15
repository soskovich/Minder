/* v421: HOLDING ALS PARTIJKEUZE, SALARIS PER MAAND, OPGEZEGD LOOPT AF, OKTOBER MET VERWACHT, DE VERSCHUIVING VERKLAARD,
   CONTANT PER MAAND EN DE REKENING PER KANT (besluiten van de gebruiker op v420). Op v421-stand (10 oktober 2026,
   GECONSTRUEERD: de boekingen van het toestel staan alleen daar). */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return L.slice(i, j < 0 ? undefined : j); };
const cat = (page, d, a) => page.evaluate(({ d, a }) => { const t = TX.find(t => t.date === d && Math.abs(t.amount - a) < 0.005 && /ERNST/.test(t.desc)); return t && catOf(t); }, { d, a });
const HOLD = [['2026-05-04', -49.55], ['2026-06-03', -200], ['2026-06-04', -100], ['2026-06-10', -26], ['2026-07-31', 5000], ['2026-08-03', -5000], ['2026-08-26', 1500], ['2026-09-07', 2491.71]];

test.describe('v421', () => {
  test('1. "Dit is mijn holding": de maandbetaling blijft inkomen, de acht andere boekingen gaan naar Holding, en terug zet alles terug', async ({ page }) => {
    await S.boot(page, { holding: false });
    await page.evaluate(() => { const t = TX.find(t => t.date === '2026-06-03' && /ERNST/.test(t.desc)); OVR[t.id] = 'overig'; save(); });   // een eigen keuze die afwijkt van de regel (die zegt inkomen)
    expect(await cat(page, '2026-06-03', -200)).toBe('overig');
    expect(await cat(page, '2026-06-04', -100)).toBe('inkomen');   // zonder keuze: inkomen met een min
    const sheet = await page.evaluate(() => { const t = TX.find(t => t.date === '2026-07-31' && /ERNST/.test(t.desc)); openSheet(t.id);
      const r = document.querySelector('[data-holdingrij]'); r.click(); return document.querySelector('#holdingSheet').innerText; });
    expect(sheet).toContain('€3.463,86, in 4 maanden');   // v422: mei en augustus vallen buiten de marge en tellen als grootste bijschrijving
    expect(sheet).toContain('8 andere boekingen gaan naar Holding');
    expect(sheet).toContain('Je eigen categorie op 1 boeking vervalt');
    expect(await page.evaluate(() => SET.holdingPartij)).toBeFalsy();   // openen schrijft niets
    await page.evaluate(() => document.querySelector('[data-holdingzet]').click());
    for (const [d, a] of HOLD) expect(await cat(page, d, a)).toBe('holding');
    expect(await page.evaluate(() => TX.filter(t => /ERNST/.test(t.desc) && t.amount > 3000 && t.amount < 3600).every(t => catOf(t) === 'inkomen'))).toBe(true);
    expect(await page.evaluate(() => document.querySelector('[data-holdingrij="aan"]').innerText)).toContain('maandbetaling €3.463,86 is inkomen');
    await page.evaluate(() => document.querySelector('[data-holdingweg]').click());
    expect(await cat(page, '2026-06-03', -200)).toBe('overig');   // de eigen keuze staat terug
    expect(await cat(page, '2026-07-31', 5000)).toBe('inkomen');
    expect(await page.evaluate(() => Object.keys(SET.holdingPartij).length)).toBe(0);
  });

  test('1. blok 20: holding netto per maand met de boekingen, en de controle klopt in elke afgeronde maand', async ({ page }) => {
    await S.boot(page);
    const L = await lees(page), H = sectie(L, 'HOLDING');
    expect(H.find(x => x.startsWith('  terugkerende maandbetaling'))).toBe('  terugkerende maandbetaling: mediaan 3463.86 in 4 maanden, telt als inkomen (punt 1)');
    expect(H.find(x => x.startsWith('  netto:'))).toBe('  netto: apr 0 · mei -50 · jun -326 · jul 5000 · aug -3500 · sep 2492 · okt* 0');
    expect(H).toContain('      jun: 03-06 -200.00, 04-06 -100.00, 10-06 -26.00');
    const C = sectie(L, 'CONTROLE');
    for (const m of ['apr', 'mei', 'jul', 'aug', 'sep']) expect(C.find(x => x.startsWith(`  ${m}:`))).toMatch(/: klopt$/);
    expect(L.join('\n')).not.toContain('inkomen met een min');
  });

  test('2. buiten vast en potjes is nooit negatief; gebeurt het toch, dan staat de boeking bij de controle', async ({ page }) => {
    await S.boot(page);
    let L = await lees(page);
    expect(L).toContain('  buiten vast en potjes is in geen maand negatief');
    const U = L.find(x => x.startsWith('  apr ') && L[L.indexOf(x) - 1].startsWith('UITGAVEN ZONDER WONING'));
    for (const m of ['jul', 'aug', 'sep']) { const v = +U.match(new RegExp(`${m} (-?\\d+)`))[1]; expect(v).toBeGreaterThanOrEqual(1500); expect(v).toBeLessThanOrEqual(4500); }
    /* zonder holding: de 5000 van juli is inkomen, en een ontvangst van een ander in juli maakt buiten negatief */
    await page.evaluate(MAIN => { const t = { date: '2026-07-12', amount: 3000, name: 'Kees Jansen', desc: 'KEES JANSEN', typ: '', ref: '', src: 'csv', accName: '', refNums: [], acc: MAIN }; categorize(t); TX.push(t); applyOwnAccounts(); save(); }, S.MAIN);
    L = await lees(page);
    const C = sectie(L, 'CONTROLE'), r = C.find(x => x.startsWith('      LET OP jul:'));
    expect(r).toMatch(/buiten vast en potjes is -\d/);
    expect(C[C.indexOf(r) + 1]).toBe('        12-07 3000.00 Kees Jansen (Persoonlijke overboeking) -> ontbrekende groep: een ontvangst van een ander: een terugbetaling (Uitgeleend), je holding ("Dit is mijn holding") of een eigen rekening');
    expect(C.indexOf(r)).toBe(C.findIndex(x => x.startsWith('  jul:')) + 1);   // direct onder de maand in de controle
    expect(L).toContain('  buiten vast en potjes negatief in: jul (de boeking staat bij de CONTROLE)');
  });

  test('3. salaris per maand: de grootste terugkerende bron, en de vergelijking is mediaan tegen mediaan', async ({ page }) => {
    await S.boot(page);
    const I = sectie(await lees(page), '1. INKOMSTEN');
    expect(I).toContain('  bron apr-aug: Ernst Management Holding (recurKey "ERNST MANAGEMENT HOL"), mediaan 3463.86 over 6 maanden met inkomen van deze partij');
    expect(I.find(x => x.startsWith('  bron sep-okt: Skf'))).toBeTruthy();
    expect(I).toContain('  INKOMEN VOOR EN NA (mediaan tegen mediaan): Ernst Management Holding 3463.86 -> Skf 5216.00 vanaf sep: +1752.14');
    expect(I.find(x => x.startsWith('  jul:'))).toBe('  jul: salaris 3464 van Ernst Management Holding (24-07 3463.86)');
    expect(I.find(x => x.startsWith('  sep:'))).toBe('  sep: salaris 5216 van Skf (24-09 5216.00)');
    expect(I[I.findIndex(x => x.startsWith('  jul:')) + 1]).toBe('      overige inkomsten 0');   // de 5000 van juli is holding, geen inkomen
    /* het maandtotaal van juli met de 5000 zou de vergelijking scheef zetten: zonder holding is de bron nog steeds de mediaan */
    await S.boot(page, { holding: false });
    const J = sectie(await lees(page), '1. INKOMSTEN');
    expect(J).toContain('  INKOMEN VOOR EN NA (mediaan tegen mediaan): Ernst Management Holding 3463.86 -> Skf 5216.00 vanaf sep: +1752.14');
  });

  test('3. een salarisbron zonder inkomensboeking in je gegevens laat blok 20 niet omvallen', async ({ page }) => {
    await S.boot(page);
    const L = await page.evaluate(() => { const o = salarisBetalingLaatst; salarisBetalingLaatst = () => ({ name: 'Onbekende Werkgever', amount: 100, date: '2026-09-01' });
      try { return diagSalarisVerdeling(); } finally { salarisBetalingLaatst = o; } });
    expect(L.find(x => x.startsWith('  sep:'))).toBe('  sep: salaris 0 (geen betaling)');   // SKF met een betaling is dan geen terugkerende bron
    expect(L[L.findIndex(x => x.startsWith('  sep:')) + 1]).toBe('      overige inkomsten 5216: Skf 5216.00');
    expect(L.find(x => x.startsWith('  jul:'))).toBe('  jul: salaris 3464 van Ernst Management Holding (24-07 3463.86)');
  });

  test('4. opgezegd, loopt af: Health Club met de laatste betaling van 08-10 is geen "weer betaald"; een betaling daarna wel', async ({ page }) => {
    await S.boot(page);
    expect(await page.evaluate(() => postStatus('HEALTH CLUB').weerBetaald)).toBe(true);
    expect((await lees(page)).find(x => x.startsWith('  GESTOPT EN DAARNA NOG BETAALD'))).toBe('  GESTOPT EN DAARNA NOG BETAALD (v421): Health Club (gestopt op 20 sep, daarna betaald op 8 okt)');
    await page.evaluate(() => { SET.postStatus['SHURGARD NL'] = { status: 'gestopt', op: '2026-08-10', laatste: '2026-08-03' }; _dataGen++; });
    expect((await lees(page)).find(x => x.startsWith('  GESTOPT EN DAARNA NOG BETAALD'))).toContain('Shurgard Nl (gestopt op 10 aug, daarna betaald op 1 sep, 30 sep)');
    await page.evaluate(() => { delete SET.postStatus['SHURGARD NL']; _dataGen++; });
    /* v422: niets stil; jij antwoordt op de vraag in Zien ("Was dat de laatste betaling?") */
    expect(await page.evaluate(() => SET.postStatus['HEALTH CLUB'].status)).toBe('gestopt');
    await page.evaluate(() => postNaStopJa('HEALTH CLUB', '2026-10-08'));
    expect(await page.evaluate(() => SET.postStatus['HEALTH CLUB'])).toMatchObject({ status: 'afloop', tot: '2026-10-08' });
    expect(await page.evaluate(() => postStatus('HEALTH CLUB'))).toMatchObject({ status: 'gestopt', afloop: true, weerBetaald: false });
    let L = await lees(page);
    expect(L.find(x => x.startsWith('  GESTOPT EN DAARNA NOG BETAALD'))).toBe('  GESTOPT EN DAARNA NOG BETAALD (v421): geen');
    expect(L.find(x => x.startsWith('  OPGEZEGD, LOOPT AF'))).toBe('  OPGEZEGD, LOOPT AF (v421): Health Club (laatste betaling 8 okt)');
    /* nog een betaling na de laatste: dan meldt blok 20 hem wel */
    await page.evaluate(MAIN => { const t = { date: '2026-10-09', amount: -39, name: 'Health Club', desc: 'SEPA INCASSO HEALTH CLUB', typ: '', ref: '', src: 'csv', accName: '', refNums: [], acc: MAIN }; categorize(t); TX.push(t); applyOwnAccounts(); save(); }, S.MAIN);
    L = await lees(page);
    expect(L.find(x => x.startsWith('  GESTOPT EN DAARNA NOG BETAALD'))).toBe('  GESTOPT EN DAARNA NOG BETAALD (v421): Health Club (opgezegd, laatste betaling 8 okt op 10 okt, daarna betaald op 9 okt)');   // v422: je antwoord op 10 okt
  });

  test('4. de keuze in de sheet: opgezegd, loopt af telt mee tot de laatste betaling, daarna is hij gestopt', async ({ page }) => {
    await S.boot(page);
    const k = 'BELASTINGDIENST';
    const knoppen = await page.evaluate(k => { openPostStatus(k); return [...document.querySelectorAll('[data-postzet]')].map(b => b.dataset.postzet); }, k);
    expect(knoppen).toEqual(['gestopt', 'afloop']);
    await page.evaluate(() => document.querySelector('[data-postzet="afloop"]').click());
    expect(await page.evaluate(k => [postStatus(k).status, postTelt(k)], k)).toEqual(['afloop', true]);
    await page.evaluate(({ MAIN, k }) => { const t = { date: '2026-10-09', amount: -66, name: 'Belastingdienst', desc: 'SEPA INCASSO BELASTINGDIENST', typ: '', ref: '', src: 'csv', accName: '', refNums: [], acc: MAIN }; categorize(t); TX.push(t); applyOwnAccounts(); save(); }, { MAIN: S.MAIN, k });
    expect(await page.evaluate(k => [postStatus(k).status, postTelt(k), !!postStatus(k).weerBetaald], k)).toEqual(['gestopt', false, false]);
  });

  test('5. oktober in de regel zonder woning en studieschuld: geboekt plus verwacht, met alleen geboekt ernaast', async ({ page }) => {
    await S.boot(page);
    const L = await lees(page), i = L.findIndex(x => x.startsWith('UITGAVEN ZONDER WONING')), r = L[i + 1];
    expect(r).toMatch(/okt\* (\d+) \(\* = lopend: geboekt plus verwacht, zoals punt 7\) · okt\* alleen geboekt (\d+)$/);
    const [, ver, geb] = r.match(/okt\* (\d+) \(\*.* alleen geboekt (\d+)$/);
    const V = await page.evaluate(() => { const V = maandVooruit(); return Math.round(V.vasteEindR + V.varEindR + V.zonderStand.geboekt + V.zonderStand.verwacht); });
    const buiten = +L.find(x => x.startsWith('  buiten vast en potjes:')).match(/okt\* (-?\d+)/)[1];
    expect(+ver).toBe(V + buiten);   // de groepen van punt 7 zonder de inleg, plus buiten (geen woning of studieschuld in oktober)
    expect(+geb).toBeLessThan(+ver);
  });

  test('6. de verschuiving verklaard: de stand van v419 nagerekend, per boeking wat van groep wisselde, en niets opgeslagen', async ({ page }) => {
    await S.boot(page);
    const voor = await page.evaluate(() => ({ ls: localStorage.getItem('minder_set') + localStorage.getItem('minder_tx'), cats: TX.map(t => catOf(t)).join(), ovr: JSON.stringify(OVR) }));
    await page.evaluate(() => { window._setIt = 0; const o = localStorage.setItem.bind(localStorage); localStorage.setItem = (k, v) => { window._setIt++; return o(k, v); }; });
    const L = await lees(page), i = L.findIndex(x => x.startsWith('  VERSCHUIVING DOOR DE REGELS'));
    /* v422: de Tikkie is weer een uitgave, dus oktober wijkt niet meer af van v419 */
    expect(L[i + 1]).toBe('      potjes (variabel) verwacht: v419 1468.67 -> nu 1468.67 (+0.00)');
    expect(L[i + 4]).toBe('      verwacht totaal: v419 2774 -> nu 2774 (+0)');
    const rij = L.slice(i, i + 20);
    expect(rij.join('\n')).not.toContain('Tikkie');
    expect(rij).toContain('        jul 31-07 5000.00 Ernst Management Holding: inkomen [Inkomen] -> holding [Holding]');
    expect(await page.evaluate(() => window._setIt)).toBe(0);
    const na = await page.evaluate(() => ({ ls: localStorage.getItem('minder_set') + localStorage.getItem('minder_tx'), cats: TX.map(t => catOf(t)).join(), ovr: JSON.stringify(OVR) }));
    expect(na).toEqual(voor);
    expect(await page.evaluate(() => _SIM419)).toBe(false);
  });

  test('7. contant opgenomen per maand, met de opnames erachter', async ({ page }) => {
    await S.boot(page);
    const L = await lees(page), i = L.findIndex(x => x.startsWith('  CONTANT OPGENOMEN'));
    expect(L[i]).toBe('  CONTANT OPGENOMEN (v421): apr 0 · mei 0 · jun 200 · jul 0 · aug 120 · sep 0 · okt* 0');
    expect(L[i + 1]).toBe('      jun: 04-06 200.00 Geldmaat Koestraat 13');
    expect(L[i + 2]).toBe('      aug: 21-08 120.00 Geldmaat Zwanebloem 9');
  });

  test('8. bij een boeking zonder tegenkant staat de rekening, en een tegenhanger op dezelfde rekening wordt zo genoemd', async ({ page }) => {
    await S.boot(page);
    const C = sectie(await lees(page), 'CONTROLE'), j = C.findIndex(x => x.startsWith('  jun:'));
    expect(C[j]).toMatch(/VERSCHILT \+25$/);
    const rek = await page.evaluate(MAIN => accLabel(MAIN), S.MAIN);
    expect(C).toContain(`        16-06 -50.00 From Main to Zakgeld (Eigen rekening / overboeking zonder tegenkant in je gegevens, eigen: auto) · rekening ${rek} · tegenhanger 50.00 Ve Sumter op DEZELFDE rekening, dus geen paar`);
    expect(C.find(x => x.includes('01-06 25.00 Vincent Ernst Sumter'))).toContain(`· rekening ${rek}`);
  });
});
