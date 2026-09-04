// v175: drie dingen in dezelfde samenstelling van het maandscherm.
// A. beslis filterde op RO en aandacht op R, dus een structureel signaal met status 'let op' landde
//    in geen van beide kaarten en telde alleen mee in de oordeelzin. Verlies, geen weergavefout.
// B. MAAND_DREMPEL.structureelStatus duwde elk structureel signaal naar 'tekort', ook de
//    info-variant, waardoor een observatie de oordeelzin naar 'er is iets dat vastloopt' trok.
// C. maandCoachIngang en maandVerband kregen R zonder de structurele regels, dus de ingang onderaan
//    wees naar een andere regel dan de oordeelzin bovenaan noemde.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const MAIN = 'NL01MAIN0000001111';
const SAV = 'NL01SAVE0000004323';
const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MS = [5, 4, 3, 2, 1, 0].map((k) => ym(new Date(now.getFullYear(), now.getMonth() - k, 1)));

/* oplopende uitgaven boven het inkomen geven 'overstreak' (warn -> blokkade).
   dureSchuld met spaargeld erboven geeft 'rente-<id>' (info -> observatie). */
function seed(o = {}) {
  const tx = []; let i = 0;
  const add = (m, d, a, n, ds, acc) => tx.push({ id: 'x' + (i++), date: `${m}-${d}`, amount: a,
    acc: acc || MAIN, name: n, desc: ds, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  MS.forEach((m, k) => {
    add(m, '25', 3000, 'Werkgever', 'SALARIS LOON');
    add(m, '02', -900, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add(m, '05', -(o.overstreak ? 1500 + k * 220 : 500), 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add(m, '11', -(o.overstreak ? 800 + k * 120 : 200), 'Restaurant De Kade', 'BEA, BETAALPAS RESTAURANT');
    add(m, '26', 200, 'Spaarpot', 'NAAR SPAREN', SAV);
  });
  const set = Object.assign({ mode: 'begeleid', autoIncome: false, income: 3000, limit: 70,
    manualBal: { [MAIN]: 1500, [SAV]: o.spaarSaldo != null ? o.spaarSaldo : 20000 },
    savingsEnds: ['4323'], budgets: { huur: 900, boodschappen: 600, uiteten: 300 },
    nfDoelVast: 4000, nfToegewezen: 4000, nfToegewezenMigrated: 1,
    spaarRente: 1,
  }, o.set || {});
  if (o.rente) set.debts = [{ id: 'd1', naam: 'Creditcard', rest: 3000, start: 3000, rente: 14, perMaand: 100 }];
  return { minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SAV]), minder_accmeta: '{}', minder_plan: '{}' };
}
async function boot(page, payload) {
  await page.route('**/sw.js', (r) => r.abort());
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, payload || seed());
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandStructureel === 'function');
}
const str = (page) => page.evaluate(() => maandStructureel().map((r) => ({ key: r.key, t: r.sig && r.sig.t, status: r.status })));
const kaarten = (page) => page.evaluate(async () => {
  go('maand'); await new Promise((r) => setTimeout(r, 120));
  const uit = {};
  for (const c of document.querySelectorAll('#s-maand .card')) {
    const kop = (c.querySelector('.hlabel') || {}).textContent || '';
    if (/beslissing/i.test(kop)) uit.beslis = c.innerText.replace(/\s+/g, ' ');
    if (/aandacht/i.test(kop)) uit.aandacht = c.innerText.replace(/\s+/g, ' ');
  }
  return uit;
});

test.describe('a · beide kaarten putten uit dezelfde lijst', () => {
  test('de filters lezen allebei RO', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => renderMaand.toString());
    expect(src).toContain("RO.filter(r=>r.status==='tekort')");
    expect(src).toContain("RO.filter(r=>r.status==='let op')");
  });

  test('een structureel signaal met let op staat in de aandachtskaart', async ({ page }) => {
    await boot(page, seed({ rente: true }));
    const S = await str(page);
    const obs = S.filter((x) => x.status === 'let op');
    test.skip(!obs.length, 'deze fixture levert geen observatie');
    const k = await kaarten(page);
    expect(k.aandacht, 'aandachtskaart bestaat').toBeTruthy();
    const naam = await page.evaluate((key) => (maandStructureel().find((r) => r.key === key) || {}).naam, obs[0].key);
    expect(k.aandacht).toContain(naam);
  });

  test('geen enkel signaal valt tussen de twee kaarten door', async ({ page }) => {
    for (const opt of [{ rente: true }, { overstreak: true }, { rente: true, overstreak: true }]) {
      await boot(page, seed(opt));
      const r = await page.evaluate(async () => {
        go('maand'); await new Promise((x) => setTimeout(x, 120));
        const R = maandRegels(), STR = maandStructureel(), RO = R.concat(STR);
        const tekst = $('#s-maand').innerText;
        return RO.filter((x) => x.status === 'tekort' || x.status === 'let op')
          .map((x) => ({ naam: x.naam, gezien: tekst.includes(x.naam) }));
      });
      for (const x of r) expect(x.gezien, x.naam).toBe(true);
    }
  });
});

test.describe('b · de zwaarte komt uit het signaal', () => {
  test('bad en warn zijn een blokkade, info een observatie', async ({ page }) => {
    await boot(page);
    const map = await page.evaluate(() => STRUCT_STATUS);
    expect(map).toEqual({ bad: 'tekort', warn: 'tekort', info: 'let op' });
    // twee bestemmingen, geen derde
    expect(new Set(Object.values(map))).toEqual(new Set(['tekort', 'let op']));
  });

  test('elk structureel signaal landt in een van de twee', async ({ page }) => {
    for (const opt of [{ rente: true }, { overstreak: true }, { rente: true, overstreak: true }]) {
      await boot(page, seed(opt));
      for (const x of await str(page)) {
        expect(['tekort', 'let op'], x.key).toContain(x.status);
        expect(x.status, x.key).toBe({ bad: 'tekort', warn: 'tekort', info: 'let op' }[x.t]);
      }
    }
  });

  test('een observatie trekt de oordeelzin niet naar een tekort', async ({ page }) => {
    await boot(page, seed({ rente: true }));
    const r = await page.evaluate(() => {
      const R = maandRegels(), STR = maandStructureel();
      return { obs: STR.filter((x) => x.status === 'let op').length,
        blok: STR.filter((x) => x.status === 'tekort').length,
        eigenTekort: R.filter((x) => x.status === 'tekort').length,
        zin: maandOordeel(R.concat(STR)).zin };
    });
    test.skip(!r.obs || r.blok, 'deze fixture levert niet alleen observaties');
    if (!r.eigenTekort) expect(r.zin).not.toMatch(/beslissing vraagt|beslissing vragen/);
  });
});

test.describe('c · de ingang en het oordeel wijzen naar dezelfde regel', () => {
  for (const [naam, opt] of [['alleen observaties', { rente: true }],
    ['alleen blokkades', { overstreak: true }],
    ['beide door elkaar', { rente: true, overstreak: true }]]) {
    test(`${naam}: zelfde zwaarste regel`, async ({ page }) => {
      await boot(page, seed(opt));
      const r = await page.evaluate(async () => {
        go('maand'); await new Promise((x) => setTimeout(x, 120));
        const R = maandRegels(), STR = maandStructureel(), RO = R.concat(STR);
        const z = coMaandZwaarste(RO);
        const ing = $('#s-maand').innerHTML.match(/coStart\('maand','[^']*','([^']*)'\)/);
        return { zwaarste: z && z.key, ingang: ing && ing[1], zin: maandOordeel(RO).zin,
          naam: z && z.naam };
      });
      if (r.ingang) expect(r.ingang, naam).toBe(r.zwaarste);
      // en die regel is oplosbaar, dus het gesprek sluit niet meteen
      if (r.zwaarste) {
        const regel = await page.evaluate((k) => coMaandRegel(k), r.zwaarste);
        expect(regel, r.zwaarste).toBeTruthy();
        expect(regel.naam).toBe(r.naam);
      }
    });
  }

  test('coMaandRegel kent ook de structurele sleutels', async ({ page }) => {
    await boot(page, seed({ overstreak: true }));
    const S = await str(page);
    test.skip(!S.length, 'deze fixture levert geen structureel signaal');
    for (const x of S) {
      const r = await page.evaluate((k) => coMaandRegel(k), x.key);
      expect(r, x.key).toBeTruthy();
      expect(r.structureel, x.key).toBe(true);
    }
  });

  test('een onbekende sleutel valt terug op dezelfde lijst als de ingang', async ({ page }) => {
    await boot(page, seed({ overstreak: true }));
    const src = await page.evaluate(() => coTopicMaand.toString());
    expect(src).toContain('maandRegels().concat(maandStructureel())');
    expect(src).toContain('!coMaandRegel(key)');
  });
});

test.describe('d · niets moedigt aan of scoort', () => {
  test('de kaarten constateren', async ({ page }) => {
    for (const opt of [{ rente: true }, { overstreak: true }, { rente: true, overstreak: true }]) {
      await boot(page, seed(opt));
      const t = await page.evaluate(async () => { go('maand');
        await new Promise((x) => setTimeout(x, 120)); return $('#s-maand').innerText; });
      expect(t).not.toMatch(/goed bezig|knap|gefeliciteerd|op rij|streak|punten/i);
      expect(t).not.toMatch(/[!—]/);
    }
  });
});
