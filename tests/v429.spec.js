/* v429: GRIP-CYCLUS FASE 2, VAN SYMPTOOM NAAR OORZAAK (gevraagd door de gebruiker, mockup "Grip compleet v423": Vices-hypotheses,
   vraag, bevestigd, testweek). Geen gedragskeuze zonder oorzaak; Begrijpen verandert geen budget, het enige wat je daar doet is
   een oorzaakvraag beantwoorden. Op de stand van v428 (v421-stand, 10 oktober 2026, GECONSTRUEERD: de boekingen van het toestel
   staan alleen daar). */
const { test, expect } = require('@playwright/test');
const V = require('./v428-boot');
const { MAIN } = require('./v421-stand');
const tab = (page, t) => page.evaluate(t => { gripKiesTab(t); return document.querySelector('#gripInhoud').dataset.griptabinhoud; }, t);
const add = (page, rij) => page.evaluate(({ MAIN, rij }) => {
  for (const [d, a, n, ds, c] of rij) { const t = { id: 'v429' + d + n + a + (ds || ''), date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); }
  TX.sort((a, b) => a.date.localeCompare(b.date)); applyOwnAccounts(); buildAccMeta(); save(); renderMaand(); }, { MAIN, rij });
const X = (page, sid) => page.evaluate(sid => { const C = gripCyclusLees(), x = C.OV.A[sid]; return x ? { stand: x.stand, oorzaken: x.oorzaken.map(o => [o.soort, o.label]), bev: x.bevestigd.map(b => [b.soort, b.bron]), eenmaligEnkel: x.eenmaligEnkel, toets: Object.fromEntries(x.toetsen.map(t => [t.soort, t.vuurt])) } : null; }, sid);
/* een synthetisch symptoom op potje k (dezelfde analyse als een echt symptoom: oorzaakAnalyse leest alleen s.k, s.p en s.id) */
const ana = (page, k) => page.evaluate(k => { const x = oorzaakAnalyse({ id: 'test:' + k, k, naam: k }, maandVooruit()); return { oorzaken: x.oorzaken.map(o => [o.soort, o.label, o.bewijs]), toets: Object.fromEntries(x.toetsen.map(t => [t.soort, [t.vuurt, t.vuurt ? t.bewijs : t.niet]])), bev: x.bevestigd.map(b => [b.soort, b.bron]) }; }, k);

test.describe('v429 · 0. opruimen', () => {
  test('0a. een bedrag dat jij als eenmalig bevestigde telt niet voor een symptoom; het blijft onder Grote uitgaven zonder potje', async ({ page }) => {
    await V.boot(page);
    const voor = await page.evaluate(() => gripCyclusLees().sym.map(s => s.id));
    expect(voor).toContain('lo:eenmalig:zorg');   // invoermeting: zonder bevestiging een symptoom
    await page.evaluate(() => { const t = TX.find(x => catOf(x) === 'zorg' && x.amount === -159); SET.kennis = Object.assign({}, SET.kennis, { ['eenmalig|' + t.id]: { soort: 'eenmalig', partij: 'Lausa Eriksson', wat: 'Zorgkosten', aard: 'eenmalig', bron: 'jij', op: '2026-10-09', tx: [t.id] } }); save(); renderMaand(); });
    const r = await page.evaluate(() => { const t = TX.find(x => catOf(x) === 'zorg' && x.amount === -159); return { sym: gripCyclusLees().sym.map(s => s.id), bev: eenmaligBevestigd(t), blok: benoemBegrijpenBlok().includes(t.id) }; });
    expect(r.bev).toBe('door jou: eenmalig');
    expect(r.sym).not.toContain('lo:eenmalig:zorg');   // niets meer boven de drempel: het symptoom verdwijnt
    expect(r.blok).toBe(true);
    /* de drie routes van "eenmalig door jou" lezen een toets */
    const routes = await page.evaluate(() => { const t = TX.find(x => catOf(x) === 'zorg' && x.amount === -159), K = SET.kennis; SET.kennis = {}; const leeg = eenmaligBevestigd(t);
      SET.eenmaligOk = { [t.id]: { op: '2026-10-10' } }; const ok = eenmaligBevestigd(t); SET.eenmaligOk = {}; SET.kennis = K; return { leeg, ok }; });
    expect(routes).toEqual({ leeg: '', ok: 'eenmalig bevestigd' });
    expect(await page.evaluate(() => diagOorzaken().join('\n'))).toContain('symptoom alleen uit een als eenmalig bevestigd bedrag (alle soorten): geen');   // v430
  });
  test('0b. "gestopt of uit reservering?" is een gegevensvraag in Zien (wachtrij van 3), geen symptoom', async ({ page }) => {
    await V.boot(page);
    const key = await page.evaluate(() => { const k = recurringSchedule().find(s => s.type === 'fixed' && !(SET.fixDueExcl || {})[s.key] && !uitResKeuze(s.key) && postStatus(s.key).status === 'actief').key; SET.fixDueExcl = Object.assign({}, SET.fixDueExcl, { [k]: { sinds: '2026-09-01' } }); save(); window._gripTab = 'zien'; go('maand'); return k; });
    const r = await page.evaluate(k => { const C = gripCyclusLees(); return { L: C.L.map(x => x.soort), sym: C.sym.some(s => s.id.includes('uitres')), q: gegevensVragen().filter(q => q.soort === 'uitres').map(q => q.key) }; }, key);
    expect(r.q).toContain(key);
    expect(r.L).not.toContain('uitresvraag');
    expect(r.sym).toBe(false);
    await page.evaluate(k => openGegevensVragen('uitres|' + k), key);
    await expect(page.locator(`#gegevensSheet [data-gegevensvraag="uitres"][data-post="${key}"] [data-uitresantw]`)).toHaveCount(2);
    await page.locator(`#gegevensSheet [data-post="${key}"] [data-uitresantw="reservering"]`).click();
    expect(await page.evaluate(k => uitResKeuze(k), key)).toBe('reservering');
    expect(await page.evaluate(k => gegevensVragen().some(q => q.qkey === 'uitres|' + k), key)).toBe(false);
  });
  test('0c. uit een reservering betaald staat in de Terugblik van september onder Eenmalig, en niet onder Grote uitgaven zonder potje', async ({ page }) => {
    await V.boot(page);
    await add(page, [1, 2, 3, 4, 5].map(i => ['2026-09-1' + i, -92.6, 'CJIB Verkeersboetes', 'CJIB VERKEERSBOETES ' + i, 'belasting']));
    await page.evaluate(() => { for (const t of TX.filter(x => /^CJIB/.test(x.name) && x.date.startsWith('2026-09'))) zetUitReservering(t.id, 92.6); save(); });
    await tab(page, 'terugblik');
    const r = await page.evaluate(() => ({ ym: document.querySelector('#gripTerugAfgesloten').dataset.terugafgesloten, res: [...document.querySelectorAll('#gripTerugAfgesloten [data-terugres]')].map(e => e.innerText),
      kop: document.querySelector('#gripTerugAfgesloten [data-terugeenmalig]').innerText, benoem: (() => { const ids = TX.filter(x => /^CJIB/.test(x.name)).map(x => x.id); return ids.some(id => benoemBegrijpenBlok().includes(id)); })() }));
    expect(r.ym).toBe('2026-09');
    expect(r.kop).toContain('Eenmalig, telt niet als gedrag');
    expect(r.res.length).toBe(5);
    for (const t of r.res) expect(t).toContain('uit een reservering betaald');
    expect(r.benoem).toBe(false);   // elk onder BENOEM_MIN (100): niet bij Grote uitgaven zonder potje
  });
});

test.describe('v429 · 1. mogelijke oorzaken per symptoom', () => {
  test('elk symptoom over uitgaven heeft oorzaken met een label, gesorteerd op sterkte, gevoel altijd mogelijk, hooguit 4', async ({ page }) => {
    await V.boot(page);
    const r = await page.evaluate(() => { const C = gripCyclusLees(); return C.sym.map(s => ({ id: s.id, ok: oorzaakSymptoom(s), X: C.OV.A[s.id] ? C.OV.A[s.id].oorzaken.map(o => [o.soort, o.label]) : null })); });
    const met = r.filter(x => x.ok);
    expect(met.length).toBeGreaterThan(4);
    const volg = ['zeker', 'waarschijnlijk', 'mogelijk', 'niet gevraagd'];
    for (const x of met) {
      expect(x.X.length).toBeGreaterThanOrEqual(1); expect(x.X.length).toBeLessThanOrEqual(4);
      expect(x.X.some(o => o[0] === 'gevoel')).toBe(true);
      const sterk = x.X.filter(o => o[1] !== 'niet gevraagd').map(o => volg.indexOf(o[1]));
      expect(sterk).toEqual([...sterk].sort((a, b) => a - b)); }
    /* een melding over je gegevens heeft geen oorzaken */
    for (const x of r.filter(x => !x.ok)) expect(x.X).toBeNull();
    expect(r.filter(x => !x.ok).map(x => x.id)).toEqual(expect.arrayContaining(['lo:contant:']));
  });
  test('budget past niet (v430, R3): >=3 van 4 boven en een mediaan van minstens 1,5x het budget is zeker; anders niet', async ({ page }) => {
    await V.boot(page);
    await add(page, ['2026-06-12', '2026-07-12', '2026-08-12', '2026-09-12'].map((d, i) => [d, -[80, 84, 76, 80][i], 'Kringloop', 'KRINGLOOP WINKEL', 'goededoel']));
    await page.evaluate(() => { SET.budgets = Object.assign({}, SET.budgets, { goededoel: 50 }); save(); });
    const a = await ana(page, 'goededoel');
    expect(a.toets.budget[0]).toBe(true);
    expect(a.bev).toContainEqual(['budget', 'boekingen']);
    expect(a.oorzaken[0][0]).toBe('budget'); expect(a.oorzaken[0][1]).toBe('zeker');
    /* v430: de spreiding telt niet meer (een maand ver buiten de mediaan houdt hem zeker); een mediaan onder 1,5x het budget wel niet */
    await add(page, [['2026-08-20', -60, 'Kringloop Extra', 'KRINGLOOP EXTRA', 'goededoel']]);
    expect((await ana(page, 'goededoel')).toets.budget[0]).toBe(true);
    await page.evaluate(() => { SET.budgets.goededoel = 60; save(); });
    const b = await ana(page, 'goededoel');
    expect(b.toets.budget[0]).toBe(false); expect(b.toets.budget[1]).toMatch(/mediaan €82 is 1,4× je budget/);
  });
  test('verdeling (v430, R2): alleen in de lopende maand is mogelijk, niet zeker; het potje staat in het bewijs', async ({ page }) => {
    await V.boot(page);
    const x = await X(page, 'lo:krap:abonnement');
    expect(x.toets.verdeling).toBe(true);
    expect(x.oorzaken).toContainEqual(['verdeling', 'mogelijk']);
    expect(x.bev).not.toContainEqual(['verdeling', 'boekingen']);
    const bew = await page.evaluate(() => gripCyclusLees().OV.A['lo:krap:abonnement'].toetsen.find(t => t.soort === 'verdeling').bewijs);
    expect(bew).toMatch(/^alleen in okt: Online shopping blijft €\d+ onder budget, tegen €\d+ erboven hier$/);
    expect(x.stand).not.toBe('bevestigd');
  });
  test('eenmalig: een boeking van 50% of meer is waarschijnlijk, en zeker pas als jij hem bevestigt; dan telt het symptoom niet als gedrag', async ({ page }) => {
    await V.boot(page);
    let x = await X(page, 'pat:pot:boodschappen');
    expect(x.oorzaken).toContainEqual(['eenmalig', 'waarschijnlijk']);
    expect(x.bev).toEqual([]);
    await page.evaluate(() => { const t = TX.filter(u => catOf(u) === 'boodschappen' && u.date.startsWith('2026-10')).sort((a, b) => a.amount - b.amount)[0]; SET.eenmaligOk = { [t.id]: { op: '2026-10-10' } }; save(); });
    /* v430 (R4): eenmalig door jou gaat voor alles: zonder dat bedrag is het symptoom leeg en valt het weg, met zijn keuzes */
    x = await X(page, 'pat:pot:boodschappen');
    expect(x).toBeNull();
    const k = await page.evaluate(() => { const C = gripCyclusLees(); return { leeg: C.leeg.map(z => z.id), te: C.kies.filter(y => y.sym === 'pat:pot:boodschappen').length, wacht: C.wacht.filter(y => y.sym === 'pat:pot:boodschappen').length }; });
    /* v453: het label eenmalig zet de boeking buiten vast en potjes (geenNormTx), dus het symptoom ontstaat niet eens meer en hoeft niet
       als weggevallen te staan; geen keuze, telt niet als gedrag */
    expect(k).toEqual({ leeg: [], te: 0, wacht: 0 });
  });
  test('salaris-effect: de helft of meer in de 7 dagen na je salaris, in 2 van 3 maanden', async ({ page }) => {
    await V.boot(page);
    const dag = await page.evaluate(() => oorzaakSalarisDag('2026-09'));
    expect(dag).toBeTruthy();
    const plus = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    await add(page, [['2026-07-' + dag.slice(8), 5216, 'Skf', 'SKF SALARIS'], ['2026-08-' + dag.slice(8), 5216, 'Skf', 'SKF SALARIS']]);
    const rij = [];
    for (const ym of ['2026-07', '2026-08', '2026-09']) { const d = ym + '-' + dag.slice(8); rij.push([plus(d, 1), -60, 'Zara', 'ZARA ' + ym, 'goededoel'], [plus(d, 3), -40, 'H en M', 'HM ' + ym, 'goededoel'], [ym + '-03', -20, 'Primark', 'PRIMARK ' + ym, 'goededoel']); }
    await add(page, rij);
    const a = await ana(page, 'goededoel');
    expect(a.toets.salaris[0]).toBe(true);
    expect(a.toets.salaris[1]).toMatch(/in 3 van de 3 maanden/);
    expect(a.oorzaken.find(o => o[0] === 'salaris')[1]).toBe('waarschijnlijk');
  });
  test('gewoonte: minstens 8 aankopen per maand onder EUR 15, met de dagdelen in het bewijs; gelegenheid bij 40% op een partij', async ({ page }) => {
    await V.boot(page);
    const rij = [];
    for (const ym of ['2026-07', '2026-08', '2026-09']) for (let i = 1; i <= 9; i++) { const d = `${ym}-${String(i * 3).padStart(2, '0')}`, hh = i <= 6 ? 21 : 13;
      rij.push([d, -6, 'Coffeeshop Noord', `BEA, BETAALPAS COFFEESHOP NOORD,PAS123 NR:${i}, ${d.slice(8)}.${d.slice(5, 7)}.26/${hh}:15`, 'vices']); }
    await add(page, rij);
    const a = await ana(page, 'vices');
    expect(a.toets.gewoonte[0]).toBe(true);
    expect(a.toets.gewoonte[1]).toMatch(/ochtend 0 · middag \d+ · 17–20 0 · 20–23 \d+ · nacht 0/);
    expect(a.toets.gelegenheid[0]).toBe(true);
    expect(a.oorzaken.find(o => o[0] === 'gewoonte')[1]).toBe('waarschijnlijk');
    expect(a.oorzaken.find(o => o[0] === 'gelegenheid')[1]).toBe('mogelijk');
    expect(a.oorzaken.find(o => o[0] === 'gevoel')[1]).toBe('mogelijk');
    /* geen werk- of kantoordagen */
    expect(await page.evaluate(() => /werkdag|kantoordag|weekdag/i.test(String(oorzaakAnalyse)))).toBe(false);
  });
  test('gewoonte vuurt niet bij 6 kleine aankopen per maand (de drempel is 8, niet de helft)', async ({ page }) => {
    await V.boot(page);
    const rij = [];
    for (const ym of ['2026-07', '2026-08', '2026-09']) for (let i = 1; i <= 6; i++) { const d = `${ym}-${String(i * 4).padStart(2, '0')}`;
      rij.push([d, -5, 'Kiosk Zuid ' + i, `KIOSK ZUID ${i}`, 'goededoel']); }
    await add(page, rij);
    const a = await ana(page, 'goededoel');
    expect(a.toets.gewoonte[0]).toBe(false);   // invoer: 6 per maand, onder EUR 15; tussen 4 en 8 onderscheidt de drempel
  });
});

test.describe('v429 · 2. een vraag per symptoom', () => {
  test('wat past het best?: de oorzaken in gewone taal plus Weet ik niet, niets voorgekozen; bevestigen schrijft in SET.kennis met bron door jou', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => gripNaarSymptoom('pat:pot:vices'));
    const v = page.locator('#gripSymptoom [data-oorzaakvraag]');
    await expect(v).toHaveCount(1);
    expect(await v.locator('[data-vraagoptie]').evaluateAll(e => e.map(x => x.dataset.vraagoptie))).toEqual(['gelegenheid', 'gevoel', 'weetniet', 'nietklopt']);   // v430 (R1): "Dit patroon klopt niet" hoort bij de ene vraag
    expect(await v.locator('[data-vraagbevestig]').isDisabled()).toBe(true);
    const budget0 = await page.evaluate(() => JSON.stringify(SET.budgets));
    await v.locator('[data-vraagoptie="gevoel"]').click();
    expect(await page.evaluate(() => kennisGet('oorzaak|cat:vices'))).toBeNull();   // kiezen schrijft niets
    await page.locator('#gripSymptoom [data-vraagbevestig]').click();
    const E = await page.evaluate(() => kennisGet('oorzaak|cat:vices'));
    expect(E).toMatchObject({ soort: 'oorzaak', aard: 'gevoel', bron: 'jij', op: '2026-10-10', symId: 'pat:pot:vices' });
    expect(await page.evaluate(() => JSON.stringify(SET.budgets))).toBe(budget0);   // Begrijpen verandert geen budget
    await expect(page.locator('#gripSymptoom [data-bevestigd="gevoel"]')).toHaveCount(1);
    expect(await page.locator('#gripSymptoom [data-bevestigd="gevoel"]').innerText()).toContain('door jou · 10 okt');
    /* zichtbaar en te wijzigen in Wat Minder van jou weet */
    const L = await page.evaluate(() => kennisLijst().filter(x => x.soort === 'oorzaak').map(x => [x.groep, x.partij, x.bron]));
    expect(L).toEqual([['oorzaak', 'Vices', 'jij']]);
    await page.evaluate(() => kennisWijzig('k:oorzaak|cat:vices'));
    expect(await page.evaluate(() => kennisGet('oorzaak|cat:vices'))).toBeNull();
    await expect(page.locator('#gripSymptoom [data-oorzaakvraag]')).toHaveCount(1);   // de vraag staat er weer, op zijn eigen plek
  });
  test('hooguit 3 vragen per kalendermaand over alle symptomen; daarna "volgende vraag in november"', async ({ page }) => {
    await V.boot(page);
    const st = await page.evaluate(() => Object.values(gripCyclusLees().OV.A).map(x => [x.s.id, x.stand]));
    expect(st.filter(x => x[1] === 'vraag').length).toBe(3);
    const later = st.find(x => x[1] === 'later')[0];
    for (const sid of ['pat:pot:uiteten', 'pat:pot:vices', 'pat:pot:boodschappen']) await page.evaluate(sid => { oorzaakKies(sid, 'gevoel'); oorzaakBevestig(sid); }, sid);
    expect(await page.evaluate(() => SET.oorzaakVragen['2026-10'].length)).toBe(3);
    await page.evaluate(sid => gripNaarSymptoom(sid), later);
    expect(await page.locator('#gripSymptoom [data-oorzaakvraag]').count()).toBe(0);
    expect(await page.locator('#gripSymptoom [data-oorzaaklater]').innerText()).toContain('volgende vraag in november');
    expect(await page.evaluate(() => diagOorzaken().join('\n'))).toContain('oorzaakvragen deze maand 3 <= 3: ja');
    /* volgende maand is er weer plek */
    expect(await page.evaluate(() => oorzaakGevraagd('2026-11').length)).toBe(0);
  });
});

test.describe('v429 · 3. testweek', () => {
  test('Weet ik niet start een testweek van 7 dagen op het potje; een aankoop via de koopknop krijgt een tik, bankboekingen staan om na te tikken (hooguit 5)', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { oorzaakKies('pat:pot:uiteten', 'weetniet'); oorzaakBevestig('pat:pot:uiteten'); gripNaarSymptoom('pat:pot:uiteten'); });
    expect(await page.evaluate(() => SET.testweek['cat:uiteten'])).toMatchObject({ k: 'uiteten', start: '2026-10-10' });
    expect(await page.locator('#gripSymptoom [data-testweek]').innerText()).toContain('Testweek: nog 7 dagen');
    /* de koopknop */
    const T = await page.evaluate(() => { coBuyLog('broodje', 12, 'uiteten', 'gepland', 'n.v.t.'); return SET.testweek['cat:uiteten'].koop; });
    expect(T.length).toBe(1);
    await expect(page.locator('#testweekTik [data-gevoel]')).toHaveCount(5, { timeout: 3000 });
    expect(await page.locator('#testweekTik').innerText()).toContain('Hoe voelde je je net?');
    expect(await page.locator('#testweekTik [data-gevoel]').evaluateAll(e => e.map(x => x.innerText))).toEqual(['gewoon', 'trek', 'gestrest of moe', 'gezellig met anderen', 'beloning']);
    await page.locator('#testweekTik [data-gevoel="moe"]').click();
    expect(await page.evaluate(id => SET.testweek['cat:uiteten'].antw[id], T[0].id)).toBe('moe');
    /* een andere uitkomst van de koopcheck (geparkeerd) vraagt niets */
    expect(await page.evaluate(() => { coBuyLog('x', 5, 'uiteten', 'geparkeerd', 'nu'); return SET.testweek['cat:uiteten'].koop.length; })).toBe(1);
    /* bankboekingen in die week, niet via de koopknop: hooguit 5 */
    await add(page, [1, 2, 3, 4, 5, 6, 7].map(i => ['2026-10-10', -(8 + i), 'Cafe Week ' + i, 'CAFE WEEK ' + i, 'uiteten']));
    await page.evaluate(() => gripNaarSymptoom('pat:pot:uiteten'));
    expect(await page.locator('#gripSymptoom [data-natik]').count()).toBe(5);
  });
  test('na 7 dagen: 4 tikken of meer en 60% hetzelfde geeft een voorstel; bevestigen heeft bron "voorstel, door jou bevestigd"', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { SET.oorzaakVragen = { '2026-10': ['cat:uiteten'] }; SET.testweek = { 'cat:uiteten': { k: 'uiteten', sym: 'pat:pot:uiteten', naam: 'Uit eten', start: '2026-10-01', koop: [], antw: { a: 'moe', b: 'moe', c: 'moe', d: 'gewoon' } } }; save(); gripNaarSymptoom('pat:pot:uiteten'); });
    expect(await page.locator('#gripSymptoom [data-testweekvoorstel]').innerText()).toContain('Lijkt op: gevoel – bij spanning');
    await page.locator('#gripSymptoom [data-voorstelja]').click();
    expect(await page.evaluate(() => kennisGet('oorzaak|cat:uiteten'))).toMatchObject({ aard: 'gevoel', detail: 'bij spanning', bron: 'bevestigd' });
    expect(await page.evaluate(() => KENNIS_BRON[kennisGet('oorzaak|cat:uiteten').bron])).toBe('voorstel, door jou bevestigd');
  });
  test('geen duidelijk patroon (minder dan 4 tikken, of minder dan 60%): de vraag vervalt tot volgende maand', async ({ page }) => {
    await V.boot(page);
    for (const antw of [{ a: 'moe', b: 'moe', c: 'moe' }, { a: 'moe', b: 'moe', c: 'gewoon', d: 'trek', e: 'samen' }]) {
      await page.evaluate(antw => { SET.oorzaakVragen = { '2026-10': ['cat:uiteten'] }; SET.testweek = { 'cat:uiteten': { k: 'uiteten', sym: 'pat:pot:uiteten', naam: 'Uit eten', start: '2026-10-01', koop: [], antw } }; save(); gripNaarSymptoom('pat:pot:uiteten'); }, antw);
      expect(await page.locator('#gripSymptoom [data-oorzaakvervallen]').innerText()).toContain('geen duidelijk patroon');
      expect(await page.locator('#gripSymptoom [data-oorzaakvervallen]').innerText()).toContain('komt terug in nov');
      expect(await page.locator('#gripSymptoom [data-oorzaakvraag]').count()).toBe(0); }
  });
});

test.describe('v429 · 4. Kiezen: alleen keuzes met een oorzaak', () => {
  test('zonder oorzaak staat een gedragskeuze onder Wacht op oorzaak, met "bepaal oorzaak ›"; gegevenskeuzes blijven onder Te kiezen; N telt alleen Te kiezen', async ({ page }) => {
    await V.boot(page);
    const C = await page.evaluate(() => { const C = gripCyclusLees(); return { te: C.kies.map(x => x.id), wacht: C.wacht.map(x => x.id), wsym: C.wachtSym.map(w => w.sym) }; });
    expect(C.wacht).toEqual(expect.arrayContaining(['pat:pot:vices', 'pat:pot:uiteten']));
    expect(C.te).not.toContain('pat:pot:vices');
    expect(C.te).toEqual(expect.arrayContaining(['lo:zonderpot:e_kinderen', 'lo:eenmalig:zorg']));   // potje maken, eenmalig: gegevens
    await tab(page, 'kiezen');
    const n = await page.evaluate(() => ({ te: document.querySelectorAll('#gripTeKiezen [data-kies]').length, kop: +document.querySelector('[data-tekiezen]').dataset.tekiezen, w: document.querySelectorAll('#gripWachtOorzaak [data-wachtoorzaak]').length }));
    expect(n.te).toBe(C.te.length); expect(n.kop).toBe(C.te.length); expect(n.w).toBe(C.wsym.length);
    await page.evaluate(() => gripKiesTab('zien'));
    expect(+(await page.getAttribute('[data-keuzesopen]', 'data-keuzesopen'))).toBe(C.te.length);
    await tab(page, 'kiezen');
    await page.locator('#gripWachtOorzaak [data-wachtoorzaak="pat:pot:vices"] [data-bepaaloorzaak]').click();
    expect(await page.getAttribute('#gripInhoud', 'data-griptabinhoud')).toBe('begrijpen');
    expect(await page.getAttribute('#gripSymptoom', 'data-symdrill')).toBe('pat:pot:vices');
  });
  test('met een bevestigde oorzaak: de keuze per oorzaak onder Te kiezen met het gevolg vooraf; bevestigen zet hem onder Al gekozen', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { oorzaakKies('pat:pot:vices', 'gevoel'); oorzaakBevestig('pat:pot:vices'); });
    const C = await page.evaluate(() => { const C = gripCyclusLees(); return { te: C.kies.filter(x => x.sym === 'pat:pot:vices').map(x => [x.id, x.naam, x.oorzaak || x.reden]), wacht: C.wacht.filter(x => x.sym === 'pat:pot:vices').length }; });
    expect(C.wacht).toBe(0);
    expect(C.te.map(x => x[0])).toEqual(expect.arrayContaining(['oorz:cat:vices:gevoel', 'pat:pot:vices']));
    expect(C.te.find(x => x[0] === 'oorz:cat:vices:gevoel')[1]).toBe('Vices bij spanning: eerst 10 minuten');
    expect(C.te.find(x => x[0] === 'pat:pot:vices')[2]).toContain('oorzaak: gevoel · door jou');
    /* naar keuze ›: Kiezen op die keuze, zonder iets te veranderen */
    /* renderen schrijft al sinds v314 de valt-op-log en de stap-datum; wat "niets veranderen" hier betekent is je budget, je
       antwoorden, je afspraken en je keuzes */
    const stand = () => page.evaluate(() => JSON.stringify(['budgets', 'budgetsNext', 'kennis', 'afspraken', 'testweek', 'oorzaakVragen', 'gripKeuze'].map(k => SET[k])));
    const voor = await stand();
    await page.evaluate(() => gripNaarSymptoom('pat:pot:vices'));
    await page.locator('#gripSymptoom [data-naarkeuze]').click();
    expect(await page.getAttribute('#gripInhoud', 'data-griptabinhoud')).toBe('kiezen');
    expect(await page.locator('#gripTeKiezen [data-kiesfocus]').count()).toBe(1);
    expect(await stand()).toBe(voor);
    /* het gevolg vooraf, dan bevestigen */
    await page.evaluate(() => openOorzaakAfspraak('cat:vices', 'gevoel'));
    expect(await page.locator('#oorzaakAfspraak [data-afspraakgevolg]').innerText()).toContain('blijven gelijk');
    expect(await page.evaluate(() => afsprakenLijst().length)).toBe(0);
    await page.locator('#oorzaakAfspraak [data-afspraakbevestig]').click();
    const A = await page.evaluate(() => afsprakenLijst().map(a => [a.soort, a.oorzaak, a.key]));
    expect(A).toEqual([['gedrag', 'gevoel', 'oorz:cat:vices']]);
    const D = await page.evaluate(() => { const C = gripCyclusLees(); return { te: C.kies.some(x => x.id === 'oorz:cat:vices:gevoel'), gek: C.gekozenO.map(x => x.id) }; });
    expect(D).toEqual({ te: false, gek: ['oorz:cat:vices:gevoel'] });
  });
  test('budget past niet geeft budget herzien, verdeling geeft budget verschuiven tussen de twee potjes', async ({ page }) => {
    await V.boot(page);
    /* v430 (R2): verdeling geeft pas een keuze als hij zeker is (hetzelfde potje in 3 van de 4 maanden) */
    await page.evaluate(() => { SET.budgetHist = {}; for (const ym of ['2026-06', '2026-07', '2026-08', '2026-09']) SET.budgetHist[ym] = Object.assign({}, SET.budgets, { uiteten: 1000 }); save(); });
    const k = await page.evaluate(() => { const x = oorzaakAnalyse({ id: 'test:vices', k: 'vices', naam: 'Vices' }, maandVooruit()); return oorzaakKeuzes(x).find(o => o.soort === 'verdeling'); });
    expect(k.act).toBe("openPotjeBijstel('vices','uiteten')");
    expect(k.naam).toBe('Vices: budget verschuiven van Uit eten & café');
    await add(page, ['2026-06-12', '2026-07-12', '2026-08-12', '2026-09-12', '2026-10-05'].map((d, i) => [d, -[80, 84, 76, 80, 80][i], 'Kringloop', 'KRINGLOOP WINKEL', 'goededoel']));
    await page.evaluate(() => { SET.budgets = Object.assign({}, SET.budgets, { goededoel: 50 }); save(); });
    const b = await page.evaluate(() => { const x = oorzaakAnalyse({ id: 'test:kleding', k: 'goededoel', naam: 'Kleding' }, maandVooruit()); return oorzaakKeuzes(x).map(o => [o.soort, o.naam]); });
    expect(b).toContainEqual(['budget', 'Goede doelen: budget naar €80']);   // v430 (R3): naar de mediaan
    /* verdeling is hier ook zeker, en dat sluit de vraag: dan wacht er geen "minder uitgeven" (v430.spec R3b toetst die zonder) */
    expect(b.map(x => x[0])).not.toContain('minder');
  });
});

test.describe('v429 · 5. blok 22', () => {
  test('per symptoom de toetsen met de getallen, de bevestigde oorzaak, de testweek en de keuze; drie controles; alleen lezen', async ({ page }) => {
    await V.boot(page);
    expect(await page.evaluate(() => DIAG_BLOKKEN.some(b => b.lees === diagOorzaken))).toBe(true);
    await page.evaluate(() => { oorzaakKies('pat:pot:uiteten', 'weetniet'); oorzaakBevestig('pat:pot:uiteten'); });
    const voor = await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find(k => /minder/i.test(k)) || ''));
    const B = await page.evaluate(() => diagOorzaken().join('\n'));
    expect(await page.evaluate(() => localStorage.getItem(Object.keys(localStorage).find(k => /minder/i.test(k)) || ''))).toBe(voor);
    expect(B).toContain('pat:pot:vices · Vices boven je potje');
    expect(B).toMatch(/AF +Gevoel · mogelijk/);
    expect(B).toMatch(/AF +Budget past niet · zeker · 3 van de laatste 4 maanden boven je budget van €20, mediaan €95/);   // v430 (R3)
    expect(B).toMatch(/stand: testweek · testweek 2026-10-10 t\/m 2026-10-16, loopt, nog 7 d, 0 tikken/);
    expect(B).toMatch(/keuze: te kiezen: Vices: budget naar €95 · wacht: Vices boven je potje/);   // v430 (R3)
    expect(B).toContain('over je gegevens, niet over gedrag');
    expect(B).toContain('oorzaakvragen deze maand 1 <= 3: ja');
    expect(B).toContain('gedragskeuze onder Te kiezen zonder bevestigde oorzaak: geen');
    expect(B).toContain('symptoom alleen uit een als eenmalig bevestigd bedrag (alle soorten): geen');
  });
  test('Begrijpen: de symptoomrij zegt hoeveel oorzaken en de stand; de kop telt de vragen; past op 390x844', async ({ page }) => {
    await V.boot(page);
    await tab(page, 'begrijpen');
    const r = await page.evaluate(() => ({ kop: document.querySelector('[data-vragenmaand]').innerText, vices: document.querySelector('[data-symptoom="pat:pot:vices"]').innerText, ab: document.querySelector('[data-symptoom="lo:krap:abonnement"]').innerText, sw: document.documentElement.scrollWidth }));
    expect(r.kop).toBe('3 vragen open · 0 van 3 gesteld deze maand');
    expect(r.vices).toMatch(/3 mogelijke oorzaken · 1 al zeker[\s\S]*1 vraag ›/);   // v430 (R3): budget zeker, de vraag blijft
    expect(r.ab).toMatch(/2 mogelijke oorzaken[\s\S]*vraag in nov/);   // v430 (R2): verdeling is alleen nog mogelijk
    expect(r.sw).toBeLessThanOrEqual(390);
  });
});
