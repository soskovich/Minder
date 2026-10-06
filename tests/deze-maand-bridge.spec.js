/* v349: de kaart "Deze maand" op Grip is een variance-bridge van budget naar uitkomst, met de oorzaken op
   de kaart en de opbouw in de sheet. De stand is die van de gebruiker op 6 oktober 2026
   (tests/deze-maand-stand.js): budget EUR 3.375, uitkomst EUR 2.672, Vices +83, Boodschappen +61, de rest
   -847. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./deze-maand-stand');
const { kaalUit } = require('./bron-kaal');

async function grip(page) {
  await page.evaluate(() => { closeSheet(); go('maand'); });
}
const stappenVan = (page) => page.evaluate(() => {
  const Br = dezeMaandBrug(maandVooruit());
  return Br.stappen.map((s) => ({ soort: s.soort, k: s.k || null, waarde: s.waarde, aard: s.aard || null }));
});

test.describe('a. de bridge loopt van budget naar uitkomst', () => {
  test('de stappen van de stand van 6 oktober', async ({ page }) => {
    await boot(page); await grip(page);
    const st = await stappenVan(page);
    expect(st).toEqual([
      { soort: 'begin', k: null, waarde: 3375, aard: null },
      { soort: 'potje', k: 'vices', waarde: 83, aard: 'pastniet' },
      { soort: 'potje', k: 'boodschappen', waarde: 61, aard: 'voor' },
      { soort: 'rest', k: null, waarde: -847, aard: null },
      { soort: 'eind', k: null, waarde: 2672, aard: null },
    ]);
  });
  test('de afgeronde stappen tellen exact op tot de uitkomst, en die is die van de sheet', async ({ page }) => {
    await boot(page); await grip(page);
    const r = await page.evaluate(() => {
      const kol = [...document.querySelectorAll('#gripDezeMaand [data-brugstap]')].map((e) => [e.dataset.brugstap, +e.dataset.brugwaarde]);
      openGripVooruit();
      return { kol, sheet: +document.getElementById('gripVooruit').dataset.projectie,
        kaart: +document.querySelector('#gripDezeMaand [data-vooruit]').dataset.vooruit };
    });
    const begin = r.kol[0][1], eind = r.kol[r.kol.length - 1][1];
    const som = r.kol.slice(1, -1).reduce((a, x) => a + x[1], begin);
    expect(som).toBe(eind);
    expect(eind).toBe(2672);
    expect(r.sheet).toBe(eind);
    expect(r.kaart).toBe(eind);
  });
  test('met delen van euro: afgeronde stappen tellen op tot de uitkomst (grootste rest)', async ({ page }) => {
    // invoermeting: een euro extra in september maakt het gemiddelde van Vices en Boodschappen een derde
    await boot(page, { extraTx: [
      { id: 'vx', date: '2026-09-22', amount: -1, name: 'Coffeeshop', desc: 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING' },
      { id: 'ax', date: '2026-09-22', amount: -1, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
      return { over: V.potjes.map((x) => x.overR), st: Br.stappen.map((s) => s.waarde), proj: V.projectie, bud: V.budget }; });
    expect(r.over.some((x) => Math.abs(x - Math.round(x)) > 0.3)).toBe(true);
    const som = r.st.slice(1, -1).reduce((a, x) => a + x, r.st[0]);
    expect(r.st[0]).toBe(r.bud);
    expect(som).toBe(r.proj);
    expect(r.st[r.st.length - 1]).toBe(r.proj);
  });
  test('de regel boven de bridge: uitkomst en verschil met het budget', async ({ page }) => {
    await boot(page); await grip(page);
    const t = await page.locator('#gripDezeMaand [data-dmregel]').innerText();
    expect(t.replace(/\s+/g, ' ')).toContain('€2.672 · €703 onder budget');
  });
});

test.describe('b. de oorzaak: past niet in je potje tegen loopt voor', () => {
  test('de zin op de kaart, zonder oordeel', async ({ page }) => {
    await boot(page); await grip(page);
    const z = await page.locator('#gripDezeMaand [data-dmzin]').innerText();
    expect(z).toBe('Vices past niet in zijn potje; Boodschappen loopt voor; de rest samen €847 onder.');
    expect(z).not.toMatch(/Vices loopt voor/);
  });
  test('de invoer draagt beide gevallen: Vices niets uitgegeven, Boodschappen boven het normale tempo', async ({ page }) => {
    await boot(page); await grip(page);
    const P = await page.evaluate(() => Object.fromEntries(maandVooruit().potjes.map((x) => [x.k, { uit: x.uit, typisch: x.typisch, patroon: x.patroon, bud: x.bud }])));
    expect(P.vices).toEqual({ uit: 0, typisch: 0, patroon: 133, bud: 50 });
    expect(P.boodschappen.uit).toBeGreaterThan(P.boodschappen.typisch);
    expect(P.boodschappen.patroon).toBeLessThanOrEqual(P.boodschappen.bud);
  });
  test('de sheet noemt dezelfde oorzaak per potje', async ({ page }) => {
    await boot(page); await grip(page);
    const r = await page.evaluate(() => { openGripVooruit();
      const v = document.querySelector('[data-handeling="vices"]'), b = document.querySelector('[data-handeling="boodschappen"]');
      return { v: v.innerText, va: v.querySelector('[data-aard]').dataset.aard, b: b.innerText, ba: b.querySelector('[data-aard]').dataset.aard,
        bijV: !!v.querySelector('[data-bijstellen]'), bijB: !!b.querySelector('[data-bijstellen]') }; });
    expect(r.va).toBe('pastniet');
    expect(r.v).toContain('Past niet in je potje');
    expect(r.v).not.toMatch(/Loopt voor/i);
    expect(r.ba).toBe('voor');
    expect(r.bijV).toBe(true);
    expect(r.bijB).toBe(false);
  });
  test('zonder hoger tempo geen "loopt voor": Boodschappen op zijn normale tempo', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { const t = TX.find((x) => x.date === '2026-10-03' && x.amount === -200); t.amount = -100; save(); });
    await grip(page);
    const a = await page.evaluate(() => maandVooruit().potjes.find((x) => x.k === 'boodschappen').aard);
    expect(a).toBe('');
  });
});

test.describe('c. de as', () => {
  test('de ondergrens staat op de as als hij niet bij nul begint', async ({ page }) => {
    await boot(page); await grip(page);
    const b = await page.locator('#gripDezeMaand [data-asbasis]').getAttribute('data-asbasis');
    expect(+b).toBe(2000);
    expect(await page.locator('#gripDezeMaand [data-asbasis]').innerText()).toContain('€2.000');
  });
  test('bij grote stappen begint de as bij nul en staat er geen ondergrens', async ({ page }) => {
    await boot(page, { extraTx: [{ id: 'groot', date: '2026-10-05', amount: -5000, name: 'Restaurant Lona', desc: 'BEA, BETAALPAS RESTAURANT LONA' }] });
    await grip(page);
    const r = await page.evaluate(() => ({ basis: dezeMaandBrug(maandVooruit()).basis, as: document.querySelectorAll('#gripDezeMaand [data-asbasis]').length }));
    expect(r.basis).toBe(0);
    expect(r.as).toBe(0);
  });
});

test.describe('d. hooguit drie potjes los, de rest samen', () => {
  const set = { budgets: { huur: 1450, verzekering: 675, abonnement: 100, sport: 600, vices: 50, boodschappen: 500, uiteten: 100, shopping: 300 } };
  test('gekozen op de grootte van de afwijking, onder gedempt en boven in de kleur voor boven', async ({ page }) => {
    await boot(page, { set }); await grip(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), Br = dezeMaandBrug(V);
      const kleur = [...document.querySelectorAll('#gripDezeMaand [data-brugstap="potje"] i')].map((i) => i.style.background).filter(Boolean);
      return { st: Br.stappen.map((s) => [s.soort, s.k || '', s.waarde]), budget: V.budget, proj: V.projectie, kleur }; });
    expect(r.st.filter((s) => s[0] === 'potje').map((s) => s[1])).toEqual(['shopping', 'uiteten', 'vices']);
    expect(r.st.find((s) => s[1] === 'shopping')[2]).toBe(-300);
    expect(r.st.find((s) => s[1] === 'uiteten')[2]).toBe(175);
    expect(r.kleur).toEqual(['var(--mut2)', 'var(--red)', 'var(--red)']);
    // Boodschappen valt in de rest, en de stappen tellen nog steeds exact op.
    const som = r.st.slice(1, -1).reduce((a, s) => a + s[2], r.st[0][2]);
    expect(r.st[0][2]).toBe(r.budget);
    expect(som).toBe(r.proj);
    expect(r.st.find((s) => s[0] === 'rest')[2]).toBe(r.proj - r.budget + 300 - 175 - 83);
  });
  test('de zin noemt wat eronder blijft', async ({ page }) => {
    await boot(page, { set }); await grip(page);
    const z = await page.locator('#gripDezeMaand [data-dmzin]').innerText();
    expect(z).toContain('Online shopping blijft eronder');
  });
});

test.describe('e. potje bijstellen: eerst het gevolg, dan schrijven', () => {
  test('openen schrijft niets en toont het gevolg', async ({ page }) => {
    await boot(page); await grip(page);
    const r = await page.evaluate(() => { const voor = localStorage.getItem('minder_set'); openGripVooruit();
      document.querySelector('[data-bijstellen="vices"]').click();
      const s = document.getElementById('potjeBijstel');
      return { naar: +s.dataset.naar, gevolg: s.querySelector('[data-bijstelgevolg]').innerText, gelijk: localStorage.getItem('minder_set') === voor,
        next: (SET.budgetsNext || {}).vices }; });
    expect(r.naar).toBe(135);
    expect(r.gevolg).toContain('vanaf november');
    expect(r.gevolg).toContain('blijft je potje €50');
    expect(r.gevolg).toContain('van €3.375 naar €3.460');
    expect(r.gelijk).toBe(true);
    expect(r.next).toBeUndefined();
  });
  test('bevestigen zet het potje van volgende maand, deze maand blijft', async ({ page }) => {
    await boot(page); await grip(page);
    const r = await page.evaluate(() => { openPotjeBijstel('vices');
      [...document.querySelectorAll('#potjeBijstel button')].find((b) => b.innerText === 'Potje bijstellen').click();
      return { next: SET.budgetsNext.vices, nu: SET.budgets.vices }; });
    expect(r.next).toBe(135);
    expect(r.nu).toBe(50);
  });
  test('alleen een potje dat niet past heeft een voorstel', async ({ page }) => {
    await boot(page); await grip(page);
    expect(await page.evaluate(() => potjeBijstelVoorstel('boodschappen'))).toBeNull();
  });
});

test.describe('f. de coachregel staat in de pop-up van de maandafsluiting', () => {
  test('niet op de kaart, wel in de afsluiting als hij er is', async ({ page }) => {
    await boot(page); await grip(page);
    const r = await page.evaluate(() => {
      const ing = maandCoachIngang(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())));
      const kaart = document.querySelectorAll('#gripDezeMaand [data-coachingang]').length;
      openAfsluiting('2026-09');
      return { ing: !!ing, kaart, pop: document.querySelectorAll('#sheet [data-coachingang]').length };
    });
    expect(r.kaart).toBe(0);
    expect(r.pop).toBe(r.ing ? 1 : 0);
  });
  test('de bron: de kaart noemt de ingang niet, de pop-up wel', async ({ page }) => {
    await boot(page);
    const kaart = await kaalUit(page, 'dezeMaandKaart'), pop = await kaalUit(page, 'renderAfsluitSheet');
    expect(kaart).not.toContain('maandCoachIngang(');
    expect(pop).toContain('maandCoachIngang(');
  });
});

test.describe('g. dynamisch met elke boeking', () => {
  test('een boeking op Vices verandert de kaart en de sheet samen', async ({ page }) => {
    await boot(page); await grip(page);
    const r = await page.evaluate(() => {
      TX.push({ id: 'vic10', date: '2026-10-06', amount: -40, acc: 'NL01MAIN0000001111', name: 'Coffeeshop', desc: 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
      TX.forEach(categorize); save(); renderMaand();
      const kaart = +document.querySelector('#gripDezeMaand [data-vooruit]').dataset.vooruit;
      const vices = +document.querySelector('#gripDezeMaand [data-brugstap="potje"]').dataset.brugwaarde;
      openGripVooruit();
      return { kaart, vices, sheet: +document.getElementById('gripVooruit').dataset.projectie };
    });
    expect(r.kaart).toBe(2712);
    expect(r.vices).toBe(123);
    expect(r.sheet).toBe(2712);
  });
});

test.describe('h. hoogte op 360 en 390px', () => {
  // Voor v349: kaart 145/127px, Grip 400/382px. Na: de bridge kost de rest.
  const NA = { 360: { kaart: 271, grip: 525 }, 390: { kaart: 260, grip: 514 } };
  for (const w of [360, 390]) test('breedte ' + w, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await boot(page); await grip(page);
    const r = await page.evaluate(() => { const k = document.getElementById('gripDezeMaand'), kr = k.getBoundingClientRect();
      return { kaart: Math.round(kr.height), grip: Math.round(document.getElementById('s-maand').scrollHeight),
        over: [...k.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > kr.right + 0.5).length,
        horiz: document.documentElement.scrollWidth > window.innerWidth }; });
    expect(r.kaart).toBe(NA[w].kaart);
    expect(r.grip).toBe(NA[w].grip);
    expect(r.over).toBe(0);
    expect(r.horiz).toBe(false);
  });
});
