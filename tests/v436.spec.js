/* v436: VIJF REPARATIES NA GEBRUIK OP HET TOESTEL (17 okt). Op v436-stand (v432-stand met de wijzigingen van oktober: Shurgard
   geaccepteerd +77 in Huur, Verzekeringen herzien -37; vastgelegd EUR 3.375 op 1 okt, budget van nu EUR 3.415).
   1. het maandbudget ligt vast per maand; 2. Deze week per potje, de keuze een keer; 3. patronen als label bij de signalen;
   4. tekort-waarschuwingen alleen na Akkoord, in een kaart; 5. de salariskaart tegen het vastgelegde budget.
   GECONSTRUEERD EN NIET GEMETEN: de boekingen en logs van het toestel staan alleen daar. */
const { test, expect } = require('@playwright/test');
const S = require('./v436-stand');
const I = require('./inzichten-stand');
const { pinDatum } = require('./vaste-dag');
const { MAIN, LEEF } = S;
const boot = async (page, o) => { await page.setViewportSize({ width: 390, height: 844 }); await S.boot(page, o); };
const add = (page, rows) => page.evaluate(rows => { for (const [acc, d, a, n, ds, cat] of rows) { const t = { id: 'v436' + acc.slice(-4) + d + n + a, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; } TX.sort((a, b) => a.date.localeCompare(b.date)); window._rekV = null; save(); }, rows);
/* de fixture zet bij elke navigatie zijn localStorage terug (addInitScript); een echte herlaad bewaart wat de app opsloeg */
const herlaad = async page => { const snap = await page.evaluate(() => { save(); return Object.assign({}, localStorage); }); await page.addInitScript(s => { for (const k in s) localStorage.setItem(k, s[k]); }, snap); await page.reload(); await page.waitForFunction(() => typeof maandVooruit === 'function' && TX.length > 0); };
const wekelijks = page => page.evaluate(() => { SET.potWekelijks = { boodschappen: true, vices: true, uiteten: true }; SET.wekGekozen = { op: '2026-10-10' }; SET.weekStand = null; save(); });

test.describe('v436 · 1. het maandbudget ligt vast per maand', () => {
  test('1a. EUR 3.375 op elk scherm: V.budget, Budget-meter, Inzichten, de brug, blok 20 punt 7 en de salariskaart; EUR 3.135 en EUR 3.415 nergens als budget', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); return { V: V.budget, nu: V.budgetNu, wijz: V.wijz, meter: gripMeterBudget(V).budget, ins: insMaandStand().Bvast, brug: gripGroepBrug(V).budget, p7: Math.round(maandGroepen(V).g.reduce((a, x) => a + x.b, 0)), sal: salarisTabelData(V).budget, bron: V.maandBudget.bron }; });
    // v440: de Plan-inleg zit niet meer in het budget; het budget is de som van de potjes (€3.375 − €280 = €3.095)
    expect(r).toEqual({ V: 3095, nu: 3135, wijz: 40, meter: 3095, ins: 3095, brug: 3095, p7: 3095, sal: 3095, bron: 'herstel' });
    await page.evaluate(() => { go('ins'); renderIns(); });
    const k = await page.locator('#insMaand').innerText();
    /* v440 sectie 8: de Inzichten-maandkaart leidt met je POTJES (potjes-uitgave van het potjesdeel), niet meer met het hele
       budget. Het vastgelegde budget €3.095 staat op V.budget, de Budget-meter, de brug, blok 20 en de salariskaart (zie het
       r-object hierboven, ins = insMaandStand().Bvast = 3095); de kaart toont het als "vast sinds 1 okt". */
    expect(k).toMatch(/van €[\d.]+ potjes/);
    expect(k).toMatch(/vast sinds 1 okt/);
    expect(k).not.toMatch(/Plan-inleg/);   // v440: geen Plan-inleg meer in het budget
    expect(k).not.toMatch(/3\.375|3\.415/);
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    const g = await page.locator('#gripGroepKaart [data-groepkop]').innerText();
    expect(g).toMatch(/budget €3\.095 \(vast sinds 1 okt\)/);
    expect(g).not.toMatch(/Plan-inleg/);
  });
  test('1b. een wijziging halverwege de maand: het maandbudget blijft, de forecast volgt, en vanaf 1 november is het het nieuwe budget', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V0 = maandVooruit(); window._bwKeuze = 'test'; potPlanZet('vices', thisYM(), 120); save(); const V1 = maandVooruit();
      return { b0: V0.budget, b1: V1.budget, nu1: V1.budgetNu, opgeslagen: !!(SET.maandBudget || {})['2026-10'], rij: maandBudgetWijz().rijen.find(x => x.k === 'vices') }; });
    expect(r.b0).toBe(3095); expect(r.b1).toBe(3095); expect(r.nu1).toBe(3235);   // v440: zonder de €280 inleg
    expect(r.opgeslagen).toBe(true);
    expect(r.rij).toMatchObject({ d: 100, keuze: 'test', op: '2026-10-17' });
    /* de maandwissel: het budget van nu wordt het vastgelegde budget van november */
    await page.evaluate(() => { SET.budgetMonth = '2026-10'; save(); });
    await pinDatum(page, '2026-11-02');
    await herlaad(page);
    const n = await page.evaluate(() => ({ nov: SET.maandBudget['2026-11'], okt: SET.maandBudget['2026-10'].totaal, w: maandBudgetWijz('2026-11').tot }));
    expect(n.okt).toBe(3095);
    expect(n.nov).toMatchObject({ totaal: 3235, inleg: 0, bron: 'maandwissel', op: '2026-11-01' });   // v440: inleg niet meer in het budget
    expect(n.w).toBe(0);
  });
  /* v440: een reserverings- of beleg-inleg telt niet meer in het maandbudget of de forecast (hij staat los, komt in v441),
     dus deze test over het budget-gevolg van planInlegVoeg('res') is vervallen. Het gevolg vóór bevestigen bij een
     potje-wijziging wordt gedekt door 1b hierboven (potPlanZet). */
  test('1c. onder budget = vastgelegd - forecast; de brug begint bij het vastgelegde budget en sluit op de forecast', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), M = gripMeterBudget(V), B = gripGroepBrug(V), Z = gripZienBrug(V), D = dezeMaandBrug(V);
      const som = Br => Br.stappen.slice(1, -1).reduce((a, x) => a + x.waarde, Br.stappen[0].waarde);
      return { verschil: M.verschil, P: Math.round(V.projectie), b0: B.stappen[0].waarde, sB: som(B), z0: Z.stappen[0].waarde, sZ: som(Z), zw: (Z.stappen.find(x => x.soort === 'wijz') || {}).waarde, d0: D.stappen[0].waarde, sD: som(D), dw: (D.stappen.find(x => x.soort === 'wijz') || {}).waarde }; });
    expect(r.verschil).toBe(r.P - 3095);
    expect([r.b0, r.z0, r.d0]).toEqual([3095, 3095, 3095]);
    expect([r.sB, r.sZ, r.sD]).toEqual([r.P, r.P, r.P]);
    /* v438: geen staaf "wijzigingen" meer; elke groep staat tegen zijn vastgelegde budget en de wijziging zit in zijn forecast */
    expect(r.zw).toBeUndefined(); expect(r.dw).toBeUndefined();
  });
  test('1d. "wijzigingen deze maand (alleen forecast) +EUR 40 ›" in Begrijpen (v439: niet meer op Inzichten), en de lijst met datum, keuze, potje, bedrag', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('ins'); renderIns(); });
    // v439: op Inzichten zijn de Forecast en de wijzigingen weg (gevraagd door de gebruiker); in Begrijpen staat de regel nog
    expect(await page.locator('#insMaand [data-budgetwijz], #insMaand [data-insforecast]').count()).toBe(0);
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    await page.locator('#gripGroepKaart [data-budgetwijz="40"]').click();
    const L = await page.locator('#budgetWijzSheet [data-budgetwijzrij]').evaluateAll(es => es.map(e => [e.dataset.budgetwijzrij, +e.dataset.v, e.innerText.replace(/\s+/g, ' ')]));
    expect(L).toEqual([['huur', 77, '16 okt · Shurgard geaccepteerd · Huur forecast €0 +€77'], ['verzekering', -37, '16 okt · herzien · Verzekeringen forecast €0 −€37']]);   // v438: met het effect op de forecast
    await expect(page.locator('#budgetWijzSheet')).toContainText('Het budget vanaf 1 november is €3.135');
    expect(L.reduce((a, x) => a + x[1], 0)).toBe(40);
  });
  test('1e. oktober herstellen: zonder vastlegging is het het budget van nu min de gelogde wijzigingen; bij de boot met logs wordt het opgeslagen', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => [!!(SET.maandBudget || {})['2026-10'], maandBudgetVast().totaal, maandBudgetVast().herstel.length])).toEqual([false, 3095, 2]);
    await herlaad(page);
    const r = await page.evaluate(() => SET.maandBudget['2026-10']);
    expect(r).toMatchObject({ totaal: 3095, inleg: 0, bron: 'herstel', op: '2026-10-01' });   // v440: inleg niet meer in het budget
    expect(r.potjes).toMatchObject({ huur: 700, verzekering: 335, vervoer: 870 });
  });
  test('1e. een stand zonder logs van deze maand: het budget van nu, en de boot slaat niets op', async ({ page }) => {
    await boot(page, { kaal: true });
    expect(await page.evaluate(() => { const V = maandVooruit(); return [V.budget, V.budgetNu, V.wijz, !!(SET.maandBudget || {})[thisYM()]]; })).toEqual([3325, 3325, 0, false]);   // v440: €3.605 − €280 inleg
  });
  test('1f. blok 20 MAANDBUDGET: vastgelegd met datum, de wijzigingen, de forecast, het budget vanaf november en twee controles die sluiten', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => diagSalarisVerdeling().join('\n'));
    expect(t).toMatch(/MAANDBUDGET \(v436\/v437\/v438\)/);
    expect(t).toMatch(/vastgelegd €3\.095 op 01-10 \(herstel/);
    expect(t).toMatch(/16-10 · Shurgard geaccepteerd · Huur \+€77/);
    expect(t).toMatch(/budget van nu €3\.135 = vastgelegd €3\.095 \+ wijzigingen €40: klopt\n  budget vanaf 1 november: €3\.135 \(gelijk aan het budget van nu\)/);   // v448: een eigen regel uit budgetVanaf
    expect(t).toMatch(/CONTROLE maandbudget op alle schermen = vastgelegd €3\.095: .* → klopt/);
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
    await herlaad(page);
    await page.evaluate(() => { go('ins'); renderIns(); });
    await expect(page.locator('#insWeek[data-weekbedrag]')).toBeVisible();
    for (const d of ['2026-10-18', '2026-10-20']) {
      await pinDatum(page, d); await herlaad(page);
      await page.evaluate(() => { SET.budgets.cadeaus = 50; CATS.cadeaus = CATS.cadeaus || { name: 'Cadeaus', type: 'expense', color: '#999', icon: '' }; go('ins'); renderIns(); });
      expect(await page.evaluate(() => wekOpen().length)).toBe(0);
      await expect(page.locator('#insWeek[data-weekkies]')).toHaveCount(0);
    }
  });
  test('2a. Instellingen → Potjes: per potje wekelijks of niet, in een tik', async ({ page }) => {
    await boot(page); await wekelijks(page);
    await page.evaluate(() => openSetSub('potjes'));
    await expect(page.locator('#setPotjes')).toContainText('Per dag of per keer');   // v495 punt 4: één begrip, de "wekelijks/niet"-lijst heet nu "per dag / per keer"
    await page.locator('#setPotjes [data-potsoortrij="overig"] [data-potsoort="dag"]').click();
    expect(await page.evaluate(() => potWekelijks('overig'))).toBe(true);            // per dag = wekelijks meetellend (dezelfde SET.potWekelijks)
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
  /* 3c, op de stand van Inzichten (die draagt herhaalt, structureel, nieuw en herstelt): herstelt zich is een positief signaal,
     met een groene stip, zonder keuze en zonder "waarom ›", en na GRIP_HERSTEL_DAGEN dagen staat hij onder Afgehandeld. */
  test('3b/3c. Zien: herhaalt draagt "herhaalt zich · Ne maand" met het bedrag; herstelt is groen zonder keuze en gaat na 7 dagen naar Afgehandeld', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => { go('maand'); gripKiesTab('zien'); renderMaand(); });
    const k = await page.evaluate(() => gripPatroonInfo().herstel.map(x => x.k));
    expect(k.length).toBeGreaterThan(0);
    const rij = page.locator(`[data-herstelt="${k[0]}"]`);
    await expect(rij).toHaveCount(1);
    await expect(rij).toContainText('herstelt zich');
    expect(await rij.locator('[data-waarom]').count()).toBe(0);
    expect(await rij.evaluate(e => getComputedStyle(e.querySelector('span span span')).color === (() => { const d = document.createElement('i'); d.style.color = 'var(--green)'; document.body.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })())).toBe(true);
    const lab = await page.evaluate(() => Object.values(gripPatroonInfo().lab).find(x => x.soort === 'herhaalt'));
    expect(lab.t).toMatch(/^herhaalt zich · \d+e maand$/); expect(lab.b).toMatch(/^[a-z]{3} \+€\d+$/);
    /* de eerste dag staat vast (SET.herstelGezien); zeven dagen later is hij afgehandeld */
    const op = await page.evaluate(k => SET.herstelGezien[thisYM()][k], k[0]);
    expect(op).toBe(await page.evaluate(() => vandaagYMD()));
    await page.evaluate(k => { const d = new Date(vandaagYMD() + 'T12:00'); d.setDate(d.getDate() - GRIP_HERSTEL_DAGEN); SET.herstelGezien[thisYM()][k] = ymdVan(d); save(); renderMaand(); }, k[0]);
    await expect(page.locator(`[data-herstelt="${k[0]}"]`)).toHaveCount(0);
    await page.evaluate(() => gripAfToggle());
    await expect(page.locator(`[data-afgehandeldrij="herstelt:${k[0]}"]`)).toContainText('herstelt zich sinds');
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
  test('4b. na Akkoord een pop-up (niet op Zien) met alle rekeningen: v481 "tekort EUR X · leeg vanaf <datum>" of "EUR X over", en waar het vandaan kan komen', async ({ page }) => {
    await boot(page, { set: { manualBal: { [LEEF]: 1, [MAIN]: 5000 } } });
    await page.evaluate(() => { const P = salPeriode(); SET.salVerdeling = { op: P.cur.start, ym: P.cur.start.slice(0, 7), salYM: P.cur.start.slice(0, 7), rek: { [Object.keys(SET.acctName).find(a => SET.acctName[a] === 'Salarisrekening')]: 1200, [Object.keys(SET.acctName).find(a => SET.acctName[a] === 'Leefgeld')]: 850 }, opzij: 3166, salaris: 5216, start: P.cur.start, eind: P.cur.eind }; save(); go('maand'); renderMaand(); });
    /* v479: niet meer op Zien, wel in de pop-up */
    expect(await page.evaluate(() => document.querySelectorAll('#gripInhoud [data-saltekort]').length)).toBe(0);
    await page.evaluate(() => { try { closeSheet(); } catch (_) {} openKrapPopup(); });
    const C = page.locator('#salTekort'); await expect(C).toHaveCount(1);
    await expect(C).toContainText('Leefgeld wordt krap');
    await expect(C.locator(`[data-saltekortrij="${LEEF}"]`)).toContainText('tekort €');   // v481: tekort i.p.v. "nodig"
    await expect(C.locator(`[data-saltekortrij="${MAIN}"]`)).toContainText('over');       // v481: een rekening die past toont wat overblijft
    await expect(C).toContainText('Minder verplaatst niets');
    await page.evaluate(() => closeSheet());
    await expect(page.locator('#salVoorstelKaart')).toHaveCount(0);
  });
});

test.describe('v436 · 5. de salariskaart tegen het budget', () => {
  test('5a/5d. de stand-tabel op Zien: vast en potjes tegen hun budget; som verschillen = Budget-meter = vastgelegd - forecast', async ({ page }) => {
    await boot(page); await page.evaluate(() => { go('maand'); renderMaand(); });
    /* v440 sectie 3: de salariskaart is vervangen door de stand-tabel (gripZienStand): vast en potjes met budget/verwacht/
       verschil, een totaalrij en een opzij-rij (opzijPeriode). De verschillen van vast en potjes tellen op tot de totaalrij,
       en die is de Budget-meter (vastgelegd − forecast). salarisTabelData blijft de bron van blok 20 (zie v438 1e). */
    const R = await page.locator('#gripZienStand [data-zienrij]').evaluateAll(es => es.map(e => [e.dataset.zienrij, +e.dataset.verschil]));
    expect(R.map(x => x[0])).toEqual(['vast', 'potjes', 'budget']);
    const som = R.filter(x => x[0] !== 'budget').reduce((a, x) => a + x[1], 0);
    const budgetRij = R.find(x => x[0] === 'budget')[1];
    const m = await page.evaluate(() => { const V = maandVooruit(); return { v: gripMeterBudget(V).verschil, d: Math.round(V.projectie) - 3095 }; });
    expect(som).toBe(budgetRij);           // vast + potjes = de totaalrij
    expect(som).toBe(m.v); expect(som).toBe(m.d);
    await expect(page.locator('#gripZienStand [data-zienopzij]')).toContainText('opzij');   // de opzij-rij (doel/gedaan)
  });
  test('5b/5c. "waar zit het ›" en een tik op de Budget-meter openen de brug in Begrijpen', async ({ page }) => {
    await boot(page); await page.evaluate(() => { go('maand'); renderMaand(); });
    await page.locator('#gripZienStand [data-zienbrug]').click();
    expect(await page.evaluate(() => gripTab())).toBe('begrijpen'); await expect(page.locator('#gripGroepKaart')).toBeVisible();
    await page.evaluate(() => { gripKiesTab('zien'); });
    await page.locator('[data-meter="budget"]').click();
    expect(await page.evaluate(() => gripTab())).toBe('begrijpen'); await expect(page.locator('#gripGroepKaart')).toBeVisible();
  });
});
