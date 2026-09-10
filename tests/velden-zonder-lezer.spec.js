// v214: a.eenmalig, a.horizon en a.infl stonden in de bezitting-editor, werden door saveAsset()
// weggeschreven en hadden geen enkele lezer. Ze zijn weg in plaats van alsnog gelezen: de reis
// beantwoordt hun vraag al (de horizon loopt tot je pensioenjaar, de eenmalige inleg staat als
// R.een in de reis zelf) en voor inflatie is er één globale aanname. Alsnog lezen zou drie
// modelbeslissingen vragen voor iets waar niemand om heeft gevraagd.
// Deze spec bewaakt drie dingen: de velden staan niet meer in de editor, saveAsset() schrijft ze
// niet meer, en een bestaande waarde in SET raakt de projectie niet (er is bewust geen migratie,
// dus zo'n waarde kan er nog staan tot je die bezitting bewerkt).
// De service worker staat globaal uit via playwright.config.js.
const { test, expect } = require('@playwright/test');

const now = new Date();
const ym = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const CUR = ym(now);
const M1 = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
const M2 = ym(new Date(now.getFullYear(), now.getMonth() - 2, 1));
const MAIN = 'NL01MAIN0000001111';
const SPAAR = 'NL01SAVE0000004323';

// Een bezitting zoals hij in bestaande opslag kan staan: mét de drie velden die niets deden.
const OUD = [
  { id: 'a1', naam: 'Peaks pensioen', waarde: 3219, grow: true, rend: 6, per: 250, eenmalig: 5000, horizon: 20, infl: 2 },
  { id: 'a2', naam: 'Holding', waarde: 45000, grow: true, eenmalig: 1000, horizon: 8, infl: 3 },
];

function seed(assets) {
  const tx = [];
  const add = (id, acc, m, day, amount, naam, desc) =>
    tx.push({ id, date: m + '-' + day, amount, acc, name: naam, desc, typ: '', ref: '', src: 'csv', accName: '', refNums: [] });
  for (const m of [M2, M1, CUR]) {
    add('i' + m, MAIN, m, '25', 4000, 'Werkgever', 'SALARIS LOON');
    add('h' + m, MAIN, m, '02', -1200, 'Woningcorporatie', 'SEPA INCASSO HUURBETALING');
    add('a' + m, MAIN, m, '05', -500, 'Albert Heijn', 'BEA, BETAALPAS ALBERT HEIJN');
    add('s' + m, SPAAR, m, '26', 500, 'Spaarpot', 'NAAR SPAREN');
  }
  const set = {
    limit: 70, hideInternal: true, mode: 'begeleid', autoIncome: false, income: 4000,
    manualBal: { [MAIN]: 3000, [SPAAR]: 20000 },
    budgets: { boodschappen: 500, huur: 1200 },
    savingMode: 'amount', savingAmount: 500, savingsAcc: { [SPAAR]: true },
    nfDoelVast: 8000, nfToegewezen: 8000, nfToegewezenMigrated: true,
    assets, reis: {},
  };
  return {
    minder_tx: JSON.stringify(tx), minder_ovr: '{}', minder_set: JSON.stringify(set),
    minder_own: JSON.stringify([MAIN, SPAAR]), minder_accmeta: '{}', minder_plan: '{}',
  };
}
async function boot(page, assets) {
  await page.addInitScript((d) => { for (const k in d) localStorage.setItem(k, d[k]); }, seed(assets));
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof TX !== 'undefined' && typeof reisModel === 'function');
}
const assets = (page) => page.evaluate(() => SET.assets);
const reeks = (page) => page.evaluate(() => reisModel().mid.map((v) => Math.round(v)));

test.describe('a - de velden staan niet meer in de editor', () => {
  test('geen invoerveld voor inflatie, horizon of eenmalige inleg', async ({ page }) => {
    await boot(page, OUD);
    await page.evaluate(() => openAsset('a1'));
    for (const id of ['aInfl', 'aHor', 'aEen']) {
      expect(await page.locator('#' + id).count()).toBe(0);
    }
  });

  test('de twee velden die de projectie wel sturen staan er nog', async ({ page }) => {
    await boot(page, OUD);
    await page.evaluate(() => openAsset('a1'));
    expect(await page.locator('#aRend').inputValue()).toBe('6');
    expect(await page.locator('#aPer').inputValue()).toBe('250');
  });

  test('de tekst wijst naar waar inflatie en horizon wel staan', async ({ page }) => {
    await boot(page, OUD);
    await page.evaluate(() => openAsset('a1'));
    const t = await page.locator('#sheet').innerText();
    expect(t).toContain('Rendement & inflatie');
    // geen belofte meer over een koopkracht-weergave die aan dit veld hing
    expect(t).not.toContain('Met inflatie tonen we');
  });
});

test.describe('b - saveAsset schrijft ze niet meer', () => {
  test('bewerken laat de drie velden vallen, en houdt de rest', async ({ page }) => {
    await boot(page, OUD);
    await page.evaluate(() => { openAsset('a1'); saveAsset('a1'); });
    const a = (await assets(page)).find((x) => x.id === 'a1');
    expect(a.eenmalig).toBeUndefined();
    expect(a.horizon).toBeUndefined();
    expect(a.infl).toBeUndefined();
    expect(a.rend).toBe(6);
    expect(a.per).toBe(250);
    expect(a.waarde).toBe(3219);
    expect(a.grow).toBe(true);
  });

  test('een nieuwe bezitting krijgt ze niet', async ({ page }) => {
    await boot(page, OUD);
    await page.evaluate(() => {
      openAsset('');
      document.getElementById('aNaam').value = 'Nieuwe pot';
      document.getElementById('aWaarde').value = '1000';
      document.getElementById('aGrow').checked = true;
      saveAsset('');
    });
    const a = (await assets(page)).find((x) => x.naam === 'Nieuwe pot');
    expect(Object.keys(a).sort()).toEqual(['grow', 'id', 'naam', 'per', 'rend', 'waarde']);
  });

  test('er is geen migratie: een bezitting die je niet bewerkt houdt zijn oude velden', async ({ page }) => {
    await boot(page, OUD);
    const a = (await assets(page)).find((x) => x.id === 'a2');
    expect(a.horizon).toBe(8);
  });
});

test.describe('c - een oude waarde raakt de projectie niet', () => {
  test('de vermogensreeks is gelijk met en zonder die velden', async ({ page }) => {
    await boot(page, OUD);
    const met = await reeks(page);
    await page.evaluate(() => {
      SET.assets = SET.assets.map((a) => { const b = Object.assign({}, a); delete b.eenmalig; delete b.horizon; delete b.infl; return b; });
      save();
    });
    expect(await reeks(page)).toEqual(met);
  });

  test('en een extreme waarde verandert er evenmin iets aan', async ({ page }) => {
    await boot(page, OUD);
    const voor = await reeks(page);
    await page.evaluate(() => {
      SET.assets = SET.assets.map((a) => Object.assign({}, a, { eenmalig: 500000, horizon: 1, infl: 25 }));
      save();
    });
    expect(await reeks(page)).toEqual(voor);
  });
});

test.describe('d - layout', () => {
  for (const w of [360, 390]) {
    test(`de editor past op ${w}px`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: 800 });
      await boot(page, OUD);
      await page.evaluate(() => openAsset('a1'));
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over).toBeLessThanOrEqual(1);
    });
  }
});
