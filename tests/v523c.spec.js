/* v523c: een salaris dat VOOR de vaste salarisdag binnenkomt, blijft na die dag het salaris van de nieuwe periode.
   Stand: tests/v523-stand.js (GECONSTRUEERD), met het decembersalaris op ma 21 dec (de vaste dag is do 24 dec). De periode loopt van
   24 dec tot en met 24 jan (besluit 23 okt: de periode begint op de regel, niet bij binnenkomst). Test c vergelijkt met eb7932b
   (git show), dus de spec draait in een checkout met die commit. */
const { execSync } = require('child_process');
const { test, expect } = require('./klok');
const S = require('./v523-stand');
const A = { MAIN: S.MAIN, BET: S.BET, LEEF: S.LEEF, SPAAR: S.SPAAR };
const VOOR_HTML = (() => { try { return execSync('git show eb7932b:index.html', { cwd: __dirname + '/..', maxBuffer: 64 << 20 }).toString(); } catch (_) { return null; } })();

/* twee N26-overboekingen naar je spaarrekening, samen EUR 2.500, op 21 en 22 dec (direct na je salaris) */
async function spaarDec(page, dagen) {
  await page.evaluate(({ MAIN, SPAAR, dagen }) => {
    const add = (acc, d, a, n) => { const t = { id: 'v523c' + acc.slice(-4) + d + Math.round(Math.abs(a) * 100) + (a < 0 ? 'u' : 'i'), date: d, amount: a, acc, name: n, desc: 'OVERBOEKING ' + n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); OVR[t.id] = 'intern'; return t; };
    for (const [d, b] of dagen) { add(MAIN, d, -b, 'Eigen spaarrekening'); add(SPAAR, d, b, 'Van salarisrekening'); }
    TX.sort((a, b) => a.date.localeCompare(b.date)); save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._rekV = null; window._salTek = null;
  }, Object.assign({ dagen }, A));
}
const stand = (page) => page.evaluate(() => {
  const SP = salPeriode(), M = periodeMoment(), N = salNietBinnen(), P = periodeVan(vandaagYMD());
  return { werkelijk: SP.cur.werkelijk, binnen: SP.cur.binnen, start: SP.cur.start, eind: SP.cur.eind, laat: SP.laat, moment: M && M.soort, mStart: M && M.start, mEind: M && M.eind, nietBinnen: !!N, pStart: P.start, pEind: P.eind };
});

test.describe('v523c', () => {
  test('a: salaris ma 21 dec: op 22, 24 en 27 dec binnen, periode 24 dec – 24 jan, geen "nog niet binnen"', async ({ page }) => {
    const r = {};
    for (const dag of ['2026-12-22', '2026-12-24', '2026-12-27']) { await S.boot(page, { salDec: '2026-12-21', dag }); r[dag] = await stand(page);
      r[dag].scherm = await page.evaluate(() => { go('maand'); gripKiesTab('zien'); const z = document.getElementById('s-maand').innerText; go('dash'); renderDash(); return z + ' ' + document.getElementById('s-dash').innerText; }); }
    for (const dag of Object.keys(r)) {
      expect([dag, r[dag].werkelijk, r[dag].binnen, r[dag].nietBinnen, r[dag].laat]).toEqual([dag, '2026-12-21', true, false, false]);
      expect([dag, r[dag].mStart, r[dag].mEind]).toEqual([dag, '2026-12-24', '2027-01-24']);
      expect(r[dag].scherm).not.toContain('Salaris nog niet binnen');
    }
    expect(r['2026-12-22'].moment).toBe('vroeg');
    expect([r['2026-12-27'].pStart, r['2026-12-27'].pEind]).toEqual(['2026-12-24', '2027-01-24']);
  });

  test('b: N26-overboekingen op 21/22 dec (EUR 2.500) tellen in de periode van 24 dec, niet in die van 24 nov', async ({ page }) => {
    await S.boot(page, { salDec: '2026-12-21', dag: '2026-12-27' });
    const meet = () => page.evaluate(() => {
      const nov = periodeVan('2026-12-01'), dec = periodeVan('2026-12-27');
      return { opzij: opzijPeriode().netto, plan: opzijPlanO().netto, nov: opzijEenheid(nov).netto, dec: opzijEenheid(dec).netto, decGrip: gripSpaardoelEenheid(dec).netto, novStart: nov.start, decStart: dec.start };
    });
    const voor = await meet();
    await spaarDec(page, [['2026-12-21', 1500], ['2026-12-22', 1000]]);
    const na = await meet();
    expect([voor.novStart, voor.decStart]).toEqual(['2026-11-24', '2026-12-24']);
    expect(na.opzij - (voor.opzij || 0)).toBe(2500);
    expect(na.plan - (voor.plan || 0)).toBe(2500);
    expect(na.dec - (voor.dec || 0)).toBe(2500);
    expect(na.nov - (voor.nov || 0)).toBe(0);   // niet dubbel in de oude periode
  });

  test('c: salaris op de 24e zelf: alles gelijk aan eb7932b', async ({ browser }) => {
    test.skip(!VOOR_HTML, 'eb7932b niet beschikbaar');
    test.setTimeout(120000);
    const lees = async (html) => {
      const page = await browser.newPage();
      if (html) await page.route('**/index.html', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: html }));
      const out = {};
      for (const dag of ['2026-12-22', '2026-12-27']) {
        await S.boot(page, { salDec: '2026-12-24', dag });
        await spaarDec(page, [['2026-12-22', 400], ['2026-12-24', 2500]]);
        out[dag] = await page.evaluate(() => { const SP = salPeriode(), nov = periodeVan('2026-12-01'), dec = periodeVan('2026-12-24');
          return { cur: SP.cur, volg: SP.volg, opzij: opzijPeriode().netto, plan: opzijPlanO().netto, nov: opzijEenheid(nov), dec: opzijEenheid(dec), moment: periodeMoment(), ov: overboekVerwacht().map((o) => [o.naar, o.dag, o.laat]) }; });
        out[dag].bedragen = await S.bedragen(page, '[data-rekuitleg]');   // v525b: de rekensom in de Terugblik rekent voor de storting met het verwachte saldo (v525b.spec g)
        delete out[dag].bedragen.plan;   // v524: Plan is herzien (lagen-dashboard); de 'plan'-sleutel wordt na de back-upcontrole opnieuw vastgelegd (volgende ronde)
      }
      await page.close(); return out;
    };
    const oud = await lees(VOOR_HTML), nu = await lees(null);
    expect(JSON.stringify(nu)).toBe(JSON.stringify(oud));
    // Plan sluit via de lagen-invariant op de huidige app (eb7932b heeft geen lagen-hero, dus los getoetst)
    const { planLagenInvariant } = require('./plan-lagen-invariant');
    const p = await browser.newPage(); await S.boot(p, { salDec: '2026-12-24', dag: '2026-12-22' });
    expect(await planLagenInvariant(p)).toMatchObject({ ok: true }); await p.close();
  });

  test('d: salaris 21 dec, overboeking nog niet gezien: verwacht 22 dec, "nog niet binnen" pas op 28 dec', async ({ page }) => {
    const r = {};
    for (const dag of ['2026-12-23', '2026-12-27', '2026-12-28']) { await S.boot(page, { salDec: '2026-12-21', dag });
      r[dag] = await page.evaluate(({ BET }) => { const o = overboekVerwacht().find((x) => x.naar === BET); return o ? [o.dag, o.laat] : null; }, A); }
    expect(r['2026-12-23']).toEqual(['2026-12-22', false]);
    expect(r['2026-12-27']).toEqual(['2026-12-22', false]);
    expect(r['2026-12-28']).toEqual(['2026-12-22', true]);
  });

  test('e: Goede Vrijdag en 1 mei zijn geen werkdag (TARGET), naast de Algemene termijnenwet', async ({ page }) => {
    await S.boot(page);
    const r = await page.evaluate(() => ({ gv26: isWerkdag('2026-04-03'), mei26: isWerkdag('2026-05-01'), gv27: isWerkdag('2027-03-26'), na: werkdagNa('2026-04-02'), mei: werkdagNa('2026-04-30'), do: isWerkdag('2026-04-02'), kerst: isWerkdag('2026-12-25'), konings: isWerkdag('2026-04-27') }));
    expect(r).toEqual({ gv26: false, mei26: false, gv27: false, na: '2026-04-07', mei: '2026-05-04', do: true, kerst: false, konings: false });
  });
  /* v523c (aanvulling): de verwachte overboeking telt de SOM van de bijschrijvingen van eigen rekeningen sinds de salarisstorting, en samen
     nooit meer dan het saldo van de salarisrekening min de afgesproken rest. Stand naar de meting van de gebruiker op 26 nov (back-up van
     25 nov): afspraak Betaalrekening EUR 1.750 en Leefgeld EUR 1.700, opzij EUR 1.766, rest op de salarisrekening EUR 0 (5.216 verdeeld). */
  const zet = (page, o) => page.evaluate(({ MAIN, BET, LEEF, SPAAR, o }) => {
    const add = (acc, d, a, n, cat) => { const t = { id: 'v523ck' + acc.slice(-4) + d + n.replace(/\W/g, '') + Math.round(Math.abs(a) * 100), date: d, amount: a, acc, name: n, desc: 'OVERBOEKING ' + n, typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); if (cat) OVR[t.id] = cat; return t; };
    const paar = (naar, d, b, n) => { add(MAIN, d, -b, 'Naar ' + n); add(naar, d, b, n); };
    SET.salVerdeling = Object.assign({}, SET.salVerdeling, { rek: { [MAIN]: 0, [BET]: 1750, [LEEF]: 1700 }, opzij: 1766 });
    for (const x of (o.in || [])) { if (x.paar) paar(x.acc, x.d, x.b, x.n); else add(x.acc, x.d, x.b, x.n, 'intern'); }
    if (o.main != null) SET.manualBal = Object.assign({}, SET.manualBal, { [MAIN]: o.main });
    /* zoals bij de gebruiker: de salarisrekening is een doorgeefrekening, de uitgaven gaan van de Betaalrekening */
    if (o.mainDoor) for (const t of TX) if (t.acc === MAIN && t.amount < 0 && catOf(t) !== 'intern' && !String(t.id).startsWith('v523ck')) t.acc = BET;
    TX.sort((a, b) => a.date.localeCompare(b.date)); save(); try { buildAccMeta(); } catch (_) {} try { runMemoVergeten(); } catch (_) {} window._rekV = null; window._salTek = null;
  }, Object.assign({ o }, A));
  const ov = (page) => page.evaluate(() => { const L = overboekVerwacht(); const T = salTekortData();
    return { L: L.map((o) => ({ naar: o.naar, bedrag: o.bedrag, binnen: o.binnen, nog: o.nog, gezien: o.gezien, laat: o.laat })), som: L.reduce((a, o) => a + (o.nog || 0), 0), krap: T.map((x) => x.acc), kaart: salKrapKaart() }; });

  test('k: de stand van de gebruiker (Betaalrekening 1.500 van 1.750, Leefgeld 1.500 + 220 van 1.700, salarisrekening EUR 11): geen krap-melding', async ({ page }) => {
    await S.boot(page, { dag: '2026-11-26' });
    await zet(page, { main: 11, mainDoor: true, in: [
      { acc: S.BET, d: '2026-11-25', b: 1500, n: 'Betaalrekening', paar: true },
      { acc: S.LEEF, d: '2026-11-25', b: 1500, n: 'Income Sorter' },
      { acc: S.LEEF, d: '2026-11-26', b: 220, n: 'From Main to Leefgeld' },
      { acc: S.SPAAR, d: '2026-11-25', b: 1766, n: 'Spaarrekening', paar: true }] });
    const r = await ov(page);
    const bet = r.L.find((x) => x.naar === S.BET), leef = r.L.find((x) => x.naar === S.LEEF);
    expect([bet.binnen, leef.binnen, leef.gezien]).toEqual([1500, 1720, true]);
    expect(r.som).toBeLessThanOrEqual(11);
    expect(r.krap).not.toContain(S.MAIN);
    // geen regel in de melding dat de volle afspraak nog moet komen; wat er nog verwacht wordt is hoogstens het saldo van de salarisrekening
    expect(r.kaart).not.toContain('verwacht: je overboeking van €1.750');
    expect(r.kaart).not.toContain('je overboeking van €1.700');
    expect(r.kaart).not.toContain('data-krapnietbinnen');
    const ns = [...r.kaart.matchAll(/data-krapverwacht="(\d+)"/g)].map((m) => +m[1]);
    expect(ns.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(11);
  });

  test('l: twee delen die samen de afspraak halen: niets meer verwacht', async ({ page }) => {
    await S.boot(page, { dag: '2026-11-27' });
    await zet(page, { in: [{ acc: S.LEEF, d: '2026-11-25', b: 1500, n: 'Income Sorter' }, { acc: S.LEEF, d: '2026-11-26', b: 220, n: 'From Main to Leefgeld' }] });
    const r = await ov(page), leef = r.L.find((x) => x.naar === S.LEEF);
    expect(await page.evaluate(() => accBalance(SET.salVerdeling.salAcc))).toBe(6000);   // ruim genoeg: de grens speelt hier geen rol
    expect([leef.binnen, leef.nog, leef.gezien]).toEqual([1720, 0, true]);
  });

  test('m: salarisrekening EUR 11, afspraak nog helemaal open: samen hoogstens EUR 11 verwacht', async ({ page }) => {
    await S.boot(page, { dag: '2026-11-26' });
    await zet(page, { main: 11 });
    const r = await ov(page);
    expect(r.L.every((x) => x.binnen === 0)).toBe(true);
    expect(r.som).toBeGreaterThan(0);
    expect(r.som).toBeLessThanOrEqual(11);
    // naar rato: Betaalrekening 1.750 / Leefgeld 1.700 / opzij 1.766 van 5.216
    const bet = r.L.find((x) => x.naar === S.BET);
    expect(Math.abs(bet.nog - 11 * 1750 / 5216)).toBeLessThan(0.02);
  });
});
