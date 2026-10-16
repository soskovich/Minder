// v390: CORRECTIES OP GRIP NA SCHERMEN VAN HET TOESTEL. (1) Het spaardoel in de terugblik en de Doelen-meter noemen hun
// basis: gestort (min eruit) tegen verwacht (Plan opzij min eruit). (3) Zonder gemeten afgesloten maand geen "0 van 0".
// (4) Een tab-✓ alleen na afronding. (5) Kiezen zonder afvinkregels, afspraken-regel en losse "Kies voor"-link. (6) De
// Beleggen-meter noemt de voorwaarde die ontbreekt, en inleg die loopt geeft het patroon. (7) De patroonkaart als boom.
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const OPNAMES = [['2026-10-06', 300], ['2026-10-09', 400]];
const PEAKS = { assets: [{ id: 'peaks', naam: 'Peaks', grow: true, waarde: 620, per: 100, voorwaarden: true }], reserveringen: [{ id: 'p1', naam: 'Boetes cjib', bedrag: 299, vervalmaand: '2026-11', intervalM: 0 }], resCheck: '2026-10' };
const grip = async (page, o) => { await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page, o); await page.evaluate(() => go('maand')); };
/* gekoppelde inleg naar Peaks op een dag (v332): een afschrijving op Sparen & beleggen met een koppeling */
const inleg = (page, d) => page.evaluate(d => { const t = { id: 'pk' + d, date: d, amount: -100, acc: 'NL01MAIN0000001111', name: 'Stichting Peaks', desc: 'SEPA INCASSO STICHTING PEAKS', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
  categorize(t); TX.push(t); OVR[t.id] = 'sparen'; SET.bezitKoppel = Object.assign({}, SET.bezitKoppel, { [t.id]: 'peaks' }); save(); renderMaand(); }, d);
const tab = (page, t) => page.evaluate(t => gripKiesTab(t), t);
const tekst = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);

test.describe('1 · spaardoel en Doelen-meter noemen hun basis', () => {
  test('de terugblik zegt "gestort X van Y · loopt nog", de meter "verwacht A van Y", en de twee getallen verschillen', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    const r = await page.evaluate(() => ({ net: Math.round(savedNet(thisYM())), opzij: gripMeterDoelen().opzij, verwacht: gripMeterDoelen().netto }));
    expect(r.verwacht).toBe(r.opzij - 700);   // verwacht = Plan opzij min eruit
    expect(r.net).not.toBe(r.verwacht);       // gestort min eruit is een ander getal
    expect(await tekst(page, '[data-meterverwachtdoel]')).toBe(`verwacht €${r.verwacht.toLocaleString('nl-NL')} van €${r.opzij.toLocaleString('nl-NL')}`);
    await tab(page, 'terugblik');
    const sp = await tekst(page, `[data-terugmaand="2026-10"] [data-terugrij="spaardoel"] [data-spaarterug]`);
    // v391: drie delen, gestort nooit negatief, en netto is savedNet
    expect(sp).toMatch(/^gestort €[\d.]+ · eruit €700 · netto -?€[\d.]+ van €2\.900 · loopt nog$/);   // v397: de EUR 700 uit vrij spaargeld gaat terug en telt in opzij
    expect(sp).toContain(`netto ${r.net < 0 ? '-' : ''}€${Math.abs(r.net).toLocaleString('nl-NL')}`);
    // onder de meters het verschil tussen nu en verwacht, en geen uitlegregel meer (die staat in de sheet)
    expect(await tekst(page, '[data-meternuverwacht]')).toBe(`Doelen: nu netto ${r.net < 0 ? '-' : ''}€${Math.abs(r.net).toLocaleString('nl-NL')} · verwacht eind €${r.verwacht.toLocaleString('nl-NL')}`);
    expect(await page.locator('[data-meteruitleg]').count()).toBe(0);
  });
  test('de sheet van de meter noemt verwacht en verwijst voor gestort naar de terugblik', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await page.evaluate(() => openGripMeter('doelen'));
    expect(await tekst(page, '[data-meternetto]')).toContain('Verwacht naar je doelen');
    expect(await tekst(page, '[data-meterschaal]')).toContain('Terugblik');
  });
});

test.describe('3 · terugblik zonder gemeten maand', () => {
  test('geen "0 van 0" maar "Nog geen afgesloten maand gemeten", en de lopende maand alleen als tussenstand', async ({ page }) => {
    await grip(page);
    await tab(page, 'terugblik');
    expect(await tekst(page, '[data-terugscore]')).toBe('Nog geen afgesloten maand gemeten');
    expect(await page.locator('[data-terugvergelijk]').count()).toBe(0);
    expect(await tekst(page, '[data-terugblik]')).not.toContain('0 van 0');
    expect(await tekst(page, '[data-tussenstand]')).toMatch(/^Tussenstand oktober · loopt nog/);
  });
  test('met een gemeten afgesloten maand staat zijn score bovenaan en de lopende maand als tussenstand', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { SET.gripOpzij = { '2026-09': { opzij: 1000 } };
      const t = { id: 'stsep', date: '2026-09-20', amount: 1000, acc: 'NL01SPAR0000002222', name: 'Inleg', desc: 'OVERBOEKING VAN MAIN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); gripKiesTab('terugblik'); });
    expect(await tekst(page, '[data-terugscore]')).toBe('September 1 van 1');
    expect(await tekst(page, '[data-terugmaand="2026-09"] [data-spaarterug]')).toBe('gestort €1.000 · eruit €0 · netto €1.000 van €1.000 · gehaald');
    expect(await tekst(page, '[data-terugvergelijk]')).toBe('September 1 van 1 · oktober loopt nog');
  });
});

test.describe('4 · een tab-✓ alleen na afronding', () => {
  test('Begrijpen pas na een oordeel op elk patroon, Kiezen pas als elke rij gekozen is', async ({ page }) => {
    await grip(page, { opnames: OPNAMES, set: PEAKS }); await inleg(page, '2026-09-29');
    const ok = () => page.locator('[data-griptab][data-afgerond]').evaluateAll(e => e.map(x => x.dataset.griptab));
    expect(await ok()).toEqual([]);
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripOordeelZet('spaargeld', true); });
    expect(await ok()).toEqual(['zien']);   // twee patronen, een oordeel
    await page.evaluate(() => gripOordeelZet('beleggen', false, 'impuls'));
    expect(await ok()).toEqual(['zien', 'begrijpen']);
    await page.evaluate(() => { SET.gripKeuze = { '2026-10': { spaargeld: { pid: 'spaargeld', optie: 'grens', titel: 'x', lat: [] } } }; save(); gripKiesTab('kiezen'); });
    expect(await ok()).toEqual(['zien', 'begrijpen']);
    await page.evaluate(() => { SET.gripKeuze['2026-10'].beleggen = { pid: 'beleggen', optie: 'door', titel: 'y', lat: [], bewust: true }; save(); renderMaand(); });
    expect(await ok()).toEqual(['zien', 'begrijpen', 'kiezen']);
  });
  test('Terugblik openen geeft geen ✓; afsluiten alleen ook niet zonder meting (v391); afgesloten en gemeten wel', async ({ page }) => {
    await grip(page);
    await tab(page, 'terugblik');
    expect(await page.locator('[data-griptab="terugblik"][data-afgerond]').count()).toBe(0);
    await page.evaluate(() => { SET.maandAfsluiting = Object.assign({}, SET.maandAfsluiting, { '2026-09': { op: '2026-10-10', punten: [], afspraken: [], open: [] } }); save(); renderMaand(); });
    expect(await tekst(page, '[data-terugscore]')).toBe('Nog geen afgesloten maand gemeten');
    expect(await page.locator('[data-griptab="terugblik"][data-afgerond]').count()).toBe(0);
    await page.evaluate(() => { SET.gripOpzij = { '2026-09': { opzij: 1000 } }; save(); renderMaand(); });
    expect(await page.locator('[data-griptab="terugblik"][data-afgerond]').count()).toBe(1);
  });
});

test.describe('5 · Kiezen opgeschoond', () => {
  test('geen afvinkregels, geen "N afspraken voor", geen losse "Kies voor"-link; de rij is de knop', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await page.evaluate(() => { openTeRuim('huur'); teRuimKies('a'); window._tr.bestem = 'plan'; teRuimBevestig(); const nov = nextYM(thisYM());
      afspraakMaak({ soort: 'potje', cat: 'uiteten', bedrag: 120, van: nov, tot: nov, wat: 'Potje Uit eten €120 vanaf november' });
      afspraakMaak({ soort: 'potje', cat: 'boodschappen', bedrag: 400, van: thisYM(), tot: thisYM(), wat: 'Potje Boodschappen €400 in oktober' });
      save(); gripKiesTab('kiezen'); });
    expect(await page.locator('#gripInhoud [data-afspraak]').count()).toBe(0);
    expect(await page.locator('#gripInhoud [data-afsprakenlater]').count()).toBe(0);
    expect(await page.locator('#gripInhoud [data-kiesnu]').count()).toBe(0);
    expect(await tekst(page, '[data-kiezen]')).not.toContain('Kies voor');
    await page.evaluate(() => { oorzaakKies('pat:spaargeld', 'opgedeeld'); oorzaakBevestig('pat:spaargeld'); }); await tab(page, 'kiezen');   // v430: een oorzaak bevestigt ook het patroon
    await page.click('[data-kiesrij="spaargeld"]');
    expect(await page.locator('#gripKeuzeSheet').count()).toBe(1);
    // de afspraken staan in het logboek
    await page.evaluate(() => { closeSheet(); go('logboek'); });
    expect(await tekst(page, '#s-logboek')).toContain('Uit eten');
  });
});

test.describe('6 · beleggen', () => {
  test('de meter noemt de voorwaarde die ontbreekt', async ({ page }) => {
    await grip(page, { set: PEAKS }); await inleg(page, '2026-09-29');
    expect(await tekst(page, '[data-meter="beleggen"] [data-metermist]')).toBe('reserveringen nov open');
  });
  test('inleg die loopt maar deze maand nog niet geboekt is, geeft het patroon "Beleggen vóór fundament"', async ({ page }) => {
    await grip(page, { set: PEAKS }); await inleg(page, '2026-09-29');
    const p = await page.evaluate(() => { const x = gripPatronen().find(p => p.id === 'beleggen'); return x && { bewijs: x.bewijs, sub: x.sig[0].sub, bv: belegVragen().length }; });
    expect(p).not.toBeNull();
    expect(p.bv).toBe(0);   // belegVragen() eist inleg in deze maand en ziet hem niet
    expect(p.bewijs).toBe('€100 naar Peaks in sep · dekking reserveringen €37 tegen €299');
    expect(p.sub).toMatch(/^loopt: €100 vorige maand, deze maand nog niet geboekt/);
    /* v428: Begrijpen verandert niets en een tak opent geen sheet meer; zonder vraag over geboekte inleg is er geen keuze
       in Kiezen, en de meter blijft de ingang. */
    await page.evaluate(() => gripNaarSymptoom('pat:beleggen'));
    expect(await page.locator('#gripSymptoom [data-patsig="inleg"]').count()).toBe(1);
    expect(await page.evaluate(() => gripCyc().kies.some(k => k.id.startsWith('beleg:')))).toBe(false);
    await page.click('[data-meter="beleggen"]');
    expect(await page.locator('#gripMeterSheet[data-meter="beleggen"]').count()).toBe(1);
  });
  test('een ingevulde periodieke inleg zonder gekoppelde boeking is geen meting (v332), en "voorwaarden gelden niet" telt niet', async ({ page }) => {
    await grip(page, { set: PEAKS });   // per 100, geen koppeling
    expect(await page.evaluate(() => gripPatronen().some(p => p.id === 'beleggen'))).toBe(false);
    await inleg(page, '2026-08-29');   // inleg van twee maanden terug loopt niet meer
    expect(await page.evaluate(() => gripPatronen().some(p => p.id === 'beleggen'))).toBe(false);
    await inleg(page, '2026-10-02');   // inleg in deze maand wel
    expect(await page.evaluate(() => gripPatronen().find(p => p.id === 'beleggen').sig[0].sub)).toMatch(/^voorwaarden nog niet gehaald/);
    await grip(page, { set: Object.assign({}, PEAKS, { assets: [{ id: 'peaks', naam: 'Peaks', grow: true, waarde: 620, per: 100, voorwaarden: false }] }) });
    await inleg(page, '2026-09-29');
    expect(await page.evaluate(() => gripPatronen().some(p => p.id === 'beleggen'))).toBe(false);
  });
});

test.describe('7 · de patroonkaart als boom', () => {
  test('de oorzaak als knoop met het bedrag rechts, de signalen als takken, bewijs en klopt/niet blijven', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await page.evaluate(() => gripNaarSymptoom('pat:spaargeld'));   // v428: de boom staat in de drill van het symptoom
    expect(await tekst(page, '[data-patoorzaak]')).toMatch(/Betaalrekening op na ~12 dagen na salaris[\s\S]*€700[\s\S]*uit spaargeld/);
    /* v428: de takken in de drill dragen geen tik en geen pijl meer (Begrijpen verandert niets), dus het bedrag is de laatste span */
    const t = await page.evaluate(() => [...document.querySelectorAll('[data-patboom] [data-patsig]')].map(r => { const b = r.querySelector('[data-boomlijn]').style; const sp = r.querySelectorAll(':scope > span');
      return { soort: r.dataset.patsig, laatst: b.height === '50%', bedragRechts: sp[sp.length - 1].getBoundingClientRect().right > r.getBoundingClientRect().right - 40 }; }));
    expect(t.map(x => x.soort)).toEqual(['onttrekking', 'potje']);
    expect(t.map(x => x.laatst)).toEqual([false, true]);   // de laatste tak stopt halverwege
    expect(t.every(x => x.bedragRechts)).toBe(true);
    expect(await tekst(page, '[data-patbewijs]')).toBe('Gezien: 2× uit je spaarrekening (6, 9 okt)');
    /* v430 (R1): klopt/niet is opgegaan in de ene vraag van het symptoom ("Dit patroon klopt niet") */
    expect(await page.locator('#gripSymptoom [data-vraagoptie="nietklopt"]').count()).toBe(1);
    const sw = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(sw).toBeLessThanOrEqual(390);
  });
});
