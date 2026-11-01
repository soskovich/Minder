/* v509b: SPOED, RENTE WORDT ALS SALARIS GEZIEN (gemeten op het toestel op 1 nov: een rentebijschrijving van EUR 0,92 werd het salaris,
 * Grip las "november (1–1)" en "nog 0 dagen"). Op periode-stand (salaris EUR 5.216 op de 24e van MAIN). GECONSTRUEERD.
 *  a. een rente van EUR 0,92 op 1 nov laat de lopende periode november (1–23) en de bron de oktobersalarisreeks.
 *  b. rente plus salaris op 24 nov: 24 nov is de periodestart; een kleine bijschrijving op Inkomen in een maand zonder salaris
 *     (de vangrail) neemt het niet over.
 *  c. de naam volgt de soort, ook voor boekingen van voor v509; een eigen naam wint.
 */
const { test, expect } = require('./klok');
const S = require('./periode-stand');
const { MAIN } = S;

async function plus(page, d, a, naam, desc, cat) {
  await page.evaluate(({ MAIN, d, a, naam, desc, cat }) => {
    const t = { id: 'v509b' + d + Math.round(a * 100), date: d, amount: a, acc: MAIN, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; TX.sort((x, y) => x.date.localeCompare(y.date));
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._rekV = null;
  }, { MAIN, d, a, naam, desc, cat: cat || null });
}
const lees = page => page.evaluate(() => { const B = salBron(), P = salPeriode(), W = (typeof huidigVenster === 'function') ? huidigVenster() : null;
  const okt = TX.filter(t => t.amount > 5000 && t.date.slice(0, 7) === '2026-10')[0];
  return { bronDatum: B && B.sl.date, bronBedrag: B && B.sl.amount, bronKey: B && B.key, oktKey: okt && recurKey(okt),
    start: P && P.cur.start, eind: P && P.cur.eind, wStart: W && W.start, wEind: W && W.eind }; });

test('v509b a: rente EUR 0,92 op 1 nov is geen salaris; de periode blijft november (1–23)', async ({ page }) => {
  await S.boot(page, '2026-11-01');
  await plus(page, '2026-11-01', 0.92, 'Transactie', 'RENTE OVER OKTOBER');
  const r = await lees(page);
  const cat = await page.evaluate(() => catOf(TX.find(t => t.id.indexOf('v509b') === 0) || TX.find(t => t.amount === 0.92)));
  expect(cat).toBe('rente');                       // de invoer draagt het geval: een bijschrijving op Rente (type income)
  expect(r.bronBedrag).toBeGreaterThan(5000);      // de bron is de salarisstorting, niet de rente
  expect(r.bronDatum.slice(0, 7)).toBe('2026-10'); // de oktobersalarisreeks
  expect(r.bronKey).toBe(r.oktKey);
  expect(r.wEind).toBe('2026-11-23');              // de lopende periode loopt tot 23 nov
  expect(r.wStart).toBe('2026-11-01');            // de overgangsmaand november (1–23), niet "november (1–1)"
  expect(r.start).not.toBe('2026-11-01');          // de salarisperiode begint niet op de rentedag
  const M = await page.evaluate(() => { try { return periodeMoment(); } catch (_) { return null; } });
  expect(M && M.soort).not.toBe('vroeg');          // geen "Je salaris is er al"
});

test('v509b a2: een rentevergoeding boven de vangrail (EUR 3.000 op Rente) is ook geen salaris', async ({ page }) => {
  await S.boot(page, '2026-11-01');
  await plus(page, '2026-11-01', 3000, 'Transactie', 'RENTEVERGOEDING LENING');
  const r = await lees(page);
  const med = await page.evaluate(() => TX.filter(t => t.amount > 5000).map(t => t.amount).sort((a, b) => a - b));
  expect(3000).toBeGreaterThan(med[Math.floor(med.length / 2)] * 0.5);   // de invoer: de vangrail houdt hem niet tegen, alleen de categorie
  expect(r.bronBedrag).toBeGreaterThan(5000);
  expect(r.bronDatum.slice(0, 7)).toBe('2026-10');
  expect(r.wEind).toBe('2026-11-23');
});

test('v509b b: rente en salaris op 24 nov: 24 nov is de start; een kleine Inkomen-boeking zonder salaris neemt het niet over', async ({ page }) => {
  await S.boot(page, '2026-11-26');
  await plus(page, '2026-11-25', 0.92, 'Transactie', 'RENTE OVER NOVEMBER');
  let r = await lees(page);
  expect(r.bronDatum).toBe('2026-11-24');
  expect(r.start).toBe('2026-11-24');
  // de vangrail: in december (nog geen salaris) zet je een kleine bijschrijving zelf op Inkomen; hij is geen salaris
  await S.boot(page, '2026-12-02');
  await plus(page, '2026-12-01', 0.92, 'Transactie', 'RENTE OVER NOVEMBER', 'inkomen');
  const r2 = await page.evaluate(() => { const t = TX.find(x => x.amount === 0.92); return { cat: catOf(t), sl: salarisBetalingLaatst(nextYM(thisYM())) }; });
  expect(r2.cat).toBe('inkomen');                  // de invoer: een salaris-categorie, de categorie-filter houdt hem niet tegen
  expect(r2.sl.amount).toBeGreaterThan(5000);      // de vangrail: kleiner dan de helft van de mediaan is geen salaris
  r = await lees(page);
  expect(r.bronDatum).toBe('2026-11-24');
  expect(r.start).toBe('2026-11-24');
});

test('v509b c: een kastelling en een rente van voor v509 tonen de nieuwe namen; een eigen naam wint', async ({ page }) => {
  await S.boot(page, '2026-11-01');
  const r = await page.evaluate(({ MAIN }) => {
    const mk = o => Object.assign({ typ: '', ref: '', accName: '', refNums: [] }, o);
    const kasPlus = mk({ id: 'cash_2026-10-20', date: '2026-10-20', amount: 500, acc: '', name: 'Contant besteed', desc: 'CONTANT TELLING 2026-10-20', src: 'contant', bankRef: 'contant|2026-10-20', ruleCat: 'contant', autoCat: 'contant', vasteCat: 'contant' });
    const kasMin = mk({ id: 'cash_2026-10-10', date: '2026-10-10', amount: -80, acc: '', name: 'Contant besteed', desc: 'CONTANT TELLING 2026-10-10', src: 'contant', bankRef: 'contant|2026-10-10', ruleCat: 'contant', autoCat: 'contant', vasteCat: 'contant' });
    const rente = mk({ id: 'r1', date: '2026-10-31', amount: 0.92, acc: MAIN, name: 'Transactie', desc: 'TRANSACTIE 2026-10-31', src: 'psd2' });
    const eigen = mk({ id: 'r2', date: '2026-10-30', amount: 1.10, acc: MAIN, name: 'Spaarrente Bunq', desc: 'TRANSACTIE 2026-10-30', src: 'psd2' });
    TX.push(kasPlus, kasMin, rente, eigen);
    categorize(rente); categorize(eigen); rente.name = 'Transactie'; OVR[rente.id] = 'rente'; OVR[eigen.id] = 'rente';   // de rente stond al op Rente (eigen keuze)
    save();
    // de boot: categorize over alle boekingen
    TX.forEach(categorize);
    const n = d => (TX.find(t => t.date === d && (t.src === 'contant' || t.acc === MAIN)) || {}).name;
    return { kasPlus: n('2026-10-20'), kasMin: n('2026-10-10'), rente: n('2026-10-31'), eigen: n('2026-10-30') };
  }, { MAIN });
  expect(r.kasPlus).toBe('Kastelling · nog in je zak');
  expect(r.kasMin).toBe('Kastelling · uitgegeven');
  expect(r.rente).toBe('Rente');
  expect(r.eigen).toBe('Spaarrente Bunq');
});
