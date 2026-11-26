/* v525: salarisverdeling · een oordeel, wat er echt binnenkwam, en het salaris van nu eerst.
   Stand: tests/v523-stand.js (GECONSTRUEERD naar de melding; de boekingen van het toestel staan alleen daar). Het salaris van november kwam
   op wo 25 nov, de afspraak (SET.salVerdeling) is Salarisrekening EUR 150, Betaalrekening EUR 1.600, Leefgeld EUR 1.700, opzij EUR 1.766,
   reserveringen EUR 0. Test f vergelijkt met de vorige main (d8c90b9, git show), dus de spec draait in een checkout met die commit. */
const { execSync } = require('child_process');
const { test, expect } = require('./klok');
const S = require('./v523-stand');
const A = { MAIN: S.MAIN, BET: S.BET, LEEF: S.LEEF, SPAAR: S.SPAAR, RES: S.RES };
const MAIN_HTML = (() => { try { return execSync('git show d8c90b9:index.html', { cwd: __dirname + '/..', maxBuffer: 64 << 20 }).toString(); } catch (_) { return null; } })();

/* boekingen erbij (gepaard: de afschrijving op de salarisrekening en de bijschrijving op de doelrekening), plus eventueel een afspraak en een
   bevestigde periode */
const zet = (page, o) => page.evaluate(({ A, o }) => {
  const { MAIN } = A;
  const add = (acc, d, a, n) => { const t = { id: 'v525' + acc.slice(-4) + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: 'OVERBOEKING ' + n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'intern'; return t; };
  for (const x of (o.in || [])) { add(MAIN, x.d, -x.b, 'Naar ' + x.n); add(A[x.acc], x.d, x.b, x.n); }
  if (o.rek) SET.salVerdeling = Object.assign({}, SET.salVerdeling, { rek: Object.fromEntries(Object.entries(o.rek).map(([k, v]) => [A[k], v])) });
  if (o.opzij != null) SET.salVerdeling.opzij = o.opzij;
  if (o.main != null) SET.manualBal = Object.assign({}, SET.manualBal, { [MAIN]: o.main });
  if (o.bevestig) { SET.periodeBevestigd = Object.assign({}, SET.periodeBevestigd, { [o.bevestig]: { op: vandaagYMD() } }); }
  TX.sort((a, b) => a.date.localeCompare(b.date)); save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._rekV = null; window._salTek = null; window._salk = {};
}, { A, o });
const zien = (page) => page.evaluate(() => { go('maand'); gripKiesTab('zien');
  const k = document.getElementById('salVoorstelKaart'), m = document.querySelector('[data-salvmelding]'), v = document.querySelector('[data-salvvolgend]');
  return { K: salKaartStand(), kaart: k ? { start: k.dataset.salvoorstel, t: k.innerText, oordeel: k.querySelector('[data-salvoordeel]').innerText,
      rijen: [...k.querySelectorAll('[data-salvrekrij]')].map((e) => ({ k: e.dataset.salvrekrij, erbij: +e.dataset.erbij, ov: e.dataset.overboeking, verschil: e.dataset.verschil, st: e.dataset.st })),
      detail: k.querySelectorAll('[data-salvrekensom]').length } : null,
    melding: m ? { t: m.innerText, ym: m.dataset.salym, werkelijk: m.dataset.salwerkelijk, rijen: [...m.querySelectorAll('[data-salvbinnen]')].map((e) => ({ k: e.dataset.salvbinnen, binnen: e.dataset.binnen, afspraak: e.dataset.afspraak, grijs: !!e.querySelector('[data-salvbinnenafspraak]') })) } : null,
    volgend: v ? { t: v.innerText, datum: v.dataset.salvvolgend } : null }; });
/* de stand van 18 dec: dit salaris (25 nov) is afgehandeld (bevestigd, alles binnen), dus de kaart gaat over het salaris van do 24 dec */
const klaar = (o) => Object.assign({ bevestig: '2026-11', in: [{ acc: 'BET', d: '2026-11-25', b: (o && o.bet) || 1600, n: 'Betaalrekening' }, { acc: 'LEEF', d: '2026-11-25', b: 1700, n: 'Leefgeld' }, { acc: 'SPAAR', d: '2026-11-25', b: (o && o.spaar) || 1766, n: 'Spaarrekening' }] }, o || {});

test.describe('v525', () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 390, height: 844 }); });

  test('a: het oordeel noemt de rekeningen die te weinig krijgen, tegen je afspraak (Betaalrekening en Reserveringen)', async ({ page }) => {
    await S.boot(page, { dag: '2026-12-18' });
    await zet(page, klaar({ bet: 500, rek: { MAIN: 150, BET: 500, LEEF: 1700 } }));   // je N26-regel naar de Betaalrekening is EUR 500
    const r = await zien(page);
    expect(r.K.soort).toBe('volgend');
    expect(r.kaart.start).toBe('2026-12-24');
    const bet = r.kaart.rijen.find((x) => x.k === S.BET), res = r.kaart.rijen.find((x) => x.k === '__res'), leef = r.kaart.rijen.find((x) => x.k === S.LEEF);
    expect([bet.ov, bet.st]).toEqual(['500', 'tekort']);
    expect(+bet.verschil).toBe(500 - bet.erbij);
    expect([res.ov, res.st]).toEqual(['0', 'tekort']); expect(+res.verschil).toBe(-res.erbij); expect(res.erbij).toBeGreaterThan(0);
    expect(leef.st).toBe('ok');
    const eu = (v) => '€' + Math.abs(v).toLocaleString('nl-NL');
    expect(r.kaart.oordeel).toContain(`Betaalrekening ${eu(+bet.verschil)}`);
    expect(r.kaart.oordeel).toContain(`Reserveringen ${eu(+res.verschil)}`);
    expect(r.kaart.oordeel).not.toContain('Leefgeld');
    expect(r.kaart.oordeel).toContain('De rest is gedekt');
    /* invoer: het voorstel zelf dekt Betaalrekening wel, dus een oordeel tegen het voorstel zou hier "gedekt" zeggen */
    const vs = await page.evaluate(({ BET }) => salVoorstelNu().bed[BET], A);
    expect(vs).toBeGreaterThan(500 + 10);
  });

  test('b: een rij per rekening, de rekensom pas na een tik', async ({ page }) => {
    await S.boot(page, { dag: '2026-12-18' });
    await zet(page, klaar());
    let r = await zien(page);
    await page.evaluate(() => closeSheet());   // de krap-pop-up van de boot ligt anders over de kaart
    expect(r.kaart.rijen.map((x) => x.k)).toEqual(expect.arrayContaining([S.MAIN, S.BET, S.LEEF, '__res']));
    expect(new Set(r.kaart.rijen.map((x) => x.k)).size).toBe(r.kaart.rijen.length);
    expect(r.kaart.detail).toBe(0);
    await page.locator(`#salVoorstelKaart [data-salvrekrij="${S.BET}"]`).click();
    await expect(page.locator('#salVoorstelKaart [data-salvrekensom]')).toHaveCount(1);
    const som = page.locator(`#salVoorstelKaart [data-salvrekensom="${S.BET}"]`);
    await expect(som).toContainText('Vaste lasten tot 24 jan'); await expect(som).toContainText('Beleggen: Saxo'); await expect(som).toContainText('Potjes via deze rekening');
    await expect(som).toContainText('Buffer'); await expect(som).toContainText('Staat er nu'); await expect(som).toContainText('Erbij nodig');
    /* de rekensom sluit: de regels tot "Nodig tot" tellen op, en nodig − staat er nu = erbij nodig */
    const n = await som.evaluate((el) => { const v = (k) => [...el.querySelectorAll(`[data-sd="${k}"]`)].map((x) => +x.lastElementChild.textContent.replace(/[^\d−-]/g, '').replace('−', '-') || 0);
      const s = (k) => v(k).reduce((a, b) => a + b, 0); return { delen: s('vast') + s('beleg') + s('pot') + s('buffer') + s('afronding'), nodig: s('nodig'), saldo: s('saldo'), erbij: s('erbij') }; });
    expect(n.delen).toBe(n.nodig);
    await page.locator(`#salVoorstelKaart [data-salvrekrij="${S.BET}"]`).click();
    await expect(page.locator('#salVoorstelKaart [data-salvrekensom]')).toHaveCount(0);
  });

  test('c: geen correctie "−€", geen pijl oud → nieuw, geen "Voorstel klaar" en geen regel over tekort-waarschuwingen', async ({ page }) => {
    for (const dag of ['2026-12-18', '2026-11-25']) {
      await S.boot(page, { dag });
      if (dag === '2026-12-18') await zet(page, klaar({ bet: 1450, spaar: 2000, rek: { MAIN: 100, BET: 1450, LEEF: 1700 }, opzij: 2000 }));
      else await page.evaluate(() => { SET.salVerdeling.salYM = '2026-10'; SET.salVerdeling.start = '2026-10-24'; save(); window._rekV = null; window._salTek = null; });
      const r = await zien(page);
      expect(r.kaart, dag).not.toBeNull();
      expect(r.kaart.t).not.toMatch(/volgens je verdeling/i);
      expect(r.kaart.t).not.toContain('→');
      expect(r.kaart.t).not.toMatch(/Voorstel klaar/);
      expect(r.kaart.t).not.toMatch(/tekort-waarschuwingen/);
      expect(r.kaart.t).not.toMatch(/· [−-]€\d/);
    }
  });

  test('d: "Salaris binnen" toont wat er binnenkwam (1.500 / 1.720 / 11 / opzij 2.500), met de afspraak grijs alleen als die minstens EUR 10 afwijkt', async ({ page }) => {
    await S.boot(page, { dag: '2026-11-26' });
    await zet(page, { main: 11, rek: { MAIN: 0, BET: 1750, LEEF: 1715 }, in: [{ acc: 'BET', d: '2026-11-25', b: 1500, n: 'Betaalrekening' }, { acc: 'LEEF', d: '2026-11-25', b: 1500, n: 'Income Sorter' }, { acc: 'LEEF', d: '2026-11-26', b: 220, n: 'From Main to Leefgeld' }, { acc: 'SPAAR', d: '2026-11-25', b: 2500, n: 'Spaarrekening' }] });
    const r = await zien(page);
    expect(r.K.soort).toBe('dit');
    const rij = (k) => r.melding.rijen.find((x) => x.k === k);
    expect([rij(S.BET).binnen, rij(S.LEEF).binnen, rij(S.MAIN).binnen, rij('__opzij').binnen]).toEqual(['1500', '1720', '11', '2500']);
    expect([rij(S.BET).grijs, rij(S.LEEF).grijs, rij(S.MAIN).grijs, rij('__opzij').grijs]).toEqual([true, false, true, true]);   // Leefgeld 1.720 tegen 1.715: geen afspraak erachter
    expect(r.melding.t).toContain('afspraak €1.750'); expect(r.melding.t).toContain('afspraak €1.766');
    expect(r.melding.t).not.toMatch(/Salaris binnen: /);
    expect(r.melding.t).toContain('Minder verplaatst niets');
  });

  test('e: salaris ma 21 dec: op 22 en 24 dec over dat salaris; pas na bevestigen en niets meer verwacht over het volgende, en dat pas 5 werkdagen voor ma 25 jan', async ({ page }) => {
    const dec = (o) => Object.assign({ in: [{ acc: 'BET', d: '2026-12-22', b: 1600, n: 'Betaalrekening' }, { acc: 'LEEF', d: '2026-12-22', b: 1700, n: 'Leefgeld' }, { acc: 'SPAAR', d: '2026-12-22', b: 1766, n: 'Spaarrekening' }] }, o || {});
    const r = {};
    for (const dag of ['2026-12-22', '2026-12-24']) { await S.boot(page, { salDec: '2026-12-21', dag }); r[dag] = await zien(page); }
    for (const dag of ['2026-12-22', '2026-12-24']) {
      expect([dag, r[dag].K.soort, r[dag].K.werkelijk]).toEqual([dag, 'dit', '2026-12-21']);
      expect([dag, r[dag].melding && r[dag].melding.werkelijk]).toEqual([dag, '2026-12-21']);
      expect(r[dag].kaart, dag).toBeNull();                       // geen "Voorstel klaar voor ma 25 jan"
      expect(r[dag].volgend, dag).toBeNull();
    }
    /* alles binnen, nog niet bevestigd: nog steeds dit salaris */
    await S.boot(page, { salDec: '2026-12-21', dag: '2026-12-24' }); await zet(page, dec());
    expect((await zien(page)).K).toMatchObject({ soort: 'dit', nog: 0, bevestigd: false });
    /* bevestigd, maar de overboeking naar de Betaalrekening is er nog niet: nog steeds dit salaris */
    await S.boot(page, { salDec: '2026-12-21', dag: '2026-12-24' }); await zet(page, { bevestig: '2026-12', in: dec().in.slice(1) });
    expect((await zien(page)).K).toMatchObject({ soort: 'dit', bevestigd: true });
    /* bevestigd en alles binnen: het volgende salaris, nu nog een rustige regel */
    const na = {};
    for (const dag of ['2026-12-24', '2027-01-15', '2027-01-18', '2027-01-22']) { await S.boot(page, { salDec: '2026-12-21', dag }); await zet(page, dec({ bevestig: '2026-12' })); na[dag] = await zien(page); }
    for (const dag of ['2026-12-24', '2027-01-15']) {
      expect([dag, na[dag].K.soort, na[dag].K.datum]).toEqual([dag, 'rust', '2027-01-25']);
      expect([dag, na[dag].kaart, na[dag].melding]).toEqual([dag, null, null]);
      expect(na[dag].volgend.t).toBe('Volgend salaris rond ma 25 jan');
    }
    for (const dag of ['2027-01-18', '2027-01-22']) {                // ma 18 jan = 5 werkdagen voor ma 25 jan
      expect([dag, na[dag].K.soort]).toEqual([dag, 'volgend']);
      expect([dag, na[dag].kaart && na[dag].kaart.start]).toEqual([dag, '2027-01-25']);
      expect([dag, na[dag].volgend]).toEqual([dag, null]);
    }
  });

  test('f: elk bedrag buiten de vorm is gelijk aan de vorige main (d8c90b9) op dezelfde stand', async ({ browser }) => {
    test.skip(!MAIN_HTML, 'd8c90b9 niet beschikbaar');
    test.setTimeout(180000);
    const lees = async (html) => {
      const page = await browser.newPage();
      if (html) await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
      const out = {};
      for (const [dag, o] of [['2026-11-26', {}], ['2026-12-18', klaar()], ['2026-12-22', null]]) {
        await S.boot(page, o === null ? { salDec: '2026-12-21', dag } : { dag });
        if (o && Object.keys(o).length) await zet(page, o);
        out[dag] = await page.evaluate(() => { const P = rekVoorstel(), SP = salPeriode();
          return { P: P.ok ? { start: P.start, eind: P.eind, salaris: P.salaris, opzij: P.opzij, res: P.reserveringen, rek: P.rek.map((r) => [r.acc, Math.round(r.laten), Math.round(r.buffer), Math.round(r.verwacht)]) } : null,
            N: (() => { const N = salVoorstelNu(); return N ? [N.opzij, N.bed] : null; })(), ov: overboekVerwacht().map((o) => [o.naar, o.bedrag, o.binnen, Math.round(o.nog * 100), o.dag, o.laat]),
            krap: salTekortData().map((x) => JSON.stringify(x).replace(/"[a-z]*[Hh]tml?":"[^"]*"/g, '')), opzij: opzijPeriode().netto, cur: [SP.cur.start, SP.cur.eind, SP.cur.werkelijk] }; });
        out[dag].bedragen = await S.bedragen(page);
      }
      await page.close(); return out;
    };
    const oud = await lees(MAIN_HTML), nu = await lees(null);
    for (const dag of Object.keys(oud)) for (const k of Object.keys(oud[dag])) expect(JSON.stringify(nu[dag][k]), `${dag} ${k}`).toBe(JSON.stringify(oud[dag][k]));
  });
});
