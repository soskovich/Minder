/* v424: ONBEKENDE GROTE UITGAVEN BENOEMEN, ALLEEN MET BRON (gevraagd door de gebruiker). Op v421-stand (10 oktober 2026,
   GECONSTRUEERD: de boekingen van het toestel staan alleen daar) met:
   - 18-09 Gemeente Utrecht EUR 484 in Onvoorzien, zonder hint in de omschrijving (de boeking van de gebruiker: laag c, een vraag);
   - 03-10 Gemeente Utrecht EUR 120 met "NAHEFFING" in de omschrijving (laag b, voorstel Boete of wegslepen);
   - 25-09 CJIB Verkeersboetes EUR 150 in Onvoorzien (laag a, uit de omschrijving);
   - geen kandidaat: een Gemeente-boeking van EUR 60 (onder de 100) en een opname van EUR 200. */
/* v428: Let op bestaat niet meer; de handelingen staan in Kiezen onder Te kiezen (#gripTeKiezen, met data-letop), dus Grip
   opent hier op Kiezen. Alleen de plek is veranderd. */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return L.slice(i, j < 0 ? undefined : j); };
async function boot(page, o) {
  await S.boot(page, o);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v424' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    add('2026-09-18', -484, 'Gemeente Utrecht', 'GEMEENTE UTRECHT KENMERK 7731200918', 'onvoorzien');
    add('2026-10-03', -120, 'Gemeente Utrecht', 'GEMEENTE UTRECHT NAHEFFING PARKEERBELASTING', 'onvoorzien');
    add('2026-09-25', -150, 'CJIB Verkeersboetes', 'CJIB VERKEERSBOETES 4410', 'onvoorzien');
    add('2026-09-20', -60, 'Gemeente Utrecht', 'GEMEENTE UTRECHT KLEIN', 'onvoorzien');
    add('2026-09-21', -200, 'Geldmaat Koestraat 13', 'GEA, BETAALPAS GELDMAAT KOESTRAAT 13');
    TX.sort((a, c) => a.date.localeCompare(c.date));
    applyOwnAccounts(); buildAccMeta(); save(); render();
  }, { MAIN: S.MAIN });
  [G484, G120, CJIB, K60, OPN] = await ids(page);
}
/* categorize() zet de id uit rekening, datum, bedrag en omschrijving (txId), dus de ids komen uit de pagina */
let G484, G120, CJIB, K60, OPN;
const ids = page => page.evaluate(() => { const f = (d, a) => TX.find(t => t.date === d && t.amount === a).id; return [f('2026-09-18', -484), f('2026-10-03', -120), f('2026-09-25', -150), f('2026-09-20', -60), f('2026-09-21', -200)]; });
const stand = (page, tid) => page.evaluate(tid => { const B = benoemStand(TX.find(t => t.id === tid)); return B && { laag: B.laag, label: B.label || null, bron: B.bron || null, aard: B.aard || null, voorstel: B.voorstel || null }; }, tid);

test.describe('v424', () => {
  test('1. drie lagen: zeker uit de omschrijving, een voorstel bij een hint, een vraag zonder hint; kleine en opnames niet', async ({ page }) => {
    await boot(page);
    expect(await stand(page, CJIB)).toEqual({ laag: 'a', label: 'Verkeersboete', bron: 'omschrijving', aard: null, voorstel: null });
    expect(await stand(page, G120)).toEqual({ laag: 'b', label: null, bron: null, aard: null, voorstel: 'Boete of wegslepen' });
    expect(await stand(page, G484)).toEqual({ laag: 'c', label: null, bron: null, aard: null, voorstel: null });
    expect(await stand(page, K60)).toBeNull();
    expect(await stand(page, OPN)).toBeNull();
    expect(await page.evaluate(t => benoemTekst(TX.find(x => x.id === t)), CJIB)).toBe('Verkeersboete · uit de omschrijving');
    expect(await page.evaluate(t => benoemTekst(TX.find(x => x.id === t)), G484)).toBe('Gemeente Utrecht · nog niet benoemd');
    /* 5. Zien: in de sheet zonder potje staat de grote uitgave met zijn naam en bron, of "nog niet benoemd" */
    const Z = await page.evaluate(() => { openZonderPotje(); return [...document.querySelectorAll('[data-benoemzien]')].map(e => e.innerText.replace(/\s+/g, ' ').trim()); });
    expect(Z.length).toBeGreaterThan(0);
    for (const r of Z) expect(r).toMatch(/· (.+ · nog niet benoemd|.+ · (uit de omschrijving|door jou bevestigd|door jou))$/);
  });

  test('6. de boeking van 18-09 staat als vraag in Zien, met de antwoorden voor een gemeente', async ({ page }) => {
    await boot(page);
    const Q = await page.evaluate(ids => { openGegevensVragen('alle'); return [...document.querySelectorAll('[data-gegevensvraag="benoem"]')].filter(e => ids.includes(e.dataset.tx)).map(e => ({ tx: e.dataset.tx, laag: e.dataset.benoemlaag, kop: e.querySelector('div').innerText, opties: [...e.querySelectorAll('[data-benoemoptie]')].map(o => o.innerText) })); }, [G484, G120]);
    expect(Q).toEqual([
      { tx: G484, laag: 'c', kop: '€484,00 aan Gemeente Utrecht · 18 sep · wat was dit?', opties: ['Gemeentebelasting', 'Boete of wegslepen', 'Leges of vergunning', 'Anders…', 'Hoort in een potje', 'Weet ik niet'] },
      { tx: G120, laag: 'b', kop: '€120,00 aan Gemeente Utrecht · 3 okt · wat was dit?', opties: ['Boete of wegslepen · klopt', 'Gemeentebelasting', 'Leges of vergunning', 'Anders…', 'Hoort in een potje', 'Weet ik niet'] }]);   /* v425: op bedrag; v456: Hoort in een potje */
    expect(await page.locator(`[data-tx="${G120}"] [data-benoemvoorstel]`).innerText()).toBe('voorstel: Boete of wegslepen · uit de omschrijving: "naheffing"');
    /* openen schrijft niets; de eerste tik ook niet */
    await page.locator(`[data-tx="${G484}"] [data-benoemoptie="Boete of wegslepen"]`).click();
    expect(await page.evaluate(() => Object.values(SET.kennis || {}).filter(E => !['holding', 'lening', 'post', 'salaris'].includes(E.soort)).length)).toBe(0);   // v426: holding, lening en post staan er sinds v426 ook
    expect(await page.locator(`[data-tx="${G484}"] [data-benoemgekozen]`).innerText()).toBe('Boete of wegslepen · eenmalig of komt het terug?');
    await page.locator(`[data-tx="${G484}"] [data-benoemaard="eenmalig"]`).click();
    expect(await stand(page, G484)).toEqual({ laag: 'antw', label: 'Boete of wegslepen', bron: 'jij', aard: 'eenmalig', voorstel: null });
    /* 3. Terugblik: eenmalig, telt niet als gedrag, met de bron (5) */
    const T = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = gripTerugblikHtml(); document.body.appendChild(d); const e = d.querySelector('[data-terugeenmalig]'); return e && e.innerText.replace(/\s+/g, ' ').trim(); });
    expect(T).toContain('Eenmalig, telt niet als gedrag');
    expect(T).toContain('Boete of wegslepen Gemeente Utrecht · 18 sep · door jou €484');
    /* blok 20 */
    const B = sectie(await lees(page), 'BENOEMDE UITGAVEN');
    expect(B).toContain('  18-09-2026 | 484.00 | Gemeente Utrecht [Onvoorzien] | Boete of wegslepen · door jou | eenmalig, telt niet als gedrag');
    expect(B).toContain('  25-09-2026 | 150.00 | Cjib Verkeersboetes [Onvoorzien] | Verkeersboete · uit de omschrijving | nog niet bepaald (een tik in Zien: eenmalig of komt terug)');   // v426
    expect(B).toContain('  03-10-2026 | 120.00 | Gemeente Utrecht [Onvoorzien] | nog niet benoemd · vraag in Zien met voorstel Boete of wegslepen (uit de omschrijving: naheffing) | -');
    expect(B.some(r => r.includes('Geldmaat') || r.includes('| 60.00 |'))).toBe(false);
  });

  test('2/3. een bevestigd voorstel dat terugkomt geeft een reservering in Kiezen; opslaan laat het voorstel zwijgen', async ({ page }) => {
    await boot(page);
    await page.evaluate(t => { benoemKies(t, 'Boete of wegslepen'); benoemAard(t, 'terug'); }, G120);
    expect(await stand(page, G120)).toEqual({ laag: 'antw', label: 'Boete of wegslepen', bron: 'bevestigd', aard: 'terug', voorstel: null });
    /* komt terug staat niet onder "eenmalig, telt niet als gedrag" */
    expect(await page.evaluate(t => gripTerugblik(thisYM()).eenmalig.map(B => B.t.id).includes(t), G120)).toBe(false);
    expect(await page.evaluate(t => { const d = document.createElement('div'); d.innerHTML = gripTerugblikHtml(); return !!d.querySelector(`[data-terugbenoem="${t}"]`); }, G120)).toBe(false);
    const kies = () => page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = gripKiezenHtml(); document.body.appendChild(d); return [...d.querySelectorAll('[data-kiesbenoem]')].map(e => e.innerText.replace(/\s+/g, ' ').trim()); });
    expect(await kies()).toEqual(['↻ Boete of wegslepen komt terug · reservering? Gemeente Utrecht · €120 op 3 okt · voorstel, door jou bevestigd · voorstel €120 per jaar geen reservering ›']);
    await page.evaluate(() => benoemResVoorstel(benoemTerugVoorstellen()[0].key));
    expect(await page.evaluate(() => ['rNaam', 'rBedrag', 'rMaand'].map(i => document.getElementById(i).value))).toEqual(['Boete of wegslepen (Gemeente Utrecht)', '120', '2027-10']);
    await page.evaluate(() => saveReservering(''));
    expect(await page.evaluate(() => resLijst().filter(r => String(r.bron || '').startsWith('benoem:')).map(r => ({ naam: r.naam, bedrag: r.bedrag, iv: r.intervalM })))).toEqual([{ naam: 'Boete of wegslepen (Gemeente Utrecht)', bedrag: 120, iv: 12 }]);
    expect(await kies()).toEqual([]);
    /* een gewone nieuwe verplichting krijgt geen bron mee */
    await page.evaluate(() => { openReservering(''); document.getElementById('rNaam').value = 'Iets'; document.getElementById('rMaand').value = '2027-01'; saveReservering(''); });
    expect(await page.evaluate(() => resLijst().find(r => r.naam === 'Iets').bron || null)).toBeNull();
  });

  test('2. het antwoord geldt voor de volgende boeking van dezelfde partij en kenmerk, tenzij het bedrag meer dan 50% afwijkt', async ({ page }) => {
    await boot(page);
    await page.evaluate(t => { benoemKies(t, 'Boete of wegslepen'); benoemAard(t, 'eenmalig'); }, G484);
    const nieuw = await page.evaluate(({ MAIN }) => { const mk = (d, a) => { const t = { id: '', date: d, amount: a, acc: MAIN, name: 'Gemeente Utrecht', desc: 'GEMEENTE UTRECHT KENMERK 1', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'onvoorzien'; TX.push(t); return t.id; };
      const a = mk('2026-10-05', -700), b = mk('2026-10-06', -800); save();
      return [a, b].map(i => { const B = benoemStand(TX.find(t => t.id === i)); return { laag: B.laag, label: B.label || null, opnieuw: !!B.opnieuw }; }); }, { MAIN: S.MAIN });
    /* 700 is 45% boven 484 (neemt over), 800 is 65% erboven (opnieuw gevraagd) */
    expect(nieuw).toEqual([{ laag: 'antw', label: 'Boete of wegslepen', opnieuw: false }, { laag: 'c', label: null, opnieuw: true }]);
    /* een ander kenmerk (de naheffing) is een eigen sleutel en blijft een vraag */
    expect((await stand(page, G120)).laag).toBe('b');
    const sub = await page.evaluate(() => { openGegevensVragen('alle'); return document.querySelector(`[data-tx="${TX.find(t => t.date === '2026-10-06' && t.amount === -800).id}"] .small`).innerText; });
    expect(sub).toBe('eerder benoemd als Boete of wegslepen bij €484,00; dit bedrag wijkt meer dan 50% af');
  });

  test('4/5. Anders en Weet ik niet; Begrijpen en Zien tonen de bron, en zonder antwoord nooit een naam', async ({ page }) => {
    await boot(page);
    await page.evaluate(t => { openGegevensVragen('alle'); benoemKies(t, '__anders'); }, G484);
    await page.locator(`#benoemAnders_${G484}`).fill('Verhuisvergunning');
    await page.locator(`[data-tx="${G484}"] [data-benoemanderszet]`).click();
    await page.locator(`[data-tx="${G484}"] [data-benoemaard="eenmalig"]`).click();
    expect(await stand(page, G484)).toEqual({ laag: 'antw', label: 'Verhuisvergunning', bron: 'jij', aard: 'eenmalig', voorstel: null });
    await page.evaluate(t => { benoemKies(t, '__weetniet'); benoemAard(t, 'eenmalig'); }, G120);
    expect(await page.evaluate(t => benoemTekst(TX.find(x => x.id === t)), G120)).toBe('Gemeente Utrecht · nog niet benoemd');
    expect(await page.evaluate(ids => gegevensVragen().filter(q => q.soort === 'benoem' && ids.includes(q.t.id)).length, [G484, G120])).toBe(0);
    const Bg = await page.evaluate(ids => { const d = document.createElement('div'); d.innerHTML = gripBegrijpenHtml(); document.body.appendChild(d); return [...d.querySelectorAll('[data-benoemrij]')].filter(e => ids.includes(e.dataset.benoemrij)).map(e => e.innerText.replace(/\s+/g, ' ').trim()); }, [G484, G120, CJIB]);
    expect(Bg).toEqual(['Verhuisvergunning Gemeente Utrecht · 18 sep · door jou · eenmalig €484', 'Verkeersboete Cjib Verkeersboetes · 25 sep · uit de omschrijving €150', 'Gemeente Utrecht · nog niet benoemd Gemeente Utrecht · 3 okt · wat was dit? › €120']);
    /* ongedaan maken herstelt het antwoord */
    await page.evaluate(() => keuzeOngedaan());
    expect((await stand(page, G120)).laag).toBe('b');
  });

  /* v428: Let op is geen kaart meer; Kloppen mijn gegevens? is een eigen kaart op Zien (de enige plek daar die iets wijzigt),
     met de wachtrij eronder, en de koopknop blijft minstens 16px boven de menubalk. */
  test('fit: "Kloppen mijn gegevens?" is een eigen kaart op Zien, en de koopknop blijft boven de menubalk', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await page.evaluate(() => { go('maand'); });
    const r = await page.evaluate(() => { const g = document.querySelector('[data-gegevensregel]'), k = document.getElementById('gripGegevens');
      return { inKaart: !!(k && g && k.contains(g)), n: document.querySelectorAll('[data-gegevensregel]').length, tekst: g && g.textContent.replace(/\s+/g, ' ').trim(),
        rijen: k ? k.querySelectorAll('[data-gegevenskaart]').length : 0,
        ruimte: document.querySelector('.nav').getBoundingClientRect().top - document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom }; });
    expect(r.inKaart).toBe(true); expect(r.n).toBe(1);
    expect(r.tekst).toMatch(/^Kloppen mijn gegevens\?\s*\d+ ›$/);
    expect(r.rijen).toBeGreaterThan(0); expect(r.rijen).toBeLessThanOrEqual(3);
    expect(r.ruimte).toBeGreaterThanOrEqual(16);
    await page.locator('#gripGegevens [data-gegevensregel]').click();
    expect(await page.locator('#gegevensSheet').count()).toBe(1);
  });
});
