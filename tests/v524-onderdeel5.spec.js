/* v524 onderdeel 5 (mockup geldstroom sectie 5): VERSCHUIVING TUSSEN LAGEN EN DOELEN. Stand: plan-toestel-stand (okt 2026) + een
   reserveringsrekening en een overboeking noodfonds→reserveringen (€1.000 op 12 okt, bijschrijving op de reserveringsrekening op
   13 okt). Die telt niet als opname ("nog terug" verdwijnt, savedNetRange laat hem weg), en het lagen-logboek toont hem met de keuze
   of je noodfonds het terug moet krijgen. Een doel→doel-verplaatsing (SET.planVerplaatsLog, v502) staat er als verschuiving naast. */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');

async function setup(page) {
  await T.boot(page, 'nu');
  return page.evaluate((SAV) => {
    const resv = 'NL00RESV0000000001';
    const out = { id: 'savout1', date: '2026-09-12', amount: -1000, acc: SAV, name: 'Naar reserveringen', desc: 'Overboeking naar reserveringen', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    const inn = { id: 'resin1', date: '2026-09-13', amount: 1000, acc: resv, name: 'Van noodfonds', desc: 'Overboeking van noodfonds', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    TX.push(out); categorize(out); window.__out = out.id;
    TX.push(inn); categorize(inn);
    SET.resAcc = resv;
    // een doel→doel-verplaatsing deze periode (v502-log)
    SET.planVerplaatsLog = [{ id: 'pvtest', op: '2026-09-11', van: 'kk', naar: 'iw', vanNaam: 'Kosten Koper', naarNaam: 'Inrichting woning', bedrag: 1350, voor: {}, na: {} }];
    OWN = [...new Set(TX.map((t) => t.acc).filter(Boolean))];   // de reserveringsrekening in OWN zetten
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
    return { savIsSpaar: n26SavingsAccounts().includes(SAV), resAcc: resAccId() };
  }, T.SAV);
}

test.describe('v524 onderdeel 5: verschuiving tussen lagen en doelen', () => {
  test('a: de overboeking naar je reserveringen is een verschuiving, geen opname', async ({ page }) => {
    const pre = await setup(page);
    expect(pre.savIsSpaar).toBe(true);     // de voorwaarde: SAV is een herkende spaarrekening
    expect(pre.resAcc).toBe('NL00RESV0000000001');
    const r = await page.evaluate(() => {
      const out = TX.find((x) => x.id === window.__out);
      const isV = isVerschuiving(out), naar = verschuivingNaar(out);
      const net = savedNetRange('2026-09-01', '2026-09-30');
      // de RUWE som van de spaarrekening-boekingen in het venster (mét de -1000 van de verschuiving)
      const sav = new Set(n26SavingsAccounts());
      const ruw = telbareTx().filter((t) => sav.has(t.acc) && t.date.slice(0, 10) >= '2026-09-01' && t.date.slice(0, 10) <= '2026-09-30').reduce((a, t) => a + t.amount, 0);
      return { isV, naar, net, ruw: Math.round(ruw) };
    });
    expect(r.isV).toBe(true);
    expect(r.naar).toBe('reserveren');
    /* savedNetRange laat de verschuiving (−€1.000) weg, dus hij ligt €1.000 BOVEN de ruwe som; anders telt hij hem als opname mee */
    expect(r.net - r.ruw).toBe(1000);
  });

  test('b: het lagen-logboek toont de verschuiving met de keuze, en de doel→doel-verplaatsing', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      openLagenLog(); const sh = document.getElementById('lagenLog');
      const lagen = [...sh.querySelectorAll('[data-verschlaag]')].map((x) => x.dataset.verschlaag);
      const keuzes = [...sh.querySelectorAll('[data-verschlaag] [data-verschkeuze]')].map((x) => x.dataset.verschkeuze);
      const doelen = [...sh.querySelectorAll('[data-verschdoel]')].map((x) => x.textContent.replace(/\s+/g, ' ').trim());
      return { n: +sh.dataset.verschn, lagen: lagen.length, keuzes, doelen, nogterug: /nog terug/i.test(sh.textContent) && /€0/.test(sh.textContent) };
    });
    expect(r.n).toBe(2);               // 1 lagen-verschuiving + 1 doel→doel
    expect(r.lagen).toBe(1);
    expect(r.keuzes).toEqual(['nee', '3', '6']);   // niets voorgekozen, drie keuzes
    expect(r.doelen.length).toBe(1);
    expect(r.doelen[0]).toContain('Kosten Koper → Inrichting woning');
    expect(r.doelen[0]).toContain('€1.350');
    expect(r.nogterug).toBe(true);     // "nog terug €0" staat erbij
  });

  test('c: een keuze wordt vastgelegd (niets schuift vanzelf door)', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      openLagenLog();
      const voor = (SET.verschuiving || {})[window.__out];
      document.querySelector(`[data-verschlaag="${window.__out}"] [data-verschkeuze="3"]`).click();
      const na = (SET.verschuiving || {})[window.__out];
      const aan = document.querySelector(`[data-verschlaag="${window.__out}"] [data-verschkeuze="3"]`).dataset.aan;
      return { voor: voor || null, na, aan };
    });
    expect(r.voor).toBe(null);         // vooraf niets gekozen
    expect(r.na).toMatchObject({ kant: 'reserveren', keuze: '3' });
    expect(r.aan).toBe('1');           // de gekozen knop is gemarkeerd
  });
});
