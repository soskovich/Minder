/* v338: DE WERKLIJST ACHTER "BOEKINGEN ZONDER CATEGORIE". Tot v337 opende die punt het overzicht van
   Overig, en daar kun je een boeking niet hercategoriseren. Nu opent hij precies de boekingen die hij telt;
   een tik opent de bestaande transactie-sheet, "Overig klopt" telt als eigen keuze, en een eerdere eigen
   keuze voor dezelfde tegenpartij staat bovenaan als voorstel. Er wordt niets vanzelf omgezet. */
const { test, expect } = require('@playwright/test');
const { boot } = require('./bezit-koppeling.fixture');

const M = '2026-09';
async function stand(page) {
  await boot(page, { dag: '2026-10-04', set: { budgetMonth: '2026-10', budgets: { boodschappen: 500, huur: 900 }, reserveringen: [], assets: [] } });
  await page.evaluate(() => {
    const acc = TX[0].acc;
    const mk = (id, date, amount, name) => ({ id, date, amount, acc, name, desc: name.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
    for (let i = 1; i <= 12; i++) TX.push(mk('q' + i, '2026-09-' + String(i + 2).padStart(2, '0'), -10 - i, 'Qwrtz ' + i));
    TX.push(mk('xy9', '2026-09-20', -31, 'Xyzzy Winkel'));
    TX.push(mk('xy9b', '2026-09-22', -12, 'Xyzzy Winkel'));
    TX.push(mk('xy8', '2026-08-18', -27, 'Xyzzy Winkel'));   // augustus: telt niet voor september, draagt de eerdere keuze
    TX.forEach(categorize); applyOwnAccounts();
    const a = TX.find((t) => t.date === '2026-08-18' && t.name === 'Xyzzy Winkel'); OVR[a.id] = 'boodschappen';
    save(); go('maand');
  });
}
/* De echte route: de regel op Grip, de punt in de sheet.
   v340: de afsluitregel op Grip bestaat niet meer; de afsluiting is een pop-up, en de vaste ingang
   ernaar is de regel "<maand> afsluiten" bovenaan het logboek ([data-logopen]). */
async function viaPunt(page, o) {
  if (!(o && o.alOpLogboek)) await page.evaluate(() => { closeSheet(); go('logboek'); });
  await page.click('#logTijdlijn [data-logopen="2026-09"]');
  await page.click('#afsluitSheet [data-afpunt="categorie"]');
  await expect(page.locator('#afsluitOverig')).toBeVisible();
}
const id = (page, naam, dag) => page.evaluate(([n, d]) => TX.find((t) => t.name === n && t.date === d).id, [naam, dag]);
const punt = (page) => page.evaluate((m) => { const p = afsluitPunten(m, maandRegels()).find((x) => x.punt === 'categorie'); return { af: p.af, feit: p.feit, n: afsluitOverigTx(m).length, act: p.act }; }, M);
const lijst = (page) => page.evaluate(() => { const k = document.getElementById('afsluitOverig'); if (!k) return null;
  return { teller: +k.querySelector('[data-werkteller]').dataset.werkteller, rijen: [...k.querySelectorAll('[data-werkrij]')].map((e) => e.dataset.werkrij), tekst: k.innerText.replace(/\s+/g, ' ') }; });

test('a. de punt telt 14 en opent een werklijst met precies die 14', async ({ page }) => {
  await stand(page);
  const p = await punt(page);
  expect(p.n).toBe(14);
  expect(p.feit).toBe('14 boekingen staan nog op Overig');
  expect(p.af).toBe(false);
  await page.evaluate((m) => openAfsluiting(m), M);
  await page.click('#afsluitSheet [data-afpunt="categorie"]');
  const l = await lijst(page);
  expect(l.teller).toBe(14);
  const verwacht = await page.evaluate((m) => afsluitOverigTx(m).map((t) => t.id).sort(), M);
  expect(l.rijen.slice().sort()).toEqual(verwacht);
  expect(l.tekst).not.toContain('Qwrtz 0');
});

test('b. een tik opent de transactie-sheet; na een categorie terug in de lijst met 13', async ({ page }) => {
  await stand(page);
  await viaPunt(page);
  const q1 = await id(page, 'Qwrtz 1', '2026-09-03');
  await page.click(`#afsluitOverig [data-werkrij="${q1}"] > span:first-child`);
  await expect(page.locator('#sheet .catgrid')).toBeVisible();
  await expect(page.locator('#mkrule')).toBeVisible();
  await expect(page.locator('#sheet')).toContainText('Voortaan');
  await page.click('#sheet .catpick:has-text("Boodschappen")');
  const l = await lijst(page);
  expect(l.teller).toBe(13);
  expect(l.rijen).not.toContain(q1);
  expect((await punt(page)).n).toBe(13);
  expect(await page.evaluate((i) => catOf(TX.find((t) => t.id === i)), q1)).toBe('boodschappen');
});

test('c. "Overig klopt" telt als eigen keuze: 13, en de boeking blijft Overig', async ({ page }) => {
  await stand(page);
  await page.evaluate((m) => openAfsluitOverig(m), M);
  const q2 = await id(page, 'Qwrtz 2', '2026-09-04');
  await page.click(`#afsluitOverig [data-werkrij="${q2}"] [data-overigklopt]`);
  const l = await lijst(page);
  expect(l.teller).toBe(13);
  expect(l.rijen).not.toContain(q2);
  const r = await page.evaluate((i) => ({ ovr: OVR[i], cat: catOf(TX.find((t) => t.id === i)) }), q2);
  expect(r).toEqual({ ovr: 'overig', cat: 'overig' });
  expect((await punt(page)).feit).toBe('13 boekingen staan nog op Overig');
});

test('d. Overig kiezen in de sheet vanuit de werklijst is ook een eigen keuze', async ({ page }) => {
  await stand(page);
  const q3 = await id(page, 'Qwrtz 3', '2026-09-05');
  await page.evaluate(([i, m]) => afsluitOverigOpen(i, m), [q3, M]);
  await page.click('#sheet .catpick:has-text("Overig")');
  expect((await lijst(page)).teller).toBe(13);
  expect(await page.evaluate((i) => OVR[i], q3)).toBe('overig');
});

test('e. een eerdere eigen keuze voor dezelfde tegenpartij staat bovenaan, en openen schrijft niets', async ({ page }) => {
  await stand(page);
  const xy = await id(page, 'Xyzzy Winkel', '2026-09-20');
  const q4 = await id(page, 'Qwrtz 4', '2026-09-06');
  /* v340: naar het logboek gaan (de route naar de afsluiting) rekent de signalen opnieuw en mag
     schrijven; dat gebeurt hier VOOR de teller, zodat hij alleen het openen van de werklijst en het
     voorstel meet, zoals voor v340. */
  await page.evaluate(() => { closeSheet(); go('logboek'); });
  await page.evaluate(() => { window._schrijf = 0; const o = localStorage.setItem.bind(localStorage); localStorage.setItem = (k, v) => { window._schrijf++; return o(k, v); }; });
  const voor = await page.evaluate(() => JSON.stringify(OVR));
  await viaPunt(page, { alOpLogboek: true });
  const l = await lijst(page);
  expect(await page.locator(`[data-werkrij="${xy}"]`).innerText()).toContain('eerder koos je Boodschappen');
  expect(await page.locator(`[data-werkrij="${q4}"]`).innerText()).not.toContain('eerder koos je');
  await page.click(`[data-werkrij="${xy}"] > span:first-child`);
  const v = page.locator('#sheet [data-catvoorstel]');
  await expect(v).toHaveAttribute('data-catvoorstel', 'boodschappen');
  // bovenaan: het voorstel komt voor de rest van de sheet
  expect(await page.evaluate(() => { const s = document.getElementById('sheet'); const v = s.querySelector('[data-catvoorstel]'); return [...s.children].indexOf(v); })).toBe(1);
  expect(await page.evaluate(() => [window._schrijf, JSON.stringify(OVR)])).toEqual([0, voor]);
  expect(l.teller).toBe(14);
  // een boeking zonder eerdere keuze heeft geen voorstel
  await page.evaluate(([i, m]) => afsluitOverigOpen(i, m), [q4, M]);
  await expect(page.locator('#sheet [data-catvoorstel]')).toHaveCount(0);
  // het voorstel overnemen
  await page.evaluate(([i, m]) => afsluitOverigOpen(i, m), [xy, M]);
  await page.click('#sheet [data-catvoorstel] button');
  expect(await page.evaluate((i) => catOf(TX.find((t) => t.id === i)), xy)).toBe('boodschappen');
  expect((await lijst(page)).teller).toBe(13);
});

test('f. geen voorstel uit "Overig klopt" of uit een automatische categorie', async ({ page }) => {
  await stand(page);
  const r = await page.evaluate(() => {
    const a = TX.find((t) => t.date === '2026-08-18' && t.name === 'Xyzzy Winkel');
    const xy = TX.find((t) => t.date === '2026-09-20' && t.name === 'Xyzzy Winkel');
    OVR[a.id] = 'overig'; const met = catVoorstel(xy);
    delete OVR[a.id]; const zonder = catVoorstel(xy);
    // dezelfde tegenpartij, automatisch op Boodschappen door een trefwoord in de omschrijving: geen keuze van jou
    const b = { id: 'xy7', date: '2026-07-10', amount: -14, acc: TX[0].acc, name: 'Xyzzy Winkel', desc: 'XYZZY WINKEL ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    TX.push(b); TX.forEach(categorize); applyOwnAccounts();
    const auto = catOf(TX.find((t) => t.date === '2026-07-10' && t.name === 'Xyzzy Winkel'));
    return { met, zonder, auto, autoVoorstel: catVoorstel(TX.find((t) => t.date === '2026-09-20' && t.name === 'Xyzzy Winkel')) };
  });
  expect(r).toEqual({ met: null, zonder: null, auto: 'boodschappen', autoVoorstel: null });
});

test('g. bij 0 vinkt de punt af', async ({ page }) => {
  await stand(page);
  await page.evaluate((m) => { for (const t of afsluitOverigTx(m)) OVR[t.id] = 'overig'; save(); }, M);
  const p = await punt(page);
  expect(p).toEqual({ af: true, feit: 'geen', n: 0, act: '' });
  await page.evaluate((m) => openAfsluitOverig(m), M);
  const l = await lijst(page);
  expect(l.teller).toBe(0);
  expect(l.tekst).toContain('hebben een eigen keuze');
});

test('h. "Voortaan alle ..." neemt de hele tegenpartij mee en keert terug naar de lijst', async ({ page }) => {
  await stand(page);
  const xy = await id(page, 'Xyzzy Winkel', '2026-09-20');
  await page.evaluate(([i, m]) => afsluitOverigOpen(i, m), [xy, M]);
  await page.check('#mkrule');
  await page.click('#sheet .catpick:has-text("Boodschappen")');
  const l = await lijst(page);
  expect(l.teller).toBe(12);
  expect(l.tekst).not.toContain('Xyzzy');
});

test('i. buiten de werklijst opent de transactie-sheet zoals altijd', async ({ page }) => {
  await stand(page);
  const xy = await id(page, 'Xyzzy Winkel', '2026-09-20');
  await page.evaluate(([i, m]) => afsluitOverigOpen(i, m), [xy, M]);
  await page.evaluate(() => closeSheet());
  await page.evaluate((i) => openSheet(i), xy);
  await expect(page.locator('#sheet [data-catvoorstel]')).toHaveCount(0);
  await page.click('#sheet .catpick:has-text("Vervoer")');
  expect(await page.evaluate(() => !!document.getElementById('afsluitOverig'))).toBe(false);
  expect(await page.evaluate(() => OVR[TX.find((t) => t.date === '2026-09-20' && t.name === 'Xyzzy Winkel').id])).toBe('vervoer');
});

/* Bevinding 4, op een fixture en niet op het toestel: "From Reservering to Leefgeld" (+50) staat op Overig
   omdat (1) de intern-detectie voor PSD2 alleen een vaste lijst Space-namen kent (main, zakgeld, buffer,
   spaarpot), en Reservering en Leefgeld daar niet in staan, en (2) een onbekende bijschrijving daarna de
   categorie erft van een afschrijving met dezelfde eerste twintig tekens: de -50 aan de andere kant van
   dezelfde overboeking, die zelf op Overig staat. Zonder die tegenkant is hij 'intern'. */
test('j. bevinding 4: de bijschrijving erft Overig van zijn eigen tegenkant', async ({ page }) => {
  await stand(page);
  const r = await page.evaluate(() => {
    const mk = (id, acc, amount) => ({ id, date: '2026-09-22', amount, acc, name: 'From Reservering to Leefgeld', desc: 'From Reservering to Leefgeld', typ: '', ref: '', src: 'psd2', accName: '', refNums: [] });
    const bij = mk('rl1', 'psd2_leefgeld', 50);
    TX.push(bij); TX.forEach(categorize); applyOwnAccounts();
    const alleen = catOf(TX.find((t) => t.acc === 'psd2_leefgeld'));
    TX.push(mk('rl2', 'psd2_reservering', -50)); TX.forEach(categorize); applyOwnAccounts();
    return { alleen, bij: catOf(TX.find((t) => t.acc === 'psd2_leefgeld')), af: catOf(TX.find((t) => t.acc === 'psd2_reservering')) };
  });
  expect(r).toEqual({ alleen: 'intern', bij: 'overig', af: 'overig' });
});

/* Gemeten op 360 en 390px: de naam krijgt de breedte (de eerste vorm gaf de knop width:100% van .btn, en
   dan was de naamkolom 0px breed), niets loopt over, en het voorstel past in de sheet. */
for (const [w, h] of [[360, 640], [390, 844]]) {
  test(`k. de werklijst en het voorstel op ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await stand(page);
    await viaPunt(page);
    const m = await page.evaluate(() => {
      const k = document.getElementById('afsluitOverig'); const sh = document.getElementById('sheet');
      const rijen = [...k.querySelectorAll('[data-werkrij]')].map((r) => ({ naam: r.firstElementChild.getBoundingClientRect().width, h: r.getBoundingClientRect().height, rechts: r.getBoundingClientRect().right }));
      return { rijen, shRechts: sh.getBoundingClientRect().right, over: sh.scrollWidth > sh.clientWidth };
    });
    for (const r of m.rijen) { expect(r.naam).toBeGreaterThan(120); expect(r.rechts).toBeLessThanOrEqual(m.shRechts + 0.5); expect(r.h).toBeLessThan(70); }
    expect(m.over).toBe(false);
    const xy = await id(page, 'Xyzzy Winkel', '2026-09-20');
    await page.click(`[data-werkrij="${xy}"] > span:first-child`);
    const v = await page.evaluate(() => { const e = document.querySelector('#sheet [data-catvoorstel]'); const s = document.getElementById('sheet'); return { h: e.getBoundingClientRect().height, tekst: e.firstElementChild.getBoundingClientRect().width, over: s.scrollWidth > s.clientWidth }; });
    expect(v.tekst).toBeGreaterThan(120);
    expect(v.over).toBe(false);
    console.log(`meting ${w}: rij ${m.rijen.map((r) => Math.round(r.h)).join('/')}px, voorstel ${Math.round(v.h)}px`);
  });
}
