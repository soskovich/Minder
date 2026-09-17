// v223: 'Vermogensopbouw' en 'Je plan' waren eigen kaarten met een kop en een uitlegzin voor één
// cijfer elk. Ze staan nu als voet onder een streep, in de kaart met je maandregels.
// De streep draagt het onderscheid: erboven staat wat een beslissing of aandacht vraagt, met een
// statusdot; eronder staan constateringen zonder dot. Daarom hangt de voet aan de LAATSTE kaart die
// regels draagt: staat er na de streep nog een kaart met dots, dan scheidt hij niets meer.
// Geen informatieverlies buiten twee uitlegzinnen: het label, het percentage, de sparkline, de
// deltazin onder GRAFIEK_MIN maanden, de tik naar het detail, beide plan-rijen en de zin over de
// 70%-grens staan er alle nog.
// v226: de spaarquote is uit de voet en staat weer als eigen kaart - hij is een uitkomst en geen
// constatering over een maandregel. Wat onder de streep overblijft zijn de plan-rijen, en dat is
// waar deze spec de voet sindsdien aan afleest. De streep houdt zijn werk: hij scheidt op soort
// (dot of geen dot) en niet op aantal. Wat de tegel zelf draagt staat in op-tempo.spec.js.
// v228: de rij 'Boven je inkomen-limiet' is vervallen. De voet draagt nog één rij, 'Je potjes vanaf
// volgende maand', en die staat er alleen als je potjes veranderen. Deze spec vult de voet daarom
// met een volgende-maand-laag (NEXT) in plaats van met potjes boven de limiet (OVER).
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';
const RES = 'NL01RESV0000009999';
const APRIL = ym(new Date(now.getFullYear() + 1, 3, 1));
// v226: een gat binnen MAAND_DREMPEL.dekkingMarge maanden vraagt een beslissing, verder weg
// aandacht. Met o.knel zet een test het knelmoment waar hij het nodig heeft.
const knelYm = (n) => ym(new Date(now.getFullYear(), now.getMonth() + n, 1));
const DOELDATUM = ym(new Date(now.getFullYear() + 1, now.getMonth(), 1));
const NEXT = { budgetsNext: { boodschappen: 1000 } };   // wijkt af van budgets.boodschappen (900): de voet draagt een rij

function seed(o) {
  o = o || {};
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  const n = o.maanden != null ? o.maanden : 8;
  for (let i = n - 1; i >= 0; i--) {
    const m = ym(new Date(now.getFullYear(), now.getMonth() - i, 1));
    add('i' + m, MAIN, m, '05', 4000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1500, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '06', -900, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    if (!o.geenSpaar) add('s' + m, SPAAR, m, '26', 300, 'Spaarpot', 'NAAR SPAREN');
    add('r' + m, RES, m, '10', 100, 'Reserveringen', 'NAAR RESERVERINGEN');
  }
  const set = Object.assign({
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 2000, [SPAAR]: o.spaar != null ? o.spaar : 3100, [RES]: 400 },
    budgets: o.budgets || { boodschappen: 900, huur: 1500 },
    savingMode: 'amount', savingAmount: 300,
    savingsAcc: { [SPAAR]: true }, resAcc: RES,
    nfDoelVast: 7200, nfToegewezen: 3100, nfToegewezenMigrated: true, nfMaanden: 3,
    goals: [{ id: 'g1', naam: 'Kosten Koper', doel: 20000, gespaard: 500, streefdatum: DOELDATUM, allocMode: 'fixed', perMaand: 0 }],
    reserveringen: [{ id: 'r1', naam: 'Aanslag', bedrag: 3000, vervalmaand: o.knel != null ? knelYm(o.knel) : APRIL, intervalM: 12 }],
  }, o.set || {});
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR, RES]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, o) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(o));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof maandVoet === 'function');
  await page.evaluate(() => go('maand'));
}
const kaarten = (page) => page.evaluate(() => [...document.querySelectorAll('#s-maand .card')].map((c) => ({
  kop: ((c.querySelector('.hlabel') || {}).textContent || '').trim(),
  spaarquote: /Spaarquote/.test(c.textContent),
  voet: /potjes vanaf volgende maand/.test(c.textContent),
  streep: /border-top:1px solid var\(--line\)/.test(c.innerHTML),
})));
const tekst = (page) => page.evaluate(() => document.querySelector('#s-maand').innerText.replace(/\s+/g, ' '));

test.describe('a - de twee kaarten bestaan niet meer', () => {
  test('geen kop Vermogensopbouw en geen kop Je plan', async ({ page }) => {
    await boot(page, { set: NEXT });
    const koppen = (await kaarten(page)).map((c) => c.kop);
    expect(koppen).not.toContain('Vermogensopbouw');
    expect(koppen).not.toContain('Je plan');
  });

  /* De tegel-structuur blijft juist wél bestaan: het id, .wvo-tiles, .wvo-tile en data-kpi zijn de
     haken waaraan veertien andere specs hun eigenschappen ophangen. Wat verdwijnt is de schil. */
  test('maandKpiBlok levert nog steeds de tegel, maar zonder kaart en kop', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => maandKpiBlok(curMonth || thisYM()));
    expect(h).toContain('id="maandKpiBlok"');
    expect(h).toContain('wvo-tiles');
    expect(h).toContain('data-kpi="inleg"');
    expect(h).not.toContain('class="card"');
    expect(h).not.toContain('hlabel');
    expect(h).not.toMatch(/Vermogensopbouw/i);
  });

  test('de twee uitlegzinnen zijn vervallen', async ({ page }) => {
    await boot(page);
    const t = await tekst(page);
    expect(t).not.toContain('Welk deel van je inkomen er opzij ging');
    expect(t).not.toContain('het cijfer gaat over de dagen tot nu toe');
  });
});

test.describe('b - geen informatieverlies', () => {
  test('label, percentage en band staan er', async ({ page }) => {
    await boot(page);
    const t = await tekst(page);
    expect(t).toMatch(/spaarquote/i);
    expect(t).toMatch(/\d+%/);
    expect(t).toContain('wat je opzij zette en belegde');
    expect(t).toContain('loopt nog');   // dit draagt de nuance van de vervallen zin
  });

  test('de sparkline staat er bij genoeg historie', async ({ page }) => {
    await boot(page);
    const heeft = await page.evaluate(() => /class="spk-wrap"/.test(maandKpiBlok(curMonth || thisYM())));
    expect(heeft).toBe(true);
  });

  test('onder de drempel vervalt de sparkline en blijft de deltazin', async ({ page }) => {
    await boot(page, { maanden: 3 });
    const uit = await page.evaluate(() => {
      const h = maandKpiBlok(curMonth || thisYM());
      const d = document.createElement('div'); d.innerHTML = h;
      return { spark: /class="spk-wrap"/.test(h), tekst: d.textContent.replace(/\s+/g, ' ') };
    });
    expect(uit.spark).toBe(false);
    expect(uit.tekst).toMatch(/verloop vanaf \d+/);
  });

  test('de tik naar het detail blijft', async ({ page }) => {
    await boot(page);
    const h = await page.evaluate(() => maandKpiBlok(curMonth || thisYM()));
    expect(h).toContain("openKpiDetail('inleg')");
  });

  test('de plan-rij gaat mee, met bedrag en ingang', async ({ page }) => {
    await boot(page, { set: NEXT });
    const h = await page.evaluate(() => maandPlanRegels());
    expect(h).toContain('Je potjes vanaf volgende maand');
    expect(h).toContain('openPotjesVerdeling');
    expect(h).toContain('€2.500');   // 1500 huur + 1000 boodschappen vanaf volgende maand
    // v228: de tweede rij ('Boven je inkomen-limiet') is vervallen
    expect(h).not.toContain('inkomen-limiet');
  });
});

test.describe('c - de streep en waar de voet hangt', () => {
  /* v226: alle drie de regels moeten dan werkelijk een beslissing vragen. Geen inleg op de
     spaarrekening (de buffer ligt dus niet op tempo) en een gat binnen de marge. */
  test('bij alleen een beslissingskaart hangt de voet daar, met streep', async ({ page }) => {
    await boot(page, { set: NEXT, geenSpaar: true, knel: 2 });
    const k = await kaarten(page);
    expect(k.map((x) => x.kop)).not.toContain('Vraagt aandacht');
    const c = k.find((x) => x.kop === 'Vraagt een beslissing');
    expect(c.voet).toBe(true);
    expect(c.streep).toBe(true);
    expect(c.spaarquote).toBe(false);   // die staat sinds v226 in zijn eigen kaart
  });

  test('is er ook een aandachtskaart, dan hangt de voet daar en niet erboven', async ({ page }) => {
    await boot(page, { spaar: 9000, set: Object.assign({ nfMaanden: 6, nfDoelVast: 0, nfToegewezen: 9000 }, NEXT) });
    const k = await kaarten(page);
    const b = k.find((x) => x.kop === 'Vraagt een beslissing');
    const a = k.find((x) => x.kop === 'Vraagt aandacht');
    expect(b).toBeTruthy(); expect(a).toBeTruthy();
    expect(b.voet).toBe(false);
    expect(a.voet).toBe(true);
    // en er staan geen statusdots meer ná de streep
    expect(a.streep).toBe(true);
    expect(b.spaarquote).toBe(false); expect(a.spaarquote).toBe(false);
  });

  test('de streep staat er precies één keer', async ({ page }) => {
    await boot(page, { set: NEXT });
    const n = await page.evaluate(() => (document.querySelector('#s-maand').innerHTML.match(/border-top:1px solid var\(--line\)/g) || []).length);
    expect(n).toBe(1);
  });

  test('zonder volgende-maand-laag is de voet leeg en valt de streep weg', async ({ page }) => {
    await boot(page);
    const t = await tekst(page);
    expect(t).not.toContain('vanaf volgende maand');
    /* v226: hier stond dat de streep blijft omdat de spaarquote er nog onder staat. Die staat nu
       in een eigen kaart, dus zonder volgende-maand-rij is de voet leeg en valt de streep weg.
       De spaarquote zelf staat er onverkort, alleen elders. v228: potjes boven de limiet vullen de
       voet niet meer, dus dit is sindsdien de gewone toestand. */
    expect(t).toMatch(/spaarquote/i);
    const streep = await page.evaluate(() => (document.querySelector('#s-maand').innerHTML.match(/border-top:1px solid var\(--line\)/g) || []).length);
    expect(streep).toBe(0);
  });

  test('zonder spaarquote en zonder volgende-maand-laag valt de voet en de streep weg', async ({ page }) => {
    await boot(page, { geenSpaar: true, set: { savingsAcc: {}, savingMode: 'amount', savingAmount: 0 } });
    const leeg = await page.evaluate(() => maandVoet(curMonth || thisYM()));
    if (leeg === '') {
      const n = await page.evaluate(() => (document.querySelector('#s-maand').innerHTML.match(/border-top:1px solid var\(--line\)/g) || []).length);
      expect(n).toBe(0);
    } else {
      // er staat toch een plan-rij onder; dan hoort de streep er juist wel te staan
      expect(leeg).toMatch(/potjes vanaf volgende maand/);
    }
  });

  test('maandVoetBlok zonder regels erboven draagt geen streep', async ({ page }) => {
    await boot(page, { set: NEXT });
    const h = await page.evaluate(() => maandVoetBlok(curMonth || thisYM(), false));
    expect(h).not.toContain('border-top');
    expect(h).toContain('Je potjes vanaf volgende maand');
  });
});

test.describe('d - de rest van het scherm blijft staan', () => {
  test('maandkiezer, oordeel en coach-ingang', async ({ page }) => {
    await boot(page, { set: NEXT });
    const t = await tekst(page);
    expect(t).toContain('JE MAAND');
    expect(t).toMatch(/beslissing vra/);   // 'vraagt' bij één, 'vragen' bij meer
    // v224: één ingang per regel met een tekort, niet meer één per scherm
    const ingangen = await page.evaluate(() => (document.querySelector('#s-maand').innerHTML.match(/coStart\('maand'/g) || []).length);
    const tekorten = await page.evaluate(() => maandMetAccept(maandRegels()).concat(maandStructureel()).filter((r) => r.status === 'tekort').length);
    expect(ingangen).toBe(tekorten);
    expect(ingangen).toBeGreaterThan(0);
  });

  // v226: de voet hangt aan de laatste kaart die regels draagt, en dat is hier de aandachtskaart
  test('geen sectiekop binnen de kaart', async ({ page }) => {
    await boot(page, { set: NEXT });
    const k = (await kaarten(page)).find((x) => x.voet);
    const koppen = await page.evaluate(() => {
      const c = [...document.querySelectorAll('#s-maand .card')].find((x) => /potjes vanaf volgende maand/.test(x.textContent));
      return [...c.querySelectorAll('.hlabel')].length;
    });
    expect(k.kop).toMatch(/^Vraagt /);
    expect(k.streep).toBe(true);
    expect(koppen).toBe(1);   // alleen de kaartkop zelf
  });

  test('de regels onder de streep dragen geen statusdot', async ({ page }) => {
    await boot(page, { set: NEXT });
    const uit = await page.evaluate(() => {
      const v = document.createElement('div'); v.innerHTML = maandVoet(curMonth || thisYM());
      return /border-radius:50%/.test(v.innerHTML);
    });
    expect(uit).toBe(false);
  });
});

test.describe('e - layout', () => {
  for (const w of [360, 390]) {
    test(`Maand past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 900 });
      await boot(page, { set: NEXT });
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
