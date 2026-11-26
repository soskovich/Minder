/* v523: de salarisverdeling rekent met je echte overboeking, de krap-melding kent je afspraak en je inleg, reserveringen per salarisperiode.
   Stand: tests/v523-stand.js (25 nov, salaris 25 nov binnen, GECONSTRUEERD). De bedragen van bc2bafd staan in tests/v523-voor.json (generator
   tests/wip/v523-voor-gen.spec.js). */
const { test, expect } = require('./klok');
const S = require('./v523-stand');
const VOOR = require('./v523-voor.json');
const A = { MAIN: S.MAIN, BET: S.BET, LEEF: S.LEEF, RES: S.RES };

/* de N26-bedragen van de gebruiker als afspraak vastleggen via "Bevestigen of aanpassen" */
async function bevestig(page, opzij) {
  return page.evaluate(({ BET, LEEF, MAIN, opzij }) => {
    openPeriodeStart(); const S0 = window._salv, vooraf = { bet: S0.eigen[BET], leef: S0.eigen[LEEF], opzij: S0.eigenOpzij, res: S0.eigenRes, modus: S0.modus };
    salVerdelingVeld(BET, '1700'); salVerdelingVeld(LEEF, '1695'); salVerdelingVeld('__res', '36'); salVerdelingVeld('__opzij', String(opzij));
    const on = [...document.querySelectorAll('#salVerdeling [data-salvoudnieuw]')].map((x) => [x.dataset.salvoudnieuw, x.dataset.oud, x.dataset.nieuw, x.textContent]);
    const rest = (document.querySelector('#salVerdeling [data-salvrest]') || {}).textContent || '';
    const gevolg = (document.querySelector('#salVerdeling [data-salvgevolg]') || {}).textContent || '';
    document.querySelector('#salVerdeling [data-salvakkoord]').click();
    return { vooraf, on, rest, gevolg, SV: SET.salVerdeling };
  }, Object.assign({ opzij }, A));
}

test.describe('v523', () => {
  test('a: na bevestigen met EUR 1.700 leest "je afspraak" overal EUR 1.700', async ({ page }) => {
    await S.boot(page);
    const r = await bevestig(page, 1500);
    // vooringevuld met de laatste afspraak, niet met het voorstel
    expect(r.vooraf).toEqual({ bet: 1600, leef: 1700, opzij: 1766, res: 0, modus: 'aanpassen' });
    // oud → nieuw staat er vooraf
    const bet = r.on.find((x) => x[0] === S.BET);
    expect(bet.slice(1, 3)).toEqual(['1600', '1700']);
    expect(bet[3]).toContain('€1.600 → €1.700');
    expect(r.on.find((x) => x[0] === '__opzij').slice(1, 3)).toEqual(['1766', '1500']);
    expect(r.rest).toContain('€285');   // 5216 − 1700 − 1695 − 36 − 1500
    expect(r.gevolg).toContain('Opzij €1.500');   // het gevolg rekent met je eigen reserveringen, niet met het voorstel
    expect(r.SV.rek).toEqual({ [S.MAIN]: 285, [S.BET]: 1700, [S.LEEF]: 1695 });
    expect([r.SV.opzij, r.SV.reserveringen]).toEqual([1500, 36]);
    expect(r.SV.vorige.rek[S.BET]).toBe(1600);   // de oude afspraak verdwijnt niet stil
    const o = await page.evaluate(({ BET }) => {
      const D = totSalarisData(BET), N = salVoorstelNu(), O = opzijPeriode();
      go('maand'); gripKiesTab('zien'); const zien = document.getElementById('s-maand').innerText;
      return { totAfspraak: D.afspraak, nAfspraak: N.rek.find((x) => x.acc === BET).afspraak, doel: O.doel, zien, ov: overboekVerwacht().find((x) => x.naar === BET).bedrag };
    }, A);
    expect(o.totAfspraak).toBe(1700);
    expect(o.nAfspraak).toBe(1700);
    expect(o.ov).toBe(1700);
    expect(o.doel).toBe(1500);
    expect(o.zien).toContain('volgens je verdeling €1.500');
    expect(o.zien).not.toContain('€1.766');
  });

  test('b: 25 nov, overboeking nog niet gezien: geen tekort op de Betaalrekening, wel "verwacht: je overboeking van EUR 1.700"', async ({ page }) => {
    await S.boot(page);
    await bevestig(page, 1500);
    const r = await page.evaluate(({ BET }) => {
      window._rekV = null; window._salTek = null;
      const T = salTekortData(), D = totSalarisData(BET); window._totsal = BET; renderTotSalaris();
      const tot = document.getElementById('sheet').innerText;
      const P = rekVoorstel(), bet = P.rekAlle.find((x) => x.acc === BET);
      // zonder de verwachte overboeking (de meting zelf, niet een tweede som): wat salProjectie dan zou zeggen
      let b = accBalance(BET), laagst = b; for (let d = rekDag(vandaagYMD(), 1); d <= P.SP.cur.eind; d = rekDag(d, 1)) { const u = bet.uitDagDelen(d); b -= u.vast + u.pot + u.kas + u.bel + Math.max(u.over, 0); laagst = Math.min(laagst, b); }
      return { krapBet: T.some((x) => x.acc === BET), over: D.over, eind: D.eind, tot, zonder: laagst, kaart: salOverboekRegel(salOverboekVan(BET)) };
    }, A);
    expect(r.krapBet).toBe(false);
    expect(r.over).toBe(-1700);
    expect(r.eind).toBeGreaterThan(0);
    expect(r.tot).toContain('verwacht: je overboeking van €1.700 (nog niet gezien)');
    expect(r.kaart).toContain('verwacht: je overboeking van €1.700 (nog niet gezien)');
    expect(r.zonder).toBeLessThan(-0.5);   // zonder je afspraak was de Betaalrekening krap
  });

  test('b2: een gezien overboeking telt niet nog eens', async ({ page }) => {
    await S.boot(page, { overboekGezien: true, dag: '2026-11-27' });
    const r = await page.evaluate(({ BET }) => { const o = overboekVerwacht().find((x) => x.naar === BET); return { gezien: o.gezien, telDag: o.telDag, over: totSalarisData(BET).over }; }, A);
    expect(r).toEqual({ gezien: true, telDag: null, over: 0 });
  });

  test('c: 1 dec (3 werkdagen na de verwachte dag 26 nov), overboeking nog steeds niet gezien: melding "nog niet binnen"', async ({ page }) => {
    await S.boot(page, { dag: '2026-12-01' });
    const r = await page.evaluate(({ BET }) => {
      const o = overboekVerwacht().find((x) => x.naar === BET), N = scoreNotifs().find((x) => String(x.key).startsWith('overboek-laat-' + BET));
      const T = salTekortData().find((x) => x.acc === BET);
      return { dag: o.dag, laat: o.laat, telDag: o.telDag, melding: N ? N.l1 : null, krap: !!T, kaart: salKrapKaart() };
    }, A);
    expect(r.dag).toBe('2026-11-26');
    expect(r.laat).toBe(true);
    expect(r.telDag).toBe(null);
    expect(r.melding).toBe('Betaalrekening: je overboeking van €1.600 is nog niet binnen');
    expect(r.krap).toBe(true);
    expect(r.kaart).toContain('je overboeking van €1.600 is nog niet binnen');
    // 29 nov (zondag, 3 kalenderdagen) en 30 nov (2 werkdagen) is hij nog verwacht
    for (const d of ['2026-11-29', '2026-11-30']) {
      await S.boot(page, { dag: d });
      const x = await page.evaluate(({ BET }) => { const o = overboekVerwacht().find((y) => y.naar === BET); const N = scoreNotifs().some((y) => String(y.key).startsWith('overboek-laat-' + BET)); return [o.laat, N]; }, A);
      expect([d, x]).toEqual([d, [false, false]]);
    }
  });

  test('i: salaris op vrijdag: de weekenddagen tellen niet als werkdag', async ({ page }) => {
    // zelfde dag: verwacht vrijdag 27 nov, "nog niet binnen" pas woensdag 2 dec (ma, di, wo); met kalenderdagen was dat maandag 30 nov
    const laat = async (dag, keuze) => { await S.boot(page, { salDag: '2026-11-27', dag, overboekDag: keuze ? { [S.BET]: keuze } : undefined });
      return page.evaluate(({ BET }) => { const o = overboekVerwacht().find((y) => y.naar === BET); return [o.sal, o.dag, o.laat]; }, A); };
    expect(await laat('2026-11-30', 'zelfde')).toEqual(['2026-11-27', '2026-11-27', false]);
    expect(await laat('2026-12-01', 'zelfde')).toEqual(['2026-11-27', '2026-11-27', false]);
    expect(await laat('2026-12-02', 'zelfde')).toEqual(['2026-11-27', '2026-11-27', true]);
    // dag erna: verwacht maandag 30 nov, "nog niet binnen" donderdag 3 dec
    expect(await laat('2026-12-02')).toEqual(['2026-11-27', '2026-11-30', false]);
    expect(await laat('2026-12-03')).toEqual(['2026-11-27', '2026-11-30', true]);
  });

  test('j: 25 en 26 dec tellen niet als werkdag', async ({ page }) => {
    // salaris donderdag 24 dec. Dag erna: de eerste werkdag is maandag 28 dec (niet vrijdag 25 dec), "nog niet binnen" pas 31 dec.
    // Zelfde dag: verwacht 24 dec, "nog niet binnen" woensdag 30 dec (28, 29, 30); met kalenderdagen was dat zondag 27 dec.
    const lees = async (dag, keuze) => { await S.boot(page, { salDec: '2026-12-24', dag, overboekDag: keuze ? { [S.BET]: keuze } : undefined });
      return page.evaluate(({ BET }) => { const o = overboekVerwacht().find((y) => y.naar === BET); return [o.sal, o.dag, o.laat]; }, A); };
    expect(await lees('2026-12-29', 'zelfde')).toEqual(['2026-12-24', '2026-12-24', false]);
    expect(await lees('2026-12-30', 'zelfde')).toEqual(['2026-12-24', '2026-12-24', true]);
    expect(await lees('2026-12-30')).toEqual(['2026-12-24', '2026-12-28', false]);
    const r = await page.evaluate(() => ({ na: werkdagNa('2026-12-24'), plus: overboekLaatVanaf('2026-12-28'),
      vrij: ['2026-12-25', '2026-12-26', '2027-01-01', '2026-04-27', '2026-05-05', '2026-04-06', '2026-05-14', '2026-05-25', '2027-04-27', '2026-04-03', '2026-05-01'].filter((d) => isWerkdag(d)),   // v523c: Goede Vrijdag en 1 mei (TARGET) zijn ook vrij
      werk: ['2026-04-02', '2026-12-24', '2026-12-28', '2027-04-26'].filter((d) => !isWerkdag(d)) }));
    expect(r).toEqual({ na: '2026-12-28', plus: '2026-12-31', vrij: [], werk: [] });
  });

  test('d: de krap-zin noemt de eerste afschrijving die het tekort maakt, met datum', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(({ BET }) => {
      SET.salVerdeling.rek[BET] = 0; save(); window._rekV = null; window._salTek = null;
      const x = salTekortData().find((y) => y.acc === BET), k = salKrapKaart();
      const leeg = (k.match(/data-krapleeg>([\s\S]*?)<\/span><br>|data-krapleeg>([\s\S]*?)<span class="muted" data-krap/) || [])[0] || '';
      return { post: x.post, nul: x.nul, leeg };
    }, A);
    expect(r.post).not.toBe(null);
    expect(r.post.naam).not.toContain('Hiltermann');
    expect(r.post.datum).toBe(r.nul);
    expect(r.post.datum < '2026-12-12').toBe(true);
    expect(r.leeg).toContain('eerste afschrijving die het tekort maakt');
    expect(r.leeg).not.toContain('grootste post');
    expect(r.leeg).not.toContain('Hiltermann');
  });

  test('e: een post op 20 dec telt helemaal in 25 nov – 23 dec, een post op 30 dec in de periode erna', async ({ page }) => {
    await S.boot(page, { resDag: true });
    const r = await page.evaluate(() => { const P = rekVoorstel(); const R = Object.fromEntries(P.resRijen.map((x) => [x.id, [x.dag, x.periodes]]));
      return { start: P.start, eind: P.eind, R, dela: P.resRijen.find((x) => x.id === 'rdela') }; });
    expect([r.start, r.eind]).toEqual(['2026-11-25', '2026-12-23']);
    expect(r.R.rdag).toEqual(['2026-12-20', 1]);
    expect(r.R.rdag2).toEqual(['2026-12-30', 2]);
    // Dela: de dag van de laatste boeking (30 sep) in december, van de Betaalrekening betaald
    expect([r.dela.dag, r.dela.periodes, r.dela.betaaldVan]).toEqual(['2026-12-30', 2, S.BET]);
    const lijst = await page.evaluate(() => { openResPeriode(); return document.getElementById('resPeriode').innerText; });
    expect(lijst).toContain('betaald van: Betaalrekening');
    expect(lijst).toContain('20 dec 2026 · 1 periode');
  });

  test('f: krap en Tot je volgende salaris trekken de inleg (EUR 300) af op de dag van de inleg', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(({ BET }) => {
      const P = rekVoorstel(), bet = P.rekAlle.find((x) => x.acc === BET), D = totSalarisData(BET);
      const dagen = ['2026-11-26', '2026-11-27', '2026-11-28'].map((d) => bet.uitDagDelen(d).bel);
      window._totsal = BET; renderTotSalaris(); const el = document.querySelector('#sheet [data-totbel]');
      return { bel: D.bel, dagen, rij: el ? el.dataset.totbel : null, som: Math.round((D.saldoExact - D.vastExact - D.potExact - D.kasExact - D.belExact - D.overExact) * 100), eind: Math.round(D.eindExact * 100) };
    }, A);
    expect(r.dagen).toEqual([100, 100, 100]);
    expect(r.bel).toBe(300);
    expect(r.rij).toBe('30000');
    expect(r.som).toBe(r.eind);   // saldo − vast − potjes − contant − inleg − overboeking = de stand, in centen
  });

  test('g: setVersie toont v522b bij cache minder-v522b', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(async () => {
      const k = setVersieKies(['minder-v99', 'minder-v522', 'minder-v522b', 'minder-v521c', 'anders']);
      const oud = caches.keys.bind(caches); caches.keys = async () => ['minder-v522b', 'minder-v522'];
      setVersie(); await new Promise((r) => setTimeout(r, 50)); caches.keys = oud;
      return { k, v: window._setVersie };
    });
    expect(r.k).toBe('minder-v522b');
    expect(r.v).toBe('minder-v522b');
  });

  test('h: elk bedrag op Home, Inzichten, Grip, Plan en Vermogen buiten verdeling, krap en reserveringen is gelijk aan bc2bafd', async ({ page }) => {
    // v524: Plan is herzien (lagen-dashboard); de 'plan'-sleutel wordt na de back-upcontrole opnieuw vastgelegd (volgende ronde).
    // Hier sluit Plan via de lagen-invariant; de overige schermen blijven byte-gelijk aan bc2bafd.
    const { planLagenInvariant, PLAN_LAGEN_OK } = require('./plan-lagen-invariant');
    for (const [n, o] of [['nu', {}], ['gezien', { overboekGezien: true, dag: '2026-11-27' }], ['laat', { dag: '2026-11-29' }]]) {
      await S.boot(page, o);
      const u = await S.bedragen(page);
      for (const k of Object.keys(VOOR[n])) { if (k === 'plan') continue; expect([n, k, u[k]]).toEqual([n, k, VOOR[n][k]]); }
      expect([n, await planLagenInvariant(page)]).toEqual([n, PLAN_LAGEN_OK]);
    }
  });
});
