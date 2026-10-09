/* v365: HOME, GRIP, LOGBOEK, INZICHTEN EN PLAN OPGESCHOOND (mockup "opschonen").
   Elk getal op een plek: Nog te ontvangen staat op Home, Nog te sparen op Plan en contant in het saldo op Home.
   De afsluiting telt alleen afsluittaken. Terugzetten na een opname uit je spaargeld is een keuze. */
const { test, expect } = require('@playwright/test');
const I = require('./inzichten-stand');
const P = require('./opschonen-stand');

/* ===== HOME ===== */
test.describe('a · Home', () => {
  test('drie recente boekingen, de nieuwste eerst, en "Alle transacties" blijft', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('dash'));
    const r = await page.evaluate(() => ({ n: document.querySelectorAll('#s-dash .txl').length,
      nw: TX.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((t) => txNaam(t)),
      rij: [...document.querySelectorAll('#s-dash .txl .nm')].map((e) => e.innerText),
      alle: !!document.querySelector('#s-dash .hl-all') }));
    expect(r.n).toBe(3); expect(r.rij).toEqual(r.nw); expect(r.alle).toBe(true);
  });
  test('de koopcheck staat niet meer op Home', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('dash'));
    expect(await page.locator('#s-dash').innerText()).not.toContain('Ik wil iets kopen');
  });
  test('bank en contant tellen op tot het totaal saldo, en contant is dezelfde bron', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('dash'));
    const r = await page.evaluate(() => { const el = document.querySelector('[data-saldosplit]');
      return { bank: +el.dataset.bank, contant: +el.dataset.contant, bron: contantVerwacht(), tb: totalBalance().contant,
        saldo: Math.round(safeToSpend().saldo), tekst: el.innerText }; });
    expect(r.contant).toBe(Math.round(r.bron)); expect(r.contant).toBe(Math.round(r.tb)); expect(r.contant).toBe(80);
    expect(r.bank + r.contant).toBe(r.saldo);
    expect(r.tekst).toBe('€12.000 op de bank · €80 contant ›');   // v367: de regel opent je rekeningen
  });
  test('zonder telling is er niets te splitsen en staat de regel er niet', async ({ page }) => {
    await I.boot(page, { zonderContant: true }); await page.evaluate(() => go('dash'));
    expect(await page.locator('[data-saldosplit]').count()).toBe(0);
  });
  test('Nog te ontvangen is de berekening van de oude tegel, met een nette naam', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('dash'));
    const r = await page.evaluate(() => ({ v: +document.getElementById('homeOntvangen').dataset.ontvangen, due: Math.round(monthLiquidity().incDue),
      t: document.getElementById('homeOntvangen').innerText }));
    expect(r.v).toBe(r.due); expect(r.v).toBe(5216);
    expect(r.t).toContain('nog niets binnen');
  });
  test('"Skf ." heet "Skf": een losse punt achter de naam valt weg', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => go('dash'));
    const t = await page.locator('[data-ontvangenwie]').innerText();
    expect(t).toContain('(Skf)'); expect(t).not.toMatch(/Skf \./);
  });
  test('verplaatst en niet gekopieerd: de tegels ontvangen, sparen en contant staan niet meer op Inzichten', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('ins'));
    const keys = await page.evaluate(() => [...document.querySelectorAll('#s-ins [data-instegel]')].map((e) => e.dataset.instegel));
    for (const k of ['ontvangen', 'sparen', 'cash']) expect(keys).not.toContain(k);
    await page.evaluate(() => go('dash'));
    expect(await page.locator('#homeOntvangen').count()).toBe(1);
  });
  for (const vp of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
    test(`Home past op een scherm op ${vp.width}x${vp.height}`, async ({ page }) => {
      await I.boot(page); await page.setViewportSize(vp); await page.evaluate(() => go('dash'));
      const r = await page.evaluate(() => { const els = [...document.querySelectorAll('#s-dash > *')];
        const bodem = Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
        const nav = document.querySelector('nav, .nav, #nav'); const navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
        return { bodem: Math.round(bodem), navTop: Math.round(navTop), scroll: document.documentElement.scrollHeight - innerHeight }; });
      console.log('home', vp.width, vp.height, JSON.stringify(r));
      expect(r.scroll).toBeLessThanOrEqual(0);
      expect(r.bodem).toBeLessThanOrEqual(r.navTop);
    });
  }
});

/* ===== LOGBOEK ===== */
const HUUR = [
  { id: 'h1', soort: 'potje', cat: 'huur', bedrag: 530, voor: 700, van: '2026-12', tot: '2026-12', op: '2026-10-08', ts: 1, sinds: '2026-10', wat: 'Potje Huur €530 vanaf december', herzien: { op: '2026-10-08', hoe: 'aangepast' } },
  { id: 'h2', soort: 'potje', cat: 'huur', bedrag: 700, voor: 750, van: '2026-10', tot: '2026-10', op: '2026-10-08', ts: 2, sinds: '2026-10', wat: 'Potje Huur €700 vanaf oktober', herzien: { op: '2026-10-08', hoe: 'aangepast' } },
  { id: 'h3', soort: 'potje', cat: 'huur', bedrag: 600, voor: 700, van: '2026-11', tot: '2026-11', op: '2026-10-08', ts: 3, sinds: '2026-10', wat: 'Potje Huur €600 vanaf november' },
];
test.describe('b · Logboek', () => {
  test('de afsluitteller telt alleen de afsluittaken, ook met afspraken', async ({ page }) => {
    await I.boot(page, { set: { maandAfsluiting: {}, afspraken: HUUR } });
    const r = await page.evaluate(() => { openAfsluiting('2026-09'); const S = afsluitStand('2026-09');
      return { teller: document.querySelector('[data-afteller]').dataset.afteller, P: afsluitPunten('2026-09').length, af: afsluitPunten('2026-09').filter((p) => p.af).length,
        A: S.A.length, rijen: document.querySelectorAll('#afsluitSheet [data-afspraak]').length, tekst: document.getElementById('afsluitSheet').innerText }; });
    expect(r.A).toBeGreaterThan(0);
    expect(r.teller).toBe(`${r.af}/${r.P}`);
    expect(r.rijen).toBe(0);
    expect(r.tekst).not.toContain('Wat je afsprak');
  });
  test('afsluiten met open punten bewaart geen afspraak als open punt', async ({ page }) => {
    await I.boot(page, { set: { maandAfsluiting: {}, afspraken: HUUR } });
    const open = await page.evaluate(() => { maandAfsluiten('2026-09', true); return SET.maandAfsluiting['2026-09'].open; });
    expect(open.some((o) => o.afspraak)).toBe(false);
  });
  /* v366: afspraken voor verschillende maanden staan naast elkaar (afspraak-schema.spec.js), dus alle drie gelden en
     staan in de volgorde van hun maand. De "aangepast" die de regel van v365 opsloeg leest niet meer als aangepast. */
  test('het blok "Wat je afsprak" staat op de logboekpagina, met per potje de geldende afspraken', async ({ page }) => {
    await I.boot(page, { set: { afspraken: HUUR } });
    await page.evaluate(() => go('logboek'));
    const r = await page.evaluate(() => [...document.querySelectorAll('#logAfspraken [data-afspraakgroep="potje|huur"] [data-logafspraak]')].map((e) => ({ id: e.dataset.logafspraak, g: e.dataset.geldend, t: e.innerText.replace(/\s+/g, ' ') })));
    expect(r.map((x) => x.id)).toEqual(['h2', 'h3', 'h1']);
    expect(r.map((x) => x.g)).toEqual(['1', '1', '1']);
    expect(r[1].t).toContain('Huur €700 → €600'); expect(r[1].t).toContain('vanaf november');
    expect(r[2].t).toContain('Huur €700 → €530');
    // het blok staat onder Afgesloten maanden
    const volg = await page.evaluate(() => { const a = document.getElementById('logTijdlijn'), b = document.getElementById('logAfspraken'); return a && b ? a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING : -1; });
    expect(volg).toBeTruthy();
  });
  test('een nieuwe potje-afspraak bewaart het bedrag ervoor', async ({ page }) => {
    await I.boot(page);
    const a = await page.evaluate(() => { potPlanZet('vices', '2026-12', 15); return potjeAfspraak('vices', 15, '2026-12'); });
    expect(a.voor).toBe(20);
  });
});

/* ===== GRIP ===== */
test.describe('c · Grip', () => {
  test('de koopcheck staat bovenaan, met zijn subregel, en opent dezelfde check', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('maand'));
    const r = await page.evaluate(() => { const f = document.getElementById('s-maand').firstElementChild; return { id: f.id, t: f.innerText, oc: f.getAttribute('onclick') }; });
    expect(r.id).toBe('gripKoopcheck');
    expect(r.t).toContain('Ik wil iets kopen'); expect(r.t).toContain('Past het in een potje, of gaat het van je ruimte af?');
    expect(r.oc).toBe('openBuy()');
  });
  test('"Komende 3 maanden" bestaat niet meer', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('maand'));
    expect(await page.locator('#gripTijdlijn').count()).toBe(0);
    expect(await page.locator('#s-maand').innerText()).not.toMatch(/komende 3 maanden/i);
    expect(await page.evaluate(() => typeof gripTijdlijn)).toBe('undefined');
  });
});

/* ===== INZICHTEN ===== */
const AFR = { extraTx: [{ id: 'r1', date: '2026-10-06', amount: -10.4, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] };
const mb = (page) => page.evaluate(() => { const el = document.getElementById('insMaandBudget'); if (!el) return null;
  return { budget: +el.dataset.budget, som: (el.querySelector('[data-somregel]') || {}).dataset ? el.querySelector('[data-somregel]').dataset.somregel : null,
    segs: [...el.querySelectorAll('[data-mbseg]')].map((s) => s.dataset.mbseg), tempo: !!el.querySelector('[data-mbtempo]'),
    tegels: [...el.querySelectorAll('[data-mbtegel]')].map((t) => ({ k: t.dataset.mbtegel, v: +t.dataset.waarde, vl: t.querySelector('.vl').innerText })) }; });
test.describe('d · Inzichten', () => {
  test('de som van de delen is exact het budget, ook als per tegel afronden er een euro naast zit', async ({ page }) => {
    await I.boot(page, AFR); await page.evaluate(() => go('ins'));
    // de fixture draagt het geval: per tegel afronden geeft EUR 1 minder dan het budget
    const oud = await page.evaluate(() => { const m = thisYM(); return Math.round(insSoortUit(m, 'alle')) + Math.round(monthLiquidity().fixDue) + varPotjeStand(m).nog; });
    const D = await mb(page);
    expect(oud).toBe(D.budget - 1);
    const delen = D.tegels.map((t) => t.v);
    expect(delen.reduce((a, b) => a + b, 0)).toBe(D.budget);
    expect(D.som).toBe(`${delen.join('+')}=${D.budget}`);
    expect(await page.locator('[data-somregel]').innerText()).toBe(`${D.tegels.map((t) => t.vl).join(' + ')} = €3.376`);
  });
  test('een uitgave buiten je potjes is geen afronding: Nog in potjes blijft wat erin zit, en het verschil staat in de som', async ({ page }) => {
    await I.boot(page, { extraTx: [{ id: 'k1', date: '2026-10-06', amount: -200, name: 'Kapper Knip', desc: 'BEA, BETAALPAS KAPPER KNIP' }] });
    await page.evaluate(() => go('ins'));
    const D = await mb(page);
    const r = await page.evaluate(() => ({ nog: varPotjeStand(thisYM()).nog, som: document.querySelector('[data-somregel]').innerText }));
    expect(D.tegels[2].v).toBe(r.nog);
    const gat = D.budget - D.tegels.reduce((a, t) => a + t.v, 0);
    expect(Math.abs(gat)).toBeGreaterThan(1);
    expect(r.som).toContain('buiten je potjes'); expect(r.som).toContain('= €3.376');
    expect(await page.evaluate(() => document.querySelector('[data-somregel]').dataset.somregel)).toBe(`${D.tegels.map((t) => t.v).join('+')}${gat}=${D.budget}`);
  });
  test('drie delen in vaste volgorde met een tempostreepje op wat je tot vandaag mocht', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('ins'));
    const D = await mb(page);
    expect(D.segs).toEqual(['uitgegeven', 'vast', 'potjes']);
    expect(D.tegels.map((t) => t.v)).toEqual([406, 817, 2153]);
    const t = await page.evaluate(() => ({ s: +document.querySelector('[data-mbtempo]').dataset.mbtempo, m: insTempo().mocht, lab: document.querySelector('.mb-tlab').innerText }));
    expect(t.s).toBe(t.m); expect(t.lab).toBe('tempo €578');
  });
  test('de kleur van elke tegel is de kleur van zijn stuk in de balk', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('ins'));
    const r = await page.evaluate(() => [...document.querySelectorAll('[data-mbtegel]')].map((t) => {
      const seg = document.querySelector(`[data-mbseg="${t.dataset.mbtegel}"]`);
      return { k: t.dataset.mbtegel, dot: getComputedStyle(t.querySelector('.lb i')).backgroundColor, seg: getComputedStyle(seg).backgroundColor }; }));
    for (const x of r) expect(x.dot).toBe(x.seg);
    expect(new Set(r.map((x) => x.seg)).size).toBe(3);
  });
  test('een afgesloten maand toont twee delen en geen tempostreepje', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => { go('ins'); insFilterZet('vorige', null); });
    const D = await mb(page);
    expect(D.segs.length).toBe(2); expect(D.segs[0]).toBe('uitgegeven'); expect(['over', 'erboven']).toContain(D.segs[1]);
    expect(D.tempo).toBe(false);
    const st = await page.evaluate(() => maandStaaf('2026-09'));
    expect(D.tegels[0].v).toBe(Math.round(st.spend)); expect(D.budget).toBe(Math.round(st.budget));
  });
  test('de patronen staan niet op de pagina en openen als sheet met dezelfde inhoud', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('ins'));
    expect(await page.locator('#s-ins #insPatronen').count()).toBe(0);
    const verwacht = await page.evaluate(() => insPatronen('alle').map((p) => p.soort + '|' + p.k));
    expect(verwacht.length).toBeGreaterThan(0);
    await page.locator('[data-patronenteller]').click();
    const r = await page.evaluate(() => [...document.querySelectorAll('#insPatronenSheet [data-patroon]')].map((e) => e.dataset.patroon + '|' + e.dataset.patk));
    expect(r).toEqual(verwacht);
    const zelfde = await page.evaluate(() => document.querySelector('#insPatronenSheet #insPatronen').innerHTML === (() => { const d = document.createElement('div'); d.innerHTML = insPatronenKaart(insPatronen('alle')); return d.firstElementChild.innerHTML; })());
    expect(zelfde).toBe(true);
  });
  test('tegen je potje: de EUR 0-groep is dicht, bevat alleen nul, en klapt op dezelfde plek uit', async ({ page }) => {
    /* v367: de nulgroep staat in de drilldown "Alle N potjes", niet meer op de kaart */
    await I.boot(page); await page.evaluate(() => { SET.insKeuze = 'potje'; go('ins'); });
    expect(await page.locator('#insKeuze [data-insnulgroep]').count()).toBe(0);
    await page.click('[data-insalleknop="potje"]');
    const g = page.locator('[data-insnulgroep="potje"]');
    expect(await g.getAttribute('data-open')).toBe('0');
    expect(await page.locator('[data-insnulgroep="potje"] [data-inspotrij]').count()).toBe(0);
    const buiten = await page.evaluate(() => [...document.querySelectorAll('#insAlle > [data-inspotrij]')].map((e) => +e.dataset.uit));
    expect(buiten.every((u) => u !== 0)).toBe(true);
    const kop = await g.innerText();
    await g.locator('[role=button]').click();
    const r = await page.evaluate(() => ({ open: document.querySelector('[data-insnulgroep="potje"]').dataset.open,
      uit: [...document.querySelectorAll('[data-insnulgroep="potje"] [data-inspotrij]')].map((e) => +e.dataset.uit),
      pot: [...document.querySelectorAll('[data-insnulgroep="potje"] [data-inspotrij]')].map((e) => +e.dataset.potje) }));
    expect(r.open).toBe('1'); expect(r.uit.length).toBeGreaterThan(1); expect(r.uit.every((u) => u === 0)).toBe(true);
    expect(kop).toContain(`${r.uit.length} potjes nog niets uitgegeven`);
    expect(kop).toContain('€' + r.pot.reduce((a, b) => a + b, 0).toLocaleString('nl-NL'));
    await page.evaluate(() => { closeSheet(); go('dash'); go('ins'); openInsAlle('potje'); });
    expect(await page.locator('[data-insnulgroep="potje"]').getAttribute('data-open')).toBe('0');
  });
  test('tegen vorige maanden: alleen precies EUR 0 verschil staat in de groep', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => { go('ins'); insKeuzeZet('vorige'); openInsAlle('vorige'); });   // v367: in de drilldown
    const g = page.locator('[data-insnulgroep="vorige"]');
    expect(await g.getAttribute('data-open')).toBe('0');
    const buiten = await page.evaluate(() => [...document.querySelectorAll('#insAlle > [data-insvorigrij]')].map((e) => +e.dataset.verschil));
    expect(buiten.every((d) => d !== 0)).toBe(true);
    await g.locator('[role=button]').click();
    const binnen = await page.evaluate(() => [...document.querySelectorAll('[data-insnulgroep="vorige"] [data-insvorigrij]')].map((e) => +e.dataset.verschil));
    expect(binnen.length).toBeGreaterThan(1); expect(binnen.every((d) => d === 0)).toBe(true);
    expect(await g.innerText()).toContain(`${binnen.length} potjes gelijk aan normaal`);
  });
});

/* ===== PLAN ===== */
const kop = (page) => page.evaluate(() => ({ bedrag: document.getElementById('planKopBedrag').innerText, kaart: !!document.getElementById('terugzetKaart'),
  gekozen: (document.getElementById('terugzetGekozen') || {}).innerText || '', save: safeToSpend().saveReserved, nf: SET.nfToegewezen,
  terug: [...document.querySelectorAll('[data-terugbak]')].map((e) => e.dataset.terugbak + ':' + e.dataset.terug),
  eta: Object.fromEntries(allocatePlan().map((p) => [p.id, p.eta])) }));
test.describe('e · Plan', () => {
  test('zonder keuze blijft de inleg EUR 2.200, staat de kaart er zonder voorkeuze, en schrijft openen niets', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => go('vooruit'));
    const r = await kop(page);
    /* v367: op Plan staat een compacte regel; de kaart met de drie keuzes opent erachter (openTerugzetSheet()) */
    expect(r.bedrag).toBe('€2.200/mnd'); expect(r.kaart).toBe(false); expect(r.save).toBe(2431);
    expect(await page.locator('#terugzetRegel').innerText()).toMatch(/€231 eruit gehaald in oktober\s*kies ›/);
    await page.click('#terugzetRegel');
    expect(await page.evaluate(() => SET.terugzet)).toBeUndefined();
    const t = await page.locator('#terugzetKaart').innerText();
    expect(t).toContain('€231 eruit gehaald in oktober · uit Noodfonds');
    expect(t).toContain('inleg okt €2.431 · Noodfonds vol nov 2026');
    expect(t).toContain('€77 extra per maand t/m dec · Noodfonds vol nov 2026 · Kosten Koper vol jun 2027');
    expect(t).toContain('inleg blijft €2.200 · Noodfonds vol nov 2026 · Kosten Koper vol jun 2027');
    expect(await page.locator('#terugzetGekozen').count()).toBe(0);
    expect(await page.locator('#planInleg').count()).toBe(0);
  });
  test('alles deze maand: EUR 2.431, het geld gaat gearceerd naar het Noodfonds, de toewijzing blijft', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => { go('vooruit'); terugzetKies('alles'); });
    const r = await kop(page);
    expect(r.bedrag).toBe('€2.431'); expect(r.gekozen).toContain('€2.200 vaste inleg + €231 terugzetten · gekozen: alles deze maand · wijzig');
    expect(r.terug).toEqual(['noodfonds:231']); expect(r.nf).toBe(3638); expect(r.save).toBe(2431);
    expect(r.eta).toEqual({ noodfonds: 1, kk: 7, iw: null });
    expect(await page.locator('[data-terugvat="noodfonds"]').count()).toBe(1);
  });
  test('over drie maanden: EUR 2.277 deze maand, EUR 77 naar het Noodfonds, Kosten Koper juni 2027', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => { go('vooruit'); terugzetKies('drie'); });
    const r = await kop(page);
    expect(r.bedrag).toBe('€2.277'); expect(r.terug).toEqual(['noodfonds:77']); expect(r.save).toBe(2277);
    expect(r.eta.noodfonds).toBe(1); expect(await page.evaluate((e) => etaDatum(e), r.eta.kk)).toBe('jun 2027');
  });
  test('niet terugzetten: inleg EUR 2.200, het Noodfonds levert EUR 231 in, en wijzigen zet dat terug', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => { go('vooruit'); terugzetKies('niet'); });
    const r = await kop(page);
    expect(r.bedrag).toBe('€2.200'); expect(r.terug).toEqual([]); expect(r.nf).toBe(3407); expect(r.save).toBe(2200);
    expect(await page.evaluate((e) => [etaDatum(e.noodfonds), etaDatum(e.kk)], r.eta)).toEqual(['nov 2026', 'jun 2027']);
    await page.evaluate(() => { terugzetWijzig(); });
    expect(await page.locator('#terugzetRegel').count()).toBe(1);
    await page.evaluate(() => terugzetKies('alles'));
    expect((await kop(page)).nf).toBe(3638);
  });
  test('de keuze staat in het logboek', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => { terugzetKies('drie'); go('logboek'); });
    expect(await page.locator('[data-logterugzet="2026-10"]').innerText()).toContain('€231 uit Noodfonds: over 3 maanden');
  });
  test('volgende maand: weer het maandbedrag, of het volgende deel bij spreiden', async ({ page }) => {
    const rec = (k) => ({ '2026-10': { bedrag: 231, keuze: k, bron: [{ id: 'noodfonds', type: 'noodfonds', naam: 'Noodfonds', af: 231 }], delen: k === 'drie' ? [77, 77, 77] : [231], op: '2026-10-09' } });
    await P.boot(page, { dag: '2026-11-09', zonderOpname: true, set: { terugzet: rec('drie') } }); await page.evaluate(() => go('vooruit'));
    expect((await kop(page)).bedrag).toBe('€2.277');
    await page.evaluate((r) => { SET.terugzet = r; save(); render(); }, rec('alles'));
    expect((await kop(page)).bedrag).toBe('€2.200/mnd');
  });
  /* v367: "geen tekst over een bak heen" is vervallen met de bakken; Plan is een rij per doel (vrij-uitschieters.spec.js d). */
});
