/* v412: GESTOPTE POSTEN EN DE BESLISSINGEN C. Op grip-v409-stand (10 oktober 2026).
   A1 een post kan gestopt (door jou), en telt dan nergens mee; terugdraaien kan; weer betaald vraagt of hij actief is.
   A2 een post die langer uit is dan de tolerantie is verlopen, telt niet mee en vraagt in Let op of hij gestopt is.
   A3 geen status uit de code: elke post in de fixture is actief tot jij iets zet.
   A4 blok 19 draagt de status en de laatste betaling.
   B5 potNodig() heeft een startmaand; bijstellen en het formulier geven hun ingangsmaand mee.
   B7 "(weinig historie)" bij minder dan drie afgeronde maanden.
   B8 de ondergrens noemt altijd een maand en een jaar. */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');
const { kaalUit } = require('./bron-kaal');

const PREMIUM = s => /PREMIUM/i.test(s.name);
const keyVan = (page) => page.evaluate(() => recurringSchedule().find(s => /PREMIUM/i.test(s.name)).key);
const letOp = (page) => page.evaluate(() => gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), [])
  .map(x => ({ soort: x.soort, key: x.key, naam: x.naam, sub: x.sub })));

test.describe('A3 · geen status uit de code', () => {
  test('elke post in de fixture is actief, en SET.postStatus is leeg', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => ({ st: Object.values(postStatusMap()).map(p => p.status), set: SET.postStatus || {} }));
    expect(r.st.length).toBeGreaterThan(5);
    expect(new Set(r.st)).toEqual(new Set(['actief']));
    expect(r.set).toEqual({});
  });
});

test.describe('A1/A3 · een gestopte kwartaalpost telt niet mee', () => {
  test('Huurwoningen Premium gestopt: Abonnementen niet meer te krap, nodig zakt naar de gewone maand', async ({ page }) => {
    await S.boot(page);
    const key = await keyVan(page);
    const voor = await page.evaluate(() => { const N = potNodig('abonnement', maandVooruit()); return [N.nodig, N.maand, potKrapLijst().map(x => x.k).includes('abonnement')]; });
    expect(voor).toEqual([51, '2026-10', true]);   // invoermeting: zonder status is het potje te krap
    const na = await page.evaluate((key) => { postZet(key, 'gestopt'); const V = maandVooruit(), N = potNodig('abonnement', V);
      return { n: [N.nodig, N.maand, N.periodiek.length], krap: potKrapLijst().map(x => x.k), verwacht: verwachtInMaand(key, thisYM()),
        status: postStatus(key).status, ruim: teRuimLijst(V).find(x => x.k === 'abonnement').nodig, varNu: N.varNu,
        post: (monthLiquidity().fixDueItems || []).filter(s => s.key === key).map(s => s.excl) }; }, key);
    expect(na.status).toBe('gestopt');
    expect(na.n).toEqual([na.varNu, '2026-10', 0]);   // de gewone maand, zonder de post
    expect(na.n[0]).toBe(20);
    expect(na.krap).not.toContain('abonnement');
    expect(na.ruim).toBe(20);                          // te ruim leest dezelfde nodig
    expect(na.verwacht).toBe(false);                   // en hij wordt niet meer verwacht
    expect(na.post.every(e => e === true)).toBe(true);
    const lo = (await letOp(page)).filter(x => x.soort === 'krap' && x.key === 'abonnement');
    expect(lo).toEqual([]);
  });
  test('toch actief zet het terug', async ({ page }) => {
    await S.boot(page);
    const key = await keyVan(page);
    const r = await page.evaluate((key) => { postZet(key, 'gestopt'); postZet(key, 'actief');
      const N = potNodig('abonnement', maandVooruit()); return [postStatus(key).status, N.nodig, potKrapLijst().map(x => x.k).includes('abonnement')]; }, key);
    expect(r).toEqual(['actief', 51, true]);
  });
  test('de knoppen: Vaste lasten, de te-krap-sheet en Let op', async ({ page }) => {
    await S.boot(page);
    const key = await keyVan(page);
    /* Let op: het te-krap-signaal vraagt of de post gestopt is */
    const k = (await letOp(page)).find(x => x.soort === 'krap' && x.key === 'abonnement');
    expect(k.sub).toContain('of is Huurwoningen Premium gestopt? ›');
    /* v416: de te-krap-sheet heeft gestopt als eerste keuze (de losse link is weg); kiezen schrijft niets, bevestigen wel */
    await page.evaluate(() => openPotHerzien('abonnement'));
    expect(await page.locator('[data-phgestopt]').count()).toBe(0);
    await page.locator(`[data-phoptie="g:${key}"]`).click();
    expect(await page.evaluate(() => SET.postStatus || {})).toEqual({});   // kiezen schrijft niets
    await page.locator('[data-phbevestig]').click();
    expect(await page.evaluate((key) => postStatus(key).status, key)).toBe('gestopt');
    expect(await page.evaluate(() => document.getElementById('sheetBg').classList.contains('show'))).toBe(false);   // v416: de sheet sluit na de keuze
    /* Vaste lasten: per post de status met "toch actief" */
    await page.evaluate(() => openVasteLasten());
    const rij = page.locator('[data-poststatusrij="gestopt"]');
    await expect(rij).toContainText('gestopt door jou · laatste betaling 20 jul');
    await rij.locator('[data-postknop]').click();
    await page.locator('[data-postzet="actief"]').click();
    expect(await page.evaluate((key) => postStatus(key).status, key)).toBe('actief');
    await expect(page.locator('[data-poststatusrij="gestopt"]')).toHaveCount(0);   // terug op Vaste lasten
    await expect(page.locator('[data-poststatusrij="actief"]').first()).toBeVisible();
  });
  test('weer betaald na gestopt: Let op vraagt of hij actief is, en hij blijft gestopt tot je kiest', async ({ page }) => {
    await S.boot(page);
    const key = await keyVan(page);
    await page.evaluate((key) => { postZet(key, 'gestopt'); }, key);
    expect((await letOp(page)).filter(x => x.soort === 'weerbetaald')).toEqual([]);
    await page.evaluate(({ MAIN }) => { const t = { id: 'v412weer', date: '2026-10-08', amount: -31, acc: MAIN, name: 'Huurwoningen Premium', desc: 'SEPA INCASSO HUURWONINGEN PREMIUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'abonnement'; save(); }, { MAIN: S.MAIN });
    const w = (await letOp(page)).filter(x => x.soort === 'weerbetaald');
    expect(w.map(x => x.naam)).toEqual(['Huurwoningen Premium weer actief? · €31 per kwartaal · weer betaald op 8 okt']);   // v414: naam en vraag vooraan, details erna
    expect(await page.evaluate((key) => postStatus(key).status, key)).toBe('gestopt');
    /* "blijft gestopt" laat de vraag vallen; een volgende betaling vraagt het opnieuw */
    await page.evaluate((key) => postZet(key, 'gestopt'), key);
    expect((await letOp(page)).filter(x => x.soort === 'weerbetaald')).toEqual([]);
    expect(await page.evaluate((key) => postStatus(key).status, key)).toBe('gestopt');
  });
});

test.describe('A2 · verlopen', () => {
  test('de tolerantie per cadans: maand 7, kwartaal 14, jaar 30, 4-wekelijks 7 dagen', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => {
      const st = (s, dag) => { const [y, m, d] = dag.split('-').map(Number); return postStatusVan(Object.assign({ key: 'x', name: 'X' }, s), new Date(y, m - 1, d)).status; };
      return {
        maand: [st({ lastDate: '2026-09-01', intervalM: 1 }, '2026-10-08'), st({ lastDate: '2026-09-01', intervalM: 1 }, '2026-10-09')],
        maandCad: [st({ lastDate: '2026-09-01', intervalM: 1, cadans: 'maand', afstand: 30 }, '2026-10-08'), st({ lastDate: '2026-09-01', intervalM: 1, cadans: 'maand', afstand: 30 }, '2026-10-09')],
        kwartaal: [st({ lastDate: '2026-07-20', intervalM: 3 }, '2026-11-03'), st({ lastDate: '2026-07-20', intervalM: 3 }, '2026-11-04')],
        jaar: [st({ lastDate: '2025-10-01', intervalM: 12 }, '2026-10-31'), st({ lastDate: '2025-10-01', intervalM: 12 }, '2026-11-01')],
        vier: [st({ lastDate: '2026-09-01', intervalM: 1, cadans: '4w', afstand: 28 }, '2026-10-06'), st({ lastDate: '2026-09-01', intervalM: 1, cadans: '4w', afstand: 28 }, '2026-10-07')],
      };
    });
    expect(r).toEqual({ maand: ['actief', 'verlopen'], maandCad: ['actief', 'verlopen'], kwartaal: ['actief', 'verlopen'], jaar: ['actief', 'verlopen'], vier: ['actief', 'verlopen'] });
  });
  test('een verlopen kwartaalpost: niet meegeteld, Let op vraagt, blok 19 zegt het, en antwoorden kan beide kanten op', async ({ page }) => {
    await S.boot(page);
    /* een kwartaalpost waarvan de betaling van september (verwacht 1 sep, plus 14 dagen) uitbleef */
    const key = await page.evaluate(({ MAIN }) => { for (const d of ['2025-12-01', '2026-03-02', '2026-06-01']) { const t = { id: 'v412vl' + d, date: d, amount: -45, acc: MAIN, name: 'Verlopen Verzekering', desc: 'SEPA INCASSO VERLOPEN VERZEKERING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'verzekering'; } save(); return recurringSchedule().find(s => /VERLOPEN/i.test(s.name)).key; }, { MAIN: S.MAIN });
    const r = await page.evaluate((key) => ({ st: postStatus(key).status, telt: postTelt(key), per: periodiekePosten('verzekering').some(s => s.key === key),
      diag: diagEenSignaal(maandVooruit()).filter(l => /Verlopen Verzekering/.test(l)) }), key);
    expect(r.st).toBe('verlopen');
    expect(r.telt).toBe(false);
    expect(r.per).toBe(false);
    expect(r.diag).toEqual(['  Verlopen Verzekering | Verzekeringen | elke 3 maanden | 45 | verlopen, niet meegeteld (verwacht 2026-09-01, tolerantie 14 dagen) | 2026-06-01 | dec 2026, mrt 2027, jun 2027, sep 2027']);
    const lo = (await letOp(page)).filter(x => x.soort === 'verlopen');
    expect(lo.map(x => x.naam)).toEqual(['Verlopen Verzekering gestopt? · €45 per kwartaal · niet betaald sinds 1 jun']);   // v414: naam en vraag vooraan, details erna
    /* nee, nog actief: hij telt weer mee en de vraag is weg */
    await page.evaluate((key) => openPostStatus(key), key);
    await expect(page.locator('#postStatusSheet')).toHaveAttribute('data-poststatus', 'verlopen');
    await page.locator('[data-postzet="actief"]').click();
    expect(await page.evaluate((key) => [postStatus(key).status, postTelt(key)], key)).toEqual(['actief', true]);
    expect((await letOp(page)).filter(x => x.soort === 'verlopen')).toEqual([]);
    /* ja, gestopt */
    await page.evaluate((key) => postZet(key, 'gestopt'), key);
    expect(await page.evaluate((key) => [postStatus(key).status, postTelt(key)], key)).toEqual(['gestopt', false]);
  });
});

test.describe('A4 · blok 19: status en laatste betaling', () => {
  test('een kolom per post, ook gestopt door jou', async ({ page }) => {
    await S.boot(page);
    const key = await keyVan(page);
    const regel = () => page.evaluate(() => diagEenSignaal(maandVooruit()).find(l => /^  Huurwoningen Premium \|/.test(l)));
    expect(await regel()).toBe('  Huurwoningen Premium | Abonnementen | elke 3 maanden | 31 | actief | 2026-07-20 | okt 2026, jan 2027, apr 2027, jul 2027');
    await page.evaluate((key) => postZet(key, 'gestopt'), key);
    expect(await regel()).toBe('  Huurwoningen Premium | Abonnementen | elke 3 maanden | 31 | gestopt door jou | 2026-07-20 | okt 2026, jan 2027, apr 2027, jul 2027');
  });
});

test.describe('B5 · potNodig() heeft een startmaand', () => {
  test('het venster loopt twaalf maanden vanaf de start', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit();
      return [0, 1, 2, 4].map(i => { const st = valtOpYmPlus(thisYM(), i), N = potNodig('abonnement', V, null, { start: st }); return [st, N.nodig, N.maand, N.start]; }); });
    /* oktober is de lopende maand (verwacht eind 51); vanaf november valt Huurwoningen in januari, vanaf februari in april */
    /* v416: in de maand van Huurwoningen telt de post bij de gewone maand (mediaan 0), niet bij de hoogste (20): 31 */
    expect(r).toEqual([['2026-10', 51, '2026-10', '2026-10'], ['2026-11', 31, '2027-01', '2026-11'], ['2026-12', 31, '2027-01', '2026-12'], ['2027-02', 31, '2027-04', '2027-02']]);
  });
  test('bijstellen, het formulier en te ruime potjes bijstellen geven hun ingangsmaand mee', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const vanaf = '2027-02';
      SET.budgets.abonnement = 600; SET.budgetsNext = Object.assign({}, SET.budgetsNext || {}, { abonnement: 600 }); save();
      const kd = potFormVoorstel({ cat: 'vices', vast: true, bedrag: 40, vanaf, bron: 'dek' }).kand.find(x => x.k === 'abonnement');
      const P = potjeBijstelVoorstel('vices'), bj = P.kand.find(x => x.k === 'abonnement');
      const D = ruimBijstelData({ keuze: {}, eigen: {}, best: {}, vanaf: '2026-12' }), rb = D.pots.find(x => x.k === 'abonnement');
      return { kd: kd.vloerMaand, bj: [P.vanaf, bj.vloerMaand], rb: rb.vloerMaand }; });
    expect(r.kd).toBe('2027-04');
    expect(r.bj).toEqual(['2026-11', '2027-01']);
    expect(r.rb).toBe('2027-01');
    for (const f of ['potjeBijstelVoorstel', 'ruimBijstelData', 'potFormVoorstel']) expect(await kaalUit(page, f)).toMatch(/potOndergrens\([^)]*,\s*(vanaf|st)\)/);
  });
});

test.describe('B7/B8 · de tekst van de ondergrens', () => {
  test('altijd een maand en een jaar, geen lege plek', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { SET.budgets.abonnement = 600; save();
      const T = [];
      window._potForm = { cat: 'vices', vast: true, bedrag: 40, vanaf: nextYM(thisYM()), bron: 'dek' }; renderPotForm(); showSheetBg();
      T.push(...[...document.querySelectorAll('[data-pfondergrens]')].map(e => e.textContent));
      openPotjeBijstel('vices'); T.push(...[...document.querySelectorAll('[data-bijstelondergrens]')].map(e => e.textContent));
      openRuimBijstel(); T.push(...[...document.querySelectorAll('[data-ruimondergrens]')].map(e => e.textContent));
      closeSheet();
      return { T, leeg: ondergrensTekst({ nodig: 5, maand: null, vloer: 5 }, 5, 0) }; });
    expect(r.T.length).toBeGreaterThan(5);
    for (const t of r.T.concat([r.leeg])) {
      expect(t).toMatch(/nodig €[\d.]+ in (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december) \d{4} · ondergrens €[\d.]+/);
      expect(t).not.toMatch(/ in ·| in ,| {2}|in \(|\(\)/);
    }
    expect(r.T.some(t => /weinig historie/.test(t))).toBe(false);   // drie afgeronde maanden: geen voorbehoud
  });
  test('minder dan drie afgeronde maanden: "(weinig historie)" in de sheets en in blok 19', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { TX = TX.filter(t => !t.date.startsWith('2026-07')); save();
      const onb = maandVooruit().onbekend;
      const kd = potFormVoorstel({ cat: 'vices', vast: true, bedrag: 40, vanaf: nextYM(thisYM()), bron: 'dek' });
      window._potForm = { cat: 'vices', vast: true, bedrag: 40, vanaf: nextYM(thisYM()), bron: 'dek' }; renderPotForm(); showSheetBg();
      const pf = [...document.querySelectorAll('[data-pfondergrens]')].map(e => e.textContent); closeSheet();
      return { onb, pf, d: diagTeRuim().filter(l => /weinig historie/.test(l)) }; });
    expect(r.onb).toBe(true);
    expect(r.pf.length).toBeGreaterThan(0);
    for (const t of r.pf) expect(t).toContain('(weinig historie)');
    expect(r.d.length).toBeGreaterThan(1);
    expect(r.d.some(l => /^  Abonnementen: nodig \d+ = \w+ \d{4}: .* \(weinig historie\)/.test(l))).toBe(true);
  });
});
