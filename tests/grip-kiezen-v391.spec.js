// v391: GRIP NA DE TWEEDE RONDE SCHERMEN. (3) Overig in de bridge opent een lijst per potje die optelt tot de stap.
// (7) Het bedrag op een patroonregel in Kiezen zegt wat het is ("€700 eruit", "€100/mnd ingelegd", "€67 erboven").
// (9) Zonder klopt of niet in Begrijpen: "eerst bevestigen ›" naar dat patroon, en de keuze opent nog niet.
// (10) Te ruim begroot komt vanaf de tweede maand bovenaan Kiezen terug als "<potje> herzien".
const { test, expect } = require('@playwright/test');
const K = require('./grip-kring-stand');

const OPNAMES = [['2026-10-06', 300], ['2026-10-09', 400]];
const grip = async (page, o) => { await page.setViewportSize({ width: 390, height: 844 }); await K.boot(page, o); await page.evaluate(() => go('maand')); };
const tab = (page, t) => page.evaluate(t => gripKiesTab(t), t);
const tekst = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); return e ? e.innerText : null; }, sel);

test.describe('3 · overig in potjes', () => {
  test('de potjes tellen op tot hun groep en de groepen tot de stap overig', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => { openGripOverig();
      const tot = +document.querySelector('#gripOverig').dataset.overig;
      const num = e => { const t = e.querySelector('span:nth-child(2)').innerText.replace(/[€.\s]/g, '').replace('−', '-').replace('+', ''); return +t; };
      const groep = g => [...document.querySelectorAll(`[data-overiggroep="${g}"]`)].map(e => [e.dataset.overigpotje, num(e)]);
      const deel = k => { const e = document.querySelector(`[data-overigdeel="${k}"]`); return e ? num(e) : 0; };
      return { tot, rest: deel('rest'), vast: deel('vast'), terug: deel('terug'), zonder: deel('zonder'), R: groep('rest'), V: groep('vast') }; });
    expect(r.R.length).toBeGreaterThan(1);
    expect(r.R.reduce((a, x) => a + x[1], 0)).toBe(r.rest);
    expect(r.V.reduce((a, x) => a + x[1], 0)).toBe(r.vast);
    expect(r.rest + r.vast + r.terug + r.zonder).toBe(r.tot);
    // v395: de bridge begint bij het eerlijke budget, dus het te ruime deel van Huur (EUR 629) staat gearceerd in de
    // eerste balk en niet meer als -629 in overig; de rij "Te ruim begroot" is weg.
    expect(r.terug).toBe(0);
    // v409: te ruim is 558 (voorstel 142, twee termijnen Shurgard); wat Huur deze maand onder het voorstel blijft (142 - 71) staat in overig
    expect(r.V).toContainEqual(['huur', -71]);
    expect(r.R.map(x => x[0])).toContain('boodschappen');
  });
  test('met centen: de potjes tellen nog steeds exact op tot hun groep (de groep rondt een keer af, niet per potje)', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => {
      for (const [k, a] of [['vices', -0.4], ['shopping', -0.4], ['belasting', -0.4], ['overig', -0.4]]) { const t = { id: 'c' + k, date: '2026-10-08', amount: a, acc: 'NL01MAIN0000001111', name: 'Cent ' + k, desc: 'BEA CENT ' + k, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = k; }
      save(); const V = maandVooruit(); const D = gripOverigDelen(V);
      const rauw = V.potjes.filter(x => D.P.rest.some(p => p.k === x.k)).reduce((a, x) => a + x.overR, 0);
      return { rest: D.R.rest, som: D.P.rest.reduce((a, x) => a + x.waarde, 0), rauw, perPot: D.P.rest.reduce((a, x) => a + Math.round(V.potjes.find(p => p.k === x.k).overR), 0) }; });
    expect(r.rauw % 1).not.toBe(0);                 // de invoer draagt centen
    expect(r.som).toBe(r.rest);
  });
  // v392 (C): een tweede stand waarin afronden op de som van de potjes een ANDER getal geeft dan de groep. Zonder die
  // stand is "de groep rondt af op R[g]" niet te onderscheiden van "op Math.round(som)" (gemeten: met alleen centen in
  // de rest-potjes vallen die twee samen). Met Uit eten en Vices elk EUR 0,25 erbij: groep -1.051, som -1.051,55.
  test('tweede stand: de potjes tellen op tot de groep, ook waar afronden op hun som een ander getal geeft', async ({ page }) => {
    await grip(page);
    const r = await page.evaluate(() => {
      for (const k of ['uiteten', 'vices']) { const t = { id: 'q' + k, date: '2026-10-08', amount: -0.25, acc: 'NL01MAIN0000001111', name: 'Kwart ' + k, desc: 'BEA KWART ' + k.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = k; }
      save(); const V = maandVooruit(); const D = gripOverigDelen(V);
      const los = gripZienBrug(V).stappen.filter(x => x.soort === 'potje').map(x => x.k);
      const som = V.potjes.filter(x => !los.includes(x.k)).reduce((a, x) => a + x.overR, 0);
      return { rest: D.R.rest, somRond: Math.round(som), som: D.P.rest.reduce((a, x) => a + x.waarde, 0) }; });
    expect(r.somRond).not.toBe(r.rest);             // de invoer draagt het geval: afronden op de som geeft een ander getal
    expect(r.som).toBe(r.rest);
  });
  test('een potje in de lijst opent dat potje', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => openGripOverig());
    await page.click('[data-overigpotje="boodschappen"]');
    expect(await page.evaluate(() => window._gripPotje)).toBe('boodschappen');
  });
});

test.describe('7 en 9 · de regels in Kiezen', () => {
  test('het bedrag draagt een label, en zonder oorzaak wacht de keuze met "bepaal oorzaak ›" naar Begrijpen', async ({ page }) => {
    await grip(page, { opnames: OPNAMES });
    await tab(page, 'kiezen');
    /* v430 (R1): "Klopt dit patroon?" is opgegaan in de ene vraag van het symptoom; zonder oorzaak staat de keuze onder Wacht op oorzaak */
    expect(await page.locator('#gripTeKiezen [data-kiesrij="spaargeld"]').count()).toBe(0);
    expect(await page.locator('#gripWachtOorzaak [data-wachtoorzaak="pat:spaargeld"] [data-bepaaloorzaak]').count()).toBe(1);
    // ook rechtstreeks opent de keuze niet, en bevestigen schrijft niets
    await page.evaluate(() => { openGripKeuze('spaargeld'); window._gripK = { pid: 'spaargeld', optie: 'grens', lat: [], latOk: true }; gripKeuzeZet(); });
    expect(await page.evaluate(() => (SET.gripKeuze || {})['2026-10'])).toBeUndefined();
    // "Dit patroon klopt niet" is ook een antwoord, maar vraagt geen gedrag: er komt geen keuze
    await page.evaluate(() => { oorzaakKies('pat:spaargeld', 'nietklopt'); oorzaakBevestig('pat:spaargeld'); gripKiesTab('kiezen'); });
    expect(await page.locator('[data-kiesrij="spaargeld"], [data-wachtoorzaak="pat:spaargeld"]').count()).toBe(0);
    // een oorzaak wel: dan staat de rij er met het bedrag en zijn label, en opent hij de keuze
    await page.evaluate(() => { oorzaakNietKloptTerug('pat:spaargeld'); oorzaakKies('pat:spaargeld', 'opgedeeld'); oorzaakBevestig('pat:spaargeld'); gripKiesTab('kiezen'); });
    expect(await tekst(page, '[data-kiesrij="spaargeld"] [data-kiesbedrag]')).toBe('€700 eruit');
    expect(await page.locator('[data-kiesrij="spaargeld"][data-kiesbevestig]').count()).toBe(0);
    await page.click('[data-kiesrij="spaargeld"]');
    expect(await page.locator('#gripKeuzeSheet').count()).toBe(1);
  });
  test('een potje-patroon zegt "erboven", geen effectbedrag', async ({ page }) => {
    await grip(page); await tab(page, 'kiezen');
    expect(await tekst(page, '[data-kiesrij="pot:uiteten"] [data-kiesbedrag]')).toBe('€67 erboven');
    expect(await tekst(page, '[data-kiezen]')).not.toContain('≈');
  });
  test('het moment zegt bij salaris met de datum', async ({ page }) => {
    await grip(page, { opnames: OPNAMES }); await tab(page, 'kiezen');
    expect(await tekst(page, '[data-kiezen]')).toMatch(/moment: bij salaris \(\d+ (okt|nov)\) ›/);
    expect(await tekst(page, '[data-kiezen]')).not.toContain('vóór');
  });
});

test.describe('10 · te ruim begroot vanaf de 2e maand in Kiezen', () => {
  test('de eerste maand niet, de tweede maand bovenaan als "Huur herzien", en weg na laten staan', async ({ page }) => {
    await grip(page); await tab(page, 'kiezen');
    expect(await page.locator('[data-kiesherzien]').count()).toBe(0);
    expect(await page.evaluate(() => SET.teRuimMaand['2026-10'])).toEqual(['huur', 'vervoer']);   // Grip bewaart wat deze maand te ruim is (v392: ook het variabele deel van Vervoer)
    await page.evaluate(() => { SET.teRuimMaand['2026-09'] = ['huur']; save(); renderMaand(); });
    const r = await page.evaluate(() => { const rows = [...document.querySelectorAll('[data-kiezen] [data-kiesherzien], [data-kiezen] [data-kiesrij]')];
      return { eerste: rows[0].dataset.kiesherzien, tekst: rows[0].innerText.replace(/\s+/g, ' ') }; });
    expect(r.eerste).toBe('huur');
    expect(r.tekst).toContain('Huur herzien'); expect(r.tekst).toContain('2e maand'); expect(r.tekst).toContain('€558 te ruim');
    expect(await page.locator('[data-kiesvoortgang]').getAttribute('data-tekiezen')).toBe(String(await page.evaluate(() => gripCyc().kies.length)));   // v428: Te kiezen telt elke open keuze, herzien ook
    await page.click('[data-kiesherzien="huur"]');
    expect(await page.locator('#teRuimSheet').count()).toBe(1);
    await page.evaluate(() => { teRuimLaten('huur'); closeSheet(); renderMaand(); });
    expect(await page.locator('[data-kiesherzien]').count()).toBe(0);
  });
  test('v392: het variabele deel van een gemengd potje staat als "variabel deel te ruim" in Kiezen', async ({ page }) => {
    await grip(page);
    await page.evaluate(() => { SET.teRuimMaand['2026-09'] = ['vervoer']; save(); gripKiesTab('kiezen'); });
    const t = await tekst(page, '[data-kiesherzien="vervoer"]');
    expect(t.replace(/\s+/g, ' ')).toContain('variabel deel te ruim'); expect(t).toContain('€390 te ruim');
  });
});
