/* v455 (gevraagd door de gebruiker, antwoord op v454; nog geen deel B).
   1. Buiten je potjes: alles tonen. De regel op Zien en Inzichten is "buiten je potjes deze maand: EUR X (n) ›" met geenNormTx() als bron
      (buitenMaand: de categorie zonder norm OF het label eenmalig, netto, wat totals().buitenNorm optelt), de sheet heeft twee groepen
      ("eenmalig (door jou)" en "zonder label"), een boeking zonder norm en zonder label krijgt de vraag "Wat was dit?" (Eenmalig / Hoort
      in een potje / Weet ik niet, niets voorgeselecteerd, het antwoord in de kennislaag), en blok 20 zegt per maand buiten = eenmalig +
      zonder label met een CONTROLE tegen totals().buitenNorm. Op v421-stand (10 oktober 2026, GECONSTRUEERD) met de boekingen van v453/v454:
      Lausa 159 en Gemeente 484 dragen het label, Onvoorzien 60 niet.
   2. De inerte guards (kasTempo bron!=='schatting', uitschieters) blijven staan; dat staat in CLAUDE.md en wordt hier op de bron getoetst. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const S = require('./v421-stand');
const { kaalBron } = require('./bron-kaal');

async function boot(page) {
  await S.boot(page);
  await page.evaluate(({ MAIN }) => {
    const add = (d, a, n, ds, c) => { const t = { id: 'v455' + d + n + a, date: d, amount: a, acc: MAIN, name: n, desc: ds || n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); if (c) OVR[t.id] = c; TX.push(t); return t; };
    add('2026-10-09', -159, 'Lausa Eriksson via Tikki', 'LAUSA ERIKSSON VIA TIKKIE BETAALVERZOEK', 'zorg');
    add('2026-10-04', -484, 'Gemeente Amsterdam', 'GEMEENTE AMSTERDAM WEGSLEPEN', 'belasting');
    add('2026-10-06', -120, 'Albert Heijn', 'ALBERT HEIJN 1234', 'boodschappen');
    add('2026-10-07', -60, 'Iets onvoorziens', 'IETS ONVOORZIENS', Object.keys(CATS).find(k => geenNorm(k) && k !== CONTANT_CAT && CATS[k].type === 'expense'));
    SET.budgets = Object.assign({}, SET.budgets, { zorg: Math.max(+(SET.budgets || {}).zorg || 0, 200), belasting: Math.max(+(SET.budgets || {}).belasting || 0, 600) });
    TX.sort((a, c) => a.date.localeCompare(c.date));
    applyOwnAccounts(); buildAccMeta(); kennisZaai(); save(); render();
  }, { MAIN: S.MAIN });
}
const regel = (L, re) => L.find(l => re.test(l)) || '';

const { sectieVan } = require('./bron-sectie');

test.describe('1 · buiten je potjes: alles tonen', () => {
  test('a. Zien en Inzichten: een regel met alles wat buiten de potjes valt (geenNormTx), ook de categorie zonder norm zonder label', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const okt = TX.filter(t => t.date.startsWith('2026-10') && t.amount < 0);
      const inv = { label: okt.filter(t => eenmaligLabel(t)).map(t => -t.amount).sort((a, b) => a - b), zonder: okt.filter(t => geenNormTx(t) && !eenmaligLabel(t)).map(t => -t.amount), g: totals('2026-10').buitenNorm };
      const lees = e => e ? [e.innerText, e.dataset.buitenregel, e.dataset.n, e.dataset.eenmalig, e.dataset.zonderlabel] : null;
      go('maand'); const z = lees(document.querySelector('#gripZienStand [data-buitenregel]'));
      go('ins'); const ie = document.querySelector('#insMaand [data-buitenregel]'), i = lees(ie);
      ie.click(); const sh = document.querySelector('#buitenMaandSheet');
      const groep = k => { const g = document.querySelector(`#buitenMaandSheet [data-buitengroep="${k}"]`); return g ? { kop: g.querySelector('.hlabel').innerText, bedrag: +g.dataset.bedrag, n: +g.dataset.n, rijen: [...g.querySelectorAll('[data-buitenrij]')].map(e => +e.dataset.buitenrij).sort((a, b) => a - b) } : null; };
      return { inv, z, i, sh: sh ? +sh.dataset.inswaarde : null, e: groep('eenmalig'), zl: groep('zonder'), oud: !!document.querySelector('[data-eenmaligregel]') }; });
    expect(r.inv.label).toEqual([159, 484]);
    expect(r.inv.zonder).toEqual([60]);
    expect(r.inv.g).toBe(703);
    expect(r.z).toEqual(['buiten je potjes deze maand: €703 (3) ›', '703', '3', '643', '60']);
    expect(r.i).toEqual(r.z);
    expect(r.sh).toBe(703);
    expect(r.e).toEqual({ kop: 'EENMALIG (DOOR JOU) · 2', bedrag: 643, n: 2, rijen: [159, 484] });
    expect(r.zl).toEqual({ kop: 'ZONDER LABEL · 1', bedrag: 60, n: 1, rijen: [60] });
    expect(r.oud).toBe(false);
  });

  test('b. de andere twee Inzichten-vormen (soort vast/variabel en een afgesloten periode) dragen dezelfde regel', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { go('ins'); const o = {};
      for (const s of ['var', 'vast']) { window._insSoort = s; renderIns(); const e = document.querySelector('#insMaand [data-buitenregel]'); o[s] = e ? e.innerText : null; }
      window._insSoort = 'alle'; renderIns(); return o; });
    expect(r.var).toBe('buiten je potjes deze maand: €703 (3) ›');
    expect(r.vast).toBe('buiten je potjes deze maand: €703 (3) ›');
  });

  test('c. "Wat was dit?": een vraag voor de boeking zonder norm en zonder label, drie opties, niets voorgeselecteerd', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const Q = gegevensVragen().filter(q => q.soort === 'buiten');
      const t = TX.find(x => x.name === 'Iets onvoorziens'); openGegevensVragen('buiten|' + t.id);
      const el = document.querySelector('[data-gegevensvraag="buiten"]');
      return { q: Q.map(q => [q.t.name, q.bedrag]), kop: el && el.querySelector('div').innerText, opties: el ? [...el.querySelectorAll('[data-kennisoptie]')].map(c => c.innerText) : [],
        gekozen: el ? [...el.querySelectorAll('.chip.on,.chip.sel,[aria-pressed="true"]')].length : -1, label: [...gegevensVragen()].filter(q => q.soort === 'buiten' && eenmaligLabel(q.t)).length }; });
    expect(r.q).toEqual([['Iets onvoorziens', 60]]);
    expect(r.kop).toMatch(/Wat was dit\?$/);
    expect(r.opties).toEqual(['Eenmalig', 'Hoort in een potje', 'Weet ik niet']);
    expect(r.gekozen).toBe(0);
    expect(r.label).toBe(0);
  });

  test('d. Eenmalig: het label komt in de kennislaag, de boeking gaat naar de groep eenmalig en de vraag vervalt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const t = TX.find(x => x.name === 'Iets onvoorziens'); openGegevensVragen('buiten|' + t.id);
      document.querySelector('[data-gegevensvraag="buiten"] [data-kennisoptie="eenmalig"]').click();
      const E = SET.kennis['buiten|' + t.id], B = buitenMaand(['2026-10']), L = kennisLijst().find(x => x.kennis === 'buiten|' + t.id);
      return { E: E && [E.soort, E.aard, E.bron, E.tx], label: eenmaligLabel(t), B: [B.eenmalig.n, B.eenmalig.bedrag, B.zonder.n, B.bedrag], q: gegevensVragen().some(q => q.qkey === 'buiten|' + t.id), groep: L && L.groep, cat: catOf(t) }; });
    expect(r.E).toEqual(['eenmalig', 'eenmalig', 'jij', [r.E[3][0]]]);
    expect(r.label).toBe('Iets onvoorziens · eenmalig (door jou)');
    expect(r.B).toEqual([3, 703, 0, 703]);
    expect(r.q).toBe(false);
    expect(r.groep).toBe('eenmalig');
    expect(r.cat).toBe('onvoorzien');
  });

  test('e. Hoort in een potje: eerst het potje kiezen, dan krijgt de boeking die categorie; Vergeten zet hem terug', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const t = TX.find(x => x.name === 'Iets onvoorziens'); openGegevensVragen('buiten|' + t.id);
      document.querySelector('[data-gegevensvraag="buiten"] [data-kennisoptie="potje"]').click();
      const tus = { geschreven: !!SET.kennis['buiten|' + t.id], cat: catOf(t), potjes: [...document.querySelectorAll('[data-gegevensvraag="buiten"] [data-kennispotje]')].map(e => e.dataset.kennispotje) };
      document.querySelector('[data-gegevensvraag="buiten"] [data-kennispotje="boodschappen"]').click();
      const E = SET.kennis['buiten|' + t.id], B = buitenMaand(['2026-10']), na = { E: E && [E.soort, E.aard, E.potje], cat: catOf(t), B: [B.n, B.bedrag], q: gegevensVragen().some(q => q.qkey === 'buiten|' + t.id) };
      kennisVergeet('k:buiten|' + t.id); const B2 = buitenMaand(['2026-10']);
      return { tus, na, terug: { cat: catOf(t), B: [B2.zonder.n, B2.zonder.bedrag], E: !!SET.kennis['buiten|' + t.id] } }; });
    expect(r.tus.geschreven).toBe(false);
    expect(r.tus.cat).toBe('onvoorzien');
    expect(r.tus.potjes).toContain('boodschappen');
    expect(r.na.E).toEqual(['buiten', 'potje', 'boodschappen']);
    expect(r.na.cat).toBe('boodschappen');
    expect(r.na.B).toEqual([2, 643]);
    expect(r.na.q).toBe(false);
    expect(r.terug).toEqual({ cat: 'onvoorzien', B: [1, 60], E: false });
  });

  test('f. Weet ik niet: de boeking blijft zonder label, het antwoord staat in de kennislaag en de vraag vervalt', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => { const t = TX.find(x => x.name === 'Iets onvoorziens'); openGegevensVragen('buiten|' + t.id);
      document.querySelector('[data-gegevensvraag="buiten"] [data-kennisoptie="weetniet"]').click();
      const E = SET.kennis['buiten|' + t.id], B = buitenMaand(['2026-10']);
      return { E: E && [E.soort, E.aard, E.wat], B: [B.zonder.n, B.zonder.bedrag], q: gegevensVragen().some(q => q.qkey === 'buiten|' + t.id), cat: catOf(t) }; });
    expect(r.E).toEqual(['buiten', 'weetniet', null]);
    expect(r.B).toEqual([1, 60]);
    expect(r.q).toBe(false);
    expect(r.cat).toBe('onvoorzien');
  });

  test('g. de drempel: vanaf EUR 25 in de laatste 120 dagen, of elk bedrag in de lopende periode; geen opname', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(({ MAIN }) => { const ov = Object.keys(CATS).find(k => geenNorm(k) && k !== CONTANT_CAT && CATS[k].type === 'expense');
      const add = (d, a, n) => { const t = { id: 'g' + d + a, date: d, amount: a, acc: MAIN, name: n, desc: n.toUpperCase(), typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = ov; TX.push(t); return t; };
      add('2026-10-08', -10, 'Klein Nu'); add('2026-08-05', -10, 'Klein Oud'); add('2026-08-06', -30, 'Groot Oud'); add('2026-08-07', -24.99, 'Net Onder');
      TX.sort((a, c) => a.date.localeCompare(c.date)); save();
      const P = salPeriode(); return { per: P && P.cur && [P.cur.start, P.cur.eind], q: gegevensVragen().filter(q => q.soort === 'buiten').map(q => q.t.name).sort() }; }, { MAIN: S.MAIN });
    expect(r.per[0] <= '2026-10-08' && r.per[1] >= '2026-10-08' && r.per[0] > '2026-08-07').toBe(true);
    expect(r.q).toEqual(['Groot Oud', 'Iets onvoorziens', 'Klein Nu']);
  });

  test('h. blok 20: per maand buiten = eenmalig + zonder label, met de controle tegen geenNormTx (ook netto, met een terugstorting)', async ({ page }) => {
    await boot(page);
    const L = await page.evaluate(({ MAIN }) => { const ov = Object.keys(CATS).find(k => geenNorm(k) && k !== CONTANT_CAT && CATS[k].type === 'expense');
      const t = { id: 'hterug', date: '2026-10-08', amount: 20, acc: MAIN, name: 'Terug Onvoorzien', desc: 'TERUG ONVOORZIEN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] }; categorize(t); OVR[t.id] = ov; TX.push(t); save();
      return diagSalarisVerdeling(); }, { MAIN: S.MAIN });
    expect(regel(L, /BUITEN JE POTJES PER MAAND \(v455/)).toMatch(/sep 0\.00 eenmalig \(0\) \+ 0\.00 zonder label \(0\) = 0\.00 · okt\* 643\.00 eenmalig \(2\) \+ 40\.00 zonder label \(2\) = 683\.00$/);
    expect(regel(L, /CONTROLE buiten = eenmalig \+ zonder label/)).toMatch(/: klopt$/);
    expect(regel(L, /EENMALIG BUITEN JE POTJES PER MAAND \(v454/)).toBe('');
  });
});

test.describe('2 · de inerte guards blijven staan', () => {
  const src = kaalBron(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8'));
  const md = fs.readFileSync(path.join(__dirname, '..', 'CLAUDE.md'), 'utf8');
  test('a. kasTempo toetst bron!==\'schatting\' en uitschieters slaat Contant zonder telling over, in de code (niet in een comment)', () => {
    expect(sectieVan(src, 'function kasTempo(')).toMatch(/bron!=='schatting'\s*&&/);
    expect(sectieVan(src, 'function uitschieters(')).toMatch(/const ong=contantOngeteld\(\)/);
    expect(sectieVan(src, 'function uitschieters(')).toMatch(/!\(ong && x\.k===CONTANT_CAT\)/);
  });
  test('b. CLAUDE.md zegt dat ze bewust inert zijn, met de reden', () => {
    const r = md.split('\n').find(l => /BEWUST INERT/.test(l) && /kasTempo/.test(l) && /uitschieters/.test(l)) || '';
    expect(r).not.toBe('');
    expect(r).toMatch(/schatting/);
  });
});
