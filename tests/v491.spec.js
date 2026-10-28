/* v491: reparatie potjes-projectie en "na je salaris".
   a. Een potje met 46% aandeel en een typisch niveau van EUR 46 telt via deze rekening EUR 21/mnd (= 46 x 0,46), niet het hele potje.
      Sabotage: het aandeel weglaten (typisch niet x f) -> scaled 46.
   b. De per-potje regels in de sheet tellen in centen op tot "Potjes via deze rekening".
      Sabotage: een potje overslaan in de lijst -> de som klopt niet meer.
   c. "Na je salaris stond er" verandert niet door een overboeking naar een eigen rekening na de salarisdag.
      Sabotage: saldo nu + afgegaan gebruiken (rekAfgegaan slaat de interne overboeking over). */
const { test, expect } = require('@playwright/test');
const S = require('./v489-stand');

/* shopping: maandtotaal EUR 46, 46% via MAIN (EUR 21,16) en 54% via LEEF (EUR 24,84); sport: EUR 60, 50/50.
   Beide over het venster (jul/aug/sep valt in af), zodat ze als potje (soms) via MAIN in de projectie komen. */
const splits = ({ MAIN, LEEF }) => {
  const add = (acc, d, a, cat, nm) => { const t = { id: 'v491' + acc.slice(-3) + d + cat + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: nm, desc: 'BEA ' + nm, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
  for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) {
    add(MAIN, m + '-12', -21.16, 'shopping', 'Coolblue'); add(LEEF, m + '-12', -24.84, 'shopping', 'Zalando');
    add(MAIN, m + '-11', -30, 'sport', 'Gym'); add(LEEF, m + '-11', -30, 'sport', 'Yoga');
  }
  save(); try { buildAccMeta(); } catch (_) {}
};

test('a. een potje met 46% aandeel telt via deze rekening typisch x aandeel, niet het hele potje', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(({ MAIN, LEEF }) => {
    const add = (acc, d, a, cat, nm) => { const t = { id: 'v491' + acc.slice(-3) + d + cat + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: nm, desc: 'BEA ' + nm, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
    for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) { add(MAIN, m + '-12', -21.16, 'shopping', 'Coolblue'); add(LEEF, m + '-12', -24.84, 'shopping', 'Zalando'); }
    save(); try { buildAccMeta(); } catch (_) {}
    const D = totSalarisData(MAIN); const p = (D.potDelen || []).find(x => x.k === 'shopping');
    return p ? { full: Math.round(p.typischVol), aandeel: Math.round(p.aandeel * 100), scaled: Math.round(p.typisch), periode: Math.round(p.periode || 0), relatie: Math.round(p.typischVol * p.aandeel) } : null;
  }, { MAIN: S.MAIN, LEEF: S.LEEF });
  expect(r).not.toBeNull();
  expect(r.full).toBe(46);                 // het hele potje: typisch niveau EUR 46
  expect(r.aandeel).toBe(46);              // 46% loopt via deze rekening
  expect(r.scaled).toBe(21);               // via deze rekening: 46 x 0,46 = 21, NIET 46
  expect(r.scaled).toBe(r.relatie);        // scaled = typisch x aandeel (sabotage "aandeel weglaten" -> 46)
  expect(r.periode).toBe(21);              // de november-termijn (soms op dag 12, binnen de periode) telt EUR 21
  expect(r.scaled).not.toBe(r.full);       // en is lager dan het hele potje
});

test('b. de per-potje regels tellen in centen op tot "Potjes via deze rekening"', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(({ MAIN, LEEF }) => {
    const add = (acc, d, a, cat, nm) => { const t = { id: 'v491' + acc.slice(-3) + d + cat + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: nm, desc: 'BEA ' + nm, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = cat; return t; };
    for (const m of ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']) { add(MAIN, m + '-12', -21.16, 'shopping', 'Coolblue'); add(LEEF, m + '-12', -24.84, 'shopping', 'Zalando'); add(MAIN, m + '-11', -30, 'sport', 'Gym'); add(LEEF, m + '-11', -30, 'sport', 'Yoga'); }
    save(); try { buildAccMeta(); } catch (_) {}
    openTotSalaris(MAIN); window._totsalPot = true; renderTotSalaris();
    const rijen = Array.from(document.querySelectorAll('#totSalaris [data-totpotrij]'));
    const somC = rijen.reduce((a, el) => a + (+el.getAttribute('data-totpotperiode') || 0), 0);
    const kop = document.querySelector('#totSalaris [data-totpot]');
    return { n: rijen.length, somC, kopC: kop ? (+kop.getAttribute('data-totpotcent') || 0) : null };
  }, { MAIN: S.MAIN, LEEF: S.LEEF });
  expect(r.n).toBeGreaterThanOrEqual(2);   // minstens twee potjes, anders toetst de som niets
  expect(r.kopC).toBe(5116);               // Potjes via deze rekening = EUR 51,16 (21,16 + 30,00)
  expect(r.somC).toBe(r.kopC);             // de per-potje regels tellen op tot dat getal (sabotage: een potje overslaan)
});

test('c. "Na je salaris stond er" verandert niet door een overboeking na de salarisdag', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await S.boot(page, {});
  const r = await page.evaluate(({ MAIN }) => {
    const voor = totSalarisData(MAIN).naSal;
    /* een opzij-overboeking naar een eigen rekening op 26 okt (na het salaris van 24 okt, voor vandaag 28 okt): het saldo zakt EUR 100,
       en die boeking is intern (geen uitgave), dus rekAfgegaan telt hem niet. De bevroren salarisdag-stand hoort gelijk te blijven. */
    SET.manualBal = Object.assign({}, SET.manualBal, { [MAIN]: (SET.manualBal[MAIN] || 0) - 100 });
    const t = { id: 'v491ovb', date: '2026-10-26', amount: -100, acc: MAIN, name: 'Eigen spaarrekening', desc: 'SEPA Overboeking eigen rekening', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); OVR[t.id] = 'intern'; save(); try { buildAccMeta(); } catch (_) {}
    const na = totSalarisData(MAIN).naSal;
    return { voor, na, intern: (CATS[catOf(t)] || {}).type === 'internal' };
  }, { MAIN: S.MAIN });
  expect(r.intern).toBe(true);             // de overboeking is intern, dus rekAfgegaan slaat hem over
  expect(r.voor).not.toBeNull();
  expect(r.na).toBe(r.voor);               // bevroren op de salarisdag (sabotage: saldo nu + afgegaan -> zakt EUR 100 mee)
});
