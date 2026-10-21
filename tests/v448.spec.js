/* v448 (gevraagd door de gebruiker): correcties op het potje Contant van v447. GECONSTRUEERDE fixture (v448-stand, de vorm van de
   melding: grens op 07-10, telling EUR 720 op 07-10, EUR 400 terug van Ma op 05-10, geen opname sinds 24-09). De getallen van het
   toestel (CONTANT OPGENOMEN 900/900/280/600/500/700, EUR 3.570) staan niet in de repo; die verifieert de gebruiker met blok 20 en 23.
   1. Historie: een opname voor de v420-grens telt met een potje Contant als uitgegeven in het potje; de controle oud = nieuw per maand.
   2. Formule: uitgegeven = begin + opnames + ontvangen − storting − stand eind; een telling midden in de lopende periode is een
      tussenstand, daarna verwacht volgens tempo; de controle (formule tegen de loop over de gebeurtenissen) sluit.
   3. Blok 23: zonder telling op moment 2 de laatste telling als schatting, gemarkeerd; je antwoord vervangt hem.
   4. Opbouw november: een bedrag (budgetVanaf), met het verschil met het budget van nu per potje.
   5. Blok 20 punt 4/5/6: de lopende maand opzij uit opzijPeriode, rest en percentage "loopt nog". */
const { test, expect } = require('@playwright/test');
const S = require('./v448-stand');

const b20 = (page) => page.evaluate(() => diagSalarisVerdeling().join('\n'));
const regel = (b, re) => b.split('\n').find((l) => re.test(l)) || '';

test.describe('1 · historie', () => {
  test('a. zonder potje blijven de opnames voor de grens intern (de invoer draagt het geval)', async ({ page }) => {
    await S.boot(page, { potje: false });
    const r = await page.evaluate(() => ({ cat: catOf(TX.find((t) => t.date === '2026-09-23' && t.amount === -200)), sep: +(catSpendMap('2026-09')[CONTANT_CAT] || 0), kas: TX.filter((t) => t.kasGrens).length }));
    expect(r.cat).toBe('intern');
    expect(r.sep).toBe(0);
    expect(r.kas).toBeGreaterThanOrEqual(7);
  });

  test('b. met een potje telt elke opname in het potje Contant, in de app en in blok 20, en de controle klopt per maand', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => ({ cat: catOf(TX.find((t) => t.date === '2026-09-23' && t.amount === -200)), sep: catSpendMap('2026-09')[CONTANT_CAT], apr: catSpendMap('2026-04')[CONTANT_CAT] }));
    expect(r.cat).toBe('contant');
    expect(r.sep).toBe(300);
    expect(r.apr).toBe(100);
    const b = await b20(page);
    /* v450: contant per maand komt uit de tellingen (contantMaanden), met de correctie van v449: september 300 −300 (rest 20) */
    expect(regel(b, /^  Contant: /)).toContain('apr 100 · mei 100 · jun 100 · jul 100 · aug 100 · sep 0');
    expect(regel(b, /waarvan contant \(opname/)).toContain('sep 0');
    const c = regel(b, /CONTROLE oud "buiten · waarvan contant"/);
    expect(c).toContain('apr 100 = 100 klopt');
    expect(c).toContain('sep 300 = 300 klopt');
    expect(c).not.toContain('VERSCHIL');
    expect(regel(b, /^    24-08 t\/m 23-09 \|/)).toContain('| 300.00 |');
  });

  test('b2. categorize() zelf volgt het potje, ook zonder save() (de boot categoriseert voor de eerste save)', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate((LEEF) => { const t = { id: 'x1', date: '2026-08-11', amount: -60, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); const met = [t.autoCat, !!t.kasGrens]; const B = SET.budgets[CONTANT_CAT]; SET.budgets[CONTANT_CAT] = 0; const nx = Object.assign({}, SET.budgetsNext); delete SET.budgetsNext[CONTANT_CAT];
      categorize(t); const zonder = [t.autoCat, !!t.kasGrens]; SET.budgets[CONTANT_CAT] = B; SET.budgetsNext = nx; return { met, zonder }; }, S.LEEF);
    expect(r.met).toEqual(['contant', true]);
    expect(r.zonder).toEqual(['intern', true]);
  });

  test('c. het potje aan of uit zetten zet de opnames om bij de volgende save()', async ({ page }) => {
    await S.boot(page, { potje: false });
    const r = await page.evaluate(() => { const v = catOf(TX.find((t) => t.date === '2026-09-23' && t.amount === -200));
      potPlanZet(CONTANT_CAT, thisYM(), 400); save(); const n = catOf(TX.find((t) => t.date === '2026-09-23' && t.amount === -200));
      potPlanZet(CONTANT_CAT, thisYM(), 0); delete (SET.budgetsNext || {})[CONTANT_CAT]; save(); const w = catOf(TX.find((t) => t.date === '2026-09-23' && t.amount === -200));
      return { v, n, w, pot: contantPotje() }; });
    expect(r.v).toBe('intern');
    expect(r.n).toBe('contant');
    expect(r.pot).toBe(false);
    expect(r.w).toBe('intern');
  });

  test('d2. een opname die je zelf op intern zette blijft contant geld: in blok 20 en in de periode bij het potje, niet buiten', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { OVR[TX.find((t) => t.date === '2026-09-23' && t.amount === -200).id] = 'intern'; save(); });
    const r = await page.evaluate(() => ({ cat: catOf(TX.find((t) => t.date === '2026-09-23' && t.amount === -200)), P: contantPeriode({ start: '2026-08-24', eind: '2026-09-23' }).opn }));
    expect(r.cat).toBe('intern');
    expect(r.P).toBe(300);
    const b = await b20(page);
    expect(regel(b, /^  Contant: /)).toContain('sep 0');   // v450: uit de tellingen, na de correctie van v449
    expect(regel(b, /CONTROLE oud "buiten · waarvan contant"/)).toContain('sep 300 = 300 klopt');
    expect(regel(b, /CONTROLE oud "buiten · waarvan contant"/)).not.toContain('LET OP');
  });

  test('d. een eigen keuze op een opname wint van de grens', async ({ page }) => {
    await S.boot(page);
    const c = await page.evaluate(() => { OVR[TX.find((t) => t.date === '2026-09-23' && t.amount === -200).id] = 'boodschappen'; save(); return { cat: catOf(TX.find((t) => t.date === '2026-09-23' && t.amount === -200)), sep: +(catSpendMap('2026-09')[CONTANT_CAT] || 0) }; });
    expect(c.cat).toBe('boodschappen');
    expect(c.sep).toBe(100);
  });
});

test.describe('2 · de formule', () => {
  test('e. de lopende periode: tot de telling begin + opnames + ontvangen − telling, daarna verwacht volgens tempo', async ({ page }) => {
    await S.boot(page);
    const P = await page.evaluate(() => { const x = contantPeriode({ start: '2026-09-24', eind: '2026-10-25' }); delete x.ev; return x; });
    expect(P.lopend).toBe(true);
    expect(P.begin).toBeNull();
    expect(P.opn).toBe(0);
    expect(P.ontv).toBe(400);
    expect(P.eindT.stand).toBe(720);
    expect(P.uitgegeven).toBe(-320);
    expect(P.formule).toBe(-320);
    expect(P.sluit).toBe(true);
    /* 08-10 t/m 25-10 = 18 dagen tegen EUR 400 / 31 */
    expect(P.dagenNa).toBe(18);
    expect(P.verwachtNa).toBeCloseTo(400 * 18 / 31, 2);
    expect(P.uitkomst).toBeCloseTo(-320 + 400 * 18 / 31, 2);
    const b = await b20(page);
    expect(regel(b, /^    24-09 t\/m 25-10\*/)).toContain('400.00 (05-10 Ma) | 720.00 (07-10), tussenstand | tot de telling 0.00 (was -320.00');   // v448-nazorg: het overschot gaat als correctie naar de vorige periode (v448-nazorg.spec.js)
    expect(regel(b, /^      tot de telling 07-10/)).toContain('0.00 + opnames 0.00 + ontvangen 400.00 − telling 720.00 = -320.00');
    expect(regel(b, /^      daarna verwacht volgens tempo/)).toContain('18 dagen');
    expect(regel(b, /CONTROLE formule = loop/)).toContain('sluit in alle');
  });

  test('f. een opname na de telling in de lopende periode gaat de portemonnee in, niet de uitgave; in een afgesloten periode wel uitgegeven', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate((LEEF) => { const t = { id: 'na1', date: '2026-10-12', amount: -150, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); save();
      const L = contantPeriode({ start: '2026-09-24', eind: '2026-10-25' }), A = contantPeriode({ start: '2026-09-24', eind: '2026-10-20' });
      return { L: { u: L.uitgegeven, na: L.naOpn, s: L.sluit }, A: { u: A.uitgegeven, f: A.formule, s: A.sluit, l: A.lopend } }; }, S.LEEF);
    expect(r.L.u).toBe(-320);
    expect(r.L.na).toBe(150);
    expect(r.L.s).toBe(true);
    /* dezelfde boekingen als afgesloten periode: 0 + 150 + 400 − 720 = −170 */
    expect(r.A.l).toBe(false);
    expect(r.A.u).toBe(-170);
    expect(r.A.f).toBe(-170);
    expect(r.A.s).toBe(true);
  });

  test('g. twee tellingen: de loop telt bij elke telling, en de formule sluit daarop; een storting gaat eraf', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate((LEEF) => {
      SET.contantHist = [{ datum: '2026-08-01', stand: 50, op: 1, bron: 'telling' }, { datum: '2026-08-15', stand: 120, op: 2, bron: 'telling' }].concat(SET.contantHist);
      const s = { id: 'st1', date: '2026-08-20', amount: 30, acc: LEEF, name: 'Geldmaat', desc: 'GELDMAAT STORTING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(s); TX.push(s); SET.contantStort = Object.assign({}, SET.contantStort, { st1: 'ja' }); save();
      const P = contantPeriode({ start: '2026-08-02', eind: '2026-08-31' }); return { u: P.uitgegeven, f: P.formule, s: P.sluit, b: P.begin.stand, e: P.eindT.stand, o: P.opn, st: P.stort }; }, S.LEEF);
    /* begin 50 (01-08) + opname 100 (11-08) − storting 30 − eind 120 (15-08) = 0 */
    expect(r.b).toBe(50);
    expect(r.e).toBe(120);
    expect(r.o).toBe(100);
    expect(r.st).toBe(30);
    expect(r.u).toBe(0);
    expect(r.f).toBe(0);
    expect(r.s).toBe(true);
  });
});

test.describe('3 · blok 23', () => {
  test('h. geen telling op moment 2: de laatste telling als schatting, gemarkeerd, en te pinnen is budget × dagen/31 − stand', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const P = rekVoorstel(); return { st: P.kasStand, bron: P.kasStandBron, d: P.kasStandDatum, kasP: P.kasP, bud: P.kasBud, dagen: P.dagen, dim: P.dimStart, b: diagRekVerdeling().join('\n') }; });
    /* v450 punt 3: de schatting is de telling min het tempo sinds die telling (14 dagen × 400/31) */
    expect(r.st).toBeCloseTo(720 - 14 * 400 / 31, 2);
    expect(r.bron).toBe('schatting');
    expect(r.d).toBe('2026-10-07');
    expect(r.kasP).toBe(Math.max(Math.round((r.bud * r.dagen / r.dim - r.st) * 100) / 100, 0));
    expect(r.b).toContain('SCHATTING, v450: laatste telling 720 op 07-10');
  });

  test('i. met een kleinere schatting is te pinnen het verschil, en je antwoord bij moment 2 vervangt de schatting', async ({ page }) => {
    await S.boot(page, { dag: '2026-10-25' });
    const r = await page.evaluate(() => { SET.contant.stand = 300; SET.contantHist[0].stand = 300; save();   // v450: 300 − 18 dagen tempo
      const A = rekVoorstel(); const a = { st: A.kasStand, bron: A.kasStandBron, kasP: A.kasP, bud: A.kasBud, dagen: A.dagen, dim: A.dimStart };
      SET.kasMoment = { '2026-09-24': { keuze: 'stand', stand: 60, op: '2026-10-25' } }; save();
      const B = rekVoorstel(); return { a, b: { st: B.kasStand, bron: B.kasStandBron, kasP: B.kasP } }; });
    expect(r.a.bron).toBe('schatting');
    expect(r.a.st).toBeCloseTo(300 - 18 * 400 / 31, 2);
    expect(r.a.kasP).toBe(Math.round((r.a.bud * r.a.dagen / r.a.dim - r.a.st) * 100) / 100);
    expect(r.b.bron).toBe('moment2');
    expect(r.b.st).toBe(60);
    expect(r.b.kasP).toBe(Math.round((r.a.bud * r.a.dagen / r.a.dim - 60) * 100) / 100);
  });
});

test.describe('4 · opbouw november', () => {
  test('j. een bedrag: budgetVanaf, met het verschil met het budget van nu per potje, en de regel met Contant telt op tot hetzelfde bedrag', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => ({ BV: budgetVanaf(nextYM(thisYM())), nu: maandBudgetNu(thisYM()).totaal, G: budgetWijzGevolg(() => {}) }));
    expect(r.BV.totaal).toBe(r.nu - 10);
    expect(r.BV.anders.map((x) => [x.k, x.d])).toEqual([['vices', -10]]);
    expect(r.G.B1).toBe(r.BV.totaal);
    const b = await page.evaluate(() => diagSalarisVerdeling().join('\n') + '\n' + diagMaandBudget(maandVooruit(), true).join('\n'));
    const e = (x) => '€' + x.toLocaleString('nl-NL');
    expect(regel(b, /OPBOUW budget vanaf 1 november/)).toContain(`${e(r.BV.totaal)} = vastgelegd`);
    expect(regel(b, /OPBOUW budget vanaf 1 november/)).toContain('− Vices €10');
    expect(regel(b, /OPBOUW vanaf 1 november met Contant/)).toContain(`${e(r.BV.totaal - 400)} + Contant €400 = ${e(r.BV.totaal)}`);
    expect(regel(b, /^  budget vanaf 1 november/)).toContain(`${e(r.BV.totaal)} = budget van nu ${e(r.nu)} − Vices €10`);
    expect(b).not.toContain('dit wordt het budget vanaf');
  });
});

test.describe('5 · blok 20 punt 4/5/6', () => {
  test('k. de lopende maand: opzij uit opzijPeriode, rest en percentage loopt nog; de afgeronde maanden ongewijzigd', async ({ page }) => {
    await S.boot(page);
    const b = await b20(page);
    const O = await page.evaluate(() => opzijPeriode().netto);
    expect(regel(b, /^  NETTO OPZIJ: /)).toContain(`okt* loopt nog · deze periode ${Math.round(O)} (opzijPeriode, 24-09 t/m 25-10)`);
    expect(regel(b, /^  NETTO OPZIJ: /)).toContain('sep -1050');
    const rest = b.split('\n')[b.split('\n').findIndex((l) => /^5\. REST/.test(l)) + 1];
    expect(rest).toContain('okt* loopt nog');
    expect(rest).toMatch(/sep -?\d+/);
    expect(regel(b, /^  okt\*: \d+% \| \d+% \| /)).toContain('| loopt nog');
  });
});
