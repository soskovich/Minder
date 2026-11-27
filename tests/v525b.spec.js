/* v525b: "erbij nodig" voor de storting tegen het verwachte saldo op de dag voor de verwachte storting, en de sheet in de rij-vorm van de kaart.
   Stand: tests/v523-stand.js (GECONSTRUEERD). Op 22 dec (salaris ma 21 dec binnen) gaat het voorstel over het salaris van ma 25 jan; tot 24 jan
   gaat er van elke rekening nog geld af, dus verwacht saldo en saldo nu verschillen. Op 25 nov (de stortingsdag) blijft het saldo van nu. */
const { test, expect } = require('./klok');
const S = require('./v523-stand');
const A = { MAIN: S.MAIN, BET: S.BET, LEEF: S.LEEF, SPAAR: S.SPAAR };

const rijen = (page) => page.evaluate(() => { const P = rekVoorstel(), D = salKaartData(P);
  return { nu: P.nu, start: P.start, rek: P.rek.map((r) => ({ acc: r.acc, laten: Math.round(r.laten), saldo: Math.round(accBalance(r.acc)), verwacht: r.verwachtSaldo == null ? null : Math.round(r.verwachtSaldo) })),
    D: D.rijen.filter((x) => x.k !== '__res').map((x) => ({ k: x.k, nodig: x.nodig, saldo: x.saldo, verwacht: x.verwacht, basis: x.basis, erbijRuw: x.erbijRuw, erbij: x.erbij })),
    U: P.rek.map((r) => { const U = rekUitlegRij(P, r, null); return { acc: r.acc, basis: U.basis, verwacht: U.verwacht, daling: U.daling, erbij: U.erbij, tekst: U.tekst }; }),
    opzij: [Math.round(P.opzij), salVoorstelNu().opzij] }; });

test.describe('v525b', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('g: voor de storting is erbij nodig = laten staan − het verwachte saldo op de dag voor de storting, niet − saldo nu', async ({ page }) => {
    await S.boot(page, { salDec: '2026-12-21', dag: '2026-12-22' });
    const r = await rijen(page);
    expect(r.nu).toBe(false);
    // invoermeting: er gaat tot de storting werkelijk iets af, anders is verwacht niet van nu te onderscheiden
    expect(r.rek.some((x) => x.verwacht != null && x.verwacht !== x.saldo)).toBe(true);
    for (const x of r.D) { const R = r.rek.find((y) => y.acc === x.k);
      expect(x.basis, x.k).toBe('verwacht'); expect(x.verwacht, x.k).toBe(R.verwacht);
      expect(x.erbijRuw, x.k).toBe(R.laten - R.verwacht); expect(x.erbij, x.k).toBe(Math.max(R.laten - R.verwacht, 0)); }
    // de Betaalrekening van deze stand: nodig 950, saldo nu 237, verwacht op 24 jan −760, dus 1.710 erbij (tegen 713 met saldo nu)
    const bet = r.D.find((x) => x.k === S.BET);
    expect([bet.nodig, bet.saldo, bet.verwacht, bet.erbijRuw]).toEqual([950, 237, -760, 1710]);
    // de rekensom telt op: saldo nu − daling = verwacht, en de tekst noemt beide
    for (const u of r.U) { const R = r.rek.find((y) => y.acc === u.acc); expect(R.saldo - u.daling, u.acc).toBe(u.verwacht); }
    const ub = r.U.find((u) => u.acc === S.BET);
    expect(ub.tekst).toContain('− verwacht saldo op 24 jan −€760 (saldo nu €237, tot dan gaat er €997 af) = €1.710 erbij');
    // de rekensom achter de tik draagt de daling als eigen regel
    const som = await page.evaluate(({ BET }) => { window._salk = { [BET]: true }; const P = rekVoorstel(); const D = salKaartData(P); const x = D.rijen.find((y) => y.k === BET);
      const d = document.createElement('div'); d.innerHTML = x.detail; const v = (k) => (d.querySelector(`[data-sd="${k}"]`) || {}).textContent || ''; return { saldo: v('saldo'), daling: v('daling'), erbij: v('erbij') }; }, A);
    expect(som.saldo).toContain('−€237'); expect(som.daling).toContain('+€997'); expect(som.erbij).toContain('€1.710');
  });

  test('g2: op de dag van de storting en daarna blijft het het saldo van nu', async ({ page }) => {
    await S.boot(page);   // 25 nov, salaris 25 nov binnen: rekVoorstel rekent de lopende periode (P.nu)
    const r = await rijen(page);
    expect(r.nu).toBe(true);
    for (const x of r.D) { const R = r.rek.find((y) => y.acc === x.k); expect(x.basis, x.k).toBe('nu'); expect(x.erbijRuw, x.k).toBe(R.laten - R.saldo); }
    for (const u of r.U) expect(u.tekst).toContain('− saldo nu');
  });

  test('g3: het voorstel en opzij veranderen niet: die rekenen met laten staan, niet met het saldo', async ({ page }) => {
    await S.boot(page, { salDec: '2026-12-21', dag: '2026-12-22' });
    const r = await rijen(page);
    const som = r.rek.reduce((a, x) => a + x.laten, 0);
    const P = await page.evaluate(() => { const P = rekVoorstel(); return [Math.round(P.salaris), Math.round(P.reserveringen || 0)]; });
    expect(r.opzij[1]).toBe(P[0] - som - P[1]);
  });

  test('h: de sheet "Zo verdeel je je salaris" toont de rij-vorm van de kaart, niet de pijlen oud → nieuw', async ({ page }) => {
    await S.boot(page, { dag: '2026-12-18' });
    const r = await page.evaluate(({ MAIN, BET, LEEF, SPAAR }) => {
      /* de stand van v525 test a: het salaris van 25 nov is afgehandeld (bevestigd, alles binnen), dus Zien toont de kaart over 24 dec */
      const add = (acc, d, a, n) => { const t = { id: 'v525b' + acc.slice(-4) + d + Math.round(Math.abs(a)), date: d, amount: a, acc, name: n, desc: 'OVERBOEKING ' + n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'intern'; };
      for (const [acc, b] of [[BET, 1600], [LEEF, 1700], [SPAAR, 1766]]) { add(MAIN, '2026-11-25', -b, 'Naar'); add(acc, '2026-11-25', b, 'Van'); }
      SET.periodeBevestigd = { '2026-11': { op: '2026-11-26' } }; save(); buildAccMeta(); runMemoVergeten(); window._rekV = null; window._salTek = null; window._salk = {};
      const SV = SET.salVerdeling;
      go('maand'); gripKiesTab('zien'); closeSheet();
      const kaart = [...document.querySelectorAll('#salVoorstelKaart [data-salvrekrij]')].map((e) => [e.dataset.salvrekrij, e.dataset.erbij, e.dataset.overboeking, e.dataset.verschil, e.dataset.st]);
      // de sheet met precies de bedragen van je afspraak: dan horen kaart en sheet hetzelfde te tonen
      const eigen = Object.assign({}, SV.rek); openSalVerdeling('salverdeling', eigen); window._salv.eigenOpzij = SV.opzij; window._salv.eigenRes = SV.reserveringen || 0; renderSalVerdeling();
      const sh = document.getElementById('salVerdeling');
      const sheet = [...sh.querySelectorAll('[data-salvsheetrij]')].map((e) => [e.dataset.salvsheetrij, e.dataset.erbij, e.dataset.overboeking, e.dataset.verschil, e.dataset.st]);
      const voor = sh.querySelector('[data-salvsheetrij="' + BET + '"]').dataset.overboeking;
      // live: een ander bedrag in het veld verandert de rij
      salVerdelingVeld(BET, '100'); const na = sh.querySelector('[data-salvsheetrij="' + BET + '"]');
      // een tik opent de rekensom
      salSheetTik(BET); const det = !!document.querySelector('#salVerdeling [data-salvsheetdetail="' + BET + '"] [data-salvrekensom]');
      return { kaart, sheet, pijl: /→/.test((sh.querySelector('[data-voet]') || {}).textContent || ''), route: !!sh.querySelector('[data-salvroute]'), oud: !!sh.querySelector('[data-salvoudnieuw],[data-salvoudnieuwblok]'), voor, na: [na.dataset.overboeking, na.dataset.st], det,
        oordeel: (sh.querySelector('[data-salvsheetoordeel]') || {}).textContent || '', kaartOordeel: (document.querySelector('#salVoorstelKaart [data-salvoordeel]') || {}).textContent || '' }; }, A);
    expect(r.kaart.length).toBeGreaterThan(0);
    expect(r.sheet).toEqual(r.kaart);
    expect(r.pijl).toBe(false); expect(r.oud).toBe(false);   // de route van het salaris (v441, data-salvroute) blijft; die is geen oud → nieuw
    expect(r.route).toBe(true);
    expect(r.voor).toBe('1600'); expect(r.na).toEqual(['100', 'tekort']);
    expect(r.det).toBe(true);
    expect(r.oordeel).toContain('Betaalrekening');
  });
});
