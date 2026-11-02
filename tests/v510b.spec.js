/* v510b: SPOED, JE HOLDING IS GEEN INKOMEN MEER, EN DE CATEGORIE HOLDING VERVALT (gemeten op het toestel 2 nov: EUR 2.500 van Ernst
 * Management Holding stond op Inkomen, Home zei "Nog te ontvangen EUR 2.715"). Op v510b-stand. GECONSTRUEERD.
 *  a. de keuze "vanaf sep 2026" in Kloppen mijn gegevens?: de EUR 2.500 van 2 nov is Eigen rekening, Nog te ontvangen is de norm min
 *     alleen echt inkomen; een maandbetaling van voor de keuze (februari) blijft inkomen.
 *  b. de categorie Holding vervalt: na de migratie zijn alle maandtotalen, opzij, budget en de CONTROLE van blok 20 in centen gelijk aan
 *     ervoor (tests/v510b-voor.json, gemeten op ef1baa8 met dezelfde fixture); alleen de naam van het bakje in totals().byCat verschuift.
 *  c. jouw keuze per boeking wint van een regel per partij, ook bij je holding.
 *  d. een boeking van de holding is nooit het salaris, ook boven de vangrail.
 */
const fs = require('fs'), path = require('path');
const { test, expect } = require('./klok');
const H = require('./v510b-stand');
const VOOR = JSON.parse(fs.readFileSync(path.join(__dirname, 'v510b-voor.json'), 'utf8'));

const holdingCats = page => page.evaluate(() => TX.filter(t => /Ernst Management Holding/.test(t.name)).map(t => ({ id: t.id, d: t.date, a: t.amount, c: catOf(t) })));

test('v510b a: vanaf sep 2026 is de holding Eigen rekening; Nog te ontvangen telt alleen echt inkomen; februari blijft inkomen', async ({ page }) => {
  await H.boot(page, '2026-11-02', { vroeg: true });
  const voor = await page.evaluate(() => { const L = monthLiquidity(); return { binnen: L.incBinnen, norm: L.incNorm, due: L.incDue, feb: maandInkomen('2026-02').alles, febNorm: maandInkomen('2026-02').norm }; });
  let C = await holdingCats(page);
  // de invoer draagt het geval van het toestel: 2 nov op Inkomen, en "al binnen" telt hem
  expect(C.find(x => x.d === '2026-11-02').c).toBe('inkomen');
  expect(C.find(x => x.d === '2026-02-01').c).toBe('inkomen');
  expect(Math.round(voor.binnen)).toBe(2500);
  expect(Math.round(voor.due)).toBe(Math.round(voor.norm - 2500));

  // de vraag staat in Kloppen mijn gegevens?, met de bijschrijvingen van de laatste zes maanden en per maand een keuze
  await page.evaluate(() => openGegevensVragen('holdingvanaf|' + [...holdingKeys()][0]));
  const vr = page.locator('[data-gegevensvraag="holdingvanaf"]');
  await expect(vr).toBeVisible();
  await expect(vr).toContainText('Je holding betaalt je geen maandinkomen meer. Vanaf welke maand?');
  const rijen = await vr.locator('[data-holdingvanafboeking]').allInnerTexts();
  expect(rijen.length).toBe(6);                                    // 1 jun, 1 jul, 1 aug, 1 sep, 1 okt, 2 nov (de afschrijving van 15 jun niet)
  expect(rijen.some(r => /2 nov/.test(r) && /Inkomen/.test(r) && /2\.500/.test(r))).toBe(true);
  expect(rijen.some(r => /1 sep/.test(r) && /Eigen rekening/.test(r))).toBe(true);
  const knoppen = vr.locator('[data-holdingvanaf]');
  expect(await knoppen.count()).toBe(6);                           // juni tot en met november
  const cls = await knoppen.evaluateAll(b => b.map(x => x.className));
  expect(cls.every(c => /\bsec\b/.test(c))).toBe(true);           // niets voorgeselecteerd
  await vr.locator('[data-holdingvanaf="2026-09"]').click();

  C = await holdingCats(page);
  const na = await page.evaluate(() => { const L = monthLiquidity(); const k = [...holdingKeys()][0];
    const echt = txOfMonth(thisYM()).filter(t => t.amount > 0 && (CATS[catOf(t)] || {}).type === 'income' && recurKey(t) !== k).reduce((a, t) => a + t.amount, 0);
    return { binnen: L.incBinnen, norm: L.incNorm, due: L.incDue, echt, feb: maandInkomen('2026-02').alles, febNorm: maandInkomen('2026-02').norm,
      vanaf: holdingGeenInkomenVanaf(k), vraag: gegevensVragen().some(q => q.soort === 'holdingvanaf'), sal: (salarisBetalingLaatst(nextYM(thisYM())) || {}).date }; });
  expect(na.vanaf).toBe('2026-09');
  expect(C.find(x => x.d === '2026-11-02').c).toBe('intern');     // Eigen rekening / overboeking
  for (const x of C.filter(x => x.d >= '2026-09')) expect(x.c).toBe('intern');
  expect(C.find(x => x.d === '2026-02-01').c).toBe('inkomen');     // voor de keuze blijft een maandbetaling inkomen
  expect(Math.round(na.feb * 100)).toBe(Math.round(voor.feb * 100));
  expect(Math.round(na.febNorm * 100)).toBe(Math.round(voor.febNorm * 100));
  expect(Math.round(na.binnen * 100)).toBe(Math.round(na.echt * 100));   // al binnen = alleen echt inkomen
  expect(Math.round(na.due * 100)).toBe(Math.round(Math.max(na.norm - na.echt, 0) * 100));
  expect(Math.round(na.norm * 100)).toBe(Math.round(voor.norm * 100));   // de inkomensnorm verandert niet achteraf
  expect(na.vraag).toBe(false);                                    // eenmalig
  expect(na.sal).toBe('2026-10-24');
  // Home toont het: geen "al binnen" van de holding
  await page.evaluate(() => { go('dash'); render(); });
  const home = await page.locator('#s-dash').innerText();
  expect(home).not.toMatch(/2\.500 al binnen/);
});

test('v510b b: de categorie Holding vervalt; maandtotalen, opzij, budget en de CONTROLE zijn in centen gelijk aan ervoor', async ({ page }) => {
  await H.boot(page, '2026-11-02');
  await page.evaluate(() => { SET.rules = [{ kw: 'EMH BEHEER', cat: 'holding' }].concat(SET.rules || []); save(); });
  await H.herlaad(page);
  const na = await page.evaluate(H.METEN);
  const controle = await H.CONTROLE(page);
  // het bakje in totals().byCat heet nu intern: Holding en Eigen rekening samengenomen zijn gelijk
  const voeg = R => { const o = JSON.parse(JSON.stringify(R)); for (const m of Object.values(o.maand)) { const b = m.totals.byCat || {}; if (b.holding != null) { b.intern = (b.intern || 0) + b.holding; delete b.holding; } if (b.intern === 0) delete b.intern; } return o; };
  expect(voeg(na)).toEqual(voeg(VOOR.voor));
  expect(controle.length).toBe(VOOR.controle.length);
  expect(controle).toEqual(VOOR.controle);
  for (const r of controle) expect(r).toMatch(/: klopt$/);
  const st = await page.evaluate(() => ({ holding: TX.filter(t => catOf(t) === 'holding').length, ovr: Object.values(OVR).filter(c => c === 'holding').length,
    regels: (SET.rules || []).filter(r => r.cat === 'holding').length, cat: 'holding' in CATS, W: SET.holdingCatWeg,
    emh: catOf(TX.find(t => t.name === 'EMH Beheer')) }));
  expect(st.cat).toBe(false);
  expect(st.holding).toBe(0); expect(st.ovr).toBe(0); expect(st.regels).toBe(0);
  expect(st.emh).toBe('intern');
  expect(st.W.ids.length).toBe(1); expect(st.W.ovr).toBe(1); expect(st.W.regels).toBe(1);
  // Holding staat niet meer in de categoriekeuze van de boekingssheet; de bezitting Holding op Plan is geen categorie en blijft buiten beeld
  const id = await page.evaluate(() => TX.find(t => t.name === 'Ernst Management Holding' && t.date === '2026-10-01').id);
  await page.evaluate(id => openSheet(id), id);
  const picks = await page.locator('#sheet .catpick').allInnerTexts();
  expect(picks.some(p => /^\s*Holding\s*$/.test(p))).toBe(false);
  expect(picks.some(p => /Eigen rekening/.test(p))).toBe(true);
  // blok 20 noemt de holding nog, nu op Eigen rekening, met de omzetting
  const b20 = await page.evaluate(async () => (await diagTekst()));
  expect(b20).toContain('categorie Holding vervallen (v510b');
  expect(b20).toMatch(/holding netto: de boekingen van je holding op Eigen rekening/);
});

test('v510b c: jouw keuze per boeking wint van een regel per partij, ook bij je holding', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await H.boot(page, '2026-11-02', { vroeg: true });
  // c1: een partijregel zet een bijschrijving op Inkomen
  const id = await page.evaluate(({ MAIN }) => {
    SET.rules = [{ kw: 'FREELANCE OPDRACHTGEVER', cat: 'inkomen' }].concat(SET.rules || []);
    const t = { id: 'v510bc1', date: '2026-10-15', amount: 800, acc: MAIN, name: 'Freelance Opdrachtgever', desc: 'SEPA OVERBOEKING FREELANCE OPDRACHTGEVER', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); TX.sort((x, y) => x.date.localeCompare(y.date)); applyOwnAccounts(); save(); render(); return t.id; }, { MAIN: H.MAIN });
  expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), id)).toBe('inkomen');   // de invoer: de regel zette hem op Inkomen
  const okt0 = await page.evaluate(() => maandInkomen('2026-10').alles);
  await page.evaluate(id => openSheet(id), id);
  const pick = page.locator('#sheet .catpick', { hasText: 'Eigen rekening' });
  await pick.scrollIntoViewIfNeeded();
  const bereik = await pick.evaluate(e => { const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const o = document.elementFromPoint(x, y); return !!o && (o === e || e.contains(o)); });
  expect(bereik).toBe(true);                                       // op 390x844 te bereiken
  await pick.click();
  await H.herlaad(page);
  const c1 = await page.evaluate(id => ({ c: catOf(TX.find(t => t.id === id)), okt: maandInkomen('2026-10').alles }), id);
  expect(c1.c).toBe('intern');
  expect(Math.round((okt0 - c1.okt) * 100)).toBe(80000);
  // c2: je holding, een maandbetaling (februari, inkomen), met "Voortaan alle ... automatisch zo categoriseren"
  const hid = await page.evaluate(() => TX.find(t => t.name === 'Ernst Management Holding' && t.date === '2026-02-01').id);
  expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), hid)).toBe('inkomen');
  await page.evaluate(id => openSheet(id), hid);
  await page.locator('#mkrule').check();
  await page.locator('#sheet .catpick', { hasText: 'Eigen rekening' }).click();
  await H.herlaad(page);
  expect(await page.evaluate(id => catOf(TX.find(t => t.id === id)), hid)).toBe('intern');
});

test('v510b d: een holding-boeking van EUR 3.000 op 2 nov (boven de vangrail) is niet het salaris; november (1–23) blijft', async ({ page }) => {
  await H.boot(page, '2026-11-02', { drieduizend: true });
  const r = await page.evaluate(() => { const t = TX.find(x => x.name === 'Ernst Management Holding' && x.date === '2026-11-02');
    const B = salBron(), P = salPeriode(), W = huidigVenster(), sl = salarisBetalingLaatst(nextYM(thisYM()));
    const med = TX.filter(x => x.amount > 5000).map(x => x.amount).sort((a, b) => a - b);
    return { c: catOf(t), a: t.amount, med: med[Math.floor(med.length / 2)], sl: sl && sl.date, slNaam: sl && sl.name, bron: B && B.sl.date, start: P && P.cur.start, wStart: W && W.start, wEind: W && W.eind }; });
  expect(r.c).toBe('inkomen');                                     // de invoer: op Inkomen (nog geen keuze uit punt 1)
  expect(r.a).toBeGreaterThan(r.med * 0.5);                        // de vangrail houdt hem niet tegen
  expect(r.sl).toBe('2026-10-24'); expect(r.slNaam).toBe('Werkgever');
  expect(r.bron).toBe('2026-10-24');
  expect(r.start).not.toBe('2026-11-02');
  expect(r.wStart).toBe('2026-11-01');
  expect(r.wEind).toBe('2026-11-23');
});

for (const w of [360, 390]) test(`v510b e: de vraag past op ${w}px, zonder horizontaal scrollen`, async ({ page }) => {
  await page.setViewportSize({ width: w, height: 800 });
  await H.boot(page, '2026-11-02');
  await page.evaluate(() => openGegevensVragen('holdingvanaf|' + [...holdingKeys()][0]));
  const m = await page.evaluate(() => { const v = document.querySelector('[data-gegevensvraag="holdingvanaf"]'), r = v.getBoundingClientRect();
    const uit = [...v.querySelectorAll('*')].filter(e => { const b = e.getBoundingClientRect(); return b.right > window.innerWidth + 0.5 || b.left < -0.5; }).length;
    return { breed: document.documentElement.scrollWidth <= window.innerWidth, uit, knop: Math.min(...[...v.querySelectorAll('[data-holdingvanaf]')].map(b => b.getBoundingClientRect().height)) }; });
  expect(m.breed).toBe(true);
  expect(m.uit).toBe(0);
  expect(m.knop).toBeGreaterThanOrEqual(44);
});
