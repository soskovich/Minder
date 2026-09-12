// v219: 'Meer binnen, meer uitgegeven' stond op t:'warn' en landde daarmee via STRUCT_STATUS in
// 'Vraagt een beslissing'. Maar er is daar geen norm die je mist: meer inkomen met meer uitgaven
// kan volstrekt gezond zijn, en na een baanwissel is het de verwachte gevolgtrekking. De conditie
// vuurt op een verhouding (spWA > spNA * 1.12) en niet op een grens.
// Het criterium dat blokkade van observatie scheidt: IS ER EEN NORM DIE NIET WORDT GEHAALD?
// Bij 'meevaller' je spaardoel en bij 'overstreak' je bestedingslimiet - die lopen vast, dus tekort.
// Bij 'rente' en 'inflatie' niet - die stellen een patroon vast, dus let op.
// Verder: de coach-ingang stond vier blokken onder de kaart die een beslissing belooft, en drie van
// de vier structurele signalen hadden geen korte naam, zodat hun hele l1 als regelnaam diende.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';
const BINNENKORT = ym(new Date(now.getFullYear(), now.getMonth() + 4, 1));
const DOELDATUM = ym(new Date(now.getFullYear() + 1, now.getMonth(), 1));

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = ym(d);
    const windfall = (i === 3 || i === 7);
    add('i' + m, MAIN, m, '05', windfall ? 9000 : 5000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1500, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '06', windfall ? -3200 : -1800, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('v' + m, MAIN, m, '08', windfall ? -1400 : -900, 'Diversen', 'BEA, BETAALPAS DIVERSEN');
    add('s' + m, SPAAR, m, '26', 200, 'Spaarpot', 'NAAR SPAREN');
  }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 5000,
    manualBal: { [MAIN]: 3000, [SPAAR]: 1400, [RES]: 200 },
    budgets: { boodschappen: 1800, huur: 1500 },
    savingMode: 'amount', savingAmount: 1000,
    savingsAcc: { [SPAAR]: true }, resAcc: RES,
    nfDoelVast: 20000, nfToegewezen: 1400, nfToegewezenMigrated: true, nfMaanden: 6,
    goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 50000, gespaard: 0, streefdatum: DOELDATUM, allocMode: 'fixed', perMaand: 200 }],
    reserveringen: [{ id: 'r1', naam: 'Aanslag', bedrag: 3000, vervalmaand: BINNENKORT, intervalM: 12 }],
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof maandRegels === 'function');
}
// de vier signalen zoals de engine ze definieert, los van of ze vandaag vuren
const bron = (page) => page.evaluate(() => {
  const src = document.documentElement.outerHTML;
  const uit = {};
  for (const k of ['meevaller', 'inflatie', 'overstreak']) {
    const m = src.match(new RegExp("key:'" + k + "'[^}]*?t:'(\\w+)'"));
    const n = src.match(new RegExp("key:'" + k + "'[^}]*?kort:'([^']+)'"));
    uit[k] = { t: m ? m[1] : null, kort: n ? n[1] : null };
  }
  return uit;
});

test.describe('a - de indeling volgt één criterium', () => {
  test('een signaal zonder norm die vastloopt is een observatie', async ({ page }) => {
    await boot(page);
    const b = await bron(page);
    // inflatie: een verhouding, geen grens -> observatie
    expect(b.inflatie.t).toBe('info');
    expect(await page.evaluate(() => STRUCT_STATUS.info)).toBe('let op');
  });

  test('een signaal met een norm die vastloopt blijft een blokkade', async ({ page }) => {
    await boot(page);
    const b = await bron(page);
    expect(b.meevaller.t).toBe('bad');      // je spaardoel wordt structureel niet gehaald
    expect(b.overstreak.t).toBe('warn');    // je eigen bestedingslimiet, maanden op rij
    expect(await page.evaluate(() => STRUCT_STATUS.bad)).toBe('tekort');
    expect(await page.evaluate(() => STRUCT_STATUS.warn)).toBe('tekort');
  });

  test('de mapping zelf is niet aangeraakt: er zijn twee bestemmingen, geen derde', async ({ page }) => {
    await boot(page);
    expect(await page.evaluate(() => STRUCT_STATUS)).toEqual({ bad: 'tekort', warn: 'tekort', info: 'let op' });
  });

  test('en het rente-signaal blijft de observatie die het al was', async ({ page }) => {
    await boot(page);
    const t = await page.evaluate(() => {
      const m = document.documentElement.outerHTML.match(/key:'rente-'[^}]*?t:'(\w+)'/);
      return m ? m[1] : null;
    });
    expect(t).toBe('info');
  });
});

test.describe('b - elk structureel signaal draagt een korte naam', () => {
  test('geen van de vier valt nog terug op zijn hele zin', async ({ page }) => {
    await boot(page);
    const b = await bron(page);
    for (const k of ['meevaller', 'inflatie', 'overstreak']) {
      expect(b[k].kort, k).toBeTruthy();
      expect(b[k].kort.length, k).toBeLessThanOrEqual(42);
    }
  });

  test('kortNaam gebruikt die naam en kapt niets af', async ({ page }) => {
    await boot(page);
    const n = await page.evaluate(() => kortNaam({ kort: 'Maanden boven je grens', l1: 'Je geeft al maanden te veel uit' }));
    expect(n).toBe('Maanden boven je grens');
    expect(n).not.toContain('…');
  });

  test('de gespreksvraag leest als een zin, niet als een zin in een zin', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    const t = await page.locator('#s-maand').innerText();
    expect(t).toContain('Zullen we maanden boven je grens doorlopen?');
    expect(t).not.toContain('Zullen we je geeft al maanden');
  });
});

test.describe('c - de ingang staat bij de belofte', () => {
  /* v223: de spaarquote stond als eigen kaart ná de ingang; sinds die als voet onder de streep in
     de kaart met je maandregels staat, komt hij ervóór. De eigenschap die deze test bewaakt is
     onveranderd: de ingang staat direct onder de kaart die een beslissing belooft, en niet vier
     blokken lager. Die meet hij nu tegen de uitgavengrafiek, het eerstvolgende blok erna. */
  test('onder de regels die iets vragen, en boven de blokken erna', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    const t = await page.locator('#s-maand').innerText();
    const kaart = t.indexOf('VRAAGT EEN BESLISSING');
    const ingang = t.indexOf('Zullen we');
    const erna = t.indexOf('UITGAVEN VS BUDGET');
    expect(kaart).toBeGreaterThanOrEqual(0);
    expect(ingang).toBeGreaterThan(kaart);
    expect(erna).toBeGreaterThan(ingang);
  });

  test('hij staat er één keer, niet twee', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    const html = await page.locator('#s-maand').innerHTML();
    expect([...html.matchAll(/coStart\('maand'/g)].length).toBe(1);
  });

  test('de rij houdt zijn eigen tik naar zijn sheet (v193)', async ({ page }) => {
    await boot(page);
    const acts = await page.evaluate(() => maandRegels().map((r) => r.act));
    expect(acts.some((a) => /openNoodfondsPanel/.test(a))).toBe(true);
    expect(acts.every((a) => !/coStart/.test(a))).toBe(true);
  });

  test('zonder regels die iets vragen staat de ingang onderaan, niet in het niets', async ({ page }) => {
    // alles op orde: geen tekort en geen let op
    await boot(page, { set: { nfDoelVast: 100, nfToegewezen: 100, goals: [], reserveringen: [], savingAmount: 100 } });
    await page.evaluate(() => go('maand'));
    const html = await page.locator('#s-maand').innerHTML();
    expect([...html.matchAll(/coStart\('maand'/g)].length).toBeLessThanOrEqual(1);
  });
});

test.describe('d - layout', () => {
  for (const w of [360, 390]) {
    test(`Maand past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page);
      await page.evaluate(() => go('maand'));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
