/* v496: het moment van je salaris (deel 2). Vanaf de era (24 nov 2026) is er bij je salaris één sheet "Nieuwe periode" die budget EN
   verdeling samen vastlegt (periodeVastleggen). Komt het salaris eerder binnen, dan een melding; de periode begint toch op de regel
   (periodeVan.start, besluit 2). Zonder keuze: de kop toont "nog niet bevestigd" met een stip en na 3 dagen één bel-melding; niets
   wordt stil vastgelegd. Het Plan-doel (EUR 2.200) heet "per periode", de EUR 1.766 heet "opzij volgens je verdeling". De
   voorbeeldweergave schrijft niets.
   a. Salaris op de regeldatum (24 nov): de sheet toont budget + verdeling; Vastleggen legt BEIDE vast (periodeBevestigd EN de
      verdeling). Sabotage: Vastleggen schrijft alleen de bevestiging, niet de verdeling → de verdeling wijst niet naar deze periode.
   b. Salaris 3 dagen eerder (21 nov): een melding, en de periode begint toch op 24 nov (periodeVan.start). Sabotage: de periode laten
      beginnen bij binnenkomst → periodeMoment is niet meer "vroeg".
   c. Zonder keuze (27 nov): nog niet bevestigd, en precies één bel-melding na 3 dagen. Sabotage: een onbevestigde periode stil als
      bevestigd lezen → geen "nog niet bevestigd" en geen melding.
   d. Plan toont "doel EUR 2.200 per periode", Zien "opzij volgens je verdeling EUR 1.766". Sabotage: de namen omwisselen.
   e. Het budget in de sheet is in centen gelijk aan budgetVoorPeriode() plus de vaste lasten in de periode die niet in een potje
      zitten; het vaste deel van een gesplitst potje (de lease in Vervoer) staat er één keer in. Sabotage: het vaste deel dubbel tellen.
   f. In de voorbeeldweergave schrijft Vastleggen niets (SET en localStorage ongewijzigd). Sabotage: de voorbeeld-guard eruit. */
const { test, expect } = require('@playwright/test');
const S = require('./v489-stand');

test('a. salaris op de regeldatum: de sheet toont budget + verdeling, Vastleggen legt beide vast', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-24' });
  const r = await page.evaluate(() => {
    const ym = rekVoorstel().per0.ym;
    delete SET.periodeBevestigd; SET.salVerdeling = { op: '2000-01-01', ym: '1999-01', salYM: '1999-01', rek: {} }; _dataGen++;
    openPeriodeStart();
    const sheet = document.getElementById('sheet').innerHTML;
    const toont = { budget: /data-periodebudget=/.test(sheet), verdeling: /data-salvrek=/.test(sheet) && /data-salvroute/.test(sheet), knop: /Vastleggen/.test(sheet) };
    periodeVastleggen('periode');
    return { ym, toont, bevestigd: periodeBevestigd(ym), verdelingYm: (SET.salVerdeling || {}).salYM, verdelingOp: (SET.salVerdeling || {}).op, vandaag: vandaagYMD() };
  });
  expect(r.toont.budget).toBe(true);
  expect(r.toont.verdeling).toBe(true);
  expect(r.toont.knop).toBe(true);
  expect(r.bevestigd).toBe(true);                 // de periode is vastgelegd
  expect(r.verdelingYm).toBe(r.ym);               // en de verdeling is vastgelegd voor deze periode (sabotage: alleen budget → blijft 1999-01)
  expect(r.verdelingOp).toBe(r.vandaag);
});

test('b. salaris 3 dagen eerder: een melding, de periode begint toch op de regeldatum', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-21', novSalaris: false });
  const r = await page.evaluate((MAIN) => {
    const add = (acc, d, a, n, ds) => { const t = { id: 'vroeg' + d, date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); return t; };
    add(MAIN, '2026-11-21', 5216, 'Werkgever', 'SALARIS LOON'); save(); try { buildAccMeta(); } catch (_) {} _dataGen++;
    const M = periodeMoment();
    return { soort: M ? M.soort : null, momentStart: M ? M.start : null, binnen: M ? M.binnen : null,
      vanStart: periodeVan('2026-11-24').start, kaartVroeg: /data-periodevroeg/.test(periodeStartKaart()) };
  }, S.MAIN);
  expect(r.soort).toBe('vroeg');                  // sabotage (begin bij binnenkomst) → niet meer "vroeg"
  expect(r.binnen).toBe('2026-11-21');
  expect(r.momentStart).toBe('2026-11-24');       // de periode begint op de regel, niet bij binnenkomst
  expect(r.vanStart).toBe('2026-11-24');
  expect(r.kaartVroeg).toBe(true);                // de melding "Je salaris is er al"
});

test('c. zonder keuze: nog niet bevestigd, precies één melding na 3 dagen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-27' });
  const r = await page.evaluate(() => {
    const ym = rekVoorstel().per0.ym; delete SET.periodeBevestigd; _dataGen++;
    const M = periodeMoment();
    const notifs = (scoreNotifs() || []).filter(n => n.key === 'periode-onbevestigd');
    const grip = gripZienTabel();
    return { ym, bevestigd: periodeBevestigd(ym), soort: M ? M.soort : null, dagenSinds: M ? M.dagenSinds : null,
      meldN: notifs.length, kopStip: /data-zienonbevestigd/.test(grip) };
  });
  expect(r.bevestigd).toBe(false);                // sabotage (stil als bevestigd lezen) → true
  expect(r.soort).toBe('onbevestigd');
  expect(r.dagenSinds).toBe(3);
  expect(r.meldN).toBe(1);                        // precies één melding
  expect(r.kopStip).toBe(true);                   // de kop toont "nog niet bevestigd" met een stip
});

test('d. Plan "doel per periode", Zien "opzij volgens je verdeling"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-26' });
  const r = await page.evaluate(() => {
    SET.savingMode = 'amount'; SET.savingAmount = 2200;
    SET.salVerdeling = Object.assign({}, SET.salVerdeling, { opzij: 1766 }); _dataGen++;
    go('vooruit'); const plan = document.getElementById('s-vooruit').innerHTML;
    const grip = gripZienTabel();
    const planDoel = (plan.match(/data-planperiodedoel="(\d+)"/) || [])[1];
    const planTxt = (plan.match(/<div class="small" data-planperiodedoel[^>]*>([^<]+)</) || [])[1] || '';
    const zienLabel = (grip.match(/data-zienopzijlabel[^>]*>([^<]+)</) || [])[1] || '';
    return { planDoel, planTxt, planPerPeriode: /per periode/.test(planTxt), planVerdeling: /volgens je verdeling/.test(planTxt),
      zienVerdeling: /volgens je verdeling/.test(zienLabel), zienPerPeriode: /per periode/.test(zienLabel), zienLabel };
  });
  expect(r.planDoel).toBe('2200');
  expect(r.planPerPeriode).toBe(true);            // Plan: "doel per periode"
  expect(r.planVerdeling).toBe(false);            // sabotage (namen omwisselen) → "volgens je verdeling" op het Plan-doel
  expect(r.zienVerdeling).toBe(true);             // Zien: "opzij volgens je verdeling"
  expect(r.zienLabel).toContain('1.766');
  expect(r.zienPerPeriode).toBe(false);
});

test('e. het budget = budgetVoorPeriode + vaste lasten zonder potje, vast deel één keer', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-11-24' });   // de salarisdag: de voorstel-periode en de te bevestigen periode vallen samen
  const r = await page.evaluate((MAIN) => {
    const add = (d, a, name, desc) => { const t = { id: 'lz' + d, date: d, amount: a, acc: MAIN, name, desc, typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] }; categorize(t); TX.push(t); };
    for (const m of ['2026-09', '2026-10', '2026-11']) add(m + '-12', -537, 'Hiltermann Lease', 'SEPA INCASSO AUTOLEASE HILTERMANN');
    save(); try { buildAccMeta(); } catch (_) {}
    SET.budgets = Object.assign({}, SET.budgets, { vervoer: 1100, contant: 400 }); SET.potWekelijks = Object.assign({}, SET.potWekelijks, { vervoer: true }); _dataGen++; try { runMemoVergeten(); } catch (_) {}
    const P = rekVoorstel(), base = budgetVoorMaand(P.per0.ym), BP = budgetVoorPeriode({ ym: P.per0.ym, dagen: P.dagen });
    const vl = (P.vast || []).filter(x => !((+base[x.cat] || 0) > 0));
    const verwacht = BP.totaal + vl.reduce((a, x) => a + Math.round(+x.bedrag || 0), 0);
    const pb = periodeBudget(P);
    return {
      pbCenten: Math.round(pb.totaal * 100), verwachtCenten: Math.round(verwacht * 100),
      splitVervoer: !!(BP.split.vervoer && BP.split.vervoer.vast > 0), splitVast: BP.split.vervoer ? BP.split.vervoer.vast : 0,
      vervoerInVaste: pb.vasteLasten.some(x => x.cat === 'vervoer'),
    };
  }, S.MAIN);
  expect(r.splitVervoer).toBe(true);              // het vaste deel van de lease zit in budgetVoorPeriode
  expect(r.splitVast).toBe(537);
  expect(r.vervoerInVaste).toBe(false);           // en NIET nog een keer als losse vaste last (sabotage: vast deel dubbel → true)
  expect(r.pbCenten).toBe(r.verwachtCenten);      // het totaal klopt in centen
});

test('f. in de voorbeeldweergave schrijft Vastleggen niets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, { dag: '2026-10-28' });
  const r = await page.evaluate(() => {
    const beforeLs = localStorage.getItem('minder_set');
    voorbeeldStart('2026-11-24');
    const ym = rekVoorstel().per0.ym;
    openPeriodeStart(); periodeVastleggen('periode');
    const res = { bevestigdInPrev: periodeBevestigd(ym), lsTijdens: localStorage.getItem('minder_set') };
    voorbeeldStop();
    return Object.assign(res, { bevestigdNa: periodeBevestigd(ym), lsGelijk: localStorage.getItem('minder_set') === beforeLs, lsTijdensGelijk: res.lsTijdens === beforeLs });
  });
  expect(r.bevestigdInPrev).toBe(false);          // sabotage (guard eruit) → true: SET.periodeBevestigd muteert in het geheugen
  expect(r.bevestigdNa).toBe(false);
  expect(r.lsTijdensGelijk).toBe(true);
  expect(r.lsGelijk).toBe(true);
});
