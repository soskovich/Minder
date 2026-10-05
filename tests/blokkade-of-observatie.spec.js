// v219: 'Meer binnen, meer uitgegeven' stond op t:'warn' en landde daarmee via STRUCT_STATUS in
// 'Vraagt een beslissing'. Maar er is daar geen norm die je mist: meer inkomen met meer uitgaven
// kan volstrekt gezond zijn, en na een baanwissel is het de verwachte gevolgtrekking. De conditie
// vuurt op een verhouding (spWA > spNA * 1.12) en niet op een grens.
// Het criterium dat blokkade van observatie scheidt: IS ER EEN NORM DIE NIET WORDT GEHAALD?
// Bij 'meevaller' je spaardoel en bij 'overstreak' je bestedingslimiet - die lopen vast, dus tekort.
// Bij 'rente' en 'inflatie' niet - die stellen een patroon vast, dus let op.
// v228: 'inflatie' is daarna vervallen, want een observatie waar niets uit volgt is geen signaal.
// 'rente' is nu de enige gebruiker van STRUCT_STATUS.info; de mapping zelf blijft ongewijzigd.
// Verder: de coach-ingang stond vier blokken onder de kaart die een beslissing belooft, en drie van
// de vier structurele signalen hadden geen korte naam, zodat hun hele l1 als regelnaam diende.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { beslisIngangen, beslisKeys } = require('./beslis-sheet');   // v320: de ingang staat in de sheet

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
  for (const k of ['meevaller', 'overstreak']) {
    const m = src.match(new RegExp("key:'" + k + "'[^}]*?t:'(\\w+)'"));
    const n = src.match(new RegExp("key:'" + k + "'[^}]*?kort:'([^']+)'"));
    uit[k] = { t: m ? m[1] : null, kort: n ? n[1] : null };
  }
  return uit;
});

test.describe('a - de indeling volgt één criterium', () => {
  test('een signaal zonder norm die vastloopt is een observatie', async ({ page }) => {
    await boot(page);
    // rente: stilstaand geld naast een dure schuld stelt een patroon vast -> observatie (v228: het
    // enige structurele signaal met t:'info' sinds inflatie is vervallen)
    const t = await page.evaluate(() => {
      const m = document.documentElement.outerHTML.match(/key:'rente-'[^}]*?h:'structureel'[^}]*?t:'(\w+)'/);
      return m ? m[1] : null;
    });
    expect(t).toBe('info');
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
  test('geen van de structurele signalen valt nog terug op zijn hele zin', async ({ page }) => {
    await boot(page);
    const b = await bron(page);
    for (const k of ['meevaller', 'overstreak']) {
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

  /* v224: de korte naam werd hier getoetst via de uitnodiging 'Zullen we <naam> doorlopen?' onder
     de kaart. Die tak is vervallen, maar de naam draagt nog steeds de regel op het scherm en de
     kop van het gesprek. Daar staat hij nu, en de eis is dezelfde: een naam en geen volzin.
     v320: de oude vorm toetste dat `l1` NERGENS op het scherm stond, en dat was een proxy voor
     'de naam is geen zin'. Sinds v320 staat `l1` er juist WEL, als de oorzaak onder de naam, dus
     die proxy meet de verkeerde eigenschap. De eis staat nu rechtstreeks op de twee velden: de
     NAAM is de korte naam en de ZIN staat als oorzaak. Dat is strenger dan de oude vorm, want
     die kon ook groen staan op een scherm zonder dit signaal. */
  test('de naam leest als een naam, niet als een zin', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    const r = await page.evaluate(() => {
      const x = maandStructureel().find((y) => y.key === 'overstreak');
      return { naam: x.naam, oorzaak: x.oorzaak, l1: x.sig.l1 };
    });
    expect(r.naam).toBe('Maanden boven je grens');
    expect(r.naam).not.toBe(r.l1);
    expect(r.oorzaak, 'de zin staat als oorzaak en niet als naam').toBe(r.l1);
    const t = await page.locator('#s-maand').innerText();
    expect(t).toContain('Maanden boven je grens');
  });
});

test.describe('c - de ingang staat bij de belofte', () => {
  /* v224: de ingang stond onder de hele kaart en koos via coMaandZwaarste() welke regel hij opende.
     Nu draagt elke regel met een tekort er zelf een. De eigenschap die deze groep bewaakt blijft:
     de ingang staat bij wat hij belooft, en niet elders op het scherm. Alleen is 'bij' nu de regel
     in plaats van de kaart. */
  /* v320: de ingang staat niet meer IN de kaart maar in de SHEET achter de lijstregel. De
     eigenschap die deze test bewaakt is dezelfde en nu scherper: hij staat achter de regel die hij
     belooft, en nergens anders op het scherm. */
  test('elke ingang staat achter de regel die een beslissing belooft', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    const opScherm = await page.evaluate(() =>
      (document.querySelector('#s-maand').innerHTML.match(/coStart\('maand','[^']*','[^']*'\)/g) || []).length);
    expect(opScherm, 'geen enkele ingang los op het scherm').toBe(0);
    const keys = await beslisIngangen(page);
    expect(keys.length).toBeGreaterThan(0);
    /* v340: een regel is een tegel of een Let op-regel; de regels die een beslissing beloven zijn die
       met status tekort, in schermvolgorde. */
    const alle = await beslisKeys(page);
    const rijen = await page.evaluate((ks) => ks.filter((k) => maandBeslisZoek(k).status === 'tekort'), alle);
    expect(rijen.length).toBeGreaterThan(0);
    expect(keys, 'precies een ingang per regel, op zijn eigen sleutel').toEqual(rijen);
  });

  test('één per regel met een tekort, niet meer en niet minder', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    const keys = await beslisIngangen(page);
    const tekorten = await page.evaluate(() => maandMetAccept(maandRegels()).concat(maandStructureel())
      .filter((r) => r.status === 'tekort').map((r) => r.key));
    expect(keys).toEqual(tekorten);
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
