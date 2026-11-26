/* v524 onderdeel 4 (mockup geldstroom sectie 4): OPBOUWPAD BUFFER + de twee maandenkiezers (doelbedrag vs ondergrens) apart. Stand:
   plan-toestel-stand (okt 2026) + een spaarrekening. De ondergrens groeit stap voor stap naar je gekozen norm; per kwartaal ½ maand
   of elke 2 maanden ¼ maand (of zelf). bufferNorm() is pad-aware (fractioneel). Zonder pad blijft alles gelijk (additief). */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');

test.describe('v524 onderdeel 4: opbouwpad buffer', () => {
  test('a: ondergrensNu volgt het pad; bufferNorm is pad-aware; zonder pad de opgeslagen norm', async ({ page }) => {
    await T.boot(page, 'nu');
    const r = await page.evaluate(() => {
      SET.bufferNorm = 2;   // de gekozen ondergrens = het einddoel van het pad
      // elke 2 maanden ¼: start aug 2026, nu okt → 2 maanden → 1 stap → 1 + 0,25 = 1,25
      SET.bufferPad = { modus: '2mnd', van: 1, start: '2026-08' }; save();
      const m2 = { o: ondergrensNu(), n: bufferNorm() };
      // per kwartaal ½: start jul 2026, nu okt → 3 maanden → 1 stap → 1 + 0,5 = 1,5
      SET.bufferPad = { modus: 'kwartaal', van: 1, start: '2026-07' }; save();
      const mk = { o: ondergrensNu(), n: bufferNorm() };
      // zelf / geen pad → de opgeslagen norm
      SET.bufferPad = { modus: 'zelf' }; save();
      const zelf = { o: ondergrensNu(), n: bufferNorm(), stored: bufferNormStored() };
      // het volle pad bereikt naar=2
      SET.bufferPad = { modus: '2mnd', van: 1, start: '2026-08' }; save();
      const traject = bufferPadTraject(bufferPad()).map((s) => s.waarde);
      return { m2, mk, zelf, traject };
    });
    expect(r.m2).toEqual({ o: 1.25, n: 1.25 });
    expect(r.mk).toEqual({ o: 1.5, n: 1.5 });
    expect(r.zelf).toEqual({ o: null, n: 2, stored: 2 });   // geen pad → bufferNorm == bufferNormStored
    expect(r.traject).toEqual([1, 1.25, 1.5, 1.75, 2]);     // elke ¼ tot aan 2
  });

  test('b: de noodfonds-sheet toont het opbouwpad met drie modi, niets voorgekozen, los van de doelbedrag-kiezer', async ({ page }) => {
    await T.boot(page, 'nu');
    const r = await page.evaluate(() => {
      SET.bufferNorm = 2; delete SET.bufferPad; save(); openNoodfondsPanel();
      const sh = document.getElementById('sheet');
      return {
        doelkop: !!sh.querySelector('[data-nfdoelkop]'), grenskop: !!sh.querySelector('[data-nfgrenskop]'),   // de twee maandenkiezers staan apart
        pad: !!sh.querySelector('[data-bufferpad]'),
        modi: [...sh.querySelectorAll('[data-padmodus]')].map((x) => x.dataset.padmodus),
        actief: [...sh.querySelectorAll('[data-padmodus].on')].length,
        resopslag: !!sh.querySelector('[data-resopslag]'),
      };
    });
    expect(r.doelkop).toBe(true);
    expect(r.grenskop).toBe(true);
    expect(r.pad).toBe(true);
    expect(r.modi).toEqual(['kwartaal', '2mnd', 'zelf']);
    expect(r.actief).toBe(0);     // niets voorgekozen
    expect(r.resopslag).toBe(true);
  });

  test('c: een pad kiezen zet het en toont het traject; de opslag-schakelaar wordt vastgelegd', async ({ page }) => {
    await T.boot(page, 'nu');
    const r = await page.evaluate(() => {
      SET.bufferNorm = 2; delete SET.bufferPad; delete SET.bufferResOpslag; save(); openNoodfondsPanel();
      document.querySelector('[data-padmodus="2mnd"]').click();
      const sh = document.getElementById('sheet');
      const traj = sh.querySelector('[data-padtraject]');
      document.querySelector('[data-resopslag]').click();
      return { modus: SET.bufferPad && SET.bufferPad.modus, start: SET.bufferPad && SET.bufferPad.start, heeftTraject: !!traj, opslagAan: !!SET.bufferResOpslag };
    });
    expect(r.modus).toBe('2mnd');
    expect(r.start).toBe('2026-10');     // het pad vertrekt op de huidige maand
    expect(r.heeftTraject).toBe(true);
    expect(r.opslagAan).toBe(true);
  });

  test('d: met essCrisis en een reserveringstekort telt de opslag mee in "genoeg vanaf"', async ({ page }) => {
    const BF = require('./budget-fixture');
    await BF.open(page, BF.seed());
    const r = await page.evaluate(() => {
      const ess = Math.round(noodfondsModel().essCrisis || 0);
      if (!(ess > 0)) return { ess };   // deze fixture draagt geen crisis: dan is er niets te meten
      SET.bufferNorm = 2; delete SET.bufferPad; SET.bufferResOpslag = false;
      SET.reserveringen = [{ id: 'rboete', naam: 'Boete', bedrag: 2000, vervalmaand: '2027-01', intervalM: 0 }];
      SET.resAcc = ''; save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
      const tekort = bufferResTekort();
      openNoodfondsPanel();
      const g0 = +(document.querySelector('#sheet [data-padgenoeg]') || { dataset: {} }).dataset.padgenoeg || null;
      toggleBufferResOpslag();
      const g1 = +(document.querySelector('#sheet [data-padgenoeg]') || { dataset: {} }).dataset.padgenoeg || null;
      return { ess, tekort, g0, g1 };
    });
    if (!(r.ess > 0)) return;   // fixture zonder crisis: niets te toetsen
    expect(r.tekort).toBeGreaterThan(0);
    expect(r.g1 - r.g0).toBe(r.tekort);
  });
});
