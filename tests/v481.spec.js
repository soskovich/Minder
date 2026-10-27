/* v481: PER REKENING, IS JE SALDO GENOEG TOT JE SALARIS.
   a. de sheet "<rekening> · tot je salaris" (totSalarisData) rekent saldo nu − vaste lasten − potjes − contant = de stand op de dag voor
      je salaris, in centen gelijk aan TUSSENDOOR (hetzelfde model, r.uitDag).
   b. "Na mijn salaris" (SET.vastDatum[key]='nasal') legt de huur op je salaris + een paar dagen, dus buiten de lopende periode: het
      laagste punt stijgt met het huurbedrag en de woning valt uit de lopende-periode-reeks.
   c. "Alleen deze keer later" (eenmalig) geldt deze periode (laagste punt stijgt), maar het voorstel voor de VOLGENDE periode zet de
      huur weer op de vaste dag (de 19e), niet op salaris + 3 (de 27e).
   d. de pop-up (salKrapKaart) toont het tekort (laagste punt) en de leeg-datum (eerste dag onder nul) APART, met de grootste post.
   GECONSTRUEERD op v480-woning-stand (woning Nathaniel Cathalina EUR 300 via Tikkie/iDEAL, booked:false zodat de oktober-termijn nog
   verwacht wordt; zonder IBAN in de kennis folt de woning op de salarisrekening MAIN, de terugval van v432), met een Akkoord in
   september zodat de controlemomenten gelden (salTekortActief). De betaaldatum-mechaniek staat los van welke rekening de woning draagt. */
const { test, expect } = require('@playwright/test');
const W = require('./v480-woning-stand');
const { MAIN, SPAAR, LEEF } = W;

const AKK = { salVerdeling: { op: '2026-09-24', ym: '2026-09', salYM: '2026-09', rek: { [MAIN]: 1200, [LEEF]: 850 }, opzij: 3166, plan: 280, salaris: 5216, salAcc: MAIN, start: '2026-09-24', eind: '2026-10-25', dagen: 32 } };
/* MAIN (de salarisrekening, waar de woning op folt) laag → krap; LEEF ruim → past */
const boot = (page, extra) => W.boot(page, { booked: false, set: Object.assign({ manualBal: { [MAIN]: 50, [SPAAR]: 5000, [LEEF]: 8000 } }, AKK, extra || {}) });

test('a. de sheet rekent saldo − vaste lasten − potjes − contant = de stand dag voor je salaris, gelijk aan TUSSENDOOR', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate((ACC) => {
    const D = totSalarisData(ACC); if (!D) return null;
    /* TUSSENDOOR: dezelfde reeks met r.uitDag over de lopende periode */
    const P = rekVoorstel(), rr = P.rekAlle.find((x) => x.acc === ACC), SP = salPeriode();
    let x = accBalance(ACC); for (let d = rekDag(vandaagYMD(), 1); d <= SP.cur.eind; d = rekDag(d, 1)) x -= rr.uitDag(d);
    return { eind: Math.round(D.eindExact * 100) / 100, recon: Math.round((D.saldoExact - D.vastExact - D.potExact - D.kasExact) * 100) / 100, tuss: Math.round(x * 100) / 100, vastRij: D.vastRij.length, vast: D.vast };
  }, MAIN);
  expect(r).toBeTruthy();
  expect(r.vastRij).toBeGreaterThan(0);     // de woning staat als vaste last in de reeks
  expect(r.vast).toBeGreaterThan(0);
  expect(r.recon).toBe(r.eind);             // saldo − vast − pot − kas = de stand (sabotage: b-=u.pot+u.kas → verschilt met het vast-bedrag)
  expect(r.eind).toBe(r.tuss);              // in centen gelijk aan TUSSENDOOR
});

test('b. "Na mijn salaris" haalt de huur uit de lopende periode: het laagste punt stijgt met het huurbedrag', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate((ACC) => {
    const wk = woningForecast().key;
    const laagst = () => { const P = rekVoorstel(), rr = P.rekAlle.find((x) => x.acc === ACC), SP = salPeriode(); return Math.round(salProjectie(rr, accBalance(ACC), SP.cur.eind).laagst); };
    const inWindow = () => { const P = rekVoorstel(), rr = P.rekAlle.find((x) => x.acc === ACC), SP = salPeriode(); return (rr.termAlle || []).some((t) => t.key === wk && t.date > vandaagYMD() && t.date <= SP.cur.eind); };
    const def = laagst(), defIn = inWindow();
    SET.vastDatum = { [wk]: { keuze: 'nasal' } }; save();
    return { def, defIn, nasal: laagst(), nasalIn: inWindow() };
  }, MAIN);
  expect(r.defIn).toBe(true);            // standaard valt de woning in de lopende periode
  expect(r.nasalIn).toBe(false);         // na salaris: eruit
  expect(r.nasal - r.def).toBe(300);     // het laagste punt stijgt met het huurbedrag (sabotage: vastDatumKeuze negeert nasal → 0)
});

test('c. "Alleen deze keer later" geldt deze periode; de volgende periode staat de huur weer op de vaste dag', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate((ACC) => {
    const wk = woningForecast().key;
    const laagst = () => { const P = rekVoorstel(), rr = P.rekAlle.find((x) => x.acc === ACC), SP = salPeriode(); return Math.round(salProjectie(rr, accBalance(ACC), SP.cur.eind).laagst); };
    const def = laagst();
    vastDatumZet(wk, 'eenmalig');
    const een = laagst();
    const won = (rekVoorstel().vastAlle || []).find((x) => x.key === wk);
    return { def, een, keuze: won ? won.keuze : null, data: won ? won.data : [] };
  }, MAIN);
  expect(r.een - r.def).toBe(300);                              // deze periode: huur eruit, net als "na salaris"
  expect(r.keuze).toBe('vastedag');                            // het voorstel voor de volgende periode: weer de vaste dag
  expect(r.data.length).toBeGreaterThan(0);
  expect(r.data.every((d) => d.slice(8, 10) === '19')).toBe(true);  // op de vaste dag (19), niet salaris+3 (27) (sabotage: eenmalig blijft nasal → 27)
});

test('d. de pop-up toont tekort en leeg-datum apart, met de grootste post', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate((ACC) => {
    const h = salKrapKaart(); document.body.insertAdjacentHTML('beforeend', '<div id="tst">' + h + '</div>');
    const row = document.querySelector('#tst [data-saltekortrij="' + ACC + '"]');
    return row ? { txt: row.innerText, leeg: row.getAttribute('data-leeg'), nodig: row.getAttribute('data-nodig') } : null;
  }, MAIN);
  expect(r).toBeTruthy();
  expect(r.txt).toMatch(/tekort €\d/);           // het laagste punt
  expect(r.txt).toMatch(/leeg vanaf/);           // de eerste dag onder nul, APART (sabotage: leeg-span weg)
  expect(r.leeg).toBeTruthy();                   // met een datum
  expect(r.txt).toContain('Nathaniel Cathalina'); // de grootste post die het verschil maakt
  expect(r.txt).toContain('300');
});
