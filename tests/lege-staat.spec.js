// v167: bij nul transacties claimde Maand dat vijf regels goed stonden, terwijl er nul regels
// waren en months() leeg was. Drie dingen zaten daaronder: regel 'patroon' werd onvoorwaardelijk
// gepusht, renderEmpty() vulde een handmatige lijst schermen waar s-maand en s-fire niet in
// stonden, en go() rendeerde daarna alsnog over die lege staat heen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const now = new Date();
const CUR = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');

function leeg() {
  return {
    minder_tx: '[]', minder_ovr: '{}', minder_own: '[]', minder_accmeta: '{}', minder_plan: '{}',
    minder_set: JSON.stringify({ mode: 'begeleid' }),
  };
}
function metData() {
  const tx = [];
  for (const d of ['02', '05', '11', '25']) {
    tx.push({ id: 't' + d, date: `${CUR}-${d}`, amount: d === '25' ? 3000 : -300, acc: MAIN,
      name: d === '25' ? 'Werkgever' : 'Albert Heijn',
      desc: d === '25' ? 'SALARIS LOON' : 'BEA, BETAALPAS ALBERT HEIJN',
      typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  }
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_own: JSON.stringify([MAIN]),
    minder_accmeta: '{}', minder_plan: '{}',
    minder_set: JSON.stringify({ mode: 'begeleid', autoIncome: false, income: 3000,
      manualBal: { [MAIN]: 2000 }, budgets: { boodschappen: 600 } }),
  };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload);
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof geenData === 'function');
}
const SCHERMEN = ['dash', 'tx', 'ins', 'act', 'vooruit', 'maand', 'vermogen', 'fire'];

test.describe('a · zonder data claimt geen enkel scherm iets', () => {
  test('elk scherm behalve Instellingen toont dezelfde lege staat', async ({ page }) => {
    await boot(page, leeg());
    const gezien = [];
    for (const s of SCHERMEN) {
      await page.evaluate((n) => go(n), s);
      await page.waitForTimeout(90);
      gezien.push(await page.evaluate((n) => $('#s-' + n).innerText.replace(/\s+/g, ' ').trim().slice(0, 60), s));
    }
    expect(new Set(gezien).size, JSON.stringify(gezien)).toBe(1);
    expect(gezien[0]).toMatch(/welkom bij minder/i);
  });

  test('de lijst komt uit de DOM, niet uit een handmatige opsomming', async ({ page }) => {
    await boot(page, leeg());
    const src = await page.evaluate(() => renderEmpty.toString());
    expect(src).toContain("querySelectorAll('.screen')");
    expect(src).not.toContain("'#s-tx'");            // een handmatige lijst mist er altijd een
    // s-maand en s-fire stonden er niet in en toonden daardoor hun normale inhoud op niets
    for (const s of ['maand', 'fire']) {
      const len = await page.evaluate((n) => $('#s-' + n).innerHTML.length, s);
      const dash = await page.evaluate(() => $('#s-dash').innerHTML.length);
      expect(len, s).toBe(dash);
    }
  });

  test('go() rendert niet over de lege staat heen', async ({ page }) => {
    await boot(page, leeg());
    const src = await page.evaluate(() => go.toString());
    expect(src).toContain('geenData()');
    await page.evaluate(() => go('maand'));
    await page.waitForTimeout(120);
    expect(await page.evaluate(() => $('#s-maand').innerText)).toMatch(/welkom bij minder/i);
    // en zonder maandscherm is er ook geen leesmoment vastgelegd
    expect(await page.evaluate(() => SET.maandGelezen)).toBe(undefined);
  });

  test('render() en go() lezen dezelfde vlag', async ({ page }) => {
    await boot(page, leeg());
    const r = await page.evaluate(() => ({ leeg: geenData(), src: render.toString() }));
    expect(r.leeg).toBe(true);
    expect(r.src).toContain('geenData()');
  });
});

// v186: de regel 'Patroon van de maand' is vervallen. Hij las maandPatroon(), en die filtert
// scoreNotifs() op budget-, discr- en tempo: alle drie h:'direct', dus letterlijk dezelfde
// melding als in de meldingenlijst. De horizon-indeling zegt dat die daar hoort en nergens
// anders. Maand houdt vier regels; maandPatroon() voedt nog wel maandVerband().
test.describe('b · regel patroon bestaat niet meer', () => {
  test('zonder boekingen staat er geen enkele regel', async ({ page }) => {
    await boot(page, leeg());
    expect(await page.evaluate(() => maandRegels())).toEqual([]);
    expect(await page.evaluate(() => maandOordeel(maandRegels()))).toEqual({ zin: 'Er is nog niets te beoordelen.', sub: '' });
  });

  test('met boekingen staat hij er ook niet, want hij is geen regel meer', async ({ page }) => {
    await boot(page, metData());
    expect(await page.evaluate(() => maandRegels().filter((x) => x.key === 'patroon'))).toEqual([]);
    // en de melding zelf staat er nog wel, op zijn ene plek: de meldingenlijst
    expect(await page.evaluate(() => typeof maandPatroon)).toBe('function');
  });

  test('de lege staat van Maand bestaat weer, voor als er niets te toetsen valt', async ({ page }) => {
    await boot(page, metData());
    await page.evaluate(() => {
      const echt = window.maandRegels;
      window.maandRegels = () => [];
      renderMaand();
      window.maandRegels = echt;
    });
    const t = await page.evaluate(() => $('#s-maand').innerText);
    expect(t).toContain('te weinig ingesteld om je maand samen te vatten');
    expect(t).not.toMatch(/regels staan goed/);
  });
});

test.describe('c · het oordeel telt wat er staat', () => {
  test('nooit meer een hardcoded vijf', async ({ page }) => {
    await boot(page, metData());
    const src = await page.evaluate(() => maandOordeel.toString());
    expect(src).not.toContain('Alle vijf');
    const r = await page.evaluate(() => {
      const mk = (n, st) => Array.from({ length: n }, (_, i) => ({ key: 'r' + i, naam: 'R' + i, status: st }));
      return { drie: maandOordeel(mk(3, 'ok')).zin, vijf: maandOordeel(mk(5, 'ok')).zin };
    });
    expect(r.drie).toBe('Alle 3 regels staan goed.');
    expect(r.vijf).toBe('Alle 5 regels staan goed.');
  });
});

test.describe('d · bewaard voor later', () => {
  test('het kopgetal is een aftrekking van wat er al staat', async ({ page }) => {
    await boot(page, metData());
    const r = await page.evaluate(() => {
      const src = monthVsPrevInner.toString();
      return { velden: Object.keys(monthVsPrevInner(months()[months().length - 1]) || {}),
        // het woord staat nog in het comment dat uitlegt waarom hij weg is; de lus zelf niet
        geenStreak: !/let streak/.test(src) && !/steerSpendUpTo\(ms\[/.test(src),
        sjabloon: /dan vorige maand/.test(src) };
    });
    expect(r.velden.sort()).toEqual(['drivers', 'has']);          // geen match zonder vorige maand
    expect(r.geenStreak).toBe(true);                              // de lus over elke maand komt niet terug
    expect(r.sjabloon).toBe(true);                                // het sjabloon staat er als comment
  });

  test('de dus-wat-zinnen zijn bewaard', async ({ page }) => {
    await boot(page, metData());
    // een comment boven een functie zit niet in toString(), dus we lezen het bestand zelf
    const bron = await page.evaluate(() => fetch('/index.html').then((r) => r.text()));
    const src = bron.slice(Math.max(0, bron.indexOf('function insSignals') - 1400), bron.indexOf('function insSignals'));
    for (const zin of ['zet er een grens op', 'Check of het eenmalig was',
      'levert de meeste winst', 'niet rijk of arm']) {
      expect(src, zin).toContain(zin);
    }
    // bewaard als comment, niet als output: het signaal zelf draagt ze niet meer
    const velden = await page.evaluate((m) => {
      const uit = new Set();
      for (const sig of insSignals(m, new Set())) Object.keys(sig).forEach((k) => uit.add(k));
      return [...uit];
    }, CUR);
    for (const dood of ['hyp', 'imp', 'chip', 'tone']) expect(velden, dood).not.toContain(dood);
  });
});
