/* v450 (gevraagd door de gebruiker): de rest van de contant-nazorg. GECONSTRUEERDE fixture (v448-stand; de getallen van het toestel,
   onder budget ±EUR 264 en de schatting ≈ EUR 540, verifieert de gebruiker met blok 20 en 23).
   1. Oktober: het potje Contant ontstaat deze maand, een herindeling: budget Contant = forecast Contant, verschil EUR 0, label "nieuw
      potje deze maand · telt vanaf 1 nov mee"; onder budget gelijk aan zonder potje; geen signaal "Contant boven je tempo".
   2. Een bron: de tellingboekingen van voor de grens tellen met een potje niet in de categorie; contant per maand uit dezelfde
      berekening als per periode (met de correctie van v449), en de controle maand = periode sluit.
   3. Blok 23: zonder telling op moment 2 is de schatting de laatste telling min het tempo sinds die telling, minimaal 0. */
const { test, expect } = require('@playwright/test');
const S = require('./v448-stand');

const b20 = (page) => page.evaluate(() => diagSalarisVerdeling().join('\n'));
const b23 = (page) => page.evaluate(() => diagRekVerdeling().join('\n'));
const regel = (b, re) => b.split('\n').find((l) => re.test(l)) || '';
const stand = (page) => page.evaluate(() => { const V = maandVooruit(), I = brugIndeling(V), c = I.groepen.flatMap((g) => g.pots || []).find((x) => x.k === CONTANT_CAT);
  return { budget: V.budget, proj: V.projectie, onder: V.budget - V.projectie, her: V.maandBudget && V.maandBudget.herindeling, cd: c ? c.d : null,
    kas: kasTempo(), W: maandBudgetWijz(), meter: gripMeterBudget(V), BG: budgetPerGroep(V), ins: insMaandStand().Bvast, regel: budgetWijzRegel() }; });

test.describe('1 · oktober: herindeling', () => {
  test('a. budget Contant = forecast Contant, verschil EUR 0, en onder budget gelijk aan zonder potje', async ({ page }) => {
    await S.boot(page, { potje: false });
    const zonder = await stand(page);
    await S.boot(page);
    const met = await stand(page);
    /* de invoer draagt het geval: het potje is er nu, het vastgelegde budget van 1 oktober niet, en Contant heeft een forecast */
    expect(await page.evaluate(() => [contantNieuwIn(), +(maandBudgetVast().potjes || {})[CONTANT_CAT] || 0, +(SET.budgets || {})[CONTANT_CAT]])).toEqual([true, 0, 400]);
    expect(met.her.k).toBe('contant');
    expect(met.her.f).toBeGreaterThan(0);
    expect(met.proj - zonder.proj).toBe(met.her.f);
    expect(met.budget).toBe(zonder.budget + met.her.f);
    expect(met.onder).toBe(zonder.onder);
    expect(Math.abs(met.cd)).toBeLessThan(0.5);
    /* Zien, de meter, Inzichten en budget per groep lezen hetzelfde budget */
    expect(met.meter.budget).toBe(met.budget);
    expect(met.meter.verschil).toBe(zonder.meter.verschil);
    expect(met.ins).toBe(met.budget);
    expect(met.BG.som).toBe(met.budget);
    /* geen wijziging: de herindeling staat apart met het label */
    expect(met.W.tot).toBe(0);
    expect(met.W.rijen.find((r) => r.k === 'contant')).toBeUndefined();
    expect(met.W.herindeling.label).toBe('nieuw potje deze maand · telt vanaf 1 november mee');
    expect(met.regel).toContain('data-herindeling="contant"');
    expect(met.regel).toContain('nieuw potje deze maand · telt vanaf 1 november mee');
  });

  test('b. geen signaal "Contant boven je tempo" in de maand waarin het potje ontstaat', async ({ page }) => {
    await S.boot(page, { opnNa: 600 });
    const r = await page.evaluate(() => ({ kas: kasTempo(), sym: JSON.stringify((gripCyclus().sym || []).map((s) => s.key || s.id || '')) }));
    expect(r.kas).toBeNull();
    expect(r.sym).not.toContain('sig:contant');
  });

  test('c. blok 20: de herindeling met het bedrag, en alle controles kloppen', async ({ page }) => {
    await S.boot(page);
    const b = await b20(page), m = await stand(page);
    expect(regel(b, /HERINDELING \(v450\)/)).toContain(`Contant €400 · nieuw potje deze maand · telt vanaf 1 november mee · deze maand budget Contant = forecast Contant €${m.her.f}, verschil EUR 0`);
    expect(regel(b, /HERINDELING \(v450\)/)).toContain('(klopt met V.budget)');
    expect(regel(b, /budget van nu .* = vastgelegd/)).toContain('+ nieuw potje Contant €400: klopt');
    for (const re of [/CONTROLE maandbudget op alle schermen/, /CONTROLE budget per groep/, /CONTROLE onder budget = vastgelegd/, /CONTROLE som van de salariskaart/, /CONTROLE som van de groepen = vastgelegd/, /CONTROLE budget \+ verschillen = forecast/])
      expect(regel(b, re)).toContain('klopt');
  });

  test('d. een maand waarin het potje al in het vastgelegde budget stond: geen herindeling, wel tempo', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const ym = thisYM(); SET.maandBudget[ym].potjes[CONTANT_CAT] = 400; SET.maandBudget[ym].totaal += 400; save();
      const V = maandVooruit(); return { nieuw: contantNieuwIn(), her: V.maandBudget && V.maandBudget.herindeling, kas: kasTempo(), W: maandBudgetWijz().herindeling }; });
    expect(r.nieuw).toBe(false);
    expect(r.her).toBeFalsy();
    expect(r.W).toBeFalsy();
    expect(r.kas).not.toBeNull();
  });
});

test.describe('2 · een bron voor contant', () => {
  test('a. de tellingboekingen van voor de grens tellen met een potje niet in de categorie, zonder potje wel', async ({ page }) => {
    await S.boot(page, { tellingen: true });
    const met = await page.evaluate(() => TX.filter((t) => t.src === 'contant' && !t.acc).map((t) => [t.date, catOf(t), !!t.kasTel]));
    expect(met).toEqual([['2026-10-04', 'intern', true], ['2026-10-05', 'intern', true], ['2026-10-07', 'intern', true]]);
    expect(await page.evaluate(() => catSpendMap(thisYM())[CONTANT_CAT] || 0)).toBe(0);
    expect(regel(await b20(page), /tellingboekingen van voor de v420-grens/)).toMatch(/: geen \(3 buiten de categorie gezet sinds v450: 04-10 100.00, 05-10 80.00, 07-10 -100.00\)/);
    /* het potje weg: bij de volgende save() staan ze weer in de categorie */
    const zonder = await page.evaluate(() => { delete SET.budgets[CONTANT_CAT]; delete (SET.budgetsNext || {})[CONTANT_CAT]; SET.budgetPlan = {}; save();
      return TX.filter((t) => t.src === 'contant' && !t.acc).map((t) => catOf(t)); });
    expect(zonder).toEqual(['contant', 'contant', 'contant']);
  });

  test('a2. categorize() zelf zet een tellingboeking van voor de grens buiten de categorie, ook zonder save()', async ({ page }) => {
    await S.boot(page);
    const c = await page.evaluate(() => { const t = { date: '2026-10-05', amount: -80, acc: '', name: 'Contant besteed', desc: 'Contant besteed (telling)', typ: '', ref: '', src: 'contant', accName: '', refNums: [], bankRef: 'contant|2026-10-05', vasteCat: 'contant' };
      categorize(t); return [t.autoCat, !!t.kasTel]; });
    expect(c).toEqual(['intern', true]);
  });

  test('b2. de controle maand = periode telt de randdagen: een opname die alleen in een periode valt', async ({ page }) => {
    await S.boot(page);
    await page.evaluate((L) => { const t = { date: '2026-03-28', amount: -50, acc: L, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); }, S.LEEF);
    const c = regel(await b20(page), /CONTROLE maand \(punt 3\) = periode/);
    /* 28-03 valt in de periode 24-03 t/m 23-04, niet in de maanden vanaf april: de rand begin is −50 */
    expect(c).toContain('− rand begin 50.00');
    expect(c).toContain('→ sluit');
  });

  test('b. contant per maand uit dezelfde berekening als per periode, en de controle maand = periode sluit', async ({ page }) => {
    await S.boot(page, { tellingen: true, vorigOpn: 400 });
    const r = await page.evaluate(() => { const D = salarisData(); return D.R.map((x) => ({ ym: x.ym, pot: Math.round((x.potjes[CONTANT_CAT] || 0) * 100) / 100, cat: x.kasCat, km: x.kasMaand && x.kasMaand.uitgegeven })); });
    for (const x of r) expect(x.pot).toBe(x.km);
    const sep = r.find((x) => x.ym === '2026-09');
    /* september: 100 + 200 + 400 opgenomen = 700, correctie −320 uit de telling van 07-10 */
    expect(sep.cat).toBe(700);
    expect(sep.pot).toBe(380);
    const b = await b20(page);
    expect(regel(b, /^  Contant: /)).toContain('sep 380');
    expect(regel(b, /CONTROLE maand \(punt 3\) = periode/)).toContain('→ sluit');
    expect(regel(b, /CONTANT PER MAAND \(v450/)).toContain('sep 380.00 (was 700.00, correctie −320.00 uit telling 07-10)');
    expect(regel(b, /CONTROLE formule = loop/)).toContain('sluit in alle');
    /* de controle van de geldstromen noemt het verschil bij naam en sluit */
    const i = b.split('\n').findIndex((l) => /^  sep: .*=/.test(l)), naam = b.split('\n').slice(i, i + 4).join('\n');
    expect(naam).toMatch(/het verschil bij naam .*sluit/);
    expect(naam).toContain('contant uit de tellingen 380.00 in plaats van de boekingen 700.00');
  });
});

test.describe('3 · schatting portemonnee', () => {
  test('a. zonder telling op moment 2: laatste telling min het tempo sinds die telling, gemarkeerd; te pinnen = budget × dagen/31 − schatting', async ({ page }) => {
    await S.boot(page);
    const P = await page.evaluate(() => { const x = rekVoorstelRuw(); return { stand: x.kasStand, bron: x.kasStandBron, s: x.kasSchat, kasP: x.kasP, bud: x.kasBud, dagen: x.dagen, dim: x.dimStart }; });
    expect(P.bron).toBe('schatting');
    expect(P.s.dagen).toBe(14);
    expect(P.s.telling).toBe(720);
    expect(P.stand).toBeCloseTo(720 - 14 * 400 / 31, 2);
    expect(P.kasP).toBeCloseTo(Math.max(P.bud * P.dagen / P.dim - P.stand, 0), 2);
    const b = await b23(page);
    expect(b).toMatch(/stand portemonnee 539 \(SCHATTING, v450: laatste telling 720 op 07-10 − 14 dagen tempo van het potje 181, minimaal 0/);
  });

  test('b. een opname na de telling gaat de portemonnee in; de schatting is nooit onder 0; je antwoord bij moment 2 vervangt hem', async ({ page }) => {
    await S.boot(page, { opnNa: 100 });
    expect(await page.evaluate(() => rekVoorstelRuw().kasStand)).toBeCloseTo(720 + 100 - 14 * 400 / 31, 2);
    const nul = await page.evaluate(() => { SET.contantHist[0].stand = 50; SET.contant.stand = 50; SET.contant.datum = '2026-10-07'; save(); const x = rekVoorstelRuw(); return [x.kasStand, x.kasSchat.stand]; });
    expect(nul).toEqual([0, 0]);
    const m2 = await page.evaluate(() => { const x0 = rekVoorstelRuw(); SET.kasMoment = { [x0.kasStandKey]: { keuze: 'stand', stand: 150, op: '2026-10-21' } }; save(); const x = rekVoorstelRuw(); return [x.kasStand, x.kasStandBron]; });
    expect(m2).toEqual([150, 'moment2']);
  });
});
