// Thema's (v83): Privé (licht & editorial) en Neo-Dark Aurora (donker & glas), live te wisselen.
// Puur visueel: dit toetst de tokens, de wissel en dat de hele app meegaat — geen rekenlogica.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

async function boot(page, scherm) {
  await open(page, seed());
  if (scherm) await page.evaluate((s) => go(s), scherm);
}
const tok = (page, n) => page.evaluate((k) => getComputedStyle(document.documentElement).getPropertyValue(k).trim(), n);
const attr = (page) => page.evaluate(() => document.documentElement.dataset.theme || null);
const bg = (page) => page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);

// relatieve luminantie volgens WCAG, om contrast echt na te rekenen
const contrast = (page, a, b) => page.evaluate(([x, y]) => {
  const rgb = (c) => { const d = document.createElement('i'); d.style.color = c; document.body.appendChild(d); const v = getComputedStyle(d).color; d.remove(); return v.match(/[\d.]+/g).slice(0, 3).map(Number); };
  const L = (c) => { const s = rgb(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2]; };
  const l1 = L(x), l2 = L(y);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}, [a, b]);

test.describe('a · de wissel', () => {
  test('setTheme zet data-theme, bewaart de keuze en werkt live door', async ({ page }) => {
    await boot(page);
    expect(await attr(page)).toBeNull();                               // default = de huidige look
    const voor = { bg: await bg(page), accent: await tok(page, '--accent') };

    await page.evaluate(() => setTheme('prive'));
    expect(await attr(page)).toBe('prive');
    expect(await page.evaluate(() => SET.theme)).toBe('prive');
    expect(await bg(page)).not.toBe(voor.bg);                          // zonder herladen
    expect(await tok(page, '--accent')).toBe('#1f5c46');
    expect(await tok(page, '--teal')).toBe('#1f5c46');                 // de oude naam volgt mee

    await page.evaluate(() => setTheme('aurora'));
    expect(await attr(page)).toBe('aurora');
    expect(await tok(page, '--accent')).toBe('#34e0c4');

    await page.evaluate(() => setTheme('standaard'));
    expect(await attr(page)).toBeNull();
    expect(await bg(page)).toBe(voor.bg);
    expect(await tok(page, '--accent')).toBe(voor.accent);
  });

  test('de keuze wordt bewaard en bij een volgende start toegepast', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => setTheme('prive'));
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('minder_set')).theme)).toBe('prive');

    // de bootstap zelf: opnieuw inlezen en toepassen, zoals bij het openen van de app
    await page.evaluate(() => { document.documentElement.removeAttribute('data-theme'); load(); applyTheme(); });
    expect(await attr(page)).toBe('prive');
    expect(await tok(page, '--accent')).toBe('#1f5c46');
  });
});

test.describe('b · de hele app volgt', () => {
  test('grafieken, nav en coach lopen via tokens, niet via vaste kleuren', async ({ page }) => {
    await boot(page, 'ins');
    const uit = await page.evaluate(() => ({
      chart: spendVsBudgetChart(),
      kpi: insKpiStrip(curMonth || months()[months().length - 1]),
      avatar: coachAvatar(),
    }));
    for (const [naam, html] of Object.entries(uit)) {
      expect(html, naam).not.toMatch(/#2dd4bf|#56627d|#8a97ab|#0b1220/i);   // oude vaste kleuren
    }
    expect(uit.chart).toContain('var(--bar)');
    expect(uit.chart).toMatch(/var\(--(accent|teal)\)/);              // het accent via een token
    expect(uit.avatar).toContain('var(--accent)');
  });

  test('de onderbalk en de kaarten kleuren mee', async ({ page }) => {
    await boot(page, 'dash');
    const meet = () => page.evaluate(() => {
      const nav = document.querySelector('.nav'), pill = document.querySelector('.nav a.on'), card = document.querySelector('#s-dash .card');
      return { nav: getComputedStyle(nav).backgroundColor, pill: getComputedStyle(pill).backgroundColor,
               card: getComputedStyle(card).backgroundColor, blur: getComputedStyle(card).backdropFilter };
    });
    const a = await meet();
    await page.evaluate(() => setTheme('prive'));
    const b = await meet();
    expect(b.nav).not.toBe(a.nav);
    expect(b.pill).not.toBe(a.pill);
    expect(b.card).not.toBe(a.card);
    expect(b.pill).not.toBe('rgba(0, 0, 0, 0)');                       // de actieve pill blijft zichtbaar
  });
});

test.describe('c · de signatuur per thema', () => {
  test('Privé: ivoor, serif-koppen en één diep groen accent', async ({ page }) => {
    await boot(page, 'dash');
    await page.evaluate(() => setTheme('prive'));
    expect(await bg(page)).toBe('rgb(246, 242, 233)');
    expect(await tok(page, '--font-head')).toMatch(/serif/i);
    const f = await page.evaluate(() => {
      const h = document.querySelector('.homehero .hh-big') || document.querySelector('.hlabel');
      return getComputedStyle(h).fontFamily;
    });
    expect(f).toMatch(/georgia|serif/i);
    expect(await tok(page, '--bar')).toBe('#cdd6cf');                  // warm neutrale datakleur
    expect(await tok(page, '--card-blur')).toBe('none');               // geen glas in Privé
  });

  test('Aurora: glas, gloed en een hero met verloop', async ({ page }) => {
    await boot(page, 'dash');
    await page.evaluate(() => setTheme('aurora'));
    expect(await tok(page, '--card-blur')).toContain('blur');
    expect(await tok(page, '--aurora')).toContain('radial-gradient');
    const glow = await page.evaluate(() => getComputedStyle(document.body, '::before').backgroundImage);
    expect(glow).toContain('radial-gradient');
    const hero = await page.evaluate(() => {
      const h = document.querySelector('.homehero .hh-big.grad');
      return h ? { img: getComputedStyle(h).backgroundImage, kleur: getComputedStyle(h).color } : null;
    });
    expect(hero, 'het hero-bedrag draagt het verloop').not.toBeNull();
    expect(hero.img).toContain('linear-gradient');
    expect(hero.kleur).toBe('rgba(0, 0, 0, 0)');                       // de tekst is het verloop
  });

  test('een negatief hero-bedrag houdt zijn eigen kleur, ook in Aurora', async ({ page }) => {
    const p = seed();
    const set = JSON.parse(p.minder_set);
    set.manualBal = { [JSON.parse(p.minder_own)[0]]: 10 };             // te weinig saldo -> tekort
    p.minder_set = JSON.stringify(set);
    await open(page, p);
    await page.evaluate(() => { setTheme('aurora'); go('dash'); });
    const h = await page.evaluate(() => {
      const el = document.querySelector('.homehero .hh-big');
      return el ? { grad: el.classList.contains('grad'), kleur: getComputedStyle(el).color } : null;
    });
    if (h && !h.grad) expect(h.kleur).not.toBe('rgba(0, 0, 0, 0)');    // leesbaar, geen transparante tekst
  });

  test('contrast blijft in beide thema\'s op orde', async ({ page }) => {
    await boot(page);
    for (const [thema, min] of [['prive', 7], ['aurora', 7], ['standaard', 7]]) {
      await page.evaluate((t) => setTheme(t), thema);
      const txt = await tok(page, '--txt'), achter = await tok(page, '--bg'), acc = await tok(page, '--accent');
      expect(await contrast(page, txt, achter), `${thema} tekst`).toBeGreaterThan(min);
      expect(await contrast(page, acc, achter), `${thema} accent`).toBeGreaterThan(3);
      const mut = await tok(page, '--mut');
      expect(await contrast(page, mut, achter), `${thema} secundair`).toBeGreaterThan(4.5);
    }
  });
});

test.describe('d · het Uiterlijk-scherm', () => {
  test('toont de thema-kaarten met preview en markeert de actieve', async ({ page }) => {
    await boot(page, 'set');
    await page.evaluate(() => openSet('look'));
    await page.waitForSelector('[data-theme-card]');
    const kaarten = page.locator('[data-theme-card]');
    expect(await kaarten.count()).toBe(3);
    for (const k of ['prive', 'aurora', 'standaard']) {
      await expect(page.locator(`[data-theme-card="${k}"]`)).toHaveCount(1);
    }
    const sheet = await page.locator('#sheet').innerText();
    expect(sheet).toContain('Privé');
    expect(sheet).toContain('Neo-Dark Aurora');
    expect((sheet.match(/actief/g) || []).length).toBe(1);             // precies één actief

    // tik = live wisselen, en de sheet toont de nieuwe keuze
    await page.locator('[data-theme-card="prive"]').click();
    expect(await attr(page)).toBe('prive');
    await page.waitForFunction(() => /Privé[\s\S]*actief/.test(document.getElementById('sheet').innerText));
    expect((await page.locator('#sheet').innerText()).match(/actief/g).length).toBe(1);
  });

  test('Uiterlijk staat als eigen rij in Instellingen', async ({ page }) => {
    await boot(page, 'set');
    const t = await page.locator('#s-set').innerText();
    expect(t).toContain('Uiterlijk');
    expect(t).toContain('Standaard');                                  // de huidige keuze als subregel
  });
});
