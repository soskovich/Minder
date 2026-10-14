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

/* Punt 3: EEN BRON VOOR "ZONDER POTJE", een keer afgerond na het optellen. GEMELD op het toestel: Zien 206 (168 + 37) tegen
   205 (204,69) in de controleregel; de oorzaak was een "n boven" onder BRUG_KLEIN die bij de laatste stap aan dezelfde kant
   aanschoof, en dat was de stap "z. potje". Op grip-v409-stand: geboekt 159 + verwacht 188,33 = 347. */
const zonder = page => page.evaluate(() => { const V = maandVooruit(), Z = V.zonderStand, B = gripZienBrug(V), st = B.stappen.find(s => s.soort === 'zonder') || B.stappen.find(s => s.soort === 'overig' && s.zonderIn);
  const blok = diagZonderPotje(V).join('\n'); openZonderPotje(); const sh = +document.getElementById('zonderPotjeSheet').dataset.zonder; closeSheet();
  return { zonder: V.zonder, exact: V.zonderExact, som: Z.geboekt + Z.verwacht + (V.zonderLosPosten || []).reduce((a, x) => a + x.bedrag, 0),
    stap: st ? (st.soort === 'zonder' ? st.waarde : st.zonderIn) : null, sheet: sh, blok }; });
test.describe('3 · een bron voor zonder potje', () => {
  test('geboekt + verwacht, een keer afgerond: Zien, de sheet en blok 19 lezen hetzelfde getal', async ({ page }) => {
    await S.boot(page); const r = await zonder(page);
    expect(r.exact).toBe(r.som);
    expect(Math.round(r.som * 100)).not.toBe(Math.round(r.som) * 100);   // invoermeting: er zijn centen
    expect(r.zonder).toBe(Math.round(r.som));
    expect(r.zonder).toBe(347);
    expect(r.stap).toBe(347);
    expect(r.sheet).toBe(347);
    expect(r.blok).toContain('V.zonder 347 = afgerond(347.33) = geboekt 159 + verwacht 188.33');
    expect(r.blok).toContain('stap op Zien 347: gelijk');
  });
  test('centen: een keer afronden na het optellen, niet per deel', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(({ MAIN }) => { const Z = maandVooruit().zonderStand, k = Z.rijen.find(x => x.telt && x.geboekt > 0).k;
      const t = { id: 'v417c', date: thisYM() + '-02', amount: -0.4, acc: MAIN, name: 'Kiosk', desc: 'BEA, BETAALPAS KIOSK', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = k; save(); }, { MAIN: S.MAIN });
    const r = await zonder(page);
    expect(Math.round(r.som * 100) / 100).toBe(347.73);   // invoermeting: 159,40 + 188,33
    expect(r.zonder).toBe(348);   // per deel zou 159 + 188 = 347 zijn
    expect(r.stap).toBe(348); expect(r.sheet).toBe(348);
  });
  test('een kleine "n boven" schuift niet bij de stap zonder potje aan', async ({ page }) => {
    await require('./grip-v406-stand').boot(page);   // daar staat zonder potje als eigen stap
    const r = await page.evaluate(() => { const V = maandVooruit(), los = new Set(uitschieters(V).map(x => x.k));
      const x = V.potjes.find(p => !los.has(p.k) && p.overR < -20 && !teRuim(V).some(t => t.k === p.k)); const d = x.bud + 4.3 - x.eindR;
      x.eindR += d; x.overR += d; x.eind = Math.round(x.eindR); V.projectie += d;
      const B = gripZienBrug(V, []), z = B.stappen.find(s => s.soort === 'zonder'), opg = B.stappen.find(s => s.bij);
      return { zonder: V.zonder, z: z && z.waarde, g: z && z.geboekt, v: z && z.verwacht, zbij: z && z.bij, opg: !!opg }; });
    expect(r.opg).toBe(true);   // invoermeting: er is een kleine stap die aanschuift
    expect(r.zbij).toBeFalsy();
    expect(r.z).toBe(r.zonder);
    expect(r.g + r.v).toBe(r.zonder);
  });
});

/* Punt 4: de signaalrij is de afgeronde maanden van de berekening (potVarMaanden(), dezelfde als potNodig()). Een herkende
   vaste last (GECONSTRUEERD: Kinderopvang EUR 47 per maand in Vices) staat apart als "vast". */
const kinderopvang = page => page.evaluate(({ MAIN }) => {
  for (const d of ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05']) { const t = { id: 'v417k' + d, date: d, amount: -47, acc: MAIN, name: 'Kinderopvang Zon', desc: 'SEPA INCASSO KINDEROPVANG ZON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = 'vices'; }
  save(); render(); }, { MAIN: S.MAIN });
test.describe('4 · de signaalrij is de berekening', () => {
  test('voor elk potje: de maanden van de signaalrij zijn de afgeronde maanden van maandVooruit()', async ({ page }) => {
    await boot(page); await kinderopvang(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); return V.potjes.map(va => ({ k: va.k, calc: va.maanden.slice().reverse(), rij: potMaanden(va.k).bedragen })); });
    expect(r.length).toBeGreaterThan(3);
    for (const x of r) expect(x.rij, x.k).toEqual(x.calc);
  });
  test('Vices: de vaste last staat apart, en boven rekent met wat er uitging', async ({ page }) => {
    await S.boot(page); await kinderopvang(page);
    const r = await page.evaluate(() => { const P = potMaanden('vices'), b = potBovenLijst().find(x => x.k === 'vices'); window._gripTab = 'zien'; go('maand');
      const lo = gripLetOpItems().find(x => x.key === 'vices'); return { P, sub: lo && lo.sub, tekst: b && potReeksTekst(b), blok: diagEenSignaal(maandVooruit()).join('\n') }; });
    expect(r.P.vast).toEqual([47, 47, 47]);   // invoermeting: herkend als vaste last
    expect(r.P.bedragen).toEqual([171, 94, 96]);
    expect(r.P.totaal).toEqual([218, 141, 143]);
    expect(r.P.boven).toEqual([true, true, true]);
    expect(r.tekst).toBe('jul €171 · aug €94 · sep €96 · vast €47 per maand');
    if (r.sub) expect(r.sub).toContain('vast €47 per maand');
    expect(r.blok).toContain('jul 171+47 vast/20');
  });
  test('boven rekent met wat er uitging: alleen met de vaste last erbij komt Vices boven 100', async ({ page }) => {
    await S.boot(page); await kinderopvang(page);
    const r = await page.evaluate(() => { SET.budgets.vices = 100; save(); return potMaanden('vices'); });
    expect(r.bedragen.filter(v => v > 100).length).toBe(1);   // invoermeting: zonder de vaste last maar een maand erboven
    expect(r.boven).toEqual([true, true, true]);
  });
});

/* Punt 5: een gestopte post heeft geen maanden in de komende 12, telt niet in potNodig() en staat niet als post in het
   te-ruim-rapport. Huurwoningen Premium (kwartaal, Abonnementen) op grip-v409-stand. */
test.describe('5 · gestopt is gestopt', () => {
  test('geen termijnen, "-" in blok 19, niet in potNodig, niet in het rapport', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const s = recurringSchedule().find(x => x.key === 'HUURWONINGEN PREMIUM'), key = s.key, V0 = maandVooruit();
      const voor = potNodig('abonnement', V0).nodig;
      const termVoor = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(i => teRuimTermijnen(s, valtOpYmPlus(thisYM(), i))).length;
      postZet(key, 'gestopt'); const V = maandVooruit(), s2 = recurringSchedule(true).find(x => x.key === key);
      const term = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].filter(i => teRuimTermijnen(s2, valtOpYmPlus(thisYM(), i))).length;
      const regel = diagPeriodiekePosten(thisYM()).find(l => /Huurwoningen Premium/.test(l)), rapport = diagTeRuim().join('\n');
      const N = potNodig('abonnement', V), T = potNodigTekst(N);
      return { termVoor, term, voor, na: N.nodig, per: N.periodiek.map(x => x.key), key, tekst: T, regel, inRapport: /post Huurwoningen Premium/.test(rapport) }; });
    expect(r.termVoor).toBeGreaterThan(0);   // invoermeting
    expect(r.voor).toBe(51);
    expect(r.term).toBe(0);
    expect(r.per).not.toContain(r.key);
    expect(r.tekst).not.toContain('Huurwoningen');
    expect(r.na).toBeLessThan(r.voor);
    expect(r.regel).toMatch(/gestopt.* \| -$/);
    expect(r.inRapport).toBe(false);
  });
});
