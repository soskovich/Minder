/* v492: snelheid, ronde 2. Grip onder 400 ms. Geen gedrag en geen getal verandert; de SNELHEID-uitlezing meet nu koud EN warm,
   de rekVoorstelRuw-fasen binnenin, per kaart van Zien, en de twee pop-up-controles apart.
   a. rekVoorstelRuw loopt niet meer per vaste post over ALLE boekingen (één recurKey→afschrijvingen-index); de uitkomst is gelijk.
      Sabotage: de SCH-lus weer TX.filter per post laten doen (de index niet gebruiken) -> recurKey schaalt weer als posten x boekingen.
   b. Warm wisselen tussen de Grip-tabbladen draait rekVoorstelRuw niet opnieuw en bumpt _dataGen niet (gripStapSinds slaat stil op).
      Sabotage: gripStapSinds niet-stil opslaan -> een boekhoud-save tijdens het tekenen bumpt _dataGen -> de rekencache vervalt.
   c. Bij een krappe rekening MEET en DRAAIT de pop-up-controle bij het opstarten (eigen actie in SNELHEID, los van de afsluit-pop-up).
      Sabotage: de controle overslaan in salKrapPopupMisschien -> de krap-actie meet niets ("niets gemeten"). */
const { test, expect } = require('@playwright/test');
const S = require('./v489-stand');

/* SCH-zware stand: 25 maandelijkse SEPA-incasso's met unieke partijen (recurringSchedule ziet ze als 'fixed') over 21 maanden op
   MAIN, plus losse variabele boekingen. Zo weegt de SCH-lus zwaar en is het effect van de index meetbaar. De datum staat vast
   (2026-10-28 via boot), dus de uitkomst is stabiel. */
const seedZwaar = ({ MAIN, LEEF }) => {
  const incs = [];
  for (let i = 0; i < 25; i++) incs.push({ nm: 'Incasso Partij ' + String.fromCharCode(65 + i), amt: -(20 + i) });
  let n = 0;
  for (let mi = 0; mi < 21; mi++) {
    const d = new Date(2025, 1 + mi, 1); const ym = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    for (const inc of incs) { const t = { id: 'inc' + (n++), date: ym + '-05', amount: inc.amt, acc: MAIN, name: inc.nm, desc: 'SEPA ' + inc.nm, typ: 'incasso', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); }
    for (let i = 0; i < 10; i++) { const t = { id: 'vv' + (n++), date: ym + '-' + String(10 + i).padStart(2, '0'), amount: -(5 + i), acc: (i % 2) ? MAIN : LEEF, name: 'Albert Heijn', desc: 'BEA Albert Heijn', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); }
  }
  save(); try { buildAccMeta(); } catch (_) {}
  return { tx: TX.length, sch: (() => { try { return recurringSchedule(true).filter(x => x.type === 'fixed').length; } catch (_) { return 0; } })() };
};

test('a. de SCH-lus schaalt niet meer als posten x boekingen (recurKey-index), de uitkomst blijft gelijk', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate((args) => {
    const info = eval('(' + args.seed + ')')(args);
    try { recurringSchedule(true); } catch (_) {}
    _dataGen++; try { recurringSchedule(true); } catch (_) {}   // recurringSchedule warm op dit _dataGen, zodat zijn eigen recurKey niet meetelt
    delete window._rekV; delete window._salTek;
    perfReset(); PERF.on = true;
    const R = rekVoorstelRuw();
    PERF.on = false;
    return { info, recurKey: PERF.n.recurKey || 0, ok: R.ok, som: Math.round((R.som || 0) * 100) };
  }, { MAIN: S.MAIN, LEEF: S.LEEF, seed: seedZwaar.toString() });
  expect(r.ok).toBe(true);
  expect(r.info.sch).toBeGreaterThanOrEqual(20);            // de stand draagt genoeg vaste posten, anders meet de index niets
  expect(r.som).toBe(305000);                               // de uitkomst (som "laten staan") is gelijk aan zonder index (geen gedrag verandert)
  /* de index houdt recurKey onder de helft van wat posten x boekingen zou kosten; de sabotage (TX.filter per post) gaat erboven */
  expect(r.recurKey).toBeLessThan(r.info.sch * r.info.tx * 0.5);
});

test('b. warm wisselen tussen de Grip-tabbladen herrekent rekVoorstelRuw niet en bumpt _dataGen niet', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    closeSheet();
    window._gripTab = 'zien'; window._gripBeg = { v: 'lijst' }; renderMaand();   // warm: vult de rekVoorstel-memo
    const P = (window._gripCyc || gripCyc()).P || [];
    delete SET.gripStapSinds;                 // de Kiezen-render legt de stappen opnieuw vast (nw=true), zodat gripStapSinds echt schrijft
    window._gripTab = 'zien'; renderMaand();   // laat eventuele eenmalige schrijvers settelen
    const g0 = _dataGen; perfReset(); PERF.on = true;
    window._gripTab = 'kiezen'; renderMaand();   // gripStapSinds schrijft hier (stil)
    window._gripTab = 'begrijpen'; renderMaand();
    window._gripTab = 'zien'; renderMaand();
    PERF.on = false;
    const stap = SET.gripStapSinds ? Object.keys(SET.gripStapSinds[thisYM()] || {}).length : 0;
    return { pLen: P.length, dGen: _dataGen - g0, rv: PERF.n.rekVoorstelRuw || 0, stap };
  });
  expect(r.pLen).toBeGreaterThan(0);        // er is een stap om vast te leggen, anders schrijft gripStapSinds niets en toetst de sabotage niets
  expect(r.stap).toBeGreaterThan(0);        // de Kiezen-render legde de stap(pen) vast (gripStapSinds liep)
  expect(r.dGen).toBe(0);                   // die opslag was stil (sabotage: save() niet-stil -> _dataGen bumpt)
  expect(r.rv).toBe(0);                     // de rekVoorstel-memo bleef geldig over vier tabwissels -> geen herberekening
});

test('c. bij een krappe rekening meet EN draait de pop-up-controle bij het opstarten', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(() => {
    delete SET.salTekort;              // een eerste opening: de krap-melding is nieuw (onbekeken)
    closeSheet();
    const krap = (salTekortData()[0] || {}).acc || null;
    const L = diagSnelheid();
    const i = L.findIndex(x => /krap-pop-up-controle/.test(x));
    // de sublijnen van de krap-actie tot de volgende actie-regel (die begint met twee spaties + een woord, geen vier)
    const sub = [];
    for (let j = i + 1; j < L.length && /^\s{4}/.test(L[j]); j++) sub.push(L[j]);
    return { krap, heeftRegel: i >= 0, sub, nietsGemeten: sub.some(x => /niets gemeten/.test(x)), meetControle: sub.some(x => /rekVoorstelRuw|salTekortDataKern/.test(x)) };
  });
  expect(r.krap).not.toBeNull();            // er is een krappe rekening, anders toetst de test niets
  expect(r.heeftRegel).toBe(true);          // SNELHEID heeft een aparte krap-pop-up-controle-actie (de reparatie van punt 4)
  expect(r.nietsGemeten).toBe(false);       // de controle draaide (geen "niets gemeten")
  expect(r.meetControle).toBe(true);        // en is gemeten: rekVoorstelRuw/salTekortDataKern staan eronder (sabotage: de controle overslaan)
});
