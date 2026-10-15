/* v427: AFRONDING VAN DE VRAGENRONDE, ALLEEN FOUTEN (gevraagd door de gebruiker). Op v421-stand (10 oktober 2026, GECONSTRUEERD:
   de boekingen van het toestel staan alleen daar) met de gemelde gevallen:
   - 11-04 Posh Clinic EUR 159 (Zorg) en 09-10 Lausa Eriksson via Tikkie EUR 159: het antwoord "Zorg, eenmalig" hoort bij de tweede;
   - Bram Visser via Tikkie EUR 120 in Vakantie (geen potje): een Tikkie die ook "wat was dit?" zou krijgen;
   - Aab Inz Tikkie +150 in augustus en oktober (een binnenkomende Tikkie) en Travelcard -125 in juli met +125 in augustus en
     oktober (een teruggave);
   - DUO EUR 150 (laag a, studieschuld) en 22-06 Renate Galdeij via Tikkie -200 met dezelfde dag +200 terug. */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return i < 0 ? [] : L.slice(i, j < 0 ? undefined : j); };
async function boot(page) {
  await S.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v427' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    add('2026-04-11', -159, 'Posh Clinic', 'POSH CLINIC AMSTERDAM', 'zorg');
    add('2026-10-09', -159, 'Lausa Eriksson via Tikki', 'LAUSA ERIKSSON VIA TIKKIE BETAALVERZOEK');
    add('2026-10-03', -120, 'Bram Visser via Tikki', 'BRAM VISSER VIA TIKKIE BETAALVERZOEK', 'vakantie');
    add('2026-08-12', 150, 'Aab Inz Tikkie', 'AAB INZ TIKKIE BETAALVERZOEK ETENTJE');
    add('2026-10-02', 150, 'Aab Inz Tikkie', 'AAB INZ TIKKIE BETAALVERZOEK WEEKEND');
    add('2026-07-14', -125, 'Travelcard', 'TRAVELCARD NEDERLAND');
    add('2026-08-20', 125, 'Travelcard', 'TRAVELCARD NEDERLAND');
    add('2026-10-05', 125, 'Travelcard', 'TRAVELCARD NEDERLAND');
    add('2026-10-02', -150, 'Duo', 'DUO DIENST UITVOERING ONDERWIJS', 'onvoorzien');
    add('2026-06-22', -200, 'Renate Galdeij via Tikki', 'RENATE GALDEIJ VIA TIKKIE BETAALVERZOEK', 'vakantie');
    add('2026-06-22', 200, 'Renate Galdeij', 'RENATE GALDEIJ TERUG');
    TX.sort((a, c) => a.date.localeCompare(c.date));
    applyOwnAccounts(); buildAccMeta(); kennisZaai(); save(); render();
  }, { MAIN: S.MAIN });
}
const tid = (page, n, a) => page.evaluate(([n, a]) => TX.find(t => t.name === n && t.amount === a).id, [n, a]);
const vragen = page => page.evaluate(() => gegevensVragen().map(q => ({ soort: q.soort, qkey: q.qkey, t: q.t ? q.t.id : null, kort: gegevensVraagKort(q) })));

test.describe('v427', () => {
  test('1. Zorg EUR 159 staat op de Tikkie aan Lausa Eriksson; Posh Clinic is weer nog niet benoemd; de vraag over Lausa Eriksson is uit OPEN VRAGEN', async ({ page }) => {
    await boot(page);
    const [P, L] = [await tid(page, 'Posh Clinic', -159), await tid(page, 'Lausa Eriksson via Tikki', -159)];
    const E = await page.evaluate(() => Object.values(SET.kennis).find(E => E.zaad === 'zorg159'));
    expect([E.partij, E.wat, E.bron, Array.isArray(E.tx) ? E.tx : Object.keys(E.tx)]).toEqual(['Lausa Eriksson', 'Zorgkosten', 'jij', [L]]);
    expect(await page.evaluate(id => benoemTekst(TX.find(t => t.id === id)), P)).toBe('Posh Clinic · nog niet benoemd');
    const Q = sectie(await lees(page), 'OPEN VRAGEN');
    expect(Q.length).toBeGreaterThan(1);
    expect(Q.some(r => /Eriksson/i.test(r))).toBe(false);
    /* de stand van v425/v426: het zaad stond op Posh Clinic; een keer weggehaald, en het gaat naar Lausa Eriksson */
    const na = await page.evaluate(([P, L]) => { for (const k of Object.keys(SET.kennis)) if (SET.kennis[k].zaad === 'zorg159') delete SET.kennis[k];
      SET.kennis['eenmalig|' + P] = { soort: 'eenmalig', partij: 'Posh Clinic', wat: 'Zorgkosten', bron: 'jij', op: '2026-10-10', zaad: 'zorg159', tx: [P] };
      delete SET.kennis425.zorg427; SET.kennis425.zorg159 = '2026-10-10';
      kennisZaai(); return [!!SET.kennis['eenmalig|' + P], Object.values(SET.kennis).filter(E => E.zaad === 'zorg159').map(E => (Array.isArray(E.tx) ? E.tx : Object.keys(E.tx))[0])]; }, [P, L]);
    expect(na).toEqual([false, [L]]);
    /* een keer: opnieuw zaaien verandert niets */
    expect(await page.evaluate(() => kennisZaai())).toBe(false);
  });

  test('2. een boeking is hooguit een vraag, en "via Tikkie" staat er niet twee keer', async ({ page }) => {
    await boot(page);
    const B = await tid(page, 'Bram Visser via Tikki', -120);
    expect(await page.evaluate(id => benoemStand(TX.find(t => t.id === id)).laag, B)).toBe('c');   // zonder v427 ook een benoem-vraag
    const V = (await vragen(page)).filter(q => q.t === B);
    expect(V).toEqual([{ soort: 'tikkie', qkey: 'tikkie|bram visser', t: B, kort: '€120,00 aan Bram Visser via Tikkie: wat was dit? · 3 okt' }]);
    const per = {}; for (const q of await vragen(page)) if (q.t) per[q.t] = (per[q.t] || 0) + 1;
    expect(Object.values(per).every(n => n === 1)).toBe(true);
    expect((await vragen(page)).some(q => /via Tikki via Tikkie|Via Tikki|Tikkie via Tikkie/.test(q.kort))).toBe(false);
    expect((await vragen(page)).filter(q => q.soort === 'tikkie').map(q => q.kort)).toContain('€60,00 aan Tikkie: wat was dit? · 20 sep');   // een onbekende persoon: geen "Tikkie via Tikkie"
  });

  test('3. "vast inkomen?" alleen bij een echte inkomensbron: niet bij een binnenkomende Tikkie, niet bij een partij die je betaalde', async ({ page }) => {
    await boot(page);
    const Q = (await vragen(page)).map(q => q.qkey);
    expect(Q.filter(q => /aab inz|travelcard/.test(q))).toEqual(['in|travelcard']);
    expect(Q.some(q => q.startsWith('vastink|'))).toBe(false);
    expect(await page.evaluate(() => { openGegevensVragen('in|travelcard'); return [...document.querySelectorAll('[data-qkey="in|travelcard"] [data-kennisoptie]')].map(e => e.dataset.kennisoptie); })).toContain('teruggave');
  });

  test('4. DUO is laag a: studieschuld uit de omschrijving, geen "wat was dit?"', async ({ page }) => {
    await boot(page);
    const D = await tid(page, 'Duo', -150);
    expect(await page.evaluate(id => { const B = benoemStand(TX.find(t => t.id === id)); return [B.laag, B.label, B.bron]; }, D)).toEqual(['a', 'Studieschuld', 'omschrijving']);
    const V = (await vragen(page)).filter(q => q.t === D);
    expect(V.map(q => q.kort)).toEqual(['€150,00 aan Duo: Studieschuld, eenmalig of komt terug? · 2 okt']);
    expect((await vragen(page)).some(q => /Duo/.test(q.kort) && /wat (was|is) dit/.test(q.kort))).toBe(false);
  });

  test('5. een Tikkie die dezelfde dag even groot terugkomt krijgt geen vraag, aan geen van beide kanten', async ({ page }) => {
    await boot(page);
    const [U, I] = [await tid(page, 'Renate Galdeij via Tikki', -200), await tid(page, 'Renate Galdeij', 200)];
    expect(await page.evaluate(([U, I]) => [kennisTerugZelfdeDag(TX.find(t => t.id === U)), kennisTerugZelfdeDag(TX.find(t => t.id === I))], [U, I])).toEqual([true, true]);
    expect((await vragen(page)).some(q => q.t === U || q.t === I)).toBe(false);
    /* een ander bedrag terug is wel een vraag */
    await page.evaluate(I => { TX.find(t => t.id === I).amount = 150; save(); }, I);
    expect((await vragen(page)).some(q => q.t === U)).toBe(true);
  });
});
