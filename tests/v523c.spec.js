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
        out[dag].bedragen = await S.bedragen(page);
      }
      await page.close(); return out;
    };
    const oud = await lees(VOOR_HTML), nu = await lees(null);
    expect(JSON.stringify(nu)).toBe(JSON.stringify(oud));
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
});
