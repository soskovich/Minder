/* v425: WAT MINDER ALLEEN VAN JOU KAN WETEN: VRAGEN, ONTHOUDEN, TERUGZIEN (gevraagd door de gebruiker). Op v421-stand (10 oktober
   2026, GECONSTRUEERD: de boekingen van het toestel staan alleen daar) met:
   - 02-10 en 07-10 J Bakker EUR 250 en EUR 120, persoonlijke overboeking (a);
   - 06-10 K van Dijk +300, een onbekende bijschrijving (b), en Stichting Wijkhuis +150 in augustus en oktober (vast inkomen?);
   - Sportclub Oost EUR 35 incasso in september en oktober, een nieuwe vaste last (c);
   - Woonstichting Rijn EUR 850 per maand in Huur (woning, e) en Ml Macnack EUR 900 in Huur tot juni (de woning van de gebruiker);
   - 09-10 een opname van EUR 150 (g);
   - Gemeente Utrecht EUR 484 in Onvoorzien en een lening aan Pam (de antwoorden van de gebruiker, 5). */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return i < 0 ? [] : L.slice(i, j < 0 ? undefined : j); };
async function boot(page, o) {
  o = o || {};
  await S.boot(page);
  await page.evaluate(({ MAIN, o }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v425' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    add('2026-10-02', -250, 'J Bakker', 'J BAKKER', 'persoonlijk');
    add('2026-10-07', -120, 'J Bakker', 'J BAKKER', 'persoonlijk');
    add('2026-10-06', 300, 'K van Dijk', 'K VAN DIJK');
    add('2026-08-14', 150, 'Stichting Wijkhuis', 'STICHTING WIJKHUIS');
    add('2026-10-01', 150, 'Stichting Wijkhuis', 'STICHTING WIJKHUIS');
    add('2026-09-04', -35, 'Sportclub Oost', 'SEPA INCASSO SPORTCLUB OOST');
    add('2026-10-04', -35, 'Sportclub Oost', 'SEPA INCASSO SPORTCLUB OOST');
    for (const m of ['2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add(m + '-01', -850, 'Woonstichting Rijn', 'SEPA INCASSO WOONSTICHTING RIJN', 'huur');
    if (o.macnack) for (const m of ['2026-01', '2026-02', '2026-03']) add(m + '-01', -900, 'Ml Macnack', 'SEPA INCASSO ML MACNACK HUUR', 'huur');
    add('2026-10-09', -150, 'Geldmaat Zwanebloem 9', 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM 9');
    add('2026-09-18', -484, 'Gemeente Utrecht', 'GEMEENTE UTRECHT KENMERK 7731200918', 'onvoorzien');
    TX.sort((a, c) => a.date.localeCompare(c.date));
    applyOwnAccounts(); buildAccMeta(); save(); render();
  }, { MAIN: S.MAIN, o });
}
const id = (page, d, a) => page.evaluate(([d, a]) => TX.find(t => t.date === d && t.amount === a).id, [d, a]);
const vragen = page => page.evaluate(() => gegevensVragen().map(q => q.qkey));
const kopVan = (page, qk) => page.evaluate(qk => { openGegevensVragen(qk); const e = document.querySelector(`[data-qkey="${qk}"]`) || document.querySelector('[data-gegevensvraag]'); return e && e.querySelector('div').innerText; }, qk);

test.describe('v425', () => {
  test('1/5. een opslag: v424 gaat op in SET.kennis, de antwoorden van de gebruiker staan erin met bron "door jou", en worden niet opnieuw gevraagd', async ({ page }) => {
    await boot(page, { macnack: true });
    const G = await id(page, '2026-09-18', -484);
    /* een v424-antwoord in SET.benoemd wordt bij het laden kennis */
    await page.evaluate(() => { SET.benoemd = { 'transavia|': { label: 'Vakantie', bron: 'jij', aard: 'eenmalig', bedrag: 350, op: '2026-10-01', tx: {} } }; kennisMigreer(); });
    expect(await page.evaluate(() => [SET.benoemd || null, (SET.kennis['benoem|transavia|'] || {}).soort])).toEqual([null, 'benoem']);
    expect(await page.evaluate(() => kennisZaai())).toBe(true);
    const K = await page.evaluate(() => kennisLijst().map(x => `${x.groep} | ${x.partij} | ${x.wat} | ${KENNIS_BRON[x.bron]}`));
    for (const r of ['vast | Nikki | Voetbalcontributie · Kinderen | door jou', 'woning | Ml Macnack | Woonhuur (gestopt) | door jou', 'eenmalig | Gemeente Utrecht | Boete of wegslepen · eenmalig | door jou',
'inkomen | Ernst Management Holding | Je holding (eigen bedrijf) | door jou', 'vast | Health Club | Gestopt | door jou']) expect(K).toContain(r);
    /* v427: Zorg EUR 159 hoort bij de Tikkie aan Lausa Eriksson; die staat niet in deze stand, dus de apotheek is nog niet benoemd */
    expect(K.some(r => r.includes('Zorgkosten'))).toBe(false);
    /* een keer: opnieuw zaaien schrijft niets, en een vergeten antwoord komt niet terug */
    expect(await page.evaluate(() => kennisZaai())).toBe(false);
    await page.evaluate(() => kennisVergeet('k:vast|NIKKI'));
    expect(await page.evaluate(() => [kennisZaai(), !!kennisGet('vast|NIKKI')])).toEqual([false, false]);
    /* niet opnieuw gevraagd: de gemeente, Nikki (vast per partij) en Macnack (woning) staan niet in de vragen */
    const Q = await vragen(page);
    expect(Q.some(q => q === 'benoemtx|' + G || q.startsWith('vast|NIKKI') || q.startsWith('woning|ML MACNACK'))).toBe(false);
    /* blok 20: KENNIS met bron en datum; de woning is wat jij aanwees */
    const L = await lees(page);
    expect(sectie(L, 'KENNIS')).toContain('  Woning | Ml Macnack | Woonhuur (gestopt) | door jou | 10-10-2026');
    expect(L.find(r => r.startsWith('UITGAVEN ZONDER WONING'))).toContain('- Ml Macnack (woning: door jou, 10 okt)');
  });

  test('2a. overboeking aan een ander: een vraag per partij; Lening zet hem in Uitgeleend, Uitgave laat de partij zwijgen', async ({ page }) => {
    await boot(page);
    const A = await id(page, '2026-10-02', -250), B = await id(page, '2026-10-07', -120);
    expect((await vragen(page)).filter(q => q.startsWith('uit|'))).toEqual(['uit|j bakker']);
    expect(await kopVan(page, 'uit|j bakker')).toBe('€250,00 aan J Bakker · 2 okt · wat was dit?');
    expect(await page.locator('[data-qkey="uit|j bakker"] [data-kennisoptie]').allInnerTexts()).toEqual(['Lening, verwacht terug', 'Uitgave', 'Gift', 'Weet ik niet']);
    expect(await page.evaluate(() => Object.values(SET.kennis || {}).filter(E => !['holding', 'lening', 'post', 'salaris'].includes(E.soort)).length)).toBe(0);   // v426: holding, lening en post staan er sinds v426 ook   // openen schrijft niets
    await page.locator('[data-qkey="uit|j bakker"] [data-kennisoptie="lening"]').click();
    expect(await page.evaluate(A => [catOf(TX.find(t => t.id === A)), !!loanFor(A), kennisGet('uit|j bakker').wat, kennisGet('uit|j bakker').bron], A)).toEqual(['uitgeleend', true, 'Lening, verwacht terug', 'jij']);
    /* een lening is per keer: de volgende overboeking aan J Bakker is de volgende vraag */
    expect(await page.evaluate(() => kennisUitVragen().map(q => q.t.date))).toEqual(['2026-10-07']);
    await page.evaluate(B => kennisUitZet(B, 'uitgave'), B);
    expect(await page.evaluate(() => kennisUitVragen().length)).toBe(0);
    /* de bron in de boekingssheet */
    expect(await page.evaluate(B => { openSheet(B); return document.querySelector('[data-kennisblok]').innerText.replace(/\s+/g, ' '); }, B)).toContain('Wat het is: Uitgave door jou');
  });

  test('2b. onbekende bijschrijving: teruggave verlaagt het potje (met bevestiging), gift telt als overig inkomen, terugbetaling streept de lening weg, eigen bedrijf toont de holding', async ({ page }) => {
    await boot(page);
    const K = await id(page, '2026-10-06', 300);
    expect(await kopVan(page, 'in|k van dijk')).toBe('€300,00 van K van Dijk · 6 okt · wat was dit?');
    expect(await page.locator('[data-qkey="in|k van dijk"] [data-kennisoptie]').allInnerTexts()).toEqual(['Terugbetaling (van een lening of Tikkie)', 'Teruggave (belasting, verzekering, winkel)', 'Gift', 'Verkoop', 'Extra inkomen (bonus, vakantiegeld)', 'Van mijn eigen bedrijf', 'Weet ik niet']);
    /* het salaris (SKF) en de holding vragen niets */
    expect((await vragen(page)).some(q => /skf|ernst/.test(q))).toBe(false);
    /* teruggave: eerst het potje en het gevolg, pas Bevestig schrijft */
    const uit0 = await page.evaluate(() => totals('2026-10').spendNorm);
    await page.locator('[data-qkey="in|k van dijk"] [data-kennisoptie="teruggave"]').click();
    await page.locator('[data-qkey="in|k van dijk"] [data-kennisdoel="vervoer"]').click();
    expect(await page.locator('[data-qkey="in|k van dijk"] [data-kennisgevolg]').innerText()).toBe('Verlaagt je uitgave in Vervoer & auto in oktober 2026 met €300,00.');
    expect(await page.evaluate(() => Object.values(SET.kennis || {}).filter(E => !['holding', 'lening', 'post', 'salaris'].includes(E.soort)).length)).toBe(0);   // v426: holding, lening en post staan er sinds v426 ook
    await page.locator('[data-qkey="in|k van dijk"] [data-kennisbevestig]').click();
    expect(Math.round(await page.evaluate(() => totals('2026-10').spendNorm))).toBe(Math.round(uit0 - 300));
    /* Vergeten toont het gevolg vooraf en zet het terug */
    expect(await page.evaluate(() => { openKennisVergeet('k:in|k van dijk'); return document.querySelector('[data-kennisgevolg]').innerText; })).toBe('Wat er verandert: okt +€300 uitgaven');
    await page.locator('[data-kennisvergeetzet]').click();
    expect(Math.round(await page.evaluate(() => totals('2026-10').spendNorm))).toBe(Math.round(uit0));
    expect(await vragen(page)).toContain('in|k van dijk');
    /* gift: overig inkomen, niet het salaris (de norm blijft) */
    /* als gift telt hij als overig inkomen: in het geld (alles), niet in de norm die je salaris is */
    const n0 = await page.evaluate(() => { const M = maandInkomen('2026-10'); return [M.norm, M.alles]; });
    await page.evaluate(K => kennisInKies(K, 'gift'), K);
    const n1 = await page.evaluate(() => { const M = maandInkomen('2026-10'); return [M.norm, M.alles]; });
    expect(n1[0]).toBe(n0[0]);
    expect(Math.round(n1[1] - n0[1])).toBe(300);
    expect(await page.evaluate(K => [catOf(TX.find(t => t.id === K)), SET.onregelmatig[K]], K)).toEqual(['inkomen', 300]);
    /* terugbetaling van een lening: kies de lening, zie het gevolg, bevestig */
    await page.evaluate(() => kennisVergeet('k:in|k van dijk'));
    await page.evaluate(() => { const A = TX.find(t => t.date === '2026-10-02' && t.amount === -250).id; markLoan(A, 'uit', 'lening'); });
    await page.evaluate(K => { kennisInKies(K, 'terug'); kennisInDoel(K, loans()[0].id); }, K);
    expect(await page.locator('[data-qkey="in|k van dijk"] [data-kennisgevolg]').innerText()).toBe('Lening aan J Bakker: nog open €250,00 wordt €0,00.');
    await page.locator('[data-qkey="in|k van dijk"] [data-kennisbevestig]').click();
    expect(await page.evaluate(() => [loans()[0].open, kennisGet('in|k van dijk').wat])).toEqual([0, 'Terugbetaling van de lening aan J Bakker']);
    /* van mijn eigen bedrijf: de voorvertoning van "Dit is mijn holding", er wordt niets geschreven */
    await page.evaluate(() => kennisVergeet('k:in|k van dijk'));
    await page.evaluate(K => kennisInKies(K, 'bedrijf'), K);
    expect(await page.locator('#holdingSheet [data-holdingzet]').isVisible()).toBe(true);
    expect(await page.evaluate(() => [kennisGet('in|k van dijk'), [...holdingKeys()].length])).toEqual([null, 1]);
  });

  test('2b. dezelfde partij in 2 maanden: een keer "Is dit een vast inkomen?"; Ja maakt alle bijschrijvingen inkomen', async ({ page }) => {
    await boot(page);
    const Q = await vragen(page);
    expect(Q).toContain('vastink|stichting wijkhuis');
    expect(Q.some(q => q === 'in|stichting wijkhuis')).toBe(false);
    expect(await kopVan(page, 'vastink|stichting wijkhuis')).toBe('Stichting Wijkhuis betaalde je in 2 maanden · is dit een vast inkomen?');
    await page.locator('[data-kennisvastink="ja"]').click();
    expect(await page.evaluate(() => TX.filter(t => t.name === 'Stichting Wijkhuis').map(catOf))).toEqual(['inkomen', 'inkomen']);
    expect((await vragen(page)).some(q => q.includes('stichting wijkhuis'))).toBe(false);
  });

  test('2c. nieuwe vaste last: eerst wat het is, dan het potje; een volgende betaling landt in dat potje', async ({ page }) => {
    await boot(page);
    expect(await kopVan(page, 'vast|SPORTCLUB OOST')).toBe('€35,00 per maand aan Sportclub Oost · wat is dit?');
    await page.locator('#kennisVast_SPORTCLUB_OOST').fill('Voetbal zoon');
    await page.locator('[data-kennisvastwat]').click();
    expect(await page.locator('[data-qkey="vast|SPORTCLUB OOST"] [data-kennisstap]').innerText()).toMatch(/^Voetbal zoon · /);
    expect(await page.evaluate(() => Object.values(SET.kennis || {}).filter(E => !['holding', 'lening', 'post', 'salaris'].includes(E.soort)).length)).toBe(0);   // v426: holding, lening en post staan er sinds v426 ook
    const kind = await page.evaluate(() => kennisCatVan('Kinderen'));
    await page.locator(`[data-qkey="vast|SPORTCLUB OOST"] [data-kennispotje="${kind}"]`).click();
    expect(await page.evaluate(() => TX.filter(t => t.name === 'Sportclub Oost').map(catOf))).toEqual([kind, kind]);
    await page.evaluate(({ MAIN }) => { const t = { id: 'n', date: '2026-10-10', amount: -35, acc: MAIN, name: 'Sportclub Oost', desc: 'SEPA INCASSO SPORTCLUB OOST', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); applyOwnAccounts(); }, { MAIN: S.MAIN });
    expect(await page.evaluate(() => catOf(TX.find(t => t.date === '2026-10-10' && t.name === 'Sportclub Oost')))).toBe(kind);
  });

  test('2d. na "Ja, laatste": komt er een vervanger? Ja verwacht een nieuwe vaste last in hetzelfde potje en vraagt dan of het die is', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => postNaStopJa('HEALTH CLUB', '2026-10-08'));
    expect(await vragen(page)).toContain('vervanger|HEALTH CLUB');
    await page.evaluate(() => kennisVervangerZet('HEALTH CLUB', true));
    expect(await page.evaluate(() => { const E = kennisGet('vervanger|HEALTH CLUB'); return [E.ja, E.potje, E.tot]; })).toEqual([true, 'sport', '2026-12']);
    await page.evaluate(({ MAIN }) => { for (const d of ['2026-10-10', '2026-11-10']) { const t = { id: 'bf' + d, date: d, amount: -29, acc: MAIN, name: 'Basic Fit', desc: 'SEPA INCASSO BASIC FIT', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); } applyOwnAccounts(); save(); }, { MAIN: S.MAIN });
    const Q = await page.evaluate(() => kennisVervangerVragen().map(q => [q.soort, q.nieuw]));
    expect(Q).toEqual([['vervangerwie', 'BASIC FIT']]);
    await page.evaluate(() => kennisVervangerWie('HEALTH CLUB', 'BASIC FIT', true));
    expect(await page.evaluate(() => kennisGet('vervanger|HEALTH CLUB').wie)).toBe('BASIC FIT');
  });

  test('2e. woning: de grootste vaste post in Huur is alleen een voorstel; jij wijst hem aan', async ({ page }) => {
    await boot(page);
    expect(await kopVan(page, 'woning|WOONSTICHTING RIJN')).toBe('Is Woonstichting Rijn je woonhuur of hypotheek?');
    expect((await lees(page)).find(r => r.startsWith('UITGAVEN ZONDER WONING'))).toContain('Woonstichting Rijn (woning: voorstel, de partij met het meeste vaste geld in Huur; nog niet door jou bevestigd)');
    await page.locator('[data-kenniswoning="ja"]').click();
    expect((await lees(page)).find(r => r.startsWith('UITGAVEN ZONDER WONING'))).toContain('Woonstichting Rijn (woning: door jou, 10 okt)');
    expect((await vragen(page)).some(q => q.startsWith('woning|'))).toBe(false);
  });

  test('2f. eerste uitgaande Tikkie per persoon: jouw deel met een categorie geldt ook voor de volgende Tikkie', async ({ page }) => {
    await boot(page);
    expect(await kopVan(page, 'tikkie|tikkie')).toBe('€60,00 aan Tikkie · 20 sep · was dit…');   // v427: geen Tikkie via Tikkie
    await page.locator('[data-qkey="tikkie|tikkie"] [data-kennisoptie="deel"]').click();
    await page.locator('[data-qkey="tikkie|tikkie"] [data-kenniscat="uiteten"]').click();
    expect(await page.evaluate(() => TX.filter(t => isTikkie(t)).map(catOf))).toEqual(['uiteten', 'uiteten']);
    expect((await vragen(page)).some(q => q.startsWith('tikkie|'))).toBe(false);
  });

  test('2g. contant opnemen: een tik binnen 3 dagen, telt in blok 20 en verandert geen boeking', async ({ page }) => {
    await boot(page);
    const O = await id(page, '2026-10-09', -150);
    expect(await vragen(page)).toContain('opname|' + O);
    expect((await vragen(page)).filter(q => q.startsWith('opname|')).length).toBe(1);   // de opnames van juni en augustus niet
    expect(await kopVan(page, 'opname|' + O)).toBe('Waar ging de €150 contant vooral naar?');
    expect(await page.locator(`[data-qkey="opname|${O}"] [data-kennisoptie]`).allInnerTexts()).toEqual(['Uitgaan of eten', 'Boodschappen', 'Kinderen', 'Vices', 'Anders', 'Weet ik niet']);
    const voor = await page.evaluate(() => [JSON.stringify(TX), JSON.stringify(OVR), totals('2026-10').spendNorm]);
    await page.locator(`[data-qkey="opname|${O}"] [data-kennisoptie="Boodschappen"]`).click();
    expect(await page.evaluate(() => [JSON.stringify(TX), JSON.stringify(OVR), totals('2026-10').spendNorm])).toEqual(voor);
    expect(sectie(await lees(page), 'CONTANT NAAR')).toContain('  okt | Boodschappen | 150.00');
  });

  test('3. rust: hooguit 3 in Zien op bedrag; Later schuift een week op; na 2x later pas weer als jij hem opent', async ({ page }) => {
    await boot(page);
    const open = await page.evaluate(() => gegevensOpen().slice(0, 3).map(q => [q.qkey, q.bedrag]));
    const alle = await page.evaluate(() => gegevensVragen().length);
    expect(alle).toBeGreaterThan(3);
    for (let i = 1; i < open.length; i++) expect(open[i - 1][1]).toBeGreaterThanOrEqual(open[i][1]);
    const W = await page.evaluate(() => { openGegevensVragen(); return [document.querySelectorAll('[data-vraagwrap]').length, document.querySelector('[data-gegevenswacht]').innerText]; });
    expect(W[0]).toBe(3);
    expect(W[1]).toBe(`nog ${alle - 3} vragen wachten ›`);
    expect(await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = gegevensRegel(); return d.innerText; })).toContain('3 vragen');
    const eerste = open[0][0];
    await page.locator(`[data-vraagwrap="${eerste}"] [data-later]`).click();
    expect(await page.evaluate(q => [SET.kennisLater[q].n, SET.kennisLater[q].tot, gegevensOpen().some(v => v.qkey === q)], eerste)).toEqual([1, '2026-10-17', false]);
    /* een week later is hij terug; na de tweede keer later niet meer, tot jij hem opent */
    await page.evaluate(q => { SET.kennisLater[q].tot = '2026-10-09'; }, eerste);
    expect(await page.evaluate(q => gegevensOpen().some(v => v.qkey === q), eerste)).toBe(true);
    await page.evaluate(q => kennisLater(q), eerste);
    await page.evaluate(q => { SET.kennisLater[q].tot = '2026-10-09'; }, eerste);
    expect(await page.evaluate(q => gegevensOpen().some(v => v.qkey === q), eerste)).toBe(false);
    /* zelf openen vanuit "Wat Minder van jou weet" kan wel */
    await page.evaluate(() => openKennis());
    expect(await page.locator(`[data-kenniswacht="${eerste}"]`).innerText()).toContain('2x later · komt pas terug als jij hem opent');
    await page.locator(`[data-kenniswacht="${eerste}"]`).click();
    expect(await page.locator(`[data-vraagwrap="${eerste}"]`).count()).toBe(1);
    /* blok 20: de wachtrij met hoe vaak later */
    const O = sectie(await lees(page), 'OPEN VRAGEN');
    expect(O[0]).toMatch(/^OPEN VRAGEN \(v425\): \d+ · hooguit 3 tegelijk in Zien/);
    expect(O.some(r => r.includes('| 2x | wacht tot jij hem opent'))).toBe(true);
    expect(O.filter(r => r.endsWith('| in Zien')).length).toBe(3);
  });

  test('4. "Wat Minder van jou weet": per soort, met bron en datum; ingang in Instellingen en via een bron-regel; Wijzigen stelt de vraag opnieuw', async ({ page }) => {
    await boot(page);
    const A = await id(page, '2026-10-02', -250);
    await page.evaluate(A => kennisUitZet(A, 'gift'), A);
    await page.evaluate(() => openKennis());
    expect(await page.locator('[data-kennisgroep]').evaluateAll(E => E.map(e => e.dataset.kennisgroep))).toEqual(['inkomen', 'woning', 'leningen', 'vast', 'tikkie', 'eenmalig', 'opname', 'oorzaak']);   // v429: Oorzaken (Grip)
    const r = (await page.locator('[data-kennisrij="k:uit|j bakker"]').innerText()).replace(/\s+/g, ' ');
    expect(r).toBe('J Bakker Gift door jou · 10 okt 2026 Wijzigen Vergeten');
    /* Vergeten zonder bedrag in je maanden zegt dat */
    expect(await page.evaluate(() => { openKennisVergeet('k:uit|j bakker'); return document.querySelector('[data-kennisgevolg]').innerText; })).toBe('Er verandert geen bedrag in je maanden.');
    /* Wijzigen: het antwoord gaat terug en de vraag staat open */
    await page.evaluate(() => kennisWijzig('k:uit|j bakker'));
    expect(await page.evaluate(() => [kennisGet('uit|j bakker'), document.querySelectorAll('[data-vraagwrap]').length, document.querySelector('[data-vraagwrap]').dataset.vraagwrap])).toEqual([null, 1, 'uit|j bakker']);
    /* ingang in Instellingen (Herkenning) */
    expect(await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = setTransacties(); return !!d.querySelector('[data-kennisinstelling]'); })).toBe(true);
    /* via een bron-regel (v424 in de Terugblik) */
    const G = await id(page, '2026-09-18', -484);
    await page.evaluate(G => { benoemKies(G, 'Boete of wegslepen'); benoemAard(G, 'eenmalig'); }, G);
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'tbx'; d.innerHTML = gripTerugblikHtml(); document.body.appendChild(d); });
    await page.locator(`#tbx [data-terugbenoem="${G}"] [data-benoembron]`).click();
    expect(await page.locator('#kennisSheet').isVisible()).toBe(true);
    expect(await page.evaluate(() => kennisLijst().find(x => x.id.startsWith('k:benoem|gemeente utrecht')).wat)).toBe('Boete of wegslepen · eenmalig');
  });
});
