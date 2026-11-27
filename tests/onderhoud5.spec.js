/* onderhoud5: het bron-sheet "Eruit gehaald" en de verschuiving naar Reserveren, op de nagebouwde stand van 27 nov
   (tests/onderhoud5-stand.js, GECONSTRUEERD naar de SET van de back-up van de gebruiker).
   1. het bron-sheet en opnameLijst() lezen de ene definitie van een opname (isSpaarOpname zonder terug), dus geen overboeking tussen
      je eigen spaarrekeningen; een bron-keuze daarop gaat bij het laden weg (SET.onderhoud5.weg).
   2. een aanvulling haalt altijd het hele bedrag van je noodfonds af, en dat wordt opnieuw uitgerekend (nfAanvulSync), niet opgeteld:
      de volgorde van kiezen telt niet meer. Wat het noodfonds niet kan dragen staat in het sheet.
   3. een verschuiving naar Reserveren met een keuze haalt het bedrag van Beschermen af; wisselen of wissen zet het precies terug.
   4. een doel heet pas "vol" als het geld het doel haalt.
   5. de gekozen bron en de gekozen verschuiving dragen ✓ en "gekozen", een regel "Vastgelegd" en "Keuze wissen".
   6. het signaal "Betaalrekening op" noemt de rekening waar het geld heen ging. */
const { test, expect } = require('./klok');
const S = require('./onderhoud5-stand');

const nf = (page) => page.evaluate(() => +SET.nfToegewezen);
const { kaalBron } = require('./bron-kaal');
const fs = require('fs');
/* het laadpad van de app na het lezen van de opslag (de fixture zet de stand bij elke goto opnieuw, dus geen reload): load() en de
   regels van de boot die ervoor zorgen dat de rekeningen bekend zijn, dan de migratie. Test a eist dat de boot-regel hem aanroept. */
const herlaad = (page) => page.evaluate(() => { load(); if (TX.length) { TX.forEach(categorize); applyOwnAccounts(); buildAccMeta(); } try { migrateNfToegewezen(); } catch (_) {} if (typeof onderhoud5Migreer === 'function' && onderhoud5Migreer()) save(); else save(); try { runMemoVergeten(); } catch (_) {} render(); });

test('a: de stand van 27 nov na laden: Beschermen EUR 2.927, Inrichting EUR 3.000, nog terug EUR 0, spaarrekening EUR 5.927,12', async ({ page }) => {
  await S.boot(page, { oud: true });
  const oud = await S.stand(page);
  expect(oud).toMatchObject({ beschermen: 3326, nogTerug: 398.88, saldo: 5927.12 });   // invoer: de stand van het toestel, voor de reparatie
  expect(Math.round(oud.iwGeld)).toBe(2601);
  /* het laadpad: de boot-regel roept onderhoud5Migreer() aan na migrateNfToegewezen() */
  const boot = kaalBron(fs.readFileSync(__dirname + '/../index.html', 'utf8')).split('\n').find((l) => l.startsWith('load(); try{applyTheme();}'));
  expect(boot).toMatch(/migrateNfToegewezen\(\);\}catch\(_\)\{\} try\{ if\(onderhoud5Migreer\(\)\) save\(\); \}catch/);
  await herlaad(page);
  const na = await S.stand(page);
  expect(await page.evaluate(() => Object.values(SET.opnameBron || {}).filter((e) => e.bron === 'aanvulling').length)).toBe(3);   // invoer: de herlaadde stand is die van de fixture
  expect(na).toMatchObject({ beschermen: 2927, doelen: 3000, nogTerug: 0, saldo: 5927.12, nf: 2927 });
  expect(na.kop).toBe(oud.kop);   // het totaal van je lagen verandert niet, alleen de verdeling
  const af = await page.evaluate(() => Object.values(SET.opnameBron).filter((e) => e.bron === 'aanvulling').map((e) => e.af).sort((a, b) => a - b));
  expect(af).toEqual([20, 93, 250]);   // migratie: de records met af 0 dragen hun echte af
  expect(await page.evaluate(() => SET.nfAfgetrokken)).toBe(399);
});

test('b (punt 1): de overboeking tussen je twee spaarrekeningen staat niet in het bron-sheet, en zijn keuze gaat bij het laden weg', async ({ page }) => {
  await S.boot(page, { oud: true });
  const ids = await page.evaluate(() => window.__o5);
  const voor = await page.evaluate(() => opnameLijstPerioden().map((t) => t.id));
  expect(voor).not.toContain(ids.tus);   // de lijst leest de ene definitie
  expect(await page.evaluate((id) => opnameLijst('2026-11').some((t) => t.id === id), ids.tus)).toBe(false);
  expect(voor).toEqual(expect.arrayContaining([ids.nf2, ids.nf3, ids.a1, ids.a2, ids.a3]));
  const sheet = await page.evaluate(() => { openOpnameBron(); return document.getElementById('opnameBron').innerText; });
  expect(sheet).not.toContain('Buffer Rust');
  expect(sheet).not.toContain('€3.175');
  /* de keuze op die boeking gaat weg bij het laden; was het een aanvulling, dan komt het bedrag terug op je noodfonds */
  await page.evaluate((id) => { SET.opnameBron[id] = { bron: 'aanvulling', af: 500 }; SET.nfToegewezen = 2826; save(); }, ids.tus);
  await herlaad(page);
  const r = await page.evaluate((id) => ({ heeft: Object.prototype.hasOwnProperty.call(SET.opnameBron, id), weg: (SET.onderhoud5 || {}).weg, nf: +SET.nfToegewezen }), ids.tus);
  expect(r.heeft).toBe(false);
  expect(r.weg.map((w) => [w.id, w.bron, w.af])).toEqual([[ids.tus, 'aanvulling', 500]]);
  expect(r.nf).toBe(2927);   // 2.826 + 500 terug, min de aanvullingen (363) en de verschuiving (36)
});

test('c (punt 2): de volgorde van kiezen telt niet, en wat het noodfonds niet kan dragen staat in het sheet', async ({ page }) => {
  await S.boot(page);
  const ids = await page.evaluate(() => window.__o5);
  expect(await nf(page)).toBe(2927);
  /* de drie aanvullingen weg, het noodfonds terug op de basis min de verschuiving */
  await page.evaluate((I) => { for (const k of ['a1', 'a2', 'a3']) setOpnameBron(I[k], ''); }, ids);
  expect(await nf(page)).toBe(3290);
  /* een klein noodfonds: eerst de grote, dan de kleine, dan de grote terug */
  await page.evaluate(() => { SET.nfToegewezen = 300; save(); });
  await page.evaluate((I) => { setOpnameBron(I.a3, 'aanvulling'); setOpnameBron(I.a1, 'aanvulling'); setOpnameBron(I.a2, 'aanvulling'); }, ids);
  expect(await nf(page)).toBe(0);
  const tek = await page.evaluate(() => { openOpnameBron(); const e = document.querySelector('#opnameBron [data-nftekort]'); return e ? [+e.dataset.nftekort, e.innerText] : null; });
  expect(tek[0]).toBe(63);   // basis 336 (300 + de 36 die er al af stond) tegen 363 + 36 af
  expect(tek[1]).toContain('Je noodfonds kan €63 niet dragen; €63 komt uit Inrichting.');
  await page.evaluate((I) => setOpnameBron(I.a3, 'noodfonds'), ids);
  expect(await nf(page)).toBe(187);   // 336 - 93 - 20 - 36; tot onderhoud5 bleven de kleine op af 0 staan
  /* andere volgorde, dezelfde uitkomst */
  await page.evaluate((I) => { setOpnameBron(I.a1, ''); setOpnameBron(I.a2, ''); setOpnameBron(I.a2, 'aanvulling'); setOpnameBron(I.a1, 'aanvulling'); }, ids);
  expect(await nf(page)).toBe(187);
});

test('d (punt 3): een verschuiving naar Reserveren met keuze haalt het bedrag van Beschermen af; wisselen en wissen zetten het precies terug', async ({ page }) => {
  await S.boot(page);
  const vs = await page.evaluate(() => window.__o5.vs);
  const L0 = await S.stand(page);
  expect(L0.beschermen).toBe(2927);
  await page.evaluate((id) => setVerschuivingKeuze(id, '3'), vs);
  expect((await S.stand(page)).beschermen).toBe(2927);   // 3 maanden haalt hem ook af (het terugzetten loopt erbij)
  await page.evaluate((id) => setVerschuivingKeuze(id, ''), vs);
  const L1 = await S.stand(page);
  expect(L1.beschermen).toBe(2963);   // zonder keuze telt de EUR 36 weer als toegewezen
  expect(L1.nogTerug).toBe(35.88);
  await page.evaluate((id) => setVerschuivingKeuze(id, 'nee'), vs);
  const L2 = await S.stand(page);
  expect(L2).toMatchObject({ beschermen: 2927, nogTerug: 0 });
  expect(L2.kop).toBe(L0.kop);   // het totaal van je lagen blijft gelijk
});

test('e (punt 4): een doel met geld onder het doel heet niet "vol", maar zegt wat er staat en wat nog terug moet', async ({ page }) => {
  await S.boot(page, { oud: true });
  const oud = await page.evaluate(() => { go('vooruit'); renderVooruit(); const e = document.querySelector('#s-vooruit [data-doelterug="iw"]'); return { t: e && e.innerText, sub: lagenDoelenSub(lagenData()) }; });
  expect(oud.t).toBe('€2.601 van €3.000 · €399 nog terug');
  expect(oud.sub).not.toMatch(/Inrichting<\/b> vol/);
  await page.evaluate(() => { onderhoud5Migreer(); save(); });
  const na = await page.evaluate(() => lagenDoelenSub(lagenData()));
  expect(na).toMatch(/Inrichting<\/b> vol/);
});

test('f (punt 5): de gekozen bron draagt ✓ en "gekozen", een regel Vastgelegd en Keuze wissen; zo ook de verschuiving', async ({ page }) => {
  await S.boot(page);
  const ids = await page.evaluate(() => window.__o5);
  const r = await page.evaluate((I) => { openOpnameBron(); const rij = document.querySelector(`#opnameBron [data-opnamerij="${I.a3}"]`);
    const aan = rij.querySelector('[data-opnbron][data-aan="1"]');
    return { aan: aan.innerText, vast: rij.querySelector('[data-opnvastgelegd]').innerText, uit: [...rij.querySelectorAll('[data-opnbron][data-aan="0"]')].map((e) => e.innerText) }; }, ids);
  expect(r.aan).toBe('✓ Aanvulling, niet terugzetten · gekozen');
  expect(r.vast).toContain('Vastgelegd: Aanvulling, niet terugzetten');
  expect(r.uit.every((t) => !t.includes('✓') && !t.includes('gekozen'))).toBe(true);
  await page.locator(`#opnameBron [data-opnamerij="${ids.a3}"] [data-opnwis]`).click();
  const na = await page.evaluate((I) => ({ heeft: Object.prototype.hasOwnProperty.call(SET.opnameBron, I.a3), nf: +SET.nfToegewezen, vast: !!document.querySelector(`#opnameBron [data-opnamerij="${I.a3}"] [data-opnvastgelegd]`) }), ids);
  expect(na).toEqual({ heeft: false, nf: 3177, vast: false });   // Keuze wissen zet de EUR 250 terug
  /* Verschuivingen */
  const v = await page.evaluate((id) => { openLagenLog(); const rij = document.querySelector(`#lagenLog [data-verschlaag="${id}"]`);
    return { aan: rij.querySelector('[data-verschkeuze][data-aan="1"]').innerText, vast: rij.querySelector('[data-verschvastgelegd]').innerText }; }, ids.vs);
  expect(v.aan).toBe('✓ Nee, hoort bij Reserveren · gekozen');
  expect(v.vast).toContain('Vastgelegd: Nee, hoort bij Reserveren');
  await page.locator(`#lagenLog [data-verschlaag="${ids.vs}"] [data-verschwis]`).click();
  const vn = await page.evaluate((id) => ({ e: (SET.verschuiving || {})[id] || null, nf: +SET.nfToegewezen }), ids.vs);
  expect(vn).toEqual({ e: null, nf: 3213 });
});

test('g (punt 6): het signaal "Betaalrekening op" noemt de rekening waar het geld heen ging', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(({ SPAAR, LEEF }) => {
    const add = (acc, d, a, n) => { const t = { id: 'o5g' + acc.slice(-4) + d + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: 'From ' + n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    TX = TX.filter((t) => !(t.acc === SPAAR && t.amount < 0 && String(t.date) >= '2026-11-01' && !isVerschuiving(t)));   // alleen de opname van 15 nov in november
    add(SPAAR, '2026-11-15', -120, 'Leefgeld'); add(LEEF, '2026-11-15', 120, 'Instant Savings');
    SET.acctName = Object.assign({}, SET.acctName, { [LEEF]: 'Leefgeld' });
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
    const p = gripPatronenRuw().find((x) => x.id === 'spaargeld');
    go('maand'); gripKiesTab('zien');
    const sig = document.querySelector('#gripSignalen [data-signaal="pat:spaargeld"]');
    return { naam: p.naam, naar: p.naarTekst, sig: sig && sig.innerText, ont: p.ont.map((o) => o.naar) };
  }, { SPAAR: S.SPAAR, LEEF: S.LEEF });
  expect(r.naam).toMatch(/^Betaalrekening op na ~\d+ dagen na salaris$/);   // de naam zelf blijft (oordeel en reden lezen hem)
  expect(r.naar).toBe('naar Leefgeld');
  expect(r.ont).toEqual([S.LEEF]);
  expect(r.sig).toContain('· naar Leefgeld');
});

/* WAT NIET VERANDERT: buiten Plan, Grip en het bron-sheet is elk bedrag gelijk aan de vorige main (57e831e), op dezelfde stand,
   met de migratie aan de huidige kant (Beschermen 3.326 naar 2.927). Grip staat erbuiten: Fundament en Lagen lezen de toewijzing. */
const { execSync } = require('child_process');
const MAIN_HTML = (() => { try { return execSync('git show 57e831e:index.html', { cwd: __dirname + '/..', maxBuffer: 64 << 20 }).toString(); } catch (_) { return null; } })();
test('h: Home, Inzichten, Vermogen, safeToSpend, het voorstel en lagenGestort zijn gelijk aan 57e831e', async ({ browser }) => {
  test.skip(!MAIN_HTML, '57e831e niet beschikbaar');
  test.setTimeout(120000);
  const lees = async (html) => {
    const page = await browser.newPage(); await page.setViewportSize({ width: 390, height: 844 });
    if (html) await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
    await S.boot(page, { oud: true }); await herlaad(page);   // aan beide kanten hetzelfde laadpad; op 57e831e bestaat de migratie niet
    const u = await page.evaluate(() => { const re = /-?€\s?[\d.]+(?:,\d{2})?/g, lees = (id) => (document.getElementById(id).innerText.match(re) || []), u = {};
      go('dash'); renderDash(); u.home = lees('s-dash'); go('ins'); renderIns(); u.ins = lees('s-ins'); go('vermogen'); renderVermogen(); u.verm = lees('s-vermogen');
      const P = rekVoorstel(), G = lagenGestort(); u.f = { safe: safeToSpend().safe, P: P.ok ? [P.opzij, P.reserveringen, P.rek.map((r) => [r.acc, Math.round(r.laten)])] : null, G: G ? G.lagen.map((l) => [l.k, l.plan, l.gestort]) : null, nw: netWorth() };
      u.nf = +SET.nfToegewezen; return u; });
    await page.close(); return u; };
  const oud = await lees(MAIN_HTML), nu = await lees(null);
  expect([oud.nf, nu.nf]).toEqual([3326, 2927]);   // invoer: de twee kanten verschillen werkelijk in de toewijzing
  for (const k of ['home', 'ins', 'verm', 'f']) expect(JSON.stringify(nu[k]), k).toBe(JSON.stringify(oud[k]));
});
