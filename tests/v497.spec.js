/* v497: salarisperiode deel 1c. Eén budget met de goede indeling, de voorbeeldweergave volledig, en afsluiten per eenheid.
   In de era (vanaf 24 nov 2026) is het budget van de lopende periode overal hetzelfde getal met dezelfde indeling: VAST (de vaste
   lasten op hun datum, inclusief het vaste deel van een gesplitst potje zoals de lease in Vervoer), POTJES (alleen het variabele
   deel), en Contant apart. Het totaal is ongewijzigd (alleen de indeling verschuift). De voorbeeldweergave ("Bekijk als <datum>")
   zet élke datumbron, zodat Inzichten de periode toont en geen kalendermaand. Opzij is wat er sinds de start van de LOPENDE periode
   opzij ging. Afsluiten gaat per eenheid: de korte november (1–23), daarna de salarisperiodes.
   a. "Bekijk als 26 nov": geen scherm noemt oktober/november als budgetperiode; Inzichten en Grip tonen de periode. Sabotage:
      voorbeeldStart reset curMonth niet → Inzichten valt terug op een kalendermaand.
   b. Zien, Grip-Begrijpen, Inzichten, de sheet "Nieuwe periode" en blok 20 tonen hetzelfde periode-budget, in centen. Sabotage:
      Begrijpen leest het maandbudget (budgetVastTekst) in plaats van het periode-budget.
   c. Een potje met een vast deel (de lease in Vervoer) telt dat deel bij VAST, niet bij potjes. Sabotage: het hele potje bij potjes.
   d. Het totaal vóór de herindeling (budgetVoorPeriode + vaste lasten zonder potje) is gelijk aan ná (vast + potjes + Contant), in
      centen. Sabotage: het vaste deel uit het totaal halen.
   e. Op 26 nov is opzij alleen wat sinds 24 nov opzij ging (de lopende periode), niet de vorige. Sabotage: de vorige periode lezen.
   f. Afsluiten vraagt eerst om de korte november (1–23), en daarna (na 23 dec) om de eerste periode. Sabotage: november als hele
      maand labelen. */
const { test, expect } = require('@playwright/test');
const S = require('./v489-stand');

test('a. voorbeeld 26 nov: Inzichten en Grip tonen de periode, geen kalendermaand als budgetperiode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-10-28', novSalaris: false });   // pre-era boot, GEEN november-boeking: months() moet de voorbeeldmaand zelf toevoegen
  const r = await page.evaluate(() => {
    voorbeeldStart('2026-11-26');
    renderIns(); const ins = document.getElementById('s-ins').innerHTML;
    const grip = gripZienTabel();
    const res = {
      insPeriode: /data-insmaand="periode"/.test(ins),
      insGeenOkt: !/MAANDBUDGET OKTOBER/i.test(ins) && !/budgetperiode[^<]*oktober/i.test(ins),
      gripPeriode: /data-zienstand="periode"/.test(grip),
      curMonth: (typeof curMonth === 'undefined' ? 'x' : curMonth),
      monthsHeeftNov: months().includes('2026-11'),
    };
    voorbeeldStop();
    return res;
  });
  expect(r.monthsHeeftNov).toBe(true);
  expect(r.curMonth).toBe(null);          // sabotage (curMonth niet resetten) → blijft staan en Inzichten valt terug op een maand
  expect(r.insPeriode).toBe(true);        // Inzichten toont de periode-kop
  expect(r.insGeenOkt).toBe(true);
  expect(r.gripPeriode).toBe(true);
});

test('b. Zien, Begrijpen, Inzichten, sheet en blok 20 tonen hetzelfde periode-budget, in centen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const r = await page.evaluate(() => {
    const PB = periodeBudget();
    const totaalC = Math.round(PB.totaal * 100);
    const grip = gripZienTabel();
    renderIns(); const ins = document.getElementById('s-ins').innerHTML;
    let V = null; try { V = maandVooruit(); } catch (_) {}
    const beg = gripGroepBrugKaart(V);
    const begKop = (beg.match(/data-groepkop[^>]*>([^<]+)</) || [])[1] || '';
    openPeriodeStart(); const sheet = document.getElementById('sheet').innerHTML;
    const blok = (typeof diagMaandBudget === 'function') ? (() => { try { let vk = null, D = null; try { vk = maandVooruit(); } catch (_) {} return diagMaandBudget(vk, vk, D).join('\n'); } catch (e) { return 'ERR ' + e.message; } })() : '';
    const sheetC = +(sheet.match(/data-periodebudget="(\d+)"/) || [])[1];
    const zienBudget = +(grip.match(/data-zienbudget="(\d+)"/) || [])[1];      // potjes (variabel)
    const insBudget = +(ins.match(/data-insbudget="(\d+)"/) || [])[1];
    const begPeriode = +(beg.match(/data-groepperiode="(\d+)"/) || [])[1];     // periode-totaal op Begrijpen
    const blokKlopt = /CONTROLE indeling = totaal:.*klopt/.test(blok);
    return { totaalC, sheetC, zienBudget, insBudget, begPeriode, potC: Math.round(PB.potjes.totaal), blokKlopt,
      begKopPerPeriode: /per periode/.test(begKop), begKopVastSinds: /vast sinds/.test(begKop) };
  });
  expect(r.sheetC).toBe(r.totaalC);              // de sheet toont het totaal in centen
  expect(r.zienBudget).toBe(r.potC);             // Zien en Inzichten tonen hetzelfde potjes(variabel)-deel
  expect(r.insBudget).toBe(r.potC);
  expect(r.begPeriode).toBe(Math.round(r.totaalC / 100));   // Begrijpen leest het periode-budget (sabotage: maandbudget)
  expect(r.begKopPerPeriode).toBe(true);         // de budget-regel op Begrijpen zegt "per periode"
  expect(r.begKopVastSinds).toBe(false);         // en niet meer het maandbudget "(vast sinds ...)" (sabotage: maandbudget → true)
  expect(r.blokKlopt).toBe(true);                // blok 20: vast + potjes + Contant = totaal, in centen
});

test('c. een potje met een vast deel (lease) telt dat bij vast, niet bij potjes', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-24' });
  const r = await page.evaluate((MAIN) => {
    const add = (d, a, name, desc) => { const t = { id: 'lz' + d, date: d, amount: a, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] }; categorize(t); TX.push(t); };
    for (const m of ['2026-09', '2026-10', '2026-11']) add(m + '-12', -537, 'Hiltermann Lease', 'SEPA INCASSO AUTOLEASE HILTERMANN');
    SET.budgets = Object.assign({}, SET.budgets, { vervoer: 1100 }); SET.potWekelijks = Object.assign({}, SET.potWekelijks, { vervoer: true }); _dataGen++; try { runMemoVergeten(); } catch (_) {}
    const PB = periodeBudget();
    const vastDeel = PB.vast.deel.vervoer || 0;
    const varVervoer = (PB.potjes.perDag.vervoer || 0) + (PB.potjes.perKeer.vervoer || 0);
    return { vastDeel, varVervoer, vastTotaal: PB.vast.totaal };
  }, S.MAIN);
  expect(r.vastDeel).toBe(537);                  // het vaste deel van de lease staat bij vast
  expect(r.varVervoer).toBeLessThan(1100);       // het variabele potje-deel is minder dan het hele potje (sabotage: hele potje bij potjes → 1100)
  expect(r.vastTotaal).toBeGreaterThanOrEqual(537);
});

test('d. het totaal vóór = ná de herindeling, in centen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-24' });
  const r = await page.evaluate((MAIN) => {
    const add = (d, a, name, desc) => { const t = { id: 'lz' + d, date: d, amount: a, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] }; categorize(t); TX.push(t); };
    for (const m of ['2026-09', '2026-10', '2026-11']) add(m + '-12', -537, 'Hiltermann Lease', 'SEPA INCASSO AUTOLEASE HILTERMANN');
    SET.budgets = Object.assign({}, SET.budgets, { vervoer: 1100, contant: 400 }); SET.potWekelijks = Object.assign({}, SET.potWekelijks, { vervoer: true }); _dataGen++; try { runMemoVergeten(); } catch (_) {}
    const PB = periodeBudget();
    const na = Math.round((PB.vast.totaal + PB.potjes.totaal + PB.contant) * 100);
    return { voorC: Math.round(PB.totaal * 100), naC: na };
  }, S.MAIN);
  expect(r.naC).toBe(r.voorC);                   // vast + potjes + Contant = totaal (sabotage: vaste deel uit het totaal → verschilt)
});

test('e. opzij 26 nov is alleen wat sinds 24 nov opzij ging', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const r = await page.evaluate((SPAAR) => {
    // een storting naar de spaarrekening VÓÓR de periodestart (in de vorige periode) en één erbinnen
    const add = (d, a) => { const t = { id: 'sp' + d, date: d, amount: a, acc: SPAAR, name: 'Overboeking', desc: 'van betaalrekening', typ: '', ref: '', src: 'csv', accName: 'Spaar', refNums: [] }; categorize(t); TX.push(t); };
    add('2026-11-10', 500);    // vorige periode (vóór 24 nov): mag NIET meetellen
    add('2026-11-25', 120);    // lopende periode (na 24 nov): telt
    save(); try { buildAccMeta(); } catch (_) {} _dataGen++;
    const O = opzijPeriode();
    const grip = gripZienTabel();
    const gedaan = +(grip.match(/data-gedaan="(-?\d+)"/) || [])[1];
    return { start: O.start, netto: O.netto, gedaan, meetbaar: O.meetbaar };
  }, S.SPAAR);
  expect(r.start).toBe('2026-11-24');            // de lopende periode begint op de salarisregel
  expect(r.meetbaar).toBe(true);
  expect(r.netto).toBe(120);                     // alleen de storting van 25 nov (sabotage: vorige periode → 620)
  expect(r.gedaan).toBe(120);                    // en de Grip-kop toont dat
});

test('f. afsluiten vraagt de korte november (1–23), daarna de periode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const nov = await page.evaluate(() => {
    const E = afsluitEenheden();
    const M = afsluitMaand();
    const label = afsluitLabel(M);
    return { M, label, soort: (E.find(x => x.key === M) || {}).soort, aantal: E.length,
      heeftBereik: /1–23|1-23/.test(label) };
  });
  expect(nov.M).toBe('2026-11');                 // de korte november is de eerstvolgende afsluit-eenheid
  expect(nov.heeftBereik).toBe(true);            // en hij heet "november ... (1–23)" (sabotage: hele maand → geen bereik)

  // na 23 dec (in de tweede periode) en met november afgesloten: de eerste periode is aan de beurt
  const per = await page.evaluate(() => {
    SET.maandAfsluiting = Object.assign({}, SET.maandAfsluiting, { '2026-11': { op: '2026-11-24' } });
    window._voorbeeld = true; window._voorbeeldDag = '2026-12-26'; _dataGen++;
    const E = afsluitEenheden();
    const M = afsluitMaand();
    const label = afsluitLabel(M);
    const res = { M, label, isPeriode: typeof M === 'string' && M.slice(0, 2) === 'P:', aantal: E.length };
    window._voorbeeld = false; window._voorbeeldDag = null; _dataGen++;
    return res;
  });
  expect(per.isPeriode).toBe(true);              // de eerste salarisperiode is nu de afsluit-eenheid (sabotage: hele maand → een ym)
  expect(per.label).toMatch(/nov|dec/);          // het periodelabel (24 nov – 23 dec)
});
