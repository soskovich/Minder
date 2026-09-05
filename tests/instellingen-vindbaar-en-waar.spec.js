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
  await page.evaluate(() => { go('set'); toggleSet('bank'); });
  await page.waitForTimeout(60);
}
const setTekst = (page) => page.evaluate(() => $('#s-set').innerText.replace(/\s+/g, ' '));
const bankPaneel = (page) => page.evaluate(() => setBank());

test.describe('a · het bestandspad is vindbaar zonder easter egg', () => {
  test('de drie ingangen staan in beeld zonder bankAdvTap', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => !!SET.advBank)).toBe(false);   // geavanceerd staat uit
    const t = await setTekst(page);
    expect(t).toContain('Bestand toevoegen');
    expect(t).toMatch(/Of voeg een bestand toe/);
    // Map koppelen verschijnt alleen waar de browser de File System Access API heeft
    const fsa = await page.evaluate(() => FSA);
    if (fsa) expect(t).toContain('Map koppelen');
  });

  test('met een gekoppelde map staat Synchroniseer map er ook zonder geavanceerd', async ({ page }) => {
    await boot(page, zonder({ folderName: 'Bank-export' }));
    expect(await page.evaluate(() => !!SET.advBank)).toBe(false);
    const t = await setTekst(page);
    expect(t).toContain('Synchroniseer map');
    expect(t).toContain('Bank-export');
  });

  test('de koppeling houdt de plek bovenaan en als enige het accent', async ({ page }) => {
    await boot(page);
    const html = await bankPaneel(page);
    const koppel = html.indexOf('Koppel je bank');
    const bestand = html.indexOf('Of voeg een bestand toe');
    expect(koppel).toBeGreaterThan(-1);
    expect(bestand).toBeGreaterThan(koppel);          // tweede optie, niet de eerste
    // de enige btn zonder sec is de koppelknop; het bestandspad is helemaal btn sec
    const naBestand = html.slice(bestand);
    expect(naBestand).not.toMatch(/class="btn"/);
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
  test('gekoppeld en geldig: groen paneel, geen aandachtskleur', async ({ page }) => {
    await boot(page, metBank());
    const B = await page.evaluate(() => bankStand());
    expect(B).toMatchObject({ verlopen: false, sub: 'Je bank is gekoppeld', col: '' });
    expect(await bankPaneel(page)).toContain('Bank gekoppeld');
  });

  test('gekoppeld en verlopen: de subregel volgt het paneel, en krijgt de aandachtskleur', async ({ page }) => {
    await boot(page, metBank({ exp: Date.now() - DAG }));
    const B = await page.evaluate(() => bankStand());
    expect(B).toMatchObject({ verlopen: true, sub: 'Verbinding verlopen', col: 'var(--amber)' });
    const t = await setTekst(page);
    expect(t).toContain('Verbinding verlopen');
    expect(t).not.toContain('Je bank is gekoppeld');
    expect(await bankPaneel(page)).toContain('Verbinding verlopen');
  });

  test('nog geen bank: grijs, niet amber', async ({ page }) => {
    await boot(page);
    const B = await page.evaluate(() => bankStand());
    expect(B).toMatchObject({ n: 0, verlopen: false, sub: 'Nog geen bank gekoppeld', col: '' });
    // de staat waarin je iets moet doen is nu luider dan de staat waarin niets aan de hand is
    const stil = await page.evaluate(() => bankStand().col);
    await page.evaluate(() => {
      SET.psd2Accounts = { a: { bank: 'X', label: 'Y', exp: new Date(Date.now() - 86400000).toISOString() } };
    });
    expect(await page.evaluate(() => bankStand().col)).not.toBe(stil);
  });
});

test.describe('d · de privacyregel volgt beide koppelingen', () => {
  test('niets aan: alles blijft op dit toestel', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => privacySub())).toBe('Alles blijft op dit toestel');
    expect(await page.evaluate(() => setPrivacy())).toContain('geen van beide aan');
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

  test('de paneeltekst noemt allebei als uitzondering', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => setPrivacy());
    expect(t).toContain('live bankkoppeling');
    expect(t).toContain('AI-coach');
    expect(t).not.toContain('Niets gaat naar een server (behalve');
  });
});

test.describe('e · de AI-coach zegt wat er verandert, niet hoe je het bouwt', () => {
  /* v182: de schakelaar is naar Bankkoppeling verhuisd, bij de backend-URL waarop hij draait.
     Wat deze test bewaakt is onveranderd: hij zegt wat er verandert, niet hoe je het bouwt. */
  test('de schakelaar staat bij zijn configuratie, zonder bouwinstructie', async ({ page }) => {
    await open(page, zonder({ aiCoach: true }));
    const t = await page.evaluate(() => setBank());
    expect(t).toContain('AI-coach');
    expect(t).toMatch(/coach-tekst gaat naar je eigen backend/);
    expect(t).not.toContain('/coach');
    expect(t).not.toMatch(/LLM-key|secret/);
    expect(t).not.toContain('claude-3-5-haiku-latest');   // het modelveld staat bij de backend
  });

  test('de instructie en het modelveld staan bij de backend-URL', async ({ page }) => {
    await boot(page, zonder({ advBank: true }));
    const t = await setTekst(page);
    expect(t).toContain('Backend-URL');
    expect(t).toContain('/coach');
    expect(t).toMatch(/LLM-key/);
    expect(t).toContain('Model (optioneel)');
  });

  test('aan zonder backend zegt de app dat de lokale coach aan het woord blijft', async ({ page }) => {
    await open(page, zonder({ aiCoach: true, psd2Url: '', psd2Token: '' }));
    expect(await page.evaluate(() => setBank())).toContain('nog niet ingesteld');
    await open(page, zonder({ aiCoach: true, psd2Url: 'https://x.workers.dev', psd2Token: 't' }));
    expect(await page.evaluate(() => setBank())).toContain('Die staat ingesteld');
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
    expect(t).not.toContain('Je spaart €0 per maand');
    expect(t).not.toContain('Je ontvangt €0 per maand');
    expect(t).toContain('Je spaarinleg is nog onbekend');
    expect(t).toContain('Je inkomen is nog onbekend');
  });

  test('met inkomen staan de bedragen er gewoon', async ({ page }) => {
    await open(page, seed());
    await page.evaluate(() => go('set'));
    const t = await setTekst(page);
    expect(t).toMatch(/Je ontvangt €3\.000 per maand/);
    expect(t).toMatch(/Je spaart €\d/);
  });

  test('rekeningen zonder bekend saldo: saldo onbekend, geen €0,00 totaal', async ({ page }) => {
    await boot(page, zonder({ manualBal: {} }));
    expect(await page.evaluate(() => totalBalance().known)).toBe(0);
    const t = await page.evaluate(() => setIncome());
    expect(t).toContain('saldo onbekend');
    expect(t).not.toContain('€0,00 totaal');
  });
});
