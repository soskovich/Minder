/* v520: VRAAG, DEEL 2 — zes soorten erbij. Stand: tests/v520-stand.js (15 okt 2026, GECONSTRUEERD). Elk verwacht getal hieronder is met de
   hand uitgerekend uit de lijst in die fixture, niet uit de app. De Worker zelf staat in v520-worker.spec.js. */
const { test, expect } = require('./klok');
const S = require('./v520-stand');
const B = require('./v519-bedragen');
const VOOR = require('./v520-voor.json');
const L = S.LEEG;
const getal = async (page) => +(await page.getAttribute('[data-vraaggetal]', 'data-vraaggetal'));

test('a. weekdag: de som per dag van de week is die van de fixture, een eigen overboeking telt niet', async ({ page }) => {
  await S.boot(page);
  /* jul–sep, maandag t/m zondag: ma 300+30+450+410+18, di 0, wo 200+150, do 50*3+100*2+100, vr 0, za 40+90+60+25+125+35+85+10, zo 20+100
     (de 500 naar je spaarrekening op zondag 19 jul is intern en telt niet) */
  const VERWACHT = [1208, 0, 350, 450, 0, 470, 120];
  await S.stubVraag(page, Object.assign({}, L, { soort: 'weekdag' }));
  await S.vraag(page, 'Op welke dag geef ik het meest uit?');
  const per = await page.$$eval('[data-vraagdag]', (e) => e.map((x) => +x.dataset.bedrag));
  expect(per).toEqual(VERWACHT);
  expect(await getal(page)).toBe(1208);
  const t = await page.locator('[data-vraagantwoord="weekdag"]').innerText();
  expect(t).toContain('Maandag: €1.208,00 in juli–september, 46% van alles. Zaterdag volgt met €470,00.');
  await expect(page.locator('[data-vraagstaaf]')).toHaveCount(7);
  expect(t).toContain('Zo gerekend'); expect(t).toContain('per dag van de week opgeteld');
  /* met een potje: alleen Uit eten (za 40+90+25+125+35+85 = 400, wo 150 jun valt buiten het venster) */
  await S.stubVraag(page, Object.assign({}, L, { soort: 'weekdag', potje: 'uiteten' }));
  await S.vraag(page, 'Op welke dag ga ik uit eten?');
  expect(await page.$$eval('[data-vraagdag]', (e) => e.map((x) => +x.dataset.bedrag))).toEqual([0, 0, 0, 0, 0, 400, 0]);
  await expect(page.locator('[data-vraagantwoord="weekdag"]')).toContainText('100% van uit eten');
});

test('b. tegenpartij: de zoektermen vinden alleen de bedoelde boekingen, op de schone naam', async ({ page }) => {
  await S.boot(page);
  await S.stubVraag(page, Object.assign({}, L, { soort: 'tegenpartij', zoektermen: ['THUISBEZORGD', 'uber eats'] }));
  await S.vraag(page, 'Hoeveel geef ik uit aan bezorging?');
  /* Thuisbezorgd.nl 40 + 25, Uber Eats 35 = 100 in 12 maanden (nov 2025 t/m okt 2026): 8,33 per maand, 33,33 per keer.
     Jumbo (28 sep, 18) draagt "THUISBEZORGD" alleen in de omschrijving en telt dus niet. */
  expect(await getal(page)).toBe(100);
  const t = await page.locator('[data-vraagantwoord="tegenpartij"]').innerText();
  expect(t).toContain('€100,00 bij Thuisbezorgd.nl en Uber Eats in de laatste 12 maanden, gemiddeld €8,33 per maand of €33,33 per keer.');
  expect(await page.$$eval('[data-vraagtegenpartij]', (e) => e.map((x) => x.dataset.vraagtegenpartij + ':' + x.dataset.n))).toEqual(['Thuisbezorgd.nl:2', 'Uber Eats:1']);
  expect(t).toContain('gezocht op "THUISBEZORGD", "uber eats"');
  expect(t).not.toContain('Jumbo');
  await expect(page.locator('[data-vraaggrafiek="lijn"]')).toHaveCount(1);
  /* een tik op een tegenpartij toont zijn boekingen */
  await page.locator('[data-vraagtegenpartij="Thuisbezorgd.nl"]').click();
  await expect(page.locator('[data-vraagtpboek="0"] [data-vraagregel]')).toHaveCount(2);
});

test('c. tegenpartij: niets gevonden geeft de vaste zin, geen som', async ({ page }) => {
  await S.boot(page);
  await S.stubVraag(page, Object.assign({}, L, { soort: 'tegenpartij', zoektermen: ['deliveroo'] }));
  await S.vraag(page, 'Hoeveel ging naar deliveroo?');
  await expect(page.locator('[data-vraagniets]')).toHaveText('Geen boekingen gevonden voor "deliveroo".');
  await expect(page.locator('[data-vraaggetal]')).toHaveCount(0);
  expect(await page.locator('[data-vraagantwoord="tegenpartij"]').innerText()).not.toContain('€');
});

test('d. drempel: een betaling van precies het bedrag telt niet mee (onder is strikt)', async ({ page }) => {
  await S.boot(page);
  await S.stubVraag(page, Object.assign({}, L, { soort: 'drempel', bedrag: 10 }));
  await S.vraag(page, 'Hoeveel kleine betalingen onder 10 euro?');
  /* oktober: 5, 10, 3, 25; onder 10 zijn 5 en 3 */
  expect(await getal(page)).toBe(8);
  await expect(page.locator('[data-vraagantwoord="drempel"]')).toContainText('2 betalingen onder €10,00, samen €8,00.');
  await expect(page.locator('[data-vraagpunt]')).toHaveCount(2);
  /* onder 30: alle vier, samen 43, meer dan het kleinste potje (Overig 40) */
  await S.stubVraag(page, Object.assign({}, L, { soort: 'drempel', bedrag: 30 }));
  await S.vraag(page, 'onder 30?');
  await expect(page.locator('[data-vraagantwoord="drempel"]')).toContainText('4 betalingen onder €30,00, samen €43,00, meer dan je potje Overig (€40,00).');
});

test('e. eenmalig: alleen de boekingen die jij eenmalig noemde', async ({ page }) => {
  await S.boot(page);
  await S.stubVraag(page, Object.assign({}, L, { soort: 'eenmalig' }));
  await S.vraag(page, 'Wat was er eenmalig?');
  /* jul Ikea 200, aug niets (Mediamarkt 150 is niet eenmalig), sep Fietsenmaker 100: 2 van de 3, gemiddeld 100 */
  expect(await getal(page)).toBe(100);
  await expect(page.locator('[data-vraagantwoord="eenmalig"]')).toContainText('In 2 van de 3 maanden was er iets eenmaligs, gemiddeld €100,00 per maand.');
  expect(await page.$$eval('[data-vraagstaaf]', (e) => e.map((x) => +x.dataset.vraagstaaf))).toEqual([200, 0, 100]);
  expect(await page.$$eval('[data-vraagregel]', (e) => e.map((x) => +x.dataset.vraagregel))).toEqual([200, 100]);
});

test('f. na een overschrijding: alleen maanden met een bewaard potjebedrag', async ({ page }) => {
  await S.boot(page);
  await S.stubVraag(page, Object.assign({}, L, { soort: 'naOverschrijding' }));
  await S.vraag(page, 'Zit ik na een overschrijding weer boven?');
  /* juni is niet bewaard (het paar juni-juli telt niet). jul (100/400/50): Uit eten 130 en Overig 60 boven; aug (200/400): alleen
     Boodschappen 450 boven (Uit eten 150 onder het bewaarde 200); sep (100/400/50): Uit eten 120 en Boodschappen 428 boven.
     jul→aug: 2 boven, 0 weer; aug→sep: 1 boven, Boodschappen weer. N = 3, K = 1. */
  expect(await getal(page)).toBe(3);
  const t = await page.locator('[data-vraagantwoord="naOverschrijding"]').innerText();
  expect(t).toContain('3 keer zat je boven een potje. 1 keer zat je de periode erna weer boven, met hetzelfde potje.');
  expect(t).toContain('alleen maanden met een bewaard potjebedrag (3 van de 4)');
  await expect(page.locator('[data-vraaggrafiek="paren"]')).toHaveCount(1);
});

test('g. contant: de dagen tussen de opnames zijn die van de fixture, een kastelling is geen opname', async ({ page }) => {
  await S.boot(page);
  await S.stubVraag(page, Object.assign({}, L, { soort: 'contantRitme' }));
  await S.vraag(page, 'Hoe vaak neem ik contant op?');
  /* 25 jun → 2 jul 7, → 9 jul 7, → 16 jul 7, → 6 aug 21, → 20 aug 14, → 10 sep 21 (de kastelling op 20 jul telt niet);
     juli gemiddeld 7, september 21; opgenomen 150 + 200 + 100 = 450 in 3 maanden = 150 per maand */
  expect(await page.$$eval('[data-vraaggap]', (e) => e.map((x) => +x.dataset.vraaggap))).toEqual([7, 7, 7, 21, 14, 21]);
  expect(await getal(page)).toBe(150);
  await expect(page.locator('[data-vraagantwoord="contantRitme"]')).toContainText('In juli elke 7 dagen, in september elke 21 dagen. Je neemt gemiddeld €150,00 per maand op.');
  await expect(page.locator('[data-vraagopname]')).toHaveCount(6);
});

test('h. privacy: bij elke nieuwe soort gaat er alleen vraag, potjes en vandaag mee, in een verzoek', async ({ page }) => {
  await S.boot(page);
  for (const o of [{ soort: 'weekdag' }, { soort: 'tegenpartij', zoektermen: ['thuisbezorgd'] }, { soort: 'drempel', bedrag: 10 }, { soort: 'eenmalig' }, { soort: 'naOverschrijding' }, { soort: 'contantRitme' }]) {
    const req = await S.stubVraag(page, Object.assign({}, L, o));
    await S.vraag(page, 'vraag ' + o.soort);
    await page.waitForTimeout(150);
    expect(req.length, o.soort).toBe(1);
    expect(req[0].url).toBe('https://w.test/vraag');
    const body = JSON.parse(req[0].body);
    expect(Object.keys(body).sort(), o.soort).toEqual(['potjes', 'vandaag', 'vraag']);
    for (const v of ['Thuisbezorgd', 'Uber', 'Geldmaat', 'Jumbo', 'Albert', S.MAIN, '1208', '450']) expect(req[0].body, o.soort + ' ' + v).not.toContain(v);
  }
});

test('j. de app loopt een opdracht zelf na: zoektermen ingekort, onbekende soort en drempel zonder bedrag zijn onbekend', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => {
    const L = { potje: null, venster: null, dag: null, bedrag: null, wat: null };
    return { t: vraagOpdracht(Object.assign({}, L, { soort: 'tegenpartij', zoektermen: ['a', 'b'.repeat(60), 'c', 'd', 'e', 'f', 7] })),
      x: vraagOpdracht({ soort: 'advies' }), d: vraagOpdracht(Object.assign({}, L, { soort: 'drempel' })), z: vraagOpdracht(Object.assign({}, L, { soort: 'tegenpartij', zoektermen: [] })),
      w: vraagOpdracht(Object.assign({}, L, { soort: 'weekdag', zoektermen: ['x'] })) }; });
  expect(r.t.zoektermen).toEqual(['a', 'b'.repeat(40), 'c', 'd', 'e']);
  expect(r.x).toEqual({ soort: 'onbekend' }); expect(r.d).toEqual({ soort: 'onbekend' }); expect(r.z).toEqual({ soort: 'onbekend' });
  expect(r.w.zoektermen).toBeUndefined();   // zoektermen alleen bij tegenpartij
  await expect(page.locator('body')).toBeVisible();
});

test('l. het vraagveld houdt zijn drie voorbeelden', async ({ page }) => {
  await S.boot(page);
  await page.evaluate(() => { go('maand'); }); await page.locator('#gripKoopcheck').click();
  await expect(page.locator('[data-vraagvoorbeeld]')).toHaveCount(3);
});

test('k. met vragen aan zijn alle bedragen op de schermen byte-gelijk aan f1e0d7e', async ({ page }) => {
  expect(VOOR.v520Lezer).toBe(false);   // de generator las f1e0d7e, waar de zes soorten niet bestonden
  await B.boot(page);
  expect(await page.evaluate(() => vraagKnopAan())).toBe(true);
  const nu = await B.bedragen(page);
  for (const k of ['home', 'ins', 'grip-zien', 'grip-begrijpen', 'grip-kiezen', 'grip-terugblik', 'plan', 'vermogen', 'salv']) expect(nu[k], k).toEqual(VOOR[k]);
  expect(nu.gepland).toEqual(VOOR.gepland);
});
