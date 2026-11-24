/* v521b: de salarisverdeling rekent met je INGESTELDE inleg (a.per), telt een bezitting zonder gekoppelde boeking pas mee als jij een
   rekening en een startmaand kiest (tot dan de regel "Niet meegeteld"), en de opbouw noemt elke bezitting apart. Stand:
   tests/v521a-stand.js met { gebruiker: true } (24 nov, de getallen van de export, GECONSTRUEERD). */
const { test, expect } = require('./klok');
const B = require('./v521a-stand');

const lees = (page) => page.evaluate((BET) => {
  window._rekV = null; try { runMemoVergeten(); } catch (_) {}
  const P = rekVoorstel(), bet = P.rek.find((x) => x.acc === BET);
  return { beleg: P.beleg.map((x) => [x.id, x.acc, x.totaal, x.data]), belS: bet.belS, opzij: P.opzij, tekst: rekUitlegRij(P, bet, null).tekst,
    niet: rekBelegNiet().map((x) => [x.id, x.bedrag]), reis: SET.assets.map((a) => [a.id, bezitReisPer(a)]), BR: P.BR, salAcc: P.salAcc };
}, B.BET);

test.describe('v521b', () => {
  test('g: de Betaalrekening draagt beleggen EUR 200 (het ingestelde bedrag), niet 33 + 75', async ({ page }) => {
    await B.boot(page, { gebruiker: true });
    const r = await lees(page);
    expect(r.reis).toEqual([['saxo', 33], ['kayani', 75], ['pens', 200]]);   // de invoer: het gemeten gemiddelde wijkt echt af
    expect(r.beleg).toEqual([['saxo', B.BET, 100, ['2026-12-10']], ['kayani', B.BET, 100, ['2026-11-28']]]);
    expect(r.belS).toBe(200);
    expect(r.tekst).toContain('beleggen: Saxo Belegging €100 + Peaks (Kayani) €100');
    const opzij0 = await page.evaluate(() => { const a = SET.assets; SET.assets = []; window._rekV = null; try { runMemoVergeten(); } catch (_) {} const o = rekVoorstel().opzij; SET.assets = a; window._rekV = null; try { runMemoVergeten(); } catch (_) {} return o; });
    expect(opzij0 - r.opzij).toBe(200);
  });

  test('h: het pensioen zonder koppeling telt niet en staat in de regel "Niet meegeteld"', async ({ page }) => {
    await B.boot(page, { gebruiker: true });
    const r = await lees(page);
    expect(r.beleg.map((x) => x[0])).not.toContain('pens');
    expect(r.niet).toEqual([['pens', 200]]);
    const t = await page.evaluate(() => { go('maand'); openSalVerdeling('x'); const el = document.querySelector('#salVerdeling [data-salvbelegniet="pens"]');
      const tekst = el ? el.textContent.replace(/\s+/g, ' ').trim() : null; if (el) el.click();
      const chips = [...document.querySelectorAll('[data-aperacc] [data-aperaccoptie]')];
      return { tekst, editor: !!document.getElementById('aPerAcc'), chips: chips.length, aan: chips.filter((c) => c.classList.contains('on')).length, opties: chips.map((c) => c.dataset.aperaccoptie) }; });
    expect(t.tekst).toBe('Niet meegeteld: Peaks (pensioen) €200 per maand · nog geen boeking gekoppeld · kies rekening en startmaand ›');
    expect(t.editor).toBe(true);
    expect(t.aan).toBe(0);   // niets voorgeselecteerd
    expect(t.opties.sort()).toEqual([...r.BR].sort());   // alleen betaal- en salarisrekeningen
  });

  test('i: na rekening Betaalrekening en start 2027-01 telt het pensioen niet in 24 nov – 23 dec en wel EUR 200 in 24 dec – 23 jan', async ({ page }) => {
    await B.boot(page, { gebruiker: true });
    await page.evaluate((BET) => { openAsset('pens'); document.querySelector(`[data-aperaccoptie="${BET}"]`).click(); document.getElementById('aPerVanaf').value = '2027-01'; saveAsset('pens'); }, B.BET);
    const r = await lees(page);
    expect(r.salAcc).not.toBe(B.BET);   // salarisrekening en Betaalrekening zijn te onderscheiden
    expect(r.beleg.map((x) => x[0])).not.toContain('pens');
    expect(r.niet).toEqual([]);
    const v = await page.evaluate(() => { const P = rekVoorstel(); return rekBelegInleg('2026-12-24', '2027-01-23', new Set(P.BR), P.salAcc).map((x) => [x.id, x.acc, x.totaal, x.data]); });
    expect(v).toContainEqual(['pens', B.BET, 200, ['2027-01-01']]);
  });
});
