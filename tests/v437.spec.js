/* v437: REPARATIE v436, DE PLAN-INLEG DUBBEL GETELD IN HET VASTGELEGDE MAANDBUDGET (gezien op het toestel, 17 okt). Op v437-stand:
   het budget van oktober is EUR 3.375 en bevat de inleg in Plan al (potjes EUR 3.095 + inleg EUR 280); de logs van oktober dragen de
   inleg twee keer, en v436 kwam daarmee op EUR 3.655 met -EUR 240 aan wijzigingen. GECONSTRUEERD EN NIET GEMETEN: de logs van het
   toestel staan alleen daar (zie v437-stand.js). Geen nieuwe functies. */
const { test, expect } = require('@playwright/test');
const S = require('./v437-stand');
const boot = async (page, o) => { await page.setViewportSize({ width: 390, height: 844 }); await S.boot(page, o); };
const herlaad = async page => { const snap = await page.evaluate(() => { save(); return Object.assign({}, localStorage); }); await page.addInitScript(s => { for (const k in s) localStorage.setItem(k, s[k]); }, snap); await page.reload(); await page.waitForFunction(() => typeof maandVooruit === 'function' && TX.length > 0); };
const stand = page => page.evaluate(() => { const V = maandVooruit(), W = maandBudgetWijz(); return { V: V.budget, nu: V.budgetNu, wijz: V.wijz, inleg: V.maandBudget.inleg, tot: W.tot, rijen: W.rijen.map(r => `${r.naam} ${r.d}`) }; });
const blok20 = page => page.evaluate(async () => (await diagTekst()).split('\n'));

test.describe('v437 · 1. het vastgelegde budget bevat de Plan-inleg een keer', () => {
  test('1a. EUR 3.375 = potjes EUR 3.095 + Plan-inleg EUR 280, op elk scherm; EUR 3.655 nergens', async ({ page }) => {
    await boot(page);
    /* de invoer draagt het geval: de inleg staat twee keer in de logs van oktober */
    const inv = await page.evaluate(() => ({ bw: (SET.budgetWijzLog || []).filter(x => x.k === '~inleg').length, pi: (SET.planInlegLog || []).length, nu: planInlegRegels().tot }));
    expect(inv).toEqual({ bw: 2, pi: 1, nu: 280 });
    expect(await stand(page)).toMatchObject({ V: 3375, nu: 3415, wijz: 40, inleg: 280 });
    const r = await page.evaluate(() => { const V = maandVooruit(), MB = V.maandBudget, pS = Object.values(MB.potjes).reduce((a, v) => a + v, 0), Q = gripGroepenVier(V);
      return { pS, inl: MB.inleg, meter: gripMeterBudget(V).budget, ins: insMaandStand().Bvast, brug: gripGroepBrug(V).budget, groepen: Math.round(Q.vast.b + Q.potjes.b + Q.zonder.b + Q.inleg.b), Qinl: Q.inleg.b, sal: salarisTabelData(V).budget, label: budgetVastTekst(V) }; });
    expect(r).toEqual({ pS: 3095, inl: 280, meter: 3375, ins: 3375, brug: 3375, groepen: 3375, Qinl: 280, sal: 3375, label: '€3.375 (vast sinds 1 okt) · waarvan Plan-inleg €280' });
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    const g = await page.locator('#gripGroepKaart').innerText();
    expect(g).toMatch(/budget €3\.375 \(vast sinds 1 okt\) · waarvan Plan-inleg €280/);
    expect(g).not.toMatch(/3\.655|560/);
  });
  test('1b. een vastlegging die v436 al met EUR 3.655 opsloeg, wordt bij het laden een keer opnieuw uitgerekend', async ({ page }) => {
    await boot(page, { opgeslagen: true });
    await herlaad(page);
    expect(await stand(page)).toMatchObject({ V: 3375, wijz: 40, inleg: 280 });
    const m = await page.evaluate(() => ({ mb: SET.mb437, opg: SET.maandBudget['2026-10'].totaal }));
    expect(m.opg).toBe(3375); expect(m.mb.voor).toMatchObject({ totaal: 3655, inleg: 560 });
    /* een keer: een tweede laadbeurt verandert niets meer */
    await herlaad(page);
    expect(await page.evaluate(() => SET.maandBudget['2026-10'].totaal)).toBe(3375);
  });
  test('1b. een vastlegging van de maandwissel is het budget van de 1e zelf en blijft staan', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.maandBudget = { '2026-10': { totaal: 3375, potjes: { huur: 700 }, inleg: 280, op: '2026-10-01', bron: 'maandwissel' } }; delete SET.mb437; save(); });
    await herlaad(page);
    expect(await page.evaluate(() => [SET.maandBudget['2026-10'].totaal, !!SET.mb437, !!(SET.mb437 || {}).voor])).toEqual([3375, true, false]);
  });
  test('1c. de Plan-inleg telt alleen als wijziging als jij het bedrag in Plan aanpast', async ({ page }) => {
    await boot(page);
    /* zelf aangepast: 280 -> 300 is een wijziging van +20 */
    let r = await page.evaluate(() => { planInlegZet('res', 300); save(); const W = maandBudgetWijz(); return { V: maandVooruit().budget, rij: (W.rijen.find(x => x.k === '~inleg') || {}).d, tot: W.tot }; });
    expect(r).toEqual({ V: 3375, rij: 20, tot: 60 });
    /* en weer terug: geen wijziging meer */
    r = await page.evaluate(() => { planInlegZet('res', 280); save(); const W = maandBudgetWijz(); return { rij: W.rijen.filter(x => x.k === '~inleg').length, tot: W.tot }; });
    expect(r).toEqual({ rij: 0, tot: 40 });
    /* een verplaatsing uit een potje naar de inleg (te ruim, herzien) is geen wijziging: niet bij de inleg en niet bij het potje */
    r = await page.evaluate(() => { const m = thisYM(); window._bwKeuze = 'te ruim verlaagd'; potPlanZet('overig', m, 450); planInlegVoeg('res', 50, 'overig'); save(); _dataGen++;
      const W = maandBudgetWijz(); return { V: maandVooruit().budget, rijen: W.rijen.map(x => `${x.naam} ${x.d}`), tot: W.tot }; });
    expect(r).toEqual({ V: 3375, rijen: ['Huur 77', 'Verzekeringen -37'], tot: 40 });
  });
  test('1c. een eigen aanpassing staat in twee logs en telt een keer (zonder opgeslagen vastlegging)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.planInleg.res.bedrag = 300; SET.budgetWijzLog = [{ op: '2026-10-16', k: '~inleg', van: 280, naar: 300, keuze: 'budget aangepast', soort: 'res' }];
      SET.planInlegLog = [{ soort: 'res', van: 280, naar: 300, op: '2026-10-16' }]; delete SET.maandBudget; save(); });
    const r = await stand(page);
    expect(r).toMatchObject({ V: 3375, inleg: 280, tot: 60 }); expect(r.rijen).toContain('inleg in Plan 20');
  });
  test('1c. een verplaatsing naar de inleg van voor v436 (alleen in de te-ruim-log) draait het potje niet terug', async ({ page }) => {
    await boot(page);
    /* de inleg kwam deze maand uit Huur (te ruim, bestemming Reservering), en de toevoeging zelf stond nog niet in een log */
    await page.evaluate(() => { SET.budgetWijzLog = []; SET.planInlegLog = []; SET.planInleg.res.vanaf = '2026-10';
      SET.teRuimLog = [{ k: 'huur', naam: 'Huur', van: 1057, naar: 777, maand: '2026-10', bestem: 'Reservering', bestemSoort: 'res', op: '2026-10-05' }]; delete SET.maandBudget; save(); });
    expect(await stand(page)).toMatchObject({ V: 3375, tot: 40, rijen: expect.arrayContaining(['Huur 77', 'Verzekeringen -37']) });
    expect((await stand(page)).rijen.length).toBe(2);
  });
});

test.describe('v437 · 2. wijzigingen deze maand', () => {
  test('2. +EUR 40: Huur +77 (Shurgard) en Verzekeringen -37; de -EUR 280 staat niet in de lijst', async ({ page }) => {
    await boot(page);
    const r = await stand(page);
    expect(r.tot).toBe(40); expect(r.rijen.sort()).toEqual(['Huur 77', 'Verzekeringen -37']);
    await page.evaluate(() => openBudgetWijz());
    const t = await page.locator('#budgetWijzSheet').innerText();
    expect(t).toMatch(/Huur\s+forecast €0\s+\+€77/); expect(t).toMatch(/Verzekeringen\s+forecast €0\s+−€37/);   // v438: met het effect op de forecast expect(t).toMatch(/samen\s+\+€40/);
    expect(t).not.toMatch(/inleg in Plan/); expect(t).not.toMatch(/€280/);
  });
});

test.describe('v437 · 3. het budget per groep is het vastgelegde budget per groep', () => {
  test('3. de brug, de salariskaart en per groep lezen hetzelfde vastgelegde budget per groep; de wijzigingen staan apart', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), Q = gripGroepenVier(V), T = salarisTabelData(V), P = Math.round(V.projectie);
      /* v438: de salariskaart heeft de indeling van de brug (vast, zonder potje, boven, onder, inleg); potjes = boven + onder */
      const tb0 = Object.fromEntries(T.rijen.map(x => [x.k, x.b])), tb = { vast: Math.round(tb0.vast), potjes: Math.round((tb0.boven || 0) + (tb0.onder || 0)), inleg: Math.round(tb0.inleg) };
      return { Q: { vast: Math.round(Q.vast.b), potjes: Math.round(Q.potjes.b), inleg: Math.round(Q.inleg.b) }, tb, som: T.som, onder: P - V.budget, meter: gripMeterBudget(V).verschil, inlD: T.rijen.find(x => x.k === 'inleg').d }; });
    expect(r.tb).toEqual(r.Q); expect(r.inlD).toBe(0);
    expect(r.som).toBe(r.onder); expect(Math.abs(r.som - r.meter)).toBeLessThanOrEqual(1);
    /* de salariskaart en per groep dragen de wijzigingen als eigen regel */
    await page.evaluate(() => { go('maand'); gripKiesTab('zien'); });
    const sal = page.locator('#gripSalaris');
    if (await sal.count()) await expect(sal.locator('[data-budgetwijz]')).toHaveAttribute('data-budgetwijz', '40');
    await page.evaluate(() => openGripGroepen());
    const pg = await page.evaluate(() => [...document.querySelectorAll('#gripGroepen [data-groep]')].map(e => [e.dataset.groep, +e.dataset.groepbudget]));
    const pgo = Object.fromEntries(pg); pgo.potjes = (pgo.boven || 0) + (pgo.onder || 0);
    expect(Math.abs(pgo.vast - r.Q.vast)).toBeLessThanOrEqual(1); expect(Math.abs(pgo.potjes - r.Q.potjes)).toBeLessThanOrEqual(1); expect(pgo.inleg).toBe(r.Q.inleg);
    expect(Math.abs(pg.reduce((a, x) => a + x[1], 0) - 3375)).toBeLessThanOrEqual(2);   // per rij afgerond
    await expect(page.locator('#gripGroepen [data-budgetwijz]')).toHaveAttribute('data-budgetwijz', '40');
  });
});

test.describe('v437 · 4. een brug', () => {
  /* v438: GEEN STAAF "WIJZIGINGEN" MEER (gevraagd door de gebruiker): elke groep staat tegen zijn vastgelegde budget en de wijziging zit in
     de forecast van die groep. Deze test hield de vorm van v437 vast (de wijzigingen als laatste stap) en is daarop gemigreerd. */
  test('4a. de brug in Begrijpen en die van de keuze-sheet: vastgelegd budget, de groepen tegen het vastgelegde budget, de forecast', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), B = gripGroepBrug(V), Z = gripZienBrug(V), P = Math.round(V.projectie);
      const soort = Br => Br.stappen.map(s => s.soort), som = Br => Br.stappen.slice(0, -1).reduce((a, s) => a + s.waarde, 0);
      return { B: soort(B), Z: soort(Z), b0: B.stappen[0].waarde, z0: Z.stappen[0].waarde, sB: som(B), sZ: som(Z), P };
    });
    for (const k of ['B', 'Z']) { const s = r[k]; expect(s[0]).toBe('begin'); expect(s[s.length - 1]).toBe('eind'); expect(s).not.toContain('wijz'); }
    expect([r.b0, r.z0]).toEqual([3375, 3375]);
    expect([r.sB, r.sZ]).toEqual([r.P, r.P]);
    /* de staaf vast is de forecast tegen het VASTGELEGDE budget van vast: de geaccepteerde +77 telt niet nog een keer */
    const g = await page.evaluate(() => { const V = maandVooruit(), B = gripGroepBrug(V), Q = gripGroepenVier(V);
      return { vast: B.stappen.find(s => s.k === 'vast').waarde, vastV: Math.round(Q.vast.v - Q.vast.b) }; });
    expect(Math.abs(g.vast - g.vastV)).toBeLessThanOrEqual(1);
  });
  test('4b. een uitschieter zoals Boodschappen staat in "1 boven" (Begrijpen) en los in de keuze-sheet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), u = uitschieters(V).find(x => x.k === 'boodschappen');
      const B = gripGroepBrug(V), Z = gripZienBrug(V);
      return { u: u && Math.round(u.overR), B: (B.stappen.find(s => s.k === 'boven') || {}).waarde, bl: (B.stappen.find(s => s.k === 'boven') || {}).label, Z: (s => s ? s.waarde - (s.bij || 0) : null)(Z.stappen.find(s => s.soort === 'potje' && s.k === 'boodschappen')) }; });   // v415: een kleine samengevoegde stap schuift erbij (bij)
    expect(r.u).toBeGreaterThan(25); expect(r.B).toBe(r.u); expect(r.bl).toBe('1 boven'); expect(r.Z).toBe(r.u);
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    const t = await page.locator('#gripGroepBrug').innerText();
    expect(t).toMatch(/1 boven/); expect(t).not.toMatch(/wijzigingen/);
  });
});

test.describe('v437 · 5. blok 20, regel MAANDBUDGET', () => {
  test('5. vastgelegd totaal en per groep, de wijzigingen, de forecast en vier controles die kloppen', async ({ page }) => {
    await boot(page);
    const L = await blok20(page), i = L.findIndex(l => /^MAANDBUDGET \(v436\/v437\/v438\)/.test(l)), B = L.slice(i, i + 40).join('\n');
    expect(i).toBeGreaterThan(-1);
    expect(B).toMatch(/vastgelegd €3\.375 op 01-10 .*potjes €3\.095 · waarvan Plan-inleg €280/);
    expect(B).toMatch(/wijzigingen deze maand \(alleen forecast\): samen \+€40/);
    expect(B).toMatch(/per groep \(vastgelegd budget · forecast · verschil\):\n    vast: €[\d.]+ · €[\d.]+ · /);
    expect(B).toMatch(/    Plan-inleg: €280 · €280 · €0/);
    expect(B).toMatch(/CONTROLE som van de groepen = vastgelegd: €3\.375 tegen €3\.375 → klopt/);
    expect(B).toMatch(/CONTROLE Plan-inleg een keer geteld: .*→ klopt/);
    expect(B).toMatch(/CONTROLE onder budget = vastgelegd - forecast: .*→ klopt/);
    expect(B).toMatch(/CONTROLE som van de salariskaart-verschillen = onder budget: .*→ klopt/);
    expect(B).toMatch(/forecast €[\d.]+ · onder budget/);
  });
  test('5. groepen die niet op het vastgelegde totaal sluiten, laten de controle VERSCHILT zeggen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { const g = gripGroepenVier; window.gripGroepenVier = V => { const Q = g(V); Q.vast = Object.assign({}, Q.vast, { b: Q.vast.b + 280 }); return Q; }; });
    const B = (await blok20(page)).join('\n');
    expect(B).toMatch(/CONTROLE som van de groepen = vastgelegd: €3\.655 tegen €3\.375 → VERSCHILT/);
  });
  test('5. een vastlegging die de inleg twee keer draagt, laat de controle VERSCHILT zeggen', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.maandBudget = { '2026-10': { totaal: 3655, potjes: Object.assign({}, maandBudgetHerstel('2026-10').potjes), inleg: 560, op: '2026-10-01', bron: 'maandwissel' } }; save(); });
    const B = (await blok20(page)).join('\n');
    expect(B).toMatch(/CONTROLE Plan-inleg een keer geteld: .*VERSCHILT \(dubbel geteld\)/);
  });
});
