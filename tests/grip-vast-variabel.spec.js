// v354: Deze maand op Grip scheidt vast en variabel. De bridge gaat over de variabele potjes, de vaste
// lasten staan als een regel eronder, en een vast potje rekent met wat verwacht is en niet met het
// gemiddelde. Fixture: tests/vast-variabel-stand.js (Huur EUR 750 zonder betaling deze maand).
const { test, expect } = require('@playwright/test');
const { boot } = require('./vast-variabel-stand');

const lees = (page) => page.evaluate(() => { const V = maandVooruit(); const Br = dezeMaandBrug(V);
  return { V: { projectie: V.projectie, budget: V.budget, variabel: V.variabel, vaste: V.vaste, zonder: V.zonder,
    potjes: V.potjes.map((x) => x.k), vaste_: V.vastePotjes.map((x) => ({ k: x.k, uit: x.uit, vast: x.vast, eind: x.eind, geen: x.geen })) },
    stappen: Br.stappen.map((s) => ({ soort: s.soort, label: s.label, k: s.k || null, w: s.waarde })) }; });
const naarGrip = async (page) => { await page.evaluate(() => go('maand')); await page.waitForSelector('#gripDezeMaand [data-dmregel]'); };
const huurTx = [
  { id: 'h7', date: '2026-07-12', amount: -300, name: 'Kamerverhuur', desc: 'OVERBOEKING HUUR KAMER' },
  { id: 'h8', date: '2026-08-27', amount: -450, name: 'Kamerverhuur', desc: 'OVERBOEKING HUUR KAMER' },
  { id: 'h9', date: '2026-09-19', amount: -200, name: 'Kamerverhuur', desc: 'OVERBOEKING HUUR KAMER' },
];

test.describe('a. maandVooruit splitst vast en variabel', () => {
  test('Huur is een vast potje zonder betaling, en staat niet in de variabele potjes', async ({ page }) => {
    await boot(page); const r = await lees(page);
    expect(r.V.potjes).not.toContain('huur');
    const huur = r.V.vaste_.find((x) => x.k === 'huur');
    expect(huur).toEqual({ k: 'huur', uit: 0, vast: 0, eind: 0, geen: true });
    expect(r.V.vaste_.find((x) => x.k === 'vervoer')).toMatchObject({ vast: 537, eind: 537, geen: false });
    expect(r.V.vaste_.find((x) => x.k === 'verzekering')).toMatchObject({ vast: 164, eind: 164, geen: false });
  });
  test('de drie delen tellen op tot de uitkomst', async ({ page }) => {
    await boot(page); const r = await lees(page);
    expect(r.V.variabel).toEqual({ budget: 620, eind: 877 });
    expect(r.V.vaste).toEqual({ budget: 1525, eind: 701 });
    expect(r.V.variabel.eind + r.V.vaste.eind + r.V.zonder).toBe(r.V.projectie);
    expect(r.V.projectie).toBe(1578);
  });
  test('de bridge loopt van de variabele potjes naar wat er daar verwacht uitgaat, zonder vaste potjes', async ({ page }) => {
    await boot(page); const r = await lees(page);
    expect(r.stappen[0]).toMatchObject({ soort: 'begin', label: 'potjes', w: 620 });
    expect(r.stappen[r.stappen.length - 1]).toMatchObject({ soort: 'eind', w: 877 });
    const ks = r.stappen.filter((s) => s.soort === 'potje').map((s) => s.k);
    expect(ks).toEqual(['uiteten', 'vices', 'boodschappen']);
    for (const k of ['huur', 'vervoer', 'verzekering']) expect(ks).not.toContain(k);
    expect(r.stappen.slice(1, -1).reduce((a, s) => a + s.w, 620)).toBe(877);
  });
});

test.describe('b. een vast potje rekent met wat verwacht is, niet met het gemiddelde', () => {
  test('huur die in eerdere maanden los werd overgemaakt telt deze maand niet als gemiddelde', async ({ page }) => {
    await boot(page, { extraTx: huurTx });
    const inv = await page.evaluate(() => ({ cat: catOf(TX.find((t) => t.date === '2026-09-19' && t.name === 'Kamerverhuur')), rc: [...recurringCats()] }));
    expect(inv.cat).toBe('huur');            // de invoer draagt het geval: de boekingen landen op huur
    expect(inv.rc).not.toContain('huur');    // en het schema ziet ze niet als terugkerend
    const r = await lees(page);
    expect(r.V.vaste_.find((x) => x.k === 'huur')).toMatchObject({ eind: 0, geen: true });
    expect(r.V.projectie).toBe(1578);        // het gemiddelde (EUR 317 na dag 6) telt nergens
  });
  test('een incasso uit de terugval in een vast potje telt als verwacht in dat potje', async ({ page }) => {
    await boot(page, { extraTx: [{ id: 'hi9', date: '2026-09-01', amount: -750, name: 'Wooncorporatie', desc: 'SEPA INCASSO WOONCORPORATIE HUURBETALING' }] });
    const inv = await page.evaluate(() => monthLiquidity().fixDueItems.filter((s) => s.cat === 'huur').map((s) => ({ inPotje: s.inPotje, amount: s.amount })));
    expect(inv).toEqual([{ inPotje: true, amount: 750 }]);
    const r = await lees(page);
    expect(r.V.vaste_.find((x) => x.k === 'huur')).toMatchObject({ vast: 750, eind: 750, geen: false });
    expect(r.V.projectie).toBe(1578 + 750);
  });
});

test.describe('c. de kaart', () => {
  test('de kop noemt het stuurgetal, en Huur staat in de regel vaste lasten en niet in de bridge', async ({ page }) => {
    await boot(page); await naarGrip(page);
    expect(await page.locator('#gripDezeMaand [data-dmregel]').innerText()).toMatch(/^Variabel: €877 verwacht · €257 boven je potjes/);
    const brug = await page.locator('#gripBrug').innerText();
    expect(brug).not.toContain('Huur');
    expect(brug).toContain('potjes');
    const vr = await page.locator('#gripDezeMaand [data-vastregel]').innerText();
    expect(vr).toContain('Vaste lasten €701 van €1.525');
    expect(vr).toContain('Huur: geen betaling verwacht deze maand · €750 in je budget');
    expect(await page.locator('#gripDezeMaand [data-vastgrootste]').getAttribute('data-vastgrootste')).toBe('huur');
  });
  test('de totale uitkomst staat niet op de kaart, wel in de sheet', async ({ page }) => {
    await boot(page); await naarGrip(page);
    expect(await page.locator('#gripDezeMaand').innerText()).not.toContain('€1.578');
    await page.locator('#gripDezeMaand [data-dmkop]').click();
    await page.waitForSelector('#gripVooruit');
    expect(await page.locator('#gripVooruit [data-bandregel]').innerText()).toContain('Rond €1.578');
    expect(await page.locator('#gripVooruit [data-opbouw]').innerText()).toBe('Variabel €877 · vaste lasten €701 · €567 onder je budget');
  });
});

test.describe('d. de sheet van de vaste lasten', () => {
  test('een tik toont de vaste lasten per potje, met Huur als feit en de route om hem aan te passen', async ({ page }) => {
    await boot(page); await naarGrip(page);
    await page.locator('#gripDezeMaand [data-vastregel]').click();
    await page.waitForSelector('#gripVast');
    expect(await page.locator('#gripVast [data-vastpotje]').evaluateAll((e) => e.map((x) => x.dataset.vastpotje))).toEqual(['huur', 'vervoer', 'verzekering']);
    expect(await page.locator('#gripVast [data-vastpotje="huur"]').getAttribute('data-geen')).not.toBeNull();
    expect(await page.locator('#gripVast [data-vastpotje="huur"]').innerText()).toContain('€750 in je budget · geen betaling verwacht deze maand');
    expect(await page.locator('#gripVast [data-vastpotje="vervoer"]').innerText()).toContain('nog €537 verwacht');
    expect(await page.locator('#gripVast [data-vastvraag]').innerText()).toContain('Voor Huur komt deze maand geen betaling');
    expect(await page.locator('#gripVast [data-vastaanpassen]').getAttribute('onclick')).toBe("openPotForm('huur')");
  });
  test('een tik op Huur opent zijn sheet, die geen onderschrijding noemt', async ({ page }) => {
    await boot(page); await naarGrip(page);
    await page.locator('#gripDezeMaand [data-vastregel]').click();
    await page.locator('#gripVast [data-vastpotje="huur"]').click();
    await page.waitForSelector('#gripPotje[data-potje="huur"]');
    const t = await page.locator('#gripPotje').innerText();
    expect(await page.locator('#gripPotje').getAttribute('data-geen')).not.toBeNull();
    expect(t).toContain('geen incasso meer verwacht');
    expect(t).toContain('Geen betaling is geen besparing');
    expect(t).not.toMatch(/onder je potje/);
  });
  test('openen schrijft niets', async ({ page }) => {
    await boot(page); await naarGrip(page);
    const voor = await page.evaluate(() => localStorage.getItem('minder_set'));
    await page.locator('#gripDezeMaand [data-vastregel]').click(); await page.waitForSelector('#gripVast');
    expect(await page.evaluate(() => localStorage.getItem('minder_set'))).toBe(voor);
  });
});

for (const w of [360, 390]) {
  test(`e. hoogtes op ${w}px, zonder overloop`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await boot(page); await naarGrip(page);
    const kaart = await page.locator('#gripDezeMaand').evaluate((e) => ({ h: Math.round(e.getBoundingClientRect().height), o: e.scrollWidth - e.clientWidth }));
    const regel = await page.locator('#gripDezeMaand [data-vastregel]').evaluate((e) => Math.round(e.getBoundingClientRect().height));
    await page.locator('#gripDezeMaand [data-vastregel]').click(); await page.waitForSelector('#gripVast');
    const sheet = await page.locator('#gripVast').evaluate((e) => ({ h: Math.round(e.getBoundingClientRect().height), o: e.scrollWidth - e.clientWidth }));
    console.log(`v354 ${w}px: kaart ${kaart.h}, vaste-lastenregel ${regel}, sheet ${sheet.h}`);
    expect(kaart.o).toBe(0); expect(sheet.o).toBe(0);
    expect(regel).toBeLessThanOrEqual(70);   // gemeten 68 op 360 en 390: de reden breekt over twee regels
    expect(kaart.h).toBeLessThan(400);
    expect(sheet.h).toBeLessThan(420);
  });
}
