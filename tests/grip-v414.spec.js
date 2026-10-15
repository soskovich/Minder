/* v414: BESLISSINGEN C OP v413.
   1 een signaal per post: zolang de vraag gestopt of uit reservering openstaat, staat de regel van v329 ("uitgesloten
     incasso's in een potje") niet voor die post in Let op; na het antwoord geldt weer de normale regel.
   2 naam en vraag vooraan, details erna; op de kaart blijft het vraagteken zichtbaar als de regel wordt afgekapt.
   4 verlopen posten met een laatste betaling ouder dan zes maanden staan samen in een regel met een lijst erachter. */
/* v428: Let op bestaat niet meer; de handelingen staan in Kiezen onder Te kiezen (#gripTeKiezen, met data-letop), dus Grip
   opent hier op Kiezen. Alleen de plek is veranderd. */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');
const { bootStand } = require('./standkaart-sluit.fixture');

const letOp = (page) => page.evaluate(() => gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), [])
  .map(x => ({ soort: x.soort, key: x.key, naam: x.naam })));
const post = (page, naam, bedrag, cat, data) => page.evaluate(({ MAIN, naam, bedrag, cat, data }) => {
  for (const d of data) { const t = { id: 'v414' + naam + d, date: d, amount: -bedrag, acc: MAIN, name: naam, desc: 'SEPA INCASSO ' + naam.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = cat; }
  save(); return recurringSchedule(true).find(s => s.name === naam).key; }, { MAIN: S.MAIN, naam, bedrag, cat, data });

test.describe('1 · een signaal per post', () => {
  test('met een open vraag geen v329-regel voor die post; na het antwoord wel', async ({ page }) => {
    await bootStand(page);
    await page.evaluate(() => { SET.uitResAntw = {}; save(); });
    const voor = await page.evaluate(() => ({ U: uitgeslotenPotjes().map(u => u.naam), open: uitResOpen().length }));
    expect(voor.open).toBe(3);
    expect(voor.U).toEqual([]);
    let L = await letOp(page);
    expect(L.filter(x => x.soort === 'uit')).toEqual([]);
    expect(L.filter(x => x.soort === 'uitresvraag').length).toBe(3);
    /* antwoord voor Huurwoningen: die komt terug in de v329-regel, de andere niet */
    await page.evaluate(() => { const k = recurKey(TX.find(t => t.name === 'Huurwoningen')); SET.uitResAntw[k] = { keuze: 'reservering', op: '2026-10-03' }; save(); });
    const na = await page.evaluate(() => uitgeslotenPotjes().map(u => u.naam));
    expect(na).toEqual(['Huurwoningen']);
    L = await letOp(page);
    expect(L.filter(x => x.soort === 'uit').length).toBe(1);
    expect(L.filter(x => x.soort === 'uitresvraag').map(x => x.naam.split(':')[0]).sort()).toEqual(['Dela Natura- en levensv', 'Stparkeergelden via Rive']);
  });
});

test.describe('2 · naam en vraag vooraan, en het vraagteken blijft staan', () => {
  test('de drie vormen', async ({ page }) => {
    await S.boot(page);
    await post(page, 'Oude Sportschool', 40, 'sport', ['2026-05-13', '2026-06-13', '2026-07-13']);
    const prem = await page.evaluate(() => recurringSchedule().find(s => /PREMIUM/i.test(s.name)).key);
    await page.evaluate((key) => { postZet(key, 'gestopt');
      const t = { id: 'v414weer', date: '2026-10-08', amount: -31, acc: Object.keys(ACCMETA)[0], name: 'Huurwoningen Premium', desc: 'SEPA INCASSO HUURWONINGEN PREMIUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'abonnement'; save();
      const k = recurringSchedule(true).find(s => s.name === 'Oude Sportschool').key; SET.fixDueExcl = { [k]: { sinds: '2026-08-01' } }; save(); }, prem);
    const L = await letOp(page);
    expect(L.filter(x => x.soort === 'verlopen').map(x => x.naam)).toEqual([]);   // met een open vraag over dezelfde post: niet dubbel
    expect(L.filter(x => x.soort === 'weerbetaald').map(x => x.naam)).toEqual([]);   // v422: de vraag staat in Kloppen mijn gegevens?
    expect(await page.evaluate(() => gegevensVragen().filter(q => q.soort === 'poststop').map(q => q.naam))).toEqual(['Huurwoningen Premium']);
    expect(L.filter(x => x.soort === 'uitresvraag').map(x => x.naam)).toEqual(['Oude Sportschool: gestopt of uit reservering? · €40 per maand']);
    await page.evaluate(() => { SET.fixDueExcl = {}; save(); });
    expect((await letOp(page)).filter(x => x.soort === 'verlopen').map(x => x.naam)).toEqual(['Oude Sportschool gestopt? · €40 per maand · niet betaald sinds 13 jul']);
  });
  for (const lang of [false, true]) {
    test(`op 390px blijft het vraagteken zichtbaar${lang ? ' bij een heel lange naam' : ''}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await S.boot(page);
      const naam = lang ? 'Stichting Voor Het Beheer Van Derdengelden Van Een Heel Lange Partij' : 'Oude Sportschool Amsterdam Noord';
      await post(page, naam, 900, 'sport', ['2026-05-13', '2026-06-13', '2026-07-13']);
      /* v428: de korte vorm van de Let op-kaart (naam en vraag op een regel met ellipsis) is met de kaart vervallen. Op Zien
         staat het feit onder Signalen, in Kiezen de keuze; beide breken af en kappen niets af, dus de vraag staat er altijd. */
      const r = await page.evaluate(() => { go('maand');
        const sig = [...document.querySelectorAll('#gripSignalen [data-signaal^="lo:verlopen:"]')].map(e => ({ t: e.innerText, af: e.scrollWidth > e.clientWidth + 1 }));
        gripKiesTab('kiezen'); const row = document.querySelector('#gripTeKiezen [data-letop="verlopen"]'); if (!row) return null;
        const n = row.querySelector('span > span');
        return { sig, tekst: row.innerText, af: row.scrollWidth > row.clientWidth + 1, naamAf: n.scrollWidth > n.clientWidth + 1, sw: document.documentElement.scrollWidth }; });
      expect(r).not.toBeNull();
      expect(r.sig.length).toBe(1);
      expect(r.sig[0].t).toContain('gestopt?'); expect(r.sig[0].af).toBe(false);
      expect(r.tekst).toContain('gestopt?');
      expect(r.af).toBe(false); expect(r.naamAf).toBe(false);
      expect(r.sw).toBeLessThanOrEqual(390);
    });
  }
});

test.describe('4 · oude verlopen posten in een regel', () => {
  test('twee oude posten: een regel, een lijst met naam, bedrag en laatste betaling, per post een keuze en alle gestopt', async ({ page }) => {
    await S.boot(page);
    const a = await post(page, 'Oude Krant', 25, 'abonnement', ['2026-01-05', '2026-02-05', '2026-03-05']);
    const b = await post(page, 'Oude Opslag', 90, 'overig', ['2025-09-23', '2025-12-23', '2026-03-23']);
    const c = await post(page, 'Recente Sportschool', 40, 'sport', ['2026-05-13', '2026-06-13', '2026-07-13']);
    const L = await letOp(page);
    expect(L.filter(x => x.soort === 'oudeposten').map(x => x.naam)).toEqual(['2 oude posten al lang niet betaald']);
    expect(L.filter(x => x.soort === 'verlopen').map(x => x.key)).toEqual([c]);   // de recente staat los
    /* niet stil: zonder keuze zijn ze verlopen, niet meegeteld, ook in blok 19 */
    const voor = await page.evaluate(({ a, b }) => ({ st: [postStatus(a).status, postStatus(b).status], telt: [postTelt(a), postTelt(b)], set: JSON.stringify(SET.postStatus || {}),
      diag: diagEenSignaal(maandVooruit()).filter(l => /Oude Krant|Oude Opslag/.test(l)).map(l => l.split(' | ')[4]).sort() }), { a, b });
    expect(voor.st).toEqual(['verlopen', 'verlopen']);
    expect(voor.telt).toEqual([false, false]);
    expect(voor.diag).toEqual(['verlopen, niet meegeteld (verwacht 2026-04-05, tolerantie 7 dagen)', 'verlopen, niet meegeteld (verwacht 2026-06-23, tolerantie 14 dagen)']);
    await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); renderMaand(); openOudePosten(); });
    const lijst = await page.evaluate(() => [...document.querySelectorAll('#oudePosten [data-oudepost]')].map(e => e.innerText.replace(/\s+/g, ' ')));
    expect(lijst).toEqual(['Oude Opslag €90 per kwartaal · laatste betaling 23 mrt 2026 gestopt nog actief', 'Oude Krant €25 per maand · laatste betaling 5 mrt 2026 gestopt nog actief']);
    expect(await page.evaluate(() => JSON.stringify(SET.postStatus || {}))).toBe(voor.set);   // openen schrijft niets
    /* per post: nog actief voor de krant; v415: de sheet sluit na een keuze, de lijst heeft daarna nog een post */
    await page.locator(`[data-oudepost="${a}"] [data-oudzet="actief"]`).click();
    expect(await page.evaluate((a) => postStatus(a).status, a)).toBe('actief');
    expect(await page.evaluate(() => document.getElementById('sheetBg').classList.contains('show'))).toBe(false);
    await page.evaluate(() => openOudePosten());
    expect(await page.locator('#oudePosten [data-oudepost]').count()).toBe(1);
    await page.locator('[data-oudallegestopt]').click();
    expect(await page.evaluate(({ a, b }) => [postStatus(a).status, postStatus(b).status], { a, b })).toEqual(['actief', 'gestopt']);
    expect((await letOp(page)).filter(x => x.soort === 'oudeposten')).toEqual([]);
  });
  test('alle gestopt zet ze allemaal, met hun laatste betaling', async ({ page }) => {
    await S.boot(page);
    const a = await post(page, 'Oude Krant', 25, 'abonnement', ['2026-01-05', '2026-02-05', '2026-03-05']);
    const b = await post(page, 'Oude Opslag', 90, 'overig', ['2025-09-23', '2025-12-23', '2026-03-23']);
    await page.evaluate(() => openOudePosten());
    await page.locator('[data-oudallegestopt]').click();
    const r = await page.evaluate(({ a, b }) => [SET.postStatus[a], SET.postStatus[b]].map(x => [x.status, x.laatste]), { a, b });
    expect(r).toEqual([['gestopt', '2026-03-05'], ['gestopt', '2026-03-23']]);
  });
  test('de grens is zes maanden: vijf maanden staat los, zeven in de bundel', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const v = new Date(2026, 9, 10), st = d => postStatusVan({ key: 'x', name: 'X', amount: 10, intervalM: 1, lastDate: d }, v);
      return [st('2026-05-11'), st('2026-04-10'), st('2026-04-09'), st('2026-03-10')].map(p => [p.status, p.oud6]); });
    expect(r).toEqual([['verlopen', false], ['verlopen', false], ['verlopen', true], ['verlopen', true]]);
  });
});

test.describe('meting op de nagebouwde standen', () => {
  for (const [naam, mod] of [['grip-v409-stand', './grip-v409-stand'], ['ruim-bijstel-stand', './ruim-bijstel-stand'], ['vast-variabel-stand', './vast-variabel-stand'], ['deze-maand-stand', './deze-maand-stand'], ['plan-toestel-stand', './plan-toestel-stand'], ['standkaart-sluit (toestel 3 okt)', 'stand']]) {
    test(`hoeveel oude posten: ${naam}`, async ({ page }) => {
      if (mod === 'stand') await bootStand(page); else { const M = require(mod); await M.boot(page); }
      const r = await page.evaluate(() => ({ oud: postOudLijst().map(p => `${p.naam} ${p.laatste}`), verlopen: Object.values(postStatusMap()).filter(p => p.status === 'verlopen').length }));
      console.log(`v414 ${naam}: ${r.oud.length} oude posten (${r.oud.join(', ') || '-'}), ${r.verlopen} verlopen in totaal`);
      expect(r.oud.length).toBeGreaterThanOrEqual(0);
    });
  }
});
