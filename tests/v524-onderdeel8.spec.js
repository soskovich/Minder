/* v524 onderdeel 8 (rest): bij een VOLLE LAAG vraagt Kiezen één keer waar het vaste bedrag (de opzij uit je verdeling) voortaan
   heen gaat (niets voorgekozen, niets schuift vanzelf door: SET.lagenVolKeuze wordt vastgelegd, niet uitgevoerd). En "nog EUR X
   over te maken" voor het surplus dat nog niet is overgemaakt, pas na OVERBOEK_LAAT_DAGEN werkdagen één keer in Kiezen. Beide
   additief: ze lezen alleen en bewegen geen bedrag. Stand: plan-toestel-stand, buffer vol gemaakt + een vaste opzij. */
const { test, expect } = require('./klok');
const T = require('./plan-toestel-stand');

async function volBuffer(page) {
  await T.boot(page, 'nu');
  return page.evaluate((SAV) => {
    // maak de noodfonds-laag vol: saldo + toewijzing ruim boven het doel (geld wordt door het spaarsaldo begrensd)
    SET.nfToegewezen = 1e7; SET.manualBal[SAV] = 1e7;
    const nf = (planItems() || []).find((p) => p.type === 'noodfonds');
    delete SET.lagenVolKeuze;
    save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
    // injecteer een surplus van EUR 500 in lagenGestort (de rest van het object blijft echt, zodat planGestortKaart blijft werken)
    const _real = lagenGestort;
    window.lagenGestort = () => { const G = _real() || {}; return Object.assign({}, G, { extra: Object.assign({ verg: 500, eenmalig: 0, naar: 'beschermen', overTeMaken: 0 }, G.extra, { bedrag: 500, overTeMaken: 0 }) }); };
    const L = lagenData();
    return { nfDoel: nf ? Math.round(+nf.doel || 0) : 0, beschermen: Math.round(L.beschermen), beschermenDoel: Math.round(L.beschermenDoel), surplus: lagenGestort().extra.bedrag };
  }, T.SAV);
}

test.describe('v524 onderdeel 8: volle laag + nog over te maken', () => {
  test('a: een volle laag geeft de Kiezen-vraag "waar gaat je vaste opzij voortaan heen?"', async ({ page }) => {
    const pre = await volBuffer(page);
    expect(pre.beschermen).toBeGreaterThanOrEqual(pre.beschermenDoel); // de buffer is vol
    expect(pre.beschermenDoel).toBeGreaterThan(0);
    const r = await page.evaluate(() => {
      const V = lagenVolVraag();
      const kies = (gripCyclus() || {}).kies || [];
      return { bedrag: V ? V.bedrag : null, laag: V ? V.laag : null, inKies: kies.some((x) => x.id === 'lagen:vol') };
    });
    expect(r.bedrag).toBe(500);
    expect(r.laag).toBe('beschermen');
    expect(r.inKies).toBe(true);
  });

  test('b: de vraag verdwijnt zodra er een keuze is, en die keuze beweegt geen bedrag (niets schuift vanzelf door)', async ({ page }) => {
    await volBuffer(page);
    const r = await page.evaluate(() => {
      const saldoVoor = Math.round(lagenData().saldo);
      const planVoor = JSON.stringify(allocatePlan().map((p) => [p.id, Math.round(p.alloc || 0)]));
      setLagenVolKeuze('reserveren');
      const na = lagenVolVraag();
      const inKies = ((gripCyclus() || {}).kies || []).some((x) => x.id === 'lagen:vol');
      const saldoNa = Math.round(lagenData().saldo);
      const planNa = JSON.stringify(allocatePlan().map((p) => [p.id, Math.round(p.alloc || 0)]));
      return { opslag: SET.lagenVolKeuze, na: na || null, inKies, saldoGelijk: saldoVoor === saldoNa, planGelijk: planVoor === planNa };
    });
    expect(r.opslag).toMatchObject({ naar: 'reserveren' });
    expect(r.na).toBe(null); // beantwoord → geen vraag meer
    expect(r.inKies).toBe(false);
    expect(r.saldoGelijk).toBe(true); // niets schuift vanzelf door
    expect(r.planGelijk).toBe(true);
  });

  test('c: de sheet toont de bestemmingen met niets voorgekozen', async ({ page }) => {
    await volBuffer(page);
    const r = await page.evaluate(() => {
      openLagenVolKeuze();
      const sh = document.getElementById('lagenVolKeuze');
      const chips = [...sh.querySelectorAll('[data-volbron]')].map((x) => x.dataset.volbron);
      const aan = [...sh.querySelectorAll('[data-volbron]')].filter((x) => x.dataset.aan === '1').length;
      return { bedrag: +sh.dataset.volbedrag, chips, aan };
    });
    expect(r.bedrag).toBe(500);
    expect(r.chips).toContain('reserveren');
    expect(r.chips).toContain('groeien');
    expect(r.aan).toBe(0); // niets voorgekozen
  });

  test('e: met een surplus maar zonder een volle buffer is er geen vraag (de vol-poort doet er echt toe)', async ({ page }) => {
    await T.boot(page, 'nu');
    const r = await page.evaluate(() => {
      delete SET.lagenVolKeuze; save();
      // wel een surplus, maar de buffer NIET vol gemaakt
      const _real = lagenGestort;
      window.lagenGestort = () => { const G = _real() || {}; return Object.assign({}, G, { extra: Object.assign({ verg: 500, eenmalig: 0, naar: 'beschermen', overTeMaken: 0 }, G.extra, { bedrag: 500, overTeMaken: 0 }) }); };
      const L = lagenData();
      const V = lagenVolVraag();
      const inKies = ((gripCyclus() || {}).kies || []).some((x) => x.id === 'lagen:vol');
      return { vol: L.beschermen >= L.beschermenDoel - 0.5, surplus: lagenGestort().extra.bedrag, V: V || null, inKies };
    });
    expect(r.vol).toBe(false); // de buffer is NIET vol op de kale stand
    expect(r.surplus).toBe(500); // er is wel een surplus, dus de vol-poort is de enige reden
    expect(r.V).toBe(null);
    expect(r.inKies).toBe(false);
  });

  test('f: een volle buffer zonder surplus geeft geen vraag (de surplus-poort doet er echt toe; additief op surplus-vrije standen)', async ({ page }) => {
    await T.boot(page, 'nu');
    const r = await page.evaluate((SAV) => {
      SET.nfToegewezen = 1e7; SET.manualBal[SAV] = 1e7; delete SET.lagenVolKeuze;
      save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {}
      const L = lagenData();
      let G = null; try { G = lagenGestort(); } catch (_) {}
      const surplus = G && G.extra ? G.extra.bedrag : null;
      const V = lagenVolVraag();
      const inKies = ((gripCyclus() || {}).kies || []).some((x) => x.id === 'lagen:vol');
      return { vol: L.beschermen >= L.beschermenDoel - 0.5, surplus, V: V || null, inKies };
    }, T.SAV);
    expect(r.vol).toBe(true); // de buffer IS vol
    expect(r.surplus).toBe(0); // maar er is geen surplus
    expect(r.V).toBe(null); // dus geen vraag
    expect(r.inKies).toBe(false);
  });

  test('d: "nog over te maken" telt werkdagen: pas vanaf de 3e werkdag na je salaris een Kiezen-item', async ({ page }) => {
    await T.boot(page, 'nu');
    const r = await page.evaluate(() => {
      // een kunstmatig G.extra met een overTeMaken en een salDag, zodat alleen de werkdag-poort wordt getoetst
      const salDag = '2026-10-23'; // een vrijdag
      const _lg = lagenGestort;
      window.lagenGestort = () => ({ extra: { overTeMaken: 300, naar: 'beschermen' }, PW: { salDag } });
      const voor2 = (function () { window._voorbeeldDag = '2026-10-27'; return lagenOverVraag(); })(); // ma: 2 werkdagen (vr→ma→di is 3e), nog net niet
      const na3 = (function () { window._voorbeeldDag = '2026-10-28'; return lagenOverVraag(); })(); // di: de 3e werkdag
      const inKies = (function () {
        window._voorbeeldDag = '2026-10-28';
        return ((gripCyclus() || {}).kies || []).some((x) => x.id === 'lagen:over');
      })();
      window.lagenGestort = _lg; delete window._voorbeeldDag;
      return { voor2: voor2 || null, na3: na3 ? na3.bedrag : null, inKies };
    });
    expect(r.voor2).toBe(null); // binnen 3 werkdagen nog geen herinnering
    expect(r.na3).toBe(300);
    expect(r.inKies).toBe(true);
  });
});
