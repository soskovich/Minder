/* v447 (gevraagd door de gebruiker): Contant als potje met een portemonnee-stand. GECONSTRUEERDE fixture (v432-stand: salaris op de
   24e, de periode 24 sep t/m 25 okt, Leefgeld met een Geldmaat-opname van EUR 100 per maand van april tot september). De getallen van
   het toestel (opzij ±EUR 1.550, budget EUR 3.170) staan niet in de repo; die verifieert de gebruiker met blok 20 en 23.
   1. Contant is een potje zodra het een budget heeft: geen norm-loze uitgave meer, in blok 20 bij de potjes, uitgegeven per periode =
      opnames + stand begin − stand eind, met de controles.
   2. "Contant gaat meestal naar" in Wat Minder van jou weet: procenten, niets voorgeselecteerd; Begrijpen en blok 20 "incl. contant ≈".
   3. Blok 23: te pinnen = budget × dagen/31 − stand bij moment 2, zonder stand het hele budget, in plaats van de mediaan.
   4. Moment 2: "Hoeveel contant heb je nog?" met Weet ik niet en Later; het antwoord is de stand eind en begin.
   5. Boven het tempo een signaal in Zien met het label nieuw of herhaalt zich.
   6. Blok 20 OPBOUW: budget + Contant = budget vanaf 1 november, los van de keuze over het potje Huur. */
const { test, expect } = require('@playwright/test');
const S432 = require('./v432-stand');

const opname = (LEEF, id, d, a) => ({ id, date: d, amount: a, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
async function boot(page, dag, metPotje) {
  await S432.boot(page, { dag });
  if (metPotje) await page.evaluate(() => { window._bwKeuze = 'door jou'; potPlanZet(CONTANT_CAT, thisYM(), 400); window._bwKeuze = undefined; save(); });
}

test.describe('1 · het potje Contant', () => {
  test('a. zonder budget blijft contant zonder norm; met budget telt het als potje en niet meer onder buiten', async ({ page }) => {
    await boot(page, '2026-10-19');
    const voor = await page.evaluate(() => ({ gn: geenNorm(CONTANT_CAT), sep: totals('2026-09').spendNorm, pot: contantPotje() }));
    await page.evaluate(() => { potPlanZet(CONTANT_CAT, thisYM(), 400); save(); });
    const na = await page.evaluate(() => { const b = diagSalarisVerdeling().join('\n');
      return { gn: geenNorm(CONTANT_CAT), sep: totals('2026-09').spendNorm, pot: contantPotje(), sepCs: catSpendMap('2026-09')[CONTANT_CAT],
        rij: b.split('\n').find((l) => /^  Contant: /.test(l)) || '', kas: b.split('\n').find((l) => /waarvan contant \(opname/.test(l)) || '', b }; });
    expect(voor.gn).toBe(true);
    expect(voor.pot).toBe(false);
    expect(na.gn).toBe(false);
    expect(na.pot).toBe(true);
    /* september: de opname van EUR 100 telt nu in de norm, en in blok 20 als potje Contant in plaats van buiten */
    expect(na.sepCs).toBe(100);
    expect(na.sep - voor.sep).toBe(100);
    expect(na.rij).toContain('sep 100');
    expect(na.kas).toContain('sep 0');
    expect(na.b).toContain('CONTROLE oud "buiten · waarvan contant" = nieuw potje Contant, maanden zonder telling (v447): apr 100 = 100 klopt');
    expect(na.b).not.toMatch(/waarvan contant[^\n]*\n[^\n]*VERSCHIL/);
  });

  test('b. uitgegeven in een periode is opnames + stand begin − stand eind, en de categorie sluit daarop', async ({ page }) => {
    await boot(page, '2026-10-25', true);
    const r = await page.evaluate((LEEF) => {
      const t = { id: 'kas11', date: '2026-10-11', amount: -100, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t);
      /* de eerste telling op 20-09 zoals contantOpslaan() hem boekt: de EUR 50 in je zak kwam uit eerdere opnames en is niet besteed */
      TX.push({ id: 'cash_2026-09-20', date: '2026-09-20', amount: 50, acc: '', name: 'Contant besteed', desc: 'CONTANT TELLING 2026-09-20', typ: '', ref: '', src: 'contant', accName: '', refNums: [], bankRef: 'contant|2026-09-20', ruleCat: 'contant', autoCat: 'contant', vasteCat: 'contant' });
      SET.contant = { stand: 50, datum: '2026-09-20', op: 1 }; SET.contantHist = [{ datum: '2026-09-20', stand: 50, op: 1, bron: 'telling' }]; save();
      contantOpslaan('30', 'test');
      const P = contantPeriode({ start: '2026-09-24', eind: '2026-10-25' }), b = diagSalarisVerdeling().join('\n');
      return { P, rij: b.split('\n').find((l) => /^    24-09 t\/m 25-10/.test(l)) || '', ctrl: b.split('\n').find((l) => /CONTROLE opnames \+ begin/.test(l)) || '' };
    }, S432.LEEF);
    expect(r.P.opn).toBe(100);
    expect(r.P.begin.stand).toBe(50);
    expect(r.P.eindT.stand).toBe(30);
    expect(r.P.uitgegeven).toBe(120);
    expect(r.P.formule).toBe(120);
    expect(r.P.sluit).toBe(true);
    expect(r.rij).toContain('| 100.00 | 50.00 (20-09) | 30.00 (25-10) | 120.00');
    expect(r.ctrl).toContain('klopt in alle');
  });

  test('c. zonder telling is uitgegeven de opnames, en zonder eerdere telling is begin 0', async ({ page }) => {
    await boot(page, '2026-10-19', true);
    const r = await page.evaluate(() => contantPeriode({ start: '2026-08-24', eind: '2026-09-23' }));
    expect(r.begin).toBeNull();
    expect(r.eindT).toBeNull();
    expect(r.opn).toBe(100);
    expect(r.uitgegeven).toBe(100);
    expect(r.sluit).toBe(true);
  });
});

test.describe('2 · contant gaat meestal naar', () => {
  test('d. drie velden zonder voorinvulling, bevestigen pas bij 100%, daarna incl. contant in Begrijpen en blok 20', async ({ page }) => {
    await boot(page, '2026-11-10', true);
    await page.evaluate((LEEF) => { const t = { id: 'kn1', date: '2026-11-03', amount: -200, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); openKennis(); }, S432.LEEF);
    const k = page.locator('[data-kennisgroep="opname"] [data-contantnaarkeuze]');
    await expect(k).toContainText('Contant gaat meestal naar');
    for (const c of ['boodschappen', 'vices', 'uiteten']) await expect(page.locator(`[data-cnin="${c}"]`)).toHaveValue('');
    await expect(page.locator('[data-cnzet]')).toBeDisabled();
    await page.locator('[data-cnin="boodschappen"]').fill('50');
    await page.locator('[data-cnin="vices"]').fill('30');
    await expect(page.locator('[data-cnreden]')).toHaveText('Samen 80%, dat moet 100% zijn');
    await expect(page.locator('[data-cnzet]')).toBeDisabled();
    await page.locator('[data-cnin="uiteten"]').fill('20');
    await expect(page.locator('[data-cnzet]')).toBeEnabled();
    await page.locator('[data-cnzet]').click();
    const r = await page.evaluate(() => { const D = contantNaarDelen(thisYM()); go('maand'); gripKiesTab('begrijpen');
      const kaart = document.querySelector('#gripContantNaar'); const b = diagSalarisVerdeling().join('\n');
      return { E: contantNaarKennis(), D, kaart: kaart ? kaart.innerText : '', b20: b.split('\n').find((l) => /incl\. contant \(v447/.test(l) && /^  nov/.test(l)) || '', cs: catSpendMap(thisYM()) }; });
    expect(r.E).toMatchObject({ soort: 'contantnaar', bron: 'jij', verdeling: { boodschappen: 50, vices: 30, uiteten: 20 } });
    expect(r.D.kas).toBe(200);
    const bo = r.D.rijen.find((x) => x.k === 'boodschappen');
    expect(bo.deel).toBe(100);
    expect(bo.incl).toBeCloseTo((r.cs.boodschappen || 0) + 100, 6);
    expect(r.kaart).toMatch(/contant, ter uitleg/i);
    expect(r.kaart).toContain('incl. contant ≈');
    expect(r.b20).toContain('incl. contant ≈');
    expect(r.b20).toContain('(50%)');
    /* alleen uitleg: het potje Contant draagt het budget, de andere potjes veranderen niet */
    expect(r.cs.contant).toBe(200);
    expect(r.cs.boodschappen || 0).toBe(bo.eigen);
  });
});

test.describe('3 · blok 23: te pinnen uit het budget', () => {
  test('e. zonder stand het hele budget × dagen/31 in plaats van de mediaan; tegenproef zonder potje de mediaan', async ({ page }) => {
    await boot(page, '2026-10-19');
    const zonder = await page.evaluate(() => { const P = rekVoorstel(); return { bron: P.kasBron, kasP: P.kasP, med: P.kasMed }; });
    await page.evaluate(() => { potPlanZet(CONTANT_CAT, thisYM(), 400); save(); });
    const met = await page.evaluate(() => { const P = rekVoorstel(); const leef = P.rek.find((x) => x.naam === 'Leefgeld');
      return { bron: P.kasBron, kasP: P.kasP, dagen: P.dagen, dim: P.dimStart, stand: P.kasStand, kasS: leef.kasS, pot: P.potExp.map((x) => x.k), vp: (maandVooruit().potjes || []).map((x) => x.k), b23: diagRekVerdeling().join('\n') }; });
    expect(zonder.bron).toBe('mediaan');
    expect(zonder.kasP).toBeCloseTo(100 * 29 / 31, 6);
    expect(met.bron).toBe('budget');
    expect([met.dagen, met.dim]).toEqual([29, 31]);
    expect(met.stand).toBeNull();
    expect(met.kasP).toBe(374.19);
    expect(met.kasS).toBeCloseTo(374.19, 2);
    /* het potje Contant staat in maandVooruit bij de potjes, maar in het voorstel alleen als te pinnen (niet twee keer) */
    expect(met.vp).toContain('contant');
    expect(met.pot).not.toContain('contant');
    expect(met.b23).toContain('te pinnen = potje Contant 400 × 29/31 − stand portemonnee bij moment 2 onbekend (0, het hele budget); v447, in plaats van de mediaan 100');
  });
});

test.describe('4 · de vraag bij moment 2', () => {
  test('f. niet voor de laatste dag; op 25-10 in Terugblik, leeg, en het antwoord wordt de stand die blok 23 aftrekt', async ({ page }) => {
    await boot(page, '2026-10-24', true);
    expect(await page.evaluate(() => kasVraag())).toBeNull();
    await boot(page, '2026-10-25', true);
    await page.evaluate(() => { go('maand'); gripKiesTab('terugblik'); });
    const kaart = page.locator('#kasVraag');
    await expect(kaart).toContainText('Hoeveel contant heb je nog?');
    await expect(page.locator('[data-kasvraagin]')).toHaveValue('');
    expect(await page.locator('[data-kasvraagin]').getAttribute('inputmode')).toBe('decimal');
    await expect(kaart.locator('[data-kasvraagweetniet]')).toHaveText('Weet ik niet');
    await expect(kaart.locator('[data-kasvraaglater]')).toHaveText('Later');
    await page.locator('[data-kasvraagin]').fill('30,50');
    await page.locator('[data-kasvraagzet]').click();
    const r = await page.evaluate(() => { const P = rekVoorstel(); return { M: SET.kasMoment['2026-09-24'], T: contantTelling(), H: contantStanden().slice(-1)[0], kasP: P.kasP, stand: P.kasStand, vraag: kasVraag(),
      volgBegin: contantPeriode({ start: '2026-10-26', eind: '2026-11-23' }).begin }; });
    expect(r.M).toMatchObject({ keuze: 'stand', stand: 30.5 });
    expect(r.T.stand).toBe(30.5);
    expect(r.H).toMatchObject({ datum: '2026-10-25', stand: 30.5, bron: 'moment2' });
    expect(r.volgBegin.stand).toBe(30.5);
    expect(r.stand).toBe(30.5);
    expect(r.kasP).toBe(343.69);
    expect(r.vraag).toBeNull();
  });

  test('g. Weet ik niet: geen stand en het hele budget; Later: vandaag weg, morgen terug', async ({ page }) => {
    await boot(page, '2026-10-25', true);
    const r = await page.evaluate(() => { kasVraagZet('weetniet'); const P = rekVoorstel(); return { M: SET.kasMoment['2026-09-24'], kasP: P.kasP, T: contantTelling(), vraag: kasVraag() }; });
    expect(r.M.keuze).toBe('weetniet');
    expect(r.T).toBeNull();
    expect(r.kasP).toBe(374.19);
    expect(r.vraag).toBeNull();
    const l = await page.evaluate(() => { delete SET.kasMoment; kasVraagZet('later'); return { M: SET.kasMoment['2026-09-24'], vraag: kasVraag() }; });
    expect(l.M).toMatchObject({ keuze: 'later', dag: '2026-10-25' });
    expect(l.vraag).toBeNull();
    const morgen = await page.evaluate(() => { SET.kasMoment['2026-09-24'].dag = '2026-10-24'; return !!kasVraag(); });
    expect(morgen).toBe(true);
  });
});

test.describe('5 · het signaal', () => {
  test('h. boven het tempo een signaal met het label nieuw; onder het tempo niets; met de maand ervoor erboven herhaalt zich', async ({ page }) => {
    await boot(page, '2026-11-10', true);
    const onder = await page.evaluate((LEEF) => { const t = { id: 'kt1', date: '2026-11-03', amount: -100, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save();
      return { kt: kasTempo(), sym: gripCyclus().sym.some((s) => s.id === 'sig:contant') }; }, S432.LEEF);
    expect(onder.kt.boven).toBe(false);
    expect(onder.sym).toBe(false);
    const boven = await page.evaluate((LEEF) => { const t = { id: 'kt2', date: '2026-11-08', amount: -200, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save();
      go('maand'); const e = document.querySelector('#gripSignalen [data-signaal="sig:contant"]'); return { kt: kasTempo(), t: e ? e.innerText : '' }; }, S432.LEEF);
    expect(boven.kt.uit).toBe(300);
    expect(Math.round(boven.kt.tempo)).toBe(133);
    expect(boven.kt.boven).toBe(true);
    expect(boven.t).toContain('Contant boven je tempo');
    expect(boven.t).toContain('nieuw deze maand');
    const herh = await page.evaluate((LEEF) => { const t = { id: 'kt3', date: '2026-10-12', amount: -450, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save();
      go('maand'); const e = [...document.querySelectorAll('#gripSignalen [data-signaal]')].find((x) => /^Contant boven je/.test(x.innerText)); return { l: kasTempo().label, t: e ? e.innerText : '', id: e ? e.dataset.signaal : '' }; }, S432.LEEF);
    expect(herh.l).toMatchObject({ soort: 'herhaalt', t: 'herhaalt zich · 2e maand', b: 'okt +€50' });
    /* met de maand ervoor erboven neemt het bestaande patroon "boven je potje" het over (een signaal per potje), met zijn label */
    expect(herh.id).toBe('pat:pot:contant');
    expect(herh.t).toContain('herhaalt zich');
  });
});

test.describe('6 · de opbouw en het zaad', () => {
  test('i. blok 20 OPBOUW: budget + Contant = budget vanaf 1 november, en de wijziging staat als door jou', async ({ page }) => {
    await boot(page, '2026-10-19', true);
    const r = await page.evaluate(() => { const L = diagMaandBudget(maandVooruit()).join('\n'), W = maandBudgetWijz(thisYM());
      return { L, W: W.rijen.find((x) => x.k === CONTANT_CAT), vast: W.vast.totaal, nu: W.nu.totaal }; });
    expect(r.W).toMatchObject({ d: 400, keuze: 'door jou' });
    expect(r.nu - r.vast).toBe(400);
    expect(r.L).toContain(`OPBOUW vanaf 1 november met Contant (v447): €${(r.nu - 400).toLocaleString('nl-NL')} + Contant €400 = €${r.nu.toLocaleString('nl-NL')} · los van de keuze over het potje Huur`);
  });

  test('j. het zaad: een keer EUR 400 door jou bij de salarisbron SKF, niet bij een andere bron, en weghalen blijft weg', async ({ page }) => {
    await boot(page, '2026-10-22');
    const r = await page.evaluate(() => {
      const o = {}; kennisZaai(); o.anders = contantPotje();
      for (const t of TX) if (t.amount > 0 && /WERKGEVER/i.test(`${t.name} ${t.desc}`)) { t.name = 'SKF'; t.desc = String(t.desc || '').replace(/WERKGEVER/ig, 'SKF'); }
      TX.forEach(categorize); save();
      kennisZaai(); o.bud = SET.budgets[CONTANT_CAT]; o.log = (SET.budgetWijzLog || []).filter((x) => x.k === CONTANT_CAT).map((x) => ({ keuze: x.keuze, bron: x.bron, naar: x.naar, op: x.op }));
      delete SET.budgets[CONTANT_CAT]; kennisZaai(); o.weg = contantPotje(); return o; });
    expect(r.anders).toBe(false);
    expect(r.bud).toBe(400);
    expect(r.log).toEqual([{ keuze: 'door jou', bron: 'jij', naar: 400, op: '2026-10-20' }]);
    expect(r.weg).toBe(false);
  });
});
