/* v524 onderdeel 3 (mockup geldstroom, sectie 3): SPAARDOEL BESTEDEN. Stand: plan-toestel-stand (dag 10 okt 2026, doelen iw/kk +
   een spaarrekening). Een doel op "besteden" telt zijn gekoppelde aankopen tegen dat doel (de stand daalt), niet tegen je potjes
   (uitgaveNorm/catSpendMap/totals), en vraagt niet om terugzetten. Spiegelt "uit een reservering" (v269).
   categorize() herschrijft t.id naar een hash, dus we leggen de echte id vast in window.__ikea. */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');

async function setup(page) {
  await T.boot(page, 'nu');
  return page.evaluate((sav) => {
    SET.manualBal[sav] = 20000;   // ruim gefinancierd, zodat de Doelen-laag (geld) de toewijzing volgt (niet funding-begrensd)
    const g = SET.goals.find((x) => x.id === 'iw'); g.besteden = true; g.gespaard = 2000;
    const acc = Object.keys(SET.manualBal)[0];
    const t = { id: 'ikea1', date: '2026-10-05', amount: -649, acc, name: 'IKEA', desc: 'IKEA Amsterdam', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    TX.push(t); categorize(t); window.__ikea = t.id;        // de hash-id na categorize
    if (!(CATS[catOf(t)] && CATS[catOf(t)].type === 'expense')) OVR[t.id] = 'boodschappen';
    save();
    zetUitDoel(window.__ikea, 'iw', 649);
    return { cat: catOf(t) };
  }, T.SAV);
}

test.describe('v524 onderdeel 3: spaardoel besteden', () => {
  test('a: een gekoppelde aankoop telt tegen het doel en niet tegen je potjes', async ({ page }) => {
    const { cat } = await setup(page);
    const r = await page.evaluate((cat) => {
      const tx = () => TX.find((x) => x.id === window.__ikea);
      const b = uitDoelBedrag(tx()), van = uitDoelVan(tx());
      const pmMet = planMap().iw;
      const catMet = catSpendMap('2026-10')[cat] || 0, spendMet = totals('2026-10').spendNorm, doelenMet = lagenData().doelen;
      zetUitDoel(window.__ikea, null, 0);   // vlag eraf
      const catZonder = catSpendMap('2026-10')[cat] || 0, spendZonder = totals('2026-10').spendNorm, doelenZonder = lagenData().doelen, pmZonder = planMap().iw;
      return { b, van, pmMet: { gespaard: pmMet.gespaard, besteed: pmMet.besteed, besteden: pmMet.besteden },
        catMet, catZonder, spendMet, spendZonder, doelenMet, doelenZonder, pmZonderGespaard: pmZonder.gespaard };
    }, cat);
    expect(r.b).toBe(649);
    expect(r.van).toBe('iw');
    expect(r.pmMet).toEqual({ gespaard: 1351, besteed: 649, besteden: true });   // 2000 - 649
    expect(r.pmZonderGespaard).toBe(2000);
    expect(r.catZonder - r.catMet).toBe(649);       // niet tegen je potjes
    expect(r.spendZonder - r.spendMet).toBe(649);
    expect(r.doelenZonder - r.doelenMet).toBe(649); // de Doelen-laag volgt de verlaagde stand
  });

  test('b: de boekingssheet biedt "uit een spaardoel" alleen bij een besteden-doel', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      openSheet(window.__ikea); const sh = document.getElementById('sheet').innerHTML;
      const rij = !!document.querySelector('#sheet [data-uitdoelrij]'), checked = !!document.querySelector('#sheet #uitdoel:checked');
      closeSheet();
      SET.goals.find((x) => x.id === 'iw').besteden = false; save();
      openSheet(window.__ikea); const rijNa = !!document.querySelector('#sheet [data-uitdoelrij]'); closeSheet();
      return { rij, checked, naam: /uit een spaardoel/.test(sh), rijNa, bedragBlijft: uitDoelBedrag(TX.find((x) => x.id === window.__ikea)) };
    });
    expect(r.rij).toBe(true);
    expect(r.checked).toBe(true);
    expect(r.naam).toBe(true);
    expect(r.rijNa).toBe(false);        // besteden uit: geen koppel-optie meer
    expect(r.bedragBlijft).toBe(649);   // maar de bestaande vlag blijft buiten je potjes tellen
  });

  test('c: de detailsheet toont de schakelaar, de besteed-stand en de aankopen', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      openPlanDoel('iw'); const sh = document.getElementById('planDoelSheet');
      return { toggle: !!sh.querySelector('[data-doelbesteden]:checked'),
        besteed: +sh.querySelector('[data-besteedstand]').dataset.besteedstand,
        rest: +sh.querySelector('[data-besteedstand]').dataset.besteedrest,
        txrij: [...sh.querySelectorAll('[data-besteedtx]')].map((x) => x.dataset.besteedtx),
        klaar: [...sh.querySelectorAll('[data-besteedklaar]')].map((x) => x.dataset.besteedklaar) };
    });
    expect(r.toggle).toBe(true);
    expect(r.besteed).toBe(649);
    expect(r.rest).toBe(1351);
    expect(r.txrij.length).toBe(1);
    expect(r.klaar).toEqual(['noodfonds', 'blijft', 'afsluiten']);
  });

  test('d: "Rest naar Noodfonds" verhuist de rest en sluit het doel', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      const nf0 = Math.max(Math.round(+SET.nfToegewezen || 0), 0);
      doelBestedenKlaar('iw', 'noodfonds');
      const nf1 = Math.max(Math.round(+SET.nfToegewezen || 0), 0);
      return { nf0, nf1, weg: !SET.goals.find((x) => x.id === 'iw') };
    });
    expect(r.nf1 - r.nf0).toBe(1351);   // de rest (2000 - 649) naar het noodfonds
    expect(r.weg).toBe(true);
  });
});
