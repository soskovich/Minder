// v383: EEN DEFINITIE VAN VAST VOOR INZICHTEN EN GRIP (gevraagd door de gebruiker na echte data).
// GEMETEN VOORAF op de stand van het toestel: uitgegeven vast EUR 141 + nog vast EUR 767 = EUR 908 op Inzichten, tegen
// EUR 1.045 vaste lasten op Grip. Het verschil van EUR 137 was een post uit de terugval (Shurgard) in Huur, dat op vast
// staat: Grip telde hem als vaste last, Inzichten als "nog in potjes" (monthLiquidity().fixDue laat inPotje weg).
// Drie gevallen liepen uiteen (A: die terugvalpost, B: een vast potje zonder betaling, C: een herkende vaste last
// zonder potje); bij B en C koos de gebruiker: B telt met zijn hele bedrag als nog vast, C is vast, ook op Grip.
// Het orakel in deze spec is een eigen uitdrukking van de definitie, uit de boekingen en de verwachte posten zelf,
// zodat de som niet alleen tegen dezelfde bron (maandSplitsing) wordt gelegd.
const { test, expect } = require('@playwright/test');
const VV = require('./vast-variabel-stand');

const sg = (d) => ({ id: 'sg' + d, date: d, amount: -137, name: 'Shurgard', desc: 'SEPA INCASSO SHURGARD NEDERLAND HUUR OPSLAG' });
const VARIANTEN = {
  basis: {},
  'B: huur op vast, geen betaling': { set: { potAard: { huur: 'vast' } } },
  'A: shurgard verwacht in huur op vast': { set: { potAard: { huur: 'vast' } }, extraTx: [sg('2026-09-08')] },
  'shurgard verwacht in huur variabel': { extraTx: [sg('2026-09-08')] },
  'shurgard betaald in huur op vast': { set: { potAard: { huur: 'vast' } }, extraTx: [sg('2026-09-05'), sg('2026-10-05')] },
  'C: netflix zonder potje': { extraTx: [...['06', '07', '08', '09', '10'].map((m) => ({ id: 'nf' + m, date: '2026-' + m + '-03', amount: -13, name: 'Netflix', desc: 'SEPA INCASSO NETFLIX INTERNATIONAL' })),
    ...['06', '07', '08', '09'].map((m) => ({ id: 'sp' + m, date: '2026-' + m + '-20', amount: -11, name: 'Spotify', desc: 'SEPA INCASSO SPOTIFY AB' }))] },
};

const meet = () => {
  const m = thisYM(), S = insMaandStand(), V = maandVooruit(), VS = vasteLastenStand(), L = monthLiquidity(), B = SET.budgets || {};
  const inNorm = (c) => !!(CATS[c] && CATS[c].type === 'expense' && !geenNorm(c));
  // het orakel: betaald vast per boeking, plus wat er nog komt, plus een vast potje zonder betaling met zijn hele bedrag
  let betaald = 0; const perCat = {};
  for (const t of txOfMonth(m)) { const c = catOf(t); if (!inNorm(c)) continue; if (isFixed(t) || potHeelVast(c)) { betaald += uitgaveNorm(t); perCat[c] = (perCat[c] || 0) + uitgaveNorm(t); } }
  let nog = 0; const nogCat = {};
  for (const s of L.fixDueItems || []) { if (s.excl || !s.cat || !inNorm(s.cat)) continue; if (s.inPotje && !potHeelVast(s.cat)) continue; nog += +s.amount || 0; nogCat[s.cat] = (nogCat[s.cat] || 0) + (+s.amount || 0); }
  let geen = 0; for (const k in B) { if (!((+B[k] || 0) > 0) || !potHeelVast(k) || !inNorm(k)) continue; if (Math.round((perCat[k] || 0) + (nogCat[k] || 0)) <= 0) geen += +B[k]; }
  return { S: { vast: S.vast, nogVast: S.nogVast, potjes: S.potjes, nogPot: S.nogPot, potBud: S.potBud, rijen: S.potRijen, uit: S.uit, spend: Math.round(totals(m).spendNorm) },
    grip: { eind: V.onbekend ? null : V.vaste.eind, totaal: VS.totaal }, orakel: { betaald: Math.round(betaald), nog: Math.round(nog + geen), som: Math.round(betaald + nog + geen) } };
};

for (const [naam, o] of Object.entries(VARIANTEN)) {
  test.describe(naam, () => {
    test('vast uitgegeven + nog vast = de som van de vaste lasten, op Inzichten en op Grip', async ({ page }) => {
      await VV.boot(page, o);
      const r = await page.evaluate(`(${meet.toString()})()`);
      expect(r.S.vast + r.S.nogVast).toBe(r.orakel.som);
      expect(r.grip.totaal).toBe(r.orakel.som);
      expect(r.grip.eind).toBe(r.orakel.som);
      expect(Math.abs(r.S.vast - r.orakel.betaald)).toBeLessThanOrEqual(1);
    });
    test('potjes uitgegeven + nog in potjes - overschrijding per potje = het potjesbudget, en per potje niet onder nul', async ({ page }) => {
      await VV.boot(page, o);
      const r = await page.evaluate(`(${meet.toString()})()`);
      const over = r.S.rijen.reduce((a, x) => a + Math.max(x.uit - x.bud, 0), 0);
      expect(r.S.potjes + r.S.nogPot - over).toBe(r.S.potBud);
      for (const x of r.S.rijen) expect(x.nog).toBe(Math.max(x.bud - x.uit, 0));
      expect(r.S.uit).toBe(r.S.spend);
    });
  });
}

test('A: de terugvalpost in een vast potje telt als nog vast, niet in je potjes (de EUR 137)', async ({ page }) => {
  await VV.boot(page, VARIANTEN['A: shurgard verwacht in huur op vast']);
  const r = await page.evaluate(() => { const S = insMaandStand(); return { nogVast: S.nogVast, fixDue: Math.round(monthLiquidity().fixDue), huurPot: S.potRijen.find((x) => x.k === 'huur') || null }; });
  expect(r.nogVast).toBe(r.fixDue + 137);
  expect(r.huurPot).toBeNull();
  // de sheet achter "Nog te gaan · vast" draagt dezelfde regels, en ze tellen op tot het getal
  await page.evaluate(() => go('ins'));
  await page.locator('[data-insleg="nogvast"]').click();
  const s = await page.locator('#insTegelSheet[data-instegelsheet="vast"]').evaluate((e) => ({ w: +e.dataset.inswaarde, rijen: [...e.querySelectorAll('[data-insrij]')].map((x) => +x.dataset.insrij), t: e.innerText }));
  expect(s.w).toBe(r.nogVast);
  expect(s.rijen.reduce((a, x) => a + x, 0)).toBe(r.nogVast);
  expect(s.t).toContain('Shurgard');
});

test('B: een vast potje zonder betaling telt met zijn hele bedrag als nog vast, en staat in de sheet', async ({ page }) => {
  await VV.boot(page, VARIANTEN['B: huur op vast, geen betaling']);
  const r = await page.evaluate(() => { const S = insMaandStand(); return { nogVast: S.nogVast, fixDue: Math.round(monthLiquidity().fixDue) }; });
  expect(r.nogVast).toBe(r.fixDue + VV.BUDGETS.huur);
  await page.evaluate(() => { go('ins'); openInsTegel('vast'); });
  const t = await page.locator('#insTegelSheet[data-instegelsheet="vast"] [data-insvastrij="huur"]').innerText();
  expect(t).toContain('geen betaling deze maand');
});

test('C: een herkende vaste last zonder potje is ook op Grip vast, en de bridge telt op', async ({ page }) => {
  await VV.boot(page, VARIANTEN['C: netflix zonder potje']);
  const r = await page.evaluate(() => { const V = maandVooruit(); const x = V.vastePotjes.find((y) => y.k === 'abonnement');
    return { x, vast: V.vaste.eind, som: V.variabel.eind + V.vaste.eind + V.zonder, projectie: V.projectie }; });
  expect(r.som).toBe(r.projectie);
  expect(r.x).toBeTruthy();
  expect(r.x.zonderPotje).toBe(true); expect(r.x.bud).toBe(0); expect(r.x.eind).toBe(24);
  await page.evaluate(() => { go('maand'); openGripVast(); });
  const t = await page.locator('#gripVast [data-vastpotje="abonnement"]').innerText();
  expect(t).toMatch(/zonder potje/);
});
