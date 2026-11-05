/* v512: de foutenlijst uit de generale repetitie (Bekijk als 23, 24 en 26 nov, data t/m 5 nov), op een eigen tak. Fixture:
   periode-stand op 4 nov (Salarisrekening MAIN met het salaris op de 24e, Betaalrekening BET met Hiltermann op de 12e, Leefgeld LEEF,
   de woning via Tikkie "na mijn salaris", een potje Contant). GECONSTRUEERD, niet gemeten: de bedragen van het toestel staan alleen
   daar. */
const { test, expect } = require('./klok');
const S = require('./periode-stand');
const { MAIN, LEEF, BET } = S;
const DAGEN = ['2026-11-23', '2026-11-24', '2026-11-26'];

const boot = page => S.boot(page, '2026-11-04');
const bekijk = (page, d) => page.evaluate(d => { if (window._voorbeeld) voorbeeldStop(); window._vbVT = null; voorbeeldStart(d); voorbeeldSalarisZet(true); window._gripCyc = null; }, d);
const add = (page, rij) => page.evaluate(rij => { for (const [acc, d, a, n, ds, cat] of rij) { const t = { id: 'v512' + acc.slice(-4) + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; }
  TX.sort((x, y) => x.date.localeCompare(y.date)); save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {} }, rij);

/* ===== a. EEN VERWACHTE VASTE LAST IS GEEN POTJE-SIGNAAL ===== */
async function cjib(page) {
  await boot(page);
  await page.evaluate(() => { SET.vastVerwacht = [{ id: 'vvcjib', naam: 'CJIB Boetes', bedrag: 50, ritme: 1, eerste: '2026-11-01', rest: 250, cat: 'belasting', schatting: false, op: '2026-10-20' }];
    SET.budgets = Object.assign({}, SET.budgets, { belasting: 20 });
    /* de afgeronde maanden hadden een ruim potje, zodat alleen de CJIB-boeking van november een signaal kan geven */
    for (const ym of ['2026-08', '2026-09', '2026-10']) SET.budgetHist = Object.assign({}, SET.budgetHist, { [ym]: Object.assign({}, (SET.budgetHist || {})[ym] || {}, { belasting: 1000 }) });
    save(); runMemoVergeten(); });
  await add(page, [[BET, '2026-11-02', -50, 'Boetes cjib', 'SEPA Incasso CJIB Boetes betalingsregeling', 'belasting']]);
}
/* alles wat een potje-signaal over Belasting & boetes zou kunnen dragen: de overschrijding (valtOpSignals), de patronen (insPatronen,
   ook "nieuw deze maand"), het label bij een signaal (gripPatroonInfo) en de symptomen op Grip (gripCyclus), plus de norm zelf */
const signalen = page => page.evaluate(() => { window._gripCyc = null; const m = thisYM();
  const V = (valtOpSignals(m) || []).filter(s => s.potjeId === 'belasting').length;
  const P = insPatronen('alle').filter(p => p.k === 'belasting').map(p => p.soort);
  const L = Object.keys(gripPatroonInfo().lab).filter(k => k === 'belasting').length;
  const C = gripCyclus(); const sym = C.sym.filter(s => s.k === 'belasting').map(s => s.naam);
  const tx = TX.find(t => t.name === 'Boetes cjib');
  return { V, P, L, sym, norm: Math.round(catSpendMap(m).belasting || 0), vast: isFixed(tx), vv: vvBoeking(tx) }; });

test('v512 a: de CJIB-afschrijving bij een verwachte vaste last geeft geen potje-signaal, op 4, 23, 24 en 26 nov', async ({ page }) => {
  await cjib(page);
  /* invoer: de boeking is de kandidaat van de verwachte vaste last (de vraag "Is dit CJIB Boetes?") */
  const kand = await page.evaluate(() => { const t = vvKandidaat(vvLijst()[0]); return t && t.name; });
  expect(kand).toBe('Boetes cjib');
  const leeg = { V: 0, P: [], L: 0, sym: [], norm: 0, vast: true, vv: true };
  expect(await signalen(page), '4 nov').toEqual(leeg);
  for (const d of DAGEN) { await bekijk(page, d); expect(await signalen(page), d).toEqual(leeg); }
});

test('v512 a2: na "Ja, dit is hem" ook geen signaal; na "Nee, iets anders" telt de boeking gewoon in het potje', async ({ page }) => {
  await cjib(page);
  const ja = await page.evaluate(() => { const t = TX.find(x => x.name === 'Boetes cjib'); vvKoppel('vvcjib', t.id, true); runMemoVergeten(); return true; });
  expect(ja).toBe(true);
  expect((await signalen(page)).sym).toEqual([]);
  expect((await signalen(page)).norm).toBe(0);
  await cjib(page);
  await page.evaluate(() => { const t = TX.find(x => x.name === 'Boetes cjib'); vvKoppel('vvcjib', t.id, false); runMemoVergeten(); });
  const nee = await signalen(page);
  /* de tegenproef: zonder de verwachte vaste last is dit wel een potje-signaal, dus de test kan rood worden */
  expect(nee.vast).toBe(false); expect(nee.norm).toBe(50);
  expect(nee.V + nee.P.length + nee.sym.length, 'na Nee is het een gewone uitgave in het potje').toBeGreaterThan(0);
});
