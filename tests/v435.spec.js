/* v435: SALARISVOORSTEL. De verwachte salarisdatum met de weekendregel (salPeriode, een bron), "Hoe berekend" in de sheet, contant op
   de dag van je opnames, overboeken alleen op de dag van de storting, en twee controlemomenten per periode plus een waarschuwing
   tussendoor. Op v432-stand (salaris EUR 5.216 op de 24e, Salarisrekening en Leefgeld, 16 okt 2026) en v421-stand (SKF).
   GECONSTRUEERD EN NIET GEMETEN: de boekingen van het toestel staan alleen daar. */
const { test, expect } = require('@playwright/test');
const S = require('./v432-stand');
const { MAIN, LEEF, SPAAR } = S;
const add = (page, rows) => page.evaluate(rows => { for (const [acc, d, a, n, ds, cat] of rows) { const t = { id: 'v435' + acc.slice(-4) + d + n + a, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; } TX.sort((a, b) => a.date.localeCompare(b.date)); window._rekV = null; save(); }, rows);
const sal = (d, a) => [MAIN, d, a || 5216, 'Werkgever', 'SALARIS LOON'];
const boot = async (page, o) => { await page.setViewportSize({ width: 390, height: 844 }); await S.boot(page, o); };
const SV = (extra) => Object.assign({ op: '2026-10-20', ym: '2026-10', salYM: '2026-10', rek: { [MAIN]: 1200, [LEEF]: 850 }, opzij: 3166, plan: 280, salaris: 5216, salAcc: MAIN, start: '2026-10-26', eind: '2026-11-23', dagen: 29, buffer: { [MAIN]: 103, [LEEF]: 136 }, verwacht: { [MAIN]: 1077, [LEEF]: 678 }, voor: { ont: {}, laagst: { [MAIN]: 123, [LEEF]: 172 } } }, extra || {});

test.describe('v435 · 0. de verwachte salarisdatum', () => {
  test('0a. de regel: zaterdag +2, zondag +1, door de week de dag zelf; okt 2026 → 26-10, nov → 24-11, dec → 24-12', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const R = salRegel(); return { R, v: ['2026-10', '2026-11', '2026-12', '2027-01'].map(ym => salarisVerwacht(ym, R)) }; });
    expect(r.R).toMatchObject({ dag: 24, bron: 'boekingen' });
    expect(r.v.map(x => x.datum)).toEqual(['2026-10-26', '2026-11-24', '2026-12-24', '2027-01-25']);   // 24 jan 2027 is een zondag
    expect(r.v[0].regel).toBe('24-10 za → 26-10');
    expect(r.v[3].regel).toBe('24-01 zo → 25-01');
    /* een zondag: de 25e oktober 2026 */
    expect(await page.evaluate(() => salarisVerwacht('2026-10', { dag: 25 }).datum)).toBe('2026-10-26');
  });
  test('0a. SKF: de regel staat in "Wat Minder van jou weet" als "Salaris SKF: de 24e, in het weekend de maandag erna", door jou', async ({ page }) => {
    const V = require('./v421-stand'); await page.setViewportSize({ width: 390, height: 844 }); await V.boot(page);
    await page.evaluate(() => { go('maand'); renderMaand(); });
    const r = await page.evaluate(() => ({ R: salRegel(), K: kennisLijst().find(x => x.soort === 'salaris') }));
    expect(r.R).toMatchObject({ dag: 24, bron: 'jij', opgeslagen: true });
    expect(r.K).toMatchObject({ groep: 'inkomen', wat: 'Salaris SKF: de 24e, in het weekend de maandag erna', bron: 'jij' });
  });
  test('0b. de periode: van de werkelijke storting tot de dag voor de volgende verwachte; nu 26 okt t/m 23 nov, 29 dagen', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const P = salPeriode(), V = rekVoorstel(); return { cur: [P.cur.start, P.cur.eind, P.cur.dagen], volg: [P.volg.start, P.volg.eind, P.volg.dagen], v: [V.start, V.eind, V.dagen] }; });
    expect(r.cur).toEqual(['2026-09-24', '2026-10-25', 32]);
    expect(r.volg).toEqual(['2026-10-26', '2026-11-23', 29]);
    expect(r.v).toEqual(['2026-10-26', '2026-11-23', 29]);
  });
  test('0b/0d. een storting die eerder komt: de periode begint op die dag, de vorige sluit een dag eerder, en een vraag in Kloppen mijn gegevens?', async ({ page }) => {
    await boot(page, { dag: '2026-12-19' });
    await add(page, [sal('2026-10-26'), sal('2026-11-24'), sal('2026-12-18')]);
    const r = await page.evaluate(() => { const P = salPeriode(); return { cur: [P.cur.start, P.cur.eind, P.cur.verwacht], vorig: salPeriodeVan('2026-11').eind, afwijk: P.afwijk, q: gegevensVragen().filter(q => q.soort === 'saldag') }; });
    expect(r.cur).toEqual(['2026-12-18', '2027-01-24', '2026-12-24']);
    expect(r.vorig).toBe('2026-12-17');
    expect(r.q.length).toBe(1);
    await page.evaluate(() => openGegevensVragen('saldag|2026-12-18'));
    await expect(page.locator('[data-gegevensvraag="saldag"]')).toContainText('Salaris kwam op 18 dec in plaats van 24 dec. Klopt de regel nog?');
    await page.locator('[data-saldagja]').click();
    expect(await page.evaluate(() => ({ q: gegevensVragen().filter(q => q.soort === 'saldag').length, dag: salRegel().dag }))).toEqual({ q: 0, dag: 24 });
  });
  test('0d. "Nee, regel aanpassen" zet de regel op de werkelijke dag, door jou', async ({ page }) => {
    await boot(page, { dag: '2026-12-19' });
    await add(page, [sal('2026-10-26'), sal('2026-11-24'), sal('2026-12-18')]);
    await page.evaluate(() => openGegevensVragen('saldag|2026-12-18'));
    await page.locator('[data-saldagnee]').click();
    const r = await page.evaluate(() => ({ R: salRegel(), q: gegevensVragen().filter(q => q.soort === 'saldag').length, v: salarisVerwacht('2027-01').datum }));
    expect(r.R).toMatchObject({ dag: 18, bron: 'jij' });
    expect(r.q).toBe(0); expect(r.v).toBe('2027-01-18');
  });
  test('0c. tussen de 24e en de verwachte storting geen signaal; de dag na de verwachte storting "Salaris nog niet binnen"', async ({ page }) => {
    await boot(page, { dag: '2026-10-25' });
    let r = await page.evaluate(() => { go('maand'); renderMaand(); const P = salPeriode(); return { stil: P.stil, laat: P.laat, T: salTekortData().length, nb: !!document.querySelector('[data-salnietbinnen]'), tk: document.querySelectorAll('[data-saltekort]').length }; });
    expect(r).toEqual({ stil: true, laat: false, T: 0, nb: false, tk: 0 });
    /* 24 okt: het stille venster en de periode loopt nog (t/m 25 okt), terwijl Leefgeld voor de storting onder nul komt */
    // v445: contant wordt voor de storting niet meer verwacht als je deze maand nog niet pinde (pinnen na salaris), dus de
    // projectie komt pas onder nul met een saldo dat er al onder staat; de eis blijft: in het stille venster geen signaal
    await boot(page, { dag: '2026-10-24', set: { manualBal: { [LEEF]: -50 } } });
    r = await page.evaluate(acc => { go('maand'); renderMaand(); const P = salPeriode(), V = rekVoorstel(), x = V.rek.find(z => z.acc === acc); return { stil: P.stil, onder: salProjectie(x, accBalance(acc), P.cur.eind).laagst < 0, T: salTekortData().length, tk: document.querySelectorAll('[data-saltekort]').length }; }, LEEF);
    expect(r).toEqual({ stil: true, onder: true, T: 0, tk: 0 });
    await boot(page, { dag: '2026-10-26' });
    r = await page.evaluate(() => { go('maand'); renderMaand(); const P = salPeriode(); return { stil: P.stil, laat: P.laat, nb: !!document.querySelector('[data-salnietbinnen]') }; });
    expect(r).toEqual({ stil: true, laat: false, nb: false });
    await boot(page, { dag: '2026-10-27' });
    await page.evaluate(() => { go('maand'); renderMaand(); });
    await expect(page.locator('[data-salnietbinnen]')).toContainText('Salaris nog niet binnen (verwacht 26 okt)');
    await expect(page.locator('[data-saltekort]')).toHaveCount(0);
  });
});

test.describe('v435 · 1. Hoe berekend', () => {
  test('1a/b. per rekening de tabel uit dezelfde bron als blok 23, en de aannames in gewone taal', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('maand'); openSalVerdeling('x'); });
    await expect(page.locator('[data-salvhoe]')).toHaveCount(0);
    await page.locator(`[data-salvhoeknop="${LEEF}"]`).click();
    const h = page.locator(`[data-salvhoe="${LEEF}"]`);
    const P = await page.evaluate(acc => { const P = rekVoorstel(), r = P.rek.find(x => x.acc === acc); return { pot: r.potDelen.map(p => [p.naam, Math.round(p.bedrag)]), kas: Math.round(r.kasS), verwacht: Math.round(r.verwacht), buf: Math.round(r.buffer), laten: r.laten, af: Math.round(r.laten0 - (r.verwacht + r.buffer)) }; }, LEEF);   // af nagerekend uit laten0, niet uit r.afronding zelf
    const t = await h.innerText();
    for (const [n, b] of P.pot) expect(t).toMatch(new RegExp(`${n.replace('&', '&')}: 100% × €[\\d.]+[\\s\\S]*?gaat niet via deze rekening[\\s\\S]*?€${b}`));   // v441: de potje-rij draagt "gaat niet via deze rekening ›"
    expect(await h.locator('[data-salvhoeverwacht]').innerText()).toMatch(new RegExp(`€${P.verwacht}$`));
    expect(await h.locator('[data-salvhoebuffer]').innerText()).toMatch(/Buffer: p75 €[\d.]+ − mediaan €[\d.]+ = €[\d.]+, minstens €50, hoogstens 20% \(€[\d.]+\)\s+€\d+/);
    expect(await h.locator('[data-salvhoeafronding]').innerText()).toMatch(new RegExp(`\\+€${P.af}$`));
    expect(await h.locator('[data-salvhoelaten]').innerText()).toMatch(new RegExp(`€${P.laten}$`));
    const a = await h.locator('[data-salvaannames]').innerText();
    expect(a).toContain('Periode 26 okt t/m 23 nov (29 dagen): verwachte storting 26 okt, regel de 24e, in het weekend de maandag erna (24-10 za → 26-10), uit je boekingen.');
    expect(a).toContain('Potjes = wat je in oktober verwacht uit te geven, niet je budget, × 29/31 dagen.');
    /* v441 (1b/1c): aandeel en contant uit het ene venster sinds de rekening-indeling (jul t/m sep) */
    expect(a).toContain('Geschat (aandeel per rekening en contant) uit je boekingen sinds jul t/m sep');
    expect(a).toContain('het venster sinds je huidige rekening-indeling');
    expect(a).toContain('Contant meestal op dag 18 na je salaris');
    /* blok 23 noemt dezelfde getallen */
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toContain(`afronding +${P.af} · laagste punt`); expect(d).toContain(`LATEN STAAN ${P.laten}`);
  });
  test('1c. potjes × dagen/dagen in de maand; een vaste last telt alleen met een termijn in de periode', async ({ page }) => {
    await boot(page);
    await add(page, ['2025-12-05', '2026-03-05', '2026-06-05', '2026-09-05'].map(d => [LEEF, d, -90, 'Kwartaal BV', 'SEPA INCASSO KWARTAAL BV', 'verzekering']));
    const r = await page.evaluate(acc => { const P = rekVoorstel(), r = P.rekAlle.find(x => x.acc === acc); return { schaal: P.schaal, pot: r.potDelen.map(p => [p.maand * p.aandeel, p.bedrag]), vast: r.vast.map(x => x.naam), buiten: r.vastBuiten.map(x => x.naam) }; }, LEEF);
    expect(r.schaal).toBeCloseTo(29 / 31, 10);
    for (const [m, b] of r.pot) expect(b).toBeCloseTo(m * 29 / 31, 6);
    expect(r.vast.join()).not.toMatch(/Kwartaal/); expect(r.buiten.join()).toMatch(/Kwartaal/);   // volgende termijn 5 dec: buiten 26 okt t/m 23 nov
  });
  test('1d. Gevolg en de drie knoppen staan helemaal in beeld op 390x844, ook met Hoe berekend uitgeklapt', async ({ page }) => {
    await boot(page);
    await page.evaluate(acc => { go('maand'); openSalVerdeling('x'); for (const r of rekVoorstel().rek) window._salv.hoe[r.acc] = true; renderSalVerdeling(); }, LEEF);
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => { const sh = document.querySelector('#sheet'), s = sh.getBoundingClientRect(), g = document.querySelector('[data-salvgevolg]').getBoundingClientRect(), k = [...document.querySelectorAll('[data-salvakkoord],[data-salvaanpassen],[data-salvnietnu]')].map(e => e.getBoundingClientRect());
      return { scrollt: sh.scrollHeight > sh.clientHeight, ok: [g, ...k].every(b => b.top >= s.top && b.bottom <= innerHeight + 0.5), voet: !!document.querySelector('[data-voet] [data-salvgevolg]') }; });
    expect(r).toEqual({ scrollt: true, ok: true, voet: true });
  });
});

test.describe('v435 · 2/3. contant en overboeken', () => {
  test('2a/b. contant op dag N na je salaris (de mediaan van het venster sinds de rekening-indeling), op de saldolijn op die dag; zonder patroon gelijk', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(acc => { const P = rekVoorstel(), r = P.rek.find(x => x.acc === acc); return { kp: r.kasPatroon, dag: r.kasDag, start: P.start }; }, LEEF);
    expect(r.kp).toMatchObject({ dag: 18, maanden: 3 }); expect(r.dag).toBe('2026-11-13');   // v441: kasPatroon over het venster sinds de rekening-indeling (jul, aug, sep)
    await page.evaluate(() => { go('maand'); openSalVerdeling('x'); });
    await expect(page.locator(`[data-salvrekblok="${LEEF}"] [data-salvkasdag]`)).toHaveText('contant meestal op dag 18 na je salaris');
    /* de lijn: op 12 nov is het contant nog niet af, op 13 nov wel */
    const l = await page.evaluate(acc => { const r = rekVoorstel().rek.find(x => x.acc === acc), z = r.lijn(r.laten); return { laagst: z.laagst, laten: r.laten, laten0: r.laten0 }; }, LEEF);
    expect(l.laten).toBe(l.laten0);   // (2c) het bedrag verandert alleen als het laagste punt onder nul komt
    /* minder dan 3 maanden met een opname: gelijk verdeeld */
    await page.evaluate(acc => { TX = TX.filter(t => !(t.acc === acc && /GELDMAAT/.test(t.desc || '') && t.date < '2026-08')); window._rekV = null; save(); }, LEEF);
    expect(await page.evaluate(acc => { const r = rekVoorstel().rek.find(x => x.acc === acc); return [r.kasPatroon.dag, r.kasDag]; }, LEEF)).toEqual([null, null]);
  });
  test('3. voor de storting het verwachte saldo op de verwachte storting; op de dag van de storting "overboeken" met het saldo', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(acc => { const P = rekVoorstel(), r = P.rek.find(x => x.acc === acc); let y = r.saldo; for (let d = '2026-10-17'; d < '2026-10-26'; d = rekDag(d, 1)) y -= r.uitDag(d); return { nu: P.nu, ob: r.overboeken, vs: r.verwachtSaldo, y, laten: r.laten }; }, LEEF);
    expect(r.nu).toBe(false); expect(r.ob).toBeNull(); expect(r.vs).toBeCloseTo(r.y, 6);
    await page.evaluate(() => { go('maand'); openSalVerdeling('x'); });
    await expect(page.locator(`[data-salvrekblok="${LEEF}"] [data-salvsaldo]`)).toHaveText(`verwacht saldo op 26 okt: ${r.vs < 0 ? '-' : ''}€${Math.abs(Math.round(r.vs)).toLocaleString('nl-NL')} · overboeken dan ±€${Math.round(r.laten - r.vs).toLocaleString('nl-NL')}`);
    await boot(page, { dag: '2026-10-26' });
    await add(page, [sal('2026-10-26')]);
    const n = await page.evaluate(acc => { const P = rekVoorstel(), r = P.rek.find(x => x.acc === acc); return { nu: P.nu, start: P.start, eind: P.eind, ob: r.overboeken, saldo: r.saldo, laten: r.laten }; }, LEEF);
    expect(n).toMatchObject({ nu: true, start: '2026-10-26', eind: '2026-11-23' }); expect(n.ob).toBeCloseTo(n.laten - n.saldo, 6);
    await page.evaluate(() => { go('maand'); openSalVerdeling('x'); });
    await expect(page.locator(`[data-salvrekblok="${LEEF}"] [data-salvsaldo]`)).toContainText(`overboeken €`);
  });
});

test.describe('v435 · 4/5/6. de momenten', () => {
  test('4. moment 1: twee dagen na de storting, advies tegen wat er na je salaris stond, ✓ binnen EUR 25, anders het verschil en het gevolg', async ({ page }) => {
    for (const [dag, kaart] of [['2026-10-27', false], ['2026-10-28', true], ['2026-10-30', true], ['2026-10-31', false]]) {
      await boot(page, { dag, set: { salVerdeling: SV(), manualBal: { [MAIN]: 1190, [LEEF]: 600 } } });
      await add(page, [sal('2026-10-26')]);
      await page.evaluate(() => { go('maand'); renderMaand(); });
      await expect(page.locator('[data-salmoment1]')).toHaveCount(kaart ? 1 : 0);
    }
    await boot(page, { dag: '2026-10-28', set: { salVerdeling: SV(), manualBal: { [MAIN]: 1190, [LEEF]: 600 } } });
    await add(page, [sal('2026-10-26')]);
    await page.evaluate(() => { go('maand'); renderMaand(); });
    expect(await page.locator(`[data-m1rek="${MAIN}"]`).getAttribute('data-m1ok')).toBe('1');
    const l = await page.locator(`[data-m1rek="${LEEF}"]`).innerText();
    expect(l).toContain('advies €850 · na je salaris €600 · €250 minder dan het advies');
    expect(l).toMatch(/laagste saldo wordt dan -?€[\d.]+ op \d+ (okt|nov)/);
    /* alles ✓: geen kaart */
    await page.evaluate(acc => { SET.manualBal[acc] = 840; save(); renderMaand(); }, LEEF);
    await expect(page.locator('[data-salmoment1]')).toHaveCount(0);
  });
  test('4b. komt het laagste punt onder nul, dan staat erbij wat je moet overboeken', async ({ page }) => {
    await boot(page, { dag: '2026-10-28', set: { salVerdeling: SV(), manualBal: { [MAIN]: 1190, [LEEF]: 100 } } });
    await add(page, [sal('2026-10-26')]);
    await page.evaluate(() => { go('maand'); renderMaand(); });
    expect(await page.locator(`[data-m1rek="${LEEF}"] [data-m1gevolg]`).innerText()).toMatch(/laagste saldo wordt dan -€[\d.]+ op .* · boek €\d+ over/);
  });
  test('5. tussendoor: een signaal als een rekening voor de volgende storting op nul komt, een keer per periode, opnieuw bij meer dan EUR 100 erbij', async ({ page }) => {
    /* v436: alleen in een periode die begon met een Akkoord (hier de periode van september), en dan EEN kaart met per rekening
       een regel. Zonder Akkoord geen waarschuwing (v436.spec.js 4a). */
    await boot(page, { set: { salVerdeling: SV({ salYM: '2026-09', start: '2026-09-24', ym: '2026-09' }) } });
    await page.evaluate(() => { go('maand'); renderMaand(); });
    const w = page.locator(`#salTekort[data-saltekort*="${LEEF}"]`);
    await expect(w.locator(`[data-saltekortrij="${LEEF}"]`)).toContainText(/Leefgeld · op €0 (rond \d+ okt|nu)/);
    await expect(w.locator(`[data-saltekortrij="${LEEF}"]`)).toContainText(/nodig €\d+/);
    await expect(w).toContainText(/kan uit: .*spaargeld · Minder verplaatst niets/);
    /* een dag later met hetzelfde tekort: geen signaal; met meer dan EUR 100 erbij: weer */
    const t = await page.evaluate(acc => salTekortData().find(x => x.acc === acc).tekort, LEEF);
    await page.evaluate(([acc, t]) => { SET.salTekort['2026-09-24'][acc] = { op: '2026-10-15', tekort: t - 50 }; save(); renderMaand(); }, [LEEF, t]);
    await expect(w).toHaveCount(0);
    await page.evaluate(([acc, t]) => { SET.salTekort['2026-09-24'][acc] = { op: '2026-10-15', tekort: t - 150 }; save(); renderMaand(); }, [LEEF, t]);
    await expect(w).toHaveCount(1);
    expect(await page.evaluate(acc => SET.salTekort['2026-09-24'][acc].op, LEEF)).toBe('2026-10-16');
  });
  test('6. moment 2: de laatste dag van de periode, per rekening het oordeel en een voorstel voor de volgende, geschaald; som + opzij = salaris', async ({ page }) => {
    await boot(page, { dag: '2026-11-22', set: { salVerdeling: SV(), manualBal: { [MAIN]: 900, [LEEF]: 40 } } });
    await add(page, [sal('2026-10-26')]);
    expect(await page.evaluate(() => salMoment2())).toBeNull();
    await boot(page, { dag: '2026-11-23', set: { salVerdeling: SV(), manualBal: { [MAIN]: 900, [LEEF]: 40 } } });
    await add(page, [sal('2026-10-26'), [SPAAR, '2026-11-12', -150, 'Eigen overboeking', 'OVERBOEKING NAAR LEEFGELD', 'intern'], [LEEF, '2026-11-12', 150, 'Eigen overboeking', 'OVERBOEKING VAN SPAREN', 'intern'],
      [MAIN, '2026-10-27', -3000, 'Eigen overboeking', 'OVERBOEKING NAAR SPAREN', 'intern'], [SPAAR, '2026-10-27', 3000, 'Eigen overboeking', 'OVERBOEKING VAN SALARISREKENING', 'intern']]);
    const M = await page.evaluate(() => { const M = salMoment2(); return { PV: [M.PV.start, M.PV.eind, M.PV.dagen], volg: M.volg.dagen, schaal: M.schaal, R: M.R.map(x => [x.acc, x.oordeel, x.ont, x.basis, x.voorstel, x.eind]), som: M.som, opzijVolg: M.opzijVolg, salaris: M.salaris, opzijW: M.opzijW }; });
    expect(M.PV).toEqual(['2026-10-26', '2026-11-23', 29]); expect(M.volg).toBe(30);   // 24 nov t/m 23 dec
    const l = M.R.find(x => x[0] === LEEF), m = M.R.find(x => x[0] === MAIN);
    expect(l[1]).toBe('te krap'); expect(l[2]).toBe(150); expect(l[3]).toBe(850 + 150); expect(l[4]).toBe(Math.round(1000 * 30 / 29));
    expect(m[1]).toBe('te ruim'); expect(m[3]).toBe(1200 - Math.floor((900 - 103) / 50) * 50); expect(m[4]).toBe(Math.round(m[3] * 30 / 29));
    expect(M.som + M.opzijVolg).toBe(M.salaris);
    expect(M.opzijW).toBe(3000 - 150);
    await page.evaluate(() => { go('maand'); gripKiesTab('terugblik'); });
    const k = page.locator('[data-salmoment2]');
    await expect(k).toContainText('Heeft je salarisverdeling gewerkt?');
    await expect(k.locator(`[data-m2rek="${LEEF}"]`)).toHaveAttribute('data-m2oordeel', 'te krap');
    await expect(k.locator('[data-m2opzij]')).toHaveText('Je zette €2.850 opzij, advies was €3.166');
    await expect(page.locator('text=Was het bedrag te laag?')).toHaveCount(0);
    await k.locator('[data-m2open]').click();
    expect(await page.evaluate(acc => [window._salv.bron, window._salv.eigen[acc]], LEEF)).toEqual(['moment2', l[4]]);
    await expect(page.locator('#salVerdeling [data-salvakkoord]')).toBeVisible();
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toMatch(/moment 2: voorstellen \d+ \+ opzij \d+ = 5216 tegen salaris 5216: sluit/);
    expect(d).toContain('Leefgeld: advies 850 · buffer 136');
  });
  test('6. te krap door onttrekkingen alleen: het laagste saldo bleef boven nul en het eindsaldo onder buffer + EUR 50', async ({ page }) => {
    await boot(page, { dag: '2026-11-23', set: { salVerdeling: SV(), manualBal: { [MAIN]: 150, [LEEF]: 180 } } });
    await add(page, [sal('2026-10-26'), [SPAAR, '2026-11-12', -150, 'Eigen overboeking', 'OVERBOEKING NAAR LEEFGELD', 'intern'], [LEEF, '2026-11-12', 150, 'Eigen overboeking', 'OVERBOEKING VAN SPAREN', 'intern']]);
    const x = await page.evaluate(acc => salMoment2().R.find(x => x.acc === acc), LEEF);
    expect(x.laagst).toBeGreaterThanOrEqual(0); expect(x.eind).toBeLessThanOrEqual(136 + 50);   // de invoer: alleen de onttrekking maakt het krap
    expect(x.ont).toBe(150); expect(x.oordeel).toBe('te krap'); expect(x.basis).toBe(850 + 150);
  });
  test('6. paste: geen onttrekkingen en eindsaldo hoogstens buffer + EUR 50; geen wijziging', async ({ page }) => {
    await boot(page, { dag: '2026-11-23', set: { salVerdeling: SV(), manualBal: { [MAIN]: 150, [LEEF]: 180 } } });
    await add(page, [sal('2026-10-26')]);
    const R = await page.evaluate(() => salMoment2().R.map(x => [x.oordeel, x.basis, x.advies]));
    expect(R).toEqual([['paste', 1200, 1200], ['paste', 850, 850]]);
  });
  test('6. eerder dan de regel: komt de volgende storting eerder, dan is moment 2 de dag ervoor', async ({ page }) => {
    await boot(page, { dag: '2026-11-19', set: { salVerdeling: SV(), manualBal: { [MAIN]: 150, [LEEF]: 180 } } });
    await add(page, [sal('2026-10-26'), sal('2026-11-20')]);
    expect(await page.evaluate(() => { const M = salMoment2(); return M && [M.PV.eind, M.PV.dagen]; })).toEqual(['2026-11-19', 25]);
  });
});

test.describe('v435 · 7. blok 23', () => {
  test('de storting, de regel, de periode, de opnamedag, de momenten en de drie controles', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toContain('lopende periode: verwacht 24-09 (24-09 do), werkelijk 24-09 · 2026-09-24 t/m 2026-10-25 (32 dagen)');
    expect(d).toContain('volgende storting: verwacht 24-10 za → 26-10 · periode 2026-10-26 t/m 2026-11-23 (29 dagen)');
    expect(d).toContain('opnamedag: dag 18 na je salaris (3 opnames in 3 maanden), op de saldolijn 2026-11-13');   // v441: het venster sinds de rekening-indeling (jul, aug, sep)
    expect(d).toContain('verwachte storting volgt de weekendregel: okt 24-10 za → 26-10 · nov 24-11 di · dec 24-12 do: ja');
    expect(d).toContain('tekort-signaal tussen de 24e en de verwachte storting: geen');
    expect(d).toMatch(/TUSSENDOOR \(verwacht saldo per dag[^\n]*\n  Salarisrekening: nu \d+ · 17-10 /);
    expect(d).toContain('MOMENT 1 (na de storting)'); expect(d).toContain('MOMENT 2 (einde periode)');
  });
  test('de controle op de weekendregel en op moment 2 ziet een fout', async ({ page }) => {
    await boot(page);
    const d = await page.evaluate(() => { const v = salarisVerwacht, m = salMoment2;
      salarisVerwacht = (ym, R) => { const x = v(ym, R); return ym === '2026-11' ? Object.assign({}, x, { datum: '2026-11-28' }) : x; };
      salMoment2 = () => ({ som: 2000, opzijVolg: 3000, salaris: 5216, PV: { start: 'a', eind: 'b', dagen: 1 }, volg: null, schaal: 1, R: [], opzijW: 0, opzijAdvies: 0 });
      try { return diagRekVerdeling().join('\n'); } finally { salarisVerwacht = v; salMoment2 = m; } });
    expect(d).toMatch(/verwachte storting volgt de weekendregel: .*: NEE · 2026-11/);
    expect(d).toContain('moment 2: voorstellen 2000 + opzij 3000 = 5000 tegen salaris 5216: VERSCHIL');
  });
  test('de controle op het stille venster ziet een fout', async ({ page }) => {
    await boot(page, { dag: '2026-10-25' });
    const d = await page.evaluate(() => { const echt = salTekortData; salTekortData = () => [{ naam: 'Leefgeld' }]; try { return diagRekVerdeling().join('\n'); } finally { salTekortData = echt; } });
    expect(d).toContain('tekort-signaal tussen de 24e en de verwachte storting: JA · Leefgeld (vandaag valt in die periode)');
  });
});
