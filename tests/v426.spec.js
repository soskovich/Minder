/* v426: v425 AFRONDEN EN TWEE AANPASSINGEN OP v424 (gevraagd door de gebruiker). Op v421-stand (10 oktober 2026, GECONSTRUEERD:
   de boekingen van het toestel staan alleen daar) met de negen antwoorden die de gebruiker gaf of al had:
   - Nikki voetbalcontributie, Ml Macnack woonhuur, Zorg EUR 159 (v427: de Tikkie aan Lausa Eriksson van 09-10), Gemeente EUR 484 (kennisZaai);
   - Ernst Management Holding (de holding van v421-stand), Health Club (gestopt, v421-stand);
   - drie leningen: Pam EUR 250 open, Ma EUR 405,99 en A. Buiten EUR 45 (zoals v423);
   en verder CJIB Verkeersboetes EUR 150 (laag a), Transavia EUR 150, Apotheek De Brug EUR 120 en Rijksoverheid EUR 210 (de antwoorden per partij). */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return i < 0 ? [] : L.slice(i, j < 0 ? undefined : j); };
async function boot(page) {
  await S.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v426' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    for (const m of ['2026-01', '2026-02', '2026-03']) add(m + '-01', -900, 'Ml Macnack', 'SEPA INCASSO ML MACNACK HUUR', 'huur');
    add('2026-09-18', -484, 'Gemeente Utrecht', 'GEMEENTE UTRECHT KENMERK 7731200918', 'onvoorzien');
    add('2026-09-25', -150, 'CJIB Verkeersboetes', 'CJIB VERKEERSBOETES 4410', 'onvoorzien');
    add('2026-10-06', -150, 'Transavia', 'TRANSAVIA AIRLINES BOEKING', 'vakantie');
    add('2026-10-01', -210, 'Rijksoverheid', 'RIJKSOVERHEID INCASSO 5521', 'onvoorzien');
    add('2026-10-08', -120, 'Apotheek De Brug', 'APOTHEEK DE BRUG', 'zorg');
    add('2026-10-09', -159, 'Lausa Eriksson via Tikki', 'LAUSA ERIKSSON VIA TIKKIE BETAALVERZOEK');
    const p = add('2026-09-02', -250, 'Pam', 'PAM BETAALVERZOEK');
    const b = add('2026-09-12', -45, 'A. Buiten', 'A. BUITEN BETAALVERZOEK');
    const m = add('2026-08-15', -405.99, 'Western Union', 'WESTERN UNION MA');
    TX.sort((a, c) => a.date.localeCompare(c.date));
    SET.loans = [
      { id: 'lpam', txId: p.id, naam: 'Pam', richting: 'uit', soort: 'lening', bedrag: 250, open: 250, datum: '2026-09-02', terug: '' },
      { id: 'lbuiten', txId: b.id, naam: 'A. Buiten', richting: 'uit', soort: 'lening', bedrag: 45, open: 0, datum: '2026-09-12', terug: '' },
      { id: 'lma', txId: m.id, naam: 'Ma', richting: 'uit', soort: 'lening', bedrag: 405.99, open: 0, datum: '2026-08-15', terug: '' }];
    OVR[p.id] = 'uitgeleend'; OVR[b.id] = 'uitgeleend'; OVR[m.id] = 'uitgeleend';
    applyOwnAccounts(); buildAccMeta(); kennisZaai(); save(); render();
  }, { MAIN: S.MAIN });
}
const tid = (page, d, a) => page.evaluate(([d, a]) => TX.find(t => t.date === d && t.amount === a).id, [d, a]);
const stand = (page, id) => page.evaluate(id => { const B = benoemStand(TX.find(t => t.id === id)); return B && { laag: B.laag, label: B.label || null, bron: B.bron || null, aard: B.aard || null }; }, id);

test.describe('v426', () => {
  test('0b. een bron: holding, leningen en Health Club staan in SET.kennis met bron "door jou"; de holdingvlag leest daaruit en de leningen schrijven er bij elke wijziging naartoe', async ({ page }) => {
    await boot(page);
    const K = await page.evaluate(() => Object.entries(SET.kennis).filter(([k, E]) => ['holding', 'lening', 'post'].includes(E.soort)).map(([k, E]) => `${k} | ${E.partij} | ${E.bron} | ${E.op}`).sort());
    expect(K).toEqual(['holding|ERNST MANAGEMENT HOL | Ernst Management Holding | jij | 2026-10-10', 'lening|lbuiten | A. Buiten | jij | 2026-09-12', 'lening|lma | Ma | jij | 2026-08-15',
      'lening|lpam | Pam | jij | 2026-09-02', 'post|HEALTH CLUB | Health Club | jij | 2026-09-20']);
    /* de holding heeft geen tweede opslag meer: de oude plek is weg, en de vlag leest SET.kennis */
    expect(await page.evaluate(() => [SET.holdingPartij || null, [...holdingKeys()]])).toEqual([null, ['ERNST MANAGEMENT HOL']]);
    const h5000 = await tid(page, '2026-07-31', 5000);
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), h5000)).toBe('holding');
    expect(await page.evaluate(id => { const E = SET.kennis['holding|ERNST MANAGEMENT HOL']; delete SET.kennis['holding|ERNST MANAGEMENT HOL']; applyOwnAccounts(); const c = catOf(TX.find(t => t.id === id)); SET.kennis['holding|ERNST MANAGEMENT HOL'] = E; applyOwnAccounts(); return c; }, h5000)).toBe('inkomen');
    /* een back-up met de oude plek gaat er een keer in op */
    expect(await page.evaluate(() => { delete SET.kennis['holding|ERNST MANAGEMENT HOL']; SET.holdingPartij = { 'ERNST MANAGEMENT HOL': { op: '2026-10-10', naam: 'Ernst Management Holding', ovrVoor: {} } };
      const k = [...holdingKeys()]; return [k, SET.holdingPartij || null, SET.kennis['holding|ERNST MANAGEMENT HOL'].bron]; })).toEqual([['ERNST MANAGEMENT HOL'], null, 'jij']);
    /* Uitgeleend schrijft bij elke wijziging naar SET.kennis: een nieuwe lening staat erin, een weggehaalde niet meer */
    await page.evaluate(() => { const t = TX.find(t => t.name === 'Sportclub' || t.amount === -484); markLoan(t.id, 'uit', 'lening'); save(); });
    expect(await page.evaluate(() => Object.values(SET.kennis).filter(E => E.soort === 'lening').length)).toBe(4);
    await page.evaluate(() => { SET.loans = loans().filter(l => l.id !== 'lpam'); save(); });
    expect(await page.evaluate(() => [!!SET.kennis['lening|lpam'], Object.values(SET.kennis).filter(E => E.soort === 'lening').length])).toEqual([false, 3]);
    /* ook zonder save (een back-up of een stand die in het geheugen is gezet): de lezer synchroniseert eerst */
    expect(await page.evaluate(() => { SET.loans.push({ id: 'lx', txId: '', naam: 'Kees', richting: 'uit', soort: 'lening', bedrag: 100, open: 100, datum: '2026-10-01', terug: '' });
      return kennisLijst().some(x => x.id === 'k:lening|lx' && x.partij === 'Kees'); })).toBe(true);
    /* een post die weer actief is staat er niet meer */
    await page.evaluate(() => { SET.postStatus['HEALTH CLUB'] = { status: 'actief', op: '2026-10-10', laatste: '2026-10-08' }; save(); });
    expect(await page.evaluate(() => !!SET.kennis['post|HEALTH CLUB'])).toBe(false);
  });

  test('0b. "Wat Minder van jou weet" toont ze; Vergeten toont eerst wat er verschuift (holding: "jul +€5.000 inkomen") en zet het daarna terug', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openKennis());
    for (const r of ['holding|ERNST MANAGEMENT HOL', 'lening|lpam', 'lening|lma', 'lening|lbuiten', 'post|HEALTH CLUB']) expect(await page.locator(`[data-kennisrij="k:${r}"]`).count()).toBe(1);
    expect(await page.locator('[data-kennisgroep="leningen"]').innerText()).toContain('Uitgeleend €250,00 · nog open €250,00');
    expect(await page.locator('[data-kennisgroep="inkomen"]').innerText()).toContain('Je holding (eigen bedrijf)');
    expect(await page.locator('[data-kennisgroep="vast"]').innerText()).toContain('Health Club');
    /* het gevolg vooraf, in het geheugen doorgerekend: openen schrijft niets */
    const voor = await page.evaluate(() => JSON.stringify([SET.kennis, OVR]));
    const G = await page.evaluate(() => { openKennisVergeet('k:holding|ERNST MANAGEMENT HOL'); return document.querySelector('[data-kennisgevolg]').innerText; });
    expect(G).toContain('jul +€5.000 inkomen');
    expect(await page.evaluate(() => JSON.stringify([SET.kennis, OVR]))).toBe(voor);
    await page.locator('[data-kennisvergeetzet]').click();
    expect(await page.evaluate(() => [[...holdingKeys()].length, !!SET.kennis['holding|ERNST MANAGEMENT HOL'], catOf(TX.find(t => t.date === '2026-07-31' && t.amount === 5000))])).toEqual([0, false, 'inkomen']);
    /* een lening vergeten haalt hem uit Uitgeleend; Health Club vergeten haalt de status weg */
    const GL = await page.evaluate(() => { openKennisVergeet('k:lening|lpam'); return document.querySelector('[data-kennisgevolg]').innerText; });
    expect(GL).toContain('sep +€250 uitgaven');
    await page.locator('[data-kennisvergeetzet]').click();
    expect(await page.evaluate(() => [loans().some(l => l.id === 'lpam'), !!SET.kennis['lening|lpam']])).toEqual([false, false]);
    await page.evaluate(() => kennisVergeet('k:post|HEALTH CLUB'));
    expect(await page.evaluate(() => [!!(SET.postStatus || {})['HEALTH CLUB'], !!SET.kennis['post|HEALTH CLUB']])).toEqual([false, false]);
    /* Wijzigen opent de plek waar je het aanpast en laat het antwoord staan */
    await page.evaluate(() => kennisWijzig('k:lening|lma'));
    expect(await page.evaluate(() => !!SET.kennis['lening|lma'])).toBe(true);
  });

  test('0c. blok 20 sectie KENNIS toont alle 11 antwoorden met bron en datum (v435: de salarisregel van SKF erbij; v446: contant na je salaris)', async ({ page }) => {
    await boot(page);
    const K = sectie(await lees(page), 'KENNIS');
    expect(K[0]).toMatch(/^KENNIS \(v425\/v426\): 11 antwoorden/);
    expect(K.join('\n')).toMatch(/Salaris SKF: de 24e, in het weekend de maandag erna \| door jou/);   // v435
    for (const r of ['  Inkomen en eigen bedrijf | Ernst Management Holding | Je holding (eigen bedrijf) | door jou | 10-10-2026',
      '  Woning | Ml Macnack | Woonhuur (gestopt) | door jou | 10-10-2026',
      '  Leningen | Pam | Uitgeleend €250,00 · nog open €250,00 | door jou | 02-09-2026',
      '  Leningen | A. Buiten | Uitgeleend €45,00 · nog open €0,00 | door jou | 12-09-2026',
      '  Leningen | Ma | Uitgeleend €405,99 · nog open €0,00 | door jou | 15-08-2026',
      '  Vaste lasten | Nikki | Voetbalcontributie · Kinderen | door jou | 10-10-2026',
      '  Vaste lasten | Health Club | Gestopt | door jou | 20-09-2026',
      '  Eenmalige uitgaven | Gemeente Utrecht | Boete of wegslepen · eenmalig | door jou | 10-10-2026',
      '  Eenmalige uitgaven | Lausa Eriksson | Laserbehandeling · eenmalig | door jou | 10-10-2026',   // v452: het zaad laser452 vervangt zorg159 (eenmalig, met de regel van Gemeente EUR 484)
      '  Contant | Contant | Contant: ik pin na mijn salaris | door jou | 17-10-2026']) expect(K).toContain(r);   // v446
    expect(K.length).toBe(12);   // kop + 11 (v435: de salarisregel; v446: contant na je salaris)
  });

  test('1. laag a: de app benoemt het zelf, maar vraagt een tik Eenmalig / Komt terug; zonder tik is het in de Terugblik "nog niet bepaald"', async ({ page }) => {
    await boot(page);
    const C = await tid(page, '2026-09-25', -150);
    expect(await stand(page, C)).toEqual({ laag: 'a', label: 'Verkeersboete', bron: 'omschrijving', aard: null });
    /* de vraag: geen "wat was dit?", de naam staat al vast; hij telt in de wachtrij van hooguit 3 */
    const q = 'benoemtx|' + C;
    expect(await page.evaluate(q => [gegevensVragen().some(v => v.qkey === q), gegevensOpen().some(v => v.qkey === q)], q)).toEqual([true, true]);
    const rij = await page.evaluate(q => { openGegevensVragen(q); return document.querySelector(`[data-benoemlaag="a"]`).innerText; }, q);
    expect(rij).toContain('€150,00 aan Cjib Verkeersboetes · 25 sep · Verkeersboete');
    expect(rij).toContain('uit de omschrijving · eenmalig of komt het terug?');
    expect(rij).not.toContain('wat was dit');
    /* v456 punt 5: laag a heeft alleen de optie Hoort in een potje naast Eenmalig en Komt terug */
    expect(await page.locator('[data-benoemlaag="a"] [data-benoemoptie]').allInnerTexts()).toEqual(['Hoort in een potje']);
    /* Terugblik: nog niet bepaald, niet in de score en niet bij eenmalig */
    const T = await page.evaluate(() => { const T = gripTerugblik('2026-09'); return { onb: T.onbepaald.map(B => B.label), een: T.eenmalig.map(B => B.label) }; });
    expect(T).toEqual({ onb: ['Verkeersboete'], een: ['Boete of wegslepen'] });
    expect(await page.evaluate(() => { window._gripTab = 'terugblik'; document.querySelector('#gripInhoud') || go('maand'); return gripTerugblikHtml(); })).toContain('Nog niet bepaald · eenmalig of komt terug?');
    /* de tik */
    await page.locator('[data-benoemlaag="a"] [data-benoemaard="eenmalig"]').click();
    expect(await stand(page, C)).toEqual({ laag: 'a', label: 'Verkeersboete', bron: 'omschrijving', aard: 'eenmalig' });
    expect(await page.evaluate(q => gegevensVragen().some(v => v.qkey === q), q)).toBe(false);
    expect(await page.evaluate(() => { const T = gripTerugblik('2026-09'); return [T.onbepaald.length, T.eenmalig.map(B => B.label)]; })).toEqual([0, ['Boete of wegslepen', 'Verkeersboete']]);
    expect(await page.evaluate(() => { const E = Object.values(SET.kennis).find(E => E.soort === 'benoem' && E.label === 'Verkeersboete'); return [E.bron, E.aard]; })).toEqual(['omschrijving', 'eenmalig']);
  });

  test('2. de antwoorden passen bij de partij: Transavia €150 toont Reis als eerste en geen Boete of Belasting; die staan alleen bij de overheid', async ({ page }) => {
    await boot(page);
    const opties = id => page.evaluate(id => { openGegevensVragen('benoemtx|' + id); return [...document.querySelectorAll(`[data-tx="${id}"] [data-benoemoptie]`)].map(e => e.innerText); }, id);
    const TR = await tid(page, '2026-10-06', -150);
    expect(await opties(TR)).toEqual(['Reis', 'Eenmalige aankoop', 'Anders…', 'Hoort in een potje', 'Weet ik niet']);   // v456: Hoort in een potje
    const AP = await page.evaluate(() => TX.find(t => t.name === 'Apotheek De Brug').id);
    expect((await opties(AP))[0]).toBe('Zorg');
    const ZW = await page.evaluate(() => TX.find(t => /ZWEMLES/i.test(t.name + t.desc) && t.amount <= -100).id);
    expect((await opties(ZW)).slice(0, 2)).toEqual(['Kinderen', 'Sport']);
    const RO = await tid(page, '2026-10-01', -210);
    expect(await opties(RO)).toEqual(['Boete', 'Belasting', 'Anders…', 'Hoort in een potje', 'Weet ik niet']);
    for (const id of [TR, AP, ZW]) { const o = await opties(id); expect(o).not.toContain('Boete'); expect(o).not.toContain('Belasting'); }
    /* een voorgesteld antwoord is "voorstel, door jou bevestigd" en verhuist de boeking niet */
    await page.evaluate(id => { benoemKies(id, 'Reis'); benoemAard(id, 'eenmalig'); }, TR);
    expect(await stand(page, TR)).toEqual({ laag: 'antw', label: 'Reis', bron: 'bevestigd', aard: 'eenmalig' });
    expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), TR)).toBe('vakantie');
    await page.evaluate(id => { benoemKies(id, 'Eenmalige aankoop'); benoemAard(id, 'eenmalig'); }, AP);
    expect((await stand(page, AP)).bron).toBe('jij');
  });
});
