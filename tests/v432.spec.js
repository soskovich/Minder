/* v432: VOORSTEL PER BETAALREKENING. Hoeveel laat je op elke betaalrekening staan tot je volgende salaris, en wat zet je opzij.
   Minder verplaatst geen geld; het bewijs komt uit de rekening waar elke boeking echt van afging. */
const { test, expect } = require('@playwright/test');
const S = require('./v432-stand');
const { MAIN, LEEF, SPAAR } = S;
const add = (page, rows) => page.evaluate(rows => { for (const [acc, d, a, n, ds, cat] of rows) { const t = { id: 'v432' + acc.slice(-4) + d + n + a, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; } save(); }, rows);
const P = page => page.evaluate(() => { window._rekV = null; const P = rekVoorstel(); return { ok: P.ok, salaris: P.salaris, som: P.som, opzij: P.opzij, plan: P.plan, BR: P.BR, kas: P.kasP, totVast: P.totVast, totPot: P.totPot, vastNiet: P.vastNiet.map(x => [x.naam, x.reden]),
  rek: P.rekAlle.map(r => ({ acc: r.acc, naam: r.naam, vast: r.vast.map(x => [x.naam, Math.round(x.bedrag)]), vastS: r.vastS, potS: r.potS, kasS: r.kasS, kasAandeel: r.kasAandeel, pot: Object.fromEntries(r.potDelen.map(p => [p.k, p.aandeel])), verwacht: r.verwacht, buffer: r.buffer, bm: r.bufMaanden.map(x => x.v), laten0: r.laten0, laten: r.laten, laagst: r.laagst, tekort: r.tekort, termijnen: r.termijnen, saldo: r.saldo, herberekend: r.herberekend })) }; });

test.describe('v432 · 1. uitgave per rekening', () => {
  test('1a. betaalrekeningen zijn je eigen rekeningen zonder spaar- en reserveringsrekening', async ({ page }) => {
    await S.boot(page);
    const r = await P(page);
    expect(r.ok).toBe(true);
    expect(r.BR.sort()).toEqual([LEEF, MAIN].sort());
    expect(r.BR).not.toContain(SPAAR);
  });
  test('1b. een vaste last hoort bij de rekening van zijn LAATSTE betaling', async ({ page }) => {
    await S.boot(page);
    const voor = await P(page);
    expect(voor.rek.find(x => x.acc === MAIN).vast.map(v => v[0])).toContain('Health Club');
    /* de september-betaling van de Health Club gaat van Leefgeld af: dan hoort hij bij Leefgeld, ook al gingen de eerdere van de Salarisrekening */
    await page.evaluate(() => { const t = TX.filter(t => t.name === 'Health Club Purmerend BV').sort((a, b) => b.date.localeCompare(a.date))[0]; t.acc = 'NL01LEEF0000004444'; save(); });
    const na = await P(page);
    expect(na.rek.find(x => x.acc === LEEF).vast.map(v => v[0])).toContain('Health Club');
    expect(na.rek.find(x => x.acc === MAIN).vast.map(v => v[0])).not.toContain('Health Club');
  });
  test('1c. potjes gaan naar rato van wat er in de 3 afgeronde maanden per rekening afging', async ({ page }) => {
    await S.boot(page);
    /* boodschappen: 3 x 350 op Leefgeld en 3 x 150 op de Salarisrekening, dus 70% en 30% */
    await add(page, ['2026-07-10', '2026-08-10', '2026-09-10'].map(d => [MAIN, d, -150, 'Jumbo', 'BEA, BETAALPAS JUMBO', 'boodschappen']));
    const r = await P(page);
    const l = r.rek.find(x => x.acc === LEEF).pot.boodschappen, m = r.rek.find(x => x.acc === MAIN).pot.boodschappen;
    expect(l).toBeCloseTo(0.7, 5); expect(m).toBeCloseTo(0.3, 5);
  });
  test('1d. contant naar rato van de Geldmaat-opnames per rekening, en gelijk aan blok 20', async ({ page }) => {
    await S.boot(page);
    let r = await P(page);
    expect(r.rek.find(x => x.acc === LEEF).kasAandeel).toBe(1);
    await add(page, ['2026-07-03', '2026-08-03', '2026-09-03'].map(d => [MAIN, d, -50, 'Geldmaat Station', 'GEA, BETAALPAS GELDMAAT STATION']));
    r = await P(page);
    /* Leefgeld 6 x 100, Salarisrekening 3 x 50: 600 tegen 150 */
    expect(r.rek.find(x => x.acc === MAIN).kasAandeel).toBeCloseTo(0.2, 5);
    expect(r.rek.find(x => x.acc === LEEF).kasAandeel).toBeCloseTo(0.8, 5);
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toMatch(/contant \d+ tegen blok 20 \(mediaan CONTANT OPGENOMEN\) \d+: gelijk/);
  });
  test('1e. een overboeking tussen eigen betaalrekeningen is geen uitgave, ook niet met een uitgavencategorie, maar telt als binnenkomend', async ({ page }) => {
    await S.boot(page);
    const voor = await P(page);
    /* de overboekingen naar Leefgeld op Overig zetten: ze blijven buiten aandeel en buffer */
    await page.evaluate(() => { for (const t of TX) if (/OVERBOEKING (NAAR LEEFGELD|VAN SALARISREKENING)/.test(t.desc) && t.acc !== 'NL01SPAR0000002222') OVR[t.id] = 'overig'; save(); });
    const na = await P(page);
    expect(na.rek.find(x => x.acc === MAIN).pot.overig || 0).toBe(voor.rek.find(x => x.acc === MAIN).pot.overig || 0);
    expect(na.rek.find(x => x.acc === MAIN).bm).toEqual(voor.rek.find(x => x.acc === MAIN).bm);
    const b = await page.evaluate(() => rekBewijs().naar.find(x => x.acc === 'NL01LEEF0000004444').naar);
    expect(b).toBe(1000);
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toMatch(/overboekingen tussen eigen betaalrekeningen: \d+ paren, waarvan \d+ boeking\(en\) met een uitgavencategorie · nergens als uitgave geteld/);
  });
  test('1f. de som over alle rekeningen is vast + potjes + contant', async ({ page }) => {
    await S.boot(page);
    const r = await P(page);
    const som = r.rek.reduce((a, x) => a + x.vastS + x.potS + x.kasS, 0);
    expect(Math.abs(som - (r.totVast + r.totPot + r.kas))).toBeLessThan(0.01);
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toMatch(/som over de rekeningen \d+ = vast \d+ \+ potjes \d+ \+ contant \d+ = \d+: sluit/);
  });
});

test.describe('v432 · 2. laten staan per rekening', () => {
  test('2a. de periode loopt van de salarisdatum tot de dag voor het volgende salaris', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => { const P = rekVoorstel(); return [P.start, P.eind, P.dagen]; });
    expect(r).toEqual(['2026-10-26', '2026-11-23', 29]);   // v435: 24 okt is een zaterdag, dus de verwachte storting is maandag 26 okt
  });
  test('2b. gestopt, opgezegd en uit reservering tellen niet; de Plan-inleg is het budget en niet de spaarinleg (v433)', async ({ page }) => {
    await S.boot(page);
    const voor = await P(page);
    expect(voor.vastNiet.map(x => x[0])).toEqual(expect.arrayContaining(['Huurwoningen', 'Dela Natura- en levensv']));
    await page.evaluate(() => { postZet(recurKey(TX.find(t => t.name === 'Health Club Purmerend BV')), 'gestopt'); closeSheet(); });
    const na = await P(page);
    expect(na.rek.find(x => x.acc === MAIN).vast.map(v => v[0])).not.toContain('Health Club');
    expect(na.vastNiet.map(x => x[0])).toContain('Health Club');
    expect(Math.round(voor.rek.find(x => x.acc === MAIN).vastS - na.rek.find(x => x.acc === MAIN).vastS)).toBe(50);
    await page.evaluate(() => { SET.savingAmount = 100; save(); });
    const pl = await P(page);
    expect(pl.rek.map(x => Math.round(x.verwacht))).toEqual(na.rek.map(x => Math.round(x.verwacht)));
    // v440: de Plan-inleg bestaat niet meer; een spaarinleg verandert het voorstel nog steeds niet (verwacht ongewijzigd)
  });
  test('2c/d. buffer is p75 min mediaan (minstens 50, hoogstens 20% van verwacht, v433), en laten staan is verwacht plus buffer naar boven op 50', async ({ page }) => {
    await S.boot(page);
    const r = await P(page);
    for (const x of r.rek) { const b = x.bm.slice().sort((p, q) => p - q), q = (b.length - 1) * 0.75, i = Math.floor(q), p75 = b[i] + (b[Math.min(i + 1, b.length - 1)] - b[i]) * (q - i), h = b.length >> 1, med = b.length % 2 ? b[h] : (b[h - 1] + b[h]) / 2;
      expect(x.buffer).toBeCloseTo(Math.max(Math.min(p75 - med, 0.2 * x.verwacht), 50), 5);
      if (!x.tekort) expect(x.laten).toBe(Math.ceil((x.verwacht + x.buffer) / 50 - 1e-9) * 50); }
    /* Leefgeld: de buffer is groter dan 50, de Salarisrekening ook: geen van beide valt op het minimum terug in deze stand */
    expect(r.rek.find(x => x.acc === LEEF).buffer).toBeGreaterThan(50);
  });
  test('2e. de saldolijn zet een termijn op zijn datum: een jaarpost in de periode verhoogt het bedrag met het tekort', async ({ page }) => {
    await S.boot(page);
    await add(page, ['2023-11-05', '2024-11-05', '2025-11-05'].map(d => [LEEF, d, -1200, 'Verzekeraar Jaar', 'SEPA INCASSO VERZEKERAAR JAAR', 'verzekering']));
    const r = await P(page), l = r.rek.find(x => x.acc === LEEF);
    expect(l.vast.find(v => v[0] === 'Verzekeraar Jaar')[1]).toBe(1200);   // v435: een termijn in de periode telt helemaal (niet 1200 / 12)
    expect(l.termijnen.map(t => t.date)).toContain('2026-11-05');        // maar de termijn valt in de periode
    /* v435: de hele termijn zit nu in verwacht, dus de saldolijn komt niet meer onder nul en er is geen tekort-ophoging */
    expect(l.vastS).toBeGreaterThanOrEqual(1200);
    expect(l.tekort).toBe(0);
    expect(l.laagst).toBeGreaterThanOrEqual(0);
  });
  test('2f/g. opzij is salaris min de som, de Plan-inleg apart; met een bekend saldo staat er wat er over moet', async ({ page }) => {
    await S.boot(page);
    const r = await P(page);
    expect(r.opzij).toBeCloseTo(r.salaris - r.som, 5);
    expect(r.som).toBe(r.rek.reduce((a, x) => a + x.laten, 0));
    const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
    expect(d).toMatch(/laten staan \d+ \+ opzij \d+ = \d+ tegen salaris \d+: sluit/);
    const l = r.rek.find(x => x.acc === LEEF);
    /* v435 (3): overboeken rekent alleen op de dag van de storting; daarvoor het verwachte saldo op de verwachte storting */
    expect(d).toMatch(new RegExp(`verwacht saldo op 26 okt: -?EUR [\\d.]+ · overboeken dan ±EUR [\\d.]+`));
  });
});

test.describe('v432 · 3. bewijs in Begrijpen', () => {
  test('3. onttrekkingen per ontvangende rekening per maand, de grootste bovenaan met de bron; tussen spaar en reservering telt niet (v433)', async ({ page }) => {
    await S.boot(page);
    await add(page, [[SPAAR, '2026-10-12', -75, 'Overboeking', 'From Spaar to Reservering', 'intern'], ['NL01RESV0000005555', '2026-10-12', 75, 'Overboeking', 'From Spaar to Reservering', 'intern']]);
    expect(await page.evaluate(() => { OWN = [...new Set([...OWN, 'NL01RESV0000005555'])]; SET.resAcc = 'NL01RESV0000005555'; save(); return resAccId(); })).toBe('NL01RESV0000005555');
    await page.evaluate(() => { go('maand'); window._gripTab = 'begrijpen'; gripNaarSymptoom('pat:spaargeld'); });
    const rows = await page.locator('[data-rekont]').allInnerTexts();
    expect(rows[0]).toMatch(/^Leefgeld sep €1\.050 \(3×\)/);
    expect(rows[0]).toContain('hier komt het tekort vandaan');
    expect(rows.join('|')).not.toMatch(/€75/);
    expect(rows.join('|')).not.toMatch(/onbekend|niet aanwijst/);
    expect(await page.locator('[data-tekortbron]').count()).toBe(1);
    const naar = await page.locator('[data-reknaar="NL01LEEF0000004444"]').innerText();
    expect(naar).toContain('na je salaris naartoe €1.000 · werkelijk afgegaan €925');
  });
});

test.describe('v432 · 4. Kiezen: zo verdeel je je salaris', () => {
  test('4a. bij salaris opgedeeld is de keuze "Zo verdeel je je salaris", met een regel per rekening en opzij', async ({ page }) => {
    await S.boot(page);
    const k = await page.evaluate(() => { go('maand'); oorzaakKies('pat:spaargeld', 'opgedeeld'); oorzaakBevestig('pat:spaargeld'); return gripCyclusLees().kies.filter(k => k.sym === 'pat:spaargeld').map(k => [k.id, k.naam]); });
    expect(k[0]).toEqual(['oorz:pat:spaargeld:salverdeling', 'Zo verdeel je je salaris']);
    await page.evaluate(() => openSalVerdeling('pat:spaargeld'));
    await expect(page.locator('[data-salvrek]')).toHaveCount(2);
    await expect(page.locator('[data-salvopzij]')).toContainText(/Opzij €[\d.]+/);   // v440: geen "Plan €280 + vrij sparen" meer
    await expect(page.locator('[data-salvgevolg]')).toContainText('Leefgeld: laagste saldo');
    await expect(page.locator('[data-salvgevolg]')).toContainText('onttrekkingen €0');
  });
  test('4b. niets voorgekozen: drie gelijke knoppen; Niet nu schrijft niets', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => openSalVerdeling('pat:spaargeld'));
    const cls = await page.locator('#salVerdeling [data-voet] button').evaluateAll(b => b.map(x => x.className));
    expect(cls).toEqual(['btn sec', 'btn sec', 'btn sec']);
    await page.locator('[data-salvnietnu]').click();
    expect(await page.evaluate(() => SET.salVerdeling || null)).toBeNull();
  });
  test('4c. Bedragen aanpassen rekent live, de som blijft het salaris, en meer dan je salaris kan niet', async ({ page }) => {
    await S.boot(page);
    await page.evaluate(() => openSalVerdeling('pat:spaargeld'));
    const op0 = await page.locator('[data-salvopzij]').innerText();
    await page.locator('[data-salvaanpassen]').click();
    const l0 = await page.evaluate(() => rekVoorstel().rek.find(r => r.acc === 'NL01LEEF0000004444').laten);
    await page.locator(`[data-salvveld="${LEEF}"]`).fill(String(l0 + 500));
    const op1 = await page.locator('[data-salvopzij]').innerText();
    const num = t => +t.match(/Opzij €([\d.]+)/)[1].replace(/\./g, '');
    expect(num(op0) - num(op1)).toBe(500);
    await expect(page.locator('[data-salvgevolg]')).toContainText(`Leefgeld: laagste saldo`);
    await page.locator(`[data-salvveld="${LEEF}"]`).fill('9000');
    await expect(page.locator('[data-salvakkoord]')).toBeDisabled();
    await expect(page.locator('#salVerdeling [data-voetreden]')).toContainText('meer dan je salaris');
  });
  test('4d. Akkoord legt de verdeling en een afspraak vast, zegt "Pas je automatische salarisverdeling hierop aan", en verplaatst niets', async ({ page }) => {
    await S.boot(page);
    const tx0 = await page.evaluate(() => TX.length);
    await page.evaluate(() => { go('maand'); oorzaakKies('pat:spaargeld', 'opgedeeld'); oorzaakBevestig('pat:spaargeld'); openSalVerdeling('pat:spaargeld'); });
    await page.locator('[data-salvakkoord]').click();
    await expect(page.locator('body')).toContainText('Pas je automatische salarisverdeling hierop aan');
    const r = await page.evaluate(() => ({ sv: SET.salVerdeling, gek: gripCyclusLees().gekozenO.map(o => o.id), n: TX.length }));
    expect(r.gek).toContain('oorz:pat:spaargeld:salverdeling');
    expect(r.sv.opzij + Object.values(r.sv.rek).reduce((a, v) => a + v, 0)).toBe(r.sv.salaris);
    expect(r.n).toBe(tx0);
  });
  test('4e. op de salarisdag een melding op Zien, en niet op een andere dag', async ({ page }) => {
    const SV = { op: '2026-10-16', ym: '2026-10', rek: { [MAIN]: 1150, [LEEF]: 1050 }, opzij: 3016, plan: 2200, salaris: 5216, salAcc: MAIN, voor: { ont: {}, laagst: {} }, teLaag: {}, antwoord: {} };
    await S.boot(page, { dag: '2026-10-24', set: { salVerdeling: SV } });
    await page.evaluate(() => go('maand'));
    await expect(page.locator('[data-salvmelding]')).toHaveCount(0);
    await add(page, [[MAIN, '2026-10-24', 5216, 'Werkgever', 'SALARIS LOON']]);
    await page.evaluate(() => { window._rekV = null; go('maand'); renderMaand(); });
    await expect(page.locator('[data-salvmelding]')).toContainText('Salaris binnen: Leefgeld €1.050, Salarisrekening €1.150, opzij €3.016');
  });
});

/* v435: "Was het bedrag te laag?" (5a/5b) is vervangen door moment 2 (einde periode); zie v435.spec.js */

test.describe('v432 · 6. blok 23', () => {
  test('6. blok 23 per rekening en de vijf controles', async ({ page }) => {
    await S.boot(page);
    const d = await page.evaluate(() => { const b = DIAG_BLOKKEN.find(b => b.lees === diagRekVerdeling); return b ? [b.titel, b.lees().join('\n')] : null; });
    expect(d[0]).toMatch(/^Laten staan per rekening/);
    const t = d[1];
    expect(t).toMatch(/\nLeefgeld\n  vaste lasten 0 \(termijnen in de periode\)\n  potjes \d+: /);
    expect(t).toMatch(/LATEN STAAN \d+/);
    expect(t).toMatch(/ONTTREKKINGEN PER REKENING PER MAAND\n  Leefgeld 2026-09 1050 \(3×: 2026-09-08, 2026-09-15, 2026-09-20\) · de grootste/);
    expect(t).toMatch(/: sluit\n.*: sluit\n.*: gelijk\n(  onttrekkingen 20\d\d-\d\d: per rekening samen \d+ tegen blok 20 punt 4 \d+: gelijk\n){3}  Plan-inleg 0 tegen blok 20 punt 7 \(inleg in Plan: budget\) 0: gelijk\n  gestopte of opgezegde post die meetelt: geen/);   // v440: Plan-inleg bestaat niet meer, de controle staat op 0
  });
});
