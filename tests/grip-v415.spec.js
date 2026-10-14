/* v415: SHEETS SLUITEN, SIGNALEN AF TE SLUITEN, BRUG. Op grip-v409-stand en grip-kring-stand (10 oktober 2026).
   1 na een keuze in een sheet sluit de sheet, Let op (en de brug en de meters) rekenen meteen opnieuw, en een toast van 5 s
     zegt "<post> gestopt · ongedaan maken".
   2 zonder potje: alleen met minstens 2 van 3 maanden van EUR 25 of meer; "Geen potje nodig · niet meer vragen", en de vraag
     komt pas terug bij een maand van minstens 2x het hoogste bedrag.
   3 eenmalig: de sheet begint met "Klopt, eenmalig", die het signaal voor die boeking sluit.
   4 een te ruim potje blijft een grijze stap "niet gebruikt" en een feitregel, ook na "laten staan".
   5 een samengevoegde stap onder EUR 10 schuift bij de dichtstbijzijnde stap aan dezelfde kant. */
const { test, expect } = require('@playwright/test');
const S = require('./grip-v409-stand');
const K = require('./grip-kring-stand');
const { bootStand } = require('./standkaart-sluit.fixture');

const letOp = (page) => page.evaluate(() => gripLetOpItems(maandMetAfspraak(maandMetAccept(maandRegels()).concat(maandStructureel())), valtOpSignals(thisYM()), [])
  .map(x => ({ soort: x.soort, key: x.key, naam: x.naam, act: x.act })));
const post = (page, naam, bedrag, cat, data) => page.evaluate(({ MAIN, naam, bedrag, cat, data }) => {
  for (const d of data) { const t = { id: 'v415' + naam + d, date: d, amount: -bedrag, acc: MAIN, name: naam, desc: 'SEPA INCASSO ' + naam.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = cat; }
  save(); return recurringSchedule(true).find(s => s.name === naam).key; }, { MAIN: S.MAIN, naam, bedrag, cat, data });
const uitgave = (page, rijen) => page.evaluate(({ MAIN, rijen }) => {
  for (const [d, a, n, c] of rijen) { const t = { id: 'v415u' + n + d + a, date: d, amount: a, acc: MAIN, name: n, desc: 'BEA ' + n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = c; }
  save(); }, { MAIN: S.MAIN, rijen });
const open = (page) => page.evaluate(() => document.getElementById('sheetBg').classList.contains('show'));
const letOpDom = (page) => page.evaluate(() => (window._gripLetOpL || []).map(x => x.soort + '|' + (x.key || '')));

test.describe('1 · na een keuze sluit de sheet en rekent Let op meteen opnieuw', () => {
  test('verlopen post: tik in Let op, gestopt: sheet weg, regel weg, toast met ongedaan maken, en ongedaan zet hem terug', async ({ page }) => {
    await S.boot(page);
    const key = await post(page, 'Oude Sportschool', 40, 'sport', ['2026-05-13', '2026-06-13', '2026-07-13']);
    await page.evaluate(() => { window._gripTab = 'zien'; go('maand'); });
    expect(await letOpDom(page)).toContain('verlopen|' + key);
    await page.evaluate((key) => openPostStatus(key), key);
    expect(await open(page)).toBe(true);
    await page.locator('[data-postzet="gestopt"]').click();
    expect(await open(page)).toBe(false);
    expect(await letOpDom(page)).not.toContain('verlopen|' + key);   // zonder navigeren: renderMaand() liep al
    const t = await page.locator('#toast').innerText();
    expect(t.replace(/\s+/g, ' ').trim()).toBe('Oude Sportschool gestopt · ongedaan maken');
    await page.locator('#toast [data-ongedaan]').click();
    expect(await page.evaluate((key) => postStatus(key).status, key)).toBe('verlopen');
    expect(await letOpDom(page)).toContain('verlopen|' + key);
  });
  test('de toast staat 5 seconden', async ({ page }) => {
    await S.boot(page);
    const key = await post(page, 'Oude Sportschool', 40, 'sport', ['2026-05-13', '2026-06-13', '2026-07-13']);
    await page.evaluate((key) => { go('maand'); openPostStatus(key); }, key);
    await page.locator('[data-postzet="gestopt"]').click();
    await page.waitForTimeout(4000);
    expect(await page.evaluate(() => document.getElementById('toast').className)).toContain('show');
    await page.waitForTimeout(1400);
    expect(await page.evaluate(() => document.getElementById('toast').className)).not.toContain('show');
  });
  test('de vraag uit reservering: na het antwoord is de sheet weg en de regel weg', async ({ page }) => {
    await bootStand(page);
    await page.evaluate(() => { SET.uitResAntw = {}; save(); go('maand'); });
    const k = await page.evaluate(() => recurKey(TX.find(t => t.name === 'Huurwoningen')));
    expect(await letOpDom(page)).toContain('uitresvraag|' + k);
    await page.evaluate((k) => openUitResVraag(k), k);
    await page.locator('[data-uitresantw="reservering"]').click();
    expect(await open(page)).toBe(false);
    expect(await letOpDom(page)).not.toContain('uitresvraag|' + k);
    expect((await page.locator('#toast').innerText()).replace(/\s+/g, ' ')).toContain('uit reservering · ongedaan maken');
  });
});

test.describe('2 · zonder potje: minstens 2 van 3 maanden van EUR 25, en niet meer vragen', () => {
  test('Vakantie zoals op je toestel (jul EUR 11, aug EUR 99): geen signaal; 30 en 30: wel', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { TX = TX.filter(t => catOf(t) !== 'vakantie'); save(); });
    await uitgave(page, [['2026-07-12', -11, 'Camping Een', 'vakantie'], ['2026-08-12', -99, 'Camping Een', 'vakantie']]);
    const n = await page.evaluate(() => zonderPotjeVaker().find(x => x.k === 'vakantie'));
    expect(n && n.n).toBe(2);   // invoermeting: 2 van 3 maanden met uitgaven
    expect((await letOp(page)).filter(x => x.soort === 'zonderpot' && x.key === 'vakantie')).toEqual([]);
    await uitgave(page, [['2026-07-13', 19, 'Camping Een', 'vakantie']].map(([d, a, n, c]) => [d, -a, n, c]));   // juli wordt 30
    expect((await letOp(page)).filter(x => x.soort === 'zonderpot' && x.key === 'vakantie').length).toBe(1);
  });
  test('"Geen potje nodig · niet meer vragen": weg, en pas terug bij een maand van 2x het hoogste bedrag', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => { openZonderKeuze('e_kinderen'); });
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-zkoptie]')].map(e => e.dataset.zkoptie))).toEqual(['pot', 'pot2', 'res', 'nee']);
    await page.locator('[data-zkoptie="nee"]').click();
    await page.locator('[data-zkbevestig]').click();
    expect(await open(page)).toBe(false);
    const N = await page.evaluate(() => SET.zonderNee.e_kinderen);
    expect(N).toEqual({ op: '2026-10', max: 136 });
    expect((await letOp(page)).filter(x => x.key === 'e_kinderen')).toEqual([]);
    /* een afgeronde maand na de keuze: 271 (onder 2x 136) vraagt niets, 272 wel */
    const terug = (v) => page.evaluate((v) => { SET.zonderNee.e_kinderen = { op: '2026-09', max: v }; save(); return gripLetOpItems([], [], []).some(x => x.soort === 'zonderpot' && x.key === 'e_kinderen'); }, v);
    const sep = await page.evaluate(() => Math.round(zonderMaandBedrag('e_kinderen', '2026-09')));
    expect(sep).toBe(136);
    expect(await terug(69)).toBe(false);   // 136 < 2 x 69
    expect(await terug(68)).toBe(true);    // 136 >= 2 x 68
  });
});

test.describe('3 · eenmalig: "Klopt, eenmalig" sluit het signaal voor die boeking', () => {
  test('de sheet, de tekst, de knop, en een nieuwe boeking vraagt het weer', async ({ page }) => {
    await S.boot(page);
    const z = (await letOp(page)).find(x => x.soort === 'eenmalig');
    expect(z.act).toBe("openEenmalig('zorg')");
    await page.evaluate(() => { go('maand'); openEenmalig('zorg'); });
    const r = await page.evaluate(() => ({ eerste: document.querySelector('#eenmaligSheet button').innerText.trim(), uitleg: document.querySelector('[data-eenmaliguitleg]').innerText, alles: document.querySelector('#sheet').innerText }));
    expect(r.eerste).toBe('Klopt, eenmalig');
    expect(r.uitleg).toBe('Eenmalige uitgave zonder potje. Klopt dat, dan hoef je niets te doen.');
    expect(r.alles).not.toContain('valt buiten elke grens');
    await page.locator('[data-eenmaligklopt]').click();
    expect(await open(page)).toBe(false);
    expect((await letOp(page)).filter(x => x.soort === 'eenmalig')).toEqual([]);
    expect((await page.locator('#toast').innerText()).replace(/\s+/g, ' ')).toContain('eenmalig · ongedaan maken');
    await uitgave(page, [['2026-10-09', -40, 'Apotheek Twee', 'zorg']]);
    expect((await letOp(page)).filter(x => x.soort === 'eenmalig').map(x => x.naam)).toEqual(['Zorg & apotheek €40 zonder potje · 0 van 3 mnd']);
  });
  test('de lek-sheet draagt de zin "Een vaste behoefte zonder potje ..." niet meer', async ({ page }) => {
    await S.boot(page);
    const t = await page.evaluate(() => { go('maand'); openGripLetOp('lek'); return document.querySelector('#sheet').innerText; });
    expect(t).not.toContain('Een vaste behoefte zonder potje');
  });
});

test.describe('4 · laten staan stopt de vraag, niet de informatie', () => {
  test('Huur laten staan: de grijze stap "niet gebruikt" en de feitregel blijven', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await K.boot(page);
    const lees = () => page.evaluate(() => { const V = maandVooruit(), B = gripZienBrug(V); go('maand');
      return { tr: B.stappen.filter(s => s.soort === 'teruim').map(s => [s.k, s.label2, s.titel]), som: B.stappen.slice(1, -1).reduce((a, s) => a + s.waarde, 0), verschil: B.verschil,
        regel: (document.querySelector('[data-nietgebruikt]') || {}).innerText || '' }; });
    const voor = await lees();
    expect(voor.tr.some(([k, l, t]) => l === 'niet gebruikt' && /Huur/.test(t))).toBe(true);
    await page.evaluate(() => openTeRuim('huur'));
    await page.click('[data-teruimoptie="c"]');
    await page.locator('[data-teruimbevestig]').click();
    expect(await open(page)).toBe(false);
    expect(await page.evaluate(() => potLaten('huur'))).toBe(true);
    const na = await lees();
    expect(na.tr).toEqual(voor.tr);
    expect(na.som).toBe(na.verschil);
    expect(na.regel).toContain('niet gebruikt');
    expect(na.regel).toBe(voor.regel);   // twee potjes, een gekozen: de regel noemt "zelf gekozen" pas als alle potjes zelf gekozen zijn
  });
});

test.describe('5 · een samengevoegde stap onder EUR 10 krijgt geen eigen kolom', () => {
  test('grip-kring-stand: "1 boven" van +€5 schuift bij Uit eten aan; de som en de noot gaan mee', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await K.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(), B = gripZienBrug(V);
      return { st: B.stappen.map(s => [s.soort, s.k || '', s.waarde, s.bij || 0, !!s.noot]), som: B.stappen.slice(1, -1).reduce((a, s) => a + s.waarde, 0), verschil: B.verschil,
        opg: (B.opgeschoven || []).map(o => [o.k, o.opgeschoven]), delen: gripOverigDelen(V) }; });
    expect(r.opg).toEqual([['boven', 5]]);
    expect(r.st.filter(s => s[0] === 'overig').map(s => s[1])).toEqual(['onder']);
    const ue = r.st.find(s => s[0] === 'potje' && s[1] === 'uiteten');
    expect(ue[3]).toBe(5); expect(ue[4]).toBe(true);
    expect(r.som).toBe(r.verschil);
    /* de sheet achter overig telt het opgeschoven deel nog mee */
    expect(r.delen.tot).toBe(r.st.filter(s => s[0] === 'overig').reduce((a, s) => a + s[2], 0) + 5);
  });
  test('een stap van EUR 10 of meer blijft staan (grip-v409-stand: 3 boven 450)', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => gripZienBrug(maandVooruit()).stappen.filter(s => s.soort === 'overig').map(s => s.label + '=' + s.waarde));
    expect(r).toEqual(['3 boven=450', '7 onder=-465']);
  });
  test('zonder stap aan dezelfde kant blijft de kleine stap staan', async ({ page }) => {
    await K.boot(page);
    const r = await page.evaluate(() => { const V = maandVooruit(); const B0 = gripZienBrug(V);
      const keep = uitschieters; window.uitschieters = () => []; try { const B = gripZienBrug(V); return B.stappen.filter(s => s.soort === 'overig').map(s => s.k + '=' + s.waarde); } finally { window.uitschieters = keep; } });
    expect(r.some(x => x.startsWith('boven='))).toBe(true);
  });
});
