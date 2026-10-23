/* v453 (gevraagd door de gebruiker, antwoord op v452; nog geen deel B). Op v421-stand (10 oktober 2026, GECONSTRUEERD: de boekingen
   van het toestel staan alleen daar) en voor Contant op v448-stand.
   1. Eenmalig is een vlag, geen categorie: het label eenmalig uit Wat Minder van jou weet zet een boeking buiten vast en potjes met geen
      norm, ongeacht de categorie (geenNormTx). Lausa Eriksson blijft in Zorg & apotheek, Gemeente EUR 484 volgt via zijn eigen label.
   2. Blok 20: wat er op de termijn van de reservering Laserbehandeling gereserveerd staat tegen EUR 159.
   3. Blok 8: geen "bestaat niet" meer, maar wat SET.psd2Diag per rekening bewaart, met de foutstatus.
   4. Contant: maandVooruit() leest de forecast van het potje Contant uit contantMaanden(), met de controle in blok 20.
   5. Een blok dat alleen leest: heen en terug op dezelfde rekening met je eigen naam, per maand aantal en som. */
const { test, expect } = require('@playwright/test');
const S = require('./v421-stand');
const S8 = require('./v448-stand');

async function boot(page) {
  await S.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v453' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    add('2026-10-09', -159, 'Lausa Eriksson via Tikki', 'LAUSA ERIKSSON VIA TIKKIE BETAALVERZOEK', 'zorg');
    add('2026-10-04', -484, 'Gemeente Amsterdam', 'GEMEENTE AMSTERDAM WEGSLEPEN', 'belasting');
    add('2026-10-06', -120, 'Albert Heijn', 'ALBERT HEIJN 1234', 'boodschappen');
    add('2026-10-07', -60, 'Iets onvoorziens', 'IETS ONVOORZIENS', Object.keys(CATS).find(k => geenNorm(k) && k !== CONTANT_CAT && CATS[k].type === 'expense'));
    SET.budgets = Object.assign({}, SET.budgets, { zorg: Math.max(+(SET.budgets || {}).zorg || 0, 200), belasting: Math.max(+(SET.budgets || {}).belasting || 0, 600) });
    TX.sort((a, c) => a.date.localeCompare(c.date));
    applyOwnAccounts(); buildAccMeta(); kennisZaai(); save(); render();
  }, { MAIN: S.MAIN });
}
const id = (page, n, a) => page.evaluate(([n, a]) => TX.find(t => t.name === n && t.amount === a).id, [n, a]);
const b20 = page => page.evaluate(() => diagSalarisVerdeling());

test.describe('1 · eenmalig is een vlag, geen categorie', () => {
  test('a. Lausa blijft in Zorg & apotheek en valt door haar label buiten vast en potjes; Gemeente EUR 484 via zijn eigen label', async ({ page }) => {
    await boot(page);
    const [L, G] = [await id(page, 'Lausa Eriksson via Tikki', -159), await id(page, 'Gemeente Amsterdam', -484)];
    const r = await page.evaluate(([L, G]) => { const l = TX.find(t => t.id === L), g = TX.find(t => t.id === G), B = maandPotjes('2026-10').B, cs = catSpendMap('2026-10'), T = totals('2026-10');
      return { cat: [catOf(l), catOf(g)], ovr: OVR[L], label: [eenmaligLabel(l), eenmaligLabel(g)], gn: [geenNormTx(l), geenNormTx(g)], cgn: [geenNorm(catOf(l)), geenNorm(catOf(g))],
        groep: [diagGroep(l, B), diagGroep(g, B)], inZorg: TX.filter(t => catOf(t) === 'zorg' && t.date.startsWith('2026-10') && !eenmaligLabel(t)).reduce((a, t) => a - t.amount, 0), cs: [cs.zorg || 0, cs.belasting || 0],
        bel: TX.filter(t => catOf(t) === 'belasting' && t.date.startsWith('2026-10') && !eenmaligLabel(t)).reduce((a, t) => a - t.amount, 0), bN: T.buitenNorm, uitRes: [uitReserveringBedrag(l), uitReserveringBedrag(g)] }; }, [L, G]);
    /* de invoer draagt het geval: beide in een categorie MET norm (en met een potje), dus de categorie zet ze er niet buiten */
    expect(r.cat).toEqual(['zorg', 'belasting']);
    expect(r.cgn).toEqual([false, false]);
    expect(r.ovr).toBe('zorg');
    expect(r.label).toEqual(['Laserbehandeling · eenmalig (door jou)', 'Boete of wegslepen · eenmalig (door jou)']);
    expect(r.gn).toEqual([true, true]);
    expect(r.groep).toEqual(['buiten vast en potjes', 'buiten vast en potjes']);
    expect(Math.round(r.cs[0])).toBe(Math.round(r.inZorg));
    expect(Math.round(r.cs[1])).toBe(Math.round(r.bel));
    expect(r.bN).toBeGreaterThanOrEqual(159 + 484 + 60);
    expect(r.uitRes).toEqual([0, 0]);
  });

  test('b. elke boeking met het label, ongeacht de categorie, en zonder label telt hij weer; een gelijkende betaling van dezelfde partij krijgt het label niet', async ({ page }) => {
    await boot(page);
    const A = await id(page, 'Albert Heijn', -120);
    const r = await page.evaluate(({ A, MAIN }) => { const t = TX.find(x => x.id === A), voor = [geenNormTx(t), Math.round(catSpendMap('2026-10').boodschappen || 0)];
      SET.eenmaligOk = Object.assign({}, SET.eenmaligOk, { [A]: '2026-10-10' }); save();
      const met = [eenmaligLabel(t), geenNormTx(t), Math.round(catSpendMap('2026-10').boodschappen || 0), diagGroep(t, maandPotjes('2026-10').B)];
      delete SET.eenmaligOk[A]; save(); const zonder = [geenNormTx(t), Math.round(catSpendMap('2026-10').boodschappen || 0)];
      const n = { id: 'v453nov', date: '2026-11-12', amount: -159, acc: MAIN, name: 'Lausa Eriksson via Tikki', desc: 'LAUSA ERIKSSON VIA TIKKIE BETAALVERZOEK', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(n); OVR[n.id] = 'zorg'; TX.push(n); save();
      return { voor, met, zonder, nov: [eenmaligLabel(n), geenNormTx(n), uitReserveringBedrag(n)] }; }, { A, MAIN: S.MAIN });
    expect(r.voor[0]).toBe(false);
    expect(r.met[0]).toBe('Klopt, eenmalig (door jou)');
    expect(r.met[1]).toBe(true);
    expect(r.voor[1] - r.met[2]).toBe(120);
    expect(r.met[3]).toBe('buiten vast en potjes');
    expect(r.zonder).toEqual(r.voor);
    expect(r.nov).toEqual(['', false, 159]);
  });

  test('c. blok 20 GEEN NORM IN OKT* toont per boeking de categorie en het label waardoor hij erin staat', async ({ page }) => {
    await boot(page);
    const gn = (await b20(page)).find(l => /GEEN NORM IN OKT/.test(l)) || '';
    expect(gn).toMatch(/09-10 159\.00 Lausa Eriksson via Tikki · categorie Zorg & apotheek · label: Laserbehandeling · eenmalig \(door jou\)/);
    expect(gn).toMatch(/04-10 484\.00 Gemeente · categorie Belasting & boetes · label: Boete of wegslepen · eenmalig \(door jou\)/);
    expect(gn).toMatch(/07-10 60\.00 Iets onvoorziens · categorie [^·]+ · categorie zonder norm/);
    expect(gn).not.toMatch(/Albert Heijn/);
  });
});

test.describe('2 · de reservering Laserbehandeling op haar termijn', () => {
  test('d. blok 20 meldt wat er op de termijn (apr 2027) gereserveerd staat tegen EUR 159', async ({ page }) => {
    await boot(page);
    const L = await b20(page), i = L.findIndex(r => /RESERVERINGEN MET EEN PARTIJ/.test(r));
    expect(L[i + 1]).toMatch(/Laserbehandeling · partij Lausa Eriksson/);
    expect(L[i + 2]).toBe('      op de termijn (apr 2027) gereserveerd: 6 maanden (nov 2026 t/m apr 2027) x 26.50 = 159.00 tegen 159.00: gedekt');
    const O = await page.evaluate(() => [resOpTermijn({ bedrag: 159, intervalM: 6, vanaf: '2026-11', vervalmaand: '2027-01' }), resOpTermijn({ bedrag: 159, intervalM: 6, vervalmaand: '2027-04' })]);
    expect([O[0].n, Math.round(O[0].op * 100) / 100]).toEqual([3, 79.5]);
    expect(O[1]).toBeNull();
  });
});

test.describe('3 · blok 8 toont wat er per rekening bewaard wordt', () => {
  test('e. geen "bestaat niet", wel de laatste sync, de velden per groep en de foutstatus van de bank', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const leeg = diagRekeningen().join('\n');
      psd2DiagZet('NL00TEST0001', { txN: 12, txFout: '', balUit: 1, balGeland: false, balFout: 'EXPIRED_SESSION', pendN: 0, pendFout: '' });
      return { leeg, vol: diagRekeningen().join('\n') }; });
    expect(r.leeg).not.toMatch(/bestaat niet, er is geen veld/);
    expect(r.leeg).toMatch(/bewaard per rekening \(SET\.psd2Diag, v279\/v298\): nog niets bewaard/);
    expect(r.vol).not.toMatch(/bestaat niet, er is geen veld/);
    expect(r.vol).toMatch(/bewaard per rekening \(SET\.psd2Diag, v279\/v298\): 1 rekening\(en\)/);
    expect(r.vol).toMatch(/NL00TEST0001   laatste sync \d{4}-\d{2}-\d{2} \d{2}:\d{2}/);
    expect(r.vol).toMatch(/saldo: .*balGeland=false.* · FOUTSTATUS balFout=EXPIRED_SESSION/);
    expect(r.vol).toMatch(/transactie: txN=12 \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}\).* · foutstatus: geen/);
  });
});

test.describe('4 · Contant: een berekening', () => {
  test('f. de forecast van het potje Contant in maandVooruit is de uitkomst van contantMaanden, en blok 20 zegt klopt', async ({ page }) => {
    await S8.boot(page);
    /* v456 punt 1: in de maand waarin het potje ontstaat telt Contant niet mee; hier stond het al in het vastgelegde budget van de 1e */
    await page.evaluate(() => { const ym = thisYM(); SET.maandBudget[ym].potjes[CONTANT_CAT] = 400; SET.maandBudget[ym].totaal += 400; save(); });
    const r = await page.evaluate(() => { const V = maandVooruit(), c = V.potjes.find(x => x.k === CONTANT_CAT), cur = thisYM(), CM = contantMaanden([valtOpYmPlus(cur, -1), cur]);
      const L = diagSalarisVerdeling(); return { eind: c ? c.eindR : null, uitkomst: CM[CM.length - 1].uitkomst, bron: V.contant && V.contant.bron, regel: L.find(l => /CONTROLE Contant/.test(l)) || '', patroon: c ? c.uit + Math.max(+V.restCat[CONTANT_CAT] || 0, 0) : null }; });
    /* de invoer draagt het geval: het oude patroon geeft een ander eind dan contantMaanden */
    expect(Math.abs(r.patroon - r.uitkomst)).toBeGreaterThan(1);
    expect(r.eind).toBeCloseTo(r.uitkomst, 2);
    expect(r.bron).toBe('contantMaanden');
    expect(r.regel).toMatch(/CONTROLE Contant okt \(v453\): volgens maandVooruit [\d.-]+ = contantMaanden [\d.-]+ → klopt/);
  });
});

test.describe('5 · heen en terug op dezelfde rekening met je eigen naam', () => {
  test('g. per maand het aantal paren en de som; zonder eigen naam, op een andere dag of een andere rekening telt het niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(({ MAIN }) => { const voor = JSON.stringify(SET), add = (d, a, n, acc) => { const t = { id: 'v453p' + d + n + a + (acc || ''), date: d, amount: a, acc: acc || MAIN, name: n, desc: n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); };
      add('2026-09-05', -80, 'From Main to Buffer'); add('2026-09-05', 80, 'Ve Sumter');
      add('2026-09-06', -30, 'Bakker Jansen'); add('2026-09-06', 30, 'Bakker Jansen');
      add('2026-09-07', -20, 'Ve Sumter'); add('2026-09-08', 20, 'Ve Sumter');
      add('2026-09-09', -40, 'Ve Sumter'); add('2026-09-09', 40, 'Ve Sumter', 'NL99ANDERS0001');
      save(); const L = diagEigenParen(); return { L, schoon: JSON.stringify(SET) === voor || true }; }, { MAIN: S.MAIN });
    const j = r.L.join('\n');
    expect(j).toMatch(/HEEN EN TERUG OP DEZELFDE REKENING MET JE EIGEN NAAM \(v453\/v456\)/);
    expect(j).toMatch(/\n      2026-06  1 · 50\.00/);   // de stand van het toestel: 16-06 -50 From Main to Zakgeld en +50 Ve Sumter
    expect(j).toMatch(/\n      2026-09  1 · 80\.00/);
    expect(j).toMatch(/eigen naam in de bijschrijving/);
    expect(j).not.toMatch(/Bakker Jansen/);
  });

  test('h. het blok leest alleen en staat in DIAG_BLOKKEN', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { let w = 0; const o = localStorage.setItem.bind(localStorage); localStorage.setItem = (...a) => { w++; return o(...a); };
      const s = JSON.stringify(SET); diagEigenParen(); localStorage.setItem = o; return { w, gelijk: JSON.stringify(SET) === s, inReg: DIAG_BLOKKEN.some(b => b.lees === diagEigenParen) }; });
    expect(r).toEqual({ w: 0, gelijk: true, inReg: true });
  });
});
