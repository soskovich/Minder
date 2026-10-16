/* v430: GRIP-CYCLUS FASE 3. Deel 1 repareert de oorzaak-toetsen na blok 22 op het toestel (R1 tot R8), deel 2 voegt vaste lasten
   gestegen, inkomen gestegen en "na je salaris", "Klopte de oorzaak?" en de verhouding met je salaris toe. Op de stand van v428
   (v421-stand, 10 oktober 2026, GECONSTRUEERD: de boekingen van het toestel staan alleen daar) en, voor de betaalrekening (R8),
   grip-kring-stand met twee opnames uit je spaargeld. */
const { test, expect } = require('@playwright/test');
const V = require('./v428-boot');
const K = require('./grip-kring-stand');
const { MAIN } = require('./v421-stand');
const tab = (page, t) => page.evaluate(t => { gripKiesTab(t); return document.querySelector('#gripInhoud').dataset.griptabinhoud; }, t);
const add = (page, rij) => page.evaluate(({ MAIN, rij }) => {
  for (const [d, a, n, ds, c, tijd] of rij) { const t = { id: 'v430' + d + n + a + (ds || ''), date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; if (tijd) t.betaalTijd = tijd; TX.push(t); }
  TX.sort((a, b) => a.date.localeCompare(b.date)); applyOwnAccounts(); buildAccMeta(); save(); renderMaand(); }, { MAIN, rij });
const ana = (page, k) => page.evaluate(k => { const x = oorzaakAnalyse({ id: 'test:' + k, k, naam: k }, maandVooruit());
  return { oorzaken: x.oorzaken.map(o => [o.soort, o.label]), toets: Object.fromEntries(x.toetsen.map(t => [t.soort, { vuurt: t.vuurt, sterkte: t.sterkte, bewijs: t.vuurt ? t.bewijs : t.niet, ander: t.ander, getallen: t.getallen }])), bev: x.bevestigd.map(b => [b.soort, b.bron]), vraagOpen: x.vraagOpen, mediaan: x.budgetMediaan }; }, k);
const cyc = page => page.evaluate(() => { const C = gripCyclusLees(); return { sym: C.sym.map(s => s.id), kies: C.kies.map(k => [k.id, k.sym, k.naam, k.act]), wacht: C.wacht.map(k => [k.id, k.sym, k.naam]), stand: Object.fromEntries(Object.entries(C.OV.A).map(([k, x]) => [k, x.stand])), leeg: (C.leeg || []).map(x => x.id), IV: C.IV ? { stand: C.IV.stand, antwoord: C.IV.antwoord } : null, TC: (C.TC || []).map(t => ({ id: t.id, voor: t.voor, nu: t.nu, lijkt: t.lijkt, stand: t.stand })) }; });
/* de budgetten van juni tot en met september zoals bewaard (maandPotjes), met wat er per potje anders is */
const hist = (page, extra) => page.evaluate(extra => { SET.budgetHist = SET.budgetHist || {}; for (const ym of ['2026-06', '2026-07', '2026-08', '2026-09']) SET.budgetHist[ym] = Object.assign({}, SET.budgets, (extra[ym] || extra['*'] || {})); save(); }, extra);

test.describe('v430 · R1 een vraag per symptoom', () => {
  test('R1a. de opties zijn de oorzaken, "Weet ik niet" en bij een patroon "Dit patroon klopt niet"; "Klopt dit patroon?" staat nergens meer', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('pat:pot:uiteten'); });
    const o = await page.evaluate(() => [...document.querySelectorAll('[data-oorzaakvraag] [data-vraagoptie]')].map(e => e.dataset.vraagoptie));
    expect(o).toEqual(['gelegenheid', 'gevoel', 'weetniet', 'nietklopt']);   // eenmalig niet: dat bevestig je bij de uitgave zelf
    await tab(page, 'kiezen');
    expect(await page.locator('#gripWachtOorzaak [data-kiesoordeel]').count()).toBe(0);
    expect(await page.evaluate(() => document.querySelector('#gripInhoud').innerText)).not.toContain('Klopt dit patroon?');
  });
  test('R1b. een oorzaak kiezen bevestigt ook het patroon, en de gedragskeuze komt onder Te kiezen', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { oorzaakKies('pat:pot:uiteten', 'gevoel'); oorzaakBevestig('pat:pot:uiteten'); });
    const r = await page.evaluate(() => ({ o: gripOordeel('pot:uiteten'), bev: gripPatroonBevestigd('pot:uiteten'), k: kennisGet('oorzaak|cat:uiteten') }));
    expect(r.o.klopt).toBe(true);
    expect(r.bev).toBe(true);
    expect(r.k.aard).toBe('gevoel');
    const C = await cyc(page);
    expect(C.stand['pat:pot:uiteten']).toBe('bevestigd');
    expect(C.kies.map(k => k[0])).toContain('pat:pot:uiteten');
    expect(C.wacht.map(k => k[1])).not.toContain('pat:pot:uiteten');
  });
  test('R1c. "Dit patroon klopt niet" is de bestaande afhandeling (oordeel met reden); er komt geen gedragskeuze uit, en wijzigen zet de vraag terug', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('pat:pot:boodschappen'); oorzaakKies('pat:pot:boodschappen', 'nietklopt'); });
    await expect(page.locator('[data-vraagredenen] [data-vraagreden]')).toHaveCount(4);
    await page.locator('[data-vraagreden="impuls"]').click();
    await page.locator('[data-vraagbevestig]').click();
    const r = await page.evaluate(() => ({ o: gripOordeel('pot:boodschappen'), gevraagd: oorzaakGevraagd() }));
    expect(r.o).toMatchObject({ klopt: false, reden: 'impuls' });
    expect(r.gevraagd).toContain('cat:boodschappen');   // het antwoord telt als vraag van deze maand
    let C = await cyc(page);
    expect(C.stand['pat:pot:boodschappen']).toBe('nietklopt');
    expect(C.kies.concat(C.wacht).some(k => k[1] === 'pat:pot:boodschappen')).toBe(false);
    await expect(page.locator('[data-nietklopt]')).toContainText('impulsaankopen');
    await page.locator('[data-nietkloptwijzig]').click();
    C = await cyc(page);
    expect(C.stand['pat:pot:boodschappen']).toBe('vraag');
  });
});

test.describe('v430 · R2 verdeling', () => {
  test('R2a. zeker alleen als HETZELFDE andere potje in 3 van de 4 maanden 70% van de overschrijding onder budget bleef', async ({ page }) => {
    await V.boot(page);
    await hist(page, { '*': { uiteten: 1000 } });
    const a = await ana(page, 'vices');
    expect(a.toets.verdeling).toMatchObject({ vuurt: true, sterkte: 'zeker', ander: 'uiteten' });
    expect(a.toets.verdeling.getallen.maanden).toBe(3);   // jul, aug en sep boven; juni niet
    /* in twee van de vier maanden is niet genoeg */
    await hist(page, { '2026-08': { uiteten: 1000 }, '2026-09': { uiteten: 1000 } });
    const b = await ana(page, 'vices');
    expect(b.toets.verdeling.sterkte === 'zeker' && b.toets.verdeling.vuurt).toBe(false);
  });
  test('R2b. Overig en een potje zonder eigen budget zijn nooit het andere potje', async ({ page }) => {
    await V.boot(page);
    await hist(page, { '*': { overig: 5000, vakantie: 0 } });
    const a = await ana(page, 'vices');
    expect(a.toets.verdeling.ander).not.toBe('overig');
    expect(a.toets.verdeling.sterkte === 'zeker' && a.toets.verdeling.vuurt).toBe(false);
    expect(await page.evaluate(() => diagOorzaken().join('\n'))).toContain('Overig of een potje zonder budget als bron van een verdeling: nergens');
  });
  test('R2c. alleen in de lopende maand is het mogelijk, niet zeker', async ({ page }) => {
    await V.boot(page);
    const a = await ana(page, 'abonnement');   // Online shopping blijft in okt ruim onder budget
    expect(a.toets.verdeling).toMatchObject({ vuurt: true, sterkte: 'mogelijk', ander: 'shopping' });
    expect(a.bev.map(b => b[0])).not.toContain('verdeling');
  });
});

test.describe('v430 · R3 budget past niet', () => {
  test('R3a. zeker bij 3 van 4 boven en een mediaan van minstens 1,5x het budget (Vices EUR 95 tegen EUR 20); de spreiding telt niet meer', async ({ page }) => {
    await V.boot(page);
    const a = await ana(page, 'vices');
    expect(a.toets.budget).toMatchObject({ vuurt: true, sterkte: 'zeker' });
    expect(a.mediaan).toBe(95);
    expect(a.vraagOpen).toBe(true);   // budget sluit de vraag niet
    /* budget 70: mediaan 95 is 1,36x, dus niet zeker */
    await page.evaluate(() => { SET.budgets.vices = 70; save(); });
    const b = await ana(page, 'vices');
    expect(b.toets.budget.vuurt).toBe(false);
  });
  test('R3b. Kiezen: "budget naar EUR 95" via de herzien-sheet naast "minder uitgeven", dat wacht; de vraag heeft geen optie budget', async ({ page }) => {
    await V.boot(page);
    let C = await cyc(page);
    const b = C.kies.find(k => k[0] === 'oorz:cat:vices:budget');
    expect(b[2]).toBe('Vices: budget naar €95');
    expect(b[3]).toBe("openPotHerzien('vices',95)");
    expect(C.wacht.map(k => k[0])).toContain('oorz:cat:vices:minder');
    expect(C.stand['pat:pot:vices']).toBe('vraag');
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('pat:pot:vices'); });
    const o = await page.evaluate(() => [...document.querySelectorAll('[data-oorzaakvraag] [data-vraagoptie]')].map(e => e.dataset.vraagoptie));
    expect(o).not.toContain('budget');
    await expect(page.locator('[data-budgetzeker]')).toContainText('budget naar €95');
    /* de herzien-sheet stelt de mediaan voor */
    await page.evaluate(() => openPotHerzien('vices', 95));
    expect(await page.evaluate(() => potHerzienStand().x.voorstel)).toBe(95);
    await page.evaluate(() => closeSheet());
    /* een oorzaak in je gedrag opent de gedragskeuzes, en "minder uitgeven" wacht niet meer */
    await page.evaluate(() => { oorzaakKies('pat:pot:vices', 'gevoel'); oorzaakBevestig('pat:pot:vices'); });
    C = await cyc(page);
    expect(C.wacht.map(k => k[0])).not.toContain('oorz:cat:vices:minder');
    expect(C.kies.map(k => k[0])).toContain('oorz:cat:vices:gevoel');
    expect(C.kies.map(k => k[0])).toContain('oorz:cat:vices:budget');
  });
});

test.describe('v430 · R4 eenmalig door jou gaat voor alles', () => {
  test('R4a. Boodschappen boven door een bevestigde eenmalige boeking: het symptoom en zijn keuzes verdwijnen', async ({ page }) => {
    await V.boot(page);
    let C = await cyc(page);
    expect(C.sym).toContain('pat:pot:boodschappen');   // invoermeting
    await page.evaluate(() => { const t = TX.find(x => x.date === '2026-10-05' && x.amount === -283); SET.eenmaligOk = Object.assign({}, SET.eenmaligOk, { [t.id]: { op: '2026-10-10' } }); save(); renderMaand(); });
    C = await cyc(page);
    expect(C.sym).not.toContain('pat:pot:boodschappen');
    expect(C.leeg).toContain('pat:pot:boodschappen');
    expect(C.kies.concat(C.wacht).some(k => k[1] === 'pat:pot:boodschappen')).toBe(false);
    const b22 = await page.evaluate(() => diagOorzaken().join('\n'));
    expect(b22).toMatch(/weggevallen, alleen eenmalig door jou: .*pat:pot:boodschappen/);
    expect(b22).toContain('symptoom alleen uit een als eenmalig bevestigd bedrag (alle soorten): geen');
  });
  test('R4b. elke soort, ook de lek-regel: zonder het eenmalige bedrag onder de drempel is leeg', async ({ page }) => {
    await V.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), s = { id: 'lo:lek:zorg', soort: 'lek', k: 'zorg' }; const voor = symptoomLeeg(s, V);
      const t = TX.find(x => catOf(x) === 'zorg' && x.amount === -159); SET.eenmaligOk = { [t.id]: { op: '2026-10-10' } }; const na = symptoomLeeg(s, V); return { voor, na }; });
    expect(r.voor).toBe(null);
    expect(r.na).toMatchObject({ k: 'zorg', eenmalig: 159 });
  });
  test('R4c. in geen enkele toets: de overschrijding van een potje telt het eenmalige bedrag niet', async ({ page }) => {
    await V.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), voor = oorzaakUitBud('boodschappen', '2026-10', V).uit;
      const t = TX.find(x => x.date === '2026-10-05' && x.amount === -283); SET.eenmaligOk = { [t.id]: { op: '2026-10-10' } }; return { voor, na: oorzaakUitBud('boodschappen', '2026-10', V) }; });
    expect(r.na.uit).toBe(r.voor - 283);
    expect(r.na.eenmalig).toBe(283);
  });
});

test.describe('v430 · R5 tot R7', () => {
  test('R5. het salaris komt uit blok 20, ook de holding: juli en augustus hebben salaris', async ({ page }) => {
    await V.boot(page);
    const r = await page.evaluate(() => ({ jul: oorzaakSalarisDag('2026-07'), aug: oorzaakSalarisDag('2026-08'), D: salarisData(DIAG_SAL_MAANDEN).R.filter(x => ['2026-07', '2026-08'].includes(x.ym)).map(x => [x.salaris > 0, x.salTx.map(t => t.date.slice(0, 10)).sort()[0]]) }));
    expect(r.jul).toBe(r.D[0][1]);
    expect(r.aug).toBe(r.D[1][1]);
    expect(r.D.every(x => x[0])).toBe(true);
    const a = await ana(page, 'vices');
    expect(a.toets.salaris.bewijs).not.toContain('geen salaris');
    expect(await page.evaluate(() => diagOorzaken().join('\n'))).toContain('inkomen in de salaris-toets gelijk aan blok 20: ja');
  });
  test('R6. gewoonte: minstens 8 aankopen onder EUR 15 in minstens 2 van de 3 maanden', async ({ page }) => {
    await V.boot(page);
    await add(page, [1, 2, 3, 4, 5, 6, 7, 8].map(i => ['2026-07-' + String(i + 1).padStart(2, '0'), -4, 'Tabak', 'TABAK ' + i, 'vices']));
    expect((await ana(page, 'vices')).toets.gewoonte.vuurt).toBe(false);   // een maand is geen gewoonte
    await add(page, [1, 2, 3, 4, 5, 6, 7, 8].map(i => ['2026-08-' + String(i + 1).padStart(2, '0'), -4, 'Tabak', 'TABAK ' + i, 'vices']));
    const a = await ana(page, 'vices');
    expect(a.toets.gewoonte).toMatchObject({ vuurt: true, sterkte: 'waarschijnlijk' });
    expect(a.toets.gewoonte.getallen.maanden).toBe(2);
  });
  test('R7. een dagdeel pas vanaf 5 boekingen met een tijd; gevoel blijkt alleen uit je antwoord of een testweek', async ({ page }) => {
    await V.boot(page);
    await add(page, [1, 2, 3, 4].map(i => ['2026-08-1' + i, -20, 'Coffeeshop', 'COFFEESHOP T' + i, 'vices', '21:30']));
    let a = await ana(page, 'vices');
    expect(a.toets.gelegenheid.getallen.dagdeel).toContain('niet getoond');
    expect(a.toets.gevoel.bewijs).toBe('blijkt alleen uit je antwoord of een testweek');
    await add(page, [['2026-09-15', -20, 'Coffeeshop', 'COFFEESHOP T5', 'vices', '21:40']]);
    a = await ana(page, 'vices');
    expect(a.toets.gelegenheid.getallen.dagdeel).toMatch(/^20–23 \d+%$/);
  });
});

test.describe('v430 · R8 de betaalrekening', () => {
  const OPN = [['2026-10-06', 300], ['2026-10-09', 400]];
  test('R8a. eigen toetsen (salaris opgedeeld, salaris-effect over alles); de potjes erin zijn eigen symptomen', async ({ page }) => {
    await K.boot(page, { opnames: OPN });
    const r = await page.evaluate(() => { go('maand'); const C = gripCyclusLees(), X = C.OV.A['pat:spaargeld']; return { soorten: X.toetsen.map(t => t.soort), sym: C.sym.map(s => s.id), sig: C.kies.filter(k => k.soort === 'sig').map(k => k.sym), salaris: X.toetsen.find(t => t.soort === 'salaris').bewijs }; });
    expect(r.soorten).toEqual(['opgedeeld', 'salaris']);
    expect(r.sym).toContain('sig:uiteten');
    expect(r.salaris).toContain('van al je variabele uitgaven');
    for (const s of r.sig) expect(s).not.toBe('pat:spaargeld');
  });
  test('R8b. minder dan 5% over na vast, potjes en opzij is zeker; de keuze gaat alleen over opzij en een buffer, met het gevolg vooraf', async ({ page }) => {
    await K.boot(page, { opnames: OPN });
    /* v431 (3a): de toets loopt op de afgeronde maanden; in augustus en september gaat er zoveel naar boodschappen dat er minder dan 5%
       van het salaris overblijft (2 van 3) */
    await page.evaluate(() => { for (const d of ['2026-08-26', '2026-09-26']) { const t = { id: 'v431op' + d, date: d, amount: -5000, acc: 'NL01MAIN0000001111', name: 'Albert Heijn', desc: 'BEA ALBERT HEIJN GROOT', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'boodschappen'; TX.push(t); } save(); go('maand'); });
    const r = await page.evaluate(() => { const C = gripCyclusLees(), X = C.OV.A['pat:spaargeld']; return { stand: X.stand, bev: X.bevestigd.map(b => b.soort), bewijs: X.toetsen[0].bewijs, kies: C.kies.filter(k => k.sym === 'pat:spaargeld').map(k => [k.id, k.naam]) }; });
    expect(r.bev).toContain('opgedeeld');
    expect(r.stand).toBe('bevestigd');
    expect(r.bewijs).toMatch(/^na vast, potjes en opzij blijft minder dan 5% van je salaris over in [23] van de 3 afgeronde maanden · rest per maand: jul [−€\d.]+ · aug −€[\d.]+ · sep −€[\d.]+/);
    /* v432: met een voorstel per betaalrekening is de keuze "Zo verdeel je je salaris"; opzij verlagen of een buffer blijft de keuze
       zonder voorstel, en de sheet zelf is ongewijzigd */
    expect(r.kies.map(k => k[0])).toContain('oorz:pat:spaargeld:salverdeling');
    expect(r.kies.find(k => k[0] === 'oorz:pat:spaargeld:salverdeling')[1]).toBe('Zo verdeel je je salaris');
    for (const k of r.kies) expect(k[1]).not.toMatch(/Vices|Uit eten/);
    await page.evaluate(() => openOpzijKeuze('pat:spaargeld'));
    await expect(page.locator('[data-opzijbevestig]')).toBeDisabled();
    await page.locator('[data-opzijoptie="buffer"]').click();
    await expect(page.locator('[data-opzijgevolg]')).toContainText('op je betaalrekening staan');
    await page.locator('[data-opzijbevestig]').click();
    const g = await page.evaluate(() => afsprakenLijst().filter(a => a.key === 'oorz:pat:spaargeld').map(a => a.oorzaak));
    expect(g).toContain('opzij');
  });
});

test.describe('v430 · fase 3', () => {
  test('1. vaste lasten gestegen: per post voor en na, oorzaak zeker zonder vraag, accepteren met het gevolg vooraf', async ({ page }) => {
    await V.boot(page);
    const C = await cyc(page);
    expect(C.sym).toContain('vast:gestegen');
    const nikki = C.kies.find(k => k[0] === 'vastpost:NIKKI');
    expect(nikki[2]).toBe('Nikki: nieuw +€47 · accepteren of nakijken');
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('vast:gestegen'); });
    await expect(page.locator('[data-vastoorzaak]')).toContainText('Er hoort geen vraag bij');
    expect(await page.locator('[data-vastpostrij]').count()).toBeGreaterThanOrEqual(3);
    expect(await page.locator('#gripSymptoom [data-oorzaakvraag]').count()).toBe(0);
    const cat = await page.evaluate(() => vastGestegenData().posten.find(p => p.key === 'NIKKI').cat);
    const voor = await page.evaluate(c => Math.round(+(SET.budgets[c] || 0)), cat);
    await page.evaluate(() => openVastPostKeuze('NIKKI'));
    await page.locator('[data-vpkoptie="accepteren"]').click();
    await expect(page.locator('[data-vpkbevestig]')).toBeDisabled();   // eerst de bron
    await page.locator('[data-vpkbronkeuze="budget"]').click();
    await expect(page.locator('[data-vpkgevolg]')).toContainText(`€${voor} → €${voor + 47}`);
    await page.locator('[data-vpkbevestig]').click();
    const na = await page.evaluate(c => ({ b: Math.round(SET.budgets[c]), acc: !!(SET.vastAccept || {}).NIKKI, kies: gripCyclusLees().kies.some(k => k.id === 'vastpost:NIKKI') }), cat);
    expect(na).toEqual({ b: voor + 47, acc: true, kies: false });
  });
  test('2. inkomen gestegen en na je salaris: +EUR 1.752 (+51%), de tekst en de groepen; de vraag telt mee in de 3', async ({ page }) => {
    await V.boot(page);
    const N = await page.evaluate(() => { const N = naJeSalarisData(); return { ym: N.ym, d: N.d, pct: N.pct, extra: N.extra, tekst: naJeSalarisTekst(N), groepen: N.groepen.map(g => g.id) }; });
    expect(N).toMatchObject({ ym: '2026-09', d: 1752, pct: 51 });
    expect(N.tekst).toBe(`van je verhoging van €1.752 ging €${N.extra.toLocaleString('nl-NL')} (${Math.round(N.extra / 1752 * 100)}%) naar extra uitgaven`);
    expect(N.groepen).toEqual(['vices+uiteten', 'contant', 'online+overig', 'overige']);   // v431 (2a): de vierde groep
    let C = await cyc(page);
    expect(C.IV.stand).toBe('later');   // drie symptoomvragen gaan voor
    /* een vraag die deze maand al gesteld is houdt zijn plek (zoals bij een symptoom); dan staat hij open */
    await page.evaluate(() => { SET.oorzaakVragen = { '2026-10': ['inkomen|2026-09'] }; save(); gripKiesTab('begrijpen'); gripNaarSymptoom('inkomen:na'); });
    C = await cyc(page);
    expect(C.IV.stand).toBe('vraag');
    await expect(page.locator('[data-najesalaris]')).toContainText('naar extra uitgaven');
    await page.locator('[data-inkomenoptie="vanzelf"]').click();
    const r = await page.evaluate(() => ({ k: kennisGet('oorzaak|inkomen|2026-09'), g: oorzaakGevraagd() }));
    expect(r.k.aard).toBe('vanzelf');
    expect(r.g).toContain('inkomen|2026-09');
  });
  test('2d. verhoging verdelen: een vast bedrag naar Plan met het gevolg voor Plan vooraf', async ({ page }) => {
    await V.boot(page);
    const cur = await page.evaluate(() => Math.round(monthlySavingTarget()));
    await page.evaluate(() => openVerhogingVerdelen());
    await expect(page.locator('[data-vhvgevolg]')).toContainText('Nog te gaan in Plan');
    const b = await page.evaluate(() => window._vhv.bedrag);
    expect(b % 50).toBe(0);
    await expect(page.locator('[data-vhvgevolg]')).toContainText(`Spaarinleg €${cur.toLocaleString('nl-NL')} → €${(cur + b).toLocaleString('nl-NL')}`);
    await page.locator('[data-vhvbevestig]').click();
    const r = await page.evaluate(() => ({ sa: SET.savingAmount, C: gripCyclusLees() })).then(x => x);
    expect(r.sa).toBe(cur + b);
    const C = await cyc(page);
    expect(C.kies.map(k => k[0])).not.toContain('inkomen:verdeel');
  });
  test('3. klopte de oorzaak? Minder dan 50% kleiner is een vraag; Nee heropent de oorzaak met "eerder gedacht"', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { SET.kennis['oorzaak|cat:vices'] = { soort: 'oorzaak', partij: 'Vices', wat: 'gevoel', aard: 'gevoel', bron: 'jij', op: '2026-09-02' };
      afspraakMaak({ soort: 'gedrag', oorzaak: 'gevoel', key: 'oorz:cat:vices', cat: 'vices', wat: 'eerst 10 minuten', titel: 'Vices bij spanning: eerst 10 minuten', van: '2026-09', tot: '2026-09' });
      save(); renderMaand(); });
    let C = await cyc(page);
    expect(C.TC[0]).toMatchObject({ voor: 74, nu: 76, lijkt: false, stand: 'vraag' });   // gaat voor op de symptoomvragen: hij geldt alleen deze maand
    expect(Object.values(C.stand).filter(x => x === 'vraag').length).toBe(2);   // samen hooguit 3
    await tab(page, 'kiezen');
    await expect(page.locator('#gripMee [data-terugcheck]')).toHaveCount(1);
    await tab(page, 'terugblik');
    await page.locator('#gripKlopteOorzaak [data-kloptnee]').click();
    const r = await page.evaluate(() => ({ oud: kennisGet('oorzaakoud|cat:vices'), nu: kennisGet('oorzaak|cat:vices') }));
    expect(r.oud.aard).toBe('gevoel');
    expect(r.nu).toBe(null);
    C = await cyc(page);
    expect(['vraag', 'later']).toContain(C.stand['pat:pot:vices']);
    await page.evaluate(() => { gripKiesTab('begrijpen'); gripNaarSymptoom('pat:pot:vices'); });
    await expect(page.locator('[data-eerdergedacht]')).toContainText('eerder gedacht: Gevoel');
  });
  test('3b. minstens 50% kleiner: "lijkt te kloppen", geen vraag', async ({ page }) => {
    await V.boot(page);
    await hist(page, { '2026-09': { vices: 200 } });
    await page.evaluate(() => { afspraakMaak({ soort: 'gedrag', oorzaak: 'gevoel', key: 'oorz:cat:vices', cat: 'vices', wat: 'x', titel: 'Vices bij spanning', van: '2026-09', tot: '2026-09' }); save(); });
    const C = await cyc(page);
    expect(C.TC[0]).toMatchObject({ lijkt: true, stand: 'lijkt' });
    await tab(page, 'terugblik');
    await expect(page.locator('[data-lijktkloppen]')).toHaveCount(1);
    await expect(page.locator('[data-klopteoorzaakvraag]')).toHaveCount(0);
  });
  test('4. de verhouding met je salaris: 6 maanden in EUR en %, eenmalig apart, en de regel over je vast-%', async ({ page }) => {
    await V.boot(page);
    await tab(page, 'terugblik');
    await expect(page.locator('#gripVerhouding [data-verhoudingmaand]')).toHaveCount(6);
    await expect(page.locator('[data-vastpctlijn]')).toHaveText(/^na je salarisverhoging ging je vast-% van \d+% naar \d+%$/);
    const r = await page.evaluate(() => verhoudingSalarisData().R.map(x => x.sal - x.vast - x.potjes - x.buiten - x.opzij - x.rest));
    for (const d of r) expect(Math.abs(d)).toBeLessThanOrEqual(3);   // de delen sluiten op het salaris (afronding per deel)
  });
  /* v430: vier gevallen die een drempel of een uitsluiting onderscheiden van de voor de hand liggende variant (meetles o) */
  test('1b. een post die 12 euro (7%) steeg is niet gestegen: de drempel is 10% EN 10 euro', async ({ page }) => {
    await V.boot(page);
    await page.evaluate(() => { const z = TX.filter(t => /ZILVEREN KRUIS/i.test(t.desc || t.name || ''));
      const t0 = z[0]; for (const ym of ['2026-04', '2026-05']) { const t = Object.assign({}, t0, { date: ym + t0.date.slice(7) }); categorize(t); TX.push(t); }
      for (const t of TX) if (/ZILVEREN KRUIS/i.test(t.desc || t.name || '') && t.date >= '2026-07') t.amount = -176;
      TX.forEach(categorize); TX.sort((a, b) => a.date.localeCompare(b.date)); applyOwnAccounts(); buildAccMeta(); save(); });
    const P = await page.evaluate(() => { const D = fase3Sal(), A = D.R.slice(0, -1).slice(-6), k = Object.keys(A[5].posten).find(k => /ZILVEREN/.test(k));
      return { reeks: A.map(r => Math.round(+r.posten[k] || 0)), in: vastGestegenData().posten.some(p => p.key === k) }; });
    expect(P.reeks).toEqual([164, 164, 164, 176, 176, 176]);   // de invoer: +12 euro, 7%
    expect(P.in).toBe(false);
  });
  test('2b. een verhoging van 300 euro (6%) is geen inkomen gestegen: de drempel is 25% EN 250 euro', async ({ page }) => {
    /* grip-kring-stand: een vast salaris van 5216 per maand, zonder holding; vanaf augustus 300 euro meer */
    await K.boot(page, {});
    const v = await page.evaluate(() => { for (const t of TX) if (t.amount === 5216 && t.date >= '2026-08') t.amount = 5516; SET.income = 5516; TX.forEach(categorize); save();
      const D = fase3Sal(); return D.R.map(r => Math.round(D.tot(r, 'salaris'))); });
    expect(v.slice(2)).toEqual([5216, 5216, 5216, 5216, 5216, 5516, 5516, 5516]);   // de invoer: +300 euro, 6%
    expect(await page.evaluate(() => inkomenStijging())).toBe(null);
    expect(await page.evaluate(() => gripCyclusLees().sym.map(s => s.id))).not.toContain('inkomen:na');
  });
  test('2c. wat jij eenmalig noemde telt niet als extra uitgave na je salaris', async ({ page }) => {
    await V.boot(page);
    const voor = await page.evaluate(() => { const N = naJeSalarisData(); return { tot: N.naTot, ov: N.groepen.find(g => g.id === 'online+overig').na }; });
    await page.evaluate(() => { const t = TX.find(t => t.id.startsWith('m5dwa_38000')); SET.eenmaligOk = Object.assign({}, SET.eenmaligOk, { [t.id]: { op: '2026-10-01' } }); save(); });
    const na = await page.evaluate(() => { const N = naJeSalarisData(); return { tot: N.naTot, ov: N.groepen.find(g => g.id === 'online+overig').na }; });
    expect(voor.tot - na.tot).toBe(380);
    expect(voor.ov - na.ov).toBe(380);
  });
  test('3c. eerder gedacht telt niet meer als zeker: na Nee op budget staat budget niet meer als bevestigde oorzaak', async ({ page }) => {
    await V.boot(page);
    expect((await ana(page, 'vices')).bev.map(b => b[0])).toContain('budget');   // de invoer: budget is zeker uit de data
    await page.evaluate(() => { afspraakMaak({ soort: 'gedrag', oorzaak: 'budget', key: 'oorz:cat:vices', cat: 'vices', wat: 'budget', titel: 'Vices budget', van: '2026-09', tot: '2026-09' }); save(); });
    await page.evaluate(() => { const T = oorzaakTerugcheck().find(t => t.key === 'cat:vices'); oorzaakTerugZet(T.id, false); });
    const a = await ana(page, 'vices');
    expect(a.bev.map(b => b[0])).not.toContain('budget');
    expect(await page.evaluate(() => kennisGet('oorzaakoud|cat:vices').aard)).toBe('budget');
  });
  test('5. blok 22 draagt de nieuwe oorzaken en de controles', async ({ page }) => {
    await V.boot(page);
    const b = await page.evaluate(() => diagOorzaken().join('\n'));
    expect(b).toContain('vast:gestegen · Vaste lasten gestegen');
    expect(b).toContain('bevestigd: zeker uit je boekingen · geen vraag');
    expect(b).toContain('inkomen:na · Na je salaris');
    expect(b).toMatch(/toets: vast inkomen \(blok 20\) vanaf 2026-09/);
    expect(b).toContain('KLOPTE DE OORZAAK?');
    expect(b).toContain('Overig of een potje zonder budget als bron van een verdeling: nergens');
    expect(b).toContain('inkomen in de salaris-toets gelijk aan blok 20: ja');
  });
});
