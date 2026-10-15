/* v423: EEN LENING SLUIT (bedrag = terugbetaald + nog open + niet meer terug verwacht), BLOK 20 ALS BESTAND MET "DEEL 1 VAN 1 ·
   N REGELS", EN BUITEN VAST EN POTJES PER SOORT (besluiten van de gebruiker op v422). Op v421-stand (10 oktober 2026,
   GECONSTRUEERD: de boekingen van het toestel staan alleen daar) met twee leningen zoals de gebruiker ze meldde:
   A. Buiten 45 | terug 0 | open 0, en Ma 405,99 | terug 400 | open 0. Beide van voor v423, dus zonder log. */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
const lees = page => page.evaluate(() => diagSalarisVerdeling());
const sectie = (L, kop) => { const i = L.findIndex(r => r.startsWith(kop)); const j = L.findIndex((r, n) => n > i && r === ''); return L.slice(i, j < 0 ? undefined : j); };
async function boot(page, o) {
  await S.boot(page, o);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds) => { const t = { id: 'v423' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    const b = add('2026-09-12', -45, 'A. Buiten', 'A. BUITEN BETAALVERZOEK');
    const m = add('2026-08-15', -405.99, 'Western Union', 'WESTERN UNION MA');
    /* september: van elke soort buiten vast en potjes een boeking (punt 3) */
    add('2026-09-14', -80, 'Geldmaat Koestraat 13', 'GEA, BETAALPAS GELDMAAT KOESTRAAT 13');
    const p = add('2026-09-16', -30, 'J. Jansen', 'J. JANSEN BEDANKT'); OVR[p.id] = 'persoonlijk';
    const g = add('2026-09-18', -25, 'Garage De Hoek', 'GARAGE DE HOEK SPOED'); OVR[g.id] = 'onvoorzien';
    const r = add('2026-09-22', -463, 'CJIB Verkeersboetes', 'CJIB VERKEERSBOETES'); OVR[r.id] = 'belasting'; SET.uitReservering = { [r.id]: 300 };
    TX.sort((a, c) => a.date.localeCompare(c.date));
    /* zoals van voor v423: geen log, en de knop die het restant veranderde is niet vastgelegd */
    SET.loans = [
      { id: 'lbuiten', txId: b.id, naam: 'A. Buiten', richting: 'uit', soort: 'lening', bedrag: 45, open: 0, datum: '2026-09-12', terug: '' },
      { id: 'lma', txId: m.id, naam: 'Ma', richting: 'uit', soort: 'lening', bedrag: 405.99, open: 0, datum: '2026-08-15', terug: '' }];
    OVR[b.id] = 'uitgeleend'; OVR[m.id] = 'uitgeleend';
    SET.contantIn = [{ id: 'ci1', datum: '2026-08-30', op: 1, bedrag: 400, aflossing: 400, loanId: 'lma', naam: 'Ma' }];
    applyOwnAccounts(); buildAccMeta(); save(); render();
  }, { MAIN: S.MAIN });
}
const stand = (page, id) => page.evaluate(id => { const S = loanStand(loans().find(l => l.id === id)); return { bedrag: S.bedrag, terug: S.terug, open: S.open, niet: S.nietTerug, verschil: S.verschil, sluit: S.sluit }; }, id);

test.describe('v423', () => {
  test('1. de gemelde leningen sluiten niet, en het verschil staat er met de vraag die Zien stelt', async ({ page }) => {
    await boot(page);
    expect(await stand(page, 'lbuiten')).toEqual({ bedrag: 45, terug: 0, open: 0, niet: 0, verschil: 45, sluit: false });
    expect(await stand(page, 'lma')).toEqual({ bedrag: 405.99, terug: 400, open: 0, niet: 0, verschil: 5.99, sluit: false });
    const U = sectie(await lees(page), 'UITGELEEND');
    expect(U[0]).toBe('UITGELEEND (v420/v423): per lening datum | bedrag | terugbetaald | nog open | niet meer terug verwacht · sluit');
    expect(U).toContain('  15-08 Ma | 405.99 | 400.00 (contant 30-08 400.00) | 0.00 | 0.00 · VERSCHIL 5.99 zonder verklaring: vraag in Zien "Is 5.99 van Ma nog open of niet meer terug?"');
    expect(U).toContain('  12-09 A. Buiten | 45.00 | 0.00 | 0.00 | 0.00 · VERSCHIL 45.00 zonder verklaring: vraag in Zien "Is 45.00 van A. Buiten nog open of niet meer terug?"');
    /* hoe het restant ontstond: van een lening van voor v423 staat er wat vastligt, en dat de knop niet is vastgelegd */
    const i = U.findIndex(r => r.startsWith('  15-08 Ma'));
    expect(U[i + 1]).toBe('      15 aug 2026: gemarkeerd als uitgeleend (€405,99)');
    expect(U[i + 2]).toBe('      30 aug 2026: Contant terugontvangen (€400,00)');
    expect(U[i + 3]).toContain('nog open nu €0,00 · van voor v423 is niet vastgelegd welke knop het restant van €5,99 veranderde');
    expect(U.find(r => r.startsWith('  TOTAAL'))).toBe('  TOTAAL NOG OPEN: 0.00 · TOTAAL NIET MEER TERUG: 0.00 · leningen met een verschil zonder verklaring: 2');
    /* Zien: de vraag met de woorden van de gebruiker */
    const Q = await page.evaluate(() => { openGegevensVragen(); return [...document.querySelectorAll('[data-gegevensvraag="restant"]')].map(e => e.querySelector('div').innerText); });
    expect(Q).toEqual(['Is €45,00 van A. Buiten nog open of niet meer terug?', 'Is €5,99 van Ma nog open of niet meer terug?']);
    expect(await page.locator('[data-gegevensregel]').count()).toBeGreaterThan(0);
  });

  test('1. niet meer terug is een uitgave in de maand van de lening, en blok 20 blijft sluiten', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => { const R = {}; for (const m of ['2026-08', '2026-09']) R[m] = { spend: totals(m).spend, n: TX.length }; return R; });
    const C0 = sectie(await lees(page), 'CONTROLE'), B0 = (await lees(page)).find(r => r.startsWith('  buiten vast en potjes:'));
    await page.evaluate(() => { openGegevensVragen(); document.querySelector('[data-lening="lma"] [data-restniet]').click(); });
    expect(await stand(page, 'lma')).toEqual({ bedrag: 405.99, terug: 400, open: 0, niet: 5.99, verschil: 0, sluit: true });
    const V = await page.evaluate(() => TX.filter(t => String(t.bankRef || '').startsWith('nietterug|lma')).map(t => ({ d: t.date, a: t.amount, c: catOf(t), acc: t.acc })));
    expect(V).toEqual([{ d: '2026-08-15', a: -5.99, c: 'persoonlijk', acc: '' }, { d: '2026-08-15', a: 5.99, c: 'uitgeleend', acc: '' }]);
    const na = await page.evaluate(() => ({ aug: totals('2026-08').spend, sep: totals('2026-09').spend }));
    expect(Math.round((na.aug - voor['2026-08'].spend) * 100) / 100).toBe(5.99);   // uitgave in augustus, de maand van de lening
    expect(na.sep).toBe(voor['2026-09'].spend);
    const L = await lees(page), U = sectie(L, 'UITGELEEND');
    expect(U).toContain('  15-08 Ma | 405.99 | 400.00 (contant 30-08 400.00) | 0.00 | 5.99 (uitgave in aug) · sluit');
    /* de herkomst van voor v423 blijft staan: de log begint met wat er vastlag, en daarna de knop in Zien */
    const i = U.findIndex(r => r.startsWith('  15-08 Ma'));
    expect(U.slice(i + 1, i + 5)).toEqual([
      '      15 aug 2026: Gemarkeerd als uitgeleend (van voor v423) (+€405,99) · nog open €405,99',
      '      30 aug 2026: Contant terugontvangen (-€400,00) · nog open €5,99',
      '      dag onbekend: Restant veranderd zonder vastgelegde knop (van voor v423) (-€5,99) · nog open €0,00',
      '      10 okt 2026: Zien: verschil komt niet meer terug (+€5,99) · nog open €0,00']);
    /* blok 20: augustus 5,99 meer buiten vast en potjes, uitgeleend netto 5,99 hoger, en de controle sluit nog */
    const B1 = L.find(r => r.startsWith('  buiten vast en potjes:'));
    expect(B1).not.toBe(B0);
    const C1 = sectie(L, 'CONTROLE');
    for (const m of ['apr', 'mei', 'jul', 'aug', 'sep']) expect(C1.find(x => x.startsWith(`  ${m}:`))).toMatch(/: klopt$/);
    expect(C0.find(x => x.startsWith('  aug:'))).toMatch(/: klopt$/);
    /* de boekingen van de app zelf zijn geen terugbetaling en geen vraag */
    /* (met een tweede lening die 8 open heeft: zonder de uitsluiting legt loanMatch de +5,99 erbij, binnen EUR 5) */
    expect(await page.evaluate(() => { SET.loans.push({ id: 'lx', txId: '', naam: 'Kees', richting: 'uit', soort: 'lening', bedrag: 8, open: 8, datum: '2026-08-01', terug: '' });
      const n = loanVragen().filter(v => v.t.src === 'lening').length; SET.loans = SET.loans.filter(l => l.id !== 'lx'); return n; })).toBe(0);
    /* weghalen van de lening haalt het paar mee */
    await page.evaluate(() => loanDelete('lma'));
    expect(await page.evaluate(() => TX.filter(t => String(t.bankRef || '').startsWith('nietterug|')).length)).toBe(0);
  });

  test('1. nog open en al terugbetaald sluiten ook; de log zegt welke knop en welke dag', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { openGegevensVragen(); document.querySelector('[data-lening="lbuiten"] [data-restopen]').click(); });
    expect(await stand(page, 'lbuiten')).toEqual({ bedrag: 45, terug: 0, open: 45, niet: 0, verschil: 0, sluit: true });
    await page.evaluate(() => loanRestZet('lma', 'terug'));
    expect(await stand(page, 'lma')).toEqual({ bedrag: 405.99, terug: 405.99, open: 0, niet: 0, verschil: 0, sluit: true });
    expect(await page.evaluate(() => gegevensVragen().filter(q => q.soort === 'restant').length)).toBe(0);
    /* de knop "Rest komt niet meer terug" in de sheet */
    await page.evaluate(() => openLoan('lbuiten'));
    expect(await page.locator('[data-leningsom]').innerText()).toBe('€45,00 = €0,00 terugbetaald + €45,00 nog open + €0,00 niet meer terug');
    await page.evaluate(() => document.querySelector('[data-nietterug]').click());
    expect(await stand(page, 'lbuiten')).toEqual({ bedrag: 45, terug: 0, open: 0, niet: 45, verschil: 0, sluit: true });
    const log = await page.evaluate(() => loans().find(l => l.id === 'lbuiten').log.map(x => [x.dag, x.knop, x.bedrag, x.open]));
    expect(log).toEqual([['2026-09-12', 'Gemarkeerd als uitgeleend (van voor v423)', 45, 45], ['', 'Restant veranderd zonder vastgelegde knop (van voor v423)', -45, 0],
      ['2026-10-10', 'Zien: verschil is nog open', 45, 45], ['2026-10-10', 'Rest komt niet meer terug', -45, 0]]);
    expect(await page.evaluate(() => totals('2026-09').spend - 0)).toBeGreaterThan(0);
  });

  test('1. een nieuwe lening: elke knop staat in de log, het veld rekent in centen, en verlagen zonder knop is een vraag', async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => { const t = TX.find(t => t.amount === -45 && t.name === 'A. Buiten'); SET.loans = []; delete OVR[t.id]; markLoan(t.id, 'uit', 'lening'); return SET.loans[0].id; });
    await page.evaluate(id => loanContantOntvangen(id, 20, null, null), id);
    expect(await stand(page, id)).toEqual({ bedrag: 45, terug: 20, open: 25, niet: 0, verschil: 0, sluit: true });
    await page.evaluate(id => setLoanField(id, 'open', '10,50'), id);
    expect(await stand(page, id)).toEqual({ bedrag: 45, terug: 20, open: 10.5, niet: 0, verschil: 14.5, sluit: false });
    const log = await page.evaluate(id => loans().find(l => l.id === id).log.map(x => x.knop), id);
    expect(log).toEqual(['Geld uitgeleend gemarkeerd', 'Contant terugontvangen', 'Nog open aangepast van €25,00 naar €10,50']);
    expect(await page.evaluate(() => gegevensVragen().filter(q => q.soort === 'restant').map(q => q.bedrag))).toEqual([14.5]);
    /* Helemaal terugbetaald zonder boeking telt als terugbetaald, en het sluit */
    await page.evaluate(id => loanRepay(id, 10.5), id);
    await page.evaluate(id => loanRestZet(id, 'niet'), id);
    expect(await stand(page, id)).toEqual({ bedrag: 45, terug: 30.5, open: 0, niet: 14.5, verschil: 0, sluit: true });
  });

  test('1. contant terug rekent in centen: 400 van 405,99 laat 5,99 open en niet 6', async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => { const t = TX.find(t => t.amount === -405.99); SET.loans = []; delete SET.contantIn; delete OVR[t.id]; markLoan(t.id, 'uit', 'lening'); return SET.loans[0].id; });
    await page.evaluate(id => loanContantOntvangen(id, 400, null, null), id);
    expect(await stand(page, id)).toEqual({ bedrag: 405.99, terug: 400, open: 5.99, niet: 0, verschil: 0, sluit: true });
  });

  test('2. blok 20 begint met "deel 1 van 1 · N regels" en gaat als .txt naar het deelmenu, anders als download', async ({ page }) => {
    await boot(page);
    const L = await lees(page);
    expect(L[0]).toBe(`deel 1 van 1 · ${L.length} regels`);
    const B = await page.evaluate(() => diagBlok20Bestand());
    expect(B.naam).toBe('minder-blok20-2026-10-10.txt');
    expect(B.tekst.split('\n')).toContain(`deel 1 van 1 · ${L.length} regels`);
    expect(B.tekst.split('\n').length).toBe(L.length + 6);
    expect(B.tekst.endsWith('=== EINDE ===')).toBe(true);
    /* het deelmenu krijgt een bestand met de hele tekst */
    const gedeeld = await page.evaluate(async () => { let got = null; navigator.canShare = () => true; navigator.share = async d => { got = { n: d.files[0].name, t: d.files[0].type, tekst: await d.files[0].text() }; };
      const r = await diagDeelBlok20(); return { r, got }; });
    expect(gedeeld.r).toBe('gedeeld');
    expect(gedeeld.got.n).toBe('minder-blok20-2026-10-10.txt');
    expect(gedeeld.got.t).toBe('text/plain');
    expect(gedeeld.got.tekst.split('\n').length).toBe(L.length + 6);
    /* zonder deelmenu: een download */
    const dl = await page.evaluate(async () => { navigator.canShare = () => false; let naam = null; const oud = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { naam = this.download; };
      const r = await diagDeelBlok20(); HTMLAnchorElement.prototype.click = oud; return { r, naam }; });
    expect(dl).toEqual({ r: 'download', naam: 'minder-blok20-2026-10-10.txt' });
    /* de knop staat naast kopieren */
    await page.evaluate(() => diagOpen());
    expect(await page.locator('#diagCopy').isVisible()).toBe(true);
    expect(await page.locator('[data-deelblok20]').innerText()).toBe('Blok 20 delen als bestand');
    /* kijken en delen schrijven niets */
    expect(await page.evaluate(() => { const v = localStorage.getItem('minder'); diagBlok20Bestand(); return v === localStorage.getItem('minder'); })).toBe(true);
  });

  test('3. buiten vast en potjes in september per soort, met de boekingen, en het sluit op het getal erboven', async ({ page }) => {
    await boot(page);
    const L = await lees(page);
    const i = L.findIndex(r => r.startsWith('  BUITEN VAST EN POTJES IN SEP PER SOORT'));
    expect(i).toBeGreaterThan(0);
    const blok = L.slice(i, L.findIndex((r, n) => n > i && r.startsWith('    samen')) + 1);
    for (const s of ['contant', 'persoonlijke overboeking zonder potje', 'uit een reservering betaald', 'geen norm', 'overboeking aan een ander'])
      expect(blok.some(r => r.startsWith(`    ${s}: `)), s).toBe(true);
    expect(blok.some(r => /TEGEN/.test(r))).toBe(false);
    expect(blok[blok.length - 1]).toMatch(/: sluit$/);
    /* elke boekingsregel telt mee: de som van de regels per soort is het getal van die soort */
    const som = {}; let k = null;
    for (const r of blok.slice(1, -1)) { const m = r.match(/^    (.+?): (-?\d+\.\d\d)/); if (m) { k = m[1]; som[k] = { kop: +m[2], rij: 0 }; continue; }
      const b = r.match(/^      \d\d-\d\d (-?\d+\.\d\d) /); if (b) som[k].rij += +b[1]; }
    for (const [s, v] of Object.entries(som)) expect(Math.round(v.rij * 100) / 100, s).toBe(v.kop);
    /* de vier soorten uit de vraag dragen elk hun boeking */
    expect(som['contant'].kop).toBe(80); expect(som['persoonlijke overboeking zonder potje'].kop).toBe(30);
    expect(som['uit een reservering betaald'].kop).toBe(300); expect(som['geen norm'].kop).toBe(25);
    expect(blok).toContain('      22-09 300.00 Cjib Verkeersboetes [Belasting & boetes] (boeking 463.00, waarvan uit je reservering)');
    expect(blok).toContain('      14-09 80.00 Geldmaat Koestraat 13 [Contant] (opname)');
    const kop = +L[i].match(/: (-?\d+)$/)[1], buiten = L.find(r => r.startsWith('  buiten vast en potjes:')).match(/sep (-?\d+)/)[1];
    expect(kop).toBe(+buiten);
    /* alleen uitleg: niets veranderd */
    expect(await page.evaluate(() => { const v = localStorage.getItem('minder'); diagSalarisVerdeling(); return v === localStorage.getItem('minder'); })).toBe(true);
  });
});
