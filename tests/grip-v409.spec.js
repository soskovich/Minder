/* v409: CADANS, HISTORISCH BUDGET, PERIODIEKE POSTEN EN LET OP. Op grip-v409-stand (10 oktober 2026). */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');

const letop = page => page.evaluate(() => gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), [])
  .map(x => ({ soort: x.soort, key: x.key || '', naam: x.naam, sub: x.sub || '', act: x.act })));

test.describe('1 · cadans: een 4-wekelijkse post heeft in twaalf maanden een maand met twee termijnen', () => {
  test('Shurgard (gemeten afstand 29, laatste €71): te ruim van Huur rekent met €142 in de duurste maand', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const s = recurringSchedule().find(x => x.name === 'Shurgard NL');
      const mnd = []; for (let i = 0; i < 12; i++) { const ym = valtOpYmPlus(thisYM(), i); mnd.push([ym, teRuimTermijnen(s, ym)]); }
      return { c: s.cadans, a: s.afstand, amt: s.amount, mnd, h: teRuimLijst(maandVooruit()).find(x => x.k === 'huur') }; });
    expect([r.c, r.a, r.amt]).toEqual(['4w', 29, 71]);   // invoermeting: met 29 dagen komt de tweede termijn in een maand pas na jaren
    expect(r.mnd.filter(x => x[1] === 2).map(x => x[0])).toEqual(['2027-09']);
    expect(r.mnd.reduce((a, x) => a + x[1], 0)).toBe(13);
    console.log(`Huur na v409: budget ${r.h.bud}, nodig ${r.h.nodig} in ${r.h.maand} (${r.h.reden}), voorstel ${r.h.voorstel}, te ruim ${r.h.teRuim}`);
    expect([r.h.nodig, r.h.maand, r.h.voorstel, r.h.teRuim, r.h.ruim]).toEqual([142, '2027-09', 142, 558, true]);
    expect(r.h.reden).toBe('twee termijnen Shurgard Nl in september');
  });
  test('13 termijnen per jaar: vanaf elke dag van de maand is er in twaalf maanden een maand met twee', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const uit = [];
      for (let d = 1; d <= 28; d++) { const s = { cadans: '4w', afstand: 29, nextDate: new Date(2026, 9, d), intervalM: 1 }; let twee = 0, som = 0;
        for (let i = 0; i < 12; i++) { const n = teRuimTermijnen(s, valtOpYmPlus('2026-10', i)); som += n; if (n > 1) twee++; }
        uit.push([d, som, twee]); }
      return uit; });
    for (const [d, som, twee] of r) { expect(som, 'dag ' + d).toBeGreaterThanOrEqual(13); expect(twee, 'dag ' + d).toBeGreaterThanOrEqual(1); }
  });
  test('ook de ondergrens per maand (potjeMaandVloer) telt de tweede termijn', async ({ page }) => {
    await S.boot(page);
    const v = await page.evaluate(() => potjeMaandVloer('huur', ['2026-07', '2026-08', '2026-09'], '2026-10'));
    expect(v.maand).toBe('2027-09');
    expect(v.posten).toEqual([{ naam: 'Shurgard Nl', bedrag: 71, tweede: true }]);
    expect(v.vloer).toBe(v.gewoon + 71);
  });
});

test.describe('2 · historische maanden tegen het budget van toen, of alle drie tegen het huidige', () => {
  test('zonder bewaarde potjes: alle drie het huidige budget, en de regel zegt "(huidig budget)"', async ({ page }) => {
    await S.boot(page);
    const P = await page.evaluate(() => potMaanden('huur'));
    expect(P.huidig).toBe(true); expect(P.budgets).toEqual([700, 700, 700]);
    const h = (await letop(page)).find(x => x.key === 'huur');
    expect(h.sub).toBe('jul €760 · aug €760 · sep €137 · budget €700 (huidig budget)');
  });
  test('met bewaarde potjes voor elke maand: elke maand tegen zijn eigen budget', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { SET.budgetHist = { '2026-07': { huur: 420, vices: 20 }, '2026-08': { huur: 420, vices: 20 }, '2026-09': { huur: 750, vices: 20 } }; save();
      return { P: potMaanden('huur'), x: potBovenLijst().find(y => y.k === 'huur') }; });
    expect(r.P.huidig).toBe(false);
    expect(r.P.budgets).toEqual([420, 420, 750]);
    expect(r.P.boven).toEqual([true, true, false]);
    const h = (await letop(page)).find(x => x.key === 'huur');
    expect(h.sub).toBe('jul €760 · aug €760 · sep €137 · budget jul €420 · aug €420 · sep €750');
    expect(h.sub).not.toContain('huidig budget');
  });
  test('ontbreekt een maand in de historie, dan nooit twee budgetten door elkaar: alle drie het huidige', async ({ page }) => {
    await S.boot(page);
    const P = await page.evaluate(() => { SET.budgetHist = { '2026-07': { huur: 420 }, '2026-08': { huur: 420 } }; save(); return potMaanden('huur'); });
    expect(P.huidig).toBe(true);
    expect(P.budgets).toEqual([700, 700, 700]);
    const h = (await letop(page)).find(x => x.key === 'huur');
    expect(h.sub).toContain('budget €700 (huidig budget)');
  });
});

test.describe('3 · een bekende periodieke post in zijn maand is geen "boven budget"', () => {
  test('Abonnementen juli €31 is Huurwoningen: geen boven-budget-maand, dus geen "2 van 3"', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => ({ P: potMaanden('abonnement'), s: recurringSchedule().find(x => x.name === 'Huurwoningen Premium'), pb: potBovenLijst().map(x => x.k) }));
    expect([r.s.intervalM, r.s.cat, r.s.amount]).toEqual([3, 'abonnement', 31]);   // invoermeting: een kwartaalpost in Abonnementen
    expect(r.P.bedragen).toEqual([31, 20, 0]);
    expect(r.P.periodiek[0].bedrag).toBe(31);
    expect(r.P.boven).toEqual([false, true, false]);   // zonder de aftrek waren juli en augustus allebei boven: 2 van 3
    expect(r.pb).not.toContain('abonnement');
  });
  test('het potje past er niet omheen: "te krap voor <post> (€X in <maanden>) · voorstel €Y" naar de herzien-sheet', async ({ page }) => {
    await S.boot(page);
    const L = await letop(page), a = L.filter(x => x.key === 'abonnement');
    expect(a.length).toBe(1);
    expect(a[0].soort).toBe('krap');
    expect(a[0].naam).toBe('Abonnementen te krap voor Huurwoningen Premium (€31 in okt · jan · apr · jul) · voorstel €40');
    expect(a[0].act).toBe("openPotHerzien('abonnement')");
    await page.evaluate(() => openPotHerzien('abonnement'));
    await expect(page.locator('#potHerzienSheet [data-phkrap]')).toContainText('te krap voor Huurwoningen Premium');
    await expect(page.locator('[data-phoptie="a"]')).toContainText('Naar het voorstel · €40');
    const r = await page.evaluate(() => { potHerzienKies('a'); window._ph.bron = 'budget'; renderPotHerzien(); potHerzienBevestig(); return SET.budgets.abonnement; });
    expect(r).toBe(40);
    expect((await letop(page)).some(x => x.key === 'abonnement')).toBe(false);
  });
  test('een signaal per potje: is het ook 2 van 3 boven, dan alleen die regel en geen "te krap"', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(({ MAIN }) => { const t = { id: 'v9sepab', date: '2026-09-11', amount: -20, acc: MAIN, name: 'Spotify', desc: 'BEA, BETAALPAS SPOTIFY', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'abonnement'; save(); }, { MAIN: S.MAIN });
    expect(await page.evaluate(() => potKrapLijst().map(x => x.k))).toContain('abonnement');   // invoermeting: ook te krap
    const a = (await letop(page)).filter(x => x.key === 'abonnement');
    expect(a.map(x => x.soort)).toEqual(['boven']);
  });
  test('te krap met de uitschieter-drempel: een paar euro tekort in de duurste maand is geen signaal', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { SET.budgets.abonnement = 36; save(); const v = potjeMaandVloer('abonnement', ['2026-07', '2026-08', '2026-09'], '2026-10');
      return { vloer: v.vloer, krap: potKrapLijst().map(x => x.k) }; });
    expect(r.vloer).toBeGreaterThan(36);   // invoermeting: de duurste maand is wel hoger dan het potje
    expect(r.krap).not.toContain('abonnement');
  });
  test('een post die al in je reserveringen staat, maakt het potje niet te krap', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const s = recurringSchedule().find(x => x.name === 'Huurwoningen Premium');
      SET.reserveringen = (SET.reserveringen || []).concat([{ id: 'rx', naam: 'Huurwoningen', bedrag: 31, interval: 3, volgende: '2026-10', bron: s.key }]); save();
      return potKrapLijst().map(x => x.k); });
    expect(r).not.toContain('abonnement');
  });
  test('de tweede termijn van een 4-wekelijkse post telt ook niet: Huur september 2026 draagt Shurgard twee keer', async ({ page }) => {
    await S.boot(page);
    const P = await page.evaluate(() => potMaanden('huur'));
    expect(P.periodiek[2]).toEqual({ bedrag: 66.26, posten: [{ naam: 'Shurgard Nl', bedrag: 66 }] });
    expect(P.periodiek[0].bedrag).toBe(0);
  });
});

test.describe('4 · potjes in hetzelfde patroon staan in een regel', () => {
  test('met een onttrekking zitten Uit eten en Vices in patroon 1: "2 potjes zitten in patroon 1 · ..."', async ({ page }) => {
    await S.boot(page, { opnames: [['2026-10-06', 300]] });
    const P = await page.evaluate(() => gripPatronen().map(p => ({ id: p.id, ks: (p.sig || []).filter(s => s.soort === 'potje').map(s => s.k) })));
    expect(P[0].id).toBe('spaargeld'); expect(P[0].ks.length).toBeGreaterThanOrEqual(2);   // invoermeting
    const L = await letop(page), pr = L.filter(x => x.soort === 'patroon');
    const in1 = pr.filter(x => /patroon 1\b/.test(x.naam));
    expect(in1.length).toBe(1);
    // de potjes die anders een eigen regel hadden (een signaal deze maand of n van 3 boven); Boodschappen heeft er geen
    expect(in1[0].naam).toBe('2 potjes zitten in patroon 1 · Uit eten & café, Vices');
    expect(in1[0].act).toBe("gripNaarBegrijpen('spaargeld')");
  });
  test('een potje alleen in zijn patroon houdt "<potje> · zit in patroon n"', async ({ page }) => {
    await S.boot(page);
    const pr = (await letop(page)).filter(x => x.soort === 'patroon');
    expect(pr.map(x => x.naam)).toEqual(['Uit eten & café · zit in patroon 1', 'Vices · zit in patroon 2']);
  });
});

test.describe('5 · potje maken bij een stijgende trend: drie voorstellen, geen voorselectie', () => {
  test('Kinderen: laatste maand €136, gemiddelde van de laatste 2 €86, reservering in Plan', async ({ page }) => {
    await S.boot(page);
    const k = (await letop(page)).find(x => x.key === 'e_kinderen');
    expect(k.sub).toBe('potje €136 of €86, of reservering in Plan €15/mnd · stijgt: jul €4 · aug €35 · sep €136');
    const r = await page.evaluate(() => { openZonderKeuze('e_kinderen'); return { o: [...document.querySelectorAll('[data-zkoptie]')].map(e => [e.dataset.zkoptie, e.dataset.gekozen, e.querySelector('span span').textContent]), knop: document.querySelector('[data-zkbevestig]').disabled }; });
    expect(r.o.map(x => x[0])).toEqual(['pot', 'pot2', 'res']);
    expect(r.o.every(x => x[1] === '0')).toBe(true);
    expect(r.o.map(x => x[2])).toEqual(['Potje maken · €136 per maand', 'Potje maken · €86 per maand', 'Reservering in Plan · €15 per maand']);
    expect(r.knop).toBe(true);
  });
  test('het tweede voorstel opent het formulier met €86', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { openZonderKeuze('e_kinderen'); window._zk.optie = 'pot2'; renderZonderKeuze(); zonderKeuzeZet(); });
    await expect(page.locator('[data-potvoorstel]')).toHaveAttribute('data-potvoorstel', '86');
    await expect(page.locator('[data-potvoorstel]')).toContainText('€86 per maand (het gemiddelde van de laatste 2 maanden)');
  });
});

test.describe('6 · blok 19: het budget per maand en de cadans van de periodieke posten', () => {
  test('per potje het gebruikte budget per maand met de bron, en per post de cadans en de dubbele maanden', async ({ page }) => {
    await S.boot(page);
    const d = await page.evaluate(() => diagEenSignaal(maandVooruit()));
    const tekst = d.join('\n');
    expect(tekst).toContain('  Huur: jul 760/700* · aug 760/700* · sep 137/700 -66 Shurgard Nl | huidig budget voor alle drie');
    expect(tekst).toContain('  Abonnementen: jul 31/5 -31 Huurwoningen Premium · aug 20/5* · sep 0/5 |');
    expect(tekst).toContain('te krap, voorstel 40');
    expect(tekst).toContain('  Shurgard Nl | Huur | 4-wekelijks (gemeten afstand 29 dagen, vooruit 28) | 71 | dubbel in sep 2027 2x');
    expect(tekst).toContain('  Huurwoningen Premium | Abonnementen | elke 3 maanden | 31 | okt 2026, jan 2027, apr 2027, jul 2027');
    await page.evaluate(() => { SET.budgetHist = { '2026-07': { huur: 420 }, '2026-08': { huur: 420 }, '2026-09': { huur: 750 } }; save(); });
    const d2 = (await page.evaluate(() => diagEenSignaal(maandVooruit()))).join('\n');
    expect(d2).toContain('  Huur: jul 760/420* · aug 760/420* · sep 137/750 -66 Shurgard Nl | bewaarde potjes per maand');
    console.log(d.join('\n'));
  });
});

test.describe('fit op 390x844', () => {
  for (const [naam, o] of [['zonder onttrekking', {}], ['met onttrekking', { opnames: [['2026-10-06', 300]] }]]) {
    test(`Zien en Let op (open) passen, ${naam}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await S.boot(page, o);
      const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand');
        const knop = document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav = document.querySelector('.nav').getBoundingClientRect().top;
        return { knop, nav, kol: document.querySelectorAll('#gripBrug [data-brugstap]').length, sw: document.documentElement.scrollWidth }; });
      console.log(`zien 390 (${naam}): ${r.kol} kolommen, knop ${Math.round(r.knop)}px, menubalk ${Math.round(r.nav)}px`);
      expect(r.knop).toBeLessThanOrEqual(r.nav); expect(r.sw).toBeLessThanOrEqual(390);
      const s = await page.evaluate(() => { openGripLetOpLijst(); const sh = document.querySelector('#sheet');
        return { h: sh.getBoundingClientRect().height, sh: sh.scrollHeight, ch: sh.clientHeight, vh: innerHeight, sw: document.documentElement.scrollWidth, n: sh.querySelectorAll('[data-letop]').length }; });
      console.log(`let op open 390 (${naam}): ${s.n} regels, sheet ${Math.round(s.h)}px van ${s.vh}, scroll ${s.sh}/${s.ch}`);
      expect(s.n).toBeGreaterThan(0); expect(s.sh).toBeLessThanOrEqual(s.ch + 1); expect(s.sw).toBeLessThanOrEqual(390);
    });
  }
});
