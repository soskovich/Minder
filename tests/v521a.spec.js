/* v521a: de salarisverdeling rekent de lopende beleggingsinleg mee, en een getal voor vaste lasten en potjes in de lopende periode.
   Stand: tests/v521a-stand.js (24 nov, dag 1 van 24 nov – 23 dec, GECONSTRUEERD). De bedragen van 9fbc05f staan in tests/v521a-voor.json
   (generator tests/wip/v521a-voor-gen.spec.js). */
const { test, expect } = require('./klok');
const B = require('./v521a-stand');
const VOOR = require('./v521a-voor.json');

test.describe('v521a', () => {
  test('a: de Betaalrekening draagt beleggen EUR 200 en opzij is precies EUR 200 lager dan zonder', async ({ page }) => {
    await B.boot(page);
    const r = await page.evaluate((BET) => {
      const P = rekVoorstel(), bet = P.rek.find((x) => x.acc === BET);
      const U = rekUitlegRij(P, bet, null);
      const assets = SET.assets; SET.assets = []; window._rekV = null; try { runMemoVergeten(); } catch (_) {}
      const P0 = rekVoorstel(), bet0 = P0.rek.find((x) => x.acc === BET);
      SET.assets = assets; window._rekV = null; try { runMemoVergeten(); } catch (_) {}
      return { belS: bet.belS, beleg: bet.beleg.map((x) => [x.naam, x.totaal, x.data]), laten: bet.laten, laten0: bet0.laten, opzij: P.opzij, opzij0: P0.opzij, tekst: U.tekst, deel: U.beleg,
        som: U.vast + U.beleg + U.pot + U.kas + U.buf + U.afronding, nodig: U.nodig };
    }, B.BET);
    expect(r.beleg).toEqual([['Saxo', 100, ['2026-11-25']], ['Peaks Kayani', 100, ['2026-11-28']]]);
    expect(r.belS).toBe(200);
    expect(r.laten - r.laten0).toBe(200);
    expect(r.opzij0 - r.opzij).toBe(200);
    expect(r.tekst).toContain('beleggen: Saxo €100 + Peaks Kayani €100');   // v521b fix c
    expect(r.tekst.indexOf('vaste lasten')).toBeLessThan(r.tekst.indexOf('beleggen'));
    expect(r.som).toBe(r.nodig);   // de delen tellen op tot nodig
  });

  test('a2: zonder inleg is er geen regel beleggen en verandert er niets', async ({ page }) => {
    await B.boot(page, { beleg: false });
    const r = await page.evaluate((BET) => { const P = rekVoorstel(), bet = P.rek.find((x) => x.acc === BET); return { belS: bet.belS, tekst: rekUitlegRij(P, bet, null).tekst, beleg: P.beleg.length }; }, B.BET);
    expect(r.belS).toBe(0); expect(r.beleg).toBe(0); expect(r.tekst).not.toContain('beleggen');
  });

  test('b: het pensioen met start januari telt niet in 24 nov – 23 dec en wel in 24 dec – 23 jan', async ({ page }) => {
    await B.boot(page);
    const r = await page.evaluate(() => { const P = rekVoorstel(), set = new Set(P.BR);
      return { bet: [...set].find((a) => SET.assets.find((x) => x.id === 'pens').perAcc === a), nu: P.beleg.map((x) => x.id), start: P.start, eind: P.eind,
        volgend: rekBelegInleg('2026-12-24', '2027-01-23', set, P.salAcc).map((x) => [x.id, x.data, x.totaal, x.bron, x.acc]) }; });
    expect([r.start, r.eind]).toEqual(['2026-11-24', '2026-12-23']);
    expect(r.nu).not.toContain('pens');
    expect(r.volgend).toContainEqual(['pens', ['2027-01-01'], 200, 'keuze', r.bet]);
  });

  test('c: beleggen telt bij de rekening waar de gekoppelde boekingen vandaan komen', async ({ page }) => {
    await B.boot(page, { peaksAcc: 'LEEF' });
    const r = await page.evaluate(({ BET, LEEF }) => { const P = rekVoorstel(), o = {}; for (const x of P.rek) o[x.acc] = x.belS; return { bet: o[BET], leef: o[LEEF], eerste: P.BR[0], first: o[P.BR[0]] }; }, { BET: B.BET, LEEF: B.LEEF });
    expect(r.bet).toBe(100);
    expect(r.leef).toBe(100);
    expect([B.BET, B.LEEF]).not.toContain(r.eerste);   // de eerste betaalrekening is een andere, dus "alles bij de eerste" is te onderscheiden
    expect(r.first).toBe(0);
  });

  test('d: Grip en Inzichten tonen dezelfde vaste lasten en potjes, en die hangen niet af van of de incasso al geboekt is', async ({ page }) => {
    await B.boot(page);
    const r = await page.evaluate(() => {
      const lees = () => { go('maand'); try { gripKiesTab('zien'); } catch (_) {} const g = document.getElementById('gripZienStand'); go('ins'); renderIns(); const i = document.getElementById('insMaand');
        return { g: [+g.dataset.zienvast, +g.dataset.zienbudget], i: [+i.dataset.insvast, +i.dataset.insbudget] }; };
      const na = lees();
      /* dezelfde stand met de incasso van 24 nov nog niet geboekt, en de vastlegging opnieuw bepaald */
      const sp = TX.filter((t) => t.name === 'Spotify' && t.date === '2026-11-24'); TX = TX.filter((t) => !sp.includes(t));
      delete SET.periodeBudgetVast; save(); try { buildAccMeta(); } catch (_) {} window._rekV = null; try { runMemoVergeten(); } catch (_) {}
      const voor = lees();
      return { na, voor };
    });
    expect(r.na.g).toEqual(r.na.i);
    expect(r.na.g).toEqual([1746, 1578]);   // het abonnement van EUR 9 is een vaste last (de regel van maandSplitsing en de vooruitblik)
    expect(r.voor.g).toEqual(r.na.g);
    expect(r.voor.i).toEqual(r.na.i);
  });

  test('e: de lijst achter "reserveringen EUR X in deze periode" telt op tot het bedrag van de regel', async ({ page }) => {
    await B.boot(page);
    const r = await page.evaluate(() => {
      Object.assign(SET.salVerdeling, { salYM: '2026-10', ym: '2026-10', start: '2026-10-24', eind: '2026-11-23', reserveringen: 32 });
      save(); window._rekV = null; try { runMemoVergeten(); } catch (_) {}
      const box = document.createElement('div'); box.innerHTML = salVoorstelKaartHtml(); document.body.appendChild(box);
      const link = box.querySelector('[data-salvreslink]'); const linkTekst = link ? link.textContent : null;
      if (link) link.click();
      const sh = document.getElementById('resPeriode'); const rijen = sh ? [...sh.querySelectorAll('[data-resperioderij]')].map((x) => [x.dataset.resperioderij, +x.dataset.per]) : [];
      const sheetOpen = !!sh, kaartNog = !!document.getElementById('salVerdeling');
      box.remove();
      return { linkTekst, sheetOpen, kaartNog, rijen, totaal: sh ? +sh.dataset.restotaal : null, P: Math.round(rekVoorstel().reserveringen) };
    });
    expect(r.linkTekst).toContain(`€${r.P} in deze periode`);
    expect(r.sheetOpen).toBe(true);
    expect(r.kaartNog).toBe(false);   // de tik opent de lijst en niet ook de verdeling
    expect(r.rijen.map((x) => x[0])).toEqual(['r521a1', 'r521a2']);
    expect(r.rijen.reduce((a, x) => a + x[1], 0)).toBe(r.P);
    expect(r.totaal).toBe(r.P);
  });

  test('f: elk ander bedrag op Home, Inzichten, Grip, Plan en Vermogen is gelijk aan 9fbc05f', async ({ page }) => {
    test.setTimeout(60000);
    await B.boot(page);
    const NA = await B.bedragen(page);
    const verschil = (a, b) => { const c = {}; for (const x of a) c[x] = (c[x] || 0) + 1; for (const x of b) c[x] = (c[x] || 0) - 1; const weg = {}, bij = {}; for (const k in c) { if (c[k] > 0) weg[k] = c[k]; if (c[k] < 0) bij[k] = -c[k]; } return { weg, bij }; };
    for (const k of ['home', 'grip-kiezen', 'grip-terugblik', 'vermogen']) expect(NA[k], k).toEqual(VOOR[k]);   // v524: 'plan' is nu de lagen-invariant
    expect(await require('./plan-lagen-invariant').planLagenInvariant(page)).toEqual(require('./plan-lagen-invariant').PLAN_LAGEN_OK);
    /* de splitsing vast/potjes: EUR 9 van potjes naar vast (het abonnement), op Inzichten en Grip Zien */
    const splits = { weg: { '€1.587': 2, '€1.737': 1 }, bij: { '€1.578': 2, '€1.746': 1 } };
    expect(verschil(VOOR.ins, NA.ins)).toEqual(splits);
    expect(verschil(VOOR['grip-zien'], NA['grip-zien'])).toEqual(splits);
    expect([VOOR.insSplit, NA.insSplit]).toEqual([{ vast: '1737', pot: '1587' }, { vast: '1746', pot: '1578' }]);
    /* Begrijpen: dezelfde EUR 9 in de brug (vast-stap 309 → 300, de potjes samen +9: 127 → 128 en -960 → -952) en de indeling */
    expect(verschil(VOOR['grip-begrijpen'], NA['grip-begrijpen'])).toEqual({ weg: { '€1.737': 1, '€1.587': 1, '€309': 1, '€127': 1, '-€960': 1 }, bij: { '€1.746': 1, '€1.578': 1, '€300': 1, '€128': 1, '-€952': 1 } });
    /* de salarisverdeling: Betaalrekening 600 → 800, opzij 1460 → 1260, de twee regels beleggen (+EUR 100) en "overboeken" 199 meer → 1 erbij */
    /* v523 (punt 4): de reserveringen tellen sinds v523 per salarisperiode tot de vervaldag (de verzekering van december, zonder boeking op de 1e,
       valt nu helemaal in 24 nov – 23 dec), dus de reserveringsregel en opzij verschuiven samen; de som opzij + reserveringen houdt de EUR 200 */
    const vS = verschil(VOOR.salv, NA.salv);
    expect(vS.weg['€600']).toBe(4); expect(vS.bij['€800']).toBe(4); expect(vS.bij['€100']).toBe(2);
    expect(NA.P.rek).toEqual(VOOR.P.rek.map((x) => x.acc === B.BET ? Object.assign({}, x, { laten: x.laten + 200 }) : x));
    expect(NA.P.opzij + NA.P.res).toBe(VOOR.P.opzij + VOOR.P.res - 200);
  });
});
