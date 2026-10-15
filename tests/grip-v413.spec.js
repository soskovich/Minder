/* v413: BESLISSINGEN C OP v412. Op grip-v409-stand (10 oktober 2026).
   2 "Opgezegd" heet "uit reservering" (telt niet in nog te betalen), en een post met die vlag krijgt een keer de vraag
     "<post>: gestopt, of betaal je hem uit een reservering?". Tot het antwoord blijft de werking zoals hij was.
   3 een verlopen of weer-betaald-regel in Let op draagt het laatste bedrag en de cadans, en sorteert op dat bedrag.
   4 een verlopen post verdwijnt niet vanzelf uit het schema, ook niet na 55 dagen: hij blijft "verlopen, niet
     meegeteld" in blok 19 en Let op tot jij kiest.
   5 de regels in Let op hebben geen lege plek: een naam en een dag. */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');

const letOp = (page) => page.evaluate(() => gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), [])
  .map(x => ({ soort: x.soort, key: x.key, naam: x.naam, sub: x.sub, groep: x.groep, bedrag: x.bedrag })));
/* een vaste post met drie betalingen; `d` is de laatste, de rest staat er telkens `stap` maanden voor */
const post = (page, naam, bedrag, cat, data) => page.evaluate(({ MAIN, naam, bedrag, cat, data }) => {
  for (const d of data) { const t = { id: 'v413' + naam + d, date: d, amount: -bedrag, acc: MAIN, name: naam, desc: 'SEPA INCASSO ' + naam.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = cat; }
  save(); return recurringSchedule(true).find(s => s.name === naam).key; }, { MAIN: S.MAIN, naam, bedrag, cat, data });
const LEEG = /(^|\s)·\s*·|\s{2,}|^\s|\s$|^·|sinds\s*·|op\s*·|:\s*$|^:|€0 /;

test.describe('4 · een verlopen post blijft staan', () => {
  test('een maandpost die 89 dagen stil is: in het schema met metOud, verlopen, niet meegeteld, in blok 19, Let op en Vaste lasten', async ({ page }) => {
    await S.boot(page);
    const key = await post(page, 'Oude Sportschool', 40, 'sport', ['2026-05-13', '2026-06-13', '2026-07-13']);
    const r = await page.evaluate((key) => ({
      dagen: Math.round((new Date(2026, 9, 10) - new Date(2026, 6, 13)) / 864e5),
      metOud: recurringSchedule(true).filter(s => s.key === key).map(s => ({ oud: s.oud })),
      gewoon: recurringSchedule().some(s => s.key === key),
      st: postStatus(key).status, telt: postTelt(key), fix: recurringKeys().has(key),
      due: (monthLiquidity().fixDueItems || []).some(s => s.key === key),
      diag: diagEenSignaal(maandVooruit()).filter(l => /Oude Sportschool/.test(l)),
    }), key);
    expect(r.dagen).toBeGreaterThan(55);   // voorbij de oude grens van 30 x 1,6 + 7
    expect(r.metOud).toEqual([{ oud: true }]);
    expect(r.gewoon).toBe(false);
    expect([r.st, r.telt, r.fix, r.due]).toEqual(['verlopen', false, false, false]);
    expect(r.diag).toEqual(['  Oude Sportschool | Sport & gezondheid | per maand | 40 | verlopen, niet meegeteld (verwacht 2026-08-13, tolerantie 7 dagen) | 2026-07-13 | -']);
    expect((await letOp(page)).filter(x => x.key === key).map(x => [x.soort, x.naam])).toEqual([['verlopen', 'Oude Sportschool gestopt? · €40 per maand · niet betaald sinds 13 jul']]);
    const vl = await page.evaluate(() => { openVasteLasten(); const o = document.querySelector('[data-vastoud]'); return { kop: o && o.innerText, tekst: document.querySelector('#sheet').innerText }; });
    expect(vl.kop).toMatch(/langer niet betaald/i);
    expect(vl.tekst).toContain('Oude Sportschool');
  });
  test('een kwartaalpost die 200 dagen stil is blijft ook, en "nog actief" laat hem weer meetellen tot een nieuwe betaling uitblijft', async ({ page }) => {
    await S.boot(page);
    const key = await post(page, 'Oude Opslag', 90, 'overig', ['2025-09-23', '2025-12-23', '2026-03-23']);
    expect(await page.evaluate((key) => [recurringSchedule(true).some(s => s.key === key), recurringSchedule().some(s => s.key === key), postStatus(key).status], key)).toEqual([true, false, 'verlopen']);
    await page.evaluate((key) => postZet(key, 'actief'), key);
    expect(await page.evaluate((key) => [recurringSchedule().some(s => s.key === key), postStatus(key).status, postTelt(key)], key)).toEqual([true, 'actief', true]);
    expect((await letOp(page)).filter(x => x.key === key)).toEqual([]);
    /* gestopt: weg uit de gewone lijst, en hij blijft in de lijst met metOud staan met zijn status */
    await page.evaluate((key) => postZet(key, 'gestopt'), key);
    expect(await page.evaluate((key) => [recurringSchedule().some(s => s.key === key), recurringSchedule(true).some(s => s.key === key), postStatus(key).status], key)).toEqual([false, true, 'gestopt']);
  });
});

test.describe('3 · bedrag en cadans in Let op, en sorteren op dat bedrag', () => {
  test('twee verlopen posten: elk met bedrag en cadans, de grootste eerst binnen groep a', async ({ page }) => {
    await S.boot(page);
    const klein = await post(page, 'Klein Abonnement', 9, 'abonnement', ['2026-05-02', '2026-06-02', '2026-07-02']);
    const groot = await post(page, 'Groot Abonnement', 120, 'abonnement', ['2026-05-04', '2026-06-04', '2026-07-04']);
    const L = await letOp(page);
    const v = L.filter(x => x.soort === 'verlopen');
    expect(v.map(x => [x.naam, x.bedrag])).toEqual([['Groot Abonnement gestopt? · €120 per maand · niet betaald sinds 4 jul', 120], ['Klein Abonnement gestopt? · €9 per maand · niet betaald sinds 2 jul', 9]]);
    /* de volgorde in de hele lijst: groep a op bedrag, dus een regel van EUR 120 staat voor elke groep-a-regel met minder */
    const a = L.filter(x => x.groep === 'a');
    for (let i = 1; i < a.length; i++) expect(a[i - 1].bedrag || 0).toBeGreaterThanOrEqual(a[i].bedrag || 0);
    expect(L.findIndex(x => x.key === groot)).toBeLessThan(L.findIndex(x => x.key === klein));
  });
});

test.describe('2 · opgezegd heet uit reservering, en de vraag per post', () => {
  test('de labels: chip, kop en nog te betalen zeggen uit reservering en niet opgezegd', async ({ page }) => {
    await S.boot(page);
    const key = await page.evaluate(() => recurringSchedule().find(s => /PREMIUM/i.test(s.name)).key);
    await page.evaluate((key) => { openVasteLasten(); }, key);
    expect(await page.locator('[data-uitreschip]').first().innerText()).toBe('Uit reservering');
    await page.evaluate((key) => toggleFixDueExcl(key, 'vaste'), key);
    const t = await page.evaluate((key) => { const a = document.querySelector('#sheet').innerText; openFixedDue(); return { vaste: a, due: document.querySelector('#sheet').innerText, label: opgezegdLabel(key) }; }, key);
    expect(t.label).toBe('Uit reservering sinds 10 okt');
    for (const x of [t.vaste, t.due]) { expect(x).not.toMatch(/opgezegd/i); expect(x).toMatch(/uit reservering/i); }
  });
  test('een post met de vlag: een vraag in Let op, renderen schrijft niets, en tot het antwoord telt hij niet in nog te betalen', async ({ page }) => {
    await S.boot(page);
    const key = await page.evaluate(() => { const k = recurringSchedule().find(s => /PREMIUM/i.test(s.name)).key; SET.fixDueExcl = { [k]: { sinds: '2026-09-01' } }; save(); return k; });
    const voor = await page.evaluate(() => JSON.stringify([SET.fixDueExcl, SET.uitResAntw || null, SET.postStatus || null]));
    const L = (await letOp(page)).filter(x => x.soort === 'uitresvraag');
    expect(L.map(x => [x.key, x.naam])).toEqual([[key, 'Huurwoningen Premium: gestopt of uit reservering? · €31 per kwartaal']]);
    await page.evaluate(() => { go('maand'); renderMaand(); });
    await page.evaluate((key) => openUitResVraag(key), key);
    const knoppen = await page.evaluate(() => [...document.querySelectorAll('[data-uitresantw]')].map(b => ({ k: b.dataset.uitresantw, cls: b.className })));
    expect(knoppen).toEqual([{ k: 'gestopt', cls: 'btn sec' }, { k: 'reservering', cls: 'btn sec' }]);   // niets voorgekozen
    expect(await page.evaluate(() => JSON.stringify([SET.fixDueExcl, SET.uitResAntw || null, SET.postStatus || null]))).toBe(voor);
    expect(await page.evaluate((key) => [verwachtInMaand(key, '2026-10'), postStatus(key).status], key)).toEqual([false, 'actief']);
  });
  test('uit reservering: de vlag blijft, de vraag is weg, en een betaling geeft geen melding "toch afgeschreven"', async ({ page }) => {
    await S.boot(page);
    const key = await page.evaluate(() => { const k = recurringSchedule().find(s => /PREMIUM/i.test(s.name)).key; SET.fixDueExcl = { [k]: { sinds: '2026-07-01' } }; save(); return k; });
    const opgVoor = await page.evaluate(() => notifList().filter(n => n.key.indexOf('opgezegd-') === 0).length);
    expect(opgVoor).toBe(1);   // de betaling van augustus ligt na 1 jul: tot het antwoord blijft de melding staan
    await page.evaluate((key) => { openUitResVraag(key); }, key);
    await page.locator('[data-uitresantw="reservering"]').click();
    const r = await page.evaluate((key) => ({ vlag: !!SET.fixDueExcl[key], antw: SET.uitResAntw[key].keuze, st: postStatus(key).status, telt: verwachtInMaand(key, '2026-10'),
      melding: notifList().filter(n => n.key.indexOf('opgezegd-') === 0).length }), key);
    expect(r).toEqual({ vlag: true, antw: 'reservering', st: 'actief', telt: false, melding: 0 });
    expect((await letOp(page)).filter(x => x.soort === 'uitresvraag')).toEqual([]);
  });
  test('gestopt: de status wordt gestopt, de vlag gaat weg met de oude waarde in het antwoord, en de vraag is weg', async ({ page }) => {
    await S.boot(page);
    const key = await page.evaluate(() => { const k = recurringSchedule().find(s => /PREMIUM/i.test(s.name)).key; SET.fixDueExcl = { [k]: { sinds: '2026-09-01' } }; save(); return k; });
    await page.evaluate((key) => { openUitResVraag(key); }, key);
    await page.locator('[data-uitresantw="gestopt"]').click();
    const r = await page.evaluate((key) => ({ vlag: !!(SET.fixDueExcl || {})[key], antw: SET.uitResAntw[key], st: postStatus(key).status, telt: postTelt(key) }), key);
    expect(r.vlag).toBe(false);
    expect(r.antw).toMatchObject({ keuze: 'gestopt', voor: { sinds: '2026-09-01' } });
    expect([r.st, r.telt]).toEqual(['gestopt', false]);
    expect((await letOp(page)).filter(x => x.soort === 'uitresvraag')).toEqual([]);
  });
});

test.describe('5 · geen lege plek in de regels', () => {
  test('verlopen, weer betaald en de vraag: een naam en een dag, en geen dubbele scheiding', async ({ page }) => {
    await S.boot(page);
    await post(page, 'Oude Sportschool', 40, 'sport', ['2026-05-13', '2026-06-13', '2026-07-13']);
    const prem = await page.evaluate(() => recurringSchedule().find(s => /PREMIUM/i.test(s.name)).key);
    await page.evaluate((key) => { postZet(key, 'gestopt');
      const t = { id: 'v413weer', date: '2026-10-08', amount: -31, acc: Object.keys(ACCMETA)[0], name: 'Huurwoningen Premium', desc: 'SEPA INCASSO HUURWONINGEN PREMIUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'abonnement'; save(); }, prem);
    /* v414: de vraag gaat over een andere post dan de verlopen, want met een open vraag staat een post alleen als die vraag */
    const ander = await post(page, 'Ander Abonnement', 15, 'abonnement', ['2026-08-02', '2026-09-02', '2026-10-02']);
    await page.evaluate((k) => { SET.fixDueExcl = { [k]: { sinds: '2026-08-01' } }; save(); }, ander);
    const L = (await letOp(page)).filter(x => ['verlopen', 'weerbetaald', 'uitresvraag'].includes(x.soort));
    expect(L.map(x => x.soort).sort()).toEqual(['uitresvraag', 'verlopen']);   // v422: weer betaald staat in Kloppen mijn gegevens?
    expect(await page.evaluate(() => gegevensVragen().filter(q => q.soort === 'poststop').map(q => q.naam + ' ' + q.dag))).toEqual(['Huurwoningen Premium 2026-10-08']);
    for (const x of L) {
      expect(x.naam).not.toMatch(LEEG);
      expect(x.naam).toMatch(/^[A-Z][A-Za-z]+ [A-Za-z]+/);   // de naam van de post staat vooraan
      if (x.soort !== 'uitresvraag') expect(x.naam).toMatch(/(sinds|op) \d{1,2} [a-z]{3}$/);   // v414: de dag staat achteraan
    }
    /* een post zonder naam valt terug op zijn sleutel, en een onbekende dag heet "onbekend" */
    const t = await page.evaluate(() => { const P = postStatusVan({ key: 'ZONDER NAAM', name: '', amount: 12, intervalM: 1, lastDate: '' }, new Date(2026, 9, 10)); return P.naam; });
    expect(t).toBe('ZONDER NAAM');
  });
});
