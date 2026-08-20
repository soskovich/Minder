// v100: de restschuld daalt niet vanzelf mee met je betalingen. `rest` is en blijft handmatige
// invoer — nergens verlaagt code de schuldstand op grond van transacties. Het gemelde geval: de
// groene regel "aflossing lijkt in je uitgaven te zitten" las alsof de stand was bijgewerkt.
// Deze spec bewaakt de twee helften van de fix: eerlijker woorden, en een lichte bijwerk-sheet
// die alleen `rest` aanraakt. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

const TERMIJN = 537.33;                 // de echte Hiltermann-incasso
const LEASE = { id: 'dl', naam: 'auto lease', type: 'financiallease', rest: 9000, start: 18000, perMaand: 537, rente: 6, slot: 2000, autoBezit: true, dagwaarde: 16000 };
const LENING = { id: 'dk', naam: 'Kredietbank', type: 'lening', rest: 400, start: 5000, perMaand: 250, rente: 8 };

// een herkenbare maandelijkse lease-incasso, zodat debtInExpenses op 'in-uitgaven' uitkomt
function seedMetLease() {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  for (const m of [M2, M1, CUR]) {
    tx.push({ id: 'lease-' + m, date: `${m}-10`, amount: -TERMIJN, acc: MAIN, name: 'Hiltermann Lease Groep', desc: 'SEPA INCASSO HILTERMANN LEASECONTRACT 4471', typ: '', ref: '', src: 'csv', accName: 'Main', refNums: [] });
  }
  p.minder_tx = JSON.stringify(tx);
  return p;
}

async function boot(page, debts = [LEASE, LENING]) {
  await open(page, seedMetLease());
  await page.evaluate((ds) => { SET.debts = JSON.parse(JSON.stringify(ds)); SET.openSchuld = true; save(); render(); go('vermogen'); }, debts);
  await page.waitForTimeout(80);
}
const debtOf = (page, id) => page.evaluate((i) => (SET.debts || []).find((d) => d.id === i), id);
const rijTekst = (page) => page.locator('#s-vermogen').innerText();

test.describe('a · de melding gaat over je uitgaven, niet over je schuldstand', () => {
  test('de lease-incasso wordt herkend en heet "maandbetaling", niet "aflossing"', async ({ page }) => {
    await boot(page);
    const det = await page.evaluate(() => debtInExpenses((SET.debts || []).find((d) => d.id === 'dl')));
    expect(det.status).toBe('in-uitgaven');                       // de situatie uit de melding

    const txt = await rijTekst(page);
    expect(txt).toContain('maandbetaling');
    expect(txt).not.toMatch(/aflossing (herkend|lijkt) in je uitgaven/);   // de oude, verwarrende woorden
  });

  test('bij elke schuld met restschuld staat de hint dat je de stand zelf bijwerkt', async ({ page }) => {
    await boot(page);
    const txt = await rijTekst(page);
    expect(txt).toContain('restschuld werk je zelf bij');
    expect(await page.locator('#s-vermogen .debt-upd').count()).toBe(2);   // "bijwerken ›" op beide rijen
  });

  test('een afgeloste schuld toont geen hint en geen bijwerk-link', async ({ page }) => {
    await boot(page, [{ ...LENING, rest: 0 }]);
    const txt = await rijTekst(page);
    expect(txt).toContain('Afgelost');
    expect(txt).not.toContain('restschuld werk je zelf bij');
    expect(await page.locator('#s-vermogen .debt-upd').count()).toBe(0);
  });
});

test.describe('b · de sheet werkt alleen de restschuld bij', () => {
  test('een exacte stand overschrijft rest en laat de overige velden staan', async ({ page }) => {
    await boot(page);
    const voor = await debtOf(page, 'dl');
    await page.evaluate(() => { openDebtUpdate('dl'); document.getElementById('duRest').value = '8123'; saveDebtRest('dl'); });
    const na = await debtOf(page, 'dl');

    expect(na.rest).toBe(8123);
    for (const k of ['naam', 'type', 'perMaand', 'rente', 'slot', 'autoBezit', 'dagwaarde', 'start']) {
      expect(na[k]).toEqual(voor[k]);                             // niets anders aangeraakt
    }
  });

  test('de voortgang "afgelost" groeit mee met de nieuwe stand', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { openDebtUpdate('dl'); document.getElementById('duRest').value = '8000'; saveDebtRest('dl'); });
    await page.waitForTimeout(60);
    expect(await rijTekst(page)).toContain('10.000 van');          // start 18.000 − rest 8.000
  });

  // Niet via page.reload(): de gedeelde fixture zet localStorage bij elke navigatie terug via
  // addInitScript, dus een herstart zou de seed herstellen i.p.v. de opgeslagen stand tonen.
  // We lezen daarom rechtstreeks wat save() heeft weggeschreven.
  test('de nieuwe stand is echt weggeschreven naar localStorage', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { openDebtUpdate('dl'); document.getElementById('duRest').value = '7500'; saveDebtRest('dl'); });
    const opslag = await page.evaluate(() => (JSON.parse(localStorage.getItem('minder_set') || '{}').debts || []).find((d) => d.id === 'dl'));
    expect(opslag.rest).toBe(7500);
    expect(opslag.perMaand).toBe(537);                            // de rest van het record staat er nog
  });

  test('een leeg veld wijzigt niets', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { openDebtUpdate('dl'); document.getElementById('duRest').value = ''; saveDebtRest('dl'); });
    expect((await debtOf(page, 'dl')).rest).toBe(9000);
  });
});

test.describe('c · maandaflossing afboeken stopt op de vloer', () => {
  test('afboeken verlaagt met precies perMaand', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { openDebtUpdate('dl'); debtAfboeken('dl'); });
    expect((await debtOf(page, 'dl')).rest).toBe(9000 - 537);
  });

  test('financial lease zakt niet onder de slottermijn', async ({ page }) => {
    await boot(page, [{ ...LEASE, rest: 2100 }]);                  // slot 2000, perMaand 537
    await page.evaluate(() => { openDebtUpdate('dl'); debtAfboeken('dl'); });
    expect((await debtOf(page, 'dl')).rest).toBe(2000);

    await page.evaluate(() => debtAfboeken('dl'));                 // nog eens: blijft staan
    expect((await debtOf(page, 'dl')).rest).toBe(2000);
    expect(await page.locator('#sheet').innerText()).not.toContain('Boek maandaflossing af');
  });

  test('een gewone lening stopt op nul en heet dan Afgelost', async ({ page }) => {
    await boot(page, [{ ...LENING, rest: 400, perMaand: 250 }]);
    await page.evaluate(() => { openDebtUpdate('dk'); debtAfboeken('dk'); debtAfboeken('dk'); });
    expect((await debtOf(page, 'dk')).rest).toBe(0);
    await page.evaluate(() => { closeSheet(); render(); });
    expect(await rijTekst(page)).toContain('Afgelost');
  });

  test('de sheet noemt de benadering en verzwijgt de rente niet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openDebtUpdate('dl'));
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('rente is hier niet meegerekend');
    expect(s).toContain('Slottermijn');                            // vloer wordt benoemd bij lease
  });
});

test.describe('d · een hogere stand trekt de oorspronkelijke schuld mee', () => {
  test('rest boven start verhoogt start i.p.v. negatieve voortgang', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { openDebtUpdate('dl'); document.getElementById('duRest').value = '20000'; saveDebtRest('dl'); });
    const d = await debtOf(page, 'dl');
    expect(d.rest).toBe(20000);
    expect(d.start).toBe(20000);                                   // meegetrokken, was 18.000
    // "eigen deel -€4.000" mag er wel staan (auto onder water) — het gaat om de voortgangsregel
    expect(await rijTekst(page)).not.toMatch(/-€[\d.]+ van/);      // geen negatieve "afgelost"
  });
});

test.describe('e · de rekenlagen blijven ongemoeid', () => {
  test('netto vermogen volgt de nieuwe stand en houdt de invariant', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => netWorth());
    await page.evaluate(() => { openDebtUpdate('dl'); document.getElementById('duRest').value = '8000'; saveDebtRest('dl'); });
    const na = await page.evaluate(() => netWorth());

    expect(na.sch).toBe(voor.sch - 1000);                          // exact het verschil, niets extra's
    expect(na.netto).toBe(na.bez - na.sch);                        // harde invariant (v44/v49)
    expect(na.bez).toBe(voor.bez);                                 // bezittingen onaangeraakt
  });

  test('de uitgaven-detectie verandert niet door het bijwerken van de stand', async ({ page }) => {
    await boot(page);
    const voor = await page.evaluate(() => debtInExpenses((SET.debts || []).find((d) => d.id === 'dl')));
    await page.evaluate(() => { openDebtUpdate('dl'); document.getElementById('duRest').value = '3000'; saveDebtRest('dl'); });
    const na = await page.evaluate(() => debtInExpenses((SET.debts || []).find((d) => d.id === 'dl')));
    expect(na.status).toBe(voor.status);
    expect(na.conf).toBe(voor.conf);
  });
});

test.describe('f · de wegen naar de sheet', () => {
  test('de bijwerk-link opent de lichte sheet, niet de volledige editor', async ({ page }) => {
    await boot(page);
    await page.locator('#s-vermogen .debt-upd').first().click();
    await page.waitForTimeout(60);
    const s = await page.locator('#sheet').innerText();
    expect(s).toContain('Restschuld nu');
    expect(s).not.toContain('Wat voor schuld?');                   // dat is de volledige editor
  });

  test('een tik elders op de rij houdt de volledige editor', async ({ page }) => {
    await boot(page);
    await page.locator('#s-vermogen .cz-pot .cp-nm').first().click();
    await page.waitForTimeout(60);
    expect(await page.locator('#sheet').innerText()).toContain('Wat voor schuld?');
  });

  test('de volledige editor biedt de snelle weg aan', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => openDebt('dl'));
    expect(await page.locator('#sheet').innerText()).toContain('Alleen de restschuld bijwerken');
  });

  test('rustig toont minder tekst maar dezelfde velden', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { SET.mode = 'rustig'; save(); openDebtUpdate('dl'); });
    const s = await page.locator('#sheet').innerText();
    expect(s).not.toContain('daalt niet vanzelf mee');             // de uitleg valt weg
    expect(s).toContain('Restschuld nu');                          // het instrument blijft
  });
});

test.describe('g · smalle mobiel', () => {
  for (const w of [360, 390]) {
    test(`de sheet past op ${w}px zonder horizontale scroll`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await boot(page);
      await page.evaluate(() => openDebtUpdate('dl'));
      await page.waitForTimeout(60);
      const over = await page.evaluate(() => {
        const s = document.getElementById('sheet');
        return { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, sheet: s.scrollWidth - s.clientWidth };
      });
      expect(over.doc).toBeLessThanOrEqual(0);
      expect(over.sheet).toBeLessThanOrEqual(0);
    });
  }
});
