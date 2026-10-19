/* v445 (gevraagd door de gebruiker). (2) Elk bedragveld is type="text" inputmode="decimal" en wordt via numIn() gelezen: "12,50" en
   "12.50" zijn 12,5 en "1.250,00" is 1250. Een type=number-veld wist een komma al in de DOM, dus "3219,50" kwam als 321950 binnen
   (decimaalteken.spec.js:112). (3) Blok 20: de Macnack-markering draagt bron en datum in de export, ook als het antwoord onder een
   andere sleutel staat dan die van de eerste Macnack-boeking; punt 4 noemt opzij deze periode (gedaan tegen doel, opzijPeriode())
   in plaats van "nog verwacht" uit safeToSpend en de Plan-inleg. (5) Blok 23 TUSSENDOOR splitst de verwachte daling tot de storting
   in vast, potjes en contant met het dagbedrag per soort; zonder opname deze maand en met het patroon pinnen na je salaris wordt er
   voor de storting geen contant verwacht ("contant: verwacht na je salaris"). GECONSTRUEERDE fixtures (v432-stand, 19 okt). */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { kaalBron } = require('./bron-kaal');
const S432 = require('./v432-stand');

async function boot(page, o = {}) { await S432.boot(page, { dag: o.dag || '2026-10-19' }); }

test.describe('2 · bedragvelden', () => {
  test('a. numIn: komma en punt zijn het decimaalteken, een punt voor een komma is een duizendtal', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ['12,50', '12.50', '1.250,00', '1250', ' 1 250,00 '].map((s) => numIn(s)));
    expect(r).toEqual([12.5, 12.5, 1250, 1250, 1250]);
  });

  test('b. geen enkel bedragveld (een euroteken in de buurt) is nog type=number', async () => {
    const src = kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
    const fout = [];
    for (const m of src.matchAll(/type="number"/g)) { const om = src.slice(Math.max(0, m.index - 160), m.index + 100); if (om.includes('€')) fout.push(om.slice(120, 260)); }
    expect(fout).toEqual([]);
    // tegenproef: er zijn bedragvelden, en ze dragen inputmode=decimal
    expect((src.match(/type="text" inputmode="decimal"/g) || []).length).toBeGreaterThan(40);
  });

  test('c. potje-formulier: "1.250,00" is 1250, "12,50" en "12.50" zijn hetzelfde bedrag', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { openPotForm('boodschappen'); const o = {};
      for (const s of ['1.250,00', '12,50', '12.50']) { const el = document.getElementById('potFormBedrag'); el.value = s; el.dispatchEvent(new Event('input', { bubbles: true })); o[s] = potFormVoorstel().bedrag; }
      return { type: document.getElementById('potFormBedrag').type, o }; });
    expect(r.type).toBe('text');
    expect(r.o).toEqual({ '1.250,00': 1250, '12,50': 13, '12.50': 13 });
  });

  test('d. intikken in de browser: "3219,50" en "1.250,00" komen als bedrag binnen (bezitting en budgetwijziging)', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.assets = [{ id: 'a1', naam: 'Pensioen', waarde: 100 }]; save(); openAsset('a1'); });
    await page.locator('#aWaarde').fill('');
    await page.locator('#aWaarde').pressSequentially('3219,50');
    await page.evaluate(() => saveAsset('a1'));
    expect(await page.evaluate(() => SET.assets[0].waarde)).toBe(3220);
    const b = await page.evaluate(() => { setCatBudget('uiteten', '1.250,00'); const a = (SET.budgetsNext || {}).uiteten ?? SET.budgets.uiteten; setCatBudget('uiteten', '12.50'); const c = (SET.budgetsNext || {}).uiteten ?? SET.budgets.uiteten; return [a, c]; });
    expect(b).toEqual([1250, 12.5]);
  });

  test('e. andere verdeling en zelf verdelen lezen hetzelfde', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      openSalVerdeling('t', true); const acc = rekVoorstel().rek[0].acc;
      salVerdelingVeld(acc, '1.250,00'); const sal = window._salv.eigen[acc];
      salVerdelingVeld(acc, '12,50'); const sal2 = window._salv.eigen[acc];
      openVerdeling(); window._vd.modus = 'zelf'; const p = allocatePlan().find((x) => x.rest > 20);
      let vd = null; if (p) { verdelingBedrag(p.id, '12,50'); vd = window._vd.bedragen[p.id]; }
      return { sal, sal2, vd, heeft: !!p };
    });
    expect(r.sal).toBe(1250);
    expect(r.sal2).toBe(12.5);
    if (r.heeft) expect(r.vd).toBe(13);   // tot v445 werd "12,50" hier 1250 (elk teken dat geen cijfer was, viel weg)
  });
});

test.describe('3 · blok 20', () => {
  test('a. de Macnack-markering onder een andere sleutel krijgt alsnog bron en datum, en staat in de export', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => {
      const t0 = { typ: '', ref: '', src: 'csv', accName: '', refNums: [], acc: OWN[0] };
      const add = (x) => { categorize(x); TX.push(x); };
      add(Object.assign({ id: 'mac1', date: '2026-08-01', amount: -675, name: 'Ml Macnack', desc: 'OVERBOEKING ML MACNACK HUUR' }, t0));
      SET.kennis = SET.kennis || {};
      // het antwoord staat onder het rekeningdeel van een IBAN, niet onder woning|recurKey: de schrijver van v443 vond hem daar niet
      SET.kennis['woning|991234567'] = { soort: 'woning', partij: 'Ml Macnack', wat: 'Woonhuur (vorige woning)', ja: true, gestopt: '2026-08', tx: [], bron: 'jij', op: '2026-06-01' };
      SET.kennis425 = Object.assign(SET.kennis425 || {}, { macnack: '2026-06-01', macnack443: '2026-10-17', macnackBron: '2026-10-18' });
      delete SET.kennis425.macnack445;   // het toestel: v445 draaide nog niet (de boot van deze fixture zette de vlag al)
      kennisZaai(); save();
      return { E: SET.kennis['woning|991234567'].gestoptDoor, tekst: diagBlok20Bestand().tekst };
    });
    expect(t.E).toEqual({ door: 'minder', op: '2026-10-17', grond: "jouw 'opgezegd, loopt af'" });
    expect(t.tekst).toContain('gestopt vanaf aug 2026 · door Minder gezet op 17-10');
    expect(t.tekst).not.toContain('bron niet vastgelegd');
  });

  test('b. punt 4 noemt opzij deze periode (gedaan tegen doel) en niet meer "nog verwacht"', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const L = diagSalarisVerdeling(); const O = opzijPeriode(); return { L: L.filter((l) => /opzij deze periode|nog te sparen uit safeToSpend|inleg in Plan die nog moet/.test(l)), O }; });
    expect(r.L.some((l) => /nog te sparen uit safeToSpend|inleg in Plan die nog moet/.test(l))).toBe(false);
    const regel = r.L.find((l) => l.includes('opzij deze periode'));
    expect(regel).toBeTruthy();
    expect(regel).toContain(`gedaan ${Math.round(r.O.netto) < 0 ? '-' : ''}`);
    expect(regel).toContain(r.O.doel == null ? 'tegen doel nog geen' : 'tegen doel ');
  });
});

test.describe('5 · blok 23 TUSSENDOOR', () => {
  const lees = (page) => page.evaluate(() => {
    const SP = salPeriode(), P = rekVoorstel(), b23 = diagRekVerdeling().join('\n');
    const tus = b23.slice(b23.indexOf('TUSSENDOOR'), b23.indexOf('MOMENT 2'));
    const leef = P.rek.find((x) => x.naam === 'Leefgeld');
    let dal = 0; const T = { vast: 0, pot: 0, kas: 0 };
    for (let d = rekDag(vandaagYMD(), 1); d <= SP.cur.eind; d = rekDag(d, 1)) { dal += leef.uitDag(d); const u = leef.uitDagDelen(d); T.vast += u.vast; T.pot += u.pot; T.kas += u.kas; }
    return { tus, dal, T, nasal: leef.kasNaSal };
  });

  test('a. de daling per soort telt op tot de daling van de reeks, en contant staat na je salaris', async ({ page }) => {
    await boot(page);
    const r = await lees(page);
    expect(r.T.vast + r.T.pot + r.T.kas).toBeCloseTo(r.dal, 6);
    expect(r.nasal).toBe(true);
    expect(r.T.kas).toBe(0);
    expect(r.tus).toMatch(/Leefgeld: nu [^\n]*\n {4}daling tot de storting [^\n]*= vast [^\n]* \+ potjes [^\n]*per dag\) \+ contant /);
    expect(r.tus).toContain('contant: verwacht na je salaris (deze maand nog 0 opgenomen');
  });

  test('b. tegenproef: met een opname deze maand wordt de rest van het contant gewoon verwacht', async ({ page }) => {
    await boot(page);
    await page.evaluate((LEEF) => { const t = { id: 'opn1', date: '2026-10-05', amount: -40, acc: LEEF, name: 'Geldmaat Centrum', desc: 'GEA, BETAALPAS GELDMAAT CENTRUM', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); TX.push(t); save(); }, S432.LEEF);
    const r = await lees(page);
    expect(r.nasal).toBe(false);
    expect(r.T.kas).toBeGreaterThan(0);
    expect(r.T.vast + r.T.pot + r.T.kas).toBeCloseTo(r.dal, 6);
    expect(r.tus).not.toContain('contant: verwacht na je salaris');
  });
});
