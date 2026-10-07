// v354/v355: Deze maand op Grip scheidt vast en variabel. De bridge gaat over de variabele potjes, de vaste
// lasten staan als een regel eronder. v355: vast is wat de app als terugkerende betaling herkent (per boeking,
// isFixed) plus een potje dat je bewust op vast zette (SET.potAard of een eigen categorie met aard vast). Er is
// geen vaste lijst. Een potje met een herkende incasso is gemengd: de incasso's zijn het vaste deel, de rest is
// variabel en staat in de bridge met zijn gewone patroon.
// Fixtures: tests/vast-variabel-stand.js (Huur EUR 750 zonder betaling, Vervoer met lease en tanken) en
// tests/deze-maand-stand.js (de stand van 6 oktober, Sport met Basic Fit).
const { test, expect } = require('@playwright/test');
const { boot } = require('./vast-variabel-stand');
const Zes = require('./deze-maand-stand');

const lees = (page) => page.evaluate(() => { const V = maandVooruit(); const Br = dezeMaandBrug(V);
  return { V: { projectie: V.projectie, budget: V.budget, variabel: V.variabel, vaste: V.vaste, zonder: V.zonder,
    potjes: V.potjes.map((x) => ({ k: x.k, bud: x.bud, uit: x.uit, eind: x.eind, vastDeel: x.vastDeel })),
    vaste_: V.vastePotjes.map((x) => ({ k: x.k, bud: x.bud, uit: x.uit, vast: x.vast, eind: x.eind, geen: x.geen })) },
    stappen: Br.stappen.map((s) => ({ soort: s.soort, label: s.label, k: s.k || null, w: s.waarde })) }; });
const naarGrip = async (page) => { await page.evaluate(() => go('maand')); await page.waitForSelector('#gripDezeMaand [data-dmregel]'); };
const HUURVAST = { set: { potAard: { huur: 'vast' } } };
const huurTx = [
  { id: 'h7', date: '2026-07-12', amount: -300, name: 'Kamerverhuur', desc: 'OVERBOEKING HUUR KAMER' },
  { id: 'h8', date: '2026-08-27', amount: -450, name: 'Kamerverhuur', desc: 'OVERBOEKING HUUR KAMER' },
  { id: 'h9', date: '2026-09-19', amount: -200, name: 'Kamerverhuur', desc: 'OVERBOEKING HUUR KAMER' },
];

test.describe('a. een gemengd potje: de herkende incasso is vast, de rest variabel', () => {
  test('Vervoer: de lease is het vaste deel, tanken staat in de bridge met alleen het variabele deel', async ({ page }) => {
    await boot(page); const r = await lees(page);
    const inv = await page.evaluate(() => ({ lease: isFixed(TX.find((t) => t.name === 'Auto Lease')), shell: isFixed(TX.find((t) => t.name === 'Shell')) }));
    expect(inv).toEqual({ lease: true, shell: false });   // de invoer draagt het geval: een potje met beide soorten
    expect(r.V.vaste_.find((x) => x.k === 'vervoer')).toEqual({ k: 'vervoer', bud: 537, uit: 0, vast: 537, eind: 537, geen: false });
    expect(r.V.potjes.find((x) => x.k === 'vervoer')).toEqual({ k: 'vervoer', bud: 63, uit: 55, eind: 145, vastDeel: 537 });
  });
  test('het vaste en het variabele deel tellen op tot het potje', async ({ page }) => {
    await boot(page); const r = await lees(page);
    for (const k of ['vervoer', 'verzekering']) {
      const v = r.V.vaste_.find((x) => x.k === k), p = r.V.potjes.find((x) => x.k === k);
      expect(v.bud + p.bud).toBe({ vervoer: 600, verzekering: 175 }[k]);
    }
  });
  test('de drie delen tellen op tot de uitkomst', async ({ page }) => {
    await boot(page); const r = await lees(page);
    expect(r.V.variabel).toEqual({ budget: 1444, eind: 1022 });
    expect(r.V.vaste).toEqual({ budget: 701, eind: 701 });
    expect(r.V.variabel.eind + r.V.vaste.eind + r.V.zonder).toBe(r.V.projectie);
    expect(r.V.projectie).toBe(1723);
  });
});

test.describe('b. geen vaste lijst', () => {
  test('op de stand van 6 oktober is Sport alleen voor Basic Fit vast; de rest staat in de bridge', async ({ page }) => {
    await Zes.boot(page); const r = await lees(page);
    expect(r.V.vaste_.find((x) => x.k === 'sport')).toMatchObject({ bud: 73, vast: 73, eind: 73 });
    expect(r.V.potjes.find((x) => x.k === 'sport')).toMatchObject({ bud: 527, eind: 0, vastDeel: 73 });
    expect(r.V.vaste_.find((x) => x.k === 'verzekering')).toMatchObject({ bud: 150, eind: 150 });
    expect(r.V.vaste_.find((x) => x.k === 'huur')).toMatchObject({ bud: 1450, uit: 1450, eind: 1450 });
    expect(r.V.potjes.map((x) => x.k)).not.toContain('huur');   // de huur is helemaal de herkende incasso
    expect(r.V.vaste).toEqual({ budget: 1703, eind: 1703 });
    expect(r.V.variabel).toEqual({ budget: 1672, eind: 694 });
    expect(r.V.projectie).toBe(2672);                            // de uitkomst verandert niet, alleen de indeling
    expect(r.stappen.filter((s) => s.soort === 'potje').map((s) => s.k)).toEqual(['vices', 'boodschappen']);   // v356: los alleen wat boven eindigt
  });
  test('Huur zonder herkende betaling en zonder keuze is variabel', async ({ page }) => {
    await boot(page); const r = await lees(page);
    expect(r.V.vaste_.map((x) => x.k)).not.toContain('huur');
    expect(r.V.potjes.find((x) => x.k === 'huur')).toMatchObject({ bud: 750, uit: 0, eind: 0 });
  });
  test('Huur die je bewust op vast zet, telt zonder betaling met zijn hele potje', async ({ page }) => {
    await boot(page, HUURVAST); const r = await lees(page);
    expect(r.V.potjes.map((x) => x.k)).not.toContain('huur');
    expect(r.V.vaste_.find((x) => x.k === 'huur')).toEqual({ k: 'huur', bud: 750, uit: 0, vast: 0, eind: 750, geen: true });
    expect(r.V.vaste).toEqual({ budget: 1451, eind: 1451 });
    expect(r.V.variabel).toEqual({ budget: 694, eind: 1022 });
    expect(r.V.projectie).toBe(1723 + 750);
    expect(r.V.variabel.eind + r.V.vaste.eind + r.V.zonder).toBe(r.V.projectie);
  });
  test('een eigen categorie met aard vast is helemaal vast, en een keuze wisselend zet hem terug', async ({ page }) => {
    await boot(page, { set: { eigenCats: { e_ali: { naam: 'Alimentatie', aard: 'vast', kleur: '', op: '2026-10-01' } }, budgets: { huur: 750, vervoer: 600, verzekering: 175, boodschappen: 500, vices: 50, uiteten: 70, e_ali: 400 } } });
    const a = await page.evaluate(() => { const V = maandVooruit(); return { vast: V.vastePotjes.find((x) => x.k === 'e_ali'), var: V.potjes.find((x) => x.k === 'e_ali') }; });
    expect(a.vast).toMatchObject({ bud: 400, eind: 400 });
    expect(a.var).toBeUndefined();
    const b = await page.evaluate(() => { SET.potAard = { e_ali: 'wisselend' }; _dataGen++; const V = maandVooruit(); return { vast: V.vastePotjes.find((x) => x.k === 'e_ali'), var: V.potjes.find((x) => x.k === 'e_ali') }; });
    expect(b.vast).toBeUndefined();
    expect(b.var).toMatchObject({ bud: 400 });
  });
  test('een vast potje rekent niet met het gemiddelde: losse huurbetalingen van eerdere maanden tellen niet', async ({ page }) => {
    await boot(page, Object.assign({ extraTx: huurTx }, HUURVAST));
    const inv = await page.evaluate(() => ({ cat: catOf(TX.find((t) => t.date === '2026-09-19' && t.name === 'Kamerverhuur')), rc: [...recurringCats()] }));
    expect(inv.cat).toBe('huur'); expect(inv.rc).not.toContain('huur');
    const r = await lees(page);
    expect(r.V.vaste_.find((x) => x.k === 'huur')).toMatchObject({ eind: 750, geen: true });
    expect(r.V.projectie).toBe(1723 + 750);
  });
  test('zonder keuze telt hetzelfde patroon wel, als variabel potje', async ({ page }) => {
    await boot(page, { extraTx: huurTx }); const r = await lees(page);
    expect(r.V.potjes.find((x) => x.k === 'huur')).toMatchObject({ uit: 0, eind: 317 });   // (450 + 200) / 3, na dag 6
  });
  test('een incasso uit de terugval in een vast potje telt als verwacht in dat potje', async ({ page }) => {
    await boot(page, Object.assign({ extraTx: [{ id: 'hi9', date: '2026-09-01', amount: -750, name: 'Wooncorporatie', desc: 'SEPA INCASSO WOONCORPORATIE HUURBETALING' }] }, HUURVAST));
    const inv = await page.evaluate(() => monthLiquidity().fixDueItems.filter((s) => s.cat === 'huur').map((s) => ({ inPotje: s.inPotje, amount: s.amount })));
    expect(inv).toEqual([{ inPotje: true, amount: 750 }]);
    const r = await lees(page);
    expect(r.V.vaste_.find((x) => x.k === 'huur')).toMatchObject({ vast: 750, eind: 750, geen: false });
    expect(r.V.projectie).toBe(1723 + 750);
  });
});

test.describe('c. de kaart', () => {
  test('de kop noemt het stuurgetal, Vervoer staat in de bridge en Huur in de regel vaste lasten', async ({ page }) => {
    await boot(page, HUURVAST); await naarGrip(page);
    expect(await page.locator('#gripDezeMaand [data-dmregel]').innerText()).toMatch(/^Variabel: €1\.022 verwacht · €328 boven je potjes/);
    const brug = await page.locator('#gripBrug').innerText();
    expect(brug).not.toContain('Huur');
    expect(brug).toContain('Vervoer');
    const vr = await page.locator('#gripDezeMaand [data-vastregel]').innerText();
    expect(vr).toContain('Vaste lasten €1.451 van €1.451');
    expect(vr).toContain('Huur: geen betaling verwacht deze maand · €750 telt mee als vaste last');
    expect(await page.locator('#gripDezeMaand [data-vastgrootste]').getAttribute('data-vastgrootste')).toBe('huur');
  });
  test('een potje zonder betaling gaat in de regel voor op een grotere afwijking', async ({ page }) => {
    // Vervoer EUR 500 tegen een lease van EUR 537: een vast deel dat EUR 37 boven zijn potje uitkomt
    await boot(page, { set: { potAard: { huur: 'vast' }, budgets: { huur: 750, vervoer: 500, verzekering: 175, boodschappen: 500, vices: 50, uiteten: 70 } } });
    const inv = await page.evaluate(() => maandVooruit().vastePotjes.map((x) => [x.k, Math.round(x.overR), x.geen]));
    expect(inv).toContainEqual(['vervoer', 37, false]);   // de invoer draagt een afwijking die groter is dan die van Huur (0)
    expect(inv).toContainEqual(['huur', 0, true]);
    await naarGrip(page);
    expect(await page.locator('#gripDezeMaand [data-vastgrootste]').getAttribute('data-vastgrootste')).toBe('huur');
  });
  test('de totale uitkomst staat niet op de kaart, wel in de sheet', async ({ page }) => {
    await boot(page, HUURVAST); await naarGrip(page);
    expect(await page.locator('#gripDezeMaand').innerText()).not.toContain('€2.473');
    await page.locator('#gripDezeMaand [data-dmkop]').click();
    await page.waitForSelector('#gripVooruit');
    expect(await page.locator('#gripVooruit [data-bandregel]').innerText()).toContain('Rond €2.473');
    expect(await page.locator('#gripVooruit [data-opbouw]').innerText()).toBe('Variabel €1.022 · vaste lasten €1.451 · €328 boven je budget');
  });
});

test.describe('d. de sheets', () => {
  test('de vaste lasten per potje, met Huur als feit en Vervoer als vast deel van zijn potje', async ({ page }) => {
    await boot(page, HUURVAST); await naarGrip(page);
    await page.locator('#gripDezeMaand [data-vastregel]').click();
    await page.waitForSelector('#gripVast');
    expect(await page.locator('#gripVast [data-vastpotje]').evaluateAll((e) => e.map((x) => x.dataset.vastpotje))).toEqual(['huur', 'vervoer', 'verzekering']);
    expect(await page.locator('#gripVast [data-vastpotje="huur"]').innerText()).toContain('geen betaling verwacht deze maand · het potje telt mee');
    expect(await page.locator('#gripVast [data-vastpotje="vervoer"]').innerText()).toContain('nog €537 verwacht · van je potje van €600, de rest is variabel');
    expect(await page.locator('#gripVast [data-vastaanpassen]').getAttribute('onclick')).toBe("openPotForm('huur')");
  });
  test('Vervoer vanuit de vaste lasten opent het vaste deel, vanuit de bridge het variabele deel', async ({ page }) => {
    await boot(page, HUURVAST); await naarGrip(page);
    await page.locator('#gripDezeMaand [data-vastregel]').click();
    await page.locator('#gripVast [data-vastpotje="vervoer"]').click();
    await page.waitForSelector('#gripPotje[data-potje="vervoer"][data-terug]');
    expect(await page.locator('#gripPotje [data-gemengd]').innerText()).toContain('De andere €63 van je potje is variabel');
    await page.evaluate(() => gripBrugTik('potje', 'vervoer'));
    await page.waitForSelector('#gripPotje[data-potje="vervoer"]:not([data-terug])');
    expect(await page.locator('#gripPotje [data-gemengd]').innerText()).toBe('Van je potje van €600 is €537 vaste last (herkende incasso\'s). Deze stap gaat over de €63 daarnaast.');
    expect(await page.locator('#gripPotje [data-potaardvraag]').count()).toBe(0);   // een herkend potje is al vast voor zijn incasso
  });
  test('Huur zonder betaling: geen onderschrijding, en terugzetten staat erbij', async ({ page }) => {
    await boot(page, HUURVAST); await naarGrip(page);
    await page.evaluate(() => openGripPotje('huur', 'vast'));
    const t = await page.locator('#gripPotje').innerText();
    expect(t).toContain('Het potje van €750 telt mee als verwachte vaste last');
    expect(t).toContain('Geen betaling is geen besparing');
    expect(t).not.toMatch(/onder je potje/);
    expect(await page.locator('#gripPotje [data-potaardvraag]').getAttribute('data-potaardvraag')).toBe('wisselend');
  });
  test('openen schrijft niets', async ({ page }) => {
    await boot(page, HUURVAST); await naarGrip(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.locator('#gripDezeMaand [data-vastregel]').click(); await page.waitForSelector('#gripVast');
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
});

test.describe('e. een potje bewust op vast zetten', () => {
  test('vanuit de bridge: eerst het gevolg, pas de knop schrijft, en terugzetten kan', async ({ page }) => {
    await boot(page); await naarGrip(page);
    await page.evaluate(() => gripBrugTik('potje', 'huur'));
    await page.waitForSelector('#gripPotje[data-potje="huur"]');
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.locator('#gripPotje [data-potaardvraag="vast"]').click();
    await page.waitForSelector('#potAard[data-doel="vast"]');
    expect(await page.locator('#potAard [data-potaardgevolg]').innerText()).toBe('Deze maand: variabel €1.022 van €1.444 wordt €1.022 van €694, vaste lasten €701 wordt €1.451, en de uitkomst gaat van rond €1.723 naar rond €2.473.');
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
    expect(await page.evaluate(() => potHeelVast('huur'))).toBe(false);
    await page.locator('#potAard [data-potaardzet]').click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).potAard)).toEqual({ huur: 'vast' });
    expect(await page.evaluate(() => maandVooruit().projectie)).toBe(2473);
    await page.evaluate(() => openPotAard('huur'));
    await page.waitForSelector('#potAard[data-doel="leeg"]');
    await page.locator('#potAard [data-potaardzet]').click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).potAard)).toEqual({});
    expect(await page.evaluate(() => maandVooruit().projectie)).toBe(1723);
  });
});

test.describe('f. bijstellen en een grens rekenen met het vaste deel', () => {
  test('het voorstel voor Vervoer is de lease plus het gewone tanken', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => maandVooruit().handelingen.find((x) => x.k === 'vervoer'));
    expect(h).toMatchObject({ aard: 'pastniet', grens: 8, vastDeel: 537, patroon: 90 });
    expect(await page.evaluate(() => potjeBijstelVoorstel('vervoer').naar)).toBe(630);
    await page.evaluate(() => grensRestZet('vervoer'));
    const a = await page.evaluate(() => (SET.afspraken || []).find((x) => x.soort === 'grens' && x.cat === 'vervoer'));
    expect(a.bedrag).toBe(600);   // 55 getankt + 8 grens + 537 lease: de grens meet de hele categorie
  });
});

for (const w of [360, 390]) {
  test(`g. hoogtes op ${w}px, zonder overloop`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await boot(page, HUURVAST); await naarGrip(page);
    const kaart = await page.locator('#gripDezeMaand').evaluate((e) => ({ h: Math.round(e.getBoundingClientRect().height), o: e.scrollWidth - e.clientWidth }));
    const regel = await page.locator('#gripDezeMaand [data-vastregel]').evaluate((e) => Math.round(e.getBoundingClientRect().height));
    await page.locator('#gripDezeMaand [data-vastregel]').click(); await page.waitForSelector('#gripVast');
    const sheet = await page.locator('#gripVast').evaluate((e) => ({ h: Math.round(e.getBoundingClientRect().height), o: e.scrollWidth - e.clientWidth }));
    await page.evaluate(() => openPotAard('vices'));
    const aard = await page.locator('#potAard').evaluate((e) => ({ h: Math.round(e.getBoundingClientRect().height), o: e.scrollWidth - e.clientWidth }));
    console.log(`v355 ${w}px: kaart ${kaart.h}, vaste-lastenregel ${regel}, sheet ${sheet.h}, keuze ${aard.h}`);
    expect(kaart.o).toBe(0); expect(sheet.o).toBe(0); expect(aard.o).toBe(0);
    expect(regel).toBeLessThanOrEqual(70);
    expect(kaart.h).toBeLessThan(420);
    expect(sheet.h).toBeLessThan(460);   // gemeten 449 op 360 en 413 op 390
    expect(aard.h).toBeLessThan(320);
  });
}
