/* v408: EEN SIGNAAL PER POTJE, MAANDNAMEN OUD NAAR NIEUW, BOVEN BUDGET MET DE UITSCHIETER-DREMPEL, LET OP VERWIJST NAAR
   PATRONEN, STIJGENDE TREND, EN DE BRUG ZONDER TWEE KEER "OVERIG". Op grip-v408-stand (10 oktober 2026). */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v408-stand');

const letop = page => page.evaluate(() => gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), [])
  .map(x => ({ soort: x.soort, key: x.key || '', naam: x.naam, sub: x.sub || '', act: x.act, groep: x.groep || '', bedrag: x.bedrag })));
const brug = page => page.evaluate(() => { const V = maandVooruit(); const Br = gripZienBrug(V);
  return { st: Br.stappen.map(s => ({ soort: s.soort, k: s.k || '', label: s.label, waarde: s.waarde, zonderIn: s.zonderIn || 0 })), verschil: Br.verschil, P: Math.round(V.projectie), B: Math.round(V.budget) }; });
const MAANDREEKS = /^(jan|feb|mrt|apr|mei|jun|jul|aug|sep|okt|nov|dec) /;

test.describe('A1 · een potje dat te ruim is krijgt geen "boven budget"; met een breuk is het "veranderd"', () => {
  test('invoermeting: Huur is te ruim en eindigde in 2 van 3 maanden boven zijn budget', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => ({ tr: teRuim(maandVooruit()).map(x => x.k), boven: potBovenLijst().map(x => [x.k, x.n]), P: potMaanden('huur') }));
    expect(r.tr).toContain('huur');
    expect(r.boven).toContainEqual(['huur', 2]);
    console.log(`Huur in de nagebouwde stand: ${r.P.ms.map((m, i) => `${m} ${r.P.bedragen[i]} (budget ${r.P.budgets[i]})`).join(', ')}`);
    expect(r.P.bedragen).toEqual([760, 760, 137]);
  });
  test('Huur: een regel "veranderd" met de maanden, geen "2 van 3 mnd boven budget", tik naar de te-ruim-sheet', async ({ page }) => {
    await S.boot(page);
    const L = await letop(page), huur = L.filter(x => x.key === 'huur');
    expect(huur.length).toBe(1);
    expect(huur[0].soort).toBe('veranderd');
    expect(huur[0].naam).toBe('Huur veranderd · was €760/mnd, nu €137');
    expect(huur[0].sub).toBe('jul €760 · aug €760 · sep €137 · budget €700 (huidig budget)');   // v409: geen bewaarde potjes
    expect(huur[0].act).toBe("openTeRuim('huur')");
    expect(L.map(x => x.naam).join('|')).not.toMatch(/Huur · \d van 3 mnd boven budget/);
    await page.evaluate(() => { openTeRuim('huur'); });
    await expect(page.locator('#sheet')).toContainText('Huur');
    await expect(page.locator('[data-teruimoptie="a"]')).toHaveCount(1);
    await expect(page.locator('[data-teruimoptie="c"]')).toHaveCount(1);
  });
  test('ook een breuk in het verwachte eind: september nog oud, oktober verwacht laag', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(({ MAIN }) => { const t = { id: 'x8sep', date: '2026-09-02', amount: -623, acc: MAIN, name: 'Woningstichting Oud', desc: 'X', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'huur'; save(); }, { MAIN: S.MAIN });
    const L = await letop(page), h = L.find(x => x.key === 'huur');
    expect(h.soort).toBe('veranderd');
    expect(h.naam).toMatch(/^Huur veranderd · was €760\/mnd, nu €\d+$/);
    expect(h.sub).toMatch(/^jul €760 · aug €760 · sep €760 · okt verwacht €\d+ · budget €700 \(huidig budget\)$/);
  });
  test('te ruim zonder breuk: geen regel over Huur in Let op (Zien zegt het, niet gebruikt)', async ({ page }) => {
    await S.boot(page);
    /* in deze stand heeft Huur een breuk; zonder breuk (potBreuk geeft niets) mag er geen "boven budget" voor in de plaats komen */
    const r = await page.evaluate(() => { const echt = window.potBreuk; window.potBreuk = () => null;
      const L = gripLetOpItems([], [], []).filter(x => x.key === 'huur').map(x => x.soort); window.potBreuk = echt; return L; });
    expect(r).toEqual([]);
  });
  test('zonder breuk geen regel: te ruim staat op Zien (potBreuk geeft dan niets)', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => ({ geen: potBreuk({ ms: ['2026-07', '2026-08', '2026-09'], bedragen: [100, 100, 90] }, 95),
      sep: potBreuk({ ms: ['2026-07', '2026-08', '2026-09'], bedragen: [100, 100, 40] }, 95), eind: potBreuk({ ms: ['2026-07', '2026-08', '2026-09'], bedragen: [100, 100, 90] }, 40) }));
    expect(r.geen).toBeNull();
    expect(r.sep).toEqual({ was: 100, nu: 40, ym: '2026-09', verwacht: false });
    expect(r.eind).toEqual({ was: 97, nu: 40, ym: null, verwacht: true });
  });
});

test.describe('A2 · laten staan geldt deze maand voor alle signalen van dat potje', () => {
  test('herzien laten staan op Vices: geen regel over Vices in Let op, in geen enkele vorm', async ({ page }) => {
    await S.boot(page);
    expect((await letop(page)).some(x => x.key === 'vices' || /Vices/.test(x.naam))).toBe(true);   // invoermeting
    await page.evaluate(() => { const ym = thisYM(); SET.potHerzienLaten = { [ym]: { vices: { op: vandaagYMD(), reden: '' } } }; save(); });
    expect((await letop(page)).some(x => x.key === 'vices' || /Vices/.test(x.naam))).toBe(false);
  });
  test('laten staan in de te-ruim-sheet op Huur: geen "veranderd", de feitregel zegt zelf gekozen, Kiezen vraagt niets', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => teRuimLaten('huur', ''));
    const L = await letop(page);
    expect(L.some(x => x.key === 'huur')).toBe(false);
    const r = await page.evaluate(() => ({ zelf: teRuimZelf('huur'), kiezen: gripTeRuimHerzien().map(x => x.k) }));
    expect(r.zelf).toBe(true); expect(r.kiezen).not.toContain('huur');
  });
  test('"Zo laten" op het signaal van Vices haalt ook zijn regel uit de afgelopen maanden weg', async ({ page }) => {
    await S.boot(page);
    /* Vices staat ook in potBovenLijst (3 van 3 mnd): zonder potLaten() zou de verwijzing via die lijst blijven staan,
       terwijl het signaal van deze maand vanzelf verdwijnt zodra het een actie draagt */
    const voor = await page.evaluate(() => potBovenLijst().map(x => x.k));
    expect(voor).toContain('vices');   // invoermeting
    await page.evaluate(() => { const ym = thisYM(); SET.valtOpLog = SET.valtOpLog || {}; SET.valtOpLog[ym + '|vices'] = Object.assign({}, SET.valtOpLog[ym + '|vices'], { actie: 'zo_gelaten' }); save(); });
    expect((await letop(page)).some(x => x.key === 'vices')).toBe(false);
  });
  test('volgende maand toetst de app opnieuw', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const ym = thisYM(); SET.potHerzienLaten = { [ym]: { vices: { op: vandaagYMD() } } };
      return { nu: potLaten('vices'), volgende: potLaten('vices', valtOpYmPlus(ym, 1)) }; });
    expect(r.nu).toBe(true); expect(r.volgende).toBe(false);
  });
});

test.describe('B3 · maanden altijd met naam, oud naar nieuw', () => {
  test('een potje zonder patroon: "Overig · 2 van 3 mnd boven budget" met de maanden met naam en het budget', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(({ MAIN }) => { for (const d of ['2026-07-25', '2026-08-25']) { const t = { id: 'x8ov' + d, date: d, amount: -220, acc: MAIN, name: 'Hema Winkel', desc: 'X', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'overig'; } save(); }, { MAIN: S.MAIN });
    const o = (await letop(page)).find(x => x.key === 'overig');
    expect(o).toEqual(expect.objectContaining({ soort: 'boven', groep: 'a', naam: 'Overig · 2 van 3 mnd boven budget', sub: 'jul €600 · aug €600 · sep €380 · budget €500 (huidig budget)', act: "openPotHerzien('overig')" }));
    const h = await page.evaluate(() => { openPotHerzien('overig'); return [...document.querySelectorAll('[data-phhist]')].map(e => e.dataset.phhist); });
    expect(h).toEqual(['2026-07', '2026-08', '2026-09']);
  });
  test('elke regel met maandbedragen draagt maandnamen in volgorde oud naar nieuw', async ({ page }) => {
    await S.boot(page);
    const L = await letop(page);
    const met = L.filter(x => /€\d/.test(x.sub) && /(jul|aug|sep)/.test(x.sub));
    expect(met.length).toBeGreaterThanOrEqual(3);
    for (const x of met) { const ms = [...x.sub.matchAll(/\b(jul|aug|sep|okt) €/g)].map(m => m[1]);
      expect(ms, x.naam).toEqual([...ms].sort((a, b) => ['jul', 'aug', 'sep', 'okt'].indexOf(a) - ['jul', 'aug', 'sep', 'okt'].indexOf(b)));
      expect(ms.length, x.naam).toBeGreaterThanOrEqual(3); }
  });
  test('de vorm is een functie die zelf sorteert: nieuw-naar-oud erin geeft oud-naar-nieuw eruit', async ({ page }) => {
    await S.boot(page);
    const t = await page.evaluate(() => maandReeksTekst(['2026-09', '2026-08', '2026-07'], [96, 94, 171]));
    expect(t).toBe('jul €171 · aug €94 · sep €96');
  });
  test('de sheets: potje herzien, te ruim en de keuze zonder potje tonen de maanden oud naar nieuw', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { const ym = thisYM(); SET.gripVolgorde = null; });
    const r = await page.evaluate(() => {
      const naar = sel => [...document.querySelectorAll(sel)].map(e => e.getAttribute(sel.slice(1, -1)) || e.textContent);
      openTeRuim('huur'); const tr = [...document.querySelectorAll('[data-teruimhist]')].map(e => e.dataset.teruimhist);
      openZonderKeuze('e_kinderen'); const zk = document.querySelector('[data-zkbewijs]').textContent; closeSheet();
      return { tr, zk }; });
    expect(r.tr).toEqual(['2026-07', '2026-08', '2026-09']);
    expect(r.zk).toContain('jul €4 · aug €35 · sep €136');
  });
});

test.describe('C4 · boven budget gebruikt de uitschieter-drempel', () => {
  test('Online shopping juli €99 tegen €95 telt niet: 1 van 3, dus geen signaal', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => ({ P: potMaanden('shopping'), boven: potBovenLijst().map(x => x.k) }));
    expect(r.P.totaal).toEqual([99, 160, 0]);   // v417: wat er uitging; bedragen zijn de afgeronde maanden van de berekening expect(r.P.budgets).toEqual([95, 95, 95]);   // invoermeting
    // v409: augustus is Bol Abonnement Select (kwartaal, EUR 95): 160 - 95 = 65, geen boven-maand meer; juli 99 tegen 95 haalt de drempel niet
    expect(r.P.boven).toEqual([false, false, false]);
    expect(r.boven).not.toContain('shopping');
    expect((await letop(page)).some(x => x.key === 'shopping' && x.soort === 'boven')).toBe(false);
    expect(await page.evaluate(() => uitschieterAfw(99 - 95, 95))).toBe(false);
  });
  test('een functie: potMaanden en de signalen lezen allebei uitschieterAfw()', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => ({ pm: potMaanden.toString(), pu: potjeUitschieter.toString() }));
    expect(r.pm).toContain('uitschieterAfw('); expect(r.pu).toContain('uitschieterAfw(');
    const g = await page.evaluate(() => [uitschieterAfw(4, 95), uitschieterAfw(10, 40), uitschieterAfw(10, 100), uitschieterAfw(50, 700)]);
    expect(g).toEqual([false, true, false, true]);
  });
});

test.describe('D5 · een potje in een patroon staat in Let op als verwijzing', () => {
  test('Uit eten en Vices: "<potje> · zit in patroon n ›" naar dat patroon, zonder eigen herzien', async ({ page }) => {
    await S.boot(page);
    const P = await page.evaluate(() => gripPatronen().map(p => ({ id: p.id, ks: (p.sig || []).map(s => s.k) })));
    const L = await letop(page);
    for (const k of ['uiteten', 'vices']) {
      const i = P.findIndex(p => p.ks.includes(k)); expect(i, k).toBeGreaterThanOrEqual(0);   // invoermeting
      const rijen = L.filter(x => x.key === k);
      expect(rijen.length, k).toBe(1);
      expect(rijen[0].soort).toBe('patroon');
      expect(rijen[0].naam).toMatch(new RegExp(` zit in patroon ${i + 1}$`));   // v410: "<namen> zit(ten) in patroon n"
      expect(rijen[0].act).toBe(`gripNaarBegrijpen('${P[i].id}')`);
      expect(rijen[0].act).not.toContain('openPotHerzien');
    }
  });
  test('de tik opent Begrijpen op dat patroon', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); const x = gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), []).find(y => y.soort === 'patroon');
      new Function(x.act)(); return { tab: window._gripTab, i: window._gripPatroonI, id: gripPatronen()[window._gripPatroonI].id, act: x.act }; });
    expect(r.tab).toBe('begrijpen');
    expect(r.act).toBe(`gripNaarBegrijpen('${r.id}')`);
  });
});

test.describe('E6 · een stijgende trend zonder potje', () => {
  test('Kinderen: eerst potje met de laatste maand, dan reservering, met "stijgt:" en de maanden', async ({ page }) => {
    await S.boot(page);
    const k = (await letop(page)).find(x => x.key === 'e_kinderen');
    expect(k.sub).toBe('potje €136 of €86, of reservering in Plan €15/mnd · stijgt: jul €4 · aug €35 · sep €136');   // v409: drie voorstellen
    expect(k.act).toBe("openZonderKeuze('e_kinderen')");
  });
  test('de keuze: potje eerst (€136), reservering tweede (12 mnd gemiddeld), geen voorselectie', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { openZonderKeuze('e_kinderen'); return { o: [...document.querySelectorAll('[data-zkoptie]')].map(e => [e.dataset.zkoptie, e.dataset.gekozen, e.querySelector('span span').textContent]), knop: document.querySelector('[data-zkbevestig]').disabled }; });
    expect(r.o.map(x => x[0])).toEqual(['pot', 'pot2', 'res', 'nee']);   // v409; v415: geen potje nodig
    expect(r.o.every(x => x[1] === '0')).toBe(true);
    expect(r.o[0][2]).toBe('Potje maken · €136 per maand');
    expect(r.o[1][2]).toBe('Potje maken · €86 per maand'); expect(r.o[2][2]).toBe('Reservering in Plan · €15 per maand');
    expect(r.knop).toBe(true);
  });
  test('vanaf nul is het geen trend maar een piek (Vakantie jul €0 · aug €40 · sep €350)', async ({ page }) => {
    await S.boot(page);
    const v = (await letop(page)).find(x => x.key === 'vakantie');
    expect(v.sub).toMatch(/^reservering in Plan €\d+\/mnd of potje maken · jul €0 · aug €40 · sep €350$/);
    const r = await page.evaluate(() => [zonderTrend({ k: 'x', bedragen: [136, 35, 4] }), zonderTrend({ k: 'x', bedragen: [7, 6, 4] }), zonderTrend({ k: 'x', bedragen: [350, 40, 0] })].map(x => !!x));
    expect(r).toEqual([true, false, false]);   // 4<35<136 en 136>=8; 4<6<7 maar 7<8; begint op nul
  });
});

test.describe('F · de brug: "n boven" en "n onder", en de kolomprioriteit', () => {
  test('geen twee keer "overig": de samengevoegde stappen heten n boven en n onder', async ({ page }) => {
    await S.boot(page);
    const B = await brug(page), ov = B.st.filter(s => s.soort === 'overig');
    expect(ov.map(s => s.k)).toEqual(['boven', 'onder']);
    expect(ov[0].label).toMatch(/^\d+ boven$/); expect(ov[1].label).toMatch(/^\d+ onder$/);
    expect(B.st.map(s => s.label)).not.toContain('overig');
    expect(ov[0].waarde).toBeGreaterThanOrEqual(0); expect(ov[1].waarde).toBeLessThanOrEqual(0);
  });
  test('Uit eten (+€126) en Vices staan los, zonder potje zit in "n boven", te ruim staat er, budget plus stappen is verwacht', async ({ page }) => {
    await S.boot(page);
    const B = await brug(page);
    expect(B.st.length).toBeLessThanOrEqual(7);
    expect(B.st.find(s => s.soort === 'potje' && s.k === 'uiteten').waarde).toBe(126);
    expect(B.st.some(s => s.soort === 'potje' && s.k === 'vices')).toBe(true);
    expect(B.st.some(s => s.soort === 'teruim')).toBe(true);
    expect(B.st.some(s => s.soort === 'zonder')).toBe(false);
    expect(B.st.find(s => s.k === 'boven').zonderIn).toBeGreaterThan(0);
    const som = B.st.slice(1, -1).reduce((a, s) => a + s.waarde, B.st[0].waarde);
    expect(som).toBe(B.st[B.st.length - 1].waarde); expect(som).toBe(B.P);
    for (const s of B.st.slice(1, -1)) if (s.soort === 'potje') expect(s.waarde).toBeGreaterThan(0);
  });
  test('met ruimte staat zonder potje als eigen stap, en dan blijft de som ook kloppen', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); const Br = gripZienBrug(V, []);   // zonder te ruime potjes: genoeg ruimte
      return Br.stappen.map(s => ({ soort: s.soort, waarde: s.waarde, label: s.label })); });
    expect(r.some(s => s.soort === 'zonder')).toBe(true);
    const som = r.slice(1, -1).reduce((a, s) => a + s.waarde, r[0].waarde); expect(som).toBe(r[r.length - 1].waarde);
  });
  test('de tik op "n boven" toont de potjes met bedragen en zonder potje met geboekt en verwacht', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { openGripOverig('boven'); const el = document.querySelector('#gripOverig');
      return { kant: el.dataset.overigkant, waarde: +el.dataset.overig, pot: [...el.querySelectorAll('[data-overigpotje]')].map(e => e.innerText.replace(/\s+/g, ' ')), z: el.querySelector('[data-overigzonder]') ? el.querySelector('[data-overigzonder]').innerText : '' }; });
    expect(r.kant).toBe('boven');
    expect(r.pot.join('|')).toContain('Boodschappen');
    expect(r.z).toMatch(/geboekt · €\d+ verwacht/);
    const o = await page.evaluate(() => { openGripOverig('onder'); return [...document.querySelectorAll('#gripOverig [data-overigpotje]')].map(e => e.innerText); });
    expect(o.length).toBeGreaterThan(0); for (const t of o) expect(t).toContain('-');
  });
});

test.describe('fit op 390x844', () => {
  test('Zien en Let op (open) passen boven de menubalk', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await S.boot(page);
    const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand');
      const knop = document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav = document.querySelector('.nav').getBoundingClientRect().top;
      const kol = document.querySelectorAll('#gripBrug [data-brugstap]').length, breed = [...document.querySelectorAll('#gripBrug [data-brugstap]')].map(e => e.getBoundingClientRect().width);
      return { knop, nav, kol, breed, sw: document.documentElement.scrollWidth, nog: !!document.querySelector('[data-letopnog]') }; });
    console.log(`zien 390: ${r.kol} kolommen, knop ${Math.round(r.knop)}px, menubalk ${Math.round(r.nav)}px`);
    expect(r.kol).toBeLessThanOrEqual(7); for (const b of r.breed) expect(b).toBeGreaterThanOrEqual(40);
    expect(r.knop).toBeLessThanOrEqual(r.nav); expect(r.sw).toBeLessThanOrEqual(390);
    expect(r.nog).toBe(true);
    const s = await page.evaluate(() => { openGripLetOpLijst(); const sh = document.querySelector('#sheet'), b = sh.getBoundingClientRect();
      return { h: b.height, sh: sh.scrollHeight, ch: sh.clientHeight, vh: innerHeight, sw: document.documentElement.scrollWidth, n: sh.querySelectorAll('[data-letop]').length }; });
    console.log(`let op open 390: ${s.n} regels, sheet ${Math.round(s.h)}px van ${s.vh}, scroll ${s.sh}/${s.ch}`);
    expect(s.n).toBeGreaterThan(0); expect(s.sh).toBeLessThanOrEqual(s.ch + 1); expect(s.sw).toBeLessThanOrEqual(390);
  });
});
