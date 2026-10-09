/* v359: INZICHTEN ALS DASHBOARD, op de stand van 7 oktober 2026 (tests/inzichten-stand.js).
   Inzichten observeert, Grip stuurt: een filter, KPI-tegels met een sheet per tegel, een kop-inzicht met de
   teller naar de patronen, de maanden met de bridge, de keuzekaart en vier soorten patronen. */
const { test, expect } = require('@playwright/test');
const S = require('./inzichten-stand');

async function open(page, o, vp) {
  await S.boot(page, o);
  if (vp) await page.setViewportSize(vp);
  await page.evaluate(() => go('ins'));
}
const tegels = (page) => page.evaluate(() => [...document.querySelectorAll('#insTegels [data-instegel]')].map((el) => ({
  key: el.dataset.instegel, st: el.className.replace('ins-kt', '').replace('mb-kt', '').trim(),
  lab: el.querySelector('.lb').innerText, val: el.querySelector('.vl').innerText, ms: el.querySelector('.ms').innerText })));
const tegel = async (page, k) => (await tegels(page)).find((t) => t.key === k);

test.describe('a · de tegels van 7 oktober', () => {
  /* v365: drie tegels als delen van het maandbudget; ontvangen staat op Home, sparen op Plan en contant in het saldo. */
  test('de drie tegels met hun bedragen, in de volgorde van de balk', async ({ page }) => {
    await open(page);
    const T = await tegels(page);
    expect(T.map((t) => t.key)).toEqual(['uitgegeven', 'vast', 'potjes']);
    expect(T.map((t) => t.val)).toEqual(['€406', '€817', '€2.153']);
    expect(T[0].ms).toBe('tot vandaag mocht €578 · je zit €172 eronder');
    expect(T[1].ms).toBe('van €817 deze maand');
    expect(T[2].ms).toBe('al bestemd, verdeeld over je potjes');   // v367: geen tweede dagbedrag naast Home
  });
  test('de status blijft: uitgegeven en potjes groen, vast grijs', async ({ page }) => {
    await open(page);
    expect((await tegels(page)).map((t) => t.st)).toEqual(['grn', 'gry', 'grn']);
  });
  test('boven het tempo is uitgegeven amber, en een potje boven zijn bedrag maakt potjes amber', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'x1', date: '2026-10-06', amount: -800, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    const T = await tegels(page);
    expect(T[0].st).toBe('amb'); expect(T[0].ms).toMatch(/· €[\d.]+ boven je tempo$/);
    expect(T.find((t) => t.key === 'potjes').st).toBe('amb');
  });
  test('het budget is uitgegeven plus nog in potjes plus nog te betalen (v327)', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({ b: Math.round(totals(thisYM()).budget), T: [...document.querySelectorAll('#insTegels [data-instegel]')].map((e) => e.querySelector('.vl').innerText) }));
    expect(r.b).toBe(3376);
    expect(406 + 2153 + 817).toBe(r.b);
  });
  test('zonder boekingen van deze maand is uitgegeven onbekend, en geen nul', async ({ page }) => {
    await open(page, { tot: '2026-10-01' });
    const t = await tegel(page, 'uitgegeven');
    expect(t.val).toBe('onbekend'); expect(t.ms).toBe('nog geen boekingen van deze maand'); expect(t.st).toBe('gry');
  });
  // v365: nog te ontvangen staat op Home
  test('nog te ontvangen staat op Home op nul met "alles is binnen" na de betaling', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'sal10', date: '2026-10-06', amount: 5216, name: 'Werkgever', desc: 'SALARIS LOON' }] });
    await page.evaluate(() => go('dash'));
    const t = await page.locator('#homeOntvangen').innerText();
    expect(t).toContain('€0'); expect(t).toContain('alles is binnen');
  });
});

test.describe('b · het tempo telt een vaste last op zijn datum', () => {
  test('op 7 oktober is het tempo het variabele deel naar rato, niet het budget naar rato', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => { const t = insTempo(); return { t, oud: Math.round(totals(thisYM()).budget * 7 / 31), V: maandVooruit().variabel.budget }; });
    expect(r.oud).toBe(762);
    expect(r.V).toBe(2559);
    expect(r.t.varNaar).toBe(Math.round(2559 * 7 / 31));
    expect(r.t.vastTot).toBe(0);
    expect(r.t.mocht).toBe(578);
  });
  test('na de lease telt hij voor zijn hele bedrag mee, ook als hij nog niet is afgeschreven', async ({ page }) => {
    await open(page, { dag: '2026-10-16', extraTx: [{ id: 'nf10', date: '2026-10-15', amount: -43, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' }] });
    const t = await page.evaluate(() => insTempo());
    expect(t.betaald).toBe(43);
    expect(t.achter.map((x) => [x.naam, x.bedrag])).toEqual([['Hiltermann Lease', 537]]);
    expect(t.mocht).toBe(Math.round(2559 * 16 / 31) + 43 + 537);
  });
  test('een vaste last die nog moet komen telt niet', async ({ page }) => {
    await open(page, { dag: '2026-10-12' });
    const t = await page.evaluate(() => insTempo());
    expect(t.achter).toEqual([]);
    expect(t.mocht).toBe(Math.round(2559 * 12 / 31));
  });
  test('de sheet van uitgegeven telt op tot de tegel en tot het tempo', async ({ page }) => {
    await open(page, { dag: '2026-10-16', extraTx: [{ id: 'nf10', date: '2026-10-15', amount: -43, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' }] });
    await page.click('[data-instegel="uitgegeven"]');
    const r = await page.evaluate(() => { const s = document.getElementById('insTegelSheet');
      return { w: +s.dataset.inswaarde, delen: [...s.querySelectorAll('[data-insrij]')].map((e) => +e.dataset.insrij),
        tempo: +s.querySelector('[data-instempo]').dataset.instempo, tdelen: [...s.querySelectorAll('[data-instempodeel]')].map((e) => +e.dataset.instempodeel), mocht: insTempo().mocht }; });
    expect(r.delen.reduce((a, b) => a + b, 0)).toBe(r.w);
    expect(r.tdelen.reduce((a, b) => a + b, 0)).toBe(r.tempo);
    expect(r.tempo).toBe(r.mocht);
  });
});

test.describe('c · de tegels passen zich aan', () => {
  /* v365: bij alle uitgaven met een budget zijn het altijd de drie delen van het maandbudget. */
  test('zonder sparen en contant: dezelfde drie delen', async ({ page }) => {
    await open(page, { zonderSparen: true, zonderContant: true });
    expect((await tegels(page)).map((t) => t.key)).toEqual(['uitgegeven', 'vast', 'potjes']);
  });
  test('zonder herkende incasso en zonder inkomen: nog steeds drie delen, vast op nul', async ({ page }) => {
    await open(page, { zonderVast: true, zonderInkomen: true, zonderSparen: true, set: { income: 0 } });
    const T = await tegels(page);
    expect(T.map((t) => t.key)).toEqual(['uitgegeven', 'vast', 'potjes']);
    expect(T[1].val).toBe('€0');
  });
  test('een opname zonder telling geeft geen contanttegel en geen splitsing op Home', async ({ page }) => {
    await open(page, { zonderContant: true, extraTx: [{ id: 'gea', date: '2026-08-12', amount: -50, name: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT' }] });
    expect((await tegels(page)).map((t) => t.key)).not.toContain('cash');
    await page.evaluate(() => go('dash'));
    expect(await page.locator('[data-saldosplit]').count()).toBe(0);
  });
  test('de tegelkeuze onthoudt alleen nog vast', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { delete SET.contant; SET.savingAmount = 0; save(); renderIns(); });
    expect(await page.evaluate(() => SET.insTegels)).toEqual({ maand: '2026-10', aan: ['vast'] });
  });
  test('een nieuwe maand begint opnieuw', async ({ page }) => {
    await open(page, { dag: '2026-11-03', zonderContant: true, set: { insTegels: { maand: '2026-10', aan: ['vast', 'ontvangen', 'sparen', 'cash'] }, budgetMonth: '2026-10' } });
    expect((await tegels(page)).map((t) => t.key)).not.toContain('cash');
    expect(await page.evaluate(() => SET.insTegels.maand)).toBe('2026-11');
  });
});

test.describe('d · de keuzekaart', () => {
  test('staat standaard op tegen je potje, met de legenda in de kaart', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => { const k = document.getElementById('insKeuze');
      openInsAlle('potje');   // v367: de legenda staat bij de volle lijst; de kaart draagt de uitschieters
      return { stand: k.dataset.inskeuzestand, on: k.querySelector('.ins-tog .on').dataset.inskeuze, leg: document.querySelector('#insAlle .ins-leg').innerText, set: SET.insKeuze };
    });
    expect(r.stand).toBe('potje'); expect(r.on).toBe('potje'); expect(r.set).toBeUndefined();
    expect(r.leg).toContain('normaal op dag 7');
  });
  test('per potje wat er uit is tegen het potje, met de streep op wat normaal is in dezelfde dagen', async ({ page }) => {
    await open(page);
    await page.evaluate(() => openInsAlle('potje'));   // v367: de volle lijst staat in de drilldown
    const r = await page.evaluate(() => [...document.querySelectorAll('#insAlle [data-inspotrij]')].map((e) => [e.dataset.inspotrij, +e.dataset.uit, +e.dataset.potje, e.dataset.normaal == null ? null : +e.dataset.normaal, e.querySelector('em') ? e.querySelector('em').style.left : null]));
    const u = r.find((x) => x[0] === 'uiteten');
    expect(u.slice(0, 4)).toEqual(['uiteten', 110, 150, 40]);
    expect(u[4]).toBe((40 / 150 * 100).toFixed(1) + '%');
    expect(r.map((x) => x[1])).toEqual([...r.map((x) => x[1])].sort((a, b) => b - a));
  });
  test('de keuze wordt onthouden', async ({ page }) => {
    await open(page);
    await page.click('[data-inskeuze="vorige"]');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).insKeuze)).toBe('vorige');
    await page.evaluate(() => { go('dash'); go('ins'); });
    expect(await page.getAttribute('#insKeuze', 'data-inskeuzestand')).toBe('vorige');
    await open(page, { set: { insKeuze: 'vorige' } });
    expect(await page.getAttribute('#insKeuze', 'data-inskeuzestand')).toBe('vorige');
  });
  test('tegen vorige maanden: het verschil met dezelfde dagen, links minder en rechts meer', async ({ page }) => {
    await open(page);
    await page.click('[data-inskeuze="vorige"]');
    expect(await page.innerText('#insKeuze')).toContain('dezelfde eerste 7 dagen in juli, augustus en september');
    await page.evaluate(() => openInsAlle('vorige'));   // v367: de volle lijst staat in de drilldown
    const r = await page.evaluate(() => [...document.querySelectorAll('#insAlle [data-insvorigrij]')].map((e) => [e.dataset.insvorigrij, +e.dataset.verschil, !!e.querySelector('.l i'), !!e.querySelector('.r i')]));
    expect(r.find((x) => x[0] === 'uiteten').slice(0, 2)).toEqual(['uiteten', 70]);
    expect(r.find((x) => x[0] === 'boodschappen').slice(0, 4)).toEqual(['boodschappen', -30, true, false]);
    expect(r.find((x) => x[0] === 'vervoer').slice(0, 4)).toEqual(['vervoer', 99, false, true]);
    expect(r.map((x) => x[1])).toEqual([...r.map((x) => x[1])].sort((a, b) => b - a));
  });
});

test.describe('e · geen handeling op Inzichten', () => {
  const MAG = ['openInsFilter', 'openInsTegel', 'insNaarPatronen', 'insNulToggle', 'brugKies', 'brugTegen', 'brugRest', 'insKeuzeZet', 'insNaarGrip', 'toggleCollap', 'showTip', 'event.stopPropagation', 'openInsAlle'];
  const MAG_SHEET = MAG.concat(['closeSheet', 'openMonthSpend', 'openCategory', 'openCsvDubbel', 'openMt940Dubbel', 'insFilterZet']);
  const aanroepen = (root) => [...root.querySelectorAll('[onclick]')].flatMap((e) => e.getAttribute('onclick').split(';').map((x) => x.trim().split('(')[0]).filter(Boolean));
  test('het scherm draagt alleen tikken die iets openen of naar Grip verwijzen', async ({ page }) => {
    await open(page);
    await page.evaluate(() => brugKies('2026-08'));
    const r = await page.evaluate((src) => { const f = new Function('root', 'return (' + src + ')(root)'); return f(document.getElementById('s-ins')); }, aanroepen.toString());
    expect(r.length).toBeGreaterThan(10);
    expect(r.filter((x) => !MAG.includes(x))).toEqual([]);
    expect(await page.$$eval('#s-ins .btn, #s-ins button', (e) => e.length)).toBe(0);
  });
  test('de sheets achter de tegels en het filter schrijven niets en dragen geen handeling', async ({ page }) => {
    await open(page);
    const r = await page.evaluate((src) => {
      const f = new Function('root', 'return (' + src + ')(root)');
      const voor = localStorage.getItem('minder_set'); let schrijf = 0; const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function () { schrijf++; return orig.apply(this, arguments); };
      const uit = [];
      for (const k of ['uitgegeven', 'potjes', 'vast', 'ontvangen', 'sparen', 'cash']) { openInsTegel(k); uit.push(...f(document.getElementById('sheet'))); closeSheet(); }
      openInsFilter(); const filt = f(document.getElementById('sheet')); closeSheet();
      Storage.prototype.setItem = orig;
      return { uit, filt, schrijf, gelijk: voor === localStorage.getItem('minder_set') };
    }, aanroepen.toString());
    expect(r.schrijf).toBe(0); expect(r.gelijk).toBe(true);
    expect(r.uit.filter((x) => !MAG_SHEET.includes(x))).toEqual([]);
    expect(r.filt.filter((x) => x !== 'insFilterZet')).toEqual([]);
  });
  test('de oude stand-kaart, "Wat opvalt" en "Nog deze maand" staan er niet meer', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({ ids: ['insStand', 'insNogLijst', 'insSignalRows'].filter((i) => document.getElementById(i)), txt: document.getElementById('s-ins').innerText }));
    expect(r.ids).toEqual([]);
    expect(r.txt).not.toMatch(/WAT OPVALT|NOG DEZE MAAND/i);
  });
});

test.describe('f · het kop-inzicht', () => {
  test('een zin in euro\'s, zonder percentage, met de teller naar de patronen', async ({ page }) => {
    await open(page, null, { width: 360, height: 640 });
    const r = await page.evaluate(() => ({ zin: document.querySelector('#insKop > div').innerText, chip: document.querySelector('[data-patronenteller]').innerText }));
    expect(r.zin).toBe('Uit eten & café loopt weer voor: verwacht €130 boven je potje, net als in september (€194 erboven).');
    expect(r.zin).not.toContain('%');
    expect(r.chip).toBe('4 patronen ›');
    await page.click('[data-patronenteller]');
    await page.waitForSelector('#insPatronenSheet #insPatronen');   // v365: de teller opent een sheet
  });
  test('zonder drie afgeronde maanden zegt hij dat eerlijk, zonder teller', async ({ page }) => {
    await open(page, { vanaf: '2026-08-01' });
    const r = await page.evaluate(() => ({ zin: document.querySelector('#insKop').innerText, n: document.querySelectorAll('[data-patronenteller]').length, p: !!document.getElementById('insPatronen') }));
    expect(r.zin).toBe('Nog geen patronen: na drie maanden boekingen ziet de app wat bij jou gewoon is.');
    expect(r.n).toBe(0); expect(r.p).toBe(false);
  });
});

test.describe('g · de vier patronen', () => {
  // v365: de patronen staan in een sheet achter "N patronen ›"
  test('elk patroon met wat er gebeurt, gezien in, en de verwijzing naar Grip', async ({ page }) => {
    await open(page); await page.click('[data-patronenteller]');
    const P = await page.evaluate(() => [...document.querySelectorAll('[data-patroon]')].map((e) => ({ s: e.dataset.patroon, k: e.dataset.patk,
      h: e.querySelector('.ins-pat-h').innerText, t: e.querySelector('.ins-pat-h').nextElementSibling.innerText, b: e.querySelector('[data-patbron]').innerText, g: !!e.querySelector('[data-insgrip]'),
      dot: e.querySelector('.ins-pat-tg i').style.background })));
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
    expect(P.map((p) => p.dot)).toEqual(['var(--red)', 'var(--amber)', 'var(--blue)', 'var(--green)']);
  });
  test('de labels zijn rustig: geen hoofdletters en geen gekleurd vlak', async ({ page }) => {
    await open(page); await page.click('[data-patronenteller]');
    const r = await page.evaluate(() => { const e = document.querySelector('.ins-pat-tg'); const cs = getComputedStyle(e); return { tt: cs.textTransform, bg: cs.backgroundColor, txt: e.innerText }; });
    expect(r.tt).toBe('none'); expect(r.bg).toBe('rgba(0, 0, 0, 0)'); expect(r.txt).toBe('herhaalt zich');
  });
  test('bijsturen op Grip opent Grip, met het potje erbij', async ({ page }) => {
    await open(page); await page.click('[data-patronenteller]');
    await page.click('[data-patroon="herhaalt"] [data-insgrip]');
    expect(await page.evaluate(() => ({ s: document.querySelector('.screen.active').id, p: window._gripPotje, open: document.getElementById('sheetBg').classList.contains('show') })))
      .toEqual({ s: 's-maand', p: 'uiteten', open: true });
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

test.describe('h · over de maanden', () => {
  test('drie afgesloten maanden en de lopende, met het bedrag in de balk', async ({ page }) => {
    await open(page);
    const r = await page.evaluate(() => ({ b: [...document.querySelectorAll('#insSpendChart [data-maandbalk]')].map((e) => [e.dataset.maandbalk, e.hasAttribute('data-lopend')]),
      bed: [...document.querySelectorAll('#insSpendChart [data-balkbedrag]')].map((e) => +e.dataset.balkbedrag), staaf: ['2026-07', '2026-08', '2026-09'].map((m) => Math.round(maandStaaf(m).spend)),
      txt: document.getElementById('insSpendChart').textContent }));
    expect(r.b).toEqual([['2026-07', false], ['2026-08', false], ['2026-09', false], ['2026-10', true]]);
    expect(r.bed).toEqual([...r.staaf, 406]);
    expect(r.txt).toContain('t/m 7 okt'); expect(r.txt).toContain('budget €3.376');
  });
  test('het filter op twaalf maanden zet er twaalf afgesloten naast de lopende', async ({ page }) => {
    await open(page);
    await page.evaluate(() => insFilterZet('12', null));
    expect(await page.$$eval('#insSpendChart [data-maandbalk]', (e) => e.length)).toBe(13);
  });
  test('een tik op een maand opent de bridge met tegen budget en tegen de maand ervoor', async ({ page }) => {
    await open(page);
    await page.evaluate(() => brugKies('2026-08'));
    const r = await page.evaluate(() => [...document.querySelectorAll('#insBrug [data-brugtegen]')].map((e) => e.innerText));
    expect(r).toEqual(['Tegen budget', 'Tegen juli']);
  });
  test('bij variabel staat er geen budgetlijn en geen bridge, en dat staat erbij', async ({ page }) => {
    await open(page);
    await page.evaluate(() => insFilterZet(null, 'var'));
    const r = await page.evaluate(() => ({ lijn: document.querySelectorAll('#insSpendChart line[stroke-dasharray]').length, tik: document.querySelectorAll('#insSpendChart [onclick]').length, uitleg: !!document.querySelector('[data-insgeenbudget]') }));
    expect(r).toEqual({ lijn: 0, tik: 0, uitleg: true });
  });
});

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
    const T = await tegels(page);
    // v365: het maandbudget van september in twee delen
    expect(T.map((t) => [t.key, t.lab, t.val])).toEqual([['uitgegeven', 'Uitgegeven', '€1.866'], ['over', 'Over', '€1.510']]);
    expect(await page.innerText('#insFilter')).toContain('Vorige maand');
    expect(await page.innerText('#insKop')).toBe('In september gaf je €1.866 uit, €1.510 onder je budget; Uit eten & café droeg het meest erboven (+€194).');
  });
  test('laatste drie maanden: het totaal en het gemiddelde per maand', async ({ page }) => {
    await open(page);
    await page.evaluate(() => insFilterZet('3', null));
    const t = await tegel(page, 'uitgegeven');
    expect(t.val).toBe('€5.022'); expect(t.ms).toBe('gemiddeld €1.674 per maand');
  });
  test('soort vast: uitgegeven telt alleen de vaste lasten, tegen wat er tot vandaag verwacht was', async ({ page }) => {
    await open(page, { dag: '2026-10-16', extraTx: [{ id: 'nf10', date: '2026-10-15', amount: -43, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' }] });
    await page.evaluate(() => insFilterZet(null, 'vast'));
    const t = await tegel(page, 'uitgegeven');
    expect(t.val).toBe('€43'); expect(t.ms).toBe('tot vandaag verwacht €580 · je zit €537 eronder');
  });
});

test.describe('j · de sheets tellen op tot hun tegel', () => {
  for (const k of ['potjes', 'vast', 'cash']) {
    test(k, async ({ page }) => {
      await open(page);
      await page.evaluate((x) => openInsTegel(x), k);   // v365: cash opent vanaf Home
      const r = await page.evaluate(() => { const s = document.getElementById('insTegelSheet'); return { w: +s.dataset.inswaarde, d: [...s.querySelectorAll('[data-insrij]')].map((e) => +e.dataset.insrij) }; });
      expect(r.d.length).toBeGreaterThan(0);
      expect(Math.round(r.d.reduce((a, b) => a + b, 0))).toBe(r.w);
    });
  }
  test('ontvangen en sparen', async ({ page }) => {
    await open(page);
    await page.evaluate(() => openInsTegel('ontvangen'));   // v365: vanaf Home
    let r = await page.evaluate(() => { const s = document.getElementById('insTegelSheet'); return [+s.dataset.inswaarde, +s.querySelector('[data-insnorm]').dataset.insnorm, +s.querySelector('[data-insbinnen]').dataset.insbinnen]; });
    expect(r).toEqual([5216, 5216, 0]);
    await page.evaluate(() => { closeSheet(); openInsTegel('sparen'); });
    r = await page.evaluate(() => { const s = document.getElementById('insTegelSheet'); return [+s.dataset.inswaarde, +s.querySelector('[data-insinleg]').dataset.insinleg, ...[...s.querySelectorAll('[data-insspaartx]')].map((e) => +e.dataset.insspaartx)]; });
    expect(r).toEqual([2431, 2200, -231]);
  });
});

test.describe('k · hoogtes op 360 en 390px', () => {
  for (const w of [360, 390]) {
    test(`${w}px: geen overloop, en de tegels en het kop-inzicht boven de vouw`, async ({ page }) => {
      const h = w === 360 ? 640 : 844;
      await open(page, null, { width: w, height: h });
      const r = await page.evaluate(() => { const s = document.getElementById('s-ins'); const b = (id) => { const e = document.getElementById(id); const q = e.getBoundingClientRect(); return { top: Math.round(q.top + scrollY), h: Math.round(q.height) }; };
        const over = [...s.querySelectorAll('*')].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && (q.right > innerWidth + 0.5 || q.left < -0.5); }).length;
        const nav = document.querySelector('.nav'); return { over, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, tegels: b('insTegels'), kop: b('insKop'), maanden: b('insSpendCard'), keuze: b('insKeuze'), budget: b('insMaandBudget'), vouw: innerHeight - (nav ? nav.getBoundingClientRect().height : 0) }; });
      console.log(w, JSON.stringify(r));
      expect(r.over).toBe(0); expect(r.sw).toBeLessThanOrEqual(r.cw);
      expect(r.kop.top + r.kop.h).toBeLessThanOrEqual(r.vouw);
    });
  }
});

/* v359, keuze van de gebruiker: AMBER OP UITGEGEVEN ALLEEN MET DE REDEN IN DE TEKST, nooit kleur alleen. Drie takken
   kunnen amber geven (boven het tempo, zonder tempo boven het budget, en een afgesloten periode boven het budget), en
   elk ervan staat hier in een stand die hem werkelijk amber maakt. */
test.describe('l · amber op uitgegeven draagt zijn reden', () => {
  const reden = /€[\d.]+ boven je (tempo|budget|inkomen-limiet)/;
  test('boven het tempo: het bedrag boven je tempo staat in de tekst', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'x1', date: '2026-10-06', amount: -800, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    const t = await tegel(page, 'uitgegeven');
    expect(t.st).toBe('amb'); expect(t.ms).toMatch(reden);
    const r = await page.evaluate(() => { const T = insTegelsNu('alle').find((x) => x.key === 'uitgegeven'); return T.waarde - T.mocht; });
    expect(t.ms).toContain(`€${r.toLocaleString('nl-NL')} boven je tempo`);
  });
  test('zonder tempo (minder dan drie afgeronde maanden): het bedrag boven je budget staat in de tekst', async ({ page }) => {
    await open(page, { vanaf: '2026-08-01', extraTx: [{ id: 'x2', date: '2026-10-06', amount: -4000, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    const r = await page.evaluate(() => ({ tp: (() => { try { return insTempo(); } catch (_) { return null; } })(), b: Math.round(totals(thisYM()).budget) }));
    expect(r.tp, 'deze stand heeft werkelijk geen tempo').toBeNull();
    const t = await tegel(page, 'uitgegeven');
    expect(t.st).toBe('amb'); expect(t.ms).toMatch(/^van €[\d.]+ budget · €[\d.]+ boven je budget$/);
  });
  test('een afgesloten maand boven zijn budget: het bedrag boven je budget staat in de tekst', async ({ page }) => {
    await open(page);
    await page.evaluate(() => { SET.budgetHist = Object.assign({}, SET.budgetHist, { '2026-09': { boodschappen: 500 } }); save(); insFilterZet('vorige', null); });
    const t = await tegel(page, 'uitgegeven');
    expect(t.st).toBe('amb'); expect(t.ms).toBe('van €500 budget · €1.366 boven je budget');
  });
  test('geen enkele amber tegel uitgegeven zonder reden, in elke periode', async ({ page }) => {
    await open(page, { extraTx: [{ id: 'x1', date: '2026-10-06', amount: -800, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN' }] });
    for (const per of ['nu', 'vorige', '3', '12']) for (const so of ['alle', 'var', 'vast']) {
      await page.evaluate(([p, s]) => insFilterZet(p, s), [per, so]);
      const t = await tegel(page, 'uitgegeven');
      if (t.st === 'amb') expect(t.ms, per + '/' + so).toMatch(reden);
    }
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
