/* v456 (gevraagd door de gebruiker, antwoord op v455 en op blok 8, 20 en 25 van 23-10; nog geen deel B). GECONSTRUEERDE fixtures:
   v448-stand (oktober 2026, het potje Contant ontstaat deze maand) en v421-stand (10 oktober 2026).
   1. Budget ligt vast in oktober: in de maand waarin het potje Contant ontstaat valt Contant aan BEIDE kanten weg (niet in het budget,
      niet in de forecast); onder budget is gelijk aan zonder potje; vanaf 1 november telt Contant mee. Blok 20: "CONTROLE budget oktober
      = budget op 01-10 → klopt".
   2. Een betaling na een kwijtgescholden lening is een vraag (soort 3): "Is dit de terugbetaling van de lening die je kwijtschold?" Ja /
      Nee, iets anders, niets voorgeselecteerd. Ja telt de betaling als ontvangst in zijn eigen maand onder Uitgeleend; de maand van de
      lening blijft gelijk.
   3. Blok 25: soort A (beide kanten intern, kandidaat voor soort 1) en soort B (een kant is een echte uitgave of een lening, nooit
      koppelen), per soort aantal en som per maand.
   4. Een entry in SET.psd2Diag van een verbinding die niet meer bestaat heet "vervangen" en telt niet mee in psd2DiagActief() en
      psd2Falend(); blok 8 zegt of entry_reference ergens gevuld is, en toont de bank-id-meting voluit.
   5. De benoem-vraag van v424 heeft ook "Hoort in een potje" (eerst het potje), met Vergeten terug naar de oude categorie. */
const { test, expect } = require('@playwright/test');
const S448 = require('./v448-stand');
const S421 = require('./v421-stand');

const regel = (L, re) => (L.find((l) => re.test(l)) || '');

test.describe('1 · budget ligt vast in de maand waarin het potje Contant ontstaat', () => {
  const stand = (page) => page.evaluate(() => { const V = maandVooruit(), W = maandBudgetWijz(), I = brugIndeling(V), BG = budgetPerGroep(V);
    return { budget: V.budget, proj: V.projectie, onder: V.budget - V.projectie, vast: Math.round(maandBudgetVast().totaal), later: V.contantLater,
      cPot: V.potjes.some((x) => x.k === CONTANT_CAT), wtot: W.tot, wl: W.later, Isom: I.budget + I.som, BG: BG.som, meter: gripMeterBudget(V).budget,
      ins: insMaandStand().Bvast, cat: +(catSpendMap(thisYM()) || {})[CONTANT_CAT] || 0, ruim: teRuimLijst(V).some((x) => x.k === CONTANT_CAT) }; });

  test('a. Contant valt aan beide kanten weg: budget = vastgelegd budget van de 1e, onder budget gelijk aan zonder potje', async ({ page }) => {
    await S448.boot(page, { potje: false, opnNa: 150 });
    const zonder = await stand(page);
    await S448.boot(page, { opnNa: 150 });
    const met = await stand(page);
    /* de invoer draagt het geval: het potje is er nu, het vastgelegde budget van 1 oktober niet, en er is al iets uit in de categorie */
    expect(await page.evaluate(() => [contantNieuwIn(), +(maandBudgetVast().potjes || {})[CONTANT_CAT] || 0, +SET.budgets[CONTANT_CAT]])).toEqual([true, 0, 400]);
    expect(met.cat).toBeGreaterThan(0);
    expect(met.budget).toBe(met.vast);
    expect(met.budget).toBe(zonder.budget);
    expect(met.proj).toBe(zonder.proj);
    expect(met.onder).toBe(zonder.onder);
    expect(met.cPot).toBe(false);
    expect(met.later).toMatchObject({ k: 'contant', bud: 400 });
    expect(met.later.weg).toBe(Math.round(met.cat));
    /* elk scherm leest hetzelfde budget, en Contant staat niet bij te ruim of bij de wijzigingen */
    expect([met.Isom, met.BG, met.meter, met.ins]).toEqual([met.proj, met.budget, met.budget, met.budget]);
    expect(met.ruim).toBe(false);
    expect(met.wtot).toBe(0);
    expect(met.wl.label).toBe('nieuw potje deze maand · telt vanaf 1 november mee');
  });

  test('b. het budget beweegt niet met de forecast van Contant mee (een opname later in de maand)', async ({ page }) => {
    await S448.boot(page, { opnNa: 100 });
    const a = await stand(page);
    await S448.boot(page, { opnNa: 300 });
    const b = await stand(page);
    expect(b.cat).toBeGreaterThan(a.cat);
    expect(b.budget).toBe(a.budget);
    expect(b.onder).toBe(a.onder);
  });

  test('c. blok 20: CONTROLE budget oktober = budget op 01-10 klopt, en CONTANT LATER staat er met het bedrag', async ({ page }) => {
    await S448.boot(page, { opnNa: 150 });
    const L = await page.evaluate(() => diagSalarisVerdeling());
    expect(regel(L, /CONTROLE budget oktober = budget op 01-10/)).toMatch(/: €[\d.]+ tegen €[\d.]+ → klopt$/);
    expect(regel(L, /CONTANT LATER \(v456\)/)).toContain('Contant €400 · nieuw potje deze maand · telt vanaf 1 november mee · deze maand niet in het budget en niet in de forecast');
    expect(L.join('\n')).not.toContain('HERINDELING');
    for (const re of [/CONTROLE maandbudget op alle schermen/, /CONTROLE budget per groep/, /CONTROLE onder budget = vastgelegd/, /CONTROLE som van de groepen = vastgelegd/, /CONTROLE budget \+ verschillen = forecast/])
      expect(regel(L, re)).toContain('klopt');
  });

  test('d. vanaf 1 november telt Contant gewoon mee met EUR 400', async ({ page }) => {
    await S448.boot(page);
    const r = await page.evaluate(() => { const ym = thisYM(); SET.maandBudget[ym].potjes[CONTANT_CAT] = 400; SET.maandBudget[ym].totaal += 400; save();
      const V = maandVooruit(); return { nieuw: contantNieuwIn(), later: V.contantLater, cPot: V.potjes.some((x) => x.k === CONTANT_CAT), nov: budgetVanaf(nextYM(ym)).potjes[CONTANT_CAT] }; });
    expect(r.nieuw).toBe(false);
    expect(r.later).toBeFalsy();
    expect(r.cPot).toBe(true);
    expect(r.nov).toBe(400);
  });
});

async function bootPam(page, terug) {
  await S421.boot(page);
  return page.evaluate(({ MAIN, terug }) => {
    const add = (d, a, n) => { const t = { id: 'v456' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    const uit = add('2026-07-10', -300, 'Pam de Vries');
    TX.sort((a, c) => a.date.localeCompare(c.date)); applyOwnAccounts(); save();
    markLoan(uit.id, 'uit', 'lening'); const l = SET.loans.find((x) => x.txId === uit.id); loanNietTerug(l.id);
    const in1 = terug ? add('2026-10-05', 300, 'Pam de Vries') : null;
    TX.sort((a, c) => a.date.localeCompare(c.date)); applyOwnAccounts(); buildAccMeta(); save(); render();
    return { lid: l.id, uit: uit.id, in: in1 ? in1.id : null };
  }, { MAIN: S421.MAIN, terug });
}

test.describe('2 · een betaling na een kwijtgescholden lening', () => {
  test('a. de vraag staat in Kloppen mijn gegevens? met Ja en Nee, iets anders, niets voorgeselecteerd, en een vraag per boeking', async ({ page }) => {
    const ids = await bootPam(page, true);
    const r = await page.evaluate((ids) => { const Q = gegevensVragen().filter((q) => q.t && q.t.id === ids.in);
      openGegevensVragen('kwijt|' + ids.in); const e = document.querySelector(`[data-gegevensvraag="kwijt"][data-tx="${ids.in}"]`);
      return { n: Q.length, soort: Q.map((q) => q.soort), tekst: e ? e.innerText : '', knoppen: e ? [...e.querySelectorAll('[data-kwijtoptie]')].map((b) => [b.innerText, b.className]) : [] }; }, ids);
    expect(r.n).toBe(1);
    expect(r.soort).toEqual(['kwijt']);
    expect(r.tekst).toContain('Is dit de terugbetaling van de lening die je kwijtschold?');
    expect(r.knoppen).toEqual([['Ja', 'btn sec'], ['Nee, iets anders', 'btn sec']]);
  });

  test('b. Ja: ontvangst onder Uitgeleend in oktober, juli blijft gelijk, blok 20 zegt "terug na kwijtschelding", en Vergeten zet terug', async ({ page }) => {
    const ids = await bootPam(page, true);
    const voor = await page.evaluate(() => ({ jul: Math.round(totals('2026-07').spendNorm * 100) / 100, okt: Math.round(totals('2026-10').spendNorm * 100) / 100 }));
    await page.evaluate((id) => openGegevensVragen('kwijt|' + id), ids.in);
    expect(await page.locator(`[data-gegevensvraag="kwijt"][data-tx="${ids.in}"] [data-kwijtoptie="ja"]`).count()).toBe(1);
    await page.locator(`[data-gegevensvraag="kwijt"][data-tx="${ids.in}"] [data-kwijtoptie="ja"]`).click();
    const na = await page.evaluate((ids) => ({ cat: catOf(TX.find((t) => t.id === ids.in)), jul: Math.round(totals('2026-07').spendNorm * 100) / 100, okt: Math.round(totals('2026-10').spendNorm * 100) / 100,
      vraag: kwijtVragen().length, E: SET.kennis['kwijt|' + ids.in], L: diagSalarisVerdeling().join('\n'), niet: loanStand(loans().find((l) => l.id === ids.lid)).nietTerug,
      lijst: kennisLijst().find((x) => x.kennis === 'kwijt|' + ids.in) }), ids);
    expect(na.cat).toBe('uitgeleend');
    expect(na.jul).toBe(voor.jul);
    expect(na.okt).toBe(voor.okt);
    expect(na.niet).toBe(300);
    expect(na.vraag).toBe(0);
    expect(na.E).toMatchObject({ soort: 'kwijt', aard: 'ja', loanId: ids.lid, bron: 'jij' });
    expect(na.lijst.groep).toBe('leningen');
    expect(na.L).toMatch(/terug na kwijtschelding \(v456, door jou\): 05-10 300\.00 \(ontvangst in okt, onder Uitgeleend\) · jul blijft ongewijzigd/);
    const terug = await page.evaluate((id) => { kennisVergeetKern('k:kwijt|' + id); applyOwnAccounts(); save(); return { cat: catOf(TX.find((t) => t.id === id)), vraag: kwijtVragen().length }; }, ids.in);
    expect(terug.cat).not.toBe('uitgeleend');
    expect(terug.vraag).toBe(1);
  });

  test('c. Nee, iets anders: de boeking blijft zoals ze stond, de vraag is weg; zonder kwijtschelding geen vraag', async ({ page }) => {
    const ids = await bootPam(page, true);
    const r = await page.evaluate((id) => { const c0 = catOf(TX.find((t) => t.id === id)); kwijtZet(id, 'nee'); return { c0, c1: catOf(TX.find((t) => t.id === id)), vraag: kwijtVragen().length, aard: SET.kennis['kwijt|' + id].aard }; }, ids.in);
    expect(r.c1).toBe(r.c0);
    expect(r.vraag).toBe(0);
    expect(r.aard).toBe('nee');
    /* een lening zonder kwijtgescholden deel vraagt dit niet */
    const zonder = await page.evaluate((lid) => { const l = loans().find((x) => x.id === lid); l.nietTerug = 0; delete SET.kennis[Object.keys(SET.kennis).find((k) => k.startsWith('kwijt|'))]; return kwijtVragen().length; }, ids.lid);
    expect(zonder).toBe(0);
  });
});

test.describe('3 · blok 25: twee soorten paren', () => {
  test('a. soort A (beide kanten intern) en soort B (een kant is een uitgave of een lening), per soort per maand', async ({ page }) => {
    await S421.boot(page);
    const L = await page.evaluate(({ MAIN }) => { const add = (d, a, n, c) => { const t = { id: 'v456p' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
      add('2026-09-05', -80, 'From Main to Buffer', 'intern'); add('2026-09-05', 80, 'Ve Sumter', 'intern');
      add('2026-09-12', -675, 'Ml Macnack', 'huur'); add('2026-09-12', 675, 'Ve Sumter', 'intern');
      add('2026-08-14', -300, 'Ve Sumter', LOAN_CAT.uit); add('2026-08-14', 300, 'Ve Sumter', 'intern');
      save(); return diagEigenParen(); }, { MAIN: S421.MAIN });
    const j = L.join('\n');
    const iA = L.findIndex((l) => /SOORT A/.test(l)), iB = L.findIndex((l) => /SOORT B/.test(l));
    expect(iA).toBeGreaterThan(0);
    expect(iB).toBeGreaterThan(iA);
    const A = L.slice(iA, iB).join('\n'), B = L.slice(iB, L.findIndex((l) => /CONTROLE soort A/.test(l))).join('\n');
    expect(A).toMatch(/\n      2026-09  1 · 80\.00/);
    expect(A).toMatch(/\n      2026-06  1 · 50\.00/);   // de stand van v421: 16-06 -50 From Main to Zakgeld en +50 Ve Sumter
    expect(A).not.toMatch(/675|300\.00/);
    expect(B).toMatch(/\n      2026-09  1 · 675\.00/);
    expect(B).toMatch(/\n      2026-08  1 · 300\.00/);
    expect(j).toMatch(/SOORT B · een kant is een echte uitgave of een lening: aanvullen voor betalen, GEEN paar, nooit koppelen/);
    expect(regel(L, /CONTROLE soort A \+ soort B/)).toMatch(/→ klopt$/);
    expect(regel(L, /675\.00 · soort B/)).toContain('echte uitgave');
  });
});

test.describe('4 · een oude verbinding in SET.psd2Diag', () => {
  test('a. een entry zonder gekoppelde rekening heet vervangen, en telt niet in psd2DiagActief en psd2Falend; weer gekoppeld haalt het weg', async ({ page }) => {
    await S421.boot(page);
    const r = await page.evaluate(() => {
      SET.psd2Accounts = { psd2_aaaa1111: { label: 'Main 1111', bank: 'N26', exp: '2027-01-01' } };
      SET.psd2Diag = { psd2_aaaa1111: { op: '2026-10-23', balGeland: true, txN: 3, txBankId: 'transaction_id 0/77 (0 uniek) · entry_reference 77/77 (77 uniek) · zelfde Minder-id met een andere bank-id: 0' },
        psd2_94a07621: { op: '2026-09-28', balGeland: false, balFout: 'EXPIRED_SESSION', txFout: 'EXPIRED_SESSION' } };
      const w = psd2DiagOpruim(), act = Object.keys(psd2DiagActief()), fal = psd2Falend().map((x) => x.acc || x), v = SET.psd2Diag.psd2_94a07621.vervangen;
      const L = diagRekeningen().join('\n');
      SET.psd2Accounts.psd2_94a07621 = { label: 'Oud', bank: 'ABN AMRO', exp: '2027-01-01' }; psd2DiagOpruim();
      return { w, act, fal, v, L, terug: SET.psd2Diag.psd2_94a07621.vervangen, act2: Object.keys(psd2DiagActief()).sort() };
    });
    expect(r.w).toBe(true);
    expect(r.v).toBe('2026-10-10');
    expect(r.act).toEqual(['psd2_aaaa1111']);
    expect(JSON.stringify(r.fal)).not.toContain('94a07621');
    expect(r.L).toMatch(/psd2_94a07621 {3}laatste sync 2026-09-28 · VERVANGEN sinds 2026-10-10 \(niet meer gekoppeld; telt niet mee in de versheid, v456\)/);
    expect(r.L).toContain('entry_reference (v456): gevuld bij 1 van 1 gemeten rekening(en): psd2_aaaa1111 77/77');
    expect(r.L).toContain('txBankId=transaction_id 0/77 (0 uniek) · entry_reference 77/77 (77 uniek) · zelfde Minder-id met een andere bank-id: 0');
    expect(r.terug).toBeUndefined();
    expect(r.act2).toEqual(['psd2_94a07621', 'psd2_aaaa1111']);
  });

  test('b. nergens gevuld: blok 8 zegt het met het aantal per rekening; de boot, een koppeling en ontkoppelen ruimen op', async ({ page }) => {
    await S421.boot(page);
    const r = await page.evaluate(() => { SET.psd2Accounts = { psd2_b: { label: 'B', bank: 'ABN AMRO' } };
      SET.psd2Diag = { psd2_b: { op: '2026-10-22', balGeland: true, txBankId: 'transaction_id 0/12 (0 uniek) · entry_reference 0/12 (0 uniek) · zelfde Minder-id met een andere bank-id: 0' }, psd2_oud: { op: '2026-09-01', balGeland: false } };
      psd2DiagOpruim(); return { v: SET.psd2Diag.psd2_oud.vervangen, L: diagRekeningen().join('\n') }; });
    expect(r.v).toBeTruthy();
    expect(r.L).toContain('entry_reference (v456): nergens gevuld (0 bij alle 1 gemeten rekeningen: psd2_b 0/12)');
    /* de drie plekken die opruimen: de boot, het einde van een koppeling en ontkoppelen */
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');
    expect(src).toMatch(/try\{ if\(psd2DiagOpruim\(\)\) localStorage\.setItem\('minder_set'/);
    expect(src).toContain("SET.psd2Accounts=meta; SET.psd2LastSync=Date.now(); try{ psd2DiagOpruim(); }catch(_){}");
    expect(src).toContain("SET.psd2Accounts={}; SET.psd2LastSync=0; try{ psd2DiagOpruim(); }catch(_){} save();");
  });
});

async function bootBenoem(page) {
  await S421.boot(page);
  return page.evaluate(({ MAIN }) => { const t = { id: 'v456b', date: '2026-09-18', amount: -484, acc: MAIN, name: 'Gemeente Utrecht', desc: 'GEMEENTE UTRECHT KENMERK 7731200918', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); OVR[t.id] = 'onvoorzien'; TX.push(t); TX.sort((a, c) => a.date.localeCompare(c.date)); applyOwnAccounts(); buildAccMeta(); save(); render(); return t.id; }, { MAIN: S421.MAIN });
}

test.describe('5 · de benoem-vraag: ook "Hoort in een potje"', () => {
  test('a. de optie staat er, eerst het potje, dan telt de boeking in dat potje; een vraag per boeking; Vergeten zet terug', async ({ page }) => {
    const id = await bootBenoem(page);
    const opties = await page.evaluate((id) => { const Q = gegevensVragen().filter((q) => q.t && q.t.id === id); openGegevensVragen('benoemtx|' + id);
      const e = document.querySelector(`[data-gegevensvraag="benoem"][data-tx="${id}"]`); return { n: Q.length, soort: Q[0] && Q[0].soort, o: e ? [...e.querySelectorAll('[data-benoemoptie]')].map((x) => x.innerText) : [] }; }, id);
    expect(opties.n).toBe(1);
    expect(opties.soort).toBe('benoem');
    expect(opties.o).toContain('Hoort in een potje');
    await page.locator(`[data-tx="${id}"] [data-benoemoptie="__potje"]`).click();
    const pot = await page.evaluate((id) => [...document.querySelectorAll(`[data-tx="${id}"] [data-benoempotje]`)].map((x) => x.dataset.benoempotje), id);
    expect(pot.length).toBeGreaterThan(0);
    expect(pot).toContain('belasting');
    const voor = await page.evaluate(() => Math.round(catSpendMap('2026-09').belasting || 0));
    await page.locator(`[data-tx="${id}"] [data-benoempotje="belasting"]`).click();
    const na = await page.evaluate((id) => { const t = TX.find((x) => x.id === id), K = Object.entries(SET.kennis).find(([k, E]) => E.soort === 'benoem' && E.tx && E.tx[id]);
      return { cat: catOf(t), bel: Math.round(catSpendMap('2026-09').belasting || 0), vraag: gegevensVragen().filter((q) => q.t && q.t.id === id).length, k: K && K[0], E: K && K[1] }; }, id);
    expect(na.cat).toBe('belasting');
    expect(na.bel).toBe(voor + 484);
    expect(na.vraag).toBe(0);
    expect(na.E).toMatchObject({ aard: 'potje', potje: 'belasting', label: 'In Belasting & boetes', bron: 'jij' });
    expect(na.E.effect.ovr[id]).toBe('onvoorzien');
    const terug = await page.evaluate(({ id, k }) => { kennisVergeetKern('k:' + k); applyOwnAccounts(); save(); return catOf(TX.find((x) => x.id === id)); }, { id, k: na.k });
    expect(terug).toBe('onvoorzien');
  });

  test('b. laag a (zeker uit de naam) heeft de optie ook', async ({ page }) => {
    await S421.boot(page);
    const r = await page.evaluate(({ MAIN }) => { const t = { id: 'v456c', date: '2026-09-25', amount: -150, acc: MAIN, name: 'CJIB Verkeersboetes', desc: 'CJIB VERKEERSBOETES 4410', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); OVR[t.id] = 'onvoorzien'; TX.push(t); applyOwnAccounts(); save(); openGegevensVragen('benoemtx|' + t.id);
      const e = document.querySelector('[data-gegevensvraag="benoem"][data-tx="v456c"]') || document.querySelector(`[data-gegevensvraag="benoem"][data-tx="${t.id}"]`);
      return { laag: e && e.dataset.benoemlaag, o: e ? [...e.querySelectorAll('[data-benoemoptie]')].map((x) => x.innerText) : [] }; }, { MAIN: S421.MAIN });
    expect(r.laag).toBe('a');
    expect(r.o).toEqual(['Hoort in een potje']);
  });
});

test.describe('6 · CLAUDE.md legt de drie soorten vast', () => {
  test('a. soort 1, 2 en 3 staan er met hun betekenis, en wat vastligt voor deel B', async () => {
    const md = require('fs').readFileSync(require('path').join(__dirname, '..', 'CLAUDE.md'), 'utf8');
    const r = md.slice(md.indexOf('- **v456:'), md.indexOf('- **v455:'));
    expect(r).toContain('SOORT 1 = een rekenfout met een bekend\n  antwoord, Minder herstelt zichtbaar');
    expect(r).toMatch(/SOORT 2 = twee berekeningen verschillen, alleen in Diagnose, en de keuzes die eraan hangen wachten/);
    expect(r).toMatch(/SOORT 3 = alleen jij weet het, een vraag in "Kloppen mijn gegevens\?"/);
    expect(r).toMatch(/de omzetting van ids vervalt \(geen bank levert een\s+transaction_id: 0\/77 bij ABN, 0\/198 bij N26\)/);
    expect(r).toMatch(/N26 levert op alle 5 rekeningen alleen XPCD, dus voor N26 geldt "een sync verschil\s+toegestaan, na 3 dagen soort 2"/);
  });
});
