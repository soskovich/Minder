// v146: een tegenrekening die je niet gekoppeld hebt. Bij Enable Banking ligt de rekeninglijst vast
// bij het autoriseren, dus een rekening die daarna bij je bank bij komt haalt psd2Refresh() nooit
// op. De app kan hem wél zien, want mapPsd2Tx() bewaart de IBAN van de tegenpartij in refNums.
// Deze laag stelt alleen vast; bevestigen doet precies één ding (de intern-toets) en maakt geen
// rekening aan. De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));

const MAIN = '1234567890';        // eigen rekening: er staan boekingen op, dus hij zit in OWN
const SPACE = '9876544891';       // de nieuwe Space: alleen als tegenrekening bekend, ··4891
const WINKEL = '5550001111';      // een gewone tegenpartij, eenrichtingsverkeer

function seed(set = {}, extra = []) {
  const tx = [];
  const add = (id, m, day, amount, naam, refNums) =>
    tx.push({ id, date: `${m}-${day}`, amount, acc: MAIN, name: naam, desc: naam, typ: '', ref: '',
              src: 'psd2', refNums: refNums || [] });
  for (const m of [M1, CUR]) {
    add('i' + m, m, '25', 3000, 'Werkgever', []);
    add('w' + m, m, '06', -200, 'Supermarkt Vitesse', [WINKEL]);   // samen 400: op bedrag de zwaarste
  }
  // de overboeking naar de Space: de naam is niet als eigen naam herkenbaar, dus geen enkele
  // bestaande heuristiek in applyOwnAccounts pikt hem op
  add('sp1', CUR, '10', -250, 'Overboeking', [SPACE]);
  for (const t of extra) tx.push(t);
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}',
    minder_set: JSON.stringify(Object.assign({
      limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 3000,
      manualBal: { [MAIN]: 2000 },
    }, set)),
    minder_own: JSON.stringify([MAIN]), minder_accmeta: '{}', minder_plan: '{}',
  };
}

const heen = (id, m, day, amount, naam, num) => ({ id, date: `${m}-${day}`, amount, acc: MAIN,
  name: naam, desc: naam, typ: '', ref: '', src: 'psd2', refNums: [num] });

async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof onbekendeTegenrekeningen === 'function');
}
const lijst = (page) => page.evaluate(() => onbekendeTegenrekeningen());
const spendCur = (page) => page.evaluate((m) => Math.round(totals(m).spend), CUR);
const catOpDag = (page, dag) => page.evaluate((d) => catOf(TX.find((t) => t.date === d)), `${CUR}-${dag}`);

test.describe('a · vaststellen, zonder te raden', () => {
  test('een tegenrekening zonder eigen boekingen komt in de lijst', async ({ page }) => {
    await boot(page);
    const sp = (await lijst(page)).find((x) => x.num === SPACE);
    expect(sp).toBeTruthy();
    expect(sp.n).toBe(1);
    expect(sp.uit).toBe(1);
    expect(sp.in).toBe(0);
    expect(sp.bedrag).toBe(250);
    expect(sp.namen).toEqual(['Overboeking']);
  });

  test('een eigen rekening uit OWN staat er niet bij', async ({ page }) => {
    await boot(page);
    expect((await lijst(page)).some((x) => x.num === MAIN)).toBe(false);
    expect(await page.evaluate(() => OWN)).toEqual([MAIN]);
  });

  test('een winkel staat er wel bij, maar geldt niet als aanwijzing', async ({ page }) => {
    await boot(page);
    const r = await lijst(page);
    const w = r.find((x) => x.num === WINKEL);
    expect(w).toBeTruthy();                                   // de lijst toont alles: daar kies jij
    expect(await page.evaluate((x) => tegenrekSterk(x), w)).toBe('');
    // en dus geen melding, ook al is dit op bedrag de zwaarste kandidaat
    expect(r[0].num).toBe(WINKEL);
    const keys = await page.evaluate(() => scoreNotifs().map((n) => n.key));
    expect(keys.some((k) => k.startsWith('eigenrek-'))).toBe(false);
  });
});

test.describe('b · twee harde aanwijzingen', () => {
  test('geld dat beide kanten op gaat', async ({ page }) => {
    await boot(page, seed({}, [heen('sp2', CUR, '20', 60, 'Overboeking', SPACE)]));
    const sp = (await lijst(page)).find((x) => x.num === SPACE);
    expect(sp.uit).toBe(1);
    expect(sp.in).toBe(1);
    expect(await page.evaluate((x) => tegenrekSterk(x), sp)).toBe('geld gaat beide kanten op');
  });

  test('een tenaamstelling die we al als jouw naam kennen', async ({ page }) => {
    await boot(page, seed({}, [heen('sp3', CUR, '11', -40, 'Vincent Sumter', '4440001234')]));
    const r = (await lijst(page)).find((x) => x.num === '4440001234');
    expect(await page.evaluate((x) => tegenrekSterk(x), r)).toBe('staat op jouw naam');
    // dezelfde bron als de intern-detectie, geen tweede namenlijst
    expect(await page.evaluate(() => typeof ownNameSet)).toBe('function');
  });

  test('een harde aanwijzing geeft één melding, met wat het nu kost', async ({ page }) => {
    await boot(page, seed({}, [heen('sp2', CUR, '20', 60, 'Overboeking', SPACE)]));
    const n = await page.evaluate(() => scoreNotifs().filter((x) => x.key.startsWith('eigenrek-')));
    expect(n.length).toBe(1);
    expect(n[0].l1).toContain('··4891');
    expect(n[0].l2).toMatch(/telt nu als uitgave/i);
    expect(n[0].act).toBe('openBankSet()');
  });
});

test.describe('c · bevestigen doet precies één ding', () => {
  test('de overboeking houdt op een uitgave te zijn', async ({ page }) => {
    await boot(page);
    const voor = await spendCur(page);
    expect(await catOpDag(page, '10')).not.toBe('intern');
    await page.evaluate((n) => eigenRekJa(n), SPACE);
    expect(await catOpDag(page, '10')).toBe('intern');
    expect(await spendCur(page)).toBe(voor - 250);            // v77: doorstroom valt buiten spend
  });

  test('er ontstaat geen rekening zonder boekingen', async ({ page }) => {
    await boot(page);
    await page.evaluate((n) => eigenRekJa(n), SPACE);
    expect(await page.evaluate(() => OWN)).toEqual([MAIN]);   // v122: OWN blijft afgeleid uit TX
    expect(await page.evaluate(() => allAccounts())).toEqual([MAIN]);
    expect(await page.evaluate(() => totalBalance().known)).toBe(1);
  });

  test('en hij verdwijnt uit de lijst en uit de meldingen', async ({ page }) => {
    await boot(page, seed({}, [heen('sp2', CUR, '20', 60, 'Overboeking', SPACE)]));
    await page.evaluate((n) => eigenRekJa(n), SPACE);
    expect((await lijst(page)).some((x) => x.num === SPACE)).toBe(false);
    const keys = await page.evaluate(() => scoreNotifs().map((n) => n.key));
    expect(keys.some((k) => k.startsWith('eigenrek-'))).toBe(false);
  });

  test('wegtikken haalt hem weg zonder iets aan je cijfers te doen', async ({ page }) => {
    await boot(page);
    const voor = await spendCur(page);
    await page.evaluate((n) => eigenRekNee(n), WINKEL);
    expect((await lijst(page)).some((x) => x.num === WINKEL)).toBe(false);
    expect(await spendCur(page)).toBe(voor);
    expect(await page.evaluate(() => SET.eigenRek || [])).toEqual([]);
  });
});

test.describe('d · de kaart in Instellingen', () => {
  test('toont de kandidaten met de tik naar opnieuw autoriseren', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => onbekendeRekBlok());
    expect(h).toContain('··4891');
    expect(h).toContain('Opnieuw autoriseren');
    expect(h).toContain('psd2Connect()');
    expect(h).toMatch(/niet vanzelf bij/);
  });

  test('geen kandidaten: geen kaart, geen lege staat', async ({ page }) => {
    await boot(page, seed({ eigenRek: [SPACE], eigenRekNiet: [WINKEL] }));
    expect(await page.evaluate(() => onbekendeRekBlok())).toBe('');
    await page.evaluate(() => { go('set'); toggleSet('bank'); });
    expect(await page.locator('#s-set').innerText()).not.toContain('Tegenrekeningen die je niet gekoppeld hebt');
  });

  test('de kaart staat op het bankpaneel en de knoppen werken', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => { go('set'); toggleSet('bank'); });
    const paneel = page.locator('#s-set');
    await expect(paneel).toContainText('Tegenrekeningen die je niet gekoppeld hebt');
    await paneel.locator('.chip', { hasText: 'Van mij' }).first().click();
    expect(await page.evaluate(() => SET.eigenRek)).toContain(WINKEL);   // eerste rij = zwaarste bedrag
  });
});
