// v142: de afspraaklus sluiten. Het maandscherm opent met de uitkomst van de afspraak van vorige
// maand. Kritiek: er wordt nooit geraden. Alleen een afspraak met een categorie is objectief te
// toetsen; al het andere vraagt de app je zelf, en dat is het hoofdpad, geen uitzondering.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1, M2, MAIN } = require('./budget-fixture');

const vorigeMaandTs = (dag) => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth() - 1, dag || 15, 12).getTime();
};

function metLog(log, extra) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.coachLog = log;
  if (extra) extra(set, p);
  p.minder_set = JSON.stringify(set);
  return p;
}

// de fixture geeft boodschappen 400 in M2 en M1, en 300 in de lopende maand.
// Voor een gelukte afspraak zetten we M1 lager dan M2, voor een mislukte juist hoger.
function metBoodschappen(m1Bedrag) {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  for (const t of tx) if (t.id === 'ah-' + M1) t.amount = -m1Bedrag;
  p.minder_tx = JSON.stringify(tx);
  return p;
}

function metAfspraak(af, m1Bedrag) {
  const p = m1Bedrag != null ? metBoodschappen(m1Bedrag) : seed();
  const set = JSON.parse(p.minder_set);
  set.coachLog = [Object.assign({ ts: vorigeMaandTs(), type: 'afspraak' }, af)];
  p.minder_set = JSON.stringify(set);
  return p;
}

async function maand(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => go('maand'));
  await page.waitForSelector('#s-maand .card');
}
const kaart = (page) => page.locator('#s-maand .card').first().innerText();

test.describe('a · vorigeAfspraak kijkt precies één maand terug', () => {
  test('vindt de afspraak van vorige maand', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'minder boodschappen', cat: 'boodschappen' }, 200));
    const af = await page.evaluate(() => vorigeAfspraak());
    expect(af.text).toBe('minder boodschappen');
  });

  test('een afspraak van deze maand telt niet mee', async ({ page }) => {
    await maand(page, metLog([{ ts: Date.now(), type: 'afspraak', text: 'van nu' }]));
    expect(await page.evaluate(() => vorigeAfspraak())).toBeNull();
  });

  test('twee maanden terug telt niet mee', async ({ page }) => {
    const n = new Date();
    const ts = new Date(n.getFullYear(), n.getMonth() - 2, 15, 12).getTime();
    await maand(page, metLog([{ ts, type: 'afspraak', text: 'te oud' }]));
    expect(await page.evaluate(() => vorigeAfspraak())).toBeNull();
  });

  test('alleen type afspraak, en de nieuwste wint', async ({ page }) => {
    await maand(page, metLog([
      { ts: vorigeMaandTs(20), type: 'tip', text: 'een tip' },
      { ts: vorigeMaandTs(18), type: 'afspraak', text: 'de nieuwste' },
      { ts: vorigeMaandTs(2), type: 'afspraak', text: 'de oudste' },
      { ts: vorigeMaandTs(1), type: 'beslis', text: 'een beslissing' },
    ]));
    expect((await page.evaluate(() => vorigeAfspraak())).text).toBe('de nieuwste');
  });

  test('geen afspraak vorige maand geeft geen regel', async ({ page }) => {
    await maand(page, metLog([]));
    expect(await page.evaluate(() => vorigeAfspraak())).toBeNull();
    expect(await page.evaluate(() => maandAfspraakLus())).toBe('');
    expect(await page.locator('#s-maand').innerText()).not.toMatch(/vorige maand sprak je af/i);
  });
});

test.describe('b · met categorie: de cijfers beslissen', () => {
  test('gelukt: de categorie ging omlaag', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'strakker boodschappen', cat: 'boodschappen' }, 200));
    const U = await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()));
    expect(U.status).toBe('gelukt');
    expect(U.toen.maand).toBe(M2);
    expect(U.nu.maand).toBe(M1);
    expect(U.toen.bedrag).toBeGreaterThan(U.nu.bedrag);

    const t = await kaart(page);
    expect(t).toMatch(/vorige maand sprak je af: strakker boodschappen/i);
    expect(t).toMatch(/Boodschappen ging van €\d.* naar €\d/);
    expect(t).not.toMatch(/goed|knap|jammer|helaas|probeer/i);   // geen oordeel over jou
  });

  test('niet gelukt: gelijk of hoger, in dezelfde vorm en zonder verwijt', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'strakker boodschappen', cat: 'boodschappen' }, 600));
    const U = await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()));
    expect(U.status).toBe('niet gelukt');

    const t = await kaart(page);
    expect(t).toMatch(/vorige maand sprak je af: strakker boodschappen/i);
    expect(t).toMatch(/Boodschappen ging van €\d.* naar €\d/);
    expect(t).not.toMatch(/jammer|helaas|volgende keer|probeer|beter/i);
    expect(t).not.toMatch(/gelukt|niet gelukt/i);                // het cijfer spreekt, niet een label
  });

  test('binnen de marge telt niet als daling', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'x', cat: 'boodschappen' }, 399));   // 400 -> 399
    expect(await page.evaluate(() => AFSPRAAK_MARGE)).toBeGreaterThan(0);
    expect((await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()))).status).toBe('niet gelukt');
  });
});

test.describe('c · niet te toetsen is een volwaardige uitkomst', () => {
  test('zonder categorie wordt er niets afgeleid uit de tekst', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'ik ga minder uitgeven aan boodschappen', regel: 'doel' }));
    const U = await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()));
    expect(U).toEqual({ status: 'niet te toetsen', tekst: 'ik ga minder uitgeven aan boodschappen', toen: null, nu: null });
    // de tekst noemt een categorie, maar er wordt niet op trefwoorden herkend
    expect(await page.evaluate(() => /boodschappen|indexOf|match|test\(/.test(afspraakUitkomst.toString().replace(/\/\*[\s\S]*?\*\//g, '')))).toBe(false);
  });

  test('een regelKey zonder categorie is niet toetsbaar', async ({ page }) => {
    for (const regel of ['dekking', 'buffer', 'aansluiting', 'doel']) {
      await maand(page, metAfspraak({ text: 'iets', regel }));
      expect((await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()))).status).toBe('niet te toetsen');
    }
  });

  test('ontbrekende maanddata geeft niet te toetsen, geen oordeel', async ({ page }) => {
    // een afspraak met categorie, maar de maand ervóór bestaat niet in de data
    const p = seed();
    const tx = JSON.parse(p.minder_tx).filter((t) => String(t.date).slice(0, 7) !== M2);
    p.minder_tx = JSON.stringify(tx);
    const set = JSON.parse(p.minder_set);
    set.coachLog = [{ ts: vorigeMaandTs(), type: 'afspraak', text: 'x', cat: 'boodschappen' }];
    p.minder_set = JSON.stringify(set);
    await maand(page, p);
    expect((await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()))).status).toBe('niet te toetsen');
  });

  test('een categorie zonder uitgaven in de referentiemaand geeft geen oordeel', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'x', cat: 'vakantie' }));
    expect((await page.evaluate(() => afspraakUitkomst(vorigeAfspraak()))).status).toBe('niet te toetsen');
  });
});

test.describe('d · de zelfopgave', () => {
  test('van begin tot eind', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'elke week één keer koken uit de voorraad', regel: 'patroon' }));
    let t = await kaart(page);
    expect(t).toMatch(/niet uit je cijfers af te lezen. is het gelukt\?/i);

    await page.locator('#s-maand .chip', { hasText: 'Gelukt' }).first().click();
    await page.waitForFunction(() => (SET.coachLog || []).some((l) => l.type === 'reflectie'));

    const r = await page.evaluate(() => (SET.coachLog || []).find((l) => l.type === 'reflectie'));
    const af = await page.evaluate(() => vorigeAfspraak());
    expect(r.text).toBe('gelukt');
    expect(String(r.af)).toBe(String(af.ts));

    t = await kaart(page);
    expect(t).toMatch(/je gaf zelf aan: gelukt/i);
    expect(t).not.toMatch(/is het gelukt\?/i);
  });

  test('"niet gelukt" werkt net zo en wordt zonder verwijt getoond', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'iets afspreken', regel: 'buffer' }));
    await page.locator('#s-maand .chip', { hasText: 'Niet gelukt' }).first().click();
    await page.waitForFunction(() => (SET.coachLog || []).some((l) => l.type === 'reflectie'));
    const t = await kaart(page);
    expect(t).toMatch(/je gaf zelf aan: niet gelukt/i);
    expect(t).not.toMatch(/jammer|helaas|volgende keer|probeer/i);
  });

  test('de afspraak zelf wordt niet aangeraakt', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'iets', regel: 'buffer' }));
    const voor = await page.evaluate(() => JSON.stringify((SET.coachLog || []).filter((l) => l.type === 'afspraak')));
    await page.locator('#s-maand .chip', { hasText: 'Gelukt' }).first().click();
    await page.waitForFunction(() => (SET.coachLog || []).some((l) => l.type === 'reflectie'));
    expect(await page.evaluate(() => JSON.stringify((SET.coachLog || []).filter((l) => l.type === 'afspraak')))).toBe(voor);
  });
});

test.describe('e · één keer per maand', () => {
  test('"Gezien" laat de regel verdwijnen en onthoudt dat', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'x', cat: 'boodschappen' }, 200));
    expect(await page.locator('#s-maand').innerText()).toMatch(/vorige maand sprak je af/i);

    await page.locator('#s-maand >> text=Gezien').click();
    await page.waitForFunction(() => !!SET.afspraakGezien);
    expect(await page.locator('#s-maand').innerText()).not.toMatch(/vorige maand sprak je af/i);

    const G = await page.evaluate(() => SET.afspraakGezien);
    const af = await page.evaluate(() => vorigeAfspraak());
    expect(String(G.ts)).toBe(String(af.ts));
    // dezelfde vorm als coachRecall: dezelfde afspraak, dezelfde maand
    expect(G.ym).toBe(await page.evaluate(() => coYm(Date.now())));
    await page.evaluate(() => { load(); renderMaand(); });
    expect(await page.locator('#s-maand').innerText()).not.toMatch(/vorige maand sprak je af/i);
  });

  test('een afspraak van deze maand laat de regel ook verdwijnen', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'x', cat: 'boodschappen' }, 200));
    expect(await page.evaluate(() => maandAfspraakLus())).not.toBe('');
    await page.evaluate(() => { coachLogAdd({ type: 'afspraak', text: 'die van nu' }); renderMaand(); });
    expect(await page.evaluate(() => maandAfspraakLus())).toBe('');
  });

  test('geen streak, geen teller, geen score', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'x', cat: 'boodschappen' }, 200));
    const t = await kaart(page);
    expect(t).not.toMatch(/\d+\s*(x|keer|maanden op rij|op rij)/i);
    expect(t).not.toMatch(/streak|score|punten|niveau/i);
  });
});

test.describe('f · plaats en layout', () => {
  test('de regel staat vóór het oordeel en vóór de vijf regels', async ({ page }) => {
    await maand(page, metAfspraak({ text: 'x', cat: 'boodschappen' }, 200));
    const eerste = await page.locator('#s-maand > .card').first().innerText();
    expect(eerste).toMatch(/je afspraak van vorige maand/i);
    const tweede = await page.locator('#s-maand > .card').nth(1).innerText();
    expect(tweede).toMatch(/je maand/i);
  });

  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await maand(page, metAfspraak({ text: 'een wat langere afspraak over boodschappen doen', regel: 'patroon' }));
      const over = await page.evaluate(() => ({
        m: document.querySelector('#s-maand').scrollWidth - document.querySelector('#s-maand').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.m).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
