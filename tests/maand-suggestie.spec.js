// v222: de kaart 'Vraagt een beslissing' stelde alleen vast. Elke regel zei wat er aan de hand was
// en wat het gevolg is, maar niet wat de handeling is. De cijfers stonden er al.
// maandRegelOpties() bepaalt of er een vorm is en welke; alleen de formulering is nieuw. Die
// functie schrijft handelingen ('€850 per maand extra opzij zetten'), wat klopt in het gesprek
// omdat je daar kiest, maar op de kaart een opdracht zou zijn. Hier staat een constatering: dit is
// wat er nodig is om de norm te halen.
// De eenheid verschilt per regel en de zin draagt dat: bij dekking is het bedrag een ACHTERSTAND in
// je pot (D.tekort = benodigdeStand min werkelijkeStand, ondanks de veldnaam tekortPerMaand), bij
// buffer het totale gat naar je richtbedrag, en alleen bij doel een maandbedrag.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';
const APRIL = ym(new Date(now.getFullYear() + 1, 3, 1));
const DOELDATUM = ym(new Date(now.getFullYear() + 1, now.getMonth(), 1));

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (let i = 5; i >= 0; i--) {
    const m = ym(new Date(now.getFullYear(), now.getMonth() - i, 1));
    add('i' + m, MAIN, m, '05', 4000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1500, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '06', -900, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('s' + m, SPAAR, m, '26', 300, 'Spaarpot', 'NAAR SPAREN');
    if (!o.geenRes) add('r' + m, RES, m, '10', 100, 'Reserveringen', 'NAAR RESERVERINGEN');
  }
  const bal = { [MAIN]: 2000, [SPAAR]: o.spaar != null ? o.spaar : 3100 };
  if (!o.geenResSaldo) bal[RES] = 400;
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
    manualBal: bal,
    budgets: { boodschappen: 900, huur: 1500 },
    savingMode: 'amount', savingAmount: 300,
    savingsAcc: { [SPAAR]: true },
    nfDoelVast: 7200, nfToegewezen: 3100, nfToegewezenMigrated: true, nfMaanden: 3,
    goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 20000, gespaard: 500, streefdatum: DOELDATUM, allocMode: 'fixed', perMaand: 0 }],
    reserveringen: [{ id: 'r1', naam: 'Aanslag', bedrag: 3000, vervalmaand: APRIL, intervalM: 12 }],
  }, o.set || {});
  if (!o.geenResAcc) set.resAcc = RES;
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandSuggestie === 'function');
}
const sug = (page, key) => page.evaluate((k) => {
  const r = maandMetAccept(maandRegels()).find((x) => x.key === k);
  return r ? { status: r.status, sug: maandSuggestie(r, curMonth || thisYM()) } : null;
}, key);

test.describe('a - elke regel met een tekort draagt een suggestie', () => {
  test('dekking', async ({ page }) => {
    await boot(page);
    const r = await sug(page, 'dekking');
    expect(r.status).toBe('tekort');
    expect(r.sug).toContain('€850');
  });

  test('buffer', async ({ page }) => {
    await boot(page);
    const r = await sug(page, 'buffer');
    expect(r.status).toBe('tekort');
    expect(r.sug).toContain('€4.100');
  });

  test('doel', async ({ page }) => {
    await boot(page);
    const r = await sug(page, 'doel');
    expect(r.status).toBe('tekort');
    expect(r.sug).toContain('€1.625');
  });

  test('en ze staan alle drie op het scherm', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    const t = await page.locator('#s-maand').innerText();
    expect(t).toContain('brengt je pot op de stand');
    expect(t).toContain('brengt je buffer in totaal');
    expect(t).toContain('houdt die streefdatum haalbaar');
  });
});

test.describe('b - het bedrag komt uit de regel en wordt nergens opnieuw berekend', () => {
  test('dekking noemt exact r.tekortPerMaand', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const r = maandRegels().find((x) => x.key === 'dekking');
      return { t: r.tekortPerMaand, sug: maandSuggestie(r, curMonth || thisYM()), euro: euro0(r.tekortPerMaand) };
    });
    expect(uit.sug).toContain(uit.euro);
  });

  test('doel noemt exact r.tekortPerMaand', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const r = maandRegels().find((x) => x.key === 'doel');
      return { sug: maandSuggestie(r, curMonth || thisYM()), euro: euro0(r.tekortPerMaand) };
    });
    expect(uit.sug).toContain(uit.euro);
  });

  test('buffer noemt exact het gat uit noodfondsModel', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => {
      const nf = noodfondsModel();
      const r = maandRegels().find((x) => x.key === 'buffer');
      return { sug: maandSuggestie(r, curMonth || thisYM()), euro: euro0(Math.round(nf.doel - nf.spaar)) };
    });
    expect(uit.sug).toContain(uit.euro);
  });

  test('de eenheid klopt: dekking en buffer zijn standen, doel is per maand', async ({ page }) => {
    await boot(page);
    const d = (await sug(page, 'dekking')).sug;
    const b = (await sug(page, 'buffer')).sug;
    const g = (await sug(page, 'doel')).sug;
    // D.tekort is benodigdeStand min werkelijkeStand, dus geen maandbedrag
    expect(d).not.toMatch(/€850 per maand/);
    expect(b).toContain('in totaal');
    expect(b).not.toMatch(/€4\.100 per maand/);
    expect(g).toContain('per maand');
  });

  test('dekking houdt de twee grootheden uit elkaar', async ({ page }) => {
    await boot(page);
    const d = (await sug(page, 'dekking')).sug;
    expect(d).toContain('€429');            // het lopende tempo uit de gevolgzin
    expect(d).toContain('maandtempo');
    expect(d.indexOf('€850')).toBeLessThan(d.indexOf('€429'));
  });
});

test.describe('c - een suggestie is geen advies', () => {
  test('geen opdracht en geen aansporing', async ({ page }) => {
    await boot(page);
    for (const k of ['dekking', 'buffer', 'doel']) {
      const t = (await sug(page, k)).sug.toLowerCase();
      for (const w of ['zet ', 'verhoog', 'moet', 'zou je', 'verstandig', 'probeer', 'zorg dat']) {
        expect(t, k + ' / ' + w).not.toContain(w);
      }
    }
  });

  /* De rij zelf draagt wel kleur: het statusbolletje is rood bij een tekort, en dat is bestaand
     gedrag dat niets met de suggestie te maken heeft. Toets dus de suggestie, niet de hele rij. */
  test('de suggestie draagt zelf geen kleur', async ({ page }) => {
    await boot(page);
    const s = (await sug(page, 'buffer')).sug;
    expect(s).not.toContain('var(--');
    expect(s).not.toContain('<');
    // hij hangt in de gedempte tint van de gevolgzin, niet in een eigen accent
    const h = await page.evaluate(() => maandRij(maandMetAccept(maandRegels()).find((x) => x.key === 'buffer'), false));
    expect(h).toContain('<span class="mut2">');
    expect(h).not.toContain('--amber');
  });

  /* v224: de rij draagt nu een gespreksingang eronder, met een eigen onclick. v193 blijft gelden
     voor de RIJ zelf: die houdt één tik, naar zijn editor. De ingang is een eigen element. */
  test('geen tweede tik op de rij', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => maandRij(maandMetAccept(maandRegels()).find((x) => x.key === 'buffer'), false));
    const rijDeel = h.slice(0, h.indexOf('padding:0 0 10px 17px'));
    expect([...rijDeel.matchAll(/onclick=/g)].length).toBe(1);
    expect(rijDeel).toContain('openNoodfondsPanel');
    expect(rijDeel).not.toContain('coStart');
  });
});

test.describe('d - zwijgen waar er geen norm is die niet gehaald wordt', () => {
  test('een regel op ok draagt geen suggestie', async ({ page }) => {
    // buffer ruim boven het richtbedrag
    await boot(page, { spaar: 30000, set: { nfToegewezen: 30000 } });
    const r = await sug(page, 'buffer');
    expect(r.status).toBe('ok');
    expect(r.sug).toBe('');
  });

  test('een structureel signaal krijgt er geen', async ({ page }) => {
    await boot(page);
    const uit = await page.evaluate(() => maandStructureel().map((r) => ({
      key: r.key, opties: maandRegelOpties(r, curMonth || thisYM()).length, sug: maandSuggestie(r, curMonth || thisYM()),
    })));
    for (const x of uit) {
      expect(x.opties, x.key).toBe(0);
      expect(x.sug, x.key).toBe('');
    }
  });

  test('een regel met een onbekende bron draagt er geen', async ({ page }) => {
    // geen reserveringenrekening: de dekking is niet te berekenen
    await boot(page, { geenResAcc: true });
    const r = await sug(page, 'dekking');
    expect(r.status).toBe('onbekend');
    expect(r.sug).toBe('');
  });

  test('een bewust geaccepteerde regel ook niet', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => maandAcceptZet('buffer'));
    const r = await sug(page, 'buffer');
    expect(r.sug).toBe('');
  });
});

/* v224: de ene ingang onder de kaart is vervallen; elke regel met een tekort draagt er zelf een.
   Wat deze groep bewaakt blijft gelden: er is een ingang naar het gesprek, en die opent op een
   regel die de drie vormen heeft. */
test.describe('e - elke regel opent het gesprek op zijn eigen onderwerp', () => {
  test('elke tekort-regel heeft een ingang op zijn eigen sleutel', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => go('maand'));
    const html = await page.locator('#s-maand').innerHTML();
    const m = [...html.matchAll(/coStart\('maand','[^']*','([^']*)'\)/g)].map((x) => x[1]);
    const tekorten = await page.evaluate(() => maandMetAccept(maandRegels()).concat(maandStructureel())
      .filter((r) => r.status === 'tekort').map((r) => r.key));
    expect(m).toEqual(tekorten);
  });

  test('en die regel heeft hier alle drie de vormen', async ({ page }) => {
    await boot(page);
    const v = await page.evaluate(() => {
      const z = coMaandZwaarste(maandMetAccept(maandRegels().concat(maandStructureel())));
      return maandRegelOpties(z, curMonth || thisYM()).map((o) => o.vorm);
    });
    expect(v).toContain('inleg');
    expect(v).toContain('norm');
    expect(v).toContain('accepteer');
  });
});

test.describe('f - layout', () => {
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
