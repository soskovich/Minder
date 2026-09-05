// v141: vierde coach-ingang, vanaf het maandscherm. Dit is het maandgesprek: het opent bij één
// regel van de vijf, in de zin die daar al staat, en eindigt in een afspraak die je volgende maand
// terugziet. Anders dan 'lek' en 'horizon' mag dit onderwerp wél een afspraak wegschrijven.
// Kritiek: de oude afspraak verdwijnt pas op het moment dat de nieuwe er staat.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR } = require('./budget-fixture');

const overMaanden = (n) => {
  const d = new Date(); d.setMonth(d.getMonth() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

function tweak(fn) {
  const p = seed();
  const set = JSON.parse(p.minder_set);
  fn(set);
  p.minder_set = JSON.stringify(set);
  return p;
}

const metDoel = (extra) => tweak((s) => {
  s.goals = [{ id: 'gA', naam: 'Kosten koper huis', doel: 12000, gespaard: 0,
    allocMode: 'fixed', perMaand: 100, streefdatum: overMaanden(6) }];
  s.planOrder = ['gA', 'noodfonds'];
  if (extra) extra(s);
});

// twee tekorten: de buffer van de fixture dekt maar twee maanden, en het doel haalt zijn datum
// niet. buffer staat vóór doel in MAAND_VOLGORDE, dus die hoort te winnen.
const tweeTekorten = (extra) => metDoel(extra);

// één tekort: met een ruime spaarrekening is de buffer op peil en blijft alleen het doel over
const eenTekort = (extra) => metDoel((s) => {
  s.manualBal = { NL01MAIN0000001111: 4000, NL01SAVE0000004323: 50000 };
  if (extra) extra(s);
});

async function maand(page, payload) {
  await open(page, payload || eenTekort());
  await page.evaluate(() => go('maand'));
  await page.waitForSelector('#s-maand .card');
}
const wachtKeuze = (page) => page.waitForFunction(
  () => document.querySelectorAll('#coCh .cch').length > 0, null, { timeout: 15000 });
async function kies(page, txt) {
  await page.waitForFunction((t) => [...document.querySelectorAll('#coCh .cch')].some((b) => b.innerText.indexOf(t) >= 0), txt, { timeout: 15000 });
  await page.locator('#coCh .cch', { hasText: txt }).first().click();
}
const log = (page) => page.evaluate(() => JSON.stringify(SET.coachLog || []));
const afspraken = async (page) => JSON.parse(await log(page)).filter((l) => l.type === 'afspraak');

test.describe('a · de ingang kiest de zwaarste regel', () => {
  test('één tekort: de zin noemt die regel en de woorden van het scherm', async ({ page }) => {
    await maand(page);
    const t = await page.locator('#s-maand').innerText();
    expect(t).toMatch(/Kosten koper huis vraagt een beslissing\. Zullen we dat doorlopen\?/);
    const z = await page.evaluate(() => coMaandZwaarste(maandRegels()));
    expect(z.key).toBe('doel');
    expect(z.status).toBe('tekort');
  });

  test('meerdere tekorten: de vaste volgorde beslist', async ({ page }) => {
    await maand(page, tweeTekorten());
    const st = await page.evaluate(() => maandRegels().map((r) => [r.key, r.status]));
    const tekorten = st.filter((x) => x[1] === 'tekort').map((x) => x[0]);
    expect(tekorten.length).toBeGreaterThan(1);

    const z = await page.evaluate(() => coMaandZwaarste(maandRegels()));
    const eerste = await page.evaluate((ks) => ks.slice().sort((a, b) => MAAND_VOLGORDE.indexOf(a) - MAAND_VOLGORDE.indexOf(b))[0], tekorten);
    expect(z.key).toBe(eerste);
    expect(z.key).toBe('buffer');                            // buffer staat vóór doel
    expect(await page.locator('#s-maand').innerText()).toMatch(/Buffer in maanden vraagt een beslissing/);
  });

  test('tekort weegt zwaarder dan let op', async ({ page }) => {
    await maand(page);
    const uit = await page.evaluate(() => coMaandZwaarste([
      { key: 'aansluiting', status: 'let op' }, { key: 'doel', status: 'tekort' }]));
    expect(uit.key).toBe('doel');
    // en binnen dezelfde status telt de schermvolgorde
    const uit2 = await page.evaluate(() => coMaandZwaarste([
      { key: 'aansluiting', status: 'let op' }, { key: 'buffer', status: 'let op' }]));
    expect(uit2.key).toBe('buffer');
  });
});

test.describe('b · alles ok, en alleen onbekend', () => {
  test('alles ok geeft een rustige zin naar het gewone gesprek, zonder felicitatie', async ({ page }) => {
    await maand(page);
    const html = await page.evaluate(() => maandCoachIngang([{ key: 'buffer', status: 'ok' }, { key: 'doel', status: 'ok' }]));
    expect(html).toContain("coStart('algemeen'");
    expect(html).toMatch(/niets te beslissen/);
    expect(html).not.toMatch(/goed|knap|mooi|gefeliciteerd|top/i);
  });

  test('alleen onbekende regels geeft geen ingang', async ({ page }) => {
    await maand(page);
    expect(await page.evaluate(() => maandCoachIngang([{ key: 'dekking', status: 'onbekend' }]))).toBe('');
  });
});

test.describe('c · het gesprek', () => {
  test('opent bij die ene regel, in de zin van het scherm, zonder groet', async ({ page }) => {
    await maand(page);
    await page.locator('#s-maand .card', { hasText: 'Zullen we dat doorlopen' }).click();
    await wachtKeuze(page);
    const draad = await page.locator('#coThr').innerText();
    const R = await page.evaluate(() => coMaandRegel('doel'));
    expect(draad).toContain(R.gevolg);
    expect(draad).not.toMatch(/waar werk je/i);
    expect(draad).not.toMatch(/dekking reserveringen/i);      // geen samenvatting van alle vijf
    expect(await page.evaluate(() => window._coOnderwerp)).toBe('maand');
  });

  test('buffer en aansluiting krijgen de actie die al achter die regel hangt', async ({ page }) => {
    await maand(page);
    for (const [key, lbl] of [['buffer', 'Mijn buffer verfijnen'], ['aansluiting', 'Naar mijn plan']]) {
      await page.evaluate(([m, k]) => coStart('maand', m, k), [CUR, key]);
      await wachtKeuze(page);
      const ks = await page.evaluate(() => [...document.querySelectorAll('#coCh .cch')].map((b) => b.innerText.trim()));
      expect(ks.some((x) => x.indexOf(lbl) === 0)).toBe(true);
      expect(ks.some((x) => /\/mnd\)/.test(x))).toBe(false);   // geen besparingsregels bij deze twee
    }
  });

  // v186: patroon is geen maandregel meer; dekking en doel houden de besparingsregels
  test('dekking en doel krijgen de besparingsregels', async ({ page }) => {
    await maand(page, tweeTekorten());
    // alleen de regels die deze maand bestaan: zonder reserveringen is er geen dekking-regel
    const aanwezig = await page.evaluate(() => maandRegels().map((r) => r.key));
    const keys = ['dekking', 'doel'].filter((k) => aanwezig.includes(k));
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      await page.evaluate(([m, k]) => coStart('maand', m, k), [CUR, key]);
      await wachtKeuze(page);
      const ks = await page.evaluate(() => [...document.querySelectorAll('#coCh .cch')].map((b) => b.innerText.trim()));
      expect(ks.some((x) => /\+€\d.*\/mnd\)/.test(x))).toBe(true);
    }
  });
});

test.describe('d · de afspraak', () => {
  test('ontstaat pas bij de bevestigingsstap, en staat daarna op het scherm', async ({ page }) => {
    await maand(page);
    expect(await afspraken(page)).toEqual([]);
    await page.evaluate((m) => coStart('maand', m, 'doel'), CUR);
    await kies(page, 'Alleen vastleggen');
    await kies(page, 'Zo spreken we af');
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });

    const af = await afspraken(page);
    expect(af.length).toBe(1);
    expect(af[0].regel).toBe('doel');
    expect(af[0].text).toMatch(/per maand extra opzij voor kosten koper huis/i);

    await page.evaluate(() => renderMaand());
    const t = await page.locator('#s-maand').innerText();
    expect(t).toMatch(/je afspraak deze maand/i);
    expect(t).toContain(af[0].text);
    expect(t).not.toMatch(/zullen we dat doorlopen/i);        // niet twee wegen naar een nieuwe
  });

  test('een coachRule aanzetten is geen afspraak', async ({ page }) => {
    await maand(page, tweeTekorten());
    /* v186: patroon is geen maandregel meer; 'doel' is de regel die deze fixture levert en die
       net als patroon de besparingsregels aangeboden krijgt. */
    await page.evaluate((m) => coStart('maand', m, 'doel'), CUR);
    await wachtKeuze(page);
    const opt = (await page.evaluate((m) => coachRuleOptions(m), CUR))[0];

    await page.locator('#coCh .cch').first().click();          // zet de regel aan
    await page.waitForFunction(() => [...document.querySelectorAll('#coCh .cch')].some((b) => /zo spreken we af/i.test(b.innerText)), null, { timeout: 15000 });
    expect(await page.evaluate((k) => (SET.coachRules || {})[k], opt.key)).toBe(opt.cut);
    expect(await afspraken(page)).toEqual([]);                 // regel staat, afspraak nog niet

    // nu afbreken: de regel blijft, de afspraak komt er niet
    await page.evaluate(() => closeSheet());
    await page.waitForTimeout(800);
    expect(await afspraken(page)).toEqual([]);
    expect(await page.evaluate((k) => (SET.coachRules || {})[k], opt.key)).toBe(opt.cut);
  });

  test('de tekst draagt de regelKey en waar van toepassing de categorie', async ({ page }) => {
    await maand(page, tweeTekorten());
    /* v186: patroon is geen maandregel meer; 'doel' is de regel die deze fixture levert en die
       net als patroon de besparingsregels aangeboden krijgt. */
    await page.evaluate((m) => coStart('maand', m, 'doel'), CUR);
    await wachtKeuze(page);
    await page.locator('#coCh .cch').first().click();
    await kies(page, 'Zo spreken we af');
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });

    const af = (await afspraken(page))[0];
    expect(af.regel).toBe('doel');
    expect(af.cat).toBeTruthy();
    expect(await page.evaluate((c) => !!CATS[c], af.cat)).toBe(true);
    expect(af.text).toMatch(/per maand\), voor kosten koper huis/i);   // leesbaar zonder context
  });

  test('twee keer vastleggen geeft één afspraak deze maand', async ({ page }) => {
    await maand(page);
    for (let i = 0; i < 2; i++) {
      await page.evaluate((m) => coStart('maand', m, 'doel'), CUR);
      await kies(page, 'Alleen vastleggen');
      await kies(page, 'Zo spreken we af');
      await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });
    }
    expect((await afspraken(page)).length).toBe(1);
  });
});

test.describe('e · het overschrijfpad', () => {
  const metAfspraak = () => eenTekort((s) => {
    s.coachLog = [{ ts: Date.now(), type: 'afspraak', text: 'oude afspraak', regel: 'buffer' }];
  });

  test('aanpassen en halverwege afbreken laat de oude afspraak staan', async ({ page }) => {
    await maand(page, metAfspraak());
    expect(await page.locator('#s-maand').innerText()).toContain('oude afspraak');

    await page.locator('#s-maand >> text=Aanpassen').click();
    await kies(page, 'Afspraak aanpassen');                    // hier wiste de oude code al
    await page.waitForTimeout(400);
    expect((await afspraken(page)).map((l) => l.text)).toEqual(['oude afspraak']);

    await page.evaluate(() => closeSheet());
    await page.waitForTimeout(800);
    expect((await afspraken(page)).map((l) => l.text)).toEqual(['oude afspraak']);
    expect(await page.evaluate(() => (coachThisMonthAfspraak() || {}).text)).toBe('oude afspraak');
  });

  test('coAfspraakOpen wist niets meer vooraf', async ({ page }) => {
    await maand(page, metAfspraak());
    expect(await page.evaluate(() => /coachLog\s*=\s*\(SET\.coachLog/.test(coAfspraakOpen.toString()))).toBe(false);
    // wissen en schrijven zitten samen in coAfspraakSchrijf, zonder await ertussen
    const bron = await page.evaluate(() => coAfspraakSchrijf.toString());
    expect(bron).toContain('filter');
    expect(bron).toContain('coachLogAdd');
    expect(bron).not.toContain('await');
  });

  test('de nieuwe vervangt de oude pas als hij er staat', async ({ page }) => {
    await maand(page, metAfspraak());
    await page.evaluate((m) => coStart('maand', m, 'doel'), CUR);
    await kies(page, 'Alleen vastleggen');
    expect((await afspraken(page)).map((l) => l.text)).toEqual(['oude afspraak']);   // nog niet
    await kies(page, 'Zo spreken we af');
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 15000 });
    const af = await afspraken(page);
    expect(af.length).toBe(1);
    expect(af[0].text).not.toBe('oude afspraak');
  });
});

test.describe('f · onderbreken', () => {
  test('de sheet dicht laat coachLog en coachRules onveranderd', async ({ page }) => {
    await maand(page);
    const regels = await page.evaluate(() => JSON.stringify(SET.coachRules || {}));
    await page.evaluate((m) => coStart('maand', m, 'doel'), CUR);
    await wachtKeuze(page);
    const logVoor = await log(page);

    await page.evaluate(() => closeSheet());
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => ({ live: !!window._coLive, onderwerp: window._coOnderwerp }))).toEqual({ live: false, onderwerp: null });
    expect(await log(page)).toBe(logVoor);
    expect(await page.evaluate(() => JSON.stringify(SET.coachRules || {}))).toBe(regels);
  });

  test('"Nu even niet" bij de bevestiging schrijft niets', async ({ page }) => {
    await maand(page);
    await page.evaluate((m) => coStart('maand', m, 'doel'), CUR);
    await kies(page, 'Alleen vastleggen');
    await kies(page, 'Nu even niet');
    await page.waitForFunction(() => window._coLive === false, null, { timeout: 5000 });
    expect(await afspraken(page)).toEqual([]);
  });
});

test.describe('g · de andere ingangen blijven zoals ze waren', () => {
  test('lek en horizon mogen nog steeds geen afspraak schrijven', async ({ page }) => {
    await maand(page);
    expect(await page.evaluate(() => CO_ONDERWERPEN)).toEqual({
      algemeen: { afspraak: true }, lek: { afspraak: false }, horizon: { afspraak: false }, maand: { afspraak: true } });
    // de toets hangt aan een lopend gesprek; hier zetten we die staat zelf, want zonder lek in
    // deze fixture sluit coTopicLek meteen en is er niets meer om tegen te toetsen
    const uit = await page.evaluate(() => {
      const b = [window._coLive, window._coOnderwerp]; const r = {};
      for (const k of ['lek', 'horizon', 'maand', 'algemeen']) { window._coLive = true; window._coOnderwerp = k; r[k] = coMagAfspraak(); }
      window._coLive = b[0]; window._coOnderwerp = b[1]; return r;
    });
    expect(uit).toEqual({ lek: false, horizon: false, maand: true, algemeen: true });
  });

  for (const w of [360, 390]) {
    test(`geen horizontale overflow op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 780 });
      await maand(page);
      await page.locator('#s-maand .card', { hasText: 'Zullen we dat doorlopen' }).click();
      await wachtKeuze(page);
      const over = await page.evaluate(() => ({
        maand: document.querySelector('#s-maand').scrollWidth - document.querySelector('#s-maand').clientWidth,
        sheet: document.querySelector('#sheet').scrollWidth - document.querySelector('#sheet').clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }));
      expect(over.maand).toBeLessThanOrEqual(1);
      expect(over.sheet).toBeLessThanOrEqual(1);
      expect(over.body).toBeLessThanOrEqual(1);
    });
  }
});
