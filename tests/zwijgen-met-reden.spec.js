// v206: vrijPerDagLine() verdween geruisloos zodra één rekening geen bekend saldo had. De drempel
// zelf blijft streng (v158: een dagbedrag is een deling, en delen door een onvolledige som geeft
// een getal dat preciezer oogt dan het is), maar wat ontbrak was de tweede helft van v173: niet
// rekenen waar je het niet weet, wel zeggen wat je niet weet. Van de zeven plekken die op hetzelfde
// onvolledige saldo leunen benoemde alleen de opbouw-sheet het.
//
// De verbergen-instelling (SET.toonLegeRek) is hier NIET de oorzaak en raakt geen enkel cijfer;
// deze spec legt dat allebei vast, zodat de diagnose niet opnieuw die kant op wijst.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const REDEN = 'Geen bedrag per dag: een deel van je saldo is nog onbekend';
const DAGBEDRAG = /Nog \d+ dagen deze maand, dus /;

// een rekening MET boekingen en ZONDER saldo: die komt in OWN en maakt totalBalance() onvolledig
function deelOnbekend() {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  tx.push({ id: 'dood-1', date: tx[tx.length - 1].date, amount: -1, acc: 'NL99DOOD0000009999',
    name: 'Oude rekening', desc: 'OUD', typ: '', ref: '', src: 'csv', accName: 'Oud', refNums: [] });
  p.minder_tx = JSON.stringify(tx);
  return p;
}
// helemaal geen saldo: dan staat de onbekend-hero er met zijn eigen reden en ingang
function geenSaldo() {
  const p = seed();
  const s = JSON.parse(p.minder_set);
  delete s.manualBal;
  p.minder_set = JSON.stringify(s);
  return p;
}
const home = (page) => page.evaluate(() => { go('dash'); return $('#s-dash').innerText || ''; });

test.describe('a - de drie staten van het dagbedrag', () => {
  test('alles bekend: het bedrag staat er, zonder reden-regel', async ({ page }) => {
    await open(page, seed());
    const t = await home(page);
    expect(t).toMatch(DAGBEDRAG);
    expect(t).not.toContain(REDEN);
    expect(await page.evaluate(() => vrijPerDag().volledig)).toBe(true);
  });

  test('deel onbekend: geen bedrag, wel de reden', async ({ page }) => {
    await open(page, deelOnbekend());
    const t = await home(page);
    expect(t).not.toMatch(DAGBEDRAG);
    expect(t).toContain(REDEN);
    const V = await page.evaluate(() => vrijPerDag());
    expect(V.volledig).toBe(false);
    expect(V.known).toBeGreaterThan(0);
    expect(V.missing).toBeGreaterThan(0);
  });

  test('niets bekend: de hero zegt het al, de regel zwijgt volledig', async ({ page }) => {
    await open(page, geenSaldo());
    const t = await home(page);
    expect(t).toContain('onbekend');
    expect(t).not.toMatch(DAGBEDRAG);
    expect(t).not.toContain(REDEN);   // geen doublure op de onbekend-hero
    expect(await page.evaluate(() => vrijPerDagLine())).toBe('');
    expect(await page.evaluate(() => vrijPerDag().known)).toBe(0);
  });
});

test.describe('b - geen tweede vorm, en geen benadering', () => {
  test('de zin en de ingang komen uit de opbouw-sheet', async ({ page }) => {
    await open(page, deelOnbekend());
    const r = await page.evaluate(() => {
      const regel = vrijPerDagLine();
      openSafeToSpend();
      const sheet = $('#sheet').innerText || '';
      closeSheet();
      return { regel, sheet };
    });
    // Dezelfde formulering als de rij Totaal saldo in die sheet. Niet woordelijk gelijk: daar staat
    // 'een deel is nog onbekend' onder het label Totaal saldo, en deze regel staat los, dus die
    // noemt zijn onderwerp erbij. Wat gedeeld moet blijven is de formulering zelf.
    expect(r.sheet).toContain('een deel is nog onbekend');
    expect(r.regel).toContain('een deel van je saldo is nog onbekend');
    // en dezelfde ingang
    expect(r.regel).toContain('openBalances()');
  });

  test('geen bedrag en geen benadering in de reden-regel', async ({ page }) => {
    await open(page, deelOnbekend());
    const r = await page.evaluate(() => vrijPerDagLine());
    const tekst = r.replace(/<[^>]*>/g, '');
    expect(tekst).not.toMatch(/€|\d/);           // geen enkel getal
    for (const w of ['ongeveer', 'ruwweg', 'circa', 'ongeveer', 'schatting']) expect(tekst.toLowerCase()).not.toContain(w);
  });

  test('de regel staat op zijn eigen regel, niet tegen de saldo-regel aan', async ({ page }) => {
    await open(page, deelOnbekend());
    const regels = (await home(page)).split('\n').map((x) => x.trim()).filter(Boolean);
    const i = regels.findIndex((x) => x.indexOf(REDEN) >= 0);
    expect(i).toBeGreaterThan(-1);
    expect(regels[i]).toMatch(/^Geen bedrag per dag/);   // niets ervoor op dezelfde regel
    expect(regels[i - 1]).toContain('totaal saldo');
  });

  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await open(page, deelOnbekend());
      await home(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
});

test.describe('c - de drempel is niet versoepeld', () => {
  test('volledig blijft dezelfde formule, en er wordt niets doorgerekend', async ({ page }) => {
    await open(page, deelOnbekend());
    const r = await page.evaluate(() => {
      const S = safeToSpend(); const V = vrijPerDag();
      return { formule: V.volledig === (S.known > 0 && !S.missing), volledig: V.volledig,
        toontBedrag: vrijPerDagLine().indexOf('per dag.') >= 0 };
    });
    expect(r.formule).toBe(true);
    expect(r.volledig).toBe(false);
    expect(r.toontBedrag).toBe(false);
  });

  test('known en missing komen uit safeToSpend, niet uit een eigen afleiding', async ({ page }) => {
    await open(page, deelOnbekend());
    const r = await page.evaluate(() => {
      const S = safeToSpend(); const V = vrijPerDag();
      return [V.known === S.known, V.missing === S.missing];
    });
    expect(r).toEqual([true, true]);
  });
});

test.describe('d - de verbergen-instelling is niet de oorzaak', () => {
  test('SET.toonLegeRek raakt geen enkel cijfer', async ({ page }) => {
    await open(page, deelOnbekend());
    const meet = () => page.evaluate(() => {
      const tb = totalBalance(); const S = safeToSpend(); const L = monthLiquidity(); const V = vrijPerDag();
      return JSON.stringify({ tb, safe: S.safe, missing: S.missing, known: S.known,
        L: { sum: L.sum, missing: L.missing, projected: L.projected },
        V, regel: vrijPerDagLine(),
        buffer: bufferMaanden(), spaar: spaarSaldo().cur, res: resSaldo() });
    });
    const uit = await meet();
    await page.evaluate(() => { SET.toonLegeRek = true; save(); });
    const aan = await meet();
    expect(aan).toBe(uit);
  });

  test('hij filtert alleen de weergave van de rekeningenlijst', async ({ page }) => {
    await open(page, deelOnbekend());
    const r = await page.evaluate(() => {
      const a = { own: OWN.length, alle: allAccounts().length, zicht: zichtbareRek().length };
      SET.toonLegeRek = true; save();
      const b = { own: OWN.length, alle: allAccounts().length, zicht: zichtbareRek().length };
      return { a, b };
    });
    expect(r.a.own).toBe(r.b.own);
    expect(r.a.alle).toBe(r.b.alle);
    expect(r.b.zicht).toBe(r.a.zicht + 1);   // alleen de lijst wordt langer
  });
});

test.describe('e - een rekening zonder boekingen raakt dit niet', () => {
  // v122: OWN komt uit TX, dus een rekening die de bank wel deelt maar waarop geen boeking staat
  // valt buiten totalBalance() en maakt de som dus niet onvolledig
  test('het dagbedrag blijft staan', async ({ page }) => {
    const p = seed();
    const s = JSON.parse(p.minder_set);
    s.psd2Accounts = { NL99LEEG0000008888: { label: 'Gesloten rekening', uid: 'u9', iban: 'NL99LEEG0000008888' } };
    p.minder_set = JSON.stringify(s);
    await open(page, p);
    const t = await home(page);
    expect(t).toMatch(DAGBEDRAG);
    expect(t).not.toContain(REDEN);
    const r = await page.evaluate(() => ({
      own: OWN.length, alle: allAccounts().length,
      zonderBoekingen: rekZonderBoekingen().length, missing: totalBalance().missing,
    }));
    expect(r.alle).toBe(r.own + 1);
    expect(r.zonderBoekingen).toBe(1);
    expect(r.missing).toBe(0);
  });
});
