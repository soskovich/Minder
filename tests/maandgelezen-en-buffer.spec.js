// v168: twee dingen die het maandscherm onbetrouwbaar maakten.
// A. SET.maandGelezen bepaalde wat er op het scherm stond, en go('maand') zette die vlag zelf. Twee
//    keer openen binnen dezelfde dag gaf dus een ander oordeel zonder dat er iets veranderd was.
// B. spaarSaldo() viel zonder aangewezen spaarrekening terug op je totale banksaldo. Dat cijfer
//    voedde de bufferregel op Maand en daarmee beleggenKlaar(): een groen licht op een geraden bedrag.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [4, 3, 2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));

// oplopende uitgaven, zodat er een structureel signaal (overstreak) ontstaat
function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m, k) => {
    add(m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '02', -1000, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '05', -(1400 + k * 250), 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '11', -(700 + k * 150), 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    if (o.spaar) add(m, '26', 300, 'Spaarpot', 'NAAR SPAREN', SAV);
  });
  const bal = { [MAIN]: 4000 };
  if (o.spaar) bal[SAV] = 9000;
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: bal, budgets: { huur: 1000, boodschappen: 500 } }, o.set || {});
  if (o.spaar) set.savingsEnds = ['4323'];
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify(o.spaar ? [MAIN, SAV] : [MAIN]), minder_accmeta: '{}', minder_plan: '{}' };
}

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof spaarSaldo === 'function');
}
// het scherm zonder de gelezen-regel: die mag per definitie wel veranderen
const inhoud = (page) => page.evaluate(() => $('#s-maand').innerText
  .replace(/Gelezen op [^.]*\./, '').replace(/\s+/g, ' ').trim());
async function openMaand(page) {
  await page.evaluate(() => go('maand'));
  await page.waitForTimeout(120);
  return inhoud(page);
}

test.describe('a · het scherm spreekt zichzelf niet meer tegen', () => {
  test('drie keer openen op dezelfde dag geeft exact dezelfde inhoud', async ({ page }) => {
    await boot(page);
    const een = await openMaand(page);
    await page.evaluate(() => go('ins'));
    const twee = await openMaand(page);
    await page.evaluate(() => go('dash'));
    const drie = await openMaand(page);
    expect(twee).toBe(een);
    expect(drie).toBe(een);
    expect(een).toMatch(/beslissing vraagt|aandacht|staat goed|te beoordelen/);
  });

  test('de gelezen-vlag stuurt geen inhoud meer aan', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => maandStructureel.toString());
    expect(src).not.toContain('maandGelezen');
    const voor = await page.evaluate(() => maandStructureel().map((r) => r.key));
    await page.evaluate(() => { SET.maandGelezen = new Date().toISOString().slice(0, 10); save(); });
    expect(await page.evaluate(() => maandStructureel().map((r) => r.key))).toEqual(voor);
    await page.evaluate(() => { delete SET.maandGelezen; save(); });
    expect(await page.evaluate(() => maandStructureel().map((r) => r.key))).toEqual(voor);
  });

  test('op twee dagen in dezelfde maand blijft de inhoud staan', async ({ page }) => {
    await boot(page);
    const dag1 = await openMaand(page);
    await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() - 1);
      SET.maandGelezen = d.toISOString().slice(0, 10); save(); });
    const dag2 = await openMaand(page);
    expect(dag2).toBe(dag1);
  });

  test('een structureel signaal verdwijnt alleen als je het wegzet', async ({ page }) => {
    await boot(page);
    const str = await page.evaluate(() => maandStructureel().map((r) => r.key));
    test.skip(!str.length, 'deze fixture levert geen structureel signaal');
    await openMaand(page);
    expect(await page.evaluate(() => maandStructureel().map((r) => r.key))).toEqual(str);
    await page.evaluate((k) => { SET.notifMuted = { [String(k).split('-')[0]]: true }; save(); }, str[0]);
    expect(await page.evaluate(() => maandStructureel().map((r) => r.key))).not.toContain(str[0]);
  });
});

test.describe('b · Gelezen op klopt bij de render waarin hij staat', () => {
  test('de eerste keer openen toont de datum van vandaag', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    await page.waitForTimeout(120);
    const r = await page.evaluate(() => ({ txt: $('#s-maand').innerText, vlag: SET.maandGelezen }));
    const d = new Date();
    expect(r.vlag).toBe(d.toISOString().slice(0, 10));
    expect(r.txt).toContain(`Gelezen op ${d.getDate()} `);
  });

  test('de vlag staat vóór de render, niet erna', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => go.toString());
    const iVlag = src.indexOf('maandGelezen');
    const iRender = src.indexOf('renderMaand()');
    expect(iVlag).toBeGreaterThan(-1);
    expect(iVlag).toBeLessThan(iRender);
  });
});

test.describe('c · zonder aangewezen spaarrekening is de buffer onbekend', () => {
  test('spaarSaldo geeft onbekend, niet je banksaldo', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ s: spaarSaldo(), bank: totalBalance().sum }));
    expect(r.s.missing).toBe(true);
    expect(r.s.bron).toBe('geen');
    expect(r.bank).toBeGreaterThan(0);
    expect(r.s.cur).not.toBe(r.bank);
    expect(await page.evaluate(() => spaarSaldo.toString())).not.toContain('bankBal');
  });

  test('de keten sluit aan: model, bufferMaanden, maandregel, beleggenKlaar', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const R = maandRegels(), B = beleggenKlaar(R);
      return { spaar: noodfondsModel().spaar, pct: noodfondsModel().pct, buf: bufferMaanden(),
        regels: R.filter((x) => x.key === 'buffer').length,
        volledig: B.volledig, klaar: B.klaar, blok: B.blokkade && B.blokkade.key };
    });
    expect(r.spaar).toBe(null);
    expect(r.pct).toBe(null);
    expect(r.buf).toBe(null);
    expect(r.regels).toBe(0);
    expect(r.volledig).toBe(false);      // geen groen licht op een geraden bedrag
    expect(r.klaar).toBe(false);
    expect(r.blok).toBe('buffer');
  });

  test('Home noemt geen noodfondsbedrag meer', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => freshStartCard())).not.toMatch(/noodfonds staat op/);
    await page.evaluate(() => go('dash'));
    await page.waitForTimeout(100);
    const t = await page.evaluate(() => $('#s-dash').innerText);
    expect(t).not.toMatch(/noodfonds staat op/i);
  });

  /* v172: de plan-rij toont sinds model B een TOEGEWEZEN bedrag, en dat is jouw eigen getal - ook
     zonder bekend spaarsaldo. Het onbekende zit niet in de rij maar in de vergelijking ertegen, dus
     daar staat nu de reden en de volgende stap. */
  test('het plan zegt waarom het je toewijzingen niet kan afzetten', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => renderPlan(true));
    const d = await page.evaluate((html) => { const e = document.createElement('div');
      e.innerHTML = html; return e.innerText.replace(/\s+/g, ' '); }, h);
    expect(d).toContain('We weten niet wat er op je spaarrekening staat');
    expect(d).toContain('wijs je spaarrekening aan');
    expect(h).toContain('openSpaarrekening()');
    expect(d).toContain('toegewezen');                 // de rij zelf blijft een toewijzing tonen
  });

  test('extra spaargeld is invoer, geen schatting, en telt dus wel', async ({ page }) => {
    await boot(page, seed({ set: { extraSavings: 5000 } }));
    const r = await page.evaluate(() => ({ s: spaarSaldo(), buf: bufferMaanden() }));
    expect(r.s.missing).toBe(false);
    expect(r.s.cur).toBe(5000);
    expect(r.s.bron).toBe('extra');
    expect(r.buf).toBeGreaterThan(0);
  });
});

test.describe('d · regressie: met aangewezen spaarrekening verandert er niets', () => {
  test('bedrag, buffer en maandregel blijven zoals ze waren', async ({ page }) => {
    await boot(page, seed({ spaar: true }));
    const r = await page.evaluate(() => {
      const R = maandRegels();
      return { s: spaarSaldo(), buf: bufferMaanden(),
        regel: (R.find((x) => x.key === 'buffer') || {}).status,
        home: /noodfonds staat op/.test(freshStartCard()),
        plan: (planItems().find((x) => x.id === 'noodfonds') || {}).spaarOnbekend };
    });
    expect(r.s.missing).toBe(false);
    expect(r.s.bron).toBe('spaarrekening');
    expect(r.s.cur).toBe(9000);
    expect(r.buf).toBeGreaterThan(0);
    expect(['ok', 'let op', 'tekort']).toContain(r.regel);
    expect(r.home).toBe(true);
    expect(r.plan).toBeFalsy();
  });
});
