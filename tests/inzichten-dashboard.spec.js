/* v359: INZICHTEN ALS DASHBOARD, op de stand van 7 oktober 2026 (tests/inzichten-stand.js).
   Inzichten observeert, Grip stuurt.
   v382: de tegels, het kop-inzicht, "Over de maanden" en de keuzekaart zijn weg; wat deze spec over de BLIJVENDE
   eigenschappen vasthield (het filter, geen handeling op het scherm, sheets die niets schrijven, de patronen-bron, de
   soort-snede, de onbekend-stand, de overloop) is gebonden aan de maandkaart (#insMaand), de weektegel, de
   patroontegels en de verschuivingen. De nieuwe vorm zelf staat in inzichten-week.spec.js. */
const { test, expect } = require('@playwright/test');
const S = require('./inzichten-stand');

async function open(page, o, vp) {
  await S.boot(page, o);
  if (vp) await page.setViewportSize(vp);
  await page.evaluate(() => go('ins'));
}
const kaart = (page) => page.evaluate(() => { const e = document.getElementById('insMaand'); return Object.assign({ txt: e.innerText }, e.dataset); });
/* De keuze welke potjes wekelijks zijn, zoals inzichten-week.spec.js hem zet: anders staat er een regel naar die keuze
   in plaats van de weektegel. */
async function kies(page) {
  await page.evaluate(() => { SET.potWekelijks = {}; for (const k of wekKandidaten()) SET.potWekelijks[k] = true; SET.weekStand = null; save(); render(); go('ins'); });
}

test.describe('a · de maandkaart van 7 oktober', () => {
  // v382: weg, de drie tegels met hun bedragen en volgorde; de maandkaart staat in inzichten-week.spec.js e.
  // v382: weg, de status per tegel (groen, grijs); er zijn geen tegels meer. De kleur met reden staat in l.
  // v382: weg, amber op de tegels uitgegeven en potjes; zie l voor amber op de maandkaart.
  test('het budget is uitgegeven plus nog in potjes plus nog te betalen (v327)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => { const M = insMaandStand(); return { b: Math.round(totals(thisYM()).budget), M }; });
    const k = await kaart(page);
    expect(r.b).toBe(3376);
    /* v440 sectie 8: de kop gaat over je potjes (potjes-uitgave van het potjesdeel); de v327-eigenschap
       (budget = uitgegeven + nog in potjes + nog te betalen) blijft op insMaandStand. */
    expect(+k.insbudget).toBe(r.M.potDeel); expect(+k.insuit).toBe(Math.round(r.M.potjes + r.M.zonder));
    expect(r.M.uit + r.M.nogVast + r.M.nogPot).toBe(r.b);
    expect(r.M.boven).toBe(0);
  });
  test('zonder boekingen van deze maand is uitgegeven onbekend, en geen nul', async ({ page }) => {
    await open(page, { tot: '2026-10-01' });
    const k = await kaart(page);
    expect(k.insmaand).toBe('onbekend');
    expect(k.txt).toContain('onbekend'); expect(k.txt).toContain('nog geen boekingen van deze maand');
    expect(k.txt).not.toMatch(/€0\b/);
  });
  // v365: nog te ontvangen staat op Home
  /* v378: is alles binnen en geen bonus verwacht, dan staat er geen regel meer (keuze van de gebruiker). */
  test('nog te ontvangen verdwijnt van Home zodra alles binnen is', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'sal10', date: '2026-10-06', amount: 5216, name: 'Werkgever', desc: 'SALARIS LOON' }] });
    await page.evaluate(() => { go('dash'); renderDash(); });
    expect(await page.locator('#homeOntvangen').count()).toBe(0);
    expect(await page.evaluate(() => monthLiquidity().incDue)).toBe(0);
  });
});

test.describe('b · het tempo telt een vaste last op zijn datum', () => {
  /* v382: insTempo() is opgegaan in het trap-tempo van insMaandStand(); de eigenschap (een vaste last telt op zijn
     datum, niet naar rato) blijft. */
  test('op 7 oktober is het tempo het potjesdeel naar rato, niet het budget naar rato', async ({ page }) => {
    await open(page);
    const M = await page.evaluate(() => insMaandStand());
    expect(Math.round(3376 * 7 / 31)).toBe(762);
    expect(M.potDeel).toBe(3376 - 817);
    expect(M.potTempo).toBe(Math.round(M.potDeel * 7 / 31));
    expect(M.vastTempo).toBe(0);
    expect(M.tempo).toBe(578);
  });
  test('na de lease telt hij voor zijn hele bedrag mee, ook als hij nog niet is afgeschreven', async ({ page }) => {
    await open(page, { dag: '2026-10-16', extraTx: [{ id: 'nf10', date: '2026-10-15', amount: -43, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' }] });
    const M = await page.evaluate(() => insMaandStand());
    expect(M.vast).toBe(43);
    expect(M.achter.map((x) => [x.naam, x.bedrag])).toEqual([['Hiltermann Lease', 537]]);
    expect(M.vastTempo).toBe(43 + 537);
  });
  test('een vaste last die nog moet komen telt niet', async ({ page }) => {
    await open(page, { dag: '2026-10-12' });
    const M = await page.evaluate(() => insMaandStand());
    expect(M.achter).toEqual([]);
    expect(M.vastTempo).toBe(0);
  });
  test('de sheet van uitgegeven telt op tot de kaart en tot het tempo', async ({ page }) => {
    await open(page, { dag: '2026-10-16', extraTx: [{ id: 'nf10', date: '2026-10-15', amount: -43, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' }] });
    const uit = +(await kaart(page)).insuit;
    await page.click('[data-insmaandkop]');
    const r = await page.evaluate(() => { const s = document.getElementById('insTegelSheet');
      return { w: +s.dataset.inswaarde, delen: [...s.querySelectorAll('[data-insrij]')].map((e) => +e.dataset.insrij),
        tempo: +s.querySelector('[data-instempo]').dataset.instempo, tdelen: [...s.querySelectorAll('[data-instempodeel]')].map((e) => +e.dataset.instempodeel), M: insMaandStand() }; });
    /* v440 sectie 8: de kop van de kaart toont je potjes (puit); de uitgegeven-sheet achter de kop toont de HELE
       maanduitgave (M.uit = vast + potjes + zonder) en het volle trap-tempo, en telt daar intern op. */
    expect(uit).toBe(Math.round(r.M.potjes + r.M.zonder));
    expect(r.w).toBe(r.M.uit);
    expect(r.delen.reduce((a, b) => a + b, 0)).toBe(r.w);
    expect(r.tdelen.reduce((a, b) => a + b, 0)).toBe(r.tempo);
    expect(r.tempo).toBe(r.M.tempo);
  });
});

test.describe('c · de kaart past zich aan', () => {
  // v382: weg, "zonder sparen en contant: dezelfde drie delen"; er zijn geen tegels meer.
  test('zonder herkende incasso en zonder inkomen: geen vaste lasten op de kaart', async ({ page }) => {
    await open(page, { zonderVast: true, zonderInkomen: true, zonderSparen: true, set: { income: 0 } });
    const r = await page.evaluate(() => { const M = insMaandStand(); return { vast: M.vast, nogVast: M.nogVast, leg: [...document.querySelectorAll('#insMaand [data-insleg]')].map((e) => e.dataset.insleg) }; });
    expect(r.vast).toBe(0); expect(r.nogVast).toBe(0);
    expect(r.leg).not.toContain('vast'); expect(r.leg).not.toContain('nogvast');   // nulrijen staan er niet
  });
  test('een opname zonder telling geeft geen splitsing op Home', async ({ page }) => {
    await open(page, { zonderContant: true, extraTx: [{ id: 'gea', date: '2026-08-12', amount: -50, name: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT' }] });
    await page.evaluate(() => go('dash'));
    expect(await page.locator('[data-saldosplit]').count()).toBe(0);
  });
  // v382: weg, "de tegelkeuze onthoudt alleen nog vast"; SET.insTegels heeft geen lezer meer.
  // v382: weg, "een nieuwe maand begint opnieuw"; idem, de tegelkeuze per maand bestaat niet meer.
});

// v382: weg, d · de keuzekaart ("Tegen je potje" / "Tegen vorige maanden"); die kaart is vervallen. Wat er uit is
// tegen het potje met de streep op normaal staat nu in de potje-sheet (inzichten-week.spec.js d).

test.describe('e · geen handeling op Inzichten', () => {
  /* v382: de ingangen van de nieuwe vorm. Elk opent een sheet, wisselt een weergave (de verschuivingen, het filter)
     of verwijst naar Grip. */
  const MAG = ['openInsFilter', 'openInsTegel', 'openInsZonder', 'openWeekSheet', 'openWekelijks', 'openBudgetWijz', 'openVerwachtEind',   // v438: de kaart Verwacht saldo eind <maand> opent dezelfde sheet als op Home (lezen)
    'openInsVastBetaald', 'openInsPotjes',   // v488: "vast" en "potjes" onder Uitgegeven openen de boekingen (lezen)
    'verschuivingToggle', 'verschuivingKies', 'insNaarGrip', 'toggleCollap', 'showTip', 'event.stopPropagation'];
  const MAG_SHEET = MAG.concat(['openWeekUitleg', 'openSetSub', 'closeSheet',   // v436: de uitleg van de week wijst naar Instellingen → Potjes
    'openMonthSpend', 'openCategory', 'openCsvDubbel', 'openMt940Dubbel', 'insFilterZet', 'openInsPotje', 'openSheet', 'wekKies']);
  /* DE UITZONDERING, met reden: in de sheet "Welke potjes zijn wekelijks?" schrijft "Bevestigen" (wekBevestig)
     SET.potWekelijks. Dat is een instelling en geen handeling op je geld: hij beweegt geen geld en zet geen grens, hij
     kiest alleen wat de weektegel optelt, en het is de keuze van de gebruiker in v382 dat die keuze op Inzichten staat.
     Hij staat hier bij naam, zodat geen andere schrijver erbij kan zonder dat deze test valt. */
  const SCHRIJVER = ['wekBevestig'];
  const aanroepen = (root) => [...root.querySelectorAll('[onclick]')].flatMap((e) => e.getAttribute('onclick').split(';').map((x) => x.trim().split('(')[0]).filter(Boolean));
  test('het scherm draagt alleen tikken die iets openen, een weergave wisselen of naar Grip verwijzen', async ({ page }) => {
    await open(page); await kies(page);
    await page.evaluate(() => verschuivingToggle());
    const r = await page.evaluate((src) => { const f = new Function('root', 'return (' + src + ')(root)'); return f(document.getElementById('s-ins')); }, aanroepen.toString());
    // v436: de patroontegels (openInsPatroon) zijn weg; het label staat bij de signalen in Zien
    for (const x of ['openInsFilter', 'openInsTegel', 'openWeekSheet', 'verschuivingToggle', 'verschuivingKies'])
      expect(r, x + ' staat werkelijk op het scherm').toContain(x);
    expect(r.filter((x) => !MAG.includes(x))).toEqual([]);
    expect(await page.$$eval('#s-ins .btn, #s-ins button', (e) => e.length)).toBe(0);
  });
  test('zonder keuze over wekelijks leidt de regel naar de keuze, en ook dat is een ingang', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((src) => { const f = new Function('root', 'return (' + src + ')(root)'); return f(document.getElementById('s-ins')); }, aanroepen.toString());
    expect(r).toContain('openWekelijks');
    expect(r.filter((x) => !MAG.includes(x))).toEqual([]);
  });
  test('de sheets achter de kaart, de week, de patronen en het filter schrijven niets en dragen geen handeling', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'kap1', date: '2026-10-06', amount: -45, name: 'Kapper Jan', desc: 'BEA, BETAALPAS KAPPER JAN' }] });
    await page.evaluate(() => { const t = TX.find((x) => x.name === 'Kapper Jan'); OVR[t.id] = 'zorg'; save(); });
    await kies(page);
    const r = await page.evaluate((src) => {
      const f = new Function('root', 'return (' + src + ')(root)');
      const voor = localStorage.getItem('minder_set'); let schrijf = 0; const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { schrijf++; return orig.apply(this, arguments); };
      const uit = []; const sh = () => { uit.push(...f(document.getElementById('sheet'))); closeSheet(); };
      for (const k of ['uitgegeven', 'potjes', 'vast', 'ontvangen', 'sparen', 'cash']) { openInsTegel(k); sh(); }
      openInsZonder(); sh(); openInsPotje('uiteten'); sh(); openWeekSheet(); sh();
      openWeekUitleg(); sh();
      openWekelijks(); wekKies('uiteten', false); uit.push(...f(document.getElementById('sheet'))); closeSheet();
      verschuivingToggle(); verschuivingKies(0);
      openInsFilter(); const filt = f(document.getElementById('sheet')); closeSheet();
      Storage.prototype.setItem = orig;
      return { uit, filt, schrijf, gelijk: voor === localStorage.getItem('minder_set'), npat: insPatronen('alle').length };
    }, aanroepen.toString());
    expect(r.npat).toBe(4);
    expect(r.schrijf).toBe(0); expect(r.gelijk).toBe(true);
    expect(r.uit.filter((x) => !MAG_SHEET.includes(x) && !SCHRIJVER.includes(x))).toEqual([]);
    expect(r.filt.filter((x) => x !== 'insFilterZet')).toEqual([]);
  });
  test('de uitzondering: Bevestigen in de wekelijks-sheet schrijft alleen de keuze en het weekbedrag', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => {
      const voor = JSON.parse(localStorage.getItem('minder_set'));
      openWekelijks(); for (const k of wekKandidaten()) wekKies(k, true); wekBevestig();
      const na = JSON.parse(localStorage.getItem('minder_set'));
      const keys = new Set([...Object.keys(voor), ...Object.keys(na)]);
      return [...keys].filter((k) => JSON.stringify(voor[k]) !== JSON.stringify(na[k])).sort();
    });
    // v436: wekGekozen legt vast dat de keuze een keer gevraagd is (niet opnieuw vragen na herladen)
    expect(r.filter((k) => !['potWekelijks', 'weekStand', 'wekGekozen'].includes(k))).toEqual([]);
    expect(r).toContain('potWekelijks');
  });
  test('de oude stand-kaart, "Wat opvalt", "Nog deze maand" en de vorm van v359 staan er niet meer', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({ ids: ['insStand', 'insNogLijst', 'insSignalRows', 'insTegels', 'insKop', 'insKeuze', 'insSpendCard', 'insBrug'].filter((i) => document.getElementById(i)), txt: document.getElementById('s-ins').innerText }));
    expect(r.ids).toEqual([]);
    expect(r.txt).not.toMatch(/WAT OPVALT|NOG DEZE MAAND/i);
  });
});

test.describe('f · zonder patronen', () => {
  // v382: weg, het kop-inzicht ("een zin in euro's ... met de teller naar de patronen"); het kop-inzicht is vervallen.
  test('zonder drie afgeronde maanden zegt het scherm dat eerlijk, zonder tegels', async ({ page }) => {
    await open(page, { vanaf: '2026-08-01' });
    const r = await page.evaluate(() => { const e = document.querySelector('[data-inshistorie]'); return { txt: e && e.innerText, n: document.querySelectorAll('[data-inshistorie]').length, tegels: document.querySelectorAll('.ins-pt, #insPatronen').length }; });
    expect(r.n).toBe(1);
    expect(r.txt).toBe('Nog geen patronen: na drie maanden boekingen ziet de app wat bij jou gewoon is.');
    expect(r.tegels).toBe(0);
  });
});

test.describe('g · de vier patronen', () => {


  /* v436: de patroontegels zijn weg van Inzichten. insPatronen() blijft de bron, en het label ervan staat bij het signaal
     in Zien (gripPatroonInfo). De detectie zelf (wat er gebeurt, gezien in) wordt hier op de bron getoetst. */
  test('elk patroon met wat er gebeurt en gezien in, op de bron', async ({ page }) => {
    await open(page);
    const P = await page.evaluate(() => insPatronen('alle').map((p) => ({ s: p.soort, k: p.k, h: p.naam, t: p.tekst, b: 'gezien in: ' + p.bron.filter(Boolean).join(', '), g: !!p.grip })));
    expect(P.map((p) => p.s)).toEqual(['herhaalt', 'structureel', 'nieuw', 'herstelt']);
    expect(P[0].t).toBe('In september €194 boven je potje; je noemde het toen een uitzondering. Oktober loopt weer voor: verwacht €130 erboven.');
    expect(P[0].b).toBe('gezien in: het logboek van september, de vooruitblik van oktober');
    expect(P[1].t).toBe('Je potje is €20; je geeft er gewoonlijk €121 per maand aan uit. In september ging je €103 erboven.');
    expect(P[1].b).toBe('gezien in: je potje, je laatste drie maanden, het logboek van september');
    expect(P[2].h).toContain('Allianz Nederland €98,88');
    expect(P[2].t).toBe('Afgeschreven op 1 oktober onder Vervoer & auto. Bij deze partij zag de app in twaalf maanden geen eerdere boeking.');
    expect(P[2].b).toBe('gezien in: één boeking');
    expect(P[3].t).toBe('In september €84 boven je potje. Oktober loopt achter: €49 in 7 dagen, gewoonlijk €79.');
    expect(P.map((p) => p.g)).toEqual([true, true, true, false]);
  });
  test('Inzichten draagt geen patroontegels meer, Zien draagt het label uit dezelfde bron', async ({ page }) => {
    await open(page);
    expect(await page.locator('#s-ins #insPatronen, #s-ins .ins-pt').count()).toBe(0);
    const L = await page.evaluate(() => { const I = gripPatroonInfo(); return { lab: Object.fromEntries(Object.entries(I.lab).map(([k, v]) => [k, v.soort])), herstel: I.herstel.map((x) => x.k) }; });
    const P = await page.evaluate(() => insPatronen('alle').map((p) => p.soort + ':' + p.k));
    for (const [k, so] of Object.entries(L.lab)) expect(P).toContain(so + ':' + k);
    for (const k of L.herstel) expect(P).toContain('herstelt:' + k);
    expect(L.herstel.length).toBeGreaterThan(0);
  });
  test('de drempel van structureel: onder anderhalf keer het potje is het geen patroon', async ({ page }) => {
    // gewoonlijk 121: bij een potje van 80 is het 41 erboven, onder de EUR 50; bij 70 is het 51 erboven
    const pat = () => page.evaluate(() => insPatronen('alle').map((p) => p.soort + ':' + p.k));
    await open(page, { set: { budgets: Object.assign({}, S.BUDGETS, { vices: 80 }) } });
    expect(await pat()).not.toContain('structureel:vices');
    await open(page, { set: { budgets: Object.assign({}, S.BUDGETS, { vices: 70 }) } });
    expect(await pat()).toContain('structureel:vices');
    // gewoonlijk 301 (180 erbij in juli tot september): bij 220 is het 81 erboven maar minder dan anderhalf keer
    const meer = ['2026-07', '2026-08', '2026-09'].map((m) => ({ id: 'vx' + m, date: m + '-16', amount: -180, name: 'Coffeeshop', desc: 'BEA, BETAALPAS COFFEESHOP DE DAMPKRING' }));
    await open(page, { extraTx: meer, set: { budgets: Object.assign({}, S.BUDGETS, { vices: 220 }) } });
    expect(await pat()).not.toContain('structureel:vices');
    await open(page, { extraTx: meer, set: { budgets: Object.assign({}, S.BUDGETS, { vices: 190 }) } });
    expect(await pat()).toContain('structureel:vices');
  });
  test('een partij die eerder voorkwam is niet nieuw, en een klein bedrag ook niet', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'az5', date: '2026-05-01', amount: -20, name: 'Allianz Nederland', desc: 'SEPA INCASSO ALLIANZ NEDERLAND SCHADE' },
      { id: 'kl10', date: '2026-10-02', amount: -12, name: 'Kiosk Centraal', desc: 'BEA, BETAALPAS KIOSK CENTRAAL' }] });
    expect(await page.evaluate(() => insPatronen('alle').filter((p) => p.soort === 'nieuw').length)).toBe(0);
  });
  test('een korte historie noemt hoeveel maanden de app heeft', async ({ page }) => {
    await open(page, { vanaf: '2026-04-01', extraTx: [{ id: 'nw', date: '2026-10-02', amount: -75, name: 'Fietsenmaker Jan', desc: 'BEA, BETAALPAS FIETSENMAKER JAN' }] });
    const t = await page.evaluate(() => (insPatronen('alle').find((p) => p.soort === 'nieuw') || {}).tekst);
    expect(t).toContain('in de 6 maanden die de app van je heeft');
  });
  test('herstelt zich vraagt een vorige maand boven het potje en een achterstand nu', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'ahx', date: '2026-10-05', amount: -40, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    expect(await page.evaluate(() => insPatronen('alle').map((p) => p.soort + ':' + p.k))).not.toContain('herstelt:boodschappen');
  });
  /* De andere helft: achter op tempo zonder een vorige maand erboven is geen herstel. De sabotage die de eis op de
     vorige maand weghaalt bleef eerst groen, want de stand droeg dat geval niet (meetles a). */
  test('achter op tempo zonder een vorige maand erboven is geen herstel', async ({ page }) => {
    await open(page, { sepNormaal: true });
    const r = await page.evaluate(() => { const x = maandVooruit().potjes.find((p) => p.k === 'boodschappen');
      return { uit: x.uit, typisch: x.typisch, pat: insPatronen('alle').map((p) => p.soort + ':' + p.k) }; });
    expect(r.uit, 'boodschappen loopt werkelijk achter op het gewone tempo').toBeLessThan(r.typisch - 10);
    expect(r.pat).not.toContain('herstelt:boodschappen');
  });
});

// v382: weg, h · over de maanden (de grafiek met de lopende maand, twaalf maanden, de bridge met tegen budget en
// tegen de maand ervoor, en de budgetlijn per soort); "Over de maanden" staat niet meer op Inzichten. De bridge van een
// afgesloten maand leest nu het logboek (openLogMaand).

test.describe('i · het filter stuurt de pagina', () => {
  test('variabel plus vast is alle uitgaven, in elke maand', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => months().map((m) => Math.round((insSoortUit(m, 'var') + insSoortUit(m, 'vast') - totals(m).spendNorm) * 100)));
    expect(r.every((x) => x === 0)).toBe(true);
  });
  test('een potje dat je op vast zette telt bij vast, ook zonder herkende incasso', async ({ page }) => {
    await open(page, { set: { potAard: { shopping: 'vast' } } });
    const r = await page.evaluate(() => [Math.round(insSoortUit(thisYM(), 'vast') * 100), Math.round(insSoortUit(thisYM(), 'var') * 100)]);
    expect(r).toEqual([8012, 40600 - 8012]);
  });
  test('vorige maand: uitgegeven en over in je potjes van september', async ({ page }) => {
    await open(page);
    await page.evaluate(() => insFilterZet('vorige', null));
    const k = await kaart(page);
    // v382: het maandbudget van september als afgesloten kaart: uitgegeven, budget en wat eronder bleef
    expect([k.insmaand, k.insuit, k.insbudget]).toEqual(['af', '1866', '3376']);
    expect(k.txt).toContain('€1.510 onder budget');
    expect(await page.innerText('#insFilter')).toContain('Vorige maand');
    // v382: weg, de kop-zin over september (het kop-inzicht is vervallen)
  });
  test('laatste drie maanden: het totaal tegen de budgetten van die drie maanden', async ({ page }) => {
    await open(page);
    await page.evaluate(() => insFilterZet('3', null));
    const k = await kaart(page);
    expect([k.insmaand, k.insuit]).toEqual(['af', '5022']);
    expect(+k.insbudget).toBe(await page.evaluate(() => ['2026-07', '2026-08', '2026-09'].reduce((a, m) => a + maandStaaf(m).budget, 0)).then((x) => Math.round(x)));
    // v382: weg, "gemiddeld €1.674 per maand" (de sub van de tegel uitgegeven)
  });
  test('soort vast: uitgegeven telt alleen de vaste lasten, tegen wat er tot vandaag verwacht was', async ({ page }) => {
    await open(page, { dag: '2026-10-16', extraTx: [{ id: 'nf10', date: '2026-10-15', amount: -43, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' }] });
    await page.evaluate(() => insFilterZet(null, 'vast'));
    const k = await kaart(page);
    expect(+k.insuit).toBe(43); expect(+k.instempoverschil).toBe(43 - 580);
    expect(k.txt).toContain('€537 onder tempo');
  });
});

test.describe('j · de sheets tellen op tot hun getal', () => {
  for (const k of ['potjes', 'vast', 'cash']) {
    test(k, async ({ page }) => {
      await open(page);
      await page.evaluate((x) => openInsTegel(x), k);   // v365: cash opent vanaf Home
      const r = await page.evaluate(() => { const s = document.getElementById('insTegelSheet'); return { w: +s.dataset.inswaarde, d: [...s.querySelectorAll('[data-insrij]')].map((e) => +e.dataset.insrij) }; });
      expect(r.d.length).toBeGreaterThan(0);
      expect(Math.round(r.d.reduce((a, b) => a + b, 0))).toBe(r.w);
    });
  }
  test('de potjes-sheet is wat de kaart "in potjes" noemt', async ({ page }) => {
    await open(page);
    const v = +(await page.getAttribute('#insMaand [data-insleg="nogpot"]', 'data-v'));
    await page.click('#insMaand [data-insleg="nogpot"]');
    expect(+(await page.getAttribute('#insTegelSheet', 'data-inswaarde'))).toBe(v);
  });
  test('ontvangen en sparen', async ({ page }) => {
    await open(page);
    await page.evaluate(() => openInsTegel('ontvangen'));   // v365: vanaf Home
    let r = await page.evaluate(() => { const s = document.getElementById('insTegelSheet'); return [+s.dataset.inswaarde, +s.querySelector('[data-insnorm]').dataset.insnorm, +s.querySelector('[data-insbinnen]').dataset.insbinnen]; });
    expect(r).toEqual([5216, 5216, 0]);
    await page.evaluate(() => { closeSheet(); openInsTegel('sparen'); });
    r = await page.evaluate(() => { const s = document.getElementById('insTegelSheet'); return [+s.dataset.inswaarde, +s.querySelector('[data-insinleg]').dataset.insinleg, ...[...s.querySelectorAll('[data-insspaartx]')].map((e) => +e.dataset.insspaartx)]; });
    /* v386: de EUR 231 kwam uit vrij spaargeld (EUR 9.231 aan het begin van de maand tegen EUR 9.000 toegewezen).
       v397: keuze A vervalt; hij gaat standaard terug (naar vrij spaargeld), dus nog te sparen is 2.200 + 231. */
    expect(r).toEqual([2431, 2200, -231]);
    expect(await page.locator('#insTegelSheet [data-spaarvrijopname]').count()).toBe(0);
  });
});

test.describe('k · hoogtes op 360 en 390px', () => {
  for (const w of [360, 390]) {
    test(`${w}px: geen overloop, en de maandkaart boven de vouw`, async ({ page }) => {
      const h = w === 360 ? 640 : 844;
      await open(page, null, { width: w, height: h });
      await kies(page);
      await page.evaluate(() => verschuivingToggle());   // ook open loopt hij niet over
      const r = await page.evaluate(() => { const s = document.getElementById('s-ins'); const b = (id) => { const e = document.getElementById(id); const q = e.getBoundingClientRect(); return { top: Math.round(q.top + scrollY), h: Math.round(q.height) }; };
        const over = [...s.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > innerWidth + 0.5 || q.left < -0.5); }).length;
        const nav = document.querySelector('.nav'); return { over, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, maand: b('insMaand'), week: b('insWeek'), versch: b('insVersch'), vouw: innerHeight - (nav ? nav.getBoundingClientRect().height : 0) }; });
      console.log(w, JSON.stringify(r));
      expect(r.over).toBe(0); expect(r.sw).toBeLessThanOrEqual(r.cw);
      expect(r.maand.top + r.maand.h).toBeLessThanOrEqual(r.vouw);
    });
  }
});

/* v359, keuze van de gebruiker: AMBER ALLEEN MET DE REDEN IN DE TEKST, nooit kleur alleen.
   v382: op de maandkaart. Wat amber kan zijn: het verschil met het tempo (boven tempo), een afgesloten periode boven zijn
   budget, de regel "boven budget" en "zonder potje". Elk amber element op de kaart draagt zijn reden in zijn eigen tekst. */
test.describe('l · amber op de maandkaart draagt zijn reden', () => {
  const reden = /boven (tempo|budget)|zonder potje/;
  const amber = (page) => page.evaluate(() => { const p = document.createElement('span'); p.style.color = 'var(--amber)'; document.body.appendChild(p); const a = getComputedStyle(p).color; p.remove();
    return [...document.querySelectorAll('#insMaand *')].filter((e) => getComputedStyle(e).color === a && e.innerText.trim() && ![...e.children].some((c) => getComputedStyle(c).color === a)).map((e) => e.innerText.trim()); });
  test('boven het tempo: het bedrag boven je tempo staat in de tekst', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'x1', date: '2026-10-06', amount: -800, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    const k = await kaart(page);
    expect(+k.instempoverschil, 'deze stand ligt werkelijk boven het tempo').toBeGreaterThan(0);
    const A = await amber(page);
    expect(A).toContain(`€${(+k.instempoverschil).toLocaleString('nl-NL')} boven tempo`);
    for (const t of A) expect(t).toMatch(reden);
  });
  // v382: weg, "zonder tempo (minder dan drie afgeronde maanden)"; het trap-tempo bestaat altijd zodra er een budget is.
  test('een afgesloten maand boven zijn budget: het bedrag boven je budget staat in de tekst', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { SET.budgetHist = Object.assign({}, SET.budgetHist, { '2026-09': { boodschappen: 500 } }); save(); insFilterZet('vorige', null); });
    const k = await kaart(page);
    const over = +k.insuit - +k.insbudget;
    expect(over, 'september ligt werkelijk boven zijn bewaarde budget').toBeGreaterThan(0);
    const A = await amber(page);
    expect(A).toContain(`€${over.toLocaleString('nl-NL')} boven budget`);
    for (const t of A) expect(t).toMatch(reden);
  });
  test('geen enkel amber element op de kaart zonder reden, in elke periode', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'x1', date: '2026-10-06', amount: -800, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    let n = 0;
    for (const per of ['nu', 'vorige', '3', '12']) for (const so of ['alle', 'var', 'vast']) {
      await page.evaluate(([p, s]) => insFilterZet(p, s), [per, so]);
      const A = await amber(page); n += A.length;
      for (const t of A) expect(t, per + '/' + so).toMatch(reden);
    }
    expect(n, 'er staat in deze stand werkelijk amber').toBeGreaterThan(0);
  });
});

/* v359, keuze van de gebruiker: "loopt (weer) voor" is minstens EUR 10 EN minstens 25 procent meer dan gewoonlijk in
   dezelfde dagen. */
test.describe('m · loopt voor: tien euro en een kwart', () => {
  test('de regel op een plek, met beide eisen en zonder gewoon bedrag alleen het bedrag', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => [[110, 100], [124, 100], [125, 100], [19, 10], [20, 10], [10, 0], [9, 0]].map(([uit, typisch]) => insLooptVoor({ uit, typisch })));
    expect(r).toEqual([false, false, true, false, true, true, false]);
    expect(await page.evaluate(() => INS_PATROON.voorDeel)).toBe(0.25);
  });
  test('herhaalt zich valt weg als het verschil boven de tien euro maar onder een kwart ligt', async ({ page }) => {
    await open(page);
    const x = await page.evaluate(() => { const p = maandVooruit().potjes.find((y) => y.k === 'uiteten'); return { uit: p.uit, typisch: p.typisch, el: maandVooruit().el }; });
    expect(await page.evaluate(() => insPatronen('alle').map((p) => p.soort + ':' + p.k))).toContain('herhaalt:uiteten');
    // het gewone bedrag in dezelfde dagen ophogen tot uit/1,2: het verschil is dan een zesde, ruim boven EUR 10
    const E = Math.ceil(x.uit / 1.2 - x.typisch);
    expect(E).toBeGreaterThan(0);
    const extra = ['2026-07', '2026-08', '2026-09'].map((m) => ({ id: 'ue' + m, date: m + '-02', amount: -E, name: 'Cafe De Zwaan', desc: 'BEA, BETAALPAS CAFE DE ZWAAN' }));
    await open(page, { extraTx: extra });
    const y = await page.evaluate(() => { const p = maandVooruit().potjes.find((q) => q.k === 'uiteten'); return { uit: p.uit, typisch: p.typisch, pat: insPatronen('alle').map((q) => q.soort + ':' + q.k) }; });
    expect(y.uit - y.typisch, 'het verschil haalt de tien euro nog').toBeGreaterThanOrEqual(10);
    expect(y.uit - y.typisch, 'maar niet het kwart').toBeLessThan(y.typisch * 0.25);
    expect(y.pat).not.toContain('herhaalt:uiteten');
  });
});
