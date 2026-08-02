// v75: design-systeem — NL-getalnotatie + tabular figures, getemperde kleuren, één-laags kaarten,
// spacing/radius-ritme, rustige grafieken, consistente knoppen/navbar, nieuwe coach-avatar.
// Puur visueel: deze spec bewaakt de tokens en de opmaak, niet de berekeningen.
const { test, expect } = require('@playwright/test');
const { seed, open, CUR, M1 } = require('./budget-fixture');

async function boot(page, scherm) {
  await open(page, seed());
  if (scherm) { await page.evaluate((s) => go(s), scherm); await page.waitForSelector(`#s-${scherm}`); }
}
const token = (page, naam) => page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), naam);

test.describe('a · Nederlandse getalnotatie', () => {
  test('euro0 houdt het minteken vast', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({
      pos: euro0(8439), neg: euro0(-8439), nul: euro0(0), minNul: euro0(-0.2), decimaal: euro(8439.5), negDec: euro(-1050), minNulDec: euro(-0.001),
    }));
    expect(r.pos).toBe('€8.439');
    expect(r.neg).toBe('-€8.439');                 // teken behouden én vóór het euroteken
    expect(r.nul).toBe('€0');
    expect(r.minNul).toBe('€0');                   // geen "€-0"
    expect(r.decimaal).toBe('€8.439,50');
    expect(r.negDec).toBe('-€1.050,00');            // minteken vóór het euroteken
    expect(r.minNulDec).toBe('€0,00');              // geen "-€0,00" bij afronding naar nul
  });

  test('euroK is één compacte notatie met Nederlandse komma', async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => ({ k: euroK(4400), rond: euroK(2000), klein: euroK(940), groot: euroK(120000), neg: euroK(-4400), chart: chartK(4400) }));
    expect(r.k).toBe('€4,4K');
    expect(r.rond).toBe('€2K');
    expect(r.klein).toBe('€940');                  // onder 1000 gewoon voluit
    expect(r.groot).toBe('€120K');
    expect(r.neg).toBe('-€4,4K');
    expect(r.chart).toBe(r.k);                     // grafieken gebruiken dezelfde notatie
  });

  test('geen punt-als-decimaal of losse k-varianten op het scherm', async ({ page }) => {
    for (const scherm of ['dash', 'ins', 'vooruit', 'act']) {
      await boot(page, scherm);
      const t = await page.locator(`#s-${scherm}`).innerText();
      expect(t, scherm).not.toMatch(/€\s?\d{1,3}\.\d{3}\.\d{2}\b/);     // €8.079.88
      expect(t, scherm).not.toMatch(/€\s?[\d,.]+k\b/);                  // kleine k
    }
  });

  test('bedragen krijgen tabular figures', async ({ page }) => {
    await boot(page, 'dash');
    const f = await page.evaluate(() => getComputedStyle(document.body).fontVariantNumeric);
    expect(f).toContain('tabular-nums');
  });
});

test.describe('b · tokens en kleurgebruik', () => {
  test('de design-tokens staan in :root', async ({ page }) => {
    await boot(page);
    // v83: --teal loopt via --accent, zodat een thema één token hoeft te overschrijven
    for (const [naam, verwacht] of [['--accent', '#3bb3a4'], ['--teal', '#3bb3a4'], ['--red', '#e2685f'], ['--bar', '#39445e'], ['--mut', '#a6b2c6'], ['--mut2', '#7f8ba1']]) {
      expect(await token(page, naam), naam).toBe(verwacht);
    }
    expect(await token(page, '--shadow')).not.toBe('none');
    for (const [naam, v] of [['--s1', '8px'], ['--s2', '16px'], ['--s3', '24px'], ['--s4', '32px'], ['--r-card', '16px'], ['--r-inner', '12px'], ['--r-pill', '999px']]) {
      expect(await token(page, naam), naam).toBe(v);
    }
  });

  test('grafiekstaven zijn neutraal; teal alleen voor de lopende maand', async ({ page }) => {
    await boot(page, 'ins');
    const html = await page.evaluate(() => spendVsBudgetChart());
    expect(html).toContain('var(--bar)');                               // rustige staven
    expect((html.match(/fill="var\(--teal\)"/g) || []).length).toBeLessThanOrEqual(1);
    // en geen gridlijnen meer in de grafiek
    expect(html).not.toContain('rgba(255,255,255,.07)"');
  });

  test('de KPI-sparklines gebruiken één rustige kleur binnen de band', async ({ page }) => {
    await boot(page, 'ins');
    const strip = await page.evaluate((m) => insKpiStrip(m), CUR);
    expect(strip).toContain('var(--bar)');
    expect(strip).not.toContain('var(--teal-d)');                       // geen oude donkerteal-staafjes
  });
});

test.describe('c · kaarten, knoppen en navbar', () => {
  test('kaarten zijn één laag met schaduw, zonder geneste omkaderde blokken', async ({ page }) => {
    await boot(page, 'vooruit');
    const kaart = await page.evaluate(() => {
      const c = document.querySelector('#s-vooruit .card'); const st = getComputedStyle(c);
      return { radius: st.borderRadius, shadow: st.boxShadow };
    });
    expect(kaart.radius).toBe('16px');
    expect(kaart.shadow).not.toBe('none');

    // de tegels in "Nog deze maand" hebben geen eigen rand/oppervlak meer
    const tegel = await page.evaluate(() => {
      const t = document.querySelector('#s-vooruit .wvo-tile'); if (!t) return null;
      const st = getComputedStyle(t); return { border: st.borderTopWidth, bg: st.backgroundColor };
    });
    if (tegel) {
      expect(tegel.border).toBe('0px');
      expect(tegel.bg).toBe('rgba(0, 0, 0, 0)');
    }
  });

  test('twee knopstijlen, geen gestippelde rand', async ({ page }) => {
    await boot(page, 'vooruit');
    const stijlen = await page.evaluate(() => {
      const add = document.querySelector('.cp-add');
      const uit = { add: add ? getComputedStyle(add).borderTopStyle : null, gestippeld: 0 };
      // alleen bedieningselementen: een gestreepte lijn in een grafiek-legenda is geen knopstijl
      for (const el of document.querySelectorAll('button, .btn, .cp-add, .snz, .chip, a')) {
        const st = getComputedStyle(el);
        if (st.borderTopStyle === 'dashed' && st.borderTopWidth !== '0px') uit.gestippeld++;
      }
      return uit;
    });
    expect(stijlen.add).toBe('solid');
    expect(stijlen.gestippeld).toBe(0);
  });

  test('de navbar zweeft en de actieve tab heeft een pill', async ({ page }) => {
    await boot(page, 'ins');
    const nav = await page.evaluate(() => {
      const n = document.querySelector('.nav'); const a = document.querySelector('.nav a.on');
      const sn = getComputedStyle(n), sa = getComputedStyle(a);
      return { blur: sn.backdropFilter || sn.webkitBackdropFilter, bg: sn.backgroundColor, pill: sa.backgroundColor, radius: sa.borderRadius };
    });
    expect(nav.blur).toContain('blur');
    expect(nav.pill).not.toBe('rgba(0, 0, 0, 0)');                      // actieve tab krijgt een achtergrondje
    expect(nav.radius).toBe('999px');
  });
});

test.describe('d · scherm-afronding en avatar', () => {
  test('Coach en Vooruitblik eindigen met een rustige regel i.p.v. leegte', async ({ page }) => {
    await boot(page, 'vooruit');
    expect(await page.locator('#s-vooruit .scr-foot').count()).toBe(1);
    await page.evaluate(() => go('act'));
    await page.waitForSelector('#s-act .coachhead');
    expect(await page.locator('#s-act .scr-foot').count()).toBe(1);
  });

  test('de coach-avatar is een geometrische mark, geen silhouet', async ({ page }) => {
    await boot(page);
    const av = await page.evaluate(() => ({ v: coachAvatar(), m: (SET.coachAvatar = 'm', coachAvatar()) }));
    expect(av.v).toContain('var(--accent)');                            // merkkleur via het thema-token
    expect(av.v).not.toContain('#f1c9a6');                              // geen huidskleur-silhouet meer
    expect(av.m).not.toContain('#e9b994');
    expect(av.v).not.toBe(av.m);                                        // twee herkenbare varianten
  });
});
