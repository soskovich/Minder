/* v441 sectie 1: DE SALARISVERDELING HERZIEN. Het aandeel per potje, contant en de buffer lezen EEN venster sinds de huidige
   rekening-indeling (de eerste afgeronde maand waarin alle betaalrekeningen een boeking hadden, minstens 1 maand, hoogstens 3).
   De vaste last staat op de rekening van de EXTERNE betaling, nooit een interne tussenstap. Per potje kun je "gaat niet via deze
   rekening" zetten; het aandeel herverdeelt. Een herkend abonnement (Sport City) telt als vaste last (gepland), niet als potje.
   Fixture v432-stand (MAIN = Salarisrekening, LEEF = Leefgeld sinds 2026-04), vandaag 2026-10-16. */
const { test, expect } = require('@playwright/test');
const S = require('./v432-stand');
const { MAIN, LEEF } = S;

test('a. het venster is gekapt op 3 maanden, ook als de indeling ouder is (Leefgeld sinds apr → jul, aug, sep)', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => ({ af: rekVoorstel().af, indel: rekIndelingMaand(rekBetaal()) }));
  expect(r.indel).toBe('2026-04');                       // de indeling werd compleet toen Leefgeld erbij kwam
  expect(r.af).toEqual(['2026-07', '2026-08', '2026-09']); // maar gekapt op REKV.maanden = 3 afgeronde maanden
});

test('b. het venster volgt een nieuwe rekening meteen: een derde rekening sinds sep → het venster is alleen sep', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(() => {
    const D = 'NL01DERD0000009999';
    const add = (d, a) => { const t = { id: 'd' + d + a, date: d, amount: a, acc: D, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'boodschappen'; TX.push(t); };
    add('2026-09-05', -40); add('2026-09-19', -35);
    if (!OWN.includes(D)) OWN.push(D);
    SET.acctName = Object.assign({}, SET.acctName, { [D]: 'Derde' });
    SET.savingsAcc = Object.assign({}, SET.savingsAcc, { [D]: false });
    save(); try { buildAccMeta(); } catch (_) {}
    return { af: rekVoorstel().af, indel: rekIndelingMaand(rekBetaal()), br: rekBetaal().length };
  });
  expect(r.br).toBe(3);
  expect(r.indel).toBe('2026-09');          // de nieuwste rekening bepaalt de indeling
  expect(r.af).toEqual(['2026-09']);        // minstens 1 maand, en die begint bij de nieuwe indeling
});

test('c. de vaste last staat op de rekening van de externe betaling, nooit op een interne tussenstap', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(({ MAIN, LEEF }) => {
    const add = (acc, d, a, cat, desc) => { const t = { id: 'h' + acc.slice(-4) + d, date: d, amount: a, acc, name: 'Huur Cathalina', desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (cat) OVR[t.id] = cat; TX.push(t); };
    /* de EXTERNE betaling aan de verhuurder, elke maand vanaf de Salarisrekening (MAIN); een incasso staat hier voor een herkende
       terugkerende betaling, zodat recurringSchedule hem als vaste last ziet (de detectie-route is niet wat deze test toetst) */
    for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add(MAIN, m + '-01', -300, 'huur', 'SEPA INCASSO HUUR CATHALINA');
    /* een INTERNE tussenstap met dezelfde naam, recenter (geld schuift eerst naar Leefgeld) */
    add(LEEF, '2026-10-12', -300, 'intern', 'OVERBOEKING HUUR CATHALINA');
    save(); try { buildAccMeta(); } catch (_) {}
    const P = rekVoorstel(), v = [...P.vast, ...P.vastBuiten].find(x => /Cathalina/i.test(x.naam));
    return { gevonden: !!v, acc: v ? v.acc : null, MAIN, LEEF };
  }, { MAIN, LEEF });
  expect(r.gevonden).toBe(true);     // zonder de externe-leg-keuze zou de interne tussenstap de post laten vallen
  expect(r.acc).toBe(r.MAIN);        // de rekening van de externe betaling, niet Leefgeld (de tussenstap)
});

test('d. "gaat niet via deze rekening" laat de rekening weg en herverdeelt het aandeel over de andere', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(({ MAIN, LEEF }) => {
    /* boodschappen van beide rekeningen in het venster, zodat het aandeel over twee rekeningen verdeelt */
    const add = (acc, d) => { const t = { id: 'g' + acc.slice(-4) + d, date: d, amount: -50, acc, name: 'Albert Heijn', desc: 'BEA, BETAALPAS ALBERT HEIJN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'boodschappen'; TX.push(t); };
    for (const m of ['2026-07', '2026-08', '2026-09']) { add(MAIN, m + '-06'); add(LEEF, m + '-08'); }
    save(); try { buildAccMeta(); } catch (_) {}
    const voor = rekVoorstel(), aV = {}; for (const rr of voor.rekAlle) { const p = rr.potDelen.find(x => x.k === 'boodschappen'); if (p) aV[rr.acc] = p.aandeel; }
    rekGeenViaZet('boodschappen', LEEF);   // boodschappen gaat niet via Leefgeld
    const na = rekVoorstel(), aN = {}; for (const rr of na.rekAlle) { const p = rr.potDelen.find(x => x.k === 'boodschappen'); if (p) aN[rr.acc] = p.aandeel; }
    return { voorMain: aV[MAIN] || 0, voorLeef: aV[LEEF] || 0, naMain: aN[MAIN] || 0, naLeef: aN[LEEF] || 0, MAIN, LEEF };
  }, { MAIN, LEEF });
  expect(r.voorLeef).toBeGreaterThan(0);   // eerst liep boodschappen deels via Leefgeld
  expect(r.voorMain).toBeGreaterThan(0);
  expect(r.naLeef).toBe(0);                // na de keuze niet meer
  expect(r.naMain).toBeCloseTo(1, 5);      // het aandeel ging naar de Salarisrekening
});

test('e. een herkend abonnement telt als vaste last (gepland), niet als potje', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(({ MAIN }) => {
    const add = (d) => { const t = { id: 'sc' + d, date: d, amount: -45, acc: MAIN, name: 'Sport City', desc: 'SEPA INCASSO SPORT CITY', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'sport'; TX.push(t); };
    for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) add(m + '-02');
    save(); try { buildAccMeta(); } catch (_) {}
    const P = rekVoorstel();
    return { vast: [...P.vast, ...P.vastBuiten].some(x => /Sport City/i.test(x.naam)), potSport: P.potExp.some(p => p.k === 'sport') };
  }, { MAIN });
  expect(r.vast).toBe(true);     // Sport City staat onder gepland
  expect(r.potSport).toBe(false); // en niet als potje bij geschat
});

/* v441 sectie 2: RESERVERINGEN IN DE VERDELING. Fixture: een reserveringsrekening met EUR 300, twee reserveringen
   (Autoverzekering EUR 600 in dec, Vakantie EUR 1.000 in mrt). Het saldo wordt op vervaldatum-volgorde toegerekend. */
const RESACC = 'NL01RESV0000005555';
async function metRes(page) {
  await page.evaluate((RESACC) => {
    if (!OWN.includes(RESACC)) OWN.push(RESACC);
    SET.acctName = Object.assign({}, SET.acctName, { [RESACC]: 'Reserveringen' });
    SET.savingsAcc = Object.assign({}, SET.savingsAcc, { [RESACC]: false });
    SET.manualBal = Object.assign({}, SET.manualBal, { [RESACC]: 300 });
    SET.resAcc = RESACC;
    SET.reserveringen = [
      { id: 'rA', naam: 'Autoverzekering', bedrag: 600, intervalM: 0, vervalmaand: '2026-12' },
      { id: 'rV', naam: 'Vakantie', bedrag: 1000, intervalM: 0, vervalmaand: '2027-03' }
    ];
    save(); try { buildAccMeta(); } catch (_) {}
  }, RESACC);
}

test('f. reserveringen: saldo op vervaldatum-volgorde, (doel − saldo) ÷ periodes, opzij is salaris − som − reserveringen', async ({ page }) => {
  await S.boot(page);
  await metRes(page);
  const r = await page.evaluate(() => { const P = rekVoorstel(); return { rijen: P.resRijen, totaal: P.reserveringen, stand: P.resStand, opzij: P.opzij, salaris: P.salaris, som: P.som, resOk: P.resOk }; });
  expect(r.resOk).toBe(true);
  expect(r.rijen.map(x => x.naam)).toEqual(['Autoverzekering', 'Vakantie']);   // op vervaldatum-volgorde (dec vóór mrt)
  expect(r.rijen[0].saldo).toBe(300);   // het hele saldo gaat naar de eerstvolgende post
  expect(r.rijen[1].saldo).toBe(0);
  for (const x of r.rijen) expect(x.per).toBeCloseTo((x.doel - x.saldo) / x.periodes, 5);   // (doel − saldo) ÷ periodes
  expect(r.totaal).toBe(Math.round(r.rijen.reduce((a, x) => a + x.per, 0)));
  expect(r.opzij).toBeCloseTo(r.salaris - r.som - r.totaal, 5);   // opzij staat na de reserveringen
});

test('g. de verdeling toont de Reserveringen-regel met het totaal en Hoe berekend per reservering', async ({ page }) => {
  await S.boot(page);
  await metRes(page);
  await page.evaluate(() => { go('maand'); openSalVerdeling('x'); });
  const tot = await page.evaluate(() => Math.round(rekVoorstel().reserveringen));
  await expect(page.locator('#salVerdeling [data-salvres]')).toContainText('Reserveringen');
  await expect(page.locator('#salVerdeling [data-salvresbedrag]')).toHaveText(new RegExp(`€${tot}`));
  await expect(page.locator('#salVerdeling [data-salvreshoeblok]')).toHaveCount(0);
  await page.locator('#salVerdeling [data-salvreshoe]').click();
  const blok = page.locator('#salVerdeling [data-salvreshoeblok]');
  await expect(blok).toContainText('Autoverzekering');
  await expect(blok).toContainText('Vakantie');
  await expect(blok).toContainText('doel €600');
});

test('h. moment 2 meet wat er naar de reserveringsrekening ging tegen het advies', async ({ page }) => {
  await S.boot(page);
  await metRes(page);
  const m = await page.evaluate((RESACC) => {
    /* een afspraak van een afgelopen periode (24 aug t/m 23 sep), met een reserveringen-advies van 150 */
    SET.salVerdeling = { op: '2026-08-24', ym: '2026-08', salYM: '2026-08', rek: {}, opzij: 2000, reserveringen: 150, resAcc: RESACC, salaris: 5216, salAcc: null, start: '2026-08-24', eind: '2026-09-23', dagen: 31, buffer: {}, verwacht: {}, voor: { laagst: {} } };
    /* er ging netto 120 naar de reserveringsrekening in die periode */
    const add = (d, a, n) => { const t = { id: 'm2' + d + a, date: d, amount: a, acc: RESACC, name: n, desc: n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'intern'; TX.push(t); };
    add('2026-09-01', 120, 'OVERBOEKING NAAR RESERVERINGEN');
    save(); try { buildAccMeta(); } catch (_) {}
    const M = salMoment2();
    return M ? { resW: M.resW, resAdvies: M.resAdvies } : null;
  }, RESACC);
  expect(m).not.toBeNull();
  expect(m.resAdvies).toBe(150);   // het advies uit de afspraak
  expect(m.resW).toBe(120);        // netto naar de reserveringsrekening in de periode
});

/* v441 sectie 3: DE ROUTE VAN HET SALARIS bovenaan de sheet, en de som van de delen is het salaris. */
test('i. de route toont salaris → rekening → delen (reserveringen, spaarrekening, blijft) en telt op tot het salaris', async ({ page }) => {
  await S.boot(page);
  await metRes(page);
  const r = await page.evaluate(() => { const P = rekVoorstel(), R = salRouteDelen(P); return { som: R.som, salaris: Math.round(P.salaris), namen: R.delen.map(x => x.naam) }; });
  expect(r.som).toBe(r.salaris);                      // de route sluit op het salaris (controle A+B+C+D+E=salaris)
  expect(r.namen).toContain('Reserveringen');
  expect(r.namen).toContain('Spaarrekening');
  expect(r.namen).toContain('blijft');
  await page.evaluate(() => { go('maand'); openSalVerdeling('x'); });
  const t = await page.locator('#salVerdeling [data-salvroute]').innerText();
  expect(t).toMatch(/^Salaris €[\d.]+ → .+ → /);      // salaris → de rekening waar het binnenkomt → de delen
  expect(t).toContain('Spaarrekening');
  expect(t).toContain('blijft');
  const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
  expect(d).toMatch(/de route telt op tot het salaris: \d+ tegen \d+: sluit/);
});

/* v441 sectie 4: BESTEMMING VOOR WAT OVER IS. salMoment2 wordt gestubd voor een gecontroleerd moment 2
   (Salarisrekening eind 1000 buffer 600, Leefgeld eind 400 buffer 300 → over 500). */
async function stubMoment2(page) {
  await page.evaluate(({ MAIN, LEEF }) => {
    window._m2stub = () => ({ R: [{ acc: MAIN, naam: 'Salarisrekening', eind: 1000, buffer: 600, oordeel: 'paste', advies: 0, voorstel: 0, laagst: 0, laagstVerwacht: 0, ont: 0, grootste: 0, basis: 0 }, { acc: LEEF, naam: 'Leefgeld', eind: 400, buffer: 300, oordeel: 'paste', advies: 0, voorstel: 0, laagst: 0, laagstVerwacht: 0, ont: 0, grootste: 0, basis: 0 }], PV: { ym: '2026-08', start: '2026-08-24', eind: '2026-09-23', dagen: 31 }, volg: null, schaal: 1, opzijW: 0, opzijAdvies: 0, resW: 0, resAdvies: 0, salaris: 5216, som: 0, opzijVolg: 0 });
    salMoment2 = window._m2stub;
  }, { MAIN, LEEF });
}

test('j. wat over is = eindsaldo boven de buffer; opslaan pas als het hele bedrag een bestemming heeft', async ({ page }) => {
  await S.boot(page);
  await stubMoment2(page);
  const r = await page.evaluate(() => {
    const W = watOverPeriode(); const over = W.over;
    /* een deel verdelen is niet genoeg: opslaan schrijft niets */
    window._watover = { key: W.key, delen: { inhalen: 200, sparen: 0, reservering: 0, anders: 0 }, resWelke: '', anderLabel: '' };
    watOverZet(); const naPartial = SET.watOver ? SET.watOver[W.key] : undefined;
    /* het hele bedrag verdeeld: nu wel */
    window._watover = { key: W.key, delen: { inhalen: 200, sparen: 200, reservering: 100, anders: 0 }, resWelke: '', anderLabel: '' };
    watOverZet(); const naVol = SET.watOver[W.key];
    return { over, naPartial, naVol };
  });
  expect(r.over).toBe(500);                 // (1000−600) + (400−300)
  expect(r.naPartial).toBeUndefined();      // niet volledig verdeeld → niets vastgelegd
  expect(r.naVol.delen).toEqual({ inhalen: 200, sparen: 200, reservering: 100, anders: 0 });
});

test('k. de Kiezen-kaart toont "over deze periode", Opslaan staat uit tot alles verdeeld is', async ({ page }) => {
  await S.boot(page);
  await stubMoment2(page);
  await page.evaluate(() => { go('maand'); if (typeof gripKiesTab === 'function') gripKiesTab('kiezen'); renderMaand(); });
  const k = page.locator('#gripWatOver');
  await expect(k).toContainText('Bestemming voor wat over is');
  await expect(k).toContainText('€500 over deze periode');
  await expect(page.locator('#gripWatOver [data-watopslaan]')).toBeDisabled();   // niets voorgeselecteerd
  await page.locator('#gripWatOver [data-watveld="sparen"]').fill('500');
  await expect(page.locator('#gripWatOver [data-watopslaan]')).toBeEnabled();
  await page.locator('#gripWatOver [data-watopslaan]').click();
  const saved = await page.evaluate(() => SET.watOver['2026-08'].delen.sparen);
  expect(saved).toBe(500);
});

test('l. de Terugblik meet gekozen tegen werkelijk naar je spaar- en reserveringsrekening', async ({ page }) => {
  await S.boot(page);
  await metRes(page);
  await stubMoment2(page);
  const r = await page.evaluate((RESACC) => {
    SET.watOver = { '2026-08': { delen: { inhalen: 100, sparen: 200, reservering: 150, anders: 50 }, resWelke: '', anderLabel: 'cadeau', over: 500, op: '2026-09-23' } };
    const T0 = watOverTerug();   // wat er zonder mijn boekingen al netto ging (de fixture heeft eigen bewegingen)
    /* nog eens 250 naar de spaarrekening, 120 naar de reserveringsrekening in de periode */
    const spaar = n26SavingsAccounts()[0];
    const add = (acc, d, a) => { const t = { id: 't' + acc.slice(-4) + d + a, date: d, amount: a, acc, name: 'Eigen overboeking', desc: 'OVERBOEKING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = 'intern'; TX.push(t); };
    add(spaar, '2026-09-01', 250); add(RESACC, '2026-09-02', 120);
    save();
    const T1 = watOverTerug();
    return { gekozenSpaar: T1.gekozenSpaar, gekozenRes: T1.gekozenRes, dSpaar: T1.naarSpaar - T0.naarSpaar, dRes: T1.naarReservering - T0.naarReservering };
  }, RESACC);
  expect(r.gekozenSpaar).toBe(300);       // inhalen 100 + sparen 200
  expect(r.gekozenRes).toBe(150);
  expect(r.dSpaar).toBe(250);             // de meting volgt wat er netto naar de spaarrekening ging
  expect(r.dRes).toBe(120);               // en naar de reserveringsrekening
});

/* v441 sectie 5: ONREGELMATIG INKOMEN. Een bonus van EUR 2.500 die binnen is in de lopende salarisperiode. */
test('m. een bonus telt niet als salaris en krijgt een Kiezen-kaart met bestemmingen, niets voorgeselecteerd', async ({ page }) => {
  await S.boot(page);
  const r = await page.evaluate(({ MAIN }) => {
    const sal0 = rekVoorstel().salaris;
    const t = { amount: 2500, date: '2026-10-05', acc: MAIN, name: 'Bonus', desc: 'SALARIS BONUS', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); OVR[t.id] = 'inkomen'; TX.push(t);
    SET.onregelmatig = Object.assign({}, SET.onregelmatig, { [t.id]: 2500 });
    save(); try { buildAccMeta(); } catch (_) {}
    const B = onregBinnen();
    return { sal0, sal1: rekVoorstel().salaris, nBinnen: B.length, bedrag: B[0] && B[0].bedrag, bid: t.id, naam: B[0] && B[0].naam };
  }, { MAIN });
  expect(r.sal1).toBe(r.sal0);          // de bonus telt niet als salaris (inkomenEenmalig)
  expect(r.nBinnen).toBe(1);
  expect(r.bedrag).toBe(2500);
  await page.evaluate(() => { go('maand'); if (typeof gripKiesTab === 'function') gripKiesTab('kiezen'); renderMaand(); });
  const k = page.locator(`[data-onreg="${r.bid}"]`);
  await expect(k).toContainText('Bonus · eenmalig €2.500');
  await expect(k.locator('[data-onregopslaan]')).toBeDisabled();   // niets voorgeselecteerd
  await expect(k.locator('[data-onregrij="voorjezelf"]')).toContainText('Voor jezelf');
  await k.locator('[data-onregveld="sparen"]').fill('2500');
  await expect(k.locator('[data-onregopslaan]')).toBeEnabled();
  await k.locator('[data-onregopslaan]').click();
  const saved = await page.evaluate((bid) => SET.onregBestemming[bid].delen.sparen, r.bid);
  expect(saved).toBe(2500);
});

test('n. de Terugblik toont wat je met het eenmalige inkomen deed', async ({ page }) => {
  await S.boot(page);
  const t = await page.evaluate(() => {
    SET.onregBestemming = { 'b9': { delen: { inhalen: 0, sparen: 1500, reservering: 500, voorjezelf: 500, anders: 0 }, resWelke: '', anderLabel: '', bedrag: 2500, naam: 'Bonus', op: '2026-10-05' } };
    save();
    go('maand'); if (typeof gripKiesTab === 'function') gripKiesTab('terugblik'); renderMaand();
    const el = document.querySelector('#gripOnregTerug [data-onregterug]');
    return el ? el.innerText : null;
  });
  expect(t).toContain('Bonus');
  expect(t).toContain('sparen €1.500');
  expect(t).toContain('reservering €500');
  expect(t).toContain('voor jezelf €500');
});

/* v441 sectie 6: BLOK 23 draagt het venster, de reserveringen per stuk, de route en de controles (alleen lezen). */
test('o. blok 23: het venster, de vier nieuwe controles sluiten, en de reserveringen + route staan erin', async ({ page }) => {
  await S.boot(page);
  await metRes(page);
  const d = await page.evaluate(() => diagRekVerdeling().join('\n'));
  expect(d).toContain('venster sinds de rekening-indeling');
  expect(d).toMatch(/geen termijn buiten de periode \([^)]+\): sluit/);
  expect(d).toContain('geen vaste last op een interne tussenrekening (de rekening is die van de externe betaling): sluit');
  expect(d).toContain('contant alleen op de rekening(en) van de opnames: sluit');
  expect(d).toMatch(/eenmalig inkomen binnen deze periode \d+.*zit niet in het salaris \d+: sluit/);
  expect(d).toMatch(/RESERVERINGEN \d+ \(saldo \d+ op vervaldatum-volgorde toegerekend\)/);
  expect(d).toContain('Autoverzekering: doel 600');
  expect(d).toMatch(/ROUTE: salaris \d+ → .+ → /);
  expect(d).toMatch(/de route telt op tot het salaris: \d+ tegen \d+: sluit/);
});
