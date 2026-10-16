/* v366: AFSPRAKEN PER POTJE ZIJN EEN SCHEMA PER MAAND, EN WAT MET "KOMENDE 3 MAANDEN" VERDWEEN STAAT WEER OP GRIP.
   Een afspraak is pas aangepast als een latere afspraak over hetzelfde dezelfde maand(en) overschrijft
   (afspraakHerzienVan()). Het schema op de logboekpagina komt uit budgetVoorMaand() en is dus wat het budget per
   maand rekent. Een potje dat later hoger gaat staat als afvinkregel in Deze maand; de wissel van de buffer voor
   beleggen staat in Let op en in de sheet achter de tegel Beleggen. */
/* v428: Let op bestaat niet meer; de handelingen staan in Kiezen onder Te kiezen (#gripTeKiezen, met data-letop), dus Grip
   opent hier op Kiezen. Alleen de plek is veranderd. */
const { test, expect } = require('@playwright/test');
const I = require('./inzichten-stand');

/* De stand van het toestel zoals v365 hem uit de melding afleidde: drie afspraken over Huur op 8 oktober, in de
   volgorde december, oktober, november, en de eerste twee als "aangepast" OPGESLAGEN door de regel van voor v366. */
const HUUR = [
  { id: 'h1', soort: 'potje', cat: 'huur', bedrag: 530, voor: 700, van: '2026-12', tot: '2026-12', op: '2026-10-08', ts: 1, sinds: '2026-10', wat: 'Potje Huur €530 vanaf december', herzien: { op: '2026-10-08', hoe: 'aangepast' } },
  { id: 'h2', soort: 'potje', cat: 'huur', bedrag: 700, voor: 750, van: '2026-10', tot: '2026-10', op: '2026-10-08', ts: 2, sinds: '2026-10', wat: 'Potje Huur €700 vanaf oktober', herzien: { op: '2026-10-08', hoe: 'aangepast' } },
  { id: 'h3', soort: 'potje', cat: 'huur', bedrag: 600, voor: 700, van: '2026-11', tot: '2026-11', op: '2026-10-08', ts: 3, sinds: '2026-10', wat: 'Potje Huur €600 vanaf november' },
];
const HUURSET = { budgets: Object.assign({}, I.BUDGETS, { huur: 700 }), budgetsNext: { huur: 600 }, budgetPlan: { '2026-12': { huur: 530 } }, afspraken: HUUR };

test.describe('a · een afspraak is pas aangepast als een latere dezelfde maand overschrijft', () => {
  test('twee afspraken voor verschillende maanden zijn allebei geldig', async ({ page }) => {
    await I.boot(page);
    const r = await page.evaluate(() => {
      potPlanZet('vices', '2026-11', 15); const a = potjeAfspraak('vices', 15, '2026-11');
      potPlanZet('vices', '2026-12', 10); const b = potjeAfspraak('vices', 10, '2026-12');
      return { a: afspraakHerzienVan(a), b: afspraakHerzienVan(b), lopend: afsprakenLopend().map((x) => x.id).sort(), ids: [a.id, b.id].sort(),
        sa: afspraakStand(a).status, nov: budgetVoorMaand('2026-11').vices, dec: budgetVoorMaand('2026-12').vices };
    });
    expect(r.a).toBeNull(); expect(r.b).toBeNull();
    expect(r.lopend).toEqual(r.ids);
    expect(r.sa).not.toBe('herzien');
    expect([r.nov, r.dec]).toEqual([15, 10]);
  });
  test('een latere afspraak voor dezelfde maand geeft "aangepast", en alleen die', async ({ page }) => {
    await I.boot(page);
    const r = await page.evaluate(() => {
      potPlanZet('vices', '2026-11', 15); const a = potjeAfspraak('vices', 15, '2026-11');
      potPlanZet('vices', '2026-12', 10); const b = potjeAfspraak('vices', 10, '2026-12');
      potPlanZet('vices', '2026-11', 12); const c = potjeAfspraak('vices', 12, '2026-11');
      const H = afspraakHerzienVan(a);
      return { a: H && H.hoe, door: H && H.door, c: c.id, b: afspraakHerzienVan(b), cH: afspraakHerzienVan(c), sa: afspraakStand(a).feit, opgeslagen: !!a.herzien };
    });
    expect(r.a).toBe('aangepast'); expect(r.door).toBe(r.c);
    expect(r.b).toBeNull(); expect(r.cH).toBeNull();
    expect(r.sa).toContain('aangepast op');
    expect(r.opgeslagen).toBe(false);   // het volgt uit de overlap en wordt niet weggeschreven
  });
  test('een storting die dezelfde maanden overschrijft is aangepast; stoppen blijft gestopt', async ({ page }) => {
    await I.boot(page);
    const r = await page.evaluate(() => {
      const a = afspraakMaak({ soort: 'storting', bedrag: 131, van: '2026-10', tot: '2026-11', wat: 'x' });
      const b = afspraakMaak({ soort: 'storting', bedrag: 150, van: '2026-10', tot: '2026-12', wat: 'y' });
      const c = afspraakMaak({ soort: 'grens', cat: 'uiteten', bedrag: 100, van: '2026-10', tot: '2026-10', wat: 'z' });
      afspraakHerzien(c.id, 'gestopt');
      return { a: (afspraakHerzienVan(a) || {}).hoe, b: afspraakHerzienVan(b), c: (afspraakHerzienVan(c) || {}).hoe };
    });
    expect(r.a).toBe('aangepast'); expect(r.b).toBeNull(); expect(r.c).toBe('gestopt');
  });
});

test.describe('b · het schema per potje op de logboekpagina', () => {
  test('Huur: drie maanden naast elkaar, alle drie geldig, het schema uit het budget', async ({ page }) => {
    await I.boot(page, { set: HUURSET });
    const voor = await page.evaluate(() => JSON.stringify(SET.afspraken));
    await page.evaluate(() => go('logboek'));
    const r = await page.evaluate(() => { const g = document.querySelector('#logAfspraken [data-afspraakgroep="potje|huur"]');
      return { schema: g.querySelector('[data-potschema]').innerText.trim(),
        rijen: [...g.querySelectorAll('[data-logafspraak]')].map((e) => ({ id: e.dataset.logafspraak, g: e.dataset.geldend, t: e.innerText.replace(/\s+/g, ' ') })),
        ouder: !!g.querySelector('[data-ouder]'), na: JSON.stringify(SET.afspraken) }; });
    console.log('huur', r.schema);
    expect(r.schema).toBe('Huur · okt €700 · nov €600 · dec+ €530');
    expect(r.rijen.map((x) => x.id)).toEqual(['h2', 'h3', 'h1']);
    expect(r.rijen.every((x) => x.g === '1')).toBe(true);
    expect(r.ouder).toBe(false);
    expect(r.na).toBe(voor);   // geen data gewijzigd
  });
  test('het schema is gelijk aan wat het budget per maand rekent (een bron)', async ({ page }) => {
    await I.boot(page, { set: Object.assign({}, HUURSET, { budgetPlan: { '2026-12': { huur: 530 }, '2027-02': { huur: 530 }, '2027-03': { huur: 650 } } }) });
    const r = await page.evaluate(() => { const R = potjeSchema('huur'); const per = {};
      for (const x of R) for (let m = x.van; m <= x.tot; m = nextYM(m)) per[m] = x.bedrag;
      const budget = {}; for (const m of Object.keys(per)) budget[m] = Math.round(+(budgetVoorMaand(m).huur) || 0);
      return { per, budget, tekst: potjeSchemaTekst('huur'), laatste: R[R.length - 1].van }; });
    expect(r.per).toEqual(r.budget);
    expect(Object.keys(r.per)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03']);
    expect(r.tekst).toBe('Huur · okt €700 · nov €600 · dec t/m feb 2027 €530 · mrt 2027+ €650');
    expect(r.laatste).toBe('2027-03');
  });
  test('een overschreven afspraak staat ingeklapt onder de geldende', async ({ page }) => {
    await I.boot(page, { set: Object.assign({}, HUURSET, { afspraken: HUUR.concat([{ id: 'h4', soort: 'potje', cat: 'huur', bedrag: 650, voor: 700, van: '2026-11', tot: '2026-11', op: '2026-10-09', ts: 4, sinds: '2026-10', wat: 'Potje Huur €650 vanaf november' }]), budgetsNext: { huur: 650 } }) });
    await page.evaluate(() => go('logboek'));
    const lees = () => page.evaluate(() => { const g = document.querySelector('#logAfspraken [data-afspraakgroep="potje|huur"]'); const o = g.querySelector('[data-ouder]');
      return { schema: g.querySelector('[data-potschema]').innerText.trim(), geldend: [...g.querySelectorAll('[data-geldend="1"]')].map((e) => e.dataset.logafspraak),
        oud: [...g.querySelectorAll('[data-geldend="0"]')].map((e) => e.innerText.replace(/\s+/g, ' ')), n: o && o.dataset.ouder, open: o && o.dataset.ouderopen }; });
    const dicht = await lees();
    expect(dicht.schema).toBe('Huur · okt €700 · nov €650 · dec+ €530');
    expect(dicht.geldend).toEqual(['h2', 'h4', 'h1']);
    expect(dicht.n).toBe('1'); expect(dicht.open).toBe('0'); expect(dicht.oud).toEqual([]);
    await page.click('[data-afspraakgroep="potje|huur"] [data-ouder]');
    const open = await lees();
    expect(open.open).toBe('1'); expect(open.oud.length).toBe(1);
    expect(open.oud[0]).toContain('€600'); expect(open.oud[0]).toContain('overschreven');
  });
});

/* v367: EEN POTJE DAT LATER HOGER GAAT STAAT NIET MEER ALS AFVINKREGEL IN DEZE MAAND; het telt in de regel "N afspraken
   voor <maand>–<maand> › Logboek", net als een lager potje vanaf een latere maand. Het schema staat in het logboek. */
test.describe('c · een potje dat later hoger gaat telt in de regel naar het logboek', () => {
  test('hoger vanaf volgende maand en vanaf een latere maand, uit hetzelfde schema; lager niet', async ({ page }) => {
    await I.boot(page, { set: { budgetsNext: { vices: 50, boodschappen: 350 }, budgetPlan: { '2027-01': { uiteten: 200 } } } });
    await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); });   // v387: de afspraken staan op Kiezen
    const r = await page.evaluate(() => ({ o: potjeOmhoogRegels().map((x) => x.k + '|' + x.ym), rij: document.querySelectorAll('#gripInhoud [data-potomhoog]').length,
      later: document.querySelectorAll('#gripInhoud [data-afsprakenlater]').length }));
    expect(r.o).toEqual(['vices|2026-11', 'uiteten|2027-01']);
    expect(r.rij).toBe(0);
    expect(r.later).toBe(0);   // v390: Kiezen draagt geen regel "N afspraken voor ..."; het schema staat in het logboek
    const b = await page.evaluate(() => ({ v: budgetVoorMaand('2026-11').vices, u: budgetVoorMaand('2027-01').uiteten }));
    expect(b).toEqual({ v: 50, u: 200 });
  });
  test('v390: een lager potje vanaf later staat niet op Kiezen maar in het logboek', async ({ page }) => {
    await I.boot(page, { set: { budgetsNext: { vices: 50 } } });
    await page.evaluate(() => { potPlanZet('boodschappen', '2026-11', 350); potjeAfspraak('boodschappen', 350, '2026-11'); go('maand'); gripKiesTab('kiezen'); });
    const r = await page.evaluate(() => ({ af: document.querySelectorAll('#gripInhoud [data-afspraak], #gripInhoud [data-afsprakenlater]').length }));
    expect(r).toEqual({ af: 0 });
    await page.evaluate(() => go('logboek'));
    expect(await page.locator('#logAfspraken [data-potschema="boodschappen"]').count()).toBe(1);
  });
  test('zonder geplande wijziging staat er geen regel', async ({ page }) => {
    await I.boot(page);
    await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); });
    expect(await page.locator('#gripInhoud [data-afsprakenlater]').count()).toBe(0);
  });
});

test.describe('d · de wissel van de buffer voor beleggen', () => {
  test('de maand ervoor als feit onder Signalen op Zien (v428), en altijd in de sheet achter de tegel', async ({ page }) => {
    await I.boot(page, { set: { bufferNormNext: 3 } });
    await page.evaluate(() => { go('maand'); });
    const r = await page.evaluate(() => { const L = gripLetOpItems(maandRegels(), valtOpSignals(thisYM()), belegVragen ? belegVragen() : []);
      return { L: L.map((x) => x.soort), item: L.find((x) => x.soort === 'belegwissel'),
        /* v434: een feit zonder vraag of keuze staat onder "Afgehandeld deze maand" (uitgeklapt gelezen) */
        sig: (window._gripAfOpen = true, renderMaand(), [...document.querySelectorAll('#gripSignalen [data-signaal], #gripSignalen [data-afgehandeldrij]')].map((e) => e.dataset.signaal || e.dataset.afgehandeldrij)), W: beleggenWissel() }; });
    expect(r.W).toEqual({ nu: 2, vlg: 3, ym: '2026-11' });
    expect(r.item.naam).toBe('Buffer voor beleggen: 3 maanden vanaf november');
    expect(r.item.sub).toBe('nu 2, volgt je ondergrens');
    expect(r.item.dot).toBe('neutraal');
    /* v428: een feit staat onder Signalen op Zien, niet onder Te kiezen */
    expect(r.sig.some((s) => s.startsWith('lo:belegwissel'))).toBe(true);
    await page.evaluate(() => gripKiesTab('kiezen'));
    await expect(page.locator('#gripTeKiezen [data-letop="belegwissel"]')).toHaveCount(0);
    await page.evaluate(() => openBeleggenVoorwaarden());
    await expect(page.locator('#sheet [data-belegwissel="3"]')).toContainText('Vanaf november toetst de bufferrij tegen 3 maanden, nu 2');
  });
  test('met twee regels die aandacht vragen staan die onder Te kiezen en blijft de wissel een signaal (v428: geen "nog N")', async ({ page }) => {
    await I.boot(page, { set: { bufferNormNext: 3 } });
    const r = await page.evaluate(() => {
      const ks = ['huur', 'overig'].filter((k) => CATS[k] && !(+(SET.budgets || {})[k] > 0));
      SET.potOpen = {}; ks.forEach((k, i) => { const id = 'po' + i; TX.push({ id, date: '2026-10-03', amount: -40, acc: TX[0].acc, name: 'Test ' + k, desc: 'TEST ' + k, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
        categorize(TX[TX.length - 1]); TX[TX.length - 1].id = id; OVR[id] = k; SET.potOpen[k] = { op: '2026-10-01' }; });
      save(); go('maand');
      window._gripAfOpen = true; renderMaand();   // v434: de wissel is een feit zonder keuze, dus afgehandeld
      const sig = [...document.querySelectorAll('#gripSignalen [data-signaal], #gripSignalen [data-afgehandeldrij]')].map((e) => e.dataset.signaal || e.dataset.afgehandeldrij);
      gripKiesTab('kiezen');
      return { ks, kaart: [...document.querySelectorAll('#gripTeKiezen [data-letop]')].map((e) => e.dataset.letop), sig }; });
    expect(r.ks.length).toBe(2);   // de invoer draagt het geval
    expect(r.kaart.filter((s) => s === 'potopen').length).toBe(2);
    expect(r.kaart).not.toContain('belegwissel');
    expect(r.sig.some((s) => s.startsWith('lo:belegwissel'))).toBe(true);
    await expect(page.locator('[data-letopnog]')).toHaveCount(0);
  });
  test('met een eigen drempel is er geen wissel, in Let op en in de sheet', async ({ page }) => {
    await I.boot(page, { set: { bufferNormNext: 3, beleggenDrempel: 4 } });
    await page.evaluate(() => { go('maand'); gripKiesTab('kiezen'); openBeleggenVoorwaarden(); });
    expect(await page.locator('#gripTeKiezen [data-letop="belegwissel"]').count()).toBe(0);
    expect(await page.locator('#sheet [data-belegwissel]').count()).toBe(0);
    expect(await page.evaluate(() => beleggenWissel())).toBeNull();
  });
});
