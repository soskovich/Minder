/* v515 deel 0: waar de rest van de sheet "Nog verwacht in je potjes" uit bestaat, op periode-stand (20 nov) met een opname van EUR 500 op
   28 okt en een telling van EUR 500 op 1 nov. Alleen meten: WIP=1 npx playwright test tests/wip/v515-meet.spec.js */
const { test, expect } = require('../klok');
const S = require('../periode-stand');
test('meet rest', async ({ page }) => {
  await S.boot(page, '2026-11-20');
  const r = await page.evaluate(({ LEEF }) => {
    const t = { id: 'opn28', date: '2026-10-28', amount: -500, acc: LEEF, name: 'Geldmaat', desc: 'GEA, BETAALPAS GELDMAAT ZWANEBLOEM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    categorize(t); TX.push(t); TX.sort((a, b) => a.date.localeCompare(b.date)); save(); buildAccMeta(); runMemoVergeten();
    const oud = vandaagYMD; window.vandaagYMD = () => '2026-11-01';
    try { contantOpslaan(500); } finally { window.vandaagYMD = oud; }
    for (const h of (SET.contantHist||[])) if (h.datum === '2026-11-20') h.datum = '2026-11-01';
    if (SET.contant && SET.contant.datum==='2026-11-20') SET.contant.datum='2026-11-01';
    save(); runMemoVergeten(); window._gripCyc=null;
    const k = TX.filter(x => x.src === 'contant').map(x=>[x.date,x.name,x.amount]);
    const Sx = insMaandStand(), G = insGroepen(Sx), V = maandVooruit(), BG = budgetPerGroep(V);
    const rows = V.potjes.map(x => ({ k: x.k, uit: Math.round(x.uit), eind: Math.round(x.eindR), nog: Math.max(Math.round(x.eindR) - Math.round(x.uit), 0), clip: Math.max(Math.round(x.uit) - Math.round(x.eindR), 0) }));
    const som = rows.reduce((a, r) => a + r.nog, 0);
    const P = Math.round(V.projectie), vV = BG.vast.v, zV = BG.zonder.v, pV = BG.potjes.v;
    const sEind = rows.reduce((a, r) => a + r.eind, 0), sUitV = rows.reduce((a, r) => a + r.uit, 0), sClip = rows.reduce((a, r) => a + r.clip, 0);
    const pU = Math.round(Sx.potjes + Sx.zonder);
    const U = Sx.U;
    return { k, Gpot: G.pot, som, rest: G.pot.nog - som, P, vV, pV, zV, sEind, sUitV, sClip, pU, Spot: Sx.potjes, Szon: Sx.zonder,
      kasCorr: U && U.kasCorrectie, perContant: U && U.per && U.per.contant, Vcontant: V.potjes.filter(x=>x.k==='contant').map(x=>({uit:x.uit, eindR:x.eindR})),
      periode: !!V.periode, spendNorm: totals(thisYM()).spendNorm, catContant: catSpendMap(thisYM()).contant, kastx: TX.filter(t=>t.src==='contant').map(t=>[t.date,t.amount,catOf(t)]), zonderBreed: V.zonderBreed, zonderLos: V.zonderLos, zonderExact: V.zonderExact, Zgeboekt: V.zonderStand&&V.zonderStand.geboekt, Vc: V.contant, uitgegevenTot: U.totaal, grp: maandGroepen(V).g.map(x=>[x.n,Math.round(x.b),Math.round(x.v)]) };
  }, { LEEF: S.LEEF });
  console.log(JSON.stringify(r, null, 1));
});
