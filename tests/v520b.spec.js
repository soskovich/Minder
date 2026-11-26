/* v520b: VRAAG, DRIE ANTWOORDEN KLOPPEN BETER. Stand: tests/v520b-stand.js (22 nov 2026, GECONSTRUEERD); elk verwacht getal is met de hand
   uit die lijst uitgerekend, niet uit de app. (A) tegenpartij zoekt op woordgrens, een venster loopt niet voorbij vandaag, per maand is
   door de verstreken maanden; (B) weekdag rekent standaard alleen je potjes en noemt per dag het grootste potje; (C) drempel vergelijkt
   niet meer met het kleinste potje en noemt waar de kleine betalingen vielen. Geen bedrag op de schermen verandert (g, tegen ff9467c). */
const { test, expect } = require('./klok');
const path = require('path'); const { pathToFileURL } = require('url');
const S = require('./v520b-stand');
const V = require('./v520-stand');   // stubVraag, vraag en LEEG zijn algemeen
const B = require('./v519-bedragen');
const VOOR = require('./v520b-voor.json');
const L = V.LEEG;
const getal = async (page) => +(await page.getAttribute('[data-vraaggetal]', 'data-vraaggetal'));
const antw = (page, s) => page.locator(`[data-vraagantwoord="${s}"]`).innerText();
const DIT_JAAR = { van: '2026-01-01', tot: '2026-12-31' };   // zoals een model "dit jaar" kan teruggeven: tot voorbij vandaag

test('a. "bol" vindt BOL.COM en BOLCOM, niet BOLT en niet Febo Linnaeusstra (woordgrens, geen substring)', async ({ page }) => {
  await S.boot(page);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'tegenpartij', zoektermen: ['bol'], venster: DIT_JAAR }));
  await V.vraag(page, 'Hoeveel gaf ik dit jaar uit bij Bol?');
  /* BOL.COM 25 + BOLCOM 30 = 55, twee boekingen; Bolt 15 en Febo 5,20 tellen niet */
  expect(await getal(page)).toBe(55);
  expect(await page.$$eval('[data-vraagtegenpartij]', (e) => e.map((x) => x.dataset.vraagtegenpartij.toLowerCase().replace(/\W/g, '')).sort())).toEqual(['bolcom', 'bolcom']);
  const t = await antw(page, 'tegenpartij');
  expect(t).not.toMatch(/bolt|febo/i);
  /* "bol.com" als zoekterm is hetzelfde woord als "bolcom" */
  const r = await page.evaluate(() => { const n = (x) => ({ name: x }); const T = vraagTermen({ zoektermen: ['bol.com'] });
    return ['BOL.COM', 'BOLCOM', 'Bol com', 'BOLT SUPPORT SERVICES', 'TEAM FEBO LINNAEUSSTRA', 'Thuisbezorgd.nl'].map((x) => vraagTreft(n(x), T)); });
  expect(r).toEqual([true, true, true, false, false, false]);
});

test('b. een zoekterm van 2 tekens valt weg, in de Worker (vraagValideer) en in de app', async ({ page }) => {
  const w = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'worker.js')).href);
  const inv = { vraag: 'x', potjes: [], vandaag: S.DAG };
  const N = { soort: 'tegenpartij', potje: null, venster: null, dag: null, bedrag: null, wat: null, metVast: null };
  expect(w.vraagValideer(Object.assign({}, N, { zoektermen: ['bo', 'bol.com'] }), inv).zoektermen).toEqual(['bol.com']);
  expect(w.vraagValideer(Object.assign({}, N, { zoektermen: ['bo'] }), inv)).toEqual({ soort: 'onbekend' });
  expect(w.vraagValideer(Object.assign({}, N, { zoektermen: ['bol'] }), inv).zoektermen).toEqual(['bol']);
  /* de prompt vraagt de naam voluit en geen stam korter dan 4 tekens */
  const sys = w.vraagVerzoek(inv, 'm').system;
  expect(sys).toContain('voluit zoals de gebruiker ze noemt'); expect(sys).toContain('korter dan 4 tekens');
  expect(sys).toContain('"dit jaar" is {van: 1 januari van dit jaar, tot: vandaag}');
  await S.boot(page);
  const a = await page.evaluate(() => [vraagOpdracht({ soort: 'tegenpartij', zoektermen: ['bo', 'bol.com'] }).zoektermen, vraagOpdracht({ soort: 'tegenpartij', zoektermen: ['bo'] })]);
  expect(a).toEqual([['bol.com'], { soort: 'onbekend' }]);
});

test('c. "dit jaar" op 22 nov: venster t/m 22 nov, per maand gedeeld door 11, de lijn stopt in november', async ({ page }) => {
  await S.boot(page);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'tegenpartij', zoektermen: ['bol.com'], venster: DIT_JAAR }));
  await V.vraag(page, 'Hoeveel gaf ik dit jaar uit bij Bol.com?');
  /* 55 / 11 maanden (jan t/m nov, november telt als een) = 5,00; per keer 55 / 2 = 27,50 */
  expect(+(await page.getAttribute('[data-vraagpermaand]', 'data-vraagpermaand'))).toBe(5);
  expect(+(await page.getAttribute('[data-vraagperkeer]', 'data-vraagperkeer'))).toBe(27.5);
  const t = await antw(page, 'tegenpartij');
  expect(t).toContain('€55,00 bij'); expect(t).toContain('in dit jaar, gemiddeld €5,00 per maand of €27,50 per keer.');
  expect(t).toContain('1 jan–22 nov'); expect(t).toContain('gedeeld door 11 maanden');
  expect(t).not.toContain('dec');
  await expect(page.locator('[data-vraaggrafiek="lijn"]')).toContainText('nov');
  /* gelijk per maand en per keer (een boeking in een maand van een venster van een maand): alleen per keer, met de maanden met een boeking */
  await V.stubVraag(page, Object.assign({}, L, { soort: 'tegenpartij', zoektermen: ['bolcom'], venster: { van: '2026-06-01', tot: '2026-06-30' } }));
  await V.vraag(page, 'bol in juni');
  const t2 = await antw(page, 'tegenpartij');
  expect(t2).toContain('€30,00 per keer, in 1 maand met een boeking.'); expect(t2).not.toContain('per maand of');
});

test('d. weekdag zonder vaste lasten: maandag is niet de hoogste door de huur', async ({ page }) => {
  await S.boot(page);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'weekdag' }));
  await V.vraag(page, 'Op welke dagen geef ik het meest uit en aan wat?');
  /* aug–okt, alleen potjes: ma 20, vr 330, za 350 (de huur van 3 x 1200 op maandag telt niet) */
  expect(await page.$$eval('[data-vraagdag]', (e) => e.map((x) => +x.dataset.bedrag))).toEqual([20, 0, 0, 0, 330, 350, 0]);
  expect(await getal(page)).toBe(350);
  const t = await antw(page, 'weekdag');
  expect(t).toContain('Zaterdag: €350,00 in augustus–oktober, vooral Uit eten & café (€300,00). Vrijdag volgt met €330,00.');
  expect(t).toContain('alleen je potjes, zonder vaste lasten'); expect(t).toContain('contant niet per dag te verdelen, niet meegeteld');
  expect(t).not.toContain('Huur');
  /* alleen als je er uitdrukkelijk om vraagt tellen de vaste lasten mee, en dan staat dat erbij */
  await V.stubVraag(page, Object.assign({}, L, { soort: 'weekdag', metVast: true }));
  await V.vraag(page, 'Op welke dag geef ik alles inclusief vaste lasten uit?');
  expect(await getal(page)).toBe(3620);
  expect(await antw(page, 'weekdag')).toContain('inclusief vaste lasten');
});

test('e. weekdag noemt per dag het grootste potje, gelijk aan de fixture', async ({ page }) => {
  await S.boot(page);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'weekdag' }));
  await V.vraag(page, 'Aan wat geef ik per dag het meest uit?');
  /* ma Boodschappen 20, vr Boodschappen 330, za Uit eten 300 (Boodschappen 50 is de tweede op zaterdag) */
  expect(await page.$$eval('[data-vraagdagpot]', (e) => e.map((x) => [+x.dataset.vraagdagpot, x.dataset.k, +x.dataset.bedrag]))).toEqual([[0, 'boodschappen', 20], [4, 'boodschappen', 330], [5, 'uiteten', 300]]);
  expect(await page.getAttribute('[data-vraagvooral]', 'data-vraagvooral')).toBe('uiteten');
});

test('f. drempel noemt geen kleinste potje, wel de top 3 tegenpartijen en per potje het aantal', async ({ page }) => {
  await S.boot(page);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'drempel', bedrag: 10 }));
  await V.vraag(page, 'Hoeveel betalingen onder €10 deze periode?');
  /* november onder 10: Jumbo 4+6+8, Starbucks 5,50+5,50, Bolt 7, Kiosk 2 = 38 in 7 betalingen. Top 3 op aantal: Jumbo (3), Starbucks (2),
     dan Bolt en Kiosk elk 1, Bolt met het grootste bedrag. 38 is meer dan het kleinste potje (Overig 30), en dat staat er NIET. */
  expect(await getal(page)).toBe(38);
  const t = await antw(page, 'drempel');
  expect(t).toContain('7 betalingen onder €10,00, samen €38,00. Vooral bij Jumbo, Starbucks en Bolt.');
  expect(t).not.toMatch(/potje Overig|kleinste potje|meer dan je potje/);
  expect(await page.$$eval('[data-vraagdrempelpot] [data-pot]', (e) => e.map((x) => x.dataset.pot + ' ' + x.dataset.n))).toEqual(['Boodschappen 3', 'Uit eten & café 2', 'Vervoer & auto 1', 'Overig 1']);
});

test('g. met vragen aan zijn alle bedragen op de schermen byte-gelijk aan ff9467c', async ({ page }) => {
  expect(VOOR.v520bLezer).toBe(false);   // de generator las ff9467c, waar de woordgrens niet bestond
  await B.boot(page);
  expect(await page.evaluate(() => vraagKnopAan())).toBe(true);
  const nu = await B.bedragen(page);
  for (const k of ['home', 'ins', 'grip-zien', 'grip-begrijpen', 'grip-kiezen', 'grip-terugblik', 'vermKaart', 'vermogen', 'salv']) expect(nu[k], k).toEqual(VOOR[k]);   // v524: 'plan' is nu de lagen-invariant
  expect(await require('./plan-lagen-invariant').planLagenInvariant(page)).toEqual(require('./plan-lagen-invariant').PLAN_LAGEN_OK);
  expect(nu.insVastKop, 'onderhoud1: de kop noemt Vast met de stap').toBe(`· Vast +€${nu.insVastStap}`);   // onderhoud1: de enige toevoeging op Inzichten
  expect(nu.gepland).toEqual(VOOR.gepland);
});

/* ===== punt 4: rangTegenpartij ===== */
const TWEE_MND = { van: '2026-09-22', tot: '2026-11-22' };   // "afgelopen 2 maanden" op 22 nov
const rang = (page) => page.$$eval('[data-vraagrang]', (e) => e.map((x) => [x.dataset.vraagrang, +x.dataset.n, +x.dataset.som]));
test('h. rangTegenpartij: op aantal Dirk, dan Lidl en NS gelijk op naam; op bedrag de huur, Lidl, Albert Heijn', async ({ page }) => {
  await S.boot(page, null, S.RANG);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'rangTegenpartij', venster: TWEE_MND, maat: 'aantal', top: 3 }));
  await V.vraag(page, 'Waar betaal ik de afgelopen 2 maanden het vaakst?');
  /* 22 sep–22 nov: Dirk 6x 120, Lidl 4x 160, NS 4x 60; uit de basisstand Albert Heijn 2x 145, Jumbo 3x 18, ... */
  expect(await rang(page)).toEqual([['Dirk', 6, 120], ['Lidl', 4, 160], ['Ns', 4, 60]]);   // txNaam(): de schone naam, zoals Recent hem toont
  expect(await getal(page)).toBe(6);
  const t = await antw(page, 'rangTegenpartij');
  expect(t).toContain('Dirk: 6 keer in 22 sep – 22 nov, samen €120,00. Daarna Lidl (4×) en Ns (4×).');
  expect(t).toContain('op aantal betalingen'); expect(t).toContain('alle potjes'); expect(t).toContain('zonder eigen overboekingen en spaarstortingen');
  expect(t).toContain('vaste lasten tellen mee');
  await expect(page.locator('[data-vraaggrafiek="rang"]')).toHaveCount(1);
  await page.locator('[data-vraagrang="Lidl"]').click();
  await expect(page.locator('[data-vraagrangboek="1"] [data-vraagregel]')).toHaveCount(4);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'rangTegenpartij', venster: TWEE_MND, maat: 'bedrag', top: 3 }));
  await V.vraag(page, 'Waar geef ik het meest uit?');
  /* vaste lasten tellen mee: de huur van 5 okt (1200) staat op bedrag bovenaan, en dan Lidl 160 en Albert Heijn 145 (Dirk 120 valt erbuiten) */
  expect((await rang(page)).map((x) => x[0])).toEqual(['Woonstichting Oost', 'Lidl', 'Albert Heijn']);
  expect(await getal(page)).toBe(1200);
  expect(await antw(page, 'rangTegenpartij')).toContain('Woonstichting Oost: €1.200,00 in 22 sep – 22 nov, 1 keer. Daarna Lidl (€160,00) en Albert Heijn (€145,00).');
  /* de app loopt maat en top na: onbekende maat is aantal, top buiten 1–10 is 5 */
  const o = await page.evaluate(() => [vraagOpdracht({ soort: 'rangTegenpartij', maat: 'x', top: 40 }), vraagOpdracht({ soort: 'rangTegenpartij', maat: 'bedrag', top: 2 })]);
  expect([o[0].maat, o[0].top, o[1].maat, o[1].top]).toEqual(['aantal', 5, 'bedrag', 2]);
});

test('i. rangTegenpartij: een eigen overboeking (10x) staat niet in de lijst', async ({ page }) => {
  await S.boot(page, null, S.RANG);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'rangTegenpartij', venster: TWEE_MND, maat: 'aantal', top: 10 }));
  await V.vraag(page, 'Waar betaal ik het vaakst?');
  const r = await rang(page);
  expect(r[0]).toEqual(['Dirk', 6, 120]);
  expect(r.map((x) => x[0])).not.toContain('Naar spaarrekening');
  /* de Worker kent de soort en loopt maat en top na */
  const w = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'worker.js')).href);
  const v = w.vraagValideer({ soort: 'rangTegenpartij', potje: null, venster: null, dag: null, bedrag: null, wat: null, zoektermen: null, metVast: null, maat: 'bedrag', top: 12 }, { potjes: [] });
  expect([v.soort, v.maat, v.top]).toEqual(['rangTegenpartij', 'bedrag', 5]);
  expect(w.VRAAG_SCHEMA.properties.soort.enum).toContain('rangTegenpartij');
  expect(w.vraagVerzoek({ vraag: 'x', potjes: [], vandaag: S.DAG }, 'm').system).toContain('"afgelopen N maanden" is {van: vandaag min N maanden, tot: vandaag}');
});
