/* v410: DE BESLISSINGEN NA v409. Op grip-v409-stand (10 oktober 2026). */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');
const { kaalUit } = require('./bron-kaal');

const letop = page => page.evaluate(() => gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), [])
  .map(x => ({ soort: x.soort, key: x.key || '', naam: x.naam, sub: x.sub || '' })));

test.describe('1 · 4-wekelijks: 28 dagen, of de gemeten mediaan vanaf 4 gemeten afstanden', () => {
  test('onder 4 afstanden rekent hij met 28, vanaf 4 met de gemeten afstand', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const tel = s => { let som = 0, twee = []; for (let i = 0; i < 24; i++) { const ym = valtOpYmPlus('2026-10', i), n = teRuimTermijnen(s, ym); som += n; if (n > 1) twee.push(ym); } return { som, twee }; };
      const basis = { cadans: '4w', afstand: 31, nextDate: new Date(2026, 9, 2), intervalM: 1 };
      const drie = Object.assign({}, basis, { amts: [10, 10, 10, 10] }), vier = Object.assign({}, basis, { amts: [10, 10, 10, 10, 10] });
      return { s3: vierStap(drie), s4: vierStap(vier), t3: tel(drie), t4: tel(vier) }; });
    expect(r.s3).toEqual({ stap: 28, bron: 'vast', n: 3 });
    expect(r.s4).toEqual({ stap: 31, bron: 'gemeten', n: 4 });
    // met 28 dagen: 27 termijnen in 24 maanden; met 31 dagen (de gemeten stap) nooit twee in een maand
    expect(r.t3.som).toBe(27); expect(r.t3.twee.length).toBe(3);
    expect(r.t4.twee).toEqual([]);
  });
  test('blok 19 zegt welke van de twee: Shurgard heeft 2 gemeten afstanden, dus vast 28', async ({ page }) => {
    await S.boot(page);
    const d = (await page.evaluate(() => diagEenSignaal(maandVooruit()))).join('\n');
    expect(d).toContain('Shurgard Nl | Huur | 4-wekelijks (gemeten afstand 29 dagen over 2 afstanden, vooruit 28 = vast 28 (minder dan 4 afstanden)) | 71 | actief | 2026-09-30 | dubbel in sep 2027 2x');
  });
  test('met 4 gemeten afstanden staat er "gemeten mediaan"', async ({ page }) => {
    await S.boot(page);
    const d = await page.evaluate(() => { const orig = recurringSchedule;
      window.recurringSchedule = () => orig().map(s => s.cadans === '4w' ? Object.assign({}, s, { amts: [71, 71, 71, 71, 71] }) : s);
      try { return diagEenSignaal(maandVooruit()).join('\n'); } finally { window.recurringSchedule = orig; } });
    expect(d).toContain('4-wekelijks (gemeten afstand 29 dagen over 4 afstanden, vooruit 29 = gemeten mediaan)');
  });
});

test.describe('2 · Bol in Online shopping: een kwartaalpost uit de fixture', () => {
  test('blok 19: Bol Abonnement Select, elke 3 maanden, €95, nov · feb · mei · aug', async ({ page }) => {
    await S.boot(page);
    const d = (await page.evaluate(() => diagEenSignaal(maandVooruit()))).join('\n');
    expect(d).toContain('  Bol Abonnement Select | Online shopping | elke 3 maanden | 95 | actief | 2026-08-16 | nov 2026, feb 2027, mei 2027, aug 2027');
  });
});

test.describe('3 · een definitie van "nodig": te ruim en te krap lezen potNodig()', () => {
  test('de bron: teRuimLijst en potKrapLijst roepen potNodig aan, potKrapLijst niet meer potjeMaandVloer', async ({ page }) => {
    await S.boot(page);
    const b = await kaalUit(page, 'teRuimLijst', 'potKrapLijst');
    expect(b).toContain('potNodig(');
    const krap = await kaalUit(page, 'potKrapLijst');
    expect(krap).toContain('potNodig(');
    expect(krap).not.toContain('potjeMaandVloer(');
  });
  test('de getallen: te krap is de duurste maand van te ruim', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), tr = {}; for (const x of teRuimLijst(V)) tr[x.k] = x;
      return potKrapLijst().map(x => ({ k: x.k, vloer: x.vloer, maand: x.vloerMaand, voorstel: x.voorstel, trNodig: tr[x.k].nodig, trMaand: tr[x.k].maand, trVoorstel: tr[x.k].voorstel })); });
    expect(r.map(x => x.k)).toEqual(['shopping', 'abonnement']);
    for (const x of r) { expect(x.vloer).toBe(x.trNodig); expect(x.maand).toBe(x.trMaand); expect(x.voorstel).toBe(x.trVoorstel); }
    expect(r.map(x => [x.vloer, x.maand, x.voorstel])).toEqual([[160, '2026-11', 160], [51, '2026-10', 60]]);   // v416: shopping november = gewone maand 65 + Bol 95, niet de hoogste 99 + 95
  });
  test('te krap alleen als de duurste maand een periodieke post draagt', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); return { vices: potNodig('vices', V), krap: potKrapLijst().map(x => x.k) }; });
    expect(r.vices.nodig).toBeGreaterThan(20); expect(r.vices.periodiek).toEqual([]);   // invoermeting: duurder dan het potje, zonder periodieke post
    expect(r.krap).not.toContain('vices');
  });
  test('v416: te krap hangt aan de gewone maand plus de post, niet aan de duurste maand', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(({ MAIN }) => { const t = { id: 'v10okshop', date: '2026-10-08', amount: -500, acc: MAIN, name: 'Coolblue', desc: 'BEA, BETAALPAS COOLBLUE', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
      categorize(t); TX.push(t); OVR[t.id] = 'shopping'; save(); const V = maandVooruit();
      return { N: potNodig('shopping', V), R: periodiekePosten('shopping').length, krap: potKrapLijst().map(x => x.k) }; }, { MAIN: S.MAIN });
    expect(r.R).toBe(1); expect(r.N.maand).toBe('2026-10'); expect(r.N.nodig).toBeGreaterThan(95); expect(r.N.periodiek).toEqual([]);   // invoermeting
    /* v416: de duurste maand is nu oktober (Coolblue EUR 500), maar de gewone maand (jul 99, aug 65 na Bol, sep 0: 65) past in
       het budget van 95 en met Bol (95) niet: Bol maakt het verschil, dus te krap */
    expect(r.krap).toContain('shopping');
  });
});

test.describe('4 · de patroonregel noemt alle potjes van het patroon, eerst die met een signaal', () => {
  test('met een onttrekking: "Uit eten & café, Vices en Boodschappen zitten in patroon 1"', async ({ page }) => {
    await S.boot(page, { opnames: [['2026-10-06', 300]] });
    const pr = (await letop(page)).filter(x => x.soort === 'patroon');
    expect(pr.map(x => x.naam)).toEqual(['Uit eten & café, Vices en Boodschappen zitten in patroon 1']);
  });
  test('zonder onttrekking: een potje per patroon, "zit"', async ({ page }) => {
    await S.boot(page);
    const pr = (await letop(page)).filter(x => x.soort === 'patroon');
    expect(pr.map(x => x.naam)).toEqual(['Uit eten & café zit in patroon 1', 'Vices zit in patroon 2']);
  });
});

test.describe('5 · overal dezelfde maandafkortingen', () => {
  test('blok 19 en de te-ruim-regels: "mrt" en nooit "maa"', async ({ page }) => {
    await S.boot(page);
    const d = (await page.evaluate(() => [].concat(diagTeRuim(maandVooruit())).join('\n')));
    expect(d).not.toMatch(/\bmaa\b/);
    expect(d).toContain('mrt');
  });
});

test.describe('6 · fit op 390x844: minstens 16px tussen koopknop en menubalk', () => {
  for (const [naam, o, lang] of [['zonder onttrekking', {}, false], ['met onttrekking', { opnames: [['2026-10-06', 300]] }, false], ['langste potjenamen', { opnames: [['2026-10-06', 300]] }, true]]) {
    test(naam, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await S.boot(page, o);
      if (lang) await page.evaluate(() => { for (const c of Object.values(CATS)) if (c.type === 'expense') c.name = c.name + ' en een hele lange toevoeging erbij'; });
      const r = await page.evaluate(() => { window._gripTab = 'zien'; go('maand');
        const knop = document.querySelector('#gripKoopcheck').getBoundingClientRect().bottom, nav = document.querySelector('.nav').getBoundingClientRect().top;
        return { knop, nav, kol: document.querySelectorAll('#gripBrug [data-brugstap]').length, sw: document.documentElement.scrollWidth,
          kort: [...document.querySelectorAll('#gripLetOp [data-letopkort] .small')].every(e => getComputedStyle(e).whiteSpace === 'nowrap') }; });
      console.log(`v410 fit 390 (${naam}): ${r.kol} kolommen, knop ${Math.round(r.knop)}px, menubalk ${Math.round(r.nav)}px, ruimte ${Math.round(r.nav - r.knop)}px`);
      expect(r.kol).toBe(7);
      expect(r.nav - r.knop).toBeGreaterThanOrEqual(16);
      expect(r.kort).toBe(true);
      expect(r.sw).toBeLessThanOrEqual(390);
    });
  }
  test('de lijst achter "nog N" breekt af (geen ellipsis daar)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await S.boot(page);
    const n = await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); openGripLetOpLijst(); return document.querySelectorAll('#gripLetOpLijst [data-letopkort]').length; });
    expect(n).toBe(0);
  });
});
