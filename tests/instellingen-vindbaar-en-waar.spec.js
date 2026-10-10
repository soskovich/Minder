// v181: oorzaak 1 en 2 uit de Instellingen-audit. Het bestandspad zat achter vijf tikken op een
// voetregel, en het scherm deed twee beweringen die onwaar konden zijn: "Alles blijft op dit
// toestel" met een bankkoppeling of AI-coach aan, en "Je bank is gekoppeld" boven een paneel dat
// "Verbinding verlopen" toonde. De PSD2-koppeling blijft de hoofdroute; het bestandspad is de
// tweede optie en hoeft alleen vindbaar te zijn.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

const DAG = 86400000;
function metBank({ exp = Date.now() + 30 * DAG, url = 'https://x.workers.dev', token = 't' } = {}) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  set.psd2Url = url; set.psd2Token = token;
  set.psd2Accounts = { NL01MAIN0000001111: { bank: 'ABN AMRO', label: 'Betaalrekening', exp: new Date(exp).toISOString() } };
  p.minder_set = JSON.stringify(set);
  return p;
}
function zonder(veranderingen) {
  const p = seed();
  const set = Object.assign(JSON.parse(p.minder_set), veranderingen);
  p.minder_set = JSON.stringify(set);
  return p;
}
async function boot(page, payload) {
  await open(page, payload || seed());
  await page.evaluate(() => { go('set'); openSetSub('bank'); });
  await page.waitForTimeout(60);
}
const setTekst = (page) => page.evaluate(() => $('#s-set').innerText.replace(/\s+/g, ' '));
const bankPaneel = (page) => page.evaluate(() => setBank());

/* v374: PSD2 IS DE BRON. Het bestandspad staat niet meer bij de bank maar onder Gegevens & privacy, bij Historie,
   want een bestand is alleen nog voor de historie van gesloten rekeningen. Het blijft vindbaar zonder easter egg;
   de map-koppeling heeft geen ingang meer in Instellingen (de tests over "Synchroniseer map" zijn daarmee weg). */
test.describe('a · het bestandspad is vindbaar zonder easter egg, bij Historie', () => {
  test('Oude transacties importeren staat onder Gegevens & privacy, niet bij de bank', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => !!SET.advBank)).toBe(false);
    expect(await setTekst(page)).not.toMatch(/Bestand toevoegen|Map koppelen|Of voeg een bestand toe/);
    await page.evaluate(() => openSetSub('gegevens'));
    const t = await setTekst(page);
    expect(t).toContain('Oude transacties importeren');
    expect(t).toContain('MT940 (ABN) of CSV (N26) · voor gesloten rekeningen');
    expect(await page.evaluate(() => document.querySelector('[data-historie]').getAttribute('onclick'))).toContain("getElementById('file').click()");
  });

  test('de koppeling houdt het accent bij de bank', async ({ page }) => {
    await boot(page);
    const html = await bankPaneel(page);
    expect(html).toContain('Bank toevoegen');
    expect(html).not.toMatch(/Bestand toevoegen/);
  });

  test('backend-URL en app-token blijven achter Geavanceerd', async ({ page }) => {
    await boot(page);
    expect(await setTekst(page)).not.toContain('Backend-URL');
    await page.evaluate(() => { SET.advBank = true; save(); renderSet(); });
    expect(await setTekst(page)).toContain('Backend-URL');
    expect(await setTekst(page)).toContain('App-token');
  });
});

test.describe('b · de koppelknop faalt niet stil zonder backend', () => {
  test('hij zegt wat er nodig is en wat je zonder die koppeling wel kunt', async ({ page }) => {
    await boot(page, zonder({ psd2Url: '', psd2Token: '' }));
    expect(await page.evaluate(() => psd2Ready())).toBe(false);
    await page.evaluate(() => psd2Connect());
    await page.waitForSelector('#sheetBg.show');
    const t = (await page.locator('#sheet').innerText()).replace(/\s+/g, ' ');
    expect(t).toContain('Er is nog geen koppeling');
    expect(t).toMatch(/eigen backend/);
    expect(t).toContain('Bestand toevoegen');
    // en hij zet niet ongevraagd een instelling om
    expect(await page.evaluate(() => !!SET.advBank)).toBe(false);
  });

  test('de velden tonen blijft een eigen tik', async ({ page }) => {
    await boot(page, zonder({ psd2Url: '', psd2Token: '' }));
    await page.evaluate(() => psd2Connect());
    await page.waitForSelector('#sheetBg.show');
    await page.evaluate(() => psd2ToonGeavanceerd());
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => !!SET.advBank)).toBe(true);
    expect(await setTekst(page)).toContain('Backend-URL');
  });
});

test.describe('c · de bankstatus telt de vervaldatum mee', () => {
  test('gekoppeld en geldig: een kaart zonder aandachtskleur, en geen statusbalk', async ({ page }) => {
    await boot(page, metBank());
    const B = await page.evaluate(() => bankStand());
    expect(B).toMatchObject({ verlopen: false, sub: 'Je bank is gekoppeld', col: '' });
    expect(await bankPaneel(page)).toContain('data-rood="0"');
    expect(await page.evaluate(() => { openSetSub(null); return !!document.getElementById('setStatus'); })).toBe(false);
  });

  test('gekoppeld en verlopen: de kaart en de statusbalk zeggen het, niet "gekoppeld"', async ({ page }) => {
    await boot(page, metBank({ exp: Date.now() - DAG }));
    const B = await page.evaluate(() => bankStand());
    expect(B).toMatchObject({ verlopen: true, sub: 'Verbinding verlopen', col: 'var(--amber)' });
    expect(await bankPaneel(page)).toContain('data-rood="1"');
    expect(await bankPaneel(page)).toContain('Toestemming vernieuwen');
    const t = await page.evaluate(() => { openSetSub(null); return $('#s-set').innerText.replace(/\s+/g, ' '); });
    expect(t).toMatch(/Gegevens van ABN tot/);
    expect(t).not.toContain('Je bank is gekoppeld');
  });

  test('nog geen bank: geen kaart en geen balk', async ({ page }) => {
    await boot(page);
    const B = await page.evaluate(() => bankStand());
    expect(B).toMatchObject({ n: 0, verlopen: false, sub: 'Nog geen bank gekoppeld', col: '' });
    expect(await page.evaluate(() => { openSetSub(null); return !!document.getElementById('setStatus'); })).toBe(false);
  });
});

test.describe('d · de privacyregel volgt beide koppelingen', () => {
  test('niets aan: alles blijft op dit toestel', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => privacySub())).toBe('Alles blijft op dit toestel');
    expect(await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = setPrivacy(); return d.innerText; })).toMatch(/^Waar staat je data[^\n]*\s*lokaal ·/);
  });

  test('alleen de bankkoppeling', async ({ page }) => {
    await boot(page, metBank());
    expect(await page.evaluate(() => privacySub())).toBe('Lokaal, behalve je bankkoppeling');
    expect(await page.evaluate(() => setPrivacy())).toContain('bankkoppeling');
  });

  test('alleen de AI-coach', async ({ page }) => {
    await boot(page, zonder({ aiCoach: true }));
    expect(await page.evaluate(() => privacySub())).toBe('Lokaal, behalve de AI-coach');
    expect(await page.evaluate(() => setPrivacy())).toContain('AI-coach');
  });

  test('allebei', async ({ page }) => {
    const p = metBank();
    const set = JSON.parse(p.minder_set); set.aiCoach = true; p.minder_set = JSON.stringify(set);
    await boot(page, p);
    expect(await page.evaluate(() => privacySub())).toBe('Lokaal, behalve je bankkoppeling en de AI-coach');
    const t = await setTekst(page);
    expect(t).not.toContain('Alles blijft op dit toestel');
  });

  test('de uitleg achter de ⓘ noemt allebei als uitzondering', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => NOTES.datalokaal);
    expect(t).toContain('bankkoppeling');
    expect(t).toContain('AI-coach');
    expect(await page.evaluate(() => setPrivacy())).toContain("showTip(event,'datalokaal')");
  });
});

test.describe('e · de AI-coach zegt wat er verandert, niet hoe je het bouwt', () => {
  /* v374: de schakelaar staat een keer, bij Coach & weergave; de uitleg zit achter de ⓘ. De bouwinstructie en het
     modelveld blijven bij de backend-URL onder Geavanceerd. */
  test('de schakelaar staat bij de coach, zonder bouwinstructie', async ({ page }) => {
    await open(page, zonder({ aiCoach: true }));
    const t = await page.evaluate(() => setCoachWeergave() + NOTES.aicoach);
    expect(t).toContain('AI-coach');
    expect(t).toMatch(/coach-tekst gaat naar je eigen backend/);
    expect(t).not.toContain('/coach');
    expect(t).not.toMatch(/LLM-key|secret/);
    expect(t).not.toContain('claude-3-5-haiku-latest');
  });

  test('de instructie en het modelveld staan bij de backend-URL', async ({ page }) => {
    await boot(page, zonder({ advBank: true }));
    const t = await setTekst(page);
    expect(t).toContain('Backend-URL');
    expect(t).toContain('/coach');
    expect(t).toMatch(/LLM-key/);
    expect(t).toContain('AI-model (optioneel)');
  });
});

test.describe('f · onbekend blijft onbekend in de subregels', () => {
  test('lege app: geen stellige nullen', async ({ page }) => {
    // de gedeelde fixture-open wacht op transacties; een lege app heeft die per definitie niet
    await page.route('**/sw.js', (r) => r.abort());
    await page.addInitScript(() => {
      localStorage.setItem('minder_tx', '[]');
      localStorage.setItem('minder_set', JSON.stringify({ mode: 'begeleid' }));
    });
    await page.goto('/index.html');
    await page.waitForFunction(() => typeof renderSet === 'function');
    await page.evaluate(() => go('set'));
    await page.waitForTimeout(80);
    const t = await setTekst(page);
    expect(t).not.toContain('sparen €0');
    expect(t).not.toContain('€0 per maand');
    expect(t).toContain('sparen nog onbekend');
    expect(t).toContain('je inkomen is nog onbekend');
  });

  test('met inkomen staan de bedragen er gewoon', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => go('set'));
    const t = await setTekst(page);
    expect(t).toMatch(/€3\.000 per maand/);
    expect(t).toMatch(/sparen €\d/);
  });

  test('rekeningen zonder bekend saldo: saldo onbekend, geen €0,00 totaal', async ({ page }) => {
    await boot(page, zonder({ manualBal: {} }));
    expect(await page.evaluate(() => totalBalance().known)).toBe(0);
    const t = await page.evaluate(() => setBank());
    expect(t).not.toContain('data-rektotaal');   // geen totaal van €0,00 zonder een bekend saldo
    expect(t).not.toContain('€0,00');
  });
});
