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
  /* v378: de splitsing in bank en contant staat in de kop van Saldo nu, niet meer op Home. */
  test('bank en contant tellen op tot het totaal saldo, en contant is dezelfde bron', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => { go('dash'); renderDash(); });
    expect(await page.locator('#s-dash [data-saldosplit]').count()).toBe(0);
    await page.evaluate(() => openBalances());
    const r = await page.evaluate(() => { const c = document.querySelector('#sheet [data-contantrij]');
      return { contant: +c.dataset.saldorij / 100, bron: contantVerwacht(), tb: totalBalance().contant,
        som: [...document.querySelectorAll('#sheet [data-saldorij]')].reduce((a, e) => a + +e.dataset.saldorij, 0) / 100,
        saldo: Math.round(safeToSpend().saldo), tekst: document.getElementById('sheet').innerText }; });
    expect(r.contant).toBe(r.bron); expect(r.contant).toBe(r.tb); expect(r.contant).toBe(80);
    expect(Math.round(r.som)).toBe(r.saldo);
    expect(r.tekst).toContain('€12.000,00 bank + €80,00 contant');
  });
  test('zonder telling is er niets te splitsen en staat er geen blok contant', async ({ page }) => {
    await I.boot(page, { zonderContant: true }); await page.evaluate(() => openBalances());
    expect(await page.locator('#sheet [data-contantrij]').count()).toBe(0);
    expect(await page.locator('#sheet').innerText()).not.toContain('contant');
  });
  /* v438: Nog te ontvangen staat niet meer op Home; dezelfde berekening en de nette naam staan in de sheet Verwacht eind */
  test('Nog te ontvangen is de berekening van de oude tegel, met een nette naam (in de sheet Verwacht eind)', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('dash'));
    const r = await page.evaluate(() => { openVerwachtEind(); const e = document.querySelector('#verwachtEindSheet [data-veterm="inkomen"]'); return { v: +e.dataset.bedrag, due: Math.round(monthLiquidity().incDue), t: e.innerText }; });
    expect(r.v).toBe(r.due); expect(r.v).toBe(5216);
    expect(r.t).not.toContain('nog niets binnen');
  });
  test('"Skf ." heet "Skf": een losse punt achter de naam valt weg', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => { go('dash'); openVerwachtEind(); });
    const t = await page.locator('#verwachtEindSheet [data-veterm="inkomen"]').innerText();
    expect(t).toContain('(Skf)'); expect(t).not.toMatch(/Skf \./);
  });
  test('verplaatst en niet gekopieerd: de tegels ontvangen, sparen en contant staan niet meer op Inzichten', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('ins'));
    /* v382: Inzichten draagt geen tegels meer; ontvangen, sparen en contant staan er in geen enkele vorm */
    const r = await page.evaluate(() => ({ tegels: document.querySelectorAll('#s-ins [data-instegel]').length, t: document.getElementById('s-ins').innerText }));
    expect(r.tegels).toBe(0);
    expect(r.t).not.toMatch(/te ontvangen|te sparen|contant/i);   // v438: de kaart Verwacht saldo eind noemt geen van drie
    await page.evaluate(() => go('dash'));
    expect(await page.locator('#homeOntvangen').count()).toBe(0);   // v438: ook niet meer op Home
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
  /* v387: de koopcheck is de vaste knop onderaan Grip (Grip als regelkring), onder de tabs, en opent dezelfde check. */
  test('de koopcheck is de vaste knop onderaan, en opent dezelfde check', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('maand'));
    const r = await page.evaluate(() => { const f = document.getElementById('gripKoopcheck'), ids = [...document.getElementById('s-maand').children].map((e) => e.id).filter(Boolean);
      return { id: ids[ids.length - 1], t: f.innerText, oc: f.getAttribute('onclick') }; });
    expect(r.id).toBe('gripKoopbalk');   // v434: de knop staat in de vaste balk, als laatste element
    expect(await page.evaluate(() => document.getElementById('gripKoopbalk').contains(document.getElementById('gripKoopcheck')))).toBe(true);
    expect(r.t).toContain('Ik wil iets kopen');
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
/* v382: het blok "Maandbudget <maand>" met drie tegels als legenda en een somregel (insMaandBudget) is vervangen door de
   maandkaart (insMaandKaart, #insMaand): een balk met segmenten [data-insseg], een tempostreep em[data-instempo] en een
   legenda met rijen [data-insleg] onder "Uitgegeven" en "Nog te gaan". */
const mk = (page) => page.evaluate(() => { const el = document.getElementById('insMaand'); if (!el) return null;
  return { stand: el.dataset.insmaand, uit: +el.dataset.insuit, budget: +el.dataset.insbudget,
    segs: [...el.querySelectorAll('[data-insseg]')].map((s) => s.dataset.insseg), tempo: el.querySelector('em[data-instempo]') ? +el.querySelector('em[data-instempo]').dataset.instempo : null,
    leg: [...el.querySelectorAll('[data-insleg]')].map((t) => ({ k: t.dataset.insleg, v: +t.dataset.v })) }; });
test.describe('d · Inzichten', () => {
  // v382: weg, 'de som van de delen is exact het budget' las de somregel van Maandbudget ([data-somregel]); die is weg
  /* v382: de somregel is weg, de eigenschap van de tweede test blijft: een uitgave buiten je potjes laat "in potjes"
     staan op wat erin zit (varPotjeStand().nog), en het verschil staat apart als "zonder potje". */
  test('een uitgave buiten je potjes is geen afronding: in potjes blijft wat erin zit, en zonder potje staat apart', async ({ page }) => {
    await I.boot(page, { extraTx: [{ id: 'k1', date: '2026-10-06', amount: -200, name: 'Kapper Knip', desc: 'BEA, BETAALPAS KAPPER KNIP' }] });
    await page.evaluate(() => go('ins'));
    const D = await mk(page);
    const r = await page.evaluate(() => ({ nog: insGroepen().pot.nog, S: insMaandStand() }));
    const leg = Object.fromEntries(D.leg.map((x) => [x.k, x.v]));
    /* v443 (1c): "in potjes" is de forecast van potjes en zonder potje min wat er al uit is (insGroepen); de kapper zit
       in "zonder potje" (uitgegeven) en niet nog eens in wat er te gaan staat. */
    expect(leg.nogpot).toBe(r.nog);
    expect(r.S.zonder, 'invoer: de kapper valt op geen potje').toBeGreaterThanOrEqual(200);
    expect(leg.zonder).toBe(r.S.zonder);
    expect(D.uit).toBe((leg.vast || 0) + (leg.potjes || 0) + leg.zonder);
  });
  /* v440 sectie 8: de balk en de streep gaan over je potjes (potjes, zonder potje, nog in potjes), met de streep op het
     potjes-tempo; de vaste lasten staan als context eronder, niet in de balk. */
  test('de potjes-delen in vaste volgorde met een tempostreep op het potjes-tempo', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('ins'));
    const D = await mk(page);
    expect(D.stand).toBe('nu');
    expect(D.segs).toEqual(['potjes', 'zonder', 'nogpot']);
    const S = await page.evaluate(() => insMaandStand());
    expect(D.uit).toBe(Math.round(S.potjes + S.zonder)); expect(S.nogVast).toBe(817); expect(S.nogPot).toBe(2153);
    const t = await page.evaluate(() => document.querySelector('#insMaand [data-instempopot]').innerText.replace(/\s+/g, ' '));
    expect(D.tempo).toBe(S.potTempo); expect(t).toMatch(new RegExp('tempo potjes €' + S.potTempo.toLocaleString('nl-NL').replace('.', '\\.') + ' op'));
  });
  test('de kleur van elke legendarij is de kleur van zijn stuk in de balk', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('ins'));
    const r = await page.evaluate(() => [...document.querySelectorAll('#insMaand [data-insleg]')].map((t) => {
      const seg = document.querySelector(`#insMaand [data-insseg="${t.dataset.insleg}"]`);
      /* v443 (1b): vast staat weer in de legenda, maar de balk blijft over je potjes; een vaste rij heeft dus geen stuk */
      if (!seg) return { k: t.dataset.insleg, geenSeg: true };
      return { k: t.dataset.insleg, dot: getComputedStyle(t.querySelector('.ins-sq')).backgroundImage + getComputedStyle(t.querySelector('.ins-sq')).backgroundColor,
        seg: getComputedStyle(seg).backgroundImage + getComputedStyle(seg).backgroundColor }; }));
    for (const x of r.filter((x) => x.geenSeg)) expect(['vast', 'nogvast'], x.k).toContain(x.k);
    const m = r.filter((x) => !x.geenSeg);
    expect(m.length).toBeGreaterThanOrEqual(2);   // v440 sectie 8: de balk draagt potjes/zonder/nogpot
    for (const x of m) expect(x.dot, x.k).toBe(x.seg);
    expect(new Set(m.map((x) => x.seg)).size).toBe(m.length);
  });
  test('een afgesloten maand toont alleen wat uitging en geen tempostreep', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => { go('ins'); insFilterZet('vorige', null); });
    const D = await mk(page);
    expect(D.stand).toBe('af');
    expect(D.segs.every((k) => ['vast', 'potjes', 'zonder'].includes(k))).toBe(true);
    expect(D.tempo).toBe(null);
    const st = await page.evaluate(() => maandStaaf('2026-09'));
    expect(D.uit).toBe(Math.round(st.spend)); expect(D.budget).toBe(Math.round(st.budget));
  });
  /* v436: de patroontegels zijn van Inzichten verdwenen; het label staat bij de signalen in Zien, uit dezelfde bron. */
  test('de patronen staan niet meer als tegels op de pagina', async ({ page }) => {
    await I.boot(page); await page.evaluate(() => go('ins'));
    expect(await page.evaluate(() => insPatronen('alle').length)).toBeGreaterThan(0);   // invoermeting: er zijn patronen
    expect(await page.locator('#s-ins #insPatronen, #s-ins .ins-pt').count()).toBe(0);
  });
  // v382: weg, 'tegen je potje: de EUR 0-groep' las de keuzekaart en de drilldown (openInsAlle, [data-insnulgroep]); die zijn weg
  // v382: weg, 'tegen vorige maanden: alleen precies EUR 0 verschil' las de keuzekaart (insKeuzeZet, openInsAlle); die is weg
});

/* ===== PLAN ===== */
/* v380: de kop "Te verdelen" (#planKopBedrag), de regel "gekozen: ... · wijzig" (#terugzetGekozen) en de gearceerde bak
   ([data-terugbak]) zijn vervallen. Het bedrag staat als functie (planToeMaand().teVerdelen) en als tegel "Deze maand opzij"
   in de kop van Plan, het terugzetdeel als chip in die kop ([data-kpiterug]), de gekozen stand gemarkeerd in "verdeling ⚙"
   (openPlanInstel()), en wat er per bron terug gaat in planStandEind().per[id].tb (de rij arceert terug en inleg samen). */
const kop = (page) => page.evaluate(() => { go('vooruit'); const SE = planStandEind();
  const r = { bedrag: planToeMaand().teVerdelen, opzij: +document.querySelector('#planKpi [data-kpiopzij]').dataset.kpiopzij,
    kpiterug: (document.querySelector('#planKpi [data-kpiterug]') || { dataset: {} }).dataset.kpiterug || null,
    kaart: !!document.getElementById('terugzetKaart'), kopWeg: !document.getElementById('planKopBedrag'),
    save: safeToSpend().saveReserved, nf: SET.nfToegewezen,
    terug: Object.keys(SE.per).filter((id) => SE.per[id].tb > 0).map((id) => id + ':' + SE.per[id].tb),
    eta: Object.fromEntries(allocatePlan().map((p) => [p.id, p.eta])) };
  openPlanInstel(); r.gekozen = (document.querySelector('[data-instelterug][data-gekozen="1"]') || { dataset: {} }).dataset.instelterug || null; closeSheet();
  return r; });
test.describe('e · Plan', () => {
  test('zonder keuze blijft de inleg EUR 2.200, staat de kaart er zonder voorkeuze, en schrijft openen niets', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => go('vooruit'));
    const r = await kop(page);
    /* v367: op Plan staat een compacte regel; de kaart met de drie keuzes opent erachter (openTerugzetSheet()) */
    expect(r.bedrag).toBe(2200); expect(r.opzij).toBe(2200); expect(r.kpiterug).toBe(null); expect(r.gekozen).toBe(null);
    expect(r.kopWeg).toBe(true); expect(r.kaart).toBe(false); expect(r.save).toBe(2431);
    expect(await page.locator('#terugzetRegel').innerText()).toMatch(/€231 eruit gehaald in oktober\s*kies ›/);
    await page.click('#terugzetRegel');
    expect(await page.evaluate(() => SET.terugzet)).toBeUndefined();
    const t = await page.locator('#terugzetKaart').innerText();
    expect(t).toContain('€231 eruit gehaald in oktober · uit Noodfonds');
    expect(t).toContain('inleg okt €2.431 · Noodfonds vol okt 2026');
    /* v380: wat er na deze maand nog terugkomt (2 x 77) is pending en de inleg vult het niet; het Noodfonds is vol in de
       maand van het laatste deel (december), en Kosten Koper krijgt vanaf november de hele inleg, net als bij alles deze
       maand (1.838 + 2.200 per maand haalt 15.000 in april), dus zijn datum staat er niet bij. Was: Noodfonds okt, Kosten
       Koper mei 2027. */
    expect(t).toContain('€77 extra per maand t/m dec · Noodfonds vol dec 2026');
    expect(t).not.toMatch(/t\/m dec · Noodfonds vol dec 2026 · Kosten Koper/);
    expect(t).toContain('inleg blijft €2.200 · Noodfonds vol okt 2026 · Kosten Koper vol mei 2027');
    expect(await page.locator('#terugzetGekozen').count()).toBe(0);
    expect(await page.locator('#planInleg').count()).toBe(0);
  });
  test('alles deze maand: EUR 2.431, het geld gaat gearceerd naar het Noodfonds, de toewijzing blijft', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => { go('vooruit'); terugzetKies('alles'); });
    const r = await kop(page);
    expect(r.bedrag).toBe(2431); expect(r.gekozen).toBe('alles');   // v440: de kop toont "Opzij deze periode" (opzijPeriode), geen terug-chip meer
    expect(r.terug).toEqual(['noodfonds:231']); expect(r.nf).toBe(3638); expect(r.save).toBe(2431);
    expect(r.eta).toEqual({ noodfonds: 1, kk: 7, iw: null });
    /* v380: terug en inleg staan samen gearceerd in de rij (231 + 362 = 593 van 4.000) */
    expect(+(await page.locator('[data-bijvat="noodfonds"]').getAttribute('data-pct'))).toBeCloseTo((231 + 362) / 4000 * 100, 1);
  });
  /* v380: de twee delen die nog komen (nov 77, dec 77) zijn pending: het Noodfonds is vol in december (eta 3, was 1), en
     de inleg gaat vanaf november helemaal naar Kosten Koper (1.838 + 2.200 x 6 = 15.038 in april, eta 7; was mei 2027). */
  test('over drie maanden: EUR 2.277 deze maand, EUR 77 naar het Noodfonds, Noodfonds dec 2026 en Kosten Koper apr 2027 (v380)', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => { go('vooruit'); terugzetKies('drie'); });
    const r = await kop(page);
    expect(r.bedrag).toBe(2277); expect(r.gekozen).toBe('drie');   // v440: geen terug-chip in de kop meer
    expect(r.terug).toEqual(['noodfonds:77']); expect(r.save).toBe(2277);
    expect(await page.evaluate((e) => [etaDatum(e.noodfonds), etaDatum(e.kk)], r.eta)).toEqual(['dec 2026', 'apr 2027']);
    expect(r.eta.noodfonds).toBe(3); expect(r.eta.kk).toBe(7);
  });
  test('niet terugzetten: inleg EUR 2.200, het Noodfonds levert EUR 231 in, en wijzigen zet dat terug', async ({ page }) => {
    await P.boot(page); await page.evaluate(() => { go('vooruit'); terugzetKies('niet'); });
    const r = await kop(page);
    expect(r.bedrag).toBe(2200); expect(r.gekozen).toBe('niet'); expect(r.kpiterug).toBe(null);
    expect(r.terug).toEqual([]); expect(r.nf).toBe(3407); expect(r.save).toBe(2200);
    expect(await page.evaluate((e) => [etaDatum(e.noodfonds), etaDatum(e.kk)], r.eta)).toEqual(['okt 2026', 'mei 2027']);
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
    expect((await kop(page)).bedrag).toBe(2277);   // v380: 2.200 + het deel van november, uit planToeMaand() (v440: geen terug-chip)
    await page.evaluate((r) => { SET.terugzet = r; save(); render(); }, rec('alles'));
    expect((await kop(page)).bedrag).toBe(2200); expect((await kop(page)).kpiterug).toBe(null);
  });
  /* v367: "geen tekst over een bak heen" is vervallen met de bakken; Plan is een rij per doel (vrij-uitschieters.spec.js d). */
});
