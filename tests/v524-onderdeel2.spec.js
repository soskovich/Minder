/* v524 onderdeel 2 (mockup geldstroom sectie 2): UIT WELK DOEL KWAM HET. Per opname (een afschrijving van je spaarrekening, geen
   verschuiving) kies je zelf de bron; Minder's eigen toewijzing is het voorstel, maar niets staat voorgekozen. De keuze laat dat doel
   het tekort (planTekort) als eerste dragen. Stand: plan-toestel-stand met twee doelen, een spaarrekening-tekort en een opname. */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');

async function setup(page) {
  await T.boot(page, 'nu');
  return page.evaluate((SAV) => {
    SET.goals.find((x) => x.id === 'kk').gespaard = 5000;
    SET.goals.find((x) => x.id === 'iw').gespaard = 3000;
    SET.nfToegewezen = 0; SET.manualBal[SAV] = 6000;   // toe 8000, saldo 6000 → tekort 2000
    SET.terugzetGat = []; delete SET.terugzetVrij; delete SET.terugzetKeuze;   // geen lopende terugzet-keuze
    const t = { id: 'opn1', date: '2026-10-05', amount: -1000, acc: SAV, name: 'Spaarpot', desc: 'Overboeking naar betaalrekening', typ: '', ref: '', src: 'csv', accName: '', refNums: [] };
    TX.push(t); categorize(t); window.__opn = t.id;
    OWN = [...new Set(TX.map((x) => x.acc).filter(Boolean))];
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
    return {};
  }, T.SAV);
}

test.describe('v524 onderdeel 2: uit welk doel kwam het', () => {
  test('a: de opname staat in de lijst, met de chips en één voorstel, niets aangevinkt', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      openOpnameBron(); const sh = document.getElementById('opnameBron');
      const rij = sh.querySelector(`[data-opnamerij="${window.__opn}"]`);
      const chips = [...rij.querySelectorAll('[data-opnbron]')].map((x) => x.dataset.opnbron);
      const voorstel = [...rij.querySelectorAll('[data-opnbron]')].filter((x) => x.dataset.voorstel === '1').map((x) => x.dataset.opnbron);
      const aangevinkt = [...rij.querySelectorAll('[data-opnbron]')].filter((x) => x.dataset.aan === '1').length;
      return { n: +sh.dataset.opnamen, chips, voorstel, aangevinkt, keuze: rij.dataset.keuze };
    });
    expect(r.chips).toContain('noodfonds');
    expect(r.chips).toContain('kk');
    expect(r.chips).toContain('iw');
    expect(r.voorstel.length).toBe(1);     // precies één voorstel gemarkeerd
    expect(r.aangevinkt).toBe(0);          // niets voorgekozen
    expect(r.keuze).toBe('');
  });

  test('b: een keuze laat dat doel het tekort als eerste dragen (planTekort.nog)', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      const nogZonder = planTekort(allocatePlan()).nog.iw || 0;
      setOpnameBron(window.__opn, 'iw');
      const nogMet = planTekort(allocatePlan()).nog.iw || 0;
      const opslag = (SET.opnameBron || {})[window.__opn];
      return { nogZonder, nogMet, opslag };
    });
    expect(r.nogMet).toBe(1000);           // iw draagt de opname van €1.000 als eerste
    expect(r.nogMet).toBeGreaterThan(r.nogZonder);
    expect(r.opslag).toMatchObject({ bron: 'iw' });
  });

  test('c: de sheet opent vanuit "Eruit gehaald" met de juiste link', async ({ page }) => {
    await setup(page);
    const r = await page.evaluate(() => {
      openTerugOpbouw(); const link = document.querySelector('#terugOpbouw [data-waarvandaan]');
      return { link: !!link, onclick: link ? link.getAttribute('onclick') : null };
    });
    expect(r.link).toBe(true);
    expect(r.onclick).toContain('openOpnameBron');
  });
});
