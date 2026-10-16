/* v433: REPARATIE v432 NA BLOK 23 VAN HET TOESTEL. De Plan-inleg is het budget uit blok 20 punt 7, een onttrekking is die van
   blok 20 punt 4, de buffer rekent over dezelfde uitgaven als "verwacht" en is hoogstens 20% daarvan, en de prestatietest
   neemt de mediaan van vijf metingen. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const S = require('./v432-stand');
const { MAIN, LEEF, SPAAR } = S;
const RESV = 'NL01RESV0000005555';
const add = (page, rows) => page.evaluate(rows => { for (const [acc, d, a, n, ds, cat] of rows) { const t = { id: 'v433' + acc.slice(-4) + d + n + a, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; } OWN = [...new Set(TX.map(t => t.acc))]; save(); }, rows);
const P = page => page.evaluate(() => { window._rekV = null; const P = rekVoorstel(); return { plan: P.plan, opzij: P.opzij, salaris: P.salaris,
  rek: P.rek.map(r => ({ acc: r.acc, verwacht: r.verwacht, buffer: r.buffer, p75: r.p75, med: r.med, bm: r.bufMaanden.map(x => ({ ym: x.ym, v: x.v, post: x.uit.post, studie: x.uit.studie })) })) }; });
const plan20 = page => page.evaluate(() => { const D = salarisData(9); return Math.round(maandGroepen(D.V, D.Lq).g.find(x => x.n === 'inleg in Plan').b); });

test.describe('v433 · 1. Plan-inleg', () => {
  test('1a. de Plan-inleg is het budget "inleg in Plan" van blok 20 punt 7, niet de spaarinleg', async ({ page }) => {
    await S.boot(page);
    const r = await P(page);
    expect(await plan20(page)).toBe(280);
    expect(r.plan).toBe(280);
    expect(await page.evaluate(() => Math.round(monthlySavingTarget()))).toBe(2200);   // de spaarinleg is iets anders
    await page.evaluate(() => { SET.savingAmount = 900; save(); });
    expect((await P(page)).plan).toBe(280);
    await page.evaluate(() => { planInlegZet('res', 500); });
    expect(await plan20(page)).toBe(500);
    expect((await P(page)).plan).toBe(500);
  });
  test('1b. opzij is "Plan EUR 280 + vrij sparen", en onder de Plan-inleg "past niet"', async ({ page }) => {
    await S.boot(page);
    const r = await P(page);
    await page.evaluate(() => openSalVerdeling('pat:spaargeld'));
    const op = Math.round(r.opzij);
    const eur = v => '€' + v.toLocaleString('nl-NL');
    await expect(page.locator('[data-salvopzij]')).toHaveText(`Opzij ${eur(op)}: Plan €280 + vrij sparen ${eur(op - 280)}`);
    await expect(page.locator('[data-salvgevolg]')).toContainText(`Opzij ${eur(op)}: Plan €280 + vrij sparen`);
    /* meer laten staan dan er na de Plan-inleg overblijft */
    await page.locator('[data-salvaanpassen]').click();
    const l0 = await page.evaluate(() => rekVoorstel().rek.find(r => r.acc === 'NL01LEEF0000004444').laten);
    await page.locator(`[data-salvveld="${LEEF}"]`).fill(String(l0 + op - 100));
    await expect(page.locator('[data-salvopzij]')).toHaveText('Opzij €100 · Plan-inleg past niet: €180 tekort');
    await expect(page.locator('[data-salvgevolg]')).toContainText('Plan-inleg past niet: €180 tekort, je doelen zijn later vol');
  });
  test('1c. blok 23 zet de Plan-inleg naast blok 20 punt 7', async ({ page }) => {
    await S.boot(page);
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toContain('Plan-inleg 280 tegen blok 20 punt 7 (inleg in Plan: budget) 280: gelijk');
    expect(d).toMatch(/OPZIJ \d+ = salaris 5216 min \d+ laten staan · Opzij EUR \d+: Plan EUR 280 \+ vrij sparen EUR \d+/);
  });
});

test.describe('v433 · controles slaan aan op een verschil', () => {
  test('C1. de Plan-controle zegt VERSCHIL als het voorstel een andere Plan-inleg draagt', async ({ page }) => {
    await S.boot(page);
    const d = await page.evaluate(() => { window._rekV = null; const R = rekVoorstel(); window._rekV = { s: rekVoorstelSleutel(), R: Object.assign({}, R, { plan: 2480 }) }; return diagRekVerdeling().join('\n'); });
    expect(d).toContain('Plan-inleg 2480 tegen blok 20 punt 7 (inleg in Plan: budget) 280: VERSCHIL');
  });
  test('C2. de onttrekkingscontrole zegt VERSCHIL als blok 23 een andere som per maand telt', async ({ page }) => {
    await S.boot(page);
    const d = await page.evaluate(() => { const o = rekOnttrekkingen; rekOnttrekkingen = (...a) => { const r = o(...a); r.lijst.push({ acc: 'NL01LEEF0000004444', date: '2026-09-30', bedrag: 500 }); return r; };
      try { window._rekV = null; return diagRekVerdeling().join('\n'); } finally { rekOnttrekkingen = o; } });
    expect(d).toContain('onttrekkingen 2026-09: per rekening samen 1550 tegen blok 20 punt 4 1050: VERSCHIL');
    expect(d).toContain('onttrekkingen 2026-10: per rekening samen 450 tegen blok 20 punt 4 450: gelijk');
  });
});

test.describe('v433 · 2. onttrekkingen', () => {
  const metRes = async page => {
    await add(page, [[SPAAR, '2026-09-06', -500, 'Overboeking', 'From Buffer Rust to Reservering', 'intern'], [RESV, '2026-09-06', 500, 'Overboeking', 'From Buffer Rust to Reservering', 'intern'],
      [SPAAR, '2026-10-05', -131, 'Overboeking', 'From Instant Savings to Reservering', 'intern'], [RESV, '2026-10-05', 131, 'Overboeking', 'From Instant Savings to Reservering', 'intern']]);
    expect(await page.evaluate(r => { SET.resAcc = r; save(); return resAccId(); }, RESV)).toBe(RESV);
  };
  test('2a. een overboeking tussen spaar- en reserveringsrekening is geen onttrekking, en er is geen "onbekende rekening"', async ({ page }) => {
    await S.boot(page);
    await metRes(page);
    const B = await page.evaluate(() => { window._rekV = null; const B = rekBewijs(); return B.G.map(g => [g.acc, g.ym, Math.round(g.bedrag)]); });
    expect(B).toEqual([[LEEF, '2026-09', 1050], [LEEF, '2026-10', 450]]);
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).not.toMatch(/onbekend|niet aanwijst/);
    /* blok 20 zegt hetzelfde: de 500 en de 131 staan bij de verschuivingen binnen je opzij */
    const r20 = await page.evaluate(() => salarisData(9).R.filter(r => ['2026-09', '2026-10'].includes(r.ym)).map(r => [r.ym, Math.round(r.onttSom), Math.round(r.binnenSom)]));
    expect(r20).toEqual([['2026-09', 1050, 500], ['2026-10', 450, 131]]);
  });
  test('2b. een onttrekking naar een betaalrekening telt wel, op die rekening', async ({ page }) => {
    await S.boot(page);
    await add(page, [[SPAAR, '2026-10-11', -60, 'Overboeking', 'From Spaar to Main', 'intern'], [MAIN, '2026-10-11', 60, 'Overboeking', 'From Spaar to Main', 'intern']]);
    const B = await page.evaluate(() => { window._rekV = null; return rekBewijs().G.map(g => [g.acc, g.ym, Math.round(g.bedrag)]); });
    expect(B).toContainEqual([MAIN, '2026-10', 60]);
  });
  test('2c. blok 23: de som per maand over alle rekeningen is "onttrekkingen" van blok 20 punt 4', async ({ page }) => {
    await S.boot(page);
    await metRes(page);
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toContain('onttrekkingen 2026-09: per rekening samen 1050 tegen blok 20 punt 4 1050: gelijk');
    expect(d).toContain('onttrekkingen 2026-10: per rekening samen 450 tegen blok 20 punt 4 450: gelijk');
  });
});

test.describe('v433 · 3. buffer', () => {
  test('3a. de buffer rekent zonder een gestopte post, studieschuld, eenmalig en wat uit een reservering kwam', async ({ page }) => {
    await S.boot(page);
    const rows = [];
    for (const ym of ['2026-04', '2026-06', '2026-08']) rows.push([MAIN, ym + '-14', -400, 'Ml Macnack', 'SEPA INCASSO ML MACNACK', 'overig']);
    for (const ym of ['2026-05', '2026-07', '2026-09']) rows.push([MAIN, ym + '-19', -120, 'DUO', 'SEPA INCASSO DUO HOOFDREKENING', 'studie']);
    rows.push([MAIN, '2026-09-21', -700, 'Mediamarkt', 'BEA MEDIAMARKT', 'shopping'], [MAIN, '2026-07-22', -300, 'CJIB', 'CJIB VERKEERSBOETE', 'belasting']);
    await add(page, rows);
    const voor = await P(page), sv = voor.rek.find(x => x.acc === MAIN);
    expect(sv.bm.find(x => x.ym === '2026-09').v).toBeGreaterThan(1500);   // zonder keuzes telt het mee
    await page.evaluate(() => {
      postZet(recurKey(TX.find(t => t.name === 'Ml Macnack')), 'gestopt'); closeSheet();
      SET.eenmaligOk = Object.assign({}, SET.eenmaligOk, { [TX.find(t => t.name === 'Mediamarkt').id]: { op: '2026-09-22' } });
      SET.uitReservering = Object.assign({}, SET.uitReservering, { [TX.find(t => t.name === 'CJIB').id]: 300 }); save(); });
    const na = await P(page), s = na.rek.find(x => x.acc === MAIN), m = ym => s.bm.find(x => x.ym === ym);
    const v0 = ym => sv.bm.find(x => x.ym === ym).v;
    expect(m('2026-04').post).toBe(400); expect(m('2026-06').post).toBeGreaterThanOrEqual(400); expect(m('2026-08').post).toBeGreaterThanOrEqual(400);
    expect(m('2026-05').studie).toBe(120); expect(m('2026-09').studie).toBe(120);
    expect(v0('2026-09') - m('2026-09').v).toBeCloseTo(700, 5);     // eenmalig eruit (studie was er al uit)
    expect(sv.bm.find(x => x.ym === '2026-09').studie).toBe(120);        // studieschuld telt nooit, ook zonder keuze
    expect(v0('2026-07') - m('2026-07').v).toBeCloseTo(300, 5);     // uit reservering eruit
    expect(v0('2026-04') - m('2026-04').v).toBeCloseTo(400, 5);           // de gestopte post
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toMatch(/Salarisrekening \(salaris\)[\s\S]*maandbedragen voor de buffer \(zonder eenmalig, uit reservering, eigen overboekingen, gestopte\/opgezegde posten, studieschuld\): 2026-04 \d+ \(eruit: post 400, studie 0\)/);
  });
  test('3b. de buffer is p75 min mediaan, minstens 50 en hoogstens 20% van verwacht', async ({ page }) => {
    await S.boot(page);
    const r = await P(page);
    for (const x of r.rek) expect(x.buffer).toBeCloseTo(Math.max(Math.min(x.p75 - x.med, 0.2 * x.verwacht), 50), 5);
    const l = r.rek.find(x => x.acc === LEEF);
    expect(l.p75 - l.med).toBeGreaterThan(0.2 * l.verwacht);    // het plafond bindt hier
    expect(l.buffer).toBeCloseTo(0.2 * l.verwacht, 5);
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toMatch(/Leefgeld\n[\s\S]*buffer \d+ = p75 \d+ min mediaan \d+ = \d+, minstens 50, hoogstens 20% van verwacht \d+/);
  });
  test('3c. een overboeking tussen eigen betaalrekeningen telt niet in de buffer', async ({ page }) => {
    await S.boot(page);
    const r = await P(page), l = r.rek.find(x => x.acc === LEEF);
    /* de fixture zet elke maand EUR 1000 van Main naar Leefgeld; geen maand van de Salarisrekening bevat die 1000 */
    const s = r.rek.find(x => x.acc === MAIN);
    expect(Math.max(...s.bm.map(x => x.v))).toBeLessThan(1000);
    expect(l.bm.length).toBe(6);
  });
});

test.describe('v433 · 4. prestatietest', () => {
  test('4. de Grip-meting neemt de mediaan van vijf, en CLAUDE.md noemt geen ruis meer', async () => {
    const t = fs.readFileSync(path.join(__dirname, 'telbare-cache.spec.js'), 'utf8');
    expect(t).toMatch(/\[0, 1, 2, 3, 4\]\.map\(\(\) => een\(fn\)\)\.sort\(\(x, y\) => x - y\); return a\[2\];/);
    expect(t).toMatch(/grip: meet\(\(\) => renderMaand\(\)\)/);
    const c = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
    expect(c).not.toMatch(/Onstabiel onder last/);
  });
});
