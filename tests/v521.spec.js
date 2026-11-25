/* v521: VRAAG, INKOMENVERDELING EN DE LIJST VRAGEN DIE MINDER NIET KON BEANTWOORDEN. Stand: tests/v521-stand.js (22 nov 2026,
   GECONSTRUEERD); elk verwacht getal is met de hand uit die lijst uitgerekend, niet uit de app. (a) van elke euro inkomen, hoeveel uit
   en hoeveel over; (b) alleen een vraag die als onbekend eindigt komt met zijn reden in IndexedDB; (c) die lijst gaat nergens heen;
   (d) hooguit 100 regels; (e) geen bedrag op de schermen verandert (tegen 9fbc05f). */
const { test, expect } = require('./klok');
const path = require('path'); const { pathToFileURL } = require('url');
const S = require('./v521-stand');
const V = require('./v520-stand');   // stubVraag, vraag en LEEG zijn algemeen
const B = require('./v519-bedragen');
const VOOR = require('./v521-voor.json');
const { kaalUit } = require('./bron-kaal');
const L = V.LEEG;
const getal = async (page) => +(await page.getAttribute('[data-vraaggetal]', 'data-vraaggetal'));
const antw = (page, s) => page.locator(`[data-vraagantwoord="${s}"]`).innerText();
const lijst = (page) => page.evaluate(() => vraagNietLijst());

test('a. inkomenVerdeling: aug–okt, 0,44 uit en 0,56 over; terugbetaling, spaarstorting en november tellen niet', async ({ page }) => {
  await S.boot(page);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'inkomenVerdeling' }));
  await V.vraag(page, 'Van elke euro die binnenkomt, hoeveel geef ik uit?');
  /* binnen 3000 + 4000 + 3000 = 10000 (de terugbetaling van 300 in okt is geen inkomen); uitgegeven 1400 + 1400 + 1640 = 4440 (de 240 uit
     een reservering telt mee); over 5560 (niet de 3 x 500 naar je spaarrekening); 4440 / 10000 = 0,44; zonder de bonus 4440 / 9000 = 0,49 */
  expect(await getal(page)).toBe(0.44);
  const b = await page.locator('[data-vraagivbedragen]');
  expect([+(await b.getAttribute('data-ink')), +(await b.getAttribute('data-uit')), +(await b.getAttribute('data-over')), +(await b.getAttribute('data-een'))]).toEqual([10000, 4440, 5560, 1000]);
  const t = await antw(page, 'inkomenVerdeling');
  expect(t).toContain('Van elke euro die binnenkwam gaf je €0,44 uit en hield je €0,56 over (augustus–oktober 2026). Zonder je eenmalige inkomen: €0,49 uit.');
  expect(t).toContain('Binnen €10.000,00 (waarvan eenmalig €1.000,00) · uitgegeven €4.440,00 · over €5.560,00');
  expect(t).toContain('zonder terugbetaling van uitgeleend geld'); expect(t).toContain('plus wat je uit een reservering betaalde (€240,00)');
  expect(t).toContain('wat naar of van je spaarrekening ging telt niet mee'); expect(t).toContain('de lopende telt niet mee');
  expect(t).toContain('aug 2026, sep 2026, okt 2026 (3 maanden)'); expect(t).not.toContain('nov 2026');
  expect(t).not.toContain('oude achternaam');
  /* per maand een gestapeld staafje, en het gemiddelde als lijn */
  expect(await page.$$eval('[data-vraagivmaand]', (e) => e.map((x) => [x.dataset.vraagivmaand, +x.dataset.ink, +x.dataset.uit, +x.dataset.over]))).toEqual(
    [['2026-08', 3000, 1400, 1600], ['2026-09', 4000, 1400, 2600], ['2026-10', 3000, 1640, 1360]]);
  expect(+(await page.getAttribute('[data-vraagivgem]', 'data-vraagivgem'))).toBe(0.44);
  /* de fixture draagt wat de sabotages raken: een terugbetaling, een spaarstorting (savedNet zegt iets anders dan over) en een lopende maand met inkomen */
  const m = await page.evaluate(() => ({ terug: TX.filter((t) => catOf(t) === 'uitgeleend' && t.amount > 0).length, sav: ['2026-08', '2026-09', '2026-10'].reduce((a, m) => a + savedNet(m), 0), nov: maandInkomen('2026-11').alles }));
  expect(m).toEqual({ terug: 1, sav: 1500, nov: 3000 });
  /* een venster dat terug gaat tot voor 2026 meldt de oude achternaam */
  await V.stubVraag(page, Object.assign({}, L, { soort: 'inkomenVerdeling', venster: { van: '2025-10-01', tot: '2026-03-31' } }));
  await V.vraag(page, 'En in de winter?');
  expect(await antw(page, 'inkomenVerdeling')).toContain('je venster gaat terug tot voor 2026: boekingen onder je oude achternaam tellen niet mee');
  /* alleen de lopende maand: geen afgesloten maand, dus niets en geen getal */
  await V.stubVraag(page, Object.assign({}, L, { soort: 'inkomenVerdeling', venster: 'deze_maand' }));
  await V.vraag(page, 'En deze maand?');
  expect(await antw(page, 'inkomenVerdeling')).toContain('Daar weet Minder nog niets over.');
  await expect(page.locator('[data-vraaggetal]')).toHaveCount(0);
});

test('a2. de Worker kent inkomenVerdeling en laat hem door', async () => {
  const w = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'worker.js')).href);
  expect(w.VRAAG_SCHEMA.properties.soort.enum).toContain('inkomenVerdeling');
  const v = w.vraagValideer({ soort: 'inkomenVerdeling', potje: null, venster: null, dag: null, bedrag: null, wat: null, zoektermen: null, metVast: null, maat: null, top: null }, { potjes: [] });
  expect(v.soort).toBe('inkomenVerdeling');
  expect(w.vraagVerzoek({ vraag: 'x', potjes: [], vandaag: S.DAG }, 'm').system).toContain('"inkomenVerdeling" (van elke euro inkomen');
});

test('b. alleen een vraag die als onbekend eindigt komt in de lijst, met zijn reden', async ({ page }) => {
  await S.boot(page);
  expect(await lijst(page)).toEqual([]);
  await V.stubVraag(page, Object.assign({}, L, { soort: 'onbekend' }));
  await V.vraag(page, 'Wat is de zin van het leven?');
  await V.stubVraag(page, Object.assign({}, L, { soort: 'som' }));   // som zonder potje en venster: de app keurt hem af
  await V.vraag(page, 'Hoeveel gaf ik uit?');
  await V.stubVraag(page, Object.assign({}, L, { soort: 'inkomenVerdeling' }));
  await V.vraag(page, 'Van elke euro, hoeveel geef ik uit?');
  await expect(page.locator('[data-vraagantwoord="inkomenVerdeling"]')).toHaveCount(1);
  const r = await lijst(page);
  expect(r.map((x) => [x.vraag, x.reden, x.dag])).toEqual([['Wat is de zin van het leven?', 'model', S.DAG], ['Hoeveel gaf ik uit?', 'validatie', S.DAG]]);
  /* de Worker niet bereikbaar, en vragen uit */
  await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.route('**/sw.js', (x) => x.abort());
  await page.route('https://w.test/**', (x) => x.abort());
  await V.vraag(page, 'Hoeveel deze week?');
  await page.evaluate(() => { SET.vraagAan = false; });
  await page.evaluate(async () => { document.getElementById('vraagVeld').value = 'Nog een vraag'; await vraagStuur(); });
  expect((await lijst(page)).slice(2).map((x) => x.reden)).toEqual(['onbereikbaar', 'uit']);
  /* Diagnose toont de lijst, nieuwste bovenaan, met een telling per reden, en leegmaken vraagt eerst een bevestiging */
  await page.evaluate(() => { closeSheet(); diagOpen(); });
  await expect(page.locator('#diagVraagNiet [data-vraagniet]')).toHaveCount(4);
  expect(await page.$$eval('#diagVraagNiet [data-vraagniet]', (e) => e.map((x) => x.dataset.vraagniet))).toEqual(['uit', 'onbereikbaar', 'validatie', 'model']);
  expect(await page.$$eval('[data-vraagniettelling] [data-reden]', (e) => e.map((x) => x.dataset.reden + ' ' + x.dataset.n))).toEqual(['model 1', 'validatie 1', 'onbereikbaar 1', 'uit 1']);
  await expect(page.locator('#diagVraagNiet')).toContainText('Wat is de zin van het leven?');
  await page.locator('[data-vraagnietleeg]').click();
  expect(await lijst(page)).toHaveLength(4);   // nog niets weg: eerst bevestigen
  await page.locator('[data-vraagnietja]').click();
  await expect(page.locator('[data-vraagnietleegstand]')).toHaveCount(1);
  expect(await lijst(page)).toEqual([]);
  await expect(page.locator('#diagUit')).toHaveValue(/vragen die Minder niet kon beantwoorden/);
});

test('c. de lijst gaat niet mee naar de Worker en niet in de back-up', async ({ page }) => {
  await S.boot(page);
  await page.evaluate(async () => { await vraagNietNoteer('GEHEIM-A wat is dit', 'model'); await vraagNietNoteer('GEHEIM-B en dit', 'validatie'); });
  const req = await V.stubVraag(page, Object.assign({}, L, { soort: 'inkomenVerdeling' }));
  await V.vraag(page, 'Van elke euro, hoeveel geef ik uit?');
  expect(req.length).toBeGreaterThan(0);
  for (const r of req) { expect(r.body || '').not.toContain('GEHEIM'); expect(r.body || '').not.toContain('vraagNiet'); }
  expect(Object.keys(JSON.parse(req[0].body)).sort()).toEqual(['potjes', 'vandaag', 'vraag']);
  /* de back-up en wat naar de Worker gaat LEZEN de lijst niet (vraagStuur schrijft er alleen in) */
  const bron = await kaalUit(page, 'exportBackup', 'vraagBody', 'vraagStuur');
  expect(bron).not.toMatch(/vraagNietLijst|idbGet|VRAAG_NIET_KEY/);
});

test('d. na 101 regels zijn er 100 en is de oudste weg', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(async () => { for (let i = 1; i <= 101; i++) vraagNietNoteer('vraag ' + i, 'model'); const L = await vraagNietLijst(); return [L.length, L[0].vraag, L[L.length - 1].vraag, VRAAG_NIET_MAX]; });
  expect(r).toEqual([100, 'vraag 2', 'vraag 101', 100]);
});

test('e. met vragen aan zijn alle bedragen op de schermen byte-gelijk aan 9fbc05f', async ({ page }) => {
  expect(VOOR.v521Lezer).toBe(false);   // de generator las 9fbc05f, waar inkomenVerdeling niet bestond
  await B.boot(page);
  expect(await page.evaluate(() => vraagKnopAan())).toBe(true);
  const nu = await B.bedragen(page);
  for (const k of ['home', 'ins', 'grip-zien', 'grip-begrijpen', 'grip-kiezen', 'grip-terugblik', 'plan', 'vermKaart', 'vermogen', 'salv']) expect(nu[k], k).toEqual(VOOR[k]);
  expect(nu.insVastKop, 'onderhoud1: de kop noemt Vast met de stap').toBe(`· Vast +€${nu.insVastStap}`);   // onderhoud1: de enige toevoeging op Inzichten
  expect(nu.gepland).toEqual(VOOR.gepland);
});
