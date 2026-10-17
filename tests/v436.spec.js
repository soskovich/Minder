/* v436: VIJF REPARATIES NA GEBRUIK OP HET TOESTEL (17 okt). Op v436-stand (v432-stand met de wijzigingen van oktober: Shurgard
   geaccepteerd +77 in Huur, Verzekeringen herzien -37; vastgelegd EUR 3.375 op 1 okt, budget van nu EUR 3.415).
   1. het maandbudget ligt vast per maand; 2. Deze week per potje, de keuze een keer; 3. patronen als label bij de signalen;
   4. tekort-waarschuwingen alleen na Akkoord, in een kaart; 5. de salariskaart tegen het vastgelegde budget.
   GECONSTRUEERD EN NIET GEMETEN: de boekingen en logs van het toestel staan alleen daar. */
const { test, expect } = require('@playwright/test');
const S = require('./v436-stand');
const { MAIN, LEEF } = S;
const boot = async (page, o) => { await page.setViewportSize({ width: 390, height: 844 }); await S.boot(page, o); };
const add = (page, rows) => page.evaluate(rows => { for (const [acc, d, a, n, ds, cat] of rows) { const t = { id: 'v436' + acc.slice(-4) + d + n + a, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; } TX.sort((a, b) => a.date.localeCompare(b.date)); window._rekV = null; save(); }, rows);
const wekelijks = page => page.evaluate(() => { SET.potWekelijks = { boodschappen: true, vices: true, uiteten: true }; SET.wekGekozen = { op: '2026-10-10' }; SET.weekStand = null; save(); });

test.describe('v436 · 1. het maandbudget ligt vast per maand', () => {
  test('1a. EUR 3.375 op elk scherm: V.budget, Budget-meter, Inzichten, de brug, blok 20 punt 7 en de salariskaart; EUR 3.135 en EUR 3.415 nergens als budget', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); return { V: V.budget, nu: V.budgetNu, wijz: V.wijz, meter: gripMeterBudget(V).budget, ins: insMaandStand().Bvast, brug: gripGroepBrug(V).budget, p7: Math.round(maandGroepen(V).g.reduce((a, x) => a + x.b, 0)), sal: salarisTabelData(V).budget, bron: V.maandBudget.bron }; });
    expect(r).toEqual({ V: 3375, nu: 3415, wijz: 40, meter: 3375, ins: 3375, brug: 3375, p7: 3375, sal: 3375, bron: 'herstel' });
    await page.evaluate(() => { go('ins'); renderIns(); });
    const k = await page.locator('#insMaand').innerText();
    expect(k).toMatch(/van €3\.375/);
    expect(k).toMatch(/vast sinds 1 okt/);
    expect(k).toMatch(/waarvan Plan-inleg €280/);
    expect(k).not.toMatch(/3\.135|3\.415/);
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    const g = await page.locator('#gripGroepKaart [data-groepkop]').innerText();
    expect(g).toMatch(/budget €3\.375 \(vast sinds 1 okt\) · waarvan Plan-inleg €280/);
  });
  test('1b. een wijziging halverwege de maand: het maandbudget blijft, de forecast volgt, en vanaf 1 november is het het nieuwe budget', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V0 = maandVooruit(); window._bwKeuze = 'test'; potPlanZet('vices', thisYM(), 120); save(); const V1 = maandVooruit();
      return { b0: V0.budget, b1: V1.budget, nu1: V1.budgetNu, opgeslagen: !!(SET.maandBudget || {})['2026-10'], rij: maandBudgetWijz().rijen.find(x => x.k === 'vices') }; });
    expect(r.b0).toBe(3375); expect(r.b1).toBe(3375); expect(r.nu1).toBe(3515);
    expect(r.opgeslagen).toBe(true);
    expect(r.rij).toMatchObject({ d: 100, keuze: 'test', op: '2026-10-17' });
    /* de maandwissel: het budget van nu wordt het vastgelegde budget van november */
    await page.evaluate(() => { SET.budgetMonth = '2026-10'; save(); });
    await page.clock.setFixedTime(new Date('2026-11-02T12:00:00'));
    await page.reload(); await page.waitForFunction(() => typeof maandVooruit === 'function');
    const n = await page.evaluate(() => ({ nov: SET.maandBudget['2026-11'], okt: SET.maandBudget['2026-10'].totaal, w: maandBudgetWijz('2026-11').tot }));
    expect(n.okt).toBe(3375);
    expect(n.nov).toMatchObject({ totaal: 3515, inleg: 280, bron: 'maandwissel', op: '2026-11-01' });
    expect(n.w).toBe(0);
  });
  test('1b. het gevolg vóór bevestigen: "deze maand: forecast EUR X → EUR Y · maandbudget EUR B vanaf november", en de simulatie laat niets achter', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const voor = JSON.stringify(SET); const G = budgetWijzGevolg(() => { planInlegVoeg('res', 100); }); return { t: budgetWijzGevolgTekst(G), G, gelijk: JSON.stringify(SET) === voor }; });
    expect(r.gelijk).toBe(true);
    expect(r.G.P1 - r.G.P0).toBe(100);
    expect(r.t).toBe(`deze maand: forecast €${r.G.P0.toLocaleString('nl-NL')} → €${r.G.P1.toLocaleString('nl-NL')} · maandbudget €3.515 vanaf november`);
    /* in de sheet van de inleg in Plan */
    await page.evaluate(() => { openPlanInleg('res'); window._pi.bedrag = 380; renderPlanInleg(); });
    await expect(page.locator('#planInlegSheet [data-budgetgevolg]')).toContainText('vanaf november');
    await expect(page.locator('#planInlegSheet')).not.toContainText('Maandbudget op Grip');
  });
  test('1c. onder budget = vastgelegd - forecast; de brug begint bij het vastgelegde budget en sluit op de forecast', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), M = gripMeterBudget(V), B = gripGroepBrug(V), Z = gripZienBrug(V), D = dezeMaandBrug(V);
      const som = Br => Br.stappen.slice(1, -1).reduce((a, x) => a + x.waarde, Br.stappen[0].waarde);
      return { verschil: M.verschil, P: Math.round(V.projectie), b0: B.stappen[0].waarde, sB: som(B), z0: Z.stappen[0].waarde, sZ: som(Z), zw: (Z.stappen.find(x => x.soort === 'wijz') || {}).waarde, d0: D.stappen[0].waarde, sD: som(D), dw: (D.stappen.find(x => x.soort === 'wijz') || {}).waarde }; });
    expect(r.verschil).toBe(r.P - 3375);
    expect([r.b0, r.z0, r.d0]).toEqual([3375, 3375, 3375]);
    expect([r.sB, r.sZ, r.sD]).toEqual([r.P, r.P, r.P]);
    expect(r.zw).toBe(40); expect(r.dw).toBe(40);
  });
  test('1d. "wijzigingen deze maand (alleen forecast) +EUR 40 ›" op Inzichten en in Begrijpen, en de lijst met datum, keuze, potje, bedrag', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('ins'); renderIns(); });
    await expect(page.locator('#insMaand [data-budgetwijz="40"]')).toContainText('wijzigingen deze maand (alleen forecast)');
    await expect(page.locator('#insMaand [data-insforecast]')).toContainText('Forecast eind oktober');
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    await page.locator('#gripGroepKaart [data-budgetwijz="40"]').click();
    const L = await page.locator('#budgetWijzSheet [data-budgetwijzrij]').evaluateAll(es => es.map(e => [e.dataset.budgetwijzrij, +e.dataset.v, e.innerText.replace(/\s+/g, ' ')]));
    expect(L).toEqual([['huur', 77, '16 okt · Shurgard geaccepteerd · Huur +€77'], ['verzekering', -37, '16 okt · herzien · Verzekeringen −€37']]);
    await expect(page.locator('#budgetWijzSheet')).toContainText('Het nieuwe budget van €3.415 geldt vanaf 1 november');
    expect(L.reduce((a, x) => a + x[1], 0)).toBe(40);
  });
  test('1e. oktober herstellen: zonder vastlegging is het het budget van nu min de gelogde wijzigingen; bij de boot met logs wordt het opgeslagen', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => [!!(SET.maandBudget || {})['2026-10'], maandBudgetVast().totaal, maandBudgetVast().herstel.length])).toEqual([false, 3375, 2]);
    await page.reload(); await page.waitForFunction(() => typeof maandVooruit === 'function');
    const r = await page.evaluate(() => SET.maandBudget['2026-10']);
    expect(r).toMatchObject({ totaal: 3375, inleg: 280, bron: 'herstel', op: '2026-10-01' });
    expect(r.potjes).toMatchObject({ huur: 700, verzekering: 335, vervoer: 870 });
  });
  test('1e. een stand zonder logs van deze maand: het budget van nu, en de boot slaat niets op', async ({ page }) => {
    await boot(page, { kaal: true });
    expect(await page.evaluate(() => { const V = maandVooruit(); return [V.budget, V.budgetNu, V.wijz, !!(SET.maandBudget || {})[thisYM()]]; })).toEqual([3605, 3605, 0, false]);
  });
  test('1f. blok 20 MAANDBUDGET: vastgelegd met datum, de wijzigingen, de forecast, het budget vanaf november en twee controles die sluiten', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagSalarisVerdeling().join('\n'));
    expect(t).toMatch(/MAANDBUDGET \(v436\)/);
    expect(t).toMatch(/vastgelegd €3\.375 op 01-10 \(herstel/);
    expect(t).toMatch(/16-10 · Shurgard geaccepteerd · Huur \+€77/);
    expect(t).toMatch(/budget van nu €3\.415 = vastgelegd €3\.375 \+ wijzigingen €40: klopt · dit wordt het budget vanaf 1 november/);
    expect(t).toMatch(/CONTROLE maandbudget op alle schermen = vastgelegd €3\.375: .* → klopt/);
    expect(t).toMatch(/CONTROLE onder budget = vastgelegd - forecast: .* → klopt/);
  });
});

test.describe('v436 · 2. Deze week', () => {
  test('2a. de keuze wordt een keer gevraagd: na bevestigen, herladen, een nieuwe dag, een nieuwe week en een nieuw potje komt hij niet terug', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { delete SET.potWekelijks; delete SET.wekGekozen; save(); go('ins'); renderIns(); });
    await expect(page.locator('#insWeek[data-weekkies]')).toBeVisible();
    await page.evaluate(() => { openWekelijks(); for (const k of wekKandidaten()) wekKies(k, ['boodschappen', 'vices', 'uiteten'].includes(k)); wekBevestig(); });
    await expect(page.locator('#insWeek[data-weekkies]')).toHaveCount(0);
    await page.reload(); await page.waitForFunction(() => typeof renderIns === 'function');
    await page.evaluate(() => { go('ins'); renderIns(); });
    await expect(page.locator('#insWeek[data-weekbedrag]')).toBeVisible();
    for (const d of ['2026-10-18T12:00:00', '2026-10-20T12:00:00']) {
      await page.clock.setFixedTime(new Date(d)); await page.reload(); await page.waitForFunction(() => typeof renderIns === 'function');
      await page.evaluate(() => { SET.budgets.cadeaus = 50; CATS.cadeaus = CATS.cadeaus || { name: 'Cadeaus', type: 'expense', color: '#999', icon: '' }; go('ins'); renderIns(); });
      expect(await page.evaluate(() => wekOpen().length)).toBe(0);
      await expect(page.locator('#insWeek[data-weekkies]')).toHaveCount(0);
    }
  });
  test('2a. Instellingen → Potjes: per potje wekelijks of niet, in een tik', async ({ page }) => {
    await boot(page); await wekelijks(page);
    await page.evaluate(() => openSetSub('potjes'));
    await expect(page.locator('#setPotjes')).toContainText('Wekelijkse potjes');
    await page.locator('#setPotjes [data-setwek="overig:ja"]').click();
    expect(await page.evaluate(() => potWekelijks('overig'))).toBe(true);
  });
  test('2b/2c. de tegel "Deze week · 12–18 okt", nog EUR X van EUR Y, dagen te gaan, potjes erover; het overzicht per potje met de boekingen, en nog = som weekbedragen - som uitgegeven', async ({ page }) => {
    await boot(page); await wekelijks(page);
    await add(page, [[LEEF, '2026-10-13', -32, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN', 'boodschappen'], [LEEF, '2026-10-16', -13, 'Best Friends Zuid Oost', 'BEA, BETAALPAS BEST FRIENDS', 'vices'], [LEEF, '2026-10-16', -2.5, 'Best Friends Zuid Oost', 'BEA, BETAALPAS BEST FRIENDS 2', 'vices']]);
    await page.evaluate(() => { SET.weekStand = null; save(); go('ins'); renderIns(); });
    const N = await page.evaluate(() => weekNu(false));
    const T = await page.locator('#insWeek').innerText();
    expect(T).toMatch(/Deze week · 12–18 okt/i);
    expect(T).toMatch(/2 dagen te gaan/);
    expect(T).toMatch(/1 potje erover: Vices/);
    expect(N.nog).toBeCloseTo(N.potjes.reduce((a, x) => a + x.bedrag, 0) - N.potjes.reduce((a, x) => a + x.uit, 0), 2);
    expect(+(await page.locator('#insWeek').getAttribute('data-weeknog'))).toBeCloseTo(N.nog, 2);
    await page.locator('#insWeek').click();
    const P = await page.locator('#weekSheet [data-weekpot]').evaluateAll(es => es.map(e => ({ k: e.dataset.weekpot, b: +e.dataset.weekpotbedrag, u: +e.dataset.weekpotuit, n: e.querySelector('[data-weekpotnog]').innerText, tx: e.querySelectorAll('[data-weektx]').length })));
    const vic = P.find(x => x.k === 'vices'); expect(vic.u).toBe(15.5); expect(vic.tx).toBe(2); expect(vic.n).toMatch(/erover/);
    expect(P.find(x => x.k === 'boodschappen').u).toBe(32);
    await page.locator('#weekSheet [data-weekhoe]').click();
    await expect(page.locator('#weekUitleg')).toContainText('Hoe werkt deze week?');
  });
});

test.describe('v436 · 3. Patronen', () => {
  test('3a. de patroontegels staan niet meer op Inzichten', async ({ page }) => {
    await boot(page); await page.evaluate(() => { go('ins'); renderIns(); });
    await expect(page.locator('#s-ins .ins-pt, #s-ins #insPatronen')).toHaveCount(0);
  });
  test('3b/3d. een signaal draagt het label uit de patroonlogica; wat jij eenmalig noemde is nooit een patroon', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => gripPatroonInfo().lab);
    expect(r.vervoer).toMatchObject({ soort: 'nieuw', t: 'nieuw deze maand' });
    await page.evaluate(() => { const t = TX.find(x => /TANGO/i.test(x.desc || x.name || '') && x.date >= '2026-10-01'); SET.eenmaligOk = Object.assign({}, SET.eenmaligOk, { [t.id]: true }); save(); });
    expect(await page.evaluate(() => insPatronen('alle').filter(p => p.soort === 'nieuw').length)).toBe(0);
    expect(await page.evaluate(() => gripPatroonInfo().lab.vervoer || null)).toBe(null);
  });
});

test.describe('v436 · 4. tekort-waarschuwingen alleen na Akkoord', () => {
  test('4a. zonder Akkoord geen waarschuwing, ook bij een tekort, en de kaart "Je salarisverdeling" met het voorstel', async ({ page }) => {
    await boot(page, { set: { manualBal: { [LEEF]: 1, [MAIN]: 1 } } });
    await page.evaluate(() => { go('maand'); renderMaand(); });
    expect(await page.evaluate(() => salTekortData().length)).toBe(0);
    await expect(page.locator('[data-saltekort]')).toHaveCount(0);
    const k = await page.locator('#salVoorstelKaart').innerText();
    expect(k).toMatch(/Je salarisverdeling/i); expect(k).toMatch(/Voorstel klaar voor ma 26 okt: Salarisrekening €\d/); expect(k).toMatch(/opzij €/);
    await page.locator('#salVoorstelKaart').click();
    await expect(page.locator('[data-salvrek]').first()).toBeVisible();
  });
  test('4b. na Akkoord een kaart met alle rekeningen: "op EUR 0 rond <datum> · nodig EUR X" of "past", en waar het vandaan kan komen', async ({ page }) => {
    await boot(page, { set: { manualBal: { [LEEF]: 1, [MAIN]: 5000 } } });
    await page.evaluate(() => { const P = salPeriode(); SET.salVerdeling = { op: P.cur.start, ym: P.cur.start.slice(0, 7), salYM: P.cur.start.slice(0, 7), rek: { [Object.keys(SET.acctName).find(a => SET.acctName[a] === 'Salarisrekening')]: 1200, [Object.keys(SET.acctName).find(a => SET.acctName[a] === 'Leefgeld')]: 850 }, opzij: 3166, salaris: 5216, start: P.cur.start, eind: P.cur.eind }; save(); go('maand'); renderMaand(); });
    const C = page.locator('#salTekort'); await expect(C).toHaveCount(1);
    await expect(C).toContainText('Leefgeld wordt krap');
    await expect(C.locator(`[data-saltekortrij="${LEEF}"]`)).toContainText('nodig €');
    await expect(C.locator(`[data-saltekortrij="${MAIN}"]`)).toContainText('past');
    await expect(C).toContainText('Minder verplaatst niets');
    await expect(page.locator('#salVoorstelKaart')).toHaveCount(0);
  });
});

test.describe('v436 · 5. de salariskaart tegen het budget', () => {
  test('5a/5d. de tabel: vast, potjes, Plan-inleg, buiten (geen budget), opzij (—); som verschillen = Budget-meter = vastgelegd - forecast', async ({ page }) => {
    await boot(page); await page.evaluate(() => { go('maand'); renderMaand(); });
    const R = await page.locator('#gripSalaris [data-saltabel]').evaluateAll(es => es.map(e => [e.dataset.saltabel, e.dataset.salverschil == null ? null : +e.dataset.salverschil, e.innerText.replace(/\s+/g, ' ')]));
    expect(R.map(x => x[0])).toEqual(['vast', 'potjes', 'inleg', 'buiten', 'opzij']);
    expect(R[3][2]).toMatch(/geen budget/); expect(R[4][2]).toMatch(/—/);
    const som = R.filter(x => x[1] != null).reduce((a, x) => a + x[1], 0);
    const m = await page.evaluate(() => { const V = maandVooruit(); return { v: gripMeterBudget(V).verschil, d: Math.round(V.projectie) - 3375 }; });
    expect(som).toBe(m.v); expect(som).toBe(m.d);
    expect(+(await page.locator('#gripSalaris [data-salsom]').getAttribute('data-salsom'))).toBe(som);
    await expect(page.locator('#gripSalaris [data-salsom]')).toContainText(`samen €${(-som).toLocaleString('nl-NL')} onder budget`);
  });
  test('5b/5c. "waar zit het ›" en een tik op de Budget-meter openen de brug in Begrijpen', async ({ page }) => {
    await boot(page); await page.evaluate(() => { go('maand'); renderMaand(); });
    await page.locator('#gripSalaris [data-salbrug]').click();
    expect(await page.evaluate(() => gripTab())).toBe('begrijpen'); await expect(page.locator('#gripGroepKaart')).toBeVisible();
    await page.evaluate(() => { gripKiesTab('zien'); });
    await page.locator('[data-meter="budget"]').click();
    expect(await page.evaluate(() => gripTab())).toBe('begrijpen'); await expect(page.locator('#gripGroepKaart')).toBeVisible();
  });
});
