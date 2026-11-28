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
test('h: Home, Vermogen, safeToSpend, het voorstel en lagenGestort zijn gelijk aan 57e831e (Inzichten sinds v527 niet)', async ({ browser }) => {
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
  /* v527: Inzichten draagt in de periode drie tegels in plaats van de periodekaart (bewust anders dan 57e831e); dat deel wordt afgedrukt en
     niet vergeleken. Home, Vermogen, safeToSpend, het voorstel en lagenGestort blijven gelijk. */
  if (JSON.stringify(nu.ins) !== JSON.stringify(oud.ins)) console.log('v527 Inzichten', JSON.stringify({ oud: oud.ins, nu: nu.ins }));
  for (const k of ['home', 'verm', 'f']) expect(JSON.stringify(nu[k]), k).toBe(JSON.stringify(oud[k]));
});

/* punt 7: het label "deze periode EUR X nodig · EUR Y gestort" bij Reserveren staat er alleen als er iets afwijkt */
const S4 = require('./onderhoud4-stand');
const flag = (page, weg) => page.evaluate(({ RESV, weg }) => {
  if (weg != null) { TX = TX.filter((t) => !(t.acc === RESV && t.amount > 0 && String(t.date).slice(0, 10) === '2026-11-27')); if (weg > 0) { const t = { id: 'o5f' + weg, date: '2026-11-27', amount: weg, acc: RESV, name: 'Salarisrekening', desc: 'Overboeking van Salarisrekening', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); }
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} }
  go('vooruit'); renderVooruit(); const e = document.querySelector('#s-vooruit [data-reserverenflag]');
  return { e: e ? [+e.dataset.reserverenflag, +e.dataset.reservergestort, e.innerText] : null, nodig: Math.round(resInlegPerMaand().bedrag || 0), komt: lagenOverboekMoment().komt }; }, { RESV: S4.RESV, weg });
test('i (punt 7): Reserveren draagt het label alleen bij een afwijking', async ({ page }) => {
  await S4.boot(page);
  const gehaald = await flag(page);
  expect(gehaald.nodig).toBe(36);                  // invoer: EUR 36 nodig, EUR 36 gestort op 27 nov
  expect(gehaald.e).toBe(null);
  expect(gehaald.komt).toBe(false);                // invoer: de werkdagen-grens is voorbij
  const niets = await flag(page, 0);
  expect(niets.e).toEqual([36, 0, 'deze periode €36 nodig · €0 gestort']);
  const deels = await flag(page, 20);
  expect(deels.e).toEqual([36, 20, 'deze periode €36 nodig · €20 gestort']);
});
test('i2 (punt 7): niets gestort terwijl het moment nog komt is geen afwijking', async ({ page }) => {
  await S4.boot(page);
  const r = await page.evaluate(({ RESV }) => { TX = TX.filter((t) => !(t.acc === RESV && t.amount > 0 && String(t.date).slice(0, 10) === '2026-11-27')); save(); try { runMemoVergeten(); } catch (_) {}
    const echt = lagenOverboekMoment; window.lagenOverboekMoment = () => Object.assign({}, echt(), { komt: true });   // de dag voor de grens
    go('vooruit'); renderVooruit(); const e = document.querySelector('#s-vooruit [data-reserverenflag]'); window.lagenOverboekMoment = echt; return !!e; }, { RESV: S4.RESV });
  expect(r).toBe(false);
});

/* punt 8 en 9: de stand van de melding (v526, 27 nov, na de aanvullingen) op onderhoud4-stand: verdeling 100/1.750/1.700/36/1.630,
   uit het salaris Betaalrekening 1.500, Leefgeld 1.720, spaarrekening 2.500; daarna van de spaarrekening EUR 250 naar Betaalrekening,
   EUR 20 naar Leefgeld en EUR 93 naar Salarisrekening (alle drie "Aanvulling, niet terugzetten"), en EUR 36 als verschuiving naar
   Reserveringen (keuze nee). GECONSTRUEERD naar de getallen van de melding. */
async function stand9(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await S4.boot(page);
  await page.evaluate(({ BET, LEEF, MAIN, SPAAR, RESV }) => {
    TX = TX.filter((t) => String(t.date).slice(0, 10) !== '2026-11-27' && !(t.acc === SPAAR && Math.round(t.amount) === -1000) && !(t.acc === RESV && Math.round(t.amount) === 1000));
    const add = (acc, d, a, n) => { const t = { id: 'o5w' + acc.slice(-4) + d + Math.round(Math.abs(a) * 100) + (a < 0 ? 'u' : 'i'), date: d, amount: a, acc, name: n, desc: n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    const over = (van, naar, d, b, n1, n2) => [add(van, d, -b, 'From ' + n1 + ' to ' + n2), add(naar, d, b, 'From ' + n1 + ' to ' + n2)];
    const a3 = over(SPAAR, BET, '2026-11-26', 250, 'Buffer Rust', 'Betaalrekening')[0], a2 = over(SPAAR, LEEF, '2026-11-26', 20, 'Buffer Rust', 'Leefgeld')[0], a1 = over(SPAAR, MAIN, '2026-11-26', 93, 'Buffer Rust', 'Salarisrekening')[0];
    const vs = over(SPAAR, RESV, '2026-11-26', 36, 'Buffer Rust', 'Reserveringen')[0];
    window.__o9 = { a1: a1.id, a2: a2.id, a3: a3.id, vs: vs.id };
    SET.verschuiving = { [vs.id]: { kant: 'reserveren', keuze: 'nee' } }; delete SET.nfAfgetrokken;
    SET.opnameBron = { [a1.id]: { bron: 'aanvulling', af: 0 }, [a2.id]: { bron: 'aanvulling', af: 0 }, [a3.id]: { bron: 'aanvulling', af: 0 } };
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
  }, { BET: S4.BET, LEEF: S4.LEEF, MAIN: S4.MAIN, SPAAR: S4.SPAAR, RESV: S4.RESV });
}
const lagenSheet = (page) => page.evaluate(() => { go('maand'); openGripLagen(); const sh = document.getElementById('gripLagenSheet');
  const T = lagenTegelData(), G = lagenGestort();
  return { tekst: sh.innerText, netto: sh.querySelector('[data-gestortnetto]') && +sh.querySelector('[data-gestortnetto]').dataset.gestortnetto,
    rijen: [...sh.querySelectorAll('[data-waaromrij]')].map((e) => ({ typ: e.dataset.waaromrij, v: +e.dataset.v, vx: +e.dataset.vexact, t: e.innerText.replace(/\s+/g, ' ') })),
    totaal: sh.querySelector('[data-waaromtotaal]') && +sh.querySelector('[data-waaromtotaal]').dataset.waaromtotaal,
    besch: (() => { const r = sh.querySelector('[data-lagenrij="beschermen"]'); if (!r) return null; const sp = [...r.children]; const box = sp.map((e) => e.getBoundingClientRect());
      const naam = r.querySelector('b').getBoundingClientRect();
      const overlap = r.scrollWidth > r.clientWidth + 0.5 || sp.some((e) => e.scrollWidth > e.clientWidth + 0.5) || box.slice(1).some((y) => naam.right > y.left + 0.5 && naam.bottom > y.top + 0.5 && y.bottom > naam.top + 0.5)
        || box.some((x, i) => box.some((y, j) => j > i && x.right > y.left + 0.5 && y.right > x.left + 0.5 && x.bottom > y.top + 0.5 && y.bottom > x.top + 0.5));
      const na = r.querySelector('[data-naaanvulling]');
      return { stand: r.dataset.stand, t: r.innerText.replace(/\s+/g, ' '), na: na && na.innerText, overlap, amber: [...r.querySelectorAll('span')].some((s) => /amber/.test(s.getAttribute('style') || '')) }; })(),
    opzij: T.opzij, gnetto: G.netto, meer: G.meer, lagen: T.lagen.map((l) => [l.k, l.stand]) }; });

test('j (punt 8): Naar je lagen en Waarom staan in het Lagen-sheet op Grip en niet op Plan; Plan houdt de stand', async ({ page }) => {
  await stand9(page);
  const plan = await page.evaluate(() => { go('vooruit'); renderVooruit(); const e = document.getElementById('s-vooruit');
    return { t: e.innerText, gestort: !!e.querySelector('#planGestort,#lagenGestort,[data-gestortnetto],[data-waaromrij],[data-gestortbijsturen]'), lagen: !!e.querySelector('#planLagen,[data-laag]') }; });
  expect(plan.t).not.toContain('Naar je lagen');
  expect(plan.t).not.toMatch(/Waarom €[\d.]+ (meer|minder) opzij/);
  expect(plan.t).not.toContain('Bijsturen op Grip');
  expect(plan.gestort).toBe(false);
  expect(plan.t).toContain('PER LAAG · STAND');   // de stand blijft op Plan
  const sh = await lagenSheet(page);
  expect(sh.tekst).toContain('Naar je lagen · €2.137 netto gestort (€2.500 erin, €363 eruit), plan €1.630');
  expect(sh.tekst).toMatch(/WAAROM €507 MEER OPZIJ/i);
  expect((sh.tekst.match(/plan €1\.630/g) || []).length).toBe(2);   // de tabel per laag een keer (Beschermen) en de netto-regel; geen tweede tabel
  expect(await page.evaluate(() => typeof planBlokToggle === 'undefined' && typeof planGestortKaart === 'undefined')).toBe(true);   // de dichtklap-regels zijn weg
});

test('k (punt 9a): het groene getal van de tegel Lagen is netto opzij, EUR 2.137', async ({ page }) => {
  await stand9(page);
  const r = await page.evaluate(() => { go('maand'); gripKiesTab('zien'); closeSheet(); const e = document.querySelector('#gripMeters [data-meter="lagen"] [data-lagenopzij]'); return { v: e && +e.dataset.lagenopzij, t: e && e.innerText, n: lagenGestort().netto }; });
  expect(r.n).toBe(2137);
  expect(r).toMatchObject({ v: 2137, t: '€2.137 opzij' });
});

test('l (punt 9b): Beschermen na de aanvulling: geen "nog niet", geen tekortkleur, "EUR 1.989 · na aanvulling EUR 1.626"', async ({ page }) => {
  await stand9(page);
  const sh = await lagenSheet(page);
  expect(sh.besch.stand).toBe('gehaald');   // het oordeel kijkt naar de storting (EUR 1.989 tegen plan EUR 1.630)
  expect(sh.besch.t).not.toContain('nog niet');
  expect(sh.besch.na).toBe('€1.989 gestort · na aanvulling €1.626');
  expect(sh.besch.t).toContain('plan €1.630 €1.989');
  expect(sh.besch.overlap).toBe(false);   // gemeten op de schermafdruk: in de rechterkolom liep de tekst op 390px over het plan heen
  expect(sh.besch.amber).toBe(false);
  /* de werkdagen-grens komt nog (zoals op het toestel: salaris 25 nov), maar de storting is binnen: ook dan geen "nog niet" */
  const vroeg = await page.evaluate(() => { const echt = lagenOverboekMoment; window.lagenOverboekMoment = () => Object.assign({}, echt(), { komt: true });
    for (const k of ['a1', 'a2', 'a3']) SET.opnameBron[window.__o9[k]] = { bron: 'noodfonds' }; save(); try { runMemoVergeten(); } catch (_) {}
    const T = lagenTegelData(); window.lagenOverboekMoment = echt; for (const k of ['a1', 'a2', 'a3']) SET.opnameBron[window.__o9[k]] = { bron: 'aanvulling', af: 0 }; save();
    return T.lagen.find((l) => l.k === 'beschermen').stand; });
  expect(vroeg).toBe('tekort');   // EUR 1.626 tegen EUR 1.630 met de opnames uit je noodfonds: een tekort, geen "nog niet"
  /* zonder aanvulling (de opname uit het noodfonds) blijft het een tekort, en het moment is voorbij omdat de storting binnenkwam */
  await page.evaluate(() => { for (const k of ['a1', 'a2', 'a3']) SET.opnameBron[window.__o9[k]] = { bron: 'noodfonds' }; save(); try { runMemoVergeten(); } catch (_) {} });
  const sh2 = await lagenSheet(page);
  expect(sh2.besch.stand).toBe('tekort');
  expect(sh2.besch.amber).toBe(true);
  expect(sh2.besch.t).not.toContain('nog niet');
});

test('m (punt 9c): Waarom noemt per overboeking de ontvangende rekening, de salarisrekening alleen haar eigen minder, en sluit op EUR 507', async ({ page }) => {
  await stand9(page);
  const sh = await lagenSheet(page);
  expect(sh.meer).toBe(507); expect(sh.totaal).toBe(507);
  const t = (typ) => sh.rijen.filter((r) => r.typ === typ);
  expect(t('terug')[0].t).toContain('Betaalrekening €250 · Leefgeld €20 · Salarisrekening €93');
  expect(t('terug')[0].v).toBe(-363);
  expect(t('salrek').map((r) => r.v)).toEqual([93]);   // EUR 7 van de afgesproken EUR 100 bleef uit je salaris; de EUR 93 van de opname telt niet als "hield over"
  expect(sh.rijen.find((r) => /Reserveringen kregen €0 uit je salaris/.test(r.t)).v).toBe(36);   // de verschuiving van EUR 36 is geen geld uit je salaris
  expect(sh.rijen.reduce((a, r) => a + r.v, 0)).toBe(507);
  expect(Math.round(sh.rijen.reduce((a, r) => a + r.vx, 0) * 100) / 100).toBe(507);
  expect(t('gat')).toEqual([]);
  /* sluit hij niet, dan een regel "niet te verklaren uit je boekingen" met het verschil */
  await page.evaluate(({ BET }) => { const t = { id: 'o5x', date: '2026-11-26', amount: -40, acc: BET, name: 'Iets', desc: 'Iets', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); SET.salVerdeling.opzij = 1600; save(); try { runMemoVergeten(); } catch (_) {} }, { BET: S4.BET });
  const sh2 = await lagenSheet(page);
  const g = sh2.rijen.filter((r) => r.typ === 'gat');
  expect(g.length).toBe(1);
  expect(sh2.rijen.reduce((a, r) => a + r.v, 0)).toBe(sh2.meer);
});
