/* v438: BRUG OPSCHONEN, BONUS EN SALDO EIND MAAND OP INZICHTEN (gezien op het toestel, 17 okt). Op v438-stand: vastgelegd EUR 3.375,
   deze maand Shurgard geaccepteerd (+77 in Huur) en Verzekeringen herzien (-37), drie categorieen zonder potje (Zorg EUR 159 eenmalig,
   Vakantie EUR 220, Goede doelen EUR 15) en een verwachte bonus van EUR 2.500. GECONSTRUEERD EN NIET GEMETEN: de gegevens van het
   toestel staan alleen daar (zie v438-stand.js). */
const { test, expect } = require('@playwright/test');
const S = require('./v438-stand');
const boot = async (page, o) => { await page.setViewportSize({ width: 390, height: 844 }); await S.boot(page, o); };
const blok20 = page => page.evaluate(async () => (await diagTekst()).split('\n'));
const brug = page => page.evaluate(() => { const V = maandVooruit(), B = gripGroepBrug(V); return { st: B.stappen.map(s => `${s.label}:${s.waarde}`), proj: V.projectie, budget: V.budget }; });

test.describe('v438 · 1. een brug, geen dubbeltelling', () => {
  test('1a/1d. de staven zijn budget · vast · zonder potje · N boven · N onder · verwacht, zonder staaf wijzigingen', async ({ page }) => {
    await boot(page);
    const b = await brug(page);
    expect(b.st).toEqual(['budget:3095', 'vast:-629', 'zonder potje:394', '1 boven:66', '9 onder:-639', 'verwacht:2287']);   // v440: budget en verwacht −€280 (Plan-inleg weg)
    /* de invoer draagt het geval: er zijn deze maand wijzigingen (+40) */
    expect(await page.evaluate(() => maandVooruit().wijz)).toBe(40);
    const geen = await page.evaluate(() => { const V = maandVooruit(); return [gripGroepBrug(V), gripZienBrug(V), dezeMaandBrug(V)].map(B => B.stappen.filter(s => s.soort === 'wijz' || /wijziging/.test(String(s.label || ''))).length); });
    expect(geen).toEqual([0, 0, 0]);
    /* elke brug sluit: budget plus de staven is de forecast */
    const sluit = await page.evaluate(() => { const V = maandVooruit(); return [gripGroepBrug(V), gripZienBrug(V), dezeMaandBrug(V)].map(B => B.stappen.slice(0, -1).reduce((a, s) => a + s.waarde, 0) === Math.round(V.projectie)); });
    expect(sluit).toEqual([true, true, true]);
  });
  test('1a. vast is de forecast tegen het VASTGELEGDE budget van vast: de geaccepteerde +77 telt niet nog een keer', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), I = brugIndeling(V), g = I.g('vast'); return { b: Math.round(g.b), v: Math.round(g.v), d: g.d, w: wijzPerPot(V).pot.huur }; });
    expect(r).toEqual({ b: 1517, v: 888, d: -629, w: 77 });
  });
  test('1a. "wijzigingen deze maand (alleen forecast) +EUR 40 ›" blijft als regel onder de brug, met het effect per wijziging', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    const k = page.locator('#gripGroepKaart');
    await expect(k.locator('[data-budgetwijz]')).toHaveAttribute('data-budgetwijz', '40');
    await expect(k.locator('[data-brugstap]').filter({ hasText: /wijziging/ })).toHaveCount(0);
    await page.evaluate(() => openBudgetWijz());
    const e = await page.$$eval('[data-budgetwijzrij]', L => L.map(x => `${x.dataset.budgetwijzrij} ${x.dataset.v} ${x.dataset.effect}`));
    expect(e.sort()).toEqual(['huur 77 0', 'verzekering -37 0']);
  });
  test('1b. een geaccepteerde vaste last verandert de forecast niet', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), E = wijzForecastEffect(V); return { rijen: E.rijen.map(x => `${x.k} ${x.effect}`), Pz: E.Pzonder, P0: E.P0, tot: E.tot }; });
    expect(r).toEqual({ rijen: ['huur 0', 'verzekering 0'], Pz: 2287, P0: 2287, tot: 0 });   // v440: forecast −€280 (Plan-inleg weg)
    const L = await blok20(page);
    expect(L.find(l => l.includes('CONTROLE forecast zonder wijzigingen'))).toMatch(/→ klopt$/);
  });
  test('1b. alleen een potje dat met zijn budget meetelt (vast, geen betaling) verschuift de forecast, en dat zegt de controle', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      /* bankkosten heeft deze maand geen betaling; op vast gezet telt hij met zijn hele budget mee. Verhoog hem deze maand met 30 */
      SET.potAard = Object.assign({}, SET.potAard, { bankkosten: 'vast' }); save();
      const V0 = maandVooruit(); const x = (V0.vastePotjes || []).find(y => y.k === 'bankkosten');
      potPlanZet('bankkosten', thisYM(), (+SET.budgets.bankkosten || 0) + 30); save();
      const E = wijzForecastEffect(maandVooruit()); const s = E.rijen.find(y => y.k === 'bankkosten');
      return { geen: !!(x && x.geen), eff: s && s.effect, rust: s && s.rust }; });
    expect(r).toEqual({ geen: true, eff: 30, rust: true });
    const L = await blok20(page);
    expect(L.find(l => l.includes('CONTROLE forecast zonder wijzigingen'))).toMatch(/verschil €30.*→ klopt$/);
    expect(L.find(l => / · Bankkosten \+€30 → forecast/.test(l))).toMatch(/→ forecast \+€30 \(het potje telt met zijn budget mee/);
  });
  test('1b. een wijziging die de forecast verschuift zonder dat het potje met zijn budget meetelt, is VERSCHILT', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { const o = wijzForecastEffect; window.wijzForecastEffect = V => { const E = o(V); E.rijen[0].effect = 77; E.rijen[0].rust = false; return E; }; });
    const L = await blok20(page);
    expect(L.find(l => l.includes('CONTROLE forecast zonder wijzigingen'))).toMatch(/NIET: Huur → VERSCHILT$/);
  });
  test('1c. zonder potje is een staaf met alle uitgaven in een categorie zonder potje; de tik toont de verdeling met eenmalig', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    await page.locator('#gripGroepKaart [data-brugtik]').nth(2).click();
    const sh = page.locator('#zonderPotjeSheet');
    await expect(sh).toHaveAttribute('data-zonder', '394');
    const rij = await page.$$eval('#zonderPotjeSheet [data-zondercat]', L => L.map(x => `${x.dataset.zondercat} ${x.querySelector('[data-zondercatg]').dataset.zondercatg}`));
    expect(rij.sort()).toEqual(['goededoel 15', 'vakantie 220', 'zorg 159']);
    await expect(sh.locator('[data-zondercat="zorg"] [data-zondereenmalig]')).toHaveAttribute('data-zondereenmalig', '159');
    await expect(sh.locator('[data-zondercat="vakantie"] [data-zondereenmalig]')).toHaveCount(0);
  });
  for (const w of [390, 360]) test(`1d. de staven passen op ${w}px zonder afgesneden labels`, async ({ page }) => {
    await boot(page); await page.setViewportSize({ width: w, height: w === 390 ? 844 : 640 });
    await page.evaluate(() => { go('maand'); gripKiesTab('begrijpen'); });
    const L = await page.$$eval('#gripGroepKaart [data-brugeen]', E => E.map(e => ({ t: e.textContent, s: e.scrollWidth, c: e.clientWidth })));
    expect(L.map(x => x.t)).toEqual(['budget', 'vast', 'zonder potje', '1 boven', '9 onder', 'verwacht']);
    for (const x of L) expect(x.s, x.t).toBeLessThanOrEqual(x.c);
  });
  test('1e. per groep, de salariskaart en blok 20 hebben dezelfde indeling; som salariskaart = onder budget', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), T = salarisTabelData(V); return { T: T.rijen.map(x => `${x.k} ${x.d}`), som: T.som, onder: Math.round(V.projectie) - V.budget }; });
    expect(r).toEqual({ T: ['vast -629', 'zonder 394', 'boven 66', 'onder -639'], som: -808, onder: -808 });   // v440: geen inleg-rij meer
    await page.evaluate(() => openGripGroepen());
    const g = await page.$$eval('#gripGroepen [data-groep]', L => L.map(x => `${x.dataset.groep} ${x.querySelector('[data-groepdiff]').dataset.groepdiff}`));
    expect(g).toEqual(['vast -629', 'zonder 394', 'boven 66', 'onder -639']);   // v440: geen inleg-groep meer
    await page.evaluate(() => { closeSheet(); openGripKant('onder'); });
    await expect(page.locator('#gripKant')).toHaveAttribute('data-kantwaarde', '-639');
    const s = await page.$$eval('[data-kantpotje]', L => L.reduce((a, x) => a + +x.dataset.v, 0));
    expect(s).toBe(-639);
    const B = await blok20(page);
    for (const c of ['CONTROLE budget + verschillen = forecast', 'CONTROLE geen staaf "wijzigingen"', 'CONTROLE som van de salariskaart-verschillen', 'CONTROLE som van de groepen = vastgelegd'])
      expect(B.find(l => l.includes(c)), c).toMatch(/→ klopt$/);
    const i = B.findIndex(l => l.includes('per groep (vastgelegd budget · forecast · verschil)'));
    expect(B.slice(i + 1, i + 5)).toEqual(['    vast: €1.517 · €888 · -€629', '    zonder potje: €0 · €394 · +€394', '    1 boven: €400 · €466 · +€66 (Boodschappen +€66)', '    9 onder: €1.178 · €539 · -€639']);   // v440: geen Plan-inleg-groep meer
  });
});

test('1e. een indeling die niet op de forecast sluit, is VERSCHILT in blok 20', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => { const o = brugIndeling; window.brugIndeling = V => { const I = o(V); if (I) I.som += 1; return I; }; });
  const L = await blok20(page);
  expect(L.find(l => l.includes('CONTROLE budget + verschillen = forecast'))).toMatch(/→ VERSCHILT$/);
});
test.describe('v438 · 2. Home', () => {
  test('2a. Nog te ontvangen staat niet op Home; totaal saldo blijft (v439: vrij te besteden en verwacht eind ook weg)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('dash'));
    await expect(page.locator('#homeOntvangen')).toHaveCount(0);
    await expect(page.locator('#s-dash')).not.toContainText('Nog te ontvangen');
    await expect(page.locator('[data-totaalsaldo]').first()).toBeVisible();
    for (const sel of ['[data-vrij]', '[data-verwachteind]']) await expect(page.locator('#s-dash ' + sel), sel).toHaveCount(0);   // v439
  });
});

test.describe('v438 · 3. Inzichten: saldo eind maand en bonus', () => {
  test('3a. "Verwacht saldo eind oktober" onder de maandkaart, met dezelfde bron als Home, en de bonus als eigen regel', async ({ page }) => {
    await boot(page);
    const home = await page.evaluate(() => maandVerloop().eind);   // v439: niet meer op Home; dezelfde bron
    await page.evaluate(() => go('ins'));
    const k = page.locator('#insSaldoEind');
    await expect(k).toHaveAttribute('data-inssaldoeind', String(home));
    await expect(k).toContainText('Verwacht saldo eind oktober');
    await expect(k.locator('[data-insbonus]')).toHaveText('+ bonus €2.500 · eenmalig · telt mee zodra binnen');
    await expect(k.locator('[data-inssaldobonus]')).toHaveAttribute('data-inssaldobonus', String(home + 2500));
    await expect(k.locator('[data-inssaldobonus]')).toContainText('met bonus');
    /* v439: binnen de maandkaart, op de plek van de Forecast */
    expect(await page.evaluate(() => !!document.querySelector('#insMaand #insSaldoEind'))).toBe(true);
    /* past nog op een scherm boven de menubalk */
    const fit = await page.evaluate(() => ({ last: Math.max(...[...document.querySelectorAll('#s-ins > *')].map(e => e.getBoundingClientRect().bottom)), nav: document.querySelector('nav').getBoundingClientRect().top }));
    expect(fit.last).toBeLessThan(fit.nav);
  });
  test('3b. zodra de bonus binnen is (ja op de vraag) verdwijnt de regel en zit het bedrag in het saldo', async ({ page }) => {
    await boot(page, { bonusJa: true });
    await page.evaluate(() => go('ins'));
    await expect(page.locator('#insSaldoEind [data-insbonus]')).toHaveCount(0);
    const L = await blok20(page);
    expect(L.find(l => l.includes('overige inkomsten · eenmalig'))).toMatch(/eenmalig 2500: Werkgever 2500\.00 \(door jou onregelmatig genoemd\)/);
  });
  test('3b. een bonus die binnen is maar nog op je antwoord wacht, staat niet meer als verwacht: hij zit in je saldo', async ({ page }) => {
    await boot(page, { bonusBinnen: true });
    await page.evaluate(() => go('ins'));
    await expect(page.locator('#insSaldoEind')).toBeVisible();
    await expect(page.locator('#insSaldoEind [data-insbonus]')).toHaveCount(0);
    /* en het inkomen dat nog komt is je hele salaris: de bonus haalde er niets af */
    expect(await page.evaluate(() => monthLiquidity().incDue)).toBe(5216);
  });
  test('3b. een bonus van je werkgever die binnenkomt is geen salaris: punt 1, inkomen gestegen, de salarisdatum en het voorstel', async ({ page }) => {
    await boot(page, { bonusBinnen: true });
    const r = await page.evaluate(() => { const D = salarisData(1), okt = D.R.find(x => x.ym === '2026-10');
      const sl = salarisBetalingLaatst('2026-11'); return { sal: Math.round(okt.salaris), ov: Math.round(okt.overige), salTx: okt.salTx.length, sl: sl && sl.date, stijg: !!inkomenStijging() }; });
    expect(r).toEqual({ sal: 0, ov: 2500, salTx: 0, sl: '2026-09-24', stijg: false });
    const L = await blok20(page);
    expect(L.find(l => l.includes('overige inkomsten · eenmalig'))).toMatch(/lijkt op je verwachte bonus, nog niet bevestigd/);
    expect(L.find(l => l.includes('CONTROLE eenmalig inkomen niet in salaris'))).toMatch(/okt €2\.500 in overige · eenmalig.*→ klopt$/);
    const p1 = L.find(l => /^\s+okt\*?: salaris/.test(l)); expect(p1).toMatch(/geboekt 0 \+ nog te ontvangen 5216/);
  });
});

test.describe('v438 · 4. blok 20 MAANDBUDGET', () => {
  test('4. per groep, de wijzigingen met hun effect, en de controles', async ({ page }) => {
    await boot(page);
    const L = await blok20(page);
    const i = L.findIndex(l => l.startsWith('MAANDBUDGET (v436/v437/v438)'));
    expect(i).toBeGreaterThan(-1);
    const e = L.findIndex(l => l.includes('effect van de wijzigingen op de forecast'));
    expect(L.slice(e + 1, e + 3).map(l => l.replace(/^\s+\S+ · [^·]+ · /, ''))).toEqual(['Huur +€77 → forecast €0', 'Verzekeringen -€37 → forecast €0']);
    expect(L.slice(e + 1, e + 3).every(l => / → forecast €0$/.test(l))).toBe(true);
    expect(L.find(l => l.includes('CONTROLE eenmalig inkomen niet in salaris'))).toMatch(/→ klopt$/);
  });
});
