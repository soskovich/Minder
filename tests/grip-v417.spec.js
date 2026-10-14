/* v417: EEN POTJE DAT BOVEN BUDGET IS MET EEN PERIODIEKE POST (beslissing van de gebruiker op v416). Op grip-v409-stand
   (10 oktober 2026). Abonnementen: budget EUR 5, gewone maand EUR 20, Huurwoningen Premium EUR 31 in oktober. De gewone maand
   ligt al boven het budget, dus het is "boven budget" en niet "te krap". In de herzien-sheet telt het voorstel de post mee:
   potNodig(), met een regel "inclusief <post> EUR X in <maand>". Zonder periodieke post blijft het voorstel het gemiddelde. */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');

/* De stand van het toestel (GECONSTRUEERD): Spotify EUR 20 ook in juli en september, dus de gewone maand is EUR 20 tegen een
   budget van EUR 5. Op de kale grip-v409-stand is de gewone maand nul en is Abonnementen te krap (v416). */
const toestel = page => page.evaluate(({ MAIN }) => {
  for (const d of ['2026-07-11', '2026-09-11']) { const t = { id: 'v417' + d, date: d, amount: -20, acc: MAIN, name: 'Spotify', desc: 'BEA, BETAALPAS SPOTIFY', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = 'abonnement'; }
  save(); render(); }, { MAIN: S.MAIN });
const boot = async page => { await S.boot(page); await toestel(page); };
const stand = (page, k) => page.evaluate(k => { const V = maandVooruit(), N = potNodig(k, V), b = potBovenLijst().find(x => x.k === k);
  openPotHerzien(k); const x = potHerzienStand().x, el = document.querySelector('[data-phoptie="a"]'), inc = document.querySelector('[data-phinclusief]');
  return { boven: !!b, krap: potKrapLijst().some(y => y.k === k), bud: b && b.bud, oud: b && b.voorstel, nodig: N.nodig, nvoorstel: N.voorstel,
    opbouw: potNodigTekst(N), maand: N.maand, gewoon: potKrapGewoon(potMaanden(k, thisYM())), voorstel: x.voorstel, optie: el && el.innerText.replace(/\s+/g, ' ').trim(), inc: inc && inc.innerText.trim(),
    nInc: document.querySelectorAll('[data-phinclusief]').length }; }, k);

test.describe('Abonnementen: boven budget, voorstel met de post', () => {
  test('boven en niet te krap, want de gewone maand ligt al boven het budget', async ({ page }) => {
    await boot(page); const r = await stand(page, 'abonnement');
    expect(r.bud).toBe(5); expect(r.gewoon).toBe(20);   // invoermeting: gewone maand 20 tegen budget 5
    expect(r.boven).toBe(true);
    expect(r.krap).toBe(false);
  });
  test('het voorstel is minstens potNodig() (51 of meer), en hoger dan het oude gemiddelde', async ({ page }) => {
    await boot(page); const r = await stand(page, 'abonnement');
    console.log(`v417 opbouw: ${r.opbouw}`);
    expect(r.nodig).toBeGreaterThanOrEqual(51); expect(r.maand).toBe('2026-10');   // gewone maand 20 + Huurwoningen 31 (variabel verwacht kan op deze dag 21 zijn)
    expect(r.oud).toBeLessThan(51);   // invoermeting: het gemiddelde haalt het niet
    expect(r.voorstel).toBeGreaterThanOrEqual(51);
    expect(r.voorstel).toBeGreaterThanOrEqual(r.nodig);
    expect(r.voorstel).toBe(Math.max(r.nvoorstel, r.oud));
    expect(r.optie).toContain(`Naar het voorstel · €${r.voorstel}`);
  });
  test('onder het voorstel staat een regel: inclusief de post, het bedrag en de maand', async ({ page }) => {
    await boot(page); const r = await stand(page, 'abonnement');
    expect(r.nInc).toBe(1);
    expect(r.inc).toBe('inclusief Huurwoningen Premium €31 in oktober 2026');
    expect(r.optie).not.toContain('gemiddeld over de 3 maanden');
  });
  test('bevestigen zet het potje op het voorstel met de post', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { openPotHerzien('abonnement'); const v = potHerzienStand().x.voorstel; potHerzienKies('a'); window._ph.bron = 'budget'; potHerzienBevestig();
      return { v, bud: Math.round(+SET.budgets.abonnement) }; });
    expect(r.v).toBeGreaterThanOrEqual(51);
    expect(r.bud).toBe(r.v);
  });
});

test.describe('een boven-potje zonder periodieke post houdt het gemiddelde', () => {
  test('Vices: geen regel, het voorstel is het gemiddelde afgerond op 5', async ({ page }) => {
    await S.boot(page); const r = await stand(page, 'vices');
    expect(r.boven).toBe(true);
    expect(r.nInc).toBe(0);
    expect(r.voorstel).toBe(r.oud);
    expect(r.optie).toContain('gemiddeld over de 3 maanden, afgerond op 5');
  });
});

test.describe('fit 390x844', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('de herzien-sheet van Abonnementen past, de regel op een regel, geen overloop', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openPotHerzien('abonnement'));
    await page.waitForTimeout(600);
    const r = await page.evaluate(() => { const sh = document.getElementById('sheet'), inc = document.querySelector('[data-phinclusief]'), k = document.querySelector('[data-phbevestig]').getBoundingClientRect();
      return { sh: sh.scrollHeight, ch: sh.clientHeight, sw: sh.scrollWidth, cw: sh.clientWidth, h: inc.getBoundingClientRect().height, knop: k.bottom, vh: innerHeight }; });
    console.log(`v417 fit herzien Abonnementen: ${r.sh}px van ${r.ch}px, regel ${Math.round(r.h)}px, knop ${Math.round(r.knop)}px`);
    expect(r.h).toBeLessThanOrEqual(20);
    expect(r.sh).toBeLessThanOrEqual(r.ch);
    expect(r.knop).toBeLessThanOrEqual(r.vh);
    expect(r.sw).toBeLessThanOrEqual(r.cw);
  });
});
