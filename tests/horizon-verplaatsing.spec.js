// v178: de horizongroep uit de scherm-audit. Zeven elementen stonden op een scherm waarvan de
// horizon niet bij hun vraag past. Home is "waar sta ik nu", Inzichten "deze maand, operationeel",
// Maand "houdt mijn systeem stand, structureel", Vooruitblik "de horizon".
// De regel die deze spec bewaakt: een verplaatst element staat daarna op PRECIES EEN scherm, en een
// maandregel op Maand laat je niet van scherm wisselen.
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');
const { seed, open } = require('./budget-fixture');

async function boot(page, scherm, payload) {
  await open(page, payload || seed());
  if (scherm) {
    await page.evaluate((s) => go(s), scherm);
    await page.waitForTimeout(90);
  }
}
/* De gedeelde fixture kent geen opzegbaar abonnement: subscriptionsList() vraagt een automatische
   incasso in een opzegbare categorie. Eén Netflix-incasso per maand is genoeg. */
function metAbo() {
  const p = seed();
  const tx = JSON.parse(p.minder_tx);
  const nu = new Date();
  const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  for (const k of [2, 1, 0]) {
    const m = ym(new Date(nu.getFullYear(), nu.getMonth() - k, 1));
    tx.push({ id: 'nf-' + m, date: m + '-06', amount: -12, acc: 'NL01MAIN0000001111',
      name: 'Netflix', desc: 'SEPA INCASSO NETFLIX ABONNEMENT', typ: '', ref: '', src: 'csv',
      accName: 'Main', refNums: [] });
  }
  p.minder_tx = JSON.stringify(tx);
  return p;
}
const tekst = (page, s) => page.evaluate((x) => $('#s-' + x).innerText.replace(/\s+/g, ' '), s);
const beide = async (page) => ({ ins: await tekst(page, 'ins'), maand: await tekst(page, 'maand') });

test.describe('a · elk verplaatst element staat op precies één scherm', () => {
  test("'vanaf volgende maand' staat op Maand en niet meer op Inzichten", async ({ page }) => {
    await boot(page, 'maand');
    const t = await beide(page);
    expect(t.maand).toMatch(/Je potjes vanaf volgende maand/i);
    expect(t.ins).not.toMatch(/vanaf volgende maand/i);
    // en het is dezelfde sheet als voorheen: de volgende-maand-laag van openPotjesVerdeling
    expect(await page.evaluate(() => maandPlanRegels())).toContain("openPotjesVerdeling");
    expect(await page.evaluate(() => maandPlanRegels())).toContain("'next'");
  });

  test("'boven je inkomen-limiet' staat op Maand en niet meer op Inzichten", async ({ page }) => {
    await boot(page, 'maand');
    const t = await beide(page);
    expect(t.maand).toMatch(/Boven je inkomen-limiet/i);
    expect(t.ins).not.toMatch(/inkomen-limiet/i);
    // v53 blijft: het is een spiegel, geen plafond, dus geen aandachtskleur
    expect(await page.evaluate(() => maandPlanRegels())).not.toContain('--amber');
  });

  test('de meermaands-grafiek staat op Maand en niet meer op Inzichten', async ({ page }) => {
    await boot(page, 'maand');
    const t = await beide(page);
    expect(t.maand).toMatch(/uitgaven vs budget/i);
    expect(t.ins).not.toMatch(/uitgaven vs budget/i);
    expect(await page.evaluate(() => /spendVsBudgetChart/.test(renderIns.toString()))).toBe(false);
    expect(await page.evaluate(() => /spendVsBudgetChart/.test(renderMaand.toString()))).toBe(true);
  });

  test('de abonnementenkaart staat op Maand en niet meer op Inzichten', async ({ page }) => {
    await boot(page, 'maand', metAbo());
    const t = await beide(page);
    expect(t.maand).toMatch(/abonnementen/i);
    expect(t.ins).not.toMatch(/abonnementen/i);
    expect(await page.evaluate(() => /subsCard/.test(renderIns.toString()))).toBe(false);
  });

  test('de ingang uit het coachgesprek wijst naar de nieuwe plek', async ({ page }) => {
    await boot(page);
    const src = await page.evaluate(() => coTopicVast.toString());
    expect(src).toContain('Bekijk al mijn abonnementen');
    // de regel eromheen: dezelfde tik, ander scherm
    expect(/Bekijk al mijn abonnementen[\s\S]{0,120}go\('maand'\)/.test(src)).toBe(true);
    expect(/Bekijk al mijn abonnementen[\s\S]{0,120}go\('ins'\)/.test(src)).toBe(false);
  });
});

test.describe('b · de ingeklapte kop noemt wat eronder staat', () => {
  test('de samenvatting leest de twee kerncijfers die op Inzichten staan', async ({ page }) => {
    await boot(page, 'ins');
    const r = await page.evaluate((m) => ({
      sam: insKpiSamenvatting(m),
      tegels: [...document.querySelectorAll('#insKpiStrip .wvo-tile')].map((e) => e.dataset.kpi),
      labels: Object.fromEntries(Object.entries(insKpis(m)).map(([k, v]) => [k, v && v.label])),
    }), null);
    // v161: budgetnaleving en variabele-lastendruk staan hier, spaarquote en vaste-lastendruk op Maand
    expect(r.tegels).toEqual(['budget', 'vari']);
    for (const k of r.tegels) expect(r.sam.toLowerCase()).toContain(String(r.labels[k]).toLowerCase());
    // en dus niet de spaarquote, die staat op het maandscherm
    expect(r.sam.toLowerCase()).not.toContain(String(r.labels.inleg || 'spaarquote').toLowerCase());
  });
});

test.describe('c · een maandregel laat je niet van scherm wisselen', () => {
  /* v187: de aansluitingsregel is van Maand af, en openAansluiting() had geen andere aanroeper.
     Het bijsturen zit onveranderd in spaarVrijLine() op Plan. */
  test('de aansluitingsregel en zijn sheet bestaan niet meer op Maand', async ({ page }) => {
    await boot(page, 'maand');
    expect(await page.evaluate(() => (maandRegels() || []).some((x) => x.key === 'aansluiting'))).toBe(false);
    expect(await page.evaluate(() => typeof window.openAansluiting)).toBe('undefined');
    // en het feit zelf staat er nog, op zijn ene plek
    expect(await page.evaluate(() => typeof spaarVrijLine)).toBe('function');
  });

  /* v186: de patroonregel is vervallen, want hij toonde een melding die al in de meldingenlijst
     staat. Wat deze test bewaakt geldt onverkort voor de regels die overblijven: geen enkele
     maandregel stuurt je naar een ander scherm. */
  test('geen enkele maandregel stuurt je naar een ander scherm', async ({ page }) => {
    await boot(page, 'maand');
    const src = await page.evaluate(() => maandRegels.toString());
    const kaal = src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')
      .map((r) => r.replace(/(^|[^:\w])\/\/.*$/, '$1')).join(' ');
    expect(kaal).not.toContain("go('ins')");
    expect(kaal).not.toContain("go('vooruit')");
    const acts = await page.evaluate(() => (maandRegels() || []).map((r) => r.act || ''));
    for (const a of acts) expect(a).not.toContain('go(');
  });

  /* v187: openAansluiting() is met de aansluitingsregel meegegaan; hij had geen andere aanroeper.
     Het bijsturen zit onveranderd in spaarVrijLine() op Plan, met dezelfde bron en dezelfde route
     naar een toewijzing (v172). */
  test('spaarVrijLine leest spaarVrij en rekent zelf niets', async ({ page }) => {
    await boot(page, 'vooruit');
    const V = await page.evaluate(() => spaarVrij());
    const html = await page.evaluate(() => spaarVrijLine(allocatePlan()));
    if (V.vrij > 0) {
      expect(html).toContain(String(V.vrij).replace(/\B(?=(\d{3})+(?!\d))/g, '.'));
      expect(html).toMatch(/spaarVrijToe\(|openGoal\(/);
    }
    expect(await page.evaluate(() => /spaarVrij\(\)/.test(spaarVrijLine.toString()))).toBe(true);
  });

  test('kijken verandert niets aan je gegevens', async ({ page }) => {
    await boot(page, 'maand');
    const voor = await page.evaluate(() => JSON.stringify([TX.length, SET, OWN]));
    await page.evaluate(() => { maandRegels(); maandVerband(maandRegels()); });
    await page.waitForTimeout(80);
    expect(await page.evaluate(() => JSON.stringify([TX.length, SET, OWN]))).toBe(voor);
  });
});

test.describe('d · de horizon van het scherm blijft kloppen', () => {
  test('bij een afgesloten maand staat er niets over nu', async ({ page }) => {
    await boot(page, 'maand', metAbo());
    const ms = await page.evaluate(() => months());
    test.skip(ms.length < 2, 'deze fixture heeft geen afgesloten maand');
    await page.evaluate((m) => zetKijkMaand(m), ms[ms.length - 2]);
    await page.waitForTimeout(120);
    const t = await tekst(page, 'maand');
    // abonnementen gaan over wat er nu loopt, en je plan is een instelling van vandaag
    expect(t).not.toMatch(/abonnementen/i);
    expect(t).not.toMatch(/vanaf volgende maand/i);
    expect(t).not.toMatch(/inkomen-limiet/i);
  });

  // v187: de Gedrag-kaart is opgegaan in de Valt-op-kaart, dus Verdieping houdt er één over
  test('de verdieping op Inzichten houdt precies één kaart over', async ({ page }) => {
    await boot(page, 'ins');
    const src = await page.evaluate(() => renderIns.toString());
    const n = (src.match(/insVouw\(/g) || []).length;
    expect(n).toBe(1);                                   // alleen Kerncijfers
    const t = await tekst(page, 'ins');
    expect(t).toMatch(/kerncijfers/i);
    expect(t).not.toMatch(/gedrag/i);
    expect(t).toMatch(/verdieping/i);
  });
});
