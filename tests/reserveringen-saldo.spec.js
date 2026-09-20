// v220: de reserveringenkaart op Plan toonde '3 posten · bekijk' maar geen bedrag, terwijl de twee
// blokken erboven allebei wel een bedrag dragen. Het saldo staat er nu, uit resSaldo() (accBalance
// via SET.resAcc), en verder niets.
// KRITIEK, en dit is wat deze spec vooral bewaakt: alleen het saldo, geen oordeel. v187 en v188
// haalden de dekkingsgraad en dekkingTekst() bewust van deze kaart omdat dat oordeel op Maand
// woont; die keuze staat. Dus geen percentage, geen voortgangsbalk en geen 'op peil'. Een balk zou
// hier bovendien een eindpunt suggereren dat er niet is: een reservering loopt door zolang je
// verplichtingen hebt.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const MAIN = 'NL01MAIN0000001111';
const RES = 'NL01RESV0000009999';
const BINNENKORT = ym(new Date(now.getFullYear(), now.getMonth() + 3, 1));

const POSTEN = [
  { id: 'a', naam: 'Aanslag', bedrag: 3000, vervalmaand: BINNENKORT, intervalM: 12 },
  { id: 'b', naam: 'Onderhoud', bedrag: 900, vervalmaand: BINNENKORT, intervalM: 12 },
  { id: 'c', naam: 'Premie', bedrag: 600, vervalmaand: BINNENKORT, intervalM: 12 },
];

function seed(o) {
  o = o || {};
  const tx = [
    { id: 'i1', date: CUR + '-05', amount: 5000, acc: MAIN, name: 'Werkgever', desc: 'SALARIS LOON', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
    { id: 'h1', date: CUR + '-02', amount: -1200, acc: MAIN, name: 'Woningcorporatie', desc: 'SEPA INCASSO HUURBETALING', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
    { id: 'r1', date: CUR + '-10', amount: 300, acc: RES, name: 'Reserveringen', desc: 'NAAR RESERVERINGEN', typ: '', ref: '', src: 'csv', accName: '', refNums: [] },
  ];
  const bal = { [MAIN]: 3000 };
  if (o.saldo !== null) bal[RES] = o.saldo != null ? o.saldo : 2500;
  const set = {
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 5000,
    manualBal: bal,
    budgets: { huur: 1200 },
    reserveringen: o.posten !== undefined ? o.posten : POSTEN,
  };
  if (!o.geenRek) set.resAcc = RES;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof resDekkingCard === 'function');
}
const kaart = (page) => page.evaluate(() => resDekkingCard());
const tekst = (page) => page.evaluate(() => {
  const d = document.createElement('div'); d.innerHTML = resDekkingCard();
  return d.textContent.replace(/\s+/g, ' ').trim();
});

test.describe('a - het saldo staat er, uit de bestaande bron', () => {
  test('het bedrag staat op de kaart', async ({ page }) => {
    await boot(page);
    expect(await tekst(page)).toContain('€2.500');
  });

  test('het is exact resSaldo(), niet iets dat opnieuw is uitgerekend', async ({ page }) => {
    await boot(page, { saldo: 1234 });
    const s = await page.evaluate(() => resSaldo());
    expect(s).toBe(1234);
    expect(await tekst(page)).toContain(await page.evaluate((n) => euro0(n), s));
  });

  test('en het staat in de kop, naast de naam', async ({ page }) => {
    await boot(page);
    const h = await kaart(page);
    const kop = h.slice(h.indexOf('<div class="row"'), h.indexOf('</div>', h.indexOf('<div class="row"')) + 6);
    expect(kop).toContain('Reserveringen');
    expect(kop).toContain('2.500');
  });

  test('de teller en de ingang staan er nog, op hun eigen regel', async ({ page }) => {
    await boot(page);
    const t = await tekst(page);
    expect(t).toContain('3 posten');
    expect(t).toContain('bekijk');
  });
});

test.describe('b - KRITIEK: alleen het saldo, geen oordeel', () => {
  test('geen percentage, in geen enkele vorm', async ({ page }) => {
    await boot(page);
    const h = await kaart(page);
    expect(h).not.toMatch(/\d\s*%/);
    expect(await tekst(page)).not.toContain('%');
  });

  test('geen voortgangsbalk', async ({ page }) => {
    await boot(page);
    const h = await kaart(page);
    expect(h).not.toContain('bar-track');
    expect(h).not.toContain('bar-fill');
  });

  /* v242 KEERT EEN DEEL VAN v220 OM, en dat is de bedoeling. v220 hield op deze kaart alleen het
     saldo, omdat het dekkingsoordeel op Grip woont (v187). Wat er nu bij komt is geen oordeel maar
     een aftrekking: de gemeten stand min wat er nu opgebouwd hoort te zijn. Staat er meer, dan
     blijft er over; staat er minder, dan is dat een tekort. Het oordeel zelf (de graad, gedektTot,
     en of het op tijd komt) blijft op Grip, en de verwijzende regel daarheen blijft staan. */
  test('geen oordeelwoorden, maar wel de aftrekking', async ({ page }) => {
    await boot(page);
    const t = (await tekst(page)).toLowerCase();
    for (const w of ['op peil', 'gedekt tot', 'dekkingsgraad', 'volledig gedekt']) {
      expect(t, w).not.toContain(w);
    }
    expect(t).not.toMatch(/\d+%/);                       // geen percentage, in geen enkele vorm
    expect(t).toMatch(/blijft over|tekort/);
  });

  test('de verwijzende regel naar Maand staat er onveranderd', async ({ page }) => {
    await boot(page);
    expect(await tekst(page)).toContain('Of je genoeg opzij hebt staan, lees je op Grip.');   // v233
  });

  test('het verschil is het enige dat met het saldo meebeweegt', async ({ page }) => {
    /* v220 eiste hier dat een arme en een rijke pot dezelfde kaart gaven op het bedrag na, want de
       kaart droeg geen oordeel. v242 zet het verschil erbij, dus die twee mogen nu juist van elkaar
       verschillen. Wat de test vasthoudt is dat het daarbij blijft: dezelfde posten, dezelfde
       zinnen, alleen de stand en het verschil bewegen mee. */
    await boot(page, { saldo: 50 });
    const arm = await tekst(page);
    await boot(page, { saldo: 999999 });
    const rijk = await tekst(page);
    const schoon = (t) => t.replace(/€[\d.]+/g, 'X').replace(/Blijft over|Tekort/g, 'VERSCHIL');
    expect(schoon(arm)).toBe(schoon(rijk));
    expect(arm).toMatch(/Tekort/);
    expect(rijk).toMatch(/Blijft over/);
  });
});

test.describe('c - een onbekend saldo verschijnt niet als nul', () => {
  test('rekening aangewezen, saldo onbekend: het woord onbekend', async ({ page }) => {
    await boot(page, { saldo: null });
    expect(await page.evaluate(() => resSaldo())).toBe(null);
    const t = await tekst(page);
    expect(t).toContain('onbekend');
    expect(t).not.toContain('€0');
  });

  test('en dat woord is gedempt, net als bij de plan-rij erboven', async ({ page }) => {
    await boot(page, { saldo: null });
    expect(await kaart(page)).toContain('<span class="muted">onbekend</span>');
  });

  test('geen reserveringenrekening ingesteld: geen bedrag en geen onbekend', async ({ page }) => {
    await boot(page, { geenRek: true });
    expect(await page.evaluate(() => resAccId())).toBe('');
    const t = await tekst(page);
    expect(t).not.toContain('onbekend');
    // v242: de verwachte kosten staan wel op de kaart, ook zonder rekening; wat ontbreekt is de
    // stand en daarmee het verschil, want zonder saldo valt er niets af te trekken (v59/v73)
    expect(t).not.toMatch(/Blijft over|Tekort/);
    expect(t).toContain('nog geen rekening aangewezen');
    // de kaart blijft verder zoals hij was
    expect(t).toContain('3 posten');
    expect(t).toContain('Of je genoeg opzij hebt staan, lees je op Grip.');
  });

  test('een saldo van werkelijk nul is wel een bedrag', async ({ page }) => {
    await boot(page, { saldo: 0 });
    expect(await page.evaluate(() => resSaldo())).toBe(0);
    const t = await tekst(page);
    expect(t).toContain('€0');
    expect(t).not.toContain('onbekend');
  });
});

test.describe('d - nul posten laat de kaart met rust', () => {
  test('dan blijft de korte tak zoals hij was', async ({ page }) => {
    await boot(page, { posten: [] });
    const t = await tekst(page);
    expect(t).toContain('Reserveringen');
    expect(t).toContain('Kosten die niet elke maand vallen');
    expect(t).not.toContain('posten');
    expect(t).not.toContain('€');
  });
});

test.describe('e - layout', () => {
  for (const w of [360, 390]) {
    test(`Plan past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      await page.evaluate(() => go('vooruit'));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });

    test(`de kop blijft één regel op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      await page.evaluate(() => go('vooruit'));
      const h = await page.evaluate(() => {
        const c = [...document.querySelectorAll('#s-vooruit .card')].find((x) => /Reserveringen/.test(x.textContent));
        return c ? Math.round(c.querySelector('.row').getBoundingClientRect().height) : null;
      });
      expect(h).not.toBeNull();
      expect(h).toBeLessThanOrEqual(26);
    });
  }
});
